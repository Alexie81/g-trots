<?php
declare(strict_types=1);

/** Standalone bootstrap used only by the OAuth callback and the CLI worker. */
function gtrotsSpvRuntimeConfig(): array
{
    $config = [
        'db_host' => 'localhost',
        'db_name' => 'cabitro_g-trots-shop',
        'db_user' => '',
        'db_pass' => '',
        'public_base_url' => 'https://g-trots.ro/shop-api',
        'anaf_oauth_client_id' => '',
        'anaf_oauth_client_secret' => '',
        'spv_encryption_key' => '',
        'anaf_oauth_callback_url' => 'https://g-trots.ro/shop-api/anaf-oauth-callback.php',
        'anaf_oauth_authorize_url' => 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize',
        'anaf_oauth_token_url' => 'https://logincert.anaf.ro/anaf-oauth2/v1/token',
        'anaf_oauth_revoke_url' => 'https://logincert.anaf.ro/anaf-oauth2/v1/revoke',
        'anaf_oauth_test_url' => 'https://api.anaf.ro/TestOauth/jaxrs/hello?name=G-Trots',
        'anaf_efactura_test_url' => 'https://webserviceapl.anaf.ro/test/FCTEL/rest',
        'anaf_efactura_production_url' => 'https://webserviceapl.anaf.ro/prod/FCTEL/rest',
        'anaf_invoice_validation_url' => 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1',
        'anaf_credit_note_validation_url' => 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FCN',
        'spv_cron_key' => '',
    ];
    $sharedFile = dirname(__DIR__) . '/trotty-api/api_config.local.php';
    if (is_file($sharedFile)) {
        $shared = include $sharedFile;
        if (is_array($shared)) {
            foreach (['db_host', 'db_user', 'db_pass'] as $key) if (isset($shared[$key])) $config[$key] = (string)$shared[$key];
        }
    }
    $localFile = __DIR__ . '/config.local.php';
    if (is_file($localFile)) {
        $local = include $localFile;
        if (is_array($local)) $config = array_merge($config, $local);
    }
    return $config;
}

function gtrotsSpvRuntimeDb(array $config): PDO
{
    $host = (string)($config['db_host'] ?? 'localhost');
    $name = (string)($config['db_name'] ?? '');
    $user = (string)($config['db_user'] ?? '');
    $pass = (string)($config['db_pass'] ?? '');
    if ($name === '' || $user === '') throw new RuntimeException('Configurația bazei SHOP este incompletă.');
    return new PDO("mysql:host={$host};dbname={$name};charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}
