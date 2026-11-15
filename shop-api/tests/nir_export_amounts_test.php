<?php
declare(strict_types=1);

require_once __DIR__ . '/../nir-service.php';
require_once __DIR__ . '/../nir-pdf.php';

$checks = 0;
function checkExportAmount(bool $condition, string $message): void {
    global $checks;
    $checks++;
    if (!$condition) throw new RuntimeException($message);
}

function savedExportLine(string $quantity, string $price, string $net, string $vat, string $total): array {
    return [
        'invoiced_quantity' => $quantity, 'received_quantity' => $quantity, 'accepted_quantity' => $quantity,
        'unit_price' => $price, 'vat_rate' => '21', 'discount_percent' => '0', 'purchase_unit' => 'buc',
        'supplier_product_name' => 'Produs test', 'line_net' => $net, 'line_vat' => $vat, 'line_total' => $total,
        'line_net_ron' => shopNirScaledToDecimal(shopNirDecimalToScaled($net, 2), 2),
        'line_vat_ron' => shopNirScaledToDecimal(shopNirDecimalToScaled($vat, 2), 2),
        'line_total_ron' => shopNirScaledToDecimal(shopNirDecimalToScaled($total, 2), 2),
    ];
}

function verifyExportAmounts(array $document, array $expected, string $label): void {
    $before = serialize($document);
    $html = shopNirStrictPdfHtml($document);
    $dom = new DOMDocument();
    @$dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    $xpath = new DOMXPath($dom);
    $rows = $xpath->query('//table[@class="items"]/tbody/tr');
    $currency = $document['currency'] ?? 'RON';
    $suffix = $currency === 'RON' ? 'lei' : $currency;
    foreach ($document['lines'] as $index => $line) {
        $amounts = shopNirExportLineAmounts($line, $currency);
        foreach (['unit_price' => 8, 'net' => 9, 'vat' => 11, 'total' => 12] as $key => $cellIndex) {
            $actual = trim($rows->item($index)->getElementsByTagName('td')->item($cellIndex)->textContent);
            checkExportAmount($actual === number_format((float)$amounts[$key], 2, ',', '.') . ' ' . $suffix, "$label: PDF line $index $key must keep two monetary decimals");
        }
    }
    $footer = $xpath->query('//tr[@class="totals"]')->item(0)->getElementsByTagName('td');
    foreach (['net' => 1, 'vat' => 3, 'total' => 4] as $key => $index) {
        checkExportAmount(trim($footer->item($index)->textContent) === number_format((float)$expected[$key], 2, ',', '.') . ' ' . $suffix, "$label: PDF total $key must keep two monetary decimals");
    }

    $temp = tempnam(sys_get_temp_dir(), 'nir-amounts-');
    try {
        file_put_contents($temp, shopNirBuildXlsx($document));
        $zip = new ZipArchive();
        checkExportAmount($zip->open($temp) === true, "$label: XLSX ZIP");
        $xml = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();
        $sheet = new DOMDocument();
        $sheet->loadXML($xml);
        $cells = [];
        foreach ($sheet->getElementsByTagName('c') as $cell) $cells[$cell->getAttribute('r')] = $cell;
        foreach ($document['lines'] as $index => $line) {
            $amounts = shopNirExportLineAmounts($line, $currency);
            foreach (['net' => 'J', 'vat' => 'L', 'total' => 'M'] as $key => $column) {
                $cell = $cells[$column . (13 + $index)];
                checkExportAmount(shopNirDecimalToScaled($cell->getElementsByTagName('v')->item(0)->textContent, 2) === shopNirDecimalToScaled($amounts[$key], 2), "$label: XLSX line $index $key");
                checkExportAmount($cell->getElementsByTagName('f')->length === 0, "$label: Excel must not recalculate saved line $key");
            }
        }
        foreach (['net' => 'J', 'vat' => 'L', 'total' => 'M'] as $key => $column) {
            $cell = $cells[$column . (13 + count($document['lines']))];
            checkExportAmount(shopNirDecimalToScaled($cell->getElementsByTagName('v')->item(0)->textContent, 2) === shopNirDecimalToScaled($expected[$key], 2), "$label: XLSX total $key");
            checkExportAmount($cell->getElementsByTagName('f')->length === 0, "$label: Excel must preserve document $key");
        }
    } finally { unlink($temp); }
    checkExportAmount(serialize($document) === $before, "$label: exporting must not mutate the NIR");
}

// Monetary regression fixtures from NIR 1 and NIR 2, without identifying data.
$nir1 = ['currency' => 'RON', 'subtotal_ron' => '122.32', 'vat_total_ron' => '25.68', 'grand_total_ron' => '148.00', 'lines' => [
    savedExportLine('4', '16.53', '66.120000', '13.880000', '80.000000'),
    savedExportLine('1', '56.20', '56.200000', '11.802000', '68.002000'),
]];
$nir2 = ['currency' => 'RON', 'subtotal_ron' => '503.30', 'vat_total_ron' => '105.70', 'grand_total_ron' => '609.00', 'lines' => [
    savedExportLine('2', '23.14', '46.280000', '9.718800', '55.998800'),
    savedExportLine('1', '457.02', '457.020000', '95.980000', '553.000000'),
]];
verifyExportAmounts($nir1, ['net' => '122.32', 'vat' => '25.68', 'total' => '148.00'], 'NIR 1');
verifyExportAmounts($nir2, ['net' => '503.30', 'vat' => '105.70', 'total' => '609.00'], 'NIR 2');

// Document totals stay authoritative even when legacy rows have higher precision.
$legacy = $nir1;
unset($legacy['lines'][0]['line_vat_ron']);
checkExportAmount(shopNirExportLineAmounts($legacy['lines'][0])['vat'] === '13.88', 'Saved VAT is used without _ron fields');
$fallbackTotals = shopNirExportDocumentAmounts(['currency' => 'RON', 'lines' => $nir2['lines']]);
checkExportAmount($fallbackTotals === ['net' => '503.30', 'vat' => '105.70', 'total' => '609.00'], 'Fallback totals sum saved cents, not unrounded prices');

$eur = $nir1;
$eur['currency'] = 'EUR';
$eur['subtotal'] = '122.32'; $eur['vat_total'] = '25.68'; $eur['grand_total'] = '148.00';
$eur['grand_total_ron'] = '740.00';
foreach ($eur['lines'] as &$line) { $line['line_net_ron'] = '999.00'; $line['line_vat_ron'] = '999.00'; $line['line_total_ron'] = '1998.00'; }
unset($line);
verifyExportAmounts($eur, ['net' => '122.32', 'vat' => '25.68', 'total' => '148.00'], 'Foreign currency');

$discounted = savedExportLine('1.5', '100', '135', '28.34', '163.34');
$discounted['discount_percent'] = '10'; $discounted['received_quantity'] = '2';
checkExportAmount(shopNirExportLineAmounts($discounted) === ['unit_price' => '90.000000', 'net' => '135.00', 'vat' => '28.34', 'total' => '163.34'], 'Discount and rejected quantity must not override saved amounts');
$zero = savedExportLine('1', '100', '0', '0', '0');
checkExportAmount(shopNirExportLineAmounts($zero)['total'] === '0.00', 'Saved zero must not trigger price recalculation');
verifyExportAmounts(['currency' => 'RON', 'lines' => [$zero]], ['net' => '0.00', 'vat' => '0.00', 'total' => '0.00'], 'Zero saved amounts');
foreach ([['0','0,00'],['23.1','23,10'],['609','609,00'],['-100','-100,00'],['1234.5678','1.234,57']] as [$input,$expected]) {
    checkExportAmount(shopNirPdfMoneyValue($input) === $expected, 'Fixed money decimals: ' . $input);
}
checkExportAmount(shopNirPdfDecimal('2.0000',4) === '2' && shopNirPdfDecimal('1.2500',4) === '1,25', 'Quantities must remain compact');
$precise = savedExportLine('3', '1.234567', '3.70', '0.78', '4.48');
verifyExportAmounts(['currency' => 'RON', 'lines' => [$precise]], ['net' => '3.70', 'vat' => '0.78', 'total' => '4.48'], 'Precise price display preserves stored totals');
$negative = savedExportLine('-1', '100', '-100', '-20.99', '-120.99');
verifyExportAmounts(['currency' => 'RON', 'lines' => [$negative]], ['net' => '-100.00', 'vat' => '-20.99', 'total' => '-120.99'], 'Negative saved amounts');

echo "OK: $checks checks; PDF/XLSX preserve saved NIR amounts and do not recalculate VAT.\n";
