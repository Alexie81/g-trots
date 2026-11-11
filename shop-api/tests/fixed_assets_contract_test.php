<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$service = (string)file_get_contents($root . '/shop-api/fixed-assets-service.php');
$export = (string)file_get_contents($root . '/shop-api/fixed-assets-export.php');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$html = (string)file_get_contents($root . '/electron-app/renderer/index.html');
$client = (string)file_get_contents($root . '/electron-app/renderer/js/shop-api.js');

$expect = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
};

$expect(str_contains($html, 'data-tab="shop-fixed-assets"'), 'Tabul Gestiune mijloace fixe lipsește din navigarea desktop.');
$expect(str_contains($desktop, "commercePage('Gestiune mijloace fixe'"), 'Pagina registrului lipsește.');
$expect(str_contains($desktop, 'Data documentului *') && str_contains($desktop, 'Tip document *') && str_contains($desktop, 'Serie / număr *'), 'Formularul documentului este incomplet.');
$expect(str_contains($desktop, 'data-fixed-asset-line-field="product_name"') && str_contains($desktop, 'data-fixed-asset-line-field="vat_rate"'), 'Pozițiile documentului nu includ toate valorile cerute.');
$expect(str_contains($desktop, 'Cantitate casată *') && str_contains($desktop, 'Motivul casării *'), 'Modalul de casare este incomplet.');
$expect(str_contains($desktop, 'Vizualizează documentul') && str_contains($desktop, 'Descarcă documentul'), 'Fișa nu oferă vizualizarea și descărcarea documentului.');
$expect(str_contains($desktop, 'Exportă registrul') && str_contains($desktop, 'data-fixed-asset-export="pdf"') && str_contains($desktop, 'data-fixed-asset-export="xlsx"') && str_contains($desktop, 'data-fixed-asset-export="zip"'), 'Exporturile complete PDF, Excel și ZIP nu sunt disponibile.');
$expect(!str_contains($desktop, 'data-fixed-asset-period') && !str_contains($desktop, 'shop-fixed-asset-export-from'), 'Exportul mijloacelor fixe nu trebuie să mai solicite o perioadă.');

foreach (['listFixedAssets', 'getFixedAsset', 'getFixedAssetDocument', 'createFixedAssetDocument', 'updateFixedAssetDocument', 'deleteFixedAssetDocument', 'deleteFixedAsset', 'disposeFixedAsset', 'updateFixedAssetDisposal', 'deleteFixedAssetDisposal', 'addFixedAssetFiles', 'deleteFixedAssetFile', 'downloadFixedAssetDocument', 'exportFixedAssets'] as $action) {
    $expect(str_contains($api, "\$action === '{$action}'"), "Ruta {$action} lipsește din API.");
    $expect(str_contains($client, $action . ':'), "Clientul desktop nu expune {$action}.");
}

$expect(str_contains($service, 'shop_fixed_asset_documents') && str_contains($service, 'shop_fixed_assets') && str_contains($service, 'shop_fixed_asset_disposals'), 'Schema persistentă a modulului este incompletă.');
$expect(str_contains($service, 'Cantitatea casată trebuie introdusă cu minus.'), 'Validarea cantității negative lipsește.');
$expect(str_contains($service, 'Cantitatea casată depășește cantitatea disponibilă.'), 'Protecția împotriva supracasării lipsește.');
$expect(str_contains($export, "'Data casării'") && str_contains($export, "'Cantitatea casată'") && str_contains($export, "'Motivul casării'"), 'Exportul nu include toate câmpurile casării.');

echo "fixed_assets_contract_test: ok\n";
