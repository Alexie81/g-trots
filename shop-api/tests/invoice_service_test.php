<?php
declare(strict_types=1);

require_once __DIR__ . '/../nir-domain.php';
require_once __DIR__ . '/../nir-service.php';
require_once __DIR__ . '/../invoice-service.php';

if (!function_exists('uuidV4')) {
    function uuidV4(): string {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}

function invoiceAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

$schema = [
    'CREATE TABLE shop_invoice_settings (id INTEGER PRIMARY KEY, default_theme TEXT NOT NULL, invoice_series TEXT NOT NULL DEFAULT "GT", due_days INTEGER NOT NULL DEFAULT 7, default_notes TEXT, updated_by TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE shop_invoice_theme_assignments (document_key TEXT PRIMARY KEY, document_id TEXT, invoice_series TEXT NOT NULL, invoice_number TEXT NOT NULL, theme TEXT NOT NULL, assigned_by TEXT, assigned_at TEXT DEFAULT CURRENT_TIMESTAMP, last_rendered_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(invoice_series, invoice_number))',
    'CREATE TABLE shop_invoice_sequences (series TEXT PRIMARY KEY, last_number INTEGER NOT NULL DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE shop_invoices (id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, series TEXT NOT NULL, invoice_number TEXT NOT NULL, document_status TEXT NOT NULL, theme TEXT NOT NULL, issue_date TEXT NOT NULL, due_date TEXT, currency TEXT NOT NULL, total REAL NOT NULL, buyer_name TEXT NOT NULL, buyer_cui TEXT, payload_json TEXT NOT NULL, issued_by TEXT, email_sent_at TEXT, email_last_error TEXT, spv_status TEXT NOT NULL DEFAULT "not_sent", spv_sent_at TEXT, spv_submission_id TEXT, issued_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(series, invoice_number))',
    'CREATE TABLE shop_company_settings (id INTEGER PRIMARY KEY, legal_name TEXT, trade_name TEXT, cui TEXT, registration_number TEXT, address TEXT, city TEXT, county TEXT, postal_code TEXT, country TEXT, email TEXT, phone TEXT, website TEXT, bank_name TEXT, iban TEXT, share_capital TEXT, is_default INTEGER, vat_payer INTEGER, vat_rate REAL)',
    'CREATE TABLE shop_orders (id TEXT PRIMARY KEY, order_number TEXT, status TEXT, payment_status TEXT, payment_method TEXT, currency TEXT, total REAL, shipping_cost REAL, shipping_method_name TEXT, subtotal REAL, discount_total REAL, vat_payer INTEGER, vat_rate REAL, customer_type TEXT, customer_name TEXT, customer_email TEXT, customer_phone TEXT, company_name TEXT, company_cui TEXT, company_registration_number TEXT, company_address TEXT, address TEXT, city TEXT, county TEXT, postal_code TEXT, promotion_code TEXT, customer_notes TEXT, stripe_paid_at TEXT, stripe_payment_intent_id TEXT)',
    'CREATE TABLE shop_order_items (id TEXT PRIMARY KEY, order_id TEXT, product_id TEXT, product_name TEXT, product_sku TEXT, quantity INTEGER, unit_price REAL, line_total REAL, discounted_unit_price REAL, discounted_line_total REAL)',
    'CREATE TABLE shop_product_images (id TEXT PRIMARY KEY, product_id TEXT, image_path TEXT, sort_order INTEGER, created_at TEXT)',
    'CREATE TABLE shop_products (id TEXT PRIMARY KEY, name TEXT, stock_mode TEXT, stock_quantity INTEGER, accounting_stock_quantity REAL)',
    'CREATE TABLE shop_inventory_movements (id TEXT PRIMARY KEY, product_id TEXT, warehouse_id TEXT, order_id TEXT, sales_invoice_id TEXT, sales_invoice_line_id TEXT, movement_type TEXT, quantity_delta INTEGER, quantity_after INTEGER, accounting_quantity_delta REAL, accounting_quantity_after REAL, inventory_unit_cost_ron REAL, inventory_cost_total_ron REAL, sale_unit_price_ron REAL, sale_total_ron REAL, fifo_status TEXT, fifo_quantity_allocated REAL, fifo_quantity_pending REAL, note TEXT, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE shop_nir_settings (id INTEGER PRIMARY KEY, default_warehouse_id TEXT)',
    'CREATE TABLE shop_inventory_cost_layers (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, warehouse_id TEXT NOT NULL, supplier_id TEXT, nir_document_id TEXT, source_type TEXT, source_reference TEXT, invoice_number_snapshot TEXT, reception_date TEXT NOT NULL, confirmed_at TEXT, original_quantity REAL NOT NULL, remaining_quantity REAL NOT NULL, unit_cost_ron REAL NOT NULL, total_cost_ron REAL NOT NULL, status TEXT NOT NULL DEFAULT "open", is_reversed INTEGER NOT NULL DEFAULT 0, row_version INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE shop_inventory_layer_consumptions (id TEXT PRIMARY KEY, inventory_cost_layer_id TEXT NOT NULL, product_id TEXT NOT NULL, warehouse_id TEXT NOT NULL, source_document_type TEXT NOT NULL, source_document_id TEXT NOT NULL, source_line_id TEXT NOT NULL, quantity REAL NOT NULL, unit_cost_ron REAL NOT NULL, total_cost_ron REAL NOT NULL, idempotency_key TEXT NOT NULL, reversed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(source_document_type, source_line_id, inventory_cost_layer_id), UNIQUE(idempotency_key, inventory_cost_layer_id))',
];
foreach ($schema as $sql) $db->exec($sql);

$db->exec("INSERT INTO shop_invoice_settings (id, default_theme) VALUES (1, 'purple')");
$db->exec("INSERT INTO shop_nir_settings (id, default_warehouse_id) VALUES (1, 'warehouse-main')");
$db->exec("INSERT INTO shop_company_settings (id, legal_name, trade_name, cui, registration_number, address, city, county, postal_code, country, email, phone, website, bank_name, iban, share_capital, is_default, vat_payer, vat_rate) VALUES (1, 'CAB IT EXPERT SRL', 'G-Trots', '49972605', 'J40/1/2024', 'Str. Test 1', 'Bucuresti', 'Bucuresti', '010101', 'Romania', 'contact@g-trots.ro', '0700000000', 'g-trots.ro', 'Banca Test', 'RO00TEST', '200', 1, 1, 19)");

$insertOrder = $db->prepare('INSERT INTO shop_orders (id, order_number, status, payment_status, payment_method, currency, total, shipping_cost, shipping_method_name, subtotal, discount_total, vat_payer, vat_rate, customer_type, customer_name, customer_email, customer_phone, address, city, county, postal_code, customer_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$insertItem = $db->prepare('INSERT INTO shop_order_items (id, order_id, product_id, product_name, product_sku, quantity, unit_price, line_total, discounted_unit_price, discounted_line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$insertOrder->execute(['order-1', 'CMD-001', 'confirmed', 'pending', 'cash', 'RON', 119.00, 19.00, 'Curier', 100.00, 0, 1, 19, 'individual', 'Client Test', 'client@example.com', '0700111222', 'Str. Client 1', 'Bucuresti', 'Bucuresti', '010102', 'Test factura']);
$db->exec("INSERT INTO shop_products (id, name, stock_mode, stock_quantity, accounting_stock_quantity) VALUES ('product-1', 'Produs test', 'tracked', 10, 10)");
$db->exec("INSERT INTO shop_product_images (id, product_id, image_path, sort_order, created_at) VALUES ('image-1', 'product-1', 'uploads/products/produs-test.jpg', 0, '2026-08-01 09:00:00')");
$db->exec("INSERT INTO shop_inventory_cost_layers (id, product_id, warehouse_id, supplier_id, nir_document_id, source_type, source_reference, invoice_number_snapshot, reception_date, original_quantity, remaining_quantity, unit_cost_ron, total_cost_ron, created_at) VALUES ('layer-1-old', 'product-1', 'warehouse-main', 'supplier-a', 'nir-1', 'NIR', 'NIR-2026-000001', 'FA 001', '2026-08-01', 2, 2, 10, 20, '2026-08-01 10:00:00'), ('layer-1-new', 'product-1', 'warehouse-main', 'supplier-b', 'nir-2', 'NIR', 'NIR-2026-000002', 'FB 002', '2026-08-20', 8, 8, 20, 160, '2026-08-20 10:00:00')");
$insertItem->execute(['item-1', 'order-1', 'product-1', 'Produs test', 'GT-TEST', 4, 25.00, 100.00, 25.00, 100.00]);

$actor = ['display_name' => 'Administrator Test'];
$first = GtrotsInvoiceService::issue($db, 'order-1', $actor, []);
invoiceAssert($first['display_number'] === 'GT 001', 'Prima factura trebuie sa fie GT 001.');
invoiceAssert($first['theme'] === 'purple', 'Factura trebuie sa fixeze tema activa mov.');
invoiceAssert($first['status'] === 'unpaid', 'Comanda neplatita trebuie sa emita factura neplatita.');

GtrotsInvoiceThemeStore::update($db, 'orange', 'Test');
$insertOrder->execute(['order-2', 'CMD-002', 'completed', 'paid', 'card', 'RON', 238.00, 0, '', 238.00, 0, 1, 19, 'company', 'Client Firma', 'firma@example.com', '0700333444', 'Bd. Firma 2', 'Cluj-Napoca', 'Cluj', '400001', '']);
$db->exec("UPDATE shop_orders SET company_name='CLIENT SRL', company_cui='RO123', company_registration_number='J12/1/2020', company_address='Bd. Firma 2', stripe_paid_at='2026-09-03 10:30:00' WHERE id='order-2'");
$db->exec("INSERT INTO shop_products (id, name, stock_mode, stock_quantity, accounting_stock_quantity) VALUES ('product-2', 'Produs platit', 'tracked', 10, 10)");
$db->exec("INSERT INTO shop_inventory_cost_layers (id, product_id, warehouse_id, supplier_id, nir_document_id, source_type, source_reference, invoice_number_snapshot, reception_date, original_quantity, remaining_quantity, unit_cost_ron, total_cost_ron, created_at) VALUES ('layer-2', 'product-2', 'warehouse-main', 'supplier-c', 'nir-3', 'NIR', 'NIR-2026-000003', 'FC 003', '2026-08-25', 10, 10, 50, 500, '2026-08-25 10:00:00')");
$insertItem->execute(['item-2', 'order-2', 'product-2', 'Produs platit', 'GT-PAID', 2, 119.00, 238.00, 119.00, 238.00]);
$second = GtrotsInvoiceService::issue($db, 'order-2', $actor, []);
invoiceAssert($second['display_number'] === 'GT 002', 'A doua factura trebuie sa fie GT 002.');
invoiceAssert($second['theme'] === 'orange', 'Factura noua trebuie sa foloseasca noua tema.');
invoiceAssert($second['status'] === 'paid', 'Comanda platita trebuie sa emita factura platita.');

$again = GtrotsInvoiceService::issue($db, 'order-1', $actor, []);
invoiceAssert($again['id'] === $first['id'] && $again['existing'] === true, 'Reemiterea trebuie sa returneze factura existenta.');
invoiceAssert($again['theme'] === 'purple', 'Tema facturii vechi nu trebuie schimbata.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-1'")->fetchColumn() === 6, 'Emiterea trebuie sa scada o singura data stocul produsului.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_inventory_movements WHERE order_id='order-1' AND movement_type='sale'")->fetchColumn() === 1, 'Emiterea trebuie sa creeze o singura iesire de stoc.');
invoiceAssert((float)$db->query("SELECT sale_unit_price_ron FROM shop_inventory_movements WHERE order_id='order-1'")->fetchColumn() === 25.0, 'Iesirea trebuie sa retina pretul de vanzare din factura.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_inventory_layer_consumptions WHERE source_document_type='SALES_INVOICE' AND product_id='product-1'")->fetchColumn() === 2, 'Factura trebuie sa separe consumul intre loturile FIFO folosite.');
invoiceAssert((float)$db->query("SELECT remaining_quantity FROM shop_inventory_cost_layers WHERE id='layer-1-old'")->fetchColumn() === 0.0, 'FIFO trebuie sa consume complet lotul cel mai vechi.');
invoiceAssert((float)$db->query("SELECT remaining_quantity FROM shop_inventory_cost_layers WHERE id='layer-1-new'")->fetchColumn() === 6.0, 'FIFO trebuie sa continue cu exact diferenta din lotul urmator.');
invoiceAssert((float)$db->query("SELECT inventory_cost_total_ron FROM shop_inventory_movements WHERE order_id='order-1'")->fetchColumn() === 60.0, 'Iesirea trebuie sa retina costul total FIFO din ambele loturi.');
invoiceAssert((float)$db->query("SELECT inventory_unit_cost_ron FROM shop_inventory_movements WHERE order_id='order-1'")->fetchColumn() === 15.0, 'Iesirea trebuie sa retina costul unitar mediu al loturilor FIFO efectiv consumate.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_inventory_layer_consumptions WHERE source_document_type='SALES_INVOICE'")->fetchColumn() === 3, 'Fiecare lot consumat trebuie sa aiba trasabilitate FIFO distincta.');

// Facturarea trebuie să rămână posibilă înainte de introducerea NIR-ului.
$insertOrder->execute(['order-3', 'CMD-003', 'confirmed', 'pending', 'cash', 'RON', 60.00, 0, '', 60.00, 0, 1, 19, 'individual', 'Client fără NIR', 'client3@example.com', '0700555666', 'Str. Client 3', 'Iași', 'Iași', '700001', '']);
$db->exec("INSERT INTO shop_products (id, name, stock_mode, stock_quantity, accounting_stock_quantity) VALUES ('product-3', 'Produs fără NIR încă', 'tracked', 5, 0)");
$insertItem->execute(['item-3', 'order-3', 'product-3', 'Produs fără NIR încă', 'GT-PENDING', 2, 30.00, 60.00, 30.00, 60.00]);
$third = GtrotsInvoiceService::issue($db, 'order-3', $actor, []);
invoiceAssert($third['display_number'] === 'GT 003', 'Factura fără NIR trebuie emisă normal.');
invoiceAssert($third['spv_status'] === 'not_sent' && $third['can_delete'] === true, 'Factura nouă trebuie să fie netrimisă în SPV și eligibilă pentru ștergere dacă este ultima.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-3'")->fetchColumn() === 3, 'Factura fără NIR trebuie să scadă imediat stocul disponibil.');
invoiceAssert((float)$db->query("SELECT accounting_stock_quantity FROM shop_products WHERE id='product-3'")->fetchColumn() === -2.0, 'Ieșirea contabilă rămâne temporar negativă până la recepție.');
invoiceAssert((string)$db->query("SELECT fifo_status FROM shop_inventory_movements WHERE order_id='order-3'")->fetchColumn() === 'pending', 'Ieșirea fără NIR trebuie marcată pentru reconciliere FIFO.');
invoiceAssert((float)$db->query("SELECT fifo_quantity_pending FROM shop_inventory_movements WHERE order_id='order-3'")->fetchColumn() === 2.0, 'Cantitatea FIFO lipsă trebuie păstrată exact.');

// Confirmarea ulterioară a NIR-ului completează automat furnizorul/costul lotului.
$db->beginTransaction();
$db->exec("INSERT INTO shop_inventory_cost_layers (id, product_id, warehouse_id, supplier_id, nir_document_id, source_type, source_reference, invoice_number_snapshot, reception_date, original_quantity, remaining_quantity, unit_cost_ron, total_cost_ron, created_at) VALUES ('layer-3-late', 'product-3', 'warehouse-main', 'supplier-late', 'nir-late', 'NIR', 'NIR-2026-000099', 'FL 099', '2026-09-01', 2, 2, 30, 60, '2026-09-03 12:00:00')");
$db->exec("UPDATE shop_products SET accounting_stock_quantity = accounting_stock_quantity + 2 WHERE id='product-3'");
$reconciliation = shopNirReconcilePendingInvoiceFifo($db, ['product-3']);
$db->commit();
invoiceAssert((int)$reconciliation['movements_reconciled'] === 1, 'NIR-ul ulterior trebuie să reconcilieze automat ieșirea în așteptare.');
invoiceAssert((string)$db->query("SELECT fifo_status FROM shop_inventory_movements WHERE order_id='order-3'")->fetchColumn() === 'allocated', 'Ieșirea trebuie să devină FIFO alocată după NIR.');
invoiceAssert((float)$db->query("SELECT fifo_quantity_pending FROM shop_inventory_movements WHERE order_id='order-3'")->fetchColumn() === 0.0, 'După reconciliere nu trebuie să rămână cantitate FIFO în așteptare.');
invoiceAssert((float)$db->query("SELECT inventory_cost_total_ron FROM shop_inventory_movements WHERE order_id='order-3'")->fetchColumn() === 60.0, 'Costul real trebuie completat automat din NIR-ul introdus ulterior.');
invoiceAssert((float)$db->query("SELECT remaining_quantity FROM shop_inventory_cost_layers WHERE id='layer-3-late'")->fetchColumn() === 0.0, 'Lotul introdus ulterior trebuie consumat de ieșirea FIFO mai veche.');

$markedSpv = GtrotsInvoiceService::markSpvSent($db, $second['id'], 'anaf-upload-123');
invoiceAssert($markedSpv['spv_status'] === 'sent' && $markedSpv['spv_submission_id'] === 'anaf-upload-123', 'Confirmarea transmiterii trebuie să fixeze starea SPV și identificatorul ANAF.');
try {
    GtrotsInvoiceService::delete($db, $second['id'], []);
    throw new RuntimeException('O factură trimisă în SPV nu trebuie să poată fi ștearsă.');
} catch (InvalidArgumentException $expected) {
}

$deleted = GtrotsInvoiceService::delete($db, $third['id'], []);
invoiceAssert($deleted['released_number'] === 'GT 003', 'Ștergerea trebuie să elibereze exact ultimul număr emis.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-3'")->fetchColumn() === 5, 'Ștergerea ultimei facturi trebuie să refacă stocul disponibil.');
invoiceAssert((float)$db->query("SELECT accounting_stock_quantity FROM shop_products WHERE id='product-3'")->fetchColumn() === 2.0, 'Ștergerea ultimei facturi trebuie să refacă stocul contabil recepționat ulterior.');
invoiceAssert((float)$db->query("SELECT remaining_quantity FROM shop_inventory_cost_layers WHERE id='layer-3-late'")->fetchColumn() === 2.0, 'Ștergerea trebuie să elibereze cantitatea alocată FIFO.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_inventory_movements WHERE sales_invoice_id='" . $third['id'] . "'")->fetchColumn() === 0, 'Ieșirea de stoc a facturii șterse trebuie eliminată.');
$thirdReissued = GtrotsInvoiceService::issue($db, 'order-3', $actor, []);
invoiceAssert($thirdReissued['display_number'] === 'GT 003', 'Următoarea factură trebuie să reutilizeze numărul eliberat.');

$db->exec("UPDATE shop_orders SET payment_status='paid' WHERE id='order-1'");
$updated = GtrotsInvoiceService::get($db, $first['id']);
invoiceAssert($updated['status'] === 'paid', 'Starea facturii trebuie sa urmareasca plata curenta a comenzii.');
invoiceAssert(($updated['payload']['items'][0]['product_id'] ?? '') === 'product-1', 'Fișa facturii trebuie să păstreze legătura către produs.');
invoiceAssert(($updated['payload']['items'][0]['image_path'] ?? '') === 'uploads/products/produs-test.jpg', 'Fișa facturii trebuie să includă imaginea poziției.');
invoiceAssert(($updated['payload']['buyer']['name'] ?? '') === 'Client Test', 'Fișa facturii trebuie să includă datele cumpărătorului.');

$storedPayload = json_decode((string)$db->query("SELECT payload_json FROM shop_invoices WHERE order_id='order-1'")->fetchColumn(), true, 512, JSON_THROW_ON_ERROR);
invoiceAssert(($storedPayload['seller']['phone'] ?? '') === '0700000000', 'Snapshotul trebuie sa includa telefonul firmei.');
invoiceAssert(($storedPayload['theme'] ?? '') === 'purple', 'Snapshotul trebuie sa includa tema fixata.');

$download = GtrotsInvoiceService::download($db, $first['id']);
$pdf = base64_decode((string)$download['content_base64'], true);
invoiceAssert(is_string($pdf) && str_starts_with($pdf, '%PDF-'), 'Descarcarea trebuie sa genereze un PDF valid.');

$xlsxDownload = GtrotsInvoiceService::download($db, $first['id'], 'xlsx');
$xlsx = base64_decode((string)$xlsxDownload['content_base64'], true);
invoiceAssert(is_string($xlsx) && str_starts_with($xlsx, "PK\x03\x04"), 'Descarcarea trebuie sa genereze un XLSX valid.');
invoiceAssert($xlsxDownload['mime_type'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLSX-ul trebuie livrat cu tipul corect.');
invoiceAssert(str_contains($xlsx, 'Produs test') && str_contains($xlsx, 'GT-TEST'), 'XLSX-ul trebuie sa includa denumirea si codul produsului.');
invoiceAssert(str_contains($xlsx, 'PLĂTITĂ'), 'XLSX-ul trebuie sa reflecte starea platita a comenzii.');

$storageDirectory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gtrots-invoice-storage-' . bin2hex(random_bytes(5));
$storageConfig = ['website_base_url' => 'https://g-trots.ro', 'invoice_storage_dir' => $storageDirectory, 'api_key' => 'test-secret'];
$publicLink = GtrotsInvoiceService::publicLink($db, $first['id'], $storageConfig);
invoiceAssert(str_starts_with((string)$publicLink['url'], 'https://g-trots.ro/fact/factura-gt-001-'), 'Linkul public trebuie să folosească zona /fact și un token neghicibil.');
$storedDownload = GtrotsInvoiceService::download($db, $first['id'], 'pdf', $storageConfig);
invoiceAssert(!empty($storedDownload['stored']) && is_file($storageDirectory . DIRECTORY_SEPARATOR . basename((string)$publicLink['url'])), 'PDF-ul trebuie păstrat fizic pe server și reutilizat la descărcare.');

$sampleOutput = trim((string)getenv('GTROTS_INVOICE_XLSX_OUTPUT'));
if ($sampleOutput !== '') {
    invoiceAssert(file_put_contents($sampleOutput, $xlsx) !== false, 'XLSX-ul de verificare nu a putut fi salvat.');
}

$db->exec("UPDATE shop_orders SET payment_status='pending', stripe_paid_at=NULL WHERE id='order-1'");
$updatedUnpaid = GtrotsInvoiceService::get($db, $first['id']);
invoiceAssert($updatedUnpaid['status'] === 'unpaid', 'Factura trebuie sa revina automat la neplatita cand plata comenzii este anulata.');
GtrotsInvoiceService::refreshStoredForOrder($db, 'order-1', $storageConfig);
$storedUnpaid = base64_decode((string)GtrotsInvoiceService::download($db, $first['id'], 'xlsx', $storageConfig)['content_base64'], true);
invoiceAssert(is_string($storedUnpaid) && str_contains($storedUnpaid, 'NEPLĂTITĂ'), 'Fișierul stocat trebuie regenerat automat când starea plății se schimbă.');
$xlsxUnpaid = base64_decode((string)GtrotsInvoiceService::download($db, $first['id'], 'xlsx')['content_base64'], true);
invoiceAssert(is_string($xlsxUnpaid) && str_contains($xlsxUnpaid, 'NEPLĂTITĂ'), 'XLSX-ul regenerat trebuie sa reflecte starea neplatita.');

$xmlDownload = GtrotsInvoiceService::download($db, $first['id'], 'xml', ['anaf_validation_enabled' => false]);
$xml = base64_decode((string)$xmlDownload['content_base64'], true);
invoiceAssert(is_string($xml) && str_contains($xml, GtrotsInvoiceUbl::CUSTOMIZATION_ID), 'e-Factura trebuie să fie XML UBL 2.1 pentru profilul CIUS-RO actual.');
$xmlDocument = new DOMDocument();
invoiceAssert($xmlDocument->loadXML($xml), 'e-Factura generată trebuie să fie XML valid sintactic.');
$xmlXpath = new DOMXPath($xmlDocument);
$xmlXpath->registerNamespace('cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2');
$xmlXpath->registerNamespace('cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2');
$productNames = $xmlXpath->query('//cac:InvoiceLine/cac:Item/cbc:Name');
invoiceAssert($productNames !== false && $productNames->length > 0, 'XML-ul trebuie să conțină denumirea fiecărui produs facturat.');
foreach ($productNames ?: [] as $productName) invoiceAssert(mb_strlen((string)$productName->textContent, 'UTF-8') <= 100, 'Denumirea produsului BT-153 trebuie să respecte limita RO_CIUS de 100 de caractere.');

try {
    GtrotsInvoiceService::download($db, $first['id'], 'docx');
    throw new RuntimeException('Un format necunoscut nu trebuie acceptat.');
} catch (InvalidArgumentException $expected) {
}

invoiceAssert(count(GtrotsInvoiceService::list($db)) === 3, 'Registrul trebuie sa contina toate facturile emise.');

echo "invoice_service_test: OK\n";
