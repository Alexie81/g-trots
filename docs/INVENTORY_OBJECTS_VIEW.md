# Mijloace fixe și obiecte de inventar — gestiuni independente

Cerință finală: toate documentele existente în Mijloace fixe se transferă o singură dată în Obiecte de inventar. Nu se creează o oglindă și nu există sincronizare ulterioară între categorii.

- Transferul schimbă doar categoria documentului. ID-urile, pozițiile, cantitățile, valorile, documentele atașate și istoricul casărilor rămân intacte.
- Migrarea la versiunea de schemă `2026111901` acoperă și documentele introduse când interfața afișa aceeași gestiune în ambele categorii. Transferul și salvarea versiunii se fac în aceeași tranzacție, sub blocarea migrării. Nu se repetă după succes.
- Adăugările viitoare se înregistrează exclusiv în categoria aleasă. Editarea păstrează categoria documentului, inclusiv pentru clienții mai vechi.
- Ambele module permit adăugare, editare, ștergere, casare, consultarea fișei, gestionarea fișierelor, căutare, filtrare și paginare. Modificările dintr-o categorie nu afectează cealaltă categorie.
- Exporturile PDF, Excel și ZIP folosesc același design și întreaga gestiune selectată, indiferent de filtrele tabelului. Titlurile, numele foilor și fișierelor identifică gestiunea aleasă.
- Consumabile este o categorie independentă, la același nivel în meniu.

Migrarea producției se execută numai odată cu publicarea autorizată a API-ului, după backup. Modificările rămân locale până atunci.

Verificări: `shop-api/tests/inventory_objects_test.php` și `electron-app/scripts/qa-inventory-objects.cjs`.
