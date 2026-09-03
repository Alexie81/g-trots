<?php
declare(strict_types=1);

/**
 * Generates UBL 2.1 invoices for the Romanian CIUS-RO profile.
 *
 * The generator keeps monetary totals at two decimals, enforces the Romanian
 * national cardinality/text limits used by the fields emitted here and sends
 * the final XML to ANAF's public validator before it is exposed in production.
 */
final class GtrotsInvoiceUbl
{
    public const CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1';
    private const NS_INVOICE = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
    private const NS_CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
    private const NS_CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';

    private const COUNTIES = [
        'alba' => 'AB', 'arad' => 'AR', 'arges' => 'AG', 'argeș' => 'AG', 'bacau' => 'BC', 'bacău' => 'BC',
        'bihor' => 'BH', 'bistrita-nasaud' => 'BN', 'bistrița-năsăud' => 'BN', 'botosani' => 'BT', 'botoșani' => 'BT',
        'brasov' => 'BV', 'brașov' => 'BV', 'braila' => 'BR', 'brăila' => 'BR', 'buzau' => 'BZ', 'buzău' => 'BZ',
        'caras-severin' => 'CS', 'caraș-severin' => 'CS', 'calarasi' => 'CL', 'călărași' => 'CL', 'cluj' => 'CJ',
        'constanta' => 'CT', 'constanța' => 'CT', 'covasna' => 'CV', 'dambovita' => 'DB', 'dâmbovița' => 'DB',
        'dolj' => 'DJ', 'galati' => 'GL', 'galați' => 'GL', 'giurgiu' => 'GR', 'gorj' => 'GJ', 'harghita' => 'HR',
        'hunedoara' => 'HD', 'ialomita' => 'IL', 'ialomița' => 'IL', 'iasi' => 'IS', 'iași' => 'IS', 'ilfov' => 'IF',
        'maramures' => 'MM', 'maramureș' => 'MM', 'mehedinti' => 'MH', 'mehedinți' => 'MH', 'mures' => 'MS',
        'mureș' => 'MS', 'neamt' => 'NT', 'neamț' => 'NT', 'olt' => 'OT', 'prahova' => 'PH', 'satu mare' => 'SM',
        'salaj' => 'SJ', 'sălaj' => 'SJ', 'sibiu' => 'SB', 'suceava' => 'SV', 'teleorman' => 'TR', 'timis' => 'TM',
        'timiș' => 'TM', 'tulcea' => 'TL', 'vaslui' => 'VS', 'valcea' => 'VL', 'vâlcea' => 'VL', 'vrancea' => 'VN',
        'bucuresti' => 'B', 'bucurești' => 'B', 'municipiul bucuresti' => 'B', 'municipiul bucurești' => 'B',
    ];

    public static function render(array $invoice): string
    {
        self::validateSource($invoice);
        $currency = strtoupper(trim((string)($invoice['currency'] ?? 'RON'))) ?: 'RON';
        $items = array_values((array)$invoice['items']);
        $lines = [];
        $taxGroups = [];
        foreach ($items as $index => $item) {
            $quantity = round((float)($item['quantity'] ?? 0), 4);
            $price = round((float)($item['unit_price'] ?? 0), 8);
            $discount = max(0.0, min(100.0, (float)($item['discount_percent'] ?? 0)));
            $net = round($quantity * $price * (1 - $discount / 100), 2);
            $rate = round(max(0.0, min(100.0, (float)($item['vat_rate'] ?? 0))), 2);
            $category = $rate > 0 ? 'S' : 'Z';
            $key = $category . ':' . self::decimal($rate, 2);
            if (!isset($taxGroups[$key])) $taxGroups[$key] = ['category' => $category, 'rate' => $rate, 'net' => 0.0, 'tax' => 0.0];
            $taxGroups[$key]['net'] = round($taxGroups[$key]['net'] + $net, 2);
            $base = round($quantity * $price, 2);
            $lines[] = ['index' => $index + 1, 'item' => $item, 'quantity' => $quantity, 'price' => $price, 'discount' => $discount, 'discount_amount' => round($base - $net, 2), 'base' => $base, 'net' => $net, 'rate' => $rate, 'category' => $category];
        }
        foreach ($taxGroups as &$group) $group['tax'] = round($group['net'] * $group['rate'] / 100, 2);
        unset($group);
        $exclusive = round(array_sum(array_column($lines, 'net')), 2);
        $tax = round(array_sum(array_column($taxGroups, 'tax')), 2);
        $inclusive = round($exclusive + $tax, 2);
        $declaredTotal = round((float)($invoice['total'] ?? $inclusive), 2);
        $rounding = round($declaredTotal - $inclusive, 2);
        $paid = (string)($invoice['status'] ?? 'unpaid') === 'paid' ? $declaredTotal : 0.0;
        $payable = round($inclusive + $rounding - $paid, 2);

        $document = new DOMDocument('1.0', 'UTF-8');
        $document->formatOutput = true;
        $root = $document->createElementNS(self::NS_INVOICE, 'Invoice');
        $root->setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:cac', self::NS_CAC);
        $root->setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:cbc', self::NS_CBC);
        $document->appendChild($root);

        self::cbc($document, $root, 'CustomizationID', self::CUSTOMIZATION_ID);
        self::cbc($document, $root, 'ID', self::invoiceId($invoice));
        self::cbc($document, $root, 'IssueDate', self::date((string)$invoice['issue_date'], 'Data emiterii'));
        if (trim((string)($invoice['due_date'] ?? '')) !== '') self::cbc($document, $root, 'DueDate', self::date((string)$invoice['due_date'], 'Data scadenței'));
        self::cbc($document, $root, 'InvoiceTypeCode', '380');
        if (trim((string)($invoice['notes'] ?? '')) !== '') self::cbc($document, $root, 'Note', self::text((string)$invoice['notes'], 300));
        self::cbc($document, $root, 'DocumentCurrencyCode', $currency);
        if ($currency !== 'RON') self::cbc($document, $root, 'TaxCurrencyCode', 'RON');

        $orderReference = trim((string)($invoice['order_reference'] ?? ''));
        if ($orderReference !== '') {
            $orderNode = self::cac($document, $root, 'OrderReference');
            self::cbc($document, $orderNode, 'ID', self::text($orderReference, 30));
        }

        self::party($document, self::cac($document, $root, 'AccountingSupplierParty'), (array)$invoice['seller'], true);
        self::party($document, self::cac($document, $root, 'AccountingCustomerParty'), (array)$invoice['buyer'], false);

        $payment = (array)($invoice['payment'] ?? []);
        $paymentMeans = self::cac($document, $root, 'PaymentMeans');
        self::cbc($document, $paymentMeans, 'PaymentMeansCode', mb_strtolower((string)($payment['method'] ?? ''), 'UTF-8') === 'card online' ? '48' : '10');
        self::cbc($document, $paymentMeans, 'PaymentID', self::text(self::invoiceId($invoice), 100));
        $iban = preg_replace('/\s+/', '', strtoupper((string)($payment['iban'] ?? '')));
        if ($iban !== '') {
            $account = self::cac($document, $paymentMeans, 'PayeeFinancialAccount');
            self::cbc($document, $account, 'ID', self::text($iban, 34));
            $bank = trim((string)($payment['bank_name'] ?? ''));
            if ($bank !== '') self::cbc($document, $account, 'Name', self::text($bank, 200));
        }

        $taxTotal = self::cac($document, $root, 'TaxTotal');
        self::amount($document, $taxTotal, 'TaxAmount', $tax, $currency);
        foreach ($taxGroups as $group) {
            $subtotal = self::cac($document, $taxTotal, 'TaxSubtotal');
            self::amount($document, $subtotal, 'TaxableAmount', $group['net'], $currency);
            self::amount($document, $subtotal, 'TaxAmount', $group['tax'], $currency);
            $category = self::cac($document, $subtotal, 'TaxCategory');
            self::cbc($document, $category, 'ID', $group['category']);
            self::cbc($document, $category, 'Percent', self::decimal($group['rate'], 2));
            $scheme = self::cac($document, $category, 'TaxScheme');
            self::cbc($document, $scheme, 'ID', 'VAT');
        }

        $totals = self::cac($document, $root, 'LegalMonetaryTotal');
        self::amount($document, $totals, 'LineExtensionAmount', $exclusive, $currency);
        self::amount($document, $totals, 'TaxExclusiveAmount', $exclusive, $currency);
        self::amount($document, $totals, 'TaxInclusiveAmount', $inclusive, $currency);
        if ($paid > 0) self::amount($document, $totals, 'PrepaidAmount', $paid, $currency);
        if (abs($rounding) >= 0.005) self::amount($document, $totals, 'PayableRoundingAmount', $rounding, $currency);
        self::amount($document, $totals, 'PayableAmount', $payable, $currency);

        foreach ($lines as $line) self::invoiceLine($document, $root, $line, $currency);
        $xml = $document->saveXML();
        if (!is_string($xml) || $xml === '') throw new RuntimeException('Fișierul UBL nu a putut fi generat.');
        return $xml;
    }

    public static function validateWithAnaf(string $xml, array $config = []): array
    {
        if (array_key_exists('anaf_validation_enabled', $config) && !$config['anaf_validation_enabled']) {
            return ['stare' => 'skipped', 'messages' => []];
        }
        $url = trim((string)($config['anaf_invoice_validation_url'] ?? 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1'));
        if ($url === '') throw new RuntimeException('Serviciul oficial de validare ANAF nu este configurat.');
        $body = '';
        $httpStatus = 0;
        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $xml, CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 25, CURLOPT_HTTPHEADER => ['Content-Type: text/plain; charset=UTF-8', 'Accept: application/json', 'User-Agent: G-Trots-RO-eFactura/1.0']]);
            $response = curl_exec($curl);
            $httpStatus = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            $curlError = curl_error($curl);
            curl_close($curl);
            if (!is_string($response)) throw new RuntimeException('Validatorul ANAF nu a răspuns: ' . ($curlError ?: 'eroare de rețea.'));
            $body = $response;
        } else {
            $context = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: text/plain; charset=UTF-8\r\nAccept: application/json\r\nUser-Agent: G-Trots-RO-eFactura/1.0\r\n", 'content' => $xml, 'timeout' => 25, 'ignore_errors' => true]]);
            $response = @file_get_contents($url, false, $context);
            if (!is_string($response)) throw new RuntimeException('Validatorul ANAF nu este disponibil momentan.');
            $body = $response;
            foreach ($http_response_header ?? [] as $header) if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $match)) $httpStatus = (int)$match[1];
        }
        if ($httpStatus < 200 || $httpStatus >= 300) throw new RuntimeException('Validatorul ANAF a răspuns cu eroarea HTTP ' . $httpStatus . '.');
        $result = json_decode($body, true);
        if (!is_array($result)) throw new RuntimeException('Răspunsul validatorului ANAF nu a putut fi interpretat.');
        $state = mb_strtolower(trim((string)($result['stare'] ?? '')), 'UTF-8');
        $messages = array_values(array_filter(array_map(static fn($item): string => trim((string)(is_array($item) ? ($item['message'] ?? '') : $item)), (array)($result['Messages'] ?? $result['messages'] ?? []))));
        if ($state !== 'ok') {
            throw new InvalidArgumentException('ANAF a respins XML-ul: ' . ($messages ? implode(' | ', array_slice($messages, 0, 8)) : 'validare nereușită.'));
        }
        return ['stare' => 'ok', 'messages' => [], 'trace_id' => (string)($result['trace_id'] ?? '')];
    }

    private static function validateSource(array $invoice): void
    {
        foreach ([['series', 'Seria facturii'], ['number', 'Numărul facturii'], ['issue_date', 'Data emiterii'], ['currency', 'Moneda']] as [$field, $label]) {
            if (trim((string)($invoice[$field] ?? '')) === '') throw new InvalidArgumentException($label . ' lipsește din e-Factură.');
        }
        if (!preg_match('/\d/', self::invoiceId($invoice))) throw new InvalidArgumentException('Numărul e-Facturii trebuie să conțină cel puțin o cifră.');
        if (mb_strlen(self::invoiceId($invoice), 'UTF-8') > 30) throw new InvalidArgumentException('Seria și numărul facturii depășesc limita ANAF de 30 de caractere (BT-1).');
        if (!preg_match('/^[A-Z]{3}$/', strtoupper((string)$invoice['currency']))) throw new InvalidArgumentException('Moneda facturii trebuie să fie un cod ISO 4217 valid.');
        $items = (array)($invoice['items'] ?? []);
        if (!$items) throw new InvalidArgumentException('e-Factura trebuie să conțină cel puțin o poziție.');
        if (count($items) > 999) throw new InvalidArgumentException('O e-Factură poate conține maximum 999 de poziții conform RO_CIUS.');
        foreach ($items as $index => $item) {
            if (trim((string)($item['name'] ?? '')) === '') throw new InvalidArgumentException('Denumirea produsului de la poziția ' . ($index + 1) . ' lipsește (BT-153).');
            if ((float)($item['quantity'] ?? 0) <= 0) throw new InvalidArgumentException('Cantitatea de la poziția ' . ($index + 1) . ' trebuie să fie pozitivă.');
            if ((float)($item['unit_price'] ?? 0) < 0) throw new InvalidArgumentException('Prețul de la poziția ' . ($index + 1) . ' nu poate fi negativ.');
        }
        self::validateParty((array)($invoice['seller'] ?? []), 'vânzătorului');
        self::validateParty((array)($invoice['buyer'] ?? []), 'cumpărătorului');
    }

    private static function validateParty(array $party, string $label): void
    {
        foreach (['name' => 'Numele ', 'address' => 'Adresa ', 'city' => 'Localitatea '] as $field => $prefix) {
            if (trim((string)($party[$field] ?? '')) === '') throw new InvalidArgumentException($prefix . $label . ' lipsește din e-Factură.');
        }
        if ($label === 'vânzătorului' && self::taxId((string)($party['cui'] ?? '')) === '') throw new InvalidArgumentException('CUI-ul vânzătorului lipsește din e-Factură.');
        self::countyCode((string)($party['county'] ?? ''), (string)($party['city'] ?? ''), (string)($party['postal_code'] ?? ''));
    }

    private static function party(DOMDocument $document, DOMElement $container, array $party, bool $seller): void
    {
        $partyNode = self::cac($document, $container, 'Party');
        $tradeName = trim((string)($party['trade_name'] ?? ''));
        if ($tradeName !== '') {
            $nameNode = self::cac($document, $partyNode, 'PartyName');
            self::cbc($document, $nameNode, 'Name', self::text($tradeName, 200));
        }
        $address = self::cac($document, $partyNode, 'PostalAddress');
        self::cbc($document, $address, 'StreetName', self::text((string)$party['address'], 150));
        $city = self::normalizedCity((string)$party['city'], (string)($party['county'] ?? ''), (string)($party['postal_code'] ?? ''));
        self::cbc($document, $address, 'CityName', self::text($city, 50));
        $postalCode = trim((string)($party['postal_code'] ?? ''));
        if ($postalCode !== '') self::cbc($document, $address, 'PostalZone', self::text($postalCode, 20));
        self::cbc($document, $address, 'CountrySubentity', self::countyCode((string)($party['county'] ?? ''), $city, $postalCode));
        $country = self::cac($document, $address, 'Country');
        self::cbc($document, $country, 'IdentificationCode', 'RO');

        $cui = self::taxId((string)($party['cui'] ?? ''));
        $vatPayer = !empty($party['vat_payer']) || str_starts_with(strtoupper(trim((string)($party['cui'] ?? ''))), 'RO');
        if ($seller || $cui !== '') {
            $tax = self::cac($document, $partyNode, 'PartyTaxScheme');
            self::cbc($document, $tax, 'CompanyID', $vatPayer ? 'RO' . $cui : ($cui ?: '0000000000000'));
            $scheme = self::cac($document, $tax, 'TaxScheme');
            self::cbc($document, $scheme, 'ID', $vatPayer ? 'VAT' : 'FC');
        }
        $legal = self::cac($document, $partyNode, 'PartyLegalEntity');
        self::cbc($document, $legal, 'RegistrationName', self::text((string)$party['name'], 200));
        self::cbc($document, $legal, 'CompanyID', $cui ?: '0000000000000');
        $legalDetails = array_filter([
            trim((string)($party['registration_number'] ?? '')),
            trim((string)($party['share_capital'] ?? '')) !== '' ? 'Capital social: ' . trim((string)$party['share_capital']) : '',
        ]);
        if ($seller && $legalDetails) self::cbc($document, $legal, 'CompanyLegalForm', self::text(implode(' # ', $legalDetails), 1000));
        if (trim((string)($party['email'] ?? $party['phone'] ?? '')) !== '') {
            $contact = self::cac($document, $partyNode, 'Contact');
            if (trim((string)($party['phone'] ?? '')) !== '') self::cbc($document, $contact, 'Telephone', self::text((string)$party['phone'], 100));
            if (trim((string)($party['email'] ?? '')) !== '') self::cbc($document, $contact, 'ElectronicMail', self::text((string)$party['email'], 100));
        }
    }

    private static function invoiceLine(DOMDocument $document, DOMElement $root, array $line, string $currency): void
    {
        $item = (array)$line['item'];
        $node = self::cac($document, $root, 'InvoiceLine');
        self::cbc($document, $node, 'ID', (string)$line['index']);
        $quantity = self::cbc($document, $node, 'InvoicedQuantity', self::decimal($line['quantity'], 4));
        $quantity->setAttribute('unitCode', 'C62');
        self::amount($document, $node, 'LineExtensionAmount', $line['net'], $currency);
        if ((float)($line['discount_amount'] ?? 0) > 0) {
            $allowance = self::cac($document, $node, 'AllowanceCharge');
            self::cbc($document, $allowance, 'ChargeIndicator', 'false');
            self::cbc($document, $allowance, 'AllowanceChargeReason', 'Reducere comercială');
            self::cbc($document, $allowance, 'MultiplierFactorNumeric', self::decimal((float)$line['discount'] / 100, 8));
            self::amount($document, $allowance, 'Amount', (float)$line['discount_amount'], $currency);
            self::amount($document, $allowance, 'BaseAmount', (float)$line['base'], $currency);
        }
        $itemNode = self::cac($document, $node, 'Item');
        $fullName = trim((string)$item['name']);
        if (mb_strlen($fullName, 'UTF-8') > 100) self::cbc($document, $itemNode, 'Description', self::text($fullName, 200));
        self::cbc($document, $itemNode, 'Name', self::text($fullName, 100));
        $sku = trim((string)($item['sku'] ?? ''));
        if ($sku !== '') {
            $identification = self::cac($document, $itemNode, 'SellersItemIdentification');
            self::cbc($document, $identification, 'ID', self::text($sku, 100));
        }
        $tax = self::cac($document, $itemNode, 'ClassifiedTaxCategory');
        self::cbc($document, $tax, 'ID', (string)$line['category']);
        self::cbc($document, $tax, 'Percent', self::decimal($line['rate'], 2));
        $scheme = self::cac($document, $tax, 'TaxScheme');
        self::cbc($document, $scheme, 'ID', 'VAT');
        $price = self::cac($document, $node, 'Price');
        $amount = self::cbc($document, $price, 'PriceAmount', self::decimal($line['price'], 8));
        $amount->setAttribute('currencyID', $currency);
        $base = self::cbc($document, $price, 'BaseQuantity', '1');
        $base->setAttribute('unitCode', 'C62');
    }

    private static function invoiceId(array $invoice): string
    {
        return trim((string)($invoice['series'] ?? '') . (string)($invoice['number'] ?? ''));
    }

    private static function taxId(string $value): string
    {
        return preg_replace('/\D+/', '', strtoupper(trim($value))) ?: '';
    }

    private static function countyCode(string $county, string $city, string $postalCode): string
    {
        $normalized = mb_strtolower(trim($county), 'UTF-8');
        $normalized = preg_replace('/\s+/', ' ', str_replace(['județul ', 'judetul ', 'jud. '], '', $normalized)) ?: $normalized;
        $code = self::COUNTIES[$normalized] ?? '';
        if ($code === '' && preg_match('/^(?:RO-)?([A-Z]{1,2})$/i', trim($county), $match)) $code = strtoupper($match[1]);
        if ($code === '') throw new InvalidArgumentException('Județul „' . trim($county) . '” nu poate fi transformat în codul ISO 3166-2 cerut de ANAF.');
        if ($code === 'B' && !preg_match('/^SECTOR[1-6]$/', self::normalizedCity($city, $county, $postalCode))) {
            throw new InvalidArgumentException('Pentru București, localitatea trebuie să indice Sector 1–6 sau codul poștal trebuie să permită determinarea sectorului.');
        }
        return 'RO-' . $code;
    }

    private static function normalizedCity(string $city, string $county, string $postalCode): string
    {
        $countyKey = mb_strtolower(trim($county), 'UTF-8');
        $isBucharest = in_array($countyKey, ['bucuresti', 'bucurești', 'municipiul bucuresti', 'municipiul bucurești', 'b', 'ro-b'], true);
        if (!$isBucharest) return trim($city);
        if (preg_match('/sector(?:ul)?\s*([1-6])/iu', $city . ' ' . $county, $match)) return 'SECTOR' . $match[1];
        $digits = preg_replace('/\D+/', '', $postalCode);
        if (strlen($digits) === 6 && $digits[0] === '0' && in_array($digits[1], ['1', '2', '3', '4', '5', '6'], true)) return 'SECTOR' . $digits[1];
        return trim($city);
    }

    private static function date(string $value, string $label): string
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', substr(trim($value), 0, 10));
        if (!$date) throw new InvalidArgumentException($label . ' nu are formatul corect AAAA-LL-ZZ.');
        return $date->format('Y-m-d');
    }

    private static function text(string $value, int $maximum): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
        if (mb_strlen($value, 'UTF-8') <= $maximum) return $value;
        return rtrim(mb_substr($value, 0, max(1, $maximum - 1), 'UTF-8')) . '…';
    }

    private static function decimal(float $value, int $maximumDecimals): string
    {
        $formatted = number_format($value, $maximumDecimals, '.', '');
        $formatted = rtrim(rtrim($formatted, '0'), '.');
        return $formatted === '-0' || $formatted === '' ? '0' : $formatted;
    }

    private static function cac(DOMDocument $document, DOMElement $parent, string $name): DOMElement
    {
        $element = $document->createElementNS(self::NS_CAC, 'cac:' . $name);
        $parent->appendChild($element);
        return $element;
    }

    private static function cbc(DOMDocument $document, DOMElement $parent, string $name, string $value): DOMElement
    {
        $element = $document->createElementNS(self::NS_CBC, 'cbc:' . $name);
        $element->appendChild($document->createTextNode($value));
        $parent->appendChild($element);
        return $element;
    }

    private static function amount(DOMDocument $document, DOMElement $parent, string $name, float $value, string $currency): DOMElement
    {
        $element = self::cbc($document, $parent, $name, number_format(round($value, 2), 2, '.', ''));
        $element->setAttribute('currencyID', $currency);
        return $element;
    }
}
