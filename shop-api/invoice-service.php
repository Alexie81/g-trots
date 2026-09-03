<?php
declare(strict_types=1);

require_once __DIR__ . '/invoice-theme.php';

/**
 * Invoice issuing domain service.
 *
 * Only the business snapshot is persisted. PDF and XLSX bytes are regenerated
 * on demand, while the color theme remains pinned forever by the existing
 * theme store.
 */
final class GtrotsInvoiceService
{
    public static function issue(PDO $db, string $orderId, array $actor, array $config): array
    {
        $orderId = trim($orderId);
        if ($orderId === '') throw new InvalidArgumentException('Comanda nu a fost selectată.');

        $db->beginTransaction();
        try {
            $existing = self::findByOrder($db, $orderId, true);
            if ($existing) {
                $db->commit();
                return self::row($existing, true);
            }

            $driver = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME));
            $lockSuffix = $driver === 'sqlite' ? '' : ' FOR UPDATE';
            $orderStmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ?' . $lockSuffix);
            $orderStmt->execute([$orderId]);
            $order = $orderStmt->fetch();
            if (!$order) throw new InvalidArgumentException('Comanda nu există.');
            if (in_array((string)($order['status'] ?? ''), ['cancelled', 'refunded'], true)) {
                throw new InvalidArgumentException('Nu poți emite o factură normală pentru o comandă anulată sau rambursată.');
            }

            $company = $db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch() ?: [];
            if (trim((string)($company['legal_name'] ?? '')) === '' || trim((string)($company['cui'] ?? '')) === '') {
                throw new InvalidArgumentException('Completează denumirea juridică și CUI-ul în Datele firmei înainte de emitere.');
            }

            $invoiceId = self::uuid();
            $series = 'GT';
            $number = self::nextNumber($db, $series);
            $issueDate = date('Y-m-d');
            $status = self::statusForOrder($order);
            $dueDate = $status === 'paid' ? $issueDate : date('Y-m-d', strtotime($issueDate . ' +7 days'));
            self::postStock($db, $order, $invoiceId, $series, $number, $actor);
            $payload = self::payload($db, $order, $company, $invoiceId, $series, $number, $issueDate, $dueDate, $status);
            $assignedBy = mb_substr(trim((string)($actor['display_name'] ?? $actor['username'] ?? 'Administrator')), 0, 180);
            $assignment = GtrotsInvoiceThemeStore::pin($db, $payload, $assignedBy);
            $payload['theme'] = $assignment['theme'];

            $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $insert = $db->prepare(
                'INSERT INTO shop_invoices
                 (id, order_id, series, invoice_number, document_status, theme, issue_date, due_date, currency, total, buyer_name, buyer_cui, payload_json, issued_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $insert->execute([
                $invoiceId,
                $orderId,
                $series,
                $number,
                $status,
                (string)$assignment['theme'],
                $issueDate,
                $dueDate,
                strtoupper(trim((string)($order['currency'] ?? 'RON'))) ?: 'RON',
                round((float)($order['total'] ?? 0), 2),
                (string)$payload['buyer']['name'],
                (string)$payload['buyer']['cui'],
                $encoded,
                $assignedBy,
            ]);
            $db->commit();

            $saved = self::find($db, $invoiceId);
            if (!$saved) throw new RuntimeException('Factura a fost emisă, dar nu a putut fi recitită.');
            return self::row($saved, false);
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    public static function list(PDO $db): array
    {
        $rows = $db->query(
            'SELECT i.*, o.order_number, o.payment_status, o.payment_method, o.stripe_paid_at, o.customer_name, o.customer_email, o.customer_phone
             FROM shop_invoices i
             INNER JOIN shop_orders o ON o.id = i.order_id
             ORDER BY i.issued_at DESC, i.series DESC, i.invoice_number DESC
             LIMIT 1000'
        )->fetchAll();
        return array_map(static fn(array $row): array => self::row($row, true), $rows);
    }

    public static function get(PDO $db, string $id): array
    {
        $invoice = self::find($db, trim($id));
        if (!$invoice) throw new InvalidArgumentException('Factura nu există.');
        return self::row($invoice, true);
    }

    public static function download(PDO $db, string $id, string $format = 'pdf'): array
    {
        $invoice = self::find($db, trim($id));
        if (!$invoice) throw new InvalidArgumentException('Factura nu există.');
        $payload = json_decode((string)($invoice['payload_json'] ?? ''), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($payload)) throw new RuntimeException('Datele facturii nu mai sunt disponibile.');

        $payload = self::refreshPayloadState($invoice, $payload);
        $fileNumber = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)$invoice['invoice_number']) ?: 'factura';
        $format = strtolower(trim($format));
        if ($format === 'xlsx') {
            require_once __DIR__ . '/invoice-xlsx.php';
            $xlsx = GtrotsInvoiceXlsx::render($payload);
            return [
                'file_name' => 'Factura-' . (string)$invoice['series'] . '-' . $fileNumber . '.xlsx',
                'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'content_base64' => base64_encode($xlsx),
            ];
        }
        if ($format !== 'pdf') throw new InvalidArgumentException('Formatul facturii nu este acceptat.');
        require_once __DIR__ . '/invoice-pdf.php';
        $pdf = GtrotsInvoicePdf::renderPinned($db, $payload, (string)($invoice['issued_by'] ?? ''));
        return [
            'file_name' => 'Factura-' . (string)$invoice['series'] . '-' . $fileNumber . '.pdf',
            'mime_type' => 'application/pdf',
            'content_base64' => base64_encode($pdf),
        ];
    }

    public static function sendEmail(PDO $db, string $id, array $config): array
    {
        $invoice = self::find($db, trim($id));
        if (!$invoice) throw new InvalidArgumentException('Factura nu există.');
        $recipient = mb_strtolower(trim((string)($invoice['customer_email'] ?? '')));
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            $result = ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
            self::recordEmailResult($db, (string)$invoice['id'], $result);
            return $result;
        }

        try {
            $pdfFile = self::download($db, (string)$invoice['id'], 'pdf');
            $xlsxFile = self::download($db, (string)$invoice['id'], 'xlsx');
            $number = trim((string)$invoice['series'] . ' ' . (string)$invoice['invoice_number']);
            $buyer = htmlspecialchars((string)($invoice['customer_name'] ?? $invoice['buyer_name'] ?? 'client'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $safeNumber = htmlspecialchars($number, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $safeCurrency = htmlspecialchars((string)$invoice['currency'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $total = number_format((float)$invoice['total'], 2, ',', '.') . ' ' . $safeCurrency;
            $statusText = self::effectiveStatus($invoice) === 'paid' ? 'Factura este achitată.' : 'Factura este emisă și este în așteptarea plății.';
            $html = '<!doctype html><html lang="ro"><head><meta charset="utf-8"></head><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#102346">'
                . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 14px">'
                . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #e4e7ec">'
                . '<tr><td style="height:8px;background:#ff8a00"></td></tr><tr><td style="padding:32px">'
                . '<div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#ff7a00">G-TROTS ROMÂNIA · FACTURĂ EMISĂ</div>'
                . '<h1 style="margin:14px 0 8px;font-size:30px">Factura ' . $safeNumber . '</h1>'
                . '<p style="color:#5f6673;line-height:1.6">Bună, ' . $buyer . '. Găsești factura atașată acestui e-mail în formatele PDF și XLSX.</p>'
                . '<div style="margin:24px 0;padding:18px;border-radius:16px;background:#fff5e9"><strong style="font-size:22px">' . $total . '</strong><br><span style="color:#6e6257;font-size:13px">' . $statusText . '</span></div>'
                . '<p style="margin:0;color:#7b8190;font-size:12px">Document generat automat din comanda ' . htmlspecialchars((string)($invoice['order_number'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '.</p>'
                . '</td></tr></table></td></tr></table></body></html>';
            gtSmtpSend($config, $recipient, 'Factura ' . $number . ' – G-Trots România', $html, array_map(static fn(array $file): array => [
                'file_name' => (string)$file['file_name'],
                'mime_type' => (string)$file['mime_type'],
                'content' => base64_decode((string)$file['content_base64'], true) ?: '',
            ], [$pdfFile, $xlsxFile]));
            $result = ['sent' => true, 'recipient' => $recipient];
            self::recordEmailResult($db, (string)$invoice['id'], $result);
            return $result;
        } catch (Throwable $error) {
            error_log('[G-Trots invoice email] ' . $error->getMessage());
            $result = ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
            self::recordEmailResult($db, (string)$invoice['id'], $result);
            return $result;
        }
    }

    public static function orderSummary(array $row): ?array
    {
        $id = trim((string)($row['issued_invoice_id'] ?? ''));
        if ($id === '') return null;
        return [
            'id' => $id,
            'order_id' => (string)($row['id'] ?? $row['order_id'] ?? ''),
            'series' => (string)($row['issued_invoice_series'] ?? ''),
            'number' => (string)($row['issued_invoice_number'] ?? ''),
            'display_number' => trim((string)($row['issued_invoice_series'] ?? '') . ' ' . (string)($row['issued_invoice_number'] ?? '')),
            'status' => self::statusForOrder($row),
            'theme' => (string)($row['issued_invoice_theme'] ?? 'orange'),
            'issue_date' => (string)($row['issued_invoice_date'] ?? ''),
            'total' => round((float)($row['total'] ?? 0), 2),
            'currency' => strtoupper(trim((string)($row['currency'] ?? 'RON'))) ?: 'RON',
            'issued_at' => (string)($row['issued_invoice_at'] ?? ''),
        ];
    }

    public static function orderJoinSql(string $orderAlias = 'o'): string
    {
        return " LEFT JOIN shop_invoices issued_invoice ON issued_invoice.order_id = {$orderAlias}.id ";
    }

    public static function orderJoinColumns(): string
    {
        return ', issued_invoice.id AS issued_invoice_id,
                  issued_invoice.series AS issued_invoice_series,
                  issued_invoice.invoice_number AS issued_invoice_number,
                  issued_invoice.theme AS issued_invoice_theme,
                  issued_invoice.issue_date AS issued_invoice_date,
                  issued_invoice.issued_at AS issued_invoice_at';
    }

    private static function find(PDO $db, string $id): ?array
    {
        $stmt = $db->prepare(
            'SELECT i.*, o.order_number, o.payment_status, o.payment_method, o.stripe_paid_at, o.customer_name, o.customer_email, o.customer_phone
             FROM shop_invoices i
             INNER JOIN shop_orders o ON o.id = i.order_id
             WHERE i.id = ?
             LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private static function findByOrder(PDO $db, string $orderId, bool $lock): ?array
    {
        $driver = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME));
        $suffix = $lock && $driver !== 'sqlite' ? ' FOR UPDATE' : '';
        $stmt = $db->prepare(
            'SELECT i.*, o.order_number, o.payment_status, o.payment_method, o.stripe_paid_at, o.customer_name, o.customer_email, o.customer_phone
             FROM shop_invoices i
             INNER JOIN shop_orders o ON o.id = i.order_id
             WHERE i.order_id = ? LIMIT 1' . $suffix
        );
        $stmt->execute([$orderId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private static function row(array $row, bool $existing): array
    {
        $status = self::effectiveStatus($row);
        return [
            'id' => (string)$row['id'],
            'order_id' => (string)$row['order_id'],
            'order_number' => (string)($row['order_number'] ?? ''),
            'series' => (string)$row['series'],
            'number' => (string)$row['invoice_number'],
            'display_number' => trim((string)$row['series'] . ' ' . (string)$row['invoice_number']),
            'status' => $status,
            'theme' => (string)$row['theme'],
            'issue_date' => (string)$row['issue_date'],
            'due_date' => $row['due_date'] !== null ? (string)$row['due_date'] : null,
            'currency' => (string)$row['currency'],
            'total' => round((float)$row['total'], 2),
            'buyer_name' => (string)$row['buyer_name'],
            'buyer_cui' => (string)($row['buyer_cui'] ?? ''),
            'payment_status' => (string)($row['payment_status'] ?? ''),
            'payment_method' => (string)($row['payment_method'] ?? ''),
            'issued_by' => (string)($row['issued_by'] ?? ''),
            'issued_at' => (string)$row['issued_at'],
            'updated_at' => (string)$row['updated_at'],
            'customer_email' => (string)($row['customer_email'] ?? ''),
            'email_sent_at' => ($row['email_sent_at'] ?? null) !== null ? (string)$row['email_sent_at'] : null,
            'email_last_error' => ($row['email_last_error'] ?? null) !== null ? (string)$row['email_last_error'] : null,
            'existing' => $existing,
        ];
    }

    private static function effectiveStatus(array $row): string
    {
        if (array_key_exists('payment_status', $row)) return self::statusForOrder($row);
        return in_array((string)($row['document_status'] ?? ''), ['paid', 'unpaid'], true)
            ? (string)$row['document_status']
            : 'unpaid';
    }

    private static function refreshPayloadState(array $invoice, array $payload): array
    {
        $status = self::effectiveStatus($invoice);
        $payload['status'] = $status;
        $payload['theme'] = (string)$invoice['theme'];
        $payload['document_id'] = (string)$invoice['id'];
        $payload['amount_paid'] = $status === 'paid' ? abs((float)($invoice['total'] ?? 0)) : 0.0;
        if (!is_array($payload['payment'] ?? null)) $payload['payment'] = [];
        $payload['payment']['paid_at'] = $status === 'paid'
            ? (trim((string)($invoice['stripe_paid_at'] ?? '')) ?: (string)($invoice['issue_date'] ?? ''))
            : '';
        return $payload;
    }

    private static function statusForOrder(array $order): string
    {
        return (string)($order['payment_status'] ?? '') === 'paid' ? 'paid' : 'unpaid';
    }

    private static function recordEmailResult(PDO $db, string $id, array $result): void
    {
        $sent = !empty($result['sent']);
        $stmt = $db->prepare('UPDATE shop_invoices SET email_sent_at = ?, email_last_error = ? WHERE id = ?');
        $stmt->execute([$sent ? date('Y-m-d H:i:s') : null, $sent ? null : mb_substr((string)($result['error'] ?? 'Trimiterea a eșuat.'), 0, 500), $id]);
    }

    private static function nextNumber(PDO $db, string $series): string
    {
        $driver = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME));
        $insert = $driver === 'sqlite'
            ? 'INSERT OR IGNORE INTO shop_invoice_sequences (series, last_number) VALUES (?, 0)'
            : 'INSERT IGNORE INTO shop_invoice_sequences (series, last_number) VALUES (?, 0)';
        $db->prepare($insert)->execute([$series]);

        $lock = $driver === 'sqlite' ? '' : ' FOR UPDATE';
        $sequence = $db->prepare('SELECT last_number FROM shop_invoice_sequences WHERE series = ?' . $lock);
        $sequence->execute([$series]);
        $last = (int)$sequence->fetchColumn();

        $invoiceMax = $db->prepare('SELECT MAX(CAST(invoice_number AS INTEGER)) FROM shop_invoices WHERE series = ?');
        $invoiceMax->execute([$series]);
        $assignmentMax = $db->prepare('SELECT MAX(CAST(invoice_number AS INTEGER)) FROM shop_invoice_theme_assignments WHERE invoice_series = ?');
        $assignmentMax->execute([$series]);
        $next = max($last, (int)$invoiceMax->fetchColumn(), (int)$assignmentMax->fetchColumn()) + 1;
        $db->prepare('UPDATE shop_invoice_sequences SET last_number = ? WHERE series = ?')->execute([$next, $series]);
        return str_pad((string)$next, 3, '0', STR_PAD_LEFT);
    }

    private static function postStock(PDO $db, array $order, string $invoiceId, string $series, string $number, array $actor): void
    {
        $items = $db->prepare('SELECT id, product_id, quantity, unit_price, line_total, discounted_unit_price, discounted_line_total FROM shop_order_items WHERE order_id = ? AND product_id IS NOT NULL');
        $items->execute([(string)$order['id']]);
        $driver = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME));
        $product = $db->prepare('SELECT id, name, stock_mode, stock_quantity, accounting_stock_quantity FROM shop_products WHERE id = ?' . ($driver === 'sqlite' ? '' : ' FOR UPDATE'));
        $existing = $db->prepare("SELECT id FROM shop_inventory_movements WHERE order_id = ? AND product_id = ? AND movement_type = 'sale' LIMIT 1");
        $updateExisting = $db->prepare("UPDATE shop_inventory_movements SET sales_invoice_id = ?, sales_invoice_line_id = ?, warehouse_id = ?, accounting_quantity_delta = ?, accounting_quantity_after = ?, inventory_unit_cost_ron = ?, inventory_cost_total_ron = ?, sale_unit_price_ron = ?, sale_total_ron = ?, fifo_status = ?, fifo_quantity_allocated = ?, fifo_quantity_pending = ?, note = ? WHERE order_id = ? AND product_id = ? AND movement_type = 'sale'");
        $updateStock = $db->prepare('UPDATE shop_products SET stock_quantity = ?, accounting_stock_quantity = ? WHERE id = ?');
        $movement = $db->prepare('INSERT INTO shop_inventory_movements (id, product_id, warehouse_id, order_id, sales_invoice_id, sales_invoice_line_id, movement_type, quantity_delta, quantity_after, accounting_quantity_delta, accounting_quantity_after, inventory_unit_cost_ron, inventory_cost_total_ron, sale_unit_price_ron, sale_total_ron, fifo_status, fifo_quantity_allocated, fifo_quantity_pending, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $actorName = mb_substr(trim((string)($actor['display_name'] ?? $actor['username'] ?? 'Administrator')), 0, 180);
        $invoiceLabel = trim($series . ' ' . $number);
        $warehouseId = '';
        if (function_exists('shopNirConsumeFifoAvailable')) {
            $warehouseId = trim((string)($db->query('SELECT default_warehouse_id FROM shop_nir_settings WHERE id = 1 LIMIT 1')->fetchColumn() ?: ''));
        }

        $orderItems = $items->fetchAll();
        $productGrossTarget = round(max(0.0, (float)($order['total'] ?? 0) - (float)($order['shipping_cost'] ?? 0)), 2);
        $sourceGrossTotal = array_reduce($orderItems, static fn(float $sum, array $item): float => $sum + (float)($item['discounted_line_total'] ?? $item['line_total'] ?? 0), 0.0);
        $allocatedGross = 0.0;
        foreach ($orderItems as $index => $item) {
            $productId = trim((string)($item['product_id'] ?? ''));
            $quantity = max(0, (int)($item['quantity'] ?? 0));
            if ($productId === '' || $quantity === 0) continue;
            $rawGross = max(0.0, (float)($item['discounted_line_total'] ?? $item['line_total'] ?? 0));
            $saleTotal = $index === array_key_last($orderItems)
                ? round(max(0.0, $productGrossTarget - $allocatedGross), 2)
                : round($sourceGrossTotal > 0 ? $productGrossTarget * ($rawGross / $sourceGrossTotal) : 0, 2);
            $allocatedGross += $saleTotal;
            $saleUnitPrice = round($saleTotal / $quantity, 6);
            $product->execute([$productId]);
            $row = $product->fetch();
            if (!$row || (string)$row['stock_mode'] !== 'tracked') continue;
            $accountingCurrent = (float)($row['accounting_stock_quantity'] ?? $row['stock_quantity'] ?? 0);
            $fifo = ['consumptions' => [], 'allocated_quantity' => 0, 'shortage_quantity' => $quantity, 'total_cost_ron' => 0];
            if ($warehouseId !== '' && function_exists('shopNirConsumeFifoAvailable')) {
                $fifo = shopNirConsumeFifoAvailable($db, $productId, $warehouseId, $quantity, 'SALES_INVOICE', $invoiceId, (string)$item['id'], 'invoice:' . $invoiceId . ':' . (string)$item['id'], false);
            }
            $fifoConsumptions = (array)($fifo['consumptions'] ?? []);
            $fifoAllocated = round((float)($fifo['allocated_quantity'] ?? array_reduce($fifoConsumptions, static fn(float $sum, array $allocation): float => $sum + (float)($allocation['quantity'] ?? 0), 0.0)), 4);
            $fifoPending = round(max(0.0, $quantity - $fifoAllocated), 4);
            $fifoTotalCost = round((float)($fifo['total_cost_ron'] ?? array_reduce($fifoConsumptions, static fn(float $sum, array $allocation): float => $sum + (float)($allocation['cost_ron'] ?? $allocation['total_cost_ron'] ?? 0), 0.0)), 2);
            $fifoUnitCost = $fifoAllocated > 0 ? round($fifoTotalCost / $fifoAllocated, 6) : null;
            $fifoStatus = $fifoPending <= 0.00005 ? 'allocated' : ($fifoAllocated > 0 ? 'partial' : 'pending');
            $accountingAfter = round($accountingCurrent - $quantity, 4);
            $note = 'Ieșire prin factura ' . $invoiceLabel . ' · comanda ' . (string)$order['order_number'];
            if ($fifoStatus !== 'allocated') $note .= ' · proveniența FIFO se completează la confirmarea NIR-ului';
            $existing->execute([(string)$order['id'], $productId]);
            if ($existing->fetchColumn()) {
                // Comenzile create înaintea acestei funcționalități au rezervat deja stocul.
                // Le legăm de factură fără o a doua scădere.
                $updateStock->execute([(int)$row['stock_quantity'], $accountingAfter, $productId]);
                $updateExisting->execute([$invoiceId, (string)$item['id'], $warehouseId ?: null, -$quantity, $accountingAfter, $fifoUnitCost, $fifoAllocated > 0 ? $fifoTotalCost : null, $saleUnitPrice, $saleTotal, $fifoStatus, $fifoAllocated, $fifoPending, $note, (string)$order['id'], $productId]);
                continue;
            }
            $current = (int)$row['stock_quantity'];
            if ($current < $quantity) {
                throw new InvalidArgumentException('Stoc insuficient pentru emiterea facturii: ' . (string)($row['name'] ?? 'produs') . '. Disponibil ' . $current . ', necesar ' . $quantity . '.');
            }
            $after = $current - $quantity;
            $updateStock->execute([$after, $accountingAfter, $productId]);
            $movement->execute([self::uuid(), $productId, $warehouseId ?: null, (string)$order['id'], $invoiceId, (string)$item['id'], 'sale', -$quantity, $after, -$quantity, $accountingAfter, $fifoUnitCost, $fifoAllocated > 0 ? $fifoTotalCost : null, $saleUnitPrice, $saleTotal, $fifoStatus, $fifoAllocated, $fifoPending, $note, $actorName]);
        }
    }

    private static function payload(PDO $db, array $order, array $company, string $invoiceId, string $series, string $number, string $issueDate, string $dueDate, string $status): array
    {
        $itemsStmt = $db->prepare(
            'SELECT oi.*,
                    (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = oi.product_id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image_path
             FROM shop_order_items oi
             WHERE oi.order_id = ?
             ORDER BY oi.id ASC'
        );
        $itemsStmt->execute([(string)$order['id']]);
        $orderItems = $itemsStmt->fetchAll();
        if (!$orderItems) throw new InvalidArgumentException('Comanda nu conține produse care pot fi facturate.');

        $vatRate = !empty($order['vat_payer']) ? max(0.0, min(100.0, (float)($order['vat_rate'] ?? 0))) : 0.0;
        $grossProductTarget = round(max(0.0, (float)$order['total'] - (float)($order['shipping_cost'] ?? 0)), 2);
        $lineGrossValues = [];
        $sourceGrossTotal = array_reduce($orderItems, static fn(float $sum, array $item): float => $sum + (float)($item['discounted_line_total'] ?? $item['line_total'] ?? 0), 0.0);
        $allocated = 0.0;
        foreach ($orderItems as $index => $item) {
            $rawGross = max(0.0, (float)($item['discounted_line_total'] ?? $item['line_total'] ?? 0));
            $isLast = $index === array_key_last($orderItems);
            $lineGross = $isLast
                ? round(max(0.0, $grossProductTarget - $allocated), 2)
                : round($sourceGrossTotal > 0 ? $grossProductTarget * ($rawGross / $sourceGrossTotal) : 0, 2);
            $lineGrossValues[] = $lineGross;
            $allocated += $lineGross;
        }

        $items = [];
        foreach ($orderItems as $index => $item) {
            $quantity = max(1, (int)($item['quantity'] ?? 1));
            $grossUnit = $lineGrossValues[$index] / $quantity;
            $netUnit = $vatRate > 0 ? $grossUnit / (1 + $vatRate / 100) : $grossUnit;
            $items[] = [
                'name' => (string)($item['product_name'] ?? 'Produs'),
                'sku' => (string)($item['product_sku'] ?? ''),
                'image_path' => (string)($item['image_path'] ?? ''),
                'unit' => 'buc.',
                'quantity' => $quantity,
                'unit_price' => round($netUnit, 8),
                'discount_percent' => 0,
                'vat_rate' => $vatRate,
            ];
        }
        $shipping = round((float)($order['shipping_cost'] ?? 0), 2);
        if ($shipping > 0) {
            $shippingNet = $vatRate > 0 ? $shipping / (1 + $vatRate / 100) : $shipping;
            $items[] = [
                'name' => 'Serviciu de livrare – ' . trim((string)($order['shipping_method_name'] ?? 'Livrare')),
                'sku' => 'TRANSPORT',
                'unit' => 'serv.',
                'quantity' => 1,
                'unit_price' => round($shippingNet, 8),
                'discount_percent' => 0,
                'vat_rate' => $vatRate,
            ];
        }

        $isCompany = (string)($order['customer_type'] ?? 'individual') === 'company';
        $buyerAddress = $isCompany && trim((string)($order['company_address'] ?? '')) !== ''
            ? (string)$order['company_address']
            : (string)($order['address'] ?? '');
        $buyer = [
            'name' => $isCompany ? (string)($order['company_name'] ?? $order['customer_name']) : (string)$order['customer_name'],
            'cui' => $isCompany ? (string)($order['company_cui'] ?? '') : '',
            'registration_number' => $isCompany ? (string)($order['company_registration_number'] ?? '') : '',
            'address' => $buyerAddress,
            'city' => (string)($order['city'] ?? ''),
            'county' => (string)($order['county'] ?? ''),
            'postal_code' => (string)($order['postal_code'] ?? ''),
            'country' => 'România',
            'email' => (string)($order['customer_email'] ?? ''),
            'phone' => (string)($order['customer_phone'] ?? ''),
        ];
        $seller = [
            'name' => (string)$company['legal_name'],
            'trade_name' => (string)($company['trade_name'] ?? ''),
            'cui' => (string)$company['cui'],
            'registration_number' => (string)($company['registration_number'] ?? ''),
            'address' => (string)($company['address'] ?? ''),
            'city' => (string)($company['city'] ?? ''),
            'county' => (string)($company['county'] ?? ''),
            'postal_code' => (string)($company['postal_code'] ?? ''),
            'country' => (string)($company['country'] ?? 'România'),
            'email' => (string)($company['email'] ?? ''),
            'phone' => (string)($company['phone'] ?? ''),
            'website' => (string)($company['website'] ?? ''),
            'bank_name' => (string)($company['bank_name'] ?? ''),
            'iban' => (string)($company['iban'] ?? ''),
            'share_capital' => (string)($company['share_capital'] ?? ''),
        ];
        $paymentMethod = (string)($order['payment_method'] ?? '') === 'card' ? 'Card online' : 'Ramburs la curier';
        $promotionNote = trim((string)($order['promotion_code'] ?? '')) !== ''
            ? 'Reducerea aferentă codului ' . trim((string)$order['promotion_code']) . ' este inclusă în prețurile pozițiilor.'
            : '';

        return [
            'document_id' => $invoiceId,
            'status' => $status,
            'series' => $series,
            'number' => $number,
            'issue_date' => $issueDate,
            'due_date' => $dueDate,
            'delivery_date' => $issueDate,
            'currency' => strtoupper(trim((string)($order['currency'] ?? 'RON'))) ?: 'RON',
            'seller' => $seller,
            'buyer' => $buyer,
            'items' => $items,
            'payment' => [
                'method' => $paymentMethod,
                'reference' => $series . ' ' . $number,
                'iban' => (string)($company['iban'] ?? ''),
                'bank_name' => (string)($company['bank_name'] ?? ''),
                'paid_at' => $status === 'paid' ? (trim((string)($order['stripe_paid_at'] ?? '')) ?: $issueDate) : '',
                'transaction_id' => (string)($order['stripe_payment_intent_id'] ?? ''),
            ],
            'notes' => implode("\n", array_filter([(string)($order['customer_notes'] ?? ''), $promotionNote])),
            'order_reference' => (string)($order['order_number'] ?? ''),
            'tax_note' => $vatRate > 0
                ? 'Prețurile comerciale includ TVA ' . rtrim(rtrim(number_format($vatRate, 2, '.', ''), '0'), '.') . '%, evidențiată separat în factură.'
                : 'Societate neînregistrată în scopuri de TVA. TVA aplicată: 0%.',
        ];
    }

    private static function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
