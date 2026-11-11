<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/nir-domain.php';
require_once dirname(__DIR__) . '/nir-service.php';
require_once dirname(__DIR__) . '/fixed-assets-service.php';

function checkAssetBundle(bool $ok, string $message): void
{
    if (!$ok) throw new RuntimeException($message);
}

function readAssetArchive(string $bytes): array
{
    $path = tempnam(sys_get_temp_dir(), 'test-mf-archive-');
    $zip = new ZipArchive();
    try {
        file_put_contents($path, $bytes);
        checkAssetBundle($zip->open($path) === true, 'The export must be a valid ZIP container.');
        $entries = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            checkAssetBundle(!array_key_exists($name, $entries), 'Duplicate archive entry: ' . $name);
            $entries[$name] = $zip->getFromIndex($i);
        }
        return $entries;
    } finally {
        if ($zip->status === ZipArchive::ER_OK) $zip->close();
        if (is_file($path)) unlink($path);
    }
}

function assertWholeAssetWorkbook(string $bytes): void
{
    $entries = readAssetArchive($bytes);
    foreach ($entries as $name => $xml) {
        if (str_ends_with($name, '.xml') || str_ends_with($name, '.rels')) {
            checkAssetBundle(simplexml_load_string($xml) !== false, 'Invalid workbook XML: ' . $name);
        }
    }
    $xml = $entries['xl/worksheets/sheet1.xml'];
    foreach (['Stație diagnoză', 'Calculator atelier', 'Imprimantă etichete', 'Scule bon', 'Mobilier PV', 'Casare unu', 'Casare doi', 'Casare trei'] as $text) {
        checkAssetBundle(str_contains($xml, $text), 'The complete workbook is missing: ' . $text);
    }
    checkAssetBundle(str_contains($xml, 'Toată perioada'), 'Export metadata must describe the complete register.');
    $sheet = simplexml_load_string($xml);
    $sheet->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
    $values = $sheet->xpath('//s:row[number(@r) >= 10 and number(@r) <= 16]/s:c[starts-with(@r,"K")]/s:v');
    checkAssetBundle(count($values) === 5, 'Five assets must contribute values exactly once despite multiple disposals.');
    $sum = array_sum(array_map(static fn($value): float => (float)$value, $values));
    checkAssetBundle(abs($sum - 1392.49) < 0.001, 'The complete export must preserve every value, including manually edited VAT.');
    checkAssetBundle((string)$sheet->xpath('//s:c[@r="K17"]/s:f')[0] === 'SUM(K10:K16)', 'Totals must cover every exported row.');
    $quantities = $sheet->xpath('//s:row[number(@r) >= 10 and number(@r) <= 16]/s:c[starts-with(@r,"M")]/s:v');
    checkAssetBundle(count($quantities) === 3 && array_sum(array_map(static fn($value): float => (float)$value, $quantities)) === -6.0, 'The export must retain the full disposal history.');
    $remaining = $sheet->xpath('//s:row[number(@r) >= 10 and number(@r) <= 16]/s:c[starts-with(@r,"N")]/s:v');
    checkAssetBundle(array_map(static fn($value): float => (float)$value, $remaining) === [9.0, 7.0, 4.0, 1.0, 2.0, 1.0, 1.0], 'The current quantity must follow each disposal and retain original quantity for undisposed assets.');
    checkAssetBundle(str_contains($xml, 'Cantitate actuală'), 'The export must identify the current quantity column.');
}

checkAssetBundle(class_exists('ZipArchive'), 'Enable the zip extension to run fixed_assets_bundle_test.');
checkAssetBundle(in_array('sqlite', PDO::getAvailableDrivers(), true), 'Enable pdo_sqlite to run fixed_assets_bundle_test.');
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
GtrotsFixedAssets::ensureSchema($db);
$user = ['display_name' => 'Isolated bundle test'];
$paths = [];
$attachments = [];
$makeFile = static fn(string $name, string $marker): array => ['file_name' => $name, 'mime_type' => 'application/pdf', 'content_base64' => base64_encode('%PDF-1.4 fixture ' . $marker)];
$create = static function (array $document, array $lines, array $files = []) use ($db, $user, &$paths, &$attachments): array {
    $result = GtrotsFixedAssets::create($db, ['document' => $document, 'lines' => $lines, 'attachments' => $files], $user);
    foreach ($result['files'] as $file) {
        $path = dirname(__DIR__) . '/' . $file['storage_name'];
        $paths[] = $path;
        $attachments[$result['id']][] = file_get_contents($path);
    }
    return $result;
};

try {
    $first = $create(['document_date' => '2025-01-10', 'document_type' => 'factura', 'series' => 'MF', 'document_number' => '1001'], [
        ['product_name' => 'Stație diagnoză', 'quantity' => 10, 'unit_price' => 100, 'vat_rate' => 21, 'vat_value' => 209.99],
        ['product_name' => 'Calculator atelier', 'quantity' => 1, 'unit_price' => 50, 'vat_rate' => 21],
    ], [$makeFile('Factura.pdf', 'first'), $makeFile('factura.PDF', 'second'), $makeFile('CON.pdf', 'third')]);
    foreach ([[-1, '2025-01-20', 'Casare unu'], [-2, '2026-01-20', 'Casare doi'], [-3, '2026-11-10', 'Casare trei']] as [$quantity, $date, $reason]) {
        GtrotsFixedAssets::dispose($db, $first['lines'][0]['id'], ['quantity' => $quantity, 'disposal_date' => $date, 'reason' => $reason], $user);
    }
    $duplicate = $create(['document_date' => '2026-02-01', 'document_type' => 'factura', 'series' => 'mf', 'document_number' => '1001'], [
        ['product_name' => 'Imprimantă etichete', 'quantity' => 2, 'unit_price' => 20, 'vat_rate' => 9],
    ], [$makeFile('scan.pdf', 'duplicate-document')]);
    $empty = $create(['document_date' => '2026-05-01', 'document_type' => 'bon', 'series' => '', 'document_number' => '123'], [
        ['product_name' => 'Scule bon', 'quantity' => 1, 'unit_price' => 30, 'vat_rate' => 0],
    ]);
    $legacy = $create(['document_date' => '2026-11-01', 'document_type' => 'pv', 'series' => '../Șantier:*?', 'document_number' => '..\\456/1'], [
        ['product_name' => 'Mobilier PV', 'quantity' => 1, 'unit_price' => 40, 'vat_rate' => 21],
    ], [$makeFile('legacy.pdf', 'legacy-document')]);

    // Recreate the legacy one-file schema state; migration must include its file exactly once.
    $old = $legacy['files'][0];
    $db->prepare('UPDATE shop_fixed_asset_documents SET original_name=?,storage_name=?,mime_type=?,extension=?,file_size=?,sha256=? WHERE id=?')->execute([
        '../fișă:*?\\control.pdf', $old['storage_name'], $old['mime_type'], $old['extension'], $old['file_size'], $old['sha256'], $legacy['id'],
    ]);
    $db->prepare('DELETE FROM shop_fixed_asset_files WHERE document_id=?')->execute([$legacy['id']]);
    GtrotsFixedAssets::ensureSchema($db);
    GtrotsFixedAssets::ensureSchema($db);
    checkAssetBundle(count(GtrotsFixedAssets::getDocument($db, $legacy['id'])['files']) === 1, 'Legacy migration must not duplicate the file.');

    $filters = ['search' => 'does not match any asset', 'document_type' => 'unknown', 'from' => 'invalid', 'to' => '1900-01-01', 'page' => 999, 'page_size' => 1];
    $xlsx = GtrotsFixedAssets::export($db, $filters, 'xlsx');
    checkAssetBundle($xlsx['file_name'] === 'Gestiune-mijloace-fixe-registru-complet.xlsx' && $xlsx['mime_type'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel must identify the full-register workbook.');
    assertWholeAssetWorkbook(base64_decode($xlsx['content_base64'], true));
    $pdf = GtrotsFixedAssets::export($db, $filters, 'pdf');
    checkAssetBundle($pdf['file_name'] === 'Gestiune-mijloace-fixe-registru-complet.pdf' && $pdf['mime_type'] === 'application/pdf', 'PDF must export the full register.');
    checkAssetBundle(str_starts_with(base64_decode($pdf['content_base64'], true), '%PDF-'), 'The standalone PDF must be valid.');

    $bundle = GtrotsFixedAssets::export($db, $filters, 'zip');
    checkAssetBundle($bundle['file_name'] === 'Gestiune-mijloace-fixe-registru-complet.zip' && $bundle['mime_type'] === 'application/zip', 'The bundle must identify itself as ZIP.');
    $entries = readAssetArchive(base64_decode($bundle['content_base64'], true));
    $base = 'Gestiune-mijloace-fixe-registru-complet';
    checkAssetBundle(str_starts_with($entries[$base . '.pdf'] ?? '', '%PDF-'), 'The ZIP must contain its PDF at the root.');
    assertWholeAssetWorkbook($entries[$base . '.xlsx'] ?? '');
    $names = array_keys($entries);
    $foldedNames = array_map(static fn(string $name): string => mb_strtolower($name, 'UTF-8'), $names);
    checkAssetBundle(count(array_unique($foldedNames)) === count($names), 'Files and folders must not collide on case-insensitive systems.');
    $folders = array_values(array_filter($names, static fn(string $name): bool => str_ends_with($name, '/')));
    checkAssetBundle(count($folders) === 4, 'Each document requires exactly one folder, including documents without attachments.');
    checkAssetBundle(in_array('Bon-123/', $folders, true), 'A document without attachments must still have its own folder.');
    $filesByFolder = [];
    foreach ($entries as $name => $bytes) {
        $parts = explode('/', rtrim($name, '/'));
        checkAssetBundle(count($parts) <= 2, 'Document references and filenames must never create nested or traversing paths.');
        foreach ($parts as $part) {
            checkAssetBundle($part !== '' && $part !== '.' && $part !== '..' && !preg_match('/[<>:"\\\\|?*\x00-\x1f]/u', $part), 'Unsafe archive component: ' . $part);
            checkAssetBundle(!preg_match('/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i', $part), 'Windows-reserved name must be made safe.');
            checkAssetBundle($part === rtrim($part, '. '), 'Archive components cannot end in a dot or space.');
        }
        if (count($parts) === 2 && !str_ends_with($name, '/')) {
            checkAssetBundle(strtolower(pathinfo($name, PATHINFO_EXTENSION)) === 'pdf', 'Original attachment extensions must be retained.');
            checkAssetBundle(in_array($parts[0] . '/', $folders, true), 'Every attachment must be inside a document folder.');
            $filesByFolder[$parts[0]][] = $bytes;
        }
    }
    $expected = array_values($attachments);
    $actual = array_values($filesByFolder);
    foreach ($expected as &$files) sort($files); unset($files);
    foreach ($actual as &$files) sort($files); unset($files);
    sort($expected); sort($actual);
    checkAssetBundle($actual === $expected, 'All attachments must remain byte-identical, grouped by their document, and included exactly once.');

    // An absent attachment must fail explicitly, never produce an apparently complete archive.
    unlink($paths[0]);
    $failed = false;
    try { GtrotsFixedAssets::export($db, [], 'zip'); }
    catch (RuntimeException $error) { $failed = true; }
    checkAssetBundle($failed, 'A missing document attachment must abort the ZIP export.');

    $rejected = false;
    try { GtrotsFixedAssets::export($db, [], 'csv'); }
    catch (InvalidArgumentException $error) { $rejected = true; }
    checkAssetBundle($rejected, 'Unsupported export formats must be rejected.');
} finally {
    foreach ($paths as $path) if (is_file($path)) unlink($path);
}

echo "fixed_assets_bundle_test: ok (complete scope, values, disposals, ZIP, names, attachments, migration, missing files)\n";
