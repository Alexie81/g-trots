<?php
declare(strict_types=1);

require_once __DIR__ . '/invoice-ubl.php';

/**
 * Server-side RO e-Factura integration.
 *
 * OAuth credentials and tokens never leave the PHP server. Mobile and desktop
 * clients receive only connection metadata and short ANAF submission IDs.
 */
final class GtrotsSpvService
{
    private const ACCESS_REFRESH_BEFORE_SECONDS = 86400 * 3;
    private const OAUTH_STATE_TTL_SECONDS = 600;
    private const LEGAL_WORKING_DAYS = 5;
    private static array $schemaReady = [];
    /** @var null|callable Test-only transport, unavailable to HTTP requests. */
    private static $testHttpTransport = null;

    public static function setHttpTransportForTests(?callable $transport): void
    {
        if (PHP_SAPI !== 'cli') throw new LogicException('Transportul SPV poate fi înlocuit numai în testele CLI.');
        self::$testHttpTransport = $transport;
    }

    public static function ensureSchema(PDO $db): void
    {
        $schemaKey = spl_object_id($db);
        if (!empty(self::$schemaReady[$schemaKey])) return;
        if (self::isSqlite($db)) {
            $db->exec('CREATE TABLE IF NOT EXISTS shop_spv_outbox (
                id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL UNIQUE, document_kind TEXT NOT NULL DEFAULT "invoice",
                environment TEXT NOT NULL DEFAULT "test", mode_snapshot TEXT NOT NULL DEFAULT "manual",
                status TEXT NOT NULL DEFAULT "awaiting_configuration", attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT, queued_at TEXT DEFAULT CURRENT_TIMESTAMP, scheduled_at TEXT, next_attempt_at TEXT,
                upload_index TEXT, download_id TEXT, sent_at TEXT, accepted_at TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )');
            $db->exec('CREATE TABLE IF NOT EXISTS shop_spv_connections (
                id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT "disconnected", environment TEXT NOT NULL DEFAULT "test",
                access_token_cipher TEXT, refresh_token_cipher TEXT, access_expires_at TEXT, refresh_expires_at TEXT,
                certificate_serial TEXT, connected_at TEXT, last_refreshed_at TEXT, last_tested_at TEXT,
                last_error TEXT, disconnected_at TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )');
            $db->exec('CREATE TABLE IF NOT EXISTS shop_spv_settings (
                id INTEGER PRIMARY KEY, environment TEXT NOT NULL DEFAULT "test", invoice_mode TEXT NOT NULL DEFAULT "manual",
                invoice_delay_days INTEGER NOT NULL DEFAULT 1, return_mode TEXT NOT NULL DEFAULT "manual",
                return_delay_days INTEGER NOT NULL DEFAULT 1, reminders_enabled INTEGER NOT NULL DEFAULT 1,
                updated_by TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )');
            $db->exec('CREATE TABLE IF NOT EXISTS shop_spv_oauth_states (
                state_hash TEXT PRIMARY KEY, environment TEXT NOT NULL DEFAULT "test", requested_by TEXT,
                expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )');
            $db->exec('CREATE TABLE IF NOT EXISTS shop_notifications (
                id TEXT PRIMARY KEY, notification_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
                entity_type TEXT, entity_id TEXT, severity TEXT NOT NULL DEFAULT "info", dedupe_key TEXT NOT NULL UNIQUE,
                read_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )');
            $db->exec('CREATE TABLE IF NOT EXISTS shop_notification_dismissals (
                dedupe_key TEXT PRIMARY KEY, dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP
            )');
            self::$schemaReady[$schemaKey] = true;
            return;
        }

        $db->exec("CREATE TABLE IF NOT EXISTS shop_spv_connections (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            status VARCHAR(30) NOT NULL DEFAULT 'disconnected',
            environment VARCHAR(20) NOT NULL DEFAULT 'test',
            access_token_cipher LONGTEXT NULL,
            refresh_token_cipher LONGTEXT NULL,
            access_expires_at DATETIME NULL,
            refresh_expires_at DATETIME NULL,
            certificate_serial VARCHAR(255) NULL,
            connected_at DATETIME NULL,
            last_refreshed_at DATETIME NULL,
            last_tested_at DATETIME NULL,
            last_error VARCHAR(1000) NULL,
            disconnected_at DATETIME NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_spv_settings (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            environment VARCHAR(20) NOT NULL DEFAULT 'test',
            invoice_mode VARCHAR(20) NOT NULL DEFAULT 'manual',
            invoice_delay_days TINYINT UNSIGNED NOT NULL DEFAULT 1,
            return_mode VARCHAR(20) NOT NULL DEFAULT 'manual',
            return_delay_days TINYINT UNSIGNED NOT NULL DEFAULT 1,
            reminders_enabled TINYINT(1) NOT NULL DEFAULT 1,
            updated_by VARCHAR(180) NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_spv_oauth_states (
            state_hash CHAR(64) NOT NULL PRIMARY KEY,
            environment VARCHAR(20) NOT NULL DEFAULT 'test',
            requested_by VARCHAR(180) NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_spv_oauth_expiry (expires_at, used_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_notifications (
            id CHAR(36) NOT NULL PRIMARY KEY,
            notification_type VARCHAR(50) NOT NULL,
            title VARCHAR(180) NOT NULL,
            body VARCHAR(700) NOT NULL,
            entity_type VARCHAR(40) NULL,
            entity_id CHAR(36) NULL,
            severity VARCHAR(20) NOT NULL DEFAULT 'info',
            dedupe_key VARCHAR(220) NOT NULL,
            read_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_notification_dedupe (dedupe_key),
            INDEX idx_shop_notification_unread (read_at, created_at),
            INDEX idx_shop_notification_entity (entity_type, entity_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS shop_notification_dismissals (
            dedupe_key VARCHAR(220) PRIMARY KEY,
            dismissed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_shop_notification_dismissed_at (dismissed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        self::ensureMysqlColumn($db, 'shop_spv_outbox', 'scheduled_at', 'DATETIME NULL AFTER queued_at');
        self::ensureMysqlColumn($db, 'shop_spv_outbox', 'next_attempt_at', 'DATETIME NULL AFTER scheduled_at');
        self::ensureMysqlColumn($db, 'shop_spv_outbox', 'upload_index', 'VARCHAR(180) NULL AFTER next_attempt_at');
        self::ensureMysqlColumn($db, 'shop_spv_outbox', 'download_id', 'VARCHAR(180) NULL AFTER upload_index');
        self::ensureMysqlColumn($db, 'shop_spv_outbox', 'environment', "VARCHAR(20) NOT NULL DEFAULT 'test' AFTER document_kind");
        self::ensureMysqlColumn($db, 'shop_spv_outbox', 'mode_snapshot', "VARCHAR(20) NOT NULL DEFAULT 'manual' AFTER environment");
        self::ensureMysqlColumn($db, 'shop_spv_outbox', 'accepted_at', 'DATETIME NULL AFTER sent_at');
        self::$schemaReady[$schemaKey] = true;
    }

    public static function configReady(array $config): bool
    {
        return trim((string)($config['anaf_oauth_client_id'] ?? '')) !== ''
            && trim((string)($config['anaf_oauth_client_secret'] ?? '')) !== ''
            && trim((string)($config['spv_encryption_key'] ?? '')) !== '';
    }

    public static function status(PDO $db, array $config): array
    {
        self::ensureSchema($db);
        $row = self::connectionRow($db);
        $connected = self::configReady($config)
            && ($row['status'] ?? '') === 'connected'
            && trim((string)($row['refresh_token_cipher'] ?? '')) !== ''
            && (empty($row['refresh_expires_at']) || strtotime((string)$row['refresh_expires_at']) > time());
        $settings = self::settings($db);
        return [
            'configured' => self::configReady($config),
            'connected' => $connected,
            'status' => $connected ? 'connected' : (($row['status'] ?? '') === 'error' ? 'error' : 'disconnected'),
            'environment' => (string)($settings['environment'] ?? 'test'),
            'certificate_hint' => self::maskCertificate((string)($row['certificate_serial'] ?? '')),
            'connected_at' => $row['connected_at'] ?? null,
            'access_expires_at' => $connected ? ($row['access_expires_at'] ?? null) : null,
            'refresh_expires_at' => $connected ? ($row['refresh_expires_at'] ?? null) : null,
            'last_tested_at' => $row['last_tested_at'] ?? null,
            'last_error' => ($row['status'] ?? '') === 'error' ? (string)($row['last_error'] ?? '') : '',
            'settings' => $connected ? $settings : null,
            'legal_deadline_working_days' => self::LEGAL_WORKING_DAYS,
            'token_policy' => ['access_days' => 90, 'refresh_days' => 365, 'automatic_refresh' => true],
        ];
    }

    public static function settings(PDO $db): array
    {
        $row = $db->query('SELECT * FROM shop_spv_settings WHERE id = 1')->fetch() ?: [];
        return [
            'environment' => self::environment((string)($row['environment'] ?? 'test')),
            'invoice_mode' => self::mode((string)($row['invoice_mode'] ?? 'manual')),
            'invoice_delay_days' => self::delay($row['invoice_delay_days'] ?? 1),
            'return_mode' => self::mode((string)($row['return_mode'] ?? 'manual')),
            'return_delay_days' => self::delay($row['return_delay_days'] ?? 1),
            'reminders_enabled' => !array_key_exists('reminders_enabled', $row) || (bool)$row['reminders_enabled'],
            'updated_by' => (string)($row['updated_by'] ?? ''),
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }

    public static function updateSettings(PDO $db, array $input, string $actor, array $config): array
    {
        if (!self::status($db, $config)['connected']) {
            throw new RuntimeException('Conectează mai întâi firma la SPV pentru a configura automatizările.');
        }
        $environment = self::environment((string)($input['environment'] ?? 'test'));
        $invoiceMode = self::mode((string)($input['invoice_mode'] ?? 'manual'));
        $returnMode = self::mode((string)($input['return_mode'] ?? 'manual'));
        $invoiceDelay = self::delay($input['invoice_delay_days'] ?? 1);
        $returnDelay = self::delay($input['return_delay_days'] ?? 1);
        $reminders = self::boolValue($input['reminders_enabled'] ?? true);
        if (self::isSqlite($db)) {
            $stmt = $db->prepare('INSERT INTO shop_spv_settings (id, environment, invoice_mode, invoice_delay_days, return_mode, return_delay_days, reminders_enabled, updated_by, updated_at)
                VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET environment=excluded.environment, invoice_mode=excluded.invoice_mode,
                invoice_delay_days=excluded.invoice_delay_days, return_mode=excluded.return_mode,
                return_delay_days=excluded.return_delay_days, reminders_enabled=excluded.reminders_enabled,
                updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP');
        } else {
            $stmt = $db->prepare('INSERT INTO shop_spv_settings (id, environment, invoice_mode, invoice_delay_days, return_mode, return_delay_days, reminders_enabled, updated_by)
                VALUES (1, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE environment=VALUES(environment), invoice_mode=VALUES(invoice_mode),
                invoice_delay_days=VALUES(invoice_delay_days), return_mode=VALUES(return_mode),
                return_delay_days=VALUES(return_delay_days), reminders_enabled=VALUES(reminders_enabled), updated_by=VALUES(updated_by)');
        }
        $stmt->execute([$environment, $invoiceMode, $invoiceDelay, $returnMode, $returnDelay, $reminders ? 1 : 0, mb_substr(trim($actor), 0, 180)]);
        $db->prepare('UPDATE shop_spv_connections SET environment = ? WHERE id = 1')->execute([$environment]);
        self::reconcileOutbox($db);
        return self::status($db, $config);
    }

    public static function beginOAuth(PDO $db, array $config, string $actor): array
    {
        self::ensureSchema($db);
        if (!self::configReady($config)) throw new RuntimeException('Datele OAuth ANAF nu sunt configurate pe server.');
        $settings = self::settings($db);
        $state = self::base64UrlEncode(random_bytes(32));
        $stateHash = hash('sha256', $state);
        $expires = date('Y-m-d H:i:s', time() + self::OAUTH_STATE_TTL_SECONDS);
        $db->prepare('DELETE FROM shop_spv_oauth_states WHERE used_at IS NOT NULL OR expires_at < ?')->execute([date('Y-m-d H:i:s')]);
        $stmt = $db->prepare('INSERT INTO shop_spv_oauth_states (state_hash, environment, requested_by, expires_at) VALUES (?, ?, ?, ?)');
        $stmt->execute([$stateHash, (string)$settings['environment'], mb_substr(trim($actor), 0, 180), $expires]);
        $params = http_build_query([
            'response_type' => 'code',
            'client_id' => (string)$config['anaf_oauth_client_id'],
            'redirect_uri' => self::callbackUrl($config),
            'token_content_type' => 'jwt',
            'state' => $state,
        ], '', '&', PHP_QUERY_RFC3986);
        return [
            'authorization_url' => rtrim((string)($config['anaf_oauth_authorize_url'] ?? 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize'), '?') . '?' . $params,
            'expires_at' => $expires,
            'environment' => (string)$settings['environment'],
        ];
    }

    public static function completeOAuth(PDO $db, array $config, string $code, string $state): array
    {
        self::ensureSchema($db);
        if (!self::configReady($config)) throw new RuntimeException('Configurația OAuth ANAF lipsește de pe server.');
        $code = trim($code);
        $state = trim($state);
        if ($code === '' || $state === '') throw new InvalidArgumentException('ANAF nu a returnat codul și starea OAuth complete.');
        $stmt = $db->prepare('SELECT * FROM shop_spv_oauth_states WHERE state_hash = ? AND used_at IS NULL AND expires_at >= ? LIMIT 1');
        $stmt->execute([hash('sha256', $state), date('Y-m-d H:i:s')]);
        $stateRow = $stmt->fetch();
        if (!$stateRow) throw new RuntimeException('Cererea de conectare a expirat sau a fost deja folosită. Reia conectarea din aplicație.');
        $token = self::tokenRequest($config, [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => self::callbackUrl($config),
            'token_content_type' => 'jwt',
        ]);
        self::saveTokens($db, $config, $token, (string)($stateRow['environment'] ?? 'test'), true);
        $db->prepare('UPDATE shop_spv_oauth_states SET used_at = CURRENT_TIMESTAMP WHERE state_hash = ?')->execute([hash('sha256', $state)]);
        self::testConnection($db, $config);
        self::reconcileOutbox($db);
        return self::status($db, $config);
    }

    public static function testConnection(PDO $db, array $config): array
    {
        $token = self::accessToken($db, $config);
        $response = self::http('GET', (string)($config['anaf_oauth_test_url'] ?? 'https://api.anaf.ro/TestOauth/jaxrs/hello?name=G-Trots'), [
            'Authorization: Bearer ' . $token,
            'Accept: text/plain, application/json',
        ], null, 25);
        if ($response['status'] < 200 || $response['status'] >= 300) {
            self::connectionError($db, 'ANAF a respins verificarea OAuth (HTTP ' . $response['status'] . ').');
            throw new RuntimeException('Conexiunea OAuth există, dar ANAF a respins verificarea de acces.');
        }
        $db->prepare("UPDATE shop_spv_connections SET status = 'connected', last_tested_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = 1")->execute();
        return self::status($db, $config);
    }

    /**
     * Runs a real, isolated round-trip against ANAF Test without touching a
     * fiscal invoice, its number, stock, payment state or the production
     * outbox. The generated TEST documents exist only in ANAF's sandbox.
     */
    public static function runTestDiagnostics(PDO $db, array $config): array
    {
        self::assertTestEnvironment($db, $config);
        $connection = self::testConnection($db, $config);
        $company = $db->query('SELECT * FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch() ?: [];
        $seller = self::diagnosticParty($company);
        $cif = preg_replace('/\D+/', '', (string)($seller['cui'] ?? '')) ?: '';
        if ($cif === '') throw new RuntimeException('Completează CUI-ul firmei înainte de testarea SPV.');

        $stamp = date('YmdHis');
        $vatRate = round(max(0.0, min(100.0, (float)($company['vat_rate'] ?? 19))), 2);
        $gross = round(1 + $vatRate / 100, 2);
        $base = [
            'series' => 'TESTGT',
            'issue_date' => date('Y-m-d'),
            'due_date' => date('Y-m-d'),
            'currency' => 'RON',
            'total' => $gross,
            'seller' => $seller,
            'buyer' => $seller,
            'payment' => ['method' => 'Transfer bancar', 'iban' => (string)($seller['iban'] ?? ''), 'bank_name' => (string)($seller['bank_name'] ?? '')],
            'items' => [[
                'name' => 'Document sintetic pentru testarea tehnică RO e-Factura',
                'description' => 'Nu reprezintă o tranzacție fiscală reală. Generat exclusiv pentru mediul ANAF Test.',
                'quantity' => 1,
                'unit_price' => 1,
                'discount_percent' => 0,
                'vat_rate' => $vatRate,
                'sku' => 'SPV-TEST',
            ]],
            'notes' => 'DOCUMENT SINTETIC — MEDIU ANAF TEST — FĂRĂ EFECT FISCAL',
        ];
        $invoice = $base + [
            'number' => $stamp . '1',
            'status' => 'unpaid',
            'order_reference' => 'TEST-' . $stamp,
        ];
        $creditNote = $base + [
            'number' => $stamp . '2',
            'status' => 'return',
            'order_reference' => 'TEST-RET-' . $stamp,
            'related_invoice' => ['series' => $invoice['series'], 'number' => $invoice['number'], 'date' => $invoice['issue_date']],
        ];

        $documents = [];
        foreach ([['invoice_380', $invoice], ['credit_note_381', $creditNote]] as [$kind, $payload]) {
            $xml = GtrotsInvoiceUbl::render($payload);
            try {
                $validation = GtrotsInvoiceUbl::validateWithAnaf($xml, $config);
            } catch (InvalidArgumentException $rejected) {
                // A semantic rejection is authoritative and must stop upload.
                throw $rejected;
            } catch (RuntimeException $unavailable) {
                // The public validator and the authenticated Test upload are
                // separate ANAF services. A hosting TLS/network limitation on
                // the former is reported, while the sandbox upload remains the
                // definitive end-to-end test.
                $validation = ['stare' => 'unavailable', 'messages' => [$unavailable->getMessage()]];
            }
            $documents[] = self::uploadDiagnosticXml($db, $config, $xml, $cif, (string)$kind, (string)$payload['series'] . ' ' . (string)$payload['number'], $validation);
        }
        return [
            'environment' => 'test',
            'isolated' => true,
            'fiscal_effect' => false,
            'connection' => [
                'connected' => (bool)($connection['connected'] ?? false),
                'certificate_hint' => (string)($connection['certificate_hint'] ?? ''),
                'last_tested_at' => $connection['last_tested_at'] ?? null,
            ],
            'documents' => $documents,
        ];
    }

    public static function pollTestDiagnostics(PDO $db, array $config, array $indexes): array
    {
        self::assertTestEnvironment($db, $config);
        $unique = array_slice(array_values(array_unique(array_filter(array_map(static fn($value): string => trim((string)$value), $indexes)))), 0, 4);
        if (!$unique) throw new InvalidArgumentException('Nu există indici de diagnostic pentru verificare.');
        return [
            'environment' => 'test',
            'isolated' => true,
            'documents' => array_map(static fn(string $index): array => self::diagnosticStatus($db, $config, $index), $unique),
        ];
    }

    public static function disconnect(PDO $db, array $config): array
    {
        $row = self::connectionRow($db);
        foreach (['access_token_cipher', 'refresh_token_cipher'] as $column) {
            $cipher = trim((string)($row[$column] ?? ''));
            if ($cipher === '') continue;
            try {
                $token = self::decrypt($cipher, $config);
                self::http('POST', (string)($config['anaf_oauth_revoke_url'] ?? 'https://logincert.anaf.ro/anaf-oauth2/v1/revoke'), self::basicHeaders($config), http_build_query(['token' => $token], '', '&', PHP_QUERY_RFC3986), 20);
            } catch (Throwable $error) {
                error_log('[G-Trots SPV revoke] ' . $error->getMessage());
            }
        }
        $db->prepare("INSERT INTO shop_spv_connections (id, status, environment, disconnected_at) VALUES (1, 'disconnected', ?, CURRENT_TIMESTAMP)
            " . (self::isSqlite($db)
                ? "ON CONFLICT(id) DO UPDATE SET status='disconnected', access_token_cipher=NULL, refresh_token_cipher=NULL, access_expires_at=NULL, refresh_expires_at=NULL, certificate_serial=NULL, disconnected_at=CURRENT_TIMESTAMP, last_error=NULL"
                : "ON DUPLICATE KEY UPDATE status='disconnected', access_token_cipher=NULL, refresh_token_cipher=NULL, access_expires_at=NULL, refresh_expires_at=NULL, certificate_serial=NULL, disconnected_at=CURRENT_TIMESTAMP, last_error=NULL"))
            ->execute([(string)self::settings($db)['environment']]);
        $db->exec("UPDATE shop_spv_outbox SET status = 'awaiting_connection' WHERE status IN ('scheduled','queued','retry')");
        return self::status($db, $config);
    }

    public static function enqueue(PDO $db, string $invoiceId, string $kind = 'invoice'): void
    {
        $invoiceId = trim($invoiceId);
        if ($invoiceId === '') return;
        $kind = $kind === 'credit_note' ? 'credit_note' : 'invoice';
        $settings = self::settings($db);
        $mode = $kind === 'credit_note' ? (string)$settings['return_mode'] : (string)$settings['invoice_mode'];
        $delay = $kind === 'credit_note' ? (int)$settings['return_delay_days'] : (int)$settings['invoice_delay_days'];
        $issue = $db->prepare('SELECT issue_date, issued_at, spv_status FROM shop_invoices WHERE id = ? LIMIT 1');
        $issue->execute([$invoiceId]);
        $invoice = $issue->fetch();
        if (!$invoice || (string)($invoice['spv_status'] ?? '') === 'sent') return;
        $scheduled = self::scheduledAt((string)($invoice['issue_date'] ?? $invoice['issued_at'] ?? date('Y-m-d')), $mode, $delay);
        $status = $mode === 'manual' ? 'manual' : 'scheduled';
        $id = self::uuid();
        if (self::isSqlite($db)) {
            $stmt = $db->prepare('INSERT INTO shop_spv_outbox (id, invoice_id, document_kind, environment, mode_snapshot, status, scheduled_at, next_attempt_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(invoice_id) DO UPDATE SET document_kind=excluded.document_kind, environment=excluded.environment,
                mode_snapshot=excluded.mode_snapshot, status=CASE WHEN shop_spv_outbox.status IN ("processing","accepted") THEN shop_spv_outbox.status ELSE excluded.status END,
                scheduled_at=excluded.scheduled_at, next_attempt_at=excluded.next_attempt_at, last_error=NULL');
            $stmt->execute([$id, $invoiceId, $kind, (string)$settings['environment'], $mode, $status, $scheduled, $scheduled]);
            return;
        }
        $stmt = $db->prepare('INSERT INTO shop_spv_outbox (id, invoice_id, document_kind, environment, mode_snapshot, status, scheduled_at, next_attempt_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE document_kind=VALUES(document_kind), environment=VALUES(environment), mode_snapshot=VALUES(mode_snapshot),
            status=IF(status IN ("processing","accepted"), status, VALUES(status)), scheduled_at=VALUES(scheduled_at), next_attempt_at=VALUES(next_attempt_at), last_error=NULL');
        $stmt->execute([$id, $invoiceId, $kind, (string)$settings['environment'], $mode, $status, $scheduled, $scheduled]);
    }

    /** Rebuilds every unsent job from the current settings, including legacy return rows. */
    public static function reconcileOutbox(PDO $db): array
    {
        self::ensureSchema($db);
        $settings = self::settings($db);
        $rows = $db->query("SELECT id, invoice_type, issue_date, issued_at FROM shop_invoices WHERE spv_status <> 'sent' ORDER BY issued_at ASC")->fetchAll();
        foreach ($rows as $invoice) {
            self::enqueue($db, (string)$invoice['id'], (string)($invoice['invoice_type'] ?? 'invoice') === 'return' ? 'credit_note' : 'invoice');
        }
        if (!self::isSqlite($db)) {
            $db->exec("UPDATE shop_spv_outbox o INNER JOIN shop_invoices i ON i.id=o.invoice_id SET o.status='accepted', o.accepted_at=COALESCE(o.accepted_at,i.spv_sent_at), o.sent_at=COALESCE(o.sent_at,i.spv_sent_at) WHERE i.spv_status='sent'");
        }
        return ['reconciled' => count($rows), 'settings' => $settings];
    }

    public static function sendManual(PDO $db, array $config, string $invoiceId): array
    {
        // Lipsa conexiunii este o condiție de utilizare, nu o defecțiune internă.
        // InvalidArgumentException este transformată de API într-un răspuns 422
        // cu mesajul explicit, pe care îl afișează atât telefonul, cât și desktopul.
        if (!self::status($db, $config)['connected']) throw new InvalidArgumentException('Conectează firma la SPV înainte de transmitere.');
        if (self::settings($db)['environment'] === 'test') {
            throw new InvalidArgumentException('Mediul ANAF Test este activ. Rulează testul complet SPV; facturile fiscale reale sunt protejate și nu se încarcă în sandbox.');
        }
        $invoiceId = trim($invoiceId);
        if ($invoiceId === '') throw new InvalidArgumentException('Factura nu a fost selectată.');
        $invoice = self::invoice($db, $invoiceId);
        if ((string)$invoice['spv_status'] === 'sent') return ['invoice' => GtrotsInvoiceService::get($db, $invoiceId, $config), 'job' => self::invoiceState($db, $invoiceId), 'already_sent' => true];
        self::enqueue($db, $invoiceId, (string)$invoice['invoice_type'] === 'return' ? 'credit_note' : 'invoice');
        if (!self::isSqlite($db)) {
            $db->prepare("UPDATE shop_spv_outbox SET status='queued', scheduled_at=CURRENT_TIMESTAMP, next_attempt_at=CURRENT_TIMESTAMP, last_error=NULL WHERE invoice_id=? AND status <> 'processing'")->execute([$invoiceId]);
        }
        self::processInvoice($db, $config, $invoiceId);
        return ['invoice' => GtrotsInvoiceService::get($db, $invoiceId, $config), 'job' => self::invoiceState($db, $invoiceId)];
    }

    /**
     * Returnează numai starea operațională care poate fi afișată în aplicații.
     * Tokenurile și configurația OAuth rămân exclusiv pe server.
     */
    public static function invoiceState(PDO $db, string $invoiceId): ?array
    {
        self::ensureSchema($db);
        $invoiceId = trim($invoiceId);
        if ($invoiceId === '') return null;
        $job = self::job($db, $invoiceId);
        if (!$job) return null;
        $value = static fn(string $key): ?string => trim((string)($job[$key] ?? '')) !== '' ? (string)$job[$key] : null;
        return [
            'status' => (string)($job['status'] ?? ''),
            'environment' => (string)($job['environment'] ?? 'test'),
            'mode' => (string)($job['mode_snapshot'] ?? 'manual'),
            'attempts' => (int)($job['attempts'] ?? 0),
            'scheduled_at' => $value('scheduled_at'),
            'next_attempt_at' => $value('next_attempt_at'),
            'upload_index' => $value('upload_index'),
            'download_id' => $value('download_id'),
            'last_error' => $value('last_error'),
            'sent_at' => $value('sent_at'),
            'accepted_at' => $value('accepted_at'),
            'updated_at' => $value('updated_at'),
        ];
    }

    public static function runWorker(PDO $db, array $config, int $limit = 5): array
    {
        self::ensureSchema($db);
        if (!self::configReady($config)) return ['processed' => 0, 'connected' => false];
        $lockName = 'g-trots-spv-worker';
        $locked = true;
        if (!self::isSqlite($db)) {
            $lock = $db->prepare('SELECT GET_LOCK(?, 0)');
            $lock->execute([$lockName]);
            $locked = (int)$lock->fetchColumn() === 1;
        }
        if (!$locked) return ['processed' => 0, 'locked' => true];
        $processed = 0;
        $errors = [];
        try {
            if (!self::status($db, $config)['connected']) return ['processed' => 0, 'connected' => false];
            if (self::settings($db)['environment'] === 'test') {
                self::syncNotifications($db);
                return ['processed' => 0, 'connected' => true, 'environment' => 'test', 'test_mode' => true];
            }
            self::reconcileOutbox($db);
            $now = date('Y-m-d H:i:s');
            $today = date('Y-m-d');
            $stmt = $db->prepare("SELECT o.invoice_id
                FROM shop_spv_outbox o
                INNER JOIN shop_invoices i ON i.id = o.invoice_id
                WHERE (o.status='processing' AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?))
                   OR (o.status='scheduled' AND DATE(COALESCE(o.scheduled_at,o.next_attempt_at,o.queued_at)) <= ?)
                   OR (o.status IN ('queued','retry') AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?))
                ORDER BY CASE WHEN o.status='processing' THEN 0 ELSE 1 END,
                         i.issue_date ASC, i.issued_at ASC, i.id ASC
                LIMIT " . max(1, min(20, $limit)));
            $stmt->execute([$now, $today, $now]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $invoiceId) {
                try { self::processInvoice($db, $config, (string)$invoiceId); $processed++; }
                catch (Throwable $error) { $errors[] = mb_substr($error->getMessage(), 0, 300); }
            }
            self::syncNotifications($db);
            return ['processed' => $processed, 'errors' => $errors, 'connected' => true];
        } finally {
            if (!self::isSqlite($db)) {
                try { $release = $db->prepare('SELECT RELEASE_LOCK(?)'); $release->execute([$lockName]); } catch (Throwable $ignored) { }
            }
        }
    }

    public static function scheduleWorkerAfterResponse(PDO $db, array $config): void
    {
        if (!function_exists('fastcgi_finish_request') || !self::configReady($config) || !empty($GLOBALS['gtrotsSpvWorkerScheduled'])) return;
        $GLOBALS['gtrotsSpvWorkerScheduled'] = true;
        register_shutdown_function(static function () use ($db, $config): void {
            @fastcgi_finish_request();
            ignore_user_abort(true);
            @set_time_limit(90);
            try { self::runWorker($db, $config, 3); }
            catch (Throwable $error) { error_log('[G-Trots SPV worker] ' . $error->getMessage()); }
        });
    }

    public static function notifications(PDO $db, int $limit = 50, bool $unreadOnly = false): array
    {
        self::syncNotifications($db);
        // Notificările sunt alerte operaționale, nu registru fiscal. Versiunile
        // mai vechi le marcau drept citite; păstrăm doar cheia lor minimală ca
        // sincronizarea să nu le recreeze, apoi ștergem conținutul complet.
        self::rememberNotificationDismissals($db, null, true);
        $db->exec('DELETE FROM shop_notifications WHERE read_at IS NOT NULL');
        $cutoff = date('Y-m-d H:i:s', strtotime('-120 days'));
        $db->prepare('DELETE FROM shop_notification_dismissals WHERE dismissed_at < ?')->execute([$cutoff]);
        $limit = max(1, min(100, $limit));
        $where = $unreadOnly ? 'WHERE read_at IS NULL ' : '';
        $rows = $db->query("SELECT * FROM shop_notifications {$where}ORDER BY (read_at IS NULL) DESC, created_at DESC LIMIT {$limit}")->fetchAll();
        return [
            'unread_count' => (int)$db->query('SELECT COUNT(*) FROM shop_notifications WHERE read_at IS NULL')->fetchColumn(),
            'items' => array_map(static function (array $row): array {
                $row['read'] = !empty($row['read_at']);
                return $row;
            }, $rows),
        ];
    }

    public static function notificationSummary(PDO $db): array
    {
        self::syncNotifications($db);
        return ['unread_count' => (int)$db->query('SELECT COUNT(*) FROM shop_notifications WHERE read_at IS NULL')->fetchColumn()];
    }

    public static function createTestNotification(PDO $db, string $kind = 'test'): array
    {
        self::ensureSchema($db);
        $templates = [
            'test' => ['Notificare SHOP de test', 'Notificările funcționează corect pe telefon și desktop.', 'info'],
            'new_order' => ['Comandă nouă · GT-TEST', 'Client test · 499,90 RON', 'success'],
            'order_cancelled' => ['Comandă anulată · GT-TEST', 'Comanda a fost anulată și regulile fiscale au fost aplicate.', 'error'],
            'spv_deadline' => ['SPV · factura GT TEST', 'Mai sunt 2 zile lucrătoare până la termenul legal.', 'warning'],
        ];
        $kind = trim($kind);
        if (!isset($templates[$kind])) throw new InvalidArgumentException('Tipul notificării de test nu este permis.');
        [$title, $body, $severity] = $templates[$kind];
        $dedupe = 'manual-test:' . bin2hex(random_bytes(12));
        self::notify(
            $db,
            $kind,
            $title,
            $body,
            'system',
            '',
            $severity,
            $dedupe
        );
        $stmt = $db->prepare('SELECT * FROM shop_notifications WHERE dedupe_key = ? LIMIT 1');
        $stmt->execute([$dedupe]);
        $notification = $stmt->fetch();
        if (!$notification) throw new RuntimeException('Notificarea de test nu a putut fi creată.');
        $notification['read'] = false;
        return [
            'unread_count' => (int)$db->query('SELECT COUNT(*) FROM shop_notifications WHERE read_at IS NULL')->fetchColumn(),
            'notification' => $notification,
        ];
    }

    public static function markNotification(PDO $db, string $id = '', bool $all = false): array
    {
        if ($all) {
            self::rememberNotificationDismissals($db, null, false);
            $db->exec('DELETE FROM shop_notifications');
        }
        else {
            if (trim($id) === '') throw new InvalidArgumentException('Notificarea nu a fost selectată.');
            self::rememberNotificationDismissals($db, trim($id), false);
            $db->prepare('DELETE FROM shop_notifications WHERE id=?')->execute([trim($id)]);
        }
        return self::notifications($db, 50, true);
    }

    public static function addWorkingDays(string $date, int $days): string
    {
        $cursor = new DateTimeImmutable(substr($date, 0, 10) ?: 'today', new DateTimeZone('Europe/Bucharest'));
        $remaining = max(0, $days);
        while ($remaining > 0) {
            $cursor = $cursor->modify('+1 day');
            if (self::isRomanianWorkingDay($cursor)) $remaining--;
        }
        return $cursor->format('Y-m-d');
    }

    /**
     * Builds the current operational reminder for one unsent invoice.
     *
     * Before the legal due date we only warn for invoices which do not have a
     * usable automatic submission scheduled. On the due date (and afterwards)
     * every still-unsent invoice is surfaced, even if an automation exists.
     */
    public static function deadlineNotification(array $invoice, ?string $today = null): ?array
    {
        $invoiceId = trim((string)($invoice['id'] ?? ''));
        $issueDate = trim((string)($invoice['issue_date'] ?? ''));
        if ($invoiceId === '' || $issueDate === '') return null;

        $today = substr(trim((string)($today ?: date('Y-m-d'))), 0, 10);
        $deadline = self::addWorkingDays($issueDate, self::LEGAL_WORKING_DAYS);
        $remaining = self::workingDaysBetween($today, $deadline);
        // A due date that ended on Friday is already overdue during the
        // weekend, even though no additional working day has elapsed yet.
        if ($today > $deadline && $remaining === 0) $remaining = -1;
        if ($remaining > 2) return null;

        $jobStatus = strtolower(trim((string)($invoice['outbox_status'] ?? '')));
        $mode = strtolower(trim((string)($invoice['mode_snapshot'] ?? 'manual')));
        $scheduledAt = trim((string)($invoice['scheduled_at'] ?? ''));
        $nextAttemptAt = trim((string)($invoice['next_attempt_at'] ?? ''));
        $effectiveAt = $nextAttemptAt !== '' ? $nextAttemptAt : $scheduledAt;
        $hasAutomaticSchedule = $mode !== 'manual' && (
            in_array($jobStatus, ['processing', 'uploading'], true)
            || (in_array($jobStatus, ['scheduled', 'queued', 'retry'], true)
                && $effectiveAt !== ''
                && substr($effectiveAt, 0, 10) >= $today)
        );

        if ($remaining > 0 && $hasAutomaticSchedule) return null;

        $label = self::invoiceLabel($invoice);
        if ($remaining < 0) {
            $body = 'Termenul de încărcare în SPV pentru factura ' . $label . ' a fost depășit.';
            $severity = 'error';
            $bucket = 'overdue';
        } elseif ($remaining === 0) {
            $body = 'Astăzi este ultima zi pentru încărcarea facturii ' . $label . ' în SPV.';
            $severity = 'warning';
            $bucket = '0';
        } elseif ($remaining === 1) {
            $body = 'Factura ' . $label . ' nu are trimiterea programată. Mai ai o zi lucrătoare să o încarci în SPV.';
            $severity = 'warning';
            $bucket = '1';
        } else {
            $body = 'Factura ' . $label . ' nu are trimiterea programată. Mai ai 2 zile lucrătoare să o încarci în SPV.';
            $severity = 'warning';
            $bucket = '2';
        }

        return [
            'title' => 'Termen SPV · ' . $label,
            'body' => $body,
            'severity' => $severity,
            'bucket' => $bucket,
            'deadline' => $deadline,
            'remaining_working_days' => $remaining,
        ];
    }

    private static function assertTestEnvironment(PDO $db, array $config): void
    {
        $status = self::status($db, $config);
        $connection = self::connectionRow($db);
        if (empty($status['connected'])) throw new InvalidArgumentException('Conectează firma la SPV înainte de testare.');
        if (self::environment((string)($status['environment'] ?? '')) !== 'test'
            || self::environment((string)($connection['environment'] ?? '')) !== 'test') {
            throw new InvalidArgumentException('Testul complet poate rula numai în mediul ANAF Test. Producția nu a fost accesată.');
        }
    }

    private static function diagnosticParty(array $company): array
    {
        return [
            'name' => trim((string)($company['legal_name'] ?? '')),
            'trade_name' => trim((string)($company['trade_name'] ?? '')),
            'cui' => trim((string)($company['cui'] ?? '')),
            'registration_number' => trim((string)($company['registration_number'] ?? '')),
            'address' => trim((string)($company['address'] ?? '')),
            'city' => trim((string)($company['city'] ?? '')),
            'county' => trim((string)($company['county'] ?? '')),
            'postal_code' => trim((string)($company['postal_code'] ?? '')),
            'email' => trim((string)($company['email'] ?? '')),
            'phone' => trim((string)($company['phone'] ?? '')),
            'bank_name' => trim((string)($company['bank_name'] ?? '')),
            'iban' => trim((string)($company['iban'] ?? '')),
            'share_capital' => trim((string)($company['share_capital'] ?? '')),
            'vat_payer' => !empty($company['vat_payer']),
        ];
    }

    private static function uploadDiagnosticXml(PDO $db, array $config, string $xml, string $cif, string $kind, string $documentId, array $validation): array
    {
        $standard = $kind === 'credit_note_381' ? 'CN' : 'UBL';
        $url = self::apiBase($config, 'test') . '/upload?standard=' . $standard . '&cif=' . rawurlencode($cif);
        $token = self::accessToken($db, $config);
        $response = self::http('POST', $url, [
            'Authorization: Bearer ' . $token,
            'Content-Type: text/plain; charset=UTF-8',
            'Accept: application/xml, application/json',
        ], $xml, 55);
        if ($response['status'] === 401 || $response['status'] === 403) {
            $token = self::accessToken($db, $config, true);
            $response = self::http('POST', $url, [
                'Authorization: Bearer ' . $token,
                'Content-Type: text/plain; charset=UTF-8',
                'Accept: application/xml, application/json',
            ], $xml, 55);
        }
        if ($response['status'] < 200 || $response['status'] >= 300) {
            throw new RuntimeException('ANAF Test a refuzat documentul ' . $documentId . ' (HTTP ' . $response['status'] . '): ' . self::responseMessage($response['body']));
        }
        $index = self::responseValue($response['body'], ['index_incarcare', 'uploadindex', 'id_incarcare']);
        if ($index === '') throw new RuntimeException('ANAF Test nu a returnat indexul pentru ' . $documentId . ': ' . self::responseMessage($response['body']));
        $status = self::diagnosticStatus($db, $config, $index);
        return [
            'kind' => $kind,
            'document_id' => $documentId,
            'ubl_valid' => (string)($validation['stare'] ?? '') !== 'rejected',
            'validator_state' => (string)($validation['stare'] ?? ''),
            'validator_message' => trim(implode(' | ', array_slice((array)($validation['messages'] ?? []), 0, 3))) ?: null,
            'upload_index' => $index,
        ] + $status;
    }

    private static function diagnosticStatus(PDO $db, array $config, string $index): array
    {
        if (!preg_match('/^[A-Za-z0-9._:-]{1,180}$/', $index)) throw new InvalidArgumentException('Indexul ANAF de diagnostic este invalid.');
        $url = self::apiBase($config, 'test') . '/stareMesaj?id_incarcare=' . rawurlencode($index);
        $response = self::http('GET', $url, [
            'Authorization: Bearer ' . self::accessToken($db, $config),
            'Accept: application/xml, application/json',
        ], null, 30);
        if ($response['status'] < 200 || $response['status'] >= 300) {
            return ['upload_index' => $index, 'state' => 'processing', 'terminal' => false, 'message' => 'Statusul va fi reverificat (HTTP ' . $response['status'] . ').'];
        }
        $state = mb_strtolower(self::responseValue($response['body'], ['stare', 'status']), 'UTF-8');
        $accepted = in_array($state, ['ok', 'accepted', 'valid'], true);
        $rejected = in_array($state, ['nok', 'error', 'rejected', 'invalid'], true);
        return [
            'upload_index' => $index,
            'state' => $accepted ? 'accepted' : ($rejected ? 'rejected' : 'processing'),
            'terminal' => $accepted || $rejected,
            'download_id' => self::responseValue($response['body'], ['id_descarcare', 'downloadid', 'id']) ?: null,
            'message' => $rejected ? self::responseMessage($response['body']) : ($accepted ? 'Document acceptat de ANAF Test.' : 'Documentul este încă procesat de ANAF Test.'),
        ];
    }

    private static function processInvoice(PDO $db, array $config, string $invoiceId): void
    {
        $job = self::job($db, $invoiceId);
        if (!$job) throw new RuntimeException('Factura nu are o sarcină SPV.');
        if ((string)$job['status'] === 'accepted') return;
        if ((string)$job['status'] === 'processing' && trim((string)($job['upload_index'] ?? '')) !== '') {
            self::pollUpload($db, $config, $invoiceId, (string)$job['upload_index']);
            return;
        }
        $invoice = self::invoice($db, $invoiceId);
        $company = $db->query('SELECT cui FROM shop_company_settings ORDER BY is_default DESC, id ASC LIMIT 1')->fetch() ?: [];
        $cif = preg_replace('/\D+/', '', (string)($company['cui'] ?? '')) ?: '';
        if ($cif === '') throw new RuntimeException('Completează CUI-ul firmei înainte de transmiterea în SPV.');
        $document = GtrotsInvoiceService::download($db, $invoiceId, 'xml', $config);
        $xml = base64_decode((string)($document['content_base64'] ?? ''), true);
        if (!is_string($xml) || trim($xml) === '') throw new RuntimeException('XML-ul e-Factura nu a putut fi generat.');
        $token = self::accessToken($db, $config);
        $environment = self::environment((string)($job['environment'] ?? self::settings($db)['environment']));
        $base = self::apiBase($config, $environment);
        $standard = (string)($job['document_kind'] ?? '') === 'credit_note' || (string)($invoice['invoice_type'] ?? '') === 'return' ? 'CN' : 'UBL';
        $url = $base . '/upload?standard=' . $standard . '&cif=' . rawurlencode($cif);
        $db->prepare("UPDATE shop_spv_outbox SET status='uploading', attempts=attempts+1, last_error=NULL WHERE invoice_id=?")->execute([$invoiceId]);
        try {
            $response = self::http('POST', $url, ['Authorization: Bearer ' . $token, 'Content-Type: text/plain; charset=UTF-8', 'Accept: application/xml, application/json'], $xml, 55);
            if ($response['status'] === 401 || $response['status'] === 403) {
                $token = self::accessToken($db, $config, true);
                $response = self::http('POST', $url, ['Authorization: Bearer ' . $token, 'Content-Type: text/plain; charset=UTF-8', 'Accept: application/xml, application/json'], $xml, 55);
            }
            if ($response['status'] < 200 || $response['status'] >= 300) throw new RuntimeException('ANAF a refuzat încărcarea (HTTP ' . $response['status'] . '): ' . self::responseMessage($response['body']));
            $uploadIndex = self::responseValue($response['body'], ['index_incarcare', 'uploadindex', 'id_incarcare']);
            if ($uploadIndex === '') throw new RuntimeException('ANAF nu a returnat indexul de încărcare: ' . self::responseMessage($response['body']));
            $db->prepare("UPDATE shop_spv_outbox SET status='processing', upload_index=?, next_attempt_at=?, last_error=NULL WHERE invoice_id=?")
                ->execute([$uploadIndex, date('Y-m-d H:i:s', time() + 45), $invoiceId]);
            $db->prepare("UPDATE shop_invoices SET spv_status='processing', spv_submission_id=? WHERE id=?")->execute([$uploadIndex, $invoiceId]);
            self::pollUpload($db, $config, $invoiceId, $uploadIndex);
        } catch (Throwable $error) {
            $db->prepare("UPDATE shop_spv_outbox SET status='retry', next_attempt_at=?, last_error=? WHERE invoice_id=?")
                ->execute([date('Y-m-d H:i:s', time() + 900), mb_substr($error->getMessage(), 0, 500), $invoiceId]);
            $db->prepare("UPDATE shop_invoices SET spv_status='error' WHERE id=? AND spv_status <> 'sent'")->execute([$invoiceId]);
            self::notify($db, 'spv_error', 'Transmitere SPV nereușită', self::invoiceLabel($invoice) . ': ' . $error->getMessage(), 'invoice', $invoiceId, 'error', 'spv-error:' . $invoiceId . ':' . date('Y-m-d'));
            throw $error;
        }
    }

    private static function pollUpload(PDO $db, array $config, string $invoiceId, string $uploadIndex): void
    {
        $job = self::job($db, $invoiceId) ?: [];
        $environment = self::environment((string)($job['environment'] ?? self::settings($db)['environment']));
        $url = self::apiBase($config, $environment) . '/stareMesaj?id_incarcare=' . rawurlencode($uploadIndex);
        $response = self::http('GET', $url, ['Authorization: Bearer ' . self::accessToken($db, $config), 'Accept: application/xml, application/json'], null, 30);
        if ($response['status'] < 200 || $response['status'] >= 300) {
            $db->prepare("UPDATE shop_spv_outbox SET status='processing', next_attempt_at=?, last_error=? WHERE invoice_id=?")
                ->execute([date('Y-m-d H:i:s', time() + 300), 'Verificarea ANAF a răspuns HTTP ' . $response['status'], $invoiceId]);
            return;
        }
        $state = mb_strtolower(self::responseValue($response['body'], ['stare', 'status']), 'UTF-8');
        if (in_array($state, ['ok', 'accepted', 'valid'], true)) {
            $downloadId = self::responseValue($response['body'], ['id_descarcare', 'downloadid', 'id']);
            GtrotsInvoiceService::markSpvSent($db, $invoiceId, $uploadIndex);
            $db->prepare("UPDATE shop_spv_outbox SET status='accepted', download_id=?, sent_at=CURRENT_TIMESTAMP, accepted_at=CURRENT_TIMESTAMP, next_attempt_at=NULL, last_error=NULL WHERE invoice_id=?")
                ->execute([$downloadId ?: null, $invoiceId]);
            return;
        }
        if (in_array($state, ['nok', 'error', 'rejected', 'invalid'], true)) {
            $message = self::responseMessage($response['body']);
            $db->prepare("UPDATE shop_spv_outbox SET status='rejected', next_attempt_at=NULL, last_error=? WHERE invoice_id=?")->execute([mb_substr($message, 0, 500), $invoiceId]);
            $db->prepare("UPDATE shop_invoices SET spv_status='rejected' WHERE id=? AND spv_status <> 'sent'")->execute([$invoiceId]);
            self::notify($db, 'spv_rejected', 'Factură respinsă de ANAF', $message, 'invoice', $invoiceId, 'error', 'spv-rejected:' . $invoiceId . ':' . $uploadIndex);
            return;
        }
        $db->prepare("UPDATE shop_spv_outbox SET status='processing', next_attempt_at=?, last_error=NULL WHERE invoice_id=?")
            ->execute([date('Y-m-d H:i:s', time() + 90), $invoiceId]);
    }

    private static function accessToken(PDO $db, array $config, bool $forceRefresh = false): string
    {
        $row = self::connectionRow($db);
        if (!$row || trim((string)($row['refresh_token_cipher'] ?? '')) === '') throw new RuntimeException('Firma nu este conectată la SPV.');
        $expires = !empty($row['access_expires_at']) ? strtotime((string)$row['access_expires_at']) : 0;
        if (!$forceRefresh && $expires > time() + self::ACCESS_REFRESH_BEFORE_SECONDS && trim((string)($row['access_token_cipher'] ?? '')) !== '') {
            return self::decrypt((string)$row['access_token_cipher'], $config);
        }
        $refreshExpires = !empty($row['refresh_expires_at']) ? strtotime((string)$row['refresh_expires_at']) : 0;
        if ($refreshExpires > 0 && $refreshExpires <= time()) {
            self::connectionError($db, 'Tokenul de reînnoire ANAF a expirat. Reconectarea cu certificatul este necesară.');
            throw new RuntimeException('Conexiunea SPV a expirat. Reconectează certificatul ANAF.');
        }
        $refresh = self::decrypt((string)$row['refresh_token_cipher'], $config);
        $token = self::tokenRequest($config, ['grant_type' => 'refresh_token', 'refresh_token' => $refresh]);
        self::saveTokens($db, $config, $token, (string)($row['environment'] ?? 'test'), false, $refresh);
        $saved = self::connectionRow($db);
        return self::decrypt((string)$saved['access_token_cipher'], $config);
    }

    private static function tokenRequest(array $config, array $fields): array
    {
        $response = self::http('POST', (string)($config['anaf_oauth_token_url'] ?? 'https://logincert.anaf.ro/anaf-oauth2/v1/token'), self::basicHeaders($config), http_build_query($fields, '', '&', PHP_QUERY_RFC3986), 45);
        $payload = json_decode($response['body'], true);
        if ($response['status'] < 200 || $response['status'] >= 300 || !is_array($payload) || empty($payload['access_token'])) {
            $message = is_array($payload) ? (string)($payload['error_description'] ?? $payload['error'] ?? '') : '';
            throw new RuntimeException('ANAF nu a emis tokenul OAuth' . ($message !== '' ? ': ' . $message : ' (HTTP ' . $response['status'] . ').'));
        }
        return $payload;
    }

    private static function saveTokens(PDO $db, array $config, array $token, string $environment, bool $initial, string $fallbackRefresh = ''): void
    {
        $access = trim((string)($token['access_token'] ?? ''));
        $refresh = trim((string)($token['refresh_token'] ?? $fallbackRefresh));
        if ($access === '' || $refresh === '') throw new RuntimeException('ANAF nu a returnat setul complet de tokenuri.');
        $accessExp = self::tokenExpiry($access, (int)($token['expires_in'] ?? 90 * 86400));
        $refreshExp = self::tokenExpiry($refresh, 365 * 86400);
        $claims = self::jwtClaims($access);
        $serial = (string)($claims['serial_certificate'] ?? $claims['serialCertificate'] ?? $claims['certificate_serial'] ?? '');
        $accessCipher = self::encrypt($access, $config);
        $refreshCipher = self::encrypt($refresh, $config);
        $connectedAt = $initial ? date('Y-m-d H:i:s') : null;
        if (self::isSqlite($db)) {
            $stmt = $db->prepare('INSERT INTO shop_spv_connections (id,status,environment,access_token_cipher,refresh_token_cipher,access_expires_at,refresh_expires_at,certificate_serial,connected_at,last_refreshed_at,last_error)
                VALUES (1,"connected",?,?,?,?,?,?,?,?,NULL)
                ON CONFLICT(id) DO UPDATE SET status="connected", environment=excluded.environment, access_token_cipher=excluded.access_token_cipher,
                refresh_token_cipher=excluded.refresh_token_cipher, access_expires_at=excluded.access_expires_at, refresh_expires_at=excluded.refresh_expires_at,
                certificate_serial=excluded.certificate_serial, connected_at=COALESCE(excluded.connected_at,shop_spv_connections.connected_at),
                last_refreshed_at=excluded.last_refreshed_at,last_error=NULL');
        } else {
            $stmt = $db->prepare("INSERT INTO shop_spv_connections (id,status,environment,access_token_cipher,refresh_token_cipher,access_expires_at,refresh_expires_at,certificate_serial,connected_at,last_refreshed_at,last_error)
                VALUES (1,'connected',?,?,?,?,?,?,?,?,NULL)
                ON DUPLICATE KEY UPDATE status='connected', environment=VALUES(environment), access_token_cipher=VALUES(access_token_cipher),
                refresh_token_cipher=VALUES(refresh_token_cipher), access_expires_at=VALUES(access_expires_at), refresh_expires_at=VALUES(refresh_expires_at),
                certificate_serial=VALUES(certificate_serial), connected_at=COALESCE(VALUES(connected_at),connected_at),
                last_refreshed_at=VALUES(last_refreshed_at),last_error=NULL");
        }
        $stmt->execute([$environment, $accessCipher, $refreshCipher, date('Y-m-d H:i:s', $accessExp), date('Y-m-d H:i:s', $refreshExp), mb_substr($serial, 0, 255) ?: null, $connectedAt, date('Y-m-d H:i:s')]);
    }

    private static function syncNotifications(PDO $db): void
    {
        self::ensureSchema($db);
        try {
            $orders = $db->query("SELECT id,order_number,status,customer_name,company_name,total,currency,created_at,return_requested_at,customer_cancelled_at FROM shop_orders WHERE (status='new' AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)) OR status='return_requested' OR (status='cancelled' AND customer_cancelled_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)) ORDER BY created_at DESC LIMIT 250")->fetchAll();
            foreach ($orders as $order) {
                $status = (string)$order['status'];
                $number = (string)$order['order_number'];
                $client = trim((string)($order['company_name'] ?: $order['customer_name'] ?? 'Client'));
                if ($status === 'new') self::notify($db, 'new_order', 'Comandă nouă · ' . $number, $client . ' · ' . number_format((float)$order['total'], 2, ',', '.') . ' ' . (string)$order['currency'], 'order', (string)$order['id'], 'success', 'order-new:' . (string)$order['id']);
                elseif ($status === 'return_requested') self::notify($db, 'return_requested', 'Retur solicitat · ' . $number, $client . ' a trimis o solicitare de retur.', 'order', (string)$order['id'], 'warning', 'order-return:' . (string)$order['id']);
                elseif ($status === 'cancelled') self::notify($db, 'order_cancelled', 'Comandă anulată · ' . $number, 'Comanda a fost anulată și regulile fiscale au fost aplicate.', 'order', (string)$order['id'], 'error', 'order-cancelled:' . (string)$order['id']);
            }
        } catch (Throwable $ignored) { }

        $settings = self::settings($db);
        if (empty($settings['reminders_enabled'])) return;
        try {
            $rows = $db->query("SELECT i.id,i.series,i.invoice_number,i.issue_date,i.invoice_type,
                    o.status AS outbox_status,o.mode_snapshot,o.scheduled_at,o.next_attempt_at
                FROM shop_invoices i
                LEFT JOIN shop_spv_outbox o ON o.invoice_id=i.id
                WHERE i.spv_status <> 'sent'
                ORDER BY i.issue_date ASC,i.issued_at ASC,i.id ASC
                LIMIT 500")->fetchAll();
            foreach ($rows as $invoice) {
                $invoiceId = (string)$invoice['id'];
                $notice = self::deadlineNotification($invoice);
                if (!$notice) {
                    $db->prepare("DELETE FROM shop_notifications WHERE notification_type='spv_deadline' AND entity_type='invoice' AND entity_id=?")->execute([$invoiceId]);
                    continue;
                }
                $dedupe = 'spv-deadline:' . $invoiceId . ':' . (string)$notice['bucket'];
                $db->prepare("DELETE FROM shop_notifications WHERE notification_type='spv_deadline' AND entity_type='invoice' AND entity_id=? AND dedupe_key<>?")->execute([$invoiceId, $dedupe]);
                self::notify($db, 'spv_deadline', (string)$notice['title'], (string)$notice['body'], 'invoice', $invoiceId, (string)$notice['severity'], $dedupe);
            }
            $db->exec("DELETE FROM shop_notifications WHERE notification_type='spv_deadline' AND NOT EXISTS (SELECT 1 FROM shop_invoices i WHERE i.id=shop_notifications.entity_id AND i.spv_status<>'sent')");
        } catch (Throwable $ignored) { }
    }

    private static function notify(PDO $db, string $type, string $title, string $body, string $entityType, string $entityId, string $severity, string $dedupe): void
    {
        $dismissed = $db->prepare('SELECT 1 FROM shop_notification_dismissals WHERE dedupe_key = ? LIMIT 1');
        $dismissed->execute([$dedupe]);
        if ($dismissed->fetchColumn()) return;
        $prefix = self::isSqlite($db) ? 'INSERT OR IGNORE' : 'INSERT IGNORE';
        $stmt = $db->prepare($prefix . ' INTO shop_notifications (id,notification_type,title,body,entity_type,entity_id,severity,dedupe_key) VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([self::uuid(), $type, mb_substr($title, 0, 180), mb_substr($body, 0, 700), $entityType, $entityId, $severity, mb_substr($dedupe, 0, 220)]);
    }

    private static function rememberNotificationDismissals(PDO $db, ?string $id, bool $readOnly): void
    {
        $prefix = self::isSqlite($db) ? 'INSERT OR IGNORE' : 'INSERT IGNORE';
        $where = $id !== null ? ' WHERE id = ?' : ($readOnly ? ' WHERE read_at IS NOT NULL' : '');
        $stmt = $db->prepare($prefix . ' INTO shop_notification_dismissals (dedupe_key) SELECT dedupe_key FROM shop_notifications' . $where);
        $stmt->execute($id !== null ? [$id] : []);
    }

    private static function scheduledAt(string $issueDate, string $mode, int $delay): ?string
    {
        if ($mode === 'manual') return null;
        if ($mode === 'on_issue') return date('Y-m-d H:i:s');
        // Automatizarea este scadentă în ziua calculată, indiferent de oră.
        // Workerul o preia la prima activitate a aplicației din ziua respectivă.
        return self::addWorkingDays($issueDate, $delay) . ' 00:00:00';
    }

    private static function workingDaysBetween(string $from, string $to): int
    {
        $start = new DateTimeImmutable($from, new DateTimeZone('Europe/Bucharest'));
        $end = new DateTimeImmutable($to, new DateTimeZone('Europe/Bucharest'));
        if ($start->format('Y-m-d') === $end->format('Y-m-d')) return 0;
        $sign = $start < $end ? 1 : -1;
        $cursor = $sign > 0 ? $start : $end;
        $target = $sign > 0 ? $end : $start;
        $count = 0;
        while ($cursor < $target) {
            $cursor = $cursor->modify('+1 day');
            if (self::isRomanianWorkingDay($cursor)) $count++;
        }
        return $count * $sign;
    }

    private static function isRomanianWorkingDay(DateTimeImmutable $date): bool
    {
        if ((int)$date->format('N') > 5) return false;
        static $holidays = [];
        $year = (int)$date->format('Y');
        if (!isset($holidays[$year])) $holidays[$year] = array_fill_keys(self::romanianPublicHolidays($year), true);
        return !isset($holidays[$year][$date->format('Y-m-d')]);
    }

    /** Zilele nelucrătoare naționale relevante termenelor RO e-Factura. */
    private static function romanianPublicHolidays(int $year): array
    {
        $fixed = ['01-01','01-02','01-06','01-07','01-24','05-01','06-01','08-15','11-30','12-01','12-25','12-26'];
        $dates = array_map(static fn(string $day): string => sprintf('%04d-%s', $year, $day), $fixed);
        $a = $year % 4;
        $b = $year % 7;
        $c = $year % 19;
        $d = (19 * $c + 15) % 30;
        $e = (2 * $a + 4 * $b - $d + 34) % 7;
        $month = intdiv($d + $e + 114, 31);
        $day = (($d + $e + 114) % 31) + 1;
        $julianDifference = intdiv($year, 100) - intdiv($year, 400) - 2;
        $easter = (new DateTimeImmutable(sprintf('%04d-%02d-%02d', $year, $month, $day), new DateTimeZone('Europe/Bucharest')))->modify('+' . $julianDifference . ' days');
        foreach ([-2, 0, 1, 49, 50] as $offset) $dates[] = $easter->modify(($offset >= 0 ? '+' : '') . $offset . ' days')->format('Y-m-d');
        return array_values(array_unique($dates));
    }

    private static function job(PDO $db, string $invoiceId): ?array
    {
        $stmt = $db->prepare('SELECT * FROM shop_spv_outbox WHERE invoice_id=? LIMIT 1');
        $stmt->execute([$invoiceId]);
        return $stmt->fetch() ?: null;
    }

    private static function invoice(PDO $db, string $invoiceId): array
    {
        $stmt = $db->prepare('SELECT * FROM shop_invoices WHERE id=? LIMIT 1');
        $stmt->execute([$invoiceId]);
        $row = $stmt->fetch();
        if (!$row) throw new InvalidArgumentException('Factura nu există.');
        return $row;
    }

    private static function invoiceLabel(array $invoice): string
    {
        return trim((string)($invoice['series'] ?? '') . ' ' . (string)($invoice['invoice_number'] ?? '')) ?: 'Factura';
    }

    private static function connectionRow(PDO $db): array
    {
        self::ensureSchema($db);
        return $db->query('SELECT * FROM shop_spv_connections WHERE id=1')->fetch() ?: [];
    }

    private static function connectionError(PDO $db, string $message): void
    {
        if (self::isSqlite($db)) {
            $db->prepare('INSERT INTO shop_spv_connections (id,status,last_error) VALUES (1,"error",?) ON CONFLICT(id) DO UPDATE SET status="error",last_error=excluded.last_error')->execute([mb_substr($message, 0, 1000)]);
        } else {
            $db->prepare("INSERT INTO shop_spv_connections (id,status,last_error) VALUES (1,'error',?) ON DUPLICATE KEY UPDATE status='error',last_error=VALUES(last_error)")->execute([mb_substr($message, 0, 1000)]);
        }
    }

    private static function apiBase(array $config, string $environment): string
    {
        $key = $environment === 'production' ? 'anaf_efactura_production_url' : 'anaf_efactura_test_url';
        $fallback = 'https://api.anaf.ro/' . ($environment === 'production' ? 'prod' : 'test') . '/FCTEL/rest';
        return rtrim(trim((string)($config[$key] ?? $fallback)) ?: $fallback, '/');
    }

    private static function callbackUrl(array $config): string
    {
        return trim((string)($config['anaf_oauth_callback_url'] ?? 'https://g-trots.ro/shop-api/anaf-oauth-callback.php'));
    }

    private static function basicHeaders(array $config): array
    {
        $credentials = (string)($config['anaf_oauth_client_id'] ?? '') . ':' . (string)($config['anaf_oauth_client_secret'] ?? '');
        return ['Authorization: Basic ' . base64_encode($credentials), 'Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'];
    }

    private static function http(string $method, string $url, array $headers, ?string $body, int $timeout): array
    {
        if (self::$testHttpTransport !== null) {
            $response = (self::$testHttpTransport)($method, $url, $headers, $body, $timeout);
            if (!is_array($response) || !array_key_exists('status', $response) || !array_key_exists('body', $response)) {
                throw new RuntimeException('Transportul de test SPV a returnat un răspuns invalid.');
            }
            return ['status' => (int)$response['status'], 'body' => (string)$response['body']];
        }
        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            $options = [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => $timeout, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_FOLLOWLOCATION => false, CURLOPT_USERAGENT => 'G-Trots-RO-eFactura/1.0'];
            // ANAF requires a modern TLS connection. Some shared-hosting cURL
            // builds still negotiate an obsolete default and receive an
            // sslv3_alert_handshake_failure before the HTTP request exists.
            if (defined('CURLOPT_SSLVERSION')) $options[CURLOPT_SSLVERSION] = defined('CURL_SSLVERSION_TLSv1_2') ? CURL_SSLVERSION_TLSv1_2 : 6;
            if ($body !== null) $options[CURLOPT_POSTFIELDS] = $body;
            curl_setopt_array($curl, $options);
            $response = curl_exec($curl);
            $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            $error = curl_error($curl);
            curl_close($curl);
            if (!is_string($response)) throw new RuntimeException('ANAF nu a răspuns: ' . ($error ?: 'eroare de rețea.'));
            return ['status' => $status, 'body' => $response];
        }
        $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body ?? '', 'timeout' => $timeout, 'ignore_errors' => true]]);
        $response = @file_get_contents($url, false, $context);
        if (!is_string($response)) throw new RuntimeException('ANAF nu este disponibil momentan.');
        $status = 0;
        foreach ($http_response_header ?? [] as $header) if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $match)) $status = (int)$match[1];
        return ['status' => $status, 'body' => $response];
    }

    private static function responseValue(string $body, array $names): string
    {
        $json = json_decode($body, true);
        if (is_array($json)) {
            $flat = [];
            $walk = static function ($value) use (&$walk, &$flat): void {
                if (!is_array($value)) return;
                foreach ($value as $key => $child) {
                    if (!is_array($child)) $flat[mb_strtolower((string)$key, 'UTF-8')] = trim((string)$child);
                    else $walk($child);
                }
            };
            $walk($json);
            foreach ($names as $name) if (($flat[mb_strtolower($name, 'UTF-8')] ?? '') !== '') return $flat[mb_strtolower($name, 'UTF-8')];
        }
        if (class_exists('DOMDocument')) {
            $previous = libxml_use_internal_errors(true);
            try {
                $document = new DOMDocument();
                if ($document->loadXML($body, LIBXML_NONET | LIBXML_NOBLANKS)) {
                    $wanted = array_fill_keys(array_map(static fn(string $name): string => mb_strtolower($name, 'UTF-8'), $names), true);
                    foreach ($document->getElementsByTagName('*') as $element) {
                        $elementName = mb_strtolower((string)($element->localName ?: $element->nodeName), 'UTF-8');
                        if (isset($wanted[$elementName]) && trim((string)$element->textContent) !== '') return trim((string)$element->textContent);
                        if (!$element->hasAttributes()) continue;
                        foreach ($element->attributes as $attribute) {
                            $attributeName = mb_strtolower((string)($attribute->localName ?: $attribute->nodeName), 'UTF-8');
                            if (isset($wanted[$attributeName]) && trim((string)$attribute->nodeValue) !== '') return trim((string)$attribute->nodeValue);
                        }
                    }
                }
            } finally {
                libxml_clear_errors();
                libxml_use_internal_errors($previous);
            }
        }
        foreach ($names as $name) {
            $quoted = preg_quote($name, '/');
            if (preg_match('/(?:<|\b)' . $quoted . '(?:\b[^>]*>|\s*[=:]\s*["\']?)([^<"\'\s,;}]+)/iu', $body, $match)) return trim(html_entity_decode($match[1], ENT_QUOTES | ENT_XML1, 'UTF-8'));
        }
        return '';
    }

    private static function responseMessage(string $body): string
    {
        $message = self::responseValue($body, ['error_message', 'errormessage', 'message', 'eroare', 'description']);
        if ($message !== '') return mb_substr($message, 0, 500);
        $plain = trim(preg_replace('/\s+/', ' ', strip_tags($body)) ?? '');
        return $plain !== '' ? mb_substr($plain, 0, 500) : 'Răspuns ANAF fără detalii.';
    }

    private static function encrypt(string $plain, array $config): string
    {
        $key = hash('sha256', (string)$config['spv_encryption_key'], true);
        $nonce = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag, 'gtrots-spv-v1', 16);
        if (!is_string($cipher)) throw new RuntimeException('Tokenul ANAF nu a putut fi criptat.');
        return 'v1.' . base64_encode($nonce . $tag . $cipher);
    }

    private static function decrypt(string $encoded, array $config): string
    {
        if (!str_starts_with($encoded, 'v1.')) throw new RuntimeException('Formatul tokenului ANAF nu este recunoscut.');
        $raw = base64_decode(substr($encoded, 3), true);
        if (!is_string($raw) || strlen($raw) < 29) throw new RuntimeException('Tokenul ANAF stocat este deteriorat.');
        $key = hash('sha256', (string)$config['spv_encryption_key'], true);
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16), 'gtrots-spv-v1');
        if (!is_string($plain) || $plain === '') throw new RuntimeException('Tokenul ANAF nu a putut fi decriptat.');
        return $plain;
    }

    private static function tokenExpiry(string $jwt, int $fallbackSeconds): int
    {
        $claims = self::jwtClaims($jwt);
        $exp = (int)($claims['exp'] ?? 0);
        return $exp > time() ? $exp : time() + max(60, $fallbackSeconds);
    }

    private static function jwtClaims(string $jwt): array
    {
        $parts = explode('.', $jwt);
        if (count($parts) < 2) return [];
        $raw = strtr($parts[1], '-_', '+/');
        $raw .= str_repeat('=', (4 - strlen($raw) % 4) % 4);
        $json = base64_decode($raw, true);
        $claims = is_string($json) ? json_decode($json, true) : null;
        return is_array($claims) ? $claims : [];
    }

    private static function maskCertificate(string $serial): string
    {
        $serial = trim($serial);
        if ($serial === '') return '';
        return '••••' . mb_substr($serial, -6);
    }

    private static function environment(string $value): string { return strtolower(trim($value)) === 'production' ? 'production' : 'test'; }
    private static function mode(string $value): string { return in_array($value, ['manual', 'on_issue', 'delayed'], true) ? $value : 'manual'; }
    private static function delay($value): int { return max(1, min(5, (int)$value)); }
    private static function boolValue($value): bool { return is_bool($value) ? $value : in_array(strtolower(trim((string)$value)), ['1','true','yes','on'], true); }
    private static function isSqlite(PDO $db): bool { return strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite'; }
    private static function base64UrlEncode(string $bytes): string { return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '='); }
    private static function uuid(): string
    {
        if (function_exists('uuidV4')) return uuidV4();
        $bytes = random_bytes(16); $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40); $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
    private static function ensureMysqlColumn(PDO $db, string $table, string $column, string $definition): void
    {
        if (!$db->query("SHOW COLUMNS FROM {$table} LIKE " . $db->quote($column))->fetch()) $db->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
    }
}
