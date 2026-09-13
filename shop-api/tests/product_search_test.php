<?php
declare(strict_types=1);

require_once __DIR__ . '/../product-search.php';

function productSearchAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$rows = [
    [
        'id' => 'target',
        'name' => 'Cauciuc offroad tubeless pentru trotineta electrica 10x2.75-6.5 - Kukirin G2 2025',
        'sku' => 'SE-CMM087',
        'supplier_product_code' => 'BOOM-871',
        'ean' => '5940000000087',
        'category_name' => 'Cauciucuri tubeless',
        'manufacturer_name' => 'EWheel',
        'search_brand_names' => 'Kukirin G2 2025',
    ],
    [
        'id' => 'nearby-86',
        'name' => 'Cauciuc offroad cu gel tubeless pentru trotineta electrica',
        'sku' => 'SE-CMM086',
        'supplier_product_code' => 'BOOM-861',
        'ean' => '5940000000086',
        'category_name' => 'Cauciucuri tubeless',
        'manufacturer_name' => 'EWheel',
        'search_brand_names' => 'Kukirin',
    ],
    [
        'id' => 'nearby-83',
        'name' => 'Cauciuc tubeless Cityroad pentru trotineta electrica',
        'sku' => 'SE-CMM083',
        'supplier_product_code' => 'BOOM-831',
        'ean' => '5940000000083',
        'category_name' => 'Cauciucuri tubeless',
        'manufacturer_name' => 'EWheel',
        'search_brand_names' => 'Kukirin',
    ],
    [
        'id' => 'controller',
        'name' => 'Controller trotineta electrica Kukirin G2 MAX',
        'sku' => 'SE-CMM037',
        'supplier_product_code' => 'BOOM-371',
        'ean' => '5940000000037',
        'category_name' => 'Controllere',
        'manufacturer_name' => 'OEM',
        'search_brand_names' => 'Kukirin G2 MAX',
    ],
];

$exactSku = productManagerSearchRows($rows, 'SE-CMM087');
productSearchAssert(count($exactSku) === 1 && $exactSku[0]['id'] === 'target', 'Un SKU complet trebuie sa intoarca exclusiv produsul exact.');

$formattedSku = productManagerSearchRows($rows, ' se cmm-087 ');
productSearchAssert(count($formattedSku) === 1 && $formattedSku[0]['id'] === 'target', 'Spatiile si separatorii nu trebuie sa impiedice potrivirea exacta a SKU-ului.');

$exactEan = productManagerSearchRows($rows, '5940000000087');
productSearchAssert(count($exactEan) === 1 && $exactEan[0]['id'] === 'target', 'Un EAN complet trebuie sa intoarca exclusiv produsul exact.');

$partialCode = productManagerSearchRows($rows, 'CMM087');
productSearchAssert(count($partialCode) === 1 && $partialCode[0]['id'] === 'target', 'Un fragment exact distinctiv de SKU nu trebuie extins fuzzy spre codurile vecine.');

$textSearch = productManagerSearchRows($rows, 'anvelopa kukirin g2 2025');
productSearchAssert($textSearch !== [] && $textSearch[0]['id'] === 'target', 'Cautarea textuala trebuie sa pastreze sinonimele si toleranta la denumiri.');
productSearchAssert(!in_array('controller', array_column($textSearch, 'id'), true), 'Cautarea textuala precisa nu trebuie sa includa alte tipuri de produs.');

echo "product_search_test: OK\n";
