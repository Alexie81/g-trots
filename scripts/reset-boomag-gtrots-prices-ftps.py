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
    parser = argparse.ArgumentParser(description="Reseteaza controlat pretul G-Trots pentru produsele Boomag.")
    parser.add_argument("--apply", action="store_true", help="Salveaza backupul si seteaza pretul G-Trots la 0.")
    return parser.parse_args()


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
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots Boomag pricing reset"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    options = arguments()
    token = secrets.token_urlsafe(32)
    run_id = "boomag-zero-" + secrets.token_hex(8)
    filename = f"boomag-pricing-reset-{secrets.token_hex(8)}.php"
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
    $where = '(p.source_id = (SELECT id FROM shop_product_sources WHERE LOWER(domain) = "boomag.ro" LIMIT 1) OR LOWER(p.source_domain) = "boomag.ro")';
    $statsSql = 'SELECT COUNT(*) AS total,
        SUM(CASE WHEN p.price > 0 THEN 1 ELSE 0 END) AS gtrots_price_set,
        SUM(CASE WHEN p.price <= 0 THEN 1 ELSE 0 END) AS gtrots_price_unset,
        SUM(CASE WHEN p.supplier_price_difference IS NOT NULL THEN 1 ELSE 0 END) AS margins_set,
        SUM(CASE WHEN p.supplier_base_price > 0 THEN 1 ELSE 0 END) AS supplier_prices,
        SUM(CASE WHEN p.discount_value IS NOT NULL AND p.discount_value > 0 THEN 1 ELSE 0 END) AS product_discounts,
        SUM(CASE WHEN p.price > 0 AND p.supplier_base_price > 0 AND ABS(p.price - p.supplier_base_price) >= 0.005 THEN 1 ELSE 0 END) AS public_price_changes
        FROM shop_products p WHERE ' . $where;
    $before = $db->query($statsSql)->fetch();
    $mode = (string)($_GET['mode'] ?? 'stats');
    if ($mode === 'apply') {{
        $db->exec('CREATE TABLE IF NOT EXISTS shop_boomag_price_reset_backups (
            run_id VARCHAR(80) NOT NULL,
            product_id CHAR(36) NOT NULL,
            price DECIMAL(12,2) NOT NULL,
            sale_price DECIMAL(12,2) NULL,
            discount_type VARCHAR(20) NULL,
            discount_value DECIMAL(12,2) NULL,
            supplier_base_price DECIMAL(12,2) NULL,
            supplier_price_difference DECIMAL(12,2) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (run_id, product_id),
            INDEX idx_boomag_price_backup_product (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $db->beginTransaction();
        try {{
            $backup = $db->prepare('INSERT INTO shop_boomag_price_reset_backups
                (run_id, product_id, price, sale_price, discount_type, discount_value, supplier_base_price, supplier_price_difference)
                SELECT ?, p.id, p.price, p.sale_price, p.discount_type, p.discount_value, p.supplier_base_price, p.supplier_price_difference
                FROM shop_products p WHERE ' . $where);
            $backup->execute(['{run_id}']);
            $updated = $db->exec('UPDATE shop_products p SET p.price = 0, p.supplier_price_difference = NULL, p.updated_at = p.updated_at WHERE ' . $where);
            $db->commit();
        }} catch (Throwable $error) {{
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }}
        $after = $db->query($statsSql)->fetch();
        echo json_encode(['ok' => true, 'run_id' => '{run_id}', 'backup_rows' => $backup->rowCount(), 'updated_rows' => $updated, 'before' => $before, 'after' => $after], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }}
    $samples = $db->query('SELECT p.id, p.sku, p.price, p.supplier_base_price, p.supplier_price_difference, p.sale_price, p.discount_value FROM shop_products p WHERE ' . $where . ' AND (p.price > 0 OR p.supplier_price_difference IS NOT NULL) ORDER BY p.updated_at DESC LIMIT 10')->fetchAll();
    echo json_encode(['ok' => true, 'before' => $before, 'samples' => $samples], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}}
"""

    ftp = connect()
    try:
        for remote_name in ftp.nlst():
            if re.fullmatch(r"boomag-pricing-reset-[0-9a-f]{16}\.php", remote_name):
                ftp.delete(remote_name)
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")), blocksize=262144)
        base = f"{PUBLIC_ROOT}/{filename}?" + urlencode({"token": token})
        mode = "apply" if options.apply else "stats"
        print(json.dumps(request_json(base + "&" + urlencode({"mode": mode})), ensure_ascii=False, indent=2), flush=True)
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
