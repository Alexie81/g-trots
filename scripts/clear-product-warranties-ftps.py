from __future__ import annotations

from ftplib import FTP_TLS
from getpass import getpass
from io import BytesIO
import argparse
import json
import os
import secrets
import ssl
from urllib.parse import urlencode
from urllib.request import Request, urlopen


REMOTE_ROOT = "/g-trots.ro/shop-api"
PUBLIC_ROOT = "https://g-trots.ro/shop-api"


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Auditează sau golește garanțiile configurate pe toate produsele.")
    parser.add_argument("--apply", action="store_true", help="Salvează NULL pentru garanția legală și comercială la toate produsele.")
    return parser.parse_args()


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    ftp = FTP_TLS(context=context, timeout=120)
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


def request_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots product warranty cleanup"})
    with urlopen(request, timeout=180) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def main() -> None:
    options = arguments()
    token = secrets.token_urlsafe(32)
    filename = f"product-warranty-cleanup-{secrets.token_hex(8)}.php"
    apply = "true" if options.apply else "false"
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
    $summary = static function(PDO $db): array {{
        $row = $db->query('SELECT COUNT(*) AS products, SUM(CASE WHEN legal_warranty_months IS NOT NULL THEN 1 ELSE 0 END) AS legal_set, SUM(CASE WHEN commercial_warranty_months IS NOT NULL THEN 1 ELSE 0 END) AS commercial_set, SUM(CASE WHEN COALESCE(legal_warranty_months, 0) > 0 OR COALESCE(commercial_warranty_months, 0) > 0 THEN 1 ELSE 0 END) AS displayed FROM shop_products')->fetch();
        return [
            'products' => (int)($row['products'] ?? 0),
            'legal_set' => (int)($row['legal_set'] ?? 0),
            'commercial_set' => (int)($row['commercial_set'] ?? 0),
            'displayed' => (int)($row['displayed'] ?? 0),
        ];
    }};
    $before = $summary($db);
    $changed = 0;
    if ({apply}) {{
        $db->beginTransaction();
        try {{
            $changed = $db->exec('UPDATE shop_products SET legal_warranty_months = NULL, commercial_warranty_months = NULL WHERE legal_warranty_months IS NOT NULL OR commercial_warranty_months IS NOT NULL');
            $db->commit();
        }} catch (Throwable $error) {{
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }}
    }}
    $after = $summary($db);
    if ({apply} && ($after['legal_set'] !== 0 || $after['commercial_set'] !== 0 || $after['displayed'] !== 0)) {{
        throw new RuntimeException('Verificarea finală arată garanții rămase în catalog.');
    }}
    echo json_encode(['ok' => true, 'applied' => {apply}, 'changed' => $changed, 'before' => $before, 'after' => $after], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
