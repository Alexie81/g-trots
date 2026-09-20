<?php
declare(strict_types=1);

require_once __DIR__ . '/../gomag.php';
require_once __DIR__ . '/../nir-service.php';

function hybridStockAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

hybridStockAssert(boomagOnlineStockQuantity(0, 4, 'tracked') === 4, 'Stocul fizic trebuie folosit cand Boomag este la zero.');
hybridStockAssert(boomagOnlineStockQuantity(7, 4, 'tracked') === 7, 'Stocul Boomag mai mare trebuie pastrat.');
hybridStockAssert(boomagOnlineStockQuantity(2, 9, 'tracked') === 9, 'Stocul fizic mai mare trebuie pastrat.');
hybridStockAssert(boomagOnlineStockQuantity(0, -2, 'tracked') === 0, 'Stocul contabil negativ nu poate deveni stoc online.');
hybridStockAssert(boomagOnlineStockQuantity(3, 9, 'unlimited') === 3, 'Modul nelimitat nu trebuie sa combine cantitatile interne.');

if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
    echo "boomag_physical_stock_fallback_test: SKIP (pdo_sqlite unavailable)\n";
    exit(0);
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('CREATE TABLE shop_products (
    id TEXT PRIMARY KEY,
    source_domain TEXT,
    stock_mode TEXT,
    stock_quantity INTEGER,
    supplier_stock_quantity INTEGER,
    accounting_stock_quantity REAL
)');
$insert = $db->prepare('INSERT INTO shop_products VALUES (?, ?, ?, ?, ?, ?)');
$insert->execute(['boomag-physical', 'boomag.ro', 'tracked', 0, 0, 5]);
$insert->execute(['boomag-supplier', 'boomag.ro', 'tracked', 0, 8, 3]);
$insert->execute(['boomag-unlimited', 'boomag.ro', 'unlimited', 17, 0, 5]);
$insert->execute(['manual', 'g-trots.ro', 'tracked', 2, 0, 9]);

hybridStockAssert(shopNirRefreshBoomagOnlineStock($db, 'boomag-physical') === 5, 'NIR-ul trebuie sa activeze stocul fizic Boomag.');
hybridStockAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id = 'boomag-physical'")->fetchColumn() === 5, 'Stocul online nu a fost actualizat din NIR.');
hybridStockAssert(shopNirRefreshBoomagOnlineStock($db, 'boomag-supplier') === 8, 'Cantitatea furnizorului trebuie sa ramana disponibila cand este mai mare.');
hybridStockAssert(shopNirRefreshBoomagOnlineStock($db, 'boomag-unlimited') === null, 'Modul nelimitat nu trebuie rescris de NIR.');
hybridStockAssert((int)$db->query("SELECT stock_quantity FROM shop_products WHERE id = 'boomag-unlimited'")->fetchColumn() === 17, 'NIR-ul a rescris modul nelimitat.');
hybridStockAssert(shopNirRefreshBoomagOnlineStock($db, 'manual') === null, 'Produsele manuale nu trebuie modificate de regula Boomag.');

echo "boomag_physical_stock_fallback_test: OK\n";
