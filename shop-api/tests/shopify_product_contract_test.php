<?php
declare(strict_types=1);

define('SHOP_CATEGORY_SECOND_HAND_ID', '8f1ac397-76ab-4bd9-9f60-1cd239cf2573');
require_once dirname(__DIR__) . '/product-pricing.php';
require_once dirname(__DIR__) . '/stripe.php';
require_once dirname(__DIR__) . '/merchant.php';
require_once dirname(__DIR__) . '/shopify.php';

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "shopify_product_contract_test: {$message}\n");
        exit(1);
    }
};

$product = [
    'id' => 'product-stable-id',
    'name' => 'Controller trotinetă electrică',
    'slug' => 'controller-trotineta-electrica',
    'short_description' => 'Controller verificat pentru trotinete electrice.',
    'description_html' => '<p>Controller complet pentru trotinete electrice.</p>',
    'meta_title' => 'Controller trotinetă electrică | G-Trots',
    'meta_description' => 'Controller pentru reparații trotinete electrice, verificat de G-Trots.',
    'manufacturer_name' => 'G-Trots',
    'category_name' => 'Controllere',
    'sku' => 'GT-CONTROLLER-1',
    'ean' => '1234567890128',
    'price' => 129.90,
    'supplier_base_price' => 99.50,
    'sale_price' => 119.90,
    'promotion_price' => 109.90,
    'currency' => 'RON',
    'stock_mode' => 'tracked',
    'stock_quantity' => 7,
    'is_purchasable' => true,
    'images' => [
        ['url' => 'https://g-trots.ro/shop-api/uploads/products/main.webp', 'alt_text' => 'Controller G-Trots'],
    ],
    'brands' => [['name' => 'Xiaomi']],
];
$config = [
    'website_base_url' => 'https://g-trots.ro',
    'shopify_location_id' => 'gid://shopify/Location/12345',
];
$payload = shopifyProductPayload($product, $config);
$variant = $payload['variants'][0];
$assert($payload['status'] === 'ACTIVE', 'produsul cumpărabil nu este activ');
$assert($variant['price'] === '109.90', 'prețul promoțional public nu este folosit');
$assert($variant['compareAtPrice'] === '129.90', 'prețul de comparație nu este prețul public de bază');
$assert($variant['inventoryQuantities'][0]['quantity'] === 7, 'stocul nu este sincronizat');
$assert($variant['barcode'] === '1234567890128', 'EAN-ul valid lipsește');
$assert($variant['metafields'][0]['namespace'] === 'shopify' && $variant['metafields'][0]['key'] === 'external_url', 'metacâmpul standard external_url lipsește');
$assert($variant['metafields'][0]['value'] === 'https://g-trots.ro/magazin/produs/controller-trotineta-electrica/', 'URL-ul extern nu indică pagina canonică fără .html');
$assert($payload['files'][0]['originalSource'] === $product['images'][0]['url'], 'imaginea principală nu este transmisă');
$assert($payload['files'][0]['duplicateResolutionMode'] === 'REPLACE', 'imaginile nu sunt actualizate idempotent');
$assert($payload['metafields'][0]['value'] === 'product-stable-id', 'ID-ul intern stabil lipsește');

$unlimited = $product;
$unlimited['stock_mode'] = 'unlimited';
$unlimited['stock_quantity'] = 0;
$unlimitedPayload = shopifyProductPayload($unlimited, $config);
$unlimitedVariant = $unlimitedPayload['variants'][0];
$assert($unlimitedPayload['status'] === 'ACTIVE', 'produsul cu stoc online nelimitat trebuie să rămână activ în Shopify');
$assert($unlimitedVariant['inventoryItem']['tracked'] === false, 'stocul nelimitat nu trebuie urmărit ca stoc fizic în Shopify');
$assert(!isset($unlimitedVariant['inventoryQuantities']), 'stocul nelimitat nu trebuie limitat printr-o cantitate fizică Shopify');
$assert(!shopifySyncIsEnabled(['shopify_sync_enabled' => false]), 'pauza de publicare Shopify nu este respectată');
$assert(shopifyIsConfigured(['shopify_store_domain' => 'g-trots-agentic.myshopify.com', 'shopify_client_id' => 'client', 'shopify_client_secret' => 'secret']), 'autentificarea client credentials nu este recunoscută');

$api = (string)file_get_contents(dirname(__DIR__) . '/api.php');
$gomag = (string)file_get_contents(dirname(__DIR__) . '/gomag.php');
$shopify = (string)file_get_contents(dirname(__DIR__) . '/shopify.php');
$assert(str_contains($api, "require_once __DIR__ . '/shopify.php'"), 'modulul Shopify nu este încărcat');
$assert(substr_count($api, 'shopifySyncProductSafe($db, $config, $id)') >= 3, 'CRUD/stoc nu declanșează Shopify');
$assert(str_contains($api, 'shopifyDeleteProduct($db, $config, $id)'), 'ștergerea nu elimină produsul Shopify');
$assert(str_contains($api, "'shopify' => []"), 'promoțiile nu includ Shopify în sincronizarea canalelor');
$assert(str_contains($api, "\$action === 'syncShopifyCatalog'"), 'ruta de migrare Shopify lipsește');
$assert(str_contains($gomag, 'shopifySyncProductSafe'), 'Boomag nu propagă prețul și stocul în Shopify');
$assert(str_contains($shopify, "'shopify',\n            'key' => 'external_url'"), 'external_url standard nu este prezent');
$assert(str_contains($shopify, 'productSet(synchronous: true'), 'catalogul nu folosește productSet sincron');
$assert(str_contains($shopify, 'publishablePublish(id: $id, input: $input)'), 'produsele active nu sunt publicate automat în Shopify Catalog');
$assert(str_contains($shopify, 'publishableUnpublish(id: $id, input: $input)'), 'produsele inactive nu sunt retrase automat din Shopify Catalog');
$assert(str_contains($shopify, 'shopifySetCatalogPublished($config, $shopifyProductId, shopifyProductIsVisible($product))'), 'sincronizarea nu actualizează starea publicării în catalogul AI');
$assert(str_contains($shopify, "'grant_type' => 'client_credentials'"), 'tokenul Shopify nu este reînnoit automat');

echo "shopify_product_contract_test: OK\n";
