<?php
declare(strict_types=1);

require_once __DIR__ . '/nir-service.php';
require_once __DIR__ . '/nir-xlsx.php';

/** Dependency-free XLSX renderer for the immutable invoice snapshot. */
final class GtrotsInvoiceXlsx
{
    public static function render(array $invoice): string
    {
        $theme = strtolower(trim((string)($invoice['theme'] ?? 'orange')));
        $themes = [
            'orange' => ['FF8A00', 'FFF2E2', 'A94F00'],
            'green' => ['19A86B', 'E7F8F1', '0C724A'],
            'red' => ['EF4056', 'FFECEF', 'A51F32'],
            'purple' => ['7157D9', 'F0ECFF', '4C35A5'],
        ];
        if (!isset($themes[$theme])) throw new InvalidArgumentException('Tema facturii nu este acceptată pentru Excel.');
        [$accent, $soft, $accentDark] = $themes[$theme];
        $status = strtolower(trim((string)($invoice['status'] ?? 'unpaid')));
        if (!in_array($status, ['paid', 'unpaid', 'return'], true)) throw new InvalidArgumentException('Statusul facturii nu este acceptat pentru Excel.');
        $statusLabel = $status === 'paid' ? 'PLĂTITĂ' : ($status === 'return' ? 'FACTURĂ DE RETUR' : 'NEPLĂTITĂ');
        $statusColor = $status === 'paid' ? '19A86B' : ($status === 'return' ? 'EF4056' : 'FF8A00');
        $currency = strtoupper(trim((string)($invoice['currency'] ?? 'RON'))) ?: 'RON';
        $series = strtoupper(trim((string)($invoice['series'] ?? 'GT'))) ?: 'GT';
        $number = trim((string)($invoice['number'] ?? ''));
        $items = array_values(array_filter((array)($invoice['items'] ?? []), 'is_array'));
        if (!$items) throw new InvalidArgumentException('Factura nu conține poziții pentru exportul Excel.');

        $seller = is_array($invoice['seller'] ?? null) ? $invoice['seller'] : [];
        $buyer = is_array($invoice['buyer'] ?? null) ? $invoice['buyer'] : [];
        $rows = '';
        $merges = ['A1:B3', 'C1:F1', 'C2:F2', 'C3:F3', 'G1:J1', 'G2:J2', 'G3:H3', 'I3:J3', 'A5:E5', 'F5:J5', 'A6:E6', 'F6:J6', 'A7:E9', 'F7:J9', 'A11:J11'];
        $rows .= shopNirPremiumXlsxRow(1, [1 => shopNirPremiumXlsxCellSpec('', 'string', 1), 3 => shopNirPremiumXlsxCellSpec('FACTURĂ FISCALĂ', 'string', 1), 7 => shopNirPremiumXlsxCellSpec($statusLabel, 'string', 17)], 32);
        $rows .= shopNirPremiumXlsxRow(2, [3 => shopNirPremiumXlsxCellSpec(trim((string)($seller['name'] ?? 'G-Trots România')), 'string', 2), 7 => shopNirPremiumXlsxCellSpec($series . ' ' . $number, 'string', 3)], 25);
        $sellerIdentity = implode(' · ', array_values(array_filter([
            trim((string)($seller['cui'] ?? '')) !== '' ? 'CUI ' . trim((string)$seller['cui']) : '',
            trim((string)($seller['registration_number'] ?? '')) !== '' ? 'RC ' . trim((string)$seller['registration_number']) : '',
        ])));
        $rows .= shopNirPremiumXlsxRow(3, [3 => shopNirPremiumXlsxCellSpec($sellerIdentity, 'string', 4), 7 => shopNirPremiumXlsxCellSpec('Emisă: ' . self::dateLabel((string)($invoice['issue_date'] ?? '')), 'string', 4), 9 => shopNirPremiumXlsxCellSpec('Scadență: ' . self::dateLabel((string)($invoice['due_date'] ?? '')), 'string', 4)], 24);
        $rows .= shopNirPremiumXlsxRow(4, [], 9);
        $rows .= shopNirPremiumXlsxRow(5, [1 => shopNirPremiumXlsxCellSpec('FURNIZOR / EMITENT', 'string', 18), 6 => shopNirPremiumXlsxCellSpec('CLIENT / DESTINATAR', 'string', 18)], 24);
        $rows .= shopNirPremiumXlsxRow(6, [1 => shopNirPremiumXlsxCellSpec(trim((string)($seller['name'] ?? '')), 'string', 7), 6 => shopNirPremiumXlsxCellSpec(trim((string)($buyer['name'] ?? '')), 'string', 7)], 26);
        $rows .= shopNirPremiumXlsxRow(7, [1 => shopNirPremiumXlsxCellSpec(self::partyDetails($seller, true), 'string', 5), 6 => shopNirPremiumXlsxCellSpec(self::partyDetails($buyer, false), 'string', 5)], 55);
        $rows .= shopNirPremiumXlsxRow(10, [], 9);
        $rows .= shopNirPremiumXlsxRow(11, [1 => shopNirPremiumXlsxCellSpec('POZIȚII FACTURATE · ' . count($items), 'string', 18)], 25);
        $headers = ['Nr.', 'Cod / SKU', 'Produs sau serviciu', 'U.M.', 'Cantitate', 'Preț unitar fără TVA', 'Reducere %', 'TVA', 'Valoare fără TVA', 'Total'];
        $headerCells = [];
        foreach ($headers as $index => $header) $headerCells[$index + 1] = shopNirPremiumXlsxCellSpec($header, 'string', 6);
        $rows .= shopNirPremiumXlsxRow(12, $headerCells, 42);

        $firstDataRow = 13;
        $dataRow = $firstDataRow;
        foreach ($items as $index => $item) {
            $quantity = (float)($item['quantity'] ?? 0);
            if ($status === 'return') $quantity = -abs($quantity);
            $unitPrice = abs((float)($item['unit_price'] ?? 0));
            $discount = max(0.0, min(100.0, (float)($item['discount_percent'] ?? 0))) / 100;
            $vat = max(0.0, min(100.0, (float)($item['vat_rate'] ?? 0))) / 100;
            $net = $quantity * $unitPrice * (1 - $discount);
            $total = $net * (1 + $vat);
            $rows .= shopNirPremiumXlsxRow($dataRow, [
                1 => shopNirPremiumXlsxCellSpec($index + 1, 'number', 8),
                2 => shopNirPremiumXlsxCellSpec(trim((string)($item['sku'] ?? '')), 'string', 5),
                3 => shopNirPremiumXlsxCellSpec(trim((string)($item['name'] ?? 'Produs')), 'string', 5),
                4 => shopNirPremiumXlsxCellSpec(trim((string)($item['unit'] ?? 'buc.')), 'string', 8),
                5 => shopNirPremiumXlsxCellSpec($quantity, 'number', 8),
                6 => shopNirPremiumXlsxCellSpec($unitPrice, 'number', 9),
                7 => shopNirPremiumXlsxCellSpec($discount, 'percent', 10),
                8 => shopNirPremiumXlsxCellSpec($vat, 'percent', 10),
                9 => shopNirPremiumXlsxCellSpec($net, 'number', 11, 'E' . $dataRow . '*F' . $dataRow . '*(1-G' . $dataRow . ')'),
                10 => shopNirPremiumXlsxCellSpec($total, 'number', 11, 'I' . $dataRow . '*(1+H' . $dataRow . ')'),
            ], 34);
            $dataRow++;
        }
        $lastDataRow = $dataRow - 1;
        $subtotal = array_reduce($items, static function (float $sum, array $item) use ($status): float {
            $value = abs((float)($item['quantity'] ?? 0)) * abs((float)($item['unit_price'] ?? 0)) * (1 - max(0.0, min(100.0, (float)($item['discount_percent'] ?? 0))) / 100);
            return $sum + ($status === 'return' ? -$value : $value);
        }, 0.0);
        $grandTotal = array_reduce($items, static function (float $sum, array $item) use ($status): float {
            $net = abs((float)($item['quantity'] ?? 0)) * abs((float)($item['unit_price'] ?? 0)) * (1 - max(0.0, min(100.0, (float)($item['discount_percent'] ?? 0))) / 100);
            $value = $net * (1 + max(0.0, min(100.0, (float)($item['vat_rate'] ?? 0))) / 100);
            return $sum + ($status === 'return' ? -$value : $value);
        }, 0.0);
        $totalRow = $dataRow + 1;
        $summaryRows = [];
        $discountTotal = max(0.0, (float)($invoice['discount_total'] ?? 0));
        if ($discountTotal > 0) {
            $discountCode = trim((string)($invoice['discount_code'] ?? ''));
            $summaryRows[] = ['REDUCERE APLICATĂ' . ($discountCode !== '' ? ' · ' . $discountCode : '') . ' (inclusă)', -$discountTotal, '', 12, 11];
        }
        array_push($summaryRows,
            ['Subtotal fără TVA', $subtotal, 'SUM(I' . $firstDataRow . ':I' . $lastDataRow . ')', 12, 11],
            ['Total TVA', $grandTotal - $subtotal, 'SUM(J' . $firstDataRow . ':J' . $lastDataRow . ')-SUM(I' . $firstDataRow . ':I' . $lastDataRow . ')', 12, 11],
            ['TOTAL FACTURĂ', $grandTotal, 'SUM(J' . $firstDataRow . ':J' . $lastDataRow . ')', 13, 14]
        );
        foreach ($summaryRows as [$label, $value, $formula, $labelStyle, $valueStyle]) {
            $merges[] = 'G' . $totalRow . ':I' . $totalRow;
            $rows .= shopNirPremiumXlsxRow($totalRow, [7 => shopNirPremiumXlsxCellSpec($label, 'string', $labelStyle), 10 => shopNirPremiumXlsxCellSpec($value, 'number', $valueStyle, $formula)], $labelStyle === 13 ? 31 : 25);
            $totalRow++;
        }

        $payment = is_array($invoice['payment'] ?? null) ? $invoice['payment'] : [];
        $totalRow++;
        $merges[] = 'A' . $totalRow . ':J' . $totalRow;
        $rows .= shopNirPremiumXlsxRow($totalRow, [1 => shopNirPremiumXlsxCellSpec('PLATĂ · ' . trim((string)($payment['method'] ?? '')) . '    |    MONEDĂ · ' . $currency . '    |    REFERINȚĂ · ' . trim((string)($payment['reference'] ?? ($series . ' ' . $number))), 'string', 18)], 28);
        $lastRow = $totalRow;

        $files = [];
        $drawingOverride = '';
        $logo = shopNirPremiumXlsxLogoImage(180, 180);
        if ($logo !== null) {
            $media = []; $mediaIndex = [];
            $mediaName = shopNirPremiumXlsxRegisterMedia($media, $mediaIndex, $logo, 'gtrots-logo');
            $scale = min(88 / max(1, (int)$logo['width']), 88 / max(1, (int)$logo['height']));
            $drawing = shopNirPremiumXlsxDrawing([['media' => $mediaName, 'name' => 'Logo G-Trots', 'description' => 'Logo G-Trots', 'col' => 0, 'row' => 0, 'colOff' => 295000, 'rowOff' => 95000, 'cx' => (int)round((int)$logo['width'] * $scale * 9525), 'cy' => (int)round((int)$logo['height'] * $scale * 9525)]]);
            foreach ($media as $name => $bytes) $files['xl/media/' . $name] = $bytes;
            $files['xl/drawings/drawing1.xml'] = $drawing['xml'];
            $files['xl/drawings/_rels/drawing1.xml.rels'] = $drawing['rels'];
            $files['xl/worksheets/_rels/sheet1.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
            $drawingOverride = '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
        }
        $files['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' . $drawingOverride . '</Types>';
        $files['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
        $files['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView windowWidth="24000" windowHeight="14000"/></bookViews><sheets><sheet name="Factură" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Factură!$A$1:$J$' . $lastRow . '</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">Factură!$12:$12</definedName></definedNames><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>';
        $files['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
        $files['xl/styles.xml'] = self::styles($accent, $soft, $accentDark, $statusColor, $currency);
        $files['xl/worksheets/sheet1.xml'] = shopNirPremiumXlsxSheet($rows, [6, 15, 32, 9, 12, 16, 11, 11, 17, 17], $lastRow, 10, ['merges' => $merges, 'auto_filter' => 'A12:J' . $lastDataRow, 'freeze_rows' => 12, 'drawing' => $logo !== null, 'orientation' => 'landscape', 'paper_size' => 9, 'fit_to_height' => count($items) <= 10 ? 1 : 0, 'header' => '&LG-Trots · Factură ' . $series . ' ' . $number, 'footer' => '&LDocument fiscal generat electronic&RPagina &P / &N']);
        $created = gmdate('Y-m-d\TH:i:s\Z');
        $title = 'Factura ' . $series . ' ' . $number;
        $files['docProps/core.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' . shopNirPremiumXlsxXml($title) . '</dc:title><dc:creator>G-Trots Management</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' . $created . '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' . $created . '</dcterms:modified></cp:coreProperties>';
        $files['docProps/app.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>G-Trots Management</Application><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Factură</vt:lpstr></vt:vector></TitlesOfParts><Company>' . shopNirPremiumXlsxXml(trim((string)($seller['name'] ?? 'G-Trots'))) . '</Company></Properties>';
        return shopNirBuildZip($files);
    }

    private static function partyDetails(array $party, bool $seller): string
    {
        $identity = implode(' · ', array_values(array_filter([
            trim((string)($party['cui'] ?? '')) !== '' ? 'CUI ' . trim((string)$party['cui']) : '',
            trim((string)($party['registration_number'] ?? '')) !== '' ? 'RC ' . trim((string)$party['registration_number']) : '',
        ])));
        $address = implode(', ', array_values(array_filter([$party['address'] ?? '', $party['postal_code'] ?? '', $party['city'] ?? '', $party['county'] ?? '', $party['country'] ?? ''], static fn($value): bool => trim((string)$value) !== '')));
        $contact = implode(' · ', array_values(array_filter([$party['phone'] ?? '', $party['email'] ?? '', $party['website'] ?? ''], static fn($value): bool => trim((string)$value) !== '')));
        $bank = $seller ? implode(' · ', array_values(array_filter([$party['bank_name'] ?? '', $party['iban'] ?? ''], static fn($value): bool => trim((string)$value) !== ''))) : '';
        return implode("\n", array_values(array_filter([
            $identity,
            $address !== '' ? 'Adresă: ' . $address : '',
            $contact !== '' ? 'Contact: ' . $contact : '',
            $bank !== '' ? 'Plată: ' . $bank : '',
        ])));
    }

    private static function dateLabel(string $value): string
    {
        $value = trim($value);
        if ($value === '') return '—';
        try { return (new DateTimeImmutable($value))->format('d.m.Y'); }
        catch (Throwable $error) { return $value; }
    }

    private static function styles(string $accent, string $soft, string $accentDark, string $statusColor, string $currency): string
    {
        $currencyFormat = '#,##0.00 &quot;' . shopNirPremiumXlsxXml($currency) . '&quot;;[Red]-#,##0.00 &quot;' . shopNirPremiumXlsxXml($currency) . '&quot;';
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<numFmts count="4"><numFmt numFmtId="165" formatCode="#,##0.####;[Red]-#,##0.####"/><numFmt numFmtId="166" formatCode="' . $currencyFormat . '"/><numFmt numFmtId="167" formatCode="0.00%"/><numFmt numFmtId="168" formatCode="dd.mm.yyyy"/></numFmts>'
            . '<fonts count="9"><font><sz val="10"/><color rgb="FF242126"/><name val="Aptos"/></font><font><b/><sz val="18"/><color rgb="FF102346"/><name val="Aptos Display"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="13"/><color rgb="FF' . $accentDark . '"/><name val="Aptos Display"/></font><font><sz val="9"/><color rgb="FF6F6871"/><name val="Aptos"/></font><font><b/><sz val="9"/><color rgb="FF' . $accentDark . '"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FF171518"/><name val="Aptos"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="10"/><color rgb="FF' . $accentDark . '"/><name val="Aptos"/></font></fonts>'
            . '<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF' . $accent . '"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF102346"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF' . $soft . '"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5F6F8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF' . $statusColor . '"/><bgColor indexed="64"/></patternFill></fill></fills>'
            . '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9DDE5"/></left><right style="thin"><color rgb="FFD9DDE5"/></right><top style="thin"><color rgb="FFD9DDE5"/></top><bottom style="thin"><color rgb="FFD9DDE5"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="medium"><color rgb="FF' . $accent . '"/></bottom><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="19">'
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            . '<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
            . '<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
            . '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            . '<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="166" fontId="6" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="6" fillId="5" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="7" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            . '<xf numFmtId="166" fontId="7" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            . '<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
            . '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
            . '<xf numFmtId="0" fontId="2" fillId="6" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="5" fillId="4" borderId="2" xfId="0" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
            . '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    }
}
