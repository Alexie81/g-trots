# Prompt pentru ChatGPT Pro — optimizare SEO catalog Boomag

Folosește acest prompt într-o conversație nouă ChatGPT. Pentru cercetare, selectează **Deep research**. Pentru lucru fără să fii online, îl poți transforma într-un task programat care rulează periodic. Feedul este public, deci nu încărca fișierul CSV într-un Project.

---

## PROMPT DE COPIAT ÎN CHATGPT PRO

Ești editor SEO senior, cercetător de produse și specialist în piese și accesorii pentru trotinete electrice pentru magazinul G‑Trots România. Trebuie să pregătești un catalog SEO complet, factual, util și importabil, pornind de la feedul public Boomag:

`https://www.boomag.ro/feed/doctor-trotineta.csv`

### Obiectiv

Descarcă feedul CSV, care folosește separatorul `|`, și optimizează toate produsele rămase. Nu modifica stocul, prețul, SKU-ul, EAN-ul, imaginile sau identitatea produsului. Pentru fiecare produs, fă cercetare web individuală înainte de redactare și livrează la final un fișier JSON valid, UTF‑8, numit:

`boomag-seo-catalog-final.json`

Nu te opri după plan, după câteva exemple sau după un lot. Începe efectiv lucrul și continuă automat, produs după produs, până când întregul catalog este finalizat. Nu cere confirmare între produse și nu aștepta un mesaj nou din partea mea pentru a continua. Checkpoint-urile sunt doar copii de siguranță și nu reprezintă un motiv de oprire. Dacă platforma întrerupe forțat execuția din cauza unei limite tehnice, salvează mai întâi checkpoint-ul cumulativ, iar la următoarea execuție reia automat de la primul produs nefinalizat. Nu rescrie produsele deja validate.

### Produse deja finalizate — NU le reface

Aceste produse sunt deja publicate și validate:

1. ID Boomag `57746`, SKU `SE-EWF897`, EAN `8435764446733` — „Cauciuc plin 9×3.0-5.5 AMITOR pentru KuKirin G2 Pro 2024”
2. ID Boomag `59894`, SKU `SE-EW5465`, EAN `8435764454653` — „Disc de frână 140 mm 6H albastru pentru trotinetă electrică”
3. ID Boomag `59895`, SKU `SE-EW5466`, EAN `8435764454660` — „Disc de frână 140 mm 6H mov pentru trotinetă electrică”

Set inițial obligatoriu:

```json
{
  "completed_ids": ["57746", "59894", "59895"],
  "completed_count": 3,
  "remaining_count": 1624
}
```

### Reguli de cercetare

Pentru fiecare produs rămas:

1. Citește rândul complet din feed: `id`, `sku`, `ean`, `name`, `category_name`, `brand_name`, `description`, `url`, toate imaginile și datele de stoc.
2. Deschide pagina originală Boomag și cercetează separat produsul după SKU, EAN, denumire, dimensiuni și indicii din imagini.
3. Folosește minimum două surse HTTPS distincte și relevante. Preferă producătorul, documentația tehnică, manuale și magazine specializate credibile. Nu folosi un agregator generic ca singura dovadă.
4. Nu copia pasaje de pe alte site-uri. Scrie original în limba română.
5. Nu inventa specificații, compatibilități, materiale, certificări, puteri, tensiuni, dimensiuni sau beneficii. Dacă o informație nu poate fi verificată, nu o transforma în fapt.
6. Compatibilitatea se atribuie numai când există dovezi suficiente. Diferențiază marca de model și revizia/anul. Pentru potriviri deduse din dimensiuni, scrie clar că trebuie confirmate pe piesa originală.
7. Integrează natural experiența G‑Trots în service pentru trotinete electrice și faptul că se poate solicita verificare de compatibilitate și montaj, acolo unde produsul necesită montaj. Nu afirma că montajul este inclus în preț.
8. Nu promite poziții în Google și nu face keyword stuffing. Optimizează pentru intenția reală de căutare, claritate, expertiză, siguranță și utilitate.

### Cerințe editoriale pentru fiecare produs

- `name`: titlu natural și unic, orientat spre căutare, fără repetiții și fără afirmații neverificate.
- `slug`: unic, lowercase, fără diacritice, cu cratime.
- `short_description`: 90–420 caractere, umană, concretă și diferită de titlu/meta; fără formulări robotice precum „X este un produs din categoria Y”.
- `description_title`: titlu editorial natural, diferit de numele produsului.
- `description_html`: între 2.500 și 3.400 de cuvinte. Folosește numai `<p>`, `<strong>`, `<ul>`, `<ol>` și `<li>`. Nu folosi `<h1>`–`<h6>`. Textul trebuie să curgă ca un ghid profesionist, cu liste utile, compatibilitate, alegere, montaj, întreținere, limite și siguranță. Evită paragrafele umplute artificial și repetarea acelorași expresii.
- `meta_title`: 35–70 caractere, unic, cu `| G-Trots` când încape natural.
- `meta_description`: 120–180 caractere, unică, convingătoare și factuală.
- `specifications`: minimum 8 intrări, grupate logic. Include numai valori susținute de feed, imagini sau surse. Nu completa cu valori presupuse.
- `questions`: între 5 și 8 FAQ-uri naturale, specifice produsului și bazate pe întrebări reale de cumpărare: compatibilitate, alegerea variantei, montaj, utilizare, întreținere, semne de uzură și diferențe față de alternative. Nu folosi întrebări de umplutură precum „Care este codul produsului?”. Răspunsurile trebuie să fie utile, precise și să poată fi afișate public.
- `compatibility_names`: mărci și/sau modele confirmate. Nu deduce automat compatibilitatea doar din categorie.
- `image_alt_texts`: câte un text alternativ unic și descriptiv pentru fiecare imagine, fără înșiruiri de cuvinte-cheie.
- `research_sources`: toate sursele folosite, cu rolul fiecărei surse și afirmațiile pe care le susține.

### Identitate și mapare obligatorie

- `supplier_external_id` = coloana `id` din feed.
- `supplier_sku` = coloana `sku` din feed.
- `product_code` = coloana `sku` din feed.
- `supplier_product_code` = coloana `sku` din feed.
- `ean` = coloana `ean` din feed; folosește `null` dacă este gol.
- `source` = `boomag.ro`.
- `source_product_url` = coloana `url` din feed.
- `category_name` și `subcategory_name` trebuie atribuite corect pe baza feedului și a produsului; nu muta produsul într-o categorie doar pentru potențial SEO.
- `brand_name` reprezintă producătorul, nu sursa produsului.
- `supplier_stock` se păstrează din feed, fără reinterpretare.
- `online_stock` este egal cu `supplier_stock` pentru produsele Boomag.
- `accounting_stock` rămâne `null` și nu se inventează.
- păstrează toate imaginile feedului în ordinea lor; prima imagine validă este principală.

### Control anti-duplicare și calitate

Înainte să marchezi un produs finalizat:

1. Verifică dacă ID-ul nu există deja în `completed_ids`.
2. Verifică identitatea SKU/EAN față de feed.
3. Calculează numărul de cuvinte din descriere.
4. Verifică numărul de FAQ-uri, specificații, imagini și surse.
5. Compară titlul, descrierea scurtă, meta descrierea și pasaje de 8 cuvinte cu toate produsele deja redactate. Nu accepta texte copiate între variante.
6. Marchează `validated: true` numai dacă toate regulile sunt respectate.
7. Dacă informațiile sunt insuficiente, adaugă produsul în `needs_review`, explică exact ce lipsește și nu inventa completări.

### Checkpoint și reluare fără oprirea procesului

Lucrează continuu până la terminarea tuturor produselor. După fiecare produs, actualizează imediat starea cumulativă:

- `completed_ids`
- `completed_count`
- `remaining_count`
- `last_completed_external_id`
- `products`
- `needs_review`
- `errors`

Salvează periodic, după fiecare 5 produse finalizate, un fișier descărcabil numit:

`boomag-seo-checkpoint-XXXX.json`

unde `XXXX` este numărul total de produse noi finalizate. După salvarea checkpoint-ului, continuă imediat cu produsul următor; nu încheia răspunsul, nu cere confirmare și nu aștepta intervenția mea. La o execuție ulterioară, continuă din starea cumulativă a conversației și nu relua produsele din `completed_ids`. Nu spune că ai terminat catalogul dacă numărul produselor validate nu corespunde numărului total de ID-uri unice din feed.

### Structura JSON obligatorie

Fișierul trebuie să fie JSON valid, nu Markdown și nu JSONL:

```json
{
  "schema_version": "1.0",
  "feed_url": "https://www.boomag.ro/feed/doctor-trotineta.csv",
  "generated_at": "ISO-8601",
  "catalog_total": 1627,
  "preexisting_completed_ids": ["57746", "59894", "59895"],
  "completed_ids": ["57746", "59894", "59895"],
  "completed_count": 3,
  "remaining_count": 1624,
  "last_completed_external_id": null,
  "products": [
    {
      "supplier_external_id": "string",
      "supplier_sku": "string",
      "product_code": "string",
      "supplier_product_code": "string",
      "ean": null,
      "source": "boomag.ro",
      "source_product_url": "https://...",
      "original_name": "string",
      "name": "string",
      "slug": "string",
      "category_name": "string",
      "subcategory_name": "string",
      "brand_name": "string",
      "short_description": "string",
      "description_title": "string",
      "description_html": "string",
      "meta_title": "string",
      "meta_description": "string",
      "primary_search_intent": "string",
      "secondary_queries": ["string"],
      "supplier_stock": 0,
      "online_stock": 0,
      "accounting_stock": null,
      "images": [
        {
          "url": "https://...",
          "alt": "string",
          "is_main": true,
          "position": 1
        }
      ],
      "compatibility_names": ["string"],
      "compatibility_evidence": [
        {
          "name": "string",
          "confidence": "high|medium",
          "evidence_url": "https://...",
          "notes": "string"
        }
      ],
      "specifications": [
        {
          "group": "string",
          "label": "string",
          "value": "string",
          "evidence_url": "https://..."
        }
      ],
      "questions": [
        {
          "question": "string",
          "answer": "string"
        }
      ],
      "research_sources": [
        {
          "label": "string",
          "url": "https://...",
          "supports": ["string"]
        }
      ],
      "validation": {
        "validated": true,
        "description_word_count": 0,
        "faq_count": 0,
        "specification_count": 0,
        "source_count": 0,
        "image_count": 0,
        "identity_matches_feed": true,
        "duplicate_content_passed": true,
        "unsupported_claims_found": false,
        "notes": []
      }
    }
  ],
  "needs_review": [],
  "errors": []
}
```

### Raportul fiecărei execuții

La finalul fiecărei execuții:

1. atașează cel mai recent checkpoint JSON descărcabil;
2. afișează ID-urile și numele produselor finalizate;
3. afișează totalul cumulat finalizat și numărul rămas;
4. afișează produsele trimise la verificare manuală și motivul;
5. continuă automat, fără oprire între checkpoint-uri, până când toate ID-urile unice din feed sunt fie `validated`, fie în `needs_review` cu motiv concret;
6. încheie procesul numai după generarea și validarea fișierului `boomag-seo-catalog-final.json`.

Nu publica și nu modifica site-ul. Livrează numai fișierele JSON de conținut și audit.

---

## Instrucțiune de programare

După ce trimiți promptul, spune-i în aceeași conversație:

`Rulează acest proces continuu până când toate produsele sunt validate. Nu te opri după loturi și nu îmi cere confirmare între produse. Creează checkpoint-uri periodice doar ca protecție împotriva pierderii progresului și continuă imediat după fiecare checkpoint. Dacă o limită tehnică întrerupe execuția, reia automat de la primul produs nefinalizat la următoarea rulare. Oprește procesul numai după ce ai generat și validat boomag-seo-catalog-final.json.`
