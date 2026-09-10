from __future__ import annotations

from datetime import datetime
from ftplib import FTP_TLS, error_perm
from getpass import getpass
from pathlib import Path, PurePosixPath
import argparse
import os
import ssl


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBSITE_ROOT = PROJECT_ROOT / "website"
REMOTE_ROOT = "/g-trots.ro"
FILES = (
    ".htaccess",
    "robots.txt",
    "agents.md",
    "llms.txt",
    "llms-full.txt",
    "index.html",
    "page.js",
    "search-preload.mjs",
    "script.js",
    "shop-live.js",
    "styles.css",
    "styles.min.css",
    "sitemap.xml",
    "sitemap-index.xml",
    "sitemaps/sitemap-produse.xml",
    "sitemaps/sitemap-articole-01.xml",
    "catalog-produse.html",
    "ai-catalog.json",
    "openai-products.jsonl",
    "openai-products.jsonl.gz",
    "openai-products-status.json",
    "favorites.js",
    "favorites.css",
    "magazin.html",
    "ghiduri-service-trotinete-electrice.html",
    "magazin.js",
    "magazin.css",
    "produs.html",
    "produs.js",
    "produs.css",
    "checkout.css",
    "favorite.html",
    "cos.html",
    "despre-g-trots.html",
    "despre-g-trots.js",
    "despre-g-trots.css",
    "solicita-retur.html",
    "solicita-retur.js",
    "solicita-retur.css",
    "contact.html",
    "contact.css",
    "contact.js",
    "legal-footer.js",
    "google-measurement.js",
    "meta-measurement.js",
    "legal-footer.css",
    "legal-page.js",
    "legal.css",
    "cookie-consent.js",
    "cookie-consent.css",
    "politica-cookies.html",
    "politica-de-confidentialitate.html",
    "garantii-si-reclamatii.html",
    "404.html",
    "accesibilitate.html",
    "baterii-trotinete-electrice.html",
    "blog-service-trotinete-electrice.html",
    "electronica-trotinete-electrice.html",
    "frane-trotinete-electrice.html",
    "livrare-si-plata.html",
    "motoare-trotinete-electrice.html",
    "pene-cauciucuri-trotinete-electrice.html",
    "politica-de-retur.html",
    "probleme-trotinete-electrice.html",
    "probleme-incarcare-trotinete-electrice.html",
    "reparatie-controller-trotineta-electrica.html",
    "schimbare-baterie-trotineta-electrica.html",
    "schimb-anvelopa-trotineta-electrica.html",
    "service-marci-trotinete-electrice.html",
    "service-marci-modele-trotinete-electrice.html",
    "service-scutere-electrice-ghiduri.html",
    "service-trotinete-electrice.html",
    "service-trotinete-electrice-bucuresti.html",
    "service-trotinete-electrice-bucuresti-ilfov.html",
    "service-trotinete-electrice-zone-bucuresti-ilfov.html",
    "siguranta-produselor.html",
    "solutionarea-litigiilor.html",
    "termeni-si-conditii.html",
    "assets/anpc-sal.png",
    "assets/magazin-produse-v1.webp",
    "assets/second-hand-scooters-reconditioned.png",
    "assets/social/despre-g-trots-og.png",
    "login.html",
    "cont.html",
    "cont-nou.html",
    "cont.js",
    "cont.css",
    "checkout.html",
    "checkout.js",
    "checkout-status.js",
    "promotions.js",
    "plata-finalizata.html",
    "plata-esuata.html",
    "urmarire-comanda.html",
    "urmarire-comanda.css",
    "urmarire-comanda.js",
    "search/data/diagnostic-docs.json",
    "search/data/diagnostic-docs.json.gz",
    "search/data/diagnostic-docs.json.br",
    "search/data/instant-core.json",
    "search/data/instant-core.json.gz",
    "search/data/instant-core.json.br",
)


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    # Certificatul hostingului are alt nume DNS; traficul ramane criptat.
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=90)
    ftp.connect(os.environ["GT_FTP_HOST"], int(os.environ.get("GT_FTP_PORT", "21")))
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    ftp.login(os.environ["GT_FTP_USER"], password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    ftp.voidcmd("TYPE I")
    return ftp


def selected_files() -> tuple[str, ...]:
    parser = argparse.ArgumentParser(description="Publică fișiere storefront prin FTPS.")
    parser.add_argument("--files", nargs="+", choices=FILES, help="Publică doar fișierele indicate.")
    arguments = parser.parse_args()
    return tuple(arguments.files) if arguments.files else FILES


def ensure_remote_directory(ftp: FTP_TLS, directory: str) -> None:
    directory = directory.strip("/")
    if not directory or directory == ".":
        return
    root = ftp.pwd()
    try:
        for part in PurePosixPath(directory).parts:
            try:
                ftp.cwd(part)
            except error_perm as error:
                if not str(error).startswith("550"):
                    raise
                ftp.mkd(part)
                ftp.cwd(part)
    finally:
        ftp.cwd(root)


def main() -> None:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    files = selected_files()
    local_files = {name: WEBSITE_ROOT / name for name in files}
    for name, path in local_files.items():
        if not path.is_file():
            raise SystemExit(f"Fisier local lipsa: {name}")

    ftp = connect()
    temporary_names: dict[str, str] = {}
    backups: dict[str, str] = {}
    activated: list[str] = []
    try:
        for name in files:
            ensure_remote_directory(ftp, str(PurePosixPath(name).parent))
        for name, path in local_files.items():
            temporary = f"{name}.codex-upload-{timestamp}.tmp"
            with path.open("rb") as handle:
                ftp.storbinary(f"STOR {temporary}", handle, blocksize=262144)
            remote_size = ftp.size(temporary)
            if remote_size != path.stat().st_size:
                raise RuntimeError(f"Transfer incomplet pentru {name}: {remote_size}/{path.stat().st_size} bytes")
            temporary_names[name] = temporary
            print(f"Verificat: {name} ({remote_size} bytes)", flush=True)

        for name in files:
            backup = f"{name}.bak-codex-storefront-{timestamp}"
            try:
                ftp.rename(name, backup)
                backups[name] = backup
            except error_perm as error:
                if not str(error).startswith("550"):
                    raise
            try:
                ftp.rename(temporary_names[name], name)
                activated.append(name)
                print(f"Publicat: {name}", flush=True)
            except Exception:
                if name in backups:
                    ftp.rename(backups[name], name)
                    backups.pop(name, None)
                raise
    except Exception:
        for name in reversed(activated):
            try:
                ftp.rename(name, temporary_names[name])
                if name in backups:
                    ftp.rename(backups[name], name)
            except Exception:
                pass
        raise
    finally:
        for temporary in temporary_names.values():
            try:
                ftp.delete(temporary)
            except Exception:
                pass
        try:
            ftp.quit()
        except Exception:
            ftp.close()

    print("Storefront publicat cu backup pentru versiunea anterioara.", flush=True)


if __name__ == "__main__":
    main()
