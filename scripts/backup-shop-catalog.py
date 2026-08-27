from __future__ import annotations

import argparse
import concurrent.futures
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ENDPOINT = "https://g-trots.ro/shop-api/api-v2.php"


def request_json(url: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "G-Trots-Catalog-Backup/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Salvează o copie completă a catalogului SHOP public.")
    parser.add_argument("output", type=Path)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    base = args.endpoint + "?"
    listed = request_json(base + urllib.parse.urlencode({"action": "publicProducts"}))
    if not isinstance(listed, list):
        raise RuntimeError("API-ul nu a returnat lista produselor.")

    def fetch(item: dict[str, Any]) -> dict[str, Any]:
        product_id = str(item.get("id") or "")
        value = request_json(base + urllib.parse.urlencode({"action": "publicProduct", "id": product_id}))
        if not isinstance(value, dict) or str(value.get("id") or "") != product_id:
            raise RuntimeError(f"Produsul {product_id} nu a fost confirmat de API.")
        return value

    products: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as executor:
        for index, product in enumerate(executor.map(fetch, listed), start=1):
            products.append(product)
            if index % 100 == 0 or index == len(listed):
                print(json.dumps({"progress": index, "total": len(listed)}), flush=True)

    document = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "endpoint": args.endpoint,
        "product_count": len(products),
        "products": products,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"saved": str(args.output), "products": len(products)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
