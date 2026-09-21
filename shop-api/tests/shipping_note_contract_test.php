<?php
declare(strict_types=1);

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "shipping_note_contract_test: {$message}\n");
        exit(1);
    }
};

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$service = (string)file_get_contents($root . '/shop-api/shipping-note-service.php');
$pdf = (string)file_get_contents($root . '/shop-api/shipping-note-pdf.php');
$mobile = (string)file_get_contents($root . '/components/ShopOrdersManager.tsx');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$mobileApi = (string)file_get_contents($root . '/services/shopApi.ts');
$desktopApi = (string)file_get_contents($root . '/electron-app/renderer/js/shop-api.js');
$invoiceService = (string)file_get_contents($root . '/shop-api/invoice-service.php');

$assert(str_contains($api, 'CREATE TABLE IF NOT EXISTS shop_shipping_notes'), 'Lipsește registrul avizelor.');
$assert(str_contains($api, 'CREATE TABLE IF NOT EXISTS shop_shipping_note_sequences'), 'Lipsește secvența numerelor de aviz.');
$assert(str_contains($api, '$schemaVersion = 2026092101;'), 'Versiunea schemei nu declanșează migrarea U.M. în producție.');
$assert(str_contains($api, "unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'buc'"), 'U.M. nu are implicit valoarea buc.');
$assert(str_contains($api, "UPDATE shop_products SET unit_of_measure = 'buc'"), 'Produsele existente nu sunt completate cu U.M. buc.');
$assert(str_contains($api, 'p.currency, p.unit_of_measure,'), 'Lista managerului nu încarcă U.M. salvată pe produs.');

foreach (['prepareShippingNote', 'issueShippingNote', 'getShippingNote', 'downloadShippingNote', 'getShippingNotePublicLink', 'sendShippingNoteEmail', 'deleteShippingNote'] as $action) {
    $assert(str_contains($api, "\$action === '{$action}'"), "Lipsește ruta {$action}.");
    $assert(str_contains($mobileApi, "'{$action}'"), "Clientul mobil nu apelează {$action}.");
    $assert(str_contains($desktopApi, "'{$action}'"), "Clientul desktop nu apelează {$action}.");
}

$assert(str_contains($service, "private const DEFAULT_SERIES = 'AVZ'"), 'Seria AVZ nu este configurată.');
$assert(str_contains($service, "'delegate_name' => \$editable('delegate_name')"), 'Numele delegatului nu este editabil.');
$assert(str_contains($service, "'sender_name' => \$editable('sender_name', 'G-Trots Romania')"), 'Expeditorul implicit nu este configurat.');
$assert(str_contains($service, "\$item['discounted_line_total'] ?? \$item['line_total']"), 'Avizul nu fixează valoarea efectivă a produsului din comandă.');
$assert(str_contains($service, "\$item['unit_of_measure'] ?? ''"), 'Avizul nu preia U.M. de pe produs.');
$assert(str_contains($service, "'stamp_path' => (string)(\$company['stamp_path'] ?? '')"), 'Avizul nu preia imaginea ștampilei din datele firmei.');
$assert(str_contains($service, 'hydrateStampPayload'), 'Avizele cu ștampilă emise anterior nu sunt actualizate cu imaginea salvată.');
$assert(str_contains($service, 'Poți șterge numai ultimul aviz emis.'), 'Ștergerea ultimului aviz nu este protejată.');
$assert(str_contains($service, 'resetSequence'), 'Numărul șters nu este eliberat pentru reutilizare.');
$assert(!str_contains($invoiceService, 'shop_shipping_notes'), 'Integrarea avizelor nu trebuie să modifice serviciul fiscal al facturilor.');

foreach (['IDENTIFICAREA DOCUMENTULUI', 'FURNIZOR / EXPEDITOR', 'CUMPĂRĂTOR / DESTINATAR', 'DATE PRIVIND EXPEDIȚIA', 'LOC ÎNCĂRCARE', 'Imagine', 'U.M.', 'Preț unitar', 'Valoare'] as $label) {
    $assert(str_contains($pdf, $label), "PDF-ul nu conține {$label}.");
}
$assert(str_contains($pdf, "=== 'RON' ? 'lei'"), 'Valorile în RON nu sunt marcate cu lei.');
$assert(str_contains($pdf, "\$stampImage = self::imageDataUri((string)(\$seller['stamp_path'] ?? ''))"), 'PDF-ul nu încarcă imaginea ștampilei.');
$assert(str_contains($pdf, "!empty(\$document['with_stamp'])"), 'Varianta cu/fără ștampilă nu este condiționată corect.');
$assert(str_contains($pdf, "'<img src=\"' . self::e(\$stampImage)"), 'Imaginea ștampilei nu este inserată în PDF.');
$assert(str_contains($pdf, "trim((string)(\$item['name'] ?? '')) !== ''"), 'PDF-ul nu elimină pozițiile goale din tabel.');
$assert(!preg_match('/for\s*\([^)]*\$rows/i', $pdf), 'PDF-ul nu trebuie să completeze tabelul cu rânduri goale până la un număr fix.');
foreach (['Urmează factura', 'Fără factură', 'ALTA CAUZĂ', 'PRIMIRE ÎN GESTIUNE', 'PRIMIT DE'] as $forbidden) {
    $assert(!str_contains($pdf, $forbidden), "PDF-ul conține textul eliminat {$forbidden}.");
}

foreach ([$mobile, $desktop] as $interface) {
    foreach (['Trimite PDF', 'E-mail', 'Download', 'Șterge'] as $actionLabel) {
        $assert(str_contains($interface, $actionLabel), "Interfața nu conține acțiunea {$actionLabel}.");
    }
    $assert(str_contains($interface, 'Generează avizul'), 'Interfața nu deschide emiterea avizului.');
    $assert(str_contains($interface, 'Variantă cu ștampilă'), 'Interfața nu permite selectarea ștampilei.');
}

echo "shipping_note_contract_test: OK\n";
