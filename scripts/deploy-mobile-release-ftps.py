from __future__ import annotations

from dataclasses import dataclass
from ftplib import FTP_TLS, error_perm
from getpass import getpass
from io import BytesIO
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import secrets
import ssl


PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_CONFIG = PROJECT_ROOT / "app.json"
MOBILE_ROOT = PurePosixPath("/g-trots.ro/download-app")
API_ROOT = PurePosixPath("/public_html/trotty-api")
CANONICAL_APK = "GTrotsApp.apk"
CANONICAL_URL = f"https://g-trots.ro/download-app/{CANONICAL_APK}"


@dataclass(frozen=True)
class ConnectionSettings:
    host: str
    port: int
    username: str
    password: str


def read_connection_settings() -> ConnectionSettings:
    host = os.environ.get("GT_FTP_HOST", "d108.dataserver.ro")
    username = os.environ.get("GT_FTP_USER", "").strip() or input("Utilizator FTPS: ").strip()
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    if not username or not password:
        raise RuntimeError("Utilizatorul și parola FTPS sunt obligatorii.")
    return ConnectionSettings(
        host=host,
        port=int(os.environ.get("GT_FTP_PORT", "21")),
        username=username,
        password=password,
    )


def connect(settings: ConnectionSettings) -> FTP_TLS:
    ftp = FTP_TLS(context=ssl.create_default_context(), timeout=240)
    ftp.connect(settings.host, settings.port)
    ftp.host = os.environ.get("GT_FTP_TLS_SERVER_NAME", settings.host)
    ftp.login(settings.username, settings.password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.voidcmd("TYPE I")
    return ftp


def ensure_directory(ftp: FTP_TLS, directory: PurePosixPath) -> None:
    ftp.cwd("/")
    for part in directory.parts[1:]:
        try:
            ftp.cwd(part)
        except error_perm as error:
            if not str(error).startswith("550"):
                raise
            ftp.mkd(part)
            ftp.cwd(part)


def delete_if_present(ftp: FTP_TLS, path: PurePosixPath) -> None:
    try:
        ftp.delete(str(path))
    except error_perm as error:
        if not str(error).startswith("550"):
            raise


def upload_atomic(ftp: FTP_TLS, path: PurePosixPath, payload: bytes) -> None:
    ensure_directory(ftp, path.parent)
    token = secrets.token_hex(6)
    temporary = f".{path.name}.codex-{token}.tmp"
    backup = f".{path.name}.codex-{token}.bak"
    ftp.storbinary(f"STOR {temporary}", BytesIO(payload), blocksize=1024 * 1024)
    if ftp.size(temporary) != len(payload):
        delete_if_present(ftp, path.parent / temporary)
        raise RuntimeError(f"Transfer incomplet pentru {path}.")

    had_original = True
    try:
        ftp.rename(path.name, backup)
    except error_perm as error:
        if str(error).startswith("550"):
            had_original = False
        else:
            delete_if_present(ftp, path.parent / temporary)
            raise

    try:
        ftp.rename(temporary, path.name)
    except Exception:
        if had_original:
            ftp.rename(backup, path.name)
        raise

    if had_original:
        delete_if_present(ftp, path.parent / backup)


def retrieve_bytes(ftp: FTP_TLS, path: PurePosixPath) -> bytes:
    payload = BytesIO()
    ftp.retrbinary(f"RETR {path}", payload.write, blocksize=1024 * 1024)
    return payload.getvalue()


def main() -> None:
    app_config = json.loads(APP_CONFIG.read_text(encoding="utf-8"))
    version = str(app_config.get("expo", {}).get("version", "")).strip()
    if not version:
        raise RuntimeError("Versiunea Android lipsește din app.json.")

    source_apk = PROJECT_ROOT / f"gTrots-v{version}.apk"
    if not source_apk.is_file():
        raise RuntimeError(f"APK-ul release lipsește: {source_apk.name}")
    if source_apk.stat().st_size < 1_000_000:
        raise RuntimeError("APK-ul release este prea mic și nu poate fi publicat.")

    source_manifest_path = PROJECT_ROOT / "mobile-latest.json"
    source_manifest = (
        json.loads(source_manifest_path.read_text(encoding="utf-8"))
        if source_manifest_path.is_file()
        else {}
    )
    manifest = {
        "platform": "android",
        "version": version,
        "download_url": f"{CANONICAL_URL}?v={version}",
        "release_notes": source_manifest.get("release_notes", []),
        "mandatory": bool(source_manifest.get("mandatory", False)),
        "created_at": source_manifest.get("created_at", ""),
    }
    manifest_payload = (
        json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
    )
    apk_payload = source_apk.read_bytes()
    local_sha256 = hashlib.sha256(apk_payload).hexdigest()

    settings = read_connection_settings()
    ftp = connect(settings)
    try:
        # Activate the large binary first, then publish both manifests. Older
        # installed applications will therefore never see a new version
        # before its canonical APK is fully available.
        upload_atomic(ftp, MOBILE_ROOT / CANONICAL_APK, apk_payload)
        upload_atomic(ftp, MOBILE_ROOT / "mobile-latest.json", manifest_payload)
        upload_atomic(ftp, API_ROOT / "mobile-latest.json", manifest_payload)

        remote_apk = retrieve_bytes(ftp, MOBILE_ROOT / CANONICAL_APK)
        if hashlib.sha256(remote_apk).hexdigest() != local_sha256:
            raise RuntimeError("APK-ul publicat nu corespunde buildului local.")
        if retrieve_bytes(ftp, API_ROOT / "mobile-latest.json") != manifest_payload:
            raise RuntimeError("Manifestul API publicat nu corespunde release-ului.")

        # The public download directory is dedicated to the current release:
        # keep exactly one APK and exactly one active mobile manifest.
        for name, facts in list(ftp.mlsd(str(MOBILE_ROOT))):
            if facts.get("type") != "file":
                continue
            lower = name.lower()
            obsolete_apk = lower.endswith(".apk") and name != CANONICAL_APK
            obsolete_manifest = lower.startswith("mobile-latest-") and lower.endswith(".json")
            if obsolete_apk or obsolete_manifest:
                delete_if_present(ftp, MOBILE_ROOT / name)
                print(f"Eliminat release mobil vechi: {name}", flush=True)

        print(
            f"Android {version} publicat la {CANONICAL_URL} "
            f"({len(apk_payload)} bytes, sha256 {local_sha256}).",
            flush=True,
        )
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


if __name__ == "__main__":
    main()
