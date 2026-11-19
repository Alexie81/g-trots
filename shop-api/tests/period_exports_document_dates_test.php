<?php
declare(strict_types=1);

// The existing invoice suite checks the XLSX and complete PDF/XLSX/XML archive.
require __DIR__ . '/invoice_export_test.php';
$db->exec('PRAGMA query_only=OFF');
$db->exec("ALTER TABLE shop_invoices ADD COLUMN created_at TEXT;
ALTER TABLE shop_invoices ADD COLUMN updated_at TEXT;
UPDATE shop_invoices SET issued_at='2026-11-15 10:00:00',created_at='2026-11-15 10:00:00',updated_at='2026-12-20 15:00:00'");
$db->exec('PRAGMA query_only=ON');
foreach ([false,true] as $complete) {
    $file=GtrotsInvoiceExport::download($db,['from'=>'2026-09-01','to'=>'2026-09-05','include_documents'=>$complete]);
    registryAssert($file['item_count']===2,'Invoice registry and archive must use issue_date after late entry or editing.');
}

require_once dirname(__DIR__) . '/nir-bundle.php';
$nirDb=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$nirDb->exec("CREATE TABLE shop_nir_documents (id TEXT,nir_number TEXT,temporary_number TEXT,reversal_of_id TEXT,source_type TEXT,status TEXT,supplier_id TEXT,warehouse_id TEXT,reception_date TEXT,reception_time TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE shop_suppliers (id TEXT,name TEXT,cui TEXT);
CREATE TABLE shop_warehouses (id TEXT,name TEXT);
CREATE TABLE shop_nir_lines (nir_document_id TEXT,invoiced_quantity REAL,received_quantity REAL,accepted_quantity REAL,rejected_quantity REAL);
CREATE TABLE shop_nir_attachments (nir_document_id TEXT,file_size INTEGER);");
$nirInsert=$nirDb->prepare('INSERT INTO shop_nir_documents VALUES (?,?,NULL,NULL,\'manual\',\'confirmed\',NULL,NULL,?,\'10:00:00\',\'2026-11-15 10:00:00\',\'2026-12-20 15:00:00\')');
foreach (['1'=>'2026-09-21','2'=>'2026-09-24','3'=>'2026-09-25','4'=>'2026-09-30','5'=>'2026-10-01'] as $id=>$date) {
    $nirInsert->execute([$id,'NIR-'.$id,$date]);
    $nirDb->prepare('INSERT INTO shop_nir_lines VALUES (?,2,2,2,0)')->execute([$id]);
    $nirDb->prepare('INSERT INTO shop_nir_attachments VALUES (?,100)')->execute([$id]);
}
$nirDb->exec('PRAGMA query_only=ON');
$rows=shopNirRegistryRows($nirDb,'2026-09-01','2026-09-30');
registryAssert(array_column($rows,'id')===['1','2','3','4'],'NIR period selection must use reception dates for every document in registry and ZIP.');
foreach ([false,true] as $complete) {
    $estimate=shopNirExportEstimate($nirDb,'2026-09-01','2026-09-30',$complete);
    registryAssert($estimate['document_count']===4 && $estimate['line_count']===4 && $estimate['attachment_count']===4,'NIR estimate must include late-entered documents and attachments.');
}
registryAssert(shopNirRegistryDateRange($nirDb,'','')===['2026-09-21','2026-10-01'],'All-period bounds must come from reception dates.');

$nirPdf=shopNirDownloadRegistryBundle($nirDb,'2026-09-01','2026-09-30',false,[],'pdf');
registryAssert($nirPdf['document_count']===4 && $nirPdf['mime_type']==='application/pdf' && str_starts_with(base64_decode($nirPdf['content_base64']),'%PDF-'),'Standalone NIR PDF includes all four documents by reception date.');
require_once dirname(__DIR__) . '/consumables-service.php';
$consDb=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
GtrotsConsumables::ensureSchema($consDb);
$items=[];
foreach (['OLD'=>'2026-08-20','SEP'=>'2026-09-25','OCT'=>'2026-10-01'] as $number=>$date) {
    $document=GtrotsConsumables::createDocument($consDb,[
        'document'=>['document_date'=>$date,'document_type'=>'factura','series'=>'TEST','document_number'=>$number],
        'lines'=>[['product_name'=>'Consumabil '.$number,'unit'=>'buc','quantity'=>10,'unit_price'=>10,'vat_rate'=>0]],
    ],[]);
    $items[$number]=$document['lines'][0]['id'];
}
foreach ([['1','2026-08-25','OLD',2],['2','2026-09-01','OLD',3],['3','2026-09-30','SEP',2],['4','2026-10-01','SEP',4]] as [$number,$date,$item,$quantity]) {
    GtrotsConsumables::createVoucher($consDb,[
        'voucher_date'=>$date,'series'=>'BC','voucher_number'=>$number,'giver_name'=>'Test','receiver_name'=>'Test',
        'lines'=>[['consumable_id'=>$items[$item],'quantity'=>$quantity]],
    ],[]);
}
foreach (['shop_consumable_documents','shop_consumables','shop_consumption_vouchers'] as $table) {
    $consDb->exec("UPDATE $table SET created_at='2026-11-15 10:00:00',updated_at='2026-12-20 15:00:00'");
}
$consDb->exec('PRAGMA query_only=ON');
$method=new ReflectionMethod(GtrotsConsumables::class,'exportData');$method->setAccessible(true);
$data=$method->invoke(null,$consDb,['from'=>'2026-09-01','to'=>'2026-09-30']);
registryAssert(array_column($data['vouchers'],'voucher_number')===['2','3'],'Consumption vouchers must follow voucher_date and include both period boundaries.');
$stock=array_column($data['stock'],null,'document_number');
registryAssert(count($stock)===2 && !isset($stock['OCT']),'Future input document must be excluded regardless of save date.');
registryAssert((float)$stock['OLD']['remaining_quantity']===5.0 && (float)$stock['SEP']['remaining_quantity']===8.0,'Closing consumable stock must include previous consumption but exclude consumption after period end.');
foreach (['pdf','xlsx','zip'] as $format) {
    $file=GtrotsConsumables::export($consDb,['from'=>'2026-09-01','to'=>'2026-09-30'],$format);
    $bytes=base64_decode($file['content_base64'],true);
    registryAssert(str_starts_with($bytes,$format==='pdf'?'%PDF':'PK'),"Invalid $format export for document-date selection.");
}
echo "Period export tests passed: invoices and ZIP, NIR registry/estimate/attachments, consumables PDF/XLSX/ZIP and voucher closing balances ignore late creation/modification dates.\n";
