<?php
declare(strict_types=1);

/**
 * Integrarea Stripe folosește API-ul REST direct pentru a evita o dependență
 * Composer pe hostingul shared. Cheia secretă este citită exclusiv din
 * config.local.php, fișier ignorat de Git.
 */

function stripeIsConfigured(array $config): bool {
    $key = trim((string)($config['stripe_secret_key'] ?? ''));
    return strpos($key, 'sk_test_') === 0 || strpos($key, 'sk_live_') === 0;
}

function stripeIsTestMode(array $config): bool {
    return strpos(trim((string)($config['stripe_secret_key'] ?? '')), 'sk_test_') === 0;
}

function stripeRequest(array $config, string $method, string $path, array $params = [], ?string $idempotencyKey = null): array {
    if (!stripeIsConfigured($config)) throw new RuntimeException('Stripe nu este configurat pe server.');
    if (!function_exists('curl_init')) throw new RuntimeException('Extensia cURL este necesara pentru Stripe.');

    $method = strtoupper($method);
    $url = 'https://api.stripe.com/v1/' . ltrim($path, '/');
    $encoded = http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    if ($method === 'GET' && $encoded !== '') $url .= '?' . $encoded;

    $headers = [
        'Authorization: Bearer ' . trim((string)$config['stripe_secret_key']),
        'Accept: application/json',
    ];
    if ($method !== 'GET') $headers[] = 'Content-Type: application/x-www-form-urlencoded';
    if ($idempotencyKey !== null && $idempotencyKey !== '') {
        $headers[] = 'Idempotency-Key: ' . mb_substr($idempotencyKey, 0, 255);
    }

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 28,
        CURLOPT_CUSTOMREQUEST => $method,
    ]);
    if ($method !== 'GET' && $encoded !== '') curl_setopt($curl, CURLOPT_POSTFIELDS, $encoded);
    $raw = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);

    if ($raw === false) throw new RuntimeException('Conexiunea Stripe a esuat: ' . ($curlError ?: 'eroare necunoscuta'));
    $decoded = json_decode((string)$raw, true);
    if ($status < 200 || $status >= 300 || !is_array($decoded)) {
        $message = is_array($decoded) ? trim((string)($decoded['error']['message'] ?? '')) : '';
        throw new RuntimeException('Stripe: ' . ($message !== '' ? $message : 'cererea nu a putut fi procesata (' . $status . ').'));
    }
    return $decoded;
}

function stripeMinorAmount(float $amount, string $currency): int {
    $zeroDecimal = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
    $factor = in_array(strtoupper($currency), $zeroDecimal, true) ? 1 : 100;
    return max(0, (int)round($amount * $factor));
}

function stripeEffectiveProductPrice(array $product): float {
    return $product['sale_price'] === null ? (float)$product['price'] : (float)$product['sale_price'];
}

function stripeProductIsVisible(array $product): bool {
    return (bool)($product['is_active'] ?? false) && (bool)($product['source_is_active'] ?? true);
}

function stripeProductParams(array $product, array $config, string $stripeProductId = ''): array {
    $description = trim((string)($product['short_description'] ?? ''));
    if ($description === '') $description = trim(strip_tags((string)($product['description_html'] ?? '')));
    $description = mb_substr($description, 0, 500);
    $baseUrl = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $params = [
        'name' => mb_substr((string)$product['name'], 0, 180),
        'active' => stripeProductIsVisible($product) ? 'true' : 'false',
        'description' => $description,
        'shippable' => 'true',
        'url' => $baseUrl . '/magazin/produs/' . rawurlencode((string)$product['slug']) . '/',
        'metadata' => [
            'g_trots_product_id' => (string)$product['id'],
            'g_trots_slug' => mb_substr((string)$product['slug'], 0, 200),
            'sku' => mb_substr((string)($product['sku'] ?? ''), 0, 80),
            'supplier_product_code' => mb_substr((string)($product['supplier_product_code'] ?? ''), 0, 120),
            'ean' => mb_substr((string)($product['ean'] ?? ''), 0, 120),
            'source' => mb_substr((string)($product['source_domain'] ?? 'g-trots.ro'), 0, 80),
        ],
    ];
    $images = [];
    foreach (array_slice(is_array($product['images'] ?? null) ? $product['images'] : [], 0, 8) as $image) {
        $url = trim((string)($image['url'] ?? ''));
        if (preg_match('#^https://#i', $url)) $images[] = $url;
    }
    if ($images) $params['images'] = $images;
    elseif ($stripeProductId !== '') $params['images'] = '';
    return $params;
}

function stripeRecordProductSync(PDO $db, string $productId, ?string $productStripeId, ?string $priceStripeId, ?string $error): void {
    // Sincronizarea tehnica nu trebuie sa para o editare noua de continut.
    $stmt = $db->prepare('UPDATE shop_products SET stripe_product_id = ?, stripe_price_id = ?, stripe_synced_at = ?, stripe_sync_error = ?, updated_at = updated_at WHERE id = ?');
    $stmt->execute([
        $productStripeId ?: null,
        $priceStripeId ?: null,
        $error === null ? date('Y-m-d H:i:s') : null,
        $error === null ? null : mb_substr($error, 0, 500),
        $productId,
    ]);
}

function stripeSyncProduct(PDO $db, array $config, string $productId): array {
    if (!stripeIsConfigured($config)) {
        stripeRecordProductSync($db, $productId, null, null, 'Stripe nu este configurat.');
        return ['status' => 'not_configured'];
    }

    $product = findProduct($db, $productId, $config, false);
    $stripeProductId = trim((string)($product['stripe_product_id'] ?? ''));
    $stripePriceId = trim((string)($product['stripe_price_id'] ?? ''));
    $visible = stripeProductIsVisible($product);

    if ($stripeProductId === '' && !$visible) {
        stripeRecordProductSync($db, $productId, null, null, null);
        return ['status' => 'inactive_without_copy'];
    }

    if ($stripeProductId === '') {
        // Recuperam mai intai copia dupa ID-ul CRM. Astfel, chiar daca legatura
        // locala este pierduta, sincronizarea nu creeaza un al doilea produs.
        $search = stripeRequest($config, 'GET', 'products/search', [
            'query' => "metadata['g_trots_product_id']:'" . $productId . "'",
            'limit' => 2,
        ]);
        $recovered = is_array($search['data'][0] ?? null) ? $search['data'][0] : null;
        if ($recovered) {
            $stripeProductId = trim((string)($recovered['id'] ?? ''));
            $defaultPrice = $recovered['default_price'] ?? '';
            if (is_array($defaultPrice)) $defaultPrice = $defaultPrice['id'] ?? '';
            if ($stripePriceId === '') $stripePriceId = trim((string)$defaultPrice);
        } else {
            $created = stripeRequest(
                $config,
                'POST',
                'products',
                stripeProductParams($product, $config),
                'gtrots-product-' . $productId
            );
            $stripeProductId = (string)($created['id'] ?? '');
        }
        if ($stripeProductId === '') throw new RuntimeException('Stripe nu a returnat ID-ul produsului.');
    }
    stripeRequest($config, 'POST', 'products/' . rawurlencode($stripeProductId), stripeProductParams($product, $config, $stripeProductId));

    if (!$visible) {
        if ($stripePriceId !== '') stripeRequest($config, 'POST', 'prices/' . rawurlencode($stripePriceId), ['active' => 'false']);
        stripeRecordProductSync($db, $productId, $stripeProductId, $stripePriceId ?: null, null);
        return ['status' => 'archived', 'product_id' => $stripeProductId, 'price_id' => $stripePriceId ?: null];
    }

    $currency = strtolower((string)($product['currency'] ?? 'RON'));
    $amount = stripeMinorAmount(stripeEffectiveProductPrice($product), $currency);
    $priceMatches = false;
    $existingPrice = null;
    if ($stripePriceId !== '') {
        try {
            $existingPrice = stripeRequest($config, 'GET', 'prices/' . rawurlencode($stripePriceId));
            $priceMatches = (string)($existingPrice['product'] ?? '') === $stripeProductId
                && strtolower((string)($existingPrice['currency'] ?? '')) === $currency
                && (int)($existingPrice['unit_amount'] ?? -1) === $amount;
        } catch (Throwable $error) {
            $stripePriceId = '';
            $existingPrice = null;
        }
    }

    if (!$priceMatches) {
        $oldPriceId = $stripePriceId;
        $createdPrice = stripeRequest($config, 'POST', 'prices', [
            'product' => $stripeProductId,
            'currency' => $currency,
            'unit_amount' => $amount,
            'nickname' => mb_substr('G-Trots · ' . (string)$product['name'], 0, 255),
            'metadata' => [
                'g_trots_product_id' => (string)$product['id'],
                'g_trots_price_source' => $product['sale_price'] === null ? 'standard' : 'sale',
            ],
        ], 'gtrots-price-' . hash('sha256', $productId . '|' . $currency . '|' . $amount));
        $stripePriceId = (string)($createdPrice['id'] ?? '');
        if ($stripePriceId === '') throw new RuntimeException('Stripe nu a returnat ID-ul pretului.');
        if (!(bool)($createdPrice['active'] ?? true)) {
            stripeRequest($config, 'POST', 'prices/' . rawurlencode($stripePriceId), ['active' => 'true']);
        }
        stripeRequest($config, 'POST', 'products/' . rawurlencode($stripeProductId), ['default_price' => $stripePriceId, 'active' => 'true']);
        if ($oldPriceId !== '' && $oldPriceId !== $stripePriceId) {
            stripeRequest($config, 'POST', 'prices/' . rawurlencode($oldPriceId), ['active' => 'false']);
        }
    } else {
        if (!(bool)($existingPrice['active'] ?? false)) {
            stripeRequest($config, 'POST', 'prices/' . rawurlencode($stripePriceId), ['active' => 'true']);
        }
        stripeRequest($config, 'POST', 'products/' . rawurlencode($stripeProductId), ['default_price' => $stripePriceId, 'active' => 'true']);
    }

    stripeRecordProductSync($db, $productId, $stripeProductId, $stripePriceId, null);
    return ['status' => 'synced', 'product_id' => $stripeProductId, 'price_id' => $stripePriceId];
}

function stripeSyncProductSafe(PDO $db, array $config, string $productId): array {
    try {
        return stripeSyncProduct($db, $config, $productId);
    } catch (Throwable $error) {
        $stmt = $db->prepare('SELECT stripe_product_id, stripe_price_id FROM shop_products WHERE id = ?');
        $stmt->execute([$productId]);
        $current = $stmt->fetch() ?: [];
        stripeRecordProductSync(
            $db,
            $productId,
            empty($current['stripe_product_id']) ? null : (string)$current['stripe_product_id'],
            empty($current['stripe_price_id']) ? null : (string)$current['stripe_price_id'],
            $error->getMessage()
        );
        return ['status' => 'error', 'error' => $error->getMessage()];
    }
}

function stripeArchiveProduct(PDO $db, array $config, string $productId): void {
    if (!stripeIsConfigured($config)) return;
    $stmt = $db->prepare('SELECT stripe_product_id, stripe_price_id FROM shop_products WHERE id = ?');
    $stmt->execute([$productId]);
    $product = $stmt->fetch();
    if (!$product) throw new InvalidArgumentException('Produsul nu exista.');
    $priceId = trim((string)($product['stripe_price_id'] ?? ''));
    $stripeProductId = trim((string)($product['stripe_product_id'] ?? ''));
    if ($stripeProductId !== '') {
        try {
            // Produsul trebuie arhivat primul. Stripe nu permite dezactivarea unui
            // pret cat timp acesta este inca pretul implicit al unui produs activ.
            stripeRequest($config, 'POST', 'products/' . rawurlencode($stripeProductId), ['active' => 'false']);
        } catch (Throwable $error) {
            // Daca produsul a fost eliminat manual din Stripe, catalogul local
            // poate continua stergerea fara sa ramana o intrare activa in Stripe.
            if (stripos($error->getMessage(), 'No such product') === false) throw $error;
        }
    }
    if ($priceId !== '') {
        try {
            stripeRequest($config, 'POST', 'prices/' . rawurlencode($priceId), ['active' => 'false']);
        } catch (Throwable $error) {
            // Un pret implicit poate ramane arhivat logic prin produsul inactiv.
            // Nu blocam stergerea catalogului local din acest motiv.
            error_log('[G-Trots Stripe] Pretul ' . $priceId . ' nu a putut fi dezactivat dupa arhivarea produsului: ' . $error->getMessage());
        }
    }
}

function stripeSyncCatalog(PDO $db, array $config, ?string $sourceId = null): array {
    $sql = 'SELECT id FROM shop_products' . ($sourceId ? ' WHERE source_id = ?' : '') . ' ORDER BY updated_at ASC';
    $stmt = $db->prepare($sql);
    $stmt->execute($sourceId ? [$sourceId] : []);
    $summary = ['synced' => 0, 'archived' => 0, 'skipped' => 0, 'errors' => []];
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $productId) {
        $result = stripeSyncProductSafe($db, $config, (string)$productId);
        if ($result['status'] === 'synced') $summary['synced']++;
        elseif ($result['status'] === 'archived') $summary['archived']++;
        elseif ($result['status'] === 'error') $summary['errors'][] = ['product_id' => (string)$productId, 'error' => (string)$result['error']];
        else $summary['skipped']++;
    }
    return $summary;
}

/**
 * Raspuns rapid folosit inaintea sincronizarii. Interfata afla imediat cate
 * produse urmeaza sa proceseze, fara sa astepte primul apel catre Stripe.
 */
function stripeCatalogSyncPlan(PDO $db, ?string $sourceId = null, bool $force = false): array {
    $conditions = [];
    $params = [];
    if ($sourceId) {
        $conditions[] = 'source_id = ?';
        $params[] = $sourceId;
    }
    if (!$force) {
        $conditions[] = '(stripe_synced_at IS NULL OR stripe_sync_error IS NOT NULL OR updated_at > stripe_synced_at)';
    }
    $where = $conditions ? ' WHERE ' . implode(' AND ', $conditions) : '';
    $stmt = $db->prepare('SELECT COUNT(*) FROM shop_products' . $where);
    $stmt->execute($params);
    $idsStmt = $db->prepare('SELECT id FROM shop_products' . $where . ' ORDER BY id ASC');
    $idsStmt->execute($params);
    return [
        'synced' => 0,
        'archived' => 0,
        'skipped' => 0,
        'errors' => [],
        'total' => (int)$stmt->fetchColumn(),
        'batch_processed' => 0,
        'next_cursor' => '',
        'completed' => false,
        'prepared' => true,
        'product_ids' => array_values(array_map('strval', $idsStmt->fetchAll(PDO::FETCH_COLUMN))),
    ];
}

/** Sincronizeaza explicit un grup mic, folosit de worker-ele paralele CRM. */
function stripeSyncCatalogSelection(PDO $db, array $config, array $productIds): array {
    $productIds = array_values(array_unique(array_filter(array_map(
        static fn($value): string => trim((string)$value),
        $productIds
    ))));
    $productIds = array_slice($productIds, 0, 5);
    $summary = [
        'synced' => 0,
        'archived' => 0,
        'skipped' => 0,
        'errors' => [],
        'total' => count($productIds),
        'batch_processed' => 0,
        'next_cursor' => '',
        'completed' => true,
    ];
    if (!$productIds) return $summary;

    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $existingStmt = $db->prepare('SELECT id FROM shop_products WHERE id IN (' . $placeholders . ')');
    $existingStmt->execute($productIds);
    $existing = array_fill_keys(array_map('strval', $existingStmt->fetchAll(PDO::FETCH_COLUMN)), true);
    foreach ($productIds as $productId) {
        if (!isset($existing[$productId])) {
            $summary['skipped']++;
            $summary['batch_processed']++;
            continue;
        }
        $result = stripeSyncProductSafe($db, $config, $productId);
        if ($result['status'] === 'synced') $summary['synced']++;
        elseif ($result['status'] === 'archived') $summary['archived']++;
        elseif ($result['status'] === 'error') $summary['errors'][] = ['product_id' => $productId, 'error' => (string)$result['error']];
        else $summary['skipped']++;
        $summary['batch_processed']++;
    }
    return $summary;
}

/**
 * Sincronizeaza un lot stabil din catalog. Clientii CRM apeleaza loturile
 * succesiv, astfel incat Apache/PHP sa poata raspunde periodic chiar si pentru
 * cataloage foarte mari, iar interfata sa poata afisa progresul real.
 */
function stripeSyncCatalogBatch(PDO $db, array $config, string $afterId = '', int $limit = 8, ?string $sourceId = null): array {
    $limit = max(1, min(20, $limit));
    $conditions = [];
    $params = [];
    if ($sourceId !== null && $sourceId !== '') {
        $conditions[] = 'source_id = ?';
        $params[] = $sourceId;
    }
    if ($afterId !== '') {
        $conditions[] = 'id > ?';
        $params[] = $afterId;
    }
    $where = $conditions ? ' WHERE ' . implode(' AND ', $conditions) : '';
    $stmt = $db->prepare('SELECT id FROM shop_products' . $where . ' ORDER BY id ASC LIMIT ' . $limit);
    $stmt->execute($params);
    $productIds = array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));

    $totalStmt = $db->prepare('SELECT COUNT(*) FROM shop_products' . ($sourceId ? ' WHERE source_id = ?' : ''));
    $totalStmt->execute($sourceId ? [$sourceId] : []);
    $summary = [
        'synced' => 0,
        'archived' => 0,
        'skipped' => 0,
        'errors' => [],
        'total' => (int)$totalStmt->fetchColumn(),
        'batch_processed' => count($productIds),
        'next_cursor' => $productIds ? (string)end($productIds) : $afterId,
        'completed' => count($productIds) < $limit,
    ];
    foreach ($productIds as $productId) {
        $result = stripeSyncProductSafe($db, $config, $productId);
        if ($result['status'] === 'synced') $summary['synced']++;
        elseif ($result['status'] === 'archived') $summary['archived']++;
        elseif ($result['status'] === 'error') $summary['errors'][] = ['product_id' => $productId, 'error' => (string)$result['error']];
        else $summary['skipped']++;
    }
    return $summary;
}

function stripeCheckoutReturnBase(array $config, array $body): string {
    $fallback = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $candidate = rtrim(trim((string)($body['return_base_url'] ?? '')), '/');
    if ($candidate === '') return $fallback;
    $parts = parse_url($candidate);
    if (!is_array($parts)) return $fallback;
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    $port = isset($parts['port']) ? ':' . (int)$parts['port'] : '';
    if ($scheme === 'https' && in_array($host, ['g-trots.ro', 'www.g-trots.ro'], true)) return 'https://g-trots.ro';
    if (stripeIsTestMode($config) && $scheme === 'http' && in_array($host, ['127.0.0.1', 'localhost'], true)) {
        return $scheme . '://' . $host . $port;
    }
    return $fallback;
}

function stripeCreateCheckoutSession(PDO $db, array $config, array $order, array $requestBody): array {
    if (!stripeIsConfigured($config)) throw new RuntimeException('Plata cu cardul este temporar indisponibila.');
    $itemsStmt = $db->prepare('SELECT oi.*, p.stripe_price_id FROM shop_order_items oi INNER JOIN shop_products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id ASC');
    $itemsStmt->execute([(string)$order['id']]);
    $items = $itemsStmt->fetchAll();
    if (!$items) throw new RuntimeException('Comanda nu contine produse disponibile pentru Stripe.');

    $lineItems = [];
    foreach ($items as $item) {
        $sync = stripeSyncProduct($db, $config, (string)$item['product_id']);
        $priceId = trim((string)($sync['price_id'] ?? ''));
        if ($priceId === '') throw new RuntimeException('Produsul ' . (string)$item['product_name'] . ' nu are pret Stripe activ.');
        $lineItems[] = ['price' => $priceId, 'quantity' => max(1, (int)$item['quantity'])];
    }

    $base = stripeCheckoutReturnBase($config, $requestBody);
    $orderNumber = (string)$order['order_number'];
    $paymentToken = bin2hex(random_bytes(24));
    $successUrl = $base . '/plata-finalizata.html?session_id={CHECKOUT_SESSION_ID}&comanda=' . rawurlencode($orderNumber) . '&metoda=card';
    $cancelUrl = $base . '/plata-esuata.html?comanda=' . rawurlencode($orderNumber) . '&metoda=card&status=cancelled&token=' . rawurlencode($paymentToken);
    $params = [
        'mode' => 'payment',
        'payment_method_types' => ['card'],
        'line_items' => $lineItems,
        'client_reference_id' => (string)$order['id'],
        'success_url' => $successUrl,
        'cancel_url' => $cancelUrl,
        'expires_at' => time() + 1800,
        'locale' => 'ro',
        'submit_type' => 'pay',
        'metadata' => [
            'g_trots_order_id' => (string)$order['id'],
            'g_trots_order_number' => $orderNumber,
        ],
        'payment_intent_data' => [
            'metadata' => [
                'g_trots_order_id' => (string)$order['id'],
                'g_trots_order_number' => $orderNumber,
            ],
        ],
    ];
    $email = trim((string)($order['customer_email'] ?? ''));
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) $params['customer_email'] = $email;
    $discountTotal = round((float)($order['discount_total'] ?? 0), 2);
    if ($discountTotal > 0) {
        $coupon = stripeRequest($config, 'POST', 'coupons', [
            'duration' => 'once',
            'amount_off' => stripeMinorAmount($discountTotal, (string)($order['currency'] ?? 'RON')),
            'currency' => strtolower((string)($order['currency'] ?? 'RON')),
            'name' => mb_substr('Reducere G-Trots ' . ((string)($order['promotion_code'] ?? '') ?: $orderNumber), 0, 40),
            'metadata' => [
                'g_trots_order_id' => (string)$order['id'],
                'g_trots_promotion_code' => (string)($order['promotion_code'] ?? ''),
            ],
        ], 'gtrots-coupon-' . (string)$order['id']);
        $couponId = trim((string)($coupon['id'] ?? ''));
        if ($couponId === '') throw new RuntimeException('Reducerea nu a putut fi pregătită pentru plata Stripe.');
        $params['discounts'] = [['coupon' => $couponId]];
    }
    $shippingCost = (float)($order['shipping_cost'] ?? 0);
    $params['shipping_options'] = [[
        'shipping_rate_data' => [
            'type' => 'fixed_amount',
            'display_name' => mb_substr((string)($order['shipping_method_name'] ?? 'Livrare'), 0, 100),
            'fixed_amount' => [
                'amount' => stripeMinorAmount($shippingCost, (string)($order['currency'] ?? 'RON')),
                'currency' => strtolower((string)($order['currency'] ?? 'RON')),
            ],
            'metadata' => ['g_trots_shipping_method' => (string)($order['shipping_method_id'] ?? '')],
        ],
    ]];

    $session = stripeRequest($config, 'POST', 'checkout/sessions', $params, 'gtrots-checkout-' . (string)$order['id']);
    $sessionId = trim((string)($session['id'] ?? ''));
    $checkoutUrl = trim((string)($session['url'] ?? ''));
    if ($sessionId === '' || $checkoutUrl === '') throw new RuntimeException('Stripe nu a returnat linkul de plata.');
    $stmt = $db->prepare('UPDATE shop_orders SET stripe_checkout_session_id = ?, stripe_payment_token = ? WHERE id = ?');
    $stmt->execute([$sessionId, $paymentToken, (string)$order['id']]);
    return ['id' => $sessionId, 'url' => $checkoutUrl];
}

function stripeRestoreOrderStock(PDO $db, string $orderId, string $reason): void {
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? FOR UPDATE');
        $stmt->execute([$orderId]);
        $order = $stmt->fetch();
        if (!$order || $order['status'] === 'cancelled' || $order['payment_status'] === 'paid') {
            $db->commit();
            return;
        }
        $items = $db->prepare('SELECT * FROM shop_order_items WHERE order_id = ?');
        $items->execute([$orderId]);
        foreach ($items->fetchAll() as $item) {
            if (empty($item['product_id'])) continue;
            $productStmt = $db->prepare('SELECT * FROM shop_products WHERE id = ? FOR UPDATE');
            $productStmt->execute([$item['product_id']]);
            $product = $productStmt->fetch();
            if (!$product || $product['stock_mode'] !== 'tracked') continue;
            $next = (int)$product['stock_quantity'] + (int)$item['quantity'];
            $db->prepare('UPDATE shop_products SET stock_quantity = ? WHERE id = ?')->execute([$next, $product['id']]);
            $movement = $db->prepare('INSERT INTO shop_inventory_movements (id, product_id, order_id, movement_type, quantity_delta, quantity_after, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $movement->execute([uuidV4(), $product['id'], $orderId, 'return', (int)$item['quantity'], $next, mb_substr($reason, 0, 500)]);
        }
        $db->prepare('UPDATE shop_orders SET status = "cancelled", payment_status = "failed", admin_notes = CONCAT_WS("\n", NULLIF(admin_notes, ""), ?) WHERE id = ?')->execute([mb_substr($reason, 0, 500), $orderId]);
        recordOrderStatusHistory($db, $orderId, (string)$order['status'], 'cancelled', 'Stripe', 'not_requested');
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function stripeApplyCheckoutSession(PDO $db, array $session, ?array $config = null): ?array {
    $sessionId = trim((string)($session['id'] ?? ''));
    $orderId = trim((string)($session['metadata']['g_trots_order_id'] ?? $session['client_reference_id'] ?? ''));
    $paymentStatus = (string)($session['payment_status'] ?? 'unpaid');
    $historyId = null;
    $shouldNotify = false;
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE ((id = ? AND ? <> "") OR (stripe_checkout_session_id = ? AND ? <> "")) LIMIT 1 FOR UPDATE');
        $stmt->execute([$orderId, $orderId, $sessionId, $sessionId]);
        $order = $stmt->fetch();
        if (!$order) {
            $db->commit();
            return null;
        }
        if ($paymentStatus === 'paid' || $paymentStatus === 'no_payment_required') {
            $shouldNotify = (string)$order['payment_status'] !== 'paid';
            $nextStatus = in_array((string)$order['status'], ['new', 'processing'], true) ? 'confirmed' : (string)$order['status'];
            $update = $db->prepare('UPDATE shop_orders SET status = ?, payment_status = "paid", stripe_checkout_session_id = ?, stripe_payment_intent_id = ?, stripe_paid_at = COALESCE(stripe_paid_at, NOW()) WHERE id = ?');
            $update->execute([$nextStatus, $sessionId ?: null, empty($session['payment_intent']) ? null : (string)$session['payment_intent'], (string)$order['id']]);
            if ($shouldNotify) {
                $historyId = recordOrderStatusHistory($db, (string)$order['id'], (string)$order['status'], 'confirmed', 'Stripe', 'pending');
            }
        }
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
    $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ?');
    $stmt->execute([(string)$order['id']]);
    $saved = $stmt->fetch() ?: null;
    if ($saved && $shouldNotify && $historyId && $config) {
        $emailOrder = orderRow($db, $saved, $config, true);
        $emailResult = gtSendOrderStatusEmail($emailOrder, $config, 'confirmed');
        updateOrderHistoryEmail($db, $historyId, $emailResult);
    }
    return $saved;
}

function stripePublicOrderReceipt(PDO $db, array $config, array $order): array {
    $items = $db->prepare('SELECT * FROM shop_order_items WHERE order_id = ? ORDER BY id ASC');
    $items->execute([(string)$order['id']]);
    $receiptItems = [];
    foreach ($items->fetchAll() as $item) {
        $imageUrl = '';
        $url = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/') . '/magazin.html';
        if (!empty($item['product_id'])) {
            try {
                $product = findProduct($db, (string)$item['product_id'], $config, false);
                $imageUrl = (string)($product['images'][0]['url'] ?? '');
                $url = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/') . '/magazin/produs/' . rawurlencode((string)$product['slug']) . '/';
            } catch (Throwable $ignored) {
                // Comenzile istorice raman afisabile chiar daca produsul a fost sters.
            }
        }
        $receiptItems[] = [
            'id' => (string)($item['product_id'] ?? ''),
            'name' => (string)$item['product_name'],
            'quantity' => (int)$item['quantity'],
            'unitPrice' => (float)$item['unit_price'],
            'lineTotal' => (float)$item['line_total'],
            'imageUrl' => $imageUrl,
            'url' => $url,
        ];
    }
    return [
        'orderNumber' => (string)$order['order_number'],
        'paymentMethod' => (string)$order['payment_method'],
        'paymentStatus' => (string)$order['payment_status'],
        'paymentLabel' => $order['payment_method'] === 'card' ? 'Card online · Stripe' : 'Ramburs la curier',
        'shippingLabel' => (string)$order['shipping_method_name'],
        'subtotal' => (float)$order['subtotal'],
        'discountTotal' => (float)($order['discount_total'] ?? 0),
        'promotionCode' => (string)($order['promotion_code'] ?? ''),
        'shippingCost' => (float)$order['shipping_cost'],
        'total' => (float)$order['total'],
        'items' => $receiptItems,
        'createdAt' => str_replace(' ', 'T', (string)$order['created_at']),
    ];
}

function stripeVerifyWebhookSignature(string $payload, string $header, string $secret, int $tolerance = 300): bool {
    if ($payload === '' || $header === '' || $secret === '') return false;
    $timestamp = 0;
    $signatures = [];
    foreach (explode(',', $header) as $part) {
        [$key, $value] = array_pad(explode('=', trim($part), 2), 2, '');
        if ($key === 't') $timestamp = (int)$value;
        elseif ($key === 'v1' && $value !== '') $signatures[] = $value;
    }
    if ($timestamp <= 0 || abs(time() - $timestamp) > $tolerance) return false;
    $expected = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
    foreach ($signatures as $signature) if (hash_equals($expected, $signature)) return true;
    return false;
}

function stripeProcessWebhook(PDO $db, array $config, string $payload, string $signatureHeader): array {
    $secret = trim((string)($config['stripe_webhook_secret'] ?? ''));
    if (!stripeVerifyWebhookSignature($payload, $signatureHeader, $secret)) {
        throw new InvalidArgumentException('Semnatura webhook Stripe nu este valida.');
    }
    $event = json_decode($payload, true);
    if (!is_array($event) || empty($event['id']) || empty($event['type'])) throw new InvalidArgumentException('Eveniment Stripe invalid.');
    $eventId = (string)$event['id'];
    $eventType = (string)$event['type'];
    $existing = $db->prepare('SELECT status FROM shop_stripe_events WHERE id = ?');
    $existing->execute([$eventId]);
    if ($existing->fetchColumn() === 'processed') return ['received' => true, 'duplicate' => true];
    $db->prepare('INSERT INTO shop_stripe_events (id, event_type, status, attempts) VALUES (?, ?, "processing", 1) ON DUPLICATE KEY UPDATE status = "processing", attempts = attempts + 1, updated_at = NOW()')->execute([$eventId, $eventType]);
    try {
        $session = is_array($event['data']['object'] ?? null) ? $event['data']['object'] : [];
        if (in_array($eventType, ['checkout.session.completed', 'checkout.session.async_payment_succeeded'], true)) {
            stripeApplyCheckoutSession($db, $session, $config);
        } elseif (in_array($eventType, ['checkout.session.async_payment_failed', 'checkout.session.expired'], true)) {
            $orderId = trim((string)($session['metadata']['g_trots_order_id'] ?? $session['client_reference_id'] ?? ''));
            if ($orderId !== '') stripeRestoreOrderStock($db, $orderId, 'Plata Stripe a esuat sau sesiunea a expirat.');
        }
        $db->prepare('UPDATE shop_stripe_events SET status = "processed", processed_at = NOW(), last_error = NULL WHERE id = ?')->execute([$eventId]);
    } catch (Throwable $error) {
        $db->prepare('UPDATE shop_stripe_events SET status = "failed", last_error = ? WHERE id = ?')->execute([mb_substr($error->getMessage(), 0, 500), $eventId]);
        throw $error;
    }
    return ['received' => true, 'type' => $eventType];
}
