<?php
declare(strict_types=1);

function orderItemRemovalAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$api = file_get_contents($root . '/shop-api/api.php');
$desktop = file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$mobile = file_get_contents($root . '/components/ShopOrdersManager.tsx');
$styles = file_get_contents($root . '/electron-app/renderer/style.css');

orderItemRemovalAssert(is_string($api) && str_contains($api, 'function shopAdminRemoveOrderItems'), 'API-ul nu implementează ștergerea produselor din comandă.');
orderItemRemovalAssert(str_contains($api, "\$spvStatus === 'sent'"), 'API-ul nu blochează ștergerea după trimiterea facturii în SPV.');
orderItemRemovalAssert(str_contains($api, "\$spvStatus === 'processing'"), 'API-ul nu blochează ștergerea în timpul procesării SPV.');
orderItemRemovalAssert(str_contains($api, 'Comanda trebuie să păstreze cel puțin un produs.'), 'API-ul permite golirea integrală a comenzii.');
orderItemRemovalAssert(str_contains($api, 'GtrotsInvoiceService::reviseUnsentForOrder'), 'Factura netrimisă nu este regenerată după ștergere.');
orderItemRemovalAssert(str_contains($api, 'GtrotsShippingNoteService::reviseForOrder'), 'Avizul nu este regenerat după ștergere.');
orderItemRemovalAssert(str_contains($api, "array_key_exists('removed_item_ids', \$body)"), 'Ruta de actualizare nu acceptă produsele șterse.');
orderItemRemovalAssert(str_contains($api, 'if ($itemsChanged) {') && str_contains($api, 'gtSendOrderModifiedEmail'), 'Clientul nu primește sumarul actualizat după modificarea produselor.');

orderItemRemovalAssert(is_string($desktop) && str_contains($desktop, 'removed_item_ids:'), 'Aplicația desktop nu trimite produsele șterse către API.');
orderItemRemovalAssert(str_contains($desktop, 'removedOrderItemIds'), 'Aplicația desktop nu detectează pozițiile șterse.');
orderItemRemovalAssert(str_contains($desktop, 'Ștergi „${draft.product_name}” din comandă?'), 'Aplicația desktop nu cere confirmarea ștergerii.');
orderItemRemovalAssert(str_contains($desktop, 'Produsele nu mai pot fi adăugate sau șterse.'), 'Aplicația desktop nu explică blocarea după SPV.');
orderItemRemovalAssert(is_string($styles) && str_contains($styles, '.shop-order-item-actions > button.remove'), 'Acțiunea de ștergere nu are stil distinct în desktop.');
orderItemRemovalAssert(is_string($mobile) && str_contains($mobile, 'removed_item_ids:'), 'Aplicația mobilă nu trimite produsele șterse către API.');
orderItemRemovalAssert(str_contains($mobile, "Alert.alert('Ștergi produsul?'"), 'Aplicația mobilă nu cere confirmarea ștergerii.');
orderItemRemovalAssert(str_contains($mobile, '!canAddProducts && styles.disabled'), 'Aplicația mobilă nu blochează ștergerea după SPV.');

echo "Order item removal contract tests passed.\n";
