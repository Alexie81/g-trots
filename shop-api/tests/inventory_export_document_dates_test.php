<?php
declare(strict_types=1);

require __DIR__ . '/inventory_export_test.php';
$db->exec('PRAGMA query_only=OFF');
foreach (['shop_inventory_movements','shop_nir_documents','shop_invoices','shop_products'] as $table) $db->exec('DELETE FROM ' . $table);
$db->exec("INSERT INTO shop_products VALUES
('cubis','Plăcuțe test','SE-CMM123','tracked',40,999,1),
('four','Produs NIR 4','NIR4','tracked',4,999,1),
('opening','Sold anterior','OPEN','tracked',5,999,1),
('legacy','Document fără dată','OLD','tracked',2,999,1),
('future','Recepție viitoare','FUTURE','tracked',8,999,1);
INSERT INTO shop_nir_documents (id,nir_number,reception_date,supplier_id) VALUES
('n3','NIR-2026-000003','2026-09-25','s1'),('n4','NIR-2026-000004','2026-09-30','s1'),
('n-opening','NIR-1','2026-08-31','s1'),('n-legacy','NIR-2','','s1'),
('n-return','NIR-5','2026-10-10','s1'),('n-reversal','NIR-6','2026-10-20','s1'),
('n-future','NIR-7','2026-11-05','s1');
INSERT INTO shop_invoices VALUES
('sale3','GT','003','2026-09-22'),('sale-opening','GT','001','2026-09-01'),('sale-legacy','GT','002','0000-00-00');");
$insert=$db->prepare('INSERT INTO shop_inventory_movements (id,product_id,warehouse_id,nir_document_id,sales_invoice_id,movement_type,accounting_quantity_delta,quantity_delta,inventory_unit_cost_ron,inventory_cost_total_ron,created_at) VALUES (?,?,\'w1\',?,?,?,?,?,10,?,?)');
foreach ([
    ['sale','cubis',null,'sale3','sale',-2,'2026-09-22 21:12:47'],
    ['receipt3','cubis','n3',null,'NIR_IN',2,'2026-10-15 12:36:05'],
    ['receipt4','four','n4',null,'NIR_IN',4,'2026-10-15 12:45:00'],
    ['opening','opening','n-opening',null,'NIR_IN',6,'2026-10-20 09:00:00'],
    ['sale-opening','opening',null,'sale-opening','SALE_OUT',-1,'2026-10-20 10:00:00'],
    ['legacy-in','legacy','n-legacy',null,'NIR_IN',3,'2026-09-03 09:00:00'],
    ['legacy-out','legacy',null,'sale-legacy','SALE_OUT',-1,'2026-09-04 10:00:00'],
    ['return','cubis','n-return','sale3','RETURN_IN',1,'2026-10-15 13:00:00'],
    ['reversal','four','n-reversal',null,'NIR_REVERSAL',-1,'2026-11-01 09:00:00'],
    ['future','future','n-future',null,'NIR_IN',8,'2026-09-26 09:00:00'],
] as [$id,$product,$nir,$invoice,$type,$delta,$created]) {
    $insert->execute([$id,$product,$nir,$invoice,$type,$delta,$delta,abs($delta)*10,$created]);
}
$db->exec('PRAGMA query_only=ON');
$method=new ReflectionMethod(GtrotsInventoryExport::class,'snapshot');
$method->setAccessible(true);
$september=$method->invoke(null,$db,'2026-09-01','2026-09-30');
$products=array_column($september['products'],null,'id');
inventoryExportAssert(count($products)===4 && !isset($products['future']), 'Future-dated receipts must not be included just because they were entered earlier.');
foreach (['cubis'=>[0,2,2,0],'four'=>[0,4,0,4],'opening'=>[6,0,1,5],'legacy'=>[0,3,1,2]] as $id=>$values) {
    foreach (array_combine(['opening_quantity','entry_quantity','exit_quantity','closing_quantity'],$values) as $field=>$expected) {
        inventoryExportAssert((float)$products[$id][$field]===(float)$expected,"Wrong $field for $id");
    }
}
$movements=array_column($september['movements'],null,'id');
inventoryExportAssert(array_keys($movements)===['sale-opening','legacy-in','legacy-out','sale','receipt3','receipt4'], 'Rows must follow document dates, not insertion dates.');
inventoryExportAssert($movements['sale']['export_documented_quantity_after']===-2.0 && $movements['receipt3']['export_documented_quantity_after']===0.0, 'Do not hide the temporary negative balance before the actual receipt date.');
inventoryExportAssert($movements['receipt3']['export_date']==='2026-09-25' && $movements['receipt4']['export_date']==='2026-09-30', 'NIR 3 and 4 must carry their September receipt dates.');
$estimate=GtrotsInventoryExport::estimate($db,['from'=>'2026-09-01','to'=>'2026-09-30']);
inventoryExportAssert($estimate['product_count']===4 && $estimate['movement_count']===6 && $estimate['document_count']===6, 'Estimate must use the same document dates as the export.');
$october=$method->invoke(null,$db,'2026-10-01','2026-10-31');
inventoryExportAssert(array_column($october['movements'],'id')===['return','reversal'], 'Receipts saved in October must not be repeated; returns use their own NIR date.');
$octProducts=array_column($october['products'],null,'id');
inventoryExportAssert($octProducts['cubis']['opening_quantity']===0.0 && $octProducts['cubis']['closing_quantity']===1.0 && $octProducts['four']['closing_quantity']===3.0, 'October opening and closing quantities must continue the September balance.');
$beforeReceipt=$method->invoke(null,$db,'2026-09-01','2026-09-24');
inventoryExportAssert(array_column($beforeReceipt['products'],null,'id')['cubis']['closing_quantity']===-2.0, 'Receipt dated 25 September must not move back before that day.');

$tmp=tempnam(sys_get_temp_dir(),'stock-dates-');
file_put_contents($tmp,GtrotsInventoryExport::render($september));
$archive=new ZipArchive();inventoryExportAssert($archive->open($tmp)===true,'Workbook must open.');
try {
    foreach ([3=>['D','B'],4=>['F','C'],5=>['D','E']] as $sheet=>[$numberColumn,$dateColumn]) {
        $xml=new DOMDocument();inventoryExportAssert($xml->loadXML($archive->getFromName("xl/worksheets/sheet$sheet.xml")),'Invalid worksheet.');
        $xpath=new DOMXPath($xml);$xpath->registerNamespace('s','http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        foreach (['NIR-2026-000003'=>'2026-09-25','NIR-2026-000004'=>'2026-09-30'] as $number=>$date) {
            $cells=$xpath->query('//s:c[starts-with(@r,"'.$numberColumn.'") and s:is/s:t="'.$number.'"]');
            inventoryExportAssert($cells->length===1,"$number missing or duplicated in sheet $sheet");
            $row=$cells->item(0)->parentNode;
            $actual=(float)$xpath->evaluate('string(s:c[@r="'.$dateColumn.$row->getAttribute('r').'"]/s:v)',$row);
            inventoryExportAssert($actual===(float)shopNirPremiumXlsxExcelDate($date),"Wrong date for $number in sheet $sheet");
        }
    }
} finally { $archive->close();unlink($tmp); }
echo "Document-date tests passed: delayed NIRs, delayed invoices, opening stock, month boundaries, returns, legacy fallback, estimate and warehouse-card/document dates.\n";
