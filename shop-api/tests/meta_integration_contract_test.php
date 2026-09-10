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
foreach (['ViewContent', 'Search', 'AddToWishlist', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Contact'] as $event) {
    $assert(str_contains($meta, '"' . $event . '"'), "Evenimentul Meta {$event} lipsește.");
}
$assert(str_contains($meta, 'phone_click: ["Contact"') && str_contains($meta, 'whatsapp_click: ["Contact"'), 'Clickurile de telefon și WhatsApp nu sunt mapate către Meta Contact.');
$assert(str_contains($api, "if (\$action === 'metaCatalogFeed'"), 'Feedul public Meta lipsește.');
$assert(str_contains($api, "if (\$action === 'metaConversion'"), 'Endpointul Conversions API lipsește.');
$assert(str_contains($api, "if (\$action === 'syncProductSeoCatalog'"), 'Regenerarea întregului catalog de pagini lipsește.');
$assert(str_contains($template, 'class="site-header"') && str_contains($template, 'class="shell shop-footer"'), 'Șablonul produsului nu are shell-ul global.');
$assert(!str_contains($template, 'data-product-safety') && !str_contains($storefront, "querySelector('[data-product-safety]')"), 'Secțiunea de siguranță poate reapărea din șablon sau JavaScript.');

echo "meta_integration_contract_test: OK\n";
