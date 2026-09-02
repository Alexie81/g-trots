<?php
declare(strict_types=1);

require_once __DIR__ . '/../invoice-pdf.php';

$base = [
    'series' => 'GT', 'number' => '1', 'issue_date' => '2026-09-01', 'due_date' => '2026-09-08', 'currency' => 'RON',
    'seller' => ['name' => 'G-Trots', 'cui' => 'RO1'],
    'buyer' => ['name' => 'Client test', 'cui' => 'RO2'],
    'items' => [[
        'name' => 'Service', 'description' => 'DESCRIEREA-NU-TREBUIE-AFIȘATĂ', 'unit' => 'serv.', 'quantity' => 2, 'unit_price' => 100,
        'image_path' => 'pdf-assets/invoice-products/diagnostic-scuter.jpg',
        'discount_percent' => 10, 'vat_rate' => 21,
    ]],
    'is_demo' => true,
];

$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$labels = [
    'unpaid' => ['NEPLĂTITĂ', '217,80 lei'],
    'paid' => ['PLĂTITĂ', '0,00 lei'],
    'return' => ['FACTURĂ DE RETUR', '-217,80 lei'],
];
$themes = [
    'orange' => '#ff8a00',
    'green' => '#19a86b',
    'red' => '#ef4056',
    'purple' => '#7157d9',
];
$statusColors = [
    'unpaid' => '#ff8a00',
    'paid' => '#19a86b',
    'return' => '#ef4056',
];

foreach ($labels as $status => [$label, $due]) {
    foreach ($themes as $theme => $themeAccent) {
        $case = $status . '/' . $theme;
        $invoice = $base;
        $invoice['status'] = $status;
        $invoice['theme'] = $theme;
        if ($status === 'return') {
            $invoice['series'] = 'GTR';
            $invoice['related_invoice'] = ['series' => 'GT', 'number' => '0', 'date' => '2026-08-31'];
            $invoice['return_reason'] = 'Retur test';
        }
        $html = GtrotsInvoicePdf::html($invoice);
        $expect(str_contains($html, $label), $case . ': lipsește eticheta de status.');
        $expect(str_contains($html, $due), $case . ': soldul calculat este incorect.');
        $expect(str_contains($html, '.status-strip{background:') && str_contains($html, ';border-color:' . $statusColors[$status] . '}'), $case . ': culoarea statusului este incorectă.');
        $expect(str_contains($html, '.pay-card{padding:0;overflow:hidden;background:#fff;border-color:#d8d4da;border-top:1.1mm solid ' . $themeAccent . '}'), $case . ': tema nu este aplicată corpului facturii.');
        $expect(str_contains($html, 'header{border-top:3mm solid ' . $themeAccent), $case . ': accentul principal nu este aplicat antetului.');
        $expect(str_contains($html, '.closing{margin-top:2mm;padding:2.4mm 3.5mm;background:#fff;border:1px solid #d8d4da;border-top:1.4mm solid ' . $themeAccent), $case . ': tema nu este aplicată încheierii facturii.');
        $expect(str_contains($html, 'data:image/'), $case . ': logo-ul G-Trots nu este încorporat.');
        $expect(str_contains($html, 'class="product-thumb"'), $case . ': miniatura produsului nu este încorporată.');
        $expect(!str_contains($html, 'DESCRIEREA-NU-TREBUIE-AFIȘATĂ'), $case . ': descrierea produsului este încă afișată.');
        $expect(!str_contains($html, 'MODEL DEMONSTRATIV'), $case . ': marcajul demonstrativ nu trebuie afișat.');
        $expect(str_contains($html, 'se transmite prin sistemul național RO e-Factura, în format XML'), $case . ': mențiunea privind transmiterea XML lipsește.');
        $expect(str_contains($html, 'art. 4 alin. (6) din OUG nr. 120/2021'), $case . ': mențiunea legală RO e-Factura lipsește.');
        $expect(str_contains($html, 'OUG nr. 120/2021. <span class="warranty-copy">Factura ține loc de document justificativ pentru garanție.'), $case . ': mențiunea implicită de garanție nu continuă textul din footer.');
        $expect(str_contains($html, '.legal-footer{position:fixed;left:10mm;right:10mm;bottom:12.5mm'), $case . ': mențiunile legale nu sunt fixate în footerul paginii.');
        $expect(str_contains($html, '.warranty-copy{color:inherit;font-weight:400}'), $case . ': mențiunea de garanție nu trebuie afișată îngroșat.');
        $expect(str_contains($html, '.closing{margin-top:2mm;padding:2.4mm 3.5mm;background:#fff'), $case . ': bara de încheiere nu folosește fundalul alb.');
        $expect(substr_count($html, 'class="contact-icon-image"') === 2 && str_contains($html, 'data:image/svg+xml;base64,'), $case . ': iconițele vectoriale de contact lipsesc.');
        $expect(str_contains($html, '.items th{text-align:center!important;vertical-align:middle;font-size:7pt'), $case . ': antetul tabelului nu este mărit și centrat.');
        $expect(!str_contains($html, 'http://') && !str_contains($html, 'https://'), $case . ': HTML-ul încearcă să încarce resurse externe.');
        $pdf = GtrotsInvoicePdf::render($invoice);
        $expect(str_starts_with($pdf, '%PDF-'), $case . ': PDF invalid.');
        $expect(str_ends_with(rtrim($pdf), '%%EOF'), $case . ': PDF incomplet.');
    }
}

try {
    GtrotsInvoicePdf::html(array_replace($base, ['status' => 'necunoscut']));
    $failures[] = 'Statusurile necunoscute trebuie respinse.';
} catch (InvalidArgumentException $expected) {
}

try {
    GtrotsInvoicePdf::html(array_replace($base, ['status' => 'cancelled']));
    $failures[] = 'Statusul anulat nu mai trebuie acceptat.';
} catch (InvalidArgumentException $expected) {
}

try {
    GtrotsInvoicePdf::html(array_replace($base, ['theme' => 'necunoscuta']));
    $failures[] = 'Temele necunoscute trebuie respinse.';
} catch (InvalidArgumentException $expected) {
}

if ($failures) {
    fwrite(STDERR, "Generator factură: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "Generator factură validat pentru 3 statusuri și 4 teme de culoare.\n";
