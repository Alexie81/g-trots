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

PRODUCTS = {
    "SE-EWF584": {
        "name": "Cască INTEGRA Sport full face negru-verde – L (59-61cm)",
        "meta_title": "Cască INTEGRA Sport negru-verde L 59-61 cm | G-Trots",
    },
    "SE-EWF663": {
        "name": "Cască integrală INTEGRA Sport negru-verde – M (55-58cm)",
        "meta_title": "Cască INTEGRA Sport negru-verde M 55-58 cm | G-Trots",
    },
    "WT-SP-1385": {
        "name": "Cască full face FRV Street Panther negru mat – S 55-56 CM",
        "meta_title": "Cască FRV Street Panther negru mat S 55-56 cm | G-Trots",
    },
    "WT-SP-1386": {
        "name": "Cască FRV Street Panther full face, negru mat – M 57-58 CM",
        "meta_title": "Cască FRV Street Panther negru mat M 57-58 cm | G-Trots",
    },
    "WT-SP-1387": {
        "name": "Cască full face Street Panther neagră pentru mobilitate urbană – L 59 CM",
        "meta_title": "Cască FRV Street Panther negru mat L 59 cm | G-Trots",
    },
    "WT-SP-1388": {
        "name": "Cască integrală FRV Street Panther, negru mat – XL 60 CM",
        "meta_title": "Cască FRV Street Panther negru mat XL 60 cm | G-Trots",
    },
}


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


def request_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots title updater"})
    with urlopen(request, timeout=300) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def main() -> None:
    token = secrets.token_urlsafe(32)
    filename = f"update-helmet-titles-{secrets.token_hex(8)}.php"
    products_json = json.dumps(PRODUCTS, ensure_ascii=False).replace("'", "\\u0027")
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
    $targets = json_decode('{products_json}', true, 512, JSON_THROW_ON_ERROR);
    $saved = [];
    $syncQueue = [];
    $db->beginTransaction();
    try {{
        $find = $db->prepare('SELECT id, sku, slug, name, meta_title FROM shop_products WHERE sku = ? LIMIT 1');
        $update = $db->prepare('UPDATE shop_products SET name = ?, meta_title = ?, content_status = "seo" WHERE id = ?');
        foreach ($targets as $sku => $target) {{
            $find->execute([$sku]);
            $product = $find->fetch();
            if (!$product) throw new RuntimeException('Produsul nu a fost găsit: ' . $sku);
            $update->execute([(string)$target['name'], (string)$target['meta_title'], (string)$product['id']]);
            $orderSync = shopAdminSyncRenamedProductInEditableOrders($db, (string)$product['id'], (string)$target['name']);
            $syncQueue[] = ['product' => $product, 'order_sync' => $orderSync];
        }}
        $db->commit();
    }} catch (Throwable $error) {{
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }}
    foreach ($syncQueue as $entry) {{
        $product = $entry['product'];
        $orderSync = $entry['order_sync'];
        foreach ((array)$orderSync['invoice_order_ids'] as $orderId) {{
            GtrotsInvoiceService::refreshStoredForOrder($db, (string)$orderId, $config);
        }}
        foreach ((array)$orderSync['shipping_note_order_ids'] as $orderId) {{
            GtrotsShippingNoteService::refreshStoredForOrder($db, (string)$orderId, $config);
        }}
        $id = (string)$product['id'];
        $saved[] = [
            'product' => findProduct($db, $id, $config),
            'stripe' => stripeSyncProductSafe($db, $config, $id),
            'merchant' => merchantSyncProductSafe($db, $config, $id),
            'shopify' => shopifySyncProductSafe($db, $config, $id),
            'seo' => shopProductSeoSync($db, $config, $id, (string)$product['slug'], false, false),
            'orders_updated' => count((array)$orderSync['updated_order_ids']),
        ];
    }}
    $sitemap = shopProductSeoRebuildSitemap($db, $config);
    echo json_encode(['ok' => true, 'updated' => $saved, 'sitemap' => $sitemap], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
