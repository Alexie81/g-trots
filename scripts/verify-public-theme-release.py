"""Read-only production verification. Never creates orders or sends email."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.request import Request, urlopen
import json

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://g-trots.ro"
VERSION = "20260920-public-theme-v11"
ASSETS = ["theme.css", "theme.js", "legal-footer.js", "order-experience.css",
          "checkout-status.js", "urmarire-comanda.js", "produs.js", "produs.css"]
ROUTES = ["/", "/magazin", "/contact", "/login", "/cont", "/cont-nou", "/cos", "/favorite",
          "/plata-finalizata", "/plata-esuata", "/urmarire-comanda",
          "/magazin/produs/controller-original-kukirin-g2-model-2025/"]


def fetch(path):
    request = Request(BASE + path, headers={"User-Agent": "G-Trots-release-verification/1.0",
                                          "Cache-Control": "no-cache"})
    with urlopen(request, timeout=45) as response:
        return response.status, response.read()


def asset(name):
    status, payload = fetch("/" + name + "?v=" + VERSION)
    local = (ROOT / "website" / name).read_bytes()
    result = {"asset": name, "status": status, "sha256": sha256(payload).hexdigest(),
              "matches_local": payload == local}
    return result


def page(route):
    status, payload = fetch(route)
    html = payload.decode("utf-8")
    return {"route": route, "status": status,
            "theme_version": all(f"/{name}?v={VERSION}" in html
                                 for name in ("theme.css", "theme.js", "legal-footer.js")),
            "first_paint_device_theme": "prefers-color-scheme: dark" in html,
            "product_drag_version": "produs.js?v=20260920-related-drag-v1" in html
            if "/magazin/produs/" in route else None,
            "order_styles": ("order-experience.css" in html)
            if route in ("/plata-finalizata", "/plata-esuata", "/urmarire-comanda") else None}


with ThreadPoolExecutor(max_workers=5) as pool:
    assets = list(pool.map(asset, ASSETS))
    pages = list(pool.map(page, ROUTES))
result = {"verified_at": datetime.now(timezone.utc).isoformat(), "assets": assets, "pages": pages}
output = ROOT / "reports/order-experience-20260920/production-verification.json"
output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
assert all(x["status"] == 200 and x["matches_local"] for x in assets), assets
assert all(x["status"] == 200 and x["theme_version"] and x["first_paint_device_theme"]
           and x["order_styles"] is not False and x["product_drag_version"] is not False
           for x in pages), pages
print(f"Production verified: {len(assets)} exact asset hashes, {len(pages)} routes; {output}")
