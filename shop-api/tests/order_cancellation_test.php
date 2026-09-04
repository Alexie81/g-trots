<?php
declare(strict_types=1);

require_once __DIR__ . '/../invoice-service.php';

function gtSendOrderCancellationEmail(array $order, array $config, array $details = []): array {
    return ['sent' => true, 'recipient' => (string)($order['customer_email'] ?? '')];
}

require_once __DIR__ . '/../order-cancellation.php';

function cancellationAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('CREATE TABLE shop_orders (
    id TEXT PRIMARY KEY, order_number TEXT, tracking_token TEXT, status TEXT, payment_status TEXT, payment_method TEXT,
    customer_email TEXT, admin_notes TEXT, customer_cancellation_reason TEXT, customer_cancelled_at TEXT,
    cancellation_source TEXT, cancellation_invoice_action TEXT, return_invoice_id TEXT, refund_status TEXT DEFAULT "none",
    refund_due_at TEXT, cancellation_email_sent_at TEXT, cancellation_email_error TEXT
)');
$db->exec('CREATE TABLE shop_invoices (id TEXT PRIMARY KEY, order_id TEXT, invoice_type TEXT, spv_status TEXT, series TEXT, invoice_number TEXT)');
$db->exec('CREATE TABLE shop_order_status_history (id TEXT PRIMARY KEY, order_id TEXT, from_status TEXT, to_status TEXT, changed_by TEXT, customer_notified INTEGER, email_status TEXT, email_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
$db->exec('CREATE TABLE shop_spv_outbox (id TEXT PRIMARY KEY, invoice_id TEXT UNIQUE, document_kind TEXT, status TEXT)');

$insert = $db->prepare('INSERT INTO shop_orders (id, order_number, tracking_token, status, payment_status, payment_method, customer_email, refund_status) VALUES (?, ?, ?, ?, ?, ?, ?, "none")');
$insert->execute(['customer-order', 'CMD-CUSTOMER', str_repeat('a', 48), 'processing', 'paid', 'card', 'client@example.com']);
$result = GtrotsOrderCancellation::cancelByCustomer($db, ['token' => str_repeat('a', 48)], 'Am comandat din greșeală.', []);
cancellationAssert(($result['order']['status'] ?? '') === 'cancelled', 'Clientul trebuie să poată anula înainte de predarea către curier.');
cancellationAssert(($result['order']['refund_status'] ?? '') === 'pending' && ($result['order']['refund_due_at'] ?? '') !== '', 'Plata cu cardul trebuie programată pentru rambursare în 15 zile.');
cancellationAssert(($result['invoice_action'] ?? '') === 'none', 'Fără factură emisă nu trebuie creat niciun document fiscal.');
cancellationAssert((int)$db->query("SELECT COUNT(*) FROM shop_invoices WHERE order_id='customer-order'")->fetchColumn() === 0, 'Anularea unei comenzi fără factură nu trebuie să emită factură.');

$insert->execute(['shipped-customer', 'CMD-SHIPPED-CLIENT', str_repeat('b', 48), 'shipped', 'pending', 'cash_on_delivery', 'client2@example.com']);
try {
    GtrotsOrderCancellation::cancelByCustomer($db, ['token' => str_repeat('b', 48)], 'Nu mai doresc coletul.', []);
    throw new RuntimeException('Clientul nu trebuie să poată anula după predarea către curier.');
} catch (InvalidArgumentException $expected) {
    cancellationAssert(str_contains($expected->getMessage(), 'predată curierului'), 'Refuzul anulării publice trebuie să explice limita de status.');
}

$insert->execute(['shipped-staff', 'CMD-SHIPPED-STAFF', str_repeat('c', 48), 'shipped', 'pending', 'cash_on_delivery', 'client3@example.com']);
$staff = GtrotsOrderCancellation::cancelByStaff($db, 'shipped-staff', 'Clientul a refuzat coletul la curier.', [], ['display_name' => 'Operator Test']);
cancellationAssert(($staff['order']['status'] ?? '') === 'cancelled', 'Operatorul trebuie să poată anula manual și după predarea către curier.');
cancellationAssert(($staff['order']['cancellation_source'] ?? '') === 'staff', 'Anularea manuală trebuie identificată separat în baza de date.');
cancellationAssert((int)$db->query("SELECT customer_notified FROM shop_order_status_history WHERE order_id='shipped-staff'")->fetchColumn() === 1, 'Confirmarea anulării manuale trebuie trimisă automat clientului.');

$insert->execute(['refunded-staff', 'CMD-REFUNDED-STAFF', str_repeat('d', 48), 'refunded', 'refunded', 'card', 'client4@example.com']);
$refundedStaff = GtrotsOrderCancellation::cancelByStaff($db, 'refunded-staff', 'Corecție manuală de status.', [], ['display_name' => 'Operator Test']);
cancellationAssert(($refundedStaff['order']['status'] ?? '') === 'cancelled', 'Operatorul trebuie să poată schimba manual inclusiv un status terminal.');
cancellationAssert(($refundedStaff['order']['payment_status'] ?? '') === 'refunded', 'Anularea administrativă nu trebuie să anuleze o rambursare deja efectuată.');

echo "order_cancellation_test: OK\n";
