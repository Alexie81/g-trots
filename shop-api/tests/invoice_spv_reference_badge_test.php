<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/spv-service.php';

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "invoice_spv_reference_badge_test: {$message}\n");
        exit(1);
    }
};

$assert(
    GtrotsSpvService::invoiceReference(
        ['spv_status' => 'sent', 'spv_submission_id' => 'OLD-SUBMISSION'],
        ['upload_index' => 'UPLOAD-NEW', 'download_id' => 'DOWNLOAD-NEW']
    ) === 'UPLOAD-NEW',
    'Indexul de încărcare din coada SPV trebuie să aibă prioritate.'
);
$assert(
    GtrotsSpvService::invoiceReference(
        ['spv_status' => 'sent', 'spv_submission_id' => 'HISTORIC-123'],
        null
    ) === 'HISTORIC-123',
    'Facturile istorice trebuie să folosească identificatorul salvat pe factură.'
);
$assert(
    GtrotsSpvService::invoiceReference(
        ['spv_status' => 'sent', 'spv_submission_id' => null],
        ['upload_index' => null, 'download_id' => 'DOWNLOAD-456']
    ) === 'DOWNLOAD-456',
    'ID-ul de descărcare ANAF trebuie folosit ca ultim fallback.'
);
$assert(
    GtrotsSpvService::invoiceReference(
        ['spv_status' => 'processing', 'spv_submission_id' => 'PROCESSING-123'],
        ['upload_index' => 'PROCESSING-123']
    ) === null,
    'Referința nu trebuie afișată înainte ca factura să fie acceptată.'
);

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$types = (string)file_get_contents($root . '/services/shopApi.ts');
$mobile = (string)file_get_contents($root . '/components/ShopInvoicesManager.tsx');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$desktopStyles = (string)file_get_contents($root . '/electron-app/renderer/style.css');

$assert(substr_count($api, "['spv_reference'] = GtrotsSpvService::invoiceReference") >= 2, 'Lista și fișa facturii trebuie să includă referința ANAF normalizată.');
$assert(str_contains($types, 'spv_reference?: string | null'), 'Contractul aplicațiilor nu include referința ANAF.');

foreach ([$mobile, $desktop] as $source) {
    $assert(str_contains($source, "spv_status !== 'sent'"), 'Badge-ul nu este limitat la facturile trimise.');
    $assert(str_contains($source, 'spv_submission_id'), 'Fallback-ul pentru facturile istorice lipsește.');
    $assert(str_contains($source, 'REF. ANAF'), 'Textul badge-ului ANAF lipsește.');
}

$assert(str_contains($mobile, 'spvReferenceBadge'), 'Badge-ul mobil pentru referința ANAF lipsește.');
$assert(str_contains($desktopStyles, '.shop-invoice-reference') && str_contains($desktopStyles, '.spv-reference'), 'Badge-ul desktop pentru referința ANAF nu are stiluri în listă și fișă.');

echo "invoice_spv_reference_badge_test: OK\n";
