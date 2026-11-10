<?php
declare(strict_types=1);

function manualReturnNirAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$invoiceService = (string)file_get_contents($root . '/shop-api/invoice-service.php');
$api = (string)file_get_contents($root . '/shop-api/api.php');
$notifications = (string)file_get_contents($root . '/shop-api/spv-service.php');
$mobileApi = (string)file_get_contents($root . '/services/shopApi.ts');
$mobileUi = (string)file_get_contents($root . '/components/ShopInvoicesManager.tsx');
$desktopApi = (string)file_get_contents($root . '/electron-app/renderer/js/shop-api.js');
$desktopUi = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');

$issueStart = strpos($invoiceService, 'public static function issueReturn(');
$issueEnd = strpos($invoiceService, 'public static function canDeleteOrderInvoice(', $issueStart ?: 0);
manualReturnNirAssert($issueStart !== false && $issueEnd !== false, 'Metoda de emitere a facturii de retur nu a fost găsită.');
$issueMethod = substr($invoiceService, $issueStart, $issueEnd - $issueStart);
manualReturnNirAssert(!str_contains($issueMethod, 'postReturnStock('), 'Emiterea facturii de retur nu trebuie să mai recepționeze automat stocul.');
manualReturnNirAssert(str_contains($invoiceService, 'public static function generateReturnNir('), 'Serviciul nu expune recepția manuală și tranzacțională a returului.');
manualReturnNirAssert(str_contains($invoiceService, "'return_receipt_pending'"), 'DTO-ul facturii nu declară starea recepției returului.');
manualReturnNirAssert(str_contains($api, "\$action === 'generateReturnNir'"), 'API-ul nu expune acțiunea de generare manuală a NIR-ului.');
manualReturnNirAssert(!str_contains($api, 'repairNirRegister20261110'), 'Ruta temporară de mentenanță nu trebuie să rămână publicată în cod.');

manualReturnNirAssert(str_contains($notifications, "'return_nir_missing'"), 'Notificarea pentru NIR-ul de retur lipsă nu este sincronizată.');
manualReturnNirAssert(str_contains($notifications, "'return-nir-missing:' . \$invoiceId . ':' . \$today"), 'Deduplificarea notificării trebuie să includă ziua curentă.');
manualReturnNirAssert(str_contains($notifications, "new DateTimeZone('Europe/Bucharest')"), 'Ziua notificării trebuie calculată în fusul orar al firmei.');

manualReturnNirAssert(str_contains($mobileApi, 'generateReturnNir:'), 'Clientul mobil/PWA nu a primit metoda API pentru NIR.');
manualReturnNirAssert(str_contains($mobileUi, 'NIR DE RECEPȚIE RETUR LIPSĂ') && str_contains($mobileUi, 'Generează NIR'), 'Fișa mobilă/PWA nu afișează acțiunea proeminentă de recepție retur.');
manualReturnNirAssert(str_contains($desktopApi, 'generateReturnNir:'), 'Clientul desktop nu a primit metoda API pentru NIR.');
manualReturnNirAssert(str_contains($desktopUi, 'data-generate-return-nir') && str_contains($desktopUi, 'NIR DE RECEPȚIE RETUR LIPSĂ'), 'Fișa desktop nu afișează acțiunea de recepție retur.');

echo "return_nir_manual_contract_test: OK\n";
