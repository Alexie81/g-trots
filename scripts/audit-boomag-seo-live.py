from __future__ import annotations

import argparse
import concurrent.futures
import html
import json
import os
import re
import threading
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENDPOINT = "https://g-trots.ro/shop-api/api-v2.php"
PROHIBITED_VISIBLE_PATTERNS = {
    "boomag": re.compile(r"\bboomag(?:\.ro)?\b", re.IGNORECASE),
    "gomag": re.compile(r"\bgomag(?:cdn)?\b", re.IGNORECASE),
    "supplier_feed": re.compile(r"\bfeed(?:ul)?\s+(?:furnizor|boomag)\b", re.IGNORECASE),
    "public_url": re.compile(r"https?://", re.IGNORECASE),
}
SERVICE_PATTERN = re.compile(r"\b(?:montaj|montare|instalare|service|atelier)\b", re.IGNORECASE)
GTROTS_PATTERN = re.compile(r"\bg[\s-]?trots(?:\.ro)?\b", re.IGNORECASE)
ACCESSORY_CATEGORY_NAMES = {
    "accesorii trotinete electrice", "antifurt bicicleta cu alarma sau gps",
    "antifurt bicicleta cu cablu din otel", "antifurt bicicleta cu lant", "benzi anti-grip",
    "casca bicicleta", "casti protectie", "chei si scule bicicleta", "ciclism", "genti transport",
    "mansoane", "oglinzi", "rucsaci si borsete ciclism", "scaune", "sistem antifurt", "sonerii",
    "stickere reflectorizate", "suport telefon bicicleta",
}
ACCESSORY_FAMILIES = {"accessory", "bag", "grip", "helmet", "lock", "mirror", "phone_holder", "seat", "sticker"}


def normalized(value: Any) -> str:
    return " ".join(re.findall(r"[^\W_]+", str(value or "").lower(), flags=re.UNICODE))


def word_count(value: Any) -> int:
    plain = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    return len(re.findall(r"[^\W_]+", plain, flags=re.UNICODE))


def php_string(source: str, key: str) -> str:
    match = re.search(r"'" + re.escape(key) + r"'\s*=>\s*'((?:\\'|[^'])*)'", source)
    if not match:
        return ""
    return match.group(1).replace("\\'", "'").replace("\\\\", "\\").strip()


def api_key() -> str:
    value = os.environ.get("GTROTS_API_KEY", "").strip()
    if value:
        return value
    env_path = ROOT / ".env"
    if env_path.is_file():
        match = re.search(r"^EXPO_PUBLIC_API_KEY=(.+)$", env_path.read_text(encoding="utf-8"), re.MULTILINE)
        if match:
            return match.group(1).strip()
    config_path = ROOT / "shop-api" / "config.local.php"
    if config_path.is_file():
        value = php_string(config_path.read_text(encoding="utf-8"), "api_key")
        if value:
            return value
    raise RuntimeError("Cheia API SHOP nu este configurata.")


def request_json(url: str, shop_key: str = "") -> Any:
    headers = {"Accept": "application/json"}
    if shop_key:
        headers["X-API-Key"] = shop_key
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=240) as response:
        raw = response.read().decode("utf-8", errors="replace")
    value = json.loads(raw)
    if isinstance(value, dict) and value.get("error"):
        raise RuntimeError(str(value["error"]))
    return value


def visible_copy(product: dict[str, Any]) -> str:
    specifications = [
        {key: item.get(key) for key in ("group", "label", "value")}
        for item in product.get("specifications") or [] if isinstance(item, dict)
    ]
    questions = [
        {key: item.get(key) for key in ("question", "answer")}
        for item in product.get("questions") or [] if isinstance(item, dict)
    ]
    return " ".join([
        str(product.get("name") or ""),
        str(product.get("short_description") or ""),
        str(product.get("description_title") or ""),
        str(product.get("description_html") or ""),
        str(product.get("meta_title") or ""),
        str(product.get("meta_description") or ""),
        json.dumps(specifications, ensure_ascii=False),
        json.dumps(questions, ensure_ascii=False),
    ])


def is_accessory_source(product: dict[str, Any]) -> bool:
    return (
        normalized(product.get("category_name")) in ACCESSORY_CATEGORY_NAMES
        or str(product.get("product_family") or "").strip().lower() in ACCESSORY_FAMILIES
    )


def audit_product(product: dict[str, Any], accessory: bool = False) -> dict[str, Any]:
    external_id = str(product.get("supplier_external_id") or "")
    issues: list[str] = []
    words = word_count(product.get("description_html"))
    questions = [item for item in product.get("questions") or [] if isinstance(item, dict)]
    specifications = [item for item in product.get("specifications") or [] if isinstance(item, dict)]
    images = [item for item in product.get("images") or [] if isinstance(item, dict)]
    faq_text = " ".join(
        f"{item.get('question', '')} {item.get('answer', '')}" for item in questions
    )

    if not product.get("seo_ready"):
        issues.append("seo_not_ready")
    if not 600 <= words <= 1800:
        issues.append("description_words")
    if not 90 <= len(str(product.get("short_description") or "").strip()) <= 420:
        issues.append("short_description_length")
    if not 15 <= len(str(product.get("meta_title") or "").strip()) <= 70:
        issues.append("meta_title_length")
    if not 120 <= len(str(product.get("meta_description") or "").strip()) <= 180:
        issues.append("meta_description_length")
    if len(specifications) < 8:
        issues.append("specifications")
    if not 5 <= len(questions) <= 8:
        issues.append("faq_count")
    if not images:
        issues.append("images")
    if any(not str(item.get("alt_text") or "").strip() for item in images):
        issues.append("image_alt")
    if not GTROTS_PATTERN.search(faq_text):
        issues.append("faq_gtrots")
    if accessory:
        if re.search(r"G[\s-]?Trots Service|\binterven[^\W\d_]*\b", copy := visible_copy(product), re.IGNORECASE):
            issues.append("accessory_service_intervention_copy")
    elif not SERVICE_PATTERN.search(faq_text):
        issues.append("faq_service")
    for item in questions:
        question = str(item.get("question") or "").strip()
        answer = str(item.get("answer") or "").strip()
        if not 18 <= len(question) <= 190 or not 55 <= len(answer) <= 900:
            issues.append("faq_quick_answer_length")
            break
    copy = visible_copy(product)
    prohibited = [name for name, pattern in PROHIBITED_VISIBLE_PATTERNS.items() if pattern.search(copy)]
    issues.extend(f"visible_reference:{name}" for name in prohibited)
    return {
        "supplier_external_id": external_id,
        "id": str(product.get("id") or ""),
        "slug": str(product.get("slug") or ""),
        "words": words,
        "faq": len(questions),
        "specifications": len(specifications),
        "images": len(images),
        "issues": sorted(set(issues)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Auditeaza catalogul SEO Boomag publicat in API-ul G-Trots.")
    parser.add_argument("catalog", type=Path)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = json.loads(args.catalog.read_text(encoding="utf-8"))
    expected_products = source.get("products") if isinstance(source, dict) else None
    if not isinstance(expected_products, list):
        raise RuntimeError("Catalogul sursa nu contine products.")
    expected_ids = {str(item.get("supplier_external_id") or "") for item in expected_products if isinstance(item, dict)}
    accessory_ids = {
        str(item.get("supplier_external_id") or "")
        for item in expected_products if isinstance(item, dict) and is_accessory_source(item)
    }
    base = args.endpoint + "?"
    listed = request_json(base + urllib.parse.urlencode({"action": "publicProducts"}))
    if not isinstance(listed, list):
        raise RuntimeError("API-ul nu a returnat lista produselor.")
    expected_by_sku = {
        normalized(item.get("supplier_sku")): str(item.get("supplier_external_id") or "")
        for item in expected_products if isinstance(item, dict) and normalized(item.get("supplier_sku"))
    }
    live_by_sku = {
        normalized(item.get("sku")): item
        for item in listed if isinstance(item, dict) and normalized(item.get("sku"))
    }
    matching_skus = sorted(set(expected_by_sku) & set(live_by_sku))
    matching_ids = [expected_by_sku[sku] for sku in matching_skus]
    missing_ids = sorted(expected_by_sku[sku] for sku in set(expected_by_sku) - set(live_by_sku))
    uncovered_live_ids = sorted(str(live_by_sku[sku].get("sku") or "") for sku in set(live_by_sku) - set(expected_by_sku))
    boomag = {expected_by_sku[sku]: live_by_sku[sku] for sku in matching_skus}
    results: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    progress_lock = threading.Lock()
    completed = 0

    def fetch(external_id: str) -> dict[str, Any]:
        item = boomag[external_id]
        url = base + urllib.parse.urlencode({"action": "publicProduct", "id": str(item.get("id") or "")})
        value = request_json(url)
        if not isinstance(value, dict):
            raise RuntimeError("Raspuns produs invalid.")
        value["supplier_external_id"] = external_id
        return audit_product(value, external_id in accessory_ids)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 6))) as executor:
        future_map = {executor.submit(fetch, external_id): external_id for external_id in matching_ids}
        for future in concurrent.futures.as_completed(future_map):
            external_id = future_map[future]
            try:
                results.append(future.result())
            except Exception as error:
                failures.append({"supplier_external_id": external_id, "error": str(error)})
            with progress_lock:
                completed += 1
                if completed % 100 == 0 or completed == len(matching_ids):
                    print(json.dumps({"progress": completed, "total": len(matching_ids), "failures": len(failures)}), flush=True)

    issue_counts = Counter(issue for result in results for issue in result["issues"])
    duplicate_fields: dict[str, list[str]] = {}
    source_by_id = {str(item.get("supplier_external_id") or ""): item for item in expected_products if isinstance(item, dict)}
    for field in ("title", "slug", "short_description", "meta_title", "meta_description"):
        values: dict[str, list[str]] = {}
        for external_id in matching_ids:
            value = normalized(source_by_id[external_id].get(field))
            if value:
                values.setdefault(value, []).append(external_id)
        duplicate_fields[field] = [ids[0] for ids in values.values() if len(ids) > 1]

    failed_products = [result for result in results if result["issues"]]
    report = {
        "source_products": len(expected_ids),
        "live_catalog_products": len(listed),
        "audited_products": len(results),
        "missing_from_live": missing_ids,
        "not_covered_by_source_file": uncovered_live_ids,
        "request_failures": failures,
        "products_with_issues": len(failed_products),
        "issue_counts": dict(sorted(issue_counts.items())),
        "duplicate_fields": duplicate_fields,
        "description_words": {
            "min": min((item["words"] for item in results), default=0),
            "max": max((item["words"] for item in results), default=0),
        },
        "faq": {
            "min": min((item["faq"] for item in results), default=0),
            "max": max((item["faq"] for item in results), default=0),
            "all_include_contextual_gtrots_guidance": not any(
                issue in {"faq_service", "faq_gtrots"} for issue in issue_counts
            ),
            "accessories_without_service_intervention_copy": "accessory_service_intervention_copy" not in issue_counts,
        },
        "visible_supplier_references": sum(
            count for issue, count in issue_counts.items() if issue.startswith("visible_reference:")
        ),
        "all_matched_products_passed": not failures and not failed_products,
        "issue_samples": failed_products[:100],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    return 0 if report["all_matched_products_passed"] else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False, indent=2), flush=True)
        raise SystemExit(1)
