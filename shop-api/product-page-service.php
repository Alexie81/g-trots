<?php
declare(strict_types=1);

/**
 * Generates crawlable product pages in the public website tree. The browser
 * still refreshes price and stock from the API, while search engines receive
 * useful metadata, structured data and product copy in the initial HTML.
 */

function shopProductSeoWebsiteRoot(): string {
    $localWebsite = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'website';
    if (is_file($localWebsite . DIRECTORY_SEPARATOR . 'produs.html')) return $localWebsite;
    return dirname(__DIR__);
}

function shopProductSeoSafeSlug(string $slug): string {
    $slug = trim($slug);
    if ($slug === '' || str_contains($slug, '/') || str_contains($slug, '\\') || str_contains($slug, '..')) {
        throw new InvalidArgumentException('Slugul produsului nu poate fi folosit pentru pagina SEO.');
    }
    return $slug;
}

function shopProductSeoText(mixed $value): string {
    $text = html_entity_decode(strip_tags((string)$value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim((string)preg_replace('/\s+/u', ' ', $text));
}

function shopProductSeoExcerpt(mixed $value, int $limit): string {
    $text = shopProductSeoText($value);
    if (mb_strlen($text, 'UTF-8') <= $limit) return $text;
    $cut = rtrim(mb_substr($text, 0, max(1, $limit - 1), 'UTF-8'));
    $space = mb_strrpos($cut, ' ', 0, 'UTF-8');
    if ($space !== false && $space > (int)floor($limit * 0.65)) $cut = rtrim(mb_substr($cut, 0, $space, 'UTF-8'));
    return $cut . '…';
}

function shopProductSeoAbsoluteUrl(string $value, string $websiteBaseUrl): string {
    $value = trim($value);
    if ($value === '') return '';
    if (preg_match('#^https?://#i', $value)) return $value;
    if (str_starts_with($value, '//')) return 'https:' . $value;
    return rtrim($websiteBaseUrl, '/') . '/' . ltrim($value, '/');
}

function shopProductSeoReplaceMeta(string $html, string $attribute, string $key, string $value): string {
    $escaped = htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    $pattern = '#<meta\s+([^>]*\b' . preg_quote($attribute, '#') . '="' . preg_quote($key, '#') . '"[^>]*)>#i';
    if (preg_match($pattern, $html)) {
        return (string)preg_replace_callback($pattern, static function (array $match) use ($escaped): string {
            $tag = '<meta ' . $match[1] . '>';
            if (preg_match('/\bcontent="[^"]*"/i', $tag)) return (string)preg_replace('/\bcontent="[^"]*"/i', 'content="' . $escaped . '"', $tag, 1);
            return rtrim($tag, '>') . ' content="' . $escaped . '">';
        }, $html, 1);
    }
    return str_replace('</head>', '    <meta ' . $attribute . '="' . htmlspecialchars($key, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '" content="' . $escaped . '">' . PHP_EOL . '  </head>', $html);
}

function shopProductSeoJson(array $value): string {
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
}

function shopProductSeoValidGtin(string $value): ?string {
    $gtin = preg_replace('/\D+/', '', $value) ?: '';
    $length = strlen($gtin);
    if (!in_array($length, [8, 12, 13, 14], true)) return null;
    if (str_starts_with($gtin, '2') || str_starts_with($gtin, '02') || str_starts_with($gtin, '04')
        || str_starts_with($gtin, '98') || str_starts_with($gtin, '99')) return null;
    $sum = 0;
    $weight = 3;
    for ($index = $length - 2; $index >= 0; $index--) {
        $sum += ((int)$gtin[$index]) * $weight;
        $weight = $weight === 3 ? 1 : 3;
    }
    $expected = (10 - ($sum % 10)) % 10;
    return $expected === (int)$gtin[$length - 1] ? $gtin : null;
}

function shopProductSeoIntentKey(mixed $value): string {
    $text = mb_strtolower(shopProductSeoText($value), 'UTF-8');
    return strtr($text, [
        'ă' => 'a', 'â' => 'a', 'î' => 'i', 'ș' => 's', 'ş' => 's', 'ț' => 't', 'ţ' => 't',
    ]);
}

function shopProductSeoConversationEnrichmentEnabled(array $product): bool {
    return array_key_exists('discovery_enrichment_enabled', $product)
        && (bool)$product['discovery_enrichment_enabled'];
}

function shopProductSeoIsBoomagProduct(array $product): bool {
    return mb_strtolower(trim((string)($product['source_domain'] ?? '')), 'UTF-8') === 'boomag.ro';
}

function shopProductSeoIsBoomagAccessory(array $product): bool {
    if (!shopProductSeoIsBoomagProduct($product)) return false;
    if (array_key_exists('is_accessory_category', $product)) return (bool)$product['is_accessory_category'];
    if (array_key_exists('catalog_section', $product)) return (string)$product['catalog_section'] === 'accessories';
    $category = shopProductSeoIntentKey(($product['category_slug'] ?? '') . ' ' . ($product['category_name'] ?? ''));
    return str_contains($category, 'accesor');
}

function shopProductSeoConversationContexts(array $product): array {
    if (!shopProductSeoConversationEnrichmentEnabled($product)) return [];
    $category = shopProductSeoIntentKey($product['category_name'] ?? '');
    $name = shopProductSeoIntentKey($product['name'] ?? '');
    $categoryOrName = $category !== '' ? $category : $name;
    $contains = static fn(array $needles): bool => array_reduce(
        $needles,
        static fn(bool $found, string $needle): bool => $found || str_contains($categoryOrName, $needle),
        false
    );

    if (str_contains($name, 'cablu') || str_contains($name, 'mufa') || str_contains($name, 'conector') || $contains(['cabluri si mufe', 'butoane si conectori'])) {
        return [
            'Este o opțiune utilă pentru refacerea unei conexiuni deteriorate sau a unui contact care funcționează intermitent.',
            'Înainte de alegere, compară numărul și poziția pinilor, tensiunea, lungimea și traseul cablului; forma asemănătoare a mufei nu garantează compatibilitatea.',
        ];
    }
    if ($contains(['cauciuc', 'anvelop', 'camera', 'valv', 'roti', 'roata'])) {
        return [
            'Este o opțiune pentru înlocuirea unei anvelope, camere, valve sau roți sparte, tăiate ori uzate.',
            'Înainte de alegere, verifică dimensiunea inscripționată pe piesa veche, tipul jantei și versiunea exactă a trotinetei.',
        ];
    }
    if ($contains(['placute de frana', 'etrier', 'disc de frana', 'manete de frana', 'cablu de frana', 'frane ', 'frana '])) {
        return [
            'Poate fi potrivit când frânarea a devenit slabă sau zgomotoasă ori când o componentă a sistemului de frânare este uzată.',
            'Compară tipul etrierului, forma, prinderile și dimensiunile înainte de comandă; o problemă de frânare trebuie verificată înainte de utilizarea trotinetei.',
        ];
    }
    if ($contains(['display'])) {
        return [
            'Poate fi o soluție când display-ul nu pornește, nu afișează corect sau nu mai comunică normal cu trotineta.',
            'Verifică versiunea, protocolul și conectorii înainte de comandă, deoarece display-urile asemănătoare vizual nu sunt întotdeauna interschimbabile.',
        ];
    }
    if ($contains(['acceleratie', 'accelerator'])) {
        return [
            'Poate fi potrivit când accelerația nu răspunde, răspunde intermitent sau maneta este deteriorată.',
            'Compară conectorul, tensiunea și poziția pinilor, apoi confirmă compatibilitatea electronică înainte de comandă.',
        ];
    }
    if ($contains(['motor'])) {
        return [
            'Poate fi o opțiune când motorul nu mai trage, funcționează neregulat sau prezintă zgomote și joc mecanic.',
            'Aceleași simptome pot proveni și din controller, baterie, senzori ori cablaj, așa că diagnosticul trebuie confirmat înainte de comandă.',
        ];
    }
    if ($contains(['acumulator', 'baterie', 'bms'])) {
        return [
            'Poate fi o opțiune când trotineta nu mai pornește, autonomia a scăzut sau bateria nu se mai încarcă normal.',
            'Verifică tensiunea, capacitatea, dimensiunile și conectorii, iar înainte de înlocuire confirmă diagnosticul sistemului de alimentare.',
        ];
    }
    if ($contains(['incarcator'])) {
        return [
            'Poate înlocui un încărcător lipsă sau deteriorat atunci când specificațiile corespund trotinetei și bateriei.',
            'Confirmă tensiunea de ieșire, curentul, mufa și polaritatea înainte de conectare.',
        ];
    }
    if ($contains(['buton', 'senzor', 'convertor'])) {
        return [
            'Poate fi util când o comandă sau o funcție electrică răspunde intermitent ori nu mai funcționează.',
            'Confirmă tensiunea, conectorii, poziția pinilor și rolul exact al componentei înainte de comandă.',
        ];
    }
    if ($contains(['far', 'lumini', 'led', 'claxon', 'sonerie'])) {
        return [
            'Poate fi potrivit când iluminarea, semnalizarea sau avertizarea sonoră nu mai funcționează corect.',
            'Compară tensiunea, conectorul și prinderea, apoi confirmă compatibilitatea cu instalația electrică.',
        ];
    }
    if ($contains(['suspensie', 'furca'])) {
        return [
            'Poate fi potrivit când suspensia sau furca prezintă joc, zgomote, deformări ori funcționare neuniformă.',
            'Compară dimensiunile, prinderile și configurația exactă a trotinetei înainte de comandă.',
        ];
    }
    if ($contains(['pliere'])) {
        return [
            'Poate fi potrivit când mecanismul de pliere are joc, nu se mai blochează corect sau o componentă este uzată.',
            'Compară versiunea mecanismului, forma și dimensiunile piesei înainte de comandă.',
        ];
    }
    if ($contains(['rulment', 'surub'])) {
        return [
            'Poate fi util pentru eliminarea jocului mecanic, a zgomotelor sau pentru înlocuirea elementelor de fixare uzate.',
            'Diametrul, lungimea, pasul și poziția de montaj trebuie confirmate înainte de comandă.',
        ];
    }
    if ($contains(['controller', 'controler', 'kit controller'])) {
        return [
            'Este o variantă de luat în calcul când trotineta nu mai accelerează ori motorul nu mai trage, dar aceste simptome nu confirmă singure defectarea controllerului.',
            'Compară tensiunea, conectorii și versiunea exactă a trotinetei sau cere o verificare tehnică înainte de comandă.',
        ];
    }
    return [];
}

function shopProductSeoDiscoveryDescription(array $product): string {
    $name = shopProductSeoText($product['name'] ?? '');
    $withConversationEnrichment = shopProductSeoConversationEnrichmentEnabled($product);
    $isBoomagAccessory = shopProductSeoIsBoomagAccessory($product);
    $description = '';
    if ($isBoomagAccessory) {
        $category = shopProductSeoText($product['category_name'] ?? '');
        $description = $name . ($category !== '' ? ', disponibil în categoria ' . $category : '') . ' din magazinul G-Trots.';
    } else {
        $description = shopProductSeoText($product['description_html'] ?? '');
        if ($description === '') $description = shopProductSeoText($product['meta_description'] ?? '');
        if ($description === '') $description = shopProductSeoText($product['short_description'] ?? '');
    }
    if ($description === '') $description = $name;
    $lead = shopProductSeoExcerpt($description, 3200);
    if ($lead !== '' && !preg_match('/[.!?…]$/u', $lead)) $lead .= '.';
    $parts = [$lead];

    $compatibility = [];
    foreach ((array)($product['brands'] ?? []) as $brand) {
        $brandName = shopProductSeoText($brand['name'] ?? '');
        if ($brandName !== '' && !in_array($brandName, $compatibility, true)) $compatibility[] = $brandName;
    }
    if ($withConversationEnrichment && $compatibility) $parts[] = 'Compatibilitatea indicată este: ' . implode(', ', array_slice($compatibility, 0, 12)) . '.';

    $specifications = [];
    foreach (array_slice((array)($product['specifications'] ?? []), 0, 12) as $specification) {
        $label = shopProductSeoText($specification['label'] ?? $specification['name'] ?? '');
        $value = shopProductSeoText($specification['value'] ?? '');
        if ($label !== '' && $value !== '') $specifications[] = $label . ': ' . $value;
    }
    if ($withConversationEnrichment && $specifications) $parts[] = 'Detalii utile: ' . implode('; ', $specifications) . '.';
    if ($withConversationEnrichment) {
        foreach (shopProductSeoConversationContexts($product) as $context) $parts[] = $context;
    }

    $parts[] = 'Comanda poate fi livrată oriunde în România.';
    if ($withConversationEnrichment) {
        $parts[] = 'Dacă vrei să eviți alegerea greșită, G-Trots poate verifica piesa după codul produsului, model, an, fotografii și specificații; pentru piesele potrivite există și montaj la service-ul din București, cu disponibilitatea și costul confirmate separat.';
    }
    return shopProductSeoExcerpt(implode(' ', array_values(array_filter($parts))), 5000);
}

function shopProductSeoOpenAiProductRecord(array $product, string $websiteBaseUrl): ?array {
    $websiteBaseUrl = rtrim($websiteBaseUrl, '/');
    $id = trim((string)($product['id'] ?? ''));
    $slug = trim((string)($product['slug'] ?? ''));
    $name = shopProductSeoText($product['name'] ?? '');
    $brand = shopProductSeoText($product['manufacturer_name'] ?? '');
    $currency = strtoupper(trim((string)($product['currency'] ?? 'RON')) ?: 'RON');
    $price = function_exists('stripeEffectiveProductPrice')
        ? stripeEffectiveProductPrice($product)
        : max(0.0, (float)($product['promotion_price'] ?? 0), (float)($product['sale_price'] ?? 0), (float)($product['price'] ?? 0), (float)($product['supplier_base_price'] ?? 0));
    $imageUrls = [];
    foreach ((array)($product['images'] ?? []) as $image) {
        $imageUrl = shopProductSeoAbsoluteUrl((string)($image['url'] ?? $image['image_path'] ?? ''), $websiteBaseUrl);
        if ($imageUrl !== '' && !in_array($imageUrl, $imageUrls, true)) $imageUrls[] = $imageUrl;
    }
    if ($id === '' || $slug === '' || $name === '' || $brand === '' || !$imageUrls || $price <= 0 || !preg_match('/^[A-Z]{3}$/', $currency)) return null;

    $canonical = $websiteBaseUrl . '/magazin/produs/' . rawurlencode(shopProductSeoSafeSlug($slug)) . '/';
    $record = [
        'item_id' => $id,
        'title' => shopProductSeoExcerpt($name, 150),
        'description' => shopProductSeoDiscoveryDescription($product),
        'url' => $canonical . '?utm_source=chatgpt.com&utm_medium=feed&utm_campaign=product_discovery',
        'brand' => $brand,
        'seller_name' => 'G-Trots',
        'image_url' => $imageUrls[0],
        'availability' => ((string)($product['stock_mode'] ?? 'tracked') === 'unlimited' || (int)($product['stock_quantity'] ?? 0) > 0) ? 'in_stock' : 'out_of_stock',
        'price' => number_format($price, 2, '.', '') . ' ' . $currency,
        'is_eligible_search' => true,
        'seller_url' => $websiteBaseUrl . '/magazin',
    ];
    $category = shopProductSeoText($product['category_name'] ?? '');
    if ($category !== '') $record['product_category'] = $category;
    $mpn = shopProductSeoText($product['sku'] ?? '');
    if ($mpn !== '') $record['mpn'] = $mpn;
    $gtin = shopProductSeoValidGtin((string)($product['gtin'] ?? $product['ean'] ?? ''));
    if ($gtin !== null) $record['gtin'] = $gtin;
    if (count($imageUrls) > 1) $record['additional_image_urls'] = array_slice($imageUrls, 1, 10);
    return $record;
}

function shopProductSeoRebuildOpenAiProductFeed(array $products, array $config): array {
    $websiteBaseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $lines = [];
    $missingBrand = 0;
    $otherInvalid = 0;
    foreach ($products as $product) {
        $record = shopProductSeoOpenAiProductRecord($product, $websiteBaseUrl);
        if ($record === null) {
            if (shopProductSeoText($product['manufacturer_name'] ?? '') === '') $missingBrand++;
            else $otherInvalid++;
            continue;
        }
        $lines[] = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }
    $path = shopProductSeoWebsiteRoot() . DIRECTORY_SEPARATOR . 'openai-products.jsonl';
    $gzipPath = shopProductSeoWebsiteRoot() . DIRECTORY_SEPARATOR . 'openai-products.jsonl.gz';
    $statusPath = shopProductSeoWebsiteRoot() . DIRECTORY_SEPARATOR . 'openai-products-status.json';
    $contents = $lines ? implode(PHP_EOL, $lines) . PHP_EOL : '';
    if (file_put_contents($path, $contents, LOCK_EX) === false) throw new RuntimeException('Feedul OpenAI Product Discovery nu poate fi actualizat.');
    $compressed = gzencode($contents, 9, ZLIB_ENCODING_GZIP);
    if ($compressed === false || file_put_contents($gzipPath, $compressed, LOCK_EX) === false) {
        throw new RuntimeException('Feedul OpenAI Product Discovery comprimat nu poate fi actualizat.');
    }
    $status = [
        'schema' => 'OpenAI Product Discovery Stable',
        'generated_at' => date(DATE_ATOM),
        'encoding' => 'UTF-8',
        'required_fields' => ['item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability', 'price'],
        'products' => count($lines),
        'excluded' => count($products) - count($lines),
        'excluded_missing_brand' => $missingBrand,
        'excluded_other_invalid' => $otherInvalid,
        'conversation_enrichment_scope' => 'Piesele Boomag din lista fixată la 2026-09-10; accesoriile și produsele adăugate ulterior sunt excluse.',
        'condition_policy' => 'Câmpul condition nu este generat automat.',
        'feed_url' => $websiteBaseUrl . '/openai-products.jsonl',
        'gzip_url' => $websiteBaseUrl . '/openai-products.jsonl.gz',
        'sftp_delivery' => 'pending_openai_onboarding',
    ];
    if (file_put_contents($statusPath, json_encode($status, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL, LOCK_EX) === false) {
        throw new RuntimeException('Diagnosticul feedului OpenAI Product Discovery nu poate fi actualizat.');
    }
    return [
        'success' => true,
        'products' => count($lines),
        'excluded' => count($products) - count($lines),
        'excluded_missing_brand' => $missingBrand,
        'excluded_other_invalid' => $otherInvalid,
        'path' => $path,
        'url' => $websiteBaseUrl . '/openai-products.jsonl',
        'gzip_path' => $gzipPath,
        'gzip_url' => $websiteBaseUrl . '/openai-products.jsonl.gz',
        'status_path' => $statusPath,
        'status_url' => $websiteBaseUrl . '/openai-products-status.json',
    ];
}

function shopProductSeoRender(array $product, array $config): string {
    $root = shopProductSeoWebsiteRoot();
    $templatePath = $root . DIRECTORY_SEPARATOR . 'produs.html';
    $html = file_get_contents($templatePath);
    if (!is_string($html) || $html === '') throw new RuntimeException('Șablonul public produs.html nu poate fi citit.');

    $websiteBaseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $slug = shopProductSeoSafeSlug((string)($product['slug'] ?? ''));
    $canonical = $websiteBaseUrl . '/magazin/produs/' . rawurlencode($slug) . '/';
    $name = shopProductSeoText($product['name'] ?? 'Produs G-Trots');
    $sku = shopProductSeoText($product['sku'] ?? '');
    $category = shopProductSeoText($product['category_name'] ?? '');
    $manufacturer = shopProductSeoText($product['manufacturer_name'] ?? '');
    $compatibilityNames = [];
    foreach ((array)($product['brands'] ?? []) as $compatibility) {
        $compatibilityName = shopProductSeoText($compatibility['name'] ?? '');
        if ($compatibilityName !== '' && !in_array($compatibilityName, $compatibilityNames, true)) $compatibilityNames[] = $compatibilityName;
    }
    $primaryCompatibility = $compatibilityNames[0] ?? '';
    $withConversationEnrichment = shopProductSeoConversationEnrichmentEnabled($product);
    $isBoomagAccessory = shopProductSeoIsBoomagAccessory($product);
    $titleSource = shopProductSeoText($product['meta_title'] ?? '');
    $fallbackTitle = $name;
    if ($withConversationEnrichment && $primaryCompatibility !== '' && mb_stripos($fallbackTitle, $primaryCompatibility, 0, 'UTF-8') === false) {
        $compatibilityForTitle = shopProductSeoExcerpt($primaryCompatibility, 22);
        $nameLimit = max(24, 55 - mb_strlen(' pentru ' . $compatibilityForTitle, 'UTF-8'));
        $fallbackTitle = shopProductSeoExcerpt($name, $nameLimit) . ' pentru ' . $compatibilityForTitle;
    }
    $title = $titleSource !== ''
        ? $titleSource
        : shopProductSeoExcerpt($fallbackTitle, 55) . ' | G-Trots';
    $customDescription = $isBoomagAccessory ? '' : shopProductSeoText($product['meta_description'] ?? '');
    $descriptionSource = $customDescription;
    if ($descriptionSource === '' && $isBoomagAccessory) {
        $descriptionSource = $name . ($category !== '' ? ', disponibil în categoria ' . $category : '') . ' din magazinul G-Trots.';
    }
    if ($descriptionSource === '') $descriptionSource = shopProductSeoText($product['short_description'] ?? '');
    if ($descriptionSource === '') $descriptionSource = shopProductSeoText($product['description_html'] ?? '');
    if ($descriptionSource === '') $descriptionSource = $name . ' disponibil la G-Trots, cu prețul și disponibilitatea afișate pe pagina produsului.';
    if ($customDescription !== '') {
        $description = $customDescription;
    } else {
        $contextParts = [];
        if ($withConversationEnrichment && $primaryCompatibility !== '' && mb_stripos($descriptionSource, $primaryCompatibility, 0, 'UTF-8') === false) {
            $contextParts[] = 'Compatibilitate: ' . shopProductSeoExcerpt(implode(', ', array_slice($compatibilityNames, 0, 4)), 70) . '.';
        }
        if ($withConversationEnrichment && $category !== '' && mb_stripos($descriptionSource, $category, 0, 'UTF-8') === false) {
            $contextParts[] = 'Categorie: ' . shopProductSeoExcerpt($category, 48) . '.';
        }
        $context = implode(' ', $contextParts);
        if ($context === '') {
            $description = shopProductSeoExcerpt($descriptionSource, 160);
        } else {
            $leadLimit = max(55, 159 - mb_strlen($context, 'UTF-8'));
            $description = shopProductSeoExcerpt($descriptionSource, $leadLimit) . ' ' . $context;
            $description = shopProductSeoExcerpt($description, 160);
        }
    }
    $currency = trim((string)($product['currency'] ?? 'RON')) ?: 'RON';
    $price = function_exists('stripeEffectiveProductPrice')
        ? stripeEffectiveProductPrice($product)
        : max(0.0, (float)($product['promotion_price'] ?? 0), (float)($product['sale_price'] ?? 0), (float)($product['price'] ?? 0), (float)($product['supplier_base_price'] ?? 0));
    $priceText = number_format(max(0, $price), 2, '.', '');
    $purchasable = array_key_exists('is_purchasable', $product)
        ? (bool)$product['is_purchasable']
        : (bool)($product['is_active'] ?? true) && (bool)($product['source_is_active'] ?? true);
    $inStock = $purchasable && ((string)($product['stock_mode'] ?? 'tracked') === 'unlimited' || (int)($product['stock_quantity'] ?? 0) > 0);
    $availabilityText = $inStock ? 'in stock' : 'out of stock';
    $availabilitySchema = $inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
    $images = [];
    foreach ((array)($product['images'] ?? []) as $image) {
        $url = shopProductSeoAbsoluteUrl((string)($image['url'] ?? $image['image_path'] ?? ''), $websiteBaseUrl);
        if ($url !== '' && !in_array($url, $images, true)) $images[] = $url;
    }
    if (!$images) $images[] = $websiteBaseUrl . '/assets/magazin-produse-v1.png';
    $productSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'Product',
        '@id' => $canonical . '#product',
        'name' => $name,
        'description' => $description,
        'image' => $images,
        'url' => $canonical,
        'sku' => $sku ?: null,
        'mpn' => trim((string)($product['supplier_product_code'] ?? $product['sku'] ?? '')) ?: null,
        'category' => $category ?: null,
        'brand' => $manufacturer !== '' ? ['@type' => 'Brand', 'name' => $manufacturer] : null,
        'offers' => [
            '@type' => 'Offer',
            'url' => $canonical,
            'priceCurrency' => $currency,
            'price' => $priceText,
            'availability' => $availabilitySchema,
            'seller' => ['@id' => $websiteBaseUrl . '/#organization'],
            'hasMerchantReturnPolicy' => [
                '@type' => 'MerchantReturnPolicy',
                'applicableCountry' => 'RO',
                'returnPolicyCountry' => 'RO',
                'returnPolicyCategory' => 'https://schema.org/MerchantReturnFiniteReturnWindow',
                'merchantReturnDays' => 30,
                'returnMethod' => 'https://schema.org/ReturnByMail',
                'returnFees' => 'https://schema.org/ReturnFeesCustomerResponsibility',
                'merchantReturnLink' => $websiteBaseUrl . '/politica-de-retur',
            ],
        ],
    ];
    foreach ($productSchema as $key => $value) if ($value === null || $value === '') unset($productSchema[$key]);
    $gtin = shopProductSeoValidGtin((string)($product['gtin'] ?? $product['ean'] ?? ''));
    if ($gtin !== null) $productSchema['gtin' . strlen($gtin)] = $gtin;
    if ((int)($product['review_count'] ?? 0) > 0 && (float)($product['review_average'] ?? 0) > 0) {
        $productSchema['aggregateRating'] = [
            '@type' => 'AggregateRating',
            'ratingValue' => number_format((float)$product['review_average'], 2, '.', ''),
            'reviewCount' => (int)$product['review_count'],
        ];
    }
    $properties = [];
    if ($compatibilityNames) $properties[] = ['@type' => 'PropertyValue', 'name' => 'Compatibilitate', 'value' => implode(', ', array_slice($compatibilityNames, 0, 8))];
    foreach (array_slice((array)($product['specifications'] ?? []), 0, 40) as $specification) {
        $label = shopProductSeoText($specification['label'] ?? $specification['name'] ?? '');
        $value = shopProductSeoText($specification['value'] ?? '');
        if ($label !== '' && $value !== '') $properties[] = ['@type' => 'PropertyValue', 'name' => $label, 'value' => $value];
    }
    $legalWarranty = max(0, (int)($product['legal_warranty_months'] ?? 0));
    $commercialWarranty = max(0, (int)($product['commercial_warranty_months'] ?? 0));
    if ($legalWarranty > 0) $properties[] = ['@type' => 'PropertyValue', 'name' => 'Garanție legală', 'value' => $legalWarranty . ' luni'];
    if ($commercialWarranty > 0) $properties[] = ['@type' => 'PropertyValue', 'name' => 'Garanție comercială', 'value' => $commercialWarranty . ' luni'];
    if ($properties) $productSchema['additionalProperty'] = $properties;
    $compatibilityCopy = $withConversationEnrichment && $compatibilityNames
        ? ' Compatibilitate declarată: ' . implode(', ', array_slice($compatibilityNames, 0, 6)) . '.'
        : '';
    $intentCopy = 'Acest produs este disponibil pentru cumpărare online.' . $compatibilityCopy;
    if ($withConversationEnrichment) {
        $intentCopy .= ' G-Trots oferă asistență pentru alegerea piesei potrivite și, atunci când este aplicabil, service sau montaj separat în București și Ilfov.';
    }
    $breadcrumbSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'BreadcrumbList',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Acasă', 'item' => $websiteBaseUrl . '/'],
            ['@type' => 'ListItem', 'position' => 2, 'name' => 'Magazin', 'item' => $websiteBaseUrl . '/magazin'],
            ['@type' => 'ListItem', 'position' => 3, 'name' => $name, 'item' => $canonical],
        ],
    ];
    $organizationSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'Organization',
        '@id' => $websiteBaseUrl . '/#organization',
        'name' => 'G-Trots România',
        'legalName' => 'CAB IT EXPERT S.R.L.',
        'taxID' => '49972605',
        'url' => $websiteBaseUrl . '/',
        'logo' => $websiteBaseUrl . '/assets/logo.png',
        'telephone' => '+40762093915',
        'email' => 'contact@g-trots.ro',
        'sameAs' => [
            'https://www.instagram.com/gtrots.ro/',
            'https://www.facebook.com/profile.php?id=61590892933228',
            'https://www.tiktok.com/@gtrots.service',
            'https://x.com/servicegtrots',
            'https://www.youtube.com/@g-trots',
        ],
        'address' => [
            '@type' => 'PostalAddress',
            'streetAddress' => 'Str. Humulești nr. 131-135, lot 4',
            'addressLocality' => 'București',
            'addressRegion' => 'Sector 5',
            'postalCode' => '052262',
            'addressCountry' => 'RO',
        ],
    ];
    $schemas = [$organizationSchema, $productSchema, $breadcrumbSchema];
    $questions = [];
    foreach (array_slice((array)($product['questions'] ?? []), 0, 12) as $question) {
        $questionText = shopProductSeoText($question['question'] ?? '');
        $answerText = shopProductSeoText($question['answer'] ?? '');
        if ($questionText !== '' && $answerText !== '') {
            $questions[] = ['@type' => 'Question', 'name' => $questionText, 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $answerText]];
        }
    }
    if ($questions) $schemas[] = ['@context' => 'https://schema.org', '@type' => 'FAQPage', 'mainEntity' => $questions];

    $html = (string)preg_replace('#<title>.*?</title>#is', '<title>' . htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8') . '</title>', $html, 1);
    $html = shopProductSeoReplaceMeta($html, 'name', 'description', $description);
    $html = shopProductSeoReplaceMeta($html, 'name', 'robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    $html = shopProductSeoReplaceMeta($html, 'property', 'og:title', $title);
    $html = shopProductSeoReplaceMeta($html, 'property', 'og:description', $description);
    $html = shopProductSeoReplaceMeta($html, 'property', 'og:url', $canonical);
    $html = shopProductSeoReplaceMeta($html, 'property', 'og:image', $images[0]);
    $html = shopProductSeoReplaceMeta($html, 'property', 'og:image:secure_url', $images[0]);
    $html = shopProductSeoReplaceMeta($html, 'property', 'og:image:alt', $name);
    $html = shopProductSeoReplaceMeta($html, 'property', 'og:site_name', 'G-Trots România');
    $html = shopProductSeoReplaceMeta($html, 'name', 'twitter:title', $title);
    $html = shopProductSeoReplaceMeta($html, 'name', 'twitter:description', $description);
    $html = shopProductSeoReplaceMeta($html, 'name', 'twitter:image', $images[0]);
    $html = shopProductSeoReplaceMeta($html, 'name', 'twitter:image:alt', $name);
    $html = shopProductSeoReplaceMeta($html, 'property', 'product:price:amount', $priceText);
    $html = shopProductSeoReplaceMeta($html, 'property', 'product:price:currency', $currency);
    $html = shopProductSeoReplaceMeta($html, 'property', 'product:availability', $availabilityText);
    $canonicalEscaped = htmlspecialchars($canonical, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    $html = (string)preg_replace('#<link\s+rel="canonical"\s+href="[^"]*"\s*/?>#i', '<link rel="canonical" href="' . $canonicalEscaped . '">', $html, 1);
    $html = (string)preg_replace('#\s*<script\s+type="application/ld\+json"(?![^>]*data-gt-organization-schema)[^>]*>.*?</script>#is', '', $html);
    $headScripts = '';
    foreach ($schemas as $index => $schema) {
        $schemaAttribute = match ($schema['@type'] ?? '') {
            'Organization' => 'data-gt-organization-schema',
            'BreadcrumbList' => 'data-gt-breadcrumb-schema',
            default => 'data-gt-product-schema="' . ($index + 1) . '"',
        };
        $headScripts .= '    <script type="application/ld+json" ' . $schemaAttribute . '>' . shopProductSeoJson($schema) . '</script>' . PHP_EOL;
    }
    $headScripts .= '    <script type="application/json" id="gt-product-bootstrap">' . shopProductSeoJson($product) . '</script>' . PHP_EOL;
    $html = str_replace('</head>', $headScripts . '  </head>', $html);
    $html = str_replace(' is-live-product-loading', '', $html);
    $html = (string)preg_replace('#\s*<section\b[^>]*\bclass="[^"]*\bproduct-page-loading\b[^"]*"[^>]*>.*?</section>\s*(?=<div\b[^>]*\bclass="product-detail-breadcrumb)#is', PHP_EOL . '      ', $html, 1);
    $html = (string)preg_replace_callback('/(<body\b[^>]*\bdata-product-id=")[^"]*(")/i', static fn(array $match): string => $match[1] . htmlspecialchars($slug, ENT_QUOTES | ENT_HTML5, 'UTF-8') . $match[2], $html, 1);
    $skuEscaped = htmlspecialchars($sku !== '' ? $sku : '—', ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    $html = (string)preg_replace('#(<b\b[^>]*\bdata-product-sku\b[^>]*>).*?(</b>)#is', '$1' . $skuEscaped . '$2', $html, 1);

    $displayWarranty = $commercialWarranty > 0 ? $commercialWarranty : $legalWarranty;
    $warrantyBadge = '<span class="product-warranty-badge" data-product-warranty-badge hidden></span>';
    $warrantyCard = '';
    if ($displayWarranty > 0) {
        $warrantyBadge = '<span class="product-warranty-badge" data-product-warranty-badge>Garanție ' . $displayWarranty . ' luni</span>';
        $warrantyTitle = $commercialWarranty > 0
            ? 'Garanție comercială: ' . $commercialWarranty . ' luni'
            : 'Garanție produs: ' . $legalWarranty . ' luni';
        $warrantyDetail = $legalWarranty > 0 && $commercialWarranty > 0
            ? 'Garanția legală declarată este de ' . $legalWarranty . ' luni.'
            : 'Detaliile și condițiile aplicabile sunt disponibile în politica de garanție G-Trots.';
        $warrantyCard = '<aside class="product-warranty-card" data-product-warranty>'
            . '<span class="product-warranty-card__shield" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5.1-3.4 8.4-8 10-4.6-1.6-8-4.9-8-10V6l8-3Z"></path><path d="m8.5 12 2.2 2.2 4.8-5"></path></svg></span>'
            . '<div><small>PROTECȚIE G-TROTS</small><strong>' . htmlspecialchars($warrantyTitle, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</strong><p>' . htmlspecialchars($warrantyDetail, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</p></div>'
            . '</aside>';
    }
    $html = (string)preg_replace('#<span\b[^>]*\bdata-product-warranty-badge\b[^>]*>.*?</span>#is', $warrantyBadge, $html, 1);
    $warrantyCardReplacement = $warrantyCard !== '' ? '              ' . $warrantyCard . PHP_EOL : '';
    $html = (string)preg_replace('#[ \t]*<aside\b[^>]*\bdata-product-warranty\b[^>]*>.*?</aside>\R?#is', $warrantyCardReplacement, $html, 1);

    $staticProperties = [];
    $appendStaticProperty = static function (string $label, string $value) use (&$staticProperties): void {
        if ($label === '' || $value === '') return;
        $key = mb_strtolower($label . "\0" . $value, 'UTF-8');
        foreach ($staticProperties as $property) {
            if (mb_strtolower((string)$property['name'] . "\0" . (string)$property['value'], 'UTF-8') === $key) return;
        }
        $staticProperties[] = ['name' => $label, 'value' => $value];
    };
    $appendStaticProperty('Categorie', $category);
    $appendStaticProperty('Producător', $manufacturer);
    $appendStaticProperty('Compatibilitate', implode(', ', array_slice($compatibilityNames, 0, 8)));
    $appendStaticProperty('Cod produs', $sku);
    if ($gtin !== null) $appendStaticProperty('EAN', $gtin);
    foreach ($properties as $property) $appendStaticProperty((string)$property['name'], (string)$property['value']);
    $staticSpecs = '';
    foreach (array_slice($staticProperties, 0, 12) as $property) {
        $staticSpecs .= '<li><strong>' . htmlspecialchars((string)$property['name'], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</strong><span>' . htmlspecialchars((string)$property['value'], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</span></li>';
    }
    $staticArticle = '<article class="product-static-seo shell' . ($purchasable ? '' : ' is-unavailable') . '" data-gt-static-product aria-labelledby="gt-static-product-title">'
        . '<div><p class="product-static-seo__eyebrow">' . ($purchasable ? 'Produs G-Trots' : 'Temporar indisponibil') . '</p><h1 id="gt-static-product-title">' . htmlspecialchars($name, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</h1>'
        . '<p>' . htmlspecialchars($description, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</p><p class="product-static-seo__intent">' . htmlspecialchars($intentCopy, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</p><strong class="product-static-seo__price">' . htmlspecialchars($priceText . ' ' . $currency, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</strong>'
        . '<span class="product-static-seo__stock">' . ($purchasable ? ($inStock ? 'În stoc' : 'Stoc epuizat') : 'Produs indisponibil momentan') . '</span>' . ($staticSpecs !== '' ? '<ul>' . $staticSpecs . '</ul>' : '') . '</div>'
        . '<img src="' . htmlspecialchars($images[0], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '" alt="' . htmlspecialchars($name, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '" width="720" height="720" fetchpriority="high">'
        . '</article>' . PHP_EOL;
    $html = (string)preg_replace('#(<main\b[^>]*id="product-detail"[^>]*>)#i', '$1' . PHP_EOL . $staticArticle, $html, 1);
    return $html;
}

function shopProductSeoRemovePage(string $slug): void {
    if (trim($slug) === '') return;
    try {
        $slug = shopProductSeoSafeSlug($slug);
    } catch (Throwable) {
        return;
    }
    $productRoot = shopProductSeoWebsiteRoot() . DIRECTORY_SEPARATOR . 'magazin' . DIRECTORY_SEPARATOR . 'produs';
    $directory = $productRoot . DIRECTORY_SEPARATOR . $slug;
    $page = $directory . DIRECTORY_SEPARATOR . 'index.html';
    if (is_file($page)) @unlink($page);
    $dynamicPage = $directory . DIRECTORY_SEPARATOR . 'index.php';
    if (is_file($dynamicPage)) @unlink($dynamicPage);
    $legacyPage = $productRoot . DIRECTORY_SEPARATOR . $slug . '.html';
    if (is_file($legacyPage)) @unlink($legacyPage);
    if (is_dir($directory)) @rmdir($directory);
}

function shopProductSeoEnsureDirectory(string $slug): string {
    $directory = shopProductSeoWebsiteRoot() . DIRECTORY_SEPARATOR . 'magazin' . DIRECTORY_SEPARATOR . 'produs' . DIRECTORY_SEPARATOR . shopProductSeoSafeSlug($slug);
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException('Directorul paginii produsului nu poate fi creat.');
    }
    return $directory;
}

function shopProductSeoWriteRedirect(string $oldSlug, string $newSlug, array $config): string {
    $oldSlug = shopProductSeoSafeSlug($oldSlug);
    $newSlug = shopProductSeoSafeSlug($newSlug);
    $directory = shopProductSeoEnsureDirectory($oldSlug);
    $htmlPage = $directory . DIRECTORY_SEPARATOR . 'index.html';
    if (is_file($htmlPage)) @unlink($htmlPage);
    $target = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/') . '/magazin/produs/' . rawurlencode($newSlug) . '/';
    $source = "<?php\ndeclare(strict_types=1);\nhttp_response_code(301);\nheader('Location: ' . " . var_export($target, true) . ", true, 301);\nheader('Cache-Control: public, max-age=3600');\nexit;\n";
    $path = $directory . DIRECTORY_SEPARATOR . 'index.php';
    if (file_put_contents($path, $source, LOCK_EX) === false) throw new RuntimeException('Redirecționarea produsului nu poate fi scrisă.');
    return $path;
}

function shopProductSeoWriteGonePage(string $slug, string $name, array $config): string {
    $slug = shopProductSeoSafeSlug($slug);
    $directory = shopProductSeoEnsureDirectory($slug);
    $htmlPage = $directory . DIRECTORY_SEPARATOR . 'index.html';
    if (is_file($htmlPage)) @unlink($htmlPage);
    $name = shopProductSeoText($name) ?: 'Produsul căutat';
    $websiteBaseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $escapedName = htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    $source = <<<'PHP'
<?php
declare(strict_types=1);
http_response_code(410);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=300');
?>
PHP;
    $source .= '<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>Produs retras | G-Trots</title><meta name="robots" content="noindex, follow"><meta name="description" content="Acest produs nu mai face parte din catalogul G-Trots.">'
        . '<style>html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#09090b;color:#fff7f1;font:16px/1.6 system-ui,sans-serif}.gone{width:min(720px,100%);padding:clamp(28px,7vw,72px);border:1px solid #34343b;border-radius:34px;background:radial-gradient(circle at 100% 0,#4a240d 0,transparent 42%),#17171b;box-shadow:0 30px 90px #0008}.gone small{color:#ff7a18;font-weight:900;letter-spacing:.14em}.gone h1{font-size:clamp(36px,8vw,72px);line-height:1;margin:.25em 0}.gone p{color:#c7c0ba}.gone a{display:inline-flex;margin-top:18px;padding:14px 22px;border-radius:999px;background:#ff7a18;color:#160b04;text-decoration:none;font-weight:900}</style></head><body><main class="gone"><small>PRODUS RETRAS DIN CATALOG</small><h1>' . $escapedName . '</h1><p>Produsul nu mai este disponibil. Pagina răspunde cu statusul 410 pentru ca motoarele de căutare să o elimine corect, iar tu poți continua spre selecția actuală G-Trots.</p><a href="' . htmlspecialchars($websiteBaseUrl . '/magazin', ENT_QUOTES | ENT_HTML5, 'UTF-8') . '">Vezi produsele disponibile →</a></main></body></html>';
    $path = $directory . DIRECTORY_SEPARATOR . 'index.php';
    if (file_put_contents($path, $source, LOCK_EX) === false) throw new RuntimeException('Pagina 410 a produsului nu poate fi scrisă.');
    return $path;
}

function shopProductSeoReplaceGeneratedBlock(string $html, string $start, string $end, string $contents): string {
    $pattern = '#(' . preg_quote($start, '#') . ')[\s\S]*?(' . preg_quote($end, '#') . ')#';
    if (!preg_match($pattern, $html)) throw new RuntimeException('Markerul catalogului server-side lipsește din magazin.html.');
    return (string)preg_replace_callback(
        $pattern,
        static fn(array $match): string => $match[1] . PHP_EOL . $contents . PHP_EOL . '              ' . $match[2],
        $html,
        1
    );
}

function shopProductSeoStorePageUrl(int $page, string $websiteBaseUrl): string {
    return $page <= 1
        ? $websiteBaseUrl . '/magazin'
        : $websiteBaseUrl . '/magazin/pagina/' . $page . '/';
}

function shopProductSeoStoreStock(array $product): array {
    $inStock = (string)($product['stock_mode'] ?? 'tracked') === 'unlimited' || (int)($product['stock_quantity'] ?? 0) > 0;
    if (!$inStock) return ['label' => 'Stoc epuizat', 'key' => 'out-of-stock', 'rank' => 2, 'class' => ' is-out'];
    if ((string)($product['stock_mode'] ?? 'tracked') !== 'unlimited'
        && (int)($product['stock_quantity'] ?? 0) <= (int)($product['low_stock_threshold'] ?? 3)) {
        return ['label' => 'Stoc limitat', 'key' => 'in-stock', 'rank' => 1, 'class' => ' is-low'];
    }
    return ['label' => 'În stoc', 'key' => 'in-stock', 'rank' => 0, 'class' => ''];
}

function shopProductSeoStoreCard(array $product, int $index, string $websiteBaseUrl): string {
    $escape = static fn(mixed $value): string => htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    $slug = shopProductSeoSafeSlug((string)($product['slug'] ?? ''));
    $route = '/magazin/produs/' . rawurlencode($slug) . '/';
    $name = shopProductSeoText($product['name'] ?? '') ?: 'Produs G-Trots';
    $categoryName = shopProductSeoText($product['category_name'] ?? '') ?: 'Produs';
    $categorySlug = shopProductSeoText($product['category_slug'] ?? '') ?: 'produse';
    $manufacturerName = shopProductSeoText($product['manufacturer_name'] ?? '');
    $manufacturerSlug = shopProductSeoText($product['manufacturer_slug'] ?? '');
    $brandNames = [];
    $brandSlugs = [];
    foreach ((array)($product['brands'] ?? []) as $brand) {
        $brandName = shopProductSeoText($brand['name'] ?? '');
        $brandSlug = shopProductSeoText($brand['slug'] ?? '');
        if ($brandName !== '') $brandNames[] = $brandName;
        if ($brandSlug !== '') $brandSlugs[] = $brandSlug;
    }
    $cardLabel = $brandNames[0] ?? ($manufacturerName !== '' ? $manufacturerName : $categoryName);
    $description = shopProductSeoText($product['short_description'] ?? '') ?: $name . ' disponibil în magazinul G-Trots.';
    $imageUrl = '';
    if (!empty($product['images'][0]) && is_array($product['images'][0])) {
        $imageUrl = shopProductSeoAbsoluteUrl((string)($product['images'][0]['url'] ?? $product['images'][0]['image_path'] ?? ''), $websiteBaseUrl);
    }
    if ($imageUrl === '') $imageUrl = $websiteBaseUrl . '/assets/logo.png';
    if (function_exists('stripeEffectiveProductPrice')) {
        $price = stripeEffectiveProductPrice($product);
    } else {
        $basePrice = max(0.0, (float)($product['price'] ?? 0), (float)($product['supplier_base_price'] ?? 0));
        $salePrice = round((float)($product['sale_price'] ?? 0), 2);
        $promotionPrice = round((float)($product['promotion_price'] ?? 0), 2);
        $price = $promotionPrice > 0 ? $promotionPrice : ($salePrice > 0 ? $salePrice : $basePrice);
    }
    $stock = shopProductSeoStoreStock($product);
    $featuredRank = !empty($product['is_featured']) && is_numeric($product['featured_rank'] ?? null) ? (string)$product['featured_rank'] : '';
    $search = shopProductSeoExcerpt(implode(' ', [$name, $categoryName, $manufacturerName, $description, implode(' ', $brandNames), (string)($product['sku'] ?? ''), (string)($product['ean'] ?? '')]), 900);
    $brandBadges = '';
    foreach (array_slice($brandNames, 0, 4) as $brandName) $brandBadges .= '<span>' . $escape($brandName) . '</span>';
    $brandSection = $brandBadges !== '' ? '<div class="product-fit" aria-label="Mărci compatibile">' . $brandBadges . '</div>' : '';
    $featured = !empty($product['is_featured']) ? '<span class="product-badge">Recomandat</span>' : '';

    return '              <article class="product-card live-product-card visible" data-product-id="' . $escape($slug) . '" data-api-product-id="' . $escape($product['id'] ?? '') . '" data-category="' . $escape($categorySlug) . '" data-taxonomy="produse ' . $escape($categorySlug) . '" data-brand="' . $escape(implode(' ', $brandSlugs)) . '" data-stock="' . $stock['key'] . '" data-stock-rank="' . $stock['rank'] . '" data-featured-rank="' . $escape($featuredRank) . '" data-manufacturer="' . $escape($manufacturerSlug) . '" data-price="' . $price . '" data-name="' . $escape($name) . '" data-identifiers="' . $escape(trim((string)($product['sku'] ?? '') . ' ' . (string)($product['ean'] ?? '') . ' ' . (string)($product['id'] ?? ''))) . '" data-search="' . $escape($search) . '" data-route="' . $route . '" data-image="' . $escape($imageUrl) . '" data-category-name="' . $escape($categoryName) . '" data-manufacturer-name="' . $escape($manufacturerName) . '" data-brand-names="' . $escape(implode(', ', $brandNames)) . '" data-stock-label="' . $stock['label'] . '" data-short-description="' . $escape($description) . '" data-index="' . $index . '">'
        . '<div class="product-stage">' . $featured . '<div class="product-image product-image-live" style="background-image:url(\'' . $escape($imageUrl) . '\')" role="img" aria-label="' . $escape($name) . '"><img src="' . $escape($imageUrl) . '" alt="' . $escape($name) . '" width="720" height="720" loading="lazy" decoding="async"></div><span class="product-quick-note' . $stock['class'] . '"><i></i>' . $stock['label'] . '</span></div>'
        . '<div class="product-info"><span class="product-category"><i></i>' . $escape($cardLabel) . '</span><h3>' . $escape($name) . '</h3><div class="product-summary" tabindex="0" aria-label="Pe scurt: ' . $escape($description) . '"><span class="product-summary-badge"><i aria-hidden="true"></i>Pe scurt</span><p>' . $escape($description) . '</p><span class="product-summary-tooltip" aria-hidden="true">' . $escape($description) . '</span></div>' . $brandSection . '</div>'
        . '<div class="product-bottom"><div class="product-price"><small>Preț</small><strong>' . number_format(max(0, $price), 2, ',', '.') . ' <span>lei</span></strong></div><div class="product-bottom-action"><span class="product-open-hint" aria-hidden="true">›</span></div></div>'
        . '<a class="product-card-link" href="' . $route . '" aria-label="Deschide pagina produsului ' . $escape($name) . '"></a></article>';
}

function shopProductSeoStorePagination(int $currentPage, int $totalPages, string $websiteBaseUrl): string {
    $important = [1, $totalPages, $currentPage - 1, $currentPage, $currentPage + 1];
    $pages = array_values(array_unique(array_filter($important, static fn(int $page): bool => $page >= 1 && $page <= $totalPages)));
    sort($pages);
    $sequence = [];
    foreach ($pages as $index => $page) {
        if ($index > 0 && $page - $pages[$index - 1] > 1) $sequence[] = null;
        $sequence[] = $page;
    }
    $relativeUrl = static function (int $page) use ($websiteBaseUrl): string {
        return str_replace($websiteBaseUrl, '', shopProductSeoStorePageUrl($page, $websiteBaseUrl));
    };
    $parts = [];
    $parts[] = $currentPage > 1
        ? '<a class="pagination-button pagination-nav" href="' . $relativeUrl($currentPage - 1) . '" rel="prev" aria-label="Pagina anterioară">‹</a>'
        : '<span class="pagination-button pagination-nav" aria-disabled="true">‹</span>';
    foreach ($sequence as $page) {
        if ($page === null) {
            $parts[] = '<span class="pagination-ellipsis" aria-hidden="true">…</span>';
            continue;
        }
        $parts[] = '<a class="pagination-button" href="' . $relativeUrl($page) . '" aria-label="Pagina ' . $page . '"' . ($page === $currentPage ? ' aria-current="page"' : '') . '>' . $page . '</a>';
    }
    $parts[] = $currentPage < $totalPages
        ? '<a class="pagination-button pagination-nav" href="' . $relativeUrl($currentPage + 1) . '" rel="next" aria-label="Pagina următoare">›</a>'
        : '<span class="pagination-button pagination-nav" aria-disabled="true">›</span>';
    return '                ' . implode(PHP_EOL . '                ', $parts);
}

function shopProductSeoRenderStorePage(string $template, array $products, int $currentPage, int $totalPages, string $websiteBaseUrl, int $pageSize = 24): string {
    $canonical = shopProductSeoStorePageUrl($currentPage, $websiteBaseUrl);
    $title = $currentPage === 1 ? 'Piese și accesorii trotinete electrice | G-Trots' : 'Piese și accesorii trotinete electrice – Pagina ' . $currentPage . ' | G-Trots';
    $description = $currentPage === 1
        ? 'Magazin G-Trots cu piese, accesorii și trotinete electrice: cauciucuri, baterii, motoare, frâne, display-uri și ajutor de service pentru alegerea compatibilă.'
        : 'Pagina ' . $currentPage . ' din catalogul G-Trots cu piese, accesorii și trotinete electrice, prețuri și disponibilitate actualizate.';
    $first = ($currentPage - 1) * $pageSize;
    $last = min($first + $pageSize, count($products));
    $cards = [];
    foreach (array_slice($products, $first, $pageSize) as $offset => $product) $cards[] = shopProductSeoStoreCard($product, $first + $offset, $websiteBaseUrl);
    if (!$cards) throw new RuntimeException('Pagina catalogului nu conține produse.');
    $html = (string)preg_replace('#<title>.*?</title>#is', '<title>' . htmlspecialchars($title, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</title>', $template, 1);
    $html = shopProductSeoReplaceMeta($html, 'name', 'description', $description);
    $html = shopProductSeoReplaceMeta($html, 'property', 'og:title', $title);
    $html = shopProductSeoReplaceMeta($html, 'property', 'og:description', $description);
    $html = shopProductSeoReplaceMeta($html, 'property', 'og:url', $canonical);
    $html = (string)preg_replace('#<link\s+rel="canonical"\s+href="[^"]*"\s*/?>#i', '<link rel="canonical" href="' . htmlspecialchars($canonical, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '">', $html, 1);
    $html = (string)preg_replace('#\s*<link\b[^>]*\bdata-gt-catalog-rel\b[^>]*>#i', '', $html);
    $relations = [];
    if ($currentPage > 1) $relations[] = '<link rel="prev" href="' . shopProductSeoStorePageUrl($currentPage - 1, $websiteBaseUrl) . '" data-gt-catalog-rel>';
    if ($currentPage < $totalPages) $relations[] = '<link rel="next" href="' . shopProductSeoStorePageUrl($currentPage + 1, $websiteBaseUrl) . '" data-gt-catalog-rel>';
    if ($relations) $html = str_replace('</head>', '    ' . implode(PHP_EOL . '    ', $relations) . PHP_EOL . '  </head>', $html);
    $html = (string)preg_replace_callback('#<body\b([^>]*)>#i', static function (array $match) use ($currentPage): string {
        $attributes = (string)preg_replace('/\sdata-catalog-page="[^"]*"/i', '', $match[1]);
        return '<body' . $attributes . ' data-catalog-page="' . $currentPage . '">';
    }, $html, 1);
    $html = (string)preg_replace_callback('#<div\b[^>]*\bid="product-grid"[^>]*>#i', static function (array $match): string {
        $tag = str_replace(' is-catalog-loading', '', $match[0]);
        if (preg_match('/\baria-busy="[^"]*"/i', $tag)) return (string)preg_replace('/\baria-busy="[^"]*"/i', 'aria-busy="false"', $tag, 1);
        return rtrim($tag, '>') . ' aria-busy="false">';
    }, $html, 1);
    $html = shopProductSeoReplaceGeneratedBlock($html, '<!-- GTROTS:SSR_PRODUCTS_START -->', '<!-- GTROTS:SSR_PRODUCTS_END -->', implode(PHP_EOL, $cards));
    $html = shopProductSeoReplaceGeneratedBlock($html, '<!-- GTROTS:SSR_PAGINATION_START -->', '<!-- GTROTS:SSR_PAGINATION_END -->', shopProductSeoStorePagination($currentPage, $totalPages, $websiteBaseUrl));
    $productCount = count($products);
    $html = (string)preg_replace_callback(
        '#(<strong\b[^>]*\bid="results-count"[^>]*>)[\s\S]*?(</strong>)#i',
        static fn(array $match): string => $match[1] . $productCount . ' produse' . $match[2],
        $html,
        1
    );
    $range = ($first + 1) . '–' . $last . ' din ' . $productCount;
    $html = (string)preg_replace_callback(
        '#(<p\b[^>]*\bid="pagination-range"[^>]*>)[\s\S]*?(</p>)#i',
        static fn(array $match): string => $match[1] . $range . $match[2],
        $html,
        1
    );
    return $html;
}

function shopProductSeoRebuildStorePages(array $products, array $config): array {
    $root = shopProductSeoWebsiteRoot();
    $storePath = $root . DIRECTORY_SEPARATOR . 'magazin.html';
    $template = file_get_contents($storePath);
    if (!is_string($template) || $template === '') throw new RuntimeException('Pagina magazinului nu poate fi citită pentru randarea server-side.');
    $websiteBaseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $pageSize = 24;
    $totalPages = max(1, (int)ceil(count($products) / $pageSize));
    $paginationRoot = $root . DIRECTORY_SEPARATOR . 'magazin' . DIRECTORY_SEPARATOR . 'pagina';
    if (!is_dir($paginationRoot) && !mkdir($paginationRoot, 0775, true) && !is_dir($paginationRoot)) throw new RuntimeException('Directorul paginării magazinului nu poate fi creat.');
    foreach ((array)glob($paginationRoot . DIRECTORY_SEPARATOR . '*', GLOB_ONLYDIR) as $directory) {
        $pageName = basename($directory);
        if (!ctype_digit($pageName)) continue;
        foreach (['index.html', 'index.php'] as $fileName) {
            $file = $directory . DIRECTORY_SEPARATOR . $fileName;
            if (is_file($file)) @unlink($file);
        }
        @rmdir($directory);
    }
    if (file_put_contents($storePath, shopProductSeoRenderStorePage($template, $products, 1, $totalPages, $websiteBaseUrl, $pageSize), LOCK_EX) === false) throw new RuntimeException('Pagina principală a magazinului nu poate fi actualizată.');
    for ($page = 2; $page <= $totalPages; $page++) {
        $directory = $paginationRoot . DIRECTORY_SEPARATOR . $page;
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) throw new RuntimeException('O pagină a catalogului nu poate fi creată.');
        if (file_put_contents($directory . DIRECTORY_SEPARATOR . 'index.html', shopProductSeoRenderStorePage($template, $products, $page, $totalPages, $websiteBaseUrl, $pageSize), LOCK_EX) === false) throw new RuntimeException('O pagină a catalogului nu poate fi scrisă.');
    }
    $sitemapPath = $root . DIRECTORY_SEPARATOR . 'sitemaps' . DIRECTORY_SEPARATOR . 'sitemap-magazin.xml';
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . PHP_EOL . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . PHP_EOL;
    for ($page = 1; $page <= $totalPages; $page++) $xml .= '  <url><loc>' . htmlspecialchars(shopProductSeoStorePageUrl($page, $websiteBaseUrl), ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</loc><lastmod>' . date('Y-m-d') . '</lastmod></url>' . PHP_EOL;
    $xml .= '</urlset>' . PHP_EOL;
    if (file_put_contents($sitemapPath, $xml, LOCK_EX) === false) throw new RuntimeException('Sitemap-ul paginării magazinului nu poate fi scris.');
    $indexPath = $root . DIRECTORY_SEPARATOR . 'sitemap-index.xml';
    $indexXml = is_file($indexPath) ? file_get_contents($indexPath) : false;
    if (is_string($indexXml) && $indexXml !== '') {
        $location = $websiteBaseUrl . '/sitemaps/sitemap-magazin.xml';
        $entry = '  <sitemap><loc>' . htmlspecialchars($location, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</loc><lastmod>' . date('Y-m-d') . '</lastmod></sitemap>';
        $indexXml = str_contains($indexXml, $location)
            ? (string)preg_replace('#\s*<sitemap><loc>' . preg_quote($location, '#') . '</loc><lastmod>[^<]*</lastmod></sitemap>#', PHP_EOL . $entry, $indexXml, 1)
            : str_replace('</sitemapindex>', $entry . PHP_EOL . '</sitemapindex>', $indexXml);
        if (file_put_contents($indexPath, $indexXml, LOCK_EX) === false) throw new RuntimeException('Indexul sitemap nu poate fi actualizat cu paginarea magazinului.');
    }
    return ['success' => true, 'pages' => $totalPages, 'products' => count($products), 'sitemap' => $sitemapPath];
}

function shopProductSeoRebuildAiCatalog(PDO $db, array $config): array {
    if (!function_exists('productSelectSql') || !function_exists('productRows')) {
        return ['success' => false, 'products' => 0, 'error' => 'Funcțiile catalogului nu sunt disponibile.'];
    }
    $websiteBaseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $rows = $db->query(
        productSelectSql()
        . ' WHERE p.is_active = 1'
        . ' AND (p.source_id IS NULL OR COALESCE(s.is_active, 1) = 1)'
        . ' AND (p.category_id IS NULL OR COALESCE(c.is_active, 0) = 1)'
        . ' AND (p.manufacturer_id IS NULL OR COALESCE(m.is_active, 0) = 1)'
        . ' AND NOT EXISTS (SELECT 1 FROM shop_product_brands pbx INNER JOIN shop_brands bx ON bx.id = pbx.brand_id WHERE pbx.product_id = p.id AND bx.is_active = 0)'
        . ' ORDER BY p.slug ASC'
    )->fetchAll();
    $products = productRows($db, $rows, $config, true, true);
    if (function_exists('catalogRepresentativeProductIds')) {
        $representatives = catalogRepresentativeProductIds($db);
        $products = array_values(array_filter($products, static fn(array $product): bool => !empty($representatives[(string)($product['id'] ?? '')])));
    }
    if (function_exists('applyCatalogPromotionPrices')) $products = applyCatalogPromotionPrices($db, $products, null, '');

    $catalogProducts = [];
    foreach ($products as $product) {
        $slug = trim((string)($product['slug'] ?? ''));
        if ($slug === '') continue;
        $price = function_exists('stripeEffectiveProductPrice')
            ? stripeEffectiveProductPrice($product)
            : max(0.0, (float)($product['promotion_price'] ?? 0), (float)($product['sale_price'] ?? 0), (float)($product['price'] ?? 0), (float)($product['supplier_base_price'] ?? 0));
        $compatibility = [];
        foreach ((array)($product['brands'] ?? []) as $brand) {
            $brandName = shopProductSeoText($brand['name'] ?? '');
            if ($brandName !== '' && !in_array($brandName, $compatibility, true)) $compatibility[] = $brandName;
        }
        $image = '';
        if (!empty($product['images'][0]) && is_array($product['images'][0])) {
            $image = shopProductSeoAbsoluteUrl((string)($product['images'][0]['url'] ?? $product['images'][0]['image_path'] ?? ''), $websiteBaseUrl);
        }
        $gtin = shopProductSeoValidGtin((string)($product['gtin'] ?? $product['ean'] ?? ''));
        $productName = shopProductSeoText($product['name'] ?? '');
        $savedMetaTitle = shopProductSeoText($product['meta_title'] ?? '');
        $savedMetaDescription = shopProductSeoText($product['meta_description'] ?? '');
        $shortDescription = shopProductSeoExcerpt(shopProductSeoText($product['short_description'] ?? ''), 320);
        $descriptionExcerpt = shopProductSeoExcerpt(shopProductSeoText($product['description_html'] ?? ''), 650);
        if ($descriptionExcerpt === '') $descriptionExcerpt = $shortDescription;
        $effectiveMetaTitle = $savedMetaTitle !== '' ? $savedMetaTitle : shopProductSeoExcerpt($productName, 55) . ' | G-Trots';
        $catalogDescription = $savedMetaDescription !== '' ? $savedMetaDescription : ($shortDescription !== '' ? $shortDescription : $descriptionExcerpt);
        $catalogSpecifications = [];
        foreach (array_slice((array)($product['specifications'] ?? []), 0, 16) as $specification) {
            $specificationName = shopProductSeoText($specification['label'] ?? $specification['name'] ?? '');
            $specificationValue = shopProductSeoText($specification['value'] ?? '');
            if ($specificationName !== '' && $specificationValue !== '') {
                $catalogSpecifications[] = ['name' => $specificationName, 'value' => $specificationValue];
            }
        }
        $legalWarranty = max(0, (int)($product['legal_warranty_months'] ?? 0));
        $commercialWarranty = max(0, (int)($product['commercial_warranty_months'] ?? 0));
        $catalogWarranty = null;
        if ($legalWarranty > 0 || $commercialWarranty > 0) {
            $catalogWarranty = ['legal_months' => $legalWarranty, 'commercial_months' => $commercialWarranty];
        }
        $isPurchasable = (bool)($product['is_purchasable'] ?? $product['is_active'] ?? true);
        $isInStock = $isPurchasable && ((string)($product['stock_mode'] ?? 'tracked') === 'unlimited' || (int)($product['stock_quantity'] ?? 0) > 0);
        $withConversationEnrichment = shopProductSeoConversationEnrichmentEnabled($product);
        $conversationContexts = shopProductSeoConversationContexts($product);
        $catalogProducts[] = [
            'id' => (string)($product['id'] ?? ''),
            'name' => $productName,
            'meta_title' => $effectiveMetaTitle,
            'meta_description' => $savedMetaDescription,
            'short_description' => $shortDescription,
            'description_excerpt' => $descriptionExcerpt,
            'description' => $catalogDescription,
            'url' => $websiteBaseUrl . '/magazin/produs/' . rawurlencode($slug) . '/',
            'sku' => shopProductSeoText($product['sku'] ?? ''),
            'gtin' => $gtin ?? '',
            'manufacturer' => shopProductSeoText($product['manufacturer_name'] ?? ''),
            'category' => shopProductSeoText($product['category_name'] ?? ''),
            'compatibility' => $compatibility,
            'specifications' => $catalogSpecifications,
            'conversation_intents' => $conversationContexts,
            'compatibility_guidance' => $withConversationEnrichment
                ? 'Confirmă modelul, anul sau versiunea și specificațiile relevante înainte de comandă; piesele asemănătoare vizual nu sunt întotdeauna interschimbabile.'
                : null,
            'delivery' => 'Livrare disponibilă în toată România.',
            'service_support' => $withConversationEnrichment
                ? 'Verificarea compatibilității și montajul pot fi solicitate separat la service-ul G-Trots din București, în funcție de piesă.'
                : null,
            'warranty' => $catalogWarranty,
            'price' => round(max(0, $price), 2),
            'currency' => trim((string)($product['currency'] ?? 'RON')) ?: 'RON',
            'availability' => $isInStock
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            'image' => $image,
        ];
    }
    $payload = [
        'schema_version' => 4,
        'generated_at' => date(DATE_ATOM),
        'publisher' => [
            'name' => 'G-Trots România',
            'legal_name' => 'CAB IT EXPERT S.R.L.',
            'url' => $websiteBaseUrl . '/',
            'currency' => 'RON',
            'market' => 'RO',
            'language' => 'ro-RO',
        ],
        'business' => [
            'roles' => ['magazin online de piese și accesorii pentru trotinete electrice', 'service de trotinete și scutere electrice'],
            'summary' => 'G-Trots comercializează piese și accesorii pentru trotinete electrice și oferă diagnosticare, reparații și montaj în București și Ilfov.',
            'shop_url' => $websiteBaseUrl . '/magazin',
            'service_url' => $websiteBaseUrl . '/service-trotinete-electrice',
            'contact_url' => $websiteBaseUrl . '/contact',
            'telephone' => '+40762093915',
            'email' => 'contact@g-trots.ro',
            'shopping_market' => 'România',
            'delivery_area' => ['România'],
            'service_area' => ['București', 'Ilfov'],
        ],
        'services' => [
            [
                'name' => 'Service și reparații trotinete electrice',
                'url' => $websiteBaseUrl . '/service-trotinete-electrice',
                'area_served' => ['București', 'Ilfov'],
                'service_types' => ['diagnosticare', 'frâne', 'anvelope și camere', 'baterii și încărcare', 'controller și electronică', 'motor', 'cablaje', 'suspensii', 'revizii', 'montaj piese'],
                'confirmation' => 'Disponibilitatea, diagnosticul și costul se confirmă direct cu G-Trots.',
            ],
        ],
        'source_of_truth' => 'Pagina canonică a produsului stabilește prețul și disponibilitatea curentă.',
        'products' => $catalogProducts,
    ];
    $path = shopProductSeoWebsiteRoot() . DIRECTORY_SEPARATOR . 'ai-catalog.json';
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . PHP_EOL;
    if (file_put_contents($path, $json, LOCK_EX) === false) {
        throw new RuntimeException('Catalogul pentru agenți AI nu poate fi actualizat.');
    }
    $openAiProductFeed = shopProductSeoRebuildOpenAiProductFeed($products, $config);
    $storefront = shopProductSeoRebuildStorePages($products, $config);
    return ['success' => true, 'products' => count($catalogProducts), 'path' => $path, 'url' => $websiteBaseUrl . '/ai-catalog.json', 'openai_product_feed' => $openAiProductFeed, 'storefront' => $storefront];
}

function shopProductSeoRebuildSitemap(PDO $db, array $config): array {
    $root = shopProductSeoWebsiteRoot();
    $directory = $root . DIRECTORY_SEPARATOR . 'sitemaps';
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) throw new RuntimeException('Directorul sitemap nu poate fi creat.');
    $websiteBaseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $rows = $db->query(
        'SELECT p.id, p.slug, p.updated_at,
                (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image_path
         FROM shop_products p
         LEFT JOIN shop_product_sources s ON s.id = p.source_id
         WHERE p.is_active = 1 AND (p.source_id IS NULL OR COALESCE(s.is_active, 1) = 1)
         ORDER BY p.slug ASC'
    )->fetchAll();
    if (function_exists('catalogRepresentativeProductIds')) {
        $representatives = catalogRepresentativeProductIds($db);
        $rows = array_values(array_filter($rows, static fn(array $row): bool => !empty($representatives[(string)($row['id'] ?? '')])));
    }
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . PHP_EOL
        . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . PHP_EOL;
    foreach ($rows as $row) {
        $slug = trim((string)($row['slug'] ?? ''));
        if ($slug === '') continue;
        $loc = $websiteBaseUrl . '/magazin/produs/' . rawurlencode($slug) . '/';
        $lastmod = substr((string)($row['updated_at'] ?? date('Y-m-d')), 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $lastmod)) $lastmod = date('Y-m-d');
        $xml .= '  <url><loc>' . htmlspecialchars($loc, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</loc><lastmod>' . $lastmod . '</lastmod>';
        $image = shopProductSeoAbsoluteUrl((string)($row['image_path'] ?? ''), $websiteBaseUrl);
        if ($image !== '') $xml .= '<image:image><image:loc>' . htmlspecialchars($image, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</image:loc></image:image>';
        $xml .= '</url>' . PHP_EOL;
    }
    $xml .= '</urlset>' . PHP_EOL;
    $path = $directory . DIRECTORY_SEPARATOR . 'sitemap-produse.xml';
    if (file_put_contents($path, $xml, LOCK_EX) === false) throw new RuntimeException('Sitemap-ul produselor nu poate fi scris.');
    $indexPath = $root . DIRECTORY_SEPARATOR . 'sitemap-index.xml';
    $indexXml = is_file($indexPath) ? file_get_contents($indexPath) : false;
    if (is_string($indexXml) && $indexXml !== '') {
        $location = $websiteBaseUrl . '/sitemaps/sitemap-produse.xml';
        $entry = '  <sitemap><loc>' . htmlspecialchars($location, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</loc><lastmod>' . date('Y-m-d') . '</lastmod></sitemap>';
        if (str_contains($indexXml, $location)) {
            $indexXml = (string)preg_replace('#\s*<sitemap><loc>' . preg_quote($location, '#') . '</loc><lastmod>[^<]*</lastmod></sitemap>#', PHP_EOL . $entry, $indexXml, 1);
        } else {
            $indexXml = str_replace('</sitemapindex>', $entry . PHP_EOL . '</sitemapindex>', $indexXml);
        }
        if (file_put_contents($indexPath, $indexXml, LOCK_EX) === false) throw new RuntimeException('Indexul sitemap nu poate fi actualizat.');
    }
    $aiCatalog = shopProductSeoRebuildAiCatalog($db, $config);
    return ['success' => true, 'products' => count($rows), 'path' => $path, 'url' => $websiteBaseUrl . '/sitemaps/sitemap-produse.xml', 'ai_catalog' => $aiCatalog];
}

function shopProductSeoNotifyIndexNow(array $urls, array $config): array {
    $websiteBaseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $host = (string)(parse_url($websiteBaseUrl, PHP_URL_HOST) ?: 'g-trots.ro');
    $key = trim((string)($config['indexnow_key'] ?? 'e9da45c430d2234931472c94c3523db1'));
    $urls = array_values(array_unique(array_filter(array_map(static function ($url) use ($host): string {
        $url = trim((string)$url);
        return parse_url($url, PHP_URL_HOST) === $host ? $url : '';
    }, $urls))));
    if (!$urls || !preg_match('/^[a-z0-9-]{8,128}$/i', $key)) return ['submitted' => 0, 'status' => 'skipped'];
    $payload = json_encode([
        'host' => $host,
        'key' => $key,
        'keyLocation' => $websiteBaseUrl . '/' . rawurlencode($key) . '.txt',
        'urlList' => array_slice($urls, 0, 10000),
    ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    if (!function_exists('curl_init')) return ['submitted' => 0, 'status' => 'curl_unavailable'];
    $curl = curl_init('https://api.indexnow.org/indexnow');
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_USERAGENT => 'G-Trots-IndexNow/1.0',
    ]);
    $response = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    if ($status < 200 || $status >= 300) {
        return ['submitted' => 0, 'status' => $status ?: 'network_error', 'error' => mb_substr($error ?: (string)$response, 0, 300)];
    }
    return ['submitted' => count($urls), 'status' => $status];
}

function shopProductSeoSync(PDO $db, array $config, string $productId, ?string $oldSlug = null, bool $rebuildSitemap = true, bool $notifyIndexNow = true): array {
    try {
        $stateStmt = $db->prepare('SELECT p.id, p.slug, p.is_active, COALESCE(s.is_active, 1) AS source_is_active FROM shop_products p LEFT JOIN shop_product_sources s ON s.id = p.source_id WHERE p.id = ? LIMIT 1');
        $stateStmt->execute([$productId]);
        $state = $stateStmt->fetch();
        if (!$state) {
            if ($oldSlug !== null && trim($oldSlug) !== '') shopProductSeoWriteGonePage($oldSlug, 'Produs retras', $config);
            if ($rebuildSitemap) shopProductSeoRebuildSitemap($db, $config);
            $deletedUrl = $oldSlug !== null && trim($oldSlug) !== ''
                ? rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/') . '/magazin/produs/' . rawurlencode($oldSlug) . '/'
                : null;
            $indexNow = $notifyIndexNow && $deletedUrl ? shopProductSeoNotifyIndexNow([$deletedUrl], $config) : null;
            return ['success' => true, 'generated' => false, 'reason' => 'deleted', 'indexnow' => $indexNow];
        }
        $slug = (string)$state['slug'];
        if (function_exists('catalogRepresentativeProductIds')) {
            $representatives = catalogRepresentativeProductIds($db);
            if ($representatives && empty($representatives[$productId])) {
                shopProductSeoRemovePage($slug);
                $sitemap = $rebuildSitemap ? shopProductSeoRebuildSitemap($db, $config) : null;
                $url = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/') . '/magazin/produs/' . rawurlencode($slug) . '/';
                $indexNow = $notifyIndexNow ? shopProductSeoNotifyIndexNow([$url], $config) : null;
                return [
                    'success' => true,
                    'generated' => false,
                    'reason' => 'public_catalog_duplicate',
                    'url' => $url,
                    'sitemap' => $sitemap,
                    'indexnow' => $indexNow,
                ];
            }
        }
        $product = findProduct($db, $productId, $config, false, false);
        if (function_exists('applyCatalogPromotionPrices')) {
            $priced = applyCatalogPromotionPrices($db, [$product], null, '');
            if (isset($priced[0]) && is_array($priced[0])) $product = $priced[0];
        }
        $product['is_purchasable'] = !empty($product['is_purchasable']) && (bool)$state['is_active'] && (bool)$state['source_is_active'];
        $directory = shopProductSeoEnsureDirectory($slug);
        $dynamicPage = $directory . DIRECTORY_SEPARATOR . 'index.php';
        if (is_file($dynamicPage)) @unlink($dynamicPage);
        $path = $directory . DIRECTORY_SEPARATOR . 'index.html';
        if (file_put_contents($path, shopProductSeoRender($product, $config), LOCK_EX) === false) throw new RuntimeException('Pagina SEO a produsului nu poate fi scrisă.');
        $redirectPath = null;
        if ($oldSlug !== null && trim($oldSlug) !== '' && $oldSlug !== $slug) {
            $redirectPath = shopProductSeoWriteRedirect($oldSlug, $slug, $config);
        }
        $sitemap = $rebuildSitemap ? shopProductSeoRebuildSitemap($db, $config) : null;
        $url = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/') . '/magazin/produs/' . rawurlencode($slug) . '/';
        $notifyUrls = [$url];
        if ($oldSlug !== null && trim($oldSlug) !== '' && $oldSlug !== $slug) {
            $notifyUrls[] = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/') . '/magazin/produs/' . rawurlencode($oldSlug) . '/';
        }
        $indexNow = $notifyIndexNow ? shopProductSeoNotifyIndexNow($notifyUrls, $config) : null;
        return [
            'success' => true,
            'generated' => true,
            'purchasable' => (bool)$product['is_purchasable'],
            'reason' => (bool)$product['is_purchasable'] ? 'active' : 'inactive',
            'url' => $url,
            'path' => $path,
            'redirect_path' => $redirectPath,
            'sitemap' => $sitemap,
            'indexnow' => $indexNow,
        ];
    } catch (Throwable $error) {
        return ['success' => false, 'generated' => false, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}

function shopProductSeoSyncCatalogBatch(PDO $db, array $config, string $cursor = '', int $limit = 25): array {
    $limit = max(1, min(100, $limit));
    $statement = $db->prepare(
        'SELECT p.id
         FROM shop_products p
         LEFT JOIN shop_product_sources s ON s.id = p.source_id
         WHERE p.id > ?
           AND p.is_active = 1
           AND (p.source_id IS NULL OR COALESCE(s.is_active, 1) = 1)
         ORDER BY p.id ASC
         LIMIT ' . ($limit + 1)
    );
    $statement->execute([$cursor]);
    $productIds = array_values(array_map('strval', $statement->fetchAll(PDO::FETCH_COLUMN)));
    $hasMore = count($productIds) > $limit;
    if ($hasMore) array_pop($productIds);

    $results = [];
    $generated = 0;
    $failed = 0;
    foreach ($productIds as $productId) {
        $result = shopProductSeoSync($db, $config, $productId, null, false, false);
        $results[] = ['product_id' => $productId, ...$result];
        if (!empty($result['success'])) {
            if (!empty($result['generated'])) $generated++;
        } else {
            $failed++;
        }
    }

    $sitemap = null;
    $indexNow = null;
    if (!$hasMore) {
        $sitemap = shopProductSeoRebuildSitemap($db, $config);
        if (!empty($sitemap['url'])) $indexNow = shopProductSeoNotifyIndexNow([(string)$sitemap['url']], $config);
    }

    return [
        'success' => $failed === 0,
        'processed' => count($productIds),
        'generated' => $generated,
        'failed' => $failed,
        'cursor' => $productIds ? (string)end($productIds) : $cursor,
        'has_more' => $hasMore,
        'sitemap' => $sitemap,
        'indexnow' => $indexNow,
        'results' => $results,
    ];
}
