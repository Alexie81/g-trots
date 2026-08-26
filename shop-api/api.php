<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Auth-Token, X-Import-Key');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require_once __DIR__ . '/order-emails.php';
require_once __DIR__ . '/stripe.php';
require_once __DIR__ . '/gomag.php';

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
        'order_email_from' => 'contact@g-trots.ro',
        'order_email_from_name' => 'G-Trots România',
        'order_email_reply_to' => 'contact@g-trots.ro',
        'order_email_logo_url' => 'https://g-trots.ro/assets/logo.png',
        'smtp_host' => '',
        'smtp_port' => 465,
        'smtp_encryption' => 'ssl',
        'smtp_username' => '',
        'smtp_password' => '',
        'gomag_api_key' => '',
        'gomag_shop_url' => 'https://www.boomag.ro',
        'boomag_feed_url' => 'https://www.boomag.ro/feed/doctor-trotineta.csv',
        'boomag_import_key' => '',
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

    $gomagFile = __DIR__ . '/gomag.local.php';
    if (is_file($gomagFile)) {
        $gomag = include $gomagFile;
        if (is_array($gomag)) $config = array_merge($config, $gomag);
    }

    return $config;
}

function jsonResponse($payload, int $status = 200): void {
    http_response_code($status);
    $json = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
    );
    if ($json === false) {
        http_response_code(500);
        $json = json_encode([
            'error' => 'Raspunsul SHOP nu a putut fi serializat.',
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    echo $json;
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
            supplier_external_id VARCHAR(120) NULL,
            sku VARCHAR(80) NULL UNIQUE,
            supplier_product_code VARCHAR(120) NULL,
            ean VARCHAR(120) NULL,
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
            supplier_stock_quantity INT NOT NULL DEFAULT 0,
            supplier_stock_status TINYINT(1) NOT NULL DEFAULT 0,
            supplier_stock_updated_at DATETIME NULL,
            accounting_stock_quantity INT NOT NULL DEFAULT 0,
            low_stock_threshold INT NOT NULL DEFAULT 3,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            is_featured TINYINT(1) NOT NULL DEFAULT 0,
            view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
            stripe_product_id VARCHAR(80) NULL,
            stripe_price_id VARCHAR(80) NULL,
            stripe_synced_at DATETIME NULL,
            stripe_sync_error VARCHAR(500) NULL,
            content_status VARCHAR(20) NOT NULL DEFAULT 'manual',
            seo_researched_at DATETIME NULL,
            seo_word_count INT NOT NULL DEFAULT 0,
            seo_sources_json MEDIUMTEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_products_name (name),
            INDEX idx_shop_products_category (category_id),
            INDEX idx_shop_products_manufacturer (manufacturer_id),
            INDEX idx_shop_products_source (source_id),
            UNIQUE INDEX idx_shop_products_supplier_external (source_id, supplier_external_id),
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
    $productIdentityColumns = [
        'supplier_external_id' => 'VARCHAR(120) NULL AFTER source_id',
        'supplier_product_code' => 'VARCHAR(120) NULL AFTER sku',
        'ean' => 'VARCHAR(120) NULL AFTER supplier_product_code',
    ];
    foreach ($productIdentityColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_products LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_products ADD COLUMN {$column} {$definition}");
        }
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
    $supplierStockColumns = [
        'supplier_stock_quantity' => 'INT NOT NULL DEFAULT 0 AFTER stock_quantity',
        'supplier_stock_status' => 'TINYINT(1) NOT NULL DEFAULT 0 AFTER supplier_stock_quantity',
        'supplier_stock_updated_at' => 'DATETIME NULL AFTER supplier_stock_status',
    ];
    foreach ($supplierStockColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_products LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_products ADD COLUMN {$column} {$definition}");
        }
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
    if (!$db->query("SHOW COLUMNS FROM shop_products LIKE 'content_status'")->fetch()) {
        $db->exec("ALTER TABLE shop_products ADD COLUMN content_status VARCHAR(20) NOT NULL DEFAULT 'manual' AFTER stripe_sync_error");
    }
    $seoResearchColumns = [
        'seo_researched_at' => 'DATETIME NULL AFTER content_status',
        'seo_word_count' => 'INT NOT NULL DEFAULT 0 AFTER seo_researched_at',
        'seo_sources_json' => 'MEDIUMTEXT NULL AFTER seo_word_count',
    ];
    foreach ($seoResearchColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_products LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_products ADD COLUMN {$column} {$definition}");
        }
    }
    if (!$db->query("SHOW INDEX FROM shop_products WHERE Key_name = 'idx_shop_products_supplier_external'")->fetch()) {
        $db->exec('ALTER TABLE shop_products ADD UNIQUE INDEX idx_shop_products_supplier_external (source_id, supplier_external_id)');
    }
    if (!$db->query("SHOW INDEX FROM shop_products WHERE Key_name = 'idx_shop_products_stripe_product'")->fetch()) {
        $db->exec('ALTER TABLE shop_products ADD UNIQUE INDEX idx_shop_products_stripe_product (stripe_product_id)');
    }
    if (!$db->query("SHOW INDEX FROM shop_products WHERE Key_name = 'idx_shop_products_stripe_price'")->fetch()) {
        $db->exec('ALTER TABLE shop_products ADD INDEX idx_shop_products_stripe_price (stripe_price_id)');
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_supplier_sync_state (
            source_domain VARCHAR(120) NOT NULL PRIMARY KEY,
            last_attempt_at DATETIME NULL,
            last_synced_at DATETIME NULL,
            row_count INT NOT NULL DEFAULT 0,
            matched_products INT NOT NULL DEFAULT 0,
            last_error VARCHAR(1000) NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
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
            tracking_token VARCHAR(64) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_orders_number (order_number),
            INDEX idx_shop_orders_status (status, created_at),
            INDEX idx_shop_orders_customer (customer_phone, customer_email),
            UNIQUE INDEX idx_shop_orders_stripe_session (stripe_checkout_session_id),
            INDEX idx_shop_orders_stripe_payment (stripe_payment_intent_id),
            UNIQUE INDEX idx_shop_orders_tracking_token (tracking_token)
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
    if (!$db->query("SHOW COLUMNS FROM shop_orders LIKE 'tracking_token'")->fetch()) {
        $db->exec('ALTER TABLE shop_orders ADD COLUMN tracking_token VARCHAR(64) NULL AFTER stripe_paid_at');
    }
    $db->exec("UPDATE shop_orders SET tracking_token = LOWER(REPLACE(UUID(), '-', '')) WHERE tracking_token IS NULL OR tracking_token = ''");
    if (!$db->query("SHOW INDEX FROM shop_orders WHERE Key_name = 'idx_shop_orders_tracking_token'")->fetch()) {
        $db->exec('ALTER TABLE shop_orders ADD UNIQUE INDEX idx_shop_orders_tracking_token (tracking_token)');
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
        "CREATE TABLE IF NOT EXISTS shop_order_status_history (
            id CHAR(36) NOT NULL PRIMARY KEY,
            order_id CHAR(36) NOT NULL,
            from_status VARCHAR(30) NULL,
            to_status VARCHAR(30) NOT NULL,
            changed_by VARCHAR(180) NULL,
            customer_notified TINYINT(1) NOT NULL DEFAULT 0,
            email_status VARCHAR(30) NOT NULL DEFAULT 'not_requested',
            email_error VARCHAR(500) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_order_history_order (order_id, created_at),
            INDEX idx_shop_order_history_status (to_status, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "INSERT INTO shop_order_status_history (id, order_id, from_status, to_status, changed_by, customer_notified, email_status, created_at)
         SELECT UUID(), o.id, NULL, o.status, 'Sistem', 0, 'not_requested', o.created_at
         FROM shop_orders o
         WHERE NOT EXISTS (SELECT 1 FROM shop_order_status_history h WHERE h.order_id = o.id)"
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

    // Datele comerciale sunt administrate exclusiv din CRM. Schema nu
    // reintroduce automat surse, marci sau livrari demonstrative.
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

function verifyBoomagImportKey(array $config, array $body = []): void {
    $expected = trim((string)($config['boomag_import_key'] ?? ''));
    if ($expected === '') $expected = trim((string)($config['gomag_api_key'] ?? ''));
    $provided = requestHeader('X-Import-Key');
    if ($provided === '') $provided = trim((string)($body['import_key'] ?? ''));
    if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
        jsonResponse(['error' => 'Cheia importului Boomag este invalida.'], 401);
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

function generatedProductSku(string $name, string $sourceDomain): string {
    $prefix = stripos($sourceDomain, 'boomag') !== false ? 'BOOM' : 'GT';
    $parts = array_slice(array_values(array_filter(explode('-', slugBase($name)))), 0, 4);
    $parts = array_map(static fn(string $part): string => strtoupper(mb_substr($part, 0, 4)), $parts);
    return mb_substr($prefix . '-' . implode('-', $parts), 0, 80);
}

function ensureUniqueProductName(PDO $db, string $name, ?string $excludeId = null): void {
    $sql = 'SELECT id FROM shop_products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))' . ($excludeId ? ' AND id <> ?' : '') . ' LIMIT 1';
    $stmt = $db->prepare($sql);
    $stmt->execute($excludeId ? [$name, $excludeId] : [$name]);
    if ($stmt->fetchColumn()) throw new InvalidArgumentException('Acest nume de produs exista deja.');
}

function categoryRow(array $row, array $config): array {
    $path = trim((string)($row['thumbnail_path'] ?? ''));
    $row['thumbnail_url'] = $path === ''
        ? null
        : (preg_match('#^https?://#i', $path) ? $path : rtrim((string)$config['public_base_url'], '/') . '/' . ltrim($path, '/'));
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
    if ($path === '' || !preg_match('#^uploads/(products|descriptions)/[a-f0-9]{32}\.(jpg|png|webp|gif)$#i', $path)) return false;
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

function legacyProductImageUrl(array $product, array $config): string {
    $legacyImages = [
        'anvelopa-g10-all-terrain' => 'anvelopa-g10-all-terrain.png',
        'display-smart-ride-s3' => 'display-smart-ride-s3.png',
        'incarcator-fastcharge-54-6v' => 'incarcator-fastcharge-54-6v.png',
        'motor-dualhub-x2-2000w' => 'motor-dualhub-x2-2000w.png',
        'baterie-powercore-52v-23ah' => 'baterie-powercore-52v-23ah.png',
        'kit-frana-hydrostop-pro' => 'kit-frana-hydrostop-pro.png',
    ];
    $slug = (string)($product['slug'] ?? '');
    if (!isset($legacyImages[$slug])) return '';
    $siteBaseUrl = preg_replace('#/shop-api/?$#', '', rtrim((string)($config['public_base_url'] ?? 'https://g-trots.ro/shop-api'), '/')) ?: 'https://g-trots.ro';
    return rtrim($siteBaseUrl, '/') . '/assets/products/' . $legacyImages[$slug];
}

function productRow(PDO $db, array $row, array $config, bool $withDescription = true, bool $includeInternal = true): array {
    $productId = (string)$row['id'];
    $preloadedImages = $row['_preloaded_images'] ?? null;
    if (!is_array($preloadedImages)) {
        $images = $db->prepare('SELECT id, image_path, alt_text, sort_order FROM shop_product_images WHERE product_id = ? ORDER BY sort_order ASC, created_at ASC');
        $images->execute([$productId]);
        $preloadedImages = $images->fetchAll();
    }
    $row['images'] = array_map(function (array $image) use ($config): array {
        $path = (string)$image['image_path'];
        return [
            'id' => (string)$image['id'],
            'url' => preg_match('#^https?://#i', $path) ? $path : rtrim((string)$config['public_base_url'], '/') . '/' . ltrim($path, '/'),
            'alt_text' => (string)($image['alt_text'] ?? ''),
            'sort_order' => (int)$image['sort_order'],
        ];
    }, $preloadedImages);
    if (count($row['images']) === 0) {
        $slug = (string)($row['slug'] ?? '');
        $legacyImageUrl = legacyProductImageUrl($row, $config);
        if ($legacyImageUrl !== '') {
            $row['images'][] = [
                'id' => 'legacy-image-' . $slug,
                'url' => $legacyImageUrl,
                'alt_text' => (string)($row['name'] ?? 'Produs G-Trots'),
                'sort_order' => 0,
                'is_legacy' => true,
            ];
        }
    }
    $preloadedBrands = $row['_preloaded_brands'] ?? null;
    if (!is_array($preloadedBrands)) {
        $brands = $db->prepare('SELECT b.id, b.name, b.slug FROM shop_brands b INNER JOIN shop_product_brands pb ON pb.brand_id = b.id WHERE pb.product_id = ? ORDER BY b.name ASC');
        $brands->execute([$productId]);
        $preloadedBrands = $brands->fetchAll();
    }
    $row['brands'] = $preloadedBrands;
    $row['brand_ids'] = array_map(fn(array $brand): string => (string)$brand['id'], $row['brands']);
    $decodedSpecifications = json_decode((string)($row['specifications_json'] ?? ''), true);
    $row['specifications'] = is_array($decodedSpecifications) ? array_values($decodedSpecifications) : [];
    $decodedQuestions = json_decode((string)($row['questions_json'] ?? ''), true);
    $row['questions'] = is_array($decodedQuestions) ? array_values($decodedQuestions) : [];
    $decodedSeoSources = json_decode((string)($row['seo_sources_json'] ?? ''), true);
    $row['seo_sources'] = is_array($decodedSeoSources) ? array_values($decodedSeoSources) : [];
    unset($row['specifications_json']);
    unset($row['questions_json']);
    unset($row['seo_sources_json']);
    unset($row['_preloaded_images']);
    unset($row['_preloaded_brands']);
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
    $row['supplier_stock_quantity'] = (int)($row['supplier_stock_quantity'] ?? 0);
    $row['supplier_stock_status'] = (bool)($row['supplier_stock_status'] ?? false);
    $row['accounting_stock_quantity'] = (int)($row['accounting_stock_quantity'] ?? 0);
    $row['low_stock_threshold'] = (int)$row['low_stock_threshold'];
    $row['is_active'] = (bool)$row['is_active'];
    $row['is_featured'] = (bool)$row['is_featured'];
    $row['view_count'] = (int)($row['view_count'] ?? 0);
    $row['seo_word_count'] = (int)($row['seo_word_count'] ?? 0);
    $row['category_id'] = empty($row['category_id']) ? null : (string)$row['category_id'];
    $row['manufacturer_id'] = empty($row['manufacturer_id']) ? null : (string)$row['manufacturer_id'];
    $row['source_id'] = empty($row['source_id']) ? null : (string)$row['source_id'];
    $row['source_is_active'] = (bool)($row['source_is_active'] ?? true);
    $row['stripe_product_id'] = empty($row['stripe_product_id']) ? null : (string)$row['stripe_product_id'];
    $row['stripe_price_id'] = empty($row['stripe_price_id']) ? null : (string)$row['stripe_price_id'];
    $row['stripe_sync_error'] = empty($row['stripe_sync_error']) ? null : (string)$row['stripe_sync_error'];
    $row['stripe_sync_status'] = $row['stripe_sync_error'] !== null ? 'error' : ($row['stripe_product_id'] !== null ? 'synced' : 'pending');
    $row['seo_ready'] = (string)($row['content_status'] ?? '') === 'seo';
    $row['gtin'] = preg_match('/^[0-9]{8,14}$/', (string)($row['ean'] ?? '')) ? (string)$row['ean'] : null;
    $row['stock_available'] = $row['stock_mode'] === 'unlimited' || $row['stock_quantity'] > 0;
    if (!$withDescription) unset($row['description_html']);
    if (!$includeInternal) {
        unset($row['source_id'], $row['source_domain'], $row['source_url'], $row['source_name'], $row['source_is_active'], $row['supplier_external_id'], $row['supplier_product_code'], $row['ean'], $row['content_status'], $row['seo_researched_at'], $row['seo_word_count'], $row['seo_sources']);
    }
    return $row;
}

function productRows(PDO $db, array $rows, array $config, bool $withDescription = true, bool $includeInternal = true): array {
    if (!$rows) return [];
    $ids = array_values(array_unique(array_map(static fn(array $row): string => (string)$row['id'], $rows)));
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $imagesByProduct = [];
    $imageStmt = $db->prepare(
        "SELECT id, product_id, image_path, alt_text, sort_order
         FROM shop_product_images
         WHERE product_id IN ({$placeholders})
         ORDER BY product_id ASC, sort_order ASC, created_at ASC"
    );
    $imageStmt->execute($ids);
    foreach ($imageStmt->fetchAll() as $image) $imagesByProduct[(string)$image['product_id']][] = $image;

    $brandsByProduct = [];
    $brandStmt = $db->prepare(
        "SELECT pb.product_id, b.id, b.name, b.slug
         FROM shop_product_brands pb
         INNER JOIN shop_brands b ON b.id = pb.brand_id
         WHERE pb.product_id IN ({$placeholders})
         ORDER BY pb.product_id ASC, b.name ASC"
    );
    $brandStmt->execute($ids);
    foreach ($brandStmt->fetchAll() as $brand) {
        $productId = (string)$brand['product_id'];
        unset($brand['product_id']);
        $brandsByProduct[$productId][] = $brand;
    }

    return array_map(static function (array $row) use ($db, $config, $withDescription, $includeInternal, $imagesByProduct, $brandsByProduct): array {
        $productId = (string)$row['id'];
        $row['_preloaded_images'] = $imagesByProduct[$productId] ?? [];
        $row['_preloaded_brands'] = $brandsByProduct[$productId] ?? [];
        return productRow($db, $row, $config, $withDescription, $includeInternal);
    }, $rows);
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
    if (mb_strtolower(trim($sourceDomain)) === 'boomag.ro') {
        $stockMode = 'tracked';
        $stockQuantity = 0;
    }
    return [
        'name' => mb_substr($name, 0, 180),
        'slug_source' => mb_substr(trim((string)($body['slug'] ?? $name)), 0, 200),
        'sku' => ($sku = mb_substr(trim((string)($body['sku'] ?? '')), 0, 80)) === '' ? null : $sku,
        'supplier_product_code' => ($supplierCode = mb_substr(trim((string)($body['supplier_product_code'] ?? '')), 0, 120)) === '' ? null : $supplierCode,
        'ean' => ($ean = mb_substr(trim((string)($body['ean'] ?? '')), 0, 120)) === '' ? null : $ean,
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

function seoDescriptionWordCount(string $html): int {
    $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $parts = preg_split('/[^\p{L}\p{N}]+/u', $text, -1, PREG_SPLIT_NO_EMPTY);
    return is_array($parts) ? count($parts) : 0;
}

function seoCopyTokens(string $text): array {
    $plain = mb_strtolower(html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $tokens = preg_split('/[^\p{L}\p{N}]+/u', $plain, -1, PREG_SPLIT_NO_EMPTY);
    return is_array($tokens) ? array_values($tokens) : [];
}

function seoNormalizedCopy(string $text): string {
    return implode(' ', seoCopyTokens($text));
}

function seoDuplicateSentenceIssues(string $descriptionHtml): array {
    $withStops = preg_replace('#</(?:p|li|h[1-6]|blockquote|div)>#iu', '. ', $descriptionHtml) ?? $descriptionHtml;
    $plain = html_entity_decode(strip_tags($withStops), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $sentences = preg_split('/(?<=[.!?])\s+/u', preg_replace('/\s+/u', ' ', trim($plain)) ?? trim($plain), -1, PREG_SPLIT_NO_EMPTY);
    if (!is_array($sentences)) return [];
    $counts = [];
    $samples = [];
    foreach ($sentences as $sentence) {
        $tokens = seoCopyTokens($sentence);
        if (count($tokens) < 9) continue;
        $key = implode(' ', $tokens);
        $counts[$key] = ($counts[$key] ?? 0) + 1;
        $samples[$key] = trim($sentence);
    }
    $issues = [];
    foreach ($counts as $key => $count) {
        if ($count < 2) continue;
        $sample = mb_substr($samples[$key] ?? $key, 0, 150);
        $issues[] = 'Descrierea lunga repeta aceeasi propozitie de ' . $count . ' ori: „' . $sample . '”.';
        if (count($issues) >= 4) break;
    }
    return $issues;
}

function seoCrossProductIssues(PDO $db, string $productId, array $payload): array {
    $stmt = $db->prepare(
        'SELECT id, name, short_description, meta_title, meta_description FROM shop_products WHERE id <> ? AND content_status = "seo"'
    );
    $stmt->execute([$productId]);
    $candidateFields = [
        'titlul SEO' => seoNormalizedCopy((string)($payload['name'] ?? '')),
        'descrierea scurta' => seoNormalizedCopy((string)($payload['short_description'] ?? '')),
        'meta titlul' => seoNormalizedCopy((string)($payload['meta_title'] ?? '')),
        'meta descrierea' => seoNormalizedCopy((string)($payload['meta_description'] ?? '')),
    ];
    $issues = [];
    foreach ($stmt->fetchAll() as $other) {
        $otherFields = [
            'titlul SEO' => seoNormalizedCopy((string)($other['name'] ?? '')),
            'descrierea scurta' => seoNormalizedCopy((string)($other['short_description'] ?? '')),
            'meta titlul' => seoNormalizedCopy((string)($other['meta_title'] ?? '')),
            'meta descrierea' => seoNormalizedCopy((string)($other['meta_description'] ?? '')),
        ];
        foreach ($candidateFields as $label => $candidate) {
            if ($candidate === '' || $candidate !== $otherFields[$label]) continue;
            $issues[] = 'Campul „' . $label . '” este identic cu cel al produsului „' . (string)($other['name'] ?? '') . '”.';
        }
        if (count($issues) >= 4) break;
    }
    return array_values(array_unique($issues));
}

function seoRepetitionIssues(string $shortDescription, string $metaDescription, string $descriptionHtml): array {
    $issues = [];
    $stopWords = array_fill_keys([
        'acest', 'aceasta', 'această', 'aceste', 'acestea', 'acela', 'aceea', 'care', 'este', 'sunt', 'pentru',
        'prin', 'dintr', 'dintre', 'intr', 'într', 'fara', 'fără', 'dupa', 'după', 'daca', 'dacă', 'cand', 'când',
        'unei', 'unui', 'este', 'fiind', 'poate', 'trebuie', 'foarte', 'mult', 'mai', 'nici', 'doar', 'toate',
        'atunci', 'pana', 'până', 'spre', 'intre', 'între', 'asupra', 'despre', 'inainte', 'înainte', 'produs',
        'produsul', 'trotineta', 'trotinetei', 'electrica', 'electrică', 'anvelopa', 'anvelopă', 'cauciucul',
    ], true);

    foreach (['descrierea scurta' => $shortDescription, 'meta descrierea' => $metaDescription] as $label => $copy) {
        $counts = [];
        foreach (seoCopyTokens($copy) as $token) {
            if (mb_strlen($token) < 5 || isset($stopWords[$token])) continue;
            $counts[$token] = ($counts[$token] ?? 0) + 1;
        }
        foreach ($counts as $token => $count) {
            if ($count > 2) $issues[] = ucfirst($label) . ' repeta excesiv termenul „' . $token . '”.';
        }
    }

    $tokens = seoCopyTokens($descriptionHtml);
    $meaningful = [];
    foreach ($tokens as $token) {
        if (mb_strlen($token) < 5 || isset($stopWords[$token])) continue;
        $meaningful[$token] = ($meaningful[$token] ?? 0) + 1;
    }
    $total = max(1, count($tokens));
    foreach ($meaningful as $token => $count) {
        $density = $count / $total;
        if ($count >= 18 && $density > 0.035) {
            $issues[] = 'Descrierea lunga foloseste prea des termenul „' . $token . '” (' . round($density * 100, 2) . '%).';
        }
    }

    for ($index = 1, $limit = count($tokens); $index < $limit; $index++) {
        if ($tokens[$index] !== $tokens[$index - 1] || mb_strlen($tokens[$index]) < 4) continue;
        $issues[] = 'Descrierea lunga contine termenul duplicat consecutiv „' . $tokens[$index] . '”.';
        break;
    }

    $phrases = [];
    for ($index = 0, $limit = count($tokens) - 5; $index <= $limit; $index++) {
        $phraseTokens = array_slice($tokens, $index, 5);
        if (count(array_filter($phraseTokens, static fn(string $token): bool => preg_match('/^\d+$/', $token) === 1)) === 5) continue;
        $phrase = implode(' ', $phraseTokens);
        $phrases[$phrase] = ($phrases[$phrase] ?? 0) + 1;
    }
    foreach ($phrases as $phrase => $count) {
        if ($count > 3) {
            $issues[] = 'Descrierea lunga repeta de ' . $count . ' ori formularea „' . $phrase . '”.';
            if (count($issues) >= 8) break;
        }
    }
    $issues = array_merge($issues, seoDuplicateSentenceIssues($descriptionHtml));
    return array_values(array_unique($issues));
}

function seoResearchPayload(array $body): array {
    $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 180);
    $shortDescription = trim((string)($body['short_description'] ?? ''));
    $descriptionTitle = mb_substr(trim((string)($body['description_title'] ?? '')), 0, 220);
    $descriptionHtml = cleanRichHtml($body['description_html'] ?? '');
    $metaTitle = mb_substr(trim((string)($body['meta_title'] ?? '')), 0, 180);
    $metaDescription = mb_substr(trim((string)($body['meta_description'] ?? '')), 0, 320);
    if ($name === '') throw new InvalidArgumentException('Titlul SEO al produsului este obligatoriu.');
    if (mb_strlen($shortDescription) < 90 || mb_strlen($shortDescription) > 420) {
        throw new InvalidArgumentException('Descrierea scurta trebuie sa aiba intre 90 si 420 de caractere.');
    }
    if ($descriptionTitle === '') throw new InvalidArgumentException('Titlul descrierii lungi este obligatoriu.');
    $wordCount = seoDescriptionWordCount($descriptionHtml);
    if ($wordCount < 2500 || $wordCount > 3400) {
        throw new InvalidArgumentException('Descrierea lunga trebuie sa aiba intre 2500 si 3400 de cuvinte; continutul primit are ' . $wordCount . '.');
    }
    if (mb_strlen($metaTitle) < 35 || mb_strlen($metaTitle) > 70) {
        throw new InvalidArgumentException('Meta titlul trebuie sa aiba intre 35 si 70 de caractere.');
    }
    if (mb_strlen($metaDescription) < 120 || mb_strlen($metaDescription) > 180) {
        throw new InvalidArgumentException('Meta descrierea trebuie sa aiba intre 120 si 180 de caractere.');
    }
    $repetitionIssues = seoRepetitionIssues($shortDescription, $metaDescription, $descriptionHtml);
    if ($repetitionIssues) {
        throw new InvalidArgumentException('Continutul nu a trecut verificarea anti-repetitie: ' . implode(' ', $repetitionIssues));
    }

    $specifications = [];
    foreach (array_values(is_array($body['specifications'] ?? null) ? $body['specifications'] : []) as $item) {
        if (!is_array($item)) continue;
        $group = mb_substr(trim((string)($item['group'] ?? 'Specificatii')), 0, 100);
        $label = mb_substr(trim((string)($item['label'] ?? '')), 0, 120);
        $value = mb_substr(trim((string)($item['value'] ?? '')), 0, 500);
        if ($label === '' || $value === '') continue;
        $specifications[] = ['group' => $group ?: 'Specificatii', 'label' => $label, 'value' => $value];
        if (count($specifications) >= 60) break;
    }
    if (count($specifications) < 8) throw new InvalidArgumentException('O fisa SEO finalizata trebuie sa aiba minimum 8 specificatii verificate.');

    $questions = [];
    $questionKeys = [];
    foreach (array_values(is_array($body['questions'] ?? null) ? $body['questions'] : []) as $item) {
        if (!is_array($item)) continue;
        $question = mb_substr(trim((string)($item['question'] ?? '')), 0, 320);
        $answer = mb_substr(trim((string)($item['answer'] ?? '')), 0, 1600);
        if ($question === '' || $answer === '') continue;
        $key = mb_strtolower(preg_replace('/\s+/u', ' ', $question) ?? $question);
        if (isset($questionKeys[$key])) continue;
        if (mb_strlen($question) < 18 || mb_strlen($answer) < 60) {
            throw new InvalidArgumentException('Intrebarile si raspunsurile SEO trebuie sa fie complete si utile clientului.');
        }
        $questionKeys[$key] = true;
        $questions[] = ['question' => $question, 'answer' => $answer];
        if (count($questions) >= 8) break;
    }
    if (count($questions) < 5) throw new InvalidArgumentException('O fisa SEO finalizata trebuie sa aiba intre 5 si 8 intrebari specifice produsului.');

    $sources = [];
    foreach (array_values(is_array($body['research_sources'] ?? null) ? $body['research_sources'] : []) as $source) {
        if (is_array($source)) {
            $url = trim((string)($source['url'] ?? ''));
            $label = mb_substr(trim((string)($source['label'] ?? '')), 0, 180);
        } else {
            $url = trim((string)$source);
            $label = '';
        }
        if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https://#i', $url)) continue;
        $sources[$url] = ['url' => mb_substr($url, 0, 1000), 'label' => $label];
        if (count($sources) >= 15) break;
    }
    if (count($sources) < 2) throw new InvalidArgumentException('Salveaza minimum doua surse folosite in cercetarea produsului.');

    $compatibilities = [];
    foreach (array_values(is_array($body['compatibility_names'] ?? null) ? $body['compatibility_names'] : []) as $nameValue) {
        $compatibility = mb_substr(trim((string)$nameValue), 0, 120);
        if ($compatibility !== '') $compatibilities[mb_strtolower($compatibility)] = $compatibility;
    }
    $imageAltTexts = [];
    foreach (array_values(is_array($body['image_alt_texts'] ?? null) ? $body['image_alt_texts'] : []) as $altValue) {
        $alt = mb_substr(trim((string)$altValue), 0, 180);
        if ($alt !== '') $imageAltTexts[] = $alt;
        if (count($imageAltTexts) >= 12) break;
    }
    if (!$imageAltTexts) throw new InvalidArgumentException('Adauga texte alternative specifice pentru imaginile produsului.');

    return [
        'name' => $name,
        'slug_source' => trim((string)($body['slug'] ?? '')) ?: $name,
        'short_description' => $shortDescription,
        'description_title' => $descriptionTitle,
        'description_html' => $descriptionHtml,
        'meta_title' => $metaTitle,
        'meta_description' => $metaDescription,
        'specifications_json' => json_encode($specifications, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'questions_json' => json_encode($questions, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'sources_json' => json_encode(array_values($sources), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'compatibility_names' => array_values($compatibilities),
        'image_alt_texts' => $imageAltTexts,
        'word_count' => $wordCount,
    ];
}

function seoProductRemainsReady(array $payload, ?PDO $db = null, string $productId = ''): bool {
    $wordCount = seoDescriptionWordCount((string)($payload['description_html'] ?? ''));
    $questions = json_decode((string)($payload['questions_json'] ?? ''), true);
    $specifications = json_decode((string)($payload['specifications_json'] ?? ''), true);
    $shortLength = mb_strlen(trim((string)($payload['short_description'] ?? '')));
    $metaTitleLength = mb_strlen(trim((string)($payload['meta_title'] ?? '')));
    $metaDescriptionLength = mb_strlen(trim((string)($payload['meta_description'] ?? '')));
    if ($wordCount < 2500 || $wordCount > 3400) return false;
    if (!is_array($questions) || count($questions) < 5 || count($questions) > 8) return false;
    if (!is_array($specifications) || count($specifications) < 8) return false;
    if ($shortLength < 90 || $shortLength > 420) return false;
    if ($metaTitleLength < 35 || $metaTitleLength > 70) return false;
    if ($metaDescriptionLength < 120 || $metaDescriptionLength > 180) return false;
    if (seoRepetitionIssues(
        (string)$payload['short_description'],
        (string)$payload['meta_description'],
        (string)$payload['description_html']
    ) !== []) return false;
    return $db === null || seoCrossProductIssues($db, $productId, $payload) === [];
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

function orderStatusHistory(PDO $db, string $orderId): array {
    $stmt = $db->prepare('SELECT * FROM shop_order_status_history WHERE order_id = ? ORDER BY created_at ASC, id ASC');
    $stmt->execute([$orderId]);
    return array_map(function (array $entry): array {
        $entry['customer_notified'] = (bool)$entry['customer_notified'];
        return $entry;
    }, $stmt->fetchAll());
}

function recordOrderStatusHistory(PDO $db, string $orderId, ?string $fromStatus, string $toStatus, string $changedBy, string $emailStatus = 'not_requested'): string {
    $id = uuidV4();
    $stmt = $db->prepare('INSERT INTO shop_order_status_history (id, order_id, from_status, to_status, changed_by, customer_notified, email_status) VALUES (?, ?, ?, ?, ?, 0, ?)');
    $stmt->execute([$id, $orderId, $fromStatus, $toStatus, mb_substr($changedBy, 0, 180), $emailStatus]);
    return $id;
}

function updateOrderHistoryEmail(PDO $db, string $historyId, array $result): void {
    try {
        $sent = (bool)($result['sent'] ?? false);
        $error = $sent ? null : mb_substr((string)($result['error'] ?? 'Trimiterea e-mailului a eșuat.'), 0, 500);
        $stmt = $db->prepare('UPDATE shop_order_status_history SET customer_notified = ?, email_status = ?, email_error = ? WHERE id = ?');
        $stmt->execute([$sent ? 1 : 0, $sent ? 'sent' : 'failed', $error, $historyId]);
    } catch (Throwable $error) {
        // O problemă de jurnalizare nu trebuie să invalideze o comandă sau o plată deja salvată.
        error_log('[G-Trots order email history] ' . $error->getMessage());
    }
}

function orderRow(PDO $db, array $row, ?array $config = null, bool $withHistory = false): array {
    $items = $db->prepare(
        'SELECT oi.*,
                p.slug AS product_slug,
                (SELECT image_path FROM shop_product_images pi WHERE pi.product_id = oi.product_id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image_path
         FROM shop_order_items oi
         LEFT JOIN shop_products p ON p.id = oi.product_id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC'
    );
    $items->execute([(string)$row['id']]);
    $row['items'] = array_map(function (array $item) use ($config): array {
        $item['quantity'] = (int)$item['quantity'];
        $item['unit_price'] = (float)$item['unit_price'];
        $item['line_total'] = (float)$item['line_total'];
        $imagePath = trim((string)($item['image_path'] ?? ''));
        $item['image_url'] = $imagePath !== '' && $config
            ? (preg_match('#^https?://#i', $imagePath) ? $imagePath : rtrim((string)$config['public_base_url'], '/') . '/' . ltrim($imagePath, '/'))
            : ($config ? legacyProductImageUrl(['slug' => (string)($item['product_slug'] ?? '')], $config) : '');
        unset($item['image_path']);
        unset($item['product_slug']);
        return $item;
    }, $items->fetchAll());
    $row['subtotal'] = (float)$row['subtotal'];
    $row['shipping_cost'] = (float)$row['shipping_cost'];
    $row['total'] = (float)$row['total'];
    if ($withHistory) $row['status_history'] = orderStatusHistory($db, (string)$row['id']);
    return $row;
}

function publicTrackingOrder(array $order): array {
    $items = array_map(fn(array $item): array => [
        'product_name' => (string)($item['product_name'] ?? ''),
        'product_sku' => (string)($item['product_sku'] ?? ''),
        'quantity' => (int)($item['quantity'] ?? 0),
        'unit_price' => (float)($item['unit_price'] ?? 0),
        'line_total' => (float)($item['line_total'] ?? 0),
        'image_url' => (string)($item['image_url'] ?? ''),
    ], (array)($order['items'] ?? []));
    $history = array_map(fn(array $entry): array => [
        'to_status' => (string)($entry['to_status'] ?? ''),
        'created_at' => (string)($entry['created_at'] ?? ''),
    ], (array)($order['status_history'] ?? []));
    return [
        'order_number' => (string)$order['order_number'],
        'status' => (string)$order['status'],
        'status_label' => (string)gtOrderStatusMeta((string)$order['status'])['label'],
        'payment_status' => (string)$order['payment_status'],
        'payment_method' => (string)$order['payment_method'],
        'shipping_method_name' => (string)$order['shipping_method_name'],
        'subtotal' => (float)$order['subtotal'],
        'shipping_cost' => (float)$order['shipping_cost'],
        'total' => (float)$order['total'],
        'currency' => (string)$order['currency'],
        'items' => $items,
        'status_history' => $history,
        'created_at' => (string)$order['created_at'],
        'updated_at' => (string)$order['updated_at'],
    ];
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
        // Orice comandă abia primită este nouă; Stripe o confirmă automat numai după plata reușită.
        $initialStatus = 'new';
        $trackingToken = bin2hex(random_bytes(24));
        $insertOrder = $db->prepare('INSERT INTO shop_orders (id, order_number, status, payment_status, payment_method, customer_name, customer_email, customer_phone, address, city, county, postal_code, customer_notes, shipping_method_id, shipping_method_name, subtotal, shipping_cost, total, currency, tracking_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $insertOrder->execute([
            $orderId, $orderNumber, $initialStatus, 'pending', $paymentMethod, $name,
            $customerEmail ?: null, $phone, $address, $city,
            mb_substr(trim((string)($body['county'] ?? '')), 0, 120) ?: null,
            mb_substr(trim((string)($body['postal_code'] ?? '')), 0, 30) ?: null,
            mb_substr(trim((string)($body['customer_notes'] ?? '')), 0, 3000) ?: null,
            $shippingId, (string)$shipping['name'], $subtotal, $shippingCost, $total, 'RON', $trackingToken
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
        $historyId = recordOrderStatusHistory(
            $db,
            $orderId,
            null,
            $initialStatus,
            'Magazin online',
            $paymentMethod === 'cash_on_delivery' ? 'pending' : 'not_requested'
        );
        $db->commit();
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ?');
        $stmt->execute([$orderId]);
        $order = orderRow($db, $stmt->fetch(), $config, true);
        if ($paymentMethod === 'cash_on_delivery') {
            $emailResult = gtSendOrderStatusEmail($order, $config, $initialStatus);
            updateOrderHistoryEmail($db, $historyId, $emailResult);
            $order['email_notification'] = $emailResult;
            $order['status_history'] = orderStatusHistory($db, $orderId);
        }
        return $order;
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

    if (in_array($action, ['publicProducts', 'publicProduct', 'publicShopConfig', 'productManagerBootstrap', 'listProducts', 'listInventory', 'getDashboardStats'], true)) {
        gomagMaybeSyncSupplierStock($db, $config);
    }

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
        $sql = productSelectSql() . ' WHERE ' . implode(' AND ', $where) . ' ORDER BY p.is_featured DESC, p.created_at DESC LIMIT 2500';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        jsonResponse(productRows($db, $stmt->fetchAll(), $config, false, false));
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

    if ($action === 'publicTrackOrder' && $method === 'GET') {
        $token = strtolower(trim((string)($_GET['token'] ?? '')));
        $orderNumber = strtoupper(trim((string)($_GET['order_number'] ?? '')));
        $email = strtolower(trim((string)($_GET['email'] ?? '')));
        if ($token !== '') {
            if (!preg_match('/^[a-f0-9]{32,64}$/', $token)) throw new InvalidArgumentException('Linkul de urmărire nu este valid.');
            $stmt = $db->prepare('SELECT * FROM shop_orders WHERE tracking_token = ? LIMIT 1');
            $stmt->execute([$token]);
        } else {
            if ($orderNumber === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('Completează codul comenzii și adresa de e-mail folosită la comandă.');
            }
            $stmt = $db->prepare('SELECT * FROM shop_orders WHERE UPPER(order_number) = ? AND LOWER(customer_email) = ? LIMIT 1');
            $stmt->execute([$orderNumber, $email]);
        }
        $order = $stmt->fetch();
        if (!$order) jsonResponse(['error' => 'Nu am găsit o comandă pentru datele introduse. Verifică informațiile și încearcă din nou.'], 404);
        jsonResponse(publicTrackingOrder(orderRow($db, $order, $config, true)));
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
        $order = stripeApplyCheckoutSession($db, $session, $config);
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
                stripeApplyCheckoutSession($db, $session, $config);
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

    if ($action === 'importBoomagProductsBatch' && $method === 'POST') {
        verifyBoomagImportKey($config, $body);
        set_time_limit(0);
        $offset = max(0, (int)($body['offset'] ?? 0));
        $limit = max(1, min(10, (int)($body['limit'] ?? 5)));
        $forceRefresh = !empty($body['force_feed_refresh']) && $offset === 0;
        jsonResponse(boomagImportProductsBatch($db, $config, $offset, $limit, $forceRefresh));
    }

    if ($action === 'auditBoomagImport' && in_array($method, ['GET', 'POST'], true)) {
        verifyBoomagImportKey($config, $body);
        jsonResponse(boomagImportAudit($db, $config));
    }

    if ($action === 'saveBoomagSeoProduct' && $method === 'POST') {
        verifyBoomagImportKey($config, $body);
        $id = trim((string)($body['id'] ?? ''));
        $externalId = trim((string)($body['supplier_external_id'] ?? ''));
        $stmt = $db->prepare(
            "SELECT p.* FROM shop_products p
             INNER JOIN shop_product_sources s ON s.id = p.source_id
             WHERE LOWER(s.domain) = 'boomag.ro' AND ((? <> '' AND p.id = ?) OR (? <> '' AND p.supplier_external_id = ?))
             LIMIT 1"
        );
        $stmt->execute([$id, $id, $externalId, $externalId]);
        $current = $stmt->fetch();
        if (!$current) jsonResponse(['error' => 'Produsul Boomag nu a fost gasit.'], 404);
        $payload = seoResearchPayload($body);
        if (mb_strtolower(trim($payload['name'])) !== mb_strtolower(trim((string)$current['name']))) {
            ensureUniqueProductName($db, $payload['name'], (string)$current['id']);
        }
        $crossProductIssues = seoCrossProductIssues($db, (string)$current['id'], $payload);
        if ($crossProductIssues) {
            throw new InvalidArgumentException('Continutul nu este suficient de unic fata de celelalte produse: ' . implode(' ', $crossProductIssues));
        }

        $brandIds = [];
        foreach ($payload['compatibility_names'] as $compatibility) {
            $brandId = boomagFindOrCreateTaxonomy($db, 'shop_brands', 'compatibility', $compatibility);
            if ($brandId !== null) $brandIds[] = $brandId;
        }
        $db->beginTransaction();
        try {
            $update = $db->prepare(
                'UPDATE shop_products SET name = ?, slug = ?, short_description = ?, description_title = ?, description_html = ?, specifications_json = ?, questions_json = ?, meta_title = ?, meta_description = ?, content_status = "seo", seo_researched_at = NOW(), seo_word_count = ?, seo_sources_json = ? WHERE id = ?'
            );
            $update->execute([
                $payload['name'], uniqueSlug($db, 'shop_products', $payload['slug_source'], (string)$current['id']),
                $payload['short_description'], $payload['description_title'], $payload['description_html'],
                $payload['specifications_json'], $payload['questions_json'], $payload['meta_title'], $payload['meta_description'],
                $payload['word_count'], $payload['sources_json'], (string)$current['id'],
            ]);
            syncProductBrands($db, (string)$current['id'], array_values(array_unique($brandIds)));
            $imageStmt = $db->prepare('SELECT id FROM shop_product_images WHERE product_id = ? ORDER BY sort_order ASC, created_at ASC');
            $imageStmt->execute([(string)$current['id']]);
            $imageIds = array_values(array_map('strval', $imageStmt->fetchAll(PDO::FETCH_COLUMN)));
            $updateAlt = $db->prepare('UPDATE shop_product_images SET alt_text = ? WHERE id = ? AND product_id = ?');
            foreach ($imageIds as $imageIndex => $imageId) {
                $alt = $payload['image_alt_texts'][$imageIndex] ?? ($payload['name'] . ' - fotografia ' . ($imageIndex + 1));
                $updateAlt->execute([$alt, $imageId, (string)$current['id']]);
            }
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $stripeSync = stripeSyncProductSafe($db, $config, (string)$current['id']);
        $product = findProduct($db, (string)$current['id'], $config, false);
        $product['stripe_sync'] = $stripeSync;
        jsonResponse($product);
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
             WHERE oi.product_id = ?
               AND o.status NOT IN ("cancelled", "refunded")
               AND o.payment_status = "paid"'
        );
        $summary->execute([$product['id']]);
        $sales = $summary->fetch() ?: [];
        $orders = $db->prepare(
            'SELECT o.id, o.order_number, o.status, o.payment_status, o.customer_name, o.created_at,
                    oi.quantity, oi.unit_price, oi.line_total
             FROM shop_order_items oi
             INNER JOIN shop_orders o ON o.id = oi.order_id
             WHERE oi.product_id = ?
             ORDER BY o.created_at DESC'
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
                    COALESCE(SUM(CASE
                        WHEN o.payment_status = "paid" AND o.status NOT IN ("cancelled", "refunded") THEN oi.line_total
                        ELSE 0
                    END), 0) AS revenue,
                    COALESCE(SUM(CASE
                        WHEN o.payment_status = "paid" AND o.status NOT IN ("cancelled", "refunded") THEN oi.quantity * COALESCE(p.cost_price, 0)
                        ELSE 0
                    END), 0) AS acquisitions
             FROM shop_orders o
             LEFT JOIN shop_order_items oi ON oi.order_id = o.id
             LEFT JOIN shop_products p ON p.id = oi.product_id'
        )->fetch() ?: [];
        $recentRows = $db->query('SELECT * FROM shop_orders WHERE status = "new" ORDER BY created_at DESC LIMIT 8')->fetchAll();
        $revenue = round((float)($summary['revenue'] ?? 0), 2);
        $acquisitions = round((float)($summary['acquisitions'] ?? 0), 2);
        jsonResponse([
            'revenue' => $revenue,
            'orders_count' => (int)($summary['orders_count'] ?? 0),
            'new_orders_count' => (int)($summary['new_orders_count'] ?? 0),
            'acquisitions' => $acquisitions,
            'profit' => round($revenue - $acquisitions, 2),
            'products_count' => (int)$db->query('SELECT COUNT(*) FROM shop_products')->fetchColumn(),
            'recent_orders' => array_map(fn(array $row): array => orderRow($db, $row, $config), $recentRows),
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
            'products' => productRows($db, $products, $config, false),
            'categories' => array_map(fn(array $row): array => categoryRow($row, $config), $categories),
            'brands' => array_map('brandRow', $brands),
            'manufacturers' => array_map('brandRow', $manufacturers),
            'sources' => array_map('sourceRow', $sources),
        ]);
    }

    if ($action === 'syncBoomagTaxonomy' && $method === 'POST') {
        set_time_limit(0);
        jsonResponse(gomagSyncTaxonomy($db, $config));
    }

    if ($action === 'syncBoomagStock' && $method === 'POST') {
        set_time_limit(0);
        jsonResponse(gomagSyncSupplierStock($db, $config));
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
        jsonResponse(productRows($db, $rows, $config, false));
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
            $productSku = uniqueProductSku($db, $payload['sku'] ?? generatedProductSku($payload['name'], $payload['source_domain']));
            $stmt = $db->prepare('INSERT INTO shop_products (id, category_id, manufacturer_id, source_id, sku, supplier_product_code, ean, source_domain, source_url, name, slug, short_description, description_title, description_html, specifications_json, questions_json, meta_title, meta_description, cost_price, price, sale_price, discount_type, discount_value, currency, stock_mode, stock_quantity, low_stock_threshold, is_active, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $id, $payload['category_id'], $payload['manufacturer_id'], $payload['source_id'], $productSku, $payload['supplier_product_code'], $payload['ean'], $payload['source_domain'], $payload['source_url'],
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
        if (mb_strtolower(trim((string)$payload['source_domain'])) === 'boomag.ro') {
            $payload['stock_mode'] = 'tracked';
            $payload['stock_quantity'] = (int)($current['supplier_stock_quantity'] ?? $current['stock_quantity'] ?? 0);
        }
        $removedDescriptionImages = array_diff(
            richDescriptionImagePaths((string)($current['description_html'] ?? '')),
            richDescriptionImagePaths((string)$payload['description_html'])
        );
        if (mb_strtolower(trim($payload['name'])) !== mb_strtolower(trim((string)$current['name']))) {
            ensureUniqueProductName($db, $payload['name'], $id);
        }
        $nextContentStatus = (string)($current['content_status'] ?? '') === 'seo' && seoProductRemainsReady($payload, $db, $id)
            ? 'seo'
            : 'manual';
        $db->beginTransaction();
        try {
            $productSku = trim((string)($current['sku'] ?? '')) !== ''
                ? (string)$current['sku']
                : uniqueProductSku($db, $payload['sku'] ?? generatedProductSku($payload['name'], $payload['source_domain']), $id);
            $stmt = $db->prepare('UPDATE shop_products SET category_id = ?, manufacturer_id = ?, source_id = ?, sku = ?, supplier_product_code = ?, ean = ?, source_domain = ?, source_url = ?, name = ?, slug = ?, short_description = ?, description_title = ?, description_html = ?, specifications_json = ?, questions_json = ?, meta_title = ?, meta_description = ?, cost_price = ?, price = ?, sale_price = ?, discount_type = ?, discount_value = ?, currency = ?, stock_mode = ?, stock_quantity = ?, low_stock_threshold = ?, is_active = ?, is_featured = ?, content_status = ? WHERE id = ?');
            $stmt->execute([
                $payload['category_id'], $payload['manufacturer_id'], $payload['source_id'], $productSku, $payload['supplier_product_code'], $payload['ean'], $payload['source_domain'], $payload['source_url'],
                $payload['name'], uniqueSlug($db, 'shop_products', $payload['slug_source'], $id), $payload['short_description'], $payload['description_title'], $payload['description_html'], $payload['specifications_json'], $payload['questions_json'],
                $payload['meta_title'], $payload['meta_description'], $payload['cost_price'], $payload['price'], $payload['sale_price'], $payload['discount_type'], $payload['discount_value'], $payload['currency'],
                $payload['stock_mode'], $payload['stock_quantity'], $payload['low_stock_threshold'], $payload['is_active'] ? 1 : 0, $payload['is_featured'] ? 1 : 0, $nextContentStatus, $id
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
        $verifyStmt = $db->prepare('SELECT COUNT(*) FROM shop_products WHERE id = ?');
        $verifyStmt->execute([$id]);
        if ((int)$verifyStmt->fetchColumn() !== 0) {
            throw new RuntimeException('Produsul nu a fost eliminat complet din catalog.');
        }
        jsonResponse([
            'success' => true,
            'deleted_id' => $id,
            'deleted_files' => $deletedFiles,
            'remaining_products' => (int)$db->query('SELECT COUNT(*) FROM shop_products')->fetchColumn(),
        ]);
    }

    if ($action === 'listInventory' && $method === 'GET') {
        $rows = $db->query(productSelectSql() . ' ORDER BY (p.stock_mode = "tracked" AND p.stock_quantity <= p.low_stock_threshold) DESC, p.name ASC')->fetchAll();
        jsonResponse(productRows($db, $rows, $config, false));
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
            if (mb_strtolower(trim((string)($product['source_domain'] ?? ''))) === 'boomag.ro') {
                throw new InvalidArgumentException('Stocul online al produselor Boomag este preluat automat din stocul furnizorului si nu poate fi modificat manual.');
            }
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
        jsonResponse(array_map(fn(array $row): array => orderRow($db, $row, $config), $rows));
    }

    if ($action === 'getOrder' && $method === 'GET') {
        $id = trim((string)($_GET['id'] ?? ''));
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? OR order_number = ? LIMIT 1');
        $stmt->execute([$id, $id]);
        $row = $stmt->fetch();
        if (!$row) jsonResponse(['error' => 'Comanda nu exista.'], 404);
        jsonResponse(orderRow($db, $row, $config, true));
    }

    if ($action === 'updateOrder' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $statuses = ['new', 'confirmed', 'processing', 'shipped', 'completed', 'refunded', 'cancelled'];
        $paymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
        $status = trim((string)($body['status'] ?? ''));
        $paymentStatus = trim((string)($body['payment_status'] ?? ''));
        $notifyCustomer = boolValue($body['notify_customer'] ?? false);
        if (!in_array($status, $statuses, true) || !in_array($paymentStatus, $paymentStatuses, true)) throw new InvalidArgumentException('Statusul comenzii nu este valid.');
        $historyId = null;
        $statusChanged = false;
        $db->beginTransaction();
        try {
            $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $current = $stmt->fetch();
            if (!$current) throw new InvalidArgumentException('Comanda nu exista.');
            $address = trim((string)($body['address'] ?? $current['address'] ?? ''));
            $city = trim((string)($body['city'] ?? $current['city'] ?? ''));
            $county = trim((string)($body['county'] ?? $current['county'] ?? ''));
            $postalCode = trim((string)($body['postal_code'] ?? $current['postal_code'] ?? ''));
            if ($address === '' || $city === '' || $county === '') {
                throw new InvalidArgumentException('Adresa, localitatea și județul sunt obligatorii pentru livrare.');
            }
            $mainStatusFlow = ['new', 'confirmed', 'processing', 'shipped', 'completed'];
            $terminalStatuses = ['refunded', 'cancelled'];
            $currentStatus = (string)$current['status'];
            if ($status !== $currentStatus && in_array($currentStatus, $terminalStatuses, true)) {
                throw new InvalidArgumentException('O comandă rambursată sau anulată nu mai poate reveni în fluxul de procesare.');
            }
            $currentIndex = array_search($currentStatus, $mainStatusFlow, true);
            $nextIndex = array_search($status, $mainStatusFlow, true);
            if ($status !== $currentStatus && $currentIndex !== false && $nextIndex !== false && $nextIndex < $currentIndex) {
                throw new InvalidArgumentException('Statusul comenzii nu poate reveni la o etapă anterioară.');
            }
            if ($status === 'refunded') $paymentStatus = 'refunded';
            $statusChanged = $status !== (string)$current['status'];
            if (in_array($status, $terminalStatuses, true) && !in_array($currentStatus, $terminalStatuses, true)) {
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
                    $movementNote = $status === 'refunded' ? 'Stoc returnat prin rambursarea comenzii' : 'Stoc returnat prin anularea comenzii';
                    $movement->execute([uuidV4(), $product['id'], $id, 'return', (int)$item['quantity'], $next, $movementNote, (string)($currentUser['display_name'] ?? $currentUser['username'] ?? '')]);
                }
            }
            $update = $db->prepare('UPDATE shop_orders SET status = ?, payment_status = ?, admin_notes = ?, address = ?, city = ?, county = ?, postal_code = ? WHERE id = ?');
            $update->execute([$status, $paymentStatus, mb_substr(trim((string)($body['admin_notes'] ?? '')), 0, 5000), $address, $city, $county, $postalCode, $id]);
            if ($statusChanged) {
                $historyId = recordOrderStatusHistory(
                    $db,
                    $id,
                    (string)$current['status'],
                    $status,
                    (string)($currentUser['display_name'] ?? $currentUser['username'] ?? 'Administrator'),
                    $notifyCustomer ? 'pending' : 'not_requested'
                );
            }
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ?');
        $stmt->execute([$id]);
        $order = orderRow($db, $stmt->fetch(), $config, true);
        if ($notifyCustomer && $statusChanged && $historyId) {
            $emailResult = gtSendOrderStatusEmail($order, $config, $status);
            updateOrderHistoryEmail($db, $historyId, $emailResult);
            $order['email_notification'] = array_merge(['requested' => true], $emailResult);
            $order['status_history'] = orderStatusHistory($db, $id);
        } elseif ($notifyCustomer) {
            $order['email_notification'] = [
                'requested' => true,
                'sent' => false,
                'error' => 'Statusul comenzii nu s-a schimbat, deci clientul nu a fost notificat.',
            ];
        } else {
            $order['email_notification'] = ['requested' => false, 'sent' => false];
        }
        jsonResponse($order);
    }

    if ($action === 'getPaymentSettings' && $method === 'GET') jsonResponse(paymentSettings($db, $config));

    if ($action === 'syncStripeCatalog' && $method === 'POST') {
        jsonResponse(stripeSyncCatalog($db, $config));
    }

    if ($action === 'updatePaymentSettings' && in_array($method, ['PUT', 'PATCH'], true)) {
        $cardEnabled = boolValue($body['card_enabled'] ?? false);
        $codEnabled = boolValue($body['cash_on_delivery_enabled'] ?? true, true);
        if (!$cardEnabled && !$codEnabled) throw new InvalidArgumentException('Activeaza cel putin o metoda de plata.');
        $stmt = $db->prepare('INSERT INTO shop_payment_settings (id, card_enabled, cash_on_delivery_enabled, card_label, cash_on_delivery_label) VALUES (1, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE card_enabled = VALUES(card_enabled), cash_on_delivery_enabled = VALUES(cash_on_delivery_enabled), card_label = VALUES(card_label), cash_on_delivery_label = VALUES(cash_on_delivery_label)');
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
