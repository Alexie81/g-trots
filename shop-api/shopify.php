<?php
declare(strict_types=1);

/**
 * Sincronizare Shopify Catalog / Agentic Storefronts prin Admin GraphQL API.
 * Tokenul Admin ramane exclusiv in config.local.php pe server.
 */

function shopifySyncIsEnabled(array $config): bool {
    $value = $config['shopify_sync_enabled'] ?? false;
    if (is_bool($value)) return $value;
    if (is_int($value) || is_float($value)) return (int)$value === 1;
    return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on', 'enabled'], true);
}

function shopifyStoreDomain(array $config): string {
    $domain = strtolower(trim((string)($config['shopify_store_domain'] ?? '')));
    $domain = preg_replace('#^https?://#i', '', $domain) ?: '';
    $domain = rtrim($domain, '/');
    if ($domain !== '' && !preg_match('/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/', $domain)) {
        throw new RuntimeException('Domeniul magazinului Shopify nu este valid.');
    }
    return $domain;
}

function shopifyIsConfigured(array $config): bool {
    try {
        $domain = shopifyStoreDomain($config);
    } catch (Throwable $error) {
        return false;
    }
    $staticToken = trim((string)($config['shopify_admin_access_token'] ?? ''));
    $clientId = trim((string)($config['shopify_client_id'] ?? ''));
    $clientSecret = trim((string)($config['shopify_client_secret'] ?? ''));
    return $domain !== '' && ($staticToken !== '' || ($clientId !== '' && $clientSecret !== ''));
}

function shopifyAccessToken(array $config): string {
    $staticToken = trim((string)($config['shopify_admin_access_token'] ?? ''));
    if ($staticToken !== '') return $staticToken;
    if (!shopifyIsConfigured($config)) throw new RuntimeException('Shopify nu este configurat pe server.');

    static $cached = [];
    $domain = shopifyStoreDomain($config);
    $clientId = trim((string)($config['shopify_client_id'] ?? ''));
    $clientSecret = trim((string)($config['shopify_client_secret'] ?? ''));
    $cacheKey = $domain . '|' . $clientId;
    if (isset($cached[$cacheKey]) && (int)$cached[$cacheKey]['expires_at'] > time() + 120) {
        return (string)$cached[$cacheKey]['token'];
    }

    $curl = curl_init('https://' . $domain . '/admin/oauth/access_token');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'client_credentials',
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
        ], '', '&', PHP_QUERY_RFC3986),
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 30,
    ]);
    $raw = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);
    if ($raw === false) throw new RuntimeException('Autentificarea Shopify a esuat: ' . ($curlError ?: 'eroare necunoscuta'));
    $response = json_decode((string)$raw, true);
    $token = is_array($response) ? trim((string)($response['access_token'] ?? '')) : '';
    if ($status < 200 || $status >= 300 || $token === '') {
        $message = is_array($response) ? trim((string)($response['error_description'] ?? $response['error'] ?? '')) : '';
        throw new RuntimeException('Autentificarea Shopify a esuat' . ($message !== '' ? ': ' . $message : ' (' . $status . ').'));
    }
    $expiresIn = max(300, (int)($response['expires_in'] ?? 86399));
    $cached[$cacheKey] = ['token' => $token, 'expires_at' => time() + $expiresIn];
    return $token;
}

function shopifyGraphql(array $config, string $query, array $variables = []): array {
    if (!shopifyIsConfigured($config)) throw new RuntimeException('Shopify nu este configurat pe server.');
    if (!function_exists('curl_init')) throw new RuntimeException('Extensia cURL este necesara pentru Shopify.');

    $version = trim((string)($config['shopify_api_version'] ?? '2026-07'));
    if (!preg_match('/^20\d{2}-(?:01|04|07|10)$/', $version)) $version = '2026-07';
    $url = 'https://' . shopifyStoreDomain($config) . '/admin/api/' . $version . '/graphql.json';
    $body = json_encode([
        'query' => $query,
        // GraphQL cere un obiect JSON; în PHP o listă goală s-ar serializa [].
        'variables' => $variables ?: (object)[],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Content-Type: application/json; charset=utf-8',
            'X-Shopify-Access-Token: ' . shopifyAccessToken($config),
        ],
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 45,
    ]);
    $raw = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);

    if ($raw === false) throw new RuntimeException('Conexiunea Shopify a esuat: ' . ($curlError ?: 'eroare necunoscuta'));
    $response = json_decode((string)$raw, true);
    if ($status < 200 || $status >= 300 || !is_array($response)) {
        throw new RuntimeException('Shopify: cererea nu a putut fi procesata (' . $status . ').');
    }
    if (!empty($response['errors']) && is_array($response['errors'])) {
        $messages = array_values(array_filter(array_map(
            static fn($error): string => trim((string)($error['message'] ?? '')),
            $response['errors']
        )));
        throw new RuntimeException('Shopify: ' . ($messages ? implode('; ', $messages) : 'eroare GraphQL.'));
    }
    return is_array($response['data'] ?? null) ? $response['data'] : [];
}

function shopifyUserErrors(array $payload): array {
    $errors = [];
    foreach ((array)($payload['userErrors'] ?? []) as $error) {
        $message = trim((string)($error['message'] ?? ''));
        if ($message === '') continue;
        $field = is_array($error['field'] ?? null) ? implode('.', array_map('strval', $error['field'])) : '';
        $errors[] = $field !== '' ? $field . ': ' . $message : $message;
    }
    return $errors;
}

function shopifyCatalogPublicationId(array $config): string {
    $configured = trim((string)($config['shopify_catalog_publication_id'] ?? ''));
    if ($configured !== '') {
        if (!preg_match('#^gid://shopify/Publication/\d+$#', $configured)) {
            throw new RuntimeException('ID-ul publicatiei Shopify Catalog nu este valid.');
        }
        return $configured;
    }

    static $cached = [];
    $domain = shopifyStoreDomain($config);
    if (isset($cached[$domain])) return $cached[$domain];

    $data = shopifyGraphql($config, '{ publications(first: 50) { nodes { id name } } }');
    foreach ((array)($data['publications']['nodes'] ?? []) as $publication) {
        if (!is_array($publication)) continue;
        if (strcasecmp(trim((string)($publication['name'] ?? '')), 'Shopify Catalog') !== 0) continue;
        $id = trim((string)($publication['id'] ?? ''));
        if (preg_match('#^gid://shopify/Publication/\d+$#', $id)) {
            $cached[$domain] = $id;
            return $id;
        }
    }
    throw new RuntimeException('Publicatia Shopify Catalog nu a fost gasita pentru acest magazin.');
}

function shopifySetCatalogPublished(array $config, string $productId, bool $published): array {
    if (!preg_match('#^gid://shopify/Product/\d+$#', $productId)) {
        throw new RuntimeException('ID-ul produsului Shopify nu este valid pentru publicare.');
    }
    $publicationId = shopifyCatalogPublicationId($config);
    $field = $published ? 'publishablePublish' : 'publishableUnpublish';
    $query = $published
        ? <<<'GRAPHQL'
mutation GtrotsCatalogPublish($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) { userErrors { field message } }
}
GRAPHQL
        : <<<'GRAPHQL'
mutation GtrotsCatalogUnpublish($id: ID!, $input: [PublicationInput!]!) {
  publishableUnpublish(id: $id, input: $input) { userErrors { field message } }
}
GRAPHQL;
    $data = shopifyGraphql($config, $query, [
        'id' => $productId,
        'input' => [['publicationId' => $publicationId]],
    ]);
    $payload = is_array($data[$field] ?? null) ? $data[$field] : [];
    $errors = shopifyUserErrors($payload);
    if ($errors) throw new RuntimeException(implode('; ', $errors));
    return [
        'status' => $published ? 'published' : 'unpublished',
        'publication_id' => $publicationId,
    ];
}

function shopifyEffectivePricing(array $product): array {
    $base = function_exists('productPublicBasePrice')
        ? productPublicBasePrice($product)
        : max(0.0, (float)($product['price'] ?? 0), (float)($product['supplier_base_price'] ?? 0));
    $sale = round((float)($product['sale_price'] ?? 0), 2);
    $manual = $sale > 0 ? $sale : $base;
    $promotion = round((float)($product['promotion_price'] ?? 0), 2);
    $effective = $promotion > 0 ? $promotion : $manual;
    return [
        'price' => round(max(0.0, $effective), 2),
        'compare_at_price' => $base > $effective && $effective > 0 ? round($base, 2) : null,
    ];
}

function shopifyProductIsVisible(array $product): bool {
    $visible = (bool)($product['is_purchasable'] ?? (
        (bool)($product['is_active'] ?? false)
        && (bool)($product['source_is_active'] ?? true)
        && (bool)($product['category_is_active'] ?? true)
        && (bool)($product['manufacturer_is_active'] ?? true)
        && (bool)($product['brands_are_active'] ?? true)
    ));
    return $visible && shopifyEffectivePricing($product)['price'] > 0;
}

function shopifyProductPayload(array $product, array $config): array {
    $pricing = shopifyEffectivePricing($product);
    $baseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $externalUrl = $baseUrl . '/magazin/produs/' . rawurlencode((string)$product['slug']) . '/';
    $description = trim((string)($product['description_html'] ?? ''));
    if ($description === '') $description = '<p>' . htmlspecialchars(trim((string)($product['short_description'] ?? 'Produs G-Trots.')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>';
    $description = mb_substr($description, 0, 100000);

    $vendor = trim((string)($product['manufacturer_name'] ?? ''));
    if ($vendor === '' && !empty($product['brands'][0]['name'])) $vendor = trim((string)$product['brands'][0]['name']);
    if ($vendor === '') $vendor = 'G-Trots';
    $productType = trim((string)($product['category_name'] ?? ''));
    if ($productType === '') $productType = 'Piese si accesorii pentru trotinete electrice';

    $sku = trim((string)($product['sku'] ?? ''));
    if ($sku === '') $sku = 'GT-' . strtoupper(substr(str_replace('-', '', (string)$product['id']), 0, 16));
    $barcode = function_exists('merchantValidGtin') ? merchantValidGtin((string)($product['ean'] ?? '')) : null;
    $tracked = (string)($product['stock_mode'] ?? 'tracked') !== 'unlimited';
    $quantity = $tracked ? max(0, (int)($product['stock_quantity'] ?? 0)) : 999999;
    $variant = [
        'optionValues' => [['optionName' => 'Title', 'name' => 'Default Title']],
        'price' => number_format((float)$pricing['price'], 2, '.', ''),
        'sku' => mb_substr($sku, 0, 255),
        'taxable' => true,
        'inventoryPolicy' => 'DENY',
        'inventoryItem' => [
            'sku' => mb_substr($sku, 0, 255),
            'tracked' => $tracked,
            'requiresShipping' => true,
        ],
        'metafields' => [[
            'namespace' => 'shopify',
            'key' => 'external_url',
            'type' => 'url',
            'value' => $externalUrl,
        ]],
    ];
    if ($barcode !== null) $variant['barcode'] = $barcode;
    if ($pricing['compare_at_price'] !== null) {
        $variant['compareAtPrice'] = number_format((float)$pricing['compare_at_price'], 2, '.', '');
    }
    $locationId = trim((string)($config['shopify_location_id'] ?? ''));
    if ($tracked && preg_match('#^gid://shopify/Location/\d+$#', $locationId)) {
        $variant['inventoryQuantities'] = [[
            'locationId' => $locationId,
            'name' => 'available',
            'quantity' => $quantity,
        ]];
    }

    $files = [];
    foreach (array_slice((array)($product['images'] ?? []), 0, 8) as $index => $image) {
        $url = trim((string)($image['url'] ?? ''));
        if (!preg_match('#^https://#i', $url)) continue;
        $extension = strtolower(pathinfo((string)(parse_url($url, PHP_URL_PATH) ?: ''), PATHINFO_EXTENSION));
        if (!in_array($extension, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) $extension = 'webp';
        $files[] = [
            'originalSource' => $url,
            'contentType' => 'IMAGE',
            'alt' => mb_substr(trim((string)($image['alt_text'] ?? $product['name'])), 0, 512),
            'filename' => mb_substr((string)$product['slug'] . '-' . ($index + 1) . '.' . $extension, 0, 255),
            'duplicateResolutionMode' => 'REPLACE',
        ];
    }

    $tags = ['G-Trots', 'Romania', 'Agentic'];
    if ($productType !== '') $tags[] = mb_substr($productType, 0, 255);
    foreach ((array)($product['brands'] ?? []) as $brand) {
        $name = trim((string)($brand['name'] ?? ''));
        if ($name !== '') $tags[] = mb_substr($name, 0, 255);
    }

    $input = [
        'title' => mb_substr(trim((string)$product['name']), 0, 255),
        'handle' => mb_substr((string)$product['slug'], 0, 255),
        'descriptionHtml' => $description,
        'status' => shopifyProductIsVisible($product) ? 'ACTIVE' : 'DRAFT',
        'vendor' => mb_substr($vendor, 0, 255),
        'productType' => mb_substr($productType, 0, 255),
        'tags' => array_values(array_unique($tags)),
        'seo' => [
            'title' => mb_substr(trim((string)($product['meta_title'] ?? $product['name'])), 0, 70),
            'description' => mb_substr(trim((string)($product['meta_description'] ?? $product['short_description'] ?? '')), 0, 320),
        ],
        'productOptions' => [[
            'name' => 'Title',
            'position' => 1,
            'values' => [['name' => 'Default Title']],
        ]],
        'variants' => [$variant],
        'metafields' => [[
            'namespace' => 'custom',
            'key' => 'g_trots_product_id',
            'type' => 'single_line_text_field',
            'value' => (string)$product['id'],
        ]],
    ];
    if ($files) $input['files'] = $files;
    return $input;
}

function shopifyRecordProductSync(PDO $db, string $productId, ?string $shopifyProductId, ?string $variantId, ?string $error): void {
    $stmt = $db->prepare('UPDATE shop_products SET shopify_product_id = ?, shopify_variant_id = ?, shopify_synced_at = ?, shopify_sync_error = ?, updated_at = updated_at WHERE id = ?');
    $stmt->execute([
        $shopifyProductId ?: null,
        $variantId ?: null,
        $error === null ? date('Y-m-d H:i:s') : null,
        $error === null ? null : mb_substr($error, 0, 500),
        $productId,
    ]);
}

function shopifySyncProduct(PDO $db, array $config, string $productId): array {
    if (!shopifySyncIsEnabled($config)) return ['status' => 'disabled'];
    if (!shopifyIsConfigured($config)) {
        shopifyRecordProductSync($db, $productId, null, null, 'Shopify nu este configurat.');
        return ['status' => 'not_configured'];
    }
    $product = findProduct($db, $productId, $config, false, true);
    if (function_exists('applyCatalogPromotionPrices')) {
        $priced = applyCatalogPromotionPrices($db, [$product], null, '');
        if (isset($priced[0]) && is_array($priced[0])) $product = $priced[0];
    }
    $query = <<<'GRAPHQL'
mutation GtrotsProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
  productSet(synchronous: true, input: $input, identifier: $identifier) {
    product {
      id
      handle
      status
      variants(first: 2) { nodes { id sku price inventoryItem { id tracked } } }
    }
    userErrors { code field message }
  }
}
GRAPHQL;
    $data = shopifyGraphql($config, $query, [
        'identifier' => ['handle' => (string)$product['slug']],
        'input' => shopifyProductPayload($product, $config),
    ]);
    $payload = is_array($data['productSet'] ?? null) ? $data['productSet'] : [];
    $errors = shopifyUserErrors($payload);
    if ($errors) throw new RuntimeException(implode('; ', $errors));
    $remote = is_array($payload['product'] ?? null) ? $payload['product'] : [];
    $shopifyProductId = trim((string)($remote['id'] ?? ''));
    $variantId = trim((string)($remote['variants']['nodes'][0]['id'] ?? ''));
    if ($shopifyProductId === '' || $variantId === '') throw new RuntimeException('Shopify nu a returnat produsul si varianta sincronizata.');
    $catalog = shopifySetCatalogPublished($config, $shopifyProductId, shopifyProductIsVisible($product));
    shopifyRecordProductSync($db, $productId, $shopifyProductId, $variantId, null);
    return [
        'status' => shopifyProductIsVisible($product) ? 'synced' : 'draft',
        'product_id' => $shopifyProductId,
        'variant_id' => $variantId,
        'catalog' => $catalog,
    ];
}

function shopifySyncProductSafe(PDO $db, array $config, string $productId): array {
    try {
        return shopifySyncProduct($db, $config, $productId);
    } catch (Throwable $error) {
        $stmt = $db->prepare('SELECT shopify_product_id, shopify_variant_id FROM shop_products WHERE id = ?');
        $stmt->execute([$productId]);
        $current = $stmt->fetch() ?: [];
        shopifyRecordProductSync(
            $db,
            $productId,
            empty($current['shopify_product_id']) ? null : (string)$current['shopify_product_id'],
            empty($current['shopify_variant_id']) ? null : (string)$current['shopify_variant_id'],
            $error->getMessage()
        );
        error_log('[G-Trots Shopify] ' . $productId . ': ' . $error->getMessage());
        return ['status' => 'error', 'error' => $error->getMessage()];
    }
}

function shopifyDeleteProduct(PDO $db, array $config, string $productId): array {
    if (!shopifySyncIsEnabled($config)) return ['status' => 'disabled'];
    if (!shopifyIsConfigured($config)) return ['status' => 'not_configured'];
    $stmt = $db->prepare('SELECT shopify_product_id FROM shop_products WHERE id = ?');
    $stmt->execute([$productId]);
    $remoteId = trim((string)($stmt->fetchColumn() ?: ''));
    if ($remoteId === '') return ['status' => 'already_absent'];
    $query = <<<'GRAPHQL'
mutation GtrotsProductDelete($input: ProductDeleteInput!) {
  productDelete(input: $input) { deletedProductId userErrors { field message } }
}
GRAPHQL;
    $data = shopifyGraphql($config, $query, ['input' => ['id' => $remoteId]]);
    $payload = is_array($data['productDelete'] ?? null) ? $data['productDelete'] : [];
    $errors = shopifyUserErrors($payload);
    if ($errors) {
        $message = implode('; ', $errors);
        if (stripos($message, 'not found') !== false) return ['status' => 'already_absent'];
        throw new RuntimeException($message);
    }
    return ['status' => 'deleted', 'product_id' => (string)($payload['deletedProductId'] ?? $remoteId)];
}

function shopifyDiscoverLocation(array $config): array {
    $data = shopifyGraphql($config, '{ locations(first: 20, includeInactive: false) { nodes { id name isActive fulfillsOnlineOrders } } }');
    $locations = array_values(array_filter((array)($data['locations']['nodes'] ?? []), 'is_array'));
    $selected = null;
    foreach ($locations as $location) {
        if (!empty($location['isActive']) && !empty($location['fulfillsOnlineOrders'])) {
            $selected = $location;
            break;
        }
    }
    if ($selected === null && $locations) $selected = $locations[0];
    return ['selected' => $selected, 'locations' => $locations];
}

function shopifyEnableExternalUrlDefinition(array $config): array {
    $query = <<<'GRAPHQL'
mutation EnableExternalUrl($id: ID!) {
  standardMetafieldDefinitionEnable(id: $id, ownerType: PRODUCTVARIANT) {
    createdDefinition { id namespace key name type { name } }
    userErrors { field message }
  }
}
GRAPHQL;
    $data = shopifyGraphql($config, $query, ['id' => 'gid://shopify/StandardMetafieldDefinitionTemplate/27']);
    $payload = is_array($data['standardMetafieldDefinitionEnable'] ?? null) ? $data['standardMetafieldDefinitionEnable'] : [];
    $errors = shopifyUserErrors($payload);
    if ($errors && stripos(implode('; ', $errors), 'already') === false) throw new RuntimeException(implode('; ', $errors));
    return ['success' => true, 'definition' => $payload['createdDefinition'] ?? null, 'messages' => $errors];
}

function shopifySyncCatalogBatch(PDO $db, array $config, string $afterId = '', int $limit = 2): array {
    $limit = max(1, min(10, $limit));
    $stmt = $db->prepare('SELECT id FROM shop_products WHERE id > ? ORDER BY id ASC LIMIT ' . ($limit + 1));
    $stmt->execute([$afterId]);
    $ids = array_values(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN)));
    $hasMore = count($ids) > $limit;
    $batch = array_slice($ids, 0, $limit);
    $results = [];
    foreach ($batch as $id) $results[] = ['product_id' => $id, ...shopifySyncProductSafe($db, $config, $id)];
    return [
        'configured' => shopifyIsConfigured($config),
        'enabled' => shopifySyncIsEnabled($config),
        'processed' => count($batch),
        'results' => $results,
        'next_cursor' => $batch ? end($batch) : $afterId,
        'has_more' => $hasMore,
    ];
}
