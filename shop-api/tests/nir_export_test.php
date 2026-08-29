<?php
declare(strict_types=1);

require_once __DIR__ . '/../nir-domain.php';
require_once __DIR__ . '/../nir-service.php';

$document = [
    'nir_number' => 'NIR-2026-0001',
    'temporary_number' => 'TEMP-1',
    'nir_date' => '2026-08-29',
    'reception_date' => '2026-08-29',
    'supplier_name' => 'Furnizor test',
    'supplier_invoice_series' => 'INV',
    'supplier_invoice_number' => '42',
    'supplier_invoice_date' => '2026-08-28',
    'currency' => 'EUR',
    'exchange_rate' => '5.100000',
    'exchange_rate_date' => '2026-08-28',
    'subtotal_ron' => '102.00',
    'vat_total_ron' => '21.42',
    'grand_total_ron' => '123.42',
    'lines' => [[
        'line_number' => 1,
        'supplier_product_code' => 'ABC-1',
        'supplier_product_name' => 'Produs test',
        'accepted_quantity' => '2',
        'purchase_unit' => 'buc',
        'unit_price' => '10.00',
        'vat_rate' => '21.00',
        'line_total_ron' => '123.42',
        'inventory_unit_cost_ron' => '51.00',
    ]],
];

$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$xlsx = shopNirBuildXlsx($document);
$expect(str_starts_with($xlsx, "PK\x03\x04"), 'XLSX nu începe cu antet ZIP.');
$expect(str_contains($xlsx, '[Content_Types].xml'), 'Lipsește manifestul OOXML.');
$expect(str_contains($xlsx, 'xl/worksheets/sheet1.xml'), 'Lipsește foaia de calcul.');
$expect(str_contains($xlsx, 'NIR-2026-0001'), 'Lipsesc datele NIR din foaia de calcul.');
$expect(str_ends_with($xlsx, "\x00\x00"), 'Arhiva XLSX nu are închiderea așteptată.');

$pdf = shopNirBuildPdf($document);
$expect(str_starts_with($pdf, '%PDF-1.4'), 'Exportul PDF nu are antet valid.');
$expect(str_contains($pdf, 'NIR-2026-0001'), 'Lipsesc datele NIR din PDF.');
$expect(str_ends_with($pdf, '%%EOF'), 'Exportul PDF nu este închis corect.');

if ($failures) {
    fwrite(STDERR, "NIR export: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "NIR export: PDF și XLSX valide fără dependența ZipArchive.\n";
