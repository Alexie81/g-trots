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

function boomagFeedRows(array $config): array {
    $stream = fopen('php://temp', 'w+b');
    if ($stream === false) throw new RuntimeException('Feedul Boomag nu a putut fi procesat.');
    fwrite($stream, boomagFeedContents($config));
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

function boomagStockAvailable($value): bool {
    return in_array(mb_strtolower(trim((string)$value)), ['1', 'true', 'yes', 'da', 'in_stock', 'instock', 'in stoc'], true);
}

function gomagSyncSupplierStock(PDO $db, array $config): array {
    $rows = boomagFeedRows($config);
    $source = $db->query("SELECT id FROM shop_product_sources WHERE domain = 'boomag.ro' LIMIT 1")->fetchColumn();
    if (!$source) throw new RuntimeException('Sursa boomag.ro nu exista in catalog.');

    $products = $db->prepare(
        'SELECT p.id, p.sku, p.supplier_product_code
         FROM shop_products p
         WHERE p.source_id = ? OR LOWER(p.source_domain) = "boomag.ro"'
    );
    $products->execute([(string)$source]);
    $byCode = [];
    foreach ($products->fetchAll() as $product) {
        foreach ([$product['sku'] ?? '', $product['supplier_product_code'] ?? ''] as $code) {
            $key = mb_strtolower(trim((string)$code));
            if ($key !== '') $byCode[$key] = (string)$product['id'];
        }
    }

    $matched = [];
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
             SET supplier_stock_quantity = ?, supplier_stock_status = ?,
                 supplier_stock_updated_at = NOW(), stock_mode = "tracked", stock_quantity = ?,
                 updated_at = updated_at
             WHERE id = ?'
        );
        foreach ($rows as $row) {
            $key = mb_strtolower(trim((string)($row['sku'] ?? '')));
            if ($key === '' || !isset($byCode[$key])) continue;
            $productId = $byCode[$key];
            $available = boomagStockAvailable($row['stock_status'] ?? '0');
            $quantity = max(0, (int)floor((float)str_replace(',', '.', trim((string)($row['stock'] ?? '0')))));
            if (!$available) $quantity = 0;
            $update->execute([$quantity, $available ? 1 : 0, $quantity, $productId]);
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

    return [
        'success' => true,
        'source' => 'boomag.ro',
        'feed_products' => count($rows),
        'matched_products' => count($matched),
        'synced_at' => date(DATE_ATOM),
    ];
}

function gomagMaybeSyncSupplierStock(PDO $db, array $config, int $maxAgeHours = 20): ?array {
    $state = $db->query("SELECT last_synced_at FROM shop_supplier_sync_state WHERE source_domain = 'boomag.ro' LIMIT 1")->fetch();
    $lastSyncedAt = trim((string)($state['last_synced_at'] ?? ''));
    if ($lastSyncedAt !== '' && strtotime($lastSyncedAt) >= time() - ($maxAgeHours * 3600)) return null;

    $lockName = 'g-trots-boomag-stock-sync';
    $lock = $db->prepare('SELECT GET_LOCK(?, 0)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) return null;
    try {
        $state = $db->query("SELECT last_synced_at FROM shop_supplier_sync_state WHERE source_domain = 'boomag.ro' LIMIT 1")->fetch();
        $lastSyncedAt = trim((string)($state['last_synced_at'] ?? ''));
        if ($lastSyncedAt !== '' && strtotime($lastSyncedAt) >= time() - ($maxAgeHours * 3600)) return null;
        return gomagSyncSupplierStock($db, $config);
    } catch (Throwable $error) {
        error_log('[G-Trots Boomag stock] ' . $error->getMessage());
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
