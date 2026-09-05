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

    /**
     * Public return eligibility is deliberately stricter than the internal
     * workflow. A customer can open a new request only from Delivered and for
     * 30 calendar days for B2C (14 statutory + 16 commercial extension) or
     * 14 calendar days for the voluntary B2B return policy.
     */
    public static function eligibility(PDO $db, array $order): array
    {
        $completedAt = self::completedAt($db, (string)($order['id'] ?? ''), $order);
        $policyType = (($order['customer_type'] ?? 'individual') === 'company') ? 'b2b_commercial' : 'b2c_withdrawal';
        $returnWindowDays = $policyType === 'b2c_withdrawal' ? 30 : 14;
        // Ziua primirii nu scurtează termenul: cererea rămâne disponibilă până
        // la sfârșitul ultimei zile calendaristice oferite de politica aplicabilă.
        $deadline = $completedAt ? $completedAt->modify('+' . $returnWindowDays . ' days')->setTime(23, 59, 59) : null;
        $statutoryDeadline = $policyType === 'b2c_withdrawal' && $completedAt
            ? $completedAt->modify('+14 days')->setTime(23, 59, 59)
            : null;
        $now = new DateTimeImmutable('now', new DateTimeZone('Europe/Bucharest'));
        $statusAllowed = self::canRequestStatus((string)($order['status'] ?? ''));
        $withinDeadline = $deadline !== null && $now <= $deadline;
        $reason = '';
        if (!$statusAllowed) $reason = 'Returul poate fi solicitat numai pentru o comandă livrată care nu este deja anulată, rambursată sau într-un flux de retur.';
        elseif (!$completedAt) $reason = 'Data livrării nu poate fi verificată automat. Contactează-ne pentru verificare.';
        elseif (!$withinDeadline) $reason = 'Termenul de ' . $returnWindowDays . ' zile calendaristice pentru această solicitare a expirat.';
        return [
            'eligible' => $statusAllowed && $withinDeadline,
            'policy_type' => $policyType,
            'completed_at' => $completedAt?->format('Y-m-d H:i:s'),
            'deadline_at' => $deadline?->format('Y-m-d H:i:s'),
            'statutory_deadline_at' => $statutoryDeadline?->format('Y-m-d H:i:s'),
            'return_window_days' => $returnWindowDays,
            'is_statutory_window' => $statutoryDeadline !== null && $now <= $statutoryDeadline,
            'initial_shipping_refundable' => $statutoryDeadline !== null && $now <= $statutoryDeadline,
            'days_remaining' => $deadline && $now <= $deadline ? max(0, (int)$now->diff($deadline)->format('%a') + ($now->format('Y-m-d') === $deadline->format('Y-m-d') ? 0 : 1)) : 0,
            'reason' => $reason,
        ];
    }

    /** First step of the standalone public form; no private data is returned unless every identifier matches. */
    public static function validatePublicOrder(PDO $db, array $access, array $config): array
    {
        $order = self::findOrderForUpdate($db, $access, true, false);
        if (!$order) throw new InvalidArgumentException('Datele introduse nu identifică o comandă eligibilă. Verifică numărul comenzii și adresa de e-mail folosită la comandă.');
        $eligibility = self::eligibility($db, $order);
        $items = self::orderItems($db, (string)$order['id']);
        $costStmt = $db->prepare('SELECT return_cost FROM shop_shipping_methods WHERE id = ? LIMIT 1');
        $costStmt->execute([(string)($order['shipping_method_id'] ?? '')]);
        return [
            'verified' => true,
            'order' => [
                'order_number' => (string)$order['order_number'],
                'customer_type' => (($order['customer_type'] ?? 'individual') === 'company') ? 'company' : 'individual',
                'customer_display_name' => self::displayName($order),
                'currency' => (string)($order['currency'] ?? 'RON'),
                'return_cost' => max(0.0, round((float)($costStmt->fetchColumn() ?: 0), 2)),
                'initial_shipping_cost' => max(0.0, round((float)($order['shipping_cost'] ?? 0), 2)),
                'initial_shipping_refundable' => !empty($eligibility['initial_shipping_refundable']),
                'items' => array_map(static fn(array $item): array => [
                    'order_item_id' => (string)$item['id'],
                    'product_name' => (string)$item['product_name'],
                    'product_sku' => (string)($item['product_sku'] ?? ''),
                    'quantity' => (float)$item['quantity'],
                    'unit_refund_value' => (float)$item['unit_refund_value'],
                    'line_refund_value' => (float)$item['line_refund_value'],
                ], $items),
            ],
            'eligibility' => $eligibility,
        ];
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

    public static function reviewByStaff(PDO $db, string $orderId, array $decisions, array $actor): array
    {
        if (!$decisions) throw new InvalidArgumentException('Alege pentru fiecare produs dacă este acceptat sau refuzat la retur.');
        $changedBy = mb_substr(trim((string)($actor['display_name'] ?? $actor['username'] ?? 'Administrator')), 0, 180);
        $db->beginTransaction();
        try {
            $orderStmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ?' . (self::isSqlite($db) ? '' : ' FOR UPDATE'));
            $orderStmt->execute([$orderId]);
            $order = $orderStmt->fetch();
            if (!$order || !in_array((string)$order['status'], ['return_requested', 'return_refused'], true)) {
                throw new InvalidArgumentException('Produsele pot fi evaluate numai înainte de confirmarea returului.');
            }
            $itemsStmt = $db->prepare('SELECT * FROM shop_order_return_items WHERE order_id = ? ORDER BY created_at, id' . (self::isSqlite($db) ? '' : ' FOR UPDATE'));
            $itemsStmt->execute([$orderId]);
            $items = $itemsStmt->fetchAll();
            $byId = [];
            foreach ($items as $item) $byId[(string)$item['order_item_id']] = $item;
            if (!$items) throw new InvalidArgumentException('Solicitarea nu conține produse pentru evaluare.');
            $seen = [];
            $update = $db->prepare('UPDATE shop_order_return_items SET decision_status = ?, accepted_quantity = ?, decision_reason = ?, decided_at = CURRENT_TIMESTAMP, decided_by = ? WHERE order_id = ? AND order_item_id = ?');
            foreach ($decisions as $decision) {
                $itemId = trim((string)($decision['order_item_id'] ?? ''));
                $status = trim((string)($decision['decision_status'] ?? ''));
                if (!isset($byId[$itemId]) || isset($seen[$itemId]) || !in_array($status, ['accepted', 'refused'], true)) {
                    throw new InvalidArgumentException('Decizia pentru unul dintre produse nu este validă.');
                }
                $seen[$itemId] = true;
                $accepted = $status === 'accepted' ? round((float)($decision['accepted_quantity'] ?? $byId[$itemId]['requested_quantity']), 4) : 0.0;
                if ($status === 'accepted' && ($accepted <= 0 || $accepted - (float)$byId[$itemId]['requested_quantity'] > 0.00005)) {
                    throw new InvalidArgumentException('Cantitatea acceptată trebuie să fie între 1 și cantitatea solicitată.');
                }
                $reason = mb_substr(trim((string)($decision['decision_reason'] ?? '')), 0, 500);
                if ($status === 'refused' && mb_strlen($reason, 'UTF-8') < 3) throw new InvalidArgumentException('Scrie motivul refuzului pentru produsul respins.');
                $update->execute([$status, $accepted, $reason ?: null, $changedBy, $orderId, $itemId]);
            }
            if (count($seen) !== count($items)) throw new InvalidArgumentException('Evaluează toate produsele solicitate înainte de confirmare.');

            $acceptedStmt = $db->prepare("SELECT * FROM shop_order_return_items WHERE order_id = ? AND decision_status = 'accepted' AND accepted_quantity > 0");
            $acceptedStmt->execute([$orderId]);
            $acceptedItems = $acceptedStmt->fetchAll();
            $itemsGross = round(array_reduce($acceptedItems, static fn(float $sum, array $item): float => $sum + (float)$item['unit_refund_value'] * (float)$item['accepted_quantity'], 0.0), 2);
            $allOrderItems = self::orderItems($db, $orderId);
            $acceptedById = [];
            foreach ($acceptedItems as $item) $acceptedById[(string)$item['order_item_id']] = (float)$item['accepted_quantity'];
            $isFull = count($acceptedById) === count($allOrderItems);
            foreach ($allOrderItems as $item) if (!isset($acceptedById[(string)$item['id']]) || abs($acceptedById[(string)$item['id']] - (float)$item['quantity']) > 0.00005) { $isFull = false; break; }
            // Livrarea inițială se rambursează doar dacă solicitarea inițială
            // a fost integrală și a fost depusă în fereastra legală B2C.
            $deliveryRefund = $isFull ? max(0.0, round((float)($order['return_delivery_refund'] ?? 0), 2)) : 0.0;
            $returnCost = max(0.0, round((float)($order['return_shipping_cost'] ?? 0), 2));
            $refund = max(0.0, round($itemsGross + $deliveryRefund - $returnCost, 2));
            $db->prepare('UPDATE shop_orders SET return_items_gross = ?, return_delivery_refund = ?, return_is_full = ?, return_refund_amount = ? WHERE id = ?')
                ->execute([$itemsGross, $deliveryRefund, $isFull ? 1 : 0, $refund, $orderId]);
            $db->commit();
            return ['reviewed' => true, 'accepted_count' => count($acceptedItems), 'return_items_gross' => $itemsGross, 'return_delivery_refund' => $deliveryRefund, 'return_refund_amount' => $refund];
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
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
        if ($source === 'customer' && empty($details['refund_consent'])) throw new InvalidArgumentException('Confirmă acordul pentru rambursarea în IBAN-ul indicat.');

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
            $eligibility = self::eligibility($db, $order);
            if ($source === 'customer' && empty($eligibility['eligible'])) {
                throw new InvalidArgumentException((string)($eligibility['reason'] ?? 'Comanda nu este eligibilă pentru retur.'));
            }

            $selection = self::normalizeSelection($db, $order, (array)($details['items'] ?? []));

            $costStmt = $db->prepare('SELECT return_cost FROM shop_shipping_methods WHERE id = ? LIMIT 1');
            $costStmt->execute([(string)($order['shipping_method_id'] ?? '')]);
            $returnCost = max(0.0, round((float)($costStmt->fetchColumn() ?: 0), 2));
            $itemsGross = (float)$selection['items_gross'];
            $deliveryRefund = !empty($selection['is_full']) && !empty($eligibility['initial_shipping_refundable'])
                ? max(0.0, round((float)($order['shipping_cost'] ?? 0), 2))
                : 0.0;
            $refundAmount = max(0.0, round($itemsGross + $deliveryRefund - $returnCost, 2));
            $withdrawalStatement = null;
            $withdrawalSubmittedAt = null;
            if ($source === 'customer' && (string)$eligibility['policy_type'] === 'b2c_withdrawal') {
                $withdrawalStatement = mb_substr(trim((string)($details['withdrawal_statement'] ?? ('Mă retrag din contractul aferent comenzii ' . (string)$order['order_number'] . '.'))), 0, 2000);
                $withdrawalSubmittedAt = (new DateTimeImmutable('now', new DateTimeZone('Europe/Bucharest')))->format('Y-m-d H:i:s');
            }
            $note = 'Retur ' . ($source === 'customer' ? 'solicitat de client' : 'înregistrat manual') . ': ' . $reason;
            $adminNotes = trim((string)($order['admin_notes'] ?? ''));
            $adminNotes = trim($adminNotes . ($adminNotes !== '' ? "\n" : '') . $note);
            $update = $db->prepare(
                "UPDATE shop_orders
                 SET status = 'return_requested', return_reason = ?, return_bank_iban = ?, return_bank_account_holder = ?,
                     return_shipping_cost = ?, return_refund_amount = ?, return_requested_at = CURRENT_TIMESTAMP,
                     return_request_source = ?, return_request_email_sent_at = NULL, return_request_email_error = NULL,
                     return_policy_type = ?, return_deadline_at = ?, return_items_gross = ?, return_delivery_refund = ?, return_is_full = ?,
                     withdrawal_statement = ?, withdrawal_submitted_at = ?, withdrawal_confirmation_email_sent_at = NULL,
                     admin_notes = ?
                 WHERE id = ?"
            );
            $update->execute([$reason, $iban, $holder, $returnCost, $refundAmount, $source,
                (string)$eligibility['policy_type'], $eligibility['deadline_at'], $itemsGross, $deliveryRefund, !empty($selection['is_full']) ? 1 : 0,
                $withdrawalStatement, $withdrawalSubmittedAt,
                mb_substr($adminNotes, 0, 5000), $orderId]);
            self::saveSelection($db, $orderId, $selection['items']);
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

    private static function findOrderForUpdate(PDO $db, array $access, bool $public, bool $lock = true): ?array
    {
        $suffix = (!$lock || self::isSqlite($db)) ? '' : ' FOR UPDATE';
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

    private static function displayName(array $order): string
    {
        return (($order['customer_type'] ?? 'individual') === 'company' && trim((string)($order['company_name'] ?? '')) !== '')
            ? trim((string)$order['company_name']) : trim((string)($order['customer_name'] ?? ''));
    }

    private static function completedAt(PDO $db, string $orderId, array $fallback): ?DateTimeImmutable
    {
        if ($orderId !== '') {
            $stmt = $db->prepare("SELECT created_at FROM shop_order_status_history WHERE order_id = ? AND to_status = 'completed' ORDER BY created_at ASC LIMIT 1");
            $stmt->execute([$orderId]);
            $value = trim((string)($stmt->fetchColumn() ?: ''));
            if ($value !== '') return new DateTimeImmutable($value, new DateTimeZone('Europe/Bucharest'));
        }
        $value = trim((string)($fallback['updated_at'] ?? $fallback['created_at'] ?? ''));
        return $value !== '' && self::canRequestStatus((string)($fallback['status'] ?? ''))
            ? new DateTimeImmutable($value, new DateTimeZone('Europe/Bucharest')) : null;
    }

    private static function orderItems(PDO $db, string $orderId): array
    {
        $stmt = $db->prepare('SELECT * FROM shop_order_items WHERE order_id = ? ORDER BY id ASC');
        $stmt->execute([$orderId]);
        return array_map(static function (array $item): array {
            $quantity = max(0.0001, (float)($item['quantity'] ?? 0));
            $discount = max(0.0, (float)($item['discount_total'] ?? 0));
            $discountedGross = max(0.0, (float)($item['discounted_line_total'] ?? 0));
            $gross = $discount > 0 && $discountedGross > 0
                ? $discountedGross
                : max(0.0, (float)($item['line_total'] ?? 0));
            $item['unit_refund_value'] = round($gross / $quantity, 4);
            $item['line_refund_value'] = round($gross, 2);
            return $item;
        }, $stmt->fetchAll());
    }

    private static function normalizeSelection(PDO $db, array $order, array $requested): array
    {
        $orderItems = self::orderItems($db, (string)$order['id']);
        if (!$orderItems) throw new InvalidArgumentException('Comanda nu conține produse care pot fi returnate.');
        $byId = [];
        foreach ($orderItems as $item) $byId[(string)$item['id']] = $item;
        if (!$requested) $requested = array_map(static fn(array $item): array => ['order_item_id' => $item['id'], 'quantity' => $item['quantity']], $orderItems);
        $selected = [];
        foreach ($requested as $entry) {
            $id = trim((string)($entry['order_item_id'] ?? $entry['id'] ?? ''));
            $quantity = round((float)($entry['quantity'] ?? 0), 4);
            if ($id === '' || $quantity <= 0 || !isset($byId[$id])) throw new InvalidArgumentException('Selecția produselor pentru retur nu este validă.');
            $source = $byId[$id];
            if ($quantity - (float)$source['quantity'] > 0.00005 || isset($selected[$id])) throw new InvalidArgumentException('Cantitatea solicitată la retur depășește cantitatea comandată.');
            $unit = (float)$source['unit_refund_value'];
            $selected[$id] = [
                'id' => self::uuid(), 'order_item_id' => $id, 'product_id' => $source['product_id'] ?? null,
                'product_name' => (string)$source['product_name'], 'product_sku' => (string)($source['product_sku'] ?? ''),
                'requested_quantity' => $quantity, 'unit_refund_value' => $unit,
                'line_refund_value' => round($unit * $quantity, 2),
            ];
        }
        if (!$selected) throw new InvalidArgumentException('Selectează cel puțin un produs pentru retur.');
        $isFull = count($selected) === count($orderItems);
        foreach ($orderItems as $item) {
            $id = (string)$item['id'];
            if (!isset($selected[$id]) || abs((float)$selected[$id]['requested_quantity'] - (float)$item['quantity']) > 0.00005) { $isFull = false; break; }
        }
        return ['items' => array_values($selected), 'items_gross' => round(array_sum(array_column($selected, 'line_refund_value')), 2), 'is_full' => $isFull];
    }

    private static function saveSelection(PDO $db, string $orderId, array $items): void
    {
        $db->prepare('DELETE FROM shop_order_return_items WHERE order_id = ?')->execute([$orderId]);
        $insert = $db->prepare('INSERT INTO shop_order_return_items (id, order_id, order_item_id, product_id, product_name, product_sku, requested_quantity, unit_refund_value, line_refund_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($items as $item) $insert->execute([$item['id'], $orderId, $item['order_item_id'], $item['product_id'], $item['product_name'], $item['product_sku'], $item['requested_quantity'], $item['unit_refund_value'], $item['line_refund_value']]);
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
        $sentAt = $sent ? date('Y-m-d H:i:s') : null;
        $db->prepare('UPDATE shop_orders SET return_request_email_sent_at = ?, return_request_email_error = ?, withdrawal_confirmation_email_sent_at = CASE WHEN withdrawal_statement IS NOT NULL THEN ? ELSE withdrawal_confirmation_email_sent_at END WHERE id = ?')
            ->execute([$sentAt, $error, $sentAt, $orderId]);
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
