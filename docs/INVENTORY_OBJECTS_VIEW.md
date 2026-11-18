# Obiecte de inventar — regula de funcționare

Cerință clarificată la 18.11.2026: „Obiecte de inventar” este o vizualizare numai pentru consultare și export a înregistrărilor gestionate din „Mijloace fixe”.

- Adăugarea, editarea, ștergerea și casările se fac din Mijloace fixe.
- În Obiecte de inventar se afișează aceleași documente și poziții, inclusiv cele adăugate ulterior, cu aceleași ID-uri, valori, fișiere și casări. Nu se creează copii.
- Sunt disponibile tabelul, căutarea, filtrarea, paginarea și exportul. Nu există acțiuni de modificare sau fișe cu acțiuni de modificare în această vizualizare.
- Exporturile PDF, Excel și ZIP folosesc același generator și aceleași valori ca la Mijloace fixe, cu denumirea Obiecte de inventar. Exportul include întreaga gestiune, indiferent de filtrele tabelului.
- Coloana istorică `asset_category` nu mai separă înregistrările afișate. Se păstrează pentru compatibilitatea datelor, fără o nouă migrare sau rescriere a documentelor. Parametrul de vizualizare selectează titlurile exporturilor.
- Consumabile rămâne o categorie independentă în meniu.

Verificări: `shop-api/tests/inventory_objects_test.php` și `electron-app/scripts/qa-inventory-objects.cjs`.
