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
if (stripeIsTestMode($config)) throw new RuntimeException('Domeniul de plata trebuie inregistrat folosind cheia Stripe live.');

$domainNames = ['g-trots.ro', 'www.g-trots.ro'];
$existing = stripeRequest($config, 'GET', 'payment_method_domains', ['limit' => 100]);
$existingByName = [];
foreach (is_array($existing['data'] ?? null) ? $existing['data'] : [] as $domain) {
    $existingByName[strtolower((string)($domain['domain_name'] ?? ''))] = $domain;
}

foreach ($domainNames as $domainName) {
    $domain = $existingByName[strtolower($domainName)] ?? null;
    if (is_array($domain)) {
        if (!($domain['enabled'] ?? false)) {
            $domain = stripeRequest($config, 'POST', 'payment_method_domains/' . rawurlencode((string)$domain['id']), [
                'enabled' => 'true',
            ]);
        }
        echo 'Domeniu Stripe live activ: ' . (string)($domain['domain_name'] ?? $domainName) . PHP_EOL;
        continue;
    }

    $domain = stripeRequest($config, 'POST', 'payment_method_domains', [
        'domain_name' => $domainName,
    ], 'gtrots-payment-domain-production-' . hash('sha256', $domainName));
    echo 'Domeniu Stripe live inregistrat: ' . (string)($domain['domain_name'] ?? $domainName) . PHP_EOL;
}
