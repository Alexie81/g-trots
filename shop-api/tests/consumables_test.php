<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/nir-domain.php';
require_once dirname(__DIR__) . '/nir-service.php';
require_once dirname(__DIR__) . '/consumables-service.php';

function checkConsumables(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

checkConsumables(in_array('sqlite', PDO::getAvailableDrivers(), true), 'consumables_test requires pdo_sqlite.');
$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
GtrotsConsumables::ensureSchema($db);
GtrotsConsumables::ensureSchema($db); // Additive migration is safe to rerun.
$stampDirectory=dirname(__DIR__).'/uploads/company';
if(!is_dir($stampDirectory))mkdir($stampDirectory,0775,true);
$stampName='consumables-test-'.bin2hex(random_bytes(5)).'.png';
$stampFile=$stampDirectory.'/'.$stampName;
$stampFixture=imagecreatetruecolor(80,30);imagefill($stampFixture,0,0,imagecolorallocate($stampFixture,24,56,98));imagepng($stampFixture,$stampFile);imagedestroy($stampFixture);
$db->exec('CREATE TABLE shop_company_settings (id INTEGER,is_default INTEGER,legal_name TEXT,stamp_path TEXT)');
$db->prepare('INSERT INTO shop_company_settings VALUES (1,1,?,?)')->execute(['Societate test','uploads/company/'.$stampName]);

$document = GtrotsConsumables::createDocument($db, [
    'document' => ['document_date'=>'2026-11-02','document_type'=>'factura','series'=>'FC','document_number'=>'101','notes'=>'Consumabile atelier'],
    'lines' => [
        ['product_name'=>'Spray curățare contacte','unit'=>'buc','quantity'=>10,'unit_price'=>20,'vat_rate'=>21],
        ['product_name'=>'Lavete microfibră','unit'=>'set','quantity'=>8,'unit_price'=>12.5,'vat_rate'=>21,'vat_value'=>21],
    ],
    'attachments' => [['file_name'=>'factura-consumabile.pdf','mime_type'=>'application/pdf','content_base64'=>base64_encode('%PDF-1.4 consumabile')]],
], ['display_name'=>'Administrator test']);

checkConsumables(count($document['lines']) === 2, 'Documentul trebuie să păstreze toate pozițiile.');
$spray = $document['lines'][0];
checkConsumables((float)$spray['total_value'] === 242.0, 'TVA-ul automat trebuie inclus în total.');
checkConsumables((float)$document['lines'][1]['vat_value'] === 21.0 && (int)$document['lines'][1]['vat_manual'] === 1, 'TVA-ul manual trebuie păstrat.');
$download = GtrotsConsumables::download($db, (string)$document['id']);
checkConsumables(base64_decode($download['content_base64'], true) === '%PDF-1.4 consumabile', 'Fișierul justificativ trebuie descărcat identic.');

$people = GtrotsConsumables::savePerson($db, ['role'=>'giver','name'=>'Gestionar Atelier','details'=>'Magazie','active'=>true]);
$giver = $people['givers'][0];
$people = GtrotsConsumables::savePerson($db, ['role'=>'receiver','name'=>'Tehnician Service','details'=>'Atelier','active'=>true]);
$receiver = $people['receivers'][0];
$meta = GtrotsConsumables::voucherMeta($db, 'BC');
checkConsumables($meta['next_number'] === '1', 'Primul număr propus trebuie să fie 1.');

$voucher = GtrotsConsumables::createVoucher($db, [
    'voucher_date'=>'2026-11-10','series'=>'BC','voucher_number'=>'1','giver_id'=>$giver['id'],'receiver_id'=>$receiver['id'],
    'notes'=>'Consum operațional','work_reference'=>'Revizie atelier','order_reference'=>'COM-104 / SKU-1','lines'=>[
        ['consumable_id'=>$spray['id'],'quantity'=>3],
        ['consumable_id'=>$document['lines'][1]['id'],'quantity'=>2],
    ],
], ['display_name'=>'Administrator test']);
checkConsumables(count($voucher['lines']) === 2 && (float)$voucher['lines'][0]['quantity'] === 3.0, 'Bonul colectiv trebuie să păstreze cantități pozitive.');
checkConsumables($voucher['work_reference']==='Revizie atelier' && $voucher['order_reference']==='COM-104 / SKU-1', 'Referințele opționale trebuie memorate la adăugare.');
$after = GtrotsConsumables::get($db, (string)$spray['id']);
checkConsumables((float)$after['remaining_quantity'] === 7.0 && (float)$after['consumed_quantity'] === 3.0, 'Bonul pozitiv trebuie să reducă stocul.');
checkConsumables(GtrotsConsumables::voucherMeta($db, 'BC')['next_number'] === '2', 'Numerotarea bonurilor trebuie continuată pe serie.');

$over = false;
try {
    GtrotsConsumables::createVoucher($db, ['voucher_date'=>'2026-11-10','series'=>'BC','voucher_number'=>'2','giver_name'=>'G','receiver_name'=>'P','lines'=>[['consumable_id'=>$spray['id'],'quantity'=>8]]], []);
} catch (ShopNirHttpException $error) { $over = $error->status === 409; }
checkConsumables($over, 'Consumul peste stoc trebuie respins tranzacțional.');

$voucher = GtrotsConsumables::updateVoucher($db, (string)$voucher['id'], [
    'voucher_date'=>'2026-11-11','series'=>'BC','voucher_number'=>'1','giver_id'=>$giver['id'],'receiver_id'=>$receiver['id'],
    'notes'=>'Consum corectat','revision'=>$voucher['revision'],'lines'=>[['consumable_id'=>$spray['id'],'quantity'=>1]],
], ['display_name'=>'Editor']);
checkConsumables((float)GtrotsConsumables::get($db, (string)$spray['id'])['remaining_quantity'] === 9.0, 'Editarea bonului trebuie să refacă și să recalculeze stocul.');
checkConsumables((float)GtrotsConsumables::get($db, (string)$document['lines'][1]['id'])['remaining_quantity'] === 8.0, 'Poziția eliminată de pe bon trebuie restaurată integral.');
checkConsumables($voucher['work_reference']==='Revizie atelier', 'Un client mai vechi nu trebuie să șteargă referințele omise din cerere.');

$search = GtrotsConsumables::list($db, ['page'=>1,'page_size'=>25,'search'=>'spray curatare']);
checkConsumables($search['total'] === 1 && $search['items'][0]['id'] === $spray['id'], 'Căutarea semantică trebuie să ignore diacriticele.');
$filter = GtrotsConsumables::list($db, ['page'=>1,'page_size'=>25,'type'=>'bon']);
checkConsumables($filter['total'] === 0, 'Filtrul de tip document trebuie aplicat.');

$export = GtrotsConsumables::export($db, ['from'=>'2026-11-01','to'=>'2026-11-30'], 'xlsx');
$xlsx = base64_decode($export['content_base64'], true);
checkConsumables(str_starts_with($xlsx, "PK\x03\x04"), 'Exportul Excel trebuie să fie un XLSX valid.');
$tmp = tempnam(sys_get_temp_dir(), 'cons-xlsx-');
file_put_contents($tmp, $xlsx);
$zip = new ZipArchive();
checkConsumables($zip->open($tmp) === true, 'Pachetul XLSX trebuie să poată fi deschis.');
foreach (['xl/workbook.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml','xl/styles.xml'] as $file) {
    $xml = $zip->getFromName($file);
    checkConsumables($xml !== false && simplexml_load_string($xml) !== false, 'XML invalid în ' . $file);
}
$workbook = $zip->getFromName('xl/workbook.xml');
checkConsumables(str_contains($workbook, 'name="Consumabile"') && str_contains($workbook, 'name="Bonuri de consum"'), 'Excelul trebuie să conțină cele două foi cerute.');
$stockSheet = $zip->getFromName('xl/worksheets/sheet1.xml');
$voucherSheet = $zip->getFromName('xl/worksheets/sheet2.xml');
checkConsumables(str_contains($stockSheet, 'Stoc actual') && str_contains($stockSheet, 'Spray curățare contacte'), 'Foaia de consumabile trebuie să includă stocul actual.');
checkConsumables(str_contains($voucherSheet, 'Gestionar Atelier') && str_contains($voucherSheet, 'Tehnician Service'), 'Foaia bonurilor trebuie să includă predătorul și primitorul.');
// The entry date must come from the source invoice, not from the voucher date.
$voucherXml = simplexml_load_string($voucherSheet);
$voucherXml->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
$readCell = static fn(string $ref): string => (string)($voucherXml->xpath('//s:c[@r="'.$ref.'"]/s:is/s:t')[0] ?? '');
checkConsumables($readCell('M6') === 'Data doc. de intrare' && $readCell('M7') === '02.11.2026', 'Data documentului de intrare trebuie exportată lângă referința documentului.');
checkConsumables($readCell('B7') === '11.11.2026' && $readCell('L7') === 'FC 101', 'Data bonului și documentul sursă trebuie păstrate în coloanele lor.');
checkConsumables(str_contains($voucherSheet, 'autoFilter ref="A6:N7"'), 'Filtrarea Excel trebuie să includă noua coloană.');
$zip->close(); unlink($tmp);

// Downloading a saved voucher must not mutate stock or export other vouchers.
$beforeDownload = GtrotsConsumables::get($db, (string)$spray['id']);
$individual = GtrotsConsumables::exportVoucher($db, (string)$voucher['id'], 'xlsx');
checkConsumables($individual['file_name'] === 'BC-1 - fact. FC_101 din 02.11.2026.xlsx', 'Numele fișierului individual trebuie să identifice bonul și documentul de intrare.');
$tmp = tempnam(sys_get_temp_dir(), 'voucher-xlsx-');
file_put_contents($tmp, base64_decode($individual['content_base64'], true));
$zip = new ZipArchive(); checkConsumables($zip->open($tmp) === true, 'XLSX-ul individual trebuie să fie valid.');
foreach (['xl/workbook.xml','xl/worksheets/sheet1.xml','xl/styles.xml','xl/drawings/drawing1.xml'] as $file) {
    checkConsumables(simplexml_load_string($zip->getFromName($file)) !== false, 'XML individual invalid: '.$file);
}
$singleXml = simplexml_load_string($zip->getFromName('xl/worksheets/sheet1.xml'));
$singleXml->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
$textCell = static fn(string $ref): string => (string)($singleXml->xpath('//s:c[@r="'.$ref.'"]/s:is/s:t')[0] ?? '');
$numberCell = static fn(string $ref): float => (float)($singleXml->xpath('//s:c[@r="'.$ref.'"]/s:v')[0] ?? 0);
checkConsumables($zip->getFromName('xl/worksheets/sheet2.xml') === false, 'Bonul individual nu trebuie să conțină centralizatorul.');
checkConsumables(str_contains($textCell('B10'), 'FC 101 / 02.11.2026') && $textCell('E5') === '11.11.2026', 'Datele sursei și bonului trebuie să fie distincte.');
checkConsumables($numberCell('F10') === 1.0 && $numberCell('G10') === 0.0 && $numberCell('H10') === 20.0 && $numberCell('I10') === 20.0 && $numberCell('I16') === 20.0, 'Bonul individual trebuie să exporte cantitatea și valorile salvate.');
checkConsumables($textCell('G5')==='Revizie atelier' && $textCell('E7')==='COM-104 / SKU-1', 'Referințele introduse trebuie exportate.');
checkConsumables(!str_contains($zip->getFromName('xl/worksheets/sheet1.xml'),'ȘEF COMPARTIMENT') && str_contains($zip->getFromName('xl/drawings/drawing1.xml'),'Ștampila firmei'), 'Excelul trebuie să includă ștampila fără șef de compartiment.');
checkConsumables(!str_contains($zip->getFromName('xl/worksheets/sheet1.xml'), 'Lavete microfibră'), 'Poziția eliminată de pe bon nu trebuie să apară în export.');
$zip->close(); unlink($tmp);
$individualPdf = base64_decode(GtrotsConsumables::exportVoucher($db, (string)$voucher['id'], 'pdf')['content_base64'], true);
checkConsumables(str_starts_with($individualPdf, '%PDF-'), 'PDF-ul bonului individual trebuie să fie valid.');
checkConsumables(GtrotsConsumables::get($db, (string)$spray['id']) === $beforeDownload, 'Descărcarea nu trebuie să modifice stocul sau istoricul.');
foreach (['zip','html'] as $invalidFormat) {
    $rejected=false;try {GtrotsConsumables::exportVoucher($db, (string)$voucher['id'], $invalidFormat);} catch (InvalidArgumentException $e) {$rejected=true;}
    checkConsumables($rejected, 'Formatul individual neacceptat trebuie respins.');
}
$missing=false;try {GtrotsConsumables::exportVoucher($db, 'nonexistent', 'pdf');} catch (ShopNirHttpException $e) {$missing=$e->status===404;}
checkConsumables($missing, 'Bonul inexistent trebuie să returneze 404.');
$escaped=$voucher;$escaped['notes']='<script>alert(1)</script>';
$html=GtrotsConsumablesExport::voucherHtml($escaped,['stamp_path'=>'uploads/company/'.$stampName]);
checkConsumables(str_contains($html, '&lt;script&gt;') && !str_contains($html, '<script>'), 'Textul din document trebuie escap-at.');
checkConsumables(!str_contains($html,'ȘEF COMPARTIMENT') && str_contains($html,'Ștampila firmei') && str_contains($html,'Revizie atelier'), 'PDF-ul trebuie să includă referințele și ștampila, fără șef de compartiment.');

$pdf = base64_decode(GtrotsConsumables::export($db, ['from'=>'2026-11-01','to'=>'2026-11-30'], 'pdf')['content_base64'], true);
checkConsumables(str_starts_with($pdf, '%PDF-'), 'Exportul PDF trebuie să fie valid.');
$bundleBytes = base64_decode(GtrotsConsumables::export($db, ['from'=>'2026-11-01','to'=>'2026-11-30'], 'zip')['content_base64'], true);
$bundlePath = tempnam(sys_get_temp_dir(), 'cons-bundle-'); file_put_contents($bundlePath, $bundleBytes);
$bundle = new ZipArchive(); checkConsumables($bundle->open($bundlePath) === true, 'Arhiva completă trebuie să fie validă.');
$names=[];for($i=0;$i<$bundle->numFiles;$i++)$names[]=$bundle->getNameIndex($i);
checkConsumables(count(array_filter($names,fn($name)=>str_ends_with($name,'.pdf')))>=2, 'ZIP-ul trebuie să includă raportul PDF și documentul PDF atașat.');
checkConsumables(count(array_filter($names,fn($name)=>str_ends_with($name,'.xlsx')))===1, 'ZIP-ul trebuie să includă registrul Excel.');
$bundle->close();unlink($bundlePath);

GtrotsConsumables::deletePerson($db, (string)$giver['id']);
checkConsumables(GtrotsConsumables::getVoucher($db, (string)$voucher['id'])['giver_name'] === 'Gestionar Atelier', 'Ștergerea persoanei nu trebuie să modifice fotografia istorică a bonului.');

$editBody=['voucher_date'=>$voucher['voucher_date'],'series'=>'BC','voucher_number'=>'1','giver_name'=>$voucher['giver_name'],'receiver_name'=>$voucher['receiver_name'],'lines'=>[['consumable_id'=>$spray['id'],'quantity'=>1]],'work_reference'=>'Lucrare revizuită','order_reference'=>'','revision'=>$voucher['revision']];
$voucher=GtrotsConsumables::updateVoucher($db,(string)$voucher['id'],$editBody,[]);
checkConsumables($voucher['work_reference']==='Lucrare revizuită' && $voucher['order_reference']==='', 'Referințele trebuie să poată fi editate și golite explicit.');

GtrotsConsumables::deleteVoucher($db, (string)$voucher['id'], ['revision'=>$voucher['revision']]);
checkConsumables((float)GtrotsConsumables::get($db, (string)$spray['id'])['remaining_quantity'] === 10.0, 'Ștergerea bonului trebuie să refacă integral stocul.');

$freshDocument = GtrotsConsumables::getDocument($db, (string)$document['id']);
$freshDocument['lines'][0]['product_name'] = 'Spray contacte profesionale';
$edited = GtrotsConsumables::updateDocument($db, (string)$document['id'], [
    'document'=>['document_date'=>'2026-11-02','document_type'=>'factura','series'=>'FC','document_number'=>'101','notes'=>'Editat'],
    'lines'=>$freshDocument['lines'],'revision'=>$freshDocument['revision'],
], ['display_name'=>'Editor']);
checkConsumables($edited['lines'][0]['product_name'] === 'Spray contacte profesionale', 'Consumabilele trebuie să poată fi editate.');

$cascadeVoucher = GtrotsConsumables::createVoucher($db, ['voucher_date'=>'2026-11-12','series'=>'BC','voucher_number'=>'2','giver_name'=>'Gestionar manual','receiver_name'=>'Primitor manual','lines'=>[['consumable_id'=>$edited['lines'][0]['id'],'quantity'=>2]]], []);
$itemBeforeDelete = GtrotsConsumables::get($db, (string)$edited['lines'][0]['id']);
GtrotsConsumables::deleteItem($db, (string)$itemBeforeDelete['id'], ['revision'=>$itemBeforeDelete['revision']]);
$voucherGone = false; try { GtrotsConsumables::getVoucher($db, (string)$cascadeVoucher['id']); } catch (ShopNirHttpException $error) { $voucherGone = $error->status === 404; }
checkConsumables($voucherGone, 'Ștergerea liberă a consumabilului trebuie să elimine bonul rămas fără poziții.');

$remainingDocument = GtrotsConsumables::getDocument($db, (string)$document['id']);
GtrotsConsumables::deleteDocument($db, (string)$document['id'], ['revision'=>$remainingDocument['revision']]);
checkConsumables((int)$db->query('SELECT COUNT(*) FROM shop_consumable_documents')->fetchColumn() === 0, 'Documentul trebuie să poată fi șters complet.');
checkConsumables((int)$db->query('SELECT COUNT(*) FROM shop_consumables')->fetchColumn() === 0, 'Ștergerea documentului nu trebuie să lase poziții orfane.');
unlink($stampFile);

echo "consumables_test: ok (CRUD, positive outflow, stock, people, search, periods, PDF, XLSX, individual vouchers, ZIP, cascades)\n";
