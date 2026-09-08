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
    'category_id' => 'legacy-second-hand-category-id',
    'category_system_key' => 'second_hand_scooters',
    'supplier_product_code' => 'SE-CMM087',
    'ean' => '1234567890128',
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
$assert($attributes['condition'] === 'USED', 'categoria SH identificată prin cheia tehnică nu este marcată USED');
$assert($attributes['link'] === 'https://g-trots.ro/magazin/produs/controller-trotineta-electrica/', 'ruta conține .html sau este incorectă');
$assert($attributes['imageLink'] === $product['images'][0]['url'], 'imaginea principală nu este prima imagine');
$assert($attributes['additionalImageLinks'][0] === $product['images'][1]['url'], 'imaginile suplimentare lipsesc');
$assert($attributes['gtins'][0] === '1234567890128', 'GTIN valid lipsă');
$product['ean'] = '1234567890123';
$invalidGtinAttributes = merchantProductPayload($product, ['website_base_url' => 'https://g-trots.ro'])['productAttributes'];
$assert(!isset($invalidGtinAttributes['gtins']), 'GTIN cu checksum invalid a fost trimis către Merchant');
$assert(merchantValidGtin('2000000000000') === null, 'GTIN din intervalul restricționat a fost acceptat');
$assert(merchantProductTitle('MOTOR BICICLETA ELECTRICA 36V 250W') === 'Motor Bicicleta Electrica 36V 250W', 'titlul all-caps nu este normalizat');
$assert(merchantProductTitle('BMS 16S 60V 50A') === 'Modul de protecție pentru baterie BMS 16S 60V 50A', 'titlul BMS rămâne excesiv capitalizat');
$assert(merchantProductTitle('ROATA SPATE SOLIDA TROTINETA ELECTRICA NINEBOT E2 E2 Plus') === 'Roata Spate Solida Trotineta Electrica Ninebot E2 E2 Plus', 'titlul majoritar all-caps nu este normalizat');
$assert(merchantProductTitle('Controller 60V 30A 1500W-B LCD SQ-S4') === 'Controller pentru trotinetă electrică 60V 30A 1500W-B LCD SQ-S4', 'titlul tehnic nu primește context suficient');
$assert(merchantProductIsVisible($product), 'produsul cumpărabil este tratat ca invizibil');
$product['is_purchasable'] = false;
$assert(!merchantProductIsVisible($product), 'produsul dezactivat rămâne vizibil');

$unlimited = $product;
$unlimited['is_purchasable'] = true;
$unlimited['category_system_key'] = null;
$unlimited['stock_mode'] = 'unlimited';
$unlimited['stock_quantity'] = 0;
$unlimitedAttributes = merchantProductPayload($unlimited, ['website_base_url' => 'https://g-trots.ro'])['productAttributes'];
$assert($unlimitedAttributes['availability'] === 'IN_STOCK', 'stocul online nelimitat fără stoc fizic nu este transmis IN_STOCK');

$api = (string)file_get_contents(dirname(__DIR__) . '/api.php');
$gomag = (string)file_get_contents(dirname(__DIR__) . '/gomag.php');
$stripe = (string)file_get_contents(dirname(__DIR__) . '/stripe.php');
$merchant = (string)file_get_contents(dirname(__DIR__) . '/merchant.php');
$assert(str_contains($api, 'merchantSyncProductSafe($db, $config, $id)'), 'adăugarea/editarea produsului nu declanșează Merchant');
$assert(str_contains($api, 'merchantDeleteProduct($config, $id)'), 'ștergerea produsului nu îl elimină din Merchant');
$assert(str_contains($api, '$feedSync[\'stock_changed\']'), 'schimbarea de stoc Boomag nu declanșează Merchant');
$assert(str_contains($api, "'litespeed_finish_request'"), 'sincronizarea automată Boomag nu rulează după răspuns pe hostingul LiteSpeed');
$assert(str_contains($api, 'gomagMaybeSyncSupplierStock($db, $config, 1)'), 'feedul Boomag nu este verificat automat la interval de un minut');
$assert(str_contains($api, 'scheduleSupplierStockSyncAfterResponse($db, $config);'), 'catalogul public nu programează sincronizarea automată Boomag');
$assert(str_contains($api, '$merchantSync = merchantSyncProductSafe($db, $config, $id);'), 'ajustarea manuală de stoc nu declanșează Merchant');
$assert(str_contains($stripe, "'stock_quantity' =>"), 'Stripe nu primește stocul curent al produsului');
$assert(str_contains($gomag, 'array_keys($stocksChanged)'), 'sincronizarea completă Boomag nu propagă stocul în Merchant');
$assert(str_contains($gomag, 'stripeSyncProductSafe'), 'sincronizarea completă Boomag nu propagă prețul în Stripe');
$assert(str_contains($gomag, "'merchant_errors' => []"), 'importul Boomag nu raportează sincronizarea Merchant');
$assert(str_contains($gomag, 'supplier_price_difference = ?'), 'importul Boomag nu păstrează marja fixă față de furnizor');
$assert(str_contains($api, 'syncCommerceCatalogProducts'), 'promoțiile de produs nu resincronizează canalele de vânzare');
$assert(str_contains($api, "'catalog_sync'"), 'răspunsul promoțiilor nu expune rezultatul sincronizării catalogului');
$assert(str_contains($merchant, 'applyCatalogPromotionPrices'), 'Merchant nu aplică promoția publică');
$assert(str_contains($merchant, 'function merchantSyncIsEnabled'), 'Merchant nu are un comutator explicit de activare');
$assert(str_contains($merchant, "return ['status' => 'disabled']"), 'Hook-urile Merchant nu respectă pauza de publicare');
$assert(str_contains($stripe, 'applyCatalogPromotionPrices'), 'Stripe nu aplică promoția publică');

echo "merchant_product_contract_test: OK\n";
