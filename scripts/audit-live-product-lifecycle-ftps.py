from __future__ import annotations

from ftplib import FTP_TLS
from getpass import getpass
from io import BytesIO
import json
import os
import re
import secrets
import ssl
from urllib.parse import urlencode
from urllib.request import Request, urlopen


REMOTE_ROOT = "/g-trots.ro/shop-api"
PUBLIC_ROOT = "https://g-trots.ro/shop-api"


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=90)
    ftp.connect(os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro"), int(os.environ.get("GT_FTP_PORT", "21")))
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    ftp.login(os.environ["GT_FTP_USER"], password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def request_json(url: str, timeout: int = 180) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots lifecycle audit"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    token = secrets.token_urlsafe(32)
    filename = f"product-lifecycle-audit-{secrets.token_hex(8)}.php"
    php = f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!hash_equals('{token}', (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
define('GTROTS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';
require_once __DIR__ . '/merchant.php';
require_once __DIR__ . '/stripe.php';
require_once __DIR__ . '/shopify.php';

try {{
    $config = shopConfig();
    $db = shopDb($config);
    $aggregate = static function (PDO $db, string $sql): array {{
        $row = $db->query($sql)->fetch();
        return is_array($row) ? $row : [];
    }};

    $products = $aggregate($db, 'SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN LOWER(COALESCE(p.source_domain, "")) = "boomag.ro" THEN 1 ELSE 0 END) AS boomag,
        SUM(CASE WHEN LOWER(COALESCE(p.source_domain, "")) <> "boomag.ro" THEN 1 ELSE 0 END) AS non_boomag,
        SUM(CASE WHEN p.stock_mode = "unlimited" AND p.is_active = 1 THEN 1 ELSE 0 END) AS active_unlimited,
        SUM(CASE WHEN p.stock_mode = "tracked" AND p.stock_quantity > 0 AND p.is_accounting_stock_tracked = 0 AND p.is_active = 1 THEN 1 ELSE 0 END) AS active_online_only_in_stock,
        SUM(CASE WHEN p.stock_mode = "tracked" AND p.stock_quantity > 0 AND p.accounting_stock_quantity <= 0 AND p.is_accounting_stock_tracked = 0 AND p.is_active = 1 THEN 1 ELSE 0 END) AS active_online_without_accounting_stock,
        SUM(CASE WHEN p.price <= 0 AND p.supplier_base_price > 0 THEN 1 ELSE 0 END) AS supplier_price_fallback,
        SUM(CASE WHEN p.price > 0 AND p.supplier_base_price > 0 AND p.supplier_price_difference IS NOT NULL THEN 1 ELSE 0 END) AS fixed_margin
        FROM shop_products p');

    $channels = $aggregate($db, 'SELECT
        SUM(CASE WHEN p.stripe_product_id IS NOT NULL AND p.stripe_sync_error IS NULL THEN 1 ELSE 0 END) AS stripe_linked,
        SUM(CASE WHEN p.stripe_sync_error IS NOT NULL THEN 1 ELSE 0 END) AS stripe_errors,
        SUM(CASE WHEN p.merchant_synced_at IS NOT NULL AND p.merchant_sync_error IS NULL THEN 1 ELSE 0 END) AS merchant_synced,
        SUM(CASE WHEN p.merchant_sync_error IS NOT NULL THEN 1 ELSE 0 END) AS merchant_errors,
        SUM(CASE WHEN p.shopify_product_id IS NOT NULL AND p.shopify_sync_error IS NULL THEN 1 ELSE 0 END) AS shopify_linked,
        SUM(CASE WHEN p.shopify_sync_error IS NOT NULL THEN 1 ELSE 0 END) AS shopify_errors
        FROM shop_products p');

    $invoiceAutomation = GtrotsInvoiceAutomation::settings($db);
    $testOrders = $db->query('SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.status, o.payment_status, o.payment_method, o.subtotal, o.shipping_cost, o.total,
        o.created_at, o.cancellation_invoice_action,
        (SELECT COUNT(*) FROM shop_invoices i WHERE i.order_id = o.id) AS invoices
        FROM shop_orders o
        WHERE UPPER(o.customer_name) LIKE "TEST%ANALYTICS G-TROTS"
        ORDER BY o.created_at DESC LIMIT 10')->fetchAll();

    $testOrderRelations = [];
    if ($testOrders !== []) {{
        $orderIds = array_values(array_map(static fn(array $row): string => (string)$row['id'], $testOrders));
        $quotedIds = implode(',', array_map(static fn(string $id): string => $db->quote($id), $orderIds));
        $relationTables = $db->query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'order_id' ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($relationTables as $tableName) {{
            if (!preg_match('/^[a-zA-Z0-9_]+$/', (string)$tableName)) continue;
            $count = (int)$db->query('SELECT COUNT(*) FROM `' . $tableName . '` WHERE order_id IN (' . $quotedIds . ')')->fetchColumn();
            if ($count > 0) $testOrderRelations[(string)$tableName] = $count;
        }}
    }}

    $secondHand = $aggregate($db, 'SELECT
        c.id, c.name, c.slug, c.system_key, c.is_active AS category_active,
        COUNT(p.id) AS products,
        SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END) AS active_products,
        SUM(CASE WHEN p.is_active = 1 AND (p.stock_mode = "unlimited" OR p.stock_quantity > 0) AND (p.price > 0 OR p.supplier_base_price > 0) THEN 1 ELSE 0 END) AS purchasable_products
        FROM shop_categories c
        LEFT JOIN shop_products p ON p.category_id = c.id
        WHERE c.system_key = "second_hand_scooters"
        GROUP BY c.id, c.name, c.slug, c.system_key, c.is_active');

    $defaultSource = $db->query('SELECT id, name, domain, is_default, is_active FROM shop_product_sources WHERE is_default = 1 AND is_active = 1 ORDER BY sort_order ASC, created_at ASC LIMIT 1')->fetch();
    $sample = $db->query('SELECT p.id, p.sku, p.slug, p.price AS gtrots_price, p.supplier_base_price, p.supplier_price_difference,
        p.stock_mode, p.stock_quantity, p.accounting_stock_quantity, p.is_accounting_stock_tracked, p.is_active,
        c.system_key AS category_system_key
        FROM shop_products p LEFT JOIN shop_categories c ON c.id = p.category_id
        WHERE UPPER(p.sku) = "SE-CMM087" LIMIT 1')->fetch();

    $pageRoot = dirname(__DIR__) . '/magazin/produs';
    $pageRows = $db->query('SELECT slug, is_active FROM shop_products WHERE slug IS NOT NULL AND slug <> ""')->fetchAll();
    $pageAudit = ['expected_active' => 0, 'present_active' => 0, 'missing_active' => 0, 'present_inactive' => 0];
    $missingSamples = [];
    foreach ($pageRows as $row) {{
        $slug = trim((string)$row['slug']);
        $present = is_file($pageRoot . '/' . $slug . '/index.html');
        if ((bool)$row['is_active']) {{
            $pageAudit['expected_active']++;
            if ($present) $pageAudit['present_active']++;
            else {{
                $pageAudit['missing_active']++;
                if (count($missingSamples) < 10) $missingSamples[] = $slug;
            }}
        }} elseif ($present) {{
            $pageAudit['present_inactive']++;
        }}
    }}
    $pageAudit['missing_samples'] = $missingSamples;

    echo json_encode([
        'ok' => true,
        'products' => $products,
        'channels' => $channels,
        'configuration' => [
            'stripe_configured' => stripeIsConfigured($config),
            'stripe_test_mode' => stripeIsTestMode($config),
            'merchant_sync_enabled' => merchantSyncIsEnabled($config),
            'shopify_sync_enabled' => shopifySyncIsEnabled($config),
        ],
        'invoice_automation' => $invoiceAutomation,
        'analytics_test_orders' => $testOrders,
        'analytics_test_order_relations' => $testOrderRelations,
        'second_hand' => $secondHand,
        'default_manual_source' => is_array($defaultSource) ? $defaultSource : null,
        'sample_se_cmm087' => is_array($sample) ? $sample : null,
        'product_pages' => $pageAudit,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}}
"""

    ftp = connect()
    try:
        for remote_name in ftp.nlst():
            if re.fullmatch(r"product-lifecycle-audit-[0-9a-f]{{16}}\.php", remote_name):
                ftp.delete(remote_name)
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")), blocksize=262144)
        url = f"{PUBLIC_ROOT}/{filename}?" + urlencode({"token": token})
        print(json.dumps(request_json(url), ensure_ascii=False, indent=2), flush=True)
    finally:
        try:
            ftp.delete(filename)
        finally:
            try:
                ftp.quit()
            except Exception:
                ftp.close()


if __name__ == "__main__":
    main()
