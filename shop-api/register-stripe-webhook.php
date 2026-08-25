<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/stripe.php';

$configFile = __DIR__ . '/config.local.php';
if (!is_file($configFile)) throw new RuntimeException('Lipseste config.local.php.');
$config = include $configFile;
if (!is_array($config) || !stripeIsConfigured($config)) throw new RuntimeException('Stripe nu este configurat.');

$webhookUrl = 'https://g-trots.ro/shop-api/api-v2.php?action=stripeWebhook';
$existing = stripeRequest($config, 'GET', 'webhook_endpoints', ['limit' => 100]);
foreach (is_array($existing['data'] ?? null) ? $existing['data'] : [] as $endpoint) {
    if (($endpoint['url'] ?? '') !== $webhookUrl || ($endpoint['status'] ?? '') !== 'enabled') continue;
    if (trim((string)($config['stripe_webhook_secret'] ?? '')) === '') {
        throw new RuntimeException('Endpointul exista deja, dar secretul local lipseste. Recreeaza-l din Stripe Dashboard.');
    }
    echo "Webhook Stripe deja configurat: " . (string)$endpoint['id'] . PHP_EOL;
    exit(0);
}

$endpoint = stripeRequest($config, 'POST', 'webhook_endpoints', [
    'url' => $webhookUrl,
    'description' => 'G-Trots SHOP checkout test',
    'enabled_events' => [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
    ],
], 'gtrots-shop-webhook-test-v1');

$secret = trim((string)($endpoint['secret'] ?? ''));
if ($secret === '') throw new RuntimeException('Stripe nu a returnat secretul webhook.');
$config['stripe_webhook_secret'] = $secret;

$temporary = $configFile . '.tmp';
$contents = "<?php\n\nreturn " . var_export($config, true) . ";\n";
if (file_put_contents($temporary, $contents, LOCK_EX) === false || !rename($temporary, $configFile)) {
    @unlink($temporary);
    throw new RuntimeException('Secretul webhook nu a putut fi salvat local.');
}

echo "Webhook Stripe creat si configurat: " . (string)($endpoint['id'] ?? '') . PHP_EOL;
