<?php
declare(strict_types=1);

require_once __DIR__ . '/product-export.php';
require_once __DIR__ . '/invoice-service.php';

/** Export only: never issue invoices, change stock, send mail or call the SPV worker. */
final class GtrotsInvoiceExport
{
    public static function download(PDO $db, array $input, array $config = []): array
    {
        [$from, $to] = self::range((string)($input['from'] ?? ''), (string)($input['to'] ?? ''));
        $complete = filter_var($input['include_documents'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $where = $from === '' ? '' : 'WHERE i.issue_date >= ? AND i.issue_date <= ?';
        $stmt = $db->prepare('SELECT i.*,o.order_number,o.payment_status,o.payment_method,o.stripe_paid_at,o.customer_email,o.customer_phone
            FROM shop_invoices i LEFT JOIN shop_orders o ON o.id=i.order_id ' . $where . ' ORDER BY i.issue_date,i.issued_at,i.id');
        $stmt->execute($from === '' ? [] : [$from,$to]);
        $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Do not reuse listInvoices: that endpoint has a UI limit of 1,000 records.
        $rows = [];
        $path = $complete ? tempnam(sys_get_temp_dir(), 'gt-invoice-export-') : false;
        $zip = null; $fallback = []; $folders = [];
        try {
            if ($complete && class_exists('ZipArchive')) {
                $zip = new ZipArchive();
                if ($path === false || $zip->open($path, ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Arhiva nu poate fi creată.');
            }
            $add = static function (string $name, string $bytes) use (&$zip, &$fallback): void {
                if ($zip) { if (!$zip->addFromString($name, $bytes)) throw new RuntimeException('Documentul nu poate fi adăugat în arhivă.'); }
                else $fallback[$name] = $bytes;
            };
            foreach ($invoices as $invoice) {
                $payload = GtrotsInvoiceService::snapshotForExport($db, $invoice);
                $rows[] = self::registryRow($invoice, $payload);
                if (!$complete) continue;
                $folder = self::folder($invoice);
                if (isset($folders[$folder])) throw new RuntimeException('Două facturi au același nume de folder la export: ' . $folder);
                $folders[$folder] = true;
                // Render the existing snapshot. XML validation/upload is not a prerequisite for a local export.
                require_once __DIR__ . '/invoice-pdf.php';
                require_once __DIR__ . '/invoice-xlsx.php';
                require_once __DIR__ . '/invoice-ubl.php';
                try {
                    $add($folder . '/' . $folder . '.pdf', GtrotsInvoicePdf::render($payload));
                    $add($folder . '/' . $folder . '.xlsx', GtrotsInvoiceXlsx::render($payload));
                    $add($folder . '/' . $folder . ' - RO_e-Factura.xml', GtrotsInvoiceUbl::render($payload));
                } catch (Throwable $error) {
                    throw new RuntimeException('Exportul facturii ' . $folder . ' nu a putut fi finalizat: ' . $error->getMessage(), 0, $error);
                }
            }
            $registry = GtrotsProductExport::table('Facturi emise', self::headers(), $rows, self::widths(),
                ($from === '' ? 'Toată perioada' : $from . ' — ' . $to) . ' · Facturi pozitive și retururi. Stare SPV: trimisă numai după confirmarea ANAF.');
            $filename = 'Centralizator-facturi-' . ($from === '' ? 'toata-perioada' : $from . '_' . $to);
            if ($complete) {
                $add($filename . '.xlsx', $registry);
                if ($zip) {
                    if (!$zip->close()) throw new RuntimeException('Arhiva nu a putut fi finalizată.');
                    $zip = null;
                    $bytes = file_get_contents($path);
                    if (!is_string($bytes)) throw new RuntimeException('Arhiva nu a putut fi citită.');
                } else $bytes = shopNirBuildZip($fallback);
            } else $bytes = $registry;
            return ['file_name' => $filename . ($complete ? '.zip' : '.xlsx'), 'mime_type' => $complete ? 'application/zip' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'content_base64' => base64_encode($bytes),'item_count' => count($invoices)];
        } finally {
            if ($zip) $zip->close();
            if ($path !== false && is_file($path)) unlink($path);
        }
    }

    public static function range(string $from, string $to): array
    {
        if ($from === '' && $to === '') return ['', ''];
        foreach ([$from,$to] as $value) {
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
            if (!$date || $date->format('Y-m-d') !== $value) throw new InvalidArgumentException('Completează un interval valid, în format AAAA-LL-ZZ.');
        }
        if ($from > $to) throw new InvalidArgumentException('Data de început trebuie să fie înaintea datei de sfârșit.');
        return [$from,$to];
    }

    public static function folder(array $invoice): string
    {
        $name = (string)$invoice['series'] . '-' . (string)$invoice['invoice_number'];
        $name = preg_replace('/[\\\\\/:*?"<>|\x00-\x1F]/u', '-', $name) ?? '';
        $name = trim($name, ". \t\n\r\0\x0B");
        if ($name === '') throw new InvalidArgumentException('Factura nu are serie și număr valide.');
        return $name;
    }

    public static function headers(): array
    {
        return ['Factură','Stare SPV','Tip document','Data emiterii','Ora emiterii','Scadență','Serie','Număr','Comandă','Factură de referință',
            'Client','Tip client','CUI client','Nr. Registrul Comerțului','Adresă client','Localitate','Județ','Cod poștal','Țară','E-mail','Telefon',
            'Monedă','Bază fără TVA','TVA','Total factură','Starea plății','Metoda de plată','Data plății','Data trimiterii SPV','ID încărcare SPV','Detalii stare SPV','E-mail factură trimis la',
            'Emitent','CUI emitent','IBAN emitent','Bancă emitent','Observații','Poziții factură'];
    }

    public static function widths(): array
    {
        return [22,18,20,18,18,18,16,16,32,25,35,15,20,24,45,23,20,18,18,35,23,14,20,20,20,20,25,23,25,26,23,27,35,20,35,30,55,65];
    }

    public static function registryRow(array $invoice, array $payload): array
    {
        $buyer = $payload['buyer'] ?? []; $seller = $payload['seller'] ?? []; $payment = $payload['payment'] ?? [];
        $return = ($invoice['invoice_type'] ?? '') === 'return' || ($invoice['document_status'] ?? '') === 'return';
        $base = 0.0; $vat = 0.0; $lines = [];
        foreach ($payload['items'] ?? [] as $item) {
            $net = round(abs((float)$item['quantity'] * (float)$item['unit_price']) * (1 - max(0,min(100,(float)($item['discount_percent'] ?? 0)))/100), 2);
            $base += $net; $vat += round($net * (float)($item['vat_rate'] ?? 0)/100, 2);
            $lines[] = ($item['sku'] ?? '') . ' · ' . ($item['name'] ?? '') . ' · ' . ($item['quantity'] ?? 0) . ' ' . ($item['unit'] ?? 'buc.') . ' × ' . ($item['unit_price'] ?? 0) . ' · TVA ' . ($item['vat_rate'] ?? 0) . '% · reducere ' . ($item['discount_percent'] ?? 0) . '%';
        }
        $related = $payload['related_invoice'] ?? [];
        return [self::folder($invoice), ($invoice['spv_status'] ?? '') === 'sent' ? 'Trimisă' : 'Netrimisă', $return ? 'Retur / storno' : 'Factură fiscală',
            $invoice['issue_date'],substr((string)$invoice['issued_at'],11),$invoice['due_date'] ?? '',$invoice['series'],(string)$invoice['invoice_number'],
            $payload['order_reference'] ?? $invoice['order_number'] ?? '',trim(($related['series'] ?? '') . ' ' . ($related['number'] ?? '')),
            $buyer['name'] ?? $invoice['buyer_name'] ?? '',($buyer['type'] ?? '') === 'company' ? 'PJ' : 'PF',$buyer['cui'] ?? '',$buyer['registration_number'] ?? '',$buyer['address'] ?? '',$buyer['city'] ?? '',$buyer['county'] ?? '',$buyer['postal_code'] ?? '',$buyer['country'] ?? '',$buyer['email'] ?? '',$buyer['phone'] ?? '',
            $invoice['currency'],round($return ? -$base : $base,2),round($return ? -$vat : $vat,2),(float)$invoice['total'],
            $return ? 'Retur' : (($payload['status'] ?? '') === 'paid' ? 'Plătită' : 'Neplătită'),$payment['method'] ?? '',$payment['paid_at'] ?? '',$invoice['spv_sent_at'] ?? '',$invoice['spv_submission_id'] ?? '',
            ['sent'=>'Acceptată','processing'=>'În procesare','rejected'=>'Respinsă','error'=>'Eroare','not_sent'=>'Netrimisă'][$invoice['spv_status'] ?? 'not_sent'] ?? 'Netrimisă',$invoice['email_sent_at'] ?? '',
            $seller['name'] ?? '',$seller['cui'] ?? '',$seller['iban'] ?? $payment['iban'] ?? '',$seller['bank_name'] ?? $payment['bank_name'] ?? '',$payload['notes'] ?? '',implode("\n",$lines)];
    }
}
