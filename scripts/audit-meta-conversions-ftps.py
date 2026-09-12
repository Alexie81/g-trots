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
PUBLIC_ROOT = "https://g-trots.ro/shop-api"


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=60)
    ftp.connect(os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro"), int(os.environ.get("GT_FTP_PORT", "21")))
    username = os.environ.get("GT_FTP_USER", "").strip()
    if not username:
        raise RuntimeError("Lipsește utilizatorul FTPS (GT_FTP_USER).")
    ftp.login(username, os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: "))
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def request_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots Meta audit"})
    with urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    token = secrets.token_urlsafe(32)
    filename = f"meta-audit-{secrets.token_hex(8)}.php"
    php = f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!hash_equals('{token}', (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
require_once __DIR__ . '/meta.php';
try {{
    $base = [
        'event_id' => 'gt_meta_audit_123456',
        'event_time' => time(),
        'event_source_url' => 'https://g-trots.ro/comanda-confirmata',
        'custom_data' => [
            'value' => 129,
            'currency' => 'RON',
            'order_id' => 'GT-AUDIT-123',
            'content_ids' => ['SE-CMM087'],
            'contents' => [['id' => 'SE-CMM087', 'quantity' => 1, 'item_price' => 129]],
            'num_items' => 1,
        ],
    ];
    $events = [];
    foreach (['Purchase', 'PaymentFailed', 'PaymentCancelled'] as $name) {{
        $events[$name] = metaConversionEvent(array_merge($base, ['event_name' => $name]));
    }}
    echo json_encode(['ok' => true, 'events' => $events], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}}
"""

    ftp = connect()
    try:
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")), blocksize=262144)
        result = request_json(f"{PUBLIC_ROOT}/{filename}?{urlencode({'token': token})}")
        events = result.get("events") if isinstance(result.get("events"), dict) else {}
        purchase = events.get("Purchase") if isinstance(events.get("Purchase"), dict) else {}
        custom = purchase.get("custom_data") if isinstance(purchase.get("custom_data"), dict) else {}
        summary = {
            "ok": bool(result.get("ok")),
            "accepted_events": sorted(events.keys()),
            "purchase_value": custom.get("value"),
            "purchase_currency": custom.get("currency"),
            "purchase_order_id": custom.get("order_id"),
            "purchase_content_ids": custom.get("content_ids"),
            "purchase_contents": custom.get("contents"),
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if not summary["ok"] or len(events) != 3:
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
