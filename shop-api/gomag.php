<?php
declare(strict_types=1);

/**
 * Integrarea Boomag/Gomag pentru taxonomia SHOP.
 *
 * Important: acest modul nu scrie niciodata in shop_products. Produsele sunt
 * citite temporar doar pentru a identifica producatorii, compatibilitatile si
 * o fotografie reprezentativa pentru fiecare subcategorie.
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
