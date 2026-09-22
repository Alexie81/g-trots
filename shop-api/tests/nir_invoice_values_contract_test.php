<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/nir-domain.php';

$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$line = shopNirCalculateLine([
    'accepted_quantity' => '4',
    'conversion_factor' => '1',
    'unit_price' => '16.53',
    'price_entry_mode' => 'line_vat',
    'line_net' => '66.12',
    'line_vat' => '13.88',
    'discount_percent' => '0',
    'vat_rate' => '21',
    'exchange_rate' => '1',
]);

$expect($line['unit_price'] === '16.530000', 'Prețul unitar al facturii nu este păstrat exact.');
$expect($line['line_net_ron'] === '66.12', 'Baza facturii nu este păstrată exact.');
$expect($line['line_vat_ron'] === '13.88', 'TVA-ul facturii a fost rotunjit greșit.');
$expect($line['line_total_ron'] === '80.00', 'Totalul poziției a fost rotunjit greșit.');

$mobile = (string)file_get_contents(dirname(__DIR__, 2) . '/components/ShopNirManager.tsx');
$desktop = (string)file_get_contents(dirname(__DIR__, 2) . '/electron-app/renderer/js/shop-commerce.js');
$expect(str_contains($mobile, "vat_rate: '21'") && str_contains($mobile, 'placeholder="21"'), 'NIR-ul mobil nu pornește cu TVA 21%.');
$expect(str_contains($desktop, "vat_rate: '21'") && str_contains($desktop, "'line_vat'"), 'NIR-ul desktop nu pornește cu TVA 21% sau nu permite TVA exact.');

if ($failures !== []) {
    fwrite(STDERR, implode(PHP_EOL, $failures) . PHP_EOL);
    exit(1);
}

echo "OK: NIR păstrează exact 66,12 + 13,88 = 80,00 și pornește cu TVA 21%." . PHP_EOL;
