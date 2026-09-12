<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$measurement = file_get_contents($root . '/website/google-measurement.js');
$footer = file_get_contents($root . '/website/legal-footer.js');
$consent = file_get_contents($root . '/website/cookie-consent.js');
$status = file_get_contents($root . '/website/checkout-status.js');
$productTemplate = file_get_contents($root . '/website/produs.html');
$productGenerator = file_get_contents($root . '/scripts/generate-product-seo-pages.mjs');
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
$assert(str_contains($productTemplate, 'legal-footer.js?v=20260912-payment-outcomes-v1'), 'șablonul produselor viitoare nu încarcă versiunea actuală de măsurare');
$assert(str_contains($productGenerator, 'gt-product-bootstrap') && str_contains($productGenerator, 'legal-footer.js?v=20260912-payment-outcomes-v1'), 'generatorul produselor nu păstrează datele produsului și măsurarea globală actuală');
$assert(str_contains($measurement, 'G-6EWM36QSDY'), 'ID-ul GA4 lipsește');
$assert(str_contains($measurement, 'GTM-K2N32ZFD'), 'ID-ul GTM lipsește');
$assert(str_contains($measurement, 'send_to: MEASUREMENT_ID'), 'evenimentele nu au destinația GA4 explicită');
$assert(str_contains($measurement, 'send_page_view: false'), 'configurarea directă GA4 ar putea dubla page_view');
foreach ([
    'view_item_list', 'select_item', 'view_item', 'add_to_wishlist', 'remove_from_wishlist', 'add_to_cart',
    'remove_from_cart', 'view_cart', 'begin_checkout', 'add_shipping_info',
    'add_payment_info', 'purchase', 'search', 'view_search_results', 'form_start', 'form_submit',
    'login', 'sign_up', 'landing_page_view', 'phone_click', 'whatsapp_click', 'view_promotion',
    'select_promotion', 'refund', 'payment_failed', 'payment_cancelled',
] as $event) {
    $assert(str_contains($measurement, '"' . $event . '"'), "evenimentul {$event} lipsește");
}
$assert(str_contains($measurement, 'transaction_id'), 'purchase nu are transaction_id');
$assert(str_contains($measurement, 'payment_type'), 'purchase nu transmite metoda de plată');
$assert(str_contains($measurement, 'item_brand') && str_contains($measurement, 'item_category') && str_contains($measurement, 'item_variant'), 'Produsele măsurate nu păstrează brandul, categoria și SKU-ul.');
$assert(str_contains($measurement, 'const merchandiseValue = ecommerceValue(items)') && str_contains($measurement, 'order_total: finite(state.total)'), 'Valoarea purchase nu separă venitul din produse de totalul plătit.');
$assert(str_contains($measurement, 'traffic_source') && str_contains($measurement, 'traffic_medium') && str_contains($measurement, 'traffic_channel'), 'Atribuirea paid/organic/direct/referral este incompletă.');
$assert(str_contains($measurement, 'gclid') && str_contains($measurement, 'gbraid') && str_contains($measurement, 'wbraid'), 'Identificatorii Google Ads nu sunt păstrați în atribuirea sesiunii.');
$assert(str_contains($measurement, '...currentAttribution()'), 'Purchase și contactele nu includ atribuirea sesiunii.');
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
$assert(str_contains($measurement, 'PAYMENT_OUTCOMES_KEY') && str_contains($measurement, 'trackPaymentOutcome'), 'Rezultatele plății nu au deduplicare și funcție dedicată.');
$assert(str_contains($status, 'g-trots:payment-outcome-ready') && str_contains($status, 'GTrotsPendingPaymentOutcome'), 'Pagina de eșec nu publică rezultatul plății inclusiv când Google se încarcă târziu.');
$assert(str_contains($status, 'status === "cancelled" ? "payment_cancelled" : "payment_failed"'), 'Anularea și eșecul plății nu sunt măsurate separat.');
$assert(str_contains($status, 'stripeCheckoutStatus') && str_contains($status, 'payment_status') && str_contains($status, 'status === "paid"'), 'Purchase cu cardul nu este condiționat de confirmarea Stripe.');
$assert(str_contains($checkout, 'sku: String(product.sku') && str_contains($status, 'sku: String(item.sku'), 'SKU-ul nu este păstrat până la purchase.');

echo "google_measurement_contract_test: OK\n";
