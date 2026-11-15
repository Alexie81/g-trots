<?php
declare(strict_types=1);

// Reuse the documented stock fixture and its existing archive/traceability checks.
require __DIR__ . '/inventory_export_test.php';

$db->exec('PRAGMA query_only=OFF');
$db->exec("UPDATE shop_products SET accounting_stock_quantity=777, stock_quantity=888 WHERE id='p1';
INSERT INTO shop_nir_documents (id,nir_number,reception_date) VALUES ('n-before','NIR-8','2026-08-31'),('n-first','NIR-10','2026-09-01');
INSERT INTO shop_invoices VALUES ('i-last','GT','008','2026-09-30'),('i-after','GT','009','2026-10-01');
INSERT INTO shop_inventory_movements VALUES
('before','p1','w1',NULL,'n-before',NULL,'NIR_IN',3,3,3,3,65,195,NULL,NULL,'allocated',0,'Opening stock','Test','2026-08-31 23:59:59'),
('first','p1','w1',NULL,'n-first',NULL,'NIR_IN',1,4,1,4,65,65,NULL,NULL,'allocated',0,'First second','Test','2026-09-01 00:00:00'),
('last','p1','w1','o1',NULL,'i-last','SALE_OUT',-2,14,-2,14,65,130,129,258,'allocated',0,'Last second','Test','2026-09-30 23:59:59'),
('after','p1','w1','o1',NULL,'i-after','SALE_OUT',-5,9,-5,9,65,325,129,645,'allocated',0,'October sale','Test','2026-10-01 00:00:00'),
('manual','p1','w1',NULL,NULL,NULL,'MANUAL_ADJUSTMENT',100,109,100,109,65,6500,NULL,NULL,'allocated',0,'Manual adjustment','Test','2026-09-20 12:00:00');");
$db->exec('PRAGMA query_only=ON');

function inventoryPeriodXml(ZipArchive $zip, string $part): DOMXPath {
    $doc = new DOMDocument();
    inventoryExportAssert($doc->loadXML($zip->getFromName($part)), 'Invalid XML: ' . $part);
    $xpath = new DOMXPath($doc);
    $xpath->registerNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
    return $xpath;
}

foreach ([['2026-09-01','2026-09-30',3,21,10,14], ['','',0,24,15,9]] as [$from,$to,$opening,$entries,$exits,$closing]) {
    $export = GtrotsInventoryExport::download($db, ['from'=>$from,'to'=>$to]);
    $exportBytes = base64_decode($export['content_base64'], true);
    $tmp = tempnam(sys_get_temp_dir(), 'gt-stock-period-');
    file_put_contents($tmp, $exportBytes);
    $archive = new ZipArchive();
    inventoryExportAssert($archive->open($tmp) === true, 'Cannot open period workbook.');
    try {
        $summary = inventoryPeriodXml($archive, 'xl/worksheets/sheet1.xml');
        $stock = inventoryPeriodXml($archive, 'xl/worksheets/sheet2.xml');
        inventoryExportAssert($summary->query('//s:pane')->length === 0, 'Summary must scroll freely, without any frozen or split pane.');
        inventoryExportAssert($stock->query('//s:pane[@state="frozen"]')->length === 1, 'Other sheets must retain their table header freeze.');
        inventoryExportAssert($stock->evaluate('string(//s:autoFilter/@ref)') === 'A4:O5', 'Filter must follow the reduced column count.');
        inventoryExportAssert($stock->query('//s:row[@r="4"]/s:c')->length === 15, 'Unexpected stock header width.');
        foreach (['E5'=>$opening,'F5'=>$entries,'G5'=>$exits,'H5'=>$closing,'J5'=>$opening*65,'K5'=>$entries*65,'L5'=>$exits*65,'M5'=>$closing*65] as $cell=>$expected) {
            $actual = (float)$stock->evaluate('string(//s:c[@r="'.$cell.'"]/s:v)');
            inventoryExportAssert(abs($actual-$expected)<0.00001, $cell.' must use documented movements within the requested period.');
        }
        foreach (['G12','G17'] as $cell) {
            inventoryExportAssert((float)$summary->evaluate('string(//s:c[@r="'.$cell.'"]/s:v)') === (float)$closing, 'Summary must show the same closing stock as the product sheet.');
        }
        for ($sheet=1;$sheet<=6;$sheet++) {
            $xml = $archive->getFromName('xl/worksheets/sheet'.$sheet.'.xml');
            inventoryExportAssert(!str_contains($xml,'Stoc contabil actual') && !str_contains($xml,'<v>777</v>'), 'Live accounting stock must not leak into any export sheet.');
            inventoryExportAssert((new DOMDocument())->loadXML($xml), 'Invalid worksheet after removing the column.');
        }
    } finally { $archive->close(); unlink($tmp); }
    if ($from !== '' && !empty($argv[1])) file_put_contents($argv[1], $exportBytes);
}
echo "Inventory period tests passed: boundaries, opening/closing stock, later movements excluded, current accounting stock removed, summary unfrozen.\n";
