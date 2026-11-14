from __future__ import annotations

from datetime import datetime
from ftplib import FTP_TLS, error_perm
from getpass import getpass
from pathlib import Path
from io import BytesIO
import os
import re
import ssl


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RELEASE_ROOT = PROJECT_ROOT / "electron-app" / "release"
REMOTE_ROOT = "/g-trots.ro/download-app/updates/windows"
REMOTE_DOWNLOAD_ROOT = "/g-trots.ro/download-app"
CANONICAL_INSTALLER = "GTrotsSetup.exe"


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    ftp = FTP_TLS(context=context, timeout=120)
    host = os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro")
    username = os.environ.get("GT_FTP_USER", "").strip()
    if not username:
        raise RuntimeError("Lipsește utilizatorul FTPS (GT_FTP_USER).")
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    ftp.connect(host, int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.host = os.environ.get("GT_FTP_TLS_SERVER_NAME", host)
    ftp.login(username, password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    ftp.voidcmd("TYPE I")
    return ftp


def main() -> None:
    metadata = (RELEASE_ROOT / "latest.yml").read_text(encoding="utf-8")
    version_line = next((line for line in metadata.splitlines() if line.startswith("version:")), "")
    version = version_line.partition(":")[2].strip()
    if not version:
        raise RuntimeError("Versiunea nu poate fi citită din latest.yml.")
    names = (f"GTrotsSetup-{version}.exe", f"GTrotsSetup-{version}.exe.blockmap", "latest.yml")
    files = {name: RELEASE_ROOT / name for name in names}
    for name, path in files.items():
        if not path.is_file():
            raise RuntimeError(f"Fișierul de actualizare lipsește: {name}")

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    ftp = connect()
    temporary: dict[str, str] = {}
    latest_backup = f"latest.yml.bak-codex-desktop-{timestamp}"
    latest_was_backed_up = False
    latest_was_activated = False
    try:
        for name, path in files.items():
            remote_temp = f"{name}.codex-upload-{timestamp}.tmp"
            with path.open("rb") as handle:
                ftp.storbinary(f"STOR {remote_temp}", handle, blocksize=1024 * 1024)
            remote_size = ftp.size(remote_temp)
            if remote_size != path.stat().st_size:
                raise RuntimeError(f"Transfer incomplet pentru {name}: {remote_size}/{path.stat().st_size} bytes")
            temporary[name] = remote_temp
            print(f"Verificat: {name} ({remote_size} bytes)", flush=True)

        try:
            ftp.rename("latest.yml", latest_backup)
            latest_was_backed_up = True
        except error_perm as error:
            if not str(error).startswith("550"):
                raise

        # Installerul și blockmap-ul sunt imuabile; latest.yml este activat ultimul.
        for name in names[:2]:
            try:
                ftp.delete(name)
            except error_perm as error:
                if not str(error).startswith("550"):
                    raise
            ftp.rename(temporary[name], name)
            print(f"Publicat: {name}", flush=True)
        ftp.rename(temporary["latest.yml"], "latest.yml")
        latest_was_activated = True
        print("Publicat: latest.yml", flush=True)

        check = BytesIO()
        ftp.retrbinary("RETR latest.yml", check.write)
        if check.getvalue() != files["latest.yml"].read_bytes():
            raise RuntimeError("latest.yml publicat nu corespunde build-ului local.")

        # The updater needs the current versioned installer referenced by
        # latest.yml. The public download page uses one stable canonical name.
        current_installer = files[names[0]]
        ftp.cwd(REMOTE_DOWNLOAD_ROOT)
        canonical_temporary = f".{CANONICAL_INSTALLER}.codex-{timestamp}.tmp"
        canonical_backup = f".{CANONICAL_INSTALLER}.codex-{timestamp}.bak"
        with current_installer.open("rb") as handle:
            ftp.storbinary(
                f"STOR {canonical_temporary}",
                handle,
                blocksize=1024 * 1024,
            )
        if ftp.size(canonical_temporary) != current_installer.stat().st_size:
            raise RuntimeError("Transfer incomplet pentru installerul desktop canonic.")
        canonical_had_original = True
        try:
            ftp.rename(CANONICAL_INSTALLER, canonical_backup)
        except error_perm as error:
            if str(error).startswith("550"):
                canonical_had_original = False
            else:
                raise
        try:
            ftp.rename(canonical_temporary, CANONICAL_INSTALLER)
        except Exception:
            if canonical_had_original:
                ftp.rename(canonical_backup, CANONICAL_INSTALLER)
            raise
        if canonical_had_original:
            try:
                ftp.delete(canonical_backup)
            except error_perm as error:
                if not str(error).startswith("550"):
                    raise
        print(f"Publicat: {CANONICAL_INSTALLER}", flush=True)

        # Keep only the current electron-updater payload. latest.yml and the
        # matching blockmap remain available; all older installers and deploy
        # backups are removed after the new release has been verified.
        ftp.cwd(REMOTE_ROOT)
        current_names = set(names)
        release_pattern = re.compile(
            r"^GTrotsSetup-\d+\.\d+\.\d+\.exe(?:\.blockmap)?$",
            re.IGNORECASE,
        )
        for remote_name in ftp.nlst():
            basename = remote_name.rsplit("/", 1)[-1]
            is_old_release = bool(release_pattern.match(basename)) and basename not in current_names
            is_old_metadata_backup = basename.startswith("latest.yml.bak-")
            if is_old_release or is_old_metadata_backup:
                ftp.delete(basename)
                print(f"Eliminat release desktop vechi: {basename}", flush=True)
    except Exception:
        if latest_was_activated:
            try:
                ftp.delete("latest.yml")
            except Exception:
                pass
        if latest_was_backed_up:
            try:
                ftp.rename(latest_backup, "latest.yml")
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

    print(f"Actualizarea desktop {version} este activa.", flush=True)


if __name__ == "__main__":
    main()
