<?php
declare(strict_types=1);

/**
 * One cancellation workflow shared by the public tracking page and CRM apps.
 * The status check, fiscal correction, stock reversal and refund metadata are
 * committed together; email delivery is deliberately retriable afterwards.
 */
final class GtrotsOrderCancellation
{
    private const ALLOWED_STATUSES = ['new', 'confirmed', 'processing'];

    public static function canCancelStatus(string $status): bool
    {
        return in_array(trim($status), self::ALLOWED_STATUSES, true);
    }

    public static function cancelByCustomer(PDO $db, array $access, string $reason, array $config): array
    {
        return self::cancel($db, $access, $reason, $config, 'customer', 'Client · pagina de urmărire');
    }

    public static function cancelByStaff(PDO $db, string $orderId, string $reason, array $config, array $actor): array
    {
        return self::cancel(
            $db,
            ['id' => trim($orderId)],
            $reason,
            $config,
            'staff',
            trim((string)($actor['display_name'] ?? $actor['username'] ?? 'Administrator')) ?: 'Administrator'
        );
    }

    private static function cancel(PDO $db, array $access, string $reason, array $config, string $source, string $changedBy): array
    {
        $reason = trim(preg_replace('/\s+/u', ' ', $reason) ?? $reason);
        if (mb_strlen($reason, 'UTF-8') < 3) throw new InvalidArgumentException('Scrie un motiv al anulării de cel puțin 3 caractere.');
        $reason = mb_substr($reason, 0, 1000);

        $historyId = '';
        $invoiceAction = 'none';
        $releasedNumber = '';
        $returnInvoice = null;
        $deletedInvoiceForCleanup = null;
        $alreadyCancelled = false;
        $db->beginTransaction();
        try {
            $order = self::findOrderForUpdate($db, $access, $source === 'customer');
            if (!$order) throw new InvalidArgumentException($source === 'customer' ? 'Linkul sau datele comenzii nu sunt valide.' : 'Comanda nu există.');
            $orderId = (string)$order['id'];
            $currentStatus = (string)$order['status'];
            if ($currentStatus === 'cancelled') {
                $alreadyCancelled = true;
                $db->commit();
                return self::result($db, $orderId, true, (string)($order['cancellation_invoice_action'] ?? 'none'), '', null, [], []);
            }
            if ($source === 'customer' && !self::canCancelStatus($currentStatus)) {
                throw new InvalidArgumentException('Comanda nu mai poate fi anulată de client deoarece a fost predată curierului sau a ajuns într-o etapă ulterioară.');
            }
            $invoiceStmt = $db->prepare("SELECT * FROM shop_invoices WHERE order_id = ? AND invoice_type = 'invoice' LIMIT 1" . (self::isSqlite($db) ? '' : ' FOR UPDATE'));
            $invoiceStmt->execute([$orderId]);
            $invoice = $invoiceStmt->fetch() ?: null;
            if ($invoice) {
                if ((string)($invoice['spv_status'] ?? 'not_sent') !== 'sent' && GtrotsInvoiceService::canDeleteOrderInvoice($db, $invoice, true)) {
                    $deletedInvoiceForCleanup = $invoice;
                    $deleted = GtrotsInvoiceService::delete($db, (string)$invoice['id'], $config, false);
                    $invoiceAction = 'deleted_latest_unsent';
                    $releasedNumber = (string)($deleted['released_number'] ?? '');
                } else {
                    $returnInvoice = GtrotsInvoiceService::issueReturn($db, $orderId, $reason, [
                        'display_name' => $source === 'customer' ? 'Anulare solicitată de client' : $changedBy,
                        'username' => 'order-cancellation',
                    ], $config, false);
                    $invoiceAction = 'return_invoice_created';
                    self::queueForSpv($db, (string)$returnInvoice['id'], 'credit_note');
                }
            }

            $alreadyRefunded = $currentStatus === 'refunded' || (string)$order['payment_status'] === 'refunded';
            $paidCard = (string)$order['payment_method'] === 'card' && (string)$order['payment_status'] === 'paid';
            $paymentStatus = $alreadyRefunded ? 'refunded' : ($paidCard ? 'paid' : 'failed');
            $refundStatus = $alreadyRefunded ? (string)($order['refund_status'] ?? 'completed') : ($paidCard ? 'pending' : 'none');
            $refundDueAt = $alreadyRefunded ? ($order['refund_due_at'] ?? null) : ($paidCard ? date('Y-m-d', strtotime('+15 days')) : null);
            $note = 'Anulare ' . ($source === 'customer' ? 'solicitată de client' : 'manuală din aplicație') . ': ' . $reason;
            $adminNotes = trim((string)($order['admin_notes'] ?? ''));
            $adminNotes = trim($adminNotes . ($adminNotes !== '' ? "\n" : '') . mb_substr($note, 0, 1200));
            $update = $db->prepare(
                "UPDATE shop_orders
                 SET status = 'cancelled', payment_status = ?, customer_cancellation_reason = ?, customer_cancelled_at = CURRENT_TIMESTAMP,
                     cancellation_source = ?, cancellation_invoice_action = ?, return_invoice_id = ?, refund_status = ?, refund_due_at = ?,
                     admin_notes = ?
                 WHERE id = ?"
            );
            $update->execute([
                $paymentStatus, $reason, $source, $invoiceAction, $returnInvoice['id'] ?? null,
                $refundStatus, $refundDueAt, mb_substr($adminNotes, 0, 5000), $orderId,
            ]);
            self::releasePromotion($db, $orderId);
            $historyId = self::recordHistory($db, $orderId, $currentStatus, $changedBy);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }

        if (is_array($deletedInvoiceForCleanup)) {
            GtrotsInvoiceService::removeStoredDocumentsForInvoice($deletedInvoiceForCleanup, $config);
        }
        $returnEmail = [];
        if (is_array($returnInvoice) && !empty($returnInvoice['id'])) {
            $returnEmail = GtrotsInvoiceService::sendEmailOnce($db, (string)$returnInvoice['id'], $config);
        }
        $saved = self::findOrder($db, (string)$orderId);
        $cancellationEmail = $saved ? gtSendOrderCancellationEmail($saved, $config, [
            'invoice_action' => $invoiceAction,
            'released_number' => $releasedNumber,
            'return_invoice' => $returnInvoice,
        ]) : ['sent' => false, 'error' => 'Comanda anulată nu a putut fi recitită pentru e-mail.'];
        self::recordEmail($db, (string)$orderId, $historyId, $cancellationEmail);

        return self::result($db, (string)$orderId, $alreadyCancelled, $invoiceAction, $releasedNumber, $returnInvoice, $returnEmail, $cancellationEmail);
    }

    private static function findOrderForUpdate(PDO $db, array $access, bool $public): ?array
    {
        $suffix = self::isSqlite($db) ? '' : ' FOR UPDATE';
        if (!$public) {
            $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? LIMIT 1' . $suffix);
            $stmt->execute([trim((string)($access['id'] ?? ''))]);
        } else {
            $token = strtolower(trim((string)($access['token'] ?? '')));
            if ($token !== '') {
                if (!preg_match('/^[a-f0-9]{32,64}$/', $token)) throw new InvalidArgumentException('Linkul de anulare nu este valid.');
                $stmt = $db->prepare('SELECT * FROM shop_orders WHERE tracking_token = ? LIMIT 1' . $suffix);
                $stmt->execute([$token]);
            } else {
                $number = strtoupper(trim((string)($access['order_number'] ?? '')));
                $email = mb_strtolower(trim((string)($access['email'] ?? '')));
                if ($number === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    throw new InvalidArgumentException('Completează codul comenzii și adresa de e-mail folosită la comandă.');
                }
                $stmt = $db->prepare('SELECT * FROM shop_orders WHERE UPPER(order_number) = ? AND LOWER(customer_email) = ? LIMIT 1' . $suffix);
                $stmt->execute([$number, $email]);
            }
        }
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

    private static function queueForSpv(PDO $db, string $invoiceId, string $kind): void
    {
        $sql = self::isSqlite($db)
            ? "INSERT OR IGNORE INTO shop_spv_outbox (id, invoice_id, document_kind, status) VALUES (?, ?, ?, 'awaiting_configuration')"
            : "INSERT IGNORE INTO shop_spv_outbox (id, invoice_id, document_kind, status) VALUES (?, ?, ?, 'awaiting_configuration')";
        $db->prepare($sql)->execute([self::uuid(), $invoiceId, $kind]);
    }

    private static function releasePromotion(PDO $db, string $orderId): void
    {
        if (function_exists('releasePromotionUsage')) {
            releasePromotionUsage($db, $orderId);
            return;
        }
        foreach (['shop_coupon_customer_usage', 'shop_coupon_device_usage'] as $table) {
            try { $db->prepare("DELETE FROM {$table} WHERE order_id = ?")->execute([$orderId]); }
            catch (Throwable $ignored) { }
        }
    }

    private static function recordHistory(PDO $db, string $orderId, string $fromStatus, string $changedBy): string
    {
        $id = self::uuid();
        $stmt = $db->prepare("INSERT INTO shop_order_status_history (id, order_id, from_status, to_status, changed_by, customer_notified, email_status) VALUES (?, ?, ?, 'cancelled', ?, 0, 'pending')");
        $stmt->execute([$id, $orderId, $fromStatus, mb_substr($changedBy, 0, 180)]);
        return $id;
    }

    private static function recordEmail(PDO $db, string $orderId, string $historyId, array $result): void
    {
        $sent = !empty($result['sent']);
        $error = $sent ? null : mb_substr((string)($result['error'] ?? 'Trimiterea e-mailului a eșuat.'), 0, 500);
        $db->prepare('UPDATE shop_orders SET cancellation_email_sent_at = ?, cancellation_email_error = ? WHERE id = ?')
            ->execute([$sent ? date('Y-m-d H:i:s') : null, $error, $orderId]);
        if ($historyId !== '') {
            $db->prepare('UPDATE shop_order_status_history SET customer_notified = ?, email_status = ?, email_error = ? WHERE id = ?')
                ->execute([$sent ? 1 : 0, $sent ? 'sent' : 'failed', $error, $historyId]);
        }
    }

    private static function result(PDO $db, string $orderId, bool $duplicate, string $invoiceAction, string $releasedNumber, ?array $returnInvoice, array $returnEmail, array $cancellationEmail): array
    {
        return [
            'order' => self::findOrder($db, $orderId),
            'cancelled' => true,
            'duplicate' => $duplicate,
            'invoice_action' => $invoiceAction,
            'released_number' => $releasedNumber,
            'return_invoice' => $returnInvoice,
            'return_invoice_email' => $returnEmail,
            'cancellation_email' => $cancellationEmail,
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
