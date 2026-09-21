<?php
declare(strict_types=1);

final class GtrotsShippingNoteService
{
    private const DEFAULT_SERIES = 'AVZ';

    public static function orderJoinSql(string $orderAlias = 'o'): string
    {
        return " LEFT JOIN shop_shipping_notes shipping_note_join ON shipping_note_join.order_id = {$orderAlias}.id ";
    }

    public static function orderJoinColumns(): string
    {
        return ', shipping_note_join.id AS shipping_note_join_id,
                  shipping_note_join.series AS shipping_note_join_series,
                  shipping_note_join.shipping_note_number AS shipping_note_join_number,
                  shipping_note_join.issue_date AS shipping_note_join_date,
                  shipping_note_join.with_stamp AS shipping_note_join_stamp,
                  shipping_note_join.total AS shipping_note_join_total,
                  shipping_note_join.currency AS shipping_note_join_currency,
                  shipping_note_join.email_sent_at AS shipping_note_join_email_sent_at,
                  shipping_note_join.issued_at AS shipping_note_join_at';
    }

    public static function prepare(PDO $db, string $orderId, array $config): array
    {
        $order = self::order($db, $orderId);
        $existing = self::findByOrder($db, $orderId, false);
        if ($existing) return ['existing' => self::detail($db, $existing), 'draft' => null];
        $company = self::company($db);
        $payload = self::buildPayload($db, $order, $company, '', self::DEFAULT_SERIES, self::previewNumber($db, self::DEFAULT_SERIES), date('Y-m-d'), []);
        return [
            'existing' => null,
            'draft' => $payload,
        ];
    }

    public static function issue(PDO $db, string $orderId, array $input, array $actor, array $config): array
    {
        $orderId = trim($orderId);
        if ($orderId === '') throw new InvalidArgumentException('Comanda nu a fost selectată.');
        $db->beginTransaction();
        try {
            $order = self::order($db, $orderId, true);
            $existing = self::findByOrder($db, $orderId, true);
            if ($existing) {
                $db->commit();
                $result = self::detail($db, $existing);
                $result['existing'] = true;
                return $result;
            }
            $company = self::company($db);
            if (trim((string)($company['legal_name'] ?? '')) === '') {
                throw new InvalidArgumentException('Completează datele firmei înainte de emiterea avizului.');
            }
            $id = self::uuid();
            $series = self::DEFAULT_SERIES;
            $number = self::nextNumber($db, $series);
            $issueDate = date('Y-m-d');
            $payload = self::buildPayload($db, $order, $company, $id, $series, $number, $issueDate, $input);
            $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $actorName = mb_substr(trim((string)($actor['display_name'] ?? $actor['username'] ?? 'Administrator')), 0, 180);
            $insert = $db->prepare('INSERT INTO shop_shipping_notes (id, order_id, series, shipping_note_number, issue_date, with_stamp, currency, total, buyer_name, payload_json, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $insert->execute([$id, $orderId, $series, $number, $issueDate, !empty($payload['with_stamp']) ? 1 : 0, (string)$payload['currency'], (float)$payload['total'], (string)$payload['buyer']['name'], $encoded, $actorName]);
            $db->commit();
            $saved = self::find($db, $id);
            if (!$saved) throw new RuntimeException('Avizul a fost emis, dar nu a putut fi recitit.');
            $result = self::detail($db, $saved);
            $result['existing'] = false;
            if (self::storageEnabled($config)) {
                try { self::storedPdf($saved, $config); } catch (Throwable $error) { error_log('[G-Trots shipping note storage] ' . $error->getMessage()); }
            }
            return $result;
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    public static function get(PDO $db, string $id, array $config = []): array
    {
        $note = self::find($db, trim($id));
        if (!$note) throw new InvalidArgumentException('Avizul nu există.');
        $result = self::detail($db, $note);
        if (self::storageEnabled($config)) {
            $settings = self::storageSettings($note, $config);
            if (is_file((string)$settings['path'])) $result['pdf_url'] = (string)$settings['url'];
        }
        return $result;
    }

    public static function download(PDO $db, string $id, array $config): array
    {
        $note = self::find($db, trim($id));
        if (!$note) throw new InvalidArgumentException('Avizul nu există.');
        if (self::storageEnabled($config)) {
            $stored = self::storedPdf($note, $config);
            $pdf = file_get_contents((string)$stored['path']);
            if (!is_string($pdf)) throw new RuntimeException('PDF-ul avizului nu a putut fi citit.');
            return ['file_name' => (string)$stored['file_name'], 'mime_type' => 'application/pdf', 'content_base64' => base64_encode($pdf), 'public_url' => (string)$stored['url'], 'stored' => true];
        }
        require_once __DIR__ . '/shipping-note-pdf.php';
        $payload = self::payload($note);
        $pdf = GtrotsShippingNotePdf::render($payload);
        return ['file_name' => self::friendlyName($note), 'mime_type' => 'application/pdf', 'content_base64' => base64_encode($pdf)];
    }

    public static function publicLink(PDO $db, string $id, array $config): array
    {
        $note = self::find($db, trim($id));
        if (!$note) throw new InvalidArgumentException('Avizul nu există.');
        if (!self::storageEnabled($config)) throw new RuntimeException('Stocarea publică a avizelor nu este configurată.');
        $stored = self::storedPdf($note, $config);
        return ['url' => (string)$stored['url'], 'file_name' => (string)$stored['file_name'], 'mime_type' => 'application/pdf'];
    }

    public static function sendEmail(PDO $db, string $id, array $config): array
    {
        $note = self::find($db, trim($id));
        if (!$note) throw new InvalidArgumentException('Avizul nu există.');
        $recipient = mb_strtolower(trim((string)($note['customer_email'] ?? '')));
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            $result = ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
            self::recordEmail($db, $id, $result);
            return $result;
        }
        try {
            $attachment = self::download($db, $id, $config);
            $display = htmlspecialchars(trim((string)$note['series'] . ' ' . (string)$note['shipping_note_number']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $buyer = htmlspecialchars((string)($note['customer_name'] ?? $note['buyer_name'] ?? 'client'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $order = htmlspecialchars((string)($note['order_number'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $html = gtEmailLightDocument('<!doctype html><html lang="ro"><body style="margin:0;background:#1d1b20;color:#fff8f3;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:34px"><div style="height:6px;background:#f27a1a;border-radius:8px"></div><h1 style="margin:28px 0 8px">Aviz ' . $display . '</h1><p style="color:#c5bdc5;line-height:1.65">Bună, ' . $buyer . '. Găsești atașat avizul de însoțire a mărfii pentru comanda <strong style="color:#ffb36b">' . $order . '</strong>.</p></div></body></html>');
            gtSmtpSend($config, $recipient, 'Aviz ' . trim((string)$note['series'] . ' ' . (string)$note['shipping_note_number']) . ' – G-Trots România', $html, [[
                'file_name' => (string)$attachment['file_name'],
                'mime_type' => 'application/pdf',
                'content' => base64_decode((string)$attachment['content_base64'], true) ?: '',
            ]]);
            $result = ['sent' => true, 'recipient' => $recipient];
            self::recordEmail($db, $id, $result);
            return $result;
        } catch (Throwable $error) {
            error_log('[G-Trots shipping note email] ' . $error->getMessage());
            $result = ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
            self::recordEmail($db, $id, $result);
            return $result;
        }
    }

    public static function reviseForOrder(PDO $db, string $orderId): ?array
    {
        $note = self::findByOrder($db, trim($orderId), true);
        if (!$note) return null;
        $order = self::order($db, $orderId, false);
        $company = self::company($db);
        $oldPayload = self::payload($note);
        $expedition = (array)($oldPayload['expedition'] ?? []);
        $input = [
            'delegate_name' => (string)($expedition['delegate_name'] ?? '-'),
            'identity_document' => (string)($expedition['identity_document'] ?? '-'),
            'transport_vehicle' => (string)($expedition['transport_vehicle'] ?? '-'),
            'delivery_time' => (string)($expedition['delivery_time'] ?? '-'),
            'loading_place' => (string)($expedition['loading_place'] ?? '-'),
            'sender_name' => (string)($oldPayload['sender_name'] ?? 'G-Trots Romania'),
            'with_stamp' => !empty($oldPayload['with_stamp']),
        ];
        $payload = self::buildPayload($db, $order, $company, (string)$note['id'], (string)$note['series'], (string)$note['shipping_note_number'], (string)$note['issue_date'], $input);
        $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $db->prepare('UPDATE shop_shipping_notes SET currency = ?, total = ?, buyer_name = ?, payload_json = ?, email_sent_at = NULL, email_last_error = NULL WHERE id = ?')
            ->execute([(string)$payload['currency'], (float)$payload['total'], (string)$payload['buyer']['name'], $encoded, (string)$note['id']]);
        return self::find($db, (string)$note['id']);
    }

    public static function refreshStoredForOrder(PDO $db, string $orderId, array $config): void
    {
        if (!self::storageEnabled($config)) return;
        $note = self::findByOrder($db, trim($orderId), false);
        if (!$note) return;
        try { self::storedPdf($note, $config, true); }
        catch (Throwable $error) { error_log('[G-Trots shipping note refresh] ' . $error->getMessage()); }
    }

    public static function delete(PDO $db, string $id, array $config): array
    {
        $id = trim($id);
        if ($id === '') throw new InvalidArgumentException('Avizul nu a fost selectat.');
        $db->beginTransaction();
        try {
            $note = self::findForUpdate($db, $id);
            if (!$note) throw new InvalidArgumentException('Avizul nu există.');
            if (!self::canDelete($db, $note, true)) throw new InvalidArgumentException('Poți șterge numai ultimul aviz emis.');
            $db->prepare('DELETE FROM shop_shipping_notes WHERE id = ?')->execute([$id]);
            self::resetSequence($db, (string)$note['series']);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        self::removeStoredPdf($note, $config);
        return ['deleted' => true, 'id' => $id, 'order_id' => (string)$note['order_id'], 'released_number' => trim((string)$note['series'] . ' ' . (string)$note['shipping_note_number'])];
    }

    public static function orderSummary(PDO $db, array $row): ?array
    {
        $id = trim((string)($row['shipping_note_join_id'] ?? ''));
        if ($id === '') return null;
        $note = [
            'id' => $id,
            'order_id' => (string)($row['id'] ?? $row['order_id'] ?? ''),
            'series' => (string)($row['shipping_note_join_series'] ?? ''),
            'shipping_note_number' => (string)($row['shipping_note_join_number'] ?? ''),
            'issued_at' => (string)($row['shipping_note_join_at'] ?? ''),
        ];
        return [
            'id' => $id,
            'order_id' => $note['order_id'],
            'series' => $note['series'],
            'number' => $note['shipping_note_number'],
            'display_number' => trim($note['series'] . ' ' . $note['shipping_note_number']),
            'issue_date' => (string)($row['shipping_note_join_date'] ?? ''),
            'with_stamp' => !empty($row['shipping_note_join_stamp']),
            'total' => round((float)($row['shipping_note_join_total'] ?? 0), 2),
            'currency' => (string)($row['shipping_note_join_currency'] ?? $row['currency'] ?? 'RON'),
            'issued_at' => $note['issued_at'],
            'email_sent_at' => ($row['shipping_note_join_email_sent_at'] ?? null) !== null ? (string)$row['shipping_note_join_email_sent_at'] : null,
            'can_delete' => self::canDelete($db, $note),
        ];
    }

    private static function detail(PDO $db, array $note): array
    {
        $result = [
            'id' => (string)$note['id'], 'order_id' => (string)$note['order_id'], 'order_number' => (string)($note['order_number'] ?? ''),
            'series' => (string)$note['series'], 'number' => (string)$note['shipping_note_number'],
            'display_number' => trim((string)$note['series'] . ' ' . (string)$note['shipping_note_number']),
            'issue_date' => (string)$note['issue_date'], 'with_stamp' => !empty($note['with_stamp']), 'currency' => (string)$note['currency'],
            'total' => round((float)$note['total'], 2), 'buyer_name' => (string)$note['buyer_name'],
            'customer_email' => (string)($note['customer_email'] ?? ''), 'issued_by' => (string)($note['issued_by'] ?? ''),
            'issued_at' => (string)$note['issued_at'], 'updated_at' => (string)$note['updated_at'],
            'email_sent_at' => ($note['email_sent_at'] ?? null) !== null ? (string)$note['email_sent_at'] : null,
            'email_last_error' => ($note['email_last_error'] ?? null) !== null ? (string)$note['email_last_error'] : null,
            'can_delete' => self::canDelete($db, $note), 'payload' => self::payload($note),
        ];
        return $result;
    }

    private static function buildPayload(PDO $db, array $order, array $company, string $id, string $series, string $number, string $date, array $input): array
    {
        $stmt = $db->prepare('SELECT oi.*, p.unit_of_measure, (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = oi.product_id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image_path FROM shop_order_items oi LEFT JOIN shop_products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id ASC');
        $stmt->execute([(string)$order['id']]);
        $items = [];
        $total = 0.0;
        foreach ($stmt->fetchAll() as $item) {
            $quantity = max(0, (float)($item['quantity'] ?? 0));
            $lineTotal = round((float)($item['discounted_line_total'] ?? $item['line_total'] ?? 0), 2);
            $unitPrice = $quantity > 0 ? round($lineTotal / $quantity, 8) : 0.0;
            $items[] = ['order_item_id' => (string)$item['id'], 'product_id' => $item['product_id'] ? (string)$item['product_id'] : null, 'name' => (string)$item['product_name'], 'sku' => (string)($item['product_sku'] ?? ''), 'image_path' => (string)($item['image_path'] ?? ''), 'unit' => trim((string)($item['unit_of_measure'] ?? '')) ?: 'buc', 'quantity' => $quantity, 'unit_price' => $unitPrice, 'line_total' => $lineTotal];
            $total += $lineTotal;
        }
        if (!$items) throw new InvalidArgumentException('Comanda nu conține produse pentru aviz.');
        $isCompany = (string)($order['customer_type'] ?? '') === 'company';
        $buyerName = $isCompany && trim((string)($order['company_name'] ?? '')) !== '' ? (string)$order['company_name'] : (string)$order['customer_name'];
        $seller = ['name' => (string)$company['legal_name'], 'trade_name' => (string)($company['trade_name'] ?? ''), 'cui' => (string)($company['cui'] ?? ''), 'registration_number' => (string)($company['registration_number'] ?? ''), 'address' => (string)($company['address'] ?? ''), 'city' => (string)($company['city'] ?? ''), 'county' => (string)($company['county'] ?? ''), 'phone' => (string)($company['phone'] ?? ''), 'email' => (string)($company['email'] ?? '')];
        $buyer = ['name' => $buyerName, 'phone' => (string)($order['customer_phone'] ?? ''), 'address' => (string)($order['address'] ?? ''), 'city' => (string)($order['city'] ?? ''), 'county' => (string)($order['county'] ?? ''), 'postal_code' => (string)($order['postal_code'] ?? '')];
        $editable = static fn(string $key, string $default = '-'): string => mb_substr(trim((string)($input[$key] ?? $default)) ?: $default, 0, 500);
        return ['document_id' => $id, 'series' => $series, 'number' => $number, 'issue_date' => $date, 'currency' => strtoupper((string)($order['currency'] ?? 'RON')) ?: 'RON', 'total' => round($total, 2), 'order_reference' => (string)$order['order_number'], 'seller' => $seller, 'buyer' => $buyer, 'items' => $items, 'expedition' => ['delegate_name' => $editable('delegate_name'), 'identity_document' => $editable('identity_document'), 'transport_vehicle' => $editable('transport_vehicle'), 'delivery_time' => $editable('delivery_time'), 'loading_place' => $editable('loading_place')], 'sender_name' => $editable('sender_name', 'G-Trots Romania'), 'with_stamp' => !empty($input['with_stamp'])];
    }

    private static function order(PDO $db, string $id, bool $lock = false): array
    {
        $suffix = $lock && strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) !== 'sqlite' ? ' FOR UPDATE' : '';
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? LIMIT 1' . $suffix);
        $stmt->execute([trim($id)]);
        $row = $stmt->fetch();
        if (!$row) throw new InvalidArgumentException('Comanda nu există.');
        return $row;
    }

    private static function company(PDO $db): array
    {
        return $db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch() ?: [];
    }

    private static function find(PDO $db, string $id): ?array
    {
        $stmt = $db->prepare('SELECT n.*, o.order_number, o.customer_name, o.customer_email, o.customer_phone FROM shop_shipping_notes n INNER JOIN shop_orders o ON o.id = n.order_id WHERE n.id = ? LIMIT 1');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    private static function findForUpdate(PDO $db, string $id): ?array
    {
        $suffix = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite' ? '' : ' FOR UPDATE';
        $stmt = $db->prepare('SELECT * FROM shop_shipping_notes WHERE id = ? LIMIT 1' . $suffix);
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    private static function findByOrder(PDO $db, string $orderId, bool $lock): ?array
    {
        $suffix = $lock && strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) !== 'sqlite' ? ' FOR UPDATE' : '';
        $stmt = $db->prepare('SELECT n.*, o.order_number, o.customer_name, o.customer_email, o.customer_phone FROM shop_shipping_notes n INNER JOIN shop_orders o ON o.id = n.order_id WHERE n.order_id = ? LIMIT 1' . $suffix);
        $stmt->execute([$orderId]);
        return $stmt->fetch() ?: null;
    }

    private static function payload(array $note): array
    {
        $payload = json_decode((string)($note['payload_json'] ?? ''), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($payload)) throw new RuntimeException('Datele avizului nu mai sunt disponibile.');
        return $payload;
    }

    private static function canDelete(PDO $db, array $note, bool $lock = false): bool
    {
        $id = (string)($note['id'] ?? '');
        $series = (string)($note['series'] ?? '');
        $number = (int)($note['shipping_note_number'] ?? 0);
        if ($id === '' || $series === '' || $number <= 0) return false;
        $driver = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME));
        $cast = $driver === 'sqlite' ? 'INTEGER' : 'UNSIGNED';
        $suffix = $lock && $driver !== 'sqlite' ? ' FOR UPDATE' : '';
        $latest = $db->query("SELECT id FROM shop_shipping_notes ORDER BY issued_at DESC, CAST(shipping_note_number AS {$cast}) DESC, id DESC LIMIT 1{$suffix}")->fetchColumn();
        if ((string)$latest !== $id) return false;
        $stmt = $db->prepare("SELECT MAX(CAST(shipping_note_number AS {$cast})) FROM shop_shipping_notes WHERE series = ?");
        $stmt->execute([$series]);
        return (int)$stmt->fetchColumn() === $number;
    }

    private static function previewNumber(PDO $db, string $series): string
    {
        $driver = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME));
        $cast = $driver === 'sqlite' ? 'INTEGER' : 'UNSIGNED';
        $stmt = $db->prepare("SELECT MAX(CAST(shipping_note_number AS {$cast})) FROM shop_shipping_notes WHERE series = ?");
        $stmt->execute([$series]);
        return str_pad((string)((int)$stmt->fetchColumn() + 1), 3, '0', STR_PAD_LEFT);
    }

    private static function nextNumber(PDO $db, string $series): string
    {
        $driver = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME));
        $insert = $driver === 'sqlite' ? 'INSERT OR IGNORE INTO shop_shipping_note_sequences (series, last_number) VALUES (?, 0)' : 'INSERT IGNORE INTO shop_shipping_note_sequences (series, last_number) VALUES (?, 0)';
        $db->prepare($insert)->execute([$series]);
        $suffix = $driver === 'sqlite' ? '' : ' FOR UPDATE';
        $sequence = $db->prepare('SELECT last_number FROM shop_shipping_note_sequences WHERE series = ?' . $suffix);
        $sequence->execute([$series]);
        $last = (int)$sequence->fetchColumn();
        $cast = $driver === 'sqlite' ? 'INTEGER' : 'UNSIGNED';
        $maximum = $db->prepare("SELECT MAX(CAST(shipping_note_number AS {$cast})) FROM shop_shipping_notes WHERE series = ?");
        $maximum->execute([$series]);
        $next = max($last, (int)$maximum->fetchColumn()) + 1;
        $db->prepare('UPDATE shop_shipping_note_sequences SET last_number = ? WHERE series = ?')->execute([$next, $series]);
        return str_pad((string)$next, 3, '0', STR_PAD_LEFT);
    }

    private static function resetSequence(PDO $db, string $series): void
    {
        $driver = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME));
        $cast = $driver === 'sqlite' ? 'INTEGER' : 'UNSIGNED';
        $stmt = $db->prepare("SELECT MAX(CAST(shipping_note_number AS {$cast})) FROM shop_shipping_notes WHERE series = ?");
        $stmt->execute([$series]);
        $last = (int)$stmt->fetchColumn();
        $sql = $driver === 'sqlite' ? 'INSERT INTO shop_shipping_note_sequences (series, last_number) VALUES (?, ?) ON CONFLICT(series) DO UPDATE SET last_number = excluded.last_number, updated_at = CURRENT_TIMESTAMP' : 'INSERT INTO shop_shipping_note_sequences (series, last_number) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_number = VALUES(last_number), updated_at = CURRENT_TIMESTAMP';
        $db->prepare($sql)->execute([$series, $last]);
    }

    private static function recordEmail(PDO $db, string $id, array $result): void
    {
        $sent = !empty($result['sent']);
        $db->prepare('UPDATE shop_shipping_notes SET email_sent_at = ?, email_last_error = ? WHERE id = ?')->execute([$sent ? date('Y-m-d H:i:s') : null, $sent ? null : mb_substr((string)($result['error'] ?? 'Trimiterea a eșuat.'), 0, 500), $id]);
    }

    private static function storageEnabled(array $config): bool
    {
        return trim((string)($config['shipping_note_storage_dir'] ?? $config['invoice_storage_dir'] ?? '')) !== '' || trim((string)($config['website_base_url'] ?? '')) !== '';
    }

    private static function storageSettings(array $note, array $config): array
    {
        $directory = trim((string)($config['shipping_note_storage_dir'] ?? ''));
        if ($directory === '') $directory = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'avize';
        $publicBase = rtrim(trim((string)($config['shipping_note_public_base_url'] ?? '')), '/');
        if ($publicBase === '') $publicBase = rtrim((string)($config['website_base_url'] ?? ''), '/') . '/avize';
        if ($publicBase === '/avize') throw new RuntimeException('Adresa publică pentru avize nu este configurată.');
        $series = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)$note['series']) ?: 'AVZ';
        $number = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)$note['shipping_note_number']) ?: 'aviz';
        $token = substr(hash('sha256', (string)$note['id'] . '|' . (string)($config['api_key'] ?? '') . '|gtrots-shipping-note-v1'), 0, 32);
        $storedName = strtolower('aviz-' . $series . '-' . $number . '-' . $token . '.pdf');
        return ['directory' => $directory, 'path' => $directory . DIRECTORY_SEPARATOR . $storedName, 'url' => $publicBase . '/' . rawurlencode($storedName), 'file_name' => self::friendlyName($note)];
    }

    private static function storedPdf(array $note, array $config, bool $force = false): array
    {
        $settings = self::storageSettings($note, $config);
        if (!is_dir((string)$settings['directory']) && !mkdir((string)$settings['directory'], 0775, true) && !is_dir((string)$settings['directory'])) throw new RuntimeException('Directorul avizelor nu a putut fi creat.');
        if ($force || !is_file((string)$settings['path']) || (int)@filesize((string)$settings['path']) <= 0) {
            require_once __DIR__ . '/shipping-note-pdf.php';
            $bytes = GtrotsShippingNotePdf::render(self::payload($note));
            if (file_put_contents((string)$settings['path'], $bytes, LOCK_EX) === false) throw new RuntimeException('PDF-ul avizului nu a putut fi salvat.');
        }
        return $settings;
    }

    private static function removeStoredPdf(array $note, array $config): void
    {
        if (!self::storageEnabled($config)) return;
        try { $settings = self::storageSettings($note, $config); if (is_file((string)$settings['path'])) @unlink((string)$settings['path']); } catch (Throwable $error) { error_log('[G-Trots shipping note delete] ' . $error->getMessage()); }
    }

    private static function friendlyName(array $note): string
    {
        $series = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)$note['series']) ?: 'AVZ';
        $number = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)$note['shipping_note_number']) ?: 'aviz';
        return 'Aviz-' . $series . '-' . $number . '.pdf';
    }

    private static function uuid(): string
    {
        $data = random_bytes(16); $data[6] = chr((ord($data[6]) & 0x0f) | 0x40); $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
