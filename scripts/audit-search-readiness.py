#!/usr/bin/env python3
"""Fail-fast audit for public search, Product schema and clean URLs."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


BASE_URL = "https://g-trots.ro"
PRIVATE_STEMS = {
    "404",
    "checkout",
    "cont",
    "cont-nou",
    "cos",
    "favorite",
    "login",
    "plata-esuata",
    "plata-finalizata",
    "produs",
    "resetare-parola",
    "shop-indisponibil",
    "solicita-retur",
    "urmarire-comanda",
}

TITLE_RE = re.compile(r"<title\b[^>]*>(.*?)</title>", re.I | re.S)
DESCRIPTION_RE = re.compile(
    r'<meta\b[^>]*\bname=["\']description["\'][^>]*\bcontent=["\']([^"\']*)["\'][^>]*>',
    re.I | re.S,
)
ROBOTS_RE = re.compile(
    r'<meta\b[^>]*\bname=["\']robots["\'][^>]*\bcontent=["\']([^"\']*)["\'][^>]*>',
    re.I | re.S,
)
CANONICAL_RE = re.compile(
    r'<link\b[^>]*\brel=["\']canonical["\'][^>]*\bhref=["\']([^"\']+)["\'][^>]*>',
    re.I | re.S,
)
H1_RE = re.compile(r"<h1\b", re.I)
JSONLD_RE = re.compile(
    r'<script\b[^>]*\btype=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
HTML_URL_RE = re.compile(r'(?:href|src)=["\']([^"\']+\.html(?:[?#][^"\']*)?)["\']', re.I)
MEASUREMENT_RE = re.compile(r'(?:google-measurement|legal-footer)\.js', re.I)
SITEMAP_LOC_RE = re.compile(r"<loc>(.*?)</loc>", re.I | re.S)


def expected_url(root: Path, file_path: Path) -> str:
    relative = file_path.relative_to(root).as_posix()
    if relative == "index.html":
        return BASE_URL + "/"
    if relative.endswith("/index.html"):
        return BASE_URL + "/" + relative[: -len("index.html")]
    return BASE_URL + "/" + relative[: -len(".html")]


def schema_nodes(value):
    if isinstance(value, list):
        for item in value:
            yield from schema_nodes(item)
    elif isinstance(value, dict):
        yield value
        graph = value.get("@graph")
        if isinstance(graph, list):
            for item in graph:
                yield from schema_nodes(item)


def type_contains(value, expected: str) -> bool:
    if isinstance(value, list):
        return expected in value
    return value == expected


def valid_gtin(value: object) -> bool:
    gtin = re.sub(r"\D+", "", str(value or ""))
    if len(gtin) not in {8, 12, 13, 14}:
        return False
    if gtin.startswith(("2", "02", "04", "98", "99")):
        return False
    total = 0
    weight = 3
    for digit in reversed(gtin[:-1]):
        total += int(digit) * weight
        weight = 1 if weight == 3 else 3
    return (10 - total % 10) % 10 == int(gtin[-1])


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--website", type=Path, default=Path(__file__).resolve().parents[1] / "website")
    parser.add_argument("--json-output", type=Path)
    parser.add_argument("--max-examples", type=int, default=25)
    parser.add_argument("--product-only", action="store_true", help="Auditează rapid numai paginile generate de produs.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.website.resolve()
    failures: dict[str, list[str]] = {}
    warnings: dict[str, list[str]] = {}
    counts = {
        "html_files": 0,
        "public_indexable": 0,
        "private_noindex": 0,
        "product_pages": 0,
        "product_schema_valid": 0,
        "internal_html_urls": 0,
        "sitemap_urls": 0,
    }

    def record(target: dict[str, list[str]], kind: str, value: str):
        target.setdefault(kind, [])
        if len(target[kind]) < args.max_examples:
            target[kind].append(value)

    for file_path in root.rglob("*.html"):
        relative = file_path.relative_to(root).as_posix()
        if file_path.name.lower().startswith("google") and file_path.stat().st_size < 1024:
            continue
        if args.product_only and not (relative.startswith("magazin/produs/") and relative.endswith("/index.html")):
            continue
        counts["html_files"] += 1
        try:
            html = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            record(failures, "invalid_utf8", relative)
            continue

        stem = file_path.stem.lower()
        is_private = stem in PRIVATE_STEMS and "/magazin/produs/" not in "/" + relative
        robots_match = ROBOTS_RE.search(html)
        robots = robots_match.group(1).lower() if robots_match else ""
        is_noindex = "noindex" in robots

        if is_private:
            if not is_noindex:
                record(failures, "private_missing_noindex", relative)
            else:
                counts["private_noindex"] += 1
            continue

        if is_noindex:
            record(failures, "public_noindex", relative)
            continue
        counts["public_indexable"] += 1

        if not TITLE_RE.search(html):
            record(failures, "missing_title", relative)
        if not DESCRIPTION_RE.search(html):
            record(failures, "missing_description", relative)
        canonical_match = CANONICAL_RE.search(html)
        if not canonical_match:
            record(failures, "missing_canonical", relative)
        else:
            canonical = canonical_match.group(1).strip()
            if ".html" in urlparse(canonical).path.lower():
                record(failures, "canonical_contains_html", f"{relative}: {canonical}")
            expected = expected_url(root, file_path)
            if canonical.rstrip("/") != expected.rstrip("/"):
                record(warnings, "canonical_not_self", f"{relative}: {canonical} != {expected}")
        if not H1_RE.search(html):
            record(failures, "missing_h1", relative)
        if not MEASUREMENT_RE.search(html):
            record(failures, "missing_measurement_loader", relative)

        html_urls = HTML_URL_RE.findall(html)
        if html_urls:
            counts["internal_html_urls"] += len(html_urls)
            record(failures, "html_extension_url", f"{relative}: {html_urls[0]}")

        normalized = "/" + relative
        if normalized.startswith("/magazin/produs/") and normalized.endswith("/index.html"):
            counts["product_pages"] += 1
            product_nodes = []
            for raw in JSONLD_RE.findall(html):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError as error:
                    record(failures, "invalid_jsonld", f"{relative}: {error}")
                    continue
                product_nodes.extend(node for node in schema_nodes(parsed) if type_contains(node.get("@type"), "Product"))
            if not product_nodes:
                record(failures, "product_schema_missing", relative)
                continue
            product = product_nodes[0]
            for gtin_key in ("gtin8", "gtin12", "gtin13", "gtin14", "gtin"):
                if gtin_key in product and not valid_gtin(product[gtin_key]):
                    record(failures, "product_gtin_invalid", f"{relative}: {gtin_key}={product[gtin_key]}")
            offers = product.get("offers")
            if isinstance(offers, list):
                offers = offers[0] if offers else None
            if not isinstance(offers, dict) or not type_contains(offers.get("@type"), "Offer"):
                record(failures, "product_offer_missing", relative)
                continue
            try:
                price = float(offers.get("price", 0))
            except (TypeError, ValueError):
                price = 0
            currency = str(offers.get("priceCurrency", "")).upper()
            availability = str(offers.get("availability", ""))
            if price <= 0:
                record(failures, "product_price_invalid", relative)
            elif currency != "RON":
                record(failures, "product_currency_invalid", f"{relative}: {currency}")
            elif availability not in {
                "https://schema.org/InStock",
                "https://schema.org/OutOfStock",
                "https://schema.org/PreOrder",
                "https://schema.org/BackOrder",
            }:
                record(failures, "product_availability_invalid", f"{relative}: {availability}")
            else:
                counts["product_schema_valid"] += 1

    for sitemap_path in [root / "sitemap.xml", *(root / "sitemaps").glob("*.xml")]:
        if not sitemap_path.is_file():
            continue
        xml = sitemap_path.read_text(encoding="utf-8")
        for loc in SITEMAP_LOC_RE.findall(xml):
            counts["sitemap_urls"] += 1
            if ".html" in urlparse(loc.strip()).path.lower():
                record(failures, "sitemap_contains_html", f"{sitemap_path.name}: {loc.strip()}")

    product_sitemap = (root / "sitemaps" / "sitemap-produse.xml").read_text(encoding="utf-8")
    product_urls = {loc.strip().rstrip("/") for loc in SITEMAP_LOC_RE.findall(product_sitemap)}
    if len(product_urls) != counts["product_pages"]:
        record(
            failures,
            "product_sitemap_count_mismatch",
            f"pages={counts['product_pages']} sitemap_unique={len(product_urls)}",
        )

    result = {
        "success": not failures,
        "website": str(root),
        "counts": counts,
        "failure_counts": {key: len(values) for key, values in failures.items()},
        "failures": failures,
        "warning_counts": {key: len(values) for key, values in warnings.items()},
        "warnings": warnings,
    }
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    print(rendered)
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(rendered + "\n", encoding="utf-8")
    return 0 if result["success"] else 1


if __name__ == "__main__":
    sys.exit(main())
