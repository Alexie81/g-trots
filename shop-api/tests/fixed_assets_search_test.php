<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/nir-domain.php';
require_once dirname(__DIR__) . '/nir-service.php';
require_once dirname(__DIR__) . '/fixed-assets-service.php';

function expectFixedAssetSearch(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
    throw new RuntimeException('fixed_assets_search_test requires pdo_sqlite; database checks must not silently pass.');
}

$db = new PDO('sqlite::memory:', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
GtrotsFixedAssets::ensureSchema($db);
$user = ['display_name' => 'Search test'];
$add = static function (string $name, string $series, string $number, string $date, string $type = 'factura') use ($db, $user): string {
    $document = GtrotsFixedAssets::create($db, [
        'document' => ['document_date' => $date, 'document_type' => $type, 'series' => $series, 'document_number' => $number],
        'lines' => [['product_name' => $name, 'quantity' => 3, 'unit_price' => 100, 'vat_rate' => 21]],
    ], $user);
    return (string)$document['lines'][0]['id'];
};
$search = static fn(string $query, array $filters = []): array => GtrotsFixedAssets::list($db, ['search' => $query, 'page_size' => 100] + $filters);
$ids = static fn(array $registry): array => array_column($registry['items'], 'id');
$sameIds = static function (array $actual, array $expected, string $message): void {
    sort($actual);
    sort($expected);
    expectFixedAssetSearch($actual === $expected, $message);
};

$station = $add('Stație pentru diagnoză', 'MF', '003', '2026-09-01');
$phone = $add('Telefon', 'MF', '001', '2026-09-02');
$smartphone = $add('Smartphone', 'MF', '002', '2026-09-03', 'bon');
$laptop = $add('Laptop', 'LAP', '010', '2026-09-04');
$notebook = $add('Notebook', 'LAP', '011', '2026-09-05', 'pv');
$printer = $add('Imprimantă', 'PRINT', '201', '2026-09-06');
$englishPrinter = $add('Printer', 'PRINT', '202', '2026-09-07', 'bon');
$t14 = $add('Laptop Lenovo T14', 'MOD', '314', '2026-09-08');
$t15 = $add('Laptop Lenovo T15', 'MOD', '315', '2026-09-09');
$stand = $add('Suport monitor', 'SUP', '91', '2026-09-10');

$sameIds($ids($search('STATIE DIAGNOZA')), [$station], 'Search must ignore Romanian diacritics and case.');
$sameIds($ids($search('diagnoză pentru stație')), [$station], 'Meaningful words can appear in reverse order, with stopwords.');

$notebookResults = $ids($search('notebook'));
$sameIds($notebookResults, [$laptop, $notebook, $t14, $t15], 'Notebook must find relevant laptop assets.');
expectFixedAssetSearch($notebookResults[0] === $notebook, 'The exact Notebook name must outrank laptop aliases, even when newer.');
$laptopResults = $ids($search('laptop'));
$sameIds($laptopResults, [$laptop, $notebook, $t14, $t15], 'Laptop must find notebook assets too.');
expectFixedAssetSearch($laptopResults[0] === $laptop, 'An exact product name must precede longer names and aliases.');

$phoneResults = $ids($search('telefon'));
$sameIds($phoneResults, [$phone, $smartphone], 'Telefon and smartphone must be compatible search terms.');
expectFixedAssetSearch($phoneResults[0] === $phone, 'The older exact Telefon result must outrank the newer Smartphone alias.');
$smartphoneResults = $ids($search('smartphone'));
$sameIds($smartphoneResults, [$phone, $smartphone], 'The smartphone alias must work in both directions.');
expectFixedAssetSearch($smartphoneResults[0] === $smartphone, 'An exact Smartphone name must be ranked first.');

$printerResults = $ids($search('printer'));
$sameIds($printerResults, [$printer, $englishPrinter], 'Printer must find Romanian imprimantă assets.');
expectFixedAssetSearch($printerResults[0] === $englishPrinter, 'Exact Printer must precede its Romanian alias.');
$sameIds($ids($search('imprimanta')), [$printer, $englishPrinter], 'Romanian imprimantă must also find Printer.');
$typoResults = $ids($search('imprimnta'));
expectFixedAssetSearch(in_array($printer, $typoResults, true), 'One missing letter in a long alphabetic word should be tolerated.');

expectFixedAssetSearch($search('telefon imprimanta')['total'] === 0, 'Every meaningful word must match; a phone alone is not a phone-and-printer result.');
expectFixedAssetSearch($search('laptop lenovo necunoscut')['total'] === 0, 'The search must not silently drop an unmatched meaningful term.');
$sameIds($ids($search('MF-001')), [$phone], 'Full document numbers must not match neighbouring numbers.');
$sameIds($ids($search('mf 001')), [$phone], 'Spaces may replace document separators.');
$sameIds($ids($search('MF001')), [$phone], 'Compact document references must match the same document.');
$sameIds($ids($search('telefon 001')), [$phone], 'Mixed name/number search must require the exact document number.');
expectFixedAssetSearch($search('MF-004')['total'] === 0, 'A nonexistent document number must not be corrected to a nearby number.');
$sameIds($ids($search('laptop T14')), [$t14], 'An alphanumeric model must not match its neighbouring model.');
expectFixedAssetSearch($search('laptop T16')['total'] === 0, 'A nonexistent model number must not match T14 or T15.');
foreach (['%', '_', '%__', '  % _  '] as $query) {
    expectFixedAssetSearch($search($query)['total'] === 0, 'Punctuation-only queries must not behave as SQL wildcards: ' . $query);
}

$sameIds($ids($search('telefon', ['type' => 'bon'])), [$smartphone], 'Document type filters must still restrict semantic results.');
$sameIds($ids($search('notebook', ['from' => '2026-09-05', 'to' => '2026-09-05'])), [$notebook], 'Date filters must be applied before ranking and counting.');
expectFixedAssetSearch($search('telefon', ['type' => 'pv'])['total'] === 0, 'Semantic matches cannot bypass a nonmatching document type.');
$all = $search('   ');
expectFixedAssetSearch($all['total'] === 10, 'Blank search must retain every registered asset.');
expectFixedAssetSearch($ids($all) === [$stand, $t15, $t14, $englishPrinter, $printer, $notebook, $laptop, $smartphone, $phone, $station], 'Blank search must preserve descending document chronology.');

// A document series can be a Romanian stopword; it remains meaningful in a reference.
$seriesA = $add('Perforator documente', 'A', '001', '2026-09-11');
$seriesB = $add('Biblioraft birou', 'B', '001', '2026-09-12');
$sameIds($ids($search('A-001')), [$seriesA], 'Reference search must not discard series A as a Romanian stopword.');
$sameIds($ids($search('a 001')), [$seriesA], 'A spaced document reference must preserve short alphabetic series too.');

// Search and export must select the same assets while retaining every disposal.
GtrotsFixedAssets::dispose($db, $phone, ['disposal_date' => '2026-09-20', 'quantity' => -1, 'reason' => 'First test disposal'], $user);
GtrotsFixedAssets::dispose($db, $phone, ['disposal_date' => '2026-09-21', 'quantity' => -1, 'reason' => 'Second test disposal'], $user);
$exportRows = new ReflectionMethod(GtrotsFixedAssets::class, 'exportRows');
$exported = $exportRows->invoke(null, $db, ['search' => 'smartphone']);
$sameIds(array_values(array_unique(array_column($exported, 'asset_id'))), $ids($search('smartphone')), 'Filtered export must select the same semantic matches as the register.');
$exportedPhone = array_values(array_filter($exported, static fn(array $row): bool => $row['asset_id'] === $phone));
expectFixedAssetSearch(count($exportedPhone) === 2, 'Search filtering must retain both disposal rows for the matched asset.');
expectFixedAssetSearch(array_column($exportedPhone, 'continuation') === [false, true], 'Only subsequent disposal rows are continuation rows in the export.');

// Matches beyond page one must affect total, pagination, and relevance sorting.
$chairIds = [];
for ($index = 0; $index < 32; $index++) {
    $date = '2026-10-' . str_pad((string)(1 + ($index % 28)), 2, '0', STR_PAD_LEFT);
    $chairIds[] = $add('Scaun atelier', 'CHAIR', (string)(1000 + $index), $date);
}
$firstPage = GtrotsFixedAssets::list($db, ['search' => 'atelier scaun', 'page' => 1, 'page_size' => 25]);
$secondPage = GtrotsFixedAssets::list($db, ['search' => 'atelier scaun', 'page' => 2, 'page_size' => 25]);
expectFixedAssetSearch($firstPage['total'] === 32 && $secondPage['total'] === 32, 'The total must include all matching pages.');
expectFixedAssetSearch($firstPage['total_pages'] === 2 && $secondPage['total_pages'] === 2, 'There must be two pages for 32 results with page size 25.');
expectFixedAssetSearch(count($firstPage['items']) === 25 && count($secondPage['items']) === 7, 'Pagination must happen after matching.');
$sameIds([...$ids($firstPage), ...$ids($secondPage)], $chairIds, 'Pages must contain every match exactly once, without overlaps.');
$again = GtrotsFixedAssets::list($db, ['search' => 'atelier scaun', 'page' => 2, 'page_size' => 25]);
expectFixedAssetSearch($ids($again) === $ids($secondPage), 'Equal relevance must have stable pagination.');
$sameIds($ids($search('diagnoza')), [$station], 'An old match outside the initial unfiltered page must remain searchable.');

echo "fixed_assets_search_test: ok (relevance, aliases, identifiers, filters, pagination, exports)\n";
