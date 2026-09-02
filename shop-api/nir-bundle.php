<?php
declare(strict_types=1);

/** Detailed NIR registry and disposable period archives. */

function shopNirRegistryDateRange(PDO $db, string $from, string $to): array
{
    $from = trim($from);
    $to = trim($to);
    if ($from === '' || $to === '') {
        $range = $db->query('SELECT MIN(reception_date) AS first_date, MAX(reception_date) AS last_date FROM shop_nir_documents')->fetch() ?: [];
        if ($from === '') $from = trim((string)($range['first_date'] ?? '')) ?: date('Y-01-01');
        if ($to === '') $to = trim((string)($range['last_date'] ?? '')) ?: date('Y-m-d');
    }
    $from = shopNirDate($from, 'Data de început');
    $to = shopNirDate($to, 'Data de sfârșit');
    if ($from > $to) throw new InvalidArgumentException('Data de început trebuie să fie anterioară datei de sfârșit.');
    return [$from, $to];
}

function shopNirRegistryRows(PDO $db, string $from, string $to): array
{
    $stmt = $db->prepare(
        'SELECT n.*, COALESCE(n.nir_number, n.temporary_number) AS document_number,
                CASE WHEN n.reversal_of_id IS NOT NULL OR n.source_type = "reversal" THEN "NIR STORNO" ELSE "NIR RECEPȚIE" END AS document_type,
                CASE WHEN n.reversal_of_id IS NOT NULL OR n.source_type = "reversal" THEN "STORNAT" WHEN n.status = "confirmed" THEN "CONFIRMAT" ELSE "CIORNĂ" END AS status_label,
                s.name AS supplier_name, s.cui AS supplier_cui, w.name AS warehouse_name,
                COALESCE(original.nir_number, original.temporary_number) AS original_document_number,
                (SELECT COUNT(*) FROM shop_nir_lines l WHERE l.nir_document_id = n.id) AS line_count,
                (SELECT COALESCE(SUM(l.invoiced_quantity), 0) FROM shop_nir_lines l WHERE l.nir_document_id = n.id) AS invoiced_quantity,
                (SELECT COALESCE(SUM(l.received_quantity), 0) FROM shop_nir_lines l WHERE l.nir_document_id = n.id) AS received_quantity,
                (SELECT COALESCE(SUM(l.accepted_quantity), 0) FROM shop_nir_lines l WHERE l.nir_document_id = n.id) AS accepted_quantity,
                (SELECT COALESCE(SUM(l.rejected_quantity), 0) FROM shop_nir_lines l WHERE l.nir_document_id = n.id) AS rejected_quantity,
                (SELECT COALESCE(SUM(l.accepted_quantity - l.invoiced_quantity), 0) FROM shop_nir_lines l WHERE l.nir_document_id = n.id) AS quantity_difference,
                (SELECT COUNT(*) FROM shop_nir_attachments a WHERE a.nir_document_id = n.id) AS attachment_count
         FROM shop_nir_documents n
         LEFT JOIN shop_suppliers s ON s.id = n.supplier_id
         LEFT JOIN shop_warehouses w ON w.id = n.warehouse_id
         LEFT JOIN shop_nir_documents original ON original.id = n.reversal_of_id
         WHERE n.reception_date BETWEEN ? AND ?
         ORDER BY n.reception_date, n.reception_time, n.created_at, n.id'
    );
    $stmt->execute([$from, $to]);
    return $stmt->fetchAll();
}

function shopNirRegistryColumns(): array
{
    return [
        ['Nr. crt.', 'index', 'number', 24, 9],
        ['Număr NIR', 'document_number', 'string', 10, 22],
        ['Tip document', 'document_type', 'string', 10, 18],
        ['Status', 'status_label', 'string', 10, 16],
        ['Data NIR', 'nir_date', 'date', 15, 14],
        ['Ora NIR', 'nir_time', 'time', 30, 12],
        ['Data recepției', 'reception_date', 'date', 15, 17],
        ['Ora recepției', 'reception_time', 'time', 30, 15],
        ['Furnizor', 'supplier_name', 'string', 10, 28],
        ['CUI furnizor', 'supplier_cui', 'string', 10, 18],
        ['Serie factură', 'supplier_invoice_series', 'string', 10, 16],
        ['Număr factură', 'supplier_invoice_number', 'string', 10, 20],
        ['Data facturii', 'supplier_invoice_date', 'date', 15, 16],
        ['Gestiune', 'warehouse_name', 'string', 10, 24],
        ['Monedă', 'currency', 'string', 9, 11],
        ['Curs valutar', 'exchange_rate', 'number', 31, 15],
        ['Data cursului', 'exchange_rate_date', 'date', 15, 16],
        ['Poziții', 'line_count', 'number', 11, 11],
        ['Cantitate facturată', 'invoiced_quantity', 'number', 11, 19],
        ['Cantitate recepționată', 'received_quantity', 'number', 11, 22],
        ['Cantitate acceptată', 'accepted_quantity', 'number', 11, 20],
        ['Cantitate respinsă', 'rejected_quantity', 'number', 11, 19],
        ['Diferență cantitativă', 'quantity_difference', 'number', 11, 21],
        ['Subtotal (monedă)', 'subtotal', 'number', 13, 19],
        ['TVA (monedă)', 'vat_total', 'number', 13, 17],
        ['Total (monedă)', 'grand_total', 'number', 13, 18],
        ['Subtotal RON', 'subtotal_ron', 'number', 12, 17],
        ['TVA RON', 'vat_total_ron', 'number', 12, 15],
        ['Total RON', 'grand_total_ron', 'number', 12, 16],
        ['Cost contabil RON', 'inventory_cost_total_ron', 'number', 12, 20],
        ['Diferență valoare RON', 'total_difference_ron', 'number', 12, 22],
        ['Documente atașate', 'attachment_count', 'number', 11, 20],
        ['NIR inițial', 'original_document_number', 'string', 10, 22],
        ['Observații / motiv', 'notes', 'string', 10, 32],
        ['Confirmat la', 'confirmed_at', 'datetime', 16, 21],
        ['Confirmat de', 'confirmed_by', 'string', 10, 22],
        ['Creat la', 'created_at', 'datetime', 16, 21],
        ['Creat de', 'created_by', 'string', 10, 22],
    ];
}

function shopNirRegistryXlsxStyles(): string
{
    $xf = static function (int $font, int $fill, int $border, string $alignment = '', int $numFmt = 0): string {
        $attributes = ' numFmtId="' . $numFmt . '" fontId="' . $font . '" fillId="' . $fill . '" borderId="' . $border . '" xfId="0" applyFont="1" applyFill="1" applyBorder="1"';
        if ($numFmt > 0) $attributes .= ' applyNumberFormat="1"';
        return '<xf' . $attributes . '><alignment vertical="center"' . $alignment . '/></xf>';
    };
    $styles = array_fill(0, 32, '');
    $styles[0] = $xf(0, 0, 0);
    $styles[1] = $xf(2, 2, 0, ' wrapText="1"');
    $styles[2] = $xf(3, 2, 0);
    $styles[3] = $xf(4, 2, 0);
    $styles[4] = $xf(1, 3, 1, ' horizontal="center" wrapText="1"');
    $styles[5] = $xf(0, 9, 1, ' wrapText="1"');
    for ($index = 6; $index <= 9; $index++) $styles[$index] = $xf(0, 2, 1);
    $styles[10] = $xf(0, 2, 1, ' wrapText="1"');
    $styles[11] = $xf(0, 2, 1, ' horizontal="right"', 165);
    $styles[12] = $xf(0, 2, 1, ' horizontal="right"', 166);
    $styles[13] = $xf(0, 2, 1, ' horizontal="right"', 167);
    $styles[14] = $xf(0, 2, 1, ' horizontal="right"', 168);
    $styles[15] = $xf(0, 2, 1, ' horizontal="center"', 172);
    $styles[16] = $xf(0, 2, 1, ' horizontal="center"', 169);
    $styles[17] = $xf(5, 8, 1, ' horizontal="right"', 166);
    $styles[18] = $xf(0, 2, 1);
    $styles[19] = $xf(0, 9, 1, ' horizontal="center"');
    $styles[20] = $xf(7, 7, 1, ' horizontal="center"');
    $styles[21] = $xf(5, 4, 1, ' horizontal="center"');
    $styles[22] = $xf(0, 9, 1);
    $styles[23] = $xf(3, 8, 1);
    $styles[24] = $xf(0, 9, 1, ' horizontal="right"', 165);
    $styles[25] = $xf(0, 9, 1, ' horizontal="right"', 166);
    $styles[26] = $xf(0, 9, 1, ' horizontal="right"', 167);
    $styles[27] = $xf(0, 9, 1, ' horizontal="center"', 172);
    $styles[28] = $xf(0, 9, 1, ' horizontal="center"', 169);
    $styles[29] = $xf(6, 5, 1, ' horizontal="center"');
    $styles[30] = $xf(0, 2, 1, ' horizontal="center"', 170);
    $styles[31] = $xf(0, 2, 1, ' horizontal="right"', 171);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<numFmts count="8"><numFmt numFmtId="165" formatCode="#,##0.####;[Red]-#,##0.####"/><numFmt numFmtId="166" formatCode="#,##0.00 &quot;lei&quot;;[Red]-#,##0.00 &quot;lei&quot;"/><numFmt numFmtId="167" formatCode="#,##0.00##;[Red]-#,##0.00##"/><numFmt numFmtId="168" formatCode="0.00%;[Red]-0.00%"/><numFmt numFmtId="169" formatCode="dd.mm.yyyy hh:mm:ss"/><numFmt numFmtId="170" formatCode="hh:mm:ss"/><numFmt numFmtId="171" formatCode="0.00000000"/><numFmt numFmtId="172" formatCode="dd.mm.yyyy"/></numFmts>'
        . '<fonts count="8"><font><sz val="10"/><color rgb="FF203A5F"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="24"/><color rgb="FF071B3E"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFF7900"/><name val="Aptos"/></font><font><sz val="9"/><color rgb="FF687B96"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FF071B3E"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FF087F6B"/><name val="Aptos"/></font></fonts>'
        . '<fills count="10"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF062B5C"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FA"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF7900"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8FAF6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3E8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6F9FC"/></patternFill></fill></fills>'
        . '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD8E1EC"/></left><right style="thin"><color rgb="FFD8E1EC"/></right><top style="thin"><color rgb="FFD8E1EC"/></top><bottom style="thin"><color rgb="FFD8E1EC"/></bottom><diagonal/></border></borders>'
        . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="32">' . implode('', $styles) . '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
}

function shopNirBuildRegistryXlsx(array $documents, string $from, string $to, array $user): string
{
    require_once __DIR__ . '/nir-xlsx.php';
    $columns = shopNirRegistryColumns();
    $lastColumn = count($columns);
    $lastColumnLetter = shopNirPremiumXlsxColumn($lastColumn);
    $documentCount = count($documents);
    $lineCount = array_sum(array_map(static fn(array $document): int => (int)($document['line_count'] ?? 0), $documents));
    $attachmentCount = array_sum(array_map(static fn(array $document): int => (int)($document['attachment_count'] ?? 0), $documents));
    $grandTotalRon = array_sum(array_map(static fn(array $document): float => (float)($document['grand_total_ron'] ?? 0), $documents));
    $rows = '';
    $rows .= shopNirPremiumXlsxRow(1, [1 => shopNirPremiumXlsxCellSpec('', 'string', 1), 3 => shopNirPremiumXlsxCellSpec('G-TROTS · REGISTRU DETALIAT NIR', 'string', 1)], 38);
    $rows .= shopNirPremiumXlsxRow(2, [3 => shopNirPremiumXlsxCellSpec('Evidență centralizată pentru recepții și stornări', 'string', 2)], 25);
    $rows .= shopNirPremiumXlsxRow(3, [3 => shopNirPremiumXlsxCellSpec('Perioada ' . $from . ' – ' . $to . ' · generat la ' . date('d.m.Y H:i'), 'string', 3)], 23);
    $rows .= shopNirPremiumXlsxRow(4, [
        1 => shopNirPremiumXlsxCellSpec('DOCUMENTE  ·  ' . $documentCount, 'string', 20),
        9 => shopNirPremiumXlsxCellSpec('POZIȚII  ·  ' . $lineCount, 'string', 21),
        17 => shopNirPremiumXlsxCellSpec('TOTAL CU TVA  ·  ' . number_format($grandTotalRon, 2, ',', '.') . ' lei', 'string', 29),
        25 => shopNirPremiumXlsxCellSpec('ATAȘAMENTE  ·  ' . $attachmentCount, 'string', 20),
        33 => shopNirPremiumXlsxCellSpec('FILTRU ACTIV  ·  ' . $from . ' — ' . $to, 'string', 21),
    ], 31);
    $rows .= shopNirPremiumXlsxRow(5, [], 9);
    $headerRow = 6;
    $headerCells = [];
    foreach ($columns as $index => $column) $headerCells[$index + 1] = shopNirPremiumXlsxCellSpec($column[0], 'string', 4);
    $rows .= shopNirPremiumXlsxRow($headerRow, $headerCells, 42);
    foreach ($documents as $index => $document) {
        $excelRow = $headerRow + $index + 1;
        $cells = [];
        foreach ($columns as $columnIndex => $column) {
            [, $key, $type, $style] = $column;
            if ($index % 2 === 1) $style = [10 => 5, 11 => 24, 12 => 25, 13 => 26, 15 => 27, 16 => 28][$style] ?? $style;
            $value = $key === 'index' ? $index + 1 : ($document[$key] ?? null);
            if ($type === 'date') $value = shopNirPremiumXlsxExcelDate($value);
            elseif ($type === 'datetime') $value = shopNirPremiumXlsxExcelDate($value, true);
            elseif ($type === 'time') $value = shopNirPremiumXlsxExcelTime($value);
            $cells[$columnIndex + 1] = shopNirPremiumXlsxCellSpec($value, $type, $style);
        }
        $rows .= shopNirPremiumXlsxRow($excelRow, $cells, 31);
    }
    $lastRow = max($headerRow, $headerRow + $documentCount);
    $widths = array_map(static fn(array $column): int => (int)$column[4], $columns);
    $media = [];
    $mediaIndex = [];
    $pictures = [];
    foreach ([__DIR__ . '/pdf-assets/logo.jpg', dirname(__DIR__) . '/assets/images/logo.png'] as $logoPath) {
        if (!is_file($logoPath)) continue;
        $logoBytes = file_get_contents($logoPath);
        if (!is_string($logoBytes)) continue;
        $logoImage = shopNirPremiumXlsxNormaliseImage($logoBytes, 180, 180, true);
        if ($logoImage === null) continue;
        $logoMedia = shopNirPremiumXlsxRegisterMedia($media, $mediaIndex, $logoImage, 'gtrots-logo');
        $logoScale = min(72 / max(1, (int)$logoImage['width']), 72 / max(1, (int)$logoImage['height']));
        $pictures[] = ['media' => $logoMedia, 'name' => 'Logo G-Trots', 'description' => 'Identitatea vizuală G-Trots', 'col' => 0, 'row' => 0, 'colOff' => 90000, 'rowOff' => 45000, 'cx' => (int)round((int)$logoImage['width'] * $logoScale * 9525), 'cy' => (int)round((int)$logoImage['height'] * $logoScale * 9525)];
        break;
    }
    $sheet = shopNirPremiumXlsxSheet($rows, $widths, $lastRow, $lastColumn, [
        'merges' => ['A1:B3', 'C1:' . $lastColumnLetter . '1', 'C2:' . $lastColumnLetter . '2', 'C3:' . $lastColumnLetter . '3', 'A4:H4', 'I4:P4', 'Q4:X4', 'Y4:AF4', 'AG4:' . $lastColumnLetter . '4'],
        'auto_filter' => 'A' . $headerRow . ':' . $lastColumnLetter . $lastRow,
        'freeze_rows' => $headerRow,
        'freeze_columns' => 2,
        'drawing' => !empty($pictures),
        'orientation' => 'landscape',
        'paper_size' => 9,
        'fit_to_height' => 0,
        'header' => '&LG-Trots · Registru NIR&R' . $from . ' – ' . $to,
    ]);
    $created = gmdate('Y-m-d\TH:i:s\Z');
    $creator = (string)(shopNirActor($user)['name'] ?? 'G-Trots Management');
    $drawingOverride = '';
    $drawingFiles = [];
    if ($pictures) {
        $drawing = shopNirPremiumXlsxDrawing($pictures);
        $drawingFiles['xl/drawings/drawing1.xml'] = $drawing['xml'];
        $drawingFiles['xl/drawings/_rels/drawing1.xml.rels'] = $drawing['rels'];
        $drawingFiles['xl/worksheets/_rels/sheet1.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
        $drawingOverride = '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
    }
    $files = [
        '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' . $drawingOverride . '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
        '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
        'xl/workbook.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView windowWidth="24000" windowHeight="14000"/></bookViews><sheets><sheet name="Registru NIR" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">\'Registru NIR\'!$A$1:$' . $lastColumnLetter . '$' . $lastRow . '</definedName></definedNames><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>',
        'xl/_rels/workbook.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        'xl/styles.xml' => shopNirRegistryXlsxStyles(),
        'xl/worksheets/sheet1.xml' => $sheet,
        'docProps/core.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Registru detaliat NIR</dc:title><dc:creator>' . shopNirPremiumXlsxXml($creator) . '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' . $created . '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' . $created . '</dcterms:modified></cp:coreProperties>',
        'docProps/app.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>G-Trots Management</Application><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Registru NIR</vt:lpstr></vt:vector></TitlesOfParts><Company>G-Trots România</Company></Properties>',
    ];
    foreach ($drawingFiles as $path => $bytes) $files[$path] = $bytes;
    foreach ($media as $name => $bytes) $files['xl/media/' . $name] = $bytes;
    return shopNirBuildZip($files);
}

function shopNirBundleSafeName(string $value, string $fallback = 'NIR'): string
{
    $safe = preg_replace('/[^A-Za-z0-9._-]+/u', '-', trim($value)) ?? '';
    $safe = trim($safe, '.-_');
    return $safe !== '' ? $safe : $fallback;
}

function shopNirBundleAddAttachments(ZipArchive $zip, PDO $db, string $documentId, string $folder): void
{
    $stmt = $db->prepare('SELECT original_name, storage_name FROM shop_nir_attachments WHERE nir_document_id = ? ORDER BY created_at, id');
    $stmt->execute([$documentId]);
    $usedNames = [];
    foreach ($stmt->fetchAll() as $index => $attachment) {
        $name = basename(str_replace('\\', '/', trim((string)$attachment['original_name'])));
        $name = preg_replace('/[\x00-\x1F\x7F\/:*?"<>|]+/u', '-', $name) ?? '';
        $name = trim($name, '. -');
        if ($name === '') $name = 'document-' . ($index + 1);
        $base = pathinfo($name, PATHINFO_FILENAME);
        $extension = pathinfo($name, PATHINFO_EXTENSION);
        $candidate = $name;
        $suffix = 2;
        while (isset($usedNames[mb_strtolower($candidate)])) $candidate = $base . '-' . $suffix++ . ($extension !== '' ? '.' . $extension : '');
        $usedNames[mb_strtolower($candidate)] = true;
        if (!$zip->addFile(shopNirAttachmentStoredPath((string)$attachment['storage_name']), $folder . 'documente/' . $candidate)) {
            throw new RuntimeException('Un document aferent NIR-ului nu a putut fi adăugat în arhivă.');
        }
    }
}

function shopNirDownloadRegistryBundle(PDO $db, string $from, string $to, bool $includeDocuments, array $user): array
{
    [$from, $to] = shopNirRegistryDateRange($db, $from, $to);
    $documents = shopNirRegistryRows($db, $from, $to);
    if (!$documents) throw new ShopNirHttpException('Nu există NIR-uri în perioada selectată.', 404);
    $registryName = 'Registru_NIR_' . $from . '_' . $to . '.xlsx';
    $registryBytes = shopNirBuildRegistryXlsx($documents, $from, $to, $user);
    if (!$includeDocuments) {
        return ['file_name' => $registryName, 'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content_base64' => base64_encode($registryBytes), 'document_count' => count($documents), 'bundle_type' => 'registry'];
    }
    if (!class_exists('ZipArchive')) throw new RuntimeException('Arhivarea registrului nu este disponibilă pe server.');
    $temporaryPath = tempnam(sys_get_temp_dir(), 'nir_registry_');
    if ($temporaryPath === false) throw new RuntimeException('Arhiva temporară nu a putut fi creată.');
    $zip = new ZipArchive();
    if ($zip->open($temporaryPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        @unlink($temporaryPath);
        throw new RuntimeException('Arhiva registrului nu a putut fi deschisă.');
    }
    $closed = false;
    try {
        if (!$zip->addFromString($registryName, $registryBytes)) throw new RuntimeException('Registrul Excel nu a putut fi adăugat în arhivă.');
        foreach ($documents as $row) {
            $document = shopNirExportRows($db, (string)$row['id'], $user);
            $safeNumber = shopNirBundleSafeName((string)($document['nir_number'] ?? $document['temporary_number'] ?? 'NIR'));
            $folder = $safeNumber . '/';
            $zip->addEmptyDir($safeNumber);
            $zip->addEmptyDir($safeNumber . '/documente');
            if (!$zip->addFromString($folder . $safeNumber . '.pdf', shopNirBuildPdf($document))) throw new RuntimeException('Un PDF NIR nu a putut fi adăugat în arhivă.');
            if (!$zip->addFromString($folder . shopNirXlsxFileName($document), shopNirBuildXlsx($document))) throw new RuntimeException('Un Excel NIR nu a putut fi adăugat în arhivă.');
            shopNirBundleAddAttachments($zip, $db, (string)$row['id'], $folder);
        }
        if (!$zip->close()) throw new RuntimeException('Arhiva registrului nu a putut fi finalizată.');
        $closed = true;
        $bytes = file_get_contents($temporaryPath);
        if ($bytes === false) throw new RuntimeException('Arhiva registrului nu a putut fi citită.');
    } catch (Throwable $error) {
        if (!$closed) @$zip->close();
        throw $error;
    } finally {
        if (is_file($temporaryPath)) @unlink($temporaryPath);
    }
    return ['file_name' => 'Registru_NIR_' . $from . '_' . $to . '.zip', 'mime_type' => 'application/zip', 'content_base64' => base64_encode($bytes), 'document_count' => count($documents), 'bundle_type' => 'complete'];
}
