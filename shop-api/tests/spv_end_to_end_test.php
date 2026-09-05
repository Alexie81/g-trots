<?php
declare(strict_types=1);

final class GtrotsInvoiceService
{
    public static function get(PDO $db, string $id, array $config = []): array
    {
        $stmt = $db->prepare('SELECT * FROM shop_invoices WHERE id=?');
        $stmt->execute([$id]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    }

    public static function download(PDO $db, string $id, string $format, array $config = []): array
    {
        if ($format !== 'xml') throw new RuntimeException('Testul acceptă numai XML.');
        return ['content_base64' => base64_encode('<?xml version="1.0" encoding="UTF-8"?><Invoice><ID>' . htmlspecialchars($id, ENT_XML1) . '</ID></Invoice>')];
    }

    public static function markSpvSent(PDO $db, string $id, string $submissionId): array
    {
        $db->prepare("UPDATE shop_invoices SET spv_status='sent',spv_sent_at=CURRENT_TIMESTAMP,spv_submission_id=? WHERE id=?")->execute([$submissionId, $id]);
        return self::get($db, $id);
    }
}

require_once dirname(__DIR__) . '/spv-service.php';

function spvE2eAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function spvE2eJwt(int $expiresAt, array $extra = []): string
{
    $encode = static fn(string $value): string => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    return $encode('{"alg":"none","typ":"JWT"}') . '.' . $encode(json_encode(['exp' => $expiresAt] + $extra, JSON_THROW_ON_ERROR)) . '.signature';
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('CREATE TABLE shop_invoices (
    id TEXT PRIMARY KEY, invoice_type TEXT NOT NULL, issue_date TEXT NOT NULL, issued_at TEXT NOT NULL,
    spv_status TEXT NOT NULL DEFAULT "not_sent", spv_sent_at TEXT, spv_submission_id TEXT,
    series TEXT, invoice_number TEXT
)');
$db->exec('CREATE TABLE shop_orders (id TEXT PRIMARY KEY, order_number TEXT, status TEXT, customer_name TEXT, company_name TEXT, total REAL, currency TEXT, created_at TEXT, return_requested_at TEXT, customer_cancelled_at TEXT)');
$db->exec('CREATE TABLE shop_company_settings (id INTEGER PRIMARY KEY, legal_name TEXT, trade_name TEXT, cui TEXT, registration_number TEXT, address TEXT, city TEXT, county TEXT, postal_code TEXT, email TEXT, phone TEXT, bank_name TEXT, iban TEXT, share_capital TEXT, vat_payer INTEGER, vat_rate REAL, is_default INTEGER)');
$db->exec("INSERT INTO shop_company_settings (id,legal_name,trade_name,cui,registration_number,address,city,county,postal_code,email,phone,bank_name,iban,share_capital,vat_payer,vat_rate,is_default) VALUES (1,'G-Trots Test SRL','G-Trots','RO12345678','J40/1/2026','Str. Test 1','Sector 1','Bucuresti','010101','test@example.test','0700000000','Banca Test','RO49AAAA1B31007593840000','200',1,19,1)");
GtrotsSpvService::ensureSchema($db);

$config = [
    'anaf_oauth_client_id' => 'server-only-client',
    'anaf_oauth_client_secret' => 'server-only-secret',
    'spv_encryption_key' => 'spv-end-to-end-test-key-with-32-bytes',
    'anaf_oauth_authorize_url' => 'https://fake.anaf/authorize',
    'anaf_oauth_token_url' => 'https://fake.anaf/token',
    'anaf_oauth_revoke_url' => 'https://fake.anaf/revoke',
    'anaf_oauth_test_url' => 'https://fake.anaf/test',
    'anaf_oauth_callback_url' => 'https://g-trots.ro/shop-api/anaf-oauth-callback.php',
    'anaf_efactura_test_url' => 'https://fake.anaf/test/FCTEL/rest',
    'anaf_efactura_production_url' => 'https://fake.anaf/prod/FCTEL/rest',
    'anaf_validation_enabled' => false,
];

$scenario = 'accepted';
$tokenGrants = [];
$calls = [];
GtrotsSpvService::setHttpTransportForTests(static function (string $method, string $url, array $headers, ?string $body, int $timeout) use (&$scenario, &$tokenGrants, &$calls): array {
    $calls[] = compact('method', 'url', 'headers', 'body', 'timeout');
    if (str_contains($url, '/token')) {
        parse_str((string)$body, $fields);
        $tokenGrants[] = (string)($fields['grant_type'] ?? '');
        $basic = array_values(array_filter($headers, static fn(string $header): bool => str_starts_with($header, 'Authorization: Basic ')));
        spvE2eAssert(count($basic) === 1, 'Schimbul OAuth trebuie autentificat cu Basic Auth.');
        spvE2eAssert(($fields['token_content_type'] ?? 'jwt') === 'jwt', 'Tokenul OAuth trebuie cerut în format JWT.');
        return ['status' => 200, 'body' => json_encode([
            'access_token' => spvE2eJwt(time() + 90 * 86400, ['serial_certificate' => 'CERTIFICATE-987654']),
            'refresh_token' => spvE2eJwt(time() + 365 * 86400),
            'expires_in' => 90 * 86400,
        ], JSON_THROW_ON_ERROR)];
    }
    if (str_contains($url, '/test') && !str_contains($url, '/FCTEL/')) return ['status' => 200, 'body' => 'Hello G-Trots'];
    if (str_contains($url, '/upload')) {
        spvE2eAssert($method === 'POST' && (str_contains($url, 'standard=UBL') || str_contains($url, 'standard=CN')) && str_contains($url, 'cif=12345678'), 'Uploadul trebuie să folosească standardul documentului și CIF-ul numeric.');
        if (str_contains((string)$body, '<CreditNote')) spvE2eAssert(str_contains($url, 'standard=CN'), 'Factura de corecție 381 trebuie încărcată cu standard=CN.');
        spvE2eAssert((bool)array_filter($headers, static fn(string $header): bool => str_starts_with($header, 'Authorization: Bearer ')), 'Uploadul trebuie autorizat Bearer.');
        if ($scenario === 'upload_error') return ['status' => 503, 'body' => 'temporarily unavailable'];
        return ['status' => 200, 'body' => '<header ExecutionStatus="0" index_incarcare="UPLOAD-123"/>'];
    }
    if (str_contains($url, '/stareMesaj')) {
        return $scenario === 'rejected'
            ? ['status' => 200, 'body' => '<header stare="NOK"><Errors errorMessage="CIUS-RO invalid"/></header>']
            : ['status' => 200, 'body' => '<header stare="OK" id_descarcare="DOWNLOAD-456"/>'];
    }
    if (str_contains($url, '/revoke')) return ['status' => 200, 'body' => '{}'];
    throw new RuntimeException('Apel ANAF neașteptat în test: ' . $url);
});

$begin = GtrotsSpvService::beginOAuth($db, $config, 'Administrator');
parse_str((string)parse_url((string)$begin['authorization_url'], PHP_URL_QUERY), $oauthQuery);
spvE2eAssert(($oauthQuery['response_type'] ?? '') === 'code', 'OAuth trebuie să folosească Authorization Code.');
spvE2eAssert(($oauthQuery['redirect_uri'] ?? '') === $config['anaf_oauth_callback_url'], 'Callback-ul OAuth trebuie să fie cel înregistrat la ANAF.');
spvE2eAssert(($oauthQuery['token_content_type'] ?? '') === 'jwt', 'Autorizarea trebuie să solicite JWT.');

$connected = GtrotsSpvService::completeOAuth($db, $config, 'authorization-code', (string)$oauthQuery['state']);
spvE2eAssert($connected['connected'] === true, 'Callback-ul trebuie să salveze conexiunea server-side.');
spvE2eAssert($connected['certificate_hint'] === '••••987654', 'Aplicațiile trebuie să primească doar seria mascată a certificatului.');
$stored = $db->query('SELECT access_token_cipher,refresh_token_cipher FROM shop_spv_connections WHERE id=1')->fetch();
spvE2eAssert(!str_contains((string)$stored['access_token_cipher'], 'eyJ'), 'Access tokenul trebuie criptat la stocare.');
spvE2eAssert(!str_contains((string)$stored['refresh_token_cipher'], 'eyJ'), 'Refresh tokenul trebuie criptat la stocare.');

GtrotsSpvService::updateSettings($db, [
    'environment' => 'test', 'invoice_mode' => 'on_issue', 'invoice_delay_days' => 1,
    'return_mode' => 'manual', 'return_delay_days' => 1, 'reminders_enabled' => true,
], 'Administrator', $config);

$diagnostics = GtrotsSpvService::runTestDiagnostics($db, $config);
spvE2eAssert(($diagnostics['environment'] ?? '') === 'test' && !empty($diagnostics['isolated']) && empty($diagnostics['fiscal_effect']), 'Diagnosticul trebuie limitat explicit la sandbox, fără efect fiscal.');
spvE2eAssert(count((array)($diagnostics['documents'] ?? [])) === 2, 'Diagnosticul trebuie să încarce atât Invoice 380, cât și CreditNote 381.');
spvE2eAssert(count(array_filter((array)$diagnostics['documents'], static fn(array $document): bool => ($document['state'] ?? '') === 'accepted')) === 2, 'Ambele documente sintetice trebuie să parcurgă uploadul și citirea statusului.');
spvE2eAssert((int)$db->query('SELECT COUNT(*) FROM shop_invoices')->fetchColumn() === 0, 'Diagnosticul nu trebuie să creeze facturi fiscale locale.');
$diagnosticUploads = array_values(array_filter($calls, static fn(array $call): bool => str_contains((string)$call['url'], '/upload')));
spvE2eAssert(str_contains((string)$diagnosticUploads[0]['url'], 'standard=UBL') && str_contains((string)$diagnosticUploads[1]['url'], 'standard=CN'), 'Diagnosticul trebuie să trimită Invoice cu UBL și CreditNote cu CN.');

$insert = $db->prepare('INSERT INTO shop_invoices (id,invoice_type,issue_date,issued_at,spv_status,series,invoice_number) VALUES (?,?,?,?,?,?,?)');
$insert->execute(['invoice-accepted', 'invoice', '2026-09-04', '2026-09-04 12:00:00', 'not_sent', 'GT', '101']);
GtrotsSpvService::enqueue($db, 'invoice-accepted', 'invoice');
$sandboxBlocked = false;
try { GtrotsSpvService::sendManual($db, $config, 'invoice-accepted'); }
catch (InvalidArgumentException $expected) { $sandboxBlocked = str_contains($expected->getMessage(), 'facturile fiscale reale sunt protejate'); }
spvE2eAssert($sandboxBlocked, 'Mediul Test nu trebuie să poată marca sau încărca o factură fiscală reală.');
GtrotsSpvService::updateSettings($db, [
    'environment' => 'production', 'invoice_mode' => 'on_issue', 'invoice_delay_days' => 1,
    'return_mode' => 'manual', 'return_delay_days' => 1, 'reminders_enabled' => true,
], 'Administrator', $config);
$accepted = GtrotsSpvService::sendManual($db, $config, 'invoice-accepted');
spvE2eAssert(($accepted['invoice']['spv_status'] ?? '') === 'sent', 'Acceptarea ANAF trebuie să marcheze factura drept trimisă.');
spvE2eAssert(($accepted['job']['upload_index'] ?? '') === 'UPLOAD-123' && ($accepted['job']['download_id'] ?? '') === 'DOWNLOAD-456', 'Indicii ANAF trebuie păstrați pentru audit.');

$scenario = 'rejected';
$insert->execute(['invoice-rejected', 'return', '2026-09-04', '2026-09-04 12:10:00', 'not_sent', 'GT', '102']);
GtrotsSpvService::enqueue($db, 'invoice-rejected', 'credit_note');
$rejected = GtrotsSpvService::sendManual($db, $config, 'invoice-rejected');
spvE2eAssert(($rejected['invoice']['spv_status'] ?? '') === 'rejected', 'Un NOK ANAF trebuie afișat drept respins, nu trimis.');

$scenario = 'accepted';
$db->exec("UPDATE shop_spv_connections SET access_expires_at='2020-01-01 00:00:00'");
$insert->execute(['invoice-refresh', 'invoice', '2026-09-04', '2026-09-04 12:20:00', 'not_sent', 'GT', '103']);
GtrotsSpvService::enqueue($db, 'invoice-refresh', 'invoice');
GtrotsSpvService::sendManual($db, $config, 'invoice-refresh');
spvE2eAssert(in_array('refresh_token', $tokenGrants, true), 'Un access token expirat trebuie reînnoit automat cu refresh tokenul.');

$today = date('Y-m-d');
$insert->execute(['invoice-worker-late', 'invoice', $today, $today . ' 18:25:00', 'not_sent', 'GT', '103B']);
$insert->execute(['invoice-worker-early', 'invoice', $today, $today . ' 08:10:00', 'not_sent', 'GT', '103A']);
// Le introducem intenționat invers pentru a demonstra că ordinea cozii nu
// prevalează asupra datei și orei reale de emitere.
GtrotsSpvService::enqueue($db, 'invoice-worker-late', 'invoice');
GtrotsSpvService::enqueue($db, 'invoice-worker-early', 'invoice');
$futureToday = $today . ' 23:59:59';
$db->prepare("UPDATE shop_spv_outbox SET scheduled_at=?,next_attempt_at=? WHERE invoice_id IN ('invoice-worker-late','invoice-worker-early')")
    ->execute([$futureToday, $futureToday]);
$worker = GtrotsSpvService::runWorker($db, $config, 5);
spvE2eAssert(($worker['processed'] ?? 0) >= 2, 'Workerul trebuie să preia facturile în prima rulare din ziua scadentă, chiar dacă ora programată este mai târzie.');
spvE2eAssert((GtrotsInvoiceService::get($db, 'invoice-worker-early')['spv_status'] ?? '') === 'sent' && (GtrotsInvoiceService::get($db, 'invoice-worker-late')['spv_status'] ?? '') === 'sent', 'Ambele facturi scadente trebuie transmise.');
$workerUploads = array_values(array_filter($calls, static fn(array $call): bool => str_contains((string)$call['url'], '/upload')));
$lastWorkerUploads = array_slice($workerUploads, -2);
spvE2eAssert(str_contains((string)($lastWorkerUploads[0]['body'] ?? ''), 'invoice-worker-early') && str_contains((string)($lastWorkerUploads[1]['body'] ?? ''), 'invoice-worker-late'), 'Facturile trebuie încărcate după data și ora emiterii, nu după ordinea introducerii în coadă.');

$scenario = 'upload_error';
$insert->execute(['invoice-retry', 'invoice', '2026-09-04', '2026-09-04 12:30:00', 'not_sent', 'GT', '104']);
GtrotsSpvService::enqueue($db, 'invoice-retry', 'invoice');
try { GtrotsSpvService::sendManual($db, $config, 'invoice-retry'); }
catch (RuntimeException $expected) { }
$retryInvoice = GtrotsInvoiceService::get($db, 'invoice-retry');
$retryJob = $db->query("SELECT * FROM shop_spv_outbox WHERE invoice_id='invoice-retry'")->fetch();
spvE2eAssert(($retryInvoice['spv_status'] ?? '') === 'error' && ($retryJob['status'] ?? '') === 'retry', 'O indisponibilitate ANAF trebuie să programeze reîncercarea și să păstreze factura netrimisă.');

$disconnected = GtrotsSpvService::disconnect($db, $config);
spvE2eAssert($disconnected['connected'] === false, 'Deconectarea trebuie să elimine tokenurile utilizabile.');
GtrotsSpvService::setHttpTransportForTests(null);

echo "SPV end-to-end simulated transport tests passed.\n";
