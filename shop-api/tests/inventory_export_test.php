<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/inventory-export.php';

function inventoryExportAssert(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
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
INSERT INTO shop_products VALUES ('p1','Cauciuc test','SE-CMM087','tracked',12,12,1),('p2','Controller test','CTRL-01','tracked',3,3,1);
INSERT INTO shop_inventory_cost_layers VALUES ('l1','p1',12,65,0),('l2','p2',3,200,0);
INSERT INTO shop_warehouses VALUES ('w1','MAIN','Gestiune principală');
INSERT INTO shop_suppliers VALUES ('s1','Furnizor Test SRL','Furnizor Test');
INSERT INTO shop_nir_documents VALUES ('n1','NIR-2026-9','TMP-1','supplier_receipt','FT','00123','2026-09-01','2026-09-02',NULL,'s1');
INSERT INTO shop_invoices VALUES ('i1','GT','0007','2026-09-10');
INSERT INTO shop_orders VALUES ('o1','GT-TEST-001','Client Test',NULL);
INSERT INTO shop_inventory_movements VALUES
('m1','p1','w1',NULL,'n1',NULL,'NIR_IN',20,20,20,20,65,1300,NULL,NULL,'allocated',0,'Recepție marfă','Administrator','2026-09-02 10:00:00'),
('m2','p1','w1','o1',NULL,'i1','SALE_OUT',-8,12,-8,12,65,520,129,1032,'allocated',0,'Vânzare client','Sistem','2026-09-10 13:00:00'),
('m3','p2','w1',NULL,NULL,NULL,'MANUAL_ADJUSTMENT',3,3,3,3,200,600,NULL,NULL,'allocated',0,'Inventar inițial','Administrator','2026-09-11 09:00:00');");
$db->exec('PRAGMA query_only=ON');

$estimate = GtrotsInventoryExport::estimate($db, ['from' => '2026-09-01', 'to' => '2026-09-30']);
inventoryExportAssert($estimate['product_count'] === 2 && $estimate['movement_count'] === 3 && $estimate['document_count'] === 3, 'Estimate must use the selected period and real counts.');
$file = GtrotsInventoryExport::download($db, ['from' => '2026-09-01', 'to' => '2026-09-30']);
inventoryExportAssert($file['product_count'] === 2 && $file['movement_count'] === 3 && $file['document_count'] === 3, 'Export summary counts must be exact.');
$bytes = base64_decode($file['content_base64'], true);
inventoryExportAssert(is_string($bytes) && str_starts_with($bytes, 'PK'), 'Export must be a genuine XLSX archive.');
$path = tempnam(sys_get_temp_dir(), 'gt-stock-export-'); file_put_contents($path, $bytes);
$zip = new ZipArchive(); inventoryExportAssert($zip->open($path) === true, 'XLSX archive must open.');
$workbook = $zip->getFromName('xl/workbook.xml');
foreach (['Rezumat','Stoc pe produse','Fișe magazie','Mișcări stoc','Documente sursă','Metodologie'] as $sheetName) inventoryExportAssert(str_contains($workbook, $sheetName), 'Missing sheet: ' . $sheetName);
$styles = $zip->getFromName('xl/styles.xml');
inventoryExportAssert(str_contains($styles, 'FFEAF7EF') && str_contains($styles, 'FFFDEEEE'), 'Entries and exits need subtle green/red styles.');
$allSheets = '';
for ($i = 1; $i <= 6; $i++) $allSheets .= $zip->getFromName('xl/worksheets/sheet' . $i . '.xml');
foreach (['SE-CMM087','FT','00123','GT','0007','Cauciuc test','Furnizor Test','Client Test'] as $value) inventoryExportAssert(str_contains($allSheets, $value), 'Traceability value missing: ' . $value);
inventoryExportAssert(!str_contains(mb_strtoupper($allSheets, 'UTF-8'), 'FIFO'), 'The internal cost formula must not be exposed in workbook labels or notes.');
inventoryExportAssert(str_contains($allSheets, 'fitToWidth="1"') && str_contains($allSheets, 'Pagina &amp;P / &amp;N'), 'Sheets must be print-ready.');
for ($i = 0; $i < $zip->numFiles; $i++) {
    $name = $zip->getNameIndex($i);
    if (str_ends_with($name, '.xml') || str_ends_with($name, '.rels')) inventoryExportAssert((new DOMDocument())->loadXML($zip->getFromIndex($i)), 'Invalid OOXML part: ' . $name);
}
$zip->close(); unlink($path);

inventoryExportAssert(GtrotsInventoryExport::download($db, [])['movement_count'] === 3, 'All-period export must include the complete ledger.');
foreach ([['2026-02-30','2026-03-01'],['','2026-09-05'],['2026-09-05','2026-09-01'],['x','y']] as [$from,$to]) {
    try { GtrotsInventoryExport::range($from,$to); throw new RuntimeException('Invalid date range accepted.'); }
    catch (InvalidArgumentException $expected) {}
}

if (!empty($argv[1])) file_put_contents($argv[1], $bytes);
echo "Inventory export tests passed: accounting snapshot, movement traceability, print settings and six-sheet workbook.\n";
