<?php
declare(strict_types=1);

require_once __DIR__ . '/invoice-theme.php';

$shopRequestStartedAt = microtime(true);

date_default_timezone_set('Europe/Bucharest');

ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Auth-Token, X-Import-Key, X-Customer-Token, X-Shop-Device, Authorization, Idempotency-Key');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require_once __DIR__ . '/order-emails.php';
require_once __DIR__ . '/invoice-service.php';
require_once __DIR__ . '/invoice-automation.php';
require_once __DIR__ . '/spv-service.php';
require_once __DIR__ . '/stripe.php';
require_once __DIR__ . '/order-cancellation.php';
require_once __DIR__ . '/order-return.php';
require_once __DIR__ . '/order-return-confirmation.php';
require_once __DIR__ . '/gomag.php';
require_once __DIR__ . '/nir-domain.php';
require_once __DIR__ . '/nir-service.php';
$nirBundlePath = __DIR__ . '/nir-bundle.php';
if (is_file($nirBundlePath) && filesize($nirBundlePath) > 0) require_once $nirBundlePath;

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
        'auth_db_name' => '',
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
        // Client IDs are public identifiers used by Google Identity Services.
        // The OAuth client secret is intentionally never stored in this application.
        'google_client_id' => '540664392313-id3lsk8ah1u9j8k5oagt3153t62albqp.apps.googleusercontent.com',
        // Secretele OAuth ANAF se definesc numai în config.local.php pe server.
        // Nu sunt expuse niciodată aplicațiilor mobile/desktop.
        'anaf_oauth_client_id' => '',
        'anaf_oauth_client_secret' => '',
        'spv_encryption_key' => '',
        'anaf_oauth_callback_url' => 'https://g-trots.ro/shop-api/anaf-oauth-callback.php',
        'anaf_oauth_authorize_url' => 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize',
        'anaf_oauth_token_url' => 'https://logincert.anaf.ro/anaf-oauth2/v1/token',
        'anaf_oauth_revoke_url' => 'https://logincert.anaf.ro/anaf-oauth2/v1/revoke',
        'anaf_oauth_test_url' => 'https://api.anaf.ro/TestOauth/jaxrs/hello?name=G-Trots',
        'anaf_invoice_validation_url' => 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1',
        'anaf_credit_note_validation_url' => 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FCN',
        // Gateway-ul OAuth/Bearer. webserviceapl.anaf.ro cere certificatul
        // client la fiecare apel (mTLS) și nu este compatibil cu tokenul OAuth.
        'anaf_efactura_test_url' => 'https://api.anaf.ro/test/FCTEL/rest',
        'anaf_efactura_production_url' => 'https://api.anaf.ro/prod/FCTEL/rest',
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
                'auth_db_name' => (string)($shared['db_name'] ?? ''),
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
    $encodingStartedAt = microtime(true);
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
    if (isset($GLOBALS['shopPublicCatalogResponseTiming'])) {
        $responseTiming = $GLOBALS['shopPublicCatalogResponseTiming'];
        header(sprintf(
            'Server-Timing: shape;dur=%.1f, encode;dur=%.1f',
            (float)($responseTiming['shape'] ?? 0),
            (microtime(true) - $encodingStartedAt) * 1000
        ), false);
    }
    echo $json;
    exit;
}

function scheduleSupplierStockSyncAfterResponse(PDO $db, array $config): void {
    // Pe hosting-ul PHP-FPM trimitem mai intai catalogul catre client, apoi lasam
    // sincronizarea periodica Boomag sa ruleze in fundal. Astfel prima afisare a
    // magazinului nu mai asteapta dupa furnizor.
    if (!function_exists('fastcgi_finish_request')) return;
    register_shutdown_function(static function () use ($db, $config): void {
        fastcgi_finish_request();
        ignore_user_abort(true);
        @set_time_limit(120);
        try {
            gomagMaybeSyncSupplierStock($db, $config);
        } catch (Throwable $error) {
            error_log('Sincronizarea Boomag de dupa raspuns a esuat: ' . $error->getMessage());
        }
    });
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

    ensureShopSchemaIsCurrent($db);
    return $db;
}

/**
 * Schema migrations are intentionally expensive (many metadata checks). Running
 * them for every mobile API request made simple catalog screens wait seconds.
 * Keep one tiny version check per request and execute the full migration only
 * after an actual schema version bump.
 */
function ensureShopSchemaIsCurrent(PDO $db): void {
    $schemaVersion = 2026090404;
    // Ruta normala face doar SELECT-ul indexat. Un CREATE TABLE IF NOT EXISTS la
    // fiecare request tot cere verificari de metadata si poate astepta lock-uri.
    try {
        $stmt = $db->prepare('SELECT meta_value FROM shop_schema_meta WHERE meta_key = ? LIMIT 1');
        $stmt->execute(['schema_version']);
    } catch (PDOException $error) {
        $db->exec(
            "CREATE TABLE IF NOT EXISTS shop_schema_meta (
                meta_key VARCHAR(80) NOT NULL PRIMARY KEY,
                meta_value VARCHAR(120) NOT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $stmt = $db->prepare('SELECT meta_value FROM shop_schema_meta WHERE meta_key = ? LIMIT 1');
        $stmt->execute(['schema_version']);
    }
    if ((int)$stmt->fetchColumn() >= $schemaVersion) return;

    $lockName = 'g-trots-shop-schema-migration';
    $lock = $db->prepare('SELECT GET_LOCK(?, 15)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('Actualizarea bazei SHOP este ocupată. Reîncearcă imediat.');
    try {
        $stmt->execute(['schema_version']);
        if ((int)$stmt->fetchColumn() < $schemaVersion) {
            ensureShopSchema($db);
            $save = $db->prepare(
                'INSERT INTO shop_schema_meta (meta_key, meta_value) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)'
            );
            $save->execute(['schema_version', (string)$schemaVersion]);
        }
    } finally {
        $release = $db->prepare('SELECT RELEASE_LOCK(?)');
        $release->execute([$lockName]);
    }
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
            supplier_base_price DECIMAL(12,2) NULL,
            supplier_price_difference DECIMAL(12,2) NULL,
            supplier_price_updated_at DATETIME NULL,
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
            featured_rank INT UNSIGNED NULL,
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
            INDEX idx_shop_products_featured (is_featured, featured_rank),
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
    $supplierPriceColumns = [
        'supplier_base_price' => 'DECIMAL(12,2) NULL AFTER price',
        'supplier_price_difference' => 'DECIMAL(12,2) NULL AFTER supplier_base_price',
        'supplier_price_updated_at' => 'DATETIME NULL AFTER supplier_price_difference',
    ];
    foreach ($supplierPriceColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_products LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_products ADD COLUMN {$column} {$definition}");
        }
    }
    $viewCountColumn = $db->query("SHOW COLUMNS FROM shop_products LIKE 'view_count'")->fetch();
    if (!$viewCountColumn) {
        $db->exec('ALTER TABLE shop_products ADD COLUMN view_count BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER is_featured');
    }
    if (!$db->query("SHOW COLUMNS FROM shop_products LIKE 'featured_rank'")->fetch()) {
        $db->exec('ALTER TABLE shop_products ADD COLUMN featured_rank INT UNSIGNED NULL AFTER is_featured');
    }
    $accountingStockColumn = $db->query("SHOW COLUMNS FROM shop_products LIKE 'accounting_stock_quantity'")->fetch();
    if (!$accountingStockColumn) {
        $db->exec('ALTER TABLE shop_products ADD COLUMN accounting_stock_quantity DECIMAL(18,4) NOT NULL DEFAULT 0 AFTER stock_quantity');
        $db->exec('UPDATE shop_products SET accounting_stock_quantity = stock_quantity WHERE stock_mode = "tracked"');
    } elseif (stripos((string)($accountingStockColumn['Type'] ?? ''), 'decimal') === false) {
        $db->exec('ALTER TABLE shop_products MODIFY accounting_stock_quantity DECIMAL(18,4) NOT NULL DEFAULT 0');
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
    if (!$db->query("SHOW INDEX FROM shop_products WHERE Key_name = 'idx_shop_products_featured'")->fetch()) {
        $db->exec('ALTER TABLE shop_products ADD INDEX idx_shop_products_featured (is_featured, featured_rank)');
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
            return_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
            free_above DECIMAL(12,2) NULL,
            eta_label VARCHAR(120) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_shipping_active (is_active, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    if (!$db->query("SHOW COLUMNS FROM shop_shipping_methods LIKE 'return_cost'")->fetch()) {
        $db->exec("ALTER TABLE shop_shipping_methods ADD COLUMN return_cost DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER cost");
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_suppliers (
            id CHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(180) NOT NULL,
            alias VARCHAR(180) NOT NULL,
            contact_person VARCHAR(180) NULL,
            email VARCHAR(180) NULL,
            phone VARCHAR(50) NULL,
            website VARCHAR(255) NULL,
            cui VARCHAR(60) NULL,
            registration_number VARCHAR(80) NULL,
            address VARCHAR(255) NULL,
            notes TEXT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_suppliers_active (is_active, name),
            INDEX idx_shop_suppliers_name (name),
            INDEX idx_shop_suppliers_alias (alias)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    if (!$db->query("SHOW COLUMNS FROM shop_suppliers LIKE 'registration_number'")->fetch()) {
        $db->exec("ALTER TABLE shop_suppliers ADD COLUMN registration_number VARCHAR(80) NULL AFTER cui");
    }
    if (!$db->query("SHOW COLUMNS FROM shop_suppliers LIKE 'alias'")->fetch()) {
        $db->exec("ALTER TABLE shop_suppliers ADD COLUMN alias VARCHAR(180) NULL AFTER name");
        $db->exec("UPDATE shop_suppliers SET alias = name WHERE alias IS NULL OR TRIM(alias) = ''");
    }
    $supplierDetailColumns = [
        'vat_number' => 'VARCHAR(60) NULL AFTER registration_number',
        'is_vat_payer' => 'TINYINT(1) NOT NULL DEFAULT 1 AFTER vat_number',
        'default_vat_rate' => 'DECIMAL(7,4) NULL AFTER is_vat_payer',
        'address_line2' => 'VARCHAR(255) NULL AFTER address',
        'city' => 'VARCHAR(120) NULL AFTER address_line2',
        'county' => 'VARCHAR(120) NULL AFTER city',
        'postal_code' => 'VARCHAR(30) NULL AFTER county',
        'country' => "VARCHAR(80) NOT NULL DEFAULT 'România' AFTER postal_code",
        'default_currency' => "CHAR(3) NOT NULL DEFAULT 'RON' AFTER country",
        'payment_terms' => 'VARCHAR(180) NULL AFTER default_currency',
        'row_version' => 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER is_active',
    ];
    foreach ($supplierDetailColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_suppliers LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_suppliers ADD COLUMN {$column} {$definition}");
        }
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_warehouses (
            id CHAR(36) NOT NULL PRIMARY KEY,
            code VARCHAR(40) NOT NULL UNIQUE,
            name VARCHAR(120) NOT NULL,
            is_default TINYINT(1) NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_warehouses_active (is_active, is_default)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec("INSERT IGNORE INTO shop_warehouses (id, code, name, is_default, is_active) VALUES ('00000000-0000-4000-8000-000000000001', 'MAIN', 'Gestiune principală', 1, 1)");
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_nir_settings (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            default_warehouse_id CHAR(36) NOT NULL,
            include_vat_in_inventory_cost TINYINT(1) NOT NULL DEFAULT 0,
            price_variance_warning_percent DECIMAL(7,2) NOT NULL DEFAULT 20.00,
            next_sequence BIGINT UNSIGNED NOT NULL DEFAULT 1,
            number_prefix VARCHAR(30) NOT NULL DEFAULT 'NIR',
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec("INSERT IGNORE INTO shop_nir_settings (id, default_warehouse_id) VALUES (1, '00000000-0000-4000-8000-000000000001')");
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_supplier_product_references (
            id CHAR(36) NOT NULL PRIMARY KEY,
            supplier_id CHAR(36) NOT NULL,
            product_id CHAR(36) NOT NULL,
            supplier_product_code_original VARCHAR(180) NOT NULL,
            supplier_product_code_normalized VARCHAR(180) NOT NULL,
            supplier_product_name VARCHAR(255) NULL,
            supplier_ean VARCHAR(120) NULL,
            purchase_unit VARCHAR(40) NOT NULL DEFAULT 'buc',
            stock_unit VARCHAR(40) NOT NULL DEFAULT 'buc',
            conversion_factor DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
            is_primary_for_supplier TINYINT(1) NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            last_used_at DATETIME NULL,
            last_confirmed_purchase_price DECIMAL(18,6) NULL,
            last_confirmed_currency CHAR(3) NULL,
            last_confirmed_price_ron DECIMAL(18,6) NULL,
            last_confirmed_at DATETIME NULL,
            created_by VARCHAR(180) NULL,
            updated_by VARCHAR(180) NULL,
            row_version INT UNSIGNED NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_supplier_code (supplier_id, supplier_product_code_normalized),
            INDEX idx_shop_supplier_ref_product (product_id),
            INDEX idx_shop_supplier_ref_supplier_product (supplier_id, product_id),
            INDEX idx_shop_supplier_ref_code (supplier_product_code_normalized),
            INDEX idx_shop_supplier_ref_ean (supplier_ean),
            INDEX idx_shop_supplier_ref_last_used (last_used_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_legacy_supplier_codes (
            id CHAR(36) NOT NULL PRIMARY KEY,
            product_id CHAR(36) NOT NULL,
            code_original VARCHAR(180) NOT NULL,
            code_normalized VARCHAR(180) NOT NULL,
            source_domain VARCHAR(120) NULL,
            resolution_status VARCHAR(30) NOT NULL DEFAULT 'unresolved_supplier',
            resolved_reference_id CHAR(36) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME NULL,
            UNIQUE INDEX uq_shop_legacy_product_code (product_id, code_normalized),
            INDEX idx_shop_legacy_resolution (resolution_status, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_nir_documents (
            id CHAR(36) NOT NULL PRIMARY KEY,
            temporary_number VARCHAR(80) NOT NULL,
            nir_number VARCHAR(80) NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'draft',
            supplier_id CHAR(36) NULL,
            warehouse_id CHAR(36) NOT NULL,
            reception_location_id CHAR(36) NULL,
            reception_location VARCHAR(500) NULL,
            supplier_invoice_series VARCHAR(60) NULL,
            supplier_invoice_number VARCHAR(120) NULL,
            supplier_invoice_date DATE NULL,
            nir_date DATE NOT NULL,
            nir_time TIME NULL,
            reception_date DATE NOT NULL,
            reception_time TIME NULL,
            currency CHAR(3) NOT NULL DEFAULT 'RON',
            exchange_rate DECIMAL(18,8) NOT NULL DEFAULT 1.00000000,
            exchange_rate_date DATE NULL,
            notes TEXT NULL,
            source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
            operation_type VARCHAR(30) NOT NULL DEFAULT 'supplier_receipt',
            order_id CHAR(36) NULL,
            sales_invoice_id CHAR(36) NULL,
            return_invoice_id CHAR(36) NULL,
            customer_name VARCHAR(255) NULL,
            customer_email VARCHAR(255) NULL,
            return_reason TEXT NULL,
            external_identifier VARCHAR(180) NULL,
            source_file_hash CHAR(64) NULL,
            duplicate_fingerprint CHAR(64) NULL,
            subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
            vat_total DECIMAL(18,2) NOT NULL DEFAULT 0,
            grand_total DECIMAL(18,2) NOT NULL DEFAULT 0,
            subtotal_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
            vat_total_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
            grand_total_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
            inventory_cost_total_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
            total_difference_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
            row_version INT UNSIGNED NOT NULL DEFAULT 1,
            confirmed_at DATETIME NULL,
            confirmed_by VARCHAR(180) NULL,
            reversed_at DATETIME NULL,
            reversed_by VARCHAR(180) NULL,
            reversal_of_id CHAR(36) NULL,
            created_by VARCHAR(180) NULL,
            updated_by VARCHAR(180) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_nir_number (nir_number),
            UNIQUE INDEX uq_shop_nir_temporary_number (temporary_number),
            UNIQUE INDEX uq_shop_nir_confirmed_duplicate (duplicate_fingerprint),
            INDEX idx_shop_nir_reception_date (reception_date, reception_time, id),
            INDEX idx_shop_nir_status_date (status, reception_date),
            INDEX idx_shop_nir_supplier_date (supplier_id, reception_date),
            INDEX idx_shop_nir_invoice (supplier_invoice_number, supplier_invoice_date),
            INDEX idx_shop_nir_reversal (reversal_of_id),
            INDEX idx_shop_nir_order (order_id),
            UNIQUE INDEX uq_shop_nir_return_invoice (return_invoice_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $nirDocumentColumns = [
        'temporary_number' => "VARCHAR(80) NOT NULL DEFAULT '' AFTER id",
        'reception_location_id' => 'CHAR(36) NULL AFTER warehouse_id',
        'reception_location' => 'VARCHAR(500) NULL AFTER reception_location_id',
        'supplier_invoice_series' => 'VARCHAR(60) NULL AFTER warehouse_id',
        'nir_date' => 'DATE NULL AFTER supplier_invoice_date',
        'nir_time' => 'TIME NULL AFTER nir_date',
        'reception_time' => 'TIME NULL AFTER reception_date',
        'exchange_rate_date' => 'DATE NULL AFTER exchange_rate',
        'operation_type' => "VARCHAR(30) NOT NULL DEFAULT 'supplier_receipt' AFTER source_type",
        'order_id' => 'CHAR(36) NULL AFTER operation_type',
        'sales_invoice_id' => 'CHAR(36) NULL AFTER order_id',
        'return_invoice_id' => 'CHAR(36) NULL AFTER sales_invoice_id',
        'customer_name' => 'VARCHAR(255) NULL AFTER return_invoice_id',
        'customer_email' => 'VARCHAR(255) NULL AFTER customer_name',
        'return_reason' => 'TEXT NULL AFTER customer_email',
        'external_identifier' => 'VARCHAR(180) NULL AFTER source_type',
        'source_file_hash' => 'CHAR(64) NULL AFTER external_identifier',
        'total_difference_ron' => 'DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER inventory_cost_total_ron',
    ];
    foreach ($nirDocumentColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_nir_documents LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_nir_documents ADD COLUMN {$column} {$definition}");
        }
    }
    $db->exec("UPDATE shop_nir_documents SET temporary_number = CONCAT('DRAFT-', LEFT(id, 8)) WHERE temporary_number = ''");
    // Un NIR de intrare rămâne confirmat chiar dacă toate cantitățile sale au
    // documente de storno. Roșu/STORNAT este doar documentul negativ legat.
    $db->exec("UPDATE shop_nir_documents SET status = 'confirmed', reversed_at = NULL, reversed_by = NULL WHERE status = 'reversed' AND reversal_of_id IS NULL");
    // Migrare idempotentă a numerelor istorice REV/STO în seria unică NIR.
    // Verificăm atât coliziunile cu NIR-uri existente, cât și între două
    // documente legacy care ar produce aceeași serie normalizată.
    $legacyNumberCollision = $db->query(
        "SELECT normalized_number
         FROM (
             SELECT CASE
                 WHEN reversal_of_id IS NOT NULL AND (nir_number LIKE 'REV-%' OR nir_number LIKE 'STO-%')
                     THEN CONCAT('NIR-', SUBSTRING(nir_number, 5))
                 ELSE nir_number
             END AS normalized_number
             FROM shop_nir_documents
             WHERE nir_number IS NOT NULL
         ) normalized
         GROUP BY normalized_number
         HAVING COUNT(*) > 1
         LIMIT 1"
    )->fetchColumn();
    if ($legacyNumberCollision !== false) {
        throw new RuntimeException('Seria legacy nu poate fi normalizată automat deoarece numărul ' . (string)$legacyNumberCollision . ' există deja.');
    }
    $db->exec(
        "UPDATE shop_nir_documents d
         LEFT JOIN shop_nir_documents conflict
           ON conflict.nir_number = CONCAT('NIR-', SUBSTRING(d.nir_number, 5)) AND conflict.id <> d.id
         SET d.nir_number = CONCAT('NIR-', SUBSTRING(d.nir_number, 5))
         WHERE d.reversal_of_id IS NOT NULL
           AND (d.nir_number LIKE 'REV-%' OR d.nir_number LIKE 'STO-%')
           AND conflict.id IS NULL"
    );
    if (!$db->query("SHOW INDEX FROM shop_nir_documents WHERE Key_name = 'uq_shop_nir_temporary_number'")->fetch()) {
        $db->exec('ALTER TABLE shop_nir_documents ADD UNIQUE INDEX uq_shop_nir_temporary_number (temporary_number)');
    }
    if (!$db->query("SHOW INDEX FROM shop_nir_documents WHERE Key_name = 'idx_shop_nir_reception_date'")->fetch()) {
        $db->exec('ALTER TABLE shop_nir_documents ADD INDEX idx_shop_nir_reception_date (reception_date, reception_time, id)');
    }
    if (!$db->query("SHOW INDEX FROM shop_nir_documents WHERE Key_name = 'idx_shop_nir_order'")->fetch()) {
        $db->exec('ALTER TABLE shop_nir_documents ADD INDEX idx_shop_nir_order (order_id)');
    }
    if (!$db->query("SHOW INDEX FROM shop_nir_documents WHERE Key_name = 'uq_shop_nir_return_invoice'")->fetch()) {
        $db->exec('ALTER TABLE shop_nir_documents ADD UNIQUE INDEX uq_shop_nir_return_invoice (return_invoice_id)');
    }
    $db->exec("UPDATE shop_nir_documents SET operation_type = CASE WHEN source_type = 'reversal' OR reversal_of_id IS NOT NULL THEN 'supplier_return' WHEN source_type = 'customer_return' THEN 'customer_return' ELSE 'supplier_receipt' END WHERE operation_type IS NULL OR operation_type = '' OR (operation_type = 'supplier_receipt' AND (source_type = 'reversal' OR reversal_of_id IS NOT NULL OR source_type = 'customer_return'))");
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_nir_lines (
            id CHAR(36) NOT NULL PRIMARY KEY,
            nir_document_id CHAR(36) NOT NULL,
            line_number INT UNSIGNED NOT NULL,
            product_id CHAR(36) NULL,
            supplier_product_reference_id CHAR(36) NULL,
            supplier_product_code VARCHAR(180) NULL,
            supplier_product_code_normalized VARCHAR(180) NULL,
            supplier_product_name VARCHAR(255) NOT NULL,
            supplier_ean VARCHAR(120) NULL,
            supplier_description TEXT NULL,
            raw_description TEXT NULL,
            product_snapshot_name VARCHAR(255) NULL,
            sku_snapshot VARCHAR(120) NULL,
            ean_snapshot VARCHAR(120) NULL,
            purchase_unit VARCHAR(40) NOT NULL DEFAULT 'buc',
            stock_unit VARCHAR(40) NOT NULL DEFAULT 'buc',
            invoiced_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
            received_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
            accepted_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
            rejected_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
            conversion_factor DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
            stock_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
            unit_price DECIMAL(18,6) NOT NULL DEFAULT 0,
            discount_percent DECIMAL(9,4) NOT NULL DEFAULT 0,
            discount_value DECIMAL(18,6) NOT NULL DEFAULT 0,
            vat_rate DECIMAL(9,4) NOT NULL DEFAULT 0,
            line_net DECIMAL(18,6) NOT NULL DEFAULT 0,
            line_vat DECIMAL(18,6) NOT NULL DEFAULT 0,
            line_total DECIMAL(18,6) NOT NULL DEFAULT 0,
            line_net_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
            line_vat_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
            line_total_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
            allocated_cost_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
            inventory_unit_cost_ron DECIMAL(18,6) NOT NULL DEFAULT 0,
            inventory_cost_total_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
            resolution_status VARCHAR(30) NOT NULL DEFAULT 'unmatched',
            match_method VARCHAR(30) NOT NULL DEFAULT 'unmatched',
            match_confidence DECIMAL(5,4) NOT NULL DEFAULT 0,
            is_stock_item TINYINT(1) NOT NULL DEFAULT 1,
            difference_reason VARCHAR(40) NULL,
            difference_notes VARCHAR(500) NULL,
            mismatch_reason VARCHAR(500) NULL,
            storno_of_line_id CHAR(36) NULL,
            row_version INT UNSIGNED NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_nir_line_number (nir_document_id, line_number),
            INDEX idx_shop_nir_line_product (product_id),
            INDEX idx_shop_nir_line_reference (supplier_product_reference_id),
            INDEX idx_shop_nir_line_code (supplier_product_code),
            INDEX idx_shop_nir_line_storno_source (storno_of_line_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $nirLineColumns = [
        'supplier_product_code_normalized' => 'VARCHAR(180) NULL AFTER supplier_product_code',
        'supplier_description' => 'TEXT NULL AFTER supplier_ean',
        'raw_description' => 'TEXT NULL AFTER supplier_description',
        'product_snapshot_name' => 'VARCHAR(255) NULL AFTER raw_description',
        'sku_snapshot' => 'VARCHAR(120) NULL AFTER product_snapshot_name',
        'ean_snapshot' => 'VARCHAR(120) NULL AFTER sku_snapshot',
        'received_quantity' => 'DECIMAL(18,4) NOT NULL DEFAULT 0 AFTER invoiced_quantity',
        'discount_value' => 'DECIMAL(18,6) NOT NULL DEFAULT 0 AFTER discount_percent',
        'match_method' => "VARCHAR(30) NOT NULL DEFAULT 'unmatched' AFTER resolution_status",
        'match_confidence' => 'DECIMAL(5,4) NOT NULL DEFAULT 0 AFTER match_method',
        'is_stock_item' => 'TINYINT(1) NOT NULL DEFAULT 1 AFTER match_confidence',
        'difference_reason' => 'VARCHAR(40) NULL AFTER is_stock_item',
        'difference_notes' => 'VARCHAR(500) NULL AFTER difference_reason',
        'storno_of_line_id' => 'CHAR(36) NULL AFTER mismatch_reason',
    ];
    foreach ($nirLineColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_nir_lines LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_nir_lines ADD COLUMN {$column} {$definition}");
        }
    }
    if (!$db->query("SHOW INDEX FROM shop_nir_lines WHERE Key_name = 'idx_shop_nir_line_storno_source'")->fetch()) {
        $db->exec('ALTER TABLE shop_nir_lines ADD INDEX idx_shop_nir_line_storno_source (storno_of_line_id)');
    }
    // Documentele REV create înainte de stornarea parțială copiau numărul liniei
    // sursă. Legătura explicită le păstrează în calculul anti-dublu-storno.
    $db->exec(
        "UPDATE shop_nir_lines sl
         INNER JOIN shop_nir_documents sd ON sd.id = sl.nir_document_id AND sd.reversal_of_id IS NOT NULL
         INNER JOIN shop_nir_lines ol ON ol.nir_document_id = sd.reversal_of_id AND ol.line_number = sl.line_number
         SET sl.storno_of_line_id = ol.id
         WHERE sl.storno_of_line_id IS NULL"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_nir_attachments (
            id CHAR(36) NOT NULL PRIMARY KEY,
            nir_document_id CHAR(36) NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            storage_name VARCHAR(255) NOT NULL,
            mime_type VARCHAR(120) NOT NULL,
            extension VARCHAR(20) NOT NULL,
            file_size BIGINT UNSIGNED NOT NULL,
            sha256 CHAR(64) NOT NULL,
            extraction_status VARCHAR(30) NOT NULL DEFAULT 'pending',
            extraction_message VARCHAR(500) NULL,
            extracted_json LONGTEXT NULL,
            created_by VARCHAR(180) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_nir_attachment_hash (nir_document_id, sha256),
            INDEX idx_shop_nir_attachment_document (nir_document_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_inventory_cost_layers (
            id CHAR(36) NOT NULL PRIMARY KEY,
            product_id CHAR(36) NOT NULL,
            warehouse_id CHAR(36) NOT NULL,
            supplier_id CHAR(36) NULL,
            supplier_product_reference_id CHAR(36) NULL,
            nir_document_id CHAR(36) NULL,
            nir_line_id CHAR(36) NULL,
            source_type VARCHAR(30) NOT NULL DEFAULT 'NIR',
            source_reference VARCHAR(120) NULL,
            invoice_number_snapshot VARCHAR(180) NULL,
            supplier_code_snapshot VARCHAR(180) NULL,
            reception_date DATE NOT NULL,
            confirmed_at DATETIME NULL,
            original_quantity DECIMAL(18,4) NOT NULL,
            remaining_quantity DECIMAL(18,4) NOT NULL,
            stock_unit VARCHAR(40) NOT NULL DEFAULT 'buc',
            unit_cost_ron DECIMAL(18,6) NOT NULL,
            total_cost_ron DECIMAL(18,2) NOT NULL,
            currency CHAR(3) NOT NULL DEFAULT 'RON',
            original_unit_price DECIMAL(18,6) NULL,
            exchange_rate DECIMAL(18,8) NOT NULL DEFAULT 1.00000000,
            status VARCHAR(30) NOT NULL DEFAULT 'open',
            is_reversed TINYINT(1) NOT NULL DEFAULT 0,
            reversed_at DATETIME NULL,
            created_by VARCHAR(180) NULL,
            row_version INT UNSIGNED NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_fifo_nir_line (nir_line_id),
            INDEX idx_shop_fifo_product_order (product_id, warehouse_id, reception_date, created_at),
            INDEX idx_shop_fifo_remaining (product_id, warehouse_id, is_reversed, remaining_quantity),
            INDEX idx_shop_fifo_supplier (supplier_id, reception_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $fifoLayerColumns = [
        'supplier_product_reference_id' => 'CHAR(36) NULL AFTER supplier_id',
        'invoice_number_snapshot' => 'VARCHAR(180) NULL AFTER source_reference',
        'supplier_code_snapshot' => 'VARCHAR(180) NULL AFTER invoice_number_snapshot',
        'confirmed_at' => 'DATETIME NULL AFTER reception_date',
        'stock_unit' => "VARCHAR(40) NOT NULL DEFAULT 'buc' AFTER remaining_quantity",
        'exchange_rate' => 'DECIMAL(18,8) NOT NULL DEFAULT 1.00000000 AFTER original_unit_price',
        'status' => "VARCHAR(30) NOT NULL DEFAULT 'open' AFTER exchange_rate",
        'reversed_at' => 'DATETIME NULL AFTER is_reversed',
        'created_by' => 'VARCHAR(180) NULL AFTER reversed_at',
    ];
    foreach ($fifoLayerColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_inventory_cost_layers LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_inventory_cost_layers ADD COLUMN {$column} {$definition}");
        }
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_inventory_layer_consumptions (
            id CHAR(36) NOT NULL PRIMARY KEY,
            inventory_cost_layer_id CHAR(36) NOT NULL,
            product_id CHAR(36) NOT NULL,
            warehouse_id CHAR(36) NOT NULL,
            source_document_type VARCHAR(40) NOT NULL,
            source_document_id CHAR(36) NOT NULL,
            source_line_id CHAR(36) NOT NULL,
            quantity DECIMAL(18,4) NOT NULL,
            unit_cost_ron DECIMAL(18,6) NOT NULL,
            total_cost_ron DECIMAL(18,2) NOT NULL,
            idempotency_key VARCHAR(120) NOT NULL,
            consumed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(180) NULL,
            reversal_consumption_id CHAR(36) NULL,
            row_version INT UNSIGNED NOT NULL DEFAULT 1,
            reversed_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_fifo_consumption_source (source_document_type, source_line_id, inventory_cost_layer_id),
            UNIQUE INDEX uq_shop_fifo_consumption_idempotency (idempotency_key, inventory_cost_layer_id),
            INDEX idx_shop_fifo_consumption_layer (inventory_cost_layer_id, created_at),
            INDEX idx_shop_fifo_consumption_source_document (source_document_type, source_document_id, source_line_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $fifoConsumptionColumns = [
        'consumed_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER idempotency_key',
        'created_by' => 'VARCHAR(180) NULL AFTER consumed_at',
        'reversal_consumption_id' => 'CHAR(36) NULL AFTER created_by',
        'row_version' => 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER reversal_consumption_id',
        'reversed_at' => 'DATETIME NULL AFTER row_version',
    ];
    foreach ($fifoConsumptionColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_inventory_layer_consumptions LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_inventory_layer_consumptions ADD COLUMN {$column} {$definition}");
        }
    }
    if (!$db->query("SHOW INDEX FROM shop_inventory_layer_consumptions WHERE Key_name = 'idx_shop_fifo_consumption_source_document'")->fetch()) {
        $db->exec('ALTER TABLE shop_inventory_layer_consumptions ADD INDEX idx_shop_fifo_consumption_source_document (source_document_type, source_document_id, source_line_id)');
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_domain_audit (
            id CHAR(36) NOT NULL PRIMARY KEY,
            action_type VARCHAR(80) NOT NULL,
            entity_type VARCHAR(80) NOT NULL,
            entity_id CHAR(36) NOT NULL,
            actor_id VARCHAR(180) NULL,
            actor_name VARCHAR(180) NULL,
            old_values_json LONGTEXT NULL,
            new_values_json LONGTEXT NULL,
            context_json LONGTEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_audit_entity (entity_type, entity_id, created_at),
            INDEX idx_shop_audit_actor (actor_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_nir_idempotency (
            idempotency_key VARCHAR(120) NOT NULL PRIMARY KEY,
            nir_document_id CHAR(36) NOT NULL,
            request_hash CHAR(64) NOT NULL,
            response_json LONGTEXT NULL,
            completed_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_nir_idempotency_document (nir_document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_domain_outbox (
            id CHAR(36) NOT NULL PRIMARY KEY,
            event_type VARCHAR(100) NOT NULL,
            aggregate_type VARCHAR(80) NOT NULL,
            aggregate_id CHAR(36) NOT NULL,
            payload_json LONGTEXT NOT NULL,
            published_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_outbox_pending (published_at, created_at)
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
        "CREATE TABLE IF NOT EXISTS shop_invoice_settings (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            default_theme VARCHAR(20) NOT NULL DEFAULT 'orange',
            invoice_series VARCHAR(20) NOT NULL DEFAULT 'GT',
            due_days SMALLINT UNSIGNED NOT NULL DEFAULT 7,
            default_notes TEXT NULL,
            updated_by VARCHAR(180) NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec("INSERT IGNORE INTO shop_invoice_settings (id, default_theme) VALUES (1, 'orange')");
    if (!$db->query("SHOW COLUMNS FROM shop_invoice_settings LIKE 'invoice_series'")->fetch()) {
        $db->exec("ALTER TABLE shop_invoice_settings ADD COLUMN invoice_series VARCHAR(20) NOT NULL DEFAULT 'GT' AFTER default_theme");
    }
    if (!$db->query("SHOW COLUMNS FROM shop_invoice_settings LIKE 'due_days'")->fetch()) {
        $db->exec("ALTER TABLE shop_invoice_settings ADD COLUMN due_days SMALLINT UNSIGNED NOT NULL DEFAULT 7 AFTER invoice_series");
    }
    if (!$db->query("SHOW COLUMNS FROM shop_invoice_settings LIKE 'default_notes'")->fetch()) {
        $db->exec("ALTER TABLE shop_invoice_settings ADD COLUMN default_notes TEXT NULL AFTER due_days");
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_invoice_automation_settings (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            card_issue_enabled TINYINT(1) NOT NULL DEFAULT 0,
            card_email_enabled TINYINT(1) NOT NULL DEFAULT 0,
            cod_issue_enabled TINYINT(1) NOT NULL DEFAULT 0,
            cod_email_enabled TINYINT(1) NOT NULL DEFAULT 0,
            updated_by VARCHAR(180) NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec("INSERT IGNORE INTO shop_invoice_automation_settings (id) VALUES (1)");
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_invoice_automation_runs (
            id CHAR(36) NOT NULL PRIMARY KEY,
            order_id CHAR(36) NOT NULL,
            payment_flow VARCHAR(20) NOT NULL,
            invoice_id CHAR(36) NULL,
            issue_requested TINYINT(1) NOT NULL DEFAULT 1,
            email_requested TINYINT(1) NOT NULL DEFAULT 0,
            email_sent TINYINT(1) NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'processing',
            attempts SMALLINT UNSIGNED NOT NULL DEFAULT 1,
            last_error VARCHAR(500) NULL,
            processed_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_invoice_automation_order_flow (order_id, payment_flow),
            INDEX idx_shop_invoice_automation_status (status, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_invoice_theme_assignments (
            document_key VARCHAR(80) NOT NULL PRIMARY KEY,
            document_id VARCHAR(64) NULL,
            invoice_series VARCHAR(60) NOT NULL,
            invoice_number VARCHAR(120) NOT NULL,
            theme VARCHAR(20) NOT NULL,
            assigned_by VARCHAR(180) NULL,
            assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_rendered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_invoice_theme_number (invoice_series, invoice_number),
            INDEX idx_shop_invoice_theme_document (document_id),
            INDEX idx_shop_invoice_theme_assigned (assigned_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_invoice_sequences (
            series VARCHAR(60) NOT NULL PRIMARY KEY,
            last_number BIGINT UNSIGNED NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_invoices (
            id CHAR(36) NOT NULL PRIMARY KEY,
            order_id CHAR(36) NOT NULL,
            series VARCHAR(60) NOT NULL,
            invoice_number VARCHAR(120) NOT NULL,
            invoice_type VARCHAR(20) NOT NULL DEFAULT 'invoice',
            original_invoice_id CHAR(36) NULL,
            document_status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
            theme VARCHAR(20) NOT NULL,
            issue_date DATE NOT NULL,
            due_date DATE NULL,
            currency CHAR(3) NOT NULL DEFAULT 'RON',
            total DECIMAL(12,2) NOT NULL DEFAULT 0,
            buyer_name VARCHAR(180) NOT NULL DEFAULT '',
            buyer_cui VARCHAR(60) NULL,
            payload_json LONGTEXT NOT NULL,
            issued_by VARCHAR(180) NULL,
            email_sent_at DATETIME NULL,
            email_last_error VARCHAR(500) NULL,
            spv_status VARCHAR(20) NOT NULL DEFAULT 'not_sent',
            spv_sent_at DATETIME NULL,
            spv_submission_id VARCHAR(180) NULL,
            issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_invoice_order_type (order_id, invoice_type),
            UNIQUE INDEX uq_shop_invoice_number (series, invoice_number),
            INDEX idx_shop_invoice_original (original_invoice_id),
            INDEX idx_shop_invoice_issue_date (issue_date, issued_at),
            INDEX idx_shop_invoice_status (document_status, issued_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    foreach ([
        'invoice_type' => "VARCHAR(20) NOT NULL DEFAULT 'invoice' AFTER invoice_number",
        'original_invoice_id' => 'CHAR(36) NULL AFTER invoice_type',
        'spv_status' => "VARCHAR(20) NOT NULL DEFAULT 'not_sent' AFTER email_last_error",
        'spv_sent_at' => 'DATETIME NULL AFTER spv_status',
        'spv_submission_id' => 'VARCHAR(180) NULL AFTER spv_sent_at',
    ] as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_invoices LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_invoices ADD COLUMN {$column} {$definition}");
        }
    }
    if ($db->query("SHOW INDEX FROM shop_invoices WHERE Key_name = 'uq_shop_invoice_order'")->fetch()) {
        $db->exec('ALTER TABLE shop_invoices DROP INDEX uq_shop_invoice_order');
    }
    if (!$db->query("SHOW INDEX FROM shop_invoices WHERE Key_name = 'uq_shop_invoice_order_type'")->fetch()) {
        $db->exec('ALTER TABLE shop_invoices ADD UNIQUE INDEX uq_shop_invoice_order_type (order_id, invoice_type)');
    }
    if (!$db->query("SHOW INDEX FROM shop_invoices WHERE Key_name = 'idx_shop_invoice_original'")->fetch()) {
        $db->exec('ALTER TABLE shop_invoices ADD INDEX idx_shop_invoice_original (original_invoice_id)');
    }

    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_spv_outbox (
            id CHAR(36) NOT NULL PRIMARY KEY,
            invoice_id CHAR(36) NOT NULL,
            document_kind VARCHAR(30) NOT NULL DEFAULT 'invoice',
            status VARCHAR(30) NOT NULL DEFAULT 'awaiting_configuration',
            attempts INT UNSIGNED NOT NULL DEFAULT 0,
            last_error VARCHAR(500) NULL,
            queued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sent_at DATETIME NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_spv_outbox_invoice (invoice_id),
            INDEX idx_shop_spv_outbox_status (status, queued_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    GtrotsSpvService::ensureSchema($db);
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_company_settings (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            legal_name VARCHAR(180) NOT NULL DEFAULT '',
            trade_name VARCHAR(180) NOT NULL DEFAULT 'G-Trots România',
            cui VARCHAR(60) NOT NULL DEFAULT '',
            registration_number VARCHAR(80) NOT NULL DEFAULT '',
            address VARCHAR(255) NOT NULL DEFAULT '',
            city VARCHAR(120) NOT NULL DEFAULT '',
            county VARCHAR(120) NOT NULL DEFAULT '',
            postal_code VARCHAR(30) NOT NULL DEFAULT '',
            country VARCHAR(80) NOT NULL DEFAULT 'România',
            email VARCHAR(180) NOT NULL DEFAULT '',
            phone VARCHAR(50) NOT NULL DEFAULT '',
            website VARCHAR(180) NOT NULL DEFAULT 'https://g-trots.ro',
            bank_name VARCHAR(180) NOT NULL DEFAULT '',
            iban VARCHAR(80) NOT NULL DEFAULT '',
            share_capital VARCHAR(80) NOT NULL DEFAULT '',
            stamp_path VARCHAR(500) NULL,
            is_default TINYINT(1) NOT NULL DEFAULT 0,
            vat_payer TINYINT(1) NOT NULL DEFAULT 0,
            vat_rate DECIMAL(5,2) NOT NULL DEFAULT 19.00,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    if (!$db->query("SHOW COLUMNS FROM shop_company_settings LIKE 'stamp_path'")->fetch()) {
        $db->exec("ALTER TABLE shop_company_settings ADD COLUMN stamp_path VARCHAR(500) NULL AFTER share_capital");
    }
    if (!$db->query("SHOW COLUMNS FROM shop_company_settings LIKE 'is_default'")->fetch()) {
        $db->exec("ALTER TABLE shop_company_settings ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0 AFTER stamp_path");
    }
    if (!$db->query("SHOW COLUMNS FROM shop_company_settings LIKE 'vat_payer'")->fetch()) {
        $db->exec("ALTER TABLE shop_company_settings ADD COLUMN vat_payer TINYINT(1) NOT NULL DEFAULT 0 AFTER is_default");
    }
    if (!$db->query("SHOW COLUMNS FROM shop_company_settings LIKE 'vat_rate'")->fetch()) {
        $db->exec("ALTER TABLE shop_company_settings ADD COLUMN vat_rate DECIMAL(5,2) NOT NULL DEFAULT 19.00 AFTER vat_payer");
    }
    $db->exec("ALTER TABLE shop_company_settings MODIFY id INT UNSIGNED NOT NULL AUTO_INCREMENT");
    $db->exec("INSERT IGNORE INTO shop_company_settings (id, is_default) VALUES (1, 1)");
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_company_receipt_locations (
            id CHAR(36) NOT NULL PRIMARY KEY,
            company_id INT UNSIGNED NOT NULL,
            name VARCHAR(180) NOT NULL,
            address VARCHAR(255) NOT NULL DEFAULT '',
            city VARCHAR(120) NOT NULL DEFAULT '',
            county VARCHAR(120) NOT NULL DEFAULT '',
            postal_code VARCHAR(30) NOT NULL DEFAULT '',
            is_default TINYINT(1) NOT NULL DEFAULT 0,
            sort_order INT UNSIGNED NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_receipt_location_company (company_id, is_default, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "INSERT INTO shop_company_receipt_locations (id, company_id, name, is_default, sort_order)
         SELECT UUID(), c.id, 'Gestiune principală', 1, 0
         FROM shop_company_settings c
         WHERE c.is_default = 1
           AND NOT EXISTS (SELECT 1 FROM shop_company_receipt_locations r WHERE r.company_id = c.id)
         ORDER BY c.id ASC LIMIT 1"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_orders (
            id CHAR(36) NOT NULL PRIMARY KEY,
            order_number VARCHAR(40) NOT NULL UNIQUE,
            status VARCHAR(30) NOT NULL DEFAULT 'new',
            payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
            payment_method VARCHAR(40) NOT NULL,
            customer_id CHAR(36) NULL,
            customer_name VARCHAR(180) NOT NULL,
            customer_email VARCHAR(180) NULL,
            customer_phone VARCHAR(50) NOT NULL,
            customer_type VARCHAR(20) NOT NULL DEFAULT 'individual',
            company_name VARCHAR(180) NULL,
            company_cui VARCHAR(60) NULL,
            company_registration_number VARCHAR(80) NULL,
            company_address VARCHAR(255) NULL,
            address VARCHAR(255) NOT NULL,
            city VARCHAR(120) NOT NULL,
            county VARCHAR(120) NULL,
            postal_code VARCHAR(30) NULL,
            customer_notes TEXT NULL,
            admin_notes TEXT NULL,
            return_reason TEXT NULL,
            return_bank_iban VARCHAR(64) NULL,
            return_bank_account_holder VARCHAR(180) NULL,
            return_shipping_cost DECIMAL(12,2) NULL,
            return_refund_amount DECIMAL(12,2) NULL,
            return_requested_at DATETIME NULL,
            return_request_source VARCHAR(30) NULL,
            return_request_email_sent_at DATETIME NULL,
            return_request_email_error VARCHAR(500) NULL,
            return_confirmed_at DATETIME NULL,
            return_confirmation_email_sent_at DATETIME NULL,
            return_confirmation_email_error VARCHAR(500) NULL,
            shipping_method_id CHAR(36) NULL,
            shipping_method_name VARCHAR(120) NOT NULL,
            subtotal DECIMAL(12,2) NOT NULL,
            discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
            promotion_id CHAR(36) NULL,
            promotion_code VARCHAR(80) NULL,
            promotion_scope VARCHAR(20) NULL,
            shipping_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
            total DECIMAL(12,2) NOT NULL,
            vat_payer TINYINT(1) NOT NULL DEFAULT 0,
            vat_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
            vat_total DECIMAL(12,2) NOT NULL DEFAULT 0,
            net_total DECIMAL(12,2) NOT NULL DEFAULT 0,
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
            INDEX idx_shop_orders_customer_id (customer_id, created_at),
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
    $promotionOrderColumns = [
        'discount_total' => 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER subtotal',
        'promotion_id' => 'CHAR(36) NULL AFTER discount_total',
        'promotion_code' => 'VARCHAR(80) NULL AFTER promotion_id',
        'promotion_scope' => 'VARCHAR(20) NULL AFTER promotion_code',
        'customer_id' => 'CHAR(36) NULL AFTER payment_method',
    ];
    foreach ($promotionOrderColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_orders LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_orders ADD COLUMN {$column} {$definition}");
        }
    }
    $customerTypeOrderColumns = [
        'customer_type' => "VARCHAR(20) NOT NULL DEFAULT 'individual' AFTER customer_phone",
        'company_name' => 'VARCHAR(180) NULL AFTER customer_type',
        'company_cui' => 'VARCHAR(60) NULL AFTER company_name',
        'company_registration_number' => 'VARCHAR(80) NULL AFTER company_cui',
        'company_address' => 'VARCHAR(255) NULL AFTER company_registration_number',
    ];
    foreach ($customerTypeOrderColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_orders LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_orders ADD COLUMN {$column} {$definition}");
        }
    }
    $vatOrderColumns = [
        'vat_payer' => 'TINYINT(1) NOT NULL DEFAULT 0 AFTER total',
        'vat_rate' => 'DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER vat_payer',
        'vat_total' => 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER vat_rate',
        'net_total' => 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER vat_total',
    ];
    $addedNetTotalColumn = false;
    foreach ($vatOrderColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_orders LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_orders ADD COLUMN {$column} {$definition}");
            if ($column === 'net_total') $addedNetTotalColumn = true;
        }
    }
    if ($addedNetTotalColumn) {
        // Migrare unică pentru comenzile istorice: păstrăm în DB brutul, TVA-ul și netul defalcate.
        $db->exec('UPDATE shop_orders SET vat_total = CASE WHEN vat_payer = 1 AND vat_rate > 0 THEN ROUND(total * vat_rate / 100, 2) ELSE 0 END, net_total = CASE WHEN vat_payer = 1 AND vat_rate > 0 THEN ROUND(total - (total * vat_rate / 100), 2) ELSE total END');
    }
    if (!$db->query("SHOW INDEX FROM shop_orders WHERE Key_name = 'idx_shop_orders_customer_id'")->fetch()) {
        $db->exec('ALTER TABLE shop_orders ADD INDEX idx_shop_orders_customer_id (customer_id, created_at)');
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
    $orderCancellationColumns = [
        'customer_cancellation_reason' => 'TEXT NULL AFTER admin_notes',
        'customer_cancelled_at' => 'DATETIME NULL AFTER customer_cancellation_reason',
        'cancellation_source' => 'VARCHAR(30) NULL AFTER customer_cancelled_at',
        'cancellation_invoice_action' => 'VARCHAR(40) NULL AFTER cancellation_source',
        'return_invoice_id' => 'CHAR(36) NULL AFTER cancellation_invoice_action',
        'refund_status' => "VARCHAR(30) NOT NULL DEFAULT 'none' AFTER return_invoice_id",
        'refund_due_at' => 'DATE NULL AFTER refund_status',
        'cancellation_email_sent_at' => 'DATETIME NULL AFTER refund_due_at',
        'cancellation_email_error' => 'VARCHAR(500) NULL AFTER cancellation_email_sent_at',
    ];
    foreach ($orderCancellationColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_orders LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_orders ADD COLUMN {$column} {$definition}");
        }
    }
    $orderReturnColumns = [
        'return_reason' => 'TEXT NULL AFTER admin_notes',
        'return_bank_iban' => 'VARCHAR(64) NULL AFTER return_reason',
        'return_bank_account_holder' => 'VARCHAR(180) NULL AFTER return_bank_iban',
        'return_shipping_cost' => 'DECIMAL(12,2) NULL AFTER return_bank_account_holder',
        'return_refund_amount' => 'DECIMAL(12,2) NULL AFTER return_shipping_cost',
        'return_requested_at' => 'DATETIME NULL AFTER return_refund_amount',
        'return_request_source' => 'VARCHAR(30) NULL AFTER return_requested_at',
        'return_request_email_sent_at' => 'DATETIME NULL AFTER return_request_source',
        'return_request_email_error' => 'VARCHAR(500) NULL AFTER return_request_email_sent_at',
        'return_confirmed_at' => 'DATETIME NULL AFTER return_request_email_error',
        'return_confirmation_email_sent_at' => 'DATETIME NULL AFTER return_confirmed_at',
        'return_confirmation_email_error' => 'VARCHAR(500) NULL AFTER return_confirmation_email_sent_at',
    ];
    foreach ($orderReturnColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_orders LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_orders ADD COLUMN {$column} {$definition}");
        }
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
            discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
            discounted_unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
            discounted_line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
            INDEX idx_shop_order_items_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $promotionItemColumns = [
        'discount_total' => 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER line_total',
        'discounted_unit_price' => 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_total',
        'discounted_line_total' => 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discounted_unit_price',
    ];
    foreach ($promotionItemColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_order_items LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_order_items ADD COLUMN {$column} {$definition}");
        }
    }
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
        "CREATE TABLE IF NOT EXISTS shop_customers (
            id CHAR(36) NOT NULL PRIMARY KEY,
            email VARCHAR(190) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NULL,
            full_name VARCHAR(180) NOT NULL,
            phone VARCHAR(50) NULL,
            customer_type VARCHAR(20) NOT NULL DEFAULT 'individual',
            address VARCHAR(255) NULL,
            city VARCHAR(120) NULL,
            county VARCHAR(120) NULL,
            postal_code VARCHAR(30) NULL,
            company_name VARCHAR(180) NULL,
            company_cui VARCHAR(60) NULL,
            company_registration_number VARCHAR(80) NULL,
            company_address VARCHAR(255) NULL,
            google_sub VARCHAR(190) NULL UNIQUE,
            avatar_url VARCHAR(500) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            last_login_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_customers_active (is_active),
            INDEX idx_shop_customers_name (full_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $customerProfileColumns = [
        'customer_type' => "VARCHAR(20) NOT NULL DEFAULT 'individual' AFTER phone",
        'address' => 'VARCHAR(255) NULL AFTER customer_type',
        'city' => 'VARCHAR(120) NULL AFTER address',
        'county' => 'VARCHAR(120) NULL AFTER city',
        'postal_code' => 'VARCHAR(30) NULL AFTER county',
        'company_name' => 'VARCHAR(180) NULL AFTER postal_code',
        'company_cui' => 'VARCHAR(60) NULL AFTER company_name',
        'company_registration_number' => 'VARCHAR(80) NULL AFTER company_cui',
        'company_address' => 'VARCHAR(255) NULL AFTER company_registration_number',
    ];
    foreach ($customerProfileColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_customers LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_customers ADD COLUMN {$column} {$definition}");
        }
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_customer_sessions (
            id CHAR(36) NOT NULL PRIMARY KEY,
            customer_id CHAR(36) NOT NULL,
            token_hash CHAR(64) NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_customer_sessions_customer (customer_id, expires_at),
            INDEX idx_shop_customer_sessions_expiry (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_customer_password_resets (
            id CHAR(36) NOT NULL PRIMARY KEY,
            customer_id CHAR(36) NULL,
            email VARCHAR(190) NOT NULL,
            token_hash CHAR(64) NOT NULL UNIQUE,
            request_ip_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_password_resets_customer (customer_id, created_at),
            INDEX idx_shop_password_resets_email (email, created_at),
            INDEX idx_shop_password_resets_ip (request_ip_hash, created_at),
            INDEX idx_shop_password_resets_expiry (expires_at, used_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_customer_addresses (
            id CHAR(36) NOT NULL PRIMARY KEY,
            customer_id CHAR(36) NOT NULL,
            label VARCHAR(80) NOT NULL DEFAULT 'Acasă',
            recipient_name VARCHAR(180) NOT NULL,
            phone VARCHAR(50) NOT NULL,
            address VARCHAR(255) NOT NULL,
            city VARCHAR(120) NOT NULL,
            county VARCHAR(120) NOT NULL,
            postal_code VARCHAR(30) NULL,
            is_default TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_customer_addresses_customer (customer_id, is_default)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_coupons (
            id CHAR(36) NOT NULL PRIMARY KEY,
            code VARCHAR(80) NOT NULL UNIQUE,
            title VARCHAR(180) NOT NULL,
            description VARCHAR(500) NULL,
            discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
            discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
            min_order_value DECIMAL(12,2) NULL,
            audience VARCHAR(20) NOT NULL DEFAULT 'all',
            scope VARCHAR(20) NOT NULL DEFAULT 'global',
            product_id CHAR(36) NULL,
            usage_mode VARCHAR(30) NOT NULL DEFAULT 'unlimited',
            auto_apply TINYINT(1) NOT NULL DEFAULT 1,
            show_banner TINYINT(1) NOT NULL DEFAULT 1,
            banner_text VARCHAR(260) NULL,
            valid_from DATETIME NULL,
            valid_until DATETIME NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_shop_coupons_active (is_active, valid_until)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $couponRuleColumns = [
        'audience' => "VARCHAR(20) NOT NULL DEFAULT 'all' AFTER min_order_value",
        'scope' => "VARCHAR(20) NOT NULL DEFAULT 'global' AFTER audience",
        'product_id' => 'CHAR(36) NULL AFTER scope',
        'usage_mode' => "VARCHAR(30) NOT NULL DEFAULT 'unlimited' AFTER product_id",
        'auto_apply' => 'TINYINT(1) NOT NULL DEFAULT 1 AFTER usage_mode',
        'show_banner' => 'TINYINT(1) NOT NULL DEFAULT 1 AFTER auto_apply',
        'banner_text' => 'VARCHAR(260) NULL AFTER show_banner',
    ];
    foreach ($couponRuleColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_coupons LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_coupons ADD COLUMN {$column} {$definition}");
        }
    }
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_customer_coupons (
            customer_id CHAR(36) NOT NULL,
            coupon_id CHAR(36) NOT NULL,
            assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            used_at DATETIME NULL,
            PRIMARY KEY (customer_id, coupon_id),
            INDEX idx_shop_customer_coupons_coupon (coupon_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_coupon_products (
            coupon_id CHAR(36) NOT NULL,
            product_id CHAR(36) NOT NULL,
            PRIMARY KEY (coupon_id, product_id),
            INDEX idx_shop_coupon_products_product (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_coupon_device_usage (
            coupon_id CHAR(36) NOT NULL,
            device_hash CHAR(64) NOT NULL,
            order_id CHAR(36) NULL,
            used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (coupon_id, device_hash),
            INDEX idx_shop_coupon_device_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_coupon_customer_usage (
            coupon_id CHAR(36) NOT NULL,
            customer_id CHAR(36) NOT NULL,
            order_id CHAR(36) NULL,
            used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (coupon_id, customer_id),
            INDEX idx_shop_coupon_customer_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "UPDATE shop_orders o
         INNER JOIN shop_customers c ON LOWER(c.email) = LOWER(o.customer_email)
         SET o.customer_id = c.id
         WHERE o.customer_id IS NULL AND o.customer_email IS NOT NULL AND o.customer_email <> ''"
    );
    $db->exec(
        "INSERT IGNORE INTO shop_coupon_customer_usage (coupon_id, customer_id, order_id, used_at)
         SELECT o.promotion_id, o.customer_id, o.id, o.created_at
         FROM shop_orders o
         INNER JOIN shop_coupons c ON c.id = o.promotion_id AND c.usage_mode = 'once_per_customer'
         WHERE o.customer_id IS NOT NULL
           AND o.promotion_id IS NOT NULL
           AND o.discount_total > 0
           AND o.status NOT IN ('cancelled', 'refunded')
         ORDER BY o.created_at ASC"
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
    $inventoryMovementColumns = [
        'warehouse_id' => 'CHAR(36) NULL AFTER product_id',
        'nir_document_id' => 'CHAR(36) NULL AFTER order_id',
        'sales_invoice_id' => 'CHAR(36) NULL AFTER nir_document_id',
        'sales_invoice_line_id' => 'CHAR(36) NULL AFTER sales_invoice_id',
        'nir_line_id' => 'CHAR(36) NULL AFTER nir_document_id',
        'inventory_cost_layer_id' => 'CHAR(36) NULL AFTER nir_line_id',
        'accounting_quantity_delta' => 'DECIMAL(18,4) NULL AFTER quantity_delta',
        'accounting_quantity_after' => 'DECIMAL(18,4) NULL AFTER quantity_after',
        'inventory_unit_cost_ron' => 'DECIMAL(18,6) NULL AFTER accounting_quantity_after',
        'inventory_cost_total_ron' => 'DECIMAL(18,2) NULL AFTER inventory_unit_cost_ron',
        'sale_unit_price_ron' => 'DECIMAL(18,6) NULL AFTER inventory_cost_total_ron',
        'sale_total_ron' => 'DECIMAL(18,2) NULL AFTER sale_unit_price_ron',
        'fifo_status' => "VARCHAR(20) NULL AFTER sale_total_ron",
        'fifo_quantity_allocated' => 'DECIMAL(18,4) NULL AFTER fifo_status',
        'fifo_quantity_pending' => 'DECIMAL(18,4) NULL AFTER fifo_quantity_allocated',
        'reception_date' => 'DATE NULL AFTER inventory_cost_total_ron',
        'reversal_of_movement_id' => 'CHAR(36) NULL AFTER reception_date',
    ];
    foreach ($inventoryMovementColumns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM shop_inventory_movements LIKE " . $db->quote($column))->fetch()) {
            $db->exec("ALTER TABLE shop_inventory_movements ADD COLUMN {$column} {$definition}");
        }
    }
    foreach ([
        'idx_shop_inventory_nir' => '(nir_document_id, nir_line_id)',
        'idx_shop_inventory_sales_invoice' => '(sales_invoice_id, product_id)',
        'idx_shop_inventory_fifo_pending' => '(fifo_status, product_id, created_at)',
        'idx_shop_inventory_fifo_layer' => '(inventory_cost_layer_id)',
        'idx_shop_inventory_accounting' => '(product_id, warehouse_id, reception_date)',
    ] as $indexName => $columns) {
        if (!$db->query("SHOW INDEX FROM shop_inventory_movements WHERE Key_name = " . $db->quote($indexName))->fetch()) {
            $db->exec("ALTER TABLE shop_inventory_movements ADD INDEX {$indexName} {$columns}");
        }
    }
    if (!$db->query("SHOW INDEX FROM shop_inventory_movements WHERE Key_name = 'uq_shop_inventory_nir_line_type'")->fetch()) {
        $db->exec('ALTER TABLE shop_inventory_movements ADD UNIQUE INDEX uq_shop_inventory_nir_line_type (nir_line_id, movement_type)');
    }

    // Codurile vechi nu au un SupplierId sigur. Le păstrăm explicit pentru
    // reconciliere, în loc să inventăm o asociere la un furnizor arbitrar.
    $legacyProducts = $db->query(
        "SELECT id, supplier_product_code, source_domain
         FROM shop_products
         WHERE supplier_product_code IS NOT NULL AND TRIM(supplier_product_code) <> ''"
    )->fetchAll();
    $insertLegacy = $db->prepare(
        'INSERT IGNORE INTO shop_legacy_supplier_codes
         (id, product_id, code_original, code_normalized, source_domain)
         VALUES (?, ?, ?, ?, ?)'
    );
    foreach ($legacyProducts as $legacyProduct) {
        $legacyCode = trim((string)$legacyProduct['supplier_product_code']);
        $insertLegacy->execute([
            uuidV4(),
            (string)$legacyProduct['id'],
            $legacyCode,
            shopNirNormalizeSupplierCode($legacyCode),
            trim((string)($legacyProduct['source_domain'] ?? '')) ?: null,
        ]);
    }

    // Asocierea Boomag -> KIDOTOYS SRL este o regulă contabilă de backend.
    // Migrarea acoperă produsele deja existente; salvările și importurile noi
    // apelează aceeași rutină idempotentă pentru fiecare produs.
    shopNirEnsureBoomagKidotoysReferences($db);

    // NIR-urile vechi pot avea produsul intern asociat, dar fără o referință
    // separată pentru denumirea/codul fiecărui furnizor. Migrarea le repară
    // idempotent, fără să compare ori să modifice SKU-ul intern.
    shopNirBackfillProductSupplierReferences($db, null, [
        'id' => 'system-nir-alias-migration',
        'name' => 'SYSTEM NIR ALIAS MIGRATION',
        'role' => 'admin',
    ]);

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

function validateAuthToken(PDO $db, array $config, array $body): array {
    $token = requestHeader('X-Auth-Token');
    if ($token === '') $token = trim((string)($_GET['authToken'] ?? ($body['auth_token'] ?? '')));
    if ($token === '') jsonResponse(['error' => 'Sesiunea utilizatorului lipseste.'], 401);

    // API-ul SHOP si API-ul principal folosesc acelasi server MySQL. Validarea
    // locala elimina un request HTTP complet din fiecare navigare de manager.
    // Daca instalarea nu permite acces cross-database, pastram fallback-ul HTTP.
    $authDbName = trim((string)($config['auth_db_name'] ?? ''));
    if ($authDbName !== '') {
        try {
            $authDb = safeDbName($authDbName);
            $stmt = $db->prepare(
                "SELECT u.*, s.platform AS session_platform, s.expires_at AS session_expires_at
                 FROM {$authDb}.app_sessions s
                 INNER JOIN {$authDb}.app_users u ON u.id = s.user_id
                 WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.is_active = 1
                 LIMIT 1"
            );
            $tokenHash = hash('sha256', $token);
            $stmt->execute([$tokenHash]);
            $user = $stmt->fetch();
            if (!$user) {
                jsonResponse(['error' => 'Sesiunea a expirat. Autentifica-te din nou.'], 401);
            }
            $sessionPlatform = (string)($user['session_platform'] ?? '');
            $platformAccess = (string)($user['platform_access'] ?? '');
            if ($platformAccess !== 'both' && $platformAccess !== $sessionPlatform) {
                jsonResponse(['error' => 'Contul nu mai are acces la aceasta platforma.'], 403);
            }
            try {
                $db->prepare(
                    "UPDATE {$authDb}.app_sessions
                     SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY)
                     WHERE token_hash = ? AND expires_at < DATE_ADD(NOW(), INTERVAL 7 DAY)"
                )->execute([$tokenHash]);
            } catch (PDOException $refreshError) {
                // SELECT-ul a validat deja sesiunea; lipsa permisiunii de UPDATE
                // nu trebuie sa reactiveze traseul HTTP lent.
            }
            return [
                'id' => (string)$user['id'],
                'username' => (string)$user['username'],
                'display_name' => (string)$user['display_name'],
                'role' => (string)$user['role'],
                'platform_access' => $platformAccess,
                'support_chat_access' => (bool)($user['support_chat_access'] ?? false),
                'client_panel_access' => array_key_exists('client_panel_access', $user) ? (bool)$user['client_panel_access'] : true,
                'client_edit_access' => (bool)($user['client_edit_access'] ?? false),
                'service_sheet_access' => array_key_exists('service_sheet_access', $user) ? (bool)$user['service_sheet_access'] : true,
                'client_financial_access' => array_key_exists('client_financial_access', $user) ? (bool)$user['client_financial_access'] : true,
                'is_active' => true,
                'created_at' => (string)($user['created_at'] ?? ''),
                'updated_at' => (string)($user['updated_at'] ?? ''),
            ];
        } catch (Throwable $error) {
            // Configuratiile mai vechi sau utilizatorii MySQL fara drepturi pe
            // baza principala continua prin validarea HTTP existenta.
        }
    }

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

function customerTokenFromRequest(): string {
    $token = requestHeader('X-Customer-Token');
    if ($token === '') {
        $authorization = requestHeader('Authorization');
        if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $match)) $token = trim((string)$match[1]);
    }
    return preg_match('/^[a-f0-9]{64}$/i', $token) ? strtolower($token) : '';
}

function customerPublicRow(array $row): array {
    return [
        'id' => (string)$row['id'],
        'email' => (string)$row['email'],
        'full_name' => (string)$row['full_name'],
        'phone' => (string)($row['phone'] ?? ''),
        'customer_type' => (string)(($row['customer_type'] ?? 'individual') === 'company' ? 'company' : 'individual'),
        'address' => (string)($row['address'] ?? ''),
        'city' => (string)($row['city'] ?? ''),
        'county' => (string)($row['county'] ?? ''),
        'postal_code' => (string)($row['postal_code'] ?? ''),
        'company_name' => (string)($row['company_name'] ?? ''),
        'company_cui' => (string)($row['company_cui'] ?? ''),
        'company_registration_number' => (string)($row['company_registration_number'] ?? ''),
        'company_address' => (string)($row['company_address'] ?? ''),
        'avatar_url' => (string)($row['avatar_url'] ?? ''),
        'has_password' => !empty($row['password_hash']),
        'google_connected' => !empty($row['google_sub']),
        'created_at' => (string)($row['created_at'] ?? ''),
    ];
}

function issueCustomerSession(PDO $db, string $customerId): string {
    $token = bin2hex(random_bytes(32));
    $db->prepare('DELETE FROM shop_customer_sessions WHERE expires_at <= NOW() OR (customer_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY))')->execute([$customerId]);
    $stmt = $db->prepare('INSERT INTO shop_customer_sessions (id, customer_id, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))');
    $stmt->execute([uuidV4(), $customerId, hash('sha256', $token)]);
    return $token;
}

function requireCustomer(PDO $db): array {
    $token = customerTokenFromRequest();
    if ($token === '') jsonResponse(['error' => 'Autentifică-te pentru a continua.', 'code' => 'customer_auth_required'], 401);
    $stmt = $db->prepare(
        'SELECT c.*, s.id AS session_id
         FROM shop_customer_sessions s
         INNER JOIN shop_customers c ON c.id = s.customer_id
         WHERE s.token_hash = ? AND s.expires_at > NOW()
         LIMIT 1'
    );
    $stmt->execute([hash('sha256', $token)]);
    $customer = $stmt->fetch();
    if (!$customer) jsonResponse(['error' => 'Sesiunea contului a expirat. Autentifică-te din nou.', 'code' => 'customer_session_expired'], 401);
    if (!(bool)$customer['is_active']) jsonResponse(['error' => 'Acest cont a fost dezactivat. Contactează G-Trots pentru mai multe detalii.', 'code' => 'customer_disabled'], 403);
    $db->prepare('UPDATE shop_customer_sessions SET last_seen_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?')->execute([$customer['session_id']]);
    return $customer;
}

function optionalCustomer(PDO $db): ?array {
    $token = customerTokenFromRequest();
    if ($token === '') return null;
    $stmt = $db->prepare('SELECT c.* FROM shop_customer_sessions s INNER JOIN shop_customers c ON c.id = s.customer_id WHERE s.token_hash = ? AND s.expires_at > NOW() AND c.is_active = 1 LIMIT 1');
    $stmt->execute([hash('sha256', $token)]);
    $customer = $stmt->fetch();
    return $customer ?: null;
}

function customerRequestIpHash(): string {
    $ip = requestHeader('CF-Connecting-IP');
    if (!filter_var($ip, FILTER_VALIDATE_IP)) $ip = trim((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    return hash('sha256', $ip === '' ? 'unknown' : $ip);
}

function validatedCustomerPassword($value): string {
    $password = (string)$value;
    if (strlen($password) < 8 || !preg_match('/[A-Za-zĂÂÎȘȚăâîșț]/u', $password) || !preg_match('/\d/', $password)) {
        throw new InvalidArgumentException('Parola trebuie să aibă minimum 8 caractere, cel puțin o literă și o cifră.');
    }
    if (strlen($password) > 200) throw new InvalidArgumentException('Parola introdusă este prea lungă.');
    return $password;
}

function customerAddressPayload(array $body): array {
    $payload = [
        'label' => mb_substr(trim((string)($body['label'] ?? 'Acasă')), 0, 80),
        'recipient_name' => mb_substr(trim((string)($body['recipient_name'] ?? '')), 0, 180),
        'phone' => mb_substr(trim((string)($body['phone'] ?? '')), 0, 50),
        'address' => mb_substr(trim((string)($body['address'] ?? '')), 0, 255),
        'city' => mb_substr(trim((string)($body['city'] ?? '')), 0, 120),
        'county' => mb_substr(trim((string)($body['county'] ?? '')), 0, 120),
        'postal_code' => mb_substr(trim((string)($body['postal_code'] ?? '')), 0, 30),
        'is_default' => boolValue($body['is_default'] ?? false),
    ];
    if ($payload['label'] === '') $payload['label'] = 'Acasă';
    if ($payload['recipient_name'] === '' || $payload['phone'] === '' || $payload['address'] === '' || $payload['city'] === '' || $payload['county'] === '') {
        throw new InvalidArgumentException('Completează destinatarul, telefonul și toate datele adresei.');
    }
    return $payload;
}

function customerOrderResponse(array $order): array {
    $allowed = [
        'id', 'order_number', 'status', 'payment_status', 'payment_method', 'customer_name', 'customer_email',
        'customer_phone', 'customer_type', 'customer_contact_name', 'customer_display_name', 'company_name', 'company_cui', 'company_registration_number', 'company_address',
        'address', 'city', 'county', 'postal_code', 'customer_notes', 'shipping_method_name',
        'subtotal', 'discount_total', 'promotion_code', 'promotion_scope', 'shipping_cost', 'total', 'vat_payer', 'currency', 'tracking_token', 'items', 'status_history',
        'return_reason', 'return_shipping_cost', 'return_refund_amount', 'return_requested_at', 'return_request_source', 'return_bank_account_holder', 'created_at', 'updated_at'
    ];
    $response = array_intersect_key($order, array_flip($allowed));
    $response['status'] = publicOrderStatus((string)($order['status'] ?? 'new'));
    $response['status_label'] = (string)gtOrderStatusMeta((string)$response['status'])['label'];
    $response['status_history'] = publicOrderHistory((array)($response['status_history'] ?? []));
    $response['tracking_url'] = '/urmarire-comanda?token=' . rawurlencode((string)($order['tracking_token'] ?? ''));
    $response['can_request_return'] = GtrotsOrderReturnRequest::canRequestStatus((string)($order['status'] ?? ''));
    $response['return_bank_iban_masked'] = GtrotsOrderReturnRequest::maskIban((string)($order['return_bank_iban'] ?? ''));
    $response['items'] = array_map(fn(array $item): array => [
        'product_id' => (string)($item['product_id'] ?? ''),
        'product_name' => (string)($item['product_name'] ?? ''),
        'product_sku' => (string)($item['product_sku'] ?? ''),
        'quantity' => (int)($item['quantity'] ?? 0),
        'unit_price' => (float)($item['unit_price'] ?? 0),
        'line_total' => (float)($item['line_total'] ?? 0),
        'discount_total' => (float)($item['discount_total'] ?? 0),
        'discounted_unit_price' => (float)($item['discounted_unit_price'] ?? $item['unit_price'] ?? 0),
        'discounted_line_total' => (float)($item['discounted_line_total'] ?? $item['line_total'] ?? 0),
        'image_url' => (string)($item['image_url'] ?? ''),
    ], (array)($order['items'] ?? []));
    $response['status_history'] = array_map(fn(array $entry): array => [
        'to_status' => (string)($entry['to_status'] ?? ''),
        'created_at' => (string)($entry['created_at'] ?? ''),
    ], (array)($response['status_history'] ?? []));
    return $response;
}

function fetchGoogleIdentity(string $credential, string $clientId): array {
    if ($clientId === '') throw new RuntimeException('Autentificarea Google nu este configurată încă.');
    if ($credential === '' || strlen($credential) > 10000) throw new InvalidArgumentException('Răspunsul Google nu este valid.');
    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($credential);
    $raw = false;
    $status = 0;
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 12]);
        $raw = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
    } else {
        $context = stream_context_create(['http' => ['timeout' => 12, 'ignore_errors' => true]]);
        $raw = @file_get_contents($url, false, $context);
        if (!empty($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $match)) $status = (int)$match[1];
    }
    $identity = is_string($raw) ? json_decode($raw, true) : null;
    $issuer = (string)($identity['iss'] ?? '');
    if ($status < 200 || $status >= 300 || !is_array($identity) || !hash_equals($clientId, (string)($identity['aud'] ?? '')) || !in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true) || empty($identity['email_verified']) || (int)($identity['exp'] ?? 0) <= time()) {
        throw new InvalidArgumentException('Autentificarea Google nu a putut fi verificată.');
    }
    return $identity;
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

function normalizedSearchText(mixed $value): string {
    $text = trim((string)$value);
    if ($text === '') return '';
    if (function_exists('iconv')) {
        $converted = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if ($converted !== false) $text = $converted;
    }
    $text = strtolower($text);
    $text = preg_replace('/[^a-z0-9]+/', ' ', $text) ?? '';
    return trim(preg_replace('/\s+/', ' ', $text) ?? '');
}

function productSemanticSearchScore(array $row, string $query): float {
    $normalizedQuery = normalizedSearchText($query);
    if ($normalizedQuery === '') return 1.0;
    $tokens = array_values(array_unique(array_filter(explode(' ', $normalizedQuery), static fn(string $token): bool => strlen($token) >= 2)));
    if (!$tokens) return 0.0;
    $synonyms = [
        'controler' => ['controller'], 'controller' => ['controler'],
        'incarcator' => ['charger', 'alimentator'], 'charger' => ['incarcator', 'alimentator'],
        'anvelopa' => ['cauciuc', 'pneu'], 'cauciuc' => ['anvelopa', 'pneu'], 'pneu' => ['anvelopa', 'cauciuc'],
        'display' => ['ecran', 'bord'], 'ecran' => ['display', 'bord'], 'bord' => ['display', 'ecran'],
        'baterie' => ['acumulator'], 'acumulator' => ['baterie'],
        'frana' => ['frane', 'placute'], 'frane' => ['frana', 'placute'], 'placute' => ['frana', 'frane'],
        'furca' => ['suspensie', 'amortizor'], 'suspensie' => ['furca', 'amortizor'],
        'trotineta' => ['scuter'], 'scuter' => ['trotineta'],
        'lumina' => ['far', 'stop', 'lampa'], 'far' => ['lumina', 'lampa'],
    ];
    $fields = [
        [normalizedSearchText($row['name'] ?? ''), 6.0],
        [normalizedSearchText($row['sku'] ?? ''), 7.0],
        [normalizedSearchText($row['supplier_product_code'] ?? ''), 7.0],
        [normalizedSearchText($row['ean'] ?? ''), 7.0],
        [normalizedSearchText($row['category_name'] ?? ''), 3.4],
        [normalizedSearchText($row['manufacturer_name'] ?? ''), 4.0],
        [normalizedSearchText($row['search_brand_names'] ?? ''), 4.5],
        [normalizedSearchText($row['search_short_description'] ?? ''), 1.8],
        [normalizedSearchText($row['search_description_title'] ?? ''), 2.2],
        [normalizedSearchText($row['source_domain'] ?? ''), 1.2],
    ];
    $score = 0.0;
    $matchedTokens = 0;
    foreach ($tokens as $token) {
        $alternatives = array_values(array_unique([$token, ...($synonyms[$token] ?? [])]));
        $tokenBest = 0.0;
        foreach ($fields as [$field, $weight]) {
            if ($field === '') continue;
            $fieldWords = explode(' ', $field);
            foreach ($alternatives as $alternative) {
                if ($field === $alternative) $tokenBest = max($tokenBest, 24.0 * $weight);
                elseif (in_array($alternative, $fieldWords, true)) $tokenBest = max($tokenBest, 15.0 * $weight);
                elseif (str_contains($field, $alternative)) $tokenBest = max($tokenBest, 10.0 * $weight);
                elseif (strlen($alternative) >= 4) {
                    foreach ($fieldWords as $word) {
                        if (abs(strlen($word) - strlen($alternative)) > 2) continue;
                        $distance = levenshtein($alternative, $word);
                        $allowed = max(1, min(3, (int)floor(strlen($alternative) * 0.32)));
                        if ($distance <= $allowed) $tokenBest = max($tokenBest, (8.5 - ($distance * 1.7)) * $weight);
                    }
                }
            }
        }
        if ($tokenBest > 0) {
            $matchedTokens++;
            $score += $tokenBest;
        } else {
            $score -= 12.0;
        }
    }
    $minimumMatches = max(1, (int)ceil(count($tokens) * 0.55));
    if ($matchedTokens < $minimumMatches) return 0.0;
    $name = normalizedSearchText($row['name'] ?? '');
    if ($name === $normalizedQuery) $score += 220.0;
    elseif (str_contains($name, $normalizedQuery)) $score += 110.0;
    elseif (str_starts_with($name, $tokens[0])) $score += 35.0;
    return $score;
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
    if ($path === '' || !preg_match('#^uploads/(products|descriptions|company)/[a-f0-9]{32}\.(jpg|png|webp|gif)$#i', $path)) return false;
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
    $row['supplier_base_price'] = $row['supplier_base_price'] === null ? null : (float)$row['supplier_base_price'];
    $row['supplier_price_difference'] = $row['supplier_price_difference'] === null ? null : (float)$row['supplier_price_difference'];
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
    $row['accounting_stock_quantity'] = (float)($row['accounting_stock_quantity'] ?? 0);
    $row['low_stock_threshold'] = (int)$row['low_stock_threshold'];
    $row['is_active'] = (bool)$row['is_active'];
    $row['is_featured'] = (bool)$row['is_featured'];
    $row['featured_rank'] = $row['featured_rank'] === null ? null : (int)$row['featured_rank'];
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
        unset($row['source_id'], $row['source_domain'], $row['source_url'], $row['source_name'], $row['source_is_active'], $row['supplier_external_id'], $row['supplier_product_code'], $row['ean'], $row['supplier_base_price'], $row['supplier_price_difference'], $row['supplier_price_updated_at'], $row['content_status'], $row['seo_researched_at'], $row['seo_word_count'], $row['seo_sources']);
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

function normalizedCatalogIdentity(mixed $value): string {
    $identity = html_entity_decode(trim((string)$value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($identity === '') return '';
    if (function_exists('transliterator_transliterate')) {
        $transliterated = transliterator_transliterate('NFD; [:Nonspacing Mark:] Remove; NFC', $identity);
        if (is_string($transliterated)) $identity = $transliterated;
    }
    $identity = mb_strtolower($identity, 'UTF-8');
    return trim((string)preg_replace('/[^\p{L}\p{N}]+/u', ' ', $identity));
}

function catalogProductSlugFamily(array $row): string {
    $tokens = preg_split('/\s+/u', normalizedCatalogIdentity($row['slug'] ?? ''), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $count = count($tokens);
    if ($count > 2 && preg_match('/^(?:varianta|variant)$/', $tokens[$count - 2]) && preg_match('/^\d+$/', $tokens[$count - 1])) {
        array_splice($tokens, -2);
    }
    while (count($tokens) > 3) {
        $last = (string)end($tokens);
        if (preg_match('/^\d+$/', $last) || !in_array($last, array_slice($tokens, 0, -1), true)) break;
        array_pop($tokens);
    }
    return implode('-', $tokens);
}

function deduplicateCatalogProductRows(array $rows): array {
    $keyIndexes = [];
    $unique = [];
    foreach ($rows as $row) {
        $keys = [];
        foreach (['id', 'slug', 'sku', 'ean'] as $field) {
            $value = normalizedCatalogIdentity($row[$field] ?? '');
            if ($value !== '') $keys[] = $field . ':' . $value;
        }
        $name = normalizedCatalogIdentity($row['name'] ?? '');
        if ($name !== '') $keys[] = 'name:' . $name;
        $family = catalogProductSlugFamily($row);
        if ($family !== '') $keys[] = 'family:' . $family;
        $sourceId = normalizedCatalogIdentity($row['source_id'] ?? '');
        $supplierId = normalizedCatalogIdentity($row['supplier_external_id'] ?? '');
        $supplierCode = normalizedCatalogIdentity($row['supplier_product_code'] ?? '');
        if ($sourceId !== '' && $supplierId !== '') $keys[] = 'supplier-id:' . $sourceId . ':' . $supplierId;
        if ($sourceId !== '' && $supplierCode !== '') $keys[] = 'supplier-code:' . $sourceId . ':' . $supplierCode;
        $duplicateIndex = null;
        foreach ($keys as $key) {
            if (isset($keyIndexes[$key])) {
                $duplicateIndex = $keyIndexes[$key];
                break;
            }
        }
        if ($duplicateIndex !== null) {
            $currentSlugLength = strlen((string)($unique[$duplicateIndex]['slug'] ?? '')) ?: PHP_INT_MAX;
            $nextSlugLength = strlen((string)($row['slug'] ?? '')) ?: PHP_INT_MAX;
            if ($nextSlugLength < $currentSlugLength) $unique[$duplicateIndex] = $row;
            foreach ($keys as $key) $keyIndexes[$key] = $duplicateIndex;
            continue;
        }
        $index = count($unique);
        $unique[] = $row;
        foreach ($keys as $key) $keyIndexes[$key] = $index;
    }
    return $unique;
}

function publicCatalogProductRow(array $row): array {
    $images = is_array($row['images'] ?? null) ? array_slice($row['images'], 0, 1) : [];
    $brands = is_array($row['brands'] ?? null) ? array_map(static fn(array $brand): array => [
        'id' => (string)($brand['id'] ?? ''),
        'name' => (string)($brand['name'] ?? ''),
        'slug' => (string)($brand['slug'] ?? ''),
    ], $row['brands']) : [];

    return [
        'id' => (string)($row['id'] ?? ''),
        'slug' => (string)($row['slug'] ?? ''),
        'sku' => (string)($row['sku'] ?? ''),
        'ean' => (string)($row['ean'] ?? ''),
        'name' => (string)($row['name'] ?? ''),
        'short_description' => (string)($row['short_description'] ?? ''),
        'category_id' => empty($row['category_id']) ? null : (string)$row['category_id'],
        'category_name' => (string)($row['category_name'] ?? ''),
        'category_slug' => (string)($row['category_slug'] ?? ''),
        'manufacturer_id' => empty($row['manufacturer_id']) ? null : (string)$row['manufacturer_id'],
        'manufacturer_name' => (string)($row['manufacturer_name'] ?? ''),
        'manufacturer_slug' => (string)($row['manufacturer_slug'] ?? ''),
        'brands' => $brands,
        'images' => $images,
        'price' => (float)($row['price'] ?? 0),
        'sale_price' => $row['sale_price'] === null ? null : (float)$row['sale_price'],
        'discount_type' => (string)($row['discount_type'] ?? 'percent'),
        'discount_value' => $row['discount_value'] === null ? null : (float)$row['discount_value'],
        'currency' => (string)($row['currency'] ?? 'RON'),
        'stock_mode' => (string)($row['stock_mode'] ?? 'tracked'),
        'stock_quantity' => (int)($row['stock_quantity'] ?? 0),
        'low_stock_threshold' => (int)($row['low_stock_threshold'] ?? 0),
        'is_featured' => (bool)($row['is_featured'] ?? false),
        'featured_rank' => $row['featured_rank'] === null ? null : (int)$row['featured_rank'],
        'promotion_price' => $row['promotion_price'] === null ? null : (float)$row['promotion_price'],
        'price_before_promotion' => $row['price_before_promotion'] === null ? null : (float)$row['price_before_promotion'],
        'promotion_discount_percent' => (float)($row['promotion_discount_percent'] ?? 0),
        'active_promotion' => $row['active_promotion'] ?? null,
    ];
}

function compactPublicCatalogPayload(array $products): array {
    return [
        'v' => 1,
        'p' => array_map(static function (array $product): array {
            $image = is_array($product['images'] ?? null) ? ($product['images'][0] ?? null) : null;
            $brands = is_array($product['brands'] ?? null) ? array_map(static fn(array $brand): array => [
                (string)($brand['id'] ?? ''),
                (string)($brand['name'] ?? ''),
                (string)($brand['slug'] ?? ''),
            ], $product['brands']) : [];
            $promotion = is_array($product['active_promotion'] ?? null) ? [
                (string)($product['active_promotion']['id'] ?? ''),
                (string)($product['active_promotion']['code'] ?? ''),
                (string)($product['active_promotion']['title'] ?? ''),
                (string)($product['active_promotion']['discount_type'] ?? ''),
                (float)($product['active_promotion']['discount_value'] ?? 0),
            ] : null;
            return [
                (string)($product['id'] ?? ''),
                (string)($product['slug'] ?? ''),
                (string)($product['sku'] ?? ''),
                (string)($product['ean'] ?? ''),
                (string)($product['name'] ?? ''),
                mb_substr((string)($product['short_description'] ?? ''), 0, 180),
                $product['category_id'] ?? null,
                (string)($product['category_name'] ?? ''),
                (string)($product['category_slug'] ?? ''),
                $product['manufacturer_id'] ?? null,
                (string)($product['manufacturer_name'] ?? ''),
                (string)($product['manufacturer_slug'] ?? ''),
                $brands,
                is_array($image) ? (string)($image['url'] ?? '') : '',
                (float)($product['price'] ?? 0),
                $product['sale_price'] === null ? null : (float)$product['sale_price'],
                (string)($product['discount_type'] ?? 'percent'),
                $product['discount_value'] === null ? null : (float)$product['discount_value'],
                (string)($product['currency'] ?? 'RON'),
                (string)($product['stock_mode'] ?? 'tracked'),
                (int)($product['stock_quantity'] ?? 0),
                (int)($product['low_stock_threshold'] ?? 0),
                (bool)($product['is_featured'] ?? false),
                $product['featured_rank'] === null ? null : (int)$product['featured_rank'],
                $product['promotion_price'] === null ? null : (float)$product['promotion_price'],
                $product['price_before_promotion'] === null ? null : (float)$product['price_before_promotion'],
                (float)($product['promotion_discount_percent'] ?? 0),
                $promotion,
            ];
        }, $products),
    ];
}

function publicCatalogProductSelectSql(): string {
    return 'SELECT p.id, p.category_id, p.manufacturer_id, p.source_id,
                   p.sku, p.supplier_external_id, p.supplier_product_code, p.ean,
                   p.name, p.slug, p.short_description,
                   p.price, p.sale_price, p.discount_type, p.discount_value, p.currency,
                   p.stock_mode, p.stock_quantity, p.low_stock_threshold,
                   p.is_featured, p.featured_rank,
                   c.name AS category_name, c.slug AS category_slug,
                   m.name AS manufacturer_name, m.slug AS manufacturer_slug
            FROM shop_products p
            LEFT JOIN shop_categories c ON c.id = p.category_id
            LEFT JOIN shop_manufacturers m ON m.id = p.manufacturer_id
            LEFT JOIN shop_product_sources s ON s.id = p.source_id';
}

function publicCatalogRows(PDO $db, array $rows, array $config): array {
    if (!$rows) return [];
    $hydrateStartedAt = microtime(true);
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
    $imageRows = $imageStmt->fetchAll();
    $imagesFetchedAt = microtime(true);
    foreach ($imageRows as $image) {
        $productId = (string)$image['product_id'];
        if (isset($imagesByProduct[$productId])) continue;
        $path = (string)$image['image_path'];
        $imagesByProduct[$productId] = [[
            'id' => (string)$image['id'],
            'url' => preg_match('#^https?://#i', $path)
                ? $path
                : rtrim((string)$config['public_base_url'], '/') . '/' . ltrim($path, '/'),
            'alt_text' => (string)($image['alt_text'] ?? ''),
            'sort_order' => (int)$image['sort_order'],
        ]];
    }

    $brandsByProduct = [];
    $brandStmt = $db->prepare(
        "SELECT pb.product_id, b.id, b.name, b.slug
         FROM shop_product_brands pb
         INNER JOIN shop_brands b ON b.id = pb.brand_id
         WHERE pb.product_id IN ({$placeholders})
         ORDER BY pb.product_id ASC, b.name ASC"
    );
    $brandStmt->execute($ids);
    $brandRows = $brandStmt->fetchAll();
    $brandsFetchedAt = microtime(true);
    foreach ($brandRows as $brand) {
        $productId = (string)$brand['product_id'];
        unset($brand['product_id']);
        $brandsByProduct[$productId][] = $brand;
    }

    $result = array_map(static function (array $row) use ($config, $imagesByProduct, $brandsByProduct): array {
        $productId = (string)$row['id'];
        $row['images'] = $imagesByProduct[$productId] ?? [];
        if (!$row['images']) {
            $legacyImageUrl = legacyProductImageUrl($row, $config);
            if ($legacyImageUrl !== '') {
                $row['images'][] = [
                    'id' => 'legacy-image-' . (string)($row['slug'] ?? ''),
                    'url' => $legacyImageUrl,
                    'alt_text' => (string)($row['name'] ?? 'Produs G-Trots'),
                    'sort_order' => 0,
                    'is_legacy' => true,
                ];
            }
        }
        $row['brands'] = $brandsByProduct[$productId] ?? [];
        return $row;
    }, $rows);
    $GLOBALS['shopPublicCatalogHydrationTiming'] = [
        'images' => ($imagesFetchedAt - $hydrateStartedAt) * 1000,
        'brands' => ($brandsFetchedAt - $imagesFetchedAt) * 1000,
        'map' => (microtime(true) - $brandsFetchedAt) * 1000,
    ];
    return $result;
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

function productStockOrderSql(): string {
    return 'CASE
                WHEN p.stock_mode = "unlimited" OR p.stock_quantity > p.low_stock_threshold THEN 0
                WHEN p.stock_quantity > 0 THEN 1
                ELSE 2
            END';
}

function productListSql(): string {
    return 'SELECT p.id, p.category_id, p.manufacturer_id, p.source_id, p.sku,
                   p.supplier_product_code, p.ean, p.source_domain, p.name, p.slug,
                   p.short_description AS search_short_description,
                   p.description_title AS search_description_title,
                   p.price, p.sale_price, p.discount_type, p.discount_value, p.currency,
                   p.stock_mode, p.stock_quantity, p.supplier_stock_quantity,
                   p.accounting_stock_quantity, p.low_stock_threshold, p.is_active,
                   p.is_featured, c.name AS category_name, m.name AS manufacturer_name,
                   (SELECT GROUP_CONCAT(b.name SEPARATOR " ") FROM shop_product_brands pb INNER JOIN shop_brands b ON b.id = pb.brand_id WHERE pb.product_id = p.id) AS search_brand_names,
                   s.name AS source_name,
                   (SELECT pi.image_path FROM shop_product_images pi
                    WHERE pi.product_id = p.id
                    ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image_path
            FROM shop_products p
            LEFT JOIN shop_categories c ON c.id = p.category_id
            LEFT JOIN shop_manufacturers m ON m.id = p.manufacturer_id
            LEFT JOIN shop_product_sources s ON s.id = p.source_id';
}

function productListRows(array $rows, array $config): array {
    return array_map(static function (array $row) use ($config): array {
        $path = trim((string)($row['image_path'] ?? ''));
        unset($row['image_path'], $row['search_short_description'], $row['search_description_title'], $row['search_brand_names'], $row['_search_score']);
        $row['id'] = (string)$row['id'];
        $row['category_id'] = empty($row['category_id']) ? null : (string)$row['category_id'];
        $row['manufacturer_id'] = empty($row['manufacturer_id']) ? null : (string)$row['manufacturer_id'];
        $row['source_id'] = empty($row['source_id']) ? null : (string)$row['source_id'];
        $row['price'] = (float)($row['price'] ?? 0);
        $row['sale_price'] = $row['sale_price'] === null ? null : (float)$row['sale_price'];
        $row['discount_value'] = $row['discount_value'] === null ? null : (float)$row['discount_value'];
        $row['stock_quantity'] = (int)($row['stock_quantity'] ?? 0);
        $row['supplier_stock_quantity'] = (int)($row['supplier_stock_quantity'] ?? 0);
        $row['accounting_stock_quantity'] = (int)($row['accounting_stock_quantity'] ?? 0);
        $row['low_stock_threshold'] = (int)($row['low_stock_threshold'] ?? 0);
        $row['is_active'] = (bool)($row['is_active'] ?? false);
        $row['is_featured'] = (bool)($row['is_featured'] ?? false);
        $row['images'] = $path === '' ? [] : [[
            'id' => 'primary-' . (string)$row['id'],
            'url' => preg_match('#^https?://#i', $path) ? $path : rtrim((string)$config['public_base_url'], '/') . '/' . ltrim($path, '/'),
            'alt_text' => (string)($row['name'] ?? ''),
            'sort_order' => 0,
        ]];
        return $row;
    }, $rows);
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

function seoResearchPayload(array $body, bool $finalCatalog = false): array {
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
    $minimumWords = $finalCatalog ? 600 : 2500;
    $maximumWords = $finalCatalog ? 1800 : 3400;
    if ($wordCount < $minimumWords || $wordCount > $maximumWords) {
        throw new InvalidArgumentException('Descrierea lunga trebuie sa aiba intre ' . $minimumWords . ' si ' . $maximumWords . ' de cuvinte; continutul primit are ' . $wordCount . '.');
    }
    $minimumMetaTitleLength = $finalCatalog ? 15 : 35;
    if (mb_strlen($metaTitle) < $minimumMetaTitleLength || mb_strlen($metaTitle) > 70) {
        throw new InvalidArgumentException('Meta titlul trebuie sa aiba intre ' . $minimumMetaTitleLength . ' si 70 de caractere.');
    }
    if (mb_strlen($metaDescription) < 120 || mb_strlen($metaDescription) > 180) {
        throw new InvalidArgumentException('Meta descrierea trebuie sa aiba intre 120 si 180 de caractere.');
    }
    $repetitionIssues = seoRepetitionIssues($shortDescription, $metaDescription, $descriptionHtml);
    if (!$finalCatalog && $repetitionIssues) {
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
    $minimumSpecifications = $finalCatalog ? 5 : 8;
    if (count($specifications) < $minimumSpecifications) {
        throw new InvalidArgumentException('O fisa SEO finalizata trebuie sa aiba minimum ' . $minimumSpecifications . ' specificatii verificate.');
    }

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
    $minimumSources = $finalCatalog ? 1 : 2;
    if (count($sources) < $minimumSources) throw new InvalidArgumentException('Salveaza minimum ' . $minimumSources . ' surse folosite in cercetarea produsului.');

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

function companySettingsRow(array $row, array $config): array {
    $row['id'] = (int)($row['id'] ?? 0);
    $row['vat_payer'] = (bool)($row['vat_payer'] ?? false);
    $row['vat_rate'] = (float)($row['vat_rate'] ?? 19);
    $row['is_default'] = (bool)($row['is_default'] ?? false);
    $row['stamp_url'] = !empty($row['stamp_path']) ? rtrim((string)$config['public_base_url'], '/') . '/' . ltrim((string)$row['stamp_path'], '/') : null;
    return $row;
}

function companySettingsList(PDO $db, array $config): array {
    return array_map(fn(array $row): array => companySettingsRow($row, $config), $db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC, legal_name ASC, id ASC')->fetchAll());
}

function companySettingsPayload(array $body): array {
    $field = static fn(string $key, int $max): string => mb_substr(trim((string)($body[$key] ?? '')), 0, $max);
    $email = $field('email', 180);
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Adresa de e-mail a firmei nu este validă.');
    $website = $field('website', 180);
    if ($website !== '' && !filter_var($website, FILTER_VALIDATE_URL)) throw new InvalidArgumentException('Adresa website-ului nu este validă.');
    $vatRate = round((float)str_replace(',', '.', (string)($body['vat_rate'] ?? 19)), 2);
    if ($vatRate < 0 || $vatRate > 100) throw new InvalidArgumentException('Cota TVA trebuie să fie între 0% și 100%.');
    return [
        'legal_name' => $field('legal_name', 180),
        'trade_name' => $field('trade_name', 180),
        'cui' => $field('cui', 60),
        'registration_number' => $field('registration_number', 80),
        'address' => $field('address', 255),
        'city' => $field('city', 120),
        'county' => $field('county', 120),
        'postal_code' => $field('postal_code', 30),
        'country' => $field('country', 80),
        'email' => $email,
        'phone' => $field('phone', 50),
        'website' => $website,
        'bank_name' => $field('bank_name', 180),
        'iban' => strtoupper(str_replace(' ', '', $field('iban', 80))),
        'share_capital' => $field('share_capital', 80),
        'vat_payer' => boolValue($body['vat_payer'] ?? false),
        'vat_rate' => $vatRate,
        'is_default' => boolValue($body['is_default'] ?? false),
    ];
}

function receiptLocationRow(array $row): array {
    $row['company_id'] = (int)($row['company_id'] ?? 0);
    $row['is_default'] = (bool)($row['is_default'] ?? false);
    $row['sort_order'] = (int)($row['sort_order'] ?? 0);
    return $row;
}

function receiptLocationDisplay(array $row): string {
    $address = implode(', ', array_values(array_filter([
        trim((string)($row['address'] ?? '')),
        trim((string)($row['city'] ?? '')),
        trim((string)($row['county'] ?? '')),
        trim((string)($row['postal_code'] ?? '')),
    ])));
    $name = trim((string)($row['name'] ?? '')) ?: 'Gestiune principală';
    return mb_substr($name . ($address !== '' ? ' — ' . $address : ''), 0, 500);
}

function receiptLocationPayload(array $body): array {
    $field = static fn(string $key, int $max): string => mb_substr(trim((string)($body[$key] ?? '')), 0, $max);
    $name = $field('name', 180);
    if ($name === '') throw new InvalidArgumentException('Denumirea punctului de recepție este obligatorie.');
    return [
        'company_id' => max(1, (int)($body['company_id'] ?? 1)),
        'name' => $name,
        'address' => $field('address', 255),
        'city' => $field('city', 120),
        'county' => $field('county', 120),
        'postal_code' => $field('postal_code', 30),
        'is_default' => boolValue($body['is_default'] ?? false),
        'sort_order' => max(0, (int)($body['sort_order'] ?? 0)),
    ];
}

function receiptLocationList(PDO $db, int $companyId = 0): array {
    if ($companyId <= 0) $companyId = (int)($db->query('SELECT id FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetchColumn() ?: 1);
    $stmt = $db->prepare('SELECT * FROM shop_company_receipt_locations WHERE company_id = ? ORDER BY is_default DESC, sort_order ASC, name ASC, id ASC');
    $stmt->execute([$companyId]);
    return array_map('receiptLocationRow', $stmt->fetchAll());
}

function shippingRow(array $row): array {
    $row['cost'] = (float)$row['cost'];
    $row['return_cost'] = (float)($row['return_cost'] ?? 0);
    $row['free_above'] = $row['free_above'] === null ? null : (float)$row['free_above'];
    $row['sort_order'] = (int)$row['sort_order'];
    $row['is_active'] = (bool)$row['is_active'];
    return $row;
}

function supplierRow(array $row): array {
    $row['alias'] = trim((string)($row['alias'] ?? '')) ?: (string)($row['name'] ?? '');
    $row['display_name'] = $row['alias'];
    $row['is_active'] = (bool)$row['is_active'];
    $row['is_vat_payer'] = (bool)($row['is_vat_payer'] ?? true);
    $row['row_version'] = (int)($row['row_version'] ?? 1);
    return $row;
}

function supplierPayload(array $body): array {
    $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 180);
    if ($name === '') throw new InvalidArgumentException('Numele furnizorului este obligatoriu.');
    $alias = mb_substr(trim((string)($body['alias'] ?? '')), 0, 180);
    if ($alias === '') $alias = $name;
    $email = mb_substr(strtolower(trim((string)($body['email'] ?? ''))), 0, 180);
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new InvalidArgumentException('Adresa de e-mail a furnizorului nu este valida.');
    }
    return [
        'name' => $name,
        'alias' => $alias,
        'contact_person' => mb_substr(trim((string)($body['contact_person'] ?? '')), 0, 180),
        'email' => $email,
        'phone' => mb_substr(trim((string)($body['phone'] ?? '')), 0, 50),
        'website' => mb_substr(trim((string)($body['website'] ?? '')), 0, 255),
        'cui' => mb_substr(strtoupper(trim((string)($body['cui'] ?? ''))), 0, 60),
        'registration_number' => mb_substr(strtoupper(trim((string)($body['registration_number'] ?? ''))), 0, 80),
        'vat_number' => mb_substr(strtoupper(trim((string)($body['vat_number'] ?? ''))), 0, 60),
        'is_vat_payer' => boolValue($body['is_vat_payer'] ?? true, true),
        'default_vat_rate' => trim((string)($body['default_vat_rate'] ?? '')) === '' ? null : shopNirScaledToDecimal(shopNirDecimalToScaled($body['default_vat_rate'], 4, 'Cota TVA implicită'), 4),
        'address' => mb_substr(trim((string)($body['address'] ?? '')), 0, 255),
        'address_line2' => mb_substr(trim((string)($body['address_line2'] ?? '')), 0, 255),
        'city' => mb_substr(trim((string)($body['city'] ?? '')), 0, 120),
        'county' => mb_substr(trim((string)($body['county'] ?? '')), 0, 120),
        'postal_code' => mb_substr(trim((string)($body['postal_code'] ?? '')), 0, 30),
        'country' => mb_substr(trim((string)($body['country'] ?? 'România')), 0, 80),
        'default_currency' => strtoupper(mb_substr(trim((string)($body['default_currency'] ?? 'RON')), 0, 3)),
        'payment_terms' => mb_substr(trim((string)($body['payment_terms'] ?? '')), 0, 180),
        'notes' => trim((string)($body['notes'] ?? '')),
        'is_active' => boolValue($body['is_active'] ?? true, true),
    ];
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

function promotionPayload(PDO $db, array $body): array {
    $code = strtoupper(preg_replace('/[^A-Z0-9_-]+/i', '', trim((string)($body['code'] ?? ''))) ?? '');
    $title = mb_substr(trim((string)($body['title'] ?? '')), 0, 180);
    $discountType = trim((string)($body['discount_type'] ?? 'percent'));
    $discountValue = round((float)($body['discount_value'] ?? 0), 2);
    $audience = trim((string)($body['audience'] ?? 'all'));
    $scope = trim((string)($body['scope'] ?? 'global'));
    $usageMode = trim((string)($body['usage_mode'] ?? 'unlimited'));
    $rawProductIds = is_array($body['product_ids'] ?? null) ? $body['product_ids'] : [];
    if (!$rawProductIds && trim((string)($body['product_id'] ?? '')) !== '') $rawProductIds = [$body['product_id']];
    $productIds = $scope === 'product'
        ? array_values(array_unique(array_filter(array_map(static fn($value): string => trim((string)$value), $rawProductIds))))
        : [];
    $productId = $productIds[0] ?? null;
    $rawCustomerIds = is_array($body['customer_ids'] ?? null) ? $body['customer_ids'] : [];
    $customerIds = $audience === 'selected'
        ? array_values(array_unique(array_filter(array_map(static fn($value): string => trim((string)$value), $rawCustomerIds))))
        : [];
    if ($code === '' || $title === '') throw new InvalidArgumentException('Completează codul și titlul reducerii.');
    if (!in_array($discountType, ['percent', 'fixed'], true) || $discountValue <= 0 || ($discountType === 'percent' && $discountValue > 100)) throw new InvalidArgumentException('Valoarea reducerii nu este validă.');
    if (!in_array($audience, ['all', 'registered', 'selected'], true)) throw new InvalidArgumentException('Publicul reducerii nu este valid.');
    if (!in_array($scope, ['global', 'product'], true)) throw new InvalidArgumentException('Tipul aplicării nu este valid.');
    if (!in_array($usageMode, ['unlimited', 'once_per_customer', 'once_per_device'], true)) throw new InvalidArgumentException('Limita de utilizare nu este validă.');
    if ($scope === 'product') {
        if (!$productIds || count($productIds) > 2500) throw new InvalidArgumentException('Alege cel puțin un produs valid pentru reducere.');
        $placeholders = implode(',', array_fill(0, count($productIds), '?'));
        $exists = $db->prepare("SELECT COUNT(*) FROM shop_products WHERE id IN ({$placeholders})");
        $exists->execute($productIds);
        if ((int)$exists->fetchColumn() !== count($productIds)) throw new InvalidArgumentException('Unul dintre produsele selectate nu mai există.');
    }
    if ($audience === 'selected') {
        if (!$customerIds || count($customerIds) > 2500) throw new InvalidArgumentException('Alege cel puțin un client valid pentru reducere.');
        $placeholders = implode(',', array_fill(0, count($customerIds), '?'));
        $exists = $db->prepare("SELECT COUNT(*) FROM shop_customers WHERE id IN ({$placeholders})");
        $exists->execute($customerIds);
        if ((int)$exists->fetchColumn() !== count($customerIds)) throw new InvalidArgumentException('Unul dintre clienții selectați nu mai există.');
    }
    $normalizeDate = static function ($value): ?string {
        $value = trim((string)$value);
        if ($value === '') return null;
        $timestamp = strtotime($value);
        if ($timestamp === false) throw new InvalidArgumentException('Perioada reducerii nu este validă.');
        return date('Y-m-d H:i:s', $timestamp);
    };
    $validFrom = $normalizeDate($body['valid_from'] ?? null);
    $validUntil = $normalizeDate($body['valid_until'] ?? null);
    if ($validFrom && $validUntil && $validUntil <= $validFrom) throw new InvalidArgumentException('Data finală trebuie să fie după data de început.');
    return [
        'code' => $code,
        'title' => $title,
        'description' => mb_substr(trim((string)($body['description'] ?? '')), 0, 500),
        'discount_type' => $discountType,
        'discount_value' => $discountValue,
        'min_order_value' => trim((string)($body['min_order_value'] ?? '')) === '' ? null : max(0, round((float)$body['min_order_value'], 2)),
        'audience' => $audience,
        'scope' => $scope,
        'product_id' => $productId,
        'product_ids' => $productIds,
        'customer_ids' => $customerIds,
        'usage_mode' => $usageMode,
        'auto_apply' => boolValue($body['auto_apply'] ?? true, true),
        'show_banner' => boolValue($body['show_banner'] ?? true, true),
        'banner_text' => mb_substr(trim((string)($body['banner_text'] ?? $title)), 0, 260),
        'valid_from' => $validFrom,
        'valid_until' => $validUntil,
        'is_active' => boolValue($body['is_active'] ?? true, true),
    ];
}

function promotionProductIds(PDO $db, string $couponId, ?string $legacyProductId = null): array {
    $stmt = $db->prepare('SELECT product_id FROM shop_coupon_products WHERE coupon_id = ? ORDER BY product_id ASC');
    $stmt->execute([$couponId]);
    $ids = array_values(array_filter(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN))));
    if (!$ids && $legacyProductId) $ids = [$legacyProductId];
    return $ids;
}

function syncPromotionProducts(PDO $db, string $couponId, array $productIds): void {
    $db->prepare('DELETE FROM shop_coupon_products WHERE coupon_id = ?')->execute([$couponId]);
    if (!$productIds) return;
    $insert = $db->prepare('INSERT INTO shop_coupon_products (coupon_id, product_id) VALUES (?, ?)');
    foreach ($productIds as $productId) $insert->execute([$couponId, $productId]);
}

function promotionCustomerIds(PDO $db, string $couponId): array {
    $stmt = $db->prepare('SELECT customer_id FROM shop_customer_coupons WHERE coupon_id = ? ORDER BY customer_id ASC');
    $stmt->execute([$couponId]);
    return array_values(array_filter(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN))));
}

function syncPromotionCustomers(PDO $db, string $couponId, array $customerIds): void {
    $db->prepare('DELETE FROM shop_customer_coupons WHERE coupon_id = ?')->execute([$couponId]);
    if (!$customerIds) return;
    $insert = $db->prepare('INSERT INTO shop_customer_coupons (customer_id, coupon_id) VALUES (?, ?)');
    foreach ($customerIds as $customerId) $insert->execute([$customerId, $couponId]);
}

function promotionDeviceHash(array $body = []): string {
    $token = trim((string)($body['device_token'] ?? requestHeader('X-Shop-Device')));
    if ($token === '' || !preg_match('/^[A-Za-z0-9_-]{20,128}$/', $token)) return '';
    return hash('sha256', $token);
}

function promotionUsageError(PDO $db, string $code, ?array $customer, string $deviceHash): ?string {
    $stmt = $db->prepare(
        "SELECT id, usage_mode
         FROM shop_coupons
         WHERE code = ? AND is_active = 1
           AND (valid_from IS NULL OR valid_from <= NOW())
           AND (valid_until IS NULL OR valid_until >= NOW())
         LIMIT 1"
    );
    $stmt->execute([strtoupper(trim($code))]);
    $promotion = $stmt->fetch();
    if (!$promotion) return null;
    $mode = (string)($promotion['usage_mode'] ?? 'unlimited');
    if ($mode === 'once_per_customer') {
        if (!$customer) return 'Autentifică-te în cont pentru a folosi această reducere o singură dată.';
        $used = $db->prepare('SELECT 1 FROM shop_coupon_customer_usage WHERE coupon_id = ? AND customer_id = ? LIMIT 1');
        $used->execute([(string)$promotion['id'], (string)$customer['id']]);
        if ($used->fetchColumn()) return 'Această reducere a fost deja folosită pe contul tău.';
    }
    if ($mode === 'once_per_device') {
        if ($deviceHash === '') return 'Dispozitivul nu a putut fi identificat. Reîncarcă pagina și încearcă din nou.';
        $used = $db->prepare('SELECT 1 FROM shop_coupon_device_usage WHERE coupon_id = ? AND device_hash = ? LIMIT 1');
        $used->execute([(string)$promotion['id'], $deviceHash]);
        if ($used->fetchColumn()) return 'Această reducere a fost deja folosită pe acest dispozitiv.';
    }
    return null;
}

function reservePromotionUsage(PDO $db, array $promotion, ?array $customer, string $deviceHash, string $orderId): void {
    if (empty($promotion['id'])) return;
    $mode = (string)($promotion['usage_mode'] ?? 'unlimited');
    if ($mode === 'once_per_customer') {
        if (!$customer) throw new InvalidArgumentException('Autentifică-te în cont pentru a folosi această reducere o singură dată.');
        $stmt = $db->prepare('INSERT IGNORE INTO shop_coupon_customer_usage (coupon_id, customer_id, order_id) VALUES (?, ?, ?)');
        $stmt->execute([(string)$promotion['id'], (string)$customer['id'], $orderId]);
        if ($stmt->rowCount() !== 1) throw new InvalidArgumentException('Această reducere a fost deja folosită pe contul tău.');
    } elseif ($mode === 'once_per_device') {
        if ($deviceHash === '') throw new InvalidArgumentException('Dispozitivul nu a putut fi identificat. Reîncarcă pagina și încearcă din nou.');
        $stmt = $db->prepare('INSERT IGNORE INTO shop_coupon_device_usage (coupon_id, device_hash, order_id) VALUES (?, ?, ?)');
        $stmt->execute([(string)$promotion['id'], $deviceHash, $orderId]);
        if ($stmt->rowCount() !== 1) throw new InvalidArgumentException('Această reducere a fost deja folosită pe acest dispozitiv.');
    }
}

function releasePromotionUsage(PDO $db, string $orderId): void {
    $db->prepare('DELETE FROM shop_coupon_customer_usage WHERE order_id = ?')->execute([$orderId]);
    $db->prepare('DELETE FROM shop_coupon_device_usage WHERE order_id = ?')->execute([$orderId]);
}

function activePromotionRowsForCustomer(PDO $db, ?array $customer, bool $autoOnly = false, ?string $requestedCode = null, string $deviceHash = ''): array {
    $params = [];
    $audienceSql = "c.audience = 'all'";
    if ($customer) {
        $audienceSql = "(c.audience IN ('all', 'registered') OR (c.audience = 'selected' AND EXISTS (
            SELECT 1 FROM shop_customer_coupons eligible_customer
            WHERE eligible_customer.coupon_id = c.id AND eligible_customer.customer_id = ?
        )))";
        $params[] = (string)$customer['id'];
    }
    $where = [
        'c.is_active = 1',
        '(' . $audienceSql . ')',
        '(c.valid_from IS NULL OR c.valid_from <= NOW())',
        '(c.valid_until IS NULL OR c.valid_until >= NOW())',
    ];
    if ($customer) {
        $where[] = "(c.usage_mode <> 'once_per_customer' OR NOT EXISTS (
            SELECT 1 FROM shop_coupon_customer_usage customer_usage
            WHERE customer_usage.coupon_id = c.id AND customer_usage.customer_id = ?
        ))";
        $params[] = (string)$customer['id'];
    } else {
        $where[] = "c.usage_mode <> 'once_per_customer'";
    }
    if ($deviceHash !== '') {
        $where[] = "(c.usage_mode <> 'once_per_device' OR NOT EXISTS (
            SELECT 1 FROM shop_coupon_device_usage device_usage
            WHERE device_usage.coupon_id = c.id AND device_usage.device_hash = ?
        ))";
        $params[] = $deviceHash;
    } else {
        $where[] = "c.usage_mode <> 'once_per_device'";
    }
    $cleanRequestedCode = strtoupper(trim((string)$requestedCode));
    if ($cleanRequestedCode !== '') {
        $where[] = 'c.code = ?';
        $params[] = $cleanRequestedCode;
    } elseif ($autoOnly || $requestedCode !== null) {
        $where[] = 'c.auto_apply = 1';
    }
    $stmt = $db->prepare(
        'SELECT c.*, p.name AS product_name, p.slug AS product_slug
         FROM shop_coupons c
         LEFT JOIN shop_products p ON p.id = c.product_id
         WHERE ' . implode(' AND ', $where) . '
         ORDER BY c.show_banner DESC, c.valid_until ASC, c.created_at DESC'
    );
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function promotionRow(PDO $db, array $row): array {
    $row['discount_value'] = (float)$row['discount_value'];
    $row['min_order_value'] = $row['min_order_value'] === null ? null : (float)$row['min_order_value'];
    foreach (['auto_apply', 'show_banner', 'is_active'] as $key) $row[$key] = (bool)$row[$key];
    $row['usage_mode'] = (string)($row['usage_mode'] ?? 'unlimited');
    $row['product_ids'] = promotionProductIds($db, (string)$row['id'], $row['product_id'] ? (string)$row['product_id'] : null);
    $row['customer_ids'] = promotionCustomerIds($db, (string)$row['id']);
    $row['customer_count'] = count($row['customer_ids']);
    $stats = promotionStatsSummary($db, (string)$row['id']);
    $row['application_count'] = $stats['application_count'];
    $row['total_discount_given'] = $stats['total_discount_given'];
    $row['average_discount'] = $stats['average_discount'];
    return $row;
}

function promotionStatsSummary(PDO $db, string $promotionId): array {
    $stmt = $db->prepare(
        "SELECT
            COUNT(*) AS all_application_count,
            SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN 1 ELSE 0 END) AS application_count,
            COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN discount_total ELSE 0 END), 0) AS total_discount_given,
            COALESCE(AVG(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN discount_total ELSE NULL END), 0) AS average_discount,
            COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total ELSE 0 END), 0) AS orders_total
         FROM shop_orders
         WHERE promotion_id = ? AND discount_total > 0"
    );
    $stmt->execute([$promotionId]);
    $stats = $stmt->fetch() ?: [];
    return [
        'all_application_count' => (int)($stats['all_application_count'] ?? 0),
        'application_count' => (int)($stats['application_count'] ?? 0),
        'total_discount_given' => round((float)($stats['total_discount_given'] ?? 0), 2),
        'average_discount' => round((float)($stats['average_discount'] ?? 0), 2),
        'orders_total' => round((float)($stats['orders_total'] ?? 0), 2),
    ];
}

function applyCatalogPromotionPrices(PDO $db, array $products, ?array $customer, string $deviceHash = ''): array {
    if (!$products) return [];
    $promotions = activePromotionRowsForCustomer($db, $customer, true, null, $deviceHash);
    $productIdsByPromotion = [];
    foreach ($promotions as $promotion) {
        if ((string)$promotion['scope'] === 'product') {
            $productIdsByPromotion[(string)$promotion['id']] = promotionProductIds(
                $db,
                (string)$promotion['id'],
                $promotion['product_id'] ? (string)$promotion['product_id'] : null
            );
        }
    }

    foreach ($products as &$product) {
        $basePrice = $product['sale_price'] !== null ? (float)$product['sale_price'] : (float)$product['price'];
        $bestDiscount = 0.0;
        $bestPromotion = null;
        foreach ($promotions as $promotion) {
            if ($promotion['min_order_value'] !== null && $basePrice < (float)$promotion['min_order_value']) continue;
            // Reducerile aplicate întregii comenzi se calculează doar în coș/checkout.
            // Catalogul afișează preț redus doar pentru promoțiile dedicate produselor.
            if ((string)$promotion['scope'] === 'global') continue;
            if ((string)$promotion['scope'] === 'product') {
                $eligibleIds = $productIdsByPromotion[(string)$promotion['id']] ?? [];
                if (!in_array((string)$product['id'], $eligibleIds, true)) continue;
            }
            $discount = (string)$promotion['discount_type'] === 'percent'
                ? round($basePrice * min(100.0, (float)$promotion['discount_value']) / 100, 2)
                : min($basePrice, round((float)$promotion['discount_value'], 2));
            if ($discount > $bestDiscount) {
                $bestDiscount = $discount;
                $bestPromotion = $promotion;
            }
        }
        $product['promotion_price'] = $bestPromotion ? round(max(0, $basePrice - $bestDiscount), 2) : null;
        $product['price_before_promotion'] = $bestPromotion ? round($basePrice, 2) : null;
        $product['promotion_discount_percent'] = $bestPromotion && $basePrice > 0
            ? round(($bestDiscount / $basePrice) * 100, 2)
            : 0.0;
        $product['active_promotion'] = $bestPromotion ? [
            'id' => (string)$bestPromotion['id'],
            'code' => (string)$bestPromotion['code'],
            'title' => (string)$bestPromotion['title'],
            'discount_type' => (string)$bestPromotion['discount_type'],
            'discount_value' => (float)$bestPromotion['discount_value'],
        ] : null;
    }
    unset($product);
    return $products;
}

function bestOrderPromotion(PDO $db, array $resolvedItems, float $subtotal, ?array $customer, ?string $requestedCode = null, string $deviceHash = ''): array {
    $requestedCode = strtoupper(trim((string)$requestedCode));
    $best = [
        'id' => null,
        'code' => null,
        'title' => null,
        'scope' => null,
        'discount_type' => null,
        'discount_value' => 0.0,
        'usage_mode' => 'unlimited',
        'min_order_value' => null,
        'eligible_product_ids' => [],
        'discount_total' => 0.0,
    ];
    foreach (activePromotionRowsForCustomer($db, $customer, false, $requestedCode, $deviceHash) as $promotion) {
        if (!(bool)$promotion['auto_apply'] && $requestedCode !== strtoupper((string)$promotion['code'])) continue;
        if ($promotion['min_order_value'] !== null && $subtotal < (float)$promotion['min_order_value']) continue;
        $eligibleBase = $subtotal;
        $eligibleProductIds = [];
        $discount = 0.0;
        if ((string)$promotion['scope'] === 'product') {
            $eligibleProductIds = promotionProductIds($db, (string)$promotion['id'], $promotion['product_id'] ? (string)$promotion['product_id'] : null);
            $eligibleBase = 0.0;
            foreach ($resolvedItems as $item) {
                if (in_array((string)($item['product']['id'] ?? ''), $eligibleProductIds, true)) {
                    $lineTotal = (float)$item['line_total'];
                    $quantity = max(1, (int)($item['quantity'] ?? 1));
                    $eligibleBase += $lineTotal;
                    $discount += (string)$promotion['discount_type'] === 'percent'
                        ? round($lineTotal * min(100.0, (float)$promotion['discount_value']) / 100, 2)
                        : min($lineTotal, round((float)$promotion['discount_value'] * $quantity, 2));
                }
            }
        } else {
            $discount = (string)$promotion['discount_type'] === 'percent'
                ? round($subtotal * min(100.0, (float)$promotion['discount_value']) / 100, 2)
                : min($subtotal, round((float)$promotion['discount_value'], 2));
        }
        if ($eligibleBase <= 0) continue;
        if ($discount > (float)$best['discount_total']) {
            $best = [
                'id' => (string)$promotion['id'],
                'code' => (string)$promotion['code'],
                'title' => (string)$promotion['title'],
                'scope' => (string)$promotion['scope'],
                'discount_type' => (string)$promotion['discount_type'],
                'discount_value' => (float)$promotion['discount_value'],
                'usage_mode' => (string)($promotion['usage_mode'] ?? 'unlimited'),
                'min_order_value' => $promotion['min_order_value'] === null ? null : (float)$promotion['min_order_value'],
                'eligible_product_ids' => $eligibleProductIds,
                'discount_total' => min($subtotal, $discount),
            ];
        }
    }
    return $best;
}

function promotionQuoteItems(array $resolvedItems, array $promotion): array {
    $isProductPromotion = ($promotion['id'] ?? null) !== null && (string)($promotion['scope'] ?? '') === 'product';
    $eligibleProductIds = is_array($promotion['eligible_product_ids'] ?? null) ? $promotion['eligible_product_ids'] : [];
    return array_map(static function (array $item) use ($promotion, $isProductPromotion, $eligibleProductIds): array {
        $productId = (string)($item['product']['id'] ?? '');
        $quantity = max(1, (int)($item['quantity'] ?? 1));
        $unitPrice = round((float)($item['unit_price'] ?? 0), 2);
        $lineTotal = round((float)($item['line_total'] ?? ($unitPrice * $quantity)), 2);
        $discountTotal = 0.0;
        if ($isProductPromotion && in_array($productId, $eligibleProductIds, true)) {
            $discountTotal = (string)($promotion['discount_type'] ?? '') === 'percent'
                ? round($lineTotal * min(100.0, (float)($promotion['discount_value'] ?? 0)) / 100, 2)
                : min($lineTotal, round((float)($promotion['discount_value'] ?? 0) * $quantity, 2));
        }
        $discountedLineTotal = round(max(0, $lineTotal - $discountTotal), 2);
        return [
            'product_id' => $productId,
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
            'line_total' => $lineTotal,
            'discount_total' => $discountTotal,
            'discounted_unit_price' => round($discountedLineTotal / $quantity, 2),
            'discounted_line_total' => $discountedLineTotal,
            'is_discounted' => $discountTotal > 0,
        ];
    }, $resolvedItems);
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

function publicOrderStatus(string $status): string {
    return $status;
}

function publicOrderHistory(array $history): array {
    return array_values(array_filter($history, static fn(array $entry): bool => !in_array(
        (string)($entry['to_status'] ?? ''),
        ['return_requested', 'return_refused', 'return_confirmed'],
        true
    )));
}

function orderRow(PDO $db, array $row, ?array $config = null, bool $withHistory = false, bool $withItems = true): array {
    if ($withItems) {
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
            $item['discount_total'] = (float)($item['discount_total'] ?? 0);
            $item['discounted_unit_price'] = $item['discount_total'] > 0
                ? (float)($item['discounted_unit_price'] ?? $item['unit_price'])
                : $item['unit_price'];
            $item['discounted_line_total'] = $item['discount_total'] > 0
                ? (float)($item['discounted_line_total'] ?? $item['line_total'])
                : $item['line_total'];
            $imagePath = trim((string)($item['image_path'] ?? ''));
            $item['image_url'] = $imagePath !== '' && $config
                ? (preg_match('#^https?://#i', $imagePath) ? $imagePath : rtrim((string)$config['public_base_url'], '/') . '/' . ltrim($imagePath, '/'))
                : ($config ? legacyProductImageUrl(['slug' => (string)($item['product_slug'] ?? '')], $config) : '');
            unset($item['image_path']);
            unset($item['product_slug']);
            return $item;
        }, $items->fetchAll());
    } else {
        $row['items'] = [];
    }
    $row['subtotal'] = (float)$row['subtotal'];
    $row['discount_total'] = (float)($row['discount_total'] ?? 0);
    $row['shipping_cost'] = (float)$row['shipping_cost'];
    $row['total'] = (float)$row['total'];
    $row['configured_return_shipping_cost'] = (float)($row['configured_return_shipping_cost'] ?? 0);
    $returnShippingCost = $row['return_shipping_cost'] ?? null;
    $returnRefundAmount = $row['return_refund_amount'] ?? null;
    $row['return_shipping_cost'] = $returnShippingCost === null ? null : (float)$returnShippingCost;
    $row['return_refund_amount'] = $returnRefundAmount === null ? null : (float)$returnRefundAmount;
    $row['vat_payer'] = (bool)($row['vat_payer'] ?? false);
    $row['vat_rate'] = (float)($row['vat_rate'] ?? 0);
    // Păstrăm aceeași regulă și pentru comenzile deja existente: cota salvată pe comandă
    // se aplică direct totalului, fără formula de extragere TVA dintr-un preț brut.
    $row['vat_total'] = $row['vat_payer'] && $row['vat_rate'] > 0
        ? round($row['total'] * $row['vat_rate'] / 100, 2)
        : 0.0;
    $row['net_total'] = (float)($row['net_total'] ?? max(0, $row['total'] - $row['vat_total']));
    $row['customer_type'] = (string)(($row['customer_type'] ?? 'individual') === 'company' ? 'company' : 'individual');
    $row['customer_contact_name'] = (string)($row['customer_name'] ?? '');
    $row['customer_display_name'] = gtOrderCustomerDisplayName($row);
    $row['invoice'] = GtrotsInvoiceService::orderSummary($row);
    $row['return_invoice'] = GtrotsInvoiceService::orderReturnSummary($row);
    foreach (['issued_invoice_id', 'issued_invoice_series', 'issued_invoice_number', 'issued_invoice_theme', 'issued_invoice_spv_status', 'issued_invoice_spv_sent_at', 'issued_invoice_date', 'issued_invoice_at', 'return_invoice_join_id', 'return_invoice_join_series', 'return_invoice_join_number', 'return_invoice_join_original_id', 'return_invoice_join_theme', 'return_invoice_join_spv_status', 'return_invoice_join_spv_sent_at', 'return_invoice_join_date', 'return_invoice_join_total', 'return_invoice_join_currency', 'return_invoice_join_email_sent_at', 'return_invoice_join_at'] as $invoiceColumn) {
        unset($row[$invoiceColumn]);
    }
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
        'discount_total' => (float)($item['discount_total'] ?? 0),
        'discounted_unit_price' => (float)($item['discounted_unit_price'] ?? $item['unit_price'] ?? 0),
        'discounted_line_total' => (float)($item['discounted_line_total'] ?? $item['line_total'] ?? 0),
        'image_url' => (string)($item['image_url'] ?? ''),
    ], (array)($order['items'] ?? []));
    $history = array_map(fn(array $entry): array => [
        'to_status' => (string)($entry['to_status'] ?? ''),
        'created_at' => (string)($entry['created_at'] ?? ''),
    ], publicOrderHistory((array)($order['status_history'] ?? [])));
    $publicStatus = publicOrderStatus((string)$order['status']);
    return [
        'order_number' => (string)$order['order_number'],
        'status' => $publicStatus,
        'status_label' => (string)gtOrderStatusMeta($publicStatus)['label'],
        'payment_status' => (string)$order['payment_status'],
        'payment_method' => (string)$order['payment_method'],
        'can_cancel' => GtrotsOrderCancellation::canCancelStatus((string)$order['status']),
        'can_request_return' => GtrotsOrderReturnRequest::canRequestStatus((string)$order['status']),
        'cancellation_reason' => (string)($order['customer_cancellation_reason'] ?? ''),
        'cancelled_at' => (string)($order['customer_cancelled_at'] ?? ''),
        'cancellation_source' => (string)($order['cancellation_source'] ?? ''),
        'cancellation_invoice_action' => (string)($order['cancellation_invoice_action'] ?? ''),
        'refund_status' => (string)($order['refund_status'] ?? 'none'),
        'refund_due_at' => (string)($order['refund_due_at'] ?? ''),
        'return_reason' => (string)($order['return_reason'] ?? ''),
        'return_shipping_cost' => ($order['return_shipping_cost'] ?? null) === null ? null : (float)$order['return_shipping_cost'],
        'configured_return_shipping_cost' => (float)($order['configured_return_shipping_cost'] ?? 0),
        'return_refund_amount' => ($order['return_refund_amount'] ?? null) === null ? null : (float)$order['return_refund_amount'],
        'return_requested_at' => (string)($order['return_requested_at'] ?? ''),
        'return_request_source' => (string)($order['return_request_source'] ?? ''),
        'return_bank_account_holder' => (string)($order['return_bank_account_holder'] ?? ''),
        'return_bank_iban_masked' => GtrotsOrderReturnRequest::maskIban((string)($order['return_bank_iban'] ?? '')),
        'customer_name' => (string)($order['customer_name'] ?? ''),
        'customer_contact_name' => (string)($order['customer_contact_name'] ?? $order['customer_name'] ?? ''),
        'customer_display_name' => (string)($order['customer_display_name'] ?? gtOrderCustomerDisplayName($order)),
        'customer_email' => (string)($order['customer_email'] ?? ''),
        'customer_phone' => (string)($order['customer_phone'] ?? ''),
        'customer_type' => (string)(($order['customer_type'] ?? 'individual') === 'company' ? 'company' : 'individual'),
        'company_name' => (string)($order['company_name'] ?? ''),
        'company_cui' => (string)($order['company_cui'] ?? ''),
        'company_registration_number' => (string)($order['company_registration_number'] ?? ''),
        'company_address' => (string)($order['company_address'] ?? ''),
        'address' => (string)($order['address'] ?? ''),
        'city' => (string)($order['city'] ?? ''),
        'county' => (string)($order['county'] ?? ''),
        'postal_code' => (string)($order['postal_code'] ?? ''),
        'shipping_method_name' => (string)$order['shipping_method_name'],
        'subtotal' => (float)$order['subtotal'],
        'discount_total' => (float)($order['discount_total'] ?? 0),
        'promotion_code' => (string)($order['promotion_code'] ?? ''),
        'promotion_scope' => (string)($order['promotion_scope'] ?? ''),
        'shipping_cost' => (float)$order['shipping_cost'],
        'total' => (float)$order['total'],
        'vat_payer' => (bool)($order['vat_payer'] ?? false),
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
    $customerType = trim((string)($body['customer_type'] ?? 'individual')) === 'company' ? 'company' : 'individual';
    $companyName = mb_substr(trim((string)($body['company_name'] ?? '')), 0, 180);
    $companyCui = mb_substr(strtoupper(trim((string)($body['company_cui'] ?? ''))), 0, 60);
    $companyRegistrationNumber = mb_substr(strtoupper(trim((string)($body['company_registration_number'] ?? ''))), 0, 80);
    $companyAddress = mb_substr(trim((string)($body['company_address'] ?? '')), 0, 255);
    if ($customerType === 'company' && ($companyName === '' || $companyCui === '' || $companyRegistrationNumber === '' || $companyAddress === '')) {
        throw new InvalidArgumentException('Completeaza denumirea firmei, CUI/CIF, numarul de la Registrul Comertului si sediul social.');
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
    $customer = optionalCustomer($db);
    $deviceHash = promotionDeviceHash($body);

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
        $requestedCouponCode = strtoupper(trim((string)($body['coupon_code'] ?? '')));
        $promotion = bestOrderPromotion($db, $resolvedItems, $subtotal, $customer, $requestedCouponCode, $deviceHash);
        if ($requestedCouponCode !== '' && !$promotion['id']) {
            $usageError = promotionUsageError($db, $requestedCouponCode, $customer, $deviceHash);
            throw new InvalidArgumentException($usageError ?: 'Codul de reducere nu este valid sau nu se aplică acestei comenzi.');
        }
        $discountTotal = round((float)$promotion['discount_total'], 2);
        $quotedItems = promotionQuoteItems($resolvedItems, $promotion);
        $shippingCost = (float)$shipping['cost'];
        if ($shipping['free_above'] !== null && $subtotal >= (float)$shipping['free_above']) $shippingCost = 0.0;
        $total = round(max(0, $subtotal - $discountTotal) + $shippingCost, 2);
        $companyTax = $db->query('SELECT vat_payer, vat_rate FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch() ?: [];
        $vatPayer = boolValue($companyTax['vat_payer'] ?? false);
        $vatRate = $vatPayer ? max(0, min(100, (float)($companyTax['vat_rate'] ?? 19))) : 0.0;
        // Prețurile rămân finale, iar defalcarea TVA este stocată doar intern pentru modulele viitoare.
        // Exemplu: 824 lei × 21% = 173,04 lei. TVA-ul nu se adaugă încă o dată la total.
        $vatTotal = $vatPayer && $vatRate > 0 ? round($total * $vatRate / 100, 2) : 0.0;
        $netTotal = round(max(0, $total - $vatTotal), 2);
        $orderId = uuidV4();
        $orderNumber = 'GT-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        // Orice comandă abia primită este nouă; Stripe o confirmă automat numai după plata reușită.
        $initialStatus = 'new';
        $trackingToken = bin2hex(random_bytes(24));
        $insertOrder = $db->prepare('INSERT INTO shop_orders (id, order_number, status, payment_status, payment_method, customer_id, customer_name, customer_email, customer_phone, customer_type, company_name, company_cui, company_registration_number, company_address, address, city, county, postal_code, customer_notes, shipping_method_id, shipping_method_name, subtotal, discount_total, promotion_id, promotion_code, promotion_scope, shipping_cost, total, vat_payer, vat_rate, vat_total, net_total, currency, tracking_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $insertOrder->execute([
            $orderId, $orderNumber, $initialStatus, 'pending', $paymentMethod, $customer['id'] ?? null, $name,
            $customerEmail ?: null, $phone, $customerType, $customerType === 'company' ? $companyName : null,
            $customerType === 'company' ? $companyCui : null,
            $customerType === 'company' ? $companyRegistrationNumber : null,
            $customerType === 'company' ? $companyAddress : null,
            $address, $city,
            mb_substr(trim((string)($body['county'] ?? '')), 0, 120) ?: null,
            mb_substr(trim((string)($body['postal_code'] ?? '')), 0, 30) ?: null,
            mb_substr(trim((string)($body['customer_notes'] ?? '')), 0, 3000) ?: null,
            $shippingId, (string)$shipping['name'], $subtotal, $discountTotal, $promotion['id'], $promotion['code'], $promotion['scope'], $shippingCost, $total, $vatPayer ? 1 : 0, $vatRate, $vatTotal, $netTotal, 'RON', $trackingToken
        ]);
        reservePromotionUsage($db, $promotion, $customer, $deviceHash, $orderId);
        $insertItem = $db->prepare('INSERT INTO shop_order_items (id, order_id, product_id, product_name, product_sku, quantity, unit_price, line_total, discount_total, discounted_unit_price, discounted_line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($resolvedItems as $index => $item) {
            $product = $item['product'];
            $quotedItem = $quotedItems[$index] ?? [];
            $insertItem->execute([
                uuidV4(), $orderId, $product['id'], $product['name'], $product['sku'], $item['quantity'], $item['unit_price'], $item['line_total'],
                (float)($quotedItem['discount_total'] ?? 0),
                (float)($quotedItem['discounted_unit_price'] ?? $item['unit_price']),
                (float)($quotedItem['discounted_line_total'] ?? $item['line_total']),
            ]);
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

    // Catalogul public actualizeaza periodic, din acelasi feed Boomag, atat
    // preturile (pastrand diferenta comerciala), cat si stocurile. Listele CRM
    // si selectoarele usoare raman rapide, iar pagina unui produs are in plus
    // propria sincronizare imediata mai jos.
    // Sincronizarea completa Boomag ramane o actiune explicita/cron. Nu o
    // atasam citirii catalogului: unele configuratii FastCGI nu elibereaza
    // raspunsul inaintea shutdown-ului si ar tine pagina blocata cateva secunde.

    if ($action === 'stripeWebhook' && $method === 'POST') {
        jsonResponse(stripeProcessWebhook($db, $config, rawRequestBody(), requestHeader('Stripe-Signature')));
    }

    if ($action === 'customerAuthConfig' && $method === 'GET') {
        jsonResponse(['google_client_id' => trim((string)($config['google_client_id'] ?? ''))]);
    }

    if ($action === 'publicActivePromotions' && $method === 'GET') {
        $customer = optionalCustomer($db);
        $rows = array_map(function (array $row) use ($db): array {
            $row = promotionRow($db, $row);
            unset($row['customer_ids'], $row['application_count'], $row['total_discount_given'], $row['average_discount']);
            return $row;
        }, activePromotionRowsForCustomer($db, $customer, false, null, promotionDeviceHash($body)));
        jsonResponse($rows);
    }

    if ($action === 'publicPromotionQuote' && $method === 'POST') {
        $items = is_array($body['items'] ?? null) ? array_values($body['items']) : [];
        if (!$items || count($items) > 50) jsonResponse([
            'subtotal' => 0,
            'discount_total' => 0,
            'promotion_id' => null,
            'promotion_code' => null,
            'promotion_title' => null,
            'promotion_scope' => null,
            'promotion_min_order_value' => null,
            'items' => [],
        ]);
        $productStmt = $db->prepare('SELECT p.* FROM shop_products p INNER JOIN shop_product_sources s ON s.id = p.source_id AND s.is_active = 1 WHERE p.id = ? AND p.is_active = 1');
        $resolvedItems = [];
        $subtotal = 0.0;
        foreach ($items as $item) {
            if (!is_array($item)) continue;
            $productId = trim((string)($item['product_id'] ?? ''));
            $quantity = max(1, min(99, (int)($item['quantity'] ?? 1)));
            $productStmt->execute([$productId]);
            $product = $productStmt->fetch();
            if (!$product) continue;
            $unitPrice = $product['sale_price'] !== null ? (float)$product['sale_price'] : (float)$product['price'];
            $lineTotal = round($unitPrice * $quantity, 2);
            $subtotal += $lineTotal;
            $resolvedItems[] = ['product' => $product, 'quantity' => $quantity, 'unit_price' => $unitPrice, 'line_total' => $lineTotal];
        }
        $requestedCouponCode = strtoupper(trim((string)($body['coupon_code'] ?? '')));
        $customer = optionalCustomer($db);
        $deviceHash = promotionDeviceHash($body);
        $promotion = bestOrderPromotion($db, $resolvedItems, $subtotal, $customer, $requestedCouponCode, $deviceHash);
        if ($requestedCouponCode !== '' && !$promotion['id']) {
            $usageError = promotionUsageError($db, $requestedCouponCode, $customer, $deviceHash);
            jsonResponse(['error' => $usageError ?: 'Codul de reducere nu este valid sau nu se aplică produselor din coș.'], 422);
        }
        jsonResponse([
            'subtotal' => round($subtotal, 2),
            'discount_total' => round((float)$promotion['discount_total'], 2),
            'promotion_id' => $promotion['id'],
            'promotion_code' => $promotion['code'],
            'promotion_title' => $promotion['title'],
            'promotion_scope' => $promotion['scope'],
            'promotion_min_order_value' => $promotion['min_order_value'],
            'items' => promotionQuoteItems($resolvedItems, $promotion),
        ]);
    }

    if ($action === 'customerRegister' && $method === 'POST') {
        $email = mb_strtolower(trim((string)($body['email'] ?? '')));
        $fullName = mb_substr(trim((string)($body['full_name'] ?? '')), 0, 180);
        $phone = mb_substr(trim((string)($body['phone'] ?? '')), 0, 50);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Introdu o adresă de e-mail validă.');
        if (mb_strlen($fullName) < 2) throw new InvalidArgumentException('Introdu numele complet.');
        $password = validatedCustomerPassword($body['password'] ?? '');
        $exists = $db->prepare('SELECT id FROM shop_customers WHERE email = ? LIMIT 1');
        $exists->execute([$email]);
        if ($exists->fetchColumn()) jsonResponse(['error' => 'Există deja un cont pentru această adresă de e-mail.', 'code' => 'email_exists'], 409);
        $customerId = uuidV4();
        $stmt = $db->prepare('INSERT INTO shop_customers (id, email, password_hash, full_name, phone, last_login_at) VALUES (?, ?, ?, ?, ?, NOW())');
        $stmt->execute([$customerId, $email, password_hash($password, PASSWORD_DEFAULT), $fullName, $phone]);
        $stmt = $db->prepare('SELECT * FROM shop_customers WHERE id = ?');
        $stmt->execute([$customerId]);
        jsonResponse(['token' => issueCustomerSession($db, $customerId), 'customer' => customerPublicRow($stmt->fetch())], 201);
    }

    if ($action === 'customerForgotPassword' && $method === 'POST') {
        $email = mb_strtolower(trim((string)($body['email'] ?? '')));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Adresa de e-mail este obligatorie și trebuie să fie validă.');
        }
        $ipHash = customerRequestIpHash();
        $db->exec("DELETE FROM shop_customer_password_resets WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 DAY)");
        $emailRate = $db->prepare('SELECT COUNT(*) FROM shop_customer_password_resets WHERE email = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)');
        $emailRate->execute([$email]);
        $ipRate = $db->prepare('SELECT COUNT(*) FROM shop_customer_password_resets WHERE request_ip_hash = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)');
        $ipRate->execute([$ipHash]);
        $limited = (int)$emailRate->fetchColumn() >= 4 || (int)$ipRate->fetchColumn() >= 20;
        if (!$limited) {
            $rawToken = bin2hex(random_bytes(32));
            $customer = null;
            $db->beginTransaction();
            try {
                $customerStmt = $db->prepare('SELECT * FROM shop_customers WHERE email = ? AND is_active = 1 LIMIT 1 FOR UPDATE');
                $customerStmt->execute([$email]);
                $customer = $customerStmt->fetch() ?: null;
                if ($customer) {
                    $db->prepare('UPDATE shop_customer_password_resets SET used_at = COALESCE(used_at, NOW()) WHERE customer_id = ? AND used_at IS NULL')->execute([$customer['id']]);
                }
                $insert = $db->prepare('INSERT INTO shop_customer_password_resets (id, customer_id, email, token_hash, request_ip_hash, expires_at) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))');
                $insert->execute([uuidV4(), $customer['id'] ?? null, $email, hash('sha256', $rawToken), $ipHash]);
                $db->commit();
            } catch (Throwable $error) {
                if ($db->inTransaction()) $db->rollBack();
                throw $error;
            }
            if ($customer) {
                try {
                    gtSendPasswordResetEmail($customer, $config, $rawToken);
                } catch (Throwable $error) {
                    error_log('[G-Trots password reset email] ' . $error->getMessage());
                }
            } else {
                usleep(220000);
            }
        } else {
            usleep(220000);
        }
        jsonResponse([
            'success' => true,
            'message' => 'Dacă adresa aparține unui cont activ, vei primi în câteva minute e-mailul securizat pentru resetarea parolei.',
        ], 202);
    }

    if ($action === 'customerValidateResetLink' && $method === 'POST') {
        $email = mb_strtolower(trim((string)($body['email'] ?? '')));
        $rawToken = strtolower(trim((string)($body['token'] ?? '')));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-f0-9]{64}$/', $rawToken)) {
            jsonResponse(['error' => 'Linkul de resetare nu este valid sau a expirat.', 'code' => 'reset_link_expired'], 410);
        }
        $resetStmt = $db->prepare(
            'SELECT r.id
             FROM shop_customer_password_resets r
             INNER JOIN shop_customers c ON c.id = r.customer_id AND c.is_active = 1
             WHERE r.token_hash = ? AND r.email = ? AND c.email = ?
               AND r.used_at IS NULL AND r.expires_at >= NOW()
             LIMIT 1'
        );
        $resetStmt->execute([hash('sha256', $rawToken), $email, $email]);
        if (!$resetStmt->fetchColumn()) {
            jsonResponse(['error' => 'Linkul de resetare nu este valid sau a expirat.', 'code' => 'reset_link_expired'], 410);
        }
        jsonResponse(['valid' => true]);
    }

    if ($action === 'customerResetPassword' && $method === 'POST') {
        $email = mb_strtolower(trim((string)($body['email'] ?? '')));
        $rawToken = strtolower(trim((string)($body['token'] ?? '')));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Adresa de e-mail este obligatorie și trebuie să fie validă.');
        }
        if (!preg_match('/^[a-f0-9]{64}$/', $rawToken)) {
            jsonResponse(['error' => 'Linkul de resetare nu este valid sau a expirat. Solicită un e-mail nou.', 'code' => 'reset_link_expired'], 410);
        }
        $password = validatedCustomerPassword($body['password'] ?? '');
        if ($password !== (string)($body['password_confirm'] ?? '')) {
            throw new InvalidArgumentException('Parolele introduse nu coincid.');
        }
        $db->beginTransaction();
        try {
            $resetStmt = $db->prepare(
                'SELECT r.*, c.id AS active_customer_id
                 FROM shop_customer_password_resets r
                 INNER JOIN shop_customers c ON c.id = r.customer_id AND c.is_active = 1
                 WHERE r.token_hash = ? AND r.email = ? AND c.email = ?
                   AND r.used_at IS NULL AND r.expires_at >= NOW()
                 LIMIT 1 FOR UPDATE'
            );
            $resetStmt->execute([hash('sha256', $rawToken), $email, $email]);
            $reset = $resetStmt->fetch();
            if (!$reset) {
                $db->rollBack();
                jsonResponse(['error' => 'Linkul de resetare nu este valid sau a expirat. Solicită un e-mail nou.', 'code' => 'reset_link_expired'], 410);
            }
            $customerId = (string)$reset['active_customer_id'];
            $db->prepare('UPDATE shop_customers SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $customerId]);
            $db->prepare('UPDATE shop_customer_password_resets SET used_at = COALESCE(used_at, NOW()) WHERE customer_id = ?')->execute([$customerId]);
            $db->prepare('DELETE FROM shop_customer_sessions WHERE customer_id = ?')->execute([$customerId]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        jsonResponse(['success' => true, 'message' => 'Parola a fost resetată. Acum te poți autentifica folosind parola nouă.']);
    }

    if ($action === 'customerLogin' && $method === 'POST') {
        $email = mb_strtolower(trim((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        $stmt = $db->prepare('SELECT * FROM shop_customers WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $customer = $stmt->fetch();
        if ($customer && !(bool)$customer['is_active']) {
            jsonResponse(['error' => 'Acest cont a fost dezactivat. Contactează G-Trots pentru mai multe detalii.', 'code' => 'customer_disabled'], 403);
        }
        if (!$customer || empty($customer['password_hash']) || !password_verify($password, (string)$customer['password_hash'])) {
            usleep(350000);
            jsonResponse(['error' => 'Adresa de e-mail sau parola nu este corectă.', 'code' => 'invalid_credentials'], 401);
        }
        if (password_needs_rehash((string)$customer['password_hash'], PASSWORD_DEFAULT)) {
            $db->prepare('UPDATE shop_customers SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $customer['id']]);
        }
        $db->prepare('UPDATE shop_customers SET last_login_at = NOW() WHERE id = ?')->execute([$customer['id']]);
        jsonResponse(['token' => issueCustomerSession($db, (string)$customer['id']), 'customer' => customerPublicRow($customer)]);
    }

    if ($action === 'customerGoogleLogin' && $method === 'POST') {
        $identity = fetchGoogleIdentity(trim((string)($body['credential'] ?? '')), trim((string)($config['google_client_id'] ?? '')));
        $email = mb_strtolower(trim((string)($identity['email'] ?? '')));
        $googleSub = mb_substr(trim((string)($identity['sub'] ?? '')), 0, 190);
        $fullName = mb_substr(trim((string)($identity['name'] ?? $email)), 0, 180);
        $avatar = mb_substr(trim((string)($identity['picture'] ?? '')), 0, 500);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $googleSub === '') throw new InvalidArgumentException('Contul Google nu conține datele necesare.');
        $stmt = $db->prepare('SELECT * FROM shop_customers WHERE google_sub = ? OR email = ? LIMIT 1');
        $stmt->execute([$googleSub, $email]);
        $customer = $stmt->fetch();
        if ($customer) {
            if (!(bool)$customer['is_active']) jsonResponse(['error' => 'Acest cont a fost dezactivat. Contactează G-Trots pentru mai multe detalii.', 'code' => 'customer_disabled'], 403);
            $db->prepare('UPDATE shop_customers SET google_sub = ?, avatar_url = ?, full_name = CASE WHEN full_name = "" THEN ? ELSE full_name END, last_login_at = NOW() WHERE id = ?')->execute([$googleSub, $avatar, $fullName, $customer['id']]);
            $stmt = $db->prepare('SELECT * FROM shop_customers WHERE id = ?');
            $stmt->execute([$customer['id']]);
            $customer = $stmt->fetch();
        } else {
            $customerId = uuidV4();
            $db->prepare('INSERT INTO shop_customers (id, email, full_name, google_sub, avatar_url, last_login_at) VALUES (?, ?, ?, ?, ?, NOW())')->execute([$customerId, $email, $fullName, $googleSub, $avatar]);
            $stmt = $db->prepare('SELECT * FROM shop_customers WHERE id = ?');
            $stmt->execute([$customerId]);
            $customer = $stmt->fetch();
        }
        jsonResponse(['token' => issueCustomerSession($db, (string)$customer['id']), 'customer' => customerPublicRow($customer)]);
    }

    if ($action === 'customerMe' && $method === 'GET') {
        $customer = requireCustomer($db);
        $orderCount = $db->prepare('SELECT COUNT(*) FROM shop_orders WHERE LOWER(customer_email) = ?');
        $orderCount->execute([mb_strtolower((string)$customer['email'])]);
        $addressCount = $db->prepare('SELECT COUNT(*) FROM shop_customer_addresses WHERE customer_id = ?');
        $addressCount->execute([$customer['id']]);
        jsonResponse(['customer' => customerPublicRow($customer), 'counts' => ['orders' => (int)$orderCount->fetchColumn(), 'addresses' => (int)$addressCount->fetchColumn()]]);
    }

    if ($action === 'customerProfile' && $method === 'PATCH') {
        $customer = requireCustomer($db);
        $fullName = mb_substr(trim((string)($body['full_name'] ?? $customer['full_name'])), 0, 180);
        $phone = mb_substr(trim((string)($body['phone'] ?? $customer['phone'])), 0, 50);
        $customerType = trim((string)($body['customer_type'] ?? ($customer['customer_type'] ?? 'individual'))) === 'company' ? 'company' : 'individual';
        $address = mb_substr(trim((string)($body['address'] ?? ($customer['address'] ?? ''))), 0, 255);
        $city = mb_substr(trim((string)($body['city'] ?? ($customer['city'] ?? ''))), 0, 120);
        $county = mb_substr(trim((string)($body['county'] ?? ($customer['county'] ?? ''))), 0, 120);
        $postalCode = mb_substr(trim((string)($body['postal_code'] ?? ($customer['postal_code'] ?? ''))), 0, 30);
        $companyName = mb_substr(trim((string)($body['company_name'] ?? ($customer['company_name'] ?? ''))), 0, 180);
        $companyCui = mb_substr(strtoupper(trim((string)($body['company_cui'] ?? ($customer['company_cui'] ?? '')))), 0, 60);
        $companyRegistrationNumber = mb_substr(strtoupper(trim((string)($body['company_registration_number'] ?? ($customer['company_registration_number'] ?? '')))), 0, 80);
        $companyAddress = mb_substr(trim((string)($body['company_address'] ?? ($customer['company_address'] ?? ''))), 0, 255);
        if (mb_strlen($fullName) < 2) throw new InvalidArgumentException('Introdu numele complet.');
        if ($phone === '') throw new InvalidArgumentException('Introdu numarul de telefon.');
        if ($customerType === 'company' && ($companyName === '' || $companyCui === '' || $companyRegistrationNumber === '' || $companyAddress === '')) {
            throw new InvalidArgumentException('Completeaza denumirea firmei, CUI/CIF, numarul de la Registrul Comertului si sediul social.');
        }
        $db->prepare('UPDATE shop_customers SET full_name = ?, phone = ?, customer_type = ?, address = ?, city = ?, county = ?, postal_code = ?, company_name = ?, company_cui = ?, company_registration_number = ?, company_address = ? WHERE id = ?')->execute([
            $fullName, $phone, $customerType, $address ?: null, $city ?: null, $county ?: null, $postalCode ?: null,
            $customerType === 'company' ? $companyName : null,
            $customerType === 'company' ? $companyCui : null,
            $customerType === 'company' ? $companyRegistrationNumber : null,
            $customerType === 'company' ? $companyAddress : null,
            $customer['id'],
        ]);
        $stmt = $db->prepare('SELECT * FROM shop_customers WHERE id = ?');
        $stmt->execute([$customer['id']]);
        jsonResponse(['customer' => customerPublicRow($stmt->fetch())]);
    }

    if ($action === 'customerLogout' && $method === 'POST') {
        requireCustomer($db);
        $token = customerTokenFromRequest();
        $db->prepare('DELETE FROM shop_customer_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
        jsonResponse(['success' => true]);
    }

    if ($action === 'customerDeleteAccount' && $method === 'DELETE') {
        $customer = requireCustomer($db);
        if (strtoupper(trim((string)($body['confirmation'] ?? ''))) !== 'STERGE') {
            throw new InvalidArgumentException('Confirmarea pentru ștergerea contului nu este validă.');
        }
        $db->beginTransaction();
        try {
            $db->prepare('DELETE FROM shop_customer_coupons WHERE customer_id = ?')->execute([$customer['id']]);
            $db->prepare('DELETE FROM shop_coupon_customer_usage WHERE customer_id = ?')->execute([$customer['id']]);
            $db->prepare('DELETE FROM shop_customer_password_resets WHERE customer_id = ?')->execute([$customer['id']]);
            $db->prepare('DELETE FROM shop_customer_addresses WHERE customer_id = ?')->execute([$customer['id']]);
            $db->prepare('DELETE FROM shop_customer_sessions WHERE customer_id = ?')->execute([$customer['id']]);
            $db->prepare('DELETE FROM shop_customers WHERE id = ?')->execute([$customer['id']]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        jsonResponse(['success' => true, 'orders_retained' => true]);
    }

    if ($action === 'customerOrders' && $method === 'GET') {
        $customer = requireCustomer($db);
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE LOWER(customer_email) = ? ORDER BY created_at DESC LIMIT 250');
        $stmt->execute([mb_strtolower((string)$customer['email'])]);
        jsonResponse(array_map(fn(array $row): array => customerOrderResponse(orderRow($db, $row, $config, true)), $stmt->fetchAll()));
    }

    if ($action === 'customerOrder' && $method === 'GET') {
        $customer = requireCustomer($db);
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') throw new InvalidArgumentException('Comanda nu a fost specificată.');
        $stmt = $db->prepare('SELECT * FROM shop_orders WHERE (id = ? OR order_number = ?) AND LOWER(customer_email) = ? LIMIT 1');
        $stmt->execute([$id, strtoupper($id), mb_strtolower((string)$customer['email'])]);
        $order = $stmt->fetch();
        if (!$order) jsonResponse(['error' => 'Comanda nu există în acest cont.'], 404);
        jsonResponse(customerOrderResponse(orderRow($db, $order, $config, true)));
    }

    if ($action === 'customerAddresses' && $method === 'GET') {
        $customer = requireCustomer($db);
        $stmt = $db->prepare('SELECT * FROM shop_customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, updated_at DESC');
        $stmt->execute([$customer['id']]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) $row['is_default'] = (bool)$row['is_default'];
        unset($row);
        jsonResponse($rows);
    }

    if ($action === 'customerAddresses' && $method === 'POST') {
        $customer = requireCustomer($db);
        $payload = customerAddressPayload($body);
        $id = uuidV4();
        $db->beginTransaction();
        try {
            $existingCount = $db->prepare('SELECT COUNT(*) FROM shop_customer_addresses WHERE customer_id = ?');
            $existingCount->execute([$customer['id']]);
            $isDefault = $payload['is_default'] || (int)$existingCount->fetchColumn() === 0;
            if ($isDefault) $db->prepare('UPDATE shop_customer_addresses SET is_default = 0 WHERE customer_id = ?')->execute([$customer['id']]);
            $stmt = $db->prepare('INSERT INTO shop_customer_addresses (id, customer_id, label, recipient_name, phone, address, city, county, postal_code, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$id, $customer['id'], $payload['label'], $payload['recipient_name'], $payload['phone'], $payload['address'], $payload['city'], $payload['county'], $payload['postal_code'], $isDefault ? 1 : 0]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $stmt = $db->prepare('SELECT * FROM shop_customer_addresses WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $row['is_default'] = (bool)$row['is_default'];
        jsonResponse($row, 201);
    }

    if ($action === 'customerAddress' && $method === 'PATCH') {
        $customer = requireCustomer($db);
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $exists = $db->prepare('SELECT id FROM shop_customer_addresses WHERE id = ? AND customer_id = ?');
        $exists->execute([$id, $customer['id']]);
        if (!$exists->fetchColumn()) jsonResponse(['error' => 'Adresa nu există în acest cont.'], 404);
        $payload = customerAddressPayload($body);
        $db->beginTransaction();
        try {
            if ($payload['is_default']) $db->prepare('UPDATE shop_customer_addresses SET is_default = 0 WHERE customer_id = ?')->execute([$customer['id']]);
            $stmt = $db->prepare('UPDATE shop_customer_addresses SET label = ?, recipient_name = ?, phone = ?, address = ?, city = ?, county = ?, postal_code = ?, is_default = ? WHERE id = ? AND customer_id = ?');
            $stmt->execute([$payload['label'], $payload['recipient_name'], $payload['phone'], $payload['address'], $payload['city'], $payload['county'], $payload['postal_code'], $payload['is_default'] ? 1 : 0, $id, $customer['id']]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        jsonResponse(['success' => true]);
    }

    if ($action === 'customerAddress' && $method === 'DELETE') {
        $customer = requireCustomer($db);
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $stmt = $db->prepare('SELECT is_default FROM shop_customer_addresses WHERE id = ? AND customer_id = ?');
        $stmt->execute([$id, $customer['id']]);
        $wasDefault = $stmt->fetchColumn();
        if ($wasDefault === false) jsonResponse(['error' => 'Adresa nu există în acest cont.'], 404);
        $db->prepare('DELETE FROM shop_customer_addresses WHERE id = ? AND customer_id = ?')->execute([$id, $customer['id']]);
        if ((bool)$wasDefault) $db->prepare('UPDATE shop_customer_addresses SET is_default = 1 WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 1')->execute([$customer['id']]);
        jsonResponse(['success' => true]);
    }

    if ($action === 'customerCoupons' && $method === 'GET') {
        $customer = requireCustomer($db);
        $rows = array_map(function (array $row) use ($db): array {
            $row = promotionRow($db, $row);
            unset($row['customer_ids'], $row['application_count'], $row['total_discount_given'], $row['average_discount']);
            return $row;
        }, activePromotionRowsForCustomer($db, $customer, false, null, promotionDeviceHash($body)));
        jsonResponse($rows);
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

    $isCheckoutCatalogRequest = $action === 'publicCheckoutProducts' && $method === 'POST';
    $isPublicCatalogRequest = in_array($action, ['publicProducts', 'publicProductsCompact', 'publicProductsPage'], true) && $method === 'GET';
    if ($isPublicCatalogRequest || $isCheckoutCatalogRequest) {
        $catalogStartedAt = microtime(true);
        $where = ['p.is_active = 1', 's.is_active = 1'];
        $params = [];
        $checkoutProductIds = [];
        if ($isCheckoutCatalogRequest) {
            $checkoutProductIds = array_values(array_unique(array_filter(array_map(
                static fn($value): string => mb_substr(trim((string)$value), 0, 180),
                array_slice(is_array($body['ids'] ?? null) ? $body['ids'] : [], 0, 200)
            ), static fn(string $value): bool => $value !== '')));
            if (!$checkoutProductIds) jsonResponse([]);
            $checkoutPlaceholders = implode(',', array_fill(0, count($checkoutProductIds), '?'));
            $where[] = "(p.slug IN ({$checkoutPlaceholders}) OR p.id IN ({$checkoutPlaceholders}))";
            array_push($params, ...$checkoutProductIds, ...$checkoutProductIds);
        }
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
        $pageSize = $isCheckoutCatalogRequest
            ? max(1, min(200, count($checkoutProductIds)))
            : ($action === 'publicProductsPage' ? max(1, min(500, (int)($_GET['page_size'] ?? 24))) : 2500);
        $catalogPage = $action === 'publicProductsPage' ? max(1, (int)($_GET['page'] ?? 1)) : 1;
        $offset = ($catalogPage - 1) * $pageSize;
        $totalProducts = null;
        if ($action === 'publicProductsPage') {
            $countSql = 'SELECT COUNT(*) FROM shop_products p LEFT JOIN shop_product_sources s ON s.id = p.source_id WHERE ' . implode(' AND ', $where);
            $countStmt = $db->prepare($countSql);
            $countStmt->execute($params);
            $totalProducts = (int)$countStmt->fetchColumn();
        }
        $sql = publicCatalogProductSelectSql() . ' WHERE ' . implode(' AND ', $where) . ' ORDER BY ' . productStockOrderSql() . ' ASC, p.is_featured DESC, COALESCE(p.featured_rank, 2147483647) ASC, p.created_at DESC LIMIT ' . $offset . ', ' . $pageSize;
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rawProducts = $stmt->fetchAll();
        $catalogQueriedAt = microtime(true);
        $products = publicCatalogRows($db, deduplicateCatalogProductRows($rawProducts), $config);
        $catalogHydratedAt = microtime(true);
        $products = applyCatalogPromotionPrices($db, $products, optionalCustomer($db), promotionDeviceHash($body));
        $catalogPromotedAt = microtime(true);
        header('Cache-Control: private, max-age=120, stale-while-revalidate=300');
        header('Vary: X-Customer-Token, X-Shop-Device, Accept-Encoding');
        $hydrationTiming = $GLOBALS['shopPublicCatalogHydrationTiming'] ?? [];
        header(sprintf(
            'Server-Timing: bootstrap;dur=%.1f, query;dur=%.1f, images;dur=%.1f, brands;dur=%.1f, map;dur=%.1f, promotions;dur=%.1f',
            ($catalogStartedAt - $shopRequestStartedAt) * 1000,
            ($catalogQueriedAt - $catalogStartedAt) * 1000,
            (float)($hydrationTiming['images'] ?? 0),
            (float)($hydrationTiming['brands'] ?? 0),
            (float)($hydrationTiming['map'] ?? 0),
            ($catalogPromotedAt - $catalogHydratedAt) * 1000
        ));
        $shapeStartedAt = microtime(true);
        $publicProducts = array_map('publicCatalogProductRow', $products);
        $GLOBALS['shopPublicCatalogResponseTiming'] = [
            'shape' => (microtime(true) - $shapeStartedAt) * 1000,
        ];
        if ($action === 'publicProductsPage') {
            $payload = compactPublicCatalogPayload($publicProducts);
            $payload['total'] = $totalProducts;
            $payload['page'] = $catalogPage;
            $payload['page_size'] = $pageSize;
            jsonResponse($payload);
        }
        jsonResponse($action === 'publicProductsCompact' ? compactPublicCatalogPayload($publicProducts) : $publicProducts);
    }

    if ($action === 'publicProduct' && $method === 'GET') {
        $idOrSlug = trim((string)($_GET['id'] ?? $_GET['slug'] ?? ''));
        if ($idOrSlug === '') jsonResponse(['error' => 'Produsul nu a fost specificat.'], 400);
        try {
            try {
                $feedSync = gomagSyncProductFromFeed($db, $config, $idOrSlug);
                if (!empty($feedSync['price_changed']) && !empty($feedSync['product_id'])) {
                    stripeSyncProductSafe($db, $config, (string)$feedSync['product_id']);
                }
            } catch (Throwable $syncError) {
                error_log('[G-Trots Boomag product sync] ' . $syncError->getMessage());
            }
            $product = findProduct($db, $idOrSlug, $config, true);
            $db->prepare('UPDATE shop_products SET view_count = view_count + 1 WHERE id = ?')->execute([$product['id']]);
            $product['view_count'] = (int)$product['view_count'] + 1;
            jsonResponse(applyCatalogPromotionPrices($db, [$product], optionalCustomer($db), promotionDeviceHash($body))[0]);
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
        $companyTax = $db->query('SELECT vat_payer, vat_rate FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch() ?: [];
        $publicPayments = paymentSettings($db, $config);
        $publicPayments['card_enabled'] = $publicPayments['card_enabled'] && $publicPayments['stripe_configured'];
        unset($publicPayments['stripe_synced_products'], $publicPayments['stripe_sync_errors']);
        jsonResponse([
            'payments' => $publicPayments,
            'shipping_methods' => array_map('shippingRow', $shipping),
            'tax' => [
                'vat_payer' => boolValue($companyTax['vat_payer'] ?? false),
                'prices_include_vat' => true,
            ],
        ]);
    }

    if ($action === 'publicTrackOrder' && $method === 'GET') {
        $token = strtolower(trim((string)($_GET['token'] ?? '')));
        $orderNumber = strtoupper(trim((string)($_GET['order_number'] ?? '')));
        $email = strtolower(trim((string)($_GET['email'] ?? '')));
        if ($token !== '') {
            if (!preg_match('/^[a-f0-9]{32,64}$/', $token)) throw new InvalidArgumentException('Linkul de urmărire nu este valid.');
            $stmt = $db->prepare('SELECT o.*, COALESCE(sm.return_cost, 0) AS configured_return_shipping_cost FROM shop_orders o LEFT JOIN shop_shipping_methods sm ON sm.id = o.shipping_method_id WHERE o.tracking_token = ? LIMIT 1');
            $stmt->execute([$token]);
        } else {
            if ($orderNumber === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('Completează codul comenzii și adresa de e-mail folosită la comandă.');
            }
            $stmt = $db->prepare('SELECT o.*, COALESCE(sm.return_cost, 0) AS configured_return_shipping_cost FROM shop_orders o LEFT JOIN shop_shipping_methods sm ON sm.id = o.shipping_method_id WHERE UPPER(o.order_number) = ? AND LOWER(o.customer_email) = ? LIMIT 1');
            $stmt->execute([$orderNumber, $email]);
        }
        $order = $stmt->fetch();
        if (!$order) jsonResponse(['error' => 'Nu am găsit o comandă pentru datele introduse. Verifică informațiile și încearcă din nou.'], 404);
        jsonResponse(publicTrackingOrder(orderRow($db, $order, $config, true)));
    }

    if ($action === 'customerCancelOrder' && $method === 'POST') {
        $cancellation = GtrotsOrderCancellation::cancelByCustomer($db, [
            'token' => strtolower(trim((string)($body['token'] ?? ''))),
            'order_number' => strtoupper(trim((string)($body['order_number'] ?? ''))),
            'email' => mb_strtolower(trim((string)($body['email'] ?? ''))),
        ], (string)($body['reason'] ?? ''), $config);
        $savedId = (string)($cancellation['order']['id'] ?? '');
        $stmt = $db->prepare('SELECT o.*' . GtrotsInvoiceService::orderJoinColumns() . ' FROM shop_orders o' . GtrotsInvoiceService::orderJoinSql('o') . ' WHERE o.id = ? LIMIT 1');
        $stmt->execute([$savedId]);
        $saved = $stmt->fetch();
        if (!$saved) throw new RuntimeException('Comanda anulată nu a putut fi recitită.');
        $cancellation['order'] = publicTrackingOrder(orderRow($db, $saved, $config, true));
        jsonResponse($cancellation);
    }

    if ($action === 'customerRequestReturn' && $method === 'POST') {
        $request = GtrotsOrderReturnRequest::requestByCustomer($db, [
            'token' => strtolower(trim((string)($body['token'] ?? ''))),
            'order_number' => strtoupper(trim((string)($body['order_number'] ?? ''))),
            'email' => mb_strtolower(trim((string)($body['email'] ?? ''))),
        ], [
            'reason' => (string)($body['reason'] ?? ''),
            'bank_iban' => (string)($body['bank_iban'] ?? ''),
            'bank_account_holder' => (string)($body['bank_account_holder'] ?? ''),
        ], $config);
        $savedId = (string)($request['order']['id'] ?? '');
        $stmt = $db->prepare('SELECT o.*, COALESCE(sm.return_cost, 0) AS configured_return_shipping_cost' . GtrotsInvoiceService::orderJoinColumns() . ' FROM shop_orders o LEFT JOIN shop_shipping_methods sm ON sm.id = o.shipping_method_id' . GtrotsInvoiceService::orderJoinSql('o') . ' WHERE o.id = ? LIMIT 1');
        $stmt->execute([$savedId]);
        $saved = $stmt->fetch();
        if (!$saved) throw new RuntimeException('Solicitarea de retur nu a putut fi recitită.');
        $request['order'] = publicTrackingOrder(orderRow($db, $saved, $config, true));
        jsonResponse($request);
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
        } elseif (($order['payment_method'] ?? '') === 'cash_on_delivery') {
            // Confirmarea de primire a comenzii este trimisă în createPublicOrder.
            // Factura și e-mailul ei pornesc abia după finalizarea acelui pas.
            $order['invoice_automation'] = GtrotsInvoiceAutomation::processOrder($db, (string)$order['id'], $config);
        }
        unset($order['vat_rate'], $order['vat_total'], $order['net_total']);
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

    if ($action === 'applyFeaturedProducts' && $method === 'POST') {
        verifyBoomagImportKey($config, $body);
        $rawCodes = $body['codes'] ?? null;
        if (!is_array($rawCodes) || count($rawCodes) < 1 || count($rawCodes) > 2500) {
            throw new InvalidArgumentException('Lista produselor recomandate trebuie sa contina intre 1 si 2500 de coduri.');
        }

        $codes = [];
        $seenCodes = [];
        foreach ($rawCodes as $rawCode) {
            if (!is_scalar($rawCode)) throw new InvalidArgumentException('Lista produselor recomandate contine o valoare invalida.');
            $code = mb_substr(trim((string)$rawCode), 0, 120);
            if ($code === '') throw new InvalidArgumentException('Lista produselor recomandate contine un cod gol.');
            $key = mb_strtolower($code);
            if (isset($seenCodes[$key])) throw new InvalidArgumentException('Cod duplicat in lista produselor recomandate: ' . $code . '.');
            $seenCodes[$key] = true;
            $codes[] = $code;
        }

        $identifierRows = $db->query(
            'SELECT id, name, sku, supplier_product_code, supplier_external_id FROM shop_products'
        )->fetchAll();
        $productsByCode = [];
        foreach ($identifierRows as $row) {
            foreach (['sku', 'supplier_product_code', 'supplier_external_id'] as $field) {
                $value = trim((string)($row[$field] ?? ''));
                if ($value === '') continue;
                $key = mb_strtolower($value);
                $productsByCode[$key][(string)$row['id']] = $row;
            }
        }

        $resolved = [];
        $missing = [];
        $ambiguous = [];
        $usedProductIds = [];
        foreach ($codes as $index => $code) {
            $key = mb_strtolower($code);
            $candidates = array_values($productsByCode[$key] ?? []);
            if (count($candidates) === 0) {
                $missing[] = $code;
                continue;
            }
            if (count($candidates) > 1) {
                $ambiguous[] = $code;
                continue;
            }
            $product = $candidates[0];
            $productId = (string)$product['id'];
            if (isset($usedProductIds[$productId])) {
                $ambiguous[] = $code;
                continue;
            }
            $usedProductIds[$productId] = true;
            $resolved[] = [
                'rank' => $index + 1,
                'code' => $code,
                'id' => $productId,
                'name' => (string)$product['name'],
            ];
        }

        if ($missing || $ambiguous) {
            jsonResponse([
                'error' => 'Lista nu a fost aplicata deoarece asocierea nu este completa si univoca.',
                'matched_count' => count($resolved),
                'missing_codes' => $missing,
                'ambiguous_codes' => $ambiguous,
            ], 422);
        }

        $db->beginTransaction();
        try {
            $db->exec('UPDATE shop_products SET is_featured = 0, featured_rank = NULL, updated_at = updated_at');
            $update = $db->prepare(
                'UPDATE shop_products SET is_featured = 1, featured_rank = ?, updated_at = updated_at WHERE id = ?'
            );
            foreach ($resolved as $product) $update->execute([$product['rank'], $product['id']]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }

        jsonResponse([
            'success' => true,
            'featured_count' => count($resolved),
            'products' => $resolved,
        ]);
    }

    if ($action === 'pruneUnusedTaxonomy' && $method === 'POST') {
        verifyBoomagImportKey($config, $body);
        $unusedBrands = $db->query(
            'SELECT b.id, b.name
             FROM shop_brands b
             LEFT JOIN shop_product_brands pb ON pb.brand_id = b.id
             WHERE pb.brand_id IS NULL
             ORDER BY b.name ASC'
        )->fetchAll();
        $unusedManufacturers = $db->query(
            'SELECT m.id, m.name
             FROM shop_manufacturers m
             LEFT JOIN shop_products p ON p.manufacturer_id = m.id
             WHERE p.id IS NULL
             ORDER BY m.name ASC'
        )->fetchAll();

        if (!empty($body['dry_run'])) {
            jsonResponse([
                'success' => true,
                'dry_run' => true,
                'unused_brands' => count($unusedBrands),
                'unused_manufacturers' => count($unusedManufacturers),
            ]);
        }

        $db->beginTransaction();
        try {
            $deletedBrands = $db->exec(
                'DELETE b FROM shop_brands b
                 LEFT JOIN shop_product_brands pb ON pb.brand_id = b.id
                 WHERE pb.brand_id IS NULL'
            );
            $deletedManufacturers = $db->exec(
                'DELETE m FROM shop_manufacturers m
                 LEFT JOIN shop_products p ON p.manufacturer_id = m.id
                 WHERE p.id IS NULL'
            );
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }

        $remainingBrands = (int)$db->query(
            'SELECT COUNT(*) FROM shop_brands b
             LEFT JOIN shop_product_brands pb ON pb.brand_id = b.id
             WHERE pb.brand_id IS NULL'
        )->fetchColumn();
        $remainingManufacturers = (int)$db->query(
            'SELECT COUNT(*) FROM shop_manufacturers m
             LEFT JOIN shop_products p ON p.manufacturer_id = m.id
             WHERE p.id IS NULL'
        )->fetchColumn();
        jsonResponse([
            'success' => true,
            'deleted_brands' => (int)$deletedBrands,
            'deleted_manufacturers' => (int)$deletedManufacturers,
            'remaining_unused_brands' => $remainingBrands,
            'remaining_unused_manufacturers' => $remainingManufacturers,
        ]);
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
        $payload = seoResearchPayload($body, !empty($body['final_catalog']));
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
        $productSku = trim((string)($body['supplier_product_code'] ?? $body['sku'] ?? $current['supplier_product_code'] ?? $current['sku'] ?? ''));
        if ($productSku === '') throw new InvalidArgumentException('SKU-ul public Boomag lipsește din asocierea produsului.');
        $db->beginTransaction();
        try {
            $update = $db->prepare(
                'UPDATE shop_products SET sku = ?, supplier_product_code = ?, name = ?, slug = ?, short_description = ?, description_title = ?, description_html = ?, specifications_json = ?, questions_json = ?, meta_title = ?, meta_description = ?, content_status = "seo", seo_researched_at = NOW(), seo_word_count = ?, seo_sources_json = ? WHERE id = ?'
            );
            $update->execute([
                $productSku, $productSku, $payload['name'], uniqueSlug($db, 'shop_products', $payload['slug_source'], (string)$current['id']),
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
            shopNirEnsureBoomagKidotoysReferences($db, (string)$current['id']);
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

    $currentUser = validateAuthToken($db, $config, $body);
    // Pe PHP-FPM, răspunsul ajunge întâi la aplicație, iar coada SPV este
    // procesată apoi în fundal. Navigarea rămâne rapidă pe telefon și desktop.
    if (!in_array($action, ['exportProducts', 'exportCatalog', 'exportInvoiceRegistry'], true)) {
        GtrotsSpvService::scheduleWorkerAfterResponse($db, $config);
    }

    if ($action === 'getSpvConnection' && $method === 'GET') {
        GtrotsSpvService::reconcileOutbox($db);
        jsonResponse(GtrotsSpvService::status($db, $config));
    }

    if ($action === 'beginSpvOAuth' && $method === 'POST') {
        $actor = (string)($currentUser['display_name'] ?? $currentUser['username'] ?? 'Administrator');
        jsonResponse(GtrotsSpvService::beginOAuth($db, $config, $actor), 201);
    }

    if ($action === 'testSpvConnection' && $method === 'POST') {
        jsonResponse(GtrotsSpvService::testConnection($db, $config));
    }

    if ($action === 'runSpvDiagnostics' && $method === 'POST') {
        try { jsonResponse(GtrotsSpvService::runTestDiagnostics($db, $config)); }
        catch (RuntimeException $error) { jsonResponse(['error' => $error->getMessage()], 502); }
    }

    if ($action === 'pollSpvDiagnostics' && $method === 'POST') {
        try { jsonResponse(GtrotsSpvService::pollTestDiagnostics($db, $config, (array)($body['indexes'] ?? []))); }
        catch (RuntimeException $error) { jsonResponse(['error' => $error->getMessage()], 502); }
    }

    if ($action === 'updateSpvSettings' && in_array($method, ['PUT', 'PATCH'], true)) {
        $actor = (string)($currentUser['display_name'] ?? $currentUser['username'] ?? 'Administrator');
        jsonResponse(GtrotsSpvService::updateSettings($db, $body, $actor, $config));
    }

    if ($action === 'disconnectSpv' && $method === 'POST') {
        jsonResponse(GtrotsSpvService::disconnect($db, $config));
    }

    if ($action === 'sendInvoiceToSpv' && $method === 'POST') {
        jsonResponse(GtrotsSpvService::sendManual($db, $config, trim((string)($_GET['id'] ?? $body['invoice_id'] ?? ''))));
    }

    if ($action === 'runSpvWorker' && $method === 'POST') {
        jsonResponse(GtrotsSpvService::runWorker($db, $config, max(1, min(20, (int)($body['limit'] ?? 5)))));
    }

    if ($action === 'getShopNotificationSummary' && $method === 'GET') {
        jsonResponse(GtrotsSpvService::notificationSummary($db));
    }

    if ($action === 'listShopNotifications' && $method === 'GET') {
        jsonResponse(GtrotsSpvService::notifications(
            $db,
            (int)($_GET['limit'] ?? 50),
            !isset($_GET['unread_only']) || (string)$_GET['unread_only'] !== '0'
        ));
    }

    if ($action === 'createTestShopNotification' && $method === 'POST') {
        jsonResponse(GtrotsSpvService::createTestNotification($db, (string)($body['kind'] ?? 'test')), 201);
    }

    if ($action === 'markShopNotificationRead' && $method === 'POST') {
        jsonResponse(GtrotsSpvService::markNotification($db, trim((string)($_GET['id'] ?? $body['id'] ?? '')), !empty($body['all'])));
    }

    if ($action === 'getInvoiceThemeSettings' && $method === 'GET') {
        jsonResponse(GtrotsInvoiceThemeStore::settings($db));
    }

    if ($action === 'getInvoiceAutomationSettings' && $method === 'GET') {
        jsonResponse(GtrotsInvoiceAutomation::settings($db));
    }

    if ($action === 'updateInvoiceAutomationSettings' && in_array($method, ['PUT', 'PATCH'], true)) {
        $actor = (string)($currentUser['display_name'] ?? $currentUser['username'] ?? 'Administrator');
        jsonResponse(GtrotsInvoiceAutomation::update($db, $body, $actor));
    }

    if ($action === 'updateInvoiceThemeSettings' && in_array($method, ['PUT', 'PATCH'], true)) {
        $actor = (string)($currentUser['display_name'] ?? $currentUser['username'] ?? 'Administrator');
        jsonResponse(GtrotsInvoiceThemeStore::update($db, (string)($body['theme'] ?? ''), $actor, $body));
    }

    if ($action === 'assignInvoiceTheme' && $method === 'POST') {
        $actor = (string)($currentUser['display_name'] ?? $currentUser['username'] ?? 'Administrator');
        jsonResponse(GtrotsInvoiceThemeStore::pin($db, $body, $actor), 201);
    }

    if ($action === 'issueInvoice' && $method === 'POST') {
        $orderId = trim((string)($_GET['id'] ?? $body['order_id'] ?? ''));
        $orderStatusStmt = $db->prepare('SELECT status FROM shop_orders WHERE id = ? LIMIT 1');
        $orderStatusStmt->execute([$orderId]);
        $orderStatus = $orderStatusStmt->fetchColumn();
        if ($orderStatus === false) throw new InvalidArgumentException('Comanda nu există.');
        $invoice = GtrotsInvoiceService::issue($db, $orderId, $currentUser, $config);
        $wasExisting = !empty($invoice['existing']);
        if (boolValue($body['send_email'] ?? false)) {
            $notification = GtrotsInvoiceService::sendEmailOnce($db, (string)$invoice['id'], $config);
            $invoice = GtrotsInvoiceService::get($db, (string)$invoice['id'], $config);
            $invoice['existing'] = $wasExisting;
            $invoice['email_notification'] = $notification;
        } else {
            $invoice['email_notification'] = ['requested' => false, 'sent' => false];
        }
        if ((string)$orderStatus === 'return_confirmed') {
            $paired = GtrotsOrderReturnConfirmation::ensureReturnInvoice(
                $db,
                $orderId,
                $config,
                (array)$currentUser,
                boolValue($body['send_return_email'] ?? false)
            );
            $invoice['paired_documents'] = true;
            $invoice['return_invoice'] = $paired['return_invoice'] ?? null;
            $invoice['return_invoice_email'] = $paired['return_invoice_email'] ?? ['sent' => false];
        }
        jsonResponse($invoice, $wasExisting ? 200 : 201);
    }

    if ($action === 'listInvoices' && $method === 'GET') {
        jsonResponse(GtrotsInvoiceService::list($db));
    }

    if ($action === 'getInvoice' && $method === 'GET') {
        $invoiceId = trim((string)($_GET['id'] ?? ''));
        $invoice = GtrotsInvoiceService::get($db, $invoiceId, $config);
        $invoice['spv_job'] = GtrotsSpvService::invoiceState($db, $invoiceId);
        jsonResponse($invoice);
    }

    if ($action === 'downloadInvoice' && $method === 'GET') {
        jsonResponse(GtrotsInvoiceService::download($db, trim((string)($_GET['id'] ?? '')), trim((string)($_GET['format'] ?? 'pdf')), $config));
    }

    if ($action === 'getInvoicePublicLink' && $method === 'GET') {
        jsonResponse(GtrotsInvoiceService::publicLink($db, trim((string)($_GET['id'] ?? '')), $config, trim((string)($_GET['format'] ?? 'pdf'))));
    }

    if ($action === 'sendInvoiceEmail' && $method === 'POST') {
        jsonResponse(GtrotsInvoiceService::sendEmail($db, trim((string)($_GET['id'] ?? $body['invoice_id'] ?? '')), $config));
    }

    if ($action === 'markInvoiceSpvSent' && $method === 'POST') {
        jsonResponse(['error' => 'Starea SPV poate fi confirmată numai de răspunsul ANAF.'], 410);
    }

    if ($action === 'deleteInvoice' && $method === 'DELETE') {
        jsonResponse(GtrotsInvoiceService::delete($db, trim((string)($_GET['id'] ?? '')), $config));
    }

    if ($action === 'nirPermissions' && $method === 'GET') {
        jsonResponse(['permissions' => shopNirPermissions($currentUser)]);
    }

    if ($action === 'listWarehouses' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        jsonResponse($db->query('SELECT * FROM shop_warehouses WHERE is_active = 1 ORDER BY is_default DESC, name ASC')->fetchAll());
    }

    if ($action === 'getNirSettings' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        $settings = shopNirSettings($db);
        if (!shopNirCan($currentUser, 'NIR_VIEW_COSTS')) unset($settings['include_vat_in_inventory_cost'], $settings['price_variance_warning_percent']);
        jsonResponse($settings);
    }

    if ($action === 'getBnrExchangeRate' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        jsonResponse(shopNirBnrExchangeRate((string)($_GET['currency'] ?? ''), (string)($_GET['date'] ?? '')));
    }

    if ($action === 'searchSuppliers' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        $search = mb_substr(trim((string)($_GET['q'] ?? '')), 0, 120);
        $limit = max(1, min(50, (int)($_GET['limit'] ?? 20)));
        $like = '%' . $search . '%';
        $stmt = $db->prepare("SELECT * FROM shop_suppliers WHERE is_active = 1 AND (? = '' OR alias LIKE ? OR name LIKE ? OR cui LIKE ? OR contact_person LIKE ?) ORDER BY COALESCE(NULLIF(alias, ''), name) ASC LIMIT {$limit}");
        $stmt->execute([$search, $like, $like, $like, $like]);
        jsonResponse(array_map('supplierRow', $stmt->fetchAll()));
    }

    if ($action === 'checkSupplierCui' && $method === 'GET') {
        shopNirRequire($currentUser, 'SUPPLIER_CREATE');
        $cui = strtoupper(preg_replace('/\s+/', '', trim((string)($_GET['cui'] ?? ''))) ?? '');
        if ($cui === '') throw new InvalidArgumentException('CUI-ul este obligatoriu.');
        $stmt = $db->prepare('SELECT * FROM shop_suppliers WHERE REPLACE(UPPER(cui), " ", "") = ? LIMIT 1');
        $stmt->execute([$cui]);
        $supplier = $stmt->fetch();
        jsonResponse(['exists' => (bool)$supplier, 'supplier' => $supplier ? supplierRow($supplier) : null]);
    }

    if ($action === 'getSupplier' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        $id = trim((string)($_GET['id'] ?? ''));
        $stmt = $db->prepare('SELECT * FROM shop_suppliers WHERE id = ?');
        $stmt->execute([$id]);
        $supplier = $stmt->fetch();
        if (!$supplier) jsonResponse(['error' => 'Furnizorul nu există.'], 404);
        $result = supplierRow($supplier);
        $result['products'] = shopNirSupplierProducts($db, $id);
        jsonResponse($result);
    }

    if ($action === 'resolveSupplierProductReference' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        $supplierId = trim((string)($_GET['supplier_id'] ?? ''));
        $code = trim((string)($_GET['code'] ?? ''));
        $ean = trim((string)($_GET['ean'] ?? ''));
        $sku = trim((string)($_GET['sku'] ?? ''));
        $name = trim((string)($_GET['name'] ?? ''));
        jsonResponse(shopNirMatchSupplierProduct($db, $supplierId, $code, $ean, $sku, $name));
    }

    if ($action === 'createSupplierProductReference' && $method === 'POST') {
        shopNirRequire($currentUser, 'SUPPLIER_PRODUCT_REFERENCE_MANAGE');
        $db->beginTransaction();
        try {
            $reference = shopNirCreateReference($db, $body, $currentUser);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        jsonResponse($reference, 201);
    }

    if ($action === 'updateSupplierProductReference' && in_array($method, ['PUT', 'PATCH'], true)) {
        shopNirRequire($currentUser, 'SUPPLIER_PRODUCT_REFERENCE_MANAGE');
        $id = trim((string)($_GET['id'] ?? $body['id'] ?? ''));
        $db->beginTransaction();
        try {
            $reference = shopNirReferenceUpdate($db, $id, $body, $currentUser);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        jsonResponse($reference);
    }

    if ($action === 'listProductSupplierReferences' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        jsonResponse(shopNirProductReferences($db, trim((string)($_GET['id'] ?? $_GET['product_id'] ?? ''))));
    }

    if ($action === 'listSupplierProducts' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        jsonResponse(shopNirSupplierProducts($db, trim((string)($_GET['id'] ?? $_GET['supplier_id'] ?? ''))));
    }

    if ($action === 'listNirs' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        jsonResponse(shopNirList($db, $_GET, $currentUser));
    }

    if ($action === 'getNir' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        jsonResponse(shopNirFetchDocument($db, trim((string)($_GET['id'] ?? '')), $currentUser));
    }

    if ($action === 'createNir' && $method === 'POST') {
        shopNirRequire($currentUser, 'NIR_CREATE');
        jsonResponse(shopNirCreateDraft($db, $body, $currentUser), 201);
    }

    if (in_array($action, ['updateNir', 'autosaveNir'], true) && in_array($method, ['PUT', 'PATCH', 'POST'], true)) {
        shopNirRequire($currentUser, 'NIR_EDIT_DRAFT');
        jsonResponse(shopNirUpdateDraft($db, trim((string)($_GET['id'] ?? $body['id'] ?? '')), $body, $currentUser));
    }

    if ($action === 'deleteNirDrafts' && $method === 'DELETE') {
        jsonResponse(shopNirDeleteDrafts($db, $currentUser, isset($_GET['id']) ? trim((string)$_GET['id']) : null));
    }

    if ($action === 'validateNir' && $method === 'POST') {
        shopNirRequire($currentUser, 'NIR_EDIT_DRAFT');
        jsonResponse(shopNirValidateDocument($db, trim((string)($_GET['id'] ?? $body['id'] ?? ''))));
    }

    if ($action === 'confirmNir' && $method === 'POST') {
        shopNirRequire($currentUser, 'NIR_CONFIRM');
        jsonResponse(shopNirConfirm($db, trim((string)($_GET['id'] ?? $body['id'] ?? '')), $body, $currentUser));
    }

    if ($action === 'reopenNir' && $method === 'POST') {
        shopNirRequire($currentUser, 'NIR_EDIT_DRAFT');
        shopNirRequire($currentUser, 'NIR_CONFIRM');
        jsonResponse(shopNirReopenConfirmed($db, trim((string)($_GET['id'] ?? $body['id'] ?? '')), $body, $currentUser));
    }

    if (in_array($action, ['reverseNir', 'stornoNir'], true) && $method === 'POST') {
        shopNirRequire($currentUser, $action === 'stornoNir' ? 'NIR_STORNO' : 'NIR_REVERSE');
        jsonResponse(shopNirReverse($db, trim((string)($_GET['id'] ?? $body['id'] ?? '')), $body, $currentUser));
    }

    if ($action === 'uploadNirAttachment' && $method === 'POST') {
        shopNirRequire($currentUser, 'NIR_EDIT_DRAFT');
        jsonResponse(shopNirAttachmentUpload($db, trim((string)($_GET['id'] ?? $body['nir_id'] ?? '')), $body, $currentUser), 201);
    }

    if ($action === 'extractNirAttachment' && $method === 'POST') {
        shopNirRequire($currentUser, 'NIR_EDIT_DRAFT');
        jsonResponse(shopNirExtractAttachment($db, trim((string)($_GET['id'] ?? $body['nir_id'] ?? '')), trim((string)($body['attachment_id'] ?? '')), $currentUser));
    }

    if ($action === 'downloadNirAttachment' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        jsonResponse(shopNirDownloadAttachment($db, trim((string)($_GET['id'] ?? '')), trim((string)($_GET['attachment_id'] ?? ''))));
    }

    if ($action === 'downloadAllNirAttachments' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        jsonResponse(shopNirDownloadAllAttachments($db, trim((string)($_GET['id'] ?? ''))));
    }

    if ($action === 'downloadNirBundle' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_EXPORT');
        @set_time_limit(0);
        jsonResponse(shopNirDownloadBundle($db, trim((string)($_GET['id'] ?? '')), $currentUser));
    }

    if ($action === 'downloadNirRegistryBundle' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_EXPORT');
        @set_time_limit(0);
        jsonResponse(shopNirDownloadRegistryBundle(
            $db,
            trim((string)($_GET['from'] ?? '')),
            trim((string)($_GET['to'] ?? '')),
            ((int)($_GET['include_documents'] ?? 0)) === 1,
            $currentUser
        ));
    }

    if ($action === 'getNirExportEstimate' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_EXPORT');
        jsonResponse(shopNirExportEstimate(
            $db,
            trim((string)($_GET['from'] ?? '')),
            trim((string)($_GET['to'] ?? '')),
            ((int)($_GET['include_documents'] ?? 0)) === 1
        ));
    }

    if ($action === 'getNirMovements' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        jsonResponse(shopNirDocumentMovements($db, trim((string)($_GET['id'] ?? ''))));
    }

    if ($action === 'getNirFifoLayers' && $method === 'GET') {
        shopNirRequire($currentUser, 'FIFO_VIEW');
        jsonResponse(shopNirDocumentLayers($db, trim((string)($_GET['id'] ?? ''))));
    }

    if ($action === 'exportNir' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_EXPORT');
        jsonResponse(shopNirExport($db, trim((string)($_GET['id'] ?? '')), strtolower(trim((string)($_GET['format'] ?? 'pdf'))), $currentUser));
    }

    if ($action === 'getProductPurchaseHistory' && $method === 'GET') {
        jsonResponse(shopNirPurchaseHistory($db, trim((string)($_GET['id'] ?? $_GET['product_id'] ?? '')), $currentUser));
    }

    if ($action === 'getProductFifoLayers' && $method === 'GET') {
        jsonResponse(shopNirFifoLayers($db, trim((string)($_GET['id'] ?? $_GET['product_id'] ?? '')), $_GET, $currentUser));
    }

    if ($action === 'previewProductFifo' && $method === 'POST') {
        jsonResponse(shopNirFifoPreviewForProduct($db, trim((string)($_GET['id'] ?? $body['product_id'] ?? '')), $body, $currentUser));
    }

    if ($action === 'getFifoReconciliation' && $method === 'GET') {
        jsonResponse(shopNirOpeningBalanceReport($db, $currentUser));
    }

    if ($action === 'createFifoOpeningBalance' && $method === 'POST') {
        shopNirRequire($currentUser, 'FIFO_OPENING_BALANCE_MANAGE');
        jsonResponse(shopNirCreateOpeningBalance($db, $body, $currentUser), 201);
    }

    if ($action === 'getNirAudit' && $method === 'GET') {
        shopNirRequire($currentUser, 'NIR_VIEW');
        $id = trim((string)($_GET['id'] ?? ''));
        $stmt = $db->prepare('SELECT * FROM shop_domain_audit WHERE entity_id = ? OR (entity_type = "InventoryCostLayer" AND JSON_UNQUOTE(JSON_EXTRACT(new_values_json, "$.nir_document_id")) = ?) ORDER BY created_at DESC LIMIT 500');
        $stmt->execute([$id, $id]);
        jsonResponse($stmt->fetchAll());
    }

    if ($action === 'listCustomers' && $method === 'GET') {
        $rows = $db->query(
            'SELECT c.id, c.email, c.full_name, c.phone, c.avatar_url, c.is_active, c.last_login_at, c.created_at, c.updated_at,
                    COUNT(o.id) AS orders_count,
                    COALESCE(SUM(CASE WHEN o.status NOT IN ("cancelled", "refunded") THEN o.total ELSE 0 END), 0) AS orders_total,
                    MAX(o.created_at) AS last_order_at
             FROM shop_customers c
             LEFT JOIN shop_orders o ON LOWER(o.customer_email) = LOWER(c.email)
             GROUP BY c.id
             ORDER BY COALESCE(MAX(o.created_at), c.created_at) DESC'
        )->fetchAll();
        foreach ($rows as &$row) {
            $row['is_active'] = (bool)$row['is_active'];
            $row['orders_count'] = (int)$row['orders_count'];
            $row['orders_total'] = (float)$row['orders_total'];
        }
        unset($row);
        jsonResponse($rows);
    }

    if ($action === 'getCustomer' && $method === 'GET') {
        $id = trim((string)($_GET['id'] ?? ''));
        $stmt = $db->prepare('SELECT * FROM shop_customers WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $customer = $stmt->fetch();
        if (!$customer) jsonResponse(['error' => 'Clientul nu există.'], 404);
        $orders = $db->prepare('SELECT * FROM shop_orders WHERE LOWER(customer_email) = LOWER(?) ORDER BY created_at DESC LIMIT 500');
        $orders->execute([$customer['email']]);
        $orderRows = array_map(fn(array $row): array => orderRow($db, $row, $config, true), $orders->fetchAll());
        $customer['is_active'] = (bool)$customer['is_active'];
        unset($customer['password_hash'], $customer['google_sub']);
        $customer['orders'] = $orderRows;
        $customer['orders_count'] = count($orderRows);
        $customer['orders_total'] = array_reduce($orderRows, fn(float $sum, array $order): float => $sum + (!in_array($order['status'], ['cancelled', 'refunded'], true) ? (float)$order['total'] : 0), 0.0);
        jsonResponse($customer);
    }

    if ($action === 'updateCustomerStatus' && $method === 'PATCH') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $isActive = boolValue($body['is_active'] ?? true, true);
        $stmt = $db->prepare('UPDATE shop_customers SET is_active = ? WHERE id = ?');
        $stmt->execute([$isActive ? 1 : 0, $id]);
        if ($stmt->rowCount() === 0) {
            $exists = $db->prepare('SELECT id FROM shop_customers WHERE id = ?'); $exists->execute([$id]);
            if (!$exists->fetchColumn()) jsonResponse(['error' => 'Clientul nu există.'], 404);
        }
        if (!$isActive) $db->prepare('DELETE FROM shop_customer_sessions WHERE customer_id = ?')->execute([$id]);
        jsonResponse(['success' => true, 'is_active' => $isActive]);
    }

    if ($action === 'listPromotions' && $method === 'GET') {
        $rows = $db->query('SELECT c.*, p.name AS product_name, p.slug AS product_slug FROM shop_coupons c LEFT JOIN shop_products p ON p.id = c.product_id ORDER BY c.is_active DESC, c.created_at DESC')->fetchAll();
        jsonResponse(array_map(fn(array $row): array => promotionRow($db, $row), $rows));
    }

    if ($action === 'getPromotionStats' && $method === 'GET') {
        $id = trim((string)($_GET['id'] ?? ''));
        $stmt = $db->prepare('SELECT c.*, p.name AS product_name, p.slug AS product_slug FROM shop_coupons c LEFT JOIN shop_products p ON p.id = c.product_id WHERE c.id = ? LIMIT 1');
        $stmt->execute([$id]);
        $promotion = $stmt->fetch();
        if (!$promotion) jsonResponse(['error' => 'Reducerea nu există.'], 404);
        $orders = $db->prepare(
            "SELECT id, order_number, status, customer_name, customer_type, company_name, customer_email, subtotal, discount_total, total, created_at
             FROM shop_orders
             WHERE promotion_id = ? AND discount_total > 0
             ORDER BY created_at DESC
             LIMIT 100"
        );
        $orders->execute([$id]);
        $applications = array_map(static function (array $order): array {
            $order['customer_display_name'] = gtOrderCustomerDisplayName($order);
            $order['subtotal'] = (float)$order['subtotal'];
            $order['discount_total'] = (float)$order['discount_total'];
            $order['total'] = (float)$order['total'];
            $order['is_counted'] = !in_array((string)$order['status'], ['cancelled', 'refunded'], true);
            return $order;
        }, $orders->fetchAll());
        jsonResponse([
            'promotion' => promotionRow($db, $promotion),
            'summary' => promotionStatsSummary($db, $id),
            'applications' => $applications,
        ]);
    }

    if ($action === 'createPromotion' && $method === 'POST') {
        $payload = promotionPayload($db, $body);
        $duplicate = $db->prepare('SELECT id FROM shop_coupons WHERE code = ? LIMIT 1');
        $duplicate->execute([$payload['code']]);
        if ($duplicate->fetchColumn()) jsonResponse(['error' => 'Există deja o reducere cu acest cod.'], 409);
        $id = uuidV4();
        $stmt = $db->prepare('INSERT INTO shop_coupons (id, code, title, description, discount_type, discount_value, min_order_value, audience, scope, product_id, usage_mode, auto_apply, show_banner, banner_text, valid_from, valid_until, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $payload['code'], $payload['title'], $payload['description'], $payload['discount_type'], $payload['discount_value'], $payload['min_order_value'], $payload['audience'], $payload['scope'], $payload['product_id'], $payload['usage_mode'], $payload['auto_apply'] ? 1 : 0, $payload['show_banner'] ? 1 : 0, $payload['banner_text'], $payload['valid_from'], $payload['valid_until'], $payload['is_active'] ? 1 : 0]);
        syncPromotionProducts($db, $id, $payload['product_ids']);
        syncPromotionCustomers($db, $id, $payload['customer_ids']);
        $stmt = $db->prepare('SELECT c.*, p.name AS product_name, p.slug AS product_slug FROM shop_coupons c LEFT JOIN shop_products p ON p.id = c.product_id WHERE c.id = ?');
        $stmt->execute([$id]);
        jsonResponse(promotionRow($db, $stmt->fetch()), 201);
    }

    if ($action === 'updatePromotion' && $method === 'PATCH') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $payload = promotionPayload($db, $body);
        $duplicate = $db->prepare('SELECT id FROM shop_coupons WHERE code = ? AND id <> ? LIMIT 1');
        $duplicate->execute([$payload['code'], $id]);
        if ($duplicate->fetchColumn()) jsonResponse(['error' => 'Există deja o reducere cu acest cod.'], 409);
        $stmt = $db->prepare('UPDATE shop_coupons SET code = ?, title = ?, description = ?, discount_type = ?, discount_value = ?, min_order_value = ?, audience = ?, scope = ?, product_id = ?, usage_mode = ?, auto_apply = ?, show_banner = ?, banner_text = ?, valid_from = ?, valid_until = ?, is_active = ? WHERE id = ?');
        $stmt->execute([$payload['code'], $payload['title'], $payload['description'], $payload['discount_type'], $payload['discount_value'], $payload['min_order_value'], $payload['audience'], $payload['scope'], $payload['product_id'], $payload['usage_mode'], $payload['auto_apply'] ? 1 : 0, $payload['show_banner'] ? 1 : 0, $payload['banner_text'], $payload['valid_from'], $payload['valid_until'], $payload['is_active'] ? 1 : 0, $id]);
        if ($stmt->rowCount() === 0) { $exists = $db->prepare('SELECT id FROM shop_coupons WHERE id = ?'); $exists->execute([$id]); if (!$exists->fetchColumn()) jsonResponse(['error' => 'Reducerea nu există.'], 404); }
        syncPromotionProducts($db, $id, $payload['product_ids']);
        syncPromotionCustomers($db, $id, $payload['customer_ids']);
        if ($payload['usage_mode'] === 'once_per_customer') {
            $backfillUsage = $db->prepare(
                "INSERT IGNORE INTO shop_coupon_customer_usage (coupon_id, customer_id, order_id, used_at)
                 SELECT promotion_id, customer_id, id, created_at
                 FROM shop_orders
                 WHERE promotion_id = ?
                   AND customer_id IS NOT NULL
                   AND discount_total > 0
                   AND status NOT IN ('cancelled', 'refunded')
                 ORDER BY created_at ASC"
            );
            $backfillUsage->execute([$id]);
        }
        $stmt = $db->prepare('SELECT c.*, p.name AS product_name, p.slug AS product_slug FROM shop_coupons c LEFT JOIN shop_products p ON p.id = c.product_id WHERE c.id = ?'); $stmt->execute([$id]);
        jsonResponse(promotionRow($db, $stmt->fetch()));
    }

    if ($action === 'deletePromotion' && $method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $db->prepare('DELETE FROM shop_customer_coupons WHERE coupon_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM shop_coupon_customer_usage WHERE coupon_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM shop_coupon_device_usage WHERE coupon_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM shop_coupon_products WHERE coupon_id = ?')->execute([$id]);
        $stmt = $db->prepare('DELETE FROM shop_coupons WHERE id = ?'); $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Reducerea nu există.'], 404);
        jsonResponse(['success' => true]);
    }

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
            'SELECT o.id, o.order_number, o.status, o.payment_status, o.customer_name, o.customer_type, o.company_name, o.created_at,
                    oi.quantity, oi.unit_price, oi.line_total
             FROM shop_order_items oi
             INNER JOIN shop_orders o ON o.id = oi.order_id
             WHERE oi.product_id = ?
             ORDER BY o.created_at DESC'
        );
        $orders->execute([$product['id']]);
        $orderRows = array_map(function (array $row): array {
            $row['customer_display_name'] = gtOrderCustomerDisplayName($row);
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
        $period = (string)($_GET['period'] ?? '7d');
        $requestedGranularity = strtolower(trim((string)($_GET['granularity'] ?? '')));
        if (!in_array($requestedGranularity, ['', 'hour', 'day', 'week', 'month'], true)) $requestedGranularity = '';
        $allowedPeriods = [
            '24h', 'today', 'yesterday', '7d', '14d', '28d', '30d', '3m', '6m', '12m', '16m',
            'current_week_sun', 'current_week_mon', 'previous_week_sun', 'previous_week_mon',
            'current_month', 'previous_month', 'current_year', 'previous_year', 'all', 'custom',
        ];
        if (!in_array($period, $allowedPeriods, true)) $period = '7d';
        $now = new DateTimeImmutable('now');
        $today = $now->setTime(0, 0);
        $endExclusive = $today->modify('+1 day');
        if ($period === '24h') {
            $rangeStart = $now->modify('-23 hours')->setTime((int)$now->format('H'), 0);
            $endExclusive = $now->setTime((int)$now->format('H'), 0)->modify('+1 hour');
        } elseif ($period === 'today') {
            $rangeStart = $today;
        } elseif ($period === 'yesterday') {
            $rangeStart = $today->modify('-1 day');
            $endExclusive = $today;
        } elseif ($period === 'custom') {
            $startInput = (string)($_GET['start_date'] ?? '');
            $endInput = (string)($_GET['end_date'] ?? '');
            $startDate = DateTimeImmutable::createFromFormat('!Y-m-d', $startInput);
            $endDate = DateTimeImmutable::createFromFormat('!Y-m-d', $endInput);
            if (!$startDate || !$endDate || $startDate->format('Y-m-d') !== $startInput || $endDate->format('Y-m-d') !== $endInput || $startDate > $endDate) {
                jsonResponse(['error' => 'Intervalul de date nu este valid.'], 422);
            }
            $rangeStart = $startDate;
            $endExclusive = $endDate->modify('+1 day');
        } elseif (in_array($period, ['7d', '14d', '28d', '30d', '3m', '6m', '12m', '16m'], true)) {
            $periodDays = ['7d' => 7, '14d' => 14, '28d' => 28, '30d' => 30, '3m' => 92, '6m' => 183, '12m' => 366, '16m' => 488];
            $days = $periodDays[$period];
            $rangeStart = $today->modify('-' . ($days - 1) . ' days');
        } elseif ($period === 'current_week_sun' || $period === 'previous_week_sun') {
            $currentWeekStart = $today->modify('-' . (int)$today->format('w') . ' days');
            $rangeStart = $period === 'current_week_sun' ? $currentWeekStart : $currentWeekStart->modify('-7 days');
            if ($period === 'previous_week_sun') $endExclusive = $currentWeekStart;
        } elseif ($period === 'current_week_mon' || $period === 'previous_week_mon') {
            $currentWeekStart = $today->modify('-' . ((int)$today->format('N') - 1) . ' days');
            $rangeStart = $period === 'current_week_mon' ? $currentWeekStart : $currentWeekStart->modify('-7 days');
            if ($period === 'previous_week_mon') $endExclusive = $currentWeekStart;
        } elseif ($period === 'current_month') {
            $rangeStart = $today->modify('first day of this month');
        } elseif ($period === 'previous_month') {
            $rangeStart = $today->modify('first day of previous month');
            $endExclusive = $today->modify('first day of this month');
        } elseif ($period === 'current_year') {
            $rangeStart = $today->setDate((int)$today->format('Y'), 1, 1);
        } elseif ($period === 'previous_year') {
            $currentYear = (int)$today->format('Y');
            $rangeStart = $today->setDate($currentYear - 1, 1, 1);
            $endExclusive = $today->setDate($currentYear, 1, 1);
        } else {
            $firstOrderCreatedAt = $db->query('SELECT MIN(created_at) FROM shop_orders')->fetchColumn();
            $firstOrderDate = is_string($firstOrderCreatedAt) && $firstOrderCreatedAt !== ''
                ? DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $firstOrderCreatedAt)
                : false;
            $rangeStart = $firstOrderDate ?: $today;
        }
        $rangeDays = max(1, (int)$rangeStart->setTime(0, 0)->diff($endExclusive->setTime(0, 0))->days);
        $hourlyPeriod = in_array($period, ['24h', 'today', 'yesterday'], true);
        $weeklyPeriod = in_array($period, ['current_week_sun', 'current_week_mon', 'previous_week_sun', 'previous_week_mon'], true);
        $monthlyPeriod = in_array($period, ['current_month', 'previous_month', 'current_year', 'previous_year', 'all'], true);
        $automaticGranularity = $hourlyPeriod ? 'hour' : ($rangeDays > 120 ? 'month' : 'day');
        $granularity = $automaticGranularity;
        if ($requestedGranularity !== '') {
            $requestedGranularityAllowed = ($requestedGranularity === 'hour' && $hourlyPeriod)
                || ($requestedGranularity === 'day' && $rangeDays <= 730)
                || ($requestedGranularity === 'week' && $rangeDays <= 730 && ($rangeDays >= 7 || $weeklyPeriod))
                || ($requestedGranularity === 'month' && ($rangeDays >= 28 || $monthlyPeriod));
            if ($requestedGranularityAllowed) $granularity = $requestedGranularity;
        }
        $weekStartsOnSunday = in_array($period, ['current_week_sun', 'previous_week_sun'], true);
        $rangeStartSql = $rangeStart->format('Y-m-d H:i:s');
        $rangeEndSql = $endExclusive->format('Y-m-d H:i:s');
        // Încasările sunt conduse de plata efectivă a comenzii, chiar dacă
        // operatorul nu a emis o factură. Comenzile anulate, cu retur confirmat
        // sau deja rambursate nu mai reprezintă încasări curente. Facturile
        // rămân sursa separată pentru evidența fiscală a retururilor.
        $ordersSummaryStatement = $db->prepare(
            'SELECT COUNT(*) AS orders_count,
                    COALESCE(SUM(CASE
                        WHEN payment_status = "paid"
                         AND status NOT IN ("cancelled", "return_confirmed", "refunded")
                        THEN total ELSE 0
                    END), 0) AS collected_revenue
             FROM shop_orders
             WHERE created_at >= ? AND created_at < ?'
        );
        $ordersSummaryStatement->execute([$rangeStartSql, $rangeEndSql]);
        $summary = $ordersSummaryStatement->fetch() ?: [];

        $invoiceSummaryStatement = $db->prepare(
            'SELECT COALESCE(SUM(CASE WHEN invoice_type = "invoice" THEN ABS(total) ELSE 0 END), 0) AS gross_revenue,
                    COALESCE(SUM(CASE WHEN invoice_type = "return" THEN ABS(total) ELSE 0 END), 0) AS returns_total,
                    SUM(CASE WHEN invoice_type = "return" THEN 1 ELSE 0 END) AS returns_count
             FROM shop_invoices
             WHERE issued_at >= ? AND issued_at < ?'
        );
        $invoiceSummaryStatement->execute([$rangeStartSql, $rangeEndSql]);
        $invoiceSummary = $invoiceSummaryStatement->fetch() ?: [];

        // Costul vânzărilor folosește FIFO-ul documentat pe mișcări. Intrarea
        // returului inversează costul ieșirii; NIR-urile furnizorului rămân
        // achiziții/stoc și nu devin cheltuială până la vânzarea mărfii.
        $costSummaryStatement = $db->prepare(
            'SELECT COALESCE(SUM(CASE
                        WHEN movement_type = "sale" THEN ABS(COALESCE(inventory_cost_total_ron, 0))
                        WHEN movement_type IN ("return", "RETURN_IN") THEN -ABS(COALESCE(inventory_cost_total_ron, 0))
                        ELSE 0
                    END), 0) AS cost_of_goods_sold
             FROM shop_inventory_movements
             WHERE created_at >= ? AND created_at < ?'
        );
        $costSummaryStatement->execute([$rangeStartSql, $rangeEndSql]);
        $costSummary = $costSummaryStatement->fetch() ?: [];

        $acquisitionSummaryStatement = $db->prepare(
            'SELECT COALESCE(SUM(CASE
                        WHEN operation_type = "supplier_receipt" THEN ABS(inventory_cost_total_ron)
                        WHEN operation_type = "supplier_return" THEN -ABS(inventory_cost_total_ron)
                        ELSE 0
                    END), 0) AS acquisitions
             FROM shop_nir_documents
             WHERE status = "confirmed"
               AND operation_type IN ("supplier_receipt", "supplier_return")
               AND COALESCE(confirmed_at, created_at) >= ? AND COALESCE(confirmed_at, created_at) < ?'
        );
        $acquisitionSummaryStatement->execute([$rangeStartSql, $rangeEndSql]);
        $acquisitionSummary = $acquisitionSummaryStatement->fetch() ?: [];

        $bucketExpressionFor = static function (string $field) use ($granularity, $weekStartsOnSunday): string {
            if ($granularity === 'hour') return 'DATE_FORMAT(' . $field . ', "%Y-%m-%d %H:00:00")';
            if ($granularity === 'week') {
                $weekOffsetExpression = $weekStartsOnSunday ? 'MOD(WEEKDAY(' . $field . ') + 1, 7)' : 'WEEKDAY(' . $field . ')';
                return 'DATE(DATE_SUB(' . $field . ', INTERVAL ' . $weekOffsetExpression . ' DAY))';
            }
            if ($granularity === 'month') return 'DATE_FORMAT(' . $field . ', "%Y-%m-01")';
            return 'DATE(' . $field . ')';
        };
        $orderBucketExpression = $bucketExpressionFor('o.created_at');
        $invoiceBucketExpression = $bucketExpressionFor('i.issued_at');
        $movementBucketExpression = $bucketExpressionFor('m.created_at');
        $nirBucketExpression = $bucketExpressionFor('COALESCE(n.confirmed_at, n.created_at)');

        $ordersDailyStatement = $db->prepare(
            'SELECT ' . $orderBucketExpression . ' AS day,
                    COUNT(*) AS orders_count,
                    COALESCE(SUM(CASE
                        WHEN o.payment_status = "paid"
                         AND o.status NOT IN ("cancelled", "return_confirmed", "refunded")
                        THEN o.total ELSE 0
                    END), 0) AS collected_revenue
             FROM shop_orders o
             WHERE o.created_at >= ? AND o.created_at < ?
             GROUP BY ' . $orderBucketExpression . '
             ORDER BY day ASC'
        );
        $ordersDailyStatement->execute([$rangeStartSql, $rangeEndSql]);
        $invoicesDailyStatement = $db->prepare(
            'SELECT ' . $invoiceBucketExpression . ' AS day,
                    COALESCE(SUM(CASE WHEN i.invoice_type = "invoice" THEN ABS(i.total) ELSE 0 END), 0) AS gross_revenue,
                    COALESCE(SUM(CASE WHEN i.invoice_type = "return" THEN ABS(i.total) ELSE 0 END), 0) AS returns_total,
                    SUM(CASE WHEN i.invoice_type = "return" THEN 1 ELSE 0 END) AS returns_count
             FROM shop_invoices i
             WHERE i.issued_at >= ? AND i.issued_at < ?
             GROUP BY ' . $invoiceBucketExpression . '
             ORDER BY day ASC'
        );
        $invoicesDailyStatement->execute([$rangeStartSql, $rangeEndSql]);
        $costsDailyStatement = $db->prepare(
            'SELECT ' . $movementBucketExpression . ' AS day,
                    COALESCE(SUM(CASE
                        WHEN m.movement_type = "sale" THEN ABS(COALESCE(m.inventory_cost_total_ron, 0))
                        WHEN m.movement_type IN ("return", "RETURN_IN") THEN -ABS(COALESCE(m.inventory_cost_total_ron, 0))
                        ELSE 0
                    END), 0) AS cost_of_goods_sold
             FROM shop_inventory_movements m
             WHERE m.created_at >= ? AND m.created_at < ?
             GROUP BY ' . $movementBucketExpression . '
             ORDER BY day ASC'
        );
        $costsDailyStatement->execute([$rangeStartSql, $rangeEndSql]);
        $acquisitionsDailyStatement = $db->prepare(
            'SELECT ' . $nirBucketExpression . ' AS day,
                    COALESCE(SUM(CASE
                        WHEN n.operation_type = "supplier_receipt" THEN ABS(n.inventory_cost_total_ron)
                        WHEN n.operation_type = "supplier_return" THEN -ABS(n.inventory_cost_total_ron)
                        ELSE 0
                    END), 0) AS acquisitions
             FROM shop_nir_documents n
             WHERE n.status = "confirmed"
               AND n.operation_type IN ("supplier_receipt", "supplier_return")
               AND COALESCE(n.confirmed_at, n.created_at) >= ? AND COALESCE(n.confirmed_at, n.created_at) < ?
             GROUP BY ' . $nirBucketExpression . '
             ORDER BY day ASC'
        );
        $acquisitionsDailyStatement->execute([$rangeStartSql, $rangeEndSql]);
        $dailyByDate = [];
        foreach ($ordersDailyStatement->fetchAll() as $dailyRow) {
            $day = (string)$dailyRow['day'];
            $dailyByDate[$day] = ['orders_count' => (int)$dailyRow['orders_count']];
        }
        foreach ($invoicesDailyStatement->fetchAll() as $dailyRow) {
            $day = (string)$dailyRow['day'];
            $dailyByDate[$day] = array_merge($dailyByDate[$day] ?? [], $dailyRow);
        }
        foreach ($costsDailyStatement->fetchAll() as $dailyRow) {
            $day = (string)$dailyRow['day'];
            $dailyByDate[$day] = array_merge($dailyByDate[$day] ?? [], $dailyRow);
        }
        foreach ($acquisitionsDailyStatement->fetchAll() as $dailyRow) {
            $day = (string)$dailyRow['day'];
            $dailyByDate[$day] = array_merge($dailyByDate[$day] ?? [], $dailyRow);
        }
        $dailyStats = [];
        if ($granularity === 'month') {
            $cursor = $rangeStart->modify('first day of this month')->setTime(0, 0);
        } elseif ($granularity === 'week') {
            $weekOffset = $weekStartsOnSunday ? (int)$rangeStart->format('w') : (int)$rangeStart->format('N') - 1;
            $cursor = $rangeStart->setTime(0, 0)->modify('-' . $weekOffset . ' days');
        } elseif ($granularity === 'day') {
            $cursor = $rangeStart->setTime(0, 0);
        } else {
            $cursor = $rangeStart->setTime((int)$rangeStart->format('H'), 0);
        }
        while ($cursor < $endExclusive) {
            $day = $granularity === 'hour' ? $cursor->format('Y-m-d H:00:00') : $cursor->format('Y-m-d');
            $daily = $dailyByDate[$day] ?? [];
            $dailyGrossRevenue = round((float)($daily['gross_revenue'] ?? 0), 2);
            $dailyReturnsTotal = round((float)($daily['returns_total'] ?? 0), 2);
            $dailyRevenue = round((float)($daily['collected_revenue'] ?? 0), 2);
            $dailyAcquisitions = round((float)($daily['acquisitions'] ?? 0), 2);
            $dailyCostOfGoodsSold = round((float)($daily['cost_of_goods_sold'] ?? 0), 2);
            $dailyStats[] = [
                'date' => $day,
                'orders_count' => (int)($daily['orders_count'] ?? 0),
                'gross_revenue' => $dailyGrossRevenue,
                'collected_revenue' => $dailyRevenue,
                'returns_count' => (int)($daily['returns_count'] ?? 0),
                'returns_total' => $dailyReturnsTotal,
                'revenue' => $dailyRevenue,
                'acquisitions' => $dailyAcquisitions,
                'cost_of_goods_sold' => $dailyCostOfGoodsSold,
                'profit' => round($dailyRevenue - $dailyCostOfGoodsSold, 2),
            ];
            if ($granularity === 'hour') {
                $cursor = $cursor->modify('+1 hour');
            } elseif ($granularity === 'day') {
                $cursor = $cursor->modify('+1 day');
            } elseif ($granularity === 'week') {
                $cursor = $cursor->modify('+1 week');
            } else {
                $cursor = $cursor->modify('first day of next month')->setTime(0, 0);
            }
        }
        // Dashboardul foloseste doar rezumatul. Nu mai hidratam produsele,
        // istoricul si factura pentru fiecare comanda (era un N+1 costisitor).
        $recentRows = $db->query(
            'SELECT id, order_number, status, payment_status, payment_method,
                    customer_name, customer_type, company_name, total, currency, created_at
             FROM shop_orders
             WHERE status = "new"
             ORDER BY created_at DESC
             LIMIT 8'
        )->fetchAll();
        $newOrdersCount = (int)$db->query('SELECT COUNT(*) FROM shop_orders WHERE status = "new"')->fetchColumn();
        $grossRevenue = round((float)($invoiceSummary['gross_revenue'] ?? 0), 2);
        $returnsTotal = round((float)($invoiceSummary['returns_total'] ?? 0), 2);
        $revenue = round((float)($summary['collected_revenue'] ?? 0), 2);
        $acquisitions = round((float)($acquisitionSummary['acquisitions'] ?? 0), 2);
        $costOfGoodsSold = round((float)($costSummary['cost_of_goods_sold'] ?? 0), 2);
        jsonResponse([
            'revenue' => $revenue,
            'collected_revenue' => $revenue,
            'gross_revenue' => $grossRevenue,
            'returns_count' => (int)($invoiceSummary['returns_count'] ?? 0),
            'returns_total' => $returnsTotal,
            'orders_count' => (int)($summary['orders_count'] ?? 0),
            'new_orders_count' => $newOrdersCount,
            'acquisitions' => $acquisitions,
            'cost_of_goods_sold' => $costOfGoodsSold,
            'profit' => round($revenue - $costOfGoodsSold, 2),
            'products_count' => (int)$db->query('SELECT COUNT(*) FROM shop_products')->fetchColumn(),
            'daily_stats' => $dailyStats,
            'range' => [
                'period' => $period,
                'start' => $rangeStart->format('Y-m-d'),
                'end' => $endExclusive->modify('-1 second')->format('Y-m-d'),
                'granularity' => $granularity,
            ],
            'recent_orders' => array_map(static fn(array $row): array => [
                'id' => (string)$row['id'],
                'order_number' => (string)$row['order_number'],
                'status' => (string)$row['status'],
                'payment_status' => (string)$row['payment_status'],
                'payment_method' => (string)$row['payment_method'],
                'customer_name' => (string)$row['customer_name'],
                'customer_display_name' => gtOrderCustomerDisplayName($row),
                'total' => (float)$row['total'],
                'currency' => (string)$row['currency'],
                'created_at' => (string)$row['created_at'],
            ], $recentRows),
        ]);
    }

    if ($action === 'productManagerBootstrap' && in_array($method, ['GET', 'POST'], true)) {
        // Catalogul CRM este paginat chiar pe server. In acest fel telefonul nu
        // mai descarca si nu mai transforma mii de produse doar pentru a afisa
        // primele zece randuri.
        $page = max(1, (int)($body['page'] ?? ($_GET['page'] ?? 1)));
        $pageSize = max(5, min(100, (int)($body['page_size'] ?? ($_GET['page_size'] ?? 10))));
        $query = mb_substr(trim((string)($body['q'] ?? ($_GET['q'] ?? ''))), 0, 160);
        $supplierId = trim((string)($body['supplier_id'] ?? ($_GET['supplier_id'] ?? '')));
        $includeMetadata = filter_var($body['include_metadata'] ?? ($_GET['include_metadata'] ?? true), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($includeMetadata === null) $includeMetadata = true;
        if ($query !== '') {
            // Pentru căutare încărcăm doar câmpurile compacte ale catalogului și
            // calculăm relevanța tolerant la diacritice, sinonime și greșeli de tastare.
            // Catalogul curent are o dimensiune sigură pentru această evaluare, iar
            // pagina trimisă clientului rămâne limitată la dimensiunea cerută.
            $candidateRows = $db->query(productListSql() . ' ORDER BY ' . productStockOrderSql() . ' ASC, p.updated_at DESC, p.name ASC')->fetchAll();
            $scored = [];
            foreach ($candidateRows as $row) {
                $score = productSemanticSearchScore($row, $query);
                if ($score <= 0) continue;
                $row['_search_score'] = $score;
                $scored[] = $row;
            }
            usort($scored, static function (array $left, array $right): int {
                $scoreOrder = ((float)$right['_search_score']) <=> ((float)$left['_search_score']);
                return $scoreOrder !== 0 ? $scoreOrder : strcasecmp((string)$left['name'], (string)$right['name']);
            });
            $total = count($scored);
            $lastPage = max(1, (int)ceil($total / $pageSize));
            $page = min($page, $lastPage);
            $products = array_slice($scored, ($page - 1) * $pageSize, $pageSize);
        } else {
            $total = (int)$db->query('SELECT COUNT(*) FROM shop_products')->fetchColumn();
            $lastPage = max(1, (int)ceil($total / $pageSize));
            $page = min($page, $lastPage);
            $offset = ($page - 1) * $pageSize;
            $productStmt = $db->query(productListSql() . ' ORDER BY ' . productStockOrderSql() . ' ASC, p.updated_at DESC, p.name ASC LIMIT ' . $pageSize . ' OFFSET ' . $offset);
            $products = $productStmt->fetchAll();
        }
        $categories = $includeMetadata ? $db->query('SELECT c.*, p.name AS parent_name FROM shop_categories c LEFT JOIN shop_categories p ON p.id = c.parent_id ORDER BY COALESCE(p.name, c.name) ASC, c.parent_id IS NOT NULL ASC, c.name ASC')->fetchAll() : [];
        $brands = $includeMetadata ? $db->query('SELECT * FROM shop_brands ORDER BY name ASC')->fetchAll() : [];
        $manufacturers = $includeMetadata ? $db->query('SELECT * FROM shop_manufacturers ORDER BY name ASC')->fetchAll() : [];
        $sources = $includeMetadata ? $db->query(
            'SELECT s.*,
                    (SELECT COUNT(*) FROM shop_products p WHERE p.source_id = s.id) AS product_count
             FROM shop_product_sources s
             ORDER BY s.is_default DESC, s.sort_order ASC, s.name ASC'
        )->fetchAll() : [];
        jsonResponse([
            'products' => productListRows($products, $config),
            'total' => $total,
            'page' => $page,
            'page_size' => $pageSize,
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

    if ($action === 'exportProducts' && $method === 'POST') {
        require_once __DIR__ . '/product-export.php';
        set_time_limit(180);
        jsonResponse(GtrotsProductExport::download($db, $body));
    }

    if ($action === 'exportCatalog' && $method === 'POST') {
        require_once __DIR__ . '/product-export.php';
        jsonResponse(GtrotsProductExport::taxonomy($db, (string)($body['kind'] ?? '')));
    }

    if ($action === 'exportInvoiceRegistry' && $method === 'POST') {
        require_once __DIR__ . '/invoice-export.php';
        @set_time_limit(0);
        jsonResponse(GtrotsInvoiceExport::download($db, $body, $config));
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
        // Vizibilitatea sursei este deja citita imediat de website. Stripe va
        // prelua aceste produse prin sincronizarea in loturi, fara blocarea
        // salvarii sursei intr-o singura cerere lunga.
        $markStripePending = $db->prepare('UPDATE shop_products SET stripe_synced_at = NULL, updated_at = updated_at WHERE source_id = ?');
        $markStripePending->execute([$id]);
        $stmt = $db->prepare('SELECT * FROM shop_product_sources WHERE id = ?');
        $stmt->execute([$id]);
        $sourceResponse = sourceRow($stmt->fetch());
        $sourceResponse['stripe_sync'] = ['queued' => $markStripePending->rowCount()];
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
        $rows = $db->query(productListSql() . ' ORDER BY ' . productStockOrderSql() . ' ASC, p.updated_at DESC, p.name ASC')->fetchAll();
        jsonResponse(productListRows($rows, $config));
    }

    if ($action === 'listProductOptions' && in_array($method, ['GET', 'POST'], true)) {
        // Selectorul nu descarca intregul catalog. Intoarce doar rezultatele
        // cautarii si produsele deja selectate, ca sa ramana rapid si la zeci
        // de mii de produse.
        $query = mb_substr(trim((string)($body['q'] ?? ($_GET['q'] ?? ''))), 0, 160);
        $supplierId = mb_substr(trim((string)($body['supplier_id'] ?? ($_GET['supplier_id'] ?? ''))), 0, 36);
        $rawIds = is_array($body['ids'] ?? null) ? $body['ids'] : [];
        $ids = array_values(array_unique(array_filter(array_map(static fn($value): string => trim((string)$value), $rawIds))));
        $ids = array_slice($ids, 0, 250);
        $limit = max(1, min($ids ? 250 : 50, (int)($body['limit'] ?? ($_GET['limit'] ?? 40))));

        if ($query === '' && !$ids && $supplierId === '') jsonResponse([]);

        $conditions = [];
        $params = [];
        if ($query !== '') {
            $needle = '%' . $query . '%';
            $referenceMatch = $supplierId !== ''
                ? 'EXISTS (SELECT 1 FROM shop_supplier_product_references ref WHERE ref.product_id = p.id AND ref.is_active = 1 AND ref.supplier_id = ? AND (ref.supplier_product_code_original LIKE ? OR ref.supplier_product_code_normalized LIKE ? OR ref.supplier_product_name LIKE ?))'
                : 'EXISTS (SELECT 1 FROM shop_supplier_product_references ref WHERE ref.product_id = p.id AND ref.is_active = 1 AND (ref.supplier_product_code_original LIKE ? OR ref.supplier_product_code_normalized LIKE ? OR ref.supplier_product_name LIKE ?))';
            $conditions[] = '(p.name LIKE ? OR p.sku LIKE ? OR p.supplier_product_code LIKE ? OR p.ean LIKE ? OR ' . $referenceMatch . ')';
            array_push($params, $needle, $needle, $needle, $needle);
            if ($supplierId !== '') $params[] = $supplierId;
            array_push($params, $needle, '%' . shopNirNormalizeSupplierCode($query) . '%', $needle);
        }
        if ($ids) {
            $conditions[] = 'p.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
            array_push($params, ...$ids);
        }
        if (!$conditions) $conditions[] = '1 = 1';

        $associationOrder = '';
        $orderParams = [];
        if ($supplierId !== '') {
            $associationOrder = 'CASE WHEN EXISTS (SELECT 1 FROM shop_supplier_product_references ranked_ref WHERE ranked_ref.product_id = p.id AND ranked_ref.supplier_id = ? AND ranked_ref.is_active = 1) THEN 0 ELSE 1 END ASC, ';
            $orderParams[] = $supplierId;
        }

        $sql = "SELECT p.id, p.name, p.sku, p.supplier_product_code, p.stock_mode, p.stock_quantity,
                       (SELECT pi.image_path
                        FROM shop_product_images pi
                        WHERE pi.product_id = p.id
                        ORDER BY pi.sort_order ASC, pi.created_at ASC
                        LIMIT 1) AS image_path
                FROM shop_products p
                WHERE " . implode(' OR ', $conditions) . "
                ORDER BY " . $associationOrder . "p.name ASC, p.id ASC
                LIMIT " . $limit;
        $stmt = $db->prepare($sql);
        $stmt->execute(array_merge($params, $orderParams));
        $rows = $stmt->fetchAll();
        $referencesByProduct = [];
        if ($supplierId !== '' && $rows) {
            $productIds = array_values(array_unique(array_map(static fn(array $row): string => (string)$row['id'], $rows)));
            $referenceSql =
                'SELECT r.* FROM shop_supplier_product_references r
                 WHERE r.supplier_id = ? AND r.is_active = 1
                   AND r.product_id IN (' . implode(',', array_fill(0, count($productIds), '?')) . ')
                 ORDER BY r.product_id ASC, r.is_primary_for_supplier DESC, r.last_used_at DESC, r.updated_at DESC, r.created_at DESC';
            $referenceStmt = $db->prepare($referenceSql);
            $referenceStmt->execute(array_merge([$supplierId], $productIds));
            foreach ($referenceStmt->fetchAll() as $reference) {
                $productId = (string)$reference['product_id'];
                if (!isset($referencesByProduct[$productId])) $referencesByProduct[$productId] = $reference;
            }
        }
        jsonResponse(array_map(static function (array $row) use ($config, $referencesByProduct): array {
            $path = trim((string)($row['image_path'] ?? ''));
            $images = [];
            if ($path !== '') {
                $images[] = [
                    'id' => 'primary-' . (string)$row['id'],
                    'url' => preg_match('#^https?://#i', $path) ? $path : rtrim((string)$config['public_base_url'], '/') . '/' . ltrim($path, '/'),
                    'alt_text' => (string)$row['name'],
                    'sort_order' => 0,
                ];
            }
            $reference = $referencesByProduct[(string)$row['id']] ?? null;
            return [
                'id' => (string)$row['id'],
                'name' => (string)$row['name'],
                'sku' => (string)($row['sku'] ?? ''),
                'supplier_product_code' => (string)($row['supplier_product_code'] ?? ''),
                'stock_mode' => (string)($row['stock_mode'] ?? 'tracked'),
                'stock_quantity' => (int)($row['stock_quantity'] ?? 0),
                'images' => $images,
                'supplier_reference' => $reference ? [
                    'id' => (string)$reference['id'],
                    'supplier_product_code_original' => (string)($reference['supplier_product_code_original'] ?? ''),
                    'supplier_product_name' => $reference['supplier_product_name'] !== null ? (string)$reference['supplier_product_name'] : null,
                    'supplier_ean' => $reference['supplier_ean'] !== null ? (string)$reference['supplier_ean'] : null,
                    'purchase_unit' => (string)($reference['purchase_unit'] ?? 'buc'),
                    'stock_unit' => (string)($reference['stock_unit'] ?? 'buc'),
                    'conversion_factor' => (string)($reference['conversion_factor'] ?? '1'),
                    'is_primary_for_supplier' => (bool)($reference['is_primary_for_supplier'] ?? false),
                ] : null,
            ];
        }, $rows));
    }

    if ($action === 'listProductOptionIds' && in_array($method, ['GET', 'POST'], true)) {
        // Pentru „Selecteaza toate” trimitem doar ID-urile, fara imagini sau
        // continutul produselor. Chiar si cataloagele foarte mari raman rapide.
        $rows = $db->query('SELECT id FROM shop_products WHERE is_active = 1 ORDER BY name ASC, id ASC')->fetchAll(PDO::FETCH_COLUMN);
        jsonResponse(array_values(array_map('strval', $rows)));
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
            shopNirEnsureBoomagKidotoysReferences($db, $id);
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
            if (mb_strtolower(trim((string)$payload['source_domain'])) === 'boomag.ro') {
                $difference = $db->prepare(
                    'UPDATE shop_products
                     SET supplier_price_difference = CASE
                         WHEN supplier_base_price IS NULL THEN NULL
                         ELSE ROUND(? - supplier_base_price, 2)
                     END,
                     updated_at = updated_at
                     WHERE id = ?'
                );
                $difference->execute([$payload['price'], $id]);
            }
            syncProductBrands($db, $id, $payload['brand_ids']);
            syncProductImages($db, $id, $payload['images'], $payload['name']);
            shopNirEnsureBoomagKidotoysReferences($db, $id);
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
        $rows = $db->query(productListSql() . ' ORDER BY ' . productStockOrderSql() . ' ASC, p.name ASC')->fetchAll();
        $products = productListRows($rows, $config);
        $searchTerms = [];
        $appendInventorySearchTerms = static function (array $row) use (&$searchTerms): void {
            $productId = trim((string)($row['product_id'] ?? ''));
            if ($productId === '') return;
            if (!isset($searchTerms[$productId])) $searchTerms[$productId] = [];
            foreach (['supplier_alias', 'supplier_name', 'supplier_cui', 'supplier_code', 'supplier_product_name', 'supplier_ean'] as $field) {
                $value = trim((string)($row[$field] ?? ''));
                if ($value !== '') $searchTerms[$productId][mb_strtolower($value, 'UTF-8')] = $value;
            }
        };
        $referenceSearch = $db->query(
            'SELECT r.product_id, s.alias AS supplier_alias, s.name AS supplier_name, s.cui AS supplier_cui,
                    r.supplier_product_code_original AS supplier_code, r.supplier_product_name, r.supplier_ean
             FROM shop_supplier_product_references r
             INNER JOIN shop_suppliers s ON s.id = r.supplier_id
             WHERE r.is_active = 1'
        )->fetchAll();
        foreach ($referenceSearch as $row) $appendInventorySearchTerms($row);
        $purchaseSearch = $db->query(
            'SELECT l.product_id, s.alias AS supplier_alias, s.name AS supplier_name, s.cui AS supplier_cui,
                    l.supplier_product_code AS supplier_code, l.supplier_product_name, l.supplier_ean
             FROM shop_nir_lines l
             INNER JOIN shop_nir_documents n ON n.id = l.nir_document_id AND n.status = "confirmed"
             INNER JOIN shop_suppliers s ON s.id = n.supplier_id
             WHERE l.product_id IS NOT NULL AND l.accepted_quantity > 0 AND l.resolution_status <> "reversal"'
        )->fetchAll();
        foreach ($purchaseSearch as $row) $appendInventorySearchTerms($row);
        foreach ($products as &$product) {
            $product['inventory_search_terms'] = implode(' ', array_values($searchTerms[(string)$product['id']] ?? []));
        }
        unset($product);
        jsonResponse($products);
    }

    if ($action === 'listInventoryMovements' && $method === 'GET') {
        $productId = trim((string)($_GET['id'] ?? $_GET['product_id'] ?? ''));
        $stmt = $db->prepare('SELECT im.*, p.name AS product_name, o.order_number, i.series AS invoice_series, i.invoice_number FROM shop_inventory_movements im INNER JOIN shop_products p ON p.id = im.product_id LEFT JOIN shop_orders o ON o.id = im.order_id LEFT JOIN shop_invoices i ON i.id = im.sales_invoice_id WHERE (? = "" OR im.product_id = ?) ORDER BY im.created_at DESC LIMIT 300');
        $stmt->execute([$productId, $productId]);
        $rows = $stmt->fetchAll();
        $invoiceIds = array_values(array_unique(array_filter(array_map(static fn(array $row): string => trim((string)($row['sales_invoice_id'] ?? '')), $rows))));
        $allocationsByInvoiceAndProduct = [];
        if ($invoiceIds) {
            $placeholders = implode(',', array_fill(0, count($invoiceIds), '?'));
            $fifo = $db->prepare(
                "SELECT c.source_document_id AS sales_invoice_id, c.product_id, c.quantity, c.unit_cost_ron, c.total_cost_ron,
                        l.id AS layer_id, l.reception_date, l.source_reference, l.invoice_number_snapshot,
                        n.nir_number, s.id AS supplier_id, s.name AS supplier_name, s.alias AS supplier_alias
                 FROM shop_inventory_layer_consumptions c
                 INNER JOIN shop_inventory_cost_layers l ON l.id = c.inventory_cost_layer_id
                 LEFT JOIN shop_nir_documents n ON n.id = l.nir_document_id
                 LEFT JOIN shop_suppliers s ON s.id = l.supplier_id
                 WHERE c.source_document_type = 'SALES_INVOICE' AND c.reversed_at IS NULL AND c.source_document_id IN ({$placeholders})
                 ORDER BY l.reception_date ASC, l.created_at ASC, l.id ASC"
            );
            $fifo->execute($invoiceIds);
            foreach ($fifo->fetchAll() as $allocation) {
                $allocation['supplier_display_name'] = shopNirSupplierDisplayName($allocation, 'Furnizor nespecificat');
                $key = (string)$allocation['sales_invoice_id'] . ':' . (string)$allocation['product_id'];
                $allocationsByInvoiceAndProduct[$key][] = $allocation;
            }
        }
        foreach ($rows as &$row) {
            $row['quantity_delta'] = (int)$row['quantity_delta'];
            $row['quantity_after'] = (int)$row['quantity_after'];
            $key = trim((string)($row['sales_invoice_id'] ?? '')) . ':' . (string)$row['product_id'];
            $row['fifo_allocations'] = $allocationsByInvoiceAndProduct[$key] ?? [];
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

    if ($action === 'listOrdersPage' && $method === 'GET') {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $pageSize = max(5, min(50, (int)($_GET['page_size'] ?? 10)));
        $query = mb_substr(trim((string)($_GET['q'] ?? '')), 0, 180);
        $status = trim((string)($_GET['status'] ?? ''));
        $paymentMethod = trim((string)($_GET['payment_method'] ?? ''));
        $paymentStatus = trim((string)($_GET['payment_status'] ?? ''));
        $allowedStatuses = ['new', 'confirmed', 'processing', 'shipped', 'completed', 'return_requested', 'return_refused', 'return_confirmed', 'refunded', 'cancelled'];
        $allowedPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
        $where = [];
        $params = [];

        if ($status === 'returned') {
            $where[] = 'o.status IN ("return_confirmed", "refunded")';
        } elseif (in_array($status, $allowedStatuses, true)) {
            $where[] = 'o.status = ?';
            $params[] = $status;
        }
        if ($paymentMethod === 'card') {
            $where[] = 'o.payment_method = "card"';
        } elseif ($paymentMethod === 'cash') {
            $where[] = 'o.payment_method <> "card"';
        }
        if (in_array($paymentStatus, $allowedPaymentStatuses, true)) {
            $where[] = 'o.payment_status = ?';
            $params[] = $paymentStatus;
        }
        if ($query !== '') {
            $where[] = 'LOWER(CONCAT_WS(" ",
                o.order_number, o.customer_name, o.customer_phone, o.customer_email, o.customer_type,
                o.company_name, o.company_cui, o.company_registration_number, o.company_address,
                o.created_at, DATE_FORMAT(o.created_at, "%d.%m.%Y"), DATE_FORMAT(o.created_at, "%d/%m/%Y"), DATE_FORMAT(o.created_at, "%H:%i"),
                o.status,
                CASE o.status
                    WHEN "new" THEN "in procesare noua comenzi noi"
                    WHEN "confirmed" THEN "confirmata"
                    WHEN "processing" THEN "in pregatire"
                    WHEN "shipped" THEN "predata curierului"
                    WHEN "completed" THEN "livrata"
                    WHEN "return_requested" THEN "retur solicitat cerere retur"
                    WHEN "return_refused" THEN "retur refuzat respins"
                    WHEN "return_confirmed" THEN "retur confirmat aprobat"
                    WHEN "refunded" THEN "rambursata"
                    WHEN "cancelled" THEN "comanda anulata"
                    ELSE ""
                END,
                o.payment_method,
                CASE WHEN o.payment_method = "card" THEN "card online plata cu cardul" ELSE "ramburs la curier plata ramburs numerar cash" END,
                o.payment_status,
                CASE o.payment_status WHEN "pending" THEN "in asteptare" WHEN "paid" THEN "platita" WHEN "failed" THEN "esuata" WHEN "refunded" THEN "rambursata" ELSE "" END,
                CASE WHEN o.customer_type = "company" OR COALESCE(o.company_name, "") <> "" OR COALESCE(o.company_cui, "") <> "" OR COALESCE(o.company_registration_number, "") <> "" THEN "pj persoana juridica firma" ELSE "pf persoana fizica" END
            )) LIKE LOWER(?)';
            $params[] = '%' . $query . '%';
        }

        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $db->beginTransaction();
        try {
            $count = $db->prepare('SELECT COUNT(*) FROM shop_orders o' . $whereSql);
            $count->execute($params);
            $total = (int)$count->fetchColumn();
            $totalPages = max(1, (int)ceil($total / $pageSize));
            $page = min($page, $totalPages);
            $offset = ($page - 1) * $pageSize;

            $ordersStatement = $db->prepare(
                'SELECT o.*' . GtrotsInvoiceService::orderJoinColumns() .
                ' FROM shop_orders o' . GtrotsInvoiceService::orderJoinSql('o') .
                $whereSql . ' ORDER BY o.created_at DESC, o.id DESC LIMIT ' . $pageSize . ' OFFSET ' . $offset
            );
            $ordersStatement->execute($params);
            $rows = $ordersStatement->fetchAll();

            $summary = $db->query(
                'SELECT COUNT(*) AS orders_count,
                        SUM(CASE WHEN status = "new" THEN 1 ELSE 0 END) AS new_count,
                        SUM(CASE WHEN status = "processing" THEN 1 ELSE 0 END) AS processing_count,
                        COALESCE(SUM(CASE WHEN status NOT IN ("cancelled", "return_confirmed", "refunded") AND payment_status = "paid" THEN total ELSE 0 END), 0) AS collected,
                        COALESCE(SUM(CASE WHEN status NOT IN ("cancelled", "return_confirmed", "refunded") AND payment_method <> "card" AND payment_status = "pending" THEN total ELSE 0 END), 0) AS pending_cash
                 FROM shop_orders'
            )->fetch() ?: [];
            $returnsSummary = $db->query(
                'SELECT COUNT(*) AS returns_count,
                        COALESCE(SUM(ABS(i.total)), 0) AS returns_total
                 FROM shop_invoices i
                 WHERE i.invoice_type = "return"'
            )->fetch() ?: [];
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $collected = round((float)($summary['collected'] ?? 0), 2);
        $pendingCash = round((float)($summary['pending_cash'] ?? 0), 2);

        jsonResponse([
            'orders' => array_map(fn(array $row): array => orderRow($db, $row, $config, false, false), $rows),
            'total' => $total,
            'page' => $page,
            'page_size' => $pageSize,
            'total_pages' => $totalPages,
            'summary' => [
                'orders_count' => (int)($summary['orders_count'] ?? 0),
                'new_count' => (int)($summary['new_count'] ?? 0),
                'processing_count' => (int)($summary['processing_count'] ?? 0),
                'returns_count' => (int)($returnsSummary['returns_count'] ?? 0),
                'returns_total' => round((float)($returnsSummary['returns_total'] ?? 0), 2),
                'collected' => $collected,
                'pending_cash' => $pendingCash,
                'financial_total' => round($collected + $pendingCash, 2),
            ],
        ]);
    }

    if ($action === 'listOrders' && $method === 'GET') {
        $rows = $db->query('SELECT o.*' . GtrotsInvoiceService::orderJoinColumns() . ' FROM shop_orders o' . GtrotsInvoiceService::orderJoinSql('o') . ' ORDER BY o.created_at DESC, o.id DESC LIMIT 500')->fetchAll();
        jsonResponse(array_map(fn(array $row): array => orderRow($db, $row, $config), $rows));
    }

    if ($action === 'getOrder' && $method === 'GET') {
        $id = trim((string)($_GET['id'] ?? ''));
        $stmt = $db->prepare('SELECT o.*, COALESCE(sm.return_cost, 0) AS configured_return_shipping_cost' . GtrotsInvoiceService::orderJoinColumns() . ' FROM shop_orders o LEFT JOIN shop_shipping_methods sm ON sm.id = o.shipping_method_id' . GtrotsInvoiceService::orderJoinSql('o') . ' WHERE o.id = ? OR o.order_number = ? LIMIT 1');
        $stmt->execute([$id, $id]);
        $row = $stmt->fetch();
        if (!$row) jsonResponse(['error' => 'Comanda nu exista.'], 404);
        jsonResponse(orderRow($db, $row, $config, true));
    }

    if ($action === 'updateOrder' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $statuses = ['new', 'confirmed', 'processing', 'shipped', 'completed', 'return_requested', 'return_refused', 'return_confirmed', 'refunded', 'cancelled'];
        $paymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
        $status = trim((string)($body['status'] ?? ''));
        $paymentStatus = trim((string)($body['payment_status'] ?? ''));
        $notifyCustomer = boolValue($body['notify_customer'] ?? false);
        if (!in_array($status, $statuses, true) || !in_array($paymentStatus, $paymentStatuses, true)) throw new InvalidArgumentException('Statusul comenzii nu este valid.');
        $currentOrderStatusStmt = $db->prepare('SELECT status FROM shop_orders WHERE id = ? LIMIT 1');
        $currentOrderStatusStmt->execute([$id]);
        $currentOrderStatus = $currentOrderStatusStmt->fetchColumn();
        if ($currentOrderStatus === false) throw new InvalidArgumentException('Comanda nu există.');
        $requestedStatusChanged = $status !== (string)$currentOrderStatus;
        if ($requestedStatusChanged && !gtrotsCanChangeOrderStatus((string)$currentOrderStatus, $status)) {
            if ((string)$currentOrderStatus === 'return_confirmed') {
                throw new InvalidArgumentException('Returul este deja confirmat. Poți continua doar către Rambursată; Retur solicitat și Retur refuzat nu mai sunt disponibile.');
            }
            throw new InvalidArgumentException('Statusul comenzii nu poate fi mutat la un pas anterior. Alege un status ulterior disponibil.');
        }
        // Nu retrimitem niciodată e-mailul aceluiași status doar pentru că
        // formularul a fost salvat din nou (important mai ales la Anulată).
        if (!$requestedStatusChanged) $notifyCustomer = false;
        $returnDetails = [
            'reason' => (string)($body['return_reason'] ?? ''),
            'bank_iban' => (string)($body['return_bank_iban'] ?? ''),
            'bank_account_holder' => (string)($body['return_bank_account_holder'] ?? ''),
        ];
        $directReturnConfirmation = null;
        if ($status === 'cancelled' && $requestedStatusChanged) {
            $cancellation = GtrotsOrderCancellation::cancelByStaff(
                $db,
                $id,
                (string)($body['cancellation_reason'] ?? ''),
                $config,
                (array)$currentUser
            );
            $stmt = $db->prepare('SELECT o.*' . GtrotsInvoiceService::orderJoinColumns() . ' FROM shop_orders o' . GtrotsInvoiceService::orderJoinSql('o') . ' WHERE o.id = ? LIMIT 1');
            $stmt->execute([$id]);
            $saved = $stmt->fetch();
            if (!$saved) throw new RuntimeException('Comanda anulată nu a putut fi recitită.');
            $order = orderRow($db, $saved, $config, true);
            $order['cancellation'] = [
                'invoice_action' => (string)($cancellation['invoice_action'] ?? 'none'),
                'released_number' => (string)($cancellation['released_number'] ?? ''),
                'return_invoice' => $cancellation['return_invoice'] ?? null,
                'return_invoice_email' => $cancellation['return_invoice_email'] ?? null,
            ];
            $order['email_notification'] = array_merge(['requested' => true], (array)($cancellation['cancellation_email'] ?? []));
            jsonResponse($order);
        }
        if ($status === 'return_requested') {
            $currentStatusStmt = $db->prepare('SELECT status FROM shop_orders WHERE id = ? LIMIT 1');
            $currentStatusStmt->execute([$id]);
            $currentStatus = $currentStatusStmt->fetchColumn();
            if ($currentStatus === false) throw new InvalidArgumentException('Comanda nu există.');
            if ((string)$currentStatus !== 'return_requested') {
                $request = GtrotsOrderReturnRequest::requestByStaff($db, $id, [
                    'reason' => $returnDetails['reason'],
                    'bank_iban' => $returnDetails['bank_iban'],
                    'bank_account_holder' => $returnDetails['bank_account_holder'],
                ], $config, (array)$currentUser, $notifyCustomer);
                $stmt = $db->prepare('SELECT o.*, COALESCE(sm.return_cost, 0) AS configured_return_shipping_cost' . GtrotsInvoiceService::orderJoinColumns() . ' FROM shop_orders o LEFT JOIN shop_shipping_methods sm ON sm.id = o.shipping_method_id' . GtrotsInvoiceService::orderJoinSql('o') . ' WHERE o.id = ? LIMIT 1');
                $stmt->execute([$id]);
                $saved = $stmt->fetch();
                if (!$saved) throw new RuntimeException('Solicitarea de retur nu a putut fi recitită.');
                $order = orderRow($db, $saved, $config, true);
                $email = (array)($request['email_notification'] ?? []);
                $order['email_notification'] = array_merge(['requested' => $notifyCustomer], $email);
                jsonResponse($order);
            }
        }
        if ($status === 'return_confirmed') {
            $currentStatusStmt = $db->prepare('SELECT status FROM shop_orders WHERE id = ? LIMIT 1');
            $currentStatusStmt->execute([$id]);
            $currentStatus = $currentStatusStmt->fetchColumn();
            if ($currentStatus === false) throw new InvalidArgumentException('Comanda nu există.');
            if (!in_array((string)$currentStatus, ['return_requested', 'return_refused', 'return_confirmed'], true)) {
                GtrotsOrderReturnRequest::requestByStaff($db, $id, $returnDetails, $config, (array)$currentUser, false);
                $currentStatus = 'return_requested';
            }
            if ((string)$currentStatus !== 'return_confirmed') {
                $confirmation = GtrotsOrderReturnConfirmation::confirm($db, $id, $config, (array)$currentUser, $notifyCustomer);
                $stmt = $db->prepare('SELECT o.*, COALESCE(sm.return_cost, 0) AS configured_return_shipping_cost' . GtrotsInvoiceService::orderJoinColumns() . ' FROM shop_orders o LEFT JOIN shop_shipping_methods sm ON sm.id = o.shipping_method_id' . GtrotsInvoiceService::orderJoinSql('o') . ' WHERE o.id = ? LIMIT 1');
                $stmt->execute([$id]);
                $saved = $stmt->fetch();
                if (!$saved) throw new RuntimeException('Confirmarea returului nu a putut fi recitită.');
                $order = orderRow($db, $saved, $config, true);
                $order['return_confirmation'] = [
                    'invoice_action' => (string)($confirmation['invoice_action'] ?? 'none_no_positive_invoice'),
                    'return_invoice' => $confirmation['return_invoice'] ?? null,
                    'return_invoice_email' => $confirmation['return_invoice_email'] ?? null,
                ];
                $order['email_notification'] = array_merge(['requested' => $notifyCustomer], (array)($confirmation['status_email'] ?? []));
                jsonResponse($order);
            }
        }
        if ($status === 'refunded') {
            $currentStatusStmt = $db->prepare('SELECT status FROM shop_orders WHERE id = ? LIMIT 1');
            $currentStatusStmt->execute([$id]);
            $currentStatus = $currentStatusStmt->fetchColumn();
            if ($currentStatus === false) throw new InvalidArgumentException('Comanda nu există.');
            if (!in_array((string)$currentStatus, ['return_requested', 'return_refused', 'return_confirmed', 'refunded'], true)) {
                GtrotsOrderReturnRequest::requestByStaff($db, $id, $returnDetails, $config, (array)$currentUser, false);
                $currentStatus = 'return_requested';
            }
            if (in_array((string)$currentStatus, ['return_requested', 'return_refused'], true)) {
                $directReturnConfirmation = GtrotsOrderReturnConfirmation::confirm($db, $id, $config, (array)$currentUser, false);
            }
        }
        $historyId = null;
        $statusChanged = false;
        $paymentChanged = false;
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
            $terminalStatuses = ['refunded', 'cancelled'];
            $currentStatus = (string)$current['status'];
            if ($status === 'refunded' && !in_array($currentStatus, $terminalStatuses, true)) {
                $issuedInvoice = $db->prepare("SELECT series, invoice_number FROM shop_invoices WHERE order_id = ? AND invoice_type = 'invoice' LIMIT 1");
                $issuedInvoice->execute([$id]);
                $invoice = $issuedInvoice->fetch();
                if ($invoice) {
                    $returnInvoiceStmt = $db->prepare("SELECT id FROM shop_invoices WHERE order_id = ? AND invoice_type = 'return' LIMIT 1");
                    $returnInvoiceStmt->execute([$id]);
                    if (!$returnInvoiceStmt->fetchColumn()) {
                        throw new InvalidArgumentException('Comanda are deja factura ' . trim((string)$invoice['series'] . ' ' . (string)$invoice['invoice_number']) . '. Rambursarea poate fi finalizată numai după emiterea facturii de retur.');
                    }
                }
            }
            if ($status === 'refunded') $paymentStatus = 'refunded';
            $statusChanged = $status !== (string)$current['status'];
            $paymentChanged = $paymentStatus !== (string)$current['payment_status'];
            if (in_array($status, $terminalStatuses, true) && !in_array($currentStatus, $terminalStatuses, true)) {
                // Statusurile terminale nu au voie să modifice stocul. Intrarea
                // returului este creată exclusiv, o singură dată, împreună cu
                // factura de retur în GtrotsInvoiceService::issueReturn().
                releasePromotionUsage($db, $id);
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
        if ($paymentChanged) GtrotsInvoiceService::refreshStoredForOrder($db, $id, $config);
        $stmt = $db->prepare('SELECT o.*' . GtrotsInvoiceService::orderJoinColumns() . ' FROM shop_orders o' . GtrotsInvoiceService::orderJoinSql('o') . ' WHERE o.id = ?');
        $stmt->execute([$id]);
        $order = orderRow($db, $stmt->fetch(), $config, true);
        if (is_array($directReturnConfirmation)) {
            $order['return_confirmation'] = [
                'invoice_action' => (string)($directReturnConfirmation['invoice_action'] ?? 'none_no_positive_invoice'),
                'return_invoice' => $directReturnConfirmation['return_invoice'] ?? null,
                'return_invoice_email' => $directReturnConfirmation['return_invoice_email'] ?? null,
            ];
        }
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
        $automation = GtrotsInvoiceAutomation::processOrder($db, $id, $config);
        $order['invoice_automation'] = $automation;
        if (($automation['status'] ?? '') === 'completed') {
            $emailNotification = $order['email_notification'] ?? null;
            $returnConfirmation = $order['return_confirmation'] ?? null;
            $refreshed = $db->prepare('SELECT o.*' . GtrotsInvoiceService::orderJoinColumns() . ' FROM shop_orders o' . GtrotsInvoiceService::orderJoinSql('o') . ' WHERE o.id = ?');
            $refreshed->execute([$id]);
            $order = orderRow($db, $refreshed->fetch(), $config, true);
            if ($emailNotification !== null) $order['email_notification'] = $emailNotification;
            if ($returnConfirmation !== null) $order['return_confirmation'] = $returnConfirmation;
            $order['invoice_automation'] = $automation;
        }
        jsonResponse($order);
    }

    if ($action === 'getPaymentSettings' && $method === 'GET') jsonResponse(paymentSettings($db, $config));

    if ($action === 'listReceiptLocations' && $method === 'GET') {
        jsonResponse(receiptLocationList($db, max(0, (int)($_GET['company_id'] ?? 0))));
    }

    if ($action === 'createReceiptLocation' && $method === 'POST') {
        $location = receiptLocationPayload($body);
        $companyCheck = $db->prepare('SELECT id FROM shop_company_settings WHERE id = ?');
        $companyCheck->execute([$location['company_id']]);
        if (!$companyCheck->fetchColumn()) jsonResponse(['error' => 'Firma nu există.'], 404);
        $db->beginTransaction();
        try {
            $count = $db->prepare('SELECT COUNT(*) FROM shop_company_receipt_locations WHERE company_id = ? FOR UPDATE');
            $count->execute([$location['company_id']]);
            $makeDefault = $location['is_default'] || (int)$count->fetchColumn() === 0;
            if ($makeDefault) $db->prepare('UPDATE shop_company_receipt_locations SET is_default = 0 WHERE company_id = ?')->execute([$location['company_id']]);
            $id = uuidV4();
            $stmt = $db->prepare('INSERT INTO shop_company_receipt_locations (id, company_id, name, address, city, county, postal_code, is_default, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$id, $location['company_id'], $location['name'], $location['address'], $location['city'], $location['county'], $location['postal_code'], $makeDefault ? 1 : 0, $location['sort_order']]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $stmt = $db->prepare('SELECT * FROM shop_company_receipt_locations WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(receiptLocationRow($stmt->fetch()), 201);
    }

    if ($action === 'updateReceiptLocation' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $currentStmt = $db->prepare('SELECT * FROM shop_company_receipt_locations WHERE id = ?');
        $currentStmt->execute([$id]);
        $current = $currentStmt->fetch();
        if (!$current) jsonResponse(['error' => 'Punctul de recepție nu există.'], 404);
        $location = receiptLocationPayload($body + ['company_id' => (int)$current['company_id']]);
        $location['company_id'] = (int)$current['company_id'];
        $db->beginTransaction();
        try {
            $makeDefault = $location['is_default'];
            if ($makeDefault) $db->prepare('UPDATE shop_company_receipt_locations SET is_default = 0 WHERE company_id = ?')->execute([$location['company_id']]);
            $stmt = $db->prepare('UPDATE shop_company_receipt_locations SET name = ?, address = ?, city = ?, county = ?, postal_code = ?, is_default = ?, sort_order = ? WHERE id = ?');
            $stmt->execute([$location['name'], $location['address'], $location['city'], $location['county'], $location['postal_code'], $makeDefault ? 1 : 0, $location['sort_order'], $id]);
            if (!$makeDefault && (bool)$current['is_default']) {
                $fallback = $db->prepare('SELECT id FROM shop_company_receipt_locations WHERE company_id = ? AND id <> ? ORDER BY sort_order ASC, name ASC, id ASC LIMIT 1');
                $fallback->execute([$location['company_id'], $id]);
                $fallbackId = $fallback->fetchColumn();
                if ($fallbackId) $db->prepare('UPDATE shop_company_receipt_locations SET is_default = 1 WHERE id = ?')->execute([$fallbackId]);
                else $db->prepare('UPDATE shop_company_receipt_locations SET is_default = 1 WHERE id = ?')->execute([$id]);
            }
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $stmt = $db->prepare('SELECT * FROM shop_company_receipt_locations WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(receiptLocationRow($stmt->fetch()));
    }

    if ($action === 'deleteReceiptLocation' && $method === 'DELETE') {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $db->beginTransaction();
        try {
            $stmt = $db->prepare('SELECT * FROM shop_company_receipt_locations WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $current = $stmt->fetch();
            if (!$current) jsonResponse(['error' => 'Punctul de recepție nu există.'], 404);
            $count = $db->prepare('SELECT COUNT(*) FROM shop_company_receipt_locations WHERE company_id = ?');
            $count->execute([(int)$current['company_id']]);
            if ((int)$count->fetchColumn() <= 1) throw new InvalidArgumentException('Trebuie să rămână cel puțin un punct de recepție.');
            $db->prepare('DELETE FROM shop_company_receipt_locations WHERE id = ?')->execute([$id]);
            if ((bool)$current['is_default']) {
                $db->prepare('UPDATE shop_company_receipt_locations SET is_default = 1 WHERE company_id = ? ORDER BY sort_order ASC, name ASC, id ASC LIMIT 1')->execute([(int)$current['company_id']]);
            }
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        jsonResponse(['success' => true]);
    }

    if ($action === 'listCompanySettings' && $method === 'GET') jsonResponse(companySettingsList($db, $config));

    if ($action === 'getCompanySettings' && $method === 'GET') {
        $row = $db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch();
        jsonResponse($row ? companySettingsRow($row, $config) : null);
    }

    if ($action === 'createCompanySettings' && $method === 'POST') {
        if ((int)$db->query('SELECT COUNT(*) FROM shop_company_settings')->fetchColumn() >= 1) {
            throw new InvalidArgumentException('Momentan poate fi configurata o singura firma. Editeaza firma existenta.');
        }
        $company = companySettingsPayload($body);
        $stampPath = !empty($body['stamp_base64']) ? saveShopImage((string)$body['stamp_base64'], 'company') : null;
        if ($company['is_default']) $db->exec('UPDATE shop_company_settings SET is_default = 0');
        $stmt = $db->prepare('INSERT INTO shop_company_settings (legal_name, trade_name, cui, registration_number, address, city, county, postal_code, country, email, phone, website, bank_name, iban, share_capital, stamp_path, is_default, vat_payer, vat_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$company['legal_name'], $company['trade_name'], $company['cui'], $company['registration_number'], $company['address'], $company['city'], $company['county'], $company['postal_code'], $company['country'], $company['email'], $company['phone'], $company['website'], $company['bank_name'], $company['iban'], $company['share_capital'], $stampPath, $company['is_default'] ? 1 : 0, $company['vat_payer'] ? 1 : 0, $company['vat_rate']]);
        $id = (int)$db->lastInsertId();
        if (!$company['is_default'] && (int)$db->query('SELECT COUNT(*) FROM shop_company_settings WHERE is_default = 1')->fetchColumn() === 0) $db->prepare('UPDATE shop_company_settings SET is_default = 1 WHERE id = ?')->execute([$id]);
        $stmt = $db->prepare('SELECT * FROM shop_company_settings WHERE id = ?'); $stmt->execute([$id]);
        jsonResponse(companySettingsRow($stmt->fetch(), $config), 201);
    }

    if ($action === 'updateCompanySettings' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = max(1, (int)($_GET['id'] ?? ($body['id'] ?? 0)));
        $company = companySettingsPayload($body);
        $currentStmt = $db->prepare('SELECT * FROM shop_company_settings WHERE id = ?'); $currentStmt->execute([$id]);
        $currentCompany = $currentStmt->fetch();
        if (!$currentCompany) jsonResponse(['error' => 'Firma nu există.'], 404);
        $stampPath = (string)($currentCompany['stamp_path'] ?? '');
        $oldStampPath = '';
        if (boolValue($body['remove_stamp'] ?? false)) { $oldStampPath = $stampPath; $stampPath = ''; }
        if (!empty($body['stamp_base64'])) { $newPath = saveShopImage((string)$body['stamp_base64'], 'company'); $oldStampPath = $stampPath; $stampPath = (string)$newPath; }
        if ($company['is_default']) $db->exec('UPDATE shop_company_settings SET is_default = 0');
        $stmt = $db->prepare('UPDATE shop_company_settings SET legal_name = ?, trade_name = ?, cui = ?, registration_number = ?, address = ?, city = ?, county = ?, postal_code = ?, country = ?, email = ?, phone = ?, website = ?, bank_name = ?, iban = ?, share_capital = ?, stamp_path = ?, is_default = ?, vat_payer = ?, vat_rate = ? WHERE id = ?');
        $stmt->execute([$company['legal_name'], $company['trade_name'], $company['cui'], $company['registration_number'], $company['address'], $company['city'], $company['county'], $company['postal_code'], $company['country'], $company['email'], $company['phone'], $company['website'], $company['bank_name'], $company['iban'], $company['share_capital'], $stampPath ?: null, $company['is_default'] ? 1 : 0, $company['vat_payer'] ? 1 : 0, $company['vat_rate'], $id]);
        if (!$company['is_default'] && (int)$db->query('SELECT COUNT(*) FROM shop_company_settings WHERE is_default = 1')->fetchColumn() === 0) $db->prepare('UPDATE shop_company_settings SET is_default = 1 WHERE id = ?')->execute([$id]);
        if ($oldStampPath && $oldStampPath !== $stampPath) removeShopImage($oldStampPath);
        $stmt = $db->prepare('SELECT * FROM shop_company_settings WHERE id = ?'); $stmt->execute([$id]);
        jsonResponse(companySettingsRow($stmt->fetch(), $config));
    }

    if ($action === 'deleteCompanySettings' && $method === 'DELETE') {
        $id = max(1, (int)($_GET['id'] ?? ($body['id'] ?? 0)));
        if ((int)$db->query('SELECT COUNT(*) FROM shop_company_settings')->fetchColumn() <= 1) throw new InvalidArgumentException('Trebuie să rămână cel puțin o firmă.');
        $stmt = $db->prepare('SELECT stamp_path, is_default FROM shop_company_settings WHERE id = ?'); $stmt->execute([$id]); $company = $stmt->fetch();
        if (!$company) jsonResponse(['error' => 'Firma nu există.'], 404);
        $db->prepare('DELETE FROM shop_company_settings WHERE id = ?')->execute([$id]);
        if ((bool)$company['is_default']) $db->exec('UPDATE shop_company_settings SET is_default = 1 ORDER BY id ASC LIMIT 1');
        if (!empty($company['stamp_path'])) removeShopImage((string)$company['stamp_path']);
        jsonResponse(['success' => true]);
    }

    if ($action === 'syncStripeCatalog' && $method === 'POST') {
        // Un lot are propriul raspuns, evitand timeout-ul unei sincronizari
        // monolitice pentru peste o mie de produse.
        @set_time_limit(90);
        ignore_user_abort(true);
        if (boolValue($body['prepare'] ?? false)) {
            jsonResponse(stripeCatalogSyncPlan($db, null, boolValue($body['force'] ?? false)));
        }
        if (is_array($body['product_ids'] ?? null)) {
            jsonResponse(stripeSyncCatalogSelection($db, $config, $body['product_ids']));
        }
        $cursor = trim((string)($body['cursor'] ?? ''));
        $batchSize = max(1, min(5, (int)($body['batch_size'] ?? 1)));
        jsonResponse(stripeSyncCatalogBatch($db, $config, $cursor, $batchSize));
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
        $stmt = $db->prepare('INSERT INTO shop_shipping_methods (id, name, description, cost, return_cost, free_above, eta_label, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $name, mb_substr(trim((string)($body['description'] ?? '')), 0, 500), moneyValue($body['cost'] ?? 0, 'Costul livrarii'), moneyValue($body['return_cost'] ?? 0, 'Costul returului'), moneyValue($body['free_above'] ?? null, 'Pragul de gratuitate', true), mb_substr(trim((string)($body['eta_label'] ?? '')), 0, 120), boolValue($body['is_active'] ?? true, true) ? 1 : 0, (int)($body['sort_order'] ?? 0)]);
        $stmt = $db->prepare('SELECT * FROM shop_shipping_methods WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(shippingRow($stmt->fetch()), 201);
    }

    if ($action === 'updateShippingMethod' && in_array($method, ['PUT', 'PATCH'], true)) {
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 120);
        if ($name === '') throw new InvalidArgumentException('Numele livrarii este obligatoriu.');
        $stmt = $db->prepare('UPDATE shop_shipping_methods SET name = ?, description = ?, cost = ?, return_cost = ?, free_above = ?, eta_label = ?, is_active = ?, sort_order = ? WHERE id = ?');
        $stmt->execute([$name, mb_substr(trim((string)($body['description'] ?? '')), 0, 500), moneyValue($body['cost'] ?? 0, 'Costul livrarii'), moneyValue($body['return_cost'] ?? 0, 'Costul returului'), moneyValue($body['free_above'] ?? null, 'Pragul de gratuitate', true), mb_substr(trim((string)($body['eta_label'] ?? '')), 0, 120), boolValue($body['is_active'] ?? true, true) ? 1 : 0, (int)($body['sort_order'] ?? 0), $id]);
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

    if ($action === 'listSuppliers' && $method === 'GET') {
        jsonResponse(array_map('supplierRow', $db->query("SELECT * FROM shop_suppliers ORDER BY is_active DESC, COALESCE(NULLIF(alias, ''), name) ASC")->fetchAll()));
    }

    if ($action === 'createSupplier' && $method === 'POST') {
        shopNirRequire($currentUser, 'SUPPLIER_CREATE');
        $payload = supplierPayload($body);
        $id = uuidV4();
        $stmt = $db->prepare('INSERT INTO shop_suppliers (id, name, alias, contact_person, email, phone, website, cui, registration_number, vat_number, is_vat_payer, default_vat_rate, address, address_line2, city, county, postal_code, country, default_currency, payment_terms, notes, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $payload['name'], $payload['alias'], $payload['contact_person'] ?: null, $payload['email'] ?: null, $payload['phone'] ?: null, $payload['website'] ?: null, $payload['cui'] ?: null, $payload['registration_number'] ?: null, $payload['vat_number'] ?: null, $payload['is_vat_payer'] ? 1 : 0, $payload['default_vat_rate'], $payload['address'] ?: null, $payload['address_line2'] ?: null, $payload['city'] ?: null, $payload['county'] ?: null, $payload['postal_code'] ?: null, $payload['country'] ?: 'România', $payload['default_currency'], $payload['payment_terms'] ?: null, $payload['notes'] ?: null, $payload['is_active'] ? 1 : 0]);
        $stmt = $db->prepare('SELECT * FROM shop_suppliers WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(supplierRow($stmt->fetch()), 201);
    }

    if ($action === 'updateSupplier' && in_array($method, ['PUT', 'PATCH'], true)) {
        shopNirRequire($currentUser, 'SUPPLIER_CREATE');
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $payload = supplierPayload($body);
        $stmt = $db->prepare('UPDATE shop_suppliers SET name = ?, alias = ?, contact_person = ?, email = ?, phone = ?, website = ?, cui = ?, registration_number = ?, vat_number = ?, is_vat_payer = ?, default_vat_rate = ?, address = ?, address_line2 = ?, city = ?, county = ?, postal_code = ?, country = ?, default_currency = ?, payment_terms = ?, notes = ?, is_active = ?, row_version = row_version + 1 WHERE id = ?');
        $stmt->execute([$payload['name'], $payload['alias'], $payload['contact_person'] ?: null, $payload['email'] ?: null, $payload['phone'] ?: null, $payload['website'] ?: null, $payload['cui'] ?: null, $payload['registration_number'] ?: null, $payload['vat_number'] ?: null, $payload['is_vat_payer'] ? 1 : 0, $payload['default_vat_rate'], $payload['address'] ?: null, $payload['address_line2'] ?: null, $payload['city'] ?: null, $payload['county'] ?: null, $payload['postal_code'] ?: null, $payload['country'] ?: 'România', $payload['default_currency'], $payload['payment_terms'] ?: null, $payload['notes'] ?: null, $payload['is_active'] ? 1 : 0, $id]);
        if ($stmt->rowCount() === 0) {
            $exists = $db->prepare('SELECT id FROM shop_suppliers WHERE id = ?');
            $exists->execute([$id]);
            if (!$exists->fetchColumn()) jsonResponse(['error' => 'Furnizorul nu exista.'], 404);
        }
        $stmt = $db->prepare('SELECT * FROM shop_suppliers WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(supplierRow($stmt->fetch()));
    }

    if ($action === 'deleteSupplier' && $method === 'DELETE') {
        shopNirRequire($currentUser, 'SUPPLIER_CREATE');
        $id = trim((string)($_GET['id'] ?? ($body['id'] ?? '')));
        $used = $db->prepare('SELECT (SELECT COUNT(*) FROM shop_nir_documents WHERE supplier_id = ?) + (SELECT COUNT(*) FROM shop_supplier_product_references WHERE supplier_id = ?)');
        $used->execute([$id, $id]);
        if ((int)$used->fetchColumn() > 0) {
            throw new ShopNirHttpException('Furnizorul are NIR-uri sau produse asociate și nu poate fi șters. Dezactivează-l pentru a păstra istoricul.', 409);
        }
        $stmt = $db->prepare('DELETE FROM shop_suppliers WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Furnizorul nu exista.'], 404);
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
} catch (ShopNirHttpException $error) {
    jsonResponse($error->payload, $error->status);
} catch (InvalidArgumentException $error) {
    jsonResponse(['error' => $error->getMessage()], 422);
} catch (Throwable $error) {
    error_log('[G-Trots SHOP API] ' . $error->getMessage());
    jsonResponse(['error' => 'SHOP API nu a putut procesa cererea. Verifica configuratia bazei de date.'], 500);
}
