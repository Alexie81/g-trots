<?php
declare(strict_types=1);

/**
 * Integrarea Boomag/Gomag pentru taxonomia, produsele si stocul SHOP.
 */

function gomagRequest(array $config, string $endpoint, array $query = []): array {
    $apiKey = trim((string)($config['gomag_api_key'] ?? ''));
    $shopUrl = rtrim(trim((string)($config['gomag_shop_url'] ?? 'https://www.boomag.ro')), '/');
    if ($apiKey === '') throw new RuntimeException('Cheia API Gomag nu este configurata pe server.');

    $url = 'https://api.gomag.ro/api/v1/' . ltrim($endpoint, '/');
    if ($query) $url .= '?' . http_build_query($query);
    $headers = [
        'Accept: application/json',
        'Apikey: ' . $apiKey,
        'ApiShop: ' . $shopUrl,
    ];

    $lastError = 'API-ul Gomag nu a raspuns.';
    for ($attempt = 0; $attempt < 3; $attempt++) {
        $status = 0;
        $raw = false;
        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            curl_setopt_array($curl, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_CONNECTTIMEOUT => 12,
                CURLOPT_TIMEOUT => 45,
                CURLOPT_USERAGENT => 'G-Trots-Shop/1.0',
            ]);
            $raw = curl_exec($curl);
            $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
            $lastError = curl_error($curl) ?: $lastError;
            curl_close($curl);
        } else {
            $context = stream_context_create(['http' => [
                'method' => 'GET',
                'header' => implode("\r\n", $headers),
                'timeout' => 45,
                'ignore_errors' => true,
            ]]);
            $raw = @file_get_contents($url, false, $context);
            foreach (($http_response_header ?? []) as $header) {
                if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $match)) $status = (int)$match[1];
            }
        }

        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if ($status >= 200 && $status < 300 && is_array($decoded)) {
            if (!empty($decoded['error'])) {
                $message = is_array($decoded['error'])
                    ? (string)($decoded['error']['message'] ?? $decoded['error']['description'] ?? 'Eroare Gomag')
                    : (string)$decoded['error'];
                throw new RuntimeException('Gomag: ' . $message);
            }
            $payload = $decoded['data'] ?? $decoded;
            if (is_array($payload)) {
                foreach (['page', 'pages', 'total', 'limit'] as $metaKey) {
                    if (!array_key_exists($metaKey, $payload) && array_key_exists($metaKey, $decoded)) {
                        $payload[$metaKey] = $decoded[$metaKey];
                    }
                }
                return $payload;
            }
            return $decoded;
        }

        if (is_array($decoded)) {
            $lastError = trim((string)($decoded['message'] ?? $decoded['error_description'] ?? $decoded['error'] ?? $lastError));
        }
        if ($attempt < 2) usleep(300000 * ($attempt + 1));
    }

    throw new RuntimeException('Gomag: ' . $lastError);
}

function gomagValues($value): array {
    if (!is_array($value)) return [];
    return array_values($value);
}

function gomagStableUuid(string $type, string $externalValue): string {
    $hex = md5('g-trots|boomag.ro|' . $type . '|' . mb_strtolower(trim($externalValue)));
    $hex[12] = '5';
    $hex[16] = dechex((hexdec($hex[16]) & 0x3) | 0x8);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
}

function gomagProductCategoryIds($value): array {
    $ids = [];
    $walk = function ($node) use (&$walk, &$ids): void {
        if (!is_array($node)) return;
        if (isset($node['id']) && (is_string($node['id']) || is_numeric($node['id']))) {
            $ids[(string)$node['id']] = true;
            return;
        }
        foreach ($node as $child) $walk($child);
    };
    $walk($value);
    return array_keys($ids);
}

function gomagProductImages($value): array {
    if (is_string($value)) $value = [$value];
    if (!is_array($value)) return [];
    $images = [];
    foreach ($value as $image) {
        if (is_array($image)) $image = $image['url'] ?? $image['src'] ?? '';
        $url = trim((string)$image);
        if (preg_match('#^https://#i', $url)) $images[] = $url;
    }
    return array_values(array_unique($images));
}

function gomagAttributeValues($value): array {
    $values = is_array($value) ? $value : [$value];
    $result = [];
    foreach ($values as $item) {
        $item = trim((string)$item);
        if ($item !== '') $result[$item] = true;
    }
    return array_keys($result);
}

function gomagDownloadCategoryThumbnail(string $url, string $externalCategoryId, ?string $currentPath = null): string {
    $url = trim($url);
    if (!preg_match('#^https://#i', $url)) return '';
    $hash = substr(sha1($url), 0, 14);

    $binary = false;
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 12,
            CURLOPT_TIMEOUT => 35,
            CURLOPT_MAXREDIRS => 4,
            CURLOPT_USERAGENT => 'G-Trots-Shop/1.0',
        ]);
        $binary = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        if ($status < 200 || $status >= 300) $binary = false;
    } else {
        $binary = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 35]]));
    }

    if (!is_string($binary) || $binary === '' || strlen($binary) > 5 * 1024 * 1024) return '';
    $info = @getimagesizefromstring($binary);
    $mime = is_array($info) ? (string)($info['mime'] ?? '') : '';
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) return '';

    $directory = __DIR__ . '/uploads/categories';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) return '';
    $filename = 'boomag-' . preg_replace('/[^0-9A-Za-z_-]/', '', $externalCategoryId) . '-' . $hash . '.' . $extensions[$mime];
    $relativePath = 'uploads/categories/' . $filename;
    $absolutePath = __DIR__ . '/' . $relativePath;
    if (!is_file($absolutePath) && file_put_contents($absolutePath, $binary, LOCK_EX) === false) return '';

    if ($currentPath && $currentPath !== $relativePath && strpos($currentPath, 'uploads/categories/boomag-') === 0) {
        removeCategoryImage($currentPath);
    }
    return $relativePath;
}

function gomagUpsertNamedTaxonomy(PDO $db, string $table, string $type, array $names): int {
    if (!in_array($table, ['shop_manufacturers', 'shop_brands'], true)) {
        throw new RuntimeException('Taxonomia Gomag este invalida.');
    }
    $count = 0;
    foreach ($names as $name) {
        $name = mb_substr(trim((string)$name), 0, 120);
        if ($name === '') continue;
        $slug = slugBase($name);
        $find = $db->prepare("SELECT id FROM {$table} WHERE slug = ? OR LOWER(name) = LOWER(?) LIMIT 1");
        $find->execute([$slug, $name]);
        $id = $find->fetchColumn();
        if ($id) {
            $update = $db->prepare("UPDATE {$table} SET name = ?, is_active = 1 WHERE id = ?");
            $update->execute([$name, (string)$id]);
        } else {
            $id = gomagStableUuid($type, $name);
            $insert = $db->prepare("INSERT INTO {$table} (id, name, slug, website_url, is_active) VALUES (?, ?, ?, NULL, 1)");
            $insert->execute([$id, $name, uniqueSlug($db, $table, $name)]);
        }
        $count++;
    }
    return $count;
}

function gomagSyncTaxonomy(PDO $db, array $config): array {
    $source = $db->query("SELECT * FROM shop_product_sources WHERE domain = 'boomag.ro' LIMIT 1")->fetch();
    if (!$source) throw new RuntimeException('Adauga mai intai sursa boomag.ro.');

    $rootIds = ['346', '347'];
    $categoryResponse = gomagRequest($config, 'category/read/json');
    $rawCategories = gomagValues($categoryResponse['categories'] ?? []);
    $selected = [];
    foreach ($rawCategories as $category) {
        if (!is_array($category)) continue;
        $externalId = trim((string)($category['id'] ?? ''));
        if ($externalId === '') continue;
        $parents = is_array($category['parents'] ?? null) ? array_map('strval', array_keys($category['parents'])) : [];
        if (in_array($externalId, $rootIds, true) || array_intersect($rootIds, $parents)) {
            $category['_parent_external_ids'] = $parents;
            $selected[$externalId] = $category;
        }
    }
    if (!$selected) throw new RuntimeException('Gomag nu a returnat categoriile selectate.');

    uasort($selected, static function (array $left, array $right): int {
        $depth = ((int)($left['depth'] ?? 0)) <=> ((int)($right['depth'] ?? 0));
        if ($depth !== 0) return $depth;
        $position = ((int)($left['position'] ?? 0)) <=> ((int)($right['position'] ?? 0));
        return $position !== 0 ? $position : strcasecmp((string)($left['name'] ?? ''), (string)($right['name'] ?? ''));
    });

    $categoryIds = [];
    foreach ($selected as $externalId => $category) {
        $externalId = (string)$externalId;
        $categoryIds[$externalId] = gomagStableUuid('category', $externalId);
    }

    foreach ($selected as $externalId => $category) {
        $externalId = (string)$externalId;
        $parentExternalId = null;
        $parentDepth = -1;
        foreach (($category['_parent_external_ids'] ?? []) as $candidateId) {
            if (!isset($selected[$candidateId])) continue;
            $candidateDepth = (int)($selected[$candidateId]['depth'] ?? 0);
            if ($candidateDepth > $parentDepth) {
                $parentDepth = $candidateDepth;
                $parentExternalId = $candidateId;
            }
        }
        $id = $categoryIds[$externalId];
        $name = mb_substr(trim((string)($category['name'] ?? '')), 0, 120);
        $existing = $db->prepare('SELECT id, slug, thumbnail_path FROM shop_categories WHERE id = ? LIMIT 1');
        $existing->execute([$id]);
        $current = $existing->fetch();
        $slug = $current ? (string)$current['slug'] : uniqueSlug($db, 'shop_categories', $name);
        $description = in_array($externalId, $rootIds, true)
            ? 'Categorie principala sincronizata din Boomag.'
            : 'Subcategorie sincronizata din Boomag pentru catalogul G-Trots.';
        $thumbnailPath = $current ? (string)($current['thumbnail_path'] ?? '') : '';
        if (in_array($externalId, $rootIds, true)) {
            if ($thumbnailPath !== '') removeCategoryImage($thumbnailPath);
            $thumbnailPath = '';
        }
        $statement = $db->prepare(
            'INSERT INTO shop_categories (id, parent_id, name, slug, description, thumbnail_path, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), name = VALUES(name), description = VALUES(description), thumbnail_path = VALUES(thumbnail_path), is_active = 1'
        );
        $statement->execute([
            $id,
            $parentExternalId === null ? null : $categoryIds[$parentExternalId],
            $name,
            $slug,
            $description,
            $thumbnailPath === '' ? null : $thumbnailPath,
        ]);
    }

    $manufacturerNames = [];
    $compatibilityNames = [];
    $categoryImageUrls = [];
    $seenProducts = [];
    foreach ($rootIds as $rootId) {
        $page = 1;
        do {
            $response = gomagRequest($config, 'product/read/json', [
                'category' => $rootId,
                'page' => $page,
                'limit' => 100,
            ]);
            $products = gomagValues($response['products'] ?? []);
            foreach ($products as $product) {
                if (!is_array($product)) continue;
                $productId = trim((string)($product['id'] ?? ''));
                if ($productId !== '') $seenProducts[$productId] = true;
                $manufacturer = trim((string)($product['brand'] ?? ''));
                if ($manufacturer !== '') $manufacturerNames[mb_strtolower($manufacturer)] = $manufacturer;

                $images = gomagProductImages($product['images'] ?? []);
                if ($images) {
                    foreach (gomagProductCategoryIds($product['categories'] ?? []) as $externalCategoryId) {
                        if (!isset($selected[$externalCategoryId]) || in_array($externalCategoryId, $rootIds, true)) continue;
                        if (!isset($categoryImageUrls[$externalCategoryId])) $categoryImageUrls[$externalCategoryId] = $images[0];
                    }
                }

                foreach (gomagValues($product['attributes'] ?? []) as $attribute) {
                    if (!is_array($attribute)) continue;
                    $attributeName = mb_strtoupper(trim((string)($attribute['name'] ?? '')));
                    if (!in_array($attributeName, ['COMPATIBILITATE TROTINETA', 'VEHICUL COMPATIBIL'], true)) continue;
                    foreach (gomagAttributeValues($attribute['value'] ?? null) as $value) {
                        if (preg_match('/^(trotineta|multiple modele)$/iu', $value)) continue;
                        $compatibilityNames[mb_strtolower($value)] = $value;
                    }
                }
            }
            $pages = max(1, (int)($response['pages'] ?? 1));
            $page++;
        } while ($page <= $pages);
    }

    $thumbnailCount = 0;
    $thumbnailMissing = [];
    foreach ($selected as $externalId => $category) {
        $externalId = (string)$externalId;
        if (in_array($externalId, $rootIds, true)) continue;
        $categoryId = $categoryIds[$externalId];
        $read = $db->prepare('SELECT thumbnail_path FROM shop_categories WHERE id = ? LIMIT 1');
        $read->execute([$categoryId]);
        $currentPath = (string)($read->fetchColumn() ?: '');
        $imageUrl = trim((string)($categoryImageUrls[$externalId] ?? ''));
        $nextPath = $imageUrl === '' ? '' : gomagDownloadCategoryThumbnail($imageUrl, $externalId, $currentPath ?: null);
        if ($nextPath === '' && $imageUrl !== '') $nextPath = $imageUrl;
        if ($nextPath === '') {
            $thumbnailMissing[] = (string)($category['name'] ?? $externalId);
            continue;
        }
        $update = $db->prepare('UPDATE shop_categories SET thumbnail_path = ? WHERE id = ?');
        $update->execute([$nextPath, $categoryId]);
        $thumbnailCount++;
    }

    natcasesort($manufacturerNames);
    natcasesort($compatibilityNames);
    $manufacturerCount = gomagUpsertNamedTaxonomy($db, 'shop_manufacturers', 'manufacturer', array_values($manufacturerNames));
    $compatibilityCount = gomagUpsertNamedTaxonomy($db, 'shop_brands', 'compatibility', array_values($compatibilityNames));

    $productCount = (int)$db->query('SELECT COUNT(*) FROM shop_products')->fetchColumn();
    return [
        'success' => true,
        'source_id' => (string)$source['id'],
        'categories' => count($selected),
        'root_categories' => count($rootIds),
        'subcategories' => count($selected) - count($rootIds),
        'subcategories_with_thumbnail' => $thumbnailCount,
        'subcategories_without_thumbnail' => $thumbnailMissing,
        'manufacturers' => $manufacturerCount,
        'compatibilities' => $compatibilityCount,
        'compatibility_names' => array_values($compatibilityNames),
        'products_scanned_temporarily' => count($seenProducts),
        'products_imported' => 0,
        'crm_products_after_sync' => $productCount,
    ];
}

function boomagFeedContents(array $config): string {
    $url = trim((string)($config['boomag_feed_url'] ?? 'https://www.boomag.ro/feed/doctor-trotineta.csv'));
    if (!preg_match('#^https://#i', $url)) throw new RuntimeException('Feedul Boomag nu este configurat corect.');

    $raw = false;
    $status = 0;
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 12,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_MAXREDIRS => 4,
            CURLOPT_USERAGENT => 'G-Trots-Shop/1.0',
        ]);
        $raw = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        if ($status < 200 || $status >= 300) {
            throw new RuntimeException('Feedul Boomag nu a raspuns corect' . ($error ? ': ' . $error : '.'));
        }
    } else {
        $context = stream_context_create(['http' => [
            'timeout' => 60,
            'ignore_errors' => true,
            'header' => "User-Agent: G-Trots-Shop/1.0\r\nAccept: text/csv\r\n",
        ]]);
        $raw = @file_get_contents($url, false, $context);
    }

    if (!is_string($raw) || strlen($raw) < 100) throw new RuntimeException('Feedul Boomag este gol sau incomplet.');
    if (strlen($raw) > 20 * 1024 * 1024) throw new RuntimeException('Feedul Boomag depaseste limita de siguranta.');
    return $raw;
}

function boomagParseFeedRows(string $raw): array {
    $stream = fopen('php://temp', 'w+b');
    if ($stream === false) throw new RuntimeException('Feedul Boomag nu a putut fi procesat.');
    fwrite($stream, $raw);
    rewind($stream);

    $headers = fgetcsv($stream, 0, '|', '"', '\\');
    if (!is_array($headers)) {
        fclose($stream);
        throw new RuntimeException('Antetul feedului Boomag lipseste.');
    }
    $headers = array_map(static function ($value): string {
        return trim(preg_replace('/^\xEF\xBB\xBF/', '', (string)$value) ?? '');
    }, $headers);
    foreach (['id', 'sku', 'name', 'stock_status', 'stock'] as $required) {
        if (!in_array($required, $headers, true)) {
            fclose($stream);
            throw new RuntimeException('Feedul Boomag nu contine coloana ' . $required . '.');
        }
    }

    $rows = [];
    while (($values = fgetcsv($stream, 0, '|', '"', '\\')) !== false) {
        if (count($values) !== count($headers)) continue;
        $row = array_combine($headers, $values);
        if (!is_array($row)) continue;
        $sku = trim((string)($row['sku'] ?? ''));
        $externalId = trim((string)($row['id'] ?? ''));
        if ($sku === '' && $externalId === '') continue;
        $rows[] = $row;
    }
    fclose($stream);
    if (count($rows) < 100) throw new RuntimeException('Feedul Boomag pare incomplet; sincronizarea a fost oprita preventiv.');
    return $rows;
}

function boomagNormalizeProductCode(string $value): string {
    return mb_substr(trim($value), 0, 80);
}

function boomagFeedRows(array $config, bool $forceRefresh = false, int $maxCacheAgeSeconds = 21600): array {
    $directory = __DIR__ . '/uploads/import';
    $cacheFile = $directory . '/boomag-products.csv';
    $maxCacheAgeSeconds = max(60, min($maxCacheAgeSeconds, 21600));
    $cacheIsFresh = is_file($cacheFile) && filemtime($cacheFile) >= time() - $maxCacheAgeSeconds;
    if (!$forceRefresh && $cacheIsFresh) {
        $cached = @file_get_contents($cacheFile);
        if (is_string($cached) && strlen($cached) >= 100) return boomagParseFeedRows($cached);
    }

    $raw = boomagFeedContents($config);
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        return boomagParseFeedRows($raw);
    }
    $temporary = $cacheFile . '.tmp-' . bin2hex(random_bytes(4));
    if (file_put_contents($temporary, $raw, LOCK_EX) !== false) {
        @rename($temporary, $cacheFile);
    } else {
        @unlink($temporary);
    }
    return boomagParseFeedRows($raw);
}

function boomagStockAvailable($value): bool {
    return in_array(mb_strtolower(trim((string)$value)), ['1', 'true', 'yes', 'da', 'in_stock', 'instock', 'in stoc'], true);
}

function boomagFeedPrice(array $row): ?float {
    $raw = str_replace([' ', ','], ['', '.'], trim((string)($row['base_price'] ?? '')));
    if ($raw === '' || !is_numeric($raw)) return null;
    $price = round((float)$raw, 2);
    return $price > 0 ? $price : null;
}

function boomagSalePriceForBase(float $price, ?string $discountType, $discountValue): ?float {
    $value = $discountValue === null ? 0.0 : (float)$discountValue;
    if ($value <= 0) return null;
    if ($discountType === 'fixed') {
        return $value < $price ? round($price - $value, 2) : null;
    }
    return $value < 100 ? round($price * (1 - $value / 100), 2) : null;
}

function gomagSyncProductFromFeed(PDO $db, array $config, string $idOrSlug): array {
    $stmt = $db->prepare(
        'SELECT p.id, p.slug, p.sku, p.supplier_product_code, p.supplier_external_id,
                LOWER(COALESCE(s.domain, p.source_domain, "")) AS source_domain,
                p.price, p.sale_price, p.discount_type, p.discount_value, p.stock_quantity,
                p.supplier_stock_quantity, p.supplier_stock_status, p.supplier_base_price,
                p.supplier_price_difference
         FROM shop_products p
         LEFT JOIN shop_product_sources s ON s.id = p.source_id
         WHERE p.id = ? OR p.slug = ?
         LIMIT 1'
    );
    $stmt->execute([$idOrSlug, $idOrSlug]);
    $product = $stmt->fetch();
    if (!$product || mb_strtolower(trim((string)($product['source_domain'] ?? ''))) !== 'boomag.ro') {
        return ['synced' => false, 'reason' => 'not_boomag'];
    }

    $codes = [];
    foreach ([$product['sku'] ?? '', $product['supplier_product_code'] ?? ''] as $code) {
        $key = mb_strtolower(trim((string)$code));
        if ($key !== '') $codes[$key] = true;
    }
    if (!$codes) return ['synced' => false, 'reason' => 'missing_code', 'product_id' => (string)$product['id']];

    $feedRow = null;
    $externalId = trim((string)($product['supplier_external_id'] ?? ''));
    foreach (boomagFeedRows($config, false, 900) as $row) {
        $rowExternalId = trim((string)($row['id'] ?? ''));
        $key = mb_strtolower(trim((string)($row['sku'] ?? '')));
        if (($externalId !== '' && $rowExternalId === $externalId) || ($key !== '' && isset($codes[$key]))) {
            $feedRow = $row;
            break;
        }
    }
    if (!is_array($feedRow)) {
        return ['synced' => false, 'reason' => 'not_in_feed', 'product_id' => (string)$product['id']];
    }

    $available = boomagStockAvailable($feedRow['stock_status'] ?? '0');
    $stock = max(0, (int)floor((float)str_replace(',', '.', trim((string)($feedRow['stock'] ?? '0')))));
    if (!$available) $stock = 0;
    $supplierBase = boomagFeedPrice($feedRow);
    $difference = $product['supplier_price_difference'] === null
        ? null
        : round((float)$product['supplier_price_difference'], 2);
    $currentPrice = round((float)$product['price'], 2);
    $nextPrice = $currentPrice;
    if ($supplierBase !== null) {
        if ($difference === null) $difference = round($currentPrice - $supplierBase, 2);
        $nextPrice = max(0.01, round($supplierBase + $difference, 2));
    }
    $nextSalePrice = boomagSalePriceForBase(
        $nextPrice,
        isset($product['discount_type']) ? (string)$product['discount_type'] : null,
        $product['discount_value'] ?? null
    );
    $priceChanged = abs($nextPrice - $currentPrice) >= 0.005
        || (($product['sale_price'] === null) !== ($nextSalePrice === null))
        || ($nextSalePrice !== null && abs((float)$product['sale_price'] - $nextSalePrice) >= 0.005);
    $stockChanged = (int)$product['stock_quantity'] !== $stock
        || (int)$product['supplier_stock_quantity'] !== $stock
        || (bool)$product['supplier_stock_status'] !== $available;
    $feedSku = boomagNormalizeProductCode((string)($feedRow['sku'] ?? ''));
    if ($feedSku === '') return ['synced' => false, 'reason' => 'missing_feed_sku', 'product_id' => (string)$product['id']];

    $update = $db->prepare(
        'UPDATE shop_products
         SET sku = ?, supplier_product_code = ?, supplier_base_price = ?, supplier_price_difference = ?, supplier_price_updated_at = NOW(),
             price = ?, sale_price = ?, stock_mode = "tracked", stock_quantity = ?,
             supplier_stock_quantity = ?, supplier_stock_status = ?, supplier_stock_updated_at = NOW(),
             updated_at = updated_at
         WHERE id = ?'
    );
    $update->execute([
        $feedSku,
        $feedSku,
        $supplierBase,
        $difference,
        $nextPrice,
        $nextSalePrice,
        $stock,
        $stock,
        $available ? 1 : 0,
        (string)$product['id'],
    ]);
    shopNirEnsureBoomagKidotoysReferences($db, (string)$product['id']);

    return [
        'synced' => true,
        'product_id' => (string)$product['id'],
        'price_changed' => $priceChanged,
        'stock_changed' => $stockChanged,
        'supplier_base_price' => $supplierBase,
        'price_difference' => $difference,
        'price' => $nextPrice,
        'stock' => $stock,
    ];
}

function boomagNormalizeKey(string $value): string {
    $value = html_entity_decode(trim($value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (function_exists('iconv')) {
        $converted = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        if ($converted !== false) $value = $converted;
    }
    $value = mb_strtolower($value);
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $value) ?? '');
}

function boomagPlainText(string $value): string {
    $value = preg_replace('#<\s*(br|/p|/div|/li)\s*/?>#iu', "\n", $value) ?? $value;
    $value = strip_tags($value);
    $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $value = preg_replace('/[ \t]+/u', ' ', $value) ?? $value;
    $value = preg_replace('/\s*\n\s*/u', "\n", $value) ?? $value;
    return trim(preg_replace('/\n{3,}/u', "\n\n", $value) ?? $value);
}

function boomagExcerpt(string $value, int $limit): string {
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    if (mb_strlen($value) <= $limit) return $value;
    $cut = mb_substr($value, 0, max(1, $limit - 1));
    $space = mb_strrpos($cut, ' ');
    if ($space !== false && $space > (int)($limit * 0.65)) $cut = mb_substr($cut, 0, $space);
    return rtrim($cut, " \t\n\r\0\x0B,;:-") . '…';
}

function boomagCleanTitle(string $value): string {
    $value = boomagPlainText($value);
    $value = preg_replace('/\s*([|–—])\s*/u', ' - ', $value) ?? $value;
    $value = preg_replace('/\s+/u', ' ', $value) ?? $value;
    return mb_substr(trim($value), 0, 180);
}

function boomagCategoryIndex(PDO $db): array {
    $rows = $db->query('SELECT id, parent_id, name FROM shop_categories WHERE is_active = 1 ORDER BY parent_id IS NULL DESC, name ASC')->fetchAll();
    $byName = [];
    foreach ($rows as $row) $byName[boomagNormalizeKey((string)$row['name'])] = (string)$row['id'];
    return ['rows' => $rows, 'by_name' => $byName];
}

function boomagCategoryIdByName(array $index, string $name): ?string {
    $key = boomagNormalizeKey($name);
    return isset($index['by_name'][$key]) ? (string)$index['by_name'][$key] : null;
}

function boomagInferCategory(PDO $db, array $row): ?string {
    static $index = null;
    if ($index === null) $index = boomagCategoryIndex($db);
    $feedCategory = trim((string)($row['category_name'] ?? ''));
    $exact = boomagCategoryIdByName($index, $feedCategory);
    $rootNames = ['Accesorii trotinete electrice', 'Piese trotinete electrice'];
    if ($exact !== null && !in_array(boomagNormalizeKey($feedCategory), array_map('boomagNormalizeKey', $rootNames), true)) return $exact;

    $aliases = [
        'casca bicicleta' => 'Casti protectie',
        'lumini bicicleta' => 'Faruri si lumini',
        'antifurt bicicleta cu alarma sau gps' => 'Sistem antifurt',
        'antifurt bicicleta cu lant' => 'Sistem antifurt',
        'antifurt bicicleta cu cablu din otel' => 'Sistem antifurt',
        'discuri frana bicicleta' => 'Discuri de frana',
        'placute frana bicicleta' => 'Placute de frana',
        'suport telefon bicicleta' => 'Suport telefon',
        'sisteme franare trotinete electrice' => 'Componente franare',
        'rucsaci si borsete ciclism' => 'Genti Transport',
        'cabluri si camasi' => 'Cabluri de frana',
        'camera bicicleta' => 'Camere',
        'chei si scule bicicleta' => 'Accesorii trotinete electrice',
    ];
    $feedKey = boomagNormalizeKey($feedCategory);

    $nameText = boomagNormalizeKey((string)($row['name'] ?? ''));
    $text = boomagNormalizeKey((string)($row['name'] ?? '') . ' ' . $feedCategory . ' ' . boomagPlainText((string)($row['description'] ?? '')));
    $rules = [
        ['cauciuc plin|anvelopa plina', 'Cauciucuri pline'],
        ['tubeless|fara camera', 'Cauciucuri tubeless'],
        ['camera aer|camera bicicleta|camera trotineta', 'Camere'],
        ['cauciuc|anvelop', 'Cauciucuri'],
        ['valva|ventil', 'Valve'],
        ['incarcator|charger', 'Incarcatoare'],
        ['acumulator|baterie', 'Acumulatori'],
        ['\bbms\b', 'BMS'],
        ['controller|controler', 'Controller'],
        ['convertor|dc dc', 'Convertor'],
        ['display|ecran|bord', 'Display'],
        ['far|stop|lumina|semnalizare', 'Faruri si lumini'],
        ['claxon', 'Claxoane'],
        ['acceleratie|accelerator', 'Manete acceleratie'],
        ['maneta frana', 'Manete de frana'],
        ['placut.*frana', 'Placute de frana'],
        ['disc.*frana', 'Discuri de frana'],
        ['etrier', 'Etrier frana'],
        ['frana hidraulic', 'Frane hidraulice'],
        ['frana tambur', 'Frane cu tambur'],
        ['cablu.*frana|camasa.*frana', 'Cabluri de frana'],
        ['motor', 'Motoare'],
        ['senzor', 'Senzori'],
        ['mufa|conector|cablaj|cablu electric', 'Cabluri si mufe'],
        ['buton|comutator', 'Butoane si conectori'],
        ['furca', 'Furca'],
        ['suspensie|amortizor', 'Suspensii'],
        ['rulment|surub|piulita|saiba', 'Rulmenti si suruburi'],
        ['pliere|balama', 'Sisteme de pliere'],
        ['aripa|protectie cadru', 'Aparatori si protectii'],
        ['ghidon', 'Ghidoane'],
        ['roata|janta', 'Roti'],
        ['cric', 'Cric'],
        ['geanta|borseta|rucsac', 'Genti Transport'],
        ['suport.*telefon', 'Suport telefon'],
        ['antifurt|lacat', 'Sistem antifurt'],
        ['casca|protectie cap', 'Casti protectie'],
        ['maner|manso', 'Mansoane'],
        ['oglinda', 'Oglinzi'],
        ['scaun|sezut', 'Scaune'],
        ['sonerie', 'Sonerii'],
        ['sticker|reflectoriz', 'Stickere reflectorizate'],
    ];
    foreach ([$nameText, $text] as $searchText) {
        foreach ($rules as [$pattern, $categoryName]) {
            if (preg_match('/' . $pattern . '/iu', $searchText)) {
                $categoryId = boomagCategoryIdByName($index, $categoryName);
                if ($categoryId !== null) return $categoryId;
            }
        }
    }
    if (isset($aliases[$feedKey])) {
        $aliasId = boomagCategoryIdByName($index, $aliases[$feedKey]);
        if ($aliasId !== null) return $aliasId;
    }
    $fallback = str_contains($feedKey, 'accesor') || str_contains($feedKey, 'ciclism')
        ? 'Accesorii trotinete electrice'
        : 'Piese trotinete electrice';
    return boomagCategoryIdByName($index, $fallback) ?? $exact;
}

function boomagFindOrCreateTaxonomy(PDO $db, string $table, string $type, string $name): ?string {
    $name = mb_substr(trim($name), 0, 120);
    if ($name === '') return null;
    gomagUpsertNamedTaxonomy($db, $table, $type, [$name]);
    $stmt = $db->prepare("SELECT id FROM {$table} WHERE slug = ? OR LOWER(name) = LOWER(?) LIMIT 1");
    $stmt->execute([slugBase($name), $name]);
    $id = $stmt->fetchColumn();
    return $id ? (string)$id : null;
}

function boomagCompatibilityNames(array $row): array {
    $text = boomagPlainText((string)($row['name'] ?? '') . "\n" . (string)($row['description'] ?? ''));
    $patterns = [
        'KuKirin' => '/\b(ku\s*kirin|kukirin|kugoo\s*kirin)\b/iu',
        'Kugoo' => '/\bkugoo\b/iu',
        'Xiaomi' => '/\b(xiaomi|mijia|m365)\b/iu',
        'Segway-Ninebot' => '/\b(segway|ninebot)\b/iu',
        'Dualtron' => '/\bdualtron\b/iu',
        'Kaabo' => '/\bkaabo\b/iu',
        'Vsett' => '/\bvsett\b/iu',
        'Joyor' => '/\bjoyor\b/iu',
        'Navee' => '/\bnavee\b/iu',
        'Apollo' => '/\bapollo\b/iu',
        'Inokim' => '/\binokim\b/iu',
        'E-Twow' => '/\be[\s-]?twow\b/iu',
        'InMotion' => '/\binmotion\b/iu',
        'iScooter' => '/\biscooter\b/iu',
        'Teverun' => '/\bteverun\b/iu',
        'Techlife' => '/\btechlife\b/iu',
        'Zero' => '/\bzero\s*(8|9|10|11|scooter)\b/iu',
        'Pure Electric' => '/\bpure\s*(electric|air|advance)\b/iu',
        'Motus' => '/\bmotus\b/iu',
        'Razor' => '/\brazor\b/iu',
        'Nami' => '/\bnami\b/iu',
        'Obarter' => '/\bobarter\b/iu',
        'Hiley' => '/\bhiley\b/iu',
        'Ausom' => '/\bausom\b/iu',
        'Aovo' => '/\baovo\b/iu',
        'Laotie' => '/\blaotie\b/iu',
        'CityCoco' => '/\bcity\s*coco\b/iu',
        'Wispeed' => '/\bwispeed\b/iu',
        'Speedway' => '/\bspeedway\b/iu',
        'Nanrobot' => '/\bnanrobot\b/iu',
        'Fiido' => '/\bfiido\b/iu',
        'Engwe' => '/\bengwe\b/iu',
        'Hitway' => '/\bhitway\b/iu',
        'Universal' => '/\b(universal|toate\s+trotinetele|orice\s+trotineta)\b/iu',
    ];
    $names = [];
    foreach ($patterns as $name => $pattern) {
        if (preg_match($pattern, $text)) $names[$name] = true;
    }
    return array_keys($names);
}

function boomagProductSpecifications(array $row, string $categoryName, string $manufacturerName): array {
    $specs = [];
    $add = static function (string $group, string $label, string $value) use (&$specs): void {
        $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
        if ($value === '' || mb_strlen($value) > 300 || count($specs) >= 60) return;
        $key = boomagNormalizeKey($group . ' ' . $label);
        foreach ($specs as $existing) {
            if (boomagNormalizeKey((string)$existing['group'] . ' ' . (string)$existing['label']) === $key) return;
        }
        $specs[] = ['group' => $group, 'label' => $label, 'value' => $value];
    };
    $add('Identificare produs', 'Cod produs', (string)($row['sku'] ?? ''));
    if (trim((string)($row['ean'] ?? '')) !== '') $add('Identificare produs', 'EAN', (string)$row['ean']);
    if ($manufacturerName !== '') $add('Identificare produs', 'Producator', $manufacturerName);
    if ($categoryName !== '') $add('Clasificare', 'Categorie', $categoryName);

    $plain = boomagPlainText((string)($row['description'] ?? ''));
    foreach (preg_split('/\n+/u', $plain) ?: [] as $line) {
        if (!preg_match('/^\s*([\p{L}\p{N}][\p{L}\p{N}\s()\/.,+-]{1,58})\s*:\s*(.{1,300})$/u', trim($line), $match)) continue;
        $label = trim($match[1]);
        $value = trim($match[2]);
        if (preg_match('/^(pret|stoc|produs|descriere|observatii?)$/iu', $label)) continue;
        $add('Specificatii tehnice', $label, $value);
    }
    return $specs;
}

function boomagProductQuestions(array $row, array $compatibilities): array {
    $name = boomagCleanTitle((string)($row['name'] ?? 'produsul'));
    $sku = trim((string)($row['sku'] ?? ''));
    $compatibilityAnswer = $compatibilities
        ? 'Din informatiile furnizorului reies compatibilitati cu ' . implode(', ', $compatibilities) . '. Confirma modelul, anul si dimensiunile piesei inainte de comanda.'
        : 'Compatibilitatea trebuie confirmata dupa modelul complet al trotinetei, anul sau revizia si dimensiunile piesei originale.';
    return [
        ['question' => 'Cu ce trotinete este compatibil ' . $name . '?', 'answer' => $compatibilityAnswer],
        ['question' => 'Cum verific daca produsul se potriveste?', 'answer' => 'Compara codul, mufele, dimensiunile si specificatiile cu piesa existenta. Echipa G-Trots te poate ajuta daca trimiti modelul complet si fotografii clare.'],
        ['question' => 'Care este codul produsului?', 'answer' => $sku !== '' ? 'Codul de identificare al furnizorului este ' . $sku . '.' : 'Codul de identificare este afisat in fisa produsului.'],
        ['question' => 'Pot solicita montaj sau verificare?', 'answer' => 'Da. Pentru componentele care influenteaza franarea, alimentarea sau structura recomandam verificare si montaj intr-un service specializat.'],
    ];
}

function boomagProductContent(array $row, string $categoryName, string $manufacturerName, array $compatibilities): array {
    $name = boomagCleanTitle((string)($row['name'] ?? ''));
    $sourceDescription = boomagPlainText((string)($row['description'] ?? ''));
    $fallback = $name;
    $short = boomagExcerpt($sourceDescription !== '' ? $sourceDescription : $fallback, 320);
    $descriptionTitle = boomagExcerpt($name, 210);
    $metaBase = $name . ($categoryName !== '' ? ' - ' . $categoryName : '') . ' | G-Trots';
    $metaTitle = boomagExcerpt($metaBase, 60);
    $metaDescription = boomagExcerpt($short ?: $fallback, 158);

    $paragraphs = [];
    foreach (preg_split('/\n+/u', $sourceDescription) ?: [] as $paragraph) {
        $paragraph = trim($paragraph);
        if ($paragraph !== '') $paragraphs[] = '<p>' . htmlspecialchars($paragraph, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>';
    }
    if (!$paragraphs) $paragraphs[] = '<p>' . htmlspecialchars($fallback, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>';
    $details = implode("\n", $paragraphs);
    return [
        'name' => $name,
        'short_description' => $short,
        'description_title' => $descriptionTitle,
        'description_html' => $details,
        'meta_title' => $metaTitle,
        'meta_description' => $metaDescription,
        'specifications' => boomagProductSpecifications($row, $categoryName, $manufacturerName),
        'questions' => [],
    ];
}

function boomagDownloadProductImage(string $url, string $externalId, int $index): string {
    $url = trim($url);
    if (!preg_match('#^https?://#i', $url)) return '';
    $directory = __DIR__ . '/uploads/products';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) return '';
    $baseName = md5('boomag|' . $externalId . '|' . $index . '|' . $url);
    foreach (['webp', 'jpg', 'png', 'gif'] as $extension) {
        $existing = $directory . '/' . $baseName . '.' . $extension;
        if (is_file($existing) && filesize($existing) > 500) return 'uploads/products/' . basename($existing);
    }

    $binary = false;
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 12,
            CURLOPT_TIMEOUT => 50,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_USERAGENT => 'G-Trots-Shop/1.0',
        ]);
        $binary = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        if ($status < 200 || $status >= 300) $binary = false;
    } else {
        $binary = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 50]]));
    }
    if (!is_string($binary) || strlen($binary) < 500 || strlen($binary) > 15 * 1024 * 1024) return '';
    $info = @getimagesizefromstring($binary);
    $mime = is_array($info) ? (string)($info['mime'] ?? '') : '';
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    if (!isset($extensions[$mime])) return '';

    if (function_exists('imagecreatefromstring') && function_exists('imagewebp')) {
        $source = @imagecreatefromstring($binary);
        if ($source !== false) {
            $width = imagesx($source);
            $height = imagesy($source);
            $scale = min(1, 1600 / max($width, $height));
            $targetWidth = max(1, (int)round($width * $scale));
            $targetHeight = max(1, (int)round($height * $scale));
            $canvas = imagecreatetruecolor($targetWidth, $targetHeight);
            imagealphablending($canvas, false);
            imagesavealpha($canvas, true);
            imagecopyresampled($canvas, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);
            $path = $directory . '/' . $baseName . '.webp';
            $saved = @imagewebp($canvas, $path, 84);
            imagedestroy($canvas);
            imagedestroy($source);
            if ($saved) return 'uploads/products/' . basename($path);
        }
    }

    $extension = $extensions[$mime];
    $path = $directory . '/' . $baseName . '.' . $extension;
    return file_put_contents($path, $binary, LOCK_EX) === false ? '' : 'uploads/products/' . basename($path);
}

function boomagSyncImportedImages(PDO $db, string $productId, string $externalId, string $name, array $row): array {
    $urls = [];
    foreach (['file', 'image2', 'image3', 'image4', 'image5'] as $column) {
        $url = trim((string)($row[$column] ?? ''));
        if ($url !== '' && !in_array($url, $urls, true)) $urls[] = $url;
    }
    $saved = [];
    foreach ($urls as $index => $url) {
        $path = boomagDownloadProductImage($url, $externalId, $index);
        if ($path !== '') $saved[] = ['url' => $url, 'path' => $path, 'sort_order' => $index];
    }
    if (!$saved) return ['saved' => 0, 'requested' => count($urls)];

    $db->prepare('DELETE FROM shop_product_images WHERE product_id = ?')->execute([$productId]);
    $insert = $db->prepare('INSERT INTO shop_product_images (id, product_id, image_path, alt_text, sort_order) VALUES (?, ?, ?, ?, ?)');
    foreach ($saved as $image) {
        $insert->execute([
            gomagStableUuid('product-image', $externalId . '|' . (string)$image['sort_order'] . '|' . (string)$image['url']),
            $productId,
            (string)$image['path'],
            mb_substr($name, 0, 180),
            (int)$image['sort_order'],
        ]);
    }
    return ['saved' => count($saved), 'requested' => count($urls)];
}

function boomagImportProductsBatch(PDO $db, array $config, int $offset, int $limit, bool $forceFeedRefresh = false): array {
    $rows = boomagFeedRows($config, $forceFeedRefresh);
    $total = count($rows);
    $offset = max(0, min($offset, $total));
    $limit = max(1, min($limit, 10));
    $batch = array_slice($rows, $offset, $limit);
    $source = $db->query("SELECT * FROM shop_product_sources WHERE LOWER(domain) = 'boomag.ro' LIMIT 1")->fetch();
    if (!$source) throw new RuntimeException('Sursa boomag.ro nu exista in catalog.');

    $categoryNames = [];
    foreach ($db->query('SELECT id, name FROM shop_categories')->fetchAll() as $category) {
        $categoryNames[(string)$category['id']] = (string)$category['name'];
    }
    $stats = ['created' => 0, 'updated' => 0, 'duplicates_skipped' => 0, 'images_saved' => 0, 'images_missing' => 0, 'without_compatibility' => 0, 'seo_pages_generated' => 0, 'seo_errors' => [], 'errors' => []];

    foreach ($batch as $batchIndex => $row) {
        $externalId = trim((string)($row['id'] ?? ''));
        $supplierSku = boomagNormalizeProductCode((string)($row['sku'] ?? ''));
        try {
            if ($externalId === '' || $supplierSku === '') throw new RuntimeException('Produsul nu are ID sau cod de furnizor.');
            $categoryId = boomagInferCategory($db, $row);
            $categoryName = $categoryId !== null ? (string)($categoryNames[$categoryId] ?? '') : '';
            $manufacturerName = boomagCleanTitle((string)($row['brand_name'] ?? ''));
            $manufacturerId = boomagFindOrCreateTaxonomy($db, 'shop_manufacturers', 'manufacturer', $manufacturerName);
            $compatibilities = boomagCompatibilityNames($row);
            $brandIds = [];
            foreach ($compatibilities as $compatibility) {
                $brandId = boomagFindOrCreateTaxonomy($db, 'shop_brands', 'compatibility', $compatibility);
                if ($brandId !== null) $brandIds[] = $brandId;
            }
            if (!$brandIds) $stats['without_compatibility']++;
            $content = boomagProductContent($row, $categoryName, $manufacturerName, $compatibilities);
            $available = boomagStockAvailable($row['stock_status'] ?? '0');
            $stock = max(0, (int)floor((float)str_replace(',', '.', trim((string)($row['stock'] ?? '0')))));
            if (!$available) $stock = 0;
            $priceRaw = str_replace([' ', ','], ['', '.'], trim((string)($row['base_price'] ?? '0')));
            $price = max(0, round((float)$priceRaw, 2));
            $ean = mb_substr(trim((string)($row['ean'] ?? '')), 0, 120);
            $sourceUrl = mb_substr(trim((string)($row['url'] ?? '')), 0, 500);

            $find = $db->prepare('SELECT * FROM shop_products WHERE (source_id = ? AND supplier_external_id = ?) OR supplier_product_code = ? LIMIT 1');
            $find->execute([(string)$source['id'], $externalId, $supplierSku]);
            $existing = $find->fetch();
            if (!$existing) {
                $findDuplicateName = $db->prepare(
                    'SELECT id FROM shop_products
                     WHERE (source_id = ? OR LOWER(source_domain) = "boomag.ro")
                       AND LOWER(TRIM(name)) = LOWER(TRIM(?))
                     LIMIT 1'
                );
                $findDuplicateName->execute([(string)$source['id'], $content['name']]);
                if ($findDuplicateName->fetchColumn()) {
                    $stats['duplicates_skipped']++;
                    continue;
                }
            }
            $productId = $existing ? (string)$existing['id'] : gomagStableUuid('product', $externalId);
            $contentStatus = $existing ? (string)($existing['content_status'] ?? 'manual') : 'baseline';
            $refreshEditorialContent = !$existing || $contentStatus === 'baseline';
            $slug = uniqueSlug($db, 'shop_products', $content['name'], $existing ? $productId : null);
            $specificationsJson = json_encode($content['specifications'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $questionsJson = json_encode($content['questions'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            $db->beginTransaction();
            if (!$existing) {
                $insert = $db->prepare(
                    'INSERT INTO shop_products
                     (id, category_id, manufacturer_id, source_id, supplier_external_id, sku, supplier_product_code, ean, source_domain, source_url,
                      name, slug, short_description, description_title, description_html, specifications_json, questions_json, meta_title, meta_description,
                      cost_price, price, sale_price, discount_type, discount_value, currency, stock_mode, stock_quantity,
                      supplier_stock_quantity, supplier_stock_status, supplier_stock_updated_at, accounting_stock_quantity,
                      low_stock_threshold, is_active, is_featured, content_status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, "boomag.ro", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, "percent", NULL, "RON", "tracked", ?, ?, ?, NOW(), 0, 3, 1, 0, "baseline")'
                );
                $insert->execute([
                    $productId, $categoryId, $manufacturerId, (string)$source['id'], $externalId, $supplierSku, $supplierSku, $ean !== '' ? $ean : null, $sourceUrl !== '' ? $sourceUrl : null,
                    $content['name'], $slug, $content['short_description'], $content['description_title'], $content['description_html'],
                    $specificationsJson, $questionsJson, $content['meta_title'], $content['meta_description'], $price, $stock, $stock, $available ? 1 : 0,
                ]);
                $stats['created']++;
            } else {
                $update = $db->prepare(
                    'UPDATE shop_products SET category_id = IF(content_status = "baseline", ?, category_id), manufacturer_id = IF(content_status = "baseline", ?, manufacturer_id),
                     source_id = IF(content_status = "baseline", ?, source_id), supplier_external_id = ?, sku = ?,
                     supplier_product_code = ?, ean = IF(content_status = "baseline", ?, ean),
                     source_domain = IF(content_status = "baseline", "boomag.ro", source_domain), source_url = IF(content_status = "baseline", ?, source_url),
                     price = IF(content_status = "baseline", ?, price), currency = IF(content_status = "baseline", "RON", currency),
                     stock_mode = IF(LOWER(source_domain) = "boomag.ro", "tracked", stock_mode),
                     stock_quantity = IF(LOWER(source_domain) = "boomag.ro", ?, stock_quantity),
                     supplier_stock_quantity = IF(LOWER(source_domain) = "boomag.ro", ?, supplier_stock_quantity),
                     supplier_stock_status = IF(LOWER(source_domain) = "boomag.ro", ?, supplier_stock_status),
                     supplier_stock_updated_at = IF(LOWER(source_domain) = "boomag.ro", NOW(), supplier_stock_updated_at), is_active = 1,
                     name = IF(content_status = "baseline", ?, name), slug = IF(content_status = "baseline", ?, slug),
                     short_description = IF(content_status = "baseline", ?, short_description), description_title = IF(content_status = "baseline", ?, description_title),
                     description_html = IF(content_status = "baseline", ?, description_html), specifications_json = IF(content_status = "baseline", ?, specifications_json),
                     questions_json = IF(content_status = "baseline", ?, questions_json), meta_title = IF(content_status = "baseline", ?, meta_title),
                     meta_description = IF(content_status = "baseline", ?, meta_description)
                     WHERE id = ?'
                );
                $update->execute([
                    $categoryId, $manufacturerId, (string)$source['id'], $externalId, $supplierSku, $supplierSku, $ean !== '' ? $ean : null, $sourceUrl !== '' ? $sourceUrl : null,
                    $price, $stock, $stock, $available ? 1 : 0,
                    $content['name'], $slug, $content['short_description'], $content['description_title'], $content['description_html'],
                    $specificationsJson, $questionsJson, $content['meta_title'], $content['meta_description'], $productId,
                ]);
                $stats['updated']++;
            }
            if ($refreshEditorialContent) {
                $db->prepare('DELETE FROM shop_product_brands WHERE product_id = ?')->execute([$productId]);
                $brandInsert = $db->prepare('INSERT IGNORE INTO shop_product_brands (product_id, brand_id) VALUES (?, ?)');
                foreach (array_values(array_unique($brandIds)) as $brandId) $brandInsert->execute([$productId, $brandId]);
            }
            shopNirEnsureBoomagKidotoysReferences($db, $productId);
            $db->commit();

            $imageResult = $refreshEditorialContent
                ? boomagSyncImportedImages($db, $productId, $externalId, $content['name'], $row)
                : ['saved' => 0, 'requested' => 0];
            $stats['images_saved'] += (int)$imageResult['saved'];
            if ((int)$imageResult['saved'] === 0) $stats['images_missing']++;
            $seoResult = shopProductSeoSync($db, $config, $productId, $existing ? (string)($existing['slug'] ?? '') : null, false);
            if (!empty($seoResult['generated'])) {
                $stats['seo_pages_generated']++;
            } elseif (empty($seoResult['success'])) {
                $stats['seo_errors'][] = ['id' => $externalId, 'sku' => $supplierSku, 'message' => (string)($seoResult['error'] ?? 'Pagina SEO nu a putut fi generată.')];
            }
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            $stats['errors'][] = [
                'offset' => $offset + $batchIndex,
                'id' => $externalId,
                'sku' => $supplierSku,
                'message' => mb_substr($error->getMessage(), 0, 500),
            ];
        }
    }

    try {
        $stats['seo_sitemap'] = shopProductSeoRebuildSitemap($db, $config);
    } catch (Throwable $error) {
        $stats['seo_errors'][] = ['id' => '', 'sku' => '', 'message' => mb_substr($error->getMessage(), 0, 500)];
    }

    $nextOffset = min($total, $offset + count($batch));
    return [
        'success' => count($stats['errors']) === 0,
        'source' => 'boomag.ro',
        'offset' => $offset,
        'processed' => count($batch),
        'next_offset' => $nextOffset,
        'total' => $total,
        'done' => $nextOffset >= $total,
        'stats' => $stats,
    ];
}

function boomagImportAudit(PDO $db, array $config): array {
    $source = $db->query("SELECT id, name, domain, is_active FROM shop_product_sources WHERE LOWER(domain) = 'boomag.ro' LIMIT 1")->fetch();
    if (!$source) throw new RuntimeException('Sursa boomag.ro nu exista in catalog.');
    $sourceId = (string)$source['id'];
    $stmt = $db->prepare(
        'SELECT COUNT(*) AS products,
                COUNT(DISTINCT supplier_external_id) AS distinct_external_ids,
                COUNT(DISTINCT sku) AS distinct_skus,
                SUM(supplier_external_id IS NULL OR supplier_external_id = "") AS missing_external_id,
                SUM(sku IS NULL OR sku = "") AS missing_sku,
                SUM(supplier_product_code IS NULL OR supplier_product_code = "") AS missing_supplier_code,
                SUM(COALESCE(supplier_product_code, "") <> COALESCE(sku, "")) AS supplier_code_mismatch,
                SUM(category_id IS NULL) AS missing_category,
                SUM(manufacturer_id IS NULL) AS missing_manufacturer,
                SUM(price <= 0) AS invalid_price,
                SUM(stock_quantity <> supplier_stock_quantity) AS stock_mismatch,
                SUM(content_status = "baseline") AS baseline_content,
                SUM(content_status = "seo") AS seo_content,
                SUM(ean IS NULL OR ean = "") AS missing_ean,
                SUM(NOT EXISTS (SELECT 1 FROM shop_product_images image WHERE image.product_id = shop_products.id)) AS missing_images,
                SUM(NOT EXISTS (SELECT 1 FROM shop_product_brands pb WHERE pb.product_id = shop_products.id)) AS missing_compatibility
         FROM shop_products
         WHERE source_id = ? OR LOWER(source_domain) = "boomag.ro"'
    );
    $stmt->execute([$sourceId]);
    $summary = $stmt->fetch() ?: [];
    foreach ($summary as $key => $value) $summary[$key] = (int)$value;

    $categoryStmt = $db->prepare(
        'SELECT COALESCE(c.name, "Fara categorie") AS name, COUNT(*) AS products
         FROM shop_products p
         LEFT JOIN shop_categories c ON c.id = p.category_id
         WHERE p.source_id = ? OR LOWER(p.source_domain) = "boomag.ro"
         GROUP BY p.category_id, c.name
         ORDER BY products DESC, name ASC'
    );
    $categoryStmt->execute([$sourceId]);
    $categories = array_map(static fn(array $row): array => ['name' => (string)$row['name'], 'products' => (int)$row['products']], $categoryStmt->fetchAll());

    $compatibilityStmt = $db->prepare(
        'SELECT b.name, COUNT(DISTINCT pb.product_id) AS products
         FROM shop_product_brands pb
         INNER JOIN shop_brands b ON b.id = pb.brand_id
         INNER JOIN shop_products p ON p.id = pb.product_id
         WHERE p.source_id = ? OR LOWER(p.source_domain) = "boomag.ro"
         GROUP BY b.id, b.name
         ORDER BY products DESC, b.name ASC'
    );
    $compatibilityStmt->execute([$sourceId]);
    $compatibilities = array_map(static fn(array $row): array => ['name' => (string)$row['name'], 'products' => (int)$row['products']], $compatibilityStmt->fetchAll());

    $imageStmt = $db->prepare(
        'SELECT COUNT(*) FROM shop_product_images image
         INNER JOIN shop_products p ON p.id = image.product_id
         WHERE p.source_id = ? OR LOWER(p.source_domain) = "boomag.ro"'
    );
    $imageStmt->execute([$sourceId]);
    $feedRows = boomagFeedRows($config);
    return [
        'success' => true,
        'source' => [
            'name' => (string)$source['name'],
            'domain' => (string)$source['domain'],
            'is_active' => (bool)$source['is_active'],
        ],
        'feed_products' => count($feedRows),
        'database' => $summary,
        'images' => (int)$imageStmt->fetchColumn(),
        'categories' => $categories,
        'compatibilities' => $compatibilities,
    ];
}

function gomagSyncSupplierStock(PDO $db, array $config): array {
    // Catalogul poate fi accesat foarte des, dar feedul nu trebuie cerut la fiecare request.
    // O fereastră de 15 minute surprinde și actualizările multiple din aceeași zi.
    $rows = boomagFeedRows($config, false, 900);
    $source = $db->query("SELECT id FROM shop_product_sources WHERE domain = 'boomag.ro' LIMIT 1")->fetchColumn();
    if (!$source) throw new RuntimeException('Sursa boomag.ro nu exista in catalog.');

    $products = $db->prepare(
        'SELECT p.id, p.sku, p.supplier_product_code, p.supplier_external_id,
                p.price, p.sale_price, p.discount_type, p.discount_value,
                p.supplier_base_price, p.supplier_price_difference,
                p.stock_quantity, p.supplier_stock_quantity, p.supplier_stock_status
         FROM shop_products p
         WHERE p.source_id = ? OR LOWER(p.source_domain) = "boomag.ro"'
    );
    $products->execute([(string)$source]);
    $productsById = [];
    $byCode = [];
    $byExternalId = [];
    foreach ($products->fetchAll() as $product) {
        $productId = (string)$product['id'];
        $productsById[$productId] = $product;
        $externalKey = trim((string)($product['supplier_external_id'] ?? ''));
        if ($externalKey !== '') $byExternalId[$externalKey] = $productId;
        foreach ([$product['sku'] ?? '', $product['supplier_product_code'] ?? ''] as $code) {
            $key = mb_strtolower(trim((string)$code));
            if ($key !== '') $byCode[$key] = $productId;
        }
    }

    $matched = [];
    $pricesSynced = [];
    $pricesChanged = [];
    $stocksChanged = [];
    $db->beginTransaction();
    try {
        $reset = $db->prepare(
            'UPDATE shop_products
             SET supplier_stock_quantity = 0, supplier_stock_status = 0,
                 supplier_stock_updated_at = NOW(), stock_mode = "tracked", stock_quantity = 0,
                 updated_at = updated_at
             WHERE source_id = ? OR LOWER(source_domain) = "boomag.ro"'
        );
        $reset->execute([(string)$source]);
        $update = $db->prepare(
            'UPDATE shop_products
             SET sku = ?, supplier_product_code = ?,
                 supplier_base_price = ?, supplier_price_difference = ?, supplier_price_updated_at = NOW(),
                 price = ?, sale_price = ?, supplier_stock_quantity = ?, supplier_stock_status = ?,
                 supplier_stock_updated_at = NOW(), stock_mode = "tracked", stock_quantity = ?,
                 updated_at = updated_at
             WHERE id = ?'
        );
        foreach ($rows as $row) {
            $feedSku = boomagNormalizeProductCode((string)($row['sku'] ?? ''));
            $key = mb_strtolower($feedSku);
            $externalKey = trim((string)($row['id'] ?? ''));
            $productId = $externalKey !== '' && isset($byExternalId[$externalKey])
                ? $byExternalId[$externalKey]
                : ($key !== '' && isset($byCode[$key]) ? $byCode[$key] : null);
            if ($productId === null || $feedSku === '') continue;
            $product = $productsById[$productId] ?? null;
            if (!is_array($product)) continue;

            $available = boomagStockAvailable($row['stock_status'] ?? '0');
            $quantity = max(0, (int)floor((float)str_replace(',', '.', trim((string)($row['stock'] ?? '0')))));
            if (!$available) $quantity = 0;

            $supplierBase = boomagFeedPrice($row);
            $difference = $product['supplier_price_difference'] === null
                ? null
                : round((float)$product['supplier_price_difference'], 2);
            $currentPrice = round((float)$product['price'], 2);
            $nextPrice = $currentPrice;
            if ($supplierBase !== null) {
                // Prima sincronizare memoreaza adaosul deja stabilit in G-Trots.
                // Sincronizarile urmatoare modifica doar baza furnizorului.
                if ($difference === null) $difference = round($currentPrice - $supplierBase, 2);
                $nextPrice = max(0.01, round($supplierBase + $difference, 2));
                $pricesSynced[$productId] = true;
            }
            $nextSalePrice = boomagSalePriceForBase(
                $nextPrice,
                isset($product['discount_type']) ? (string)$product['discount_type'] : null,
                $product['discount_value'] ?? null
            );
            $priceChanged = abs($nextPrice - $currentPrice) >= 0.005
                || (($product['sale_price'] === null) !== ($nextSalePrice === null))
                || ($nextSalePrice !== null && abs((float)$product['sale_price'] - $nextSalePrice) >= 0.005);
            if ($priceChanged) $pricesChanged[$productId] = true;

            $stockChanged = (int)$product['stock_quantity'] !== $quantity
                || (int)$product['supplier_stock_quantity'] !== $quantity
                || (bool)$product['supplier_stock_status'] !== $available;
            if ($stockChanged) $stocksChanged[$productId] = true;

            $update->execute([
                $feedSku,
                $feedSku,
                $supplierBase,
                $difference,
                $nextPrice,
                $nextSalePrice,
                $quantity,
                $available ? 1 : 0,
                $quantity,
                $productId,
            ]);
            $matched[$productId] = true;
        }
        $state = $db->prepare(
            'INSERT INTO shop_supplier_sync_state (source_domain, last_attempt_at, last_synced_at, row_count, matched_products, last_error)
             VALUES ("boomag.ro", NOW(), NOW(), ?, ?, NULL)
             ON DUPLICATE KEY UPDATE last_attempt_at = NOW(), last_synced_at = NOW(), row_count = VALUES(row_count), matched_products = VALUES(matched_products), last_error = NULL'
        );
        $state->execute([count($rows), count($matched)]);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }

    shopNirEnsureBoomagKidotoysReferences($db);

    return [
        'success' => true,
        'source' => 'boomag.ro',
        'feed_products' => count($rows),
        'matched_products' => count($matched),
        'prices_synced' => count($pricesSynced),
        'prices_changed' => count($pricesChanged),
        'stocks_changed' => count($stocksChanged),
        'synced_at' => date(DATE_ATOM),
    ];
}

function gomagMaybeSyncSupplierStock(PDO $db, array $config, int $maxAgeMinutes = 15): ?array {
    $maxAgeSeconds = max(1, $maxAgeMinutes) * 60;
    $state = $db->query("SELECT last_synced_at FROM shop_supplier_sync_state WHERE source_domain = 'boomag.ro' LIMIT 1")->fetch();
    $lastSyncedAt = trim((string)($state['last_synced_at'] ?? ''));
    if ($lastSyncedAt !== '' && strtotime($lastSyncedAt) >= time() - $maxAgeSeconds) return null;

    $lockName = 'g-trots-boomag-catalog-sync';
    $lock = $db->prepare('SELECT GET_LOCK(?, 0)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) return null;
    try {
        $state = $db->query("SELECT last_synced_at FROM shop_supplier_sync_state WHERE source_domain = 'boomag.ro' LIMIT 1")->fetch();
        $lastSyncedAt = trim((string)($state['last_synced_at'] ?? ''));
        if ($lastSyncedAt !== '' && strtotime($lastSyncedAt) >= time() - $maxAgeSeconds) return null;
        return gomagSyncSupplierStock($db, $config);
    } catch (Throwable $error) {
        error_log('[G-Trots Boomag prices and stock] ' . $error->getMessage());
        $failure = $db->prepare(
            'INSERT INTO shop_supplier_sync_state (source_domain, last_attempt_at, last_error)
             VALUES ("boomag.ro", NOW(), ?)
             ON DUPLICATE KEY UPDATE last_attempt_at = NOW(), last_error = VALUES(last_error)'
        );
        $failure->execute([mb_substr($error->getMessage(), 0, 1000)]);
        return null;
    } finally {
        $release = $db->prepare('SELECT RELEASE_LOCK(?)');
        $release->execute([$lockName]);
    }
}
