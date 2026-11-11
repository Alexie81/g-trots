<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/nir-domain.php';
require_once dirname(__DIR__) . '/nir-service.php';
require_once dirname(__DIR__) . '/fixed-assets-service.php';
require_once dirname(__DIR__) . '/fixed-assets-export.php';
function checkEdit(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function rejectsEdit(callable $fn, string $message): void { try { $fn(); } catch (InvalidArgumentException|ShopNirHttpException $error) { return; } throw new RuntimeException($message); }
$db = new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
GtrotsFixedAssets::ensureSchema($db);
$user=['display_name'=>'Test'];
$file=static fn(string $name): array=>['file_name'=>$name,'mime_type'=>'application/pdf','content_base64'=>base64_encode('%PDF-1.4 sample '.$name)];
$payload=['document'=>['document_date'=>'2026-09-01','document_type'=>'factura','series'=>'TEST','document_number'=>'1'], 'lines'=>[
    ['product_name'=>'Stație diagnoză','quantity'=>10,'unit_price'=>3500,'vat_rate'=>21,'vat_value'=>7349.99],
    ['product_name'=>'Calculator','quantity'=>2,'unit_price'=>1000,'vat_rate'=>21],
], 'attachments'=>[$file('factura.pdf'),$file('garantie.pdf')]];
$doc=GtrotsFixedAssets::create($db,$payload,$user);
$first=$doc['lines'][0]['id']; $second=$doc['lines'][1]['id'];
checkEdit(count($doc['files'])===2,'Two files must persist at creation.');
checkEdit((float)$doc['lines'][0]['vat_value']===7349.99 && (int)$doc['lines'][0]['vat_manual']===1,'Manual VAT must persist on create.');
checkEdit((float)$doc['lines'][1]['vat_value']===420.0 && (int)$doc['lines'][1]['vat_manual']===0,'Automatic VAT must calculate on create.');
foreach ([[-2,'2026-09-15'],[-1,'2026-10-15'],[-3,'2026-11-05']] as [$qty,$date]) GtrotsFixedAssets::dispose($db,$first,['disposal_date'=>$date,'quantity'=>$qty,'reason'=>'Casare test'],$user);
$doc=GtrotsFixedAssets::getDocument($db,$doc['id']);
$edit=['revision'=>$doc['revision'],'document'=>$payload['document'],'lines'=>$doc['lines']];
$edit['lines'][0]['unit_price']=3600;
$edit['lines'][0]['vat_value']=7559.98;
$edit['lines'][1]['vat_value']=null;
$edit['lines'][1]['quantity']=3;
$edit['document']['notes']='Corectat';
$updated=GtrotsFixedAssets::updateDocument($db,$doc['id'],$edit,$user);
checkEdit(count($updated['lines'][0]['disposals'])===3 && (float)$updated['lines'][0]['remaining_quantity']===4.0,'Editing preserves disposal history and remaining quantity.');
checkEdit((float)$updated['lines'][0]['total_value']===43559.98 && (float)$updated['lines'][1]['vat_value']===630.0,'Manual and auto VAT totals must update independently.');
rejectsEdit(fn()=>GtrotsFixedAssets::updateDocument($db,$doc['id'],$edit,$user),'Stale saves must be rejected.');
$edit['revision']=$updated['revision'];$edit['lines'][0]['quantity']=5;
rejectsEdit(fn()=>GtrotsFixedAssets::updateDocument($db,$doc['id'],$edit,$user),'Quantity below already disposed must be rejected.');
checkEdit(GtrotsFixedAssets::getDocument($db,$doc['id'])['revision']===$updated['revision'],'Rejected transaction must roll back every document and line change.');
$edit['lines'][0]['quantity']=10;$edit['lines'][0]['vat_value']=null;
$auto=GtrotsFixedAssets::updateDocument($db,$doc['id'],$edit,$user);
checkEdit((float)$auto['lines'][0]['vat_value']===7560.0 && (int)$auto['lines'][0]['vat_manual']===0,'Resetting manual VAT must return to calculation.');
$asset=GtrotsFixedAssets::get($db,$first);$disposal=$asset['disposals'][0];
$changed=GtrotsFixedAssets::updateDisposal($db,$first,['revision'=>$asset['revision'],'disposal_id'=>$disposal['id'],'quantity'=>-2,'disposal_date'=>'2026-11-06','reason'=>'Motiv corectat']);
checkEdit((float)$changed['remaining_quantity']===5.0,'Editing disposal must recalculate remaining quantity.');
rejectsEdit(fn()=>GtrotsFixedAssets::updateDisposal($db,$first,['revision'=>$changed['revision'],'disposal_id'=>$disposal['id'],'quantity'=>-8,'disposal_date'=>'2026-11-06','reason'=>'Test']),'Disposal edit cannot exceed original quantity minus other disposals.');
rejectsEdit(fn()=>GtrotsFixedAssets::dispose($db,$first,['quantity'=>-0.000001,'disposal_date'=>'2026-11-06','reason'=>'Test'],$user),'Rounding to zero is not a disposal.');
$removed=GtrotsFixedAssets::deleteDisposal($db,$first,['revision'=>$changed['revision'],'disposal_id'=>$disposal['id']]);
checkEdit((float)$removed['remaining_quantity']===7.0 && count($removed['disposals'])===2,'Delete disposal must restore its quantity only.');
$more=GtrotsFixedAssets::addFiles($db,$doc['id'],['attachments'=>[$file('proces-verbal.pdf')]],$user);
checkEdit(count($more['files'])===3,'Files can be appended later.');
foreach ($more['files'] as $item) checkEdit(base64_decode(GtrotsFixedAssets::download($db,$doc['id'],$item['id'])['content_base64'])==='%PDF-1.4 sample '.$item['original_name'],'Each file must download independently.');
$deletedPath=dirname(__DIR__).'/'.$more['files'][1]['storage_name'];
$less=GtrotsFixedAssets::deleteFile($db,$doc['id'],['file_id'=>$more['files'][1]['id']]);
checkEdit(count($less['files'])===2 && !is_file($deletedPath),'Deleting a file removes its metadata and bytes.');
$rows=(new ReflectionMethod(GtrotsFixedAssets::class,'exportRows'))->invoke(null,$db,[]);
$totals=GtrotsFixedAssetExport::totals($rows);
checkEdit($totals['total']===47190.0,'Exports must total edited values once despite multiple disposals.');
$asset=GtrotsFixedAssets::get($db,$first);
GtrotsFixedAssets::deleteAsset($db,$first,['revision'=>$asset['revision'],'document_revision'=>GtrotsFixedAssets::getDocument($db,$doc['id'])['revision']]);
$remainingDoc=GtrotsFixedAssets::getDocument($db,$doc['id']);
checkEdit(count($remainingDoc['lines'])===1 && count($remainingDoc['files'])===2,'Deleting one product preserves siblings and shared files.');
checkEdit((int)$db->query('SELECT COUNT(*) FROM shop_fixed_asset_disposals')->fetchColumn()===0,'Deleting product removes its disposal records.');
$paths=array_column($remainingDoc['files'],'storage_name');
GtrotsFixedAssets::deleteDocument($db,$doc['id'],['revision'=>$remainingDoc['revision']]);
foreach (['shop_fixed_asset_documents','shop_fixed_assets','shop_fixed_asset_disposals','shop_fixed_asset_files'] as $table) checkEdit((int)$db->query('SELECT COUNT(*) FROM '.$table)->fetchColumn()===0,'Document delete must leave no orphan rows.');
foreach ($paths as $path) checkEdit(!is_file(dirname(__DIR__).'/'.$path),'Document deletion removes file bytes.');
// Legacy documents migrate without loss or resurrecting a deleted attachment.
$legacy=GtrotsFixedAssets::create($db,['document'=>$payload['document'],'lines'=>[$payload['lines'][1]],'attachment'=>$file('legacy.pdf')],$user);
$old=$legacy['files'][0];
$db->prepare('UPDATE shop_fixed_asset_documents SET original_name=?,storage_name=?,mime_type=?,extension=?,file_size=?,sha256=? WHERE id=?')->execute([$old['original_name'],$old['storage_name'],$old['mime_type'],$old['extension'],$old['file_size'],$old['sha256'],$legacy['id']]);
$db->exec('DELETE FROM shop_fixed_asset_files');
GtrotsFixedAssets::ensureSchema($db);GtrotsFixedAssets::ensureSchema($db);
$legacy=GtrotsFixedAssets::getDocument($db,$legacy['id']);
checkEdit(count($legacy['files'])===1,'Legacy migration must be idempotent.');
GtrotsFixedAssets::deleteFile($db,$legacy['id'],['file_id'=>$legacy['files'][0]['id']]);
GtrotsFixedAssets::ensureSchema($db);
checkEdit(count(GtrotsFixedAssets::getDocument($db,$legacy['id'])['files'])===0,'Deleted legacy file cannot reappear.');
$last=GtrotsFixedAssets::get($db,$legacy['lines'][0]['id']);
$result=GtrotsFixedAssets::deleteAsset($db,$last['id'],['revision'=>$last['revision'],'document_revision'=>GtrotsFixedAssets::getDocument($db,$last['document_id'])['revision']]);
checkEdit($result['document_deleted']===true && GtrotsFixedAssets::list($db,[])['total']===0,'Deleting the last product removes the empty document.');
echo "fixed_assets_editing_test: ok (VAT, concurrency, cascades, attachments, migration, exports)\n";
