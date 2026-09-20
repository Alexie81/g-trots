<?php
declare(strict_types=1);

require_once __DIR__ . '/../shipping-note-pdf.php';

$output = $argv[1] ?? dirname(__DIR__, 2) . '/reports/aviz-verificare.pdf';
$withStamp = ($argv[2] ?? 'stamp') !== 'no-stamp';
$itemCount = max(1, min(200, (int)($argv[3] ?? 42)));
$items = [];
for ($index = 1; $index <= $itemCount; $index++) {
    $quantity = ($index % 4) + 1;
    $unitPrice = 19.5 + $index;
    $items[] = [
        'name' => 'Produs demonstrativ G-Trots cu denumire completă ' . $index,
        'sku' => 'GT-DEMO-' . str_pad((string)$index, 3, '0', STR_PAD_LEFT),
        'image_path' => 'assets/images/logo.png',
        'unit' => $index % 5 === 0 ? 'set' : 'buc',
        'quantity' => $quantity,
        'unit_price' => $unitPrice,
        'line_total' => round($quantity * $unitPrice, 2),
    ];
}
$payload = [
    'document_id' => 'sample',
    'series' => 'AVZ',
    'number' => '001',
    'issue_date' => date('Y-m-d'),
    'currency' => 'RON',
    'total' => array_sum(array_column($items, 'line_total')),
    'order_reference' => 'GT-2026-0001',
    'seller' => ['name' => 'G-Trots România SRL', 'cui' => 'RO12345678', 'registration_number' => 'J40/1234/2026', 'address' => 'Adresă firmă', 'city' => 'București', 'county' => 'București', 'phone' => '0700 000 000', 'email' => 'contact@g-trots.ro'],
    'buyer' => ['name' => 'Client demonstrație', 'phone' => '0712 345 678', 'address' => 'Strada Exemplu 10', 'city' => 'Brașov', 'county' => 'Brașov', 'postal_code' => '500001'],
    'items' => $items,
    'expedition' => ['delegate_name' => '-', 'identity_document' => '-', 'transport_vehicle' => '-', 'delivery_time' => '-', 'loading_place' => '-'],
    'sender_name' => 'G-Trots Romania',
    'with_stamp' => $withStamp,
];

$directory = dirname($output);
if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) throw new RuntimeException('Directorul de ieșire nu a putut fi creat.');
file_put_contents($output, GtrotsShippingNotePdf::render($payload), LOCK_EX);
echo $output . PHP_EOL;
