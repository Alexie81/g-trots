from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_ENDPOINT = "https://g-trots.ro/shop-api/api-v2.php"


def load_codes(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(payload, list):
        raise ValueError("Fișierul trebuie să conțină un array JSON simplu.")
    codes: list[str] = []
    seen: set[str] = set()
    for item in payload:
        if not isinstance(item, (str, int, float)) or isinstance(item, bool):
            raise ValueError("Lista conține o valoare care nu este cod de produs.")
        code = str(item).strip()
        if not code:
            raise ValueError("Lista conține un cod gol.")
        key = code.casefold()
        if key in seen:
            raise ValueError(f"Cod duplicat în listă: {code}")
        seen.add(key)
        codes.append(code)
    if not codes:
        raise ValueError("Lista produselor recomandate este goală.")
    return codes


def request_json(url: str, body: dict[str, Any], api_key: str, import_key: str) -> Any:
    request = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-API-Key": api_key,
            "X-Import-Key": import_key,
            "User-Agent": "G-Trots-Featured-Products/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        try:
            details = json.loads(payload)
        except json.JSONDecodeError:
            details = {"error": payload or f"HTTP {error.code}"}
        raise RuntimeError(json.dumps(details, ensure_ascii=False)) from error


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Aplică în catalog lista ordonată a produselor recomandate."
    )
    parser.add_argument("json_file", type=Path)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--import-key", required=True)
    args = parser.parse_args()

    codes = load_codes(args.json_file)
    url = args.endpoint + "?" + urllib.parse.urlencode({"action": "applyFeaturedProducts"})
    result = request_json(url, {"codes": codes}, args.api_key, args.import_key)
    if not isinstance(result, dict) or not result.get("success"):
        raise RuntimeError("API-ul nu a confirmat aplicarea listei.")

    print(json.dumps({
        "success": True,
        "requested_count": len(codes),
        "featured_count": int(result.get("featured_count") or 0),
        "first_product": (result.get("products") or [{}])[0].get("name"),
        "last_product": (result.get("products") or [{}])[-1].get("name"),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
