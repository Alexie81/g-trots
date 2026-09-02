<?php
declare(strict_types=1);

/**
 * G-Trots invoice PDF generator.
 *
 * Public API:
 *   GtrotsInvoicePdf::html($invoice)   -> printable HTML
 *   GtrotsInvoicePdf::render($invoice) -> raw PDF bytes
 *   GtrotsInvoicePdf::save($invoice, $absolutePath)
 *   GtrotsInvoicePdf::renderPinned($db, $invoice) -> immutable themed PDF
 *
 * Supported statuses: unpaid, paid, return.
 * Supported themes: orange, green, red, purple.
 * Select independently with $invoice['status'] and $invoice['theme'].
 */

require_once __DIR__ . '/invoice-theme.php';

$gtrotsDompdfPhar = __DIR__ . '/lib/dompdf-runtime.phar';
$gtrotsDompdfAutoload = __DIR__ . '/lib/dompdf/autoload.inc.php';
if (is_file($gtrotsDompdfPhar)) {
    require_once 'phar://' . $gtrotsDompdfPhar . '/autoload.inc.php';
} elseif (is_file($gtrotsDompdfAutoload)) {
    require_once $gtrotsDompdfAutoload;
} else {
    throw new RuntimeException('Motorul PDF Dompdf nu este instalat.');
}

use Dompdf\Dompdf;
use Dompdf\FontMetrics;
use Dompdf\Options;

final class GtrotsInvoicePdf
{
    private const STATUS_ALIASES = [
        'unpaid' => 'unpaid',
        'neplatita' => 'unpaid',
        'neplătită' => 'unpaid',
        'issued' => 'unpaid',
        'paid' => 'paid',
        'platita' => 'paid',
        'plătită' => 'paid',
        'return' => 'return',
        'retur' => 'return',
        'credit_note' => 'return',
        'storno' => 'return',
    ];

    private const STATUS = [
        'unpaid' => [
            'label' => 'NEPLĂTITĂ',
            'title' => 'FACTURĂ',
            'accent' => '#ff8a00',
            'accent_dark' => '#d96500',
            'soft' => '#fff3e2',
            'ink' => '#7a3300',
            'summary' => 'TOTAL DE PLATĂ',
            'message' => 'Factura este emisă și așteaptă încasarea.',
            'mark' => '',
        ],
        'paid' => [
            'label' => 'PLĂTITĂ',
            'title' => 'FACTURĂ',
            'accent' => '#19a86b',
            'accent_dark' => '#08794a',
            'soft' => '#e9f8f1',
            'ink' => '#075c3a',
            'summary' => 'TOTAL ACHITAT',
            'message' => 'Încasare confirmată. Soldul facturii este zero.',
            'mark' => 'ACHITAT',
        ],
        'return' => [
            'label' => 'FACTURĂ DE RETUR',
            'title' => 'FACTURĂ DE RETUR',
            'accent' => '#ef4056',
            'accent_dark' => '#b91f36',
            'soft' => '#fff0f2',
            'ink' => '#8f1428',
            'summary' => 'TOTAL DE RESTITUIT',
            'message' => 'Valori corective aferente bunurilor returnate.',
            'mark' => 'RETUR',
        ],
    ];

    public static function render(array $invoice): string
    {
        $document = self::normalize($invoice);
        $options = new Options();
        $options->set('isRemoteEnabled', false);
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isPhpEnabled', false);
        $options->set('isJavascriptEnabled', false);
        $options->set('isFontSubsettingEnabled', true);
        $options->set('defaultFont', 'DejaVu Sans');
        $options->setChroot([__DIR__, dirname(__DIR__)]);

        $dompdf = new Dompdf($options);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->loadHtml(self::documentHtml($document), 'UTF-8');
        $dompdf->render();

        $canvas = $dompdf->getCanvas();
        $metrics = $dompdf->getFontMetrics();
        $footer = $document['series'] . ' ' . $document['number'];
        $status = self::STATUS[$document['status']]['label'];
        $canvas->page_script(static function (int $pageNumber, int $pageCount, $canvas, FontMetrics $fontMetrics) use ($footer, $status): void {
            $font = $fontMetrics->getFont('DejaVu Sans', 'normal');
            $bold = $fontMetrics->getFont('DejaVu Sans', 'bold');
            $height = $canvas->get_height();
            $width = $canvas->get_width();
            $canvas->text(31, $height - 31, $footer . '  |  ' . $status, $bold, 6.4, [0.28, 0.30, 0.34]);
            $page = 'Pagina ' . $pageNumber . ' / ' . $pageCount;
            $pageWidth = $fontMetrics->getTextWidth($page, $font, 6.4);
            $canvas->text($width - 31 - $pageWidth, $height - 31, $page, $font, 6.4, [0.42, 0.44, 0.48]);
        });

        return $dompdf->output();
    }

    public static function html(array $invoice): string
    {
        return self::documentHtml(self::normalize($invoice));
    }

    public static function renderPinned(PDO $db, array $invoice, string $assignedBy = ''): string
    {
        $assignment = GtrotsInvoiceThemeStore::pin($db, $invoice, $assignedBy);
        $invoice['theme'] = $assignment['theme'];
        return self::render($invoice);
    }

    public static function htmlPinned(PDO $db, array $invoice, string $assignedBy = ''): string
    {
        $assignment = GtrotsInvoiceThemeStore::pin($db, $invoice, $assignedBy);
        $invoice['theme'] = $assignment['theme'];
        return self::html($invoice);
    }

    public static function savePinned(PDO $db, array $invoice, string $absolutePath, string $assignedBy = ''): void
    {
        if (!self::isAbsolutePath($absolutePath)) throw new InvalidArgumentException('Calea PDF trebuie să fie absolută.');
        $directory = dirname($absolutePath);
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new RuntimeException('Directorul PDF nu a putut fi creat: ' . $directory);
        }
        $bytes = self::renderPinned($db, $invoice, $assignedBy);
        if (file_put_contents($absolutePath, $bytes, LOCK_EX) === false) {
            throw new RuntimeException('PDF-ul nu a putut fi salvat: ' . $absolutePath);
        }
    }

    public static function save(array $invoice, string $absolutePath): void
    {
        if (!self::isAbsolutePath($absolutePath)) {
            throw new InvalidArgumentException('Calea PDF trebuie să fie absolută.');
        }
        $directory = dirname($absolutePath);
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new RuntimeException('Directorul PDF nu a putut fi creat: ' . $directory);
        }
        $bytes = self::render($invoice);
        if (file_put_contents($absolutePath, $bytes, LOCK_EX) === false) {
            throw new RuntimeException('PDF-ul nu a putut fi salvat: ' . $absolutePath);
        }
    }

    private static function normalize(array $invoice): array
    {
        $rawStatus = mb_strtolower(trim((string)($invoice['status'] ?? 'unpaid')), 'UTF-8');
        $status = self::STATUS_ALIASES[$rawStatus] ?? null;
        if ($status === null) {
            throw new InvalidArgumentException('Status necunoscut. Folosește: unpaid, paid sau return.');
        }

        $theme = GtrotsInvoiceThemeStore::normalize((string)($invoice['theme'] ?? $invoice['color_theme'] ?? 'orange'));

        $series = strtoupper(trim((string)($invoice['series'] ?? '')));
        $number = trim((string)($invoice['number'] ?? ''));
        $issueDate = self::date((string)($invoice['issue_date'] ?? ''));
        if ($series === '' || $number === '' || $issueDate === '') {
            throw new InvalidArgumentException('Factura trebuie să aibă serie, număr și data emiterii.');
        }

        $seller = self::party(is_array($invoice['seller'] ?? null) ? $invoice['seller'] : [], 'Furnizor');
        $buyer = self::party(is_array($invoice['buyer'] ?? null) ? $invoice['buyer'] : [], 'Client');
        $currency = strtoupper(trim((string)($invoice['currency'] ?? 'RON'))) ?: 'RON';
        $sourceItems = array_values(array_filter(is_array($invoice['items'] ?? null) ? $invoice['items'] : [], 'is_array'));
        if (!$sourceItems) throw new InvalidArgumentException('Factura trebuie să conțină cel puțin o poziție.');

        $items = [];
        $subtotal = 0.0;
        $vatTotal = 0.0;
        $discountTotal = 0.0;
        $vatSummary = [];
        foreach ($sourceItems as $index => $item) {
            $name = trim((string)($item['name'] ?? ''));
            if ($name === '') throw new InvalidArgumentException('Poziția ' . ($index + 1) . ' nu are denumire.');
            $quantity = self::number($item['quantity'] ?? 0, 'cantitate');
            $unitPrice = self::number($item['unit_price'] ?? 0, 'preț unitar');
            $vatRate = self::number($item['vat_rate'] ?? 0, 'cotă TVA');
            $discountPercent = self::number($item['discount_percent'] ?? 0, 'discount');
            if ($discountPercent < 0 || $discountPercent > 100) throw new InvalidArgumentException('Discountul trebuie să fie între 0 și 100%.');
            if ($vatRate < 0 || $vatRate > 100) throw new InvalidArgumentException('Cota TVA trebuie să fie între 0 și 100%.');

            $displayQuantity = $status === 'return' ? -abs($quantity) : $quantity;
            $grossBase = abs($quantity * $unitPrice);
            $discount = round($grossBase * $discountPercent / 100, 2);
            $base = round($grossBase - $discount, 2);
            $vat = round($base * $vatRate / 100, 2);
            if ($status === 'return') {
                $base = -abs($base);
                $vat = -abs($vat);
                $discount = -abs($discount);
            }
            $lineTotal = round($base + $vat, 2);
            $subtotal += $base;
            $vatTotal += $vat;
            $discountTotal += $discount;
            $vatKey = number_format($vatRate, 2, '.', '');
            if (!isset($vatSummary[$vatKey])) $vatSummary[$vatKey] = ['rate' => $vatRate, 'base' => 0.0, 'vat' => 0.0];
            $vatSummary[$vatKey]['base'] += $base;
            $vatSummary[$vatKey]['vat'] += $vat;

            $items[] = [
                'position' => $index + 1,
                'name' => $name,
                'description' => trim((string)($item['description'] ?? '')),
                'sku' => trim((string)($item['sku'] ?? '')),
                'image' => self::productImageDataUri($item),
                'unit' => trim((string)($item['unit'] ?? 'buc')) ?: 'buc',
                'quantity' => $displayQuantity,
                'unit_price' => abs($unitPrice),
                'discount_percent' => $discountPercent,
                'base' => $base,
                'vat_rate' => $vatRate,
                'vat' => $vat,
                'total' => $lineTotal,
            ];
        }

        $shipping = self::number($invoice['shipping'] ?? 0, 'transport');
        if ($status === 'return') $shipping = -abs($shipping);
        $total = round($subtotal + $vatTotal + $shipping, 2);
        $amountPaid = array_key_exists('amount_paid', $invoice)
            ? self::number($invoice['amount_paid'], 'sumă achitată')
            : ($status === 'paid' ? abs($total) : 0.0);
        $amountDue = match ($status) {
            'paid' => 0.0,
            'return' => $total,
            default => round(max(0, $total - $amountPaid), 2),
        };

        ksort($vatSummary, SORT_NATURAL);
        $related = is_array($invoice['related_invoice'] ?? null) ? $invoice['related_invoice'] : [];
        return [
            'status' => $status,
            'theme' => $theme,
            'series' => $series,
            'number' => $number,
            'issue_date' => $issueDate,
            'due_date' => self::date((string)($invoice['due_date'] ?? '')),
            'delivery_date' => self::date((string)($invoice['delivery_date'] ?? '')),
            'currency' => $currency,
            'seller' => $seller,
            'buyer' => $buyer,
            'items' => $items,
            'subtotal' => round($subtotal, 2),
            'discount_total' => round($discountTotal, 2),
            'vat_total' => round($vatTotal, 2),
            'shipping' => round($shipping, 2),
            'total' => $total,
            'amount_paid' => round($amountPaid, 2),
            'amount_due' => $amountDue,
            'vat_summary' => array_values($vatSummary),
            'payment' => is_array($invoice['payment'] ?? null) ? $invoice['payment'] : [],
            'notes' => trim((string)($invoice['notes'] ?? '')),
            'notes_label' => trim((string)($invoice['notes_label'] ?? 'Informații client')) ?: 'Informații client',
            'tax_note' => trim((string)($invoice['tax_note'] ?? '')),
            'warranty_note' => trim((string)($invoice['warranty_note'] ?? 'Factura ține loc de document justificativ pentru garanție. Solicitări: contact@g-trots.ro. Drepturile legale se acordă conform OUG nr. 140/2021.')),
            'order_reference' => trim((string)($invoice['order_reference'] ?? '')),
            'contract_reference' => trim((string)($invoice['contract_reference'] ?? '')),
            'related_invoice' => [
                'series' => strtoupper(trim((string)($related['series'] ?? ''))),
                'number' => trim((string)($related['number'] ?? '')),
                'date' => self::date((string)($related['date'] ?? '')),
            ],
            'return_reason' => trim((string)($invoice['return_reason'] ?? '')),
            'is_demo' => !empty($invoice['is_demo']),
            'document_id' => trim((string)($invoice['document_id'] ?? '')),
        ];
    }

    private static function party(array $party, string $label): array
    {
        $name = trim((string)($party['name'] ?? ''));
        if ($name === '') throw new InvalidArgumentException($label . ': denumirea este obligatorie.');
        return [
            'name' => $name,
            'trade_name' => trim((string)($party['trade_name'] ?? '')),
            'cui' => strtoupper(trim((string)($party['cui'] ?? $party['fiscal_code'] ?? ''))),
            'registration_number' => strtoupper(trim((string)($party['registration_number'] ?? ''))),
            'address' => trim((string)($party['address'] ?? '')),
            'city' => trim((string)($party['city'] ?? '')),
            'county' => trim((string)($party['county'] ?? '')),
            'postal_code' => trim((string)($party['postal_code'] ?? '')),
            'country' => trim((string)($party['country'] ?? 'România')),
            'email' => trim((string)($party['email'] ?? '')),
            'phone' => trim((string)($party['phone'] ?? '')),
            'website' => trim((string)($party['website'] ?? '')),
            'bank_name' => trim((string)($party['bank_name'] ?? '')),
            'iban' => strtoupper(str_replace(' ', '', trim((string)($party['iban'] ?? '')))),
            'share_capital' => trim((string)($party['share_capital'] ?? '')),
        ];
    }

    private static function documentHtml(array $d): string
    {
        $s = self::STATUS[$d['status']];
        $theme = GtrotsInvoiceThemeStore::THEMES[$d['theme']];
        $accent = $theme['accent'];
        $accentDark = $theme['accent_dark'];
        $soft = $theme['soft'];
        $ink = $theme['ink'];
        $statusAccent = $s['accent'];
        $statusSoft = $s['soft'];
        $statusInk = $s['ink'];
        $logo = self::logoDataUri();
        $logoHtml = $logo !== null
            ? '<img class="logo" src="' . $logo . '" alt="G-Trots">'
            : '<div class="logo-fallback"><b>G</b><strong>T</strong></div>';
        $closingLogoHtml = $logo !== null
            ? '<img class="closing-logo" src="' . $logo . '" alt="G-Trots">'
            : '<div class="closing-logo-fallback">GT</div>';
        $webIconHtml = '<img class="contact-icon-image" src="' . self::contactIconDataUri('web', $accentDark) . '" alt="">';
        $emailIconHtml = '<img class="contact-icon-image" src="' . self::contactIconDataUri('email', $accentDark) . '" alt="">';
        $mark = $s['mark'] !== '' ? '<div class="watermark">' . self::e($s['mark']) . '</div>' : '';
        $related = self::relatedHtml($d);
        $rows = implode('', array_map(static fn(array $item): string => self::itemRow($item, $d['currency']), $d['items']));
        $vatRows = implode('', array_map(static fn(array $row): string => '<tr><td>TVA ' . self::decimal($row['rate'], 2) . '%</td><td>' . self::money($row['base'], $d['currency']) . '</td><td>' . self::money($row['vat'], $d['currency']) . '</td></tr>', $d['vat_summary']));
        $payment = self::paymentHtml($d);
        $notes = self::notesHtml($d);
        $seller = self::partyHtml($d['seller'], 'FURNIZOR', true);
        $buyer = self::partyHtml($d['buyer'], 'CLIENT', false);
        $dueLabel = match ($d['status']) {
            'paid' => 'ACHITAT',
            'return' => 'DE RESTITUIT',
            default => 'DE PLATĂ',
        };
        $dueValue = $d['status'] === 'paid' ? $d['amount_paid'] : $d['amount_due'];
        $deadline = $d['status'] === 'paid'
            ? self::dateLabel((string)($d['payment']['paid_at'] ?? $d['issue_date']))
            : ($d['due_date'] !== '' ? self::dateLabel($d['due_date']) : '—');
        $deadlineLabel = $d['status'] === 'paid' ? 'Data încasării' : 'Scadență';
        $meta = array_filter([
            $d['order_reference'] !== '' ? 'Comandă ' . $d['order_reference'] : '',
            $d['contract_reference'] !== '' ? 'Contract ' . $d['contract_reference'] : '',
            $d['delivery_date'] !== '' ? 'Livrare ' . self::dateLabel($d['delivery_date']) : '',
        ]);
        $metaHtml = $meta ? '<div class="micro-meta">' . self::e(implode('  •  ', $meta)) . '</div>' : '';
        $shippingRow = abs($d['shipping']) > 0.0001 ? '<tr><td>Transport</td><td>' . self::money($d['shipping'], $d['currency']) . '</td></tr>' : '';
        $paidRow = $d['status'] === 'unpaid' && $d['amount_paid'] > 0
            ? '<tr class="paid-line"><td>Achitat parțial</td><td>-' . self::money($d['amount_paid'], $d['currency']) . '</td></tr>'
            : '';
        $warrantyFooter = $d['warranty_note'] !== ''
            ? ' <span class="warranty-copy">' . self::e($d['warranty_note']) . '</span>'
            : '';
        $css = self::css($accent, $accentDark, $soft, $ink);
        $css .= '.status-strip{background:' . $statusSoft . ';border-color:' . $statusAccent . '}.status-date{border-left-color:' . $statusAccent . '}.status-pill{background:' . $statusAccent . '}.status-message strong,.status-date small,.status-date b{color:' . $statusInk . '}'
            . '.items th{text-align:center!important;vertical-align:middle;font-size:7pt;padding:2.5mm .7mm;line-height:1.2}.items th small{font-size:5.4pt}'
            . '.pay-card{padding:0;overflow:hidden;background:#fff;border-color:#d8d4da;border-top:1.1mm solid ' . $accent . '}'
            . '.pay-heading{width:100%;border-collapse:collapse;background:' . $soft . '}.pay-heading td{padding:1.75mm 3mm;vertical-align:middle}.pay-kicker{font-size:5.2pt;font-weight:900;letter-spacing:1pt;color:' . $ink . '}.pay-method-cell{text-align:right}.pay-method-badge{display:inline-block;padding:.8mm 1.8mm;border-radius:5mm;background:' . $accent . ';color:#fff;font-size:5.3pt;font-weight:900;letter-spacing:.25pt}'
            . '.payment-grid{width:calc(100% - 6mm);margin:.8mm 3mm 1.2mm;border-collapse:collapse;table-layout:fixed}.payment-grid th,.payment-grid td{padding:1mm 0;border-bottom:1px solid #ebe8ec;vertical-align:middle}.payment-grid tr:last-child th,.payment-grid tr:last-child td{border-bottom:0}.payment-grid th{width:22mm;text-align:left;color:#89838b;font-size:5pt;font-weight:900;letter-spacing:.35pt}.payment-grid td{padding-left:2mm;color:#242126;font-size:6pt}.payment-code{font-family:"DejaVu Sans Mono",monospace;font-size:5.5pt!important;letter-spacing:.1pt}.payment-reference{font-weight:900;color:' . $ink . '!important}'
            . '.note-card{padding:0;overflow:hidden;background:' . $soft . ';border-color:' . $accent . '}.note-heading{width:100%;border-collapse:collapse}.note-heading td{padding:1.5mm 2.5mm .8mm}.note-kicker{font-size:5.2pt;font-weight:900;letter-spacing:1pt;color:' . $ink . '}.note-badge{text-align:right;color:' . $accentDark . ';font-size:4.6pt;font-weight:900;letter-spacing:.4pt}.note-content{padding:0 2.5mm 1.5mm}.note-entry{display:table;width:100%;padding:1mm 1.5mm;border-radius:1.6mm;background:rgba(255,255,255,.76);border-left:.7mm solid ' . $accent . ';color:' . $ink . ';font-size:5.3pt;line-height:1.3}.note-entry+.note-entry{margin-top:.65mm}.note-entry b,.note-entry span{display:table-cell;vertical-align:middle}.note-entry b{width:28mm;padding-left:2.2mm;padding-right:2.2mm;font-size:4.5pt;letter-spacing:.5pt;text-transform:uppercase;color:' . $accentDark . '}.note-general{background:#fff;border-left-color:#c8c3ca;color:#5e5860}.note-general b{color:#817a83}'
            . '.closing{margin-top:2mm;padding:2.4mm 3.5mm;background:#fff;border:1px solid #d8d4da;border-top:1.4mm solid ' . $accent . ';border-radius:3mm;page-break-inside:avoid}.closing-grid{width:100%;border-collapse:collapse}.closing-icon-cell{width:15mm;padding:0;vertical-align:middle}.closing .closing-logo-frame{width:12mm;height:12mm;margin:0;border-collapse:separate;border-spacing:0;table-layout:fixed;border-radius:3mm;background:' . $soft . '}.closing-logo-center{width:12mm;height:12mm;padding:1mm;text-align:center;vertical-align:middle;line-height:0}.closing-logo,.closing-logo-fallback{display:block;width:10mm;height:10mm;margin:0 auto;border-radius:2.5mm;background:' . $accent . '}.closing-logo{object-fit:contain}.closing-logo-fallback{line-height:10mm;text-align:center;color:#fff;font-size:8pt;font-weight:900}.closing-message{vertical-align:middle}.closing-message strong{display:block;color:#171519;font-size:9.4pt;line-height:1.1}.closing-message span{display:block;margin-top:.9mm;color:#625d64;font-size:6.2pt}.closing-contacts{width:42%;padding-left:4mm;border-left:1px solid #e7e3e8;vertical-align:middle;text-align:left}.contact-line{position:relative;width:42.2mm;height:6.4mm;margin:.35mm 0;white-space:nowrap}.closing .contact-icon{position:absolute;left:0;top:0;display:block;width:6.4mm;height:6.4mm;margin:0;padding:0;border-radius:3.2mm;background:' . $soft . '}.contact-icon-image{position:absolute;left:1.1mm;top:1.1mm;display:block;width:4.2mm;height:4.2mm;margin:0}.closing .contact-copy{display:block;width:34mm;margin-left:8.2mm;padding-top:.55mm;text-align:left;white-space:nowrap}.closing .contact-label{display:block;color:#777078;font-size:4.8pt;font-weight:900;letter-spacing:.9pt;line-height:1}.closing .contact-value{display:block;margin-top:.45mm;color:' . $accentDark . ';font-size:7pt;font-weight:900;line-height:1.05}'
            . '.legal-footer{position:fixed;left:10mm;right:10mm;bottom:12.5mm;margin:0;padding:1mm 1mm 0;border-top:1px solid #d5d1d7;text-align:center}.legal-copy{max-width:177mm;margin:0 auto;color:#615b63;font-size:5.1pt;line-height:1.4}.warranty-copy{color:inherit;font-weight:400}';

        return '<!doctype html><html lang="ro"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
            . self::e($s['title'] . ' ' . $d['series'] . ' ' . $d['number']) . '</title><style>' . $css . '@page{margin:0}.document-shell{width:190mm;margin:10mm}.demo-ribbon{top:10mm;right:10mm}.document-shell .parties{width:100%;margin:3mm 0 2.5mm;border-spacing:0}.document-shell .parties td:first-child{padding-right:1.5mm}.document-shell .parties td:last-child{padding-left:1.5mm}' . '</style></head><body>'
            . $mark . '<div class="document-shell">'
            . '<header><table class="brand-table"><tr><td class="brand-cell">' . $logoHtml . '<div class="brand-copy"><strong>G-TROTS</strong><span>SERVICE &amp; MAGAZIN</span></div></td>'
            . '<td class="doc-cell"><div class="eyebrow">DOCUMENT FISCAL</div><h1>' . self::e($s['title']) . '</h1><div class="doc-number">' . self::e($d['series'] . ' ' . $d['number']) . '</div></td></tr></table>'
            . '<table class="status-strip"><tr><td class="status-message"><span class="status-pill">●&nbsp;&nbsp;' . self::e($s['label']) . '</span><strong>' . self::e($s['message']) . '</strong></td>'
            . '<td class="status-date"><small>Data emiterii</small><b>' . self::dateLabel($d['issue_date']) . '</b></td><td class="status-date"><small>' . self::e($deadlineLabel) . '</small><b>' . self::e($deadline) . '</b></td></tr></table>'
            . $metaHtml . $related . '</header>'
            . '<table class="parties"><tr><td>' . $seller . '</td><td>' . $buyer . '</td></tr></table>'
            . '<div class="section-title"><span>DETALII FACTURĂ</span><b>' . count($d['items']) . ' ' . (count($d['items']) === 1 ? 'poziție' : 'poziții') . '</b></div>'
            . '<table class="items"><colgroup><col style="width:4%"><col style="width:8%"><col style="width:31%"><col style="width:6%"><col style="width:7%"><col style="width:11%"><col style="width:7%"><col style="width:12%"><col style="width:14%"></colgroup>'
            . '<thead><tr><th>#</th><th>Foto</th><th>Articol facturat</th><th>U.M.</th><th>Cant.</th><th>Preț unitar<br><small>fără TVA</small></th><th>TVA</th><th>Valoare<br><small>fără TVA</small></th><th>Total</th></tr></thead><tbody>' . $rows . '</tbody></table>'
            . '<table class="bottom-layout"><tr><td class="left-bottom">' . $payment . $notes . '</td><td class="right-bottom">'
            . '<table class="vat-summary"><thead><tr><th>Sumar TVA</th><th>Bază</th><th>TVA</th></tr></thead><tbody>' . $vatRows . '</tbody></table>'
            . '<table class="totals"><tr><td>Subtotal fără TVA</td><td>' . self::money($d['subtotal'], $d['currency']) . '</td></tr>' . $shippingRow
            . '<tr><td>Total TVA</td><td>' . self::money($d['vat_total'], $d['currency']) . '</td></tr><tr class="grand"><td>Total factură</td><td>' . self::money($d['total'], $d['currency']) . '</td></tr>' . $paidRow . '</table>'
            . '<div class="due-card"><small>' . self::e($dueLabel) . '</small><strong>' . self::money($dueValue, $d['currency']) . '</strong></div>'
            . '</td></tr></table>'
            . '<div class="closing"><table class="closing-grid"><tr><td class="closing-icon-cell"><table class="closing-logo-frame"><tr><td class="closing-logo-center">' . $closingLogoHtml . '</td></tr></table></td>'
            . '<td class="closing-message"><strong>Mulțumim că ai ales G-Trots.</strong><span>Mobilitate în mișcare. Service făcut cu grijă.</span></td>'
            . '<td class="closing-contacts"><div class="contact-line"><span class="contact-icon">' . $webIconHtml . '</span><span class="contact-copy"><span class="contact-label">ONLINE</span><span class="contact-value">g-trots.ro</span></span></div>'
            . '<div class="contact-line"><span class="contact-icon">' . $emailIconHtml . '</span><span class="contact-copy"><span class="contact-label">CONTACT</span><span class="contact-value">contact@g-trots.ro</span></span></div></td></tr></table></div>'
            . '<div class="legal-footer"><div class="legal-copy">Factura aferentă acestui document se transmite prin sistemul național RO e-Factura, în format XML. Exemplarul original al facturii electronice se consideră fișierul XML însoțit de sigiliul electronic al Ministerului Finanțelor, conform art. 4 alin. (6) din OUG nr. 120/2021.' . $warrantyFooter . '</div></div>'
            . '</div></body></html>';
    }

    private static function partyHtml(array $party, string $label, bool $seller): string
    {
        $identity = array_filter([
            $party['cui'] !== '' ? 'CUI ' . $party['cui'] : '',
            $party['registration_number'] !== '' ? 'RC ' . $party['registration_number'] : '',
        ]);
        $location = array_filter([$party['address'], $party['postal_code'], $party['city'], $party['county'], $party['country']]);
        $contact = array_filter([$party['phone'], $party['email'], $party['website']]);
        $bank = $seller ? array_filter([$party['bank_name'], $party['iban']]) : [];
        $capital = $seller && $party['share_capital'] !== '' ? 'Capital social ' . $party['share_capital'] : '';
        return '<div class="party-card ' . ($seller ? 'seller' : 'buyer') . '"><div class="party-label"><span>' . self::e($label) . '</span><i>' . ($seller ? 'EMITENT' : 'DESTINATAR') . '</i></div>'
            . '<h2>' . self::e($party['name']) . '</h2>'
            . ($party['trade_name'] !== '' ? '<div class="trade-name">' . self::e($party['trade_name']) . '</div>' : '')
            . self::infoLine('ID', implode('  •  ', $identity))
            . self::infoLine('Sediu', implode(', ', $location))
            . self::infoLine('Contact', implode('  •  ', $contact))
            . self::infoLine('Plată', implode('  •  ', $bank))
            . ($capital !== '' ? '<div class="capital">' . self::e($capital) . '</div>' : '')
            . '</div>';
    }

    private static function infoLine(string $label, string $value): string
    {
        return trim($value) === '' ? '' : '<div class="info-line"><b>' . self::e($label) . '</b><span>' . self::e($value) . '</span></div>';
    }

    private static function itemRow(array $item, string $currency): string
    {
        $discount = $item['discount_percent'] > 0 ? '<span class="discount">-' . self::decimal($item['discount_percent'], 2) . '%</span>' : '';
        $thumbnail = $item['image'] !== null
            ? '<img class="product-thumb" src="' . $item['image'] . '" alt="">'
            : '<div class="product-thumb-placeholder"><span>GT</span></div>';
        $sku = $item['sku'] !== '' ? '<span class="sku-chip">' . self::e($item['sku']) . '</span>' : '';
        return '<tr><td class="position">' . $item['position'] . '</td><td class="thumb-cell">' . $thumbnail . '</td><td><div class="product-copy"><strong class="item-name">' . self::e($item['name']) . '</strong>'
            . ($sku !== '' ? '<div class="product-meta">' . $sku . '</div>' : '') . '</div></td>'
            . '<td class="center">' . self::e($item['unit']) . '</td><td class="number">' . self::decimal($item['quantity'], 4) . '</td>'
            . '<td class="number">' . self::money($item['unit_price'], $currency) . $discount . '</td><td class="center"><span class="vat-chip">' . self::decimal($item['vat_rate'], 2) . '%</span></td>'
            . '<td class="number">' . self::money($item['base'], $currency) . '</td><td class="number total-cell">' . self::money($item['total'], $currency) . '</td></tr>';
    }

    private static function paymentHtml(array $d): string
    {
        $payment = $d['payment'];
        $method = trim((string)($payment['method'] ?? 'Transfer bancar'));
        $reference = trim((string)($payment['reference'] ?? ($d['series'] . ' ' . $d['number'])));
        $transaction = trim((string)($payment['transaction_id'] ?? ''));
        $iban = trim((string)($payment['iban'] ?? $d['seller']['iban']));
        $ibanDisplay = trim(chunk_split(str_replace(' ', '', $iban), 4, ' '));
        $lines = [
            ['Metodă', $method, ''],
            ['Referință', $reference, 'payment-reference'],
            ['IBAN', $ibanDisplay, 'payment-code'],
            ['Banca', trim((string)($payment['bank_name'] ?? $d['seller']['bank_name'])), ''],
            ['Tranzacție', $transaction, 'payment-code'],
        ];
        $content = '';
        foreach ($lines as [$label, $value, $class]) {
            if ($value === '') continue;
            $content .= '<tr><th>' . self::e($label) . '</th><td class="' . $class . '">' . self::e($value) . '</td></tr>';
        }
        return '<div class="pay-card"><table class="pay-heading"><tr><td><span class="pay-kicker">INSTRUCȚIUNI DE PLATĂ</span></td>'
            . '<td class="pay-method-cell"><span class="pay-method-badge">' . self::e(mb_strtoupper($method, 'UTF-8')) . '</span></td></tr></table>'
            . '<table class="payment-grid">' . $content . '</table></div>';
    }

    private static function notesHtml(array $d): string
    {
        $entries = [];
        if ($d['status'] === 'return' && $d['return_reason'] !== '') {
            $entries[] = '<div class="note-entry"><b>Motiv retur</b><span>' . self::e($d['return_reason']) . '</span></div>';
        }
        if ($d['tax_note'] !== '') {
            $entries[] = '<div class="note-entry"><b>Regim fiscal</b><span>' . self::e($d['tax_note']) . '</span></div>';
        }
        if ($d['notes'] !== '') {
            $entries[] = '<div class="note-entry note-general"><b>' . self::e($d['notes_label']) . '</b><span>' . nl2br(self::e($d['notes']), false) . '</span></div>';
        }
        if (!$entries) {
            $entries[] = '<div class="note-entry note-general"><b>Document electronic</b><span>Semnătura și ștampila nu sunt obligatorii.</span></div>';
        }
        return '<div class="note-card"><table class="note-heading"><tr><td><span class="note-kicker">MENȚIUNI</span></td><td class="note-badge">INFORMAȚII UTILE</td></tr></table>'
            . '<div class="note-content">' . implode('', $entries) . '</div></div>';
    }

    private static function relatedHtml(array $d): string
    {
        $related = $d['related_invoice'];
        if ($related['series'] === '' && $related['number'] === '') return '';
        $prefix = $d['status'] === 'return' ? 'Corectează factura' : 'Referință factură';
        $text = trim($related['series'] . ' ' . $related['number']);
        if ($related['date'] !== '') $text .= ' din ' . self::dateLabel($related['date']);
        return '<div class="related"><b>' . self::e($prefix) . '</b><span>' . self::e($text) . '</span></div>';
    }

    private static function logoDataUri(): ?string
    {
        // Dompdf needs GD for transparent PNG files. The bundled JPG is a
        // pre-rendered copy of assets/images/logo.png for minimal PHP hosts.
        $candidates = extension_loaded('gd')
            ? [[dirname(__DIR__) . '/assets/images/logo.png', 'image/png'], [__DIR__ . '/pdf-assets/logo.jpg', 'image/jpeg']]
            : [[__DIR__ . '/pdf-assets/logo.jpg', 'image/jpeg']];
        foreach ($candidates as [$path, $mime]) {
            if (!is_file($path) || !is_readable($path)) continue;
            $bytes = file_get_contents($path);
            if (is_string($bytes) && $bytes !== '') return 'data:' . $mime . ';base64,' . base64_encode($bytes);
        }
        return null;
    }

    private static function contactIconDataUri(string $type, string $color): string
    {
        if (!preg_match('/^#[0-9a-f]{6}$/i', $color)) throw new InvalidArgumentException('Culoare de iconiță invalidă.');
        $icons = [
            'web' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' . $color . '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.8 5.2 3.8 8.5s-1.4 6.2-3.8 8.5c-2.4-2.3-3.8-5.2-3.8-8.5s1.4-6.2 3.8-8.5z"/></svg>',
            'email' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' . $color . '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M5 7l7 5.5L19 7"/></svg>',
        ];
        if (!isset($icons[$type])) throw new InvalidArgumentException('Tip de iconiță necunoscut.');
        return 'data:image/svg+xml;base64,' . base64_encode($icons[$type]);
    }

    private static function productImageDataUri(array $item): ?string
    {
        $raw = trim((string)($item['image_path'] ?? $item['product_image_storage_path'] ?? $item['product_image_url'] ?? ''));
        if ($raw === '' || str_contains($raw, "\0")) return null;
        $urlPath = parse_url($raw, PHP_URL_PATH);
        $path = rawurldecode(str_replace('\\', '/', is_string($urlPath) && $urlPath !== '' ? $urlPath : $raw));
        $path = ltrim($path, '/');

        $roots = [
            'uploads/products/' => __DIR__ . '/uploads/products',
            'pdf-assets/invoice-products/' => __DIR__ . '/pdf-assets/invoice-products',
        ];
        foreach ($roots as $marker => $root) {
            $position = strpos($path, $marker);
            if ($position === false) continue;
            $relative = substr($path, $position + strlen($marker));
            if (!preg_match('/^[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i', $relative)) return null;
            $resolvedRoot = realpath($root);
            $candidate = realpath($root . '/' . $relative);
            if ($resolvedRoot === false || $candidate === false || !is_file($candidate)) return null;
            $prefix = rtrim($resolvedRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
            if (!str_starts_with($candidate, $prefix)) return null;
            $size = filesize($candidate);
            if ($size === false || $size < 32 || $size > 6 * 1024 * 1024) return null;
            $info = @getimagesize($candidate);
            $mime = strtolower((string)($info['mime'] ?? ''));
            if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) return null;
            if ($mime !== 'image/jpeg' && !extension_loaded('gd')) return null;
            $bytes = file_get_contents($candidate);
            return is_string($bytes) && $bytes !== '' ? 'data:' . $mime . ';base64,' . base64_encode($bytes) : null;
        }
        return null;
    }

    private static function css(string $accent, string $accentDark, string $soft, string $ink): string
    {
        return '@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:"DejaVu Sans",sans-serif;color:#18171a;background:#fff;font-size:7.2pt;line-height:1.3}header{border-top:3mm solid ' . $accent . ';padding-top:3.5mm}.brand-table,.status-strip,.parties,.bottom-layout,.closing table{width:100%;border-collapse:collapse}.brand-cell{width:52%;vertical-align:middle}.logo{width:16mm;height:16mm;object-fit:contain;vertical-align:middle;border-radius:4mm}.logo-fallback{display:inline-block;width:16mm;height:16mm;line-height:16mm;text-align:center;background:' . $accent . ';border-radius:4mm;font-size:16pt}.logo-fallback b{color:#fff}.logo-fallback strong{color:#000}.brand-copy{display:inline-block;vertical-align:middle;margin-left:3mm}.brand-copy strong{display:block;font-size:16pt;letter-spacing:-.7pt;line-height:1;color:#111}.brand-copy span{display:block;margin-top:1.3mm;color:#6e6870;font-size:5.8pt;font-weight:800;letter-spacing:1.2pt}.doc-cell{text-align:right;vertical-align:top}.eyebrow{font-size:5.6pt;font-weight:800;color:#8c858d;letter-spacing:1.4pt}.doc-cell h1{margin:.7mm 0 .4mm;font-size:17pt;line-height:1;color:#111;letter-spacing:-.5pt}.doc-number{font-size:10pt;font-weight:900;color:' . $accentDark . '}.status-strip{margin-top:3.5mm;background:' . $soft . ';border:1px solid ' . $accent . ';border-radius:3mm;overflow:hidden}.status-strip td{padding:2.4mm 2.7mm;vertical-align:middle}.status-message{width:64%}.status-message strong{display:block;margin-top:1.2mm;color:' . $ink . ';font-size:6.5pt}.status-pill{display:inline-block;background:' . $accent . ';color:#fff;border-radius:8mm;padding:1.4mm 2.7mm;font-size:6.5pt;font-weight:900;letter-spacing:.4pt}.status-date{width:18%;border-left:1px solid ' . $accent . ';text-align:center}.status-date small{display:block;color:' . $ink . ';font-size:5.4pt;font-weight:700}.status-date b{display:block;margin-top:.7mm;color:' . $ink . ';font-size:7.8pt}.micro-meta{text-align:right;color:#756f77;font-size:5.9pt;margin-top:1.2mm}.related{margin-top:1.2mm;padding:1.6mm 2.7mm;background:#f7f6f8;border-left:1.2mm solid ' . $accent . ';border-radius:1.5mm}.related b{color:' . $accentDark . ';margin-right:3mm}.parties{border-spacing:3mm 0;border-collapse:separate;margin:3mm -3mm 2.5mm;width:calc(100% + 6mm);table-layout:fixed}.parties td{width:50%;vertical-align:top}.party-card{min-height:37mm;border:1px solid #dedbe0;border-radius:3mm;padding:2.8mm 3.5mm;background:#fff}.party-card.seller{border-top:1.2mm solid ' . $accent . '}.party-card.buyer{border-top:1.2mm solid #29262b}.party-label{margin-bottom:1.3mm}.party-label span{font-weight:900;font-size:5.8pt;letter-spacing:1.1pt;color:#6f6871}.party-label i{float:right;font-style:normal;color:#aaa4aa;font-size:5.1pt}.party-card h2{margin:0 0 .7mm;font-size:10pt;line-height:1.1;color:#171518}.trade-name{font-weight:800;color:' . $accentDark . ';margin-bottom:1.2mm}.info-line{display:table;width:100%;border-top:1px solid #eeecef;padding-top:.8mm;margin-top:.8mm}.info-line b,.info-line span{display:table-cell;vertical-align:top}.info-line b{width:13mm;color:#8b858c;font-size:5.4pt;text-transform:uppercase}.info-line span{font-size:6.2pt}.capital{margin-top:1mm;color:#777078;font-size:5.4pt}.section-title{margin:1.4mm 0 1.4mm}.section-title span{font-size:6.6pt;font-weight:900;letter-spacing:1.1pt}.section-title b{float:right;color:' . $accentDark . ';font-size:6.1pt}.items{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;border:1px solid #dad7dc;border-radius:2.5mm;overflow:hidden}.items th:nth-child(1),.items td:nth-child(1){width:4%}.items th:nth-child(2),.items td:nth-child(2){width:8%}.items th:nth-child(3),.items td:nth-child(3){width:31%}.items th:nth-child(4),.items td:nth-child(4){width:6%}.items th:nth-child(5),.items td:nth-child(5){width:7%}.items th:nth-child(6),.items td:nth-child(6){width:11%}.items th:nth-child(7),.items td:nth-child(7){width:7%}.items th:nth-child(8),.items td:nth-child(8){width:12%}.items th:nth-child(9),.items td:nth-child(9){width:14%}.items thead{display:table-header-group}.items th{background:#262327;color:#fff;padding:1.8mm .7mm;font-size:5.1pt;line-height:1.2;text-align:left;border-right:1px solid #49454a}.items th:first-child{text-align:center}.items th:nth-child(n+4){text-align:right}.items th:nth-child(7),.items th:nth-child(2){text-align:center}.items th small{color:#bdb8be;font-size:4.5pt}.items tr{page-break-inside:avoid}.items td{padding:1.35mm .8mm;border-bottom:1px solid #e7e4e8;vertical-align:middle;background:#fff}.items tbody tr:nth-child(even) td{background:#faf9fa}.items tbody tr:last-child td{border-bottom:0}.position{text-align:center;color:' . $accentDark . ';font-weight:900}.center{text-align:center}.number{text-align:right;white-space:nowrap}.thumb-cell{text-align:center;padding-left:.4mm!important;padding-right:.4mm!important}.product-thumb,.product-thumb-placeholder{display:inline-block;width:11mm;height:11mm;border-radius:2.2mm;border:1px solid #e2dfe3;background:#fff}.product-thumb{object-fit:contain}.product-thumb-placeholder{line-height:11mm;background:' . $soft . ';color:' . $accentDark . ';font-size:6.5pt;font-weight:900;text-align:center}.product-copy{border-left:.7mm solid ' . $accent . ';padding-left:1.5mm;min-height:9mm}.item-name{display:block;font-size:6.8pt;line-height:1.18;color:#171518}.product-meta{margin-top:.7mm;line-height:1.2}.sku-chip{display:inline-block;margin-right:1.2mm;padding:.45mm 1mm;border-radius:3mm;background:#ece9ed;color:#5f5961;font-size:4.7pt;font-weight:900}.item-sub{color:#7e7880;font-size:5pt;line-height:1.2}.vat-chip{display:inline-block;padding:.7mm 1.1mm;background:' . $soft . ';color:' . $ink . ';border-radius:4mm;font-weight:900}.discount{display:block;color:#e34e36;font-size:4.8pt;font-weight:900}.total-cell{font-weight:900}.bottom-layout{margin-top:2.5mm;table-layout:fixed;page-break-inside:avoid}.left-bottom{width:55%;vertical-align:top;padding-right:4mm}.right-bottom{width:45%;vertical-align:top}.pay-card,.note-card{border:1px solid #dfdce1;border-radius:2.5mm;padding:2.2mm 3mm;margin-bottom:1.8mm;page-break-inside:avoid}.pay-card{background:#faf9fa}.note-card{background:' . $soft . ';border-color:' . $accent . ';color:' . $ink . ';font-size:5.9pt}.mini-title{margin-bottom:1mm}.mini-title span{font-size:5.3pt;font-weight:900;letter-spacing:.9pt;color:#827c83}.mini-title b{float:right;color:#242125;font-size:5.8pt}.vat-summary{width:100%;border-collapse:collapse;margin-bottom:1.3mm;color:#716b72}.vat-summary th,.vat-summary td{padding:1mm;text-align:right;border-bottom:1px solid #ebe8ec;font-size:5.3pt}.vat-summary th:first-child,.vat-summary td:first-child{text-align:left}.vat-summary th{color:#8b858c}.totals{width:100%;border-collapse:collapse}.totals td{padding:1.1mm 1.7mm;border-bottom:1px solid #e9e6ea}.totals td:last-child{text-align:right;font-weight:800}.totals .grand td{padding-top:1.5mm;font-size:7.6pt;font-weight:900;color:#181619;border-bottom:0}.totals .cancelled-value td:last-child{text-decoration:line-through;color:#a5293b}.paid-line td{color:#08794a}.due-card{margin-top:1.3mm;background:' . $accent . ';color:#fff;border-radius:3mm;padding:2.3mm;text-align:right;page-break-inside:avoid}.due-card small{float:left;font-size:6.1pt;font-weight:900;letter-spacing:.8pt;margin-top:1.1mm}.due-card strong{font-size:11.5pt;line-height:1}.closing{margin-top:2.5mm;border-radius:3mm;background:#19171a;color:#fff;padding:2.5mm 3.5mm;page-break-inside:avoid}.closing td{vertical-align:middle}.closing strong{display:block;font-size:7.3pt}.closing span{display:block;color:#bcb7bd;font-size:5.5pt;margin-top:.5mm}.closing-right{text-align:right;color:' . $accent . ';font-weight:800;font-size:6pt}.legal-note{margin-top:1.2mm;color:#8a848b;text-align:center;font-size:4.9pt;line-height:1.3}.watermark{position:fixed;top:104mm;left:20mm;width:170mm;text-align:center;z-index:-1;color:' . $soft . ';font-size:54pt;font-weight:900;letter-spacing:4pt;transform:rotate(-24deg)}.demo-ribbon{position:fixed;right:10mm;top:1.2mm;background:#2b282c;color:#fff;padding:.8mm 2.2mm;border-radius:0 0 2mm 2mm;font-size:4.8pt;font-weight:900;letter-spacing:.7pt;z-index:10}';
    }

    private static function number($value, string $label): float
    {
        if (!is_numeric((string)$value)) throw new InvalidArgumentException('Valoare numerică invalidă pentru ' . $label . '.');
        $number = (float)$value;
        if (!is_finite($number)) throw new InvalidArgumentException('Valoare numerică invalidă pentru ' . $label . '.');
        return $number;
    }

    private static function date(string $value): string
    {
        $value = trim($value);
        if ($value === '') return '';
        try {
            return (new DateTimeImmutable($value))->format('Y-m-d');
        } catch (Throwable $error) {
            throw new InvalidArgumentException('Dată invalidă: ' . $value);
        }
    }

    private static function dateLabel(string $value): string
    {
        if ($value === '') return '—';
        return (new DateTimeImmutable($value))->format('d.m.Y');
    }

    private static function decimal(float $value, int $maximumDecimals = 2): string
    {
        $decimals = abs($value - round($value)) < 0.0000001 ? 0 : $maximumDecimals;
        $formatted = number_format($value, $decimals, ',', '.');
        return $decimals > 0 ? rtrim(rtrim($formatted, '0'), ',') : $formatted;
    }

    private static function money(float $value, string $currency): string
    {
        $suffix = strtoupper($currency) === 'RON' ? 'lei' : strtoupper($currency);
        return number_format($value, 2, ',', '.') . ' ' . $suffix;
    }

    private static function e($value): string
    {
        return htmlspecialchars((string)($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    }

    private static function isAbsolutePath(string $path): bool
    {
        return str_starts_with($path, '/') || preg_match('/^[A-Za-z]:[\\\\\/]/', $path) === 1;
    }
}

/** Functional wrappers for codebases that do not use classes directly. */
function gtrotsInvoicePdf(array $invoice): string
{
    return GtrotsInvoicePdf::render($invoice);
}

function gtrotsInvoiceHtml(array $invoice): string
{
    return GtrotsInvoicePdf::html($invoice);
}
