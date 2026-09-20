<?php
declare(strict_types=1);

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "boomag_unlimited_stock_contract_test: {$message}\n");
        exit(1);
    }
};

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$gomag = (string)file_get_contents($root . '/shop-api/gomag.php');
$mobileEditor = (string)file_get_contents($root . '/components/ShopProductsManager.tsx');
$desktopEditor = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');

$assert(!str_contains($api, '$payload[\'stock_mode\'] = \'tracked\';'), 'API-ul anulează alegerea de stoc nelimitat pentru Boomag.');
$assert(!str_contains($api, '$stockMode = \'tracked\';'), 'Validarea formularului anulează alegerea de stoc nelimitat pentru Boomag.');
$assert(!str_contains($gomag, 'stock_mode = IF(LOWER(source_domain) = "boomag.ro", "tracked", stock_mode)'), 'Importul Boomag forțează produsele existente pe stoc urmărit.');
$assert(!str_contains($gomag, 'supplier_stock_updated_at = NOW(), stock_mode = "tracked", stock_quantity ='), 'Sincronizarea Boomag anulează stocul nelimitat.');
$assert(str_contains($mobileEditor, 'Stocul online ramane nelimitat'), 'Editorul mobil nu explică suprascrierea stocului Boomag.');
$assert(str_contains($desktopEditor, 'shop-product-boomag-stock-hint'), 'Editorul desktop nu afișează starea suprascrierii Boomag.');
$assert(str_contains($mobileEditor, 'din Boomag sau din stocul fizic receptionat prin NIR'), 'Editorul mobil nu explică fallback-ul pe stocul fizic din NIR.');
$assert(str_contains($desktopEditor, 'fizic NIR'), 'Editorul desktop nu afișează separat stocul fizic din NIR.');
$assert(!str_contains($desktopEditor, "if (supplierManaged) $('shop-product-stock-mode').value = 'tracked'"), 'Editorul desktop forțează încă stocul urmărit pentru Boomag.');

echo "boomag_unlimited_stock_contract_test: OK\n";
