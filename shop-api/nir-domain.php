<?php
declare(strict_types=1);

/**
 * Pure domain helpers shared by the NIR HTTP endpoints and the automated tests.
 * Monetary values are represented as decimal strings; calculations use scaled
 * integers so PHP binary floats never become the accounting source of truth.
 */

function shopNirNormalizeSupplierCode($value): string {
    $code = trim((string)$value);
    if ($code === '') return '';
    if (class_exists('Normalizer')) {
        $normalized = Normalizer::normalize($code, Normalizer::FORM_KC);
        if (is_string($normalized)) $code = $normalized;
    }
    $code = preg_replace('/\s+/u', ' ', $code) ?? $code;
    return mb_strtoupper(trim($code), 'UTF-8');
}

/**
 * Canonical form used only for supplier-specific product names. It deliberately
 * does not involve the internal SKU: a supplier alias belongs to the pair
 * supplier + internal product, regardless of how the catalog SKU was chosen.
 */
function shopNirNormalizeSupplierProductName($value): string {
    $text = trim((string)$value);
    if ($text === '') return '';
    if (function_exists('iconv')) {
        $converted = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if ($converted !== false) $text = $converted;
    }
    $text = mb_strtolower($text, 'UTF-8');
    $text = preg_replace('/[^a-z0-9]+/u', ' ', $text) ?? '';
    return trim(preg_replace('/\s+/u', ' ', $text) ?? '');
}

function shopNirSupplierProductNameKey($value): string {
    $normalized = shopNirNormalizeSupplierProductName($value);
    return $normalized === '' ? '' : '__NAME__' . strtoupper(substr(hash('sha256', $normalized), 0, 40));
}

function shopNirDecimalToScaled($value, int $scale, string $field = 'Valoarea'): int {
    $raw = trim((string)$value);
    if ($raw === '') $raw = '0';
    $raw = str_replace(["\u{00A0}", ' '], '', $raw);
    if (str_contains($raw, ',') && str_contains($raw, '.')) {
        $lastComma = strrpos($raw, ',');
        $lastDot = strrpos($raw, '.');
        if ($lastComma > $lastDot) {
            $raw = str_replace('.', '', $raw);
            $raw = str_replace(',', '.', $raw);
        } else {
            $raw = str_replace(',', '', $raw);
        }
    } else {
        $raw = str_replace(',', '.', $raw);
    }
    if (!preg_match('/^([+-]?)(\d+)(?:\.(\d+))?$/', $raw, $match)) {
        throw new InvalidArgumentException($field . ' nu este un număr zecimal valid.');
    }
    $negative = ($match[1] ?? '') === '-';
    $whole = ltrim($match[2], '0');
    if ($whole === '') $whole = '0';
    $fraction = (string)($match[3] ?? '');
    $kept = substr(str_pad($fraction, $scale, '0'), 0, $scale);
    $base = ((int)$whole * (10 ** $scale)) + (int)($kept === '' ? '0' : $kept);
    if (strlen($fraction) > $scale && (int)$fraction[$scale] >= 5) $base++;
    return $negative ? -$base : $base;
}

function shopNirScaledToDecimal(int $value, int $scale): string {
    $negative = $value < 0;
    $absolute = abs($value);
    if ($scale === 0) return ($negative ? '-' : '') . (string)$absolute;
    $factor = 10 ** $scale;
    $whole = intdiv($absolute, $factor);
    $fraction = str_pad((string)($absolute % $factor), $scale, '0', STR_PAD_LEFT);
    return ($negative ? '-' : '') . $whole . '.' . $fraction;
}

function shopNirDivideRounded(int $numerator, int $denominator): int {
    if ($denominator === 0) throw new InvalidArgumentException('Împărțirea la zero nu este permisă.');
    $negative = ($numerator < 0) xor ($denominator < 0);
    $numerator = abs($numerator);
    $denominator = abs($denominator);
    $result = intdiv($numerator, $denominator);
    if (($numerator % $denominator) * 2 >= $denominator) $result++;
    return $negative ? -$result : $result;
}

function shopNirMultiplyScaled(int $left, int $leftScale, int $right, int $rightScale, int $resultScale): int {
    $shift = $leftScale + $rightScale - $resultScale;
    $product = $left * $right;
    if ($shift <= 0) return $product * (10 ** abs($shift));
    return shopNirDivideRounded($product, 10 ** $shift);
}

function shopNirCalculateLine(array $line, bool $includeVatInInventoryCost = false): array {
    $acceptedQuantity = shopNirDecimalToScaled($line['accepted_quantity'] ?? $line['quantity'] ?? 0, 4, 'Cantitatea acceptată');
    $conversionFactor = shopNirDecimalToScaled($line['conversion_factor'] ?? 1, 6, 'Factorul de conversie');
    $unitPrice = shopNirDecimalToScaled($line['unit_price'] ?? 0, 6, 'Prețul unitar');
    $discountPercent = shopNirDecimalToScaled($line['discount_percent'] ?? 0, 4, 'Discountul');
    $vatRate = shopNirDecimalToScaled($line['vat_rate'] ?? 0, 4, 'Cota TVA');
    $exchangeRate = shopNirDecimalToScaled($line['exchange_rate'] ?? 1, 8, 'Cursul valutar');
    $allocatedCostRon = shopNirDecimalToScaled($line['allocated_cost_ron'] ?? 0, 2, 'Costul alocat');

    if ($acceptedQuantity < 0) throw new InvalidArgumentException('Cantitatea acceptată nu poate fi negativă.');
    if ($conversionFactor <= 0) throw new InvalidArgumentException('Factorul de conversie trebuie să fie mai mare decât zero.');
    if ($unitPrice < 0) throw new InvalidArgumentException('Prețul unitar nu poate fi negativ.');
    if ($discountPercent < 0 || $discountPercent > 1000000) throw new InvalidArgumentException('Discountul trebuie să fie între 0 și 100%.');
    if ($vatRate < 0 || $vatRate > 1000000) throw new InvalidArgumentException('Cota TVA trebuie să fie între 0 și 100%.');
    if ($exchangeRate <= 0) throw new InvalidArgumentException('Cursul valutar trebuie să fie mai mare decât zero.');

    $stockQuantity = shopNirMultiplyScaled($acceptedQuantity, 4, $conversionFactor, 6, 4);
    $gross = shopNirMultiplyScaled($acceptedQuantity, 4, $unitPrice, 6, 6);
    $discount = shopNirDivideRounded(shopNirMultiplyScaled($gross, 6, $discountPercent, 4, 6), 100);
    $net = $gross - $discount;
    $vat = shopNirDivideRounded(shopNirMultiplyScaled($net, 6, $vatRate, 4, 6), 100);
    $total = $net + $vat;
    $netRon = shopNirMultiplyScaled($net, 6, $exchangeRate, 8, 2);
    $vatRon = shopNirMultiplyScaled($vat, 6, $exchangeRate, 8, 2);
    $totalRon = $netRon + $vatRon;
    $inventoryTotalRon = ($includeVatInInventoryCost ? $totalRon : $netRon) + $allocatedCostRon;
    $inventoryUnitCost = $stockQuantity > 0
        ? shopNirDivideRounded($inventoryTotalRon * (10 ** 8), $stockQuantity)
        : 0;

    return [
        'accepted_quantity' => shopNirScaledToDecimal($acceptedQuantity, 4),
        'conversion_factor' => shopNirScaledToDecimal($conversionFactor, 6),
        'stock_quantity' => shopNirScaledToDecimal($stockQuantity, 4),
        'unit_price' => shopNirScaledToDecimal($unitPrice, 6),
        'discount_percent' => shopNirScaledToDecimal($discountPercent, 4),
        'vat_rate' => shopNirScaledToDecimal($vatRate, 4),
        'exchange_rate' => shopNirScaledToDecimal($exchangeRate, 8),
        'line_gross' => shopNirScaledToDecimal($gross, 6),
        'line_discount' => shopNirScaledToDecimal($discount, 6),
        'line_net' => shopNirScaledToDecimal($net, 6),
        'line_vat' => shopNirScaledToDecimal($vat, 6),
        'line_total' => shopNirScaledToDecimal($total, 6),
        'line_net_ron' => shopNirScaledToDecimal($netRon, 2),
        'line_vat_ron' => shopNirScaledToDecimal($vatRon, 2),
        'line_total_ron' => shopNirScaledToDecimal($totalRon, 2),
        'inventory_cost_total_ron' => shopNirScaledToDecimal($inventoryTotalRon, 2),
        'inventory_unit_cost_ron' => shopNirScaledToDecimal($inventoryUnitCost, 6),
    ];
}

function shopNirFifoPreview(array $layers, $requestedQuantity): array {
    $requested = shopNirDecimalToScaled($requestedQuantity, 4, 'Cantitatea solicitată');
    if ($requested <= 0) throw new InvalidArgumentException('Cantitatea solicitată trebuie să fie mai mare decât zero.');
    usort($layers, static function (array $a, array $b): int {
        $dateComparison = strcmp((string)($a['reception_date'] ?? $a['created_at'] ?? ''), (string)($b['reception_date'] ?? $b['created_at'] ?? ''));
        if ($dateComparison !== 0) return $dateComparison;
        $createdComparison = strcmp((string)($a['created_at'] ?? ''), (string)($b['created_at'] ?? ''));
        return $createdComparison !== 0 ? $createdComparison : strcmp((string)($a['id'] ?? ''), (string)($b['id'] ?? ''));
    });

    $remainingRequest = $requested;
    $allocations = [];
    $totalCost = 0;
    foreach ($layers as $layer) {
        if ($remainingRequest <= 0) break;
        $available = shopNirDecimalToScaled($layer['remaining_quantity'] ?? 0, 4, 'Cantitatea lotului');
        if ($available <= 0) continue;
        $take = min($available, $remainingRequest);
        $unitCost = shopNirDecimalToScaled($layer['unit_cost_ron'] ?? 0, 6, 'Costul lotului');
        $cost = shopNirMultiplyScaled($take, 4, $unitCost, 6, 2);
        $allocations[] = [
            'layer_id' => (string)($layer['id'] ?? ''),
            'nir_number' => $layer['nir_number'] ?? null,
            'reception_date' => $layer['reception_date'] ?? null,
            'quantity' => shopNirScaledToDecimal($take, 4),
            'unit_cost_ron' => shopNirScaledToDecimal($unitCost, 6),
            'cost_ron' => shopNirScaledToDecimal($cost, 2),
        ];
        $totalCost += $cost;
        $remainingRequest -= $take;
    }

    return [
        'requested_quantity' => shopNirScaledToDecimal($requested, 4),
        'allocated_quantity' => shopNirScaledToDecimal($requested - $remainingRequest, 4),
        'shortage_quantity' => shopNirScaledToDecimal($remainingRequest, 4),
        'available' => $remainingRequest === 0,
        'total_cost_ron' => shopNirScaledToDecimal($totalCost, 2),
        'allocations' => $allocations,
    ];
}
