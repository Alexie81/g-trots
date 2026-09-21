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
dashboardContractAssert(str_contains($api, 'acquisition_total_cost_snapshot') && str_contains($api, '$onlineOnlyCostSummary'), 'Costul produselor necontabile trebuie fixat în comandă și inclus în profit fără fluctuații ulterioare.');
dashboardContractAssert(str_contains($api, 'WHEN operation_type = "supplier_receipt" THEN ABS(grand_total_ron)') && str_contains($api, 'WHEN operation_type = "supplier_return" THEN -ABS(grand_total_ron)'), 'Achizițiile trebuie să provină din valoarea totală cu TVA a NIR-urilor furnizorului și a storno-urilor lor.');
dashboardContractAssert(str_contains($api, "'cost_of_goods_sold' => \$costOfGoodsSold") && str_contains($api, 'round($revenue - $costOfGoodsSold, 2)'), 'Profitul trebuie să folosească separat costul FIFO al mărfii vândute.');
dashboardContractAssert(str_contains($api, 'returns_count') && str_contains($api, 'returns_total'), 'API-ul trebuie să expună numărul și valoarea retururilor.');
dashboardContractAssert(str_contains($api, 'AS pending_cash') && str_contains($api, "'pending_cash' => \$pendingCash"), 'API-ul trebuie să expună rambursurile active rămase de încasat.');
dashboardContractAssert(str_contains($api, '$status === \'returned\'') && str_contains($api, 'o.status IN ("return_confirmed", "refunded")'), 'API-ul trebuie să permită filtrarea comenzilor returnate.');
dashboardContractAssert(str_contains($mobileDashboard, 'title="Încasări"') && str_contains($mobileDashboard, 'Retururi ·'), 'Dashboardul mobil trebuie să afișeze separat încasările și retururile.');
dashboardContractAssert(str_contains($mobileDashboard, 'title="De încasat"') && str_contains($mobileDashboard, "dashboardSeries.includes('pending')"), 'Dashboardul mobil trebuie să afișeze De încasat lângă retururi.');
dashboardContractAssert(str_contains($mobileOrders, 'label="Returnate"'), 'Comenzile mobile trebuie să ofere filtrul Returnate.');
dashboardContractAssert(str_contains($desktop, "option('returned', 'Returnate'") && str_contains($desktop, "dashboardMetric('Încasări'") && str_contains($desktop, "dashboardMetric(`Retururi ·"), 'Desktopul trebuie să afișeze încasările, retururile și filtrul dedicat.');
dashboardContractAssert(str_contains($desktop, "dashboardMetric('De încasat'") && str_contains($desktop, "key: 'pending'"), 'Dashboardul desktop trebuie să afișeze De încasat lângă retururi.');

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

$db->exec('CREATE TABLE shop_nir_documents (status TEXT, operation_type TEXT, inventory_cost_total_ron NUMERIC, grand_total_ron NUMERIC, confirmed_at TEXT, created_at TEXT)');
$db->exec("INSERT INTO shop_nir_documents VALUES
    ('confirmed', 'supplier_receipt', 122.32, 148.00, '2026-09-21 10:00:00', '2026-09-21 09:00:00'),
    ('confirmed', 'supplier_receipt', 50.00, 60.50, '2026-09-21 11:00:00', '2026-09-21 09:30:00'),
    ('confirmed', 'supplier_return', 10.00, 12.10, '2026-09-21 12:00:00', '2026-09-21 09:45:00'),
    ('draft', 'supplier_receipt', 500.00, 605.00, NULL, '2026-09-21 13:00:00')");
$acquisitions = (float)$db->query('SELECT COALESCE(SUM(CASE WHEN operation_type = "supplier_receipt" THEN ABS(grand_total_ron) WHEN operation_type = "supplier_return" THEN -ABS(grand_total_ron) ELSE 0 END), 0) FROM shop_nir_documents WHERE status = "confirmed"')->fetchColumn();
dashboardContractAssert($acquisitions === 196.4, 'Achizițiile trebuie să însumeze totalurile cu TVA și să scadă retururile confirmate, fără a include ciornele.');

echo "dashboard_return_statistics_contract_test: OK\n";
