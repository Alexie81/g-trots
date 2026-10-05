<?php
declare(strict_types=1);

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "order_customer_edit_contract_test: {$message}\n");
        exit(1);
    }
};

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$mobile = (string)file_get_contents($root . '/components/ShopOrdersManager.tsx');
$mobileApi = (string)file_get_contents($root . '/services/shopApi.ts');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');

foreach (['customer_name', 'customer_phone', 'customer_email'] as $field) {
    $assert(str_contains($api, "array_key_exists('{$field}', \$body)"), "API-ul nu acceptă {$field} din editorul comenzii.");
    $assert(str_contains($mobileApi, "{$field}?: string"), "Tipul mobil nu permite trimiterea {$field}.");
    $assert(str_contains($mobile, "{$field}: canEditCustomer"), "Aplicația mobilă nu trimite controlat {$field}.");
    $assert(str_contains($desktop, "{$field}: customerEditAllowed"), "Aplicația desktop nu trimite controlat {$field}.");
}

$assert(str_contains($api, "\$assignedSpvStatus === 'sent'"), 'API-ul nu blochează modificarea după trimiterea facturii în SPV.');
$assert(str_contains($api, "\$assignedSpvStatus === 'processing'"), 'API-ul nu protejează factura aflată în transmitere la ANAF.');
$assert(str_contains($api, 'GtrotsInvoiceService::refreshUnsentPayloadForOrder($db, $id)'), 'Factura netrimisă nu este regenerată după modificare.');
$assert(str_contains($api, 'GtrotsShippingNoteService::reviseForOrder($db, $id)'), 'Avizul existent nu este resincronizat după modificare.');
$assert(str_contains($api, 'GtrotsShippingNoteService::refreshStoredForOrder($db, $id, $config)'), 'PDF-ul avizului nu este regenerat pe server.');
$assert(str_contains($mobile, "toLocaleUpperCase('ro-RO')") && str_contains($desktop, "toLocaleUpperCase('ro-RO')"), 'Numele clientului nu este afișat și salvat cu majuscule în ambele aplicații.');
$assert(str_contains($mobile, "['sent', 'processing'].includes") && str_contains($desktop, "['sent', 'processing'].includes"), 'Interfețele nu blochează editorul pentru facturile protejate SPV.');

echo "order_customer_edit_contract_test: OK\n";
