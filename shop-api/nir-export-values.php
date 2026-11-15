<?php
declare(strict_types=1);

require_once __DIR__ . '/nir-domain.php';

/** Read-only presentation values. Exporting must never recalculate saved NIR amounts. */
function shopNirExportStoredAmount(array $source, array $fields, int $fallback): int {
    foreach ($fields as $field) {
        if (isset($source[$field]) && trim((string)$source[$field]) !== '') {
            return shopNirDecimalToScaled($source[$field], 2);
        }
    }
    return $fallback;
}

function shopNirExportLineAmounts(array $line, string $currency = 'RON'): array {
    $unitPrice = shopNirDecimalToScaled($line['unit_price'] ?? 0, 6);
    $discount = shopNirDecimalToScaled($line['discount_percent'] ?? 0, 4);
    $price = shopNirDivideRounded($unitPrice * (1000000 - $discount), 1000000);

    // Compatibility with preview/legacy payloads without saved monetary fields.
    // Accepted quantities are valued; received quantities may include rejected goods.
    $quantity = shopNirDecimalToScaled($line['accepted_quantity'] ?? $line['received_quantity'] ?? $line['invoiced_quantity'] ?? 0, 4);
    $fallbackNet = shopNirMultiplyScaled($quantity, 4, $price, 6, 6);
    $fallbackVat = shopNirDivideRounded(shopNirMultiplyScaled($fallbackNet, 6, shopNirDecimalToScaled($line['vat_rate'] ?? 0, 4), 4, 6), 100);
    $fields = static function (string $field) use ($currency): array {
        return strtoupper(trim($currency)) === 'RON' ? [$field . '_ron', $field] : [$field];
    };
    $net = shopNirExportStoredAmount($line, $fields('line_net'), shopNirDivideRounded($fallbackNet, 10000));
    $vat = shopNirExportStoredAmount($line, $fields('line_vat'), shopNirDivideRounded($fallbackVat, 10000));
    $total = shopNirExportStoredAmount($line, $fields('line_total'), $net + $vat);

    return [
        'unit_price' => shopNirScaledToDecimal($price, 6),
        'net' => shopNirScaledToDecimal($net, 2),
        'vat' => shopNirScaledToDecimal($vat, 2),
        'total' => shopNirScaledToDecimal($total, 2),
    ];
}

function shopNirExportDocumentAmounts(array $document): array {
    $currency = strtoupper(trim((string)($document['currency'] ?? 'RON')));
    $sums = ['net' => 0, 'vat' => 0, 'total' => 0];
    foreach (($document['lines'] ?? []) as $line) {
        if (!is_array($line)) continue;
        $amounts = shopNirExportLineAmounts($line, $currency);
        foreach ($sums as $field => $_) $sums[$field] += shopNirDecimalToScaled($amounts[$field], 2);
    }
    $result = [];
    foreach (['net' => 'subtotal', 'vat' => 'vat_total', 'total' => 'grand_total'] as $key => $field) {
        $fields = $currency === 'RON' ? [$field . '_ron', $field] : [$field];
        $result[$key] = shopNirScaledToDecimal(shopNirExportStoredAmount($document, $fields, $sums[$key]), 2);
    }
    return $result;
}
