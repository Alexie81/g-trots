<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/consumables-service.php';
require_once dirname(__DIR__).'/nir-service.php';

function expectDiscount(bool $ok,string $message): void { if(!$ok)throw new RuntimeException($message); }
function snapshotConsumables(PDO $db): string {
    $data=[];
    foreach(['shop_consumable_documents','shop_consumables','shop_consumption_vouchers','shop_consumption_voucher_lines'] as $table)$data[$table]=$db->query('SELECT * FROM '.$table.' ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    return json_encode($data,JSON_THROW_ON_ERROR);
}
function xlsxSheet(string $base64,int $sheet=1): SimpleXMLElement {
    $path=tempnam(sys_get_temp_dir(),'discount-xlsx');file_put_contents($path,base64_decode($base64,true));
    $zip=new ZipArchive();expectDiscount($zip->open($path)===true,'Invalid XLSX');
    $xml=simplexml_load_string($zip->getFromName('xl/worksheets/sheet'.$sheet.'.xml'));$zip->close();unlink($path);
    expectDiscount($xml!==false,'Invalid worksheet XML');$xml->registerXPathNamespace('s','http://schemas.openxmlformats.org/spreadsheetml/2006/main');return $xml;
}
function moneyCell(SimpleXMLElement $xml,string $cell): int { return shopNirDecimalToScaled((string)($xml->xpath('//s:c[@r="'.$cell.'"]/s:v')[0]??''),2); }

$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
GtrotsConsumables::ensureSchema($db);
$document=GtrotsConsumables::createDocument($db,[
    'document'=>['document_date'=>'2026-09-28','document_type'=>'factura','series'=>'KOT','document_number'=>'65577'],
    'lines'=>[
        ['product_name'=>'Lavete atelier','quantity'=>20,'unit'=>'buc','unit_price'=>'10.005','vat_rate'=>21],
        ['product_name'=>'Spray contacte','quantity'=>20,'unit'=>'buc','unit_price'=>'20.125','vat_rate'=>21],
        ['product_name'=>'Material gratuit','quantity'=>20,'unit'=>'buc','unit_price'=>0,'vat_rate'=>0],
    ],
],[]);
$ids=array_column($document['lines'],'id');
$body=['voucher_date'=>'2026-11-15','series'=>'BC','voucher_number'=>'1','giver_name'=>'Gestionar demo','receiver_name'=>'Primitor demo','discount_type'=>'fixed','discount_value'=>'1','lines'=>[
    ['consumable_id'=>$ids[0],'quantity'=>'1.5'],['consumable_id'=>$ids[1],'quantity'=>1],['consumable_id'=>$ids[2],'quantity'=>1],
]];
$before=snapshotConsumables($db);
$preview=GtrotsConsumables::previewVoucher($db,$body,[]);
expectDiscount(str_starts_with(base64_decode($preview['content_base64'],true),'%PDF-'),'Preview PDF missing');
expectDiscount($preview['file_name']==='Bon-de-consum-BC-1 - fact. KOT_65577 din 28.09.2026.pdf','Source filename');
expectDiscount($before===snapshotConsumables($db) && GtrotsConsumables::voucherMeta($db,'BC')['next_number']==='1','Preview must not write or reserve a number');
$voucher=GtrotsConsumables::createVoucher($db,$body,[]);
expectDiscount($voucher['subtotal']==='35.14' && $voucher['discount_amount']==='1.00' && $voucher['total']==='34.14','Half-cent rounding and fixed discount');
expectDiscount(array_map(fn($l)=>shopNirDecimalToScaled($l['discount_amount'],2),$voucher['lines'])===[43,57,0],'Proportional cent allocation');
expectDiscount((float)GtrotsConsumables::get($db,$ids[0])['remaining_quantity']===18.5,'Discount must not change stock quantity');
GtrotsConsumables::ensureSchema($db);expectDiscount(GtrotsConsumables::getVoucher($db,$voucher['id'])===$voucher,'Migration must preserve existing vouchers');

$before=snapshotConsumables($db);
$changed=$body;$changed['discount_type']='percent';$changed['discount_value']='12.5';$changed['revision']=$voucher['revision'];$changed['voucher_id']=$voucher['id'];
GtrotsConsumables::previewVoucher($db,$changed,[]);
expectDiscount($before===snapshotConsumables($db),'Editing preview must leave original voucher and stock untouched');
$voucher=GtrotsConsumables::updateVoucher($db,$voucher['id'],$changed,[]);
expectDiscount($voucher['discount_amount']==='4.39' && $voucher['total']==='30.75','Percentage must round once on whole voucher');
expectDiscount((float)GtrotsConsumables::get($db,$ids[0])['remaining_quantity']===18.5,'Discount edit must not consume stock again');

foreach([['fixed','-1'],['fixed','35.15'],['percent','100.01'],['percent','-1'],['invalid','1']] as [$type,$value]){
    $attempt=$changed;$attempt['discount_type']=$type;$attempt['discount_value']=$value;$attempt['revision']=$voucher['revision'];
    $before=snapshotConsumables($db);$rejected=false;
    try{GtrotsConsumables::updateVoucher($db,$voucher['id'],$attempt,[]);}catch(InvalidArgumentException $e){$rejected=true;}
    expectDiscount($rejected && snapshotConsumables($db)===$before,'Invalid discount must roll back all changes: '.$type.' '.$value);
}
$stale=$changed;$stale['revision']='outdated';$rejected=false;
try{GtrotsConsumables::updateVoucher($db,$voucher['id'],$stale,[]);}catch(ShopNirHttpException $e){$rejected=$e->status===409;}
expectDiscount($rejected,'Concurrent edit must not overwrite saved discount');
$legacy=$body;unset($legacy['discount_type'],$legacy['discount_value']);$legacy['revision']=$voucher['revision'];
$voucher=GtrotsConsumables::updateVoucher($db,$voucher['id'],$legacy,[]);
expectDiscount($voucher['discount_type']==='percent' && $voucher['total']==='30.75','Older clients must preserve omitted discounts');

$single=GtrotsConsumables::exportVoucher($db,$voucher['id'],'xlsx');$xml=xlsxSheet($single['content_base64']);
expectDiscount(moneyCell($xml,'I10')===1313 && moneyCell($xml,'I11')===1762 && moneyCell($xml,'I16')===3514 && moneyCell($xml,'I17')===-439 && moneyCell($xml,'I18')===3075,'Individual XLSX net lines, subtotal, discount and total');
$registry=GtrotsConsumables::export($db,[],'xlsx');$xml=xlsxSheet($registry['content_base64'],2);
expectDiscount(moneyCell($xml,'I10')===439 && moneyCell($xml,'K10')===3075,'Registry must total allocated discounts and net values');
expectDiscount((string)($xml->xpath('//s:c[@r="M7"]/s:is/s:t')[0]??'')==='28.09.2026','Registry must preserve source document date');
require_once dirname(__DIR__).'/consumables-export.php';
$html=GtrotsConsumablesExport::voucherHtml($voucher);
expectDiscount(str_contains($html,'35,14 lei') && str_contains($html,'4,39 lei') && str_contains($html,'30,75 lei') && str_contains($html,'12,5%'),'PDF values and percentage label');

// Zero and full discount, including free materials.
foreach([['percent','100','0.00'],['percent','0','35.14'],['fixed','35.14','0.00'],['fixed','0','35.14']] as [$type,$value,$expected]){
    $update=$body;$update['discount_type']=$type;$update['discount_value']=$value;$update['revision']=$voucher['revision'];
    $voucher=GtrotsConsumables::updateVoucher($db,$voucher['id'],$update,[]);
    expectDiscount($voucher['total']===$expected,'Discount boundary '.$type.' '.$value);
    $sum=0;foreach($voucher['lines'] as $line){expectDiscount(shopNirDecimalToScaled($line['value'],2)>=0,'No negative line values');$sum+=shopNirDecimalToScaled($line['value'],2);}
    expectDiscount($sum===shopNirDecimalToScaled($voucher['total'],2),'Allocated line values must equal voucher total');
}
// Many awkward fractions: each line allocation must reconcile to the last cent.
mt_srand(74);
for($i=0;$i<60;$i++){
    $update=$body;$update['discount_type']='percent';$update['discount_value']=(string)(mt_rand(0,1000000)/10000);$update['revision']=$voucher['revision'];
    $update['lines'][0]['quantity']=(string)(mt_rand(1,190000)/10000);$update['lines'][1]['quantity']=(string)(mt_rand(1,190000)/10000);
    $voucher=GtrotsConsumables::updateVoucher($db,$voucher['id'],$update,[]);
    $gross=0;$reduction=0;$net=0;foreach($voucher['lines'] as $line){$g=shopNirDecimalToScaled($line['gross_value'],2);$d=shopNirDecimalToScaled($line['discount_amount'],2);$n=shopNirDecimalToScaled($line['value'],2);expectDiscount($g-$d===$n && $d>=0 && $n>=0,'Invalid line allocation');$gross+=$g;$reduction+=$d;$net+=$n;}
    expectDiscount($gross-$reduction===$net && $reduction===shopNirDivideRounded($gross*shopNirDecimalToScaled($update['discount_value'],4),1000000),'Whole voucher percentage rounding mismatch');
}
GtrotsConsumables::deleteVoucher($db,$voucher['id'],['revision'=>$voucher['revision']]);
expectDiscount((float)GtrotsConsumables::get($db,$ids[0])['remaining_quantity']===20.0,'Deleting discounted voucher restores quantity');

// Multiple sources and number-only source documents in download filenames.
$source2=GtrotsConsumables::createDocument($db,['document'=>['document_date'=>'2026-10-01','document_type'=>'bon','series'=>'','document_number'=>'0042'], 'lines'=>[['product_name'=>'Material sursă 2','quantity'=>10,'unit_price'=>1,'vat_rate'=>0]]],[]);
$multi=$body;$multi['lines']=[['consumable_id'=>$ids[0],'quantity'=>1],['consumable_id'=>$source2['lines'][0]['id'],'quantity'=>1]];
expectDiscount(str_contains(GtrotsConsumables::previewVoucher($db,$multi,[])['file_name'],'KOT_65577 din 28.09.2026 + 1 doc.pdf'),'Multiple source filename');
$multi['lines']=[$multi['lines'][1]];
expectDiscount(str_contains(GtrotsConsumables::previewVoucher($db,$multi,[])['file_name'],'bon 0042 din 01.10.2026.pdf'),'Number-only source must retain leading zeros');
$multi['series']='B/C\\X';$multi['voucher_number']='1:*?';
expectDiscount(!preg_match('~[\\\\/:*?]~',GtrotsConsumables::previewVoucher($db,$multi,[])['file_name']),'Unsafe filename characters');

echo "consumables_discount_test: ok (preview no writes, stock, fixed/percent, allocation, 60 fractional cases, exports, migration, legacy edit, filenames)\n";
