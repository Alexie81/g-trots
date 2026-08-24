<?php
ini_set('display_errors', '0');
ini_set('log_errors', '1');
/**
 * G-Trots CRM - REST API
 *
 * Incarca acest fisier pe server la:
 *   https://cab-it.ro/trotty-api/api.php
 *
 * schema.sql poate fi rulat automat din desktop, din Settings.
 */

// â”€â”€â”€ Configuratie â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

define('SERVER_CONFIG_FILE', __DIR__ . '/api_config.local.php');

function loadServerRuntimeConfig(): array {
    if (!is_file(SERVER_CONFIG_FILE)) {
        return [];
    }
    $config = include SERVER_CONFIG_FILE;
    return is_array($config) ? $config : [];
}

$runtimeConfig = loadServerRuntimeConfig();

define('API_KEY', $runtimeConfig['api_key'] ?? (getenv('GTROTS_API_KEY') ?: ''));
define('DB_HOST', $runtimeConfig['db_host'] ?? (getenv('GTROTS_DB_HOST') ?: 'localhost'));
define('DB_NAME', $runtimeConfig['db_name'] ?? (getenv('GTROTS_DB_NAME') ?: ''));
define('DB_USER', $runtimeConfig['db_user'] ?? (getenv('GTROTS_DB_USER') ?: ''));
define('DB_PASS', $runtimeConfig['db_pass'] ?? (getenv('GTROTS_DB_PASS') ?: ''));
define(
    'SERVICE_SHEET_PDF_BASE_URL',
    $runtimeConfig['service_sheet_pdf_base_url'] ?? 'https://g-trots.ro/fs/'
);
define('DEFAULT_ADMIN_USER', 'admin');
define('DEFAULT_ADMIN_PASS', getenv('GTROTS_DEFAULT_ADMIN_PASS') ?: 'change-me-before-use');
define('DEFAULT_ADMIN_NAME', 'Administrator');
define('WHATSAPP_GRAPH_VERSION', getenv('WHATSAPP_GRAPH_VERSION') ?: 'v23.0');
define('WHATSAPP_PHONE_NUMBER_ID', getenv('WHATSAPP_PHONE_NUMBER_ID') ?: '');
define('WHATSAPP_ACCESS_TOKEN', getenv('WHATSAPP_ACCESS_TOKEN') ?: '');
define('MOBILE_APP_FALLBACK_VERSION', '1.2.5');
define('MOBILE_APP_FALLBACK_DOWNLOAD_URL', 'https://g-trots.ro/download-app/gTrots.apk');

// â”€â”€â”€ CORS + Headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Auth-Token');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$action = $_GET['action'] ?? '';
$id     = $_GET['id']     ?? '';
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

// â”€â”€â”€ Autentificare API Key â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? ($_GET['api_key'] ?? '');
if ($providedKey !== API_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit();
}

// â”€â”€â”€ Conectare la baza de date â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function connectDatabase(string $host, string $name, string $user, string $pass): PDO {
    return new PDO(
        'mysql:host=' . $host . ';dbname=' . $name . ';charset=utf8mb4',
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
}

function connectDatabaseServer(string $host, string $user, string $pass): PDO {
    return new PDO(
        'mysql:host=' . $host . ';charset=utf8mb4',
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
}

// â”€â”€â”€ Utilitare â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function uuid(): string {
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

function normalizeWhatsAppPhone(string $phone): string {
    $digits = preg_replace('/\D+/', '', $phone) ?? '';
    if (str_starts_with($digits, '00')) {
        $digits = substr($digits, 2);
    }
    if (str_starts_with($digits, '0') && strlen($digits) === 10) {
        $digits = '40' . substr($digits, 1);
    }
    return $digits;
}

function whatsappApiRequest(string $path, array $payload, bool $multipart = false): array {
    if (WHATSAPP_PHONE_NUMBER_ID === '' || WHATSAPP_ACCESS_TOKEN === '') {
        throw new RuntimeException('Configureaza WHATSAPP_PHONE_NUMBER_ID si WHATSAPP_ACCESS_TOKEN pe server.');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('Extensia PHP cURL nu este activa pe server.');
    }

    $url = 'https://graph.facebook.com/' . WHATSAPP_GRAPH_VERSION . '/' . ltrim($path, '/');
    $curl = curl_init($url);
    $headers = ['Authorization: Bearer ' . WHATSAPP_ACCESS_TOKEN];
    if (!$multipart) {
        $headers[] = 'Content-Type: application/json';
    }
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $multipart ? $payload : json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT => 30,
    ]);
    $raw = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($raw === false || $error !== '') {
        throw new RuntimeException('Eroare conexiune WhatsApp: ' . $error);
    }
    $response = json_decode($raw, true);
    if ($status < 200 || $status >= 300) {
        $message = $response['error']['message'] ?? ('WhatsApp API HTTP ' . $status);
        throw new RuntimeException($message);
    }
    return is_array($response) ? $response : [];
}

function tableExists(PDO $db, string $table): bool {
    static $cache = [];
    if (array_key_exists($table, $cache)) {
        return $cache[$table];
    }
    $stmt = $db->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?'
    );
    $stmt->execute([$table]);
    $cache[$table] = ((int)$stmt->fetchColumn()) > 0;
    return $cache[$table];
}

function columnExists(PDO $db, string $table, string $column): bool {
    $stmt = $db->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?'
    );
    $stmt->execute([$table, $column]);
    return ((int)$stmt->fetchColumn()) > 0;
}

function columnType(PDO $db, string $table, string $column): string {
    $stmt = $db->prepare(
        'SELECT COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1'
    );
    $stmt->execute([$table, $column]);
    return (string)($stmt->fetchColumn() ?: '');
}

function indexExists(PDO $db, string $table, string $index): bool {
    $stmt = $db->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND INDEX_NAME = ?'
    );
    $stmt->execute([$table, $index]);
    return ((int)$stmt->fetchColumn()) > 0;
}

function isDuplicateColumnError(PDOException $error): bool {
    $driverCode = isset($error->errorInfo[1]) ? (int)$error->errorInfo[1] : 0;
    return $driverCode === 1060 || stripos($error->getMessage(), 'Duplicate column name') !== false;
}

function isDuplicateIndexError(PDOException $error): bool {
    $driverCode = isset($error->errorInfo[1]) ? (int)$error->errorInfo[1] : 0;
    return $driverCode === 1061 || stripos($error->getMessage(), 'Duplicate key name') !== false;
}

function execIgnoringDuplicateColumn(PDO $db, string $sql): void {
    try {
        $db->exec($sql);
    } catch (PDOException $error) {
        if (!isDuplicateColumnError($error)) {
            throw $error;
        }
    }
}

function execIgnoringDuplicateIndex(PDO $db, string $sql): void {
    try {
        $db->exec($sql);
    } catch (PDOException $error) {
        if (!isDuplicateIndexError($error)) {
            throw $error;
        }
    }
}

function splitSqlStatements(string $sql): array {
    $statements = [];
    $buffer = '';
    $quote = null;
    $escaped = false;
    $length = strlen($sql);

    for ($i = 0; $i < $length; $i++) {
        $char = $sql[$i];

        if ($quote !== null) {
            $buffer .= $char;
            if ($escaped) {
                $escaped = false;
                continue;
            }
            if ($char === '\\') {
                $escaped = true;
                continue;
            }
            if ($char === $quote) {
                $quote = null;
            }
            continue;
        }

        if ($char === "'" || $char === '"' || $char === '`') {
            $quote = $char;
            $buffer .= $char;
            continue;
        }

        if ($char === ';') {
            $statement = trim($buffer);
            if ($statement !== '') {
                $statements[] = $statement;
            }
            $buffer = '';
            continue;
        }

        $buffer .= $char;
    }

    $statement = trim($buffer);
    if ($statement !== '') {
        $statements[] = $statement;
    }
    return $statements;
}

function runSchemaSql(PDO $targetDb): int {
    $schemaPath = __DIR__ . '/schema.sql';
    if (!is_file($schemaPath)) {
        throw new RuntimeException('schema.sql nu exista langa api.php pe server.');
    }
    $sql = file_get_contents($schemaPath);
    if ($sql === false || trim($sql) === '') {
        throw new RuntimeException('schema.sql este gol sau nu poate fi citit.');
    }

    $count = 0;
    foreach (splitSqlStatements($sql) as $statement) {
        $targetDb->exec($statement);
        $count++;
    }

    ensureAuthTables($targetDb);
    ensureCompanySettingsTable($targetDb);
    ensurePricePresetsTable($targetDb);
    ensureClientFinancialSchema($targetDb);
    ensureClientOwnershipSchema($targetDb);
    ensureClientAccessSchema($targetDb);
    ensureClientActivitySchema($targetDb);
    ensurePartnerContactSchema($targetDb);
    ensureCollaboratorPercentageSchema($targetDb);
    ensureCustomExpensesSchema($targetDb);
    ensureChatTables($targetDb);
    ensurePushNotificationTables($targetDb);
    ensureWhatsAppPredefinedMessagesTable($targetDb);
    ensureServiceSheetsTable($targetDb);
    return $count;
}

function writeServerRuntimeConfig(array $config): void {
    $payload = "<?php\nreturn " . var_export($config, true) . ";\n";
    $tmpPath = SERVER_CONFIG_FILE . '.tmp';
    if (file_put_contents($tmpPath, $payload, LOCK_EX) === false) {
        throw new RuntimeException('Nu pot scrie configuratia serverului.');
    }
    if (!rename($tmpPath, SERVER_CONFIG_FILE)) {
        @unlink($tmpPath);
        throw new RuntimeException('Nu pot salva configuratia serverului.');
    }
}

function prepareSystemDatabase(
    string $dbHost,
    string $dbName,
    string $dbUser,
    string $dbPass,
    bool $runSchema
): array {
    if ($dbHost === '' || $dbName === '' || $dbUser === '') {
        throw new InvalidArgumentException('DB host, DB name si DB user sunt obligatorii.');
    }
    if (strlen($dbName) > 64 || preg_match('/^[A-Za-z0-9_-]+$/', $dbName) !== 1) {
        throw new InvalidArgumentException(
            'DB Name poate contine doar litere, cifre, underscore si minus (maximum 64 caractere).'
        );
    }

    try {
        $serverDb = connectDatabaseServer($dbHost, $dbUser, $dbPass);
    } catch (PDOException $error) {
        throw new RuntimeException(
            'Conexiunea la serverul MySQL a esuat. Verifica DB Host, DB User si DB Password. ' .
            $error->getMessage()
        );
    }

    $existsStmt = $serverDb->prepare(
        'SELECT COUNT(*) FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?'
    );
    $existsStmt->execute([$dbName]);
    $databaseExisted = ((int)$existsStmt->fetchColumn()) > 0;

    if (!$databaseExisted) {
        try {
            $quotedDbName = '`' . str_replace('`', '``', $dbName) . '`';
            $serverDb->exec(
                'CREATE DATABASE ' . $quotedDbName .
                ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
            );
        } catch (PDOException $error) {
            throw new RuntimeException(
                'Baza de date nu exista, iar utilizatorul MySQL nu o poate crea. ' .
                'Acorda permisiunea CREATE DATABASE sau creeaz-o manual. ' . $error->getMessage()
            );
        }
    }

    try {
        $targetDb = connectDatabase($dbHost, $dbName, $dbUser, $dbPass);
    } catch (PDOException $error) {
        throw new RuntimeException(
            'Baza a fost gasita sau creata, dar conexiunea la ea a esuat. ' . $error->getMessage()
        );
    }

    $schemaStatements = 0;
    if ($runSchema) {
        $schemaStatements = runSchemaSql($targetDb);
    } else {
        ensureAuthTables($targetDb);
    }

    $adminStmt = $targetDb->prepare(
        'SELECT password_hash FROM app_users WHERE username = ? AND is_active = 1 LIMIT 1'
    );
    $adminStmt->execute([DEFAULT_ADMIN_USER]);
    $adminHash = (string)($adminStmt->fetchColumn() ?: '');

    return [
        'database_created' => !$databaseExisted,
        'schema_ran' => $runSchema,
        'schema_statements' => $schemaStatements,
        'default_admin_ready' => $adminHash !== '' && password_verify(DEFAULT_ADMIN_PASS, $adminHash),
    ];
}

function bootstrapSystem(array $body): array {
    $apiKey = trim((string)($body['api_key'] ?? API_KEY));
    $dbHost = trim((string)($body['db_host'] ?? ''));
    $dbName = trim((string)($body['db_name'] ?? ''));
    $dbUser = trim((string)($body['db_user'] ?? ''));
    $dbPass = (string)($body['db_pass'] ?? '');
    $serviceSheetPdfBaseUrl = normalizeServiceSheetPdfBaseUrl(
        (string)($body['service_sheet_pdf_base_url'] ?? SERVICE_SHEET_PDF_BASE_URL)
    );
    $runSchema = !array_key_exists('run_schema', $body) || !empty($body['run_schema']);

    if ($apiKey === '') {
        throw new InvalidArgumentException('API Key este obligatoriu.');
    }
    if ($runSchema && !is_file(__DIR__ . '/schema.sql')) {
        throw new RuntimeException(
            'schema.sql nu exista langa api.php pe noul server. Urca ambele fisiere in acelasi folder.'
        );
    }

    $databaseResult = prepareSystemDatabase(
        $dbHost,
        $dbName,
        $dbUser,
        $dbPass,
        $runSchema
    );

    writeServerRuntimeConfig(array_merge(loadServerRuntimeConfig(), [
        'api_key' => $apiKey,
        'db_host' => $dbHost,
        'db_name' => $dbName,
        'db_user' => $dbUser,
        'db_pass' => $dbPass,
        'service_sheet_pdf_base_url' => $serviceSheetPdfBaseUrl,
    ]));

    return array_merge($databaseResult, [
        'success' => true,
        'config_file_saved' => true,
        'target_database' => $dbName,
        'admin_username' => DEFAULT_ADMIN_USER,
        'default_admin_ready' => $databaseResult['default_admin_ready'],
        'message' => $databaseResult['default_admin_ready']
            ? 'Serverul a fost initializat. Te poti autentifica folosind admin / admin.'
            : 'Serverul a fost initializat, iar contul admin existent si-a pastrat parola.',
    ]);
}

function publicApiBaseUrl(): string {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return $scheme . '://' . $host . ($dir === '' ? '' : $dir);
}

function normalizeServiceSheetPdfBaseUrl(string $value): string {
    $value = trim($value);
    if ($value === '') {
        $value = 'https://g-trots.ro/fs/';
    }
    if (preg_match('#^https?://#i', $value) !== 1) {
        $value = 'https://' . ltrim($value, '/');
    }

    $parts = parse_url($value);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
        throw new InvalidArgumentException(
            'Adresa pentru fisele de service trebuie sa fie un URL valid http:// sau https://.'
        );
    }

    $path = str_replace('\\', '/', rawurldecode((string)($parts['path'] ?? '/')));
    $segments = [];
    foreach (explode('/', $path) as $segment) {
        if ($segment === '') {
            continue;
        }
        if ($segment === '.' || $segment === '..') {
            throw new InvalidArgumentException('Adresa fiselor de service contine o cale invalida.');
        }
        $segments[] = rawurlencode($segment);
    }
    $normalizedPath = '/' . ($segments ? implode('/', $segments) . '/' : '');
    $port = isset($parts['port']) ? ':' . (int)$parts['port'] : '';
    return $scheme . '://' . $host . $port . $normalizedPath;
}

function serviceSheetPdfStorageDirectory(string $baseUrl): string {
    $parts = parse_url($baseUrl);
    $host = strtolower((string)($parts['host'] ?? ''));
    $path = str_replace('\\', '/', rawurldecode((string)($parts['path'] ?? '/fs/')));
    $pathSegments = [];
    foreach (explode('/', $path) as $segment) {
        if ($segment === '') {
            continue;
        }
        if ($segment === '.' || $segment === '..') {
            throw new InvalidArgumentException('Folderul fiselor de service este invalid.');
        }
        $pathSegments[] = $segment;
    }

    $publicRoot = dirname(__DIR__);
    $requestHost = strtolower(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
    $plainHost = preg_replace('/^www\./', '', $host);
    $plainRequestHost = preg_replace('/^www\./', '', $requestHost);

    if ($plainHost !== '' && $plainHost !== $plainRequestHost) {
        $accountRoot = dirname($publicRoot);
        $domainRootFound = false;
        $domainRootCandidates = [
            $accountRoot . DIRECTORY_SEPARATOR . $plainHost,
            $publicRoot . DIRECTORY_SEPARATOR . $plainHost,
        ];
        foreach ($domainRootCandidates as $candidate) {
            if (is_dir($candidate)) {
                $publicRoot = $candidate;
                $domainRootFound = true;
                break;
            }
        }
        if (!$domainRootFound) {
            throw new RuntimeException(
                'Domeniul configurat pentru fisele de service nu are un folder local pe acest hosting.'
            );
        }
    }

    return $publicRoot . ($pathSegments
        ? DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $pathSegments)
        : '');
}

function storeServiceSheetPdfPublicly(array $sheet, string $pdf): array {
    $baseName = serviceSheetPdfBaseName($sheet);
    $suffix = serviceSheetPdfSuffix($sheet);
    $revisionSeed = implode('|', [
        (string)($sheet['id'] ?? ''),
        (string)($sheet['updated_at'] ?? ''),
        (string)($sheet['service_pdf_generated_at'] ?? ''),
        sprintf('%.6F', microtime(true)),
        (string)random_int(100000, 999999),
    ]);
    $revision = gmdate('YmdHis') . '-' . substr(sha1($revisionSeed), 0, 8);
    $filename = $baseName . '-' . $suffix . '-' . $revision . '.pdf';
    $baseUrl = normalizeServiceSheetPdfBaseUrl((string)SERVICE_SHEET_PDF_BASE_URL);
    $dir = serviceSheetPdfStorageDirectory($baseUrl);

    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        throw new RuntimeException('Folderul configurat pentru PDF-uri nu a putut fi creat.');
    }
    deleteServiceSheetPublicFiles($sheet);
    $indexPath = $dir . DIRECTORY_SEPARATOR . 'index.html';
    if (!is_file($indexPath)) {
        @file_put_contents($indexPath, '');
    }
    $path = $dir . DIRECTORY_SEPARATOR . $filename;
    if (file_put_contents($path, $pdf, LOCK_EX) === false) {
        throw new RuntimeException('PDF-ul nu a putut fi salvat in folderul configurat.');
    }
    @chmod($path, 0644);

    return [
        'share_url' => $baseUrl . rawurlencode($filename),
        'base_url' => $baseUrl,
        'filename' => $filename,
        'path' => $path,
        'bytes' => strlen($pdf),
    ];
}

function rememberServiceSheetPdf(PDO $db, string $sheetId, array $stored): void {
    if ($sheetId === '') {
        return;
    }
    $stmt = $db->prepare(
        'UPDATE service_sheets
         SET service_pdf_base_url = ?,
             service_pdf_filename = ?,
             service_pdf_share_url = ?,
             service_pdf_generated_at = NOW(),
             updated_at = updated_at
         WHERE id = ?'
    );
    $stmt->execute([
        (string)($stored['base_url'] ?? ''),
        (string)($stored['filename'] ?? ''),
        (string)($stored['share_url'] ?? ''),
        $sheetId,
    ]);
}

function serviceSheetPdfBaseName(array $sheet): string {
    $baseName = preg_replace(
        '/[^A-Za-z0-9_.-]+/',
        '-',
        (string)($sheet['sheet_number'] ?? 'fisa-service')
    );
    return $baseName ?: 'fisa-service';
}

function serviceSheetPdfSuffix(array $sheet): string {
    $sheetId = (string)($sheet['id'] ?? ($sheet['sheet_number'] ?? 'fisa-service'));
    return substr(sha1($sheetId), 0, 10);
}

function serviceSheetPdfBaseUrlFromShareUrl(string $shareUrl): string {
    $parts = parse_url($shareUrl);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
        throw new InvalidArgumentException('URL-ul PDF salvat este invalid.');
    }

    $path = str_replace('\\', '/', rawurldecode((string)($parts['path'] ?? '/')));
    $segments = [];
    foreach (explode('/', $path) as $segment) {
        if ($segment === '') {
            continue;
        }
        if ($segment === '.' || $segment === '..') {
            throw new InvalidArgumentException('URL-ul PDF salvat contine o cale invalida.');
        }
        $segments[] = $segment;
    }
    if ($segments) {
        array_pop($segments);
    }
    $port = isset($parts['port']) ? ':' . (int)$parts['port'] : '';
    $folderPath = $segments ? '/' . implode('/', array_map('rawurlencode', $segments)) . '/' : '/';
    return normalizeServiceSheetPdfBaseUrl($scheme . '://' . $host . $port . $folderPath);
}

function safePdfBasename(string $filename): string {
    $filename = basename(str_replace('\\', '/', rawurldecode(trim($filename))));
    if ($filename === '' || $filename === '.' || $filename === '..') {
        return '';
    }
    return preg_match('/\.pdf$/i', $filename) ? $filename : '';
}

function serviceSheetPdfCandidateFilenames(array $sheet): array {
    $baseName = serviceSheetPdfBaseName($sheet);
    $suffix = serviceSheetPdfSuffix($sheet);
    $filenames = [
        $baseName . '-' . $suffix . '.pdf',
        $baseName . '.pdf',
    ];

    $storedFilename = safePdfBasename((string)($sheet['service_pdf_filename'] ?? ''));
    if ($storedFilename !== '') {
        $filenames[] = $storedFilename;
    }

    $sharePath = (string)(parse_url((string)($sheet['service_pdf_share_url'] ?? ''), PHP_URL_PATH) ?: '');
    $shareFilename = safePdfBasename($sharePath);
    if ($shareFilename !== '') {
        $filenames[] = $shareFilename;
    }

    return array_values(array_unique($filenames));
}

function safeDeleteFileInsideDirectory(string $directory, string $filePath): bool {
    $realDirectory = realpath($directory);
    $realFile = realpath($filePath);
    if ($realDirectory === false || $realFile === false || !is_file($realFile)) {
        return false;
    }

    $realDirectory = rtrim($realDirectory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    if (!str_starts_with($realFile, $realDirectory)) {
        throw new RuntimeException('Refuz stergerea unui fisier in afara folderului fiselor de service.');
    }

    if (!preg_match('/\.pdf$/i', $realFile)) {
        throw new RuntimeException('Refuz stergerea unui fisier care nu este PDF.');
    }

    return @unlink($realFile);
}

function deleteServiceSheetPublicFiles(array $sheet): array {
    $baseName = serviceSheetPdfBaseName($sheet);
    $suffix = serviceSheetPdfSuffix($sheet);
    $baseUrls = [
        normalizeServiceSheetPdfBaseUrl((string)SERVICE_SHEET_PDF_BASE_URL),
        normalizeServiceSheetPdfBaseUrl('https://g-trots.ro/fs/'),
        normalizeServiceSheetPdfBaseUrl('https://cab-it.ro/fs/'),
    ];
    if (!empty($sheet['service_pdf_base_url'])) {
        try {
            array_unshift($baseUrls, normalizeServiceSheetPdfBaseUrl((string)$sheet['service_pdf_base_url']));
        } catch (Throwable $error) {
            // Ignoram URL-uri vechi invalide si continuam cu fallback-urile sigure.
        }
    }
    if (!empty($sheet['service_pdf_share_url'])) {
        try {
            array_unshift($baseUrls, serviceSheetPdfBaseUrlFromShareUrl((string)$sheet['service_pdf_share_url']));
        } catch (Throwable $error) {
            // Ignoram URL-uri vechi invalide si continuam cu fallback-urile sigure.
        }
    }
    $baseUrls = array_values(array_unique($baseUrls));
    $candidateFilenames = serviceSheetPdfCandidateFilenames($sheet);

    $deleted = [];
    $errors = [];
    foreach ($baseUrls as $baseUrl) {
        try {
            $dir = serviceSheetPdfStorageDirectory($baseUrl);
            if (!is_dir($dir)) {
                continue;
            }

            $candidates = [];
            foreach ($candidateFilenames as $candidateFilename) {
                $candidates[$dir . DIRECTORY_SEPARATOR . $candidateFilename] = true;
            }
            $matches = glob($dir . DIRECTORY_SEPARATOR . $baseName . '-' . $suffix . '*.pdf', GLOB_NOSORT);
            if (is_array($matches)) {
                foreach ($matches as $match) {
                    $candidates[$match] = true;
                }
            }

            foreach (array_keys($candidates) as $candidate) {
                if (safeDeleteFileInsideDirectory($dir, $candidate)) {
                    $deleted[] = basename($candidate);
                }
            }
        } catch (Throwable $error) {
            $errors[] = $error->getMessage();
        }
    }

    return [
        'deleted_files' => array_values(array_unique($deleted)),
        'file_errors' => array_values(array_unique($errors)),
    ];
}

function normalizeVersionString(string $version): string {
    $version = trim($version);
    return ltrim($version, "vV \t\n\r\0\x0B");
}

function readMobileUpdateManifest(): array {
    $manifestPaths = [
        __DIR__ . '/mobile-latest.json',
        dirname(__DIR__) . '/download-app/mobile-latest.json',
        dirname(__DIR__) . '/website_downloads/mobile-latest.json',
    ];

    foreach ($manifestPaths as $path) {
        if (!is_file($path)) {
            continue;
        }
        $raw = file_get_contents($path);
        if ($raw !== false) {
            $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
        }
        $json = $raw !== false ? json_decode($raw, true) : null;
        if (is_array($json)) {
            return $json;
        }
    }

    return [];
}

function mobileAppUpdateInfo(string $currentVersion): array {
    $manifest = readMobileUpdateManifest();
    $latestVersion = normalizeVersionString(
        (string)($manifest['version'] ?? $manifest['available_version'] ?? MOBILE_APP_FALLBACK_VERSION)
    );
    $currentVersion = normalizeVersionString($currentVersion !== '' ? $currentVersion : MOBILE_APP_FALLBACK_VERSION);
    $downloadUrl = trim((string)($manifest['download_url'] ?? $manifest['url'] ?? MOBILE_APP_FALLBACK_DOWNLOAD_URL));
    $releaseNotesValue = $manifest['release_notes'] ?? $manifest['notes'] ?? '';
    $releaseNotes = is_array($releaseNotesValue)
        ? implode("\n", array_map('strval', $releaseNotesValue))
        : trim((string)$releaseNotesValue);
    $updateAvailable = version_compare($latestVersion, $currentVersion, '>');

    return [
        'platform'          => 'android',
        'current_version'   => $currentVersion,
        'available_version' => $latestVersion,
        'update_available'  => $updateAvailable,
        'download_url'      => $downloadUrl,
        'release_notes'     => $releaseNotes,
        'message'           => $updateAvailable
            ? 'Este disponibila o versiune noua pentru Android.'
            : 'Ai deja cea mai noua versiune pentru Android.',
    ];
}

function buildCollaborator(array $row): array {
    return [
        'id'         => $row['id'],
        'name'       => $row['name'],
        'role'       => $row['role'] ?? '',
        'phone'      => $row['phone'] ?? '',
        'email'      => $row['email'] ?? '',
        'percentage' => (float)($row['percentage'] ?? 0),
        'color'      => $row['color'] ?? '#14B8A6',
        'created_at' => $row['created_at'] ?? '',
    ];
}

function collaboratorCostsPayloadTotal(array $costs, float $baseBeforeCollaborators = 0.0): float {
    $fixedTotal = 0.0;
    foreach ($costs as $cost) {
        $costType = ($cost['cost_type'] ?? 'fixed') === 'percentage' ? 'percentage' : 'fixed';
        if ($costType === 'fixed') {
            $fixedTotal += max((float)($cost['cost'] ?? 0), 0);
        }
    }
    $percentageNetBase = max($baseBeforeCollaborators - $fixedTotal, 0);
    $total = $fixedTotal;
    foreach ($costs as $cost) {
        if (($cost['cost_type'] ?? 'fixed') !== 'percentage') {
            continue;
        }
        $percentage = min(100, max((float)($cost['percentage'] ?? 0), 0));
        $total += $percentageNetBase * ($percentage / 100);
    }
    return $total;
}

function profilePercentage(PDO $db, ?string $profileId): float {
    if (!$profileId || !tableExists($db, 'profiles')) {
        return 0.0;
    }
    $stmt = $db->prepare('SELECT percentage FROM profiles WHERE id = ?');
    $stmt->execute([$profileId]);
    return min(100, max((float)($stmt->fetchColumn() ?: 0), 0));
}

function collaboratorBaseBeforeCosts(
    PDO $db,
    float $revenue,
    ?string $profileId,
    float $parts,
    float $otherExpenses
): float {
    $profileCost = max($revenue, 0) * (profilePercentage($db, $profileId) / 100);
    return max(max($revenue, 0) - $profileCost - max($parts, 0) - max($otherExpenses, 0), 0);
}

function getClientCollaboratorCosts(PDO $db, string $clientId): array {
    if (!tableExists($db, 'client_collaborator_costs')) {
        return [];
    }

    $stmt = $db->prepare(
        "SELECT cc.id, cc.collaborator_id,
                COALESCE(co.name, cc.collaborator_name) AS collaborator_name,
                COALESCE(co.role, '') AS collaborator_role,
                COALESCE(co.color, cc.collaborator_color) AS collaborator_color,
                cc.cost_type, cc.percentage, cc.net_base, cc.cost,
                COALESCE(cc.payment_status, 'de_incasat') AS payment_status,
                cc.created_at
         FROM client_collaborator_costs cc
         LEFT JOIN collaborators co ON cc.collaborator_id = co.id
         WHERE cc.client_id = ?
         ORDER BY collaborator_name ASC"
    );
    $stmt->execute([$clientId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['cost_type'] = ($row['cost_type'] ?? 'fixed') === 'percentage' ? 'percentage' : 'fixed';
        $row['percentage'] = (float)($row['percentage'] ?? 0);
        $row['net_base'] = (float)($row['net_base'] ?? 0);
        $row['cost'] = (float)$row['cost'];
        $row['payment_status'] = normalizePaymentStatus($row['payment_status'] ?? 'de_incasat');
    }
    return $rows;
}

function saveClientCollaboratorCosts(
    PDO $db,
    string $clientId,
    array $costs,
    float $baseBeforeCollaborators = 0.0
): float {
    if (!tableExists($db, 'client_collaborator_costs') || !tableExists($db, 'collaborators')) {
        return collaboratorCostsPayloadTotal($costs, $baseBeforeCollaborators);
    }

    $deleteStmt = $db->prepare('DELETE FROM client_collaborator_costs WHERE client_id = ?');
    $deleteStmt->execute([$clientId]);

    $selectStmt = $db->prepare('SELECT * FROM collaborators WHERE id = ?');
    $insertStmt = $db->prepare(
        'INSERT INTO client_collaborator_costs
         (id, client_id, collaborator_id, collaborator_name, collaborator_color, cost_type, percentage, net_base, cost, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    $validItems = [];
    $fixedTotal = 0.0;
    foreach ($costs as $item) {
        $collaboratorId = trim($item['collaborator_id'] ?? '');
        if ($collaboratorId === '') {
            continue;
        }
        $selectStmt->execute([$collaboratorId]);
        $collaborator = $selectStmt->fetch();
        if (!$collaborator) {
            continue;
        }
        $costType = ($item['cost_type'] ?? 'fixed') === 'percentage' ? 'percentage' : 'fixed';
        $percentage = $costType === 'percentage'
            ? min(100, max((float)($item['percentage'] ?? $collaborator['percentage'] ?? 0), 0))
            : 0.0;
        $fixedCost = $costType === 'fixed' ? max((float)($item['cost'] ?? 0), 0) : 0.0;
        $paymentStatus = normalizePaymentStatus($item['payment_status'] ?? 'de_incasat');
        $fixedTotal += $fixedCost;
        $validItems[] = compact('collaboratorId', 'collaborator', 'costType', 'percentage', 'fixedCost', 'paymentStatus');
    }

    $percentageNetBase = max($baseBeforeCollaborators - $fixedTotal, 0);
    $total = 0.0;
    foreach ($validItems as $item) {
        $collaboratorId = $item['collaboratorId'];
        $collaborator = $item['collaborator'];
        $costType = $item['costType'];
        $percentage = $item['percentage'];
        $paymentStatus = $item['paymentStatus'];
        $cost = $costType === 'percentage'
            ? $percentageNetBase * ($percentage / 100)
            : $item['fixedCost'];
        $insertStmt->execute([
            uuid(),
            $clientId,
            $collaboratorId,
            $collaborator['name'],
            $collaborator['color'] ?? '#14B8A6',
            $costType,
            $percentage,
            $percentageNetBase,
            $cost,
            $paymentStatus,
        ]);
        $total += $cost;
    }

    return $total;
}

function buildExpenseCategory(array $row): array {
    return [
        'id'         => $row['id'],
        'name'       => $row['name'],
        'color'      => $row['color'] ?? '#EF4444',
        'created_at' => $row['created_at'] ?? '',
    ];
}

function normalizePaymentStatus($value, ?float $amountDue = null, ?float $total = null): string {
    $status = trim((string)($value ?? ''));
    if (in_array($status, ['incasati', 'de_incasat'], true)) {
        return $status;
    }
    return $total !== null && $total > 0 && $amountDue !== null && $amountDue <= 0.00001
        ? 'incasati'
        : 'de_incasat';
}

function applyPaymentStatusToFinancials(array $financials, string $paymentStatus): array {
    $total = max((float)($financials['total'] ?? 0), 0);
    $advance = max((float)($financials['advance'] ?? 0), 0);
    $amountDue = max((float)($financials['amount_due'] ?? max($total - $advance, 0)), 0);
    $financials['amount_due'] = $amountDue;
    $financials['payment_status'] = $paymentStatus;
    $financials['collected'] = $paymentStatus === 'incasati'
        ? $total
        : min($advance, $total);
    $financials['on_hold'] = $paymentStatus === 'incasati'
        ? 0.0
        : $amountDue;
    return $financials;
}

function paymentStatusFromFinancials($value, array $financials): string {
    $total = max((float)($financials['total'] ?? 0), 0);
    $advance = max((float)($financials['advance'] ?? 0), 0);
    if ($total > 0 && $advance + 0.00001 >= $total) {
        return 'incasati';
    }
    return normalizePaymentStatus(
        $value,
        max((float)($financials['amount_due'] ?? max($total - $advance, 0)), 0),
        $total
    );
}

function normalizeCurrencyCode($value): string {
    $currency = strtoupper(trim((string)($value ?? 'RON')));
    return preg_match('/^[A-Z]{3}$/', $currency) ? $currency : 'RON';
}

function normalizeDeadlineUnit($value): string {
    $unit = strtolower(trim((string)($value ?? 'zile')));
    $unit = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $unit) ?: $unit;
    $unit = strtolower(trim($unit));
    $aliases = [
        'minut' => 'minute',
        'minute' => 'minute',
        'ora' => 'ore',
        'ore' => 'ore',
        'zi' => 'zile',
        'zile' => 'zile',
        'saptamana' => 'saptamani',
        'saptamani' => 'saptamani',
        'luna' => 'luni',
        'luni' => 'luni',
        'an' => 'ani',
        'ani' => 'ani',
    ];
    return $aliases[$unit] ?? 'zile';
}

function durationNumberValue($value): string {
    $raw = str_replace(',', '.', trim((string)($value ?? '')));
    return preg_match('/\d+(?:\.\d+)?/', $raw, $match) ? $match[0] : '';
}

function durationUnitFromText($value, string $fallback = 'zile'): string {
    $raw = strtolower(trim((string)($value ?? '')));
    $raw = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $raw) ?: $raw;
    if (preg_match('/(?:^|[\d\s,.])([a-z]+)\s*$/', $raw, $match)) {
        return normalizeDeadlineUnit($match[1]);
    }
    return normalizeDeadlineUnit($fallback);
}

function durationLabel($value, $unit = 'zile'): string {
    $number = durationNumberValue($value);
    if ($number === '') {
        return '';
    }
    $unit = normalizeDeadlineUnit($unit);
    $labels = [
        'minute' => ['minut', 'minute'],
        'ore' => ['ora', 'ore'],
        'zile' => ['zi', 'zile'],
        'saptamani' => ['saptamana', 'saptamani'],
        'luni' => ['luna', 'luni'],
        'ani' => ['an', 'ani'],
    ];
    $pair = $labels[$unit] ?? $labels['zile'];
    $numeric = (float)$number;
    return $number . ' ' . (abs($numeric - 1.0) < 0.00001 ? $pair[0] : $pair[1]);
}

function warrantyLabel($value): string {
    $number = durationNumberValue($value);
    if ($number === '') {
        return '';
    }
    return durationLabel($number, durationUnitFromText($value, 'zile'));
}

function calculatedClientFinancials(float $price, float $predefinedPrice, float $discount, float $advance): array {
    $price = max($price, 0);
    $predefinedPrice = max($predefinedPrice, 0);
    $gross = $price > 0 ? $price : $predefinedPrice;
    $discount = min(100, max(0, $discount));
    $total = max($gross * (1 - $discount / 100), 0);
    $advance = max($advance, 0);
    return [
        'total' => $total,
        'advance' => $advance,
        'amount_due' => max($total - $advance, 0),
    ];
}


function normalizeClientGrossPriceFromPayload(
    float $incomingPrice,
    float $predefinedPrice,
    float $discount,
    ?float $currentPrice = null
): float {
    $incomingPrice = max($incomingPrice, 0);
    $predefinedPrice = max($predefinedPrice, 0);
    if ($incomingPrice <= 0 && $predefinedPrice > 0) {
        return $predefinedPrice;
    }

    $discount = min(100, max(0, $discount));
    if ($incomingPrice <= 0 || $discount <= 0 || $discount >= 100) {
        return $incomingPrice;
    }

    $factor = 1 - ($discount / 100);
    $candidates = [];
    $currentPrice = $currentPrice !== null ? max($currentPrice, 0) : 0;
    if ($currentPrice > 0) {
        $candidates[] = $currentPrice;
    }
    if ($predefinedPrice > 0) {
        $candidates[] = $predefinedPrice;
    }

    foreach (array_unique($candidates) as $grossCandidate) {
        $discountedCandidate = $grossCandidate * $factor;
        $tolerance = max(0.05, $grossCandidate * 0.0005);
        if (abs($incomingPrice - $discountedCandidate) <= $tolerance) {
            return $grossCandidate;
        }
    }

    return $incomingPrice;
}

function serviceSheetWorkPriceValue(array $sheet): float {
    $totalPrice = moneyValue($sheet['total_price'] ?? 0);
    $diagnosticPrice = moneyValue($sheet['diagnostic_price'] ?? 0);
    return $totalPrice > 0 ? $totalPrice : $diagnosticPrice;
}

function calculatedServiceSheetFinancials(array $sheet): array {
    return calculatedClientFinancials(
        serviceSheetWorkPriceValue($sheet),
        moneyValue($sheet['diagnostic_price'] ?? 0),
        (float)($sheet['client_discount'] ?? 0),
        moneyValue($sheet['advance_amount'] ?? 0)
    );
}

function buildPricePreset(array $row): array {
    return [
        'id'         => $row['id'],
        'label'      => $row['label'],
        'price'      => (float)($row['price'] ?? 0),
        'is_active'  => (bool)($row['is_active'] ?? true),
        'created_at' => $row['created_at'] ?? '',
        'updated_at' => $row['updated_at'] ?? '',
    ];
}

function expenseCostsPayloadTotal(array $costs): float {
    $total = 0.0;
    foreach ($costs as $cost) {
        $total += max((float)($cost['cost'] ?? 0), 0);
    }
    return $total;
}

function getClientExpenseCosts(PDO $db, string $clientId): array {
    if (!tableExists($db, 'client_expense_costs')) {
        return [];
    }

    $stmt = $db->prepare(
        'SELECT ce.id, ce.expense_id,
                COALESCE(ec.name, ce.expense_name) AS expense_name,
                COALESCE(ec.color, ce.expense_color) AS expense_color,
                ce.cost, ce.created_at
         FROM client_expense_costs ce
         LEFT JOIN expense_categories ec ON ce.expense_id = ec.id
         WHERE ce.client_id = ?
         ORDER BY expense_name ASC'
    );
    $stmt->execute([$clientId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['cost'] = (float)$row['cost'];
    }
    return $rows;
}

function saveClientExpenseCosts(PDO $db, string $clientId, array $costs): float {
    if (!tableExists($db, 'client_expense_costs') || !tableExists($db, 'expense_categories')) {
        return expenseCostsPayloadTotal($costs);
    }

    // Past values whose category was deleted remain immutable snapshots.
    $db->prepare('DELETE FROM client_expense_costs WHERE client_id = ? AND expense_id IS NOT NULL')
        ->execute([$clientId]);
    $selectStmt = $db->prepare('SELECT * FROM expense_categories WHERE id = ?');
    $insertStmt = $db->prepare(
        'INSERT INTO client_expense_costs
         (id, client_id, expense_id, expense_name, expense_color, cost)
         VALUES (?, ?, ?, ?, ?, ?)'
    );

    $total = 0.0;
    foreach ($costs as $item) {
        $expenseId = trim($item['expense_id'] ?? '');
        $cost = max((float)($item['cost'] ?? 0), 0);
        if ($expenseId === '') {
            continue;
        }
        $selectStmt->execute([$expenseId]);
        $expense = $selectStmt->fetch();
        if (!$expense) {
            continue;
        }
        $insertStmt->execute([
            uuid(),
            $clientId,
            $expenseId,
            $expense['name'],
            $expense['color'] ?? '#EF4444',
            $cost,
        ]);
        $total += $cost;
    }
    $sumStmt = $db->prepare('SELECT COALESCE(SUM(cost), 0) FROM client_expense_costs WHERE client_id = ?');
    $sumStmt->execute([$clientId]);
    return (float)$sumStmt->fetchColumn();
}

function ensureCustomExpensesSchema(PDO $db): void {
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `expense_categories` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `name` VARCHAR(255) NOT NULL,
          `color` VARCHAR(7) NOT NULL DEFAULT '#EF4444',
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    if (tableExists($db, 'clients') && !columnExists($db, 'clients', 'service_parts_price')) {
        $db->exec(
            'ALTER TABLE clients
             ADD COLUMN service_parts_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER valoare_piese'
        );
    }
    if (tableExists($db, 'clients') && !columnExists($db, 'clients', 'service_labor_price')) {
        $db->exec(
            'ALTER TABLE clients
             ADD COLUMN service_labor_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER service_parts_price'
        );
    }
    if (tableExists($db, 'clients') && !columnExists($db, 'clients', 'alte_cheltuieli')) {
        $db->exec(
            'ALTER TABLE clients
             ADD COLUMN alte_cheltuieli DECIMAL(10,2) NULL DEFAULT NULL AFTER valoare_piese'
        );
    }
    foreach (['manopera_colaboratori', 'valoare_piese', 'alte_cheltuieli'] as $nullableCostColumn) {
        if (!columnExists($db, 'clients', $nullableCostColumn)) {
            continue;
        }
        $columnInfo = $db->query("SHOW COLUMNS FROM clients LIKE " . $db->quote($nullableCostColumn))->fetch();
        if ($columnInfo && strtoupper((string)($columnInfo['Null'] ?? 'NO')) !== 'YES') {
            $db->exec("ALTER TABLE clients MODIFY COLUMN `{$nullableCostColumn}` DECIMAL(10,2) NULL DEFAULT NULL");
        }
    }

    $db->exec(
        "CREATE TABLE IF NOT EXISTS `client_expense_costs` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `client_id` CHAR(36) NOT NULL,
          `expense_id` CHAR(36) DEFAULT NULL,
          `expense_name` VARCHAR(255) NOT NULL,
          `expense_color` VARCHAR(7) NOT NULL DEFAULT '#EF4444',
          `cost` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY `idx_client_expense_client` (`client_id`),
          KEY `idx_client_expense_category` (`expense_id`),
          CONSTRAINT `fk_client_expense_client`
            FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT `fk_client_expense_category`
            FOREIGN KEY (`expense_id`) REFERENCES `expense_categories`(`id`)
            ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function ensureAuthTables(PDO $db): void {
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `app_users` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `username` VARCHAR(80) NOT NULL,
          `password_hash` VARCHAR(255) NOT NULL,
          `display_name` VARCHAR(255) NOT NULL,
          `role` ENUM('admin','manager','user') NOT NULL DEFAULT 'user',
          `platform_access` ENUM('desktop','mobile','both') NOT NULL DEFAULT 'mobile',
          `support_chat_access` TINYINT(1) NOT NULL DEFAULT 0,
          `client_panel_access` TINYINT(1) NOT NULL DEFAULT 1,
          `client_edit_access` TINYINT(1) NOT NULL DEFAULT 0,
          `service_sheet_access` TINYINT(1) NOT NULL DEFAULT 1,
          `client_financial_access` TINYINT(1) NOT NULL DEFAULT 1,
          `is_active` TINYINT(1) NOT NULL DEFAULT 1,
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY `uq_app_users_username` (`username`),
          KEY `idx_app_users_role` (`role`),
          KEY `idx_app_users_platform` (`platform_access`),
          KEY `idx_app_users_support_chat` (`support_chat_access`),
          KEY `idx_app_users_client_panel` (`client_panel_access`),
          KEY `idx_app_users_client_edit` (`client_edit_access`),
          KEY `idx_app_users_service_sheet` (`service_sheet_access`),
          KEY `idx_app_users_client_financial` (`client_financial_access`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    if (!columnExists($db, 'app_users', 'support_chat_access')) {
        execIgnoringDuplicateColumn($db,
            'ALTER TABLE app_users
             ADD COLUMN support_chat_access TINYINT(1) NOT NULL DEFAULT 0 AFTER platform_access'
        );
    }
    if (columnExists($db, 'app_users', 'support_chat_access') && !indexExists($db, 'app_users', 'idx_app_users_support_chat')) {
        execIgnoringDuplicateIndex($db, 'ALTER TABLE app_users ADD KEY idx_app_users_support_chat (support_chat_access)');
    }
    if (!columnExists($db, 'app_users', 'client_panel_access')) {
        execIgnoringDuplicateColumn($db,
            'ALTER TABLE app_users
             ADD COLUMN client_panel_access TINYINT(1) NOT NULL DEFAULT 1 AFTER support_chat_access'
        );
    }
    if (columnExists($db, 'app_users', 'client_panel_access') && !indexExists($db, 'app_users', 'idx_app_users_client_panel')) {
        execIgnoringDuplicateIndex($db, 'ALTER TABLE app_users ADD KEY idx_app_users_client_panel (client_panel_access)');
    }
    if (!columnExists($db, 'app_users', 'client_edit_access')) {
        execIgnoringDuplicateColumn($db,
            'ALTER TABLE app_users
             ADD COLUMN client_edit_access TINYINT(1) NOT NULL DEFAULT 0 AFTER client_panel_access'
        );
    }
    if (columnExists($db, 'app_users', 'client_edit_access') && !indexExists($db, 'app_users', 'idx_app_users_client_edit')) {
        execIgnoringDuplicateIndex($db, 'ALTER TABLE app_users ADD KEY idx_app_users_client_edit (client_edit_access)');
    }
    if (!columnExists($db, 'app_users', 'service_sheet_access')) {
        execIgnoringDuplicateColumn($db,
            'ALTER TABLE app_users
             ADD COLUMN service_sheet_access TINYINT(1) NOT NULL DEFAULT 1 AFTER client_edit_access'
        );
    }
    if (columnExists($db, 'app_users', 'service_sheet_access') && !indexExists($db, 'app_users', 'idx_app_users_service_sheet')) {
        execIgnoringDuplicateIndex($db, 'ALTER TABLE app_users ADD KEY idx_app_users_service_sheet (service_sheet_access)');
    }
    if (!columnExists($db, 'app_users', 'client_financial_access')) {
        execIgnoringDuplicateColumn($db,
            'ALTER TABLE app_users
             ADD COLUMN client_financial_access TINYINT(1) NOT NULL DEFAULT 1 AFTER service_sheet_access'
        );
    }
    if (columnExists($db, 'app_users', 'client_financial_access') && !indexExists($db, 'app_users', 'idx_app_users_client_financial')) {
        execIgnoringDuplicateIndex($db, 'ALTER TABLE app_users ADD KEY idx_app_users_client_financial (client_financial_access)');
    }

    $platformColumn = $db->query("SHOW COLUMNS FROM app_users LIKE 'platform_access'")->fetch();
    if ($platformColumn && strpos((string)($platformColumn['Type'] ?? ''), "'both'") === false) {
        $db->exec(
            "ALTER TABLE app_users
             MODIFY COLUMN platform_access ENUM('desktop','mobile','both') NOT NULL DEFAULT 'mobile'"
        );
    }

    $db->exec(
        "CREATE TABLE IF NOT EXISTS `app_sessions` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `user_id` CHAR(36) NOT NULL,
          `token_hash` CHAR(64) NOT NULL,
          `platform` ENUM('desktop','mobile') NOT NULL,
          `expires_at` TIMESTAMP NOT NULL,
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY `uq_app_sessions_token` (`token_hash`),
          KEY `idx_app_sessions_user` (`user_id`),
          KEY `idx_app_sessions_expires` (`expires_at`),
          FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $stmt = $db->prepare('SELECT id FROM app_users WHERE username = ? LIMIT 1');
    $stmt->execute([DEFAULT_ADMIN_USER]);
    if (!$stmt->fetch()) {
        $insert = $db->prepare(
            'INSERT INTO app_users (id, username, password_hash, display_name, role, platform_access, support_chat_access, client_panel_access, client_edit_access, service_sheet_access, client_financial_access, is_active)
             VALUES (?, ?, ?, ?, "admin", "both", 1, 1, 1, 1, 1, 1)'
        );
        $insert->execute([
            uuid(),
            DEFAULT_ADMIN_USER,
            password_hash(DEFAULT_ADMIN_PASS, PASSWORD_DEFAULT),
            DEFAULT_ADMIN_NAME,
        ]);
    }

    $rootAdminStmt = $db->prepare(
        'UPDATE app_users
         SET role = "admin", platform_access = "both", support_chat_access = 1, client_panel_access = 1, client_edit_access = 1, service_sheet_access = 1, client_financial_access = 1, is_active = 1
         WHERE username = ?'
    );
    $rootAdminStmt->execute([DEFAULT_ADMIN_USER]);
}

function ensureCompanySettingsTable(PDO $db): void {
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `company_settings` (
          `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
          `company_name` VARCHAR(255) NOT NULL DEFAULT '',
          `fiscal_code` VARCHAR(80) NOT NULL DEFAULT '',
          `registration_number` VARCHAR(80) NOT NULL DEFAULT '',
          `address` TEXT DEFAULT NULL,
          `phone` VARCHAR(50) DEFAULT NULL,
          `email` VARCHAR(255) DEFAULT NULL,
          `website` VARCHAR(255) DEFAULT NULL,
          `bank_name` VARCHAR(255) DEFAULT NULL,
          `iban` VARCHAR(80) DEFAULT NULL,
          `stamp_image` MEDIUMTEXT DEFAULT NULL,
          `updated_by` CHAR(36) DEFAULT NULL,
          `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY `idx_company_settings_updated_by` (`updated_by`),
          FOREIGN KEY (`updated_by`) REFERENCES `app_users`(`id`)
            ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $columns = [
        'company_name' => "ALTER TABLE company_settings ADD COLUMN company_name VARCHAR(255) NOT NULL DEFAULT '' AFTER id",
        'fiscal_code' => "ALTER TABLE company_settings ADD COLUMN fiscal_code VARCHAR(80) NOT NULL DEFAULT '' AFTER company_name",
        'registration_number' => "ALTER TABLE company_settings ADD COLUMN registration_number VARCHAR(80) NOT NULL DEFAULT '' AFTER fiscal_code",
        'address' => 'ALTER TABLE company_settings ADD COLUMN address TEXT DEFAULT NULL AFTER registration_number',
        'phone' => 'ALTER TABLE company_settings ADD COLUMN phone VARCHAR(50) DEFAULT NULL AFTER address',
        'email' => 'ALTER TABLE company_settings ADD COLUMN email VARCHAR(255) DEFAULT NULL AFTER phone',
        'website' => 'ALTER TABLE company_settings ADD COLUMN website VARCHAR(255) DEFAULT NULL AFTER email',
        'bank_name' => 'ALTER TABLE company_settings ADD COLUMN bank_name VARCHAR(255) DEFAULT NULL AFTER website',
        'iban' => 'ALTER TABLE company_settings ADD COLUMN iban VARCHAR(80) DEFAULT NULL AFTER bank_name',
        'stamp_image' => 'ALTER TABLE company_settings ADD COLUMN stamp_image MEDIUMTEXT DEFAULT NULL AFTER iban',
        'updated_by' => 'ALTER TABLE company_settings ADD COLUMN updated_by CHAR(36) DEFAULT NULL AFTER stamp_image',
        'updated_at' => 'ALTER TABLE company_settings ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER updated_by',
    ];
    foreach ($columns as $column => $sql) {
        if (!columnExists($db, 'company_settings', $column)) {
            execIgnoringDuplicateColumn($db, $sql);
        }
    }
    if (columnExists($db, 'company_settings', 'updated_by') && !indexExists($db, 'company_settings', 'idx_company_settings_updated_by')) {
        execIgnoringDuplicateIndex($db, 'ALTER TABLE company_settings ADD KEY idx_company_settings_updated_by (updated_by)');
    }
}

function ensurePricePresetsTable(PDO $db): void {
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `price_presets` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `label` VARCHAR(120) NOT NULL,
          `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          `is_active` TINYINT(1) NOT NULL DEFAULT 1,
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY `idx_price_presets_active` (`is_active`),
          KEY `idx_price_presets_price` (`price`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $columns = [
        'label' => "ALTER TABLE price_presets ADD COLUMN label VARCHAR(120) NOT NULL DEFAULT '' AFTER id",
        'price' => 'ALTER TABLE price_presets ADD COLUMN price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER label',
        'is_active' => 'ALTER TABLE price_presets ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER price',
        'created_at' => 'ALTER TABLE price_presets ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER is_active',
        'updated_at' => 'ALTER TABLE price_presets ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
    ];
    foreach ($columns as $column => $sql) {
        if (!columnExists($db, 'price_presets', $column)) {
            execIgnoringDuplicateColumn($db, $sql);
        }
    }
    if (!indexExists($db, 'price_presets', 'idx_price_presets_active')) {
        execIgnoringDuplicateIndex($db, 'ALTER TABLE price_presets ADD KEY idx_price_presets_active (is_active)');
    }
    if (!indexExists($db, 'price_presets', 'idx_price_presets_price')) {
        execIgnoringDuplicateIndex($db, 'ALTER TABLE price_presets ADD KEY idx_price_presets_price (price)');
    }
}

function ensureClientFinancialSchema(PDO $db): void {
    if (!tableExists($db, 'clients')) {
        return;
    }

    if (!columnExists($db, 'clients', 'predefined_price')) {
        execIgnoringDuplicateColumn($db,
            'ALTER TABLE clients
             ADD COLUMN predefined_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER price'
        );
    }
    if (!columnExists($db, 'clients', 'payment_status')) {
        execIgnoringDuplicateColumn($db,
            "ALTER TABLE clients
             ADD COLUMN payment_status ENUM('incasati','de_incasat') NOT NULL DEFAULT 'de_incasat' AFTER predefined_price"
        );
        $db->exec(
            "UPDATE clients
             SET payment_status = CASE
               WHEN COALESCE(price, 0) <= 0 AND COALESCE(predefined_price, 0) > 0 THEN 'incasati'
               ELSE 'de_incasat'
             END"
        );
    }
    if (!columnExists($db, 'clients', 'advance_amount')) {
        execIgnoringDuplicateColumn($db,
            'ALTER TABLE clients
             ADD COLUMN advance_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER predefined_price'
        );
    }
    if (!columnExists($db, 'clients', 'currency_code')) {
        execIgnoringDuplicateColumn($db,
            "ALTER TABLE clients
             ADD COLUMN currency_code VARCHAR(3) NOT NULL DEFAULT 'RON' AFTER advance_amount"
        );
    }
    if (!columnExists($db, 'clients', 'finalization_source')) {
        execIgnoringDuplicateColumn($db,
            "ALTER TABLE clients
             ADD COLUMN finalization_source ENUM('manual','service') DEFAULT NULL AFTER is_finalized"
        );
        if (tableExists($db, 'client_activity_logs')) {
            $db->exec(
                "UPDATE clients c
                 SET finalization_source = 'manual'
                 WHERE COALESCE(c.is_finalized, 0) = 1
                   AND c.finalization_source IS NULL
                   AND EXISTS (
                     SELECT 1
                     FROM client_activity_logs cal
                     WHERE cal.client_id = c.id
                       AND cal.action = 'finalized'
                       AND cal.summary = 'Client finalizat'
                   )"
            );
        }
    }
}

function ensureWhatsAppPredefinedMessagesTable(PDO $db): void {
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `whatsapp_predefined_messages` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `title` VARCHAR(120) NOT NULL,
          `body` TEXT NOT NULL,
          `created_by` CHAR(36) DEFAULT NULL,
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY `idx_whatsapp_messages_updated` (`updated_at`),
          FOREIGN KEY (`created_by`) REFERENCES `app_users`(`id`)
            ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function ensureServiceSheetsTable(PDO $db): void {
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `service_sheets` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `sheet_number` VARCHAR(40) NOT NULL DEFAULT '',
          `client_id` CHAR(36) DEFAULT NULL,
          `qr_code` VARCHAR(100) NOT NULL DEFAULT '',
          `client_name` VARCHAR(255) NOT NULL DEFAULT '',
          `client_phone` VARCHAR(50) NOT NULL DEFAULT '',
          `client_email` VARCHAR(255) DEFAULT NULL,
          `client_address` TEXT DEFAULT NULL,
          `company_name` VARCHAR(255) NOT NULL DEFAULT '',
          `company_fiscal_code` VARCHAR(80) NOT NULL DEFAULT '',
          `company_registration_number` VARCHAR(80) NOT NULL DEFAULT '',
          `company_address` TEXT DEFAULT NULL,
          `company_phone` VARCHAR(50) DEFAULT NULL,
          `company_email` VARCHAR(255) DEFAULT NULL,
          `show_company_details` TINYINT(1) NOT NULL DEFAULT 0,
          `vehicle_type` ENUM('trotineta','scuter','altul') NOT NULL DEFAULT 'trotineta',
          `vehicle_brand_model` VARCHAR(255) NOT NULL DEFAULT '',
          `vehicle_registration` VARCHAR(80) NOT NULL DEFAULT '',
          `vehicle_series` VARCHAR(120) NOT NULL DEFAULT '',
          `vehicle_km` VARCHAR(60) NOT NULL DEFAULT '',
          `vehicle_battery` VARCHAR(120) NOT NULL DEFAULT '',
          `issue_description` TEXT DEFAULT NULL,
          `visible_damage` TEXT DEFAULT NULL,
          `accessories_charger` TINYINT(1) NOT NULL DEFAULT 0,
          `accessories_keys` TINYINT(1) NOT NULL DEFAULT 0,
          `accessories_saddle` TINYINT(1) NOT NULL DEFAULT 0,
          `accessories_other` TINYINT(1) NOT NULL DEFAULT 0,
          `accessories_other_text` VARCHAR(255) NOT NULL DEFAULT '',
          `quick_powers_on` TINYINT(1) NOT NULL DEFAULT 0,
          `quick_water_traces` TINYINT(1) NOT NULL DEFAULT 0,
          `quick_impact` TINYINT(1) NOT NULL DEFAULT 0,
          `quick_battery_risk` TINYINT(1) NOT NULL DEFAULT 0,
          `product_photo` ENUM('da','nu','') NOT NULL DEFAULT '',
          `diagnostic` TEXT DEFAULT NULL,
          `work_performed` TEXT DEFAULT NULL,
          `parts_used` TEXT DEFAULT NULL,
          `observations` TEXT DEFAULT NULL,
          `diagnostic_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          `parts_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          `labor_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          `internal_parts_cost` DECIMAL(10,2) NULL DEFAULT NULL,
          `internal_labor_cost` DECIMAL(10,2) NULL DEFAULT NULL,
          `internal_other_costs` DECIMAL(10,2) NULL DEFAULT NULL,
          `total_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          `advance_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          `currency_code` VARCHAR(3) NOT NULL DEFAULT 'RON',
          `payment_status` ENUM('incasati','de_incasat') NOT NULL DEFAULT 'de_incasat',
          `client_package_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          `client_discount` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
          `final_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          `deadline` VARCHAR(120) NOT NULL DEFAULT '',
          `deadline_unit` VARCHAR(24) NOT NULL DEFAULT 'zile',
          `warranty` VARCHAR(120) NOT NULL DEFAULT '',
          `storage_fee_per_day` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          `storage_after_days` INT NOT NULL DEFAULT 0,
          `old_parts_client` TINYINT(1) NOT NULL DEFAULT 0,
          `old_parts_recycle` TINYINT(1) NOT NULL DEFAULT 0,
          `approve_diagnostic_test` TINYINT(1) NOT NULL DEFAULT 0,
          `approve_repair_estimate` TINYINT(1) NOT NULL DEFAULT 0,
          `reject_repair` TINYINT(1) NOT NULL DEFAULT 0,
          `vehicle_delivered_checked` TINYINT(1) NOT NULL DEFAULT 0,
          `client_signature` MEDIUMTEXT DEFAULT NULL,
          `client_signed_at` DATETIME DEFAULT NULL,
          `is_finalized` TINYINT(1) NOT NULL DEFAULT 0,
          `finalized_at` DATETIME DEFAULT NULL,
          `service_pdf_base_url` VARCHAR(500) DEFAULT NULL,
          `service_pdf_filename` VARCHAR(255) DEFAULT NULL,
          `service_pdf_share_url` VARCHAR(700) DEFAULT NULL,
          `service_pdf_generated_at` DATETIME DEFAULT NULL,
          `technician_name` VARCHAR(255) NOT NULL DEFAULT '',
          `mechanic_name` VARCHAR(255) NOT NULL DEFAULT '',
          `service_type` VARCHAR(100) NOT NULL DEFAULT 'Verificare generala',
          `service_date` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `created_by` CHAR(36) DEFAULT NULL,
          `updated_by` CHAR(36) DEFAULT NULL,
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY `idx_service_client` (`client_id`),
          KEY `idx_service_qr_code` (`qr_code`),
          KEY `idx_service_created` (`created_at`),
          KEY `idx_service_updated` (`updated_at`),
          KEY `idx_service_total` (`total_price`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $columns = [
        'sheet_number' => "ALTER TABLE service_sheets ADD COLUMN sheet_number VARCHAR(40) NOT NULL DEFAULT '' AFTER id",
        'client_id' => 'ALTER TABLE service_sheets ADD COLUMN client_id CHAR(36) DEFAULT NULL AFTER sheet_number',
        'qr_code' => "ALTER TABLE service_sheets ADD COLUMN qr_code VARCHAR(100) NOT NULL DEFAULT '' AFTER client_id",
        'client_name' => "ALTER TABLE service_sheets ADD COLUMN client_name VARCHAR(255) NOT NULL DEFAULT '' AFTER qr_code",
        'client_phone' => "ALTER TABLE service_sheets ADD COLUMN client_phone VARCHAR(50) NOT NULL DEFAULT '' AFTER client_name",
        'client_email' => 'ALTER TABLE service_sheets ADD COLUMN client_email VARCHAR(255) DEFAULT NULL AFTER client_phone',
        'client_address' => 'ALTER TABLE service_sheets ADD COLUMN client_address TEXT DEFAULT NULL AFTER client_email',
        'company_name' => "ALTER TABLE service_sheets ADD COLUMN company_name VARCHAR(255) NOT NULL DEFAULT '' AFTER client_address",
        'company_fiscal_code' => "ALTER TABLE service_sheets ADD COLUMN company_fiscal_code VARCHAR(80) NOT NULL DEFAULT '' AFTER company_name",
        'company_registration_number' => "ALTER TABLE service_sheets ADD COLUMN company_registration_number VARCHAR(80) NOT NULL DEFAULT '' AFTER company_fiscal_code",
        'company_address' => 'ALTER TABLE service_sheets ADD COLUMN company_address TEXT DEFAULT NULL AFTER company_registration_number',
        'company_phone' => 'ALTER TABLE service_sheets ADD COLUMN company_phone VARCHAR(50) DEFAULT NULL AFTER company_address',
        'company_email' => 'ALTER TABLE service_sheets ADD COLUMN company_email VARCHAR(255) DEFAULT NULL AFTER company_phone',
        'show_company_details' => 'ALTER TABLE service_sheets ADD COLUMN show_company_details TINYINT(1) NOT NULL DEFAULT 0 AFTER company_email',
        'vehicle_type' => "ALTER TABLE service_sheets ADD COLUMN vehicle_type ENUM('trotineta','scuter','altul') NOT NULL DEFAULT 'trotineta' AFTER company_email",
        'vehicle_brand_model' => "ALTER TABLE service_sheets ADD COLUMN vehicle_brand_model VARCHAR(255) NOT NULL DEFAULT '' AFTER vehicle_type",
        'vehicle_registration' => "ALTER TABLE service_sheets ADD COLUMN vehicle_registration VARCHAR(80) NOT NULL DEFAULT '' AFTER vehicle_brand_model",
        'vehicle_series' => "ALTER TABLE service_sheets ADD COLUMN vehicle_series VARCHAR(120) NOT NULL DEFAULT '' AFTER vehicle_registration",
        'vehicle_km' => "ALTER TABLE service_sheets ADD COLUMN vehicle_km VARCHAR(60) NOT NULL DEFAULT '' AFTER vehicle_series",
        'vehicle_battery' => "ALTER TABLE service_sheets ADD COLUMN vehicle_battery VARCHAR(120) NOT NULL DEFAULT '' AFTER vehicle_km",
        'issue_description' => 'ALTER TABLE service_sheets ADD COLUMN issue_description TEXT DEFAULT NULL AFTER vehicle_battery',
        'visible_damage' => 'ALTER TABLE service_sheets ADD COLUMN visible_damage TEXT DEFAULT NULL AFTER issue_description',
        'accessories_charger' => 'ALTER TABLE service_sheets ADD COLUMN accessories_charger TINYINT(1) NOT NULL DEFAULT 0 AFTER visible_damage',
        'accessories_keys' => 'ALTER TABLE service_sheets ADD COLUMN accessories_keys TINYINT(1) NOT NULL DEFAULT 0 AFTER accessories_charger',
        'accessories_saddle' => 'ALTER TABLE service_sheets ADD COLUMN accessories_saddle TINYINT(1) NOT NULL DEFAULT 0 AFTER accessories_keys',
        'accessories_other' => 'ALTER TABLE service_sheets ADD COLUMN accessories_other TINYINT(1) NOT NULL DEFAULT 0 AFTER accessories_saddle',
        'accessories_other_text' => "ALTER TABLE service_sheets ADD COLUMN accessories_other_text VARCHAR(255) NOT NULL DEFAULT '' AFTER accessories_other",
        'quick_powers_on' => 'ALTER TABLE service_sheets ADD COLUMN quick_powers_on TINYINT(1) NOT NULL DEFAULT 0 AFTER accessories_other_text',
        'quick_water_traces' => 'ALTER TABLE service_sheets ADD COLUMN quick_water_traces TINYINT(1) NOT NULL DEFAULT 0 AFTER quick_powers_on',
        'quick_impact' => 'ALTER TABLE service_sheets ADD COLUMN quick_impact TINYINT(1) NOT NULL DEFAULT 0 AFTER quick_water_traces',
        'quick_battery_risk' => 'ALTER TABLE service_sheets ADD COLUMN quick_battery_risk TINYINT(1) NOT NULL DEFAULT 0 AFTER quick_impact',
        'product_photo' => "ALTER TABLE service_sheets ADD COLUMN product_photo ENUM('da','nu','') NOT NULL DEFAULT '' AFTER quick_battery_risk",
        'diagnostic' => 'ALTER TABLE service_sheets ADD COLUMN diagnostic TEXT DEFAULT NULL AFTER product_photo',
        'work_performed' => 'ALTER TABLE service_sheets ADD COLUMN work_performed TEXT DEFAULT NULL AFTER diagnostic',
        'parts_used' => 'ALTER TABLE service_sheets ADD COLUMN parts_used TEXT DEFAULT NULL AFTER work_performed',
        'observations' => 'ALTER TABLE service_sheets ADD COLUMN observations TEXT DEFAULT NULL AFTER parts_used',
        'diagnostic_price' => 'ALTER TABLE service_sheets ADD COLUMN diagnostic_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER observations',
        'parts_price' => 'ALTER TABLE service_sheets ADD COLUMN parts_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER diagnostic_price',
        'labor_price' => 'ALTER TABLE service_sheets ADD COLUMN labor_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER parts_price',
        'internal_parts_cost' => 'ALTER TABLE service_sheets ADD COLUMN internal_parts_cost DECIMAL(10,2) NULL DEFAULT NULL AFTER labor_price',
        'internal_labor_cost' => 'ALTER TABLE service_sheets ADD COLUMN internal_labor_cost DECIMAL(10,2) NULL DEFAULT NULL AFTER internal_parts_cost',
        'internal_other_costs' => 'ALTER TABLE service_sheets ADD COLUMN internal_other_costs DECIMAL(10,2) NULL DEFAULT NULL AFTER internal_labor_cost',
        'total_price' => 'ALTER TABLE service_sheets ADD COLUMN total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER internal_other_costs',
        'advance_amount' => 'ALTER TABLE service_sheets ADD COLUMN advance_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total_price',
        'currency_code' => "ALTER TABLE service_sheets ADD COLUMN currency_code VARCHAR(3) NOT NULL DEFAULT 'RON' AFTER advance_amount",
        'payment_status' => "ALTER TABLE service_sheets ADD COLUMN payment_status ENUM('incasati','de_incasat') NOT NULL DEFAULT 'de_incasat' AFTER currency_code",
        'client_package_price' => 'ALTER TABLE service_sheets ADD COLUMN client_package_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER payment_status',
        'client_discount' => 'ALTER TABLE service_sheets ADD COLUMN client_discount DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER client_package_price',
        'final_price' => 'ALTER TABLE service_sheets ADD COLUMN final_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER client_discount',
        'deadline' => "ALTER TABLE service_sheets ADD COLUMN deadline VARCHAR(120) NOT NULL DEFAULT '' AFTER final_price",
        'deadline_unit' => "ALTER TABLE service_sheets ADD COLUMN deadline_unit VARCHAR(24) NOT NULL DEFAULT 'zile' AFTER deadline",
        'warranty' => "ALTER TABLE service_sheets ADD COLUMN warranty VARCHAR(120) NOT NULL DEFAULT '' AFTER deadline_unit",
        'storage_fee_per_day' => 'ALTER TABLE service_sheets ADD COLUMN storage_fee_per_day DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER warranty',
        'storage_after_days' => 'ALTER TABLE service_sheets ADD COLUMN storage_after_days INT NOT NULL DEFAULT 0 AFTER storage_fee_per_day',
        'old_parts_client' => 'ALTER TABLE service_sheets ADD COLUMN old_parts_client TINYINT(1) NOT NULL DEFAULT 0 AFTER storage_after_days',
        'old_parts_recycle' => 'ALTER TABLE service_sheets ADD COLUMN old_parts_recycle TINYINT(1) NOT NULL DEFAULT 0 AFTER old_parts_client',
        'approve_diagnostic_test' => 'ALTER TABLE service_sheets ADD COLUMN approve_diagnostic_test TINYINT(1) NOT NULL DEFAULT 0 AFTER old_parts_recycle',
        'approve_repair_estimate' => 'ALTER TABLE service_sheets ADD COLUMN approve_repair_estimate TINYINT(1) NOT NULL DEFAULT 0 AFTER approve_diagnostic_test',
        'reject_repair' => 'ALTER TABLE service_sheets ADD COLUMN reject_repair TINYINT(1) NOT NULL DEFAULT 0 AFTER approve_repair_estimate',
        'vehicle_delivered_checked' => 'ALTER TABLE service_sheets ADD COLUMN vehicle_delivered_checked TINYINT(1) NOT NULL DEFAULT 0 AFTER reject_repair',
        'client_signature' => 'ALTER TABLE service_sheets ADD COLUMN client_signature MEDIUMTEXT DEFAULT NULL AFTER vehicle_delivered_checked',
        'client_signed_at' => 'ALTER TABLE service_sheets ADD COLUMN client_signed_at DATETIME DEFAULT NULL AFTER client_signature',
        'is_finalized' => 'ALTER TABLE service_sheets ADD COLUMN is_finalized TINYINT(1) NOT NULL DEFAULT 0 AFTER client_signed_at',
        'finalized_at' => 'ALTER TABLE service_sheets ADD COLUMN finalized_at DATETIME DEFAULT NULL AFTER is_finalized',
        'service_pdf_base_url' => 'ALTER TABLE service_sheets ADD COLUMN service_pdf_base_url VARCHAR(500) DEFAULT NULL AFTER finalized_at',
        'service_pdf_filename' => 'ALTER TABLE service_sheets ADD COLUMN service_pdf_filename VARCHAR(255) DEFAULT NULL AFTER service_pdf_base_url',
        'service_pdf_share_url' => 'ALTER TABLE service_sheets ADD COLUMN service_pdf_share_url VARCHAR(700) DEFAULT NULL AFTER service_pdf_filename',
        'service_pdf_generated_at' => 'ALTER TABLE service_sheets ADD COLUMN service_pdf_generated_at DATETIME DEFAULT NULL AFTER service_pdf_share_url',
        'technician_name' => "ALTER TABLE service_sheets ADD COLUMN technician_name VARCHAR(255) NOT NULL DEFAULT '' AFTER service_pdf_generated_at",
        'mechanic_name' => "ALTER TABLE service_sheets ADD COLUMN mechanic_name VARCHAR(255) NOT NULL DEFAULT '' AFTER technician_name",
        'service_type' => "ALTER TABLE service_sheets ADD COLUMN service_type VARCHAR(100) NOT NULL DEFAULT 'Verificare generala' AFTER mechanic_name",
        'service_date' => 'ALTER TABLE service_sheets ADD COLUMN service_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER service_type',
        'created_by' => 'ALTER TABLE service_sheets ADD COLUMN created_by CHAR(36) DEFAULT NULL AFTER service_date',
        'updated_by' => 'ALTER TABLE service_sheets ADD COLUMN updated_by CHAR(36) DEFAULT NULL AFTER created_by',
        'created_at' => 'ALTER TABLE service_sheets ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER updated_by',
        'updated_at' => 'ALTER TABLE service_sheets ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
    ];

    foreach ($columns as $column => $sql) {
        if (!columnExists($db, 'service_sheets', $column)) {
            execIgnoringDuplicateColumn($db, $sql);
        }
    }

    $db->exec(
        "UPDATE service_sheets
         SET sheet_number = CONCAT('FS-', DATE_FORMAT(COALESCE(created_at, service_date, NOW()), '%Y%m%d'), '-', UPPER(LEFT(REPLACE(id, '-', ''), 6)))
         WHERE sheet_number = '' OR sheet_number IS NULL"
    );
    if (columnExists($db, 'service_sheets', 'work_description')) {
        $db->exec(
            "UPDATE service_sheets
             SET work_performed = COALESCE(NULLIF(work_performed, ''), work_description)
             WHERE (work_performed IS NULL OR work_performed = '') AND work_description IS NOT NULL"
        );
    }
    if (columnExists($db, 'service_sheets', 'final_price')) {
        $db->exec(
            "UPDATE service_sheets
             SET total_price = CASE WHEN COALESCE(total_price, 0) = 0 THEN COALESCE(final_price, 0) ELSE total_price END"
        );
    }
    if (columnExists($db, 'service_sheets', 'payment_status') && columnExists($db, 'service_sheets', 'finalized_at')) {
        $db->exec(
            "UPDATE service_sheets
             SET payment_status = 'incasati'
             WHERE finalized_at IS NOT NULL
               AND (COALESCE(is_finalized, 0) = 1
                    OR client_signed_at IS NOT NULL
                    OR NULLIF(TRIM(COALESCE(client_signature, '')), '') IS NOT NULL)
               AND (payment_status IS NULL OR payment_status = 'de_incasat')"
        );
    }
    $db->exec(
        "UPDATE service_sheets
         SET technician_name = COALESCE(NULLIF(technician_name, ''), mechanic_name),
             final_price = CASE
                WHEN COALESCE(final_price, 0) = 0 THEN GREATEST(
                    COALESCE(NULLIF(total_price, 0), NULLIF(diagnostic_price, 0), 0)
                    * (1 - COALESCE(client_discount, 0) / 100),
                    0
                )
                ELSE final_price
             END"
    );
    if (columnExists($db, 'service_sheets', 'is_finalized') && columnExists($db, 'service_sheets', 'finalized_at')) {
        $db->exec(
            "UPDATE service_sheets
             SET is_finalized = CASE
                WHEN COALESCE(payment_status, 'de_incasat') = 'incasati'
                  AND finalized_at IS NOT NULL
                  AND client_signed_at IS NOT NULL
                  AND NULLIF(TRIM(COALESCE(client_signature, '')), '') IS NOT NULL THEN 1
                ELSE 0
             END"
        );
    }

    $indexes = [
        'uq_service_sheet_number' => 'ALTER TABLE service_sheets ADD UNIQUE KEY uq_service_sheet_number (sheet_number)',
        'idx_service_client' => 'ALTER TABLE service_sheets ADD KEY idx_service_client (client_id)',
        'idx_service_qr_code' => 'ALTER TABLE service_sheets ADD KEY idx_service_qr_code (qr_code)',
        'idx_service_finalized' => 'ALTER TABLE service_sheets ADD KEY idx_service_finalized (is_finalized, finalized_at)',
        'idx_service_created' => 'ALTER TABLE service_sheets ADD KEY idx_service_created (created_at)',
        'idx_service_updated' => 'ALTER TABLE service_sheets ADD KEY idx_service_updated (updated_at)',
        'idx_service_total' => 'ALTER TABLE service_sheets ADD KEY idx_service_total (total_price)',
    ];
    foreach ($indexes as $index => $sql) {
        if (!indexExists($db, 'service_sheets', $index)) {
            execIgnoringDuplicateIndex($db, $sql);
        }
    }

    syncClientFinancialsFromLatestServiceSheets($db);
}

function syncClientFinancialsFromLatestServiceSheets(PDO $db): void {
    if (!tableExists($db, 'clients') || !tableExists($db, 'service_sheets')) {
        return;
    }
    foreach ([
        ['clients', 'price'],
        ['clients', 'predefined_price'],
        ['clients', 'advance_amount'],
        ['clients', 'currency_code'],
        ['clients', 'payment_status'],
        ['clients', 'discount_percentage'],
        ['service_sheets', 'client_id'],
        ['service_sheets', 'total_price'],
        ['service_sheets', 'final_price'],
        ['service_sheets', 'diagnostic_price'],
        ['service_sheets', 'advance_amount'],
        ['service_sheets', 'currency_code'],
        ['service_sheets', 'payment_status'],
        ['service_sheets', 'client_discount'],
        ['service_sheets', 'client_package_price'],
    ] as [$table, $column]) {
        if (!columnExists($db, $table, $column)) {
            return;
        }
    }

    $sheetTotal = 'COALESCE(NULLIF(ss.total_price, 0), NULLIF(ss.client_package_price, 0), NULLIF(ss.final_price, 0), NULLIF(ss.diagnostic_price, 0), 0)';
    $sheetDiscountedPackage = 'GREATEST(COALESCE(ss.client_package_price, 0) * (1 - COALESCE(ss.client_discount, 0) / 100), 0)';
    $sheetWorkPrice = "(CASE
        WHEN COALESCE(ss.client_package_price, 0) > 0
          AND COALESCE(ss.client_discount, 0) > 0
          AND ABS({$sheetTotal} - {$sheetDiscountedPackage}) <= GREATEST(0.05, COALESCE(ss.client_package_price, 0) * 0.0005)
        THEN COALESCE(ss.client_package_price, 0)
        ELSE {$sheetTotal}
     END)";

    $db->exec(
        "UPDATE clients c
         JOIN service_sheets ss ON ss.client_id = c.id
         LEFT JOIN service_sheets newer
           ON newer.client_id = ss.client_id
          AND (
             COALESCE(newer.updated_at, newer.created_at, '1000-01-01 00:00:00') > COALESCE(ss.updated_at, ss.created_at, '1000-01-01 00:00:00')
             OR (
                COALESCE(newer.updated_at, newer.created_at, '1000-01-01 00:00:00') = COALESCE(ss.updated_at, ss.created_at, '1000-01-01 00:00:00')
                AND newer.id > ss.id
             )
          )
         SET c.price = {$sheetWorkPrice},
             c.predefined_price = COALESCE(ss.diagnostic_price, 0),
             c.advance_amount = COALESCE(ss.advance_amount, 0),
             c.currency_code = COALESCE(NULLIF(ss.currency_code, ''), c.currency_code, 'RON'),
             c.payment_status = COALESCE(NULLIF(ss.payment_status, ''), 'de_incasat'),
             c.discount_percentage = COALESCE(ss.client_discount, c.discount_percentage, 0)
         WHERE ss.client_id IS NOT NULL
           AND newer.id IS NULL"
    );
}

function ensureClientOwnershipSchema(PDO $db): void {
    if (!tableExists($db, 'clients')) {
        return;
    }

    if (!columnExists($db, 'clients', 'owner_user_id')) {
        $db->exec(
            'ALTER TABLE clients
             ADD COLUMN owner_user_id CHAR(36) DEFAULT NULL AFTER profile_id,
             ADD KEY idx_clients_owner_user (owner_user_id),
             ADD CONSTRAINT fk_clients_owner_user
               FOREIGN KEY (owner_user_id) REFERENCES app_users(id)
               ON DELETE SET NULL ON UPDATE CASCADE'
        );
    }
}

function ensurePartnerContactSchema(PDO $db): void {
    foreach (['profiles', 'collaborators'] as $table) {
        if (!tableExists($db, $table)) {
            continue;
        }
        if (!columnExists($db, $table, 'phone')) {
            $db->exec("ALTER TABLE {$table} ADD COLUMN phone VARCHAR(50) DEFAULT NULL AFTER role");
        }
        if (!columnExists($db, $table, 'email')) {
            $db->exec("ALTER TABLE {$table} ADD COLUMN email VARCHAR(255) DEFAULT NULL AFTER phone");
        }
    }
}

function ensureCollaboratorPercentageSchema(PDO $db): void {
    if (tableExists($db, 'collaborators') && !columnExists($db, 'collaborators', 'percentage')) {
        execIgnoringDuplicateColumn(
            $db,
            'ALTER TABLE collaborators
             ADD COLUMN percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER email'
        );
    }
    if (!tableExists($db, 'client_collaborator_costs')) {
        return;
    }
    if (!columnExists($db, 'client_collaborator_costs', 'cost_type')) {
        execIgnoringDuplicateColumn(
            $db,
            "ALTER TABLE client_collaborator_costs
             ADD COLUMN cost_type ENUM('fixed','percentage') NOT NULL DEFAULT 'fixed' AFTER collaborator_color"
        );
    }
    if (!columnExists($db, 'client_collaborator_costs', 'percentage')) {
        execIgnoringDuplicateColumn(
            $db,
            'ALTER TABLE client_collaborator_costs
             ADD COLUMN percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER cost_type'
        );
    }
    if (!columnExists($db, 'client_collaborator_costs', 'net_base')) {
        execIgnoringDuplicateColumn(
            $db,
            'ALTER TABLE client_collaborator_costs
             ADD COLUMN net_base DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER percentage'
        );
    }
    if (!columnExists($db, 'client_collaborator_costs', 'payment_status')) {
        execIgnoringDuplicateColumn(
            $db,
            "ALTER TABLE client_collaborator_costs
             ADD COLUMN payment_status ENUM('incasati','de_incasat') NOT NULL DEFAULT 'de_incasat' AFTER cost"
        );
    }

    $db->exec(
        "CREATE TABLE IF NOT EXISTS `app_migrations` (
          `id` VARCHAR(120) NOT NULL PRIMARY KEY,
          `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    if (tableExists($db, 'clients') && columnExists($db, 'clients', 'is_finalized')) {
        $migrationId = '20260712_collaborators_paid_for_existing_finalized_clients';
        $migrationStmt = $db->prepare('SELECT 1 FROM app_migrations WHERE id = ? LIMIT 1');
        $migrationStmt->execute([$migrationId]);
        if (!$migrationStmt->fetchColumn()) {
            $db->exec(
                "UPDATE client_collaborator_costs cc
                 JOIN clients c ON c.id = cc.client_id
                 SET cc.payment_status = 'incasati'
                 WHERE COALESCE(c.is_finalized, 0) = 1"
            );
            $db->prepare('INSERT IGNORE INTO app_migrations (id) VALUES (?)')->execute([$migrationId]);
        }
    }
}

function ensureClientAccessSchema(PDO $db): void {
    if (!tableExists($db, 'clients')) {
        return;
    }

    $db->exec(
        "CREATE TABLE IF NOT EXISTS `client_user_access` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `client_id` CHAR(36) NOT NULL,
          `user_id` CHAR(36) NOT NULL,
          `source` ENUM('owner','scan','manual') NOT NULL DEFAULT 'manual',
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY `uq_client_user_access` (`client_id`, `user_id`),
          KEY `idx_client_user_access_user` (`user_id`),
          KEY `idx_client_user_access_client` (`client_id`),
          FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
            ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $db->exec(
        "INSERT INTO client_user_access (id, client_id, user_id, source)
         SELECT UUID(), c.id, c.owner_user_id, 'owner'
         FROM clients c
         LEFT JOIN client_user_access cua
           ON cua.client_id = c.id AND cua.user_id = c.owner_user_id
         WHERE c.owner_user_id IS NOT NULL
           AND cua.id IS NULL"
    );
}

function ensureClientQrStatusConsistency(PDO $db): void {
    if (
        !tableExists($db, 'clients')
        || !columnExists($db, 'clients', 'status')
        || !columnExists($db, 'clients', 'qr_used')
    ) {
        return;
    }

    $db->exec(
        "CREATE TABLE IF NOT EXISTS `app_migrations` (
          `id` VARCHAR(120) NOT NULL PRIMARY KEY,
          `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $migrationId = '20260716_sync_existing_qr_used_with_status';
    $migrationStmt = $db->prepare('SELECT 1 FROM app_migrations WHERE id = ? LIMIT 1');
    $migrationStmt->execute([$migrationId]);
    if ($migrationStmt->fetchColumn()) {
        return;
    }

    $usedAtExpression = columnExists($db, 'clients', 'updated_at')
        ? 'COALESCE(qr_used_at, updated_at, created_at, NOW())'
        : 'COALESCE(qr_used_at, created_at, NOW())';
    $db->exec(
        "UPDATE clients
         SET qr_used = 1,
             qr_used_at = {$usedAtExpression}
         WHERE status = 'cod_folosit'
           AND COALESCE(qr_used, 0) = 0"
    );
    $db->prepare('INSERT IGNORE INTO app_migrations (id) VALUES (?)')->execute([$migrationId]);
}

function ensureClientActivitySchema(PDO $db): void {
    if (!tableExists($db, 'clients')) {
        return;
    }

    $activityTableExisted = tableExists($db, 'client_activity_logs');
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `client_activity_logs` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `client_id` CHAR(36) NOT NULL,
          `actor_user_id` CHAR(36) DEFAULT NULL,
          `action` ENUM('created','updated','scanned','finalized','deleted') NOT NULL,
          `summary` VARCHAR(255) NOT NULL DEFAULT '',
          `details` TEXT DEFAULT NULL,
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY `idx_client_activity_client` (`client_id`, `created_at`),
          KEY `idx_client_activity_actor` (`actor_user_id`),
          FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
            ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY (`actor_user_id`) REFERENCES `app_users`(`id`)
            ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    if (!$activityTableExisted) {
        $db->exec(
            "INSERT INTO client_activity_logs (id, client_id, actor_user_id, action, summary, details, created_at)
             SELECT UUID(), c.id, c.owner_user_id, 'created', 'Client adaugat',
                    JSON_OBJECT('name', c.name, 'phone', c.phone, 'qr_code', c.qr_code),
                    c.created_at
             FROM clients c"
        );
    }
}

function companyField(array $body, string $key, int $maxLength): string {
    $value = trim((string)($body[$key] ?? ''));
    if ($maxLength > 0 && strlen($value) > $maxLength) {
        $value = substr($value, 0, $maxLength);
    }
    return $value;
}

function normalizeCompanyStampImage($value): ?string {
    $raw = trim((string)($value ?? ''));
    if ($raw === '') {
        return null;
    }
    if (strlen($raw) > 900000) {
        throw new InvalidArgumentException('Stampila este prea mare. Alege o imagine mai mica.');
    }
    if (!preg_match('#^data:image/(png|jpe?g);base64,#i', $raw, $match)) {
        throw new InvalidArgumentException('Stampila trebuie sa fie imagine PNG sau JPG.');
    }
    $base64 = substr($raw, strpos($raw, ',') + 1);
    $bytes = base64_decode($base64, true);
    if ($bytes === false || strlen($bytes) < 12) {
        throw new InvalidArgumentException('Fisierul stampilei nu este valid.');
    }
    $info = @getimagesizefromstring($bytes);
    if (!$info || empty($info['mime']) || !in_array(strtolower($info['mime']), ['image/png', 'image/jpeg'], true)) {
        throw new InvalidArgumentException('Stampila trebuie sa fie imagine PNG sau JPG.');
    }
    return 'data:' . strtolower($info['mime']) . ';base64,' . base64_encode($bytes);
}

function buildCompanySettings(?array $row): array {
    $row = $row ?: [];
    return [
        'company_name'        => (string)($row['company_name'] ?? ''),
        'fiscal_code'         => (string)($row['fiscal_code'] ?? ''),
        'registration_number' => (string)($row['registration_number'] ?? ''),
        'address'             => (string)($row['address'] ?? ''),
        'phone'               => (string)($row['phone'] ?? ''),
        'email'               => (string)($row['email'] ?? ''),
        'website'             => (string)($row['website'] ?? ''),
        'bank_name'           => (string)($row['bank_name'] ?? ''),
        'iban'                => (string)($row['iban'] ?? ''),
        'stamp_image'         => (string)($row['stamp_image'] ?? ''),
        'updated_at'          => (string)($row['updated_at'] ?? ''),
    ];
}

function companySettingsPayload(array $body): array {
    $settings = [
        'company_name'        => companyField($body, 'company_name', 255),
        'fiscal_code'         => companyField($body, 'fiscal_code', 80),
        'registration_number' => companyField($body, 'registration_number', 80),
        'address'             => companyField($body, 'address', 2000),
        'phone'               => companyField($body, 'phone', 50),
        'email'               => companyField($body, 'email', 255),
        'website'             => companyField($body, 'website', 255),
        'bank_name'           => companyField($body, 'bank_name', 255),
        'iban'                => companyField($body, 'iban', 80),
        'stamp_image'         => normalizeCompanyStampImage($body['stamp_image'] ?? null),
    ];
    if ($settings['email'] !== '' && filter_var($settings['email'], FILTER_VALIDATE_EMAIL) === false) {
        throw new InvalidArgumentException('Email firma invalid.');
    }
    return $settings;
}

function buildAppUser(array $row): array {
    return [
        'id'              => $row['id'],
        'username'        => $row['username'],
        'display_name'    => $row['display_name'],
        'role'            => $row['role'],
        'platform_access' => $row['platform_access'],
        'support_chat_access' => (bool)($row['support_chat_access'] ?? false),
        'client_panel_access' => array_key_exists('client_panel_access', $row)
            ? (bool)$row['client_panel_access']
            : true,
        'client_edit_access' => (bool)($row['client_edit_access'] ?? false),
        'service_sheet_access' => array_key_exists('service_sheet_access', $row) ? (bool)$row['service_sheet_access'] : true,
        'client_financial_access' => array_key_exists('client_financial_access', $row) ? (bool)$row['client_financial_access'] : true,
        'is_active'       => (bool)$row['is_active'],
        'created_at'      => $row['created_at'] ?? '',
        'updated_at'      => $row['updated_at'] ?? '',
    ];
}

function userCanAccessPlatform(array $user, string $platform): bool {
    return $user['platform_access'] === 'both' || $user['platform_access'] === $platform;
}

function isSupportChatAgent(array $user): bool {
    return !empty($user['support_chat_access']);
}

function userCanViewClientPanel(array $user): bool {
    return in_array($user['role'] ?? '', ['admin', 'manager'], true)
        || !empty($user['client_panel_access']);
}

function userCanViewServiceSheets(array $user): bool {
    return in_array($user['role'] ?? '', ['admin', 'manager'], true)
        || !array_key_exists('service_sheet_access', $user)
        || !empty($user['service_sheet_access']);
}

function userCanViewClientFinancials(array $user): bool {
    return in_array($user['role'] ?? '', ['admin', 'manager'], true)
        || !array_key_exists('client_financial_access', $user)
        || !empty($user['client_financial_access']);
}

function userCanEditClients(array $user): bool {
    return in_array($user['role'] ?? '', ['admin', 'manager'], true)
        || !empty($user['client_edit_access']);
}

function userCanFinalizeClients(array $user): bool {
    return in_array($user['role'] ?? '', ['admin', 'manager'], true);
}

function isChatSupervisor(array $user): bool {
    return ($user['role'] ?? '') === 'admin';
}

function requireSupportChatAgent(PDO $db, array $body): array {
    $user = requireAuth($db, $body);
    if (!isSupportChatAgent($user)) {
        http_response_code(403);
        echo json_encode(['error' => 'Acces Support Chat necesar.']);
        exit();
    }
    return $user;
}

function requireChatRequester(PDO $db, array $body): array {
    $user = requireAuth($db, $body);
    if (isSupportChatAgent($user)) {
        http_response_code(403);
        echo json_encode(['error' => 'Conturile Agent Support folosesc consola de agent.']);
        exit();
    }
    return $user;
}

function getChatRequesterById(PDO $db, string $userId): ?array {
    $stmt = $db->prepare(
        'SELECT * FROM app_users
         WHERE id = ? AND is_active = 1 AND support_chat_access = 0
         LIMIT 1'
    );
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function ensurePushNotificationTables(PDO $db): void {
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `app_push_tokens` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `user_id` CHAR(36) NOT NULL,
          `token` VARCHAR(255) NOT NULL,
          `platform` VARCHAR(32) NOT NULL DEFAULT 'android',
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          `last_seen_at` TIMESTAMP NULL DEFAULT NULL,
          UNIQUE KEY `uq_app_push_token` (`token`),
          KEY `idx_app_push_user` (`user_id`),
          CONSTRAINT `fk_app_push_user`
            FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function isExpoPushToken(string $token): bool {
    return preg_match('/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_\-]+\]$/', $token) === 1;
}

function pushTextPreview(string $text): string {
    $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');
    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        return mb_strlen($text, 'UTF-8') > 160 ? mb_substr($text, 0, 157, 'UTF-8') . '...' : $text;
    }
    return strlen($text) > 160 ? substr($text, 0, 157) . '...' : $text;
}

function pushRecipientIdsForChat(PDO $db, string $recipientRole, string $recipientId, array $conversation): array {
    if ($recipientRole === 'mobile') {
        return [$recipientId];
    }

    if (!empty($conversation['assigned_agent_id'])) {
        $stmt = $db->prepare(
            'SELECT id FROM app_users
             WHERE is_active = 1
               AND support_chat_access = 1
               AND (role = "admin" OR id = ?)'
        );
        $stmt->execute([$conversation['assigned_agent_id']]);
    } else {
        $stmt = $db->query(
            'SELECT id FROM app_users
             WHERE is_active = 1
               AND support_chat_access = 1'
        );
    }

    return array_values(array_unique(array_filter(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN)))));
}

function sendExpoPushRequest(array $messages): array {
    if (empty($messages)) {
        return [];
    }

    $payload = json_encode($messages, JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        return [];
    }

    $url = 'https://exp.host/--/api/v2/push/send';
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_TIMEOUT => 8,
        ]);
        $raw = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);
        if ($raw === false || $status < 200 || $status >= 300) {
            error_log('[G-Trots Push] Expo request failed. HTTP ' . $status . ' - ' . ($raw === false ? $curlError : $raw));
            return [];
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Accept: application/json\r\nContent-Type: application/json\r\n",
                'content' => $payload,
                'timeout' => 8,
            ],
        ]);
        $raw = @file_get_contents($url, false, $context);
        if ($raw === false) {
            error_log('[G-Trots Push] Expo request failed through file_get_contents.');
            return [];
        }
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function pruneDeadExpoTokens(PDO $db, array $tokens, array $response): void {
    $rows = $response['data'] ?? [];
    if (!is_array($rows)) {
        return;
    }

    foreach ($rows as $index => $row) {
        if (!is_array($row)) {
            continue;
        }
        $error = $row['details']['error'] ?? '';
        if (($row['status'] ?? '') === 'error') {
            error_log('[G-Trots Push] Delivery rejected: ' . json_encode($row, JSON_UNESCAPED_UNICODE));
        }
        if (($row['status'] ?? '') === 'error' && $error === 'DeviceNotRegistered' && isset($tokens[$index])) {
            $stmt = $db->prepare('DELETE FROM app_push_tokens WHERE token = ?');
            $stmt->execute([$tokens[$index]]);
        }
    }
}

function sendPushNotificationToUsers(PDO $db, array $userIds, string $title, string $body, array $data = []): void {
    $userIds = array_values(array_unique(array_filter($userIds)));
    if (empty($userIds)) {
        return;
    }

    $placeholders = implode(',', array_fill(0, count($userIds), '?'));
    $stmt = $db->prepare(
        "SELECT token FROM app_push_tokens
         WHERE user_id IN ($placeholders)"
    );
    $stmt->execute($userIds);
    $tokens = array_values(array_unique(array_filter($stmt->fetchAll(PDO::FETCH_COLUMN), 'isExpoPushToken')));
    if (empty($tokens)) {
        error_log('[G-Trots Push] No registered Expo tokens for users: ' . implode(',', $userIds));
        return;
    }

    $messages = array_map(static function (string $token) use ($title, $body, $data): array {
        return [
            'to' => $token,
            'sound' => 'default',
            'title' => $title,
            'body' => pushTextPreview($body),
            'priority' => 'high',
            'channelId' => 'chat',
            'data' => $data,
        ];
    }, $tokens);

    foreach (array_chunk($messages, 100) as $chunk) {
        $chunkTokens = array_column($chunk, 'to');
        $response = sendExpoPushRequest($chunk);
        if (empty($response)) {
            error_log('[G-Trots Push] Empty Expo response for ' . count($chunk) . ' notification(s).');
        }
        pruneDeadExpoTokens($db, $chunkTokens, $response);
    }
}

function createSession(PDO $db, string $userId, string $platform, bool $rememberMe = false): string {
    $token = bin2hex(random_bytes(32));
    $validDays = $rememberMe ? 180 : 30;
    $stmt = $db->prepare(
        'INSERT INTO app_sessions (id, user_id, token_hash, platform, expires_at)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ' . $validDays . ' DAY))'
    );
    $stmt->execute([uuid(), $userId, hash('sha256', $token), $platform]);
    return $token;
}

function currentAuthToken(array $body): string {
    return $_SERVER['HTTP_X_AUTH_TOKEN']
        ?? ($_GET['authToken'] ?? ($_GET['adminToken'] ?? ($body['auth_token'] ?? ($body['admin_token'] ?? ''))));
}

function requireAuth(PDO $db, array $body, ?string $platform = null, array $roles = []): array {
    ensureAuthTables($db);
    $token = currentAuthToken($body);
    if ($token === '') {
        http_response_code(401);
        echo json_encode(['error' => 'Autentificare necesara.']);
        exit();
    }

    $stmt = $db->prepare(
        'SELECT u.*, s.platform, s.expires_at
         FROM app_sessions s
         JOIN app_users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.is_active = 1
         LIMIT 1'
    );
    $stmt->execute([hash('sha256', $token)]);
    $user = $stmt->fetch();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Sesiune expirata sau invalida.']);
        exit();
    }
    // O sesiune folosita activ nu expira in mijlocul lucrului.
    $db->prepare(
        'UPDATE app_sessions
         SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY)
         WHERE token_hash = ? AND expires_at < DATE_ADD(NOW(), INTERVAL 7 DAY)'
    )->execute([hash('sha256', $token)]);
    $sessionPlatform = $user['platform'] ?? '';
    if (!userCanAccessPlatform($user, $sessionPlatform)) {
        http_response_code(403);
        echo json_encode(['error' => 'Contul nu mai are acces la aceasta platforma.']);
        exit();
    }
    if ($platform && $sessionPlatform !== $platform) {
        http_response_code(403);
        echo json_encode(['error' => 'Sesiunea nu este valida pentru aceasta platforma.']);
        exit();
    }
    if (!empty($roles) && !in_array($user['role'], $roles, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Nu ai permisiune pentru aceasta actiune.']);
        exit();
    }
    return $user;
}

function requireAdmin(PDO $db, array $body): array {
    return requireAuth($db, $body, null, ['admin']);
}

function currentUserOrNull(PDO $db, array $body, ?string $platform = null): ?array {
    if (currentAuthToken($body) === '') {
        return null;
    }
    return requireAuth($db, $body, $platform);
}

function isScopedClientUser(?array $user): bool {
    return !empty($user)
        && ($user['role'] ?? '') === 'user';
}

function userHasClientAccess(PDO $db, ?array $user, array $client): bool {
    if (empty($user)) {
        return false;
    }
    if (in_array($user['role'] ?? '', ['admin', 'manager'], true)) {
        return true;
    }
    if (($client['owner_user_id'] ?? null) === ($user['id'] ?? null)) {
        return true;
    }
    if (!tableExists($db, 'client_user_access')) {
        return false;
    }

    $stmt = $db->prepare('SELECT 1 FROM client_user_access WHERE client_id = ? AND user_id = ? LIMIT 1');
    $stmt->execute([$client['id'] ?? '', $user['id'] ?? '']);
    return (bool)$stmt->fetchColumn();
}

function grantClientAccess(PDO $db, string $clientId, ?string $userId, string $source = 'manual'): void {
    if (!$userId || !tableExists($db, 'client_user_access')) {
        return;
    }

    if (!in_array($source, ['owner', 'scan', 'manual'], true)) {
        $source = 'manual';
    }

    $stmt = $db->prepare(
        'INSERT INTO client_user_access (id, client_id, user_id, source)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE source = source'
    );
    $stmt->execute([uuid(), $clientId, $userId, $source]);
}

function logClientActivity(
    PDO $db,
    string $clientId,
    ?array $actor,
    string $action,
    string $summary,
    array $details = []
): void {
    if (!in_array($action, ['created', 'updated', 'scanned', 'finalized', 'deleted'], true)) {
        return;
    }

    $stmt = $db->prepare(
        'INSERT INTO client_activity_logs (id, client_id, actor_user_id, action, summary, details)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        uuid(),
        $clientId,
        $actor['id'] ?? null,
        $action,
        $summary,
        !empty($details) ? json_encode($details, JSON_UNESCAPED_UNICODE) : null,
    ]);
}

function clientFieldChanges(array $before, array $after): array {
    $fields = [
        'name' => 'Nume',
        'phone' => 'Telefon',
        'email' => 'Email',
        'status' => 'Status',
        'price' => 'Pret lucrare',
        'predefined_price' => 'Pret predefinit',
        'advance_amount' => 'Avans',
        'currency_code' => 'Moneda',
        'discount_percentage' => 'Reducere',
        'manopera_colaboratori' => 'Manopera colaboratori',
        'valoare_piese' => 'Cost efectiv piese',
        'service_parts_price' => 'Piese in fisa de service',
        'service_labor_price' => 'Manopera in fisa de service',
        'alte_cheltuieli' => 'Alte cheltuieli',
        'notes' => 'Note',
        'profile_id' => 'Profil afiliere',
        'is_finalized' => 'Finalizat',
        'qr_used' => 'QR folosit',
    ];
    $changes = [];
    foreach ($fields as $field => $label) {
        $old = $before[$field] ?? null;
        $new = $after[$field] ?? null;
        if (in_array($field, ['manopera_colaboratori', 'valoare_piese', 'alte_cheltuieli'], true)
            && ($old === null || $new === null)) {
            $old = $old === null ? '__NULL__' : (float)$old;
            $new = $new === null ? '__NULL__' : (float)$new;
        } elseif (in_array($field, ['price', 'predefined_price', 'advance_amount', 'discount_percentage', 'manopera_colaboratori', 'valoare_piese', 'service_parts_price', 'service_labor_price', 'alte_cheltuieli'], true)) {
            $old = (float)$old;
            $new = (float)$new;
        } else {
            $old = $old === null ? '' : trim((string)$old);
            $new = $new === null ? '' : trim((string)$new);
        }
        if ((string)$old !== (string)$new) {
            $changes[] = [
                'field' => $field,
                'label' => $label,
                'from' => $old,
                'to' => $new,
            ];
        }
    }
    return $changes;
}

function ensureChatTables(PDO $db): void {
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `chat_conversations` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `mobile_account` VARCHAR(64) NOT NULL,
          `admin_account` VARCHAR(64) NOT NULL DEFAULT 'admin',
          `assigned_agent_id` CHAR(36) DEFAULT NULL,
          `assigned_at` TIMESTAMP NULL DEFAULT NULL,
          `status` ENUM('active','left','closed') NOT NULL DEFAULT 'active',
          `left_at` TIMESTAMP NULL DEFAULT NULL,
          `closed_at` TIMESTAMP NULL DEFAULT NULL,
          `title` VARCHAR(255) NOT NULL DEFAULT 'Mobile 1',
          `last_message_at` TIMESTAMP NULL DEFAULT NULL,
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY `idx_chat_mobile_status` (`mobile_account`, `status`),
          KEY `idx_chat_assigned_agent` (`assigned_agent_id`),
          KEY `idx_chat_last_message` (`last_message_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    if (!columnExists($db, 'chat_conversations', 'assigned_agent_id')) {
        $db->exec(
            'ALTER TABLE chat_conversations
             ADD COLUMN assigned_agent_id CHAR(36) DEFAULT NULL AFTER admin_account,
             ADD COLUMN assigned_at TIMESTAMP NULL DEFAULT NULL AFTER assigned_agent_id,
             ADD KEY idx_chat_assigned_agent (assigned_agent_id)'
        );
    } elseif (!columnExists($db, 'chat_conversations', 'assigned_at')) {
        $db->exec(
            'ALTER TABLE chat_conversations
             ADD COLUMN assigned_at TIMESTAMP NULL DEFAULT NULL AFTER assigned_agent_id'
        );
    }
    if (!columnExists($db, 'chat_conversations', 'status')) {
        $db->exec(
            "ALTER TABLE chat_conversations
             ADD COLUMN status ENUM('active','left','closed') NOT NULL DEFAULT 'active' AFTER assigned_at,
             ADD COLUMN left_at TIMESTAMP NULL DEFAULT NULL AFTER status,
             ADD COLUMN closed_at TIMESTAMP NULL DEFAULT NULL AFTER left_at"
        );
    } elseif (!columnExists($db, 'chat_conversations', 'left_at')) {
        $db->exec(
            'ALTER TABLE chat_conversations
             ADD COLUMN left_at TIMESTAMP NULL DEFAULT NULL AFTER status'
        );
    }
    if (columnExists($db, 'chat_conversations', 'status')
        && strpos(columnType($db, 'chat_conversations', 'status'), "'closed'") === false) {
        $db->exec(
            "ALTER TABLE chat_conversations
             MODIFY COLUMN status ENUM('active','left','closed') NOT NULL DEFAULT 'active'"
        );
    }
    if (!columnExists($db, 'chat_conversations', 'closed_at')) {
        $db->exec(
            'ALTER TABLE chat_conversations
             ADD COLUMN closed_at TIMESTAMP NULL DEFAULT NULL AFTER left_at'
        );
    }
    if (indexExists($db, 'chat_conversations', 'uq_chat_mobile_account')) {
        $db->exec('ALTER TABLE chat_conversations DROP INDEX uq_chat_mobile_account');
    }
    if (!indexExists($db, 'chat_conversations', 'idx_chat_mobile_status')) {
        $db->exec('ALTER TABLE chat_conversations ADD KEY idx_chat_mobile_status (mobile_account, status)');
    }

    $db->exec(
        "CREATE TABLE IF NOT EXISTS `chat_messages` (
          `id` CHAR(36) NOT NULL PRIMARY KEY,
          `conversation_id` CHAR(36) NOT NULL,
          `sender_role` ENUM('mobile','admin') NOT NULL,
          `sender_id` VARCHAR(64) NOT NULL,
          `recipient_role` ENUM('mobile','admin') NOT NULL,
          `recipient_id` VARCHAR(64) NOT NULL,
          `body` TEXT NOT NULL,
          `read_by_mobile` TINYINT(1) NOT NULL DEFAULT 0,
          `read_by_admin` TINYINT(1) NOT NULL DEFAULT 0,
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY `idx_chat_messages_conversation` (`conversation_id`, `created_at`),
          KEY `idx_chat_messages_mobile_unread` (`recipient_id`, `read_by_mobile`, `created_at`),
          KEY `idx_chat_messages_admin_unread` (`recipient_role`, `read_by_admin`, `created_at`),
          CONSTRAINT `fk_chat_messages_conversation`
            FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

}

function releaseChatAssignmentsForUser(PDO $db, string $userId): void {
    if ($userId === '' || !tableExists($db, 'chat_conversations')) {
        return;
    }
    $stmt = $db->prepare(
        'UPDATE chat_conversations
         SET assigned_agent_id = NULL, assigned_at = NULL
         WHERE assigned_agent_id = ?'
    );
    $stmt->execute([$userId]);
}

function getChatConversationByMobile(PDO $db, string $mobileAccount): ?array {
    $stmt = $db->prepare(
        'SELECT cc.*,
                au.id AS assigned_agent_user_id,
                au.is_active AS assigned_agent_active,
                au.support_chat_access AS assigned_agent_chat_access,
                au.display_name AS assigned_agent_name,
                au.username AS assigned_agent_username,
                au.role AS assigned_agent_role
         FROM chat_conversations cc
         LEFT JOIN app_users au ON au.id = cc.assigned_agent_id
         WHERE cc.mobile_account = ? AND cc.status = "active"
         ORDER BY cc.created_at DESC
         LIMIT 1'
    );
    $stmt->execute([$mobileAccount]);
    $conversation = $stmt->fetch();
    if ($conversation
        && !empty($conversation['assigned_agent_id'])
        && (empty($conversation['assigned_agent_user_id'])
            || empty($conversation['assigned_agent_active'])
            || empty($conversation['assigned_agent_chat_access']))) {
        $release = $db->prepare(
            'UPDATE chat_conversations
             SET assigned_agent_id = NULL, assigned_at = NULL
             WHERE id = ? AND assigned_agent_id = ?'
        );
        $release->execute([$conversation['id'], $conversation['assigned_agent_id']]);
        $stmt->execute([$mobileAccount]);
        $conversation = $stmt->fetch();
    }
    return $conversation ?: null;
}

function getChatConversationById(PDO $db, string $conversationId): ?array {
    $stmt = $db->prepare(
        'SELECT cc.*,
                au.id AS assigned_agent_user_id,
                au.is_active AS assigned_agent_active,
                au.support_chat_access AS assigned_agent_chat_access,
                au.display_name AS assigned_agent_name,
                au.username AS assigned_agent_username,
                au.role AS assigned_agent_role
         FROM chat_conversations cc
         LEFT JOIN app_users au ON au.id = cc.assigned_agent_id
         WHERE cc.id = ?
         LIMIT 1'
    );
    $stmt->execute([$conversationId]);
    return $stmt->fetch() ?: null;
}

function getOrCreateChatConversation(PDO $db, string $mobileAccount, string $title = ''): array {
    ensureChatTables($db);
    $conversation = getChatConversationByMobile($db, $mobileAccount);
    if ($conversation) {
        return $conversation;
    }

    $newId = uuid();
    $title = trim($title) !== '' ? trim($title) : 'Mobile User';
    $insert = $db->prepare(
        'INSERT INTO chat_conversations (id, mobile_account, admin_account, title)
         VALUES (?, ?, "admin", ?)'
    );
    $insert->execute([$newId, $mobileAccount, $title]);
    return getChatConversationByMobile($db, $mobileAccount);
}

function buildChatMessage(array $row): array {
    return [
        'id'              => $row['id'],
        'conversation_id' => $row['conversation_id'],
        'sender_role'     => $row['sender_role'],
        'sender_id'       => $row['sender_id'],
        'recipient_role'  => $row['recipient_role'],
        'recipient_id'    => $row['recipient_id'],
        'body'            => $row['body'],
        'read_by_mobile'  => (bool)$row['read_by_mobile'],
        'read_by_admin'   => (bool)$row['read_by_admin'],
        'created_at'      => $row['created_at'],
    ];
}

function buildChatConversation(array $row): array {
    return [
        'id'              => $row['id'],
        'mobile_account'  => $row['mobile_account'],
        'admin_account'   => $row['admin_account'],
        'assigned_agent_id' => $row['assigned_agent_id'] ?? null,
        'assigned_at'     => $row['assigned_at'] ?? null,
        'status'          => $row['status'] ?? 'active',
        'left_at'         => $row['left_at'] ?? null,
        'closed_at'       => $row['closed_at'] ?? null,
        'assigned_agent_name' => $row['assigned_agent_name'] ?? null,
        'assigned_agent_username' => $row['assigned_agent_username'] ?? null,
        'assigned_agent_role' => $row['assigned_agent_role'] ?? null,
        'title'           => $row['title'],
        'last_message_at' => $row['last_message_at'],
        'created_at'      => $row['created_at'],
        'updated_at'      => $row['updated_at'],
    ];
}

function chatUnreadCount(PDO $db, string $conversationId, string $actor): int {
    if ($actor === 'admin') {
        $stmt = $db->prepare(
            'SELECT COUNT(*) FROM chat_messages
             WHERE conversation_id = ? AND sender_role = "mobile" AND read_by_admin = 0'
        );
    } else {
        $stmt = $db->prepare(
            'SELECT COUNT(*) FROM chat_messages
             WHERE conversation_id = ? AND sender_role = "admin" AND read_by_mobile = 0'
        );
    }
    $stmt->execute([$conversationId]);
    return (int)$stmt->fetchColumn();
}

function latestChatMessage(PDO $db, string $conversationId): ?array {
    $stmt = $db->prepare(
        'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'
    );
    $stmt->execute([$conversationId]);
    $row = $stmt->fetch();
    return $row ? buildChatMessage($row) : null;
}

function chatMessageCount(PDO $db, string $conversationId): int {
    $stmt = $db->prepare('SELECT COUNT(*) FROM chat_messages WHERE conversation_id = ?');
    $stmt->execute([$conversationId]);
    return (int)$stmt->fetchColumn();
}

function chatHasSupportReply(PDO $db, string $conversationId): bool {
    $stmt = $db->prepare(
        'SELECT EXISTS(
           SELECT 1 FROM chat_messages
           WHERE conversation_id = ? AND sender_role = "admin"
         )'
    );
    $stmt->execute([$conversationId]);
    return (bool)$stmt->fetchColumn();
}

function deleteEmptyChatArchives(PDO $db): void {
    $stmt = $db->prepare(
        'DELETE cc
         FROM chat_conversations cc
         WHERE cc.status <> "active"
           AND NOT EXISTS (
             SELECT 1
             FROM chat_messages cm
             WHERE cm.conversation_id = cc.id
               AND cm.body NOT IN (?, ?)
           )'
    );
    $stmt->execute([
        'Utilizatorul a parasit conversatia.',
        'Agent Support a inchis conversatia.',
    ]);
}

function buildClientActivity(array $row): array {
    $details = [];
    if (!empty($row['details'])) {
        $decoded = json_decode($row['details'], true);
        $details = is_array($decoded) ? $decoded : [];
    }

    return [
        'id'             => $row['id'],
        'client_id'      => $row['client_id'],
        'actor_user_id'  => $row['actor_user_id'],
        'actor_name'     => $row['actor_name'] ?? null,
        'actor_username' => $row['actor_username'] ?? null,
        'actor_role'     => $row['actor_role'] ?? null,
        'client_name'    => $row['client_name'] ?? null,
        'client_phone'   => $row['client_phone'] ?? null,
        'client_email'   => $row['client_email'] ?? null,
        'client_status'  => $row['client_status'] ?? null,
        'client_qr_code' => $row['client_qr_code'] ?? null,
        'action'         => $row['action'],
        'summary'        => $row['summary'],
        'details'        => $details,
        'created_at'     => $row['created_at'],
    ];
}

function getClientActivity(PDO $db, string $clientId): array {
    if (!tableExists($db, 'client_activity_logs')) {
        return [];
    }

    $stmt = $db->prepare(
        'SELECT cal.*,
                u.display_name AS actor_name,
                u.username AS actor_username,
                u.role AS actor_role
         FROM client_activity_logs cal
         LEFT JOIN app_users u ON u.id = cal.actor_user_id
         WHERE cal.client_id = ?
         ORDER BY cal.created_at DESC, cal.id DESC'
    );
    $stmt->execute([$clientId]);
    return array_map('buildClientActivity', $stmt->fetchAll());
}

function getClientParticipants(PDO $db, string $clientId): array {
    if (!tableExists($db, 'client_user_access') || !tableExists($db, 'client_activity_logs')) {
        return [];
    }

    $stmt = $db->prepare(
        "SELECT u.id, u.username, u.display_name, u.role,
                MIN(src.first_at) AS first_at,
                GROUP_CONCAT(DISTINCT src.source ORDER BY src.source SEPARATOR ',') AS sources
         FROM (
           SELECT c.owner_user_id AS user_id, 'owner' AS source, c.created_at AS first_at
           FROM clients c
           WHERE c.id = ? AND c.owner_user_id IS NOT NULL
           UNION ALL
           SELECT cua.user_id, cua.source, cua.created_at
           FROM client_user_access cua
           WHERE cua.client_id = ?
           UNION ALL
           SELECT cal.actor_user_id,
                  CASE cal.action
                    WHEN 'created' THEN 'owner'
                    WHEN 'scanned' THEN 'scan'
                    WHEN 'updated' THEN 'edit'
                    WHEN 'finalized' THEN 'edit'
                    ELSE cal.action
                  END AS source,
                  cal.created_at
           FROM client_activity_logs cal
           WHERE cal.client_id = ? AND cal.actor_user_id IS NOT NULL
         ) src
         JOIN app_users u ON u.id = src.user_id
         GROUP BY u.id, u.username, u.display_name, u.role
         ORDER BY first_at ASC"
    );
    $stmt->execute([$clientId, $clientId, $clientId]);

    return array_map(function (array $row): array {
        return [
            'id'           => $row['id'],
            'username'     => $row['username'],
            'display_name' => $row['display_name'],
            'role'         => $row['role'],
            'sources'      => array_filter(explode(',', $row['sources'] ?? '')),
            'first_at'     => $row['first_at'],
        ];
    }, $stmt->fetchAll());
}

function serviceSheetCanFinalizeClient(array $sheet): bool {
    $paymentStatus = paymentStatusFromFinancials(
        $sheet['payment_status'] ?? null,
        calculatedServiceSheetFinancials($sheet)
    );
    if ($paymentStatus !== 'incasati' || empty($sheet['finalized_at']) || empty($sheet['is_finalized'])) {
        return false;
    }
    if (empty($sheet['client_signed_at'])) {
        return false;
    }
    try {
        return !empty(normalizedClientSignature($sheet['client_signature'] ?? null));
    } catch (Throwable $error) {
        return false;
    }
}

function clientHasFinalizedServiceSheet(PDO $db, string $clientId): bool {
    if ($clientId === '' || !tableExists($db, 'service_sheets')) {
        return false;
    }
    $stmt = $db->prepare(
        "SELECT 1
         FROM service_sheets
         WHERE client_id = ?
           AND COALESCE(payment_status, 'de_incasat') = 'incasati'
           AND finalized_at IS NOT NULL
           AND client_signed_at IS NOT NULL
           AND COALESCE(is_finalized, 0) = 1
           AND NULLIF(TRIM(COALESCE(client_signature, '')), '') IS NOT NULL
         LIMIT 1"
    );
    $stmt->execute([$clientId]);
    return (bool)$stmt->fetchColumn();
}

function effectiveClientIsFinalized(PDO $db, array $client): bool {
    return !empty($client['is_finalized']) && ($client['finalization_source'] ?? null) === 'manual';
}

function syncClientFinalizationFromServiceSheets(PDO $db, string $clientId, ?array $authUser = null): void {
    // Statusul clientului este manual: Activ/Finalizat se controleaza doar din UI.
    // Fisele de service isi pastreaza separat finalizarea lor, fara sa schimbe clientul.
    return;
}

function buildClient(array $row): array {
    global $db;
    $effectiveFinalized = effectiveClientIsFinalized($db, $row);
    $clientPrice = (float)($row['price'] ?? 0);
    $clientPredefinedPrice = (float)($row['predefined_price'] ?? 0);
    if ($clientPrice <= 0 && $clientPredefinedPrice > 0) {
        $clientPrice = $clientPredefinedPrice;
    }
    $financials = calculatedClientFinancials(
        $clientPrice,
        $clientPredefinedPrice,
        (float)($row['discount_percentage'] ?? 0),
        (float)($row['advance_amount'] ?? 0)
    );
    $paymentStatus = paymentStatusFromFinancials(
        $row['payment_status'] ?? null,
        $financials
    );
    $client = [
        'id'                  => $row['id'],
        'name'                => $row['name'],
        'phone'               => $row['phone'],
        'email'               => $row['email'],
        'status'              => $row['status'],
        'qr_code'             => $row['qr_code'],
        'qr_used'             => (bool)$row['qr_used'],
        'qr_used_at'          => $row['qr_used_at'],
        'discount_percentage' => (float)$row['discount_percentage'],
        'price'               => $clientPrice,
        'predefined_price'     => $clientPredefinedPrice,
        'advance_amount'       => $financials['advance'],
        'final_price'          => $financials['total'],
        'gross_total'          => $financials['total'] > 0 ? ($clientPrice > 0 ? $clientPrice : $clientPredefinedPrice) : 0,
        'amount_due'           => $financials['amount_due'],
        'currency_code'        => normalizeCurrencyCode($row['currency_code'] ?? 'RON'),
        'payment_status'       => $paymentStatus,
        'manopera_colaboratori' => $row['manopera_colaboratori'] !== null ? (float)$row['manopera_colaboratori'] : null,
        'valoare_piese'       => $row['valoare_piese'] !== null ? (float)$row['valoare_piese'] : null,
        'service_parts_price' => (float)($row['service_parts_price'] ?? 0),
        'service_labor_price' => (float)($row['service_labor_price'] ?? 0),
        'alte_cheltuieli'     => $row['alte_cheltuieli'] !== null ? (float)$row['alte_cheltuieli'] : null,
        'price_edit_count'    => (int)($row['price_edit_count'] ?? 0),
        'is_finalized'        => $effectiveFinalized,
        'finalization_source' => $effectiveFinalized ? ($row['finalization_source'] ?? null) : null,
        'notes'               => $row['notes'],
        'profile_id'          => $row['profile_id'],
        'owner_user_id'       => $row['owner_user_id'] ?? null,
        'created_at'          => $row['created_at'],
        'profiles'            => null,
    ];
    if (!empty($row['profile_id']) && !empty($row['prof_name'])) {
        $client['profiles'] = [
            'id'         => $row['profile_id'],
            'name'       => $row['prof_name'],
            'role'       => $row['prof_role'],
            'percentage' => (float)$row['prof_percentage'],
            'color'      => $row['prof_color'],
            'created_at' => $row['prof_created_at'],
        ];
    }
    $client['collaborator_costs'] = getClientCollaboratorCosts($db, $row['id']);
    $client['expense_costs'] = getClientExpenseCosts($db, $row['id']);
    $client['activity_logs'] = getClientActivity($db, $row['id']);
    $client['participants'] = getClientParticipants($db, $row['id']);
    return $client;
}

function clientResponseForUser(array $client, ?array $authUser, bool $financialEntry = false): array {
    $client['financials_hidden'] = false;
    if (!$authUser || $financialEntry || userCanViewClientFinancials($authUser)) {
        return $client;
    }

    foreach ([
        'discount_percentage', 'price', 'predefined_price', 'advance_amount', 'final_price',
        'gross_total', 'amount_due', 'manopera_colaboratori', 'valoare_piese',
        'service_parts_price', 'service_labor_price', 'alte_cheltuieli',
    ] as $field) {
        $client[$field] = 0;
    }
    $client['payment_status'] = 'de_incasat';
    $client['collaborator_costs'] = [];
    $client['expense_costs'] = [];
    if (is_array($client['profiles'] ?? null)) {
        $client['profiles']['percentage'] = 0;
    }
    $client['financials_hidden'] = true;
    return $client;
}

$clientJoin = 'SELECT c.*,
    p.name       AS prof_name,
    p.role       AS prof_role,
    p.percentage AS prof_percentage,
    p.color      AS prof_color,
    p.created_at AS prof_created_at
FROM clients c
LEFT JOIN profiles p ON c.profile_id = p.id';

function boolValue($value): int {
    if (is_bool($value)) {
        return $value ? 1 : 0;
    }
    if (is_numeric($value)) {
        return ((int)$value) ? 1 : 0;
    }
    $value = strtolower(trim((string)$value));
    return in_array($value, ['1', 'true', 'yes', 'da', 'on'], true) ? 1 : 0;
}

function textValue($value, int $maxLength = 0): string {
    $text = trim((string)($value ?? ''));
    if ($maxLength > 0) {
        if (function_exists('mb_substr')) {
            $text = mb_substr($text, 0, $maxLength, 'UTF-8');
        } else {
            $text = substr($text, 0, $maxLength);
        }
    }
    return $text;
}

function nullableTextValue($value, int $maxLength = 0): ?string {
    $text = textValue($value, $maxLength);
    return $text === '' ? null : $text;
}

function nullableDateTimeValue($value): ?string {
    $text = trim((string)($value ?? ''));
    if ($text === '') {
        return null;
    }

    foreach (['d-m-Y H:i:s', 'd-m-Y H:i', 'Y-m-d H:i:s', 'Y-m-d H:i'] as $format) {
        $date = DateTime::createFromFormat('!' . $format, $text);
        $errors = DateTime::getLastErrors();
        if ($date && (!$errors || ((int)$errors['warning_count'] === 0 && (int)$errors['error_count'] === 0))) {
            return $date->format('Y-m-d H:i:s');
        }
    }

    $timestamp = strtotime(str_replace('T', ' ', rtrim($text, 'Z')));
    if ($timestamp === false) {
        return null;
    }
    return date('Y-m-d H:i:s', $timestamp);
}

function displayDateTimeValue($value): string {
    $text = trim((string)($value ?? ''));
    if ($text === '') {
        return '';
    }
    $timestamp = strtotime(str_replace('T', ' ', rtrim($text, 'Z')));
    return $timestamp === false ? $text : date('d-m-Y H:i', $timestamp);
}

function displayDateValue($value): string {
    $text = trim((string)($value ?? ''));
    if ($text === '') {
        return '';
    }
    $timestamp = strtotime(str_replace('T', ' ', rtrim($text, 'Z')));
    return $timestamp === false ? $text : date('d-m-Y', $timestamp);
}

function moneyValue($value): float {
    return max((float)($value ?? 0), 0);
}

function nullableMoneyValue($value): ?float {
    if ($value === null || trim((string)$value) === '') {
        return null;
    }
    return max((float)$value, 0);
}

function effectiveInternalCost($internalValue, $displayedValue): float {
    return $internalValue === null
        ? moneyValue($displayedValue)
        : moneyValue($internalValue);
}

function serviceSheetNumber(PDO $db): string {
    $prefix = 'FS-' . date('Ymd') . '-';
    $stmt = $db->prepare('SELECT COUNT(*) FROM service_sheets WHERE sheet_number LIKE ?');
    $stmt->execute([$prefix . '%']);
    $next = ((int)$stmt->fetchColumn()) + 1;
    for ($i = 0; $i < 50; $i++) {
        $number = $prefix . str_pad((string)($next + $i), 4, '0', STR_PAD_LEFT);
        $check = $db->prepare('SELECT 1 FROM service_sheets WHERE sheet_number = ? LIMIT 1');
        $check->execute([$number]);
        if (!$check->fetchColumn()) {
            return $number;
        }
    }
    return $prefix . strtoupper(substr(str_replace('-', '', uuid()), 0, 6));
}

function serviceSheetClientRow(PDO $db, string $clientId): ?array {
    if ($clientId === '') {
        return null;
    }
    $stmt = $db->prepare('SELECT * FROM clients WHERE id = ? LIMIT 1');
    $stmt->execute([$clientId]);
    $client = $stmt->fetch();
    return $client ?: null;
}

function serviceSheetCompanySnapshot(PDO $db): array {
    ensureCompanySettingsTable($db);
    $stmt = $db->query('SELECT * FROM company_settings WHERE id = 1 LIMIT 1');
    $settings = buildCompanySettings($stmt->fetch() ?: null);
    return [
        'company_name' => $settings['company_name'] ?: 'G-Trots',
        'company_fiscal_code' => $settings['fiscal_code'] ?? '',
        'company_registration_number' => $settings['registration_number'] ?? '',
        'company_address' => $settings['address'] ?? '',
        'company_phone' => $settings['phone'] ?? '',
        'company_email' => $settings['email'] ?? '',
    ];
}

function attachCompanyStampToServiceSheet(PDO $db, array $sheet): array {
    ensureCompanySettingsTable($db);
    $stmt = $db->query('SELECT stamp_image FROM company_settings WHERE id = 1 LIMIT 1');
    $sheet['company_stamp_image'] = (string)($stmt->fetchColumn() ?: '');
    return $sheet;
}

function normalizedVehicleType($value): string {
    $value = strtolower(textValue($value, 20));
    return in_array($value, ['trotineta', 'scuter', 'altul'], true) ? $value : 'trotineta';
}

function normalizedProductPhoto($value): string {
    $value = strtolower(textValue($value, 10));
    return in_array($value, ['da', 'nu'], true) ? $value : '';
}

function normalizedClientSignature($value): ?string {
    $raw = trim((string)($value ?? ''));
    if ($raw === '') {
        return null;
    }
    if (strlen($raw) > 250000) {
        throw new InvalidArgumentException('Semnatura clientului este prea mare.');
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || (int)($decoded['v'] ?? 0) !== 1 || !is_array($decoded['strokes'] ?? null)) {
        throw new InvalidArgumentException('Semnatura clientului nu are un format valid.');
    }

    $strokes = [];
    $pointCount = 0;
    foreach ($decoded['strokes'] as $stroke) {
        if (!is_array($stroke)) {
            continue;
        }
        $cleanStroke = [];
        foreach ($stroke as $point) {
            if (!is_array($point) || count($point) < 2) {
                continue;
            }
            $x = min(1, max(0, round((float)$point[0], 4)));
            $y = min(1, max(0, round((float)$point[1], 4)));
            $cleanStroke[] = [$x, $y];
            $pointCount++;
            if ($pointCount > 6000) {
                throw new InvalidArgumentException('Semnatura clientului contine prea multe puncte.');
            }
        }
        if (count($cleanStroke) >= 2) {
            $strokes[] = $cleanStroke;
        }
    }
    if (!$strokes) {
        return null;
    }
    $aspectRatio = (float)($decoded['aspect_ratio'] ?? 2.2);
    $aspectRatio = min(5.0, max(0.8, round($aspectRatio, 4)));
    return json_encode([
        'v' => 1,
        'aspect_ratio' => $aspectRatio,
        'strokes' => $strokes,
    ], JSON_UNESCAPED_SLASHES);
}

function serviceSheetPayload(PDO $db, array $body, array $current = [], ?array $client = null): array {
    $company = serviceSheetCompanySnapshot($db);
    $read = static function (string $key, $default = '') use ($body, $current) {
        if (array_key_exists($key, $body)) {
            return $body[$key];
        }
        if (array_key_exists($key, $current)) {
            return $current[$key];
        }
        return $default;
    };

    $clientPrice = $client ? (float)($client['price'] ?? 0) : 0.0;
    $clientPredefinedPrice = $client ? (float)($client['predefined_price'] ?? 0) : 0.0;
    $clientPartsPrice = $client ? (float)($client['service_parts_price'] ?? 0) : 0.0;
    $clientLaborPrice = $client ? (float)($client['service_labor_price'] ?? 0) : 0.0;
    $clientInternalPartsCost = $client ? nullableMoneyValue($client['valoare_piese'] ?? null) : null;
    $clientInternalLaborCost = $client ? nullableMoneyValue($client['manopera_colaboratori'] ?? null) : null;
    $clientInternalOtherCosts = $client ? nullableMoneyValue($client['alte_cheltuieli'] ?? null) : null;
    $clientDiscount = $client ? (float)($client['discount_percentage'] ?? 0) : 0.0;
    $clientAdvance = $client ? (float)($client['advance_amount'] ?? 0) : 0.0;
    $clientCurrency = $client ? normalizeCurrencyCode($client['currency_code'] ?? 'RON') : 'RON';
    $clientPackage = max($clientPrice, 0);
    if ($clientPackage <= 0 && $clientPredefinedPrice > 0) {
        $clientPackage = $clientPredefinedPrice;
    }
    $fallbackTotal = $clientPackage;

    $diagnosticPrice = moneyValue($read('diagnostic_price', $clientPredefinedPrice));
    $partsPrice = moneyValue($read('parts_price', $clientPartsPrice));
    // Manopera din fisa este un camp separat de pretul total al clientului.
    // La o fisa noua porneste de la 0 si nu este derivata automat din clients.price.
    $laborPrice = moneyValue($read('labor_price', $clientLaborPrice));
    $explicitTotal = $read('total_price', $read('final_price', $fallbackTotal));
    $totalPrice = moneyValue($explicitTotal);
    if ($totalPrice <= 0 && $diagnosticPrice > 0) {
        $totalPrice = $diagnosticPrice;
    }
    $payloadDiscount = min(100, max((float)$read('client_discount', $clientDiscount), 0));
    $currentGrossTotal = moneyValue($current['total_price'] ?? 0);
    if ($currentGrossTotal <= 0) {
        $currentGrossTotal = moneyValue($current['client_package_price'] ?? 0);
    }
    if ($currentGrossTotal <= 0) {
        $currentGrossTotal = $clientPackage;
    }
    $totalPrice = normalizeClientGrossPriceFromPayload(
        $totalPrice,
        $diagnosticPrice,
        $payloadDiscount,
        $currentGrossTotal
    );
    $advanceAmount = moneyValue($read('advance_amount', $clientAdvance));
    $sheetFinancials = calculatedClientFinancials(
        $totalPrice,
        $diagnosticPrice,
        $payloadDiscount,
        $advanceAmount
    );
    $paymentStatus = paymentStatusFromFinancials(
        $read('payment_status', $current['payment_status'] ?? ($client['payment_status'] ?? null)),
        $sheetFinancials
    );
    $currentSignature = normalizedClientSignature($current['client_signature'] ?? null);
    $clientSignature = normalizedClientSignature($read('client_signature', $currentSignature));
    $clientSignedAt = $clientSignature
        ? ($clientSignature !== $currentSignature
            ? date('Y-m-d H:i:s')
            : nullableDateTimeValue($read('client_signed_at', $current['client_signed_at'] ?? date('Y-m-d H:i:s'))))
        : null;
    $requestedFinalizedAt = nullableDateTimeValue($read('finalized_at', $current['finalized_at'] ?? null));
    if ($paymentStatus === 'incasati' && empty($requestedFinalizedAt)) {
        $requestedFinalizedAt = date('Y-m-d H:i:s');
    }
    $isFinalized = $paymentStatus === 'incasati' && !empty($requestedFinalizedAt) && !empty($clientSignature);
    $finalizedAt = $paymentStatus === 'incasati' && !empty($requestedFinalizedAt) ? $requestedFinalizedAt : null;

    $payload = [
        'client_id' => nullableTextValue($read('client_id', $client['id'] ?? null), 36),
        'qr_code' => textValue($read('qr_code', $client['qr_code'] ?? ''), 100),
        'client_name' => textValue($read('client_name', $client['name'] ?? ''), 255),
        'client_phone' => textValue($read('client_phone', $client['phone'] ?? ''), 50),
        'client_email' => nullableTextValue($read('client_email', $client['email'] ?? null), 255),
        'client_address' => nullableTextValue($read('client_address', ''), 2000),
        'company_name' => textValue($read('company_name', $company['company_name']), 255),
        'company_fiscal_code' => textValue($read('company_fiscal_code', $company['company_fiscal_code']), 80),
        'company_registration_number' => textValue($read('company_registration_number', $company['company_registration_number']), 80),
        'company_address' => nullableTextValue($read('company_address', $company['company_address']), 2000),
        'company_phone' => nullableTextValue($read('company_phone', $company['company_phone']), 50),
        'company_email' => nullableTextValue($read('company_email', $company['company_email']), 255),
        'show_company_details' => boolValue($read('show_company_details', 0)),
        'vehicle_type' => normalizedVehicleType($read('vehicle_type', 'trotineta')),
        'vehicle_brand_model' => textValue($read('vehicle_brand_model', ''), 255),
        'vehicle_registration' => textValue($read('vehicle_registration', ''), 80),
        'vehicle_series' => textValue($read('vehicle_series', ''), 120),
        'vehicle_km' => textValue($read('vehicle_km', ''), 60),
        'vehicle_battery' => textValue($read('vehicle_battery', ''), 120),
        'issue_description' => nullableTextValue($read('issue_description', $client['notes'] ?? null), 2000),
        'visible_damage' => nullableTextValue($read('visible_damage', ''), 2000),
        'accessories_charger' => boolValue($read('accessories_charger', 0)),
        'accessories_keys' => boolValue($read('accessories_keys', 0)),
        'accessories_saddle' => boolValue($read('accessories_saddle', 0)),
        'accessories_other' => boolValue($read('accessories_other', 0)),
        'accessories_other_text' => textValue($read('accessories_other_text', ''), 255),
        'quick_powers_on' => boolValue($read('quick_powers_on', 0)),
        'quick_water_traces' => boolValue($read('quick_water_traces', 0)),
        'quick_impact' => boolValue($read('quick_impact', 0)),
        'quick_battery_risk' => boolValue($read('quick_battery_risk', 0)),
        'product_photo' => normalizedProductPhoto($read('product_photo', '')),
        'diagnostic' => nullableTextValue($read('diagnostic', ''), 3000),
        'work_performed' => nullableTextValue($read('work_performed', $read('work_description', '')), 3000),
        'parts_used' => nullableTextValue($read('parts_used', ''), 2000),
        'observations' => nullableTextValue($read('observations', ''), 2000),
        'diagnostic_price' => $diagnosticPrice,
        'parts_price' => $partsPrice,
        'labor_price' => $laborPrice,
        'internal_parts_cost' => nullableMoneyValue($read('internal_parts_cost', $clientInternalPartsCost)),
        'internal_labor_cost' => nullableMoneyValue($read('internal_labor_cost', $clientInternalLaborCost)),
        'internal_other_costs' => nullableMoneyValue($read('internal_other_costs', $clientInternalOtherCosts)),
        'total_price' => $totalPrice,
        'advance_amount' => $advanceAmount,
        'currency_code' => normalizeCurrencyCode($read('currency_code', $clientCurrency)),
        'payment_status' => $paymentStatus,
        'client_package_price' => max(moneyValue($read('client_package_price', $clientPackage)), $clientPackage),
        'client_discount' => $payloadDiscount,
        'final_price' => $sheetFinancials['total'],
        'deadline' => textValue(durationNumberValue($read('deadline', '')), 120),
        'deadline_unit' => normalizeDeadlineUnit($read('deadline_unit', 'zile')),
        'warranty' => textValue(warrantyLabel($read('warranty', '')), 120),
        'storage_fee_per_day' => moneyValue($read('storage_fee_per_day', 0)),
        'storage_after_days' => max((int)$read('storage_after_days', 0), 0),
        'old_parts_client' => boolValue($read('old_parts_client', 0)),
        'old_parts_recycle' => boolValue($read('old_parts_recycle', 0)),
        'approve_diagnostic_test' => boolValue($read('approve_diagnostic_test', 0)),
        'approve_repair_estimate' => boolValue($read('approve_repair_estimate', 0)),
        'reject_repair' => boolValue($read('reject_repair', 0)),
        'vehicle_delivered_checked' => boolValue($read('vehicle_delivered_checked', 0)),
        'client_signature' => $clientSignature,
        'client_signed_at' => $clientSignedAt,
        'is_finalized' => $isFinalized ? 1 : 0,
        'finalized_at' => $finalizedAt,
        'technician_name' => textValue($read('technician_name', $read('mechanic_name', '')), 255),
        'mechanic_name' => textValue($read('mechanic_name', $read('technician_name', '')), 255),
        'service_type' => textValue($read('service_type', 'Verificare generala'), 100),
    ];

    if (!empty($payload['client_id']) && !serviceSheetClientRow($db, $payload['client_id'])) {
        $payload['client_id'] = null;
    }
    return $payload;
}

function recalculateStoredClientCollaboratorCosts(PDO $db, string $clientId): float {
    if (!tableExists($db, 'client_collaborator_costs')
        || !columnExists($db, 'client_collaborator_costs', 'cost_type')) {
        return 0.0;
    }
    $client = serviceSheetClientRow($db, $clientId);
    if (!$client) {
        return 0.0;
    }
    $rowsStmt = $db->prepare(
        'SELECT id, cost_type, percentage, cost
         FROM client_collaborator_costs
         WHERE client_id = ?'
    );
    $rowsStmt->execute([$clientId]);
    $rows = $rowsStmt->fetchAll();
    if (!$rows) {
        return moneyValue($client['manopera_colaboratori'] ?? 0);
    }

    $financials = calculatedClientFinancials(
        (float)($client['price'] ?? 0),
        (float)($client['predefined_price'] ?? 0),
        (float)($client['discount_percentage'] ?? 0),
        (float)($client['advance_amount'] ?? 0)
    );
    $baseBeforeCollaborators = collaboratorBaseBeforeCosts(
        $db,
        $financials['total'],
        $client['profile_id'] ?? null,
        effectiveInternalCost($client['valoare_piese'] ?? null, $client['service_parts_price'] ?? 0),
        moneyValue($client['alte_cheltuieli'] ?? 0)
    );
    $fixedTotal = 0.0;
    foreach ($rows as $row) {
        if (($row['cost_type'] ?? 'fixed') !== 'percentage') {
            $fixedTotal += max((float)($row['cost'] ?? 0), 0);
        }
    }
    $percentageNetBase = max($baseBeforeCollaborators - $fixedTotal, 0);
    $update = $db->prepare(
        'UPDATE client_collaborator_costs
         SET percentage = ?, net_base = ?, cost = ?
         WHERE id = ?'
    );
    $total = 0.0;
    foreach ($rows as $row) {
        $costType = ($row['cost_type'] ?? 'fixed') === 'percentage' ? 'percentage' : 'fixed';
        $percentage = $costType === 'percentage'
            ? min(100, max((float)($row['percentage'] ?? 0), 0))
            : 0.0;
        $cost = $costType === 'percentage'
            ? $percentageNetBase * ($percentage / 100)
            : max((float)($row['cost'] ?? 0), 0);
        $update->execute([$percentage, $percentageNetBase, $cost, $row['id']]);
        $total += $cost;
    }
    $db->prepare('UPDATE clients SET manopera_colaboratori = ? WHERE id = ?')
        ->execute([$total, $clientId]);
    return $total;
}

function clientCommonServiceSheetPayload(array $client): array {
    $financials = calculatedClientFinancials(
        (float)($client['price'] ?? 0),
        (float)($client['predefined_price'] ?? 0),
        (float)($client['discount_percentage'] ?? 0),
        (float)($client['advance_amount'] ?? 0)
    );
    $clientDiscount = min(100, max((float)($client['discount_percentage'] ?? 0), 0));
    $predefinedPrice = moneyValue($client['predefined_price'] ?? 0);
    $grossPackage = max((float)($client['price'] ?? 0), 0);
    if ($grossPackage <= 0 && $predefinedPrice > 0) {
        $grossPackage = $predefinedPrice;
    }
    $workTotal = $grossPackage > 0 ? $grossPackage : $predefinedPrice;
    $paymentStatus = paymentStatusFromFinancials(
        $client['payment_status'] ?? null,
        $financials
    );
    return [
        'qr_code' => textValue($client['qr_code'] ?? '', 100),
        'client_name' => textValue($client['name'] ?? '', 255),
        'client_phone' => textValue($client['phone'] ?? '', 50),
        'client_email' => nullableTextValue($client['email'] ?? null, 255),
        'issue_description' => nullableTextValue($client['notes'] ?? null, 2000),
        'diagnostic_price' => $predefinedPrice,
        'parts_price' => moneyValue($client['service_parts_price'] ?? 0),
        'labor_price' => moneyValue($client['service_labor_price'] ?? 0),
        'internal_parts_cost' => nullableMoneyValue($client['valoare_piese'] ?? null),
        'internal_labor_cost' => nullableMoneyValue($client['manopera_colaboratori'] ?? null),
        'internal_other_costs' => nullableMoneyValue($client['alte_cheltuieli'] ?? null),
        'total_price' => $workTotal,
        'advance_amount' => $financials['advance'],
        'currency_code' => normalizeCurrencyCode($client['currency_code'] ?? 'RON'),
        'payment_status' => $paymentStatus,
        'client_package_price' => $grossPackage,
        'client_discount' => $clientDiscount,
        'final_price' => $financials['total'],
    ];
}

function invalidateServiceSheetPdf(PDO $db, array $sheet): void {
    if (!empty($sheet['service_pdf_filename']) || !empty($sheet['service_pdf_share_url'])) {
        deleteServiceSheetPublicFiles(buildServiceSheet($sheet));
    }
    $db->prepare(
        'UPDATE service_sheets
         SET service_pdf_filename = NULL,
             service_pdf_share_url = NULL,
             service_pdf_generated_at = NULL
         WHERE id = ?'
    )->execute([$sheet['id']]);
}

function syncExistingServiceSheetsFromClient(
    PDO $db,
    string $clientId,
    ?array $authUser = null,
    ?string $excludeSheetId = null
): void {
    if ($clientId === '' || !tableExists($db, 'service_sheets')) {
        return;
    }
    $client = serviceSheetClientRow($db, $clientId);
    if (!$client) {
        return;
    }
    $common = clientCommonServiceSheetPayload($client);
    $stmt = $db->prepare('SELECT * FROM service_sheets WHERE client_id = ?');
    $stmt->execute([$clientId]);
    $updateColumns = array_keys($common);
    $setSql = implode(', ', array_map(static fn($column) => "`{$column}` = ?", $updateColumns));
    $update = $db->prepare(
        "UPDATE service_sheets
         SET {$setSql}, updated_by = ?
         WHERE id = ?"
    );
    foreach ($stmt->fetchAll() as $sheet) {
        if ($excludeSheetId !== null && (string)$sheet['id'] === $excludeSheetId) {
            continue;
        }
        $changed = false;
        foreach ($common as $field => $value) {
            $old = $sheet[$field] ?? null;
            if (is_float($value) || is_int($value)) {
                if (abs((float)$old - (float)$value) > 0.00001) {
                    $changed = true;
                    break;
                }
            } elseif ((string)($old ?? '') !== (string)($value ?? '')) {
                $changed = true;
                break;
            }
        }
        if (!$changed) {
            continue;
        }
        invalidateServiceSheetPdf($db, $sheet);
        $values = array_values($common);
        $values[] = $authUser['id'] ?? null;
        $values[] = $sheet['id'];
        $update->execute($values);
    }
    syncClientFinalizationFromServiceSheets($db, $clientId, $authUser);
}

function syncClientFromServiceSheet(PDO $db, array $sheet, ?array $authUser): void {
    $clientId = textValue($sheet['client_id'] ?? '', 36);
    if ($clientId === '') {
        return;
    }
    $client = serviceSheetClientRow($db, $clientId);
    if (!$client) {
        return;
    }
    $predefinedPrice = moneyValue($sheet['diagnostic_price'] ?? 0);
    $partsPrice = moneyValue($sheet['parts_price'] ?? 0);
    $discount = min(100, max((float)($sheet['client_discount'] ?? 0), 0));
    $advance = moneyValue($sheet['advance_amount'] ?? 0);
    $currency = normalizeCurrencyCode($sheet['currency_code'] ?? 'RON');
    $sheetTotal = serviceSheetWorkPriceValue($sheet);
    $price = normalizeClientGrossPriceFromPayload(
        $sheetTotal,
        $predefinedPrice,
        $discount,
        (float)($client['price'] ?? 0)
    );
    $financials = calculatedClientFinancials($price, $predefinedPrice, $discount, $advance);
    $paymentStatus = paymentStatusFromFinancials(
        $sheet['payment_status'] ?? null,
        $financials
    );
    $after = array_merge($client, [
        'name' => textValue($sheet['client_name'] ?? $client['name'], 255),
        'phone' => textValue($sheet['client_phone'] ?? $client['phone'], 50),
        'email' => nullableTextValue($sheet['client_email'] ?? null, 255),
        'price' => $price,
        'predefined_price' => $predefinedPrice,
        'advance_amount' => $advance,
        'currency_code' => $currency,
        'payment_status' => $paymentStatus,
        'discount_percentage' => $discount,
        'service_parts_price' => $partsPrice,
        'service_labor_price' => moneyValue($sheet['labor_price'] ?? 0),
        'valoare_piese' => nullableMoneyValue($sheet['internal_parts_cost'] ?? null),
        'manopera_colaboratori' => nullableMoneyValue($sheet['internal_labor_cost'] ?? null),
        'alte_cheltuieli' => nullableMoneyValue($sheet['internal_other_costs'] ?? null),
        'notes' => nullableTextValue($sheet['issue_description'] ?? null, 2000),
    ]);
    $changes = clientFieldChanges($client, $after);
    if ($changes) {
        $db->prepare(
            'UPDATE clients
             SET name = ?, phone = ?, email = ?,
                 price = ?, predefined_price = ?, advance_amount = ?,
                 currency_code = ?, payment_status = ?, discount_percentage = ?,
                 service_parts_price = ?, service_labor_price = ?,
                 valoare_piese = ?, manopera_colaboratori = ?, alte_cheltuieli = ?, notes = ?
             WHERE id = ?'
        )->execute([
            $after['name'],
            $after['phone'],
            $after['email'],
            $after['price'],
            $after['predefined_price'],
            $after['advance_amount'],
            $after['currency_code'],
            $after['payment_status'],
            $after['discount_percentage'],
            $after['service_parts_price'],
            $after['service_labor_price'],
            $after['valoare_piese'],
            $after['manopera_colaboratori'],
            $after['alte_cheltuieli'],
            $after['notes'],
            $clientId,
        ]);
        logClientActivity($db, $clientId, $authUser, 'updated', 'Client sincronizat din fisa de service', [
            'service_sheet_id' => $sheet['id'] ?? null,
            'sheet_number' => $sheet['sheet_number'] ?? null,
            'changes' => $changes,
        ]);
    }
    syncExistingServiceSheetsFromClient(
        $db,
        $clientId,
        $authUser,
        !empty($sheet['id']) ? (string)$sheet['id'] : null
    );
    syncClientFinalizationFromServiceSheets($db, $clientId, $authUser);
}

function finalizeClientFromServiceSheet(PDO $db, array $sheet, ?array $authUser): void {
    if (!empty($sheet['client_id'])) {
        syncClientFinalizationFromServiceSheets($db, (string)$sheet['client_id'], $authUser);
    }
}

function regenerateServiceSheetPdfSnapshot(PDO $db, array $sheet): array {
    $pdfSheet = attachCompanyStampToServiceSheet($db, buildServiceSheet($sheet));
    $pdf = serviceSheetPdfBytesFromTemplateV3($pdfSheet);
    $stored = storeServiceSheetPdfPublicly($pdfSheet, $pdf);
    rememberServiceSheetPdf($db, (string)$pdfSheet['id'], $stored);

    $stmt = $db->prepare('SELECT * FROM service_sheets WHERE id = ?');
    $stmt->execute([(string)$pdfSheet['id']]);
    return buildServiceSheet($stmt->fetch() ?: $sheet);
}

function regenerateServiceSheetPdfSnapshotBestEffort(PDO $db, array $sheet): array {
    try {
        return regenerateServiceSheetPdfSnapshot($db, $sheet);
    } catch (Throwable $error) {
        $sheet['pdf_generation_error'] = $error->getMessage();
        return $sheet;
    }
}

function insertServiceSheet(PDO $db, array $payload, ?array $authUser): array {
    $id = uuid();
    $payload = array_merge([
        'id' => $id,
        'sheet_number' => serviceSheetNumber($db),
        'created_by' => $authUser['id'] ?? null,
        'updated_by' => $authUser['id'] ?? null,
    ], $payload);

    $columns = array_keys($payload);
    $sql = 'INSERT INTO service_sheets (`' . implode('`, `', $columns) . '`) VALUES (' .
        implode(', ', array_fill(0, count($columns), '?')) . ')';
    $stmt = $db->prepare($sql);
    $stmt->execute(array_values($payload));

    $stmt2 = $db->prepare('SELECT * FROM service_sheets WHERE id = ?');
    $stmt2->execute([$id]);
    $sheet = buildServiceSheet($stmt2->fetch());
    syncClientFromServiceSheet($db, $sheet, $authUser);
    $stmt2->execute([$id]);
    $sheet = buildServiceSheet($stmt2->fetch());
    finalizeClientFromServiceSheet($db, $sheet, $authUser);
    return $sheet;
}

function updateServiceSheetRow(PDO $db, string $id, array $payload, ?array $authUser): array {
    $current = serviceSheetRow($db, $id);
    if ($current) {
        invalidateServiceSheetPdf($db, $current);
    }
    $payload['updated_by'] = $authUser['id'] ?? null;
    $sets = array_map(static fn($column) => "`{$column}` = ?", array_keys($payload));
    $stmt = $db->prepare('UPDATE service_sheets SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $values = array_values($payload);
    $values[] = $id;
    $stmt->execute($values);

    $stmt2 = $db->prepare('SELECT * FROM service_sheets WHERE id = ?');
    $stmt2->execute([$id]);
    $sheet = buildServiceSheet($stmt2->fetch());
    syncClientFromServiceSheet($db, $sheet, $authUser);
    $stmt2->execute([$id]);
    $sheet = buildServiceSheet($stmt2->fetch());
    finalizeClientFromServiceSheet($db, $sheet, $authUser);
    return regenerateServiceSheetPdfSnapshotBestEffort($db, $sheet);
}

function buildServiceSheet(array $row): array {
    $boolFields = [
        'accessories_charger',
        'accessories_keys',
        'accessories_saddle',
        'accessories_other',
        'quick_powers_on',
        'quick_water_traces',
        'quick_impact',
        'quick_battery_risk',
        'old_parts_client',
        'old_parts_recycle',
        'approve_diagnostic_test',
        'approve_repair_estimate',
        'reject_repair',
        'vehicle_delivered_checked',
        'is_finalized',
        'show_company_details',
    ];
    $moneyFields = [
        'diagnostic_price',
        'parts_price',
        'labor_price',
        'total_price',
        'advance_amount',
        'client_package_price',
        'client_discount',
        'final_price',
        'storage_fee_per_day',
    ];
    $nullableMoneyFields = [
        'internal_parts_cost',
        'internal_labor_cost',
        'internal_other_costs',
    ];
    foreach ($boolFields as $field) {
        $row[$field] = (bool)($row[$field] ?? false);
    }
    foreach ($moneyFields as $field) {
        $row[$field] = (float)($row[$field] ?? 0);
    }
    foreach ($nullableMoneyFields as $field) {
        $row[$field] = array_key_exists($field, $row) && $row[$field] !== null
            ? (float)$row[$field]
            : null;
    }
    $row['effective_internal_parts_cost'] = effectiveInternalCost($row['internal_parts_cost'], $row['parts_price']);
    $row['effective_internal_labor_cost'] = effectiveInternalCost($row['internal_labor_cost'], $row['labor_price']);
    $row['effective_internal_other_costs'] = moneyValue($row['internal_other_costs']);
    $row['internal_total_cost'] = $row['effective_internal_parts_cost']
        + $row['effective_internal_labor_cost']
        + $row['effective_internal_other_costs'];
    $row['gtrots_remaining'] = max((float)($row['final_price'] ?? 0) - $row['internal_total_cost'], 0);
    $row['storage_after_days'] = (int)($row['storage_after_days'] ?? 0);
    $row['currency_code'] = normalizeCurrencyCode($row['currency_code'] ?? 'RON');
    $row['payment_status'] = normalizePaymentStatus($row['payment_status'] ?? null);
    $row['deadline_unit'] = normalizeDeadlineUnit($row['deadline_unit'] ?? 'zile');
    $sheetFinancials = calculatedServiceSheetFinancials($row);
    $row['payment_status'] = paymentStatusFromFinancials(
        $row['payment_status'] ?? null,
        $sheetFinancials
    );
    $sheetFinancials = applyPaymentStatusToFinancials($sheetFinancials, $row['payment_status']);
    $row['final_price'] = $sheetFinancials['total'];
    $row['amount_due'] = $sheetFinancials['amount_due'];
    $row['gtrots_remaining'] = max($row['final_price'] - $row['internal_total_cost'], 0);
    try {
        $hasClientSignature = !empty(normalizedClientSignature($row['client_signature'] ?? null));
    } catch (Throwable $error) {
        $hasClientSignature = false;
    }
    $row['is_finalized'] = $row['payment_status'] === 'incasati'
        && !empty($row['finalized_at'])
        && !empty($row['client_signed_at'])
        && $hasClientSignature
        && (bool)($row['is_finalized'] ?? false);
    return $row;
}

function serviceSheetResponseForUser(array $sheet, ?array $authUser, bool $financialEntry = false, ?PDO $db = null): array {
    $sheet['expense_costs'] = $db && !empty($sheet['client_id'])
        ? getClientExpenseCosts($db, (string)$sheet['client_id'])
        : [];
    $sheet['financials_hidden'] = false;
    if (!$authUser || $financialEntry || userCanViewClientFinancials($authUser)) {
        return $sheet;
    }

    foreach ([
        'diagnostic_price', 'parts_price', 'labor_price', 'total_price', 'advance_amount',
        'client_package_price', 'client_discount', 'final_price', 'amount_due',
        'storage_fee_per_day', 'internal_parts_cost', 'internal_labor_cost',
        'internal_other_costs', 'effective_internal_parts_cost', 'effective_internal_labor_cost',
        'effective_internal_other_costs', 'internal_total_cost', 'gtrots_remaining',
    ] as $field) {
        $sheet[$field] = 0;
    }
    $sheet['payment_status'] = 'de_incasat';
    $sheet['expense_costs'] = [];
    $sheet['financials_hidden'] = true;
    return $sheet;
}

function serviceSheetRow(PDO $db, string $id): ?array {
    $stmt = $db->prepare('SELECT * FROM service_sheets WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function userCanAccessServiceSheet(PDO $db, array $user, array $sheet): bool {
    if (!userCanViewServiceSheets($user)) {
        return false;
    }
    if (in_array($user['role'] ?? '', ['admin', 'manager'], true)) {
        return true;
    }
    $clientId = (string)($sheet['client_id'] ?? '');
    if ($clientId === '') {
        return false;
    }
    $client = serviceSheetClientRow($db, $clientId);
    return $client ? userHasClientAccess($db, $user, $client) : false;
}

function requireServiceSheetAccess(PDO $db, array $body, string $sheetId): array {
    $user = requireAuth($db, $body);
    $sheet = serviceSheetRow($db, $sheetId);
    if (!$sheet) {
        http_response_code(404);
        echo json_encode(['error' => 'Fisa de service nu exista.']);
        exit();
    }
    if (!userCanAccessServiceSheet($db, $user, $sheet)) {
        http_response_code(403);
        echo json_encode(['error' => 'Nu ai acces la aceasta fisa de service.']);
        exit();
    }
    return [$user, $sheet];
}

function pdfPlainText($value): string {
    $text = (string)($value ?? '');
    $map = [
        'Äƒ' => 'a', 'Ä‚' => 'A', 'Ã¢' => 'a', 'Ã‚' => 'A', 'Ã®' => 'i', 'ÃŽ' => 'I',
        'È™' => 's', 'È˜' => 'S', 'ÅŸ' => 's', 'Åž' => 'S', 'È›' => 't', 'Èš' => 'T',
        'Å£' => 't', 'Å¢' => 'T', 'â€“' => '-', 'â€”' => '-', 'â€œ' => '"', 'â€' => '"',
        'â€ž' => '"', 'â€™' => "'", 'â€¢' => '-',
    ];
    $text = strtr($text, $map);
    if (function_exists('iconv')) {
        $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if ($converted !== false) {
            $text = $converted;
        }
    }
    $text = preg_replace('/[^\x09\x0A\x0D\x20-\x7E]/', '', $text) ?? '';
    return trim($text);
}

function pdfEscape($value): string {
    return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], pdfPlainText($value));
}

function pdfY(float $top): float {
    return 841.8898 - $top;
}

function pdfText(&$content, float $x, float $top, string $text, float $size = 8, string $font = 'F1', string $color = '0.13 0.12 0.11'): void {
    $text = pdfEscape($text);
    if ($text === '') {
        return;
    }
    $content .= sprintf(
        "q %s rg BT /%s %.2f Tf %.2f %.2f Td (%s) Tj ET Q\n",
        $color,
        $font,
        $size,
        $x,
        pdfY($top),
        $text
    );
}

function pdfLine(&$content, float $x1, float $top1, float $x2, float $top2, float $width = 0.7, string $color = '0.70 0.65 0.58'): void {
    $content .= sprintf(
        "q %s RG %.2f w %.2f %.2f m %.2f %.2f l S Q\n",
        $color,
        $width,
        $x1,
        pdfY($top1),
        $x2,
        pdfY($top2)
    );
}

function pdfRect(&$content, float $x, float $top, float $w, float $h, string $stroke = '0.82 0.78 0.72', ?string $fill = null, float $lineWidth = 0.8): void {
    $y = pdfY($top + $h);
    if ($fill !== null) {
        $content .= sprintf("q %s rg %.2f %.2f %.2f %.2f re f Q\n", $fill, $x, $y, $w, $h);
    }
    $content .= sprintf("q %s RG %.2f w %.2f %.2f %.2f %.2f re S Q\n", $stroke, $lineWidth, $x, $y, $w, $h);
}

function pdfWrapLines(string $text, int $maxChars, int $maxLines): array {
    $text = preg_replace('/\s+/', ' ', pdfPlainText($text)) ?? '';
    $words = $text === '' ? [] : explode(' ', $text);
    $lines = [];
    $line = '';
    foreach ($words as $word) {
        $candidate = $line === '' ? $word : $line . ' ' . $word;
        if (strlen($candidate) <= $maxChars) {
            $line = $candidate;
            continue;
        }
        if ($line !== '') {
            $lines[] = $line;
        }
        $line = strlen($word) > $maxChars ? substr($word, 0, $maxChars) : $word;
        if (count($lines) >= $maxLines) {
            break;
        }
    }
    if ($line !== '' && count($lines) < $maxLines) {
        $lines[] = $line;
    }
    if (count($lines) > $maxLines) {
        $lines = array_slice($lines, 0, $maxLines);
    }
    if (count($lines) === $maxLines && strlen($text) > strlen(implode(' ', $lines))) {
        $lines[$maxLines - 1] = rtrim(substr($lines[$maxLines - 1], 0, max(0, $maxChars - 3))) . '...';
    }
    return $lines;
}

function pdfWrappedText(&$content, float $x, float $top, float $width, string $text, float $size = 8, float $lineHeight = 10, int $maxLines = 3, string $font = 'F1'): void {
    $maxChars = max(8, (int)floor($width / max(1, $size * 0.52)));
    foreach (pdfWrapLines($text, $maxChars, $maxLines) as $index => $line) {
        pdfText($content, $x, $top + ($index * $lineHeight), $line, $size, $font);
    }
}

function pdfField(&$content, string $label, string $value, float $x, float $top, float $w, float $labelW = 70): void {
    pdfText($content, $x, $top, $label, 6.6, 'F2', '0.31 0.29 0.27');
    pdfLine($content, $x + $labelW, $top + 4, $x + $w, $top + 4);
    pdfWrappedText($content, $x + $labelW + 4, $top - 1, max(20, $w - $labelW - 6), $value, 7.2, 8.5, 1);
}

function pdfCheck(&$content, float $x, float $top, string $label, bool $checked): void {
    pdfRect($content, $x, $top, 8, 8, '0.25 0.24 0.22', null, 0.8);
    if ($checked) {
        pdfLine($content, $x + 1.5, $top + 4.5, $x + 3.6, $top + 6.5, 1.1, '1.00 0.50 0.00');
        pdfLine($content, $x + 3.6, $top + 6.5, $x + 7, $top + 1.6, 1.1, '1.00 0.50 0.00');
    }
    pdfText($content, $x + 12, $top + 7, $label, 7, 'F2', '0.20 0.19 0.18');
}

function pdfMoney($value, string $currency = 'RON'): string {
    return number_format((float)($value ?? 0), 2, '.', '') . ' ' . normalizeCurrencyCode($currency);
}

function serviceSheetDeadlineLabel(array $sheet): string {
    $value = durationNumberValue($sheet['deadline'] ?? '');
    if ($value === '') {
        return '';
    }
    $unit = durationUnitFromText(
        (string)($sheet['deadline'] ?? ''),
        normalizeDeadlineUnit($sheet['deadline_unit'] ?? 'zile')
    );
    return durationLabel($value, $unit);
}

function serviceSheetWarrantyLabel(array $sheet): string {
    $raw = trim((string)($sheet['warranty'] ?? ''));
    if ($raw === '') {
        return '';
    }
    $label = warrantyLabel($raw);
    return $label !== '' ? $label : $raw;
}

function serviceSheetPdfBytes(array $sheet): string {
    $content = '';
    $orange = '1.00 0.52 0.00';
    $lightOrange = '1.00 0.95 0.88';
    $muted = '0.31 0.29 0.27';
    $line = '0.75 0.70 0.64';

    pdfRect($content, 20, 26, 555, 62, '0.84 0.80 0.74', '0.99 0.98 0.96', 0.8);
    pdfRect($content, 38, 35, 44, 44, $orange, $orange, 0.5);
    pdfText($content, 48, 62, 'GT', 24, 'F2', '1 1 1');
    pdfText($content, 96, 52, 'FISA DE SERVICE', 18, 'F2');
    pdfText($content, 96, 68, 'TROTINETE SI SCUTERE ELECTRICE', 9, 'F2', '0.68 0.32 0.00');
    pdfRect($content, 402, 38, 158, 40, '1.00 0.65 0.25', $lightOrange, 0.7);
    pdfText($content, 414, 53, 'NR. FISA', 7, 'F2', '0.68 0.32 0.00');
    pdfText($content, 488, 53, 'DATA / ORA', 7, 'F2', '0.68 0.32 0.00');
    pdfText($content, 414, 70, $sheet['sheet_number'] ?? '', 8, 'F2');
    pdfText($content, 488, 70, displayDateTimeValue($sheet['created_at'] ?? 'now'), 7.5, 'F1');

    pdfRect($content, 20, 98, 555, 36, '0.84 0.80 0.74', null, 0.7);
    pdfField($content, 'PRESTATOR', (string)($sheet['company_name'] ?? ''), 30, 112, 190, 54);
    pdfField($content, 'CUI / ORC', trim(($sheet['company_fiscal_code'] ?? '') . ' / ' . ($sheet['company_registration_number'] ?? ''), ' /'), 220, 112, 170, 52);
    pdfField($content, 'TELEFON', (string)($sheet['company_phone'] ?? ''), 400, 112, 160, 48);
    pdfField($content, 'ADRESA', (string)($sheet['company_address'] ?? ''), 30, 127, 240, 44);
    pdfField($content, 'E-MAIL', (string)($sheet['company_email'] ?? ''), 275, 127, 285, 44);

    pdfText($content, 25, 157, '1', 8, 'F2', '1 1 1');
    pdfRect($content, 20, 144, 16, 16, $orange, $orange, 0.5);
    pdfText($content, 46, 157, 'Client si vehicul', 12, 'F2');
    pdfText($content, 476, 157, 'identificare si stare la receptie', 7, 'F2', $muted);
    pdfRect($content, 20, 174, 270, 94, '0.84 0.80 0.74', null, 0.7);
    pdfRect($content, 305, 174, 270, 94, '0.84 0.80 0.74', null, 0.7);
    pdfField($content, 'NUME / FIRMA', (string)($sheet['client_name'] ?? ''), 31, 195, 260, 70);
    pdfField($content, 'TELEFON', (string)($sheet['client_phone'] ?? ''), 31, 213, 260, 70);
    pdfField($content, 'E-MAIL', (string)($sheet['client_email'] ?? ''), 31, 231, 260, 70);
    pdfField($content, 'ADRESA', (string)($sheet['client_address'] ?? ''), 31, 249, 260, 70);
    pdfText($content, 316, 195, 'TIP VEHICUL', 7, 'F2', $muted);
    pdfCheck($content, 382, 187, 'trotineta', ($sheet['vehicle_type'] ?? '') === 'trotineta');
    pdfCheck($content, 446, 187, 'scuter', ($sheet['vehicle_type'] ?? '') === 'scuter');
    pdfCheck($content, 496, 187, 'altul', ($sheet['vehicle_type'] ?? '') === 'altul');
    pdfField($content, 'MARCA / MODEL', (string)($sheet['vehicle_brand_model'] ?? ''), 316, 213, 250, 72);
    pdfField($content, 'NR. INMATR.', (string)($sheet['vehicle_registration'] ?? ''), 316, 231, 250, 72);
    pdfField($content, 'SERIE / SN', (string)($sheet['vehicle_series'] ?? ''), 316, 249, 250, 72);
    pdfField($content, 'KM', (string)($sheet['vehicle_km'] ?? ''), 316, 262, 120, 28);
    pdfField($content, 'BATERIE', (string)($sheet['vehicle_battery'] ?? ''), 446, 262, 120, 40);

    pdfRect($content, 20, 291, 16, 16, $orange, $orange, 0.5);
    pdfText($content, 25, 304, '2', 8, 'F2', '1 1 1');
    pdfText($content, 46, 304, 'Receptie si solicitare', 12, 'F2');
    pdfText($content, 460, 304, 'simptome, accesorii si urme vizibile', 7, 'F2', $muted);
    pdfRect($content, 20, 322, 555, 106, '0.84 0.80 0.74', null, 0.7);
    pdfText($content, 31, 345, 'DEFECT / SOLICITARE DECLARATA', 7, 'F2', $muted);
    pdfWrappedText($content, 31, 360, 290, (string)($sheet['issue_description'] ?? ''), 7.4, 9, 3);
    pdfText($content, 31, 403, 'AVARII / URME VIZIBILE', 7, 'F2', $muted);
    pdfWrappedText($content, 132, 403, 190, (string)($sheet['visible_damage'] ?? ''), 7.4, 9, 2);
    pdfLine($content, 333, 332, 333, 420, 0.6, $line);
    pdfText($content, 344, 345, 'ACCESORII PREDATE', 7, 'F2', $muted);
    pdfCheck($content, 344, 356, 'incarcator', !empty($sheet['accessories_charger']));
    pdfCheck($content, 416, 356, 'chei', !empty($sheet['accessories_keys']));
    pdfCheck($content, 462, 356, 'sa', !empty($sheet['accessories_saddle']));
    pdfCheck($content, 502, 356, 'altele', !empty($sheet['accessories_other']));
    pdfWrappedText($content, 344, 376, 210, (string)($sheet['accessories_other_text'] ?? ''), 7, 8, 1);
    pdfText($content, 344, 390, 'CONSTATARI RAPIDE', 7, 'F2', $muted);
    pdfCheck($content, 344, 400, 'porneste', !empty($sheet['quick_powers_on']));
    pdfCheck($content, 398, 400, 'nu porneste', !empty($sheet['quick_impact']));
    pdfCheck($content, 466, 400, 'urme apa', !empty($sheet['quick_water_traces']));
    pdfCheck($content, 520, 400, 'risc baterie', !empty($sheet['quick_battery_risk']));
    pdfText($content, 344, 419, 'POZA PRODUS', 7, 'F2', $muted);
    pdfCheck($content, 414, 411, 'DA', ($sheet['product_photo'] ?? '') === 'da');
    pdfCheck($content, 454, 411, 'NU', ($sheet['product_photo'] ?? '') === 'nu');

    pdfRect($content, 20, 439, 16, 16, $orange, $orange, 0.5);
    pdfText($content, 25, 452, '3', 8, 'F2', '1 1 1');
    pdfText($content, 46, 452, 'Diagnostic si interventie', 12, 'F2');
    pdfText($content, 478, 452, 'completat de unitatea service', 7, 'F2', $muted);
    pdfRect($content, 20, 467, 555, 116, '0.84 0.80 0.74', null, 0.7);
    pdfText($content, 31, 488, 'DIAGNOSTIC / CAUZA', 7, 'F2', $muted);
    pdfWrappedText($content, 31, 502, 525, (string)($sheet['diagnostic'] ?? ''), 7.4, 9, 3);
    pdfText($content, 31, 538, 'LUCRARI EFECTUATE / PIESE INLOCUITE / TEST FINAL', 7, 'F2', $muted);
    pdfWrappedText($content, 31, 552, 525, trim(($sheet['work_performed'] ?? '') . ' ' . ($sheet['parts_used'] ?? '')), 7.4, 9, 2);
    $currency = normalizeCurrencyCode($sheet['currency_code'] ?? 'RON');
    $pdfFinancials = applyPaymentStatusToFinancials(
        calculatedServiceSheetFinancials($sheet),
        normalizePaymentStatus($sheet['payment_status'] ?? null)
    );
    $amountDue = $pdfFinancials['amount_due'];
    pdfField($content, 'DIAGNOSTIC', pdfMoney($sheet['diagnostic_price'] ?? 0, $currency), 31, 578, 82, 0);
    pdfField($content, 'PIESE', pdfMoney($sheet['parts_price'] ?? 0, $currency), 110, 578, 75, 0);
    pdfField($content, 'MANOPERA', pdfMoney($sheet['labor_price'] ?? 0, $currency), 182, 578, 82, 0);
    pdfField($content, 'TERMEN', serviceSheetDeadlineLabel($sheet), 261, 578, 80, 0);
    pdfField($content, 'AVANS', pdfMoney($sheet['advance_amount'] ?? 0, $currency), 338, 578, 76, 0);
    pdfField($content, 'DE INCASAT', pdfMoney($amountDue, $currency), 411, 578, 82, 0);
    pdfField($content, 'TOTAL', pdfMoney($pdfFinancials['total'], $currency), 490, 578, 78, 0);

    pdfRect($content, 20, 596, 16, 16, $orange, $orange, 0.5);
    pdfText($content, 25, 609, '4', 8, 'F2', '1 1 1');
    pdfText($content, 46, 609, 'Conditii service', 12, 'F2');
    pdfText($content, 496, 609, 'acceptate prin semnare', 7, 'F2', $muted);
    pdfText($content, 46, 624, 'In temeiul legii: OG 21/1992 | Legea 193/2000 | Codul civil | GDPR UE 2016/679 | Legea 190/2018.', 7, 'F2', $muted);
    pdfRect($content, 20, 632, 555, 91, '1.00 0.65 0.25', $lightOrange, 0.5);
    $conditionsLeft = [
        '1. Clientul declara ca detine ori este autorizat sa predea vehiculul si ca datele comunicate sunt corecte.',
        '2. Predarea autorizeaza receptia, fotografierea starii, diagnosticul si demontarea necesara.',
        '3. Devizul initial este informativ; lucrarile suplimentare se executa doar dupa acordul clientului.',
        '4. Termenul poate fi modificat de piese indisponibile, defecte ascunse sau incompatibilitati.',
        '5. Pentru baterii cu risc termic, service-ul poate opri testarea si recomanda reciclarea.',
        '6. Clientul raspunde pentru parole, aplicatii, GPS si accesorii digitale necesare testarii.',
    ];
    $conditionsRight = [
        '7. Garantia lucrarii/pieselor este cea inscrisa in fisa, factura sau certificat.',
        '8. Garantia nu acopera uzura, apa, impactul, suprasarcina sau modificarile neautorizate.',
        '9. Piesele inlocuite se predau la cerere, exceptand piesele de garantie/periculoase.',
        '10. Vehiculul neridicat poate genera costuri de depozitare conform tarifului comunicat.',
        '11. Datele personale sunt folosite pentru service, comunicare, facturare si obligatii legale.',
        '12. Clauzele nu limiteaza drepturile consumatorului; reclamatiile se pot adresa legal.',
    ];
    foreach ($conditionsLeft as $i => $condition) {
        pdfWrappedText($content, 31, 647 + $i * 11, 250, $condition, 5.7, 6.2, 1);
    }
    pdfLine($content, 297, 642, 297, 716, 0.5, '1.00 0.65 0.25');
    foreach ($conditionsRight as $i => $condition) {
        pdfWrappedText($content, 307, 647 + $i * 11, 250, $condition, 5.7, 6.2, 1);
    }
    pdfText($content, 308, 709, 'SEMNATURA', 7, 'F2', $muted);
    pdfLine($content, 374, 709, 470, 709);
    pdfText($content, 482, 709, 'DATA', 7, 'F2', $muted);
    pdfLine($content, 512, 709, 565, 709);

    pdfRect($content, 20, 734, 555, 75, '0.84 0.80 0.74', null, 0.7);
    pdfText($content, 31, 752, 'ACORD / PREDARE', 11, 'F2');
    pdfCheck($content, 31, 765, 'Aprob diagnostic + test', !empty($sheet['approve_diagnostic_test']));
    pdfCheck($content, 150, 765, 'Aprob reparatia / devizul', !empty($sheet['approve_repair_estimate']));
    pdfCheck($content, 300, 765, 'Refuz reparatia', !empty($sheet['reject_repair']));
    pdfCheck($content, 404, 765, 'Vehicul predat si verificat', !empty($sheet['vehicle_delivered_checked']));
    $technicianName = (string)($sheet['technician_name'] ?? '');
    if ($technicianName === '') {
        $technicianName = (string)($sheet['mechanic_name'] ?? '');
    }
    pdfField($content, 'TEHNICIAN', $technicianName, 31, 792, 160, 0);
    pdfField($content, 'NUME CLIENT', (string)($sheet['client_name'] ?? ''), 183, 792, 160, 0);
    pdfField($content, 'SEMNATURA', '', 346, 792, 130, 0);
    pdfField($content, 'DATA', displayDateValue($sheet['updated_at'] ?? 'now'), 492, 792, 70, 0);
    pdfText(
        $content,
        31,
        807,
        'Depozitare: ' . pdfMoney($sheet['storage_fee_per_day'] ?? 0, $currency) . '/zi dupa ' .
        (int)($sheet['storage_after_days'] ?? 0) . ' zile | Garantie: ' . serviceSheetWarrantyLabel($sheet) .
        ' | Piese vechi: ' . (!empty($sheet['old_parts_client']) ? '[x] client ' : '[ ] client ') .
        (!empty($sheet['old_parts_recycle']) ? '[x] reciclare' : '[ ] reciclare'),
        6,
        'F2',
        $muted
    );
    pdfText($content, 20, 830, 'In temeiul legii: OG 21/1992 | Legea 193/2000 | Codul civil | GDPR UE 2016/679 | Legea 190/2018.', 5.5, 'F2', $muted);
    pdfText($content, 474, 830, 'G-TROTS / SERVICE VEHICULE ELECTRICE', 6, 'F2', '0.68 0.32 0.00');

    $objects = [];
    $objects[] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
    $objects[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2756 841.8898] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>';
    $objects[] = "<< /Length " . strlen($content) . " >>\nstream\n" . $content . "endstream";
    $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    foreach ($objects as $index => $object) {
        $offsets[] = strlen($pdf);
        $pdf .= ($index + 1) . " 0 obj\n" . $object . "\nendobj\n";
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
    $pdf .= "0000000000 65535 f \n";
    for ($i = 1; $i <= count($objects); $i++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
    }
    $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\n";
    $pdf .= "startxref\n" . $xref . "\n%%EOF";
    return $pdf;
}

// â”€â”€â”€ Router â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function pdfBottomText(&$content, float $x, float $y, string $text, float $size = 7.2, string $font = 'F1', string $color = '0.10 0.09 0.08'): void {
    $text = pdfEscape($text);
    if ($text === '') {
        return;
    }
    $content .= sprintf(
        "q %s rg BT /%s %.2f Tf %.2f %.2f Td (%s) Tj ET Q\n",
        $color,
        $font,
        $size,
        $x,
        $y,
        $text
    );
}

function pdfBottomWrappedText(&$content, float $x, float $y, float $width, string $text, float $size = 7.2, float $lineHeight = 9.0, int $maxLines = 2, string $font = 'F1'): void {
    $maxChars = max(8, (int)floor($width / max(1, $size * 0.52)));
    foreach (pdfWrapLines($text, $maxChars, $maxLines) as $index => $line) {
        pdfBottomText($content, $x, $y - ($index * $lineHeight), $line, $size, $font);
    }
}

function pdfWrapLinesByWidth(string $text, float $width, float $size, int $maxLines): array {
    $text = preg_replace('/\s+/', ' ', pdfPlainText($text)) ?? '';
    $text = trim($text);
    if ($text === '') {
        return [];
    }

    $lines = [];
    $line = '';
    $words = explode(' ', $text);
    foreach ($words as $word) {
        $candidate = $line === '' ? $word : $line . ' ' . $word;
        if (pdfApproxTextWidth($candidate, $size) <= $width) {
            $line = $candidate;
            continue;
        }

        if ($line !== '') {
            $lines[] = $line;
            if (count($lines) >= $maxLines) {
                break;
            }
            $line = '';
        }

        if (pdfApproxTextWidth($word, $size) <= $width) {
            $line = $word;
            continue;
        }

        $chunk = '';
        $chars = str_split($word);
        foreach ($chars as $char) {
            if (pdfApproxTextWidth($chunk . $char, $size) <= $width) {
                $chunk .= $char;
                continue;
            }
            if ($chunk !== '') {
                $lines[] = $chunk;
                if (count($lines) >= $maxLines) {
                    break 2;
                }
            }
            $chunk = $char;
        }
        $line = $chunk;
    }

    if ($line !== '' && count($lines) < $maxLines) {
        $lines[] = $line;
    }
    return array_slice($lines, 0, $maxLines);
}

function pdfBottomFittedWrappedText(
    &$content,
    float $x,
    float $y,
    float $width,
    string $text,
    float $size = 6.8,
    float $lineHeight = 13.0,
    int $maxLines = 4,
    float $minSize = 5.2,
    string $font = 'F1',
    float $lineFillFactor = 1.0
): void {
    $plainText = preg_replace('/\s+/', ' ', pdfPlainText($text)) ?? '';
    if ($plainText === '') {
        return;
    }

    $drawSize = $size;
    $lines = [];
    for ($candidateSize = $size; $candidateSize >= $minSize; $candidateSize -= 0.2) {
        $effectiveWidth = $width * max(0.75, min(1.25, $lineFillFactor));
        $candidateLines = pdfWrapLinesByWidth($plainText, $effectiveWidth, $candidateSize, $maxLines);
        $renderedText = rtrim(str_replace('...', '', implode(' ', $candidateLines)));
        $drawSize = $candidateSize;
        $lines = $candidateLines;
        if (strlen($renderedText) >= strlen($plainText)) {
            break;
        }
    }

    foreach ($lines as $index => $line) {
        pdfBottomText($content, $x, $y - ($index * $lineHeight), $line, $drawSize, $font);
    }
}

function pdfBottomLine(&$content, float $x1, float $y1, float $x2, float $y2, float $width = 1.15, string $color = '1.00 0.50 0.00'): void {
    $content .= sprintf(
        "q %s RG %.2f w %.2f %.2f m %.2f %.2f l S Q\n",
        $color,
        $width,
        $x1,
        $y1,
        $x2,
        $y2
    );
}

function pdfBottomRect(&$content, float $x, float $y, float $w, float $h, string $stroke = '0.82 0.78 0.72', ?string $fill = null, float $lineWidth = 0.6): void {
    if ($fill !== null) {
        $content .= sprintf("q %s rg %.2f %.2f %.2f %.2f re f Q\n", $fill, $x, $y, $w, $h);
    }
    $content .= sprintf("q %s RG %.2f w %.2f %.2f %.2f %.2f re S Q\n", $stroke, $lineWidth, $x, $y, $w, $h);
}

function pdfTemplateMark(&$content, float $x, float $baselineY, float $box = 7.8): void {
    $bottom = $baselineY - 1.0;
    pdfBottomLine($content, $x + 1.4, $bottom + 3.5, $x + 3.2, $bottom + 1.8, 1.15);
    pdfBottomLine($content, $x + 3.2, $bottom + 1.8, $x + $box - 1.1, $bottom + $box - 1.5, 1.15);
}

function pdfBottomSignature(&$content, ?string $signature, float $x, float $y, float $width, float $height): void {
    $decoded = json_decode((string)$signature, true);
    $strokes = is_array($decoded) ? ($decoded['strokes'] ?? null) : null;
    if (!is_array($strokes)) {
        return;
    }
    $aspectRatio = min(5.0, max(0.8, (float)($decoded['aspect_ratio'] ?? 2.2)));
    $minX = 1.0;
    $maxX = 0.0;
    $minY = 1.0;
    $maxY = 0.0;
    $validStrokes = [];
    foreach ($strokes as $stroke) {
        if (!is_array($stroke) || count($stroke) < 2) {
            continue;
        }
        $validStroke = [];
        foreach ($stroke as $point) {
            if (!is_array($point) || count($point) < 2) {
                continue;
            }
            $px = min(1, max(0, (float)$point[0]));
            $py = min(1, max(0, (float)$point[1]));
            $validStroke[] = [$px, $py];
            $minX = min($minX, $px);
            $maxX = max($maxX, $px);
            $minY = min($minY, $py);
            $maxY = max($maxY, $py);
        }
        if (count($validStroke) >= 2) {
            $validStrokes[] = $validStroke;
        }
    }
    if (!$validStrokes) {
        return;
    }

    $sourceWidth = max(($maxX - $minX) * $aspectRatio, 0.01);
    $sourceHeight = max($maxY - $minY, 0.01);
    $scale = min($width / $sourceWidth, $height / $sourceHeight);
    $drawWidth = $sourceWidth * $scale;
    $drawHeight = $sourceHeight * $scale;
    $offsetX = $x + ($width - $drawWidth) / 2;
    $offsetY = $y + ($height - $drawHeight) / 2;

    foreach ($validStrokes as $stroke) {
        $previous = null;
        foreach ($stroke as $point) {
            $current = [
                $offsetX + ((float)$point[0] - $minX) * $aspectRatio * $scale,
                $offsetY + ($maxY - (float)$point[1]) * $scale,
            ];
            if ($previous !== null) {
                pdfBottomLine(
                    $content,
                    $previous[0],
                    $previous[1],
                    $current[0],
                    $current[1],
                    1.05,
                    '0.08 0.07 0.06'
                );
            }
            $previous = $current;
        }
    }
}

function pdfStampImageFromDataUrl($value): ?array {
    $raw = trim((string)($value ?? ''));
    if ($raw === '' || !preg_match('#^data:image/(png|jpe?g);base64,#i', $raw)) {
        return null;
    }
    $base64 = substr($raw, strpos($raw, ',') + 1);
    $bytes = base64_decode($base64, true);
    if ($bytes === false || strlen($bytes) < 12) {
        return null;
    }
    $info = @getimagesizefromstring($bytes);
    if (!$info || empty($info[0]) || empty($info[1]) || empty($info['mime'])) {
        return null;
    }
    $mime = strtolower((string)$info['mime']);
    if ($mime === 'image/jpeg') {
        return ['bytes' => $bytes, 'width' => (int)$info[0], 'height' => (int)$info[1]];
    }
    if ($mime === 'image/png' && function_exists('imagecreatefromstring') && function_exists('imagejpeg')) {
        $image = @imagecreatefromstring($bytes);
        if (!$image) {
            return null;
        }
        $width = imagesx($image);
        $height = imagesy($image);
        $canvas = imagecreatetruecolor($width, $height);
        $white = imagecolorallocate($canvas, 255, 255, 255);
        imagefilledrectangle($canvas, 0, 0, $width, $height, $white);
        imagecopy($canvas, $image, 0, 0, 0, 0, $width, $height);
        ob_start();
        imagejpeg($canvas, null, 88);
        $jpeg = ob_get_clean();
        imagedestroy($image);
        imagedestroy($canvas);
        if (is_string($jpeg) && strlen($jpeg) > 12) {
            return ['bytes' => $jpeg, 'width' => $width, 'height' => $height];
        }
    }
    return null;
}

function pdfDrawImageFit(&$content, string $name, float $boxX, float $boxY, float $boxW, float $boxH, int $imageW, int $imageH): void {
    if ($imageW <= 0 || $imageH <= 0) {
        return;
    }
    $scale = min($boxW / $imageW, $boxH / $imageH);
    $drawW = $imageW * $scale;
    $drawH = $imageH * $scale;
    $x = $boxX + ($boxW - $drawW) / 2;
    $y = $boxY + ($boxH - $drawH) / 2;
    $content .= sprintf("q %.2f 0 0 %.2f %.2f %.2f cm /%s Do Q\n", $drawW, $drawH, $x, $y, $name);
}

function serviceSheetPdfBytesFromTemplate(array $sheet): string {
    $pageW = 595.2756;
    $pageH = 841.8898;
    $templatePath = __DIR__ . '/fisa-service-template-v2.jpg';
    if (!is_file($templatePath)) {
        throw new RuntimeException('Lipseste template-ul PDF: fisa-service-template-v2.jpg');
    }

    $imageBytes = file_get_contents($templatePath);
    if ($imageBytes === false) {
        throw new RuntimeException('Template-ul PDF nu poate fi citit.');
    }
    $imageInfo = @getimagesize($templatePath);
    $imageW = (int)($imageInfo[0] ?? 1310);
    $imageH = (int)($imageInfo[1] ?? 1853);

    $content = "q {$pageW} 0 0 {$pageH} 0 0 cm /Im1 Do Q\n";

    $margin = 20.0;
    $contentW = $pageW - 2 * $margin;
    $cardGap = 10.0;
    $cardW = ($contentW - $cardGap) / 2;
    $right = $margin + $cardW + $cardGap + 11;
    $split = $margin + 312;
    $rx = $split + 11;
    $dateCreated = displayDateTimeValue($sheet['created_at'] ?? 'now');
    $dateUpdated = displayDateValue($sheet['updated_at'] ?? ($sheet['created_at'] ?? 'now'));

    $infoX = $pageW - $margin - 174;
    pdfBottomText($content, $infoX + 11, 778, (string)($sheet['sheet_number'] ?? ''), 7.6, 'F2');
    pdfBottomText($content, $infoX + 84, 778, $dateCreated, 7.0, 'F1');

    $col = ($contentW - 24) / 3;
    pdfBottomWrappedText($content, $margin + 65, 731, 128, (string)($sheet['company_name'] ?? ''), 6.8, 8, 1);
    pdfBottomWrappedText($content, $margin + 17 + $col + 50, 731, 130, trim(($sheet['company_fiscal_code'] ?? '') . ' / ' . ($sheet['company_registration_number'] ?? ''), ' /'), 6.8, 8, 1);
    pdfBottomWrappedText($content, $margin + 24 + 2 * $col + 45, 731, 118, (string)($sheet['company_phone'] ?? ''), 6.8, 8, 1);
    pdfBottomWrappedText($content, $margin + 51, 717, 198, (string)($sheet['company_address'] ?? ''), 6.6, 8, 1);
    pdfBottomWrappedText($content, $margin + 17 + $col * 1.34 + 41, 717, 228, (string)($sheet['company_email'] ?? ''), 6.6, 8, 1);

    pdfBottomWrappedText($content, 103, 647, 182, (string)($sheet['client_name'] ?? ''), 7.2, 8.5, 1);
    pdfBottomWrappedText($content, 103, 629, 182, (string)($sheet['client_phone'] ?? ''), 7.2, 8.5, 1);
    pdfBottomWrappedText($content, 103, 611, 182, (string)($sheet['client_email'] ?? ''), 7.2, 8.5, 1);
    pdfBottomWrappedText($content, 103, 593, 182, (string)($sheet['client_address'] ?? ''), 6.8, 8, 1);

    $vehicleType = (string)($sheet['vehicle_type'] ?? 'trotineta');
    if ($vehicleType === 'trotineta') {
        pdfTemplateMark($content, $right + 67, 645, 7.8);
    } elseif ($vehicleType === 'scuter') {
        pdfTemplateMark($content, $right + 130, 645, 7.8);
    } else {
        pdfTemplateMark($content, $right + 181, 645, 7.8);
    }
    pdfBottomWrappedText($content, $right + 79, 629, 180, (string)($sheet['vehicle_brand_model'] ?? ''), 7.0, 8, 1);
    pdfBottomWrappedText($content, $right + 94, 613, 165, (string)($sheet['vehicle_registration'] ?? ''), 7.0, 8, 1);
    pdfBottomWrappedText($content, $right + 79, 597, 180, (string)($sheet['vehicle_series'] ?? ''), 7.0, 8, 1);
    pdfBottomWrappedText($content, $right + 29, 584, 90, (string)($sheet['vehicle_km'] ?? ''), 6.8, 8, 1);
    pdfBottomWrappedText($content, $right + 176, 584, 72, (string)($sheet['vehicle_battery'] ?? ''), 6.8, 8, 1);

    pdfBottomFittedWrappedText(
        $content,
        $margin + 11,
        504,
        292,
        (string)($sheet['issue_description'] ?? ''),
        6.8,
        13,
        4,
        5.2
    );
    pdfBottomWrappedText($content, $margin + 115, 471, 186, (string)($sheet['visible_damage'] ?? ''), 6.8, 8, 1);
    if (!empty($sheet['accessories_charger'])) pdfTemplateMark($content, $rx, 502, 7.8);
    if (!empty($sheet['accessories_keys'])) pdfTemplateMark($content, $rx + 72, 502, 7.8);
    if (!empty($sheet['accessories_saddle'])) pdfTemplateMark($content, $rx + 113, 502, 7.8);
    if (!empty($sheet['accessories_other'])) pdfTemplateMark($content, $rx + 148, 502, 7.8);
    if (!empty($sheet['accessories_other_text'])) {
        pdfBottomWrappedText($content, $rx + 182, 504, 58, (string)$sheet['accessories_other_text'], 5.5, 6, 1);
    }
    if (!empty($sheet['quick_powers_on'])) pdfTemplateMark($content, $rx, 472, 7.2);
    if (!empty($sheet['quick_impact'])) pdfTemplateMark($content, $rx + 54, 472, 7.2);
    if (!empty($sheet['quick_water_traces'])) pdfTemplateMark($content, $rx + 122, 472, 7.2);
    if (!empty($sheet['quick_battery_risk'])) pdfTemplateMark($content, $rx + 176, 472, 7.2);
    if (($sheet['product_photo'] ?? '') === 'da') {
        pdfTemplateMark($content, $rx, 442, 7.2);
    } elseif (($sheet['product_photo'] ?? '') === 'nu') {
        pdfTemplateMark($content, $rx + 48, 442, 7.2);
    }

    pdfBottomWrappedText($content, $margin + 11, 369, $contentW - 28, (string)($sheet['diagnostic'] ?? ''), 6.8, 10, 2);
    $workText = trim((string)($sheet['work_performed'] ?? '') . ' ' . (string)($sheet['parts_used'] ?? ''));
    pdfBottomWrappedText($content, $margin + 11, 319, $contentW - 28, $workText, 6.8, 10, 3);

    $currency = normalizeCurrencyCode($sheet['currency_code'] ?? 'RON');
    $pdfFinancials = applyPaymentStatusToFinancials(
        calculatedServiceSheetFinancials($sheet),
        normalizePaymentStatus($sheet['payment_status'] ?? null)
    );
    $amountDue = $pdfFinancials['amount_due'];
    $financialValuesOnOriginalLines = [
        [32.0, 277.0, 65.0, pdfMoney($sheet['diagnostic_price'] ?? 0, $currency)],
        [109.4, 277.0, 65.0, pdfMoney($sheet['parts_price'] ?? 0, $currency)],
        [186.8, 277.0, 65.0, pdfMoney($sheet['labor_price'] ?? 0, $currency)],
        [264.2, 277.0, 65.0, serviceSheetDeadlineLabel($sheet)],
        [341.6, 277.0, 65.0, pdfMoney($sheet['advance_amount'] ?? 0, $currency)],
        [419.0, 277.0, 65.0, pdfMoney($amountDue, $currency)],
        [496.4, 277.0, 65.0, pdfMoney($pdfFinancials['total'], $currency)],
    ];
    foreach ($financialValuesOnOriginalLines as [$x, $y, $w, $value]) {
        pdfBottomWrappedText($content, $x, $y, $w, (string)$value, 5.8, 6, 1, 'F2');
    }

    if (!empty($sheet['approve_diagnostic_test'])) pdfTemplateMark($content, $margin + 11, 75, 7.8);
    if (!empty($sheet['approve_repair_estimate'])) pdfTemplateMark($content, $margin + 130, 75, 7.8);
    if (!empty($sheet['reject_repair'])) pdfTemplateMark($content, $margin + 265, 75, 7.8);
    if (!empty($sheet['vehicle_delivered_checked'])) pdfTemplateMark($content, $margin + 358, 75, 7.8);

    $technicianName = (string)($sheet['technician_name'] ?? '');
    if ($technicianName === '') {
        $technicianName = (string)($sheet['mechanic_name'] ?? '');
    }
    pdfBottomWrappedText($content, $margin + 11, 51, 130, $technicianName, 6.8, 8, 1);
    pdfBottomWrappedText($content, $margin + 161, 51, 140, (string)($sheet['client_name'] ?? ''), 6.8, 8, 1);
    $signatureDate = !empty($sheet['client_signed_at'])
        ? displayDateValue($sheet['client_signed_at'])
        : $dateUpdated;
    pdfBottomSignature($content, $sheet['client_signature'] ?? null, $margin + 326, 47, 112, 15);
    pdfBottomSignature($content, $sheet['client_signature'] ?? null, $margin + 354, 128, 92, 18);
    pdfBottomWrappedText($content, $pageW - $margin - 65, 129.5, 61, $signatureDate, 6.6, 8, 1);
    pdfBottomWrappedText($content, $pageW - $margin - 84, 51, 62, $signatureDate, 6.8, 8, 1);
    pdfBottomText($content, 62.2, 39.5, number_format((float)($sheet['storage_fee_per_day'] ?? 0), 2, '.', ''), 5.2, 'F2');
    pdfBottomText($content, 101.0, 39.5, (string)(int)($sheet['storage_after_days'] ?? 0), 5.2, 'F2');
    pdfBottomWrappedText($content, 149.4, 39.5, 21.5, serviceSheetWarrantyLabel($sheet), 5.2, 5.8, 1, 'F2');
    if (!empty($sheet['old_parts_client'])) {
        pdfBottomText($content, 209.6, 39.5, 'x', 5.2, 'F2');
    }
    if (!empty($sheet['old_parts_recycle'])) {
        pdfBottomText($content, 233.5, 39.5, 'x', 5.2, 'F2');
    }

    $objects = [];
    $objects[] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
    $objects[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2756 841.8898] /Resources << /XObject << /Im1 5 0 R >> /Font << /F1 6 0 R /F2 7 0 R >> >> /Contents 4 0 R >>';
    $objects[] = "<< /Length " . strlen($content) . " >>\nstream\n" . $content . "endstream";
    $objects[] = "<< /Type /XObject /Subtype /Image /Width {$imageW} /Height {$imageH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($imageBytes) . " >>\nstream\n" . $imageBytes . "\nendstream";
    $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    foreach ($objects as $index => $object) {
        $offsets[] = strlen($pdf);
        $pdf .= ($index + 1) . " 0 obj\n" . $object . "\nendobj\n";
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
    $pdf .= "0000000000 65535 f \n";
    for ($i = 1; $i <= count($objects); $i++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
    }
    $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\n";
    $pdf .= "startxref\n" . $xref . "\n%%EOF";
    return $pdf;
}

function pdfApproxTextWidth(string $text, float $size): float {
    $text = pdfPlainText($text);
    $units = 0.0;
    $length = strlen($text);
    for ($i = 0; $i < $length; $i++) {
        $char = $text[$i];
        if ($char === ' ') {
            $units += 0.28;
        } elseif (strpos(".,:;!|'`ijlI[]()", $char) !== false) {
            $units += 0.28;
        } elseif (strpos('mwMW@#%&', $char) !== false) {
            $units += 0.82;
        } elseif (strpos('0123456789', $char) !== false) {
            $units += 0.56;
        } elseif (strtoupper($char) === $char && strtolower($char) !== $char) {
            $units += 0.62;
        } else {
            $units += 0.52;
        }
    }
    return $units * $size;
}

function pdfBottomFittedLine(
    &$content,
    float $x,
    float $y,
    float $width,
    string $text,
    float $size = 6.8,
    float $minSize = 4.2,
    string $font = 'F2',
    string $color = '0.10 0.09 0.08'
): void {
    $plainText = preg_replace('/\s+/', ' ', pdfPlainText($text)) ?? '';
    if ($plainText === '') {
        return;
    }

    $drawSize = $size;
    for ($candidate = $size; $candidate >= $minSize; $candidate -= 0.15) {
        $drawSize = $candidate;
        if (pdfApproxTextWidth($plainText, $candidate) <= $width) {
            break;
        }
    }

    $drawText = $plainText;
    if (pdfApproxTextWidth($drawText, $drawSize) > $width) {
        $ellipsis = '...';
        $maxLength = strlen($drawText);
        while ($maxLength > 0 && pdfApproxTextWidth(substr($drawText, 0, $maxLength) . $ellipsis, $drawSize) > $width) {
            $maxLength--;
        }
        $drawText = $maxLength > 0 ? rtrim(substr($drawText, 0, $maxLength)) . $ellipsis : '';
    }

    pdfBottomText($content, $x, $y, $drawText, $drawSize, $font, $color);
}

function pdfBottomWarrantyFinancialText(&$content, float $x, float $y, float $width, string $text): void {
    $plainText = preg_replace('/\s+/', ' ', pdfPlainText($text)) ?? '';
    $plainText = trim($plainText);
    if ($plainText === '') {
        return;
    }

    $lines = [];
    if (preg_match('/^(.+?\b\d+\s*(?:de\s+)?zile\b)\s+(.+)$/i', $plainText, $matches)) {
        $lines = [trim($matches[1]), trim($matches[2])];
    } else {
        $lines = pdfWrapLinesByWidth($plainText, $width, 4.6, 2);
    }

    if (count($lines) < 2) {
        pdfBottomFittedLine($content, $x, $y, $width, $plainText, 5.8, 2.0, 'F2');
        return;
    }

    $drawSize = 5.0;
    for ($candidate = 5.0; $candidate >= 2.6; $candidate -= 0.15) {
        $fits = true;
        foreach ($lines as $line) {
            if (pdfApproxTextWidth($line, $candidate) > $width * 0.94) {
                $fits = false;
                break;
            }
        }
        $drawSize = $candidate;
        if ($fits) {
            break;
        }
    }

    pdfBottomText($content, $x, $y, $lines[0], $drawSize, 'F2');
    pdfBottomText($content, $x, $y - 9.0, $lines[1], $drawSize, 'F2');
}

function serviceSheetPdfPaymentTemplateVariant(array $sheet): string {
    $financials = calculatedServiceSheetFinancials($sheet);
    $paymentStatus = paymentStatusFromFinancials($sheet['payment_status'] ?? null, $financials);
    $hasAdvance = max((float)($financials['advance'] ?? 0), 0) > 0.00001;
    $hasAmountDue = max((float)($financials['amount_due'] ?? 0), 0) > 0.00001;
    if ($hasAdvance && $hasAmountDue) {
        return $paymentStatus === 'incasati'
            ? 'rest-achitat-total-achitat'
            : 'rest-neachitat-total-neachitat';
    }
    return $paymentStatus === 'incasati'
        ? 'total-achitat'
        : 'total-neachitat';
}

function serviceSheetPdfTemplatePathsV4(array $sheet): array {
    $variant = serviceSheetPdfPaymentTemplateVariant($sheet);
    $companyVariant = !empty($sheet['show_company_details']) ? 'company' : 'no-company';
    $paths = [
        __DIR__ . '/fisa-service-template-v5-' . $companyVariant . '-' . $variant . '-1.jpg',
        __DIR__ . '/fisa-service-template-v5-' . $companyVariant . '-' . $variant . '-2.jpg',
    ];
    if (is_file($paths[0]) && is_file($paths[1])) {
        return $paths;
    }
    $paths = [
        __DIR__ . '/fisa-service-template-v4-' . $variant . '-1.jpg',
        __DIR__ . '/fisa-service-template-v4-' . $variant . '-2.jpg',
    ];
    if (is_file($paths[0]) && is_file($paths[1])) {
        return $paths;
    }
    return [
        __DIR__ . '/fisa-service-template-v3-1.jpg',
        __DIR__ . '/fisa-service-template-v3-2.jpg',
    ];
}

function serviceSheetPdfBytesFromTemplateV3(array $sheet): string {
    $pageW = 595.2756;
    $pageH = 841.8898;
    $templatePaths = serviceSheetPdfTemplatePathsV4($sheet);
    $templates = [];
    foreach ($templatePaths as $templatePath) {
        if (!is_file($templatePath)) {
            throw new RuntimeException('Lipseste template-ul PDF: ' . basename($templatePath));
        }
        $imageBytes = file_get_contents($templatePath);
        if ($imageBytes === false) {
            throw new RuntimeException('Template-ul PDF nu poate fi citit: ' . basename($templatePath));
        }
        $imageInfo = @getimagesize($templatePath);
        $templates[] = [
            'bytes' => $imageBytes,
            'width' => (int)($imageInfo[0] ?? 1310),
            'height' => (int)($imageInfo[1] ?? 1853),
        ];
    }

    $page1 = "q {$pageW} 0 0 {$pageH} 0 0 cm /Im1 Do Q\n";
    $page2 = "q {$pageW} 0 0 {$pageH} 0 0 cm /Im1 Do Q\n";
    // Noile opt variante sunt explicit fara stampila; switch-ul controleaza doar datele firmei.
    $stampImage = null;

    $margin = 20.0;
    $contentW = $pageW - 2 * $margin;
    $cardGap = 10.0;
    $cardW = ($contentW - $cardGap) / 2;
    $right = $margin + $cardW + $cardGap + 11;
    $split = $margin + 312;
    $rx = $split + 11;
    $rxW = $pageW - $margin - $rx - 12;
    $currency = normalizeCurrencyCode($sheet['currency_code'] ?? 'RON');
    $dateCreated = displayDateTimeValue($sheet['created_at'] ?? 'now');
    $dateUpdated = displayDateValue($sheet['updated_at'] ?? ($sheet['created_at'] ?? 'now'));
    $exitDateSource = trim((string)($sheet['finalized_at'] ?? ''));
    $dateExited = $exitDateSource !== '' ? displayDateTimeValue($exitDateSource) : '';

    $infoX = $pageW - $margin - 238 - 8;
    pdfBottomFittedLine($page1, $infoX + 11, 778, 44, (string)($sheet['sheet_number'] ?? ''), 6.8, 4.0);
    pdfBottomFittedLine($page1, $infoX + 68, 778, 74, $dateCreated, 6.4, 4.0, 'F1');
    pdfBottomFittedLine($page1, $infoX + 158, 778, 66, $dateExited, 6.4, 4.0, 'F1');

    if (!empty($sheet['show_company_details'])) {
        $col = ($contentW - 24) / 3;
        pdfBottomFittedLine($page1, $margin + 65, 731, 126, (string)($sheet['company_name'] ?? ''), 6.8, 4.6, 'F1');
        pdfBottomFittedLine($page1, $margin + 17 + $col + 50, 731, 128, trim(($sheet['company_fiscal_code'] ?? '') . ' / ' . ($sheet['company_registration_number'] ?? ''), ' /'), 6.8, 4.2, 'F1');
        pdfBottomFittedLine($page1, $margin + 24 + 2 * $col + 45, 731, 118, (string)($sheet['company_phone'] ?? ''), 6.8, 4.6, 'F1');
        pdfBottomFittedLine($page1, $margin + 51, 717, 198, (string)($sheet['company_address'] ?? ''), 6.6, 4.2, 'F1');
        pdfBottomFittedLine($page1, $margin + 17 + $col * 1.34 + 41, 717, 228, (string)($sheet['company_email'] ?? ''), 6.6, 4.2, 'F1');
    }

    pdfBottomFittedLine($page1, 103, 647, 182, (string)($sheet['client_name'] ?? ''), 7.2, 4.8, 'F1');
    pdfBottomFittedLine($page1, 103, 629, 182, (string)($sheet['client_phone'] ?? ''), 7.2, 4.8, 'F1');
    pdfBottomFittedLine($page1, 103, 611, 182, (string)($sheet['client_email'] ?? ''), 7.2, 4.8, 'F1');
    pdfBottomFittedLine($page1, 103, 593, 182, (string)($sheet['client_address'] ?? ''), 6.8, 4.6, 'F1');

    $vehicleType = (string)($sheet['vehicle_type'] ?? 'trotineta');
    if ($vehicleType === 'trotineta') {
        pdfTemplateMark($page1, $right + 67, 645, 7.8);
    } elseif ($vehicleType === 'scuter') {
        pdfTemplateMark($page1, $right + 130, 645, 7.8);
    } else {
        pdfTemplateMark($page1, $right + 181, 645, 7.8);
    }
    pdfBottomFittedLine($page1, $right + 79, 629, 180, (string)($sheet['vehicle_brand_model'] ?? ''), 7.0, 4.6, 'F1');
    pdfBottomFittedLine($page1, $right + 94, 613, 165, (string)($sheet['vehicle_registration'] ?? ''), 7.0, 4.6, 'F1');
    pdfBottomFittedLine($page1, $right + 79, 597, 180, (string)($sheet['vehicle_series'] ?? ''), 7.0, 4.6, 'F1');
    pdfBottomFittedLine($page1, $right + 29, 584, 90, (string)($sheet['vehicle_km'] ?? ''), 6.8, 4.4, 'F1');
    pdfBottomFittedLine($page1, $right + 176, 584, 72, (string)($sheet['vehicle_battery'] ?? ''), 6.8, 4.2, 'F1');

    pdfBottomFittedWrappedText(
        $page1,
        $margin + 11,
        506,
        $split - $margin - 22,
        (string)($sheet['issue_description'] ?? ''),
        6.25,
        16,
        4,
        4.7,
        'F1',
        1.0
    );
    pdfBottomFittedWrappedText($page1, $margin + 11, 423, $split - $margin - 22, (string)($sheet['visible_damage'] ?? ''), 6.25, 13, 2, 4.7, 'F1', 1.0);
    if (!empty($sheet['accessories_charger'])) pdfTemplateMark($page1, $rx, 500.2, 7.2);
    if (!empty($sheet['accessories_keys'])) pdfTemplateMark($page1, $rx + 72, 500.2, 7.2);
    if (!empty($sheet['accessories_saddle'])) pdfTemplateMark($page1, $rx + 113, 500.2, 7.2);
    if (!empty($sheet['accessories_other'])) pdfTemplateMark($page1, $rx + 148, 500.2, 7.2);
    if (!empty($sheet['accessories_other_text'])) {
        pdfBottomFittedWrappedText($page1, $rx, 489, $rxW, (string)$sheet['accessories_other_text'], 5.6, 13, 2, 4.1, 'F1', 1.15);
    }
    if (!empty($sheet['quick_powers_on'])) pdfTemplateMark($page1, $rx, 445, 7.2);
    if (!empty($sheet['quick_impact'])) pdfTemplateMark($page1, $rx + 54, 445, 7.2);
    if (!empty($sheet['quick_water_traces'])) pdfTemplateMark($page1, $rx + 122, 445, 7.2);
    if (!empty($sheet['quick_battery_risk'])) pdfTemplateMark($page1, $rx + 176, 445, 7.2);
    if (($sheet['product_photo'] ?? '') === 'da') {
        pdfTemplateMark($page1, $rx, 409, 7.2);
    } elseif (($sheet['product_photo'] ?? '') === 'nu') {
        pdfTemplateMark($page1, $rx + 48, 409, 7.2);
    }

    pdfBottomFittedWrappedText($page1, $margin + 11, 325, $contentW - 22, (string)($sheet['diagnostic'] ?? ''), 6.6, 15, 3, 4.8, 'F1', 1.08);
    $workText = trim((string)($sheet['work_performed'] ?? '') . ' ' . (string)($sheet['parts_used'] ?? ''));
    pdfBottomFittedWrappedText($page1, $margin + 11, 260, $contentW - 22, $workText, 6.6, 14, 4, 4.8, 'F1', 1.08);

    $sheetFinancials = calculatedServiceSheetFinancials($sheet);
    $pdfPaymentStatus = paymentStatusFromFinancials($sheet['payment_status'] ?? null, $sheetFinancials);
    $pdfFinancials = applyPaymentStatusToFinancials($sheetFinancials, $pdfPaymentStatus);
    // Pentru PDF pastram restul natural (total - avans) chiar daca statusul este achitat; statusul este aratat de template.
    $amountDue = $pdfFinancials['amount_due'];
    $topFinancialCells = [
        [75.6, 214.6, 54.0, pdfMoney($sheet['diagnostic_price'] ?? 0, $currency)],
        [165.0, 214.6, 70.0, pdfMoney($sheet['parts_price'] ?? 0, $currency)],
        [289.0, 214.6, 55.0, pdfMoney($sheet['labor_price'] ?? 0, $currency)],
        [396.0, 214.6, 56.0, serviceSheetWarrantyLabel($sheet)],
        [500.0, 214.6, 64.0, serviceSheetDeadlineLabel($sheet)],
    ];
    foreach ($topFinancialCells as [$x, $y, $width, $value]) {
        pdfBottomFittedLine($page1, $x, $y, $width, (string)$value, 5.7, 2.0, 'F2');
    }
    $pdfTemplateVariant = serviceSheetPdfPaymentTemplateVariant($sheet);
    $isTotalOnlyPaymentTemplate = in_array($pdfTemplateVariant, ['total-achitat', 'total-neachitat'], true);
    $isPaidPaymentTemplate = in_array($pdfTemplateVariant, ['rest-achitat-total-achitat', 'total-achitat'], true);
    $restValueX = $isTotalOnlyPaymentTemplate ? 262.1 : ($isPaidPaymentTemplate ? 294.0 : 300.9);
    $restValueWidth = $isTotalOnlyPaymentTemplate ? 121.1 : ($isPaidPaymentTemplate ? 89.2 : 82.3);
    $totalValueX = $isPaidPaymentTemplate ? 451.7 : 458.7;
    $totalValueWidth = $isPaidPaymentTemplate ? 112.6 : 105.6;
    $bottomFinancialCells = [
        [59.4, 190.6, 142.7, pdfMoney($sheet['advance_amount'] ?? 0, $currency)],
        [$restValueX, 190.6, $restValueWidth, $isTotalOnlyPaymentTemplate ? pdfMoney(0, $currency) : pdfMoney($amountDue, $currency)],
        [$totalValueX, 190.6, $totalValueWidth, pdfMoney($pdfFinancials['total'], $currency)],
    ];
    foreach ($bottomFinancialCells as [$x, $y, $width, $value]) {
        if ((string)$value === '') {
            continue;
        }
        pdfBottomFittedLine($page1, $x, $y, $width, (string)$value, 5.7, 2.0, 'F2');
    }

    pdfBottomFittedWrappedText($page1, $margin + 11, 108, $contentW - 24, (string)($sheet['observations'] ?? ''), 6.6, 13, 4, 4.8, 'F1', 1.06);

    $legalSplit = $margin + $contentW / 2;
    $signatureDate = !empty($sheet['client_signed_at'])
        ? displayDateValue($sheet['client_signed_at'])
        : $dateUpdated;
    pdfBottomSignature($page2, $sheet['client_signature'] ?? null, $legalSplit + 76, 528, 96, 25);
    pdfBottomFittedLine($page2, $legalSplit + 214, 535.5, 54, $signatureDate, 6.6, 4.4, 'F1');

    if (!empty($sheet['approve_diagnostic_test'])) pdfTemplateMark($page2, $margin + 11, 436, 8.6);
    if (!empty($sheet['approve_repair_estimate'])) pdfTemplateMark($page2, $margin + 155, 436, 8.6);
    if (!empty($sheet['reject_repair'])) pdfTemplateMark($page2, $margin + 315, 436, 8.6);
    if (!empty($sheet['vehicle_delivered_checked'])) pdfTemplateMark($page2, $margin + 420, 436, 8.6);

    $technicianName = (string)($sheet['technician_name'] ?? '');
    if ($technicianName === '') {
        $technicianName = (string)($sheet['mechanic_name'] ?? '');
    }
    pdfBottomFittedLine($page2, $margin + 11, 373, 150, $technicianName, 6.8, 4.2, 'F1');
    pdfBottomFittedLine($page2, $margin + 181, 373, 155, (string)($sheet['client_name'] ?? ''), 6.8, 4.2, 'F1');
    pdfBottomSignature($page2, $sheet['client_signature'] ?? null, $margin + 358, 367, 108, 24);
    pdfBottomFittedLine($page2, $pageW - $margin - 68, 373, 52, $signatureDate, 6.6, 4.2, 'F1');

    $storageText = pdfMoney($sheet['storage_fee_per_day'] ?? 0, $currency) . ' / zi';
    $storageAfterText = (string)(int)($sheet['storage_after_days'] ?? 0) . ' zile';
    pdfBottomFittedLine($page2, $margin + 205, 304, 82, $storageText, 5.8, 3.8, 'F2');
    pdfBottomFittedLine($page2, $margin + 306, 304, 70, $storageAfterText, 5.8, 3.8, 'F2');
    pdfBottomWarrantyFinancialText($page2, $margin + 399, 304, 106, serviceSheetWarrantyLabel($sheet));
    if ($stampImage) {
        pdfDrawImageFit(
            $page2,
            'Stamp1',
            $margin + 11 + 8,
            250 + 8,
            134,
            94,
            (int)$stampImage['width'],
            (int)$stampImage['height']
        );
    }

    $objects = [];
    $objects[] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[] = '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>';
    $objects[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2756 841.8898] /Resources << /XObject << /Im1 7 0 R >> /Font << /F1 9 0 R /F2 10 0 R >> >> /Contents 5 0 R >>';
    $stampResource = $stampImage ? ' /Stamp1 11 0 R' : '';
    $objects[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2756 841.8898] /Resources << /XObject << /Im1 8 0 R' . $stampResource . ' >> /Font << /F1 9 0 R /F2 10 0 R >> >> /Contents 6 0 R >>';
    $objects[] = "<< /Length " . strlen($page1) . " >>\nstream\n" . $page1 . "endstream";
    $objects[] = "<< /Length " . strlen($page2) . " >>\nstream\n" . $page2 . "endstream";
    $objects[] = "<< /Type /XObject /Subtype /Image /Width {$templates[0]['width']} /Height {$templates[0]['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($templates[0]['bytes']) . " >>\nstream\n" . $templates[0]['bytes'] . "\nendstream";
    $objects[] = "<< /Type /XObject /Subtype /Image /Width {$templates[1]['width']} /Height {$templates[1]['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($templates[1]['bytes']) . " >>\nstream\n" . $templates[1]['bytes'] . "\nendstream";
    $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    if ($stampImage) {
        $objects[] = "<< /Type /XObject /Subtype /Image /Width {$stampImage['width']} /Height {$stampImage['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($stampImage['bytes']) . " >>\nstream\n" . $stampImage['bytes'] . "\nendstream";
    }

    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    foreach ($objects as $index => $object) {
        $offsets[] = strlen($pdf);
        $pdf .= ($index + 1) . " 0 obj\n" . $object . "\nendobj\n";
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
    $pdf .= "0000000000 65535 f \n";
    for ($i = 1; $i <= count($objects); $i++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
    }
    $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\n";
    $pdf .= "startxref\n" . $xref . "\n%%EOF";
    return $pdf;
}

if ($action === 'bootstrapSystem') {
    try {
        echo json_encode(bootstrapSystem($body));
    } catch (InvalidArgumentException $error) {
        http_response_code(422);
        echo json_encode(['error' => $error->getMessage()]);
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => $error->getMessage()]);
    }
    exit();
}

if ($action === 'getMobileAppUpdate') {
    echo json_encode(mobileAppUpdateInfo((string)($_GET['currentVersion'] ?? '')));
    exit();
}

try {
    $db = connectDatabase(DB_HOST, DB_NAME, DB_USER, DB_PASS);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Database connection failed: ' . $e->getMessage() .
            ' Pentru un server nou foloseste initializarea din aplicatia Electron.',
    ]);
    exit();
}

ensureAuthTables($db);
ensureCompanySettingsTable($db);
ensurePricePresetsTable($db);
ensureClientFinancialSchema($db);
ensureClientOwnershipSchema($db);
ensureClientAccessSchema($db);
ensureClientActivitySchema($db);
ensureClientQrStatusConsistency($db);
ensurePartnerContactSchema($db);
ensureCollaboratorPercentageSchema($db);
ensureCustomExpensesSchema($db);
ensurePushNotificationTables($db);
ensureWhatsAppPredefinedMessagesTable($db);
ensureServiceSheetsTable($db);

try {

    // Chat
    if (in_array($action, [
        'getChatContacts',
        'getChatMessages',
        'acceptChat',
        'sendChatMessage',
        'markChatRead',
        'leaveChat',
        'closeChatConversation',
        'deleteChatConversation',
        'getChatUnread',
    ], true)) {
        ensureChatTables($db);
    }

    if ($action === 'login' || $action === 'adminLogin') {
        ensureAuthTables($db);
        $username = trim($body['username'] ?? '');
        $password = trim($body['password'] ?? '');
        $platform = $body['platform'] ?? 'desktop';
        if (!in_array($platform, ['desktop', 'mobile'], true)) {
            $platform = 'desktop';
        }

        $stmt = $db->prepare('SELECT * FROM app_users WHERE username = ? LIMIT 1');
        $stmt->execute([$username]);
        $user = $stmt->fetch();
        if ($user && (bool)$user['is_active'] && password_verify($password, $user['password_hash']) && userCanAccessPlatform($user, $platform)) {
            $rememberMe = !empty($body['remember_me']);
            $token = createSession($db, $user['id'], $platform, $rememberMe);
            echo json_encode([
                'success' => true,
                'token'   => $token,
                'user'    => buildAppUser($user),
            ]);
        } else {
            http_response_code(401);
            echo json_encode(['error' => 'User sau parola gresita.']);
        }

    } elseif ($action === 'logout') {
        ensureAuthTables($db);
        $token = currentAuthToken($body);
        if ($token !== '') {
            $stmt = $db->prepare('DELETE FROM app_sessions WHERE token_hash = ?');
            $stmt->execute([hash('sha256', $token)]);
        }
        echo json_encode(['success' => true]);

    } elseif ($action === 'registerPushToken') {
        $me = requireAuth($db, $body);
        $pushToken = trim((string)($body['push_token'] ?? ''));
        $platform = trim((string)($body['platform'] ?? 'android'));
        if (!isExpoPushToken($pushToken)) {
            http_response_code(422);
            echo json_encode(['error' => 'Push token invalid.']);
            exit();
        }
        if (!in_array($platform, ['android', 'ios', 'mobile'], true)) {
            $platform = 'android';
        }
        $stmt = $db->prepare(
            'INSERT INTO app_push_tokens (id, user_id, token, platform, last_seen_at)
             VALUES (?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
               user_id = VALUES(user_id),
               platform = VALUES(platform),
               last_seen_at = NOW(),
               updated_at = NOW()'
        );
        $stmt->execute([uuid(), $me['id'], $pushToken, $platform]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'unregisterPushToken') {
        $me = requireAuth($db, $body);
        $pushToken = trim((string)($body['push_token'] ?? ''));
        if ($pushToken !== '') {
            $stmt = $db->prepare('DELETE FROM app_push_tokens WHERE user_id = ? AND token = ?');
            $stmt->execute([$me['id'], $pushToken]);
        }
        echo json_encode(['success' => true]);

    } elseif ($action === 'getCurrentUser') {
        $user = requireAuth($db, $body);
        echo json_encode(buildAppUser($user));

    } elseif ($action === 'updateOwnProfile') {
        $user = requireAuth($db, $body, 'desktop');
        if (($user['role'] ?? '') !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Profilul poate fi modificat doar de administrator.']);
            exit();
        }
        $displayName = trim((string)($body['display_name'] ?? ''));
        $password = trim((string)($body['password'] ?? ''));
        if ($displayName === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Numele afisat este obligatoriu.']);
            exit();
        }
        if ($password !== '' && strlen($password) < 4) {
            http_response_code(422);
            echo json_encode(['error' => 'Parola trebuie sa aiba minimum 4 caractere.']);
            exit();
        }
        if ($password !== '') {
            $stmt = $db->prepare('UPDATE app_users SET display_name = ?, password_hash = ? WHERE id = ?');
            $stmt->execute([$displayName, password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        } else {
            $stmt = $db->prepare('UPDATE app_users SET display_name = ? WHERE id = ?');
            $stmt->execute([$displayName, $user['id']]);
        }
        $read = $db->prepare('SELECT * FROM app_users WHERE id = ?');
        $read->execute([$user['id']]);
        echo json_encode(buildAppUser($read->fetch()));

    } elseif ($action === 'getUsers') {
        requireAdmin($db, $body);
        $stmt = $db->query('SELECT * FROM app_users ORDER BY created_at DESC');
        echo json_encode(array_map('buildAppUser', $stmt->fetchAll()));

    } elseif ($action === 'getCompanySettings') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        ensureCompanySettingsTable($db);
        $stmt = $db->query('SELECT * FROM company_settings WHERE id = 1 LIMIT 1');
        echo json_encode(buildCompanySettings($stmt->fetch() ?: null));

    } elseif ($action === 'saveCompanySettings') {
        $me = requireAuth($db, $body, null, ['admin', 'manager']);
        ensureCompanySettingsTable($db);
        $settings = companySettingsPayload($body);
        if (!array_key_exists('stamp_image', $body)) {
            $currentStamp = $db->query('SELECT stamp_image FROM company_settings WHERE id = 1 LIMIT 1')->fetchColumn();
            $settings['stamp_image'] = $currentStamp !== false ? $currentStamp : null;
        }
        $stmt = $db->prepare(
            'INSERT INTO company_settings
             (id, company_name, fiscal_code, registration_number, address, phone, email, website, bank_name, iban, stamp_image, updated_by)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               company_name = VALUES(company_name),
               fiscal_code = VALUES(fiscal_code),
               registration_number = VALUES(registration_number),
               address = VALUES(address),
               phone = VALUES(phone),
               email = VALUES(email),
               website = VALUES(website),
               bank_name = VALUES(bank_name),
               iban = VALUES(iban),
               stamp_image = VALUES(stamp_image),
               updated_by = VALUES(updated_by),
               updated_at = CURRENT_TIMESTAMP'
        );
        $stmt->execute([
            $settings['company_name'],
            $settings['fiscal_code'],
            $settings['registration_number'],
            $settings['address'] !== '' ? $settings['address'] : null,
            $settings['phone'] !== '' ? $settings['phone'] : null,
            $settings['email'] !== '' ? $settings['email'] : null,
            $settings['website'] !== '' ? $settings['website'] : null,
            $settings['bank_name'] !== '' ? $settings['bank_name'] : null,
            $settings['iban'] !== '' ? $settings['iban'] : null,
            $settings['stamp_image'],
            $me['id'],
        ]);
        $read = $db->query('SELECT * FROM company_settings WHERE id = 1 LIMIT 1');
        echo json_encode(buildCompanySettings($read->fetch() ?: null));

    } elseif ($action === 'getSystemDatabaseInfo') {
        requireAdmin($db, $body);
        echo json_encode([
            'api_url' => publicApiBaseUrl(),
            'api_key' => API_KEY,
            'db_host' => DB_HOST,
            'db_name' => DB_NAME,
            'db_user' => DB_USER,
            'db_pass' => DB_PASS,
            'service_sheet_pdf_base_url' => normalizeServiceSheetPdfBaseUrl(
                (string)SERVICE_SHEET_PDF_BASE_URL
            ),
            'db_password_saved' => DB_PASS !== '',
            'schema_file' => is_file(__DIR__ . '/schema.sql') ? 'schema.sql' : null,
            'config_file_saved' => is_file(SERVER_CONFIG_FILE),
        ]);

    } elseif ($action === 'saveSystemDatabaseInfo') {
        requireAdmin($db, $body);

        $apiKey = trim((string)($body['api_key'] ?? API_KEY));
        $dbHost = trim((string)($body['db_host'] ?? ''));
        $dbName = trim((string)($body['db_name'] ?? ''));
        $dbUser = trim((string)($body['db_user'] ?? ''));
        $dbPassInput = (string)($body['db_pass'] ?? '');
        $keepDbPass = !empty($body['keep_db_pass']) && $dbPassInput === '';
        $dbPass = $keepDbPass ? DB_PASS : $dbPassInput;
        $serviceSheetPdfBaseUrl = normalizeServiceSheetPdfBaseUrl(
            (string)($body['service_sheet_pdf_base_url'] ?? SERVICE_SHEET_PDF_BASE_URL)
        );
        $runSchema = !empty($body['run_schema']);

        if ($apiKey === '' || $dbHost === '' || $dbName === '' || $dbUser === '') {
            http_response_code(422);
            echo json_encode(['error' => 'API key, DB host, DB name si DB user sunt obligatorii.']);
            exit();
        }

        $databaseResult = prepareSystemDatabase(
            $dbHost,
            $dbName,
            $dbUser,
            $dbPass,
            $runSchema
        );

        writeServerRuntimeConfig(array_merge(loadServerRuntimeConfig(), [
            'api_key' => $apiKey,
            'db_host' => $dbHost,
            'db_name' => $dbName,
            'db_user' => $dbUser,
            'db_pass' => $dbPass,
            'service_sheet_pdf_base_url' => $serviceSheetPdfBaseUrl,
        ]));

        echo json_encode([
            'success' => true,
            'database_created' => $databaseResult['database_created'],
            'schema_ran' => $databaseResult['schema_ran'],
            'schema_statements' => $databaseResult['schema_statements'],
            'default_admin_ready' => $databaseResult['default_admin_ready'],
            'config_file_saved' => true,
            'target_database' => $dbName,
            'api_key_changed' => $apiKey !== API_KEY,
            'message' => 'Configuratia a fost salvata. Aplicatiile vor folosi noua baza la urmatoarea cerere.',
        ]);

    } elseif ($action === 'createUser') {
        requireAdmin($db, $body);
        $username = trim($body['username'] ?? '');
        $password = trim($body['password'] ?? '');
        $displayName = trim($body['display_name'] ?? $username);
        $role = $body['role'] ?? 'user';
        if ($username === '' || $password === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Userul si parola sunt obligatorii.']);
            exit();
        }
        $duplicateStmt = $db->prepare('SELECT COUNT(*) FROM app_users WHERE LOWER(username) = LOWER(?)');
        $duplicateStmt->execute([$username]);
        if ((int)$duplicateStmt->fetchColumn() > 0) {
            http_response_code(422);
            echo json_encode(['error' => 'Username-ul exista deja. Alege alt username.']);
            exit();
        }
        if (!in_array($role, ['admin', 'manager', 'user'], true)) {
            $role = 'user';
        }
        $platformAccess = $body['platform_access'] ?? ($role === 'admin' ? 'desktop' : 'mobile');
        if (!in_array($platformAccess, ['desktop', 'mobile', 'both'], true)) {
            http_response_code(422);
            echo json_encode(['error' => 'Accesul platforma poate fi Mobile, Desktop sau Desktop + Mobil.']);
            exit();
        }
        if ($role === 'admin' && !in_array($platformAccess, ['desktop', 'both'], true)) {
            http_response_code(422);
            echo json_encode(['error' => 'Conturile admin pot avea acces pe Desktop sau Desktop + Mobil.']);
            exit();
        }
        $supportChatAccess = !empty($body['support_chat_access']) ? 1 : 0;
        $clientPanelAccess = in_array($role, ['admin', 'manager'], true)
            || !array_key_exists('client_panel_access', $body)
            || !empty($body['client_panel_access'])
            ? 1
            : 0;
        $clientEditAccess = $role === 'user' && !empty($body['client_edit_access']) ? 1 : 0;
        $serviceSheetAccess = in_array($role, ['admin', 'manager'], true)
            || !array_key_exists('service_sheet_access', $body)
            || !empty($body['service_sheet_access']) ? 1 : 0;
        $clientFinancialAccess = in_array($role, ['admin', 'manager'], true)
            || !array_key_exists('client_financial_access', $body)
            || !empty($body['client_financial_access']) ? 1 : 0;
        $isActive = !empty($body['is_active']) ? 1 : 0;
        $newId = uuid();
        $stmt = $db->prepare(
            'INSERT INTO app_users (id, username, password_hash, display_name, role, platform_access, support_chat_access, client_panel_access, client_edit_access, service_sheet_access, client_financial_access, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $newId,
            $username,
            password_hash($password, PASSWORD_DEFAULT),
            $displayName !== '' ? $displayName : $username,
            $role,
            $platformAccess,
            $supportChatAccess,
            $clientPanelAccess,
            $clientEditAccess,
            $serviceSheetAccess,
            $clientFinancialAccess,
            $isActive,
        ]);
        $read = $db->prepare('SELECT * FROM app_users WHERE id = ?');
        $read->execute([$newId]);
        echo json_encode(buildAppUser($read->fetch()));

    } elseif ($action === 'updateUser') {
        requireAdmin($db, $body);
        $userId = $id ?: ($body['id'] ?? '');
        $displayName = trim($body['display_name'] ?? '');
        $password = trim($body['password'] ?? '');
        $username = trim($body['username'] ?? '');
        $targetStmt = $db->prepare('SELECT * FROM app_users WHERE id = ? LIMIT 1');
        $targetStmt->execute([$userId]);
        $targetUser = $targetStmt->fetch();
        $isProtectedAdmin = $targetUser && strtolower((string)($targetUser['username'] ?? '')) === 'admin';

        if ($username !== '') {
            $duplicateStmt = $db->prepare('SELECT COUNT(*) FROM app_users WHERE LOWER(username) = LOWER(?) AND id <> ?');
            $duplicateStmt->execute([$username, $userId]);
            if ((int)$duplicateStmt->fetchColumn() > 0) {
                http_response_code(422);
                echo json_encode(['error' => 'Username-ul exista deja. Alege alt username.']);
                exit();
            }
        }

        if ($isProtectedAdmin) {
            if ($password !== '') {
                $stmt = $db->prepare(
                    'UPDATE app_users
                     SET display_name=?, role="admin", platform_access="both",
                         support_chat_access=1, client_panel_access=1, client_edit_access=1, service_sheet_access=1, client_financial_access=1, is_active=1, password_hash=?
                     WHERE id=?'
                );
                $stmt->execute([$displayName, password_hash($password, PASSWORD_DEFAULT), $userId]);
            } else {
                $stmt = $db->prepare(
                    'UPDATE app_users
                     SET display_name=?, role="admin", platform_access="both",
                         support_chat_access=1, client_panel_access=1, client_edit_access=1, service_sheet_access=1, client_financial_access=1, is_active=1
                     WHERE id=?'
                );
                $stmt->execute([$displayName, $userId]);
            }
            $read = $db->prepare('SELECT * FROM app_users WHERE id = ?');
            $read->execute([$userId]);
            echo json_encode(buildAppUser($read->fetch()));
            exit();
        }

        $role = $body['role'] ?? 'user';
        $isActive = !empty($body['is_active']) ? 1 : 0;
        if (!in_array($role, ['admin', 'manager', 'user'], true)) {
            $role = 'user';
        }
        $platformAccess = $body['platform_access'] ?? ($role === 'admin' ? 'desktop' : 'mobile');
        if (!in_array($platformAccess, ['desktop', 'mobile', 'both'], true)) {
            http_response_code(422);
            echo json_encode(['error' => 'Accesul platforma poate fi Mobile, Desktop sau Desktop + Mobil.']);
            exit();
        }
        if ($role === 'admin' && !in_array($platformAccess, ['desktop', 'both'], true)) {
            http_response_code(422);
            echo json_encode(['error' => 'Conturile admin pot avea acces pe Desktop sau Desktop + Mobil.']);
            exit();
        }
        $supportChatAccess = !empty($body['support_chat_access']) ? 1 : 0;
        $clientPanelAccess = in_array($role, ['admin', 'manager'], true)
            || !array_key_exists('client_panel_access', $body)
            || !empty($body['client_panel_access'])
            ? 1
            : 0;
        $clientEditAccess = $role === 'user' && !empty($body['client_edit_access']) ? 1 : 0;
        $serviceSheetAccess = in_array($role, ['admin', 'manager'], true)
            || !array_key_exists('service_sheet_access', $body)
            || !empty($body['service_sheet_access']) ? 1 : 0;
        $clientFinancialAccess = in_array($role, ['admin', 'manager'], true)
            || !array_key_exists('client_financial_access', $body)
            || !empty($body['client_financial_access']) ? 1 : 0;
        if ($password !== '') {
            $stmt = $db->prepare(
                'UPDATE app_users
                 SET display_name=?, role=?, platform_access=?, support_chat_access=?, client_panel_access=?, client_edit_access=?, service_sheet_access=?, client_financial_access=?, is_active=?, password_hash=?
                 WHERE id=?'
            );
            $stmt->execute([$displayName, $role, $platformAccess, $supportChatAccess, $clientPanelAccess, $clientEditAccess, $serviceSheetAccess, $clientFinancialAccess, $isActive, password_hash($password, PASSWORD_DEFAULT), $userId]);
        } else {
            $stmt = $db->prepare(
                'UPDATE app_users
                 SET display_name=?, role=?, platform_access=?, support_chat_access=?, client_panel_access=?, client_edit_access=?, service_sheet_access=?, client_financial_access=?, is_active=?
                 WHERE id=?'
            );
            $stmt->execute([$displayName, $role, $platformAccess, $supportChatAccess, $clientPanelAccess, $clientEditAccess, $serviceSheetAccess, $clientFinancialAccess, $isActive, $userId]);
        }
        if (!$supportChatAccess || !$isActive) {
            releaseChatAssignmentsForUser($db, $userId);
        }
        $read = $db->prepare('SELECT * FROM app_users WHERE id = ?');
        $read->execute([$userId]);
        echo json_encode(buildAppUser($read->fetch()));

    } elseif ($action === 'deleteUser') {
        $me = requireAdmin($db, $body);
        $userId = $id ?: ($body['id'] ?? '');
        if ($userId === $me['id']) {
            http_response_code(422);
            echo json_encode(['error' => 'Nu iti poti sterge propriul cont.']);
            exit();
        }
        $read = $db->prepare('SELECT * FROM app_users WHERE id = ? LIMIT 1');
        $read->execute([$userId]);
        $targetUser = $read->fetch();
        if ($targetUser && strtolower((string)($targetUser['username'] ?? '')) === 'admin') {
            http_response_code(422);
            echo json_encode(['error' => 'Userul principal "admin" nu poate fi sters.']);
            exit();
        }
        releaseChatAssignmentsForUser($db, $userId);
        $stmt = $db->prepare('DELETE FROM app_users WHERE id = ?');
        $stmt->execute([$userId]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'getChatContacts') {
        $actor = $_GET['actor'] ?? 'mobile';
        $isAgentActor = in_array($actor, ['admin', 'agent'], true);
        if ($isAgentActor) {
            $agent = requireSupportChatAgent($db, $body);
            $chatSupervisor = isChatSupervisor($agent);
            ensureChatTables($db);
            deleteEmptyChatArchives($db);
            $assignmentFilter = $chatSupervisor
                ? ''
                : ' AND (cc.assigned_agent_id IS NULL OR cc.assigned_agent_id = ?)';
            $stmt = $db->prepare(
                "SELECT cc.*,
                        requester.display_name AS requester_name,
                        requester.username AS requester_username,
                        requester.role AS requester_role,
                        assigned.display_name AS assigned_agent_name,
                        assigned.username AS assigned_agent_username,
                        assigned.role AS assigned_agent_role
                 FROM chat_conversations cc
                 JOIN app_users requester
                   ON requester.id = cc.mobile_account
                  AND requester.is_active = 1
                  AND requester.support_chat_access = 0
                 LEFT JOIN app_users assigned ON assigned.id = cc.assigned_agent_id
                 WHERE EXISTS (
                   SELECT 1 FROM chat_messages cm
                   WHERE cm.conversation_id = cc.id
                     AND cm.body NOT IN ('Utilizatorul a parasit conversatia.', 'Agent Support a inchis conversatia.')
                 )
                   $assignmentFilter
                 ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC"
            );
            $stmt->execute($chatSupervisor ? [] : [$agent['id']]);
            $contacts = [];
            foreach ($stmt->fetchAll() as $conversation) {
                $inactive = ($conversation['status'] ?? 'active') !== 'active';
                $contacts[] = [
                    'id'                        => $conversation['id'],
                    'mobile_id'                 => $conversation['mobile_account'],
                    'name'                      => $conversation['requester_name'],
                    'username'                  => $conversation['requester_username'],
                    'role'                      => $conversation['requester_role'],
                    'conversation_id'           => $conversation['id'],
                    'last_message_at'           => $conversation['last_message_at'],
                    'unread_count'              => chatUnreadCount($db, $conversation['id'], 'admin'),
                    'latest_message'            => latestChatMessage($db, $conversation['id']),
                    'status'                    => $conversation['status'] ?? 'active',
                    'left_at'                   => $conversation['left_at'] ?? null,
                    'closed_at'                 => $conversation['closed_at'] ?? null,
                    'assigned_agent_id'         => $conversation['assigned_agent_id'] ?? null,
                    'assigned_agent_name'       => $conversation['assigned_agent_name'] ?? null,
                    'assigned_agent_username'   => $conversation['assigned_agent_username'] ?? null,
                    'assigned_agent_role'       => $conversation['assigned_agent_role'] ?? null,
                    'can_reply'                 => !$inactive && (
                        $chatSupervisor
                        || (($conversation['assigned_agent_id'] ?? null) === $agent['id'])
                    ),
                ];
            }
            echo json_encode($contacts);
        } else {
            $user = requireChatRequester($db, $body);
            $conversation = getOrCreateChatConversation($db, $user['id'], $user['display_name']);
            $agentName = trim((string)($conversation['assigned_agent_name'] ?? ''));
            echo json_encode([[
                'id'                        => 'admin',
                'name'                      => $agentName !== '' ? $agentName . ' (Agent Support)' : 'Support',
                'role'                      => 'admin',
                'conversation_id'           => $conversation['id'],
                'last_message_at'           => $conversation['last_message_at'],
                'unread_count'              => chatUnreadCount($db, $conversation['id'], 'mobile'),
                'latest_message'            => latestChatMessage($db, $conversation['id']),
                'status'                    => $conversation['status'] ?? 'active',
                'left_at'                   => $conversation['left_at'] ?? null,
                'closed_at'                 => $conversation['closed_at'] ?? null,
                'assigned_agent_id'         => $conversation['assigned_agent_id'] ?? null,
                'assigned_agent_name'       => $conversation['assigned_agent_name'] ?? null,
                'assigned_agent_username'   => $conversation['assigned_agent_username'] ?? null,
                'assigned_agent_role'       => $conversation['assigned_agent_role'] ?? null,
            ]]);
        }

    } elseif ($action === 'getChatMessages') {
        $actor = $_GET['actor'] ?? 'mobile';
        $isAgentActor = in_array($actor, ['admin', 'agent'], true);
        if ($isAgentActor) {
            $agent = requireSupportChatAgent($db, $body);
            $chatSupervisor = isChatSupervisor($agent);
            $conversationId = $_GET['conversationId'] ?? ($_GET['mobileId'] ?? '');
            $conversation = getChatConversationById($db, $conversationId);
            $mobileUser = $conversation ? getChatRequesterById($db, $conversation['mobile_account']) : null;
            if (!$conversation || !$mobileUser) {
                http_response_code(404);
                echo json_encode(['error' => 'Conversatie inexistenta.']);
                exit();
            }
            if (!$chatSupervisor
                && !empty($conversation['assigned_agent_id'])
                && $conversation['assigned_agent_id'] !== $agent['id']) {
                http_response_code(403);
                echo json_encode(['error' => 'Conversatia este preluata de alt agent.']);
                exit();
            }
        } else {
            $user = requireChatRequester($db, $body);
            $conversation = getOrCreateChatConversation($db, $user['id'], $user['display_name']);
        }

        $stmt = $db->prepare(
            'SELECT * FROM chat_messages
             WHERE conversation_id = ?
             ORDER BY created_at ASC, id ASC'
        );
        $stmt->execute([$conversation['id']]);
        echo json_encode([
            'conversation' => buildChatConversation($conversation),
            'messages'     => array_map('buildChatMessage', $stmt->fetchAll()),
        ]);

    } elseif ($action === 'acceptChat') {
        $agent = requireSupportChatAgent($db, $body);
        $conversationId = $body['conversation_id'] ?? ($body['mobile_id'] ?? '');
        $conversation = getChatConversationById($db, $conversationId);
        if (!$conversation) {
            http_response_code(404);
            echo json_encode(['error' => 'Conversatie inexistenta.']);
            exit();
        }
        if (($conversation['status'] ?? 'active') !== 'active') {
            http_response_code(409);
            echo json_encode(['error' => 'Conversatia este inchisa.']);
            exit();
        }
        if (!empty($conversation['assigned_agent_id']) && $conversation['assigned_agent_id'] !== $agent['id']) {
            http_response_code(409);
            echo json_encode(['error' => 'Conversatia a fost deja preluata de alt agent.']);
            exit();
        }
        $acceptStmt = $db->prepare(
            'UPDATE chat_conversations
             SET assigned_agent_id = ?, admin_account = ?, assigned_at = COALESCE(assigned_at, NOW()), updated_at = NOW()
             WHERE id = ? AND (assigned_agent_id IS NULL OR assigned_agent_id = ?)'
        );
        $acceptStmt->execute([$agent['id'], $agent['username'], $conversation['id'], $agent['id']]);
        if ($acceptStmt->rowCount() === 0) {
            http_response_code(409);
            echo json_encode(['error' => 'Conversatia a fost deja preluata de alt agent.']);
            exit();
        }
        echo json_encode(buildChatConversation(getChatConversationById($db, $conversation['id'])));

    } elseif ($action === 'sendChatMessage') {
        $actor = $body['actor'] ?? 'mobile';
        $isAgentActor = in_array($actor, ['admin', 'agent'], true);
        $text = trim($body['body'] ?? '');
        if ($text === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Mesajul nu poate fi gol.']);
            exit();
        }

        if ($isAgentActor) {
            $adminUser = requireSupportChatAgent($db, $body);
            $chatSupervisor = isChatSupervisor($adminUser);
            $conversationId = $body['conversation_id'] ?? ($body['mobile_id'] ?? '');
            $conversation = getChatConversationById($db, $conversationId);
            $mobileUser = $conversation ? getChatRequesterById($db, $conversation['mobile_account']) : null;
            if (!$conversation || !$mobileUser) {
                http_response_code(404);
                echo json_encode(['error' => 'Conversatie inexistenta.']);
                exit();
            }
            if (($conversation['status'] ?? 'active') !== 'active') {
                http_response_code(409);
                echo json_encode(['error' => 'Conversatia este inchisa.']);
                exit();
            }
            $senderRole = 'admin';
            $senderId = $adminUser['id'];
            $recipientRole = 'mobile';
            $recipientId = $mobileUser['id'];
            $readByMobile = 0;
            $readByAdmin = 1;
            if (!$chatSupervisor && empty($conversation['assigned_agent_id'])) {
                http_response_code(422);
                echo json_encode(['error' => 'Accepta conversatia inainte sa raspunzi.']);
                exit();
            }
            if (!$chatSupervisor && $conversation['assigned_agent_id'] !== $adminUser['id']) {
                http_response_code(403);
                echo json_encode(['error' => 'Conversatia este preluata de alt agent.']);
                exit();
            }
        } else {
            $mobileUser = requireChatRequester($db, $body);
            $senderRole = 'mobile';
            $senderId = $mobileUser['id'];
            $recipientRole = 'admin';
            $recipientId = 'admin';
            $readByMobile = 1;
            $readByAdmin = 0;
            $conversation = getOrCreateChatConversation($db, $mobileUser['id'], $mobileUser['display_name']);
        }

        $messageId = uuid();
        $stmt = $db->prepare(
            'INSERT INTO chat_messages
             (id, conversation_id, sender_role, sender_id, recipient_role, recipient_id, body, read_by_mobile, read_by_admin)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $messageId,
            $conversation['id'],
            $senderRole,
            $senderId,
            $recipientRole,
            $recipientId,
            $text,
            $readByMobile,
            $readByAdmin,
        ]);
        $db->prepare('UPDATE chat_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?')
            ->execute([$conversation['id']]);

        $readStmt = $db->prepare('SELECT * FROM chat_messages WHERE id = ?');
        $readStmt->execute([$messageId]);
        $savedMessage = buildChatMessage($readStmt->fetch());

        try {
            $pushRecipients = pushRecipientIdsForChat($db, $recipientRole, $recipientId, $conversation);
            $pushTitle = $recipientRole === 'mobile'
                ? 'Mesaj nou de la Support'
                : 'Mesaj nou de la ' . ($mobileUser['display_name'] ?? 'client');
            sendPushNotificationToUsers($db, $pushRecipients, $pushTitle, $text, [
                'screen' => 'chat',
                'conversationId' => $conversation['id'],
                'messageId' => $messageId,
            ]);
        } catch (Throwable $pushError) {
            // Mesajul ramane trimis chiar daca furnizorul de push nu raspunde.
        }

        echo json_encode($savedMessage);

    } elseif ($action === 'markChatRead') {
        $actor = $body['actor'] ?? 'mobile';
        $isAgentActor = in_array($actor, ['admin', 'agent'], true);
        if ($isAgentActor) {
            $agent = requireSupportChatAgent($db, $body);
            $chatSupervisor = isChatSupervisor($agent);
            $conversationId = $body['conversation_id'] ?? ($body['mobile_id'] ?? '');
            $conversation = getChatConversationById($db, $conversationId);
            if (!$conversation) {
                http_response_code(404);
                echo json_encode(['error' => 'Conversatie inexistenta.']);
                exit();
            }
            if (!$chatSupervisor
                && !empty($conversation['assigned_agent_id'])
                && $conversation['assigned_agent_id'] !== $agent['id']) {
                echo json_encode(['success' => true]);
                exit();
            }
        } else {
            $mobileUser = requireChatRequester($db, $body);
            $conversation = getOrCreateChatConversation($db, $mobileUser['id'], $mobileUser['display_name']);
        }
        if ($isAgentActor) {
            $stmt = $db->prepare(
                'UPDATE chat_messages SET read_by_admin = 1
                 WHERE conversation_id = ? AND sender_role = "mobile"'
            );
        } else {
            $stmt = $db->prepare(
                'UPDATE chat_messages SET read_by_mobile = 1
                 WHERE conversation_id = ? AND sender_role = "admin"'
            );
        }
        $stmt->execute([$conversation['id']]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'leaveChat') {
        $mobileUser = requireChatRequester($db, $body);
        $conversation = getOrCreateChatConversation($db, $mobileUser['id'], $mobileUser['display_name']);
        if (!chatHasSupportReply($db, $conversation['id'])) {
            http_response_code(409);
            echo json_encode(['error' => 'Conversatia poate fi parasita dupa primul raspuns de la Agent Support.']);
            exit();
        }
        if (chatMessageCount($db, $conversation['id']) === 0) {
            $db->prepare(
                'UPDATE chat_conversations
                 SET admin_account = "admin", assigned_agent_id = NULL, assigned_at = NULL,
                     last_message_at = NULL, updated_at = NOW()
                 WHERE id = ? AND status = "active"'
            )->execute([$conversation['id']]);
            echo json_encode([
                'success' => true,
                'conversation' => buildChatConversation(getChatConversationById($db, $conversation['id'])),
            ]);
            exit();
        }
        $db->beginTransaction();
        try {
            $messageId = uuid();
            $db->prepare(
                'INSERT INTO chat_messages
                 (id, conversation_id, sender_role, sender_id, recipient_role, recipient_id, body, read_by_mobile, read_by_admin)
                 VALUES (?, ?, "mobile", ?, "admin", "admin", ?, 1, 0)'
            )->execute([
                $messageId,
                $conversation['id'],
                $mobileUser['id'],
                'Utilizatorul a parasit conversatia.',
            ]);
            $db->prepare(
                'UPDATE chat_conversations
                 SET status = "left", left_at = NOW(), last_message_at = NOW(), updated_at = NOW()
                 WHERE id = ? AND status = "active"'
            )->execute([$conversation['id']]);
            $newConversationId = uuid();
            $db->prepare(
                'INSERT INTO chat_conversations (id, mobile_account, admin_account, title, status)
                 VALUES (?, ?, "admin", ?, "active")'
            )->execute([$newConversationId, $mobileUser['id'], $mobileUser['display_name']]);
            $db->commit();
            try {
                $pushRecipients = pushRecipientIdsForChat($db, 'admin', 'admin', $conversation);
                sendPushNotificationToUsers($db, $pushRecipients, 'Conversatie parasita', 'Utilizatorul a parasit conversatia.', [
                    'screen' => 'chat',
                    'conversationId' => $conversation['id'],
                    'messageId' => $messageId,
                ]);
            } catch (Throwable $pushError) {
            }
            echo json_encode([
                'success' => true,
                'conversation' => buildChatConversation(getChatConversationById($db, $newConversationId)),
            ]);
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $error;
        }

    } elseif ($action === 'closeChatConversation') {
        $agent = requireSupportChatAgent($db, $body);
        $conversationId = $body['conversation_id'] ?? '';
        $conversation = getChatConversationById($db, $conversationId);
        if (!$conversation) {
            http_response_code(404);
            echo json_encode(['error' => 'Conversatie inexistenta.']);
            exit();
        }
        if (($conversation['status'] ?? 'active') !== 'active') {
            http_response_code(409);
            echo json_encode(['error' => 'Conversatia este deja inchisa.']);
            exit();
        }
        if (!isChatSupervisor($agent)
            && (empty($conversation['assigned_agent_id']) || $conversation['assigned_agent_id'] !== $agent['id'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Doar agentul care a preluat conversatia o poate inchide.']);
            exit();
        }

        $db->beginTransaction();
        try {
            $messageId = uuid();
            $db->prepare(
                'INSERT INTO chat_messages
                 (id, conversation_id, sender_role, sender_id, recipient_role, recipient_id, body, read_by_mobile, read_by_admin)
                 VALUES (?, ?, "admin", ?, "mobile", ?, ?, 0, 1)'
            )->execute([
                $messageId,
                $conversation['id'],
                $agent['id'],
                $conversation['mobile_account'],
                'Agent Support a inchis conversatia.',
            ]);
            $db->prepare(
                'UPDATE chat_conversations
                 SET status = "closed", closed_at = NOW(), last_message_at = NOW(), updated_at = NOW()
                 WHERE id = ? AND status = "active"'
            )->execute([$conversation['id']]);
            $newConversationId = uuid();
            $db->prepare(
                'INSERT INTO chat_conversations (id, mobile_account, admin_account, title, status)
                 VALUES (?, ?, "admin", ?, "active")'
            )->execute([$newConversationId, $conversation['mobile_account'], $conversation['title']]);
            $db->commit();
            try {
                sendPushNotificationToUsers($db, [$conversation['mobile_account']], 'Conversatie inchisa', 'Agent Support a inchis conversatia.', [
                    'screen' => 'chat',
                    'conversationId' => $conversation['id'],
                    'messageId' => $messageId,
                ]);
            } catch (Throwable $pushError) {
            }
            echo json_encode([
                'success' => true,
                'conversation' => buildChatConversation(getChatConversationById($db, $newConversationId)),
            ]);
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $error;
        }

    } elseif ($action === 'deleteChatConversation') {
        $agent = requireSupportChatAgent($db, $body);
        $conversationId = $body['conversation_id'] ?? ($_GET['conversationId'] ?? '');
        $conversation = getChatConversationById($db, $conversationId);
        if (!$conversation) {
            http_response_code(404);
            echo json_encode(['error' => 'Conversatie inexistenta.']);
            exit();
        }
        if (($conversation['status'] ?? 'active') === 'active') {
            http_response_code(409);
            echo json_encode(['error' => 'Doar conversatiile inchise pot fi sterse.']);
            exit();
        }
        if (!isChatSupervisor($agent)
            && !empty($conversation['assigned_agent_id'])
            && $conversation['assigned_agent_id'] !== $agent['id']) {
            http_response_code(403);
            echo json_encode(['error' => 'Conversatia este preluata de alt agent.']);
            exit();
        }
        $stmt = $db->prepare('DELETE FROM chat_conversations WHERE id = ? AND status <> "active"');
        $stmt->execute([$conversationId]);
        echo json_encode(['success' => $stmt->rowCount() > 0]);

    } elseif ($action === 'getChatUnread') {
        $actor = $_GET['actor'] ?? 'mobile';
        $isAgentActor = in_array($actor, ['admin', 'agent'], true);
        if ($isAgentActor) {
            $agent = requireSupportChatAgent($db, $body);
            ensureChatTables($db);
            deleteEmptyChatArchives($db);
            $chatSupervisor = isChatSupervisor($agent);
            $filter = $chatSupervisor ? '' : ' AND (cc.assigned_agent_id IS NULL OR cc.assigned_agent_id = ?)';
            $params = $chatSupervisor ? [] : [$agent['id']];
            $countStmt = $db->prepare(
                'SELECT COUNT(DISTINCT cm.conversation_id)
                 FROM chat_messages cm
                 JOIN chat_conversations cc ON cc.id = cm.conversation_id
                 JOIN app_users au
                  ON au.id = cc.mobile_account
                  AND au.is_active = 1
                  AND au.support_chat_access = 0
                 WHERE cm.sender_role = "mobile" AND cm.read_by_admin = 0' . $filter
            );
            $countStmt->execute($params);
            $latestStmt = $db->prepare(
                'SELECT cm.*
                 FROM chat_messages cm
                 JOIN chat_conversations cc ON cc.id = cm.conversation_id
                 JOIN app_users au
                  ON au.id = cc.mobile_account
                  AND au.is_active = 1
                  AND au.support_chat_access = 0
                 WHERE cm.sender_role = "mobile" AND cm.read_by_admin = 0' . $filter . '
                 ORDER BY cm.created_at DESC, cm.id DESC
                 LIMIT 1'
            );
            $latestStmt->execute($params);
            $latest = $latestStmt->fetch();
            echo json_encode([
                'unread_count'   => (int)$countStmt->fetchColumn(),
                'latest_message' => $latest ? buildChatMessage($latest) : null,
            ]);
        } else {
            $mobileUser = requireChatRequester($db, $body);
            $conversation = getOrCreateChatConversation($db, $mobileUser['id'], $mobileUser['display_name']);
            echo json_encode([
                'unread_count'   => chatUnreadCount($db, $conversation['id'], 'mobile'),
                'latest_message' => latestChatMessage($db, $conversation['id']),
            ]);
        }

    // â”€â”€ Clients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    } elseif ($action === 'sendWhatsAppQr') {
        requireAuth($db, $body, 'desktop');
        $phone = normalizeWhatsAppPhone((string)($body['phone'] ?? ''));
        $caption = trim((string)($body['caption'] ?? ''));
        $imageDataUrl = (string)($body['image_data_url'] ?? '');

        if ($phone === '' || strlen($phone) < 10 || strlen($phone) > 15) {
            http_response_code(422);
            echo json_encode(['error' => 'Numarul de telefon al clientului nu este valid pentru WhatsApp.']);
            exit();
        }
        if (!str_starts_with($imageDataUrl, 'data:image/png;base64,')) {
            http_response_code(422);
            echo json_encode(['error' => 'Imaginea QR nu este un PNG valid.']);
            exit();
        }

        $imageBytes = base64_decode(substr($imageDataUrl, strlen('data:image/png;base64,')), true);
        if ($imageBytes === false || strlen($imageBytes) < 100 || strlen($imageBytes) > 5 * 1024 * 1024) {
            http_response_code(422);
            echo json_encode(['error' => 'Imaginea QR este invalida sau prea mare.']);
            exit();
        }

        $tempPath = tempnam(sys_get_temp_dir(), 'gtrots_qr_');
        if ($tempPath === false || file_put_contents($tempPath, $imageBytes) === false) {
            throw new RuntimeException('Imaginea QR nu a putut fi pregatita pe server.');
        }

        try {
            $upload = whatsappApiRequest(
                WHATSAPP_PHONE_NUMBER_ID . '/media',
                [
                    'messaging_product' => 'whatsapp',
                    'type' => 'image/png',
                    'file' => new CURLFile($tempPath, 'image/png', 'gtrots_qr.png'),
                ],
                true
            );
            $mediaId = (string)($upload['id'] ?? '');
            if ($mediaId === '') {
                throw new RuntimeException('WhatsApp nu a returnat identificatorul imaginii QR.');
            }

            $imagePayload = ['id' => $mediaId];
            if ($caption !== '') {
                $imagePayload['caption'] = function_exists('mb_substr')
                    ? mb_substr($caption, 0, 1024)
                    : substr($caption, 0, 1024);
            }

            $sent = whatsappApiRequest(
                WHATSAPP_PHONE_NUMBER_ID . '/messages',
                [
                    'messaging_product' => 'whatsapp',
                    'recipient_type' => 'individual',
                    'to' => $phone,
                    'type' => 'image',
                    'image' => $imagePayload,
                ]
            );
            echo json_encode([
                'success' => true,
                'message_id' => $sent['messages'][0]['id'] ?? null,
            ]);
        } finally {
            if (is_file($tempPath)) {
                unlink($tempPath);
            }
        }

    } elseif ($action === 'getWhatsAppPredefinedMessages') {
        $actor = requireAuth($db, $body);
        $targetUserId = trim((string)($_GET['targetUserId'] ?? ''));
        if ($targetUserId !== '' && ($actor['role'] ?? '') !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Doar administratorul poate vedea mesajele altui utilizator.']);
            exit();
        }
        $ownerUserId = $targetUserId !== '' ? $targetUserId : $actor['id'];
        $stmt = $db->prepare(
            'SELECT m.*, u.display_name AS created_by_name
             FROM whatsapp_predefined_messages m
             LEFT JOIN app_users u ON u.id = m.created_by
             WHERE m.created_by = ?
             ORDER BY m.updated_at DESC, m.created_at DESC'
        );
        $stmt->execute([$ownerUserId]);
        echo json_encode($stmt->fetchAll());

    } elseif ($action === 'createWhatsAppPredefinedMessage') {
        $actor = requireAuth($db, $body);
        $targetUserId = trim((string)($body['target_user_id'] ?? ''));
        if ($targetUserId !== '' && ($actor['role'] ?? '') !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Doar administratorul poate adauga mesaje altui utilizator.']);
            exit();
        }
        $ownerUserId = $targetUserId !== '' ? $targetUserId : $actor['id'];
        $title = trim((string)($body['title'] ?? ''));
        $message = trim((string)($body['body'] ?? ''));
        if ($title === '' || $message === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Titlul si mesajul sunt obligatorii.']);
            exit();
        }
        $newId = uuid();
        $stmt = $db->prepare(
            'INSERT INTO whatsapp_predefined_messages (id, title, body, created_by)
             VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$newId, mb_substr($title, 0, 120), $message, $ownerUserId]);
        $read = $db->prepare(
            'SELECT m.*, u.display_name AS created_by_name
             FROM whatsapp_predefined_messages m
             LEFT JOIN app_users u ON u.id = m.created_by
             WHERE m.id = ?'
        );
        $read->execute([$newId]);
        echo json_encode($read->fetch());

    } elseif ($action === 'updateWhatsAppPredefinedMessage') {
        $actor = requireAuth($db, $body);
        $targetUserId = trim((string)($body['target_user_id'] ?? ''));
        if ($targetUserId !== '' && ($actor['role'] ?? '') !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Doar administratorul poate edita mesajele altui utilizator.']);
            exit();
        }
        $ownerUserId = $targetUserId !== '' ? $targetUserId : $actor['id'];
        $messageId = $id ?: (string)($body['id'] ?? '');
        $title = trim((string)($body['title'] ?? ''));
        $message = trim((string)($body['body'] ?? ''));
        if ($messageId === '' || $title === '' || $message === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Titlul si mesajul sunt obligatorii.']);
            exit();
        }
        $stmt = $db->prepare(
            'UPDATE whatsapp_predefined_messages
             SET title = ?, body = ?, updated_at = NOW()
             WHERE id = ? AND created_by = ?'
        );
        $stmt->execute([mb_substr($title, 0, 120), $message, $messageId, $ownerUserId]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'deleteWhatsAppPredefinedMessage') {
        $actor = requireAuth($db, $body);
        $targetUserId = trim((string)($body['target_user_id'] ?? ''));
        if ($targetUserId !== '' && ($actor['role'] ?? '') !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Doar administratorul poate sterge mesajele altui utilizator.']);
            exit();
        }
        $ownerUserId = $targetUserId !== '' ? $targetUserId : $actor['id'];
        $messageId = $id ?: (string)($body['id'] ?? '');
        $stmt = $db->prepare('DELETE FROM whatsapp_predefined_messages WHERE id = ? AND created_by = ?');
        $stmt->execute([$messageId, $ownerUserId]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'getClientActivityHistory') {
        requireAdmin($db, $body);
        if (!tableExists($db, 'client_activity_logs')) {
            echo json_encode([]);
            exit();
        }

        $sql = 'SELECT cal.*,
                       u.display_name AS actor_name,
                       u.username AS actor_username,
                       u.role AS actor_role,
                       c.name AS client_name,
                       c.phone AS client_phone,
                       c.email AS client_email,
                       c.status AS client_status,
                       c.qr_code AS client_qr_code
                FROM client_activity_logs cal
                LEFT JOIN app_users u ON u.id = cal.actor_user_id
                LEFT JOIN clients c ON c.id = cal.client_id';
        $params = [];
        if (!empty($_GET['search'])) {
            $search = '%' . $_GET['search'] . '%';
            $sql .= ' WHERE (
                c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.qr_code LIKE ?
                OR u.display_name LIKE ? OR u.username LIKE ? OR cal.action LIKE ? OR cal.summary LIKE ?
            )';
            $params = [$search, $search, $search, $search, $search, $search, $search, $search];
        }
        $sql .= ' ORDER BY cal.created_at DESC, cal.id DESC LIMIT 500';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        echo json_encode(array_map('buildClientActivity', $stmt->fetchAll()));

    } elseif ($action === 'deleteClientActivityHistory') {
        requireAdmin($db, $body);
        if (!tableExists($db, 'client_activity_logs')) {
            echo json_encode(['success' => true, 'deleted_count' => 0]);
            exit();
        }

        $mode = trim((string)($body['mode'] ?? 'range'));
        if ($mode === 'single') {
            $eventId = trim((string)($id ?: ($body['id'] ?? '')));
            if ($eventId === '') {
                http_response_code(422);
                echo json_encode(['error' => 'Modificarea selectata nu este valida.']);
                exit();
            }
            $db->beginTransaction();
            try {
                $stmt = $db->prepare('DELETE FROM client_activity_logs WHERE id = ?');
                $stmt->execute([$eventId]);
                $deletedCount = $stmt->rowCount();
                $verifyStmt = $db->prepare('SELECT COUNT(*) FROM client_activity_logs WHERE id = ?');
                $verifyStmt->execute([$eventId]);
                $databaseDeleted = ((int)$verifyStmt->fetchColumn()) === 0;
                if (!$databaseDeleted) {
                    throw new RuntimeException('Modificarea exista inca in baza de date dupa stergere.');
                }
                $db->commit();
            } catch (Throwable $deleteError) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                throw $deleteError;
            }
            echo json_encode([
                'success' => true,
                'deleted_count' => $deletedCount,
                'database_deleted' => $databaseDeleted,
            ]);
            exit();
        }
        if ($mode === 'all') {
            $deletedCount = (int)$db->exec('DELETE FROM client_activity_logs');
            $remainingCount = (int)$db->query('SELECT COUNT(*) FROM client_activity_logs')->fetchColumn();
            echo json_encode([
                'success' => $remainingCount === 0,
                'deleted_count' => $deletedCount,
                'database_deleted' => $remainingCount === 0,
            ]);
            exit();
        }

        $fromRaw = trim((string)($body['from'] ?? ''));
        $toRaw = trim((string)($body['to'] ?? ''));
        $fromDate = DateTimeImmutable::createFromFormat('!Y-m-d', $fromRaw);
        $toDate = DateTimeImmutable::createFromFormat('!Y-m-d', $toRaw);
        if (!$fromDate || !$toDate || $fromDate->format('Y-m-d') !== $fromRaw || $toDate->format('Y-m-d') !== $toRaw) {
            http_response_code(422);
            echo json_encode(['error' => 'Selecteaza un interval de data valid.']);
            exit();
        }
        if ($fromDate > $toDate) {
            http_response_code(422);
            echo json_encode(['error' => 'Data de inceput trebuie sa fie inaintea datei finale.']);
            exit();
        }

        $stmt = $db->prepare('DELETE FROM client_activity_logs WHERE created_at >= ? AND created_at < ?');
        $stmt->execute([
            $fromDate->format('Y-m-d 00:00:00'),
            $toDate->modify('+1 day')->format('Y-m-d 00:00:00'),
        ]);
        $verifyStmt = $db->prepare('SELECT COUNT(*) FROM client_activity_logs WHERE created_at >= ? AND created_at < ?');
        $verifyStmt->execute([
            $fromDate->format('Y-m-d 00:00:00'),
            $toDate->modify('+1 day')->format('Y-m-d 00:00:00'),
        ]);
        $databaseDeleted = ((int)$verifyStmt->fetchColumn()) === 0;
        echo json_encode([
            'success' => $databaseDeleted,
            'deleted_count' => $stmt->rowCount(),
            'database_deleted' => $databaseDeleted,
        ]);

    } elseif ($action === 'getClients') {
        $authUser = requireAuth($db, $body);
        if (!userCanViewClientPanel($authUser)) {
            http_response_code(403);
            echo json_encode(['error' => 'Contul nu are acces la panoul de clienti.']);
            exit();
        }
        $sql    = $clientJoin . ' WHERE 1=1';
        $params = [];
        if (isScopedClientUser($authUser)) {
            $sql .= ' AND (c.owner_user_id = ? OR EXISTS (
                SELECT 1 FROM client_user_access cua
                WHERE cua.client_id = c.id AND cua.user_id = ?
            ))';
            $params[] = $authUser['id'];
            $params[] = $authUser['id'];
        }
        if (!empty($_GET['search'])) {
            $s       = '%' . $_GET['search'] . '%';
            $sql    .= ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.qr_code LIKE ?)';
            $params  = array_merge($params, [$s, $s, $s]);
        }
        if (!empty($_GET['profileId'])) {
            $sql    .= ' AND c.profile_id = ?';
            $params[] = $_GET['profileId'];
        }
        $sql .= ' ORDER BY c.created_at DESC';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        echo json_encode(array_map(static fn(array $row): array => clientResponseForUser(buildClient($row), $authUser), $stmt->fetchAll()));

    } elseif ($action === 'getClientById') {
        $authUser = currentUserOrNull($db, $body, 'mobile');
        $sql = $clientJoin . ' WHERE c.id = ?';
        $params = [$id];
        if (isScopedClientUser($authUser)) {
            $sql .= ' AND (c.owner_user_id = ? OR EXISTS (
                SELECT 1 FROM client_user_access cua
                WHERE cua.client_id = c.id AND cua.user_id = ?
            ))';
            $params[] = $authUser['id'];
            $params[] = $authUser['id'];
        }
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        echo json_encode($row ? clientResponseForUser(buildClient($row), $authUser) : null);

    } elseif ($action === 'getClientByQrCode') {
        $authUser = currentUserOrNull($db, $body);
        $stmt = $db->prepare($clientJoin . ' WHERE c.qr_code = ?');
        $stmt->execute([$_GET['qrCode'] ?? '']);
        $row = $stmt->fetch();
        if ($row && isScopedClientUser($authUser) && effectiveClientIsFinalized($db, $row)) {
            echo json_encode(null);
            exit();
        }
        if ($row && $authUser) {
            grantClientAccess($db, (string)$row['id'], $authUser['id'] ?? null, 'scan');
        }
        echo json_encode($row ? buildClient($row) : null);

    } elseif ($action === 'createClient') {
        $authUser = currentUserOrNull($db, $body);
        if ($authUser && !userCanViewClientPanel($authUser)) {
            http_response_code(403);
            echo json_encode(['error' => 'Contul nu are acces la adaugarea clientilor.']);
            exit();
        }
        $newId = uuid();
        $collaboratorCosts = is_array($body['collaborator_costs'] ?? null) ? $body['collaborator_costs'] : [];
        $expenseCosts = is_array($body['expense_costs'] ?? null) ? $body['expense_costs'] : [];
        $otherExpensesTotal = !empty($expenseCosts)
            ? expenseCostsPayloadTotal($expenseCosts)
            : nullableMoneyValue($body['alte_cheltuieli'] ?? null);
        $newPartsValue = nullableMoneyValue($body['valoare_piese'] ?? null);
        $newServicePartsPrice = max((float)($body['service_parts_price'] ?? 0), 0);
        $newServiceLaborPrice = max((float)($body['service_labor_price'] ?? 0), 0);
        $newProfileId = !empty($body['profile_id']) ? $body['profile_id'] : null;
        $newPrice = (float)($body['price'] ?? 0);
        $newPredefinedPrice = max((float)($body['predefined_price'] ?? 0), 0);
        if ($newPrice <= 0 && $newPredefinedPrice > 0) {
            $newPrice = $newPredefinedPrice;
        }
        $newDiscount = (float)($body['discount_percentage'] ?? 0);
        $newPrice = normalizeClientGrossPriceFromPayload($newPrice, $newPredefinedPrice, $newDiscount);
        $newAdvance = max((float)($body['advance_amount'] ?? 0), 0);
        $newCurrency = normalizeCurrencyCode($body['currency_code'] ?? 'RON');
        $newFinancials = calculatedClientFinancials($newPrice, $newPredefinedPrice, $newDiscount, $newAdvance);
        $collaboratorBase = collaboratorBaseBeforeCosts(
            $db,
            $newFinancials['total'],
            $newProfileId,
            effectiveInternalCost($newPartsValue, $newServicePartsPrice),
            moneyValue($otherExpensesTotal)
        );
        $manoperaTotal = !empty($collaboratorCosts)
            ? collaboratorCostsPayloadTotal($collaboratorCosts, $collaboratorBase)
            : nullableMoneyValue($body['manopera_colaboratori'] ?? null);
        $newPaymentStatus = paymentStatusFromFinancials(
            $body['payment_status'] ?? null,
            $newFinancials
        );
        $stmt  = $db->prepare(
            'INSERT INTO clients
             (id, name, phone, email, status, qr_code, price, predefined_price, advance_amount, currency_code, payment_status, discount_percentage, manopera_colaboratori, valoare_piese, service_parts_price, service_labor_price, alte_cheltuieli, notes, profile_id, owner_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $newId,
            trim($body['name']  ?? ''),
            trim($body['phone'] ?? ''),
            !empty($body['email'])      ? trim($body['email'])      : null,
            'va_folosi_codul',
            $body['qr_code']            ?? '',
            $newPrice,
            $newPredefinedPrice,
            $newAdvance,
            $newCurrency,
            $newPaymentStatus,
            $newDiscount,
            $manoperaTotal,
            $newPartsValue,
            $newServicePartsPrice,
            $newServiceLaborPrice,
            $otherExpensesTotal,
            !empty($body['notes'])      ? trim($body['notes'])      : null,
            $newProfileId,
            $authUser['id'] ?? null,
        ]);
        if (is_array($body['expense_costs'] ?? null)) {
            $savedExpenseTotal = saveClientExpenseCosts($db, $newId, $expenseCosts);
            $otherExpensesTotal = !empty($expenseCosts)
                ? $savedExpenseTotal
                : nullableMoneyValue($body['alte_cheltuieli'] ?? null);
            $db->prepare('UPDATE clients SET alte_cheltuieli = ? WHERE id = ?')
                ->execute([$otherExpensesTotal, $newId]);
        }
        if (is_array($body['collaborator_costs'] ?? null)) {
            $collaboratorBase = collaboratorBaseBeforeCosts(
                $db,
                $newFinancials['total'],
                $newProfileId,
                effectiveInternalCost($newPartsValue, $newServicePartsPrice),
                moneyValue($otherExpensesTotal)
            );
            $savedCollaboratorTotal = saveClientCollaboratorCosts($db, $newId, $collaboratorCosts, $collaboratorBase);
            $manoperaTotal = !empty($collaboratorCosts)
                ? $savedCollaboratorTotal
                : nullableMoneyValue($body['manopera_colaboratori'] ?? null);
            $totalStmt = $db->prepare('UPDATE clients SET manopera_colaboratori = ? WHERE id = ?');
            $totalStmt->execute([$manoperaTotal, $newId]);
        }
        grantClientAccess($db, $newId, $authUser['id'] ?? null, 'owner');
        logClientActivity($db, $newId, $authUser, 'created', 'Client adaugat', [
            'name' => trim($body['name'] ?? ''),
            'phone' => trim($body['phone'] ?? ''),
            'qr_code' => $body['qr_code'] ?? '',
            'price' => $newPrice,
            'predefined_price' => $newPredefinedPrice,
            'advance_amount' => $newAdvance,
            'currency_code' => $newCurrency,
            'discount_percentage' => $newDiscount,
        ]);
        $stmt2 = $db->prepare($clientJoin . ' WHERE c.id = ?');
        $stmt2->execute([$newId]);
        echo json_encode(clientResponseForUser(buildClient($stmt2->fetch()), $authUser));

    } elseif ($action === 'updateClient') {
        $authUser = requireAuth($db, $body);
        // Verifica statusul curent.
        $checkStmt = $db->prepare('SELECT * FROM clients WHERE id = ?');
        $checkStmt->execute([$id]);
        $current = $checkStmt->fetch();
        if (!$current) {
            http_response_code(404);
            echo json_encode(['error' => 'Client inexistent']);
            exit();
        }
        $role = $authUser['role'] ?? '';
        if (!userHasClientAccess($db, $authUser, $current)) {
            http_response_code(403);
            echo json_encode(['error' => 'Nu ai acces la acest client.']);
            exit();
        }
        if ($role === 'user' && !userCanEditClients($authUser)) {
            http_response_code(403);
            echo json_encode(['error' => 'Editarea clientilor nu este permisa pentru acest cont. Activeaza accesul din User Login System.']);
            exit();
        }
        $currentEffectiveFinalized = effectiveClientIsFinalized($db, $current);
        if ($role !== 'admin' && $currentEffectiveFinalized) {
            http_response_code(423);
            echo json_encode(['error' => 'Clientul este finalizat si nu mai poate fi editat.']);
            exit();
        }
        $currentStatus = $current['status'];
        $newStatus = $role === 'admin'
            ? ($body['status'] ?? $currentStatus)
            : (($currentStatus === 'cod_folosit') ? 'cod_folosit' : ($body['status'] ?? 'interesat'));
        if (!in_array($newStatus, ['interesat', 'va_folosi_codul', 'cod_folosit'], true)) {
            $newStatus = $currentStatus;
        }
        $adminRequestedFinalized = $role === 'admin' && array_key_exists('is_finalized', $body);
        $newIsFinalized = $adminRequestedFinalized
            ? (int)!empty($body['is_finalized'])
            : (int)$currentEffectiveFinalized;
        $newFinalizationSource = $adminRequestedFinalized
            ? ($newIsFinalized ? 'manual' : null)
            : (($current['finalization_source'] ?? null) ?: ($newIsFinalized ? 'service' : null));
        if (!$newIsFinalized) {
            $newFinalizationSource = null;
        }
        $newQrUsed = $role === 'admin' && array_key_exists('qr_used', $body)
            ? (int)!empty($body['qr_used'])
            : (int)!empty($current['qr_used']);
        $newQrUsedAt = $newQrUsed
            ? (($current['qr_used_at'] ?? null) ?: date('Y-m-d H:i:s'))
            : null;
        if ($role === 'admin' && array_key_exists('status', $body)) {
            if ($newStatus === 'cod_folosit') {
                $newQrUsed = 1;
                $newQrUsedAt = ($current['qr_used_at'] ?? null) ?: date('Y-m-d H:i:s');
            } elseif (in_array($newStatus, ['interesat', 'va_folosi_codul'], true)) {
                $newQrUsed = 0;
                $newQrUsedAt = null;
            }
        }
        if ($newIsFinalized) {
            $newStatus = 'cod_folosit';
            $newQrUsed = 1;
            $newQrUsedAt = ($current['qr_used_at'] ?? null) ?: date('Y-m-d H:i:s');
        }
        $canEditFinancial = in_array($role, ['admin', 'manager'], true);

        // Calculeaza noile valori pret/reducere
        $newPrice    = $canEditFinancial ? (float)($body['price'] ?? ($current['price'] ?? 0)) : (float)($current['price'] ?? 0);
        $newPredefinedPrice = $canEditFinancial
            ? max((float)($body['predefined_price'] ?? ($current['predefined_price'] ?? 0)), 0)
            : (float)($current['predefined_price'] ?? 0);
        if ($newPrice <= 0 && $newPredefinedPrice > 0) {
            $newPrice = $newPredefinedPrice;
        }
        $newDiscount = $canEditFinancial ? (float)($body['discount_percentage'] ?? ($current['discount_percentage'] ?? 0)) : (float)($current['discount_percentage'] ?? 0);
        if ($canEditFinancial) {
            $newPrice = normalizeClientGrossPriceFromPayload($newPrice, $newPredefinedPrice, $newDiscount, (float)($current['price'] ?? 0));
        }
        $newAdvance = $canEditFinancial
            ? max((float)($body['advance_amount'] ?? ($current['advance_amount'] ?? 0)), 0)
            : (float)($current['advance_amount'] ?? 0);
        $newCurrency = $canEditFinancial
            ? normalizeCurrencyCode($body['currency_code'] ?? ($current['currency_code'] ?? 'RON'))
            : normalizeCurrencyCode($current['currency_code'] ?? 'RON');
        $newFinancials = calculatedClientFinancials($newPrice, $newPredefinedPrice, $newDiscount, $newAdvance);
        $newPaymentStatus = $canEditFinancial
            ? paymentStatusFromFinancials(
                array_key_exists('payment_status', $body) ? $body['payment_status'] : ($current['payment_status'] ?? null),
                $newFinancials
            )
            : paymentStatusFromFinancials($current['payment_status'] ?? null, $newFinancials);

        $newProfileId = $canEditFinancial
            ? (!empty($body['profile_id']) ? $body['profile_id'] : null)
            : ($current['profile_id'] ?? null);
        if ($currentStatus === 'cod_folosit' && $role === 'user') {
            // Dupa folosirea QR-ului, numele ramane blocat pentru user.
            // Managerul il poate corecta pana la finalizare.
            $newName      = trim($current['name']       ?? '');
        } else {
            $newName      = trim($body['name']       ?? '');
        }

        $collaboratorCosts = $canEditFinancial && is_array($body['collaborator_costs'] ?? null) ? $body['collaborator_costs'] : [];
        $expenseCosts = $canEditFinancial && is_array($body['expense_costs'] ?? null) ? $body['expense_costs'] : [];
        $otherExpensesTotal = $canEditFinancial && !empty($expenseCosts)
            ? expenseCostsPayloadTotal($expenseCosts)
            : nullableMoneyValue($canEditFinancial && array_key_exists('alte_cheltuieli', $body)
                ? $body['alte_cheltuieli']
                : ($current['alte_cheltuieli'] ?? null));
        $newPartsValue = nullableMoneyValue($canEditFinancial && array_key_exists('valoare_piese', $body)
            ? $body['valoare_piese']
            : ($current['valoare_piese'] ?? null));
        $newServicePartsPrice = max((float)($canEditFinancial ? ($body['service_parts_price'] ?? ($current['service_parts_price'] ?? 0)) : ($current['service_parts_price'] ?? 0)), 0);
        $newServiceLaborPrice = max((float)($canEditFinancial ? ($body['service_labor_price'] ?? ($current['service_labor_price'] ?? 0)) : ($current['service_labor_price'] ?? 0)), 0);
        $collaboratorBase = collaboratorBaseBeforeCosts(
            $db,
            $newFinancials['total'],
            $newProfileId,
            effectiveInternalCost($newPartsValue, $newServicePartsPrice),
            moneyValue($otherExpensesTotal)
        );
        $manoperaTotal = $canEditFinancial && !empty($collaboratorCosts)
            ? collaboratorCostsPayloadTotal($collaboratorCosts, $collaboratorBase)
            : nullableMoneyValue($canEditFinancial && array_key_exists('manopera_colaboratori', $body)
                ? $body['manopera_colaboratori']
                : ($current['manopera_colaboratori'] ?? null));
        $afterForLog = [
            'name' => $newName,
            'phone' => trim($body['phone'] ?? ''),
            'email' => !empty($body['email']) ? trim($body['email']) : null,
            'status' => $newStatus,
            'price' => $newPrice,
            'predefined_price' => $newPredefinedPrice,
            'advance_amount' => $newAdvance,
            'currency_code' => $newCurrency,
            'discount_percentage' => $newDiscount,
            'manopera_colaboratori' => $manoperaTotal,
            'valoare_piese' => $newPartsValue,
            'service_parts_price' => $newServicePartsPrice,
            'service_labor_price' => $newServiceLaborPrice,
            'alte_cheltuieli' => $otherExpensesTotal,
            'notes' => !empty($body['notes']) ? trim($body['notes']) : null,
            'profile_id' => $newProfileId,
            'is_finalized' => $newIsFinalized,
            'finalization_source' => $newFinalizationSource,
            'qr_used' => $newQrUsed,
        ];
        $changes = clientFieldChanges($current, $afterForLog);

        $stmt = $db->prepare(
            "UPDATE clients
             SET name=?, phone=?, email=?, status=?, qr_used=?, qr_used_at=?, is_finalized=?,
                 finalization_source=?,
                 price=?, predefined_price=?, advance_amount=?, currency_code=?, payment_status=?, discount_percentage=?, manopera_colaboratori=?, valoare_piese=?, service_parts_price=?, service_labor_price=?, alte_cheltuieli=?, notes=?, profile_id=?
             WHERE id=?"
        );
        $stmt->execute([
            $newName,
            trim($body['phone'] ?? ''),
            !empty($body['email']) ? trim($body['email']) : null,
            $newStatus,
            $newQrUsed,
            $newQrUsedAt,
            $newIsFinalized,
            $newFinalizationSource,
            $newPrice,
            $newPredefinedPrice,
            $newAdvance,
            $newCurrency,
            $newPaymentStatus,
            $newDiscount,
            $manoperaTotal,
            $newPartsValue,
            $newServicePartsPrice,
            $newServiceLaborPrice,
            $otherExpensesTotal,
            !empty($body['notes']) ? trim($body['notes']) : null,
            $newProfileId,
            $id,
        ]);
        if ($canEditFinancial && is_array($body['expense_costs'] ?? null)) {
            $savedExpenseTotal = saveClientExpenseCosts($db, $id, $expenseCosts);
            $otherExpensesTotal = !empty($expenseCosts)
                ? $savedExpenseTotal
                : nullableMoneyValue($body['alte_cheltuieli'] ?? null);
            $db->prepare('UPDATE clients SET alte_cheltuieli = ? WHERE id = ?')
                ->execute([$otherExpensesTotal, $id]);
        }
        if ($canEditFinancial && is_array($body['collaborator_costs'] ?? null)) {
            $collaboratorBase = collaboratorBaseBeforeCosts(
                $db,
                $newFinancials['total'],
                $newProfileId,
                effectiveInternalCost($newPartsValue, $newServicePartsPrice),
                moneyValue($otherExpensesTotal)
            );
            $savedCollaboratorTotal = saveClientCollaboratorCosts($db, $id, $collaboratorCosts, $collaboratorBase);
            $manoperaTotal = !empty($collaboratorCosts)
                ? $savedCollaboratorTotal
                : nullableMoneyValue($body['manopera_colaboratori'] ?? null);
            $totalStmt = $db->prepare('UPDATE clients SET manopera_colaboratori = ? WHERE id = ?');
            $totalStmt->execute([$manoperaTotal, $id]);
        }
        syncExistingServiceSheetsFromClient($db, $id, $authUser);
        logClientActivity($db, $id, $authUser, 'updated', 'Client editat', [
            'changes' => $changes,
        ]);
        $stmt2 = $db->prepare($clientJoin . ' WHERE c.id = ?');
        $stmt2->execute([$id]);
        echo json_encode(clientResponseForUser(buildClient($stmt2->fetch()), $authUser));

    } elseif ($action === 'finalizeClient') {
        $authUser = requireAuth($db, $body);
        if (!userCanFinalizeClients($authUser)) {
            http_response_code(403);
            echo json_encode(['error' => 'Contul de tip user nu are dreptul sa finalizeze clienti.']);
            exit();
        }
        $checkStmt = $db->prepare('SELECT * FROM clients WHERE id = ?');
        $checkStmt->execute([$id]);
        $current = $checkStmt->fetch();
        if (!$current) {
            http_response_code(404);
            echo json_encode(['error' => 'Client inexistent']);
            exit();
        }
        if (!userHasClientAccess($db, $authUser, $current)) {
            http_response_code(403);
            echo json_encode(['error' => 'Nu ai acces sa finalizezi acest client.']);
            exit();
        }

        if (effectiveClientIsFinalized($db, $current)) {
            $stmt2 = $db->prepare($clientJoin . ' WHERE c.id = ?');
            $stmt2->execute([$id]);
            echo json_encode(clientResponseForUser(buildClient($stmt2->fetch()), $authUser));
            exit();
        }

        $canEditClient = userCanEditClients($authUser);
        $collaboratorCosts = $canEditClient && is_array($body['collaborator_costs'] ?? null) ? $body['collaborator_costs'] : [];
        $expenseCosts = $canEditClient && is_array($body['expense_costs'] ?? null) ? $body['expense_costs'] : [];
        $otherExpensesTotal = !empty($expenseCosts)
            ? expenseCostsPayloadTotal($expenseCosts)
            : nullableMoneyValue($canEditClient && array_key_exists('alte_cheltuieli', $body)
                ? $body['alte_cheltuieli']
                : ($current['alte_cheltuieli'] ?? null));
        $finalPrice = (float)($canEditClient ? ($body['price'] ?? $current['price']) : $current['price']);
        $finalPredefinedPrice = $canEditClient
            ? max((float)($body['predefined_price'] ?? ($current['predefined_price'] ?? 0)), 0)
            : (float)($current['predefined_price'] ?? 0);
        if ($finalPrice <= 0 && $finalPredefinedPrice > 0) {
            $finalPrice = $finalPredefinedPrice;
        }
        $finalDiscount = (float)($canEditClient ? ($body['discount_percentage'] ?? $current['discount_percentage']) : $current['discount_percentage']);
        if ($canEditClient) {
            $finalPrice = normalizeClientGrossPriceFromPayload($finalPrice, $finalPredefinedPrice, $finalDiscount, (float)($current['price'] ?? 0));
        }
        $finalAdvance = $canEditClient
            ? max((float)($body['advance_amount'] ?? ($current['advance_amount'] ?? 0)), 0)
            : (float)($current['advance_amount'] ?? 0);
        $finalCurrency = $canEditClient
            ? normalizeCurrencyCode($body['currency_code'] ?? ($current['currency_code'] ?? 'RON'))
            : normalizeCurrencyCode($current['currency_code'] ?? 'RON');
        $finalFinancials = calculatedClientFinancials($finalPrice, $finalPredefinedPrice, $finalDiscount, $finalAdvance);
        $finalPartsValue = nullableMoneyValue($canEditClient && array_key_exists('valoare_piese', $body)
            ? $body['valoare_piese']
            : ($current['valoare_piese'] ?? null));
        $finalServicePartsPrice = max((float)($canEditClient ? ($body['service_parts_price'] ?? ($current['service_parts_price'] ?? 0)) : ($current['service_parts_price'] ?? 0)), 0);
        $finalServiceLaborPrice = max((float)($canEditClient ? ($body['service_labor_price'] ?? ($current['service_labor_price'] ?? 0)) : ($current['service_labor_price'] ?? 0)), 0);
        $finalProfileId = $canEditClient
            ? (!empty($body['profile_id']) ? $body['profile_id'] : null)
            : ($current['profile_id'] ?? null);
        $collaboratorBase = collaboratorBaseBeforeCosts(
            $db,
            $finalFinancials['total'],
            $finalProfileId,
            effectiveInternalCost($finalPartsValue, $finalServicePartsPrice),
            moneyValue($otherExpensesTotal)
        );
        $manoperaTotal = $canEditClient && !empty($collaboratorCosts)
            ? collaboratorCostsPayloadTotal($collaboratorCosts, $collaboratorBase)
            : nullableMoneyValue($canEditClient && array_key_exists('manopera_colaboratori', $body)
                ? $body['manopera_colaboratori']
                : ($current['manopera_colaboratori'] ?? null));
        $finalPaymentStatus = paymentStatusFromFinancials(
            array_key_exists('payment_status', $body) ? $body['payment_status'] : ($current['payment_status'] ?? null),
            $finalFinancials
        );

        if ($finalPrice < 0) {
            http_response_code(422);
            echo json_encode(['error' => 'Pretul lucrarii trebuie sa fie o valoare pozitiva sau 0.']);
            exit();
        }

        $stmt = $db->prepare(
            "UPDATE clients
             SET name=?, phone=?, email=?, status='cod_folosit',
                 qr_used=1, qr_used_at=COALESCE(qr_used_at, NOW()),
                 price=?, predefined_price=?, advance_amount=?, currency_code=?, payment_status=?, discount_percentage=?, manopera_colaboratori=?, valoare_piese=?, service_parts_price=?, service_labor_price=?, alte_cheltuieli=?,
                 notes=?, profile_id=?, is_finalized=1, finalization_source='manual'
             WHERE id=?"
        );
        $stmt->execute([
            $canEditClient ? trim($body['name'] ?? $current['name']) : $current['name'],
            $canEditClient ? trim($body['phone'] ?? $current['phone']) : $current['phone'],
            $canEditClient ? (!empty($body['email']) ? trim($body['email']) : null) : $current['email'],
            $finalPrice,
            $finalPredefinedPrice,
            $finalAdvance,
            $finalCurrency,
            $finalPaymentStatus,
            $finalDiscount,
            $manoperaTotal,
            $finalPartsValue,
            $finalServicePartsPrice,
            $finalServiceLaborPrice,
            $otherExpensesTotal,
            $canEditClient ? (!empty($body['notes']) ? trim($body['notes']) : null) : $current['notes'],
            $finalProfileId,
            $id,
        ]);
        if ($canEditClient && is_array($body['expense_costs'] ?? null)) {
            $savedExpenseTotal = saveClientExpenseCosts($db, $id, $expenseCosts);
            $otherExpensesTotal = !empty($expenseCosts)
                ? $savedExpenseTotal
                : nullableMoneyValue($body['alte_cheltuieli'] ?? null);
            $db->prepare('UPDATE clients SET alte_cheltuieli = ? WHERE id = ?')
                ->execute([$otherExpensesTotal, $id]);
        }
        if ($canEditClient && is_array($body['collaborator_costs'] ?? null)) {
            $collaboratorBase = collaboratorBaseBeforeCosts(
                $db,
                $finalFinancials['total'],
                $finalProfileId,
                effectiveInternalCost($finalPartsValue, $finalServicePartsPrice),
                moneyValue($otherExpensesTotal)
            );
            $savedCollaboratorTotal = saveClientCollaboratorCosts($db, $id, $collaboratorCosts, $collaboratorBase);
            $manoperaTotal = !empty($collaboratorCosts)
                ? $savedCollaboratorTotal
                : nullableMoneyValue($body['manopera_colaboratori'] ?? null);
            $totalStmt = $db->prepare('UPDATE clients SET manopera_colaboratori = ? WHERE id = ?');
            $totalStmt->execute([$manoperaTotal, $id]);
        }
        syncExistingServiceSheetsFromClient($db, $id, $authUser);
        logClientActivity($db, $id, $authUser, 'finalized', 'Client finalizat', [
            'price' => $finalPrice,
            'predefined_price' => $finalPredefinedPrice,
            'advance_amount' => $finalAdvance,
            'currency_code' => $finalCurrency,
            'discount_percentage' => $finalDiscount,
            'manopera_colaboratori' => $manoperaTotal,
            'valoare_piese' => $finalPartsValue,
            'service_parts_price' => $finalServicePartsPrice,
            'service_labor_price' => $finalServiceLaborPrice,
            'alte_cheltuieli' => $otherExpensesTotal,
        ]);
        $stmt2 = $db->prepare($clientJoin . ' WHERE c.id = ?');
        $stmt2->execute([$id]);
        echo json_encode(clientResponseForUser(buildClient($stmt2->fetch()), $authUser));

    } elseif ($action === 'deleteClient') {
        $authUser = requireAuth($db, $body);
        $checkStmt = $db->prepare('SELECT * FROM clients WHERE id = ?');
        $checkStmt->execute([$id]);
        $current = $checkStmt->fetch();
        if (!$current) {
            http_response_code(404);
            echo json_encode(['error' => 'Client inexistent']);
            exit();
        }
        $role = $authUser['role'] ?? '';
        $canDeleteClient = $role === 'admin' || ($role === 'manager' && !effectiveClientIsFinalized($db, $current));
        if (!$canDeleteClient) {
            http_response_code(403);
            echo json_encode(['error' => 'Doar adminul poate sterge orice client. Managerul poate sterge doar clienti nefinalizati.']);
            exit();
        }
        $stmt = $db->prepare('DELETE FROM clients WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'markQrUsed') {
        $authUser = currentUserOrNull($db, $body);
        $checkStmt = $db->prepare('SELECT * FROM clients WHERE id = ? LIMIT 1');
        $checkStmt->execute([$id]);
        $current = $checkStmt->fetch();
        if (!$current) {
            http_response_code(404);
            echo json_encode(['error' => 'Client inexistent']);
            exit();
        }
        if (effectiveClientIsFinalized($db, $current)) {
            http_response_code(423);
            echo json_encode(['error' => 'Clientul este finalizat si nu mai poate fi scanat.']);
            exit();
        }
        $finalPrice = (float)($body['price'] ?? 0);
        $finalPredefinedPrice = max((float)($body['predefined_price'] ?? 0), 0);
        if ($finalPrice <= 0 && $finalPredefinedPrice > 0) {
            $finalPrice = $finalPredefinedPrice;
        }
        $discount = (float)($body['discount_percentage'] ?? 0);
        $finalPrice = normalizeClientGrossPriceFromPayload($finalPrice, $finalPredefinedPrice, $discount, (float)($current['price'] ?? 0));
        $advance = max((float)($body['advance_amount'] ?? 0), 0);
        $currency = normalizeCurrencyCode($body['currency_code'] ?? ($current['currency_code'] ?? 'RON'));
        $financials = calculatedClientFinancials($finalPrice, $finalPredefinedPrice, $discount, $advance);
        $paymentStatus = paymentStatusFromFinancials(
            array_key_exists('payment_status', $body) ? $body['payment_status'] : ($current['payment_status'] ?? null),
            $financials
        );
        $submittedNotes = trim((string)($body['notes'] ?? ''));
        $nextNotes = $submittedNotes !== ''
            ? $submittedNotes
            : nullableTextValue($current['notes'] ?? null, 2000);
        $stmt = $db->prepare(
            'UPDATE clients
             SET qr_used=1, qr_used_at=NOW(), status="cod_folosit",
                 price=?, predefined_price=?, advance_amount=?, currency_code=?, payment_status=?, discount_percentage=?, notes=?
             WHERE id=?'
        );
        $stmt->execute([
            $finalPrice,
            $finalPredefinedPrice,
            $advance,
            $currency,
            $paymentStatus,
            $discount,
            $nextNotes,
            $id,
        ]);
        recalculateStoredClientCollaboratorCosts($db, $id);
        syncExistingServiceSheetsFromClient($db, $id, $authUser);
        grantClientAccess($db, $id, $authUser['id'] ?? null, 'scan');
        logClientActivity($db, $id, $authUser, 'scanned', 'Cod QR scanat si utilizat', [
            'price' => $finalPrice,
            'predefined_price' => $finalPredefinedPrice,
            'advance_amount' => $advance,
            'currency_code' => $currency,
            'discount_percentage' => $discount,
            'notes' => $nextNotes,
        ]);
        $stmt2 = $db->prepare($clientJoin . ' WHERE c.id = ?');
        $stmt2->execute([$id]);
        echo json_encode(clientResponseForUser(buildClient($stmt2->fetch()), $authUser));

    // â”€â”€ Profiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    } elseif ($action === 'getProfiles') {
        $stmt = $db->query('SELECT * FROM profiles ORDER BY created_at ASC');
        echo json_encode($stmt->fetchAll());

    } elseif ($action === 'createProfile') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $newId = uuid();
        $stmt  = $db->prepare(
            'INSERT INTO profiles (id, name, role, phone, email, percentage, color) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $newId,
            trim($body['name']    ?? ''),
            trim($body['role']    ?? 'agent'),
            !empty(trim((string)($body['phone'] ?? ''))) ? trim($body['phone']) : null,
            !empty(trim((string)($body['email'] ?? ''))) ? trim($body['email']) : null,
            (float)($body['percentage'] ?? 0),
            trim($body['color']   ?? '#FF6B35'),
        ]);
        $stmt2 = $db->prepare('SELECT * FROM profiles WHERE id = ?');
        $stmt2->execute([$newId]);
        echo json_encode($stmt2->fetch());

    } elseif ($action === 'updateProfile') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $stmt = $db->prepare(
            'UPDATE profiles SET name=?, role=?, phone=?, email=?, percentage=?, color=? WHERE id=?'
        );
        $stmt->execute([
            trim($body['name']    ?? ''),
            trim($body['role']    ?? 'agent'),
            !empty(trim((string)($body['phone'] ?? ''))) ? trim($body['phone']) : null,
            !empty(trim((string)($body['email'] ?? ''))) ? trim($body['email']) : null,
            (float)($body['percentage'] ?? 0),
            trim($body['color']   ?? '#FF6B35'),
            $id,
        ]);
        $stmt2 = $db->prepare('SELECT * FROM profiles WHERE id = ?');
        $stmt2->execute([$id]);
        echo json_encode($stmt2->fetch());

    } elseif ($action === 'deleteProfile') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $stmt = $db->prepare('DELETE FROM profiles WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);

    // Collaborators

    } elseif ($action === 'getCollaborators') {
        if (!tableExists($db, 'collaborators')) {
            echo json_encode([]);
            exit();
        }
        $stmt = $db->query('SELECT * FROM collaborators ORDER BY created_at ASC');
        echo json_encode(array_map('buildCollaborator', $stmt->fetchAll()));

    } elseif ($action === 'createCollaborator') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $newId = uuid();
        $stmt  = $db->prepare(
            'INSERT INTO collaborators (id, name, role, phone, email, percentage, color) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $newId,
            trim($body['name']  ?? ''),
            trim($body['role']  ?? ''),
            !empty(trim((string)($body['phone'] ?? ''))) ? trim($body['phone']) : null,
            !empty(trim((string)($body['email'] ?? ''))) ? trim($body['email']) : null,
            min(100, max((float)($body['percentage'] ?? 0), 0)),
            trim($body['color'] ?? '#14B8A6'),
        ]);
        $stmt2 = $db->prepare('SELECT * FROM collaborators WHERE id = ?');
        $stmt2->execute([$newId]);
        echo json_encode(buildCollaborator($stmt2->fetch()));

    } elseif ($action === 'updateCollaborator') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $stmt = $db->prepare(
            'UPDATE collaborators SET name=?, role=?, phone=?, email=?, percentage=?, color=? WHERE id=?'
        );
        $stmt->execute([
            trim($body['name']  ?? ''),
            trim($body['role']  ?? ''),
            !empty(trim((string)($body['phone'] ?? ''))) ? trim($body['phone']) : null,
            !empty(trim((string)($body['email'] ?? ''))) ? trim($body['email']) : null,
            min(100, max((float)($body['percentage'] ?? 0), 0)),
            trim($body['color'] ?? '#14B8A6'),
            $id,
        ]);
        $stmt2 = $db->prepare('SELECT * FROM collaborators WHERE id = ?');
        $stmt2->execute([$id]);
        echo json_encode(buildCollaborator($stmt2->fetch()));

    } elseif ($action === 'deleteCollaborator') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $stmt = $db->prepare('DELETE FROM collaborators WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);

    // Expense categories

    } elseif ($action === 'getExpenseCategories') {
        $stmt = $db->query('SELECT * FROM expense_categories ORDER BY name ASC');
        echo json_encode(array_map('buildExpenseCategory', $stmt->fetchAll()));

    } elseif ($action === 'createExpenseCategory') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $name = trim($body['name'] ?? '');
        if ($name === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Denumirea cheltuielii este obligatorie.']);
            exit();
        }
        $existingStmt = $db->prepare('SELECT * FROM expense_categories WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1');
        $existingStmt->execute([$name]);
        $existingExpense = $existingStmt->fetch();
        if ($existingExpense) {
            echo json_encode(buildExpenseCategory($existingExpense));
            exit();
        }
        $color = trim((string)($body['color'] ?? '#EF4444'));
        if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $color)) {
            $color = '#EF4444';
        }
        $newId = uuid();
        $db->prepare('INSERT INTO expense_categories (id, name, color) VALUES (?, ?, ?)')
            ->execute([$newId, $name, $color]);
        $stmt = $db->prepare('SELECT * FROM expense_categories WHERE id = ?');
        $stmt->execute([$newId]);
        echo json_encode(buildExpenseCategory($stmt->fetch()));

    } elseif ($action === 'updateExpenseCategory') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $name = trim($body['name'] ?? '');
        if ($name === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Denumirea cheltuielii este obligatorie.']);
            exit();
        }
        $color = trim((string)($body['color'] ?? '#EF4444'));
        if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $color)) {
            $color = '#EF4444';
        }
        $db->prepare('UPDATE expense_categories SET name=?, color=? WHERE id=?')
            ->execute([$name, $color, $id]);
        $stmt = $db->prepare('SELECT * FROM expense_categories WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode(buildExpenseCategory($stmt->fetch()));

    } elseif ($action === 'deleteExpenseCategory') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $db->prepare('DELETE FROM expense_categories WHERE id = ?')->execute([$id]);
        echo json_encode(['success' => true]);

    // â”€â”€ Service Sheets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    } elseif ($action === 'getPricePresets') {
        requireAuth($db, $body);
        $stmt = $db->query('SELECT * FROM price_presets WHERE is_active = 1 ORDER BY price ASC, label ASC');
        echo json_encode(array_map('buildPricePreset', $stmt->fetchAll()));

    } elseif ($action === 'createPricePreset') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $label = trim((string)($body['label'] ?? ''));
        $price = max((float)($body['price'] ?? 0), 0);
        if ($label === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Labelul pretului predefinit este obligatoriu.']);
            exit();
        }
        $newId = uuid();
        $db->prepare('INSERT INTO price_presets (id, label, price, is_active) VALUES (?, ?, ?, 1)')
            ->execute([$newId, $label, $price]);
        $stmt = $db->prepare('SELECT * FROM price_presets WHERE id = ?');
        $stmt->execute([$newId]);
        echo json_encode(buildPricePreset($stmt->fetch()));

    } elseif ($action === 'updatePricePreset') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $label = trim((string)($body['label'] ?? ''));
        $price = max((float)($body['price'] ?? 0), 0);
        $isActive = array_key_exists('is_active', $body) ? (int)!empty($body['is_active']) : 1;
        if ($label === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Labelul pretului predefinit este obligatoriu.']);
            exit();
        }
        $db->prepare('UPDATE price_presets SET label=?, price=?, is_active=? WHERE id=?')
            ->execute([$label, $price, $isActive, $id]);
        $stmt = $db->prepare('SELECT * FROM price_presets WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Pret predefinit inexistent.']);
            exit();
        }
        echo json_encode(buildPricePreset($row));

    } elseif ($action === 'deletePricePreset') {
        requireAuth($db, $body, null, ['admin', 'manager']);
        $db->prepare('DELETE FROM price_presets WHERE id = ?')->execute([$id]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'createServiceSheet') {
        $authUser = requireAuth($db, $body);
        if (!userCanViewServiceSheets($authUser)) {
            http_response_code(403);
            echo json_encode(['error' => 'Nu ai acces la fisele de service.']);
            exit();
        }
        ensureServiceSheetsTable($db);
        $client = !empty($body['client_id']) ? serviceSheetClientRow($db, textValue($body['client_id'], 36)) : null;
        if ($client && !userHasClientAccess($db, $authUser, $client)) {
            http_response_code(403);
            echo json_encode(['error' => 'Nu ai acces la clientul acestei fise.']);
            exit();
        }
        if (!$client && isScopedClientUser($authUser)) {
            http_response_code(403);
            echo json_encode(['error' => 'Userul poate crea fise doar pentru clientii la care are acces.']);
            exit();
        }
        $safeBody = $body;
        if ($client && is_array($body['expense_costs'] ?? null)) {
            $safeBody['internal_other_costs'] = saveClientExpenseCosts($db, (string)$client['id'], $body['expense_costs']);
        }
        $payload = serviceSheetPayload($db, $safeBody, [], $client);
        echo json_encode(serviceSheetResponseForUser(insertServiceSheet($db, $payload, $authUser), $authUser, !empty($body['financial_entry']), $db));

    } elseif ($action === 'getServiceSheets') {
        $authUser = requireAuth($db, $body);
        if (!userCanViewServiceSheets($authUser)) {
            http_response_code(403);
            echo json_encode(['error' => 'Nu ai acces la fisele de service.']);
            exit();
        }
        ensureServiceSheetsTable($db);
        $sortMap = [
            'sheet_number' => 'ss.sheet_number',
            'client' => 'ss.client_name',
            'created_at' => 'ss.created_at',
            'updated_at' => 'ss.updated_at',
            'total_price' => 'COALESCE(NULLIF(ss.final_price, 0), NULLIF(ss.total_price, 0), ss.diagnostic_price, 0)',
        ];
        $sortBy = $_GET['sortBy'] ?? 'created_at';
        $sortColumn = $sortMap[$sortBy] ?? 'ss.created_at';
        $sortDir = strtolower((string)($_GET['sortDir'] ?? 'desc')) === 'asc' ? 'ASC' : 'DESC';
        $sql = 'SELECT ss.* FROM service_sheets ss LEFT JOIN clients c ON c.id = ss.client_id WHERE 1=1';
        $params = [];
        if (isScopedClientUser($authUser)) {
            $sql .= ' AND ss.client_id IS NOT NULL AND (c.owner_user_id = ? OR EXISTS (
                SELECT 1 FROM client_user_access cua
                WHERE cua.client_id = ss.client_id AND cua.user_id = ?
            ))';
            $params[] = $authUser['id'];
            $params[] = $authUser['id'];
        }
        if (!empty($_GET['clientId'])) {
            $sql .= ' AND ss.client_id = ?';
            $params[] = $_GET['clientId'];
        }
        if (!empty($_GET['search'])) {
            $s = '%' . trim((string)$_GET['search']) . '%';
            $sql .= ' AND (
                ss.sheet_number LIKE ? OR ss.client_name LIKE ? OR ss.client_phone LIKE ? OR
                ss.qr_code LIKE ? OR ss.vehicle_brand_model LIKE ? OR ss.technician_name LIKE ?
            )';
            array_push($params, $s, $s, $s, $s, $s, $s);
        }
        if (!empty($_GET['dateFrom'])) {
            $sql .= ' AND ss.created_at >= ?';
            $params[] = $_GET['dateFrom'] . ' 00:00:00';
        }
        if (!empty($_GET['dateTo'])) {
            $sql .= ' AND ss.created_at <= ?';
            $params[] = $_GET['dateTo'] . ' 23:59:59';
        }
        $paymentStatusFilter = normalizePaymentStatus($_GET['paymentStatus'] ?? '');
        if (in_array(($_GET['paymentStatus'] ?? ''), ['incasati', 'de_incasat'], true)) {
            $sql .= " AND COALESCE(ss.payment_status, 'de_incasat') = ?";
            $params[] = $paymentStatusFilter;
        }
        $sql .= " ORDER BY {$sortColumn} {$sortDir}, ss.created_at DESC LIMIT 300";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        echo json_encode(array_map(static fn(array $row): array => serviceSheetResponseForUser(buildServiceSheet($row), $authUser), $stmt->fetchAll()));

    } elseif ($action === 'getServiceSheetById') {
        ensureServiceSheetsTable($db);
        [$authUser, $sheet] = requireServiceSheetAccess($db, $body, $id);
        if (!empty($sheet['client_id'])) {
            syncExistingServiceSheetsFromClient($db, (string)$sheet['client_id'], $authUser);
            $sheet = serviceSheetRow($db, $id) ?: $sheet;
        }
        echo json_encode(serviceSheetResponseForUser(buildServiceSheet($sheet), $authUser, !empty($_GET['financialEntry']), $db));

    } elseif ($action === 'getOrCreateServiceSheetForClient') {
        $authUser = requireAuth($db, $body);
        if (!userCanViewServiceSheets($authUser)) {
            http_response_code(403);
            echo json_encode(['error' => 'Nu ai acces la fisele de service.']);
            exit();
        }
        ensureServiceSheetsTable($db);
        $clientId = textValue($_GET['clientId'] ?? ($body['client_id'] ?? ''), 36);
        $forceNew = boolValue($_GET['forceNew'] ?? ($body['force_new'] ?? 0)) === 1;
        $client = serviceSheetClientRow($db, $clientId);
        if (!$client) {
            http_response_code(404);
            echo json_encode(['error' => 'Clientul nu exista.']);
            exit();
        }
        if (!userHasClientAccess($db, $authUser, $client)) {
            http_response_code(403);
            echo json_encode(['error' => 'Nu ai acces la acest client.']);
            exit();
        }
        if (!$forceNew) {
            $stmt = $db->prepare('SELECT * FROM service_sheets WHERE client_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1');
            $stmt->execute([$clientId]);
            $existing = $stmt->fetch();
            if ($existing) {
                syncExistingServiceSheetsFromClient($db, $clientId, $authUser);
                $stmt->execute([$clientId]);
                echo json_encode(serviceSheetResponseForUser(
                    buildServiceSheet($stmt->fetch()),
                    $authUser,
                    !empty($body['financial_entry']),
                    $db
                ));
                exit();
            }
        }
        $payload = serviceSheetPayload($db, [
            'client_id' => $clientId,
            'show_company_details' => boolValue($body['show_company_details'] ?? 0),
        ], [], $client);
        echo json_encode(serviceSheetResponseForUser(insertServiceSheet($db, $payload, $authUser), $authUser, !empty($body['financial_entry']), $db));

    } elseif ($action === 'updateServiceSheet') {
        ensureServiceSheetsTable($db);
        [$authUser, $sheet] = requireServiceSheetAccess($db, $body, $id);
        $client = !empty($sheet['client_id']) ? serviceSheetClientRow($db, (string)$sheet['client_id']) : null;
        if (!empty($body['client_id']) && $body['client_id'] !== ($sheet['client_id'] ?? null)) {
            $nextClient = serviceSheetClientRow($db, textValue($body['client_id'], 36));
            if (!$nextClient || !userHasClientAccess($db, $authUser, $nextClient)) {
                http_response_code(403);
                echo json_encode(['error' => 'Nu ai acces la noul client selectat.']);
                exit();
            }
            $client = $nextClient;
        }
        $financialEntry = boolValue($body['financial_entry'] ?? 0) === 1;
        $safeBody = $body;
        if (!userCanViewClientFinancials($authUser) && !$financialEntry) {
            foreach ([
                'diagnostic_price', 'parts_price', 'labor_price', 'internal_parts_cost',
                'internal_labor_cost', 'internal_other_costs', 'total_price', 'advance_amount',
                'currency_code', 'payment_status', 'client_discount', 'storage_fee_per_day',
                'expense_costs'
            ] as $financialField) {
                unset($safeBody[$financialField]);
            }
        }
        if ($client && is_array($safeBody['expense_costs'] ?? null)) {
            $safeBody['internal_other_costs'] = saveClientExpenseCosts(
                $db,
                (string)$client['id'],
                $safeBody['expense_costs']
            );
        }
        $payload = serviceSheetPayload($db, $safeBody, $sheet, $client);
        $updatedSheet = updateServiceSheetRow($db, $id, $payload, $authUser);
        echo json_encode(serviceSheetResponseForUser($updatedSheet, $authUser, false, $db));

    } elseif ($action === 'updateServiceSheetCompanyDetails') {
        ensureServiceSheetsTable($db);
        [$authUser, $sheet] = requireServiceSheetAccess($db, $body, $id);
        $showCompanyDetails = boolValue($body['show_company_details'] ?? 0);
        if ((int)($sheet['show_company_details'] ?? 0) !== $showCompanyDetails) {
            invalidateServiceSheetPdf($db, $sheet);
            $stmt = $db->prepare(
                'UPDATE service_sheets
                 SET show_company_details = ?, updated_by = ?, updated_at = NOW()
                 WHERE id = ?'
            );
            $stmt->execute([$showCompanyDetails, $authUser['id'] ?? null, $id]);
        }
        echo json_encode(serviceSheetResponseForUser(buildServiceSheet(serviceSheetRow($db, $id) ?: $sheet), $authUser, false, $db));

    } elseif ($action === 'deleteServiceSheet') {
        ensureServiceSheetsTable($db);
        [$authUser, $sheet] = requireServiceSheetAccess($db, $body, $id);
        if (!in_array($authUser['role'] ?? '', ['admin', 'manager'], true)) {
            http_response_code(403);
            echo json_encode(['error' => 'Doar adminul sau managerul poate sterge fise de service.']);
            exit();
        }
        $fileCleanup = deleteServiceSheetPublicFiles(buildServiceSheet($sheet));
        $stmt = $db->prepare('DELETE FROM service_sheets WHERE id = ?');
        $stmt->execute([$id]);
        if (!empty($sheet['client_id'])) {
            syncClientFinalizationFromServiceSheets($db, (string)$sheet['client_id'], $authUser);
        }
        echo json_encode([
            'success' => true,
            'deleted_files' => $fileCleanup['deleted_files'] ?? [],
            'file_errors' => $fileCleanup['file_errors'] ?? [],
        ]);

    } elseif ($action === 'downloadServiceSheetPdf') {
        ensureServiceSheetsTable($db);
        [$authUser, $sheet] = requireServiceSheetAccess($db, $body, $id);
        if (!userCanViewClientFinancials($authUser)) {
            http_response_code(403);
            echo json_encode(['error' => 'Nu ai acces la valorile financiare din PDF.']);
            exit();
        }
        $sheet = attachCompanyStampToServiceSheet($db, buildServiceSheet($sheet));
        $filename = preg_replace('/[^A-Za-z0-9_.-]+/', '-', (string)($sheet['sheet_number'] ?? 'fisa-service'));
        if (!$filename) {
            $filename = 'fisa-service';
        }
        $pdf = serviceSheetPdfBytesFromTemplateV3($sheet);
        $stored = storeServiceSheetPdfPublicly($sheet, $pdf);
        rememberServiceSheetPdf($db, (string)$sheet['id'], $stored);
        header_remove('Content-Type');
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $filename . '.pdf"');
        header('Content-Length: ' . strlen($pdf));
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Expires: 0');
        header('X-Service-Pdf-Filename: ' . $stored['filename']);
        echo $pdf;
        exit();

    } elseif ($action === 'createServiceSheetPdfShareLink') {
        ensureServiceSheetsTable($db);
        [$authUser, $sheet] = requireServiceSheetAccess($db, $body, $id);
        if (!userCanViewClientFinancials($authUser)) {
            http_response_code(403);
            echo json_encode(['error' => 'Nu ai acces la valorile financiare din PDF.']);
            exit();
        }
        $sheet = attachCompanyStampToServiceSheet($db, buildServiceSheet($sheet));
        if (empty($sheet['client_signature'])) {
            http_response_code(422);
            echo json_encode(['error' => 'Clientul nu a semnat fisa de service.']);
            exit();
        }
        $pdf = serviceSheetPdfBytesFromTemplateV3($sheet);
        $stored = storeServiceSheetPdfPublicly($sheet, $pdf);
        rememberServiceSheetPdf($db, (string)$sheet['id'], $stored);
        echo json_encode([
            'success' => true,
            'share_url' => $stored['share_url'],
            'filename' => $stored['filename'],
            'bytes' => $stored['bytes'],
            'generated_at' => date('c'),
        ]);

    // â”€â”€ Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    } elseif ($action === 'getStats') {
        $statsPlatform = trim((string)($_GET['platform'] ?? ''));
        if ($statsPlatform === 'desktop' || currentAuthToken($body) !== '') {
            requireAuth(
                $db,
                $body,
                $statsPlatform === 'desktop' ? 'desktop' : null,
                ['admin', 'manager']
            );
        }

        // Period filter: mobile legacy aliases + desktop analytical ranges.
        $period = $_GET['period'] ?? 'all';
        $today = new DateTimeImmutable('today');
        $tomorrow = $today->modify('+1 day');
        $fromDate = null;
        $toDate = null;

        switch ($period) {
            case 'today':
                $fromDate = $today;
                $toDate = $tomorrow;
                break;
            case 'week':
            case '7d':
                $fromDate = $today->modify('-6 days');
                $toDate = $tomorrow;
                break;
            case 'month':
                $fromDate = $today->modify('first day of this month');
                $toDate = $tomorrow;
                break;
            case '30d':
                $fromDate = $today->modify('-29 days');
                $toDate = $tomorrow;
                break;
            case '90d':
                $fromDate = $today->modify('-89 days');
                $toDate = $tomorrow;
                break;
            case 'year':
                $fromDate = new DateTimeImmutable(date('Y-01-01'));
                $toDate = $tomorrow;
                break;
            case 'custom':
                $fromRaw = $_GET['from'] ?? '';
                $toRaw = $_GET['to'] ?? '';
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromRaw) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $toRaw)) {
                    throw new RuntimeException('Intervalul personalizat nu este valid.');
                }
                $fromDate = new DateTimeImmutable($fromRaw);
                $toDate = (new DateTimeImmutable($toRaw))->modify('+1 day');
                if ($fromDate >= $toDate) {
                    throw new RuntimeException('Data de inceput trebuie sa fie inaintea datei finale.');
                }
                break;
            default:
                $period = 'all';
        }

        $rangeCondition = static function (string $column, ?DateTimeImmutable $from, ?DateTimeImmutable $to) use ($db): string {
            if (!$from || !$to) {
                return '1=1';
            }
            return sprintf(
                '%s >= %s AND %s < %s',
                $column,
                $db->quote($from->format('Y-m-d H:i:s')),
                $column,
                $db->quote($to->format('Y-m-d H:i:s'))
            );
        };
        $scalar = static function (PDO $db, string $sql): float {
            return (float)$db->query($sql)->fetchColumn();
        };

        $createdCondition = $rangeCondition('created_at', $fromDate, $toDate);
        $createdDateWhere = $period === 'all' ? '' : " AND {$createdCondition}";
        $financialActivityColumn = 'COALESCE(qr_used_at, created_at)';
        $financialActivityColumnC = 'COALESCE(c.qr_used_at, c.created_at)';
        $financialActivityCondition = $rangeCondition($financialActivityColumn, $fromDate, $toDate);
        $financialActivityConditionC = $rangeCondition($financialActivityColumnC, $fromDate, $toDate);
        $financialDateWhere = $period === 'all' ? '' : " AND {$financialActivityCondition}";
        $financialDateWhereClient = $period === 'all' ? '' : " AND {$financialActivityConditionC}";
        $collaboratorActivityColumnC = 'COALESCE(cc.created_at, c.created_at)';
        $collaboratorActivityConditionC = $rangeCondition($collaboratorActivityColumnC, $fromDate, $toDate);
        $collaboratorDateWhere = $period === 'all' ? '' : " AND {$collaboratorActivityConditionC}";
        $clientFinancialSql = static function (string $alias = ''): array {
            $prefix = $alias !== '' ? $alias . '.' : '';
            $price = $prefix . 'price';
            $predefinedPrice = $prefix . 'predefined_price';
            $discount = $prefix . 'discount_percentage';
            $advance = $prefix . 'advance_amount';
            $paymentStatus = $prefix . 'payment_status';
            $gross = "(CASE WHEN COALESCE({$price}, 0) > 0 THEN COALESCE({$price}, 0) ELSE COALESCE({$predefinedPrice}, 0) END)";
            $total = "GREATEST({$gross} * (1 - COALESCE({$discount}, 0) / 100), 0)";
            $naturalDue = "GREATEST({$total} - COALESCE({$advance}, 0), 0)";
            $due = "(CASE
                WHEN COALESCE({$paymentStatus}, 'de_incasat') = 'incasati' THEN 0
                ELSE {$naturalDue}
             END)";
            $collected = "(CASE
                WHEN COALESCE({$paymentStatus}, 'de_incasat') = 'incasati' THEN {$total}
                ELSE LEAST(GREATEST(COALESCE({$advance}, 0), 0), {$total})
             END)";
            return [
                'gross' => $gross,
                'total' => $total,
                'due' => $due,
                'collected' => $collected,
            ];
        };
        $clientMoney = $clientFinancialSql();
        $clientMoneyC = $clientFinancialSql('c');
        $clientTotalExpr = $clientMoney['total'];
        $clientCollectedExpr = $clientMoney['collected'];
        $clientDueExpr = $clientMoney['due'];
        $clientCollectedExprC = $clientMoneyC['collected'];
        $clientDueExprC = $clientMoneyC['due'];

        $totalClients = (int)$scalar($db, "SELECT COUNT(*) FROM clients WHERE {$createdCondition}");

        // Incasarile sunt determinate de valorile financiare, nu de starea tehnica a codului QR.
        // Un client completat direct din fisa poate avea bani incasati inainte sa ajunga cod_folosit.
        $revQuery     = "SELECT COALESCE(SUM({$clientCollectedExpr}),0) FROM clients WHERE {$clientCollectedExpr} > 0{$financialDateWhere}";
        $totalRevenue = $scalar($db, $revQuery);
        $expensesQuery = "SELECT COALESCE(SUM(COALESCE(manopera_colaboratori, service_labor_price, 0) + COALESCE(valoare_piese, service_parts_price, 0) + COALESCE(alte_cheltuieli, 0)),0) FROM clients WHERE {$clientCollectedExpr} > 0{$financialDateWhere}";
        $totalExpenses = $scalar($db, $expensesQuery);
        // On Hold include exclusiv resturile neachitate ale clientilor tehnic activi.
        $onHoldWhere = "COALESCE(is_finalized, 0) = 0 AND {$clientDueExpr} > 0{$financialDateWhere}";
        $onHoldClients = (int)$scalar($db, "SELECT COUNT(*) FROM clients WHERE {$onHoldWhere}");
        $onHoldQuery = "SELECT COALESCE(SUM({$clientDueExpr}),0)
                        FROM clients
                        WHERE {$onHoldWhere}";
        $onHoldRevenue = $scalar($db, $onHoldQuery);
        $qrWhere = "COALESCE(qr_code, '') <> '' AND {$createdCondition}";
        $qrTotal = (int)$scalar($db, "SELECT COUNT(*) FROM clients WHERE {$qrWhere}");
        $qrUsed = (int)$scalar($db, "SELECT COUNT(*) FROM clients WHERE {$qrWhere} AND qr_used = 1");
        $qrGenerated = max($qrTotal - $qrUsed, 0);
        $qrPendingRevenue = $scalar(
            $db,
            "SELECT COALESCE(SUM({$clientDueExpr}),0)
             FROM clients
             WHERE {$qrWhere} AND (qr_used = 0 OR qr_used IS NULL)"
        );

        $statusRows   = $db->query("SELECT status, COUNT(*) AS cnt FROM clients WHERE {$createdCondition} GROUP BY status")->fetchAll();
        $statusCounts = ['interesat' => 0, 'va_folosi_codul' => 0, 'cod_folosit' => 0];
        foreach ($statusRows as $sr) {
            $statusCounts[$sr['status']] = (int)$sr['cnt'];
        }

        $profiles    = $db->query('SELECT * FROM profiles')->fetchAll();
        $profileStats = [];
        foreach ($profiles as $profile) {
            $pid = $profile['id'];

            $cntStmt = $db->prepare("SELECT COUNT(*) FROM clients WHERE profile_id = ?{$createdDateWhere}");
            $cntStmt->execute([$pid]);
            $clientCount = (int)$cntStmt->fetchColumn();

            $revStmt = $db->prepare("SELECT COALESCE(SUM({$clientCollectedExpr}),0) FROM clients WHERE profile_id = ? AND {$clientCollectedExpr} > 0{$financialDateWhere}");
            $revStmt->execute([$pid]);
            $rev = (float)$revStmt->fetchColumn();

            $expenseStmt = $db->prepare("SELECT COALESCE(SUM(COALESCE(manopera_colaboratori, service_labor_price, 0) + COALESCE(valoare_piese, service_parts_price, 0) + COALESCE(alte_cheltuieli, 0)),0) FROM clients WHERE profile_id = ? AND {$clientCollectedExpr} > 0{$financialDateWhere}");
            $expenseStmt->execute([$pid]);
            $expenses = (float)$expenseStmt->fetchColumn();

            $pct             = (float)$profile['percentage'] / 100;
            $profileEarnings = $rev * $pct;
            $gtrotsEarnings  = $rev - $profileEarnings - $expenses;

            $profileStats[] = [
                'profile'         => $profile,
                'clientCount'     => $clientCount,
                'totalRevenue'    => $rev,
                'profileEarnings' => $profileEarnings,
                'gtrotsEarnings'  => $gtrotsEarnings,
            ];
        }

        $collaboratorStats = [];
        if (tableExists($db, 'client_collaborator_costs') && tableExists($db, 'collaborators')) {
            $collaboratorRows = $db->query(
                "SELECT
                    COALESCE(cc.collaborator_id, CONCAT('deleted-', MD5(cc.collaborator_name))) AS collaborator_key,
                    COALESCE(cc.collaborator_id, '') AS collaborator_id,
                    COALESCE(co.name, cc.collaborator_name) AS name,
                    COALESCE(co.role, '') AS role,
                    COALESCE(co.percentage, 0) AS percentage,
                    COALESCE(co.color, cc.collaborator_color) AS color,
                    MIN(cc.created_at) AS created_at,
                    COUNT(DISTINCT c.id) AS client_count,
                    COUNT(DISTINCT CASE WHEN COALESCE(cc.payment_status, 'de_incasat') = 'incasati' THEN c.id END) AS paid_client_count,
                    COUNT(DISTINCT CASE WHEN COALESCE(cc.payment_status, 'de_incasat') <> 'incasati' THEN c.id END) AS on_hold_client_count,
                    COALESCE(SUM(cc.cost), 0) AS total_cost,
                    COALESCE(SUM(CASE WHEN COALESCE(cc.payment_status, 'de_incasat') = 'incasati' THEN cc.cost ELSE 0 END), 0) AS paid_cost,
                    COALESCE(SUM(CASE WHEN COALESCE(cc.payment_status, 'de_incasat') <> 'incasati' THEN cc.cost ELSE 0 END), 0) AS on_hold_cost
                 FROM client_collaborator_costs cc
                 JOIN clients c ON c.id = cc.client_id
                 LEFT JOIN collaborators co ON cc.collaborator_id = co.id
                 WHERE 1=1{$collaboratorDateWhere}
                 GROUP BY collaborator_key, collaborator_id, name, role, percentage, color
                 ORDER BY total_cost DESC"
            )->fetchAll();

            foreach ($collaboratorRows as $row) {
                if (!empty($row['collaborator_id'])) {
                    $dailyWhere = 'cc.collaborator_id = ?';
                    $dailyParams = [$row['collaborator_id']];
                } else {
                    $dailyWhere = 'cc.collaborator_id IS NULL AND cc.collaborator_name = ?';
                    $dailyParams = [$row['name']];
                }

                $dailyStmt = $db->prepare(
                    "SELECT DATE({$collaboratorActivityColumnC}) AS day,
                            COUNT(DISTINCT c.id) AS client_count,
                            COALESCE(SUM(cc.cost), 0) AS total_cost,
                            COALESCE(SUM(CASE WHEN COALESCE(cc.payment_status, 'de_incasat') = 'incasati' THEN cc.cost ELSE 0 END), 0) AS paid_cost,
                            COALESCE(SUM(CASE WHEN COALESCE(cc.payment_status, 'de_incasat') <> 'incasati' THEN cc.cost ELSE 0 END), 0) AS on_hold_cost
                     FROM client_collaborator_costs cc
                     JOIN clients c ON c.id = cc.client_id
                     WHERE {$dailyWhere}
                       {$collaboratorDateWhere}
                     GROUP BY DATE({$collaboratorActivityColumnC})
                     ORDER BY day DESC"
                );
                $dailyStmt->execute($dailyParams);
                $dailyRows = [];
                foreach ($dailyStmt->fetchAll() as $daily) {
                    if (empty($daily['day'])) {
                        continue;
                    }
                    $dailyRows[] = [
                        'date'        => $daily['day'],
                        'clientCount' => (int)$daily['client_count'],
                        'totalCost'   => (float)$daily['total_cost'],
                        'paidCost'    => (float)$daily['paid_cost'],
                        'onHoldCost'  => (float)$daily['on_hold_cost'],
                    ];
                }

                $collaboratorStats[] = [
                    'collaborator' => [
                        'id'         => !empty($row['collaborator_id']) ? $row['collaborator_id'] : $row['collaborator_key'],
                        'name'       => $row['name'],
                        'role'       => $row['role'],
                        'percentage' => (float)($row['percentage'] ?? 0),
                        'color'      => $row['color'] ?: '#14B8A6',
                        'created_at' => $row['created_at'] ?? '',
                    ],
                    'clientCount'       => (int)$row['client_count'],
                    'totalCost'         => (float)$row['total_cost'],
                    'paidCost'          => (float)$row['paid_cost'],
                    'onHoldCost'        => (float)$row['on_hold_cost'],
                    'paidClientCount'   => (int)$row['paid_client_count'],
                    'onHoldClientCount' => (int)$row['on_hold_client_count'],
                    'daily'             => $dailyRows,
                ];
            }
        }

        $totalProfileEarnings = 0.0;
        foreach ($profileStats as $profileStat) {
            $totalProfileEarnings += (float)$profileStat['profileEarnings'];
        }
        $netProfit = $totalRevenue - $totalExpenses - $totalProfileEarnings;

        $previous = null;
        if ($fromDate && $toDate) {
            $rangeSeconds = $toDate->getTimestamp() - $fromDate->getTimestamp();
            $previousTo = $fromDate;
            $previousFrom = $fromDate->modify("-{$rangeSeconds} seconds");
            $previousFinancialCondition = $rangeCondition('COALESCE(c.qr_used_at, c.created_at)', $previousFrom, $previousTo);
            $previousCreatedCondition = $rangeCondition('c.created_at', $previousFrom, $previousTo);

            $previousClients = $scalar($db, "SELECT COUNT(*) FROM clients c WHERE {$previousCreatedCondition}");
            $previousRevenue = $scalar(
                $db,
                "SELECT COALESCE(SUM({$clientCollectedExprC}),0)
                 FROM clients c
                 WHERE {$clientCollectedExprC} > 0 AND {$previousFinancialCondition}"
            );
            $previousExpenses = $scalar(
                $db,
                "SELECT COALESCE(SUM(COALESCE(c.manopera_colaboratori, c.service_labor_price, 0) + COALESCE(c.valoare_piese, c.service_parts_price, 0) + COALESCE(c.alte_cheltuieli, 0)),0)
                 FROM clients c
                 WHERE {$clientCollectedExprC} > 0 AND {$previousFinancialCondition}"
            );
            $previousProfileEarnings = $scalar(
                $db,
                "SELECT COALESCE(SUM({$clientCollectedExprC} * (p.percentage / 100)),0)
                 FROM clients c
                 JOIN profiles p ON p.id = c.profile_id
                 WHERE {$clientCollectedExprC} > 0 AND {$previousFinancialCondition}"
            );
            $previousOnHold = $scalar(
                $db,
                "SELECT COALESCE(SUM({$clientDueExprC}),0)
                 FROM clients c
                 WHERE COALESCE(c.is_finalized, 0) = 0
                   AND {$clientDueExprC} > 0
                   AND {$previousFinancialCondition}"
            );
            $previous = [
                'totalClients'  => (int)$previousClients,
                'totalRevenue'  => $previousRevenue,
                'onHoldRevenue' => $previousOnHold,
                'totalExpenses' => $previousExpenses + $previousProfileEarnings,
                'netProfit'     => $previousRevenue - $previousExpenses - $previousProfileEarnings,
            ];
        }

        $seriesFrom = $fromDate;
        $seriesTo = $toDate;
        if (!$seriesFrom || !$seriesTo) {
            $firstActivity = $db->query(
                "SELECT MIN(activity_date) FROM (
                    SELECT MIN(created_at) AS activity_date FROM clients
                    UNION ALL
                    SELECT MIN(qr_used_at) AS activity_date FROM clients WHERE qr_used_at IS NOT NULL
                 ) activity"
            )->fetchColumn();
            $seriesFrom = $firstActivity ? new DateTimeImmutable((string)$firstActivity) : $today;
            $seriesTo = $tomorrow;
        }

        $seriesDays = max(1, (int)ceil(($seriesTo->getTimestamp() - $seriesFrom->getTimestamp()) / 86400));
        $seriesGranularity = $seriesDays > 120 ? 'month' : 'day';
        $bucketFormat = $seriesGranularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
        $seriesMap = [];
        $cursor = $seriesGranularity === 'month'
            ? $seriesFrom->modify('first day of this month')
            : $seriesFrom->setTime(0, 0);
        while ($cursor < $seriesTo) {
            $key = $cursor->format($seriesGranularity === 'month' ? 'Y-m' : 'Y-m-d');
            $seriesMap[$key] = [
                'key' => $key,
                'label' => $cursor->format($seriesGranularity === 'month' ? 'm.Y' : 'd.m'),
                'revenue' => 0.0,
                'expenses' => 0.0,
                'onHoldRevenue' => 0.0,
                'netProfit' => 0.0,
                'usedClients' => 0,
                'generatedClients' => 0,
            ];
            $cursor = $seriesGranularity === 'month' ? $cursor->modify('+1 month') : $cursor->modify('+1 day');
        }

        $usedSeriesRows = $db->query(
            "SELECT DATE_FORMAT({$financialActivityColumn}, '{$bucketFormat}') AS bucket,
                    COUNT(CASE WHEN status='cod_folosit' THEN 1 END) AS used_clients,
                    COALESCE(SUM({$clientCollectedExpr}),0) AS revenue
             FROM clients
             WHERE {$clientCollectedExpr} > 0{$financialDateWhere}
             GROUP BY bucket
             ORDER BY bucket"
        )->fetchAll();
        foreach ($usedSeriesRows as $row) {
            $key = (string)$row['bucket'];
            if (!isset($seriesMap[$key])) {
                continue;
            }
            $seriesMap[$key]['revenue'] = (float)$row['revenue'];
            $seriesMap[$key]['usedClients'] = (int)$row['used_clients'];
        }

        $financeSeriesRows = $db->query(
            "SELECT DATE_FORMAT({$financialActivityColumnC}, '{$bucketFormat}') AS bucket,
                    COALESCE(SUM(COALESCE(c.manopera_colaboratori, c.service_labor_price, 0) + COALESCE(c.valoare_piese, c.service_parts_price, 0) + COALESCE(c.alte_cheltuieli, 0)
                      + CASE WHEN p.id IS NOT NULL
                        THEN {$clientCollectedExprC} * (p.percentage / 100)
                        ELSE 0 END),0) AS expenses
             FROM clients c
             LEFT JOIN profiles p ON p.id = c.profile_id
             WHERE {$clientCollectedExprC} > 0{$financialDateWhereClient}
             GROUP BY bucket
             ORDER BY bucket"
        )->fetchAll();
        foreach ($financeSeriesRows as $row) {
            $key = (string)$row['bucket'];
            if (!isset($seriesMap[$key])) {
                continue;
            }
            $seriesMap[$key]['expenses'] = (float)$row['expenses'];
            $seriesMap[$key]['netProfit'] = $seriesMap[$key]['revenue'] - $seriesMap[$key]['expenses'];
        }

        $generatedSeriesRows = $db->query(
            "SELECT DATE_FORMAT(created_at, '{$bucketFormat}') AS bucket, COUNT(*) AS generated_clients
             FROM clients
             WHERE {$createdCondition}
             GROUP BY bucket
             ORDER BY bucket"
        )->fetchAll();
        foreach ($generatedSeriesRows as $row) {
            $key = (string)$row['bucket'];
            if (isset($seriesMap[$key])) {
                $seriesMap[$key]['generatedClients'] = (int)$row['generated_clients'];
            }
        }

        $onHoldSeriesRows = $db->query(
            "SELECT DATE_FORMAT(COALESCE(qr_used_at, created_at), '{$bucketFormat}') AS bucket,
                    COALESCE(SUM({$clientDueExpr}),0) AS on_hold_revenue
             FROM clients
             WHERE COALESCE(is_finalized, 0) = 0 AND {$clientDueExpr} > 0{$financialDateWhere}
             GROUP BY bucket
             ORDER BY bucket"
        )->fetchAll();
        foreach ($onHoldSeriesRows as $row) {
            $key = (string)$row['bucket'];
            if (isset($seriesMap[$key])) {
                $seriesMap[$key]['onHoldRevenue'] = (float)$row['on_hold_revenue'];
            }
        }

        $userCreatedCondition = $rangeCondition('c.created_at', $fromDate, $toDate);
        $userUsedCondition = $rangeCondition('c.qr_used_at', $fromDate, $toDate);
        $userFinancialCondition = $rangeCondition($financialActivityColumnC, $fromDate, $toDate);
        $userParticipationSources = [
            "SELECT owner_user_id AS user_id, id AS client_id
               FROM clients
              WHERE owner_user_id IS NOT NULL",
        ];
        if (tableExists($db, 'client_user_access')) {
            $userParticipationSources[] = 'SELECT user_id, client_id FROM client_user_access';
        }
        if (tableExists($db, 'client_activity_logs')) {
            $userParticipationSources[] = "SELECT actor_user_id AS user_id, client_id
                                             FROM client_activity_logs
                                            WHERE actor_user_id IS NOT NULL";
        }
        $userClientParticipation = '(' . implode(' UNION ', $userParticipationSources) . ')';
        $userStats = $db->query(
            "SELECT u.id, u.display_name, u.username, u.platform_access,
                    COUNT(DISTINCT CASE WHEN {$userCreatedCondition} THEN c.id END) AS client_count,
                    COUNT(DISTINCT CASE WHEN c.status='cod_folosit' AND {$userUsedCondition} THEN c.id END) AS used_count,
                    COALESCE(SUM(CASE WHEN {$clientCollectedExprC} > 0 AND {$userFinancialCondition}
                                      THEN {$clientCollectedExprC} ELSE 0 END),0) AS revenue
             FROM app_users u
             LEFT JOIN {$userClientParticipation} participation ON participation.user_id = u.id
             LEFT JOIN clients c ON c.id = participation.client_id
             WHERE u.is_active = 1
             GROUP BY u.id, u.display_name, u.username, u.platform_access
             HAVING client_count > 0 OR used_count > 0 OR revenue > 0
             ORDER BY revenue DESC, client_count DESC
             LIMIT 8"
        )->fetchAll();
        foreach ($userStats as &$userStat) {
            $userStat['clientCount'] = (int)$userStat['client_count'];
            $userStat['usedCount'] = (int)$userStat['used_count'];
            $userStat['revenue'] = (float)$userStat['revenue'];
            unset($userStat['client_count'], $userStat['used_count']);
        }
        unset($userStat);

        $laborExpenses = $scalar(
            $db,
            "SELECT COALESCE(SUM(COALESCE(manopera_colaboratori, service_labor_price, 0)),0) FROM clients WHERE {$clientCollectedExpr} > 0{$financialDateWhere}"
        );
        $partsExpenses = $scalar(
            $db,
            "SELECT COALESCE(SUM(COALESCE(valoare_piese, service_parts_price, 0)),0) FROM clients WHERE {$clientCollectedExpr} > 0{$financialDateWhere}"
        );
        $customExpenses = $scalar(
            $db,
            "SELECT COALESCE(SUM(COALESCE(alte_cheltuieli, 0)),0) FROM clients WHERE {$clientCollectedExpr} > 0{$financialDateWhere}"
        );

        echo json_encode([
            'totalClients'  => $totalClients,
            'totalRevenue'  => $totalRevenue,
            'onHoldClients' => $onHoldClients,
            'onHoldRevenue' => $onHoldRevenue,
            'qrStats'       => [
                'total'          => $qrTotal,
                'used'           => $qrUsed,
                'generated'      => $qrGenerated,
                'pendingRevenue' => $qrPendingRevenue,
            ],
            'totalExpenses' => $totalExpenses + $totalProfileEarnings,
            'statusCounts'  => $statusCounts,
            'profileStats'  => $profileStats,
            'collaboratorStats' => $collaboratorStats,
            'netProfit'     => $netProfit,
            'previous'      => $previous,
            'series'        => array_values($seriesMap),
            'seriesGranularity' => $seriesGranularity,
            'userStats'     => $userStats,
            'expenseBreakdown' => [
                'labor' => $laborExpenses,
                'parts' => $partsExpenses,
                'custom' => $customExpenses,
                'total' => $laborExpenses + $partsExpenses + $customExpenses,
            ],
            'range' => [
                'from' => $fromDate ? $fromDate->format('Y-m-d') : null,
                'to' => $toDate ? $toDate->modify('-1 day')->format('Y-m-d') : null,
            ],
            'period'        => $period,
        ]);

    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Actiune necunoscuta: ' . $action]);
    }

} catch (InvalidArgumentException $e) {
    http_response_code(422);
    echo json_encode(['error' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
