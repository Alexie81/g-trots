from __future__ import annotations

import argparse
import concurrent.futures
import importlib.util
import json
import re
import urllib.parse
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BASE_IMPORTER_PATH = ROOT / "scripts" / "import-boomag-seo-json.py"
DEFAULT_ENDPOINT = "https://g-trots.ro/shop-api/api-v2.php"


def load_base_importer():
    spec = importlib.util.spec_from_file_location("boomag_final_importer", BASE_IMPORTER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Importatorul principal nu a putut fi încărcat.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BASE = load_base_importer()


def neutralize_supplier_name(value: Any) -> str:
    result = str(value or "")
    replacements = (
        (r"\bfeedul\s+Boomag(?:\.ro)?\b", "fișa tehnică disponibilă"),
        (r"\bpagina\s+Boomag(?:\.ro)?\b", "fișa tehnică disponibilă"),
        (r"\bBoomag(?:\.ro)?\b", "fișa tehnică disponibilă"),
        (r"\bGomag(?:\.ro)?\b", "platforma furnizorului"),
    )
    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result


def fit_meta_description(value: Any, product: dict[str, Any]) -> str:
    result = BASE.remove_public_identifiers(neutralize_supplier_name(value), product)
    if len(result) < 120:
        result = result.rstrip(" .") + ". Verifică dimensiunile și compatibilitatea înainte de comandă, cu ajutorul echipei G-Trots."
    if len(result) > 180:
        result = result[:180].rsplit(" ", 1)[0].rstrip(" ,.;:") + "."
    return result


def checkpoint_payload(item: dict[str, Any], feed_sku: str) -> dict[str, Any]:
    product = dict(item)
    product["title"] = str(item.get("name") or item.get("title") or "").strip()
    product["short_description"] = neutralize_supplier_name(item.get("short_description"))
    product["meta_title"] = neutralize_supplier_name(item.get("meta_title"))
    product["meta_description"] = neutralize_supplier_name(item.get("meta_description"))
    public_title = BASE.base_public_title(product)
    short_description = BASE.public_short_description(product["short_description"], product, public_title)
    description_title = BASE.remove_public_identifiers(
        neutralize_supplier_name(item.get("description_title")), product
    )
    questions: list[dict[str, str]] = []
    for question in item.get("questions") or []:
        if not isinstance(question, dict):
            continue
        question_text = BASE.clean_faq_text(
            neutralize_supplier_name(question.get("question")), product, public_title
        )
        answer_text = BASE.clean_faq_text(
            neutralize_supplier_name(question.get("answer")), product, public_title
        )
        if 0 < len(question_text) < 18:
            question_text = question_text.rstrip(" ?") + " pentru acest produs?"
        if 0 < len(answer_text) < 60:
            answer_text = answer_text.rstrip(" .") + ". Compară această caracteristică cu piesa sau echipamentul existent înainte de comandă."
        if question_text and answer_text:
            questions.append({"question": question_text, "answer": answer_text})

    specifications = BASE.clean_specifications(product)
    for specification in specifications:
        specification["group"] = neutralize_supplier_name(specification.get("group"))
        specification["label"] = neutralize_supplier_name(specification.get("label"))
        specification["value"] = neutralize_supplier_name(specification.get("value"))

    compatibility_names = [] if BASE.is_accessory(product) else [
        str(value).strip() for value in item.get("compatibility_names") or [] if str(value).strip()
    ]
    payload = {
        "supplier_external_id": str(item.get("supplier_external_id") or "").strip(),
        "sku": feed_sku,
        "supplier_product_code": feed_sku,
        "name": public_title,
        "slug": str(item.get("slug") or "").strip(),
        "short_description": short_description,
        "description_title": description_title,
        "description_html": neutralize_supplier_name(item.get("description_html")),
        "meta_title": BASE.fit_meta_title(product, public_title),
        "meta_description": fit_meta_description(product["meta_description"], product),
        "specifications": specifications,
        "questions": questions,
        "compatibility_names": compatibility_names,
        "image_alt_texts": BASE.image_alt_texts(product),
        "research_sources": list(item.get("research_sources") or []),
        "final_catalog": True,
    }
    return payload


def validate_payload(payload: dict[str, Any]) -> list[str]:
    external_id = str(payload.get("supplier_external_id") or "")
    errors: list[str] = []
    required = (
        "supplier_external_id", "sku", "name", "slug", "short_description", "description_title",
        "description_html", "meta_title", "meta_description",
    )
    for field in required:
        if not str(payload.get(field) or "").strip():
            errors.append(f"{external_id}: lipsește {field}")
    words = BASE.word_count(payload.get("description_html"))
    if not 600 <= words <= 1800:
        errors.append(f"{external_id}: descrierea are {words} cuvinte")
    if not 90 <= BASE.text_length(payload.get("short_description")) <= 420:
        errors.append(f"{external_id}: descriere scurtă în afara limitei")
    if not 15 <= BASE.text_length(payload.get("meta_title")) <= 70:
        errors.append(f"{external_id}: meta titlu în afara limitei")
    if not 120 <= BASE.text_length(payload.get("meta_description")) <= 180:
        errors.append(f"{external_id}: meta descriere în afara limitei")
    if len(payload.get("specifications") or []) < 5:
        errors.append(f"{external_id}: prea puține specificații")
    if not 5 <= len(payload.get("questions") or []) <= 8:
        errors.append(f"{external_id}: număr FAQ invalid")
    for question in payload.get("questions") or []:
        if len(str(question.get("question") or "")) < 18 or len(str(question.get("answer") or "")) < 60:
            errors.append(f"{external_id}: întrebare sau răspuns FAQ prea scurt")
    if not payload.get("image_alt_texts"):
        errors.append(f"{external_id}: lipsesc textele alternative")
    if not payload.get("research_sources"):
        errors.append(f"{external_id}: lipsesc sursele de cercetare")
    visible = " ".join([
        str(payload.get("name") or ""), str(payload.get("short_description") or ""),
        str(payload.get("description_title") or ""), str(payload.get("description_html") or ""),
        str(payload.get("meta_title") or ""), str(payload.get("meta_description") or ""),
        json.dumps(payload.get("questions") or [], ensure_ascii=False),
    ])
    if re.search(r"\b(?:boomag(?:\.ro)?|gomag(?:\.ro)?)\b", visible, re.IGNORECASE):
        errors.append(f"{external_id}: numele furnizorului apare în conținutul public")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validează și publică un checkpoint SEO Boomag.")
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    document = json.loads(args.checkpoint.read_text(encoding="utf-8"))
    products = document.get("products") if isinstance(document, dict) else None
    if not isinstance(products, list) or not products:
        raise RuntimeError("Checkpoint-ul nu conține produse.")
    feed_skus = BASE.public_feed_sku_map()
    payloads: list[dict[str, Any]] = []
    errors: list[str] = []
    for item in products:
        external_id = str(item.get("supplier_external_id") or "").strip()
        feed_sku = feed_skus.get(external_id)
        if not feed_sku:
            errors.append(f"{external_id}: produsul nu are SKU în feedul public curent")
            continue
        payload = checkpoint_payload(item, feed_sku)
        errors.extend(validate_payload(payload))
        payloads.append(payload)
    if errors:
        raise RuntimeError("Checkpoint invalid:\n" + "\n".join(errors))
    if args.dry_run:
        print(json.dumps({"validated": len(payloads)}, ensure_ascii=False))
        return 0

    import_secret = BASE.import_key()
    shop_key = BASE.api_key()
    url = args.endpoint + "?" + urllib.parse.urlencode({"action": "saveBoomagSeoProduct"})

    def publish(payload: dict[str, Any]) -> dict[str, str]:
        body = dict(payload)
        body["import_key"] = import_secret
        saved = BASE.request_json(url, body, shop_key)
        slug = str(saved.get("slug") or "")
        if not slug:
            raise RuntimeError(f"Produsul {payload['supplier_external_id']} nu a confirmat slug-ul.")
        return {
            "id": str(payload["supplier_external_id"]),
            "name": str(saved.get("name") or payload["name"]),
            "sku": str(saved.get("sku") or payload["sku"]),
            "url": f"https://g-trots.ro/magazin/produs/{slug}/",
        }

    published: list[dict[str, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as executor:
        futures = [executor.submit(publish, payload) for payload in payloads]
        for future in concurrent.futures.as_completed(futures):
            published.append(future.result())
    published.sort(key=lambda item: item["name"].casefold())
    print(json.dumps({"published": len(published), "products": published}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
