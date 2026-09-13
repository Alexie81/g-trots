<?php
declare(strict_types=1);

define('GTROTS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';

header_remove('Content-Type');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Robots-Tag: noindex, nofollow');

try {
    $config = shopConfig();
    $db = shopDb($config);
    $token = trim((string)($_GET['token'] ?? $_POST['token'] ?? ''));
    $result = shopNewsletterUnsubscribe($db, $token);
    if (($result['state'] ?? '') === 'invalid') http_response_code(404);
    echo shopNewsletterUnsubscribePage($result);
} catch (Throwable $error) {
    error_log('[G-Trots newsletter unsubscribe] ' . $error->getMessage());
    http_response_code(500);
    echo shopNewsletterUnsubscribePage(['state' => 'invalid']);
}
