<?php
declare(strict_types=1);

require_once __DIR__ . '/../nir-domain.php';
require_once __DIR__ . '/../nir-service.php';
require_once __DIR__ . '/../nir-pdf.php';

$imageDirectory = dirname(__DIR__) . '/uploads/products';
if (!is_dir($imageDirectory)) mkdir($imageDirectory, 0775, true);
$imagePath = $imageDirectory . '/nir-strict-contract-thumbnail.png';
$imageBytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAC0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAfg0wQAABzFhnAAAAAElFTkSuQmCC', true);
if (is_string($imageBytes)) file_put_contents($imagePath, $imageBytes);
$companyImageDirectory = dirname(__DIR__) . '/uploads/company';
if (!is_dir($companyImageDirectory)) mkdir($companyImageDirectory, 0775, true);
$stampPath = $companyImageDirectory . '/nir-strict-contract-stamp.png';
if (is_string($imageBytes)) file_put_contents($stampPath, $imageBytes);

$document = [
    'id' => '00000000-0000-4000-8000-000000000099', 'nir_number' => 'NIR-2026-000001',
    'nir_date' => '2026-08-31', 'reception_date' => '2026-08-31', 'status' => 'confirmed',
    'supplier_name' => 'Furnizor test', 'supplier_cui' => 'RO1234567', 'warehouse_name' => 'Gestiune principală',
    'supplier_invoice_series' => 'INV', 'supplier_invoice_number' => '190', 'supplier_invoice_date' => '2026-08-30',
    'currency' => 'RON', 'confirmed_by' => 'Administrator', 'notes' => 'Ambalaj verificat; recepție conformă.',
    'lines' => [[
        'line_number' => 1, 'supplier_product_code' => 'ABC-1', 'supplier_product_name' => 'Produs furnizor',
        'product_name' => 'Produs intern cu miniatură', 'product_sku' => 'SKU-ABC-1', 'purchase_unit' => 'buc',
        'invoiced_quantity' => '2', 'received_quantity' => '2', 'accepted_quantity' => '2',
        'unit_price' => '10.00', 'discount_percent' => '0', 'vat_rate' => '21.00',
        'product_image_url' => 'uploads/products/nir-strict-contract-thumbnail.png',
    ]],
    'pdf_context' => [
        'company' => ['legal_name' => 'CAB IT EXPERT SRL', 'trade_name' => 'G-Trots România', 'cui' => '49972605', 'registration_number' => 'J2024008303400', 'stamp_path' => 'uploads/company/nir-strict-contract-stamp.png'],
        'supplier' => ['name' => 'Furnizor test', 'cui' => 'RO1234567'],
        'warehouse' => ['name' => 'Gestiune principală', 'address' => 'Str. Exemplu 1', 'city' => 'București'],
        'relationship' => ['original_invoice' => null, 'reason' => null],
        'generation' => ['generated_by' => 'Administrator'],
    ],
];

$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void { if (!$condition) $failures[] = $message; };
$headers = ['Nr. crt.', 'Cod / SKU', 'Imagine', 'Denumirea bunurilor recepționate', 'U.M.', 'Cantitate document', 'Cantitate recepționată', 'Diferență cantitativă', 'Preț unitar fără TVA', 'Valoare fără TVA', 'TVA %', 'Valoare TVA', 'Valoare totală'];

$xlsx = shopNirBuildXlsx($document);
$expect(str_starts_with($xlsx, "PK\x03\x04"), 'XLSX nu are antet ZIP valid.');
$expect(str_contains($xlsx, '<sheet name="NIR" sheetId="1"'), 'XLSX trebuie să conțină o singură foaie NIR.');
$expect(!str_contains($xlsx, 'sheet2.xml'), 'XLSX nu poate conține foi suplimentare.');
foreach ($headers as $header) $expect(str_contains($xlsx, $header), "Lipsește antetul strict: {$header}.");
foreach (['Dicționar câmpuri', 'Documente &amp; Audit', 'Cost unitar de intrare fără TVA', 'ID NIR intern'] as $forbidden) {
    $expect(!str_contains($xlsx, $forbidden), "XLSX conține rubrica suplimentară: {$forbidden}.");
}
$expect(str_contains($xlsx, 'drawing1.xml'), 'XLSX trebuie să includă logo-ul și miniatura prin desen OOXML.');
$expect(str_contains($xlsx, '_xlnm.Print_Titles') && str_contains($xlsx, 'NIR!$12:$12'), 'XLSX trebuie să repete doar antetul tabelului la tipărirea pe mai multe pagini.');

$html = shopNirStrictPdfHtml($document);
$expect(substr_count($html, '<th>') === 13, 'PDF trebuie să aibă exact cele 13 antete de poziții din model.');
foreach ($headers as $header) $expect(str_contains(str_replace('<br>', ' ', $html), $header), "PDF nu conține antetul strict: {$header}.");
foreach (['JURNAL DE AUDIT', 'CENTRALIZARE TVA', 'COST UNITAR DE INTRARE', 'DOCUMENTE ASOCIATE'] as $forbidden) {
    $expect(!str_contains($html, $forbidden), "PDF conține secțiunea suplimentară: {$forbidden}.");
}
$expect(str_contains($html, 'class="product-image"') && str_contains($html, '<th>Imagine</th>'), 'PDF nu include miniatura în coloana separată Imagine.');
$expect(str_contains($html, 'class="company-stamp"'), 'PDF nu include ștampila firmei în locul aprobării.');
$expect(substr_count($html, 'class="inline-icon"') >= 8, 'PDF nu include toate pictogramele din model.');
$expect(substr_count($html, ' lei') >= 7, 'PDF trebuie să afișeze moneda în toate celulele valorice.');
$pdf = shopNirBuildPdf($document);
$expect(str_starts_with($pdf, '%PDF-') && str_ends_with(rtrim($pdf), '%%EOF'), 'PDF-ul rezultat nu este valid.');

$storno = $document;
$storno['nir_number'] = 'NIR-2026-000002'; $storno['source_type'] = 'reversal'; $storno['reversal_of_id'] = $document['id'];
$storno['supplier_invoice_number'] = '191'; $storno['supplier_invoice_date'] = '2026-08-31';
$storno['lines'][0]['invoiced_quantity'] = '-1'; $storno['lines'][0]['received_quantity'] = '-1'; $storno['lines'][0]['accepted_quantity'] = '-1';
$storno['pdf_context']['relationship'] = ['original_invoice' => ['series' => 'INV', 'number' => '190', 'date' => '2026-08-30'], 'reason' => 'Retur către furnizor'];
$stornoXlsx = shopNirBuildXlsx($storno);
$stornoHtml = shopNirStrictPdfHtml($storno);
foreach ([$stornoXlsx, $stornoHtml] as $output) {
    $expect(str_contains($output, 'Stornare'), 'Exportul STORNO nu indică tipul operațiunii.');
    $expect(str_contains($output, 'INV 191') && str_contains($output, 'INV 190'), 'Exportul STORNO nu separă factura curentă de factura inițială.');
}

$multiPage = $document;
$multiPage['lines'] = [];
for ($index = 1; $index <= 28; $index++) {
    $line = $document['lines'][0];
    $line['line_number'] = $index;
    $line['product_sku'] = 'SKU-' . $index;
    $multiPage['lines'][] = $line;
}
$multiPageHtml = shopNirStrictPdfHtml($multiPage);
$expect(substr_count($multiPageHtml, 'NOTĂ DE RECEPȚIE ȘI') === 1, 'PDF multipagină nu trebuie să repete antetul mare al documentului.');
$expect(substr_count($multiPageHtml, '<table class="items">') === 1, 'PDF multipagină trebuie să continue într-un singur tabel.');

if (is_file($imagePath)) unlink($imagePath);
if (is_file($stampPath)) unlink($stampPath);
if ($failures) { fwrite(STDERR, "NIR strict: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n"); exit(1); }
echo "NIR strict validat: aceleași rubrici și 13 coloane în PDF/XLSX, inclusiv STORNO, iconițe, ștampilă și miniaturi.\n";
