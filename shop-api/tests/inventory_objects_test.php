<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/nir-domain.php';
require_once dirname(__DIR__) . '/nir-service.php';
require_once dirname(__DIR__) . '/nir-xlsx.php';
require_once dirname(__DIR__) . '/fixed-assets-service.php';
require_once dirname(__DIR__) . '/fixed-assets-export.php';
require_once dirname(__DIR__) . '/nir-pdf.php';
function expectObject(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
GtrotsFixedAssets::ensureSchema($db);
$user=['display_name'=>'Test'];
$payload=['document'=>['document_date'=>'2026-09-01','document_type'=>'factura','series'=>'DEMO','document_number'=>'1'],
    'lines'=>[['product_name'=>'Obiect transferat','quantity'=>5,'unit_price'=>100,'vat_rate'=>21,'vat_value'=>104.99]],
    'attachments'=>[['file_name'=>'document.xml','mime_type'=>'application/xml','content_base64'=>base64_encode('<document>TEST</document>')]]];
$doc=GtrotsFixedAssets::create($db,$payload,$user);$id=$doc['lines'][0]['id'];
GtrotsFixedAssets::dispose($db,$id,['disposal_date'=>'2026-10-01','quantity'=>-2,'reason'=>'Test'],$user);
$before=GtrotsFixedAssets::getDocument($db,$doc['id']);
$files=GtrotsFixedAssets::download($db,$doc['id']);
// Recreate the actual pre-upgrade table shape, solely in the in-memory test database.
$db->exec('DROP INDEX idx_fixed_asset_category_date');
$db->exec('ALTER TABLE shop_fixed_asset_documents DROP COLUMN asset_category');
GtrotsFixedAssets::ensureSchema($db);
$after=GtrotsFixedAssets::getDocument($db,$doc['id']);
expectObject($after['asset_category']==='inventory_objects','Existing documents move to inventory objects.');
expectObject($after['id']===$before['id'] && $after['lines'][0]['id']===$id,'Document and position IDs must be preserved.');
expectObject($after['lines'][0]['disposals']===$before['lines'][0]['disposals'],'Disposal history must be preserved byte-for-byte.');
expectObject($after['files']===$before['files'] && GtrotsFixedAssets::download($db,$doc['id'])===$files,'Attachment metadata and bytes must be preserved.');
foreach(['quantity','unit_price','vat_value','total_value','remaining_quantity','vat_manual'] as $field) expectObject($after['lines'][0][$field]===$before['lines'][0][$field],'Value changed: '.$field);
expectObject(GtrotsFixedAssets::list($db,[])['total']===1,'Existing inventory objects remain manageable from Fixed assets.');
expectObject(GtrotsFixedAssets::list($db,['asset_category'=>'inventory_objects','search'=>'transferat'])['total']===1,'Transferred item must be searchable in the new category.');
$new=GtrotsFixedAssets::create($db,['document'=>$payload['document'],'lines'=>[['product_name'=>'Mijloc fix nou','quantity'=>1,'unit_price'=>9000,'vat_rate'=>0]]],$user);
$object=GtrotsFixedAssets::create($db,['document'=>$payload['document']+['asset_category'=>'fixed_assets'],'lines'=>[['product_name'=>'Obiect nou','quantity'=>1,'unit_price'=>20,'vat_rate'=>0]]],$user);
try {
    GtrotsFixedAssets::create($db,['document'=>$payload['document']+['asset_category'=>'inventory_objects'],'lines'=>$payload['lines']],$user);
    throw new RuntimeException('Read-only view allowed creation');
} catch (ShopNirHttpException $expected) {}
GtrotsFixedAssets::ensureSchema($db);GtrotsFixedAssets::ensureSchema($db);
expectObject(GtrotsFixedAssets::getDocument($db,$new['id'])['asset_category']==='fixed_assets','Repeated migration must never reclassify newly saved documents.');
expectObject(GtrotsFixedAssets::list($db,['asset_category'=>'inventory_objects'])['total']===3,'New Fixed assets entries appear automatically in Inventory objects.');
expectObject(GtrotsFixedAssets::list($db,[])['items']===GtrotsFixedAssets::list($db,['asset_category'=>'inventory_objects'])['items'],'Both views share the same IDs and values without copies.');
$edited=GtrotsFixedAssets::updateDocument($db,$after['id'],['revision'=>$after['revision'],'document'=>$payload['document'],'lines'=>$after['lines']],$user);
expectObject($edited['asset_category']==='inventory_objects','Editing with an older client must preserve the stored category.');
$changedLines=$edited['lines'];$changedLines[0]['product_name']='Obiect transferat editat';$changedLines[0]['unit_price']=123;
$edited=GtrotsFixedAssets::updateDocument($db,$after['id'],['revision'=>$edited['revision'],'document'=>$payload['document'],'lines'=>$changedLines],$user);
$found=GtrotsFixedAssets::list($db,['asset_category'=>'inventory_objects','search'=>'transferat editat']);
expectObject($found['total']===1 && (float)$found['items'][0]['unit_price']===123.0,'Edits in the master registry are immediately visible and searchable in Inventory objects.');
expectObject($found['items'][0]['remaining_quantity']===3.0,'Disposal quantities are shared, not counted twice.');
foreach(['fixed_assets','inventory_objects'] as $category) {
    $export=GtrotsFixedAssets::export($db,['asset_category'=>$category,'search'=>'NOT MATCHING','from'=>'2099-01-01'],'xlsx');
    $tmp=tempnam(sys_get_temp_dir(),'gt-objects-test-');file_put_contents($tmp,base64_decode($export['content_base64']));
    $zip=new ZipArchive();expectObject($zip->open($tmp)===true,'Valid XLSX');
    $sheet=$zip->getFromName('xl/worksheets/sheet1.xml');$workbook=$zip->getFromName('xl/workbook.xml');$zip->close();unlink($tmp);
    $isObject=$category==='inventory_objects';
    expectObject(str_contains($workbook,$isObject?'Obiecte de inventar':'Mijloace fixe'),'Sheet title follows category.');
    expectObject(str_contains($sheet,'Obiect transferat editat') && str_contains($sheet,'Mijloc fix nou') && str_contains($sheet,'Obiect nou'),'Both exports contain the entire shared registry, with their respective title.');
}
$rows=(new ReflectionMethod(GtrotsFixedAssets::class,'exportRows'))->invoke(null,$db,['asset_category'=>'inventory_objects']);
$html=GtrotsFixedAssetExport::html($rows,['asset_category'=>'inventory_objects'],[]);
expectObject(str_contains($html,'GESTIUNEA OBIECTELOR DE INVENTAR') && !str_contains($html,'MIJLOACELOR FIXE'),'PDF branding follows category.');
$bundle=GtrotsFixedAssets::export($db,['asset_category'=>'inventory_objects'],'zip');
expectObject(str_contains($bundle['file_name'],'obiecte-de-inventar'),'ZIP filename follows category.');
$tmp=tempnam(sys_get_temp_dir(),'gt-objects-zip-');file_put_contents($tmp,base64_decode($bundle['content_base64']));$zip=new ZipArchive();expectObject($zip->open($tmp)===true,'Valid ZIP');
$nested=$zip->getFromName('Gestiune-obiecte-de-inventar-registru-complet.xlsx');expectObject(is_string($nested),'ZIP has category-named spreadsheet');
$attachmentFound=false;for($i=0;$i<$zip->numFiles;$i++){if(str_ends_with($zip->getNameIndex($i),'/document.xml'))$attachmentFound=$zip->getFromIndex($i)==='<document>TEST</document>';}
expectObject($attachmentFound,'ZIP preserves original attachment.');$zip->close();unlink($tmp);
try { GtrotsFixedAssets::list($db,['asset_category'=>'other']);throw new RuntimeException('Invalid category accepted'); } catch (InvalidArgumentException $expected) {}
foreach([$edited['id'],$new['id'],$object['id']] as $docId){$current=GtrotsFixedAssets::getDocument($db,$docId);GtrotsFixedAssets::deleteDocument($db,$docId,['revision'=>$current['revision']]);}
expectObject(GtrotsFixedAssets::list($db,['asset_category'=>'inventory_objects'])['total']===0,'Deleting in Fixed assets removes the same records from the read-only view.');
echo "PASS: migration preservation, shared registry, automatic future visibility, read-only creation, search, edits, disposals, deletion and branded PDF/XLSX/ZIP exports.\n";
