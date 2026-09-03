<?php
declare(strict_types=1);

require_once __DIR__ . '/../invoice-automation.php';

$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$db = new PDO('sqlite::memory:', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec("CREATE TABLE shop_invoice_automation_settings (
    id INTEGER PRIMARY KEY,
    card_issue_enabled INTEGER NOT NULL DEFAULT 0,
    card_email_enabled INTEGER NOT NULL DEFAULT 0,
    cod_issue_enabled INTEGER NOT NULL DEFAULT 0,
    cod_email_enabled INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)");
$db->exec("CREATE TABLE shop_invoice_automation_runs (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    payment_flow TEXT NOT NULL,
    invoice_id TEXT,
    issue_requested INTEGER NOT NULL DEFAULT 1,
    email_requested INTEGER NOT NULL DEFAULT 0,
    email_sent INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'processing',
    attempts INTEGER NOT NULL DEFAULT 1,
    last_error TEXT,
    processed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, payment_flow)
)");
$db->exec("CREATE TABLE shop_orders (id TEXT PRIMARY KEY, payment_method TEXT NOT NULL, payment_status TEXT NOT NULL, status TEXT NOT NULL)");
$db->exec('INSERT INTO shop_invoice_automation_settings (id) VALUES (1)');

$normalized = GtrotsInvoiceAutomation::normalize([
    'card_issue_enabled' => false,
    'card_email_enabled' => true,
    'cod_issue_enabled' => '0',
    'cod_email_enabled' => 'true',
]);
$expect(!$normalized['card_email_enabled'] && !$normalized['cod_email_enabled'], 'E-mailul trebuie dezactivat automat dacă emiterea aferentă este oprită.');

$settings = GtrotsInvoiceAutomation::update($db, [
    'card_issue_enabled' => true,
    'card_email_enabled' => true,
    'cod_issue_enabled' => true,
    'cod_email_enabled' => true,
], 'Test automat');
$expect($settings['card_email_enabled'] && $settings['cod_email_enabled'], 'Cele patru reguli active trebuie salvate împreună.');
$expect($settings['updated_by'] === 'Test automat', 'Autorul modificării trebuie memorat.');

$insertOrder = $db->prepare('INSERT INTO shop_orders (id, payment_method, payment_status, status) VALUES (?, ?, ?, ?)');
$insertOrder->execute(['card-pending', 'card', 'pending', 'confirmed']);
$insertOrder->execute(['card-ready', 'card', 'paid', 'confirmed']);
$insertOrder->execute(['card-issue-only', 'card', 'paid', 'confirmed']);
$insertOrder->execute(['card-email-retry', 'card', 'paid', 'confirmed']);
$insertOrder->execute(['cod-wrong-state', 'cash_on_delivery', 'pending', 'confirmed']);
$insertOrder->execute(['cod-ready', 'cash_on_delivery', 'pending', 'new']);

$events = [];
$createdInvoices = [];
$issue = static function (PDO $unused, string $orderId) use (&$events, &$createdInvoices): array {
    $events[] = 'invoice-issue:' . $orderId;
    if (!isset($createdInvoices[$orderId])) $createdInvoices[$orderId] = 'invoice-' . $orderId;
    return ['id' => $createdInvoices[$orderId]];
};
$email = static function (PDO $unused, string $invoiceId) use (&$events): array {
    $events[] = 'invoice-email:' . $invoiceId;
    return ['sent' => true];
};

$pending = GtrotsInvoiceAutomation::processOrder($db, 'card-pending', [], [], $issue, $email);
$expect(!$pending['processed'] && !$pending['eligible'], 'Cardul neplătit nu trebuie să emită factură.');

$events[] = 'order-email:card-ready';
$card = GtrotsInvoiceAutomation::processOrder($db, 'card-ready', [], [], $issue, $email);
$expect($card['processed'] && $card['status'] === 'completed' && $card['email_sent'], 'Cardul plătit și confirmat trebuie să emită și să trimită factura.');
$expect($events === ['order-email:card-ready', 'invoice-issue:card-ready', 'invoice-email:invoice-card-ready'], 'Confirmarea comenzii trebuie finalizată înainte de emiterea și e-mailul facturii.');
$duplicate = GtrotsInvoiceAutomation::processOrder($db, 'card-ready', [], [], $issue, $email);
$expect(!empty($duplicate['duplicate']) && count($createdInvoices) === 1 && count($events) === 3, 'Reprocesarea aceleiași plăți nu trebuie să emită sau să trimită din nou.');

GtrotsInvoiceAutomation::update($db, [
    'card_issue_enabled' => true,
    'card_email_enabled' => false,
    'cod_issue_enabled' => true,
    'cod_email_enabled' => true,
], 'Test fără e-mail card');
$events = [];
$issueOnly = GtrotsInvoiceAutomation::processOrder($db, 'card-issue-only', [], [], $issue, $email);
$expect($issueOnly['status'] === 'completed' && !$issueOnly['email_sent'], 'Regula de emitere trebuie să funcționeze și fără trimiterea facturii.');
$expect($events === ['invoice-issue:card-issue-only'], 'E-mailul facturii nu trebuie apelat când switch-ul lui este oprit.');

GtrotsInvoiceAutomation::update($db, [
    'card_issue_enabled' => true,
    'card_email_enabled' => true,
    'cod_issue_enabled' => true,
    'cod_email_enabled' => true,
], 'Test retry');
$retryEvents = [];
$emailAttempts = 0;
$retryIssue = static function (PDO $unused, string $orderId) use (&$retryEvents, &$createdInvoices): array {
    $retryEvents[] = 'invoice-issue';
    if (!isset($createdInvoices[$orderId])) $createdInvoices[$orderId] = 'invoice-' . $orderId;
    return ['id' => $createdInvoices[$orderId]];
};
$flakyEmail = static function () use (&$retryEvents, &$emailAttempts): array {
    $retryEvents[] = 'invoice-email';
    $emailAttempts++;
    return $emailAttempts === 1 ? ['sent' => false, 'error' => 'SMTP indisponibil'] : ['sent' => true];
};
$failed = GtrotsInvoiceAutomation::processOrder($db, 'card-email-retry', [], [], $retryIssue, $flakyEmail);
$expect($failed['status'] === 'failed', 'O eroare SMTP trebuie înregistrată fără a pierde factura emisă.');
$storedFailed = $db->query("SELECT * FROM shop_invoice_automation_runs WHERE order_id = 'card-email-retry'")->fetch();
$expect(($storedFailed['invoice_id'] ?? '') === 'invoice-card-email-retry' && $storedFailed['status'] === 'failed', 'Rularea eșuată trebuie să păstreze ID-ul facturii pentru reluare sigură.');
$retried = GtrotsInvoiceAutomation::processOrder($db, 'card-email-retry', [], [], $retryIssue, $flakyEmail);
$expect($retried['status'] === 'completed' && $retried['email_sent'], 'Trimiterea facturii trebuie să poată fi reluată după o eroare de e-mail.');
$expect(($db->query("SELECT attempts FROM shop_invoice_automation_runs WHERE order_id = 'card-email-retry'")->fetchColumn()) === 2, 'Reluarea trebuie numărată pe aceeași rulare idempotentă.');
$expect(count(array_filter($createdInvoices, static fn ($id): bool => $id === 'invoice-card-email-retry')) === 1, 'Reluarea e-mailului nu trebuie să creeze o a doua factură.');

$wrongCod = GtrotsInvoiceAutomation::processOrder($db, 'cod-wrong-state', [], [], $issue, $email);
$expect(!$wrongCod['processed'] && !$wrongCod['eligible'], 'Rambursul nu trebuie facturat automat în afara stării Nouă.');
$events = ['order-email:cod-ready'];
$cod = GtrotsInvoiceAutomation::processOrder($db, 'cod-ready', [], [], $issue, $email);
$expect($cod['status'] === 'completed' && $cod['email_sent'], 'Comanda ramburs Nouă trebuie să emită și să trimită factura.');
$expect($events === ['order-email:cod-ready', 'invoice-issue:cod-ready', 'invoice-email:invoice-cod-ready'], 'Și la ramburs, confirmarea comenzii trebuie să plece înaintea facturii.');

$dependentOff = GtrotsInvoiceAutomation::update($db, [
    'card_issue_enabled' => false,
    'card_email_enabled' => true,
    'cod_issue_enabled' => false,
    'cod_email_enabled' => true,
], 'Test dependențe');
$expect(!$dependentOff['card_email_enabled'] && !$dependentOff['cod_email_enabled'], 'API-ul trebuie să impună dependențele chiar dacă interfața trimite valori invalide.');

$apiSource = (string)file_get_contents(__DIR__ . '/../api.php');
$stripeSource = (string)file_get_contents(__DIR__ . '/../stripe.php');
$emailSource = (string)file_get_contents(__DIR__ . '/../order-emails.php');
$desktopSource = (string)file_get_contents(__DIR__ . '/../../electron-app/renderer/js/shop-commerce.js');
$authSource = (string)file_get_contents(__DIR__ . '/../../electron-app/renderer/js/auth.js');
$mobileSource = (string)file_get_contents(__DIR__ . '/../../components/ShopAutomationsManager.tsx');
$expect(str_contains($apiSource, "GtrotsInvoiceAutomation::processOrder"), 'API-ul magazinului trebuie să pornească automatizarea pentru comenzile ramburs și editările CRM.');
$expect(strpos($stripeSource, 'gtSendOrderStatusEmail') < strpos($stripeSource, 'GtrotsInvoiceAutomation::processOrder'), 'Webhook-ul Stripe trebuie să trimită confirmarea comenzii înainte să proceseze factura.');
$expect(str_contains($emailSource, 'catch (Throwable $error)'), 'Trimiterea confirmării comenzii trebuie să își izoleze erorile SMTP.');
$expect(str_contains($desktopSource, 'queueInvoiceAutomationSave(content)') && !str_contains($desktopSource, 'id="shop-automations-form"'), 'Desktopul trebuie să salveze switch-urile automat, fără buton de salvare.');
$expect(str_contains($mobileSource, 'persist(next)') && !str_contains($mobileSource, 'Salvează automatizările'), 'Telefonul trebuie să salveze switch-urile automat, fără buton de salvare.');
$expect(str_contains($authSource, 'renderAuthState(false)'), 'Verificarea periodică a sesiunii nu trebuie să forțeze reîncărcarea modulelor vizibile.');

if ($failures) {
    fwrite(STDERR, "Automatizări facturi: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "invoice_automation_test: OK\n";
