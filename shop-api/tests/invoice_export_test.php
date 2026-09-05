<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/invoice-export.php';
function registryAssert(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function registryZip(string $bytes, callable $inspect): void {
    $path = tempnam(sys_get_temp_dir(), 'gt-registry-test-'); file_put_contents($path, $bytes);
    $zip = new ZipArchive(); registryAssert($zip->open($path) === true, 'ZIP must open.');
    try { $inspect($zip); } finally { $zip->close(); unlink($path); }
}
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('CREATE TABLE shop_invoices (id TEXT,order_id TEXT,series TEXT,invoice_number TEXT,invoice_type TEXT,document_status TEXT,theme TEXT,issue_date TEXT,due_date TEXT,currency TEXT,total REAL,buyer_name TEXT,payload_json TEXT,issued_at TEXT,spv_status TEXT)');
$db->exec('CREATE TABLE shop_orders (id TEXT,order_number TEXT,payment_status TEXT,payment_method TEXT,stripe_paid_at TEXT,customer_email TEXT,customer_phone TEXT,discount_total REAL,promotion_code TEXT,promotion_scope TEXT)');
$db->exec('CREATE TABLE shop_order_items (id TEXT,order_id TEXT,product_id TEXT,product_name TEXT,product_sku TEXT,quantity REAL,unit_price REAL,line_total REAL,discount_total REAL,discounted_unit_price REAL,discounted_line_total REAL)');
$db->exec('CREATE TABLE shop_product_images (product_id TEXT,image_path TEXT,sort_order INTEGER,created_at TEXT)');
$db->exec('CREATE TABLE shop_products (id TEXT,sku TEXT,supplier_product_code TEXT,created_at TEXT)');
$party = ['name'=>'Firmă test SRL','type'=>'company','cui'=>'RO12345678','address'=>'Strada Test 1','city'=>'Cluj-Napoca','county'=>'Cluj','country'=>'România','postal_code'=>'400001'];
$payload = ['series'=>'GT','number'=>'001','issue_date'=>'2026-09-01','due_date'=>'2026-09-08','currency'=>'RON','seller'=>$party,'buyer'=>$party,
    'items'=>[['name'=>'Produs test','sku'=>'0007','product_id'=>'p1','quantity'=>2,'unit'=>'buc.','unit_price'=>100,'discount_percent'=>10,'vat_rate'=>21]],
    'order_reference'=>'GT-TEST','payment'=>['method'=>'Card online'],'notes'=>'Test export'];
$insert = $db->prepare('INSERT INTO shop_invoices VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
foreach ([['001','2026-09-01','invoice','paid',217.8,'sent'],['002','2026-09-05','return','return',-217.8,'processing'],['003','2026-08-31','invoice','unpaid',217.8,'rejected']] as [$number,$date,$type,$status,$total,$spv]) {
    $copy = $payload; $copy['number']=$number; $copy['issue_date']=$date; $copy['status']=$status; $copy['theme']='orange';
    if ($type === 'return') $copy['related_invoice']=['series'=>'GT','number'=>'001','date'=>'2026-09-01'];
    $insert->execute([$number,'o1','GT',$number,$type,$status,'orange',$date,'2026-09-08','RON',$total,$party['name'],json_encode($copy),$date.' 12:00:00',$spv]);
}
$db->exec("INSERT INTO shop_orders VALUES ('o1','GT-TEST','paid','card','','test@example.invalid','',0,'','')");
// Any accidental DB mutation during export now fails the test.
$db->exec('PRAGMA query_only=ON');
$simple = GtrotsInvoiceExport::download($db,['from'=>'2026-09-01','to'=>'2026-09-05']);
registryAssert($simple['item_count'] === 2 && str_ends_with($simple['file_name'],'.xlsx'), 'Inclusive date filter and registry-only mode.');
registryZip(base64_decode($simple['content_base64']), static function (ZipArchive $zip): void {
    $doc=new DOMDocument(); $doc->loadXML($zip->getFromName('xl/worksheets/sheet1.xml'));
    $xp=new DOMXPath($doc); $xp->registerNamespace('s','http://schemas.openxmlformats.org/spreadsheetml/2006/main');
    $cell=static fn(string $ref): string => trim($xp->evaluate('string(//s:c[@r="'.$ref.'"])'));
    registryAssert($cell('B5') === 'Stare SPV', 'Second column must be SPV state.');
    registryAssert($cell('B6') === 'Trimisă' && $cell('B7') === 'Netrimisă', 'Processing must never count as confirmed sent.');
    registryAssert($cell('H6') === '001', 'Invoice number must preserve zero prefix.');
    registryAssert((float)$cell('W7') === -180.0 && abs((float)$cell('X7')+37.8)<0.0001 && abs((float)$cell('Y7')+217.8)<0.0001, 'Return base, VAT and total must be negative.');
    registryAssert($cell('J7') === 'GT 001' && $cell('I7') === 'GT-TEST', 'Return must retain invoice and order references.');
    registryAssert(str_contains($zip->getFromName('xl/drawings/drawing1.xml'),'G-Trots'), 'Registry logo must be embedded.');
});
$archive = GtrotsInvoiceExport::download($db,['from'=>'2026-09-01','to'=>'2026-09-05','include_documents'=>true]);
registryZip(base64_decode($archive['content_base64']), static function (ZipArchive $zip): void {
    registryAssert($zip->numFiles===7, 'Archive must contain registry plus 3 files per invoice.');
    foreach (['001','002'] as $number) {
        registryAssert(str_starts_with($zip->getFromName("GT-$number/GT-$number.pdf"), '%PDF'), 'PDF must be genuine.');
        registryAssert(str_starts_with($zip->getFromName("GT-$number/GT-$number.xlsx"), 'PK'), 'XLSX must be genuine.');
        $xml = $zip->getFromName("GT-$number/GT-$number - RO_e-Factura.xml");
        $doc = new DOMDocument(); registryAssert($doc->loadXML($xml), 'e-Factura XML must parse.');
        registryAssert($doc->documentElement->localName === ($number==='001' ? 'Invoice' : 'CreditNote'), 'Return must use CreditNote XML.');
    }
});
registryAssert(GtrotsInvoiceExport::download($db,[])['item_count']===3, 'All-period export must include all dates.');
registryAssert(GtrotsInvoiceExport::download($db,['from'=>'2020-01-01','to'=>'2020-01-31'])['item_count']===0, 'Empty selection must produce an honest empty registry.');
foreach ([['2026-02-30','2026-03-01'],['','2026-09-05'],['2026-09-05','2026-09-01'],['x','y']] as [$from,$to]) {
    try { GtrotsInvoiceExport::range($from,$to); throw new RuntimeException('Invalid range accepted.'); } catch (InvalidArgumentException $expected) {}
}
registryAssert(!str_contains(GtrotsInvoiceExport::folder(['series'=>'../GT','invoice_number'=>'001/../../']),'/'), 'Folder names must not permit path traversal.');
if (!empty($argv[1])) file_put_contents($argv[1],base64_decode($simple['content_base64']));
echo "Invoice export tests passed: registry, PDF/XLSX/XML bundle, date boundaries, return values and read-only database.\n";
