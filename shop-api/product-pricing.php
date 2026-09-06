<?php
declare(strict_types=1);

/**
 * Pretul public G-Trots are prioritate cand este pozitiv. Valoarea 0 inseamna
 * „nesetat” si permite folosirea ultimului pret valid al furnizorului.
 */
function productPublicBasePrice(array $product): float {
    $gTrotsPrice = round((float)($product['price'] ?? 0), 2);
    if ($gTrotsPrice > 0) return $gTrotsPrice;
    $supplierPrice = round((float)($product['supplier_base_price'] ?? 0), 2);
    return $supplierPrice > 0 ? $supplierPrice : 0.0;
}
/**
 * Produsele contabile isi primesc costul exclusiv din NIR/FIFO. Pentru un
 * produs online-only salvam in comanda pretul furnizorului din acel moment;
 * daca nu exista, ramane costul manual curent.
 */
function productOrderAcquisitionUnitCost(array $product): ?float {
    $isAccountingStockTracked = !array_key_exists('is_accounting_stock_tracked', $product)
        || (bool)$product['is_accounting_stock_tracked'];
    if ($isAccountingStockTracked) return null;

    $supplierPrice = round((float)($product['supplier_base_price'] ?? 0), 2);
    if ($supplierPrice > 0) return $supplierPrice;
    return max(0.0, round((float)($product['cost_price'] ?? 0), 2));
}
