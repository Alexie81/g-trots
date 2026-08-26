from __future__ import annotations

import html
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent / "seo-products"
TARGET_PRODUCTS = 1627
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
    required = ("id", "supplier_external_id", "name", "slug", "short_description", "description_title", "description_html", "meta_title", "meta_description")
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

    unique_fields = ("id", "supplier_external_id", "name", "slug", "short_description", "meta_title", "meta_description")
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

    report = {
        "target_products": TARGET_PRODUCTS,
        "staged_products": len(products),
        "remaining_products": max(0, TARGET_PRODUCTS - len(products)),
        "valid_products": len(products) - len(errors),
        "invalid_products": len(errors),
        "publish_allowed": len(products) == TARGET_PRODUCTS and not errors,
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
