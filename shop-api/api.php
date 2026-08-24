<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Auth-Token');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function shopConfig(): array {
    $defaults = [
        'api_key' => '',
        'db_host' => 'localhost',
        'db_name' => 'cabitro_g-trots-shop',
        'db_user' => '',
        'db_pass' => '',
        'auth_api_url' => 'https://g-trots.ro/trotty-api/api.php',
        'public_base_url' => 'https://g-trots.ro/shop-api',
    ];

    $localFile = __DIR__ . '/config.local.php';
    if (is_file($localFile)) {
        $local = include $localFile;
        return array_merge($defaults, is_array($local) ? $local : []);
    }

    $sharedFile = dirname(__DIR__) . '/trotty-api/api_config.local.php';
    if (is_file($sharedFile)) {
        $shared = include $sharedFile;
        if (is_array($shared)) {
            return array_merge($defaults, [
                'api_key' => (string)($shared['api_key'] ?? ''),
                'db_host' => (string)($shared['db_host'] ?? 'localhost'),
                'db_user' => (string)($shared['db_user'] ?? ''),
                'db_pass' => (string)($shared['db_pass'] ?? ''),
            ]);
        }
    }

    return $defaults;
}

function jsonResponse($payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestHeader(string $name): string {
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string)($_SERVER[$key] ?? ''));
}

function requestBody(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) jsonResponse(['error' => 'Corpul cererii nu este JSON valid.'], 400);
    return $decoded;
}

function safeDbName(string $name): string {
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $name)) {
        throw new RuntimeException('Numele bazei SHOP nu este valid.');
    }
    return '`' . str_replace('`', '``', $name) . '`';
}

function shopDb(array $config): PDO {
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    $host = (string)$config['db_host'];
    $name = (string)$config['db_name'];
    $user = (string)$config['db_user'];
    $pass = (string)$config['db_pass'];

    if ($user === '' || $name === '') throw new RuntimeException('Configuratia MySQL SHOP nu este completa.');

    try {
        $db = new PDO("mysql:host={$host};dbname={$name};charset=utf8mb4", $user, $pass, $options);
    } catch (PDOException $error) {
        if ((int)$error->getCode() !== 1049 && stripos($error->getMessage(), 'Unknown database') === false) {
            throw $error;
        }
        $server = new PDO("mysql:host={$host};charset=utf8mb4", $user, $pass, $options);
        $server->exec('CREATE DATABASE IF NOT EXISTS ' . safeDbName($name) . ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $db = new PDO("mysql:host={$host};dbname={$name};charset=utf8mb4", $user, $pass, $options);
    }

    ensureShopSchema($db);
    return $db;
}

function ensureShopSchema(PDO $db): void {
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_categories (
            id CHAR(36) NOT NULL PRIMARY KEY,
            parent_id CHAR(36) NULL,
            name VARCHAR(120) NOT NULL,
            slug VARCHAR(150) NOT NULL UNIQUE,
            description TEXT NULL,
            thumbnail_path VARCHAR(255) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_categories_name (name),
            INDEX idx_shop_categories_parent (parent_id),
            INDEX idx_shop_categories_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $parentColumn = $db->query("SHOW COLUMNS FROM shop_categories LIKE 'parent_id'")->fetch();
    if (!$parentColumn) {
        $db->exec('ALTER TABLE shop_categories ADD COLUMN parent_id CHAR(36) NULL AFTER id, ADD INDEX idx_shop_categories_parent (parent_id)');
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_brands (
            id CHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            slug VARCHAR(150) NOT NULL UNIQUE,
            website_url VARCHAR(255) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_brands_name (name),
            INDEX idx_shop_brands_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_manufacturers (
            id CHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            slug VARCHAR(150) NOT NULL UNIQUE,
            website_url VARCHAR(255) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_manufacturers_name (name),
            INDEX idx_shop_manufacturers_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function categoryParentId(PDO $db, $value, ?string $categoryId = null): ?string {
    $parentId = trim((string)$value);
    if ($parentId === '') return null;
    if ($categoryId !== null && $parentId === $categoryId) {
        throw new InvalidArgumentException('O categorie nu poate fi propriul parinte.');
    }

    $stmt = $db->prepare('SELECT parent_id FROM shop_categories WHERE id = ?');
    $stmt->execute([$parentId]);
    $nextParent = $stmt->fetchColumn();
    if ($nextParent === false) throw new InvalidArgumentException('Categoria parinte selectata nu exista.');

    if ($categoryId !== null) {
        $seen = [];
        $cursor = $parentId;
        while ($cursor !== null && $cursor !== '') {
            if ($cursor === $categoryId || isset($seen[$cursor])) {
                throw new InvalidArgumentException('Selectia ar crea o bucla intre categorii si subcategorii.');
            }
            $seen[$cursor] = true;
            $stmt->execute([$cursor]);
            $cursorValue = $stmt->fetchColumn();
            $cursor = $cursorValue === false || $cursorValue === null ? null : (string)$cursorValue;
        }
    }
    return $parentId;
}

function verifyApiKey(array $config): void {
    $expected = trim((string)$config['api_key']);
    $provided = requestHeader('X-API-Key');
    if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
        jsonResponse(['error' => 'API Key SHOP invalid.'], 401);
    }
}

function validateAuthToken(array $config, array $body): array {
    $token = requestHeader('X-Auth-Token');
    if ($token === '') $token = trim((string)($_GET['authToken'] ?? ($body['auth_token'] ?? '')));
    if ($token === '') jsonResponse(['error' => 'Sesiunea utilizatorului lipseste.'], 401);

    $url = (string)$config['auth_api_url'] . '?action=getCurrentUser&authToken=' . rawurlencode($token);
    $headers = ['X-API-Key: ' . (string)$config['api_key'], 'Accept: application/json'];
    $status = 0;
    $raw = false;

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 12,
        ]);
        $raw = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
    } else {
        $context = stream_context_create(['http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'timeout' => 12,
            'ignore_errors' => true,
        ]]);
        $raw = @file_get_contents($url, false, $context);
        if (!empty($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $match)) {
            $status = (int)$match[1];
        }
    }

    $user = is_string($raw) ? json_decode($raw, true) : null;
    if ($status < 200 || $status >= 300 || !is_array($user) || empty($user['id'])) {
        jsonResponse(['error' => 'Sesiunea a expirat. Autentifica-te din nou.'], 401);
    }
    return $user;
}

function uuidV4(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function slugBase(string $value): string {
    $value = trim($value);
    if (function_exists('iconv')) {
        $converted = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        if ($converted !== false) $value = $converted;
    }
    $value = strtolower($value);
    $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?? '';
    return trim($value, '-') ?: 'item';
}

function uniqueSlug(PDO $db, string $table, string $name, ?string $excludeId = null): string {
    $base = slugBase($name);
    $slug = $base;
    for ($index = 2; $index < 10000; $index++) {
        $sql = "SELECT id FROM {$table} WHERE slug = ?" . ($excludeId ? ' AND id <> ?' : '') . ' LIMIT 1';
        $stmt = $db->prepare($sql);
        $stmt->execute($excludeId ? [$slug, $excludeId] : [$slug]);
        if (!$stmt->fetchColumn()) return $slug;
        $slug = $base . '-' . $index;
    }
    return $base . '-' . substr(bin2hex(random_bytes(4)), 0, 8);
}

function categoryRow(array $row, array $config): array {
    $path = trim((string)($row['thumbnail_path'] ?? ''));
    $row['thumbnail_url'] = $path === '' ? null : rtrim((string)$config['public_base_url'], '/') . '/' . ltrim($path, '/');
    $row['is_active'] = (bool)$row['is_active'];
    $row['parent_id'] = empty($row['parent_id']) ? null : (string)$row['parent_id'];
    $row['parent_name'] = empty($row['parent_name']) ? null : (string)$row['parent_name'];
    unset($row['thumbnail_path']);
    return $row;
}

function brandRow(array $row): array {
    $row['is_active'] = (bool)$row['is_active'];
    return $row;
}

function saveCategoryImage(?string $encoded): ?string {
    if ($encoded === null || trim($encoded) === '') return null;
    if (strpos($encoded, ',') !== false) [, $encoded] = explode(',', $encoded, 2);
    $binary = base64_decode($encoded, true);
    if ($binary === false) throw new InvalidArgumentException('Imaginea categoriei nu este valida.');
    if (strlen($binary) > 5 * 1024 * 1024) throw new InvalidArgumentException('Imaginea categoriei poate avea maximum 5 MB.');

    $info = @getimagesizefromstring($binary);
    $mime = is_array($info) ? (string)($info['mime'] ?? '') : '';
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) throw new InvalidArgumentException('Foloseste o imagine JPG, PNG sau WEBP.');

    $relativeDir = 'uploads/categories';
    $absoluteDir = __DIR__ . '/' . $relativeDir;
    if (!is_dir($absoluteDir) && !mkdir($absoluteDir, 0755, true) && !is_dir($absoluteDir)) {
        throw new RuntimeException('Folderul pentru imaginile categoriilor nu poate fi creat.');
    }
    $relativePath = $relativeDir . '/' . bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (file_put_contents(__DIR__ . '/' . $relativePath, $binary, LOCK_EX) === false) {
        throw new RuntimeException('Imaginea categoriei nu a putut fi salvata.');
    }
    return $relativePath;
}

function removeCategoryImage(?string $path): void {
    $path = trim((string)$path);
    if ($path === '' || strpos($path, 'uploads/categories/') !== 0) return;
    $absolute = __DIR__ . '/' . $path;
    if (is_file($absolute)) @unlink($absolute);
}

try {
    $config = shopConfig();
    verifyApiKey($config);
    $body = requestBody();
    $action = trim((string)($_GET['action'] ?? 'health'));
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $db = shopDb($config);

    if ($action === 'health') {
        $categoryCount = (int)$db->query('SELECT COUNT(*) FROM shop_categories')->fetchColumn();
        $brandCount = (int)$db->query('SELECT COUNT(*) FROM shop_brands')->fetchColumn();
        $manufacturerCount = (int)$db->query('SELECT COUNT(*) FROM shop_manufacturers')->fetchColumn();
        jsonResponse([
            'success' => true,
            'service' => 'G-Trots SHOP API',
            'database' => (string)$config['db_name'],
            'categories' => $categoryCount,
            'brands' => $brandCount,
            'manufacturers' => $manufacturerCount,
        ]);
    }

    validateAuthToken($config, $body);

    if ($action === 'listCategories' && $method === 'GET') {
        $rows = $db->query('SELECT c.*, p.name AS parent_name FROM shop_categories c LEFT JOIN shop_categories p ON p.id = c.parent_id ORDER BY COALESCE(p.name, c.name) ASC, c.parent_id IS NOT NULL ASC, c.name ASC')->fetchAll();
        jsonResponse(array_map(fn(array $row) => categoryRow($row, $config), $rows));
    }

    if ($action === 'createCategory' && $method === 'POST') {
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') jsonResponse(['error' => 'Numele categoriei este obligatoriu.'], 422);
        $id = uuidV4();
        $parentId = categoryParentId($db, $body['parent_id'] ?? null);
        $imagePath = saveCategoryImage(isset($body['thumbnail_base64']) ? (string)$body['thumbnail_base64'] : null);
        try {
            $stmt = $db->prepare('INSERT INTO shop_categories (id, parent_id, name, slug, description, thumbnail_path, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$id, $parentId, $name, uniqueSlug($db, 'shop_categories', $name), trim((string)($body['description'] ?? '')), $imagePath, !empty($body['is_active']) ? 1 : 0]);
        } catch (Throwable $error) {
            removeCategoryImage($imagePath);
            throw $error;
        }
        $stmt = $db->prepare('SELECT c.*, p.name AS parent_name FROM shop_categories c LEFT JOIN shop_categories p ON p.id = c.parent_id WHERE c.id = ?');
        $stmt->execute([$id]);
        jsonResponse(categoryRow($stmt->fetch(), $config), 201);
    }

    if ($action === 'updateCategory' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $stmt = $db->prepare('SELECT * FROM shop_categories WHERE id = ?');
        $stmt->execute([$id]);
        $current = $stmt->fetch();
        if (!$current) jsonResponse(['error' => 'Categoria nu exista.'], 404);
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') jsonResponse(['error' => 'Numele categoriei este obligatoriu.'], 422);
        $parentId = categoryParentId($db, $body['parent_id'] ?? null, $id);

        $newImagePath = null;
        $nextImagePath = (string)($current['thumbnail_path'] ?? '');
        if (!empty($body['thumbnail_remove'])) $nextImagePath = '';
        if (!empty($body['thumbnail_base64'])) {
            $newImagePath = saveCategoryImage((string)$body['thumbnail_base64']);
            $nextImagePath = $newImagePath;
        }
        try {
            $update = $db->prepare('UPDATE shop_categories SET parent_id = ?, name = ?, slug = ?, description = ?, thumbnail_path = ?, is_active = ? WHERE id = ?');
            $update->execute([$parentId, $name, uniqueSlug($db, 'shop_categories', $name, $id), trim((string)($body['description'] ?? '')), $nextImagePath ?: null, !empty($body['is_active']) ? 1 : 0, $id]);
        } catch (Throwable $error) {
            removeCategoryImage($newImagePath);
            throw $error;
        }
        if ($nextImagePath !== (string)($current['thumbnail_path'] ?? '')) removeCategoryImage((string)($current['thumbnail_path'] ?? ''));
        $stmt->execute([$id]);
        jsonResponse(categoryRow($stmt->fetch(), $config));
    }

    if ($action === 'deleteCategory' && $method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $stmt = $db->prepare('SELECT thumbnail_path FROM shop_categories WHERE id = ?');
        $stmt->execute([$id]);
        $imagePath = $stmt->fetchColumn();
        if ($imagePath === false) jsonResponse(['error' => 'Categoria nu exista.'], 404);
        $db->beginTransaction();
        try {
            $detach = $db->prepare('UPDATE shop_categories SET parent_id = NULL WHERE parent_id = ?');
            $detach->execute([$id]);
            $delete = $db->prepare('DELETE FROM shop_categories WHERE id = ?');
            $delete->execute([$id]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        removeCategoryImage((string)$imagePath);
        jsonResponse(['success' => true]);
    }

    if ($action === 'listBrands' && $method === 'GET') {
        $rows = $db->query('SELECT * FROM shop_brands ORDER BY name ASC')->fetchAll();
        jsonResponse(array_map('brandRow', $rows));
    }

    if ($action === 'createBrand' && $method === 'POST') {
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') jsonResponse(['error' => 'Numele brandului este obligatoriu.'], 422);
        $id = uuidV4();
        $stmt = $db->prepare('INSERT INTO shop_brands (id, name, slug, website_url, is_active) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$id, $name, uniqueSlug($db, 'shop_brands', $name), trim((string)($body['website_url'] ?? '')), !empty($body['is_active']) ? 1 : 0]);
        $stmt = $db->prepare('SELECT * FROM shop_brands WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(brandRow($stmt->fetch()), 201);
    }

    if ($action === 'updateBrand' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') jsonResponse(['error' => 'Numele brandului este obligatoriu.'], 422);
        $exists = $db->prepare('SELECT id FROM shop_brands WHERE id = ?');
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) jsonResponse(['error' => 'Brandul nu exista.'], 404);
        $stmt = $db->prepare('UPDATE shop_brands SET name = ?, slug = ?, website_url = ?, is_active = ? WHERE id = ?');
        $stmt->execute([$name, uniqueSlug($db, 'shop_brands', $name, $id), trim((string)($body['website_url'] ?? '')), !empty($body['is_active']) ? 1 : 0, $id]);
        $stmt = $db->prepare('SELECT * FROM shop_brands WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(brandRow($stmt->fetch()));
    }

    if ($action === 'deleteBrand' && $method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $stmt = $db->prepare('DELETE FROM shop_brands WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Brandul nu exista.'], 404);
        jsonResponse(['success' => true]);
    }

    if ($action === 'listManufacturers' && $method === 'GET') {
        $rows = $db->query('SELECT * FROM shop_manufacturers ORDER BY name ASC')->fetchAll();
        jsonResponse(array_map('brandRow', $rows));
    }

    if ($action === 'createManufacturer' && $method === 'POST') {
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') jsonResponse(['error' => 'Numele producatorului este obligatoriu.'], 422);
        $id = uuidV4();
        $stmt = $db->prepare('INSERT INTO shop_manufacturers (id, name, slug, website_url, is_active) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$id, $name, uniqueSlug($db, 'shop_manufacturers', $name), trim((string)($body['website_url'] ?? '')), !empty($body['is_active']) ? 1 : 0]);
        $stmt = $db->prepare('SELECT * FROM shop_manufacturers WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(brandRow($stmt->fetch()), 201);
    }

    if ($action === 'updateManufacturer' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') jsonResponse(['error' => 'Numele producatorului este obligatoriu.'], 422);
        $exists = $db->prepare('SELECT id FROM shop_manufacturers WHERE id = ?');
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) jsonResponse(['error' => 'Producatorul nu exista.'], 404);
        $stmt = $db->prepare('UPDATE shop_manufacturers SET name = ?, slug = ?, website_url = ?, is_active = ? WHERE id = ?');
        $stmt->execute([$name, uniqueSlug($db, 'shop_manufacturers', $name, $id), trim((string)($body['website_url'] ?? '')), !empty($body['is_active']) ? 1 : 0, $id]);
        $stmt = $db->prepare('SELECT * FROM shop_manufacturers WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(brandRow($stmt->fetch()));
    }

    if ($action === 'deleteManufacturer' && $method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $stmt = $db->prepare('DELETE FROM shop_manufacturers WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Producatorul nu exista.'], 404);
        jsonResponse(['success' => true]);
    }

    jsonResponse(['error' => 'Actiune SHOP necunoscuta.'], 404);
} catch (InvalidArgumentException $error) {
    jsonResponse(['error' => $error->getMessage()], 422);
} catch (Throwable $error) {
    error_log('[G-Trots SHOP API] ' . $error->getMessage());
    jsonResponse(['error' => 'SHOP API nu a putut procesa cererea. Verifica configuratia bazei de date.'], 500);
}
