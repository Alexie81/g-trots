<?php
declare(strict_types=1);

$api = file_get_contents(dirname(__DIR__) . '/api.php');
$service = file_get_contents(dirname(__DIR__) . '/nir-service.php');
$mobile = file_get_contents(dirname(__DIR__, 2) . '/components/ShopNirManager.tsx');
$desktop = file_get_contents(dirname(__DIR__, 2) . '/electron-app/renderer/js/shop-commerce.js');

$checks = [
    'unicitate furnizor + cod normalizat' => 'UNIQUE INDEX uq_shop_supplier_code',
    'unicitate mișcare pe linie NIR' => 'UNIQUE INDEX uq_shop_inventory_nir_line_type',
    'unicitate lot pe linie NIR' => 'UNIQUE INDEX uq_shop_fifo_nir_line',
    'idempotency persistată' => 'shop_nir_idempotency',
    'data NIR persistată' => 'nir_date',
    'data recepției persistată' => 'reception_date',
    'moneda persistată' => 'currency',
    'curs valutar persistat' => 'exchange_rate',
    'data cursului persistată' => 'exchange_rate_date',
    'motiv diferență structurat' => 'difference_reason',
    'observații diferență separate' => 'difference_notes',
    'prag comparație preț configurabil' => 'price_variance_warning_percent',
];
$failed = 0;
foreach ($checks as $label => $needle) {
    if (!str_contains((string)$api, $needle)) {
        fwrite(STDERR, "FAIL contract API: {$label}\n");
        $failed++;
    }
}
foreach (['beginTransaction()', 'SELECT * FROM shop_nir_documents WHERE id = ? FOR UPDATE', 'commit()', 'rollBack()'] as $needle) {
    if (!str_contains((string)$service, $needle)) {
        fwrite(STDERR, "FAIL contract tranzacție: {$needle}\n");
        $failed++;
    }
}
$productReferencesStart = strpos((string)$service, 'function shopNirProductReferences');
$supplierProductsStart = strpos((string)$service, 'function shopNirSupplierProducts');
$productReferencesContract = $productReferencesStart !== false && $supplierProductsStart !== false
    ? substr((string)$service, $productReferencesStart, $supplierProductsStart - $productReferencesStart)
    : '';
foreach (['shop_nir_lines', 'n.status = "confirmed"', 'l.accepted_quantity > 0', "['association_source'] = 'confirmed_nir'"] as $needle) {
    if (!str_contains($productReferencesContract, $needle)) {
        fwrite(STDERR, "FAIL furnizori produs din NIR confirmat: {$needle}\n");
        $failed++;
    }
}
foreach (['nir_date', 'reception_date', 'currency', 'exchange_rate', 'exchange_rate_date', 'difference_reason', 'price_comparison'] as $needle) {
    if (!str_contains((string)$mobile, $needle) || !str_contains((string)$desktop, $needle)) {
        fwrite(STDERR, "FAIL contract UI mobil+desktop: {$needle}\n");
        $failed++;
    }
}
fwrite(STDOUT, 'NIR contract: ' . ($failed ? "{$failed} verificări eșuate" : 'toate verificările au trecut') . ".\n");
exit($failed === 0 ? 0 : 1);
