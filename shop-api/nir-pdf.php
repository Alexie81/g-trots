<?php
declare(strict_types=1);

/**
 * Premium NIR PDF renderer shared by the desktop and mobile applications.
 *
 * The caller augments the normal NIR payload with a `pdf_context` array.  The
 * renderer deliberately uses only data present in that payload; optional
 * sections disappear instead of being filled with fictional placeholders.
 */

$dompdfPhar = __DIR__ . '/lib/dompdf-runtime.phar';
$dompdfDirectoryAutoload = __DIR__ . '/lib/dompdf/autoload.inc.php';
// Producția folosește arhiva verificată și atomic înlocuibilă. Directorul
// Composer rămâne fallback pentru dezvoltarea locală și instalări din surse.
if (is_file($dompdfPhar)) {
    require_once 'phar://' . $dompdfPhar . '/autoload.inc.php';
} elseif (is_file($dompdfDirectoryAutoload)) {
    require_once $dompdfDirectoryAutoload;
} else {
    throw new RuntimeException('Motorul PDF nu este instalat.');
}

use Dompdf\Dompdf;
use Dompdf\FontMetrics;
use Dompdf\Options;

function shopNirPdfEscape($value): string {
    return htmlspecialchars((string)($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

function shopNirPdfFirst(array $source, array $keys, $default = null) {
    foreach ($keys as $key) {
        if (array_key_exists($key, $source) && $source[$key] !== null && $source[$key] !== '') return $source[$key];
    }
    return $default;
}

function shopNirPdfDecimal($value, int $maximumDecimals = 2, bool $signed = false): string {
    if ($value === null || $value === '' || !is_numeric((string)$value)) return '—';
    $number = (float)$value;
    $decimals = $maximumDecimals;
    if (abs($number - round($number)) < 0.0000001) $decimals = 0;
    $formatted = number_format($number, $decimals, ',', '.');
    if ($decimals > 0) $formatted = rtrim(rtrim($formatted, '0'), ',');
    return $signed && $number > 0 ? '+' . $formatted : $formatted;
}

function shopNirPdfMoney($value, string $currency = 'RON', int $decimals = 2): string {
    if ($value === null || $value === '' || !is_numeric((string)$value)) return '—';
    return number_format((float)$value, $decimals, ',', '.') . ' ' . strtoupper($currency ?: 'RON');
}

function shopNirPdfDate($value, bool $withTime = false): string {
    $raw = trim((string)($value ?? ''));
    if ($raw === '') return '';
    try {
        $date = new DateTimeImmutable($raw);
        return $date->format($withTime || preg_match('/\d{2}:\d{2}/', $raw) ? 'd.m.Y, H:i' : 'd.m.Y');
    } catch (Throwable $error) {
        return $raw;
    }
}

function shopNirPdfDateTime($date, $time = null): string {
    $dateValue = trim((string)($date ?? ''));
    $timeValue = trim((string)($time ?? ''));
    if ($dateValue === '') return '';
    return shopNirPdfDate($dateValue . ($timeValue !== '' ? ' ' . $timeValue : ''), $timeValue !== '');
}

function shopNirPdfJoin(array $values, string $separator = ' · '): string {
    return implode($separator, array_values(array_filter(array_map(static fn($value): string => trim((string)($value ?? '')), $values), static fn(string $value): bool => $value !== '')));
}

function shopNirPdfField(string $label, $value, string $class = ''): string {
    $text = trim((string)($value ?? ''));
    if ($text === '') return '';
    return '<div class="field ' . shopNirPdfEscape($class) . '"><span>' . shopNirPdfEscape($label) . '</span><strong>' . shopNirPdfEscape($text) . '</strong></div>';
}

function shopNirPdfDocumentNumber($value, $date = null): string {
    $raw = strtoupper(trim((string)($value ?? '')));
    if (preg_match('/^(?:NIR|REV|STO)-(\d{4})-(\d+)$/', $raw, $matches)) {
        return 'NIR-' . $matches[1] . '-' . str_pad($matches[2], 6, '0', STR_PAD_LEFT);
    }
    if (preg_match('/^NIR-(\d+)$/', $raw, $matches)) {
        $year = shopNirPdfDate($date ?: 'now');
        $year = preg_match('/(\d{4})/', $year, $yearMatch) ? $yearMatch[1] : date('Y');
        return 'NIR-' . $year . '-' . str_pad($matches[1], 6, '0', STR_PAD_LEFT);
    }
    return $raw;
}

function shopNirPdfPresentationText($value): string {
    $text = trim((string)($value ?? ''));
    if ($text === '') return '';
    $text = preg_replace_callback(
        '/\b(?:NIR|REV|STO)-\d{4}-\d+\b/iu',
        static fn(array $matches): string => shopNirPdfDocumentNumber($matches[0]),
        $text
    ) ?? $text;
    return str_ireplace(['reversare', 'reversat', 'reversal', 'reversed', 'storno'], ['stornare', 'stornat', 'stornare', 'stornat', 'stornare'], $text);
}

function shopNirPdfIsStornoDocument(array $document): bool {
    return trim((string)($document['reversal_of_id'] ?? '')) !== ''
        || strtolower(trim((string)($document['source_type'] ?? ''))) === 'reversal';
}

function shopNirPdfOriginalInvoiceTrace(array $relationship): string {
    $original = is_array($relationship['original'] ?? null) ? $relationship['original'] : [];
    $invoiceData = is_array($relationship['original_invoice'] ?? null) ? $relationship['original_invoice'] : [];
    $invoice = shopNirPdfJoin([
        shopNirPdfFirst($invoiceData, ['series', 'supplier_invoice_series', 'invoice_series'], shopNirPdfFirst($original, ['supplier_invoice_series', 'invoice_series'], '')),
        shopNirPdfFirst($invoiceData, ['number', 'supplier_invoice_number', 'invoice_number'], shopNirPdfFirst($original, ['supplier_invoice_number', 'invoice_number'], '')),
    ], ' ');
    $invoiceDate = shopNirPdfDate(shopNirPdfFirst($invoiceData, ['date', 'supplier_invoice_date', 'invoice_date'], shopNirPdfFirst($original, ['supplier_invoice_date', 'invoice_date'], '')));
    $nirNumber = shopNirPdfDocumentNumber(shopNirPdfFirst($original, ['nir_number', 'number', 'document_number', 'temporary_number'], ''), $original['nir_date'] ?? null);
    $parts = [];
    if ($invoice !== '') $parts[] = 'Stornează factura ' . $invoice . ($invoiceDate !== '' ? ' din data ' . $invoiceDate : '');
    if ($nirNumber !== '') $parts[] = 'NIR original ' . $nirNumber;
    return implode(', ', $parts);
}

function shopNirPdfLogoDataUri(): ?string {
    $candidates = [
        [__DIR__ . '/pdf-assets/logo.jpg', 'image/jpeg', false],
        [dirname(__DIR__) . '/assets/images/logo.png', 'image/png', true],
        [dirname(__DIR__) . '/assets/logo.png', 'image/png', true],
        [__DIR__ . '/assets/images/logo.png', 'image/png', true],
        [__DIR__ . '/assets/logo.png', 'image/png', true],
    ];
    foreach ($candidates as [$path, $mime, $needsGd]) {
        if ($needsGd && !extension_loaded('gd')) continue;
        if (!is_file($path) || !is_readable($path)) continue;
        $bytes = file_get_contents($path);
        if ($bytes !== false && $bytes !== '') return 'data:' . $mime . ';base64,' . base64_encode($bytes);
    }
    return null;
}

function shopNirPdfDifferenceLabel($value): string {
    $labels = [
        'shortage' => 'Lipsă cantitativă',
        'surplus' => 'Cantitate în plus',
        'damaged' => 'Produs deteriorat',
        'wrong_product' => 'Produs neconform / greșit',
        'price_difference' => 'Diferență de preț',
        'vat_difference' => 'Diferență TVA',
        'other' => 'Altă diferență',
        'reversal' => 'Stornare document',
    ];
    $key = strtolower(trim((string)($value ?? '')));
    return $labels[$key] ?? ($key !== '' ? 'Neconcordanță semnalată' : '');
}

function shopNirPdfAuditLabel($value): string {
    $labels = [
        'NIR_DRAFT_CREATED' => 'Ciornă creată',
        'NIR_DRAFT_UPDATED' => 'Ciornă actualizată',
        'NIR_DOCUMENT_IMPORTED' => 'Document furnizor atașat',
        'NIR_DOCUMENT_EXTRACTED' => 'Date document verificate',
        'NIR_CONFIRMED' => 'NIR confirmat',
        'NIR_REOPENED_FOR_CORRECTION' => 'NIR deschis pentru corectare',
        'NIR_REVERSED' => 'Stornare înregistrată',
        'NIR_STORNO_CREATED' => 'Stornare înregistrată',
    ];
    $key = strtoupper(trim((string)($value ?? '')));
    if (str_contains($key, 'REVERS') || str_contains($key, 'STORNO')) return 'Stornare înregistrată';
    return $labels[$key] ?? ($key !== '' ? str_replace('_', ' ', $key) : 'Operațiune înregistrată');
}

function shopNirPdfMode(array $document, array $context): string {
    $template = $context['template'] ?? [];
    $explicit = is_array($template) ? ($template['mode'] ?? $template['type'] ?? '') : $template;
    $explicit = strtolower(trim((string)$explicit));
    if (shopNirPdfIsStornoDocument($document)) return 'reversal';
    if ($explicit === 'entry_reversed' || strtolower((string)($document['status'] ?? '')) === 'reversed') return 'entry_reversed';
    return 'entry';
}

function shopNirPdfStatus(array $document, string $mode): array {
    $status = strtolower(trim((string)($document['status'] ?? '')));
    if ($mode === 'reversal') return ['STORNAT', 'red', 'STORNARE'];
    // Documentul original rămâne confirmat; numai documentul negativ este stornat.
    if ($mode === 'entry_reversed') return ['CONFIRMAT', 'green', ''];
    if ($status === 'draft') {
        $correcting = trim((string)($document['nir_number'] ?? '')) !== '';
        return [$correcting ? 'ÎN CORECTARE' : 'CIORNĂ', 'amber', $correcting ? 'ÎN CORECTARE' : 'CIOARNĂ'];
    }
    return ['CONFIRMAT', 'green', ''];
}

function shopNirPdfRelationship(array $document, array $context, string $mode): array {
    $relationship = is_array($context['relationship'] ?? null) ? $context['relationship'] : [];
    $original = is_array($relationship['original'] ?? null) ? $relationship['original'] : [];
    $reversal = is_array($relationship['reversal'] ?? null) ? $relationship['reversal'] : [];
    $originalInvoice = is_array($relationship['original_invoice'] ?? null) ? $relationship['original_invoice'] : [];
    if (!$originalInvoice) {
        $originalInvoice = [
            'series' => $context['original_invoice_series'] ?? null,
            'number' => $context['original_invoice_number'] ?? null,
            'date' => $context['original_invoice_date'] ?? null,
        ];
    }
    if ($mode === 'reversal' && !$original && is_array($context['original'] ?? null)) $original = $context['original'];
    if ($mode === 'entry_reversed' && !$reversal && is_array($context['reversal'] ?? null)) $reversal = $context['reversal'];
    return [
        'original' => $original,
        'reversal' => $reversal,
        'original_invoice' => $originalInvoice,
        'reason' => shopNirPdfPresentationText(shopNirPdfFirst($relationship, ['reason', 'reversal_reason'], shopNirPdfFirst($reversal, ['reversal_reason', 'reason'], ''))),
        'reversed_at' => shopNirPdfFirst($relationship, ['reversed_at'], shopNirPdfFirst($document, ['reversed_at'], shopNirPdfFirst($reversal, ['confirmed_at', 'created_at'], ''))),
        'reversed_by' => shopNirPdfFirst($relationship, ['reversed_by', 'actor_name'], shopNirPdfFirst($document, ['reversed_by'], shopNirPdfFirst($reversal, ['confirmed_by', 'created_by'], ''))),
    ];
}

function shopNirPdfGroupQuantities(array $lines, string $field): string {
    $groups = [];
    foreach ($lines as $line) {
        if (!is_array($line) || !is_numeric((string)($line[$field] ?? null))) continue;
        $unit = trim((string)($line['purchase_unit'] ?? $line['stock_unit'] ?? 'unit.')) ?: 'unit.';
        $groups[$unit] = ($groups[$unit] ?? 0.0) + (float)$line[$field];
    }
    $parts = [];
    foreach ($groups as $unit => $quantity) {
        if (abs($quantity) < 0.00005) continue;
        $parts[] = shopNirPdfDecimal($quantity, 4) . ' ' . $unit;
    }
    return $parts ? implode(' · ', $parts) : ($groups ? '0' : '—');
}

function shopNirPdfSummary(array $document, array $context): array {
    $lines = is_array($document['lines'] ?? null) ? $document['lines'] : [];
    $provided = is_array($context['summary'] ?? null) ? $context['summary'] : [];
    $differences = [];
    foreach ($lines as $line) {
        if (!is_array($line)) continue;
        $invoiced = (float)($line['invoiced_quantity'] ?? 0);
        $received = (float)($line['received_quantity'] ?? $line['accepted_quantity'] ?? 0);
        $accepted = (float)($line['accepted_quantity'] ?? 0);
        if (abs($invoiced - $received) > 0.00005 || abs($received - $accepted) > 0.00005 || trim((string)($line['difference_reason'] ?? $line['difference_notes'] ?? '')) !== '') {
            $differences[] = $line;
        }
    }
    return [
        'line_count' => count($lines),
        'invoiced' => shopNirPdfFirst($provided, ['invoiced_label', 'invoiced'], shopNirPdfGroupQuantities($lines, 'invoiced_quantity')),
        'received' => shopNirPdfFirst($provided, ['received_label', 'received'], shopNirPdfGroupQuantities($lines, 'received_quantity')),
        'accepted' => shopNirPdfFirst($provided, ['accepted_label', 'accepted'], shopNirPdfGroupQuantities($lines, 'accepted_quantity')),
        'difference_count' => count($differences),
        'differences' => $differences,
    ];
}

function shopNirPdfVatGroups(array $lines, string $currency): array {
    $groups = [];
    foreach ($lines as $line) {
        if (!is_array($line)) continue;
        $rate = is_numeric((string)($line['vat_rate'] ?? null)) ? number_format((float)$line['vat_rate'], 2, '.', '') : '0.00';
        if (!isset($groups[$rate])) $groups[$rate] = ['rate' => (float)$rate, 'base' => 0.0, 'vat' => 0.0, 'base_ron' => 0.0, 'vat_ron' => 0.0];
        $groups[$rate]['base'] += (float)($line['line_net'] ?? 0);
        $groups[$rate]['vat'] += (float)($line['line_vat'] ?? 0);
        $groups[$rate]['base_ron'] += (float)($line['line_net_ron'] ?? 0);
        $groups[$rate]['vat_ron'] += (float)($line['line_vat_ron'] ?? 0);
    }
    ksort($groups, SORT_NUMERIC);
    return array_values($groups);
}

function shopNirPdfProductRows(array $document, string $mode): string {
    $lines = is_array($document['lines'] ?? null) ? $document['lines'] : [];
    $currency = strtoupper((string)($document['currency'] ?? 'RON'));
    $html = '';
    foreach ($lines as $index => $line) {
        if (!is_array($line)) continue;
        $supplierName = trim((string)($line['supplier_product_name'] ?? ''));
        $supplierMeta = shopNirPdfJoin([
            trim((string)($line['supplier_product_code'] ?? '')) !== '' ? 'Cod: ' . $line['supplier_product_code'] : '',
            trim((string)($line['supplier_ean'] ?? '')) !== '' ? 'EAN: ' . $line['supplier_ean'] : '',
        ]);
        $internalName = trim((string)($line['product_name'] ?? $line['product_snapshot_name'] ?? ''));
        $internalMeta = shopNirPdfJoin([
            trim((string)($line['product_sku'] ?? $line['sku_snapshot'] ?? '')) !== '' ? 'SKU: ' . ($line['product_sku'] ?? $line['sku_snapshot']) : '',
            trim((string)($line['product_ean'] ?? $line['ean_snapshot'] ?? '')) !== '' ? 'EAN: ' . ($line['product_ean'] ?? $line['ean_snapshot']) : '',
        ]);
        $purchaseUnit = trim((string)($line['purchase_unit'] ?? ''));
        $stockUnit = trim((string)($line['stock_unit'] ?? ''));
        $factor = (float)($line['conversion_factor'] ?? 1);
        $unit = $purchaseUnit;
        if ($stockUnit !== '' && ($stockUnit !== $purchaseUnit || abs($factor - 1) > 0.000001)) {
            $unit = shopNirPdfJoin([$purchaseUnit, '→ ' . shopNirPdfDecimal($factor, 6) . ' ' . $stockUnit], ' ');
        }
        $discount = (float)($line['discount_percent'] ?? 0);
        $unitPrice = (float)($line['unit_price'] ?? 0);
        $netUnit = $unitPrice * (1 - $discount / 100);
        $reason = shopNirPdfDifferenceLabel($line['difference_reason'] ?? '');
        $notes = shopNirPdfPresentationText($line['difference_notes'] ?? $line['mismatch_reason'] ?? '');
        $difference = shopNirPdfJoin([$reason, $notes], ': ');
        if ($mode === 'reversal' && $difference === '') $difference = 'Stornare pentru poziția selectată din documentul original';
        $rowClass = $mode === 'reversal' ? 'negative-row' : ($difference !== '' ? 'difference-row' : '');
        $html .= '<tr class="' . $rowClass . '">';
        $html .= '<td class="center line-number">' . shopNirPdfEscape($line['line_number'] ?? ($index + 1)) . '</td>';
        $html .= '<td><b>' . shopNirPdfEscape($supplierName ?: '—') . '</b>' . ($supplierMeta !== '' ? '<small>' . shopNirPdfEscape($supplierMeta) . '</small>' : '') . '</td>';
        $html .= '<td><b>' . shopNirPdfEscape($internalName ?: '—') . '</b>' . ($internalMeta !== '' ? '<small>' . shopNirPdfEscape($internalMeta) . '</small>' : '') . '</td>';
        $html .= '<td class="center">' . shopNirPdfEscape($unit ?: '—') . '</td>';
        foreach (['invoiced_quantity', 'received_quantity', 'accepted_quantity'] as $quantityField) {
            $html .= '<td class="number">' . shopNirPdfEscape(shopNirPdfDecimal($line[$quantityField] ?? 0, 4, $mode === 'reversal')) . '</td>';
        }
        $price = shopNirPdfMoney($netUnit, $currency, 4);
        if ($discount > 0) $price .= ' (-' . shopNirPdfDecimal($discount, 2) . '%)';
        $html .= '<td class="number price">' . shopNirPdfEscape($price) . '</td>';
        $html .= '<td class="number">' . shopNirPdfEscape(shopNirPdfDecimal($line['vat_rate'] ?? 0, 2)) . '%</td>';
        $html .= '<td class="number cost">' . shopNirPdfEscape(shopNirPdfMoney($line['inventory_unit_cost_ron'] ?? 0, 'RON', 4)) . '</td>';
        $html .= '<td class="number total">' . shopNirPdfEscape(shopNirPdfMoney($line['inventory_cost_total_ron'] ?? 0, 'RON')) . '</td>';
        $html .= '<td class="reason">' . shopNirPdfEscape($difference ?: '—') . '</td>';
        $html .= '</tr>';
    }
    if ($html === '') $html = '<tr><td colspan="12" class="empty">Documentul nu conține poziții.</td></tr>';
    return $html;
}

function shopNirPdfRelationshipBanner(array $relationship, string $mode): string {
    if ($mode === 'entry') return '';
    $related = $mode === 'reversal' ? $relationship['original'] : $relationship['reversal'];
    $number = shopNirPdfDocumentNumber(shopNirPdfFirst($related, ['nir_number', 'document_number', 'temporary_number'], ''), $related['nir_date'] ?? $related['created_at'] ?? null);
    $title = $mode === 'reversal'
        ? 'Acest document stornează pozițiile selectate din nota de recepție originală.'
        : 'Această notă de recepție rămâne confirmată și are un document de stornare asociat.';
    $parts = [];
    if ($mode === 'reversal') {
        $trace = shopNirPdfOriginalInvoiceTrace($relationship);
        if ($trace !== '') $parts[] = $trace;
    } elseif ($number !== '') {
        $parts[] = 'Document de stornare asociat: ' . $number;
    }
    if (($date = shopNirPdfDate($relationship['reversed_at'] ?? '', true)) !== '') $parts[] = $date;
    if (trim((string)($relationship['reversed_by'] ?? '')) !== '') $parts[] = 'Operat de ' . $relationship['reversed_by'];
    if (trim((string)($relationship['reason'] ?? '')) !== '') $parts[] = 'Motiv: ' . $relationship['reason'];
    $bannerClass = $mode === 'entry_reversed' ? ' relationship-original' : '';
    return '<div class="relationship-banner' . $bannerClass . '"><strong>' . shopNirPdfEscape($title) . '</strong><span>' . shopNirPdfEscape(shopNirPdfJoin($parts, ' | ')) . '</span></div>';
}

function shopNirPdfHeaderHtml(array $document, array $company, array $status, string $mode, ?string $logo): string {
    $number = shopNirPdfDocumentNumber(shopNirPdfFirst($document, ['nir_number', 'temporary_number'], 'NIR'), $document['nir_date'] ?? null);
    $legalName = shopNirPdfFirst($company, ['legal_name', 'company_name'], '');
    $tradeName = shopNirPdfFirst($company, ['trade_name'], 'G-Trots');
    $identity = shopNirPdfJoin([
        $legalName,
        trim((string)($company['cui'] ?? '')) !== '' ? 'CUI ' . $company['cui'] : '',
        trim((string)($company['registration_number'] ?? '')) !== '' ? 'Reg. Com. ' . $company['registration_number'] : '',
    ], ' | ');
    $contact = shopNirPdfJoin([
        shopNirPdfJoin([$company['address'] ?? '', $company['city'] ?? '', $company['county'] ?? '', $company['country'] ?? ''], ', '),
        $company['email'] ?? '',
        $company['phone'] ?? '',
        $company['website'] ?? '',
    ], ' | ');
    $title = $mode === 'reversal' ? 'DOCUMENT DE STORNARE A NOTEI DE RECEPȚIE' : 'NOTĂ DE RECEPȚIE ȘI CONSTATARE DE DIFERENȚE';
    $subtitle = $mode === 'reversal' ? 'Document corectiv legat de NIR-ul original' : 'NIR · Cod 14-3-1A';
    $logoHtml = $logo !== null
        ? '<img class="brand-logo" src="' . shopNirPdfEscape($logo) . '" alt="G-Trots">'
        : '<span class="brand-fallback">GT</span>';
    return '<header class="document-header">'
        . '<div class="brand">' . $logoHtml . '<div><b>' . shopNirPdfEscape($tradeName) . '</b>'
        . ($identity !== '' ? '<span>' . shopNirPdfEscape($identity) . '</span>' : '')
        . ($contact !== '' ? '<small>' . shopNirPdfEscape($contact) . '</small>' : '') . '</div></div>'
        . '<div class="document-title"><h1>' . shopNirPdfEscape($title) . '</h1><p>' . shopNirPdfEscape($subtitle) . '</p></div>'
        . '<div class="document-identity"><div class="document-number"><span>DOCUMENT</span><strong>' . shopNirPdfEscape($number) . '</strong></div><div class="document-status-row"><b class="status ' . shopNirPdfEscape($status[1]) . '">' . shopNirPdfEscape($status[0]) . '</b></div></div>'
        . '</header>';
}

function shopNirPdfCardsHtml(array $document, array $context): string {
    $supplier = is_array($context['supplier'] ?? null) ? $context['supplier'] : [];
    $warehouse = is_array($context['warehouse'] ?? null) ? $context['warehouse'] : [];
    $currency = strtoupper((string)($document['currency'] ?? 'RON'));
    $supplierAddress = shopNirPdfJoin([$supplier['address'] ?? '', $supplier['address_line2'] ?? '', $supplier['city'] ?? '', $supplier['county'] ?? '', $supplier['postal_code'] ?? '', $supplier['country'] ?? ''], ', ');
    $supplierTitle = shopNirPdfFirst($supplier, ['name'], shopNirPdfFirst($document, ['supplier_name'], 'Furnizor necompletat'));
    $invoice = shopNirPdfJoin([$document['supplier_invoice_series'] ?? '', $document['supplier_invoice_number'] ?? ''], ' ');
    $sourceFile = '';
    $attachments = is_array($context['attachments'] ?? null) ? $context['attachments'] : (is_array($document['attachments'] ?? null) ? $document['attachments'] : []);
    if ($attachments) $sourceFile = (string)shopNirPdfFirst($attachments[0], ['original_name', 'name'], '');
    $sourceType = shopNirPdfIsStornoDocument($document) ? 'Stornare NIR' : (string)($document['source_type'] ?? '');
    $supplierFields = shopNirPdfField('CUI / CIF', shopNirPdfFirst($supplier, ['cui', 'vat_number'], shopNirPdfFirst($document, ['supplier_cui'], '')))
        . shopNirPdfField('Registrul Comerțului', $supplier['registration_number'] ?? '')
        . shopNirPdfField('Adresă', $supplierAddress)
        . shopNirPdfField('Contact', shopNirPdfJoin([$supplier['contact_person'] ?? '', $supplier['email'] ?? '', $supplier['phone'] ?? '']));
    $documentFields = shopNirPdfField('Factură', $invoice)
        . shopNirPdfField('Data facturii', shopNirPdfDate($document['supplier_invoice_date'] ?? ''))
        . shopNirPdfField('Fișier sursă', $sourceFile)
        . shopNirPdfField('Sursa introducerii', $sourceType);
    $receiptFields = shopNirPdfField('Data și ora NIR', shopNirPdfDateTime($document['nir_date'] ?? '', $document['nir_time'] ?? ''))
        . shopNirPdfField('Recepție fizică', shopNirPdfDateTime($document['reception_date'] ?? '', $document['reception_time'] ?? ''))
        . shopNirPdfField('Gestiune', shopNirPdfFirst($warehouse, ['name'], $document['warehouse_name'] ?? ''))
        . shopNirPdfField('Confirmat de / la', shopNirPdfJoin([$document['confirmed_by'] ?? '', shopNirPdfDate($document['confirmed_at'] ?? '', true)]));
    $exchangeFields = shopNirPdfField('Moneda facturii', $currency)
        . shopNirPdfField('Curs utilizat', trim((string)($document['exchange_rate'] ?? '')) !== '' ? shopNirPdfDecimal($document['exchange_rate'], 8) . ' RON/' . $currency : '')
        . shopNirPdfField('Data cursului', shopNirPdfDate($document['exchange_rate_date'] ?? ''))
        . shopNirPdfField('Total document', shopNirPdfMoney($document['grand_total'] ?? null, $currency));
    return '<section class="cards">'
        . '<article class="card supplier"><span>01 / FURNIZOR</span><h2>' . shopNirPdfEscape($supplierTitle) . '</h2><div class="field-grid">' . $supplierFields . '</div></article>'
        . '<article class="card source"><span>02 / DOCUMENT SURSĂ</span><h2>' . shopNirPdfEscape($invoice !== '' ? 'Factura ' . $invoice : 'Document de proveniență') . '</h2><div class="field-grid">' . $documentFields . '</div></article>'
        . '<article class="card receipt"><span>03 / RECEPȚIE</span><h2>' . shopNirPdfEscape(shopNirPdfFirst($warehouse, ['name'], $document['warehouse_name'] ?? 'Gestiune')) . '</h2><div class="field-grid">' . $receiptFields . '</div></article>'
        . '<article class="card currency"><span>04 / VALUTĂ ȘI CURS</span><h2>' . shopNirPdfEscape($currency === 'RON' ? 'Document în lei' : 'Document în valută') . '</h2><div class="field-grid">' . $exchangeFields . '</div></article>'
        . '</section>';
}

function shopNirPdfMetricsHtml(array $document, array $summary, string $mode): string {
    $cost = $document['inventory_cost_total_ron'] ?? null;
    $isStorno = $mode === 'reversal';
    $differenceLabel = $isStorno ? 'Stornare document' : ((int)$summary['difference_count'] > 0 ? 'Recepție cu diferențe' : 'Recepție fără diferențe');
    return '<section class="result-strip"><div><span>REZULTAT</span><strong>' . shopNirPdfEscape($differenceLabel) . '</strong></div>'
        . '<div><span>POZIȚII</span><strong>' . shopNirPdfEscape((string)$summary['line_count']) . '</strong></div>'
        . '<div><span>' . ($isStorno ? 'CANT. FACTURĂ' : 'FACTURAT') . '</span><strong>' . shopNirPdfEscape((string)$summary['invoiced']) . '</strong></div>'
        . '<div><span>' . ($isStorno ? 'CANT. CORECTATĂ' : 'PRIMIT') . '</span><strong>' . shopNirPdfEscape((string)$summary['received']) . '</strong></div>'
        . '<div><span>' . ($isStorno ? 'CANT. STORNATĂ' : 'ACCEPTAT') . '</span><strong>' . shopNirPdfEscape((string)$summary['accepted']) . '</strong></div>'
        . '<div class="result-total"><span>' . ($isStorno ? 'VALOARE STORNATĂ' : 'VALOARE INTRARE') . '</span><strong>' . shopNirPdfEscape(shopNirPdfMoney($cost, 'RON')) . '</strong></div></section>';
}

function shopNirPdfTotalsHtml(array $document, string $mode): string {
    $isStorno = $mode === 'reversal';
    $currency = strtoupper((string)($document['currency'] ?? 'RON'));
    $lines = is_array($document['lines'] ?? null) ? $document['lines'] : [];
    $allocated = 0.0;
    $discount = 0.0;
    foreach ($lines as $line) {
        if (!is_array($line)) continue;
        $allocated += (float)($line['allocated_cost_ron'] ?? 0);
        $discount += (float)($line['discount_value'] ?? 0);
    }
    $vatRows = '';
    foreach (shopNirPdfVatGroups($lines, $currency) as $group) {
        $vatRows .= '<tr><td>' . shopNirPdfEscape(shopNirPdfDecimal($group['rate'], 2)) . '%</td><td class="number">' . shopNirPdfEscape(shopNirPdfMoney($group['base'], $currency)) . '</td><td class="number">' . shopNirPdfEscape(shopNirPdfMoney($group['vat'], $currency)) . '</td><td class="number">' . shopNirPdfEscape(shopNirPdfMoney($group['base_ron'], 'RON')) . '</td><td class="number">' . shopNirPdfEscape(shopNirPdfMoney($group['vat_ron'], 'RON')) . '</td></tr>';
    }
    if ($vatRows === '') $vatRows = '<tr><td colspan="5" class="empty">Nu există poziții pentru centralizarea TVA.</td></tr>';
    $totalLine = static fn(string $label, string $value, string $class = ''): string => '<div class="total-line ' . shopNirPdfEscape($class) . '"><span>' . shopNirPdfEscape($label) . '</span><strong>' . shopNirPdfEscape($value) . '</strong></div>';
    return '<section class="totals">'
        . '<article><h3>CENTRALIZARE DOCUMENT FURNIZOR</h3><div class="total-lines">'
        . $totalLine('Valoare netă produse', shopNirPdfMoney($document['subtotal'] ?? null, $currency))
        . ($discount != 0.0 ? $totalLine('Reduceri comerciale', shopNirPdfMoney(-abs($discount), $currency)) : '')
        . $totalLine('TVA document', shopNirPdfMoney($document['vat_total'] ?? null, $currency))
        . $totalLine('Total document', shopNirPdfMoney($document['grand_total'] ?? null, $currency), 'grand')
        . '</div></article>'
        . '<article><h3>' . ($isStorno ? 'ECHIVALENT ȘI VALOARE STORNATĂ ÎN RON' : 'ECHIVALENT ȘI COST DE INTRARE ÎN RON') . '</h3><div class="total-lines">'
        . $totalLine('Bază echivalentă în RON', shopNirPdfMoney($document['subtotal_ron'] ?? null, 'RON'))
        . $totalLine('TVA echivalent în RON', shopNirPdfMoney($document['vat_total_ron'] ?? null, 'RON'))
        . ($allocated != 0.0 ? $totalLine('Costuri directe alocate', shopNirPdfMoney($allocated, 'RON')) : '')
        . $totalLine($isStorno ? 'Valoare stornată din gestiune' : 'Valoare intrată în gestiune', shopNirPdfMoney($document['inventory_cost_total_ron'] ?? null, 'RON'), 'grand accent')
        . '</div></article>'
        . '<article class="vat"><h3>CENTRALIZARE TVA PE COTE</h3><table><thead><tr><th>Cotă</th><th>Bază ' . shopNirPdfEscape($currency) . '</th><th>TVA ' . shopNirPdfEscape($currency) . '</th><th>Bază RON</th><th>TVA RON</th></tr></thead><tbody>' . $vatRows . '</tbody></table></article>'
        . '</section>';
}

function shopNirPdfAttachmentsHtml(array $attachments): string {
    if (!$attachments) return '<p class="empty-note">Nu sunt înregistrate documente atașate.</p>';
    $html = '<ol class="attachment-list">';
    foreach ($attachments as $attachment) {
        if (!is_array($attachment)) continue;
        $name = shopNirPdfFirst($attachment, ['original_name', 'name'], 'Document atașat');
        $meta = shopNirPdfJoin([
            strtoupper((string)shopNirPdfFirst($attachment, ['extension'], '')),
            isset($attachment['file_size']) && is_numeric((string)$attachment['file_size']) ? number_format(((float)$attachment['file_size']) / 1024, 0, ',', '.') . ' KB' : '',
            trim((string)($attachment['sha256'] ?? '')) !== '' ? 'SHA-256 ' . substr((string)$attachment['sha256'], 0, 16) . '…' : '',
        ]);
        $html .= '<li><b>' . shopNirPdfEscape($name) . '</b>' . ($meta !== '' ? '<small>' . shopNirPdfEscape($meta) . '</small>' : '') . '</li>';
    }
    return $html . '</ol>';
}

function shopNirPdfAuditHtml(array $audit, array $document): string {
    if (!$audit) {
        $fallback = [];
        if (trim((string)($document['created_by'] ?? '')) !== '') $fallback[] = ['action_type' => 'NIR_DRAFT_CREATED', 'actor_name' => $document['created_by'], 'created_at' => $document['created_at'] ?? ''];
        if (trim((string)($document['confirmed_by'] ?? '')) !== '') $fallback[] = ['action_type' => 'NIR_CONFIRMED', 'actor_name' => $document['confirmed_by'], 'created_at' => $document['confirmed_at'] ?? ''];
        if (trim((string)($document['reversed_by'] ?? '')) !== '') $fallback[] = ['action_type' => 'NIR_REVERSED', 'actor_name' => $document['reversed_by'], 'created_at' => $document['reversed_at'] ?? ''];
        $audit = $fallback;
    }
    if (!$audit) return '<p class="empty-note">Nu există evenimente de audit disponibile în contextul exportului.</p>';
    $html = '<div class="audit-list">';
    foreach ($audit as $event) {
        if (!is_array($event)) continue;
        $label = shopNirPdfAuditLabel($event['action_type'] ?? $event['action'] ?? '');
        $actor = shopNirPdfFirst($event, ['actor_name', 'created_by', 'user_name'], '');
        $when = shopNirPdfDate(shopNirPdfFirst($event, ['created_at', 'timestamp'], ''), true);
        $html .= '<div><i></i><span><b>' . shopNirPdfEscape($label) . '</b><small>' . shopNirPdfEscape(shopNirPdfJoin([$actor, $when])) . '</small></span></div>';
    }
    return $html . '</div>';
}

function shopNirPdfDifferenceHtml(array $differences, string $mode): string {
    if (!$differences) {
        if ($mode === 'reversal') {
            return '<div class="conclusion-ok"><b>FĂRĂ ALTE DIFERENȚE ÎNREGISTRATE</b><span>Documentul corectiv conține exclusiv cantitățile și valorile selectate pentru stornare.</span></div>';
        }
        return '<div class="conclusion-ok"><b>FĂRĂ DIFERENȚE ÎNREGISTRATE</b><span>Conform datelor validate în aplicație, nu sunt consemnate diferențe cantitative sau calitative pentru această recepție.</span></div>';
    }
    $rows = '';
    foreach ($differences as $line) {
        if (!is_array($line)) continue;
        $product = shopNirPdfFirst($line, ['product_name', 'product_snapshot_name', 'supplier_product_name'], '—');
        $reason = shopNirPdfDifferenceLabel($line['difference_reason'] ?? '');
        $notes = shopNirPdfPresentationText($line['difference_notes'] ?? $line['mismatch_reason'] ?? '');
        $rows .= '<tr><td>' . shopNirPdfEscape($line['line_number'] ?? '') . '</td><td><b>' . shopNirPdfEscape($product) . '</b></td><td>' . shopNirPdfEscape($reason ?: 'Diferență cantitativă') . '</td><td class="number">' . shopNirPdfEscape(shopNirPdfDecimal($line['invoiced_quantity'] ?? 0, 4)) . '</td><td class="number">' . shopNirPdfEscape(shopNirPdfDecimal($line['received_quantity'] ?? 0, 4)) . '</td><td class="number">' . shopNirPdfEscape(shopNirPdfDecimal($line['accepted_quantity'] ?? 0, 4)) . '</td><td>' . shopNirPdfEscape($notes ?: '—') . '</td></tr>';
    }
    $quantityHeaders = $mode === 'reversal'
        ? '<th>Cant. factură</th><th>Cant. corectată</th><th>Cant. stornată</th>'
        : '<th>Facturat</th><th>Primit</th><th>Acceptat</th>';
    return '<table class="difference-table"><thead><tr><th>Poz.</th><th>Produs</th><th>Tip diferență</th>' . $quantityHeaders . '<th>Constatare / măsură</th></tr></thead><tbody>' . $rows . '</tbody></table>';
}

function shopNirPdfAnnexHtml(array $document, array $context, array $relationship, array $summary, string $mode): string {
    $attachments = is_array($context['attachments'] ?? null) ? $context['attachments'] : (is_array($document['attachments'] ?? null) ? $document['attachments'] : []);
    $audit = is_array($context['audit'] ?? null) ? $context['audit'] : [];
    $notes = shopNirPdfPresentationText($document['notes'] ?? '');
    $relation = shopNirPdfRelationshipBanner($relationship, $mode);
    $conclusion = $mode === 'reversal'
        ? 'Documentul de stornare scade numai valorile și cantitățile selectate din NIR-ul original, fără a șterge documentul istoric.'
        : ($mode === 'entry_reversed'
            ? 'NIR-ul original rămâne confirmat și este păstrat integral. Operațiunea negativă este documentată separat prin NIR-ul de stornare asociat.'
            : ((int)$summary['difference_count'] > 0
                ? 'Recepția conține diferențe consemnate mai jos. În gestiune intră numai cantitățile acceptate.'
                : 'Bunurile au fost recepționate conform cantităților acceptate și au fost înregistrate în gestiunea indicată.'));
    return '<section class="annex">'
        . '<div class="annex-kicker">ANEXĂ DE CONSTATARE, EXPLICAȚII ȘI AUDIT</div>'
        . '<h2>Concluzia documentului</h2><p class="lead">' . shopNirPdfEscape($conclusion) . '</p>' . $relation
        . '<div class="annex-section"><h3>' . ($mode === 'reversal' ? 'CONTROLUL DOCUMENTULUI CORECTIV' : 'CONSTATAREA DIFERENȚELOR') . '</h3>' . shopNirPdfDifferenceHtml($summary['differences'], $mode) . '</div>'
        . ($notes !== '' ? '<div class="annex-section notes"><h3>OBSERVAȚII INTERNE</h3><p>' . nl2br(shopNirPdfEscape($notes), false) . '</p></div>' : '')
        . '<div class="annex-columns"><article><h3>DOCUMENTE ASOCIATE</h3>' . shopNirPdfAttachmentsHtml($attachments) . '</article><article><h3>JURNAL DE AUDIT</h3>' . shopNirPdfAuditHtml($audit, $document) . '</article></div>'
        . '<div class="legend"><h3>' . ($mode === 'reversal' ? 'CUM SE INTERPRETEAZĂ DOCUMENTUL DE STORNARE' : 'CUM SE INTERPRETEAZĂ ACEST NIR') . '</h3><div class="legend-grid">'
        . ($mode === 'reversal'
            ? '<p><b>CANTITATE DIN FACTURĂ</b><span>Cantitatea negativă înscrisă pe factura furnizorului folosită pentru stornare.</span></p>'
                . '<p><b>CANTITATE CORECTATĂ</b><span>Cantitatea la care se aplică documentul corectiv curent.</span></p>'
                . '<p><b>CANTITATE STORNATĂ</b><span>Cantitatea scăzută din gestiune prin această operațiune.</span></p>'
                . '<p><b>COST UNITAR STORNAT</b><span>Costul contabil unitar în RON preluat pentru poziția selectată.</span></p>'
                . '<p><b>VALOARE STORNATĂ</b><span>Valoarea contabilă negativă care corectează gestiunea.</span></p>'
            : '<p><b>CANTITATE FACTURATĂ</b><span>Cantitatea înscrisă de furnizor pe factură sau pe documentul de livrare.</span></p>'
                . '<p><b>CANTITATE PRIMITĂ</b><span>Cantitatea verificată fizic în cadrul recepției.</span></p>'
                . '<p><b>CANTITATE ACCEPTATĂ</b><span>Cantitatea validată pentru intrarea efectivă în gestiune.</span></p>'
                . '<p><b>COST UNITAR DE INTRARE</b><span>Costul contabil în RON rezultat din valoarea netă și costurile direct atribuibile înregistrate.</span></p>'
                . '<p><b>VALOARE DE INTRARE</b><span>Valoarea cantității acceptate, calculată în RON pentru încărcarea gestiunii.</span></p>')
        . '</div></div>'
        . '<p class="legal-note">Document financiar-contabil generat electronic din datele validate în aplicația G-Trots. Documentul se arhivează împreună cu factura și documentele justificative asociate.</p>'
        . '</section>';
}

function shopNirPdfCss(string $mode): string {
    $accent = $mode === 'entry' ? '#168a57' : '#c93f4b';
    $soft = $mode === 'entry' ? '#eaf8f1' : '#fcecef';
    return <<<'CSS'
@page { size: A4 landscape; margin: 12mm 9mm 16mm 9mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: "DejaVu Sans", sans-serif; color: #17191c; font-size: 7.2pt; line-height: 1.32; }
body { border-top: 4px solid __ACCENT__; }
.watermark { position: fixed; z-index: -1; top: 42%; left: 13%; width: 74%; text-align: center; transform: rotate(-22deg); font-size: 56pt; font-weight: 800; color: rgba(201,63,75,.055); letter-spacing: 3px; }
.document-header { display: table; table-layout: fixed; width: 100%; border-bottom: 1px solid #dce2e7; padding: 5px 0 9px; margin-bottom: 8px; }
.document-header > div { display: table-cell; vertical-align: middle; }
.brand { width: 31%; }
.brand-logo, .brand-fallback { float: left; width: 37px; height: 37px; margin-right: 9px; border-radius: 10px; }
.brand-logo { object-fit: contain; }
.brand-fallback { background: #ff9000; color: #fff; font-size: 13pt; font-weight: 800; text-align: center; padding-top: 9px; }
.brand div { padding-top: 2px; }
.brand b { display: block; font-size: 10pt; }
.brand span, .brand small { display: block; color: #68717c; font-size: 5.5pt; margin-top: 2px; }
.document-title { width: 42%; text-align: center; padding: 0 8px; }
.document-title h1 { margin: 0; font-size: 12.2pt; letter-spacing: .15px; }
.document-title p { margin: 4px 0 0; color: __ACCENT__; font-size: 6.4pt; font-weight: 800; }
.document-identity { width: 27%; padding-left: 10px; text-align: right; vertical-align: middle; }
.document-number { display: block; width: 100%; }
.document-number span { display: block; color: #8d96a0; font-size: 5.2pt; font-weight: 800; }
.document-number strong { display: block; width: 100%; margin-top: 2px; font-size: 8.2pt; line-height: 1.15; overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word; }
.document-status-row { display: block; width: 100%; clear: both; padding-top: 6px; }
.status { display: inline-block; white-space: nowrap; border: 1px solid __ACCENT__; color: __ACCENT__; background: __SOFT__; padding: 4px 9px; border-radius: 12px; font-size: 5.7pt; }
.relationship-banner { border: 1px solid #df929a; background: #fcecef; color: #8f2530; border-radius: 9px; padding: 7px 10px; margin: 7px 0; page-break-inside: avoid; }
.relationship-banner strong, .relationship-banner span { display: block; }
.relationship-banner span { margin-top: 3px; font-size: 6pt; color: #6c3d42; }
.relationship-banner.relationship-original { border-color: #86cdb0; background: #edf9f3; color: #176c4c; }
.relationship-banner.relationship-original span { color: #3f6f5d; }
.cards { display: table; width: 100%; border-spacing: 6px 0; margin-left: -6px; margin-bottom: 8px; page-break-inside: avoid; }
.card { display: table-cell; width: 25%; border: 1px solid #dce2e7; border-radius: 9px; padding: 8px; vertical-align: top; }
.card > span { color: __ACCENT__; font-size: 5.4pt; font-weight: 800; letter-spacing: .3px; }
.card h2 { margin: 4px 0 7px; font-size: 8.3pt; }
.field-grid { display: table; width: 100%; }
.field { display: block; margin-top: 4px; }
.field span { display: block; color: #8d96a0; font-size: 4.8pt; font-weight: 800; text-transform: uppercase; }
.field strong { display: block; margin-top: 1px; font-size: 5.8pt; }
.result-strip { display: table; width: 100%; background: __SOFT__; border: 1px solid __ACCENT__; border-radius: 9px; margin-bottom: 8px; page-break-inside: avoid; }
.result-strip > div { display: table-cell; padding: 7px 8px; border-right: 1px solid rgba(80,90,100,.12); vertical-align: middle; }
.result-strip > div:first-child { width: 17%; }
.result-strip > div:last-child { border-right: 0; }
.result-strip span { display: block; color: #68717c; font-size: 4.8pt; font-weight: 800; }
.result-strip strong { display: block; margin-top: 2px; font-size: 7pt; color: __ACCENT__; }
.result-strip .result-total { background: #fff3e3; width: 13%; }
.result-strip .result-total strong { color: #b85d00; font-size: 8.3pt; }
.product-section h2 { margin: 6px 0 5px; font-size: 7pt; color: __ACCENT__; letter-spacing: .4px; }
.product-table, .difference-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.product-table thead { display: table-header-group; }
.product-table tr, .difference-table tr { page-break-inside: avoid; }
.product-table th { padding: 6px 4px; background: #17191c; color: white; font-size: 4.65pt; text-align: left; }
.product-table td { border: 1px solid #e1e5e9; padding: 5px 4px; vertical-align: top; font-size: 5.2pt; overflow-wrap: break-word; }
.product-table tbody tr:nth-child(even) { background: #f8f9fa; }
.product-table td b { display: block; font-size: 5.5pt; }
.product-table td small { display: block; color: #68717c; font-size: 4.6pt; margin-top: 2px; }
.product-table .center { text-align: center; }
.product-table .number { text-align: right; white-space: nowrap; }
.product-table .reason { font-size: 4.8pt; }
.product-table .cost, .product-table .total { font-weight: 700; }
.product-table .total { color: #b85d00; }
.product-table .difference-row { background: #fff8eb !important; }
.product-table .negative-row td.number, .product-table .negative-row td.total { color: #c93f4b; }
.empty { padding: 15px !important; text-align: center !important; color: #68717c; }
.totals { display: table; width: 100%; border-spacing: 7px 0; margin: 9px 0 0 -7px; page-break-inside: avoid; }
.totals > article { display: table-cell; width: 31%; border: 1px solid #dce2e7; border-radius: 9px; padding: 8px; vertical-align: top; }
.totals > article.vat { width: 38%; }
.totals h3, .annex h3 { margin: 0 0 6px; color: __ACCENT__; font-size: 5.7pt; letter-spacing: .35px; }
.total-line { display: table; width: 100%; border-bottom: 1px solid #edf0f2; }
.total-line span, .total-line strong { display: table-cell; padding: 3px 0; font-size: 5.6pt; vertical-align: middle; }
.total-line span { width: 64%; color: #68717c; }
.total-line strong { width: 36%; text-align: right; }
.total-line.grand { border-bottom: 0; border-top: 1px solid #d9dfe3; margin-top: 3px; }
.total-line.grand span, .total-line.grand strong { padding-top: 5px; font-weight: 800; color: #17191c; }
.total-line.accent strong { color: #b85d00; font-size: 7pt; }
.vat table { width: 100%; border-collapse: collapse; }
.vat th, .vat td { padding: 3px; border-bottom: 1px solid #e5e9ec; font-size: 4.8pt; text-align: left; }
.vat .number { text-align: right; }
.annex { page-break-before: always; }
.annex-kicker { color: __ACCENT__; font-weight: 800; font-size: 6pt; letter-spacing: .5px; margin-bottom: 5px; }
.annex > h2 { margin: 0 0 5px; font-size: 13pt; }
.lead { margin: 0 0 8px; padding: 8px 10px; background: __SOFT__; border-left: 4px solid __ACCENT__; border-radius: 7px; font-weight: 700; }
.annex-section { margin-top: 10px; page-break-inside: avoid; }
.difference-table th { background: #17191c; color: white; padding: 5px; font-size: 5pt; text-align: left; }
.difference-table td { padding: 5px; border: 1px solid #e0e5e8; font-size: 5.2pt; }
.difference-table .number { text-align: right; }
.conclusion-ok { border: 1px solid #9ed6ba; background: #eaf8f1; border-radius: 8px; padding: 9px; }
.conclusion-ok b, .conclusion-ok span { display: block; }
.conclusion-ok b { color: #168a57; font-size: 6pt; }
.conclusion-ok span { margin-top: 3px; color: #4f6258; }
.notes { background: #f4f6f8; border-radius: 8px; padding: 8px 10px; }
.notes p { margin: 0; }
.annex-columns { display: table; width: 100%; border-spacing: 8px 0; margin: 10px 0 0 -8px; page-break-inside: avoid; }
.annex-columns article { display: table-cell; width: 50%; padding: 9px; border: 1px solid #dce2e7; border-radius: 9px; vertical-align: top; }
.attachment-list { margin: 0; padding-left: 17px; }
.attachment-list li { padding: 3px 0; border-bottom: 1px solid #eef0f2; }
.attachment-list small { display: block; color: #68717c; font-size: 5pt; }
.audit-list > div { display: table; width: 100%; padding: 3px 0; border-bottom: 1px solid #eef0f2; }
.audit-list i, .audit-list span { display: table-cell; vertical-align: middle; }
.audit-list i { width: 7px; height: 7px; background: __ACCENT__; border-radius: 50%; }
.audit-list span { padding-left: 7px; }
.audit-list b, .audit-list small { display: block; }
.audit-list small, .empty-note { color: #68717c; font-size: 5pt; }
.legend { margin-top: 10px; border: 1px solid #bdd8e7; background: #eaf5fb; border-radius: 9px; padding: 9px; page-break-inside: avoid; }
.legend h3 { color: #2877a5; }
.legend-grid { display: table; width: 100%; }
.legend-grid p { display: table-cell; width: 20%; padding-right: 8px; vertical-align: top; }
.legend-grid b, .legend-grid span { display: block; }
.legend-grid b { color: #2877a5; font-size: 4.8pt; }
.legend-grid span { margin-top: 3px; color: #4c6471; font-size: 4.8pt; }
.legal-note { margin: 10px 0 0; color: #8d96a0; font-size: 5pt; text-align: center; }
CSS;
}

/** Render a complete premium NIR PDF and return its raw bytes. */
function shopNirRenderPremiumPdf(array $document): string {
    $context = is_array($document['pdf_context'] ?? null) ? $document['pdf_context'] : [];
    $company = is_array($context['company'] ?? null) ? $context['company'] : [];
    $mode = shopNirPdfMode($document, $context);
    $status = shopNirPdfStatus($document, $mode);
    $relationship = shopNirPdfRelationship($document, $context, $mode);
    $summary = shopNirPdfSummary($document, $context);
    $logo = shopNirPdfLogoDataUri();
    $watermark = $status[2] !== '' ? '<div class="watermark">' . shopNirPdfEscape($status[2]) . '</div>' : '';
    $relationshipBanner = shopNirPdfRelationshipBanner($relationship, $mode);
    $isStorno = $mode === 'reversal';
    $productSectionTitle = $isStorno ? 'POZIȚII STORNATE ȘI VALORI CORECTIVE' : 'POZIȚII RECEPȚIONATE ȘI VALORI DE INTRARE';
    $productHeaders = $isStorno
        ? '<th>Nr.</th><th>Produs furnizor / cod</th><th>Produs intern / SKU</th><th>U.M. / conversie</th><th>Cant. factură</th><th>Cant. corectată</th><th>Cant. stornată</th><th>Preț net</th><th>TVA</th><th>Cost unitar stornat RON</th><th>Valoare stornată RON</th><th>Trasabilitate / observații</th>'
        : '<th>Nr.</th><th>Produs furnizor / cod</th><th>Produs intern / SKU</th><th>U.M. / conversie</th><th>Facturat</th><th>Primit</th><th>Acceptat</th><th>Preț net</th><th>TVA</th><th>Cost unitar intrare RON</th><th>Valoare intrare RON</th><th>Diferență / observații</th>';
    $css = str_replace(['__ACCENT__', '__SOFT__'], [$isStorno ? '#c93f4b' : '#168a57', $isStorno ? '#fcecef' : '#eaf8f1'], shopNirPdfCss($mode));
    $html = '<!doctype html><html lang="ro"><head><meta charset="UTF-8"><style>' . $css . '</style></head><body>' . $watermark
        . shopNirPdfHeaderHtml($document, $company, $status, $mode, $logo)
        . $relationshipBanner
        . shopNirPdfCardsHtml($document, $context)
        . shopNirPdfMetricsHtml($document, $summary, $mode)
        . '<section class="product-section"><h2>' . $productSectionTitle . '</h2><table class="product-table">'
        . '<colgroup><col style="width:3%"><col style="width:15%"><col style="width:15%"><col style="width:7%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:8%"><col style="width:5%"><col style="width:9%"><col style="width:9%"><col style="width:11%"></colgroup>'
        . '<thead><tr>' . $productHeaders . '</tr></thead>'
        . '<tbody>' . shopNirPdfProductRows($document, $mode) . '</tbody></table></section>'
        . shopNirPdfTotalsHtml($document, $mode)
        . shopNirPdfAnnexHtml($document, $context, $relationship, $summary, $mode)
        . '</body></html>';

    $options = new Options();
    $options->set('isRemoteEnabled', false);
    $options->set('isHtml5ParserEnabled', true);
    $options->set('isPhpEnabled', false);
    $options->set('isJavascriptEnabled', false);
    $options->set('isFontSubsettingEnabled', true);
    $options->set('defaultFont', 'DejaVu Sans');
    $options->setChroot([__DIR__, dirname(__DIR__)]);
    $dompdf = new Dompdf($options);
    $dompdf->setPaper('A4', 'landscape');
    $dompdf->loadHtml($html, 'UTF-8');
    $dompdf->render();

    $generation = is_array($context['generation'] ?? null) ? $context['generation'] : [];
    $documentNumber = shopNirPdfDocumentNumber(shopNirPdfFirst($document, ['nir_number', 'temporary_number'], 'NIR'), $document['nir_date'] ?? null);
    $documentId = trim((string)($document['id'] ?? ''));
    $generatedAt = shopNirPdfDate(shopNirPdfFirst($generation, ['generated_at'], 'now'), true);
    $version = shopNirPdfFirst($generation, ['document_version', 'version'], $document['row_version'] ?? '');
    $appVersion = shopNirPdfFirst($generation, ['app_version'], '');
    $appLabel = shopNirPdfFirst($generation, ['app'], $appVersion !== '' ? 'G-Trots ' . $appVersion : 'G-Trots Management');
    $dataHash = shopNirPdfFirst($generation, ['data_fingerprint', 'data_hash', 'hash'], '');
    $leftFooter = shopNirPdfJoin([
        $documentNumber,
        $documentId !== '' ? 'ID ' . substr($documentId, 0, 18) : '',
        $version !== '' ? 'Versiune ' . $version : '',
    ], '  |  ');
    $centerFooter = shopNirPdfJoin([
        $generatedAt !== '' ? 'Generat la ' . $generatedAt : '',
        $appLabel,
        $dataHash !== '' ? 'Amprentă date ' . substr((string)$dataHash, 0, 16) : '',
    ], '  |  ');
    $statusLabel = $status[0];
    $statusColor = $status[1] === 'green' ? [0.09, 0.54, 0.34] : ($status[1] === 'amber' ? [0.72, 0.42, 0.0] : [0.79, 0.25, 0.29]);
    $canvas = $dompdf->getCanvas();
    $fontMetrics = $dompdf->getFontMetrics();
    $canvas->page_script(static function (int $pageNumber, int $pageCount, $canvas, FontMetrics $fontMetrics) use ($leftFooter, $centerFooter, $statusLabel, $statusColor): void {
        $width = $canvas->get_width();
        $height = $canvas->get_height();
        $font = $fontMetrics->getFont('DejaVu Sans', 'normal');
        $bold = $fontMetrics->getFont('DejaVu Sans', 'bold');
        $canvas->line(26, $height - 35, $width - 26, $height - 35, [0.86, 0.89, 0.91], 0.55);
        $canvas->text(26, $height - 26, $leftFooter, $font, 5.5, [0.38, 0.43, 0.48]);
        $centerWidth = $fontMetrics->getTextWidth($centerFooter, $font, 5.2);
        $canvas->text(max(26, ($width - $centerWidth) / 2), $height - 26, $centerFooter, $font, 5.2, [0.45, 0.49, 0.54]);
        $right = $statusLabel . '  |  Pagina ' . $pageNumber . ' din ' . $pageCount;
        $rightWidth = $fontMetrics->getTextWidth($right, $bold, 5.5);
        $canvas->text($width - 26 - $rightWidth, $height - 26, $right, $bold, 5.5, $statusColor);
    });

    return $dompdf->output();
}
