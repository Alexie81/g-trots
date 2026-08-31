<?php
declare(strict_types=1);

/**
 * Premium, dependency-free OOXML renderer for a NIR export.
 *
 * The caller must load nir-service.php first because the archive is assembled
 * through shopNirBuildZip(), including on hosts where ZipArchive is unavailable.
 */

function shopNirPremiumXlsxXml($value): string
{
    $text = (string)$value;
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
    return htmlspecialchars(mb_substr($text, 0, 32767), ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function shopNirPremiumXlsxColumn(int $number): string
{
    $column = '';
    while ($number > 0) {
        $number--;
        $column = chr(65 + ($number % 26)) . $column;
        $number = intdiv($number, 26);
    }
    return $column;
}

function shopNirPremiumXlsxNumber($value): ?float
{
    if ($value === null || $value === '' || !is_numeric((string)$value)) return null;
    $number = (float)$value;
    return is_finite($number) ? $number : null;
}

function shopNirPremiumXlsxExcelDate($value, bool $withTime = false): ?float
{
    $raw = trim((string)$value);
    if ($raw === '') return null;
    try {
        $displayTimezone = new DateTimeZone('Europe/Bucharest');
        $date = (new DateTimeImmutable($raw, $displayTimezone))->setTimezone($displayTimezone);
        // Excel serials represent calendar fields, not elapsed UTC seconds.  A
        // timestamp difference against Bucharest in 1899 would include the
        // historical 01:44 offset and move modern dates onto the previous day.
        $calendarDate = new DateTimeImmutable($date->format('Y-m-d H:i:s'), new DateTimeZone('UTC'));
        $base = new DateTimeImmutable('1899-12-30 00:00:00', new DateTimeZone('UTC'));
        $seconds = (float)($calendarDate->getTimestamp() - $base->getTimestamp());
        $serial = $seconds / 86400;
        return $withTime ? $serial : floor($serial);
    } catch (Throwable $error) {
        return null;
    }
}

function shopNirPremiumXlsxExcelTime($value): ?float
{
    $raw = trim((string)$value);
    if ($raw === '') return null;
    if (!preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?/', $raw, $matches)) return null;
    $hours = (int)$matches[1];
    $minutes = (int)$matches[2];
    $seconds = isset($matches[3]) ? (int)$matches[3] : 0;
    if ($hours > 23 || $minutes > 59 || $seconds > 59) return null;
    return ($hours * 3600 + $minutes * 60 + $seconds) / 86400;
}

function shopNirPremiumXlsxDocumentNumber($value, $date = null): string
{
    $raw = strtoupper(trim((string)($value ?? '')));
    if (preg_match('/^(?:NIR|REV|STO)-(\d{4})-(\d+)$/', $raw, $matches)) {
        return 'NIR-' . $matches[1] . '-' . str_pad($matches[2], 6, '0', STR_PAD_LEFT);
    }
    if (preg_match('/^NIR-(\d+)$/', $raw, $matches)) {
        $dateRaw = trim((string)($date ?? ''));
        $year = preg_match('/(\d{4})/', $dateRaw, $yearMatch) ? $yearMatch[1] : date('Y');
        return 'NIR-' . $year . '-' . str_pad($matches[1], 6, '0', STR_PAD_LEFT);
    }
    return $raw;
}

function shopNirPremiumXlsxPresentationText($value): string
{
    $text = trim((string)($value ?? ''));
    if ($text === '') return '';
    $text = preg_replace_callback(
        '/\b(?:NIR|REV|STO)-\d{4}-\d+\b/iu',
        static fn(array $matches): string => shopNirPremiumXlsxDocumentNumber($matches[0]),
        $text
    ) ?? $text;
    return str_ireplace(['reversare', 'reversat', 'reversal', 'reversed', 'storno'], ['stornare', 'stornat', 'stornare', 'stornat', 'stornare'], $text);
}

function shopNirPremiumXlsxIsStornoDocument(array $document): bool
{
    return trim((string)($document['reversal_of_id'] ?? '')) !== ''
        || strtolower(trim((string)($document['source_type'] ?? ''))) === 'reversal';
}

function shopNirPremiumXlsxAuditAction($value): string
{
    $raw = strtoupper(trim((string)($value ?? '')));
    if ($raw === '') return '';
    if (str_contains($raw, 'REVERS') || str_contains($raw, 'STORNO')) return 'Stornare înregistrată';
    return $raw;
}

function shopNirPremiumXlsxOriginalInvoiceTrace(array $relationship, array $context = []): string
{
    $original = is_array($relationship['original'] ?? null) ? $relationship['original'] : [];
    $invoiceData = is_array($relationship['original_invoice'] ?? null) ? $relationship['original_invoice'] : [];
    $series = trim((string)($invoiceData['series'] ?? $invoiceData['supplier_invoice_series'] ?? $context['original_invoice_series'] ?? $original['supplier_invoice_series'] ?? $original['invoice_series'] ?? ''));
    $number = trim((string)($invoiceData['number'] ?? $invoiceData['supplier_invoice_number'] ?? $context['original_invoice_number'] ?? $original['supplier_invoice_number'] ?? $original['invoice_number'] ?? ''));
    $invoice = trim($series . ($number !== '' ? ' ' . $number : ''));
    $dateRaw = trim((string)($invoiceData['date'] ?? $invoiceData['supplier_invoice_date'] ?? $context['original_invoice_date'] ?? $original['supplier_invoice_date'] ?? $original['invoice_date'] ?? ''));
    $date = '';
    if ($dateRaw !== '') {
        try {
            $date = (new DateTimeImmutable($dateRaw))->format('d.m.Y');
        } catch (Throwable $error) {
            $date = $dateRaw;
        }
    }
    $nir = shopNirPremiumXlsxDocumentNumber(
        $original['nir_number'] ?? $original['number'] ?? $original['document_number'] ?? $original['temporary_number'] ?? '',
        $original['nir_date'] ?? null
    );
    $parts = [];
    if ($invoice !== '') $parts[] = 'Stornează factura ' . $invoice . ($date !== '' ? ' din data ' . $date : '');
    if ($nir !== '') $parts[] = 'NIR original ' . $nir;
    return implode(', ', $parts);
}

function shopNirPremiumXlsxCellSpec($value = null, string $type = 'string', int $style = 0, ?string $formula = null): array
{
    return ['value' => $value, 'type' => $type, 'style' => $style, 'formula' => $formula];
}

function shopNirPremiumXlsxCell(int $column, int $row, array $spec): string
{
    $reference = shopNirPremiumXlsxColumn($column) . $row;
    $style = max(0, (int)($spec['style'] ?? 0));
    $styleAttribute = $style > 0 ? ' s="' . $style . '"' : '';
    $formula = $spec['formula'] ?? null;
    $value = $spec['value'] ?? null;

    if (is_string($formula) && $formula !== '') {
        $cached = shopNirPremiumXlsxNumber($value);
        return '<c r="' . $reference . '"' . $styleAttribute . '><f>' . shopNirPremiumXlsxXml($formula) . '</f>'
            . ($cached === null ? '' : '<v>' . sprintf('%.12F', $cached) . '</v>') . '</c>';
    }
    if ($value === null || $value === '') return '<c r="' . $reference . '"' . $styleAttribute . '/>';

    $type = (string)($spec['type'] ?? 'string');
    if ($type === 'number' || $type === 'date' || $type === 'datetime' || $type === 'percent') {
        $number = shopNirPremiumXlsxNumber($value);
        if ($number === null) return '<c r="' . $reference . '"' . $styleAttribute . '/>';
        return '<c r="' . $reference . '"' . $styleAttribute . '><v>' . sprintf('%.12F', $number) . '</v></c>';
    }
    if ($type === 'boolean') {
        return '<c r="' . $reference . '" t="b"' . $styleAttribute . '><v>' . ($value ? '1' : '0') . '</v></c>';
    }
    return '<c r="' . $reference . '" t="inlineStr"' . $styleAttribute . '><is><t xml:space="preserve">'
        . shopNirPremiumXlsxXml($value) . '</t></is></c>';
}

/** @param array<int,array<string,mixed>> $cells */
function shopNirPremiumXlsxRow(int $row, array $cells, ?float $height = null, bool $hidden = false): string
{
    ksort($cells, SORT_NUMERIC);
    $attributes = ' r="' . $row . '"';
    if ($height !== null) $attributes .= ' ht="' . number_format($height, 2, '.', '') . '" customHeight="1"';
    if ($hidden) $attributes .= ' hidden="1"';
    $xml = '';
    foreach ($cells as $column => $spec) $xml .= shopNirPremiumXlsxCell((int)$column, $row, $spec);
    return '<row' . $attributes . '>' . $xml . '</row>';
}

function shopNirPremiumXlsxStyles(): string
{
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<numFmts count="8">'
        . '<numFmt numFmtId="165" formatCode="#,##0.####;[Red]-#,##0.####"/>'
        . '<numFmt numFmtId="166" formatCode="#,##0.00 &quot;lei&quot;;[Red]-#,##0.00 &quot;lei&quot;"/>'
        . '<numFmt numFmtId="167" formatCode="#,##0.00##;[Red]-#,##0.00##"/>'
        . '<numFmt numFmtId="168" formatCode="0.00%;[Red]-0.00%"/>'
        . '<numFmt numFmtId="169" formatCode="dd.mm.yyyy hh:mm:ss"/>'
        . '<numFmt numFmtId="170" formatCode="hh:mm:ss"/>'
        . '<numFmt numFmtId="171" formatCode="0.00000000"/>'
        . '<numFmt numFmtId="172" formatCode="dd.mm.yyyy"/>'
        . '</numFmts>'
        . '<fonts count="8">'
        . '<font><sz val="10"/><color rgb="FFE8E4EA"/><name val="Aptos"/><family val="2"/></font>'
        . '<font><b/><sz val="22"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/><family val="2"/></font>'
        . '<font><b/><sz val="10"/><color rgb="FFFF8A24"/><name val="Aptos"/><family val="2"/></font>'
        . '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font>'
        . '<font><b/><sz val="10"/><color rgb="FF5EEAD4"/><name val="Aptos"/><family val="2"/></font>'
        . '<font><i/><sz val="9"/><color rgb="FF99929E"/><name val="Aptos"/><family val="2"/></font>'
        . '<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/><family val="2"/></font>'
        . '<font><b/><sz val="10"/><color rgb="FF101012"/><name val="Aptos"/><family val="2"/></font>'
        . '</fonts>'
        . '<fills count="11">'
        . '<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FF151417"/><bgColor indexed="64"/></patternFill></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FF252228"/><bgColor indexed="64"/></patternFill></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FFF97316"/><bgColor indexed="64"/></patternFill></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FF4B2818"/><bgColor indexed="64"/></patternFill></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FF123D38"/><bgColor indexed="64"/></patternFill></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FF163726"/><bgColor indexed="64"/></patternFill></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FF482028"/><bgColor indexed="64"/></patternFill></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FF302D33"/><bgColor indexed="64"/></patternFill></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FF183246"/><bgColor indexed="64"/></patternFill></fill>'
        . '</fills>'
        . '<borders count="4">'
        . '<border><left/><right/><top/><bottom/><diagonal/></border>'
        . '<border><left style="thin"><color rgb="FF403B43"/></left><right style="thin"><color rgb="FF403B43"/></right><top style="thin"><color rgb="FF403B43"/></top><bottom style="thin"><color rgb="FF403B43"/></bottom><diagonal/></border>'
        . '<border><left/><right/><top/><bottom style="medium"><color rgb="FFF97316"/></bottom><diagonal/></border>'
        . '<border><left style="thin"><color rgb="FF2DD4BF"/></left><right style="thin"><color rgb="FF2DD4BF"/></right><top style="thin"><color rgb="FF2DD4BF"/></top><bottom style="thin"><color rgb="FF2DD4BF"/></bottom><diagonal/></border>'
        . '</borders>'
        . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        . '<cellXfs count="32">'
        . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="5" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="3" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="6" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="165" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>'
        . '<xf numFmtId="166" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>'
        . '<xf numFmtId="167" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>'
        . '<xf numFmtId="168" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>'
        . '<xf numFmtId="172" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>'
        . '<xf numFmtId="169" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>'
        . '<xf numFmtId="165" fontId="4" fillId="6" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="3" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="5" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="3" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="5" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>'
        . '<xf numFmtId="1" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="6" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="3" fillId="7" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="3" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>'
        . '<xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>'
        . '<xf numFmtId="170" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>'
        . '<xf numFmtId="171" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>'
        . '</cellXfs>'
        . '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        . '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>'
        . '</styleSheet>';
}

/** @return array<int,array<string,mixed>> */
function shopNirReferenceXlsxStyles(string $currency = 'RON'): string
{
    $currency = strtoupper(trim($currency)) ?: 'RON';
    $currencyLabel = $currency === 'RON' ? 'lei' : preg_replace('/[^A-Z0-9]/', '', $currency);
    $moneyFormat = '#,##0.00 &quot;' . shopNirPremiumXlsxXml($currencyLabel) . '&quot;;[Red]-#,##0.00 &quot;' . shopNirPremiumXlsxXml($currencyLabel) . '&quot;';
    $xfs = [];
    $xf = static function (int $font, int $fill, int $border, string $align = '', int $numFmt = 0): string {
        $attrs = ' numFmtId="' . $numFmt . '" fontId="' . $font . '" fillId="' . $fill . '" borderId="' . $border . '" xfId="0" applyFont="1" applyFill="1" applyBorder="1"';
        if ($numFmt > 0) $attrs .= ' applyNumberFormat="1"';
        return '<xf' . $attrs . '><alignment vertical="center"' . $align . '/></xf>';
    };
    $xfs[0] = $xf(0, 0, 0);
    for ($i = 1; $i <= 41; $i++) $xfs[$i] = $xf(0, 0, 0);
    $xfs[1] = $xf(2, 0, 0, ' horizontal="center" wrapText="1"');
    $xfs[3] = $xf(1, 3, 1, ' horizontal="center" wrapText="1"');
    $xfs[4] = $xf(1, 4, 1, ' wrapText="1"');
    $xfs[6] = $xf(1, 4, 1, ' horizontal="right"');
    $xfs[8] = $xf(1, 0, 0, ' horizontal="center"');
    $xfs[9] = $xf(3, 2, 1, ' horizontal="center" wrapText="1"');
    $xfs[10] = $xf(0, 0, 1, ' wrapText="1"');
    $xfs[11] = $xf(0, 0, 1, ' horizontal="center"');
    $xfs[13] = $xf(0, 0, 1, ' horizontal="right" shrinkToFit="1"', 166);
    $xfs[17] = $xf(1, 4, 1, ' horizontal="right" shrinkToFit="1"', 166);
    $xfs[19] = $xf(5, 0, 1, ' horizontal="center" wrapText="1"');
    $xfs[23] = $xf(1, 3, 1, ' wrapText="1"');
    $xfs[28] = $xf(6, 5, 1, ' horizontal="center"');
    $xfs[29] = $xf(4, 0, 0, ' horizontal="center"');
    $xfs[30] = $xf(2, 0, 0);
    $xfs[31] = $xf(1, 0, 0);
    $xfs[32] = $xf(5, 0, 0);
    $xfs[33] = $xf(6, 0, 0, ' horizontal="center"');
    $xfs[34] = $xf(3, 2, 0, ' wrapText="1"');
    $xfs[35] = $xf(3, 2, 0, ' horizontal="center" wrapText="1"');
    $xfs[36] = $xf(3, 6, 1, ' horizontal="right" shrinkToFit="1"', 166);
    $xfs[37] = $xf(0, 7, 1, ' wrapText="1"');
    $xfs[38] = $xf(1, 0, 1, ' horizontal="center" wrapText="1"');
    $xfs[39] = $xf(7, 8, 1, ' horizontal="center"');
    $xfs[40] = $xf(8, 0, 1, ' horizontal="center"');
    $xfs[41] = $xf(0, 0, 1, ' horizontal="center"');
    ksort($xfs);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<numFmts count="2"><numFmt numFmtId="165" formatCode="0.####;[Red]-0.####"/><numFmt numFmtId="166" formatCode="' . $moneyFormat . '"/></numFmts>'
        . '<fonts count="9"><font><sz val="9"/><color rgb="FF203A5F"/><name val="Aptos"/></font><font><b/><sz val="9"/><color rgb="FF071B3E"/><name val="Aptos"/></font><font><b/><sz val="18"/><color rgb="FF071B3E"/><name val="Aptos Display"/></font><font><b/><sz val="8"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="24"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><sz val="8"/><color rgb="FF687B96"/><name val="Aptos"/></font><font><b/><sz val="13"/><color rgb="FFFF7900"/><name val="Aptos Display"/></font><font><sz val="9"/><color rgb="FFFF1E1E"/><name val="Aptos"/></font><font><sz val="9"/><color rgb="FF00A441"/><name val="Aptos"/></font></fonts>'
        . '<fills count="9"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF002654"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FA"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F6FA"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFEEEE"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF7900"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFAF0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFECEC"/></patternFill></fill></fills>'
        . '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD8E1EC"/></left><right style="thin"><color rgb="FFD8E1EC"/></right><top style="thin"><color rgb="FFD8E1EC"/></top><bottom style="thin"><color rgb="FFD8E1EC"/></bottom><diagonal/></border></borders>'
        . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="42">' . implode('', $xfs) . '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
}

function shopNirPremiumXlsxPositionColumns(): array
{
    $available = 'Disponibil';
    $derived = 'Derivat';
    $missing = 'Nestocat';
    $definitions = [
        ['EXTRA', 'thumbnail', 'Miniatură', 12, $available, 'lines[].product_image_url'],
        ['IDENTIFICARE NIR', 'nir_internal_id', 'ID NIR intern', 25, $available, 'id'],
        ['IDENTIFICARE NIR', 'nir_series', 'Serie NIR', 14, $missing, '—'],
        ['IDENTIFICARE NIR', 'nir_number', 'Număr NIR', 20, $available, 'nir_number / temporary_number'],
        ['IDENTIFICARE NIR', 'nir_date', 'Data NIR', 13, $available, 'nir_date'],
        ['IDENTIFICARE NIR', 'reception_date', 'Data recepției fizice', 18, $available, 'reception_date'],
        ['IDENTIFICARE NIR', 'reception_time', 'Ora recepției', 14, $available, 'reception_time'],
        ['IDENTIFICARE NIR', 'document_created_date', 'Data creării', 14, $available, 'created_at'],
        ['IDENTIFICARE NIR', 'document_finalized_date', 'Data finalizării', 15, $available, 'confirmed_at'],
        ['IDENTIFICARE NIR', 'status', 'Status NIR', 15, $available, 'status'],
        ['IDENTIFICARE NIR', 'warehouse_name', 'Gestiune', 24, $available, 'pdf_context.warehouse.name / warehouse_name'],
        ['IDENTIFICARE NIR', 'work_point', 'Punct de lucru', 22, $missing, '—'],
        ['IDENTIFICARE NIR', 'reception_location', 'Locație recepție', 22, $missing, '—'],
        ['IDENTIFICARE NIR', 'warehouse_manager', 'Gestionar', 20, $missing, '—'],
        ['IDENTIFICARE NIR', 'received_by', 'Recepționat de', 20, $missing, '—'],
        ['IDENTIFICARE NIR', 'verified_by', 'Verificat de', 20, $missing, '—'],
        ['IDENTIFICARE NIR', 'approved_by', 'Aprobat de', 20, $available, 'confirmed_by'],
        ['IDENTIFICARE NIR', 'general_notes', 'Observații generale NIR', 32, $available, 'notes'],
        ['DOCUMENT FURNIZOR', 'source_document_type', 'Tip document sursă', 20, $derived, 'supplier_invoice_number + source_type'],
        ['DOCUMENT FURNIZOR', 'invoice_series', 'Serie factură', 15, $available, 'supplier_invoice_series'],
        ['DOCUMENT FURNIZOR', 'invoice_number', 'Număr factură', 18, $available, 'supplier_invoice_number'],
        ['DOCUMENT FURNIZOR', 'invoice_date', 'Data facturii', 14, $available, 'supplier_invoice_date'],
        ['DOCUMENT FURNIZOR', 'delivery_note_series', 'Serie aviz', 14, $missing, '—'],
        ['DOCUMENT FURNIZOR', 'delivery_note_number', 'Număr aviz', 16, $missing, '—'],
        ['DOCUMENT FURNIZOR', 'delivery_note_date', 'Data avizului', 14, $missing, '—'],
        ['DOCUMENT FURNIZOR', 'purchase_order_number', 'Număr comandă achiziție', 24, $missing, '—'],
        ['DOCUMENT FURNIZOR', 'awb', 'AWB', 18, $missing, '—'],
        ['DOCUMENT FURNIZOR', 'carrier', 'Transportator', 22, $missing, '—'],
        ['DOCUMENT FURNIZOR', 'currency', 'Monedă', 10, $available, 'currency'],
        ['DOCUMENT FURNIZOR', 'exchange_rate', 'Curs valutar', 14, $available, 'exchange_rate'],
        ['DOCUMENT FURNIZOR', 'exchange_rate_date', 'Data cursului', 14, $available, 'exchange_rate_date'],
        ['DOCUMENT FURNIZOR', 'efactura_index', 'ID / index RO e-Factura, dacă există', 30, $available, 'external_identifier'],
        ['FURNIZOR', 'supplier_id', 'ID furnizor intern', 25, $available, 'supplier_id'],
        ['FURNIZOR', 'supplier_name', 'Denumire furnizor', 28, $available, 'pdf_context.supplier.name / supplier_name'],
        ['FURNIZOR', 'supplier_cui', 'CUI / CIF furnizor', 18, $available, 'pdf_context.supplier.cui / supplier_cui'],
        ['FURNIZOR', 'supplier_vat_number', 'Cod TVA furnizor', 18, $available, 'pdf_context.supplier.vat_number'],
        ['FURNIZOR', 'supplier_registration_number', 'Nr. Registrul Comerțului', 24, $available, 'pdf_context.supplier.registration_number'],
        ['FURNIZOR', 'supplier_country', 'Țară furnizor', 18, $available, 'pdf_context.supplier.country'],
        ['FURNIZOR', 'supplier_county', 'Județ', 18, $available, 'pdf_context.supplier.county'],
        ['FURNIZOR', 'supplier_city', 'Localitate', 18, $available, 'pdf_context.supplier.city'],
        ['FURNIZOR', 'supplier_address', 'Adresă', 32, $available, 'pdf_context.supplier.address + address_line2'],
        ['FURNIZOR', 'supplier_phone', 'Telefon', 18, $available, 'pdf_context.supplier.phone'],
        ['FURNIZOR', 'supplier_email', 'Email', 26, $available, 'pdf_context.supplier.email'],
        ['PRODUS CONFORM FURNIZORULUI', 'line_number', 'Nr. crt.', 9, $available, 'lines[].line_number'],
        ['PRODUS CONFORM FURNIZORULUI', 'line_id', 'ID poziție NIR', 25, $available, 'lines[].id'],
        ['PRODUS CONFORM FURNIZORULUI', 'supplier_product_name', 'Denumire produs furnizor', 32, $available, 'lines[].supplier_product_name'],
        ['PRODUS CONFORM FURNIZORULUI', 'supplier_product_code', 'Cod produs furnizor', 22, $available, 'lines[].supplier_product_code'],
        ['PRODUS CONFORM FURNIZORULUI', 'supplier_sku', 'SKU furnizor, dacă este distinct', 26, $missing, '—'],
        ['PRODUS CONFORM FURNIZORULUI', 'supplier_ean', 'EAN furnizor', 18, $available, 'lines[].supplier_ean'],
        ['PRODUS CONFORM FURNIZORULUI', 'purchase_unit', 'UM furnizor', 14, $available, 'lines[].purchase_unit'],
        ['PRODUS CONFORM FURNIZORULUI', 'supplier_brand', 'Marcă furnizor', 20, $missing, '—'],
        ['PRODUS CONFORM FURNIZORULUI', 'supplier_model', 'Model furnizor', 20, $missing, '—'],
        ['PRODUS CONFORM FURNIZORULUI', 'supplier_variant', 'Variantă / specificație furnizor', 30, $missing, '—'],
        ['PRODUS CONFORM FURNIZORULUI', 'supplier_lot', 'Lot furnizor', 18, $missing, '—'],
        ['PRODUS CONFORM FURNIZORULUI', 'supplier_serial', 'Serie furnizor', 22, $missing, '—'],
        ['PRODUS ASOCIAT G-TROTS', 'product_id', 'ID produs G-Trots', 25, $available, 'lines[].product_id'],
        ['PRODUS ASOCIAT G-TROTS', 'product_name', 'Denumire produs G-Trots', 32, $available, 'lines[].product_name / product_snapshot_name'],
        ['PRODUS ASOCIAT G-TROTS', 'product_sku', 'Cod / SKU G-Trots', 20, $available, 'lines[].product_sku / sku_snapshot'],
        ['PRODUS ASOCIAT G-TROTS', 'product_ean', 'EAN G-Trots', 18, $available, 'lines[].product_ean / ean_snapshot'],
        ['PRODUS ASOCIAT G-TROTS', 'product_category', 'Categorie G-Trots', 22, $available, 'lines[].product_category_name'],
        ['PRODUS ASOCIAT G-TROTS', 'product_subcategory', 'Subcategorie', 20, $available, 'lines[].product_subcategory_name'],
        ['PRODUS ASOCIAT G-TROTS', 'product_brand', 'Marcă', 20, $available, 'lines[].product_brand_names / product_manufacturer_name'],
        ['PRODUS ASOCIAT G-TROTS', 'product_model', 'Model', 18, $missing, '—'],
        ['PRODUS ASOCIAT G-TROTS', 'product_variant', 'Variantă', 18, $missing, '—'],
        ['PRODUS ASOCIAT G-TROTS', 'stock_unit', 'UM G-Trots', 14, $available, 'lines[].stock_unit'],
        ['PRODUS ASOCIAT G-TROTS', 'association_status', 'Status asociere produs', 22, $available, 'lines[].resolution_status'],
        ['PRODUS ASOCIAT G-TROTS', 'association_notes', 'Observații asociere', 28, $available, 'lines[].match_method / match_confidence'],
        ['CANTITĂȚI', 'invoiced_quantity', 'Cantitate facturată', 18, $available, 'lines[].invoiced_quantity'],
        ['CANTITĂȚI', 'received_quantity', 'Cantitate recepționată fizic', 24, $available, 'lines[].received_quantity'],
        ['CANTITĂȚI', 'accepted_quantity', 'Cantitate acceptată în gestiune', 26, $available, 'lines[].accepted_quantity'],
        ['CANTITĂȚI', 'quarantine_quantity', 'Cantitate în carantină / blocată', 28, $missing, '—'],
        ['CANTITĂȚI', 'shortage_quantity', 'Cantitate lipsă', 17, $derived, 'MAX(facturată - recepționată, 0)'],
        ['CANTITĂȚI', 'surplus_quantity', 'Cantitate în plus', 17, $derived, 'MAX(recepționată - facturată, 0)'],
        ['CANTITĂȚI', 'received_difference', 'Diferență recepționat vs facturat', 28, $derived, 'FORMULĂ: recepționată - facturată'],
        ['CANTITĂȚI', 'accepted_difference', 'Diferență acceptat vs facturat', 26, $derived, 'FORMULĂ: acceptată - facturată'],
        ['CANTITĂȚI', 'conversion_factor', 'Factor conversie UM, dacă există', 27, $available, 'lines[].conversion_factor'],
        ['PREȚURI ȘI DISCOUNTURI', 'gross_unit_price', 'Preț unitar brut inițial fără TVA', 28, $available, 'lines[].unit_price'],
        ['PREȚURI ȘI DISCOUNTURI', 'unit_discount', 'Discount unitar', 18, $derived, 'discount total / cantitate facturată'],
        ['PREȚURI ȘI DISCOUNTURI', 'discount_percent', 'Discount procentual', 20, $available, 'lines[].discount_percent'],
        ['PREȚURI ȘI DISCOUNTURI', 'line_discount_total', 'Discount total poziție', 21, $available, 'lines[].discount_value'],
        ['PREȚURI ȘI DISCOUNTURI', 'net_unit_price', 'Preț unitar net fără TVA după discount', 30, $derived, 'line_net / cantitate facturată'],
        ['PREȚURI ȘI DISCOUNTURI', 'vat_rate', 'Cotă TVA %', 13, $available, 'lines[].vat_rate'],
        ['PREȚURI ȘI DISCOUNTURI', 'unit_vat', 'TVA unitar', 16, $derived, 'line_vat / cantitate facturată'],
        ['PREȚURI ȘI DISCOUNTURI', 'unit_price_with_vat', 'Preț unitar cu TVA', 20, $derived, 'net unitar + TVA unitar'],
        ['PREȚURI ȘI DISCOUNTURI', 'line_net', 'Preț total net fără TVA', 23, $available, 'lines[].line_net'],
        ['PREȚURI ȘI DISCOUNTURI', 'line_vat', 'TVA total', 16, $available, 'lines[].line_vat'],
        ['PREȚURI ȘI DISCOUNTURI', 'line_total', 'Preț total cu TVA', 20, $available, 'lines[].line_total'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'allocated_transport', 'Transport alocat poziției', 23, $missing, '—'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'allocated_customs', 'Taxe vamale alocate', 21, $missing, '—'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'allocated_nonrecoverable_taxes', 'Alte taxe nerecuperabile', 24, $missing, '—'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'allocated_direct_costs', 'Alte costuri directe alocate', 26, $missing, '—'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'allocated_cost_ron', 'Cost suplimentar total alocat', 26, $available, 'lines[].allocated_cost_ron'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'inventory_unit_cost_ron', 'Cost unitar de intrare fără TVA', 28, $available, 'lines[].inventory_unit_cost_ron'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'inventory_cost_total_ron', 'Valoare totală de intrare în gestiune', 30, $available, 'lines[].inventory_cost_total_ron'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'deductible_vat', 'TVA deductibilă', 18, $missing, '—'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'nondeductible_vat', 'TVA nedeductibilă', 20, $missing, '—'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'cost_currency', 'Moneda costului', 17, $derived, 'RON pentru câmpurile contabile'],
        ['COSTURI DE ACHIZIȚIE / INTRARE', 'cost_notes', 'Observații calcul cost', 28, $missing, '—'],
        ['RECEPȚIE / CALITATE', 'product_condition', 'Stare produs', 18, $missing, '—'],
        ['RECEPȚIE / CALITATE', 'is_conforming', 'Produs conform DA/NU', 20, $derived, 'diferențe salvate'],
        ['RECEPȚIE / CALITATE', 'difference_reason', 'Tip diferență', 20, $available, 'lines[].difference_reason'],
        ['RECEPȚIE / CALITATE', 'quarantine_reason', 'Motiv carantină', 24, $missing, '—'],
        ['RECEPȚIE / CALITATE', 'nonconformity_description', 'Descriere neconformitate', 30, $available, 'lines[].difference_notes / mismatch_reason'],
        ['RECEPȚIE / CALITATE', 'action_taken', 'Măsură luată', 24, $missing, '—'],
        ['RECEPȚIE / CALITATE', 'return_to_supplier', 'Retur către furnizor DA/NU', 25, $missing, '—'],
        ['RECEPȚIE / CALITATE', 'credit_note_requested', 'Solicitare stornare DA/NU', 23, $missing, '—'],
        ['RECEPȚIE / CALITATE', 'difference_document', 'Document diferență / proces verbal', 30, $missing, '—'],
        ['RECEPȚIE / CALITATE', 'reception_notes', 'Observații recepție', 28, $available, 'lines[].difference_notes / mismatch_reason'],
        ['TRASABILITATE PRODUS', 'individual_serial', 'Serie individuală', 22, $missing, '—'],
        ['TRASABILITATE PRODUS', 'batch', 'Lot / batch', 18, $missing, '—'],
        ['TRASABILITATE PRODUS', 'manufacturing_date', 'Data fabricației', 16, $missing, '—'],
        ['TRASABILITATE PRODUS', 'expiry_date', 'Data expirării, dacă există', 23, $missing, '—'],
        ['TRASABILITATE PRODUS', 'supplier_warranty_duration', 'Durată garanție furnizor', 24, $missing, '—'],
        ['TRASABILITATE PRODUS', 'warranty_start_date', 'Data început garanție', 20, $missing, '—'],
        ['TRASABILITATE PRODUS', 'warranty_end_date', 'Data expirare garanție', 21, $missing, '—'],
        ['TRASABILITATE PRODUS', 'shelf_location', 'Locație / raft', 18, $missing, '—'],
        ['TRASABILITATE PRODUS', 'internal_barcode', 'Cod QR / barcode intern, dacă există', 30, $available, 'lines[].product_ean / ean_snapshot'],
        ['TOTALURI DOCUMENT', 'document_subtotal', 'Total net factură', 18, $available, 'subtotal'],
        ['TOTALURI DOCUMENT', 'document_vat_total', 'Total TVA factură', 18, $available, 'vat_total'],
        ['TOTALURI DOCUMENT', 'document_grand_total', 'Total cu TVA factură', 20, $available, 'grand_total'],
        ['TOTALURI DOCUMENT', 'document_discount_total', 'Total discount factură', 21, $missing, '—'],
        ['TOTALURI DOCUMENT', 'document_transport_total', 'Total transport', 18, $missing, '—'],
        ['TOTALURI DOCUMENT', 'document_customs_total', 'Total taxe vamale', 20, $missing, '—'],
        ['TOTALURI DOCUMENT', 'document_other_costs_total', 'Total alte costuri', 20, $derived, 'SUM(lines[].allocated_cost_ron)'],
        ['TOTALURI DOCUMENT', 'document_inventory_total', 'Total valoare intrată în gestiune', 28, $available, 'inventory_cost_total_ron'],
        ['TOTALURI DOCUMENT', 'document_invoiced_quantity', 'Total cantitate facturată', 22, $derived, 'SUM(lines[].invoiced_quantity)'],
        ['TOTALURI DOCUMENT', 'document_received_quantity', 'Total cantitate recepționată', 25, $derived, 'SUM(lines[].received_quantity)'],
        ['TOTALURI DOCUMENT', 'document_accepted_quantity', 'Total cantitate acceptată', 23, $derived, 'SUM(lines[].accepted_quantity)'],
        ['AUDIT', 'created_by', 'Creat de utilizator', 21, $available, 'created_by'],
        ['AUDIT', 'created_at', 'Data/oră creare', 20, $available, 'created_at'],
        ['AUDIT', 'updated_by', 'Modificat ultima dată de', 24, $available, 'updated_by'],
        ['AUDIT', 'updated_at', 'Data/oră ultima modificare', 24, $available, 'updated_at'],
        ['AUDIT', 'validated_by', 'Validat de', 20, $available, 'confirmed_by'],
        ['AUDIT', 'validated_at', 'Data/oră validare', 20, $available, 'confirmed_at'],
        ['AUDIT', 'cancelled_by', 'Stornat de, dacă este cazul', 25, $available, 'metadate stornare: operator'],
        ['AUDIT', 'cancelled_at', 'Data/oră stornare', 20, $available, 'metadate stornare: moment'],
        ['AUDIT', 'cancellation_reason', 'Motiv stornare', 28, $available, 'pdf_context.relationship.reason'],
        ['AUDIT', 'document_version', 'Versiune NIR', 15, $available, 'row_version'],
        ['AUDIT', 'source_invoice_file_id', 'ID fișier factură sursă', 25, $available, 'pdf_context.attachments[0].id'],
        ['AUDIT', 'source_invoice_file_name', 'Nume fișier factură', 28, $available, 'pdf_context.attachments[0].original_name'],
        ['AUDIT', 'nir_pdf_file_id', 'ID fișier PDF NIR', 24, $missing, '—'],
        ['AUDIT', 'audit_notes', 'Observații audit', 30, $missing, '—'],
    ];

    return array_map(static function (array $definition) use ($missing): array {
        [$group, $key, $title, $width, $availability, $source] = $definition;
        return [
            'group' => $group,
            'key' => $key,
            'title' => $title,
            'width' => $width,
            'availability' => $availability,
            'source' => $source,
            'description' => $availability === $missing
                ? 'Coloană cerută, păstrată goală până când aplicația salvează distinct această informație.'
                : ($availability === 'Derivat' ? 'Valoare derivată transparent din câmpurile existente, fără modificarea datelor NIR.' : 'Valoare preluată din documentul sau contextul NIR.'),
        ];
    }, $definitions);
}

function shopNirPremiumXlsxDocumentType(array $document): string
{
    return shopNirPremiumXlsxIsStornoDocument($document) ? 'STORNARE NIR' : 'INTRARE NIR';
}

function shopNirPremiumXlsxStatus(array $document): string
{
    if (shopNirPremiumXlsxIsStornoDocument($document)) return 'STORNAT';
    return match (strtolower((string)($document['status'] ?? ''))) {
        'confirmed' => 'CONFIRMAT',
        // Compatibilitate cu documentele originale create înaintea separării
        // statutului vizual al NIR-ului de cel al documentului negativ.
        'reversed' => 'CONFIRMAT',
        'draft' => 'CIORNĂ',
        default => strtoupper(trim((string)($document['status'] ?? 'NECUNOSCUT'))),
    };
}

function shopNirPremiumXlsxDifferenceLabel($reason): string
{
    return match (strtolower(trim((string)$reason))) {
        'shortage' => 'Lipsă cantitativă',
        'surplus' => 'Plus cantitativ',
        'damaged' => 'Produs deteriorat',
        'wrong_product' => 'Produs diferit',
        'price_difference' => 'Diferență de preț',
        'vat_difference' => 'Diferență TVA',
        'other' => 'Altă diferență',
        default => trim((string)$reason) !== '' ? 'Neconcordanță semnalată' : '',
    };
}

function shopNirPremiumXlsxAssociationLabel($value): string
{
    return match (strtolower(trim((string)$value))) {
        'matched_code' => 'Recunoscut după cod',
        'matched_name' => 'Recunoscut după denumire',
        'matched_manual' => 'Asociat manual',
        'matching_code', 'matching_name' => 'În curs de recunoaștere',
        'reversal' => 'Preluat din documentul inițial',
        'unmatched', '' => 'Neasociat',
        default => trim((string)$value),
    };
}

function shopNirPremiumXlsxPositionCell(string $key, array $line, array $document, int $excelRow, array $columnMap, bool $hasImage): array
{
    $context = is_array($document['pdf_context'] ?? null) ? $document['pdf_context'] : [];
    $supplier = is_array($context['supplier'] ?? null) ? $context['supplier'] : [];
    $warehouse = is_array($context['warehouse'] ?? null) ? $context['warehouse'] : [];
    $relationship = is_array($context['relationship'] ?? null) ? $context['relationship'] : [];
    $attachments = array_values(is_array($context['attachments'] ?? null) ? $context['attachments'] : []);
    $sourceAttachment = $attachments[0] ?? [];
    $number = static fn(string $field): ?float => shopNirPremiumXlsxNumber($line[$field] ?? null);
    $docNumber = shopNirPremiumXlsxDocumentNumber($document['nir_number'] ?? $document['temporary_number'] ?? '', $document['nir_date'] ?? null);
    $blank = shopNirPremiumXlsxCellSpec(null, 'string', 22);
    $quantityTotal = static function (string $field) use ($document): float {
        $total = 0.0;
        foreach (is_array($document['lines'] ?? null) ? $document['lines'] : [] as $item) $total += (float)(shopNirPremiumXlsxNumber($item[$field] ?? null) ?? 0);
        return $total;
    };
    $valueTotal = static function (string $field) use ($document): float {
        $total = 0.0;
        foreach (is_array($document['lines'] ?? null) ? $document['lines'] : [] as $item) $total += (float)(shopNirPremiumXlsxNumber($item[$field] ?? null) ?? 0);
        return $total;
    };
    $invoiced = (float)($number('invoiced_quantity') ?? 0);
    $received = (float)($number('received_quantity') ?? 0);
    $accepted = (float)($number('accepted_quantity') ?? 0);
    $lineNet = (float)($number('line_net') ?? 0);
    $lineVat = (float)($number('line_vat') ?? 0);
    $discountTotal = (float)($number('discount_value') ?? 0);
    $netUnit = abs($invoiced) > 0.0000001 ? $lineNet / $invoiced : 0.0;
    $vatUnit = abs($invoiced) > 0.0000001 ? $lineVat / $invoiced : 0.0;

    switch ($key) {
        case 'thumbnail': return shopNirPremiumXlsxCellSpec($hasImage ? null : 'CUTIE', 'string', 19);
        case 'nir_internal_id': return shopNirPremiumXlsxCellSpec($document['id'] ?? '', 'string', 10);
        case 'nir_series': return $blank;
        case 'line_number': return shopNirPremiumXlsxCellSpec((int)($line['line_number'] ?? 0), 'number', 24);
        case 'line_id': return shopNirPremiumXlsxCellSpec($line['id'] ?? '', 'string', 10);
        case 'nir_number': return shopNirPremiumXlsxCellSpec($docNumber, 'string', 10);
        case 'status': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxStatus($document), 'string', 10);
        case 'nir_date': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['nir_date'] ?? null), 'date', 15);
        case 'reception_date': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['reception_date'] ?? null), 'date', 15);
        case 'reception_time': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelTime($document['reception_time'] ?? null), 'number', 30);
        case 'document_created_date': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['created_at'] ?? null), 'date', 15);
        case 'document_finalized_date': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['confirmed_at'] ?? null), 'date', 15);
        case 'work_point': case 'reception_location': case 'warehouse_manager': case 'received_by': case 'verified_by': return $blank;
        case 'approved_by': return shopNirPremiumXlsxCellSpec($document['confirmed_by'] ?? '', 'string', 10);
        case 'general_notes': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxPresentationText($document['notes'] ?? ''), 'string', 10);
        case 'supplier_name': return shopNirPremiumXlsxCellSpec($supplier['name'] ?? $document['supplier_name'] ?? '', 'string', 10);
        case 'supplier_cui': return shopNirPremiumXlsxCellSpec($supplier['cui'] ?? $document['supplier_cui'] ?? '', 'string', 10);
        case 'supplier_id': return shopNirPremiumXlsxCellSpec($document['supplier_id'] ?? $supplier['id'] ?? '', 'string', 10);
        case 'supplier_vat_number': return shopNirPremiumXlsxCellSpec($supplier['vat_number'] ?? '', 'string', 10);
        case 'supplier_registration_number': return shopNirPremiumXlsxCellSpec($supplier['registration_number'] ?? '', 'string', 10);
        case 'supplier_country': return shopNirPremiumXlsxCellSpec($supplier['country'] ?? '', 'string', 10);
        case 'supplier_county': return shopNirPremiumXlsxCellSpec($supplier['county'] ?? '', 'string', 10);
        case 'supplier_city': return shopNirPremiumXlsxCellSpec($supplier['city'] ?? '', 'string', 10);
        case 'supplier_address':
            $address = trim((string)($supplier['address'] ?? ''));
            $address2 = trim((string)($supplier['address_line2'] ?? ''));
            return shopNirPremiumXlsxCellSpec(trim($address . ($address2 !== '' ? ', ' . $address2 : '')), 'string', 10);
        case 'supplier_phone': return shopNirPremiumXlsxCellSpec($supplier['phone'] ?? '', 'string', 10);
        case 'supplier_email': return shopNirPremiumXlsxCellSpec($supplier['email'] ?? '', 'string', 10);
        case 'source_document_type':
            $type = shopNirPremiumXlsxIsStornoDocument($document)
                ? 'Stornare NIR'
                : (trim((string)($document['supplier_invoice_number'] ?? '')) !== '' ? 'Factură' : trim((string)($document['source_type'] ?? '')));
            return shopNirPremiumXlsxCellSpec($type, 'string', 10);
        case 'invoice_series': return shopNirPremiumXlsxCellSpec($document['supplier_invoice_series'] ?? '', 'string', 10);
        case 'invoice_number': return shopNirPremiumXlsxCellSpec($document['supplier_invoice_number'] ?? '', 'string', 10);
        case 'invoice_date': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['supplier_invoice_date'] ?? null), 'date', 15);
        case 'delivery_note_series': case 'delivery_note_number': case 'delivery_note_date': case 'purchase_order_number': case 'awb': case 'carrier': return $blank;
        case 'currency': return shopNirPremiumXlsxCellSpec(strtoupper((string)($document['currency'] ?? 'RON')), 'string', 10);
        case 'exchange_rate': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($document['exchange_rate'] ?? null), 'number', 31);
        case 'exchange_rate_date': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['exchange_rate_date'] ?? null), 'date', 15);
        case 'efactura_index': return shopNirPremiumXlsxCellSpec($document['external_identifier'] ?? '', 'string', 10);
        case 'warehouse_name': return shopNirPremiumXlsxCellSpec($warehouse['name'] ?? $document['warehouse_name'] ?? '', 'string', 10);
        case 'supplier_product_code': return shopNirPremiumXlsxCellSpec($line['supplier_product_code'] ?? '', 'string', 10);
        case 'supplier_ean': return shopNirPremiumXlsxCellSpec($line['supplier_ean'] ?? '', 'string', 10);
        case 'supplier_product_name': return shopNirPremiumXlsxCellSpec($line['supplier_product_name'] ?? '', 'string', 10);
        case 'supplier_sku': case 'supplier_brand': case 'supplier_model': case 'supplier_variant': case 'supplier_lot': case 'supplier_serial': return $blank;
        case 'product_name': return shopNirPremiumXlsxCellSpec($line['product_name'] ?? $line['product_snapshot_name'] ?? '', 'string', 10);
        case 'product_sku': return shopNirPremiumXlsxCellSpec($line['product_sku'] ?? $line['sku_snapshot'] ?? '', 'string', 10);
        case 'product_ean': return shopNirPremiumXlsxCellSpec($line['product_ean'] ?? $line['ean_snapshot'] ?? '', 'string', 10);
        case 'product_id': return shopNirPremiumXlsxCellSpec($line['product_id'] ?? '', 'string', 10);
        case 'product_category': return shopNirPremiumXlsxCellSpec($line['product_category_name'] ?? '', 'string', 10);
        case 'product_subcategory': return shopNirPremiumXlsxCellSpec($line['product_subcategory_name'] ?? '', 'string', 10);
        case 'product_brand': return shopNirPremiumXlsxCellSpec($line['product_brand_names'] ?? $line['product_manufacturer_name'] ?? '', 'string', 10);
        case 'product_model': case 'product_variant': return $blank;
        case 'association_status': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxAssociationLabel($line['resolution_status'] ?? ''), 'string', 10);
        case 'association_notes':
            $confidence = $number('match_confidence');
            if ($confidence !== null && abs($confidence) > 1) $confidence /= 100;
            $note = shopNirPremiumXlsxPresentationText($line['match_method'] ?? '');
            if (str_contains(strtolower($note), 'storn')) $note = 'Preluat din documentul inițial';
            if ($confidence !== null) $note .= ($note !== '' ? ' • ' : '') . number_format($confidence * 100, 2, ',', '') . '%';
            return shopNirPremiumXlsxCellSpec($note, 'string', 10);
        case 'purchase_unit': return shopNirPremiumXlsxCellSpec($line['purchase_unit'] ?? '', 'string', 10);
        case 'stock_unit': return shopNirPremiumXlsxCellSpec($line['stock_unit'] ?? '', 'string', 10);
        case 'conversion_factor': return shopNirPremiumXlsxCellSpec($number('conversion_factor'), 'number', 13);
        case 'invoiced_quantity': return shopNirPremiumXlsxCellSpec($number('invoiced_quantity'), 'number', 11);
        case 'received_quantity': return shopNirPremiumXlsxCellSpec($number('received_quantity'), 'number', 11);
        case 'accepted_quantity': return shopNirPremiumXlsxCellSpec($number('accepted_quantity'), 'number', 11);
        case 'quarantine_quantity': return $blank;
        case 'shortage_quantity':
            return shopNirPremiumXlsxCellSpec(max($invoiced - $received, 0), 'number', 17, 'MAX(' . $columnMap['invoiced_quantity'] . $excelRow . '-' . $columnMap['received_quantity'] . $excelRow . ',0)');
        case 'surplus_quantity':
            return shopNirPremiumXlsxCellSpec(max($received - $invoiced, 0), 'number', 17, 'MAX(' . $columnMap['received_quantity'] . $excelRow . '-' . $columnMap['invoiced_quantity'] . $excelRow . ',0)');
        case 'received_difference':
            return shopNirPremiumXlsxCellSpec($received - $invoiced, 'number', 17, $columnMap['received_quantity'] . $excelRow . '-' . $columnMap['invoiced_quantity'] . $excelRow);
        case 'accepted_difference':
            return shopNirPremiumXlsxCellSpec($accepted - $invoiced, 'number', 17, $columnMap['accepted_quantity'] . $excelRow . '-' . $columnMap['invoiced_quantity'] . $excelRow);
        case 'gross_unit_price': return shopNirPremiumXlsxCellSpec($number('unit_price'), 'number', 13);
        case 'unit_discount':
            return shopNirPremiumXlsxCellSpec(abs($invoiced) > 0.0000001 ? $discountTotal / $invoiced : 0, 'number', 13, 'IFERROR(' . $columnMap['line_discount_total'] . $excelRow . '/' . $columnMap['invoiced_quantity'] . $excelRow . ',0)');
        case 'discount_percent': return shopNirPremiumXlsxCellSpec($number('discount_percent') === null ? null : $number('discount_percent') / 100, 'percent', 14);
        case 'line_discount_total': return shopNirPremiumXlsxCellSpec($number('discount_value'), 'number', 13);
        case 'net_unit_price':
            return shopNirPremiumXlsxCellSpec($netUnit, 'number', 13, 'IFERROR(' . $columnMap['line_net'] . $excelRow . '/' . $columnMap['invoiced_quantity'] . $excelRow . ',0)');
        case 'unit_vat':
            return shopNirPremiumXlsxCellSpec($vatUnit, 'number', 13, 'IFERROR(' . $columnMap['line_vat'] . $excelRow . '/' . $columnMap['invoiced_quantity'] . $excelRow . ',0)');
        case 'unit_price_with_vat':
            return shopNirPremiumXlsxCellSpec($netUnit + $vatUnit, 'number', 13, $columnMap['net_unit_price'] . $excelRow . '+' . $columnMap['unit_vat'] . $excelRow);
        case 'line_net': return shopNirPremiumXlsxCellSpec($number('line_net'), 'number', 13);
        case 'vat_rate': return shopNirPremiumXlsxCellSpec($number('vat_rate') === null ? null : $number('vat_rate') / 100, 'percent', 14);
        case 'line_vat': return shopNirPremiumXlsxCellSpec($number('line_vat'), 'number', 13);
        case 'line_total': return shopNirPremiumXlsxCellSpec($number('line_total'), 'number', 13);
        case 'allocated_transport': case 'allocated_customs': case 'allocated_nonrecoverable_taxes': case 'allocated_direct_costs': return $blank;
        case 'allocated_cost_ron': return shopNirPremiumXlsxCellSpec($number('allocated_cost_ron'), 'number', 12);
        case 'inventory_unit_cost_ron': return shopNirPremiumXlsxCellSpec($number('inventory_unit_cost_ron'), 'number', 12);
        case 'inventory_cost_total_ron': return shopNirPremiumXlsxCellSpec($number('inventory_cost_total_ron'), 'number', 12);
        case 'deductible_vat': case 'nondeductible_vat': case 'cost_notes': return $blank;
        case 'cost_currency': return shopNirPremiumXlsxCellSpec('RON', 'string', 10);
        case 'product_condition': case 'quarantine_reason': case 'action_taken': case 'return_to_supplier': case 'credit_note_requested': case 'difference_document': return $blank;
        case 'is_conforming': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxIsDifference($line) ? 'NU' : 'DA', 'string', 10);
        case 'difference_reason': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxDifferenceLabel($line['difference_reason'] ?? ''), 'string', 10);
        case 'nonconformity_description': case 'reception_notes':
            return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxPresentationText($line['difference_notes'] ?? $line['mismatch_reason'] ?? ''), 'string', 10);
        case 'individual_serial': case 'batch': case 'manufacturing_date': case 'expiry_date': case 'supplier_warranty_duration': case 'warranty_start_date': case 'warranty_end_date': case 'shelf_location': return $blank;
        case 'internal_barcode': return shopNirPremiumXlsxCellSpec($line['product_ean'] ?? $line['ean_snapshot'] ?? '', 'string', 10);
        case 'document_subtotal': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($document['subtotal'] ?? null), 'number', 13);
        case 'document_vat_total': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($document['vat_total'] ?? null), 'number', 13);
        case 'document_grand_total': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($document['grand_total'] ?? null), 'number', 13);
        case 'document_discount_total': case 'document_transport_total': case 'document_customs_total': return $blank;
        case 'document_other_costs_total': return shopNirPremiumXlsxCellSpec($valueTotal('allocated_cost_ron'), 'number', 12);
        case 'document_inventory_total': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($document['inventory_cost_total_ron'] ?? null), 'number', 12);
        case 'document_invoiced_quantity': return shopNirPremiumXlsxCellSpec($quantityTotal('invoiced_quantity'), 'number', 11);
        case 'document_received_quantity': return shopNirPremiumXlsxCellSpec($quantityTotal('received_quantity'), 'number', 11);
        case 'document_accepted_quantity': return shopNirPremiumXlsxCellSpec($quantityTotal('accepted_quantity'), 'number', 11);
        case 'created_by': return shopNirPremiumXlsxCellSpec($document['created_by'] ?? '', 'string', 10);
        case 'created_at': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['created_at'] ?? null, true), 'datetime', 16);
        case 'updated_by': return shopNirPremiumXlsxCellSpec($document['updated_by'] ?? '', 'string', 10);
        case 'updated_at': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['updated_at'] ?? null, true), 'datetime', 16);
        case 'validated_by': return shopNirPremiumXlsxCellSpec($document['confirmed_by'] ?? '', 'string', 10);
        case 'validated_at': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['confirmed_at'] ?? null, true), 'datetime', 16);
        case 'cancelled_by': return shopNirPremiumXlsxCellSpec($document['reversed_by'] ?? '', 'string', 10);
        case 'cancelled_at': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['reversed_at'] ?? null, true), 'datetime', 16);
        case 'cancellation_reason': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxPresentationText($relationship['reason'] ?? ''), 'string', 10);
        case 'document_version': return shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($document['row_version'] ?? null), 'number', 24);
        case 'source_invoice_file_id': return shopNirPremiumXlsxCellSpec($sourceAttachment['id'] ?? '', 'string', 10);
        case 'source_invoice_file_name': return shopNirPremiumXlsxCellSpec($sourceAttachment['original_name'] ?? '', 'string', 10);
        case 'nir_pdf_file_id': case 'audit_notes': return $blank;
        default: return $blank;
    }
}

function shopNirPremiumXlsxIsDifference(array $line): bool
{
    $invoiced = (float)(shopNirPremiumXlsxNumber($line['invoiced_quantity'] ?? null) ?? 0);
    $received = (float)(shopNirPremiumXlsxNumber($line['received_quantity'] ?? null) ?? 0);
    $accepted = (float)(shopNirPremiumXlsxNumber($line['accepted_quantity'] ?? null) ?? 0);
    return abs($received - $invoiced) > 0.00005 || abs($accepted - $invoiced) > 0.00005
        || trim((string)($line['difference_reason'] ?? '')) !== '' || trim((string)($line['difference_notes'] ?? '')) !== ''
        || trim((string)($line['mismatch_reason'] ?? '')) !== '';
}

function shopNirPremiumXlsxSafeLocalProductImage($url): ?array
{
    $raw = trim((string)$url);
    if ($raw === '' || str_contains($raw, "\0")) return null;
    $path = parse_url($raw, PHP_URL_PATH);
    if (!is_string($path) || $path === '') $path = $raw;
    $path = rawurldecode(str_replace('\\', '/', $path));
    $marker = 'uploads/products/';
    $position = strpos(ltrim($path, '/'), $marker);
    if ($position === false) return null;
    $relative = substr(ltrim($path, '/'), $position);
    if (!preg_match('#^uploads/products/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$#i', $relative)) return null;

    $base = realpath(__DIR__ . '/uploads/products');
    $candidate = realpath(__DIR__ . '/' . $relative);
    if ($base === false || $candidate === false || !is_file($candidate)) return null;
    $prefix = rtrim($base, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    if (!str_starts_with($candidate, $prefix)) return null;
    $size = filesize($candidate);
    if ($size === false || $size < 32 || $size > 6 * 1024 * 1024) return null;
    $bytes = file_get_contents($candidate);
    if (!is_string($bytes)) return null;
    return shopNirPremiumXlsxNormaliseImage($bytes, 180, 180, false);
}

function shopNirPremiumXlsxSafeCompanyStamp($url): ?array
{
    $raw = trim((string)$url);
    if ($raw === '' || str_contains($raw, "\0")) return null;
    $path = parse_url($raw, PHP_URL_PATH);
    if (!is_string($path) || $path === '') $path = $raw;
    $path = rawurldecode(str_replace('\\', '/', $path));
    $marker = 'uploads/company/';
    $position = strpos(ltrim($path, '/'), $marker);
    if ($position === false) return null;
    $relative = substr(ltrim($path, '/'), $position);
    if (!preg_match('#^uploads/company/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$#i', $relative)) return null;
    $base = realpath(__DIR__ . '/uploads/company');
    $candidate = realpath(__DIR__ . '/' . $relative);
    if ($base === false || $candidate === false || !is_file($candidate)) return null;
    if (!str_starts_with($candidate, rtrim($base, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)) return null;
    $size = filesize($candidate);
    if ($size === false || $size < 32 || $size > 6 * 1024 * 1024) return null;
    $bytes = file_get_contents($candidate);
    if (!is_string($bytes)) return null;
    $bytes = shopNirPremiumXlsxPrepareCompanyStamp($bytes) ?? $bytes;
    return shopNirPremiumXlsxNormaliseImage($bytes, 600, 300, true);
}

function shopNirPremiumXlsxPrepareCompanyStamp(string $bytes): ?string
{
    if (!function_exists('imagecreatefromstring') || !function_exists('imagepng')) return null;
    $source = @imagecreatefromstring($bytes);
    if ($source === false) return null;
    $width = imagesx($source); $height = imagesy($source);
    if ($width < 1 || $height < 1 || $width * $height > 30000000) { imagedestroy($source); return null; }
    $left = $width; $top = $height; $right = -1; $bottom = -1;
    for ($y = 0; $y < $height; $y++) for ($x = 0; $x < $width; $x++) {
        $rgba = imagecolorat($source, $x, $y);
        $alpha = ($rgba >> 24) & 0x7f; $red = ($rgba >> 16) & 0xff; $green = ($rgba >> 8) & 0xff; $blue = $rgba & 0xff;
        if ($alpha < 118 && min($red, $green, $blue) < 246) {
            $left = min($left, $x); $right = max($right, $x); $top = min($top, $y); $bottom = max($bottom, $y);
        }
    }
    if ($right < $left || $bottom < $top) { imagedestroy($source); return null; }
    $pad = max(4, (int)round(max($right - $left, $bottom - $top) * .025));
    $left = max(0, $left - $pad); $top = max(0, $top - $pad); $right = min($width - 1, $right + $pad); $bottom = min($height - 1, $bottom + $pad);
    $cropWidth = $right - $left + 1; $cropHeight = $bottom - $top + 1;
    $canvas = imagecreatetruecolor($cropWidth, $cropHeight);
    imagealphablending($canvas, false); imagesavealpha($canvas, true);
    $transparent = imagecolorallocatealpha($canvas, 255, 255, 255, 127);
    imagefilledrectangle($canvas, 0, 0, $cropWidth, $cropHeight, $transparent);
    for ($y = 0; $y < $cropHeight; $y++) for ($x = 0; $x < $cropWidth; $x++) {
        $rgba = imagecolorat($source, $left + $x, $top + $y);
        $alpha = ($rgba >> 24) & 0x7f; $red = ($rgba >> 16) & 0xff; $green = ($rgba >> 8) & 0xff; $blue = $rgba & 0xff;
        if ($alpha >= 118 || min($red, $green, $blue) >= 246) continue;
        imagesetpixel($canvas, $x, $y, imagecolorallocatealpha($canvas, max(0, (int)round($red * .72)), max(0, (int)round($green * .72)), max(0, (int)round($blue * .72)), min(110, $alpha)));
    }
    ob_start(); imagepng($canvas, null, 6); $result = ob_get_clean();
    imagedestroy($canvas); imagedestroy($source);
    return is_string($result) && $result !== '' ? $result : null;
}

function shopNirPremiumXlsxNormaliseImage(string $bytes, int $maxWidth, int $maxHeight, bool $allowLargeFallback = true): ?array
{
    $info = @getimagesizefromstring($bytes);
    if (!is_array($info)) return null;
    $width = (int)($info[0] ?? 0);
    $height = (int)($info[1] ?? 0);
    $mime = strtolower((string)($info['mime'] ?? ''));
    if ($width < 1 || $height < 1 || $width * $height > 30000000) return null;
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) return null;

    if (function_exists('imagecreatefromstring') && function_exists('imagecreatetruecolor')) {
        $source = @imagecreatefromstring($bytes);
        if ($source !== false) {
            $scale = min(1, $maxWidth / max(1, $width), $maxHeight / max(1, $height));
            $targetWidth = max(1, (int)round($width * $scale));
            $targetHeight = max(1, (int)round($height * $scale));
            $canvas = imagecreatetruecolor($targetWidth, $targetHeight);
            imagealphablending($canvas, false);
            imagesavealpha($canvas, true);
            $transparent = imagecolorallocatealpha($canvas, 255, 255, 255, 127);
            imagefilledrectangle($canvas, 0, 0, $targetWidth, $targetHeight, $transparent);
            imagecopyresampled($canvas, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);
            ob_start();
            $extension = 'png';
            if ($mime === 'image/jpeg' && function_exists('imagejpeg')) {
                imagejpeg($canvas, null, 84);
                $extension = 'jpg';
            } else {
                imagepng($canvas, null, 7);
            }
            $resized = ob_get_clean();
            imagedestroy($canvas);
            imagedestroy($source);
            if (is_string($resized) && strlen($resized) > 20) return ['bytes' => $resized, 'extension' => $extension, 'width' => $targetWidth, 'height' => $targetHeight];
        }
    }

    if (!$allowLargeFallback && strlen($bytes) > 1500000) return null;
    $extension = $mime === 'image/png' ? 'png' : ($mime === 'image/webp' ? 'webp' : 'jpg');
    return ['bytes' => $bytes, 'extension' => $extension, 'width' => $width, 'height' => $height];
}

function shopNirPremiumXlsxRegisterMedia(array &$media, array &$mediaIndex, array $image, string $prefix): string
{
    $hash = hash('sha256', (string)$image['bytes']);
    if (isset($mediaIndex[$hash])) return $mediaIndex[$hash];
    $safePrefix = preg_replace('/[^A-Za-z0-9_-]+/', '-', $prefix) ?: 'image';
    $name = $safePrefix . '-' . substr($hash, 0, 16) . '.' . (string)$image['extension'];
    $media[$name] = (string)$image['bytes'];
    $mediaIndex[$hash] = $name;
    return $name;
}

/** @param array<int,array<string,mixed>> $pictures */
function shopNirPremiumXlsxDrawing(array $pictures): array
{
    $relationshipIds = [];
    $relationships = '';
    foreach ($pictures as $picture) {
        $media = (string)$picture['media'];
        if (isset($relationshipIds[$media])) continue;
        $rid = 'rId' . (count($relationshipIds) + 1);
        $relationshipIds[$media] = $rid;
        $relationships .= '<Relationship Id="' . $rid . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' . shopNirPremiumXlsxXml($media) . '"/>';
    }

    $body = '';
    foreach ($pictures as $index => $picture) {
        $rid = $relationshipIds[(string)$picture['media']];
        $id = $index + 1;
        $cx = max(9525, (int)$picture['cx']);
        $cy = max(9525, (int)$picture['cy']);
        $body .= '<xdr:oneCellAnchor>'
            . '<xdr:from><xdr:col>' . (int)$picture['col'] . '</xdr:col><xdr:colOff>' . max(0, (int)($picture['colOff'] ?? 0)) . '</xdr:colOff><xdr:row>' . (int)$picture['row'] . '</xdr:row><xdr:rowOff>' . max(0, (int)($picture['rowOff'] ?? 0)) . '</xdr:rowOff></xdr:from>'
            . '<xdr:ext cx="' . $cx . '" cy="' . $cy . '"/>'
            . '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' . $id . '" name="' . shopNirPremiumXlsxXml($picture['name'] ?? ('Imagine ' . $id)) . '" descr="' . shopNirPremiumXlsxXml($picture['description'] ?? '') . '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
            . '<xdr:blipFill><a:blip r:embed="' . $rid . '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
            . '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' . $cx . '" cy="' . $cy . '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></xdr:spPr></xdr:pic>'
            . '<xdr:clientData/></xdr:oneCellAnchor>';
    }
    return [
        'xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' . $body . '</xdr:wsDr>',
        'rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . $relationships . '</Relationships>',
    ];
}

function shopNirPremiumXlsxSheet(string $rows, array $widths, int $lastRow, int $lastColumn, array $options = []): string
{
    $columns = '';
    foreach ($widths as $index => $width) {
        $column = $index + 1;
        $safeWidth = max(5, min(32, (float)$width));
        $columns .= '<col min="' . $column . '" max="' . $column . '" width="' . number_format($safeWidth, 2, '.', '') . '" customWidth="1"/>';
    }
    $freezeRows = max(0, (int)($options['freeze_rows'] ?? 0));
    $freezeColumns = max(0, (int)($options['freeze_columns'] ?? 0));
    $pane = '';
    if ($freezeRows > 0 || $freezeColumns > 0) {
        $topLeft = shopNirPremiumXlsxColumn($freezeColumns + 1) . ($freezeRows + 1);
        $activePane = $freezeRows > 0 && $freezeColumns > 0 ? 'bottomRight' : ($freezeRows > 0 ? 'bottomLeft' : 'topRight');
        $pane = '<pane' . ($freezeColumns > 0 ? ' xSplit="' . $freezeColumns . '"' : '') . ($freezeRows > 0 ? ' ySplit="' . $freezeRows . '"' : '') . ' topLeftCell="' . $topLeft . '" activePane="' . $activePane . '" state="frozen"/>';
    }
    $merges = array_values(array_filter($options['merges'] ?? [], 'is_string'));
    $mergeXml = $merges ? '<mergeCells count="' . count($merges) . '">' . implode('', array_map(static fn(string $ref): string => '<mergeCell ref="' . shopNirPremiumXlsxXml($ref) . '"/>', $merges)) . '</mergeCells>' : '';
    $autoFilter = trim((string)($options['auto_filter'] ?? ''));
    $filterXml = $autoFilter !== '' ? '<autoFilter ref="' . shopNirPremiumXlsxXml($autoFilter) . '"/>' : '';
    $drawingXml = !empty($options['drawing']) ? '<drawing r:id="rId1"/>' : '';
    $orientation = ($options['orientation'] ?? 'landscape') === 'portrait' ? 'portrait' : 'landscape';
    $paperSize = (int)($options['paper_size'] ?? 9);
    $fitToHeight = max(0, (int)($options['fit_to_height'] ?? 0));
    $header = shopNirPremiumXlsxXml($options['header'] ?? '&LG-Trots Management&R&D');
    $footer = shopNirPremiumXlsxXml($options['footer'] ?? '&LDocument generat electronic&RPagina &P / &N');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        . '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:' . shopNirPremiumXlsxColumn($lastColumn) . max(1, $lastRow) . '"/>'
        . '<sheetViews><sheetView showGridLines="0" workbookViewId="0">' . $pane . '<selection pane="' . ($pane !== '' ? ($freezeRows > 0 && $freezeColumns > 0 ? 'bottomRight' : ($freezeRows > 0 ? 'bottomLeft' : 'topRight')) : 'topLeft') . '" activeCell="A1" sqref="A1"/></sheetView></sheetViews>'
        . '<sheetFormatPr defaultRowHeight="18"/><cols>' . $columns . '</cols><sheetData>' . $rows . '</sheetData>'
        . $filterXml . $mergeXml
        . '<printOptions horizontalCentered="0" verticalCentered="0"/><pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/>'
        . '<pageSetup paperSize="' . $paperSize . '" orientation="' . $orientation . '" fitToWidth="1" fitToHeight="' . $fitToHeight . '" pageOrder="overThenDown" usePrinterDefaults="0" horizontalDpi="300" verticalDpi="300"/>'
        . '<headerFooter><oddHeader>' . $header . '</oddHeader><oddFooter>' . $footer . '</oddFooter></headerFooter>' . $drawingXml
        . '</worksheet>';
}

function shopNirPremiumXlsxSummarySheet(array $document, bool $hasLogo): array
{
    $context = is_array($document['pdf_context'] ?? null) ? $document['pdf_context'] : [];
    $company = is_array($context['company'] ?? null) ? $context['company'] : [];
    $supplier = is_array($context['supplier'] ?? null) ? $context['supplier'] : [];
    $warehouse = is_array($context['warehouse'] ?? null) ? $context['warehouse'] : [];
    $summary = is_array($context['summary'] ?? null) ? $context['summary'] : [];
    $relationship = is_array($context['relationship'] ?? null) ? $context['relationship'] : [];
    $generation = is_array($context['generation'] ?? null) ? $context['generation'] : [];
    $lines = array_values(is_array($document['lines'] ?? null) ? $document['lines'] : []);
    $differenceCount = count(array_filter($lines, 'shopNirPremiumXlsxIsDifference'));
    $unmatchedCount = isset($summary['unmatched_line_count']) ? (int)$summary['unmatched_line_count'] : count(array_filter($lines, static fn(array $line): bool => trim((string)($line['product_id'] ?? '')) === ''));
    $rows = '';
    $merges = [];
    $r = 1;
    $merge = static function (string $range) use (&$merges): void { $merges[] = $range; };
    $docNumber = shopNirPremiumXlsxDocumentNumber($document['nir_number'] ?? $document['temporary_number'] ?? 'NIR', $document['nir_date'] ?? null);
    $isStornoDocument = shopNirPremiumXlsxIsStornoDocument($document);
    $statusStyle = $isStornoDocument ? 28 : 27;
    $rows .= shopNirPremiumXlsxRow($r, [3 => shopNirPremiumXlsxCellSpec('G-TROTS • CONTROL RECEPȚII', 'string', 2), 9 => shopNirPremiumXlsxCellSpec('STATUS DOCUMENT', 'string', 7), 10 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxStatus($document), 'string', $statusStyle)], 28); $merge('C1:H1'); $r++;
    $summaryTitle = $isStornoDocument ? 'DOCUMENT DE STORNARE A NOTEI DE RECEPȚIE' : 'NOTĂ DE RECEPȚIE ȘI CONSTATARE DE DIFERENȚE';
    $rows .= shopNirPremiumXlsxRow($r, [3 => shopNirPremiumXlsxCellSpec($summaryTitle, 'string', 1)], 36); $merge('C2:J2'); $r++;
    $rows .= shopNirPremiumXlsxRow($r, [3 => shopNirPremiumXlsxCellSpec($docNumber, 'string', 26), 7 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxDocumentType($document), 'string', 29)], 25); $merge('C3:F3'); $merge('G3:J3'); $r++;
    $rows .= shopNirPremiumXlsxRow($r, [3 => shopNirPremiumXlsxCellSpec('Export operațional premium • valorile contabile sunt exprimate în lei unde antetul indică RON.', 'string', 3)], 24); $merge('C4:J4'); $r++;
    $rows .= shopNirPremiumXlsxRow($r, [], 8); $r++;

    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('IDENTIFICARE DOCUMENT', 'string', 4)], 23); $merge('A' . $r . ':J' . $r); $r++;
    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('Societate', 'string', 5), 2 => shopNirPremiumXlsxCellSpec($company['legal_name'] ?? $company['trade_name'] ?? 'G-Trots România', 'string', 6), 6 => shopNirPremiumXlsxCellSpec('CUI / Registru', 'string', 5), 7 => shopNirPremiumXlsxCellSpec(trim((string)($company['cui'] ?? '') . ' • ' . (string)($company['registration_number'] ?? ''), ' •'), 'string', 6)], 27); $merge('B' . $r . ':E' . $r); $merge('G' . $r . ':J' . $r); $r++;
    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('Furnizor', 'string', 5), 2 => shopNirPremiumXlsxCellSpec($supplier['name'] ?? $document['supplier_name'] ?? '', 'string', 6), 6 => shopNirPremiumXlsxCellSpec('CUI furnizor', 'string', 5), 7 => shopNirPremiumXlsxCellSpec($supplier['cui'] ?? $document['supplier_cui'] ?? '', 'string', 6)], 27); $merge('B' . $r . ':E' . $r); $merge('G' . $r . ':J' . $r); $r++;
    $invoice = trim(trim((string)($document['supplier_invoice_series'] ?? '')) . ' ' . trim((string)($document['supplier_invoice_number'] ?? '')));
    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('Document furnizor', 'string', 5), 2 => shopNirPremiumXlsxCellSpec($invoice, 'string', 6), 6 => shopNirPremiumXlsxCellSpec('Data documentului', 'string', 5), 7 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($document['supplier_invoice_date'] ?? null), 'date', 15)], 27); $merge('B' . $r . ':E' . $r); $merge('G' . $r . ':J' . $r); $r++;
    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('Data și ora NIR', 'string', 5), 2 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate(trim((string)($document['nir_date'] ?? '') . ' ' . (string)($document['nir_time'] ?? '00:00')), true), 'datetime', 16), 6 => shopNirPremiumXlsxCellSpec('Data și ora recepției', 'string', 5), 7 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate(trim((string)($document['reception_date'] ?? '') . ' ' . (string)($document['reception_time'] ?? '00:00')), true), 'datetime', 16)], 27); $merge('B' . $r . ':E' . $r); $merge('G' . $r . ':J' . $r); $r++;
    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('Gestiune', 'string', 5), 2 => shopNirPremiumXlsxCellSpec($warehouse['name'] ?? $document['warehouse_name'] ?? '', 'string', 6), 6 => shopNirPremiumXlsxCellSpec('Monedă / curs / dată', 'string', 5), 7 => shopNirPremiumXlsxCellSpec(strtoupper((string)($document['currency'] ?? 'RON')) . ' • ' . (string)($document['exchange_rate'] ?? '1') . ' • ' . (string)($document['exchange_rate_date'] ?? ''), 'string', 6)], 27); $merge('B' . $r . ':E' . $r); $merge('G' . $r . ':J' . $r); $r += 2;

    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec($isStornoDocument ? 'REZULTAT STORNARE' : 'REZULTAT RECEPȚIE', 'string', 4)], 23); $merge('A' . $r . ':J' . $r); $r++;
    $kpiLabels = ['Poziții', 'Cu diferențe', 'Neasociate', 'Documente atașate'];
    $kpiValues = [count($lines), $differenceCount, $unmatchedCount, count(is_array($context['attachments'] ?? null) ? $context['attachments'] : [])];
    $labelCells = []; $valueCells = [];
    foreach ($kpiLabels as $index => $label) {
        $column = 1 + $index * 2;
        $labelCells[$column] = shopNirPremiumXlsxCellSpec($label, 'string', 7);
        $valueCells[$column] = shopNirPremiumXlsxCellSpec($kpiValues[$index], 'number', 8);
        $merge(shopNirPremiumXlsxColumn($column) . $r . ':' . shopNirPremiumXlsxColumn($column + 1) . $r);
        $merge(shopNirPremiumXlsxColumn($column) . ($r + 1) . ':' . shopNirPremiumXlsxColumn($column + 1) . ($r + 1));
    }
    $rows .= shopNirPremiumXlsxRow($r, $labelCells, 24); $r++;
    $rows .= shopNirPremiumXlsxRow($r, $valueCells, 32); $r += 2;

    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('TOTALURI CONTABILE', 'string', 4)], 23); $merge('A' . $r . ':J' . $r); $r++;
    $totals = [
        ['Total fără TVA RON', $document['subtotal_ron'] ?? $summary['accepted_totals']['subtotal_ron'] ?? 0],
        ['TVA RON', $document['vat_total_ron'] ?? $summary['accepted_totals']['vat_total_ron'] ?? 0],
        ['Total document RON', $document['grand_total_ron'] ?? $summary['accepted_totals']['grand_total_ron'] ?? 0],
        [$isStornoDocument ? 'Valoare contabilă stornare RON' : 'Valoare contabilă recepție RON', $document['inventory_cost_total_ron'] ?? $summary['inventory_cost_total_ron'] ?? 0],
        ['Diferență valorică RON', $document['total_difference_ron'] ?? $summary['total_difference_ron'] ?? 0],
    ];
    foreach ($totals as $total) {
        $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec($total[0], 'string', 23), 6 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($total[1]), 'number', 12)], 25);
        $merge('A' . $r . ':E' . $r); $merge('F' . $r . ':J' . $r); $r++;
    }
    $r++;

    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('CENTRALIZARE TVA', 'string', 4)], 23); $merge('A' . $r . ':J' . $r); $r++;
    $vatHeaderRow = $r;
    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('Cotă', 'string', 9), 3 => shopNirPremiumXlsxCellSpec('Net document', 'string', 9), 5 => shopNirPremiumXlsxCellSpec('TVA document', 'string', 9), 7 => shopNirPremiumXlsxCellSpec('Net RON', 'string', 9), 9 => shopNirPremiumXlsxCellSpec('TVA RON', 'string', 9)], 30); foreach ([1,3,5,7,9] as $column) $merge(shopNirPremiumXlsxColumn($column) . $r . ':' . shopNirPremiumXlsxColumn($column + 1) . $r); $r++;
    $vatRows = is_array($summary['vat_breakdown'] ?? null) ? $summary['vat_breakdown'] : [];
    if (!$vatRows) $vatRows = [['rate' => null, 'net' => null, 'vat' => null, 'net_ron' => null, 'vat_ron' => null]];
    foreach ($vatRows as $vat) {
        $rate = shopNirPremiumXlsxNumber($vat['rate'] ?? null);
        $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec($rate === null ? null : $rate / 100, 'percent', 14), 3 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($vat['net'] ?? null), 'number', 13), 5 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($vat['vat'] ?? null), 'number', 13), 7 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($vat['net_ron'] ?? null), 'number', 12), 9 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($vat['vat_ron'] ?? null), 'number', 12)], 24);
        foreach ([1,3,5,7,9] as $column) $merge(shopNirPremiumXlsxColumn($column) . $r . ':' . shopNirPremiumXlsxColumn($column + 1) . $r); $r++;
    }
    $r++;

    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('TRASABILITATE', 'string', 4)], 23); $merge('A' . $r . ':J' . $r); $r++;
    $originalData = is_array($relationship['original'] ?? null) ? $relationship['original'] : [];
    $stornoData = is_array($relationship['reversal'] ?? null) ? $relationship['reversal'] : [];
    $original = shopNirPremiumXlsxDocumentNumber($originalData['nir_number'] ?? $originalData['temporary_number'] ?? '', $originalData['nir_date'] ?? null);
    $storno = shopNirPremiumXlsxDocumentNumber($stornoData['nir_number'] ?? $stornoData['temporary_number'] ?? '', $stornoData['nir_date'] ?? null);
    if ($isStornoDocument) {
        $documentTrace = shopNirPremiumXlsxOriginalInvoiceTrace($relationship, $context);
    } else {
        $traceParts = [];
        if ($original !== '') $traceParts[] = 'NIR confirmat: ' . $original;
        if ($storno !== '') $traceParts[] = 'Document de stornare: ' . $storno;
        $documentTrace = implode(' • ', $traceParts);
    }
    $trace = [
        ['Legătură documente', $documentTrace],
        ['Motiv', shopNirPremiumXlsxPresentationText($relationship['reason'] ?? '')],
        ['Generat de', ($generation['generated_by'] ?? '') . ' • ' . ($generation['generated_at'] ?? '')],
        ['Amprentă date', $generation['data_fingerprint'] ?? ''],
        ['Observații', shopNirPremiumXlsxPresentationText($document['notes'] ?? '')],
    ];
    foreach ($trace as $item) {
        $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec($item[0], 'string', 5), 3 => shopNirPremiumXlsxCellSpec($item[1], 'string', 6)], $item[0] === 'Observații' ? 42 : 25);
        $merge('A' . $r . ':B' . $r); $merge('C' . $r . ':J' . $r); $r++;
    }

    $widths = [12, 12, 15, 15, 15, 14, 14, 14, 14, 16];
    return ['xml' => shopNirPremiumXlsxSheet($rows, $widths, $r - 1, 10, ['merges' => $merges, 'drawing' => $hasLogo, 'orientation' => 'portrait', 'paper_size' => 9, 'header' => '&LG-Trots Management&R' . $docNumber]), 'last_row' => $r - 1, 'vat_header_row' => $vatHeaderRow];
}

function shopNirPremiumXlsxPositionsSheet(array $document, array $columns, array $thumbnailMedia): array
{
    $lines = array_values(is_array($document['lines'] ?? null) ? $document['lines'] : []);
    $columnMap = [];
    foreach ($columns as $index => $column) $columnMap[(string)$column['key']] = shopNirPremiumXlsxColumn($index + 1);
    $lastColumn = count($columns);
    $lastLetter = shopNirPremiumXlsxColumn($lastColumn);
    $rows = '';
    $merges = [];
    $docNumber = shopNirPremiumXlsxDocumentNumber($document['nir_number'] ?? $document['temporary_number'] ?? 'NIR', $document['nir_date'] ?? null);
    $headerCells = [];
    foreach ($columns as $index => $column) $headerCells[$index + 1] = shopNirPremiumXlsxCellSpec($column['title'], 'string', 9);
    $headerRow = 1;
    $rows .= shopNirPremiumXlsxRow($headerRow, $headerCells, 62);
    $firstDataRow = 2;
    foreach ($lines as $index => $line) {
        $excelRow = $firstDataRow + $index;
        $cells = [];
        foreach ($columns as $columnIndex => $column) {
            $cells[$columnIndex + 1] = shopNirPremiumXlsxPositionCell((string)$column['key'], $line, $document, $excelRow, $columnMap, isset($thumbnailMedia[$index]));
        }
        $rows .= shopNirPremiumXlsxRow($excelRow, $cells, 52);
    }
    if (!$lines) {
        $rows .= shopNirPremiumXlsxRow($firstDataRow, [1 => shopNirPremiumXlsxCellSpec('NIR-ul nu conține poziții.', 'string', 19)], 36);
        $merges[] = 'A' . $firstDataRow . ':' . $lastLetter . $firstDataRow;
    }
    $lastRow = max($firstDataRow, $firstDataRow + count($lines) - 1);
    $widths = array_map(static fn(array $column): float => (float)$column['width'], $columns);
    return ['xml' => shopNirPremiumXlsxSheet($rows, $widths, $lastRow, $lastColumn, ['merges' => $merges, 'auto_filter' => 'A1:' . $lastLetter . max(1, $lastRow), 'freeze_rows' => 1, 'drawing' => !empty($thumbnailMedia), 'orientation' => 'landscape', 'paper_size' => 9, 'header' => '&LG-Trots • Poziții NIR&R' . $docNumber]), 'first_data_row' => $firstDataRow, 'last_row' => $lastRow, 'last_column' => $lastColumn, 'column_map' => $columnMap];
}

function shopNirPremiumXlsxDifferencesSheet(array $document, array $positionMeta): array
{
    $lines = array_values(is_array($document['lines'] ?? null) ? $document['lines'] : []);
    $rows = '';
    $merges = ['A1:S1', 'A2:S2'];
    $rows .= shopNirPremiumXlsxRow(1, [1 => shopNirPremiumXlsxCellSpec('CONSTATAREA DIFERENȚELOR', 'string', 1)], 34);
    $rows .= shopNirPremiumXlsxRow(2, [1 => shopNirPremiumXlsxCellSpec('Această foaie include numai pozițiile cu diferențe cantitative sau explicații salvate. Coloanele operaționale nesalvate rămân goale.', 'string', 3)], 28);
    $rows .= shopNirPremiumXlsxRow(3, [], 8);
    $headers = ['Poziția NIR', 'Produs furnizor', 'Produs intern', 'SKU', 'Tip diferență', 'Cant. document', 'Cant. primită', 'Cant. acceptată', 'Dif. primit-document', 'Dif. acceptat-document', 'Observații', 'Cauză probabilă', 'Măsură luată', 'Document asociat', 'Dovezi foto', 'Constatare de', 'Data constatării', 'Furnizor notificat', 'Data notificării'];
    $headerCells = [];
    foreach ($headers as $index => $header) $headerCells[$index + 1] = shopNirPremiumXlsxCellSpec($header, 'string', 9);
    $headerRow = 4;
    $rows .= shopNirPremiumXlsxRow($headerRow, $headerCells, 42);
    $r = 5;
    $differenceRows = 0;
    foreach ($lines as $lineIndex => $line) {
        if (!shopNirPremiumXlsxIsDifference($line)) continue;
        $positionRow = (int)$positionMeta['first_data_row'] + $lineIndex;
        $map = $positionMeta['column_map'];
        $source = static fn(string $key): string => "'Poziții NIR'!" . $map[$key] . $positionRow;
        $invoiced = (float)(shopNirPremiumXlsxNumber($line['invoiced_quantity'] ?? null) ?? 0);
        $received = (float)(shopNirPremiumXlsxNumber($line['received_quantity'] ?? null) ?? 0);
        $accepted = (float)(shopNirPremiumXlsxNumber($line['accepted_quantity'] ?? null) ?? 0);
        $rows .= shopNirPremiumXlsxRow($r, [
            1 => shopNirPremiumXlsxCellSpec((int)($line['line_number'] ?? $lineIndex + 1), 'number', 24),
            2 => shopNirPremiumXlsxCellSpec($line['supplier_product_name'] ?? '', 'string', 10),
            3 => shopNirPremiumXlsxCellSpec($line['product_name'] ?? $line['product_snapshot_name'] ?? '', 'string', 10),
            4 => shopNirPremiumXlsxCellSpec($line['product_sku'] ?? $line['sku_snapshot'] ?? '', 'string', 10),
            5 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxDifferenceLabel($line['difference_reason'] ?? ''), 'string', 18),
            6 => shopNirPremiumXlsxCellSpec($invoiced, 'number', 11, $source('invoiced_quantity')),
            7 => shopNirPremiumXlsxCellSpec($received, 'number', 11, $source('received_quantity')),
            8 => shopNirPremiumXlsxCellSpec($accepted, 'number', 11, $source('accepted_quantity')),
            9 => shopNirPremiumXlsxCellSpec($received - $invoiced, 'number', 17, $source('received_quantity') . '-' . $source('invoiced_quantity')),
            10 => shopNirPremiumXlsxCellSpec($accepted - $invoiced, 'number', 17, $source('accepted_quantity') . '-' . $source('invoiced_quantity')),
            11 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxPresentationText($line['difference_notes'] ?? $line['mismatch_reason'] ?? ''), 'string', 10),
        ], 44);
        $r++; $differenceRows++;
    }
    if ($differenceRows === 0) {
        $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('Nu s-au identificat diferențe cantitative sau explicații de neconcordanță în datele exportate.', 'string', 20)], 38);
        $merges[] = 'A' . $r . ':S' . $r; $r++;
    }
    $lastRow = $r - 1;
    $widths = [12, 30, 30, 18, 20, 15, 15, 15, 20, 21, 30, 24, 24, 24, 22, 20, 18, 20, 18];
    return ['xml' => shopNirPremiumXlsxSheet($rows, $widths, $lastRow, 19, ['merges' => $merges, 'auto_filter' => 'A' . $headerRow . ':S' . max($headerRow, $lastRow), 'freeze_rows' => $headerRow, 'orientation' => 'landscape', 'paper_size' => 9]), 'last_row' => $lastRow];
}

function shopNirPremiumXlsxJson($value): string
{
    if ($value === null || $value === [] || $value === '') return '';
    $sanitize = static function ($item) use (&$sanitize) {
        if (is_string($item)) {
            $item = preg_replace_callback(
                '/\b(?:NIR|REV|STO)-\d{4}-\d+\b/iu',
                static fn(array $matches): string => shopNirPremiumXlsxDocumentNumber($matches[0]),
                $item
            ) ?? $item;
            if (str_starts_with(strtoupper($item), 'NIR_') && str_contains(strtoupper($item), 'REVERS')) {
                return shopNirPremiumXlsxAuditAction($item);
            }
            return str_ireplace(['reversare', 'reversat', 'reversal', 'reversed', 'storno'], ['stornare', 'stornat', 'stornare', 'stornat', 'stornare'], $item);
        }
        if (!is_array($item)) return $item;
        $clean = [];
        foreach ($item as $key => $nested) {
            $normalizedKey = strtolower((string)$key);
            if (str_contains($normalizedKey, 'reject') || str_contains($normalizedKey, 'respin')) continue;
            $presentationKey = is_string($key)
                ? str_ireplace(['reversal', 'reversed', 'storno'], ['stornare', 'stornat', 'stornare'], $key)
                : $key;
            $clean[$presentationKey] = $sanitize($nested);
        }
        return $clean;
    };
    $json = json_encode($sanitize($value), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    return is_string($json) ? mb_substr($json, 0, 32767) : '';
}

function shopNirPremiumXlsxAuditSheet(array $document): array
{
    $context = is_array($document['pdf_context'] ?? null) ? $document['pdf_context'] : [];
    $attachments = array_values(is_array($context['attachments'] ?? null) ? $context['attachments'] : []);
    $audit = array_values(is_array($context['audit'] ?? null) ? $context['audit'] : []);
    $relationship = is_array($context['relationship'] ?? null) ? $context['relationship'] : [];
    $generation = is_array($context['generation'] ?? null) ? $context['generation'] : [];
    $rows = '';
    $merges = ['A1:J1', 'A2:J2'];
    $rows .= shopNirPremiumXlsxRow(1, [1 => shopNirPremiumXlsxCellSpec('DOCUMENTE & JURNAL DE AUDIT', 'string', 1)], 34);
    $rows .= shopNirPremiumXlsxRow(2, [1 => shopNirPremiumXlsxCellSpec('Trasabilitate tehnică: documente sursă, amprente, utilizatori și evenimentele disponibile în contextul exportului.', 'string', 3)], 28);
    $rows .= shopNirPremiumXlsxRow(3, [], 8);
    $r = 4;
    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('DOCUMENTE ASOCIATE', 'string', 4)], 23); $merges[] = 'A' . $r . ':J' . $r; $r++;
    $docHeader = ['Relație', 'Număr document', 'Fișier', 'Tip MIME', 'Extensie', 'Dimensiune bytes', 'SHA-256', 'Status extragere', 'Creat de', 'Creat la'];
    $cells = []; foreach ($docHeader as $index => $header) $cells[$index + 1] = shopNirPremiumXlsxCellSpec($header, 'string', 9);
    $rows .= shopNirPremiumXlsxRow($r, $cells, 40); $documentsHeaderRow = $r; $r++;
    if (!$attachments) {
        $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('Nu există documente asociate în contextul exportului.', 'string', 19)], 32); $merges[] = 'A' . $r . ':J' . $r; $r++;
    } else {
        foreach ($attachments as $attachment) {
            $relation = strtolower(trim((string)($attachment['relation'] ?? 'current')));
            $relationLabel = $relation === 'reversal' ? 'Stornare' : ($relation === 'original' ? 'Original' : 'Curent');
            $attachmentNumber = shopNirPremiumXlsxDocumentNumber($attachment['document_number'] ?? '', $attachment['created_at'] ?? null);
            $rows .= shopNirPremiumXlsxRow($r, [
                1 => shopNirPremiumXlsxCellSpec($relationLabel, 'string', 10), 2 => shopNirPremiumXlsxCellSpec($attachmentNumber, 'string', 10),
                3 => shopNirPremiumXlsxCellSpec($attachment['original_name'] ?? '', 'string', 10), 4 => shopNirPremiumXlsxCellSpec($attachment['mime_type'] ?? '', 'string', 10),
                5 => shopNirPremiumXlsxCellSpec($attachment['extension'] ?? '', 'string', 10), 6 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxNumber($attachment['file_size'] ?? null), 'number', 24),
                7 => shopNirPremiumXlsxCellSpec($attachment['sha256'] ?? '', 'string', 10), 8 => shopNirPremiumXlsxCellSpec($attachment['extraction_status'] ?? '', 'string', 10),
                9 => shopNirPremiumXlsxCellSpec($attachment['created_by'] ?? '', 'string', 10), 10 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($attachment['created_at'] ?? null, true), 'datetime', 16),
            ], 36); $r++;
        }
    }
    $r++;
    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('JURNAL DE AUDIT', 'string', 4)], 23); $merges[] = 'A' . $r . ':J' . $r; $r++;
    $auditHeader = ['ID eveniment', 'Acțiune', 'ID entitate', 'ID actor', 'Actor', 'Moment', 'Valori anterioare', 'Valori noi', 'Context', 'Observație'];
    $cells = []; foreach ($auditHeader as $index => $header) $cells[$index + 1] = shopNirPremiumXlsxCellSpec($header, 'string', 9);
    $rows .= shopNirPremiumXlsxRow($r, $cells, 40); $auditHeaderRow = $r; $r++;
    if (!$audit) {
        $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('Contextul exportului nu conține evenimente de audit.', 'string', 19)], 32); $merges[] = 'A' . $r . ':J' . $r; $r++;
    } else {
        foreach ($audit as $event) {
            $rows .= shopNirPremiumXlsxRow($r, [
                1 => shopNirPremiumXlsxCellSpec($event['id'] ?? '', 'string', 10), 2 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxAuditAction($event['action_type'] ?? ''), 'string', 10),
                3 => shopNirPremiumXlsxCellSpec($event['entity_id'] ?? '', 'string', 10), 4 => shopNirPremiumXlsxCellSpec($event['actor_id'] ?? '', 'string', 10),
                5 => shopNirPremiumXlsxCellSpec($event['actor_name'] ?? '', 'string', 10), 6 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($event['created_at'] ?? null, true), 'datetime', 16),
                7 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxJson($event['old_values'] ?? null), 'string', 10), 8 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxJson($event['new_values'] ?? null), 'string', 10),
                9 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxJson($event['context'] ?? null), 'string', 10), 10 => shopNirPremiumXlsxCellSpec('', 'string', 10),
            ], 52); $r++;
        }
    }
    $r++;
    $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('RELAȚII ȘI GENERARE', 'string', 4)], 23); $merges[] = 'A' . $r . ':J' . $r; $r++;
    $meta = [];
    if (shopNirPremiumXlsxIsStornoDocument($document)) {
        $meta[] = ['Referință document original', shopNirPremiumXlsxOriginalInvoiceTrace($relationship, $context)];
    }
    $meta = array_merge($meta, [
        ['Document inițial', shopNirPremiumXlsxJson($relationship['original'] ?? null)], ['Document de stornare', shopNirPremiumXlsxJson($relationship['reversal'] ?? null)],
        ['Motiv', shopNirPremiumXlsxPresentationText($relationship['reason'] ?? '')], ['Generat de', $generation['generated_by'] ?? ''], ['Generat la', $generation['generated_at'] ?? ''],
        ['Aplicație', $generation['app'] ?? 'G-Trots Management'], ['Amprentă date', $generation['data_fingerprint'] ?? ''],
    ]);
    foreach ($meta as $item) {
        $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec($item[0], 'string', 5), 3 => shopNirPremiumXlsxCellSpec($item[1], 'string', 6)], 30);
        $merges[] = 'A' . $r . ':B' . $r; $merges[] = 'C' . $r . ':J' . $r; $r++;
    }
    $lastRow = $r - 1;
    $widths = [18, 20, 30, 24, 16, 18, 32, 32, 32, 24];
    return ['xml' => shopNirPremiumXlsxSheet($rows, $widths, $lastRow, 10, ['merges' => $merges, 'freeze_rows' => $documentsHeaderRow, 'orientation' => 'landscape', 'paper_size' => 9]), 'last_row' => $lastRow, 'audit_header_row' => $auditHeaderRow];
}

function shopNirPremiumXlsxDictionarySheet(array $columns): array
{
    $rows = '';
    $merges = ['A1:F1', 'A2:F2'];
    $rows .= shopNirPremiumXlsxRow(1, [1 => shopNirPremiumXlsxCellSpec('DICȚIONARUL CÂMPURILOR', 'string', 1)], 34);
    $rows .= shopNirPremiumXlsxRow(2, [1 => shopNirPremiumXlsxCellSpec('Disponibil = furnizat de aplicație; Derivat = formulă sau etichetă transparentă; Nestocat = coloană intenționat goală.', 'string', 3)], 30);
    $rows .= shopNirPremiumXlsxRow(3, [], 8);
    $headers = ['Foaie', 'Coloană', 'Descriere', 'Sursă / formulă', 'Disponibilitate', 'Observație de utilizare'];
    $cells = []; foreach ($headers as $index => $header) $cells[$index + 1] = shopNirPremiumXlsxCellSpec($header, 'string', 9);
    $headerRow = 4;
    $rows .= shopNirPremiumXlsxRow($headerRow, $cells, 38);
    $r = 5;
    foreach ($columns as $column) {
        $availability = (string)$column['availability'];
        $availabilityStyle = $availability === 'Disponibil' ? 20 : ($availability === 'Derivat' ? 21 : 22);
        $rows .= shopNirPremiumXlsxRow($r, [
            1 => shopNirPremiumXlsxCellSpec('Poziții NIR', 'string', 10), 2 => shopNirPremiumXlsxCellSpec($column['title'], 'string', 10),
            3 => shopNirPremiumXlsxCellSpec($column['description'], 'string', 10), 4 => shopNirPremiumXlsxCellSpec($column['source'], 'string', 10),
            5 => shopNirPremiumXlsxCellSpec($availability, 'string', $availabilityStyle),
            6 => shopNirPremiumXlsxCellSpec($availability === 'Nestocat' ? 'Nu se completează automat și nu se deduce din alte date.' : 'Păstrează tipul real pentru filtrare și calcule.', 'string', 10),
        ], 38); $r++;
    }
    $additional = [
        ['Rezumat NIR', 'Totaluri contabile', 'Totalurile confirmate ale documentului.', 'document + pdf_context.summary', 'Disponibil'],
        ['Rezumat NIR', 'Centralizare TVA', 'Defalcare pe cote/regimuri disponibile.', 'pdf_context.summary.vat_breakdown', 'Disponibil'],
        ['Diferențe', 'Diferențe cantitative', 'Referințe și formule către foaia Poziții NIR.', 'FORMULE OOXML', 'Derivat'],
        ['Documente & Audit', 'Documente asociate', 'Metadatele fișierelor atașate.', 'pdf_context.attachments', 'Disponibil'],
        ['Documente & Audit', 'Jurnal de audit', 'Evenimentele exportate și valorile JSON.', 'pdf_context.audit', 'Disponibil'],
        ['Documente & Audit', 'Amprentă date', 'Amprenta furnizată de serviciul NIR.', 'pdf_context.generation.data_fingerprint', 'Disponibil'],
    ];
    foreach ($additional as $item) {
        $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec($item[0], 'string', 10), 2 => shopNirPremiumXlsxCellSpec($item[1], 'string', 10), 3 => shopNirPremiumXlsxCellSpec($item[2], 'string', 10), 4 => shopNirPremiumXlsxCellSpec($item[3], 'string', 10), 5 => shopNirPremiumXlsxCellSpec($item[4], 'string', $item[4] === 'Derivat' ? 21 : 20), 6 => shopNirPremiumXlsxCellSpec('Nu introduce logică operațională nouă.', 'string', 10)], 38); $r++;
    }
    $lastRow = $r - 1;
    return ['xml' => shopNirPremiumXlsxSheet($rows, [20, 28, 32, 32, 18, 32], $lastRow, 6, ['merges' => $merges, 'auto_filter' => 'A' . $headerRow . ':F' . $lastRow, 'freeze_rows' => $headerRow, 'orientation' => 'landscape', 'paper_size' => 9]), 'last_row' => $lastRow];
}

function shopNirPremiumXlsxWorkbook(array $sheetMeta): string
{
    $sheets = ['Rezumat NIR', 'Poziții NIR', 'Diferențe', 'Documente & Audit', 'Dicționar câmpuri'];
    $sheetXml = '';
    foreach ($sheets as $index => $name) $sheetXml .= '<sheet name="' . shopNirPremiumXlsxXml($name) . '" sheetId="' . ($index + 1) . '" r:id="rId' . ($index + 1) . '"/>';
    $defined = '';
    foreach ($sheets as $index => $name) {
        $lastColumn = shopNirPremiumXlsxColumn((int)($sheetMeta[$index]['last_column'] ?? ($index === 1 ? 1 : 10)));
        $lastRow = max(1, (int)($sheetMeta[$index]['last_row'] ?? 1));
        $defined .= '<definedName name="_xlnm.Print_Area" localSheetId="' . $index . '">\'' . shopNirPremiumXlsxXml($name) . '\'!$A$1:$' . $lastColumn . '$' . $lastRow . '</definedName>';
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="9303"/><workbookPr date1904="0"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews><sheets>' . $sheetXml . '</sheets><definedNames>' . $defined . '</definedNames><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>';
}

function shopNirRenderStrictXlsx(array $document): string
{
    if (!function_exists('shopNirBuildZip')) throw new RuntimeException('Serviciul NIR trebuie încărcat înaintea generatorului XLSX.');
    $context = is_array($document['pdf_context'] ?? null) ? $document['pdf_context'] : [];
    $company = is_array($context['company'] ?? null) ? $context['company'] : [];
    $supplier = is_array($context['supplier'] ?? null) ? $context['supplier'] : [];
    $warehouse = is_array($context['warehouse'] ?? null) ? $context['warehouse'] : [];
    $relationship = is_array($context['relationship'] ?? null) ? $context['relationship'] : [];
    $lines = array_values(is_array($document['lines'] ?? null) ? $document['lines'] : []);
    $isStorno = shopNirPremiumXlsxIsStornoDocument($document);
    $companyName = trim((string)($company['legal_name'] ?? $company['trade_name'] ?? 'G-Trots România'));
    $companyIdentity = implode(' | ', array_values(array_filter([
        trim((string)($company['cui'] ?? '')) !== '' ? 'CUI ' . $company['cui'] : '',
        trim((string)($company['registration_number'] ?? '')) !== '' ? 'Reg. Com. ' . $company['registration_number'] : '',
    ], static fn(string $value): bool => $value !== '')));
    $supplierName = trim((string)($supplier['name'] ?? $document['supplier_name'] ?? ''));
    $supplierCui = trim((string)($supplier['cui'] ?? $supplier['vat_number'] ?? $document['supplier_cui'] ?? ''));
    $warehouseName = trim((string)($warehouse['name'] ?? $document['warehouse_name'] ?? ''));
    $location = trim((string)($document['reception_location'] ?? $document['receipt_location'] ?? ''));
    if ($location === '') $location = implode(', ', array_values(array_filter([$warehouseName, $warehouse['address'] ?? '', $warehouse['city'] ?? ''], static fn($value): bool => trim((string)$value) !== '')));
    $reason = shopNirPremiumXlsxPresentationText($relationship['reason'] ?? $document['difference_notes'] ?? $document['notes'] ?? '');
    $currentInvoice = trim((string)($document['supplier_invoice_series'] ?? '') . ' ' . (string)($document['supplier_invoice_number'] ?? ''));
    $currentDate = trim((string)($document['supplier_invoice_date'] ?? ''));
    if ($currentDate !== '') { try { $currentDate = (new DateTimeImmutable($currentDate))->format('d.m.Y'); } catch (Throwable $error) {} }
    $currentInvoice = implode(' / ', array_values(array_filter([$currentInvoice, $currentDate], static fn(string $value): bool => trim($value) !== '')));
    $originalInvoiceData = is_array($relationship['original_invoice'] ?? null) ? $relationship['original_invoice'] : [];
    $originalInvoice = trim((string)($originalInvoiceData['series'] ?? '') . ' ' . (string)($originalInvoiceData['number'] ?? ''));
    $originalDate = trim((string)($originalInvoiceData['date'] ?? ''));
    if ($originalDate !== '') { try { $originalDate = (new DateTimeImmutable($originalDate))->format('d.m.Y'); } catch (Throwable $error) {} }
    $originalInvoice = implode(' / ', array_values(array_filter([$originalInvoice, $originalDate], static fn(string $value): bool => trim($value) !== '')));
    $documentNumber = shopNirPremiumXlsxDocumentNumber($document['nir_number'] ?? $document['temporary_number'] ?? 'NIR', $document['nir_date'] ?? null);
    $documentDate = trim((string)($document['nir_date'] ?? $document['created_at'] ?? ''));
    if ($documentDate !== '') { try { $documentDate = (new DateTimeImmutable($documentDate))->format('d.m.Y'); } catch (Throwable $error) {} }

    $rows = '';
    $merges = ['A1:B3', 'C1:F1', 'C2:F2', 'C3:F3', 'G1:L2', 'G3:L3', 'M1:M3', 'A5:F6', 'G5:H6', 'I5:M6'];
    $rows .= shopNirPremiumXlsxRow(1, [1 => shopNirPremiumXlsxCellSpec('', 'string', 29), 3 => shopNirPremiumXlsxCellSpec('G-TROTS', 'string', 30), 7 => shopNirPremiumXlsxCellSpec('NOTĂ DE RECEPȚIE ȘI CONSTATARE DE DIFERENȚE', 'string', 1), 13 => shopNirPremiumXlsxCellSpec("Cod formular:\nNIR", 'string', 3)], 32);
    $rows .= shopNirPremiumXlsxRow(2, [3 => shopNirPremiumXlsxCellSpec($companyName, 'string', 31)], 24);
    $rows .= shopNirPremiumXlsxRow(3, [3 => shopNirPremiumXlsxCellSpec($companyIdentity, 'string', 32), 7 => shopNirPremiumXlsxCellSpec('(NIR)', 'string', 33)], 20);
    $rows .= shopNirPremiumXlsxRow(4, [], 8);
    $rows .= shopNirPremiumXlsxRow(5, [1 => shopNirPremiumXlsxCellSpec("Nr. NIR\n" . $documentNumber, 'string', 34), 7 => shopNirPremiumXlsxCellSpec("din data de\n" . $documentDate, 'string', $isStorno ? 28 : 35)], 24);
    $rows .= shopNirPremiumXlsxRow(6, [], 24);
    $fieldRows = [
        ['Furnizor:', $supplierName, 'Factura furnizor nr. / data:', $currentInvoice],
        ['CUI furnizor:', $supplierCui, 'Factura inițială stornată nr. / data:', $originalInvoice],
        ['Gestiune:', $warehouseName, 'Tip operațiune:', $isStorno ? 'Stornare' : 'Recepție'],
        ['Loc recepție:', $location, 'Motiv stornare / retur / diferență:', $reason],
    ];
    $rowNumber = 7;
    foreach ($fieldRows as $fields) {
        $merges[] = 'A' . $rowNumber . ':B' . $rowNumber;
        $merges[] = 'C' . $rowNumber . ':F' . $rowNumber;
        $merges[] = 'G' . $rowNumber . ':I' . $rowNumber;
        $merges[] = 'J' . $rowNumber . ':M' . $rowNumber;
        $rows .= shopNirPremiumXlsxRow($rowNumber, [
            1 => shopNirPremiumXlsxCellSpec($fields[0], 'string', 23), 3 => shopNirPremiumXlsxCellSpec($fields[1], 'string', 10),
            7 => shopNirPremiumXlsxCellSpec($fields[2], 'string', 23), 10 => shopNirPremiumXlsxCellSpec($fields[3], 'string', 10),
        ], 26);
        $rowNumber++;
    }
    $rows .= shopNirPremiumXlsxRow(11, [], 8);
    $headers = ['Nr. crt.', 'Cod / SKU', 'Imagine', 'Denumirea bunurilor recepționate', 'U.M.', 'Cantitate document', 'Cantitate recepționată', 'Diferență cantitativă', 'Preț unitar fără TVA', 'Valoare fără TVA', 'TVA %', 'Valoare TVA', 'Valoare totală'];
    $headerCells = [];
    foreach ($headers as $index => $header) $headerCells[$index + 1] = shopNirPremiumXlsxCellSpec($header, 'string', 9);
    $rows .= shopNirPremiumXlsxRow(12, $headerCells, 48);
    $firstDataRow = 13;
    $dataRow = $firstDataRow;
    foreach ($lines as $index => $line) {
        if (!is_array($line)) continue;
        $invoiced = (float)($line['invoiced_quantity'] ?? 0);
        $received = (float)($line['received_quantity'] ?? $line['accepted_quantity'] ?? 0);
        $discount = (float)($line['discount_percent'] ?? 0);
        $price = (float)($line['unit_price'] ?? 0) * (1 - $discount / 100);
        $net = $received * $price;
        $vatRate = (float)($line['vat_rate'] ?? 0);
        $vat = $net * $vatRate / 100;
        $name = trim((string)($line['product_name'] ?? $line['product_snapshot_name'] ?? $line['supplier_product_name'] ?? ''));
        $rows .= shopNirPremiumXlsxRow($dataRow, [
            1 => shopNirPremiumXlsxCellSpec($line['line_number'] ?? ($index + 1), 'number', 11),
            2 => shopNirPremiumXlsxCellSpec($line['product_sku'] ?? $line['sku_snapshot'] ?? $line['supplier_product_code'] ?? '', 'string', 10),
            3 => shopNirPremiumXlsxCellSpec('', 'string', 41),
            4 => shopNirPremiumXlsxCellSpec($name, 'string', 10), 5 => shopNirPremiumXlsxCellSpec($line['purchase_unit'] ?? $line['stock_unit'] ?? '', 'string', 41),
            6 => shopNirPremiumXlsxCellSpec($invoiced, 'number', 11), 7 => shopNirPremiumXlsxCellSpec($received, 'number', 11),
            8 => shopNirPremiumXlsxCellSpec($received - $invoiced, 'number', abs($received - $invoiced) < 0.000001 ? 40 : 39, 'G' . $dataRow . '-F' . $dataRow),
            9 => shopNirPremiumXlsxCellSpec($price, 'number', 13), 10 => shopNirPremiumXlsxCellSpec($net, 'number', 13, 'G' . $dataRow . '*I' . $dataRow),
            11 => shopNirPremiumXlsxCellSpec($vatRate, 'number', 11), 12 => shopNirPremiumXlsxCellSpec($vat, 'number', 13, 'J' . $dataRow . '*K' . $dataRow . '/100'),
            13 => shopNirPremiumXlsxCellSpec($net + $vat, 'number', 13, 'J' . $dataRow . '+L' . $dataRow),
        ], 50);
        $dataRow++;
    }
    if ($dataRow === $firstDataRow) {
        $rows .= shopNirPremiumXlsxRow($dataRow, [1 => shopNirPremiumXlsxCellSpec('Nu există poziții.', 'string', 19)], 36);
        $merges[] = 'A' . $dataRow . ':M' . $dataRow;
        $dataRow++;
    }
    $lastDataRow = $dataRow - 1;
    $vatRates = [];
    foreach (array_filter($lines, 'is_array') as $line) {
        $rate = (float)($line['vat_rate'] ?? 0);
        $vatRates[sprintf('%.4F', $rate)] = $rate;
    }
    ksort($vatRates, SORT_NATURAL);
    $vatRateLabel = implode(' / ', array_map(static function (float $rate): string {
        $formatted = rtrim(rtrim(number_format($rate, 4, '.', ''), '0'), '.');
        return str_replace('.', ',', $formatted) . '%';
    }, array_values($vatRates)));
    $rows .= shopNirPremiumXlsxRow($dataRow, [1 => shopNirPremiumXlsxCellSpec('TOTAL', 'string', 6), 10 => shopNirPremiumXlsxCellSpec(array_sum(array_map(static fn(array $line): float => (float)($line['received_quantity'] ?? $line['accepted_quantity'] ?? 0) * (float)($line['unit_price'] ?? 0) * (1 - (float)($line['discount_percent'] ?? 0) / 100), array_filter($lines, 'is_array'))), 'number', 17, 'SUM(J' . $firstDataRow . ':J' . $lastDataRow . ')'), 11 => shopNirPremiumXlsxCellSpec($vatRateLabel, 'string', 11), 12 => shopNirPremiumXlsxCellSpec(array_sum(array_map(static fn(array $line): float => (float)($line['received_quantity'] ?? $line['accepted_quantity'] ?? 0) * (float)($line['unit_price'] ?? 0) * (1 - (float)($line['discount_percent'] ?? 0) / 100) * (float)($line['vat_rate'] ?? 0) / 100, array_filter($lines, 'is_array'))), 'number', 17, 'SUM(L' . $firstDataRow . ':L' . $lastDataRow . ')'), 13 => shopNirPremiumXlsxCellSpec(array_sum(array_map(static fn(array $line): float => (float)($line['received_quantity'] ?? $line['accepted_quantity'] ?? 0) * (float)($line['unit_price'] ?? 0) * (1 - (float)($line['discount_percent'] ?? 0) / 100) * (1 + (float)($line['vat_rate'] ?? 0) / 100), array_filter($lines, 'is_array'))), 'number', 36, 'SUM(M' . $firstDataRow . ':M' . $lastDataRow . ')')], 30);
    $merges[] = 'A' . $dataRow . ':I' . $dataRow;
    $dataRow += 2;
    $rows .= shopNirPremiumXlsxRow($dataRow, [1 => shopNirPremiumXlsxCellSpec('Constatări privind recepția / diferențe calitative sau cantitative:', 'string', 4)], 24);
    $merges[] = 'A' . $dataRow . ':M' . $dataRow;
    $dataRow++;
    $rows .= shopNirPremiumXlsxRow($dataRow, [1 => shopNirPremiumXlsxCellSpec($document['notes'] ?? '', 'string', 37)], 48);
    $merges[] = 'A' . $dataRow . ':M' . $dataRow;
    $dataRow += 2;
    $stampRow = $dataRow;
    $rows .= shopNirPremiumXlsxRow($dataRow, [1 => shopNirPremiumXlsxCellSpec(trim((string)($company['stamp_path'] ?? '')) === '' ? 'ȘTAMPILA FIRMEI' : '', 'string', 38)], 88);
    $merges[] = 'A' . $dataRow . ':M' . $dataRow;
    $lastRow = $dataRow;

    $media = []; $mediaIndex = []; $pictures = [];
    foreach ([__DIR__ . '/pdf-assets/logo.jpg', dirname(__DIR__) . '/assets/images/logo.png'] as $logoPath) {
        if (!is_file($logoPath)) continue;
        $bytes = file_get_contents($logoPath);
        if (!is_string($bytes)) continue;
        $image = shopNirPremiumXlsxNormaliseImage($bytes, 180, 180, true);
        if ($image === null) continue;
        $mediaName = shopNirPremiumXlsxRegisterMedia($media, $mediaIndex, $image, 'gtrots-logo');
        $scale = min(72 / max(1, (int)$image['width']), 72 / max(1, (int)$image['height']));
        $pictures[] = ['media' => $mediaName, 'name' => 'Logo G-Trots', 'description' => 'Logo G-Trots', 'col' => 0, 'row' => 0, 'colOff' => 90000, 'rowOff' => 40000, 'cx' => (int)round((int)$image['width'] * $scale * 9525), 'cy' => (int)round((int)$image['height'] * $scale * 9525)];
        break;
    }
    foreach ($lines as $index => $line) {
        if (!is_array($line)) continue;
        $image = shopNirPremiumXlsxSafeLocalProductImage($line['product_image_storage_path'] ?? $line['product_image_url'] ?? null);
        if ($image === null) continue;
        $mediaName = shopNirPremiumXlsxRegisterMedia($media, $mediaIndex, $image, 'produs');
        $scale = min(48 / max(1, (int)$image['width']), 42 / max(1, (int)$image['height']));
        $pictures[] = ['media' => $mediaName, 'name' => 'Produs NIR ' . ($index + 1), 'description' => $line['product_name'] ?? $line['supplier_product_name'] ?? 'Produs', 'col' => 2, 'row' => $firstDataRow + $index - 1, 'colOff' => 4 * 9525, 'rowOff' => 4 * 9525, 'cx' => (int)round((int)$image['width'] * $scale * 9525), 'cy' => (int)round((int)$image['height'] * $scale * 9525)];
    }
    $stampImage = shopNirPremiumXlsxSafeCompanyStamp($company['stamp_path'] ?? null);
    if ($stampImage !== null) {
        $mediaName = shopNirPremiumXlsxRegisterMedia($media, $mediaIndex, $stampImage, 'stampila');
        $scale = min(190 / max(1, (int)$stampImage['width']), 78 / max(1, (int)$stampImage['height']));
        $pictures[] = ['media' => $mediaName, 'name' => 'Ștampila firmei', 'description' => 'Ștampila firmei', 'col' => 10, 'row' => $stampRow - 1, 'colOff' => 8 * 9525, 'rowOff' => 5 * 9525, 'cx' => (int)round((int)$stampImage['width'] * $scale * 9525), 'cy' => (int)round((int)$stampImage['height'] * $scale * 9525)];
    }
    $files = [];
    $drawingOverride = '';
    if ($pictures) {
        $drawing = shopNirPremiumXlsxDrawing($pictures);
        $files['xl/drawings/drawing1.xml'] = $drawing['xml'];
        $files['xl/drawings/_rels/drawing1.xml.rels'] = $drawing['rels'];
        $files['xl/worksheets/_rels/sheet1.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
        $drawingOverride = '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
    }
    foreach ($media as $name => $bytes) $files['xl/media/' . $name] = $bytes;
    $files['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' . $drawingOverride . '</Types>';
    $files['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    $files['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView windowWidth="24000" windowHeight="14000"/></bookViews><sheets><sheet name="NIR" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">NIR!$A$1:$M$' . $lastRow . '</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">NIR!$12:$12</definedName></definedNames><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>';
    $files['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    $files['xl/styles.xml'] = shopNirReferenceXlsxStyles((string)($document['currency'] ?? 'RON'));
    $files['xl/worksheets/sheet1.xml'] = shopNirPremiumXlsxSheet($rows, [6, 13, 11, 23, 8, 13, 14, 13, 13, 14, 9, 13, 16], $lastRow, 13, ['merges' => $merges, 'drawing' => !empty($pictures), 'orientation' => 'landscape', 'paper_size' => 9, 'fit_to_height' => count($lines) <= 4 ? 1 : 0, 'header' => '', 'footer' => '&RPagina &P / &N']);
    $creator = trim((string)($context['generation']['generated_by'] ?? 'G-Trots Management')) ?: 'G-Trots Management';
    $created = gmdate('Y-m-d\TH:i:s\Z');
    $files['docProps/core.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' . shopNirPremiumXlsxXml('NIR ' . $documentNumber) . '</dc:title><dc:creator>' . shopNirPremiumXlsxXml($creator) . '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' . $created . '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' . $created . '</dcterms:modified></cp:coreProperties>';
    $files['docProps/app.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>G-Trots Management</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>NIR</vt:lpstr></vt:vector></TitlesOfParts><Company>' . shopNirPremiumXlsxXml($companyName) . '</Company></Properties>';
    return shopNirBuildZip($files);
}

function shopNirRenderPremiumXlsx(array $document): string
{
    return shopNirRenderStrictXlsx($document);
    if (!function_exists('shopNirBuildZip')) throw new RuntimeException('Serviciul NIR trebuie încărcat înaintea generatorului XLSX.');
    $lines = array_values(is_array($document['lines'] ?? null) ? $document['lines'] : []);
    $columns = shopNirPremiumXlsxPositionColumns();

    $media = [];
    $mediaIndex = [];
    $logoMedia = null;
    $logoImage = null;
    foreach ([__DIR__ . '/pdf-assets/logo.jpg', dirname(__DIR__) . '/assets/images/logo.png'] as $logoPath) {
        if (!is_file($logoPath)) continue;
        $bytes = file_get_contents($logoPath);
        if (!is_string($bytes)) continue;
        $logoImage = shopNirPremiumXlsxNormaliseImage($bytes, 220, 220, true);
        if ($logoImage !== null) break;
    }
    if ($logoImage !== null) $logoMedia = shopNirPremiumXlsxRegisterMedia($media, $mediaIndex, $logoImage, 'gtrots-logo');

    $thumbnailMedia = [];
    $mediaBudget = 24 * 1024 * 1024;
    $mediaBytes = array_sum(array_map('strlen', $media));
    foreach ($lines as $index => $line) {
        $image = shopNirPremiumXlsxSafeLocalProductImage($line['product_image_url'] ?? null);
        if ($image === null) continue;
        $hash = hash('sha256', (string)$image['bytes']);
        $isNew = !isset($mediaIndex[$hash]);
        if ($isNew && $mediaBytes + strlen((string)$image['bytes']) > $mediaBudget) continue;
        $name = shopNirPremiumXlsxRegisterMedia($media, $mediaIndex, $image, 'produs');
        if ($isNew) $mediaBytes += strlen((string)$image['bytes']);
        $thumbnailMedia[$index] = ['media' => $name, 'width' => (int)$image['width'], 'height' => (int)$image['height']];
    }

    $summary = shopNirPremiumXlsxSummarySheet($document, $logoMedia !== null);
    $positions = shopNirPremiumXlsxPositionsSheet($document, $columns, $thumbnailMedia);
    $differences = shopNirPremiumXlsxDifferencesSheet($document, $positions);
    $audit = shopNirPremiumXlsxAuditSheet($document);
    $dictionary = shopNirPremiumXlsxDictionarySheet($columns);

    $files = [];
    $drawingOverrides = '';
    if ($logoMedia !== null && $logoImage !== null) {
        $logoScale = min(96 / max(1, (int)$logoImage['width']), 96 / max(1, (int)$logoImage['height']));
        $drawing = shopNirPremiumXlsxDrawing([[
            'media' => $logoMedia, 'name' => 'Logo G-Trots', 'description' => 'Identitatea vizuală G-Trots', 'col' => 0, 'row' => 0,
            'colOff' => 115000, 'rowOff' => 70000, 'cx' => (int)round((int)$logoImage['width'] * $logoScale * 9525), 'cy' => (int)round((int)$logoImage['height'] * $logoScale * 9525),
        ]]);
        $files['xl/drawings/drawing1.xml'] = $drawing['xml'];
        $files['xl/drawings/_rels/drawing1.xml.rels'] = $drawing['rels'];
        $files['xl/worksheets/_rels/sheet1.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
        $drawingOverrides .= '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
    }
    if ($thumbnailMedia) {
        $pictures = [];
        foreach ($thumbnailMedia as $lineIndex => $image) {
            $scale = min(54 / max(1, (int)$image['width']), 46 / max(1, (int)$image['height']));
            $pixelWidth = max(1, (int)round((int)$image['width'] * $scale));
            $pixelHeight = max(1, (int)round((int)$image['height'] * $scale));
            $line = $lines[$lineIndex] ?? [];
            $pictures[] = [
                'media' => $image['media'], 'name' => 'Produs NIR ' . ($line['line_number'] ?? $lineIndex + 1),
                'description' => $line['product_name'] ?? $line['supplier_product_name'] ?? 'Produs NIR', 'col' => 0,
                'row' => (int)$positions['first_data_row'] + $lineIndex - 1,
                'colOff' => max(0, (int)round((68 - $pixelWidth) / 2 * 9525)), 'rowOff' => max(0, (int)round((62 - $pixelHeight) / 2 * 9525)),
                'cx' => $pixelWidth * 9525, 'cy' => $pixelHeight * 9525,
            ];
        }
        $drawing = shopNirPremiumXlsxDrawing($pictures);
        $files['xl/drawings/drawing2.xml'] = $drawing['xml'];
        $files['xl/drawings/_rels/drawing2.xml.rels'] = $drawing['rels'];
        $files['xl/worksheets/_rels/sheet2.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing2.xml"/></Relationships>';
        $drawingOverrides .= '<Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
    }

    foreach ($media as $name => $bytes) $files['xl/media/' . $name] = $bytes;
    $files['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' . $drawingOverrides . '</Types>';
    $files['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    $files['xl/workbook.xml'] = shopNirPremiumXlsxWorkbook([
        ['last_row' => $summary['last_row'], 'last_column' => 10], ['last_row' => $positions['last_row'], 'last_column' => $positions['last_column']],
        ['last_row' => $differences['last_row'], 'last_column' => 19], ['last_row' => $audit['last_row'], 'last_column' => 10], ['last_row' => $dictionary['last_row'], 'last_column' => 6],
    ]);
    $files['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/><Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    $files['xl/styles.xml'] = shopNirPremiumXlsxStyles();
    $files['xl/worksheets/sheet1.xml'] = $summary['xml'];
    $files['xl/worksheets/sheet2.xml'] = $positions['xml'];
    $files['xl/worksheets/sheet3.xml'] = $differences['xml'];
    $files['xl/worksheets/sheet4.xml'] = $audit['xml'];
    $files['xl/worksheets/sheet5.xml'] = $dictionary['xml'];

    $context = is_array($document['pdf_context'] ?? null) ? $document['pdf_context'] : [];
    $generation = is_array($context['generation'] ?? null) ? $context['generation'] : [];
    $creator = trim((string)($generation['generated_by'] ?? 'G-Trots Management')) ?: 'G-Trots Management';
    $created = gmdate('Y-m-d\TH:i:s\Z');
    $documentNumber = shopNirPremiumXlsxDocumentNumber($document['nir_number'] ?? $document['temporary_number'] ?? '', $document['nir_date'] ?? null);
    $files['docProps/core.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' . shopNirPremiumXlsxXml('NIR ' . $documentNumber) . '</dc:title><dc:subject>Recepție marfă G-Trots</dc:subject><dc:creator>' . shopNirPremiumXlsxXml($creator) . '</dc:creator><cp:lastModifiedBy>' . shopNirPremiumXlsxXml($creator) . '</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">' . $created . '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' . $created . '</dcterms:modified></cp:coreProperties>';
    $sheetNames = ['Rezumat NIR', 'Poziții NIR', 'Diferențe', 'Documente & Audit', 'Dicționar câmpuri'];
    $titles = ''; foreach ($sheetNames as $name) $titles .= '<vt:lpstr>' . shopNirPremiumXlsxXml($name) . '</vt:lpstr>';
    $files['docProps/app.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>G-Trots Management</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>5</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="5" baseType="lpstr">' . $titles . '</vt:vector></TitlesOfParts><Company>' . shopNirPremiumXlsxXml($context['company']['legal_name'] ?? 'G-Trots România') . '</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>1.0</AppVersion></Properties>';

    return shopNirBuildZip($files);
}
