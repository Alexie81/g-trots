from __future__ import annotations

from datetime import datetime
from ftplib import FTP_TLS
from pathlib import Path
import os
import ssl


PROJECT_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = PROJECT_ROOT / "shop-api"
REMOTE_ROOT = "/g-trots.ro/shop-api"
FILES = ("api.php", "nir-service.php")


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    # Hostingul folosește un certificat FTPS cu alt nume DNS. Conexiunea rămâne
    # criptată, iar această excepție este limitată la hostul furnizat explicit.
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=90)
    ftp.connect(os.environ["GT_FTP_HOST"], int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.login(os.environ["GT_FTP_USER"], os.environ["GT_FTP_PASS"])
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    ftp.voidcmd("TYPE I")
    return ftp


def main() -> None:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    local_files = {name: API_ROOT / name for name in FILES}
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

        for name in FILES:
            backup = f"{name}.bak-codex-alias-{timestamp}"
            ftp.rename(name, backup)
            backups[name] = backup
            try:
                ftp.rename(temporary_names[name], name)
                activated.append(name)
                print(f"Publicat: {name}", flush=True)
            except Exception:
                ftp.rename(backup, name)
                backups.pop(name, None)
                raise
    except Exception:
        for name in reversed(activated):
            try:
                ftp.rename(name, temporary_names[name])
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
