<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/product-export.php';

function exportAssert(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('CREATE TABLE shop_products (id TEXT,source_id TEXT,name TEXT,sku TEXT,supplier_external_id TEXT,supplier_product_code TEXT,source_domain TEXT,stock_mode TEXT,stock_quantity INTEGER,accounting_stock_quantity INTEGER,supplier_stock_quantity INTEGER,view_count INTEGER)');
$db->exec('CREATE TABLE shop_product_sources (id TEXT,name TEXT)');
$db->exec('CREATE TABLE shop_product_images (product_id TEXT,image_path TEXT,sort_order INTEGER,created_at TEXT)');
$db->exec('CREATE TABLE shop_suppliers (id TEXT,name TEXT,alias TEXT)');
$db->exec('CREATE TABLE shop_supplier_product_references (product_id TEXT,supplier_id TEXT,supplier_product_code_original TEXT)');
$db->exec('CREATE TABLE shop_orders (id TEXT,payment_status TEXT,status TEXT)');
$db->exec('CREATE TABLE shop_order_items (order_id TEXT,product_id TEXT,quantity INTEGER)');
$db->exec('CREATE TABLE shop_product_reviews (product_id TEXT,rating INTEGER)');
$imageRelative = 'uploads/products/gt-product-export-test-' . bin2hex(random_bytes(6)) . '.png';
$imagePath = dirname(__DIR__) . '/' . $imageRelative;
if (!is_dir(dirname($imagePath))) mkdir(dirname($imagePath), 0775, true);
file_put_contents($imagePath, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAC0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAfg0wQAABzFhnAAAAAElFTkSuQmCC'));
register_shutdown_function(static function () use ($imagePath): void { if (is_file($imagePath)) unlink($imagePath); });
$db->exec("INSERT INTO shop_product_sources VALUES ('local','G-Trots'),('import','Boomag');
INSERT INTO shop_products VALUES ('p1','local','Disc de frână trotinetă electrică 140 mm, 6 găuri','00123','0099','cod 1','g-trots.ro','tracked',17,8,12,214),('p2','import','Încărcător universal 48V','GT-CH48','0007','EXT-12','boomag.ro','unlimited',0,0,43,75),('p3',NULL,'Cablu de frână','GT-CAB','','','g-trots.ro','tracked',0,3,0,8);
INSERT INTO shop_suppliers VALUES ('s1','Furnizor 1 SRL','Partener 1'),('s2','Furnizor 2 SRL','');
INSERT INTO shop_supplier_product_references VALUES ('p1','s1','cod 1'),('p1','s2','cod 2');
INSERT INTO shop_orders VALUES ('o1','paid','completed'),('o2','pending','new'),('o3','paid','cancelled'),('o4','paid','return_confirmed');
INSERT INTO shop_order_items VALUES ('o1','p1',3),('o2','p1',7),('o3','p1',9),('o4','p1',11);
INSERT INTO shop_product_images VALUES ('p1','{$imageRelative}',0,'2026-09-05'),('p2','{$imageRelative}',0,'2026-09-05'),('p3','{$imageRelative}',0,'2026-09-05');
INSERT INTO shop_product_reviews VALUES ('p1',5),('p1',4),('p1',5);");
$db->exec('ALTER TABLE shop_products ADD COLUMN slug TEXT');
$file = GtrotsProductExport::download($db, ['source_ids' => null]);
exportAssert($file['product_count'] === 3, 'All sources must include unassigned products.');
$bytes = base64_decode($file['content_base64'], true);
exportAssert(is_string($bytes) && str_starts_with($bytes, 'PK'), 'Download must be a genuine XLSX archive.');
$path = tempnam(sys_get_temp_dir(), 'gt-export-test-');
file_put_contents($path, $bytes);
$zip = new ZipArchive(); exportAssert($zip->open($path) === true, 'Archive must open.');
$sheet = new DOMDocument(); exportAssert($sheet->loadXML($zip->getFromName('xl/worksheets/sheet1.xml')), 'Sheet XML must parse.');
$xp = new DOMXPath($sheet); $xp->registerNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
$cell = static fn(string $ref): string => $xp->evaluate('string(//s:c[@r="' . $ref . '"])');
// Source name sorting puts Boomag first, followed by G-Trots and unassigned g-trots.ro.
exportAssert(trim($cell('C7')) === '00123', 'SKU must preserve leading zeros.');
exportAssert(abs((float)$cell('M7') - 4.67) < 0.0001 && (int)$cell('N7') === 3, 'Review mean and count must not be multiplied by supplier references.');
exportAssert(trim($cell('M6')) === 'Fără recenzii' && (int)$cell('N6') === 0, 'Unreviewed products must be explicit.');
exportAssert($xp->evaluate('count(//s:mergeCell[@ref="M7:M8"])') === 1.0, 'Ratings must span supplier rows.');
exportAssert(trim($cell('I7')) === '3.000000000000', 'Sales must not double count supplier joins or include excluded orders.');
exportAssert(trim($cell('K7')) === 'cod 1' && trim($cell('K8')) === 'cod 2', 'Supplier codes must occupy aligned rows.');
exportAssert($xp->evaluate('count(//s:mergeCell[@ref="B7:B8"])') === 1.0, 'Product name must span its supplier rows.');
exportAssert($xp->evaluate('count(//s:c/s:f)') === 0.0, 'Identifiers must never execute as formulas.');
exportAssert(str_contains($zip->getFromName('xl/drawings/drawing1.xml'), 'Disc de frână'), 'Product image must be embedded.');
for ($i = 0; $i < $zip->numFiles; $i++) {
    $name = $zip->getNameIndex($i);
    if (str_ends_with($name, '.xml') || str_ends_with($name, '.rels')) {
        exportAssert((new DOMDocument())->loadXML($zip->getFromIndex($i)), 'Every OOXML part must be valid: ' . $name);
    }
}
$zip->close(); unlink($path);
$filtered = GtrotsProductExport::download($db, ['source_ids' => ['local']]);
exportAssert($filtered['product_count'] === 1, 'Source selection must filter all product data.');
exportAssert(GtrotsProductExport::download($db, ['source_ids' => ['__unassigned']])['product_count'] === 1, 'Unassigned source selection must work.');
foreach ([[], ['unknown'], ['x\' OR 1=1 --']] as $ids) {
    try { GtrotsProductExport::download($db, ['source_ids' => $ids]); throw new RuntimeException('Invalid selection accepted.'); }
    catch (InvalidArgumentException $expected) {}
}
if (!empty($argv[1])) file_put_contents($argv[1], $bytes);
$db->exec('ALTER TABLE shop_products ADD COLUMN category_id TEXT');
$db->exec('ALTER TABLE shop_products ADD COLUMN manufacturer_id TEXT');
$db->exec('CREATE TABLE shop_categories (id TEXT,parent_id TEXT,name TEXT,slug TEXT,description TEXT,is_active INTEGER)');
$db->exec('CREATE TABLE shop_brands (id TEXT,name TEXT,slug TEXT,website_url TEXT,is_active INTEGER)');
$db->exec('CREATE TABLE shop_manufacturers (id TEXT,name TEXT,slug TEXT,website_url TEXT,is_active INTEGER)');
$db->exec('CREATE TABLE shop_product_brands (product_id TEXT,brand_id TEXT)');
$db->exec("INSERT INTO shop_categories VALUES ('c1',NULL,'Piese','piese','',1),('c2','c1','Frâne','frane','Frâne și accesorii',0);
INSERT INTO shop_brands VALUES ('b1','Compatibilitate test','test','https://example.invalid',1);
INSERT INTO shop_manufacturers VALUES ('m1','Producător test','test','',1);
INSERT INTO shop_product_brands VALUES ('p1','b1');
UPDATE shop_products SET category_id='c2',manufacturer_id='m1' WHERE id='p1'");
$db->exec('PRAGMA query_only=ON');
foreach (['categories'=>2,'brands'=>1,'manufacturers'=>1] as $kind=>$expectedCount) {
    $catalog = GtrotsProductExport::taxonomy($db,$kind);
    exportAssert($catalog['item_count']===$expectedCount,'Taxonomy export must include inactive records and full catalog.');
    $tmp=tempnam(sys_get_temp_dir(),'gt-taxonomy-test-'); file_put_contents($tmp,base64_decode($catalog['content_base64']));
    $archive=new ZipArchive(); $archive->open($tmp);
    $xml=$archive->getFromName('xl/worksheets/sheet1.xml');
    exportAssert(str_contains($xml,'Număr produse'),'Taxonomy must include associated product count.');
    if ($kind==='categories') exportAssert(str_contains($xml,'Categorie părinte') && str_contains($xml,'Inactivă'),'Category hierarchy and inactive state must be preserved.');
    if (!empty($argv[2])) file_put_contents(rtrim($argv[2],'/\\').'/'.$kind.'.xlsx',base64_decode($catalog['content_base64']));
    $archive->close(); unlink($tmp);
}
try { GtrotsProductExport::taxonomy($db,'invoices'); throw new RuntimeException('Unsupported taxonomy accepted.'); } catch (InvalidArgumentException $expected) {}
$db->exec('PRAGMA query_only=OFF');
$db->exec("DELETE FROM shop_product_images WHERE product_id='p3'");
try { GtrotsProductExport::download($db,['source_ids'=>['__unassigned']]); throw new RuntimeException('Missing photo silently accepted.'); }
catch (InvalidArgumentException $expected) { exportAssert(str_contains($expected->getMessage(),'imaginea') || str_contains($expected->getMessage(),'Imaginea'),'Missing photo must name the problem, never silently generate a placeholder.'); }
echo 'Product export tests passed. Fixture: ' . strlen($bytes) . " bytes.\n";
