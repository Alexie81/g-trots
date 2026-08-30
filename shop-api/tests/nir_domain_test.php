<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/nir-domain.php';

$passed = 0;
$failed = 0;

function nirAssertSame($expected, $actual, string $message): void {
    global $passed, $failed;
    if ($expected !== $actual) {
        $failed++;
        fwrite(STDERR, "FAIL: {$message}\n  expected: " . var_export($expected, true) . "\n  actual:   " . var_export($actual, true) . "\n");
        return;
    }
    $passed++;
}

function nirAssertThrows(callable $callback, string $message): void {
    global $passed, $failed;
    try {
        $callback();
        $failed++;
        fwrite(STDERR, "FAIL: {$message} (nu a fost aruncată nicio excepție)\n");
    } catch (Throwable $error) {
        $passed++;
    }
}

// Codul original rămâne în model; normalizarea este unică, predictibilă și nu
// elimină semne sau zerouri semnificative.
nirAssertSame('TYRE-001-A', shopNirNormalizeSupplierCode('  Tyre-001-A  '), 'normalizează spațiile și literele');
nirAssertSame('0001/A.2', shopNirNormalizeSupplierCode(' 0001/a.2 '), 'păstrează zero, slash, punct');
nirAssertSame('COD CU SPAȚII', shopNirNormalizeSupplierCode("cod   cu\tspații"), 'compactează spațiile consecutive');
nirAssertSame(shopNirNormalizeSupplierCode('kg4-brake-01'), shopNirNormalizeSupplierCode('KG4-BRAKE-01'), 'comparația este case-insensitive');
nirAssertSame('casti premium george', shopNirNormalizeSupplierProductName('  Căști  PREMIUM, George!  '), 'normalizează denumirea memorată la furnizor');
nirAssertSame(
    shopNirSupplierProductNameKey('Căști premium George'),
    shopNirSupplierProductNameKey('casti PREMIUM, george!'),
    'denumirile identice au aceeași cheie de asociere'
);
nirAssertSame(false, shopNirSupplierProductNameKey('Cască George') === shopNirSupplierProductNameKey('Cască Kidotoys'), 'denumirile diferite rămân asocieri diferite');
nirAssertSame('', shopNirSupplierProductNameKey('   '), 'denumirea goală nu creează asociere');

$ron = shopNirCalculateLine([
    'accepted_quantity' => '10', 'conversion_factor' => '1', 'unit_price' => '50',
    'discount_percent' => '0', 'vat_rate' => '19', 'exchange_rate' => '1',
]);
nirAssertSame('10.0000', $ron['stock_quantity'], 'cantitate stoc RON');
nirAssertSame('500.000000', $ron['line_net'], 'bază fără TVA');
nirAssertSame('95.000000', $ron['line_vat'], 'TVA 19%');
nirAssertSame('595.00', $ron['line_total_ron'], 'total cu TVA');
nirAssertSame('50.000000', $ron['inventory_unit_cost_ron'], 'cost FIFO fără TVA deductibil');

$discount = shopNirCalculateLine([
    'accepted_quantity' => '3', 'conversion_factor' => '1', 'unit_price' => '100',
    'discount_percent' => '10', 'vat_rate' => '19', 'exchange_rate' => '1',
]);
nirAssertSame('30.000000', $discount['line_discount'], 'discount procentual');
nirAssertSame('270.000000', $discount['line_net'], 'net după discount');
nirAssertSame('51.300000', $discount['line_vat'], 'TVA după discount');

$eur = shopNirCalculateLine([
    'accepted_quantity' => '2', 'conversion_factor' => '12', 'unit_price' => '10',
    'discount_percent' => '0', 'vat_rate' => '19', 'exchange_rate' => '4.97',
]);
nirAssertSame('24.0000', $eur['stock_quantity'], 'factor de conversie bax-bucată');
nirAssertSame('99.40', $eur['line_net_ron'], 'conversie valutară la cursul documentului');
nirAssertSame('18.89', $eur['line_vat_ron'], 'TVA convertit și rotunjit contabil');
nirAssertSame('4.141667', $eur['inventory_unit_cost_ron'], 'cost unitar FIFO după conversie');

$vatInCost = shopNirCalculateLine([
    'accepted_quantity' => '1', 'conversion_factor' => '1', 'unit_price' => '100',
    'vat_rate' => '19', 'exchange_rate' => '1',
], true);
nirAssertSame('119.000000', $vatInCost['inventory_unit_cost_ron'], 'TVA nedeductibil inclus în cost');

$layers = [
    ['id' => 'L2', 'nir_number' => 'NIR-2', 'reception_date' => '2026-02-02', 'created_at' => '2026-02-02 10:00:00', 'remaining_quantity' => '5', 'unit_cost_ron' => '60'],
    ['id' => 'L1', 'nir_number' => 'NIR-1', 'reception_date' => '2026-02-01', 'created_at' => '2026-02-01 10:00:00', 'remaining_quantity' => '10', 'unit_cost_ron' => '50'],
];
$preview = shopNirFifoPreview($layers, '12');
nirAssertSame(true, $preview['available'], 'FIFO disponibil');
nirAssertSame('620.00', $preview['total_cost_ron'], 'cost FIFO 10×50 + 2×60');
nirAssertSame('L1', $preview['allocations'][0]['layer_id'], 'primul lot după data recepției');
nirAssertSame('10.0000', $preview['allocations'][0]['quantity'], 'consum complet L1');
nirAssertSame('2.0000', $preview['allocations'][1]['quantity'], 'consum parțial L2');

$shortage = shopNirFifoPreview($layers, '20');
nirAssertSame(false, $shortage['available'], 'detectează stoc FIFO insuficient');
nirAssertSame('5.0000', $shortage['shortage_quantity'], 'cantitatea FIFO lipsă');

nirAssertThrows(fn() => shopNirCalculateLine(['accepted_quantity' => '-1']), 'respinge cantitatea negativă');
nirAssertThrows(fn() => shopNirCalculateLine(['accepted_quantity' => '1', 'conversion_factor' => '0']), 'respinge conversia zero');
nirAssertThrows(fn() => shopNirFifoPreview($layers, '0'), 'respinge preview-ul zero');

fwrite(STDOUT, "NIR domain: {$passed} teste trecute, {$failed} eșuate.\n");
exit($failed === 0 ? 0 : 1);
