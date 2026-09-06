<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/product-pricing.php';
require_once dirname(__DIR__) . '/gomag.php';

function pricingAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$fallback = boomagResolvePublicPricing(100.0, 0.0, null);
pricingAssert($fallback['price'] === 100.0 && $fallback['difference'] === 0.0, 'Pretul furnizorului trebuie sa devina public cand pretul G-Trots este 0.');

$initialMargin = boomagResolvePublicPricing(100.0, 149.0, null);
pricingAssert($initialMargin['price'] === 149.0 && $initialMargin['difference'] === 49.0, 'Prima sincronizare trebuie sa memoreze marja fixa existenta.');

$stableMargin = boomagResolvePublicPricing(120.0, 149.0, 49.0);
pricingAssert($stableMargin['price'] === 169.0 && $stableMargin['difference'] === 49.0, 'Schimbarea furnizorului trebuie sa pastreze marja fixa.');

$missingSupplier = boomagResolvePublicPricing(null, 149.0, 49.0);
pricingAssert($missingSupplier['price'] === 149.0 && $missingSupplier['difference'] === 49.0, 'Un furnizor fara pret valid nu trebuie sa suprascrie pretul G-Trots.');
pricingAssert(productPublicBasePrice(['price' => 0, 'supplier_base_price' => 100]) === 100.0, 'Pretul public trebuie sa cada pe furnizor cand G-Trots este 0.');
pricingAssert(productPublicBasePrice(['price' => 149, 'supplier_base_price' => 100]) === 149.0, 'Pretul G-Trots valid trebuie sa aiba prioritate.');

pricingAssert(productOrderAcquisitionUnitCost([
    'is_accounting_stock_tracked' => false,
    'supplier_base_price' => 100,
    'cost_price' => 70,
]) === 100.0, 'Produsul online-only trebuie sa fixeze pretul furnizorului la momentul comenzii.');
pricingAssert(productOrderAcquisitionUnitCost([
    'is_accounting_stock_tracked' => false,
    'supplier_base_price' => 0,
    'cost_price' => 70,
]) === 70.0, 'Pretul furnizorului 0 nu trebuie sa stearga un cost manual valid.');
pricingAssert(productOrderAcquisitionUnitCost([
    'is_accounting_stock_tracked' => true,
    'supplier_base_price' => 100,
    'cost_price' => 70,
]) === null, 'Produsele contabile trebuie sa ramana exclusiv pe costul documentat NIR/FIFO.');

pricingAssert(boomagResolveAcquisitionPrice(120.0, 80.0, false) === 120.0, 'Costul curent online-only trebuie actualizat din furnizor.');
pricingAssert(boomagResolveAcquisitionPrice(120.0, 80.0, true) === 80.0, 'Sincronizarea furnizorului nu trebuie sa suprascrie un cost contabil.');

echo "product_pricing_test: OK\n";
