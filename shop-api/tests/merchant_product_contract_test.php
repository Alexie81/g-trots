<?php
declare(strict_types=1);

define('SHOP_CATEGORY_SECOND_HAND_ID', '8f1ac397-76ab-4bd9-9f60-1cd239cf2573');
require_once dirname(__DIR__) . '/product-pricing.php';
require_once dirname(__DIR__) . '/stripe.php';
require_once dirname(__DIR__) . '/merchant.php';

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "merchant_product_contract_test: {$message}\n");
        exit(1);
    }
};

$product = [
    'id' => 'product-stable-id',
    'name' => 'Controller trotinetă electrică',
    'slug' => 'controller-trotineta-electrica',
    'short_description' => 'Controller verificat pentru trotinete electrice.',
    'meta_description' => 'Controller pentru reparații trotinete electrice, verificat de G-Trots.',
    'manufacturer_name' => 'G-Trots',
    'category_id' => SHOP_CATEGORY_SECOND_HAND_ID,
    'supplier_product_code' => 'SE-CMM087',
    'ean' => '1234567890123',
    'price' => 0,
    'supplier_base_price' => 99.50,
    'sale_price' => null,
    'promotion_price' => 89.99,
    'currency' => 'RON',
    'stock_mode' => 'tracked',
    'stock_quantity' => 2,
    'is_purchasable' => true,
    'images' => [
        ['url' => 'https://g-trots.ro/shop-api/uploads/products/main.webp'],
        ['url' => 'https://g-trots.ro/shop-api/uploads/products/second.webp'],
    ],
];

$payload = merchantProductPayload($product, ['website_base_url' => 'https://g-trots.ro']);
$attributes = $payload['productAttributes'];
$assert($payload['offerId'] === 'product-stable-id', 'offerId nu este ID-ul intern stabil');
$assert($attributes['price']['amountMicros'] === '89990000', 'prețul nu respectă regula publică comună');
$assert($attributes['availability'] === 'IN_STOCK', 'stocul activ nu este IN_STOCK');
$assert($attributes['condition'] === 'USED', 'categoria SH nu este marcată USED');
$assert($attributes['link'] === 'https://g-trots.ro/magazin/produs/controller-trotineta-electrica/', 'ruta conține .html sau este incorectă');
$assert($attributes['imageLink'] === $product['images'][0]['url'], 'imaginea principală nu este prima imagine');
$assert($attributes['additionalImageLinks'][0] === $product['images'][1]['url'], 'imaginile suplimentare lipsesc');
$assert($attributes['gtins'][0] === '1234567890123', 'GTIN valid lipsă');
$assert(merchantProductIsVisible($product), 'produsul cumpărabil este tratat ca invizibil');
$product['is_purchasable'] = false;
$assert(!merchantProductIsVisible($product), 'produsul dezactivat rămâne vizibil');

$api = (string)file_get_contents(dirname(__DIR__) . '/api.php');
$gomag = (string)file_get_contents(dirname(__DIR__) . '/gomag.php');
$stripe = (string)file_get_contents(dirname(__DIR__) . '/stripe.php');
$merchant = (string)file_get_contents(dirname(__DIR__) . '/merchant.php');
$assert(str_contains($api, 'merchantSyncProductSafe($db, $config, $id)'), 'adăugarea/editarea produsului nu declanșează Merchant');
$assert(str_contains($api, 'merchantDeleteProduct($config, $id)'), 'ștergerea produsului nu îl elimină din Merchant');
$assert(str_contains($api, '$feedSync[\'stock_changed\']'), 'schimbarea de stoc Boomag nu declanșează Merchant');
$assert(str_contains($api, '$merchantSync = merchantSyncProductSafe($db, $config, $id);'), 'ajustarea manuală de stoc nu declanșează Merchant');
$assert(str_contains($stripe, "'stock_quantity' =>"), 'Stripe nu primește stocul curent al produsului');
$assert(str_contains($gomag, 'array_keys($stocksChanged)'), 'sincronizarea completă Boomag nu propagă stocul în Merchant');
$assert(str_contains($gomag, 'stripeSyncProductSafe'), 'sincronizarea completă Boomag nu propagă prețul în Stripe');
$assert(str_contains($gomag, "'merchant_errors' => []"), 'importul Boomag nu raportează sincronizarea Merchant');
$assert(str_contains($gomag, 'supplier_price_difference = ?'), 'importul Boomag nu păstrează marja fixă față de furnizor');
$assert(str_contains($api, 'syncCommerceCatalogProducts'), 'promoțiile de produs nu resincronizează canalele de vânzare');
$assert(str_contains($api, "'catalog_sync'"), 'răspunsul promoțiilor nu expune rezultatul sincronizării catalogului');
$assert(str_contains($merchant, 'applyCatalogPromotionPrices'), 'Merchant nu aplică promoția publică');
$assert(str_contains($stripe, 'applyCatalogPromotionPrices'), 'Stripe nu aplică promoția publică');

echo "merchant_product_contract_test: OK\n";
