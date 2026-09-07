from __future__ import annotations

from ftplib import FTP_TLS
from io import BytesIO
import json
import os
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
    ftp.login(os.environ["GT_FTP_USER"], os.environ["GT_FTP_PASS"])
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def request_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots product page sync"})
    with urlopen(request, timeout=180) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    token = secrets.token_urlsafe(32)
    filename = f"product-pages-sync-{secrets.token_hex(8)}.php"
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
    $cursor = trim((string)($_GET['cursor'] ?? ''));
    echo json_encode(shopProductSeoSyncCatalogBatch($db, $config, $cursor, 100), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}}
"""

    ftp = connect()
    try:
        for remote_name in ftp.nlst():
            if remote_name.startswith("product-pages-sync-") and remote_name.endswith(".php"):
                ftp.delete(remote_name)
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")), blocksize=262144)
        cursor = ""
        total_processed = 0
        total_generated = 0
        total_failed = 0
        batches = 0
        while True:
            query = urlencode({"token": token, "cursor": cursor})
            result = request_json(f"{PUBLIC_ROOT}/{filename}?{query}")
            batches += 1
            total_processed += int(result.get("processed") or 0)
            total_generated += int(result.get("generated") or 0)
            total_failed += int(result.get("failed") or 0)
            cursor = str(result.get("cursor") or cursor)
            print(json.dumps({
                "batch": batches,
                "processed": total_processed,
                "generated": total_generated,
                "failed": total_failed,
                "has_more": bool(result.get("has_more")),
            }), flush=True)
            if not result.get("has_more"):
                break
        if total_failed:
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
