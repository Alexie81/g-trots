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

dashboardContractAssert(str_contains($api, 'WHEN invoice_type = "invoice" THEN ABS(total)'), 'Dashboardul trebuie să calculeze vânzarea brută din facturile pozitive.');
dashboardContractAssert(str_contains($api, 'WHEN invoice_type = "return" THEN ABS(total)'), 'Dashboardul trebuie să calculeze distinct valoarea facturilor de retur.');
dashboardContractAssert(str_contains($api, '$revenue = round($grossRevenue - $returnsTotal, 2);'), 'Vânzarea netă trebuie să scadă o singură dată retururile din vânzarea brută.');
dashboardContractAssert(str_contains($api, 'WHEN movement_type IN ("return", "RETURN_IN") THEN -ABS'), 'Costul FIFO al returului trebuie să inverseze costul vânzării.');
dashboardContractAssert(str_contains($api, 'WHEN operation_type = "supplier_receipt" THEN ABS(inventory_cost_total_ron)') && str_contains($api, 'WHEN operation_type = "supplier_return" THEN -ABS(inventory_cost_total_ron)'), 'Achizițiile trebuie să provină din NIR-urile furnizorului și storno-urile lor.');
dashboardContractAssert(str_contains($api, "'cost_of_goods_sold' => \$costOfGoodsSold") && str_contains($api, 'round($revenue - $costOfGoodsSold, 2)'), 'Profitul trebuie să folosească separat costul FIFO al mărfii vândute.');
dashboardContractAssert(str_contains($api, 'returns_count') && str_contains($api, 'returns_total'), 'API-ul trebuie să expună numărul și valoarea retururilor.');
dashboardContractAssert(str_contains($api, '$status === \'returned\'') && str_contains($api, 'o.status IN ("return_confirmed", "refunded")'), 'API-ul trebuie să permită filtrarea comenzilor returnate.');
dashboardContractAssert(str_contains($mobileDashboard, 'Vânzări nete') && str_contains($mobileDashboard, 'Retururi ·'), 'Dashboardul mobil trebuie să afișeze separat vânzarea netă și retururile.');
dashboardContractAssert(str_contains($mobileOrders, 'label="Returnate"'), 'Comenzile mobile trebuie să ofere filtrul Returnate.');
dashboardContractAssert(str_contains($desktop, "option('returned', 'Returnate'") && str_contains($desktop, "dashboardMetric(`Retururi ·"), 'Desktopul trebuie să afișeze retururile și filtrul dedicat.');

echo "dashboard_return_statistics_contract_test: OK\n";
