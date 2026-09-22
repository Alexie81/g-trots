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
    parser = argparse.ArgumentParser(description="Auditează și elimină controlat un produs Shopify duplicat.")
    parser.add_argument("--product-id", required=True, help="ID-ul intern stabil din shop_products.")
    parser.add_argument("--keep-id", required=True, help="ID-ul Shopify păstrat și legat în baza de date.")
    parser.add_argument("--delete-id", required=True, help="ID-ul Shopify duplicat care trebuie eliminat.")
    parser.add_argument("--apply", action="store_true", help="Execută ștergerea după verificările de identitate.")
    return parser.parse_args()


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


def php_quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def request_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots Shopify duplicate cleanup"})
    with urlopen(request, timeout=180) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def main() -> None:
    options = arguments()
    product_id = php_quote(options.product_id.strip())
    keep_id = php_quote(options.keep_id.strip())
    delete_id = php_quote(options.delete_id.strip())
    if not product_id or not keep_id.startswith("gid://shopify/Product/") or not delete_id.startswith("gid://shopify/Product/"):
        raise ValueError("Identificatorii primiți nu au formatul așteptat.")
    if keep_id == delete_id:
        raise ValueError("Produsul păstrat și produsul eliminat trebuie să fie diferite.")

    token = secrets.token_urlsafe(32)
    filename = f"shopify-duplicate-cleanup-{secrets.token_hex(8)}.php"
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
    $stmt = $db->prepare('SELECT id, sku, shopify_product_id FROM shop_products WHERE id = ? LIMIT 1');
    $stmt->execute(['{product_id}']);
    $local = $stmt->fetch();
    if (!$local) throw new RuntimeException('Produsul intern nu există.');
    if ((string)$local['shopify_product_id'] !== '{keep_id}') throw new RuntimeException('ID-ul Shopify păstrat nu este legătura curentă din baza de date.');

    $query = <<<'GRAPHQL'
query GtrotsDuplicateAudit($ids: [ID!]!) {{
  nodes(ids: $ids) {{
    ... on Product {{
      id
      title
      handle
      metafield(namespace: "custom", key: "g_trots_product_id") {{ value }}
      variants(first: 10) {{ nodes {{ sku }} }}
    }}
  }}
}}
GRAPHQL;
    $audit = shopifyGraphql($config, $query, ['ids' => ['{keep_id}', '{delete_id}']]);
    $nodes = array_values(array_filter((array)($audit['nodes'] ?? []), 'is_array'));
    $byId = [];
    foreach ($nodes as $node) $byId[(string)($node['id'] ?? '')] = $node;
    $matches = static function(array $node, array $local): bool {{
        if ((string)($node['metafield']['value'] ?? '') === (string)$local['id']) return true;
        foreach ((array)($node['variants']['nodes'] ?? []) as $variant) {{
            if ((string)($variant['sku'] ?? '') === (string)$local['sku']) return true;
        }}
        return false;
    }};
    if (!isset($byId['{keep_id}']) || !$matches($byId['{keep_id}'], $local)) throw new RuntimeException('Produsul Shopify păstrat nu corespunde produsului intern.');
    if (!isset($byId['{delete_id}']) || !$matches($byId['{delete_id}'], $local)) throw new RuntimeException('Ținta de ștergere nu este duplicatul verificat al produsului intern.');

    $deleted = null;
    if ({apply}) {{
        $mutation = <<<'GRAPHQL'
mutation GtrotsDuplicateDelete($input: ProductDeleteInput!) {{
  productDelete(input: $input) {{ deletedProductId userErrors {{ field message }} }}
}}
GRAPHQL;
        $delete = shopifyGraphql($config, $mutation, ['input' => ['id' => '{delete_id}']]);
        $payload = (array)($delete['productDelete'] ?? []);
        $errors = shopifyUserErrors($payload);
        if ($errors) throw new RuntimeException(implode('; ', $errors));
        $deleted = (string)($payload['deletedProductId'] ?? '');
        if ($deleted !== '{delete_id}') throw new RuntimeException('Shopify nu a confirmat ștergerea ID-ului exact.');
    }}
    echo json_encode(['ok' => true, 'applied' => {apply}, 'local' => $local, 'products' => $nodes, 'deleted' => $deleted], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
