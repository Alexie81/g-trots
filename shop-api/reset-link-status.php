<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function resetLinkResponse(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    resetLinkResponse(['error' => 'Metodă nepermisă.'], 405);
}

$body = json_decode((string)file_get_contents('php://input'), true);
$body = is_array($body) ? $body : [];
$email = mb_strtolower(trim((string)($body['email'] ?? '')));
$rawToken = strtolower(trim((string)($body['token'] ?? '')));
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-f0-9]{64}$/', $rawToken)) {
    resetLinkResponse(['error' => 'Linkul de resetare nu este valid sau a expirat.', 'code' => 'reset_link_expired'], 410);
}

try {
    $shared = [];
    $sharedFile = dirname(__DIR__) . '/trotty-api/api_config.local.php';
    if (is_file($sharedFile)) {
        $loaded = include $sharedFile;
        if (is_array($loaded)) $shared = $loaded;
    }
    $local = [];
    $localFile = __DIR__ . '/config.local.php';
    if (is_file($localFile)) {
        $loaded = include $localFile;
        if (is_array($loaded)) $local = $loaded;
    }
    $host = (string)($local['db_host'] ?? $shared['db_host'] ?? 'localhost');
    $name = (string)($local['db_name'] ?? 'cabitro_g-trots-shop');
    $user = (string)($local['db_user'] ?? $shared['db_user'] ?? '');
    $pass = (string)($local['db_pass'] ?? $shared['db_pass'] ?? '');
    if ($user === '' || $name === '') throw new RuntimeException('Configurare incompletă.');
    $db = new PDO("mysql:host={$host};dbname={$name};charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $stmt = $db->prepare(
        'SELECT r.id
         FROM shop_customer_password_resets r
         INNER JOIN shop_customers c ON c.id = r.customer_id AND c.is_active = 1
         WHERE r.token_hash = ? AND r.email = ? AND c.email = ?
           AND r.used_at IS NULL AND r.expires_at >= NOW()
         LIMIT 1'
    );
    $stmt->execute([hash('sha256', $rawToken), $email, $email]);
    if (!$stmt->fetchColumn()) {
        resetLinkResponse(['error' => 'Linkul de resetare nu este valid sau a expirat.', 'code' => 'reset_link_expired'], 410);
    }
    resetLinkResponse(['valid' => true]);
} catch (Throwable $error) {
    error_log('[G-Trots reset link validation] ' . $error->getMessage());
    resetLinkResponse(['error' => 'Linkul nu poate fi verificat momentan.', 'code' => 'reset_link_unavailable'], 503);
}
