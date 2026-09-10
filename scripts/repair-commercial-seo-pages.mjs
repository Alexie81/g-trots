import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const website = path.join(root, "website");
const phoneHref = "tel:+40762093915";
const phoneDisplay = "0762 093 915";
const whatsappHref = "https://wa.me/40762093915";
const serviceArea = "București–Ilfov";

async function atomicWrite(file, content) {
  const temporary = `${file}.gtrots-repair-${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, file);
}

async function atomicJsonAssets(file, payload) {
  const content = `${JSON.stringify(payload)}\n`;
  const bytes = Buffer.from(content, "utf8");
  await Promise.all([
    atomicWrite(file, content),
    atomicWrite(`${file}.gz`, gzipSync(bytes, { level: 9 })),
    atomicWrite(`${file}.br`, brotliCompressSync(bytes, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } })),
  ]);
}

const pages = [
  {
    slug: "service-trotinete-electrice",
    title: "Service trotinete electrice București și Ilfov | G-Trots",
    heading: "Service trotinete electrice în București",
    description: "Service G-Trots pentru trotinete electrice în București și Ilfov: diagnostic, anvelope, frâne, baterii, controllere, motoare și revizii. Programare la 0762 093 915.",
    section: "Service",
    quick: `G-Trots deservește zona ${serviceArea}. Programul este luni–vineri, 10:00–19:00. Pentru programare sună la ${phoneDisplay} sau trimite modelul trotinetei și problema observată pe WhatsApp. Detaliile de predare sunt confirmate la programare, iar costul și termenul sunt comunicate după verificare.`,
    faqs: [
      ["În ce zonă lucrează service-ul G-Trots?", `G-Trots deservește clienți din ${serviceArea}. Momentan nu este publicată o adresă fixă de atelier; detaliile de predare se confirmă la programare.`],
      ["Care este programul service-ului?", "Programul afișat este luni–vineri, între 10:00 și 19:00. Pentru a evita așteptarea, fă o programare înainte de vizită."],
      ["Cât costă reparația unei trotinete electrice?", "Costul depinde de model, defect, piesa necesară și complexitatea montajului. Primești estimarea și îți confirmi acordul înainte de executarea lucrării."],
      ["Ce reparații face G-Trots?", "Diagnostic, schimb de anvelope și camere, frâne, rulmenți, suspensii, baterii și încărcare, controllere, display-uri, accelerații, motoare, cablaje și revizii."],
      ["Cum fac o programare?", `Sună la ${phoneDisplay} sau trimite pe WhatsApp modelul complet, problema observată și, dacă ajută, fotografii sau codul de eroare.`],
    ],
    main: `
<main class="seo-page">
  <section class="shell article-hero">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Acasă</a><span>/</span><a href="/service-trotinete-electrice">Service</a></nav>
    <p class="eyebrow">SERVICE G-TROTS · BUCUREȘTI</p>
    <h1>Service trotinete electrice în București</h1>
    <p class="lead">Reparații și întreținere pentru trotinete electrice, cu programare clară și estimare confirmată înainte de lucrare. Lucrăm pentru clienți din București și Ilfov.</p>
    <g-trots-diagnostic-search data-base-url="/"></g-trots-diagnostic-search>
  </section>
  <section class="shell content-layout">
    <article class="article-body">
      <section class="quick-answer" aria-labelledby="informatii-service"><p class="eyebrow">INFORMAȚII ESENȚIALE</p><h2 id="informatii-service">Zonă, program și programare</h2><p>Deservim clienți din <strong>${serviceArea}</strong>, de luni până vineri, între <strong>10:00 și 19:00</strong>. Momentan nu afișăm o adresă fixă de atelier. Sună la <a href="${phoneHref}">${phoneDisplay}</a> sau trimite modelul și problema pe <a href="${whatsappHref}">WhatsApp</a>, iar detaliile de predare le confirmăm la programare.</p></section>
      <section class="action-plan"><h2>Programare în trei pași</h2><ol><li><strong>Spune modelul complet</strong><span>Include marca, modelul și anul sau revizia, dacă le cunoști.</span></li><li><strong>Descrie problema pe scurt</strong><span>Spune ce nu funcționează, când apare și dacă există un cod de eroare.</span></li><li><strong>Confirmă vizita</strong><span>Stabilim când poți veni; după verificare primești costul și termenul înainte de reparație.</span></li></ol></section>
      <section><h2>Ce reparăm</h2><ul class="diagnostic-list"><li>anvelope, camere, valve și pene</li><li>frâne mecanice sau hidraulice, discuri și plăcuțe</li><li>baterii, încărcare și autonomie</li><li>controllere, display-uri, accelerații și cablaje</li><li>motoare, rulmenți, suspensii și sisteme de pliere</li><li>revizii, reglaje și verificări înainte de sezon</li></ul></section>
      <section><h2>Cât costă și cât durează</h2><p>Prețul final depinde de model, de piesa necesară și de complexitatea lucrării. Nu publicăm un tarif generic care poate induce în eroare: după verificare îți comunicăm estimarea de cost și timpul realist, iar intervenția începe după acordul tău. Disponibilitatea pieselor poate influența termenul.</p></section>
      <section><h2>Ce să aduci sau să trimiți înainte</h2><p>Pentru identificare rapidă sunt utile o fotografie cu trotineta întreagă, eticheta modelului, codul de eroare și o descriere simplă a problemei. Nu este nevoie să presupui ce piesă s-a defectat.</p></section>
      <section id="intrebari-frecvente"><h2>Întrebări frecvente</h2>${"__FAQ__"}</section>
      <section><h2>Piese și montaj în același loc</h2><p>Dacă reparația cere o componentă, poți verifica și <a href="/magazin">magazinul G-Trots</a>. Te ajutăm să confirmi compatibilitatea înainte de comandă, iar montajul se poate face în service.</p></section>
    </article>
    <aside class="article-aside"><div class="aside-card"><strong>Programează o verificare</strong><p>Spune-ne modelul și problema observată.</p><a class="button" href="${phoneHref}">Sună ${phoneDisplay}</a></div><div class="aside-card"><strong>Zonă și program</strong><p>${serviceArea}<br>Luni–Vineri · 10:00–19:00</p><a href="${whatsappHref}">Confirmă detaliile pe WhatsApp</a></div></aside>
  </section>
</main>`,
  },
  {
    slug: "service-trotinete-electrice-bucuresti",
    title: "Service trotinete electrice București | G-Trots",
    heading: "Service pentru trotinete electrice în București",
    description: "Service G-Trots pentru București și Ilfov: reparații, anvelope, frâne, baterii, controllere și revizii. Programări la 0762 093 915.",
    section: "Service trotinete electrice în București",
    quick: `G-Trots deservește zona ${serviceArea}, de luni până vineri, între 10:00 și 19:00. Momentan nu este publicată o adresă fixă de atelier. Pentru programare și detaliile de predare sună la ${phoneDisplay} sau scrie pe WhatsApp. Estimarea de cost și termenul sunt comunicate după verificare.`,
    faqs: [
      ["În ce zonă lucrează service-ul G-Trots?", `G-Trots deservește clienți din ${serviceArea}. Momentan nu este publicată o adresă fixă de atelier; detaliile de predare se confirmă la programare.`],
      ["Este necesară programarea?", `Recomandăm programarea la ${phoneDisplay} sau pe WhatsApp, ca să confirmăm intervalul și să reducem timpul de așteptare.`],
      ["Ce tipuri de reparații efectuați?", "Lucrăm la roți și anvelope, frâne, rulmenți, suspensii, sisteme de pliere, baterii și încărcare, controllere, display-uri, accelerații, motoare și cablaje."],
      ["Cât costă reparația?", "Costul depinde de model, defect, piesele necesare și timpul de lucru. După verificare comunicăm estimarea, iar intervenția începe după acordul clientului."],
      ["Cât durează reparația?", "Termenul depinde de complexitatea lucrării și de disponibilitatea pieselor. După diagnostic primești un termen realist, nu o estimare generică."],
      ["Pot cumpăra piesa și solicita montajul în același loc?", "Da. G-Trots are magazin de piese cu livrare în România, iar compatibilitatea și montajul pot fi confirmate în service."],
    ],
    main: `
<main class="seo-page">
  <section class="shell article-hero">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Acasă</a><span>/</span><a href="/service-trotinete-electrice">Service</a><span>/</span><a href="/service-trotinete-electrice-bucuresti">București</a></nav>
    <p class="eyebrow">SERVICE G-TROTS · BUCUREȘTI–ILFOV</p>
    <h1>Service pentru trotinete electrice în București</h1>
    <p class="lead">Diagnostic, reparații și întreținere într-un atelier specializat. Îți spunem ce am găsit, cât costă și cât durează înainte să începem lucrarea.</p>
    <g-trots-diagnostic-search data-base-url="/"></g-trots-diagnostic-search>
  </section>
  <section class="shell content-layout">
    <article class="article-body">
      <section class="quick-answer" aria-labelledby="date-atelier"><p class="eyebrow">INFORMAȚII PENTRU VIZITĂ</p><h2 id="date-atelier">Zonă, program și programare</h2><p>Deservim zona <strong>${serviceArea}</strong>, de luni până vineri, între <strong>10:00 și 19:00</strong>. Momentan nu este publicată o adresă fixă de atelier. Sună la <a href="${phoneHref}">${phoneDisplay}</a> sau scrie pe <a href="${whatsappHref}">WhatsApp</a>, iar detaliile de predare sunt confirmate la programare.</p></section>
      <section><h2>Cu ce te putem ajuta</h2><ul class="diagnostic-list"><li>schimb de anvelope, camere și valve, inclusiv roți tubeless</li><li>reglaje și reparații pentru frâne, discuri, plăcuțe și etriere</li><li>verificări pentru baterie, încărcare și autonomie scăzută</li><li>controllere, display-uri, accelerații, motoare și cablaje</li><li>rulmenți, suspensii, ghidon și sisteme de pliere</li><li>revizii periodice și verificări generale de siguranță</li></ul></section>
      <section class="action-plan"><h2>Cum decurge programarea</h2><ol><li><strong>Ne spui marca și modelul</strong><span>Adaugă problema observată și un cod de eroare, dacă există.</span></li><li><strong>Stabilim vizita</strong><span>Confirmăm intervalul în care poți aduce trotineta la atelier.</span></li><li><strong>Primești constatarea</strong><span>După verificare îți comunicăm soluția, costul estimat și termenul înainte de reparație.</span></li></ol></section>
      <section><h2>Costul și durata reparației</h2><p>O pană, un reglaj de frână și o problemă de baterie nu pot avea același tarif sau același termen. Prețul depinde de model, accesul la componentă, piesele necesare și complexitatea intervenției. După verificare primești o estimare clară și alegi dacă dorești continuarea lucrării.</p></section>
      <section><h2>Ce informații să trimiți înainte</h2><p>O fotografie cu trotineta, eticheta modelului și o descriere scurtă a problemei ne ajută să pregătim vizita. Pentru roți sunt utile dimensiunile de pe anvelopă, iar pentru probleme electronice este util codul afișat pe display. Nu trebuie să stabilești singur ce piesă este defectă.</p></section>
      <section><h2>Service în București, piese cu livrare națională</h2><p>Atelierul deservește clienți din toate sectoarele Bucureștiului și din Ilfov. Magazinul online G-Trots livrează piese și accesorii oriunde în România. Dacă ai nevoie și de montaj, putem confirma mai întâi compatibilitatea produsului cu modelul tău.</p><p><a href="/magazin">Vezi magazinul de piese pentru trotinete electrice</a> sau consultă <a href="/service-trotinete-electrice">pagina principală de service</a>.</p></section>
      <section id="intrebari-frecvente"><h2>Întrebări frecvente</h2>${"__FAQ__"}</section>
    </article>
    <aside class="article-aside"><div class="aside-card"><strong>Programează o vizită</strong><p>Trimite marca, modelul și problema observată.</p><a class="button" href="${phoneHref}">Sună ${phoneDisplay}</a></div><div class="aside-card"><strong>Zonă deservită</strong><p>${serviceArea}<br>Luni–Vineri · 10:00–19:00</p><a href="${whatsappHref}">Confirmă detaliile pe WhatsApp</a></div></aside>
  </section>
</main>`,
  },
  {
    slug: "schimb-anvelopa-trotineta-electrica",
    title: "Schimb anvelopă trotinetă electrică București | G-Trots",
    heading: "Schimb anvelopă pentru trotinetă electrică",
    description: "Schimb anvelopă, cameră sau valvă pentru trotinete electrice în București. Verificăm dimensiunea, tipul roții și compatibilitatea înainte de montaj.",
    section: "Roți și anvelope",
    quick: `Pentru schimbarea anvelopei verificăm dimensiunea înscrisă pe cauciuc, tipul tubeless sau cu cameră, valva, janta și modelul trotinetei. G-Trots deservește zona ${serviceArea}; programarea se face la ${phoneDisplay} sau pe WhatsApp. Costul și termenul sunt confirmate înainte de montaj.`,
    faqs: [
      ["Ce informații sunt necesare pentru alegerea anvelopei?", "Modelul trotinetei, dimensiunea scrisă pe anvelopa veche și dacă roata este tubeless, cu cameră sau plină. O fotografie clară ajută la confirmare."],
      ["Schimbați și camera sau valva?", "Da. La demontare verificăm anvelopa, camera sau etanșarea tubeless, valva și starea jantei, apoi îți comunicăm ce trebuie înlocuit."],
      ["Cât costă schimbarea anvelopei?", "Costul depinde de model, tipul roții, accesul la motor și piesele necesare. Estimarea este comunicată înainte de montaj."],
      ["Pot cumpăra anvelopa de la G-Trots și solicita montajul?", "Da. Poți alege o anvelopă din magazinul G-Trots, iar noi te ajutăm să verifici compatibilitatea și să programezi montajul."],
      ["Este sigur să merg cu anvelopa tăiată sau dezumflată?", "Nu. Oprește utilizarea dacă anvelopa pierde presiune, are tăieturi, talon deplasat sau janta atinge carosabilul; continuarea mersului poate deteriora janta sau motorul."],
    ],
    main: `
<main class="seo-page">
  <section class="shell article-hero">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Acasă</a><span>/</span><a href="/service-trotinete-electrice">Service</a><span>/</span><a href="/schimb-anvelopa-trotineta-electrica">Schimb anvelopă</a></nav>
    <p class="eyebrow">ROȚI ȘI ANVELOPE · G-TROTS</p>
    <h1>Schimb anvelopă pentru trotinetă electrică</h1>
    <p class="lead">Schimbăm anvelope, camere și valve și verificăm compatibilitatea după dimensiunea reală a roții și modelul trotinetei.</p>
    <g-trots-diagnostic-search data-base-url="/"></g-trots-diagnostic-search>
  </section>
  <section class="shell content-layout">
    <article class="article-body">
      <section class="quick-answer" aria-labelledby="raspuns-anvelopa"><p class="eyebrow">RĂSPUNS DIRECT</p><h2 id="raspuns-anvelopa">Ce verificăm înainte de montaj</h2><p>Avem nevoie de <strong>dimensiunea scrisă pe anvelopa veche</strong>, modelul trotinetei și tipul roții: tubeless, cu cameră sau plină. Verificăm și valva, talonul, janta și, unde este cazul, accesul la cablul motorului.</p></section>
      <section class="action-plan"><h2>Cum programezi schimbul</h2><ol><li><strong>Trimite modelul și o fotografie</strong><span>Fotografia trebuie să arate inscripția cu dimensiunea de pe lateralul anvelopei.</span></li><li><strong>Confirmăm piesa potrivită</strong><span>Comparăm dimensiunea, tipul de anvelopă și construcția roții.</span></li><li><strong>Stabilim montajul</strong><span>Primești estimarea de cost și termen înainte de executarea lucrării.</span></li></ol></section>
      <section><h2>Când trebuie schimbată anvelopa</h2><ul class="diagnostic-list"><li>pierde presiune sau are o tăietură care nu poate fi reparată sigur</li><li>profilul este uzat, crăpat sau deformat</li><li>talonul nu mai etanșează corect pe jantă</li><li>camera ori valva este deteriorată</li><li>roata vibrează sau anvelopa nu mai stă uniform pe jantă</li></ul></section>
      <section><h2>De ce modelul singur nu este întotdeauna suficient</h2><p>Același model de trotinetă poate exista cu dimensiuni sau revizii diferite ale roții. De aceea confirmăm inscripția anvelopei și construcția roții, nu alegem piesa doar după aspect. Pentru o roată cu motor, demontarea trebuie făcută fără a forța cablul și fără a deteriora etanșarea.</p></section>
      <section><h2>Preț și durată</h2><p>Costul depinde de tipul anvelopei, modelul trotinetei, accesul la roată și dacă trebuie înlocuite camera, valva sau alte elemente. Îți comunicăm estimarea și disponibilitatea piesei înainte de montaj.</p></section>
      <section id="intrebari-frecvente"><h2>Întrebări frecvente</h2>${"__FAQ__"}</section>
      <section><h2>Cumpără anvelopa potrivită</h2><p>Vezi <a href="/magazin">anvelopele și camerele din magazinul G-Trots</a>. Dacă nu ești sigur de compatibilitate, trimite o fotografie pe WhatsApp înainte de comandă.</p></section>
    </article>
    <aside class="article-aside"><div class="aside-card"><strong>Verifică potrivirea</strong><p>Trimite modelul și fotografia dimensiunii înscrise pe anvelopă.</p><a class="button" href="${whatsappHref}">Întreabă pe WhatsApp</a></div><div class="aside-card"><strong>Service în București–Ilfov</strong><p>Detaliile de predare se confirmă la programare.<br>Luni–Vineri · 10:00–19:00</p><a href="${phoneHref}">Sună ${phoneDisplay}</a></div></aside>
  </section>
</main>`,
  },
];

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function faqHtml(faqs) {
  return faqs.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join("");
}

function schema(page) {
  const url = `https://g-trots.ro/${page.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://g-trots.ro/#business",
        name: "G-Trots",
        legalName: "CAB IT EXPERT S.R.L.",
        url: "https://g-trots.ro/",
        telephone: "+40762093915",
        email: "contact@g-trots.ro",
        image: "https://g-trots.ro/assets/favicon.png",
        openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "10:00", closes: "19:00" }],
        areaServed: [{ "@type": "AdministrativeArea", name: "București" }, { "@type": "AdministrativeArea", name: "Ilfov" }],
      },
      { "@type": "WebPage", "@id": `${url}#webpage`, url, name: page.heading, description: page.description, inLanguage: "ro-RO", isPartOf: { "@id": "https://g-trots.ro/#website" } },
      { "@type": "Service", "@id": `${url}#service`, name: page.heading, serviceType: page.section, description: page.description, provider: { "@id": "https://g-trots.ro/#business" }, areaServed: ["București", "Ilfov"], url },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Acasă", item: "https://g-trots.ro/" }, { "@type": "ListItem", position: 2, name: "Service", item: "https://g-trots.ro/service-trotinete-electrice" }, { "@type": "ListItem", position: 3, name: page.heading, item: url }] },
      { "@type": "FAQPage", mainEntity: page.faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ],
  };
}

function replaceMeta(html, attribute, name, content) {
  const pattern = new RegExp(`<meta\\s+${attribute}="${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}"\\s+content="[^"]*">`, "i");
  const tag = `<meta ${attribute}="${name}" content="${escapeHtml(content)}">`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `${tag}</head>`);
}

async function repairPage(page) {
  const file = path.join(website, `${page.slug}.html`);
  let html = await readFile(file, "utf8");
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`);
  html = replaceMeta(html, "name", "description", page.description);
  html = replaceMeta(html, "property", "og:title", page.title);
  html = replaceMeta(html, "property", "og:description", page.description);
  html = html.replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${JSON.stringify(schema(page))}</script>`);
  const main = page.main.replace("__FAQ__", faqHtml(page.faqs)).trim();
  if (!/<main class="seo-page">[\s\S]*?<\/main>/i.test(html)) throw new Error(`Structură <main> necunoscută: ${page.slug}`);
  html = html.replace(/(?:\r?\n)*<main class="seo-page">[\s\S]*?<\/main>/i, `\n${main}`);
  html = html.replace(/\/legal-footer\.js\?v=[^\"']+/g, "/legal-footer.js?v=20260910-conversion-v1");
  await atomicWrite(file, html);
}

async function repairSearchData() {
  const docsPath = path.join(website, "search", "data", "diagnostic-docs.json");
  const docs = JSON.parse(await readFile(docsPath, "utf8"));
  for (const page of pages) {
    const doc = docs.find(item => item.slug === page.slug);
    if (!doc) throw new Error(`Lipsește documentul de căutare: ${page.slug}`);
    const isServicePage = page.slug.startsWith("service-trotinete-electrice");
    doc.title = page.heading;
    doc.keyword = isServicePage ? "service trotinete electrice București" : "schimb anvelopă trotinetă electrică";
    doc.symptom = page.section;
    doc.quick_answer = page.quick;
    doc.likely_causes = isServicePage
      ? ["anvelope și roți", "frâne și elemente mecanice", "baterie, încărcare sau electronică", "motor, rulmenți ori suspensie"]
      : ["anvelopă uzată sau tăiată", "cameră ori valvă deteriorată", "etanșare tubeless necorespunzătoare", "talon sau jantă deteriorată"];
    doc.safe_checks = isServicePage
      ? ["notează modelul complet și codul de eroare", "oprește utilizarea dacă frâna sau accelerația nu sunt sigure", "programează verificarea înainte de a cumpăra o piesă"]
      : ["citește dimensiunea de pe anvelopa veche", "verifică vizual tăieturile și poziția talonului", "nu continua deplasarea cu roata dezumflată"];
    doc.possible_repairs = isServicePage
      ? ["diagnostic și reglaj", "repararea ansamblului confirmat", "înlocuirea piesei compatibile și test final"]
      : ["înlocuire anvelopă", "înlocuire cameră sau valvă", "refacere etanșare tubeless", "verificare jantă și test de presiune"];
    doc.clarifying_questions = isServicePage
      ? ["Care este marca și modelul complet?", "Ce problemă apare și în ce condiții?", "Există un cod de eroare sau o intervenție recentă?"]
      : ["Ce dimensiune este scrisă pe anvelopă?", "Roata este tubeless, cu cameră sau plină?", "Este roată cu motor?"];
  }
  await atomicJsonAssets(docsPath, docs);

  const corePath = path.join(website, "search", "data", "instant-core.json");
  const core = JSON.parse(await readFile(corePath, "utf8"));
  const fields = Object.fromEntries(core.fields.map((field, index) => [field, index]));
  for (const page of pages) {
    const row = core.rows.find(item => item[fields.slug] === page.slug);
    if (!row) throw new Error(`Lipsește rândul instant: ${page.slug}`);
    row[fields.title] = page.heading;
    row[fields.symptom] = page.section;
    row[fields.quick] = page.quick;
  }
  await atomicJsonAssets(corePath, core);
}

for (const page of pages) await repairPage(page);
await repairSearchData();
process.stdout.write(`${JSON.stringify({ success: true, pages: pages.map(page => page.slug), searchDataUpdated: true })}\n`);
