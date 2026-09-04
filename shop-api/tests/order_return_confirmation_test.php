<?php
declare(strict_types=1);

final class GtrotsInvoiceService
{
    public static array $issued = [];
    public static array $emailed = [];

    public static function issueReturn(PDO $db, string $orderId, string $reason, array $actor, array $config, bool $manageTransaction = true): array
    {
        $existing = $db->prepare("SELECT * FROM shop_invoices WHERE order_id = ? AND invoice_type = 'return' LIMIT 1");
        $existing->execute([$orderId]);
        $row = $existing->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $id = 'return-' . $orderId;
            $db->prepare("INSERT INTO shop_invoices (id, order_id, series, invoice_number, invoice_type) VALUES (?, ?, 'GT', '2', 'return')")
                ->execute([$id, $orderId]);
            $row = ['id' => $id, 'order_id' => $orderId, 'series' => 'GT', 'invoice_number' => '2', 'invoice_type' => 'return'];
            self::$issued[] = [$orderId, $reason];
        }
        return [
            'id' => (string)$row['id'],
            'series' => (string)$row['series'],
            'number' => (string)$row['invoice_number'],
            'display_number' => trim((string)$row['series'] . ' ' . (string)$row['invoice_number']),
            'invoice_type' => 'return',
            'existing' => count(self::$issued) === 0,
        ];
    }

    public static function sendEmailOnce(PDO $db, string $invoiceId, array $config): array
    {
        self::$emailed[] = $invoiceId;
        return ['sent' => true, 'recipient' => 'client@example.test'];
    }
}

$statusEmails = [];
function gtSendOrderReturnConfirmedEmail(array $order, array $config): array
{
    global $statusEmails;
    $statusEmails[] = (string)$order['id'];
    return ['sent' => true, 'recipient' => (string)$order['customer_email']];
}

require_once dirname(__DIR__) . '/order-return-confirmation.php';

function returnConfirmationDb(): PDO
{
    $db = new PDO('sqlite::memory:');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $db->exec('CREATE TABLE shop_orders (
        id TEXT PRIMARY KEY, order_number TEXT NOT NULL, status TEXT NOT NULL,
        return_reason TEXT NULL, admin_notes TEXT NULL, return_invoice_id TEXT NULL,
        return_confirmed_at TEXT NULL, return_confirmation_email_sent_at TEXT NULL,
        return_confirmation_email_error TEXT NULL, customer_email TEXT NULL,
        return_refund_amount REAL NULL, currency TEXT NOT NULL DEFAULT "RON"
    )');
    $db->exec('CREATE TABLE shop_invoices (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, series TEXT NOT NULL,
        invoice_number TEXT NOT NULL, invoice_type TEXT NOT NULL
    )');
    $db->exec('CREATE TABLE shop_spv_outbox (
        id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL UNIQUE,
        document_kind TEXT NOT NULL, status TEXT NOT NULL
    )');
    $db->exec('CREATE TABLE shop_order_status_history (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, from_status TEXT NULL,
        to_status TEXT NOT NULL, changed_by TEXT NULL, customer_notified INTEGER NOT NULL DEFAULT 0,
        email_status TEXT NULL, email_error TEXT NULL
    )');
    return $db;
}

function assertReturnConfirmation(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$db = returnConfirmationDb();
$db->exec("INSERT INTO shop_orders (id, order_number, status, return_reason, customer_email, return_refund_amount) VALUES ('o1', 'GT-ORDER-1', 'return_requested', 'Nu se potrivește', 'client@example.test', 100)");
$result = GtrotsOrderReturnConfirmation::confirm($db, 'o1', [], ['display_name' => 'Admin'], true);
assertReturnConfirmation($result['invoice_action'] === 'none_no_positive_invoice', 'Nu trebuie emis retur fără factură pozitivă.');
assertReturnConfirmation($result['return_invoice'] === null, 'Factura de retur trebuie să lipsească.');
assertReturnConfirmation($db->query("SELECT status FROM shop_orders WHERE id = 'o1'")->fetchColumn() === 'return_confirmed', 'Statusul nu a fost confirmat.');
assertReturnConfirmation($db->query("SELECT email_status FROM shop_order_status_history WHERE order_id = 'o1'")->fetchColumn() === 'sent', 'E-mailul opțional nu a fost jurnalizat.');
assertReturnConfirmation(count($statusEmails) === 1, 'E-mailul opțional de confirmare nu a fost trimis.');

GtrotsInvoiceService::$issued = [];
GtrotsInvoiceService::$emailed = [];
$statusEmails = [];
$db = returnConfirmationDb();
$db->exec("INSERT INTO shop_orders (id, order_number, status, return_reason, customer_email) VALUES ('o2', 'GT-ORDER-2', 'return_requested', 'Produs returnat', 'client@example.test')");
$db->exec("INSERT INTO shop_invoices (id, order_id, series, invoice_number, invoice_type) VALUES ('positive-o2', 'o2', 'GT', '1', 'invoice')");
$result = GtrotsOrderReturnConfirmation::confirm($db, 'o2', [], ['display_name' => 'Admin'], false);
assertReturnConfirmation($result['invoice_action'] === 'return_invoice_created', 'Factura de retur nu a fost creată.');
assertReturnConfirmation((string)$db->query("SELECT document_kind FROM shop_spv_outbox WHERE invoice_id = 'return-o2'")->fetchColumn() === 'credit_note', 'Factura de retur nu a fost pusă în coada SPV.');
assertReturnConfirmation(GtrotsInvoiceService::$emailed === ['return-o2'], 'Factura de retur nu a fost trimisă automat o singură dată.');
assertReturnConfirmation($statusEmails === [], 'E-mailul de status nu trebuie trimis când opțiunea este oprită.');

GtrotsInvoiceService::$issued = [];
GtrotsInvoiceService::$emailed = [];
$db = returnConfirmationDb();
$db->exec("INSERT INTO shop_orders (id, order_number, status, return_reason, customer_email) VALUES ('o3', 'GT-ORDER-3', 'return_confirmed', 'Retur manual', 'client@example.test')");
$db->exec("INSERT INTO shop_invoices (id, order_id, series, invoice_number, invoice_type) VALUES ('positive-o3', 'o3', 'GT', '10', 'invoice')");
$pair = GtrotsOrderReturnConfirmation::ensureReturnInvoice($db, 'o3', [], ['display_name' => 'Admin']);
assertReturnConfirmation((string)($pair['return_invoice']['id'] ?? '') === 'return-o3', 'Perechea fiscală nu a fost completată.');
assertReturnConfirmation($db->query("SELECT return_invoice_id FROM shop_orders WHERE id = 'o3'")->fetchColumn() === 'return-o3', 'Factura de retur nu a fost legată de comandă.');
assertReturnConfirmation(GtrotsInvoiceService::$emailed === ['return-o3'], 'Factura pereche de retur nu a fost trimisă automat.');

GtrotsInvoiceService::$issued = [];
GtrotsInvoiceService::$emailed = [];
$db = returnConfirmationDb();
$db->exec("INSERT INTO shop_orders (id, order_number, status, return_reason, customer_email) VALUES ('o4', 'GT-ORDER-4', 'return_confirmed', 'Retur manual fără e-mail', 'client@example.test')");
$db->exec("INSERT INTO shop_invoices (id, order_id, series, invoice_number, invoice_type) VALUES ('positive-o4', 'o4', 'GT', '20', 'invoice')");
$pair = GtrotsOrderReturnConfirmation::ensureReturnInvoice($db, 'o4', [], ['display_name' => 'Admin'], false);
assertReturnConfirmation((string)($pair['return_invoice']['id'] ?? '') === 'return-o4', 'Factura pereche trebuie emisă și când e-mailul este oprit.');
assertReturnConfirmation(($pair['return_invoice_email']['requested'] ?? null) === false, 'API-ul trebuie să indice explicit că e-mailul facturii de retur nu a fost solicitat.');
assertReturnConfirmation(GtrotsInvoiceService::$emailed === [], 'Factura de retur nu trebuie trimisă când switch-ul ei este oprit.');

GtrotsInvoiceService::$issued = [];
GtrotsInvoiceService::$emailed = [];
$db = returnConfirmationDb();
$db->exec("INSERT INTO shop_orders (id, order_number, status, return_reason, customer_email) VALUES ('o5', 'GT-ORDER-5', 'return_refused', 'Retur verificat', 'client@example.test')");
$result = GtrotsOrderReturnConfirmation::confirm($db, 'o5', [], ['display_name' => 'Admin'], false);
assertReturnConfirmation($db->query("SELECT status FROM shop_orders WHERE id = 'o5'")->fetchColumn() === 'return_confirmed', 'Un retur refuzat trebuie să poată fi confirmat ulterior.');
assertReturnConfirmation($db->query("SELECT from_status FROM shop_order_status_history WHERE order_id = 'o5'")->fetchColumn() === 'return_refused', 'Istoricul trebuie să păstreze trecerea din Retur refuzat.');

echo "order_return_confirmation_test: OK\n";
