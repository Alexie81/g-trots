<?php
declare(strict_types=1);

$sentEmails = [];
function gtSendOrderReturnRequestEmail(array $order, array $config): array
{
    global $sentEmails;
    $sentEmails[] = $order;
    return ['sent' => true, 'recipient' => (string)$order['customer_email']];
}

require_once __DIR__ . '/../order-return.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function expectFailure(callable $callback, string $fragment): void
{
    try {
        $callback();
    } catch (InvalidArgumentException $error) {
        check(str_contains($error->getMessage(), $fragment), 'Mesaj neașteptat: ' . $error->getMessage());
        return;
    }
    throw new RuntimeException('Operația trebuia refuzată.');
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('CREATE TABLE shop_shipping_methods (id TEXT PRIMARY KEY, return_cost REAL NOT NULL DEFAULT 0)');
$db->exec('CREATE TABLE shop_orders (
    id TEXT PRIMARY KEY, order_number TEXT, status TEXT, customer_email TEXT, tracking_token TEXT,
    shipping_method_id TEXT, total REAL, currency TEXT, admin_notes TEXT,
    return_reason TEXT, return_bank_iban TEXT, return_bank_account_holder TEXT,
    return_shipping_cost REAL, return_refund_amount REAL, return_requested_at TEXT,
    return_request_source TEXT, return_request_email_sent_at TEXT, return_request_email_error TEXT
)');
$db->exec('CREATE TABLE shop_order_status_history (
    id TEXT PRIMARY KEY, order_id TEXT, from_status TEXT, to_status TEXT, changed_by TEXT,
    customer_notified INTEGER, email_status TEXT, email_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
)');
$db->exec("INSERT INTO shop_shipping_methods (id, return_cost) VALUES ('courier', 25.50)");
$insert = $db->prepare('INSERT INTO shop_orders (id, order_number, status, customer_email, tracking_token, shipping_method_id, total, currency, admin_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
$insert->execute(['customer-order', 'GT-RET-1', 'completed', 'client@example.com', str_repeat('a', 32), 'courier', 500, 'RON', '']);
$insert->execute(['staff-order', 'GT-RET-2', 'completed', 'staff-client@example.com', str_repeat('b', 32), 'courier', 100, 'RON', '']);
$insert->execute(['early-order', 'GT-RET-3', 'shipped', 'early@example.com', str_repeat('c', 32), 'courier', 80, 'RON', '']);

$details = [
    'reason' => 'Produsul nu corespunde nevoilor mele',
    'bank_iban' => 'RO49AAAA1B31007593840000',
    'bank_account_holder' => 'Ion Popescu',
];
$result = GtrotsOrderReturnRequest::requestByCustomer($db, ['token' => str_repeat('a', 32)], $details, []);
check(($result['requested'] ?? false) === true, 'Solicitarea clientului nu a fost confirmată.');
check(count($sentEmails) === 1, 'E-mailul automat al clientului nu a fost trimis exact o dată.');
$saved = $db->query("SELECT * FROM shop_orders WHERE id = 'customer-order'")->fetch();
check($saved['status'] === 'return_requested', 'Statusul clientului nu a fost actualizat.');
check(abs((float)$saved['return_shipping_cost'] - 25.50) < 0.001, 'Costul returului nu a fost salvat ca instantaneu.');
check(abs((float)$saved['return_refund_amount'] - 474.50) < 0.001, 'Estimarea rambursării nu este corectă.');
check($saved['return_request_source'] === 'customer', 'Sursa solicitării clientului lipsește.');
$history = $db->query("SELECT * FROM shop_order_status_history WHERE order_id = 'customer-order'")->fetch();
check((int)$history['customer_notified'] === 1 && $history['email_status'] === 'sent', 'Istoricul nu confirmă e-mailul clientului.');

GtrotsOrderReturnRequest::requestByStaff($db, 'staff-order', $details, [], ['display_name' => 'Operator Test'], false);
check(count($sentEmails) === 1, 'Solicitarea manuală fără notificare a trimis e-mail.');
$staffHistory = $db->query("SELECT * FROM shop_order_status_history WHERE order_id = 'staff-order'")->fetch();
check($staffHistory['changed_by'] === 'Operator Test' && $staffHistory['email_status'] === 'not_requested', 'Solicitarea manuală nu a fost jurnalizată corect.');

expectFailure(fn() => GtrotsOrderReturnRequest::requestByCustomer($db, ['token' => str_repeat('c', 32)], $details, []), 'numai după');
$staffEarly = GtrotsOrderReturnRequest::requestByStaff($db, 'early-order', $details, [], ['display_name' => 'Operator Test'], false);
check(($staffEarly['order']['status'] ?? '') === 'return_requested', 'Operatorul trebuie să poată porni returul manual din orice status.');
$invalid = $details;
$invalid['bank_iban'] = 'RO00INVALID';
$insert->execute(['invalid-order', 'GT-RET-4', 'processing', 'invalid@example.com', str_repeat('d', 32), 'courier', 80, 'RON', '']);
expectFailure(fn() => GtrotsOrderReturnRequest::requestByStaff($db, 'invalid-order', $invalid, [], [], false), 'IBAN valid');

check(GtrotsOrderReturnRequest::maskIban('RO49AAAA1B31007593840000') === 'RO49••••••••••••••••0000', 'Mascarea IBAN-ului nu este corectă.');
echo "order_return_request_test: OK\n";
