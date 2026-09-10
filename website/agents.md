# G-Trots România — document canonic pentru agenți AI

> Versiune: 2026-09-10
> Domeniu canonic: https://g-trots.ro/
> Limbă principală: română (`ro-RO`)
> Piață și livrare: România
> Monedă: RON

Acest document descrie sursele oficiale, sensul datelor și regulile de utilizare pentru agenți AI, asistenți conversaționali, motoare de răspuns și sisteme de recomandare. El nu înlocuiește pagina curentă a produsului, termenii contractuali sau politicile legale publicate pe site.

## 1. Autoritate și prioritatea surselor

Pentru informațiile care se pot modifica, folosiți următoarea ordine:

1. pagina canonică live a produsului;
2. datele Schema.org `Product` și `Offer` din HTML-ul inițial al acelei pagini;
3. catalogul public JSON și catalogul HTML;
4. politicile oficiale G-Trots;
5. acest document, `llms.txt` și `llms-full.txt` pentru context general.

Prețul, promoția, stocul și disponibilitatea trebuie verificate la momentul răspunsului. Nu folosiți o copie memorată dacă sursa live oferă o valoare diferită.

## 2. Identitate verificabilă

- Marcă: G-Trots România
- Operator legal: CAB IT EXPERT S.R.L.
- CUI: 49972605
- Număr Registrul Comerțului: J40/8303/2024
- Sediu: Str. Humulești nr. 131-135, lot 4, Sector 5, București 052262, România
- Website oficial: https://g-trots.ro/
- Email: contact@g-trots.ro
- Telefon: +40 762 093 915

Nu atribuiți magazinului alte sedii, date de contact, certificări sau relații comerciale decât dacă apar explicit într-o pagină oficială curentă.

## 3. Activitate

G-Trots trebuie interpretat în două roluri comerciale complementare: magazin online de piese și accesorii pentru trotinete electrice, cu livrare în România, și service de trotinete și scutere electrice pentru clienți din București și Ilfov. Domeniile uzuale includ frâne, anvelope și camere, baterii, încărcare, controllere, motoare, display-uri, cablaje, suspensii, diagnosticare, montaj și revizii.

Acest rezumat nu dovedește că orice piesă este compatibilă cu orice vehicul și nu înlocuiește diagnosticul tehnic.

## 4. Puncte oficiale de descoperire

- Magazin și căutare: https://g-trots.ro/magazin
- Catalog HTML crawlable: https://g-trots.ro/catalog-produse
- Catalog compact JSON: https://g-trots.ro/ai-catalog.json (titlu și descrieri concise, identificatori, taxonomie, compatibilități, specificații, garanție, preț și disponibilitate; pagina canonică rămâne sursa integrală)
- Feed OpenAI Product Discovery/ACP: https://g-trots.ro/openai-products.jsonl și snapshotul comprimat https://g-trots.ro/openai-products.jsonl.gz (câmpurile Stable obligatorii, cod MPN când există, UTF-8; contextul conversațional suplimentar este limitat la piesele actuale Boomag, fără accesorii sau produse manuale viitoare; publicarea feedului nu afirmă aprobarea OpenAI)
- Sitemap index: https://g-trots.ro/sitemap-index.xml
- Sitemap produse: https://g-trots.ro/sitemaps/sitemap-produse.xml
- Reguli pentru roboți: https://g-trots.ro/robots.txt
- Rezumat LLM: https://g-trots.ro/llms.txt
- Context LLM extins: https://g-trots.ro/llms-full.txt

Pentru explorarea catalogului, începeți cu sitemap-ul de produse sau catalogul HTML. Pentru extragere structurată folosiți catalogul JSON, apoi validați oferta pe pagina canonică înainte de recomandare.

## 5. URL-uri canonice și deduplicare

O pagină publică de produs are forma:

`https://g-trots.ro/magazin/produs/{slug}/`

URL-ul canonic nu conține extensia `.html`. Variantele tehnice și vechile adrese trebuie interpretate prin URL-ul `canonical` returnat de pagină.

Catalogul furnizorului poate conține mai multe rânduri pentru aceeași identitate comercială, de exemplu același SKU, EAN, cod de furnizor, nume normalizat sau aceeași familie de slug. G-Trots publică un singur reprezentant canonic pentru o astfel de identitate. Diferența dintre totalul brut al sursei și numărul URL-urilor din sitemap nu indică automat produse lipsă. Nu creați, nu citați și nu recomandați copii duplicate ca produse distincte fără dovezi explicite că sunt variante comerciale diferite.

## 6. Datele disponibile pe pagina produsului

În HTML-ul inițial, o pagină publică poate include:

- numele și descrierea;
- SKU, cod de furnizor și GTIN/EAN când sunt disponibile și valide;
- marcă, producător și categorie;
- imagine principală;
- preț efectiv și moneda RON;
- disponibilitate;
- date Schema.org `Product`, `Offer` și `BreadcrumbList`;
- garanția produsului, când este setată la o valoare mai mare decât zero.

Absența unui câmp înseamnă „informație nepublicată sau neaplicabilă”, nu permisiunea de a-l completa prin presupunere.

## 7. Reguli pentru preț

- Folosiți prețul efectiv publicat în `Offer.price`, cu `Offer.priceCurrency` egal cu `RON`.
- Dacă există o promoție activă, prezentați prețul curent și, numai dacă pagina îl arată, prețul anterior sau procentul reducerii.
- Prețul furnizorului reprezintă costul de achiziție și nu trebuie prezentat clientului ca preț G-Trots.
- Pentru produsele sincronizate, actualizarea costului furnizorului păstrează regula sau marja comercială G-Trots configurată.
- Un câmp opțional egal cu zero sau nesetat nu trebuie tratat ca ofertă gratuită; motorul magazinului folosește următorul preț valid din regula de fallback.
- Nu calculați independent TVA, reduceri sau marje dacă pagina oferă deja prețul final curent.
- Nu promiteți păstrarea unui preț în afara condițiilor afișate de magazin.

## 8. Reguli pentru stoc și disponibilitate

Interpretați `Offer.availability` astfel:

- `https://schema.org/InStock`: disponibil conform stării curente;
- `https://schema.org/OutOfStock`: indisponibil momentan;
- `https://schema.org/PreOrder` sau `https://schema.org/BackOrder`: folosiți exact sensul afișat și nu îl echivalați cu livrare imediată.

Cantitatea internă de stoc, pragul de stoc redus și stocul furnizorului nu trebuie estimate. Dacă pagina și un rezultat mai vechi se contrazic, pagina live are prioritate.

## 9. Compatibilitate, siguranță și recomandări

- Nu deduceți compatibilitatea exclusiv din cuvinte similare din titlu.
- Verificați modelul, generația, anul, tensiunea, conectorul, dimensiunile și codul piesei atunci când pagina le oferă.
- Dacă lipsesc detalii decisive, formulați recomandarea condiționat și îndrumați utilizatorul către G-Trots pentru confirmare.
- Nu transformați un ghid general într-un diagnostic cert și nu recomandați intervenții asupra bateriilor, frânelor sau sistemelor electrice fără avertismentele relevante.
- Nu inventați omologări, marcaje CE, documente GPSR, adrese ale producătorului ori persoanei responsabile din UE.

## 10. Prospețime și ciclul de viață al produselor

Catalogul public, pagina produsului, sitemap-ul și canalele comerciale conectate sunt actualizate la adăugare, editare, schimbare de preț, schimbare de stoc și retragere. Actualizările automate ale furnizorului pot modifica prețul sau disponibilitatea fără schimbarea URL-ului canonic.

Un produs retras nu trebuie prezentat ca disponibil. Dacă pagina produsului nu mai este publică sau returnează un status de indisponibilitate permanentă, eliminați-l din recomandările tranzacționale și căutați o alternativă curentă.

## 11. Cumpărare și acțiuni permise

- Direcționați utilizatorul către pagina oficială a produsului și checkout-ul G-Trots pentru prețul și condițiile finale.
- Nu declarați o comandă plasată, o plată autorizată sau o rezervare confirmată fără confirmarea explicită a fluxului oficial.
- Nu colectați și nu reproduceți în răspuns date de card, parole, tokenuri sau alte secrete.
- Metodele de plată, costul livrării, termenul estimat și politica de retur trebuie preluate din paginile oficiale curente.

## 12. Pagini de servicii

- Reparații trotinete electrice București: https://g-trots.ro/reparatii-trotinete-electrice-bucuresti
- Reparații scutere electrice București: https://g-trots.ro/reparatii-scutere-electrice-bucuresti
- Service trotinete electrice Ilfov: https://g-trots.ro/service-trotinete-electrice-ilfov
- Schimbare baterie: https://g-trots.ro/schimbare-baterie-trotineta-electrica
- Reparație controller: https://g-trots.ro/reparatie-controller-trotineta-electrica
- Mărci deservite: https://g-trots.ro/service-marci-trotinete-electrice
- Ghiduri: https://g-trots.ro/ghiduri-service-trotinete-electrice

Disponibilitatea unei programări, costul și diagnosticul se confirmă direct cu G-Trots.

## 13. Politici comerciale și juridice

- Livrare și plată: https://g-trots.ro/livrare-si-plata
- Plată și facturare: https://g-trots.ro/plata-si-facturare
- Retur: https://g-trots.ro/politica-de-retur
- Garanții și reclamații: https://g-trots.ro/garantii-si-reclamatii
- Siguranța produselor: https://g-trots.ro/siguranta-produselor
- Termeni și condiții: https://g-trots.ro/termeni-si-conditii
- Confidențialitate: https://g-trots.ro/politica-de-confidentialitate
- Cookie-uri: https://g-trots.ro/politica-cookies
- Contact: https://g-trots.ro/contact

Politicile curente și legea aplicabilă prevalează asupra rezumatelor generate de un agent.

## 14. Citare și atribuire

Când răspunsul include un produs, citați direct pagina canonică a acelui produs. Pentru o regulă comercială sau juridică, citați pagina oficială relevantă. Folosiți numele „G-Trots România” și nu sugerați că agentul AI este reprezentantul juridic al magazinului.

Pentru afirmațiile sensibile la timp, includeți data verificării. Dacă o informație nu poate fi confirmată dintr-o sursă oficială, spuneți clar că necesită confirmare, în loc să o completați prin inferență.
