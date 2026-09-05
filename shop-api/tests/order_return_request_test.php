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
    customer_name TEXT, customer_type TEXT, company_name TEXT, shipping_method_id TEXT, shipping_cost REAL, total REAL, currency TEXT, admin_notes TEXT, created_at TEXT, updated_at TEXT,
    return_reason TEXT, return_bank_iban TEXT, return_bank_account_holder TEXT,
    return_shipping_cost REAL, return_refund_amount REAL, return_requested_at TEXT,
    return_request_source TEXT, return_request_email_sent_at TEXT, return_request_email_error TEXT,
    return_policy_type TEXT, return_deadline_at TEXT, return_items_gross REAL, return_delivery_refund REAL, return_is_full INTEGER,
    withdrawal_statement TEXT, withdrawal_submitted_at TEXT, withdrawal_confirmation_email_sent_at TEXT
)');
$db->exec('CREATE TABLE shop_order_status_history (
    id TEXT PRIMARY KEY, order_id TEXT, from_status TEXT, to_status TEXT, changed_by TEXT,
    customer_notified INTEGER, email_status TEXT, email_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
)');
$db->exec('CREATE TABLE shop_order_items (id TEXT PRIMARY KEY, order_id TEXT, product_id TEXT, product_name TEXT, product_sku TEXT, quantity REAL, unit_price REAL, line_total REAL, discounted_line_total REAL)');
$db->exec('CREATE TABLE shop_order_return_items (id TEXT PRIMARY KEY, order_id TEXT, order_item_id TEXT, product_id TEXT, product_name TEXT, product_sku TEXT, requested_quantity REAL, decision_status TEXT DEFAULT "pending", accepted_quantity REAL, decision_reason TEXT, decided_at TEXT, decided_by TEXT, unit_refund_value REAL, line_refund_value REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
$db->exec("INSERT INTO shop_shipping_methods (id, return_cost) VALUES ('courier', 25.50)");
$insert = $db->prepare('INSERT INTO shop_orders (id, order_number, status, customer_email, tracking_token, customer_name, customer_type, shipping_method_id, shipping_cost, total, currency, admin_notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');
$insert->execute(['customer-order', 'GT-RET-1', 'completed', 'client@example.com', str_repeat('a', 32), 'Ion Popescu', 'individual', 'courier', 20, 500, 'RON', '']);
$insert->execute(['staff-order', 'GT-RET-2', 'completed', 'staff-client@example.com', str_repeat('b', 32), 'Client Staff', 'individual', 'courier', 10, 100, 'RON', '']);
$insert->execute(['early-order', 'GT-RET-3', 'shipped', 'early@example.com', str_repeat('c', 32), 'Client Early', 'individual', 'courier', 10, 80, 'RON', '']);
$db->exec("INSERT INTO shop_order_items VALUES ('item-1','customer-order','p1','Produs unu','SKU1',2,150,300,300),('item-1b','customer-order','p1b','Produs doi din retur','SKU1B',1,180,180,180),('item-2','staff-order','p2','Produs doi','SKU2',1,90,90,90),('item-3','early-order','p3','Produs trei','SKU3',1,70,70,70)");
$db->exec("INSERT INTO shop_order_status_history (id,order_id,from_status,to_status,changed_by,customer_notified,email_status,created_at) VALUES ('completed-1','customer-order','shipped','completed','Sistem',0,'not_requested',datetime('now','-2 days')),('completed-2','staff-order','shipped','completed','Sistem',0,'not_requested',datetime('now','-2 days'))");

$details = [
    'reason' => 'Produsul nu corespunde nevoilor mele',
    'bank_iban' => 'RO49AAAA1B31007593840000',
    'bank_account_holder' => 'Ion Popescu',
    'refund_consent' => true,
    'items' => [['order_item_id' => 'item-1', 'quantity' => 1], ['order_item_id' => 'item-1b', 'quantity' => 1]],
];
$eligibility = GtrotsOrderReturnRequest::eligibility($db, $db->query("SELECT * FROM shop_orders WHERE id='customer-order'")->fetch());
check(!empty($eligibility['eligible']) && str_ends_with((string)$eligibility['deadline_at'], '23:59:59'), 'Termenul public trebuie să includă integral ultima zi calendaristică.');
check((int)$eligibility['return_window_days'] === 30 && !empty($eligibility['is_statutory_window']), 'PF trebuie să primească 30 de zile, cu evidențiere separată a ferestrei legale de 14 zile.');
$verified = GtrotsOrderReturnRequest::validatePublicOrder($db, ['order_number' => 'GT-RET-1', 'email' => 'client@example.com'], []);
check(!empty($verified['verified']) && count($verified['order']['items']) === 2 && (float)$verified['order']['initial_shipping_cost'] === 20.0, 'Primul pas public trebuie să valideze identitatea și să returneze produsele plus livrarea inițială.');
expectFailure(fn() => GtrotsOrderReturnRequest::validatePublicOrder($db, ['order_number' => 'GT-RET-1', 'email' => 'gresit@example.com'], []), 'nu identifică');
$legacyIgnored = GtrotsOrderReturnRequest::validatePublicOrder($db, ['order_number' => 'GT-RET-1', 'email' => 'client@example.com', 'customer_name' => 'Alt Client', 'invoice_number' => 'GRESIT', 'no_invoice' => true], []);
check(!empty($legacyIgnored['verified']), 'Validarea publică trebuie să folosească exclusiv numărul comenzii și e-mailul, inclusiv pentru clienți vechi care trimit câmpuri suplimentare.');
$result = GtrotsOrderReturnRequest::requestByCustomer($db, ['token' => str_repeat('a', 32)], $details, []);
check(($result['requested'] ?? false) === true, 'Solicitarea clientului nu a fost confirmată.');
check(count($sentEmails) === 1, 'E-mailul automat al clientului nu a fost trimis exact o dată.');
$saved = $db->query("SELECT * FROM shop_orders WHERE id = 'customer-order'")->fetch();
check($saved['status'] === 'return_requested', 'Statusul clientului nu a fost actualizat.');
check(abs((float)$saved['return_shipping_cost'] - 25.50) < 0.001, 'Costul returului nu a fost salvat ca instantaneu.');
check(abs((float)$saved['return_refund_amount'] - 304.50) < 0.001, 'Estimarea rambursării parțiale nu este corectă.');
check($saved['return_request_source'] === 'customer', 'Sursa solicitării clientului lipsește.');
check(str_contains((string)$saved['withdrawal_statement'], 'Mă retrag din contract') && !empty($saved['withdrawal_submitted_at']), 'Conținutul, data și ora retragerii PF trebuie păstrate durabil.');
$history = $db->query("SELECT * FROM shop_order_status_history WHERE order_id = 'customer-order' AND to_status = 'return_requested'")->fetch();
check((int)$history['customer_notified'] === 1 && $history['email_status'] === 'sent', 'Istoricul nu confirmă e-mailul clientului.');

$review = GtrotsOrderReturnRequest::reviewByStaff($db, 'customer-order', [
    ['order_item_id' => 'item-1', 'decision_status' => 'accepted', 'accepted_quantity' => 1],
    ['order_item_id' => 'item-1b', 'decision_status' => 'refused', 'accepted_quantity' => 0, 'decision_reason' => 'Produsul prezintă urme de utilizare.'],
], ['display_name' => 'Operator retur']);
check((int)$review['accepted_count'] === 1 && abs((float)$review['return_items_gross'] - 150.0) < 0.001, 'Evaluarea trebuie să accepte numai produsul și cantitatea aprobate.');
check(abs((float)$review['return_refund_amount'] - 124.50) < 0.001, 'Rambursarea trebuie recalculată după decizia individuală și costul de retur.');
$accepted = $db->query("SELECT decision_status, accepted_quantity, decided_by FROM shop_order_return_items WHERE order_id='customer-order' AND order_item_id='item-1'")->fetch();
$refused = $db->query("SELECT decision_status, accepted_quantity, decision_reason FROM shop_order_return_items WHERE order_id='customer-order' AND order_item_id='item-1b'")->fetch();
check($accepted['decision_status'] === 'accepted' && (float)$accepted['accepted_quantity'] === 1.0 && $accepted['decided_by'] === 'Operator retur', 'Produsul acceptat trebuie auditat complet.');
check($refused['decision_status'] === 'refused' && (float)$refused['accepted_quantity'] === 0.0 && str_contains($refused['decision_reason'], 'urme'), 'Produsul refuzat și motivul său trebuie păstrate separat.');

$staffDetails = $details; $staffDetails['items'] = [['order_item_id' => 'item-2', 'quantity' => 1]];
GtrotsOrderReturnRequest::requestByStaff($db, 'staff-order', $staffDetails, [], ['display_name' => 'Operator Test'], false);
check(count($sentEmails) === 1, 'Solicitarea manuală fără notificare a trimis e-mail.');
$staffHistory = $db->query("SELECT * FROM shop_order_status_history WHERE order_id = 'staff-order' AND to_status = 'return_requested'")->fetch();
check($staffHistory['changed_by'] === 'Operator Test' && $staffHistory['email_status'] === 'not_requested', 'Solicitarea manuală nu a fost jurnalizată corect.');

expectFailure(fn() => GtrotsOrderReturnRequest::requestByCustomer($db, ['token' => str_repeat('c', 32)], $details, []), 'numai după');
$earlyDetails = $details; $earlyDetails['items'] = [['order_item_id' => 'item-3', 'quantity' => 1]];
$staffEarly = GtrotsOrderReturnRequest::requestByStaff($db, 'early-order', $earlyDetails, [], ['display_name' => 'Operator Test'], false);
check(($staffEarly['order']['status'] ?? '') === 'return_requested', 'Operatorul trebuie să poată porni returul manual din orice status.');
$invalid = $details;
$invalid['bank_iban'] = 'RO00INVALID';
$insert->execute(['invalid-order', 'GT-RET-4', 'processing', 'invalid@example.com', str_repeat('d', 32), 'Client Invalid', 'individual', 'courier', 10, 80, 'RON', '']);
$db->exec("INSERT INTO shop_order_items VALUES ('item-4','invalid-order','p4','Produs patru','SKU4',1,70,70,70)");
$invalid['items'] = [['order_item_id' => 'item-4', 'quantity' => 1]];
expectFailure(fn() => GtrotsOrderReturnRequest::requestByStaff($db, 'invalid-order', $invalid, [], [], false), 'IBAN valid');

$insert->execute(['expired-order', 'GT-RET-5', 'completed', 'expired@example.com', str_repeat('e', 32), 'Client Expirat', 'individual', 'courier', 10, 80, 'RON', '']);
$db->exec("INSERT INTO shop_order_items VALUES ('item-5','expired-order','p5','Produs expirat','SKU5',1,70,70,70)");
$db->exec("INSERT INTO shop_order_status_history (id,order_id,from_status,to_status,changed_by,customer_notified,email_status,created_at) VALUES ('completed-expired','expired-order','shipped','completed','Sistem',0,'not_requested',datetime('now','-31 days'))");
$expiredDetails = $details; $expiredDetails['items'] = [['order_item_id' => 'item-5', 'quantity' => 1]];
expectFailure(fn() => GtrotsOrderReturnRequest::requestByCustomer($db, ['token' => str_repeat('e', 32)], $expiredDetails, []), 'expirat');

check(GtrotsOrderReturnRequest::maskIban('RO49AAAA1B31007593840000') === 'RO49••••••••••••••••0000', 'Mascarea IBAN-ului nu este corectă.');
echo "order_return_request_test: OK\n";
