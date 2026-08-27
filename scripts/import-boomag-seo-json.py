from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import json
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENDPOINT = "https://g-trots.ro/shop-api/api-v2.php"
DEFAULT_STATE = ROOT / "output" / "boomag-seo-json-import-state.json"
ALLOWED_DESCRIPTION_TAGS = {"p", "strong", "b", "em", "i", "ul", "ol", "li", "br"}
SEMANTIC_REPLACEMENTS = (
    (re.compile(r"componenta de tip componentă", re.IGNORECASE), "această componentă"),
)
PROHIBITED_VISIBLE_PATTERNS = (
    re.compile(r"\bboomag(?:\.ro)?\b", re.IGNORECASE),
    re.compile(r"\bgomag(?:cdn)?\b", re.IGNORECASE),
    re.compile(r"\bfeed(?:ul)?\s+(?:furnizor|boomag)\b", re.IGNORECASE),
    re.compile(r"https?://", re.IGNORECASE),
)
ACCESSORY_CATEGORY_NAMES = {
    "accesorii trotinete electrice",
    "antifurt bicicleta cu alarma sau gps",
    "antifurt bicicleta cu cablu din otel",
    "antifurt bicicleta cu lant",
    "benzi anti-grip",
    "casca bicicleta",
    "casti protectie",
    "chei si scule bicicleta",
    "ciclism",
    "genti transport",
    "mansoane",
    "oglinzi",
    "rucsaci si borsete ciclism",
    "scaune",
    "sistem antifurt",
    "sonerii",
    "stickere reflectorizate",
    "suport telefon bicicleta",
}
ACCESSORY_FAMILIES = {"accessory", "bag", "grip", "helmet", "lock", "mirror", "phone_holder", "seat", "sticker"}
ACCESSORY_CHECKS = {
    "helmet": "circumferința capului, sistemul de reglaj, poziția curelelor și confortul fără joc",
    "bag": "volumul util, poziția curelelor, spațiul disponibil și libertatea cablurilor ori a plierii",
    "lock": "dimensiunile, punctul sigur de prindere, tipul închiderii și modul de transport",
    "grip": "diametrul și lungimea ghidonului, forma capetelor și fixarea fără rotire",
    "sticker": "forma, dimensiunea și zona de aplicare, apoi curăță și degresează suprafața",
    "phone_holder": "diametrul ghidonului, dimensiunea telefonului cu husă și libertatea completă a direcției",
    "seat": "punctele și dimensiunile de prindere, înălțimea, stabilitatea și libertatea mecanismului de pliere",
    "mirror": "diametrul ghidonului sau al capătului de ghidon, poziția și câmpul vizual",
    "accessory": "dimensiunile, modul de prindere și spațiul necesar pentru utilizare în siguranță",
}
ACCESSORY_USAGE = {
    "helmet": "Reglează circumferința și curelele astfel încât casca să stea dreaptă, stabilă și confortabilă, fără să limiteze vederea.",
    "bag": "Strânge uniform curelele și alege o poziție care nu apasă cablurile, nu blochează direcția și nu împiedică plierea.",
    "lock": "Fixează antifurtul numai de un punct solid și verifică să nu poată ajunge în roată, frână sau zona de direcție în timpul deplasării.",
    "grip": "Mânșonul trebuie să intre drept și să rămână ferm pe ghidon, fără rotire și fără să împiedice maneta de accelerație ori frână.",
    "sticker": "Aplică accesoriul pe o suprafață curată, uscată și degresată, presează gradual și evită spălarea imediat după lipire.",
    "phone_holder": "Poziționează suportul unde telefonul rămâne vizibil, dar nu acoperă display-ul și nu limitează virarea sau accesul la comenzi.",
    "seat": "Reglează poziția și înălțimea, strânge uniform prinderile și verifică stabilitatea înainte de fiecare deplasare.",
    "mirror": "Reglează oglinda din poziția normală de mers și verifică vederea în spate fără să slăbești controlul ghidonului.",
    "accessory": "Urmează instrucțiunile produsului, fixează accesoriul fără forțare și verifică să nu limiteze comenzile, direcția ori vizibilitatea.",
}
ACCESSORY_CARE = {
    "helmet": "Păstrează casca uscată, ferită de temperaturi extreme și verifică periodic carcasa, căptușeala, catarama și curelele.",
    "bag": "Curăță materialul conform instrucțiunilor și verifică periodic cusăturile, fermoarul și curelele de prindere.",
    "lock": "Păstrează mecanismul curat și uscat, verifică închiderea și nu folosi produsul dacă observi fisuri sau blocaje.",
    "grip": "Curăță mânșoanele cu o lavetă umedă și verifică dacă apar rotire, fisuri sau suprafețe devenite alunecoase.",
    "sticker": "Curăță delicat zona, fără solvenți agresivi și fără jet puternic orientat spre marginile autocolantului.",
    "phone_holder": "Curăță punctele de contact și verifică periodic șuruburile, clema și elementele care țin telefonul.",
    "seat": "Verifică periodic prinderile, articulațiile și suprafețele de contact, mai ales după drumuri denivelate.",
    "mirror": "Curăță lentila cu o lavetă moale și verifică periodic articulația și prinderea pe ghidon.",
    "accessory": "Curăță produsul conform materialului său și verifică periodic prinderile, uzura și stabilitatea.",
}


def clean_string(value: str) -> str:
    result = value
    for pattern, replacement in SEMANTIC_REPLACEMENTS:
        result = pattern.sub(replacement, result)
    return result


def clean_tree(value: Any) -> Any:
    if isinstance(value, str):
        return clean_string(value)
    if isinstance(value, list):
        return [clean_tree(item) for item in value]
    if isinstance(value, dict):
        return {key: clean_tree(item) for key, item in value.items()}
    return value


def is_accessory(product: dict[str, Any]) -> bool:
    category = normalized(product.get("category_name"))
    family = str(product.get("product_family") or "").strip().lower()
    return category in ACCESSORY_CATEGORY_NAMES or family in ACCESSORY_FAMILIES


def accessory_checks(product: dict[str, Any]) -> str:
    family = str(product.get("product_family") or "").strip().lower()
    return ACCESSORY_CHECKS.get(family, ACCESSORY_CHECKS["accessory"])


def accessory_family_text(product: dict[str, Any], values: dict[str, str]) -> str:
    family = str(product.get("product_family") or "").strip().lower()
    return values.get(family, values["accessory"])


def accessory_help_answer(product: dict[str, Any]) -> str:
    code = str(product.get("supplier_sku") or product.get("supplier_external_id") or "").strip()
    checks = accessory_checks(product)
    return (
        f"Pentru reperul {code}, verifică {checks}. "
        "Nu este necesară o programare în service pentru acest accesoriu. "
        "Dacă ai dubii înainte de comandă, echipa G-Trots te poate ajuta să compari dimensiunile și compatibilitatea declarată cu informațiile produsului tău."
    )


def accessory_faq(product: dict[str, Any]) -> list[dict[str, str]]:
    title = str(product.get("title") or "acest accesoriu").strip()
    code = str(product.get("supplier_sku") or product.get("supplier_external_id") or "").strip()
    family = str(product.get("product_family") or "").strip().lower()
    checks = accessory_checks(product)
    usage = accessory_family_text(product, ACCESSORY_USAGE)
    care = accessory_family_text(product, ACCESSORY_CARE)
    brands = [str(value).strip() for value in product.get("compatible_brands_for_filtering") or [] if str(value).strip()]
    brand_copy = ", ".join(brands[:6])
    if family == "helmet":
        compatibility = "Marca trotinetei nu stabilește mărimea căștii. Potrivirea se verifică după circumferința capului, forma interioară, reglaje și informațiile de protecție declarate."
    elif family == "lock":
        compatibility = "Alegerea unui antifurt nu depinde de o singură marcă de trotinetă, ci de dimensiunea elementului prins, tipul punctului fix și modul sigur de transport."
    elif family == "sticker":
        compatibility = f"La acest tip de accesoriu contează forma și dimensiunea exactă a zonei de aplicare. Asocierile cu {brand_copy or 'modelele indicate'} trebuie confirmate după model și revizie."
    else:
        compatibility = f"Nu te baza numai pe marcă. Pentru {brand_copy or 'modelele indicate'}, compară {checks}, deoarece pot exista diferențe între revizii."

    facts = []
    for item in product.get("specifications") or []:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        value = str(item.get("value") or "").strip()
        if normalized(label) in {"denumire produs", "familie produs", "categorie furnizor", "cantitate in feed", "status"}:
            continue
        if normalized(label) == "sku furnizor":
            label = "Cod produs"
        if label and value:
            fact = f"{label}: {value}"
            if normalized(fact) not in {normalized(existing) for existing in facts}:
                facts.append(fact)
        if len(facts) >= 4:
            break
    confirmed = "; ".join(facts) if facts else f"denumirea și codul {code}"
    questions = [
        {
            "question": f"Ce verific înainte să comand produsul „{title}”?",
            "answer": f"Pentru reperul {code}, compară {checks}. Verificarea acestor puncte înainte de cumpărare reduce riscul de a alege o mărime sau o variantă nepotrivită.",
        },
        {
            "question": f"De ce depinde compatibilitatea produsului „{title}”?",
            "answer": compatibility,
        },
        {
            "question": f"Ce specificații sunt confirmate pentru reperul {code}?",
            "answer": f"În fișa produsului sunt confirmate următoarele informații: {confirmed}. Orice caracteristică nemenționată trebuie verificată înainte de comandă și nu este presupusă automat.",
        },
        {
            "question": f"Cum folosesc corect produsul „{title}”?",
            "answer": f"{usage} Pentru reperul {code}, prima utilizare trebuie să fie scurtă și controlată, urmată de o nouă verificare a poziției sau reglajului.",
        },
        {
            "question": f"Ce verific înainte de prima utilizare a reperului {code}?",
            "answer": f"Confirmă din nou {checks}. Accesoriul trebuie să rămână stabil, confortabil și ușor de folosit; dacă observi joc, alunecare ori disconfort, oprește utilizarea și refă reglajul.",
        },
        {
            "question": f"Cum întrețin și păstrez produsul „{title}”?",
            "answer": f"{care} Folosește în continuare codul {code} când ai nevoie să identifici exact această variantă.",
        },
        {
            "question": "Mă poate ajuta G-Trots să aleg corect acest accesoriu?",
            "answer": accessory_help_answer(product),
        },
    ]
    return questions


def fit_accessory_meta_description(value: str, product: dict[str, Any]) -> str:
    result = clean_accessory_text(value, product)
    code = str(product.get("supplier_sku") or product.get("supplier_external_id") or "").strip()
    if len(result) < 120:
        result = f"{result.rstrip(' .')} Reper {code}; verifică dimensiunile și compatibilitatea declarată înainte de comandă."
    if len(result) > 180:
        result = result[:180].rsplit(" ", 1)[0].rstrip(" ,.;:") + "."
    return result


def clean_accessory_text(value: str, product: dict[str, Any], html_mode: bool = False) -> str:
    text = clean_string(value)
    if html_mode:
        guidance = f"<p>{html.escape(accessory_help_answer(product))}</p>"
        replaced = False

        def replace_service_paragraph(match: re.Match[str]) -> str:
            nonlocal replaced
            paragraph = match.group(0)
            if re.search(r"G[\s-]?Trots Service|Recomandare de service", paragraph, re.IGNORECASE):
                if replaced:
                    return ""
                replaced = True
                return guidance
            return paragraph

        text = re.sub(r"<p\b[^>]*>.*?</p>", replace_service_paragraph, text, flags=re.IGNORECASE | re.DOTALL)
        text = re.sub(r"\binterven[^\W\d_]*\b", "fixare", text, flags=re.IGNORECASE)
        text = re.sub(r"\bmontajul\b", "fixarea și reglarea", text, flags=re.IGNORECASE)
        text = re.sub(r"\bmontaj\b", "fixare și reglare", text, flags=re.IGNORECASE)
        text = re.sub(r"\bG[\s-]?Trots Service(?: București)?\b", "echipa G-Trots", text, flags=re.IGNORECASE)
        return text

    sentences = re.split(r"(?<=[.!?])\s+", text)
    kept = [
        sentence for sentence in sentences
        if not re.search(r"G[\s-]?Trots Service|Pentru intervenție|montaj separat", sentence, re.IGNORECASE)
    ]
    text = " ".join(kept).strip()
    text = re.sub(r"\binterven[^\W\d_]*\b", "fixare", text, flags=re.IGNORECASE)
    text = re.sub(r"\bmontajul\b", "fixarea și reglarea", text, flags=re.IGNORECASE)
    text = re.sub(r"\bmontaj\b", "fixare și reglare", text, flags=re.IGNORECASE)
    text = re.sub(r"\bG[\s-]?Trots Service(?: București)?\b", "G-Trots", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


def text_length(value: Any) -> int:
    return len(str(value or "").strip())


def word_count(value: Any) -> int:
    plain = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    return len(re.findall(r"[^\W_]+", plain, flags=re.UNICODE))


def normalized(value: Any) -> str:
    return " ".join(re.findall(r"[^\W_]+", str(value or "").lower(), flags=re.UNICODE))


def fit_meta_title(product: dict[str, Any]) -> str:
    original = clean_string(str(product.get("meta_title") or product.get("title") or "").strip())
    if 35 <= len(original) <= 70:
        return original
    additions = [
        str(product.get("category_name") or "").strip(),
        str(product.get("brand_name") or "").strip(),
        "G-Trots",
    ]
    candidate = original
    for addition in additions:
        if not addition or normalized(addition) in normalized(candidate):
            continue
        separator = " | " if addition == "G-Trots" else " – "
        if len(candidate + separator + addition) <= 70:
            candidate += separator + addition
        if len(candidate) >= 35:
            break
    if len(candidate) < 35 and len(candidate + " | Magazin G-Trots") <= 70:
        candidate += " | Magazin G-Trots"
    if len(candidate) <= 70:
        return candidate
    clipped = candidate[:70].rsplit(" ", 1)[0].rstrip(" –|,.;:")
    return clipped if len(clipped) >= 15 else candidate[:70].rstrip()


def image_alt_texts(product: dict[str, Any]) -> list[str]:
    result = []
    for image in product.get("images") or []:
        if not isinstance(image, dict):
            continue
        alt = clean_string(str(image.get("alt") or image.get("alt_text") or "").strip())
        if alt:
            result.append(alt)
    return result[:12]


def concise_questions(product: dict[str, Any]) -> list[dict[str, str]]:
    title = str(product.get("title") or "").strip()
    accessory = is_accessory(product)
    checks = accessory_checks(product)
    code = str(product.get("supplier_sku") or product.get("supplier_external_id") or "").strip()
    result = []
    source_questions = accessory_faq(product) if accessory else (product.get("questions") or [])
    for item in source_questions:
        if not isinstance(item, dict):
            continue
        question = clean_string(str(item.get("question") or "").strip())
        answer = clean_string(str(item.get("answer") or "").strip())
        if accessory and re.search(r"G[\s-]?Trots Service", question, re.IGNORECASE):
            question = f"Mă poate ajuta G-Trots să aleg corect {title}?"
            answer = accessory_help_answer(product)
        elif accessory and re.search(r"Ce presupune montajul", question, re.IGNORECASE):
            question = f"Cum pregătesc și folosesc corect {title}?"
            answer = (
                f"Pentru reperul {code}, verifică {checks}. "
                "Urmează instrucțiunile produsului, fixează sau reglează accesoriul fără forțare și verifică să nu limiteze vizibilitatea, comenzile ori mișcarea ghidonului. "
                "Prima utilizare trebuie să fie scurtă și controlată, urmată de o nouă verificare a poziției."
            )
        elif accessory and re.search(r"Ce verific după montarea", question, re.IGNORECASE):
            question = f"Ce verific înainte de prima utilizare a reperului {code}?"
            answer = (
                f"Confirmă din nou {checks}. "
                "Accesoriul trebuie să rămână stabil, confortabil și ușor de folosit, fără să incomodeze frânarea, direcția, cablurile sau mecanismul de pliere. "
                "Dacă observi joc, alunecare ori disconfort, oprește utilizarea și refă reglajul."
            )
        elif accessory:
            question = re.sub(r"\bmontaj(?:ul)?\b", "fixare și reglare", question, flags=re.IGNORECASE)
            question = re.sub(r"\bmontarea\b", "fixarea", question, flags=re.IGNORECASE)
            answer = clean_accessory_text(answer, product)
        if len(question) > 180 and title:
            question = re.sub(re.escape(title), "acest produs", question, flags=re.IGNORECASE)
            question = re.sub(r"\s+", " ", question).strip()
        result.append({"question": question, "answer": answer})
    return result


def payload_for(product: dict[str, Any]) -> dict[str, Any]:
    cleaned = clean_tree(product)
    accessory = is_accessory(cleaned)
    short_description = str(cleaned.get("short_description") or "").strip()
    description_html = str(cleaned.get("description_html") or "").strip()
    meta_description = str(cleaned.get("meta_description") or "").strip()
    if accessory:
        short_description = clean_accessory_text(short_description, cleaned)
        description_html = clean_accessory_text(description_html, cleaned, html_mode=True)
        meta_description = fit_accessory_meta_description(meta_description, cleaned)
    return {
        "supplier_external_id": str(cleaned.get("supplier_external_id") or "").strip(),
        "name": str(cleaned.get("title") or "").strip(),
        "slug": str(cleaned.get("slug") or "").strip(),
        "short_description": short_description,
        "description_title": str(cleaned.get("description_title") or "").strip(),
        "description_html": description_html,
        "meta_title": fit_meta_title(cleaned),
        "meta_description": meta_description,
        "specifications": list(cleaned.get("specifications") or []),
        "questions": concise_questions(cleaned),
        "compatibility_names": list(cleaned.get("compatible_brands_for_filtering") or []),
        "image_alt_texts": image_alt_texts(cleaned),
        "research_sources": list(cleaned.get("research_sources") or []),
        "final_catalog": True,
    }


def validate_catalog(catalog_path: Path, validation_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    raw = catalog_path.read_bytes()
    catalog = json.loads(raw.decode("utf-8"))
    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    products = catalog.get("products") if isinstance(catalog, dict) else None
    if not isinstance(products, list) or not products:
        raise RuntimeError("Catalogul nu contine lista products.")
    declared_count = int(catalog.get("product_count") or 0)
    validation_count = int(validation.get("product_count") or 0)
    if declared_count != len(products) or validation_count != len(products):
        raise RuntimeError("Numarul produselor nu coincide intre catalog si raportul de validare.")
    if int(validation.get("file_size_bytes") or 0) != len(raw):
        raise RuntimeError("Dimensiunea catalogului difera de cea validata.")

    errors: list[str] = []
    unique_fields: dict[str, set[str]] = {
        "supplier_external_id": set(),
        "supplier_sku": set(),
        "title": set(),
        "slug": set(),
        "short_description": set(),
        "meta_description": set(),
    }
    payloads: list[dict[str, Any]] = []
    repairs = {"semantic_phrases": 0, "meta_titles": 0}
    for index, product in enumerate(products):
        if not isinstance(product, dict):
            errors.append(f"Pozitia {index}: produs invalid.")
            continue
        external_id = str(product.get("supplier_external_id") or "").strip()
        before = json.dumps(product, ensure_ascii=False)
        payload = payload_for(product)
        after = json.dumps(payload, ensure_ascii=False)
        repairs["semantic_phrases"] += len(re.findall(r"componenta de tip componentă", before, flags=re.IGNORECASE))
        if payload["meta_title"] != str(product.get("meta_title") or "").strip():
            repairs["meta_titles"] += 1
        required = (
            "supplier_external_id", "name", "slug", "short_description", "description_title",
            "description_html", "meta_title", "meta_description",
        )
        for field in required:
            if not str(payload.get(field) or "").strip():
                errors.append(f"Produs {external_id or index}: lipseste {field}.")
        words = word_count(payload["description_html"])
        if not 600 <= words <= 1800:
            errors.append(f"Produs {external_id}: descrierea are {words} cuvinte.")
        if not 90 <= text_length(payload["short_description"]) <= 420:
            errors.append(f"Produs {external_id}: descriere scurta in afara limitei.")
        if not 15 <= text_length(payload["meta_title"]) <= 70:
            errors.append(f"Produs {external_id}: meta titlu in afara limitei.")
        if not 120 <= text_length(payload["meta_description"]) <= 180:
            errors.append(f"Produs {external_id}: meta descriere in afara limitei.")
        if len(payload["specifications"]) < 8:
            errors.append(f"Produs {external_id}: mai putin de 8 specificatii.")
        if not 5 <= len(payload["questions"]) <= 8:
            errors.append(f"Produs {external_id}: numar FAQ invalid.")
        if not payload["research_sources"]:
            errors.append(f"Produs {external_id}: lipsesc sursele de cercetare.")
        if not payload["image_alt_texts"]:
            errors.append(f"Produs {external_id}: lipsesc textele alternative.")
        tags = {match.group(1).lower() for match in re.finditer(r"</?\s*([a-z0-9]+)", payload["description_html"], re.IGNORECASE)}
        unsupported = tags - ALLOWED_DESCRIPTION_TAGS
        if unsupported:
            errors.append(f"Produs {external_id}: taguri HTML nepermise: {', '.join(sorted(unsupported))}.")
        if "componenta de tip componentă" in after.lower():
            errors.append(f"Produs {external_id}: formularea semantica nu a fost curatata.")
        visible_copy = " ".join([
            str(payload["name"]),
            str(payload["short_description"]),
            str(payload["description_title"]),
            str(payload["description_html"]),
            str(payload["meta_title"]),
            str(payload["meta_description"]),
            json.dumps([
                {key: item.get(key) for key in ("group", "label", "value")}
                for item in payload["specifications"] if isinstance(item, dict)
            ], ensure_ascii=False),
            json.dumps([
                {key: item.get(key) for key in ("question", "answer")}
                for item in payload["questions"] if isinstance(item, dict)
            ], ensure_ascii=False),
        ])
        for prohibited in PROHIBITED_VISIBLE_PATTERNS:
            if prohibited.search(visible_copy):
                errors.append(f"Produs {external_id}: continut vizibil cu referinta interna interzisa ({prohibited.pattern}).")
        for source_field, payload_field in (
            ("supplier_external_id", "supplier_external_id"),
            ("supplier_sku", None),
            ("title", "name"),
            ("slug", "slug"),
            ("short_description", "short_description"),
            ("meta_description", "meta_description"),
        ):
            value = product.get(source_field) if payload_field is None else payload.get(payload_field)
            key = normalized(value)
            if not key:
                continue
            if key in unique_fields[source_field]:
                errors.append(f"Produs {external_id}: valoare duplicata pentru {source_field}.")
            unique_fields[source_field].add(key)
        payloads.append(payload)

    if errors:
        sample = "\n".join(errors[:30])
        raise RuntimeError(f"Catalogul are {len(errors)} probleme:\n{sample}")
    return payloads, {
        "products": len(payloads),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "repairs": repairs,
        "description_words": {
            "min": min(word_count(item["description_html"]) for item in payloads),
            "max": max(word_count(item["description_html"]) for item in payloads),
        },
    }


def php_string(source: str, key: str) -> str:
    match = re.search(r"'" + re.escape(key) + r"'\s*=>\s*'((?:\\'|[^'])*)'", source)
    if not match:
        return ""
    return match.group(1).replace("\\'", "'").replace("\\\\", "\\").strip()


def import_key() -> str:
    value = os.environ.get("GTROTS_BOOMAG_IMPORT_KEY", "").strip()
    if value:
        return value
    path = ROOT / "shop-api" / "gomag.local.php"
    value = php_string(path.read_text(encoding="utf-8"), "gomag_api_key") if path.is_file() else ""
    if not value:
        raise RuntimeError("Cheia de import Boomag nu este configurata.")
    return value


def api_key() -> str:
    value = os.environ.get("GTROTS_API_KEY", "").strip()
    if value:
        return value
    env_path = ROOT / ".env"
    if env_path.is_file():
        match = re.search(r"^EXPO_PUBLIC_API_KEY=(.+)$", env_path.read_text(encoding="utf-8"), re.MULTILINE)
        if match:
            return match.group(1).strip()
    raise RuntimeError("Cheia API SHOP nu este configurata.")


def request_json(url: str, payload: dict[str, Any], shop_key: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/json", "X-API-Key": shop_key},
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw).get("error", raw)
        except json.JSONDecodeError:
            detail = raw
        raise RuntimeError(f"HTTP {error.code}: {detail}") from error
    value = json.loads(raw)
    if not isinstance(value, dict) or value.get("error"):
        raise RuntimeError(str(value.get("error") if isinstance(value, dict) else "Raspuns API invalid."))
    return value


def load_state(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {str(key): str(item) for key, item in value.items()} if isinstance(value, dict) else {}


def save_state(path: Path, state: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def payload_digest(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Valideaza si importa catalogul SEO final Boomag.")
    parser.add_argument("catalog", type=Path)
    parser.add_argument("validation", type=Path)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    payloads, report = validate_catalog(args.catalog, args.validation)
    if args.limit > 0:
        payloads = payloads[:args.limit]
    print(json.dumps({"validation": report, "selected": len(payloads)}, ensure_ascii=False), flush=True)
    if args.validate_only:
        return 0

    secret = import_key()
    shop_key = api_key()
    state = load_state(args.state)
    lock = threading.Lock()
    url = args.endpoint + "?" + urllib.parse.urlencode({"action": "saveBoomagSeoProduct"})

    def publish(payload: dict[str, Any]) -> dict[str, Any]:
        external_id = str(payload["supplier_external_id"])
        digest = payload_digest(payload)
        if not args.force and state.get(external_id) == digest:
            return {"id": external_id, "status": "unchanged", "digest": digest}
        body = dict(payload)
        body["import_key"] = secret
        saved = request_json(url, body, shop_key)
        if not str(saved.get("id") or "") or not str(saved.get("description_html") or "").strip():
            raise RuntimeError(f"Produsul {external_id} nu a fost confirmat complet de API.")
        return {
            "id": external_id,
            "status": "published",
            "digest": digest,
            "slug": str(saved.get("slug") or ""),
            "stripe": str(saved.get("stripe_sync_status") or ""),
        }

    published = 0
    unchanged = 0
    failures: list[dict[str, str]] = []
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as executor:
        future_map = {executor.submit(publish, payload): payload for payload in payloads}
        for future in concurrent.futures.as_completed(future_map):
            payload = future_map[future]
            external_id = str(payload["supplier_external_id"])
            try:
                result = future.result()
                with lock:
                    state[external_id] = str(result["digest"])
                    save_state(args.state, state)
                if result["status"] == "published":
                    published += 1
                else:
                    unchanged += 1
            except Exception as error:
                failures.append({"id": external_id, "error": str(error)})
            completed += 1
            if completed % 10 == 0 or completed == len(payloads):
                print(json.dumps({
                    "progress": completed,
                    "total": len(payloads),
                    "published": published,
                    "unchanged": unchanged,
                    "failed": len(failures),
                }, ensure_ascii=False), flush=True)

    result = {
        "validation": report,
        "selected": len(payloads),
        "published": published,
        "unchanged": unchanged,
        "failed": len(failures),
        "failures": failures[:100],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False, indent=2), flush=True)
        raise SystemExit(1)
