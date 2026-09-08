#!/usr/bin/env node

import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "website");
const BASE = "https://g-trots.ro";

const metadata = {
  "accesibilitate.html": "Declarația de accesibilitate G-Trots și modalitatea de raportare a unei bariere de utilizare.",
  "conditii-b2b.html": "Condițiile comerciale G-Trots pentru comenzi, retururi și garanții dedicate cumpărătorilor profesioniști.",
  "contact.html": "Datele oficiale de contact și identificare ale comerciantului G-Trots România.",
  "garantii-si-reclamatii.html": "Garanția legală de conformitate, garanția comercială și reclamațiile pentru produsele G-Trots.",
  "livrare-si-plata.html": "Metodele, costurile și termenele de livrare G-Trots, actualizate din checkout.",
  "plata-si-facturare.html": "Metodele de plată, facturarea și rambursările disponibile în magazinul G-Trots.",
  "politica-cookies.html": "Cookie-urile și tehnologiile folosite de G-Trots și modul de modificare a consimțământului.",
  "politica-de-confidentialitate.html": "Cum prelucrează G-Trots datele pentru cont, comenzi, livrare, facturare, retururi, recenzii și marketing.",
  "politica-de-retur.html": "Condițiile și pașii pentru retragere și retur comercial în magazinul online G-Trots.",
  "siguranta-produselor.html": "Informații G-Trots despre siguranța, identificarea și raportarea problemelor produselor.",
  "solutionarea-litigiilor.html": "Soluționarea amiabilă a reclamațiilor și accesul consumatorilor la mecanismul ANPC SAL.",
  "termeni-si-conditii.html": "Termenii aplicabili comenzilor B2C și B2B, plăților, livrării, facturării, garanțiilor și retururilor G-Trots România."
};

const canonicalRepairs = {
  "displayul-la-navee-s60-se-intuneca-atunci-cand-accelerezi.html": "https://g-trots.ro/displayul-la-navee-s60-se-intuneca-atunci-cand-accelerezi",
  "dualtron-togo-plus-incepe-sa-dea-erori-la-cateva-ore-dupa-ploaie.html": "https://g-trots.ro/dualtron-togo-plus-incepe-sa-dea-erori-la-cateva-ore-dupa-ploaie",
  "e-twow-gt-sport-afiseaza-o-viteza-gresita-pe-display.html": "https://g-trots.ro/e-twow-gt-sport-afiseaza-o-viteza-gresita-pe-display",
  "etrierul-la-segway-ninebot-p65e-incepe-sa-frece-dupa-denivelari.html": "https://g-trots.ro/etrierul-la-segway-ninebot-p65e-incepe-sa-frece-dupa-denivelari",
  "frana-spate-la-kugoo-s1-pro-ramane-stransa-dupa-ce-se-incalzeste.html": "https://g-trots.ro/frana-spate-la-kugoo-s1-pro-ramane-stransa-dupa-ce-se-incalzeste",
  "furca-fata-la-segway-ninebot-zt3-pro-e-ramane-blocata-sau-revine-greu.html": "https://g-trots.ro/furca-fata-la-segway-ninebot-zt3-pro-e-ramane-blocata-sau-revine-greu",
  "hiley-tiger-8-smuceste-la-plecare.html": "https://g-trots.ro/hiley-tiger-8-smuceste-la-plecare",
  "horwin-ek1-bateria-se-descarca-repede.html": "https://g-trots.ro/horwin-ek1-bateria-se-descarca-repede"
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

async function atomicWrite(filePath, contents) {
  const temporary = `${filePath}.codex-search-${process.pid}.tmp`;
  await writeFile(temporary, contents, "utf8");
  try {
    await rename(temporary, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM" && error?.code !== "UNKNOWN") throw error;
    await rm(filePath, { force: true });
    await rename(temporary, filePath);
  }
}

async function ensureMetadata(fileName, description) {
  const filePath = path.join(ROOT, fileName);
  let html = await readFile(filePath, "utf8");
  const canonical = `${BASE}/${fileName.slice(0, -5)}`;
  const additions = [];
  if (!/<meta\b[^>]*\bname=["']description["']/i.test(html)) additions.push(`<meta name="description" content="${escapeHtml(description)}">`);
  if (!/<meta\b[^>]*\bname=["']robots["']/i.test(html)) additions.push('<meta name="robots" content="index, follow">');
  if (!/<link\b[^>]*\brel=["']canonical["']/i.test(html)) additions.push(`<link rel="canonical" href="${canonical}">`);
  if (additions.length) html = html.replace(/<\/title>/i, `</title>${additions.join("")}`);
  await atomicWrite(filePath, html);
}

async function repairCanonical(fileName, expected) {
  const filePath = path.join(ROOT, fileName);
  let html = await readFile(filePath, "utf8");
  const match = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i);
  if (!match) throw new Error(`Canonical lipsă: ${fileName}`);
  const previous = match[1];
  if (previous !== expected) html = html.split(previous).join(expected);
  await atomicWrite(filePath, html);
}

function guideSchema(doc) {
  const url = `${BASE}/${doc.slug}`;
  const organization = {
    "@type": "Organization", "@id": `${BASE}/#organization`, name: "G-Trots România",
    legalName: "CAB IT EXPERT S.R.L.", url: `${BASE}/`, telephone: "+40762093915"
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      {
        "@type": "Article", "@id": `${url}#article`, headline: doc.title, description: doc.quick_answer,
        mainEntityOfPage: url, author: { "@id": `${BASE}/#organization` }, publisher: { "@id": `${BASE}/#organization` },
        inLanguage: "ro-RO", datePublished: "2026-07-14", dateModified: "2026-09-07",
        // Pagina descrie un diagnostic, nu o ofertă comercială pentru modelul
        // vehiculului. `Product` ar face Google să ceară offers/review/rating.
        about: [{ "@type": "Brand", name: doc.brand }, { "@type": "Thing", name: `${doc.brand} ${doc.model}` }]
      },
      {
        "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Acasă", item: `${BASE}/` },
          { "@type": "ListItem", position: 2, name: "Ghiduri", item: `${BASE}/ghiduri-service-trotinete-electrice` },
          { "@type": "ListItem", position: 3, name: doc.title, item: url }
        ]
      }
    ]
  };
}

function renderGuide(doc) {
  const url = `${BASE}/${doc.slug}`;
  const description = doc.quick_answer.slice(0, 158).replace(/\s+\S*$/, "") + "…";
  const schema = guideSchema(doc);
  const list = values => values.map(value => `<li>${escapeHtml(value)}</li>`).join("");
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(doc.title)} | G-Trots</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"><link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:locale" content="ro_RO"><meta property="og:title" content="${escapeHtml(doc.title)} | G-Trots"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${BASE}/assets/favicon.png">
<link rel="icon" href="/assets/favicon.png"><link rel="stylesheet" href="/styles.css?v=20k-v7"><link rel="stylesheet" href="/seo-pages.css?v=20k-v7"><link rel="stylesheet" href="/seo-pages-v6.css?v=20k-v7"><script type="application/ld+json">${safeJson(schema)}</script></head>
<body><header class="site-header"><div class="header-inner"><a class="logo" href="/"><img src="/assets/logo.png" width="64" height="64" alt=""><b><span>G</span>-Trots</b></a><nav class="main-nav" aria-label="Navigație"><a href="/magazin">Magazin</a><a href="/ghiduri-service-trotinete-electrice">Ghiduri</a><a href="/contact">Contact</a></nav></div></header>
<main class="seo-page"><article><nav aria-label="Breadcrumb"><a href="/">Acasă</a> / <a href="/ghiduri-service-trotinete-electrice">Ghiduri</a></nav><p class="eyebrow">GHID DE DIAGNOSTIC</p><h1>${escapeHtml(doc.title)}</h1><section class="quick-answer"><h2>Răspuns rapid</h2><p>${escapeHtml(doc.quick_answer)}</p></section><section><h2>Cauze posibile</h2><ul>${list(doc.likely_causes)}</ul></section><section><h2>Verificări sigure</h2><ul>${list(doc.safe_checks)}</ul></section><section><h2>Reparații posibile după diagnostic</h2><ul>${list(doc.possible_repairs)}</ul></section><section><h2>Întrebări utile pentru diagnostic</h2><ul>${list(doc.clarifying_questions)}</ul></section><p><strong>Nivel orientativ de risc:</strong> ${escapeHtml(doc.risk_level)}. Oprește utilizarea dacă vehiculul are comportament imprevizibil, miros de ars, fum, încălzire puternică sau pierderea frânării.</p><p><a href="/contact">Contactează G-Trots pentru diagnosticare</a></p></article></main><script src="/legal-footer.js?v=20260907-meta-v11" defer></script></body></html>\n`;
}

async function repairBrokenGuides() {
  const slugs = new Set([
    "dualtron-victor-controller-defect-sector-1",
    "horwin-sk3-ramane-blocat-in-modul-eco"
  ]);
  const documents = JSON.parse(await readFile(path.join(ROOT, "search", "data", "diagnostic-docs.json"), "utf8"));
  for (const doc of documents.filter(entry => slugs.has(entry.slug))) {
    await atomicWrite(path.join(ROOT, `${doc.slug}.html`), renderGuide(doc));
    slugs.delete(doc.slug);
  }
  if (slugs.size) throw new Error(`Lipsesc documentele sursă: ${[...slugs].join(", ")}`);
}

function replaceProductSubjectsInArticleSchema(html) {
  let replacements = 0;
  const nextHtml = html.replace(
    /(<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
    (full, opening, json, closing) => {
      const replacementsBeforeScript = replacements;
      let data;
      try {
        data = JSON.parse(json);
      } catch {
        return full;
      }

      const visit = value => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }

        const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
        if (types.some(type => ["Article", "TechArticle", "BlogPosting"].includes(type)) && Array.isArray(value.about)) {
          value.about.forEach(subject => {
            if (subject && typeof subject === "object" && subject["@type"] === "Product") {
              subject["@type"] = "Thing";
              replacements += 1;
            }
          });
        }
        Object.values(value).forEach(visit);
      };

      visit(data);
      return replacements > replacementsBeforeScript ? `${opening}${safeJson(data)}${closing}` : full;
    }
  );
  return { html: nextHtml, replacements };
}

async function repairGuideProductSubjects() {
  const documents = JSON.parse(await readFile(path.join(ROOT, "search", "data", "diagnostic-docs.json"), "utf8"));
  let changedFiles = 0;
  let replacements = 0;
  let invalidSchemasRebuilt = 0;
  for (const doc of documents) {
    const filePath = path.join(ROOT, `${doc.slug}.html`);
    let html = await readFile(filePath, "utf8");
    let rebuilt = false;
    html = html.replace(
      /(<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
      (full, opening, json, closing) => {
        try {
          JSON.parse(json);
          return full;
        } catch {
          rebuilt = true;
          return `${opening}${safeJson(guideSchema(doc))}${closing}`;
        }
      }
    );
    const repaired = replaceProductSubjectsInArticleSchema(html);
    if (!rebuilt && !repaired.replacements) continue;
    await atomicWrite(filePath, repaired.html);
    changedFiles += 1;
    replacements += repaired.replacements;
    invalidSchemasRebuilt += rebuilt ? 1 : 0;
  }
  return { changedFiles, replacements, invalidSchemasRebuilt };
}

for (const [fileName, description] of Object.entries(metadata)) await ensureMetadata(fileName, description);
for (const [fileName, expected] of Object.entries(canonicalRepairs)) await repairCanonical(fileName, expected);
await repairBrokenGuides();
const repairedSubjects = await repairGuideProductSubjects();
process.stdout.write(`${JSON.stringify({ metadata: Object.keys(metadata).length, canonicals: Object.keys(canonicalRepairs).length, repairedGuides: 2, repairedSubjects })}\n`);
