# G-Trots SHOP API

API comun pentru aplicația mobilă, aplicația Electron și website. Gestionează
produsele, până la 12 imagini/produs, sursele produselor, comenzile, stocurile,
livrările, metodele de plată, categoriile ierarhice, compatibilitățile de brand și
producătorii în baza `cabitro_g-trots-shop`.

Reducerea unui produs se păstrează prin `discount_type` (`percent` sau `fixed`)
și `discount_value`; API-ul calculează și validează automat `sale_price`.

Categoriile pot avea un părinte la orice nivel. API-ul previne selectarea propriei
categorii sau crearea buclelor între categorie și subcategorii.

În producție, API-ul reutilizează automat cheia și datele MySQL din configurația
locală a `trotty-api`, dar folosește baza SHOP separată. Ca alternativă se poate
crea `config.local.php` pornind de la `config.example.php`.

Endpoint: `https://g-trots.ro/shop-api/api.php`.

Filtrele magazinului public folosesc ruta read-only
`?action=publicCatalogFilters`. Aceasta returnează doar categoriile,
compatibilitățile și producătorii activi și nu expune cheia administrativă.

## Rute publice

- `publicProducts` — produsele active ale surselor active;
- `publicProduct&id=<id-sau-slug>` — pagina completă a produsului;
- `publicShopConfig` — livrările și metodele de plată active;
- `createPublicOrder` — creează comanda și rezervă automat stocul urmărit.

## Administrare

Rutele administrative cer cheia SHOP și tokenul utilizatorului autentificat.
Sunt disponibile operații CRUD pentru produse și surse, gestiunea comenzilor,
ajustări și istoric de stoc, metode de plată și livrări.

Dezactivarea unei surse ascunde imediat toate produsele sale din rutele publice,
fără să le șteargă din CRM. Ștergerea definitivă a unui produs elimină imaginile
încărcate de pe disc și păstrează în comenzile istorice datele comerciale salvate.

Fișierul `.user.ini` permite cereri suficient de mari pentru încărcarea simultană
a celor 12 imagini, respectând limita de 6 MB pentru fiecare imagine impusă de API.
