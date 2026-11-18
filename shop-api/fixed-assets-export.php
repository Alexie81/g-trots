<?php
declare(strict_types=1);

/** Fixed-assets reports use the same navy/orange identity and OOXML primitives as NIR. */
final class GtrotsFixedAssetExport
{
    private const HEADERS = ['Nr. crt.', 'Data doc.', 'Tip doc.', 'Serie/nr. doc.', 'Denumire produs', 'Cantitate', 'Preț unitar', 'Valoare fără TVA', 'TVA %', 'Valoare TVA', 'Valoare totală', 'Data casării', 'Cantitatea casată', 'Cantitate actuală', 'Motivul casării'];

    private static function labels(array $filters): array
    {
        return ($filters['asset_category'] ?? 'fixed_assets') === 'inventory_objects'
            ? ['title' => 'GESTIUNEA OBIECTELOR DE INVENTAR', 'sheet' => 'Obiecte de inventar', 'item' => 'OBIECT DE INVENTAR / VALORI DE ÎNREGISTRARE', 'code' => 'OI', 'footer' => 'Gestiunea obiectelor de inventar']
            : ['title' => 'GESTIUNEA MIJLOACELOR FIXE', 'sheet' => 'Mijloace fixe', 'item' => 'MIJLOC FIX / VALORI DE ÎNREGISTRARE', 'code' => 'MF', 'footer' => 'Gestiunea mijloacelor fixe'];
    }

    private static function date($value): string
    {
        return $value ? implode('.', array_reverse(explode('-', substr((string)$value, 0, 10)))) : '';
    }

    private static function identity(array $company): string
    {
        return implode(' | ', array_filter([
            !empty($company['cui']) ? 'CUI ' . $company['cui'] : '',
            !empty($company['registration_number']) ? 'Reg. Com. ' . $company['registration_number'] : '',
            $company['address'] ?? '',
        ]));
    }

    public static function totals(array $rows): array
    {
        $result = ['count' => 0, 'net' => 0.0, 'vat' => 0.0, 'total' => 0.0];
        foreach ($rows as $row) {
            if (!empty($row['continuation'])) continue;
            $result['count']++;
            $result['net'] += (float)$row['net_value'];
            $result['vat'] += (float)$row['vat_value'];
            $result['total'] += (float)$row['total_value'];
        }
        return $result;
    }

    /** Service rows are chronological within each asset; a continuation is its next disposal. */
    private static function withCurrentQuantities(array $rows): array
    {
        $remaining = 0.0;
        foreach ($rows as &$row) {
            if (empty($row['continuation'])) $remaining = (float)$row['quantity'];
            $remaining = round($remaining + (float)($row['disposed_quantity'] ?? 0), 4);
            $row['current_quantity'] = $remaining;
        }
        unset($row);
        return $rows;
    }

    private static function cells(array $row, int $number): array
    {
        $continued = !empty($row['continuation']);
        return [$continued ? '' : $number, self::date($row['document_date']),
            ['factura' => 'Factură', 'bon' => 'Bon', 'pv' => 'Proces-verbal'][$row['document_type']] ?? $row['document_type'],
            trim($row['series'] . ' ' . $row['document_number']), $row['product_name'],
            $continued ? null : $row['quantity'], $continued ? null : $row['unit_price'],
            $continued ? null : $row['net_value'], $continued ? null : $row['vat_rate'],
            $continued ? null : $row['vat_value'], $continued ? null : $row['total_value'],
            self::date($row['disposal_date'] ?? ''), $row['disposed_quantity'] ?? null, $row['current_quantity'], $row['disposal_reason'] ?? ''];
    }

    /**
     * Adds a small, report-specific design layer over the shared NIR workbook styles.
     * Existing style ids remain untouched so the shared XLSX engine keeps its contract.
     */
    private static function xlsxStyles(): string
    {
        $xml = shopNirReferenceXlsxStyles();
        $fonts = '<font><b/><sz val="9"/><color rgb="FFFF7900"/><name val="Aptos"/></font>'
            . '<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>'
            . '<font><sz val="8"/><color rgb="FFCAD5E5"/><name val="Aptos"/></font>'
            . '<font><sz val="8"/><color rgb="FF64748B"/><name val="Aptos"/></font>'
            . '<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>'
            . '<font><b/><sz val="8"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>'
            . '<font><sz val="9"/><color rgb="FF18324F"/><name val="Aptos"/></font>'
            . '<font><b/><sz val="9"/><color rgb="FF0B2748"/><name val="Aptos"/></font>'
            . '<font><b/><sz val="14"/><color rgb="FFFF7900"/><name val="Aptos Display"/></font>';
        $fills = '<fill><patternFill patternType="solid"><fgColor rgb="FF0A213D"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFEAF3FF"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1E5"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFF7F9FC"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FF143556"/></patternFill></fill>';
        $borders = '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>'
            . '<border><left style="thin"><color rgb="FFD9E4F0"/></left><right style="thin"><color rgb="FFD9E4F0"/></right><top style="thin"><color rgb="FFD9E4F0"/></top><bottom style="thin"><color rgb="FFD9E4F0"/></bottom><diagonal/></border>'
            . '<border><left style="medium"><color rgb="FFFF7900"/></left><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>';
        $xf = static function (int $font, int $fill, int $border, string $align = '', int $numFmt = 0): string {
            $attrs = ' numFmtId="' . $numFmt . '" fontId="' . $font . '" fillId="' . $fill . '" borderId="' . $border . '" xfId="0" applyFont="1" applyFill="1" applyBorder="1"';
            if ($numFmt > 0) $attrs .= ' applyNumberFormat="1"';
            return '<xf' . $attrs . '><alignment vertical="center"' . $align . '/></xf>';
        };
        $styles = [
            $xf(17, 0, 0),                                                       // 43 brand on white
            $xf(2, 0, 0, ' horizontal="center" wrapText="1"'),                 // 44 title on white
            $xf(0, 0, 0, ' horizontal="center" wrapText="1"'),                 // 45 subtitle on white
            $xf(0, 0, 2, ' wrapText="1"'),                                      // 46 identity on white
            $xf(11, 13, 0, ' horizontal="left" indent="1" wrapText="1"'),      // 47 metric label
            $xf(13, 13, 0, ' horizontal="left" indent="1" wrapText="1"'),      // 48 metric value
            $xf(14, 6, 0, ' horizontal="left" indent="1" wrapText="1"'),       // 49 orange metric label
            $xf(14, 6, 0, ' horizontal="left" indent="1" shrinkToFit="1"', 166), // 50 orange metric value
            $xf(12, 12, 0, ' wrapText="1"'),                                    // 51 note
            $xf(17, 10, 3, ' wrapText="1"'),                                    // 52 group
            $xf(14, 9, 3, ' horizontal="center" wrapText="1"'),               // 53 column header
            $xf(16, 0, 2, ' wrapText="1"'),                                     // 54 body text
            $xf(16, 0, 2, ' horizontal="center"'),                              // 55 body number
            $xf(16, 0, 2, ' horizontal="right" shrinkToFit="1"', 166),         // 56 body money
            $xf(7, 8, 2, ' horizontal="center"'),                               // 57 disposal
            $xf(17, 11, 3, ' horizontal="right" wrapText="1"'),               // 58 total label
            $xf(14, 6, 3, ' horizontal="right" shrinkToFit="1"', 166),         // 59 grand total
            $xf(9, 0, 2, ' horizontal="center"'),                               // 60 row index
            $xf(8, 0, 2, ' horizontal="center"'),                               // 61 current quantity
            $xf(0, 0, 0, ' wrapText="1"'),                                      // 62 company identity
        ];
        $xml = str_replace('<fonts count="9">', '<fonts count="18">', $xml);
        $xml = str_replace('</fonts><fills count="9">', $fonts . '</fonts><fills count="14">', $xml);
        $xml = str_replace('</fills><borders count="2">', $fills . '</fills><borders count="5">', $xml);
        $xml = str_replace('</borders><cellStyleXfs', $borders . '</borders><cellStyleXfs', $xml);
        $xml = str_replace('<cellXfs count="43">', '<cellXfs count="63">', $xml);
        $xml = str_replace('</cellXfs><cellStyles', implode('', $styles) . '</cellXfs><cellStyles', $xml);
        return $xml;
    }

    public static function xlsx(array $data, array $filters = [], array $company = []): string
    {
        $labels = self::labels($filters);
        require_once __DIR__ . '/nir-xlsx.php';
        $data = self::withCurrentQuantities($data);
        $cell = static fn($value, string $type = 'string', int $style = 10, ?string $formula = null): array => shopNirPremiumXlsxCellSpec($value, $type, $style, $formula);
        $totals = self::totals($data);
        $rows = shopNirPremiumXlsxRow(1, [3 => $cell('G-TROTS', 'string', 43), 7 => $cell($labels['title'], 'string', 44)], 40);
        $rows .= shopNirPremiumXlsxRow(2, [3 => $cell($company['legal_name'] ?? 'G-Trots România', 'string', 62), 7 => $cell('Documente justificative  •  Valori  •  Istoric casări', 'string', 45)], 28);
        $rows .= shopNirPremiumXlsxRow(3, [3 => $cell(self::identity($company), 'string', 46)], 27);
        $rows .= shopNirPremiumXlsxRow(4, [], 11);
        $rows .= shopNirPremiumXlsxRow(5, [1 => $cell('POZIȚII ÎN GESTIUNE', 'string', 47), 9 => $cell('VALOARE TOTALĂ CU TVA', 'string', 49)], 22);
        $rows .= shopNirPremiumXlsxRow(6, [1 => $cell($totals['count'], 'number', 48), 9 => $cell($totals['total'], 'number', 50)], 34);
        $rows .= shopNirPremiumXlsxRow(7, [1 => $cell('INFORMAȚIE  •  Sume în lei. Casările sunt afișate cu minus; valorile bunului sunt înscrise o singură dată.', 'string', 51)], 25);
        $rows .= shopNirPremiumXlsxRow(8, [1 => $cell('DOCUMENT JUSTIFICATIV', 'string', 52), 5 => $cell($labels['item'], 'string', 52), 12 => $cell('ISTORIC CASĂRI', 'string', 52)], 26);
        $headers = [];
        foreach (self::HEADERS as $index => $label) $headers[$index + 1] = $cell($label, 'string', 53);
        $rows .= shopNirPremiumXlsxRow(9, $headers, 38);
        $r = 10; $number = 0;
        foreach ($data as $entry) {
            if (empty($entry['continuation'])) $number++;
            $values = self::cells($entry, $number);
            // Excel limits a row to 409 points: continue long notes on another row.
            foreach (mb_str_split((string)$values[14], 600) ?: [''] as $part => $reason) {
            $partValues = $part === 0 ? $values : array_fill(0, 15, null);
            $partValues[14] = $reason;
            $cells = [];
            foreach ($partValues as $index => $value) {
                $numeric = in_array($index, [0, 5, 6, 7, 8, 9, 10, 12, 13], true);
                $money = in_array($index, [6, 7, 9, 10], true);
                $style = $index === 0 ? 60 : ($money ? 56 : ($index === 12 ? 57 : ($index === 13 ? 61 : ($numeric ? 55 : 54))));
                $cells[$index + 1] = $cell($value, $numeric ? 'number' : 'string', $style);
            }
            // Large comments must remain readable in Excel, including at print time.
            $height = min(409, max(42, ceil(mb_strlen($reason) / 28) * 14, ceil(mb_strlen((string)$partValues[4]) / 27) * 14));
            $rows .= shopNirPremiumXlsxRow($r++, $cells, $height);
            }
        }
        $lastData = $r - 1;
        $rows .= shopNirPremiumXlsxRow($r, [1 => $cell('TOTAL GESTIUNE', 'string', 58), 8 => $cell($totals['net'], 'number', 58, 'SUM(H10:H' . $lastData . ')'), 10 => $cell($totals['vat'], 'number', 58, 'SUM(J10:J' . $lastData . ')'), 11 => $cell($totals['total'], 'number', 59, 'SUM(K10:K' . $lastData . ')')], 36);
        $merges = ['A1:B3', 'C1:F1', 'G1:O1', 'C2:F2', 'G2:O2', 'C3:O3', 'A5:H5', 'I5:O5', 'A6:H6', 'I6:O6', 'A7:O7', 'A8:D8', 'E8:K8', 'L8:O8', 'A' . $r . ':G' . $r];
        $r += 2;
        $rows .= shopNirPremiumXlsxRow($r, [1 => $cell('Gestiune completă. Cantitatea actuală arată cantitatea rămasă după fiecare casare. Generat: ' . date('d.m.Y H:i'), 'string', 51)], 27);
        $merges[] = 'A' . $r . ':O' . $r;
        $files = []; $media = []; $mediaIndex = []; $pictures = [];
        $logo = shopNirPremiumXlsxLogoImage(120, 120);
        if ($logo !== null) {
            $name = shopNirPremiumXlsxRegisterMedia($media, $mediaIndex, $logo, 'gtrots-logo');
            $scale = min(68 / $logo['width'], 68 / $logo['height']);
            $pictures[] = ['media' => $name, 'name' => 'G-Trots', 'description' => 'Logo G-Trots', 'col' => 0, 'row' => 0, 'colOff' => 8 * 9525, 'rowOff' => 8 * 9525, 'cx' => (int)($logo['width'] * $scale * 9525), 'cy' => (int)($logo['height'] * $scale * 9525)];
            $drawing = shopNirPremiumXlsxDrawing($pictures);
            $files['xl/drawings/drawing1.xml'] = $drawing['xml'];
            $files['xl/drawings/_rels/drawing1.xml.rels'] = $drawing['rels'];
            $files['xl/worksheets/_rels/sheet1.xml.rels'] = self::relationships(['drawing' => '../drawings/drawing1.xml']);
            foreach ($media as $name => $bytes) $files['xl/media/' . $name] = $bytes;
        }
        $files['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' . ($pictures ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : '') . '</Types>';
        $files['_rels/.rels'] = self::relationships(['officeDocument' => 'xl/workbook.xml']);
        $files['xl/_rels/workbook.xml.rels'] = self::relationships(['worksheet' => 'worksheets/sheet1.xml', 'styles' => 'styles.xml']);
        $files['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' . $labels['sheet'] . '" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">\'' . $labels['sheet'] . '\'!$A$1:$O$' . $r . '</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">\'' . $labels['sheet'] . '\'!$8:$9</definedName></definedNames><calcPr calcMode="auto" fullCalcOnLoad="1"/></workbook>';
        $files['xl/styles.xml'] = self::xlsxStyles();
        $files['xl/worksheets/sheet1.xml'] = shopNirPremiumXlsxSheet($rows, [7, 13, 15, 18, 32, 11, 15, 16, 9, 15, 18, 13, 13, 14, 32], $r, 15, ['merges' => $merges, 'drawing' => (bool)$pictures, 'freeze_rows' => 9, 'freeze_columns' => 4, 'auto_filter' => 'A9:O' . $lastData, 'fit_to_height' => 0, 'header' => '', 'footer' => '&LG-Trots | ' . $labels['footer'] . '&RPagina &P / &N']);
        return shopNirBuildZip($files);
    }

    private static function relationships(array $targets): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        $i = 1;
        foreach ($targets as $type => $target) $xml .= '<Relationship Id="rId' . $i++ . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' . $type . '" Target="' . $target . '"/>';
        return $xml . '</Relationships>';
    }

    public static function html(array $data, array $filters, array $company): string
    {
        $labels = self::labels($filters);
        require_once __DIR__ . '/nir-pdf.php';
        $data = self::withCurrentQuantities($data);
        $e = static fn($v): string => shopNirPdfEscape($v);
        $totals = self::totals($data);
        $logo = shopNirPdfLogoDataUri();
        $html = '<!doctype html><html lang="ro"><head><meta charset="UTF-8"><style>' . self::css() . '</style></head><body>';
        $html .= '<div class="hero"><table class="masthead"><tr><td class="brand">' . ($logo ? '<img src="' . $e($logo) . '">' : '') . '<b>G-TROTS</b><div>' . $e($company['legal_name'] ?? 'G-Trots România') . '</div></td><td class="title">' . $labels['title'] . '<small>Documente justificative • Valori • Istoric casări</small></td><td class="report"><span>GESTIUNE</span><b>' . $labels['code'] . '</b><small>Sume exprimate în lei</small></td></tr></table>';
        $html .= '<div class="identity">' . $e(self::identity($company)) . '</div></div><table class="ribbon"><tr><td><small>POZIȚII ÎN GESTIUNE</small><b>' . $totals['count'] . '</b></td><td class="grand"><small>VALOARE TOTALĂ CU TVA</small><b>' . shopNirPdfMoney($totals['total']) . '</b></td></tr></table>';
        $html .= '<div class="hint"><b>INFORMAȚIE</b><span>Gestiune completă, cu toate casările. Cantitatea actuală arată cantitatea rămasă după fiecare casare; valorile fiecărui bun sunt înscrise o singură dată.</span></div><div class="table-card"><table class="items"><colgroup>';
        $widths = [2.5, 6, 6, 6.5, 14.5, 4.5, 6.5, 7, 3.5, 6.5, 7, 6, 5.5, 5.5, 12.5];
        foreach ($widths as $width) $html .= '<col style="width:' . $width . '%">';
        // Dompdf needs widths on the cells; colgroup alone is ignored.
        $html .= '</colgroup><thead><tr>';
        foreach (self::HEADERS as $index => $header) $html .= '<th style="width:' . $widths[$index] . '%">' . $e($header) . '</th>';
        $html .= '</tr></thead><tbody>';
        $number = 0;
        foreach ($data as $row) {
            if (empty($row['continuation'])) $number++;
            $cells = self::cells($row, $number);
            // Split long reasons into continuation rows so Dompdf can paginate them safely.
            $reason = (string)$cells[14];
            $chunks = mb_str_split($reason, 300) ?: [''];
            foreach ($chunks as $chunkIndex => $chunk) {
                $html .= '<tr class="' . ($number % 2 ? 'odd' : 'even') . '">';
                foreach ($cells as $i => $value) {
                    if ($chunkIndex > 0 && $i !== 14) $value = '';
                    if ($i === 14) $value = $chunk;
                    $numeric = in_array($i, [5, 6, 7, 8, 9, 10, 12, 13], true);
                    if ($value !== null && $value !== '' && $numeric) $value = in_array($i, [5, 8, 12, 13], true) ? shopNirPdfDecimal($value, 4) : number_format((float)$value, 2, ',', '.');
                    $html .= '<td class="' . ($numeric ? 'num ' : '') . ($i === 0 ? 'index ' : '') . ($i === 12 ? 'negative' : '') . '">' . $e($value) . '</td>';
                }
                $html .= '</tr>';
            }
        }
        $html .= '</tbody></table></div><table class="totals"><tr><td><small>TOTAL FĂRĂ TVA</small><b>' . shopNirPdfMoney($totals['net']) . '</b></td><td><small>TOTAL TVA</small><b>' . shopNirPdfMoney($totals['vat']) . '</b></td><td class="grand"><small>TOTAL CU TVA</small><b>' . shopNirPdfMoney($totals['total']) . '</b></td></tr></table><p class="generated">Generat la ' . date('d.m.Y H:i') . ' • G-Trots România</p></body></html>';
        return $html;
    }

    private static function css(): string
    {
        return '@page{size:A4 landscape;margin:7mm 7mm 12mm}'
            . 'body{font-family:DejaVu Sans,sans-serif;font-size:7pt;color:#132b47;margin:0}'
            . 'table{border-collapse:collapse;width:100%}'
            . '.hero{background:#fff;border:1px solid #dce5ef;border-radius:5mm;padding:4mm 5mm 3mm;margin-bottom:3mm;color:#0a213d}'
            . '.masthead td{vertical-align:middle}.brand{width:30%;font-size:7.5pt}.brand img{width:14mm;float:left;margin-right:3mm}.brand b{font-size:18pt;display:block;color:#ff8a1f;letter-spacing:.5pt}.brand div{margin-top:1.5mm;color:#64748b}'
            . '.title{font-size:16pt;font-weight:bold;text-align:center;width:50%;line-height:1.15;color:#0a213d}.title small{display:block;font-size:7pt;color:#64748b;margin-top:2mm;font-weight:normal}'
            . '.report{width:20%;text-align:center;background:#fff7ef;border:1px solid #ffe1c2;padding:2.5mm;border-radius:4mm;font-size:7pt}.report span{color:#64748b}.report b{display:block;color:#ff7900;font-size:17pt;line-height:1.15}.report small{display:block;font-size:5.8pt;color:#64748b}'
            . '.identity{color:#64748b;font-size:6.5pt;border-top:1px solid #e2e8f0;margin-top:3mm;padding-top:2.5mm}'
            . '.ribbon{border-collapse:separate;border-spacing:2.5mm 0;margin:0 -2.5mm 3mm;width:calc(100% + 5mm);color:#fff}.ribbon td{background:#143556;padding:3mm 4mm;border-radius:4mm;width:50%}'
            . '.ribbon small,.totals small{display:block;font-size:6.2pt;margin-bottom:1.5mm;letter-spacing:.15pt;color:#cad5e5}.ribbon b{font-size:11pt}.grand{background:#ff7900!important;color:#fff!important}.grand small{color:#fff!important}'
            . '.hint{background:#f5f8fc;border-left:1.4mm solid #ff7900;border-radius:2.8mm;padding:2.4mm 3mm;margin:0 0 3mm;color:#5c6f86;font-size:6.3pt;line-height:1.45}.hint b{color:#0a213d;margin-right:2.5mm;font-size:6pt}.hint span{display:inline}'
            . '.table-card{border:1px solid #dce5ef;border-radius:3.5mm;overflow:hidden}.items{table-layout:fixed;border-collapse:separate;border-spacing:0}.items thead{display:table-header-group}.items th{background:#0a213d;color:#fff;border-right:1px solid #294866;border-bottom:1px solid #294866;padding:2.2mm .8mm;font-size:5.9pt;line-height:1.25}.items th:first-child{border-top-left-radius:3mm}.items th:last-child{border-top-right-radius:3mm;border-right:0}'
            . '.items td{border-right:1px solid #e5ebf2;border-bottom:1px solid #e5ebf2;padding:2mm 1mm;font-size:6.2pt;vertical-align:middle;overflow-wrap:break-word}.items td:last-child{border-right:0}.items tbody tr:last-child td{border-bottom:0}.items tr{page-break-inside:avoid}.even td{background:#f7f9fc}.num{text-align:right}.index{color:#f47712;text-align:center;font-weight:bold}.negative{color:#b33b4c;font-weight:bold}'
            . '.totals{page-break-inside:avoid;border-collapse:separate;border-spacing:2.5mm 0;margin:4mm -2.5mm 0;width:calc(100% + 5mm)}.totals td{padding:3mm 4mm;width:33%;background:#f3f6fa;border:1px solid #dce5ef;border-radius:3.5mm}.totals small{color:#63768d}.totals b{font-size:11.5pt;color:#0a213d}.totals .grand b{color:#fff!important}.generated{font-size:6pt;color:#7b8ba0;text-align:right;margin:2.5mm 0 0}';
    }

    public static function pdf(array $rows, array $filters, array $company = []): string
    {
        $labels = self::labels($filters);
        $html = self::html($rows, $filters, $company);
        $options = new Dompdf\Options();
        $options->set('isRemoteEnabled', false);
        $options->set('isPhpEnabled', false);
        $options->set('isFontSubsettingEnabled', true);
        $pdf = new Dompdf\Dompdf($options);
        $pdf->setPaper('A4', 'landscape');
        $pdf->loadHtml($html, 'UTF-8');
        $pdf->render();
        $font = $pdf->getFontMetrics()->getFont('DejaVu Sans', 'normal');
        $pdf->getCanvas()->page_text(22, 571, 'G-Trots | ' . $labels['footer'], $font, 6, [.38, .45, .55]);
        $pdf->getCanvas()->page_text(733, 571, 'Pagina {PAGE_NUM} / {PAGE_COUNT}', $font, 6, [.38, .45, .55]);
        return $pdf->output();
    }
}
