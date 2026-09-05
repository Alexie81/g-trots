<?php
declare(strict_types=1);

/**
 * Regula unică pentru schimbarea manuală a statusului unei comenzi.
 * Statusurile obișnuite nu pot fi mutate înapoi. Înainte de confirmarea
 * returului, operatorul poate reveni între „solicitat” și „refuzat”; după
 * confirmare, returul poate continua doar către rambursare.
 */
function gtrotsCanChangeOrderStatus(string $currentStatus, string $targetStatus): bool
{
    $currentStatus = trim($currentStatus);
    $targetStatus = trim($targetStatus);
    if ($currentStatus === $targetStatus) return true;

    $terminalStatuses = ['refunded', 'cancelled'];
    if (in_array($currentStatus, $terminalStatuses, true)) return false;

    // Anularea manuală rămâne o acțiune separată și este permisă inclusiv
    // după predarea către curier sau după livrare.
    if ($targetStatus === 'cancelled') return true;

    $flow = ['new', 'confirmed', 'processing', 'shipped', 'completed', 'return_requested', 'return_refused', 'return_confirmed', 'refunded'];
    $currentIndex = array_search($currentStatus, $flow, true);
    $targetIndex = array_search($targetStatus, $flow, true);
    if ($currentIndex === false || $targetIndex === false) return false;

    if ($targetIndex > $currentIndex) return true;

    $editableReturnStatuses = ['return_requested', 'return_refused'];
    return in_array($currentStatus, $editableReturnStatuses, true)
        && in_array($targetStatus, $editableReturnStatuses, true);
}

/**
 * Flux unic pentru solicitările de retur create de client sau de operator.
 * În această etapă nu se modifică factura, stocul ori plata: acestea rămân
 * pentru confirmarea și finalizarea ulterioară a returului.
 */
final class GtrotsOrderReturnRequest
{
    public static function canRequestStatus(string $status): bool
    {
        return trim($status) === 'completed';
    }

    public static function requestByCustomer(PDO $db, array $access, array $details, array $config): array
    {
        return self::request($db, $access, $details, $config, 'customer', 'Client · pagina de urmărire', true);
    }

    public static function requestByStaff(PDO $db, string $orderId, array $details, array $config, array $actor, bool $notifyCustomer): array
    {
        $changedBy = trim((string)($actor['display_name'] ?? $actor['username'] ?? 'Administrator')) ?: 'Administrator';
        return self::request($db, ['id' => trim($orderId)], $details, $config, 'staff', $changedBy, $notifyCustomer);
    }

    public static function normalizeIban(string $iban): string
    {
        return strtoupper((string)preg_replace('/\s+/u', '', trim($iban)));
    }

    public static function isValidIban(string $iban): bool
    {
        $iban = self::normalizeIban($iban);
        $length = strlen($iban);
        if ($length < 15 || $length > 34 || !preg_match('/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/', $iban)) return false;
        if (str_starts_with($iban, 'RO') && $length !== 24) return false;
        $rearranged = substr($iban, 4) . substr($iban, 0, 4);
        $remainder = 0;
        foreach (str_split($rearranged) as $character) {
            $digits = ctype_alpha($character) ? (string)(ord($character) - 55) : $character;
            foreach (str_split($digits) as $digit) $remainder = ($remainder * 10 + (int)$digit) % 97;
        }
        return $remainder === 1;
    }

    public static function maskIban(string $iban): string
    {
        $iban = self::normalizeIban($iban);
        if (strlen($iban) < 8) return $iban;
        return substr($iban, 0, 4) . str_repeat('•', max(4, strlen($iban) - 8)) . substr($iban, -4);
    }

    private static function request(PDO $db, array $access, array $details, array $config, string $source, string $changedBy, bool $notifyCustomer): array
    {
        $reason = trim((string)preg_replace('/\s+/u', ' ', (string)($details['reason'] ?? '')));
        if (mb_strlen($reason, 'UTF-8') < 3) throw new InvalidArgumentException('Scrie motivul returului, de cel puțin 3 caractere.');
        $reason = mb_substr($reason, 0, 1000);
        $holder = trim((string)preg_replace('/\s+/u', ' ', (string)($details['bank_account_holder'] ?? '')));
        if (mb_strlen($holder, 'UTF-8') < 3) throw new InvalidArgumentException('Completează numele titularului contului bancar.');
        $holder = mb_substr($holder, 0, 180);
        $iban = self::normalizeIban((string)($details['bank_iban'] ?? ''));
        if (!self::isValidIban($iban)) throw new InvalidArgumentException('Introdu un IBAN valid pentru rambursare.');

        $historyId = '';
        $orderId = '';
        $duplicate = false;
        $db->beginTransaction();
        try {
            $order = self::findOrderForUpdate($db, $access, $source === 'customer');
            if (!$order) throw new InvalidArgumentException($source === 'customer' ? 'Linkul sau datele comenzii nu sunt valide.' : 'Comanda nu există.');
            $orderId = (string)$order['id'];
            $currentStatus = (string)$order['status'];
            if ($currentStatus === 'return_requested') {
                $duplicate = true;
                $db->commit();
                return self::result($db, $orderId, true, []);
            }
            if ($source === 'customer' && !self::canRequestStatus($currentStatus)) {
                throw new InvalidArgumentException('Returul poate fi solicitat numai după ce această comandă este livrată.');
            }

            $costStmt = $db->prepare('SELECT return_cost FROM shop_shipping_methods WHERE id = ? LIMIT 1');
            $costStmt->execute([(string)($order['shipping_method_id'] ?? '')]);
            $returnCost = max(0.0, round((float)($costStmt->fetchColumn() ?: 0), 2));
            $refundAmount = max(0.0, round((float)($order['total'] ?? 0) - $returnCost, 2));
            $note = 'Retur ' . ($source === 'customer' ? 'solicitat de client' : 'înregistrat manual') . ': ' . $reason;
            $adminNotes = trim((string)($order['admin_notes'] ?? ''));
            $adminNotes = trim($adminNotes . ($adminNotes !== '' ? "\n" : '') . $note);
            $update = $db->prepare(
                "UPDATE shop_orders
                 SET status = 'return_requested', return_reason = ?, return_bank_iban = ?, return_bank_account_holder = ?,
                     return_shipping_cost = ?, return_refund_amount = ?, return_requested_at = CURRENT_TIMESTAMP,
                     return_request_source = ?, return_request_email_sent_at = NULL, return_request_email_error = NULL,
                     admin_notes = ?
                 WHERE id = ?"
            );
            $update->execute([$reason, $iban, $holder, $returnCost, $refundAmount, $source, mb_substr($adminNotes, 0, 5000), $orderId]);
            $historyId = self::recordHistory($db, $orderId, $currentStatus, $changedBy, $notifyCustomer);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }

        $email = [];
        if ($notifyCustomer) {
            $saved = self::findOrder($db, $orderId);
            $email = $saved ? gtSendOrderReturnRequestEmail($saved, $config) : ['sent' => false, 'error' => 'Comanda nu a putut fi recitită pentru e-mail.'];
            self::recordEmail($db, $orderId, $historyId, $email);
        }
        return self::result($db, $orderId, $duplicate, $email);
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
                if (!preg_match('/^[a-f0-9]{32,64}$/', $token)) throw new InvalidArgumentException('Linkul de retur nu este valid.');
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

    private static function recordHistory(PDO $db, string $orderId, string $fromStatus, string $changedBy, bool $notifyCustomer): string
    {
        $id = self::uuid();
        $emailStatus = $notifyCustomer ? 'pending' : 'not_requested';
        $stmt = $db->prepare("INSERT INTO shop_order_status_history (id, order_id, from_status, to_status, changed_by, customer_notified, email_status) VALUES (?, ?, ?, 'return_requested', ?, 0, ?)");
        $stmt->execute([$id, $orderId, $fromStatus, mb_substr($changedBy, 0, 180), $emailStatus]);
        return $id;
    }

    private static function recordEmail(PDO $db, string $orderId, string $historyId, array $result): void
    {
        $sent = !empty($result['sent']);
        $error = $sent ? null : mb_substr((string)($result['error'] ?? 'Trimiterea e-mailului a eșuat.'), 0, 500);
        $db->prepare('UPDATE shop_orders SET return_request_email_sent_at = ?, return_request_email_error = ? WHERE id = ?')
            ->execute([$sent ? date('Y-m-d H:i:s') : null, $error, $orderId]);
        if ($historyId !== '') {
            $db->prepare('UPDATE shop_order_status_history SET customer_notified = ?, email_status = ?, email_error = ? WHERE id = ?')
                ->execute([$sent ? 1 : 0, $sent ? 'sent' : 'failed', $error, $historyId]);
        }
    }

    private static function result(PDO $db, string $orderId, bool $duplicate, array $email): array
    {
        return ['order' => self::findOrder($db, $orderId), 'requested' => true, 'duplicate' => $duplicate, 'email_notification' => $email];
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
