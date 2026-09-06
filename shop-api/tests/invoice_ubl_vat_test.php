<?php
declare(strict_types=1);

require_once __DIR__ . '/../invoice-ubl.php';

function vatUblAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function vatUblXpath(string $xml): DOMXPath
{
    $document = new DOMDocument();
    vatUblAssert($document->loadXML($xml), 'Documentul UBL trebuie să fie XML valid.');
    $xpath = new DOMXPath($document);
    $xpath->registerNamespace('cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2');
    $xpath->registerNamespace('cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2');
    return $xpath;
}

$invoice = [
    'series' => 'GT',
    'number' => '910001',
    'issue_date' => '2026-09-06',
    'due_date' => '2026-09-13',
    'currency' => 'RON',
    'status' => 'unpaid',
    'total' => 121.00,
    'order_reference' => 'TEST-VAT-21',
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
        'vat_payer' => true,
    ],
    'buyer' => [
        'name' => 'DANTE INTERNATIONAL S.A.',
        'cui' => 'RO14399840',
        'address' => 'Str. Exemplu nr. 1',
        'city' => 'Cluj-Napoca',
        'county' => 'Cluj',
        'postal_code' => '400001',
        'country' => 'România',
        'email' => 'client@example.invalid',
        'vat_payer' => true,
    ],
    'payment' => ['method' => 'Card online'],
    'items' => [
        ['name' => 'Produs cu reducere', 'sku' => 'VAT-PROD', 'quantity' => 2, 'unit_price' => 50, 'discount_percent' => 10, 'vat_rate' => 21],
        ['name' => 'Serviciu de livrare – Curier', 'sku' => 'TRANSPORT', 'quantity' => 1, 'unit_price' => 10, 'discount_percent' => 0, 'vat_rate' => 21],
    ],
];

$xml = GtrotsInvoiceUbl::render($invoice);
$xpath = vatUblXpath($xml);
vatUblAssert((string)$xpath->evaluate('string(//cac:TaxSubtotal/cac:TaxCategory/cbc:ID)') === 'S', 'Operațiunea taxabilă trebuie să folosească categoria S.');
vatUblAssert(abs((float)$xpath->evaluate('string(//cac:TaxSubtotal/cac:TaxCategory/cbc:Percent)') - 21.0) < 0.001, 'UBL trebuie să preia exact cota configurată de 21%.');
vatUblAssert((string)$xpath->evaluate('string(//cac:TaxTotal/cbc:TaxAmount)') === '21.00', 'TVA-ul total trebuie calculat exact din baza de 100 RON.');
vatUblAssert((string)$xpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount)') === '100.00', 'Valoarea netă trebuie să fie 100 RON.');
vatUblAssert((string)$xpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount)') === '121.00', 'Valoarea brută trebuie să fie 121 RON.');
vatUblAssert((string)$xpath->evaluate('string(//cac:AccountingSupplierParty//cac:PartyTaxScheme/cbc:CompanyID)') === 'RO49972605', 'Identificatorul fiscal al plătitorului de TVA trebuie să includă prefixul RO o singură dată.');
vatUblAssert($xpath->query('//cac:InvoiceLine/cac:AllowanceCharge[cbc:ChargeIndicator="false"]')->length === 1, 'Reducerea comercială trebuie declarată explicit pe linie.');

$creditNote = $invoice;
$creditNote['series'] = 'GTR';
$creditNote['number'] = '910002';
$creditNote['status'] = 'return';
$creditNote['total'] = 96.80;
$creditNote['return_shipping_cost'] = 24.20;
$creditNote['return_shipping_cost_vat_rate'] = 21;
$creditNote['items'] = [['name' => 'Produs returnat', 'sku' => 'VAT-RET', 'quantity' => 1, 'unit_price' => 100, 'discount_percent' => 0, 'vat_rate' => 21]];
$creditNote['related_invoice'] = ['series' => 'GT', 'number' => '910001', 'date' => '2026-09-06'];
$creditXml = GtrotsInvoiceUbl::render($creditNote);
$creditXpath = vatUblXpath($creditXml);
vatUblAssert((string)$creditXpath->evaluate('string(/*/cbc:CreditNoteTypeCode)') === '381', 'Corecția trebuie să folosească tipul 381.');
vatUblAssert(abs((float)$creditXpath->evaluate('string(//cac:TaxSubtotal/cac:TaxCategory/cbc:Percent)') - 21.0) < 0.001, 'Factura de corecție trebuie să păstreze cota configurată.');
vatUblAssert((string)$creditXpath->evaluate('string(//cac:TaxTotal/cbc:TaxAmount)') === '16.80', 'TVA-ul corecției trebuie redus proporțional cu taxa costului de retur.');
vatUblAssert((string)$creditXpath->evaluate('string(//cac:AllowanceCharge[cbc:ChargeIndicator="false"]/cbc:Amount)') === '20.00', 'Costul brut de retur de 24,20 RON trebuie separat în baza netă de 20 RON.');
vatUblAssert((string)$creditXpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:PayableAmount)') === '96.80', 'Totalul corecției cu cost de retur trebuie să fie exact.');

if ((string)getenv('GTROTS_LIVE_ANAF_VALIDATE') === '1') {
    vatUblAssert((GtrotsInvoiceUbl::validateWithAnaf($xml)['stare'] ?? '') === 'ok', 'Validatorul oficial ANAF trebuie să accepte factura 380 cu TVA configurabil.');
    vatUblAssert((GtrotsInvoiceUbl::validateWithAnaf($creditXml)['stare'] ?? '') === 'ok', 'Validatorul oficial ANAF trebuie să accepte factura 381 cu TVA configurabil.');
    echo "Validatorul oficial ANAF a acceptat Invoice 380 și CreditNote 381 cu TVA 21%.\n";
}

echo "invoice_ubl_vat_test: OK\n";
