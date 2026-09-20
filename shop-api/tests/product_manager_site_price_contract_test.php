<?php
declare(strict_types=1);

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "product_manager_site_price_contract_test: {$message}\n");
        exit(1);
    }
};

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$desktopManager = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$mobileManager = (string)file_get_contents($root . '/components/ShopProductsManager.tsx');

$assert(
    str_contains($api, 'p.price, p.supplier_base_price, p.sale_price'),
    'Lista de produse nu preia pretul de baza al furnizorului.'
);
$assert(
    str_contains($api, "? productPublicBasePrice(\$row)"),
    'Lista de produse nu aplica acelasi fallback public ca storefrontul.'
);
$assert(
    str_contains($api, 'function productManagerListRows(PDO $db, array $rows, array $config): array'),
    'Lipseste maparea comuna a pretului de site pentru manager.'
);
$assert(
    str_contains($api, '$products = applyCatalogPromotionPrices($db, productListRows($rows, $config), null);'),
    'Endpointurile managerului nu aplica promotiile automate afisate pe site.'
);
$assert(
    str_contains($api, '$product[\'sale_price\'] = (float)$product[\'promotion_price\'];'),
    'Clientii deja instalati nu primesc pretul promotional in campul compatibil.'
);
$assert(
    substr_count($api, 'productManagerListRows($db, ') >= 2,
    'Endpointurile managerului nu folosesc maparea comuna a pretului de site.'
);
$assert(
    str_contains($desktopManager, 'product.promotion_price ?? product.sale_price ?? product.price'),
    'Managerul desktop nu foloseste ordinea de pret din storefront.'
);
$assert(
    str_contains($mobileManager, 'product.promotion_price ?? product.sale_price ?? product.price'),
    'Managerul mobil nu foloseste ordinea de pret din storefront.'
);

echo "product_manager_site_price_contract_test: OK\n";
