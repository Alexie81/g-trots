<?php
declare(strict_types=1);

/**
 * Sincronizare Google Merchant API fără Composer, potrivită hostingului shared.
 * Cheia contului de serviciu stă exclusiv în config.local.php (base64), niciodată
 * în Git sau într-un răspuns public.
 */

function merchantIsConfigured(array $config): bool {
    return trim((string)($config['merchant_account_id'] ?? '')) !== ''
        && trim((string)($config['merchant_data_source_id'] ?? '')) !== ''
        && trim((string)($config['merchant_service_account_json_base64'] ?? '')) !== '';
}

function merchantSyncIsEnabled(array $config): bool {
    $value = $config['merchant_sync_enabled'] ?? false;
    if (is_bool($value)) return $value;
    if (is_int($value) || is_float($value)) return (int)$value === 1;
    return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on', 'enabled'], true);
}

function merchantBase64Url(string $value): string {
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function merchantCredentials(array $config): array {
    $encoded = trim((string)($config['merchant_service_account_json_base64'] ?? ''));
    $raw = base64_decode($encoded, true);
    $credentials = $raw === false ? null : json_decode($raw, true);
    if (!is_array($credentials)
        || trim((string)($credentials['client_email'] ?? '')) === ''
        || trim((string)($credentials['private_key'] ?? '')) === '') {
        throw new RuntimeException('Credentialele Google Merchant nu sunt valide.');
    }
    return $credentials;
}

function merchantAccessToken(array $config): string {
    static $cached = [];
    $credentials = merchantCredentials($config);
    $cacheKey = (string)$credentials['client_email'];
    if (isset($cached[$cacheKey]) && (int)$cached[$cacheKey]['expires_at'] > time() + 60) {
        return (string)$cached[$cacheKey]['token'];
    }
    if (!function_exists('openssl_sign')) throw new RuntimeException('OpenSSL este necesar pentru Google Merchant.');
    $now = time();
    $header = merchantBase64Url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_UNESCAPED_SLASHES));
    $claims = merchantBase64Url(json_encode([
        'iss' => (string)$credentials['client_email'],
        'scope' => 'https://www.googleapis.com/auth/content',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3500,
    ], JSON_UNESCAPED_SLASHES));
    $signingInput = $header . '.' . $claims;
    $signature = '';
    if (!openssl_sign($signingInput, $signature, (string)$credentials['private_key'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Semnarea autentificării Google Merchant a eșuat.');
    }
    $curl = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $signingInput . '.' . merchantBase64Url($signature),
        ], '', '&', PHP_QUERY_RFC3986),
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 25,
    ]);
    $raw = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    $response = is_string($raw) ? json_decode($raw, true) : null;
    $token = is_array($response) ? trim((string)($response['access_token'] ?? '')) : '';
    if ($status < 200 || $status >= 300 || $token === '') {
        throw new RuntimeException('Autentificarea Google Merchant a eșuat' . ($error !== '' ? ': ' . $error : ' (' . $status . ').'));
    }
    $cached[$cacheKey] = ['token' => $token, 'expires_at' => $now + max(300, (int)($response['expires_in'] ?? 3600))];
    return $token;
}

function merchantRequest(array $config, string $method, string $url, ?array $payload = null): array {
    if (!merchantIsConfigured($config)) throw new RuntimeException('Google Merchant nu este configurat pe server.');
    if (!function_exists('curl_init')) throw new RuntimeException('Extensia cURL este necesară pentru Google Merchant.');
    $curl = curl_init($url);
    $headers = [
        'Authorization: Bearer ' . merchantAccessToken($config),
        'Accept: application/json',
    ];
    if ($payload !== null) $headers[] = 'Content-Type: application/json; charset=utf-8';
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 35,
    ]);
    if ($payload !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }
    $raw = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);
    if ($raw === false) throw new RuntimeException('Conexiunea Google Merchant a eșuat: ' . ($curlError ?: 'eroare necunoscută'));
    $decoded = trim((string)$raw) === '' ? [] : json_decode((string)$raw, true);
    if ($status < 200 || $status >= 300) {
        $message = is_array($decoded) ? trim((string)($decoded['error']['message'] ?? '')) : '';
        throw new RuntimeException('Google Merchant: ' . ($message !== '' ? $message : 'cererea nu a putut fi procesată (' . $status . ').'));
    }
    return is_array($decoded) ? $decoded : [];
}

function merchantAccountName(array $config): string {
    return 'accounts/' . trim((string)$config['merchant_account_id']);
}

function merchantDataSourceName(array $config): string {
    return merchantAccountName($config) . '/dataSources/' . trim((string)$config['merchant_data_source_id']);
}

function merchantProductInputName(array $config, string $productId): string {
    return merchantAccountName($config) . '/productInputs/' . merchantBase64Url('ro~RO~' . $productId);
}

function merchantRegisterGcp(array $config): array {
    $account = merchantAccountName($config);
    return merchantRequest(
        $config,
        'POST',
        'https://merchantapi.googleapis.com/accounts/v1/' . $account . '/developerRegistration:registerGcp',
        ['developerEmail' => (string)($config['merchant_developer_email'] ?? 'servicegtrots@gmail.com')]
    );
}

function merchantProductIsVisible(array $product): bool {
    return (bool)($product['is_purchasable'] ?? (
        (bool)($product['is_active'] ?? false)
        && (bool)($product['source_is_active'] ?? true)
        && (bool)($product['category_is_active'] ?? true)
        && (bool)($product['manufacturer_is_active'] ?? true)
        && (bool)($product['brands_are_active'] ?? true)
    ));
}

function merchantValidGtin(string $value): ?string {
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

function merchantProductTitle(string $value): string {
    $title = trim(preg_replace('/\s+/u', ' ', $value) ?: '');
    $letters = preg_replace('/[^\p{L}]+/u', '', $title) ?: '';
    $letterCount = preg_match_all('/\p{L}/u', $title, $letterMatches);
    $uppercaseCount = preg_match_all('/\p{Lu}/u', $title, $uppercaseMatches);
    $allCaps = $letters !== '' && mb_strtoupper($letters, 'UTF-8') === $letters && mb_strtolower($letters, 'UTF-8') !== $letters;
    $excessCaps = $letterCount >= 8 && $uppercaseCount / $letterCount >= 0.6;
    if ($allCaps || $excessCaps) {
        $title = mb_convert_case(mb_strtolower($title, 'UTF-8'), MB_CASE_TITLE, 'UTF-8');
        $title = (string)preg_replace_callback(
            '/\b(\d+(?:[.,]\d+)?)\s*(ah|wh|mah|kw|v|w|a|s|h)\b/iu',
            static fn(array $match): string => $match[1] . strtoupper($match[2]),
            $title
        );
        $title = (string)preg_replace_callback(
            '/\b(bms|led|lcd|usb|gps|oem|dc|ac|niu|vsett)\b/iu',
            static fn(array $match): string => strtoupper($match[1]),
            $title
        );
        if (preg_match('/^BMS\b/iu', $title)) {
            $title = 'Modul de protecție pentru baterie ' . $title;
        }
        // Un titlu alcătuit doar din acronime și specificații rămâne lizibil și
        // nu mai este interpretat de Google ca exces de majuscule.
        $normalizedLetters = preg_replace('/[^\p{L}]+/u', '', $title) ?: '';
        if ($normalizedLetters !== '' && mb_strtoupper($normalizedLetters, 'UTF-8') === $normalizedLetters) {
            $title = 'Modul ' . $title;
        }
    }
    $technicalTokens = preg_match_all('/\b(?:\d+(?:[.,]\d+)?(?:V|W|A|S|H)|LCD|[A-Z]{2,}(?:-[A-Z0-9]+)*)\b/u', $title, $technicalMatches);
    if (preg_match('/^Controller\b/iu', $title) && $technicalTokens >= 3 && stripos($title, 'pentru trotinetă electrică') === false) {
        $title = 'Controller pentru trotinetă electrică ' . trim(mb_substr($title, mb_strlen('Controller', 'UTF-8'), null, 'UTF-8'));
    }
    return $title;
}

function merchantProductPayload(array $product, array $config): array {
    $description = trim((string)($product['meta_description'] ?? ''));
    if ($description === '') $description = trim((string)($product['short_description'] ?? ''));
    if ($description === '') $description = trim(strip_tags((string)($product['description_html'] ?? '')));
    $description = preg_replace('/\s+/u', ' ', $description) ?: '';
    $baseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $images = [];
    foreach ((array)($product['images'] ?? []) as $image) {
        $url = trim((string)($image['url'] ?? ''));
        if (preg_match('#^https://#i', $url)) $images[] = $url;
    }
    $images = array_values(array_unique($images));
    $price = function_exists('stripeEffectiveProductPrice')
        ? stripeEffectiveProductPrice($product)
        : max(0.0, (float)($product['sale_price'] ?? 0), (float)($product['price'] ?? 0), (float)($product['supplier_base_price'] ?? 0));
    $stockAvailable = (string)($product['stock_mode'] ?? 'tracked') === 'unlimited' || (int)($product['stock_quantity'] ?? 0) > 0;
    $attributes = [
        'title' => mb_substr(merchantProductTitle((string)($product['name'] ?? 'Produs G-Trots')), 0, 150),
        'description' => mb_substr($description !== '' ? $description : 'Produs disponibil în magazinul online G-Trots.', 0, 5000),
        'link' => $baseUrl . '/magazin/produs/' . rawurlencode((string)$product['slug']) . '/',
        'availability' => $stockAvailable ? 'IN_STOCK' : 'OUT_OF_STOCK',
        'price' => [
            'amountMicros' => (string)max(0, (int)round($price * 1000000)),
            'currencyCode' => strtoupper((string)($product['currency'] ?? 'RON')),
        ],
        'condition' => (string)($product['category_id'] ?? '') === (defined('SHOP_CATEGORY_SECOND_HAND_ID') ? SHOP_CATEGORY_SECOND_HAND_ID : '') ? 'USED' : 'NEW',
    ];
    if ($images) {
        $attributes['imageLink'] = $images[0];
        if (count($images) > 1) $attributes['additionalImageLinks'] = array_slice($images, 1, 10);
    }
    $brand = trim((string)($product['manufacturer_name'] ?? ''));
    if ($brand === '' && !empty($product['brands'][0]['name'])) $brand = trim((string)$product['brands'][0]['name']);
    if ($brand !== '') $attributes['brand'] = mb_substr($brand, 0, 70);
    $gtin = merchantValidGtin((string)($product['ean'] ?? ''));
    if ($gtin !== null) $attributes['gtins'] = [$gtin];
    $mpn = trim((string)($product['supplier_product_code'] ?? $product['sku'] ?? ''));
    if ($mpn !== '') $attributes['mpn'] = mb_substr($mpn, 0, 70);
    return [
        'offerId' => (string)$product['id'],
        'contentLanguage' => 'ro',
        'feedLabel' => 'RO',
        'productAttributes' => $attributes,
    ];
}

function merchantRecordProductSync(PDO $db, string $productId, ?string $error): void {
    $stmt = $db->prepare('UPDATE shop_products SET merchant_synced_at = ?, merchant_sync_error = ?, updated_at = updated_at WHERE id = ?');
    $stmt->execute([
        $error === null ? date('Y-m-d H:i:s') : null,
        $error === null ? null : mb_substr($error, 0, 500),
        $productId,
    ]);
}

function merchantDeleteProduct(array $config, string $productId): array {
    if (!merchantSyncIsEnabled($config)) return ['status' => 'disabled'];
    if (!merchantIsConfigured($config)) return ['status' => 'not_configured'];
    $url = 'https://merchantapi.googleapis.com/products/v1/' . merchantProductInputName($config, $productId)
        . '?dataSource=' . rawurlencode(merchantDataSourceName($config));
    try {
        merchantRequest($config, 'DELETE', $url);
        return ['status' => 'deleted'];
    } catch (Throwable $error) {
        if (stripos($error->getMessage(), 'not found') !== false || stripos($error->getMessage(), '404') !== false) {
            return ['status' => 'already_absent'];
        }
        throw $error;
    }
}

function merchantSyncProduct(PDO $db, array $config, string $productId): array {
    if (!merchantSyncIsEnabled($config)) return ['status' => 'disabled'];
    if (!merchantIsConfigured($config)) {
        merchantRecordProductSync($db, $productId, 'Google Merchant nu este configurat.');
        return ['status' => 'not_configured'];
    }
    $product = findProduct($db, $productId, $config, false, true);
    $skipCatalogDedup = !empty($GLOBALS['merchant_skip_catalog_dedup']);
    $catalogIds = !$skipCatalogDedup && function_exists('catalogRepresentativeProductIds') ? catalogRepresentativeProductIds($db) : [];
    if (!$skipCatalogDedup && $catalogIds && empty($catalogIds[$productId])) {
        $result = merchantDeleteProduct($config, $productId);
        merchantRecordProductSync($db, $productId, null);
        return [...$result, 'reason' => 'public_catalog_duplicate'];
    }
    // Merchant trebuie să publice exact prețul pe care îl vede un vizitator
    // anonim în catalog. Asta include promoțiile automate pe produs, nu doar
    // prețul de bază ori reducerea manuală salvată în produs.
    if (function_exists('applyCatalogPromotionPrices')) {
        $priced = applyCatalogPromotionPrices($db, [$product], null, '');
        if (isset($priced[0]) && is_array($priced[0])) $product = $priced[0];
    }
    $effectivePrice = function_exists('stripeEffectiveProductPrice')
        ? stripeEffectiveProductPrice($product)
        : max(0.0, (float)($product['sale_price'] ?? 0), (float)($product['price'] ?? 0), (float)($product['supplier_base_price'] ?? 0));
    if (!merchantProductIsVisible($product) || $effectivePrice <= 0) {
        $result = merchantDeleteProduct($config, $productId);
        merchantRecordProductSync($db, $productId, null);
        return $result;
    }
    $account = merchantAccountName($config);
    $url = 'https://merchantapi.googleapis.com/products/v1/' . $account . '/productInputs:insert?dataSource='
        . rawurlencode(merchantDataSourceName($config));
    $response = merchantRequest($config, 'POST', $url, merchantProductPayload($product, $config));
    merchantRecordProductSync($db, $productId, null);
    return ['status' => 'synced', 'name' => (string)($response['name'] ?? '')];
}

function merchantSyncProductSafe(PDO $db, array $config, string $productId): array {
    try {
        return merchantSyncProduct($db, $config, $productId);
    } catch (Throwable $error) {
        merchantRecordProductSync($db, $productId, $error->getMessage());
        error_log('[G-Trots Merchant] ' . $productId . ': ' . $error->getMessage());
        return ['status' => 'error', 'error' => $error->getMessage()];
    }
}

function merchantSyncCatalogBatch(PDO $db, array $config, string $afterId = '', int $limit = 5): array {
    $limit = max(1, min(20, $limit));
    $stmt = $db->prepare('SELECT id FROM shop_products WHERE id > ? ORDER BY id ASC LIMIT ' . ($limit + 1));
    $stmt->execute([$afterId]);
    $ids = array_values(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN)));
    $hasMore = count($ids) > $limit;
    $batch = array_slice($ids, 0, $limit);
    $results = [];
    foreach ($batch as $id) $results[] = ['product_id' => $id, ...merchantSyncProductSafe($db, $config, $id)];
    return [
        'configured' => merchantIsConfigured($config),
        'enabled' => merchantSyncIsEnabled($config),
        'processed' => count($batch),
        'results' => $results,
        'next_cursor' => $batch ? end($batch) : $afterId,
        'has_more' => $hasMore,
    ];
}
