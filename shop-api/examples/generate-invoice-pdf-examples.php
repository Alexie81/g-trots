<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/invoice-pdf.php';

/*
 * Configurator:
 *   status: unpaid | paid | return
 *   theme:  orange | green | red | purple
 * Statusul schimbă numai bara de sus; tema colorează restul facturii.
 */

$outputDirectory = dirname(__DIR__, 2) . '/output/pdf';

$seller = [
    'name' => 'CAB IT EXPERT SRL',
    'trade_name' => 'G-Trots România',
    'cui' => '49972605',
    'registration_number' => 'J2024008303400',
    'address' => 'Sediu social configurabil din aplicația G-Trots',
    'city' => 'București',
    'country' => 'România',
    'email' => 'contact@g-trots.ro',
    'phone' => '07xx xxx xxx',
    'website' => 'g-trots.ro',
    'bank_name' => 'Banca demonstrativă',
    'iban' => 'RO00DEMO0000000000000000',
];

$buyer = [
    'name' => 'CLIENT DEMONSTRATIV SRL',
    'cui' => 'RO12345678',
    'registration_number' => 'J40/1234/2026',
    'address' => 'Bd. Exemplu nr. 10',
    'city' => 'București',
    'county' => 'Sector 3',
    'country' => 'România',
    'email' => 'client@example.test',
    'phone' => '07xx xxx xxx',
];

$base = [
    'series' => 'GT',
    'issue_date' => '2026-09-01',
    'due_date' => '2026-09-08',
    'delivery_date' => '2026-09-01',
    'currency' => 'RON',
    'seller' => $seller,
    'buyer' => $buyer,
    'payment' => [
        'method' => 'Transfer bancar',
        'iban' => $seller['iban'],
        'bank_name' => $seller['bank_name'],
    ],
    'order_reference' => 'CMD-DEMO-2081',
    'tax_note' => 'Societate neînregistrată în scopuri de TVA. TVA aplicată: 0%.',
    'warranty_note' => 'Factura ține loc de document justificativ pentru garanție. Solicitări: contact@g-trots.ro. Drepturile legale se acordă conform OUG nr. 140/2021.',
    'is_demo' => true,
];

$realCatalogItems = [
    [
        'name' => 'Controller original Kukirin G2 - model 2025',
        'sku' => 'C44514',
        'image_path' => 'pdf-assets/invoice-products/real-controller-kukirin-g2.jpg',
        'unit' => 'buc.',
        'quantity' => 1,
        'unit_price' => 449,
        'vat_rate' => 0,
    ],
    [
        'name' => 'Display original trotineta electrica Kukirin G4',
        'sku' => 'C44512-G4',
        'image_path' => 'pdf-assets/invoice-products/real-display-kukirin-g4.jpg',
        'unit' => 'buc.',
        'quantity' => 1,
        'unit_price' => 389,
        'vat_rate' => 0,
    ],
    [
        'name' => 'Etrier trotineta electrica Kukirin G2 PRO(fata-spate) G2 MAX(spate)',
        'sku' => 'WT-SP-1284',
        'image_path' => 'pdf-assets/invoice-products/real-etrier-kukirin.jpg',
        'unit' => 'buc.',
        'quantity' => 2,
        'unit_price' => 80,
        'vat_rate' => 0,
    ],
    [
        'name' => 'Disc frana trotineta electrica 140mm 6H',
        'sku' => 'SE-CMM467',
        'image_path' => 'pdf-assets/invoice-products/real-disc-frana-140.jpg',
        'unit' => 'buc.',
        'quantity' => 2,
        'unit_price' => 29,
        'vat_rate' => 0,
    ],
];

$statusExamples = [
    'neplatita' => array_replace($base, [
        'status' => 'unpaid',
        'number' => '004281',
        'items' => $realCatalogItems,
        'payment' => array_replace($base['payment'], ['reference' => 'GT 004281']),
    ]),
    'platita' => array_replace($base, [
        'status' => 'paid',
        'number' => '004279',
        'issue_date' => '2026-08-29',
        'due_date' => '2026-08-29',
        'items' => [
            $realCatalogItems[0],
            $realCatalogItems[1],
            $realCatalogItems[3],
        ],
        'payment' => array_replace($base['payment'], [
            'method' => 'Card online',
            'reference' => 'GT 004279',
            'paid_at' => '2026-08-29',
            'transaction_id' => 'DEMO-PAY-8A72',
        ]),
    ]),
    'retur' => array_replace($base, [
        'status' => 'return',
        'series' => 'GTR',
        'number' => '000074',
        'issue_date' => '2026-09-01',
        'due_date' => '',
        'items' => [
            $realCatalogItems[1],
            $realCatalogItems[3],
        ],
        'return_reason' => 'Retur acceptat după verificarea pieselor; contravaloarea se restituie prin transfer bancar.',
        'related_invoice' => ['series' => 'GT', 'number' => '004255', 'date' => '2026-08-22'],
        'payment' => array_replace($base['payment'], ['method' => 'Restituire prin transfer', 'reference' => 'GTR 000074']),
    ]),
];

$themes = [
    'orange' => 'portocaliu',
    'green' => 'verde',
    'red' => 'rosu',
    'purple' => 'mov',
];

foreach ($statusExamples as $statusName => $invoice) {
    foreach ($themes as $theme => $themeName) {
        $themedInvoice = array_replace($invoice, ['theme' => $theme]);
        $path = $outputDirectory . '/factura-g-trots-' . $statusName . '-' . $themeName . '.pdf';
        GtrotsInvoicePdf::save($themedInvoice, $path);
        echo $path . PHP_EOL;
    }
}
