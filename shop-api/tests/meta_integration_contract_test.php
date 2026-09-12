<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/meta.php';

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "meta_integration_contract_test: {$message}\n");
        exit(1);
    }
};

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$meta = (string)file_get_contents($root . '/website/meta-measurement.js');
$google = (string)file_get_contents($root . '/website/google-measurement.js');
$footer = (string)file_get_contents($root . '/website/legal-footer.js');
$template = (string)file_get_contents($root . '/website/produs.html');
$storefront = (string)file_get_contents($root . '/website/shop-live.js');

$assert(metaPixelId(['meta_pixel_id' => '1077035528384445']) === '1077035528384445', 'ID-ul Pixel valid nu este acceptat.');
$assert(!metaConversionsEnabled(['meta_pixel_id' => '1077035528384445', 'meta_conversion_access_token' => '', 'meta_conversion_api_enabled' => true]), 'CAPI nu trebuie activat fără token server-side.');
$assert(str_contains($footer, 'meta-measurement.js'), 'Meta Pixel nu este încărcat de componenta globală.');
$assert(str_contains($google, 'g-trots:analytics-event'), 'Evenimentele GA4 nu sunt oglindite către stratul Meta.');
$assert(str_contains($meta, 'eventID: id') && str_contains($meta, 'event_id: id'), 'Pixel și CAPI nu folosesc același event_id pentru deduplicare.');
$assert(str_contains($meta, 'marketingAllowed()') && str_contains($meta, 'consent", "revoke'), 'Pixelul nu respectă acordul pentru marketing.');
foreach (['ViewContent', 'Search', 'AddToWishlist', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'PaymentFailed', 'PaymentCancelled', 'Contact'] as $event) {
    $assert(str_contains($meta, '"' . $event . '"'), "Evenimentul Meta {$event} lipsește.");
}
$purchase = metaConversionEvent([
    'event_name' => 'Purchase',
    'event_id' => 'gt_purchase_contract_123',
    'event_time' => time(),
    'event_source_url' => 'https://g-trots.ro/comanda-confirmata',
    'user_data' => ['email' => 'client@example.com', 'phone' => '0762093915'],
    'custom_data' => [
        'value' => 129,
        'currency' => 'RON',
        'order_id' => 'GT-TEST-123',
        'content_ids' => ['SE-CMM087'],
        'contents' => [['id' => 'SE-CMM087', 'quantity' => 1, 'item_price' => 129]],
        'num_items' => 1,
    ],
]);
$assert($purchase['event_name'] === 'Purchase', 'Purchase nu este acceptat ca eveniment standard Meta.');
$assert(($purchase['custom_data']['value'] ?? null) === 129.0 && ($purchase['custom_data']['currency'] ?? '') === 'RON', 'Purchase pierde valoarea sau moneda.');
$assert(($purchase['custom_data']['order_id'] ?? '') === 'GT-TEST-123', 'Purchase pierde ID-ul comenzii.');
$assert(($purchase['custom_data']['content_ids'] ?? []) === ['SE-CMM087'], 'Purchase pierde ID-urile produselor.');
$assert(($purchase['custom_data']['contents'][0]['item_price'] ?? null) === 129.0, 'Purchase pierde prețul produsului.');
foreach (['PaymentFailed', 'PaymentCancelled'] as $event) {
    $normalized = metaConversionEvent([
        'event_name' => $event,
        'event_id' => 'gt_payment_contract_' . strtolower($event),
        'event_time' => time(),
        'event_source_url' => 'https://g-trots.ro/checkout',
        'custom_data' => ['currency' => 'RON', 'order_id' => 'GT-TEST-123'],
    ]);
    $assert($normalized['event_name'] === $event, "Evenimentul Meta {$event} este respins de Conversions API.");
}
$assert(str_contains($meta, 'phone_click: ["Contact"') && str_contains($meta, 'whatsapp_click: ["Contact"'), 'Clickurile de telefon și WhatsApp nu sunt mapate către Meta Contact.');
$assert(str_contains($api, "if (\$action === 'metaCatalogFeed'"), 'Feedul public Meta lipsește.');
$assert(str_contains($api, "if (\$action === 'metaConversion'"), 'Endpointul Conversions API lipsește.');
$assert(str_contains($api, "if (\$action === 'syncProductSeoCatalog'"), 'Regenerarea întregului catalog de pagini lipsește.');
$assert(str_contains($template, 'class="site-header"') && str_contains($template, 'class="shell shop-footer"'), 'Șablonul produsului nu are shell-ul global.');
$assert(!str_contains($template, 'data-product-safety') && !str_contains($storefront, "querySelector('[data-product-safety]')"), 'Secțiunea de siguranță poate reapărea din șablon sau JavaScript.');

echo "meta_integration_contract_test: OK\n";
