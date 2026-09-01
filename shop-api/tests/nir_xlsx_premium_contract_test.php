<?php
declare(strict_types=1);

require_once __DIR__ . '/../nir-domain.php';
require_once __DIR__ . '/../nir-service.php';

$source = (string)file_get_contents(__DIR__ . '/../nir-xlsx.php');
$headers = ['Nr. crt.', 'Cod / SKU', 'Imagine', 'Denumirea bunurilor recepționate', 'U.M.', 'Cantitate document', 'Cantitate recepționată', 'Diferență cantitativă', 'Preț unitar fără TVA', 'Valoare fără TVA', 'TVA %', 'Valoare TVA', 'Valoare totală'];
$failed = 0;
foreach ($headers as $header) {
    if (!str_contains($source, $header)) { fwrite(STDERR, "FAIL antet XLSX strict: {$header}\n"); $failed++; }
}
foreach (['shopNirRenderStrictXlsx', 'name="NIR" sheetId="1"', "'drawing' => !empty(\$pictures)", 'shopNirPremiumXlsxSafeCompanyStamp', '_xlnm.Print_Titles', "'G' . \$dataRow . '*I' . \$dataRow", "'J' . \$dataRow . '*K' . \$dataRow . '/100'"] as $needle) {
    if (!str_contains($source, $needle)) { fwrite(STDERR, "FAIL contract XLSX strict: {$needle}\n"); $failed++; }
}
if (!str_contains($source, "'A5:F6', 'G5:M6'")) {
    fwrite(STDERR, "FAIL banda documentului nu acoperă toate coloanele A:M.\n");
    $failed++;
}
foreach (["'G5:H6'", "'I5:M6'"] as $obsoleteMerge) {
    if (str_contains($source, $obsoleteMerge)) {
        fwrite(STDERR, "FAIL îmbinare XLSX veche rămasă: {$obsoleteMerge}\n");
        $failed++;
    }
}
fwrite(STDOUT, $failed ? "Contract XLSX strict: {$failed} verificări eșuate.\n" : "Contract XLSX strict validat: o foaie, 13 coloane, formule, logo, ștampilă și miniaturi.\n");
exit($failed === 0 ? 0 : 1);
