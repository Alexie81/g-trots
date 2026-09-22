from __future__ import annotations

import argparse
from ftplib import FTP_TLS
from getpass import getpass
from io import BytesIO
import json
import os
import secrets
import ssl
from urllib.parse import urlencode
from urllib.request import Request, urlopen


REMOTE_ROOT = "/g-trots.ro/shop-api"
PUBLIC_ROOT = "https://g-trots.ro/shop-api"


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Configureaza comercial un singur produs Boomag si il resincronizeaza.")
    parser.add_argument("--sku", required=True)
    parser.add_argument("--price", required=True, type=float)
    parser.add_argument("--category", required=True)
    parser.add_argument("--previous-slug", default="")
    parser.add_argument("--extra-image-url", default="")
    parser.add_argument("--extra-image-alt", default="")
    return parser.parse_args()


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    ftp = FTP_TLS(context=context, timeout=90)
    host = os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro")
    username = os.environ.get("GT_FTP_USER", "")
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    if not username:
        raise RuntimeError("Lipsește utilizatorul FTPS (GT_FTP_USER).")
    ftp.connect(host, int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.host = os.environ.get("GT_FTP_TLS_SERVER_NAME", host)
    ftp.login(username, password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def php_quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def request_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots product configurator"})
    with urlopen(request, timeout=300) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def main() -> None:
    options = arguments()
    if options.price <= 0:
        raise ValueError("Pretul trebuie sa fie mai mare decat zero.")
    sku = php_quote(options.sku.strip())
    category = php_quote(options.category.strip())
    extra_image_url = php_quote(options.extra_image_url.strip())
    extra_image_alt = php_quote(options.extra_image_alt.strip())
    previous_slug = php_quote(options.previous_slug.strip())
    token = secrets.token_urlsafe(32)
    filename = f"configure-boomag-product-{secrets.token_hex(8)}.php"
    php = f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!hash_equals('{token}', (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
define('GTROTS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';
try {{
    $config = shopConfig();
    $db = shopDb($config);
    ensureShopSchema($db);
    $find = $db->prepare('SELECT p.* FROM shop_products p LEFT JOIN shop_product_sources s ON s.id = p.source_id WHERE p.sku = ? AND LOWER(COALESCE(s.domain, p.source_domain, "")) = "boomag.ro" LIMIT 1');
    $find->execute(['{sku}']);
    $product = $find->fetch();
    if (!$product) throw new RuntimeException('Produsul Boomag nu a fost gasit.');
    $categoryStmt = $db->prepare('SELECT id, name FROM shop_categories WHERE LOWER(name) = LOWER(?) AND is_active = 1 LIMIT 1');
    $categoryStmt->execute(['{category}']);
    $targetCategory = $categoryStmt->fetch();
    if (!$targetCategory) throw new RuntimeException('Categoria solicitata nu exista sau este inactiva.');
    $publicPrice = round({options.price:.2f}, 2);
    $supplierPrice = round((float)($product['supplier_base_price'] ?? 0), 2);
    if ($supplierPrice <= 0) throw new RuntimeException('Pretul Boomag lipseste; marja fixa nu poate fi calculata.');
    $difference = round($publicPrice - $supplierPrice, 2);
    $db->beginTransaction();
    try {{
        $db->prepare('UPDATE shop_products SET price = ?, supplier_price_difference = ?, category_id = ?, stock_mode = "tracked", is_accounting_stock_tracked = 1, is_active = 1 WHERE id = ?')
            ->execute([$publicPrice, $difference, (string)$targetCategory['id'], (string)$product['id']]);
        syncProductCategories($db, (string)$product['id'], [(string)$targetCategory['id']], (string)$targetCategory['id']);
        $db->commit();
    }} catch (Throwable $error) {{
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }}
    $extraImage = null;
    if ('{extra_image_url}' !== '') {{
        $path = boomagDownloadProductImage('{extra_image_url}', (string)$product['supplier_external_id'], 5);
        if ($path === '') throw new RuntimeException('Imaginea suplimentara nu a putut fi salvata.');
        $imageId = gomagStableUuid('product-image', (string)$product['supplier_external_id'] . '|5|{extra_image_url}');
        $db->prepare('INSERT INTO shop_product_images (id, product_id, image_path, alt_text, sort_order) VALUES (?, ?, ?, ?, 5) ON DUPLICATE KEY UPDATE image_path = VALUES(image_path), alt_text = VALUES(alt_text), sort_order = VALUES(sort_order)')
            ->execute([$imageId, (string)$product['id'], $path, mb_substr('{extra_image_alt}' !== '' ? '{extra_image_alt}' : (string)$product['name'], 0, 180)]);
        $extraImage = $path;
    }}
    $stripe = stripeSyncProductSafe($db, $config, (string)$product['id']);
    $merchant = merchantSyncProductSafe($db, $config, (string)$product['id']);
    $shopify = shopifySyncProductSafe($db, $config, (string)$product['id']);
    $seo = shopProductSeoSync($db, $config, (string)$product['id'], '{previous_slug}' !== '' ? '{previous_slug}' : (string)($product['slug'] ?? ''), false);
    $sitemap = shopProductSeoRebuildSitemap($db, $config);
    $check = $db->prepare('SELECT id, sku, name, slug, price, supplier_base_price, supplier_price_difference, stock_mode, is_accounting_stock_tracked, stock_quantity, accounting_stock_quantity, category_id FROM shop_products WHERE id = ?');
    $check->execute([(string)$product['id']]);
    $saved = $check->fetch();
    $imageCountStmt = $db->prepare('SELECT COUNT(*) FROM shop_product_images WHERE product_id = ?');
    $imageCountStmt->execute([(string)$product['id']]);
    echo json_encode([
        'ok' => true,
        'product' => $saved,
        'category' => $targetCategory,
        'images' => (int)$imageCountStmt->fetchColumn(),
        'extra_image' => $extraImage,
        'stripe' => $stripe,
        'merchant' => $merchant,
        'shopify' => $shopify,
        'seo' => $seo,
        'sitemap_products' => (int)($sitemap['products'] ?? 0),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}}
"""

    ftp = connect()
    try:
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")), blocksize=262144)
        result = request_json(f"{PUBLIC_ROOT}/{filename}?{urlencode({'token': token})}")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get("ok"):
            raise SystemExit(1)
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
