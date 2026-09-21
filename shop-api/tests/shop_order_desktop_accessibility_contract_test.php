<?php
declare(strict_types=1);

function shopOrderDesktopAssert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "shop_order_desktop_accessibility_contract_test: {$message}\n");
        exit(1);
    }
}

$root = dirname(__DIR__, 2);
$commerce = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$styles = (string)file_get_contents($root . '/electron-app/renderer/style.css');

foreach (['CANTITATE', 'COD PRODUS', 'PREȚ UNITAR', 'shop-order-product-meta', 'shop-order-line-total'] as $required) {
    shopOrderDesktopAssert(str_contains($commerce, $required), "Rândul produsului nu afișează separat {$required}.");
}

shopOrderDesktopAssert(str_contains($commerce, 'value="${esc(value || \'\')}" readonly'), 'Datele de livrare blocate nu sunt selectabile pentru copiere.');
shopOrderDesktopAssert(str_contains($commerce, 'input.readOnly = !deliveryEditing'), 'Editarea adresei nu comută sigur între readonly și editabil.');
shopOrderDesktopAssert(str_contains($commerce, "item.unit_of_measure || 'buc'"), 'Cantitatea nu afișează unitatea de măsură.');
shopOrderDesktopAssert(str_contains($commerce, "const sendEmailToggle = \$('shop-invoice-issue-send-email');"), 'Panoul de emitere a facturii nu citește comutatorul de e-mail în domeniul corect.');
shopOrderDesktopAssert(!str_contains($commerce, ": toggle?.checked ? 'Emite și trimite'"), 'Panoul de emitere folosește încă variabila toggle în afara domeniului ei.');
shopOrderDesktopAssert(substr_count($commerce, 'openInvoiceIssue(') >= 3, 'Ambele butoane de emitere nu sunt conectate la panoul facturii.');
shopOrderDesktopAssert(str_contains($styles, '#shop-order-details * { -webkit-user-select:text!important; user-select:text!important; }'), 'Toate valorile comenzii nu sunt selectabile pe desktop.');
shopOrderDesktopAssert(str_contains($styles, '#shop-order-details input[readonly] { cursor:text; }'), 'Câmpurile readonly nu indică selecția textului.');
shopOrderDesktopAssert(str_contains($styles, '#shop-order-modal .shop-commerce-modal > header > div,'), 'Numărul comenzii din antet nu este selectabil pentru copiere.');
shopOrderDesktopAssert(str_contains($styles, '#shop-product-detail-modal.over-order { place-items: center;'), 'Fișa produsului din comandă nu este centrată.');
shopOrderDesktopAssert(!str_contains($styles, '#shop-product-detail-modal.over-order { place-items: center end;'), 'Fișa produsului este încă ancorată în dreapta.');

echo "shop_order_desktop_accessibility_contract_test: OK\n";
