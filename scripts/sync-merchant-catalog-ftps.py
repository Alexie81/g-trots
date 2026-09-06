from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
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
    ftp = FTP_TLS(context=context, timeout=90)
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    ftp.connect(os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro"), int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.login(os.environ["GT_FTP_USER"], password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def request_json(url: str, timeout: int = 120) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots Merchant catalog sync"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def chunks(values: list[str], size: int) -> list[list[str]]:
    return [values[index:index + size] for index in range(0, len(values), size)]


def main() -> None:
    token = secrets.token_urlsafe(32)
    filename = f"merchant-catalog-sync-{secrets.token_hex(8)}.php"
    php = f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!hash_equals('{token}', (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
define('GTROTS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';
try {{
    $config = shopConfig();
    if (!merchantIsConfigured($config)) throw new RuntimeException('Google Merchant nu este configurat.');
    $db = shopDb($config);
    $mode = (string)($_GET['mode'] ?? 'stats');
    if ($mode === 'register') {{
        try {{
            $registration = merchantRegisterGcp($config);
            echo json_encode(['ok' => true, 'registered' => true, 'result' => $registration], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }} catch (Throwable $error) {{
            if (stripos($error->getMessage(), 'already') === false) throw $error;
            echo json_encode(['ok' => true, 'registered' => true, 'already_registered' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }}
        exit;
    }}
    if ($mode === 'plan') {{
        $ids = array_values(array_map('strval', $db->query('SELECT id FROM shop_products ORDER BY id ASC')->fetchAll(PDO::FETCH_COLUMN)));
        echo json_encode(['ok' => true, 'product_ids' => $ids, 'total' => count($ids)]);
        exit;
    }}
    if ($mode === 'sync') {{
        $ids = array_values(array_filter(array_map('trim', explode(',', (string)($_GET['ids'] ?? '')))));
        if (count($ids) > 5) throw new RuntimeException('Lotul depaseste limita de 5 produse.');
        $results = [];
        foreach ($ids as $id) $results[] = ['product_id' => $id, ...merchantSyncProductSafe($db, $config, $id)];
        echo json_encode(['ok' => true, 'results' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }}
    $row = $db->query("SELECT COUNT(*) AS total, SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active_total, SUM(CASE WHEN merchant_synced_at IS NOT NULL AND merchant_sync_error IS NULL THEN 1 ELSE 0 END) AS synced, SUM(CASE WHEN merchant_sync_error IS NOT NULL THEN 1 ELSE 0 END) AS errors FROM shop_products")->fetch();
    echo json_encode(['ok' => true, 'stats' => $row], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}}
"""

    ftp = connect()
    try:
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")), blocksize=262144)
        base = f"{PUBLIC_ROOT}/{filename}?" + urlencode({"token": token})
        registration = request_json(base + "&mode=register")
        print(json.dumps({"phase": "registration", "registered": bool(registration.get("registered"))}), flush=True)

        plan = request_json(base + "&mode=plan")
        product_ids = [str(value) for value in plan.get("product_ids", [])]
        groups = chunks(product_ids, 5)
        print(json.dumps({"phase": "plan", "total": len(product_ids), "batches": len(groups)}), flush=True)

        totals = {"synced": 0, "deleted": 0, "already_absent": 0, "errors": []}
        with ThreadPoolExecutor(max_workers=6) as executor:
            pending = {
                executor.submit(request_json, base + "&" + urlencode({"mode": "sync", "ids": ",".join(group)})): group
                for group in groups
            }
            completed = 0
            for future in as_completed(pending):
                completed += 1
                try:
                    payload = future.result()
                    for result in payload.get("results", []):
                        status = str(result.get("status", ""))
                        if status in ("synced", "deleted", "already_absent"):
                            totals[status] += 1
                        elif status == "error":
                            totals["errors"].append(result)
                        else:
                            totals["errors"].append({"product_id": result.get("product_id"), "error": f"Stare neasteptata: {status}"})
                except Exception as error:
                    totals["errors"].append({"product_ids": pending[future], "error": str(error)})
                if completed % 25 == 0 or completed == len(groups):
                    print(json.dumps({"phase": "sync", "completed_batches": completed, "total_batches": len(groups), "errors": len(totals["errors"])}), flush=True)

        stats = request_json(base + "&mode=stats")
        print(json.dumps({"phase": "complete", "result": totals, "server": stats.get("stats", {})}, ensure_ascii=False, indent=2), flush=True)
        if totals["errors"] or int(stats.get("stats", {}).get("errors") or 0) != 0:
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
