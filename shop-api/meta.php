<?php
declare(strict_types=1);

/**
 * Integrarea Meta: catalog CSV public si Conversions API. Tokenul CAPI ramane
 * exclusiv in config.local.php; browserul primeste numai ID-ul public Pixel.
 */

function metaPixelId(array $config): string {
    $pixelId = trim((string)($config['meta_pixel_id'] ?? ''));
    return preg_match('/^\d{8,30}$/', $pixelId) ? $pixelId : '';
}

function metaConversionsConfigured(array $config): bool {
    return metaPixelId($config) !== ''
        && trim((string)($config['meta_conversion_access_token'] ?? '')) !== '';
}

function metaConversionsEnabled(array $config): bool {
    $value = $config['meta_conversion_api_enabled'] ?? false;
    if (is_bool($value)) return $value && metaConversionsConfigured($config);
    return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on', 'enabled'], true)
        && metaConversionsConfigured($config);
}

function metaPublicConfig(array $config): array {
    return [
        'pixel_id' => metaPixelId($config),
        'conversions_api_enabled' => metaConversionsEnabled($config),
        'catalog_feed_url' => rtrim((string)($config['public_base_url'] ?? 'https://g-trots.ro/shop-api'), '/')
            . '/api-v2.php?action=metaCatalogFeed',
    ];
}

function metaCatalogProducts(PDO $db, array $config): array {
    $sql = publicCatalogProductSelectSql() . " WHERE p.is_active = 1
        AND (p.source_id IS NULL OR COALESCE(s.is_active, 1) = 1)
        AND (p.category_id IS NULL OR COALESCE(c.is_active, 0) = 1)
        AND (p.manufacturer_id IS NULL OR COALESCE(m.is_active, 0) = 1)
        AND NOT EXISTS (
            SELECT 1 FROM shop_product_brands pbx
            INNER JOIN shop_brands bx ON bx.id = pbx.brand_id
            WHERE pbx.product_id = p.id AND bx.is_active = 0
        )
        ORDER BY " . productStockOrderSql() . " ASC, p.is_featured DESC,
            COALESCE(p.featured_rank, 2147483647) ASC, p.created_at DESC
        LIMIT 2500";
    $rows = $db->query($sql)->fetchAll();
    $products = publicCatalogRows($db, deduplicateCatalogProductRows($rows), $config);
    return applyCatalogPromotionPrices($db, $products, null, '');
}

function metaCatalogText(mixed $value, int $limit): string {
    $text = html_entity_decode(strip_tags((string)$value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = trim((string)preg_replace('/\s+/u', ' ', $text));
    return mb_substr($text, 0, $limit, 'UTF-8');
}

function metaCatalogCsv(PDO $db, array $config): string {
    $stream = fopen('php://temp', 'w+b');
    if ($stream === false) throw new RuntimeException('Catalogul Meta nu poate fi pregatit.');
    $headers = [
        'id', 'title', 'description', 'availability', 'condition', 'price', 'link',
        'image_link', 'additional_image_link', 'brand', 'product_type', 'mpn', 'gtin',
        'inventory', 'custom_label_0',
    ];
    fputcsv($stream, $headers, ',', '"', '\\', "\r\n");
    $baseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    foreach (metaCatalogProducts($db, $config) as $product) {
        $price = function_exists('stripeEffectiveProductPrice')
            ? stripeEffectiveProductPrice($product)
            : max(0.0, (float)($product['promotion_price'] ?? 0), (float)($product['sale_price'] ?? 0), (float)($product['price'] ?? 0), (float)($product['supplier_base_price'] ?? 0));
        if ($price <= 0) continue;
        $images = array_values(array_unique(array_filter(array_map(
            static fn(array $image): string => trim((string)($image['url'] ?? '')),
            (array)($product['images'] ?? [])
        ), static fn(string $url): bool => (bool)preg_match('#^https://#i', $url))));
        if (!$images) continue;
        $description = metaCatalogText($product['meta_description'] ?? '', 5000);
        if ($description === '') $description = metaCatalogText($product['short_description'] ?? '', 5000);
        if ($description === '') $description = metaCatalogText($product['description_html'] ?? '', 5000);
        if ($description === '') $description = 'Produs disponibil in magazinul online G-Trots.';
        $stockAvailable = (bool)($product['stock_available'] ?? (
            (string)($product['stock_mode'] ?? 'tracked') === 'unlimited'
            || (int)($product['stock_quantity'] ?? 0) > 0
        ));
        $brand = metaCatalogText($product['manufacturer_name'] ?? '', 100);
        if ($brand === '' && !empty($product['brands'][0]['name'])) $brand = metaCatalogText($product['brands'][0]['name'], 100);
        if ($brand === '') $brand = 'G-Trots';
        $gtin = function_exists('merchantValidGtin') ? merchantValidGtin((string)($product['ean'] ?? '')) : null;
        $mpn = trim((string)($product['supplier_product_code'] ?? $product['sku'] ?? ''));
        $conditionText = mb_strtolower((string)($product['category_name'] ?? '') . ' ' . (string)($product['name'] ?? ''), 'UTF-8');
        $condition = preg_match('/second[\s-]*hand|reconditionat|recondiționat|folosit/u', $conditionText) ? 'used' : 'new';
        $inventory = (string)($product['stock_mode'] ?? 'tracked') === 'unlimited'
            ? 999999
            : max(0, (int)($product['stock_quantity'] ?? 0));
        fputcsv($stream, [
            (string)$product['id'],
            metaCatalogText(function_exists('merchantProductTitle') ? merchantProductTitle((string)$product['name']) : $product['name'], 200),
            $description,
            $stockAvailable ? 'in stock' : 'out of stock',
            $condition,
            number_format($price, 2, '.', '') . ' ' . strtoupper((string)($product['currency'] ?? 'RON')),
            $baseUrl . '/magazin/produs/' . rawurlencode((string)$product['slug']) . '/',
            $images[0],
            implode(',', array_slice($images, 1, 20)),
            $brand,
            metaCatalogText($product['category_name'] ?? 'Piese si accesorii pentru mobilitate electrica', 750),
            mb_substr($mpn, 0, 100, 'UTF-8'),
            $gtin ?? '',
            $inventory,
            'Catalog G-Trots',
        ], ',', '"', '\\', "\r\n");
    }
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    if (!is_string($csv)) throw new RuntimeException('Catalogul Meta nu poate fi citit.');
    return $csv;
}

function metaRequestOriginAllowed(array $config): bool {
    $expected = strtolower((string)(parse_url((string)($config['website_base_url'] ?? 'https://g-trots.ro'), PHP_URL_HOST) ?: 'g-trots.ro'));
    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin === '') return false;
    $host = strtolower((string)(parse_url($origin, PHP_URL_HOST) ?: ''));
    return $host === $expected || $host === 'www.' . preg_replace('/^www\./', '', $expected);
}

function metaNormalizeHashValue(string $field, mixed $value): string {
    $value = trim((string)$value);
    if ($value === '') return '';
    if ($field === 'em') $value = mb_strtolower($value, 'UTF-8');
    if ($field === 'ph') {
        $value = preg_replace('/\D+/', '', $value) ?: '';
        if (str_starts_with($value, '0')) $value = '40' . substr($value, 1);
    }
    if (in_array($field, ['fn', 'ln', 'ct', 'st', 'country'], true)) {
        $value = mb_strtolower($value, 'UTF-8');
        if (function_exists('transliterator_transliterate')) {
            $value = (string)transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $value);
        }
        $value = preg_replace('/[^a-z0-9]/', '', $value) ?: '';
    }
    if ($field === 'zp') $value = preg_replace('/[^a-z0-9]/i', '', mb_strtolower($value, 'UTF-8')) ?: '';
    if ($field === 'external_id') $value = mb_strtolower($value, 'UTF-8');
    return $value === '' ? '' : hash('sha256', $value);
}

function metaConversionEvent(array $input): array {
    $standard = ['PageView', 'ViewContent', 'Search', 'AddToWishlist', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Contact', 'Lead', 'CompleteRegistration'];
    $custom = [
        'ViewCategory', 'SelectItem', 'RemoveFromWishlist', 'RemoveFromCart',
        'ViewCart', 'AddShippingInfo', 'FormStart', 'FormSubmit', 'Refund',
        'Login', 'ViewPromotion', 'SelectPromotion', 'PaymentFailed', 'PaymentCancelled',
    ];
    $eventName = trim((string)($input['event_name'] ?? ''));
    if (!in_array($eventName, [...$standard, ...$custom], true)) throw new InvalidArgumentException('Evenimentul Meta nu este permis.');
    $eventId = trim((string)($input['event_id'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9_-]{10,100}$/', $eventId)) throw new InvalidArgumentException('ID-ul evenimentului Meta nu este valid.');
    $eventTime = (int)($input['event_time'] ?? time());
    if ($eventTime < time() - 600 || $eventTime > time() + 60) throw new InvalidArgumentException('Timpul evenimentului Meta nu este valid.');
    $sourceUrl = trim((string)($input['event_source_url'] ?? ''));
    $sourceHost = strtolower((string)(parse_url($sourceUrl, PHP_URL_HOST) ?: ''));
    if (!in_array($sourceHost, ['g-trots.ro', 'www.g-trots.ro'], true)) throw new InvalidArgumentException('Sursa evenimentului Meta nu este valida.');

    $user = is_array($input['user_data'] ?? null) ? $input['user_data'] : [];
    $userData = [
        'client_ip_address' => mb_substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64),
        'client_user_agent' => mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500),
    ];
    foreach (['fbp', 'fbc'] as $key) {
        $value = trim((string)($user[$key] ?? ''));
        if ($value !== '' && strlen($value) <= 200) $userData[$key] = $value;
    }
    foreach (['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id'] as $key) {
        $hashed = metaNormalizeHashValue($key, $user[$key] ?? '');
        if ($hashed !== '') $userData[$key] = [$hashed];
    }

    $customInput = is_array($input['custom_data'] ?? null) ? $input['custom_data'] : [];
    $customData = [];
    if (isset($customInput['value']) && is_numeric($customInput['value'])) $customData['value'] = max(0.0, min(10000000.0, (float)$customInput['value']));
    $currency = strtoupper(trim((string)($customInput['currency'] ?? 'RON')));
    if (preg_match('/^[A-Z]{3}$/', $currency)) $customData['currency'] = $currency;
    foreach ([
        'content_name', 'content_category', 'content_type', 'search_string',
        'order_id', 'payment_type', 'shipping_tier', 'form_id',
        'contact_method', 'registration_method', 'login_method',
    ] as $key) {
        $value = metaCatalogText($customInput[$key] ?? '', 300);
        if ($value !== '') $customData[$key] = $value;
    }
    $ids = array_values(array_filter(array_map(static fn($id): string => mb_substr(trim((string)$id), 0, 180), array_slice((array)($customInput['content_ids'] ?? []), 0, 100))));
    if ($ids) $customData['content_ids'] = $ids;
    $contents = [];
    foreach (array_slice((array)($customInput['contents'] ?? []), 0, 100) as $content) {
        if (!is_array($content)) continue;
        $id = mb_substr(trim((string)($content['id'] ?? '')), 0, 180);
        if ($id === '') continue;
        $row = ['id' => $id, 'quantity' => max(1, min(999, (int)($content['quantity'] ?? 1)))];
        if (isset($content['item_price']) && is_numeric($content['item_price'])) $row['item_price'] = max(0.0, min(10000000.0, (float)$content['item_price']));
        $contents[] = $row;
    }
    if ($contents) $customData['contents'] = $contents;
    if (isset($customInput['num_items'])) $customData['num_items'] = max(0, min(9999, (int)$customInput['num_items']));

    return [
        'event_name' => $eventName,
        'event_time' => $eventTime,
        'event_id' => $eventId,
        'event_source_url' => $sourceUrl,
        'action_source' => 'website',
        'user_data' => $userData,
        'custom_data' => $customData,
    ];
}

function metaSendConversion(array $config, array $event): array {
    if (!metaConversionsEnabled($config)) return ['status' => 'disabled'];
    if (!function_exists('curl_init')) throw new RuntimeException('Extensia cURL este necesara pentru Meta Conversions API.');
    $version = trim((string)($config['meta_graph_api_version'] ?? 'v26.0'));
    if (!preg_match('/^v\d{1,3}\.\d$/', $version)) $version = 'v26.0';
    $url = 'https://graph.facebook.com/' . $version . '/' . rawurlencode(metaPixelId($config))
        . '/events?access_token=' . rawurlencode(trim((string)$config['meta_conversion_access_token']));
    $payload = ['data' => [$event]];
    $testCode = trim((string)($config['meta_test_event_code'] ?? ''));
    if ($testCode !== '') $payload['test_event_code'] = $testCode;
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8', 'Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
    ]);
    $raw = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if ($status < 200 || $status >= 300) {
        $message = is_array($decoded) ? trim((string)($decoded['error']['message'] ?? '')) : '';
        throw new RuntimeException('Meta Conversions API: ' . ($message ?: ($error ?: 'HTTP ' . $status)));
    }
    return ['status' => 'sent', 'events_received' => (int)($decoded['events_received'] ?? 0), 'fbtrace_id' => (string)($decoded['fbtrace_id'] ?? '')];
}
