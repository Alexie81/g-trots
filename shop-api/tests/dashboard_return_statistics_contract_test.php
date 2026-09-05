<?php
declare(strict_types=1);

function dashboardContractAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$mobileDashboard = (string)file_get_contents($root . '/components/ShopModuleScreen.tsx');
$mobileOrders = (string)file_get_contents($root . '/components/ShopOrdersManager.tsx');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');

dashboardContractAssert(str_contains($api, 'payment_status = "paid"') && str_contains($api, 'status NOT IN ("cancelled", "return_confirmed", "refunded")') && str_contains($api, 'AS collected_revenue'), 'Dashboardul trebuie să calculeze încasările din comenzile plătite și să excludă anulările și retururile confirmate/rambursate.');
dashboardContractAssert(str_contains($api, 'WHEN invoice_type = "return" THEN ABS(total)'), 'Dashboardul trebuie să calculeze distinct valoarea facturilor de retur.');
dashboardContractAssert(str_contains($api, '$revenue = round((float)($summary[\'collected_revenue\'] ?? 0), 2);'), 'Încasările nu trebuie condiționate de emiterea unei facturi și nici diminuate a doua oară cu factura de retur.');
dashboardContractAssert(!str_contains($api, 'collected_return_deduction'), 'Rezumatul comenzilor nu trebuie să scadă din nou factura de retur dintr-o comandă deja exclusă prin status.');
dashboardContractAssert(str_contains($api, 'WHEN movement_type IN ("return", "RETURN_IN") THEN -ABS'), 'Costul FIFO al returului trebuie să inverseze costul vânzării.');
dashboardContractAssert(str_contains($api, 'WHEN operation_type = "supplier_receipt" THEN ABS(inventory_cost_total_ron)') && str_contains($api, 'WHEN operation_type = "supplier_return" THEN -ABS(inventory_cost_total_ron)'), 'Achizițiile trebuie să provină din NIR-urile furnizorului și storno-urile lor.');
dashboardContractAssert(str_contains($api, "'cost_of_goods_sold' => \$costOfGoodsSold") && str_contains($api, 'round($revenue - $costOfGoodsSold, 2)'), 'Profitul trebuie să folosească separat costul FIFO al mărfii vândute.');
dashboardContractAssert(str_contains($api, 'returns_count') && str_contains($api, 'returns_total'), 'API-ul trebuie să expună numărul și valoarea retururilor.');
dashboardContractAssert(str_contains($api, '$status === \'returned\'') && str_contains($api, 'o.status IN ("return_confirmed", "refunded")'), 'API-ul trebuie să permită filtrarea comenzilor returnate.');
dashboardContractAssert(str_contains($mobileDashboard, 'title="Încasări"') && str_contains($mobileDashboard, 'Retururi ·'), 'Dashboardul mobil trebuie să afișeze separat încasările și retururile.');
dashboardContractAssert(str_contains($mobileOrders, 'label="Returnate"'), 'Comenzile mobile trebuie să ofere filtrul Returnate.');
dashboardContractAssert(str_contains($desktop, "option('returned', 'Returnate'") && str_contains($desktop, "dashboardMetric('Încasări'") && str_contains($desktop, "dashboardMetric(`Retururi ·"), 'Desktopul trebuie să afișeze încasările, retururile și filtrul dedicat.');

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE TABLE shop_orders (status TEXT, payment_status TEXT, total NUMERIC)');
$db->exec("INSERT INTO shop_orders VALUES
    ('completed', 'paid', 100),
    ('return_requested', 'paid', 40),
    ('cancelled', 'paid', 50),
    ('return_confirmed', 'paid', 70),
    ('refunded', 'paid', 80),
    ('completed', 'pending', 90)");
$collected = (float)$db->query('SELECT COALESCE(SUM(CASE WHEN payment_status = "paid" AND status NOT IN ("cancelled", "return_confirmed", "refunded") THEN total ELSE 0 END), 0) FROM shop_orders')->fetchColumn();
dashboardContractAssert($collected === 140.0, 'Încasările trebuie să includă numai comenzile plătite eligibile, indiferent dacă au factură.');

echo "dashboard_return_statistics_contract_test: OK\n";
