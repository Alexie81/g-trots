from __future__ import annotations

from ftplib import FTP_TLS
from io import BytesIO
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json
import os
import secrets
import ssl


REMOTE_ROOT = "/g-trots.ro/shop-api"
PUBLIC_BASE = "https://g-trots.ro/shop-api"


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    # Hostingul are un certificat FTPS emis pentru alt nume DNS. Conexiunea
    # ramane criptata, iar exceptia este limitata la hostul configurat explicit.
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=90)
    host = os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro")
    username = os.environ.get("GT_FTP_USER", "").strip()
    password = os.environ.get("GT_FTP_PASS", "")
    if not username or not password:
        raise RuntimeError("Lipsesc credentialele FTPS GT_FTP_USER/GT_FTP_PASS.")
    ftp.connect(host, int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.login(username, password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    ftp.voidcmd("TYPE I")
    return ftp


def reset_source(token: str) -> bytes:
    expected_token = json.dumps(token)
    return f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
$expectedToken = {expected_token};
if (!hash_equals($expectedToken, (string)($_GET['token'] ?? ''))) {{
    http_response_code(404);
    exit;
}}
$config = [
    'db_host' => 'localhost',
    'db_name' => 'cabitro_g-trots-shop',
    'db_user' => '',
    'db_pass' => '',
];
$sharedFile = dirname(__DIR__) . '/trotty-api/api_config.local.php';
if (is_file($sharedFile)) {{
    $shared = include $sharedFile;
    if (is_array($shared)) {{
        $config['db_host'] = (string)($shared['db_host'] ?? $config['db_host']);
        $config['db_user'] = (string)($shared['db_user'] ?? '');
        $config['db_pass'] = (string)($shared['db_pass'] ?? '');
    }}
}}
$localFile = __DIR__ . '/config.local.php';
if (is_file($localFile)) {{
    $local = include $localFile;
    if (is_array($local)) {{
        foreach (['db_host', 'db_name', 'db_user', 'db_pass'] as $key) {{
            if (array_key_exists($key, $local)) $config[$key] = (string)$local[$key];
        }}
    }}
}}
try {{
    if ($config['db_user'] === '' || $config['db_name'] === '') throw new RuntimeException('Configuratie DB incompleta.');
    $db = new PDO(
        'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
        $config['db_user'],
        $config['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    $db->beginTransaction();
    $before = $db->query('SELECT COUNT(*) AS products, COALESCE(SUM(view_count), 0) AS views, COUNT(CASE WHEN view_count <> 0 THEN 1 END) AS products_with_views FROM shop_products')->fetch();
    $affected = $db->exec('UPDATE shop_products SET view_count = 0 WHERE view_count <> 0');
    $after = $db->query('SELECT COUNT(*) AS products, COALESCE(SUM(view_count), 0) AS views, COUNT(CASE WHEN view_count <> 0 THEN 1 END) AS products_with_views FROM shop_products')->fetch();
    $db->commit();
    echo json_encode([
        'ok' => true,
        'products' => (int)$after['products'],
        'views_before' => (int)$before['views'],
        'products_reset' => (int)$affected,
        'views_after' => (int)$after['views'],
        'products_with_views_after' => (int)$after['products_with_views'],
    ], JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) $db->rollBack();
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'reset_failed']);
}}
""".encode("utf-8")


def main() -> None:
    token = secrets.token_urlsafe(40)
    script_name = f"maintenance-reset-product-views-{secrets.token_hex(8)}.php"
    ftp = connect()
    try:
        ftp.storbinary(f"STOR {script_name}", BytesIO(reset_source(token)), blocksize=262144)
        query = urlencode({"token": token})
        request = Request(
            f"{PUBLIC_BASE}/{script_name}?{query}",
            headers={"Accept": "application/json", "User-Agent": "G-Trots-maintenance/1.0"},
        )
        with urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if not isinstance(payload, dict) or not payload.get("ok"):
            raise RuntimeError("Resetarea vizualizarilor nu a fost confirmata de server.")
        if payload.get("views_after") != 0 or payload.get("products_with_views_after") != 0:
            raise RuntimeError("Verificarea de dupa resetare nu este zero.")
        print(json.dumps(payload, ensure_ascii=False), flush=True)
    finally:
        try:
            ftp.delete(script_name)
        except Exception:
            pass
        try:
            ftp.quit()
        except Exception:
            ftp.close()


if __name__ == "__main__":
    main()
