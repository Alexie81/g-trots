"""Compare the six deployed email files without reading customer data/config."""
from datetime import datetime, timezone
from hashlib import sha256
from importlib.util import spec_from_file_location, module_from_spec
from io import BytesIO
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location("gt_email_deploy", ROOT / "scripts/deploy-shop-api-ftps.py")
deploy = module_from_spec(spec)
spec.loader.exec_module(deploy)
files = ["email-presentation.php", "order-emails.php", "order-admin-notifications.php",
         "newsletter.php", "invoice-service.php", "email-image.php"]
ftp = deploy.connect()
results = []
try:
    for name in files:
        received = BytesIO()
        ftp.retrbinary("RETR " + name, received.write)
        content = received.getvalue()
        results.append({"file": name, "sha256": sha256(content).hexdigest(),
                        "matches_local": content == (ROOT / "shop-api" / name).read_bytes()})
finally:
    ftp.quit()
output = ROOT / "reports/order-experience-20260920/email-production-verification.json"
output.write_text(json.dumps({"verified_at": datetime.now(timezone.utc).isoformat(),
                              "files": results}, indent=2), encoding="utf-8")
assert all(result["matches_local"] for result in results), results
print("All six deployed email files match the tested local files exactly.")
