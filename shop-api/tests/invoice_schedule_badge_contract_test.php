<?php
declare(strict_types=1);

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "invoice_schedule_badge_contract_test: {$message}\n");
        exit(1);
    }
};

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$spv = (string)file_get_contents($root . '/shop-api/spv-service.php');
$types = (string)file_get_contents($root . '/services/shopApi.ts');
$mobileInvoices = (string)file_get_contents($root . '/components/ShopInvoicesManager.tsx');
$mobileProducts = (string)file_get_contents($root . '/components/ShopProductsManager.tsx');
$mobileOrders = (string)file_get_contents($root . '/components/ShopOrdersManager.tsx');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$desktopStyles = (string)file_get_contents($root . '/electron-app/renderer/style.css');

$assert(str_contains($spv, 'public static function invoiceStates'), 'Serviciul SPV nu oferă citirea în lot pentru registrul facturilor.');
$assert(str_contains($api, "\$invoice['spv_job'] = \$spvStates"), 'Lista facturilor nu include starea programării SPV.');
$assert(str_contains($types, 'spv_job?: {') && str_contains($types, 'scheduled_at: string | null'), 'Contractul aplicațiilor nu descrie programarea SPV.');

foreach ([$mobileInvoices, $desktop] as $source) {
    $assert(str_contains($source, "spv_status !== 'not_sent'"), 'Badge-ul nu este ascuns după schimbarea stării facturii.');
    $assert(str_contains($source, "status !== 'scheduled'"), 'Badge-ul nu verifică existența unei programări active.');
    $assert(str_contains($source, "mode !== 'delayed'"), 'Badge-ul poate confunda trimiterea imediată cu una programată.');
    $assert(str_contains($source, 'PROGRAMAT LA'), 'Textul programării lipsește dintr-una dintre aplicații.');
}

$assert(str_contains($mobileInvoices, 'spvScheduledBadge') && str_contains($mobileInvoices, '#BFDBFE'), 'Badge-ul mobil nu are stilul albastru cerut.');
$assert(str_contains($desktopStyles, '.shop-invoice-scheduled') && str_contains($desktopStyles, '.spv-scheduled'), 'Badge-urile desktop nu au stil comun albastru.');

foreach ([$mobileInvoices, $mobileProducts, $mobileOrders, $desktop] as $source) {
    $assert(str_contains($source, 'COD PRODUS'), 'Codul produsului lipsește dintr-un context de fișă al aplicațiilor.');
}
$assert(str_contains($desktop, 'shop-product-detail-code') && str_contains($desktop, 'shop-product-detail-identity'), 'Fișa desktop nu afișează codul în antet și în conținut.');

echo "invoice_schedule_badge_contract_test: OK\n";
