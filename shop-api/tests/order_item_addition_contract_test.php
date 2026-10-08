<?php
declare(strict_types=1);

require_once __DIR__ . '/../order-emails.php';

function orderItemAdditionAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$mobile = (string)file_get_contents($root . '/components/ShopOrdersManager.tsx');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');

orderItemAdditionAssert(str_contains($api, 'function shopAdminAddOrderItems'), 'API-ul nu implementează adăugarea produselor în comandă.');
orderItemAdditionAssert(str_contains($api, "if (\$spvStatus === 'sent')"), 'API-ul nu blochează adăugarea după trimiterea facturii în SPV.');
orderItemAdditionAssert(str_contains($api, "if (\$spvStatus === 'processing')"), 'API-ul nu blochează adăugarea în timpul transmiterii SPV.');
orderItemAdditionAssert(str_contains($api, 'GtrotsInvoiceService::reviseUnsentForOrder'), 'Factura netrimisă nu este regenerată după adăugare.');
orderItemAdditionAssert(str_contains($api, 'GtrotsShippingNoteService::reviseForOrder'), 'Avizul existent nu este regenerat după adăugare.');
orderItemAdditionAssert(str_contains($api, 'gtSendOrderModifiedEmail'), 'E-mailul automat al comenzii modificate nu este trimis.');
orderItemAdditionAssert(str_contains($mobile, 'added_items:'), 'Aplicația mobilă nu trimite produsele adăugate.');
orderItemAdditionAssert(str_contains($mobile, "!['sent', 'processing'].includes(selected.invoice.spv_status)"), 'Aplicația mobilă nu blochează butonul după SPV.');
orderItemAdditionAssert(str_contains($desktop, 'added_items:'), 'Aplicația desktop nu trimite produsele adăugate.');
orderItemAdditionAssert(str_contains($desktop, "!['sent', 'processing'].includes(order.invoice.spv_status)"), 'Aplicația desktop nu blochează butonul după SPV.');

$email = gtBuildOrderEmail([
    'order_number' => 'GT-TEST-ADD',
    'status' => 'processing',
    'payment_method' => 'cash_on_delivery',
    'customer_name' => 'CLIENT TEST',
    'customer_email' => 'client@example.test',
    'customer_phone' => '0700000000',
    'customer_type' => 'individual',
    'address' => 'Str. Test 1',
    'city' => 'București',
    'county' => 'București',
    'shipping_method_name' => 'Curier',
    'shipping_cost' => 20,
    'subtotal' => 150,
    'total' => 170,
    'currency' => 'RON',
    'created_at' => '2026-10-08 12:00:00',
    'items' => [[
        'product_name' => 'Produs adăugat',
        'product_sku' => 'SKU-ADD',
        'quantity' => 2,
        'unit_price' => 75,
        'line_total' => 150,
        'image_url' => 'https://g-trots.ro/assets/test-product.webp',
    ]],
], ['website_base_url' => 'https://g-trots.ro'], 'modified');

orderItemAdditionAssert(str_contains((string)$email['subject'], 'Comanda ta a fost modificată'), 'Subiectul e-mailului de modificare este incorect.');
orderItemAdditionAssert(str_contains((string)$email['html'], 'Produs adăugat'), 'Sumarul e-mailului nu include denumirea produsului.');
orderItemAdditionAssert(str_contains((string)$email['html'], 'SKU-ADD'), 'Sumarul e-mailului nu include codul produsului.');
orderItemAdditionAssert(str_contains((string)$email['html'], 'test-product.webp'), 'Sumarul e-mailului nu include imaginea produsului.');
orderItemAdditionAssert(str_contains((string)$email['html'], '2 ×'), 'Sumarul e-mailului nu include cantitatea produsului.');

echo "order_item_addition_contract_test: ok\n";
