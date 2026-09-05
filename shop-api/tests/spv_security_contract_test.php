<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$clientFiles = [
    $root . '/services/shopApi.ts',
    $root . '/components/ShopModuleScreen.tsx',
    $root . '/components/ShopInvoicesManager.tsx',
    $root . '/components/ShopSpvManager.tsx',
    $root . '/components/ShopNotificationsButton.tsx',
    $root . '/electron-app/renderer/js/shop-api.js',
    $root . '/electron-app/renderer/js/shop-commerce.js',
    $root . '/electron-app/renderer/js/shell.js',
];
$forbidden = ['anaf_oauth_client_secret', 'spv_encryption_key', '3b9bdc'];
foreach ($clientFiles as $file) {
    $contents = (string)file_get_contents($file);
    foreach ($forbidden as $needle) {
        if (stripos($contents, $needle) !== false) throw new RuntimeException(basename($file) . ' expune un secret SPV în client.');
    }
}
$api = (string)file_get_contents($root . '/shop-api/api.php');
if (!str_contains($api, "'anaf_oauth_client_secret' => ''")) throw new RuntimeException('Configurația server nu are implicit secretul OAuth gol.');
if (!str_contains($api, 'https://api.anaf.ro/test/FCTEL/rest') || str_contains($api, "'anaf_efactura_test_url' => 'https://webserviceapl.anaf.ro")) throw new RuntimeException('Gateway-ul e-Factura OAuth trebuie să fie api.anaf.ro, nu varianta mTLS.');
$requiredActions = ['getSpvConnection', 'beginSpvOAuth', 'testSpvConnection', 'runSpvDiagnostics', 'pollSpvDiagnostics', 'updateSpvSettings', 'disconnectSpv', 'sendInvoiceToSpv', 'runSpvWorker', 'getShopNotificationSummary', 'listShopNotifications', 'markShopNotificationRead'];
foreach ($requiredActions as $action) if (!str_contains($api, "'{$action}'")) throw new RuntimeException("Acțiunea API {$action} lipsește.");
$desktopApi = (string)file_get_contents($root . '/electron-app/renderer/js/shop-api.js');
foreach (['runSpvDiagnostics', 'pollSpvDiagnostics'] as $action) if (!str_contains($desktopApi, $action)) throw new RuntimeException("Clientul desktop nu expune acțiunea sigură {$action}.");
$mobileInvoices = (string)file_get_contents($root . '/components/ShopInvoicesManager.tsx');
$desktopInvoices = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
if (!str_contains($mobileInvoices, 'shopApi.sendInvoiceToSpv')) throw new RuntimeException('Butonul mobil al facturii nu folosește transmiterea SPV reală.');
if (!str_contains($desktopInvoices, 'window.SHOP_API.sendInvoiceToSpv')) throw new RuntimeException('Butonul desktop al facturii nu folosește transmiterea SPV reală.');
$desktopStyles = (string)file_get_contents($root . '/electron-app/renderer/style.css');
if (!preg_match('/#tab-shop-spv\{[^}]*overflow-y:auto/s', $desktopStyles)) throw new RuntimeException('Pagina SPV desktop nu are container vertical scrollabil.');
$protection = (string)file_get_contents($root . '/shop-api/.htaccess');
foreach (['config\.local', 'spv-runtime', 'spv-cron'] as $protected) if (!str_contains($protection, $protected)) throw new RuntimeException("Protecția HTTP lipsește pentru {$protected}.");
$callback = (string)file_get_contents($root . '/shop-api/anaf-oauth-callback.php');
if (!str_contains($callback, 'completeOAuth') || !str_contains($callback, 'Content-Security-Policy')) throw new RuntimeException('Callback-ul OAuth nu finalizează securizat schimbul de token.');
echo "SPV security contract tests passed.\n";
