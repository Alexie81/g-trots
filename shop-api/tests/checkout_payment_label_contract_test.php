<?php
declare(strict_types=1);

function checkoutPaymentLabelAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$checkoutHtml = (string)file_get_contents($root . '/website/checkout.html');
$checkoutScript = (string)file_get_contents($root . '/website/checkout.js');
$liveCheckout = (string)file_get_contents($root . '/website/shop-live.js');
$terms = (string)file_get_contents($root . '/website/termeni-si-conditii.html');
$combined = $checkoutHtml . $checkoutScript . $liveCheckout . $terms;

checkoutPaymentLabelAssert(!str_contains($combined, 'Plasează comanda cu obligație de plată'), 'Formularea veche nu trebuie sa mai apara in checkout sau in termenii publici.');
checkoutPaymentLabelAssert(substr_count($combined, 'Comandă cu plata la livrare') >= 4, 'Checkout-ul ramburs trebuie sa foloseasca formularea scurta si neambigua in toate variantele.');
checkoutPaymentLabelAssert(str_contains($checkoutScript, '"Comandă și plătește"') && str_contains($liveCheckout, "'Comandă și plătește'"), 'Plata cu cardul trebuie sa ramana etichetata neambiguu.');
checkoutPaymentLabelAssert(str_contains($checkoutHtml, 'checkout.js?v=20260913-payment-label-v1'), 'Checkout-ul trebuie sa forteze incarcarea noii versiuni JavaScript.');

echo "checkout_payment_label_contract_test: OK\n";
