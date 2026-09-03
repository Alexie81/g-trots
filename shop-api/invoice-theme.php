<?php
declare(strict_types=1);

/**
 * Persists the active invoice palette and immutable theme snapshots.
 *
 * A theme is copied to shop_invoice_theme_assignments the first time a
 * document identity is issued. Later renders only read that snapshot, so a
 * global palette change can never restyle an older invoice.
 */
final class GtrotsInvoiceThemeStore
{
    public const THEMES = [
        'orange' => ['label' => 'Portocaliu', 'accent' => '#ff8a00', 'accent_dark' => '#d96500', 'soft' => '#fff3e2', 'ink' => '#7a3300'],
        'green' => ['label' => 'Verde', 'accent' => '#19a86b', 'accent_dark' => '#08794a', 'soft' => '#e9f8f1', 'ink' => '#075c3a'],
        'red' => ['label' => 'Roșu', 'accent' => '#ef4056', 'accent_dark' => '#b91f36', 'soft' => '#fff0f2', 'ink' => '#8f1428'],
        'purple' => ['label' => 'Mov', 'accent' => '#7157d9', 'accent_dark' => '#4c35ad', 'soft' => '#f0edff', 'ink' => '#3f2b92'],
    ];

    private const ALIASES = [
        'orange' => 'orange', 'portocaliu' => 'orange',
        'green' => 'green', 'verde' => 'green',
        'red' => 'red', 'rosu' => 'red', 'roșu' => 'red',
        'purple' => 'purple', 'mov' => 'purple',
    ];

    public static function normalize(string $theme): string
    {
        $key = mb_strtolower(trim($theme), 'UTF-8');
        $normalized = self::ALIASES[$key] ?? null;
        if ($normalized === null) {
            throw new InvalidArgumentException('Tema facturii trebuie să fie: orange, green, red sau purple.');
        }
        return $normalized;
    }

    public static function settings(PDO $db): array
    {
        $row = $db->query('SELECT default_theme, invoice_series, due_days, default_notes, updated_by, updated_at FROM shop_invoice_settings WHERE id = 1 LIMIT 1')->fetch() ?: [];
        $theme = self::normalize((string)($row['default_theme'] ?? 'orange'));
        $series = self::normalizeSeries((string)($row['invoice_series'] ?? 'GT'));
        $last = $db->query('SELECT invoice_series, invoice_number, theme, assigned_at FROM shop_invoice_theme_assignments ORDER BY assigned_at DESC, document_key DESC LIMIT 1')->fetch() ?: null;
        return [
            'active_theme' => $theme,
            'invoice_series' => $series,
            'next_number' => self::availableNextNumber($db, $series),
            'due_days' => max(0, min(365, (int)($row['due_days'] ?? 7))),
            'default_notes' => (string)($row['default_notes'] ?? ''),
            'themes' => self::THEMES,
            'assigned_documents' => (int)$db->query('SELECT COUNT(*) FROM shop_invoice_theme_assignments')->fetchColumn(),
            'last_assignment' => $last ? [
                'series' => (string)$last['invoice_series'],
                'number' => (string)$last['invoice_number'],
                'theme' => self::normalize((string)$last['theme']),
                'assigned_at' => (string)$last['assigned_at'],
            ] : null,
            'updated_by' => (string)($row['updated_by'] ?? ''),
            'updated_at' => isset($row['updated_at']) ? (string)$row['updated_at'] : null,
        ];
    }

    public static function update(PDO $db, string $theme, string $updatedBy, array $documentSettings = []): array
    {
        $theme = self::normalize($theme);
        $current = $db->query('SELECT invoice_series, due_days, default_notes FROM shop_invoice_settings WHERE id = 1 LIMIT 1')->fetch() ?: [];
        $series = self::normalizeSeries((string)($documentSettings['invoice_series'] ?? $current['invoice_series'] ?? 'GT'));
        $dueDays = max(0, min(365, (int)($documentSettings['due_days'] ?? $current['due_days'] ?? 7)));
        $defaultNotes = mb_substr(trim((string)($documentSettings['default_notes'] ?? $current['default_notes'] ?? '')), 0, 2000);
        $requestedNext = isset($documentSettings['next_number']) ? (int)$documentSettings['next_number'] : self::availableNextNumber($db, $series);
        $minimumNext = self::minimumNextNumber($db, $series);
        if ($requestedNext < $minimumNext) {
            throw new InvalidArgumentException('Următorul număr pentru seria ' . $series . ' trebuie să fie cel puțin ' . $minimumNext . '.');
        }
        $sql = self::isSqlite($db)
            ? 'INSERT INTO shop_invoice_settings (id, default_theme, invoice_series, due_days, default_notes, updated_by) VALUES (1, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET default_theme = excluded.default_theme, invoice_series = excluded.invoice_series, due_days = excluded.due_days, default_notes = excluded.default_notes, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP'
            : 'INSERT INTO shop_invoice_settings (id, default_theme, invoice_series, due_days, default_notes, updated_by) VALUES (1, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE default_theme = VALUES(default_theme), invoice_series = VALUES(invoice_series), due_days = VALUES(due_days), default_notes = VALUES(default_notes), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP';
        $stmt = $db->prepare($sql);
        $stmt->execute([$theme, $series, $dueDays, $defaultNotes, mb_substr(trim($updatedBy), 0, 180)]);
        $lastNumber = $requestedNext - 1;
        $sequenceSql = self::isSqlite($db)
            ? 'INSERT INTO shop_invoice_sequences (series, last_number) VALUES (?, ?) ON CONFLICT(series) DO UPDATE SET last_number = excluded.last_number, updated_at = CURRENT_TIMESTAMP'
            : 'INSERT INTO shop_invoice_sequences (series, last_number) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_number = VALUES(last_number), updated_at = CURRENT_TIMESTAMP';
        $db->prepare($sequenceSql)->execute([$series, $lastNumber]);
        return self::settings($db);
    }

    private static function normalizeSeries(string $series): string
    {
        $series = strtoupper(trim($series));
        if ($series === '' || mb_strlen($series) > 20 || !preg_match('/^[A-Z0-9._\/-]+$/', $series)) {
            throw new InvalidArgumentException('Prefixul seriei poate conține doar litere, cifre, punct, cratimă sau slash.');
        }
        return $series;
    }

    private static function minimumNextNumber(PDO $db, string $series): int
    {
        $cast = self::isSqlite($db) ? 'INTEGER' : 'UNSIGNED';
        $invoice = $db->prepare("SELECT MAX(CAST(invoice_number AS {$cast})) FROM shop_invoices WHERE series = ?");
        $invoice->execute([$series]);
        $assignment = $db->prepare("SELECT MAX(CAST(invoice_number AS {$cast})) FROM shop_invoice_theme_assignments WHERE invoice_series = ?");
        $assignment->execute([$series]);
        return max((int)$invoice->fetchColumn(), (int)$assignment->fetchColumn()) + 1;
    }

    private static function availableNextNumber(PDO $db, string $series): int
    {
        $sequence = $db->prepare('SELECT last_number FROM shop_invoice_sequences WHERE series = ? LIMIT 1');
        $sequence->execute([$series]);
        return max(self::minimumNextNumber($db, $series), (int)$sequence->fetchColumn() + 1);
    }

    public static function pin(PDO $db, array $invoice, string $assignedBy = ''): array
    {
        [$documentKey, $documentId, $series, $number] = self::identity($invoice);
        $find = $db->prepare(
            'SELECT document_key, document_id, invoice_series, invoice_number, theme, assigned_at, last_rendered_at
             FROM shop_invoice_theme_assignments
             WHERE document_key = ? OR (invoice_series = ? AND invoice_number = ?)
             ORDER BY CASE WHEN document_key = ? THEN 0 ELSE 1 END
             LIMIT 1'
        );
        $find->execute([$documentKey, $series, $number, $documentKey]);
        $existing = $find->fetch();
        if ($existing) {
            $db->prepare('UPDATE shop_invoice_theme_assignments SET last_rendered_at = CURRENT_TIMESTAMP WHERE document_key = ?')->execute([(string)$existing['document_key']]);
            return self::assignment($existing, true);
        }

        $theme = self::normalize((string)($db->query('SELECT default_theme FROM shop_invoice_settings WHERE id = 1 LIMIT 1')->fetchColumn() ?: 'orange'));
        $insertCommand = self::isSqlite($db) ? 'INSERT OR IGNORE' : 'INSERT IGNORE';
        $insert = $db->prepare(
            $insertCommand . ' INTO shop_invoice_theme_assignments
             (document_key, document_id, invoice_series, invoice_number, theme, assigned_by)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $insert->execute([$documentKey, $documentId, $series, $number, $theme, mb_substr(trim($assignedBy), 0, 180)]);
        $find->execute([$documentKey, $series, $number, $documentKey]);
        $saved = $find->fetch();
        if (!$saved) throw new RuntimeException('Tema facturii nu a putut fi fixată.');
        return self::assignment($saved, false);
    }

    private static function identity(array $invoice): array
    {
        $documentId = mb_substr(trim((string)($invoice['document_id'] ?? '')), 0, 64);
        $series = mb_substr(strtoupper(trim((string)($invoice['series'] ?? ''))), 0, 60);
        $number = mb_substr(trim((string)($invoice['number'] ?? '')), 0, 120);
        if ($series === '' || $number === '') {
            throw new InvalidArgumentException('Fixarea temei necesită seria și numărul facturii.');
        }
        $documentKey = $documentId !== ''
            ? 'id:' . $documentId
            : 'invoice:' . hash('sha256', $series . "\n" . $number);
        return [$documentKey, $documentId !== '' ? $documentId : null, $series, $number];
    }

    private static function assignment(array $row, bool $existing): array
    {
        return [
            'document_key' => (string)$row['document_key'],
            'document_id' => $row['document_id'] !== null ? (string)$row['document_id'] : null,
            'series' => (string)$row['invoice_series'],
            'number' => (string)$row['invoice_number'],
            'theme' => self::normalize((string)$row['theme']),
            'assigned_at' => (string)$row['assigned_at'],
            'last_rendered_at' => (string)($row['last_rendered_at'] ?? $row['assigned_at']),
            'existing' => $existing,
        ];
    }

    private static function isSqlite(PDO $db): bool
    {
        return strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite';
    }
}
