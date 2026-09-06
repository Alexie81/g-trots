<?php
declare(strict_types=1);

require_once __DIR__ . '/../order-emails.php';

function partialReturnEmailAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$html = gtEmailReturnDecisionSummary([
    'return_items' => [[
        'product_name' => 'Cască FRV Street Panther',
        'product_sku' => 'WT-SP-1386',
        'requested_quantity' => 2,
        'decision_status' => 'partial',
        'accepted_quantity' => 1,
        'refused_quantity' => 1,
        'decision_reason' => 'O bucată nu mai este în starea de la vânzare.',
    ]],
]);

partialReturnEmailAssert(str_contains($html, 'APROBAT PARȚIAL'), 'E-mailul trebuie să marcheze decizia mixtă.');
partialReturnEmailAssert(str_contains($html, 'Acceptată <strong>1</strong>'), 'E-mailul trebuie să arate cantitatea acceptată.');
partialReturnEmailAssert(str_contains($html, 'Refuzată <strong>1</strong>'), 'E-mailul trebuie să arate cantitatea refuzată.');
partialReturnEmailAssert(str_contains($html, 'nu mai este în starea de la vânzare'), 'E-mailul trebuie să includă motivul refuzului.');

echo "partial_return_email_test: OK\n";
