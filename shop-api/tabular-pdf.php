<?php
declare(strict_types=1);

/** Compact, searchable PDF of the exact values/styles in an existing workbook. */
final class GtrotsTabularPdf
{
    private static function xml(string $source): SimpleXMLElement
    {
        if (stripos($source, '<!DOCTYPE') !== false) throw new RuntimeException('Document XML invalid.');
        $xml = simplexml_load_string($source, SimpleXMLElement::class, LIBXML_NONET);
        if (!$xml) throw new RuntimeException('Tabelul nu poate fi citit.');
        $xml->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        return $xml;
    }

    private static function esc(string $value): string { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
    private static function column(string $reference): int
    {
        preg_match('/^[A-Z]+/', strtoupper($reference), $match);
        $result = 0;
        foreach (str_split($match[0] ?? 'A') as $letter) $result = $result * 26 + ord($letter) - 64;
        return $result;
    }
    private static function color($color, string $fallback): string
    {
        $rgb = (string)($color['rgb'] ?? '');
        return preg_match('/^[0-9A-F]{6,8}$/i', $rgb) ? '#' . substr($rgb, -6) : $fallback;
    }
    private static function formatted(string $value, string $format): string
    {
        if ($value === '' || !is_numeric($value)) return $value;
        $number = (float)$value;
        $format = explode(';', $format)[0];
        $dateFormat = preg_replace('/"[^"]*"|\[[^\]]*\]/', '', $format);
        if (preg_match('/[dy]|hh|ss/i', $dateFormat)) {
            $timestamp = (int)round(($number - 25569) * 86400);
            if (!preg_match('/[dy]/i', $format)) return gmdate(str_contains($format, 'ss') ? 'H:i:s' : 'H:i', $timestamp);
            return gmdate(str_contains($format, 'hh') ? 'd.m.Y H:i' : 'd.m.Y', $timestamp);
        }
        $percent = str_contains($format, '%');
        if ($percent) $number *= 100;
        preg_match('/\.([0#]+)/', $format, $decimals);
        $places = strlen($decimals[1] ?? '');
        $minimum = substr_count($decimals[1] ?? '', '0');
        $result = number_format($number, $places, ',', '.');
        if ($places > $minimum) {
            $remove = $places - $minimum;
            while ($remove-- > 0 && str_ends_with($result, '0')) $result = substr($result, 0, -1);
            $result = rtrim($result, ',');
        }
        if ($percent) $result .= '%';
        if (preg_match('/"([^"]+)"/', $format, $unit)) $result .= ' ' . trim($unit[1]);
        return $result;
    }

    public static function html(string $workbook): string
    {
        $path = tempnam(sys_get_temp_dir(), 'gt-table-pdf-');
        if ($path === false) throw new RuntimeException('Fișierul temporar PDF nu poate fi creat.');
        $zip = new ZipArchive(); $opened = false;
        try {
            file_put_contents($path, $workbook);
            if ($zip->open($path) !== true) throw new RuntimeException('Registrul Excel nu poate fi citit pentru PDF.');
            $opened = true;
            $styles = self::xml((string)$zip->getFromName('xl/styles.xml'));
            $formats = [0 => '#,##0.####', 1 => '0', 2 => '0.00', 9 => '0%', 10 => '0.00%', 14 => 'dd.mm.yyyy'];
            foreach ($styles->numFmts->numFmt as $format) $formats[(int)$format['numFmtId']] = (string)$format['formatCode'];
            $styleMap = [];
            foreach ($styles->cellXfs->xf as $xf) {
                $font = $styles->fonts->font[(int)$xf['fontId']];
                $fill = $styles->fills->fill[(int)$xf['fillId']];
                $align = (string)$xf->alignment['horizontal'];
                $styleMap[] = [
                    'format' => $formats[(int)$xf['numFmtId']] ?? '#,##0.####',
                    'css' => 'color:' . self::color($font->color, '#253047') . ';background:' . self::color($fill->patternFill->fgColor, '#ffffff')
                        . ';font-weight:' . (isset($font->b) ? 'bold' : 'normal') . ';text-align:' . (in_array($align, ['center','right'], true) ? $align : 'left') . ';',
                ];
            }
            $shared = [];
            $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
            if ($sharedXml !== false) foreach (self::xml($sharedXml)->si as $item) $shared[] = implode('', array_map('strval', $item->xpath('.//*[local-name()="t"]')));
            $book = self::xml((string)$zip->getFromName('xl/workbook.xml'));
            $html = '<!doctype html><html><head><meta charset="UTF-8"><style>@page{margin:25pt 22pt 30pt}body{font-family:"DejaVu Sans";font-size:8pt;color:#253047}h1{font-size:17pt;color:#19253b;margin:0 0 5pt}p{font-size:8pt;color:#64748b;margin:0 0 10pt}.section{page-break-before:always}.first{page-break-before:auto}table{width:100%;table-layout:auto;border-collapse:collapse}td{padding:5pt 4pt;border:0.4pt solid #dde3ea;vertical-align:middle;overflow-wrap:break-word}tr{page-break-inside:avoid}thead{display:table-header-group}.empty{height:7pt;padding:0;border:0}</style></head><body>';
            $sheetIndex = 0; $partIndex = 0;
            foreach ($book->sheets->sheet as $sheetInfo) {
                $sheetIndex++;
                $sheet = self::xml((string)$zip->getFromName('xl/worksheets/sheet' . $sheetIndex . '.xml'));
                $widths = [];
                foreach ($sheet->cols->col as $col) for ($i = (int)$col['min']; $i <= (int)$col['max']; $i++) $widths[$i] = (float)$col['width'];
                $cells = []; $lastCol = 1; $lastRow = 1;
                foreach ($sheet->sheetData->row as $row) {
                    $r = (int)$row['r']; $lastRow = max($lastRow, $r);
                    foreach ($row->c as $cell) {
                        $c = self::column((string)$cell['r']); $lastCol = max($lastCol, $c);
                        $style = $styleMap[(int)$cell['s']] ?? $styleMap[0];
                        $type = (string)$cell['t'];
                        if ($type === 'inlineStr') $value = implode('', array_map('strval', $cell->xpath('.//*[local-name()="t"]')));
                        elseif ($type === 's') $value = $shared[(int)$cell->v] ?? '';
                        else $value = self::formatted((string)$cell->v, $style['format']);
                        $cells[$r][$c] = ['value' => $value, 'css' => $style['css']];
                    }
                }
                $merges = [];
                foreach ($sheet->mergeCells->mergeCell as $merge) {
                    [$a,$b] = explode(':', (string)$merge['ref']);
                    $merges[] = [self::column($a), (int)preg_replace('/\D/', '', $a), self::column($b), (int)preg_replace('/\D/', '', $b)];
                }
                // Wide tables are continued in column bands; identifying columns repeat.
                $bands = $lastCol <= 16 ? [range(1, $lastCol)] : array_map(static fn(array $band): array => array_merge([1,2], $band), array_chunk(range(3, $lastCol), 10));
                foreach ($bands as $bandIndex => $columns) {
                    $html .= '<div class="section ' . ($partIndex++ === 0 ? 'first' : '') . '"><h1>G-TROTS · ' . self::esc((string)$sheetInfo['name']) . '</h1>';
                    if (count($bands) > 1) $html .= '<p>Grup de coloane ' . ($bandIndex + 1) . ' / ' . count($bands) . ' · Identificatorii se repetă pentru urmărirea acelorași înregistrări.</p>';
                    $totalWidth = array_sum(array_map(static fn(int $c): float => $widths[$c] ?? 16.0, $columns));
                    $headerEnd = (int)($sheet->sheetViews->sheetView->pane['ySplit'] ?? 0);
                    // Do not repeat more than the short table masthead on subsequent pages.
                    if ($headerEnd > 6) $headerEnd = 0;
                    $html .= '<table><colgroup>';
                    foreach ($columns as $column) $html .= '<col style="width:' . round(($widths[$column] ?? 16.0) / $totalWidth * 100, 3) . '%">';
                    $html .= '</colgroup>' . ($headerEnd ? '<thead>' : '<tbody>');
                    for ($r = 1; $r <= $lastRow; $r++) {
                        if ($headerEnd && $r === $headerEnd + 1) $html .= '</thead><tbody>';
                        $html .= '<tr>';
                        for ($position = 0; $position < count($columns); $position++) {
                            $c = $columns[$position]; $span = 1; $rowspan = 1; $sourceR = $r; $sourceC = $c; $skip = false;
                            foreach ($merges as [$c1,$r1,$c2,$r2]) {
                                if ($c < $c1 || $c > $c2 || $r < $r1 || $r > $r2) continue;
                                $visible = array_values(array_filter($columns, static fn(int $column): bool => $column >= $c1 && $column <= $c2));
                                if ($r !== $r1 || $c !== $visible[0]) { $skip = true; break; }
                                $span = count($visible); $rowspan = $r2 - $r1 + 1; $sourceR = $r1; $sourceC = $c1;
                                break;
                            }
                            if ($skip) continue;
                            $cell = $cells[$sourceR][$sourceC] ?? ['value'=>'','css'=>''];
                            $width = array_sum(array_map(static fn(int $column): float => $widths[$column] ?? 16.0, array_slice($columns, $position, $span))) / $totalWidth * 100;
                            $value = self::esc($cell['value']);
                            // Preserve all long text, allowing a wrap even for long identifiers.
                            $value = preg_replace('/([^\s<>]{24})(?=[^\s<>])/u', '$1&#8203;', $value) ?? $value;
                            $html .= '<td colspan="' . $span . '" rowspan="' . $rowspan . '" style="width:' . round($width, 3) . '%;' . $cell['css'] . '">' . nl2br($value) . '</td>';
                        }
                        $html .= '</tr>';
                    }
                    $html .= ($headerEnd && $lastRow <= $headerEnd ? '</thead>' : '</tbody>') . '</table></div>';
                }
            }
            return $html . '</body></html>';
        } finally {
            if ($opened) $zip->close();
            @unlink($path);
        }
    }

    public static function render(string $workbook): string
    {
        require_once __DIR__ . '/nir-pdf.php';
        $options = new Dompdf\Options();
        $options->set('isRemoteEnabled', false);
        $options->set('isPhpEnabled', false);
        $options->set('isFontSubsettingEnabled', true);
        $pdf = new Dompdf\Dompdf($options);
        // Draw vectors directly: a large register must not allocate a DOM layout
        // frame for every cell, as the HTML table engine does.
        $canvas = new Dompdf\Adapter\CPDF('a3', 'landscape', $pdf);
        $metrics = $pdf->getFontMetrics();
        $regular = $metrics->getFont('DejaVu Sans', 'normal');
        $bold = $metrics->getFont('DejaVu Sans', 'bold');
        $rgb = static function (string $hex): array {
            $hex = ltrim($hex, '#');
            return [hexdec(substr($hex,0,2))/255,hexdec(substr($hex,2,2))/255,hexdec(substr($hex,4,2))/255];
        };
        $wrap = static function (string $text, string $font, float $width) use ($metrics): array {
            $result = [];
            foreach (explode("\n", str_replace(["\r", "\u{200B}"], '', $text)) as $paragraph) {
                $line = '';
                foreach (preg_split('/\s+/u', trim($paragraph)) ?: [] as $word) {
                    if ($metrics->getTextWidth(trim($line . ' ' . $word), $font, 8) <= $width) { $line = trim($line . ' ' . $word); continue; }
                    if ($line !== '') { $result[] = $line; $line = ''; }
                    foreach (preg_split('//u', $word, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $char) {
                        if ($line !== '' && $metrics->getTextWidth($line . $char, $font, 8) > $width) { $result[] = $line; $line = ''; }
                        $line .= $char;
                    }
                }
                $result[] = $line;
            }
            return $result ?: [''];
        };
        $document = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        try { $document->loadHTML('<?xml encoding="UTF-8">' . self::html($workbook), LIBXML_NONET); }
        finally { libxml_clear_errors(); libxml_use_internal_errors($previous); }
        $xpath = new DOMXPath($document);
        $first = true; $right = $canvas->get_width()-22; $bottom = $canvas->get_height()-32;
        foreach ($xpath->query('//body/div') as $section) {
            if (!$first) $canvas->new_page(); $first = false;
            $title = $xpath->evaluate('string(./h1)', $section);
            $subtitle = $xpath->evaluate('string(./p)', $section);
            $startPage = static function () use ($canvas,$title,$subtitle,$bold,$regular): float {
                $canvas->text(22,25,$title,$bold,17,[.1,.15,.23]);
                if ($subtitle !== '') $canvas->text(22,50,$subtitle,$regular,8,[.38,.45,.55]);
                return $subtitle !== '' ? 69.0 : 55.0;
            };
            $y = $startPage(); $widths=[];
            foreach ($xpath->query('.//colgroup/col',$section) as $col) {
                preg_match('/width:([\d.]+)%/', $col->getAttribute('style'), $match);
                $widths[] = ($right-22)*(float)($match[1] ?? 10)/100;
            }
            $rows=[]; $occupied=[];
            foreach ($xpath->query('.//tr',$section) as $rowIndex=>$row) {
                $cells=[]; $column=0; $maxLines=1;
                foreach ($xpath->query('./td',$row) as $cell) {
                    while (($occupied[$column]??-1) >= $rowIndex) $column++;
                    $span=max(1,(int)$cell->getAttribute('colspan'));
                    $rowspan=max(1,(int)$cell->getAttribute('rowspan'));
                    for($c=$column;$c<$column+$span;$c++) $occupied[$c]=$rowIndex+$rowspan-1;
                    $x=22+array_sum(array_slice($widths,0,$column));
                    $width=array_sum(array_slice($widths,$column,$span));
                    $style=$cell->getAttribute('style');$css=[];
                    foreach(explode(';',$style) as $rule) { $pair=explode(':',$rule,2);if(count($pair)===2)$css[trim($pair[0])]=trim($pair[1]); }
                    $font=($css['font-weight']??'')==='bold'?$bold:$regular;
                    $text=''; foreach($cell->childNodes as $child) $text.=$child->nodeName==='br'?"\n":$child->textContent;
                    $lines=$wrap($text,$font,max(5,$width-8));$maxLines=max($maxLines,count($lines));
                    $cells[]=['x'=>$x,'width'=>$width,'font'=>$font,'lines'=>$lines,'fill'=>$rgb($css['background']??'#ffffff'),'color'=>$rgb($css['color']??'#253047'),'align'=>$css['text-align']??'left'];
                    $column+=$span;
                }
                $rows[]=['cells'=>$cells,'lines'=>$maxLines,'header'=>$row->parentNode->nodeName==='thead'];
            }
            $draw = static function(array $row,float $top,int $offset=0,?int $limit=null) use ($canvas,$metrics): float {
                $count=$limit??$row['lines'];$height=$count*11+10;
                foreach($row['cells'] as $cell){
                    $canvas->filled_rectangle($cell['x'],$top,$cell['width'],$height,$cell['fill']);
                    $canvas->rectangle($cell['x'],$top,$cell['width'],$height,[.86,.89,.92],.35);
                    foreach(array_slice($cell['lines'],$offset,$count) as $i=>$line){
                        $textWidth=$metrics->getTextWidth($line,$cell['font'],8);
                        $x=$cell['x']+4;
                        if($cell['align']==='right')$x=$cell['x']+$cell['width']-4-$textWidth;
                        elseif($cell['align']==='center')$x=$cell['x']+($cell['width']-$textWidth)/2;
                        $canvas->text($x,$top+4+$i*11,$line,$cell['font'],8,$cell['color']);
                    }
                }
                return $height;
            };
            $headers=array_values(array_filter($rows,static fn(array $r):bool=>$r['header']));
            foreach($rows as $row){
                $needed=$row['lines']*11+10;
                if($y+$needed>$bottom && !$row['header']){
                    $canvas->new_page();$y=$startPage();
                    foreach($headers as $header)$y+=$draw($header,$y);
                }
                $offset=0;
                while($offset<$row['lines']){
                    $available=max(1,(int)floor(($bottom-$y-10)/11));
                    $count=min($available,$row['lines']-$offset);
                    $y+=$draw($row,$y,$offset,$count);$offset+=$count;
                    if($offset<$row['lines']){
                        $canvas->new_page();$y=$startPage();
                        foreach($headers as $header)$y+=$draw($header,$y);
                    }
                }
            }
        }
        $canvas->page_text(22,$canvas->get_height()-20,'G-Trots · Pagina {PAGE_NUM} / {PAGE_COUNT}',$regular,7,[.38,.45,.55]);
        return $canvas->output(['compress'=>true]);
    }
}
