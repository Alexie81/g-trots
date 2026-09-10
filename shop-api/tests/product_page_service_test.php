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
    'source_domain' => 'g-trots.ro',
    'legal_warranty_months' => 24,
    'commercial_warranty_months' => null,
    'manufacturer_name' => 'Xiaomi',
    'category_name' => 'Trotinete electrice second hand',
    'brands' => [['id' => 'brand-xiaomi-pro-2', 'name' => 'Xiaomi Pro 2', 'slug' => 'xiaomi-pro-2']],
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
productPageAssert(!str_contains($html, 'https://schema.org/UsedCondition') && !str_contains($html, 'https://schema.org/NewCondition'), 'Generatorul nu trebuie să inventeze sau să trimită către Google starea produsului.');

$categoryDrivenProduct = $product;
$categoryDrivenProduct['slug'] = 'xiaomi-pro-2-verificata';
$categoryDrivenProduct['name'] = 'Trotinetă electrică Xiaomi Pro 2 verificată';
$categoryDrivenProduct['short_description'] = 'Produs verificat tehnic și pregătit pentru vânzare.';
$categoryDrivenProduct['meta_title'] = 'Trotinetă electrică Xiaomi Pro 2 verificată | G-Trots';
$categoryDrivenProduct['meta_description'] = 'Trotinetă electrică verificată tehnic de G-Trots, cu imagini reale, preț și disponibilitate actualizate.';
$categoryDrivenHtml = shopProductSeoRender($categoryDrivenProduct, ['website_base_url' => 'https://g-trots.ro']);
productPageAssert(!str_contains($categoryDrivenHtml, 'itemCondition'), 'Categoria produsului nu trebuie transformată automat într-o stare tehnică pentru Google.');
productPageAssert(str_contains($html, '"@type":"Product"') && str_contains($html, '"@type":"FAQPage"') && str_contains($html, '"@type":"BreadcrumbList"'), 'Datele structurate Product, FAQ și Breadcrumb trebuie generate.');
productPageAssert(str_contains($html, '"sameAs":["https://www.instagram.com/gtrots.ro/"') && str_contains($html, 'https://www.youtube.com/@g-trots') && !str_contains($html, 'medium.com'), 'Schema Organization a produsului trebuie să declare exclusiv profilurile sociale afișate.');
productPageAssert(str_contains($html, '"merchantReturnDays":30') && !str_contains($html, '"merchantReturnDays":14'), 'Politica structurată a produsului trebuie să coincidă cu fereastra publică B2C de 30 de zile.');
productPageAssert(str_contains($html, 'id="gt-product-bootstrap"') && str_contains($html, 'data-gt-static-product'), 'Pagina trebuie să poată porni imediat din conținutul generat și să aibă text semantic în HTML.');
productPageAssert(str_contains($html, 'data-product-id="trotineta-second-hand-xiaomi-pro-2"'), 'Identificatorul produsului trebuie fixat în pagină.');
productPageAssert(str_contains($html, '<b data-product-sku>SE-CMM087</b>'), 'Codul real al produsului trebuie randat vizibil în HTML-ul inițial.');
productPageAssert(str_contains($html, '<strong>Compatibilitate</strong><span>Xiaomi Pro 2</span>'), 'Compatibilitatea trebuie randată semantic în conținutul static al produsului.');
productPageAssert(str_contains($html, '"name":"Compatibilitate","value":"Xiaomi Pro 2"'), 'Compatibilitatea trebuie inclusă în schema Product.');
productPageAssert(str_contains($html, '"brand":{"@type":"Brand","name":"Xiaomi"}'), 'Schema Product trebuie să folosească producătorul real drept brand.');
productPageAssert(!str_contains($html, 'GT-ANV-G10-AT') && !str_contains($html, '149,00 lei') && !str_contains($html, 'Anvelopă G10 All-Terrain'), 'Pagina generată nu trebuie să conțină datele produsului demonstrativ din șablon.');
productPageAssert(!str_contains($html, 'product-page-loading') && !str_contains($html, 'is-live-product-loading'), 'HTML-ul generat trebuie să livreze direct produsul real, fără mesaje intermediare de încărcare sau eroare.');
productPageAssert(!str_contains($html, '"sku": "GT-ANV-G10-AT"'), 'Schemele JSON-LD vechi ale șablonului nu trebuie păstrate.');
productPageAssert(str_contains($html, 'class="site-header"') && str_contains($html, 'class="shell shop-footer"'), 'Orice pagină generată trebuie să păstreze navbarul și footerul global al magazinului.');
productPageAssert(str_contains($html, 'favorites.js?v=20260910-navbar-v1') && str_contains($html, 'legal-footer.js?v=20260910-conversion-v1'), 'Orice pagină generată trebuie să încarce acțiunile globale, măsurarea și navbarul/footerul actual.');
productPageAssert(!str_contains($html, 'data-product-safety') && !str_contains($html, 'Siguranță și garanție'), 'Secțiunea Siguranță și garanție nu trebuie să apară pe pagina produsului.');
productPageAssert(str_contains($html, 'data-product-warranty-badge>Garanție 24 luni</span>'), 'Generatorul trebuie să afișeze badge-ul de garanție când valoarea este mai mare decât zero.');
productPageAssert(str_contains($html, 'data-product-warranty>') && str_contains($html, 'Garanție produs: 24 luni'), 'Generatorul trebuie să afișeze cardul de garanție în descriere când valoarea este mai mare decât zero.');
productPageAssert(str_contains($html, 'Acest produs este disponibil pentru cumpărare online.'), 'Conținutul comercial trebuie să rămână universal și bazat pe datele reale ale produsului.');

$withoutWarranty = $product;
$withoutWarranty['legal_warranty_months'] = 0;
$withoutWarranty['commercial_warranty_months'] = null;
$withoutWarrantyHtml = shopProductSeoRender($withoutWarranty, ['website_base_url' => 'https://g-trots.ro']);
productPageAssert(str_contains($withoutWarrantyHtml, 'data-product-warranty-badge hidden></span>'), 'Badge-ul trebuie să rămână complet ascuns când garanția este zero sau nesetată.');
productPageAssert(!str_contains($withoutWarrantyHtml, 'data-product-warranty>'), 'Generatorul nu trebuie să emită secțiunea de garanție când valoarea este zero sau nesetată.');

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

$automaticMeta = $product;
$automaticMeta['slug'] = 'cauciuc-tubeless-test';
$automaticMeta['name'] = 'Cauciuc tubeless 10 × 2.75';
$automaticMeta['short_description'] = 'Cauciuc pentru trotinetă electrică, pregătit pentru montaj pe jantă tubeless.';
$automaticMeta['meta_title'] = '';
$automaticMeta['meta_description'] = '';
$automaticMeta['category_name'] = 'Cauciucuri tubeless';
$automaticMeta['category_system_key'] = null;
$automaticMeta['category_slug'] = 'cauciucuri-tubeless';
$automaticMeta['manufacturer_name'] = 'EWheel';
$automaticMeta['source_domain'] = 'boomag.ro';
$automaticMeta['discovery_enrichment_enabled'] = true;
$automaticMeta['brands'] = [['id' => 'brand-kukirin-g2', 'name' => 'KuKirin G2', 'slug' => 'kukirin-g2']];
$automaticMetaHtml = shopProductSeoRender($automaticMeta, ['website_base_url' => 'https://g-trots.ro']);
productPageAssert(str_contains($automaticMetaHtml, '<title>Cauciuc tubeless 10 × 2.75 pentru KuKirin G2 | G-Trots</title>'), 'O piesă Boomag actuală fără meta titlu trebuie să primească automat numele și compatibilitatea.');
productPageAssert(str_contains($automaticMetaHtml, 'Compatibilitate: KuKirin G2.'), 'O piesă Boomag actuală fără meta descriere trebuie să primească automat contextul de compatibilitate.');
productPageAssert(str_contains($automaticMetaHtml, 'Acest produs este disponibil pentru cumpărare online.') && str_contains($automaticMetaHtml, 'service sau montaj separat în București și Ilfov'), 'Conținutul comercial trebuie acopere cumpărarea și asistența fără să inventeze tipul sau starea produsului.');

$withoutManufacturer = $automaticMeta;
$withoutManufacturer['manufacturer_name'] = '';
$withoutManufacturerHtml = shopProductSeoRender($withoutManufacturer, ['website_base_url' => 'https://g-trots.ro']);
productPageAssert(!str_contains($withoutManufacturerHtml, '"brand":{"@type":"Brand","name":"KuKirin G2"}'), 'O compatibilitate nu trebuie declarată greșit drept producător sau brand al produsului.');

$serviceSource = (string)file_get_contents(__DIR__ . '/../product-page-service.php');
productPageAssert(str_contains($serviceSource, 'function shopProductSeoRebuildAiCatalog') && str_contains($serviceSource, "'compatibility' => \$compatibility"), 'Catalogul pentru agenți AI trebuie regenerat cu compatibilitățile produselor.');
productPageAssert(str_contains($serviceSource, "'meta_title' => \$effectiveMetaTitle") && str_contains($serviceSource, "'description_excerpt' => \$descriptionExcerpt") && str_contains($serviceSource, "'specifications' => \$catalogSpecifications"), 'Catalogul AI trebuie să includă titlul SEO, descrierile și specificațiile utile recomandării.');
productPageAssert(str_contains($serviceSource, "'warranty' => \$catalogWarranty") && str_contains($serviceSource, "'schema_version' => 4"), 'Catalogul AI trebuie să publice garanția și versiunea conversațională a schemei.');
productPageAssert(str_contains($serviceSource, "'roles' => ['magazin online de piese și accesorii pentru trotinete electrice', 'service de trotinete și scutere electrice']") && str_contains($serviceSource, "'service_types' => ['diagnosticare'"), 'Catalogul AI trebuie să descrie explicit G-Trots ca magazin și service, nu doar ca listă de produse.');
productPageAssert(str_contains($serviceSource, "'delivery_area' => ['România']") && str_contains($serviceSource, "'service_area' => ['București', 'Ilfov']"), 'Catalogul AI trebuie să separe livrarea națională a magazinului de aria locală a service-ului.');
productPageAssert(str_contains($serviceSource, "'conversation_intents' => \$conversationContexts") && str_contains($serviceSource, "'compatibility_guidance'") && str_contains($serviceSource, "'service_support'"), 'Catalogul AI trebuie să ofere contexte conversaționale prudente, compatibilitate și suport de service.');
productPageAssert(str_contains($serviceSource, 'shopProductSeoRebuildOpenAiProductFeed($products, $config)'), 'Reconstruirea catalogului AI trebuie să genereze și feedul OpenAI Product Discovery.');
productPageAssert(str_contains($serviceSource, 'shopProductSeoRebuildStorePages($products, $config)'), 'Orice actualizare de produs trebuie să reconstruiască și catalogul HTML server-side paginat.');
productPageAssert(str_contains($serviceSource, "'ai_catalog' => \$aiCatalog"), 'Actualizarea sitemap-ului trebuie să actualizeze și catalogul agenților AI.');

$storeProduct = $product;
$storeProduct['category_slug'] = 'trotinete-electrice';
$storeProduct['manufacturer_slug'] = 'xiaomi';
$storeProduct['sale_price'] = 1299.9;
$storeTemplate = '<!doctype html><html><head><title>Magazin</title><meta name="description" content=""><meta property="og:title" content=""><meta property="og:description" content=""><meta property="og:url" content=""><link rel="canonical" href="https://g-trots.ro/magazin"></head><body><div id="product-grid" class="products-grid is-catalog-loading" aria-busy="true"><!-- GTROTS:SSR_PRODUCTS_START --><!-- GTROTS:SSR_PRODUCTS_END --></div><strong id="results-count">0 produse</strong><p id="pagination-range">0–0 din 0</p><nav><!-- GTROTS:SSR_PAGINATION_START --><!-- GTROTS:SSR_PAGINATION_END --></nav></body></html>';
$storeHtml = shopProductSeoRenderStorePage($storeTemplate, [$storeProduct], 1, 1, 'https://g-trots.ro');
productPageAssert(str_contains($storeHtml, 'Trotinetă electrică Xiaomi Pro 2 second hand') && str_contains($storeHtml, 'data-product-id="trotineta-second-hand-xiaomi-pro-2"'), 'Catalogul server-side trebuie să conțină produsul real și ruta lui, nu carduri demonstrative.');
productPageAssert(str_contains($storeHtml, '1.299,90 <span>lei</span>'), 'Catalogul server-side trebuie să respecte prețul promoțional sau redus efectiv.');
productPageAssert(str_contains($storeHtml, '<strong id="results-count">1 produse</strong>') && str_contains($storeHtml, '<p id="pagination-range">1–1 din 1</p>'), 'Catalogul server-side trebuie să publice numărul și intervalul real de produse.');
productPageAssert(!str_contains($storeHtml, 'is-catalog-loading') && str_contains($storeHtml, 'aria-busy="false"'), 'Catalogul server-side nu trebuie să se prezinte crawlerului ca fiind încărcat exclusiv prin JavaScript.');

$openAiRecord = shopProductSeoOpenAiProductRecord($automaticMeta, 'https://g-trots.ro');
productPageAssert(is_array($openAiRecord), 'Produsul complet trebuie să fie eligibil pentru feedul OpenAI Product Discovery.');
productPageAssert(($openAiRecord['item_id'] ?? '') === 'product-seo-test' && ($openAiRecord['seller_name'] ?? '') === 'G-Trots', 'Feedul ACP trebuie să folosească identificatorul stabil și comerciantul real.');
productPageAssert(($openAiRecord['price'] ?? '') === '1499.90 RON' && ($openAiRecord['availability'] ?? '') === 'in_stock', 'Feedul ACP trebuie să publice prețul și stocul în formatul oficial.');
productPageAssert(str_contains((string)($openAiRecord['description'] ?? ''), 'Compatibilitatea indicată este: KuKirin G2.') && str_contains((string)$openAiRecord['description'], 'oriunde în România') && str_contains((string)$openAiRecord['description'], 'service-ul din București'), 'Descrierea Product Discovery trebuie să lege o piesă Boomag actuală de compatibilitate, livrare și service.');
productPageAssert(str_contains((string)($openAiRecord['url'] ?? ''), 'utm_source=chatgpt.com') && ($openAiRecord['is_eligible_search'] ?? false) === true, 'Feedul ACP trebuie să activeze descoperirea și măsurarea traficului ChatGPT.');
productPageAssert(($openAiRecord['mpn'] ?? '') === 'SE-CMM087' && ($openAiRecord['product_category'] ?? '') === 'Cauciucuri tubeless', 'Feedul ACP trebuie să publice codul produsului și categoria factuală fără a presupune că orice produs este piesă.');
productPageAssert(!array_key_exists('condition', $openAiRecord), 'Feedul ACP nu trebuie să inventeze automat starea produsului.');
$openAiWithoutManufacturer = $product;
$openAiWithoutManufacturer['manufacturer_name'] = '';
productPageAssert(shopProductSeoOpenAiProductRecord($openAiWithoutManufacturer, 'https://g-trots.ro') === null, 'Un produs fără producător real nu trebuie publicat cu un brand inventat în feedul ACP.');
$controllerProduct = $automaticMeta;
$controllerProduct['name'] = 'Controller original pentru KuKirin G2 2025';
$controllerProduct['category_name'] = 'Controller';
$controllerDescription = shopProductSeoDiscoveryDescription($controllerProduct);
productPageAssert(str_contains($controllerDescription, 'motorul nu mai trage') && str_contains($controllerDescription, 'nu confirmă singure defectarea controllerului'), 'Controllerul trebuie să poată răspunde căutărilor după simptome fără a afirma un diagnostic sigur.');

$futureManualProduct = $automaticMeta;
$futureManualProduct['id'] = 'future-manual-product';
$futureManualProduct['source_domain'] = 'g-trots.ro';
$futureManualProduct['discovery_enrichment_enabled'] = false;
$futureManualDescription = shopProductSeoDiscoveryDescription($futureManualProduct);
productPageAssert(!str_contains($futureManualDescription, 'Compatibilitatea indicată') && !str_contains($futureManualDescription, 'înlocuirea') && !str_contains($futureManualDescription, 'service-ul din București'), 'Un produs viitor introdus manual trebuie să folosească descrierea comerciantului fără scenarii automate despre simptome, înlocuire sau compatibilitate.');
productPageAssert(str_contains($futureManualDescription, 'oriunde în România'), 'Produsul manual poate păstra informația factuală despre livrarea națională.');
$futureManualHtml = shopProductSeoRender($futureManualProduct, ['website_base_url' => 'https://g-trots.ro']);
productPageAssert(str_contains($futureManualHtml, '<title>Cauciuc tubeless 10 × 2.75 | G-Trots</title>') && !str_contains($futureManualHtml, 'Compatibilitate: KuKirin G2.'), 'Generatorul paginii viitoare manuale nu trebuie să extindă automat titlul sau meta descrierea cu compatibilități.');

$boomagAccessory = $automaticMeta;
$boomagAccessory['category_name'] = 'Suport telefon';
$boomagAccessory['discovery_enrichment_enabled'] = false;
$boomagAccessory['is_accessory_category'] = true;
$boomagAccessoryDescription = shopProductSeoDiscoveryDescription($boomagAccessory);
productPageAssert(!str_contains($boomagAccessoryDescription, 'Compatibilitatea indicată') && !str_contains($boomagAccessoryDescription, 'înlocuirea'), 'Accesoriile Boomag actuale trebuie excluse din îmbogățirea conversațională rezervată pieselor.');
$apiSource = (string)file_get_contents(__DIR__ . '/../api.php');
$deleteStart = strpos($apiSource, "if (\$action === 'deleteProduct'");
$deleteBlock = $deleteStart === false ? '' : substr($apiSource, $deleteStart, 6500);
productPageAssert($deleteBlock !== '' && str_contains($deleteBlock, 'shopProductSeoRebuildSitemap($db, $config)'), 'Ștergerea oricărui produs, inclusiv Boomag, trebuie să reconstruiască sitemap-ul și catalogul AI.');
productPageAssert(strpos($deleteBlock, 'shopProductSeoRebuildSitemap($db, $config)') > strpos($deleteBlock, 'DELETE FROM shop_products'), 'Produsul trebuie eliminat din baza locală înainte de reconstruirea catalogului AI, ca să nu mai poată fi recomandat.');
$gomagSource = (string)file_get_contents(__DIR__ . '/../gomag.php');
productPageAssert(str_contains($gomagSource, '$changedIds = array_values(array_unique(array_merge(array_keys($pricesChanged), array_keys($stocksChanged))))'), 'Boomag trebuie să construiască lista de sincronizare exclusiv din schimbările reale de preț și stoc.');
productPageAssert(str_contains($gomagSource, 'if ($changedIds && function_exists(\'shopProductSeoRebuildSitemap\'))'), 'Boomag nu trebuie să reconstruiască paginile de descoperire când feedul nu conține schimbări reale.');

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
