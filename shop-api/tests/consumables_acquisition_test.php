<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/consumables-service.php';
require_once dirname(__DIR__).'/nir-service.php';
function checkCost(bool $ok,string $label):void {if(!$ok)throw new RuntimeException($label);}
function cents($value):int{return shopNirDecimalToScaled($value,2);}
function costSnapshot(PDO $db):string{$data=[];foreach(['shop_consumable_documents','shop_consumables','shop_consumption_vouchers','shop_consumption_voucher_lines'] as $table)$data[$table]=$db->query('SELECT * FROM '.$table.' ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);return json_encode($data);}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
GtrotsConsumables::ensureSchema($db);
function sourceBody(array $config=[],array $lines=[]):array{return ['document'=>array_merge(['document_date'=>'2026-09-29','document_type'=>'factura','series'=>'TEST','document_number'=>'0001','valuation_mode'=>'acquisition','purchase_discount_type'=>'percent','purchase_discount_value'=>20],$config),'lines'=>$lines?:[['product_name'=>'Pungi','unit'=>'buc','quantity'=>100,'unit_price'=>1,'vat_rate'=>21]]];}
function issueBody(string $id,$quantity,string $number):array{return ['voucher_date'=>'2026-11-15','series'=>'BC','voucher_number'=>$number,'giver_name'=>'Gestionar test','receiver_name'=>'Primitor test','lines'=>[['consumable_id'=>$id,'quantity'=>$quantity]],'discount_value'=>0];}
$source=GtrotsConsumables::createDocument($db,sourceBody(),[]);$item=$source['lines'][0];
checkCost(cents($item['net_value'])===10000&&cents($item['vat_value'])===2100&&cents($item['purchase_discount_amount'])===2420&&cents($item['stock_cost_value'])===9680,'20% discount on document total, original VAT preserved');
$body=issueBody($item['id'],25,'1');$snapshot=costSnapshot($db);$preview=GtrotsConsumables::previewVoucher($db,$body,[]);
checkCost(str_starts_with(base64_decode($preview['content_base64']),'%PDF-')&&$snapshot===costSnapshot($db),'Preview must not change documents or reserve stock');
$first=GtrotsConsumables::createVoucher($db,$body,[]);
checkCost(cents($first['total'])===2420&&shopNirDecimalToScaled($first['lines'][0]['unit_price'],4)===9680&&cents($first['lines'][0]['source_discount_amount'])===605,'25 of 100 at net acquisition cost');
$remaining=GtrotsConsumables::get($db,$item['id']);checkCost((float)$remaining['remaining_quantity']===75.0&&cents($remaining['remaining_cost'])===7260,'Remaining stock value');
$bad=$body;$bad['voucher_number']='bad';$bad['discount_value']=1;$before=costSnapshot($db);
try{GtrotsConsumables::createVoucher($db,$bad,[]);throw new RuntimeException('Second discount accepted');}catch(InvalidArgumentException $e){}
checkCost($before===costSnapshot($db),'Second discount rollback');
// Editing an already consumed source requires an explicit revaluation flag.
$edit=sourceBody(['purchase_discount_value'=>50]);$edit['lines'][0]['id']=$item['id'];$edit['revision']=GtrotsConsumables::getDocument($db,$source['id'])['revision'];
try{GtrotsConsumables::updateDocument($db,$source['id'],$edit,[]);throw new RuntimeException('Unconfirmed revaluation accepted');}catch(ShopNirHttpException $e){checkCost($e->status===409,'Revaluation conflict');}
checkCost($before===costSnapshot($db),'Unconfirmed source update rolls back');
$edit['revalue_existing_vouchers']=true;$source=GtrotsConsumables::updateDocument($db,$source['id'],$edit,[]);
checkCost(cents(GtrotsConsumables::getVoucher($db,$first['id'])['total'])===1513,'Confirmed historical issue revaluation');
$second=GtrotsConsumables::createVoucher($db,issueBody($item['id'],75,'2'),[]);
checkCost(cents($second['total'])===4537&&cents(GtrotsConsumables::get($db,$item['id'])['remaining_cost'])===0,'Full consumption reconciles');
GtrotsConsumables::deleteVoucher($db,$second['id'],['revision'=>$second['revision']]);
checkCost(cents(GtrotsConsumables::get($db,$item['id'])['remaining_cost'])===4537,'Delete returns actual cost as well as quantity');
// The photographed amounts: full discount, original net and VAT unchanged, final total zero.
$photo=sourceBody(['purchase_discount_type'=>'fixed','purchase_discount_value'=>'20.57'],[['product_name'=>'Produs factura','quantity'=>1,'unit_price'=>17,'vat_rate'=>21,'vat_value'=>'3.57']]);
$paid=GtrotsConsumables::createDocument($db,$photo,[])['lines'][0];
checkCost(cents($paid['net_value'])===1700&&cents($paid['vat_value'])===357&&cents($paid['purchase_discount_amount'])===2057&&cents($paid['total_value'])===0&&cents($paid['stock_cost_value'])===0,'Full fixed discount');
$full=sourceBody(['purchase_discount_value'=>100]);$free=GtrotsConsumables::createDocument($db,$full,[])['lines'][0];
checkCost(cents($free['total_value'])===0&&cents($free['stock_cost_value'])===0,'Full percentage discount');
$freeIssue=GtrotsConsumables::createVoucher($db,issueBody($free['id'],20,'3'),[]);checkCost(cents($freeIssue['total'])===0&&cents($freeIssue['lines'][0]['unit_price'])===0&&cents($freeIssue['lines'][0]['source_discount_amount'])===2420,'Full discount partial issue');
// Fixed document discount, mixed VAT and manual VAT; allocation once in cents.
$mixed=GtrotsConsumables::createDocument($db,sourceBody(['purchase_discount_type'=>'fixed','purchase_discount_value'=>1],[['product_name'=>'A','quantity'=>3,'unit_price'=>'3.3333','vat_rate'=>21],['product_name'=>'B','quantity'=>7,'unit_price'=>2,'vat_rate'=>11,'vat_value'=>'1.11']]),[]);
checkCost(array_sum(array_map(fn($r)=>cents($r['purchase_discount_amount']),$mixed['lines']))===100,'Fixed discount allocation');
checkCost(cents($mixed['lines'][1]['vat_value'])===111,'Manual VAT preserved');
// Exhaust awkward fractional stocks in pieces: all cents must reconcile, even after editing/deletion.
mt_srand(21);
for($i=0;$i<40;$i++){
    $qty=mt_rand(3,100);$src=GtrotsConsumables::createDocument($db,sourceBody(['purchase_discount_value'=>mt_rand(0,99)],[['product_name'=>'Fraction '.$i,'quantity'=>$qty,'unit_price'=>mt_rand(1,99999)/10000,'vat_rate'=>21]]),[])['lines'][0];
    $a=GtrotsConsumables::createVoucher($db,issueBody($src['id'],$qty/3,'f'.$i.'a'),[]);
    $b=GtrotsConsumables::createVoucher($db,issueBody($src['id'],$qty-(float)$a['lines'][0]['quantity'],'f'.$i.'b'),[]);
    checkCost(cents($a['total'])+cents($b['total'])===cents($src['stock_cost_value']),'Fractional total '.$i);
    checkCost(cents($a['lines'][0]['source_discount_amount'])+cents($b['lines'][0]['source_discount_amount'])===cents($src['purchase_discount_amount']),'Source discount reconciliation '.$i);
    GtrotsConsumables::deleteVoucher($db,$a['id'],['revision'=>$a['revision']]);
    $rest=GtrotsConsumables::get($db,$src['id']);$c=GtrotsConsumables::createVoucher($db,issueBody($src['id'],$rest['remaining_quantity'],'f'.$i.'c'),[]);
    checkCost(cents($b['total'])+cents($c['total'])===cents($src['stock_cost_value']),'Deletion/reissue total '.$i);
}
// Invalid discounts must leave every saved document and issue untouched.
foreach([['percent','100.01'],['percent','-1'],['fixed','121.01'],['fixed','-1']] as [$type,$amount]){
    $before=costSnapshot($db);try{GtrotsConsumables::createDocument($db,sourceBody(['purchase_discount_type'=>$type,'purchase_discount_value'=>$amount]),[]);throw new RuntimeException('Invalid source discount accepted');}catch(InvalidArgumentException $e){}
    checkCost($before===costSnapshot($db),'Invalid source discount rolls back');
}
// Additive schema must never reclassify records or revalue saved amounts.
$snapshot=costSnapshot($db);GtrotsConsumables::ensureSchema($db);checkCost(costSnapshot($db)===$snapshot,'Idempotent additive migration');
$export=GtrotsConsumables::export($db,['from'=>'2026-09-01','to'=>'2026-11-30'],'xlsx');
$tmp=tempnam(sys_get_temp_dir(),'cost-xlsx');file_put_contents($tmp,base64_decode($export['content_base64']));$zip=new ZipArchive();$zip->open($tmp);$xml=$zip->getFromName('xl/worksheets/sheet1.xml');$zip->close();unlink($tmp);
checkCost(str_contains($xml,'Discount')&&!str_contains($xml,'EVALUAREA COSTULUI')&&str_contains($xml,'r="O6"'),'XLSX acquisition reconciliation');
$single=GtrotsConsumables::exportVoucher($db,$freeIssue['id'],'xlsx');$tmp=tempnam(sys_get_temp_dir(),'issue-xlsx');file_put_contents($tmp,base64_decode($single['content_base64']));$zip=new ZipArchive();$zip->open($tmp);$singleXml=simplexml_load_string($zip->getFromName('xl/worksheets/sheet1.xml'));$zip->close();unlink($tmp);$singleXml->registerXPathNamespace('s','http://schemas.openxmlformats.org/spreadsheetml/2006/main');
checkCost(cents((string)$singleXml->xpath('//s:c[@r="H10"]/s:v')[0])===2420&&cents((string)$singleXml->xpath('//s:c[@r="I10"]/s:v')[0])===0,'Individual XLSX source discount included once');
require_once dirname(__DIR__).'/consumables-export.php';
$voucherHtml=GtrotsConsumablesExport::voucherHtml($freeIssue);checkCost(str_contains($voucherHtml,'0,00')&&str_contains($voucherHtml,'Discount'),'Individual PDF uses acquisition value');
echo "consumables_acquisition_test: ok (purchase reductions, fixed/percent/100%, VAT, partial/full issues, revaluation consent, 40 fractional cases, deletion, preview, exports)\n";
