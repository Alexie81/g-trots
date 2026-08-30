<?php
declare(strict_types=1);

require_once __DIR__ . '/../nir-domain.php';
require_once __DIR__ . '/../nir-service.php';
require_once __DIR__ . '/../nir-xlsx.php';

/** @return array<string,string> */
function nirXlsxContractReadStoredZip(string $zip): array
{
    $entries = [];
    $offset = 0;
    $length = strlen($zip);
    while ($offset + 30 <= $length && substr($zip, $offset, 4) === "PK\x03\x04") {
        $header = unpack(
            'vversion/vflags/vmethod/vtime/vdate/Vcrc/Vcompressed/Vuncompressed/vname_length/vextra_length',
            substr($zip, $offset + 4, 26)
        );
        if (!is_array($header)) throw new RuntimeException('Antet ZIP local invalid.');
        if ((int)$header['method'] !== 0) throw new RuntimeException('Testul acceptă numai intrările ZIP stocate de generator.');
        $nameStart = $offset + 30;
        $nameLength = (int)$header['name_length'];
        $extraLength = (int)$header['extra_length'];
        $dataStart = $nameStart + $nameLength + $extraLength;
        $dataLength = (int)$header['compressed'];
        if ($dataStart + $dataLength > $length) throw new RuntimeException('Intrare ZIP trunchiată.');
        $name = substr($zip, $nameStart, $nameLength);
        $data = substr($zip, $dataStart, $dataLength);
        if ((int)$header['uncompressed'] !== strlen($data)) throw new RuntimeException("Dimensiune ZIP invalidă pentru {$name}.");
        if (sprintf('%u', crc32($data)) !== sprintf('%u', (int)$header['crc'])) {
            throw new RuntimeException("CRC ZIP invalid pentru {$name}.");
        }
        $entries[$name] = $data;
        $offset = $dataStart + $dataLength;
    }
    return $entries;
}

function nirXlsxContractAttribute(string $attributes, string $name): ?string
{
    if (!preg_match('/(?:^|\s)' . preg_quote($name, '/') . '="([^"]*)"/u', $attributes, $match)) return null;
    return html_entity_decode($match[1], ENT_QUOTES | ENT_XML1, 'UTF-8');
}

/** @return array<string,array{value:string,formula:string,style:int,type:string}> */
function nirXlsxContractRowCells(string $sheetXml, int $rowNumber): array
{
    if (!preg_match('/<row\b[^>]*\br="' . $rowNumber . '"[^>]*>(.*?)<\/row>/su', $sheetXml, $rowMatch)) return [];
    $cells = [];
    preg_match_all('/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/su', $rowMatch[1], $matches, PREG_SET_ORDER);
    foreach ($matches as $match) {
        $attributes = $match[1];
        $body = $match[2] ?? '';
        $reference = nirXlsxContractAttribute($attributes, 'r') ?? '';
        if ($reference === '') continue;
        $value = '';
        if (preg_match_all('/<t(?:\s[^>]*)?>(.*?)<\/t>/su', $body, $textMatches)) {
            $value = implode('', array_map(
                static fn(string $text): string => html_entity_decode($text, ENT_QUOTES | ENT_XML1, 'UTF-8'),
                $textMatches[1]
            ));
        } elseif (preg_match('/<v>(.*?)<\/v>/su', $body, $valueMatch)) {
            $value = html_entity_decode($valueMatch[1], ENT_QUOTES | ENT_XML1, 'UTF-8');
        }
        $formula = preg_match('/<f(?:\s[^>]*)?>(.*?)<\/f>/su', $body, $formulaMatch)
            ? html_entity_decode($formulaMatch[1], ENT_QUOTES | ENT_XML1, 'UTF-8')
            : '';
        $cells[$reference] = [
            'value' => $value,
            'formula' => $formula,
            'style' => (int)(nirXlsxContractAttribute($attributes, 's') ?? 0),
            'type' => nirXlsxContractAttribute($attributes, 't') ?? '',
        ];
    }
    return $cells;
}

function nirXlsxContractColumnNumber(string $reference): int
{
    if (!preg_match('/^([A-Z]+)/', $reference, $match)) return 0;
    $number = 0;
    foreach (str_split($match[1]) as $letter) $number = $number * 26 + ord($letter) - 64;
    return $number;
}

/** @return array<int,string> */
function nirXlsxContractHeaders(string $sheetXml): array
{
    $cells = nirXlsxContractRowCells($sheetXml, 1);
    uksort($cells, static fn(string $left, string $right): int => nirXlsxContractColumnNumber($left) <=> nirXlsxContractColumnNumber($right));
    return array_values(array_map(static fn(array $cell): string => $cell['value'], $cells));
}

/** @return array<int,string> */
function nirXlsxContractRequestedHeaders(): array
{
    return [
        'ID NIR intern', 'Serie NIR', 'Număr NIR', 'Data NIR', 'Data recepției fizice', 'Ora recepției',
        'Data creării', 'Data finalizării', 'Status NIR', 'Gestiune', 'Punct de lucru', 'Locație recepție',
        'Gestionar', 'Recepționat de', 'Verificat de', 'Aprobat de', 'Observații generale NIR',
        'Tip document sursă', 'Serie factură', 'Număr factură', 'Data facturii', 'Serie aviz', 'Număr aviz',
        'Data avizului', 'Număr comandă achiziție', 'AWB', 'Transportator', 'Monedă', 'Curs valutar',
        'Data cursului', 'ID / index RO e-Factura, dacă există',
        'ID furnizor intern', 'Denumire furnizor', 'CUI / CIF furnizor', 'Cod TVA furnizor',
        'Nr. Registrul Comerțului', 'Țară furnizor', 'Județ', 'Localitate', 'Adresă', 'Telefon', 'Email',
        'Nr. crt.', 'ID poziție NIR', 'Denumire produs furnizor', 'Cod produs furnizor',
        'SKU furnizor, dacă este distinct', 'EAN furnizor', 'UM furnizor', 'Marcă furnizor', 'Model furnizor',
        'Variantă / specificație furnizor', 'Lot furnizor', 'Serie furnizor',
        'ID produs G-Trots', 'Denumire produs G-Trots', 'Cod / SKU G-Trots', 'EAN G-Trots',
        'Categorie G-Trots', 'Subcategorie', 'Marcă', 'Model', 'Variantă', 'UM G-Trots',
        'Status asociere produs', 'Observații asociere',
        'Cantitate facturată', 'Cantitate recepționată fizic', 'Cantitate acceptată în gestiune',
        'Cantitate în carantină / blocată', 'Cantitate lipsă', 'Cantitate în plus',
        'Diferență recepționat vs facturat', 'Diferență acceptat vs facturat',
        'Factor conversie UM, dacă există',
        'Preț unitar brut inițial fără TVA', 'Discount unitar', 'Discount procentual',
        'Discount total poziție', 'Preț unitar net fără TVA după discount', 'Cotă TVA %', 'TVA unitar',
        'Preț unitar cu TVA', 'Preț total net fără TVA', 'TVA total', 'Preț total cu TVA',
        'Transport alocat poziției', 'Taxe vamale alocate', 'Alte taxe nerecuperabile',
        'Alte costuri directe alocate', 'Cost suplimentar total alocat', 'Cost unitar de intrare fără TVA',
        'Valoare totală de intrare în gestiune', 'TVA deductibilă', 'TVA nedeductibilă',
        'Moneda costului', 'Observații calcul cost',
        'Stare produs', 'Produs conform DA/NU', 'Tip diferență',
        'Motiv carantină', 'Descriere neconformitate', 'Măsură luată',
        'Retur către furnizor DA/NU', 'Solicitare stornare DA/NU',
        'Document diferență / proces verbal', 'Observații recepție',
        'Serie individuală', 'Lot / batch', 'Data fabricației', 'Data expirării, dacă există',
        'Durată garanție furnizor', 'Data început garanție', 'Data expirare garanție',
        'Locație / raft', 'Cod QR / barcode intern, dacă există',
        'Total net factură', 'Total TVA factură', 'Total cu TVA factură', 'Total discount factură',
        'Total transport', 'Total taxe vamale', 'Total alte costuri',
        'Total valoare intrată în gestiune', 'Total cantitate facturată',
        'Total cantitate recepționată', 'Total cantitate acceptată',
        'Creat de utilizator', 'Data/oră creare', 'Modificat ultima dată de',
        'Data/oră ultima modificare', 'Validat de', 'Data/oră validare',
        'Stornat de, dacă este cazul', 'Data/oră stornare', 'Motiv stornare', 'Versiune NIR',
        'ID fișier factură sursă', 'Nume fișier factură', 'ID fișier PDF NIR', 'Observații audit',
    ];
}

/** @return array<int,string> style index => format code */
function nirXlsxContractStyleFormats(string $stylesXml): array
{
    $formats = [
        0 => 'General', 1 => '0', 2 => '0.00', 9 => '0%', 10 => '0.00%', 14 => 'm/d/yy', 20 => 'h:mm', 21 => 'h:mm:ss',
    ];
    preg_match_all('/<numFmt\b([^>]*)\/>/su', $stylesXml, $formatMatches, PREG_SET_ORDER);
    foreach ($formatMatches as $match) {
        $id = (int)(nirXlsxContractAttribute($match[1], 'numFmtId') ?? -1);
        $code = nirXlsxContractAttribute($match[1], 'formatCode');
        if ($id >= 0 && $code !== null) $formats[$id] = $code;
    }
    if (!preg_match('/<cellXfs\b[^>]*>(.*?)<\/cellXfs>/su', $stylesXml, $xfsMatch)) return [];
    preg_match_all('/<xf\b([^>]*)>/su', $xfsMatch[1], $xfMatches, PREG_SET_ORDER);
    $styles = [];
    foreach ($xfMatches as $index => $match) {
        $formatId = (int)(nirXlsxContractAttribute($match[1], 'numFmtId') ?? 0);
        $styles[$index] = $formats[$formatId] ?? "numFmtId:{$formatId}";
    }
    return $styles;
}

/** @return array<int,array<int,string>> */
function nirXlsxContractRows(string $sheetXml): array
{
    preg_match_all('/<row\b[^>]*\br="(\d+)"[^>]*>.*?<\/row>/su', $sheetXml, $matches, PREG_SET_ORDER);
    $rows = [];
    foreach ($matches as $match) {
        $number = (int)$match[1];
        $rows[$number] = array_values(array_map(static fn(array $cell): string => $cell['value'], nirXlsxContractRowCells($sheetXml, $number)));
    }
    return $rows;
}

$imageDirectory = __DIR__ . '/../uploads/products';
$imageDirectoryCreated = false;
if (!is_dir($imageDirectory)) {
    $imageDirectoryCreated = mkdir($imageDirectory, 0777, true);
    if (!$imageDirectoryCreated) throw new RuntimeException('Nu s-a putut crea directorul temporar pentru miniatură.');
}
$imagePath = $imageDirectory . '/nir-xlsx-contract-thumbnail.png';
$imageBytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mP8z8AARAwMjIxoAAARAwEAff8f9QAAAABJRU5ErkJggg==', true);
if (!is_string($imageBytes) || file_put_contents($imagePath, $imageBytes) === false) {
    throw new RuntimeException('Nu s-a putut crea miniatura de test.');
}
register_shutdown_function(static function () use ($imagePath, $imageDirectory, $imageDirectoryCreated): void {
    if (is_file($imagePath)) @unlink($imagePath);
    if ($imageDirectoryCreated && is_dir($imageDirectory)) @rmdir($imageDirectory);
});

$lineBase = [
    'supplier_product_code' => 'FURN-SE-001', 'supplier_product_name' => 'Anvelopă furnizor 10×2,75',
    'supplier_sku' => 'SKU-FURN-001', 'supplier_ean' => '5940000000001', 'purchase_unit' => 'buc',
    'supplier_brand' => 'FurniBrand', 'supplier_model' => 'Road Pro', 'supplier_variant' => 'Negru',
    'supplier_lot' => 'LOT-F-2026', 'supplier_serial' => 'SER-F-001',
    'product_id' => '10000000-0000-4000-8000-000000000001',
    'product_name' => 'Cauciuc offroad tubeless G-Trots', 'product_sku' => 'SE-CMM087',
    'product_ean' => '5940000000099', 'product_category_name' => 'Piese trotinete electrice',
    'product_subcategory_name' => 'Anvelope', 'product_brand_names' => 'G-Trots',
    'product_model' => 'G2', 'product_variant' => '10×2,75', 'stock_unit' => 'buc',
    'resolution_status' => 'matched_code', 'match_method' => 'supplier_code', 'match_confidence' => '99.50',
    'invoiced_quantity' => '3.0000', 'received_quantity' => '2.5000', 'accepted_quantity' => '2.0000',
    'rejected_quantity' => '0.5000', 'conversion_factor' => '1.0000',
    'unit_price' => '89.9900', 'gross_unit_price' => '96.0000', 'discount_unit' => '6.0100',
    'discount_percent' => '6.2604', 'discount_value' => '18.0300', 'line_net' => '269.9700',
    'vat_rate' => '19.00', 'unit_vat' => '17.0981', 'unit_price_with_vat' => '107.0881',
    'line_vat' => '51.2943', 'line_total' => '321.2643', 'line_net_ron' => '1363.3485',
    'line_vat_ron' => '259.0362', 'line_total_ron' => '1622.3847',
    'allocated_transport_ron' => '12.50', 'allocated_customs_ron' => '0',
    'allocated_nonrecoverable_taxes_ron' => '1.25', 'allocated_direct_costs_ron' => '2.75',
    'allocated_cost_ron' => '16.50', 'inventory_unit_cost_ron' => '689.9243',
    'inventory_cost_total_ron' => '1379.8486', 'deductible_vat_ron' => '259.0362',
    'nondeductible_vat_ron' => '0', 'cost_currency' => 'RON',
    'cost_notes' => 'Cost validat de backend.', 'reception_status' => 'accepted_with_difference',
    'product_condition' => 'Nou', 'is_conforming' => true, 'difference_reason' => 'quantity_shortage',
    'rejection_reason' => 'Ambalaj deteriorat', 'nonconformity_description' => '0,5 buc respinsă.',
    'corrective_action' => 'Separare și notificare furnizor.', 'return_to_supplier' => false,
    'request_credit_note' => true, 'difference_document' => 'PV-2026-14',
    'reception_notes' => 'Control vizual efectuat.', 'serial_number' => 'SER-IND-001',
    'batch_number' => 'BATCH-2026-08', 'manufacture_date' => '2026-07-01', 'expiry_date' => '2031-07-01',
    'supplier_warranty_months' => '24', 'warranty_start_date' => '2026-08-29', 'warranty_end_date' => '2028-08-29',
    'storage_location' => 'A-03-02', 'internal_barcode' => 'GT-SE-CMM087-001',
    'product_image_url' => 'uploads/products/nir-xlsx-contract-thumbnail.png',
    'row_version' => 2, 'created_at' => '2026-08-29 14:25:01', 'updated_at' => '2026-08-29 14:32:15',
];

$document = [
    'id' => '20000000-0000-4000-8000-000000000042',
    'nir_number' => 'NIR-2026-000042', 'nir_series' => 'NIR', 'nir_sequence_number' => '2026-000042',
    'nir_date' => '2026-08-29', 'nir_time' => '14:25:01',
    'reception_date' => '2026-08-29', 'reception_time' => '14:24:35',
    'created_at' => '2026-08-29 14:25:01', 'updated_at' => '2026-08-29 14:32:15',
    'confirmed_at' => '2026-08-29 14:31:44', 'status' => 'confirmed', 'source_type' => 'manual',
    'supplier_id' => '30000000-0000-4000-8000-000000000003', 'supplier_name' => 'KIDOTOYS SRL',
    'supplier_cui' => 'RO12345678', 'supplier_invoice_series' => 'FS',
    'supplier_invoice_number' => '20260623-0001', 'supplier_invoice_date' => '2026-08-28',
    'currency' => 'EUR', 'exchange_rate' => '5.050000', 'exchange_rate_date' => '2026-08-28',
    'warehouse_id' => '40000000-0000-4000-8000-000000000004', 'warehouse_name' => 'Gestiune principală',
    'notes' => 'Recepție cu diferență cantitativă explicată.', 'row_version' => 7,
    'subtotal' => '539.9400', 'vat_total' => '102.5886', 'grand_total' => '642.5286',
    'subtotal_ron' => '2726.6970', 'vat_total_ron' => '518.0724', 'grand_total_ron' => '3244.7694',
    'inventory_cost_total_ron' => '2759.6972', 'total_difference_ron' => '0.0002',
    'confirmed_by' => 'Administrator', 'created_by' => 'Operator recepție', 'updated_by' => 'Administrator',
    'lines' => [
        ['id' => '50000000-0000-4000-8000-000000000001', 'line_number' => 1] + $lineBase,
        ['id' => '50000000-0000-4000-8000-000000000002', 'line_number' => 2,
            'supplier_product_code' => 'FURN-SE-002', 'supplier_product_name' => 'Anvelopă furnizor 10×2,50',
            'product_id' => '10000000-0000-4000-8000-000000000002', 'product_name' => 'Cauciuc urban G-Trots',
            'product_sku' => 'SE-CMM088', 'invoiced_quantity' => '3.0000', 'received_quantity' => '3.0000',
            'accepted_quantity' => '3.0000', 'rejected_quantity' => '0.0000', 'unit_price' => '89.9900',
            'discount_percent' => '6.2604', 'vat_rate' => '19.00', 'line_net' => '269.9700',
            'line_vat' => '51.2943', 'line_total' => '321.2643', 'line_net_ron' => '1363.3485',
            'line_vat_ron' => '259.0362', 'line_total_ron' => '1622.3847',
            'inventory_unit_cost_ron' => '459.9495', 'inventory_cost_total_ron' => '1379.8486',
            'purchase_unit' => 'buc', 'stock_unit' => 'buc', 'conversion_factor' => '1',
            'resolution_status' => 'matched_name', 'match_method' => 'supplier_name', 'match_confidence' => '97.00',
            'is_conforming' => true, 'return_to_supplier' => false, 'request_credit_note' => false,
            'product_image_url' => 'uploads/products/nir-xlsx-contract-thumbnail.png',
            'created_at' => '2026-08-29 14:25:02', 'updated_at' => '2026-08-29 14:32:16'] + $lineBase,
    ],
    'pdf_context' => [
        'template' => 'entry',
        'company' => ['legal_name' => 'CAB IT EXPERT SRL', 'trade_name' => 'G-Trots România', 'cui' => '49972605'],
        'supplier' => [
            'id' => '30000000-0000-4000-8000-000000000003', 'name' => 'KIDOTOYS SRL', 'cui' => 'RO12345678',
            'vat_code' => 'RO12345678', 'registration_number' => 'J40/1234/2020', 'country' => 'România',
            'county' => 'București', 'city' => 'București', 'address' => 'Str. Testului 42',
            'phone' => '+40 700 000 000', 'email' => 'office@example.test',
        ],
        'warehouse' => ['id' => '40000000-0000-4000-8000-000000000004', 'name' => 'Gestiune principală', 'code' => 'MAIN'],
        'summary' => [
            'line_count' => 2, 'total_net_ron' => '2726.6970', 'total_vat_ron' => '518.0724',
            'total_gross_ron' => '3244.7694', 'total_discount' => '36.0600', 'total_transport' => '25.0000',
            'total_customs' => '0', 'total_other_costs' => '8.0002', 'total_inventory_ron' => '2759.6972',
            'total_invoiced_quantity' => '6.0000', 'total_received_quantity' => '5.5000',
            'total_accepted_quantity' => '5.0000', 'total_rejected_quantity' => '0.5000',
            'vat_breakdown' => [['vat_rate' => '19.00', 'net_ron' => '2726.6970', 'vat_ron' => '518.0724', 'gross_ron' => '3244.7694']],
        ],
        'attachments' => [[
            'id' => '60000000-0000-4000-8000-000000000006', 'original_name' => 'FS-20260623-0001.pdf',
            'mime_type' => 'application/pdf', 'file_size' => 402944, 'sha256' => str_repeat('a', 64),
            'created_at' => '2026-08-29 14:24:01',
        ]],
        'audit' => [
            ['action_type' => 'NIR_CREATED', 'actor_name' => 'Operator recepție', 'created_at' => '2026-08-29 14:25:01'],
            ['action_type' => 'NIR_CONFIRMED', 'actor_name' => 'Administrator', 'created_at' => '2026-08-29 14:31:44'],
        ],
        'generation' => [
            'generated_at' => '2026-08-30 15:30:00', 'generated_by' => 'Administrator',
            'app' => 'G-Trots Management', 'data_fingerprint' => str_repeat('b', 64),
        ],
    ],
];

$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$xlsx = shopNirBuildXlsx($document);
$expect(shopNirPremiumXlsxExcelDate('2026-08-29') === 46263.0, 'Data Excel trebuie calculată calendaristic, fără deplasare de fus orar pe ziua anterioară.');
$expectedDateTime = 46263.0 + (14 * 3600 + 25 * 60 + 1) / 86400;
$expect(abs((float)shopNirPremiumXlsxExcelDate('2026-08-29 14:25:01', true) - $expectedDateTime) < 0.00000001, 'Ora Excel trebuie păstrată exact în fusul Europe/Bucharest.');
$expect(str_starts_with($xlsx, "PK\x03\x04"), 'XLSX nu începe cu antet ZIP local valid.');
$eocdOffset = strrpos($xlsx, "PK\x05\x06");
$expect($eocdOffset !== false && $eocdOffset === strlen($xlsx) - 22, 'Arhiva XLSX nu se încheie cu EOCD valid, fără date reziduale.');

try {
    $entries = nirXlsxContractReadStoredZip($xlsx);
} catch (Throwable $error) {
    $entries = [];
    $failures[] = $error->getMessage();
}

$requiredEntries = [
    '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
    'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml',
    'xl/worksheets/sheet4.xml', 'xl/worksheets/sheet5.xml', 'docProps/core.xml', 'docProps/app.xml',
];
foreach ($requiredEntries as $entry) $expect(isset($entries[$entry]), "Lipsește intrarea OOXML obligatorie {$entry}.");

foreach ($entries as $name => $contents) {
    if (!str_ends_with($name, '.xml') && !str_ends_with($name, '.rels')) continue;
    $dom = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $valid = $dom->loadXML($contents, LIBXML_NONET | LIBXML_NOBLANKS);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    $expect($valid, "XML OOXML invalid în {$name}.");
}

$workbookXml = $entries['xl/workbook.xml'] ?? '';
preg_match_all('/<sheet\b[^>]*\bname="([^"]+)"/u', $workbookXml, $sheetMatches);
$sheetNames = array_map(static fn(string $name): string => html_entity_decode($name, ENT_QUOTES | ENT_XML1, 'UTF-8'), $sheetMatches[1] ?? []);
$expect($sheetNames === ['Rezumat NIR', 'Poziții NIR', 'Diferențe', 'Documente & Audit', 'Dicționar câmpuri'], 'Workbook-ul trebuie să aibă exact cele 5 foi premium, în ordinea stabilită.');

$positionsXml = $entries['xl/worksheets/sheet2.xml'] ?? '';
$actualHeaders = nirXlsxContractHeaders($positionsXml);
$expectedHeaders = nirXlsxContractRequestedHeaders();
$thumbnailOffset = ($actualHeaders[0] ?? '') === 'Miniatură' ? 1 : 0;
$expect(array_slice($actualHeaders, $thumbnailOffset) === $expectedHeaders, 'Antetele din Poziții NIR nu reproduc exact lista utilizatorului și ordinea ei după Miniatură opțională.');
$expect(count($actualHeaders) === count($expectedHeaders) + $thumbnailOffset, 'Poziții NIR conține antete suplimentare sau lipsă.');

$paneTag = preg_match('/<pane\b([^>]*)\/>/u', $positionsXml, $paneMatch) ? $paneMatch[1] : '';
$expect(nirXlsxContractAttribute($paneTag, 'ySplit') === '1', 'Poziții NIR trebuie să înghețe exact primul rând.');
$expect(nirXlsxContractAttribute($paneTag, 'topLeftCell') === 'A2', 'Zona vizibilă după freeze trebuie să înceapă la A2.');
$expect(nirXlsxContractAttribute($paneTag, 'state') === 'frozen', 'Freeze pane trebuie să aibă starea frozen.');
$expect(nirXlsxContractAttribute($paneTag, 'xSplit') === null, 'Poziții NIR nu trebuie să înghețe coloane suplimentare.');
$lastColumn = shopNirPremiumXlsxColumn(count($actualHeaders));
$expect((bool)preg_match('/<autoFilter\b[^>]*\bref="A1:' . preg_quote($lastColumn, '/') . '3"\s*\/>/u', $positionsXml), 'Autofilter-ul trebuie să acopere toate coloanele și cele două rânduri de produs.');

$row1Cells = nirXlsxContractRowCells($positionsXml, 1);
$headerColumns = [];
foreach ($row1Cells as $reference => $cell) {
    if (!preg_match('/^([A-Z]+)/', $reference, $referenceMatch)) continue;
    $headerColumns[$cell['value']] = $referenceMatch[1];
    $expect($cell['style'] > 0, "Antetul {$cell['value']} trebuie să fie stilizat/bold.");
}
$row2 = nirXlsxContractRowCells($positionsXml, 2);
$row3 = nirXlsxContractRowCells($positionsXml, 3);
$cellFor = static function (array $row, string $header) use ($headerColumns): array {
    $reference = ($headerColumns[$header] ?? '') . (preg_match('/\d+$/', array_key_first($row) ?? '', $m) ? $m[0] : '');
    return $row[$reference] ?? ['value' => '', 'formula' => '', 'style' => 0, 'type' => ''];
};

foreach (['ID NIR intern', 'Număr NIR', 'Status NIR', 'Gestiune', 'Serie factură', 'Număr factură', 'Monedă', 'ID furnizor intern', 'Denumire furnizor', 'CUI / CIF furnizor'] as $header) {
    $left = $cellFor($row2, $header)['value'];
    $right = $cellFor($row3, $header)['value'];
    $expect($left !== '' && $left === $right, "Informația generală/furnizor «{$header}» trebuie repetată identic pe fiecare rând de produs.");
}

$stylesXml = $entries['xl/styles.xml'] ?? '';
$styleFormats = nirXlsxContractStyleFormats($stylesXml);
$formattedChecks = [
    ['Data NIR', 'date', static fn(string $format): bool => str_contains(strtolower($format), 'dd.mm.yyyy')],
    ['Ora recepției', 'time', static fn(string $format): bool => str_contains(strtolower($format), 'hh:mm:ss')],
    ['Cantitate facturată', 'quantity', static fn(string $format): bool => (bool)preg_match('/0\.(?:0000|####)/', $format)],
    ['Preț unitar brut inițial fără TVA', 'money', static fn(string $format): bool => str_contains($format, '0.00')],
    ['Discount procentual', 'percent', static fn(string $format): bool => str_contains($format, '%')],
    ['Cotă TVA %', 'percent', static fn(string $format): bool => str_contains($format, '%')],
];
foreach ($formattedChecks as [$header, $kind, $acceptFormat]) {
    $cell = $cellFor($row2, $header);
    $format = $styleFormats[$cell['style']] ?? '';
    $expect($cell['type'] !== 'inlineStr' && is_numeric($cell['value']), "{$header} trebuie exportat ca număr Excel real ({$kind}), nu text.");
    $expect($cell['style'] > 0 && $acceptFormat($format), "{$header} nu folosește formatul Excel cerut pentru {$kind}; format găsit: {$format}.");
}
$discountPercent = (float)$cellFor($row2, 'Discount procentual')['value'];
$vatPercent = (float)$cellFor($row2, 'Cotă TVA %')['value'];
$expect(abs($discountPercent - 0.062604) < 0.000001, 'Discountul procentual trebuie stocat fracționar pentru formatul Excel %.');
$expect(abs($vatPercent - 0.19) < 0.000001, 'Cota TVA trebuie stocată fracționar pentru formatul Excel %.');

foreach (['Diferență recepționat vs facturat', 'Diferență acceptat vs facturat'] as $header) {
    $formula = $cellFor($row2, $header)['formula'];
    $expect($formula !== '' && str_contains($formula, '-'), "{$header} trebuie să fie o formulă Excel auditabilă.");
}
$expect(str_contains($entries['xl/worksheets/sheet3.xml'] ?? '', '<f>'), 'Foaia Diferențe trebuie să conțină formule către Poziții NIR.');

foreach (['Produs conform DA/NU', 'Retur către furnizor DA/NU', 'Solicitare stornare DA/NU'] as $header) {
    $value = $cellFor($row2, $header)['value'];
    $expect($value === '' || in_array($value, ['DA', 'NU'], true), "{$header} trebuie să fie gol când este Nestocat sau standardizat strict la DA / NU.");
}
$expect(in_array($cellFor($row2, 'Produs conform DA/NU')['value'], ['DA', 'NU'], true), 'Câmpul derivat Produs conform trebuie completat standardizat DA / NU.');

$expect($cellFor($row2, 'Punct de lucru')['value'] === '', 'Câmpul nestocat Punct de lucru trebuie păstrat ca celulă goală, nu inventat.');
$dictionaryRows = nirXlsxContractRows($entries['xl/worksheets/sheet5.xml'] ?? '');
$pointOfWorkDocumented = false;
foreach ($dictionaryRows as $values) {
    if (in_array('Punct de lucru', $values, true) && in_array('Nestocat', $values, true)) $pointOfWorkDocumented = true;
}
$expect($pointOfWorkDocumented, 'Dicționarul trebuie să explice Punct de lucru drept Nestocat.');

$contentTypes = $entries['[Content_Types].xml'] ?? '';
$expect((bool)preg_match('/<Default\b[^>]*Extension="webp"[^>]*ContentType="image\/webp"/u', $contentTypes), 'Manifestul OOXML trebuie să declare suportul .webp.');
$expect(isset($entries['xl/drawings/drawing1.xml'], $entries['xl/drawings/_rels/drawing1.xml.rels']), 'Logo-ul trebuie inclus prin drawing1 și relația lui media.');
$expect(isset($entries['xl/drawings/drawing2.xml'], $entries['xl/drawings/_rels/drawing2.xml.rels']), 'Miniaturile produselor trebuie incluse prin drawing2 și relațiile lui media.');
$expect(str_contains($entries['xl/worksheets/sheet1.xml'] ?? '', '<drawing r:id="rId1"/>'), 'Rezumat NIR trebuie să afișeze logo-ul.');
$expect(str_contains($positionsXml, '<drawing r:id="rId1"/>'), 'Poziții NIR trebuie să afișeze miniaturile produselor.');
$mediaEntries = array_values(array_filter(array_keys($entries), static fn(string $name): bool => str_starts_with($name, 'xl/media/')));
$expect(count($mediaEntries) >= 2, 'Pachetul trebuie să conțină cel puțin logo-ul și o miniatură de produs.');
foreach (['xl/drawings/_rels/drawing1.xml.rels', 'xl/drawings/_rels/drawing2.xml.rels'] as $relationsName) {
    $relations = $entries[$relationsName] ?? '';
    preg_match_all('/\bTarget="\.\.\/media\/([^"]+)"/u', $relations, $targetMatches);
    $expect(!empty($targetMatches[1]), "{$relationsName} trebuie să indice fișiere media.");
    foreach ($targetMatches[1] ?? [] as $target) $expect(isset($entries['xl/media/' . $target]), "Relația media {$target} indică o intrare inexistentă.");
}

$allXml = implode("\n", array_map(
    static fn(string $name): string => (str_ends_with($name, '.xml') || str_ends_with($name, '.rels')) ? ($entries[$name] ?? '') : '',
    array_keys($entries)
));
$expect(!str_contains(mb_strtoupper($allXml, 'UTF-8'), 'FIFO'), 'Exportul premium nu trebuie să expună nicăieri terminologia FIFO.');
$expect(!str_contains(mb_strtoupper($allXml, 'UTF-8'), 'RESPINS'), 'Exportul premium nu trebuie să expună câmpuri sau etichete de respingere.');
$expect(!str_contains(mb_strtoupper($allXml, 'UTF-8'), 'REJECTED'), 'Exportul premium nu trebuie să expună denumirile tehnice vechi ale câmpurilor de respingere.');
foreach (['REVERSARE', 'REVERSAT', 'REVERSAL', 'REVERSED', 'STORNO'] as $forbidden) {
    $expect(!str_contains(mb_strtoupper($allXml, 'UTF-8'), $forbidden), "Exportul premium nu trebuie să expună terminologia legacy {$forbidden}.");
}

if ($failures) {
    fwrite(STDERR, "Contract XLSX premium NIR: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo 'Contract XLSX premium NIR validat: 5 foi, 141 coloane autoritative, formule, stiluri, logo și miniaturi.' . PHP_EOL;
