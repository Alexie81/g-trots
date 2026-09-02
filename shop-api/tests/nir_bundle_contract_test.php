<?php
declare(strict_types=1);

require_once __DIR__ . '/../nir-service.php';
require_once __DIR__ . '/../nir-bundle.php';

$api = (string)file_get_contents(__DIR__ . '/../api.php');
$mobile = (string)file_get_contents(dirname(__DIR__, 2) . '/components/ShopNirManager.tsx');
$desktop = (string)file_get_contents(dirname(__DIR__, 2) . '/electron-app/renderer/js/shop-commerce.js');
$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void { if (!$condition) $failures[] = $message; };

foreach (['downloadNirBundle', 'downloadNirRegistryBundle', 'getNirExportEstimate', 'include_documents'] as $needle) {
    $expect(str_contains($api, $needle), "API nu expune contractul {$needle}.");
}
foreach (['all', 'year', 'six_months', 'three_months', 'last_month', 'current_month', 'custom'] as $period) {
    $expect(str_contains($mobile, "value: '{$period}'") && str_contains($desktop, "['{$period}',"), "Perioada {$period} lipsește dintr-una dintre aplicații.");
}
foreach (['downloadNirBundle', 'downloadNirRegistryBundle'] as $action) {
    $expect(str_contains($mobile, $action) && str_contains($desktop, $action), "Acțiunea {$action} nu este conectată pe mobil și desktop.");
}
$expect(str_contains($mobile, 'NirExportProgressModal') && str_contains($mobile, 'Timp estimat rămas'), 'Mobilul nu afișează progresul și timpul estimat al exportului.');
$expect(str_contains($desktop, 'shop-nir-export-progress-dialog') && str_contains($desktop, 'Timp estimat rămas'), 'Desktopul nu afișează progresul și timpul estimat al exportului.');
$expect(str_contains($desktop, 'getNirExportEstimate') && str_contains($mobile, 'getNirExportEstimate'), 'Estimarea volumului nu este cerută în ambele aplicații.');

$documents = [[
    'document_number' => 'NIR-2026-000154', 'document_type' => 'NIR RECEPȚIE', 'status_label' => 'CONFIRMAT',
    'nir_date' => '2026-09-02', 'nir_time' => '10:15:00', 'reception_date' => '2026-09-02', 'reception_time' => '10:10:00',
    'supplier_name' => 'KIDOTOYS SRL', 'supplier_cui' => 'RO42489094', 'supplier_invoice_series' => 'FS',
    'supplier_invoice_number' => '20260001', 'supplier_invoice_date' => '2026-09-01', 'warehouse_name' => 'Gestiune principală',
    'currency' => 'RON', 'exchange_rate' => 1, 'exchange_rate_date' => '2026-09-02', 'line_count' => 4,
    'invoiced_quantity' => 9, 'received_quantity' => 9, 'accepted_quantity' => 8, 'rejected_quantity' => 1,
    'quantity_difference' => -1, 'subtotal' => 4970, 'vat_total' => 1043.70, 'grand_total' => 6013.70,
    'subtotal_ron' => 4970, 'vat_total_ron' => 1043.70, 'grand_total_ron' => 6013.70,
    'inventory_cost_total_ron' => 4970, 'total_difference_ron' => 0, 'attachment_count' => 2,
    'notes' => 'Recepție verificată.', 'confirmed_at' => '2026-09-02 10:20:00', 'confirmed_by' => 'Alexie',
    'created_at' => '2026-09-02 10:00:00', 'created_by' => 'Alexie',
]];
$xlsx = shopNirBuildRegistryXlsx($documents, '2026-09-01', '2026-09-02', ['name' => 'Alexie']);
$expect(str_starts_with($xlsx, "PK\x03\x04"), 'Registrul XLSX nu are antet ZIP valid.');
foreach (['G-TROTS · REGISTRU DETALIAT NIR', 'DOCUMENTE  ·  1', 'TOTAL CU TVA', 'Număr NIR', 'TVA RON', 'Documente atașate'] as $needle) {
    $expect(str_contains($xlsx, $needle), "Registrului XLSX îi lipsește elementul {$needle}.");
}
$expect(str_contains($xlsx, 'drawing1.xml') && str_contains($xlsx, 'gtrots-logo'), 'Registrul XLSX nu include logo-ul G-Trots ca imagine OOXML.');
$expect(str_contains($xlsx, '<autoFilter ref="A6:AL7"/>'), 'Registrul XLSX nu are filtrul tabelului pe zona corectă.');
$expect(str_contains($xlsx, 'xSplit="2" ySplit="6"'), 'Registrul XLSX nu fixează antetul și identificatorii la navigare.');
$expect((bool)preg_match('/<c r="F7" s="30"><v>0\.427083333333<\/v><\/c>/', $xlsx), 'Ora NIR nu este salvată ca valoare Excel formatată HH:mm:ss.');
$expect((bool)preg_match('/<c r="H7" s="30"><v>0\.423611111111<\/v><\/c>/', $xlsx), 'Ora recepției nu este salvată ca valoare Excel formatată HH:mm:ss.');

if ($failures) {
    fwrite(STDERR, "Export NIR: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}
echo "Export NIR validat: perioade identice, XLSX detaliat cu logo și arhive conectate pe mobil și desktop.\n";
