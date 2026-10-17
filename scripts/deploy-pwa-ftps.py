from __future__ import annotations

from ftplib import FTP_TLS, error_perm
from getpass import getpass
from io import BytesIO
from pathlib import Path, PurePosixPath
from dataclasses import dataclass
import json
import os
import secrets
import ssl


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BUILD_ROOT = PROJECT_ROOT / "dist"
REMOTE_ROOT = PurePosixPath("/g-trots.ro/aplicatie")
DEPLOY_MANIFEST = ".gtrots-pwa-deploy.json"


@dataclass(frozen=True)
class ConnectionSettings:
    host: str
    port: int
    username: str
    password: str


def read_connection_settings() -> ConnectionSettings:
    # ftp.cab-it.ro currently presents a certificate issued only for this
    # cPanel hostname. Use the certified endpoint so FTPS remains verified.
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
    ftp = FTP_TLS(context=ssl.create_default_context(), timeout=180)
    ftp.connect(settings.host, settings.port)
    ftp.host = os.environ.get("GT_FTP_TLS_SERVER_NAME", settings.host)
    ftp.login(settings.username, settings.password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.voidcmd("TYPE I")
    return ftp


def close_quietly(ftp: FTP_TLS | None) -> None:
    if ftp is None:
        return
    try:
        ftp.quit()
    except Exception:
        try:
            ftp.close()
        except Exception:
            pass


def ensure_remote_directory(ftp: FTP_TLS, directory: PurePosixPath) -> None:
    ftp.cwd("/")
    for part in directory.parts[1:]:
        try:
            ftp.cwd(part)
        except error_perm as error:
            if not str(error).startswith("550"):
                raise
            ftp.mkd(part)
            ftp.cwd(part)


def remove_if_present(ftp: FTP_TLS, remote_path: PurePosixPath) -> None:
    try:
        ftp.delete(str(remote_path))
    except error_perm as error:
        if not str(error).startswith("550"):
            raise


def upload_atomic(ftp: FTP_TLS, local_path: Path, relative_path: PurePosixPath) -> None:
    payload = local_path.read_bytes()
    remote_path = REMOTE_ROOT / relative_path
    ensure_remote_directory(ftp, remote_path.parent)

    # Recover safely if a previous FTPS session ended between the temporary
    # upload and the final rename for this exact file.
    artifact_prefix = f".{remote_path.name}.codex-"
    names = {PurePosixPath(name).name for name in ftp.nlst()}
    artifacts = sorted(name for name in names if name.startswith(artifact_prefix))
    if remote_path.name not in names:
        matching_temporary = next(
            (
                name
                for name in artifacts
                if name.endswith(".tmp") and ftp.size(name) == len(payload)
            ),
            None,
        )
        backup = next((name for name in artifacts if name.endswith(".bak")), None)
        recoverable = matching_temporary or backup
        if recoverable:
            ftp.rename(recoverable, remote_path.name)
            names.add(remote_path.name)
            artifacts.remove(recoverable)
    if remote_path.name in names:
        for artifact in artifacts:
            remove_if_present(ftp, remote_path.parent / artifact)

    token = secrets.token_hex(6)
    temporary = f".{remote_path.name}.codex-{token}.tmp"
    backup = f".{remote_path.name}.codex-{token}.bak"
    ftp.storbinary(f"STOR {temporary}", BytesIO(payload), blocksize=262144)
    if ftp.size(temporary) != len(payload):
        remove_if_present(ftp, remote_path.parent / temporary)
        raise RuntimeError(f"Dimensiune invalidă după upload: {relative_path}")

    had_original = True
    try:
        ftp.rename(remote_path.name, backup)
    except error_perm as error:
        if str(error).startswith("550"):
            had_original = False
        else:
            remove_if_present(ftp, remote_path.parent / temporary)
            raise

    try:
        ftp.rename(temporary, remote_path.name)
    except Exception:
        if had_original:
            ftp.rename(backup, remote_path.name)
        raise

    if had_original:
        remove_if_present(ftp, remote_path.parent / backup)


def read_previous_files(ftp: FTP_TLS) -> set[str]:
    payload = BytesIO()
    try:
        ftp.retrbinary(f"RETR {REMOTE_ROOT / DEPLOY_MANIFEST}", payload.write)
    except error_perm as error:
        if str(error).startswith("550"):
            return set()
        raise
    try:
        data = json.loads(payload.getvalue().decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return set()
    return {str(item) for item in data.get("files", []) if isinstance(item, str)}


def safe_relative_path(value: str) -> PurePosixPath | None:
    path = PurePosixPath(value)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        return None
    return path


def main() -> None:
    if not (BUILD_ROOT / "index.html").is_file() or not (BUILD_ROOT / "manifest.json").is_file():
        raise RuntimeError("Buildul PWA lipsește. Rulează mai întâi: npm run build:pwa")

    local_files = sorted(path for path in BUILD_ROOT.rglob("*") if path.is_file())
    relative_files = {
        path.relative_to(BUILD_ROOT).as_posix()
        for path in local_files
        if path.name != DEPLOY_MANIFEST
    }

    settings = read_connection_settings()
    ftp: FTP_TLS | None = connect(settings)
    try:
        ensure_remote_directory(ftp, REMOTE_ROOT)
        previous_files = read_previous_files(ftp)

        for index, local_path in enumerate(local_files, start=1):
            # This host periodically closes long command-heavy FTP sessions.
            # Fresh verified FTPS sessions keep large PWA deploys deterministic.
            if index > 1 and (index - 1) % 20 == 0:
                close_quietly(ftp)
                ftp = connect(settings)
            relative = PurePosixPath(local_path.relative_to(BUILD_ROOT).as_posix())
            upload_atomic(ftp, local_path, relative)
            print(f"[{index}/{len(local_files)}] {relative}", flush=True)

        deploy_payload = json.dumps(
            {"version": 1, "files": sorted(relative_files)},
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        temporary_manifest = BUILD_ROOT / DEPLOY_MANIFEST
        temporary_manifest.write_bytes(deploy_payload)
        try:
            upload_atomic(ftp, temporary_manifest, PurePosixPath(DEPLOY_MANIFEST))
        finally:
            temporary_manifest.unlink(missing_ok=True)

        for stale in sorted(previous_files - relative_files, reverse=True):
            relative = safe_relative_path(stale)
            if relative is None:
                continue
            remove_if_present(ftp, REMOTE_ROOT / relative)
            print(f"Eliminat fișier vechi: {relative}", flush=True)

        print(f"PWA publicată: https://g-trots.ro/aplicatie/ ({len(relative_files)} fișiere)", flush=True)
    finally:
        close_quietly(ftp)


if __name__ == "__main__":
    main()
