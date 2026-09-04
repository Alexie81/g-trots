<?php
declare(strict_types=1);

/** Confirmă un retur și aplică o singură dată corecția fiscală disponibilă. */
final class GtrotsOrderReturnConfirmation
{
    /**
     * Completes the fiscal pair for an already confirmed return. This is used
     * when the positive invoice is issued manually after the return was
     * confirmed without any document.
     */
    public static function ensureReturnInvoice(PDO $db, string $orderId, array $config, array $actor, bool $sendReturnEmail = true): array
    {
        $order = self::findOrder($db, trim($orderId));
        if (!$order) throw new InvalidArgumentException('Comanda nu există.');
        if ((string)($order['status'] ?? '') !== 'return_confirmed') {
            throw new InvalidArgumentException('Factura de retur poate fi completată automat numai pentru un retur confirmat.');
        }
        $reason = trim((string)($order['return_reason'] ?? '')) ?: 'Retur confirmat pentru comanda ' . (string)($order['order_number'] ?? '');
        $returnInvoice = GtrotsInvoiceService::issueReturn($db, (string)$order['id'], $reason, $actor, $config);
        self::queueForSpv($db, (string)$returnInvoice['id']);
        $db->prepare('UPDATE shop_orders SET return_invoice_id = COALESCE(return_invoice_id, ?) WHERE id = ?')
            ->execute([(string)$returnInvoice['id'], (string)$order['id']]);
        $returnInvoiceEmail = $sendReturnEmail
            ? GtrotsInvoiceService::sendEmailOnce($db, (string)$returnInvoice['id'], $config)
            : ['requested' => false, 'sent' => false];
        return [
            'return_invoice' => $returnInvoice,
            'return_invoice_email' => $returnInvoiceEmail,
        ];
    }

    public static function confirm(PDO $db, string $orderId, array $config, array $actor, bool $notifyCustomer): array
    {
        $orderId = trim($orderId);
        if ($orderId === '') throw new InvalidArgumentException('Comanda nu a fost selectată.');
        $changedBy = trim((string)($actor['display_name'] ?? $actor['username'] ?? 'Administrator')) ?: 'Administrator';
        $historyId = '';
        $returnInvoice = null;
        $invoiceAction = 'none_no_positive_invoice';
        $duplicate = false;

        $db->beginTransaction();
        try {
            $order = self::findOrderForUpdate($db, $orderId);
            if (!$order) throw new InvalidArgumentException('Comanda nu există.');
            $currentStatus = (string)($order['status'] ?? '');
            if ($currentStatus === 'return_confirmed') {
                $duplicate = true;
                $returnInvoice = self::existingReturnInvoice($db, $orderId);
                $invoiceAction = $returnInvoice ? 'return_invoice_existing' : 'none_no_positive_invoice';
                $db->commit();
                return self::result($db, $orderId, true, $invoiceAction, $returnInvoice, [], []);
            }
            if (!in_array($currentStatus, ['return_requested', 'return_refused'], true)) {
                throw new InvalidArgumentException('Returul poate fi confirmat numai după solicitarea sau refuzul returului.');
            }

            $positiveStmt = $db->prepare("SELECT id FROM shop_invoices WHERE order_id = ? AND invoice_type = 'invoice' LIMIT 1" . (self::isSqlite($db) ? '' : ' FOR UPDATE'));
            $positiveStmt->execute([$orderId]);
            if ($positiveStmt->fetchColumn()) {
                $reason = trim((string)($order['return_reason'] ?? '')) ?: 'Retur confirmat pentru comanda ' . (string)($order['order_number'] ?? '');
                $returnInvoice = GtrotsInvoiceService::issueReturn($db, $orderId, $reason, [
                    'display_name' => $changedBy,
                    'username' => 'order-return-confirmation',
                ], $config, false);
                self::queueForSpv($db, (string)$returnInvoice['id']);
                $invoiceAction = !empty($returnInvoice['existing']) ? 'return_invoice_existing' : 'return_invoice_created';
            }

            $note = $returnInvoice
                ? 'Retur confirmat. Factura de retur ' . (string)($returnInvoice['display_number'] ?? '') . ' a fost asociată automat.'
                : 'Retur confirmat fără document fiscal: comanda nu are factură pozitivă emisă.';
            $adminNotes = trim((string)($order['admin_notes'] ?? ''));
            $adminNotes = trim($adminNotes . ($adminNotes !== '' ? "\n" : '') . $note);
            $db->prepare("UPDATE shop_orders SET status = 'return_confirmed', return_confirmed_at = CURRENT_TIMESTAMP, return_invoice_id = ?, admin_notes = ? WHERE id = ?")
                ->execute([$returnInvoice['id'] ?? null, mb_substr($adminNotes, 0, 5000), $orderId]);
            $historyId = self::recordHistory($db, $orderId, $currentStatus, $changedBy, $notifyCustomer);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }

        $returnInvoiceEmail = ['sent' => false];
        if (is_array($returnInvoice) && !empty($returnInvoice['id'])) {
            $returnInvoiceEmail = GtrotsInvoiceService::sendEmailOnce($db, (string)$returnInvoice['id'], $config);
        }
        $statusEmail = ['sent' => false];
        if ($notifyCustomer) {
            $saved = self::findOrder($db, $orderId);
            $statusEmail = $saved ? gtSendOrderReturnConfirmedEmail($saved, $config) : ['sent' => false, 'error' => 'Comanda nu a putut fi recitită pentru e-mail.'];
            self::recordStatusEmail($db, $orderId, $historyId, $statusEmail);
        }
        return self::result($db, $orderId, $duplicate, $invoiceAction, $returnInvoice, $returnInvoiceEmail, $statusEmail);
    }

    private static function findOrderForUpdate(PDO $db, string $orderId): ?array
    {
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? LIMIT 1' . (self::isSqlite($db) ? '' : ' FOR UPDATE'));
        $stmt->execute([$orderId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private static function findOrder(PDO $db, string $orderId): ?array
    {
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? LIMIT 1');
        $stmt->execute([$orderId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private static function existingReturnInvoice(PDO $db, string $orderId): ?array
    {
        $stmt = $db->prepare("SELECT id, series, invoice_number, invoice_type FROM shop_invoices WHERE order_id = ? AND invoice_type = 'return' LIMIT 1");
        $stmt->execute([$orderId]);
        $row = $stmt->fetch();
        if (!$row) return null;
        return [
            'id' => (string)$row['id'],
            'series' => (string)$row['series'],
            'number' => (string)$row['invoice_number'],
            'display_number' => trim((string)$row['series'] . ' ' . (string)$row['invoice_number']),
            'invoice_type' => 'return',
            'existing' => true,
        ];
    }

    private static function queueForSpv(PDO $db, string $invoiceId): void
    {
        $sql = self::isSqlite($db)
            ? "INSERT OR IGNORE INTO shop_spv_outbox (id, invoice_id, document_kind, status) VALUES (?, ?, 'credit_note', 'awaiting_configuration')"
            : "INSERT IGNORE INTO shop_spv_outbox (id, invoice_id, document_kind, status) VALUES (?, ?, 'credit_note', 'awaiting_configuration')";
        $db->prepare($sql)->execute([self::uuid(), $invoiceId]);
    }

    private static function recordHistory(PDO $db, string $orderId, string $fromStatus, string $changedBy, bool $notifyCustomer): string
    {
        $id = self::uuid();
        $db->prepare("INSERT INTO shop_order_status_history (id, order_id, from_status, to_status, changed_by, customer_notified, email_status) VALUES (?, ?, ?, 'return_confirmed', ?, 0, ?)")
            ->execute([$id, $orderId, $fromStatus, mb_substr($changedBy, 0, 180), $notifyCustomer ? 'pending' : 'not_requested']);
        return $id;
    }

    private static function recordStatusEmail(PDO $db, string $orderId, string $historyId, array $result): void
    {
        $sent = !empty($result['sent']);
        $error = $sent ? null : mb_substr((string)($result['error'] ?? 'Trimiterea e-mailului a eșuat.'), 0, 500);
        $db->prepare('UPDATE shop_orders SET return_confirmation_email_sent_at = ?, return_confirmation_email_error = ? WHERE id = ?')
            ->execute([$sent ? date('Y-m-d H:i:s') : null, $error, $orderId]);
        $db->prepare('UPDATE shop_order_status_history SET customer_notified = ?, email_status = ?, email_error = ? WHERE id = ?')
            ->execute([$sent ? 1 : 0, $sent ? 'sent' : 'failed', $error, $historyId]);
    }

    private static function result(PDO $db, string $orderId, bool $duplicate, string $invoiceAction, ?array $returnInvoice, array $returnInvoiceEmail, array $statusEmail): array
    {
        return [
            'order' => self::findOrder($db, $orderId),
            'confirmed' => true,
            'duplicate' => $duplicate,
            'invoice_action' => $invoiceAction,
            'return_invoice' => $returnInvoice,
            'return_invoice_email' => $returnInvoiceEmail,
            'status_email' => $statusEmail,
        ];
    }

    private static function isSqlite(PDO $db): bool
    {
        return strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite';
    }

    private static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
