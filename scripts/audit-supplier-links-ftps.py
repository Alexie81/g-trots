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


def main() -> None:
    token = secrets.token_urlsafe(32)
    filename = f"supplier-links-audit-{secrets.token_hex(8)}.php"
    php = f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!hash_equals('{token}', (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
define('GTROTS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';
require_once __DIR__ . '/nir-service.php';
try {{
    $db = shopDb(shopConfig());
    $suppliers = $db->query("SELECT s.id, s.name, s.alias, s.is_active,
        (SELECT COUNT(*) FROM shop_supplier_product_references r WHERE r.supplier_id=s.id) AS reference_count,
        (SELECT COUNT(*) FROM shop_nir_documents n WHERE n.supplier_id=s.id) AS nir_count,
        (SELECT COUNT(*) FROM shop_nir_documents n WHERE n.supplier_id=s.id AND n.status='confirmed') AS confirmed_nir_count
        FROM shop_suppliers s
        WHERE LOWER(TRIM(s.name))='george' OR LOWER(TRIM(s.alias))='george'
           OR LOWER(s.name) LIKE '%boomag%' OR LOWER(s.alias) LIKE '%boomag%'
           OR UPPER(TRIM(s.name))='KIDOTOYS SRL'
        ORDER BY s.name")->fetchAll();
    $boomag = $db->query("SELECT COUNT(*) total,
        SUM(CASE WHEN TRIM(COALESCE(p.supplier_product_code,''))<>'' THEN 1 ELSE 0 END) with_supplier_code,
        SUM(CASE WHEN TRIM(COALESCE(p.supplier_product_code,''))='' AND TRIM(COALESCE(p.sku,''))<>'' THEN 1 ELSE 0 END) sku_fallback
        FROM shop_products p LEFT JOIN shop_product_sources src ON src.id=p.source_id
        WHERE LOWER(TRIM(COALESCE(src.domain,p.source_domain,'')))='boomag.ro'")->fetch();
    $referenceRows = $db->query("SELECT r.product_id, r.supplier_product_code_normalized, p.supplier_product_code,
        LOWER(TRIM(COALESCE(src.domain,p.source_domain,''))) AS source_domain
        FROM shop_supplier_product_references r INNER JOIN shop_suppliers s ON s.id=r.supplier_id
        INNER JOIN shop_products p ON p.id=r.product_id LEFT JOIN shop_product_sources src ON src.id=p.source_id
        WHERE UPPER(TRIM(s.name))='KIDOTOYS SRL'")->fetchAll();
    $mismatches = 0;
    foreach ($referenceRows as $referenceRow) {{
        if ($referenceRow['source_domain'] !== 'boomag.ro' || $referenceRow['supplier_product_code_normalized'] !== shopNirNormalizeSupplierCode((string)$referenceRow['supplier_product_code'])) $mismatches++;
    }}
    echo json_encode(['ok'=>true,'suppliers'=>$suppliers,'boomag_products'=>$boomag,'boomag_reference_mismatches'=>$mismatches], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{ http_response_code(500); echo json_encode(['ok'=>false,'error'=>$error->getMessage()]); }}
"""
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=90)
    ftp.connect(os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro"), int(os.environ.get("GT_FTP_PORT", "21")))
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    ftp.login(os.environ["GT_FTP_USER"], password)
    ftp.prot_p()
    ftp.cwd(REMOTE_ROOT)
    try:
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")), blocksize=262144)
        request = Request(f"{PUBLIC_ROOT}/{filename}?" + urlencode({"token": token}), headers={"Accept": "application/json", "User-Agent": "G-Trots supplier audit"})
        with urlopen(request, timeout=180) as response:
            print(json.dumps(json.loads(response.read().decode("utf-8")), ensure_ascii=False, indent=2))
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
