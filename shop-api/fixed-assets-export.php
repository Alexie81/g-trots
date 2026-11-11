<?php
declare(strict_types=1);

/** Fixed-assets reports use the same navy/orange identity and OOXML primitives as NIR. */
final class GtrotsFixedAssetExport
{
    private const HEADERS = ['Nr. crt.', 'Data doc.', 'Tip doc.', 'Serie/nr. doc.', 'Denumire produs', 'Cantitate', 'Preț unitar', 'Valoare fără TVA', 'TVA %', 'Valoare TVA', 'Valoare totală', 'Data casării', 'Cantitatea casată', 'Cantitate actuală', 'Motivul casării'];

    private static function date($value): string
    {
        return $value ? implode('.', array_reverse(explode('-', substr((string)$value, 0, 10)))) : '';
    }

    private static function period(array $filters): string
    {
        return empty($filters['from']) ? 'Toată perioada' : self::date($filters['from']) . ' - ' . self::date($filters['to']);
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

    public static function xlsx(array $data, array $filters = [], array $company = []): string
    {
        require_once __DIR__ . '/nir-xlsx.php';
        $data = self::withCurrentQuantities($data);
        $cell = static fn($value, string $type = 'string', int $style = 10, ?string $formula = null): array => shopNirPremiumXlsxCellSpec($value, $type, $style, $formula);
        $totals = self::totals($data);
        $rows = shopNirPremiumXlsxRow(1, [3 => $cell('G-TROTS', 'string', 30), 6 => $cell('REGISTRUL MIJLOACELOR FIXE', 'string', 1)], 34);
        $rows .= shopNirPremiumXlsxRow(2, [3 => $cell($company['legal_name'] ?? 'G-Trots România', 'string', 31), 6 => $cell('Documente justificative • Valori • Istoric casări', 'string', 32)], 24);
        $rows .= shopNirPremiumXlsxRow(3, [3 => $cell(self::identity($company), 'string', 32)], 26);
        $rows .= shopNirPremiumXlsxRow(4, [], 9);
        $rows .= shopNirPremiumXlsxRow(5, [1 => $cell('PERIOADA DOCUMENTELOR', 'string', 34), 6 => $cell('POZIȚII ÎN REGISTRU', 'string', 35), 9 => $cell('VALOARE TOTALĂ CU TVA', 'string', 35)], 22);
        $rows .= shopNirPremiumXlsxRow(6, [1 => $cell(self::period($filters), 'string', 34), 6 => $cell($totals['count'], 'number', 35), 9 => $cell($totals['total'], 'number', 36)], 32);
        $rows .= shopNirPremiumXlsxRow(7, [1 => $cell('Sume în lei. Casările sunt afișate cu minus; valorile bunului sunt înscrise o singură dată.', 'string', 32)], 24);
        $rows .= shopNirPremiumXlsxRow(8, [1 => $cell('DOCUMENT JUSTIFICATIV', 'string', 23), 5 => $cell('MIJLOC FIX / VALORI DE ÎNREGISTRARE', 'string', 23), 12 => $cell('ISTORIC CASĂRI', 'string', 23)], 25);
        $headers = [];
        foreach (self::HEADERS as $index => $label) $headers[$index + 1] = $cell($label, 'string', 9);
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
                $style = $money ? 13 : ($index === 12 ? 39 : ($numeric ? 11 : 10));
                $cells[$index + 1] = $cell($value, $numeric ? 'number' : 'string', $style);
            }
            // Large comments must remain readable in Excel, including at print time.
            $height = min(409, max(42, ceil(mb_strlen($reason) / 28) * 14, ceil(mb_strlen((string)$partValues[4]) / 27) * 14));
            $rows .= shopNirPremiumXlsxRow($r++, $cells, $height);
            }
        }
        $lastData = $r - 1;
        $rows .= shopNirPremiumXlsxRow($r, [1 => $cell('TOTAL REGISTRU', 'string', 6), 8 => $cell($totals['net'], 'number', 17, 'SUM(H10:H' . $lastData . ')'), 10 => $cell($totals['vat'], 'number', 17, 'SUM(J10:J' . $lastData . ')'), 11 => $cell($totals['total'], 'number', 36, 'SUM(K10:K' . $lastData . ')')], 34);
        $merges = ['A1:B3', 'C1:E1', 'F1:O1', 'C2:E2', 'F2:O2', 'C3:O3', 'A5:E5', 'F5:H5', 'I5:O5', 'A6:E6', 'F6:H6', 'I6:O6', 'A7:O7', 'A8:D8', 'E8:K8', 'L8:O8', 'A' . $r . ':G' . $r];
        $r += 2;
        $scope = empty($filters['from']) ? 'Registru complet.' : 'Selecție după data documentului.';
        $rows .= shopNirPremiumXlsxRow($r, [1 => $cell($scope . ' Cantitatea actuală arată cantitatea rămasă după fiecare casare. Generat: ' . date('d.m.Y H:i'), 'string', 32)], 26);
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
        $files['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Mijloace fixe" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">\'Mijloace fixe\'!$A$1:$O$' . $r . '</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">\'Mijloace fixe\'!$8:$9</definedName></definedNames><calcPr calcMode="auto" fullCalcOnLoad="1"/></workbook>';
        $files['xl/styles.xml'] = shopNirReferenceXlsxStyles();
        $files['xl/worksheets/sheet1.xml'] = shopNirPremiumXlsxSheet($rows, [7, 13, 15, 18, 32, 11, 15, 16, 9, 15, 18, 13, 13, 14, 32], $r, 15, ['merges' => $merges, 'drawing' => (bool)$pictures, 'freeze_rows' => 9, 'freeze_columns' => 4, 'auto_filter' => 'A9:O' . $lastData, 'fit_to_height' => 0, 'header' => '', 'footer' => '&LG-Trots | Registrul mijloacelor fixe&RPagina &P / &N']);
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
        require_once __DIR__ . '/nir-pdf.php';
        $data = self::withCurrentQuantities($data);
        $e = static fn($v): string => shopNirPdfEscape($v);
        $totals = self::totals($data);
        $logo = shopNirPdfLogoDataUri();
        $html = '<!doctype html><html lang="ro"><head><meta charset="UTF-8"><style>' . self::css() . '</style></head><body>';
        $html .= '<table class="masthead"><tr><td class="brand">' . ($logo ? '<img src="' . $e($logo) . '">' : '') . '<b>G-TROTS</b><div>' . $e($company['legal_name'] ?? 'G-Trots România') . '</div></td><td class="title">REGISTRUL<br>MIJLOACELOR FIXE<small>Documente justificative și evidența casărilor</small></td><td class="report">REGISTRU<br><b>MF</b><small>Sume exprimate în lei</small></td></tr></table>';
        $html .= '<div class="identity">' . $e(self::identity($company)) . '</div><table class="ribbon"><tr><td><small>PERIOADA DOCUMENTELOR</small><b>' . $e(self::period($filters)) . '</b></td><td><small>POZIȚII ÎN REGISTRU</small><b>' . $totals['count'] . '</b></td><td class="grand"><small>VALOARE TOTALĂ CU TVA</small><b>' . shopNirPdfMoney($totals['total']) . '</b></td></tr></table>';
        $scope = empty($filters['from']) ? 'Registru complet, cu toate casările.' : 'Selecție după data documentului, cu toate casările bunurilor selectate.';
        $html .= '<p class="hint">' . $scope . ' Cantitatea actuală arată cantitatea rămasă după fiecare casare; valorile fiecărui bun sunt înscrise o singură dată.</p><table class="items"><colgroup>';
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
        $html .= '</tbody></table><table class="totals"><tr><td><small>TOTAL FĂRĂ TVA</small><b>' . shopNirPdfMoney($totals['net']) . '</b></td><td><small>TOTAL TVA</small><b>' . shopNirPdfMoney($totals['vat']) . '</b></td><td class="grand"><small>TOTAL CU TVA</small><b>' . shopNirPdfMoney($totals['total']) . '</b></td></tr></table><p class="hint">Generat la ' . date('d.m.Y H:i') . ' • G-Trots România</p></body></html>';
        return $html;
    }

    private static function css(): string
    {
        return '@page{size:A4 landscape;margin:8mm 7mm 12mm}body{font-family:DejaVu Sans,sans-serif;font-size:7pt;color:#071b3e;margin:0}table{border-collapse:collapse;width:100%}.masthead{margin-bottom:3mm}.masthead td{vertical-align:middle}.brand{width:34%;font-size:8pt}.brand img{width:15mm;float:left;margin-right:3mm}.brand b{font-size:19pt;display:block}.brand div{margin-top:2mm}.title{font-size:16pt;font-weight:bold;text-align:center;width:46%;line-height:1.15}.title small{display:block;font-size:7pt;color:#667991;margin-top:2mm;font-weight:normal}.report{width:20%;text-align:center;background:#f0f4f9;padding:3mm;border-radius:3mm;font-size:7pt}.report b{display:block;color:#ff7900;font-size:18pt}.report small{display:block;font-size:6pt}.identity{color:#607189;font-size:7pt;margin-bottom:4mm}.ribbon{background:#002654;color:#fff;margin-bottom:3mm}.ribbon td{padding:3mm 5mm;border-right:1px solid #315379}.ribbon td:first-child{width:48%}.ribbon small,.totals small{display:block;font-size:6.5pt;margin-bottom:2mm}.ribbon b{font-size:12pt}.grand{background:#ff7900!important;color:white!important}.hint{font-size:6.5pt;color:#64748b;line-height:1.5;margin:2mm 0 4mm}.items{table-layout:fixed}.items thead{display:table-header-group}.items th{background:#002654;color:#fff;border:1px solid #59738f;padding:2mm .8mm;font-size:6pt;line-height:1.25}.items .groups th{background:#e9eff7;color:#002654;text-align:left;padding:2mm;border:1px solid #ccd7e5;font-size:6.5pt}.items td{border:1px solid #dae2ec;padding:2mm 1mm;font-size:6.3pt;vertical-align:middle;overflow-wrap:break-word}.items tr{page-break-inside:avoid}.even td{background:#f3f6fa}.num{text-align:right}.index{color:#f47712;text-align:center;font-weight:bold}.negative{color:#b33b4c}.totals{page-break-inside:avoid;margin-top:4mm;background:#edf2f8}.totals td{padding:3mm 5mm;border:1px solid #d6e0ec;width:33%}.totals b{font-size:12pt}';
    }

    public static function pdf(array $rows, array $filters, array $company = []): string
    {
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
        $pdf->getCanvas()->page_text(22, 571, 'G-Trots | Registrul mijloacelor fixe', $font, 6, [.38, .45, .55]);
        $pdf->getCanvas()->page_text(733, 571, 'Pagina {PAGE_NUM} / {PAGE_COUNT}', $font, 6, [.38, .45, .55]);
        return $pdf->output();
    }
}
