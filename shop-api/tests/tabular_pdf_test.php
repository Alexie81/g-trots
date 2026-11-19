<?php
require __DIR__.'/nir_bundle_contract_test.php';
$many=[];
for($i=1;$i<=120;$i++) { $r=$documents[0]; $r['document_number']='QA-'.str_pad((string)$i,4,'0',STR_PAD_LEFT); $r['notes']=$i===120 ? str_repeat('Observații pentru document. ',35).'FINAL-ULTIMA-NOTA' : 'Notă de verificare'; $many[]=$r; }
$xlsx=shopNirBuildRegistryXlsx($many,'2026-09-01','2026-09-30',[]);
$pdf=GtrotsTabularPdf::render($xlsx);
if (!empty($argv[1])) file_put_contents($argv[1],$pdf);
if (memory_get_peak_usage(true)>128*1024*1024) throw new RuntimeException('Tabular PDF exceeded the shared-hosting memory budget');
echo 'Large PDF bytes: '.strlen($pdf).PHP_EOL;
