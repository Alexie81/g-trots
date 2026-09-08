<?php
declare(strict_types=1);

require_once __DIR__ . '/../product-page-service.php';

function productPageAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$product = [
    'id' => 'product-seo-test',
    'slug' => 'trotineta-second-hand-xiaomi-pro-2',
    'name' => 'Trotinetă electrică Xiaomi Pro 2 second hand',
    'short_description' => 'Trotinetă verificată în service, cu imagini reale, preț și disponibilitate actualizate.',
    'meta_title' => 'Trotinetă Xiaomi Pro 2 second hand | G-Trots',
    'meta_description' => 'Cumpără o trotinetă Xiaomi Pro 2 second hand verificată în service-ul G-Trots, cu informații clare despre stare și livrare.',
    'price' => 1499.9,
    'currency' => 'RON',
    'stock_mode' => 'tracked',
    'stock_quantity' => 1,
    'sku' => 'SE-CMM087',
    'manufacturer_name' => 'Xiaomi',
    'category_system_key' => 'second_hand_scooters',
    'images' => [['url' => 'https://g-trots.ro/shop-api/uploads/products/produs.webp']],
    'specifications' => [['label' => 'Stare', 'value' => 'Second hand verificat']],
    'questions' => [['question' => 'Produsul este verificat?', 'answer' => 'Da, este verificat înainte de listare.']],
];

$html = shopProductSeoRender($product, ['website_base_url' => 'https://g-trots.ro']);

productPageAssert(str_contains($html, '<title>Trotinetă Xiaomi Pro 2 second hand | G-Trots</title>'), 'Titlul SEO trebuie să fie prezent în HTML-ul inițial.');
productPageAssert(str_contains($html, 'property="og:title" content="Trotinetă Xiaomi Pro 2 second hand | G-Trots"'), 'WhatsApp trebuie să primească exact meta titlul salvat în aplicație.');
productPageAssert(str_contains($html, 'property="og:description" content="Cumpără o trotinetă Xiaomi Pro 2 second hand verificată în service-ul G-Trots, cu informații clare despre stare și livrare."'), 'WhatsApp trebuie să primească exact meta descrierea salvată în aplicație.');
productPageAssert(str_contains($html, 'property="og:image" content="https://g-trots.ro/shop-api/uploads/products/produs.webp"'), 'WhatsApp trebuie să primească imaginea principală a produsului.');
productPageAssert(str_contains($html, 'property="og:image:secure_url" content="https://g-trots.ro/shop-api/uploads/products/produs.webp"'), 'Imaginea socială trebuie publicată și ca adresă HTTPS explicită.');
productPageAssert(str_contains($html, 'href="https://g-trots.ro/magazin/produs/trotineta-second-hand-xiaomi-pro-2/"'), 'Canonical-ul trebuie să indice URL-ul unic al produsului.');
productPageAssert(str_contains($html, 'index, follow, max-image-preview:large'), 'Pagina produsului trebuie să fie indexabilă.');
productPageAssert(str_contains($html, 'https://schema.org/UsedCondition'), 'Produsele second hand trebuie marcate cu UsedCondition.');

$categoryDrivenProduct = $product;
$categoryDrivenProduct['slug'] = 'xiaomi-pro-2-verificata';
$categoryDrivenProduct['name'] = 'Trotinetă electrică Xiaomi Pro 2 verificată';
$categoryDrivenProduct['short_description'] = 'Produs verificat tehnic și pregătit pentru vânzare.';
$categoryDrivenProduct['meta_title'] = 'Trotinetă electrică Xiaomi Pro 2 verificată | G-Trots';
$categoryDrivenProduct['meta_description'] = 'Trotinetă electrică verificată tehnic de G-Trots, cu imagini reale, preț și disponibilitate actualizate.';
$categoryDrivenHtml = shopProductSeoRender($categoryDrivenProduct, ['website_base_url' => 'https://g-trots.ro']);
productPageAssert(str_contains($categoryDrivenHtml, 'https://schema.org/UsedCondition'), 'Categoria tehnică second-hand trebuie să determine UsedCondition chiar dacă titlul nu conține expresia second hand.');
productPageAssert(str_contains($html, '"@type":"Product"') && str_contains($html, '"@type":"FAQPage"') && str_contains($html, '"@type":"BreadcrumbList"'), 'Datele structurate Product, FAQ și Breadcrumb trebuie generate.');
productPageAssert(str_contains($html, '"merchantReturnDays":30') && !str_contains($html, '"merchantReturnDays":14'), 'Politica structurată a produsului trebuie să coincidă cu fereastra publică B2C de 30 de zile.');
productPageAssert(str_contains($html, 'id="gt-product-bootstrap"') && str_contains($html, 'data-gt-static-product'), 'Pagina trebuie să poată porni imediat din conținutul generat și să aibă text semantic în HTML.');
productPageAssert(str_contains($html, 'data-product-id="trotineta-second-hand-xiaomi-pro-2"'), 'Identificatorul produsului trebuie fixat în pagină.');
productPageAssert(!str_contains($html, '"sku": "GT-ANV-G10-AT"'), 'Schemele JSON-LD vechi ale șablonului nu trebuie păstrate.');
productPageAssert(str_contains($html, 'class="site-header"') && str_contains($html, 'class="shell shop-footer"'), 'Orice pagină generată trebuie să păstreze navbarul și footerul global al magazinului.');
productPageAssert(str_contains($html, 'favorites.js?v=20260908-sitelinks-v1') && str_contains($html, 'legal-footer.js?v=20260908-social-v2'), 'Orice pagină generată trebuie să încarce acțiunile globale și footerul social actual.');
productPageAssert(!str_contains($html, 'data-product-safety') && !str_contains($html, 'Siguranță și garanție'), 'Secțiunea Siguranță și garanție nu trebuie să apară pe pagina produsului.');

$unsafe = $product;
$unsafe['name'] = '</script><script>alert("x")</script>';
$unsafeHtml = shopProductSeoRender($unsafe, ['website_base_url' => 'https://g-trots.ro']);
productPageAssert(!str_contains($unsafeHtml, '<script>alert("x")</script>'), 'Conținutul produsului nu trebuie să poată injecta script în pagina generată.');

$inactive = $product;
$inactive['is_active'] = false;
$inactive['is_purchasable'] = false;
$inactiveHtml = shopProductSeoRender($inactive, ['website_base_url' => 'https://g-trots.ro']);
productPageAssert(str_contains($inactiveHtml, 'Produs indisponibil momentan'), 'Produsul dezactivat trebuie să păstreze o pagină informativă clară.');
productPageAssert(str_contains($inactiveHtml, 'https://schema.org/OutOfStock'), 'Produsul dezactivat trebuie marcat OutOfStock în schema Product.');
productPageAssert(str_contains($inactiveHtml, 'index, follow, max-image-preview:large'), 'O pagină dezactivată deja indexată trebuie să rămână indexabilă și informativă.');

$statusSlug = 'test-status-' . bin2hex(random_bytes(5));
$redirectSlug = $statusSlug . '-nou';
$redirectPath = shopProductSeoWriteRedirect($statusSlug, $redirectSlug, ['website_base_url' => 'https://g-trots.ro']);
$redirectSource = file_get_contents($redirectPath);
productPageAssert(is_string($redirectSource) && str_contains($redirectSource, 'http_response_code(301)') && str_contains($redirectSource, $redirectSlug), 'Slugul vechi trebuie să emită redirect permanent către canonicalul nou.');
shopProductSeoRemovePage($statusSlug);
$gonePath = shopProductSeoWriteGonePage($statusSlug, $product['name'], ['website_base_url' => 'https://g-trots.ro']);
$goneSource = file_get_contents($gonePath);
productPageAssert(is_string($goneSource) && str_contains($goneSource, 'http_response_code(410)') && str_contains($goneSource, 'noindex, follow'), 'Un produs șters trebuie să emită 410 și noindex, fără un fals 200.');
shopProductSeoRemovePage($statusSlug);

echo "product_page_service_test: OK\n";
