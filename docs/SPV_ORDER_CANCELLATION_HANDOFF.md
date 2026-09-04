# Anularea comenzilor și integrarea SPV

Document persistent pentru continuarea lucrului în conversații viitoare.

## Reguli implementate

- Clientul poate anula din linkul discret roșu din e-mail sau din pagina de urmărire numai când statusul este `new`, `confirmed` ori `processing`.
- De la `shipped` (Predată curierului) încolo, controlul este ascuns și API-ul refuză anularea.
- Anularea manuală din aplicația mobilă și desktop folosește exact același serviciu, cere motiv obligatoriu și este permisă inclusiv după predarea către curier sau după livrare. O comandă deja anulată ori rambursată nu se procesează din nou.
- Fără factură emisă: nu se creează nicio factură.
- Ultima factură din sistem, netrimisă în SPV: se șterge în siguranță și numărul devine reutilizabil.
- Factură trimisă în SPV sau factură netrimisă care nu mai este ultima: se emite o factură de retur integrală.
- Factura de retur folosește seria activă a facturilor obișnuite și următorul număr din aceeași secvență. Nu există serie sau numerotare separată pentru retururi.
- Documentul de retur indică explicit factura fiscală inițială și codul comenzii.
- Plata cu cardul este marcată pentru rambursare în maximum 15 zile calendaristice, în aceeași metodă de plată. Plata ramburs nu creează o obligație de restituire.
- Fluxul administrativ de retur este `Livrată` → `Retur solicitat` → opțional `Retur refuzat` → `Retur confirmat` → `Rambursată`. Operatorul poate sări peste `Retur refuzat` și poate reveni ulterior din refuz la confirmare.
- În aplicațiile de administrare, toate statusurile rămân selectabile. Operatorul poate sări direct la `Retur confirmat` sau `Rambursată`; dacă returul nu are încă date, aplicația cere motivul, titularul și IBAN-ul, iar API-ul execută intern și idempotent etapele intermediare. Restricția `doar după Livrată` rămâne exclusiv pentru clientul din pagina publică.
- După `Livrată`, clientul poate solicita returul din pagina de urmărire sau din linkul discret inclus în e-mailul de livrare. Motivul, IBAN-ul și titularul contului sunt obligatorii.
- Costul returului este configurat separat pentru fiecare metodă în modulul `Livrări`, pe mobil și desktop. La solicitare se salvează un instantaneu al costului și estimarea `total comandă - cost retur`, astfel încât modificările ulterioare ale tarifului să nu schimbe cererea existentă.
- Solicitarea clientului trimite automat e-mailul dedicat „Am primit solicitarea ta de retur”. Pentru solicitarea înregistrată manual, operatorul decide dacă îl trimite. În această etapă nu se modifică factura, stocul ori plata.
- `Retur solicitat`, `Retur refuzat` și `Retur confirmat` există în aplicațiile mobile și desktop. Pentru client nu apar niciodată ca pași viitori în timeline-ul principal; fiecare devine vizibil numai cât este statusul curent, într-o stare separată.

## Puncte de recepție NIR

- Punctele de recepție se administrează din `Datele firmei`, atât pe telefon, cât și pe desktop: adăugare, editare, ștergere și alegerea punctului implicit.
- La prima migrare se creează automat punctul implicit `Gestiune principală`.
- NIR-ul păstrează separat gestiunea contabilă și locul fizic al recepției. La salvare, denumirea și adresa punctului sunt copiate în document, astfel încât NIR-urile istorice nu se schimbă dacă punctul este redenumit sau șters ulterior.
- Doar documentele confirmate au efect contabil: NIR-ul pozitiv adaugă stoc și cost FIFO, factura pozitivă scade stocul, iar factura de retur creează o singură intrare în stoc la costul FIFO inițial. Ciornele și simpla schimbare a punctului de recepție nu modifică stocul sau statisticile.
- Dashboardul este calculat din documente: facturile pozitive formează vânzarea brută, facturile de retur sunt afișate separat și se scad o singură dată pentru vânzarea netă, `Achiziții` provine din NIR-urile de furnizor minus storno-urile lor, iar costul și profitul folosesc mișcările FIFO `sale`/`RETURN_IN`, nu prețul curent din catalog. NIR-urile de retur client nu sunt numărate ca achiziții.
- Telefonul și desktopul afișează numărul și valoarea totală a facturilor de retur și oferă filtrul agregat `Returnate`, care include comenzile în `Retur confirmat` și `Rambursată`.
- Când pagina publică este deja într-un status de retur sau `Rambursată`, toate cele cinci etape principale până la `Livrată` sunt afișate ca finalizate chiar dacă o etapă intermediară nu are o intrare separată în istoric; nu se mai afișează eronat `Urmează`.
- La trecerea în `Retur confirmat`, operatorul decide dacă trimite e-mailul dedicat de confirmare a returului. Dacă există o factură pozitivă pentru comandă, se emite automat și idempotent factura de retur, se trimite automat PDF-ul ei clientului și se pune documentul în coada SPV. Dacă nu există factură pozitivă, confirmarea nu creează niciun document fiscal.
- Dacă factura pozitivă este emisă manual după ce returul a ajuns deja în `Retur confirmat`, aceeași acțiune completează perechea: factura pozitivă plus factura de retur. Dialogul are două comutatoare independente pentru e-mail (factura pozitivă / factura de retur), deci operatorul poate trimite niciuna, una singură sau ambele. În `Retur solicitat` se poate emite doar factura pozitivă. În `Rambursată` și `Anulată`, emiterea unei facturi pozitive este refuzată de API.
- Factura de retur păstrează explicit în payload și în exporturile PDF/XLSX/XML atât referința facturii pozitive, cât și codul comenzii. În fișa comenzii din aplicația mobilă și desktop, factura de retur apare sub factura pozitivă pentru statusurile de retur, iar datele cererii (motiv, titular, IBAN, cost și estimare) rămân vizibile.
- Emiterea facturii de retur este considerată momentul recepției fizice a produselor. În aceeași tranzacție se generează automat și idempotent documentul distinct `Intrare în stoc – Retur client`, în registrul NIR, iar acesta readaugă cantitățile în stoc și reface exact consumurile FIFO ale facturii pozitive la costurile contabile inițiale.
- Factura de retur este document fiscal și nu este ea însăși sursa mișcării de stoc; mișcarea `RETURN_IN` este legată de documentul NIR de tip `customer_return`, de poziția lui, de factura pozitivă, de factura de retur și de comandă.
- Fără factură de retur nu se generează document de recepție și nu se adaugă nimic în stoc. Schimbarea statusului în `Rambursată` nu produce nicio mișcare de stoc; ea finalizează numai fluxul și plata. Acest lucru evită o intrare eronată când comanda nu a avut factură pozitivă și stocul nu fusese scăzut fiscal.
- În registrul NIR, aplicațiile etichetează explicit tipul operațiunii: `RECEPȚIE FURNIZOR`, `RETUR CLIENT` și `RETUR CĂTRE FURNIZOR`. Documentele automate de retur client sunt blocate la corectare/stornare manuală și includ clientul, comanda, factura fiscală pozitivă, factura de retur, motivul, cantitățile și costurile FIFO.
- PDF-ul și Excel-ul unui retur client păstrează titlul oficial `NOTĂ DE RECEPȚIE ȘI CONSTATARE DE DIFERENȚE`, cu subtitlul discret `(Intrare în stoc – retur client)`.
- Identitatea afișată pe comandă este stabilită de opțiunea aleasă la checkout, nu de tipul contului autentificat: pentru PJ se afișează denumirea firmei ca nume principal și separat persoana de contact; pentru PF se afișează numele persoanei, chiar dacă acel cont are și date de firmă.

## Situația SPV

- Integrarea este implementată server-side și pornește implicit în mediul ANAF `Test`. Trecerea în `Producție` este o alegere explicită din interfață; aplicația nu o activează singură.
- Conectarea folosește OAuth 2.0 Authorization Code și certificatul digital în pagina ANAF. Se face o singură dată pentru firmă; tokenurile sunt păstrate criptat exclusiv pe server, astfel încât funcțiile SPV sunt disponibile ulterior și din aplicația mobilă, și din cea desktop.
- Tokenul de acces este reîmprospătat automat cu refresh tokenul. Duratele oficiale sunt 90 de zile pentru access token și 365 de zile pentru refresh token; aplicația nu poate prelungi unilateral aceste durate.
- Cât timp firma nu este conectată, interfața afișează numai acțiunea de conectare, iar automatizările sunt ascunse. Facturile din coadă rămân `awaiting_configuration` și nu sunt raportate ca trimise.
- Facturile normale folosesc UBL `Invoice`, cod `380`, și validatorul oficial ANAF `FACT1`. Facturile de retur folosesc UBL `CreditNote`, cod `381`, `BillingReference` către factura pozitivă și validatorul oficial `FCN`.
- Regulile de trimitere sunt separate pentru facturile pozitive și cele de retur: `manual`, `la emitere` sau după 1–5 zile lucrătoare. Întârzierea este calculată exclusiv la nivel de dată, fără ora emiterii: în ziua scadentă documentele sunt preluate la prima activitate a aplicației, indiferent dacă aceasta are loc dimineața sau seara. Lotul scadent este transmis strict după data și ora emiterii, cu identificatorul drept ultim criteriu stabil de departajare. Termenul legal urmărit de alerte este de 5 zile lucrătoare de la emitere; calculul exclude weekendurile și sărbătorile legale din România.
- Butonul manual de trimitere rămâne disponibil indiferent de automatizarea aleasă. După trimitere, factura trece prin stările `în procesare`, `trimisă`, `respinsă` sau `eroare`; pentru `trimisă`, butonul devine verde și dezactivat.
- Workerul este idempotent: încarcă XML-ul o singură dată, păstrează identificatorul ANAF, citește repetat `stareMesaj`, reîncearcă doar erorile temporare și nu dublează documentele. Regulile curente recalculează și intrările vechi netrimise din coadă, inclusiv facturile de retur existente.
- Notificările din modulul Shop includ comenzile noi, anulările, solicitările de retur și avertizările/erorile/respingerea SPV. Sunt vizibile în ambele aplicații.
- Procesarea oportunistă rulează după cererile autentificate către API. Pentru respectarea exactă a trimiterilor programate chiar și când aplicațiile nu sunt deschise, hostingul trebuie să ruleze `shop-api/spv-cron.php` prin PHP CLI la fiecare minut.
- Testele automate acoperă OAuth, criptarea tokenurilor, refresh, încărcarea XML, citirea statusului acceptat/respins, retry, workerul automat și deconectarea. Factura `Invoice 380` și factura de retur `CreditNote 381` au fost acceptate de validatorul oficial ANAF. Încărcarea și citirea unui mesaj real din mediul ANAF Test se verifică după prima conectare cu certificatul.

Nu se șterge niciodată o factură deja trimisă în SPV. Nici factura de retur cu referință validă nu este eligibilă pentru ștergere, chiar dacă este ultima din secvență și încă nu a fost trimisă.
