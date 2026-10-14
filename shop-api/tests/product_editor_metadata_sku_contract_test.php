<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$mobile = (string)file_get_contents($root . '/components/ShopProductsManager.tsx');
$mobileApi = (string)file_get_contents($root . '/services/shopApi.ts');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$desktopApi = (string)file_get_contents($root . '/electron-app/renderer/js/shop-api.js');

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
};

$assert(str_contains($api, "if (\$action === 'checkProductSku'"), 'API-ul trebuie sa expuna verificarea SKU.');
$assert(substr_count($api, 'resolvedProductSku($db, $payload[\'sku\']') >= 2, 'Crearea si editarea trebuie sa accepte SKU manual sau generat.');
$assert(str_contains($api, "throw new InvalidArgumentException('SKU-ul este indisponibil."), 'API-ul trebuie sa refuze un SKU duplicat.');

$assert(str_contains($mobile, 'const refreshEditorMetadata = useCallback'), 'Aplicatia mobila trebuie sa reincarce metadatele editorului.');
$assert(substr_count($mobile, 'refreshEditorMetadata()') >= 2, 'Metadatele mobile trebuie actualizate la adaugare si editare.');
$assert(str_contains($mobile, "sku: form.sku.trim()"), 'Aplicatia mobila trebuie sa trimita SKU-ul editat.');
$assert(str_contains($mobile, "error={skuAvailability === 'unavailable' ? 'Indisponibil'"), 'Aplicatia mobila trebuie sa afiseze starea SKU in timp real.');
$assert(str_contains($mobile, 'normalizeSkuInput(sku) === originalSku.current'), 'Aplicatia mobila trebuie sa accepte SKU-ul nemodificat al produsului editat.');
$assert(str_contains($mobile, "listProductOptions(token, { q: sku, limit: 50 })"), 'Aplicatia mobila trebuie sa poata verifica SKU-ul si pe un API public mai vechi.');
$assert(substr_count($mobile, '<TextInput autoFocus') >= 3, 'Toate selectoarele mobile de catalog trebuie sa deschida direct cautarea.');
$assert(str_contains($mobile, 'Apasă și caută producătorul') && str_contains($mobile, 'Apasă și caută compatibilitatea'), 'Selectoarele mobile trebuie sa indice vizibil functia de cautare.');
$assert(str_contains($mobileApi, 'checkProductSku:'), 'Clientul API mobil trebuie sa poata verifica SKU-ul.');

$assert(str_contains($desktop, "metadata(),\n      ]"), 'Editorul desktop trebuie sa reincarce metadatele la fiecare deschidere.');
$assert(str_contains($desktop, "$('shop-product-sku').addEventListener('input'"), 'Desktopul trebuie sa verifice SKU-ul in timp ce este scris.');
$assert(str_contains($desktop, "sku: $('shop-product-sku').value.trim()"), 'Desktopul trebuie sa trimita SKU-ul editat.');
$assert(str_contains($desktop, 'sku === originalSku'), 'Desktopul trebuie sa accepte SKU-ul nemodificat al produsului editat.');
$assert(str_contains($desktop, "listProductOptions({ q: sku, limit: 50 })"), 'Desktopul trebuie sa poata verifica SKU-ul si pe un API public mai vechi.');
$assert(str_contains($desktop, "toggleProductDropdown('brands')"), 'Cautarea desktop pentru compatibilitati trebuie deschisa si focalizata la fel ca celelalte selectoare.');
$assert(substr_count($desktop, 'shop-multi-search-icon') >= 3, 'Toate selectoarele desktop trebuie sa afiseze clar actiunea de cautare.');
$assert(str_contains($desktop, 'document.body.appendChild(imageMenu)'), 'Meniul de click dreapta al imaginii nu trebuie taiat de editorul scrollabil.');
$assert(str_contains($desktop, "editor.addEventListener('contextmenu'"), 'Imaginile din descriere trebuie sa raspunda la click dreapta.');
$assert(str_contains($desktopApi, 'checkProductSku:'), 'Clientul API desktop trebuie sa poata verifica SKU-ul.');

fwrite(STDOUT, "OK: editor produs, metadate proaspete si SKU verificat\n");
