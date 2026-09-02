<?php
declare(strict_types=1);

require_once __DIR__ . '/../nir-service.php';

$api = (string)file_get_contents(__DIR__ . '/../api.php');
$types = (string)file_get_contents(dirname(__DIR__, 2) . '/services/shopApi.ts');
$mobileSuppliers = (string)file_get_contents(dirname(__DIR__, 2) . '/components/ShopSuppliersManager.tsx');
$mobileNir = (string)file_get_contents(dirname(__DIR__, 2) . '/components/ShopNirManager.tsx');
$mobileProducts = (string)file_get_contents(dirname(__DIR__, 2) . '/components/ShopProductsManager.tsx');
$desktop = (string)file_get_contents(dirname(__DIR__, 2) . '/electron-app/renderer/js/shop-commerce.js');
$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$expect(shopNirSupplierDisplayName(['supplier_alias' => 'Kidoto', 'supplier_name' => 'KIDOTOYS SRL']) === 'Kidoto', 'Aliasul nu are prioritate în răspunsurile NIR.');
$expect(shopNirSupplierDisplayName(['supplier_alias' => '', 'supplier_name' => 'KIDOTOYS SRL']) === 'KIDOTOYS SRL', 'Fallback-ul la denumirea juridică nu funcționează.');

foreach (['alias VARCHAR(180)', "'alias' => \$alias", 's.alias AS supplier_alias', 'alias LIKE ?'] as $needle) {
    $expect(str_contains($api . $types . (string)file_get_contents(__DIR__ . '/../nir-service.php'), $needle), "Contractul API pentru alias nu conține {$needle}.");
}
$expect(str_contains($api, "UPDATE shop_suppliers SET alias = name"), 'Migrarea nu completează aliasul furnizorilor existenți.');
$expect(str_contains($api, "'display_name'"), 'API-ul nu publică numele de afișare calculat.');

foreach ([$mobileSuppliers, $mobileNir, $mobileProducts] as $mobileSource) {
    $expect(str_contains($mobileSource, 'shopSupplierDisplayName'), 'O secțiune mobilă afișează încă direct denumirea juridică.');
}
foreach (['shop-supplier-alias', 'supplierDisplayName', 'supplier_alias'] as $needle) {
    $expect(str_contains($desktop, $needle), "Desktopul nu conține integrarea {$needle}.");
}
$expect(str_contains($mobileSuppliers, 'ALIAS AFIȘAT *') && str_contains($desktop, 'Alias afisat *'), 'Câmpul Alias lipsește dintr-un editor de furnizor.');
$expect(str_contains($mobileNir, 'Alias, denumire juridică sau CUI'), 'Selectorul NIR mobil nu caută după alias.');

if ($failures) {
    fwrite(STDERR, "Alias furnizor: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "Alias furnizor validat în API, furnizori, produse, stocuri și NIR pe mobil și desktop.\n";
