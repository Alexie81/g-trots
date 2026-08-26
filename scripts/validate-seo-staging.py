from __future__ import annotations

import html
import csv
import io
import json
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent / "seo-products"
TARGET_PRODUCTS = 1627
BOOMAG_FEED_URL = "https://www.boomag.ro/feed/doctor-trotineta.csv"
STOP_WORDS = {
    "acest", "aceasta", "această", "aceste", "acestea", "acela", "aceea", "care", "este", "sunt",
    "pentru", "prin", "dintr", "dintre", "intr", "într", "fara", "fără", "dupa", "după", "daca",
    "dacă", "cand", "când", "unei", "unui", "fiind", "poate", "trebuie", "foarte", "mult", "mai",
    "nici", "doar", "toate", "atunci", "pana", "până", "spre", "intre", "între", "asupra", "despre",
    "inainte", "înainte", "produs", "produsul", "trotineta", "trotinetei", "electrica", "electrică",
}


def tokens(value: str) -> list[str]:
    plain = html.unescape(re.sub(r"<[^>]+>", " ", value)).lower()
    return re.findall(r"[^\W_]+", plain, flags=re.UNICODE)


def normalized(value: str) -> str:
    return " ".join(tokens(value))


def shingles(value: str, size: int = 8) -> set[tuple[str, ...]]:
    value_tokens = tokens(value)
    return {
        tuple(value_tokens[index:index + size])
        for index in range(max(0, len(value_tokens) - size + 1))
    }


def scalar(source: str, key: str) -> str:
    match = re.search(r"'" + re.escape(key) + r"'\s*=>\s*'([^']*)'", source)
    return match.group(1).strip() if match else ""


def heredoc(source: str, key: str) -> str:
    match = re.search(
        r"'" + re.escape(key) + r"'\s*=>\s*<<<'HTML'\s*(.*?)\s*HTML,",
        source,
        flags=re.DOTALL,
    )
    return match.group(1).strip() if match else ""


def duplicate_sentence_issues(description: str) -> list[str]:
    with_stops = re.sub(r"</(?:p|li|h[1-6]|blockquote|div)>", ". ", description, flags=re.IGNORECASE)
    plain = html.unescape(re.sub(r"<[^>]+>", " ", with_stops))
    sentences = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", plain).strip())
    counts = Counter(normalized(sentence) for sentence in sentences if len(tokens(sentence)) >= 9)
    return [f"propozitie repetata de {count} ori: {sentence[:120]}" for sentence, count in counts.items() if count > 1]


def repetition_issues(short_description: str, meta_description: str, description: str) -> list[str]:
    issues: list[str] = []
    for label, value in (("descriere scurta", short_description), ("meta descriere", meta_description)):
        counts = Counter(token for token in tokens(value) if len(token) >= 5 and token not in STOP_WORDS)
        for token, count in counts.items():
            if count > 2:
                issues.append(f"{label}: termenul «{token}» apare de {count} ori")

    description_tokens = tokens(description)
    meaningful = Counter(token for token in description_tokens if len(token) >= 5 and token not in STOP_WORDS)
    total = max(1, len(description_tokens))
    for token, count in meaningful.items():
        density = count / total
        if count >= 18 and density > 0.035:
            issues.append(f"densitate prea mare pentru «{token}»: {density * 100:.2f}%")

    for left, right in zip(description_tokens, description_tokens[1:]):
        if left == right and len(left) >= 4:
            issues.append(f"termen duplicat consecutiv: «{left}»")
            break

    phrases = Counter(
        " ".join(description_tokens[index:index + 5])
        for index in range(max(0, len(description_tokens) - 4))
    )
    for phrase, count in phrases.items():
        if count > 3 and not all(part.isdigit() for part in phrase.split()):
            issues.append(f"formularea «{phrase}» apare de {count} ori")
            if len(issues) >= 8:
                break
    issues.extend(duplicate_sentence_issues(description))
    return list(dict.fromkeys(issues))


def parse_product(path: Path) -> dict[str, object]:
    source = path.read_text(encoding="utf-8")
    description = heredoc(source, "description_html")
    questions = re.findall(r"\['question'\s*=>\s*'([^']*)'\s*,\s*'answer'\s*=>\s*'([^']*)'\]", source)
    specifications = re.findall(r"\['group'\s*=>", source)
    sources = re.findall(r"\['label'\s*=>\s*'[^']*'\s*,\s*'url'\s*=>\s*'(https://[^']+)'\]", source)
    image_alts_block = re.search(r"'image_alt_texts'\s*=>\s*\[(.*?)\]\s*,", source, flags=re.DOTALL)
    image_alts = re.findall(r"'([^']+)'", image_alts_block.group(1)) if image_alts_block else []
    return {
        "file": path.name,
        "id": scalar(source, "id"),
        "supplier_external_id": scalar(source, "supplier_external_id"),
        "supplier_sku": scalar(source, "supplier_sku"),
        "ean": scalar(source, "ean"),
        "name": scalar(source, "name"),
        "slug": scalar(source, "slug"),
        "short_description": scalar(source, "short_description"),
        "description_title": scalar(source, "description_title"),
        "description_html": description,
        "meta_title": scalar(source, "meta_title"),
        "meta_description": scalar(source, "meta_description"),
        "word_count": len(tokens(description)),
        "question_count": len(questions),
        "questions": questions,
        "specification_count": len(specifications),
        "source_count": len(set(sources)),
        "image_alt_count": len(image_alts),
        "has_heading_tags": bool(re.search(r"<h[1-6]\b", description, flags=re.IGNORECASE)),
    }


def validate_product(product: dict[str, object]) -> list[str]:
    issues: list[str] = []
    required = ("id", "supplier_external_id", "supplier_sku", "name", "slug", "short_description", "description_title", "description_html", "meta_title", "meta_description")
    for key in required:
        if not str(product[key]).strip():
            issues.append(f"camp obligatoriu lipsa: {key}")
    word_count = int(product["word_count"])
    if not 2500 <= word_count <= 3400:
        issues.append(f"descrierea are {word_count} cuvinte; limita este 2500–3400")
    short_length = len(str(product["short_description"]))
    if not 90 <= short_length <= 420:
        issues.append(f"descrierea scurta are {short_length} caractere")
    meta_title_length = len(str(product["meta_title"]))
    if not 35 <= meta_title_length <= 70:
        issues.append(f"meta titlul are {meta_title_length} caractere")
    meta_description_length = len(str(product["meta_description"]))
    if not 120 <= meta_description_length <= 180:
        issues.append(f"meta descrierea are {meta_description_length} caractere")
    if not 5 <= int(product["question_count"]) <= 8:
        issues.append(f"numar FAQ invalid: {product['question_count']}")
    question_keys = [normalized(question) for question, _ in product["questions"]]
    if len(question_keys) != len(set(question_keys)):
        issues.append("FAQ duplicat in aceeasi fisa")
    if int(product["specification_count"]) < 8:
        issues.append(f"doar {product['specification_count']} specificatii")
    if int(product["source_count"]) < 2:
        issues.append(f"doar {product['source_count']} surse HTTPS distincte")
    if int(product["image_alt_count"]) < 1:
        issues.append("lipsesc textele alternative ale imaginilor")
    if bool(product["has_heading_tags"]):
        issues.append("descrierea contine H1–H6; staging-ul foloseste paragrafe si liste")
    issues.extend(
        repetition_issues(
            str(product["short_description"]),
            str(product["meta_description"]),
            str(product["description_html"]),
        )
    )
    return issues


def main() -> int:
    paths = sorted(ROOT.glob("*.php"))
    products = [parse_product(path) for path in paths]
    errors: dict[str, list[str]] = {}
    for product in products:
        current = validate_product(product)
        if current:
            errors[str(product["file"])] = current

    unique_fields = ("id", "supplier_external_id", "supplier_sku", "name", "slug", "short_description", "meta_title", "meta_description")
    for field in unique_fields:
        owners: dict[str, list[str]] = defaultdict(list)
        for product in products:
            key = normalized(str(product[field])) if field not in {"id", "supplier_external_id"} else str(product[field]).strip()
            if key:
                owners[key].append(str(product["file"]))
        for files in owners.values():
            if len(files) < 2:
                continue
            for filename in files:
                errors.setdefault(filename, []).append(f"camp duplicat intre produse: {field} ({', '.join(files)})")

    # An exact-field check is not enough for color or size variants: a copied
    # description with a handful of replacements would still be low-value.
    # Eight-word shingles catch copied passages while allowing shared technical
    # units, safety terms and product-family vocabulary.
    for left_index, left in enumerate(products):
        left_shingles = shingles(str(left["description_html"]))
        if not left_shingles:
            continue
        for right in products[left_index + 1:]:
            right_shingles = shingles(str(right["description_html"]))
            if not right_shingles:
                continue
            overlap = len(left_shingles & right_shingles) / min(len(left_shingles), len(right_shingles))
            if overlap <= 0.08:
                continue
            errors.setdefault(str(left["file"]), []).append(
                f"descriere prea asemanatoare cu {right['file']}: "
                f"{overlap * 100:.2f}% pasaje identice de 8 cuvinte"
            )
            errors.setdefault(str(right["file"]), []).append(
                f"descriere prea asemanatoare cu {left['file']}: "
                f"{overlap * 100:.2f}% pasaje identice de 8 cuvinte"
            )

    feed_audit: dict[str, object] = {"checked": False}
    if "--verify-feed" in sys.argv:
        raw = urllib.request.urlopen(BOOMAG_FEED_URL, timeout=120).read().decode("utf-8-sig", errors="replace")
        feed_rows = list(csv.DictReader(io.StringIO(raw), delimiter="|"))
        feed_by_id = {str(row.get("id", "")).strip(): row for row in feed_rows if str(row.get("id", "")).strip()}
        staged_by_id = {str(product["supplier_external_id"]): product for product in products}
        missing_ids = sorted(set(feed_by_id) - set(staged_by_id))
        unknown_ids = sorted(set(staged_by_id) - set(feed_by_id))
        identity_mismatches: list[dict[str, str]] = []
        for external_id in sorted(set(feed_by_id) & set(staged_by_id)):
            row = feed_by_id[external_id]
            product = staged_by_id[external_id]
            expected_sku = str(row.get("sku", "")).strip()
            expected_ean = str(row.get("ean", "")).strip()
            if str(product["supplier_sku"]).strip() != expected_sku or str(product["ean"]).strip() != expected_ean:
                identity_mismatches.append({
                    "supplier_external_id": external_id,
                    "expected_sku": expected_sku,
                    "staged_sku": str(product["supplier_sku"]),
                    "expected_ean": expected_ean,
                    "staged_ean": str(product["ean"]),
                })
                errors.setdefault(str(product["file"]), []).append("SKU sau EAN diferit fata de feedul Boomag")
        feed_audit = {
            "checked": True,
            "feed_products": len(feed_by_id),
            "missing_product_count": len(missing_ids),
            "missing_product_ids_sample": missing_ids[:25],
            "unknown_product_count": len(unknown_ids),
            "unknown_product_ids_sample": unknown_ids[:25],
            "identity_mismatches": identity_mismatches,
            "valid": not missing_ids and not unknown_ids and not identity_mismatches,
        }

    report = {
        "target_products": TARGET_PRODUCTS,
        "staged_products": len(products),
        "remaining_products": max(0, TARGET_PRODUCTS - len(products)),
        "valid_products": len(products) - len(errors),
        "invalid_products": len(errors),
        "publish_allowed": len(products) == TARGET_PRODUCTS and not errors and bool(feed_audit.get("checked")) and bool(feed_audit.get("valid")),
        "feed_audit": feed_audit,
        "products": [
            {
                "file": product["file"],
                "supplier_external_id": product["supplier_external_id"],
                "name": product["name"],
                "word_count": product["word_count"],
                "questions": product["question_count"],
                "specifications": product["specification_count"],
                "sources": product["source_count"],
                "valid": str(product["file"]) not in errors,
            }
            for product in products
        ],
        "errors": errors,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
