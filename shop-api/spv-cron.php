<?php
declare(strict_types=1);

date_default_timezone_set('Europe/Bucharest');
ini_set('display_errors', '0');
ini_set('log_errors', '1');

require_once __DIR__ . '/spv-runtime.php';
require_once __DIR__ . '/order-emails.php';
require_once __DIR__ . '/invoice-service.php';
require_once __DIR__ . '/spv-service.php';

try {
    $config = gtrotsSpvRuntimeConfig();
    if (PHP_SAPI !== 'cli') {
        $expected = trim((string)($config['spv_cron_key'] ?? ''));
        $provided = trim((string)($_SERVER['HTTP_X_SPV_CRON_KEY'] ?? ''));
        if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
            http_response_code(404);
            exit;
        }
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    $result = GtrotsSpvService::runWorker(gtrotsSpvRuntimeDb($config), $config, 10);
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $error) {
    error_log('[G-Trots SPV cron] ' . $error->getMessage());
    if (PHP_SAPI !== 'cli') http_response_code(500);
    echo json_encode(['error' => 'Workerul SPV nu a putut rula.'], JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit(1);
}

