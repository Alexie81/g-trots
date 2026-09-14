<?php
declare(strict_types=1);

require_once __DIR__ . '/../order-emails.php';
require_once __DIR__ . '/../order-admin-notifications.php';

function adminNotificationAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$config = [
    'public_base_url' => 'https://g-trots.ro/shop-api',
    'order_email_logo_url' => 'https://g-trots.ro/assets/logo.png',
    'admin_order_notification_recipient' => 'comenzi@g-trots.ro',
    'admin_order_smtp_host' => 'mail.example.test',
    'admin_order_smtp_username' => 'sender@example.test',
    'admin_order_smtp_password' => 'secret',
];
$order = [
    'id' => '82e456ee-f436-4bbb-bd88-85906a33a5a2',
    'order_number' => 'GT-TEST-100',
    'created_at' => '2026-09-14 10:30:00',
    'customer_type' => 'individual',
    'customer_name' => 'Client Test',
    'customer_email' => 'client@example.test',
    'customer_phone' => '0700000000',
    'address' => 'Strada Test 1',
    'city' => 'București',
    'payment_method' => 'cash_on_delivery',
    'payment_status' => 'pending',
    'shipping_method_name' => 'Curier',
    'subtotal' => 129,
    'discount_total' => 0,
    'shipping_cost' => 20,
    'total' => 149,
    'currency' => 'RON',
    'items' => [[
        'product_name' => 'Cauciuc KuKirin G2',
        'product_sku' => 'SE-CMM087',
        'quantity' => 2,
        'unit_price' => 64.5,
        'line_total' => 129,
        'image_url' => 'https://g-trots.ro/shop-api/uploads/products/test.webp',
    ]],
];

$email = gtBuildAdminOrderNotificationEmail($order, $config, 'new_order_confirmed');
adminNotificationAssert(str_contains($email['html'], 'GT-TEST-100'), 'Numărul comenzii lipsește din e-mail.');
adminNotificationAssert(str_contains($email['html'], 'SE-CMM087') && str_contains($email['html'], '2 buc.'), 'Produsul, SKU-ul sau cantitatea lipsesc.');
adminNotificationAssert(str_contains($email['html'], 'TOTAL COMANDĂ') && str_contains($email['html'], '149,00 RON'), 'Totalul comenzii lipsește.');
adminNotificationAssert(substr_count($email['html'], '>Vezi comanda') === 1, 'E-mailul trebuie să aibă un singur buton Vezi comanda.');
adminNotificationAssert($email['open_url'] === 'https://g-trots.ro/shop-api/deschide-comanda.php?order=82e456ee-f436-4bbb-bd88-85906a33a5a2', 'Linkul unic către aplicație nu este corect.');

$smtp = gtAdminOrderNotificationSmtpConfig($config);
adminNotificationAssert($smtp['smtp_host'] === 'mail.example.test' && $smtp['smtp_username'] === 'sender@example.test', 'Contul SMTP intern nu este separat corect.');

$api = (string)file_get_contents(__DIR__ . '/../api.php');
$stripe = (string)file_get_contents(__DIR__ . '/../stripe.php');
$cancellation = (string)file_get_contents(__DIR__ . '/../order-cancellation.php');
$returns = (string)file_get_contents(__DIR__ . '/../order-return.php');
adminNotificationAssert(str_contains($api, "'new_order_confirmed'") && str_contains($stripe, "'new_order_confirmed'"), 'Notificarea nu este legată atât de ramburs, cât și de plata Stripe confirmată.');
adminNotificationAssert(str_contains($cancellation, "'cancelled_by_customer'") && str_contains($cancellation, "\$source === 'customer'"), 'Anularea clientului nu este legată de notificarea internă.');
adminNotificationAssert(str_contains($returns, "'return_requested_by_customer'") && str_contains($returns, "\$source === 'customer'"), 'Solicitarea de retur a clientului nu este legată de notificarea internă.');

echo "order_admin_notification_contract_test: OK\n";
