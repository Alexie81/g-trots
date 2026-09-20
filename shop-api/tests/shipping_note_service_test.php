<?php
declare(strict_types=1);

require_once __DIR__ . '/../shipping-note-service.php';

if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
    echo "shipping_note_service_test: SKIP (pdo_sqlite indisponibil)\n";
    exit(0);
}

function shippingNoteAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('CREATE TABLE shop_orders (
    id TEXT PRIMARY KEY, order_number TEXT NOT NULL, status TEXT NOT NULL DEFAULT "new",
    customer_type TEXT, company_name TEXT, customer_name TEXT, customer_email TEXT, customer_phone TEXT,
    address TEXT, city TEXT, county TEXT, postal_code TEXT, currency TEXT NOT NULL DEFAULT "RON"
)');
$db->exec('CREATE TABLE shop_company_settings (
    id INTEGER PRIMARY KEY, legal_name TEXT, trade_name TEXT, cui TEXT, registration_number TEXT,
    address TEXT, city TEXT, county TEXT, phone TEXT, email TEXT, is_default INTEGER DEFAULT 1
)');
$db->exec('CREATE TABLE shop_products (id TEXT PRIMARY KEY, unit_of_measure TEXT NOT NULL DEFAULT "buc")');
$db->exec('CREATE TABLE shop_product_images (id TEXT PRIMARY KEY, product_id TEXT, image_path TEXT, sort_order INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
$db->exec('CREATE TABLE shop_order_items (
    id TEXT PRIMARY KEY, order_id TEXT, product_id TEXT, product_name TEXT, product_sku TEXT,
    quantity REAL, unit_price REAL, line_total REAL, discounted_line_total REAL
)');
$db->exec('CREATE TABLE shop_shipping_note_sequences (series TEXT PRIMARY KEY, last_number INTEGER NOT NULL DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)');
$db->exec('CREATE TABLE shop_shipping_notes (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, series TEXT NOT NULL, shipping_note_number TEXT NOT NULL,
    issue_date TEXT NOT NULL, with_stamp INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT "RON",
    total REAL NOT NULL DEFAULT 0, buyer_name TEXT NOT NULL DEFAULT "", payload_json TEXT NOT NULL,
    issued_by TEXT, email_sent_at TEXT, email_last_error TEXT, issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(series, shipping_note_number)
)');

$db->exec("INSERT INTO shop_company_settings (id, legal_name, trade_name, cui, registration_number, address, city, county, phone, email) VALUES (1, 'G-Trots SRL', 'G-Trots România', 'RO123', 'J40/1/2026', 'Str. Test 1', 'București', 'București', '0700000000', 'office@example.test')");
$insertOrder = $db->prepare('INSERT INTO shop_orders (id, order_number, customer_name, customer_email, customer_phone, address, city, county, postal_code, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$insertItem = $db->prepare('INSERT INTO shop_order_items (id, order_id, product_id, product_name, product_sku, quantity, unit_price, line_total, discounted_line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
$db->exec("INSERT INTO shop_products (id, unit_of_measure) VALUES ('p1', 'set')");
$insertOrder->execute(['o1', 'GT-1001', 'Client Unu', 'unu@example.test', '0711111111', 'Str. Client 1', 'Cluj-Napoca', 'Cluj', '400001', 'RON']);
$insertOrder->execute(['o2', 'GT-1002', 'Client Doi', 'doi@example.test', '0722222222', 'Str. Client 2', 'Iași', 'Iași', '700001', 'RON']);
$insertItem->execute(['i1', 'o1', 'p1', 'Plăcuțe frână', 'PF-1', 2, 50, 100, 90]);
$insertItem->execute(['i2', 'o2', 'p1', 'Plăcuțe frână', 'PF-1', 1, 50, 50, 50]);

$prepared = GtrotsShippingNoteService::prepare($db, 'o1', []);
shippingNoteAssert($prepared['existing'] === null, 'Comanda nouă nu trebuie să aibă aviz existent.');
shippingNoteAssert($prepared['draft']['number'] === '001', 'Previzualizarea trebuie să înceapă cu 001.');
shippingNoteAssert($prepared['draft']['expedition']['loading_place'] === '-', 'Câmpurile de expediție trebuie precompletate cu minus.');
shippingNoteAssert($prepared['draft']['items'][0]['unit'] === 'set', 'U.M. trebuie preluată din produs.');
shippingNoteAssert(abs($prepared['draft']['items'][0]['unit_price'] - 45.0) < 0.001, 'Prețul unitar trebuie calculat din valoarea efectivă a comenzii.');

$first = GtrotsShippingNoteService::issue($db, 'o1', ['with_stamp' => true, 'sender_name' => 'G-Trots Romania'], ['display_name' => 'Test'], []);
shippingNoteAssert($first['display_number'] === 'AVZ 001', 'Primul aviz trebuie să fie AVZ 001.');
shippingNoteAssert($first['with_stamp'] === true, 'Varianta cu ștampilă trebuie salvată.');

$second = GtrotsShippingNoteService::issue($db, 'o2', ['with_stamp' => false], ['display_name' => 'Test'], []);
shippingNoteAssert($second['display_number'] === 'AVZ 002', 'Al doilea aviz trebuie să fie AVZ 002.');
shippingNoteAssert($second['can_delete'] === true, 'Numai ultimul aviz trebuie să fie ștergibil.');

$blocked = false;
try { GtrotsShippingNoteService::delete($db, $first['id'], []); }
catch (InvalidArgumentException $error) { $blocked = str_contains($error->getMessage(), 'ultimul aviz'); }
shippingNoteAssert($blocked, 'Ștergerea unui aviz care nu este ultimul trebuie blocată.');

$deleted = GtrotsShippingNoteService::delete($db, $second['id'], []);
shippingNoteAssert($deleted['released_number'] === 'AVZ 002', 'Ștergerea trebuie să elibereze numărul 002.');
$reissued = GtrotsShippingNoteService::issue($db, 'o2', ['with_stamp' => false], ['display_name' => 'Test'], []);
shippingNoteAssert($reissued['display_number'] === 'AVZ 002', 'Următorul aviz trebuie să refolosească numărul ultimului aviz șters.');

echo "shipping_note_service_test: OK\n";
