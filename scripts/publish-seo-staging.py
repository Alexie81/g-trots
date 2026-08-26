from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PRODUCTS_DIR = ROOT / "seo-products"
VALIDATOR_PATH = ROOT / "validate-seo-staging.py"
STATE_PATH = ROOT / "seo-publish-state.json"
DEFAULT_ENDPOINT = "https://g-trots.ro/shop-api/api-v2.php"


def load_validator():
    spec = importlib.util.spec_from_file_location("seo_staging_validator", VALIDATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Validatorul SEO nu a putut fi incarcat.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def php_value(value: str) -> str:
    return value.replace("\\'", "'").replace("\\\\", "\\")


def array_block(source: str, key: str) -> str:
    match = re.search(r"'" + re.escape(key) + r"'\s*=>\s*\[", source)
    if not match:
        return ""
    start = match.end()
    depth = 1
    in_string = False
    escaped = False
    for index in range(start, len(source)):
        character = source[index]
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == "'":
                in_string = False
            continue
        if character == "'":
            in_string = True
        elif character == "[":
            depth += 1
        elif character == "]":
            depth -= 1
            if depth == 0:
                return source[start:index]
    return ""


def parse_rows(source: str, keys: tuple[str, ...], block_key: str) -> list[dict[str, str]]:
    block = array_block(source, block_key)
    if not block:
        return []
    key_pattern = r"\s*,\s*".join(
        r"'" + re.escape(key) + r"'\s*=>\s*'((?:\\'|[^'])*)'"
        for key in keys
    )
    return [
        {key: php_value(value) for key, value in zip(keys, match.groups())}
        for match in re.finditer(r"\[\s*" + key_pattern + r"\s*\]", block, flags=re.DOTALL)
    ]


def parse_strings(source: str, key: str) -> list[str]:
    block = array_block(source, key)
    return [php_value(value) for value in re.findall(r"'((?:\\'|[^'])*)'", block)]


def product_payload(path: Path, validator) -> dict[str, object]:
    source = path.read_text(encoding="utf-8")
    product = validator.parse_product(path)
    payload = {
        "id": product["id"],
        "supplier_external_id": product["supplier_external_id"],
        "name": product["name"],
        "slug": product["slug"],
        "short_description": product["short_description"],
        "description_title": product["description_title"],
        "description_html": product["description_html"],
        "meta_title": product["meta_title"],
        "meta_description": product["meta_description"],
        "specifications": parse_rows(source, ("group", "label", "value"), "specifications"),
        "questions": parse_rows(source, ("question", "answer"), "questions"),
        "compatibility_names": parse_strings(source, "compatibility_names"),
        "image_alt_texts": parse_strings(source, "image_alt_texts"),
        "research_sources": parse_rows(source, ("label", "url"), "research_sources"),
    }
    if len(payload["specifications"]) != int(product["specification_count"]):
        raise RuntimeError(f"Specificatiile nu au putut fi citite complet din {path.name}.")
    if len(payload["questions"]) != int(product["question_count"]):
        raise RuntimeError(f"FAQ-urile nu au putut fi citite complet din {path.name}.")
    if len(payload["research_sources"]) != int(product["source_count"]):
        raise RuntimeError(f"Sursele nu au putut fi citite complet din {path.name}.")
    if not payload["image_alt_texts"]:
        raise RuntimeError(f"Textele alternative lipsesc din {path.name}.")
    return payload


def import_key() -> str:
    from_environment = os.environ.get("GTROTS_BOOMAG_IMPORT_KEY", "").strip()
    if from_environment:
        return from_environment
    config_path = ROOT.parent / "shop-api" / "gomag.local.php"
    if not config_path.is_file():
        raise RuntimeError("Lipseste cheia locala pentru publicarea Boomag.")
    source = config_path.read_text(encoding="utf-8")
    match = re.search(r"'gomag_api_key'\s*=>\s*'((?:\\'|[^'])*)'", source)
    if not match or not match.group(1).strip():
        raise RuntimeError("Cheia locala Boomag nu este configurata.")
    return php_value(match.group(1)).strip()


def shop_api_key() -> str:
    from_environment = os.environ.get("GTROTS_API_KEY", "").strip()
    if from_environment:
        return from_environment
    eas_path = ROOT.parent / "eas.json"
    if eas_path.is_file():
        try:
            eas = json.loads(eas_path.read_text(encoding="utf-8"))
            profiles = eas.get("build", {}) if isinstance(eas, dict) else {}
            for profile_name in ("preview", "production", "development"):
                profile = profiles.get(profile_name, {}) if isinstance(profiles, dict) else {}
                environment = profile.get("env", {}) if isinstance(profile, dict) else {}
                value = str(environment.get("EXPO_PUBLIC_API_KEY", "")).strip() if isinstance(environment, dict) else ""
                if value:
                    return value
        except (OSError, json.JSONDecodeError):
            pass
    raise RuntimeError("Cheia API SHOP nu este configurata local.")


def load_state() -> dict[str, str]:
    if not STATE_PATH.is_file():
        return {}
    try:
        value = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {str(key): str(item) for key, item in value.items()} if isinstance(value, dict) else {}


def save_state(state: dict[str, str]) -> None:
    temporary = STATE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(STATE_PATH)


def request_json(
    url: str,
    method: str = "GET",
    payload: dict[str, object] | None = None,
    api_key: str = "",
) -> dict[str, object]:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            **({"X-API-Key": api_key} if api_key else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw).get("error", raw)
        except json.JSONDecodeError:
            detail = raw
        raise RuntimeError(f"Serverul a raspuns cu HTTP {error.code}: {detail}") from error
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise RuntimeError("Serverul a trimis un raspuns neasteptat.")
    if value.get("error"):
        raise RuntimeError(str(value["error"]))
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Publica numai fisele SEO locale validate.")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--force", action="store_true", help="Republica inclusiv versiunile deja trimise.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    validation = subprocess.run(
        [sys.executable, str(VALIDATOR_PATH), "--verify-feed"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    report = json.loads(validation.stdout)
    if int(report.get("invalid_products", 0)) != 0:
        raise RuntimeError("Publicarea a fost oprita: exista fise SEO invalide.")

    validator = load_validator()
    state = load_state()
    secret = "" if args.dry_run else import_key()
    api_key = "" if args.dry_run else shop_api_key()
    results: list[dict[str, object]] = []

    for path in sorted(PRODUCTS_DIR.glob("*.php")):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        parsed = validator.parse_product(path)
        external_id = str(parsed["supplier_external_id"])
        if not args.force and state.get(external_id) == digest:
            results.append({"external_id": external_id, "status": "unchanged"})
            continue
        payload = product_payload(path, validator)
        if args.dry_run:
            results.append({
                "external_id": external_id,
                "status": "ready",
                "slug": payload["slug"],
                "specifications": len(payload["specifications"]),
                "questions": len(payload["questions"]),
                "sources": len(payload["research_sources"]),
            })
            continue
        payload["import_key"] = secret
        save_url = args.endpoint + "?" + urllib.parse.urlencode({"action": "saveBoomagSeoProduct"})
        saved = request_json(save_url, method="POST", payload=payload, api_key=api_key)
        public_slug = str(saved.get("slug") or payload["slug"])
        public_url = args.endpoint + "?" + urllib.parse.urlencode({"action": "publicProduct", "slug": public_slug})
        public_product = request_json(public_url)
        if str(public_product.get("id", "")) != str(saved.get("id", "")):
            raise RuntimeError(f"Verificarea publica a esuat pentru produsul {external_id}.")
        if str(public_product.get("description_html", "")).strip() == "":
            raise RuntimeError(f"Descrierea publica lipseste pentru produsul {external_id}.")
        state[external_id] = digest
        save_state(state)
        stripe_sync = saved.get("stripe_sync") if isinstance(saved.get("stripe_sync"), dict) else {}
        results.append({
            "external_id": external_id,
            "status": "published",
            "slug": public_slug,
            "images": len(public_product.get("images", [])) if isinstance(public_product.get("images"), list) else 0,
            "stripe_synced": not bool(stripe_sync.get("error")) if isinstance(stripe_sync, dict) else None,
        })

    print(json.dumps({
        "validated": int(report.get("valid_products", 0)),
        "published": sum(1 for result in results if result["status"] == "published"),
        "unchanged": sum(1 for result in results if result["status"] == "unchanged"),
        "results": results,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        raise SystemExit(1)
