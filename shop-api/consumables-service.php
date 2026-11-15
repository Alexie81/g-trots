<?php
declare(strict_types=1);

require_once __DIR__ . '/fixed-assets-search.php';
require_once __DIR__ . '/nir-domain.php';
require_once __DIR__ . '/consumables-cost.php';

/**
 * Consumables ledger.
 *
 * Source documents add positive stock. Consumption vouchers also store positive
 * quantities, but their accounting effect is an outflow and therefore reduces
 * the available quantity. All stock-changing operations run in transactions.
 */
final class GtrotsConsumables
{
    private const DOCUMENT_TYPES = ['factura', 'bon', 'pv'];
    private const PERSON_ROLES = ['giver', 'receiver'];
    private const MAX_FILE_SIZE = 15728640;

    public static function ensureSchema(PDO $db): void
    {
        $sqlite = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
        if ($sqlite) {
            $db->exec("CREATE TABLE IF NOT EXISTS shop_consumable_documents (
                id TEXT PRIMARY KEY, document_date TEXT NOT NULL, document_type TEXT NOT NULL, series TEXT NOT NULL DEFAULT '', document_number TEXT NOT NULL,
                notes TEXT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )");
            $db->exec("CREATE TABLE IF NOT EXISTS shop_consumables (
                id TEXT PRIMARY KEY, document_id TEXT NOT NULL, line_number INTEGER NOT NULL, product_name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'buc',
                quantity NUMERIC NOT NULL, unit_price NUMERIC NOT NULL, net_value NUMERIC NOT NULL, vat_rate NUMERIC NOT NULL, vat_value NUMERIC NOT NULL,
                total_value NUMERIC NOT NULL, vat_manual INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )");
            $db->exec("CREATE TABLE IF NOT EXISTS shop_consumable_files (
                id TEXT PRIMARY KEY, document_id TEXT NOT NULL, original_name TEXT NOT NULL, storage_name TEXT NOT NULL, mime_type TEXT NOT NULL,
                extension TEXT NOT NULL, file_size INTEGER NOT NULL, sha256 TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )");
            $db->exec("CREATE TABLE IF NOT EXISTS shop_consumable_people (
                id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, details TEXT NULL, active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )");
            $db->exec("CREATE TABLE IF NOT EXISTS shop_consumption_vouchers (
                id TEXT PRIMARY KEY, voucher_date TEXT NOT NULL, series TEXT NOT NULL, voucher_number TEXT NOT NULL,
                giver_id TEXT NULL, giver_name TEXT NOT NULL, receiver_id TEXT NULL, receiver_name TEXT NOT NULL, notes TEXT NULL,
                created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )");
            $db->exec("CREATE TABLE IF NOT EXISTS shop_consumption_voucher_lines (
                id TEXT PRIMARY KEY, voucher_id TEXT NOT NULL, consumable_id TEXT NOT NULL, line_number INTEGER NOT NULL,
                quantity NUMERIC NOT NULL, unit_price NUMERIC NOT NULL, value NUMERIC NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )");
            $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_document_line ON shop_consumables(document_id,line_number)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_consumables_document ON shop_consumables(document_id,line_number)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_consumable_files_document ON shop_consumable_files(document_id,created_at)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_consumable_people_role ON shop_consumable_people(role,active,name)');
            $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_consumption_voucher_number ON shop_consumption_vouchers(series,voucher_number)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_consumption_voucher_date ON shop_consumption_vouchers(voucher_date,id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_consumption_lines_item ON shop_consumption_voucher_lines(consumable_id,voucher_id)');
            self::ensureVoucherReferences($db, true);
            return;
        }

        $db->exec("CREATE TABLE IF NOT EXISTS shop_consumable_documents (
            id CHAR(36) NOT NULL PRIMARY KEY, document_date DATE NOT NULL, document_type VARCHAR(20) NOT NULL, series VARCHAR(80) NOT NULL DEFAULT '', document_number VARCHAR(120) NOT NULL,
            notes TEXT NULL, created_by VARCHAR(160) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_consumable_document_date (document_date,id), INDEX idx_consumable_document_number (document_number), INDEX idx_consumable_document_type (document_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_consumables (
            id CHAR(36) NOT NULL PRIMARY KEY, document_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL, product_name VARCHAR(500) NOT NULL, unit VARCHAR(40) NOT NULL DEFAULT 'buc',
            quantity DECIMAL(16,4) NOT NULL, unit_price DECIMAL(16,4) NOT NULL, net_value DECIMAL(16,2) NOT NULL, vat_rate DECIMAL(7,4) NOT NULL,
            vat_value DECIMAL(16,2) NOT NULL, total_value DECIMAL(16,2) NOT NULL, vat_manual TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_consumable_document_line (document_id,line_number), INDEX idx_consumables_document (document_id,line_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_consumable_files (
            id CHAR(36) NOT NULL PRIMARY KEY, document_id CHAR(36) NOT NULL, original_name VARCHAR(255) NOT NULL, storage_name VARCHAR(500) NOT NULL,
            mime_type VARCHAR(120) NOT NULL, extension VARCHAR(12) NOT NULL, file_size BIGINT UNSIGNED NOT NULL, sha256 CHAR(64) NOT NULL,
            created_by VARCHAR(160) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_consumable_files_document (document_id,created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_consumable_people (
            id CHAR(36) NOT NULL PRIMARY KEY, role VARCHAR(20) NOT NULL, name VARCHAR(240) NOT NULL, details VARCHAR(500) NULL, active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_consumable_people_role (role,active,name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_consumption_vouchers (
            id CHAR(36) NOT NULL PRIMARY KEY, voucher_date DATE NOT NULL, series VARCHAR(80) NOT NULL, voucher_number VARCHAR(120) NOT NULL,
            giver_id CHAR(36) NULL, giver_name VARCHAR(240) NOT NULL, receiver_id CHAR(36) NULL, receiver_name VARCHAR(240) NOT NULL, notes TEXT NULL,
            created_by VARCHAR(160) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_consumption_voucher_number (series,voucher_number), INDEX idx_consumption_voucher_date (voucher_date,id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_consumption_voucher_lines (
            id CHAR(36) NOT NULL PRIMARY KEY, voucher_id CHAR(36) NOT NULL, consumable_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL,
            quantity DECIMAL(16,4) NOT NULL, unit_price DECIMAL(16,4) NOT NULL, value DECIMAL(16,2) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_consumption_voucher_line (voucher_id,line_number), INDEX idx_consumption_lines_item (consumable_id,voucher_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        self::ensureVoucherReferences($db, false);
    }

    private static function ensureVoucherReferences(PDO $db, bool $sqlite): void
    {
        $additions=[
            'shop_consumption_voucher_lines'=>['source_discount_amount'=>'DECIMAL(16,2) NOT NULL DEFAULT 0'],
            'shop_consumable_documents'=>['valuation_mode'=>"VARCHAR(16) NOT NULL DEFAULT 'legacy'",'purchase_discount_type'=>"VARCHAR(16) NOT NULL DEFAULT 'fixed'",'purchase_discount_value'=>'DECIMAL(16,4) NOT NULL DEFAULT 0'],
            'shop_consumables'=>['purchase_discount_amount'=>'DECIMAL(16,2) NOT NULL DEFAULT 0','stock_cost_value'=>'DECIMAL(16,2) NULL','stock_cost_unit'=>'DECIMAL(16,4) NULL'],
        ];
        foreach($additions as $table=>$fields){
            $known=$sqlite?$db->query('PRAGMA table_info('.$table.')')->fetchAll(PDO::FETCH_COLUMN,1):$db->query('SHOW COLUMNS FROM '.$table)->fetchAll(PDO::FETCH_COLUMN);
            foreach($fields as $column=>$definition){if(in_array($column,$known,true))continue;
                try{$db->exec('ALTER TABLE '.$table.' ADD COLUMN '.$column.' '.$definition);}
                catch(PDOException $error){if($sqlite||(int)($error->errorInfo[1]??0)!==1060)throw $error;}
            }
        }
        $columns = $sqlite
            ? $db->query('PRAGMA table_info(shop_consumption_vouchers)')->fetchAll(PDO::FETCH_COLUMN, 1)
            : $db->query('SHOW COLUMNS FROM shop_consumption_vouchers')->fetchAll(PDO::FETCH_COLUMN);
        foreach (['work_reference' => "VARCHAR(240) NOT NULL DEFAULT ''", 'order_reference' => "VARCHAR(240) NOT NULL DEFAULT ''", 'discount_type' => "VARCHAR(16) NOT NULL DEFAULT 'fixed'", 'discount_value' => 'DECIMAL(16,4) NOT NULL DEFAULT 0'] as $column => $definition) {
            if (in_array($column, $columns, true)) continue;
            try {
                $db->exec('ALTER TABLE shop_consumption_vouchers ADD COLUMN '.$column.' '.$definition);
            } catch (PDOException $error) {
                // Another request may have completed the same additive migration.
                if ($sqlite || (int)($error->errorInfo[1] ?? 0) !== 1060) throw $error;
            }
        }
        $lineColumns = $sqlite ? $db->query('PRAGMA table_info(shop_consumption_voucher_lines)')->fetchAll(PDO::FETCH_COLUMN, 1) : $db->query('SHOW COLUMNS FROM shop_consumption_voucher_lines')->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('discount_amount', $lineColumns, true)) {
            try { $db->exec('ALTER TABLE shop_consumption_voucher_lines ADD COLUMN discount_amount DECIMAL(16,2) NOT NULL DEFAULT 0'); }
            catch (PDOException $error) { if ($sqlite || (int)($error->errorInfo[1] ?? 0) !== 1060) throw $error; }
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

    private static function revision(array $data): string
    {
        unset($data['revision']);
        return hash('sha256', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    private static function checkRevision(array $current, array $body): void
    {
        if (!isset($body['revision']) || !hash_equals((string)$current['revision'], (string)$body['revision'])) {
            throw new ShopNirHttpException('Datele au fost modificate între timp. Redeschide fișa și încearcă din nou.', 409);
        }
    }

    private static function begin(PDO $db): void
    {
        if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') $db->exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        $db->beginTransaction();
    }

    private static function lockItem(PDO $db, string $id): array
    {
        $sql = 'SELECT * FROM shop_consumables WHERE id=?' . ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '');
        $stmt = $db->prepare($sql);
        $stmt->execute([$id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$item) throw new ShopNirHttpException('Consumabilul nu există.', 404);
        return $item;
    }

    private static function lockDocument(PDO $db, string $id): void
    {
        $stmt = $db->prepare('SELECT id FROM shop_consumable_documents WHERE id=?' . ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : ''));
        $stmt->execute([$id]);
        if (!$stmt->fetchColumn()) throw new ShopNirHttpException('Documentul consumabilelor nu există.', 404);
    }

    private static function files(PDO $db, string $documentId): array
    {
        $stmt = $db->prepare('SELECT * FROM shop_consumable_files WHERE document_id=? ORDER BY created_at,id');
        $stmt->execute([$documentId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    private static function prepareAttachment(array $attachment): array
    {
        $name = mb_substr(basename(trim((string)($attachment['file_name'] ?? 'document'))), 0, 255);
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $allowed = [
            'pdf'=>['application/pdf'],'jpg'=>['image/jpeg'],'jpeg'=>['image/jpeg'],'png'=>['image/png'],'webp'=>['image/webp'],
            'xlsx'=>['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'],
            'xls'=>['application/vnd.ms-excel','application/octet-stream'],'xml'=>['application/xml','text/xml','application/octet-stream'],
            'doc'=>['application/msword','application/octet-stream'],'docx'=>['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream'],
        ];
        $mime = strtolower(trim((string)($attachment['mime_type'] ?? 'application/octet-stream')));
        if (!isset($allowed[$extension]) || !in_array($mime, $allowed[$extension], true)) throw new InvalidArgumentException('Fișierul trebuie să fie PDF, imagine, Excel, Word sau XML și să aibă un tip valid.');
        $base64 = trim((string)($attachment['content_base64'] ?? ''));
        if (str_contains($base64, ',')) $base64 = substr($base64, strpos($base64, ',') + 1);
        $bytes = base64_decode($base64, true);
        if ($bytes === false || $bytes === '') throw new InvalidArgumentException('Conținutul fișierului este invalid.');
        if (strlen($bytes) > self::MAX_FILE_SIZE) throw new InvalidArgumentException('Fișierul depășește limita de 15 MB.');
        return compact('name','extension','mime','bytes') + ['sha256'=>hash('sha256',$bytes)];
    }

    private static function prepareFiles(array $body): array
    {
        $attachments = $body['attachments'] ?? [];
        if (!is_array($attachments) || count($attachments) > 20) throw new InvalidArgumentException('Poți încărca maximum 20 de fișiere într-o operațiune.');
        $files=[]; $size=0;
        foreach ($attachments as $attachment) {
            if (!is_array($attachment)) throw new InvalidArgumentException('Fișier invalid.');
            $file=self::prepareAttachment($attachment); $size += strlen($file['bytes']);
            if ($size > 60*1024*1024) throw new InvalidArgumentException('Fișierele selectate depășesc 60 MB.');
            $files[]=$file;
        }
        return $files;
    }

    private static function saveAttachment(string $id, array $file): string
    {
        $root=__DIR__.DIRECTORY_SEPARATOR.'uploads'.DIRECTORY_SEPARATOR.'consumables';
        $folder=$root.DIRECTORY_SEPARATOR.date('Y').DIRECTORY_SEPARATOR.date('m');
        if (!is_dir($folder) && !mkdir($folder,0750,true) && !is_dir($folder)) throw new RuntimeException('Spațiul pentru documentele consumabilelor nu poate fi creat.');
        $deny=$root.DIRECTORY_SEPARATOR.'.htaccess';
        if (!is_file($deny)) @file_put_contents($deny,"Options -Indexes\nRequire all denied\n",LOCK_EX);
        $name=str_replace('-','',$id).'.'.$file['extension']; $path=$folder.DIRECTORY_SEPARATOR.$name;
        if (file_put_contents($path,$file['bytes'],LOCK_EX)!==strlen($file['bytes'])) throw new RuntimeException('Fișierul nu a putut fi salvat complet.');
        return 'uploads/consumables/'.date('Y').'/'.date('m').'/'.$name;
    }

    private static function storedPath(string $storageName): string
    {
        $root=realpath(__DIR__.DIRECTORY_SEPARATOR.'uploads'.DIRECTORY_SEPARATOR.'consumables');
        $path=realpath(__DIR__.DIRECTORY_SEPARATOR.str_replace('/',DIRECTORY_SEPARATOR,$storageName));
        if ($root===false || $path===false || !str_starts_with($path,$root.DIRECTORY_SEPARATOR) || !is_file($path)) throw new ShopNirHttpException('Fișierul nu mai este disponibil.',404);
        return $path;
    }

    private static function insertFiles(PDO $db,string $documentId,array $files,array $user,array &$saved): void
    {
        $insert=$db->prepare('INSERT INTO shop_consumable_files (id,document_id,original_name,storage_name,mime_type,extension,file_size,sha256,created_by) VALUES (?,?,?,?,?,?,?,?,?)');
        foreach($files as $file){$id=self::uuid();$path=self::saveAttachment($id,$file);$saved[]=$path;$insert->execute([$id,$documentId,$file['name'],$path,$file['mime'],$file['extension'],strlen($file['bytes']),$file['sha256'],self::actor($user)]);}
    }

    private static function removeStoredFiles(array $paths): void
    {
        foreach($paths as $path){try{@unlink(self::storedPath((string)$path));}catch(Throwable $ignored){}}
    }

    public static function createDocument(PDO $db,array $body,array $user): array { return self::saveDocument($db,null,$body,$user); }
    public static function updateDocument(PDO $db,string $id,array $body,array $user): array { return self::saveDocument($db,$id,$body,$user); }

    private static function saveDocument(PDO $db,?string $documentId,array $body,array $user): array
    {
        $document=(array)($body['document']??$body);
        $type=strtolower(trim((string)($document['document_type']??'')));
        if(!in_array($type,self::DOCUMENT_TYPES,true)) throw new InvalidArgumentException('Tipul documentului trebuie să fie factură, bon sau proces-verbal.');
        $date=self::date($document['document_date']??'','Data documentului');
        $series=mb_substr(trim((string)($document['series']??'')),0,80);
        $number=mb_substr(trim((string)($document['document_number']??'')),0,120);
        if($number==='') throw new InvalidArgumentException('Numărul documentului este obligatoriu.');
        $lines=array_values(array_filter((array)($body['lines']??[]),'is_array'));
        if(!$lines) throw new InvalidArgumentException('Adaugă cel puțin un consumabil.');
        if(count($lines)>250) throw new InvalidArgumentException('Un document poate conține maximum 250 de poziții.');
        $prepared=[];
        foreach($lines as $index=>$line){
            $name=mb_substr(trim((string)($line['product_name']??'')),0,500);
            if($name==='') throw new InvalidArgumentException('Denumirea consumabilului este obligatorie la poziția '.($index+1).'.');
            $unit=mb_substr(trim((string)($line['unit']??'buc')),0,40)?:'buc';
            $quantity=self::decimal($line['quantity']??'','Cantitatea de la poziția '.($index+1),false);
            $unitPrice=self::decimal($line['unit_price']??'','Prețul unitar de la poziția '.($index+1));
            $vatRate=self::decimal($line['vat_rate']??0,'TVA-ul de la poziția '.($index+1));
            if($vatRate>100) throw new InvalidArgumentException('TVA-ul nu poate depăși 100%.');
            $net=round($quantity*$unitPrice,2); $manual=isset($line['vat_value'])&&$line['vat_value']!=='';
            $vat=$manual?round(self::decimal($line['vat_value'],'Valoarea TVA'),2):round($net*$vatRate/100,2);
            $prepared[]=compact('name','unit','quantity','unitPrice','vatRate','net','vat','manual')+['id'=>(string)($line['id']??''),'total'=>round($net+$vat,2)];
        }
        $files=self::prepareFiles($body); $id=$documentId??self::uuid(); $saved=[]; $actor=self::actor($user);
        self::begin($db);
        try{
            $existing=[]; $notes=mb_substr(trim((string)($document['notes']??'')),0,2000);
            if($documentId!==null){
                self::lockDocument($db,$id); $itemLocks=$db->prepare('SELECT id FROM shop_consumables WHERE document_id=? ORDER BY id');$itemLocks->execute([$id]);foreach($itemLocks->fetchAll(PDO::FETCH_COLUMN) as $itemLock)self::lockItem($db,$itemLock); $current=self::getDocument($db,$id); self::checkRevision($current,$body);
                foreach($current['lines'] as $line)$existing[$line['id']]=$line;
                $db->prepare('UPDATE shop_consumable_documents SET document_date=?,document_type=?,series=?,document_number=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$date,$type,$series,$number,$notes,$id]);
                $db->prepare('UPDATE shop_consumables SET line_number=line_number+1000000 WHERE document_id=?')->execute([$id]);
            }else{
                $db->prepare('INSERT INTO shop_consumable_documents (id,document_date,document_type,series,document_number,notes,created_by) VALUES (?,?,?,?,?,?,?)')->execute([$id,$date,$type,$series,$number,$notes,$actor]);
            }
            $costFields=['valuation_mode','purchase_discount_type','purchase_discount_value'];
            foreach($costFields as $field){if(!array_key_exists($field,$document))$document[$field]=$current[$field]??(['valuation_mode'=>'legacy','purchase_discount_type'=>'fixed','purchase_discount_value'=>0][$field]);}
            if(!in_array($document['valuation_mode'],['legacy','acquisition'],true))throw new InvalidArgumentException('Modul de calcul al discountului nu este valid.');
            if(($current['valuation_mode']??'legacy')==='acquisition'&&$document['valuation_mode']!=='acquisition')throw new InvalidArgumentException('Păstrează calculul automat al discountului pentru acest document.');
            if($document['valuation_mode']==='acquisition'){
                $prepared=GtrotsConsumablesCost::apply($prepared,$document);
            }
            $db->prepare('UPDATE shop_consumable_documents SET '.implode(',',array_map(fn($f)=>$f.'=?',$costFields)).' WHERE id=?')->execute([...array_map(fn($f)=>$document[$f],$costFields),$id]);
            $seen=[];
            $insert=$db->prepare('INSERT INTO shop_consumables (id,document_id,line_number,product_name,unit,quantity,unit_price,net_value,vat_rate,vat_value,total_value,vat_manual) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
            $update=$db->prepare('UPDATE shop_consumables SET line_number=?,product_name=?,unit=?,quantity=?,unit_price=?,net_value=?,vat_rate=?,vat_value=?,total_value=?,vat_manual=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND document_id=?');
            foreach($prepared as $index=>$line){
                $lineId=$line['id'];
                if($lineId!==''){
                    if(!isset($existing[$lineId])||isset($seen[$lineId])) throw new InvalidArgumentException('Poziție invalidă sau duplicată în document.');
                    if($line['quantity']+0.00005<(float)$existing[$lineId]['consumed_quantity']) throw new ShopNirHttpException('Cantitatea inițială nu poate fi mai mică decât cantitatea deja consumată pentru „'.$line['name'].'”.',409);
                    $update->execute([$index+1,$line['name'],$line['unit'],$line['quantity'],$line['unitPrice'],$line['net'],$line['vatRate'],$line['vat'],$line['total'],$line['manual']?1:0,$lineId,$id]);
                }else{$lineId=self::uuid();$insert->execute([$lineId,$id,$index+1,$line['name'],$line['unit'],$line['quantity'],$line['unitPrice'],$line['net'],$line['vatRate'],$line['vat'],$line['total'],$line['manual']?1:0]);}
                if($document['valuation_mode']==='acquisition'){
                    $old=$existing[$lineId]??null;
                    $changed=$old&&($old['stock_cost_value']===null||shopNirDecimalToScaled($old['purchase_discount_amount'],2)!==shopNirDecimalToScaled($line['purchaseDiscount'],2)||shopNirDecimalToScaled($old['stock_cost_value'],2)!==shopNirDecimalToScaled($line['stockCost'],2)||shopNirDecimalToScaled($old['quantity'],4)!==shopNirDecimalToScaled($line['quantity'],4));
                    if($changed&&(float)$old['consumed_quantity']>0&&empty($body['revalue_existing_vouchers']))throw new ShopNirHttpException('Confirmă recalcularea bonurilor existente pentru modificarea costului de intrare.',409);
                    $db->prepare('UPDATE shop_consumables SET purchase_discount_amount=?,stock_cost_value=?,stock_cost_unit=? WHERE id=?')->execute([$line['purchaseDiscount'],$line['stockCost'],$line['stockUnit'],$lineId]);
                    if($changed&&(float)$old['consumed_quantity']>0)self::revalueIssues($db,$lineId,$line);
                }
                $seen[$lineId]=true;
            }
            foreach($existing as $lineId=>$line){
                if(isset($seen[$lineId]))continue;
                $db->prepare('DELETE FROM shop_consumption_voucher_lines WHERE consumable_id=?')->execute([$lineId]);
                $db->prepare('DELETE FROM shop_consumables WHERE id=?')->execute([$lineId]);
            }
            $db->exec('DELETE FROM shop_consumption_vouchers WHERE NOT EXISTS (SELECT 1 FROM shop_consumption_voucher_lines l WHERE l.voucher_id=shop_consumption_vouchers.id)');
            self::insertFiles($db,$id,$files,$user,$saved); $db->commit();
        }catch(Throwable $error){if($db->inTransaction())$db->rollBack();self::removeStoredFiles($saved);throw $error;}
        return self::getDocument($db,$id);
    }

    private static function revalueIssues(PDO $db,string $itemId,array $source): void
    {
        $query=$db->prepare('SELECT l.* FROM shop_consumption_voucher_lines l JOIN shop_consumption_vouchers v ON v.id=l.voucher_id WHERE l.consumable_id=? ORDER BY v.voucher_date,v.created_at,v.id,l.line_number');$query->execute([$itemId]);
        $quantity=shopNirDecimalToScaled($source['quantity'],4);$cost=shopNirDecimalToScaled($source['stockCost'],2);$used=0;$value=0;$usedDiscount=0;$totalDiscount=shopNirDecimalToScaled($source['purchaseDiscount'],2);
        foreach($query->fetchAll(PDO::FETCH_ASSOC) as $issue){
            $qty=shopNirDecimalToScaled($issue['quantity'],4);$amount=GtrotsConsumablesCost::issue($cost,$quantity,$used,$value,$qty);$issueDiscount=GtrotsConsumablesCost::issue($totalDiscount,$quantity,$used,$usedDiscount,$qty);$usedDiscount+=$issueDiscount;$used+=$qty;$value+=$amount;
            $db->prepare('UPDATE shop_consumption_voucher_lines SET unit_price=?,value=?,discount_amount=0,source_discount_amount=? WHERE id=?')->execute([$source['stockUnit'],$amount/100,$issueDiscount/100,$issue['id']]);
            $sum=$db->prepare('SELECT COALESCE(SUM(discount_amount),0) FROM shop_consumption_voucher_lines WHERE voucher_id=?');$sum->execute([$issue['voucher_id']]);
            $db->prepare("UPDATE shop_consumption_vouchers SET discount_type='fixed',discount_value=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$sum->fetchColumn(),$issue['voucher_id']]);
        }
    }

    private static function filterSql(array $filters,array &$params): string
    {
        $where=[]; $type=strtolower(trim((string)($filters['type']??'')));
        if(in_array($type,self::DOCUMENT_TYPES,true)){$where[]='d.document_type=?';$params[]=$type;}
        return $where?' WHERE '.implode(' AND ',$where):'';
    }

    private static function searchMatches(PDO $db,array $filters): ?array
    {
        $raw=trim((string)($filters['search']??'')); if($raw==='')return null;
        $params=[];$where=self::filterSql($filters,$params);
        $stmt=$db->prepare('SELECT c.id,c.product_name,d.series,d.document_number,d.document_type FROM shop_consumables c JOIN shop_consumable_documents d ON d.id=c.document_id'.$where);
        $stmt->execute($params);$query=GtrotsFixedAssetSearch::query($raw);$scores=[];
        foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row){$score=GtrotsFixedAssetSearch::score($row,$query);if($score>0)$scores[$row['id']]=$score;}
        arsort($scores,SORT_NUMERIC); return $scores;
    }

    public static function list(PDO $db,array $filters): array
    {
        $page=max(1,(int)($filters['page']??1));$pageSize=max(1,min(500,(int)($filters['page_size']??25)));
        $params=[];$where=self::filterSql($filters,$params);$scores=self::searchMatches($db,$filters);
        if($scores===[])return ['items'=>[],'total'=>0,'page'=>1,'page_size'=>$pageSize,'page_count'=>1];
        $stmt=$db->prepare('SELECT c.*,d.document_date,d.document_type,d.series,d.document_number,d.notes,d.created_by,
            COALESCE((SELECT SUM(l.quantity) FROM shop_consumption_voucher_lines l WHERE l.consumable_id=c.id),0) consumed_quantity,
            COALESCE((SELECT SUM(l.value) FROM shop_consumption_voucher_lines l WHERE l.consumable_id=c.id),0) consumed_value,
            COALESCE((SELECT SUM(l.source_discount_amount) FROM shop_consumption_voucher_lines l WHERE l.consumable_id=c.id),0) consumed_source_discount,
            (SELECT COUNT(DISTINCT l.voucher_id) FROM shop_consumption_voucher_lines l WHERE l.consumable_id=c.id) consumption_count,
            (SELECT COUNT(*) FROM shop_consumable_files f WHERE f.document_id=d.id) file_count
            FROM shop_consumables c JOIN shop_consumable_documents d ON d.id=c.document_id'.$where.' ORDER BY d.document_date DESC,d.created_at DESC,c.line_number ASC');
        $stmt->execute($params);$rows=$stmt->fetchAll(PDO::FETCH_ASSOC);
        if($scores!==null){$rows=array_values(array_filter($rows,fn($r)=>isset($scores[$r['id']])));usort($rows,fn($a,$b)=>($scores[$b['id']]<=>$scores[$a['id']])?:strcmp((string)$b['document_date'],(string)$a['document_date']));}
        foreach($rows as &$row){$row['remaining_quantity']=round((float)$row['quantity']-(float)$row['consumed_quantity'],4);$row['has_document']=(int)$row['file_count']>0;}unset($row);
        $total=count($rows);$pageCount=max(1,(int)ceil($total/$pageSize));$page=min($page,$pageCount);
        $items=array_slice($rows,($page-1)*$pageSize,$pageSize);$vouchers=[];
        if($items){
            $ids=array_column($items,'id');
            $summary=$db->prepare('SELECT l.consumable_id,v.id voucher_id,v.series,v.voucher_number,v.voucher_date FROM shop_consumption_voucher_lines l JOIN shop_consumption_vouchers v ON v.id=l.voucher_id WHERE l.consumable_id IN ('.implode(',',array_fill(0,count($ids),'?')).') ORDER BY v.voucher_date DESC,v.created_at DESC,v.id');
            $summary->execute($ids);
            foreach($summary->fetchAll(PDO::FETCH_ASSOC) as $voucher){$itemId=$voucher['consumable_id'];unset($voucher['consumable_id']);$vouchers[$itemId][]=$voucher;}
        }
        foreach($items as &$item)$item['vouchers']=$vouchers[$item['id']]??[];unset($item);
        return ['items'=>$items,'total'=>$total,'page'=>$page,'page_size'=>$pageSize,'page_count'=>$pageCount];
    }

    public static function get(PDO $db,string $id): array
    {
        $stmt=$db->prepare('SELECT c.*,d.document_date,d.document_type,d.series,d.document_number,d.notes,d.created_by,d.created_at document_created_at FROM shop_consumables c JOIN shop_consumable_documents d ON d.id=c.document_id WHERE c.id=? LIMIT 1');
        $stmt->execute([$id]);$item=$stmt->fetch(PDO::FETCH_ASSOC);if(!$item)throw new ShopNirHttpException('Consumabilul nu există.',404);
        $v=$db->prepare('SELECT l.id line_id,l.quantity,l.unit_price,l.value,l.discount_amount,l.source_discount_amount,v.id voucher_id,v.voucher_date,v.series,v.voucher_number,v.giver_name,v.receiver_name,v.notes,v.created_by,v.created_at
            FROM shop_consumption_voucher_lines l JOIN shop_consumption_vouchers v ON v.id=l.voucher_id WHERE l.consumable_id=? ORDER BY v.voucher_date DESC,v.created_at DESC,l.line_number');
        $v->execute([$id]);$item['vouchers']=$v->fetchAll(PDO::FETCH_ASSOC);$item['consumed_quantity']=array_sum(array_map(fn($r)=>(float)$r['quantity'],$item['vouchers']));
        $item['consumed_value']=array_sum(array_map(fn($r)=>(float)$r['value'],$item['vouchers']));$item['remaining_cost']=$item['stock_cost_value']===null?null:round((float)$item['stock_cost_value']-$item['consumed_value'],2);$item['remaining_quantity']=round((float)$item['quantity']-(float)$item['consumed_quantity'],4);$item['files']=self::files($db,(string)$item['document_id']);$item['has_document']=count($item['files'])>0;$item['revision']=self::revision($item);return $item;
    }

    public static function getDocument(PDO $db,string $id): array
    {
        $stmt=$db->prepare('SELECT * FROM shop_consumable_documents WHERE id=? LIMIT 1');$stmt->execute([$id]);$document=$stmt->fetch(PDO::FETCH_ASSOC);if(!$document)throw new ShopNirHttpException('Documentul consumabilelor nu există.',404);
        $lines=$db->prepare('SELECT id FROM shop_consumables WHERE document_id=? ORDER BY line_number');$lines->execute([$id]);$document['lines']=array_map(fn($line)=>self::get($db,(string)$line['id']),$lines->fetchAll(PDO::FETCH_ASSOC));$document['files']=self::files($db,$id);$document['revision']=self::revision($document);return $document;
    }

    public static function addFiles(PDO $db,string $documentId,array $body,array $user): array
    {
        $files=self::prepareFiles($body);if(!$files)throw new InvalidArgumentException('Selectează cel puțin un fișier.');$saved=[];self::begin($db);
        try{self::lockDocument($db,$documentId);self::insertFiles($db,$documentId,$files,$user,$saved);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();self::removeStoredFiles($saved);throw $e;}return self::getDocument($db,$documentId);
    }

    public static function deleteFile(PDO $db,string $documentId,array $body): array
    {
        self::begin($db);try{self::lockDocument($db,$documentId);$s=$db->prepare('SELECT storage_name FROM shop_consumable_files WHERE id=? AND document_id=?');$s->execute([(string)($body['file_id']??''),$documentId]);$path=$s->fetchColumn();if(!$path)throw new ShopNirHttpException('Fișierul nu există.',404);$db->prepare('DELETE FROM shop_consumable_files WHERE id=? AND document_id=?')->execute([(string)$body['file_id'],$documentId]);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}self::removeStoredFiles([(string)$path]);return self::getDocument($db,$documentId);
    }

    public static function download(PDO $db,string $documentId,string $fileId=''): array
    {
        $sql='SELECT original_name,storage_name,mime_type FROM shop_consumable_files WHERE document_id=?'.($fileId!==''?' AND id=?':'').' ORDER BY created_at,id LIMIT 1';$s=$db->prepare($sql);$s->execute($fileId!==''?[$documentId,$fileId]:[$documentId]);$file=$s->fetch(PDO::FETCH_ASSOC);if(!$file)throw new ShopNirHttpException('Acest document nu are fișier atașat.',404);$bytes=file_get_contents(self::storedPath((string)$file['storage_name']));if($bytes===false)throw new RuntimeException('Fișierul nu a putut fi citit.');return ['file_name'=>$file['original_name'],'mime_type'=>$file['mime_type'],'content_base64'=>base64_encode($bytes)];
    }

    public static function deleteItem(PDO $db,string $id,array $body): array
    {
        $paths=[];self::begin($db);try{$item=self::get($db,$id);self::checkRevision($item,$body);self::lockDocument($db,(string)$item['document_id']);$db->prepare('DELETE FROM shop_consumption_voucher_lines WHERE consumable_id=?')->execute([$id]);$db->exec('DELETE FROM shop_consumption_vouchers WHERE NOT EXISTS (SELECT 1 FROM shop_consumption_voucher_lines l WHERE l.voucher_id=shop_consumption_vouchers.id)');$db->prepare('DELETE FROM shop_consumables WHERE id=?')->execute([$id]);$c=$db->prepare('SELECT COUNT(*) FROM shop_consumables WHERE document_id=?');$c->execute([$item['document_id']]);$documentDeleted=(int)$c->fetchColumn()===0;if($documentDeleted){$paths=array_column(self::files($db,(string)$item['document_id']),'storage_name');$db->prepare('DELETE FROM shop_consumable_files WHERE document_id=?')->execute([$item['document_id']]);$db->prepare('DELETE FROM shop_consumable_documents WHERE id=?')->execute([$item['document_id']]);}$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}self::removeStoredFiles($paths);return ['success'=>true,'document_deleted'=>$documentDeleted];
    }

    public static function deleteDocument(PDO $db,string $id,array $body): array
    {
        self::begin($db);try{self::lockDocument($db,$id);$document=self::getDocument($db,$id);self::checkRevision($document,$body);$paths=array_column($document['files'],'storage_name');foreach($document['lines'] as $line)$db->prepare('DELETE FROM shop_consumption_voucher_lines WHERE consumable_id=?')->execute([$line['id']]);$db->exec('DELETE FROM shop_consumption_vouchers WHERE NOT EXISTS (SELECT 1 FROM shop_consumption_voucher_lines l WHERE l.voucher_id=shop_consumption_vouchers.id)');$db->prepare('DELETE FROM shop_consumables WHERE document_id=?')->execute([$id]);$db->prepare('DELETE FROM shop_consumable_files WHERE document_id=?')->execute([$id]);$db->prepare('DELETE FROM shop_consumable_documents WHERE id=?')->execute([$id]);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}self::removeStoredFiles($paths);return ['success'=>true];
    }

    public static function listPeople(PDO $db): array
    {
        $rows=$db->query('SELECT * FROM shop_consumable_people ORDER BY active DESC,role,name')->fetchAll(PDO::FETCH_ASSOC);
        return ['givers'=>array_values(array_filter($rows,fn($r)=>$r['role']==='giver')),'receivers'=>array_values(array_filter($rows,fn($r)=>$r['role']==='receiver'))];
    }

    public static function savePerson(PDO $db,array $body): array
    {
        $id=trim((string)($body['id']??''));$role=strtolower(trim((string)($body['role']??'')));if(!in_array($role,self::PERSON_ROLES,true))throw new InvalidArgumentException('Rolul persoanei este invalid.');$name=mb_substr(trim((string)($body['name']??'')),0,240);if($name==='')throw new InvalidArgumentException('Numele persoanei este obligatoriu.');$details=mb_substr(trim((string)($body['details']??'')),0,500);$active=empty($body['active'])?0:1;
        if($id===''){$id=self::uuid();$db->prepare('INSERT INTO shop_consumable_people (id,role,name,details,active) VALUES (?,?,?,?,?)')->execute([$id,$role,$name,$details,$active]);}else{$s=$db->prepare('UPDATE shop_consumable_people SET role=?,name=?,details=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?');$s->execute([$role,$name,$details,$active,$id]);if(!$s->rowCount()&&!self::personExists($db,$id))throw new ShopNirHttpException('Persoana nu există.',404);}return self::listPeople($db);
    }

    private static function personExists(PDO $db,string $id): bool{$s=$db->prepare('SELECT 1 FROM shop_consumable_people WHERE id=?');$s->execute([$id]);return(bool)$s->fetchColumn();}

    public static function deletePerson(PDO $db,string $id): array
    {
        // Voucher snapshots retain the historical names, so directory entries
        // can be removed without altering previously issued documents.
        $db->prepare('DELETE FROM shop_consumable_people WHERE id=?')->execute([$id]);return self::listPeople($db);
    }

    public static function voucherMeta(PDO $db,string $series='BC'): array
    {
        $series=mb_substr(trim($series),0,80)?:'BC';$s=$db->prepare('SELECT voucher_number FROM shop_consumption_vouchers WHERE series=? ORDER BY created_at DESC');$s->execute([$series]);$max=0;foreach($s->fetchAll(PDO::FETCH_COLUMN) as $number)if(ctype_digit((string)$number))$max=max($max,(int)$number);return ['series'=>$series,'next_number'=>(string)($max+1),'people'=>self::listPeople($db)];
    }

    private static function personSnapshot(PDO $db,?string $id,string $typed,string $role): array
    {
        if($id){$s=$db->prepare('SELECT id,name FROM shop_consumable_people WHERE id=? AND role=?');$s->execute([$id,$role]);$person=$s->fetch(PDO::FETCH_ASSOC);if($person)return [(string)$person['id'],(string)$person['name']];}
        $name=mb_substr(trim($typed),0,240);if($name==='')throw new InvalidArgumentException(($role==='giver'?'Predătorul':'Primitorul').' este obligatoriu.');return [null,$name];
    }

    private static function prepareVoucher(PDO $db,?string $id,array $body,array $user,bool $lock): array
    {
        if ($lock && $id && $db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql') {
            $stmt=$db->prepare('SELECT id FROM shop_consumption_vouchers WHERE id=? FOR UPDATE');$stmt->execute([$id]);
        }
        $current=$id?self::getVoucher($db,$id):null;
        if ($current) self::checkRevision($current,$body);
        $voucher=[
            'voucher_date'=>self::date($body['voucher_date']??'','Data bonului de consum'),
            'series'=>mb_substr(trim((string)($body['series']??'BC')),0,80)?:'BC',
            'voucher_number'=>mb_substr(trim((string)($body['voucher_number']??'')),0,120),
            'notes'=>mb_substr(trim((string)($body['notes']??'')),0,2000),
            'work_reference'=>mb_substr(trim((string)($body['work_reference']??$current['work_reference']??'')),0,240),
            'order_reference'=>mb_substr(trim((string)($body['order_reference']??$current['order_reference']??'')),0,240),
            'created_by'=>$current['created_by']??self::actor($user),
        ];
        if($voucher['voucher_number']==='')throw new InvalidArgumentException('Numărul bonului de consum este obligatoriu.');
        foreach(['giver','receiver'] as $role) {
            [$voucher[$role.'_id'],$voucher[$role.'_name']]=self::personSnapshot($db,trim((string)($body[$role.'_id']??''))?:null,(string)($body[$role.'_name']??''),$role);
        }
        $inputLines=array_values(array_filter((array)($body['lines']??[]),'is_array'));
        if(!$inputLines)throw new InvalidArgumentException('Adaugă cel puțin un consumabil pe bon.');
        if(count($inputLines)>250)throw new InvalidArgumentException('Bonul poate conține maximum 250 de poziții.');
        $seen=[];$lines=[];$grossCents=[];$discountWeights=[];$subtotal=0;$costed=false;
        foreach($inputLines as $index=>$line) {
            $itemId=trim((string)($line['consumable_id']??''));
            if($itemId===''||isset($seen[$itemId]))throw new InvalidArgumentException('Consumabil invalid sau duplicat pe bon.');
            $seen[$itemId]=true;
            $quantity=self::decimal($line['quantity']??'','Cantitatea eliberată la poziția '.($index+1),false);
            if($lock)self::lockItem($db,$itemId);
            $stmt=$db->prepare('SELECT c.*,d.series document_series,d.document_number,d.document_date,d.document_type FROM shop_consumables c JOIN shop_consumable_documents d ON d.id=c.document_id WHERE c.id=?');
            $stmt->execute([$itemId]);$item=$stmt->fetch(PDO::FETCH_ASSOC);
            if(!$item)throw new ShopNirHttpException('Consumabilul nu există.',404);
            $used=$db->prepare('SELECT COALESCE(SUM(quantity),0) FROM shop_consumption_voucher_lines WHERE consumable_id=? AND voucher_id<>?');$used->execute([$itemId,$id??'']);
            $remaining=round((float)$item['quantity']-(float)$used->fetchColumn(),4);
            if($quantity-$remaining>0.00005)throw new ShopNirHttpException('Cantitatea de pe bon depășește stocul disponibil pentru „'.$item['product_name'].'” (disponibil '.rtrim(rtrim(number_format($remaining,4,',','.'),'0'),',').').',409);
            $price=$item['unit_price'];$sourceDiscount=0;
            if($item['stock_cost_value']!==null){
                $costed=true;$price=$item['stock_cost_unit'];
                $usedValue=$db->prepare('SELECT COALESCE(SUM(value),0) amount,COALESCE(SUM(source_discount_amount),0) reduction FROM shop_consumption_voucher_lines WHERE consumable_id=? AND voucher_id<>?');$usedValue->execute([$itemId,$id??'']);$usedAmounts=$usedValue->fetch(PDO::FETCH_ASSOC);
                $sourceDiscount=GtrotsConsumablesCost::issue(shopNirDecimalToScaled($item['purchase_discount_amount'],2),shopNirDecimalToScaled($item['quantity'],4),shopNirDecimalToScaled((float)$item['quantity']-$remaining,4),shopNirDecimalToScaled($usedAmounts['reduction'],2),shopNirDecimalToScaled($quantity,4));
                $gross=GtrotsConsumablesCost::issue(shopNirDecimalToScaled($item['stock_cost_value'],2),shopNirDecimalToScaled($item['quantity'],4),shopNirDecimalToScaled((float)$item['quantity']-$remaining,4),shopNirDecimalToScaled($usedAmounts['amount'],2),shopNirDecimalToScaled($quantity,4));
            }else $gross=shopNirMultiplyScaled(shopNirDecimalToScaled($quantity,4),4,shopNirDecimalToScaled($price,4),4,2);
            $grossCents[]=$gross;$discountWeights[]=$item['stock_cost_value']===null?$gross:0;$subtotal+=$gross;
            $lines[]=['consumable_id'=>$itemId,'line_number'=>$index+1,'quantity'=>shopNirScaledToDecimal(shopNirDecimalToScaled($quantity,4),4),'unit_price'=>$price,'source_discount_amount'=>shopNirScaledToDecimal($sourceDiscount,2),'product_name'=>$item['product_name'],'unit'=>$item['unit'],'document_id'=>$item['document_id'],'document_series'=>$item['document_series'],'document_number'=>$item['document_number'],'document_date'=>$item['document_date'],'document_type'=>$item['document_type']];
        }
        $type=(string)($body['discount_type']??$current['discount_type']??'fixed');
        if(!in_array($type,['fixed','percent'],true))throw new InvalidArgumentException('Alege discount ca sumă fixă sau procent.');
        $input=self::decimal($body['discount_value']??$current['discount_value']??0,'Discountul');
        if($costed&&$input>0&&(!$current||(float)$current['discount_amount']<=0))throw new InvalidArgumentException('Reducerea este deja inclusă în costul de intrare. Modifică reducerea pe documentul furnizorului, nu încă o dată pe bon.');
        if($type==='percent'&&$input>100)throw new InvalidArgumentException('Discountul procentual trebuie să fie între 0 și 100%.');
        $discountBase=array_sum($discountWeights);
        $discount=$type==='percent'?shopNirDivideRounded($discountBase*shopNirDecimalToScaled($input,4),1000000):shopNirDecimalToScaled($input,2);
        if($discount>$discountBase)throw new InvalidArgumentException('Discountul nu poate depăși valoarea bonului.');
        // Allocate in whole cents; largest remainders keep line totals equal to the voucher total.
        $allocated=[];$remainders=[];$remainingDiscount=$discount;
        foreach($discountWeights as $index=>$gross){$product=$discount*$gross;$allocated[$index]=$discountBase?intdiv($product,$discountBase):0;$remainders[$index]=$discountBase?$product%$discountBase:0;$remainingDiscount-=$allocated[$index];}
        arsort($remainders,SORT_NUMERIC);
        foreach($remainders as $index=>$_){if($remainingDiscount<=0)break;$allocated[$index]++;$remainingDiscount--;}
        foreach($lines as $index=>&$line){$line['gross_value']=shopNirScaledToDecimal($grossCents[$index],2);$line['discount_amount']=shopNirScaledToDecimal($allocated[$index],2);$line['value']=shopNirScaledToDecimal($grossCents[$index]-$allocated[$index],2);}unset($line);
        return $voucher+['lines'=>$lines,'discount_type'=>$type,'discount_value'=>shopNirScaledToDecimal(shopNirDecimalToScaled($input,$type==='fixed'?2:4),$type==='fixed'?2:4),'subtotal'=>shopNirScaledToDecimal($subtotal,2),'discount_amount'=>shopNirScaledToDecimal($discount,2),'total'=>shopNirScaledToDecimal($subtotal-$discount,2)];
    }

    public static function saveVoucher(PDO $db,?string $voucherId,array $body,array $user): array
    {
        self::begin($db);
        try{
            $voucher=self::prepareVoucher($db,$voucherId,$body,$user,true);
            $fields=['voucher_date','series','voucher_number','giver_id','giver_name','receiver_id','receiver_name','notes','work_reference','order_reference','discount_type','discount_value'];
            $values=array_map(fn($field)=>$voucher[$field],$fields);
            if($voucherId!==null){
                $db->prepare('UPDATE shop_consumption_vouchers SET '.implode(',',array_map(fn($field)=>$field.'=?',$fields)).',updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values,$voucherId]);
                $db->prepare('DELETE FROM shop_consumption_voucher_lines WHERE voucher_id=?')->execute([$voucherId]);
            }else{
                $voucherId=self::uuid();
                $db->prepare('INSERT INTO shop_consumption_vouchers (id,'.implode(',',$fields).',created_by) VALUES ('.implode(',',array_fill(0,count($fields)+2,'?')).')')->execute([$voucherId,...$values,$voucher['created_by']]);
            }
            $insert=$db->prepare('INSERT INTO shop_consumption_voucher_lines (id,voucher_id,consumable_id,line_number,quantity,unit_price,value,discount_amount,source_discount_amount) VALUES (?,?,?,?,?,?,?,?,?)');
            foreach($voucher['lines'] as $line)$insert->execute([self::uuid(),$voucherId,$line['consumable_id'],$line['line_number'],$line['quantity'],$line['unit_price'],$line['value'],$line['discount_amount'],$line['source_discount_amount']]);
            $db->commit();
        }catch(PDOException $error){if($db->inTransaction())$db->rollBack();if((string)$error->getCode()==='23000')throw new ShopNirHttpException('Există deja un bon de consum cu aceeași serie și același număr.',409);throw $error;}catch(Throwable $error){if($db->inTransaction())$db->rollBack();throw $error;}
        return self::getVoucher($db,(string)$voucherId);
    }

    public static function previewVoucher(PDO $db,array $body,array $user): array
    {
        $id=trim((string)($body['voucher_id']??''))?:null;
        return self::voucherFile($db,self::prepareVoucher($db,$id,$body,$user,false),'pdf');
    }

    public static function createVoucher(PDO $db,array $body,array $user): array{return self::saveVoucher($db,null,$body,$user);}
    public static function updateVoucher(PDO $db,string $id,array $body,array $user): array{return self::saveVoucher($db,$id,$body,$user);}

    public static function getVoucher(PDO $db,string $id): array
    {
        $s=$db->prepare('SELECT * FROM shop_consumption_vouchers WHERE id=? LIMIT 1');$s->execute([$id]);$voucher=$s->fetch(PDO::FETCH_ASSOC);if(!$voucher)throw new ShopNirHttpException('Bonul de consum nu există.',404);$l=$db->prepare('SELECT l.*,c.product_name,c.unit,c.quantity initial_quantity,c.document_id,d.series document_series,d.document_number,d.document_date,d.document_type FROM shop_consumption_voucher_lines l JOIN shop_consumables c ON c.id=l.consumable_id JOIN shop_consumable_documents d ON d.id=c.document_id WHERE l.voucher_id=? ORDER BY l.line_number');$l->execute([$id]);$voucher['lines']=$l->fetchAll(PDO::FETCH_ASSOC);
        $total=0;$discount=0;
        foreach($voucher['lines'] as &$line){$net=shopNirDecimalToScaled($line['value'],2);$reduction=shopNirDecimalToScaled($line['discount_amount']??0,2);$line['gross_value']=shopNirScaledToDecimal($net+$reduction,2);$total+=$net;$discount+=$reduction;}unset($line);
        $voucher['subtotal']=shopNirScaledToDecimal($total+$discount,2);$voucher['discount_amount']=shopNirScaledToDecimal($discount,2);$voucher['total']=shopNirScaledToDecimal($total,2);
        // Deleting a source position also removes its allocated reduction.
        if(($voucher['discount_type']??'fixed')==='fixed')$voucher['discount_value']=$voucher['discount_amount'];
        $voucher['revision']=self::revision($voucher);return $voucher;
    }

    public static function deleteVoucher(PDO $db,string $id,array $body): array
    {
        self::begin($db);try{$voucher=self::getVoucher($db,$id);self::checkRevision($voucher,$body);$db->prepare('DELETE FROM shop_consumption_voucher_lines WHERE voucher_id=?')->execute([$id]);$db->prepare('DELETE FROM shop_consumption_vouchers WHERE id=?')->execute([$id]);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}return ['success'=>true];
    }

    public static function exportVoucher(PDO $db,string $id,string $format): array
    {
        return self::voucherFile($db,self::getVoucher($db,$id),$format);
    }

    private static function voucherFile(PDO $db,array $voucher,string $format): array
    {
        if(!in_array($format,['pdf','xlsx'],true))throw new InvalidArgumentException('Alege PDF sau Excel pentru bonul de consum.');
        $company=[];
        try{$company=$db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC,id LIMIT 1')->fetch(PDO::FETCH_ASSOC)?:[];}catch(PDOException $ignored){}
        require_once __DIR__.'/consumables-export.php';
        $bytes=$format==='pdf'?GtrotsConsumablesExport::voucherPdf($voucher,$company):GtrotsConsumablesExport::voucherXlsx($voucher,$company);
        $safe=static fn($value)=>trim(mb_strcut(preg_replace('~[\x00-\x1F\x7F<>:"/|?*]+~u','-',str_replace(chr(92),'-',trim((string)$value)))??'',0,70,'UTF-8'),'. -');
        $number=implode('-',array_filter([$safe($voucher['series']),$safe($voucher['voucher_number'])],fn($v)=>$v!==''));
        $base='Bon-de-consum-'.$number;
        $sources=[];
        foreach($voucher['lines'] as $line){
            $identity=implode('_',array_filter([$safe($line['document_series']??''),$safe($line['document_number']??'')],fn($v)=>$v!==''));
            $date=trim((string)($line['document_date']??''));
            $source=($identity!==''?(['factura'=>'fact.','bon'=>'bon','pv'=>'PV'][$line['document_type']??'factura']??'doc.').' '.$identity:'');
            if($date!=='')$source.=($source!==''?' ':'').'din '.self::date($date,'Data documentului de intrare');
            $source=preg_replace('/din (\d{4})-(\d{2})-(\d{2})$/','din $3.$2.$1',$source);
            if($source!=='')$sources[$source]=true;
        }
        if($sources){$base.=' - '.array_key_first($sources);if(count($sources)>1)$base.=' + '.(count($sources)-1).' doc';}
        return ['file_name'=>$base.'.'.$format,'mime_type'=>$format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content_base64'=>base64_encode($bytes)];
    }

    private static function period(array $filters): array
    {
        $from=trim((string)($filters['from']??''));$to=trim((string)($filters['to']??''));if($from!=='')$from=self::date($from,'Data de început');if($to!=='')$to=self::date($to,'Data de sfârșit');if($from!==''&&$to!==''&&$from>$to)throw new InvalidArgumentException('Perioada exportului este invalidă.');return [$from,$to];
    }

    private static function exportData(PDO $db,array $filters): array
    {
        [$from,$to]=self::period($filters);$params=[];$activity=[];
        if($from!==''){$activity[]='(d.document_date>=? OR EXISTS(SELECT 1 FROM shop_consumption_voucher_lines xl JOIN shop_consumption_vouchers xv ON xv.id=xl.voucher_id WHERE xl.consumable_id=c.id AND xv.voucher_date>=?'.($to!==''?' AND xv.voucher_date<=?':'').'))';$params[]=$from;$params[]=$from;if($to!=='')$params[]=$to;}
        if($to!==''){$activity[]='d.document_date<=?';$params[]=$to;}
        $where=$activity?' WHERE '.implode(' AND ',$activity):'';
        $stock=$db->prepare('SELECT c.id,c.document_id,d.document_date,d.document_type,d.series,d.document_number,c.product_name,c.unit,c.quantity,c.unit_price,c.net_value,c.vat_rate,c.vat_value,c.total_value,c.purchase_discount_amount,c.stock_cost_value,c.stock_cost_unit,COALESCE((SELECT SUM(xl.value) FROM shop_consumption_voucher_lines xl JOIN shop_consumption_vouchers xv ON xv.id=xl.voucher_id WHERE xl.consumable_id=c.id'.($to!==''?' AND xv.voucher_date<=?':'').'),0) consumed_value,COALESCE((SELECT SUM(xl.quantity) FROM shop_consumption_voucher_lines xl JOIN shop_consumption_vouchers xv ON xv.id=xl.voucher_id WHERE xl.consumable_id=c.id'.($to!==''?' AND xv.voucher_date<=?':'').'),0) consumed_quantity FROM shop_consumables c JOIN shop_consumable_documents d ON d.id=c.document_id'.$where.' ORDER BY d.document_date,c.line_number');
        $stockParams=[];if($to!==''){$stockParams[]=$to;$stockParams[]=$to;}$stockParams=array_merge($stockParams,$params);$stock->execute($stockParams);$stockRows=$stock->fetchAll(PDO::FETCH_ASSOC);foreach($stockRows as &$row)$row['remaining_quantity']=round((float)$row['quantity']-(float)$row['consumed_quantity'],4);unset($row);
        $vParams=[];$vWhere=[];if($from!==''){$vWhere[]='v.voucher_date>=?';$vParams[]=$from;}if($to!==''){$vWhere[]='v.voucher_date<=?';$vParams[]=$to;}$vouchers=$db->prepare('SELECT v.id voucher_id,v.voucher_date,v.series,v.voucher_number,v.giver_name,v.receiver_name,v.notes,v.created_by,l.line_number,l.consumable_id,l.quantity,l.unit_price,l.value,l.discount_amount,l.source_discount_amount,c.product_name,c.unit,d.series document_series,d.document_number,d.document_date FROM shop_consumption_vouchers v JOIN shop_consumption_voucher_lines l ON l.voucher_id=v.id JOIN shop_consumables c ON c.id=l.consumable_id JOIN shop_consumable_documents d ON d.id=c.document_id'.($vWhere?' WHERE '.implode(' AND ',$vWhere):'').' ORDER BY v.voucher_date,v.created_at,v.id,l.line_number');$vouchers->execute($vParams);
        return ['stock'=>$stockRows,'vouchers'=>$vouchers->fetchAll(PDO::FETCH_ASSOC),'from'=>$from,'to'=>$to];
    }

    public static function export(PDO $db,array $filters,string $format): array
    {
        if(!in_array($format,['pdf','xlsx','zip'],true))throw new InvalidArgumentException('Formatul exportului trebuie să fie PDF, Excel sau ZIP.');$data=self::exportData($db,$filters);if(!$data['stock']&&!$data['vouchers'])throw new ShopNirHttpException('Nu există date în perioada aleasă.',404);$company=[];try{$company=$db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC,id LIMIT 1')->fetch(PDO::FETCH_ASSOC)?:[];}catch(PDOException $ignored){}
        require_once __DIR__.'/consumables-export.php';$label=$data['from']||$data['to']?trim(($data['from']?:'inceput').'-'.($data['to']?:'prezent')):'toata-perioada';$base='Gestiune-consumabile-'.$label;
        $pdf=fn()=>GtrotsConsumablesExport::pdf($data,$company);$xlsx=fn()=>GtrotsConsumablesExport::xlsx($data,$company);
        if($format==='pdf')return ['file_name'=>$base.'.pdf','mime_type'=>'application/pdf','content_base64'=>base64_encode($pdf())];if($format==='xlsx')return ['file_name'=>$base.'.xlsx','mime_type'=>'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content_base64'=>base64_encode($xlsx())];
        if(!class_exists('ZipArchive'))throw new RuntimeException('Arhivarea nu este disponibilă pe server.');$tmp=tempnam(sys_get_temp_dir(),'gt_cons_');$zip=new ZipArchive();try{if($zip->open($tmp,ZipArchive::CREATE|ZipArchive::OVERWRITE)!==true)throw new RuntimeException('Arhiva nu a putut fi creată.');$zip->addFromString($base.'.pdf',$pdf());$zip->addFromString($base.'.xlsx',$xlsx());$documents=[];foreach($data['stock'] as $row)$documents[$row['document_id']]=$row;foreach($documents as $id=>$row){$type=['factura'=>'Factura','bon'=>'Bon','pv'=>'PV'][$row['document_type']]??'Document';$folder=preg_replace('/[^\pL\pN._-]+/u','-',trim($type.'-'.$row['series'].'-'.$row['document_number']));$zip->addEmptyDir($folder);foreach(self::files($db,(string)$id) as $index=>$file){$name=preg_replace('/[^\pL\pN._-]+/u','-',(string)$file['original_name'])?:('fisier-'.($index+1));$zip->addFile(self::storedPath((string)$file['storage_name']),$folder.'/'.$name);}}$zip->close();$bytes=file_get_contents($tmp);if($bytes===false)throw new RuntimeException('Arhiva nu a putut fi citită.');return ['file_name'=>$base.'.zip','mime_type'=>'application/zip','content_base64'=>base64_encode($bytes)];}finally{if(is_file($tmp))@unlink($tmp);}
    }
}
