from __future__ import annotations

from ftplib import FTP_TLS, error_perm
from getpass import getpass
from io import BytesIO
from pathlib import Path
import argparse
import os
import secrets
import ssl


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBSITE_ROOT = PROJECT_ROOT / "website"
REMOTE_ROOT = "/g-trots.ro"
ALLOWED_FILES = ("produs.html", "produs.js", "produs.css", "shop-live.js", "theme.css")


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publică atomic fișierele globale ale paginii de produs.")
    parser.add_argument("files", nargs="+", choices=ALLOWED_FILES)
    return parser.parse_args()


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    ftp = FTP_TLS(context=context, timeout=120)
    host = os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro")
    username = os.environ.get("GT_FTP_USER", "")
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    if not username:
        raise RuntimeError("Lipsește utilizatorul FTPS (GT_FTP_USER).")
    ftp.connect(host, int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.host = os.environ.get("GT_FTP_TLS_SERVER_NAME", host)
    ftp.login(username, password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    ftp.voidcmd("TYPE I")
    return ftp


def remove_if_present(ftp: FTP_TLS, name: str) -> None:
    try:
        ftp.delete(name)
    except error_perm as error:
        if not str(error).startswith("550"):
            raise


def upload_atomic(ftp: FTP_TLS, path: Path) -> None:
    payload = path.read_bytes()
    token = secrets.token_hex(6)
    temporary = f".{path.name}.codex-{token}.tmp"
    backup = f".{path.name}.codex-{token}.bak"
    ftp.storbinary(f"STOR {temporary}", BytesIO(payload), blocksize=262144)
    remote_size = ftp.size(temporary)
    if remote_size != len(payload):
        remove_if_present(ftp, temporary)
        raise RuntimeError(f"Verificarea dimensiunii a eșuat pentru {path.name}: {remote_size} != {len(payload)}")

    had_original = True
    try:
        ftp.rename(path.name, backup)
    except error_perm as error:
        if str(error).startswith("550"):
            had_original = False
        else:
            remove_if_present(ftp, temporary)
            raise

    try:
        ftp.rename(temporary, path.name)
    except Exception:
        if had_original:
            ftp.rename(backup, path.name)
        raise
    if had_original:
        remove_if_present(ftp, backup)
    print(f"Publicat: {path.name} ({len(payload)} bytes)", flush=True)


def main() -> None:
    selected = list(dict.fromkeys(arguments().files))
    paths = [WEBSITE_ROOT / name for name in selected]
    missing = [path.name for path in paths if not path.is_file()]
    if missing:
        raise RuntimeError("Lipsesc fișierele locale: " + ", ".join(missing))

    ftp = connect()
    try:
        for path in paths:
            upload_atomic(ftp, path)
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


if __name__ == "__main__":
    main()
