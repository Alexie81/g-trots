<?php
declare(strict_types=1);

require_once __DIR__ . '/../invoice-theme.php';

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec("CREATE TABLE shop_invoice_settings (id INTEGER PRIMARY KEY, default_theme TEXT NOT NULL DEFAULT 'orange', updated_by TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
$db->exec("CREATE TABLE shop_invoice_theme_assignments (document_key TEXT PRIMARY KEY, document_id TEXT, invoice_series TEXT NOT NULL, invoice_number TEXT NOT NULL, theme TEXT NOT NULL, assigned_by TEXT, assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_rendered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(invoice_series, invoice_number))");
$db->exec("INSERT INTO shop_invoice_settings (id, default_theme) VALUES (1, 'orange')");

$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

GtrotsInvoiceThemeStore::update($db, 'purple', 'Test');
$old = GtrotsInvoiceThemeStore::pin($db, ['series' => 'GT', 'number' => '099'], 'Test');
$expect($old['theme'] === 'purple' && $old['existing'] === false, 'GT099 trebuie fixată prima dată pe mov.');

GtrotsInvoiceThemeStore::update($db, 'orange', 'Test');
$new = GtrotsInvoiceThemeStore::pin($db, ['series' => 'GT', 'number' => '100'], 'Test');
$expect($new['theme'] === 'orange' && $new['existing'] === false, 'GT100 trebuie să primească noua temă portocalie.');

$regenerated = GtrotsInvoiceThemeStore::pin($db, ['series' => 'GT', 'number' => '099'], 'Test');
$expect($regenerated['theme'] === 'purple' && $regenerated['existing'] === true, 'GT099 trebuie să rămână mov după regenerare.');
$expect((int)$db->query('SELECT COUNT(*) FROM shop_invoice_theme_assignments')->fetchColumn() === 2, 'Regenerarea nu trebuie să creeze o atribuire nouă.');

if ($failures) {
    fwrite(STDERR, "Istoric teme factură: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "Istoricul temelor este imuabil: GT099 rămâne mov, GT100 devine portocaliu.\n";
