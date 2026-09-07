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
    $title = $titleSource !== ''
        ? $titleSource
        : shopProductSeoExcerpt($name, 55) . ' | G-Trots';
    $customDescription = shopProductSeoText($product['meta_description'] ?? '');
    $descriptionSource = $customDescription;
    if ($descriptionSource === '') $descriptionSource = shopProductSeoText($product['short_description'] ?? '');
    if ($descriptionSource === '') $descriptionSource = shopProductSeoText($product['description_html'] ?? '');
    if ($descriptionSource === '') $descriptionSource = $name . ' disponibil la G-Trots, cu informații clare despre preț, compatibilitate, livrare și service pentru trotinete electrice.';
    $description = $customDescription !== '' ? $customDescription : shopProductSeoExcerpt($descriptionSource, 160);
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
            'seller' => ['@id' => $websiteBaseUrl . '/#organization'],
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
    $html = (string)preg_replace_callback('/(<body\b[^>]*\bdata-product-id=")[^"]*(")/i', static fn(array $match): string => $match[1] . htmlspecialchars($slug, ENT_QUOTES | ENT_HTML5, 'UTF-8') . $match[2], $html, 1);

    $staticSpecs = '';
    foreach (array_slice($properties, 0, 8) as $property) {
        $staticSpecs .= '<li><strong>' . htmlspecialchars((string)$property['name'], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</strong><span>' . htmlspecialchars((string)$property['value'], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</span></li>';
    }
    $staticArticle = '<article class="product-static-seo shell' . ($purchasable ? '' : ' is-unavailable') . '" data-gt-static-product aria-labelledby="gt-static-product-title">'
        . '<div><p class="product-static-seo__eyebrow">' . ($purchasable ? 'Produs G-Trots' : 'Temporar indisponibil') . '</p><h1 id="gt-static-product-title">' . htmlspecialchars($name, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</h1>'
        . '<p>' . htmlspecialchars($description, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</p><strong class="product-static-seo__price">' . htmlspecialchars($priceText . ' ' . $currency, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</strong>'
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
