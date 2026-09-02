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
    static $cached = false;
    static $cachedValue = null;
    if ($cached) return $cachedValue;
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
        if ($bytes !== false && $bytes !== '') {
            $cached = true;
            return $cachedValue = 'data:' . $mime . ';base64,' . base64_encode($bytes);
        }
    }
    $cached = true;
    return $cachedValue = null;
}

/** Resolve only product images stored by this API and embed them in the PDF. */
function shopNirPdfProductImageDataUri(array $line): ?string {
    static $cache = [];
    $raw = trim((string)($line['product_image_storage_path'] ?? $line['product_image_url'] ?? ''));
    if ($raw === '' || str_contains($raw, "\0")) return null;
    $path = parse_url($raw, PHP_URL_PATH);
    if (!is_string($path) || $path === '') $path = $raw;
    $path = rawurldecode(str_replace('\\', '/', $path));
    $marker = 'uploads/products/';
    $position = strpos(ltrim($path, '/'), $marker);
    if ($position === false) return null;
    $relative = substr(ltrim($path, '/'), $position);
    if (!preg_match('#^uploads/products/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$#i', $relative)) return null;

    $base = realpath(__DIR__ . '/uploads/products');
    $candidate = realpath(__DIR__ . '/' . $relative);
    if ($base === false || $candidate === false || !is_file($candidate)) return null;
    $prefix = rtrim($base, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    if (!str_starts_with($candidate, $prefix)) return null;
    $size = filesize($candidate);
    if ($size === false || $size < 32 || $size > 6 * 1024 * 1024) return null;
    $cacheKey = $candidate . '|' . (string)filemtime($candidate) . '|' . $size;
    if (array_key_exists($cacheKey, $cache)) return $cache[$cacheKey];
    $info = @getimagesize($candidate);
    $mime = strtolower((string)($info['mime'] ?? ''));
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) return $cache[$cacheKey] = null;
    $bytes = file_get_contents($candidate);
    if (!is_string($bytes) || $bytes === '') return $cache[$cacheKey] = null;

    // Dompdf plătea costul decodării imaginii originale pentru fiecare rând și
    // fiecare document. În PDF miniatura are numai 34px, deci păstrăm suficientă
    // rezoluție pentru print, fără a introduce fotografii de mai mulți MB.
    $width = (int)($info[0] ?? 0);
    $height = (int)($info[1] ?? 0);
    if ($width > 180 || $height > 180) {
        $source = function_exists('imagecreatefromstring') ? @imagecreatefromstring($bytes) : false;
        if ($source !== false) {
            $scale = min(180 / max(1, $width), 180 / max(1, $height));
            $targetWidth = max(1, (int)round($width * $scale));
            $targetHeight = max(1, (int)round($height * $scale));
            $canvas = imagecreatetruecolor($targetWidth, $targetHeight);
            if ($mime === 'image/jpeg') {
                $white = imagecolorallocate($canvas, 255, 255, 255);
                imagefilledrectangle($canvas, 0, 0, $targetWidth, $targetHeight, $white);
            } else {
                imagealphablending($canvas, false);
                imagesavealpha($canvas, true);
                $transparent = imagecolorallocatealpha($canvas, 255, 255, 255, 127);
                imagefilledrectangle($canvas, 0, 0, $targetWidth, $targetHeight, $transparent);
            }
            imagecopyresampled($canvas, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);
            ob_start();
            if ($mime === 'image/jpeg' && function_exists('imagejpeg')) {
                imagejpeg($canvas, null, 82);
                $outputMime = 'image/jpeg';
            } else {
                imagepng($canvas, null, 7);
                $outputMime = 'image/png';
            }
            $resized = ob_get_clean();
            imagedestroy($canvas);
            imagedestroy($source);
            if (is_string($resized) && strlen($resized) > 20) {
                $bytes = $resized;
                $mime = $outputMime;
            }
        }
    }
    return $cache[$cacheKey] = 'data:' . $mime . ';base64,' . base64_encode($bytes);
}

/** Resolve only the company stamp stored by this API. */
function shopNirPdfCompanyStampDataUri(array $company): ?string {
    static $cache = [];
    $raw = trim((string)($company['stamp_path'] ?? ''));
    if ($raw === '' || str_contains($raw, "\0")) return null;
    $path = parse_url($raw, PHP_URL_PATH);
    if (!is_string($path) || $path === '') $path = $raw;
    $path = rawurldecode(str_replace('\\', '/', $path));
    $marker = 'uploads/company/';
    $position = strpos(ltrim($path, '/'), $marker);
    if ($position === false) return null;
    $relative = substr(ltrim($path, '/'), $position);
    if (!preg_match('#^uploads/company/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$#i', $relative)) return null;
    $base = realpath(__DIR__ . '/uploads/company');
    $candidate = realpath(__DIR__ . '/' . $relative);
    if ($base === false || $candidate === false || !is_file($candidate)) return null;
    if (!str_starts_with($candidate, rtrim($base, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)) return null;
    $size = filesize($candidate);
    if ($size === false || $size < 32 || $size > 6 * 1024 * 1024) return null;
    $cacheKey = $candidate . '|' . (string)filemtime($candidate) . '|' . $size;
    if (array_key_exists($cacheKey, $cache)) return $cache[$cacheKey];
    $info = @getimagesize($candidate);
    $mime = strtolower((string)($info['mime'] ?? ''));
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) return $cache[$cacheKey] = null;
    $bytes = file_get_contents($candidate);
    if (!is_string($bytes) || $bytes === '') return $cache[$cacheKey] = null;
    $trimmed = shopNirPdfPrepareCompanyStamp($bytes);
    return $cache[$cacheKey] = $trimmed !== null
        ? 'data:image/png;base64,' . base64_encode($trimmed)
        : 'data:' . $mime . ';base64,' . base64_encode($bytes);
}

/** Crop empty stamp margins, remove white paper and strengthen faint ink without changing proportions. */
function shopNirPdfPrepareCompanyStamp(string $bytes): ?string {
    if (!function_exists('imagecreatefromstring') || !function_exists('imagepng')) return null;
    $source = @imagecreatefromstring($bytes);
    if ($source === false) return null;
    $width = imagesx($source); $height = imagesy($source);
    if ($width < 1 || $height < 1 || $width * $height > 30000000) { imagedestroy($source); return null; }
    $left = $width; $top = $height; $right = -1; $bottom = -1;
    for ($y = 0; $y < $height; $y++) {
        for ($x = 0; $x < $width; $x++) {
            $rgba = imagecolorat($source, $x, $y);
            $alpha = ($rgba >> 24) & 0x7f; $red = ($rgba >> 16) & 0xff; $green = ($rgba >> 8) & 0xff; $blue = $rgba & 0xff;
            if ($alpha < 118 && min($red, $green, $blue) < 246) {
                $left = min($left, $x); $right = max($right, $x); $top = min($top, $y); $bottom = max($bottom, $y);
            }
        }
    }
    if ($right < $left || $bottom < $top) { imagedestroy($source); return null; }
    $pad = max(4, (int)round(max($right - $left, $bottom - $top) * .025));
    $left = max(0, $left - $pad); $top = max(0, $top - $pad);
    $right = min($width - 1, $right + $pad); $bottom = min($height - 1, $bottom + $pad);
    $cropWidth = $right - $left + 1; $cropHeight = $bottom - $top + 1;
    $canvas = imagecreatetruecolor($cropWidth, $cropHeight);
    imagealphablending($canvas, false); imagesavealpha($canvas, true);
    $transparent = imagecolorallocatealpha($canvas, 255, 255, 255, 127);
    imagefilledrectangle($canvas, 0, 0, $cropWidth, $cropHeight, $transparent);
    for ($y = 0; $y < $cropHeight; $y++) {
        for ($x = 0; $x < $cropWidth; $x++) {
            $rgba = imagecolorat($source, $left + $x, $top + $y);
            $alpha = ($rgba >> 24) & 0x7f; $red = ($rgba >> 16) & 0xff; $green = ($rgba >> 8) & 0xff; $blue = $rgba & 0xff;
            if ($alpha >= 118 || min($red, $green, $blue) >= 246) continue;
            $red = max(0, (int)round($red * .72)); $green = max(0, (int)round($green * .72)); $blue = max(0, (int)round($blue * .72));
            imagesetpixel($canvas, $x, $y, imagecolorallocatealpha($canvas, $red, $green, $blue, min(110, $alpha)));
        }
    }
    ob_start(); imagepng($canvas, null, 6); $result = ob_get_clean();
    imagedestroy($canvas); imagedestroy($source);
    return is_string($result) && $result !== '' ? $result : null;
}

function shopNirPdfIconDataUri(string $type, string $color = '#071b3e'): string {
    $paths = [
        'document' => '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
        'calendar' => '<path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
        'user' => '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
        'id' => '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2.5"/><path d="M5 16c1-2 5-2 6 0M14 10h5M14 14h5"/>',
        'warehouse' => '<path d="M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11"/><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z"/><path d="M6 13h12M6 17h12"/>',
        'pin' => '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
        'invoice' => '<path d="m18 5-2.414-2.414A2 2 0 0 0 14.172 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2"/><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><path d="M8 18h1"/>',
        'operation' => '<path d="M12 12h.01M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M22 13a18.15 18.15 0 0 1-20 0"/><rect x="2" y="6" width="20" height="14" rx="2"/>',
        'info' => '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
        'clipboard' => '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    ];
    $body = $paths[$type] ?? $paths['info'];
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="' . htmlspecialchars($color, ENT_QUOTES) . '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' . $body . '</svg>';
    return 'data:image/svg+xml;base64,' . base64_encode($svg);
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
        $thumbnail = shopNirPdfProductImageDataUri($line);
        $html .= '<tr class="' . $rowClass . '">';
        $html .= '<td class="center line-number">' . shopNirPdfEscape($line['line_number'] ?? ($index + 1)) . '</td>';
        $html .= '<td class="center thumbnail-cell">' . ($thumbnail !== null
            ? '<img class="product-thumbnail" src="' . shopNirPdfEscape($thumbnail) . '" alt="Produs">'
            : '<span class="thumbnail-empty">Fără<br>imagine</span>') . '</td>';
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
    if ($html === '') $html = '<tr><td colspan="13" class="empty">Documentul nu conține poziții.</td></tr>';
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
.product-table .thumbnail-cell { padding: 3px; vertical-align: middle; }
.product-thumbnail { display: block; width: 34px; height: 34px; margin: 0 auto; object-fit: contain; border: 1px solid #dce2e7; border-radius: 5px; background: white; }
.thumbnail-empty { display: inline-block; color: #9aa2aa; font-size: 4.1pt; line-height: 1.15; }
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

function shopNirPdfStrictInvoice(array $document, bool $original = false): string {
    $context = is_array($document['pdf_context'] ?? null) ? $document['pdf_context'] : [];
    $relationship = is_array($context['relationship'] ?? null) ? $context['relationship'] : [];
    if ($original && !is_array($relationship['original_invoice'] ?? null)) return '';
    $source = $original ? $relationship['original_invoice'] : $document;
    $series = shopNirPdfFirst($source, $original ? ['series', 'supplier_invoice_series'] : ['supplier_invoice_series'], '');
    $number = shopNirPdfFirst($source, $original ? ['number', 'supplier_invoice_number'] : ['supplier_invoice_number'], '');
    $date = shopNirPdfDate(shopNirPdfFirst($source, $original ? ['date', 'supplier_invoice_date'] : ['supplier_invoice_date'], ''));
    $identity = shopNirPdfJoin([$series, $number], ' ');
    return shopNirPdfJoin([$identity, $date], ' / ');
}

function shopNirPdfStrictRows(array $document, ?array $pageLines = null): string {
    $rows = '';
    $currency = strtoupper(trim((string)($document['currency'] ?? 'RON'))) ?: 'RON';
    $currencyLabel = $currency === 'RON' ? 'lei' : $currency;
    $allLines = array_values(is_array($document['lines'] ?? null) ? $document['lines'] : []);
    $renderLines = $pageLines ?? $allLines;
    foreach ($renderLines as $index => $line) {
        if (!is_array($line)) continue;
        $invoiced = (float)($line['invoiced_quantity'] ?? 0);
        $received = (float)($line['received_quantity'] ?? $line['accepted_quantity'] ?? 0);
        $discount = (float)($line['discount_percent'] ?? 0);
        $unitPrice = (float)($line['unit_price'] ?? 0) * (1 - $discount / 100);
        $net = $received * $unitPrice;
        $vatRate = (float)($line['vat_rate'] ?? 0);
        $vat = $net * $vatRate / 100;
        $difference = $received - $invoiced;
        $differenceClass = $difference < -0.000001 ? ' diff-negative' : ($difference > 0.000001 ? ' diff-positive' : ' diff-zero');
        $name = shopNirPdfFirst($line, ['product_name', 'product_snapshot_name', 'supplier_product_name'], '—');
        $thumbnail = shopNirPdfProductImageDataUri($line);
        $imageHtml = $thumbnail !== null ? '<img class="product-image" src="' . shopNirPdfEscape($thumbnail) . '" alt="Produs">' : '<span class="image-placeholder">GT</span>';
        $rows .= '<tr><td class="c row-number">' . shopNirPdfEscape($line['line_number'] ?? ($index + 1)) . '</td>'
            . '<td>' . shopNirPdfEscape($line['product_sku'] ?? $line['sku_snapshot'] ?? $line['supplier_product_code'] ?? '') . '</td>'
            . '<td class="c image-cell">' . $imageHtml . '</td>'
            . '<td class="product-name">' . shopNirPdfEscape($name) . '</td>'
            . '<td class="c">' . shopNirPdfEscape($line['purchase_unit'] ?? $line['stock_unit'] ?? '') . '</td>'
            . '<td class="n">' . shopNirPdfEscape(shopNirPdfDecimal($invoiced, 4)) . '</td>'
            . '<td class="n">' . shopNirPdfEscape(shopNirPdfDecimal($received, 4)) . '</td>'
            . '<td class="n' . $differenceClass . '">' . shopNirPdfEscape(shopNirPdfDecimal($difference, 4, true)) . '</td>'
            . '<td class="n">' . shopNirPdfEscape(shopNirPdfDecimal($unitPrice, 4) . ' ' . $currencyLabel) . '</td>'
            . '<td class="n">' . shopNirPdfEscape(shopNirPdfDecimal($net, 2) . ' ' . $currencyLabel) . '</td>'
            . '<td class="n">' . shopNirPdfEscape(shopNirPdfDecimal($vatRate, 2)) . '%</td>'
            . '<td class="n">' . shopNirPdfEscape(shopNirPdfDecimal($vat, 2) . ' ' . $currencyLabel) . '</td>'
            . '<td class="n">' . shopNirPdfEscape(shopNirPdfDecimal($net + $vat, 2) . ' ' . $currencyLabel) . '</td></tr>';
    }
    return $rows !== '' ? $rows : '<tr><td colspan="13" class="empty">Nu există poziții.</td></tr>';
}

function shopNirStrictPdfHtml(array $document): string {
    $context = is_array($document['pdf_context'] ?? null) ? $document['pdf_context'] : [];
    $company = is_array($context['company'] ?? null) ? $context['company'] : [];
    $supplier = is_array($context['supplier'] ?? null) ? $context['supplier'] : [];
    $warehouse = is_array($context['warehouse'] ?? null) ? $context['warehouse'] : [];
    $relationship = is_array($context['relationship'] ?? null) ? $context['relationship'] : [];
    $isStorno = shopNirPdfIsStornoDocument($document);
    $companyName = shopNirPdfFirst($company, ['legal_name', 'trade_name'], 'G-Trots România');
    $companyIdentity = shopNirPdfJoin([
        $companyName,
        trim((string)($company['cui'] ?? '')) !== '' ? 'CUI ' . $company['cui'] : '',
        trim((string)($company['registration_number'] ?? '')) !== '' ? 'Reg. Com. ' . $company['registration_number'] : '',
    ], ' | ');
    $logo = shopNirPdfLogoDataUri();
    $logoHtml = $logo !== null ? '<img class="strict-logo" src="' . shopNirPdfEscape($logo) . '" alt="G-Trots">' : '';
    $number = shopNirPdfDocumentNumber(shopNirPdfFirst($document, ['nir_number', 'temporary_number'], 'NIR'), $document['nir_date'] ?? null);
    $date = shopNirPdfDate($document['nir_date'] ?? $document['created_at'] ?? '');
    $supplierName = shopNirPdfFirst($supplier, ['name'], $document['supplier_name'] ?? '');
    $supplierCui = shopNirPdfFirst($supplier, ['cui', 'vat_number'], $document['supplier_cui'] ?? '');
    $warehouseName = shopNirPdfFirst($warehouse, ['name'], $document['warehouse_name'] ?? '');
    $receiptLocation = shopNirPdfFirst($document, ['reception_location', 'receipt_location'], shopNirPdfJoin([$warehouseName, $warehouse['address'] ?? '', $warehouse['city'] ?? ''], ', '));
    $reason = shopNirPdfPresentationText(shopNirPdfFirst($relationship, ['reason'], shopNirPdfFirst($document, ['difference_notes', 'notes'], '')));
    $observations = trim((string)($document['notes'] ?? ''));
    $stamp = shopNirPdfCompanyStampDataUri($company);
    $stampHtml = $stamp !== null
        ? '<img class="company-stamp" src="' . shopNirPdfEscape($stamp) . '" alt="Ștampila firmei">'
        : '<div class="stamp-placeholder">ȘTAMPILA FIRMEI</div>';
    $icons = [];
    foreach (['document', 'calendar', 'user', 'id', 'warehouse', 'pin', 'invoice', 'operation', 'info', 'clipboard'] as $iconName) {
        $icons[$iconName] = shopNirPdfIconDataUri($iconName, in_array($iconName, ['document', 'calendar'], true) ? '#ff7900' : '#071b3e');
    }
    $headers = ['Nr.<br>crt.', 'Cod / SKU', 'Imagine', 'Denumirea bunurilor<br>recepționate', 'U.M.', 'Cantitate<br>document', 'Cantitate<br>recepționată', 'Diferență<br>cantitativă', 'Preț unitar<br>fără TVA', 'Valoare<br>fără TVA', 'TVA<br>%', 'Valoare<br>TVA', 'Valoare<br>totală'];
    $headerHtml = implode('', array_map(static fn(string $header): string => '<th>' . $header . '</th>', $headers));
    $css = '@page{size:A4 landscape;margin:5mm}*{box-sizing:border-box}body{margin:0;font-family:"DejaVu Sans",sans-serif;color:#071b3e;background:#fff;font-size:6.8pt}.page{height:198mm;position:relative;page-break-after:always;padding:1mm 1mm 0}.page:last-child{page-break-after:auto}.header{width:100%;border-collapse:collapse;height:23mm}.header td{vertical-align:top}.brand{width:30%}.brand-wrap{display:table}.brand-wrap>*{display:table-cell;vertical-align:middle}.strict-logo{width:15mm;height:15mm;object-fit:contain;margin-right:4mm}.brand-name{font-size:16pt;font-weight:900;line-height:1}.company-name{font-size:7pt;font-weight:700;margin-top:2mm}.company-id{font-size:6.4pt;margin-top:3mm}.doc-title{width:50%;text-align:center;font-size:15pt;font-weight:900;line-height:1.05;padding-top:1mm}.doc-title em{display:block;color:#ff7900;font-style:normal;font-size:13pt;margin-top:1.5mm}.form-code{width:20%;text-align:center;background:#f4f6f9;border-radius:3mm;padding:4mm 2mm;font-size:7pt}.form-code b{display:block;font-size:8pt;margin-top:1mm}.meta{height:17mm;border:1px solid #d8e1ec;border-radius:2mm;margin:1mm 0 3mm;overflow:hidden}.meta-dark{width:47%;height:100%;background:#002654;color:#fff;border-radius:2mm 16mm 16mm 2mm;display:table}.meta-item{display:table-cell;width:50%;padding:3mm 5mm;vertical-align:middle;border-right:1px solid rgba(255,255,255,.2)}.meta-item:last-child{border:0}.meta-item span{display:block;font-size:6.4pt}.meta-item b{display:block;font-size:12pt;margin-top:1mm}.info{width:100%;border-collapse:separate;border-spacing:2mm 0;margin:0 -2mm 3mm}.info-card{width:50%;border:1px solid #d8e1ec;border-radius:2mm;padding:2mm 4mm}.info-row{width:100%;border-collapse:collapse}.info-row td{height:7.4mm;border-bottom:1px solid #d9e2ed}.info-row:last-child td{border:0}.info-label{font-weight:800;width:40%}.items{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #dce3ec}.items thead{display:table-header-group}.items th{background:#002654;color:#fff;border-right:1px solid #6f86a3;padding:2mm .7mm;font-size:5.5pt;line-height:1.15;height:12mm}.items td{height:15mm;border-right:1px solid #d9e2ed;border-bottom:1px solid #d9e2ed;padding:1.2mm;vertical-align:middle}.items tr{page-break-inside:avoid}.items .c{text-align:center}.items .n{text-align:right;white-space:nowrap}.row-number{font-size:9pt;color:#ff7900;font-weight:900}.product-image{width:13mm;height:11mm;object-fit:contain}.image-placeholder{display:inline-block;width:12mm;height:10mm;line-height:10mm;border-radius:2mm;background:#ff7900;font-weight:900}.product-name{line-height:1.3}.diff-negative{color:#f11}.totals td{height:9mm;background:#f3f6fa;font-size:8pt;font-weight:900;border-top:1px solid #d8e1ec}.totals .grand{background:#ff7900;color:#fff;font-size:10pt}.observations{height:16mm;margin-top:3mm;border:1px solid #f1d59b;background:#fffaf0;border-radius:2mm;padding:3mm 6mm}.observations b{display:block;margin-bottom:2mm}.stamp-box{height:21mm;margin-top:3mm;border:1px solid #d8e1ec;border-radius:2mm;text-align:center;padding:1mm}.company-stamp{max-width:48mm;max-height:19mm;object-fit:contain}.stamp-placeholder{display:inline-block;border:1px dashed #9aa8ba;color:#6b7a92;padding:5mm 12mm;font-weight:700}.continuation{position:absolute;right:2mm;bottom:1mm;color:#6b7a92}.storno-mark{color:#c93f4b}.empty{text-align:center;color:#6b7a92;padding:8mm!important}';
    $css .= '.header{height:18mm}.meta{height:13mm;margin-bottom:1.5mm}.meta-item{padding:2mm 4mm}.meta-item b{font-size:10pt}.info{margin-bottom:1.5mm}.info-card{padding:1mm 3mm}.info-row td{height:5.5mm}.items th{height:9mm;padding:1mm .5mm}.items td{height:10.5mm}.totals td{height:7mm}.observations{height:12mm;margin-top:1.5mm;padding:1.5mm 5mm 1.5mm 12mm;position:relative}.stamp-box{height:15mm;margin-top:1.5mm}.company-stamp{max-height:13mm}.diff-zero{color:#00a441;font-weight:800}.diff-positive{color:#ff7900;font-weight:800}.diff-negative{color:#ff1e1e;font-weight:800}.inline-icon{width:4.2mm;height:4.2mm;vertical-align:middle;margin-right:2mm}.meta-icon{width:7mm;height:7mm;vertical-align:middle;margin-right:3mm}.form-icon{width:8mm;height:8mm;display:block;margin:0 auto 1mm}.obs-icon{position:absolute;left:3mm;top:2mm;width:6mm;height:6mm}';
    $css .= '.meta{height:15mm}.meta-item{padding:2.5mm 4mm}.meta-icon{float:left}.meta-item span,.meta-item b{margin-left:10mm}.stamp-box{height:24mm;text-align:right;padding:1mm 9mm 1mm 1mm}.company-stamp{width:auto;max-width:72mm;height:auto;max-height:22mm}';
    $css .= '.page{height:auto;page-break-after:auto;position:static}.items{page-break-inside:auto}.items tbody{page-break-inside:auto}.items tfoot{display:table-row-group}.items tbody tr{page-break-inside:avoid}.document-header{page-break-after:avoid}.final-block{page-break-inside:avoid}.continuation{display:none}';
    $allLines = array_values(array_filter(is_array($document['lines'] ?? null) ? $document['lines'] : [], 'is_array'));
    $netTotal = array_sum(array_map(static fn(array $line): float => (float)($line['received_quantity'] ?? $line['accepted_quantity'] ?? 0) * (float)($line['unit_price'] ?? 0) * (1 - (float)($line['discount_percent'] ?? 0) / 100), $allLines));
    $vatTotal = array_sum(array_map(static fn(array $line): float => (float)($line['received_quantity'] ?? $line['accepted_quantity'] ?? 0) * (float)($line['unit_price'] ?? 0) * (1 - (float)($line['discount_percent'] ?? 0) / 100) * (float)($line['vat_rate'] ?? 0) / 100, $allLines));
    $currency = strtoupper(trim((string)($document['currency'] ?? 'RON'))) ?: 'RON';
    $currencyLabel = $currency === 'RON' ? 'lei' : $currency;
    $vatRates = [];
    foreach ($allLines as $line) {
        $rate = (float)($line['vat_rate'] ?? 0);
        $vatRates[sprintf('%.4F', $rate)] = $rate;
    }
    ksort($vatRates, SORT_NATURAL);
    $vatRateLabel = implode(' / ', array_map(static fn(float $rate): string => shopNirPdfDecimal($rate, 4) . '%', array_values($vatRates)));
    $responsiveMoneyClass = static function (string $formatted): string {
        $length = function_exists('mb_strlen') ? mb_strlen($formatted, 'UTF-8') : strlen($formatted);
        if ($length >= 16) return ' money-xs';
        if ($length >= 11) return ' money-sm';
        return '';
    };
    $netTotalLabel = shopNirPdfDecimal($netTotal, 2) . ' ' . $currencyLabel;
    $vatTotalLabel = shopNirPdfDecimal($vatTotal, 2) . ' ' . $currencyLabel;
    $grandTotalLabel = shopNirPdfDecimal($netTotal + $vatTotal, 2) . ' ' . $currencyLabel;
    $rows = shopNirPdfStrictRows($document, $allLines);
    $css .= '.totals td{padding-left:.5mm;padding-right:.5mm}.totals .money-sm{font-size:7.2pt;letter-spacing:-.12pt}.totals .money-xs{font-size:6.2pt;letter-spacing:-.2pt}';
    $content = '<section class="page ' . ($isStorno ? 'storno' : 'entry') . '"><div class="document-header"><table class="header"><tr><td class="brand"><div class="brand-wrap">' . $logoHtml . '<div><div class="brand-name">G-TROTS</div><div class="company-name">' . shopNirPdfEscape($companyName) . '</div><div class="company-id">' . shopNirPdfEscape(shopNirPdfJoin([trim((string)($company['cui'] ?? '')) !== '' ? 'CUI ' . $company['cui'] : '', trim((string)($company['registration_number'] ?? '')) !== '' ? 'Reg. Com. ' . $company['registration_number'] : ''], ' | ')) . '</div></div></div></td><td class="doc-title">NOTĂ DE RECEPȚIE ȘI<br>CONSTATARE DE DIFERENȚE<em>(NIR)</em></td><td class="form-code"><img class="form-icon" src="' . $icons['document'] . '" alt="">Cod formular:<b>NIR</b></td></tr></table>'
            . '<div class="meta"><div class="meta-dark"><div class="meta-item"><img class="meta-icon" src="' . $icons['document'] . '" alt=""><span>Nr. NIR</span><b>' . shopNirPdfEscape($number) . '</b></div><div class="meta-item"><img class="meta-icon" src="' . $icons['calendar'] . '" alt=""><span>din data de</span><b>' . shopNirPdfEscape($date) . '</b></div></div></div>'
            . '<table class="info"><tr><td class="info-card"><table class="info-row"><tr><td class="info-label"><img class="inline-icon" src="' . $icons['user'] . '" alt="">Furnizor:</td><td>' . shopNirPdfEscape($supplierName) . '</td></tr><tr><td class="info-label"><img class="inline-icon" src="' . $icons['id'] . '" alt="">CUI furnizor:</td><td>' . shopNirPdfEscape($supplierCui) . '</td></tr><tr><td class="info-label"><img class="inline-icon" src="' . $icons['warehouse'] . '" alt="">Gestiune:</td><td>' . shopNirPdfEscape($warehouseName) . '</td></tr><tr><td class="info-label"><img class="inline-icon" src="' . $icons['pin'] . '" alt="">Loc recepție:</td><td>' . shopNirPdfEscape($receiptLocation) . '</td></tr></table></td><td class="info-card"><table class="info-row"><tr><td class="info-label"><img class="inline-icon" src="' . $icons['invoice'] . '" alt="">Factura furnizor nr. / data:</td><td>' . shopNirPdfEscape(shopNirPdfStrictInvoice($document)) . '</td></tr><tr><td class="info-label"><img class="inline-icon" src="' . $icons['invoice'] . '" alt="">Factura inițială stornată nr. / data:</td><td>' . shopNirPdfEscape(shopNirPdfStrictInvoice($document, true)) . '</td></tr><tr><td class="info-label"><img class="inline-icon" src="' . $icons['operation'] . '" alt="">Tip operațiune:</td><td class="' . ($isStorno ? 'storno-mark' : '') . '">' . ($isStorno ? 'Stornare' : 'Recepție') . '</td></tr><tr><td class="info-label"><img class="inline-icon" src="' . $icons['info'] . '" alt="">Motiv stornare / retur / diferență:</td><td>' . shopNirPdfEscape($reason) . '</td></tr></table></td></tr></table>'
            . '</div><table class="items"><colgroup><col style="width:4%"><col style="width:9%"><col style="width:8%"><col style="width:15%"><col style="width:5%"><col style="width:8%"><col style="width:8%"><col style="width:7%"><col style="width:8%"><col style="width:7%"><col style="width:6%"><col style="width:7%"><col style="width:8%"></colgroup><thead><tr>' . $headerHtml . '</tr></thead><tbody>' . $rows . '</tbody><tfoot><tr class="totals"><td colspan="9" class="n">TOTAL</td><td class="n' . $responsiveMoneyClass($netTotalLabel) . '">' . shopNirPdfEscape($netTotalLabel) . '</td><td class="c">' . shopNirPdfEscape($vatRateLabel) . '</td><td class="n' . $responsiveMoneyClass($vatTotalLabel) . '">' . shopNirPdfEscape($vatTotalLabel) . '</td><td class="n grand' . $responsiveMoneyClass($grandTotalLabel) . '">' . shopNirPdfEscape($grandTotalLabel) . '</td></tr></tfoot></table>'
            . '<div class="final-block"><div class="observations"><img class="obs-icon" src="' . $icons['clipboard'] . '" alt=""><b>Constatări privind recepția / diferențe calitative sau cantitative:</b>' . nl2br(shopNirPdfEscape($observations), false) . '</div><div class="stamp-box">' . $stampHtml . '</div></div></section>';
    return '<!doctype html><html lang="ro"><head><meta charset="UTF-8"><style>' . $css . '</style></head><body>' . $content . '</body></html>';
}

function shopNirRenderStrictPdf(array $document): string {
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
    $dompdf->loadHtml(shopNirStrictPdfHtml($document), 'UTF-8');
    $dompdf->render();
    $font = $dompdf->getFontMetrics()->getFont('DejaVu Sans', 'normal');
    $dompdf->getCanvas()->page_text(748, 575, 'Pagina {PAGE_NUM} / {PAGE_COUNT}', $font, 7, [0.42, 0.48, 0.58]);
    return $dompdf->output();
}

/** Render a complete premium NIR PDF and return its raw bytes. */
function shopNirRenderPremiumPdf(array $document): string {
    return shopNirRenderStrictPdf($document);
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
        ? '<th>Nr.</th><th>Foto</th><th>Produs furnizor / cod</th><th>Produs intern / SKU</th><th>U.M. / conversie</th><th>Cant. factură</th><th>Cant. corectată</th><th>Cant. stornată</th><th>Preț net</th><th>TVA</th><th>Cost unitar stornat RON</th><th>Valoare stornată RON</th><th>Trasabilitate / observații</th>'
        : '<th>Nr.</th><th>Foto</th><th>Produs furnizor / cod</th><th>Produs intern / SKU</th><th>U.M. / conversie</th><th>Facturat</th><th>Primit</th><th>Acceptat</th><th>Preț net</th><th>TVA</th><th>Cost unitar intrare RON</th><th>Valoare intrare RON</th><th>Diferență / observații</th>';
    $css = str_replace(['__ACCENT__', '__SOFT__'], [$isStorno ? '#c93f4b' : '#168a57', $isStorno ? '#fcecef' : '#eaf8f1'], shopNirPdfCss($mode));
    $html = '<!doctype html><html lang="ro"><head><meta charset="UTF-8"><style>' . $css . '</style></head><body>' . $watermark
        . shopNirPdfHeaderHtml($document, $company, $status, $mode, $logo)
        . $relationshipBanner
        . shopNirPdfCardsHtml($document, $context)
        . shopNirPdfMetricsHtml($document, $summary, $mode)
        . '<section class="product-section"><h2>' . $productSectionTitle . '</h2><table class="product-table">'
        . '<colgroup><col style="width:3%"><col style="width:7%"><col style="width:14%"><col style="width:14%"><col style="width:6%"><col style="width:5.5%"><col style="width:5.5%"><col style="width:5.5%"><col style="width:7%"><col style="width:4.5%"><col style="width:8%"><col style="width:8%"><col style="width:12%"></colgroup>'
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
