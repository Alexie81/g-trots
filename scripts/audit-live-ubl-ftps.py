from __future__ import annotations

from ftplib import FTP_TLS
from getpass import getpass
from io import BytesIO
import json
import os
import secrets
import ssl
from urllib.parse import urlencode
from urllib.request import Request, urlopen


REMOTE_ROOT = "/g-trots.ro/shop-api"
PUBLIC_ROOT = "https://g-trots.ro/shop-api"


def connect() -> FTP_TLS:
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=90)
    ftp.connect(os.environ.get("GT_FTP_HOST", "ftp.cab-it.ro"), int(os.environ.get("GT_FTP_PORT", "21")))
    username = os.environ.get("GT_FTP_USER", "").strip()
    if not username:
        raise RuntimeError("Lipsește utilizatorul FTPS (GT_FTP_USER).")
    ftp.login(username, os.environ.get("GT_FTP_PASS", "") or getpass("Parola FTPS: "))
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(REMOTE_ROOT)
    return ftp


def request_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "G-Trots UBL audit"})
    with urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    token = secrets.token_urlsafe(32)
    filename = f"ubl-audit-{secrets.token_hex(8)}.php"
    php = f"""<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!hash_equals('{token}', (string)($_GET['token'] ?? ''))) {{ http_response_code(404); exit; }}
define('GTROTS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';
require_once __DIR__ . '/invoice-ubl.php';
try {{
    $config = shopConfig();
    $db = shopDb($config);
    ensureShopSchema($db);
    $company = $db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch();
    if (!$company) throw new RuntimeException('Datele firmei nu sunt configurate.');
    $seller = [
        'name' => (string)$company['legal_name'],
        'trade_name' => (string)($company['trade_name'] ?? ''),
        'cui' => (string)$company['cui'],
        'registration_number' => (string)($company['registration_number'] ?? ''),
        'address' => (string)($company['address'] ?? ''),
        'city' => (string)($company['city'] ?? ''),
        'county' => (string)($company['county'] ?? ''),
        'postal_code' => (string)($company['postal_code'] ?? ''),
        'country' => (string)($company['country'] ?? 'România'),
        'email' => (string)($company['email'] ?? ''),
        'phone' => (string)($company['phone'] ?? ''),
        'bank_name' => (string)($company['bank_name'] ?? ''),
        'iban' => (string)($company['iban'] ?? ''),
        'share_capital' => (string)($company['share_capital'] ?? ''),
        'vat_payer' => !empty($company['vat_payer']),
    ];
    $buyer = [
        'name' => 'Client persoană fizică test validator',
        'cui' => '',
        'address' => 'Strada Exemplu nr. 1',
        'city' => 'Cluj-Napoca',
        'county' => 'Cluj',
        'postal_code' => '400001',
        'country' => 'România',
        'email' => 'validator@example.invalid',
        'phone' => '0700000000',
        'vat_payer' => false,
    ];
    $stamp = gmdate('YmdHis');
    $invoice = [
        'series' => 'AUD',
        'number' => $stamp . '1',
        'issue_date' => date('Y-m-d'),
        'due_date' => date('Y-m-d'),
        'currency' => 'RON',
        'status' => 'unpaid',
        'total' => 129.99,
        'order_reference' => 'AUDIT-' . $stamp,
        'seller' => $seller,
        'buyer' => $buyer,
        'payment' => ['method' => 'Ramburs la curier', 'iban' => (string)($company['iban'] ?? ''), 'bank_name' => (string)($company['bank_name'] ?? '')],
        'items' => [
            ['name' => str_repeat('Produs cu denumire lungă pentru verificarea limitei UBL și ANAF ', 3), 'sku' => 'AUDIT-LONG-NAME', 'quantity' => 3, 'unit_price' => 33.33333333, 'discount_percent' => 0, 'vat_rate' => !empty($company['vat_payer']) ? (float)$company['vat_rate'] : 0],
            ['name' => 'Serviciu de livrare – Curier', 'sku' => 'TRANSPORT', 'quantity' => 1, 'unit_price' => 29.99, 'discount_percent' => 0, 'vat_rate' => !empty($company['vat_payer']) ? (float)$company['vat_rate'] : 0],
        ],
    ];
    if (!empty($company['vat_payer'])) {{
        $rate = (float)$company['vat_rate'];
        $invoice['items'][0]['unit_price'] = round(100 / (1 + $rate / 100) / 3, 8);
        $invoice['items'][1]['unit_price'] = round(29.99 / (1 + $rate / 100), 8);
    }}
    $xml = GtrotsInvoiceUbl::render($invoice);
    $invoiceValidation = GtrotsInvoiceUbl::validateWithAnaf($xml, $config);
    $document = new DOMDocument();
    $document->loadXML($xml, LIBXML_NONET);
    $xpath = new DOMXPath($document);
    $xpath->registerNamespace('cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2');
    $xpath->registerNamespace('cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2');
    $names = [];
    foreach ($xpath->query('//cac:InvoiceLine/cac:Item/cbc:Name') ?: [] as $name) $names[] = mb_strlen((string)$name->textContent, 'UTF-8');

    $credit = $invoice;
    $credit['number'] = $stamp . '2';
    $credit['status'] = 'return';
    $credit['total'] = 80.00;
    $credit['return_shipping_cost'] = 20.00;
    $credit['return_shipping_cost_vat_rate'] = !empty($company['vat_payer']) ? (float)$company['vat_rate'] : 0;
    $credit['items'] = [['name' => 'Produs returnat', 'sku' => 'AUDIT-RET', 'quantity' => 1, 'unit_price' => !empty($company['vat_payer']) ? round(100 / (1 + (float)$company['vat_rate'] / 100), 8) : 100, 'discount_percent' => 0, 'vat_rate' => !empty($company['vat_payer']) ? (float)$company['vat_rate'] : 0]];
    $credit['related_invoice'] = ['series' => $invoice['series'], 'number' => $invoice['number'], 'date' => $invoice['issue_date']];
    $creditXml = GtrotsInvoiceUbl::render($credit);
    $creditValidation = GtrotsInvoiceUbl::validateWithAnaf($creditXml, $config);

    echo json_encode([
        'ok' => true,
        'company' => [
            'legal_name' => (string)$company['legal_name'],
            'trade_name' => (string)($company['trade_name'] ?? ''),
            'cui' => (string)$company['cui'],
            'registration_number' => (string)($company['registration_number'] ?? ''),
            'vat_payer' => !empty($company['vat_payer']),
            'vat_rate' => (float)($company['vat_rate'] ?? 0),
            'address_present' => trim((string)($company['address'] ?? '')) !== '',
            'city' => (string)($company['city'] ?? ''),
            'county' => (string)($company['county'] ?? ''),
            'postal_code_present' => trim((string)($company['postal_code'] ?? '')) !== '',
            'iban_present' => trim((string)($company['iban'] ?? '')) !== '',
        ],
        'invoice_380_validation' => $invoiceValidation,
        'credit_note_381_validation' => $creditValidation,
        'customization_id' => GtrotsInvoiceUbl::CUSTOMIZATION_ID,
        'item_name_lengths' => $names,
        'invoice_line_count' => (int)$xpath->evaluate('count(//cac:InvoiceLine)'),
        'line_extension_amount' => (string)$xpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:LineExtensionAmount)'),
        'tax_inclusive_amount' => (string)$xpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount)'),
        'payable_amount' => (string)$xpath->evaluate('string(//cac:LegalMonetaryTotal/cbc:PayableAmount)'),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}} catch (Throwable $error) {{
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}}
"""

    ftp = connect()
    try:
        ftp.storbinary(f"STOR {filename}", BytesIO(php.encode("utf-8")), blocksize=262144)
        result = request_json(f"{PUBLIC_ROOT}/{filename}?{urlencode({'token': token})}")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get("ok"):
            raise SystemExit(1)
    finally:
        try:
            ftp.delete(filename)
        finally:
            try:
                ftp.quit()
            except Exception:
                ftp.close()


if __name__ == "__main__":
    main()
