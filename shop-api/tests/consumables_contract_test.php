<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$html = (string)file_get_contents($root . '/electron-app/renderer/index.html');
$commerce = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$ui = (string)file_get_contents($root . '/electron-app/renderer/js/shop-consumables.js');
$css = (string)file_get_contents($root . '/electron-app/renderer/consumables.css');
$api = (string)file_get_contents($root . '/shop-api/api.php');
$client = (string)file_get_contents($root . '/electron-app/renderer/js/shop-api.js');
$service = (string)file_get_contents($root . '/shop-api/consumables-service.php');
$export = (string)file_get_contents($root . '/shop-api/consumables-export.php');

$check = static function (bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); };
$check(str_contains($html, 'data-tab="shop-consumables"') && str_contains($html, '>Consumabile<'), 'Tabul Consumabile lipsește din navigare.');
$check(str_contains($html, 'consumables.css') && str_contains($html, 'shop-consumables.js'), 'Resursele modulului nu sunt încărcate.');
$check(str_contains($commerce, "'shop-consumables': 'shop-consumables-content'") && str_contains($commerce, "window.GTrotsConsumables.page('Consumabile')"), 'Modulul nu este integrat în routerul Electron.');
$check(str_contains($ui, 'Bon de consum') && str_contains($ui, "party('giver','Predător'") && str_contains($ui, "party('receiver','Primitor'"), 'Fluxul vizual al bonului este incomplet.');
$check(str_contains($ui, "['custom','Custom'") && str_contains($ui, 'data-consumables-period="${value}"') && str_contains($ui, 'Luna trecută') && str_contains($ui, 'Luna curentă'), 'Exportul nu oferă toate perioadele cerute.');
$check(str_contains($ui, 'data-consumables-format="pdf"') && str_contains($ui, 'data-consumables-format="xlsx"') && str_contains($ui, 'data-consumables-format="zip"'), 'Formatele exportului sunt incomplete.');
$check(str_contains($ui, 'data-consumption-voucher-edit') && str_contains($ui, 'data-consumption-voucher-delete'), 'Editarea și ștergerea bonurilor trebuie să fie vizibile permanent.');
$check(str_contains($ui, 'data-consumable-edit') && str_contains($ui, 'data-consumable-delete'), 'Editarea și ștergerea consumabilelor trebuie să fie vizibile permanent.');
$check(str_contains($css, 'min-width:1530px') && str_contains($css, '::-webkit-scrollbar{height:15px}'), 'Tabelul și scrollul orizontal nu au contractul responsive cerut.');
foreach (['listConsumables','createConsumableDocument','updateConsumableDocument','deleteConsumable','createConsumptionVoucher','updateConsumptionVoucher','deleteConsumptionVoucher','exportConsumables'] as $action) {
    $check(str_contains($api, "'{$action}'") && str_contains($client, $action), 'Acțiunea API lipsește: ' . $action);
}
$check(str_contains($service, 'quantity NUMERIC NOT NULL') && str_contains($service, 'quantity-$remaining'), 'Cantitatea bonului trebuie să fie pozitivă, dar să reducă stocul.');
$check(str_contains($service, "DELETE FROM shop_consumption_voucher_lines WHERE consumable_id") && str_contains($service, 'DELETE FROM shop_consumption_vouchers WHERE NOT EXISTS'), 'Ștergerea liberă nu curăță bonurile rămase fără poziții.');
$check(str_contains($export, 'name="Consumabile"') && str_contains($export, 'name="Bonuri de consum"'), 'Exportul Excel nu conține cele două foi.');
$check(str_contains($export, 'GESTIUNEA CONSUMABILELOR') && str_contains($export, 'BONURI DE CONSUM'), 'Identitatea vizuală a exporturilor este incompletă.');
echo "consumables_contract_test: ok\n";
