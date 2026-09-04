<?php
declare(strict_types=1);

/**
 * Persistent and idempotent automatic invoice issuing rules.
 *
 * The storefront, Stripe webhook and CRM order editor all call this service
 * after the order notification has completed. A unique run per order/payment
 * flow prevents duplicate invoices and duplicate invoice e-mails.
 */
final class GtrotsInvoiceAutomation
{
    public static function defaults(): array
    {
        return [
            'card_issue_enabled' => false,
            'card_email_enabled' => false,
            'cod_issue_enabled' => false,
            'cod_email_enabled' => false,
        ];
    }

    public static function normalize(array $settings): array
    {
        $bool = static function ($value): bool {
            if (is_bool($value)) return $value;
            if (is_int($value) || is_float($value)) return (int)$value === 1;
            return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on'], true);
        };
        $cardIssue = $bool($settings['card_issue_enabled'] ?? false);
        $codIssue = $bool($settings['cod_issue_enabled'] ?? false);
        return [
            'card_issue_enabled' => $cardIssue,
            'card_email_enabled' => $cardIssue && $bool($settings['card_email_enabled'] ?? false),
            'cod_issue_enabled' => $codIssue,
            'cod_email_enabled' => $codIssue && $bool($settings['cod_email_enabled'] ?? false),
        ];
    }

    public static function settings(PDO $db): array
    {
        $row = $db->query('SELECT * FROM shop_invoice_automation_settings WHERE id = 1')->fetch() ?: [];
        return array_merge(self::normalize($row), [
            'updated_by' => (string)($row['updated_by'] ?? ''),
            'updated_at' => $row['updated_at'] ?? null,
        ]);
    }

    public static function update(PDO $db, array $input, string $actor): array
    {
        $settings = self::normalize($input);
        $params = [
            $settings['card_issue_enabled'] ? 1 : 0,
            $settings['card_email_enabled'] ? 1 : 0,
            $settings['cod_issue_enabled'] ? 1 : 0,
            $settings['cod_email_enabled'] ? 1 : 0,
            mb_substr(trim($actor), 0, 180),
        ];
        if (strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite') {
            $stmt = $db->prepare(
                'INSERT INTO shop_invoice_automation_settings (id, card_issue_enabled, card_email_enabled, cod_issue_enabled, cod_email_enabled, updated_by, updated_at)
                 VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET card_issue_enabled = excluded.card_issue_enabled, card_email_enabled = excluded.card_email_enabled,
                    cod_issue_enabled = excluded.cod_issue_enabled, cod_email_enabled = excluded.cod_email_enabled,
                    updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP'
            );
        } else {
            $stmt = $db->prepare(
                'INSERT INTO shop_invoice_automation_settings (id, card_issue_enabled, card_email_enabled, cod_issue_enabled, cod_email_enabled, updated_by)
                 VALUES (1, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE card_issue_enabled = VALUES(card_issue_enabled), card_email_enabled = VALUES(card_email_enabled),
                    cod_issue_enabled = VALUES(cod_issue_enabled), cod_email_enabled = VALUES(cod_email_enabled), updated_by = VALUES(updated_by)'
            );
        }
        $stmt->execute($params);
        return self::settings($db);
    }

    public static function eligibility(array $order, array $settings): array
    {
        $settings = self::normalize($settings);
        $method = (string)($order['payment_method'] ?? '');
        $status = (string)($order['status'] ?? '');
        $paymentStatus = (string)($order['payment_status'] ?? '');
        if ($method === 'card') {
            $eligible = $paymentStatus === 'paid' && $status === 'confirmed';
            return [
                'flow' => 'card',
                'eligible' => $eligible,
                'issue' => $eligible && $settings['card_issue_enabled'],
                'email' => $eligible && $settings['card_email_enabled'],
                'reason' => $eligible ? '' : 'Plata cu cardul trebuie acceptată, iar comanda confirmată.',
            ];
        }
        if ($method === 'cash_on_delivery') {
            $eligible = $status === 'new';
            return [
                'flow' => 'cod',
                'eligible' => $eligible,
                'issue' => $eligible && $settings['cod_issue_enabled'],
                'email' => $eligible && $settings['cod_email_enabled'],
                'reason' => $eligible ? '' : 'Comanda ramburs trebuie să fie în starea Nouă.',
            ];
        }
        return ['flow' => '', 'eligible' => false, 'issue' => false, 'email' => false, 'reason' => 'Metoda de plată nu este eligibilă.'];
    }

    public static function processOrder(
        PDO $db,
        string $orderId,
        array $config,
        array $actor = [],
        ?callable $issueCallback = null,
        ?callable $emailCallback = null
    ): array {
        $orderStmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? LIMIT 1');
        $orderStmt->execute([trim($orderId)]);
        $order = $orderStmt->fetch();
        if (!$order) return ['processed' => false, 'reason' => 'Comanda nu există.'];

        $decision = self::eligibility($order, self::settings($db));
        if (!$decision['eligible'] || !$decision['issue']) {
            return array_merge($decision, ['processed' => false]);
        }

        $flow = (string)$decision['flow'];
        $run = self::claim($db, (string)$order['id'], $flow, (bool)$decision['email']);
        if (!$run['claimed']) {
            return array_merge($decision, [
                'processed' => false,
                'duplicate' => true,
                'status' => (string)($run['status'] ?? 'processing'),
                'invoice_id' => $run['invoice_id'] ?? null,
            ]);
        }

        $automaticActor = $actor ?: [
            'display_name' => $flow === 'card' ? 'Automatizare factură · Card' : 'Automatizare factură · Ramburs',
            'username' => 'invoice-automation',
        ];
        $invoiceId = null;
        try {
            $invoice = $issueCallback
                ? $issueCallback($db, (string)$order['id'], $automaticActor, $config)
                : GtrotsInvoiceService::issue($db, (string)$order['id'], $automaticActor, $config);
            $invoiceId = trim((string)($invoice['id'] ?? ''));
            if ($invoiceId === '') throw new RuntimeException('Factura automată nu a returnat un identificator.');

            $emailSent = false;
            if ($decision['email']) {
                if (!empty($invoice['email_sent_at'])) {
                    $emailSent = true;
                } else {
                    $notification = $emailCallback
                        ? $emailCallback($db, $invoiceId, $config)
                        : GtrotsInvoiceService::sendEmailOnce($db, $invoiceId, $config);
                    $emailSent = !empty($notification['sent']);
                    if (!$emailSent) throw new RuntimeException((string)($notification['error'] ?? 'E-mailul facturii nu a putut fi trimis.'));
                }
            }
            self::finish($db, (string)$run['id'], $invoiceId, $emailSent, 'completed', null);
            return array_merge($decision, ['processed' => true, 'status' => 'completed', 'invoice_id' => $invoiceId, 'email_sent' => $emailSent]);
        } catch (Throwable $error) {
            self::finish($db, (string)$run['id'], $invoiceId, false, 'failed', $error->getMessage());
            error_log('[G-Trots invoice automation] ' . $error->getMessage());
            return array_merge($decision, ['processed' => true, 'status' => 'failed', 'email_sent' => false, 'error' => $error->getMessage()]);
        }
    }

    private static function claim(PDO $db, string $orderId, string $flow, bool $emailRequested): array
    {
        $driver = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME));
        $id = self::uuid();
        $prefix = $driver === 'sqlite' ? 'INSERT OR IGNORE' : 'INSERT IGNORE';
        $insert = $db->prepare(
            $prefix . " INTO shop_invoice_automation_runs
             (id, order_id, payment_flow, issue_requested, email_requested, email_sent, status, attempts)
             VALUES (?, ?, ?, 1, ?, 0, 'processing', 1)"
        );
        $insert->execute([$id, $orderId, $flow, $emailRequested ? 1 : 0]);
        if ($insert->rowCount() === 1) return ['claimed' => true, 'id' => $id, 'status' => 'processing'];

        $stmt = $db->prepare('SELECT * FROM shop_invoice_automation_runs WHERE order_id = ? AND payment_flow = ? LIMIT 1');
        $stmt->execute([$orderId, $flow]);
        $existing = $stmt->fetch() ?: [];
        if (($existing['status'] ?? '') !== 'failed') return array_merge($existing, ['claimed' => false]);

        $retry = $db->prepare("UPDATE shop_invoice_automation_runs SET status = 'processing', email_requested = ?, attempts = attempts + 1, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'failed'");
        $retry->execute([$emailRequested ? 1 : 0, (string)$existing['id']]);
        return array_merge($existing, ['claimed' => $retry->rowCount() === 1, 'status' => 'processing']);
    }

    private static function finish(PDO $db, string $runId, ?string $invoiceId, bool $emailSent, string $status, ?string $error): void
    {
        $stmt = $db->prepare('UPDATE shop_invoice_automation_runs SET invoice_id = COALESCE(?, invoice_id), email_sent = ?, status = ?, last_error = ?, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $stmt->execute([$invoiceId, $emailSent ? 1 : 0, $status, $error === null ? null : mb_substr($error, 0, 500), $runId]);
    }

    private static function uuid(): string
    {
        if (function_exists('uuidV4')) return uuidV4();
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
