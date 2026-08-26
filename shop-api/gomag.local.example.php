<?php

// Copiaza acest fisier ca gomag.local.php doar pe server.
// Fisierul real este ignorat de Git si nu trebuie livrat in aplicatii.
return [
    'gomag_api_key' => 'replace-with-gomag-api-key',
    'gomag_shop_url' => 'https://www.boomag.ro',
    'boomag_feed_url' => 'https://www.boomag.ro/feed/doctor-trotineta.csv',
    // Cheie temporara, lunga si aleatoare, folosita numai pentru importul initial in loturi.
    'boomag_import_key' => 'replace-with-one-time-import-key',
];
