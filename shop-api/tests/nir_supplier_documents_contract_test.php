<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$service = (string)file_get_contents(dirname(__DIR__) . '/nir-service.php');
$api = (string)file_get_contents(dirname(__DIR__) . '/api.php');
$mobile = (string)file_get_contents($root . '/components/ShopNirManager.tsx');
$mobileApi = (string)file_get_contents($root . '/services/shopApi.ts');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$desktopApi = (string)file_get_contents($root . '/electron-app/renderer/js/shop-api.js');

$failed = 0;
$expect = static function (bool $condition, string $message) use (&$failed): void {
    if ($condition) return;
    fwrite(STDERR, "FAIL documente furnizor NIR: {$message}\n");
    $failed++;
};

$uploadStart = strpos($service, 'function shopNirAttachmentUpload');
$deleteStart = strpos($service, 'function shopNirDeleteAttachment');
$storedPathStart = strpos($service, 'function shopNirAttachmentStoredPath');
$uploadContract = $uploadStart !== false && $deleteStart !== false ? substr($service, $uploadStart, $deleteStart - $uploadStart) : '';
$deleteContract = $deleteStart !== false && $storedPathStart !== false ? substr($service, $deleteStart, $storedPathStart - $deleteStart) : '';

foreach (["['draft', 'confirmed']", 'NIR_CONFIRM', 'NIR_CONFIRMED_DOCUMENT_ADDED', 'row_version = row_version + 1'] as $needle) {
    $expect(str_contains($uploadContract, $needle), "încărcarea pe NIR confirmat trebuie să conțină {$needle}");
}
foreach (["['draft', 'confirmed']", 'DELETE FROM shop_nir_attachments', 'NIR_CONFIRMED_DOCUMENT_REMOVED', 'source_file_hash', 'beginTransaction()', 'commit()', 'rollBack()', '@unlink'] as $needle) {
    $expect(str_contains($deleteContract, $needle), "ștergerea individuală trebuie să conțină {$needle}");
}
$expect(str_contains($api, "\$action === 'deleteNirAttachment' && \$method === 'DELETE'"), 'ruta DELETE lipsește');
$expect(str_contains($mobileApi, 'deleteNirAttachment:'), 'clientul API mobil nu expune ștergerea');
$expect(str_contains($desktopApi, 'deleteNirAttachment:'), 'clientul API desktop nu expune ștergerea');

foreach ([$mobile, $desktop] as $index => $ui) {
    $surface = $index === 0 ? 'mobil' : 'desktop';
    foreach (['pendingAttachmentDeletes', 'saveSupplierDocuments', 'Salvează documentele'] as $needle) {
        $normalizedNeedle = $surface === 'desktop' && $needle === 'pendingAttachmentDeletes' ? 'nirPendingAttachmentDeletes' : ($surface === 'desktop' && $needle === 'saveSupplierDocuments' ? 'saveNirSupplierDocuments' : $needle);
        if ($surface === 'desktop' && $needle === 'Salvează documentele') $normalizedNeedle = 'Salveaza documentele';
        $expect(str_contains($ui, $normalizedNeedle), "UI {$surface} nu conține {$normalizedNeedle}");
    }
}
$expect(str_contains($mobile, 'uploadPendingAttachments(refreshed, false)'), 'mobilul nu separă încărcarea documentelor de extracția liniilor');
$expect(str_contains($desktop, "uploadPendingNirFiles(document.id, { extract: false })"), 'desktopul nu separă încărcarea documentelor de extracția liniilor');
$expect(str_contains($mobile, 'Produsele, valorile și stocul NIR-ului nu au fost modificate'), 'mobilul nu explică lipsa impactului în stoc');
$expect(str_contains($desktop, 'Produsele, valorile si stocul NIR-ului nu s-au modificat'), 'desktopul nu explică lipsa impactului în stoc');

fwrite(STDOUT, 'Documente furnizor NIR: ' . ($failed ? "{$failed} verificări eșuate" : 'toate verificările au trecut') . ".\n");
exit($failed === 0 ? 0 : 1);
