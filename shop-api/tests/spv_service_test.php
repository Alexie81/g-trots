<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/spv-service.php';

function spvAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('CREATE TABLE shop_invoices (
    id TEXT PRIMARY KEY, invoice_type TEXT NOT NULL, issue_date TEXT NOT NULL, issued_at TEXT NOT NULL,
    spv_status TEXT NOT NULL DEFAULT "not_sent", spv_sent_at TEXT, series TEXT, invoice_number TEXT
)');
$db->exec('CREATE TABLE shop_orders (id TEXT PRIMARY KEY, order_number TEXT, status TEXT, customer_name TEXT, company_name TEXT, total REAL, currency TEXT, created_at TEXT, return_requested_at TEXT, customer_cancelled_at TEXT)');
$db->exec('CREATE TABLE shop_company_settings (id INTEGER PRIMARY KEY, cui TEXT, is_default INTEGER)');
GtrotsSpvService::ensureSchema($db);

$config = [
    'anaf_oauth_client_id' => 'server-only-id',
    'anaf_oauth_client_secret' => 'server-only-secret',
    'spv_encryption_key' => 'test-key-with-at-least-thirty-two-bytes',
];
$db->exec("INSERT INTO shop_spv_connections (id,status,environment,refresh_token_cipher,refresh_expires_at) VALUES (1,'connected','test','encrypted-placeholder','2030-01-01 00:00:00')");
$db->exec("INSERT INTO shop_invoices (id,invoice_type,issue_date,issued_at,spv_status,series,invoice_number) VALUES
    ('invoice-1','invoice','2026-09-04','2026-09-04 09:00:00','not_sent','GT','10'),
    ('return-1','return','2026-09-04','2026-09-04 10:00:00','not_sent','GT','11')");
$db->exec("INSERT INTO shop_spv_outbox (id,invoice_id,document_kind,status,mode_snapshot) VALUES ('old-return-job','return-1','credit_note','awaiting_configuration','manual')");

$status = GtrotsSpvService::updateSettings($db, [
    'environment' => 'test',
    'invoice_mode' => 'delayed',
    'invoice_delay_days' => 2,
    'return_mode' => 'manual',
    'return_delay_days' => 4,
    'reminders_enabled' => true,
], 'Test', $config);
spvAssert($status['connected'] === true, 'Conexiunea server-side trebuie recunoscută pe toate dispozitivele.');

$invoiceJob = $db->query("SELECT * FROM shop_spv_outbox WHERE invoice_id='invoice-1'")->fetch();
$returnJob = $db->query("SELECT * FROM shop_spv_outbox WHERE invoice_id='return-1'")->fetch();
spvAssert(($invoiceJob['status'] ?? '') === 'scheduled', 'Factura pozitivă trebuie programată după setarea curentă.');
spvAssert(($invoiceJob['scheduled_at'] ?? '') === '2026-09-08 00:00:00', 'Două zile lucrătoare după vineri trebuie să însemne întreaga zi de marți, fără condiție de oră.');
spvAssert(($returnJob['status'] ?? '') === 'manual', 'Factura de retur veche nu trebuie trimisă din coada veche când regula curentă este manuală.');
spvAssert(($returnJob['mode_snapshot'] ?? '') === 'manual', 'Coada veche trebuie rescrisă după automatizarea actuală.');
$db->exec("UPDATE shop_spv_outbox SET status='rejected', attempts=2, upload_index='987654', last_error='BR-RO-TEST: total TVA incorect' WHERE invoice_id='invoice-1'");
$visibleJob = GtrotsSpvService::invoiceState($db, 'invoice-1');
spvAssert(($visibleJob['status'] ?? '') === 'rejected', 'Starea ANAF respinsă trebuie expusă aplicației.');
spvAssert(($visibleJob['last_error'] ?? '') === 'BR-RO-TEST: total TVA incorect', 'Mesajul ANAF trebuie afișat integral în fișa facturii.');
spvAssert(($visibleJob['attempts'] ?? 0) === 2 && ($visibleJob['upload_index'] ?? '') === '987654', 'Fișa trebuie să arate încercările și indexul de încărcare fără a expune tokenuri.');

spvAssert(GtrotsSpvService::addWorkingDays('2026-09-04', 1) === '2026-09-07', 'Weekendul nu trebuie numărat în termenul SPV.');
spvAssert(GtrotsSpvService::addWorkingDays('2026-09-04', 5) === '2026-09-11', 'Termenul legal trebuie calculat în zile lucrătoare.');
spvAssert(GtrotsSpvService::addWorkingDays('2026-11-27', 1) === '2026-12-02', 'Sf. Andrei și Ziua Națională nu trebuie numărate ca zile lucrătoare.');
spvAssert(GtrotsSpvService::addWorkingDays('2026-04-09', 1) === '2026-04-14', 'Vinerea Mare și a doua zi de Paște nu trebuie numărate ca zile lucrătoare.');

$manualReminder = GtrotsSpvService::deadlineNotification([
    'id' => 'invoice-manual', 'series' => 'GT', 'invoice_number' => '21', 'invoice_type' => 'invoice',
    'issue_date' => '2026-09-04', 'outbox_status' => 'manual', 'mode_snapshot' => 'manual',
], '2026-09-10');
spvAssert(($manualReminder['bucket'] ?? '') === '1', 'Factura neprogramată trebuie avertizată cu o zi lucrătoare înainte de termen.');
spvAssert(str_contains((string)($manualReminder['body'] ?? ''), 'Factura GT 21 nu are trimiterea programată'), 'Alerta trebuie să identifice explicit factura neprogramată.');

$scheduledReminder = GtrotsSpvService::deadlineNotification([
    'id' => 'invoice-scheduled', 'series' => 'GT', 'invoice_number' => '22', 'invoice_type' => 'invoice',
    'issue_date' => '2026-09-04', 'outbox_status' => 'scheduled', 'mode_snapshot' => 'delayed',
    'scheduled_at' => '2026-09-11 00:00:00', 'next_attempt_at' => '2026-09-11 00:00:00',
], '2026-09-10');
spvAssert($scheduledReminder === null, 'Factura care are încă o programare automată validă nu trebuie avertizată înainte de termen.');

$dueTodayReminder = GtrotsSpvService::deadlineNotification([
    'id' => 'invoice-due', 'series' => 'GT', 'invoice_number' => '23', 'invoice_type' => 'invoice',
    'issue_date' => '2026-09-04', 'outbox_status' => 'scheduled', 'mode_snapshot' => 'delayed',
    'scheduled_at' => '2026-09-11 00:00:00', 'next_attempt_at' => '2026-09-11 00:00:00',
], '2026-09-11');
spvAssert(($dueTodayReminder['bucket'] ?? '') === '0', 'În ziua-limită trebuie avertizată orice factură încă netrimisă, chiar dacă este programată.');
spvAssert(str_contains((string)($dueTodayReminder['body'] ?? ''), 'Astăzi este ultima zi'), 'Mesajul din ziua-limită trebuie să fie explicit.');

$weekendOverdueReminder = GtrotsSpvService::deadlineNotification([
    'id' => 'invoice-weekend-overdue', 'series' => 'GT', 'invoice_number' => '25', 'invoice_type' => 'invoice',
    'issue_date' => '2026-08-28', 'outbox_status' => 'scheduled', 'mode_snapshot' => 'delayed',
    'scheduled_at' => '2026-09-04 00:00:00', 'next_attempt_at' => '2026-09-04 00:00:00',
], '2026-09-05');
spvAssert(($weekendOverdueReminder['bucket'] ?? '') === 'overdue', 'După o scadență de vineri, alerta trebuie să fie depășită și în weekend.');

$missedScheduleReminder = GtrotsSpvService::deadlineNotification([
    'id' => 'invoice-missed', 'series' => 'GT', 'invoice_number' => '24', 'invoice_type' => 'invoice',
    'issue_date' => '2026-09-04', 'outbox_status' => 'scheduled', 'mode_snapshot' => 'delayed',
    'scheduled_at' => '2026-09-08 00:00:00', 'next_attempt_at' => '2026-09-08 00:00:00',
], '2026-09-10');
spvAssert(($missedScheduleReminder['bucket'] ?? '') === '1', 'O programare automată depășită fără trimitere trebuie tratată ca neacoperită.');

$db->exec("INSERT INTO shop_notifications (id,notification_type,title,body,entity_type,entity_id,severity,dedupe_key) VALUES ('notice-1','new_order','Comandă nouă','Test','order','order-1','success','test:1')");
$marked = GtrotsSpvService::markNotification($db, 'notice-1');
spvAssert(($marked['unread_count'] ?? -1) === 0, 'Notificarea citită trebuie eliminată din contor.');
spvAssert((int)$db->query("SELECT COUNT(*) FROM shop_notifications WHERE id='notice-1'")->fetchColumn() === 0, 'Notificarea eliminată trebuie ștearsă definitiv din baza de date.');
spvAssert((int)$db->query("SELECT COUNT(*) FROM shop_notification_dismissals WHERE dedupe_key='test:1'")->fetchColumn() === 1, 'Trebuie păstrată doar amprenta minimală care împiedică recrearea alertei.');

$testNotification = GtrotsSpvService::createTestNotification($db);
spvAssert(($testNotification['notification']['notification_type'] ?? '') === 'test', 'Notificarea manuală de test trebuie creată cu tipul corect.');
spvAssert(($testNotification['notification']['title'] ?? '') === 'Notificare SHOP de test', 'Notificarea manuală trebuie să aibă titlul așteptat.');
spvAssert(($testNotification['notification']['read'] ?? true) === false, 'Notificarea de test trebuie creată ca necitită.');
$spvTestNotification = GtrotsSpvService::createTestNotification($db, 'spv_deadline');
spvAssert(($spvTestNotification['notification']['severity'] ?? '') === 'warning', 'Alerta de termen SPV trebuie afișată ca avertizare.');
try {
    GtrotsSpvService::createTestNotification($db, 'not-allowed');
    spvAssert(false, 'Un tip arbitrar de notificare nu trebuie acceptat.');
} catch (InvalidArgumentException $error) {
    spvAssert($error->getMessage() === 'Tipul notificării de test nu este permis.', 'Tipul invalid trebuie respins explicit.');
}

$db->exec("UPDATE shop_spv_connections SET status='disconnected', refresh_token_cipher=NULL, refresh_expires_at=NULL WHERE id=1");
$disconnectedMessage = '';
try {
    GtrotsSpvService::sendManual($db, $config, 'invoice-1');
} catch (InvalidArgumentException $error) {
    $disconnectedMessage = $error->getMessage();
}
spvAssert(
    $disconnectedMessage === 'Conectează firma la SPV înainte de transmitere.',
    'Transmiterea manuală fără conexiune trebuie să întoarcă mesajul explicit, nu eroarea generică SHOP API.'
);

echo "SPV service tests passed.\n";
