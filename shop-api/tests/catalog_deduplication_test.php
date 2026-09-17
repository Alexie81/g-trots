<?php
declare(strict_types=1);

$apiPath = dirname(__DIR__) . '/api.php';
$apiSource = (string)file_get_contents($apiPath);
$start = strpos($apiSource, 'function normalizedCatalogIdentity');
$end = strpos($apiSource, 'function catalogRepresentativeProductIds', $start === false ? 0 : $start);
if ($start === false || $end === false || $end <= $start) {
    fwrite(STDERR, "Nu au putut fi încărcate funcțiile de deduplicare ale catalogului.\n");
    exit(1);
}

eval(substr($apiSource, $start, $end - $start));

$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$inStock = [
    'id' => 'new-in-stock',
    'sku' => 'SE-BB-005',
    'ean' => '7427255408192',
    'name' => 'Celule Li-ION 18650 3.1A h 3C [EVE]',
    'slug' => 'celula-li-ion-eve-18650-31ah-descarcare-3c',
    'stock_mode' => 'tracked',
    'stock_quantity' => 400,
    'low_stock_threshold' => 5,
];
$outOfStock = [
    'id' => 'old-out-of-stock',
    'sku' => 'SE-63269',
    'ean' => '7427255408192',
    'name' => 'Celule Li-ION EVE ICR18650-33V 3100mAh',
    'slug' => 'celule-li-ion-eve-icr18650-33v-3100mah',
    'stock_mode' => 'tracked',
    'stock_quantity' => 0,
    'low_stock_threshold' => 5,
];

$sharedEan = deduplicateCatalogProductRows([$outOfStock, $inStock]);
$expect(count($sharedEan) === 2, 'Două SKU-uri distincte cu același EAN trebuie păstrate în catalog.');
$expect(
    array_values(array_column($sharedEan, 'sku')) === ['SE-63269', 'SE-BB-005'],
    'Ordinea și identitatea produselor cu EAN comun trebuie păstrate.'
);

$sameAvailabilityLong = array_merge($inStock, [
    'id' => 'same-stock-long',
    'sku' => 'LONG',
    'ean' => 'same-availability-ean',
    'name' => 'Produs comercial distinct lung',
    'slug' => 'un-slug-mult-mai-lung-pentru-acelasi-produs',
]);
$sameAvailabilityShort = array_merge($inStock, [
    'id' => 'same-stock-short',
    'sku' => 'SHORT',
    'ean' => 'same-availability-ean',
    'name' => 'Produs comercial distinct scurt',
    'slug' => 'slug-scurt',
]);
$sameAvailability = deduplicateCatalogProductRows([$sameAvailabilityLong, $sameAvailabilityShort]);
$expect(count($sameAvailability) === 2, 'EAN-ul comun nu trebuie să unească SKU-uri diferite nici la disponibilitate egală.');

$sameSkuOutOfStock = array_merge($outOfStock, ['ean' => 'ean-vechi']);
$sameSkuInStock = array_merge($inStock, ['sku' => 'SE-63269', 'ean' => 'ean-nou']);
$sameSku = deduplicateCatalogProductRows([$sameSkuOutOfStock, $sameSkuInStock]);
$expect(count($sameSku) === 1, 'Înregistrările cu același SKU trebuie deduplicate.');
$expect(($sameSku[0]['stock_quantity'] ?? 0) === 400, 'La același SKU trebuie păstrată înregistrarea disponibilă.');

$storefrontSource = (string)file_get_contents(dirname(__DIR__, 2) . '/website/shop-live.js');
$catalogUiSource = (string)file_get_contents(dirname(__DIR__, 2) . '/website/magazin.js');
$expect(str_contains($storefrontSource, 'function productAvailabilityRank(product)'), 'Storefront-ul nu are prioritatea de disponibilitate.');
$expect(str_contains($storefrontSource, 'shouldReplaceCatalogProduct(uniqueProducts[duplicateIndex], product)'), 'Deduplicarea din browser nu folosește prioritatea de disponibilitate.');
$expect(!str_contains($storefrontSource, '["ean", product.ean]'), 'Storefront-ul încă unește produse distincte doar după EAN.');
$expect(str_contains($storefrontSource, 'g-trots:catalog-compact:v2'), 'Cache-ul vechi al catalogului nu a fost invalidat.');
$expect(!str_contains($catalogUiSource, '["ean", product.ean]'), 'Interfața catalogului încă unește produse distincte doar după EAN.');
$expect(str_contains($catalogUiSource, 'shouldReplaceProduct(uniqueProducts[duplicateIndex], product)'), 'Interfața catalogului nu folosește prioritatea de disponibilitate pentru duplicate reale.');

if ($failures) {
    fwrite(STDERR, "Deduplicare catalog: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "Deduplicarea catalogului preferă corect produsul disponibil și păstrează fallback-ul de slug.\n";
