from __future__ import annotations

from datetime import datetime
from ftplib import FTP_TLS
from getpass import getpass
from io import BytesIO
from pathlib import Path
import argparse
import os
import re
import secrets
import ssl


PROJECT_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = PROJECT_ROOT / "shop-api"
REMOTE_ROOT = "/g-trots.ro/shop-api"
FILES = (
    "invoice-export.php",
    "product-export.php",
    "api.php",
    "api-v2.php",
    "product-page-service.php",
    "gomag.php",
    "order-emails.php",
    "order-cancellation.php",
    "order-return.php",
    "order-return-confirmation.php",
    "stripe.php",
    "invoice-theme.php",
    "invoice-service.php",
    "invoice-automation.php",
    "invoice-ubl.php",
    "invoice-xlsx.php",
    "invoice-pdf.php",
    "spv-service.php",
    "spv-runtime.php",
    "spv-cron.php",
    "anaf-oauth-callback.php",
    ".htaccess",
    "nir-domain.php",
    "nir-service.php",
    "nir-bundle.php",
    "nir-pdf.php",
    "nir-xlsx.php",
)


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    # Hostingul folosește un certificat FTPS cu alt nume DNS. Conexiunea rămâne
    # criptată, iar această excepție este limitată la hostul furnizat explicit.
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=90)
    host = os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro")
    username = os.environ.get("GT_FTP_USER", "")
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    if not username:
        raise RuntimeError("Lipsește utilizatorul FTPS (GT_FTP_USER).")
    ftp.connect(host, int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.login(username, password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    ftp.voidcmd("TYPE I")
    return ftp


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publica fisiere SHOP API prin FTPS.")
    parser.add_argument("--files", nargs="+", choices=FILES, help="Publica doar fisierele indicate.")
    parser.add_argument("--configure-spv", action="store_true", help="Configureaza OAuth ANAF exclusiv in config.local.php de pe server.")
    return parser.parse_args()


def php_string(value: str) -> str:
    if "\n" in value or "\r" in value or not value:
        raise RuntimeError("Valoarea de configurare lipseste sau are un format invalid.")
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def set_php_config_value(source: str, key: str, value: str) -> str:
    pattern = re.compile(rf"(?m)(['\"]{re.escape(key)}['\"]\s*=>\s*)['\"][^'\"\r\n]*['\"]")
    replacement = rf"\g<1>{php_string(value)}"
    updated, count = pattern.subn(replacement, source, count=1)
    if count:
        return updated
    closing = source.rfind("];")
    if closing < 0 and re.search(r"return\s+array\s*\(", source):
        closing = source.rfind(");")
    if closing < 0:
        raise RuntimeError("config.local.php nu are formatul asteptat.")
    return source[:closing] + f"    {php_string(key)} => {php_string(value)},\n" + source[closing:]


def configure_spv(ftp: FTP_TLS, timestamp: str) -> None:
    client_id = os.environ.get("GT_ANAF_CLIENT_ID", "").strip() or input("Client ID OAuth ANAF: ").strip()
    client_secret = os.environ.get("GT_ANAF_CLIENT_SECRET", "").strip() or getpass("Client secret OAuth ANAF: ").strip()
    buffer = BytesIO()
    ftp.retrbinary("RETR config.local.php", buffer.write)
    original = buffer.getvalue().decode("utf-8-sig")
    encryption_match = re.search(r"['\"]spv_encryption_key['\"]\s*=>\s*['\"]([^'\"\r\n]+)['\"]", original)
    encryption_key = encryption_match.group(1) if encryption_match and len(encryption_match.group(1)) >= 32 and "replace" not in encryption_match.group(1).lower() else secrets.token_urlsafe(48)
    updated = set_php_config_value(original, "anaf_oauth_client_id", client_id)
    updated = set_php_config_value(updated, "anaf_oauth_client_secret", client_secret)
    updated = set_php_config_value(updated, "spv_encryption_key", encryption_key)
    updated = set_php_config_value(updated, "anaf_oauth_callback_url", "https://g-trots.ro/shop-api/anaf-oauth-callback.php")
    temporary = f"config.local.php.codex-upload-{timestamp}.tmp"
    backup = f"config.local.php.bak-codex-spv-{timestamp}"
    ftp.storbinary(f"STOR {temporary}", BytesIO(updated.encode("utf-8")), blocksize=262144)
    try:
        ftp.rename("config.local.php", backup)
        ftp.rename(temporary, "config.local.php")
    except Exception:
        try:
            ftp.delete(temporary)
        except Exception:
            pass
        if "config.local.php" not in set(ftp.nlst()) and backup in set(ftp.nlst()):
            ftp.rename(backup, "config.local.php")
        raise
    print("Configuratia OAuth ANAF a fost salvata numai in fisierul protejat de pe server.", flush=True)


def main() -> None:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    options = arguments()
    files = tuple(options.files) if options.files else FILES
    local_files = {name: API_ROOT / name for name in files}
    for name, path in local_files.items():
        if not path.is_file():
            raise SystemExit(f"Fișier local lipsă: {name}")

    ftp = connect()
    temporary_names: dict[str, str] = {}
    backups: dict[str, str] = {}
    activated: list[str] = []
    try:
        for name, path in local_files.items():
            temporary = f"{name}.codex-upload-{timestamp}.tmp"
            with path.open("rb") as handle:
                ftp.storbinary(f"STOR {temporary}", handle, blocksize=262144)
            remote_size = ftp.size(temporary)
            if remote_size != path.stat().st_size:
                try:
                    ftp.delete(temporary)
                finally:
                    raise RuntimeError(f"Transfer incomplet pentru {name}: {remote_size}/{path.stat().st_size} bytes")
            temporary_names[name] = temporary
            print(f"Verificat: {name} ({remote_size} bytes)", flush=True)

        remote_files = set(ftp.nlst())
        for name in files:
            backup = f"{name}.bak-codex-alias-{timestamp}"
            if name in remote_files:
                ftp.rename(name, backup)
                backups[name] = backup
            try:
                ftp.rename(temporary_names[name], name)
                activated.append(name)
                print(f"Publicat: {name}", flush=True)
            except Exception:
                if name in backups:
                    ftp.rename(backup, name)
                    backups.pop(name, None)
                raise
        if options.configure_spv:
            configure_spv(ftp, timestamp)
    except Exception:
        for name in reversed(activated):
            try:
                ftp.delete(name)
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

    print("API SHOP publicat cu backup pentru versiunea anterioara.", flush=True)


if __name__ == "__main__":
    main()
