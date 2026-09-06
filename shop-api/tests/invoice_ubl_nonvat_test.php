<?php
declare(strict_types=1);

require_once __DIR__ . '/../invoice-ubl.php';

function nonVatUblAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function nonVatUblXpath(string $xml): DOMXPath
{
    $document = new DOMDocument();
    nonVatUblAssert($document->loadXML($xml), 'Documentul UBL trebuie să fie XML valid.');
    $xpath = new DOMXPath($document);
    $xpath->registerNamespace('cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2');
    $xpath->registerNamespace('cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2');
    return $xpath;
}

$invoice = [
    'series' => 'GT',
    'number' => '900001',
    'issue_date' => '2026-09-06',
    'due_date' => '2026-09-13',
    'currency' => 'RON',
    'status' => 'unpaid',
    'total' => 140.00,
    'order_reference' => 'TEST-NONVAT-1',
    'notes' => 'Regim special de scutire pentru întreprinderi mici – neînregistrat în scopuri de TVA.',
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
        'name' => 'Client persoană fizică',
        'address' => 'Str. Exemplu nr. 1',
        'city' => 'Cluj-Napoca',
        'county' => 'Cluj',
        'postal_code' => '400001',
        'country' => 'România',
        'email' => 'client@example.invalid',
        'vat_payer' => false,
    ],
    'payment' => ['method' => 'Ramburs'],
    'items' => [
        [
            'name' => str_repeat('Produs cu denumire lungă și caractere românești ', 4),
            'sku' => 'TEST-UBL-1',
            'quantity' => 2,
            'unit_price' => 50,
            'discount_percent' => 10,
            'vat_rate' => 0,
        ],
        [
            'name' => 'Serviciu de livrare – Curier',
            'sku' => 'TRANSPORT',
            'quantity' => 1,
            'unit_price' => 50,
            'discount_percent' => 0,
            'vat_rate' => 0,
        ],
    ],
];

$xml = GtrotsInvoiceUbl::render($invoice);
$xpath = nonVatUblXpath($xml);
nonVatUblAssert((string)$xpath->evaluate('string(//cac:TaxSubtotal/cac:TaxCategory/cbc:ID)') === 'O', 'Neplătitorul de TVA trebuie să folosească categoria O.');
nonVatUblAssert((string)$xpath->evaluate('string(//cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReasonCode)') === 'VATEX-EU-O', 'Categoria O trebuie să declare VATEX-EU-O.');
nonVatUblAssert($xpath->query('//cac:TaxCategory[cbc:ID="O"]/cbc:Percent')->length === 0, 'Categoria O nu permite elementul Percent.');
nonVatUblAssert($xpath->query('//cac:ClassifiedTaxCategory[cbc:ID="O"]/cbc:Percent')->length === 0, 'Linia din categoria O nu permite elementul Percent.');
nonVatUblAssert($xpath->query('//cac:AccountingSupplierParty//cac:PartyTaxScheme')->length === 0, 'Un vânzător neînregistrat în scopuri de TVA nu trebuie identificat ca plătitor de TVA.');
nonVatUblAssert((string)$xpath->evaluate('string(//cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme/cbc:ID)') === 'VAT', 'Schema de taxă CIUS-RO rămâne VAT inclusiv pentru categoria O.');
nonVatUblAssert((string)$xpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:PayableAmount)') === '140.00', 'Totalul facturii cu reducere și transport trebuie să fie exact.');
foreach ($xpath->query('//cac:InvoiceLine/cac:Item/cbc:Name') ?: [] as $name) {
    nonVatUblAssert(mb_strlen((string)$name->textContent, 'UTF-8') <= 100, 'BT-153 trebuie limitat la 100 de caractere.');
}

$creditNote = $invoice;
$creditNote['series'] = 'GTR';
$creditNote['number'] = '900002';
$creditNote['status'] = 'return';
$creditNote['total'] = 70.00;
$creditNote['return_shipping_cost'] = 20.00;
$creditNote['return_shipping_cost_vat_rate'] = 0;
$creditNote['items'] = [[
    'name' => 'Produs returnat parțial',
    'sku' => 'TEST-RET-1',
    'quantity' => 1,
    'unit_price' => 90,
    'discount_percent' => 0,
    'vat_rate' => 0,
]];
$creditNote['related_invoice'] = ['series' => 'GT', 'number' => '900001', 'date' => '2026-09-06'];
$creditXml = GtrotsInvoiceUbl::render($creditNote);
$creditXpath = nonVatUblXpath($creditXml);
nonVatUblAssert((string)$creditXpath->evaluate('string(/*/cbc:CreditNoteTypeCode)') === '381', 'Factura de corecție trebuie să folosească tipul 381.');
nonVatUblAssert((string)$creditXpath->evaluate('string(//cac:AllowanceCharge[cbc:ChargeIndicator="false"]/cbc:Amount)') === '20.00', 'Costul direct al returului trebuie declarat separat.');
nonVatUblAssert((string)$creditXpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:PayableAmount)') === '70.00', 'Totalul de rambursat trebuie să includă exact costul returului.');
nonVatUblAssert((string)$creditXpath->evaluate('string(//cac:BillingReference//cbc:ID)') === 'GT 900001', 'Factura de corecție trebuie să refere documentul original.');

if ((string)getenv('GTROTS_LIVE_ANAF_VALIDATE') === '1') {
    nonVatUblAssert((GtrotsInvoiceUbl::validateWithAnaf($xml)['stare'] ?? '') === 'ok', 'Validatorul oficial ANAF trebuie să accepte factura 380 neplătitoare de TVA.');
    nonVatUblAssert((GtrotsInvoiceUbl::validateWithAnaf($creditXml)['stare'] ?? '') === 'ok', 'Validatorul oficial ANAF trebuie să accepte factura de corecție 381 neplătitoare de TVA.');
    echo "Validatorul oficial ANAF a acceptat Invoice 380 și CreditNote 381 pentru firma neplătitoare de TVA.\n";
}

echo "invoice_ubl_nonvat_test: OK\n";
