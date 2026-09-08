from __future__ import annotations

from ftplib import FTP_TLS
from io import BytesIO
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import json
import os
import secrets
import ssl


REMOTE_ROOT = "/g-trots.ro"
PUBLIC_BASE = "https://g-trots.ro"
TARGET_VERSION = "20260908-nav-v2"


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    # Certificatul hostingului are alt nume DNS; conexiunea FTPS rămâne criptată.
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=90)
    ftp.connect(os.environ["GT_FTP_HOST"], int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.login(os.environ["GT_FTP_USER"], os.environ["GT_FTP_PASS"])
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def migration_source(token: str) -> bytes:
    token_php = json.dumps(token)
    version_php = json.dumps(TARGET_VERSION)
    return f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
set_time_limit(0);
ignore_user_abort(true);
$expectedToken = {token_php};
if (!hash_equals($expectedToken, (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
$target = 'legal-footer.js?v=' . {version_php};
$targetTag = '<script src="/' . $target . '" defer></script>';
$favoritesTarget = 'favorites.js?v=' . {version_php};
$excluded = ['download-app/index.html', 'fact/index.html', 'fs/index.html'];
$result = ['ok' => true, 'scanned' => 0, 'excluded' => 0, 'removed_from_excluded' => 0, 'matched' => 0, 'changed' => 0, 'favorites_changed' => 0, 'inserted' => 0, 'already_current' => 0, 'missing' => [], 'failed' => []];
foreach ($excluded as $relative) {{
    $excludedPath = __DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    if (!is_file($excludedPath)) {{ continue; }}
    $excludedContents = @file_get_contents($excludedPath);
    if ($excludedContents === false || !str_contains($excludedContents, $targetTag)) {{ continue; }}
    $cleaned = str_replace($targetTag, '', $excludedContents);
    $temporary = $excludedPath . '.codex-footer.tmp';
    if (@file_put_contents($temporary, $cleaned, LOCK_EX) !== strlen($cleaned) || !@rename($temporary, $excludedPath)) {{
        @unlink($temporary);
        $result['failed'][] = $relative;
        continue;
    }}
    $result['removed_from_excluded']++;
}}
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator(__DIR__, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::LEAVES_ONLY
);
foreach ($iterator as $file) {{
    if (!$file->isFile() || strtolower($file->getExtension()) !== 'html') {{ continue; }}
    $relative = str_replace('\\\\', '/', str_replace(__DIR__ . DIRECTORY_SEPARATOR, '', $file->getPathname()));
    if (in_array($relative, $excluded, true)) {{ $result['excluded']++; continue; }}
    $result['scanned']++;
    $path = $file->getPathname();
    $contents = @file_get_contents($path);
    if ($contents === false) {{ $result['failed'][] = $path; continue; }}
    $originalContents = $contents;
    $contents = preg_replace('#favorites\\.js\\?v=[^"\\'<>\\s]+#', $favoritesTarget, $contents);
    if (!is_string($contents)) {{ $result['failed'][] = $path; continue; }}
    if ($contents !== $originalContents) {{ $result['favorites_changed']++; }}
    if (!preg_match('#legal-footer\\.js\\?v=[^"\\'<>\\s]+#', $contents)) {{
        $injection = $targetTag;
        $bodyPosition = strripos($contents, '</body>');
        $updated = $bodyPosition === false
            ? $contents . $injection
            : substr($contents, 0, $bodyPosition) . $injection . substr($contents, $bodyPosition);
        $temporary = $path . '.codex-footer.tmp';
        if (@file_put_contents($temporary, $updated, LOCK_EX) !== strlen($updated) || !@rename($temporary, $path)) {{
            @unlink($temporary);
            $result['failed'][] = $path;
            $result['missing'][] = str_replace(__DIR__ . DIRECTORY_SEPARATOR, '', $path);
            continue;
        }}
        $result['matched']++;
        $result['inserted']++;
        continue;
    }}
    $result['matched']++;
    $updated = preg_replace('#legal-footer\\.js\\?v=[^"\\'<>\\s]+#', $target, $contents);
    if (!is_string($updated)) {{ $result['failed'][] = $path; continue; }}
    if ($updated === $originalContents) {{ $result['already_current']++; continue; }}
    $temporary = $path . '.codex-footer.tmp';
    if (@file_put_contents($temporary, $updated, LOCK_EX) !== strlen($updated) || !@rename($temporary, $path)) {{
        @unlink($temporary);
        $result['failed'][] = $path;
        continue;
    }}
    $result['changed']++;
}}
$result['ok'] = count($result['failed']) === 0 && $result['matched'] === $result['scanned'];
echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
""".encode("utf-8")


def main() -> None:
    token = secrets.token_urlsafe(32)
    remote_name = f".codex-footer-migration-{secrets.token_hex(6)}.php"
    ftp = connect()
    try:
        ftp.storbinary(f"STOR {remote_name}", BytesIO(migration_source(token)), blocksize=262144)
        url = f"{PUBLIC_BASE}/{remote_name}?{urlencode({'token': token})}"
        request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots-footer-migration/1.0"})
        try:
            with urlopen(request, timeout=600) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Migrarea a răspuns cu HTTP {error.code}: {details}") from error
        print(json.dumps(result, ensure_ascii=False), flush=True)
        if not result.get("ok"):
            raise RuntimeError(f"Migrarea nu a acoperit toate paginile HTML: {result}")
    finally:
        try:
            ftp.delete(remote_name)
        except Exception:
            pass
        try:
            ftp.quit()
        except Exception:
            ftp.close()


if __name__ == "__main__":
    main()
