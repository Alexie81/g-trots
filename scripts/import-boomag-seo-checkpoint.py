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


# Denumiri editoriale pentru înregistrările care sunt identice în feed. Nu folosim
# SKU, EAN sau ID-uri interne în titlu; diferențierea rămâne utilă cumpărătorului.
PUBLIC_TITLE_OVERRIDES = {
    "28880": "Cauciuc plin roșu antiexplozie pentru Xiaomi M365",
    "34895": "Etrier de frână pentru Xiaomi Mi Scooter 3",
    "34894": "Etrier de frână Xiaomi Mi Scooter 3 pentru sistemul original",
    "35952": "Cauciuc 10 inch 60/70-6.5 cu bandă silicon antipana",
    "35959": "Display JP Z6 36–60 V pentru trotinetă electrică",
    "36132": "Proiector U5 de 125 W din aluminiu pentru trotinetă electrică",
    "36126": "Cască smart LIVALL C20 cu Bluetooth și iluminare LED",
    "36151": "Proiector U5 de 125 W pentru trotinetă electrică – roșu",
    "38117": "Set 2 capace reflectorizante spate Xiaomi 1S, Essential și Pro 2",
    "38118": "Protecție spiralată pentru cabluri, 110 cm, neagră",
    "38709": "Kit complet de frână hidraulică NUTT față-spate pentru trotinetă",
    "38707": "Kit frână hidraulică față-spate cu 2 manete și 2 etriere",
    "38846": "Controller LIVIAE 36 V pentru trotinetă electrică",
    "38847": "Controller LIVIAE 48 V pentru trotinetă electrică",
    "39122": "Capace reflectorizante spate Xiaomi 1S, Essential și Pro 2",
    "39114": "Furtun extensie pentru pompă de trotinetă și bicicletă",
    "41209": "BMS 10S 36 V 20 A pentru acumulator de trotinetă electrică",
    "41460": "Încărcător 42 V 2 A cu mufă GX12 pentru baterie 36 V",
    "41558": "Încărcător 58,8 V 2 A cu mufă GX16 pentru baterie 52 V",
    "41717": "Anvelopă solidă roșie antipână pentru trotinetă Xiaomi",
    "42743": "Bandă termorezistentă din fibră de sticlă, rolă de 50 m",
    "44183": "Kit 4 frână hidraulică NUTT pentru trotinetă electrică",
    "44190": "Frână hidraulică NUTT Kit 4 pentru trotinetă electrică",
    "45664": "Bandă adezivă din fibră de sticlă, rolă de 50 m",
    "45070": "Kit de aerisire pentru frâne hidraulice de trotinetă și bicicletă",
    "45730": "Cască full face FRV neagră cu protecție integrală",
    "45732": "Cască full face FRV neagră pentru mobilitate urbană",
    "45733": "Cască integrală FRV neagră pentru trotinetă și bicicletă",
    "46453": "Cască integrală INTEGRA Sport negru-verde – 1,06 kg",
    "46789": "Set 2 protecții anti-coliziune EWheel pentru roți – roșu",
    "46790": "Set 2 crash pads EWheel pentru roți de trotinetă – roșu",
    "46786": "Protecții anti-coliziune EWheel pentru roți de trotinetă – set roșu",
    "46794": "Ansamblu de frână hidraulică NUTT Kit 4 pentru trotinetă",
    "46795": "Sistem de frână hidraulică NUTT Kit 4 pentru trotinetă electrică",
    "55076": "Bandă izolatoare din fibră de sticlă, rolă de 50 m",
    "56311": "Cârlig de blocare pliere pentru Xiaomi M365, 1S, Essential și Pro 2",
    "56312": "Cârlig pentru mecanismul de pliere Xiaomi M365, 1S și Pro 2",
    "56313": "Cârlig sistem pliere tijă Xiaomi M365, 1S, Essential și Pro 2",
    "56314": "Cârlig de închidere tijă Xiaomi M365, 1S, Essential și Pro 2",
    "57563": "Tub termocontractabil transparent pentru cabluri și acumulatori",
    "57565": "Tub termocontractabil transparent pentru izolație electrică",
    "57566": "Tub termocontractabil transparent pentru protecția acumulatorului",
    "57747": "Manșon siliconic de protecție pentru maneta de frână",
    "57749": "Protecție din silicon pentru maneta de frână",
    "59802": "Cască full face FRV Street Panther negru mat",
    "59806": "Cască INTEGRA Sport full face negru-verde",
    "59799": "Cască FRV Street Panther full face, negru mat",
    "59800": "Cască integrală FRV Street Panther, negru mat",
    "59801": "Cască full face Street Panther neagră pentru mobilitate urbană",
    "38132": "Încărcător 54,6 V 2 A cu mufă GX16, 3 pini",
    "48113": "Disc de frână 140 mm 6H pentru trotinetă electrică",
    "38917": "Set suspensii spate 120 mm pentru trotinetă electrică",
}


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


def fit_meta_description(value: Any, product: dict[str, Any], public_title: str) -> str:
    result = BASE.remove_public_identifiers(neutralize_supplier_name(value), product)
    source_title = str(product.get("title") or product.get("name") or "").strip()
    if source_title:
        result = re.sub(rf"^{re.escape(source_title)}\s*(?:[:–—-]\s*)?", "", result, flags=re.IGNORECASE)
    result = f"{public_title}. {result}".strip()
    if len(result) < 120:
        result = result.rstrip(" .") + ". Verifică dimensiunile și compatibilitatea înainte de comandă, cu ajutorul echipei G-Trots."
    if len(result) > 180:
        result = result[:180].rsplit(" ", 1)[0].rstrip(" ,.;:") + "."
    return result


def checkpoint_payload(
    item: dict[str, Any],
    feed_sku: str,
    prepared_title: str | None = None,
    prepared_meta_title: str | None = None,
    prepared_short_description: str | None = None,
) -> dict[str, Any]:
    product = dict(item)
    product["title"] = str(item.get("name") or item.get("title") or "").strip()
    accessory = BASE.is_accessory(product)
    product["short_description"] = neutralize_supplier_name(item.get("short_description"))
    if accessory:
        product["short_description"] = BASE.clean_accessory_text(product["short_description"], product)
    product["meta_title"] = neutralize_supplier_name(item.get("meta_title"))
    product["meta_description"] = neutralize_supplier_name(item.get("meta_description"))
    public_title = prepared_title or BASE.base_public_title(product)
    short_description = prepared_short_description or BASE.public_short_description(
        product["short_description"], product, public_title
    )
    if str(item.get("supplier_external_id") or "").strip() in PUBLIC_TITLE_OVERRIDES:
        short_description = BASE.public_short_description(
            product["short_description"], product, public_title
        )
        if BASE.normalized(public_title) not in BASE.normalized(short_description):
            short_description = f"{public_title}. {short_description}"
        if len(short_description) > 420:
            short_description = short_description[:420].rsplit(" ", 1)[0].rstrip(" ,.;:") + "."
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
        if accessory:
            question_text = BASE.clean_accessory_text(question_text, product)
            answer_text = BASE.clean_accessory_text(answer_text, product)
        if 0 < len(question_text) < 18:
            question_text = question_text.rstrip(" ?") + " pentru acest produs?"
        if 0 < len(answer_text) < 60:
            answer_text = answer_text.rstrip(" .") + ". Compară această caracteristică cu piesa sau echipamentul existent înainte de comandă."
        if question_text and answer_text:
            questions.append({"question": question_text, "answer": answer_text})

    specifications = BASE.clean_specifications(product)
    if accessory:
        specifications = [
            specification for specification in specifications
            if BASE.normalized(specification.get("label")) != "interventie"
        ]
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
        "description_html": (
            neutralize_supplier_name(item.get("description_html"))
            + neutralize_supplier_name(item.get("description_append_html"))
            + neutralize_supplier_name(item.get("description_extra_html"))
        ),
        "meta_title": prepared_meta_title or BASE.fit_meta_title(product, public_title),
        "meta_description": fit_meta_description(
            product["meta_description"],
            product,
            prepared_meta_title or BASE.fit_meta_title(product, public_title),
        ),
        "specifications": specifications,
        "questions": questions,
        "compatibility_names": compatibility_names,
        "image_alt_texts": BASE.image_alt_texts(product),
        "research_sources": list(item.get("research_sources") or []),
        "final_catalog": True,
    }
    if accessory:
        payload["description_html"] = BASE.clean_accessory_text(
            payload["description_html"], product, html_mode=True
        )
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
    parser.add_argument(
        "--failure-report",
        type=Path,
        help="Scrie într-un fișier JSON produsele care nu au putut fi publicate.",
    )
    parser.add_argument(
        "--compact-output",
        action="store_true",
        help="Afișează doar rezumatul publicării, fără lista completă de produse.",
    )
    parser.add_argument(
        "--ids-file",
        type=Path,
        help="Publică doar ID-urile enumerate într-un fișier JSON sau text, câte unul pe linie.",
    )
    parser.add_argument(
        "--skip-missing-feed",
        action="store_true",
        help="Ignoră produsele retrase din feedul public curent și raportează ID-urile lor.",
    )
    args = parser.parse_args()

    document = json.loads(args.checkpoint.read_text(encoding="utf-8"))
    products = document.get("products") if isinstance(document, dict) else None
    if not isinstance(products, list) or not products:
        raise RuntimeError("Checkpoint-ul nu conține produse.")
    feed_skus = BASE.public_feed_sku_map()
    eligible_items: list[dict[str, Any]] = []
    errors: list[str] = []
    skipped_missing_feed: list[str] = []
    for item in products:
        external_id = str(item.get("supplier_external_id") or "").strip()
        feed_sku = feed_skus.get(external_id)
        if not feed_sku:
            if args.skip_missing_feed:
                skipped_missing_feed.append(external_id)
            else:
                errors.append(f"{external_id}: produsul nu are SKU în feedul public curent")
            continue
        eligible_items.append(item)

    if args.ids_file:
        raw_ids = args.ids_file.read_text(encoding="utf-8")
        try:
            decoded_ids = json.loads(raw_ids)
        except json.JSONDecodeError:
            decoded_ids = [line.strip() for line in raw_ids.splitlines() if line.strip()]
        if isinstance(decoded_ids, dict):
            decoded_ids = decoded_ids.get("ids") or [item.get("id") for item in decoded_ids.get("failures") or []]
        selected_ids = {str(value).strip() for value in decoded_ids or [] if str(value).strip()}
        eligible_items = [
            item for item in eligible_items
            if str(item.get("supplier_external_id") or "").strip() in selected_ids
        ]

    prepared_titles = BASE.prepare_public_titles(eligible_items)
    prepared_meta_titles = BASE.prepare_public_meta_titles(eligible_items, prepared_titles)
    prepared_short_descriptions = BASE.prepare_public_short_descriptions(eligible_items, prepared_titles)
    payloads: list[dict[str, Any]] = []
    for item in eligible_items:
        external_id = str(item.get("supplier_external_id") or "").strip()
        editorial_title = PUBLIC_TITLE_OVERRIDES.get(external_id, prepared_titles.get(external_id))
        editorial_meta_title = (
            BASE.fit_meta_title(
                dict(item, title=editorial_title, meta_title=editorial_title),
                editorial_title,
            )
            if external_id in PUBLIC_TITLE_OVERRIDES
            else prepared_meta_titles.get(external_id)
        )
        payload = checkpoint_payload(
            item,
            feed_skus[external_id],
            editorial_title,
            editorial_meta_title,
            prepared_short_descriptions.get(external_id),
        )
        errors.extend(validate_payload(payload))
        payloads.append(payload)
    if errors:
        raise RuntimeError("Checkpoint invalid:\n" + "\n".join(errors))
    if args.dry_run:
        print(json.dumps({
            "validated": len(payloads),
            "skipped_missing_feed": skipped_missing_feed,
        }, ensure_ascii=False))
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
    failures: list[dict[str, str]] = []
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as executor:
        future_map = {executor.submit(publish, payload): payload for payload in payloads}
        for future in concurrent.futures.as_completed(future_map):
            payload = future_map[future]
            try:
                published.append(future.result())
            except Exception as error:
                failures.append({
                    "id": str(payload.get("supplier_external_id") or ""),
                    "error": str(error),
                })
            completed += 1
            if completed % 50 == 0 or completed == len(payloads):
                print(json.dumps({
                    "progress": completed,
                    "total": len(payloads),
                    "published": len(published),
                    "failed": len(failures),
                }, ensure_ascii=False), flush=True)
    published.sort(key=lambda item: item["name"].casefold())
    result = {
        "published": len(published),
        "failed": len(failures),
        "failures": failures,
        "skipped_missing_feed": skipped_missing_feed,
    }
    if not args.compact_output:
        result["products"] = published
    if args.failure_report:
        args.failure_report.parent.mkdir(parents=True, exist_ok=True)
        args.failure_report.write_text(json.dumps({
            "ids": [item["id"] for item in failures],
            "failures": failures,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
