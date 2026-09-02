<?php
declare(strict_types=1);

final class ShopNirHttpException extends RuntimeException {
    public int $status;
    public array $payload;
    public function __construct(string $message, int $status = 422, array $payload = []) {
        parent::__construct($message);
        $this->status = $status;
        $this->payload = ['error' => $message] + $payload;
    }
}

function shopNirActor(array $user): array {
    return [
        'id' => (string)($user['id'] ?? $user['user_id'] ?? ''),
        'name' => mb_substr(trim((string)($user['display_name'] ?? $user['name'] ?? $user['username'] ?? 'Utilizator')), 0, 180),
        'role' => mb_strtolower(trim((string)($user['role'] ?? 'user'))),
    ];
}

function shopNirPermissions(array $user): array {
    $role = shopNirActor($user)['role'];
    $all = [
        'NIR_VIEW', 'NIR_CREATE', 'NIR_EDIT_DRAFT', 'NIR_CONFIRM', 'NIR_REVERSE', 'NIR_STORNO',
        'NIR_EXPORT', 'NIR_VIEW_COSTS', 'SUPPLIER_CREATE',
        'SUPPLIER_PRODUCT_REFERENCE_MANAGE', 'FIFO_VIEW', 'FIFO_OPENING_BALANCE_MANAGE',
    ];
    if ($role === 'admin') return $all;
    if ($role === 'manager') {
        return array_values(array_diff($all, ['FIFO_OPENING_BALANCE_MANAGE']));
    }
    return ['NIR_VIEW'];
}

function shopNirCan(array $user, string $permission): bool {
    return in_array($permission, shopNirPermissions($user), true);
}

function shopNirRequire(array $user, string $permission): void {
    if (!shopNirCan($user, $permission)) {
        throw new ShopNirHttpException('Nu ai permisiunea necesară pentru această operație.', 403, ['permission' => $permission]);
    }
}

function shopNirAudit(PDO $db, array $user, string $action, string $entityType, string $entityId, $oldValues = null, $newValues = null, array $context = []): void {
    $actor = shopNirActor($user);
    $stmt = $db->prepare(
        'INSERT INTO shop_domain_audit
         (id, action_type, entity_type, entity_id, actor_id, actor_name, old_values_json, new_values_json, context_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $encode = static fn($value): ?string => $value === null ? null : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $stmt->execute([
        uuidV4(), mb_substr($action, 0, 80), mb_substr($entityType, 0, 80), $entityId,
        $actor['id'] ?: null, $actor['name'], $encode($oldValues), $encode($newValues), $encode($context),
    ]);
}

function shopNirDate($value, string $field, bool $nullable = false): ?string {
    $raw = trim((string)$value);
    if ($raw === '' && $nullable) return null;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $raw);
    if (!$date || $date->format('Y-m-d') !== $raw) throw new InvalidArgumentException($field . ' nu este o dată validă.');
    return $raw;
}

function shopNirTime($value, string $field, bool $nullable = false): ?string {
    $raw = trim((string)$value);
    if ($raw === '' && $nullable) return null;
    if (preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $raw)) return $raw . ':00';
    if (preg_match('/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/', $raw)) return $raw;
    throw new InvalidArgumentException($field . ' nu este o oră validă. Folosește formatul HH:MM.');
}

function shopNirUserName(array $user): string {
    return shopNirActor($user)['name'];
}

function shopNirSettings(PDO $db, bool $forUpdate = false): array {
    $stmt = $db->query('SELECT * FROM shop_nir_settings WHERE id = 1' . ($forUpdate ? ' FOR UPDATE' : ''));
    $row = $stmt->fetch();
    if (!$row) throw new RuntimeException('Configurația NIR nu este disponibilă.');
    $row['include_vat_in_inventory_cost'] = (bool)$row['include_vat_in_inventory_cost'];
    return $row;
}

/** Return the latest official BNR rate expressed as RON for one currency unit. */
function shopNirBnrExchangeRate(string $currency, ?string $requestedDate = null): array {
    $currency = strtoupper(trim($currency));
    if (!preg_match('/^[A-Z]{3}$/', $currency)) throw new InvalidArgumentException('Codul monedei nu este valid.');
    $requestedDate = trim((string)$requestedDate);
    if ($requestedDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $requestedDate)) throw new InvalidArgumentException('Data cursului nu este validă.');
    $targetDate = $requestedDate !== '' ? $requestedDate : date('Y-m-d');
    if ($currency === 'RON') return ['currency' => 'RON', 'rate' => '1.00000000', 'date' => $targetDate, 'requested_date' => $targetDate, 'source' => 'BNR'];

    $targetYear = (int)substr($targetDate, 0, 4);
    $currentYear = (int)date('Y');
    $url = $targetDate === date('Y-m-d') ? 'https://curs.bnr.ro/nbrfxrates.xml' : "https://curs.bnr.ro/files/xml/years/nbrfxrates{$targetYear}.xml";
    $raw = false;
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_USERAGENT => 'G-Trots-NIR/1.0',
            CURLOPT_HTTPHEADER => ['Accept: application/xml,text/xml'],
        ]);
        $raw = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        if ($status < 200 || $status >= 300) $raw = false;
    } else {
        $context = stream_context_create(['http' => ['method' => 'GET', 'timeout' => 12, 'header' => "Accept: application/xml,text/xml\r\nUser-Agent: G-Trots-NIR/1.0\r\n"]]);
        $raw = @file_get_contents($url, false, $context);
    }
    if ((!is_string($raw) || trim($raw) === '') && $targetYear === $currentYear) {
        $raw = @file_get_contents('https://curs.bnr.ro/nbrfxrates.xml', false, stream_context_create(['http' => ['timeout' => 12, 'header' => "Accept: application/xml,text/xml\r\nUser-Agent: G-Trots-NIR/1.0\r\n"]]));
    }
    if (!is_string($raw) || trim($raw) === '') throw new RuntimeException('Cursul BNR nu este disponibil momentan. Poți completa cursul manual.');
    $xml = @simplexml_load_string($raw);
    if (!$xml) throw new RuntimeException('Răspunsul BNR nu a putut fi citit. Poți completa cursul manual.');
    $cubeNodes = $xml->xpath('//*[local-name()="Cube"]') ?: [];
    $selected = null;
    foreach ($cubeNodes as $cube) {
        $publishedDate = trim((string)$cube['date']);
        if ($publishedDate === '' || $publishedDate > $targetDate) continue;
        if ($selected !== null && $publishedDate <= $selected['date']) continue;
        $rateNodes = $cube->xpath('./*[local-name()="Rate"]') ?: [];
        foreach ($rateNodes as $node) {
            if (strtoupper(trim((string)$node['currency'])) !== $currency) continue;
            $multiplier = max(1, (int)($node['multiplier'] ?? 1));
            $value = (float)str_replace(',', '.', trim((string)$node));
            if ($value > 0) $selected = ['date' => $publishedDate, 'rate' => number_format($value / $multiplier, 8, '.', '')];
            break;
        }
    }
    if ($selected !== null) return ['currency' => $currency, 'rate' => $selected['rate'], 'date' => $selected['date'], 'requested_date' => $targetDate, 'source' => 'BNR'];
    throw new InvalidArgumentException("BNR nu publică un curs pentru moneda {$currency}. Completează cursul manual.");
}

function shopNirReferenceRow(array $row): array {
    $row['is_primary_for_supplier'] = (bool)$row['is_primary_for_supplier'];
    $row['is_active'] = (bool)$row['is_active'];
    $row['row_version'] = (int)$row['row_version'];
    if (array_key_exists('product_image_url', $row)) $row['product_image_url'] = shopNirProductImageUrl($row['product_image_url']);
    return $row;
}

function shopNirProductImageUrl($value): ?string {
    $path = trim((string)$value);
    if ($path === '') return null;
    if (preg_match('#^https?://#i', $path)) return $path;
    $base = 'https://g-trots.ro/shop-api';
    if (function_exists('shopConfig')) {
        $config = shopConfig();
        $base = rtrim((string)($config['public_base_url'] ?? $base), '/');
    }
    return $base . '/' . ltrim($path, '/');
}

function shopNirDocumentRow(array $row, bool $canViewCosts = true): array {
    $row['row_version'] = (int)$row['row_version'];
    $row['line_count'] = isset($row['line_count']) ? (int)$row['line_count'] : null;
    $row['permissions'] = null;
    if (!$canViewCosts) {
        foreach (['subtotal', 'vat_total', 'grand_total', 'subtotal_ron', 'vat_total_ron', 'grand_total_ron', 'inventory_cost_total_ron', 'total_difference_ron'] as $field) {
            unset($row[$field]);
        }
    }
    return $row;
}

/**
 * Builds the public storno progress for one or more original NIR documents.
 * Legacy `reversed` values are still understood while bootstrap normalizes
 * original NIRs back to `confirmed`. Clients receive the independent business
 * progress through `public_status` and `storno_state`.
 */
function shopNirStornoProgressMap(PDO $db, array $documentRows): array {
    $originalIds = [];
    foreach ($documentRows as $row) {
        $id = trim((string)($row['id'] ?? ''));
        $sourceId = trim((string)($row['reversal_of_id'] ?? ''));
        if ($sourceId !== '') $originalIds[$sourceId] = true;
        elseif ($id !== '') $originalIds[$id] = true;
    }
    $ids = array_keys($originalIds);
    if (!$ids) return [];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $progress = [];
    foreach ($ids as $id) {
        $progress[$id] = [
            'original_quantity' => 0,
            'storned_quantity' => 0,
            'line_count' => 0,
            'fully_storned_line_count' => 0,
            'by_line' => [],
        ];
    }

    $originalStmt = $db->prepare(
        "SELECT nir_document_id, id AS line_id, accepted_quantity
         FROM shop_nir_lines
         WHERE nir_document_id IN ({$placeholders})"
    );
    $originalStmt->execute($ids);
    foreach ($originalStmt->fetchAll() as $line) {
        $documentId = (string)$line['nir_document_id'];
        $lineId = (string)$line['line_id'];
        $quantity = max(0, shopNirDecimalToScaled($line['accepted_quantity'] ?? 0, 4));
        $progress[$documentId]['original_quantity'] += $quantity;
        $progress[$documentId]['line_count']++;
        $progress[$documentId]['by_line'][$lineId] = [
            'original_quantity' => $quantity,
            'storned_quantity' => 0,
        ];
    }

    $stornoStmt = $db->prepare(
        "SELECT sd.reversal_of_id AS original_id, sl.storno_of_line_id AS source_line_id,
                SUM(ABS(sl.accepted_quantity)) AS storned_quantity
         FROM shop_nir_lines sl
         INNER JOIN shop_nir_documents sd ON sd.id = sl.nir_document_id
         WHERE sd.reversal_of_id IN ({$placeholders})
           AND sl.storno_of_line_id IS NOT NULL
         GROUP BY sd.reversal_of_id, sl.storno_of_line_id"
    );
    $stornoStmt->execute($ids);
    foreach ($stornoStmt->fetchAll() as $row) {
        $documentId = (string)$row['original_id'];
        $lineId = (string)$row['source_line_id'];
        if (!isset($progress[$documentId]['by_line'][$lineId])) continue;
        $quantity = max(0, shopNirDecimalToScaled($row['storned_quantity'] ?? 0, 4));
        $original = $progress[$documentId]['by_line'][$lineId]['original_quantity'];
        $quantity = min($quantity, $original);
        $progress[$documentId]['by_line'][$lineId]['storned_quantity'] = $quantity;
        $progress[$documentId]['storned_quantity'] += $quantity;
    }

    foreach ($progress as &$item) {
        foreach ($item['by_line'] as &$line) {
            $line['stornable_quantity'] = max(0, $line['original_quantity'] - $line['storned_quantity']);
            $line['is_fully_storned'] = $line['original_quantity'] > 0 && $line['stornable_quantity'] === 0;
            if ($line['is_fully_storned']) $item['fully_storned_line_count']++;
            foreach (['original_quantity', 'storned_quantity', 'stornable_quantity'] as $field) {
                $line[$field] = shopNirScaledToDecimal($line[$field], 4);
            }
        }
        unset($line);
        $total = $item['original_quantity'];
        $storned = min($item['storned_quantity'], $total);
        $item['state'] = $storned <= 0 ? 'none' : ($total > 0 && $storned >= $total ? 'full' : 'partial');
        $item['progress_percent'] = $total > 0 ? number_format(min(100, $storned * 100 / $total), 2, '.', '') : '0.00';
        $item['original_quantity'] = shopNirScaledToDecimal($total, 4);
        $item['storned_quantity'] = shopNirScaledToDecimal($storned, 4);
        $item['stornable_quantity'] = shopNirScaledToDecimal(max(0, $total - $storned), 4);
    }
    unset($item);
    return $progress;
}

function shopNirAttachStornoState(PDO $db, array $documents): array {
    if (!$documents) return [];
    $progressMap = shopNirStornoProgressMap($db, $documents);
    foreach ($documents as &$document) {
        $id = (string)($document['id'] ?? '');
        $originalId = trim((string)($document['reversal_of_id'] ?? ''));
        $isStornoDocument = $originalId !== '' || mb_strtolower(trim((string)($document['source_type'] ?? ''))) === 'reversal';
        if ($isStornoDocument) {
            $document['document_kind'] = 'storno';
            $document['public_status'] = 'stornat';
            $document['status_label'] = 'STORNAT';
            $document['storno_of_id'] = $originalId ?: null;
            $document['original_invoice'] = [
                'series' => $document['original_invoice_series'] ?? null,
                'number' => $document['original_invoice_number'] ?? null,
                'date' => $document['original_invoice_date'] ?? null,
            ];
            $document['storned_at'] = $document['confirmed_at'] ?? $document['created_at'] ?? null;
            $document['storned_by'] = $document['confirmed_by'] ?? $document['created_by'] ?? null;
            $document['can_storno'] = false;
            $document['fully_storned'] = true;
            $document['storned_quantity'] = null;
            $document['stornable_quantity'] = '0.0000';
            continue;
        }
        $item = $progressMap[$id] ?? [
            'state' => (string)($document['status'] ?? '') === 'reversed' ? 'full' : 'none',
            'progress_percent' => (string)($document['status'] ?? '') === 'reversed' ? '100.00' : '0.00',
            'original_quantity' => '0.0000', 'storned_quantity' => '0.0000', 'stornable_quantity' => '0.0000',
            'line_count' => (int)($document['line_count'] ?? 0), 'fully_storned_line_count' => 0, 'by_line' => [],
        ];
        if ((string)($document['status'] ?? '') === 'reversed') $item['state'] = 'full';
        $document['document_kind'] = 'nir';
        $document['storno'] = $item;
        $document['storno_state'] = $item['state'];
        $document['fully_storned'] = $item['state'] === 'full';
        $document['partially_storned'] = $item['state'] === 'partial';
        $document['storned_quantity'] = $item['storned_quantity'];
        $document['stornable_quantity'] = $item['stornable_quantity'];
        $document['can_storno'] = (string)($document['status'] ?? '') === 'confirmed'
            && $item['state'] !== 'full'
            && shopNirDecimalToScaled($item['stornable_quantity'] ?? 0, 4) > 0;
        // Documentul de intrare rămâne verde/confirmat; progresul storno este
        // expus separat și nu îi schimbă statutul contabil de origine.
        $document['public_status'] = (string)($document['status'] ?? '');
        $document['status_label'] = (string)($document['status'] ?? '') === 'confirmed' ? 'CONFIRMAT' : strtoupper((string)($document['status'] ?? ''));
    }
    unset($document);
    return $documents;
}

function shopNirLineRow(array $row, bool $canViewCosts = true): array {
    $row['line_number'] = (int)$row['line_number'];
    $row['row_version'] = (int)$row['row_version'];
    $row['is_stock_item'] = !isset($row['is_stock_item']) || (bool)$row['is_stock_item'];
    if (array_key_exists('product_image_url', $row)) $row['product_image_url'] = shopNirProductImageUrl($row['product_image_url']);
    if (!$canViewCosts) {
        foreach (['unit_price', 'discount_percent', 'line_net', 'line_vat', 'line_total', 'line_net_ron', 'line_vat_ron', 'line_total_ron', 'allocated_cost_ron', 'inventory_unit_cost_ron', 'inventory_cost_total_ron'] as $field) {
            unset($row[$field]);
        }
    }
    return $row;
}

/** Attach informational, server-calculated purchase-price comparisons. */
function shopNirAttachPriceComparisons(PDO $db, array $lines, array $document): array {
    $productIds = array_values(array_unique(array_filter(array_map(static fn(array $line): string => trim((string)($line['product_id'] ?? '')), $lines))));
    if (!$productIds) return $lines;
    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $stmt = $db->prepare(
        "SELECT l.product_id, l.unit_price, l.discount_percent, l.line_net_ron, l.accepted_quantity,
                n.supplier_id, n.currency, n.exchange_rate, n.reception_date, n.nir_number
         FROM shop_nir_lines l
         INNER JOIN shop_nir_documents n ON n.id = l.nir_document_id
         WHERE n.status = 'confirmed' AND n.id <> ? AND l.product_id IN ({$placeholders}) AND l.accepted_quantity > 0
         ORDER BY n.reception_date DESC, n.confirmed_at DESC, l.line_number DESC"
    );
    $stmt->execute(array_merge([(string)$document['id']], $productIds));
    $historyByProduct = [];
    foreach ($stmt->fetchAll() as $history) $historyByProduct[(string)$history['product_id']][] = $history;
    $recentBoundary = (new DateTimeImmutable('today -365 days'))->format('Y-m-d');
    $settings = shopNirSettings($db);
    $threshold = shopNirDecimalToScaled($settings['price_variance_warning_percent'] ?? 20, 2);
    $unitNetRon = static function ($unitPrice, $discountPercent, $exchangeRate): int {
        $unit = shopNirDecimalToScaled($unitPrice, 6);
        $discount = shopNirDecimalToScaled($discountPercent, 4);
        $discountValue = shopNirDivideRounded(shopNirMultiplyScaled($unit, 6, $discount, 4, 6), 100);
        return shopNirMultiplyScaled($unit - $discountValue, 6, shopNirDecimalToScaled($exchangeRate, 8), 8, 6);
    };

    foreach ($lines as &$line) {
        $rows = $historyByProduct[(string)($line['product_id'] ?? '')] ?? [];
        $currentUnit = $unitNetRon($line['unit_price'] ?? 0, $line['discount_percent'] ?? 0, $document['exchange_rate'] ?? 1);
        $lastAny = $rows[0] ?? null;
        $lastSupplier = null;
        $recentMinimum = null;
        foreach ($rows as $row) {
            $unit = $unitNetRon($row['unit_price'], $row['discount_percent'], $row['exchange_rate']);
            $row['unit_net_price_ron'] = shopNirScaledToDecimal($unit, 6);
            if ($lastSupplier === null && (string)$row['supplier_id'] === (string)($document['supplier_id'] ?? '')) $lastSupplier = $row;
            if ((string)$row['reception_date'] >= $recentBoundary && ($recentMinimum === null || $unit < (int)$recentMinimum['_unit_scaled'])) {
                $row['_unit_scaled'] = $unit;
                $recentMinimum = $row;
            }
        }
        if ($lastAny !== null) {
            $lastAny['unit_net_price_ron'] = shopNirScaledToDecimal($unitNetRon($lastAny['unit_price'], $lastAny['discount_percent'], $lastAny['exchange_rate']), 6);
        }
        $baseline = $lastSupplier ?? $lastAny;
        $baselineScaled = $baseline ? shopNirDecimalToScaled($baseline['unit_net_price_ron'], 6) : 0;
        $variance = $baselineScaled > 0 ? shopNirDivideRounded(($currentUnit - $baselineScaled) * 10000, $baselineScaled) : null;
        $line['price_comparison'] = [
            'current_unit_net_price_ron' => shopNirScaledToDecimal($currentUnit, 6),
            'last_supplier' => $lastSupplier ? [
                'unit_price' => $lastSupplier['unit_price'], 'currency' => $lastSupplier['currency'],
                'unit_net_price_ron' => $lastSupplier['unit_net_price_ron'], 'reception_date' => $lastSupplier['reception_date'], 'nir_number' => $lastSupplier['nir_number'],
            ] : null,
            'last_any_supplier' => $lastAny ? [
                'unit_price' => $lastAny['unit_price'], 'currency' => $lastAny['currency'],
                'unit_net_price_ron' => $lastAny['unit_net_price_ron'], 'reception_date' => $lastAny['reception_date'], 'nir_number' => $lastAny['nir_number'],
            ] : null,
            'recent_minimum_unit_net_price_ron' => $recentMinimum['unit_net_price_ron'] ?? null,
            'variance_percent' => $variance === null ? null : shopNirScaledToDecimal($variance, 2),
            'warning_threshold_percent' => shopNirScaledToDecimal($threshold, 2),
            'is_significant' => $variance !== null && abs($variance) >= $threshold,
        ];
    }
    unset($line);
    return $lines;
}

function shopNirFetchDocument(PDO $db, string $id, array $user, bool $withDetails = true): array {
    $stmt = $db->prepare(
        'SELECT n.*, s.name AS supplier_name, s.cui AS supplier_cui, w.name AS warehouse_name,
                original.supplier_invoice_series AS original_invoice_series,
                original.supplier_invoice_number AS original_invoice_number,
                original.supplier_invoice_date AS original_invoice_date,
                (SELECT COUNT(*) FROM shop_nir_lines l WHERE l.nir_document_id = n.id) AS line_count
         FROM shop_nir_documents n
         LEFT JOIN shop_nir_documents original ON original.id = n.reversal_of_id
         LEFT JOIN shop_suppliers s ON s.id = n.supplier_id
         LEFT JOIN shop_warehouses w ON w.id = n.warehouse_id
         WHERE n.id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $document = $stmt->fetch();
    if (!$document) throw new ShopNirHttpException('NIR-ul nu există.', 404);
    $canViewCosts = shopNirCan($user, 'NIR_VIEW_COSTS');
    $result = shopNirAttachStornoState($db, [shopNirDocumentRow($document, $canViewCosts)])[0];
    $result['permissions'] = shopNirPermissions($user);
    if (!$withDetails) return $result;

    $lines = $db->prepare(
        'SELECT l.*, COALESCE(l.product_snapshot_name, p.name) AS product_name,
                COALESCE(l.sku_snapshot, p.sku) AS product_sku,
                COALESCE(l.ean_snapshot, p.ean) AS product_ean,
                (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS product_image_url,
                (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS product_image_storage_path,
                COALESCE(pc.name, c.name) AS product_category_name,
                CASE WHEN c.parent_id IS NOT NULL THEN c.name ELSE NULL END AS product_subcategory_name,
                m.name AS product_manufacturer_name,
                (SELECT GROUP_CONCAT(DISTINCT b.name ORDER BY b.name SEPARATOR ", ")
                 FROM shop_product_brands pb INNER JOIN shop_brands b ON b.id = pb.brand_id
                 WHERE pb.product_id = p.id) AS product_brand_names,
                r.supplier_product_code_original AS reference_code
         FROM shop_nir_lines l
         LEFT JOIN shop_products p ON p.id = l.product_id
         LEFT JOIN shop_categories c ON c.id = p.category_id
         LEFT JOIN shop_categories pc ON pc.id = c.parent_id
         LEFT JOIN shop_manufacturers m ON m.id = p.manufacturer_id
         LEFT JOIN shop_supplier_product_references r ON r.id = l.supplier_product_reference_id
         WHERE l.nir_document_id = ? ORDER BY l.line_number ASC'
    );
    $lines->execute([$id]);
    $result['lines'] = array_map(static fn(array $row): array => shopNirLineRow($row, $canViewCosts), $lines->fetchAll());
    if (($result['document_kind'] ?? 'nir') === 'nir') {
        $byLine = is_array($result['storno']['by_line'] ?? null) ? $result['storno']['by_line'] : [];
        foreach ($result['lines'] as &$line) {
            $lineProgress = $byLine[(string)($line['id'] ?? '')] ?? [
                'original_quantity' => (string)($line['accepted_quantity'] ?? '0.0000'),
                'storned_quantity' => '0.0000',
                'stornable_quantity' => (string)($line['accepted_quantity'] ?? '0.0000'),
                'is_fully_storned' => false,
            ];
            $line['storno'] = $lineProgress;
            $line['storned_quantity'] = $lineProgress['storned_quantity'];
            $line['stornable_quantity'] = $lineProgress['stornable_quantity'];
            $line['is_fully_storned'] = (bool)$lineProgress['is_fully_storned'];
        }
        unset($line);
    }
    if ($canViewCosts) $result['lines'] = shopNirAttachPriceComparisons($db, $result['lines'], $document);
    $attachments = $db->prepare('SELECT id, original_name, mime_type, extension, file_size, sha256, extraction_status, extraction_message, created_at FROM shop_nir_attachments WHERE nir_document_id = ? ORDER BY created_at ASC');
    $attachments->execute([$id]);
    $result['attachments'] = $attachments->fetchAll();
    return $result;
}

function shopNirList(PDO $db, array $query, array $user): array {
    $page = max(1, (int)($query['page'] ?? 1));
    $pageSize = max(5, min(100, (int)($query['page_size'] ?? 20)));
    $conditions = ['1=1'];
    $params = [];
    $status = mb_strtolower(trim((string)($query['status'] ?? '')));
    if (in_array($status, ['storno', 'stornat', 'reversed'], true)) {
        $conditions[] = '(n.source_type = "reversal" OR n.reversal_of_id IS NOT NULL)';
    } elseif ($status === 'confirmed') {
        $conditions[] = 'n.status = "confirmed" AND n.reversal_of_id IS NULL AND n.source_type <> "reversal"';
    } elseif ($status !== '') {
        $conditions[] = 'n.status = ?';
        $params[] = $status;
    }
    $supplierId = trim((string)($query['supplier_id'] ?? ''));
    if ($supplierId !== '') { $conditions[] = 'n.supplier_id = ?'; $params[] = $supplierId; }
    $from = trim((string)($query['from'] ?? ''));
    if ($from !== '') { $conditions[] = 'n.reception_date >= ?'; $params[] = shopNirDate($from, 'Data de început'); }
    $to = trim((string)($query['to'] ?? ''));
    if ($to !== '') { $conditions[] = 'n.reception_date <= ?'; $params[] = shopNirDate($to, 'Data de sfârșit'); }
    $search = mb_substr(trim((string)($query['search'] ?? '')), 0, 120);
    if ($search !== '') {
        $conditions[] = '(n.nir_number LIKE ? OR n.temporary_number LIKE ? OR n.supplier_invoice_number LIKE ? OR s.name LIKE ? OR s.cui LIKE ?)';
        $like = '%' . $search . '%';
        array_push($params, $like, $like, $like, $like, $like);
    }
    $where = implode(' AND ', $conditions);
    $countStmt = $db->prepare("SELECT COUNT(*) FROM shop_nir_documents n LEFT JOIN shop_suppliers s ON s.id = n.supplier_id WHERE {$where}");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();
    $offset = ($page - 1) * $pageSize;
    $stmt = $db->prepare(
        "SELECT n.*, s.name AS supplier_name, s.cui AS supplier_cui, w.name AS warehouse_name,
                original.supplier_invoice_series AS original_invoice_series,
                original.supplier_invoice_number AS original_invoice_number,
                original.supplier_invoice_date AS original_invoice_date,
                (SELECT COUNT(*) FROM shop_nir_lines l WHERE l.nir_document_id = n.id) AS line_count
         FROM shop_nir_documents n
         LEFT JOIN shop_nir_documents original ON original.id = n.reversal_of_id
         LEFT JOIN shop_suppliers s ON s.id = n.supplier_id
         LEFT JOIN shop_warehouses w ON w.id = n.warehouse_id
         WHERE {$where}
         ORDER BY n.reception_date DESC, n.created_at DESC
         LIMIT {$pageSize} OFFSET {$offset}"
    );
    $stmt->execute($params);
    $canViewCosts = shopNirCan($user, 'NIR_VIEW_COSTS');
    $items = array_map(static fn(array $row): array => shopNirDocumentRow($row, $canViewCosts), $stmt->fetchAll());
    $items = shopNirAttachStornoState($db, $items);
    return [
        'items' => $items,
        'page' => $page,
        'page_size' => $pageSize,
        'total' => $total,
        'total_pages' => max(1, (int)ceil($total / $pageSize)),
        'permissions' => shopNirPermissions($user),
    ];
}

function shopNirResolveReference(PDO $db, string $supplierId, string $code, string $ean = ''): ?array {
    $normalized = shopNirNormalizeSupplierCode($code);
    if ($supplierId === '' || ($normalized === '' && trim($ean) === '')) return null;
    if ($normalized !== '') {
        $stmt = $db->prepare(
            'SELECT r.*, p.name AS product_name, p.sku AS product_sku,
                    (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS product_image_url
             FROM shop_supplier_product_references r
             INNER JOIN shop_products p ON p.id = r.product_id
             WHERE r.supplier_id = ? AND r.supplier_product_code_normalized = ? AND r.is_active = 1 LIMIT 1'
        );
        $stmt->execute([$supplierId, $normalized]);
        $row = $stmt->fetch();
        if ($row) { $row['match_type'] = 'supplier_code'; return shopNirReferenceRow($row); }
    }
    if (trim($ean) !== '') {
        $stmt = $db->prepare(
            'SELECT r.*, p.name AS product_name, p.sku AS product_sku,
                    (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS product_image_url
             FROM shop_supplier_product_references r
             INNER JOIN shop_products p ON p.id = r.product_id
             WHERE r.supplier_id = ? AND r.supplier_ean = ? AND r.is_active = 1
             ORDER BY r.is_primary_for_supplier DESC, r.last_used_at DESC LIMIT 2'
        );
        $stmt->execute([$supplierId, trim($ean)]);
        $rows = $stmt->fetchAll();
        if (count($rows) === 1) { $rows[0]['match_type'] = 'ean'; return shopNirReferenceRow($rows[0]); }
    }
    return null;
}

function shopNirResolveReferenceByName(PDO $db, string $supplierId, string $name): ?array {
    $normalizedName = shopNirNormalizeSupplierProductName($name);
    if ($supplierId === '' || $normalizedName === '') return null;

    // Name-only aliases have a deterministic key and are the fastest path.
    $nameKey = shopNirSupplierProductNameKey($name);
    $stmt = $db->prepare(
        'SELECT r.*, p.name AS product_name, p.sku AS product_sku,
                (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS product_image_url
         FROM shop_supplier_product_references r
         INNER JOIN shop_products p ON p.id = r.product_id
         WHERE r.supplier_id = ? AND r.supplier_product_code_normalized = ? AND r.is_active = 1 LIMIT 1'
    );
    $stmt->execute([$supplierId, $nameKey]);
    $row = $stmt->fetch();
    if ($row) { $row['match_type'] = 'name_exact'; return shopNirReferenceRow($row); }

    // A code reference may also carry the exact name printed by that supplier.
    // Accept it only when every identical alias points to the same product.
    $stmt = $db->prepare(
        'SELECT r.*, p.name AS product_name, p.sku AS product_sku,
                (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS product_image_url
         FROM shop_supplier_product_references r
         INNER JOIN shop_products p ON p.id = r.product_id
         WHERE r.supplier_id = ? AND r.is_active = 1 AND r.supplier_product_name IS NOT NULL
         ORDER BY r.is_primary_for_supplier DESC, r.last_used_at DESC, r.updated_at DESC'
    );
    $stmt->execute([$supplierId]);
    $matches = [];
    foreach ($stmt->fetchAll() as $candidate) {
        if (shopNirNormalizeSupplierProductName($candidate['supplier_product_name'] ?? '') !== $normalizedName) continue;
        $matches[(string)$candidate['product_id']] = $candidate;
    }
    if (count($matches) !== 1) return null;
    $row = array_values($matches)[0];
    $row['match_type'] = 'name_exact';
    return shopNirReferenceRow($row);
}

function shopNirMatchSupplierProduct(PDO $db, string $supplierId, string $code, string $ean = '', string $sku = '', string $name = ''): array {
    $reference = shopNirResolveReference($db, $supplierId, $code, $ean);
    if ($reference) {
        $method = (string)($reference['match_type'] ?? 'supplier_code');
        return [
            'matched' => true, 'reference' => $reference, 'normalized_code' => shopNirNormalizeSupplierCode($code),
            'matched_stock_item_id' => $reference['product_id'], 'supplier_product_reference_id' => $reference['id'],
            'match_method' => $method, 'confidence' => 1.0, 'requires_confirmation' => false, 'conflict' => false,
            'suggestions' => [], 'reason' => $method === 'ean' ? 'Recunoscut după EAN' : 'Recunoscut după cod',
        ];
    }
    $reference = shopNirResolveReferenceByName($db, $supplierId, $name);
    if ($reference) {
        return [
            'matched' => true, 'reference' => $reference, 'normalized_code' => shopNirNormalizeSupplierCode($code),
            'matched_stock_item_id' => $reference['product_id'], 'supplier_product_reference_id' => $reference['id'],
            'match_method' => 'name_exact', 'confidence' => 1.0, 'requires_confirmation' => false, 'conflict' => false,
            'suggestions' => [], 'reason' => 'Recunoscut după denumirea memorată pentru acest furnizor.',
        ];
    }
    $exactProduct = null;
    $matchMethod = null;
    if (trim($ean) !== '') {
        $stmt = $db->prepare('SELECT p.id, p.name, p.sku, p.ean, p.accounting_stock_quantity, (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image_url FROM shop_products p WHERE p.ean = ? AND p.is_active = 1 LIMIT 2');
        $stmt->execute([trim($ean)]);
        $rows = $stmt->fetchAll();
        if (count($rows) === 1) { $exactProduct = $rows[0]; $matchMethod = 'ean'; }
    }
    if (!$exactProduct && trim($sku) !== '') {
        $stmt = $db->prepare('SELECT p.id, p.name, p.sku, p.ean, p.accounting_stock_quantity, (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image_url FROM shop_products p WHERE UPPER(p.sku) = UPPER(?) AND p.is_active = 1 LIMIT 2');
        $stmt->execute([trim($sku)]);
        $rows = $stmt->fetchAll();
        if (count($rows) === 1) { $exactProduct = $rows[0]; $matchMethod = 'sku'; }
    }
    if (!$exactProduct && trim($name) !== '') {
        $stmt = $db->prepare('SELECT p.id, p.name, p.sku, p.ean, p.accounting_stock_quantity, (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image_url FROM shop_products p WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(?)) AND p.is_active = 1 LIMIT 2');
        $stmt->execute([trim($name)]);
        $rows = $stmt->fetchAll();
        if (count($rows) === 1) { $exactProduct = $rows[0]; $matchMethod = 'name_exact'; }
    }
    if ($exactProduct && $matchMethod === 'name_exact') {
        $nameKey = shopNirSupplierProductNameKey($name);
        $existing = $db->prepare(
            'SELECT r.*, p.name AS product_name, p.sku AS product_sku,
                    (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS product_image_url
             FROM shop_supplier_product_references r
             INNER JOIN shop_products p ON p.id = r.product_id
             WHERE r.supplier_id = ? AND r.supplier_product_code_normalized = ? AND r.product_id = ? AND r.is_active = 1 LIMIT 1'
        );
        $existing->execute([$supplierId, $nameKey, (string)$exactProduct['id']]);
        $existingReference = $existing->fetch();
        $reference = $existingReference ? shopNirReferenceRow($existingReference) : [
            'id' => null, 'supplier_id' => $supplierId, 'product_id' => (string)$exactProduct['id'],
            'supplier_product_code_original' => '', 'supplier_product_name' => trim($name), 'supplier_ean' => trim($ean) ?: null,
            'purchase_unit' => 'buc', 'stock_unit' => 'buc', 'conversion_factor' => '1.000000',
            'product_name' => (string)$exactProduct['name'], 'product_sku' => $exactProduct['sku'] ?? null,
            'product_image_url' => shopNirProductImageUrl($exactProduct['image_url'] ?? null), 'match_type' => 'name_exact',
        ];
        return [
            'matched' => true, 'reference' => $reference, 'normalized_code' => shopNirNormalizeSupplierCode($code),
            'matched_stock_item_id' => (string)$exactProduct['id'], 'supplier_product_reference_id' => $reference['id'] ?? null,
            'match_method' => 'name_exact', 'confidence' => 1.0, 'requires_confirmation' => false, 'conflict' => false,
            'suggestions' => [], 'reason' => 'Denumirea coincide cu produsul intern; asocierea va fi memorată pentru acest furnizor la salvare.',
        ];
    }
    $suggestions = [];
    if (trim($name) !== '') {
        $rows = $db->query('SELECT p.id, p.name, p.sku, p.ean, p.accounting_stock_quantity, (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image_url FROM shop_products p WHERE p.is_active = 1 ORDER BY p.updated_at DESC LIMIT 300')->fetchAll();
        foreach ($rows as $row) {
            $score = function_exists('productSemanticSearchScore') ? productSemanticSearchScore($row, $name) : 0.0;
            if ($score <= 0) continue;
            $suggestions[] = $row + ['confidence' => min(0.89, $score / 20), 'match_method' => 'name_suggestion', 'requires_confirmation' => true];
        }
        usort($suggestions, static fn(array $left, array $right): int => ($right['confidence'] <=> $left['confidence']));
        $suggestions = array_slice($suggestions, 0, 8);
    }
    if ($exactProduct) array_unshift($suggestions, $exactProduct + ['confidence' => 1.0, 'match_method' => $matchMethod, 'requires_confirmation' => true]);
    return [
        'matched' => false, 'reference' => null, 'normalized_code' => shopNirNormalizeSupplierCode($code),
        'matched_stock_item_id' => $exactProduct['id'] ?? null, 'supplier_product_reference_id' => null,
        'match_method' => $matchMethod ?? 'unmatched', 'confidence' => $exactProduct ? 1.0 : 0.0,
        'requires_confirmation' => true, 'conflict' => false, 'suggestions' => $suggestions,
        'reason' => $exactProduct ? ($matchMethod === 'ean' ? 'EAN exact; confirmă memorarea codului pentru furnizor.' : 'SKU exact; confirmă memorarea codului pentru furnizor.') : 'Codul furnizorului nu este încă asociat unui produs.',
    ];
}

function shopNirCreateReference(PDO $db, array $body, array $user): array {
    $supplierId = trim((string)($body['supplier_id'] ?? ''));
    $productId = trim((string)($body['product_id'] ?? ''));
    $originalCode = mb_substr(trim((string)($body['supplier_product_code'] ?? $body['supplier_product_code_original'] ?? '')), 0, 180);
    $supplierName = mb_substr(trim((string)($body['supplier_product_name'] ?? '')), 0, 255);
    $normalizedCode = shopNirNormalizeSupplierCode($originalCode);
    if ($normalizedCode === '' && $supplierName !== '') $normalizedCode = shopNirSupplierProductNameKey($supplierName);
    if ($supplierId === '' || $productId === '' || $normalizedCode === '') throw new InvalidArgumentException('Furnizorul, produsul și codul sau denumirea produsului sunt obligatorii.');
    $supplier = $db->prepare('SELECT id FROM shop_suppliers WHERE id = ? AND is_active = 1');
    $supplier->execute([$supplierId]);
    if (!$supplier->fetchColumn()) throw new InvalidArgumentException('Furnizorul selectat nu există sau este inactiv.');
    $product = $db->prepare('SELECT id FROM shop_products WHERE id = ?');
    $product->execute([$productId]);
    if (!$product->fetchColumn()) throw new InvalidArgumentException('Produsul selectat nu există.');

    $existing = $db->prepare('SELECT * FROM shop_supplier_product_references WHERE supplier_id = ? AND supplier_product_code_normalized = ? FOR UPDATE');
    $existing->execute([$supplierId, $normalizedCode]);
    $row = $existing->fetch();
    if ($row && (string)$row['product_id'] !== $productId) {
        throw new ShopNirHttpException('Codul este deja asociat altui produs pentru acest furnizor.', 409, [
            'conflict' => true,
            'existing_reference' => shopNirReferenceRow($row),
        ]);
    }

    if ($supplierName !== '') {
        $sameName = $db->prepare(
            'SELECT id, product_id, supplier_product_name FROM shop_supplier_product_references
             WHERE supplier_id = ? AND is_active = 1 AND supplier_product_name IS NOT NULL FOR UPDATE'
        );
        $sameName->execute([$supplierId]);
        foreach ($sameName->fetchAll() as $candidate) {
            if ((string)$candidate['id'] === (string)($row['id'] ?? '')) continue;
            if (shopNirNormalizeSupplierProductName($candidate['supplier_product_name'] ?? '') !== shopNirNormalizeSupplierProductName($supplierName)) continue;
            if ((string)$candidate['product_id'] !== $productId) {
                throw new ShopNirHttpException('Denumirea este deja asociată altui produs pentru acest furnizor.', 409, [
                    'conflict' => true,
                    'existing_product_id' => (string)$candidate['product_id'],
                ]);
            }
        }
    }

    $actor = shopNirActor($user);
    $conversion = shopNirScaledToDecimal(shopNirDecimalToScaled($body['conversion_factor'] ?? 1, 6, 'Factorul de conversie'), 6);
    $isPrimary = !empty($body['is_primary_for_supplier']);
    if ($isPrimary) {
        $clear = $db->prepare('UPDATE shop_supplier_product_references SET is_primary_for_supplier = 0, row_version = row_version + 1, updated_by = ? WHERE supplier_id = ? AND product_id = ?');
        $clear->execute([$actor['name'], $supplierId, $productId]);
    }
    if ($row) {
        $stmt = $db->prepare(
            'UPDATE shop_supplier_product_references
             SET supplier_product_code_original = ?, supplier_product_name = ?, supplier_ean = ?, purchase_unit = ?, stock_unit = ?, conversion_factor = ?,
                 is_primary_for_supplier = ?, is_active = 1, updated_by = ?, row_version = row_version + 1
             WHERE id = ?'
        );
        $stmt->execute([
            $originalCode, $supplierName ?: null,
            mb_substr(trim((string)($body['supplier_ean'] ?? '')), 0, 120) ?: null,
            mb_substr(trim((string)($body['purchase_unit'] ?? 'buc')), 0, 40), mb_substr(trim((string)($body['stock_unit'] ?? 'buc')), 0, 40),
            $conversion, $isPrimary ? 1 : (int)$row['is_primary_for_supplier'], $actor['name'], (string)$row['id'],
        ]);
        $id = (string)$row['id'];
        shopNirAudit($db, $user, 'SUPPLIER_REFERENCE_REACTIVATED', 'SupplierProductReference', $id, $row, $body);
    } else {
        $id = uuidV4();
        $stmt = $db->prepare(
            'INSERT INTO shop_supplier_product_references
             (id, supplier_id, product_id, supplier_product_code_original, supplier_product_code_normalized, supplier_product_name, supplier_ean,
              purchase_unit, stock_unit, conversion_factor, is_primary_for_supplier, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $id, $supplierId, $productId, $originalCode, $normalizedCode,
            $supplierName ?: null,
            mb_substr(trim((string)($body['supplier_ean'] ?? '')), 0, 120) ?: null,
            mb_substr(trim((string)($body['purchase_unit'] ?? 'buc')), 0, 40), mb_substr(trim((string)($body['stock_unit'] ?? 'buc')), 0, 40),
            $conversion, $isPrimary ? 1 : 0, $actor['name'], $actor['name'],
        ]);
        shopNirAudit($db, $user, 'SUPPLIER_REFERENCE_CREATED', 'SupplierProductReference', $id, null, $body, ['second_supplier_supported' => true]);
    }
    $stmt = $db->prepare('SELECT r.*, p.name AS product_name, p.sku AS product_sku, s.name AS supplier_name FROM shop_supplier_product_references r INNER JOIN shop_products p ON p.id = r.product_id INNER JOIN shop_suppliers s ON s.id = r.supplier_id WHERE r.id = ?');
    $stmt->execute([$id]);
    $result = shopNirReferenceRow($stmt->fetch());
    $eventType = $row ? 'SupplierProductReferenceUpdated' : 'SupplierProductReferenceCreated';
    $db->prepare('INSERT INTO shop_domain_outbox (id, event_type, aggregate_type, aggregate_id, payload_json) VALUES (?, ?, "SupplierProductReference", ?, ?)')
        ->execute([uuidV4(), $eventType, $id, json_encode(['reference_id' => $id, 'supplier_id' => $supplierId, 'product_id' => $productId], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    return $result;
}

/**
 * Boomag is the commercial source used by KIDOTOYS SRL. Keep this relation in
 * the accounting backend so NIR matching does not depend on a visible UI field.
 * The operation is idempotent and never steals a supplier code already bound
 * to another product.
 */
function shopNirEnsureBoomagKidotoysReferences(PDO $db, ?string $productId = null): array {
    $supplier = $db->query(
        "SELECT id FROM shop_suppliers
         WHERE UPPER(TRIM(name)) = 'KIDOTOYS SRL'
         ORDER BY is_active DESC, created_at ASC LIMIT 1"
    )->fetchColumn();
    if (!$supplier) return ['supplier_found' => false, 'created' => 0, 'updated' => 0, 'conflicts' => 0, 'skipped' => 0];

    $sql = 'SELECT p.id, p.name, p.sku, p.supplier_product_code, p.supplier_external_id, p.ean
            FROM shop_products p
            LEFT JOIN shop_product_sources source ON source.id = p.source_id
            WHERE LOWER(TRIM(COALESCE(source.domain, p.source_domain, ""))) = "boomag.ro"';
    $params = [];
    if ($productId !== null && trim($productId) !== '') { $sql .= ' AND p.id = ?'; $params[] = trim($productId); }
    $sql .= ' ORDER BY p.id ASC';
    $products = $db->prepare($sql);
    $products->execute($params);

    $find = $db->prepare('SELECT id, product_id FROM shop_supplier_product_references WHERE supplier_id = ? AND supplier_product_code_normalized = ? LIMIT 1');
    $clearPrimary = $db->prepare('UPDATE shop_supplier_product_references SET is_primary_for_supplier = 0 WHERE supplier_id = ? AND product_id = ?');
    $insert = $db->prepare(
        'INSERT INTO shop_supplier_product_references
         (id, supplier_id, product_id, supplier_product_code_original, supplier_product_code_normalized, supplier_product_name,
          supplier_ean, purchase_unit, stock_unit, conversion_factor, is_primary_for_supplier, is_active, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, "buc", "buc", 1, 1, 1, "SYSTEM_BOOMAG", "SYSTEM_BOOMAG")'
    );
    $update = $db->prepare(
        'UPDATE shop_supplier_product_references
         SET supplier_product_code_original = ?, supplier_product_name = ?, supplier_ean = ?,
             purchase_unit = "buc", stock_unit = "buc", conversion_factor = 1,
             is_primary_for_supplier = 1, is_active = 1, updated_by = "SYSTEM_BOOMAG", row_version = row_version + 1
         WHERE id = ?'
    );
    $result = ['supplier_found' => true, 'supplier_id' => (string)$supplier, 'created' => 0, 'updated' => 0, 'conflicts' => 0, 'skipped' => 0];
    foreach ($products->fetchAll() as $product) {
        $code = '';
        foreach (['supplier_product_code', 'sku', 'supplier_external_id', 'ean'] as $field) {
            $candidate = trim((string)($product[$field] ?? ''));
            if ($candidate !== '') { $code = mb_substr($candidate, 0, 180); break; }
        }
        if ($code === '') { $result['skipped']++; continue; }
        $normalized = shopNirNormalizeSupplierCode($code);
        if ($normalized === '') { $result['skipped']++; continue; }
        $find->execute([(string)$supplier, $normalized]);
        $existing = $find->fetch();
        if ($existing && (string)$existing['product_id'] !== (string)$product['id']) { $result['conflicts']++; continue; }
        $clearPrimary->execute([(string)$supplier, (string)$product['id']]);
        $ean = trim((string)($product['ean'] ?? '')) ?: null;
        if ($existing) {
            $update->execute([$code, mb_substr((string)$product['name'], 0, 255), $ean, (string)$existing['id']]);
            $result['updated']++;
        } else {
            $insert->execute([uuidV4(), (string)$supplier, (string)$product['id'], $code, $normalized, mb_substr((string)$product['name'], 0, 255), $ean]);
            $result['created']++;
        }
    }
    return $result;
}

/**
 * Memorează codurile furnizorului numai în tranzacția pornită de salvarea
 * explicită a NIR-ului. Un produs intern poate avea oricâte coduri și oricâți
 * furnizori; unicitatea rămâne doar pe perechea furnizor + cod normalizat.
 */
function shopNirBindReferencesOnExplicitSave(PDO $db, array $lines, array $header, array $user): array {
    $supplierId = trim((string)($header['supplier_id'] ?? ''));
    if ($supplierId === '') return $lines;
    foreach ($lines as $index => $line) {
        if (!is_array($line)) continue;
        $referenceId = trim((string)($line['supplier_product_reference_id'] ?? ''));
        $productId = trim((string)($line['product_id'] ?? ''));
        $supplierCode = trim((string)($line['supplier_product_code'] ?? ''));
        $supplierName = trim((string)($line['supplier_product_name'] ?? $line['product_name'] ?? ''));
        if ($productId === '' || ($supplierCode === '' && $supplierName === '')) continue;
        $referenceBody = [
            'supplier_id' => $supplierId,
            'product_id' => $productId,
            'supplier_product_code' => $supplierCode,
            'supplier_product_name' => $supplierName,
            'supplier_ean' => $line['supplier_ean'] ?? null,
            'purchase_unit' => $line['purchase_unit'] ?? 'buc',
            'stock_unit' => $line['stock_unit'] ?? 'buc',
            'conversion_factor' => $line['conversion_factor'] ?? 1,
            'is_primary_for_supplier' => false,
        ];
        $explicitReassignment = false;
        $previousProductId = '';
        if ($referenceId !== '') {
            $currentReferenceStmt = $db->prepare('SELECT * FROM shop_supplier_product_references WHERE id = ? FOR UPDATE');
            $currentReferenceStmt->execute([$referenceId]);
            $currentReference = $currentReferenceStmt->fetch();
            if (!$currentReference || (string)$currentReference['supplier_id'] !== $supplierId) {
                throw new ShopNirHttpException('Asocierea furnizor-produs nu mai există sau aparține altui furnizor.', 409, ['conflict' => true]);
            }
            $lineIdentity = $supplierCode !== '' ? shopNirNormalizeSupplierCode($supplierCode) : shopNirSupplierProductNameKey($supplierName);
            if ($lineIdentity !== (string)$currentReference['supplier_product_code_normalized']) {
                // Codul sau denumirea a fost editată. Păstrăm asocierea veche și
                // memorăm valoarea nouă ca alias independent pentru același produs.
                $referenceId = '';
                $lines[$index]['supplier_product_reference_id'] = null;
            } else {
                $previousProductId = (string)$currentReference['product_id'];
                $explicitReassignment = $previousProductId !== $productId;
                if ($explicitReassignment) {
                    shopNirReferenceUpdate($db, $referenceId, [
                        'row_version' => (int)$currentReference['row_version'],
                        'product_id' => $productId,
                        'is_active' => true,
                    ], $user);
                }
                // Actualizează și metadatele asocierii (denumire, EAN, unități,
                // conversie), nu doar produsul intern ales.
                $reference = shopNirCreateReference($db, $referenceBody, $user);
                $lines[$index]['supplier_product_reference_id'] = $reference['id'];
            }
        }
        if ($referenceId === '') {
            $reference = shopNirCreateReference($db, $referenceBody, $user);
            $lines[$index]['supplier_product_reference_id'] = $reference['id'];
        }
        // Store the invoice name as an independent alias as well. Thus a later
        // invoice without a code can still identify the product for this same
        // supplier, and a new invoice name never depends on the internal SKU.
        if ($supplierCode !== '' && $supplierName !== '') {
            $nameReferenceBody = array_merge($referenceBody, ['supplier_product_code' => '']);
            if ($explicitReassignment) {
                $nameKey = shopNirSupplierProductNameKey($supplierName);
                $nameReferenceStmt = $db->prepare('SELECT * FROM shop_supplier_product_references WHERE supplier_id = ? AND supplier_product_code_normalized = ? FOR UPDATE');
                $nameReferenceStmt->execute([$supplierId, $nameKey]);
                $nameReference = $nameReferenceStmt->fetch();
                if ($nameReference && (string)$nameReference['product_id'] !== $productId && (string)$nameReference['product_id'] === $previousProductId) {
                    shopNirReferenceUpdate($db, (string)$nameReference['id'], [
                        'row_version' => (int)$nameReference['row_version'],
                        'product_id' => $productId,
                        'is_active' => true,
                    ], $user);
                }
            }
            shopNirCreateReference($db, $nameReferenceBody, $user);
        }
    }
    return $lines;
}

/**
 * One-time/self-healing import for NIRs confirmed before supplier name aliases
 * were persisted. The invoice line remains the source and the internal SKU is
 * intentionally never consulted.
 */
function shopNirBackfillProductSupplierReferences(PDO $db, ?string $productId, array $user): array {
    $sql =
        'SELECT l.*, n.supplier_id
         FROM shop_nir_lines l
         INNER JOIN shop_nir_documents n ON n.id = l.nir_document_id AND n.status = "confirmed"
         WHERE l.product_id IS NOT NULL AND l.accepted_quantity > 0 AND COALESCE(l.resolution_status, "") <> "reversal"
           AND (TRIM(COALESCE(l.supplier_product_code, "")) <> "" OR TRIM(COALESCE(l.supplier_product_name, "")) <> "")';
    $params = [];
    if ($productId !== null && trim($productId) !== '') {
        $sql .= ' AND l.product_id = ?';
        $params[] = trim($productId);
    }
    $sql .= ' ORDER BY n.reception_date ASC, l.line_number ASC';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $updateLine = $db->prepare(
        'UPDATE shop_nir_lines SET supplier_product_reference_id = ?, updated_at = updated_at
         WHERE id = ? AND (supplier_product_reference_id IS NULL OR supplier_product_reference_id = "")'
    );
    $result = ['processed' => 0, 'linked_lines' => 0, 'conflicts' => 0, 'skipped' => 0];
    foreach ($stmt->fetchAll() as $line) {
        $result['processed']++;
        try {
            $bound = shopNirBindReferencesOnExplicitSave($db, [$line], ['supplier_id' => $line['supplier_id']], $user);
            $referenceId = trim((string)($bound[0]['supplier_product_reference_id'] ?? ''));
            if ($referenceId === '') { $result['skipped']++; continue; }
            $updateLine->execute([$referenceId, (string)$line['id']]);
            if ($updateLine->rowCount() > 0) $result['linked_lines']++;
        } catch (ShopNirHttpException $error) {
            if ($error->status === 409) { $result['conflicts']++; continue; }
            throw $error;
        } catch (InvalidArgumentException $error) {
            // Historical references to inactive suppliers remain visible from
            // the confirmed NIR history, but are not silently reactivated.
            $result['skipped']++;
        }
    }
    return $result;
}

function shopNirReferenceUpdate(PDO $db, string $id, array $body, array $user): array {
    $stmt = $db->prepare('SELECT * FROM shop_supplier_product_references WHERE id = ? FOR UPDATE');
    $stmt->execute([$id]);
    $current = $stmt->fetch();
    if (!$current) throw new ShopNirHttpException('Asocierea nu există.', 404);
    $expectedVersion = (int)($body['row_version'] ?? 0);
    if ($expectedVersion > 0 && $expectedVersion !== (int)$current['row_version']) {
        throw new ShopNirHttpException('Asocierea a fost modificată pe alt dispozitiv.', 409, ['conflict' => true, 'current' => shopNirReferenceRow($current)]);
    }
    $nextProductId = trim((string)($body['product_id'] ?? $current['product_id']));
    $nextActive = array_key_exists('is_active', $body) ? boolValue($body['is_active']) : (bool)$current['is_active'];
    $nextPrimary = array_key_exists('is_primary_for_supplier', $body) ? boolValue($body['is_primary_for_supplier']) : (bool)$current['is_primary_for_supplier'];
    if ($nextPrimary) {
        $db->prepare('UPDATE shop_supplier_product_references SET is_primary_for_supplier = 0, row_version = row_version + 1 WHERE supplier_id = ? AND product_id = ? AND id <> ?')->execute([(string)$current['supplier_id'], $nextProductId, $id]);
    }
    $actor = shopNirActor($user);
    $update = $db->prepare('UPDATE shop_supplier_product_references SET product_id = ?, is_primary_for_supplier = ?, is_active = ?, updated_by = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?');
    $update->execute([$nextProductId, $nextPrimary ? 1 : 0, $nextActive ? 1 : 0, $actor['name'], $id, (int)$current['row_version']]);
    if ($update->rowCount() !== 1) throw new ShopNirHttpException('Asocierea a fost modificată simultan.', 409, ['conflict' => true]);
    shopNirAudit($db, $user, $nextActive ? 'SUPPLIER_REFERENCE_UPDATED' : 'SUPPLIER_REFERENCE_DEACTIVATED', 'SupplierProductReference', $id, $current, ['product_id' => $nextProductId, 'is_primary_for_supplier' => $nextPrimary, 'is_active' => $nextActive]);
    $eventType = $nextActive ? 'SupplierProductReferenceUpdated' : 'SupplierProductReferenceDeactivated';
    $db->prepare('INSERT INTO shop_domain_outbox (id, event_type, aggregate_type, aggregate_id, payload_json) VALUES (?, ?, "SupplierProductReference", ?, ?)')
        ->execute([uuidV4(), $eventType, $id, json_encode(['reference_id' => $id, 'supplier_id' => $current['supplier_id'], 'product_id' => $nextProductId], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    $stmt = $db->prepare('SELECT r.*, p.name AS product_name, p.sku AS product_sku FROM shop_supplier_product_references r INNER JOIN shop_products p ON p.id = r.product_id WHERE r.id = ?');
    $stmt->execute([$id]);
    return shopNirReferenceRow($stmt->fetch());
}

function shopNirHeaderPayload(PDO $db, array $body, ?array $current = null): array {
    $settings = shopNirSettings($db);
    $now = new DateTimeImmutable();
    $today = $now->format('Y-m-d');
    $currentTime = $now->format('H:i:s');
    $currency = strtoupper(mb_substr(trim((string)($body['currency'] ?? $current['currency'] ?? 'RON')), 0, 3));
    if (!preg_match('/^[A-Z]{3}$/', $currency)) throw new InvalidArgumentException('Moneda trebuie să aibă cod ISO din 3 litere.');
    $exchangeRate = shopNirScaledToDecimal(shopNirDecimalToScaled($body['exchange_rate'] ?? $current['exchange_rate'] ?? ($currency === 'RON' ? 1 : 0), 8, 'Cursul valutar'), 8);
    if (shopNirDecimalToScaled($exchangeRate, 8) <= 0) throw new InvalidArgumentException('Cursul valutar trebuie să fie mai mare decât zero.');
    if ($currency === 'RON') $exchangeRate = '1.00000000';
    $nirDate = shopNirDate($body['nir_date'] ?? $current['nir_date'] ?? $body['reception_date'] ?? $current['reception_date'] ?? $today, 'Data NIR-ului');
    $receptionDate = shopNirDate($body['reception_date'] ?? $current['reception_date'] ?? $nirDate, 'Data recepției');
    $nirTime = shopNirTime($body['nir_time'] ?? $current['nir_time'] ?? $body['reception_time'] ?? $current['reception_time'] ?? $currentTime, 'Ora NIR-ului');
    $receptionTime = shopNirTime($body['reception_time'] ?? $current['reception_time'] ?? $nirTime, 'Ora recepției');
    $supplierInvoiceDate = shopNirDate($body['supplier_invoice_date'] ?? $current['supplier_invoice_date'] ?? '', 'Data facturii', true);
    $exchangeRateDate = $currency === 'RON'
        ? ($supplierInvoiceDate ?: $nirDate)
        : shopNirDate($body['exchange_rate_date'] ?? $current['exchange_rate_date'] ?? '', 'Data cursului', true);
    return [
        'supplier_id' => trim((string)($body['supplier_id'] ?? $current['supplier_id'] ?? '')) ?: null,
        'warehouse_id' => trim((string)($body['warehouse_id'] ?? $current['warehouse_id'] ?? $settings['default_warehouse_id'])),
        'supplier_invoice_series' => mb_substr(strtoupper(trim((string)($body['supplier_invoice_series'] ?? $current['supplier_invoice_series'] ?? ''))), 0, 60) ?: null,
        'supplier_invoice_number' => mb_substr(trim((string)($body['supplier_invoice_number'] ?? $current['supplier_invoice_number'] ?? '')), 0, 120) ?: null,
        'supplier_invoice_date' => $supplierInvoiceDate,
        'nir_date' => $nirDate,
        'nir_time' => $nirTime,
        'reception_date' => $receptionDate,
        'reception_time' => $receptionTime,
        'currency' => $currency,
        'exchange_rate' => $exchangeRate,
        'exchange_rate_date' => $exchangeRateDate,
        'notes' => trim((string)($body['notes'] ?? $current['notes'] ?? '')) ?: null,
        'source_type' => mb_substr(trim((string)($body['source_type'] ?? $current['source_type'] ?? 'manual')), 0, 30),
        'external_identifier' => mb_substr(trim((string)($body['external_identifier'] ?? $current['external_identifier'] ?? '')), 0, 180) ?: null,
        'source_file_hash' => mb_substr(trim((string)($body['source_file_hash'] ?? $current['source_file_hash'] ?? '')), 0, 64) ?: null,
    ];
}

function shopNirPrepareLines(PDO $db, array $lines, array $header): array {
    if (count($lines) > 1000) throw new InvalidArgumentException('Un NIR poate conține maximum 1000 de poziții.');
    $settings = shopNirSettings($db);
    $prepared = [];
    $productSnapshots = [];
    $productIds = array_values(array_unique(array_filter(array_map(static fn($line): string => is_array($line) ? trim((string)($line['product_id'] ?? '')) : '', $lines))));
    if ($productIds) {
        $placeholders = implode(',', array_fill(0, count($productIds), '?'));
        $snapshotStmt = $db->prepare("SELECT id, name, sku, ean FROM shop_products WHERE id IN ({$placeholders})");
        $snapshotStmt->execute($productIds);
        foreach ($snapshotStmt->fetchAll() as $snapshot) $productSnapshots[(string)$snapshot['id']] = $snapshot;
    }
    $totals = ['subtotal' => 0, 'vat_total' => 0, 'grand_total' => 0, 'subtotal_ron' => 0, 'vat_total_ron' => 0, 'grand_total_ron' => 0, 'inventory_cost_total_ron' => 0, 'total_difference_ron' => 0];
    foreach (array_values($lines) as $index => $line) {
        if (!is_array($line)) throw new InvalidArgumentException('O poziție NIR are format invalid.');
        $line['exchange_rate'] = $header['exchange_rate'];
        $calculated = shopNirCalculateLine($line, (bool)$settings['include_vat_in_inventory_cost']);
        $productId = trim((string)($line['product_id'] ?? '')) ?: null;
        $referenceId = trim((string)($line['supplier_product_reference_id'] ?? '')) ?: null;
        $code = mb_substr(trim((string)($line['supplier_product_code'] ?? '')), 0, 180) ?: null;
        $name = mb_substr(trim((string)($line['supplier_product_name'] ?? $line['product_name'] ?? '')), 0, 255);
        if ($name === '') $name = 'Poziție fără denumire';
        $referenceMatchedByName = false;
        if ($referenceId !== null) {
            $reference = $db->prepare('SELECT supplier_id, product_id, supplier_product_code_original, supplier_product_code_normalized FROM shop_supplier_product_references WHERE id = ? AND is_active = 1');
            $reference->execute([$referenceId]);
            $referenceRow = $reference->fetch();
            if (!$referenceRow || (string)$referenceRow['supplier_id'] !== (string)($header['supplier_id'] ?? '')) {
                $referenceId = null;
            } else {
                $productId = (string)$referenceRow['product_id'];
                $referenceMatchedByName = trim((string)$referenceRow['supplier_product_code_original']) === ''
                    && str_starts_with((string)$referenceRow['supplier_product_code_normalized'], '__NAME__');
            }
        }
        $requestedResolution = trim((string)($line['resolution_status'] ?? ''));
        $matchedByName = $productId !== null && ($referenceMatchedByName || ($referenceId === null && $requestedResolution === 'matched_name'));
        $resolution = $productId !== null ? ($matchedByName ? 'matched_name' : ($referenceId !== null ? 'matched_code' : 'matched_manual')) : 'unmatched';
        $snapshot = $productId !== null ? ($productSnapshots[$productId] ?? null) : null;
        $receivedScaled = shopNirDecimalToScaled($line['received_quantity'] ?? $line['accepted_quantity'] ?? $line['invoiced_quantity'] ?? 0, 4, 'Cantitatea recepționată');
        $rejectedScaled = shopNirDecimalToScaled($line['rejected_quantity'] ?? 0, 4, 'Cantitatea respinsă');
        if ($receivedScaled < 0 || $rejectedScaled < 0) throw new InvalidArgumentException('Cantitățile recepționată și respinsă nu pot fi negative.');
        $receivedQuantity = shopNirScaledToDecimal($receivedScaled, 4);
        $isStockItem = array_key_exists('is_stock_item', $line) ? (bool)$line['is_stock_item'] : true;
        $legacyDifference = trim((string)($line['mismatch_reason'] ?? ''));
        $differenceReason = strtolower(trim((string)($line['difference_reason'] ?? ($legacyDifference !== '' ? 'other' : ''))));
        $allowedDifferenceReasons = ['shortage', 'surplus', 'damaged', 'wrong_product', 'price_difference', 'vat_difference', 'rejected', 'other'];
        if ($differenceReason !== '' && !in_array($differenceReason, $allowedDifferenceReasons, true)) throw new InvalidArgumentException('Motivul diferenței nu este valid.');
        $differenceNotes = mb_substr(trim((string)($line['difference_notes'] ?? $legacyDifference)), 0, 500) ?: null;
        $preparedLine = [
            'id' => trim((string)($line['id'] ?? '')) ?: uuidV4(),
            'line_number' => $index + 1,
            'product_id' => $productId,
            'supplier_product_reference_id' => $referenceId,
            'supplier_product_code' => $code,
            'supplier_product_code_normalized' => $code !== null ? shopNirNormalizeSupplierCode($code) : null,
            'supplier_product_name' => $name,
            'supplier_ean' => mb_substr(trim((string)($line['supplier_ean'] ?? '')), 0, 120) ?: null,
            'supplier_description' => trim((string)($line['supplier_description'] ?? '')) ?: null,
            'raw_description' => trim((string)($line['raw_description'] ?? '')) ?: null,
            'product_snapshot_name' => $snapshot['name'] ?? ($line['product_snapshot_name'] ?? $line['product_name'] ?? null),
            'sku_snapshot' => $snapshot['sku'] ?? ($line['sku_snapshot'] ?? null),
            'ean_snapshot' => $snapshot['ean'] ?? ($line['ean_snapshot'] ?? null),
            'purchase_unit' => mb_substr(trim((string)($line['purchase_unit'] ?? 'buc')), 0, 40),
            'stock_unit' => mb_substr(trim((string)($line['stock_unit'] ?? 'buc')), 0, 40),
            'invoiced_quantity' => shopNirScaledToDecimal(shopNirDecimalToScaled($line['invoiced_quantity'] ?? $line['accepted_quantity'] ?? $line['quantity'] ?? 0, 4, 'Cantitatea facturată'), 4),
            'received_quantity' => $receivedQuantity,
            'accepted_quantity' => $calculated['accepted_quantity'],
            'rejected_quantity' => shopNirScaledToDecimal($rejectedScaled, 4),
            'conversion_factor' => $calculated['conversion_factor'],
            'stock_quantity' => $calculated['stock_quantity'],
            'unit_price' => $calculated['unit_price'],
            'discount_percent' => $calculated['discount_percent'],
            'discount_value' => $calculated['line_discount'],
            'vat_rate' => $calculated['vat_rate'],
            'line_net' => $calculated['line_net'],
            'line_vat' => $calculated['line_vat'],
            'line_total' => $calculated['line_total'],
            'line_net_ron' => $calculated['line_net_ron'],
            'line_vat_ron' => $calculated['line_vat_ron'],
            'line_total_ron' => $calculated['line_total_ron'],
            'allocated_cost_ron' => shopNirScaledToDecimal(shopNirDecimalToScaled($line['allocated_cost_ron'] ?? 0, 2, 'Costul alocat'), 2),
            'inventory_unit_cost_ron' => $calculated['inventory_unit_cost_ron'],
            'inventory_cost_total_ron' => $calculated['inventory_cost_total_ron'],
            'resolution_status' => $resolution,
            'match_method' => $matchedByName ? 'name_exact' : ($referenceId !== null ? 'supplier_code' : ($productId !== null ? 'manual' : 'unmatched')),
            'match_confidence' => $referenceId !== null ? '1.0000' : ($productId !== null ? '1.0000' : '0.0000'),
            'is_stock_item' => $isStockItem ? 1 : 0,
            'difference_reason' => $differenceReason ?: null,
            'difference_notes' => $differenceNotes,
            'mismatch_reason' => $differenceNotes ?: ($differenceReason ?: null),
        ];
        foreach (['subtotal' => 'line_net', 'vat_total' => 'line_vat', 'grand_total' => 'line_total'] as $total => $field) {
            $totals[$total] += shopNirDecimalToScaled($preparedLine[$field], 2);
        }
        foreach (['subtotal_ron' => 'line_net_ron', 'vat_total_ron' => 'line_vat_ron', 'grand_total_ron' => 'line_total_ron', 'inventory_cost_total_ron' => 'inventory_cost_total_ron'] as $total => $field) {
            $totals[$total] += shopNirDecimalToScaled($preparedLine[$field], 2);
        }
        $quantityDifference = abs(shopNirDecimalToScaled($preparedLine['invoiced_quantity'], 4) - shopNirDecimalToScaled($preparedLine['accepted_quantity'], 4));
        if ($quantityDifference > 0) {
            $differenceGross = shopNirMultiplyScaled($quantityDifference, 4, shopNirDecimalToScaled($preparedLine['unit_price'], 6), 6, 6);
            $differenceDiscount = shopNirDivideRounded(shopNirMultiplyScaled($differenceGross, 6, shopNirDecimalToScaled($preparedLine['discount_percent'], 4), 4, 6), 100);
            $differenceNet = $differenceGross - $differenceDiscount;
            $totals['total_difference_ron'] += shopNirMultiplyScaled($differenceNet, 6, shopNirDecimalToScaled($header['exchange_rate'], 8), 8, 2);
        }
        $prepared[] = $preparedLine;
    }
    foreach ($totals as $key => $value) $totals[$key] = shopNirScaledToDecimal($value, 2);
    return ['lines' => $prepared, 'totals' => $totals];
}

function shopNirWriteLines(PDO $db, string $documentId, array $prepared): void {
    $db->prepare('DELETE FROM shop_nir_lines WHERE nir_document_id = ?')->execute([$documentId]);
    $stmt = $db->prepare(
        'INSERT INTO shop_nir_lines
         (id, nir_document_id, line_number, product_id, supplier_product_reference_id, supplier_product_code, supplier_product_code_normalized,
          supplier_product_name, supplier_ean, supplier_description, raw_description, product_snapshot_name, sku_snapshot, ean_snapshot,
          purchase_unit, stock_unit, invoiced_quantity, received_quantity, accepted_quantity, rejected_quantity, conversion_factor, stock_quantity, unit_price,
          discount_percent, discount_value, vat_rate, line_net, line_vat, line_total, line_net_ron, line_vat_ron, line_total_ron, allocated_cost_ron,
          inventory_unit_cost_ron, inventory_cost_total_ron, resolution_status, match_method, match_confidence, is_stock_item,
          difference_reason, difference_notes, mismatch_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($prepared['lines'] as $line) {
        $stmt->execute([
            $line['id'], $documentId, $line['line_number'], $line['product_id'], $line['supplier_product_reference_id'], $line['supplier_product_code'], $line['supplier_product_code_normalized'],
            $line['supplier_product_name'], $line['supplier_ean'], $line['supplier_description'], $line['raw_description'], $line['product_snapshot_name'], $line['sku_snapshot'], $line['ean_snapshot'],
            $line['purchase_unit'], $line['stock_unit'], $line['invoiced_quantity'], $line['received_quantity'], $line['accepted_quantity'], $line['rejected_quantity'], $line['conversion_factor'], $line['stock_quantity'], $line['unit_price'],
            $line['discount_percent'], $line['discount_value'], $line['vat_rate'], $line['line_net'], $line['line_vat'], $line['line_total'], $line['line_net_ron'], $line['line_vat_ron'], $line['line_total_ron'], $line['allocated_cost_ron'],
            $line['inventory_unit_cost_ron'], $line['inventory_cost_total_ron'], $line['resolution_status'], $line['match_method'], $line['match_confidence'], $line['is_stock_item'],
            $line['difference_reason'], $line['difference_notes'], $line['mismatch_reason'],
        ]);
    }
}

function shopNirCreateDraft(PDO $db, array $body, array $user): array {
    $header = shopNirHeaderPayload($db, $body);
    $id = uuidV4();
    $temporaryNumber = 'DRAFT-' . (new DateTimeImmutable())->format('Ymd-His') . '-' . strtoupper(substr(str_replace('-', '', $id), 0, 6));
    $actor = shopNirActor($user);
    $db->beginTransaction();
    try {
        $rawLines = is_array($body['lines'] ?? null) ? $body['lines'] : [];
        $rawLines = shopNirBindReferencesOnExplicitSave($db, $rawLines, $header, $user);
        $prepared = shopNirPrepareLines($db, $rawLines, $header);
        $stmt = $db->prepare(
            'INSERT INTO shop_nir_documents
             (id, temporary_number, status, supplier_id, warehouse_id, supplier_invoice_series, supplier_invoice_number, supplier_invoice_date,
              nir_date, nir_time, reception_date, reception_time, currency, exchange_rate, exchange_rate_date, notes, source_type, external_identifier, source_file_hash,
              subtotal, vat_total, grand_total, subtotal_ron, vat_total_ron, grand_total_ron, inventory_cost_total_ron, total_difference_ron,
              created_by, updated_by)
             VALUES (?, ?, "draft", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $totals = $prepared['totals'];
        $stmt->execute([
            $id, $temporaryNumber, $header['supplier_id'], $header['warehouse_id'], $header['supplier_invoice_series'], $header['supplier_invoice_number'], $header['supplier_invoice_date'],
            $header['nir_date'], $header['nir_time'], $header['reception_date'], $header['reception_time'], $header['currency'], $header['exchange_rate'], $header['exchange_rate_date'], $header['notes'], $header['source_type'], $header['external_identifier'], $header['source_file_hash'],
            $totals['subtotal'], $totals['vat_total'], $totals['grand_total'], $totals['subtotal_ron'], $totals['vat_total_ron'], $totals['grand_total_ron'], $totals['inventory_cost_total_ron'], $totals['total_difference_ron'],
            $actor['name'], $actor['name'],
        ]);
        shopNirWriteLines($db, $id, $prepared);
        shopNirAudit($db, $user, 'NIR_DRAFT_CREATED', 'NirDocument', $id, null, ['temporary_number' => $temporaryNumber, 'line_count' => count($prepared['lines'])]);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
    return shopNirFetchDocument($db, $id, $user);
}

function shopNirUpdateDraft(PDO $db, string $id, array $body, array $user): array {
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT * FROM shop_nir_documents WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $current = $stmt->fetch();
        if (!$current) throw new ShopNirHttpException('NIR-ul nu există.', 404);
        if ((string)$current['status'] !== 'draft') throw new ShopNirHttpException('Un NIR confirmat este protejat. Folosește modul de corectare sau creează un document de storno.', 409);
        $expectedVersion = (int)($body['row_version'] ?? 0);
        if ($expectedVersion !== (int)$current['row_version']) {
            $db->rollBack();
            throw new ShopNirHttpException('Ciorna a fost modificată pe alt dispozitiv.', 409, ['conflict' => true, 'current' => shopNirFetchDocument($db, $id, $user)]);
        }
        $header = shopNirHeaderPayload($db, $body, $current);
        if (array_key_exists('lines', $body)) {
            $rawLines = is_array($body['lines']) ? $body['lines'] : [];
        } else {
            $existingLines = $db->prepare('SELECT * FROM shop_nir_lines WHERE nir_document_id = ? ORDER BY line_number');
            $existingLines->execute([$id]);
            $rawLines = $existingLines->fetchAll();
        }
        $rawLines = shopNirBindReferencesOnExplicitSave($db, $rawLines, $header, $user);
        $prepared = shopNirPrepareLines($db, $rawLines, $header);
        $totals = $prepared['totals'];
        $actor = shopNirActor($user);
        $update = $db->prepare(
            'UPDATE shop_nir_documents SET supplier_id = ?, warehouse_id = ?, supplier_invoice_series = ?, supplier_invoice_number = ?, supplier_invoice_date = ?,
             nir_date = ?, nir_time = ?, reception_date = ?, reception_time = ?, currency = ?, exchange_rate = ?, exchange_rate_date = ?, notes = ?, source_type = ?, external_identifier = ?, source_file_hash = ?,
             subtotal = ?, vat_total = ?, grand_total = ?, subtotal_ron = ?, vat_total_ron = ?, grand_total_ron = ?, inventory_cost_total_ron = ?, total_difference_ron = ?, updated_by = ?, row_version = row_version + 1
             WHERE id = ? AND row_version = ? AND status = "draft"'
        );
        $update->execute([
            $header['supplier_id'], $header['warehouse_id'], $header['supplier_invoice_series'], $header['supplier_invoice_number'], $header['supplier_invoice_date'],
            $header['nir_date'], $header['nir_time'], $header['reception_date'], $header['reception_time'], $header['currency'], $header['exchange_rate'], $header['exchange_rate_date'], $header['notes'], $header['source_type'], $header['external_identifier'], $header['source_file_hash'],
            $totals['subtotal'], $totals['vat_total'], $totals['grand_total'], $totals['subtotal_ron'], $totals['vat_total_ron'], $totals['grand_total_ron'], $totals['inventory_cost_total_ron'], $totals['total_difference_ron'],
            $actor['name'], $id, (int)$current['row_version'],
        ]);
        if ($update->rowCount() !== 1) throw new ShopNirHttpException('Ciorna a fost modificată simultan.', 409, ['conflict' => true]);
        shopNirWriteLines($db, $id, $prepared);
        shopNirAudit($db, $user, 'NIR_DRAFT_UPDATED', 'NirDocument', $id, ['row_version' => (int)$current['row_version']], ['row_version' => (int)$current['row_version'] + 1, 'line_count' => count($prepared['lines'])]);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
    return shopNirFetchDocument($db, $id, $user);
}

function shopNirDeleteDrafts(PDO $db, array $user, ?string $id = null): array {
    shopNirRequire($user, 'NIR_EDIT_DRAFT');
    $actor = shopNirActor($user);
    if ($id === null && $actor['role'] !== 'admin') {
        throw new ShopNirHttpException('Numai administratorul poate șterge toate ciornele NIR.', 403);
    }
    $params = [];
    $where = 'status = "draft"';
    if ($id !== null && trim($id) !== '') {
        $where .= ' AND id = ?';
        $params[] = trim($id);
    }
    $stmt = $db->prepare("SELECT id, temporary_number FROM shop_nir_documents WHERE {$where} FOR UPDATE");
    $db->beginTransaction();
    try {
        $stmt->execute($params);
        $documents = $stmt->fetchAll();
        $ids = array_values(array_map(static fn(array $row): string => (string)$row['id'], $documents));
        if (!$ids) {
            $db->commit();
            return ['success' => true, 'deleted' => 0, 'deleted_ids' => []];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $attachments = $db->prepare("SELECT storage_name FROM shop_nir_attachments WHERE nir_document_id IN ({$placeholders})");
        $attachments->execute($ids);
        $storedFiles = array_values(array_filter(array_map(static fn(array $row): string => trim((string)$row['storage_name']), $attachments->fetchAll())));
        $db->prepare("DELETE FROM shop_nir_attachments WHERE nir_document_id IN ({$placeholders})")->execute($ids);
        $db->prepare("DELETE FROM shop_nir_lines WHERE nir_document_id IN ({$placeholders})")->execute($ids);
        $db->prepare("DELETE FROM shop_nir_idempotency WHERE nir_document_id IN ({$placeholders})")->execute($ids);
        $db->prepare("DELETE FROM shop_nir_documents WHERE id IN ({$placeholders}) AND status = 'draft'")->execute($ids);
        shopNirAudit($db, $user, count($ids) === 1 ? 'NIR_DRAFT_DELETED' : 'NIR_DRAFTS_PURGED', 'NirDraftCollection', 'drafts', ['documents' => $documents], null, ['deleted_count' => count($ids)]);
        $db->commit();
        $uploadRoot = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'nir');
        foreach ($storedFiles as $relative) {
            $path = realpath(__DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative));
            if ($uploadRoot !== false && $path !== false && str_starts_with($path, $uploadRoot . DIRECTORY_SEPARATOR) && is_file($path)) @unlink($path);
        }
        return ['success' => true, 'deleted' => count($ids), 'deleted_ids' => $ids];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function shopNirDuplicateFingerprint(array $document): ?string {
    $supplierId = trim((string)($document['supplier_id'] ?? ''));
    $number = shopNirNormalizeSupplierCode(($document['supplier_invoice_series'] ?? '') . ' ' . ($document['supplier_invoice_number'] ?? ''));
    $date = trim((string)($document['supplier_invoice_date'] ?? ''));
    if ($supplierId === '' || $number === '' || $date === '') return null;
    return hash('sha256', implode('|', [
        $supplierId,
        $number,
        $date,
        (string)($document['grand_total'] ?? '0.00'),
        strtoupper((string)($document['currency'] ?? 'RON')),
        strtolower(trim((string)($document['source_file_hash'] ?? ''))),
        shopNirNormalizeSupplierCode($document['external_identifier'] ?? ''),
    ]));
}

function shopNirValidateDocument(PDO $db, string $id): array {
    $stmt = $db->prepare('SELECT * FROM shop_nir_documents WHERE id = ?');
    $stmt->execute([$id]);
    $document = $stmt->fetch();
    if (!$document) throw new ShopNirHttpException('NIR-ul nu există.', 404);
    $linesStmt = $db->prepare('SELECT * FROM shop_nir_lines WHERE nir_document_id = ? ORDER BY line_number');
    $linesStmt->execute([$id]);
    $lines = $linesStmt->fetchAll();
    $errors = [];
    $warnings = [];
    if ((string)$document['status'] !== 'draft') $errors[] = 'Documentul nu mai este ciornă.';
    if (trim((string)$document['supplier_id']) === '') $errors[] = 'Selectează furnizorul.';
    if (trim((string)$document['warehouse_id']) === '') $errors[] = 'Selectează gestiunea.';
    if (trim((string)$document['supplier_invoice_number']) === '') $errors[] = 'Completează numărul facturii furnizorului.';
    if (trim((string)$document['supplier_invoice_date']) === '') $errors[] = 'Completează data facturii.';
    if (trim((string)$document['nir_date']) === '') $errors[] = 'Completează data NIR-ului.';
    if (trim((string)($document['nir_time'] ?? '')) === '') $errors[] = 'Completează ora NIR-ului.';
    if (trim((string)$document['reception_date']) === '') $errors[] = 'Completează data recepției.';
    if (trim((string)($document['reception_time'] ?? '')) === '') $errors[] = 'Completează ora recepției.';
    if ((string)$document['currency'] !== 'RON' && trim((string)$document['exchange_rate_date']) === '') $errors[] = 'Completează data cursului valutar.';
    if (shopNirDecimalToScaled($document['exchange_rate'], 8, 'Cursul valutar') <= 0) $errors[] = 'Cursul valutar trebuie să fie mai mare decât zero.';
    if (!$lines) $errors[] = 'Adaugă cel puțin o poziție.';

    $supplierCheck = $db->prepare('SELECT is_active FROM shop_suppliers WHERE id = ?');
    $supplierCheck->execute([(string)$document['supplier_id']]);
    if (!$supplierCheck->fetchColumn()) $errors[] = 'Furnizorul nu există sau este inactiv.';
    $warehouseCheck = $db->prepare('SELECT is_active FROM shop_warehouses WHERE id = ?');
    $warehouseCheck->execute([(string)$document['warehouse_id']]);
    if (!$warehouseCheck->fetchColumn()) $errors[] = 'Gestiunea nu există sau este inactivă.';

    $referenceCheck = $db->prepare('SELECT supplier_id, product_id, is_active FROM shop_supplier_product_references WHERE id = ?');
    $comparedLines = shopNirAttachPriceComparisons($db, array_map(static fn(array $line): array => shopNirLineRow($line), $lines), $document);
    foreach ($comparedLines as $line) {
        $label = 'Poziția ' . (int)$line['line_number'];
        $isStockItem = !isset($line['is_stock_item']) || (bool)$line['is_stock_item'];
        if ($isStockItem && trim((string)$line['product_id']) === '') $errors[] = $label . ': produs neasociat.';
        if (shopNirDecimalToScaled($line['accepted_quantity'], 4) <= 0) $errors[] = $label . ': cantitatea acceptată trebuie să fie mai mare decât zero.';
        if (shopNirDecimalToScaled($line['unit_price'], 6) < 0) $errors[] = $label . ': preț invalid.';
        $code = trim((string)$line['supplier_product_code']);
        if ($isStockItem && $code === '') {
            $warnings[] = $label . ': codul furnizorului lipsește.';
        } elseif ($isStockItem && trim((string)$line['supplier_product_reference_id']) === '') {
            $errors[] = $label . ': codul furnizorului nu este salvat ca asociere permanentă.';
        } elseif ($isStockItem) {
            $referenceCheck->execute([(string)$line['supplier_product_reference_id']]);
            $reference = $referenceCheck->fetch();
            if (!$reference || !(bool)$reference['is_active'] || (string)$reference['supplier_id'] !== (string)$document['supplier_id'] || (string)$reference['product_id'] !== (string)$line['product_id']) {
                $errors[] = $label . ': asocierea furnizor–produs nu mai este validă.';
            }
        }
        $invoiced = shopNirDecimalToScaled($line['invoiced_quantity'], 4);
        $received = shopNirDecimalToScaled($line['received_quantity'] ?? $line['accepted_quantity'], 4);
        $accepted = shopNirDecimalToScaled($line['accepted_quantity'], 4);
        if ($received < 0 || $accepted > $received) $errors[] = $label . ': cantitatea acceptată nu poate depăși cantitatea recepționată.';
        if ($invoiced !== $received || $received !== $accepted || shopNirDecimalToScaled($line['rejected_quantity'], 4) > 0) {
            if (trim((string)($line['difference_reason'] ?? '')) === '') $errors[] = $label . ': selectează motivul diferenței dintre facturat, recepționat și acceptat.';
            if ((string)($line['difference_reason'] ?? '') === 'other' && trim((string)($line['difference_notes'] ?? '')) === '') $errors[] = $label . ': completează explicația pentru „Alt motiv”.';
        }
        if (!empty($line['price_comparison']['is_significant'])) {
            $warnings[] = $label . ': prețul diferă cu ' . $line['price_comparison']['variance_percent'] . '% față de ultima achiziție. Verifică valoarea.';
        }
    }
    $fingerprint = shopNirDuplicateFingerprint($document);
    $duplicate = null;
    if ($fingerprint !== null) {
        $dup = $db->prepare('SELECT id, nir_number, reception_date FROM shop_nir_documents WHERE duplicate_fingerprint = ? AND id <> ? AND status IN ("confirmed", "reversed") LIMIT 1');
        $dup->execute([$fingerprint, $id]);
        $duplicate = $dup->fetch() ?: null;
        if ($duplicate) $errors[] = 'Factura furnizorului există deja într-un NIR confirmat.';
    }
    if (!$duplicate && trim((string)$document['supplier_id']) !== '' && trim((string)$document['supplier_invoice_number']) !== '') {
        $possibleStmt = $db->prepare(
            'SELECT id, nir_number, status, reception_date, grand_total, currency
             FROM shop_nir_documents
             WHERE id <> ? AND supplier_id = ? AND COALESCE(supplier_invoice_series, "") = COALESCE(?, "")
               AND supplier_invoice_number = ? AND supplier_invoice_date = ? AND status IN ("confirmed", "reversed")
             ORDER BY confirmed_at DESC LIMIT 1'
        );
        $possibleStmt->execute([$id, $document['supplier_id'], $document['supplier_invoice_series'], $document['supplier_invoice_number'], $document['supplier_invoice_date']]);
        $possible = $possibleStmt->fetch() ?: null;
        if ($possible) {
            $warnings[] = 'Factura pare să fie deja introdusă. Verifică documentul existent înainte de confirmare.';
            $duplicate = $possible;
        }
    }
    return [
        'valid' => count($errors) === 0,
        'errors' => array_values(array_unique($errors)),
        'warnings' => array_values(array_unique($warnings)),
        'duplicate' => $duplicate,
        'fingerprint' => $fingerprint,
        'line_count' => count($lines),
    ];
}

function shopNirConfirm(PDO $db, string $id, array $body, array $user): array {
    $idempotencyKey = mb_substr(trim((string)($body['idempotency_key'] ?? requestHeader('Idempotency-Key'))), 0, 120);
    if ($idempotencyKey === '') throw new InvalidArgumentException('Cheia de idempotency este obligatorie la confirmare.');
    $expectedVersion = (int)($body['row_version'] ?? 0);
    if ($expectedVersion <= 0) throw new InvalidArgumentException('Versiunea ciornei este obligatorie la confirmare.');
    $requestHash = hash('sha256', $id . '|' . $expectedVersion . '|' . $idempotencyKey);
    $actor = shopNirActor($user);
    $db->beginTransaction();
    try {
        $insertKey = $db->prepare('INSERT IGNORE INTO shop_nir_idempotency (idempotency_key, nir_document_id, request_hash) VALUES (?, ?, ?)');
        $insertKey->execute([$idempotencyKey, $id, $requestHash]);
        if ($insertKey->rowCount() === 0) {
            $existingKey = $db->prepare('SELECT * FROM shop_nir_idempotency WHERE idempotency_key = ? FOR UPDATE');
            $existingKey->execute([$idempotencyKey]);
            $keyRow = $existingKey->fetch();
            if (!$keyRow || (string)$keyRow['nir_document_id'] !== $id || (string)$keyRow['request_hash'] !== $requestHash) {
                throw new ShopNirHttpException('Cheia de idempotency a fost folosită pentru altă cerere.', 409);
            }
            if (!empty($keyRow['response_json'])) {
                $cached = json_decode((string)$keyRow['response_json'], true);
                $db->commit();
                return is_array($cached) ? $cached : shopNirFetchDocument($db, $id, $user);
            }
        }

        $lock = $db->prepare('SELECT * FROM shop_nir_documents WHERE id = ? FOR UPDATE');
        $lock->execute([$id]);
        $document = $lock->fetch();
        if (!$document) throw new ShopNirHttpException('NIR-ul nu există.', 404);
        if ((string)$document['status'] === 'confirmed') {
            $result = shopNirFetchDocument($db, $id, $user);
            $db->prepare('UPDATE shop_nir_idempotency SET response_json = ?, completed_at = NOW() WHERE idempotency_key = ?')->execute([json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $idempotencyKey]);
            $db->commit();
            return $result;
        }
        if ((string)$document['status'] !== 'draft') throw new ShopNirHttpException('Doar o ciornă poate fi confirmată.', 409);
        if ((int)$document['row_version'] !== $expectedVersion) throw new ShopNirHttpException('Ciorna a fost modificată pe alt dispozitiv. Reîncarcă documentul înainte de confirmare.', 409, ['conflict' => true]);

        $lineStmt = $db->prepare('SELECT * FROM shop_nir_lines WHERE nir_document_id = ? ORDER BY line_number FOR UPDATE');
        $lineStmt->execute([$id]);
        $storedLines = $lineStmt->fetchAll();
        $header = shopNirHeaderPayload($db, [], $document);
        $storedLines = shopNirBindReferencesOnExplicitSave($db, $storedLines, $header, $user);
        $prepared = shopNirPrepareLines($db, $storedLines, $header);
        shopNirWriteLines($db, $id, $prepared);
        $totals = $prepared['totals'];
        $db->prepare('UPDATE shop_nir_documents SET subtotal = ?, vat_total = ?, grand_total = ?, subtotal_ron = ?, vat_total_ron = ?, grand_total_ron = ?, inventory_cost_total_ron = ?, total_difference_ron = ? WHERE id = ?')
            ->execute([$totals['subtotal'], $totals['vat_total'], $totals['grand_total'], $totals['subtotal_ron'], $totals['vat_total_ron'], $totals['grand_total_ron'], $totals['inventory_cost_total_ron'], $totals['total_difference_ron'], $id]);

        $validation = shopNirValidateDocument($db, $id);
        if (!$validation['valid']) throw new ShopNirHttpException('NIR-ul nu poate fi confirmat.', 422, ['validation' => $validation]);
        $nirNumber = trim((string)($document['nir_number'] ?? ''));
        if ($nirNumber === '') {
            $settings = shopNirSettings($db, true);
            $sequence = (int)$settings['next_sequence'];
            $nirNumber = trim((string)$settings['number_prefix']) . '-' . substr((string)$document['nir_date'], 0, 4) . '-' . str_pad((string)$sequence, 6, '0', STR_PAD_LEFT);
            $db->prepare('UPDATE shop_nir_settings SET next_sequence = next_sequence + 1 WHERE id = 1')->execute();
        }

        $productLock = $db->prepare('SELECT id, accounting_stock_quantity FROM shop_products WHERE id = ? FOR UPDATE');
        $updateProduct = $db->prepare('UPDATE shop_products SET accounting_stock_quantity = accounting_stock_quantity + ?, cost_price = ? WHERE id = ?');
        $readProductStock = $db->prepare('SELECT accounting_stock_quantity FROM shop_products WHERE id = ?');
        $insertMovement = $db->prepare(
            'INSERT INTO shop_inventory_movements
             (id, product_id, warehouse_id, order_id, nir_document_id, nir_line_id, inventory_cost_layer_id, movement_type,
              quantity_delta, quantity_after, accounting_quantity_delta, accounting_quantity_after, inventory_unit_cost_ron,
              inventory_cost_total_ron, reception_date, note, created_by)
             VALUES (?, ?, ?, NULL, ?, ?, ?, "NIR_IN", ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insertLayer = $db->prepare(
            'INSERT INTO shop_inventory_cost_layers
             (id, product_id, warehouse_id, supplier_id, supplier_product_reference_id, nir_document_id, nir_line_id,
              source_type, source_reference, invoice_number_snapshot, supplier_code_snapshot, reception_date, confirmed_at,
              original_quantity, remaining_quantity, stock_unit, unit_cost_ron, total_cost_ron, currency, original_unit_price,
              exchange_rate, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, "NIR", ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, "open", ?)'
        );
        $updateReference = $db->prepare(
            'UPDATE shop_supplier_product_references
             SET last_used_at = NOW(), last_confirmed_purchase_price = ?, last_confirmed_currency = ?, last_confirmed_price_ron = ?,
                 last_confirmed_at = NOW(), updated_by = ?, row_version = row_version + 1
             WHERE id = ? AND supplier_id = ? AND product_id = ? AND is_active = 1'
        );
        foreach ($prepared['lines'] as $line) {
            if (empty($line['is_stock_item'])) continue;
            $productId = (string)$line['product_id'];
            $productLock->execute([$productId]);
            $product = $productLock->fetch();
            if (!$product) throw new InvalidArgumentException('Un produs asociat nu mai există.');
            $displayCost = shopNirScaledToDecimal(shopNirDecimalToScaled($line['inventory_unit_cost_ron'], 2), 2);
            $updateProduct->execute([$line['stock_quantity'], $displayCost, $productId]);
            $readProductStock->execute([$productId]);
            $quantityAfter = (string)$readProductStock->fetchColumn();
            $movementId = uuidV4();
            $layerId = uuidV4();
            $compatDelta = shopNirDecimalToScaled($line['stock_quantity'], 0);
            $compatAfter = shopNirDecimalToScaled($quantityAfter, 0);
            $insertMovement->execute([
                $movementId, $productId, (string)$document['warehouse_id'], $id, $line['id'], $layerId,
                $compatDelta, $compatAfter, $line['stock_quantity'], $quantityAfter, $line['inventory_unit_cost_ron'],
                $line['inventory_cost_total_ron'], (string)$document['reception_date'], 'Recepție ' . $nirNumber, $actor['name'],
            ]);
            $insertLayer->execute([
                $layerId, $productId, (string)$document['warehouse_id'], (string)$document['supplier_id'], $line['supplier_product_reference_id'], $id, $line['id'],
                $nirNumber, trim((string)($document['supplier_invoice_series'] ?? '') . ' ' . (string)($document['supplier_invoice_number'] ?? '')),
                $line['supplier_product_code'], (string)$document['reception_date'], $line['stock_quantity'], $line['stock_quantity'], $line['stock_unit'],
                $line['inventory_unit_cost_ron'], $line['inventory_cost_total_ron'], (string)$document['currency'], $line['unit_price'],
                $document['exchange_rate'], $actor['name'],
            ]);
            if (!empty($line['supplier_product_reference_id'])) {
                $unitPriceRon = shopNirMultiplyScaled(shopNirDecimalToScaled($line['unit_price'], 6), 6, shopNirDecimalToScaled($document['exchange_rate'], 8), 8, 6);
                $updateReference->execute([
                    $line['unit_price'], (string)$document['currency'], shopNirScaledToDecimal($unitPriceRon, 6), $actor['name'],
                    $line['supplier_product_reference_id'], (string)$document['supplier_id'], $productId,
                ]);
                if ($updateReference->rowCount() !== 1) throw new InvalidArgumentException('O asociere furnizor–produs s-a schimbat în timpul confirmării.');
            }
            shopNirAudit($db, $user, 'FIFO_LAYER_CREATED', 'InventoryCostLayer', $layerId, null, ['nir_line_id' => $line['id'], 'quantity' => $line['stock_quantity'], 'unit_cost_ron' => $line['inventory_unit_cost_ron']]);
            $db->prepare('INSERT INTO shop_domain_outbox (id, event_type, aggregate_type, aggregate_id, payload_json) VALUES (?, "InventoryCostLayerCreated", "InventoryCostLayer", ?, ?)')
                ->execute([uuidV4(), $layerId, json_encode(['layer_id' => $layerId, 'nir_id' => $id, 'nir_line_id' => $line['id'], 'product_id' => $productId], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        }

        $confirm = $db->prepare(
            'UPDATE shop_nir_documents SET nir_number = ?, status = "confirmed", duplicate_fingerprint = ?, confirmed_at = NOW(), confirmed_by = ?, updated_by = ?, row_version = row_version + 1
             WHERE id = ? AND status = "draft" AND row_version = ?'
        );
        $confirm->execute([$nirNumber, $validation['fingerprint'], $actor['name'], $actor['name'], $id, $expectedVersion]);
        if ($confirm->rowCount() !== 1) throw new ShopNirHttpException('NIR-ul a fost modificat simultan și nu a fost confirmat.', 409, ['conflict' => true]);
        shopNirAudit($db, $user, 'NIR_CONFIRMED', 'NirDocument', $id, ['status' => 'draft'], ['status' => 'confirmed', 'nir_number' => $nirNumber, 'totals' => $totals]);
        $outbox = $db->prepare('INSERT INTO shop_domain_outbox (id, event_type, aggregate_type, aggregate_id, payload_json) VALUES (?, "NirConfirmed", "NirDocument", ?, ?)');
        $outbox->execute([uuidV4(), $id, json_encode(['nir_id' => $id, 'nir_number' => $nirNumber], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        $result = shopNirFetchDocument($db, $id, $user);
        $db->prepare('UPDATE shop_nir_idempotency SET response_json = ?, completed_at = NOW() WHERE idempotency_key = ?')->execute([json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $idempotencyKey]);
        $db->commit();
        return $result;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function shopNirReopenConfirmed(PDO $db, string $id, array $body, array $user): array {
    $expectedVersion = (int)($body['row_version'] ?? 0);
    if ($expectedVersion <= 0) throw new InvalidArgumentException('Versiunea NIR-ului este obligatorie pentru corectare.');
    $actor = shopNirActor($user);
    $db->beginTransaction();
    try {
        $documentStmt = $db->prepare('SELECT * FROM shop_nir_documents WHERE id = ? FOR UPDATE');
        $documentStmt->execute([$id]);
        $document = $documentStmt->fetch();
        if (!$document) throw new ShopNirHttpException('NIR-ul nu există.', 404);
        if (trim((string)($document['reversal_of_id'] ?? '')) !== '' || mb_strtolower((string)($document['source_type'] ?? '')) === 'reversal') {
            throw new ShopNirHttpException('Documentul de storno este definitiv și nu poate fi redeschis pentru corectare.', 409);
        }
        if ((string)$document['status'] !== 'confirmed') throw new ShopNirHttpException('Doar un NIR confirmat poate fi redeschis pentru corectare.', 409);
        if ((int)$document['row_version'] !== $expectedVersion) throw new ShopNirHttpException('NIR-ul a fost modificat pe alt dispozitiv. Reîncarcă documentul.', 409, ['conflict' => true]);
        $stornoCount = $db->prepare('SELECT COUNT(*) FROM shop_nir_documents WHERE reversal_of_id = ?');
        $stornoCount->execute([$id]);
        if ((int)$stornoCount->fetchColumn() > 0) {
            throw new ShopNirHttpException('NIR-ul are deja documente de storno și nu mai poate fi redeschis pentru corectare.', 409);
        }

        $layerStmt = $db->prepare('SELECT * FROM shop_inventory_cost_layers WHERE nir_document_id = ? ORDER BY created_at FOR UPDATE');
        $layerStmt->execute([$id]);
        $layers = $layerStmt->fetchAll();
        $consumptionStmt = $db->prepare('SELECT COUNT(*) FROM shop_inventory_layer_consumptions WHERE inventory_cost_layer_id = ?');
        foreach ($layers as $layer) {
            $consumptionStmt->execute([(string)$layer['id']]);
            if ((int)$consumptionStmt->fetchColumn() > 0 || shopNirDecimalToScaled($layer['remaining_quantity'], 4) !== shopNirDecimalToScaled($layer['original_quantity'], 4)) {
                throw new ShopNirHttpException('Acest NIR are deja cantități consumate în alte documente. Corectarea lui necesită mai întâi anularea documentelor de ieșire legate de aceste cantități.', 409, ['layer_id' => $layer['id']]);
            }
        }

        $affectedProducts = [];
        $subtractStock = $db->prepare('UPDATE shop_products SET accounting_stock_quantity = accounting_stock_quantity - ? WHERE id = ? AND accounting_stock_quantity >= ?');
        foreach ($layers as $layer) {
            $productId = (string)$layer['product_id'];
            $quantity = (string)$layer['original_quantity'];
            $subtractStock->execute([$quantity, $productId, $quantity]);
            if ($subtractStock->rowCount() !== 1) throw new ShopNirHttpException('Stocul contabil nu permite redeschiderea NIR-ului.', 409, ['product_id' => $productId]);
            $affectedProducts[$productId] = true;
        }
        $db->prepare('DELETE FROM shop_inventory_movements WHERE nir_document_id = ? AND movement_type = "NIR_IN"')->execute([$id]);
        $db->prepare('DELETE FROM shop_inventory_cost_layers WHERE nir_document_id = ?')->execute([$id]);

        $latestCost = $db->prepare('SELECT unit_cost_ron FROM shop_inventory_cost_layers WHERE product_id = ? AND is_reversed = 0 AND remaining_quantity > 0 ORDER BY reception_date DESC, confirmed_at DESC, created_at DESC LIMIT 1');
        $updateCost = $db->prepare('UPDATE shop_products SET cost_price = ? WHERE id = ?');
        foreach (array_keys($affectedProducts) as $productId) {
            $latestCost->execute([$productId]);
            $updateCost->execute([(string)($latestCost->fetchColumn() ?: '0'), $productId]);
        }

        $reopen = $db->prepare(
            'UPDATE shop_nir_documents
             SET status = "draft", confirmed_at = NULL, confirmed_by = NULL, duplicate_fingerprint = NULL,
                 updated_by = ?, row_version = row_version + 1
             WHERE id = ? AND status = "confirmed" AND row_version = ?'
        );
        $reopen->execute([$actor['name'], $id, $expectedVersion]);
        if ($reopen->rowCount() !== 1) throw new ShopNirHttpException('NIR-ul a fost modificat simultan și nu a putut fi redeschis.', 409, ['conflict' => true]);
        $db->prepare('DELETE FROM shop_nir_idempotency WHERE nir_document_id = ?')->execute([$id]);
        shopNirAudit($db, $user, 'NIR_REOPENED_FOR_CORRECTION', 'NirDocument', $id, ['status' => 'confirmed'], ['status' => 'draft', 'nir_number' => $document['nir_number']]);
        $db->prepare('INSERT INTO shop_domain_outbox (id, event_type, aggregate_type, aggregate_id, payload_json) VALUES (?, "NirReopenedForCorrection", "NirDocument", ?, ?)')
            ->execute([uuidV4(), $id, json_encode(['nir_id' => $id, 'nir_number' => $document['nir_number']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        $result = shopNirFetchDocument($db, $id, $user);
        $db->commit();
        return $result;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

/**
 * Normalizes both the new partial-storno payload and the legacy full reversal
 * request. Quantities are expressed in the purchase unit of the source line.
 */
function shopNirNormalizeStornoSelection(array $body, array $originalLines, array $alreadyStorned = []): array {
    $lineById = [];
    foreach ($originalLines as $line) $lineById[(string)($line['id'] ?? '')] = $line;

    $hasExplicitSelection = array_key_exists('lines', $body) || array_key_exists('line_id', $body) || array_key_exists('line_ids', $body);
    if (array_key_exists('lines', $body)) {
        if (!is_array($body['lines'])) throw new InvalidArgumentException('Selecția pentru stornare nu este validă.');
        $requested = $body['lines'];
    } elseif (array_key_exists('line_ids', $body)) {
        if (!is_array($body['line_ids'])) throw new InvalidArgumentException('Lista produselor pentru stornare nu este validă.');
        $requested = array_map(static fn($lineId): array => ['line_id' => $lineId], $body['line_ids']);
    } elseif (array_key_exists('line_id', $body)) {
        $requested = [['line_id' => $body['line_id'], 'quantity' => $body['quantity'] ?? null]];
    } else {
        // Backwards compatibility: the old endpoint sent only reason + row_version.
        $requested = array_map(static fn(array $line): array => ['line_id' => $line['id']], $originalLines);
    }
    if ($hasExplicitSelection && !$requested) throw new InvalidArgumentException('Selectează cel puțin un produs pentru stornare.');

    $selected = [];
    foreach ($requested as $request) {
        if (is_string($request)) $request = ['line_id' => $request];
        if (!is_array($request)) throw new InvalidArgumentException('O poziție selectată pentru stornare nu este validă.');
        $lineId = trim((string)($request['line_id'] ?? $request['id'] ?? ''));
        if ($lineId === '' || !isset($lineById[$lineId])) {
            throw new ShopNirHttpException('Produsul selectat nu aparține acestui NIR.', 422, ['line_id' => $lineId ?: null]);
        }
        if (isset($selected[$lineId])) throw new InvalidArgumentException('Același produs a fost selectat de două ori pentru stornare.');
        $line = $lineById[$lineId];
        $original = max(0, shopNirDecimalToScaled($line['accepted_quantity'] ?? 0, 4));
        $storned = max(0, (int)($alreadyStorned[$lineId]['accepted_quantity'] ?? $alreadyStorned[$lineId] ?? 0));
        $remaining = max(0, $original - $storned);
        if ($remaining === 0) {
            if (!$hasExplicitSelection) continue;
            throw new ShopNirHttpException('Produsul selectat este deja stornat integral.', 409, ['line_id' => $lineId]);
        }
        $rawQuantity = $request['quantity'] ?? null;
        $quantity = $rawQuantity === null || trim((string)$rawQuantity) === ''
            ? $remaining
            : shopNirDecimalToScaled($rawQuantity, 4, 'Cantitatea de stornat');
        if ($quantity <= 0) throw new InvalidArgumentException('Cantitatea de stornat trebuie să fie mai mare decât zero.');
        if ($quantity > $remaining) {
            throw new ShopNirHttpException('Cantitatea de stornat depășește cantitatea disponibilă pe NIR.', 409, [
                'line_id' => $lineId,
                'requested_quantity' => shopNirScaledToDecimal($quantity, 4),
                'stornable_quantity' => shopNirScaledToDecimal($remaining, 4),
            ]);
        }
        $selected[$lineId] = [
            'line' => $line,
            'quantity_scaled' => $quantity,
            'quantity' => shopNirScaledToDecimal($quantity, 4),
            'remaining_before_scaled' => $remaining,
            'is_final_for_line' => $quantity === $remaining,
        ];
    }
    if (!$selected) throw new ShopNirHttpException('NIR-ul este deja stornat integral.', 409);
    return array_values($selected);
}

/** Supplier-issued invoice/credit-note metadata for the negative document. */
function shopNirStornoInvoicePayload(array $body, array $originalDocument): array {
    $isNewUiRequest = array_key_exists('lines', $body) || array_key_exists('line_id', $body) || array_key_exists('line_ids', $body);
    $hasInvoicePatch = array_key_exists('supplier_invoice_series', $body)
        || array_key_exists('supplier_invoice_number', $body)
        || array_key_exists('supplier_invoice_date', $body);
    if (!$isNewUiRequest && !$hasInvoicePatch) {
        return [
            'supplier_invoice_series' => mb_substr(trim((string)($originalDocument['supplier_invoice_series'] ?? '')), 0, 60),
            'supplier_invoice_number' => mb_substr(trim((string)($originalDocument['supplier_invoice_number'] ?? '')), 0, 120),
            'supplier_invoice_date' => shopNirDate($originalDocument['supplier_invoice_date'] ?? $originalDocument['nir_date'] ?? '', 'Data facturii furnizorului pentru storno'),
            'legacy_fallback' => true,
        ];
    }

    if (!array_key_exists('supplier_invoice_series', $body)) {
        throw new InvalidArgumentException('Câmpul seriei facturii furnizorului pentru storno trebuie trimis; valoarea poate fi goală.');
    }
    $series = mb_substr(trim((string)$body['supplier_invoice_series']), 0, 60);
    $number = mb_substr(trim((string)($body['supplier_invoice_number'] ?? '')), 0, 120);
    if ($number === '') throw new InvalidArgumentException('Numărul facturii furnizorului pentru storno este obligatoriu.');
    $date = shopNirDate($body['supplier_invoice_date'] ?? '', 'Data facturii furnizorului pentru storno');
    return [
        'supplier_invoice_series' => $series,
        'supplier_invoice_number' => $number,
        'supplier_invoice_date' => $date,
        'legacy_fallback' => false,
    ];
}

function shopNirStornoNegativeDecimal($value, int $scale): string {
    return shopNirScaledToDecimal(-shopNirDecimalToScaled($value, $scale), $scale);
}

function shopNirReverse(PDO $db, string $id, array $body, array $user): array {
    $reason = mb_substr(trim((string)($body['reason'] ?? '')), 0, 500);
    if ($reason === '') throw new InvalidArgumentException('Motivul stornării este obligatoriu.');
    $expectedVersion = (int)($body['row_version'] ?? 0);
    if ($expectedVersion <= 0) throw new InvalidArgumentException('Versiunea NIR-ului este obligatorie pentru stornare.');
    $actor = shopNirActor($user);
    $db->beginTransaction();
    try {
        $docStmt = $db->prepare('SELECT * FROM shop_nir_documents WHERE id = ? FOR UPDATE');
        $docStmt->execute([$id]);
        $document = $docStmt->fetch();
        if (!$document) throw new ShopNirHttpException('NIR-ul nu există.', 404);
        if (trim((string)($document['reversal_of_id'] ?? '')) !== '' || mb_strtolower((string)($document['source_type'] ?? '')) === 'reversal') {
            throw new ShopNirHttpException('Un document de storno nu poate fi stornat din nou.', 409);
        }
        if ((string)$document['status'] !== 'confirmed') throw new ShopNirHttpException('Doar un NIR confirmat, nestornat integral, poate fi stornat.', 409);
        if ($expectedVersion !== (int)$document['row_version']) throw new ShopNirHttpException('NIR-ul a fost modificat pe alt dispozitiv.', 409, ['conflict' => true]);
        $stornoInvoice = shopNirStornoInvoicePayload($body, $document);
        $duplicateInvoice = $db->prepare(
            'SELECT id, nir_number
             FROM shop_nir_documents
             WHERE supplier_id <=> ? AND UPPER(TRIM(COALESCE(supplier_invoice_series, ""))) = UPPER(?)
               AND TRIM(COALESCE(supplier_invoice_number, "")) = ? AND supplier_invoice_date = ?
             LIMIT 1 FOR UPDATE'
        );
        $duplicateInvoice->execute([
            $document['supplier_id'], $stornoInvoice['supplier_invoice_series'],
            $stornoInvoice['supplier_invoice_number'], $stornoInvoice['supplier_invoice_date'],
        ]);
        if ($duplicate = $duplicateInvoice->fetch()) {
            // The legacy endpoint historically copied the original invoice onto
            // the reversal document; keep only that old behavior compatible.
            $isOriginalInvoice = (string)$duplicate['id'] === $id;
            if (!$stornoInvoice['legacy_fallback'] || !$isOriginalInvoice) {
                throw new ShopNirHttpException('Factura furnizorului pentru storno este deja folosită într-un alt document.', 409, [
                    'duplicate_document_id' => $duplicate['id'],
                    'duplicate_document_number' => $duplicate['nir_number'] ?? null,
                ]);
            }
        }

        $lineStmt = $db->prepare('SELECT * FROM shop_nir_lines WHERE nir_document_id = ? ORDER BY line_number FOR UPDATE');
        $lineStmt->execute([$id]);
        $originalLines = $lineStmt->fetchAll();
        if (!$originalLines) throw new ShopNirHttpException('NIR-ul nu are poziții care pot fi stornate.', 409);
        $lineById = [];
        foreach ($originalLines as $line) $lineById[(string)$line['id']] = $line;

        $priorStmt = $db->prepare(
            'SELECT sl.storno_of_line_id,
                    SUM(ABS(sl.accepted_quantity)) AS accepted_quantity,
                    SUM(ABS(sl.stock_quantity)) AS stock_quantity,
                    SUM(ABS(sl.line_net)) AS line_net, SUM(ABS(sl.line_vat)) AS line_vat,
                    SUM(ABS(sl.line_total)) AS line_total, SUM(ABS(sl.line_net_ron)) AS line_net_ron,
                    SUM(ABS(sl.line_vat_ron)) AS line_vat_ron, SUM(ABS(sl.line_total_ron)) AS line_total_ron,
                    SUM(ABS(sl.allocated_cost_ron)) AS allocated_cost_ron,
                    SUM(ABS(sl.inventory_cost_total_ron)) AS inventory_cost_total_ron
             FROM shop_nir_lines sl
             INNER JOIN shop_nir_documents sd ON sd.id = sl.nir_document_id
             WHERE sd.reversal_of_id = ? AND sl.storno_of_line_id IS NOT NULL
             GROUP BY sl.storno_of_line_id'
        );
        $priorStmt->execute([$id]);
        $alreadyStorned = [];
        foreach ($priorStmt->fetchAll() as $row) {
            $lineId = (string)$row['storno_of_line_id'];
            foreach ($row as $field => $value) {
                if ($field === 'storno_of_line_id') continue;
                $scale = in_array($field, ['accepted_quantity', 'stock_quantity'], true) ? 4 : (in_array($field, ['line_net', 'line_vat', 'line_total'], true) ? 6 : 2);
                $alreadyStorned[$lineId][$field] = max(0, shopNirDecimalToScaled($value ?? 0, $scale));
            }
        }
        $selection = shopNirNormalizeStornoSelection($body, $originalLines, $alreadyStorned);

        $layerStmt = $db->prepare('SELECT * FROM shop_inventory_cost_layers WHERE nir_document_id = ? ORDER BY created_at FOR UPDATE');
        $layerStmt->execute([$id]);
        $layers = $layerStmt->fetchAll();
        $layerByLine = [];
        foreach ($layers as $layer) $layerByLine[(string)$layer['nir_line_id']] = $layer;
        $consumptionStmt = $db->prepare('SELECT COUNT(*) FROM shop_inventory_layer_consumptions WHERE inventory_cost_layer_id = ? AND reversed_at IS NULL');
        foreach ($selection as $selected) {
            $line = $selected['line'];
            if (empty($line['is_stock_item'])) continue;
            $layer = $layerByLine[(string)$line['id']] ?? null;
            if (!$layer) throw new ShopNirHttpException('Produsul selectat nu mai are lotul contabil asociat.', 409, ['line_id' => $line['id']]);
            $consumptionStmt->execute([(string)$layer['id']]);
            if ((int)$consumptionStmt->fetchColumn() > 0) {
                throw new ShopNirHttpException('Produsul selectat este folosit de un document de ieșire. Anulează mai întâi ieșirea, apoi stornează produsul.', 409, ['layer_id' => $layer['id']]);
            }
            $priorStock = (int)($alreadyStorned[(string)$line['id']]['stock_quantity'] ?? 0);
            $expectedRemaining = shopNirDecimalToScaled($layer['original_quantity'], 4) - $priorStock;
            $actualRemaining = shopNirDecimalToScaled($layer['remaining_quantity'], 4);
            if ($actualRemaining !== $expectedRemaining) {
                throw new ShopNirHttpException('O parte din produsul selectat a fost deja consumată. Anulează mai întâi documentele de ieșire legate, apoi încearcă din nou.', 409, ['layer_id' => $layer['id']]);
            }
        }

        $settings = shopNirSettings($db, true);
        $sequence = (int)$settings['next_sequence'];
        $stornoDocumentDate = (string)$stornoInvoice['supplier_invoice_date'];
        $reversalNumber = trim((string)($settings['number_prefix'] ?? 'NIR')) . '-' . substr($stornoDocumentDate, 0, 4) . '-' . str_pad((string)$sequence, 6, '0', STR_PAD_LEFT);
        $db->prepare('UPDATE shop_nir_settings SET next_sequence = next_sequence + 1 WHERE id = 1')->execute();
        $reversalId = uuidV4();
        $temporaryNumber = 'DRAFT-NIR-' . strtoupper(substr(str_replace('-', '', $reversalId), 0, 8));

        $negative = 'shopNirStornoNegativeDecimal';
        $positiveLineData = [];
        $documentTotals = ['subtotal' => 0, 'vat_total' => 0, 'grand_total' => 0, 'subtotal_ron' => 0, 'vat_total_ron' => 0, 'grand_total_ron' => 0, 'inventory_cost_total_ron' => 0];
        foreach ($selection as $selected) {
            $line = $selected['line'];
            $lineId = (string)$line['id'];
            $quantityScaled = (int)$selected['quantity_scaled'];
            $originalQuantityScaled = max(1, shopNirDecimalToScaled($line['accepted_quantity'], 4));
            $allocated = shopNirDivideRounded(shopNirDecimalToScaled($line['allocated_cost_ron'] ?? 0, 2) * $quantityScaled, $originalQuantityScaled);
            $calculated = shopNirCalculateLine([
                'accepted_quantity' => shopNirScaledToDecimal($quantityScaled, 4),
                'conversion_factor' => $line['conversion_factor'],
                'unit_price' => $line['unit_price'],
                'discount_percent' => $line['discount_percent'],
                'vat_rate' => $line['vat_rate'],
                'exchange_rate' => $document['exchange_rate'],
                'allocated_cost_ron' => shopNirScaledToDecimal($allocated, 2),
            ], (bool)($settings['include_vat_in_inventory_cost'] ?? false));
            $data = $calculated + ['allocated_cost_ron' => shopNirScaledToDecimal($allocated, 2)];
            // The final chunk absorbs prior rounding so all storno documents add
            // up exactly to the values of the original NIR line.
            if ($selected['is_final_for_line']) {
                foreach (['line_net' => 6, 'line_vat' => 6, 'line_total' => 6, 'line_net_ron' => 2, 'line_vat_ron' => 2, 'line_total_ron' => 2, 'allocated_cost_ron' => 2, 'inventory_cost_total_ron' => 2] as $field => $scale) {
                    $originalValue = max(0, shopNirDecimalToScaled($line[$field] ?? 0, $scale));
                    $priorValue = (int)($alreadyStorned[$lineId][$field] ?? 0);
                    $data[$field] = shopNirScaledToDecimal(max(0, $originalValue - $priorValue), $scale);
                }
            }
            $positiveLineData[$lineId] = $data;
            foreach (['line_net' => ['subtotal', 6], 'line_vat' => ['vat_total', 6], 'line_total' => ['grand_total', 6], 'line_net_ron' => ['subtotal_ron', 2], 'line_vat_ron' => ['vat_total_ron', 2], 'line_total_ron' => ['grand_total_ron', 2], 'inventory_cost_total_ron' => ['inventory_cost_total_ron', 2]] as $field => [$totalField, $scale]) {
                $documentTotals[$totalField] += shopNirDecimalToScaled($data[$field] ?? 0, $scale);
            }
        }
        $insertDoc = $db->prepare(
            'INSERT INTO shop_nir_documents
             (id, temporary_number, nir_number, status, supplier_id, warehouse_id, supplier_invoice_series, supplier_invoice_number,
              supplier_invoice_date, nir_date, nir_time, reception_date, reception_time, currency, exchange_rate, exchange_rate_date, notes, source_type,
              subtotal, vat_total, grand_total, subtotal_ron, vat_total_ron, grand_total_ron, inventory_cost_total_ron,
              confirmed_at, confirmed_by, reversal_of_id, created_by, updated_by)
             VALUES (?, ?, ?, "confirmed", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "reversal", ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)'
        );
        $insertDoc->execute([
            $reversalId, $temporaryNumber, $reversalNumber, $document['supplier_id'], $document['warehouse_id'], $stornoInvoice['supplier_invoice_series'], $stornoInvoice['supplier_invoice_number'],
            $stornoInvoice['supplier_invoice_date'], $stornoDocumentDate, (new DateTimeImmutable())->format('H:i:s'), $stornoDocumentDate, (new DateTimeImmutable())->format('H:i:s'), $document['currency'], $document['exchange_rate'], $document['exchange_rate_date'],
            'Stornare ' . ($document['nir_number'] ?? $document['temporary_number'])
                . ' — factura originală ' . trim((string)($document['supplier_invoice_series'] ?? '') . ' ' . (string)($document['supplier_invoice_number'] ?? ''))
                . ' din ' . (string)($document['supplier_invoice_date'] ?? '') . ': ' . $reason,
            shopNirStornoNegativeDecimal(shopNirScaledToDecimal($documentTotals['subtotal'], 6), 6),
            shopNirStornoNegativeDecimal(shopNirScaledToDecimal($documentTotals['vat_total'], 6), 6),
            shopNirStornoNegativeDecimal(shopNirScaledToDecimal($documentTotals['grand_total'], 6), 6),
            shopNirStornoNegativeDecimal(shopNirScaledToDecimal($documentTotals['subtotal_ron'], 2), 2),
            shopNirStornoNegativeDecimal(shopNirScaledToDecimal($documentTotals['vat_total_ron'], 2), 2),
            shopNirStornoNegativeDecimal(shopNirScaledToDecimal($documentTotals['grand_total_ron'], 2), 2),
            shopNirStornoNegativeDecimal(shopNirScaledToDecimal($documentTotals['inventory_cost_total_ron'], 2), 2),
            $actor['name'], $id, $actor['name'], $actor['name'],
        ]);
        $insertReverseLine = $db->prepare(
            'INSERT INTO shop_nir_lines
             (id, nir_document_id, line_number, product_id, supplier_product_reference_id, supplier_product_code, supplier_product_name,
              supplier_ean, purchase_unit, stock_unit, invoiced_quantity, received_quantity, accepted_quantity, rejected_quantity, conversion_factor,
              stock_quantity, unit_price, discount_percent, vat_rate, line_net, line_vat, line_total, line_net_ron, line_vat_ron,
              line_total_ron, allocated_cost_ron, inventory_unit_cost_ron, inventory_cost_total_ron, resolution_status, is_stock_item, mismatch_reason, storno_of_line_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "reversal", ?, ?, ?)'
        );
        $insertReversalLine = static function (array $line, array $selected, array $data, string $reverseLineId) use ($insertReverseLine, $reversalId, $negative, $reason): void {
            $quantity = $selected['quantity'];
            $insertReverseLine->execute([
                $reverseLineId, $reversalId, (int)$line['line_number'], $line['product_id'], $line['supplier_product_reference_id'], $line['supplier_product_code'], $line['supplier_product_name'],
                $line['supplier_ean'], $line['purchase_unit'], $line['stock_unit'], $negative($quantity, 4), $negative($quantity, 4), $negative($quantity, 4),
                $line['conversion_factor'], $negative($data['stock_quantity'], 4), $line['unit_price'], $line['discount_percent'], $line['vat_rate'],
                $negative($data['line_net'], 6), $negative($data['line_vat'], 6), $negative($data['line_total'], 6), $negative($data['line_net_ron'], 2),
                $negative($data['line_vat_ron'], 2), $negative($data['line_total_ron'], 2), $negative($data['allocated_cost_ron'], 2),
                $line['inventory_unit_cost_ron'], $negative($data['inventory_cost_total_ron'], 2), (int)($line['is_stock_item'] ?? 1), $reason, $line['id'],
            ]);
        };
        $productLock = $db->prepare('SELECT accounting_stock_quantity FROM shop_products WHERE id = ? FOR UPDATE');
        $updateProduct = $db->prepare('UPDATE shop_products SET accounting_stock_quantity = accounting_stock_quantity - ? WHERE id = ? AND accounting_stock_quantity >= ?');
        $readStock = $db->prepare('SELECT accounting_stock_quantity FROM shop_products WHERE id = ?');
        $insertMovement = $db->prepare(
            'INSERT INTO shop_inventory_movements
             (id, product_id, warehouse_id, nir_document_id, nir_line_id, inventory_cost_layer_id, movement_type, quantity_delta,
              quantity_after, accounting_quantity_delta, accounting_quantity_after, inventory_unit_cost_ron, inventory_cost_total_ron,
              reception_date, reversal_of_movement_id, note, created_by)
             VALUES (?, ?, ?, ?, ?, ?, "NIR_REVERSAL", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $originalMovement = $db->prepare('SELECT id FROM shop_inventory_movements WHERE inventory_cost_layer_id = ? AND movement_type = "NIR_IN" LIMIT 1');
        $affectedProducts = [];
        $stornedLineIds = [];
        foreach ($selection as $selected) {
            $line = $selected['line'];
            $data = $positiveLineData[(string)$line['id']];
            $reverseLineId = uuidV4();
            $insertReversalLine($line, $selected, $data, $reverseLineId);
            $stornedLineIds[(string)$line['id']] = true;
            if (empty($line['is_stock_item'])) continue;
            $layer = $layerByLine[(string)$line['id']];
            $productId = (string)$layer['product_id'];
            $affectedProducts[$productId] = true;
            $productLock->execute([$productId]);
            $productLock->fetch();
            $stornoStockQuantity = (string)$data['stock_quantity'];
            $updateProduct->execute([$stornoStockQuantity, $productId, $stornoStockQuantity]);
            if ($updateProduct->rowCount() !== 1) throw new ShopNirHttpException('Stocul contabil nu permite stornarea cantității selectate.', 409, ['product_id' => $productId]);
            $readStock->execute([$productId]);
            $after = (string)$readStock->fetchColumn();
            $originalMovement->execute([(string)$layer['id']]);
            $originalMovementId = $originalMovement->fetchColumn() ?: null;
            $negativeQuantity = $negative($stornoStockQuantity, 4);
            $negativeTotal = $negative($data['inventory_cost_total_ron'], 2);
            $insertMovement->execute([
                uuidV4(), $productId, $layer['warehouse_id'], $reversalId, $reverseLineId, $layer['id'],
                shopNirDecimalToScaled($negativeQuantity, 0), shopNirDecimalToScaled($after, 0), $negativeQuantity, $after,
                $layer['unit_cost_ron'], $negativeTotal, (new DateTimeImmutable('today'))->format('Y-m-d'), $originalMovementId,
                'Stornare ' . $reversalNumber . ': ' . $reason, $actor['name'],
            ]);
            $newRemaining = shopNirDecimalToScaled($layer['remaining_quantity'], 4) - shopNirDecimalToScaled($stornoStockQuantity, 4);
            if ($newRemaining < 0) throw new ShopNirHttpException('Cantitatea selectată depășește lotul disponibil.', 409, ['layer_id' => $layer['id']]);
            $layerUpdate = $db->prepare('UPDATE shop_inventory_cost_layers SET remaining_quantity = ?, status = ?, is_reversed = ?, reversed_at = ?, row_version = row_version + 1 WHERE id = ? AND remaining_quantity = ?');
            $layerUpdate->execute([
                shopNirScaledToDecimal($newRemaining, 4), $newRemaining === 0 ? 'reversed' : 'open', $newRemaining === 0 ? 1 : 0,
                $newRemaining === 0 ? (new DateTimeImmutable())->format('Y-m-d H:i:s') : null, $layer['id'], $layer['remaining_quantity'],
            ]);
            if ($layerUpdate->rowCount() !== 1) throw new ShopNirHttpException('Lotul contabil a fost modificat simultan.', 409, ['conflict' => true, 'layer_id' => $layer['id']]);
        }
        $latestCost = $db->prepare('SELECT unit_cost_ron FROM shop_inventory_cost_layers WHERE product_id = ? AND is_reversed = 0 AND remaining_quantity > 0 ORDER BY reception_date DESC, confirmed_at DESC, created_at DESC LIMIT 1');
        $updateCost = $db->prepare('UPDATE shop_products SET cost_price = ? WHERE id = ?');
        foreach (array_keys($affectedProducts) as $productId) {
            $latestCost->execute([$productId]);
            $updateCost->execute([(string)($latestCost->fetchColumn() ?: '0'), $productId]);
        }
        $selectedQuantityByLine = [];
        foreach ($selection as $selected) $selectedQuantityByLine[(string)$selected['line']['id']] = (int)$selected['quantity_scaled'];
        $fullyStorned = true;
        foreach ($originalLines as $line) {
            $lineId = (string)$line['id'];
            $originalQuantity = max(0, shopNirDecimalToScaled($line['accepted_quantity'] ?? 0, 4));
            if ($originalQuantity === 0) continue;
            $prior = (int)($alreadyStorned[$lineId]['accepted_quantity'] ?? 0);
            $now = (int)($selectedQuantityByLine[$lineId] ?? 0);
            if ($prior + $now < $originalQuantity) { $fullyStorned = false; break; }
        }
        $updateOriginal = $db->prepare('UPDATE shop_nir_documents SET updated_by = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ? AND status = "confirmed"');
        $updateOriginal->execute([$actor['name'], $id, $expectedVersion]);
        if ($updateOriginal->rowCount() !== 1) throw new ShopNirHttpException('NIR-ul a fost modificat simultan.', 409, ['conflict' => true]);
        $stornoState = $fullyStorned ? 'full' : 'partial';
        shopNirAudit($db, $user, 'NIR_STORNO_CREATED', 'NirDocument', $id, ['status' => 'confirmed'], [
            'status' => 'confirmed', 'public_status' => 'confirmed',
            'storno_document_id' => $reversalId, 'reversal_document_id' => $reversalId, 'reason' => $reason,
            'line_ids' => array_keys($stornedLineIds), 'storno_state' => $stornoState,
            'supplier_invoice' => $stornoInvoice,
            'original_supplier_invoice' => [
                'series' => $document['supplier_invoice_series'] ?? null,
                'number' => $document['supplier_invoice_number'] ?? null,
                'date' => $document['supplier_invoice_date'] ?? null,
            ],
        ]);
        $db->prepare('INSERT INTO shop_domain_outbox (id, event_type, aggregate_type, aggregate_id, payload_json) VALUES (?, "NirStornoCreated", "NirDocument", ?, ?)')
            ->execute([uuidV4(), $id, json_encode([
                'nir_id' => $id, 'storno_id' => $reversalId, 'reversal_id' => $reversalId,
                'fully_storned' => $fullyStorned, 'line_ids' => array_keys($stornedLineIds),
                'supplier_invoice' => $stornoInvoice,
                'original_supplier_invoice' => [
                    'series' => $document['supplier_invoice_series'] ?? null,
                    'number' => $document['supplier_invoice_number'] ?? null,
                    'date' => $document['supplier_invoice_date'] ?? null,
                ],
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        $db->commit();
        $original = shopNirFetchDocument($db, $id, $user);
        $storno = shopNirFetchDocument($db, $reversalId, $user);
        return [
            'original' => $original,
            'reversal' => $storno,
            'storno' => $storno,
            'fully_storned' => $fullyStorned,
            'storno_state' => $stornoState,
        ];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function shopNirProductReferences(PDO $db, string $productId): array {
    $stmt = $db->prepare(
        'SELECT r.*, s.name AS supplier_name, s.cui AS supplier_cui
         FROM shop_supplier_product_references r INNER JOIN shop_suppliers s ON s.id = r.supplier_id
         WHERE r.product_id = ? ORDER BY r.is_active DESC, r.is_primary_for_supplier DESC, s.name ASC, r.last_used_at DESC'
    );
    $stmt->execute([$productId]);
    $references = array_map('shopNirReferenceRow', $stmt->fetchAll());

    $addAlias = static function (array &$group, string $type, $value, string $source): void {
        $value = trim((string)$value);
        if ($value === '') return;
        $normalized = $type === 'name' ? shopNirNormalizeSupplierProductName($value) : shopNirNormalizeSupplierCode($value);
        if ($normalized === '') return;
        $group['aliases'][$type . '|' . $normalized] = ['type' => $type, 'value' => $value, 'source' => $source];
    };

    // Multiple codes and invoice names may exist for the same supplier/product.
    // The product sheet receives one supplier card with all of those aliases.
    $referenceGroups = [];
    foreach ($references as $reference) {
        $supplierId = trim((string)($reference['supplier_id'] ?? ''));
        if ($supplierId === '') continue;
        if (!isset($referenceGroups[$supplierId])) $referenceGroups[$supplierId] = ['base' => $reference, 'aliases' => []];
        $addAlias($referenceGroups[$supplierId], 'code', $reference['supplier_product_code_original'] ?? '', 'reference');
        $addAlias($referenceGroups[$supplierId], 'name', $reference['supplier_product_name'] ?? '', 'reference');
        $addAlias($referenceGroups[$supplierId], 'ean', $reference['supplier_ean'] ?? '', 'reference');
    }

    // The product sheet is a purchase view, so a supplier must not disappear just
    // because that supplier's invoice did not contain a product code.  Confirmed
    // NIR lines are the accounting source of truth for suppliers we bought from.
    $purchases = $db->prepare(
        'SELECT n.id AS nir_id, n.supplier_id, s.name AS supplier_name, s.cui AS supplier_cui, s.is_active AS supplier_is_active,
                l.supplier_product_code, l.supplier_product_name, l.supplier_ean,
                l.unit_price AS last_confirmed_purchase_price, n.currency AS last_confirmed_currency,
                CASE WHEN l.stock_quantity > 0
                     THEN (l.line_total_ron + l.allocated_cost_ron) / l.stock_quantity
                     ELSE 0 END AS last_confirmed_price_ron,
                COALESCE(n.confirmed_at, n.updated_at) AS last_confirmed_at
         FROM shop_nir_lines l
         INNER JOIN shop_nir_documents n ON n.id = l.nir_document_id AND n.status = "confirmed"
         INNER JOIN shop_suppliers s ON s.id = n.supplier_id
         WHERE l.product_id = ? AND l.accepted_quantity > 0 AND l.resolution_status <> "reversal"
         ORDER BY n.reception_date DESC, n.confirmed_at DESC, l.line_number DESC'
    );
    $purchases->execute([$productId]);

    $purchasedReferences = [];
    foreach ($purchases->fetchAll() as $purchase) {
        $supplierId = trim((string)($purchase['supplier_id'] ?? ''));
        if ($supplierId === '') continue;
        if (!isset($purchasedReferences[$supplierId])) {
            $reference = $referenceGroups[$supplierId]['base'] ?? [
                'id' => 'nir-supplier-' . $supplierId,
                'supplier_id' => $supplierId,
                'product_id' => $productId,
                'supplier_product_code_original' => '',
                'supplier_product_code_normalized' => '',
                'supplier_product_name' => null,
                'supplier_ean' => null,
                'purchase_unit' => 'buc',
                'stock_unit' => 'buc',
                'conversion_factor' => '1.000000',
                'is_primary_for_supplier' => false,
                'is_active' => true,
                'last_used_at' => null,
                'last_confirmed_purchase_price' => null,
                'last_confirmed_currency' => null,
                'last_confirmed_price_ron' => null,
                'last_confirmed_at' => null,
                'row_version' => 0,
                'match_type' => 'name_exact',
            ];
            $reference['supplier_name'] = $purchase['supplier_name'];
            $reference['supplier_cui'] = $purchase['supplier_cui'] ?? null;
            $reference['is_active'] = (bool)($purchase['supplier_is_active'] ?? true);
            $reference['last_used_at'] = $purchase['last_confirmed_at'] ?? $reference['last_used_at'] ?? null;
            $reference['last_confirmed_purchase_price'] = $purchase['last_confirmed_purchase_price'] ?? null;
            $reference['last_confirmed_currency'] = $purchase['last_confirmed_currency'] ?? null;
            $reference['last_confirmed_price_ron'] = $purchase['last_confirmed_price_ron'] ?? null;
            $reference['last_confirmed_at'] = $purchase['last_confirmed_at'] ?? null;
            $reference['association_source'] = 'confirmed_nir';
            $purchasedReferences[$supplierId] = [
                'base' => $reference,
                'aliases' => $referenceGroups[$supplierId]['aliases'] ?? [],
                'nir_ids' => [],
            ];
        }
        $addAlias($purchasedReferences[$supplierId], 'code', $purchase['supplier_product_code'] ?? '', 'confirmed_nir');
        $addAlias($purchasedReferences[$supplierId], 'name', $purchase['supplier_product_name'] ?? '', 'confirmed_nir');
        $addAlias($purchasedReferences[$supplierId], 'ean', $purchase['supplier_ean'] ?? '', 'confirmed_nir');
        $purchasedReferences[$supplierId]['nir_ids'][(string)$purchase['nir_id']] = true;
    }
    $groups = $purchasedReferences ?: array_map(static fn(array $group): array => $group + ['nir_ids' => []], $referenceGroups);
    $result = [];
    foreach ($groups as $group) {
        $reference = $group['base'];
        $reference['aliases'] = array_values($group['aliases']);
        $reference['purchase_count'] = count($group['nir_ids']);
        $result[] = shopNirReferenceRow($reference);
    }
    usort($result, static fn(array $left, array $right): int => strcasecmp((string)($left['supplier_name'] ?? ''), (string)($right['supplier_name'] ?? '')));
    return $result;
}

function shopNirSupplierProducts(PDO $db, string $supplierId): array {
    $stmt = $db->prepare(
        'SELECT r.*, p.name AS product_name, p.sku AS product_sku, p.accounting_stock_quantity, p.cost_price,
                (SELECT pi.image_path FROM shop_product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS product_image_url
         FROM shop_supplier_product_references r INNER JOIN shop_products p ON p.id = r.product_id
         WHERE r.supplier_id = ? ORDER BY r.is_active DESC, r.last_used_at DESC, p.name ASC'
    );
    $stmt->execute([$supplierId]);
    return array_map('shopNirReferenceRow', $stmt->fetchAll());
}

function shopNirPurchaseHistory(PDO $db, string $productId, array $user): array {
    shopNirRequire($user, 'NIR_VIEW_COSTS');
    $stmt = $db->prepare(
        'SELECT l.id AS nir_line_id, l.unit_price, l.discount_percent, l.vat_rate, l.accepted_quantity, l.stock_quantity, l.purchase_unit, l.conversion_factor,
                l.inventory_unit_cost_ron, l.inventory_cost_total_ron, l.line_net_ron, l.line_vat_ron, l.line_total_ron,
                l.allocated_cost_ron,
                n.id AS nir_id, n.nir_number, n.supplier_invoice_series, n.supplier_invoice_number, n.supplier_invoice_date,
                n.reception_date, n.currency, n.exchange_rate, n.confirmed_by,
                s.id AS supplier_id, s.name AS supplier_name,
                COALESCE(NULLIF(l.supplier_product_code, ""), r.supplier_product_code_original) AS supplier_code,
                COALESCE(NULLIF(l.supplier_product_name, ""), r.supplier_product_name) AS supplier_product_name,
                COALESCE(NULLIF(l.supplier_ean, ""), r.supplier_ean) AS supplier_ean
                , layer.remaining_quantity AS fifo_remaining_quantity
         FROM shop_nir_lines l
         INNER JOIN shop_nir_documents n ON n.id = l.nir_document_id AND n.status IN ("confirmed", "reversed")
         LEFT JOIN shop_suppliers s ON s.id = n.supplier_id
         LEFT JOIN shop_supplier_product_references r ON r.id = l.supplier_product_reference_id
         LEFT JOIN shop_inventory_cost_layers layer ON layer.nir_line_id = l.id
         WHERE l.product_id = ? AND l.resolution_status <> "reversal"
         ORDER BY n.reception_date DESC, n.confirmed_at DESC, l.line_number ASC'
    );
    $stmt->execute([$productId]);
    $items = $stmt->fetchAll();
    foreach ($items as &$item) {
        $grossTotal = shopNirDecimalToScaled($item['line_total_ron'], 2) + shopNirDecimalToScaled($item['allocated_cost_ron'], 2);
        $item['gross_cost_total_ron'] = shopNirScaledToDecimal($grossTotal, 2);
        $item['gross_unit_cost_ron'] = shopNirGrossUnitCostRon($item['line_total_ron'], $item['allocated_cost_ron'], $item['stock_quantity']);
    }
    unset($item);
    $prices = array_map(static fn(array $row): int => shopNirDecimalToScaled($row['inventory_unit_cost_ron'], 6), $items);
    $grossPrices = array_map(static fn(array $row): int => shopNirDecimalToScaled($row['gross_unit_cost_ron'], 6), $items);
    $weightedQuantity = 0;
    $weightedCost = 0;
    $weightedGrossCost = 0;
    $supplierStats = [];
    foreach ($items as $item) {
        $quantity = shopNirDecimalToScaled($item['stock_quantity'], 4);
        $cost = shopNirDecimalToScaled($item['inventory_unit_cost_ron'], 6);
        $grossCost = shopNirDecimalToScaled($item['gross_unit_cost_ron'], 6);
        $weightedQuantity += $quantity;
        $weightedCost += shopNirMultiplyScaled($quantity, 4, $cost, 6, 6);
        $weightedGrossCost += shopNirMultiplyScaled($quantity, 4, $grossCost, 6, 6);
        $supplierKey = (string)($item['supplier_id'] ?? 'unknown');
        if (!isset($supplierStats[$supplierKey])) $supplierStats[$supplierKey] = [
            'supplier_id' => $item['supplier_id'], 'supplier_name' => $item['supplier_name'], 'purchase_count' => 0,
            'last_unit_cost_ron' => $item['inventory_unit_cost_ron'], 'last_original_price' => $item['unit_price'],
            'last_gross_unit_cost_ron' => $item['gross_unit_cost_ron'],
            'last_currency' => $item['currency'], 'last_purchase_at' => $item['reception_date'], 'last_quantity' => $item['stock_quantity'],
            'minimum_scaled' => $cost, 'maximum_scaled' => $cost, 'weighted_quantity' => 0, 'weighted_cost' => 0, 'weighted_gross_cost' => 0, 'codes' => [], 'names' => [], 'eans' => [],
        ];
        $supplierStats[$supplierKey]['purchase_count']++;
        $supplierStats[$supplierKey]['minimum_scaled'] = min($supplierStats[$supplierKey]['minimum_scaled'], $cost);
        $supplierStats[$supplierKey]['maximum_scaled'] = max($supplierStats[$supplierKey]['maximum_scaled'], $cost);
        $supplierStats[$supplierKey]['weighted_quantity'] += $quantity;
        $supplierStats[$supplierKey]['weighted_cost'] += shopNirMultiplyScaled($quantity, 4, $cost, 6, 6);
        $supplierStats[$supplierKey]['weighted_gross_cost'] += shopNirMultiplyScaled($quantity, 4, $grossCost, 6, 6);
        if (!empty($item['supplier_code'])) $supplierStats[$supplierKey]['codes'][(string)$item['supplier_code']] = true;
        if (!empty($item['supplier_product_name'])) $supplierStats[$supplierKey]['names'][(string)$item['supplier_product_name']] = true;
        if (!empty($item['supplier_ean'])) $supplierStats[$supplierKey]['eans'][(string)$item['supplier_ean']] = true;
    }
    $supplierRows = [];
    foreach ($supplierStats as $stat) {
        $supplierRows[] = [
            'supplier_id' => $stat['supplier_id'], 'supplier_name' => $stat['supplier_name'], 'purchase_count' => $stat['purchase_count'],
            'last_unit_cost_ron' => $stat['last_unit_cost_ron'], 'last_original_price' => $stat['last_original_price'],
            'last_gross_unit_cost_ron' => $stat['last_gross_unit_cost_ron'],
            'last_currency' => $stat['last_currency'], 'last_purchase_at' => $stat['last_purchase_at'], 'last_quantity' => $stat['last_quantity'],
            'minimum_unit_cost_ron' => shopNirScaledToDecimal($stat['minimum_scaled'], 6),
            'maximum_unit_cost_ron' => shopNirScaledToDecimal($stat['maximum_scaled'], 6),
            'weighted_average_unit_cost_ron' => $stat['weighted_quantity'] > 0 ? shopNirScaledToDecimal(shopNirDivideRounded($stat['weighted_cost'] * 10000, $stat['weighted_quantity']), 6) : null,
            'weighted_average_gross_unit_cost_ron' => $stat['weighted_quantity'] > 0 ? shopNirScaledToDecimal(shopNirDivideRounded($stat['weighted_gross_cost'] * 10000, $stat['weighted_quantity']), 6) : null,
            'codes' => array_keys($stat['codes']), 'names' => array_keys($stat['names']), 'eans' => array_keys($stat['eans']),
        ];
    }
    return [
        'items' => $items,
        'suppliers' => $supplierRows,
        'statistics' => [
            'count' => count($items),
            'minimum_unit_cost_ron' => $prices ? shopNirScaledToDecimal(min($prices), 6) : null,
            'maximum_unit_cost_ron' => $prices ? shopNirScaledToDecimal(max($prices), 6) : null,
            'last_unit_cost_ron' => $prices ? shopNirScaledToDecimal($prices[0], 6) : null,
            'weighted_average_unit_cost_ron' => $weightedQuantity > 0 ? shopNirScaledToDecimal(shopNirDivideRounded($weightedCost * 10000, $weightedQuantity), 6) : null,
            'minimum_gross_unit_cost_ron' => $grossPrices ? shopNirScaledToDecimal(min($grossPrices), 6) : null,
            'maximum_gross_unit_cost_ron' => $grossPrices ? shopNirScaledToDecimal(max($grossPrices), 6) : null,
            'last_gross_unit_cost_ron' => $grossPrices ? shopNirScaledToDecimal($grossPrices[0], 6) : null,
            'weighted_average_gross_unit_cost_ron' => $weightedQuantity > 0 ? shopNirScaledToDecimal(shopNirDivideRounded($weightedGrossCost * 10000, $weightedQuantity), 6) : null,
        ],
    ];
}

function shopNirFifoLayers(PDO $db, string $productId, array $query, array $user): array {
    shopNirRequire($user, 'FIFO_VIEW');
    $warehouseId = trim((string)($query['warehouse_id'] ?? ''));
    $params = [$productId];
    $warehouseFilter = '';
    if ($warehouseId !== '') { $warehouseFilter = ' AND l.warehouse_id = ?'; $params[] = $warehouseId; }
    $stmt = $db->prepare(
        'SELECT l.*, n.nir_number, s.name AS supplier_name, w.name AS warehouse_name
         FROM shop_inventory_cost_layers l
         LEFT JOIN shop_nir_documents n ON n.id = l.nir_document_id
         LEFT JOIN shop_suppliers s ON s.id = l.supplier_id
         LEFT JOIN shop_warehouses w ON w.id = l.warehouse_id
         WHERE l.product_id = ?' . $warehouseFilter . '
         ORDER BY l.reception_date ASC, l.created_at ASC, l.id ASC'
    );
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function shopNirFifoPreviewForProduct(PDO $db, string $productId, array $body, array $user): array {
    shopNirRequire($user, 'FIFO_VIEW');
    $warehouseId = trim((string)($body['warehouse_id'] ?? shopNirSettings($db)['default_warehouse_id']));
    $stmt = $db->prepare(
        'SELECT l.*, n.nir_number FROM shop_inventory_cost_layers l
         LEFT JOIN shop_nir_documents n ON n.id = l.nir_document_id
         WHERE l.product_id = ? AND l.warehouse_id = ? AND l.is_reversed = 0 AND l.remaining_quantity > 0
         ORDER BY l.reception_date ASC, l.created_at ASC, l.id ASC'
    );
    $stmt->execute([$productId, $warehouseId]);
    $result = shopNirFifoPreview($stmt->fetchAll(), $body['quantity'] ?? 0);
    $result['product_id'] = $productId;
    $result['warehouse_id'] = $warehouseId;
    return $result;
}

/**
 * Internal future integration point. It is deliberately not exposed as an HTTP
 * action until the sales-invoice module owns a confirmed source document.
 */
function shopNirConsumeFifo(PDO $db, string $productId, string $warehouseId, $quantity, string $sourceDocumentType, string $sourceDocumentId, string $sourceLineId, string $idempotencyKey): array {
    if (!$db->inTransaction()) throw new RuntimeException('Consumarea FIFO trebuie apelată într-o tranzacție a documentului sursă.');
    if ($sourceDocumentId === '' || $sourceLineId === '' || $idempotencyKey === '') throw new InvalidArgumentException('Documentul sursă și cheia de idempotency sunt obligatorii.');
    $existing = $db->prepare('SELECT * FROM shop_inventory_layer_consumptions WHERE source_document_type = ? AND source_line_id = ? ORDER BY created_at, id');
    $existing->execute([$sourceDocumentType, $sourceLineId]);
    $existingRows = $existing->fetchAll();
    if ($existingRows) return ['idempotent_replay' => true, 'consumptions' => $existingRows];
    $layerStmt = $db->prepare(
        'SELECT * FROM shop_inventory_cost_layers
         WHERE product_id = ? AND warehouse_id = ? AND is_reversed = 0 AND remaining_quantity > 0
         ORDER BY reception_date ASC, created_at ASC, id ASC FOR UPDATE'
    );
    $layerStmt->execute([$productId, $warehouseId]);
    $layers = $layerStmt->fetchAll();
    $preview = shopNirFifoPreview($layers, $quantity);
    if (!$preview['available']) throw new ShopNirHttpException('Stoc FIFO insuficient pentru documentul sursă.', 409, ['preview' => $preview]);
    $byId = [];
    foreach ($layers as $layer) $byId[(string)$layer['id']] = $layer;
    $insert = $db->prepare(
        'INSERT INTO shop_inventory_layer_consumptions
         (id, inventory_cost_layer_id, product_id, warehouse_id, source_document_type, source_document_id, source_line_id,
          quantity, unit_cost_ron, total_cost_ron, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $update = $db->prepare('UPDATE shop_inventory_cost_layers SET remaining_quantity = remaining_quantity - ?, status = CASE WHEN remaining_quantity - ? <= 0 THEN "consumed" ELSE "partially_consumed" END, row_version = row_version + 1 WHERE id = ? AND remaining_quantity >= ?');
    $consumptions = [];
    foreach ($preview['allocations'] as $allocation) {
        $layer = $byId[(string)$allocation['layer_id']];
        $consumptionId = uuidV4();
        $insert->execute([$consumptionId, $layer['id'], $productId, $warehouseId, $sourceDocumentType, $sourceDocumentId, $sourceLineId, $allocation['quantity'], $allocation['unit_cost_ron'], $allocation['cost_ron'], $idempotencyKey]);
        $update->execute([$allocation['quantity'], $allocation['quantity'], $layer['id'], $allocation['quantity']]);
        if ($update->rowCount() !== 1) throw new ShopNirHttpException('Lotul FIFO a fost consumat simultan. Reîncearcă documentul.', 409);
        $consumptions[] = ['id' => $consumptionId] + $allocation;
    }
    return ['idempotent_replay' => false, 'preview' => $preview, 'consumptions' => $consumptions];
}

function shopNirOpeningBalanceReport(PDO $db, array $user): array {
    shopNirRequire($user, 'FIFO_VIEW');
    $stmt = $db->query(
        'SELECT p.id AS product_id, p.name AS product_name, p.sku, settings.default_warehouse_id AS warehouse_id,
                w.name AS warehouse_name, p.accounting_stock_quantity,
                COALESCE(SUM(CASE WHEN l.is_reversed = 0 THEN l.remaining_quantity ELSE 0 END), 0) AS fifo_quantity,
                p.accounting_stock_quantity - COALESCE(SUM(CASE WHEN l.is_reversed = 0 THEN l.remaining_quantity ELSE 0 END), 0) AS missing_fifo_quantity
         FROM shop_products p
         INNER JOIN shop_nir_settings settings ON settings.id = 1
         INNER JOIN shop_warehouses w ON w.id = settings.default_warehouse_id
         LEFT JOIN shop_inventory_cost_layers l ON l.product_id = p.id AND l.warehouse_id = settings.default_warehouse_id
         WHERE p.accounting_stock_quantity <> 0
         GROUP BY p.id, p.name, p.sku, settings.default_warehouse_id, w.name, p.accounting_stock_quantity
         HAVING ABS(p.accounting_stock_quantity - COALESCE(SUM(CASE WHEN l.is_reversed = 0 THEN l.remaining_quantity ELSE 0 END), 0)) > 0.00005
         ORDER BY ABS(p.accounting_stock_quantity - COALESCE(SUM(CASE WHEN l.is_reversed = 0 THEN l.remaining_quantity ELSE 0 END), 0)) DESC, p.name ASC'
    );
    return ['items' => $stmt->fetchAll(), 'cost_is_never_invented' => true];
}

function shopNirCreateOpeningBalance(PDO $db, array $body, array $user): array {
    $productId = trim((string)($body['product_id'] ?? ''));
    $warehouseId = trim((string)($body['warehouse_id'] ?? shopNirSettings($db)['default_warehouse_id']));
    $defaultWarehouseId = (string)shopNirSettings($db)['default_warehouse_id'];
    if ($warehouseId !== $defaultWarehouseId) throw new InvalidArgumentException('Stocuri Conta este configurat momentan pe gestiunea principală. Soldul inițial trebuie introdus în această gestiune.');
    $quantity = shopNirScaledToDecimal(shopNirDecimalToScaled($body['quantity'] ?? 0, 4, 'Cantitatea soldului inițial'), 4);
    $unitCost = shopNirScaledToDecimal(shopNirDecimalToScaled($body['unit_cost_ron'] ?? '', 6, 'Costul soldului inițial'), 6);
    $date = shopNirDate($body['reception_date'] ?? (new DateTimeImmutable('today'))->format('Y-m-d'), 'Data soldului inițial');
    $note = mb_substr(trim((string)($body['note'] ?? '')), 0, 500);
    if ($productId === '' || shopNirDecimalToScaled($quantity, 4) <= 0 || shopNirDecimalToScaled($unitCost, 6) <= 0 || $note === '') {
        throw new InvalidArgumentException('Produsul, cantitatea, costul real și justificarea sunt obligatorii.');
    }
    $totalCost = shopNirMultiplyScaled(shopNirDecimalToScaled($quantity, 4), 4, shopNirDecimalToScaled($unitCost, 6), 6, 2);
    $db->beginTransaction();
    try {
        $product = $db->prepare('SELECT accounting_stock_quantity FROM shop_products WHERE id = ? FOR UPDATE');
        $product->execute([$productId]);
        $accountingStock = $product->fetchColumn();
        if ($accountingStock === false) throw new InvalidArgumentException('Produsul nu există.');
        $layers = $db->prepare('SELECT COALESCE(SUM(remaining_quantity), 0) FROM shop_inventory_cost_layers WHERE product_id = ? AND warehouse_id = ? AND is_reversed = 0 FOR UPDATE');
        $layers->execute([$productId, $warehouseId]);
        $layerQuantity = (string)$layers->fetchColumn();
        $missing = shopNirDecimalToScaled($accountingStock, 4) - shopNirDecimalToScaled($layerQuantity, 4);
        if ($missing <= 0 || shopNirDecimalToScaled($quantity, 4) > $missing) {
            throw new ShopNirHttpException('Cantitatea soldului inițial depășește stocul contabil fără lot FIFO.', 409, ['missing_fifo_quantity' => shopNirScaledToDecimal(max(0, $missing), 4)]);
        }
        $id = uuidV4();
        $db->prepare(
            'INSERT INTO shop_inventory_cost_layers
             (id, product_id, warehouse_id, source_type, source_reference, reception_date, confirmed_at, original_quantity, remaining_quantity,
              stock_unit, unit_cost_ron, total_cost_ron, currency, exchange_rate, status, created_by)
             VALUES (?, ?, ?, "OPENING_BALANCE", ?, ?, NOW(), ?, ?, "buc", ?, ?, "RON", 1, "open", ?)'
        )->execute([$id, $productId, $warehouseId, $note, $date, $quantity, $quantity, $unitCost, shopNirScaledToDecimal($totalCost, 2), shopNirActor($user)['name']]);
        shopNirAudit($db, $user, 'FIFO_OPENING_BALANCE_CREATED', 'InventoryCostLayer', $id, null, ['product_id' => $productId, 'quantity' => $quantity, 'unit_cost_ron' => $unitCost, 'note' => $note]);
        $db->commit();
        return ['id' => $id, 'product_id' => $productId, 'quantity' => $quantity, 'unit_cost_ron' => $unitCost, 'total_cost_ron' => shopNirScaledToDecimal($totalCost, 2)];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function shopNirAttachmentUpload(PDO $db, string $documentId, array $body, array $user): array {
    $doc = $db->prepare('SELECT status FROM shop_nir_documents WHERE id = ?');
    $doc->execute([$documentId]);
    $status = $doc->fetchColumn();
    if ($status === false) throw new ShopNirHttpException('NIR-ul nu există.', 404);
    if ((string)$status !== 'draft') throw new ShopNirHttpException('Documentele pot fi adăugate numai unei ciorne.', 409);
    $originalName = mb_substr(basename(trim((string)($body['file_name'] ?? 'document'))), 0, 255);
    $mime = strtolower(trim((string)($body['mime_type'] ?? 'application/octet-stream')));
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowed = [
        'pdf' => ['application/pdf'],
        'jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'png' => ['image/png'], 'webp' => ['image/webp'],
        'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
        'xml' => ['application/xml', 'text/xml', 'application/octet-stream'],
    ];
    if (!isset($allowed[$extension]) || !in_array($mime, $allowed[$extension], true)) {
        throw new InvalidArgumentException('Fișierul trebuie să fie PDF, JPG, PNG, WebP, XLSX sau XML și să aibă un Content-Type valid.');
    }
    $base64 = trim((string)($body['content_base64'] ?? ''));
    if (str_contains($base64, ',')) $base64 = substr($base64, strpos($base64, ',') + 1);
    $bytes = base64_decode($base64, true);
    if ($bytes === false || $bytes === '') throw new InvalidArgumentException('Conținutul fișierului este invalid.');
    $size = strlen($bytes);
    if ($size > 15 * 1024 * 1024) throw new InvalidArgumentException('Fișierul depășește limita de 15 MB.');
    $sha = hash('sha256', $bytes);
    $existing = $db->prepare('SELECT * FROM shop_nir_attachments WHERE nir_document_id = ? AND sha256 = ? LIMIT 1');
    $existing->execute([$documentId, $sha]);
    $existingRow = $existing->fetch();
    if ($existingRow) return $existingRow + ['duplicate' => true];
    $duplicateFile = $db->prepare(
        'SELECT n.id, n.nir_number, n.temporary_number, n.status, n.reception_date, n.grand_total, n.currency, s.name AS supplier_name
         FROM shop_nir_attachments a
         INNER JOIN shop_nir_documents n ON n.id = a.nir_document_id
         LEFT JOIN shop_suppliers s ON s.id = n.supplier_id
         WHERE a.sha256 = ? AND a.nir_document_id <> ? AND n.status IN ("confirmed", "reversed") LIMIT 1'
    );
    $duplicateFile->execute([$sha, $documentId]);
    $duplicateDocument = $duplicateFile->fetch();
    if ($duplicateDocument) {
        throw new ShopNirHttpException('Factura pare să fie deja introdusă.', 409, ['duplicate' => true, 'existing_document' => $duplicateDocument]);
    }
    $folder = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'nir' . DIRECTORY_SEPARATOR . date('Y') . DIRECTORY_SEPARATOR . date('m');
    if (!is_dir($folder) && !mkdir($folder, 0750, true) && !is_dir($folder)) throw new RuntimeException('Spațiul securizat pentru documente nu poate fi creat.');
    $id = uuidV4();
    $storageName = str_replace('-', '', $id) . '.' . $extension;
    $path = $folder . DIRECTORY_SEPARATOR . $storageName;
    if (file_put_contents($path, $bytes, LOCK_EX) !== $size) throw new RuntimeException('Documentul nu a putut fi salvat complet.');
    $relative = 'uploads/nir/' . date('Y') . '/' . date('m') . '/' . $storageName;
    $actor = shopNirActor($user);
    try {
        $stmt = $db->prepare(
            'INSERT INTO shop_nir_attachments
             (id, nir_document_id, original_name, storage_name, mime_type, extension, file_size, sha256, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$id, $documentId, $originalName, $relative, $mime, $extension, $size, $sha, $actor['name']]);
        $db->prepare('UPDATE shop_nir_documents SET source_type = "import", source_file_hash = ?, row_version = row_version + 1, updated_by = ? WHERE id = ? AND status = "draft"')->execute([$sha, $actor['name'], $documentId]);
        shopNirAudit($db, $user, 'NIR_DOCUMENT_IMPORTED', 'NirDocument', $documentId, null, ['attachment_id' => $id, 'name' => $originalName, 'sha256' => $sha]);
    } catch (Throwable $error) {
        @unlink($path);
        throw $error;
    }
    $stmt = $db->prepare('SELECT id, original_name, mime_type, extension, file_size, sha256, extraction_status, extraction_message, created_at FROM shop_nir_attachments WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

function shopNirAttachmentStoredPath(string $storageName): string {
    $uploadsRoot = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'nir');
    $path = realpath(__DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $storageName));
    if ($uploadsRoot === false || $path === false || !str_starts_with($path, $uploadsRoot . DIRECTORY_SEPARATOR) || !is_file($path)) {
        throw new ShopNirHttpException('Fișierul atașat nu mai este disponibil.', 404);
    }
    return $path;
}

function shopNirDownloadAttachment(PDO $db, string $documentId, string $attachmentId): array {
    if ($documentId === '' || $attachmentId === '') throw new InvalidArgumentException('Documentul și fișierul sunt obligatorii.');
    $stmt = $db->prepare('SELECT original_name, storage_name, mime_type FROM shop_nir_attachments WHERE id = ? AND nir_document_id = ? LIMIT 1');
    $stmt->execute([$attachmentId, $documentId]);
    $attachment = $stmt->fetch();
    if (!$attachment) throw new ShopNirHttpException('Documentul furnizorului nu există.', 404);
    $bytes = file_get_contents(shopNirAttachmentStoredPath((string)$attachment['storage_name']));
    if ($bytes === false) throw new RuntimeException('Documentul furnizorului nu a putut fi citit.');
    return [
        'file_name' => (string)$attachment['original_name'],
        'mime_type' => (string)$attachment['mime_type'],
        'content_base64' => base64_encode($bytes),
    ];
}

function shopNirDownloadAllAttachments(PDO $db, string $documentId): array {
    if ($documentId === '') throw new InvalidArgumentException('NIR-ul este obligatoriu.');
    $documentStmt = $db->prepare('SELECT COALESCE(nir_number, temporary_number) AS document_number FROM shop_nir_documents WHERE id = ? LIMIT 1');
    $documentStmt->execute([$documentId]);
    $documentNumber = $documentStmt->fetchColumn();
    if ($documentNumber === false) throw new ShopNirHttpException('NIR-ul nu există.', 404);
    $stmt = $db->prepare('SELECT original_name, storage_name FROM shop_nir_attachments WHERE nir_document_id = ? ORDER BY created_at ASC');
    $stmt->execute([$documentId]);
    $attachments = $stmt->fetchAll();
    if (!$attachments) throw new ShopNirHttpException('NIR-ul nu are documente de descărcat.', 404);
    if (!class_exists('ZipArchive')) throw new RuntimeException('Arhivarea documentelor nu este disponibilă pe server.');

    $temporaryPath = tempnam(sys_get_temp_dir(), 'nir_documents_');
    if ($temporaryPath === false) throw new RuntimeException('Arhiva temporară nu a putut fi creată.');
    $zip = new ZipArchive();
    if ($zip->open($temporaryPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        @unlink($temporaryPath);
        throw new RuntimeException('Arhiva documentelor nu a putut fi deschisă.');
    }
    $usedNames = [];
    try {
        foreach ($attachments as $index => $attachment) {
            $originalName = basename((string)$attachment['original_name']);
            $archiveName = $originalName !== '' ? $originalName : 'document-' . ($index + 1);
            $baseName = pathinfo($archiveName, PATHINFO_FILENAME);
            $extension = pathinfo($archiveName, PATHINFO_EXTENSION);
            $candidate = $archiveName;
            $suffix = 2;
            while (isset($usedNames[mb_strtolower($candidate)])) {
                $candidate = $baseName . '-' . $suffix++ . ($extension !== '' ? '.' . $extension : '');
            }
            $usedNames[mb_strtolower($candidate)] = true;
            if (!$zip->addFile(shopNirAttachmentStoredPath((string)$attachment['storage_name']), $candidate)) {
                throw new RuntimeException('Un document nu a putut fi adăugat în arhivă.');
            }
        }
        if (!$zip->close()) throw new RuntimeException('Arhiva documentelor nu a putut fi finalizată.');
        $bytes = file_get_contents($temporaryPath);
        if ($bytes === false) throw new RuntimeException('Arhiva documentelor nu a putut fi citită.');
    } finally {
        if (is_file($temporaryPath)) @unlink($temporaryPath);
    }
    $safeNumber = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)$documentNumber) ?: 'NIR';
    return ['file_name' => $safeNumber . '-documente.zip', 'mime_type' => 'application/zip', 'content_base64' => base64_encode($bytes)];
}

function shopNirSpreadsheetColumnIndex(string $letters): int {
    $index = 0;
    foreach (str_split(strtoupper($letters)) as $letter) $index = $index * 26 + ord($letter) - 64;
    return max(0, $index - 1);
}

function shopNirExtractXlsx(string $path): array {
    if (!class_exists('ZipArchive')) return ['lines' => [], 'message' => 'Extensia ZIP nu este disponibilă; introdu manual pozițiile.'];
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) return ['lines' => [], 'message' => 'Fișierul XLSX nu a putut fi deschis.'];
    $shared = [];
    $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
    if (is_string($sharedXml)) {
        $xml = @simplexml_load_string($sharedXml);
        if ($xml) foreach ($xml->si as $item) $shared[] = trim((string)($item->t ?? $item->r->t ?? ''));
    }
    $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
    $zip->close();
    if (!is_string($sheetXml)) return ['lines' => [], 'message' => 'Prima foaie XLSX nu a fost găsită.'];
    $xml = @simplexml_load_string($sheetXml);
    if (!$xml) return ['lines' => [], 'message' => 'Structura XLSX este invalidă.'];
    $rows = [];
    foreach ($xml->sheetData->row as $row) {
        $values = [];
        foreach ($row->c as $cell) {
            $reference = (string)$cell['r'];
            preg_match('/^([A-Z]+)/', $reference, $match);
            $column = shopNirSpreadsheetColumnIndex($match[1] ?? 'A');
            $value = (string)$cell->v;
            if ((string)$cell['t'] === 's') $value = $shared[(int)$value] ?? '';
            elseif ((string)$cell['t'] === 'inlineStr') $value = (string)$cell->is->t;
            $values[$column] = trim($value);
        }
        if ($values) { ksort($values); $rows[] = $values; }
    }
    if (count($rows) < 2) return ['lines' => [], 'message' => 'Fișierul XLSX nu conține poziții suficiente.'];
    $headerAliases = [
        'supplier_product_code' => ['cod', 'cod produs', 'sku', 'product code'],
        'supplier_product_name' => ['denumire', 'produs', 'descriere', 'product name'],
        'invoiced_quantity' => ['cantitate', 'qty', 'quantity'],
        'unit_price' => ['pret unitar', 'preț unitar', 'unit price', 'pret'],
        'vat_rate' => ['tva', 'vat', 'cota tva'],
        'supplier_ean' => ['ean', 'gtin', 'cod bare'],
        'purchase_unit' => ['um', 'u.m.', 'unitate'],
    ];
    $headers = array_map(static fn($value): string => mb_strtolower(trim((string)$value)), $rows[0]);
    $mapping = [];
    foreach ($headers as $column => $header) {
        foreach ($headerAliases as $field => $aliases) if (in_array($header, $aliases, true)) $mapping[$field] = $column;
    }
    if (!isset($mapping['supplier_product_name'], $mapping['invoiced_quantity'], $mapping['unit_price'])) {
        return ['lines' => [], 'message' => 'Coloanele XLSX nu au putut fi recunoscute. Poți completa pozițiile manual.'];
    }
    $lines = [];
    foreach (array_slice($rows, 1) as $row) {
        $get = static fn(string $field, string $default = ''): string => isset($mapping[$field]) ? trim((string)($row[$mapping[$field]] ?? $default)) : $default;
        if ($get('supplier_product_name') === '' && $get('supplier_product_code') === '') continue;
        $lines[] = [
            'supplier_product_code' => $get('supplier_product_code'), 'supplier_product_name' => $get('supplier_product_name'),
            'supplier_ean' => $get('supplier_ean'), 'purchase_unit' => $get('purchase_unit', 'buc'),
            'invoiced_quantity' => $get('invoiced_quantity', '0'), 'received_quantity' => $get('invoiced_quantity', '0'), 'accepted_quantity' => $get('invoiced_quantity', '0'),
            'unit_price' => $get('unit_price', '0'), 'vat_rate' => $get('vat_rate', '0'),
        ];
    }
    return ['lines' => $lines, 'message' => $lines ? 'Pozițiile XLSX au fost extrase pentru verificare.' : 'Nu au fost găsite poziții în XLSX.'];
}

function shopNirExtractXml(string $path): array {
    $xml = @simplexml_load_file($path);
    if (!$xml) return ['lines' => [], 'message' => 'Fișierul XML nu a putut fi citit.'];
    $nodes = $xml->xpath('//*[local-name()="InvoiceLine"]') ?: [];
    $lines = [];
    foreach ($nodes as $node) {
        $value = static function ($context, string $path): string {
            $result = $context->xpath($path) ?: [];
            return trim((string)($result[0] ?? ''));
        };
        $quantity = $value($node, './/*[local-name()="InvoicedQuantity"]');
        $lines[] = [
            'supplier_product_code' => $value($node, './/*[local-name()="SellersItemIdentification"]/*[local-name()="ID"]'),
            'supplier_product_name' => $value($node, './/*[local-name()="Item"]/*[local-name()="Name"]'),
            'supplier_ean' => $value($node, './/*[local-name()="StandardItemIdentification"]/*[local-name()="ID"]'),
            'purchase_unit' => (string)(($node->xpath('.//*[local-name()="InvoicedQuantity"]')[0]['unitCode'] ?? 'buc')),
            'invoiced_quantity' => $quantity, 'received_quantity' => $quantity, 'accepted_quantity' => $quantity,
            'unit_price' => $value($node, './/*[local-name()="Price"]/*[local-name()="PriceAmount"]'),
            'vat_rate' => $value($node, './/*[local-name()="ClassifiedTaxCategory"]/*[local-name()="Percent"]'),
        ];
    }
    $readRoot = static function ($context, string $path): string {
        $result = $context->xpath($path) ?: [];
        return trim((string)($result[0] ?? ''));
    };
    $header = [
        'supplier_invoice_number' => $readRoot($xml, '/*[local-name()="Invoice"]/*[local-name()="ID"]'),
        'supplier_invoice_date' => $readRoot($xml, '/*[local-name()="Invoice"]/*[local-name()="IssueDate"]'),
        'currency' => strtoupper($readRoot($xml, '/*[local-name()="Invoice"]/*[local-name()="DocumentCurrencyCode"]')),
        'supplier_cui' => $readRoot($xml, '/*[local-name()="Invoice"]/*[local-name()="AccountingSupplierParty"]//*[local-name()="CompanyID"]'),
    ];
    return ['lines' => $lines, 'header' => array_filter($header, static fn(string $value): bool => $value !== ''), 'message' => $lines ? 'Pozițiile și antetul XML au fost extrase pentru verificare.' : 'XML-ul nu conține linii de factură recunoscute.'];
}

function shopNirExtractAttachment(PDO $db, string $documentId, string $attachmentId, array $user): array {
    $stmt = $db->prepare('SELECT * FROM shop_nir_attachments WHERE id = ? AND nir_document_id = ?');
    $stmt->execute([$attachmentId, $documentId]);
    $attachment = $stmt->fetch();
    if (!$attachment) throw new ShopNirHttpException('Documentul atașat nu există.', 404);
    if ((string)$attachment['extraction_status'] === 'extracted' && !empty($attachment['extracted_json'])) {
        $cached = json_decode((string)$attachment['extracted_json'], true);
        if (is_array($cached)) return $cached + ['status' => 'extracted', 'attachment_id' => $attachmentId, 'idempotent_replay' => true, 'document' => shopNirFetchDocument($db, $documentId, $user)];
    }
    $path = __DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, (string)$attachment['storage_name']);
    $extension = (string)$attachment['extension'];
    if ($extension === 'xlsx') $result = shopNirExtractXlsx($path);
    elseif ($extension === 'xml') $result = shopNirExtractXml($path);
    else $result = ['lines' => [], 'message' => 'OCR-ul nu este configurat pe server. Fișierul rămâne atașat și NIR-ul poate fi completat manual.'];
    $updatedDocument = null;
    if ($result['lines']) {
        $document = shopNirFetchDocument($db, $documentId, $user);
        if ((string)$document['status'] !== 'draft') throw new ShopNirHttpException('Extragerea poate modifica numai o ciornă.', 409);
        $resolvedLines = [];
        foreach ($result['lines'] as $line) {
            $match = !empty($document['supplier_id']) ? shopNirMatchSupplierProduct($db, (string)$document['supplier_id'], (string)($line['supplier_product_code'] ?? ''), (string)($line['supplier_ean'] ?? ''), '', (string)($line['supplier_product_name'] ?? '')) : null;
            $reference = is_array($match) ? ($match['reference'] ?? null) : null;
            if ($reference) {
                $line['product_id'] = $reference['product_id'];
                $line['supplier_product_reference_id'] = $reference['id'] ?? null;
                $line['conversion_factor'] = $reference['conversion_factor'];
                $line['purchase_unit'] = $reference['purchase_unit'];
                $line['stock_unit'] = $reference['stock_unit'];
                $line['resolution_status'] = ($match['match_method'] ?? '') === 'name_exact' ? 'matched_name' : 'matched_code';
            }
            $resolvedLines[] = $line + ['conversion_factor' => '1', 'stock_unit' => 'buc', 'rejected_quantity' => '0', 'discount_percent' => '0', 'allocated_cost_ron' => '0'];
        }
        $existingLines = (array)($document['lines'] ?? []);
        $onlyPlaceholder = count($existingLines) === 1
            && empty($existingLines[0]['product_id'])
            && trim((string)($existingLines[0]['supplier_product_code'] ?? '')) === ''
            && trim((string)($existingLines[0]['supplier_product_name'] ?? '')) === '';
        $headerPatch = [];
        foreach (['supplier_invoice_number', 'supplier_invoice_date', 'currency'] as $field) if (!empty($result['header'][$field])) $headerPatch[$field] = $result['header'][$field];
        if (!empty($result['header']['supplier_cui'])) {
            $cui = strtoupper(preg_replace('/\s+/', '', (string)$result['header']['supplier_cui']) ?? '');
            $supplierStmt = $db->prepare('SELECT id FROM shop_suppliers WHERE REPLACE(UPPER(cui), " ", "") = ? AND is_active = 1 LIMIT 2');
            $supplierStmt->execute([$cui]);
            $supplierMatches = $supplierStmt->fetchAll();
            if (count($supplierMatches) === 1) $headerPatch['supplier_id'] = $supplierMatches[0]['id'];
        }
        if (($headerPatch['currency'] ?? $document['currency']) === 'RON') {
            $headerPatch['exchange_rate'] = '1';
            $headerPatch['exchange_rate_date'] = $document['nir_date'];
        }
        $updatedDocument = shopNirUpdateDraft($db, $documentId, $headerPatch + [
            'row_version' => $document['row_version'],
            'lines' => $onlyPlaceholder ? $resolvedLines : array_merge($existingLines, $resolvedLines),
        ], $user);
    }
    $status = $result['lines'] ? 'extracted' : 'manual_required';
    $db->prepare('UPDATE shop_nir_attachments SET extraction_status = ?, extraction_message = ?, extracted_json = ? WHERE id = ?')
        ->execute([$status, mb_substr((string)$result['message'], 0, 500), json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $attachmentId]);
    shopNirAudit($db, $user, 'NIR_DOCUMENT_EXTRACTED', 'NirDocument', $documentId, null, ['attachment_id' => $attachmentId, 'status' => $status, 'line_count' => count($result['lines'])]);
    return $result + ['status' => $status, 'attachment_id' => $attachmentId, 'document' => $updatedDocument];
}

function shopNirDocumentMovements(PDO $db, string $id): array {
    $documentStmt = $db->prepare('SELECT id, status, reversal_of_id FROM shop_nir_documents WHERE id = ?');
    $documentStmt->execute([$id]);
    $document = $documentStmt->fetch();
    if (!$document) throw new ShopNirHttpException('NIR-ul nu există.', 404);
    $originalId = trim((string)($document['reversal_of_id'] ?? '')) ?: $id;
    $documentIds = [$originalId];
    $reversalStmt = $db->prepare('SELECT id FROM shop_nir_documents WHERE reversal_of_id = ? ORDER BY confirmed_at, id');
    $reversalStmt->execute([$originalId]);
    $documentIds = array_merge($documentIds, array_map('strval', $reversalStmt->fetchAll(PDO::FETCH_COLUMN)));
    $placeholders = implode(',', array_fill(0, count($documentIds), '?'));
    $stmt = $db->prepare(
        "SELECT m.*, p.name AS product_name, p.sku AS product_sku,
                n.nir_number AS movement_document_number, n.source_type AS movement_document_source,
                n.status AS movement_document_status, n.reversal_of_id AS movement_reversal_of_id
         FROM shop_inventory_movements m
         INNER JOIN shop_products p ON p.id = m.product_id
         INNER JOIN shop_nir_documents n ON n.id = m.nir_document_id
         WHERE m.nir_document_id IN ({$placeholders})
         ORDER BY m.created_at, m.id"
    );
    $stmt->execute($documentIds);
    return $stmt->fetchAll();
}

function shopNirDocumentLayers(PDO $db, string $id): array {
    $stmt = $db->prepare('SELECT l.*, p.name AS product_name, p.sku AS product_sku FROM shop_inventory_cost_layers l INNER JOIN shop_products p ON p.id = l.product_id WHERE l.nir_document_id = ? ORDER BY l.reception_date, l.created_at, l.id');
    $stmt->execute([$id]);
    return $stmt->fetchAll();
}

function shopNirPdfTemplate(array $document): string {
    if (trim((string)($document['reversal_of_id'] ?? '')) !== '' || mb_strtolower(trim((string)($document['source_type'] ?? ''))) === 'reversal') {
        return 'reversal';
    }
    return mb_strtolower(trim((string)($document['status'] ?? ''))) === 'reversed' ? 'entry_reversed' : 'entry';
}

function shopNirPdfJson($value): array {
    if (!is_string($value) || trim($value) === '') return [];
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : [];
}

function shopNirPdfRelatedDocumentRow(array $row): array {
    return [
        'id' => (string)($row['id'] ?? ''),
        'number' => (string)($row['nir_number'] ?? $row['temporary_number'] ?? ''),
        'nir_number' => (string)($row['nir_number'] ?? ''),
        'temporary_number' => (string)($row['temporary_number'] ?? ''),
        'status' => (string)($row['status'] ?? ''),
        'source_type' => (string)($row['source_type'] ?? ''),
        'supplier_invoice_series' => $row['supplier_invoice_series'] ?? null,
        'supplier_invoice_number' => $row['supplier_invoice_number'] ?? null,
        'supplier_invoice_date' => $row['supplier_invoice_date'] ?? null,
        'nir_date' => $row['nir_date'] ?? null,
        'reception_date' => $row['reception_date'] ?? null,
        'confirmed_at' => $row['confirmed_at'] ?? null,
        'confirmed_by' => $row['confirmed_by'] ?? null,
        'reversed_at' => $row['reversed_at'] ?? null,
        'reversed_by' => $row['reversed_by'] ?? null,
        'reversal_of_id' => $row['reversal_of_id'] ?? null,
        'grand_total_ron' => $row['grand_total_ron'] ?? null,
    ];
}

function shopNirPdfQuantitySummary(array $lines, string $field): array {
    $byUnit = [];
    foreach ($lines as $line) {
        $unit = trim((string)($line['purchase_unit'] ?? '')) ?: 'unități';
        $byUnit[$unit] = ($byUnit[$unit] ?? 0.0) + (float)($line[$field] ?? 0);
    }
    ksort($byUnit, SORT_NATURAL | SORT_FLAG_CASE);
    return $byUnit;
}

function shopNirBuildPdfSummaryData(array $document): array {
    $lines = is_array($document['lines'] ?? null) ? $document['lines'] : [];
    $differenceCount = 0;
    $unmatchedCount = 0;
    $invoiceNet = 0.0;
    $invoiceVat = 0.0;
    $vatBreakdown = [];
    foreach ($lines as $line) {
        $invoiced = (float)($line['invoiced_quantity'] ?? 0);
        $accepted = (float)($line['accepted_quantity'] ?? 0);
        $received = (float)($line['received_quantity'] ?? 0);
        if (abs($invoiced - $accepted) > 0.00005 || abs($received - $accepted) > 0.00005 || trim((string)($line['difference_reason'] ?? $line['difference_notes'] ?? '')) !== '') {
            $differenceCount++;
        }
        if (str_starts_with(mb_strtolower((string)($line['resolution_status'] ?? '')), 'unmatched') || trim((string)($line['product_id'] ?? '')) === '') {
            $unmatchedCount++;
        }
        $gross = $invoiced * (float)($line['unit_price'] ?? 0);
        $discount = $gross * (float)($line['discount_percent'] ?? 0) / 100;
        $net = $gross - $discount;
        $vat = $net * (float)($line['vat_rate'] ?? 0) / 100;
        $invoiceNet += $net;
        $invoiceVat += $vat;

        $rate = number_format((float)($line['vat_rate'] ?? 0), 2, '.', '');
        if (!isset($vatBreakdown[$rate])) $vatBreakdown[$rate] = ['rate' => $rate, 'net' => 0.0, 'vat' => 0.0, 'net_ron' => 0.0, 'vat_ron' => 0.0];
        $vatBreakdown[$rate]['net'] += (float)($line['line_net'] ?? 0);
        $vatBreakdown[$rate]['vat'] += (float)($line['line_vat'] ?? 0);
        $vatBreakdown[$rate]['net_ron'] += (float)($line['line_net_ron'] ?? 0);
        $vatBreakdown[$rate]['vat_ron'] += (float)($line['line_vat_ron'] ?? 0);
    }
    ksort($vatBreakdown, SORT_NUMERIC);
    foreach ($vatBreakdown as &$group) {
        foreach (['net', 'vat', 'net_ron', 'vat_ron'] as $field) $group[$field] = number_format((float)$group[$field], 2, '.', '');
    }
    unset($group);
    return [
        'line_count' => count($lines),
        'difference_line_count' => $differenceCount,
        'unmatched_line_count' => $unmatchedCount,
        'invoiced_quantities' => shopNirPdfQuantitySummary($lines, 'invoiced_quantity'),
        'received_quantities' => shopNirPdfQuantitySummary($lines, 'received_quantity'),
        'accepted_quantities' => shopNirPdfQuantitySummary($lines, 'accepted_quantity'),
        'invoice_totals' => [
            'subtotal' => number_format($invoiceNet, 2, '.', ''),
            'vat_total' => number_format($invoiceVat, 2, '.', ''),
            'grand_total' => number_format($invoiceNet + $invoiceVat, 2, '.', ''),
        ],
        'accepted_totals' => [
            'subtotal' => (string)($document['subtotal'] ?? '0.00'),
            'vat_total' => (string)($document['vat_total'] ?? '0.00'),
            'grand_total' => (string)($document['grand_total'] ?? '0.00'),
            'subtotal_ron' => (string)($document['subtotal_ron'] ?? '0.00'),
            'vat_total_ron' => (string)($document['vat_total_ron'] ?? '0.00'),
            'grand_total_ron' => (string)($document['grand_total_ron'] ?? '0.00'),
        ],
        'inventory_cost_total_ron' => (string)($document['inventory_cost_total_ron'] ?? '0.00'),
        'total_difference_ron' => (string)($document['total_difference_ron'] ?? '0.00'),
        'vat_breakdown' => array_values($vatBreakdown),
    ];
}

function shopNirExportRows(PDO $db, string $id, array $user): array {
    $document = shopNirFetchDocument($db, $id, $user);
    if (!shopNirCan($user, 'NIR_VIEW_COSTS')) throw new ShopNirHttpException('Nu ai permisiunea de a exporta costurile NIR.', 403);

    foreach ($document['lines'] as &$line) unset($line['price_comparison']);
    unset($line);

    $company = $db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch() ?: [];
    $companyDefaults = [
        'legal_name' => 'CAB IT EXPERT SRL',
        'trade_name' => 'G-Trots România',
        'cui' => '49972605',
        'registration_number' => 'J2024008303400',
        'country' => 'România',
        'email' => 'contact@g-trots.ro',
        'website' => 'https://g-trots.ro',
    ];
    foreach ($companyDefaults as $field => $fallback) {
        if (trim((string)($company[$field] ?? '')) === '') $company[$field] = $fallback;
    }

    $supplier = [];
    if (trim((string)($document['supplier_id'] ?? '')) !== '') {
        $supplierStmt = $db->prepare('SELECT * FROM shop_suppliers WHERE id = ? LIMIT 1');
        $supplierStmt->execute([(string)$document['supplier_id']]);
        $supplier = $supplierStmt->fetch() ?: [];
    }
    $warehouse = [];
    if (trim((string)($document['warehouse_id'] ?? '')) !== '') {
        $warehouseStmt = $db->prepare('SELECT * FROM shop_warehouses WHERE id = ? LIMIT 1');
        $warehouseStmt->execute([(string)$document['warehouse_id']]);
        $warehouse = $warehouseStmt->fetch() ?: [];
    }

    $template = shopNirPdfTemplate($document);
    $relationship = ['original' => null, 'reversal' => null, 'original_invoice' => null, 'reason' => null];
    $relatedRows = [];
    if ($template === 'reversal') {
        $relatedStmt = $db->prepare('SELECT * FROM shop_nir_documents WHERE id = ? LIMIT 1');
        $relatedStmt->execute([(string)$document['reversal_of_id']]);
        if ($row = $relatedStmt->fetch()) {
            $relatedRows[(string)$row['id']] = $row;
            $relationship['original'] = shopNirPdfRelatedDocumentRow($row);
            $relationship['original_invoice'] = [
                'series' => $row['supplier_invoice_series'] ?? null,
                'number' => $row['supplier_invoice_number'] ?? null,
                'date' => $row['supplier_invoice_date'] ?? null,
            ];
        }
        $relationship['reversal'] = shopNirPdfRelatedDocumentRow($document);
    } elseif ($template === 'entry_reversed') {
        $relatedStmt = $db->prepare('SELECT * FROM shop_nir_documents WHERE reversal_of_id = ? ORDER BY confirmed_at DESC, created_at DESC LIMIT 1');
        $relatedStmt->execute([$id]);
        if ($row = $relatedStmt->fetch()) {
            $relatedRows[(string)$row['id']] = $row;
            $relationship['reversal'] = shopNirPdfRelatedDocumentRow($row);
        }
        $relationship['original'] = shopNirPdfRelatedDocumentRow($document);
    }

    $documentIds = array_values(array_unique(array_filter(array_merge([$id], array_keys($relatedRows)))));
    $placeholders = implode(',', array_fill(0, count($documentIds), '?'));
    $attachmentsStmt = $db->prepare(
        "SELECT a.nir_document_id, a.id, a.original_name, a.mime_type, a.extension, a.file_size, a.sha256,
                a.extraction_status, a.created_by, a.created_at, n.nir_number, n.temporary_number, n.reversal_of_id
         FROM shop_nir_attachments a
         INNER JOIN shop_nir_documents n ON n.id = a.nir_document_id
         WHERE a.nir_document_id IN ({$placeholders}) ORDER BY a.created_at, a.id"
    );
    $attachmentsStmt->execute($documentIds);
    $attachments = [];
    foreach ($attachmentsStmt->fetchAll() as $attachment) {
        $attachment['document_number'] = (string)($attachment['nir_number'] ?? $attachment['temporary_number'] ?? '');
        $attachment['relation'] = (string)$attachment['nir_document_id'] === $id ? 'current' : ((string)($attachment['reversal_of_id'] ?? '') !== '' ? 'reversal' : 'original');
        unset($attachment['nir_number'], $attachment['temporary_number'], $attachment['reversal_of_id']);
        $attachments[] = $attachment;
    }

    $auditStmt = $db->prepare(
        "SELECT id, action_type, entity_id, actor_id, actor_name, old_values_json, new_values_json, context_json, created_at
         FROM shop_domain_audit
         WHERE entity_type = 'NirDocument' AND entity_id IN ({$placeholders}) AND action_type NOT LIKE 'FIFO_%'
         ORDER BY created_at, id"
    );
    $auditStmt->execute($documentIds);
    $audit = [];
    foreach ($auditStmt->fetchAll() as $event) {
        $oldValues = shopNirPdfJson($event['old_values_json'] ?? null);
        $newValues = shopNirPdfJson($event['new_values_json'] ?? null);
        $context = shopNirPdfJson($event['context_json'] ?? null);
        if (in_array((string)$event['action_type'], ['NIR_STORNO_CREATED', 'NIR_REVERSED'], true) && $relationship['reason'] === null) {
            $reason = trim((string)($newValues['reason'] ?? $context['reason'] ?? ''));
            if ($reason !== '') $relationship['reason'] = $reason;
        }
        $audit[] = [
            'id' => (string)$event['id'],
            'action_type' => (string)$event['action_type'],
            'entity_id' => (string)$event['entity_id'],
            'actor_id' => $event['actor_id'] ?? null,
            'actor_name' => $event['actor_name'] ?? null,
            'created_at' => $event['created_at'] ?? null,
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'context' => $context,
        ];
    }
    if ($relationship['reason'] === null && $template !== 'entry') {
        $notes = trim((string)($template === 'reversal' ? ($document['notes'] ?? '') : ($relatedRows ? (reset($relatedRows)['notes'] ?? '') : '')));
        $notes = preg_replace('/^(?:Stornare|Reversare)\s+[^:]+:\s*/iu', '', $notes) ?? $notes;
        if ($notes !== '') $relationship['reason'] = $notes;
    }

    $summary = shopNirBuildPdfSummaryData($document);
    $fingerprintPayload = $document;
    unset($fingerprintPayload['permissions'], $fingerprintPayload['pdf_context']);
    $fingerprint = hash('sha256', json_encode($fingerprintPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');
    $document['pdf_context'] = [
        'template' => $template,
        'company' => $company,
        'supplier' => $supplier,
        'warehouse' => $warehouse,
        'relationship' => $relationship,
        'original_invoice_series' => $document['original_invoice_series'] ?? ($relationship['original_invoice']['series'] ?? null),
        'original_invoice_number' => $document['original_invoice_number'] ?? ($relationship['original_invoice']['number'] ?? null),
        'original_invoice_date' => $document['original_invoice_date'] ?? ($relationship['original_invoice']['date'] ?? null),
        'attachments' => $attachments,
        'audit' => $audit,
        'summary' => $summary,
        'generation' => [
            'generated_at' => date('c'),
            'generated_by' => shopNirActor($user)['name'],
            'app' => 'G-Trots Management',
            'data_fingerprint' => $fingerprint,
        ],
    ];
    return $document;
}

function shopNirXmlEscape($value): string {
    return htmlspecialchars((string)$value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function shopNirBuildSpreadsheetXml(array $document): string {
    $headers = ['Nr.', 'Cod furnizor', 'Produs', 'Cantitate', 'UM', 'Preț unitar', 'TVA %', 'Total RON', 'Cost contabil/unitate'];
    $rows = [$headers];
    foreach ($document['lines'] as $line) $rows[] = [
        $line['line_number'], $line['supplier_product_code'], $line['supplier_product_name'], $line['accepted_quantity'], $line['purchase_unit'],
        $line['unit_price'], $line['vat_rate'], $line['line_total_ron'], $line['inventory_unit_cost_ron'],
    ];
    $table = '';
    foreach ($rows as $rowIndex => $row) {
        $table .= '<Row>';
        foreach ($row as $cell) {
            $numeric = $rowIndex > 0 && is_numeric((string)$cell);
            $table .= '<Cell><Data ss:Type="' . ($numeric ? 'Number' : 'String') . '">' . shopNirXmlEscape($cell) . '</Data></Cell>';
        }
        $table .= '</Row>';
    }
    return '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="NIR"><Table>' . $table . '</Table></Worksheet></Workbook>';
}

function shopNirXlsxColumn(int $number): string {
    $column = '';
    while ($number > 0) {
        $number--;
        $column = chr(65 + ($number % 26)) . $column;
        $number = intdiv($number, 26);
    }
    return $column;
}

/**
 * Build a ZIP package with stored entries. This keeps XLSX export available on
 * PHP installations where the optional ZipArchive extension is not enabled.
 *
 * @param array<string,string> $files
 */
function shopNirBuildZip(array $files): string {
    $local = '';
    $central = '';
    $offset = 0;
    $now = getdate();
    $year = max(1980, min(2107, (int)$now['year']));
    $dosTime = ((int)$now['hours'] << 11) | ((int)$now['minutes'] << 5) | ((int)$now['seconds'] >> 1);
    $dosDate = (($year - 1980) << 9) | ((int)$now['mon'] << 5) | (int)$now['mday'];

    foreach ($files as $name => $contents) {
        $name = str_replace('\\', '/', $name);
        $size = strlen($contents);
        $crc = (int)sprintf('%u', crc32($contents));
        $nameLength = strlen($name);
        $flags = 0x0800;
        $localHeader = pack('VvvvvvVVVvv', 0x04034b50, 20, $flags, 0, $dosTime, $dosDate, $crc, $size, $size, $nameLength, 0);
        $local .= $localHeader . $name . $contents;
        $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, $flags, 0, $dosTime, $dosDate, $crc, $size, $size, $nameLength, 0, 0, 0, 0, 0, $offset) . $name;
        $offset += strlen($localHeader) + $nameLength + $size;
    }

    $count = count($files);
    return $local . $central . pack('VvvvvVVv', 0x06054b50, 0, 0, $count, $count, strlen($central), strlen($local), 0);
}

/** Build the complete premium OOXML workbook used by both applications. */
function shopNirBuildXlsx(array $document): string {
    require_once __DIR__ . '/nir-xlsx.php';
    return shopNirRenderPremiumXlsx($document);
}

function shopNirBuildPdf(array $document): string {
    require_once __DIR__ . '/nir-pdf.php';
    return shopNirRenderPremiumPdf($document);
}

/** Build the audit-friendly filename requested by accounting exports. */
function shopNirXlsxFileName(array $document): string {
    $documentNumber = trim((string)($document['nir_number'] ?? $document['temporary_number'] ?? 'NIR'));
    $series = trim((string)($document['nir_series'] ?? ''));
    $number = trim((string)($document['nir_sequence_number'] ?? ''));
    if ($series === '' || $number === '') {
        $parts = array_values(array_filter(explode('-', $documentNumber), static fn($part) => $part !== ''));
        if ($number === '' && count($parts) > 1) $number = (string)array_pop($parts);
        if ($series === '') $series = $parts ? implode('-', $parts) : $documentNumber;
    }
    $date = trim((string)($document['nir_date'] ?? $document['confirmed_at'] ?? $document['created_at'] ?? date('Y-m-d')));
    $date = substr($date, 0, 10);
    $safe = static function (string $value, string $fallback): string {
        $value = preg_replace('/[^A-Za-z0-9_-]+/u', '-', trim($value)) ?? '';
        $value = trim($value, '-_');
        return $value !== '' ? $value : $fallback;
    };
    return 'NIR_G-Trots_' . $safe($series, 'NIR') . '_' . $safe($number, 'document') . '_' . $safe($date, date('Y-m-d')) . '.xlsx';
}

function shopNirExport(PDO $db, string $id, string $format, array $user): array {
    $document = shopNirExportRows($db, $id, $user);
    $base = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)($document['nir_number'] ?? $document['temporary_number'])) ?: 'NIR';
    if ($format === 'pdf') {
        $bytes = shopNirBuildPdf($document);
        return ['file_name' => $base . '.pdf', 'mime_type' => 'application/pdf', 'content_base64' => base64_encode($bytes)];
    }
    if ($format === 'xlsx') {
        $bytes = shopNirBuildXlsx($document);
        return ['file_name' => shopNirXlsxFileName($document), 'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content_base64' => base64_encode($bytes)];
    }
    throw new InvalidArgumentException('Formatul de export nu este acceptat.');
}
