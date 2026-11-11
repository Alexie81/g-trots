<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/nir-domain.php';
require_once dirname(__DIR__) . '/nir-service.php';
require_once dirname(__DIR__) . '/fixed-assets-export.php';

function checkAssetExport(bool $ok, string $message): void
{
    if (!$ok) throw new RuntimeException($message);
}

$company = ['legal_name' => 'G-Trots • Societate demonstrativă', 'cui' => 'TEST', 'registration_number' => 'DOCUMENT DEMO', 'address' => 'Adresă demonstrativă, București'];
$base = ['document_date' => '2026-11-10', 'document_type' => 'factura', 'series' => 'MF', 'document_number' => '101',
    'product_name' => 'Calculator diagnoză & echipamente atelier', 'quantity' => 2, 'unit_price' => 1000.50, 'net_value' => 2001,
    'vat_rate' => 21, 'vat_value' => 420.21, 'total_value' => 2421.21,
    'disposal_date' => '2026-11-12', 'disposed_quantity' => -1, 'disposal_reason' => 'Uzură fizică; înlocuirea componentelor nu este justificată.'];
$continued = array_merge($base, ['continuation' => true, 'disposal_date' => '2026-12-01', 'disposal_reason' => 'A doua casare, ulterioară perioadei documentului.']);
$rows = [$base, $continued];
$totals = GtrotsFixedAssetExport::totals($rows);
checkAssetExport($totals['count'] === 1 && $totals['total'] === 2421.21, 'Casările multiple nu trebuie să dubleze valorile bunului.');
$rows[] = array_merge($base, ['product_name' => 'Bun fără casări', 'quantity' => 3.25, 'unit_price' => 100,
    'net_value' => 325, 'vat_value' => 68.25, 'total_value' => 393.25,
    'disposal_date' => null, 'disposed_quantity' => null, 'disposal_reason' => null]);
$range = ['from' => '2026-11-01', 'to' => '2026-11-30'];
$xlsx = GtrotsFixedAssetExport::xlsx($rows, $range, $company);
$tmp = tempnam(sys_get_temp_dir(), 'mf-xlsx-');
file_put_contents($tmp, $xlsx);
$zip = new ZipArchive();
checkAssetExport($zip->open($tmp) === true, 'XLSX invalid.');
for ($i = 0; $i < $zip->numFiles; $i++) {
    $name = $zip->getNameIndex($i);
    if (str_ends_with($name, '.xml') || str_ends_with($name, '.rels')) checkAssetExport(simplexml_load_string($zip->getFromIndex($i)) !== false, 'XML invalid: ' . $name);
}
$sheet = simplexml_load_string($zip->getFromName('xl/worksheets/sheet1.xml'));
$sheet->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
checkAssetExport((float)$sheet->xpath('//s:c[@r="K10"]/s:v')[0] === 2421.21, 'Valoarea inițială lipsește.');
checkAssetExport(count($sheet->xpath('//s:c[@r="K11"]/s:v')) === 0, 'Rândul unei casări suplimentare trebuie să lase totalul gol.');
checkAssetExport((string)$sheet->xpath('//s:c[@r="K13"]/s:f')[0] === 'SUM(K10:K12)', 'Formula totalului este incorectă.');
checkAssetExport((float)$sheet->xpath('//s:c[@r="M11"]/s:v')[0] === -1.0, 'Cantitatea casată trebuie să rămână numerică și negativă.');
checkAssetExport((string)$sheet->xpath('//s:c[@r="N9"]/s:is/s:t')[0] === 'Cantitate actuală', 'Cantitatea actuală trebuie să fie imediat după cantitatea casată.');
checkAssetExport((float)$sheet->xpath('//s:c[@r="N10"]/s:v')[0] === 1.0, 'Prima casare trebuie să arate cantitatea rămasă atunci, nu soldul final.');
checkAssetExport((float)$sheet->xpath('//s:c[@r="N11"]/s:v')[0] === 0.0, 'A doua casare trebuie să scadă din cantitatea rămasă anterior.');
checkAssetExport((float)$sheet->xpath('//s:c[@r="N12"]/s:v')[0] === 3.25, 'Fără casări, cantitatea actuală trebuie să fie cantitatea inițială, inclusiv fracții.');
checkAssetExport((string)$sheet->xpath('//s:c[@r="O9"]/s:is/s:t')[0] === 'Motivul casării', 'Motivul casării trebuie păstrat după noua coloană.');
checkAssetExport((string)$sheet->xpath('//s:pane')[0]['ySplit'] === '9', 'Antetul Excel nu este fixat.');
checkAssetExport((string)$sheet->xpath('//s:autoFilter')[0]['ref'] === 'A9:O12', 'Filtrele Excel nu acoperă toate cele 15 coloane.');
checkAssetExport(str_contains($zip->getFromName('xl/workbook.xml'), '_xlnm.Print_Titles'), 'Antetul nu se repetă la tipărire.');
checkAssetExport(str_contains($zip->getFromName('xl/workbook.xml'), '$A$1:$O$'), 'Zona de tipărire nu include ultima coloană.');
$zip->close();
unlink($tmp);

$html = GtrotsFixedAssetExport::html($rows, $range, $company);
checkAssetExport(str_contains($html, 'Calculator diagnoză &amp; echipamente atelier'), 'Textele HTML trebuie escapate.');
checkAssetExport(str_contains($html, '01.12.2026'), 'Istoricul complet trebuie să includă și casarea ulterioară.');
$dom = new DOMDocument();
@$dom->loadHTML($html);
$xpath = new DOMXPath($dom);
checkAssetExport($xpath->query('//table[@class="items"]/thead/tr/th')->length === 15, 'PDF-ul trebuie să aibă 15 coloane.');
checkAssetExport($xpath->query('//table[@class="items"]/thead/tr/th[14]')->item(0)->textContent === 'Cantitate actuală', 'Ordinea coloanelor PDF nu corespunde Excel-ului.');
foreach (['1', '0', '3,25'] as $index => $expected) {
    $actual = $xpath->query('//table[@class="items"]/tbody/tr[' . ($index + 1) . ']/td[14]')->item(0)->textContent;
    checkAssetExport($actual === $expected, 'PDF-ul trebuie să păstreze cantitatea rămasă după fiecare casare și pentru bunurile fără casări.');
}
$pdf = GtrotsFixedAssetExport::pdf($rows, $range, $company);
checkAssetExport(str_starts_with($pdf, '%PDF-'), 'PDF invalid.');

// Optional artifacts for visual QA. All values are fictional.
if ($dir = getenv('GT_FIXED_ASSET_EXPORT_DIR')) {
    if (!is_dir($dir)) mkdir($dir, 0777, true);
    file_put_contents($dir . '/mijloace-fixe.xlsx', $xlsx);
    file_put_contents($dir . '/mijloace-fixe.pdf', $pdf);
    $many = [];
    for ($i = 1; $i <= 35; $i++) {
        $many[] = array_merge($base, ['document_number' => (string)$i, 'product_name' => 'Echipament atelier ' . $i . ' — șurubelniță electrică profesională', 'disposal_reason' => $i === 15 ? str_repeat('Uzură fizică și funcțională. ', 33) : $base['disposal_reason']]);
    }
    file_put_contents($dir . '/mijloace-fixe-multipage.pdf', GtrotsFixedAssetExport::pdf($many, $range, $company));
    file_put_contents($dir . '/mijloace-fixe-multipage.xlsx', GtrotsFixedAssetExport::xlsx($many, $range, $company));
}
echo "fixed_assets_export_test: ok\n";
