# G-Trots SHOP API

API comun pentru aplicația mobilă și aplicația Electron. Gestionează categoriile
ierarhice, compatibilitățile de brand, producătorii și miniaturile catalogului în
baza `cabitro_g-trots-shop`.

Categoriile pot avea un părinte la orice nivel. API-ul previne selectarea propriei
categorii sau crearea buclelor între categorie și subcategorii.

În producție, API-ul reutilizează automat cheia și datele MySQL din configurația
locală a `trotty-api`, dar folosește baza SHOP separată. Ca alternativă se poate
crea `config.local.php` pornind de la `config.example.php`.

Endpoint: `https://g-trots.ro/shop-api/api.php`.
