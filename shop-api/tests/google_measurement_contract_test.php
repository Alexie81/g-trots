<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$measurement = file_get_contents($root . '/website/google-measurement.js');
$footer = file_get_contents($root . '/website/legal-footer.js');
$consent = file_get_contents($root . '/website/cookie-consent.js');
$status = file_get_contents($root . '/website/checkout-status.js');
$promotions = file_get_contents($root . '/website/promotions.js');
$checkout = file_get_contents($root . '/website/checkout.js');
$account = file_get_contents($root . '/website/cont.js');
$site = file_get_contents($root . '/website/script.js');

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "google_measurement_contract_test: {$message}\n");
        exit(1);
    }
};

$assert(str_contains($footer, 'google-measurement.js'), 'componenta globală nu este încărcată de footer');
$assert(str_contains($measurement, 'G-6EWM36QSDY'), 'ID-ul GA4 lipsește');
$assert(str_contains($measurement, 'GTM-K2N32ZFD'), 'ID-ul GTM lipsește');
$assert(str_contains($measurement, 'send_to: MEASUREMENT_ID'), 'evenimentele nu au destinația GA4 explicită');
$assert(str_contains($measurement, 'send_page_view: false'), 'configurarea directă GA4 ar putea dubla page_view');
foreach ([
    'view_item_list', 'select_item', 'view_item', 'add_to_wishlist', 'remove_from_wishlist', 'add_to_cart',
    'remove_from_cart', 'view_cart', 'begin_checkout', 'add_shipping_info',
    'add_payment_info', 'purchase', 'search', 'view_search_results', 'form_start', 'form_submit',
    'login', 'sign_up', 'click_to_call', 'click_whatsapp', 'view_promotion',
    'select_promotion', 'refund',
] as $event) {
    $assert(str_contains($measurement, '"' . $event . '"'), "evenimentul {$event} lipsește");
}
$assert(str_contains($measurement, 'transaction_id'), 'purchase nu are transaction_id');
$assert(str_contains($measurement, 'payment_type'), 'purchase nu transmite metoda de plată');
$assert(str_contains($measurement, 'tax:'), 'purchase nu transmite TVA-ul');
$assert(str_contains($measurement, 'PURCHASES_KEY'), 'purchase nu are protecție de deduplicare');
$assert(str_contains($measurement, 'ad_user_data') && str_contains($measurement, 'ad_personalization'), 'Consent Mode v2 este incomplet');
$assert(!str_contains($consent, 'googletagmanager.com/gtag/js'), 'bannerul ar încărca încă un Google tag duplicat');
$assert(str_contains($status, 'g-trots:purchase-ready'), 'pagina de confirmare nu publică evenimentul purchase');
$assert(str_contains($status, 'status === "paid" || status === "cod"'), 'purchase nu acoperă separat cardul confirmat și rambursul acceptat');
$assert(str_contains($promotions, 'g-trots:promotions-viewed'), 'bannerul nu publică view_promotion');
$assert(str_contains($checkout, 'g-trots:promotion-selected'), 'checkout-ul nu publică select_promotion');
$assert(str_contains($account, 'trackRefundedOrders'), 'contul clientului nu publică refund');
$assert(str_contains($site, '"generate_lead"'), 'formularul real de programare nu publică generate_lead');
$assert(!str_contains($measurement, 'track("generate_lead"'), 'un simplu submit de formular ar produce un lead fals');
$assert(str_contains($status, 'GTrotsPendingPurchase'), 'purchase nu este păstrat până la încărcarea componentei Google');

echo "google_measurement_contract_test: OK\n";
