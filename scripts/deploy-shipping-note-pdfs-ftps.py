from __future__ import annotations

from datetime import datetime
from ftplib import FTP_TLS, error_perm
from pathlib import Path
import os
import ssl


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REMOTE_ROOT = "/g-trots.ro/avize"
FILES = {
    "model-aviz-g-trots-cu-stampila.pdf": PROJECT_ROOT / "docs" / "templates" / "aviz-expeditie-marfa-g-trots-cu-stampila.pdf",
    "model-aviz-g-trots-fara-stampila.pdf": PROJECT_ROOT / "docs" / "templates" / "aviz-expeditie-marfa-g-trots-fara-stampila.pdf",
}


def connect() -> FTP_TLS:
    host = os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro")
    username = os.environ.get("GT_FTP_USER", "").strip()
    password = os.environ.get("GT_FTP_PASS", "")
    if not username or not password:
        raise RuntimeError("Lipsesc GT_FTP_USER sau GT_FTP_PASS.")
    ftp = FTP_TLS(context=ssl.create_default_context(), timeout=90)
    ftp.connect(host, int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.host = os.environ.get("GT_FTP_TLS_SERVER_NAME", host)
    ftp.login(username, password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd("/g-trots.ro")
    try:
        ftp.cwd("avize")
    except error_perm as error:
        if not str(error).startswith("550"):
            raise
        ftp.mkd("avize")
        ftp.cwd("avize")
    ftp.voidcmd("TYPE I")
    return ftp


def main() -> None:
    for path in FILES.values():
        if not path.is_file() or path.stat().st_size <= 0:
            raise RuntimeError(f"PDF local lipsă: {path}")

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    ftp = connect()
    temporary: dict[str, str] = {}
    backups: dict[str, str] = {}
    activated: list[str] = []
    try:
        for name, path in FILES.items():
            remote_temp = f"{name}.codex-upload-{timestamp}.tmp"
            with path.open("rb") as handle:
                ftp.storbinary(f"STOR {remote_temp}", handle, blocksize=262144)
            if ftp.size(remote_temp) != path.stat().st_size:
                raise RuntimeError(f"Transfer incomplet pentru {name}.")
            temporary[name] = remote_temp
            print(f"Verificat: {name} ({path.stat().st_size} bytes)", flush=True)

        remote = set(ftp.nlst())
        for name in FILES:
            if name in remote:
                backup = f"{name}.bak-codex-aviz-{timestamp}"
                ftp.rename(name, backup)
                backups[name] = backup
            ftp.rename(temporary[name], name)
            activated.append(name)
            print(f"Publicat: {name}", flush=True)
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
        for remote_temp in temporary.values():
            try:
                ftp.delete(remote_temp)
            except Exception:
                pass
        try:
            ftp.quit()
        except Exception:
            ftp.close()

    print(f"PDF-urile model sunt active în {REMOTE_ROOT}.", flush=True)


if __name__ == "__main__":
    main()
