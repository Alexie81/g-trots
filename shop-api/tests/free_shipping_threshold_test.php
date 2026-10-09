<?php
declare(strict_types=1);

require_once __DIR__ . '/../product-page-service.php';

$root = dirname(__DIR__, 2);
$api = file_get_contents($root . '/shop-api/api.php');
$checkout = file_get_contents($root . '/website/checkout.js');
$shopLive = file_get_contents($root . '/website/shop-live.js');
$promotions = file_get_contents($root . '/website/promotions.js');
$seoGenerator = file_get_contents($root . '/scripts/generate-product-seo-pages.mjs');

$check = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "free_shipping_threshold_test: {$message}\n");
        exit(1);
    }
};

$check(shopFreeShippingMinimum(300) === 301.0, 'pragul 300 nu începe la 301 lei');
$check(!shopFreeShippingEligible(300.00, 300), '300,00 lei nu trebuie să fie gratuit');
$check(!shopFreeShippingEligible(300.01, 300), '300,01 lei nu trebuie să fie gratuit');
$check(!shopFreeShippingEligible(300.99, 300), '300,99 lei nu trebuie să fie gratuit');
$check(shopFreeShippingEligible(301.00, 300), '301,00 lei trebuie să fie gratuit');
$check(str_contains($api, "shopFreeShippingEligible(\$subtotal, \$shipping['free_above'])"), 'API-ul nu folosește regula strictă');
$check(str_contains($checkout, 'Math.floor(threshold) + 1'), 'checkout-ul nu folosește următorul leu întreg');
$check(str_contains($shopLive, 'Math.floor(threshold) + 1'), 'coșul live nu folosește următorul leu întreg');
$check(str_contains($promotions, 'Math.floor(Number(item.free_above)) + 1'), 'bara nu afișează minimul real');
$check(str_contains($seoGenerator, 'Math.floor(freeAbove) + 1'), 'generatorul SEO nu folosește pragul real');

echo "free_shipping_threshold_test: OK\n";
