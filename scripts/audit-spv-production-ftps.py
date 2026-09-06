from __future__ import annotations

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


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=60)
    ftp.connect(os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro"), int(os.environ.get("GT_FTP_PORT", "21")))
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    ftp.login(os.environ["GT_FTP_USER"], password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def main() -> None:
    token = secrets.token_urlsafe(32)
    filename = f"spv-production-audit-{secrets.token_hex(8)}.php"
    php = f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!hash_equals('{token}', (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
require_once __DIR__ . '/spv-runtime.php';
require_once __DIR__ . '/spv-service.php';
try {{
    $config = gtrotsSpvRuntimeConfig();
    $db = gtrotsSpvRuntimeDb($config);
    $before = GtrotsSpvService::status($db, $config);
    if (empty($before['connected'])) throw new RuntimeException('Conexiunea OAuth ANAF nu este activă.');
    $settings = is_array($before['settings'] ?? null) ? $before['settings'] : GtrotsSpvService::settings($db);
    $db->beginTransaction();
    try {{
        $settings['environment'] = 'production';
        GtrotsSpvService::updateSettings($db, $settings, 'Audit producție Codex', $config);
        $tested = GtrotsSpvService::testConnection($db, $config);
        $db->commit();
    }} catch (Throwable $error) {{
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }}
    $counts = $db->query("SELECT status, COUNT(*) AS total FROM shop_spv_outbox GROUP BY status")->fetchAll();
    echo json_encode([
        'ok' => true,
        'configured' => (bool)($tested['configured'] ?? false),
        'connected' => (bool)($tested['connected'] ?? false),
        'environment' => (string)($tested['environment'] ?? ''),
        'last_tested_at' => $tested['last_tested_at'] ?? null,
        'certificate_hint' => (string)($tested['certificate_hint'] ?? ''),
        'invoice_mode' => (string)($tested['settings']['invoice_mode'] ?? ''),
        'return_mode' => (string)($tested['settings']['return_mode'] ?? ''),
        'cron_key_configured' => trim((string)($config['spv_cron_key'] ?? '')) !== '',
        'outbox' => $counts,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}}
"""

    ftp = connect()
    try:
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")))
        url = f"https://g-trots.ro/shop-api/{filename}?" + urlencode({"token": token})
        request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots production audit"})
        with urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        if not payload.get("ok"):
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
