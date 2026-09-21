<?php
declare(strict_types=1);

$gtrotsShippingNoteDompdfPhar = __DIR__ . '/lib/dompdf-runtime.phar';
$gtrotsShippingNoteDompdfAutoload = __DIR__ . '/lib/dompdf/autoload.inc.php';
if (is_file($gtrotsShippingNoteDompdfPhar)) {
    require_once 'phar://' . $gtrotsShippingNoteDompdfPhar . '/autoload.inc.php';
} elseif (is_file($gtrotsShippingNoteDompdfAutoload)) {
    require_once $gtrotsShippingNoteDompdfAutoload;
} else {
    throw new RuntimeException('Motorul PDF Dompdf nu este instalat.');
}

use Dompdf\Dompdf;
use Dompdf\FontMetrics;
use Dompdf\Options;

final class GtrotsShippingNotePdf
{
    public static function render(array $payload): string
    {
        $document = self::normalize($payload);
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
        $dompdf->loadHtml(self::html($document), 'UTF-8');
        $dompdf->render();

        $canvas = $dompdf->getCanvas();
        $number = $document['series'] . ' ' . $document['number'];
        $canvas->page_script(static function (int $pageNumber, int $pageCount, $canvas, FontMetrics $fontMetrics) use ($number): void {
            $font = $fontMetrics->getFont('DejaVu Sans', 'normal');
            $bold = $fontMetrics->getFont('DejaVu Sans', 'bold');
            $height = $canvas->get_height();
            $width = $canvas->get_width();
            $canvas->text(31, $height - 27, $number, $bold, 6.4, [0.20, 0.20, 0.22]);
            $page = 'Pagina ' . $pageNumber . ' / ' . $pageCount;
            $pageWidth = $fontMetrics->getTextWidth($page, $font, 6.4);
            $canvas->text($width - 31 - $pageWidth, $height - 27, $page, $font, 6.4, [0.42, 0.42, 0.45]);
        });
        return $dompdf->output();
    }

    private static function normalize(array $payload): array
    {
        $series = strtoupper(trim((string)($payload['series'] ?? '')));
        $number = trim((string)($payload['number'] ?? ''));
        $date = trim((string)($payload['issue_date'] ?? ''));
        $items = array_values(array_filter(
            (array)($payload['items'] ?? []),
            static function ($item): bool {
                if (!is_array($item)) return false;
                return trim((string)($item['name'] ?? '')) !== ''
                    || trim((string)($item['order_item_id'] ?? '')) !== ''
                    || trim((string)($item['product_id'] ?? '')) !== '';
            }
        ));
        if ($series === '' || $number === '' || $date === '' || !$items) {
            throw new InvalidArgumentException('Avizul trebuie să aibă serie, număr, dată și cel puțin un produs.');
        }
        $payload['series'] = $series;
        $payload['number'] = $number;
        $payload['issue_date'] = $date;
        $payload['currency'] = strtoupper(trim((string)($payload['currency'] ?? 'RON'))) ?: 'RON';
        $payload['items'] = $items;
        $payload['with_stamp'] = !empty($payload['with_stamp']);
        return $payload;
    }

    private static function html(array $document): string
    {
        $seller = (array)($document['seller'] ?? []);
        $buyer = (array)($document['buyer'] ?? []);
        $expedition = (array)($document['expedition'] ?? []);
        $rows = '';
        $total = 0.0;
        $currencyLabel = strtoupper((string)$document['currency']) === 'RON' ? 'lei' : (string)$document['currency'];
        foreach ($document['items'] as $index => $item) {
            $quantity = (float)($item['quantity'] ?? 0);
            $unitPrice = (float)($item['unit_price'] ?? 0);
            $lineTotal = array_key_exists('line_total', $item) ? (float)$item['line_total'] : round($quantity * $unitPrice, 2);
            $total += $lineTotal;
            $image = self::imageDataUri((string)($item['image_path'] ?? $item['image_url'] ?? ''));
            $imageHtml = $image !== '' ? '<img src="' . self::e($image) . '" alt="">' : '<span class="image-placeholder">GT</span>';
            $rows .= '<tr><td class="index">' . ($index + 1) . '</td><td class="image">' . $imageHtml . '</td><td class="product"><strong>' . self::e((string)($item['name'] ?? 'Produs')) . '</strong>'
                . (trim((string)($item['sku'] ?? '')) !== '' ? '<small>' . self::e((string)$item['sku']) . '</small>' : '')
                . '</td><td class="center">' . self::e((string)($item['unit'] ?? 'buc')) . '</td><td class="number">' . self::decimal($quantity, 2) . '</td><td class="number">' . self::money($unitPrice) . ' ' . self::e($currencyLabel) . '</td><td class="number total">' . self::money($lineTotal) . ' ' . self::e($currencyLabel) . '</td></tr>';
        }
        $displayTotal = array_key_exists('total', $document) ? (float)$document['total'] : $total;
        $logo = self::logoDataUri();
        $sellerAddress = implode(', ', array_filter([(string)($seller['address'] ?? ''), (string)($seller['city'] ?? ''), (string)($seller['county'] ?? '')]));
        $buyerAddress = implode(', ', array_filter([(string)($buyer['address'] ?? ''), (string)($buyer['city'] ?? ''), (string)($buyer['county'] ?? ''), (string)($buyer['postal_code'] ?? '')]));
        $stampImage = self::imageDataUri((string)($seller['stamp_path'] ?? ''));
        $stamp = !empty($document['with_stamp'])
            ? '<div class="stamp"><strong>ȘTAMPILĂ:</strong>' . ($stampImage !== '' ? '<img src="' . self::e($stampImage) . '" alt="Ștampilă">' : '') . '</div>'
            : '';
        $issueDate = strtotime((string)$document['issue_date']);
        $dateText = $issueDate ? date('d.m.Y', $issueDate) : (string)$document['issue_date'];

        return '<!doctype html><html lang="ro"><head><meta charset="utf-8"><style>'
            . '@page{margin:24px 30px 42px}*{box-sizing:border-box}body{margin:0;color:#211f22;font-family:"DejaVu Sans",sans-serif;font-size:9px}table{width:100%;border-collapse:collapse}.top{border-bottom:3px solid #111;padding-bottom:10px}.top td{vertical-align:middle}.logo{width:54px;height:54px;border-radius:15px}.brand{padding-left:12px}.brand strong{display:block;font-size:15px}.brand span{display:block;margin-top:3px;color:#777;font-size:7px;font-weight:bold;letter-spacing:1.5px}.doc{text-align:right}.doc h1{margin:0;color:#e86e0b;font-size:18px;letter-spacing:.4px}.block-title{margin-top:11px;padding-bottom:4px;border-bottom:1px solid #d8d4d0;color:#bd5507;font-size:7px;font-weight:bold;letter-spacing:.9px}.identity{margin-top:6px}.identity td{padding-right:8px;vertical-align:top}.identity td:last-child{padding-right:0}.field-label{display:block;margin-bottom:3px;color:#6c7077;font-size:6.3px;font-weight:bold;letter-spacing:.45px}.value-box{display:block;min-height:24px;padding:6px 7px;border:1px solid #cbd0d5;background:#fff;font-size:8.2px;line-height:1.35}.parties{margin-top:11px;border-collapse:separate;border-spacing:0}.party{width:49%;vertical-align:top;border:1px solid #d8d4d0;padding:9px 10px}.party.seller{border-left:4px solid #f27a1a;background:#fff7ec}.party-gap{width:2%;border:0}.kicker{display:block;margin-bottom:7px;color:#bd5507;font-size:7px;font-weight:bold;letter-spacing:.8px}.party .field{margin-top:5px}.party .field:first-of-type{margin-top:0}.party-split td{width:50%;padding-right:7px}.party-split td:last-child{padding-right:0}.items{margin-top:11px}.items thead{display:table-header-group}.items th{padding:7px 5px;background:#171619;color:#fff;font-size:6.7px;letter-spacing:.6px;text-transform:uppercase}.items td{border-bottom:1px solid #dedbd8;padding:6px 5px;vertical-align:middle}.items tr{page-break-inside:avoid}.items .index{width:4%;text-align:center;color:#777}.items .image{width:10%;text-align:center}.items .image img,.image-placeholder{display:inline-block;width:38px;height:38px;border-radius:7px;object-fit:contain;background:#f3f1ef}.image-placeholder{line-height:38px;color:#f27a1a;font-size:8px;font-weight:bold}.items .product{width:37%}.items .product strong{display:block;font-size:8.2px;line-height:1.35}.items .product small{display:block;margin-top:3px;color:#777;font-size:6.5px}.items .center{text-align:center;width:7%}.items .number{text-align:right;white-space:nowrap;width:14%;font-size:7.4px}.items .total{font-weight:bold}.grand{margin-top:9px}.grand td:first-child{text-align:right;color:#666;font-size:8px}.grand td:last-child{width:29%;padding:8px 7px;text-align:right;background:#fff2e4;border-bottom:2px solid #f27a1a;font-size:12px;font-weight:bold}.bottom{margin-top:15px;page-break-inside:avoid}.section-title{padding-bottom:5px;border-bottom:2px solid #171619;color:#bd5507;font-size:7px;font-weight:bold;letter-spacing:1px}.expedition{margin-top:7px}.expedition td{padding:0 7px 7px 0;vertical-align:top}.expedition td:last-child{padding-right:0}.expedition .field strong{min-height:24px;padding:6px 7px;border:1px solid #cbd0d5;background:#f7f8f9}.field small{display:block;margin-bottom:3px;color:#6c7077;font-size:6.3px;font-weight:bold;letter-spacing:.45px}.field strong{display:block;font-size:8.2px;line-height:1.35}.signatures{margin-top:12px}.signatures td{width:50%;height:86px;vertical-align:top}.signatures td:last-child{padding-left:18px}.signature-line{margin-top:7px;border-bottom:1px solid #aaa;min-height:32px;font-weight:bold}.stamp{padding-top:7px}.stamp strong{display:block;font-size:8px}.stamp img{display:block;max-width:128px;max-height:62px;margin-top:4px;object-fit:contain}</style></head><body>'
            . '<table class="top"><tr><td style="width:58px">' . ($logo !== '' ? '<img class="logo" src="' . self::e($logo) . '" alt="G-Trots">' : '') . '</td><td class="brand"><strong>G-Trots România</strong><span>SERVICE &amp; MAGAZIN</span></td><td class="doc"><h1>AVIZ DE ÎNSOȚIRE A MĂRFII</h1></td></tr></table>'
            . '<div class="block-title">IDENTIFICAREA DOCUMENTULUI</div><table class="identity"><tr><td style="width:16%"><span class="field-label">SERIE</span><strong class="value-box">' . self::e((string)$document['series']) . '</strong></td><td style="width:18%"><span class="field-label">NUMĂR</span><strong class="value-box">' . self::e((string)$document['number']) . '</strong></td><td style="width:20%"><span class="field-label">DATA EMITERII</span><strong class="value-box">' . self::e($dateText) . '</strong></td><td style="width:46%"><span class="field-label">COMANDĂ DE REFERINȚĂ</span><strong class="value-box">' . self::e((string)($document['order_reference'] ?? '')) . '</strong></td></tr></table>'
            . '<table class="parties"><tr><td class="party seller"><span class="kicker">FURNIZOR / EXPEDITOR</span><div class="field"><small>DENUMIRE / NUME</small><strong class="value-box">' . self::e((string)($seller['name'] ?? '')) . '</strong></div><table class="party-split"><tr><td><div class="field"><small>CUI / CNP</small><strong class="value-box">' . self::e((string)($seller['cui'] ?? '')) . '</strong></div></td><td><div class="field"><small>REG. COM.</small><strong class="value-box">' . self::e((string)($seller['registration_number'] ?? '')) . '</strong></div></td></tr></table><div class="field"><small>SEDIU / ADRESĂ EXPEDIERE</small><strong class="value-box">' . self::e($sellerAddress) . '</strong></div></td><td class="party-gap"></td><td class="party"><span class="kicker">CUMPĂRĂTOR / DESTINATAR</span><div class="field"><small>NUME CLIENT</small><strong class="value-box">' . self::e((string)($buyer['name'] ?? '')) . '</strong></div><div class="field"><small>NUMĂR DE TELEFON</small><strong class="value-box">' . self::e((string)($buyer['phone'] ?? '')) . '</strong></div><div class="field"><small>ADRESĂ DE LIVRARE</small><strong class="value-box">' . self::e($buyerAddress) . '</strong></div></td></tr></table>'
            . '<table class="items"><thead><tr><th>Nr.</th><th>Imagine</th><th>Produs</th><th>U.M.</th><th>Cantitate</th><th>Preț unitar</th><th>Valoare</th></tr></thead><tbody>' . $rows . '</tbody></table>'
            . '<table class="grand"><tr><td>TOTAL VALOARE</td><td>' . self::money($displayTotal) . ' ' . self::e($currencyLabel) . '</td></tr></table>'
            . '<div class="bottom"><div class="section-title">DATE PRIVIND EXPEDIȚIA</div><table class="expedition"><tr><td style="width:36%"><div class="field"><small>NUMELE DELEGATULUI</small><strong>' . self::e((string)($expedition['delegate_name'] ?? '-')) . '</strong></div></td><td style="width:28%"><div class="field"><small>CI - SERIE ȘI NUMĂR</small><strong>' . self::e((string)($expedition['identity_document'] ?? '-')) . '</strong></div></td><td style="width:36%"><div class="field"><small>MIJLOC TRANSPORT / NR.</small><strong>' . self::e((string)($expedition['transport_vehicle'] ?? '-')) . '</strong></div></td></tr><tr><td style="width:22%"><div class="field"><small>ORA LIVRĂRII</small><strong>' . self::e((string)($expedition['delivery_time'] ?? '-')) . '</strong></div></td><td colspan="2"><div class="field"><small>LOC ÎNCĂRCARE</small><strong>' . self::e((string)($expedition['loading_place'] ?? '-')) . '</strong></div></td></tr></table>'
            . '<table class="signatures"><tr><td><div class="section-title">EXPEDITOR</div><small>NUME ȘI SEMNĂTURĂ</small><div class="signature-line">' . self::e((string)($document['sender_name'] ?? 'G-Trots Romania')) . '</div></td><td>' . $stamp . '</td></tr></table></div>'
            . '</body></html>';
    }

    private static function logoDataUri(): string
    {
        foreach ([dirname(__DIR__) . '/assets/images/logo.png', dirname(__DIR__) . '/assets/logo.png', __DIR__ . '/assets/logo.png'] as $path) {
            if (is_file($path)) return 'data:image/png;base64,' . base64_encode((string)file_get_contents($path));
        }
        return '';
    }

    private static function imageDataUri(string $value): string
    {
        $value = trim($value);
        if ($value === '') return '';
        if (str_starts_with($value, 'data:image/')) return $value;
        if (preg_match('#^https?://#i', $value)) return '';
        $relative = ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $value), DIRECTORY_SEPARATOR);
        $path = dirname(__DIR__) . DIRECTORY_SEPARATOR . $relative;
        if (!is_file($path)) $path = __DIR__ . DIRECTORY_SEPARATOR . $relative;
        if (!is_file($path)) return '';
        $mime = function_exists('mime_content_type') ? (string)mime_content_type($path) : 'image/jpeg';
        if (!str_starts_with($mime, 'image/')) return '';
        return 'data:' . $mime . ';base64,' . base64_encode((string)file_get_contents($path));
    }

    private static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function money(float $value): string
    {
        return number_format($value, 2, ',', '.');
    }

    private static function decimal(float $value, int $precision): string
    {
        $text = number_format($value, $precision, ',', '.');
        return rtrim(rtrim($text, '0'), ',');
    }
}
