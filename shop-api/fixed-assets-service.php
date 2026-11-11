<?php
declare(strict_types=1);

require_once __DIR__ . '/fixed-assets-search.php';

final class GtrotsFixedAssets
{
    private const DOCUMENT_TYPES = ['factura', 'bon', 'pv'];
    private const MAX_FILE_SIZE = 15728640;

    public static function ensureSchema(PDO $db): void
    {
        if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
            $db->exec('CREATE TABLE IF NOT EXISTS shop_fixed_asset_documents (
                id TEXT PRIMARY KEY, document_date TEXT NOT NULL, document_type TEXT NOT NULL, series TEXT NOT NULL DEFAULT \'\', document_number TEXT NOT NULL,
                notes TEXT NULL, original_name TEXT NULL, storage_name TEXT NULL, mime_type TEXT NULL, extension TEXT NULL, file_size INTEGER NULL, sha256 TEXT NULL,
                created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )');
            $db->exec('CREATE TABLE IF NOT EXISTS shop_fixed_assets (
                id TEXT PRIMARY KEY, document_id TEXT NOT NULL, line_number INTEGER NOT NULL, product_name TEXT NOT NULL,
                quantity NUMERIC NOT NULL, unit_price NUMERIC NOT NULL, net_value NUMERIC NOT NULL, vat_rate NUMERIC NOT NULL, vat_value NUMERIC NOT NULL, total_value NUMERIC NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )');
            $db->exec('CREATE TABLE IF NOT EXISTS shop_fixed_asset_disposals (
                id TEXT PRIMARY KEY, fixed_asset_id TEXT NOT NULL, disposal_date TEXT NOT NULL, quantity NUMERIC NOT NULL, reason TEXT NOT NULL,
                created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_fixed_assets_document ON shop_fixed_assets(document_id, line_number)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_fixed_asset_disposals_asset ON shop_fixed_asset_disposals(fixed_asset_id, disposal_date)');
            self::ensureEditingSchema($db);
            return;
        }

        $db->exec("CREATE TABLE IF NOT EXISTS shop_fixed_asset_documents (
            id CHAR(36) NOT NULL PRIMARY KEY, document_date DATE NOT NULL, document_type VARCHAR(20) NOT NULL, series VARCHAR(80) NOT NULL DEFAULT '', document_number VARCHAR(120) NOT NULL,
            notes TEXT NULL, original_name VARCHAR(255) NULL, storage_name VARCHAR(500) NULL, mime_type VARCHAR(120) NULL, extension VARCHAR(12) NULL, file_size BIGINT UNSIGNED NULL, sha256 CHAR(64) NULL,
            created_by VARCHAR(160) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_fixed_asset_document_date (document_date, id), INDEX idx_fixed_asset_document_number (document_number), INDEX idx_fixed_asset_document_type (document_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_fixed_assets (
            id CHAR(36) NOT NULL PRIMARY KEY, document_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, product_name VARCHAR(500) NOT NULL,
            quantity DECIMAL(16,4) NOT NULL, unit_price DECIMAL(16,4) NOT NULL, net_value DECIMAL(16,2) NOT NULL, vat_rate DECIMAL(7,4) NOT NULL, vat_value DECIMAL(16,2) NOT NULL, total_value DECIMAL(16,2) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_fixed_asset_document_line (document_id, line_number), INDEX idx_fixed_assets_document (document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_fixed_asset_disposals (
            id CHAR(36) NOT NULL PRIMARY KEY, fixed_asset_id CHAR(36) NOT NULL, disposal_date DATE NOT NULL, quantity DECIMAL(16,4) NOT NULL, reason VARCHAR(1000) NOT NULL,
            created_by VARCHAR(160) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_fixed_asset_disposals_asset (fixed_asset_id, disposal_date, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        self::ensureEditingSchema($db);
    }

    private static function ensureEditingSchema(PDO $db): void
    {
        $sqlite = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
        $columns = $sqlite ? $db->query('PRAGMA table_info(shop_fixed_assets)')->fetchAll(PDO::FETCH_COLUMN, 1) : $db->query('SHOW COLUMNS FROM shop_fixed_assets')->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('vat_manual', $columns, true)) $db->exec('ALTER TABLE shop_fixed_assets ADD COLUMN vat_manual INTEGER NOT NULL DEFAULT 0');
        $db->exec($sqlite ? 'CREATE TABLE IF NOT EXISTS shop_fixed_asset_files (
            id TEXT PRIMARY KEY, document_id TEXT NOT NULL, original_name TEXT NOT NULL, storage_name TEXT NOT NULL,
            mime_type TEXT NOT NULL, extension TEXT NOT NULL, file_size INTEGER NOT NULL, sha256 TEXT NOT NULL,
            created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )' : 'CREATE TABLE IF NOT EXISTS shop_fixed_asset_files (
            id CHAR(36) PRIMARY KEY, document_id CHAR(36) NOT NULL, original_name VARCHAR(255) NOT NULL, storage_name VARCHAR(500) NOT NULL,
            mime_type VARCHAR(120) NOT NULL, extension VARCHAR(12) NOT NULL, file_size BIGINT UNSIGNED NOT NULL, sha256 CHAR(64) NOT NULL,
            created_by VARCHAR(160) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_fixed_asset_file_document (document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        // Preserve existing single attachments when upgrading to multiple files.
        $db->exec('INSERT INTO shop_fixed_asset_files (id,document_id,original_name,storage_name,mime_type,extension,file_size,sha256,created_by)
            SELECT d.id,d.id,d.original_name,d.storage_name,d.mime_type,d.extension,d.file_size,d.sha256,d.created_by
            FROM shop_fixed_asset_documents d WHERE d.storage_name IS NOT NULL AND d.storage_name <> \'\'
            AND NOT EXISTS (SELECT 1 FROM shop_fixed_asset_files f WHERE f.id = d.id)');
        $db->exec('UPDATE shop_fixed_asset_documents SET original_name=NULL,storage_name=NULL,mime_type=NULL,extension=NULL,file_size=NULL,sha256=NULL WHERE storage_name IS NOT NULL');
    }

    private static function files(PDO $db, string $documentId): array
    {
        $stmt = $db->prepare('SELECT * FROM shop_fixed_asset_files WHERE document_id = ? ORDER BY created_at,id');
        $stmt->execute([$documentId]);
        return $stmt->fetchAll();
    }

    private static function revision(array $data): string
    {
        return hash('sha256', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    private static function checkRevision(array $current, array $body): void
    {
        if (!isset($body['revision']) || !hash_equals($current['revision'], (string)$body['revision'])) {
            throw new ShopNirHttpException('Datele au fost modificate între timp. Redeschide fișa și încearcă din nou.', 409);
        }
    }

    private static function lockDocument(PDO $db, string $id): void
    {
        $stmt = $db->prepare('SELECT id FROM shop_fixed_asset_documents WHERE id = ?' . ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : ''));
        $stmt->execute([$id]);
        if (!$stmt->fetchColumn()) throw new ShopNirHttpException('Documentul mijlocului fix nu există.', 404);
    }

    private static function lockAssetDocument(PDO $db, string $id): void
    {
        $stmt = $db->prepare('SELECT document_id FROM shop_fixed_assets WHERE id = ?');
        $stmt->execute([$id]);
        $documentId = $stmt->fetchColumn();
        if (!$documentId) throw new ShopNirHttpException('Mijlocul fix nu există.', 404);
        self::lockDocument($db, (string)$documentId);
    }

    private static function prepareFiles(array $body): array
    {
        $attachments = $body['attachments'] ?? (empty($body['attachment']) ? [] : [$body['attachment']]);
        if (!is_array($attachments) || count($attachments) > 20) throw new InvalidArgumentException('Poți încărca maximum 20 de fișiere într-o singură operațiune.');
        $files = []; $size = 0;
        foreach ($attachments as $attachment) {
            if (!is_array($attachment)) throw new InvalidArgumentException('Fișier invalid.');
            $file = self::prepareAttachment($attachment);
            if (!$file) continue;
            $size += strlen($file['bytes']);
            if ($size > 60 * 1024 * 1024) throw new InvalidArgumentException('Fișierele selectate depășesc 60 MB. Încarcă-le în mai multe operațiuni.');
            $files[] = $file;
        }
        return $files;
    }

    private static function insertFiles(PDO $db, string $documentId, array $files, array $user, array &$saved): void
    {
        $insert = $db->prepare('INSERT INTO shop_fixed_asset_files (id,document_id,original_name,storage_name,mime_type,extension,file_size,sha256,created_by) VALUES (?,?,?,?,?,?,?,?,?)');
        foreach ($files as $file) {
            $id = self::uuid();
            $path = self::saveAttachment($id, $file);
            $saved[] = $path['relative'];
            $insert->execute([$id,$documentId,$file['name'],$path['relative'],$file['mime'],$file['extension'],strlen($file['bytes']),$file['sha256'],self::actor($user)]);
        }
    }

    private static function removeFiles(array $paths): void
    {
        foreach ($paths as $path) {
            try { $resolved = self::storedPath((string)$path); if (!unlink($resolved)) error_log('Fixed asset attachment cleanup failed.'); }
            catch (ShopNirHttpException $error) { /* Already absent; no path outside the storage root is removed. */ }
        }
    }

    private static function uuid(): string
    {
        if (function_exists('uuidV4')) return uuidV4();
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    private static function actor(array $user): string
    {
        if (function_exists('shopNirActor')) return (string)(shopNirActor($user)['name'] ?? 'Administrator');
        return trim((string)($user['display_name'] ?? $user['username'] ?? 'Administrator')) ?: 'Administrator';
    }

    private static function date($value, string $label): string
    {
        $date = trim((string)$value);
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if (!$parsed || $parsed->format('Y-m-d') !== $date) throw new InvalidArgumentException($label . ' nu este validă.');
        return $date;
    }

    private static function decimal($value, string $label, bool $allowZero = true): float
    {
        $normal = str_replace([' ', ','], ['', '.'], trim((string)$value));
        if ($normal === '' || !is_numeric($normal)) throw new InvalidArgumentException($label . ' trebuie să fie un număr.');
        $number = round((float)$normal, 4);
        if (!is_finite($number) || ($allowZero ? $number < 0 : $number <= 0)) throw new InvalidArgumentException($label . ' nu are o valoare validă.');
        return $number;
    }

    private static function prepareAttachment(array $attachment): ?array
    {
        if (!$attachment) return null;
        $name = mb_substr(basename(trim((string)($attachment['file_name'] ?? 'document'))), 0, 255);
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $allowed = [
            'pdf' => ['application/pdf'], 'jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'png' => ['image/png'], 'webp' => ['image/webp'],
            'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
            'xls' => ['application/vnd.ms-excel', 'application/octet-stream'], 'xml' => ['application/xml', 'text/xml', 'application/octet-stream'],
            'doc' => ['application/msword', 'application/octet-stream'], 'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'],
        ];
        $mime = strtolower(trim((string)($attachment['mime_type'] ?? 'application/octet-stream')));
        if (!isset($allowed[$extension]) || !in_array($mime, $allowed[$extension], true)) {
            throw new InvalidArgumentException('Documentul trebuie să fie PDF, imagine, Excel, Word sau XML și să aibă un tip valid.');
        }
        $base64 = trim((string)($attachment['content_base64'] ?? ''));
        if (str_contains($base64, ',')) $base64 = substr($base64, strpos($base64, ',') + 1);
        $bytes = base64_decode($base64, true);
        if ($bytes === false || $bytes === '') throw new InvalidArgumentException('Conținutul documentului este invalid.');
        if (strlen($bytes) > self::MAX_FILE_SIZE) throw new InvalidArgumentException('Documentul depășește limita de 15 MB.');
        return ['name' => $name, 'extension' => $extension, 'mime' => $mime, 'bytes' => $bytes, 'sha256' => hash('sha256', $bytes)];
    }

    private static function saveAttachment(string $documentId, array $file): array
    {
        $root = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'fixed-assets';
        $folder = $root . DIRECTORY_SEPARATOR . date('Y') . DIRECTORY_SEPARATOR . date('m');
        if (!is_dir($folder) && !mkdir($folder, 0750, true) && !is_dir($folder)) throw new RuntimeException('Spațiul pentru documentele mijloacelor fixe nu poate fi creat.');
        $deny = $root . DIRECTORY_SEPARATOR . '.htaccess';
        if (!is_file($deny)) @file_put_contents($deny, "Options -Indexes\nRequire all denied\n", LOCK_EX);
        $storageName = str_replace('-', '', $documentId) . '.' . $file['extension'];
        $path = $folder . DIRECTORY_SEPARATOR . $storageName;
        if (file_put_contents($path, $file['bytes'], LOCK_EX) !== strlen($file['bytes'])) throw new RuntimeException('Documentul justificativ nu a putut fi salvat complet.');
        return ['absolute' => $path, 'relative' => 'uploads/fixed-assets/' . date('Y') . '/' . date('m') . '/' . $storageName];
    }

    public static function create(PDO $db, array $body, array $user): array
    {
        return self::saveDocument($db, null, $body, $user);
    }

    public static function updateDocument(PDO $db, string $id, array $body, array $user): array
    {
        return self::saveDocument($db, $id, $body, $user);
    }

    private static function begin(PDO $db): void
    {
        // Child mutations acquire the document lock before reading current totals.
        if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') $db->exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        $db->beginTransaction();
    }

    private static function saveDocument(PDO $db, ?string $documentId, array $body, array $user): array
    {
        $document = (array)($body['document'] ?? $body);
        $type = strtolower(trim((string)($document['document_type'] ?? '')));
        if (!in_array($type, self::DOCUMENT_TYPES, true)) throw new InvalidArgumentException('Tipul documentului trebuie să fie factură, bon sau proces-verbal.');
        $date = self::date($document['document_date'] ?? '', 'Data documentului');
        $series = mb_substr(trim((string)($document['series'] ?? '')), 0, 80);
        $number = mb_substr(trim((string)($document['document_number'] ?? '')), 0, 120);
        if ($number === '') throw new InvalidArgumentException('Numărul documentului este obligatoriu.');
        $lines = array_values(array_filter((array)($body['lines'] ?? []), 'is_array'));
        if (!$lines) throw new InvalidArgumentException('Adaugă cel puțin un mijloc fix.');
        if (count($lines) > 250) throw new InvalidArgumentException('Un document poate conține maximum 250 de poziții.');
        $prepared = [];
        foreach ($lines as $index => $line) {
            $name = mb_substr(trim((string)($line['product_name'] ?? '')), 0, 500);
            if ($name === '') throw new InvalidArgumentException('Denumirea produsului este obligatorie la poziția ' . ($index + 1) . '.');
            $quantity = self::decimal($line['quantity'] ?? '', 'Cantitatea de la poziția ' . ($index + 1), false);
            $unitPrice = self::decimal($line['unit_price'] ?? '', 'Prețul unitar de la poziția ' . ($index + 1));
            $vatRate = self::decimal($line['vat_rate'] ?? 0, 'TVA-ul de la poziția ' . ($index + 1));
            if ($vatRate > 100) throw new InvalidArgumentException('TVA-ul nu poate depăși 100%.');
            $net = round($quantity * $unitPrice, 2);
            $manual = isset($line['vat_value']) && $line['vat_value'] !== '';
            $vat = $manual ? round(self::decimal($line['vat_value'], 'Valoarea TVA'), 2) : round($net * $vatRate / 100, 2);
            $prepared[] = compact('name', 'quantity', 'unitPrice', 'net', 'vatRate', 'vat', 'manual') + ['id' => (string)($line['id'] ?? ''), 'total' => round($net + $vat, 2)];
        }
        $files = self::prepareFiles($body);
        $id = $documentId ?? self::uuid();
        $saved = [];
        $actor = self::actor($user);
        self::begin($db);
        try {
            $existing = [];
            $notes = mb_substr(trim((string)($document['notes'] ?? '')), 0, 2000);
            if ($documentId !== null) {
                self::lockDocument($db, $id);
                $current = self::getDocument($db, $id);
                self::checkRevision($current, $body);
                foreach ($current['lines'] as $line) $existing[$line['id']] = $line;
                $stmt = $db->prepare('UPDATE shop_fixed_asset_documents SET document_date=?,document_type=?,series=?,document_number=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?');
                $stmt->execute([$date,$type,$series,$number,$notes,$id]);
                // Temporarily move line numbers out of the final range to permit reordering.
                $db->prepare('UPDATE shop_fixed_assets SET line_number=line_number+1000000 WHERE document_id=?')->execute([$id]);
            } else {
                $stmt = $db->prepare('INSERT INTO shop_fixed_asset_documents (id,document_date,document_type,series,document_number,notes,created_by) VALUES (?,?,?,?,?,?,?)');
                $stmt->execute([$id,$date,$type,$series,$number,$notes,$actor]);
            }
            $seen = [];
            $lineStmt = $db->prepare('INSERT INTO shop_fixed_assets (id, document_id, line_number, product_name, quantity, unit_price, net_value, vat_rate, vat_value, total_value, vat_manual) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $update = $db->prepare('UPDATE shop_fixed_assets SET line_number=?,product_name=?,quantity=?,unit_price=?,net_value=?,vat_rate=?,vat_value=?,total_value=?,vat_manual=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND document_id=?');
            foreach ($prepared as $index => $line) {
                $lineId = $line['id'];
                if ($lineId !== '') {
                    if (!isset($existing[$lineId]) || isset($seen[$lineId])) throw new InvalidArgumentException('Poziție invalidă sau duplicată în document.');
                    if ($line['quantity'] + (float)$existing[$lineId]['disposal_quantity'] < -0.00005) throw new ShopNirHttpException('Cantitatea inițială nu poate fi mai mică decât cantitatea deja casată.', 409);
                    $update->execute([$index+1,$line['name'],$line['quantity'],$line['unitPrice'],$line['net'],$line['vatRate'],$line['vat'],$line['total'],(int)$line['manual'],$lineId,$id]);
                    $seen[$lineId] = true;
                } else {
                    $lineStmt->execute([self::uuid(),$id,$index+1,$line['name'],$line['quantity'],$line['unitPrice'],$line['net'],$line['vatRate'],$line['vat'],$line['total'],(int)$line['manual']]);
                }
            }
            foreach ($existing as $lineId=>$line) {
                if (isset($seen[$lineId])) continue;
                if ($line['disposals']) throw new ShopNirHttpException('Poziția are casări. Folosește acțiunea de ștergere din fișa mijlocului fix.', 409);
                $db->prepare('DELETE FROM shop_fixed_assets WHERE id=?')->execute([$lineId]);
            }
            self::insertFiles($db,$id,$files,$user,$saved);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            self::removeFiles($saved);
            throw $error;
        }
        return self::getDocument($db, $id);
    }

    private static function filters(array $filters, array &$params): string
    {
        $parts = [];
        $type = strtolower(trim((string)($filters['type'] ?? '')));
        if (in_array($type, self::DOCUMENT_TYPES, true)) { $parts[] = 'd.document_type = ?'; $params[] = $type; }
        foreach ([['from', '>='], ['to', '<=']] as [$key, $operator]) {
            if (trim((string)($filters[$key] ?? '')) !== '') { $parts[] = "d.document_date {$operator} ?"; $params[] = self::date($filters[$key], 'Perioada aleasă'); }
        }
        return $parts ? ' WHERE ' . implode(' AND ', $parts) : '';
    }

    /** Rank the complete filtered registry, before pagination, using only lightweight columns. */
    private static function searchMatches(PDO $db, array $filters): array
    {
        $query = GtrotsFixedAssetSearch::query((string)($filters['search'] ?? ''));
        if ($query['text'] === '') return [];
        $params = [];
        $where = self::filters($filters, $params);
        $stmt = $db->prepare('SELECT a.id, a.product_name, d.series, d.document_number, d.document_type
            FROM shop_fixed_assets a INNER JOIN shop_fixed_asset_documents d ON d.id = a.document_id' . $where .
            ' ORDER BY d.document_date DESC, d.created_at DESC, d.id ASC, a.line_number ASC, a.id ASC');
        $stmt->execute($params);
        $matches = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $score = GtrotsFixedAssetSearch::score($row, $query);
            if ($score > 0) $matches[$row['id']] = $score;
        }
        // PHP's stable sort preserves chronology/line order for equal relevance.
        arsort($matches, SORT_NUMERIC);
        return array_keys($matches);
    }

    public static function list(PDO $db, array $filters): array
    {
        $page = max(1, (int)($filters['page'] ?? 1));
        $pageSize = max(10, min(100, (int)($filters['page_size'] ?? 25)));
        $params = [];
        $where = self::filters($filters, $params);
        $matches = null;
        if (trim((string)($filters['search'] ?? '')) !== '') {
            $matches = self::searchMatches($db, $filters);
            $total = count($matches);
        } else {
            $count = $db->prepare('SELECT COUNT(*) FROM shop_fixed_assets a INNER JOIN shop_fixed_asset_documents d ON d.id = a.document_id' . $where);
            $count->execute($params);
            $total = (int)$count->fetchColumn();
        }
        $pages = max(1, (int)ceil($total / $pageSize));
        $page = min($page, $pages);
        $offset = ($page - 1) * $pageSize;
        $pageIds = [];
        if ($matches !== null) {
            $pageIds = array_slice($matches, $offset, $pageSize);
            $where = $pageIds ? ' WHERE a.id IN (' . implode(',', array_fill(0, count($pageIds), '?')) . ')' : ' WHERE 1 = 0';
            $params = $pageIds;
            $offset = 0;
        }
        $sql = 'SELECT a.*, d.document_date, d.document_type, d.series, d.document_number, d.original_name, d.mime_type,
                COALESCE((SELECT SUM(x.quantity) FROM shop_fixed_asset_disposals x WHERE x.fixed_asset_id = a.id), 0) AS disposal_quantity,
                (SELECT COUNT(*) FROM shop_fixed_asset_disposals x WHERE x.fixed_asset_id = a.id) AS disposal_count
            FROM shop_fixed_assets a INNER JOIN shop_fixed_asset_documents d ON d.id = a.document_id' . $where .
            ' ORDER BY d.document_date DESC, d.created_at DESC, d.id ASC, a.line_number ASC, a.id ASC LIMIT ' . $pageSize . ' OFFSET ' . $offset;
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $items = $stmt->fetchAll();
        if ($pageIds) {
            $order = array_flip($pageIds);
            usort($items, static fn(array $a, array $b): int => $order[$a['id']] <=> $order[$b['id']]);
        }
        foreach ($items as &$item) $item['remaining_quantity'] = round((float)$item['quantity'] + (float)$item['disposal_quantity'], 4);
        unset($item);
        return ['items' => $items, 'page' => $page, 'page_size' => $pageSize, 'total' => $total, 'total_pages' => $pages];
    }

    public static function get(PDO $db, string $assetId): array
    {
        $stmt = $db->prepare('SELECT a.*, d.document_date, d.document_type, d.series, d.document_number, d.notes, d.original_name, d.mime_type, d.file_size, d.created_by, d.created_at AS document_created_at FROM shop_fixed_assets a INNER JOIN shop_fixed_asset_documents d ON d.id = a.document_id WHERE a.id = ? LIMIT 1');
        $stmt->execute([$assetId]);
        $asset = $stmt->fetch();
        if (!$asset) throw new ShopNirHttpException('Mijlocul fix nu există.', 404);
        $disposals = $db->prepare('SELECT id, disposal_date, quantity, reason, created_by, created_at FROM shop_fixed_asset_disposals WHERE fixed_asset_id = ? ORDER BY disposal_date DESC, created_at DESC');
        $disposals->execute([$assetId]);
        $asset['disposals'] = $disposals->fetchAll();
        $asset['disposal_quantity'] = array_sum(array_map(static fn(array $row): float => (float)$row['quantity'], $asset['disposals']));
        $asset['remaining_quantity'] = round((float)$asset['quantity'] + (float)$asset['disposal_quantity'], 4);
        $asset['has_document'] = trim((string)($asset['original_name'] ?? '')) !== '';
        $asset['files'] = self::files($db, (string)$asset['document_id']);
        $asset['has_document'] = count($asset['files']) > 0;
        foreach (['original_name','mime_type','file_size'] as $field) $asset[$field] = $asset['files'][0][$field] ?? null;
        $asset['revision'] = self::revision($asset);
        return $asset;
    }

    public static function getDocument(PDO $db, string $documentId): array
    {
        $stmt = $db->prepare('SELECT * FROM shop_fixed_asset_documents WHERE id = ? LIMIT 1');
        $stmt->execute([$documentId]);
        $document = $stmt->fetch();
        if (!$document) throw new ShopNirHttpException('Documentul mijlocului fix nu există.', 404);
        $lines = $db->prepare('SELECT * FROM shop_fixed_assets WHERE document_id = ? ORDER BY line_number ASC');
        $lines->execute([$documentId]);
        $document['lines'] = array_map(static fn(array $line): array => self::get($db, (string)$line['id']), $lines->fetchAll());
        $document['files'] = self::files($db, $documentId);
        // Keep the original download contract usable by older clients.
        foreach (['storage_name','original_name','mime_type','file_size'] as $field) $document[$field] = $document['files'][0][$field] ?? null;
        $document['revision'] = self::revision($document);
        return $document;
    }

    public static function dispose(PDO $db, string $assetId, array $body, array $user): array
    {
        $date = self::date($body['disposal_date'] ?? '', 'Data casării');
        $reason = mb_substr(trim((string)($body['reason'] ?? '')), 0, 1000);
        if ($reason === '') throw new InvalidArgumentException('Motivul casării este obligatoriu.');
        $normal = str_replace([' ', ','], ['', '.'], trim((string)($body['quantity'] ?? '')));
        if (!is_numeric($normal) || !is_finite((float)$normal) || round((float)$normal, 4) >= 0) throw new InvalidArgumentException('Cantitatea casată trebuie introdusă cu minus.');
        $quantity = round((float)$normal, 4);
        self::begin($db);
        try {
            self::lockAssetDocument($db, $assetId);
            $suffix = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $stmt = $db->prepare('SELECT quantity FROM shop_fixed_assets WHERE id = ?' . $suffix);
            $stmt->execute([$assetId]);
            $original = $stmt->fetchColumn();
            if ($original === false) throw new ShopNirHttpException('Mijlocul fix nu există.', 404);
            $used = $db->prepare('SELECT COALESCE(SUM(quantity), 0) FROM shop_fixed_asset_disposals WHERE fixed_asset_id = ?');
            $used->execute([$assetId]);
            $remaining = round((float)$original + (float)$used->fetchColumn(), 4);
            if (abs($quantity) - $remaining > 0.00005) throw new ShopNirHttpException('Cantitatea casată depășește cantitatea disponibilă.', 409, ['remaining_quantity' => $remaining]);
            $id = self::uuid();
            $insert = $db->prepare('INSERT INTO shop_fixed_asset_disposals (id, fixed_asset_id, disposal_date, quantity, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)');
            $insert->execute([$id, $assetId, $date, $quantity, $reason, self::actor($user)]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        return self::get($db, $assetId);
    }

    private static function storedPath(string $storageName): string
    {
        $root = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'fixed-assets');
        $path = realpath(__DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $storageName));
        if ($root === false || $path === false || !str_starts_with($path, $root . DIRECTORY_SEPARATOR) || !is_file($path)) throw new ShopNirHttpException('Documentul nu mai este disponibil.', 404);
        return $path;
    }

    public static function addFiles(PDO $db, string $documentId, array $body, array $user): array
    {
        $files = self::prepareFiles($body);
        if (!$files) throw new InvalidArgumentException('Selectează cel puțin un fișier.');
        $saved = [];
        self::begin($db);
        try {
            self::lockDocument($db, $documentId);
            self::insertFiles($db,$documentId,$files,$user,$saved);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            self::removeFiles($saved);
            throw $error;
        }
        return self::getDocument($db,$documentId);
    }

    public static function deleteFile(PDO $db, string $documentId, array $body): array
    {
        self::begin($db);
        try {
            self::lockDocument($db,$documentId);
            $stmt = $db->prepare('SELECT storage_name FROM shop_fixed_asset_files WHERE id=? AND document_id=?');
            $stmt->execute([(string)($body['file_id'] ?? ''),$documentId]);
            $path = $stmt->fetchColumn();
            if (!$path) throw new ShopNirHttpException('Fișierul nu există.',404);
            $db->prepare('DELETE FROM shop_fixed_asset_files WHERE id=? AND document_id=?')->execute([(string)$body['file_id'],$documentId]);
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        self::removeFiles([(string)$path]);
        return self::getDocument($db,$documentId);
    }

    public static function updateDisposal(PDO $db, string $assetId, array $body): array
    {
        $date = self::date($body['disposal_date'] ?? '', 'Data casării');
        $reason = mb_substr(trim((string)($body['reason'] ?? '')),0,1000);
        if ($reason === '') throw new InvalidArgumentException('Motivul casării este obligatoriu.');
        $normal = str_replace([' ', ','], ['', '.'], trim((string)($body['quantity'] ?? '')));
        if (!is_numeric($normal) || !is_finite((float)$normal) || round((float)$normal,4) >= 0) throw new InvalidArgumentException('Cantitatea casată trebuie introdusă cu minus.');
        $quantity = round((float)$normal,4);
        self::begin($db);
        try {
            self::lockAssetDocument($db,$assetId);
            $asset = self::get($db,$assetId);
            self::checkRevision($asset,$body);
            $disposal = self::findDisposal($asset,(string)($body['disposal_id'] ?? ''));
            $available = round((float)$asset['remaining_quantity'] - (float)$disposal['quantity'],4);
            if (abs($quantity) - $available > 0.00005) throw new ShopNirHttpException('Cantitatea casată depășește cantitatea disponibilă.',409);
            $db->prepare('UPDATE shop_fixed_asset_disposals SET disposal_date=?,quantity=?,reason=? WHERE id=? AND fixed_asset_id=?')->execute([$date,$quantity,$reason,$disposal['id'],$assetId]);
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        return self::get($db,$assetId);
    }

    private static function findDisposal(array $asset, string $id): array
    {
        foreach ($asset['disposals'] as $disposal) if ($disposal['id'] === $id) return $disposal;
        throw new ShopNirHttpException('Casarea nu există pentru acest mijloc fix.',404);
    }

    public static function deleteDisposal(PDO $db, string $assetId, array $body): array
    {
        self::begin($db);
        try {
            self::lockAssetDocument($db,$assetId);
            $asset = self::get($db,$assetId);
            self::checkRevision($asset,$body);
            $disposal = self::findDisposal($asset,(string)($body['disposal_id'] ?? ''));
            $db->prepare('DELETE FROM shop_fixed_asset_disposals WHERE id=? AND fixed_asset_id=?')->execute([$disposal['id'],$assetId]);
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        return self::get($db,$assetId);
    }

    public static function deleteAsset(PDO $db, string $assetId, array $body): array
    {
        $paths = [];
        self::begin($db);
        try {
            self::lockAssetDocument($db,$assetId);
            $asset = self::get($db,$assetId);
            self::checkRevision($asset,$body);
            self::checkRevision(self::getDocument($db,$asset['document_id']), ['revision'=>$body['document_revision'] ?? '']);
            $db->prepare('DELETE FROM shop_fixed_asset_disposals WHERE fixed_asset_id=?')->execute([$assetId]);
            $db->prepare('DELETE FROM shop_fixed_assets WHERE id=?')->execute([$assetId]);
            $count = $db->prepare('SELECT COUNT(*) FROM shop_fixed_assets WHERE document_id=?');
            $count->execute([$asset['document_id']]);
            $documentDeleted = (int)$count->fetchColumn() === 0;
            if ($documentDeleted) {
                $paths = array_column(self::files($db,$asset['document_id']),'storage_name');
                $db->prepare('DELETE FROM shop_fixed_asset_files WHERE document_id=?')->execute([$asset['document_id']]);
                $db->prepare('DELETE FROM shop_fixed_asset_documents WHERE id=?')->execute([$asset['document_id']]);
            }
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        self::removeFiles($paths);
        return ['success'=>true,'deleted_id'=>$assetId,'document_deleted'=>$documentDeleted];
    }

    public static function deleteDocument(PDO $db, string $id, array $body): array
    {
        self::begin($db);
        try {
            self::lockDocument($db,$id);
            $document = self::getDocument($db,$id);
            self::checkRevision($document,$body);
            foreach ($document['lines'] as $line) $db->prepare('DELETE FROM shop_fixed_asset_disposals WHERE fixed_asset_id=?')->execute([$line['id']]);
            $db->prepare('DELETE FROM shop_fixed_assets WHERE document_id=?')->execute([$id]);
            $db->prepare('DELETE FROM shop_fixed_asset_files WHERE document_id=?')->execute([$id]);
            $db->prepare('DELETE FROM shop_fixed_asset_documents WHERE id=?')->execute([$id]);
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        self::removeFiles(array_column($document['files'],'storage_name'));
        return ['success'=>true,'deleted_id'=>$id];
    }

    public static function download(PDO $db, string $documentId, string $fileId = ''): array
    {
        $stmt = $db->prepare('SELECT original_name, storage_name, mime_type FROM shop_fixed_asset_files WHERE document_id = ?' . ($fileId !== '' ? ' AND id = ?' : '') . ' ORDER BY created_at,id LIMIT 1');
        $stmt->execute($fileId !== '' ? [$documentId,$fileId] : [$documentId]);
        $file = $stmt->fetch();
        if (!$file || trim((string)$file['storage_name']) === '') throw new ShopNirHttpException('Acest document nu are fișier atașat.', 404);
        $bytes = file_get_contents(self::storedPath((string)$file['storage_name']));
        if ($bytes === false) throw new RuntimeException('Documentul nu a putut fi citit.');
        return ['file_name' => (string)$file['original_name'], 'mime_type' => (string)$file['mime_type'], 'content_base64' => base64_encode($bytes)];
    }

    private static function exportRows(PDO $db, array $filters): array
    {
        $matches = trim((string)($filters['search'] ?? '')) !== '' ? array_fill_keys(self::searchMatches($db, $filters), true) : null;
        if ($matches === []) return [];
        $params = [];
        $where = self::filters($filters, $params);
        $stmt = $db->prepare('SELECT a.id AS asset_id, d.document_date, d.document_type, d.series, d.document_number, a.product_name, a.quantity, a.unit_price, a.net_value, a.vat_rate, a.vat_value, a.total_value,
                x.disposal_date, x.quantity AS disposed_quantity, x.reason AS disposal_reason
            FROM shop_fixed_assets a INNER JOIN shop_fixed_asset_documents d ON d.id = a.document_id
            LEFT JOIN shop_fixed_asset_disposals x ON x.fixed_asset_id = a.id' . $where . ' ORDER BY d.document_date ASC, d.created_at ASC, d.id ASC, a.line_number ASC, a.id ASC, x.disposal_date ASC, x.id ASC');
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        // Exports retain document chronology and every disposal for matching assets.
        if ($matches !== null) $rows = array_values(array_filter($rows, static fn(array $row): bool => isset($matches[$row['asset_id']])));
        $seen = [];
        foreach ($rows as &$row) {
            $row['continuation'] = isset($seen[$row['asset_id']]);
            $seen[$row['asset_id']] = true;
        }
        unset($row);
        return $rows;
    }

    private static function xlsx(array $rows, array $filters = [], array $company = []): string
    {
        require_once __DIR__ . '/fixed-assets-export.php';
        return GtrotsFixedAssetExport::xlsx($rows, $filters, $company);
    }

    private static function pdf(array $rows, array $filters, array $company = []): string
    {
        require_once __DIR__ . '/fixed-assets-export.php';
        return GtrotsFixedAssetExport::pdf($rows, $filters, $company);
    }

    public static function export(PDO $db, array $filters, string $format): array
    {
        $from = trim((string)($filters['from'] ?? ''));
        $to = trim((string)($filters['to'] ?? ''));
        if (($from === '') !== ($to === '')) throw new InvalidArgumentException('Completează ambele date ale perioadei.');
        if ($from !== '') {
            self::date($from, 'Data de început');
            self::date($to, 'Data de sfârșit');
            if ($from > $to) throw new InvalidArgumentException('Data de început nu poate fi după data de sfârșit.');
        }
        $filters = array_merge($filters, ['from' => $from, 'to' => $to]);
        $company = [];
        try {
            $company = $db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch(PDO::FETCH_ASSOC) ?: [];
        } catch (PDOException $error) {
            // Isolated installations can have no company profile yet.
            $missingTable = (string)$error->getCode() === '42S02'
                || ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite' && str_contains($error->getMessage(), 'no such table: shop_company_settings'));
            if (!$missingTable) throw $error;
        }
        $rows = self::exportRows($db, $filters);
        if (!$rows) throw new ShopNirHttpException('Nu există mijloace fixe în perioada aleasă.', 404);
        $base = 'Gestiune-mijloace-fixe-' . ($from === '' ? 'registru-complet' : $from . '-' . $to);
        if ($format === 'xlsx') return ['file_name' => $base . '.xlsx', 'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content_base64' => base64_encode(self::xlsx($rows, $filters, $company))];
        if ($format === 'pdf') return ['file_name' => $base . '.pdf', 'mime_type' => 'application/pdf', 'content_base64' => base64_encode(self::pdf($rows, $filters, $company))];
        throw new InvalidArgumentException('Formatul de export trebuie să fie PDF sau Excel.');
    }
}
