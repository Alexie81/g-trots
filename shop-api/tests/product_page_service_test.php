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
    'images' => [['url' => 'https://g-trots.ro/shop-api/uploads/products/produs.webp']],
    'specifications' => [['label' => 'Stare', 'value' => 'Second hand verificat']],
    'questions' => [['question' => 'Produsul este verificat?', 'answer' => 'Da, este verificat înainte de listare.']],
];

$html = shopProductSeoRender($product, ['website_base_url' => 'https://g-trots.ro']);

productPageAssert(str_contains($html, '<title>Trotinetă Xiaomi Pro 2 second hand | G-Trots</title>'), 'Titlul SEO trebuie să fie prezent în HTML-ul inițial.');
productPageAssert(str_contains($html, 'href="https://g-trots.ro/magazin/produs/trotineta-second-hand-xiaomi-pro-2/"'), 'Canonical-ul trebuie să indice URL-ul unic al produsului.');
productPageAssert(str_contains($html, 'index, follow, max-image-preview:large'), 'Pagina produsului trebuie să fie indexabilă.');
productPageAssert(str_contains($html, 'https://schema.org/UsedCondition'), 'Produsele second hand trebuie marcate cu UsedCondition.');
productPageAssert(str_contains($html, '"@type":"Product"') && str_contains($html, '"@type":"FAQPage"') && str_contains($html, '"@type":"BreadcrumbList"'), 'Datele structurate Product, FAQ și Breadcrumb trebuie generate.');
productPageAssert(str_contains($html, 'id="gt-product-bootstrap"') && str_contains($html, 'data-gt-static-product'), 'Pagina trebuie să poată porni imediat din conținutul generat și să aibă text semantic în HTML.');
productPageAssert(str_contains($html, 'data-product-id="trotineta-second-hand-xiaomi-pro-2"'), 'Identificatorul produsului trebuie fixat în pagină.');
productPageAssert(!str_contains($html, '"sku": "GT-ANV-G10-AT"'), 'Schemele JSON-LD vechi ale șablonului nu trebuie păstrate.');

$unsafe = $product;
$unsafe['name'] = '</script><script>alert("x")</script>';
$unsafeHtml = shopProductSeoRender($unsafe, ['website_base_url' => 'https://g-trots.ro']);
productPageAssert(!str_contains($unsafeHtml, '<script>alert("x")</script>'), 'Conținutul produsului nu trebuie să poată injecta script în pagina generată.');

echo "product_page_service_test: OK\n";
