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

Endpoint stabil: `https://g-trots.ro/shop-api/api-v2.php`. Fișierul `api-v2.php`
încarcă aceeași implementare din `api.php`, astfel încât website-ul și ambele
aplicații nu pot ajunge accidental pe versiuni diferite ale API-ului.

Filtrele magazinului public folosesc ruta read-only
`?action=publicCatalogFilters`. Aceasta returnează doar categoriile,
compatibilitățile și producătorii activi și nu expune cheia administrativă.

## Rute publice

- `publicProducts` — produsele active ale surselor active;
- `publicProduct&id=<id-sau-slug>` — pagina completă a produsului;
- `publicShopConfig` — livrările și metodele de plată active;
- `createPublicOrder` — creează comanda și rezervă automat stocul urmărit.
- `stripeCheckoutStatus` — confirmă plata direct la Stripe și întoarce bonul;
- `stripeWebhook` — procesează idempotent confirmările și expirările Stripe.
- `publicTrackOrder` — urmărește o comandă prin tokenul privat din e-mail sau,
  manual, prin codul comenzii împreună cu adresa de e-mail.

## Administrare

Rutele administrative cer cheia SHOP și tokenul utilizatorului autentificat.
Sunt disponibile operații CRUD pentru produse și surse, gestiunea comenzilor,
ajustări și istoric de stoc, metode de plată și livrări.

Comenzile păstrează un istoric separat al statusurilor. Rambursul pornește în
`processing` și trimite automat mesajul de primire; plata Stripe confirmată trece
idempotent în `confirmed` și trimite bonul o singură dată. La schimbarea manuală
a statusului, aplicațiile pot solicita opțional notificarea clientului. Mesajele
HTML sunt trimise prin SMTP de la adresa configurată local, iar parola SMTP nu se
salvează niciodată în Git.

Catalogul CRM este sursa unică de adevăr. Stripe nu are un catalog administrat
separat: fiecare produs local păstrează ID-ul copiei tehnice Stripe. La salvare
se sincronizează numele, descrierea, pagina publică, imaginea principală,
vizibilitatea și prețul. La modificarea prețului se creează automat un preț
Stripe nou și cel vechi este arhivat; la ștergere, copia Stripe este arhivată
înainte de eliminarea produsului și a fișierelor locale. Ruta administrativă
`syncStripeCatalog` repară sau reface legăturile pentru întreg catalogul.

În mediul de test, `php register-stripe-webhook.php` creează o singură destinație
pentru evenimentele Checkout și salvează automat secretul în `config.local.php`.
Scriptul poate rula numai din linia de comandă și nu afișează secretul.

Dezactivarea unei surse ascunde imediat toate produsele sale din rutele publice,
fără să le șteargă din CRM. Ștergerea definitivă a unui produs elimină imaginile
încărcate de pe disc și păstrează în comenzile istorice datele comerciale salvate.

Fișierul `.user.ini` permite cereri suficient de mari pentru încărcarea simultană
a celor 12 imagini, respectând limita de 6 MB pentru fiecare imagine impusă de API.
