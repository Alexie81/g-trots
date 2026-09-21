<?php
declare(strict_types=1);

function orderStatusEmailAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$api = file_get_contents($root . '/shop-api/api.php');
$emails = file_get_contents($root . '/shop-api/order-emails.php');
$desktopApi = file_get_contents($root . '/electron-app/renderer/js/shop-api.js');
$desktopUi = file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$mobileApi = file_get_contents($root . '/services/shopApi.ts');
$mobileUi = file_get_contents($root . '/components/ShopOrdersManager.tsx');

foreach ([$api, $emails, $desktopApi, $desktopUi, $mobileApi, $mobileUi] as $content) {
    orderStatusEmailAssert(is_string($content), 'Un fișier necesar testului nu a putut fi citit.');
}

orderStatusEmailAssert(str_contains($api, "\$action === 'sendOrderStatusEmail'"), 'Acțiunea API pentru retrimiterea statusului curent lipsește.');
orderStatusEmailAssert(str_contains($api, 'gtSendCurrentOrderStatusEmail($order, $config)'), 'API-ul nu folosește expeditorul dedicat statusului curent.');
orderStatusEmailAssert(str_contains($emails, "'return_requested' => gtSendOrderReturnRequestEmail"), 'Retrimiterea solicitării de retur nu folosește e-mailul dedicat.');
orderStatusEmailAssert(str_contains($emails, "'return_confirmed' => gtSendOrderReturnConfirmedEmail"), 'Retrimiterea confirmării de retur nu folosește e-mailul dedicat.');
orderStatusEmailAssert(str_contains($desktopApi, 'sendOrderStatusEmail:'), 'Clientul API desktop nu expune retrimiterea statusului.');
orderStatusEmailAssert(str_contains($mobileApi, 'sendOrderStatusEmail:'), 'Clientul API mobil nu expune retrimiterea statusului.');
orderStatusEmailAssert(str_contains($desktopUi, 'shop-order-send-current-status'), 'Butonul desktop pentru statusul curent lipsește.');
orderStatusEmailAssert(str_contains($mobileUi, 'Trimite statusul curent'), 'Butonul mobil pentru statusul curent lipsește.');
orderStatusEmailAssert(str_contains($desktopUi, "notify.checked = Boolean(order.customer_email) && input.value !== order.status"), 'Notificarea desktop nu este bifată implicit la alegerea unui status nou.');
orderStatusEmailAssert(str_contains($mobileUi, "setNotifyCustomer(Boolean(selected.customer_email) && item.value !== selected.status)"), 'Notificarea mobilă nu este bifată implicit la alegerea unui status nou.');
orderStatusEmailAssert(str_contains($desktopUi, "checked = Boolean(order.customer_email)"), 'Trimiterea facturii pe e-mail nu este bifată implicit pe desktop.');
orderStatusEmailAssert(str_contains($mobileUi, 'setInvoiceSendEmail(Boolean(order.customer_email))'), 'Trimiterea facturii pe e-mail nu este bifată implicit pe mobil.');

require_once $root . '/shop-api/order-emails.php';
foreach (['new', 'processing', 'return_requested', 'return_confirmed', 'cancelled'] as $status) {
    $result = gtSendCurrentOrderStatusEmail([
        'status' => $status,
        'customer_email' => 'adresă-invalidă',
        'order_number' => 'TEST-STATUS',
    ], []);
    orderStatusEmailAssert(($result['sent'] ?? true) === false, 'Expeditorul statusului curent nu tratează sigur statusul ' . $status . '.');
    orderStatusEmailAssert(!empty($result['error']), 'Expeditorul statusului curent nu întoarce eroarea pentru statusul ' . $status . '.');
}

echo "order_status_email_resend_contract_test: OK\n";
