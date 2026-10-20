from __future__ import annotations

from ftplib import FTP_TLS
from getpass import getpass
from io import BytesIO
import argparse
import json
import os
import re
import secrets
import ssl
from urllib.parse import urlencode
from urllib.request import Request, urlopen


REMOTE_ROOT = "/g-trots.ro/shop-api"
PUBLIC_ROOT = "https://g-trots.ro/shop-api"


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ridica exclusiv preturile publice aflate sub pretul Boomag live."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Salveaza backupul si aplica plafonul minim Boomag produselor identificate.",
    )
    return parser.parse_args()


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    host = os.environ.get("GT_FTP_HOST", "d108.dataserver.ro")
    ftp = FTP_TLS(context=context, timeout=90)
    ftp.connect(host, int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.host = os.environ.get("GT_FTP_TLS_SERVER_NAME", host)
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    ftp.login(os.environ["GT_FTP_USER"], password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def request_json(url: str, timeout: int = 600) -> dict:
    request = Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "G-Trots Boomag price floor"},
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    options = arguments()
    token = secrets.token_urlsafe(32)
    run_id = "boomag-floor-" + secrets.token_hex(8)
    filename = f"boomag-price-floor-{secrets.token_hex(8)}.php"
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
    $feedRows = boomagFeedRows($config, true, 60);
    $feedByExternalId = [];
    $feedByCode = [];
    foreach ($feedRows as $feedRow) {{
        $externalId = trim((string)($feedRow['id'] ?? ''));
        if ($externalId !== '') $feedByExternalId[$externalId] = $feedRow;
        foreach ([$feedRow['sku'] ?? ''] as $rawCode) {{
            $code = mb_strtolower(trim((string)$rawCode), 'UTF-8');
            if ($code !== '') $feedByCode[$code] = $feedRow;
        }}
    }}

    $products = $db->query(
        'SELECT p.* FROM shop_products p
         LEFT JOIN shop_product_sources s ON s.id = p.source_id
         WHERE LOWER(COALESCE(s.domain, p.source_domain, "")) = "boomag.ro"
         ORDER BY p.name ASC, p.id ASC'
    )->fetchAll();

    $targets = [];
    $missing = [];
    $matched = 0;
    $equal = 0;
    $above = 0;
    foreach ($products as $product) {{
        $feedRow = null;
        $externalId = trim((string)($product['supplier_external_id'] ?? ''));
        if ($externalId !== '' && isset($feedByExternalId[$externalId])) {{
            $feedRow = $feedByExternalId[$externalId];
        }} else {{
            foreach ([$product['sku'] ?? '', $product['supplier_product_code'] ?? ''] as $rawCode) {{
                $code = mb_strtolower(trim((string)$rawCode), 'UTF-8');
                if ($code !== '' && isset($feedByCode[$code])) {{ $feedRow = $feedByCode[$code]; break; }}
            }}
        }}
        if (!is_array($feedRow)) {{
            $missing[] = ['id' => (string)$product['id'], 'sku' => (string)($product['sku'] ?? ''), 'name' => (string)$product['name']];
            continue;
        }}
        $supplierPrice = boomagFeedPrice($feedRow);
        if ($supplierPrice === null || $supplierPrice <= 0) continue;
        $matched++;
        $storedPrice = round((float)($product['price'] ?? 0), 2);
        $storedSupplier = round((float)($product['supplier_base_price'] ?? 0), 2);
        $basePrice = $storedPrice > 0 ? $storedPrice : $storedSupplier;
        $salePrice = round((float)($product['sale_price'] ?? 0), 2);
        $effectivePrice = $salePrice > 0 ? $salePrice : $basePrice;
        $baseBelow = $basePrice + 0.005 < $supplierPrice;
        $saleBelow = $salePrice > 0 && $salePrice + 0.005 < $supplierPrice;
        if ($baseBelow || $saleBelow) {{
            $targets[] = [
                'id' => (string)$product['id'],
                'sku' => (string)($product['sku'] ?? ''),
                'name' => (string)$product['name'],
                'old_price' => $storedPrice,
                'old_public_base' => $basePrice,
                'old_sale_price' => $salePrice > 0 ? $salePrice : null,
                'old_effective_price' => $effectivePrice,
                'boomag_price' => round($supplierPrice, 2),
                'remove_sale_price' => $saleBelow,
            ];
        }} elseif (abs($effectivePrice - $supplierPrice) < 0.005) {{
            $equal++;
        }} else {{
            $above++;
        }}
    }}

    $mode = (string)($_GET['mode'] ?? 'audit');
    if ($mode === 'apply' && $targets !== []) {{
        $db->exec('CREATE TABLE IF NOT EXISTS shop_boomag_price_floor_backups (
            run_id VARCHAR(80) NOT NULL,
            product_id CHAR(36) NOT NULL,
            price DECIMAL(12,2) NOT NULL,
            sale_price DECIMAL(12,2) NULL,
            discount_type VARCHAR(20) NULL,
            discount_value DECIMAL(12,2) NULL,
            supplier_base_price DECIMAL(12,2) NULL,
            supplier_price_difference DECIMAL(12,2) NULL,
            boomag_live_price DECIMAL(12,2) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (run_id, product_id),
            INDEX idx_boomag_floor_backup_product (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $backup = $db->prepare('INSERT INTO shop_boomag_price_floor_backups
            (run_id, product_id, price, sale_price, discount_type, discount_value, supplier_base_price, supplier_price_difference, boomag_live_price)
            SELECT ?, id, price, sale_price, discount_type, discount_value, supplier_base_price, supplier_price_difference, ?
            FROM shop_products WHERE id = ?');
        $updateWithSaleRemoval = $db->prepare(
            'UPDATE shop_products SET price = ?, sale_price = NULL, discount_value = NULL,
             supplier_base_price = ?, supplier_price_difference = 0, supplier_price_updated_at = NOW(),
             updated_at = updated_at WHERE id = ?'
        );
        $updateBaseOnly = $db->prepare(
            'UPDATE shop_products SET price = ?, supplier_base_price = ?, supplier_price_difference = 0,
             supplier_price_updated_at = NOW(), updated_at = updated_at WHERE id = ?'
        );
        $db->beginTransaction();
        try {{
            foreach ($targets as $target) {{
                $backup->execute(['{run_id}', $target['boomag_price'], $target['id']]);
                if ($target['remove_sale_price']) {{
                    $updateWithSaleRemoval->execute([$target['boomag_price'], $target['boomag_price'], $target['id']]);
                }} else {{
                    $updateBaseOnly->execute([$target['boomag_price'], $target['boomag_price'], $target['id']]);
                }}
            }}
            $db->commit();
        }} catch (Throwable $error) {{
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }}
    }}

    $verificationBelow = [];
    if ($mode === 'apply') {{
        $verify = $db->prepare('SELECT price, sale_price FROM shop_products WHERE id = ?');
        foreach ($targets as $target) {{
            $verify->execute([$target['id']]);
            $saved = $verify->fetch() ?: [];
            $savedBase = round((float)($saved['price'] ?? 0), 2);
            $savedSale = round((float)($saved['sale_price'] ?? 0), 2);
            $savedEffective = $savedSale > 0 ? $savedSale : $savedBase;
            if ($savedBase + 0.005 < (float)$target['boomag_price'] || $savedEffective + 0.005 < (float)$target['boomag_price']) {{
                $verificationBelow[] = ['id' => $target['id'], 'price' => $savedBase, 'sale_price' => $savedSale, 'boomag_price' => $target['boomag_price']];
            }}
        }}
    }}

    echo json_encode([
        'ok' => true,
        'mode' => $mode,
        'run_id' => $mode === 'apply' ? '{run_id}' : null,
        'feed_rows' => count($feedRows),
        'boomag_products' => count($products),
        'matched_products' => $matched,
        'below_boomag' => count($targets),
        'equal_to_boomag' => $equal,
        'above_boomag' => $above,
        'missing_from_feed' => count($missing),
        'missing_samples' => array_slice($missing, 0, 20),
        'target_samples' => array_slice($targets, 0, 100),
        'applied' => $mode === 'apply' ? count($targets) : 0,
        'verification_below' => $verificationBelow,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}}
"""

    ftp = connect()
    try:
        for remote_name in ftp.nlst():
            if re.fullmatch(r"boomag-price-floor-[0-9a-f]{16}\.php", remote_name):
                ftp.delete(remote_name)
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")), blocksize=262144)
        base = f"{PUBLIC_ROOT}/{filename}?" + urlencode({"token": token})
        mode = "apply" if options.apply else "audit"
        print(
            json.dumps(request_json(base + "&" + urlencode({"mode": mode})), ensure_ascii=False, indent=2),
            flush=True,
        )
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
