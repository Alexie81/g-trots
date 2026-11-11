<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/nir-domain.php';
require_once dirname(__DIR__) . '/nir-service.php';
require_once dirname(__DIR__) . '/fixed-assets-service.php';

function expectFixedAsset(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$xlsxMethod = new ReflectionMethod(GtrotsFixedAssets::class, 'xlsx');
$xlsxMethod->setAccessible(true);
$standaloneXlsx = $xlsxMethod->invoke(null, [[
    'document_date' => '2026-11-10', 'document_type' => 'factura', 'series' => 'MF', 'document_number' => '1001',
    'product_name' => 'Elevator hidraulic atelier', 'quantity' => 2, 'unit_price' => 1000, 'net_value' => 2000,
    'vat_rate' => 19, 'vat_value' => 380, 'total_value' => 2380, 'disposal_date' => '2026-11-11',
    'disposed_quantity' => -1, 'disposal_reason' => 'Uzură tehnică ireparabilă',
]]);
expectFixedAsset(str_starts_with($standaloneXlsx, "PK\x03\x04"), 'Exportul Excel trebuie să fie un pachet XLSX valid.');
expectFixedAsset(str_contains($standaloneXlsx, 'Uzură tehnică ireparabilă'), 'Exportul Excel trebuie să includă motivul casării.');

if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
    echo "fixed_assets_test: export ok; database skipped (pdo_sqlite indisponibil)\n";
    exit(0);
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
GtrotsFixedAssets::ensureSchema($db);

$document = GtrotsFixedAssets::create($db, [
    'document' => [
        'document_date' => '2026-11-10',
        'document_type' => 'factura',
        'series' => 'MF',
        'document_number' => '1001',
        'notes' => 'Test registru mijloace fixe',
    ],
    'lines' => [
        ['product_name' => 'Elevator hidraulic atelier', 'quantity' => 2, 'unit_price' => 1000, 'vat_rate' => 19],
        ['product_name' => 'Calculator diagnoză', 'quantity' => 1, 'unit_price' => 2500, 'vat_rate' => 19],
    ],
    'attachment' => [
        'file_name' => 'factura-test.pdf',
        'mime_type' => 'application/pdf',
        'content_base64' => base64_encode('%PDF-1.4 test'),
    ],
], ['display_name' => 'Test Administrator']);

expectFixedAsset(count($document['lines']) === 2, 'Documentul trebuie să păstreze toate pozițiile.');
$first = $document['lines'][0];
expectFixedAsset((float)$first['net_value'] === 2000.0, 'Valoarea netă trebuie calculată din cantitate și preț.');
expectFixedAsset((float)$first['vat_value'] === 380.0, 'TVA-ul trebuie calculat automat.');
expectFixedAsset((float)$first['total_value'] === 2380.0, 'Totalul trebuie să includă TVA-ul.');

$download = GtrotsFixedAssets::download($db, (string)$document['id']);
expectFixedAsset(base64_decode($download['content_base64'], true) === '%PDF-1.4 test', 'Documentul justificativ trebuie să poată fi descărcat identic.');

$afterDisposal = GtrotsFixedAssets::dispose($db, (string)$first['id'], [
    'disposal_date' => '2026-11-10',
    'quantity' => -1,
    'reason' => 'Uzură tehnică ireparabilă',
], ['display_name' => 'Test Administrator']);
expectFixedAsset((float)$afterDisposal['remaining_quantity'] === 1.0, 'Casarea parțială trebuie să reducă disponibilul.');
expectFixedAsset((float)$afterDisposal['disposal_quantity'] === -1.0, 'Casarea trebuie păstrată cu semn negativ.');

$rejected = false;
try {
    GtrotsFixedAssets::dispose($db, (string)$first['id'], ['disposal_date' => '2026-11-10', 'quantity' => -2, 'reason' => 'Depășire'], ['display_name' => 'Test']);
} catch (ShopNirHttpException $error) {
    $rejected = $error->status === 409;
}
expectFixedAsset($rejected, 'API-ul trebuie să respingă o casare peste cantitatea rămasă.');

$registry = GtrotsFixedAssets::list($db, ['page' => 1, 'page_size' => 25, 'search' => 'Elevator']);
expectFixedAsset($registry['total'] === 1, 'Căutarea trebuie să găsească poziția după denumire.');
expectFixedAsset((float)$registry['items'][0]['disposal_quantity'] === -1.0, 'Registrul trebuie să includă totalul casărilor.');

$excel = GtrotsFixedAssets::export($db, ['from' => '2026-11-01', 'to' => '2026-11-30'], 'xlsx');
$excelBytes = base64_decode($excel['content_base64'], true);
expectFixedAsset(str_starts_with($excelBytes, "PK\x03\x04"), 'Exportul Excel trebuie să fie un pachet XLSX valid.');
expectFixedAsset(str_contains($excelBytes, 'Uzură tehnică ireparabilă'), 'Exportul trebuie să includă motivul casării.');

GtrotsFixedAssets::dispose($db, (string)$first['id'], ['disposal_date' => '2026-12-01', 'quantity' => -1, 'reason' => 'A doua casare'], ['display_name' => 'Test']);
$exportRows = new ReflectionMethod(GtrotsFixedAssets::class, 'exportRows');
$rows = $exportRows->invoke(null, $db, ['from' => '2026-11-01', 'to' => '2026-11-30']);
expectFixedAsset(count($rows) === 3, 'Se păstrează toate casările, inclusiv cele ulterioare perioadei documentului.');
$totals = GtrotsFixedAssetExport::totals($rows);
expectFixedAsset($totals['count'] === 2 && $totals['total'] === 5355.0, 'Valorile bunurilor nu se dublează pentru casări multiple.');
$all = GtrotsFixedAssets::export($db, [], 'xlsx');
expectFixedAsset(str_contains($all['file_name'], 'registru-complet'), 'Exportul trebuie să includă întregul registru.');
foreach ([['from' => '2026-11-01'], ['from' => '2026-11-30', 'to' => '2026-11-01'], ['from' => '2026-02-30', 'to' => '2026-03-01']] as $invalid) {
    $complete = GtrotsFixedAssets::export($db, $invalid, 'xlsx');
    expectFixedAsset($complete['file_name'] === $all['file_name'], 'Parametrii vechi de perioadă nu trebuie să limiteze exportul complet.');
    expectFixedAsset(str_contains(base64_decode($complete['content_base64'], true), 'A doua casare'), 'Exportul complet trebuie să păstreze tot istoricul casărilor.');
}

$storageName = (string)$document['storage_name'];
$storedPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $storageName);
if (is_file($storedPath)) unlink($storedPath);

echo "fixed_assets_test: ok\n";
