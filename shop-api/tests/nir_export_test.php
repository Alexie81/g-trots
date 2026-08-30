<?php
declare(strict_types=1);

require_once __DIR__ . '/../nir-domain.php';
require_once __DIR__ . '/../nir-service.php';
require_once __DIR__ . '/../nir-pdf.php';

$document = [
    'id' => '00000000-0000-4000-8000-000000000099',
    'nir_number' => 'NIR-2026-000001',
    'temporary_number' => 'TEMP-1',
    'nir_date' => '2026-08-29',
    'reception_date' => '2026-08-29',
    'supplier_name' => 'Furnizor test',
    'warehouse_name' => 'Gestiune principală',
    'supplier_invoice_series' => 'INV',
    'supplier_invoice_number' => '190',
    'supplier_invoice_date' => '2026-08-29',
    'currency' => 'EUR',
    'exchange_rate' => '5.100000',
    'exchange_rate_date' => '2026-08-28',
    'subtotal_ron' => '127.50',
    'vat_total_ron' => '26.27',
    'grand_total_ron' => '153.77',
    'subtotal' => '25.00',
    'vat_total' => '5.15',
    'grand_total' => '30.15',
    'inventory_cost_total_ron' => '127.50',
    'total_difference_ron' => '0.00',
    'status' => 'confirmed',
    'source_type' => 'manual',
    'row_version' => 3,
    'confirmed_at' => '2026-08-29 14:30:00',
    'confirmed_by' => 'Administrator',
    'lines' => [[
        'line_number' => 1,
        'supplier_product_code' => 'ABC-1',
        'supplier_product_name' => 'Produs test',
        'product_name' => 'Produs intern cu diacritice Șină și Țeavă',
        'product_sku' => 'SKU-ABC-1',
        'invoiced_quantity' => '2',
        'received_quantity' => '2',
        'accepted_quantity' => '2',
        'rejected_quantity' => '0',
        'purchase_unit' => 'buc',
        'stock_unit' => 'buc',
        'conversion_factor' => '1',
        'unit_price' => '10.00',
        'discount_percent' => '0',
        'vat_rate' => '21.00',
        'line_net' => '20.00',
        'line_vat' => '4.20',
        'line_net_ron' => '102.00',
        'line_vat_ron' => '21.42',
        'line_total_ron' => '123.42',
        'inventory_unit_cost_ron' => '51.00',
        'inventory_cost_total_ron' => '102.00',
        'resolution_status' => 'matched_code',
    ], [
        'line_number' => 2,
        'supplier_product_code' => 'XYZ-2',
        'supplier_product_name' => 'Produs care nu este selectat la storno',
        'product_name' => 'Produs intern păstrat integral',
        'product_sku' => 'SKU-NESELECTAT-2',
        'invoiced_quantity' => '1',
        'received_quantity' => '1',
        'accepted_quantity' => '1',
        'rejected_quantity' => '0',
        'purchase_unit' => 'buc',
        'stock_unit' => 'buc',
        'conversion_factor' => '1',
        'unit_price' => '5.00',
        'discount_percent' => '0',
        'vat_rate' => '19.00',
        'line_net' => '5.00',
        'line_vat' => '0.95',
        'line_net_ron' => '25.50',
        'line_vat_ron' => '4.85',
        'line_total_ron' => '30.35',
        'inventory_unit_cost_ron' => '25.50',
        'inventory_cost_total_ron' => '25.50',
        'resolution_status' => 'matched_name',
    ]],
    'pdf_context' => [
        'template' => 'entry',
        'company' => ['legal_name' => 'CAB IT EXPERT SRL', 'trade_name' => 'G-Trots România', 'cui' => '49972605', 'registration_number' => 'J2024008303400', 'email' => 'contact@g-trots.ro'],
        'supplier' => ['name' => 'Furnizor test', 'cui' => 'RO1234567', 'country' => 'România'],
        'warehouse' => ['name' => 'Gestiune principală', 'code' => 'MAIN'],
        'relationship' => ['original' => null, 'reversal' => null, 'reason' => null],
        'attachments' => [['id' => 'attachment-1', 'original_name' => 'factură-test.pdf', 'mime_type' => 'application/pdf', 'file_size' => 2048, 'sha256' => str_repeat('a', 64), 'created_at' => '2026-08-29 12:00:00']],
        'audit' => [['action_type' => 'NIR_CONFIRMED', 'actor_name' => 'Administrator', 'created_at' => '2026-08-29 14:30:00']],
        'summary' => ['line_count' => 2],
        'generation' => ['generated_at' => '2026-08-30 15:00:00', 'generated_by' => 'Administrator', 'app' => 'G-Trots Management', 'data_fingerprint' => str_repeat('b', 64)],
    ],
];

$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$xlsx = shopNirBuildXlsx($document);
$expect(str_starts_with($xlsx, "PK\x03\x04"), 'XLSX nu începe cu antet ZIP.');
$expect(str_contains($xlsx, '[Content_Types].xml'), 'Lipsește manifestul OOXML.');
$expect(str_contains($xlsx, 'xl/worksheets/sheet5.xml'), 'Lipsesc foile premium ale registrului de lucru.');
$expect(str_contains($xlsx, 'NIR-2026-000001'), 'Lipsește numărul NIR complet, în formatul cu șase cifre.');
$expect(str_contains($xlsx, 'Cost unitar de intrare fără TVA'), 'Antetul costului contabil lipsește din XLSX.');
$expect(str_contains($xlsx, 'Dicționar câmpuri'), 'Lipsește dicționarul câmpurilor XLSX.');
$expect(str_contains($xlsx, 'state="frozen"'), 'Antetul pozițiilor nu este înghețat.');
$expect(!str_contains($xlsx, 'FIFO'), 'XLSX nu trebuie să afișeze terminologia FIFO.');
$expect(!str_contains(mb_strtolower($xlsx, 'UTF-8'), 'respins'), 'XLSX nu trebuie să afișeze câmpuri sau etichete de respingere.');
$expect(!str_contains(mb_strtolower($xlsx, 'UTF-8'), 'rejected'), 'XLSX nu trebuie să afișeze denumirile tehnice vechi ale câmpurilor de respingere.');
$expect(str_ends_with($xlsx, "\x00\x00"), 'Arhiva XLSX nu are închiderea așteptată.');
$expect(shopNirXlsxFileName($document) === 'NIR_G-Trots_NIR-2026_000001_2026-08-29.xlsx', 'Numele fișierului XLSX nu respectă convenția contabilă.');

$legacyOriginal = $document;
$legacyOriginal['status'] = 'reversed';
$legacyOriginal['pdf_context']['template'] = 'reversal';
$legacyOriginalXlsx = shopNirBuildXlsx($legacyOriginal);
$expect(str_contains($legacyOriginalXlsx, 'CONFIRMAT'), 'Originalul legacy trebuie afișat în continuare ca NIR confirmat.');
$expect(shopNirPremiumXlsxDocumentType($legacyOriginal) === 'INTRARE NIR', 'Template-ul legacy nu trebuie să transforme originalul în document de storno.');
$expect(shopNirPremiumXlsxStatus($legacyOriginal) === 'CONFIRMAT', 'Statusul legacy reversed trebuie prezentat drept CONFIRMAT pe original.');
$legacyMode = shopNirPdfMode($legacyOriginal, $legacyOriginal['pdf_context']);
$legacyPdfStatus = shopNirPdfStatus($legacyOriginal, $legacyMode);
$expect($legacyMode === 'entry_reversed' && $legacyPdfStatus[0] === 'CONFIRMAT' && $legacyPdfStatus[1] === 'green', 'PDF-ul original legacy trebuie să rămână CONFIRMAT verde.');

$pdf = shopNirBuildPdf($document);
$expect(str_starts_with($pdf, '%PDF-'), 'Exportul PDF nu are antet valid.');
$expect(strlen($pdf) > 20000, 'Exportul PDF premium este neașteptat de mic.');
$expect((bool)preg_match('/\/Type\s*\/Page\b/', $pdf), 'Exportul PDF nu conține pagini valide.');
$expect(str_ends_with(rtrim($pdf), '%%EOF'), 'Exportul PDF nu este închis corect.');

$reversal = $document;
$reversal['id'] = '00000000-0000-4000-8000-000000000100';
$reversal['nir_number'] = 'NIR-2026-000002';
$reversal['source_type'] = 'reversal';
$reversal['reversal_of_id'] = $document['id'];
$reversal['supplier_invoice_number'] = '191';
$reversal['supplier_invoice_date'] = '2026-08-30';
$reversal['nir_date'] = '2026-08-30';
$reversal['subtotal'] = '-10.00';
$reversal['vat_total'] = '-2.10';
$reversal['grand_total'] = '-12.10';
$reversal['subtotal_ron'] = '-51.00';
$reversal['vat_total_ron'] = '-10.71';
$reversal['grand_total_ron'] = '-61.71';
$reversal['inventory_cost_total_ron'] = '-51.00';
$reversal['lines'] = [$document['lines'][0]];
$reversal['lines'][0]['invoiced_quantity'] = '-1';
$reversal['lines'][0]['received_quantity'] = '-1';
$reversal['lines'][0]['accepted_quantity'] = '-1';
$reversal['lines'][0]['line_net'] = '-10.00';
$reversal['lines'][0]['line_vat'] = '-2.10';
$reversal['lines'][0]['line_net_ron'] = '-51.00';
$reversal['lines'][0]['line_vat_ron'] = '-10.71';
$reversal['lines'][0]['line_total_ron'] = '-61.71';
$reversal['lines'][0]['inventory_cost_total_ron'] = '-51.00';
$reversal['pdf_context']['template'] = 'reversal';
$reversal['pdf_context']['summary'] = ['line_count' => 2]; // context vechi intenționat: exportul trebuie să folosească numai linia curentă.
$reversal['pdf_context']['relationship'] = [
    'original' => [
        'nir_number' => $document['nir_number'],
        'nir_date' => $document['nir_date'],
        'supplier_invoice_series' => $document['supplier_invoice_series'],
        'supplier_invoice_number' => $document['supplier_invoice_number'],
        'supplier_invoice_date' => $document['supplier_invoice_date'],
        'confirmed_at' => $document['confirmed_at'],
    ],
    'original_invoice' => ['series' => 'INV', 'number' => '190', 'date' => '2026-08-29'],
    'reversal' => ['nir_number' => $reversal['nir_number']],
    'reason' => 'Produse returnate furnizorului prin reversare legacy',
];
$stornoXlsx = shopNirBuildXlsx($reversal);
$expect(str_contains($stornoXlsx, 'STORNARE NIR'), 'XLSX-ul documentului negativ nu este etichetat drept stornare.');
$expect(str_contains($stornoXlsx, 'STORNAT'), 'XLSX-ul documentului negativ nu are statusul STORNAT.');
$expect(str_contains($stornoXlsx, 'INV 191') && str_contains($stornoXlsx, '2026-08-30'), 'XLSX-ul de storno trebuie să folosească factura nouă 191 și data ei ca document sursă.');
$expect(str_contains($stornoXlsx, 'Stornează factura INV 190 din data 29.08.2026, NIR original NIR-2026-000001'), 'XLSX-ul nu separă trasabilitatea facturii originale 190 de factura storno 191.');
$expect(str_contains($stornoXlsx, 'SKU-ABC-1') && !str_contains($stornoXlsx, 'SKU-NESELECTAT-2'), 'Storno parțial trebuie să exporte numai poziția selectată.');
$stornoVisible = mb_strtoupper($stornoXlsx, 'UTF-8');
foreach (['REVERSARE', 'REVERSAT', 'REVERSAL', 'REVERSED', 'STORNO', 'RESPINS', 'REJECTED', 'REV-2026-'] as $forbidden) {
    $expect(!str_contains($stornoVisible, $forbidden), "XLSX-ul de storno conține termenul vizibil interzis: {$forbidden}.");
}
$expect(shopNirPremiumXlsxDocumentType($reversal) === 'STORNARE NIR' && shopNirPremiumXlsxStatus($reversal) === 'STORNAT', 'Numai documentul negativ structural trebuie identificat ca STORNAT.');
$stornoMode = shopNirPdfMode($reversal, $reversal['pdf_context']);
$stornoRelationship = shopNirPdfRelationship($reversal, $reversal['pdf_context'], $stornoMode);
$stornoCards = shopNirPdfCardsHtml($reversal, $reversal['pdf_context']);
$stornoBanner = shopNirPdfRelationshipBanner($stornoRelationship, $stornoMode);
$expect($stornoMode === 'reversal' && shopNirPdfStatus($reversal, $stornoMode)[0] === 'STORNAT', 'PDF-ul negativ structural trebuie identificat ca STORNAT.');
$expect(str_contains($stornoCards, 'Factura INV 191') && str_contains($stornoCards, '30.08.2026'), 'Cardul Document sursă din PDF trebuie să afișeze factura nouă 191/data nouă.');
$expect(str_contains($stornoBanner, 'Stornează factura INV 190 din data 29.08.2026, NIR original NIR-2026-000001'), 'Trasabilitatea PDF trebuie să indice distinct factura originală 190 și NIR-ul original.');
$expect(shopNirPdfSummary($reversal, $reversal['pdf_context'])['line_count'] === 1, 'Rezumatul PDF pentru storno parțial trebuie să numere numai pozițiile selectate.');
$expect(str_contains(shopNirPdfMetricsHtml($reversal, shopNirPdfSummary($reversal, $reversal['pdf_context']), $stornoMode), 'CANT. STORNATĂ'), 'Indicatorii PDF trebuie adaptați semantic la cantitatea stornată.');
$expect(str_contains(shopNirPdfTotalsHtml($reversal, $stornoMode), 'Valoare stornată din gestiune'), 'Centralizarea PDF trebuie să explice valoarea stornată, nu o intrare în gestiune.');
$expect(str_contains(shopNirPdfAnnexHtml($reversal, $reversal['pdf_context'], $stornoRelationship, shopNirPdfSummary($reversal, $reversal['pdf_context']), $stornoMode), 'CUM SE INTERPRETEAZĂ DOCUMENTUL DE STORNARE'), 'Anexa PDF trebuie să explice explicit documentul de stornare.');
$reversalPdf = shopNirBuildPdf($reversal);
$expect(str_starts_with($reversalPdf, '%PDF-'), 'PDF-ul de stornare nu are antet valid.');
$expect(strlen($reversalPdf) > 20000 && $reversalPdf !== $pdf, 'PDF-ul de stornare nu este un document premium distinct.');
$expect(str_ends_with(rtrim($reversalPdf), '%%EOF'), 'PDF-ul de stornare nu este închis corect.');

$rendererSource = file_get_contents(__DIR__ . '/../nir-pdf.php');
foreach (['FIFO', 'profit', 'adaos', 'stoc curent', 'MODEL DE PREZENTARE', 'RESPINS', 'Respins', 'respins', 'rejected'] as $forbidden) {
    $expect(!str_contains((string)$rendererSource, $forbidden), "Rendererul PDF conține termenul interzis: {$forbidden}.");
}
foreach (['POZIȚII STORNATE ȘI VALORI CORECTIVE', 'Cant. corectată', 'Cant. stornată', 'Cost unitar stornat RON', 'Valoare stornată RON'] as $expectedStornoLabel) {
    $expect(str_contains((string)$rendererSource, $expectedStornoLabel), "Rendererul PDF nu conține eticheta semantică de stornare: {$expectedStornoLabel}.");
}

if ($failures) {
    fwrite(STDERR, "NIR export: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "NIR export: PDF premium intrare/stornare și XLSX validate.\n";
