# Generator factură PDF G-Trots

Generatorul este în `invoice-pdf.php` și folosește motorul Dompdf deja inclus în proiect. Același șablon acceptă patru statusuri:

- `unpaid` / `neplatita`;
- `paid` / `platita`;
- `cancelled` / `anulata`;
- `return` / `retur`.

Tema cromatică poate fi `orange`, `green`, `red` sau `purple`. Configuratorul din aplicațiile mobilă și desktop salvează tema implicită în `shop_invoice_settings`.

## Păstrarea temei documentelor emise

Pentru facturile reale se folosesc metodele `renderPinned`, `htmlPinned` sau `savePinned`. La prima emitere, combinația serie + număr primește o temă în `shop_invoice_theme_assignments`. La regenerări, generatorul citește tema fixată și ignoră tema implicită actuală.

```php
$pdf = GtrotsInvoicePdf::renderPinned($db, $invoice, $utilizatorCurent);
```

Astfel, dacă GT001-GT099 sunt emise cu mov și apoi tema implicită devine portocalie, GT100 va primi portocaliu, iar GT001-GT099 vor rămâne mov inclusiv după modificări sau regenerări.

## Exemplu minim

```php
<?php
require_once __DIR__ . '/invoice-pdf.php';

$invoice = [
    'status' => 'unpaid',
    'series' => 'GT',
    'number' => '004282',
    'issue_date' => '2026-09-01',
    'due_date' => '2026-09-08',
    'currency' => 'RON',
    'seller' => [
        'name' => 'CAB IT EXPERT SRL',
        'trade_name' => 'G-Trots România',
        'cui' => '49972605',
        'registration_number' => 'J2024008303400',
        'address' => 'Adresa firmei',
        'city' => 'București',
        'country' => 'România',
        'email' => 'contact@g-trots.ro',
        'website' => 'g-trots.ro',
        'bank_name' => 'Banca firmei',
        'iban' => 'RO...'
    ],
    'buyer' => [
        'name' => 'CLIENT SRL',
        'cui' => 'RO12345678',
        'registration_number' => 'J40/1234/2026',
        'address' => 'Adresa clientului',
        'city' => 'București',
        'country' => 'România'
    ],
    'items' => [[
        'name' => 'Diagnostic trotinetă',
        'sku' => 'SRV-DIAG',
        'image_path' => 'uploads/products/diagnostic.jpg',
        'unit' => 'serv.',
        'quantity' => 1,
        'unit_price' => 120,
        'discount_percent' => 0,
        'vat_rate' => 21
    ]],
    'payment' => [
        'method' => 'Transfer bancar',
        'reference' => 'GT 004282'
    ],
    'notes' => 'Textul opțional afișat în secțiunea Mențiuni.'
];

// Salvează direct pe disc. Calea trebuie să fie absolută.
GtrotsInvoicePdf::save($invoice, __DIR__ . '/factura-GT-004282.pdf');

// Sau trimite PDF-ul direct dintr-un endpoint PHP.
header('Content-Type: application/pdf');
header('Content-Disposition: inline; filename="factura-GT-004282.pdf"');
echo GtrotsInvoicePdf::render($invoice);
```

Totalurile, discountul, baza de impozitare și TVA sunt calculate de generator din poziții. Pentru `return`, valorile sunt transformate automat în valori negative. Pentru `paid` soldul este zero, iar pentru `cancelled` documentul este marcat fără sold.

Miniaturile se trimit prin `image_path`, `product_image_storage_path` sau `product_image_url`. Din motive de securitate, generatorul încarcă numai fișiere locale din `shop-api/uploads/products`; dacă o imagine lipsește, afișează monograma G-Trots în locul ei. JPEG funcționează fără extensii PHP suplimentare, iar PNG/WebP necesită extensia GD activă.

Fișierul `examples/generate-invoice-pdf-examples.php` generează cele patru modele demonstrative în `output/pdf`.
