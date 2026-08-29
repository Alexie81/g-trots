# NIR, multi-furnizor și FIFO — G-Trots

## Arhitectură

Modulul folosește backend-ul PHP/MySQL existent drept singura sursă de adevăr. Aplicația mobilă React Native și renderer-ul Electron folosesc aceleași acțiuni din `shop-api/api.php`, aceleași DTO-uri și aceleași calcule server-side din `shop-api/nir-domain.php` și `shop-api/nir-service.php`. Nu există o bază locală de stoc și nici calcule contabile definitive în UI.

Entitatea stocabilă reală din proiect este `shop_products` (denumită **StockItem** în acest document). Proiectul nu gestionează în prezent stoc separat pe variante. NIR-ul crește numai `accounting_stock_quantity` (Stocuri Conta). `stock_quantity`, stocul comercial public, rămâne neschimbat.

Migrarea SQL este în `shop-api/migrations/20260829_nir_multi_supplier_fifo.sql`. `ensureShopSchema()` aplică idempotent aceleași structuri la pornirea API-ului și mută codurile legacy prin funcția canonică de normalizare.

## Modele și surse de adevăr

- `shop_nir_documents`: antet, număr temporar/definitiv, status, furnizor, gestiune, factură, **data NIR**, data recepției, **monedă, curs valutar și data cursului**, totaluri în moneda documentului și în RON, audit și `row_version`.
- `shop_nir_lines`: snapshot-ul fiecărei achiziții, cantități facturate/recepționate/acceptate/respinse, motivul și observațiile diferenței, conversie, preț, discount, TVA, totaluri și cost FIFO. Istoricul nu este suprascris.
- `shop_supplier_product_references`: relația furnizor–StockItem. Un StockItem poate avea mai mulți furnizori și mai multe coduri la același furnizor.
- `shop_inventory_cost_layers`: câte un lot real pentru fiecare linie NIR confirmată.
- `shop_inventory_layer_consumptions`: alocările viitoare FIFO; momentan este folosit numai de serviciul intern, nu de un endpoint public.
- `shop_inventory_movements`: registrul existent, extins cu `NIR_IN`, gestiune, linie, lot, cantitate contabilă și cost.
- `shop_legacy_supplier_codes`: coduri istorice pentru care proiectul nu deține un `supplier_id` sigur.
- `shop_domain_audit`, `shop_domain_outbox`, `shop_nir_idempotency`: audit, evenimente post-commit și protecția retry-urilor.

NIR-urile confirmate și loturile sunt sursa istorică. `shop_products.cost_price` și câmpurile `last_confirmed_*` sunt doar valori derivate pentru afișare rapidă.

## Codurile furnizorului

Cheia este `supplier_id + supplier_product_code_normalized`, nu codul global. `shopNirNormalizeSupplierCode()` face trim, Unicode NFKC, compactează whitespace și uppercase. Nu elimină `-`, `/`, `.`, zerourile inițiale sau alte semne semnificative; textul original se păstrează separat.

Un cod identic este valid la doi furnizori diferiți. La același furnizor, tentativa de a lega același cod de alt StockItem returnează HTTP 409 și asocierea existentă; nu există suprascriere silențioasă. Codurile vechi fără furnizor nu primesc un furnizor inventat.

Potrivirea sigură rulează pe backend: cod exact în contextul furnizorului, apoi EAN exact și unic. Căutarea semantică existentă a catalogului este folosită pentru sugestii/manual; o asemănare de nume nu confirmă automat asocierea. Salvarea manuală creează o referință permanentă, vizibilă imediat pe mobil și desktop.

## Ciclul NIR

Statusuri: `draft`, `confirmed`, `reversed`, plus document separat de reversare. O ciornă poate fi creată, importată, editată și autosalvată, dar nu produce mișcări, loturi sau modificări de stoc.

Antetul cere furnizor, gestiune, număr/data facturii, data NIR și data recepției. Pentru RON cursul este fixat la `1`; pentru valută sunt obligatorii cursul pozitiv și data cursului. Aceste valori rămân snapshot pe document și sunt incluse în PDF/XLSX.

La confirmare, serverul:

1. verifică autentificarea, permisiunea, cheia de idempotency și `row_version`;
2. blochează documentul și liniile în tranzacție;
3. recalculează cantități, discount, TVA, conversie RON și cost FIFO cu zecimale scalate, fără `float` ca sursă contabilă;
4. validează furnizorul, gestiunea, factura, datele, moneda/cursul, liniile, diferențele, asocierile și duplicatul;
5. rezervă numărul definitiv;
6. creează o mișcare `NIR_IN` și un lot distinct pentru fiecare linie acceptată;
7. actualizează Stocuri Conta și valorile derivate de ultim preț;
8. marchează documentul read-only, scrie audit/outbox și face commit;
9. răspunsul este memorat pentru același idempotency key.

Orice eroare înainte de commit anulează întregul flux. Indexurile unice pe linia NIR protejează suplimentar mișcările și loturile duplicate.

## Cost, TVA și valută

Toate valorile sunt stocate separat: brut înainte de discount, discount, net, TVA, total, echivalent RON, cost suplimentar alocat și costul lotului. Precizia este 4 zecimale pentru cantitate, 6 pentru preț/cost, 8 pentru curs și 2 pentru totaluri.

Formula implicită pentru o companie care deduce TVA:

`InventoryCostTotalRON = NetAfterDiscountRON + AllocatedAdditionalCostsRON`

`InventoryUnitCostRON = InventoryCostTotalRON / (AcceptedQuantity × ConversionFactor)`

Setarea centrală `include_vat_in_inventory_cost` poate include TVA nedeductibil în cost. UI-ul nu decide politica.

Pe fiecare poziție, backend-ul compară informativ prețul net curent în RON cu ultima achiziție la același furnizor, ultima achiziție indiferent de furnizor și minimul ultimelor 365 de zile. Pragul de avertizare este setarea centrală `price_variance_warning_percent`; prețul facturii nu este modificat și diferența nu blochează automat confirmarea.

## FIFO și reconciliere

Ordinea este deterministă: `reception_date`, `created_at` (confirmare/creare), apoi `id`. Preview-ul este read-only. Exemplul de acceptanță 10 × 50 RON plus 2 × 60 RON returnează exact 620 RON și nu modifică `remaining_quantity`.

Raportul „Stoc existent fără cost FIFO” compară Stocuri Conta cu suma loturilor deschise. Nu generează loturi la cost zero. Soldul inițial cere produs, gestiune, cantitate reală, dată, cost unitar real și document/observație și creează un lot `OPENING_BALANCE` auditat.

Reversarea este permisă numai dacă loturile NIR-ului sunt complet neconsumate. Creează document și mișcări inverse, scade Stocuri Conta și marchează loturile reversate. Dacă un lot a fost consumat, operația se oprește cu: „O parte din acest lot a fost deja consumată. Este necesar un document de corecție.”

## Import și export

Backend-ul validează extensia, MIME, dimensiunea maximă de 15 MB, hash-ul SHA-256 și generează nume de stocare. Sunt acceptate PDF, JPG, PNG, WebP, XLSX și XML. XLSX/XML sunt parsate structurat. PDF/imaginile rămân atașate și permit completare manuală dacă nu există provider OCR; nu sunt fabricate rezultate.

Desktopul oferă file picker/drag area, iar mobilul oferă cameră, galerie și file picker. Exporturile sunt PDF și OOXML `.xlsx` reale, nu depind de extensia opțională PHP ZipArchive și includ data NIR, data recepției, moneda, cursul și data cursului.

## Permisiuni

`NIR_VIEW`, `NIR_CREATE`, `NIR_EDIT_DRAFT`, `NIR_CONFIRM`, `NIR_REVERSE`, `NIR_EXPORT`, `NIR_VIEW_COSTS`, `SUPPLIER_CREATE`, `SUPPLIER_PRODUCT_REFERENCE_MANAGE`, `FIFO_VIEW`, `FIFO_OPENING_BALANCE_MANAGE`.

Administratorul are toate permisiunile. Managerul nu poate reversa NIR-uri și nu poate crea sold inițial. Utilizatorul standard are doar vizualizare. Costurile sunt eliminate din DTO-urile API pentru rolurile fără `NIR_VIEW_COSTS`, nu doar ascunse în UI.

## Acțiuni API

API-ul păstrează convenția existentă `api.php?action=...`:

- furnizori: `searchSuppliers`, `checkSupplierCui`, `getSupplier`, CRUD-ul existent;
- asocieri: `resolveSupplierProductReference`, `createSupplierProductReference`, `updateSupplierProductReference`, `listProductSupplierReferences`, `listSupplierProducts`;
- NIR: `listNirs`, `getNir`, `createNir`, `updateNir`, `autosaveNir`, `validateNir`, `confirmNir`, `reverseNir`;
- documente: `uploadNirAttachment`, `extractNirAttachment`, `exportNir` (`format=pdf|xlsx`);
- trasabilitate: `getNirMovements`, `getNirFifoLayers`, `getNirAudit`;
- produs: `getProductPurchaseHistory`, `getProductFifoLayers`, `previewProductFifo`;
- administrare: `nirPermissions`, `listWarehouses`, `getNirSettings`, `getFifoReconciliation`, `createFifoOpeningBalance`.

Confirmarea trimite și `Idempotency-Key`. Nu există endpoint public de consum FIFO.

## Sincronizare, concurență și offline

Mutările sunt urmate de refetch; datele sunt comune ambelor aplicații. `row_version` produce conflict 409 când un document sau cod a fost modificat pe alt dispozitiv. Ciorna mobilă este păstrată temporar în SecureStore și sincronizată cu serverul; confirmarea este exclusiv online. Nu se creează mișcări locale offline.

Evenimentele `NirConfirmed`, `InventoryCostLayerCreated` și evenimentele de referință sunt scrise în outbox după operațiile de domeniu și pot fi publicate de infrastructura viitoare.

## Build și teste

```text
C:\xampp\php\php.exe -l shop-api\api.php
C:\xampp\php\php.exe -l shop-api\nir-domain.php
C:\xampp\php\php.exe -l shop-api\nir-service.php
C:\xampp\php\php.exe shop-api\tests\nir_domain_test.php
C:\xampp\php\php.exe shop-api\tests\nir_contract_test.php
C:\xampp\php\php.exe shop-api\tests\nir_export_test.php
npm run typecheck
npm run lint
npm run build:web
node --check electron-app\renderer\js\shop-api.js
node --check electron-app\renderer\js\shop-commerce.js
```

Migrarea automată rulează la prima cerere către API; pentru rulare manuală se folosește fișierul SQL de mai sus. Pentru integrarea viitoare cu facturile emise vezi `docs/FIFO_FUTURE_INVOICE_INTEGRATION.md`.
