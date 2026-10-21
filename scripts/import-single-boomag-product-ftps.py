from __future__ import annotations

import argparse
import base64
from ftplib import FTP_TLS
from getpass import getpass
from io import BytesIO
import json
import os
from pathlib import Path
import secrets
import ssl
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError


REMOTE_ROOT = "/g-trots.ro/shop-api"
PUBLIC_ROOT = "https://g-trots.ro/shop-api"


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Importa un singur produs Boomag si publica continutul editorial G-Trots."
    )
    parser.add_argument("content", type=Path, help="Fisierul JSON cu produsul si continutul editorial.")
    return parser.parse_args()


def load_content(path: Path) -> dict[str, Any]:
    content = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(content, dict):
        raise ValueError("Fisierul trebuie sa contina un obiect JSON.")
    required = (
        "sku",
        "price",
        "name",
        "short_description",
        "description_title",
        "description_html",
        "meta_title",
        "meta_description",
        "specifications",
        "questions",
    )
    missing = [key for key in required if content.get(key) in (None, "", [])]
    if missing:
        raise ValueError("Lipsesc campurile: " + ", ".join(missing))
    if float(content["price"]) <= 0:
        raise ValueError("Pretul trebuie sa fie pozitiv.")
    if not isinstance(content["specifications"], list) or len(content["specifications"]) > 60:
        raise ValueError("Specificatiile trebuie sa fie o lista cu maximum 60 de randuri.")
    if not isinstance(content["questions"], list) or len(content["questions"]) > 30:
        raise ValueError("FAQ-ul trebuie sa fie o lista cu maximum 30 de randuri.")
    return content


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    host = os.environ.get("GT_FTP_HOST", "d108.dataserver.ro")
    username = os.environ.get("GT_FTP_USER", "")
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    if not username:
        raise RuntimeError("Lipseste utilizatorul FTPS (GT_FTP_USER).")
    ftp = FTP_TLS(context=context, timeout=90)
    ftp.connect(host, int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.host = os.environ.get("GT_FTP_TLS_SERVER_NAME", host)
    ftp.login(username, password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def request_json(url: str) -> dict[str, Any]:
    request = Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "G-Trots single Boomag importer"},
    )
    try:
        with urlopen(request, timeout=900) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = raw[:2000]
        raise RuntimeError(f"Serverul a raspuns cu HTTP {error.code}: {detail}") from error
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise RuntimeError("Serverul a trimis un raspuns neasteptat.")
    return value


def main() -> None:
    content = load_content(arguments().content)
    encoded = base64.b64encode(
        json.dumps(content, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    token = secrets.token_urlsafe(32)
    filename = f"import-single-boomag-{secrets.token_hex(8)}.php"
    php = f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!hash_equals('{token}', (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
define('GTROTS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';

try {{
    $payload = json_decode(base64_decode('{encoded}', true), true, 512, JSON_THROW_ON_ERROR);
    $config = shopConfig();
    $db = shopDb($config);
    ensureShopSchema($db);

    $sku = trim((string)$payload['sku']);
    $rows = boomagFeedRows($config, true, 60);
    $offset = null;
    $feedRow = null;
    foreach ($rows as $index => $row) {{
        if (mb_strtolower(trim((string)($row['sku'] ?? '')), 'UTF-8') === mb_strtolower($sku, 'UTF-8')) {{
            $offset = (int)$index;
            $feedRow = $row;
            break;
        }}
    }}
    if ($offset === null || !is_array($feedRow)) throw new RuntimeException('SKU-ul nu exista in feedul Boomag live.');

    $find = $db->prepare('SELECT p.* FROM shop_products p LEFT JOIN shop_product_sources s ON s.id = p.source_id WHERE p.sku = ? AND LOWER(COALESCE(s.domain, p.source_domain, "")) = "boomag.ro" LIMIT 1');
    $find->execute([$sku]);
    $before = $find->fetch() ?: null;

    $supplierPrice = boomagFeedPrice($feedRow);
    if ($supplierPrice === null || $supplierPrice <= 0) throw new RuntimeException('Pretul furnizorului lipseste din feed.');
    $available = boomagStockAvailable($feedRow['stock_status'] ?? '0');
    $stock = max(0, (int)floor((float)str_replace(',', '.', trim((string)($feedRow['stock'] ?? '0')))));
    if (!$available) $stock = 0;

    if (function_exists('gomagImportProductsBatch')) {{
        $import = gomagImportProductsBatch($db, $config, $offset, 1, false);
    }} else {{
        $import = ['success' => true, 'fallback' => true, 'created' => 0, 'updated' => 0, 'images_saved' => 0];
        if ($before === null) {{
            $source = $db->query('SELECT id FROM shop_product_sources WHERE LOWER(domain) = "boomag.ro" LIMIT 1')->fetchColumn();
            if (!$source) throw new RuntimeException('Sursa boomag.ro nu exista in catalog.');
            $categoryStmt = $db->prepare('SELECT id FROM shop_categories WHERE is_active = 1 AND (LOWER(name) = LOWER(?) OR LOWER(name) LIKE "%manet%") ORDER BY (LOWER(name) = LOWER(?)) DESC LIMIT 1');
            $categoryStmt->execute([(string)($feedRow['category_name'] ?? 'Manete acceleratie'), (string)($feedRow['category_name'] ?? 'Manete acceleratie')]);
            $categoryId = (string)($categoryStmt->fetchColumn() ?: '');
            if ($categoryId === '') throw new RuntimeException('Categoria pentru manete de acceleratie nu exista.');

            $manufacturerStmt = $db->prepare('SELECT id FROM shop_manufacturers WHERE LOWER(name) = LOWER(?) LIMIT 1');
            $manufacturerStmt->execute(['KuKirin']);
            $manufacturerId = (string)($manufacturerStmt->fetchColumn() ?: '');
            if ($manufacturerId === '') {{
                $manufacturerId = uuidV4();
                $db->prepare('INSERT INTO shop_manufacturers (id, name, slug, is_active) VALUES (?, "KuKirin", ?, 1)')
                    ->execute([$manufacturerId, uniqueSlug($db, 'shop_manufacturers', 'KuKirin')]);
            }}

            $productId = uuidV4();
            $initialSlug = uniqueSlug($db, 'shop_products', (string)$payload['name']);
            $insert = $db->prepare(
                'INSERT INTO shop_products
                 (id, category_id, manufacturer_id, source_id, supplier_external_id, sku, supplier_product_code, ean,
                  source_domain, source_url, name, slug, cost_price, price, supplier_base_price, supplier_price_difference,
                  supplier_price_updated_at, currency, stock_mode, stock_quantity, supplier_stock_quantity,
                  supplier_stock_status, supplier_stock_updated_at, accounting_stock_quantity, is_accounting_stock_tracked,
                  low_stock_threshold, is_active, is_featured, content_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, "boomag.ro", ?, ?, ?, 0, 0, ?, NULL, NOW(), "RON", "tracked", ?, ?, ?, NOW(), 0, 1, 3, 1, 0, "baseline")'
            );
            $insert->execute([
                $productId,
                $categoryId,
                $manufacturerId,
                (string)$source,
                trim((string)($feedRow['id'] ?? '')),
                $sku,
                $sku,
                trim((string)($feedRow['ean'] ?? '')) !== '' ? trim((string)$feedRow['ean']) : null,
                trim((string)($feedRow['url'] ?? '')),
                mb_substr(trim((string)$payload['name']), 0, 180),
                $initialSlug,
                $supplierPrice,
                $stock,
                $stock,
                $available ? 1 : 0,
            ]);
            $db->prepare('INSERT INTO shop_product_categories (product_id, category_id, is_primary) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1')
                ->execute([$productId, $categoryId]);

            $brandStmt = $db->prepare('SELECT id FROM shop_brands WHERE LOWER(name) = LOWER(?) LIMIT 1');
            $brandStmt->execute(['KuKirin']);
            $brandId = (string)($brandStmt->fetchColumn() ?: '');
            if ($brandId === '') {{
                $brandId = uuidV4();
                $db->prepare('INSERT INTO shop_brands (id, name, slug, is_active) VALUES (?, "KuKirin", ?, 1)')
                    ->execute([$brandId, uniqueSlug($db, 'shop_brands', 'KuKirin')]);
            }}
            $db->prepare('INSERT IGNORE INTO shop_product_brands (product_id, brand_id) VALUES (?, ?)')->execute([$productId, $brandId]);

            $downloadImage = static function (string $url, string $externalId, int $index): string {{
                if (function_exists('boomagDownloadProductImage')) return boomagDownloadProductImage($url, $externalId, $index);
                $context = stream_context_create(['http' => ['timeout' => 45, 'user_agent' => 'G-Trots-Shop/1.0']]);
                $raw = @file_get_contents($url, false, $context);
                if (!is_string($raw) || strlen($raw) < 500) return '';
                $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($raw);
                $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
                if (!isset($extensions[$mime])) return '';
                $directory = __DIR__ . '/uploads/products';
                if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) return '';
                $filename = md5($externalId . '|' . $index . '|' . $url) . '.' . $extensions[$mime];
                if (file_put_contents($directory . '/' . $filename, $raw, LOCK_EX) === false) return '';
                return 'uploads/products/' . $filename;
            }};
            $imageInsert = $db->prepare('INSERT INTO shop_product_images (id, product_id, image_path, alt_text, sort_order) VALUES (?, ?, ?, ?, ?)');
            foreach (['file', 'image2', 'image3', 'image4', 'image5'] as $imageIndex => $imageKey) {{
                $url = trim((string)($feedRow[$imageKey] ?? ''));
                if ($url === '') continue;
                $path = $downloadImage($url, trim((string)($feedRow['id'] ?? '')), $imageIndex);
                if ($path === '') continue;
                $imageInsert->execute([uuidV4(), $productId, $path, mb_substr(trim((string)$payload['name']), 0, 180), $imageIndex]);
                $import['images_saved']++;
            }}
            if ($import['images_saved'] < 1) throw new RuntimeException('Imaginile produsului nu au putut fi salvate.');
            if (function_exists('shopNirEnsureBoomagKidotoysReferences')) shopNirEnsureBoomagKidotoysReferences($db, $productId);
            $import['created'] = 1;
        }} else {{
            $import['updated'] = 1;
        }}
    }}
    $find->execute([$sku]);
    $product = $find->fetch();
    if (!$product) throw new RuntimeException('Produsul nu a fost creat de importator.');

    $productId = (string)$product['id'];
    $previousSlug = (string)($product['slug'] ?? '');
    $publicPrice = round((float)$payload['price'], 2);
    $difference = round($publicPrice - $supplierPrice, 2);
    $slug = uniqueSlug($db, 'shop_products', (string)$payload['name'], $productId);
    $specificationsJson = json_encode($payload['specifications'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $questionsJson = json_encode($payload['questions'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $sourcesJson = json_encode([
        ['name' => 'Feed Doctor Trotineta / Boomag', 'url' => (string)($feedRow['url'] ?? '')],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $wordCount = str_word_count(strip_tags((string)$payload['description_html']));

    $update = $db->prepare(
        'UPDATE shop_products SET
            name = ?, slug = ?, short_description = ?, description_title = ?, description_html = ?,
            specifications_json = ?, questions_json = ?, meta_title = ?, meta_description = ?,
            price = ?, sale_price = NULL, discount_value = NULL,
            supplier_base_price = ?, supplier_price_difference = ?, supplier_price_updated_at = NOW(),
            product_model = ?, product_identifier = ?, safety_warnings_ro = ?,
            content_status = "seo", seo_researched_at = NOW(), seo_word_count = ?, seo_sources_json = ?,
            is_active = 1
         WHERE id = ?'
    );
    $db->beginTransaction();
    try {{
        $update->execute([
            mb_substr(trim((string)$payload['name']), 0, 180),
            $slug,
            mb_substr(trim((string)$payload['short_description']), 0, 2000),
            mb_substr(trim((string)$payload['description_title']), 0, 220),
            (string)$payload['description_html'],
            $specificationsJson,
            $questionsJson,
            mb_substr(trim((string)$payload['meta_title']), 0, 160),
            mb_substr(trim((string)$payload['meta_description']), 0, 500),
            $publicPrice,
            $supplierPrice,
            $difference,
            mb_substr(trim((string)($payload['product_model'] ?? '')), 0, 180),
            mb_substr(trim((string)($payload['product_identifier'] ?? $sku)), 0, 180),
            mb_substr(trim((string)($payload['safety_warnings_ro'] ?? '')), 0, 10000),
            $wordCount,
            $sourcesJson,
            $productId,
        ]);
        $db->commit();
    }} catch (Throwable $error) {{
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }}

    $stripe = stripeSyncProductSafe($db, $config, $productId);
    $merchant = merchantSyncProductSafe($db, $config, $productId);
    $shopify = shopifySyncProductSafe($db, $config, $productId);
    $seo = shopProductSeoSync($db, $config, $productId, $previousSlug, false, true);
    $sitemap = shopProductSeoRebuildSitemap($db, $config);

    $check = $db->prepare(
        'SELECT p.id, p.sku, p.name, p.slug, p.price, p.supplier_base_price,
                p.supplier_price_difference, p.stock_quantity, p.supplier_stock_quantity,
                p.is_active, p.content_status, c.name AS category_name, m.name AS manufacturer_name,
                (SELECT COUNT(*) FROM shop_product_images i WHERE i.product_id = p.id) AS images
         FROM shop_products p
         LEFT JOIN shop_categories c ON c.id = p.category_id
         LEFT JOIN shop_manufacturers m ON m.id = p.manufacturer_id
         WHERE p.id = ?'
    );
    $check->execute([$productId]);
    $saved = $check->fetch();
    echo json_encode([
        'ok' => true,
        'created' => $before === null,
        'feed_offset' => $offset,
        'feed_total' => count($rows),
        'import' => $import,
        'product' => $saved,
        'url' => 'https://g-trots.ro/magazin/produs/' . rawurlencode((string)$saved['slug']) . '/',
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
