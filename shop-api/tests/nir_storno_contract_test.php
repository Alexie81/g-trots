<?php
declare(strict_types=1);

require_once __DIR__ . '/../nir-domain.php';
require_once __DIR__ . '/../nir-service.php';

$failed = 0;
$expect = static function (bool $condition, string $message) use (&$failed): void {
    if ($condition) return;
    fwrite(STDERR, "FAIL storno: {$message}\n");
    $failed++;
};
$expectThrows = static function (callable $callback, int $status, string $message) use (&$failed): void {
    try {
        $callback();
        fwrite(STDERR, "FAIL storno: {$message}\n");
        $failed++;
    } catch (ShopNirHttpException $error) {
        if ($error->status !== $status) {
            fwrite(STDERR, "FAIL storno: {$message} (status {$error->status})\n");
            $failed++;
        }
    }
};

$lines = [
    ['id' => 'line-a', 'accepted_quantity' => '10.0000', 'conversion_factor' => '1.000000'],
    ['id' => 'line-b', 'accepted_quantity' => '3.0000', 'conversion_factor' => '2.000000'],
];

$legacyAll = shopNirNormalizeStornoSelection(['reason' => 'Retur integral'], $lines);
$expect(count($legacyAll) === 2, 'payloadul legacy fără lines trebuie să selecteze toate pozițiile');
$expect($legacyAll[0]['quantity'] === '10.0000' && $legacyAll[1]['quantity'] === '3.0000', 'storno integral legacy folosește cantitățile acceptate');

$partial = shopNirNormalizeStornoSelection([
    'lines' => [['line_id' => 'line-a', 'quantity' => '2.5000']],
], $lines, ['line-a' => ['accepted_quantity' => shopNirDecimalToScaled('4.0000', 4)]]);
$expect(count($partial) === 1 && $partial[0]['quantity'] === '2.5000', 'cantitatea parțială explicită este păstrată');
$expect($partial[0]['remaining_before_scaled'] === shopNirDecimalToScaled('6.0000', 4), 'cantitatea deja stornată este scăzută');
$expect($partial[0]['is_final_for_line'] === false, 'o tranșă parțială nu finalizează linia');

$remaining = shopNirNormalizeStornoSelection([
    'line_id' => 'line-a',
], $lines, ['line-a' => ['accepted_quantity' => shopNirDecimalToScaled('4.0000', 4)]]);
$expect($remaining[0]['quantity'] === '6.0000' && $remaining[0]['is_final_for_line'] === true, 'line_id fără quantity stornează exact restul disponibil');

$originalInvoiceDocument = [
    'supplier_invoice_series' => 'F',
    'supplier_invoice_number' => '190',
    'supplier_invoice_date' => '2026-08-29',
    'nir_date' => '2026-08-29',
];
$newStornoInvoice = shopNirStornoInvoicePayload([
    'lines' => [['line_id' => 'line-a', 'quantity' => '1']],
    'supplier_invoice_series' => 'F',
    'supplier_invoice_number' => '191',
    'supplier_invoice_date' => '2026-08-30',
], $originalInvoiceDocument);
$expect($newStornoInvoice['supplier_invoice_number'] === '191' && $newStornoInvoice['supplier_invoice_date'] === '2026-08-30', 'documentul storno păstrează factura furnizorului nouă 191/data nouă');
$expect($newStornoInvoice['legacy_fallback'] === false, 'payloadul UI nou nu este confundat cu fallbackul legacy');
$stornoInvoiceWithoutSeries = shopNirStornoInvoicePayload([
    'lines' => [['line_id' => 'line-a']],
    'supplier_invoice_series' => '',
    'supplier_invoice_number' => '191',
    'supplier_invoice_date' => '2026-08-30',
], $originalInvoiceDocument);
$expect($stornoInvoiceWithoutSeries['supplier_invoice_series'] === '', 'seria facturii storno poate fi goală');
$expect(shopNirStornoNegativeDecimal('29.75', 2) === '-29.75', 'valoarea facturii storno 191 este negativă (-29,75)');
$legacyInvoice = shopNirStornoInvoicePayload(['reason' => 'Legacy'], $originalInvoiceDocument);
$expect($legacyInvoice['supplier_invoice_number'] === '190' && $legacyInvoice['supplier_invoice_date'] === '2026-08-29', 'cererea legacy copiază factura originală 190 pentru compatibilitate');
$missingNewInvoiceRejected = false;
try {
    shopNirStornoInvoicePayload(['lines' => [['line_id' => 'line-a']]], $originalInvoiceDocument);
} catch (InvalidArgumentException) {
    $missingNewInvoiceRejected = true;
}
$expect($missingNewInvoiceRejected, 'UI nou trebuie să trimită seria, numărul și data facturii de storno');

$expectThrows(static fn() => shopNirNormalizeStornoSelection([
    'lines' => [['line_id' => 'line-a', 'quantity' => '7.0000']],
], $lines, ['line-a' => ['accepted_quantity' => shopNirDecimalToScaled('4.0000', 4)]]), 409, 'depășirea cantității disponibile trebuie blocată');
$expectThrows(static fn() => shopNirNormalizeStornoSelection([
    'lines' => [['line_id' => 'line-a']],
], $lines, ['line-a' => ['accepted_quantity' => shopNirDecimalToScaled('10.0000', 4)]]), 409, 'dublul storno pe o linie finalizată trebuie blocat');

// Query-level contract for the progress exposed to both applications.
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('CREATE TABLE shop_nir_documents (id TEXT PRIMARY KEY, reversal_of_id TEXT NULL, source_type TEXT, status TEXT)');
$db->exec('CREATE TABLE shop_nir_lines (id TEXT PRIMARY KEY, nir_document_id TEXT, accepted_quantity NUMERIC, storno_of_line_id TEXT NULL)');
$db->exec("INSERT INTO shop_nir_documents VALUES ('nir-1', NULL, 'manual', 'confirmed'), ('storno-1', 'nir-1', 'reversal', 'confirmed')");
$db->exec("INSERT INTO shop_nir_lines VALUES ('line-a', 'nir-1', 10, NULL), ('line-b', 'nir-1', 3, NULL), ('storno-a-1', 'storno-1', -4, 'line-a')");
$progressDocument = shopNirAttachStornoState($db, [[
    'id' => 'nir-1', 'reversal_of_id' => null, 'source_type' => 'manual', 'status' => 'confirmed', 'line_count' => 2,
]])[0];
$expect($progressDocument['storno_state'] === 'partial', 'stornarea unei singure cantități produce stare parțială');
$expect($progressDocument['public_status'] === 'confirmed' && $progressDocument['status_label'] === 'CONFIRMAT', 'originalul rămâne confirmat după storno parțial');
$expect($progressDocument['storned_quantity'] === '4.0000' && $progressDocument['stornable_quantity'] === '9.0000', 'progresul agregat este exact');
$expect($progressDocument['can_storno'] === true, 'originalul parțial permite încă un storno');
$db->exec("INSERT INTO shop_nir_documents VALUES ('storno-2', 'nir-1', 'reversal', 'confirmed')");
$db->exec("INSERT INTO shop_nir_lines VALUES ('storno-a-2', 'storno-2', -6, 'line-a'), ('storno-b-1', 'storno-2', -3, 'line-b')");
$fullDocument = shopNirAttachStornoState($db, [[
    'id' => 'nir-1', 'reversal_of_id' => null, 'source_type' => 'manual', 'status' => 'confirmed', 'line_count' => 2,
]])[0];
$expect($fullDocument['storno_state'] === 'full' && $fullDocument['fully_storned'] === true, 'toate cantitățile stornate produc indicator integral separat');
$expect($fullDocument['public_status'] === 'confirmed' && $fullDocument['can_storno'] === false, 'originalul integral stornat rămâne confirmat, dar acțiunea este blocată');
$stornoDocument = shopNirAttachStornoState($db, [[
    'id' => 'storno-1', 'reversal_of_id' => 'nir-1', 'source_type' => 'reversal', 'status' => 'confirmed', 'line_count' => 1,
]])[0];
$expect($stornoDocument['document_kind'] === 'storno' && $stornoDocument['status_label'] === 'STORNAT', 'numai documentul negativ este public STORNAT');
$relatedOriginal = shopNirPdfRelatedDocumentRow([
    'id' => 'nir-1', 'nir_number' => 'NIR-2026-000001', 'supplier_invoice_series' => '',
    'supplier_invoice_number' => '190', 'supplier_invoice_date' => '2026-08-29',
]);
$expect($relatedOriginal['supplier_invoice_number'] === '190' && $relatedOriginal['supplier_invoice_date'] === '2026-08-29', 'contextul de export păstrează explicit factura originală 190/data');

$service = (string)file_get_contents(__DIR__ . '/../nir-service.php');
$api = (string)file_get_contents(__DIR__ . '/../api.php');
foreach ([
    'serie unică NIR pentru documentul storno' => "number_prefix'] ?? 'NIR'",
    'legătura exactă la linia sursă' => 'storno_of_line_id',
    'eveniment business storno' => 'NirStornoCreated',
    'mișcare negativă compatibilă' => 'NIR_REVERSAL',
    'indicator integral separat' => "'fully_storned' => \$fullyStorned",
    'statusul original rămâne confirmat' => 'UPDATE shop_nir_documents SET updated_by = ?, row_version = row_version + 1',
    'factura storno nouă este salvată' => "\$stornoInvoice['supplier_invoice_number']",
    'referință export la factura originală' => 'original_invoice_number',
    'valorile documentului storno sunt negative' => "shopNirStornoNegativeDecimal(shopNirScaledToDecimal(\$documentTotals['grand_total_ron']",
] as $label => $needle) {
    $expect(str_contains($service, $needle), $label);
}
foreach ([
    'versiune de schemă ridicată pentru migrare' => '$schemaVersion = 2026090404',
    'endpoint nou și alias legacy' => "['reverseNir', 'stornoNir']",
    'normalizare status legacy' => "status = 'confirmed', reversed_at = NULL, reversed_by = NULL WHERE status = 'reversed'",
    'normalizare serie REV/STO' => "d.nir_number LIKE 'REV-%' OR d.nir_number LIKE 'STO-%'",
    'verificare explicită a coliziunii numerelor legacy' => 'legacyNumberCollision',
    'coloană mapare linie storno' => 'storno_of_line_id',
] as $label => $needle) {
    $expect(str_contains($api, $needle), $label);
}

fwrite(STDOUT, 'NIR storno contract: ' . ($failed ? "{$failed} verificări eșuate" : 'toate verificările au trecut') . ".\n");
exit($failed === 0 ? 0 : 1);
