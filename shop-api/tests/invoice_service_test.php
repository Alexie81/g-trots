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
    'CREATE TABLE shop_invoices (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, series TEXT NOT NULL, invoice_number TEXT NOT NULL, invoice_type TEXT NOT NULL DEFAULT "invoice", original_invoice_id TEXT, document_status TEXT NOT NULL, theme TEXT NOT NULL, issue_date TEXT NOT NULL, due_date TEXT, currency TEXT NOT NULL, total REAL NOT NULL, buyer_name TEXT NOT NULL, buyer_cui TEXT, payload_json TEXT NOT NULL, issued_by TEXT, email_sent_at TEXT, email_last_error TEXT, spv_status TEXT NOT NULL DEFAULT "not_sent", spv_sent_at TEXT, spv_submission_id TEXT, issued_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(order_id, invoice_type), UNIQUE(series, invoice_number))',
    'CREATE TABLE shop_company_settings (id INTEGER PRIMARY KEY, legal_name TEXT, trade_name TEXT, cui TEXT, registration_number TEXT, address TEXT, city TEXT, county TEXT, postal_code TEXT, country TEXT, email TEXT, phone TEXT, website TEXT, bank_name TEXT, iban TEXT, share_capital TEXT, is_default INTEGER, vat_payer INTEGER, vat_rate REAL)',
    'CREATE TABLE shop_company_receipt_locations (id TEXT PRIMARY KEY, company_id INTEGER NOT NULL, name TEXT NOT NULL, address TEXT, city TEXT, county TEXT, postal_code TEXT, is_default INTEGER, sort_order INTEGER)',
    'CREATE TABLE shop_orders (id TEXT PRIMARY KEY, order_number TEXT, status TEXT, payment_status TEXT, payment_method TEXT, currency TEXT, total REAL, shipping_cost REAL, shipping_method_name TEXT, subtotal REAL, discount_total REAL, vat_payer INTEGER, vat_rate REAL, customer_type TEXT, customer_name TEXT, customer_email TEXT, customer_phone TEXT, company_name TEXT, company_cui TEXT, company_registration_number TEXT, company_address TEXT, address TEXT, city TEXT, county TEXT, postal_code TEXT, promotion_code TEXT, promotion_scope TEXT, customer_notes TEXT, admin_notes TEXT, stripe_paid_at TEXT, stripe_payment_intent_id TEXT, customer_cancellation_reason TEXT, customer_cancelled_at TEXT, cancellation_source TEXT, cancellation_invoice_action TEXT, return_invoice_id TEXT, refund_status TEXT DEFAULT "none", refund_due_at TEXT, cancellation_email_sent_at TEXT, cancellation_email_error TEXT, return_reason TEXT, return_bank_iban TEXT, return_bank_account_holder TEXT, return_requested_at TEXT, return_request_source TEXT, return_request_email_sent_at TEXT, return_request_email_error TEXT, return_confirmed_at TEXT, return_confirmation_email_sent_at TEXT, return_confirmation_email_error TEXT, return_shipping_cost REAL, return_shipping_payer TEXT, return_refund_amount REAL, return_policy_type TEXT, return_deadline_at TEXT, return_items_gross REAL, return_delivery_refund REAL, return_is_full INTEGER, withdrawal_statement TEXT, withdrawal_submitted_at TEXT, withdrawal_confirmation_email_sent_at TEXT)',
    'CREATE TABLE shop_order_status_history (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, changed_by TEXT, customer_notified INTEGER NOT NULL DEFAULT 0, email_status TEXT NOT NULL DEFAULT "not_requested", email_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE shop_order_items (id TEXT PRIMARY KEY, order_id TEXT, product_id TEXT, product_name TEXT, product_sku TEXT, quantity INTEGER, unit_price REAL, line_total REAL, discount_total REAL, discounted_unit_price REAL, discounted_line_total REAL)',
    'CREATE TABLE shop_order_return_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, order_item_id TEXT NOT NULL, product_id TEXT, product_name TEXT NOT NULL, product_sku TEXT, requested_quantity REAL NOT NULL, decision_status TEXT NOT NULL DEFAULT "pending", accepted_quantity REAL, refused_quantity REAL NOT NULL DEFAULT 0, decision_reason TEXT, decided_at TEXT, decided_by TEXT, unit_refund_value REAL NOT NULL DEFAULT 0, line_refund_value REAL NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(order_id, order_item_id))',
    'CREATE TABLE shop_product_images (id TEXT PRIMARY KEY, product_id TEXT, image_path TEXT, sort_order INTEGER, created_at TEXT)',
    'CREATE TABLE shop_products (id TEXT PRIMARY KEY, name TEXT, sku TEXT, supplier_product_code TEXT, stock_mode TEXT, stock_quantity INTEGER, accounting_stock_quantity REAL, is_accounting_stock_tracked INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE shop_inventory_movements (id TEXT PRIMARY KEY, product_id TEXT, warehouse_id TEXT, order_id TEXT, nir_document_id TEXT, nir_line_id TEXT, sales_invoice_id TEXT, sales_invoice_line_id TEXT, movement_type TEXT, quantity_delta INTEGER, quantity_after INTEGER, accounting_quantity_delta REAL, accounting_quantity_after REAL, inventory_unit_cost_ron REAL, inventory_cost_total_ron REAL, sale_unit_price_ron REAL, sale_total_ron REAL, fifo_status TEXT, fifo_quantity_allocated REAL, fifo_quantity_pending REAL, reversal_of_movement_id TEXT, note TEXT, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE shop_nir_settings (id INTEGER PRIMARY KEY, default_warehouse_id TEXT, number_prefix TEXT NOT NULL DEFAULT "NIR", next_sequence INTEGER NOT NULL DEFAULT 1)',
    'CREATE TABLE shop_nir_documents (id TEXT PRIMARY KEY, temporary_number TEXT NOT NULL UNIQUE, nir_number TEXT UNIQUE, status TEXT NOT NULL, supplier_id TEXT, warehouse_id TEXT NOT NULL, reception_location_id TEXT, reception_location TEXT, supplier_invoice_series TEXT, supplier_invoice_number TEXT, supplier_invoice_date TEXT, nir_date TEXT NOT NULL, nir_time TEXT, reception_date TEXT NOT NULL, reception_time TEXT, currency TEXT NOT NULL, exchange_rate REAL NOT NULL, exchange_rate_date TEXT, notes TEXT, source_type TEXT NOT NULL, operation_type TEXT NOT NULL, order_id TEXT, sales_invoice_id TEXT, return_invoice_id TEXT UNIQUE, customer_name TEXT, customer_email TEXT, return_reason TEXT, external_identifier TEXT, subtotal REAL, vat_total REAL, grand_total REAL, subtotal_ron REAL, vat_total_ron REAL, grand_total_ron REAL, inventory_cost_total_ron REAL, total_difference_ron REAL, row_version INTEGER, confirmed_at TEXT, confirmed_by TEXT, created_by TEXT, updated_by TEXT, reversal_of_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE shop_nir_lines (id TEXT PRIMARY KEY, nir_document_id TEXT NOT NULL, line_number INTEGER NOT NULL, product_id TEXT, supplier_product_code TEXT, supplier_product_name TEXT NOT NULL, product_snapshot_name TEXT, sku_snapshot TEXT, purchase_unit TEXT, stock_unit TEXT, invoiced_quantity REAL, received_quantity REAL, accepted_quantity REAL, rejected_quantity REAL, conversion_factor REAL, stock_quantity REAL, unit_price REAL, discount_percent REAL, discount_value REAL, vat_rate REAL, line_net REAL, line_vat REAL, line_total REAL, line_net_ron REAL, line_vat_ron REAL, line_total_ron REAL, allocated_cost_ron REAL, inventory_unit_cost_ron REAL, inventory_cost_total_ron REAL, resolution_status TEXT, match_method TEXT, match_confidence REAL, is_stock_item INTEGER, storno_of_line_id TEXT, row_version INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE shop_inventory_cost_layers (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, warehouse_id TEXT NOT NULL, supplier_id TEXT, nir_document_id TEXT, nir_line_id TEXT, source_type TEXT, source_reference TEXT, invoice_number_snapshot TEXT, reception_date TEXT NOT NULL, confirmed_at TEXT, original_quantity REAL NOT NULL, remaining_quantity REAL NOT NULL, unit_cost_ron REAL NOT NULL, total_cost_ron REAL NOT NULL, status TEXT NOT NULL DEFAULT "open", is_reversed INTEGER NOT NULL DEFAULT 0, row_version INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE shop_inventory_layer_consumptions (id TEXT PRIMARY KEY, inventory_cost_layer_id TEXT NOT NULL, product_id TEXT NOT NULL, warehouse_id TEXT NOT NULL, source_document_type TEXT NOT NULL, source_document_id TEXT NOT NULL, source_line_id TEXT NOT NULL, quantity REAL NOT NULL, original_quantity REAL, reversed_quantity REAL NOT NULL DEFAULT 0, unit_cost_ron REAL NOT NULL, total_cost_ron REAL NOT NULL, idempotency_key TEXT NOT NULL, reversed_at TEXT, reversal_consumption_id TEXT, row_version INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(source_document_type, source_line_id, inventory_cost_layer_id), UNIQUE(idempotency_key, inventory_cost_layer_id))',
    'CREATE TABLE shop_customer_return_fifo_origins (id TEXT PRIMARY KEY, customer_return_nir_id TEXT NOT NULL, customer_return_nir_line_id TEXT NOT NULL, return_invoice_id TEXT NOT NULL, sales_invoice_id TEXT NOT NULL, sales_invoice_line_id TEXT NOT NULL, inventory_cost_layer_id TEXT NOT NULL, original_nir_document_id TEXT NOT NULL, original_nir_line_id TEXT NOT NULL, product_id TEXT NOT NULL, supplier_id TEXT, restored_quantity REAL NOT NULL, unit_cost_ron REAL NOT NULL, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(customer_return_nir_line_id, inventory_cost_layer_id))',
    'CREATE TABLE shop_customer_return_supplier_storno_allocations (id TEXT PRIMARY KEY, customer_return_origin_id TEXT NOT NULL, supplier_return_nir_id TEXT NOT NULL, supplier_return_nir_line_id TEXT NOT NULL, quantity REAL NOT NULL, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(customer_return_origin_id, supplier_return_nir_line_id))',
    'CREATE TABLE shop_spv_outbox (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL UNIQUE, document_kind TEXT NOT NULL DEFAULT "invoice", status TEXT NOT NULL DEFAULT "awaiting_configuration", attempts INTEGER NOT NULL DEFAULT 0, upload_index TEXT, download_id TEXT, sent_at TEXT, accepted_at TEXT)',
];
foreach ($schema as $sql) $db->exec($sql);

$db->exec("INSERT INTO shop_invoice_settings (id, default_theme) VALUES (1, 'purple')");
$db->exec("INSERT INTO shop_nir_settings (id, default_warehouse_id) VALUES (1, 'warehouse-main')");
$db->exec("INSERT INTO shop_company_settings (id, legal_name, trade_name, cui, registration_number, address, city, county, postal_code, country, email, phone, website, bank_name, iban, share_capital, is_default, vat_payer, vat_rate) VALUES (1, 'CAB IT EXPERT SRL', 'G-Trots', '49972605', 'J40/1/2024', 'Str. Test 1', 'Bucuresti', 'Bucuresti', '010101', 'Romania', 'contact@g-trots.ro', '0700000000', 'g-trots.ro', 'Banca Test', 'RO00TEST', '200', 1, 1, 19)");
$db->exec("INSERT INTO shop_company_receipt_locations (id, company_id, name, is_default, sort_order) VALUES ('receipt-main', 1, 'Gestiune principală', 1, 0)");

$insertOrder = $db->prepare('INSERT INTO shop_orders (id, order_number, status, payment_status, payment_method, currency, total, shipping_cost, shipping_method_name, subtotal, discount_total, vat_payer, vat_rate, customer_type, customer_name, customer_email, customer_phone, address, city, county, postal_code, customer_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$insertItem = $db->prepare('INSERT INTO shop_order_items (id, order_id, product_id, product_name, product_sku, quantity, unit_price, line_total, discounted_unit_price, discounted_line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$insertOrder->execute(['order-1', 'CMD-001', 'confirmed', 'pending', 'cash', 'RON', 119.00, 19.00, 'Curier', 100.00, 0, 1, 19, 'individual', 'Client Test', 'client@example.com', '0700111222', 'Str. Client 1', 'Bucuresti', 'Bucuresti', '010102', 'Test factura']);
$db->exec("INSERT INTO shop_products (id, name, sku, supplier_product_code, stock_mode, stock_quantity, accounting_stock_quantity) VALUES ('product-1', 'Produs test', 'GT-TEST', 'SUP-TEST', 'tracked', 10, 10)");
$db->exec("INSERT INTO shop_product_images (id, product_id, image_path, sort_order, created_at) VALUES ('image-1', 'product-1', 'uploads/products/produs-test.jpg', 0, '2026-08-01 09:00:00')");
$db->exec("INSERT INTO shop_inventory_cost_layers (id, product_id, warehouse_id, supplier_id, nir_document_id, source_type, source_reference, invoice_number_snapshot, reception_date, original_quantity, remaining_quantity, unit_cost_ron, total_cost_ron, created_at) VALUES ('layer-1-old', 'product-1', 'warehouse-main', 'supplier-a', 'nir-1', 'NIR', 'NIR-2026-000001', 'FA 001', '2026-08-01', 2, 2, 10, 20, '2026-08-01 10:00:00'), ('layer-1-new', 'product-1', 'warehouse-main', 'supplier-b', 'nir-2', 'NIR', 'NIR-2026-000002', 'FB 002', '2026-08-20', 8, 8, 20, 160, '2026-08-20 10:00:00')");
$insertItem->execute(['item-1', 'order-1', 'product-1', 'Produs test', 'GT-TEST', 4, 25.00, 100.00, 25.00, 100.00]);

$actor = ['display_name' => 'Administrator Test'];
$first = GtrotsInvoiceService::issue($db, 'order-1', $actor, []);
invoiceAssert($first['display_number'] === 'GT 001', 'Prima factura trebuie sa fie GT 001.');
invoiceAssert($first['theme'] === 'purple', 'Factura trebuie sa fixeze tema activa mov.');
invoiceAssert($first['status'] === 'unpaid', 'Comanda neplatita trebuie sa emita factura neplatita.');

$db->exec("UPDATE shop_orders SET customer_name='CLIENT CORECTAT', customer_email='corectat@example.com', customer_phone='0799999999', address='Str. Client Corectată 9', city='Mizil', county='Prahova', postal_code='105800' WHERE id='order-1'");
$db->beginTransaction();
$buyerRefreshed = GtrotsInvoiceService::refreshUnsentPayloadForOrder($db, 'order-1');
$db->commit();
$refreshedPayload = json_decode((string)$db->query("SELECT payload_json FROM shop_invoices WHERE id='" . $first['id'] . "'")->fetchColumn(), true);
invoiceAssert($buyerRefreshed, 'Factura netrimisă trebuie resincronizată după modificarea datelor clientului din comandă.');
invoiceAssert(($refreshedPayload['buyer']['address'] ?? '') === 'Str. Client Corectată 9', 'Factura netrimisă trebuie să preia adresa actualizată.');
invoiceAssert(($refreshedPayload['buyer']['city'] ?? '') === 'Mizil' && ($refreshedPayload['buyer']['county'] ?? '') === 'Prahova', 'Factura netrimisă trebuie să preia localitatea și județul actualizate.');
invoiceAssert(($refreshedPayload['buyer']['name'] ?? '') === 'CLIENT CORECTAT', 'Factura netrimisă trebuie să preia numele actualizat al clientului.');
invoiceAssert(($refreshedPayload['buyer']['email'] ?? '') === 'corectat@example.com' && ($refreshedPayload['buyer']['phone'] ?? '') === '0799999999', 'Factura netrimisă trebuie să preia e-mailul și telefonul actualizate ale clientului.');
$db->exec("UPDATE shop_invoices SET spv_status='processing' WHERE id='" . $first['id'] . "'");
$db->exec("UPDATE shop_orders SET city='Câmpina' WHERE id='order-1'");
invoiceAssert(!GtrotsInvoiceService::refreshUnsentPayloadForOrder($db, 'order-1'), 'Factura aflată în procesare SPV nu trebuie rescrisă.');
$protectedPayload = json_decode((string)$db->query("SELECT payload_json FROM shop_invoices WHERE id='" . $first['id'] . "'")->fetchColumn(), true);
invoiceAssert(($protectedPayload['buyer']['city'] ?? '') === 'Mizil', 'Snapshotul fiscal aflat în procesare trebuie să rămână nemodificat.');
$db->exec("UPDATE shop_invoices SET spv_status='rejected' WHERE id='" . $first['id'] . "'");
invoiceAssert(GtrotsInvoiceService::refreshUnsentPayloadForOrder($db, 'order-1'), 'Factura respinsă de ANAF trebuie să poată fi corectată înainte de retrimitere.');
$rejectedPayload = json_decode((string)$db->query("SELECT payload_json FROM shop_invoices WHERE id='" . $first['id'] . "'")->fetchColumn(), true);
invoiceAssert(($rejectedPayload['buyer']['city'] ?? '') === 'Câmpina', 'Retrimiterea trebuie să folosească UBL-ul regenerat cu datele corectate.');
$db->exec("UPDATE shop_invoices SET spv_status='not_sent' WHERE id='" . $first['id'] . "'");

GtrotsInvoiceThemeStore::update($db, 'orange', 'Test');
$insertOrder->execute(['order-2', 'CMD-002', 'completed', 'paid', 'card', 'RON', 238.00, 0, '', 238.00, 0, 1, 19, 'company', 'Client Firma', 'firma@example.com', '0700333444', 'Bd. Firma 2', 'Cluj-Napoca', 'Cluj', '400001', '']);
$db->exec("UPDATE shop_orders SET company_name='CLIENT SRL', company_cui='RO49972605', company_registration_number='J12/1/2020', company_address='Bd. Firma 2', stripe_paid_at='2026-09-03 10:30:00' WHERE id='order-2'");
$db->exec("INSERT INTO shop_products (id, name, sku, supplier_product_code, stock_mode, stock_quantity, accounting_stock_quantity) VALUES ('product-2', 'Produs platit', 'GT-PAID', 'SUP-PAID', 'tracked', 10, 10)");
$db->exec("INSERT INTO shop_inventory_cost_layers (id, product_id, warehouse_id, supplier_id, nir_document_id, source_type, source_reference, invoice_number_snapshot, reception_date, original_quantity, remaining_quantity, unit_cost_ron, total_cost_ron, created_at) VALUES ('layer-2', 'product-2', 'warehouse-main', 'supplier-c', 'nir-3', 'NIR', 'NIR-2026-000003', 'FC 003', '2026-08-25', 10, 10, 50, 500, '2026-08-25 10:00:00')");
$insertItem->execute(['item-2', 'order-2', 'product-2', 'Produs platit', 'GT-PAID', 2, 119.00, 238.00, 119.00, 238.00]);
$second = GtrotsInvoiceService::issue($db, 'order-2', $actor, []);
invoiceAssert($second['display_number'] === 'GT 002', 'A doua factura trebuie sa fie GT 002.');
invoiceAssert($second['theme'] === 'orange', 'Factura noua trebuie sa foloseasca noua tema.');
invoiceAssert($second['status'] === 'paid', 'Comanda platita trebuie sa emita factura platita.');
invoiceAssert(GtrotsInvoiceService::get($db, $first['id'])['can_delete'] === false, 'GT 001 nu trebuie să fie ștearsă după emiterea facturii GT 002.');

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
$db->exec("INSERT INTO shop_products (id, name, sku, supplier_product_code, stock_mode, stock_quantity, accounting_stock_quantity) VALUES ('product-3', 'Produs fără NIR încă', 'GT-PENDING', 'SUP-PENDING', 'tracked', 5, 0)");
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
$legacyPayload = json_decode((string)$db->query("SELECT payload_json FROM shop_invoices WHERE order_id='order-1'")->fetchColumn(), true, 512, JSON_THROW_ON_ERROR);
$legacyPayload['items'][0]['product_id'] = null;
$db->prepare("UPDATE shop_invoices SET payload_json = ? WHERE order_id='order-1'")->execute([json_encode($legacyPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)]);
$db->exec("UPDATE shop_order_items SET product_id=NULL, unit_price=110, line_total=110, discount_total=0, discounted_unit_price=110, discounted_line_total=110 WHERE id='item-1'");
$db->exec("UPDATE shop_orders SET subtotal=110, discount_total=10, promotion_code='SAVE10', promotion_scope='global' WHERE id='order-1'");
$updated = GtrotsInvoiceService::get($db, $first['id']);
invoiceAssert($updated['status'] === 'paid', 'Starea facturii trebuie sa urmareasca plata curenta a comenzii.');
invoiceAssert(($updated['payload']['items'][0]['product_id'] ?? '') === 'product-1', 'Fișa facturii trebuie să păstreze legătura către produs.');
invoiceAssert(($updated['payload']['items'][0]['image_path'] ?? '') === 'uploads/products/produs-test.jpg', 'Fișa facturii trebuie să includă imaginea poziției.');
invoiceAssert(($updated['payload']['buyer']['name'] ?? '') === 'CLIENT CORECTAT', 'Fișa facturii trebuie să includă ultima identitate salvată înainte de trimiterea în SPV.');
invoiceAssert(abs((float)($updated['payload']['items'][0]['discount_percent'] ?? 0) - 9.09090909) < 0.0001, 'Reducerea istorică trebuie reconstruită explicit pe poziția facturii.');
invoiceAssert((float)($updated['payload']['discount_total'] ?? 0) === 10.0 && ($updated['payload']['discount_code'] ?? '') === 'SAVE10', 'Fișa trebuie să includă totalul și codul reducerii aplicate.');

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
invoiceAssert(str_contains($xlsx, 'REDUCERE APLICATĂ') && str_contains($xlsx, 'SAVE10'), 'XLSX-ul trebuie să afișeze explicit reducerea și codul promoțional.');

$storageDirectory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gtrots-invoice-storage-' . bin2hex(random_bytes(5));
$storageConfig = ['website_base_url' => 'https://g-trots.ro', 'invoice_storage_dir' => $storageDirectory, 'api_key' => 'test-secret'];
$fastDetail = GtrotsInvoiceService::get($db, $first['id'], $storageConfig);
invoiceAssert(isset($fastDetail['payload']) && !is_dir($storageDirectory) && !isset($fastDetail['pdf_url']), 'Deschiderea fișei nu trebuie să genereze documente sau să blocheze interfața.');
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
$allowances = $xmlXpath->query('//cac:InvoiceLine/cac:AllowanceCharge[cbc:ChargeIndicator="false"]');
invoiceAssert($allowances !== false && $allowances->length === 1, 'Reducerea trebuie declarată explicit ca allowance la poziția UBL aferentă.');

try {
    GtrotsInvoiceService::download($db, $first['id'], 'docx');
    throw new RuntimeException('Un format necunoscut nu trebuie acceptat.');
} catch (InvalidArgumentException $expected) {
}

$return = GtrotsInvoiceService::issueReturn($db, 'order-2', 'Clientul a solicitat anularea înainte de expediere.', $actor, []);
invoiceAssert($return['display_number'] === 'GT 004', 'Factura de retur trebuie să continue numerotarea seriei normale cu GT 004.');
invoiceAssert($return['status'] === 'return' && $return['invoice_type'] === 'return', 'Documentul de corecție trebuie identificat explicit drept factură de retur.');
$returnDetail = GtrotsInvoiceService::get($db, $return['id']);
invoiceAssert($returnDetail['can_delete'] === false, 'Factura de retur nu trebuie să poată fi ștearsă cât timp comanda nu este în Retur confirmat.');
invoiceAssert(($returnDetail['payload']['related_invoice']['series'] ?? '') === 'GT' && ($returnDetail['payload']['related_invoice']['number'] ?? '') === '002', 'Returul trebuie să refere explicit factura fiscală inițială GT 002.');
invoiceAssert(($returnDetail['payload']['order_reference'] ?? '') === 'CMD-002', 'Returul trebuie să refere explicit comanda CMD-002.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-2'")->fetchColumn() === 10, 'Factura de retur trebuie să refacă stocul produsului o singură dată.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_nir_documents WHERE return_invoice_id='" . $return['id'] . "' AND source_type='customer_return' AND operation_type='customer_return'")->fetchColumn() === 1, 'Factura de retur trebuie să genereze exact un document Intrare în stoc – Retur client.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_inventory_movements WHERE sales_invoice_id='" . $return['id'] . "' AND movement_type='RETURN_IN' AND nir_document_id IS NOT NULL AND nir_line_id IS NOT NULL")->fetchColumn() === 1, 'Intrarea returului trebuie legată de documentul de stoc și de poziția sa.');
$returnAgain = GtrotsInvoiceService::issueReturn($db, 'order-2', 'Apel repetat idempotent.', $actor, []);
invoiceAssert($returnAgain['id'] === $return['id'], 'Reapelarea returului trebuie să păstreze aceeași factură.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-2'")->fetchColumn() === 10, 'Reapelarea facturii de retur nu trebuie să dubleze intrarea în stoc.');
$returnXlsx = base64_decode((string)GtrotsInvoiceService::download($db, $return['id'], 'xlsx')['content_base64'], true);
invoiceAssert(is_string($returnXlsx) && str_contains($returnXlsx, 'RETUR PENTRU FACTURA FISCALĂ EMISĂ GT 002') && str_contains($returnXlsx, 'COMANDA CMD-002'), 'XLSX-ul de retur trebuie să afișeze factura inițială și comanda.');
$returnXml = base64_decode((string)GtrotsInvoiceService::download($db, $return['id'], 'xml', ['anaf_validation_enabled' => false])['content_base64'], true);
invoiceAssert(is_string($returnXml) && str_contains($returnXml, '<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>') && str_contains($returnXml, 'BillingReference') && str_contains($returnXml, 'GT 002'), 'XML-ul de retur trebuie să fie UBL CreditNote cu BT-3=381 și să refere factura inițială.');

$orderWithDocuments = $db->query("SELECT o.*" . GtrotsInvoiceService::orderJoinColumns() . " FROM shop_orders o" . GtrotsInvoiceService::orderJoinSql('o') . " WHERE o.id='order-2'")->fetch();
invoiceAssert((GtrotsInvoiceService::orderSummary($orderWithDocuments)['display_number'] ?? '') === 'GT 002', 'Fișa comenzii trebuie să păstreze factura pozitivă.');
invoiceAssert((GtrotsInvoiceService::orderReturnSummary($orderWithDocuments)['display_number'] ?? '') === 'GT 004', 'Fișa comenzii trebuie să primească separat factura de retur.');

invoiceAssert(count(GtrotsInvoiceService::list($db)) === 4, 'Registrul trebuie să conțină facturile normale și factura de retur.');

// Retur parțial: doar produsele aprobate revin în factură, NIR și FIFO, iar
// costul direct al curierului reduce suma rambursată fără să devină cost de stoc.
$insertOrder->execute(['order-4', 'CMD-004', 'return_confirmed', 'paid', 'card', 'RON', 275.00, 25.00, 'Curier', 250.00, 0, 0, 0, 'individual', 'Client Retur Parțial', 'retur@example.com', '0700777888', 'Str. Retur 4', 'Brașov', 'Brașov', '500001', '']);
$db->exec("INSERT INTO shop_products (id, name, sku, supplier_product_code, stock_mode, stock_quantity, accounting_stock_quantity) VALUES ('product-4', 'Produs acceptat parțial', 'GT-PARTIAL', 'SUP-PARTIAL', 'tracked', 10, 10), ('product-5', 'Produs refuzat', 'GT-REFUSED', 'SUP-REFUSED', 'tracked', 10, 10)");
$db->exec("INSERT INTO shop_inventory_cost_layers (id, product_id, warehouse_id, supplier_id, nir_document_id, source_type, source_reference, invoice_number_snapshot, reception_date, original_quantity, remaining_quantity, unit_cost_ron, total_cost_ron, created_at) VALUES ('layer-4', 'product-4', 'warehouse-main', 'supplier-d', 'nir-4', 'NIR', 'NIR-2026-000004', 'FD 004', '2026-08-26', 10, 10, 30, 300, '2026-08-26 10:00:00'), ('layer-5', 'product-5', 'warehouse-main', 'supplier-e', 'nir-5', 'NIR', 'NIR-2026-000005', 'FE 005', '2026-08-27', 10, 10, 20, 200, '2026-08-27 10:00:00')");
$insertItem->execute(['item-4', 'order-4', 'product-4', 'Produs acceptat parțial', 'GT-PARTIAL', 2, 100.00, 200.00, 100.00, 200.00]);
$insertItem->execute(['item-5', 'order-4', 'product-5', 'Produs refuzat', 'GT-REFUSED', 1, 50.00, 50.00, 50.00, 50.00]);
$partialPositive = GtrotsInvoiceService::issue($db, 'order-4', $actor, []);
$db->exec("UPDATE shop_inventory_cost_layers SET nir_line_id='original-nir-line-4' WHERE id='layer-4'; UPDATE shop_inventory_cost_layers SET nir_line_id='original-nir-line-5' WHERE id='layer-5'");
invoiceAssert($partialPositive['display_number'] === 'GT 005', 'Factura pozitivă a comenzii cu retur parțial trebuie să continue seria cu GT 005.');
$db->exec("UPDATE shop_orders SET return_requested_at='2026-09-05 10:00:00', return_shipping_cost=20, return_refund_amount=80, return_items_gross=100, return_delivery_refund=0, return_is_full=0 WHERE id='order-4'");
$db->exec("INSERT INTO shop_order_return_items (id, order_id, order_item_id, product_id, product_name, product_sku, requested_quantity, decision_status, accepted_quantity, refused_quantity, decision_reason, unit_refund_value, line_refund_value) VALUES ('return-item-4', 'order-4', 'item-4', 'product-4', 'Produs acceptat parțial', 'GT-PARTIAL', 2, 'partial', 1, 1, 'A doua bucată nu mai este în starea de la vânzare.', 100, 200), ('return-item-5', 'order-4', 'item-5', 'product-5', 'Produs refuzat', 'GT-REFUSED', 1, 'refused', 0, 1, 'Produsul nu mai este în starea de la vânzare.', 50, 50)");
$partialReturn = GtrotsInvoiceService::issueReturn($db, 'order-4', 'Retur comercial aprobat numai pentru primul produs.', $actor, []);
invoiceAssert($partialReturn['display_number'] === 'GT 006' && (float)$partialReturn['total'] === -80.0, 'Factura parțială trebuie să continue seria și să corecteze exact 80 RON.');
$db->prepare("UPDATE shop_orders SET return_invoice_id=?, return_confirmed_at='2026-09-05 11:00:00' WHERE id='order-4'")->execute([$partialReturn['id']]);
$db->prepare("INSERT INTO shop_spv_outbox (id, invoice_id, document_kind, status) VALUES ('spv-partial-return', ?, 'credit_note', 'awaiting_configuration')")->execute([$partialReturn['id']]);
$partialDetail = GtrotsInvoiceService::get($db, $partialReturn['id']);
invoiceAssert($partialDetail['can_delete'] === true, 'Ultima factură de retur, încărcată doar în coada locală și netrimisă în SPV, trebuie să poată fi ștearsă.');
invoiceAssert(count((array)$partialDetail['payload']['items']) === 1, 'Factura de retur parțial trebuie să conțină exclusiv produsul acceptat.');
invoiceAssert((string)$partialDetail['payload']['items'][0]['order_item_id'] === 'item-4' && (float)$partialDetail['payload']['items'][0]['quantity'] === 1.0, 'Factura de retur trebuie să păstreze poziția și cantitatea acceptată.');
invoiceAssert((float)$partialDetail['payload']['return_shipping_cost'] === 20.0 && (string)$partialDetail['payload']['return_scope'] === 'partial', 'Costul returului și caracterul parțial trebuie păstrate în documentul fiscal.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-4'")->fetchColumn() === 9, 'Doar unitatea aprobată trebuie reintrodusă în stoc.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-5'")->fetchColumn() === 9, 'Produsul refuzat nu trebuie reintrodus în stoc.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_nir_lines l INNER JOIN shop_nir_documents d ON d.id=l.nir_document_id WHERE d.return_invoice_id='" . $partialReturn['id'] . "'")->fetchColumn() === 1, 'NIR-ul returului parțial trebuie să conțină o singură poziție acceptată.');
invoiceAssert((float)$db->query("SELECT inventory_cost_total_ron FROM shop_nir_documents WHERE return_invoice_id='" . $partialReturn['id'] . "'")->fetchColumn() === 30.0, 'NIR-ul trebuie să readucă produsul la costul FIFO original de 30 RON, nu la prețul de vânzare.');
invoiceAssert((float)$db->query("SELECT remaining_quantity FROM shop_inventory_cost_layers WHERE id='layer-4'")->fetchColumn() === 9.0, 'Returul parțial trebuie să refacă exact o unitate în lotul FIFO original.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_customer_return_fifo_origins WHERE sales_invoice_line_id='item-4' AND original_nir_document_id='nir-4' AND original_nir_line_id='original-nir-line-4' AND restored_quantity=1")->fetchColumn() === 1, 'NIR-ul de retur trebuie să țină minte permanent lotul și linia NIR originală pentru cantitatea acceptată.');
$partialConsumption = $db->query("SELECT quantity, original_quantity, reversed_quantity, reversed_at FROM shop_inventory_layer_consumptions WHERE source_document_type='SALES_INVOICE' AND source_document_id='" . $partialPositive['id'] . "' AND source_line_id='item-4'")->fetch();
invoiceAssert((float)$partialConsumption['quantity'] === 1.0 && (float)$partialConsumption['original_quantity'] === 2.0 && (float)$partialConsumption['reversed_quantity'] === 1.0 && $partialConsumption['reversed_at'] === null, 'Trasabilitatea FIFO trebuie să păstreze consumul rămas și cantitatea deja inversată.');
$partialXml = base64_decode((string)GtrotsInvoiceService::download($db, $partialReturn['id'], 'xml', ['anaf_validation_enabled' => false])['content_base64'], true);
$partialDocument = new DOMDocument();
invoiceAssert(is_string($partialXml) && $partialDocument->loadXML($partialXml), 'XML-ul returului parțial trebuie să fie valid sintactic.');
$partialXpath = new DOMXPath($partialDocument);
$partialXpath->registerNamespace('cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2');
$partialXpath->registerNamespace('cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2');
invoiceAssert($partialXpath->query('//cac:CreditNoteLine')->length === 1, 'UBL-ul trebuie să conțină exclusiv linia acceptată.');
invoiceAssert((string)$partialXpath->evaluate('string(//cac:AllowanceCharge[cbc:ChargeIndicator="false"]/cbc:Amount)') === '20.00', 'UBL-ul trebuie să declare costul direct al returului ca ajustare de 20 RON.');
invoiceAssert((string)$partialXpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:PayableAmount)') === '80.00', 'Totalul plătibil al facturii de retur trebuie să fie exact 80 RON.');
$partialXlsx = base64_decode((string)GtrotsInvoiceService::download($db, $partialReturn['id'], 'xlsx')['content_base64'], true);
invoiceAssert(is_string($partialXlsx) && str_contains($partialXlsx, 'Produs acceptat parțial') && !str_contains($partialXlsx, 'Produs refuzat'), 'Excel-ul facturii de retur trebuie să conțină numai produsul acceptat.');
invoiceAssert(str_contains($partialXlsx, 'COST DIRECT RETUR CURIER') && str_contains($partialXlsx, '20.00'), 'Excel-ul trebuie să afișeze explicit costul direct al returului.');

$deletedPartialReturn = GtrotsInvoiceService::delete($db, $partialReturn['id'], [], true, $actor);
invoiceAssert($deletedPartialReturn['return_invoice_deleted'] === true && $deletedPartialReturn['nir_deleted'] === true, 'Ștergerea returului trebuie să elimine împreună factura și NIR-ul automat.');
invoiceAssert((string)$deletedPartialReturn['restored_order_status'] === 'completed', 'Comanda trebuie readusă la Livrată în aceeași tranzacție.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_invoices WHERE id='" . $partialReturn['id'] . "'")->fetchColumn() === 0, 'Factura de retur trebuie eliminată din registru.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_nir_documents WHERE return_invoice_id='" . $partialReturn['id'] . "'")->fetchColumn() === 0, 'NIR-ul de retur trebuie eliminat din registru.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_inventory_movements WHERE sales_invoice_id='" . $partialReturn['id'] . "'")->fetchColumn() === 0, 'Mișcarea RETURN_IN a facturii șterse trebuie eliminată.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_customer_return_fifo_origins WHERE return_invoice_id='" . $partialReturn['id'] . "'")->fetchColumn() === 0, 'Legăturile FIFO ale returului șters trebuie eliminate.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-4'")->fetchColumn() === 8, 'Rectificarea trebuie să retragă din stoc unitatea readusă prin retur.');
invoiceAssert((float)$db->query("SELECT accounting_stock_quantity FROM shop_products WHERE id='product-4'")->fetchColumn() === 8.0, 'Rectificarea trebuie să retragă și stocul contabil readus prin retur.');
invoiceAssert((float)$db->query("SELECT remaining_quantity FROM shop_inventory_cost_layers WHERE id='layer-4'")->fetchColumn() === 8.0, 'Lotul FIFO inițial trebuie să revină la cantitatea rămasă înaintea returului.');
$restoredConsumption = $db->query("SELECT quantity, reversed_quantity, reversed_at, reversal_consumption_id FROM shop_inventory_layer_consumptions WHERE source_document_type='SALES_INVOICE' AND source_document_id='" . $partialPositive['id'] . "' AND source_line_id='item-4'")->fetch();
invoiceAssert((float)$restoredConsumption['quantity'] === 2.0 && (float)$restoredConsumption['reversed_quantity'] === 0.0 && $restoredConsumption['reversed_at'] === null && $restoredConsumption['reversal_consumption_id'] === null, 'Consumul FIFO al facturii pozitive trebuie restaurat integral.');
invoiceAssert((string)$db->query("SELECT status FROM shop_orders WHERE id='order-4'")->fetchColumn() === 'completed', 'Statusul comenzii trebuie să fie Livrată după ștergerea returului.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_order_return_items WHERE order_id='order-4'")->fetchColumn() === 0, 'Datele returului anulat nu trebuie să rămână active pe comandă.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_order_status_history WHERE order_id='order-4' AND from_status='return_confirmed' AND to_status='completed' AND email_status='pending'")->fetchColumn() === 1, 'Revenirea la Livrată trebuie jurnalizată pentru trimiterea e-mailului automat.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_spv_outbox WHERE invoice_id='" . $partialReturn['id'] . "'")->fetchColumn() === 0, 'Intrarea locală netrimisă din coada SPV trebuie eliminată odată cu factura.');
invoiceAssert((int)$db->query('SELECT next_sequence FROM shop_nir_settings WHERE id=1')->fetchColumn() === 2, 'Numărul NIR-ului automat eliminat trebuie eliberat dacă era ultimul din secvență.');

// Excluderea din Stocuri Conta nu are voie să blocheze facturarea sau SPV.
// Stocul online urmărit continuă să scadă, fără mișcare contabilă/FIFO.
$insertOrder->execute(['order-5', 'CMD-005', 'return_confirmed', 'paid', 'card', 'RON', 80.00, 0, '', 80.00, 0, 0, 0, 'individual', 'Client produs necontabil', 'client5@example.com', '0700999000', 'Str. Client 5', 'București', 'București', '010105', '']);
$db->exec("INSERT INTO shop_products (id, name, sku, supplier_product_code, stock_mode, stock_quantity, accounting_stock_quantity, is_accounting_stock_tracked) VALUES ('product-6', 'Serviciu cu stoc online', 'GT-ONLINE', 'SUP-ONLINE', 'tracked', 5, 0, 0)");
$insertItem->execute(['item-6', 'order-5', 'product-6', 'Serviciu cu stoc online', 'GT-ONLINE', 2, 40.00, 80.00, 40.00, 80.00]);
$onlineOnlyInvoice = GtrotsInvoiceService::issue($db, 'order-5', $actor, []);
invoiceAssert($onlineOnlyInvoice['display_number'] === 'GT 006', 'Numărul fiscal eliberat trebuie reutilizat de următoarea factură.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-6'")->fetchColumn() === 3, 'Factura trebuie să scadă stocul online al produsului necontabil.');
invoiceAssert((float)$db->query("SELECT accounting_stock_quantity FROM shop_products WHERE id='product-6'")->fetchColumn() === 0.0, 'Factura nu trebuie să modifice stocul contabil al produsului exclus.');
$onlineOnlyMovement = $db->query("SELECT accounting_quantity_delta, fifo_status FROM shop_inventory_movements WHERE sales_invoice_id='" . $onlineOnlyInvoice['id'] . "'")->fetch();
invoiceAssert((float)$onlineOnlyMovement['accounting_quantity_delta'] === 0.0 && (string)$onlineOnlyMovement['fifo_status'] === 'not_tracked', 'Ieșirea online trebuie marcată fără impact contabil și fără FIFO.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_inventory_layer_consumptions WHERE source_document_id='" . $onlineOnlyInvoice['id'] . "'")->fetchColumn() === 0, 'Produsul exclus din Stocuri Conta nu trebuie să consume loturi FIFO.');

$db->exec("UPDATE shop_orders SET return_requested_at='2026-09-05 12:00:00', return_refund_amount=40, return_items_gross=40, return_delivery_refund=0, return_is_full=0 WHERE id='order-5'");
$db->exec("INSERT INTO shop_order_return_items (id, order_id, order_item_id, product_id, product_name, product_sku, requested_quantity, decision_status, accepted_quantity, unit_refund_value, line_refund_value) VALUES ('return-item-6', 'order-5', 'item-6', 'product-6', 'Serviciu cu stoc online', 'GT-ONLINE', 1, 'accepted', 1, 40, 40)");
$onlineOnlyReturn = GtrotsInvoiceService::issueReturn($db, 'order-5', 'Retur parțial produs exclus din Stocuri Conta.', $actor, []);
invoiceAssert($onlineOnlyReturn['display_number'] === 'GT 007', 'Factura de retur pentru produsul necontabil trebuie emisă normal.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-6'")->fetchColumn() === 4, 'Returul acceptat trebuie să refacă stocul online.');
invoiceAssert((float)$db->query("SELECT accounting_stock_quantity FROM shop_products WHERE id='product-6'")->fetchColumn() === 0.0, 'Returul nu trebuie să creeze stoc contabil pentru produsul exclus.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_nir_documents WHERE return_invoice_id='" . $onlineOnlyReturn['id'] . "'")->fetchColumn() === 0, 'Returul format exclusiv din produse necontabile nu trebuie să creeze NIR.');
$onlineOnlyReturnMovement = $db->query("SELECT nir_document_id, accounting_quantity_delta, inventory_cost_total_ron, fifo_status FROM shop_inventory_movements WHERE sales_invoice_id='" . $onlineOnlyReturn['id'] . "' AND movement_type='RETURN_IN'")->fetch();
invoiceAssert($onlineOnlyReturnMovement && $onlineOnlyReturnMovement['nir_document_id'] === null, 'Refacerea stocului online trebuie urmărită fără document NIR.');
invoiceAssert((float)$onlineOnlyReturnMovement['accounting_quantity_delta'] === 0.0 && $onlineOnlyReturnMovement['inventory_cost_total_ron'] === null && (string)$onlineOnlyReturnMovement['fifo_status'] === 'not_tracked', 'Returul produsului necontabil nu trebuie să inventeze stoc sau cost contabil.');
$db->prepare("UPDATE shop_orders SET return_invoice_id=?, return_confirmed_at='2026-09-05 13:00:00' WHERE id='order-5'")->execute([$onlineOnlyReturn['id']]);
$db->prepare("INSERT INTO shop_spv_outbox (id, invoice_id, document_kind, status, attempts, upload_index) VALUES ('spv-online-return', ?, 'credit_note', 'rejected', 1, 'anaf-upload-test')")->execute([$onlineOnlyReturn['id']]);
$db->prepare("UPDATE shop_invoices SET spv_status='rejected' WHERE id=?")->execute([$onlineOnlyReturn['id']]);
invoiceAssert(GtrotsInvoiceService::get($db, $onlineOnlyReturn['id'])['can_delete'] === false, 'O factură de retur încărcată deja în SPV trebuie să rămână protejată chiar dacă a fost respinsă.');
try {
    GtrotsInvoiceService::delete($db, $onlineOnlyReturn['id'], [], true, $actor);
    throw new RuntimeException('Factura de retur intrată în SPV nu trebuie să poată fi ștearsă.');
} catch (InvalidArgumentException $expected) {
}
$db->prepare("UPDATE shop_invoices SET spv_status='not_sent' WHERE id=?")->execute([$onlineOnlyReturn['id']]);
$db->prepare("UPDATE shop_spv_outbox SET status='awaiting_configuration', attempts=0, upload_index=NULL WHERE invoice_id=?")->execute([$onlineOnlyReturn['id']]);
$onlineOnlyDeleted = GtrotsInvoiceService::delete($db, $onlineOnlyReturn['id'], [], true, $actor);
invoiceAssert($onlineOnlyDeleted['return_invoice_deleted'] === true && $onlineOnlyDeleted['nir_deleted'] === false, 'Returul necontabil trebuie șters și fără a pretinde existența unui NIR.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-6'")->fetchColumn() === 3, 'Ștergerea returului necontabil trebuie să retragă numai refacerea stocului online.');
invoiceAssert((string)$db->query("SELECT status FROM shop_orders WHERE id='order-5'")->fetchColumn() === 'completed', 'Și comanda cu produs necontabil trebuie readusă la Livrată.');

// O factură de retur poate proveni și din anularea manuală a unei comenzi
// facturate. Dacă este ultimul document și nu a ajuns în SPV, ștergerea ei
// trebuie să inverseze anularea și să readucă inclusiv plata la starea livrată.
$insertOrder->execute(['order-6', 'CMD-006', 'completed', 'paid', 'cash', 'RON', 150.00, 0, '', 150.00, 0, 0, 0, 'individual', 'Client Anulare', 'anulare@example.com', '0700123456', 'Str. Anulare 6', 'Sibiu', 'Sibiu', '550001', '']);
$db->exec("INSERT INTO shop_products (id, name, sku, supplier_product_code, stock_mode, stock_quantity, accounting_stock_quantity) VALUES ('product-7', 'Produs comandă anulată', 'GT-CANCEL', 'SUP-CANCEL', 'tracked', 5, 5)");
$db->exec("INSERT INTO shop_inventory_cost_layers (id, product_id, warehouse_id, supplier_id, nir_document_id, nir_line_id, source_type, source_reference, invoice_number_snapshot, reception_date, original_quantity, remaining_quantity, unit_cost_ron, total_cost_ron, created_at) VALUES ('layer-7', 'product-7', 'warehouse-main', 'supplier-f', 'nir-6', 'original-nir-line-7', 'NIR', 'NIR-2026-000006', 'FF 006', '2026-08-28', 5, 5, 60, 300, '2026-08-28 10:00:00')");
$insertItem->execute(['item-7', 'order-6', 'product-7', 'Produs comandă anulată', 'GT-CANCEL', 1, 150.00, 150.00, 150.00, 150.00]);
$cancelledPositive = GtrotsInvoiceService::issue($db, 'order-6', $actor, []);
$cancelledReturn = GtrotsInvoiceService::issueReturn($db, 'order-6', 'Clientul a refuzat comanda.', $actor, []);
$db->prepare("UPDATE shop_orders SET status='cancelled', payment_status='failed', customer_cancellation_reason='Clientul a refuzat comanda.', customer_cancelled_at='2026-09-05 14:00:00', cancellation_source='staff', cancellation_invoice_action='return_invoice_created', return_invoice_id=?, refund_status='none', cancellation_email_sent_at='2026-09-05 14:01:00' WHERE id='order-6'")->execute([$cancelledReturn['id']]);
$db->prepare("INSERT INTO shop_spv_outbox (id, invoice_id, document_kind, status, attempts) VALUES ('spv-cancelled-return', ?, 'credit_note', 'scheduled', 0)")->execute([$cancelledReturn['id']]);
invoiceAssert(GtrotsInvoiceService::get($db, $cancelledReturn['id'])['can_delete'] === true, 'Ultima factură de retur care a produs anularea trebuie să afișeze acțiunea de ștergere înainte de SPV.');
$deletedCancelledReturn = GtrotsInvoiceService::delete($db, $cancelledReturn['id'], [], true, $actor);
invoiceAssert($deletedCancelledReturn['return_invoice_deleted'] === true && $deletedCancelledReturn['nir_deleted'] === true, 'Ștergerea facturii de retur a anulării trebuie să elimine și NIR-ul automat.');
$restoredCancelledOrder = $db->query("SELECT * FROM shop_orders WHERE id='order-6'")->fetch();
invoiceAssert((string)$restoredCancelledOrder['status'] === 'completed' && (string)$restoredCancelledOrder['payment_status'] === 'paid', 'Comanda anulată trebuie readusă la Livrată și Plătită.');
invoiceAssert($restoredCancelledOrder['customer_cancellation_reason'] === null && $restoredCancelledOrder['customer_cancelled_at'] === null && $restoredCancelledOrder['cancellation_source'] === null && $restoredCancelledOrder['cancellation_invoice_action'] === null, 'Datele active ale anulării trebuie curățate după ștergerea returului.');
invoiceAssert((string)$restoredCancelledOrder['refund_status'] === 'none' && $restoredCancelledOrder['refund_due_at'] === null, 'Obligația de rambursare a anulării trebuie eliminată.');
invoiceAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id='product-7'")->fetchColumn() === 4, 'Stocul readus de factura de retur anulată trebuie retras din nou.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_order_status_history WHERE order_id='order-6' AND from_status='cancelled' AND to_status='completed' AND email_status='pending'")->fetchColumn() === 1, 'Revenirea Anulată → Livrată trebuie jurnalizată pentru e-mailul automat.');
invoiceAssert((int)$db->query("SELECT COUNT(*) FROM shop_spv_outbox WHERE invoice_id='" . $cancelledReturn['id'] . "'")->fetchColumn() === 0, 'Programarea SPV locală a returului șters trebuie eliminată.');

if ((string)getenv('GTROTS_LIVE_ANAF_VALIDATE') === '1') {
    invoiceAssert((GtrotsInvoiceUbl::validateWithAnaf($xml)['stare'] ?? '') === 'ok', 'Validatorul oficial ANAF trebuie să accepte factura UBL 380.');
    invoiceAssert((GtrotsInvoiceUbl::validateWithAnaf($returnXml)['stare'] ?? '') === 'ok', 'Validatorul oficial ANAF trebuie să accepte factura de corecție UBL cu BT-3=381.');
    echo "Validatorul oficial ANAF a acceptat Invoice 380 și factura de corecție 381.\n";
}

$db->exec("UPDATE shop_orders SET status='refunded' WHERE id='order-1'");
try {
    GtrotsInvoiceService::issue($db, 'order-1', $actor, []);
    throw new RuntimeException('Emiterea trebuie refuzată pentru o comandă rambursată chiar dacă există deja o factură pozitivă.');
} catch (InvalidArgumentException $expected) {
}

echo "invoice_service_test: OK\n";
