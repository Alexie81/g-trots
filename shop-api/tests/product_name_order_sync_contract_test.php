<?php
declare(strict_types=1);

function productNameOrderSyncAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$api = file_get_contents(dirname(__DIR__) . '/api.php');
productNameOrderSyncAssert(is_string($api), 'API-ul nu poate fi citit.');

productNameOrderSyncAssert(str_contains($api, 'function shopAdminSyncRenamedProductInEditableOrders'), 'Sincronizarea denumirii în comenzile editabile lipsește.');
productNameOrderSyncAssert(str_contains($api, 'UPDATE shop_order_items SET product_name = ? WHERE order_id = ? AND product_id = ?'), 'Sincronizarea trebuie să modifice exclusiv denumirea poziției din comandă.');
productNameOrderSyncAssert(!str_contains($api, 'UPDATE shop_order_items SET product_name = ?, unit_price'), 'Sincronizarea denumirii nu trebuie să modifice prețul.');
productNameOrderSyncAssert(str_contains($api, "['sent', 'processing']"), 'Facturile trimise sau în procesare SPV trebuie blocate.');
productNameOrderSyncAssert(str_contains($api, "['return', 'correction_return']"), 'Documentele de retur trebuie păstrate ca instantanee istorice.');
productNameOrderSyncAssert(str_contains($api, 'GtrotsInvoiceService::refreshUnsentPayloadForOrder'), 'Factura netrimisă nu este regenerată după redenumire.');
productNameOrderSyncAssert(str_contains($api, 'GtrotsShippingNoteService::reviseForOrder'), 'Avizul existent nu este regenerat după redenumire.');
productNameOrderSyncAssert(str_contains($api, 'GtrotsInvoiceService::refreshStoredForOrder'), 'Fișierele PDF/XLSX/XML ale facturii nu sunt regenerate.');
productNameOrderSyncAssert(str_contains($api, 'GtrotsShippingNoteService::refreshStoredForOrder'), 'PDF-ul avizului nu este regenerat.');
productNameOrderSyncAssert(str_contains($api, "\$productResponse['order_name_sync']"), 'Răspunsul produsului nu raportează sincronizarea documentelor.');

echo "Product name order sync contract tests passed.\n";
