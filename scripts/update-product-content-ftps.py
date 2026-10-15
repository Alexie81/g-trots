from __future__ import annotations

import argparse
import base64
from ftplib import FTP_TLS
from getpass import getpass
from io import BytesIO
import json
import os
from pathlib import Path
import secrets
import ssl
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


REMOTE_ROOT = "/g-trots.ro/shop-api"
PUBLIC_ROOT = "https://g-trots.ro/shop-api"


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Actualizează numai specificațiile și FAQ-urile unui produs identificat prin SKU."
    )
    parser.add_argument("content", type=Path, help="Fișier JSON cu sku, specifications și questions.")
    return parser.parse_args()


def load_content(path: Path) -> dict[str, Any]:
    content = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(content, dict):
        raise ValueError("Fișierul de conținut trebuie să conțină un obiect JSON.")
    sku = str(content.get("sku") or "").strip()
    specifications = content.get("specifications")
    questions = content.get("questions")
    if not sku:
        raise ValueError("SKU-ul lipsește.")
    if not isinstance(specifications, list) or not 1 <= len(specifications) <= 60:
        raise ValueError("Lista de specificații trebuie să conțină între 1 și 60 de elemente.")
    if not isinstance(questions, list) or not 1 <= len(questions) <= 30:
        raise ValueError("Lista de întrebări trebuie să conțină între 1 și 30 de elemente.")
    for index, item in enumerate(specifications, start=1):
        if not isinstance(item, dict) or any(not str(item.get(key) or "").strip() for key in ("group", "label", "value")):
            raise ValueError(f"Specificația {index} este incompletă.")
    question_keys: set[str] = set()
    for index, item in enumerate(questions, start=1):
        if not isinstance(item, dict) or any(not str(item.get(key) or "").strip() for key in ("question", "answer")):
            raise ValueError(f"Întrebarea {index} este incompletă.")
        key = " ".join(str(item["question"]).casefold().split())
        if key in question_keys:
            raise ValueError(f"Întrebarea {index} este duplicată.")
        question_keys.add(key)
    return {
        "sku": sku,
        "specifications": specifications,
        "questions": questions,
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


def request_json(url: str) -> dict[str, Any]:
    request = Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "G-Trots product content updater"},
    )
    with urlopen(request, timeout=300) as response:
        value = json.loads(response.read().decode("utf-8", errors="replace"))
    if not isinstance(value, dict):
        raise RuntimeError("Serverul a trimis un răspuns neașteptat.")
    return value


def main() -> None:
    options = arguments()
    content = load_content(options.content)
    encoded = base64.b64encode(
        json.dumps(content, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    token = secrets.token_urlsafe(32)
    filename = f"update-product-content-{secrets.token_hex(8)}.php"
    php = f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!hash_equals('{token}', (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
define('GTROTS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';
try {{
    $payload = json_decode(base64_decode('{encoded}', true), true, 512, JSON_THROW_ON_ERROR);
    $config = shopConfig();
    $db = shopDb($config);
    ensureShopSchema($db);
    $find = $db->prepare('SELECT id, sku, name, slug, specifications_json, questions_json, content_status FROM shop_products WHERE sku = ? LIMIT 2');
    $find->execute([(string)$payload['sku']]);
    $products = $find->fetchAll();
    if (count($products) !== 1) throw new RuntimeException(count($products) === 0 ? 'Produsul nu a fost găsit.' : 'SKU-ul identifică mai multe produse.');
    $product = $products[0];
    $specificationsJson = json_encode($payload['specifications'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $questionsJson = json_encode($payload['questions'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $beforeSpecifications = json_decode((string)($product['specifications_json'] ?? ''), true);
    $beforeQuestions = json_decode((string)($product['questions_json'] ?? ''), true);
    $db->beginTransaction();
    try {{
        $update = $db->prepare('UPDATE shop_products SET specifications_json = ?, questions_json = ? WHERE id = ?');
        $update->execute([$specificationsJson, $questionsJson, (string)$product['id']]);
        $db->commit();
    }} catch (Throwable $error) {{
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }}
    $seo = shopProductSeoSync($db, $config, (string)$product['id'], (string)$product['slug'], false, true);
    $check = $db->prepare('SELECT id, sku, name, slug, specifications_json, questions_json, content_status FROM shop_products WHERE id = ?');
    $check->execute([(string)$product['id']]);
    $saved = $check->fetch();
    $savedSpecifications = json_decode((string)($saved['specifications_json'] ?? ''), true);
    $savedQuestions = json_decode((string)($saved['questions_json'] ?? ''), true);
    echo json_encode([
        'ok' => true,
        'product' => [
            'id' => $saved['id'],
            'sku' => $saved['sku'],
            'name' => $saved['name'],
            'slug' => $saved['slug'],
            'content_status' => $saved['content_status'],
        ],
        'before' => [
            'specifications' => is_array($beforeSpecifications) ? count($beforeSpecifications) : 0,
            'questions' => is_array($beforeQuestions) ? count($beforeQuestions) : 0,
        ],
        'after' => [
            'specifications' => is_array($savedSpecifications) ? count($savedSpecifications) : 0,
            'questions' => is_array($savedQuestions) ? count($savedQuestions) : 0,
        ],
        'seo' => $seo,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
