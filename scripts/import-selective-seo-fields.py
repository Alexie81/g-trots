from __future__ import annotations

import argparse
import concurrent.futures
import importlib.util
import json
import re
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BASE_IMPORTER_PATH = ROOT / "scripts" / "import-boomag-seo-json.py"
DEFAULT_ENDPOINT = "https://g-trots.ro/shop-api/api-v2.php"

# Fișele redactate manual și produsele suplimentare nu sunt înlocuite de un
# catalog generat în masă, chiar dacă acesta trece verificările automate.
EDITORIAL_EXTERNAL_IDS = {"57746", "59894", "59895"}

# Corecturi editoriale pentru singurele fragmente din pachet care au oferit
# informații suficient de concrete, dar aveau nevoie de acord gramatical,
# diferențiere și o formulare mai naturală înainte de publicare.
EDITORIAL_FIELD_OVERRIDES: dict[str, dict[str, str]] = {
    "36139": {
        "meta_description": "Kit de suspensie spate Monorim pentru Xiaomi M365 Pro, destinat ansamblului posterior. Verifică prinderile, geometria și configurația trotinetei înainte de montaj.",
    },
    "38790": {
        "meta_description": "Suspensie față cu cric și aripă pentru Xiaomi M365, M365 Pro și 1S. Verifică prinderile, geometria și compatibilitatea înainte de montaj.",
    },
    "39223": {
        "meta_description": "Baterie de 9,6 Ah compatibilă cu Xiaomi M365, 1S, Essential și Mi 3. Verifică tensiunea, mufa și dimensiunile carcasei înainte de comandă.",
    },
    "42219": {
        "short_description": "Mânerele de ghidon din silicon gri pentru Xiaomi Mi 4 oferă o suprafață de prindere confortabilă. Verifică diametrul și lungimea înainte de montaj.",
    },
    "45459": {
        "short_description": "Motor de 48 V și 1000 W, varianta 6 B34, pentru KuKirin G2 Max. Verifică axul, conectorii, dimensiunea roții și revizia trotinetei înainte de comandă.",
    },
    "46830": {
        "meta_description": "Rulment de direcție 32906 pentru KuKirin G4. Compară diametrul interior, diametrul exterior și înălțimea cu piesa demontată înainte de comandă.",
    },
    "55034": {
        "short_description": "Ghidonul roșu pentru montarea accesoriilor pe trotinetă oferă spațiu suplimentar pentru suporturi sau lumini. Verifică diametrul și sistemul de prindere.",
    },
    "56363": {
        "short_description": "Roată spate motorizată 20 × 4.0, 250 W și 80 Nm pentru bicicleta electrică LITHOR BRAVE. Verifică axul, cablarea și conectorii înainte de montaj.",
    },
    "56370": {
        "short_description": "Rulmentul conic inferior C 32906 pentru KuKirin G4 susține rotația ansamblului de direcție. Compară diametrele și înălțimea cu piesa demontată.",
        "meta_description": "Rulment conic inferior C 32906 pentru KuKirin G4. Compară diametrul interior, diametrul exterior și înălțimea cu piesa demontată înainte de comandă.",
    },
}

STOP_WORDS = {
    "acest", "aceasta", "aceste", "ale", "care", "catre", "cele", "celor",
    "din", "este", "fara", "pentru", "prin", "produs", "produse", "sau",
    "trotineta", "trotinete", "electrica", "electrice", "unui", "unei", "varianta",
}

# Formulările de mai jos au fost identificate în pachet ca șabloane, erori
# gramaticale ori texte care expun identificatori interni în conținutul public.
BLOCKED_PATTERNS = {
    "nume_furnizor": re.compile(r"\b(?:boomag(?:\.ro)?|gomag(?:\.ro)?)\b", re.I),
    "identificator_intern": re.compile(
        r"\b(?:sku(?:-ul)?|ean(?:-ul)?|cod(?:ul)?\s+(?:de\s+)?(?:produs|furnizor)|"
        r"id(?:-ul)?\s+(?:produsului|intern)|feed(?:ul)?|reper(?:ul)?)\b",
        re.I,
    ),
    "eroare_refacerea": re.compile(r"\b(?:rolul\s+de\s+)?refacerea\b", re.I),
    "sablon_inlocuire": re.compile(r"\bînlocuiește\s+o\s+componentă\b", re.I),
    "sablon_alegere": re.compile(r"\balegerea\s+corectă\s+depinde\b", re.I),
    "sablon_varianta": re.compile(r"\bvarianta\s+se\s+recunoaște\b", re.I),
    "sablon_comparatie": re.compile(r"\bse\s+stabilește\s+prin\s+comparație\b", re.I),
    "sablon_meta": re.compile(r"\bverifică\s+potrivirea\s+înainte\s+de\s+comandă\b", re.I),
    "sablon_identificare": re.compile(r"\bpentru\s+identificare,?\s+urmărește\b", re.I),
    "cta_generic": re.compile(r"^(?:alege|comandă|descoperă)\b", re.I),
    "sablon_componenta": re.compile(
        r"\b(?:înlocuirea\s+(?:corectă\s+a\s+)?(?:componentei|elementului)|"
        r"componenta\s+uzată\s+sau\s+deteriorată|unui\s+element\s+exterior\s+uzat)\b",
        re.I,
    ),
    "sablon_reparatie": re.compile(r"\bpentru\s+(?:o\s+)?(?:reparație|realizarea)\s+corectă\b", re.I),
    "sablon_tip_componenta": re.compile(
        r"\b(?:compară\s+tip\s+componentă\s+cu\s+valoarea|"
        r"un\s+detaliu\s+important\s+pentru\s+alegere\s+este\s+tip\s+componentă)\b",
        re.I,
    ),
    "sablon_reper": re.compile(
        r"\b(?:printre\s+reperele\s+ușor\s+de\s+verificat\s+se\s+află|"
        r"dimensiunea\s+sau\s+parametrul)\b",
        re.I,
    ),
    "sablon_compatibilitate": re.compile(
        r"\b(?:compatibilitatea\s+include|poate\s+fi\s+ales\s+pentru.+după\s+confirmarea\s+reviziei)\b",
        re.I,
    ),
    "sablon_protectie": re.compile(
        r"\b(?:protecție\s+personală\s+și\s+confort|echipament\s+de\s+protecție\s+destinat)\b",
        re.I,
    ),
    "eroare_acord": re.compile(r"\b(?:unei|o)\s+trotinetă\s+electrică\b", re.I),
    "repetitie_fraza": re.compile(r"\bîn\s+utilizarea\s+zilnică\s+în\s+utilizarea\s+zilnică\b", re.I),
    "sablon_confort": re.compile(r"\badaugă\s+un\s+plus\s+de\s+confort,?\s+organizare\s+sau\s+funcționalitate\b", re.I),
    "sablon_consulta": re.compile(r"\bconsultă\s+datele\s+tehnice,?\s+confirmă\s+conexiunile\b", re.I),
    "sablon_vezi": re.compile(r"\bvezi\s+detaliile\s+de\s+montaj\b", re.I),
    "sablon_comanda": re.compile(r"\bcomandă\s+informat(?:ă)?\b", re.I),
    "formulare_adauga": re.compile(r"\badaugă\s+(?:personalizarea|securizarea|extinderea)\b", re.I),
    "sablon_accesoriu": re.compile(
        r"\b(?:pentru\s+un\s+plus\s+de\s+confort|oferă\s+o\s+soluție\s+de\s+tip\s+accesoriu|"
        r"este\s+un\s+accesoriu.+util\s+pentru|răspunde\s+nevoii\s+de)\b",
        re.I,
    ),
    "sablon_piesa_schimb": re.compile(r"\bse\s+folosește\s+ca\s+piesă\s+de\s+schimb\b", re.I),
    "sablon_destinat": re.compile(r"^destinat\s+pentru.+trebuie\s+comparat\s+atent\b", re.I),
    "formulare_semnalizare": re.compile(r"\badaugă\s+semnalizarea\b", re.I),
    "eroare_realizarea": re.compile(r"\bde\s+realizarea\b", re.I),
}

SEMANTIC_RULES = (
    (re.compile(r"afișarea\s+informațiilor", re.I), re.compile(r"\b(?:display|dashboard|tablou\s+de\s+bord|panou\s+de\s+control)\b", re.I), re.compile(r"\b(?:cablu|carcasă|carcasa|sticker|folie|capac|protecție|protectie|manetă|maneta|accelerație|acceleratie)\b", re.I)),
    (re.compile(r"gestionarea\s+comenzilor\s+electrice", re.I), re.compile(r"\b(?:controller|controler|plac[ăa]\s+de\s+baz[ăa]|kit.+controller)\b", re.I), re.compile(r"\b(?:cablu|carcasă|carcasa|sticker|folie)\b", re.I)),
    (re.compile(r"alimentarea\s+sistemului\s+electric", re.I), re.compile(r"\b(?:baterie|acumulator)\b", re.I), re.compile(r"\b(?:suport|carcasă|carcasa|bms|garnitur[ăa]|izolare)\b", re.I)),
    (re.compile(r"asigurarea\s+propulsiei", re.I), re.compile(r"\b(?:motor|roată\s+cu\s+motor|roata\s+cu\s+motor)\b", re.I), re.compile(r"\b(?:cablu|senzor|carcasă|carcasa|piuliță|piulita|șaibă|saiba|suport|capac)\b", re.I)),
    (re.compile(r"transmiterea\s+comenzii\s+de\s+accelerație", re.I), re.compile(r"\b(?:accelerație|acceleratie|accelerator|manetă\s+accelerație|maneta\s+acceleratie)\b", re.I), None),
    (re.compile(r"încărcarea\s+unei\s+baterii", re.I), re.compile(r"\b(?:încărcător|incarcator|charger|adaptor\s+încărcător|adaptor\s+incarcator)\b", re.I), None),
    (re.compile(r"ansamblul\s+de\s+direcție", re.I), re.compile(r"\b(?:tijă|tija|coloan[ăa]|cuvete|ghidon|clem[ăa]|furc[ăa])\b", re.I), None),
    (re.compile(r"sistemul\s+de\s+suspensie", re.I), re.compile(r"\b(?:suspensie|furc[ăa])\b", re.I), None),
    (re.compile(r"semnalizarea\s+sonoră", re.I), re.compile(r"\b(?:claxon|sonerie|buton.+claxon)\b", re.I), None),
    (re.compile(r"suprafața\s+de\s+rulare", re.I), re.compile(r"\b(?:cauciuc|anvelop[ăa]|roat[ăa])\b", re.I), None),
    (re.compile(r"rotorului\s+uzat", re.I), re.compile(r"\b(?:disc|frân[ăa])\b", re.I), None),
)


def load_base_importer():
    spec = importlib.util.spec_from_file_location("boomag_selective_base", BASE_IMPORTER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Importatorul principal nu a putut fi încărcat.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BASE = load_base_importer()


def normalized(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text.casefold())).strip()


def public_get_json(url: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "G-Trots-Selective-SEO/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def sentence_count(value: str) -> int:
    return len([part for part in re.split(r"(?<=[.!?])\s+", value.strip()) if part.strip()])


def ngrams(value: str, size: int = 6) -> set[str]:
    words = normalized(value).split()
    return {" ".join(words[index:index + size]) for index in range(max(0, len(words) - size + 1))}


def product_anchors(product: dict[str, Any]) -> set[str]:
    values = [
        product.get("name"),
        product.get("original_name"),
        product.get("brand_name"),
        product.get("seo_product_type_label"),
    ]
    anchors: set[str] = set()
    for value in values:
        for token in normalized(value).split():
            if token in STOP_WORDS or len(token) < 4:
                continue
            anchors.add(token)
    # Modelele și dimensiunile scurte (6H, K1, 140, 10S) sunt foarte utile,
    # chiar dacă au mai puțin de patru caractere.
    raw_name = str(product.get("name") or product.get("original_name") or "")
    anchors.update(normalized(match.group(0)) for match in re.finditer(r"\b(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{2,}\b", raw_name))
    return {value for value in anchors if value}


def identifier_values(product: dict[str, Any]) -> set[str]:
    fields = (
        "supplier_external_id", "supplier_sku", "product_code",
        "supplier_product_code", "ean",
    )
    return {
        normalized(product.get(field))
        for field in fields
        if len(normalized(product.get(field))) >= 4
    }


def semantic_mismatch(value: str, product: dict[str, Any]) -> bool:
    product_name = str(product.get("name") or product.get("original_name") or "")
    for phrase, required_name, excluded_name in SEMANTIC_RULES:
        if not phrase.search(value):
            continue
        if not required_name.search(product_name):
            return True
        if excluded_name is not None and excluded_name.search(product_name):
            return True
    if re.search(r"\bMax\.\s*(?:Consultă|Vezi|Verifică|$)", value):
        return True
    return False


def good_short_sentences(value: str, product: dict[str, Any]) -> str:
    kept: list[str] = []
    identifiers = identifier_values(product)
    for sentence in re.split(r"(?<=[.!?])\s+", value.strip()):
        sentence = sentence.strip()
        if not sentence:
            continue
        if any(pattern.search(sentence) for pattern in BLOCKED_PATTERNS.values()):
            continue
        sentence_normalized = normalized(sentence)
        if any(identifier in sentence_normalized for identifier in identifiers):
            continue
        if semantic_mismatch(sentence, product):
            continue
        kept.append(sentence)
        if len(" ".join(kept)) >= 145 or len(kept) == 2:
            break
    result = " ".join(kept).strip()
    return result if len(result) <= 300 else ""


def rejection_reasons(
    value: str,
    field: str,
    product: dict[str, Any],
) -> list[str]:
    reasons: list[str] = []
    length = len(value.strip())
    limits = (110, 300) if field == "short_description" else (120, 180)
    if not limits[0] <= length <= limits[1]:
        reasons.append(f"lungime_{field}")
    for label, pattern in BLOCKED_PATTERNS.items():
        if pattern.search(value):
            reasons.append(label)
    if semantic_mismatch(value, product):
        reasons.append("nepotrivire_semantica")
    text_normalized = normalized(value)
    for identifier in identifier_values(product):
        if identifier and identifier in text_normalized:
            reasons.append("valoare_identificator_intern")
            break
    sentences = sentence_count(value)
    if field == "short_description" and not 1 <= sentences <= 3:
        reasons.append("numar_propozitii_scurta")
    if field == "meta_description" and not 1 <= sentences <= 2:
        reasons.append("numar_propozitii_meta")
    anchors = product_anchors(product)
    anchor_hits = sum(1 for anchor in anchors if anchor in text_normalized)
    if anchors and anchor_hits < min(2, len(anchors)):
        reasons.append("prea_putine_detalii_specifice")
    words = text_normalized.split()
    if words:
        counts = Counter(words)
        if any(count >= 4 for word, count in counts.items() if len(word) > 4):
            reasons.append("repetitie_excesiva")
    return sorted(set(reasons))


def quality_score(value: str, field: str, product: dict[str, Any]) -> int:
    if not value.strip():
        return -100
    if rejection_reasons(value, field, product):
        return -50
    length = len(value.strip())
    score = 10
    if field == "short_description":
        score += 4 if 145 <= length <= 245 else 2
        score += 3 if sentence_count(value) == 2 else 1
    else:
        score += 4 if 135 <= length <= 165 else 2
        score += 2 if sentence_count(value) in {1, 2} else 0
    text_normalized = normalized(value)
    score += min(5, sum(1 for anchor in product_anchors(product) if anchor in text_normalized))
    if re.search(r"\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|v|w|a|ah|kg|inch|h)\b", value, re.I):
        score += 2
    if re.search(r"\b(?:protecție|control|confort|aderență|frânare|autonomie|siguranță|montaj|compatibilitate)\b", value, re.I):
        score += 1
    return score


def as_public_payload(
    current: dict[str, Any],
    package_product: dict[str, Any],
    fields: dict[str, str],
) -> dict[str, Any]:
    external_id = str(package_product.get("supplier_external_id") or "").strip()
    payload = {
        "supplier_external_id": external_id,
        "sku": str(current.get("sku") or "").strip(),
        "supplier_product_code": str(current.get("sku") or "").strip(),
        "name": str(current.get("name") or "").strip(),
        "slug": str(current.get("slug") or "").strip(),
        "short_description": fields.get("short_description", str(current.get("short_description") or "")),
        "description_title": str(current.get("description_title") or "").strip(),
        "description_html": str(current.get("description_html") or "").strip(),
        "meta_title": str(current.get("meta_title") or "").strip(),
        "meta_description": fields.get("meta_description", str(current.get("meta_description") or "")),
        "specifications": [
            {
                "group": str(item.get("group") or "").strip(),
                "label": str(item.get("label") or "").strip(),
                "value": str(item.get("value") or "").strip(),
            }
            for item in current.get("specifications") or []
            if isinstance(item, dict)
        ],
        "questions": [
            {
                "question": str(item.get("question") or "").strip(),
                "answer": str(item.get("answer") or "").strip(),
            }
            for item in current.get("questions") or []
            if isinstance(item, dict)
        ],
        "compatibility_names": [
            str(item.get("name") or "").strip()
            for item in current.get("brands") or []
            if isinstance(item, dict) and str(item.get("name") or "").strip()
        ],
        "image_alt_texts": [
            str(item.get("alt_text") or "").strip()
            for item in current.get("images") or []
            if isinstance(item, dict) and str(item.get("alt_text") or "").strip()
        ],
        "research_sources": list(package_product.get("research_sources") or []),
        "final_catalog": True,
    }
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Importă selectiv numai descrierile scurte și meta-descrierile SEO validate."
    )
    parser.add_argument("package", type=Path)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--minimum-improvement",
        type=int,
        default=2,
        help="Diferența minimă de scor față de textul actual.",
    )
    args = parser.parse_args()

    document = json.loads(args.package.read_text(encoding="utf-8"))
    package_products = document.get("products") if isinstance(document, dict) else None
    if not isinstance(package_products, list) or not package_products:
        raise RuntimeError("Pachetul nu conține produse.")

    base_url = args.endpoint + "?"
    current_products = public_get_json(base_url + urllib.parse.urlencode({"action": "publicProducts"}))
    if not isinstance(current_products, list):
        raise RuntimeError("API-ul nu a returnat catalogul public.")
    current_by_sku = {
        str(item.get("sku") or "").strip().casefold(): item
        for item in current_products
        if str(item.get("sku") or "").strip()
    }
    current_value_owners: dict[str, dict[str, set[str]]] = {
        field: {}
        for field in ("short_description", "meta_description")
    }
    for item in current_products:
        owner_sku = str(item.get("sku") or "").strip().casefold()
        for field in current_value_owners:
            value = normalized(item.get(field))
            if value:
                current_value_owners[field].setdefault(value, set()).add(owner_sku)

    reason_counts: Counter[str] = Counter()
    changes: list[dict[str, Any]] = []
    proposed_values: dict[str, list[tuple[str, str]]] = {
        "short_description": [],
        "meta_description": [],
    }

    for product in package_products:
        if not isinstance(product, dict):
            reason_counts["produs_invalid"] += 1
            continue
        external_id = str(product.get("supplier_external_id") or "").strip()
        if external_id in EDITORIAL_EXTERNAL_IDS:
            reason_counts["fisa_editoriala_protejata"] += 1
            continue
        validation = product.get("validation") or {}
        if not validation.get("validated") or validation.get("public_copy_forbidden_terms_found"):
            reason_counts["validare_pachet_esuat"] += 1
            continue
        sku = str(product.get("supplier_sku") or product.get("product_code") or "").strip()
        current = current_by_sku.get(sku.casefold())
        if not current:
            reason_counts["produs_absent_catalog_curent"] += 1
            continue

        selected_fields: dict[str, str] = {}
        field_details: dict[str, Any] = {}
        for field in ("short_description", "meta_description"):
            raw_candidate = EDITORIAL_FIELD_OVERRIDES.get(external_id, {}).get(
                field,
                str(product.get(field) or "").strip(),
            )
            candidate = good_short_sentences(raw_candidate, product) if field == "short_description" else raw_candidate
            existing = str(current.get(field) or "").strip()
            reasons = rejection_reasons(candidate, field, product)
            if reasons:
                for reason in reasons:
                    reason_counts[f"{field}:{reason}"] += 1
                continue
            candidate_score = quality_score(candidate, field, product)
            existing_score = quality_score(existing, field, product)
            if normalized(candidate) == normalized(existing):
                reason_counts[f"{field}:identic"] += 1
                continue
            other_owners = current_value_owners[field].get(normalized(candidate), set()) - {sku.casefold()}
            if other_owners:
                reason_counts[f"{field}:duplicat_catalog_curent"] += 1
                continue
            if candidate_score < existing_score + args.minimum_improvement:
                reason_counts[f"{field}:fara_imbunatatire_clara"] += 1
                continue
            selected_fields[field] = candidate
            proposed_values[field].append((external_id, normalized(candidate)))
            field_details[field] = {
                "current": existing,
                "candidate": candidate,
                "current_score": existing_score,
                "candidate_score": candidate_score,
            }

        if selected_fields:
            changes.append({
                "external_id": external_id,
                "product_id": str(current.get("id") or ""),
                "sku": str(current.get("sku") or ""),
                "name": str(current.get("name") or ""),
                "fields": selected_fields,
                "details": field_details,
            })

    # Eliminăm toate valorile duplicate și șabloanele lungi repetate în lotul
    # propus; fiecare fragment public trebuie să rămână distinct la nivel de catalog.
    duplicates: dict[str, set[str]] = {}
    repeated_ngrams: dict[str, set[str]] = {}
    for field, values in proposed_values.items():
        counts = Counter(value for _, value in values)
        duplicates[field] = {value for value, count in counts.items() if count > 1}
        ngram_counts: Counter[str] = Counter()
        for _, value in values:
            ngram_counts.update(ngrams(value))
        limit = 2 if field == "short_description" else 3
        repeated_ngrams[field] = {value for value, count in ngram_counts.items() if count > limit}
    unique_changes: list[dict[str, Any]] = []
    for change in changes:
        fields = dict(change["fields"])
        details = dict(change["details"])
        for field, value in list(fields.items()):
            if normalized(value) in duplicates[field]:
                fields.pop(field)
                details.pop(field, None)
                reason_counts[f"{field}:duplicat_in_lot"] += 1
                continue
            if ngrams(value) & repeated_ngrams[field]:
                fields.pop(field)
                details.pop(field, None)
                reason_counts[f"{field}:sablon_repetat_in_lot"] += 1
        if fields:
            change["fields"] = fields
            change["details"] = details
            unique_changes.append(change)
    changes = unique_changes

    report = {
        "mode": "apply" if args.apply else "dry-run",
        "package": str(args.package),
        "package_product_count": len(package_products),
        "current_product_count": len(current_products),
        "selected_product_count": len(changes),
        "short_description_updates": sum("short_description" in item["fields"] for item in changes),
        "meta_description_updates": sum("meta_description" in item["fields"] for item in changes),
        "rejection_counts": dict(sorted(reason_counts.items())),
        "changes": changes,
    }

    if not args.apply:
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({key: value for key, value in report.items() if key != "changes"}, ensure_ascii=False, indent=2))
        return 0

    shop_key = BASE.api_key()
    import_secret = BASE.import_key()
    save_url = args.endpoint + "?" + urllib.parse.urlencode({"action": "saveBoomagSeoProduct"})

    def publish(change: dict[str, Any]) -> dict[str, str]:
        product_url = base_url + urllib.parse.urlencode({
            "action": "publicProduct",
            "id": change["product_id"],
        })
        current = public_get_json(product_url)
        if not isinstance(current, dict) or str(current.get("id") or "") != change["product_id"]:
            raise RuntimeError("Fișa publică actuală nu a putut fi confirmată.")
        package_product = next(
            product for product in package_products
            if str(product.get("supplier_external_id") or "").strip() == change["external_id"]
        )
        body = as_public_payload(current, package_product, change["fields"])
        body["import_key"] = import_secret
        saved = BASE.request_json(save_url, body, shop_key)
        if str(saved.get("slug") or "").strip() != str(current.get("slug") or "").strip():
            raise RuntimeError("API-ul nu a confirmat slug-ul păstrat.")
        return {"external_id": change["external_id"], "sku": change["sku"]}

    published: list[dict[str, str]] = []
    failures: list[dict[str, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as executor:
        future_map = {executor.submit(publish, change): change for change in changes}
        for completed, future in enumerate(concurrent.futures.as_completed(future_map), start=1):
            change = future_map[future]
            try:
                published.append(future.result())
            except Exception as error:
                failures.append({"external_id": change["external_id"], "error": str(error)})
            if completed % 50 == 0 or completed == len(changes):
                print(json.dumps({
                    "progress": completed,
                    "total": len(changes),
                    "published": len(published),
                    "failed": len(failures),
                }, ensure_ascii=False), flush=True)

    report["published"] = len(published)
    report["failed"] = len(failures)
    report["failures"] = failures
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "changes"}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
