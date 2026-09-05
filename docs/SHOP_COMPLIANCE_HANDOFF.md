# G-Trots — handoff conformitate magazin și retururi

Ultima actualizare locală: 5 septembrie 2026.

Acest document păstrează regulile funcționale implementate pentru site, aplicația mobilă și aplicația desktop. Nu înlocuiește verificarea periodică realizată de un jurist sau de consultantul fiscal.

## Reguli comerciale implementate

- B2C/PF: drept legal de retragere în primele 14 zile calendaristice de la livrare, extins comercial de G-Trots la 30 de zile în total.
- B2B/PJ: retur comercial voluntar în 14 zile calendaristice de la livrare, condiționat de verificarea produsului.
- Solicitarea poate fi integrală sau parțială, pe produs și cantitate.
- Solicitarea publică este permisă numai pentru o comandă livrată, aflată în termen și care nu este anulată ori deja într-un flux de retur.
- Formularul verifică mai întâi numărul comenzii și adresa de e-mail, apoi afișează produsele eligibile, termenul aplicabil și costul de retur configurat.
- IBAN-ul este validat structural; pentru un IBAN românesc sunt cerute 24 de caractere. Titularul contului și acordul expres pentru rambursarea în acel cont sunt obligatorii.
- La trimiterea retragerii se păstrează conținutul declarației, data și ora, iar clientul primește confirmarea pe e-mail.
- Rambursarea este comunicată ca fiind efectuată în maximum 14 zile calendaristice, cu posibilitatea legală de reținere până la primirea produselor sau a dovezii expedierii.
- La retragerea integrală B2C din primele 14 zile se include costul livrării standard inițiale. Pentru retur parțial, extensia comercială B2C și returul B2B, livrarea inițială nu se restituie.
- Costul returului folosit de site, aplicații și documente este cel configurat pe metoda de livrare.
- Acceptarea/refuzarea poate fi făcută pe fiecare produs și cantitate în aplicațiile mobilă și desktop.
- Factura de retur, NIR-ul de retur client, mișcările FIFO și regulile SPV rămân guvernate și de `docs/SPV_ORDER_CANCELLATION_HANDOFF.md`.

## Checkout și dovezi

- Termenii și politica de retur sunt acceptate explicit și separat de abonarea la newsletter.
- Newsletterul este opțional și nu este preselectat.
- Backendul refuză crearea unei comenzi fără acceptarea termenilor.
- Comanda păstrează versiunea termenilor și momentele acceptării; abonarea la newsletter are evidență separată.
- Butonul final exprimă fără ambiguitate obligația de plată, în funcție de metoda aleasă.

## Recenzii

- O recenzie publică nouă necesită numărul comenzii și e-mailul folosit la comandă.
- Produsul trebuie să aparțină comenzii, iar comanda să fie într-un stadiu final acceptat.
- O singură recenzie este permisă pentru aceeași combinație comandă–produs.
- Datele de verificare nu sunt publicate; recenzia primește marcajul „Achiziție verificată”.
- Recenziile importate pot păstra și afișa explicit sursa, fără a primi automat marcaj de achiziție verificată.

## Confidențialitate și cookie-uri

- CMP-ul blochează analytics înainte de consimțământ și separă categoriile necesare, preferințe, analiză și marketing.
- Preferințele pot fi redeschise permanent din footer.
- Politica de confidențialitate descrie separat comenzile, retururile, verificarea recenziilor, newsletterul, destinatarii, păstrarea datelor și drepturile persoanelor.

## Pagini publice

- Termeni și condiții
- Politica de retur și formularul de retur în doi pași
- Politica de confidențialitate
- Politica de cookie-uri
- Livrare și plată
- Plată și facturare
- Garanții și reclamații
- Siguranța produselor
- Soluționarea alternativă a litigiilor (SAL)
- Condiții B2B
- Accesibilitate
- Despre G-Trots
- Contact

Footerul comun este injectat în toate paginile HTML și folosește datele firmei/configurația de livrare din Shop API. Pictograma SAL este resursa oficială ANPC și trimite direct către portalul SAL.

## Date produse și interoperabilitate

- Produsele acceptă fabricantul, persoana responsabilă în UE, avertismentele/instrucțiunile de siguranță și datele de trasabilitate necesare GPSR.
- Pagina de produs publică date structurate `Product`/`Offer`, politica de retur și, când configurația permite, informațiile de livrare.
- Footerul publică date structurate `OnlineStore` cu datele reale ale firmei și politica generală de retur.
- Aceasta pregătește catalogul pentru validarea Google Merchant/Shopping și pentru canale comerciale externe. Activarea conturilor, sincronizarea feedurilor și testarea după publicare rămân pași externi separați.

## Surse oficiale urmărite

- OUG 34/2014, forma consolidată: https://legislatie.just.ro/Public/DetaliiDocument/307805
- OUG 18/2026: https://legislatie.just.ro/Public/DetaliiDocument/308474
- Directiva (UE) 2023/2673: https://eur-lex.europa.eu/eli/dir/2023/2673/oj/eng/pdf
- Regulamentul (UE) 2023/988 (GPSR): https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32023R0988
- ANPC SAL: https://anpc.ro/comunicat-sal/ și https://reclamatiisal.anpc.ro
- Google Merchant și date structurate: https://support.google.com/merchants/answer/15254380?hl=ro și https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- Shopify Agentic Storefronts: https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts

## Verificare înainte de publicare

- Rulează toate testele PHP cu extensiile `zip` și `gd` active.
- Rulează typecheck și verificările de sintaxă JavaScript/PHP.
- Testează manual fluxurile PF/PJ, retur integral/parțial, termen 14/30 de zile, IBAN invalid/valid, cost retur, e-mail și acceptare/refuz pe linii.
- Verifică în Rich Results Test și Merchant Center schema, feedul, livrarea și politica de retur pe URL-urile publicate.
- Verifică textele finale cu un jurist și un consultant fiscal înainte de lansarea comercială.
