<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$checkout = (string)file_get_contents($root . '/website/checkout.js');
$status = (string)file_get_contents($root . '/website/checkout-status.js');
$successPage = (string)file_get_contents($root . '/website/plata-finalizata.html');
$stripe = (string)file_get_contents($root . '/shop-api/stripe.php');
$api = (string)file_get_contents($root . '/shop-api/api.php');
$emails = (string)file_get_contents($root . '/shop-api/order-emails.php');
$generator = (string)file_get_contents($root . '/scripts/generate-product-seo-pages.mjs');
$privacy = (string)file_get_contents($root . '/website/politica-de-confidentialitate.html');

$assert = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
};

$assert(str_contains($status, 'GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID = 5849183182'), 'Lipsește ID-ul Merchant Center pentru Google Customer Reviews.');
foreach (['merchant_id', 'order_id', 'email', 'delivery_country', 'estimated_delivery_date'] as $field) {
    $assert(str_contains($status, $field), "Câmpul obligatoriu {$field} lipsește din integrarea Google Customer Reviews.");
}
$assert(str_contains($status, 'products: gtins.map(gtin => ({ gtin }))'), 'Produsele nu sunt asociate cu chestionarul prin GTIN.');
$assert(str_contains($status, 'apis.google.com/js/platform.js?onload=renderGTrotsGoogleCustomerReviews'), 'Modulul oficial Google Customer Reviews nu este încărcat.');
$assert(str_contains($status, 'status === "paid" || status === "cod"'), 'Invitația trebuie afișată numai după o comandă finalizată cu succes.');
$assert(str_contains($checkout, 'gtin: String(product.gtin || product.ean') && str_contains($status, 'gtin: String(item.gtin || item.ean'), 'GTIN-ul nu este păstrat complet de la catalog până la confirmarea comenzii.');
$assert(str_contains($checkout, 'estimatedDeliveryDate') && str_contains($checkout, ': 7)'), 'Checkout-ul trebuie să calculeze o dată estimată de livrare inclusiv când eticheta curierului nu are un număr.');
$assert(str_contains($stripe, "'estimatedDeliveryDate' => \$estimatedDeliveryDate") && str_contains($stripe, "'customerEmail' =>"), 'Confirmarea Stripe nu livrează datele necesare invitației Google.');
$assert(str_contains($successPage, 'checkout-status.js?v=20260912-google-reviews-v1'), 'Pagina de succes nu folosește versiunea nouă a integrării.');

$assert(!str_contains($api, "unset(\$item['product_slug'])"), 'Slugul produsului este eliminat înainte de construirea invitației la recenzie.');
$assert(substr_count($api, 'shopProductSeoSync($db, $config') >= 3, 'Crearea, răspunsul și ștergerea unei recenzii trebuie să regenereze pagina server-side.');
$assert(str_contains($emails, "if (\$status === 'completed')") && str_contains($emails, '/#recenzii'), 'E-mailul comenzii livrate nu invită clientul să evalueze produsele cumpărate.');
$assert(str_contains($generator, 'async function loadPublicReviews(products)') && str_contains($generator, 'productSchema.aggregateRating') && str_contains($generator, 'productSchema.review = structuredReviews'), 'Generatorul complet de catalog trebuie să păstreze recenziile și schema lor la redeploy.');
$assert(str_contains($privacy, 'Google Customer Reviews') && str_contains($privacy, 'GTIN-urile produselor'), 'Politica de confidențialitate nu descrie integrarea de recenzii Google.');

echo "google_customer_reviews_contract_test: OK\n";
