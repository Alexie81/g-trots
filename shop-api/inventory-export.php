<?php
declare(strict_types=1);

require_once __DIR__ . '/nir-service.php';
require_once __DIR__ . '/nir-xlsx.php';

/**
 * Read-only accounting stock register.
 *
 * The workbook combines the stock snapshot, chronological movements, source
 * documents and per-product warehouse cards without mutating operational data.
 */
final class GtrotsInventoryExport
{
    public static function range($from, $to): array
    {
        $from = trim((string)($from ?? ''));
        $to = trim((string)($to ?? ''));
        if ($from === '' && $to === '') return ['', ''];
        if ($from === '' || $to === '') throw new InvalidArgumentException('Completează ambele date ale perioadei.');
        foreach ([$from, $to] as $value) {
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
            if (!$date || $date->format('Y-m-d') !== $value) throw new InvalidArgumentException('Perioada selectată nu este validă.');
        }
        if ($from > $to) throw new InvalidArgumentException('Data de început trebuie să fie înaintea datei de sfârșit.');
        return [$from, $to];
    }

    public static function estimate(PDO $db, array $input): array
    {
        [$from, $to] = self::range($input['from'] ?? '', $input['to'] ?? '');
        [$where, $params] = self::movementWhere($from, $to, 'im');
        $products = (int)$db->query('SELECT COUNT(*) FROM shop_products WHERE is_accounting_stock_tracked = 1')->fetchColumn();
        $stmt = $db->prepare('SELECT COUNT(*) AS movement_count,
            COUNT(DISTINCT CASE WHEN im.nir_document_id IS NOT NULL AND im.nir_document_id <> "" THEN im.nir_document_id WHEN im.sales_invoice_id IS NOT NULL AND im.sales_invoice_id <> "" THEN im.sales_invoice_id ELSE im.id END) AS document_count
            FROM shop_inventory_movements im INNER JOIN shop_products p ON p.id = im.product_id
            WHERE p.is_accounting_stock_tracked = 1' . $where);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $movements = (int)($row['movement_count'] ?? 0);
        $documents = (int)($row['document_count'] ?? 0);
        return [
            'from' => $from,
            'to' => $to,
            'product_count' => $products,
            'movement_count' => $movements,
            'document_count' => $documents,
            'estimated_seconds' => max(1, (int)ceil(($products + $movements * 1.8 + $documents) / 800)),
        ];
    }

    public static function download(PDO $db, array $input): array
    {
        [$from, $to] = self::range($input['from'] ?? '', $input['to'] ?? '');
        $started = microtime(true);
        $snapshot = self::snapshot($db, $from, $to);
        $bytes = self::render($snapshot);
        $suffix = $from === '' ? 'toata-perioada' : $from . '--' . $to;
        return [
            'file_name' => 'G-Trots-Centralizator-Stocuri-' . $suffix . '-' . date('Ymd-His') . '.xlsx',
            'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'content_base64' => base64_encode($bytes),
            'product_count' => count($snapshot['products']),
            'movement_count' => count($snapshot['movements']),
            'document_count' => count($snapshot['documents']),
            'generation_seconds' => round(microtime(true) - $started, 2),
        ];
    }

    private static function snapshot(PDO $db, string $from, string $to): array
    {
        $company = $db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch(PDO::FETCH_ASSOC) ?: [];
        $products = $db->query(
            'SELECT p.id, p.name, p.sku, p.stock_mode, p.stock_quantity, p.accounting_stock_quantity,
                    COALESCE(f.fifo_quantity, 0) AS fifo_quantity, COALESCE(f.fifo_value, 0) AS fifo_value
             FROM shop_products p
             LEFT JOIN (
                SELECT product_id, SUM(remaining_quantity) AS fifo_quantity, SUM(remaining_quantity * unit_cost_ron) AS fifo_value
                FROM shop_inventory_cost_layers WHERE is_reversed = 0 AND remaining_quantity > 0 GROUP BY product_id
             ) f ON f.product_id = p.id
             WHERE p.is_accounting_stock_tracked = 1
             ORDER BY p.name ASC, p.id ASC'
        )->fetchAll(PDO::FETCH_ASSOC);

        [$where, $params] = self::movementWhere($from, $to, 'im');
        $stmt = $db->prepare(
            'SELECT im.*, p.name AS product_name, p.sku AS product_sku,
                    w.code AS warehouse_code, w.name AS warehouse_name,
                    n.nir_number, n.temporary_number, n.operation_type AS nir_operation_type,
                    n.supplier_invoice_series, n.supplier_invoice_number, n.supplier_invoice_date,
                    n.reception_date AS nir_reception_date, n.customer_name AS nir_customer_name,
                    s.name AS supplier_name, s.alias AS supplier_alias,
                    i.series AS output_invoice_series, i.invoice_number AS output_invoice_number, i.issue_date AS output_invoice_date,
                    o.order_number, o.customer_name AS order_customer_name, o.company_name AS order_company_name
             FROM shop_inventory_movements im
             INNER JOIN shop_products p ON p.id = im.product_id
             LEFT JOIN shop_warehouses w ON w.id = im.warehouse_id
             LEFT JOIN shop_nir_documents n ON n.id = im.nir_document_id
             LEFT JOIN shop_suppliers s ON s.id = n.supplier_id
             LEFT JOIN shop_invoices i ON i.id = im.sales_invoice_id
             LEFT JOIN shop_orders o ON o.id = im.order_id
             WHERE p.is_accounting_stock_tracked = 1' . $where . '
             ORDER BY im.created_at ASC, im.id ASC'
        );
        $stmt->execute($params);
        $movements = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $afterByProduct = [];
        if ($to !== '') {
            $after = $db->prepare(
                'SELECT im.product_id,
                        SUM(COALESCE(im.accounting_quantity_delta, im.quantity_delta, 0)) AS quantity_delta,
                        SUM(CASE WHEN COALESCE(im.accounting_quantity_delta, im.quantity_delta, 0) >= 0 THEN ABS(COALESCE(im.inventory_cost_total_ron, 0)) ELSE -ABS(COALESCE(im.inventory_cost_total_ron, 0)) END) AS value_delta,
                        SUM(COALESCE(im.fifo_quantity_pending, 0)) AS fifo_pending
                 FROM shop_inventory_movements im INNER JOIN shop_products p ON p.id = im.product_id
                 WHERE p.is_accounting_stock_tracked = 1 AND im.created_at > ? GROUP BY im.product_id'
            );
            $after->execute([$to . ' 23:59:59']);
            while ($row = $after->fetch(PDO::FETCH_ASSOC)) $afterByProduct[(string)$row['product_id']] = $row;
        }

        $periodByProduct = [];
        foreach ($movements as &$movement) {
            $delta = self::delta($movement);
            $movement['export_direction'] = $delta >= 0 ? 'Intrare' : 'Ieșire';
            $movement['export_quantity'] = abs($delta);
            $movement['export_document_type'] = self::documentType($movement);
            $movement['export_document_number'] = self::documentNumber($movement);
            $movement['export_party'] = self::party($movement);
            $movement['export_unit'] = 'buc.';
            $movement['export_inventory_value'] = abs((float)($movement['inventory_cost_total_ron'] ?? 0));
            $productId = (string)$movement['product_id'];
            if (!isset($periodByProduct[$productId])) $periodByProduct[$productId] = ['delta' => 0.0, 'entries' => 0.0, 'exits' => 0.0, 'value_delta' => 0.0, 'entry_value' => 0.0, 'exit_value' => 0.0, 'pending' => 0.0, 'count' => 0];
            $cost = abs((float)($movement['inventory_cost_total_ron'] ?? 0));
            $periodByProduct[$productId]['delta'] += $delta;
            $periodByProduct[$productId][$delta >= 0 ? 'entries' : 'exits'] += abs($delta);
            $periodByProduct[$productId]['value_delta'] += $delta >= 0 ? $cost : -$cost;
            $periodByProduct[$productId][$delta >= 0 ? 'entry_value' : 'exit_value'] += $cost;
            $periodByProduct[$productId]['pending'] += (float)($movement['fifo_quantity_pending'] ?? 0);
            $periodByProduct[$productId]['count']++;
        }
        unset($movement);

        foreach ($products as &$product) {
            $id = (string)$product['id'];
            $period = $periodByProduct[$id] ?? ['delta' => 0.0, 'entries' => 0.0, 'exits' => 0.0, 'value_delta' => 0.0, 'entry_value' => 0.0, 'exit_value' => 0.0, 'pending' => 0.0, 'count' => 0];
            $after = $afterByProduct[$id] ?? ['quantity_delta' => 0, 'value_delta' => 0, 'fifo_pending' => 0];
            $closingQuantity = (float)$product['accounting_stock_quantity'] - (float)$after['quantity_delta'];
            $closingValue = (float)$product['fifo_value'] - (float)$after['value_delta'];
            $product['opening_quantity'] = $closingQuantity - (float)$period['delta'];
            $product['entry_quantity'] = (float)$period['entries'];
            $product['exit_quantity'] = (float)$period['exits'];
            $product['closing_quantity'] = $closingQuantity;
            $product['opening_value'] = $closingValue - (float)$period['value_delta'];
            $product['entry_value'] = (float)$period['entry_value'];
            $product['exit_value'] = (float)$period['exit_value'];
            $product['closing_value'] = $closingValue;
            $product['movement_count'] = (int)$period['count'];
            $product['fifo_pending'] = (float)$period['pending'] + (float)$after['fifo_pending'];
            $product['reconciliation_difference'] = $closingQuantity - ((float)$product['opening_quantity'] + (float)$product['entry_quantity'] - (float)$product['exit_quantity']);
        }
        unset($product);

        $documents = [];
        foreach ($movements as $movement) {
            $key = trim((string)($movement['nir_document_id'] ?? '')) ?: (trim((string)($movement['sales_invoice_id'] ?? '')) ?: (string)$movement['id']);
            if (!isset($documents[$key])) {
                $documents[$key] = [
                    'direction' => $movement['export_direction'], 'type' => $movement['export_document_type'],
                    'number' => $movement['export_document_number'], 'date' => $movement['created_at'],
                    'party' => $movement['export_party'], 'warehouse' => $movement['warehouse_name'] ?? 'Gestiune principală',
                    'input_series' => '', 'input_number' => '', 'output_series' => '', 'output_number' => '',
                    'line_count' => 0, 'quantity' => 0.0, 'inventory_value' => 0.0,
                    'sale_value' => 0.0, 'created_by' => $movement['created_by'] ?? '',
                ];
            }
            $isEntry = self::delta($movement) >= 0;
            if ($isEntry) {
                $documents[$key]['input_series'] = (string)($movement['supplier_invoice_series'] ?? '');
                $documents[$key]['input_number'] = (string)($movement['supplier_invoice_number'] ?? '');
            } else {
                $documents[$key]['output_series'] = (string)($movement['output_invoice_series'] ?? $movement['supplier_invoice_series'] ?? '');
                $documents[$key]['output_number'] = (string)($movement['output_invoice_number'] ?? $movement['supplier_invoice_number'] ?? '');
            }
            $documents[$key]['line_count']++;
            $documents[$key]['quantity'] += abs(self::delta($movement));
            $documents[$key]['inventory_value'] += abs((float)($movement['inventory_cost_total_ron'] ?? 0));
            $documents[$key]['sale_value'] += abs((float)($movement['sale_total_ron'] ?? 0));
        }

        return [
            'company' => $company,
            'from' => $from,
            'to' => $to,
            'generated_at' => date('Y-m-d H:i:s'),
            'export_id' => 'STOC-' . date('Ymd-His') . '-' . strtoupper(substr(hash('sha256', $from . '|' . $to . '|' . count($movements)), 0, 8)),
            'products' => $products,
            'movements' => $movements,
            'documents' => array_values($documents),
        ];
    }

    private static function movementWhere(string $from, string $to, string $alias): array
    {
        if ($from === '') return ['', []];
        return [' AND ' . $alias . '.created_at >= ? AND ' . $alias . '.created_at <= ?', [$from . ' 00:00:00', $to . ' 23:59:59']];
    }

    private static function delta(array $row): float
    {
        $value = $row['accounting_quantity_delta'] ?? null;
        if ($value === null || $value === '') $value = $row['quantity_delta'] ?? 0;
        return (float)$value;
    }

    private static function documentType(array $row): string
    {
        $type = strtoupper(trim((string)($row['movement_type'] ?? '')));
        if (in_array($type, ['NIR_IN'], true)) return 'NIR / recepție furnizor';
        if (in_array($type, ['RETURN_IN', 'RETURN'], true)) return 'Retur client / intrare';
        if (in_array($type, ['SALE', 'SALE_OUT'], true)) return 'Factură fiscală / ieșire';
        if ($type === 'REVERSAL_OUT') return 'Stornare NIR / retur furnizor';
        if ($type === 'MANUAL_ADJUSTMENT') return 'Ajustare inventar';
        return $type !== '' ? str_replace('_', ' ', $type) : 'Mișcare de stoc';
    }

    private static function documentNumber(array $row): string
    {
        $nir = trim((string)($row['nir_number'] ?? $row['temporary_number'] ?? ''));
        if ($nir !== '') return shopNirPremiumXlsxDocumentNumber($nir, $row['created_at'] ?? null);
        $invoice = trim(trim((string)($row['output_invoice_series'] ?? '')) . ' ' . trim((string)($row['output_invoice_number'] ?? '')));
        if ($invoice !== '') return $invoice;
        $order = trim((string)($row['order_number'] ?? ''));
        if ($order !== '') return $order;
        return 'AJ-' . strtoupper(substr((string)($row['id'] ?? ''), 0, 8));
    }

    private static function party(array $row): string
    {
        $supplier = trim((string)($row['supplier_alias'] ?? '')) ?: trim((string)($row['supplier_name'] ?? ''));
        if ($supplier !== '') return $supplier;
        $customer = trim((string)($row['order_company_name'] ?? '')) ?: trim((string)($row['order_customer_name'] ?? $row['nir_customer_name'] ?? ''));
        return $customer !== '' ? $customer : 'G-Trots / ajustare internă';
    }

    public static function render(array $data): string
    {
        $sheets = [
            self::summarySheet($data),
            self::stockSheet($data),
            self::cardsSheet($data),
            self::movementsSheet($data),
            self::documentsSheet($data),
            self::methodSheet($data),
        ];
        return self::workbook($sheets);
    }

    private static function periodLabel(array $data): string
    {
        if (($data['from'] ?? '') === '') return 'Toată perioada disponibilă';
        return self::displayDate($data['from']) . ' – ' . self::displayDate($data['to']);
    }

    private static function displayDate($value, bool $time = false): string
    {
        $raw = trim((string)$value);
        if ($raw === '') return '';
        try { return (new DateTimeImmutable($raw))->format($time ? 'd.m.Y H:i' : 'd.m.Y'); }
        catch (Throwable $error) { return $raw; }
    }

    private static function summarySheet(array $data): array
    {
        $company = $data['company'];
        $products = $data['products'];
        $movements = $data['movements'];
        $entries = array_values(array_filter($movements, static fn(array $row): bool => self::delta($row) >= 0));
        $exits = array_values(array_filter($movements, static fn(array $row): bool => self::delta($row) < 0));
        $entryQty = array_sum(array_map(static fn(array $row): float => abs(self::delta($row)), $entries));
        $exitQty = array_sum(array_map(static fn(array $row): float => abs(self::delta($row)), $exits));
        $closingQty = array_sum(array_map(static fn(array $row): float => (float)$row['closing_quantity'], $products));
        $closingValue = array_sum(array_map(static fn(array $row): float => (float)$row['closing_value'], $products));
        $pending = array_sum(array_map(static fn(array $row): float => (float)$row['fifo_pending'], $products));
        $top = $products;
        usort($top, static fn(array $a, array $b): int => ((int)$b['movement_count']) <=> ((int)$a['movement_count']));
        $top = array_slice(array_filter($top, static fn(array $row): bool => (int)$row['movement_count'] > 0), 0, 10);

        $rows = ''; $merges = ['C1:J1','C2:J2','C3:J3','A5:J5','B6:E6','G6:J6','B7:E7','G7:J7','A9:J9'];
        $rows .= shopNirPremiumXlsxRow(1, [3 => shopNirPremiumXlsxCellSpec('G-TROTS · CONTROL STOCURI', 'string', 1)], 34);
        $rows .= shopNirPremiumXlsxRow(2, [3 => shopNirPremiumXlsxCellSpec('Centralizator stocuri și fișe de magazie', 'string', 1)], 34);
        $rows .= shopNirPremiumXlsxRow(3, [3 => shopNirPremiumXlsxCellSpec(self::periodLabel($data) . ' · ' . $data['export_id'], 'string', 2)], 24);
        $rows .= shopNirPremiumXlsxRow(4, [], 10);
        $rows .= shopNirPremiumXlsxRow(5, [1 => shopNirPremiumXlsxCellSpec('IDENTIFICARE ENTITATE ȘI EXPORT', 'string', 9)], 24);
        $identity = trim((string)($company['legal_name'] ?? '')) ?: trim((string)($company['trade_name'] ?? 'G-Trots România'));
        $address = implode(', ', array_values(array_filter([$company['address'] ?? '', $company['city'] ?? '', $company['county'] ?? '', $company['country'] ?? ''], static fn($value): bool => trim((string)$value) !== '')));
        $rows .= shopNirPremiumXlsxRow(6, [1 => shopNirPremiumXlsxCellSpec('Entitate', 'string', 10),2 => shopNirPremiumXlsxCellSpec($identity, 'string', 4),6 => shopNirPremiumXlsxCellSpec('CUI / Reg. Com.', 'string', 10),7 => shopNirPremiumXlsxCellSpec(trim((string)($company['cui'] ?? '') . ' / ' . (string)($company['registration_number'] ?? ''), ' /'), 'string', 4)], 28);
        $rows .= shopNirPremiumXlsxRow(7, [1 => shopNirPremiumXlsxCellSpec('Adresă', 'string', 10),2 => shopNirPremiumXlsxCellSpec($address, 'string', 4),6 => shopNirPremiumXlsxCellSpec('Generat la', 'string', 10),7 => shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($data['generated_at'], true), 'datetime', 8)], 31);
        $rows .= shopNirPremiumXlsxRow(8, [], 10);
        $rows .= shopNirPremiumXlsxRow(9, [1 => shopNirPremiumXlsxCellSpec('INDICATORI PERIOADĂ', 'string', 9)], 24);
        $labels = ['Produse urmărite','Mișcări','Documente sursă','Intrări (buc.)','Ieșiri (buc.)','Stoc final (buc.)','Valoare finală la cost','Cantitate fără cost asociat'];
        $values = [count($products),count($movements),count($data['documents']),$entryQty,$exitQty,$closingQty,$closingValue,$pending];
        for ($i = 0; $i < 4; $i++) {
            $r = 10 + $i;
            $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec($labels[$i * 2], 'string', 10),2 => shopNirPremiumXlsxCellSpec($values[$i * 2], 'number', $i === 3 ? 20 : 11),6 => shopNirPremiumXlsxCellSpec($labels[$i * 2 + 1], 'string', 10),7 => shopNirPremiumXlsxCellSpec($values[$i * 2 + 1], 'number', $i === 3 ? 19 : 11)], 28);
            $merges[] = 'B' . $r . ':E' . $r; $merges[] = 'G' . $r . ':J' . $r;
        }
        $r = 15;
        $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('PRODUSE CU CEA MAI MARE ACTIVITATE ÎN PERIOADĂ', 'string', 9)], 24); $merges[] = 'A15:J15'; $r++;
        $headers = ['Nr. crt.','Cod produs','Denumire','Mișcări','Intrări','Ieșiri','Stoc final','Valoare finală','Cantitate fără cost asociat','Observație'];
        $cells = []; foreach ($headers as $index => $header) $cells[$index + 1] = shopNirPremiumXlsxCellSpec($header, 'string', 3);
        $rows .= shopNirPremiumXlsxRow($r++, $cells, 35);
        if (!$top) { $rows .= shopNirPremiumXlsxRow($r, [1 => shopNirPremiumXlsxCellSpec('Nu există mișcări în perioada selectată.', 'string', 22)], 28); $merges[] = 'A'.$r.':J'.$r; $r++; }
        foreach ($top as $index => $product) {
            $warning = (float)$product['fifo_pending'] > 0 ? 'Necesită asocierea costului de achiziție' : 'Reconciliat';
            $rows .= shopNirPremiumXlsxRow($r++, [1=>shopNirPremiumXlsxCellSpec($index+1,'number',5),2=>shopNirPremiumXlsxCellSpec($product['sku'],'string',23),3=>shopNirPremiumXlsxCellSpec($product['name'],'string',4),4=>shopNirPremiumXlsxCellSpec($product['movement_count'],'number',5),5=>shopNirPremiumXlsxCellSpec($product['entry_quantity'],'number',13),6=>shopNirPremiumXlsxCellSpec($product['exit_quantity'],'number',16),7=>shopNirPremiumXlsxCellSpec($product['closing_quantity'],'number',5),8=>shopNirPremiumXlsxCellSpec($product['closing_value'],'number',6),9=>shopNirPremiumXlsxCellSpec($product['fifo_pending'],'number',(float)$product['fifo_pending']>0?21:5),10=>shopNirPremiumXlsxCellSpec($warning,'string',(float)$product['fifo_pending']>0?21:4)], 27);
        }
        $r++;
        $rows .= shopNirPremiumXlsxRow($r, [1=>shopNirPremiumXlsxCellSpec('Notă: valorile de stoc sunt calculate pe baza mișcărilor și a costurilor de achiziție documentate. Pozițiile fără cost asociat trebuie reconciliate înaintea închiderii contabile.', 'string', 22)], 42); $merges[]='A'.$r.':J'.$r;

        $media=[]; $mediaIndex=[]; $anchors=[];
        if ($logo=shopNirPremiumXlsxLogoImage(96,96)) {
            $name=shopNirPremiumXlsxRegisterMedia($media,$mediaIndex,$logo,'logo');
            $scale=min(66/max(1,$logo['width']),66/max(1,$logo['height']));
            $anchors[]=['media'=>$name,'name'=>'G-Trots','col'=>0,'row'=>0,'colOff'=>65000,'rowOff'=>65000,'cx'=>(int)round($logo['width']*$scale*9525),'cy'=>(int)round($logo['height']*$scale*9525)];
        }
        return ['name'=>'Rezumat','rows'=>$rows,'widths'=>[16,22,32,14,14,18,22,19,19,31],'last_row'=>$r,'last_column'=>10,'merges'=>$merges,'freeze_rows'=>16,'drawing'=>(bool)$anchors,'anchors'=>$anchors,'media'=>$media,'orientation'=>'landscape','auto_filter'=>'A16:J'.max(16,$r-2)];
    }

    private static function stockSheet(array $data): array
    {
        $headers=['Nr. crt.','Cod produs','Denumire produs','U.M.','Stoc inițial','Intrări','Ieșiri','Stoc final','Stoc online actual','Stoc contabil actual','Valoare inițială la cost','Valoare intrări','Valoare ieșiri','Valoare finală la cost','Nr. mișcări','Control / observații'];
        [$rows,$merges,$r]=self::sheetMasthead('Situația stocului pe produse',self::periodLabel($data),count($headers));
        $headerRow=$r; $cells=[]; foreach($headers as $i=>$header)$cells[$i+1]=shopNirPremiumXlsxCellSpec($header,'string',3); $rows.=shopNirPremiumXlsxRow($r++,$cells,42);
        foreach($data['products'] as $index=>$product){
            $warning=(float)$product['fifo_pending']>0?'Fără cost asociat: '.self::decimal($product['fifo_pending']).' buc.':(abs((float)$product['reconciliation_difference'])>0.0001?'Diferență de reconciliere':'În regulă');
            $style=(float)$product['fifo_pending']>0?21:4;
            $rows.=shopNirPremiumXlsxRow($r++,[1=>shopNirPremiumXlsxCellSpec($index+1,'number',5),2=>shopNirPremiumXlsxCellSpec($product['sku'],'string',23),3=>shopNirPremiumXlsxCellSpec($product['name'],'string',4),4=>shopNirPremiumXlsxCellSpec('buc.','string',4),5=>shopNirPremiumXlsxCellSpec($product['opening_quantity'],'number',5),6=>shopNirPremiumXlsxCellSpec($product['entry_quantity'],'number',13),7=>shopNirPremiumXlsxCellSpec($product['exit_quantity'],'number',16),8=>shopNirPremiumXlsxCellSpec($product['closing_quantity'],'number',5),9=>shopNirPremiumXlsxCellSpec($product['stock_mode']==='unlimited'?'Nelimitat':$product['stock_quantity'],is_numeric($product['stock_quantity'])?'number':'string',5),10=>shopNirPremiumXlsxCellSpec($product['accounting_stock_quantity'],'number',5),11=>shopNirPremiumXlsxCellSpec($product['opening_value'],'number',6),12=>shopNirPremiumXlsxCellSpec($product['entry_value'],'number',14),13=>shopNirPremiumXlsxCellSpec($product['exit_value'],'number',17),14=>shopNirPremiumXlsxCellSpec($product['closing_value'],'number',6),15=>shopNirPremiumXlsxCellSpec($product['movement_count'],'number',5),16=>shopNirPremiumXlsxCellSpec($warning,'string',$style)],30);
        }
        return ['name'=>'Stoc pe produse','rows'=>$rows,'widths'=>[10,20,32,9,15,13,13,15,18,19,20,18,18,20,14,32],'last_row'=>$r-1,'last_column'=>16,'merges'=>$merges,'freeze_rows'=>$headerRow,'orientation'=>'landscape','auto_filter'=>'A'.$headerRow.':P'.max($headerRow,$r-1)];
    }

    private static function cardsSheet(array $data): array
    {
        $headers=['Nr. crt.','Data / ora','Tip mișcare','Document','Partener','Serie factură intrare','Nr. factură intrare','Serie factură ieșire','Nr. factură ieșire','Intrare','Ieșire','Stoc după','Cost unitar de achiziție','Valoare stoc','Operator','Observații'];
        [$rows,$merges,$r]=self::sheetMasthead('Fișe de magazie pe produse',self::periodLabel($data),count($headers));
        $byProduct=[]; foreach($data['movements'] as $movement)$byProduct[(string)$movement['product_id']][]=$movement;
        foreach($data['products'] as $product){
            $items=$byProduct[(string)$product['id']]??[];
            $rows.=shopNirPremiumXlsxRow($r,[1=>shopNirPremiumXlsxCellSpec('FIȘĂ PRODUS · '.($product['sku']?:'Fără cod').' · '.$product['name'],'string',9),13=>shopNirPremiumXlsxCellSpec('Stoc inițial: '.self::decimal($product['opening_quantity']).' buc.','string',9)],28); $merges[]='A'.$r.':L'.$r; $merges[]='M'.$r.':P'.$r; $r++;
            $headerRow=[]; foreach($headers as $i=>$header)$headerRow[$i+1]=shopNirPremiumXlsxCellSpec($header,'string',3); $rows.=shopNirPremiumXlsxRow($r++,$headerRow,43);
            if(!$items){$rows.=shopNirPremiumXlsxRow($r,[1=>shopNirPremiumXlsxCellSpec('Fără mișcări în perioada selectată.','string',22)],26);$merges[]='A'.$r.':P'.$r;$r+=2;continue;}
            foreach($items as $index=>$movement){$entry=self::delta($movement)>=0;$styleText=$entry?12:15;$styleNum=$entry?13:16;$styleMoney=$entry?14:17;
                $rows.=shopNirPremiumXlsxRow($r++,[1=>shopNirPremiumXlsxCellSpec($index+1,'number',$styleNum),2=>shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($movement['created_at'],true),'datetime',$entry?25:26),3=>shopNirPremiumXlsxCellSpec($movement['export_document_type'],'string',$styleText),4=>shopNirPremiumXlsxCellSpec($movement['export_document_number'],'string',$styleText),5=>shopNirPremiumXlsxCellSpec($movement['export_party'],'string',$styleText),6=>shopNirPremiumXlsxCellSpec($entry?$movement['supplier_invoice_series']:'','string',$styleText),7=>shopNirPremiumXlsxCellSpec($entry?$movement['supplier_invoice_number']:'','string',$styleText),8=>shopNirPremiumXlsxCellSpec(!$entry?($movement['output_invoice_series']?:$movement['supplier_invoice_series']):'','string',$styleText),9=>shopNirPremiumXlsxCellSpec(!$entry?($movement['output_invoice_number']?:$movement['supplier_invoice_number']):'','string',$styleText),10=>shopNirPremiumXlsxCellSpec($entry?abs(self::delta($movement)):0,'number',$styleNum),11=>shopNirPremiumXlsxCellSpec(!$entry?abs(self::delta($movement)):0,'number',$styleNum),12=>shopNirPremiumXlsxCellSpec($movement['accounting_quantity_after']??$movement['quantity_after'],'number',$styleNum),13=>shopNirPremiumXlsxCellSpec($movement['inventory_unit_cost_ron'],'number',$styleMoney),14=>shopNirPremiumXlsxCellSpec(abs((float)($movement['inventory_cost_total_ron']??0)),'number',$styleMoney),15=>shopNirPremiumXlsxCellSpec($movement['created_by'],'string',$styleText),16=>shopNirPremiumXlsxCellSpec($movement['note'],'string',$styleText)],34);
            }
            $rows.=shopNirPremiumXlsxRow($r,[1=>shopNirPremiumXlsxCellSpec('TOTAL FIȘĂ','string',18),10=>shopNirPremiumXlsxCellSpec($product['entry_quantity'],'number',19),11=>shopNirPremiumXlsxCellSpec($product['exit_quantity'],'number',19),12=>shopNirPremiumXlsxCellSpec($product['closing_quantity'],'number',19),14=>shopNirPremiumXlsxCellSpec($product['closing_value'],'number',20)],28);$merges[]='A'.$r.':I'.$r;$r+=2;
        }
        return ['name'=>'Fișe magazie','rows'=>$rows,'widths'=>[10,20,25,22,28,18,19,18,19,13,13,14,18,18,22,32],'last_row'=>max(1,$r-1),'last_column'=>16,'merges'=>$merges,'freeze_rows'=>4,'orientation'=>'landscape'];
    }

    private static function movementsSheet(array $data): array
    {
        $headers=['Nr. crt.','Direcție','Data / ora','Tip mișcare','Gestiune','Document','Partener','Comandă','Serie factură intrare','Nr. factură intrare','Data factură intrare','Serie factură ieșire','Nr. factură ieșire','Data factură ieșire','Cod produs','Denumire produs','U.M.','Cantitate intrare','Cantitate ieșire','Stoc după','Cost unitar de achiziție','Valoare stoc','Preț vânzare','Valoare vânzare','Stare asociere cost','Cantitate fără cost asociat','Operator','Observații'];
        [$rows,$merges,$r]=self::sheetMasthead('Registrul cronologic al mișcărilor de stoc',self::periodLabel($data),count($headers));
        $headerRow=$r;$cells=[];foreach($headers as $i=>$header)$cells[$i+1]=shopNirPremiumXlsxCellSpec($header,'string',3);$rows.=shopNirPremiumXlsxRow($r++,$cells,48);
        foreach($data['movements'] as $index=>$movement){$entry=self::delta($movement)>=0;$st=$entry?12:15;$sn=$entry?13:16;$sm=$entry?14:17;
            $rows.=shopNirPremiumXlsxRow($r++,[1=>shopNirPremiumXlsxCellSpec($index+1,'number',$sn),2=>shopNirPremiumXlsxCellSpec($movement['export_direction'],'string',$st),3=>shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($movement['created_at'],true),'datetime',$entry?25:26),4=>shopNirPremiumXlsxCellSpec($movement['export_document_type'],'string',$st),5=>shopNirPremiumXlsxCellSpec($movement['warehouse_name']??'Gestiune principală','string',$st),6=>shopNirPremiumXlsxCellSpec($movement['export_document_number'],'string',$st),7=>shopNirPremiumXlsxCellSpec($movement['export_party'],'string',$st),8=>shopNirPremiumXlsxCellSpec($movement['order_number'],'string',$st),9=>shopNirPremiumXlsxCellSpec($entry?$movement['supplier_invoice_series']:'','string',$st),10=>shopNirPremiumXlsxCellSpec($entry?$movement['supplier_invoice_number']:'','string',$st),11=>shopNirPremiumXlsxCellSpec($entry?shopNirPremiumXlsxExcelDate($movement['supplier_invoice_date']):null,'date',$entry?27:28),12=>shopNirPremiumXlsxCellSpec(!$entry?($movement['output_invoice_series']?:$movement['supplier_invoice_series']):'','string',$st),13=>shopNirPremiumXlsxCellSpec(!$entry?($movement['output_invoice_number']?:$movement['supplier_invoice_number']):'','string',$st),14=>shopNirPremiumXlsxCellSpec(!$entry?shopNirPremiumXlsxExcelDate($movement['output_invoice_date']?:$movement['supplier_invoice_date']):null,'date',$entry?27:28),15=>shopNirPremiumXlsxCellSpec($movement['product_sku'],'string',$st),16=>shopNirPremiumXlsxCellSpec($movement['product_name'],'string',$st),17=>shopNirPremiumXlsxCellSpec('buc.','string',$st),18=>shopNirPremiumXlsxCellSpec($entry?abs(self::delta($movement)):0,'number',$sn),19=>shopNirPremiumXlsxCellSpec(!$entry?abs(self::delta($movement)):0,'number',$sn),20=>shopNirPremiumXlsxCellSpec($movement['accounting_quantity_after']??$movement['quantity_after'],'number',$sn),21=>shopNirPremiumXlsxCellSpec($movement['inventory_unit_cost_ron'],'number',$sm),22=>shopNirPremiumXlsxCellSpec(abs((float)($movement['inventory_cost_total_ron']??0)),'number',$sm),23=>shopNirPremiumXlsxCellSpec($movement['sale_unit_price_ron'],'number',$sm),24=>shopNirPremiumXlsxCellSpec(abs((float)($movement['sale_total_ron']??0)),'number',$sm),25=>shopNirPremiumXlsxCellSpec($movement['fifo_status']??'','string',$st),26=>shopNirPremiumXlsxCellSpec($movement['fifo_quantity_pending']??0,'number',(float)($movement['fifo_quantity_pending']??0)>0?21:$sn),27=>shopNirPremiumXlsxCellSpec($movement['created_by'],'string',$st),28=>shopNirPremiumXlsxCellSpec(str_ireplace('FIFO','lot',(string)($movement['note']??'')),'string',$st)],36);
        }
        if(!$data['movements']){$rows.=shopNirPremiumXlsxRow($r,[1=>shopNirPremiumXlsxCellSpec('Nu există mișcări în perioada selectată.','string',22)],30);$merges[]='A'.$r.':AB'.$r;$r++;}
        return ['name'=>'Mișcări stoc','rows'=>$rows,'widths'=>[10,14,20,25,23,22,28,20,18,19,16,18,19,16,19,32,9,15,15,14,18,18,18,18,16,20,22,32],'last_row'=>$r-1,'last_column'=>28,'merges'=>$merges,'freeze_rows'=>$headerRow,'freeze_columns'=>3,'orientation'=>'landscape','auto_filter'=>'A'.$headerRow.':AB'.max($headerRow,$r-1)];
    }

    private static function documentsSheet(array $data): array
    {
        $headers=['Nr. crt.','Direcție','Tip document','Număr document','Data','Partener','Gestiune','Serie factură intrare','Nr. factură intrare','Serie factură ieșire','Nr. factură ieșire','Poziții','Cantitate totală','Valoare stoc','Valoare vânzare','Operator'];
        [$rows,$merges,$r]=self::sheetMasthead('Centralizator documente-sursă',self::periodLabel($data),count($headers));$headerRow=$r;$cells=[];foreach($headers as $i=>$header)$cells[$i+1]=shopNirPremiumXlsxCellSpec($header,'string',3);$rows.=shopNirPremiumXlsxRow($r++,$cells,42);
        foreach($data['documents'] as $index=>$doc){$entry=$doc['direction']==='Intrare';$st=$entry?12:15;$sn=$entry?13:16;$sm=$entry?14:17;$rows.=shopNirPremiumXlsxRow($r++,[1=>shopNirPremiumXlsxCellSpec($index+1,'number',$sn),2=>shopNirPremiumXlsxCellSpec($doc['direction'],'string',$st),3=>shopNirPremiumXlsxCellSpec($doc['type'],'string',$st),4=>shopNirPremiumXlsxCellSpec($doc['number'],'string',$st),5=>shopNirPremiumXlsxCellSpec(shopNirPremiumXlsxExcelDate($doc['date'],true),'datetime',$entry?25:26),6=>shopNirPremiumXlsxCellSpec($doc['party'],'string',$st),7=>shopNirPremiumXlsxCellSpec($doc['warehouse'],'string',$st),8=>shopNirPremiumXlsxCellSpec($doc['input_series'],'string',$st),9=>shopNirPremiumXlsxCellSpec($doc['input_number'],'string',$st),10=>shopNirPremiumXlsxCellSpec($doc['output_series'],'string',$st),11=>shopNirPremiumXlsxCellSpec($doc['output_number'],'string',$st),12=>shopNirPremiumXlsxCellSpec($doc['line_count'],'number',$sn),13=>shopNirPremiumXlsxCellSpec($doc['quantity'],'number',$sn),14=>shopNirPremiumXlsxCellSpec($doc['inventory_value'],'number',$sm),15=>shopNirPremiumXlsxCellSpec($doc['sale_value'],'number',$sm),16=>shopNirPremiumXlsxCellSpec($doc['created_by'],'string',$st)],34);}
        if(!$data['documents']){$rows.=shopNirPremiumXlsxRow($r,[1=>shopNirPremiumXlsxCellSpec('Nu există documente în perioada selectată.','string',22)],30);$merges[]='A'.$r.':P'.$r;$r++;}
        return ['name'=>'Documente sursă','rows'=>$rows,'widths'=>[10,14,26,22,20,28,24,18,19,18,19,13,18,18,18,22],'last_row'=>$r-1,'last_column'=>16,'merges'=>$merges,'freeze_rows'=>$headerRow,'orientation'=>'landscape','auto_filter'=>'A'.$headerRow.':P'.max($headerRow,$r-1)];
    }

    private static function methodSheet(array $data): array
    {
        [$rows,$merges,$r]=self::sheetMasthead('Metodologie, trasabilitate și semnături',self::periodLabel($data),8);
        $sections=[
            ['Scopul registrului','Centralizator electronic pentru controlul stocurilor, trasabilitatea intrărilor și ieșirilor și transmiterea către contabilitate. Nu înlocuiește documentele-sursă și procedurile interne de aprobare.'],
            ['Baza datelor','Stocurile contabile, mișcările confirmate, NIR-urile, facturile de vânzare, comenzile și loturile de achiziție existente în aplicația G-Trots la momentul exportului.'],
            ['Stoc inițial','Stocul contabil reconstruit imediat înaintea primei zile din perioadă. Pentru „Toată perioada”, reprezintă soldul anterior primei mișcări înregistrate.'],
            ['Intrări / ieșiri','Cantitățile pozitive sunt intrări, iar cantitățile negative sunt prezentate ca ieșiri în valoare absolută. Culorile au rol vizual: verde discret pentru intrări și roșu discret pentru ieșiri.'],
            ['Valoarea stocului','Valoarea stocului este calculată din loturile și costurile de achiziție documentate în RON. Pozițiile fără cost asociat trebuie reconciliate înaintea închiderii contabile.'],
            ['Documente justificative','Pentru fiecare operațiune sunt păstrate, dacă există: tipul și numărul documentului, data, partenerul, seria și numărul facturii, produsul, cantitatea, valorile și operatorul.'],
            ['Identificator export',$data['export_id'].' · generat la '.self::displayDate($data['generated_at'],true).' · perioadă '.self::periodLabel($data)],
        ];
        foreach($sections as [$label,$value]){$rows.=shopNirPremiumXlsxRow($r,[1=>shopNirPremiumXlsxCellSpec($label,'string',10),3=>shopNirPremiumXlsxCellSpec($value,'string',4)],44);$merges[]='A'.$r.':B'.$r;$merges[]='C'.$r.':H'.$r;$r++;}
        $r+=2;$rows.=shopNirPremiumXlsxRow($r,[1=>shopNirPremiumXlsxCellSpec('ÎNTOCMIT / GENERAT DE', 'string',9),5=>shopNirPremiumXlsxCellSpec('VERIFICAT / APROBAT DE', 'string',9)],26);$merges[]='A'.$r.':D'.$r;$merges[]='E'.$r.':H'.$r;$r++;
        $rows.=shopNirPremiumXlsxRow($r,[1=>shopNirPremiumXlsxCellSpec('Nume: ______________________________\nData: _______________________________\nSemnătura: __________________________', 'string',4),5=>shopNirPremiumXlsxCellSpec('Nume: ______________________________\nData: _______________________________\nSemnătura: __________________________', 'string',4)],78);$merges[]='A'.$r.':D'.$r;$merges[]='E'.$r.':H'.$r;
        return ['name'=>'Metodologie','rows'=>$rows,'widths'=>[20,18,24,24,20,18,24,24],'last_row'=>$r,'last_column'=>8,'merges'=>$merges,'freeze_rows'=>4,'orientation'=>'portrait'];
    }

    private static function sheetMasthead(string $title,string $subtitle,int $columns): array
    {
        $last=shopNirPremiumXlsxColumn($columns);$merges=['A1:'.$last.'1','A2:'.$last.'2','A3:'.$last.'3'];
        $rows=shopNirPremiumXlsxRow(1,[1=>shopNirPremiumXlsxCellSpec('G-TROTS · '.$title,'string',1)],32);
        $rows.=shopNirPremiumXlsxRow(2,[1=>shopNirPremiumXlsxCellSpec($subtitle,'string',2)],24);
        $rows.=shopNirPremiumXlsxRow(3,[1=>shopNirPremiumXlsxCellSpec('Registru electronic pentru control intern și transmitere către contabilitate','string',22)],24);
        return [$rows,$merges,4];
    }

    private static function decimal($value): string
    {
        return rtrim(rtrim(number_format((float)$value,4,',','.'),'0'),',');
    }

    private static function workbook(array $sheets): string
    {
        $ns='http://schemas.openxmlformats.org/';$prefix='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
        $overrides='';$sheetNodes='';$relations='';$defined='';$files=[];
        foreach($sheets as $index=>$sheet){$id=$index+1;$overrides.='<Override PartName="/xl/worksheets/sheet'.$id.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';$sheetNodes.='<sheet name="'.shopNirPremiumXlsxXml($sheet['name']).'" sheetId="'.$id.'" r:id="rId'.$id.'"/>';$relations.='<Relationship Id="rId'.$id.'" Type="'.$ns.'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'.$id.'.xml"/>';
            $last=shopNirPremiumXlsxColumn((int)$sheet['last_column']);$defined.='<definedName name="_xlnm.Print_Area" localSheetId="'.$index.'">\''.shopNirPremiumXlsxXml($sheet['name']).'\'!$A$1:$'.$last.'$'.max(1,(int)$sheet['last_row']).'</definedName>';
            if((int)($sheet['freeze_rows']??0)>0)$defined.='<definedName name="_xlnm.Print_Titles" localSheetId="'.$index.'">\''.shopNirPremiumXlsxXml($sheet['name']).'\'!$1:$'.(int)$sheet['freeze_rows'].'</definedName>';
            $files['xl/worksheets/sheet'.$id.'.xml']=shopNirPremiumXlsxSheet($sheet['rows'],$sheet['widths'],$sheet['last_row'],$sheet['last_column'],['merges'=>$sheet['merges']??[],'freeze_rows'=>$sheet['freeze_rows']??0,'freeze_columns'=>$sheet['freeze_columns']??0,'drawing'=>$sheet['drawing']??false,'orientation'=>$sheet['orientation']??'landscape','paper_size'=>9,'fit_to_height'=>0,'auto_filter'=>$sheet['auto_filter']??'','header'=>'&LG-Trots · '.(string)$sheet['name'].'&R&D','footer'=>'&LRegistru electronic de stoc&RPagina &P / &N']);
        }
        $drawingCount=0;$media=[];
        foreach($sheets as $index=>$sheet){if(empty($sheet['drawing'])||empty($sheet['anchors']))continue;$drawingCount++;$sheetId=$index+1;$drawing=shopNirPremiumXlsxDrawing($sheet['anchors']);$files['xl/drawings/drawing'.$drawingCount.'.xml']=$drawing['xml'];$files['xl/drawings/_rels/drawing'.$drawingCount.'.xml.rels']=$drawing['rels'];$files['xl/worksheets/_rels/sheet'.$sheetId.'.xml.rels']=$prefix.'<Relationships xmlns="'.$ns.'package/2006/relationships"><Relationship Id="rId1" Type="'.$ns.'officeDocument/2006/relationships/drawing" Target="../drawings/drawing'.$drawingCount.'.xml"/></Relationships>';foreach(($sheet['media']??[]) as $name=>$bytes)$media[$name]=$bytes;}
        $files=array_merge([
            '[Content_Types].xml'=>$prefix.'<Types xmlns="'.$ns.'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'.$overrides.($drawingCount?'<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>':'').'</Types>',
            '_rels/.rels'=>$prefix.'<Relationships xmlns="'.$ns.'package/2006/relationships"><Relationship Id="rId1" Type="'.$ns.'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
            'xl/workbook.xml'=>$prefix.'<workbook xmlns="'.$ns.'spreadsheetml/2006/main" xmlns:r="'.$ns.'officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>'.$sheetNodes.'</sheets><definedNames>'.$defined.'</definedNames><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>',
            'xl/_rels/workbook.xml.rels'=>$prefix.'<Relationships xmlns="'.$ns.'package/2006/relationships">'.$relations.'<Relationship Id="rId'.(count($sheets)+1).'" Type="'.$ns.'officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
            'xl/styles.xml'=>self::styles(),
        ],$files);
        foreach($media as $name=>$bytes)$files['xl/media/'.$name]=$bytes;
        if(class_exists('ZipArchive')){$path=tempnam(sys_get_temp_dir(),'gt-stock-');if($path===false)throw new RuntimeException('Exportul nu poate crea fișierul temporar.');try{$zip=new ZipArchive();if($zip->open($path,ZipArchive::OVERWRITE)!==true)throw new RuntimeException('Exportul XLSX nu poate fi pregătit.');foreach($files as $name=>$bytes)$zip->addFromString($name,$bytes);$zip->close();return(string)file_get_contents($path);}finally{@unlink($path);}}
        return shopNirBuildZip($files);
    }

    private static function styles(): string
    {
        $xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
        $xml.='<numFmts count="4"><numFmt numFmtId="165" formatCode="#,##0.####;[Red]-#,##0.####"/><numFmt numFmtId="166" formatCode="#,##0.00 &quot;lei&quot;;[Red]-#,##0.00 &quot;lei&quot;"/><numFmt numFmtId="167" formatCode="dd.mm.yyyy"/><numFmt numFmtId="168" formatCode="dd.mm.yyyy hh:mm"/></numFmts>';
        $xml.='<fonts count="8"><font><sz val="9"/><color rgb="FF253047"/><name val="Aptos"/></font><font><b/><sz val="20"/><color rgb="FF19253B"/><name val="Aptos Display"/></font><font><sz val="10"/><color rgb="FF64748B"/><name val="Aptos"/></font><font><b/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="9"/><color rgb="FF14532D"/><name val="Aptos"/></font><font><b/><sz val="9"/><color rgb="FF7F1D1D"/><name val="Aptos"/></font><font><b/><sz val="9"/><color rgb="FF7C2D12"/><name val="Aptos"/></font><font><b/><sz val="12"/><color rgb="FFFF7A00"/><name val="Aptos Display"/></font></fonts>';
        $xml.='<fills count="9"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF7A00"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4E8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF7EF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFDEEEE"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7E8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF19253B"/></patternFill></fill></fills>';
        $xml.='<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDDE3EA"/></left><right style="thin"><color rgb="FFDDE3EA"/></right><top style="thin"><color rgb="FFDDE3EA"/></top><bottom style="thin"><color rgb="FFDDE3EA"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="29">';
        $xf=static function(int $font,int $fill,int $border,string $alignment='',int $numFmt=0):string{$attrs=' numFmtId="'.$numFmt.'" fontId="'.$font.'" fillId="'.$fill.'" borderId="'.$border.'" xfId="0" applyFont="1" applyFill="1" applyBorder="1"'.($numFmt?' applyNumberFormat="1"':'');return'<xf'.$attrs.'><alignment vertical="center"'.$alignment.'/></xf>';};
        $styles=[
            $xf(0,0,0),$xf(1,0,0,' wrapText="1"'),$xf(2,0,0,' wrapText="1"'),$xf(3,8,1,' horizontal="center" wrapText="1"'),$xf(0,3,1,' wrapText="1"'),$xf(0,3,1,' horizontal="right"',165),$xf(0,3,1,' horizontal="right"',166),$xf(0,3,1,' horizontal="center"',167),$xf(0,3,1,' horizontal="center"',168),$xf(3,2,1,' wrapText="1"'),$xf(2,4,1,' wrapText="1"'),$xf(7,4,1,' horizontal="right"',165),$xf(4,5,1,' wrapText="1"'),$xf(4,5,1,' horizontal="right"',165),$xf(4,5,1,' horizontal="right"',166),$xf(5,6,1,' wrapText="1"'),$xf(5,6,1,' horizontal="right"',165),$xf(5,6,1,' horizontal="right"',166),$xf(3,8,1,' wrapText="1"'),$xf(3,8,1,' horizontal="right"',165),$xf(3,8,1,' horizontal="right"',166),$xf(6,7,1,' wrapText="1"'),$xf(2,0,0,' wrapText="1"'),$xf(0,3,1,' wrapText="1"'),$xf(0,3,1,' horizontal="center"'),$xf(4,5,1,' horizontal="center"',168),$xf(5,6,1,' horizontal="center"',168),$xf(4,5,1,' horizontal="center"',167),$xf(5,6,1,' horizontal="center"',167),
        ];
        $xml.=implode('',$styles).'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
        return $xml;
    }
}
