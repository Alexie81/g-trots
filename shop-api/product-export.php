<?php
declare(strict_types=1);

require_once __DIR__ . '/nir-service.php';
require_once __DIR__ . '/nir-xlsx.php';

/** Read-only catalog snapshot; supplier joins must never multiply stock/sales. */
final class GtrotsProductExport
{
    public static function taxonomy(PDO $db, string $kind): array
    {
        $titles = ['categories' => 'Categorii', 'brands' => 'Compatibilități', 'manufacturers' => 'Producători'];
        if (!isset($titles[$kind])) throw new InvalidArgumentException('Tipul catalogului nu este valid.');
        if ($kind === 'categories') {
            $items = $db->query('SELECT c.*, parent.name AS parent_name,(SELECT COUNT(*) FROM shop_products p WHERE p.category_id=c.id) AS product_count FROM shop_categories c LEFT JOIN shop_categories parent ON parent.id=c.parent_id ORDER BY COALESCE(parent.name,c.name),c.parent_id IS NOT NULL,c.name')->fetchAll(PDO::FETCH_ASSOC);
            $headers = ['Denumire categorie','Categorie părinte','Identificator URL','Descriere','Stare','Număr produse'];
            $data = array_map(static fn(array $item): array => [$item['name'],$item['parent_name'] ?: 'Categorie principală',$item['slug'],trim(strip_tags((string)$item['description'])),$item['is_active'] ? 'Activă' : 'Inactivă',(int)$item['product_count']], $items);
            $widths = [35,35,35,55,18,18];
        } else {
            $count = $kind === 'brands' ? 'SELECT COUNT(DISTINCT pb.product_id) FROM shop_product_brands pb WHERE pb.brand_id=c.id' : 'SELECT COUNT(*) FROM shop_products p WHERE p.manufacturer_id=c.id';
            $items = $db->query('SELECT c.*,(' . $count . ') AS product_count FROM shop_' . $kind . ' c ORDER BY c.name,c.id')->fetchAll(PDO::FETCH_ASSOC);
            $headers = [$kind === 'brands' ? 'Compatibilitate' : 'Producător','Identificator URL','Website','Stare','Număr produse'];
            $data = array_map(static fn(array $item): array => [$item['name'],$item['slug'],$item['website_url'] ?? '',$item['is_active'] ? 'Activ' : 'Inactiv',(int)$item['product_count']], $items);
            $widths = [38,38,55,18,18];
        }
        return ['file_name' => 'G-Trots-' . $kind . '-' . date('Y-m-d-His') . '.xlsx', 'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'content_base64' => base64_encode(self::table($titles[$kind], $headers, $data, $widths)), 'item_count' => count($items)];
    }

    /** Branded read-only registry, shared by catalog and invoice exports. */
    public static function table(string $title, array $headers, array $data, array $widths, string $subtitle = ''): string
    {
        // Keep the masthead visible on opening even in the wide accounting registry.
        $lastCol = shopNirPremiumXlsxColumn(min(8, count($headers)));
        $rows = shopNirPremiumXlsxRow(1, [2 => shopNirPremiumXlsxCellSpec('G-Trots România · ' . $title, 'string', 15)], 34);
        $rows .= shopNirPremiumXlsxRow(2, [2 => shopNirPremiumXlsxCellSpec(count($data) . ' înregistrări · ' . date('d.m.Y H:i'), 'string', 16)], 25);
        $rows .= shopNirPremiumXlsxRow(3, [2 => shopNirPremiumXlsxCellSpec($subtitle ?: 'Date exportate pe baza selecției electronice din cadrul aplicației G-Trots CRM.', 'string', 16)], 30);
        $rows .= shopNirPremiumXlsxRow(4, [], 15);
        $cells = [];
        foreach ($headers as $i => $header) $cells[$i + 1] = shopNirPremiumXlsxCellSpec($header, 'string', 3);
        $rows .= shopNirPremiumXlsxRow(5, $cells, 40);
        $row = 6;
        foreach ($data as $index => $values) {
            $cells = []; $style = $index % 2 === 0 ? 4 : 6;
            foreach ($values as $i => $value) {
                $numeric = is_int($value) || is_float($value);
                $cells[$i + 1] = shopNirPremiumXlsxCellSpec($value, $numeric ? 'number' : 'string', is_float($value) ? ($index % 2 === 0 ? 13 : 14) : ($numeric ? $style + 1 : $style));
            }
            $lineCount = max(array_map(static fn($value): int => substr_count((string)$value, "\n") + 1, $values));
            $rows .= shopNirPremiumXlsxRow($row++, $cells, max(48, min(400, $lineCount * 24)));
        }
        $merges = ['B1:' . $lastCol . '1','B2:' . $lastCol . '2','B3:' . $lastCol . '3','A' . $row . ':' . $lastCol . $row];
        $rows .= shopNirPremiumXlsxRow($row, [1 => shopNirPremiumXlsxCellSpec('Export realizat din cadrul aplicației G-Trots CRM.', 'string', 2)], 30);
        $media = []; $mediaIndex = []; $anchors = [];
        if ($logo = shopNirPremiumXlsxLogoImage(96, 96)) {
            $name = shopNirPremiumXlsxRegisterMedia($media, $mediaIndex, $logo, 'logo');
            $scale = min(68 / $logo['width'], 68 / $logo['height']);
            $anchors[] = ['media' => $name,'name' => 'G-Trots','col' => 0,'row' => 0,'colOff' => 76000,'rowOff' => 76000,'cx' => (int)($logo['width']*$scale*9525),'cy' => (int)($logo['height']*$scale*9525)];
        }
        return self::workbook($title, $rows, $widths, $row, $merges, $anchors, $media);
    }

    public static function download(PDO $db, array $input): array
    {
        $ids = $input['source_ids'] ?? null;
        if ($ids !== null && (!is_array($ids) || !$ids || count($ids) > 500)) {
            throw new InvalidArgumentException('Selectează cel puțin o sursă pentru export.');
        }
        $params = []; $where = '1=1';
        if ($ids !== null) {
            foreach ($ids as $id) if (!is_string($id) || strlen($id) > 128) throw new InvalidArgumentException('Sursa selectată nu este validă.');
            $ids = array_values(array_unique(array_map('strval', $ids)));
            $unassigned = in_array('__unassigned', $ids, true);
            $params = array_values(array_filter($ids, static fn(string $id): bool => $id !== '__unassigned'));
            $parts = $params ? ['p.source_id IN (' . implode(',', array_fill(0, count($params), '?')) . ')'] : [];
            if ($unassigned) $parts[] = "(p.source_id IS NULL OR p.source_id='')";
            $where = '(' . implode(' OR ', $parts) . ')';
        }
        $stmt = $db->prepare("SELECT p.id,p.name,p.slug,p.sku,p.supplier_external_id,p.supplier_product_code,p.source_domain,
            p.stock_mode,p.stock_quantity,p.accounting_stock_quantity,p.supplier_stock_quantity,p.view_count,
            COALESCE(s.name,p.source_domain,'Fără sursă') AS source_name,
            (SELECT image_path FROM shop_product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort_order,pi.created_at LIMIT 1) AS image_path
            FROM shop_products p LEFT JOIN shop_product_sources s ON s.id=p.source_id
            WHERE {$where} ORDER BY source_name,p.name,p.id");
        $stmt->execute($params);
        $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$products) throw new InvalidArgumentException('Sursele selectate nu conțin produse.');
        $stmt = $db->prepare("SELECT oi.product_id,SUM(oi.quantity) AS units_sold FROM shop_order_items oi
            INNER JOIN shop_orders o ON o.id=oi.order_id INNER JOIN shop_products p ON p.id=oi.product_id
            WHERE {$where} AND o.payment_status='paid' AND o.status NOT IN ('cancelled','return_confirmed','refunded') GROUP BY oi.product_id");
        $stmt->execute($params);
        $sales = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        $stmt = $db->prepare("SELECT r.product_id,COUNT(*) AS review_count,AVG(r.rating) AS review_average
            FROM shop_product_reviews r INNER JOIN shop_products p ON p.id=r.product_id WHERE {$where} GROUP BY r.product_id");
        $stmt->execute($params);
        $reviews = [];
        while ($review = $stmt->fetch(PDO::FETCH_ASSOC)) $reviews[$review['product_id']] = $review;
        $stmt = $db->prepare("SELECT r.product_id,r.supplier_product_code_original AS code,s.name AS supplier_name,s.alias AS supplier_alias
            FROM shop_supplier_product_references r INNER JOIN shop_suppliers s ON s.id=r.supplier_id
            INNER JOIN shop_products p ON p.id=r.product_id WHERE {$where}
            ORDER BY r.product_id,s.name,r.supplier_product_code_original");
        $stmt->execute($params);
        $references = [];
        while ($ref = $stmt->fetch(PDO::FETCH_ASSOC)) $references[$ref['product_id']][] = $ref;
        foreach ($products as &$product) {
            $product['units_sold'] = (int)($sales[$product['id']] ?? 0);
            $product['review_count'] = (int)($reviews[$product['id']]['review_count'] ?? 0);
            $product['review_average'] = $reviews[$product['id']]['review_average'] ?? null;
            if (empty($product['image_path']) && function_exists('legacyProductImageUrl')) {
                $product['image_path'] = legacyProductImageUrl($product, []);
            }
            $product['references'] = $references[$product['id']] ?? [];
            // Legacy imported codes have a source, but not necessarily a supplier record.
            $legacy = trim((string)($product['supplier_product_code'] ?? ''));
            if ($legacy !== '' && !in_array($legacy, array_column($product['references'], 'code'), true)) {
                $product['references'][] = ['code' => $legacy, 'supplier_name' => $product['source_name'] . ' (sursă import)'];
            }
        }
        unset($product);
        $started = microtime(true);
        $bytes = self::render($products);
        return ['file_name' => 'G-Trots-Produse-' . date('Y-m-d-His') . '.xlsx',
            'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'content_base64' => base64_encode($bytes), 'product_count' => count($products),
            'generation_seconds' => round(microtime(true) - $started, 2)];
    }

    public static function render(array $products): string
    {
        $headers = ['Imagine', 'Nume produs', 'Cod mamă / cod site (SKU)', 'Cod extern sursă', 'Sursă produs',
            'Stoc online (buc.)', 'Stoc fizic (buc.)', 'Stoc furnizor (buc.)', 'Bucăți vândute', 'Vizualizări website', 'Cod furnizor', 'Nume furnizor', 'Rating mediu (din 5)', 'Număr de recenzii'];
        $rows = shopNirPremiumXlsxRow(1, [2 => shopNirPremiumXlsxCellSpec('G-Trots România · Catalog produse', 'string', 15)], 32);
        $rows .= shopNirPremiumXlsxRow(2, [2 => shopNirPremiumXlsxCellSpec(count($products) . ' produse · Exportat la ' . date('d.m.Y H:i'), 'string', 16)], 25);
        $rows .= shopNirPremiumXlsxRow(3, [2 => shopNirPremiumXlsxCellSpec('Stoc fizic = stoc contabil. Vândute = comenzi plătite, fără anulări, retururi confirmate și rambursări.', 'string', 16)], 28);
        $rows .= shopNirPremiumXlsxRow(4, [2 => shopNirPremiumXlsxCellSpec('Toate produsele sunt exportate pe baza selecției electronice din cadrul aplicației G-Trots CRM.', 'string', 16)], 28);
        $cells = [];
        foreach ($headers as $i => $header) $cells[$i + 1] = shopNirPremiumXlsxCellSpec($header, 'string', in_array($i, [1, 2], true) ? 10 : 3);
        $rows .= shopNirPremiumXlsxRow(5, $cells, 36);
        $merges = ['B1:N1', 'B2:N2', 'B3:N3', 'B4:N4'];
        $media = []; $mediaIndex = []; $anchors = [];
        $addImage = static function (?array $image, int $row, int $height, string $name) use (&$media, &$mediaIndex, &$anchors): bool {
            if (!$image) return false;
            $mediaName = shopNirPremiumXlsxRegisterMedia($media, $mediaIndex, $image, 'product');
            $scale = min(76 / max(1, $image['width']), $height / max(1, $image['height']));
            $anchors[] = ['media' => $mediaName, 'name' => $name, 'description' => $name, 'col' => 0, 'row' => $row - 1,
                'colOff' => 76000, 'rowOff' => 76000, 'cx' => (int)round($image['width'] * $scale * 9525), 'cy' => (int)round($image['height'] * $scale * 9525)];
            return true;
        };
        $addImage(shopNirPremiumXlsxLogoImage(96, 96), 1, 68, 'G-Trots');
        $row = 6;
        foreach ($products as $index => $product) {
            $refs = $product['references'] ?: [['code' => '', 'supplier_name' => 'Nespecificat']];
            $height = max(24, 64 / count($refs));
            $hasImage = $addImage(self::thumbnail((string)($product['image_path'] ?? '')), $row, 68, (string)$product['name']);
            if (!$hasImage) throw new InvalidArgumentException('Imaginea produsului „' . $product['name'] . '” nu a putut fi încărcată. Exportul nu a fost generat incomplet. Reîncearcă sau verifică imaginea produsului.');
            $style = $index % 2 === 0 ? 4 : 6;
            $values = ['', $product['name'], $product['sku'], $product['supplier_external_id'] ?? '', $product['source_name'],
                $product['stock_mode'] === 'unlimited' ? 'Nelimitat' : (int)$product['stock_quantity'], (int)$product['accounting_stock_quantity'],
                (int)$product['supplier_stock_quantity'], (int)$product['units_sold'], (int)$product['view_count']];
            $start = $row;
            foreach ($refs as $refIndex => $ref) {
                $cells = [];
                foreach ($values as $col => $value) {
                    $numeric = is_int($value) || is_float($value);
                    $cellStyle = in_array($col, [1, 2], true) ? ($index % 2 === 0 ? 8 : 9) : ($numeric ? $style + 1 : $style);
                    $cells[$col + 1] = shopNirPremiumXlsxCellSpec($refIndex === 0 ? $value : null, $numeric ? 'number' : 'string', $cellStyle);
                }
                $cells[11] = shopNirPremiumXlsxCellSpec($ref['code'], 'string', $style);
                $supplier = (string)$ref['supplier_name'];
                if (!empty($ref['supplier_alias']) && $ref['supplier_alias'] !== $supplier) $supplier .= ' (' . $ref['supplier_alias'] . ')';
                $cells[12] = shopNirPremiumXlsxCellSpec($supplier, 'string', $style);
                $rating = $product['review_average'] === null ? 'Fără recenzii' : round((float)$product['review_average'], 2);
                $cells[13] = shopNirPremiumXlsxCellSpec($refIndex === 0 ? $rating : null, is_float($rating) ? 'number' : 'string', is_float($rating) ? ($index % 2 === 0 ? 11 : 12) : $style);
                $cells[14] = shopNirPremiumXlsxCellSpec($refIndex === 0 ? $product['review_count'] : null, 'number', $style + 1);
                $rows .= shopNirPremiumXlsxRow($row++, $cells, $height);
            }
            if ($row - $start > 1) foreach ([1,2,3,4,5,6,7,8,9,10,13,14] as $col) {
                $letter = shopNirPremiumXlsxColumn($col);
                $merges[] = $letter . $start . ':' . $letter . ($row - 1);
            }
        }
        $merges[] = 'A' . $row . ':N' . $row;
        $rows .= shopNirPremiumXlsxRow($row++, [1 => shopNirPremiumXlsxCellSpec('Export realizat din cadrul aplicației G-Trots CRM.', 'string', 2)], 30);
        return self::workbook('Produse', $rows, [13,32,22,20,23,14,14,14,14,17,24,32,19,18], $row - 1, $merges, $anchors, $media);
    }

    private static function workbook(string $title, string $rows, array $widths, int $lastRow, array $merges, array $anchors, array $media): string
    {
        $ns = 'http://schemas.openxmlformats.org/';
        $prefix = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
        $files = [
            '[Content_Types].xml' => $prefix . '<Types xmlns="' . $ns . 'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' . ($anchors ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : '') . '</Types>',
            '_rels/.rels' => $prefix . '<Relationships xmlns="' . $ns . 'package/2006/relationships"><Relationship Id="rId1" Type="' . $ns . 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
            'xl/workbook.xml' => $prefix . '<workbook xmlns="' . $ns . 'spreadsheetml/2006/main" xmlns:r="' . $ns . 'officeDocument/2006/relationships"><sheets><sheet name="' . htmlspecialchars($title, ENT_XML1) . '" sheetId="1" r:id="rId1"/></sheets></workbook>',
            'xl/_rels/workbook.xml.rels' => $prefix . '<Relationships xmlns="' . $ns . 'package/2006/relationships"><Relationship Id="rId1" Type="' . $ns . 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' . $ns . 'officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
            'xl/styles.xml' => self::styles(),
            'xl/worksheets/sheet1.xml' => shopNirPremiumXlsxSheet($rows, $widths, $lastRow, count($widths),
                ['merges' => $merges, 'freeze_rows' => 5, 'freeze_columns' => 2, 'drawing' => (bool)$anchors,
                 'header' => '&LG-Trots România · Catalog produse', 'footer' => '&LExport realizat din cadrul aplicației G-Trots CRM&RPagina &P / &N']),
        ];
        if ($anchors) {
            $drawing = shopNirPremiumXlsxDrawing($anchors);
            $files['xl/drawings/drawing1.xml'] = $drawing['xml'];
            $files['xl/drawings/_rels/drawing1.xml.rels'] = $drawing['rels'];
            $files['xl/worksheets/_rels/sheet1.xml.rels'] = $prefix . '<Relationships xmlns="' . $ns . 'package/2006/relationships"><Relationship Id="rId1" Type="' . $ns . 'officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
            foreach ($media as $name => $bytes) $files['xl/media/' . $name] = $bytes;
        }
        // Compress XML and thumbnails to keep downloads and mobile memory small.
        if (class_exists('ZipArchive')) {
            $path = tempnam(sys_get_temp_dir(), 'gt-products-');
            if ($path === false) throw new RuntimeException('Exportul nu poate crea fișierul temporar.');
            try {
                $zip = new ZipArchive();
                if ($zip->open($path, ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Exportul XLSX nu poate fi pregătit.');
                foreach ($files as $name => $bytes) $zip->addFromString($name, $bytes);
                $zip->close();
                return (string)file_get_contents($path);
            } finally { unlink($path); }
        }
        return shopNirBuildZip($files);
    }

    private static function styles(): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
        $xml .= '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00 &quot;/ 5&quot;"/></numFmts>';
        $xml .= '<fonts count="4"><font><sz val="11"/><name val="Arial"/><color rgb="FF253047"/></font><font><b/><sz val="20"/><name val="Arial"/><color rgb="FF19253B"/></font><font><sz val="10"/><name val="Arial"/><color rgb="FF64748B"/></font><font><b/><sz val="11"/><name val="Arial"/><color rgb="FF19253B"/></font></fonts>';
        $xml .= '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF9000"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4E8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11">';
        $xml = str_replace('cellXfs count="11"', 'cellXfs count="17"', $xml);
        foreach ([[0,0,49],[1,0,49],[2,0,49],[3,2,49],[0,0,49],[0,0,3],[0,3,49],[0,3,3],[0,0,49],[0,3,49],[3,2,49],[0,0,164],[0,3,164],[0,0,4],[0,3,4],[1,0,49],[2,0,49]] as $index => [$font,$fill,$num]) {
            $left = in_array($index, [8,9,10,15,16], true);
            $xml .= '<xf fontId="' . $font . '" fillId="' . $fill . '" borderId="0" numFmtId="' . $num . '" xfId="0" applyAlignment="1" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment vertical="center" horizontal="' . ($left ? 'left' : 'center') . '"' . ($left ? ' indent="1"' : '') . ' wrapText="1"/></xf>';
        }
        return $xml . '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    }

    /** Reuse small local thumbnails between exports; never fetch arbitrary URLs. */
    private static function thumbnail(string $url): ?array
    {
        $path = rawurldecode((string)(parse_url($url, PHP_URL_PATH) ?: $url));
        if (!preg_match('#(?:^|/)(uploads/products|assets/products)/([A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif))$#i', $path, $match)) return null;
        $root = $match[1] === 'assets/products' ? dirname(__DIR__) : __DIR__;
        $base = realpath($root . '/' . $match[1]);
        $source = realpath($root . '/' . $match[1] . '/' . $match[2]);
        if (!$base || !$source || !str_starts_with($source, $base . DIRECTORY_SEPARATOR) || !is_file($source)) return null;
        $version = filemtime($source) . ':' . filesize($source);
        $directory = sys_get_temp_dir() . '/gt-products-thumbnails-' . substr(hash('sha256', __DIR__), 0, 12);
        $cache = $directory . '/' . hash('sha256', $source) . '.json';
        if (is_file($cache) && filesize($cache) < 200000) {
            $saved = json_decode((string)@file_get_contents($cache), true);
            if (is_array($saved) && ($saved['version'] ?? '') === $version && isset($saved['image']['bytes'])) {
                $image = $saved['image'];
                $image['bytes'] = base64_decode($image['bytes'], true);
                if (is_string($image['bytes'])) return $image;
            }
        }
        $size = filesize($source);
        if ($size < 32 || $size > 15 * 1024 * 1024) return null;
        $bytes = (string)file_get_contents($source);
        $info = @getimagesizefromstring($bytes);
        if (!$info || $info[0] * $info[1] > 30000000) return null;
        // Imported GIFs are valid catalog images too; convert to an Excel-compatible PNG.
        if (($info['mime'] ?? '') === 'image/gif' && function_exists('imagecreatefromstring')) {
            $gif = @imagecreatefromstring($bytes);
            if (!$gif) return null;
            ob_start(); imagepng($gif); $bytes = (string)ob_get_clean(); imagedestroy($gif);
        }
        $image = shopNirPremiumXlsxNormaliseImage($bytes, 180, 180, false);
        if ($image && !in_array($image['extension'], ['png','jpg','jpeg'], true)) return null;
        if ($image) {
            if (!is_dir($directory)) @mkdir($directory, 0700, true);
            $saved = $image; $saved['bytes'] = base64_encode($image['bytes']);
            @file_put_contents($cache, json_encode(['version' => $version, 'image' => $saved]), LOCK_EX);
        }
        return $image;
    }
}
