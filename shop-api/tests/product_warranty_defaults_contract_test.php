<?php
declare(strict_types=1);

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "product_warranty_defaults_contract_test: {$message}\n");
        exit(1);
    }
};

$root = dirname(__DIR__, 2);
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$mobile = (string)file_get_contents($root . '/components/ShopProductsManager.tsx');
$api = (string)file_get_contents(dirname(__DIR__) . '/api.php');

$assert(!str_contains($desktop, "product?.legal_warranty_months ?? 24"), 'desktop-ul precompletează încă 24 de luni');
$assert(str_contains($desktop, "'shop-product-legal-warranty': product?.legal_warranty_months ?? ''"), 'desktop-ul nu păstrează gol câmpul nesetat');
$assert(str_contains($desktop, 'shop-product-legal-warranty" type="number" min="0" max="240" placeholder="Nesetat"'), 'desktop-ul nu indică starea nesetată');
$assert(!str_contains($mobile, 'placeholder="24"'), 'aplicația mobilă sugerează încă implicit 24 de luni');
$assert(substr_count($mobile, 'placeholder="Nesetat"') >= 2, 'aplicația mobilă nu indică ambele garanții ca nesetate');
$assert(str_contains($api, "trim((string)(\$body['legal_warranty_months'] ?? '')) === '' ? null"), 'API-ul nu salvează golul ca NULL');
$assert(str_contains($api, "trim((string)(\$body['commercial_warranty_months'] ?? '')) === '' ? null"), 'API-ul nu salvează garanția comercială goală ca NULL');

echo "product_warranty_defaults_contract_test: OK\n";
