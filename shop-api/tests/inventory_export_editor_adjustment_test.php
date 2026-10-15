<?php
declare(strict_types=1);

if (!function_exists('mb_strtoupper')) {
    function mb_strtoupper(string $value, ?string $encoding = null): string { return strtoupper($value); }
}
if (!function_exists('mb_substr')) {
    function mb_substr(string $value, int $start, ?int $length = null, ?string $encoding = null): string
    {
        return $length === null ? substr($value, $start) : substr($value, $start, $length);
    }
}

require_once dirname(__DIR__) . '/inventory-export.php';

function editorAdjustmentAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$db = new PDO('sqlite::memory:', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec('CREATE TABLE shop_company_settings (id INTEGER PRIMARY KEY, legal_name TEXT, trade_name TEXT, cui TEXT, registration_number TEXT, address TEXT, city TEXT, county TEXT, country TEXT, is_default INTEGER)');
$db->exec('CREATE TABLE shop_products (id TEXT PRIMARY KEY, name TEXT, sku TEXT, stock_mode TEXT, stock_quantity REAL, accounting_stock_quantity REAL, is_accounting_stock_tracked INTEGER)');
$db->exec('CREATE TABLE shop_inventory_cost_layers (id TEXT, product_id TEXT, remaining_quantity REAL, unit_cost_ron REAL, is_reversed INTEGER)');
$db->exec('CREATE TABLE shop_warehouses (id TEXT, code TEXT, name TEXT)');
$db->exec('CREATE TABLE shop_suppliers (id TEXT, name TEXT, alias TEXT)');
$db->exec('CREATE TABLE shop_nir_documents (id TEXT, nir_number TEXT, temporary_number TEXT, operation_type TEXT, supplier_invoice_series TEXT, supplier_invoice_number TEXT, supplier_invoice_date TEXT, reception_date TEXT, customer_name TEXT, supplier_id TEXT)');
$db->exec('CREATE TABLE shop_invoices (id TEXT, series TEXT, invoice_number TEXT, issue_date TEXT)');
$db->exec('CREATE TABLE shop_orders (id TEXT, order_number TEXT, customer_name TEXT, company_name TEXT)');
$db->exec('CREATE TABLE shop_inventory_movements (id TEXT, product_id TEXT, warehouse_id TEXT, order_id TEXT, nir_document_id TEXT, sales_invoice_id TEXT, movement_type TEXT, quantity_delta REAL, quantity_after REAL, accounting_quantity_delta REAL, accounting_quantity_after REAL, inventory_unit_cost_ron REAL, inventory_cost_total_ron REAL, sale_unit_price_ron REAL, sale_total_ron REAL, fifo_status TEXT, fifo_quantity_pending REAL, note TEXT, created_by TEXT, created_at TEXT)');
$db->exec("INSERT INTO shop_company_settings VALUES (1,'G-Trots Test SRL','G-Trots','RO12345678','J40/1/2026','Strada Test 1','București','București','România',1);
INSERT INTO shop_products VALUES ('p1','Cauciuc documentat','SE-CMM087','tracked',999,999,1),('p2','Produs fără documente','NO-DOC','tracked',50,50,1);
INSERT INTO shop_inventory_cost_layers VALUES ('l1','p1',7,50,0);
INSERT INTO shop_warehouses VALUES ('w1','MAIN','Gestiune principală');
INSERT INTO shop_suppliers VALUES ('s1','Furnizor Test SRL','Furnizor Test');
INSERT INTO shop_nir_documents VALUES ('n1','NIR-2026-001','TMP-1','supplier_receipt','FT','001','2026-09-20','2026-09-20',NULL,'s1');
INSERT INTO shop_invoices VALUES ('i1','GT','0001','2026-09-20');
INSERT INTO shop_orders VALUES ('o1','GT-TEST-001','Client Test',NULL);
INSERT INTO shop_inventory_movements VALUES
('m0','p1','w1',NULL,NULL,NULL,'MANUAL_ADJUSTMENT',100,100,100,100,50,5000,NULL,NULL,'allocated',0,'Inventar inițial fără document','Administrator','2026-09-20 19:00:00'),
('m1','p1','w1',NULL,'n1',NULL,'NIR_IN',10,110,10,110,50,500,NULL,NULL,'allocated',0,'Recepție documentată','Administrator','2026-09-20 20:00:00'),
('m2','p1','w1',NULL,NULL,NULL,'adjustment',0,0,NULL,NULL,0,0,NULL,NULL,'allocated',0,'Actualizare din editorul produsului','Administrator','2026-09-20 21:41:00'),
('m3','p1','w1',NULL,NULL,NULL,'adjustment',0,0,NULL,NULL,0,0,NULL,NULL,'allocated',0,'Actualizare din editorul produsului','Administrator','2026-09-20 21:42:00'),
('m4','p1','w1',NULL,NULL,NULL,'adjustment',1,111,1,111,50,50,NULL,NULL,'allocated',0,'Corecție manuală după inventar','Administrator','2026-09-20 22:00:00'),
('m5','p1','w1','o1',NULL,'i1','SALE_OUT',-3,108,-3,108,50,150,100,300,'allocated',0,'Ieșire documentată','Sistem','2026-09-20 22:30:00'),
('m6','p2','w1',NULL,NULL,NULL,'MANUAL_ADJUSTMENT',50,50,50,50,20,1000,NULL,NULL,'allocated',0,'Produs fără acte','Administrator','2026-09-20 23:00:00');");
$db->exec('PRAGMA query_only=ON');

$estimate = GtrotsInventoryExport::estimate($db, ['from' => '2026-09-01', 'to' => '2026-09-30']);
editorAdjustmentAssert($estimate['movement_count'] === 2, 'Estimarea trebuie să includă doar NIR-ul și factura de ieșire.');
editorAdjustmentAssert($estimate['document_count'] === 2, 'Doar NIR-ul și factura de ieșire trebuie numărate ca documente sursă.');
editorAdjustmentAssert($estimate['product_count'] === 1, 'Produsele fără NIR sau factură nu trebuie incluse în stocul documentat.');

$file = GtrotsInventoryExport::download($db, ['from' => '2026-09-01', 'to' => '2026-09-30']);
editorAdjustmentAssert($file['movement_count'] === 2, 'Exportul trebuie să conțină numai mișcările reale de stoc.');
$bytes = base64_decode($file['content_base64'], true);
editorAdjustmentAssert(is_string($bytes) && str_starts_with($bytes, 'PK'), 'Exportul trebuie să rămână un XLSX valid.');
$path = tempnam(sys_get_temp_dir(), 'gt-stock-filter-');
file_put_contents($path, $bytes);
$zip = new ZipArchive();
editorAdjustmentAssert($zip->open($path) === true, 'XLSX-ul generat trebuie să poată fi deschis.');
$sheets = '';
for ($index = 1; $index <= 6; $index++) $sheets .= (string)$zip->getFromName('xl/worksheets/sheet' . $index . '.xml');
$stockSheet = (string)$zip->getFromName('xl/worksheets/sheet2.xml');
$movementsSheet = (string)$zip->getFromName('xl/worksheets/sheet4.xml');
$zip->close();
unlink($path);
editorAdjustmentAssert(!str_contains($sheets, 'Actualizare din editorul produsului'), 'Rândurile de tip ADJUSTMENT nu trebuie să apară în fișier.');
editorAdjustmentAssert(!str_contains($sheets, 'Inventar inițial fără document'), 'Ajustările manuale fără document nu trebuie să apară în fișier.');
editorAdjustmentAssert(!str_contains($sheets, 'Corecție manuală după inventar'), 'Corecțiile manuale fără document nu trebuie să apară în fișier.');
editorAdjustmentAssert(!str_contains($sheets, 'Produs fără documente'), 'Produsele fără NIR sau factură nu trebuie să apară în fișier.');
editorAdjustmentAssert(str_contains($sheets, 'NIR-2026-000001'), 'NIR-ul trebuie păstrat în fișier.');
editorAdjustmentAssert(str_contains($sheets, 'GT') && str_contains($sheets, '0001'), 'Factura de ieșire trebuie păstrată în fișier.');
editorAdjustmentAssert(preg_match('/<c r="H5"[^>]*><v>7(?:\.0+)?<\/v><\/c>/', $stockSheet) === 1, 'Stocul final trebuie calculat exclusiv din 10 bucăți intrate prin NIR și 3 ieșite prin factură.');
editorAdjustmentAssert(preg_match('/<c r="T5"[^>]*><v>10(?:\.0+)?<\/v><\/c>/', $movementsSheet) === 1, 'Soldul documentat după NIR trebuie să fie 10.');
editorAdjustmentAssert(preg_match('/<c r="T6"[^>]*><v>7(?:\.0+)?<\/v><\/c>/', $movementsSheet) === 1, 'Soldul documentat după factura de ieșire trebuie să fie 7.');

echo "Inventory export documented-stock filter test passed.\n";
