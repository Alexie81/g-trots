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

function shopProductSeoRender(array $product, array $config): string {
    $root = shopProductSeoWebsiteRoot();
    $templatePath = $root . DIRECTORY_SEPARATOR . 'produs.html';
    $html = file_get_contents($templatePath);
    if (!is_string($html) || $html === '') throw new RuntimeException('Șablonul public produs.html nu poate fi citit.');

    $websiteBaseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $slug = shopProductSeoSafeSlug((string)($product['slug'] ?? ''));
    $canonical = $websiteBaseUrl . '/magazin/produs/' . rawurlencode($slug) . '/';
    $name = shopProductSeoText($product['name'] ?? 'Produs G-Trots');
    $titleSource = shopProductSeoText($product['meta_title'] ?? '');
    $title = shopProductSeoExcerpt($titleSource !== '' ? $titleSource : $name . ' | G-Trots', 65);
    $descriptionSource = shopProductSeoText($product['meta_description'] ?? '');
    if ($descriptionSource === '') $descriptionSource = shopProductSeoText($product['short_description'] ?? '');
    if ($descriptionSource === '') $descriptionSource = shopProductSeoText($product['description_html'] ?? '');
    if ($descriptionSource === '') $descriptionSource = $name . ' disponibil la G-Trots, cu informații clare despre preț, compatibilitate, livrare și service pentru trotinete electrice.';
    $description = shopProductSeoExcerpt($descriptionSource, 160);
    $currency = trim((string)($product['currency'] ?? 'RON')) ?: 'RON';
    $price = (float)($product['promotion_price'] ?? $product['sale_price'] ?? $product['price'] ?? 0);
    $priceText = number_format(max(0, $price), 2, '.', '');
    $inStock = (string)($product['stock_mode'] ?? 'tracked') === 'unlimited' || (int)($product['stock_quantity'] ?? 0) > 0;
    $availabilityText = $inStock ? 'in stock' : 'out of stock';
    $availabilitySchema = $inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
    $conditionSearch = mb_strtolower($name . ' ' . $description, 'UTF-8');
    $itemCondition = preg_match('/second[\s-]*hand|recondiționat|reconditionat|refurbished|folosit/u', $conditionSearch)
        ? 'https://schema.org/UsedCondition'
        : 'https://schema.org/NewCondition';
    $images = [];
    foreach ((array)($product['images'] ?? []) as $image) {
        $url = shopProductSeoAbsoluteUrl((string)($image['url'] ?? $image['image_path'] ?? ''), $websiteBaseUrl);
        if ($url !== '' && !in_array($url, $images, true)) $images[] = $url;
    }
    if (!$images) $images[] = $websiteBaseUrl . '/assets/magazin-produse-v1.png';
    $brand = shopProductSeoText($product['manufacturer_name'] ?? '');
    if ($brand === '' && !empty($product['brands'][0]['name'])) $brand = shopProductSeoText($product['brands'][0]['name']);
    if ($brand === '') $brand = 'G-Trots';

    $productSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'Product',
        '@id' => $canonical . '#product',
        'name' => $name,
        'description' => $description,
        'image' => $images,
        'url' => $canonical,
        'sku' => trim((string)($product['sku'] ?? '')) ?: null,
        'mpn' => trim((string)($product['supplier_product_code'] ?? $product['sku'] ?? '')) ?: null,
        'category' => trim((string)($product['category_name'] ?? '')) ?: null,
        'brand' => ['@type' => 'Brand', 'name' => $brand],
        'offers' => [
            '@type' => 'Offer',
            'url' => $canonical,
            'priceCurrency' => $currency,
            'price' => $priceText,
            'availability' => $availabilitySchema,
            'itemCondition' => $itemCondition,
            'seller' => ['@type' => 'Organization', 'name' => 'G-Trots România'],
            'hasMerchantReturnPolicy' => [
                '@type' => 'MerchantReturnPolicy',
                'applicableCountry' => 'RO',
                'returnPolicyCountry' => 'RO',
                'returnPolicyCategory' => 'https://schema.org/MerchantReturnFiniteReturnWindow',
                'merchantReturnDays' => 14,
                'returnMethod' => 'https://schema.org/ReturnByMail',
                'returnFees' => 'https://schema.org/ReturnFeesCustomerResponsibility',
                'merchantReturnLink' => $websiteBaseUrl . '/politica-de-retur',
            ],
        ],
    ];
    foreach ($productSchema as $key => $value) if ($value === null || $value === '') unset($productSchema[$key]);
    $gtin = preg_replace('/\D+/', '', (string)($product['gtin'] ?? $product['ean'] ?? ''));
    if (in_array(strlen($gtin), [8, 12, 13, 14], true)) $productSchema['gtin' . strlen($gtin)] = $gtin;
    if ((int)($product['review_count'] ?? 0) > 0 && (float)($product['review_average'] ?? 0) > 0) {
        $productSchema['aggregateRating'] = [
            '@type' => 'AggregateRating',
            'ratingValue' => number_format((float)$product['review_average'], 2, '.', ''),
            'reviewCount' => (int)$product['review_count'],
        ];
    }
    $properties = [];
    foreach (array_slice((array)($product['specifications'] ?? []), 0, 40) as $specification) {
        $label = shopProductSeoText($specification['label'] ?? '');
        $value = shopProductSeoText($specification['value'] ?? '');
        if ($label !== '' && $value !== '') $properties[] = ['@type' => 'PropertyValue', 'name' => $label, 'value' => $value];
    }
    if ($properties) $productSchema['additionalProperty'] = $properties;
    $breadcrumbSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'BreadcrumbList',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Acasă', 'item' => $websiteBaseUrl . '/'],
            ['@type' => 'ListItem', 'position' => 2, 'name' => 'Magazin', 'item' => $websiteBaseUrl . '/magazin'],
            ['@type' => 'ListItem', 'position' => 3, 'name' => $name, 'item' => $canonical],
        ],
    ];
    $schemas = [$productSchema, $breadcrumbSchema];
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
    $html = shopProductSeoReplaceMeta($html, 'name', 'twitter:title', $title);
    $html = shopProductSeoReplaceMeta($html, 'name', 'twitter:description', $description);
    $html = shopProductSeoReplaceMeta($html, 'name', 'twitter:image', $images[0]);
    $html = shopProductSeoReplaceMeta($html, 'property', 'product:price:amount', $priceText);
    $html = shopProductSeoReplaceMeta($html, 'property', 'product:price:currency', $currency);
    $html = shopProductSeoReplaceMeta($html, 'property', 'product:availability', $availabilityText);
    $canonicalEscaped = htmlspecialchars($canonical, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    $html = (string)preg_replace('#<link\s+rel="canonical"\s+href="[^"]*"\s*/?>#i', '<link rel="canonical" href="' . $canonicalEscaped . '">', $html, 1);
    $html = (string)preg_replace('#\s*<script\s+type="application/ld\+json"(?![^>]*data-gt-organization-schema)[^>]*>.*?</script>#is', '', $html);
    $headScripts = '';
    foreach ($schemas as $index => $schema) {
        $schemaAttribute = ($schema['@type'] ?? '') === 'BreadcrumbList'
            ? 'data-gt-breadcrumb-schema'
            : 'data-gt-product-schema="' . ($index + 1) . '"';
        $headScripts .= '    <script type="application/ld+json" ' . $schemaAttribute . '>' . shopProductSeoJson($schema) . '</script>' . PHP_EOL;
    }
    $headScripts .= '    <script type="application/json" id="gt-product-bootstrap">' . shopProductSeoJson($product) . '</script>' . PHP_EOL;
    $html = str_replace('</head>', $headScripts . '  </head>', $html);
    $html = (string)preg_replace_callback('/(<body\b[^>]*\bdata-product-id=")[^"]*(")/i', static fn(array $match): string => $match[1] . htmlspecialchars($slug, ENT_QUOTES | ENT_HTML5, 'UTF-8') . $match[2], $html, 1);

    $staticSpecs = '';
    foreach (array_slice($properties, 0, 8) as $property) {
        $staticSpecs .= '<li><strong>' . htmlspecialchars((string)$property['name'], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</strong><span>' . htmlspecialchars((string)$property['value'], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</span></li>';
    }
    $staticArticle = '<article class="product-static-seo shell" data-gt-static-product aria-labelledby="gt-static-product-title">'
        . '<div><p class="product-static-seo__eyebrow">Produs G-Trots</p><h1 id="gt-static-product-title">' . htmlspecialchars($name, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</h1>'
        . '<p>' . htmlspecialchars($description, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</p><strong class="product-static-seo__price">' . htmlspecialchars($priceText . ' ' . $currency, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</strong>'
        . '<span class="product-static-seo__stock">' . ($inStock ? 'În stoc' : 'Stoc epuizat') . '</span>' . ($staticSpecs !== '' ? '<ul>' . $staticSpecs . '</ul>' : '') . '</div>'
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
    $legacyPage = $productRoot . DIRECTORY_SEPARATOR . $slug . '.html';
    if (is_file($legacyPage)) @unlink($legacyPage);
    if (is_dir($directory)) @rmdir($directory);
}

function shopProductSeoRebuildSitemap(PDO $db, array $config): array {
    $root = shopProductSeoWebsiteRoot();
    $directory = $root . DIRECTORY_SEPARATOR . 'sitemaps';
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) throw new RuntimeException('Directorul sitemap nu poate fi creat.');
    $websiteBaseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $rows = $db->query(
        'SELECT p.slug, p.updated_at,
                (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image_path
         FROM shop_products p
         LEFT JOIN shop_product_sources s ON s.id = p.source_id
         WHERE p.is_active = 1 AND (p.source_id IS NULL OR COALESCE(s.is_active, 1) = 1)
         ORDER BY p.slug ASC'
    )->fetchAll();
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
    return ['success' => true, 'products' => count($rows), 'path' => $path, 'url' => $websiteBaseUrl . '/sitemaps/sitemap-produse.xml'];
}

function shopProductSeoSync(PDO $db, array $config, string $productId, ?string $oldSlug = null, bool $rebuildSitemap = true): array {
    try {
        $stateStmt = $db->prepare('SELECT id, slug, is_active FROM shop_products WHERE id = ? LIMIT 1');
        $stateStmt->execute([$productId]);
        $state = $stateStmt->fetch();
        if ($oldSlug !== null && (!$state || (string)$state['slug'] !== $oldSlug)) shopProductSeoRemovePage($oldSlug);
        if (!$state) {
            if ($rebuildSitemap) shopProductSeoRebuildSitemap($db, $config);
            return ['success' => true, 'generated' => false, 'reason' => 'deleted'];
        }
        $slug = (string)$state['slug'];
        if (!(bool)$state['is_active']) {
            shopProductSeoRemovePage($slug);
            if ($rebuildSitemap) shopProductSeoRebuildSitemap($db, $config);
            return ['success' => true, 'generated' => false, 'reason' => 'inactive'];
        }
        try {
            $product = findProduct($db, $productId, $config, true);
        } catch (InvalidArgumentException) {
            shopProductSeoRemovePage($slug);
            if ($rebuildSitemap) shopProductSeoRebuildSitemap($db, $config);
            return ['success' => true, 'generated' => false, 'reason' => 'inactive_source'];
        }
        $directory = shopProductSeoWebsiteRoot() . DIRECTORY_SEPARATOR . 'magazin' . DIRECTORY_SEPARATOR . 'produs' . DIRECTORY_SEPARATOR . shopProductSeoSafeSlug($slug);
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) throw new RuntimeException('Directorul paginii produsului nu poate fi creat.');
        $path = $directory . DIRECTORY_SEPARATOR . 'index.html';
        if (file_put_contents($path, shopProductSeoRender($product, $config), LOCK_EX) === false) throw new RuntimeException('Pagina SEO a produsului nu poate fi scrisă.');
        $sitemap = $rebuildSitemap ? shopProductSeoRebuildSitemap($db, $config) : null;
        return [
            'success' => true,
            'generated' => true,
            'url' => rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/') . '/magazin/produs/' . rawurlencode($slug) . '/',
            'path' => $path,
            'sitemap' => $sitemap,
        ];
    } catch (Throwable $error) {
        return ['success' => false, 'generated' => false, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}
