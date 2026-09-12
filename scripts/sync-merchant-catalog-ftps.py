from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from ftplib import FTP_TLS
from getpass import getpass
from io import BytesIO
import argparse
import json
import os
import re
import secrets
import ssl
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError


REMOTE_ROOT = "/g-trots.ro/shop-api"
PUBLIC_ROOT = "https://g-trots.ro/shop-api"


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=90)
    password = os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: ")
    ftp.connect(os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro"), int(os.environ.get("GT_FTP_PORT", "21")))
    ftp.login(os.environ["GT_FTP_USER"], password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def request_json(url: str, timeout: int = 120) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots Merchant catalog sync"})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"HTTP {error.code}: {body or error.reason}") from error


def chunks(values: list[str], size: int) -> list[list[str]]:
    return [values[index:index + size] for index in range(0, len(values), size)]


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sincronizeaza catalogul Google Merchant prin API-ul protejat.")
    parser.add_argument("--diagnose-only", action="store_true", help="Citeste starea si erorile existente fara a trimite produse.")
    parser.add_argument("--repair-images", action="store_true", help="Reface imaginile Boomag lipsa si resincronizeaza produsele afectate.")
    parser.add_argument(
        "--resync-disapproved-images",
        action="store_true",
        help="Resincronizeaza numai produsele blocate de procesarea imaginilor si realiniaza sursa Merchant.",
    )
    return parser.parse_args()


def main() -> None:
    options = arguments()
    token = secrets.token_urlsafe(32)
    filename = f"merchant-catalog-sync-{secrets.token_hex(8)}.php"
    php = f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!hash_equals('{token}', (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
define('GTROTS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';
try {{
    $config = shopConfig();
    if (!merchantIsConfigured($config)) throw new RuntimeException('Google Merchant nu este configurat.');
    $db = shopDb($config);
    $mode = (string)($_GET['mode'] ?? 'stats');
    if ($mode === 'bootstrap') {{
        ensureShopSchema($db);
        echo json_encode(['ok' => true, 'schema_ready' => true]);
        exit;
    }}
    if ($mode === 'register') {{
        try {{
            $registration = merchantRegisterGcp($config);
            echo json_encode(['ok' => true, 'registered' => true, 'result' => $registration], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }} catch (Throwable $error) {{
            if (stripos($error->getMessage(), 'already') === false) throw $error;
            echo json_encode(['ok' => true, 'registered' => true, 'already_registered' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }}
        exit;
    }}
    if ($mode === 'plan') {{
        $ids = array_values(array_map('strval', $db->query('SELECT id FROM shop_products ORDER BY id ASC')->fetchAll(PDO::FETCH_COLUMN)));
        $representativeIds = function_exists('catalogRepresentativeProductIds') ? array_keys(catalogRepresentativeProductIds($db)) : $ids;
        echo json_encode(['ok' => true, 'product_ids' => $ids, 'representative_ids' => $representativeIds, 'total' => count($ids)]);
        exit;
    }}
    if ($mode === 'merchant-products') {{
        $account = merchantAccountName($config);
        $expectedDataSource = merchantDataSourceName($config);
        $pageToken = '';
        $pages = 0;
        $accountTotal = 0;
        $dataSourceTotal = 0;
        $withoutDestinations = 0;
        $destinationSummary = [];
        $issueSummary = [];
        $issueSamples = [];
        $issueSamplesByCode = [];
        $issueOfferIdsByKey = [];
        $merchantOfferIds = [];
        do {{
            $url = 'https://merchantapi.googleapis.com/products/v1/' . $account . '/products?pageSize=1000';
            if ($pageToken !== '') $url .= '&pageToken=' . rawurlencode($pageToken);
            $response = merchantRequest($config, 'GET', $url);
            $pages++;
            foreach ((array)($response['products'] ?? []) as $product) {{
                $accountTotal++;
                if ((string)($product['dataSource'] ?? '') !== $expectedDataSource) continue;
                $dataSourceTotal++;
                $offerId = (string)($product['offerId'] ?? '');
                if ($offerId !== '') $merchantOfferIds[$offerId] = true;
                $statuses = (array)($product['productStatus']['destinationStatuses'] ?? []);
                if (!$statuses) $withoutDestinations++;
                foreach ($statuses as $status) {{
                    $context = (string)($status['reportingContext'] ?? 'UNSPECIFIED');
                    if (!isset($destinationSummary[$context])) {{
                        $destinationSummary[$context] = ['approved_ro' => 0, 'pending_ro' => 0, 'disapproved_ro' => 0];
                    }}
                    if (in_array('RO', (array)($status['approvedCountries'] ?? []), true)) $destinationSummary[$context]['approved_ro']++;
                    if (in_array('RO', (array)($status['pendingCountries'] ?? []), true)) $destinationSummary[$context]['pending_ro']++;
                    if (in_array('RO', (array)($status['disapprovedCountries'] ?? []), true)) $destinationSummary[$context]['disapproved_ro']++;
                }}
                foreach ((array)($product['productStatus']['itemLevelIssues'] ?? []) as $issue) {{
                    $key = implode('|', [
                        (string)($issue['severity'] ?? 'UNSPECIFIED'),
                        (string)($issue['reportingContext'] ?? 'UNSPECIFIED'),
                        (string)($issue['code'] ?? 'unknown'),
                    ]);
                    $issueSummary[$key] = ($issueSummary[$key] ?? 0) + 1;
                    if ($offerId !== '') $issueOfferIdsByKey[$key][$offerId] = true;
                    if (count($issueSamples) < 12) {{
                        $issueSamples[] = [
                            'offer_id' => (string)($product['offerId'] ?? ''),
                            'link' => (string)($product['productAttributes']['link'] ?? ''),
                            'image_link' => (string)($product['productAttributes']['imageLink'] ?? ''),
                            'severity' => (string)($issue['severity'] ?? ''),
                            'context' => (string)($issue['reportingContext'] ?? ''),
                            'code' => (string)($issue['code'] ?? ''),
                            'description' => (string)($issue['description'] ?? ''),
                        ];
                    }}
                    $issueCode = (string)($issue['code'] ?? 'unknown');
                    if (count($issueSamplesByCode[$issueCode] ?? []) < 3) {{
                        $issueSamplesByCode[$issueCode][] = [
                            'offer_id' => (string)($product['offerId'] ?? ''),
                            'title' => (string)($product['productAttributes']['title'] ?? ''),
                            'link' => (string)($product['productAttributes']['link'] ?? ''),
                            'image_link' => (string)($product['productAttributes']['imageLink'] ?? ''),
                            'severity' => (string)($issue['severity'] ?? ''),
                            'context' => (string)($issue['reportingContext'] ?? ''),
                            'description' => (string)($issue['description'] ?? ''),
                        ];
                    }}
                }}
            }}
            $pageToken = trim((string)($response['nextPageToken'] ?? ''));
        }} while ($pageToken !== '' && $pages < 20);
        ksort($destinationSummary);
        arsort($issueSummary);
        foreach ($issueOfferIdsByKey as $key => $offerIds) {{
            $issueOfferIdsByKey[$key] = array_keys($offerIds);
        }}
        ksort($issueOfferIdsByKey);
        $databaseOfferIds = function_exists('catalogRepresentativeProductIds')
            ? catalogRepresentativeProductIds($db)
            : array_fill_keys(array_map('strval', $db->query('SELECT id FROM shop_products')->fetchAll(PDO::FETCH_COLUMN)), true);
        $unexpectedOfferIds = array_values(array_diff(array_keys($merchantOfferIds), array_keys($databaseOfferIds)));
        $missingOfferIds = array_values(array_diff(array_keys($databaseOfferIds), array_keys($merchantOfferIds)));
        echo json_encode([
            'ok' => true,
            'account_total' => $accountTotal,
            'data_source_total' => $dataSourceTotal,
            'expected_data_source' => $expectedDataSource,
            'without_destinations' => $withoutDestinations,
            'unexpected_offer_ids' => $unexpectedOfferIds,
            'missing_offer_ids' => $missingOfferIds,
            'destination_summary' => $destinationSummary,
            'issue_summary' => $issueSummary,
            'issue_offer_ids_by_key' => $issueOfferIdsByKey,
            'issue_samples' => $issueSamples,
            'issue_samples_by_code' => $issueSamplesByCode,
            'pages' => $pages,
            'pagination_complete' => $pageToken === '',
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }}
    if ($mode === 'repair-images') {{
        set_time_limit(0);
        $offset = max(0, (int)($_GET['offset'] ?? 0));
        $limit = max(1, min(10, (int)($_GET['limit'] ?? 10)));
        echo json_encode(boomagRepairProductImagesBatch($db, $config, $offset, $limit), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }}
    if ($mode === 'image-files') {{
        $paths = $db->query('SELECT product_id, image_path FROM shop_product_images ORDER BY product_id, sort_order')->fetchAll();
        $existing = 0;
        $missing = 0;
        $samples = [];
        foreach ($paths as $row) {{
            $relative = ltrim(str_replace('\\\\', '/', (string)$row['image_path']), '/');
            $absolute = __DIR__ . '/' . $relative;
            $present = is_file($absolute) && filesize($absolute) >= 500;
            if ($present) $existing++; else $missing++;
            if (count($samples) < 8 || in_array((string)$row['product_id'], ['37f88f21-0ad1-5d97-80d0-367824e81922', '5b887cfb-ff87-58b7-9488-8eb2c6136de6'], true)) {{
                $samples[] = [
                    'product_id' => (string)$row['product_id'],
                    'image_path' => (string)$row['image_path'],
                    'present' => $present,
                    'size' => $present ? filesize($absolute) : 0,
                ];
            }}
        }}
        echo json_encode([
            'ok' => true,
            'database_images' => count($paths),
            'existing_files' => $existing,
            'missing_files' => $missing,
            'directory_files' => count(glob(__DIR__ . '/uploads/products/*') ?: []),
            'public_base_url' => (string)($config['public_base_url'] ?? ''),
            'samples' => array_slice($samples, -12),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }}
    if ($mode === 'sync') {{
        $ids = array_values(array_filter(array_map('trim', explode(',', (string)($_GET['ids'] ?? '')))));
        if (count($ids) > 5) throw new RuntimeException('Lotul depaseste limita de 5 produse.');
        $GLOBALS['merchant_skip_catalog_dedup'] = true;
        $results = [];
        foreach ($ids as $id) $results[] = ['product_id' => $id, ...merchantSyncProductSafe($db, $config, $id)];
        echo json_encode(['ok' => true, 'results' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }}
    if ($mode === 'delete') {{
        $ids = array_values(array_filter(array_map('trim', explode(',', (string)($_GET['ids'] ?? '')))));
        if (count($ids) > 5) throw new RuntimeException('Lotul depaseste limita de 5 produse.');
        $results = [];
        foreach ($ids as $id) {{
            try {{
                $deleted = merchantDeleteProduct($config, $id);
                merchantRecordProductSync($db, $id, null);
                $results[] = ['product_id' => $id, ...$deleted, 'reason' => 'public_catalog_duplicate'];
            }} catch (Throwable $error) {{
                merchantRecordProductSync($db, $id, $error->getMessage());
                $results[] = ['product_id' => $id, 'status' => 'error', 'error' => $error->getMessage()];
            }}
        }}
        echo json_encode(['ok' => true, 'results' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }}
    $row = $db->query("SELECT COUNT(*) AS total, SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active_total, SUM(CASE WHEN merchant_synced_at IS NOT NULL AND merchant_sync_error IS NULL THEN 1 ELSE 0 END) AS synced, SUM(CASE WHEN merchant_sync_error IS NOT NULL THEN 1 ELSE 0 END) AS errors FROM shop_products")->fetch();
    $samples = $db->query("SELECT id, merchant_sync_error FROM shop_products WHERE merchant_sync_error IS NOT NULL ORDER BY id ASC LIMIT 5")->fetchAll();
    echo json_encode(['ok' => true, 'enabled' => merchantSyncIsEnabled($config), 'stats' => $row, 'error_samples' => $samples], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}}
"""

    ftp = connect()
    try:
        # Curăță exclusiv endpointurile temporare ale unor rulări întrerupte.
        for remote_name in ftp.nlst():
            if re.fullmatch(r"merchant-catalog-sync-[0-9a-f]{16}\.php", remote_name):
                ftp.delete(remote_name)
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")), blocksize=262144)
        base = f"{PUBLIC_ROOT}/{filename}?" + urlencode({"token": token})
        bootstrap = request_json(base + "&mode=bootstrap")
        if not bootstrap.get("schema_ready"):
            raise RuntimeError("Schema Merchant nu a putut fi pregatita.")
        if options.diagnose_only:
            diagnosis = {
                "server": request_json(base + "&mode=stats"),
                "images": request_json(base + "&mode=image-files"),
                "merchant": request_json(base + "&mode=merchant-products", timeout=180),
            }
            print(json.dumps(diagnosis, ensure_ascii=False, indent=2), flush=True)
            return
        if options.repair_images:
            first = request_json(base + "&" + urlencode({"mode": "repair-images", "offset": 0, "limit": 10}), timeout=300)
            total = int(first.get("total") or 0)
            results = [first]
            offsets = list(range(10, total, 10))
            with ThreadPoolExecutor(max_workers=4) as executor:
                pending = {
                    executor.submit(
                        request_json,
                        base + "&" + urlencode({"mode": "repair-images", "offset": offset, "limit": 10}),
                        300,
                    ): offset
                    for offset in offsets
                }
                completed = 1
                for future in as_completed(pending):
                    results.append(future.result())
                    completed += 1
                    if completed % 20 == 0 or completed == len(offsets) + 1:
                        print(json.dumps({"phase": "repair-images", "completed_batches": completed, "total_batches": len(offsets) + 1}), flush=True)

            numeric_keys = ["checked", "already_present", "products_repaired", "images_saved", "products_missing", "images_missing"]
            list_keys = ["stripe_errors", "merchant_errors", "seo_errors", "errors"]
            totals = {key: 0 for key in numeric_keys}
            totals.update({key: [] for key in list_keys})
            for result in results:
                stats = result.get("stats", {})
                for key in numeric_keys:
                    totals[key] += int(stats.get(key) or 0)
                for key in list_keys:
                    totals[key].extend(stats.get(key) or [])
            print(json.dumps({"phase": "repair-images-complete", "total": total, "result": totals}, ensure_ascii=False, indent=2), flush=True)
            if any(totals[key] for key in list_keys):
                raise SystemExit(1)
            return
        if options.resync_disapproved_images:
            diagnosis = request_json(base + "&mode=merchant-products", timeout=180)
            issue_ids_by_key = diagnosis.get("issue_offer_ids_by_key", {})
            blocked_keys = (
                "DISAPPROVED|FREE_LISTINGS|image_link_internal_error",
                "DISAPPROVED|FREE_LISTINGS|image_link_pending_crawl",
            )
            image_issue_ids = sorted({
                str(product_id)
                for key in blocked_keys
                for product_id in issue_ids_by_key.get(key, [])
                if str(product_id)
            })
            missing_ids = sorted({str(value) for value in diagnosis.get("missing_offer_ids", []) if str(value)})
            unexpected_ids = sorted({str(value) for value in diagnosis.get("unexpected_offer_ids", []) if str(value)})
            sync_ids = sorted(set(image_issue_ids) | set(missing_ids))
            jobs = [("sync", group) for group in chunks(sync_ids, 5)] + [
                ("delete", group) for group in chunks(unexpected_ids, 5)
            ]
            print(json.dumps({
                "phase": "targeted-plan",
                "disapproved_or_pending_images": len(image_issue_ids),
                "missing_from_merchant": len(missing_ids),
                "unexpected_in_merchant": len(unexpected_ids),
                "sync_total": len(sync_ids),
                "delete_total": len(unexpected_ids),
            }, ensure_ascii=False), flush=True)

            totals = {"synced": 0, "deleted": 0, "already_absent": 0, "errors": []}
            with ThreadPoolExecutor(max_workers=4) as executor:
                pending = {
                    executor.submit(request_json, base + "&" + urlencode({"mode": mode, "ids": ",".join(group)})): (mode, group)
                    for mode, group in jobs
                }
                for future in as_completed(pending):
                    mode, group = pending[future]
                    try:
                        payload = future.result()
                        for result in payload.get("results", []):
                            status = str(result.get("status", ""))
                            if status in ("synced", "deleted", "already_absent"):
                                totals[status] += 1
                            else:
                                totals["errors"].append(result)
                    except Exception as error:
                        totals["errors"].append({"mode": mode, "product_ids": group, "error": str(error)})

            verification = request_json(base + "&mode=merchant-products", timeout=180)
            print(json.dumps({
                "phase": "targeted-complete",
                "result": totals,
                "destination_summary": verification.get("destination_summary", {}),
                "issue_summary": verification.get("issue_summary", {}),
                "missing_offer_ids": verification.get("missing_offer_ids", []),
                "unexpected_offer_ids": verification.get("unexpected_offer_ids", []),
            }, ensure_ascii=False, indent=2), flush=True)
            if totals["errors"]:
                raise SystemExit(1)
            return
        state = request_json(base + "&mode=stats")
        if not state.get("enabled"):
            raise RuntimeError("Sincronizarea Merchant este pe pauza. Activeaz-o numai dupa publicarea site-ului.")
        registration = request_json(base + "&mode=register")
        print(json.dumps({"phase": "registration", "registered": bool(registration.get("registered"))}), flush=True)

        plan = request_json(base + "&mode=plan")
        product_ids = [str(value) for value in plan.get("product_ids", [])]
        representative_ids = {str(value) for value in plan.get("representative_ids", product_ids)}
        public_ids = [value for value in product_ids if value in representative_ids]
        duplicate_ids = [value for value in product_ids if value not in representative_ids]
        jobs = [("sync", group) for group in chunks(public_ids, 5)] + [("delete", group) for group in chunks(duplicate_ids, 5)]
        print(json.dumps({"phase": "plan", "total": len(product_ids), "public": len(public_ids), "duplicates": len(duplicate_ids), "batches": len(jobs)}), flush=True)

        totals = {"synced": 0, "deleted": 0, "already_absent": 0, "errors": [], "duplicate_catalog_rows_removed": 0}
        with ThreadPoolExecutor(max_workers=6) as executor:
            pending = {
                executor.submit(request_json, base + "&" + urlencode({"mode": mode, "ids": ",".join(group)})): (mode, group)
                for mode, group in jobs
            }
            completed = 0
            for future in as_completed(pending):
                completed += 1
                try:
                    payload = future.result()
                    for result in payload.get("results", []):
                        status = str(result.get("status", ""))
                        if status in ("synced", "deleted", "already_absent"):
                            totals[status] += 1
                            if result.get("reason") == "public_catalog_duplicate":
                                totals["duplicate_catalog_rows_removed"] += 1
                        elif status == "error":
                            totals["errors"].append(result)
                        else:
                            totals["errors"].append({"product_id": result.get("product_id"), "error": f"Stare neasteptata: {status}"})
                except Exception as error:
                    mode, failed_group = pending[future]
                    totals["errors"].append({"mode": mode, "product_ids": failed_group, "error": str(error)})
                if completed % 25 == 0 or completed == len(jobs):
                    print(json.dumps({"phase": "sync", "completed_batches": completed, "total_batches": len(jobs), "errors": len(totals["errors"])}), flush=True)

        stats = request_json(base + "&mode=stats")
        print(json.dumps({"phase": "complete", "result": totals, "server": stats.get("stats", {})}, ensure_ascii=False, indent=2), flush=True)
        if totals["errors"] or int(stats.get("stats", {}).get("errors") or 0) != 0:
            raise SystemExit(1)
    finally:
        try:
            ftp.delete(filename)
        finally:
            try:
                ftp.quit()
            except Exception:
                ftp.close()


if __name__ == "__main__":
    main()
