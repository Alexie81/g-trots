from __future__ import annotations

from datetime import datetime, timezone
from ftplib import FTP_TLS
from getpass import getpass
from io import BytesIO
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import argparse
import hashlib
import json
import os
import secrets
import ssl
import sys
import zipfile


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBSITE_ROOT = PROJECT_ROOT / "website"
REMOTE_ROOT = "/g-trots.ro"
PUBLIC_BASE = "https://g-trots.ro"
EXCLUDED_NAMES = {
    "g-trots-production.zip",
    ".generated-product-pages.json",
    "Thumbs.db",
    ".DS_Store",
}
EXCLUDED_SUFFIXES = (".tmp", ".bak", ".log", ".pyc")
PRODUCT_DISCOVERY_FILES = {
    "agents.md",
    "ai-catalog.json",
    "catalog-produse.html",
    "index.html",
    "llms-full.txt",
    "llms.txt",
    "magazin.html",
    "openai-products.jsonl",
    "openai-products.jsonl.gz",
    "openai-products-status.json",
    "produs.html",
    "robots.txt",
    "sitemap-index.xml",
    "sitemaps/sitemap-produse.xml",
}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publică întregul website G-Trots prin FTPS și extracție ZIP protejată.")
    parser.add_argument("--package-only", action="store_true", help="Construiește și verifică arhiva, fără publicare.")
    parser.add_argument("--keep-package", action="store_true", help="Păstrează arhiva în reports după finalizare.")
    parser.add_argument("--product-discovery-only", action="store_true", help="Publică paginile de produs și fișierele de Product Discovery, fără activele neschimbate ale site-ului.")
    return parser.parse_args()


def iter_public_files(product_discovery_only: bool = False):
    for path in WEBSITE_ROOT.rglob("*"):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(WEBSITE_ROOT)
        if any(part.startswith(".codex-") for part in relative.parts):
            continue
        if path.name in EXCLUDED_NAMES or path.name.endswith(EXCLUDED_SUFFIXES):
            continue
        relative_posix = relative.as_posix()
        if product_discovery_only and relative_posix not in PRODUCT_DISCOVERY_FILES:
            if not (relative_posix.startswith("magazin/produs/") and relative_posix.endswith("/index.html")):
                continue
        yield path, relative


def build_archive(target: Path, product_discovery_only: bool = False) -> dict:
    files = sorted(iter_public_files(product_discovery_only), key=lambda item: item[1].as_posix())
    if not files:
        raise RuntimeError("Website-ul local nu conține fișiere publicabile.")
    total_bytes = 0
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for index, (path, relative) in enumerate(files, start=1):
            archive.write(path, relative.as_posix())
            total_bytes += path.stat().st_size
            if index % 2500 == 0:
                print(f"Arhivare: {index}/{len(files)} fișiere", flush=True)
        manifest = {
            "version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "files": len(files),
            "uncompressed_bytes": total_bytes,
        }
        archive.writestr(".codex-release-manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    with zipfile.ZipFile(target, "r") as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f"Arhiva este coruptă la intrarea {bad}.")
        entries = len(archive.infolist())
    return {
        "files": len(files),
        "entries": entries,
        "uncompressed_bytes": total_bytes,
        "archive_bytes": target.stat().st_size,
        "sha256": digest,
    }


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    # Certificatul furnizorului FTPS nu include numele ftp.cab-it.ro. Fluxul de
    # date rămâne criptat, iar excepția este limitată la conexiunea explicită.
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=180)
    host = os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro")
    username = os.environ.get("GT_FTP_USER", "")
    if not username:
        raise RuntimeError("Lipsește utilizatorul FTPS (GT_FTP_USER).")
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    ftp.connect(host, int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.login(username, password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    ftp.voidcmd("TYPE I")
    return ftp


def extractor_source(token: str, archive_name: str, expected_entries: int, expected_sha256: str) -> bytes:
    token_php = json.dumps(token)
    archive_php = json.dumps(archive_name)
    digest_php = json.dumps(expected_sha256)
    return f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
set_time_limit(0);
ignore_user_abort(true);
$expectedToken = {token_php};
if (!hash_equals($expectedToken, (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
$archiveName = {archive_php};
$archivePath = __DIR__ . DIRECTORY_SEPARATOR . $archiveName;
$action = (string)($_GET['action'] ?? 'check');
if ($action === 'check') {{
    echo json_encode(['ok' => true, 'ziparchive' => class_exists('ZipArchive'), 'archive_exists' => is_file($archivePath)]);
    exit;
}}
if ($action !== 'extract') {{ http_response_code(400); echo json_encode(['ok' => false, 'error' => 'unknown_action']); exit; }}
if (!class_exists('ZipArchive')) {{ http_response_code(500); echo json_encode(['ok' => false, 'error' => 'ziparchive_unavailable']); exit; }}
if (!is_file($archivePath) || hash_file('sha256', $archivePath) !== {digest_php}) {{ http_response_code(409); echo json_encode(['ok' => false, 'error' => 'archive_verification_failed']); exit; }}
$zip = new ZipArchive();
$opened = $zip->open($archivePath);
if ($opened !== true) {{ http_response_code(500); echo json_encode(['ok' => false, 'error' => 'archive_open_failed', 'code' => $opened]); exit; }}
if ($zip->numFiles !== {expected_entries}) {{ $zip->close(); http_response_code(409); echo json_encode(['ok' => false, 'error' => 'entry_count_mismatch']); exit; }}
for ($i = 0; $i < $zip->numFiles; $i++) {{
    $name = (string)$zip->getNameIndex($i);
    $normalized = str_replace('\\\\', '/', $name);
    if ($normalized === '' || str_starts_with($normalized, '/') || preg_match('#(^|/)\\.\\.(/|$)#', $normalized)) {{
        $zip->close(); http_response_code(409); echo json_encode(['ok' => false, 'error' => 'unsafe_archive_entry']); exit;
    }}
    foreach (['shop-api/', 'trotty-api/', 'desktop-update-server/'] as $protected) {{
        if (str_starts_with($normalized, $protected)) {{ $zip->close(); http_response_code(409); echo json_encode(['ok' => false, 'error' => 'protected_path_in_archive']); exit; }}
    }}
}}
$ok = $zip->extractTo(__DIR__);
$entries = $zip->numFiles;
$zip->close();
if (!$ok) {{ http_response_code(500); echo json_encode(['ok' => false, 'error' => 'extract_failed']); exit; }}
@unlink($archivePath);
echo json_encode(['ok' => true, 'entries' => $entries, 'manifest' => is_file(__DIR__ . '/.codex-release-manifest.json')]);
""".encode("utf-8")


def http_json(path: str, token: str, action: str, timeout: int) -> dict:
    url = f"{PUBLIC_BASE}/{path}?{urlencode({'token': token, 'action': action})}"
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots-release/1.0"})
    with urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("Răspuns invalid de la extractorul de producție.")
    return payload


def main() -> None:
    options = arguments()
    reports = PROJECT_ROOT / "reports"
    reports.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="g-trots-release-") as temporary:
        archive = Path(temporary) / "site-release.zip"
        stats = build_archive(archive, options.product_discovery_only)
        print(json.dumps({"package": stats}, ensure_ascii=False), flush=True)
        if options.keep_package:
            kept = reports / "g-trots-site-release.zip"
            kept.write_bytes(archive.read_bytes())
            print(f"Arhivă păstrată: {kept}", flush=True)
        if options.package_only:
            return

        release_id = datetime.now().strftime("%Y%m%d-%H%M%S")
        token = secrets.token_urlsafe(32)
        archive_name = f".codex-site-{release_id}.zip"
        extractor_name = f".codex-deploy-{release_id}.php"
        extractor = extractor_source(token, archive_name, stats["entries"], stats["sha256"])
        ftp = connect()
        try:
            ftp.storbinary(f"STOR {extractor_name}", BytesIO(extractor), blocksize=262144)
            print("Extractor protejat încărcat.", flush=True)
            with archive.open("rb") as handle:
                ftp.storbinary(
                    f"STOR {archive_name}",
                    handle,
                    blocksize=1024 * 1024,
                    callback=lambda _: None,
                )
            remote_size = ftp.size(archive_name)
            if remote_size != stats["archive_bytes"]:
                raise RuntimeError(f"Transfer ZIP incomplet: {remote_size}/{stats['archive_bytes']} bytes")
            print(f"Arhivă încărcată și verificată: {remote_size} bytes", flush=True)

            check = http_json(extractor_name, token, "check", 30)
            if not check.get("ok") or not check.get("ziparchive") or not check.get("archive_exists"):
                raise RuntimeError(f"Serverul nu poate extrage arhiva: {check}")
            print("Capabilitățile serverului sunt verificate; începe publicarea.", flush=True)
            result = http_json(extractor_name, token, "extract", 600)
            if not result.get("ok") or result.get("entries") != stats["entries"] or not result.get("manifest"):
                raise RuntimeError(f"Publicarea nu a putut fi confirmată: {result}")
            print(json.dumps({"published": result, "package": stats}, ensure_ascii=False), flush=True)
        finally:
            for name in (archive_name, extractor_name):
                try:
                    ftp.delete(name)
                except Exception:
                    pass
            try:
                ftp.quit()
            except Exception:
                ftp.close()


if __name__ == "__main__":
    main()
