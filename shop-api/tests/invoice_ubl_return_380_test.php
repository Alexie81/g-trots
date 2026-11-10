<?php
declare(strict_types=1);

require_once __DIR__ . '/../invoice-ubl.php';

function return380Assert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function return380Xpath(string $xml): DOMXPath
{
    $document = new DOMDocument();
    return380Assert($document->loadXML($xml), 'Factura de retur 380 trebuie să fie XML valid.');
    return380Assert($document->documentElement?->localName === 'Invoice', 'Factura de retur trebuie să folosească rădăcina UBL Invoice.');
    $xpath = new DOMXPath($document);
    $xpath->registerNamespace('cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2');
    $xpath->registerNamespace('cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2');
    return $xpath;
}

// Snapshot comercial real al returului integral GT 024 pentru factura GT 019.
// Datele personale ale cumpărătorului sunt mascate intenționat; produsele,
// valorile, taxarea, referințele și tipul operațiunii rămân cele reale.
$realFullReturn = [
    'series' => 'GT',
    'number' => '024',
    'issue_date' => '2026-10-16',
    'due_date' => '2026-10-16',
    'currency' => 'RON',
    'status' => 'return',
    'total' => 153.99,
    'order_reference' => 'GT-20261014-26B5B949',
    'return_scope' => 'full',
    'return_shipping_cost' => 0,
    'return_shipping_cost_vat_rate' => 0,
    'notes' => 'Retur integral — snapshot comercial real, date client mascate pentru testare.',
    'related_invoice' => ['series' => 'GT', 'number' => '019', 'date' => '2026-10-14'],
    'seller' => [
        'name' => 'CAB IT EXPERT S.R.L.',
        'trade_name' => 'G-Trots România',
        'cui' => '49972605',
        'registration_number' => 'J40/8303/2024',
        'address' => 'Str. Humulești nr. 131-135, lot 4',
        'city' => 'Sector 5',
        'county' => 'București',
        'postal_code' => '052262',
        'country' => 'România',
        'email' => 'contact@g-trots.ro',
        'phone' => '0762093915',
        'vat_payer' => false,
    ],
    'buyer' => [
        'name' => 'Client retur real GT 024 — date mascate',
        'address' => 'Str. Client nr. 25',
        'city' => 'Movilița',
        'county' => 'Ialomița',
        'postal_code' => '927180',
        'country' => 'România',
        'email' => 'client-mascat@example.invalid',
        'vat_payer' => false,
    ],
    'payment' => ['method' => 'Ramburs la curier'],
    'items' => [
        [
            'name' => 'Cauciuc offroad tubeless pentru trotineta electrica 10x2.75-6.5 -Kukirin G2-2025',
            'sku' => 'SE-CMM087',
            'quantity' => 1,
            'unit_price' => 129.00,
            'discount_percent' => 0,
            'vat_rate' => 0,
        ],
        [
            'name' => 'Serviciu de livrare – Curier',
            'sku' => 'TRANSPORT',
            'quantity' => 1,
            'unit_price' => 24.99,
            'discount_percent' => 0,
            'vat_rate' => 0,
        ],
    ],
];

$fullXml = GtrotsInvoiceUbl::render($realFullReturn);
$fullXpath = return380Xpath($fullXml);
return380Assert((string)$fullXpath->evaluate('string(/*/cbc:InvoiceTypeCode)') === '380', 'Returul integral trebuie să folosească BT-3=380.');
return380Assert((string)$fullXpath->evaluate('string(//cac:BillingReference//cbc:ID)') === 'GT 019', 'Returul integral trebuie să refere factura reală GT 019.');
return380Assert($fullXpath->query('//cac:InvoiceLine')->length === 2, 'Returul integral trebuie să conțină produsul și livrarea inițială rambursată.');
foreach ($fullXpath->query('//cac:InvoiceLine/cbc:InvoicedQuantity') ?: [] as $quantity) {
    return380Assert((float)$quantity->textContent < 0, 'Toate cantitățile returului integral trebuie să fie negative.');
}
foreach ($fullXpath->query('//cac:InvoiceLine/cac:Price/cbc:PriceAmount') ?: [] as $price) {
    return380Assert((float)$price->textContent >= 0, 'Prețurile unitare rămân pozitive în factura 380 cu minus.');
}
return380Assert((string)$fullXpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:LineExtensionAmount)') === '-153.99', 'Baza liniilor returului integral trebuie să fie -153,99 RON.');
return380Assert((string)$fullXpath->evaluate('string(//cac:TaxTotal/cbc:TaxAmount)') === '0.00', 'Returul real neplătitor de TVA trebuie să păstreze TVA zero.');
return380Assert((string)$fullXpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:PayableAmount)') === '-153.99', 'Totalul returului integral trebuie să fie exact -153,99 RON.');

// Retur parțial derivat din aceeași factură reală: se corectează numai produsul,
// livrarea inițială nu se rambursează, iar costul direct de retur este reținut.
$realPartialReturn = $realFullReturn;
$realPartialReturn['number'] = '024-PARTIAL-TEST';
$realPartialReturn['issue_date'] = '2026-11-10';
$realPartialReturn['due_date'] = '2026-11-10';
$realPartialReturn['total'] = 109.00;
$realPartialReturn['return_scope'] = 'partial';
$realPartialReturn['return_shipping_cost'] = 20.00;
$realPartialReturn['notes'] = 'TEST VALIDATOR ANAF — retur parțial derivat din GT 024 — fără efect fiscal.';
$realPartialReturn['items'] = [$realFullReturn['items'][0]];

$partialXml = GtrotsInvoiceUbl::render($realPartialReturn);
$partialXpath = return380Xpath($partialXml);
return380Assert((string)$partialXpath->evaluate('string(/*/cbc:InvoiceTypeCode)') === '380', 'Returul parțial trebuie să folosească BT-3=380.');
return380Assert($partialXpath->query('//cac:InvoiceLine')->length === 1, 'Returul parțial trebuie să conțină numai produsul acceptat.');
return380Assert((string)$partialXpath->evaluate('string(//cac:InvoiceLine/cbc:InvoicedQuantity)') === '-1', 'Returul parțial trebuie să inverseze numai cantitatea acceptată.');
return380Assert((string)$partialXpath->evaluate('string(//cac:InvoiceLine/cbc:LineExtensionAmount)') === '-129.00', 'Poziția parțială trebuie să corecteze exact -129,00 RON.');
return380Assert((string)$partialXpath->evaluate('string(/*/cac:AllowanceCharge/cbc:ChargeIndicator)') === 'true', 'Costul direct al returului trebuie reprezentat ca majorare pozitivă.');
return380Assert((string)$partialXpath->evaluate('string(/*/cac:AllowanceCharge/cbc:Amount)') === '20.00', 'Costul direct al returului trebuie să fie exact 20,00 RON.');
return380Assert((string)$partialXpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:ChargeTotalAmount)') === '20.00', 'Totalul majorărilor trebuie declarat explicit.');
return380Assert((string)$partialXpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount)') === '-109.00', 'Baza după reținerea costului de retur trebuie să fie -109,00 RON.');
return380Assert((string)$partialXpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:PayableAmount)') === '-109.00', 'Totalul returului parțial trebuie să fie exact -109,00 RON.');

if ((string)getenv('GTROTS_LIVE_ANAF_VALIDATE') === '1') {
    return380Assert((GtrotsInvoiceUbl::validateWithAnaf($fullXml)['stare'] ?? '') === 'ok', 'Validatorul oficial ANAF trebuie să accepte returul integral real în format Invoice 380.');
    return380Assert((GtrotsInvoiceUbl::validateWithAnaf($partialXml)['stare'] ?? '') === 'ok', 'Validatorul oficial ANAF trebuie să accepte returul parțial în format Invoice 380.');
    echo "Validatorul oficial ANAF/FACT1 a acceptat returul integral real GT 024 și scenariul parțial derivat.\n";
}

echo "invoice_ubl_return_380_test: OK\n";
