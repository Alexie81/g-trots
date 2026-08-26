<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Auth-Token');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require_once __DIR__ . '/stripe.php';

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
        'website_base_url' => 'https://g-trots.ro',
        'stripe_secret_key' => '',
        'stripe_publishable_key' => '',
        'stripe_webhook_secret' => '',
    ];

    $config = $defaults;

    $sharedFile = dirname(__DIR__) . '/trotty-api/api_config.local.php';
    if (is_file($sharedFile)) {
        $shared = include $sharedFile;
        if (is_array($shared)) {
            $config = array_merge($config, [
                'api_key' => (string)($shared['api_key'] ?? ''),
                'db_host' => (string)($shared['db_host'] ?? 'localhost'),
                'db_user' => (string)($shared['db_user'] ?? ''),
                'db_pass' => (string)($shared['db_pass'] ?? ''),
            ]);
        }
    }

    $localFile = __DIR__ . '/config.local.php';
    if (is_file($localFile)) {
        $local = include $localFile;
        if (is_array($local)) $config = array_merge($config, $local);
    }

    return $config;
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

function rawRequestBody(): string {
    static $raw = null;
    if ($raw === null) {
        $value = file_get_contents('php://input');
        $raw = $value === false ? '' : (string)$value;
    }
    return $raw;
}

function requestBody(): array {
    $raw = rawRequestBody();
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

    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_product_sources (
            id CHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            domain VARCHAR(120) NOT NULL UNIQUE,
            base_url VARCHAR(500) NULL,
            is_default TINYINT(1) NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_sources_active (is_active, sort_order),
            INDEX idx_shop_sources_default (is_default)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_products (
            id CHAR(36) NOT NULL PRIMARY KEY,
            category_id CHAR(36) NULL,
            manufacturer_id CHAR(36) NULL,
            source_id CHAR(36) NULL,
            sku VARCHAR(80) NULL UNIQUE,
            source_domain VARCHAR(80) NOT NULL DEFAULT 'g-trots.ro',
            source_url VARCHAR(500) NULL,
            name VARCHAR(180) NOT NULL,
            slug VARCHAR(200) NOT NULL UNIQUE,
            short_description TEXT NULL,
            description_title VARCHAR(220) NULL,
            description_html MEDIUMTEXT NULL,
            specifications_json MEDIUMTEXT NULL,
            questions_json MEDIUMTEXT NULL,
            meta_title VARCHAR(180) NULL,
            meta_description VARCHAR(320) NULL,
            cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
            price DECIMAL(12,2) NOT NULL DEFAULT 0,
            sale_price DECIMAL(12,2) NULL,
            discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
            discount_value DECIMAL(12,2) NULL,
            currency CHAR(3) NOT NULL DEFAULT 'RON',
            stock_mode VARCHAR(20) NOT NULL DEFAULT 'tracked',
            stock_quantity INT NOT NULL DEFAULT 0,
            accounting_stock_quantity INT NOT NULL DEFAULT 0,
            low_stock_threshold INT NOT NULL DEFAULT 3,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            is_featured TINYINT(1) NOT NULL DEFAULT 0,
            view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
            stripe_product_id VARCHAR(80) NULL,
            stripe_price_id VARCHAR(80) NULL,
            stripe_synced_at DATETIME NULL,
            stripe_sync_error VARCHAR(500) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_products_name (name),
            INDEX idx_shop_products_category (category_id),
            INDEX idx_shop_products_manufacturer (manufacturer_id),
            INDEX idx_shop_products_source (source_id),
            INDEX idx_shop_products_active (is_active),
            INDEX idx_shop_products_stock (stock_mode, stock_quantity),
            UNIQUE INDEX idx_shop_products_stripe_product (stripe_product_id),
            INDEX idx_shop_products_stripe_price (stripe_price_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $discountTypeColumn = $db->query("SHOW COLUMNS FROM shop_products LIKE 'discount_type'")->fetch();
    if (!$discountTypeColumn) {
        $db->exec("ALTER TABLE shop_products ADD COLUMN discount_type VARCHAR(20) NOT NULL DEFAULT 'percent' AFTER sale_price");
    }
    $discountValueColumn = $db->query("SHOW COLUMNS FROM shop_products LIKE 'discount_value'")->fetch();
    if (!$discountValueColumn) {
        $db->exec('ALTER TABLE shop_products ADD COLUMN discount_value DECIMAL(12,2) NULL AFTER discount_type');
    }
    $descriptionTitleColumn = $db->query("SHOW COLUMNS FROM shop_products LIKE 'description_title'")->fetch();
    if (!$descriptionTitleColumn) {
        $db->exec('ALTER TABLE shop_products ADD COLUMN description_title VARCHAR(220) NULL AFTER short_description');
        $db->exec("UPDATE shop_products SET description_title = CONCAT('Detalii complete pentru ', name, '.') WHERE description_title IS NULL OR description_title = ''");
    }
    $specificationsColumn = $db->query("SHOW COLUMNS FROM shop_products LIKE 'specifications_json'")->fetch();
    if (!$specificationsColumn) {
        $db->exec('ALTER TABLE shop_products ADD COLUMN specifications_json MEDIUMTEXT NULL AFTER description_html');
    }
    $questionsColumn = $db->query("SHOW COLUMNS FROM shop_products LIKE 'questions_json'")->fetch();
    if (!$questionsColumn) {
        $db->exec('ALTER TABLE shop_products ADD COLUMN questions_json MEDIUMTEXT NULL AFTER specifications_json');
    }
    $costPriceColumn = $db->query("SHOW COLUMNS FROM shop_products LIKE 'cost_price'")->fetch();
    if (!$costPriceColumn) {
        $db->exec('ALTER TABLE shop_products ADD COLUMN cost_price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER meta_description');
    }
    $viewCountColumn = $db->query("SHOW COLUMNS FROM shop_products LIKE 'view_count'")->fetch();
    if (!$viewCountColumn) {
        $db->exec('ALTER TABLE shop_products ADD COLUMN view_count BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER is_featured');
    }
    $accountingStockColumn = $db->query("SHOW COLUMNS FROM shop_products LIKE 'accounting_stock_quantity'")->fetch();
    if (!$accountingStockColumn) {
        $db->exec('ALTER TABLE shop_products ADD COLUMN accounting_stock_quantity INT NOT NULL DEFAULT 0 AFTER stock_quantity');
        $db->exec('UPDATE shop_products SET accounting_stock_quantity = stock_quantity WHERE stock_mode = "tracked"');
    }
    $stripeProductColumns = [
        'stripe_product_id' => 'VARCHAR(80) NULL AFTER view_count',
        'stripe_price_id' => 'VARCHAR(80) NULL AFTER stripe_product_id',
        'stripe_synced_at' => 'DATETIME NULL AFTER stripe_price_id',
        'stripe_sync_error' => 'VARCHAR(500) NULL AFTER stripe_synced_at',
    ];
    foreach ($stripeProductColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_products LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_products ADD COLUMN {$column} {$definition}");
        }
    }
    if (!$db->query("SHOW INDEX FROM shop_products WHERE Key_name = 'idx_shop_products_stripe_product'")->fetch()) {
        $db->exec('ALTER TABLE shop_products ADD UNIQUE INDEX idx_shop_products_stripe_product (stripe_product_id)');
    }
    if (!$db->query("SHOW INDEX FROM shop_products WHERE Key_name = 'idx_shop_products_stripe_price'")->fetch()) {
        $db->exec('ALTER TABLE shop_products ADD INDEX idx_shop_products_stripe_price (stripe_price_id)');
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_product_brands (
            product_id CHAR(36) NOT NULL,
            brand_id CHAR(36) NOT NULL,
            PRIMARY KEY (product_id, brand_id),
            INDEX idx_shop_product_brands_brand (brand_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_product_images (
            id CHAR(36) NOT NULL PRIMARY KEY,
            product_id CHAR(36) NOT NULL,
            image_path VARCHAR(255) NOT NULL,
            alt_text VARCHAR(180) NULL,
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_product_images_product (product_id, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_product_reviews (
            id CHAR(36) NOT NULL PRIMARY KEY,
            product_id CHAR(36) NOT NULL,
            customer_name VARCHAR(120) NOT NULL,
            rating TINYINT UNSIGNED NOT NULL,
            message TEXT NOT NULL,
            admin_reply TEXT NULL,
            replied_by VARCHAR(180) NULL,
            replied_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_reviews_product (product_id, created_at),
            INDEX idx_shop_reviews_rating (rating)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_shipping_methods (
            id CHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            description VARCHAR(500) NULL,
            cost DECIMAL(12,2) NOT NULL DEFAULT 0,
            free_above DECIMAL(12,2) NULL,
            eta_label VARCHAR(120) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_shipping_active (is_active, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_payment_settings (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            card_enabled TINYINT(1) NOT NULL DEFAULT 0,
            cash_on_delivery_enabled TINYINT(1) NOT NULL DEFAULT 1,
            card_label VARCHAR(120) NOT NULL DEFAULT 'Card online',
            cash_on_delivery_label VARCHAR(120) NOT NULL DEFAULT 'Ramburs la curier',
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_orders (
            id CHAR(36) NOT NULL PRIMARY KEY,
            order_number VARCHAR(40) NOT NULL UNIQUE,
            status VARCHAR(30) NOT NULL DEFAULT 'new',
            payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
            payment_method VARCHAR(40) NOT NULL,
            customer_name VARCHAR(180) NOT NULL,
            customer_email VARCHAR(180) NULL,
            customer_phone VARCHAR(50) NOT NULL,
            address VARCHAR(255) NOT NULL,
            city VARCHAR(120) NOT NULL,
            county VARCHAR(120) NULL,
            postal_code VARCHAR(30) NULL,
            customer_notes TEXT NULL,
            admin_notes TEXT NULL,
            shipping_method_id CHAR(36) NULL,
            shipping_method_name VARCHAR(120) NOT NULL,
            subtotal DECIMAL(12,2) NOT NULL,
            shipping_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
            total DECIMAL(12,2) NOT NULL,
            currency CHAR(3) NOT NULL DEFAULT 'RON',
            stripe_checkout_session_id VARCHAR(255) NULL,
            stripe_payment_intent_id VARCHAR(255) NULL,
            stripe_payment_token VARCHAR(96) NULL,
            stripe_paid_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_orders_number (order_number),
            INDEX idx_shop_orders_status (status, created_at),
            INDEX idx_shop_orders_customer (customer_phone, customer_email),
            UNIQUE INDEX idx_shop_orders_stripe_session (stripe_checkout_session_id),
            INDEX idx_shop_orders_stripe_payment (stripe_payment_intent_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $stripeOrderColumns = [
        'stripe_checkout_session_id' => 'VARCHAR(255) NULL AFTER currency',
        'stripe_payment_intent_id' => 'VARCHAR(255) NULL AFTER stripe_checkout_session_id',
        'stripe_payment_token' => 'VARCHAR(96) NULL AFTER stripe_payment_intent_id',
        'stripe_paid_at' => 'DATETIME NULL AFTER stripe_payment_token',
    ];
    foreach ($stripeOrderColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_orders LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_orders ADD COLUMN {$column} {$definition}");
        }
    }
    if (!$db->query("SHOW INDEX FROM shop_orders WHERE Key_name = 'idx_shop_orders_stripe_session'")->fetch()) {
        $db->exec('ALTER TABLE shop_orders ADD UNIQUE INDEX idx_shop_orders_stripe_session (stripe_checkout_session_id)');
    }
    if (!$db->query("SHOW INDEX FROM shop_orders WHERE Key_name = 'idx_shop_orders_stripe_payment'")->fetch()) {
        $db->exec('ALTER TABLE shop_orders ADD INDEX idx_shop_orders_stripe_payment (stripe_payment_intent_id)');
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_stripe_events (
            id VARCHAR(255) NOT NULL PRIMARY KEY,
            event_type VARCHAR(120) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'processing',
            attempts INT UNSIGNED NOT NULL DEFAULT 1,
            last_error VARCHAR(500) NULL,
            processed_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_stripe_events_status (status, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_order_items (
            id CHAR(36) NOT NULL PRIMARY KEY,
            order_id CHAR(36) NOT NULL,
            product_id CHAR(36) NULL,
            product_name VARCHAR(180) NOT NULL,
            product_sku VARCHAR(80) NULL,
            quantity INT NOT NULL,
            unit_price DECIMAL(12,2) NOT NULL,
            line_total DECIMAL(12,2) NOT NULL,
            INDEX idx_shop_order_items_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_inventory_movements (
            id CHAR(36) NOT NULL PRIMARY KEY,
            product_id CHAR(36) NOT NULL,
            order_id CHAR(36) NULL,
            movement_type VARCHAR(30) NOT NULL,
            quantity_delta INT NOT NULL,
            quantity_after INT NOT NULL,
            note VARCHAR(500) NULL,
            created_by VARCHAR(180) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_inventory_product (product_id, created_at),
            INDEX idx_shop_inventory_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $db->exec("INSERT IGNORE INTO shop_payment_settings (id) VALUES (1)");
    $db->exec(
        "INSERT IGNORE INTO shop_brands (id, name, slug, website_url, is_active) VALUES
            ('00000000-0000-4000-8000-000000000020', 'Universal', 'universal', '', 1),
            ('00000000-0000-4000-8000-000000000021', 'KuKirin', 'kukirin', '', 1),
            ('00000000-0000-4000-8000-000000000022', 'Xiaomi', 'xiaomi', '', 1),
            ('00000000-0000-4000-8000-000000000023', 'Ninebot', 'ninebot', '', 1)"
    );
    $db->exec(
        "INSERT IGNORE INTO shop_product_sources (id, name, domain, base_url, is_default, is_active, sort_order) VALUES
            ('00000000-0000-4000-8000-000000000010', 'G-Trots', 'g-trots.ro', 'https://g-trots.ro', 1, 1, 0),
            ('00000000-0000-4000-8000-000000000011', 'Boomag', 'boomag.ro', 'https://boomag.ro', 0, 1, 1)"
    );
    $db->exec(
        "INSERT IGNORE INTO shop_products
            (id, source_id, sku, source_domain, name, slug, short_description, description_html, meta_title, meta_description, price, currency, stock_mode, stock_quantity, low_stock_threshold, is_active, is_featured)
         VALUES
            ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'GT-WEB-001', 'g-trots.ro', 'Anvelopa G10 All-Terrain', 'anvelopa-g10-all-terrain', 'Profil aderent pentru asfalt si drum mixt.', '<p>Aderenta buna pe asfalt si drum mixt, cu profil anti-alunecare si constructie pregatita pentru utilizare zilnica.</p>', 'Anvelopa G10 All-Terrain | G-Trots', 'Anvelopa all-terrain de 10 inch pentru trotinete electrice.', 149, 'RON', 'unlimited', 0, 3, 1, 1),
            ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000010', 'GT-WEB-002', 'g-trots.ro', 'Display Smart Ride S3', 'display-smart-ride-s3', 'Ecran clar si comenzi intuitive in mers.', '<p>Ecran clar, lizibilitate ridicata si comenzi intuitive pentru informatiile importante din timpul deplasarii.</p>', 'Display Smart Ride S3 | G-Trots', 'Display digital pentru trotinete electrice.', 349, 'RON', 'unlimited', 0, 3, 1, 1),
            ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000010', 'GT-WEB-003', 'g-trots.ro', 'Incarcator FastCharge 54.6V', 'incarcator-fastcharge-54-6v', 'Incarcare sigura si protectie integrata.', '<p>Protectie la supratensiune si racire eficienta pentru o incarcare sigura si constanta.</p>', 'Incarcator FastCharge 54.6V | G-Trots', 'Incarcator 54.6V pentru trotinete electrice.', 189, 'RON', 'unlimited', 0, 3, 1, 1),
            ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000010', 'GT-WEB-004', 'g-trots.ro', 'Motor DualHub X2 2000W', 'motor-dualhub-x2-2000w', 'Cuplu ridicat si constructie robusta.', '<p>Cuplu ridicat, constructie robusta si raspuns prompt la acceleratie pentru configuratii compatibile.</p>', 'Motor DualHub X2 2000W | G-Trots', 'Motor electric DualHub X2 de 2000W.', 1899, 'RON', 'tracked', 3, 3, 1, 1),
            ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000010', 'GT-WEB-005', 'g-trots.ro', 'Baterie PowerCore 52V 23Ah', 'baterie-powercore-52v-23ah', 'Celule echilibrate si BMS protejat.', '<p>Celule echilibrate, BMS protejat si autonomie proiectata pentru trasee lungi si utilizare constanta.</p>', 'Baterie PowerCore 52V 23Ah | G-Trots', 'Baterie 52V 23Ah pentru trotinete electrice.', 2499, 'RON', 'unlimited', 0, 3, 1, 1),
            ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000010', 'GT-WEB-006', 'g-trots.ro', 'Kit frana HydroStop Pro', 'kit-frana-hydrostop-pro', 'Franare precisa si control predictibil.', '<p>Dozaj precis si putere constanta de oprire pentru control mai bun si franare predictibila.</p>', 'Kit frana HydroStop Pro | G-Trots', 'Kit de frana hidraulica pentru trotinete electrice.', 399, 'RON', 'unlimited', 0, 3, 1, 1)"
    );
    $db->exec(
        "INSERT IGNORE INTO shop_shipping_methods
            (id, name, description, cost, free_above, eta_label, is_active, sort_order)
         VALUES
            ('00000000-0000-4000-8000-000000000001', 'Curier standard', 'Livrare la adresa clientului.', 0, NULL, '1-3 zile lucratoare', 1, 0)"
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

    for ($attempt = 0; $attempt < 2; $attempt++) {
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
        if ($status >= 200 && $status < 300 && is_array($user) && !empty($user['id'])) return $user;
        if (in_array($status, [401, 403], true)) {
            jsonResponse(['error' => 'Sesiunea a expirat. Autentifica-te din nou.'], 401);
        }
        if ($attempt === 0) usleep(180000);
    }

    jsonResponse(['error' => 'Verificarea sesiunii este temporar indisponibila. Reincercam imediat.'], 503);
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

function uniqueProductSku(PDO $db, ?string $value, ?string $excludeId = null): ?string {
    $base = strtoupper(trim((string)$value));
    $base = preg_replace('/[^A-Z0-9_-]+/', '-', $base) ?? '';
    $base = trim($base, '-_');
    if ($base === '') return null;
    $base = mb_substr($base, 0, 72);
    for ($index = 1; $index < 10000; $index++) {
        $sku = $index === 1 ? $base : mb_substr($base, 0, 72) . '-' . $index;
        $sql = 'SELECT id FROM shop_products WHERE sku = ?' . ($excludeId ? ' AND id <> ?' : '') . ' LIMIT 1';
        $stmt = $db->prepare($sql);
        $stmt->execute($excludeId ? [$sku, $excludeId] : [$sku]);
        if (!$stmt->fetchColumn()) return $sku;
    }
    throw new RuntimeException('Nu s-a putut genera un SKU unic.');
}

function ensureUniqueProductName(PDO $db, string $name, ?string $excludeId = null): void {
    $sql = 'SELECT id FROM shop_products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))' . ($excludeId ? ' AND id <> ?' : '') . ' LIMIT 1';
    $stmt = $db->prepare($sql);
    $stmt->execute($excludeId ? [$name, $excludeId] : [$name]);
    if ($stmt->fetchColumn()) throw new InvalidArgumentException('Acest nume de produs exista deja.');
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

function boolValue($value, bool $default = false): bool {
    if ($value === null) return $default;
    if (is_bool($value)) return $value;
    if (is_numeric($value)) return (int)$value !== 0;
    return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on'], true);
}

function moneyValue($value, string $label, bool $nullable = false): ?float {
    if ($nullable && ($value === null || trim((string)$value) === '')) return null;
    if (!is_numeric($value)) throw new InvalidArgumentException($label . ' nu este valid.');
    $number = round((float)$value, 2);
    if ($number < 0) throw new InvalidArgumentException($label . ' nu poate fi negativ.');
    return $number;
}

function existingReference(PDO $db, string $table, $value, string $label): ?string {
    $id = trim((string)$value);
    if ($id === '') return null;
    $allowed = ['shop_categories', 'shop_manufacturers', 'shop_brands', 'shop_shipping_methods', 'shop_product_sources'];
    if (!in_array($table, $allowed, true)) throw new RuntimeException('Referinta SHOP invalida.');
    $stmt = $db->prepare("SELECT id FROM {$table} WHERE id = ?");
    $stmt->execute([$id]);
    if (!$stmt->fetchColumn()) throw new InvalidArgumentException($label . ' selectat nu exista.');
    return $id;
}

function cleanRichHtml($html): string {
    $html = trim((string)$html);
    if ($html === '') return '';
    $html = preg_replace('#<(script|iframe|object|embed|form|input|button|textarea|select|meta|link|style)[^>]*>.*?</\1>#is', '', $html) ?? '';
    $html = strip_tags($html, '<p><br><div><span><strong><b><em><i><u><s><ul><ol><li><h2><h3><h4><blockquote><a><table><thead><tbody><tr><th><td><hr><figure><figcaption><img>');
    $html = preg_replace('/\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html) ?? '';
    $html = preg_replace('/\s(href)\s*=\s*(["\'])\s*javascript:[^"\']*\2/i', '', $html) ?? '';

    if (!class_exists('DOMDocument')) return $html;
    $document = new DOMDocument('1.0', 'UTF-8');
    $previous = libxml_use_internal_errors(true);
    $document->loadHTML('<?xml encoding="utf-8" ?><div id="shop-rich-root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    $xpath = new DOMXPath($document);
    foreach ($xpath->query('//*[@id="shop-rich-root"]//*') ?: [] as $element) {
        if (!$element instanceof DOMElement) continue;
        $allowedAttributes = ['style', 'href', 'title', 'target', 'rel', 'src', 'alt', 'loading', 'width', 'height', 'data-rich-image'];
        for ($index = $element->attributes->length - 1; $index >= 0; $index--) {
            $attribute = $element->attributes->item($index);
            if (!$attribute) continue;
            $name = strtolower($attribute->name);
            if (!in_array($name, $allowedAttributes, true)) $element->removeAttribute($attribute->name);
        }
        if ($element->hasAttribute('href')) {
            $href = trim($element->getAttribute('href'));
            if (!preg_match('#^(https?://|mailto:|tel:|/|#)#i', $href)) $element->removeAttribute('href');
            $element->setAttribute('rel', 'noopener noreferrer');
        }
        if ($element->hasAttribute('src')) {
            if (strtolower($element->tagName) !== 'img') {
                $element->removeAttribute('src');
            } else {
                $src = trim($element->getAttribute('src'));
                if (!preg_match('#^(https?://|/)#i', $src)) $element->removeAttribute('src');
                else $element->setAttribute('loading', 'lazy');
            }
        }
        if ($element->hasAttribute('style')) {
            $safeDeclarations = [];
            $allowedProperties = [
                'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style',
                'text-decoration', 'text-align', 'line-height', 'letter-spacing', 'margin', 'margin-top',
                'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right',
                'padding-bottom', 'padding-left', 'border', 'border-radius', 'list-style-type',
                'width', 'max-width', 'height', 'display', 'object-fit'
            ];
            foreach (explode(';', $element->getAttribute('style')) as $declaration) {
                if (strpos($declaration, ':') === false) continue;
                [$property, $value] = array_map('trim', explode(':', $declaration, 2));
                $property = strtolower($property);
                if (!in_array($property, $allowedProperties, true)) continue;
                if (preg_match('/expression|javascript|url\s*\(/i', $value)) continue;
                $safeDeclarations[] = $property . ': ' . mb_substr($value, 0, 200);
            }
            if ($safeDeclarations) $element->setAttribute('style', implode('; ', $safeDeclarations));
            else $element->removeAttribute('style');
        }
    }
    $root = $document->getElementById('shop-rich-root');
    if (!$root) return $html;
    $result = '';
    foreach ($root->childNodes as $child) $result .= $document->saveHTML($child);
    return trim($result);
}

function saveShopImage(?string $encoded, string $folder = 'products'): ?string {
    if ($encoded === null || trim($encoded) === '') return null;
    if (strpos($encoded, ',') !== false) [, $encoded] = explode(',', $encoded, 2);
    $binary = base64_decode($encoded, true);
    if ($binary === false) throw new InvalidArgumentException('Imaginea produsului nu este valida.');
    if (strlen($binary) > 6 * 1024 * 1024) throw new InvalidArgumentException('Fiecare imagine poate avea maximum 6 MB.');
    $info = @getimagesizefromstring($binary);
    $mime = is_array($info) ? (string)($info['mime'] ?? '') : '';
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) throw new InvalidArgumentException('Foloseste imagini JPG, PNG sau WEBP.');
    $relativeDir = 'uploads/' . trim($folder, '/');
    $absoluteDir = __DIR__ . '/' . $relativeDir;
    if (!is_dir($absoluteDir) && !mkdir($absoluteDir, 0755, true) && !is_dir($absoluteDir)) {
        throw new RuntimeException('Folderul pentru imaginile produselor nu poate fi creat.');
    }
    $relativePath = $relativeDir . '/' . bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (file_put_contents(__DIR__ . '/' . $relativePath, $binary, LOCK_EX) === false) {
        throw new RuntimeException('Imaginea produsului nu a putut fi salvata.');
    }
    return $relativePath;
}

function removeShopImage(?string $path): bool {
    $path = trim((string)$path);
    if ($path === '' || !preg_match('#^uploads/(products|descriptions)/[a-f0-9]{32}\.(jpg|png|webp)$#i', $path)) return false;
    $absolute = __DIR__ . '/' . $path;
    return is_file($absolute) ? @unlink($absolute) : false;
}

function richDescriptionImagePaths(?string $html): array {
    $html = (string)$html;
    if ($html === '' || !preg_match_all('/<img\b[^>]*\bsrc\s*=\s*(["\'])(.*?)\1/is', $html, $matches)) return [];
    $paths = [];
    foreach ($matches[2] as $source) {
        $urlPath = rawurldecode((string)(parse_url((string)$source, PHP_URL_PATH) ?? ''));
        $marker = '/uploads/descriptions/';
        $position = strpos($urlPath, $marker);
        if ($position === false) continue;
        $path = ltrim(substr($urlPath, $position), '/');
        if (preg_match('#^uploads/descriptions/[a-f0-9]{32}\.(jpg|png|webp)$#i', $path)) $paths[] = $path;
    }
    return array_values(array_unique($paths));
}

function productRow(PDO $db, array $row, array $config, bool $withDescription = true, bool $includeInternal = true): array {
    $productId = (string)$row['id'];
    $images = $db->prepare('SELECT id, image_path, alt_text, sort_order FROM shop_product_images WHERE product_id = ? ORDER BY sort_order ASC, created_at ASC');
    $images->execute([$productId]);
    $row['images'] = array_map(function (array $image) use ($config): array {
        $path = (string)$image['image_path'];
        return [
            'id' => (string)$image['id'],
            'url' => rtrim((string)$config['public_base_url'], '/') . '/' . ltrim($path, '/'),
            'alt_text' => (string)($image['alt_text'] ?? ''),
            'sort_order' => (int)$image['sort_order'],
        ];
    }, $images->fetchAll());
    if (count($row['images']) === 0) {
        $legacyImages = [
            'anvelopa-g10-all-terrain' => 'anvelopa-g10-all-terrain.png',
            'display-smart-ride-s3' => 'display-smart-ride-s3.png',
            'incarcator-fastcharge-54-6v' => 'incarcator-fastcharge-54-6v.png',
            'motor-dualhub-x2-2000w' => 'motor-dualhub-x2-2000w.png',
            'baterie-powercore-52v-23ah' => 'baterie-powercore-52v-23ah.png',
            'kit-frana-hydrostop-pro' => 'kit-frana-hydrostop-pro.png',
        ];
        $slug = (string)($row['slug'] ?? '');
        if (isset($legacyImages[$slug])) {
            $siteBaseUrl = preg_replace('#/shop-api/?$#', '', rtrim((string)$config['public_base_url'], '/')) ?: 'https://g-trots.ro';
            $row['images'][] = [
                'id' => 'legacy-image-' . $slug,
                'url' => rtrim($siteBaseUrl, '/') . '/assets/products/' . $legacyImages[$slug],
                'alt_text' => (string)($row['name'] ?? 'Produs G-Trots'),
                'sort_order' => 0,
                'is_legacy' => true,
            ];
        }
    }
    $brands = $db->prepare('SELECT b.id, b.name, b.slug FROM shop_brands b INNER JOIN shop_product_brands pb ON pb.brand_id = b.id WHERE pb.product_id = ? ORDER BY b.name ASC');
    $brands->execute([$productId]);
    $row['brands'] = $brands->fetchAll();
    $row['brand_ids'] = array_map(fn(array $brand): string => (string)$brand['id'], $row['brands']);
    $decodedSpecifications = json_decode((string)($row['specifications_json'] ?? ''), true);
    $row['specifications'] = is_array($decodedSpecifications) ? array_values($decodedSpecifications) : [];
    $decodedQuestions = json_decode((string)($row['questions_json'] ?? ''), true);
    $row['questions'] = is_array($decodedQuestions) ? array_values($decodedQuestions) : [];
    unset($row['specifications_json']);
    unset($row['questions_json']);
    $row['price'] = (float)$row['price'];
    $row['cost_price'] = (float)($row['cost_price'] ?? 0);
    $row['sale_price'] = $row['sale_price'] === null ? null : (float)$row['sale_price'];
    $row['discount_type'] = in_array((string)($row['discount_type'] ?? ''), ['percent', 'fixed'], true)
        ? (string)$row['discount_type']
        : 'percent';
    $row['discount_value'] = $row['discount_value'] === null
        ? ($row['sale_price'] !== null && $row['price'] > 0 ? round((1 - ($row['sale_price'] / $row['price'])) * 100, 2) : null)
        : (float)$row['discount_value'];
    $row['discount_percent'] = $row['sale_price'] !== null && $row['price'] > 0
        ? round((1 - ($row['sale_price'] / $row['price'])) * 100, 2)
        : 0.0;
    $row['review_count'] = (int)($row['review_count'] ?? 0);
    $row['review_average'] = $row['review_average'] === null ? null : round((float)$row['review_average'], 2);
    $row['stock_quantity'] = (int)$row['stock_quantity'];
    $row['accounting_stock_quantity'] = (int)($row['accounting_stock_quantity'] ?? 0);
    $row['low_stock_threshold'] = (int)$row['low_stock_threshold'];
    $row['is_active'] = (bool)$row['is_active'];
    $row['is_featured'] = (bool)$row['is_featured'];
    $row['view_count'] = (int)($row['view_count'] ?? 0);
    $row['category_id'] = empty($row['category_id']) ? null : (string)$row['category_id'];
    $row['manufacturer_id'] = empty($row['manufacturer_id']) ? null : (string)$row['manufacturer_id'];
    $row['source_id'] = empty($row['source_id']) ? null : (string)$row['source_id'];
    $row['source_is_active'] = (bool)($row['source_is_active'] ?? true);
    $row['stripe_product_id'] = empty($row['stripe_product_id']) ? null : (string)$row['stripe_product_id'];
    $row['stripe_price_id'] = empty($row['stripe_price_id']) ? null : (string)$row['stripe_price_id'];
    $row['stripe_sync_error'] = empty($row['stripe_sync_error']) ? null : (string)$row['stripe_sync_error'];
    $row['stripe_sync_status'] = $row['stripe_sync_error'] !== null ? 'error' : ($row['stripe_product_id'] !== null ? 'synced' : 'pending');
    $row['stock_available'] = $row['stock_mode'] === 'unlimited' || $row['stock_quantity'] > 0;
    if (!$withDescription) unset($row['description_html']);
    if (!$includeInternal) {
        unset($row['source_id'], $row['source_domain'], $row['source_url'], $row['source_name'], $row['source_is_active']);
    }
    return $row;
}

function productSelectSql(): string {
    return 'SELECT p.*, c.name AS category_name, c.slug AS category_slug,
                   m.name AS manufacturer_name, m.slug AS manufacturer_slug,
                   s.name AS source_name, s.is_active AS source_is_active,
                   (SELECT COUNT(*) FROM shop_product_reviews r WHERE r.product_id = p.id) AS review_count,
                   (SELECT AVG(r.rating) FROM shop_product_reviews r WHERE r.product_id = p.id) AS review_average
            FROM shop_products p
            LEFT JOIN shop_categories c ON c.id = p.category_id
            LEFT JOIN shop_manufacturers m ON m.id = p.manufacturer_id
            LEFT JOIN shop_product_sources s ON s.id = p.source_id';
}

function reviewRow(array $row): array {
    return [
        'id' => (string)$row['id'],
        'product_id' => (string)$row['product_id'],
        'product_name' => (string)($row['product_name'] ?? ''),
        'product_slug' => (string)($row['product_slug'] ?? ''),
        'customer_name' => (string)$row['customer_name'],
        'rating' => (int)$row['rating'],
        'message' => (string)$row['message'],
        'admin_reply' => $row['admin_reply'] === null ? null : (string)$row['admin_reply'],
        'replied_by' => $row['replied_by'] === null ? null : (string)$row['replied_by'],
        'replied_at' => $row['replied_at'] === null ? null : (string)$row['replied_at'],
        'created_at' => (string)$row['created_at'],
    ];
}

function findProduct(PDO $db, string $idOrSlug, array $config, bool $publicOnly = false): array {
    $sql = productSelectSql() . ' WHERE (p.id = ? OR p.slug = ?)' . ($publicOnly ? ' AND p.is_active = 1 AND s.is_active = 1' : '') . ' LIMIT 1';
    $stmt = $db->prepare($sql);
    $stmt->execute([$idOrSlug, $idOrSlug]);
    $row = $stmt->fetch();
    if (!$row) throw new InvalidArgumentException('Produsul nu exista.');
    return productRow($db, $row, $config, true, !$publicOnly);
}

function productPayload(PDO $db, array $body, bool $allowInactiveSource = false): array {
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '') throw new InvalidArgumentException('Numele produsului este obligatoriu.');
    $price = moneyValue($body['price'] ?? null, 'Pretul');
    $costPrice = moneyValue($body['cost_price'] ?? 0, 'Pretul de achizitie');
    $salePrice = moneyValue($body['sale_price'] ?? null, 'Pretul promotional', true);
    $discountType = trim((string)($body['discount_type'] ?? 'percent'));
    if (!in_array($discountType, ['percent', 'fixed'], true)) {
        throw new InvalidArgumentException('Tipul reducerii nu este valid.');
    }
    $discountValueInput = $body['discount_value'] ?? ($discountType === 'percent' ? ($body['discount_percent'] ?? null) : null);
    $discountValue = moneyValue($discountValueInput, 'Valoarea reducerii', true);
    if ($discountValue !== null && $discountValue > 0) {
        if ($price <= 0) throw new InvalidArgumentException('Un produs cu pret zero nu poate avea reducere.');
        if ($discountType === 'percent') {
            if ($discountValue >= 100) throw new InvalidArgumentException('Reducerea procentuala trebuie sa fie mai mica de 100%.');
            $salePrice = round($price * (1 - $discountValue / 100), 2);
        } else {
            if ($discountValue >= $price) throw new InvalidArgumentException('Reducerea fixa trebuie sa fie mai mica decat pretul standard.');
            $salePrice = round($price - $discountValue, 2);
        }
    } elseif ($salePrice !== null && $price > 0) {
        // Compatibilitate cu versiunile mai vechi ale aplicatiei, care trimiteau doar sale_price.
        $discountType = 'percent';
        $discountValue = round((1 - ($salePrice / $price)) * 100, 2);
    } else {
        $salePrice = null;
        $discountValue = null;
    }
    if ($salePrice !== null && $salePrice >= $price) throw new InvalidArgumentException('Pretul promotional trebuie sa fie mai mic decat pretul standard.');
    $stockMode = trim((string)($body['stock_mode'] ?? 'tracked'));
    if (!in_array($stockMode, ['tracked', 'unlimited'], true)) throw new InvalidArgumentException('Tipul de stoc nu este valid.');
    $stockQuantity = max(0, (int)($body['stock_quantity'] ?? 0));
    $lowStockThreshold = max(0, (int)($body['low_stock_threshold'] ?? 3));
    $brandIds = array_values(array_unique(array_filter(array_map('strval', is_array($body['brand_ids'] ?? null) ? $body['brand_ids'] : []))));
    foreach ($brandIds as $brandId) existingReference($db, 'shop_brands', $brandId, 'Brandul');
    $images = is_array($body['images'] ?? null) ? array_values($body['images']) : [];
    if (count($images) > 12) throw new InvalidArgumentException('Un produs poate avea maximum 12 imagini.');
    $rawSpecifications = is_array($body['specifications'] ?? null) ? array_values($body['specifications']) : [];
    if (count($rawSpecifications) > 60) throw new InvalidArgumentException('Un produs poate avea maximum 60 de specificatii.');
    $specifications = [];
    foreach ($rawSpecifications as $specification) {
        if (!is_array($specification)) continue;
        $group = mb_substr(trim((string)($specification['group'] ?? 'Caracteristici generale')), 0, 120);
        $label = mb_substr(trim((string)($specification['label'] ?? '')), 0, 160);
        $value = mb_substr(trim((string)($specification['value'] ?? '')), 0, 1000);
        if ($label === '' && $value === '') continue;
        if ($label === '' || $value === '') throw new InvalidArgumentException('Fiecare specificatie trebuie sa aiba denumire si valoare.');
        $specifications[] = [
            'group' => $group === '' ? 'Caracteristici generale' : $group,
            'label' => $label,
            'value' => $value,
        ];
    }
    $rawQuestions = is_array($body['questions'] ?? null) ? array_values($body['questions']) : [];
    if (count($rawQuestions) > 30) throw new InvalidArgumentException('Un produs poate avea maximum 30 de intrebari si raspunsuri.');
    $questions = [];
    foreach ($rawQuestions as $questionRow) {
        if (!is_array($questionRow)) continue;
        $question = mb_substr(trim((string)($questionRow['question'] ?? '')), 0, 500);
        $answer = mb_substr(trim((string)($questionRow['answer'] ?? '')), 0, 3000);
        if ($question === '' && $answer === '') continue;
        if ($question === '' || $answer === '') throw new InvalidArgumentException('Fiecare intrebare trebuie sa aiba si raspuns.');
        $questions[] = ['question' => $question, 'answer' => $answer];
    }
    $sourceId = existingReference($db, 'shop_product_sources', $body['source_id'] ?? null, 'Sursa produsului');
    if ($sourceId === null) {
        $source = $db->query('SELECT * FROM shop_product_sources WHERE is_active = 1 ORDER BY is_default DESC, sort_order ASC LIMIT 1')->fetch();
    } else {
        $sourceStmt = $db->prepare('SELECT * FROM shop_product_sources WHERE id = ?' . ($allowInactiveSource ? '' : ' AND is_active = 1'));
        $sourceStmt->execute([$sourceId]);
        $source = $sourceStmt->fetch();
    }
    if (!$source) throw new InvalidArgumentException($allowInactiveSource ? 'Sursa produsului nu exista.' : 'Sursa produsului nu este activa.');
    $sourceId = (string)$source['id'];
    $sourceDomain = (string)$source['domain'];
    return [
        'name' => mb_substr($name, 0, 180),
        'slug_source' => mb_substr(trim((string)($body['slug'] ?? $name)), 0, 200),
        'sku' => ($sku = mb_substr(trim((string)($body['sku'] ?? '')), 0, 80)) === '' ? null : $sku,
        'source_id' => $sourceId,
        'source_domain' => $sourceDomain,
        'source_url' => ($sourceUrl = mb_substr(trim((string)($body['source_url'] ?? '')), 0, 500)) === '' ? null : $sourceUrl,
        'category_id' => existingReference($db, 'shop_categories', $body['category_id'] ?? null, 'Categoria'),
        'manufacturer_id' => existingReference($db, 'shop_manufacturers', $body['manufacturer_id'] ?? null, 'Producatorul'),
        'short_description' => mb_substr(trim((string)($body['short_description'] ?? '')), 0, 2000),
        'description_title' => mb_substr(trim((string)($body['description_title'] ?? '')), 0, 220),
        'description_html' => cleanRichHtml($body['description_html'] ?? ''),
        'specifications_json' => json_encode($specifications, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'questions_json' => json_encode($questions, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'meta_title' => mb_substr(trim((string)($body['meta_title'] ?? '')), 0, 180),
        'meta_description' => mb_substr(trim((string)($body['meta_description'] ?? '')), 0, 320),
        'cost_price' => $costPrice,
        'price' => $price,
        'sale_price' => $salePrice,
        'discount_type' => $discountType,
        'discount_value' => $discountValue,
        'currency' => strtoupper(mb_substr(trim((string)($body['currency'] ?? 'RON')), 0, 3)) ?: 'RON',
        'stock_mode' => $stockMode,
        'stock_quantity' => $stockMode === 'unlimited' ? 0 : $stockQuantity,
        'low_stock_threshold' => $lowStockThreshold,
        'is_active' => boolValue($body['is_active'] ?? true, true),
        'is_featured' => boolValue($body['is_featured'] ?? false),
        'brand_ids' => $brandIds,
        'images' => $images,
    ];
}

function syncProductBrands(PDO $db, string $productId, array $brandIds): void {
    $db->prepare('DELETE FROM shop_product_brands WHERE product_id = ?')->execute([$productId]);
    $insert = $db->prepare('INSERT INTO shop_product_brands (product_id, brand_id) VALUES (?, ?)');
    foreach ($brandIds as $brandId) $insert->execute([$productId, $brandId]);
}

function syncProductImages(PDO $db, string $productId, array $images, string $defaultAlt): void {
    if (count($images) > 12) throw new InvalidArgumentException('Un produs poate avea maximum 12 imagini.');
    $stmt = $db->prepare('SELECT id, image_path FROM shop_product_images WHERE product_id = ?');
    $stmt->execute([$productId]);
    $existing = [];
    foreach ($stmt->fetchAll() as $image) $existing[(string)$image['id']] = (string)$image['image_path'];
    $kept = [];
    $update = $db->prepare('UPDATE shop_product_images SET alt_text = ?, sort_order = ? WHERE id = ? AND product_id = ?');
    $insert = $db->prepare('INSERT INTO shop_product_images (id, product_id, image_path, alt_text, sort_order) VALUES (?, ?, ?, ?, ?)');
    foreach ($images as $index => $image) {
        if (!is_array($image)) continue;
        $imageId = trim((string)($image['id'] ?? ''));
        $alt = mb_substr(trim((string)($image['alt_text'] ?? $defaultAlt)), 0, 180);
        if ($imageId !== '' && isset($existing[$imageId]) && empty($image['base64'])) {
            $update->execute([$alt, $index, $imageId, $productId]);
            $kept[$imageId] = true;
            continue;
        }
        $path = saveShopImage(isset($image['base64']) ? (string)$image['base64'] : null);
        if (!$path) continue;
        $newId = uuidV4();
        $insert->execute([$newId, $productId, $path, $alt, $index]);
        $kept[$newId] = true;
    }
    $delete = $db->prepare('DELETE FROM shop_product_images WHERE id = ? AND product_id = ?');
    foreach ($existing as $imageId => $path) {
        if (isset($kept[$imageId])) continue;
        $delete->execute([$imageId, $productId]);
        removeShopImage($path);
    }
}

function paymentSettings(PDO $db, ?array $config = null): array {
    $row = $db->query('SELECT * FROM shop_payment_settings WHERE id = 1')->fetch();
    $stripeConfigured = $config !== null && stripeIsConfigured($config);
    $stripeSyncedProducts = $stripeConfigured ? (int)$db->query('SELECT COUNT(*) FROM shop_products WHERE stripe_product_id IS NOT NULL AND stripe_sync_error IS NULL')->fetchColumn() : 0;
    $stripeSyncErrors = $stripeConfigured ? (int)$db->query('SELECT COUNT(*) FROM shop_products WHERE stripe_sync_error IS NOT NULL')->fetchColumn() : 0;
    return [
        'card_enabled' => (bool)($row['card_enabled'] ?? false),
        'cash_on_delivery_enabled' => (bool)($row['cash_on_delivery_enabled'] ?? true),
        'card_label' => (string)($row['card_label'] ?? 'Card online'),
        'cash_on_delivery_label' => (string)($row['cash_on_delivery_label'] ?? 'Ramburs la curier'),
        'stripe_configured' => $stripeConfigured,
        'stripe_test_mode' => $stripeConfigured && stripeIsTestMode($config ?? []),
        'stripe_synced_products' => $stripeSyncedProducts,
        'stripe_sync_errors' => $stripeSyncErrors,
        'updated_at' => $row['updated_at'] ?? null,
    ];
}

function shippingRow(array $row): array {
    $row['cost'] = (float)$row['cost'];
    $row['free_above'] = $row['free_above'] === null ? null : (float)$row['free_above'];
    $row['sort_order'] = (int)$row['sort_order'];
    $row['is_active'] = (bool)$row['is_active'];
    return $row;
}

function sourceRow(array $row): array {
    $row['is_default'] = (bool)$row['is_default'];
    $row['is_active'] = (bool)$row['is_active'];
    $row['sort_order'] = (int)$row['sort_order'];
    $row['product_count'] = (int)($row['product_count'] ?? 0);
    return $row;
}

function sourcePayload(array $body): array {
    $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 120);
    $domain = strtolower(mb_substr(trim((string)($body['domain'] ?? '')), 0, 120));
    $domain = preg_replace('#^https?://#i', '', $domain) ?? $domain;
    $domain = trim(explode('/', $domain, 2)[0]);
    if ($name === '' || $domain === '' || !preg_match('/^[a-z0-9.-]+$/', $domain)) {
        throw new InvalidArgumentException('Completeaza numele si domeniul valid al sursei.');
    }
    $isActive = boolValue($body['is_active'] ?? true, true);
    $isDefault = $isActive && boolValue($body['is_default'] ?? false);
    return [
        'name' => $name,
        'domain' => $domain,
        'base_url' => mb_substr(trim((string)($body['base_url'] ?? ('https://' . $domain))), 0, 500),
        'is_default' => $isDefault,
        'is_active' => $isActive,
        'sort_order' => (int)($body['sort_order'] ?? 0),
    ];
}

function orderRow(PDO $db, array $row): array {
    $items = $db->prepare('SELECT * FROM shop_order_items WHERE order_id = ? ORDER BY id ASC');
    $items->execute([(string)$row['id']]);
    $row['items'] = array_map(function (array $item): array {
        $item['quantity'] = (int)$item['quantity'];
        $item['unit_price'] = (float)$item['unit_price'];
        $item['line_total'] = (float)$item['line_total'];
        return $item;
    }, $items->fetchAll());
    $row['subtotal'] = (float)$row['subtotal'];
    $row['shipping_cost'] = (float)$row['shipping_cost'];
    $row['total'] = (float)$row['total'];
    return $row;
}

function createPublicOrder(PDO $db, array $body, array $config): array {
    $name = mb_substr(trim((string)($body['customer_name'] ?? '')), 0, 180);
    $phone = mb_substr(trim((string)($body['customer_phone'] ?? '')), 0, 50);
    $address = mb_substr(trim((string)($body['address'] ?? '')), 0, 255);
    $city = mb_substr(trim((string)($body['city'] ?? '')), 0, 120);
    if ($name === '' || $phone === '' || $address === '' || $city === '') {
        throw new InvalidArgumentException('Completeaza numele, telefonul si adresa de livrare.');
    }
    $items = is_array($body['items'] ?? null) ? array_values($body['items']) : [];
    if (!$items || count($items) > 50) throw new InvalidArgumentException('Comanda trebuie sa contina intre 1 si 50 de produse.');
    $payments = paymentSettings($db, $config);
    $paymentMethod = trim((string)($body['payment_method'] ?? 'cash_on_delivery'));
    if ($paymentMethod === 'card' && (!$payments['card_enabled'] || !$payments['stripe_configured'])) throw new InvalidArgumentException('Plata cu cardul nu este activa.');
    if ($paymentMethod === 'cash_on_delivery' && !$payments['cash_on_delivery_enabled']) throw new InvalidArgumentException('Plata ramburs nu este activa.');
    if (!in_array($paymentMethod, ['card', 'cash_on_delivery'], true)) throw new InvalidArgumentException('Metoda de plata nu este valida.');
    $customerEmail = mb_substr(trim((string)($body['customer_email'] ?? '')), 0, 180);
    if (!filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
        throw new InvalidArgumentException('Completeaza o adresa de e-mail valida.');
    }
    $shippingId = existingReference($db, 'shop_shipping_methods', $body['shipping_method_id'] ?? null, 'Metoda de livrare');
    if (!$shippingId) throw new InvalidArgumentException('Alege metoda de livrare.');
    $shippingStmt = $db->prepare('SELECT * FROM shop_shipping_methods WHERE id = ? AND is_active = 1');
    $shippingStmt->execute([$shippingId]);
    $shipping = $shippingStmt->fetch();
    if (!$shipping) throw new InvalidArgumentException('Metoda de livrare nu este activa.');

    $db->beginTransaction();
    try {
        $productStmt = $db->prepare('SELECT p.* FROM shop_products p INNER JOIN shop_product_sources s ON s.id = p.source_id AND s.is_active = 1 WHERE p.id = ? AND p.is_active = 1 FOR UPDATE');
        $resolvedItems = [];
        $subtotal = 0.0;
        foreach ($items as $item) {
            if (!is_array($item)) continue;
            $productId = trim((string)($item['product_id'] ?? ''));
            $quantity = max(1, min(99, (int)($item['quantity'] ?? 1)));
            $productStmt->execute([$productId]);
            $product = $productStmt->fetch();
            if (!$product) throw new InvalidArgumentException('Un produs din cos nu mai este disponibil.');
            if ($product['stock_mode'] === 'tracked' && (int)$product['stock_quantity'] < $quantity) {
                throw new InvalidArgumentException('Stoc insuficient pentru ' . (string)$product['name'] . '.');
            }
            $unitPrice = $product['sale_price'] !== null ? (float)$product['sale_price'] : (float)$product['price'];
            $lineTotal = round($unitPrice * $quantity, 2);
            $subtotal += $lineTotal;
            $resolvedItems[] = ['product' => $product, 'quantity' => $quantity, 'unit_price' => $unitPrice, 'line_total' => $lineTotal];
        }
        if (!$resolvedItems) throw new InvalidArgumentException('Comanda nu contine produse valide.');
        $shippingCost = (float)$shipping['cost'];
        if ($shipping['free_above'] !== null && $subtotal >= (float)$shipping['free_above']) $shippingCost = 0.0;
        $total = round($subtotal + $shippingCost, 2);
        $orderId = uuidV4();
        $orderNumber = 'GT-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        $insertOrder = $db->prepare('INSERT INTO shop_orders (id, order_number, status, payment_status, payment_method, customer_name, customer_email, customer_phone, address, city, county, postal_code, customer_notes, shipping_method_id, shipping_method_name, subtotal, shipping_cost, total, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $insertOrder->execute([
            $orderId, $orderNumber, 'new', 'pending', $paymentMethod, $name,
            $customerEmail ?: null, $phone, $address, $city,
            mb_substr(trim((string)($body['county'] ?? '')), 0, 120) ?: null,
            mb_substr(trim((string)($body['postal_code'] ?? '')), 0, 30) ?: null,
            mb_substr(trim((string)($body['customer_notes'] ?? '')), 0, 3000) ?: null,
            $shippingId, (string)$shipping['name'], $subtotal, $shippingCost, $total, 'RON'
        ]);
        $insertItem = $db->prepare('INSERT INTO shop_order_items (id, order_id, product_id, product_name, product_sku, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $updateStock = $db->prepare('UPDATE shop_products SET stock_quantity = stock_quantity - ? WHERE id = ?');
        $insertMovement = $db->prepare('INSERT INTO shop_inventory_movements (id, product_id, order_id, movement_type, quantity_delta, quantity_after, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ($resolvedItems as $item) {
            $product = $item['product'];
            $insertItem->execute([uuidV4(), $orderId, $product['id'], $product['name'], $product['sku'], $item['quantity'], $item['unit_price'], $item['line_total']]);
            if ($product['stock_mode'] === 'tracked') {
                $nextQuantity = (int)$product['stock_quantity'] - $item['quantity'];
                $updateStock->execute([$item['quantity'], $product['id']]);
                $insertMovement->execute([uuidV4(), $product['id'], $orderId, 'sale', -$item['quantity'], $nextQuantity, 'Rezervare automata pentru ' . $orderNumber]);
            }
        }
        $db->commit();
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ?');
        $stmt->execute([$orderId]);
        return orderRow($db, $stmt->fetch());
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

try {
    $config = shopConfig();
    $body = requestBody();
    $action = trim((string)($_GET['action'] ?? 'health'));
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $db = shopDb($config);

    if ($action === 'stripeWebhook' && $method === 'POST') {
        jsonResponse(stripeProcessWebhook($db, $config, rawRequestBody(), requestHeader('Stripe-Signature')));
    }

    if ($action === 'publicCatalogFilters' && $method === 'GET') {
        $categories = $db->query(
            'SELECT c.*, p.name AS parent_name
             FROM shop_categories c
             LEFT JOIN shop_categories p ON p.id = c.parent_id
             WHERE c.is_active = 1
             ORDER BY COALESCE(p.name, c.name) ASC, c.parent_id IS NOT NULL ASC, c.name ASC'
        )->fetchAll();
        $brands = $db->query('SELECT * FROM shop_brands WHERE is_active = 1 ORDER BY name ASC')->fetchAll();
        $manufacturers = $db->query('SELECT * FROM shop_manufacturers WHERE is_active = 1 ORDER BY name ASC')->fetchAll();

        jsonResponse([
            'categories' => array_map(fn(array $row) => categoryRow($row, $config), $categories),
            'brands' => array_map('brandRow', $brands),
            'manufacturers' => array_map('brandRow', $manufacturers),
        ]);
    }

    if ($action === 'publicProducts' && $method === 'GET') {
        $where = ['p.is_active = 1', 's.is_active = 1'];
        $params = [];
        $search = trim((string)($_GET['q'] ?? ''));
        if ($search !== '') {
            $where[] = '(p.name LIKE ? OR p.sku LIKE ? OR p.short_description LIKE ?)';
            $term = '%' . mb_substr($search, 0, 120) . '%';
            array_push($params, $term, $term, $term);
        }
        foreach (['category_id' => 'p.category_id', 'manufacturer_id' => 'p.manufacturer_id'] as $queryKey => $column) {
            $value = trim((string)($_GET[$queryKey] ?? ''));
            if ($value !== '') {
                $where[] = $column . ' = ?';
                $params[] = $value;
            }
        }
        $brandId = trim((string)($_GET['brand_id'] ?? ''));
        if ($brandId !== '') {
            $where[] = 'EXISTS (SELECT 1 FROM shop_product_brands pb WHERE pb.product_id = p.id AND pb.brand_id = ?)';
            $params[] = $brandId;
        }
        $sql = productSelectSql() . ' WHERE ' . implode(' AND ', $where) . ' ORDER BY p.is_featured DESC, p.created_at DESC LIMIT 300';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        jsonResponse(array_map(fn(array $row): array => productRow($db, $row, $config, false, false), $stmt->fetchAll()));
    }

    if ($action === 'publicProduct' && $method === 'GET') {
        $idOrSlug = trim((string)($_GET['id'] ?? $_GET['slug'] ?? ''));
        if ($idOrSlug === '') jsonResponse(['error' => 'Produsul nu a fost specificat.'], 400);
        try {
            $product = findProduct($db, $idOrSlug, $config, true);
            $db->prepare('UPDATE shop_products SET view_count = view_count + 1 WHERE id = ?')->execute([$product['id']]);
            $product['view_count'] = (int)$product['view_count'] + 1;
            jsonResponse($product);
        } catch (InvalidArgumentException $error) {
            jsonResponse(['error' => $error->getMessage()], 404);
        }
    }

    if ($action === 'publicProductReviews' && $method === 'GET') {
        $idOrSlug = trim((string)($_GET['id'] ?? $_GET['slug'] ?? ''));
        if ($idOrSlug === '') jsonResponse(['error' => 'Produsul nu a fost specificat.'], 400);
        try {
            $product = findProduct($db, $idOrSlug, $config, true);
        } catch (InvalidArgumentException $error) {
            jsonResponse(['error' => $error->getMessage()], 404);
        }
        $stmt = $db->prepare('SELECT r.*, p.name AS product_name, p.slug AS product_slug FROM shop_product_reviews r INNER JOIN shop_products p ON p.id = r.product_id WHERE r.product_id = ? ORDER BY r.created_at DESC LIMIT 300');
        $stmt->execute([$product['id']]);
        jsonResponse(array_map('reviewRow', $stmt->fetchAll()));
    }

    if ($action === 'createPublicReview' && $method === 'POST') {
        $idOrSlug = trim((string)($body['product_id'] ?? $body['product_slug'] ?? ''));
        if ($idOrSlug === '') jsonResponse(['error' => 'Produsul nu a fost specificat.'], 400);
        try {
            $product = findProduct($db, $idOrSlug, $config, true);
        } catch (InvalidArgumentException $error) {
            jsonResponse(['error' => $error->getMessage()], 404);
        }
        $customerName = mb_substr(trim((string)($body['customer_name'] ?? '')), 0, 120);
        $rating = (int)($body['rating'] ?? 0);
        $message = mb_substr(trim((string)($body['message'] ?? '')), 0, 2000);
        if ($customerName === '') throw new InvalidArgumentException('Completeaza numele pentru recenzie.');
        if ($rating < 1 || $rating > 5) throw new InvalidArgumentException('Alege un rating intre 1 si 5 stele.');
        if (mb_strlen($message) < 10) throw new InvalidArgumentException('Recenzia trebuie sa aiba cel putin 10 caractere.');
        $id = uuidV4();
        $stmt = $db->prepare('INSERT INTO shop_product_reviews (id, product_id, customer_name, rating, message) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$id, $product['id'], $customerName, $rating, $message]);
        $stmt = $db->prepare('SELECT r.*, p.name AS product_name, p.slug AS product_slug FROM shop_product_reviews r INNER JOIN shop_products p ON p.id = r.product_id WHERE r.id = ?');
        $stmt->execute([$id]);
        jsonResponse(reviewRow($stmt->fetch()), 201);
    }

    if ($action === 'publicShopConfig' && $method === 'GET') {
        $shipping = $db->query('SELECT * FROM shop_shipping_methods WHERE is_active = 1 ORDER BY sort_order ASC, name ASC')->fetchAll();
        $publicPayments = paymentSettings($db, $config);
        $publicPayments['card_enabled'] = $publicPayments['card_enabled'] && $publicPayments['stripe_configured'];
        unset($publicPayments['stripe_synced_products'], $publicPayments['stripe_sync_errors']);
        jsonResponse([
            'payments' => $publicPayments,
            'shipping_methods' => array_map('shippingRow', $shipping),
        ]);
    }

    if ($action === 'createPublicOrder' && $method === 'POST') {
        $order = createPublicOrder($db, $body, $config);
        if (($order['payment_method'] ?? '') === 'card') {
            try {
                $stripeSession = stripeCreateCheckoutSession($db, $config, $order, $body);
                $order['stripe_checkout_session_id'] = $stripeSession['id'];
                $order['stripe_checkout_url'] = $stripeSession['url'];
            } catch (Throwable $error) {
                stripeRestoreOrderStock($db, (string)$order['id'], 'Sesiunea Stripe nu a putut fi creata.');
                error_log('[G-Trots Stripe checkout] ' . $error->getMessage());
                throw new InvalidArgumentException('Plata cu cardul nu a putut fi initializata. Incearca din nou.');
            }
        }
        jsonResponse($order, 201);
    }

    if ($action === 'stripeCheckoutStatus' && in_array($method, ['GET', 'POST'], true)) {
        $sessionId = trim((string)($_GET['session_id'] ?? ($body['session_id'] ?? '')));
        if (!preg_match('/^cs_(test|live)_[A-Za-z0-9]+$/', $sessionId)) throw new InvalidArgumentException('Sesiunea Stripe nu este valida.');
        $session = stripeRequest($config, 'GET', 'checkout/sessions/' . rawurlencode($sessionId));
        $order = stripeApplyCheckoutSession($db, $session);
        if (!$order) jsonResponse(['error' => 'Comanda Stripe nu a fost gasita.'], 404);
        jsonResponse([
            'session_status' => (string)($session['status'] ?? ''),
            'payment_status' => (string)($session['payment_status'] ?? 'unpaid'),
            'order' => stripePublicOrderReceipt($db, $config, $order),
        ]);
    }

    if ($action === 'cancelStripeCheckout' && $method === 'POST') {
        $orderNumber = trim((string)($body['order_number'] ?? ''));
        $token = trim((string)($body['token'] ?? ''));
        if ($orderNumber === '' || strlen($token) < 32) throw new InvalidArgumentException('Anularea Stripe nu este valida.');
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE order_number = ? AND stripe_payment_token = ? AND payment_method = "card" LIMIT 1');
        $stmt->execute([$orderNumber, $token]);
        $order = $stmt->fetch();
        if (!$order) jsonResponse(['error' => 'Comanda Stripe nu a fost gasita.'], 404);
        $sessionId = trim((string)($order['stripe_checkout_session_id'] ?? ''));
        if ($sessionId !== '') {
            $session = stripeRequest($config, 'GET', 'checkout/sessions/' . rawurlencode($sessionId));
            if (in_array((string)($session['payment_status'] ?? ''), ['paid', 'no_payment_required'], true)) {
                stripeApplyCheckoutSession($db, $session);
                throw new InvalidArgumentException('Plata este deja confirmata si nu mai poate fi anulata.');
            }
            if (($session['status'] ?? '') === 'open') {
                stripeRequest($config, 'POST', 'checkout/sessions/' . rawurlencode($sessionId) . '/expire', []);
            }
        }
        stripeRestoreOrderStock($db, (string)$order['id'], 'Clientul a revenit din Stripe fara finalizarea platii.');
        jsonResponse(['cancelled' => true]);
    }

    verifyApiKey($config);

    if ($action === 'health') {
        $categoryCount = (int)$db->query('SELECT COUNT(*) FROM shop_categories')->fetchColumn();
        $brandCount = (int)$db->query('SELECT COUNT(*) FROM shop_brands')->fetchColumn();
        $manufacturerCount = (int)$db->query('SELECT COUNT(*) FROM shop_manufacturers')->fetchColumn();
        $productCount = (int)$db->query('SELECT COUNT(*) FROM shop_products')->fetchColumn();
        $orderCount = (int)$db->query('SELECT COUNT(*) FROM shop_orders')->fetchColumn();
        jsonResponse([
            'success' => true,
            'service' => 'G-Trots SHOP API',
            'database' => (string)$config['db_name'],
            'categories' => $categoryCount,
            'brands' => $brandCount,
            'manufacturers' => $manufacturerCount,
            'products' => $productCount,
            'orders' => $orderCount,
        ]);
    }

    $currentUser = validateAuthToken($config, $body);

    if ($action === 'uploadRichDescriptionImage' && $method === 'POST') {
        $path = saveShopImage(isset($body['base64']) ? (string)$body['base64'] : null, 'descriptions');
        if ($path === null) throw new InvalidArgumentException('Alege o imagine pentru descriere.');
        jsonResponse([
            'url' => rtrim((string)$config['public_base_url'], '/') . '/' . ltrim($path, '/'),
            'path' => $path,
        ], 201);
    }

    if ($action === 'listProductReviews' && $method === 'GET') {
        $productId = trim((string)($_GET['id'] ?? $_GET['product_id'] ?? ''));
        $stmt = $db->prepare('SELECT r.*, p.name AS product_name, p.slug AS product_slug FROM shop_product_reviews r INNER JOIN shop_products p ON p.id = r.product_id WHERE (? = "" OR r.product_id = ?) ORDER BY r.created_at DESC LIMIT 500');
        $stmt->execute([$productId, $productId]);
        jsonResponse(array_map('reviewRow', $stmt->fetchAll()));
    }

    if ($action === 'replyProductReview' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $reply = mb_substr(trim((string)($body['admin_reply'] ?? '')), 0, 3000);
        $repliedBy = $reply === '' ? null : mb_substr((string)($currentUser['display_name'] ?? $currentUser['username'] ?? 'Administrator'), 0, 180);
        $stmt = $db->prepare('UPDATE shop_product_reviews SET admin_reply = ?, replied_by = ?, replied_at = ? WHERE id = ?');
        $stmt->execute([$reply === '' ? null : $reply, $repliedBy, $reply === '' ? null : date('Y-m-d H:i:s'), $id]);
        if ($stmt->rowCount() === 0) {
            $exists = $db->prepare('SELECT id FROM shop_product_reviews WHERE id = ?');
            $exists->execute([$id]);
            if (!$exists->fetchColumn()) jsonResponse(['error' => 'Recenzia nu exista.'], 404);
        }
        $stmt = $db->prepare('SELECT r.*, p.name AS product_name, p.slug AS product_slug FROM shop_product_reviews r INNER JOIN shop_products p ON p.id = r.product_id WHERE r.id = ?');
        $stmt->execute([$id]);
        jsonResponse(reviewRow($stmt->fetch()));
    }

    if ($action === 'deleteProductReview' && $method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $stmt = $db->prepare('DELETE FROM shop_product_reviews WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Recenzia nu exista.'], 404);
        jsonResponse(['success' => true]);
    }

    if ($action === 'getProductStats' && $method === 'GET') {
        $id = trim((string)($_GET['id'] ?? ''));
        try {
            $product = findProduct($db, $id, $config, false);
        } catch (InvalidArgumentException $error) {
            jsonResponse(['error' => $error->getMessage()], 404);
        }
        $summary = $db->prepare(
            'SELECT COUNT(DISTINCT o.id) AS orders_count,
                    COALESCE(SUM(oi.quantity), 0) AS units_sold,
                    COALESCE(SUM(oi.line_total), 0) AS revenue
             FROM shop_order_items oi
             INNER JOIN shop_orders o ON o.id = oi.order_id
             WHERE oi.product_id = ? AND o.status <> "cancelled"'
        );
        $summary->execute([$product['id']]);
        $sales = $summary->fetch() ?: [];
        $orders = $db->prepare(
            'SELECT o.id, o.order_number, o.status, o.payment_status, o.customer_name, o.created_at,
                    oi.quantity, oi.unit_price, oi.line_total
             FROM shop_order_items oi
             INNER JOIN shop_orders o ON o.id = oi.order_id
             WHERE oi.product_id = ?
             ORDER BY o.created_at DESC LIMIT 100'
        );
        $orders->execute([$product['id']]);
        $orderRows = array_map(function (array $row): array {
            $row['quantity'] = (int)$row['quantity'];
            $row['unit_price'] = (float)$row['unit_price'];
            $row['line_total'] = (float)$row['line_total'];
            return $row;
        }, $orders->fetchAll());
        $reviews = $db->prepare('SELECT r.*, p.name AS product_name, p.slug AS product_slug FROM shop_product_reviews r INNER JOIN shop_products p ON p.id = r.product_id WHERE r.product_id = ? ORDER BY r.created_at DESC LIMIT 300');
        $reviews->execute([$product['id']]);
        $unitsSold = (int)($sales['units_sold'] ?? 0);
        $revenue = round((float)($sales['revenue'] ?? 0), 2);
        $acquisitionTotal = round($unitsSold * (float)$product['cost_price'], 2);
        jsonResponse([
            'product' => $product,
            'orders_count' => (int)($sales['orders_count'] ?? 0),
            'units_sold' => $unitsSold,
            'revenue' => $revenue,
            'acquisition_total' => $acquisitionTotal,
            'profit' => round($revenue - $acquisitionTotal, 2),
            'orders' => $orderRows,
            'reviews' => array_map('reviewRow', $reviews->fetchAll()),
        ]);
    }

    if ($action === 'getDashboardStats' && $method === 'GET') {
        $summary = $db->query(
            'SELECT COUNT(DISTINCT o.id) AS orders_count,
                    COUNT(DISTINCT CASE WHEN o.status = "new" THEN o.id END) AS new_orders_count,
                    COALESCE(SUM(CASE WHEN o.status <> "cancelled" THEN oi.line_total ELSE 0 END), 0) AS revenue,
                    COALESCE(SUM(CASE WHEN o.status <> "cancelled" THEN oi.quantity * COALESCE(p.cost_price, 0) ELSE 0 END), 0) AS acquisitions
             FROM shop_orders o
             LEFT JOIN shop_order_items oi ON oi.order_id = o.id
             LEFT JOIN shop_products p ON p.id = oi.product_id'
        )->fetch() ?: [];
        $recentRows = $db->query('SELECT * FROM shop_orders ORDER BY (status = "new") DESC, created_at DESC LIMIT 8')->fetchAll();
        $revenue = round((float)($summary['revenue'] ?? 0), 2);
        $acquisitions = round((float)($summary['acquisitions'] ?? 0), 2);
        jsonResponse([
            'revenue' => $revenue,
            'orders_count' => (int)($summary['orders_count'] ?? 0),
            'new_orders_count' => (int)($summary['new_orders_count'] ?? 0),
            'acquisitions' => $acquisitions,
            'profit' => round($revenue - $acquisitions, 2),
            'products_count' => (int)$db->query('SELECT COUNT(*) FROM shop_products')->fetchColumn(),
            'recent_orders' => array_map(fn(array $row): array => orderRow($db, $row), $recentRows),
        ]);
    }

    if ($action === 'productManagerBootstrap' && $method === 'GET') {
        $products = $db->query(productSelectSql() . ' ORDER BY p.updated_at DESC, p.name ASC')->fetchAll();
        $categories = $db->query('SELECT c.*, p.name AS parent_name FROM shop_categories c LEFT JOIN shop_categories p ON p.id = c.parent_id ORDER BY COALESCE(p.name, c.name) ASC, c.parent_id IS NOT NULL ASC, c.name ASC')->fetchAll();
        $brands = $db->query('SELECT * FROM shop_brands ORDER BY name ASC')->fetchAll();
        $manufacturers = $db->query('SELECT * FROM shop_manufacturers ORDER BY name ASC')->fetchAll();
        $sources = $db->query(
            'SELECT s.*,
                    (SELECT COUNT(*) FROM shop_products p WHERE p.source_id = s.id) AS product_count
             FROM shop_product_sources s
             ORDER BY s.is_default DESC, s.sort_order ASC, s.name ASC'
        )->fetchAll();
        jsonResponse([
            'products' => array_map(fn(array $row): array => productRow($db, $row, $config, false), $products),
            'categories' => array_map(fn(array $row): array => categoryRow($row, $config), $categories),
            'brands' => array_map('brandRow', $brands),
            'manufacturers' => array_map('brandRow', $manufacturers),
            'sources' => array_map('sourceRow', $sources),
        ]);
    }

    if ($action === 'listProductSources' && $method === 'GET') {
        jsonResponse(array_map('sourceRow', $db->query(
            'SELECT s.*,
                    (SELECT COUNT(*) FROM shop_products p WHERE p.source_id = s.id) AS product_count
             FROM shop_product_sources s
             ORDER BY s.is_default DESC, s.sort_order ASC, s.name ASC'
        )->fetchAll()));
    }

    if ($action === 'createProductSource' && $method === 'POST') {
        $payload = sourcePayload($body);
        $id = uuidV4();
        $db->beginTransaction();
        try {
            if ($payload['is_default']) $db->exec('UPDATE shop_product_sources SET is_default = 0');
            $stmt = $db->prepare('INSERT INTO shop_product_sources (id, name, domain, base_url, is_default, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$id, $payload['name'], $payload['domain'], $payload['base_url'], $payload['is_default'] ? 1 : 0, $payload['is_active'] ? 1 : 0, $payload['sort_order']]);
            $defaultCount = (int)$db->query('SELECT COUNT(*) FROM shop_product_sources WHERE is_default = 1 AND is_active = 1')->fetchColumn();
            if ($defaultCount === 0) $db->exec('UPDATE shop_product_sources SET is_default = 1 WHERE is_active = 1 ORDER BY sort_order ASC, created_at ASC LIMIT 1');
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $stmt = $db->prepare('SELECT * FROM shop_product_sources WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(sourceRow($stmt->fetch()), 201);
    }

    if ($action === 'updateProductSource' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $payload = sourcePayload($body);
        $db->beginTransaction();
        try {
            if ($payload['is_default']) $db->exec('UPDATE shop_product_sources SET is_default = 0');
            $stmt = $db->prepare('UPDATE shop_product_sources SET name = ?, domain = ?, base_url = ?, is_default = ?, is_active = ?, sort_order = ? WHERE id = ?');
            $stmt->execute([$payload['name'], $payload['domain'], $payload['base_url'], $payload['is_default'] ? 1 : 0, $payload['is_active'] ? 1 : 0, $payload['sort_order'], $id]);
            if ($stmt->rowCount() === 0) {
                $exists = $db->prepare('SELECT id FROM shop_product_sources WHERE id = ?');
                $exists->execute([$id]);
                if (!$exists->fetchColumn()) throw new InvalidArgumentException('Sursa produsului nu exista.');
            }
            $defaultCount = (int)$db->query('SELECT COUNT(*) FROM shop_product_sources WHERE is_default = 1 AND is_active = 1')->fetchColumn();
            if ($defaultCount === 0) {
                $db->exec('UPDATE shop_product_sources SET is_default = 0');
                $db->exec('UPDATE shop_product_sources SET is_default = 1 WHERE is_active = 1 ORDER BY sort_order ASC, created_at ASC LIMIT 1');
            }
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $stripeSummary = stripeSyncCatalog($db, $config, $id);
        $stmt = $db->prepare('SELECT * FROM shop_product_sources WHERE id = ?');
        $stmt->execute([$id]);
        $sourceResponse = sourceRow($stmt->fetch());
        $sourceResponse['stripe_sync'] = $stripeSummary;
        jsonResponse($sourceResponse);
    }

    if ($action === 'deleteProductSource' && $method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $stmt = $db->prepare('SELECT * FROM shop_product_sources WHERE id = ?');
        $stmt->execute([$id]);
        $source = $stmt->fetch();
        if (!$source) jsonResponse(['error' => 'Sursa produsului nu exista.'], 404);
        if ((bool)$source['is_default']) throw new InvalidArgumentException('Alege alta sursa implicita inainte de stergere.');
        $used = $db->prepare('SELECT COUNT(*) FROM shop_products WHERE source_id = ?');
        $used->execute([$id]);
        if ((int)$used->fetchColumn() > 0) throw new InvalidArgumentException('Sursa este folosita de produse. O poti dezactiva, dar nu sterge.');
        $db->prepare('DELETE FROM shop_product_sources WHERE id = ?')->execute([$id]);
        jsonResponse(['success' => true]);
    }

    if ($action === 'listProducts' && $method === 'GET') {
        $rows = $db->query(productSelectSql() . ' ORDER BY p.updated_at DESC, p.name ASC')->fetchAll();
        jsonResponse(array_map(fn(array $row): array => productRow($db, $row, $config, false), $rows));
    }

    if ($action === 'getProduct' && $method === 'GET') {
        $id = trim((string)($_GET['id'] ?? ''));
        try {
            jsonResponse(findProduct($db, $id, $config, false));
        } catch (InvalidArgumentException $error) {
            jsonResponse(['error' => $error->getMessage()], 404);
        }
    }

    if ($action === 'createProduct' && $method === 'POST') {
        $payload = productPayload($db, $body);
        ensureUniqueProductName($db, $payload['name']);
        $id = uuidV4();
        $db->beginTransaction();
        try {
            $stmt = $db->prepare('INSERT INTO shop_products (id, category_id, manufacturer_id, source_id, sku, source_domain, source_url, name, slug, short_description, description_title, description_html, specifications_json, questions_json, meta_title, meta_description, cost_price, price, sale_price, discount_type, discount_value, currency, stock_mode, stock_quantity, low_stock_threshold, is_active, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $id, $payload['category_id'], $payload['manufacturer_id'], $payload['source_id'], uniqueProductSku($db, $payload['sku']), $payload['source_domain'], $payload['source_url'],
                $payload['name'], uniqueSlug($db, 'shop_products', $payload['slug_source']), $payload['short_description'], $payload['description_title'], $payload['description_html'], $payload['specifications_json'], $payload['questions_json'],
                $payload['meta_title'], $payload['meta_description'], $payload['cost_price'], $payload['price'], $payload['sale_price'], $payload['discount_type'], $payload['discount_value'], $payload['currency'],
                $payload['stock_mode'], $payload['stock_quantity'], $payload['low_stock_threshold'], $payload['is_active'] ? 1 : 0, $payload['is_featured'] ? 1 : 0
            ]);
            syncProductBrands($db, $id, $payload['brand_ids']);
            syncProductImages($db, $id, $payload['images'], $payload['name']);
            if ($payload['stock_mode'] === 'tracked' && $payload['stock_quantity'] !== 0) {
                $movement = $db->prepare('INSERT INTO shop_inventory_movements (id, product_id, movement_type, quantity_delta, quantity_after, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
                $movement->execute([uuidV4(), $id, 'initial', $payload['stock_quantity'], $payload['stock_quantity'], 'Stoc initial', (string)($currentUser['display_name'] ?? $currentUser['username'] ?? '')]);
            }
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $stripeSync = stripeSyncProductSafe($db, $config, $id);
        $productResponse = findProduct($db, $id, $config);
        $productResponse['stripe_sync'] = $stripeSync;
        jsonResponse($productResponse, 201);
    }

    if ($action === 'updateProduct' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $currentStmt = $db->prepare('SELECT * FROM shop_products WHERE id = ?');
        $currentStmt->execute([$id]);
        $current = $currentStmt->fetch();
        if (!$current) jsonResponse(['error' => 'Produsul nu exista.'], 404);
        $payload = productPayload($db, $body, true);
        $removedDescriptionImages = array_diff(
            richDescriptionImagePaths((string)($current['description_html'] ?? '')),
            richDescriptionImagePaths((string)$payload['description_html'])
        );
        ensureUniqueProductName($db, $payload['name'], $id);
        $db->beginTransaction();
        try {
            $stmt = $db->prepare('UPDATE shop_products SET category_id = ?, manufacturer_id = ?, source_id = ?, sku = ?, source_domain = ?, source_url = ?, name = ?, slug = ?, short_description = ?, description_title = ?, description_html = ?, specifications_json = ?, questions_json = ?, meta_title = ?, meta_description = ?, cost_price = ?, price = ?, sale_price = ?, discount_type = ?, discount_value = ?, currency = ?, stock_mode = ?, stock_quantity = ?, low_stock_threshold = ?, is_active = ?, is_featured = ? WHERE id = ?');
            $stmt->execute([
                $payload['category_id'], $payload['manufacturer_id'], $payload['source_id'], uniqueProductSku($db, $payload['sku'], $id), $payload['source_domain'], $payload['source_url'],
                $payload['name'], uniqueSlug($db, 'shop_products', $payload['slug_source'], $id), $payload['short_description'], $payload['description_title'], $payload['description_html'], $payload['specifications_json'], $payload['questions_json'],
                $payload['meta_title'], $payload['meta_description'], $payload['cost_price'], $payload['price'], $payload['sale_price'], $payload['discount_type'], $payload['discount_value'], $payload['currency'],
                $payload['stock_mode'], $payload['stock_quantity'], $payload['low_stock_threshold'], $payload['is_active'] ? 1 : 0, $payload['is_featured'] ? 1 : 0, $id
            ]);
            syncProductBrands($db, $id, $payload['brand_ids']);
            syncProductImages($db, $id, $payload['images'], $payload['name']);
            $oldQuantity = $current['stock_mode'] === 'tracked' ? (int)$current['stock_quantity'] : 0;
            $newQuantity = $payload['stock_mode'] === 'tracked' ? (int)$payload['stock_quantity'] : 0;
            if ($oldQuantity !== $newQuantity || $current['stock_mode'] !== $payload['stock_mode']) {
                $movement = $db->prepare('INSERT INTO shop_inventory_movements (id, product_id, movement_type, quantity_delta, quantity_after, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
                $movement->execute([uuidV4(), $id, 'adjustment', $newQuantity - $oldQuantity, $newQuantity, 'Actualizare din editorul produsului', (string)($currentUser['display_name'] ?? $currentUser['username'] ?? '')]);
            }
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        foreach ($removedDescriptionImages as $path) removeShopImage((string)$path);
        $stripeSync = stripeSyncProductSafe($db, $config, $id);
        $productResponse = findProduct($db, $id, $config);
        $productResponse['stripe_sync'] = $stripeSync;
        jsonResponse($productResponse);
    }

    if ($action === 'deleteProduct' && $method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        stripeArchiveProduct($db, $config, $id);
        $descriptionStmt = $db->prepare('SELECT description_html FROM shop_products WHERE id = ?');
        $descriptionStmt->execute([$id]);
        $descriptionPaths = richDescriptionImagePaths((string)($descriptionStmt->fetchColumn() ?: ''));
        $images = $db->prepare('SELECT image_path FROM shop_product_images WHERE product_id = ?');
        $images->execute([$id]);
        $paths = array_values(array_unique(array_merge($images->fetchAll(PDO::FETCH_COLUMN), $descriptionPaths)));
        $db->beginTransaction();
        try {
            $db->prepare('DELETE FROM shop_product_brands WHERE product_id = ?')->execute([$id]);
            $db->prepare('DELETE FROM shop_product_images WHERE product_id = ?')->execute([$id]);
            $db->prepare('DELETE FROM shop_product_reviews WHERE product_id = ?')->execute([$id]);
            $db->prepare('DELETE FROM shop_inventory_movements WHERE product_id = ?')->execute([$id]);
            $db->prepare('UPDATE shop_order_items SET product_id = NULL WHERE product_id = ?')->execute([$id]);
            $stmt = $db->prepare('DELETE FROM shop_products WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) throw new InvalidArgumentException('Produsul nu exista.');
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $deletedFiles = 0;
        foreach ($paths as $path) {
            if (removeShopImage((string)$path)) $deletedFiles++;
        }
        jsonResponse(['success' => true, 'deleted_files' => $deletedFiles]);
    }

    if ($action === 'listInventory' && $method === 'GET') {
        $rows = $db->query(productSelectSql() . ' ORDER BY (p.stock_mode = "tracked" AND p.stock_quantity <= p.low_stock_threshold) DESC, p.name ASC')->fetchAll();
        jsonResponse(array_map(fn(array $row): array => productRow($db, $row, $config, false), $rows));
    }

    if ($action === 'listInventoryMovements' && $method === 'GET') {
        $productId = trim((string)($_GET['id'] ?? $_GET['product_id'] ?? ''));
        $stmt = $db->prepare('SELECT im.*, p.name AS product_name, o.order_number FROM shop_inventory_movements im INNER JOIN shop_products p ON p.id = im.product_id LEFT JOIN shop_orders o ON o.id = im.order_id WHERE (? = "" OR im.product_id = ?) ORDER BY im.created_at DESC LIMIT 300');
        $stmt->execute([$productId, $productId]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['quantity_delta'] = (int)$row['quantity_delta'];
            $row['quantity_after'] = (int)$row['quantity_after'];
        }
        jsonResponse($rows);
    }

    if ($action === 'adjustStock' && $method === 'POST') {
        $id = trim((string)($_GET['id'] ?? ($body['product_id'] ?? '')));
        $db->beginTransaction();
        try {
            $stmt = $db->prepare('SELECT * FROM shop_products WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $product = $stmt->fetch();
            if (!$product) throw new InvalidArgumentException('Produsul nu exista.');
            $currentQuantity = (int)$product['stock_quantity'];
            $nextQuantity = $product['stock_mode'] === 'tracked'
                ? (array_key_exists('quantity', $body) ? max(0, (int)$body['quantity']) : max(0, $currentQuantity + (int)($body['delta'] ?? 0)))
                : 0;
            $delta = $nextQuantity - $currentQuantity;
            $db->prepare('UPDATE shop_products SET stock_quantity = ? WHERE id = ?')->execute([$nextQuantity, $id]);
            $movement = $db->prepare('INSERT INTO shop_inventory_movements (id, product_id, movement_type, quantity_delta, quantity_after, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $movement->execute([uuidV4(), $id, 'adjustment', $delta, $nextQuantity, mb_substr(trim((string)($body['note'] ?? 'Ajustare manuala')), 0, 500), (string)($currentUser['display_name'] ?? $currentUser['username'] ?? '')]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        jsonResponse(findProduct($db, $id, $config));
    }

    if ($action === 'listOrders' && $method === 'GET') {
        $rows = $db->query('SELECT * FROM shop_orders ORDER BY created_at DESC LIMIT 500')->fetchAll();
        jsonResponse(array_map(fn(array $row): array => orderRow($db, $row), $rows));
    }

    if ($action === 'getOrder' && $method === 'GET') {
        $id = trim((string)($_GET['id'] ?? ''));
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? OR order_number = ? LIMIT 1');
        $stmt->execute([$id, $id]);
        $row = $stmt->fetch();
        if (!$row) jsonResponse(['error' => 'Comanda nu exista.'], 404);
        jsonResponse(orderRow($db, $row));
    }

    if ($action === 'updateOrder' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $statuses = ['new', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled'];
        $paymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
        $status = trim((string)($body['status'] ?? ''));
        $paymentStatus = trim((string)($body['payment_status'] ?? ''));
        if (!in_array($status, $statuses, true) || !in_array($paymentStatus, $paymentStatuses, true)) throw new InvalidArgumentException('Statusul comenzii nu este valid.');
        $db->beginTransaction();
        try {
            $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $current = $stmt->fetch();
            if (!$current) throw new InvalidArgumentException('Comanda nu exista.');
            if ($status === 'cancelled' && $current['status'] !== 'cancelled') {
                $items = $db->prepare('SELECT * FROM shop_order_items WHERE order_id = ?');
                $items->execute([$id]);
                foreach ($items->fetchAll() as $item) {
                    if (empty($item['product_id'])) continue;
                    $productStmt = $db->prepare('SELECT * FROM shop_products WHERE id = ? FOR UPDATE');
                    $productStmt->execute([$item['product_id']]);
                    $product = $productStmt->fetch();
                    if (!$product || $product['stock_mode'] !== 'tracked') continue;
                    $next = (int)$product['stock_quantity'] + (int)$item['quantity'];
                    $db->prepare('UPDATE shop_products SET stock_quantity = ? WHERE id = ?')->execute([$next, $product['id']]);
                    $movement = $db->prepare('INSERT INTO shop_inventory_movements (id, product_id, order_id, movement_type, quantity_delta, quantity_after, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                    $movement->execute([uuidV4(), $product['id'], $id, 'return', (int)$item['quantity'], $next, 'Stoc returnat prin anularea comenzii', (string)($currentUser['display_name'] ?? $currentUser['username'] ?? '')]);
                }
            }
            $update = $db->prepare('UPDATE shop_orders SET status = ?, payment_status = ?, admin_notes = ? WHERE id = ?');
            $update->execute([$status, $paymentStatus, mb_substr(trim((string)($body['admin_notes'] ?? '')), 0, 5000), $id]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(orderRow($db, $stmt->fetch()));
    }

    if ($action === 'getPaymentSettings' && $method === 'GET') jsonResponse(paymentSettings($db, $config));

    if ($action === 'syncStripeCatalog' && $method === 'POST') {
        jsonResponse(stripeSyncCatalog($db, $config));
    }

    if ($action === 'updatePaymentSettings' && in_array($method, ['PUT', 'PATCH'], true)) {
        $cardEnabled = boolValue($body['card_enabled'] ?? false);
        $codEnabled = boolValue($body['cash_on_delivery_enabled'] ?? true, true);
        if (!$cardEnabled && !$codEnabled) throw new InvalidArgumentException('Activeaza cel putin o metoda de plata.');
        $stmt = $db->prepare('UPDATE shop_payment_settings SET card_enabled = ?, cash_on_delivery_enabled = ?, card_label = ?, cash_on_delivery_label = ? WHERE id = 1');
        $stmt->execute([$cardEnabled ? 1 : 0, $codEnabled ? 1 : 0, mb_substr(trim((string)($body['card_label'] ?? 'Card online')), 0, 120), mb_substr(trim((string)($body['cash_on_delivery_label'] ?? 'Ramburs la curier')), 0, 120)]);
        jsonResponse(paymentSettings($db, $config));
    }

    if ($action === 'listShippingMethods' && $method === 'GET') {
        jsonResponse(array_map('shippingRow', $db->query('SELECT * FROM shop_shipping_methods ORDER BY sort_order ASC, name ASC')->fetchAll()));
    }

    if ($action === 'createShippingMethod' && $method === 'POST') {
        $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 120);
        if ($name === '') throw new InvalidArgumentException('Numele livrarii este obligatoriu.');
        $id = uuidV4();
        $stmt = $db->prepare('INSERT INTO shop_shipping_methods (id, name, description, cost, free_above, eta_label, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $name, mb_substr(trim((string)($body['description'] ?? '')), 0, 500), moneyValue($body['cost'] ?? 0, 'Costul livrarii'), moneyValue($body['free_above'] ?? null, 'Pragul de gratuitate', true), mb_substr(trim((string)($body['eta_label'] ?? '')), 0, 120), boolValue($body['is_active'] ?? true, true) ? 1 : 0, (int)($body['sort_order'] ?? 0)]);
        $stmt = $db->prepare('SELECT * FROM shop_shipping_methods WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(shippingRow($stmt->fetch()), 201);
    }

    if ($action === 'updateShippingMethod' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 120);
        if ($name === '') throw new InvalidArgumentException('Numele livrarii este obligatoriu.');
        $stmt = $db->prepare('UPDATE shop_shipping_methods SET name = ?, description = ?, cost = ?, free_above = ?, eta_label = ?, is_active = ?, sort_order = ? WHERE id = ?');
        $stmt->execute([$name, mb_substr(trim((string)($body['description'] ?? '')), 0, 500), moneyValue($body['cost'] ?? 0, 'Costul livrarii'), moneyValue($body['free_above'] ?? null, 'Pragul de gratuitate', true), mb_substr(trim((string)($body['eta_label'] ?? '')), 0, 120), boolValue($body['is_active'] ?? true, true) ? 1 : 0, (int)($body['sort_order'] ?? 0), $id]);
        if ($stmt->rowCount() === 0) {
            $exists = $db->prepare('SELECT id FROM shop_shipping_methods WHERE id = ?');
            $exists->execute([$id]);
            if (!$exists->fetchColumn()) jsonResponse(['error' => 'Metoda de livrare nu exista.'], 404);
        }
        $stmt = $db->prepare('SELECT * FROM shop_shipping_methods WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(shippingRow($stmt->fetch()));
    }

    if ($action === 'deleteShippingMethod' && $method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $stmt = $db->prepare('DELETE FROM shop_shipping_methods WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Metoda de livrare nu exista.'], 404);
        jsonResponse(['success' => true]);
    }

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
