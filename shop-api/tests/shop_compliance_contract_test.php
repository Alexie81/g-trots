<?php
declare(strict_types=1);

function complianceCheck(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$api = file_get_contents($root . '/shop-api/api.php');
$returns = file_get_contents($root . '/shop-api/order-return.php');
$checkout = file_get_contents($root . '/website/checkout.js');
$checkoutHtml = file_get_contents($root . '/website/checkout.html');
$publicReturn = file_get_contents($root . '/website/solicita-retur.js');
$publicReturnHtml = file_get_contents($root . '/website/solicita-retur.html');
$storefront = file_get_contents($root . '/website/shop-live.js');
$footer = file_get_contents($root . '/website/legal-footer.js');
$cookies = file_get_contents($root . '/website/cookie-consent.js');

complianceCheck(is_string($api) && str_contains($api, "if (!boolValue(\$body['accept_terms'] ?? false))"), 'Backendul trebuie să refuze comenzile fără acceptarea termenilor.');
complianceCheck(str_contains($api, 'terms_accepted_at') && str_contains($api, 'return_policy_version') && str_contains($api, 'newsletter_opt_in_at'), 'Dovezile de checkout și newsletter trebuie păstrate separat.');
complianceCheck(str_contains($checkout, 'accept_terms') && str_contains($checkoutHtml, 'name="newsletter_opt_in"'), 'Checkoutul trebuie să trimită separat termenii și newsletterul.');

complianceCheck(str_contains($api, "\$orderNumber = strtoupper") && str_contains($api, "\$customerEmail = mb_strtolower"), 'Recenzia trebuie să solicite numărul comenzii și e-mailul.');
complianceCheck(str_contains($api, "o.status IN ('completed', 'return_requested', 'return_refused', 'return_confirmed', 'refunded')"), 'Recenzia trebuie validată numai pentru o comandă livrată/finală.');
complianceCheck(str_contains($api, 'UNIQUE INDEX idx_shop_reviews_order_product (order_id, product_id)'), 'Trebuie prevenită dublarea recenziei pentru aceeași comandă și același produs.');
complianceCheck(str_contains($api, "'verified_purchase' => (bool)") && str_contains($api, "'review_source' => (string)"), 'Răspunsul recenziei trebuie să indice verificarea și sursa.');

complianceCheck(str_contains($returns, "? 30 : 14"), 'Termenele configurate trebuie să fie 30 zile B2C și 14 zile B2B.');
complianceCheck(str_contains($returns, 'withdrawal_statement') && str_contains($returns, 'withdrawal_submitted_at'), 'Conținutul, data și ora retragerii trebuie păstrate durabil.');
complianceCheck(str_contains($returns, 'shop_order_return_items'), 'Returul trebuie să funcționeze pe produse și cantități, nu doar pe întreaga comandă.');
complianceCheck(str_contains($publicReturnHtml, 'name="order_number"') && str_contains($publicReturnHtml, 'name="email"'), 'Primul pas al returului trebuie să ceară numărul comenzii și e-mailul.');
complianceCheck(!str_contains($publicReturnHtml, 'name="customer_name"') && !str_contains($publicReturnHtml, 'name="invoice_number"') && !str_contains($publicReturnHtml, 'name="no_invoice"'), 'Primul pas al returului nu trebuie să ceară numele sau date despre factură.');
complianceCheck(!str_contains($publicReturn, 'noInvoice') && !str_contains($publicReturn, 'invoiceField'), 'Scriptul returului nu trebuie să depindă de câmpurile eliminate.');
complianceCheck(str_contains($publicReturn, 'normalizeOrderNumber') && str_contains($publicReturn, "call('publicTrackOrder'"), 'Pagina locală de retur trebuie să normalizeze numărul comenzii și să poată valida prin ruta publică stabilă.');
complianceCheck(str_contains($publicReturnHtml, 'Solicită chiar acum') && str_contains($publicReturnHtml, 'return-experience'), 'Pagina de retur trebuie să păstreze titlul și experiența vizuală G-Trots aprobate.');

complianceCheck(str_contains($storefront, 'hasMerchantReturnPolicy') && str_contains($storefront, 'shippingDetails'), 'Produsul trebuie să publice politica de retur și livrarea în datele structurate.');
complianceCheck(str_contains($footer, "'@type': 'OnlineStore'") && str_contains($footer, 'hasMerchantReturnPolicy'), 'Magazinul trebuie să publice date structurate de organizație și retur.');
complianceCheck(str_contains($cookies, 'g-trots:open-consent'), 'Preferințele cookie trebuie să poată fi redeschise din footer.');
complianceCheck(str_contains($cookies, 'choice || normalize({ preferences: true, analytics: true, marketing: true })'), 'Categoriile opționale trebuie să pornească bifate vizual pentru o alegere nouă.');
complianceCheck(str_contains($cookies, 'if (choice) apply(choice);'), 'Cookie-urile opționale nu trebuie aplicate înainte ca alegerea să fie salvată explicit.');

$requiredPages = [
    'termeni-si-conditii.html', 'politica-de-retur.html', 'politica-de-confidentialitate.html',
    'politica-cookies.html', 'livrare-si-plata.html', 'plata-si-facturare.html',
    'garantii-si-reclamatii.html', 'siguranta-produselor.html', 'solutionarea-litigiilor.html',
    'conditii-b2b.html', 'accesibilitate.html', 'despre-g-trots.html', 'contact.html',
    'solicita-retur.html',
];
foreach ($requiredPages as $page) {
    $path = $root . '/website/' . $page;
    complianceCheck(is_file($path), 'Lipsește pagina publică: ' . $page);
    $html = file_get_contents($path);
    complianceCheck(is_string($html) && str_contains($html, '/legal-footer.js'), 'Pagina nu folosește footerul legal comun: ' . $page);
}

complianceCheck(is_file($root . '/website/assets/anpc-sal.png'), 'Lipsește pictograma SAL oficială.');

echo "shop_compliance_contract_test: OK\n";
