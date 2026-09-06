<?php
declare(strict_types=1);

$failed = 0;
$expect = static function (bool $condition, string $message) use (&$failed): void {
    if ($condition) return;
    fwrite(STDERR, "FAIL customer return FIFO: {$message}\n");
    $failed++;
};

$api = (string)file_get_contents(__DIR__ . '/../api.php');
$invoice = (string)file_get_contents(__DIR__ . '/../invoice-service.php');
$nir = (string)file_get_contents(__DIR__ . '/../nir-service.php');
$mobile = (string)file_get_contents(dirname(__DIR__, 2) . '/components/ShopNirManager.tsx');
$desktop = (string)file_get_contents(dirname(__DIR__, 2) . '/electron-app/renderer/js/shop-commerce.js');

foreach ([
    'tabelul permanent al originilor FIFO' => 'shop_customer_return_fifo_origins',
    'tabelul alocărilor către returul furnizorului' => 'shop_customer_return_supplier_storno_allocations',
    'cantitatea refuzată per poziție' => 'refused_quantity DECIMAL(18,4)',
] as $label => $needle) $expect(str_contains($api, $needle), $label);

foreach ([
    'returul filtrează cantitățile acceptate' => "decision_status IN ('accepted', 'partial')",
    'originea este salvată din consumul FIFO al facturii' => 'shop_customer_return_fifo_origins',
    'produsele online-only sar peste NIR' => 'is_accounting_stock_tracked',
] as $label => $needle) $expect(str_contains($invoice, $needle), $label);

foreach ([
    'contextul returului la furnizor pornește din NIR-ul clientului' => 'customer_return_nir_id',
    'scurtătura expune originile furnizorului' => 'supplier_return_origins',
    'stornarea se alocă originilor exacte' => 'shop_customer_return_supplier_storno_allocations',
] as $label => $needle) $expect(str_contains($nir, $needle), $label);

$expect(str_contains($mobile, 'openSupplierReturnFromCustomerReturn'), 'aplicația mobilă trebuie să ofere scurtătura către returul furnizorului');
$expect(str_contains($desktop, 'openSupplierReturnFromCustomerReturn'), 'aplicația desktop trebuie să ofere aceeași scurtătură');

fwrite(STDOUT, 'customer_return_fifo_lineage_contract_test: ' . ($failed ? "{$failed} verificări eșuate" : 'OK') . "\n");
exit($failed === 0 ? 0 : 1);
