#!/usr/bin/env node

import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const WEBSITE_ROOT = path.join(PROJECT_ROOT, "website");
const PRODUCT_ROOT = path.join(WEBSITE_ROOT, "magazin", "produs");
const TEMPLATE_PATH = path.join(WEBSITE_ROOT, "produs.html");
const STORE_PAGE_PATH = path.join(WEBSITE_ROOT, "magazin.html");
const STORE_PAGINATION_ROOT = path.join(WEBSITE_ROOT, "magazin", "pagina");
const SITEMAP_PATH = path.join(WEBSITE_ROOT, "sitemaps", "sitemap-produse.xml");
const STORE_SITEMAP_PATH = path.join(WEBSITE_ROOT, "sitemaps", "sitemap-magazin.xml");
const SITEMAP_INDEX_PATH = path.join(WEBSITE_ROOT, "sitemap-index.xml");
const CATALOG_PAGE_PATH = path.join(WEBSITE_ROOT, "catalog-produse.html");
const AI_CATALOG_PATH = path.join(WEBSITE_ROOT, "ai-catalog.json");
const OPENAI_PRODUCT_FEED_PATH = path.join(WEBSITE_ROOT, "openai-products.jsonl");
const OPENAI_PRODUCT_FEED_GZIP_PATH = path.join(WEBSITE_ROOT, "openai-products.jsonl.gz");
const OPENAI_PRODUCT_FEED_STATUS_PATH = path.join(WEBSITE_ROOT, "openai-products-status.json");
const MANIFEST_PATH = path.join(PRODUCT_ROOT, ".generated-product-pages.json");
const WEBSITE_BASE_URL = (process.env.GTROTS_WEBSITE_URL || "https://g-trots.ro").replace(/\/$/, "");
const API_URL = process.env.GTROTS_PUBLIC_API_URL || `${WEBSITE_BASE_URL}/shop-api/api-v2.php`;
const PAGE_SIZE = 500;
const STORE_PAGE_SIZE = 24;
const GENERATED_ON = new Date().toISOString().slice(0, 10);
const STORE_PRODUCTS_START = "<!-- GTROTS:SSR_PRODUCTS_START -->";
const STORE_PRODUCTS_END = "<!-- GTROTS:SSR_PRODUCTS_END -->";
const STORE_PAGINATION_START = "<!-- GTROTS:SSR_PAGINATION_START -->";
const STORE_PAGINATION_END = "<!-- GTROTS:SSR_PAGINATION_END -->";

function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function validGtin(value) {
  const gtin = String(value ?? "").replace(/\D+/g, "");
  if (![8, 12, 13, 14].includes(gtin.length)) return "";
  if (/^(?:2|02|04|98|99)/.test(gtin)) return "";
  let sum = 0;
  let weight = 3;
  for (let index = gtin.length - 2; index >= 0; index -= 1) {
    sum += Number(gtin[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === Number(gtin.at(-1)) ? gtin : "";
}

function excerpt(value, limit) {
  const text = cleanText(value);
  if (text.length <= limit) return text;
  const provisional = text.slice(0, Math.max(1, limit - 1)).trimEnd();
  const lastSpace = provisional.lastIndexOf(" ");
  const cut = lastSpace >= Math.floor(limit * 0.65) ? provisional.slice(0, lastSpace) : provisional;
  return `${cut.trimEnd()}…`;
}

function seoTitle(name) {
  const suffix = " | G-Trots";
  return `${excerpt(name, 65 - suffix.length)}${suffix}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function escapeXml(value) {
  return escapeHtml(value);
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function safeSlug(value) {
  const slug = String(value ?? "").trim();
  if (!slug || slug.includes("/") || slug.includes("\\") || slug.includes("..") || !/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) {
    throw new Error(`Slug de produs nepermis: ${slug || "(gol)"}`);
  }
  return slug;
}

function absoluteUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return `${WEBSITE_BASE_URL}/${url.replace(/^\/+/, "")}`;
}

function currentPrice(product) {
  for (const value of [product.promotion_price, product.sale_price, product.price]) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function isInStock(product) {
  return product.stock_mode === "unlimited" || Number(product.stock_quantity || 0) > 0;
}

function intentKey(value) {
  return cleanText(value).toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function conversationEnrichmentEnabled(product) {
  return product.discovery_enrichment_enabled === true;
}

function isBoomagProduct(product) {
  return product.is_boomag_source === true;
}

function isBoomagAccessory(product) {
  return isBoomagProduct(product) && product.is_accessory_category === true;
}

function conversationContexts(product) {
  if (!conversationEnrichmentEnabled(product)) return [];
  const category = intentKey(product.category_name);
  const name = intentKey(product.name);
  const haystack = category || name;
  const contains = (...needles) => needles.some(needle => haystack.includes(needle));
  if (name.includes("cablu") || name.includes("mufa") || name.includes("conector") || contains("cabluri si mufe", "butoane si conectori")) return [
    "Este o opțiune utilă pentru refacerea unei conexiuni deteriorate sau a unui contact care funcționează intermitent.",
    "Înainte de alegere, compară numărul și poziția pinilor, tensiunea, lungimea și traseul cablului; forma asemănătoare a mufei nu garantează compatibilitatea."
  ];
  if (contains("cauciuc", "anvelop", "camera", "valv", "roti", "roata")) return [
    "Este o opțiune pentru înlocuirea unei anvelope, camere, valve sau roți sparte, tăiate ori uzate.",
    "Înainte de alegere, verifică dimensiunea inscripționată pe piesa veche, tipul jantei și versiunea exactă a trotinetei."
  ];
  if (contains("placute de frana", "etrier", "disc de frana", "manete de frana", "cablu de frana", "frane ", "frana ")) return [
    "Poate fi potrivit când frânarea a devenit slabă sau zgomotoasă ori când o componentă a sistemului de frânare este uzată.",
    "Compară tipul etrierului, forma, prinderile și dimensiunile înainte de comandă; o problemă de frânare trebuie verificată înainte de utilizarea trotinetei."
  ];
  if (contains("display")) return [
    "Poate fi o soluție când display-ul nu pornește, nu afișează corect sau nu mai comunică normal cu trotineta.",
    "Verifică versiunea, protocolul și conectorii înainte de comandă, deoarece display-urile asemănătoare vizual nu sunt întotdeauna interschimbabile."
  ];
  if (contains("acceleratie", "accelerator")) return [
    "Poate fi potrivit când accelerația nu răspunde, răspunde intermitent sau maneta este deteriorată.",
    "Compară conectorul, tensiunea și poziția pinilor, apoi confirmă compatibilitatea electronică înainte de comandă."
  ];
  if (contains("motor")) return [
    "Poate fi o opțiune când motorul nu mai trage, funcționează neregulat sau prezintă zgomote și joc mecanic.",
    "Aceleași simptome pot proveni și din controller, baterie, senzori ori cablaj, așa că diagnosticul trebuie confirmat înainte de comandă."
  ];
  if (contains("acumulator", "baterie", "bms")) return [
    "Poate fi o opțiune când trotineta nu mai pornește, autonomia a scăzut sau bateria nu se mai încarcă normal.",
    "Verifică tensiunea, capacitatea, dimensiunile și conectorii, iar înainte de înlocuire confirmă diagnosticul sistemului de alimentare."
  ];
  if (contains("incarcator")) return [
    "Poate înlocui un încărcător lipsă sau deteriorat atunci când specificațiile corespund trotinetei și bateriei.",
    "Confirmă tensiunea de ieșire, curentul, mufa și polaritatea înainte de conectare."
  ];
  if (contains("buton", "senzor", "convertor")) return [
    "Poate fi util când o comandă sau o funcție electrică răspunde intermitent ori nu mai funcționează.",
    "Confirmă tensiunea, conectorii, poziția pinilor și rolul exact al componentei înainte de comandă."
  ];
  if (contains("far", "lumini", "led", "claxon", "sonerie")) return [
    "Poate fi potrivit când iluminarea, semnalizarea sau avertizarea sonoră nu mai funcționează corect.",
    "Compară tensiunea, conectorul și prinderea, apoi confirmă compatibilitatea cu instalația electrică."
  ];
  if (contains("suspensie", "furca")) return [
    "Poate fi potrivit când suspensia sau furca prezintă joc, zgomote, deformări ori funcționare neuniformă.",
    "Compară dimensiunile, prinderile și configurația exactă a trotinetei înainte de comandă."
  ];
  if (contains("pliere")) return [
    "Poate fi potrivit când mecanismul de pliere are joc, nu se mai blochează corect sau o componentă este uzată.",
    "Compară versiunea mecanismului, forma și dimensiunile piesei înainte de comandă."
  ];
  if (contains("rulment", "surub")) return [
    "Poate fi util pentru eliminarea jocului mecanic, a zgomotelor sau pentru înlocuirea elementelor de fixare uzate.",
    "Diametrul, lungimea, pasul și poziția de montaj trebuie confirmate înainte de comandă."
  ];
  if (contains("controller", "controler", "kit controller")) return [
    "Este o variantă de luat în calcul când trotineta nu mai accelerează ori motorul nu mai trage, dar aceste simptome nu confirmă singure defectarea controllerului.",
    "Compară tensiunea, conectorii și versiunea exactă a trotinetei sau cere o verificare tehnică înainte de comandă."
  ];
  return [];
}

function discoveryDescription(product) {
  const name = cleanText(product.name);
  const withConversationEnrichment = conversationEnrichmentEnabled(product);
  const boomagAccessory = isBoomagAccessory(product);
  const category = cleanText(product.category_name);
  const base = boomagAccessory
    ? `${name}${category ? `, disponibil în categoria ${category}` : ""} din magazinul G-Trots.`
    : (cleanText(product.description_html) || cleanText(product.meta_description) || cleanText(product.short_description) || name);
  let lead = excerpt(base, 3200);
  if (lead && !/[.!?…]$/u.test(lead)) lead += ".";
  const parts = [lead];
  const compatibility = (product.brands || []).map(brand => cleanText(brand.name)).filter(Boolean);
  if (withConversationEnrichment && compatibility.length) parts.push(`Compatibilitatea indicată este: ${compatibility.slice(0, 12).join(", ")}.`);
  const specifications = (product.specifications || []).slice(0, 12).map(specification => {
    const label = cleanText(specification.label || specification.name);
    const value = cleanText(specification.value);
    return label && value ? `${label}: ${value}` : "";
  }).filter(Boolean);
  if (withConversationEnrichment && specifications.length) parts.push(`Detalii utile: ${specifications.join("; ")}.`);
  if (withConversationEnrichment) parts.push(...conversationContexts(product));
  parts.push("Comanda poate fi livrată oriunde în România.");
  if (withConversationEnrichment) {
    parts.push("Dacă vrei să eviți alegerea greșită, G-Trots poate verifica piesa după codul produsului, model, an, fotografii și specificații; pentru piesele potrivite există și montaj la service-ul din București, cu disponibilitatea și costul confirmate separat.");
  }
  return excerpt(parts.filter(Boolean).join(" "), 5000);
}

function decodeProduct(row) {
  const promotion = Array.isArray(row[27]) ? {
    id: row[27][0],
    code: row[27][1],
    title: row[27][2],
    discount_type: row[27][3],
    discount_value: row[27][4]
  } : null;
  return {
    id: row[0],
    slug: row[1],
    sku: row[2],
    ean: row[3],
    name: row[4],
    short_description: row[5],
    category_id: row[6],
    category_name: row[7],
    category_slug: row[8],
    manufacturer_id: row[9],
    manufacturer_name: row[10],
    manufacturer_slug: row[11],
    brands: Array.isArray(row[12]) ? row[12].map(brand => ({ id: brand[0], name: brand[1], slug: brand[2] })) : [],
    images: row[13] ? [{ url: row[13] }] : [],
    price: row[14],
    sale_price: row[15],
    discount_type: row[16],
    discount_value: row[17],
    currency: row[18],
    stock_mode: row[19],
    stock_quantity: row[20],
    low_stock_threshold: row[21],
    is_featured: row[22],
    featured_rank: row[23],
    promotion_price: row[24],
    price_before_promotion: row[25],
    promotion_discount_percent: row[26],
    active_promotion: promotion,
    meta_title: row[28] || "",
    meta_description: row[29] || "",
    legal_warranty_months: row[30] ?? null,
    commercial_warranty_months: row[31] ?? null,
    // Dacă serverul nu transmite clasificarea explicită, generatorul nu
    // inventează contexte conversaționale și nu presupune sursa produsului.
    discovery_enrichment_enabled: row[32] === undefined ? false : Boolean(row[32]),
    is_boomag_source: row[33] === undefined ? false : Boolean(row[33]),
    is_accessory_category: row[34] === undefined ? false : Boolean(row[34])
  };
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "G-Trots-local-SEO-generator/1.0" },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Catalogul public nu a putut fi citit: ${lastError?.message || "eroare necunoscută"}`);
}

async function loadPublicProducts() {
  const firstUrl = `${API_URL}?action=publicProductsPage&page=1&page_size=${PAGE_SIZE}`;
  const first = await fetchJson(firstUrl);
  if (first?.v !== 1 || !Array.isArray(first.p)) throw new Error("Răspunsul catalogului public are un format necunoscut.");
  const total = Math.max(first.p.length, Number(first.total || 0));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const payloads = [first];
  for (let page = 2; page <= pages; page += 1) {
    payloads.push(await fetchJson(`${API_URL}?action=publicProductsPage&page=${page}&page_size=${PAGE_SIZE}`));
  }
  const products = new Map();
  for (const payload of payloads) {
    if (payload?.v !== 1 || !Array.isArray(payload.p)) throw new Error("O pagină din catalog are un format necunoscut.");
    for (const row of payload.p) {
      const product = decodeProduct(row);
      const slug = safeSlug(product.slug);
      products.set(slug, { ...product, slug });
    }
  }
  return { products: [...products.values()].sort((a, b) => a.slug.localeCompare(b.slug, "ro")), reportedTotal: total };
}

function replaceMeta(html, attribute, key, value) {
  const escaped = escapeHtml(value);
  const attributePattern = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta\\s+([^>]*\\b${attributePattern}="${keyPattern}"[^>]*)>`, "i");
  if (pattern.test(html)) {
    return html.replace(pattern, (_full, attributes) => {
      const tag = `<meta ${attributes}>`;
      return /\bcontent="[^"]*"/i.test(tag)
        ? tag.replace(/\bcontent="[^"]*"/i, `content="${escaped}"`)
        : `${tag.slice(0, -1)} content="${escaped}">`;
    });
  }
  return html.replace("</head>", `    <meta ${attribute}="${escapeHtml(key)}" content="${escaped}">\n  </head>`);
}

function renderProductPage(template, product) {
  const slug = safeSlug(product.slug);
  const canonical = `${WEBSITE_BASE_URL}/magazin/produs/${encodeURIComponent(slug)}/`;
  const name = cleanText(product.name) || "Produs G-Trots";
  const category = cleanText(product.category_name);
  const manufacturer = cleanText(product.manufacturer_name);
  const brands = (product.brands || []).map(brand => cleanText(brand.name)).filter(Boolean);
  const withConversationEnrichment = conversationEnrichmentEnabled(product);
  const boomagAccessory = isBoomagAccessory(product);
  const customDescription = boomagAccessory ? "" : cleanText(product.meta_description);
  const descriptionSource = boomagAccessory
    ? `${name}${category ? `, disponibil în categoria ${category}` : ""} din magazinul G-Trots.`
    : (customDescription || cleanText(product.short_description)
      || `${name} disponibil la G-Trots, cu prețul și disponibilitatea afișate pe pagina produsului.`);
  const primaryCompatibility = brands[0] || "";
  const descriptionContext = [];
  if (withConversationEnrichment && primaryCompatibility && !descriptionSource.toLocaleLowerCase("ro-RO").includes(primaryCompatibility.toLocaleLowerCase("ro-RO"))) {
    descriptionContext.push(`Compatibilitate: ${excerpt(brands.slice(0, 4).join(", "), 70)}.`);
  }
  if (withConversationEnrichment && category && !descriptionSource.toLocaleLowerCase("ro-RO").includes(category.toLocaleLowerCase("ro-RO"))) {
    descriptionContext.push(`Categorie: ${excerpt(category, 48)}.`);
  }
  const context = descriptionContext.join(" ");
  const fallbackDescription = context
    ? excerpt(`${excerpt(descriptionSource, Math.max(55, 159 - context.length))} ${context}`, 160)
    : excerpt(descriptionSource, 160);
  const description = customDescription || fallbackDescription;
  let fallbackTitle = name;
  if (withConversationEnrichment && primaryCompatibility && !name.toLocaleLowerCase("ro-RO").includes(primaryCompatibility.toLocaleLowerCase("ro-RO"))) {
    const compatibilityForTitle = excerpt(primaryCompatibility, 22);
    fallbackTitle = `${excerpt(name, Math.max(24, 55 - ` pentru ${compatibilityForTitle}`.length))} pentru ${compatibilityForTitle}`;
  }
  const title = cleanText(product.meta_title) || seoTitle(fallbackTitle);
  const currency = cleanText(product.currency) || "RON";
  const priceText = currentPrice(product).toFixed(2);
  const inStock = isInStock(product);
  const availabilityText = inStock ? "in stock" : "out of stock";
  const availabilitySchema = inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const images = (product.images || []).map(image => absoluteUrl(image.url || image.image_path)).filter(Boolean);
  if (!images.length) images.push(`${WEBSITE_BASE_URL}/assets/magazin-produse-v1.png`);

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonical}#product`,
    name,
    description,
    image: images,
    url: canonical,
    ...(cleanText(product.sku) ? { sku: cleanText(product.sku), mpn: cleanText(product.sku) } : {}),
    ...(category ? { category } : {}),
    ...(manufacturer ? { brand: { "@type": "Brand", name: manufacturer } } : {}),
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: currency,
      price: priceText,
      availability: availabilitySchema,
      seller: { "@id": `${WEBSITE_BASE_URL}/#organization` },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "RO",
        returnPolicyCountry: "RO",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 30,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
        merchantReturnLink: `${WEBSITE_BASE_URL}/politica-de-retur`
      }
    }
  };
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${WEBSITE_BASE_URL}/#organization`,
    name: "G-Trots România",
    legalName: "CAB IT EXPERT S.R.L.",
    taxID: "49972605",
    url: `${WEBSITE_BASE_URL}/`,
    logo: `${WEBSITE_BASE_URL}/assets/logo.png`,
    telephone: "+40762093915",
    email: "contact@g-trots.ro",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Str. Humulești nr. 131-135, lot 4",
      addressLocality: "București",
      addressRegion: "Sector 5",
      postalCode: "052262",
      addressCountry: "RO"
    }
  };
  const gtin = validGtin(product.ean);
  if (gtin) productSchema[`gtin${gtin.length}`] = gtin;
  const legalWarranty = Math.max(0, Number(product.legal_warranty_months || 0));
  const commercialWarranty = Math.max(0, Number(product.commercial_warranty_months || 0));
  const additionalProperties = [];
  if (brands.length) additionalProperties.push({ "@type": "PropertyValue", name: "Compatibilitate", value: brands.slice(0, 8).join(", ") });
  if (legalWarranty > 0) additionalProperties.push({ "@type": "PropertyValue", name: "Garanție legală", value: `${legalWarranty} luni` });
  if (commercialWarranty > 0) additionalProperties.push({ "@type": "PropertyValue", name: "Garanție comercială", value: `${commercialWarranty} luni` });
  if (additionalProperties.length) productSchema.additionalProperty = additionalProperties;
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Acasă", item: `${WEBSITE_BASE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Magazin", item: `${WEBSITE_BASE_URL}/magazin` },
      { "@type": "ListItem", position: 3, name, item: canonical }
    ]
  };

  let html = template.replace(/<title>.*?<\/title>/is, `<title>${escapeHtml(title)}</title>`);
  html = replaceMeta(html, "name", "description", description);
  html = replaceMeta(html, "name", "robots", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  html = replaceMeta(html, "property", "og:title", title);
  html = replaceMeta(html, "property", "og:description", description);
  html = replaceMeta(html, "property", "og:url", canonical);
  html = replaceMeta(html, "property", "og:image", images[0]);
  html = replaceMeta(html, "property", "og:image:secure_url", images[0]);
  html = replaceMeta(html, "property", "og:image:alt", name);
  html = replaceMeta(html, "property", "og:site_name", "G-Trots România");
  html = replaceMeta(html, "name", "twitter:title", title);
  html = replaceMeta(html, "name", "twitter:description", description);
  html = replaceMeta(html, "name", "twitter:image", images[0]);
  html = replaceMeta(html, "name", "twitter:image:alt", name);
  html = replaceMeta(html, "property", "product:price:amount", priceText);
  html = replaceMeta(html, "property", "product:price:currency", currency);
  html = replaceMeta(html, "property", "product:availability", availabilityText);
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${escapeHtml(canonical)}">`);
  html = html.replace(/<link\s+rel="preload"\s+href="[^"]*"\s+as="image"[^>]*>/i, `<link rel="preload" href="${escapeHtml(images[0])}" as="image">`);
  html = html.replace(/\s*<script\s+type="application\/ld\+json"(?![^>]*data-gt-organization-schema)[^>]*>.*?<\/script>/gis, "");
  const structuredData = [organizationSchema, productSchema, breadcrumbSchema]
    .map(schema => {
      const type = schema["@type"];
      const attribute = type === "Organization"
        ? "data-gt-organization-schema"
        : (type === "BreadcrumbList" ? "data-gt-breadcrumb-schema" : 'data-gt-product-schema="1"');
      return `    <script type="application/ld+json" ${attribute}>${safeJson(schema)}</script>`;
    })
    .join("\n");
  html = html.replace("</head>", `${structuredData}\n    <script type="application/json" id="gt-product-bootstrap">${safeJson(product)}</script>\n  </head>`);
  html = html.replace(" is-live-product-loading", "");
  html = html.replace(/\s*<section\b[^>]*\bclass="[^"]*\bproduct-page-loading\b[^"]*"[^>]*>.*?<\/section>\s*(?=<div\b[^>]*\bclass="product-detail-breadcrumb)/is, "\n      ");
  html = html.replace(/(<body\b[^>]*\bdata-product-id=")[^"]*(")/i, `$1${escapeHtml(slug)}$2`);
  html = html.replace(/(<b\b[^>]*\bdata-product-sku\b[^>]*>).*?(<\/b>)/is, `$1${escapeHtml(cleanText(product.sku) || "—")}$2`);

  const displayWarranty = commercialWarranty > 0 ? commercialWarranty : legalWarranty;
  const warrantyBadge = displayWarranty > 0
    ? `<span class="product-warranty-badge" data-product-warranty-badge>Garanție ${displayWarranty} luni</span>`
    : '<span class="product-warranty-badge" data-product-warranty-badge hidden></span>';
  let warrantyCard = "";
  if (displayWarranty > 0) {
    const warrantyTitle = commercialWarranty > 0
      ? `Garanție comercială: ${commercialWarranty} luni`
      : `Garanție produs: ${legalWarranty} luni`;
    const warrantyDetail = legalWarranty > 0 && commercialWarranty > 0
      ? `Garanția legală declarată este de ${legalWarranty} luni.`
      : "Detaliile și condițiile aplicabile sunt disponibile în politica de garanție G-Trots.";
    warrantyCard = `<aside class="product-warranty-card" data-product-warranty><span class="product-warranty-card__shield" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5.1-3.4 8.4-8 10-4.6-1.6-8-4.9-8-10V6l8-3Z"></path><path d="m8.5 12 2.2 2.2 4.8-5"></path></svg></span><div><small>PROTECȚIE G-TROTS</small><strong>${escapeHtml(warrantyTitle)}</strong><p>${escapeHtml(warrantyDetail)}</p></div></aside>`;
  }
  html = html.replace(/<span\b[^>]*\bdata-product-warranty-badge\b[^>]*>.*?<\/span>/is, warrantyBadge);
  html = html.replace(/[ \t]*<aside\b[^>]*\bdata-product-warranty\b[^>]*>.*?<\/aside>\r?\n?/is, warrantyCard ? `              ${warrantyCard}\n` : "");

  const staticSpecs = [
    category ? ["Categorie", category] : null,
    manufacturer ? ["Producător", manufacturer] : null,
    brands.length ? ["Compatibilitate", brands.slice(0, 4).join(", ")] : null,
    cleanText(product.sku) ? ["Cod produs", cleanText(product.sku)] : null,
    gtin ? ["EAN", gtin] : null
  ].filter(Boolean).map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>`).join("");
  const compatibilityCopy = withConversationEnrichment && brands.length ? ` Compatibilitate declarată: ${brands.slice(0, 6).join(", ")}.` : "";
  const intentCopy = `Acest produs este disponibil pentru cumpărare online.${compatibilityCopy}${withConversationEnrichment ? " G-Trots oferă asistență pentru alegerea piesei potrivite și, atunci când este aplicabil, service sau montaj separat în București și Ilfov." : ""}`;
  const staticArticle = `<article class="product-static-seo shell" data-gt-static-product aria-labelledby="gt-static-product-title"><div><p class="product-static-seo__eyebrow">Produs G-Trots</p><h1 id="gt-static-product-title">${escapeHtml(name)}</h1><p>${escapeHtml(description)}</p><p class="product-static-seo__intent">${escapeHtml(intentCopy)}</p><strong class="product-static-seo__price">${escapeHtml(`${priceText} ${currency}`)}</strong><span class="product-static-seo__stock">${inStock ? "În stoc" : "Stoc epuizat"}</span>${staticSpecs ? `<ul>${staticSpecs}</ul>` : ""}</div><img src="${escapeHtml(images[0])}" alt="${escapeHtml(name)}" width="720" height="720" fetchpriority="high"></article>`;
  html = html.replace(/(<main\b[^>]*id="product-detail"[^>]*>)/i, `$1\n      ${staticArticle}`);
  return html;
}

async function atomicWrite(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, contents, "utf8");
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
    await rm(filePath, { force: true });
    await rename(temporaryPath, filePath);
  }
}

async function readManifest() {
  try {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    return Array.isArray(manifest.slugs) ? manifest.slugs.map(safeSlug) : [];
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function removeStaleGeneratedPages(previousSlugs, currentSlugs) {
  const current = new Set(currentSlugs);
  let removed = 0;
  for (const previousSlug of previousSlugs) {
    if (current.has(previousSlug)) continue;
    const directory = path.resolve(PRODUCT_ROOT, safeSlug(previousSlug));
    if (path.dirname(directory) !== path.resolve(PRODUCT_ROOT)) throw new Error("Țintă nesigură detectată la reconcilierea paginilor.");
    await rm(path.join(directory, "index.html"), { force: true });
    try {
      await rmdir(directory);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTEMPTY") throw error;
    }
    removed += 1;
  }
  return removed;
}

function buildSitemap(products) {
  const rows = products.map(product => {
    const loc = `${WEBSITE_BASE_URL}/magazin/produs/${encodeURIComponent(product.slug)}/`;
    const image = absoluteUrl(product.images?.[0]?.url || product.images?.[0]?.image_path || "");
    return `  <url><loc>${escapeXml(loc)}</loc><lastmod>${GENERATED_ON}</lastmod>${image ? `<image:image><image:loc>${escapeXml(image)}</image:loc></image:image>` : ""}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${rows.join("\n")}\n</urlset>\n`;
}

function replaceGeneratedBlock(html, startMarker, endMarker, contents) {
  const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escapePattern(startMarker)})[\\s\\S]*?(${escapePattern(endMarker)})`);
  if (!pattern.test(html)) throw new Error(`Marker HTML lipsă: ${startMarker}`);
  return html.replace(pattern, (_match, start, end) => `${start}\n${contents}\n              ${end}`);
}

function catalogPrice(value) {
  return new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function storeStock(product) {
  if (!isInStock(product)) return { label: "Stoc epuizat", key: "out-of-stock", rank: 2, css: " is-out" };
  if (product.stock_mode !== "unlimited" && Number(product.stock_quantity || 0) <= Number(product.low_stock_threshold || 3)) {
    return { label: "Stoc limitat", key: "in-stock", rank: 1, css: " is-low" };
  }
  return { label: "În stoc", key: "in-stock", rank: 0, css: "" };
}

function buildStoreProductCard(product, index) {
  const slug = safeSlug(product.slug);
  const route = `/magazin/produs/${encodeURIComponent(slug)}/`;
  const name = cleanText(product.name) || "Produs G-Trots";
  const categoryName = cleanText(product.category_name) || "Produs";
  const categorySlug = cleanText(product.category_slug) || "produse";
  const manufacturerName = cleanText(product.manufacturer_name);
  const manufacturerSlug = cleanText(product.manufacturer_slug);
  const brands = (product.brands || []).map(brand => ({ name: cleanText(brand.name), slug: cleanText(brand.slug) })).filter(brand => brand.name);
  const brandNames = brands.map(brand => brand.name);
  const brandSlugs = brands.map(brand => brand.slug).filter(Boolean);
  const cardLabel = brandNames[0] || manufacturerName || categoryName;
  const description = cleanText(product.short_description) || `${name} disponibil în magazinul G-Trots.`;
  const imageUrl = absoluteUrl(product.images?.[0]?.url || product.images?.[0]?.image_path || "") || `${WEBSITE_BASE_URL}/assets/logo.png`;
  const price = currentPrice(product);
  const standardPrice = Number(product.promotion_price == null ? product.price : (product.price_before_promotion ?? product.sale_price ?? product.price)) || price;
  const hasDiscount = price > 0 && standardPrice > price;
  const discountPercent = hasDiscount ? Math.max(0, Math.round((1 - price / standardPrice) * 100)) : 0;
  const stock = storeStock(product);
  const featuredRank = product.is_featured && Number.isFinite(Number(product.featured_rank)) ? String(product.featured_rank) : "";
  const search = excerpt(`${name} ${categoryName} ${manufacturerName} ${description} ${brandNames.join(" ")} ${cleanText(product.sku)} ${cleanText(product.ean)}`, 900);
  const brandBadges = brandNames.slice(0, 4).map(brand => `<span>${escapeHtml(brand)}</span>`).join("");
  const oldPrice = hasDiscount ? `<del>${escapeHtml(catalogPrice(standardPrice))} lei</del>` : "";
  const discount = discountPercent > 0 ? `<em class="product-discount">-${discountPercent}%</em>` : "";
  const featured = product.is_featured ? '<span class="product-badge">Recomandat</span>' : "";

  return `              <article class="product-card live-product-card visible" data-product-id="${escapeHtml(slug)}" data-api-product-id="${escapeHtml(product.id)}" data-category="${escapeHtml(categorySlug)}" data-taxonomy="produse ${escapeHtml(categorySlug)}" data-brand="${escapeHtml(brandSlugs.join(" "))}" data-stock="${stock.key}" data-stock-rank="${stock.rank}" data-featured-rank="${escapeHtml(featuredRank)}" data-manufacturer="${escapeHtml(manufacturerSlug)}" data-price="${price}" data-name="${escapeHtml(name)}" data-identifiers="${escapeHtml(`${cleanText(product.sku)} ${cleanText(product.ean)} ${product.id}`)}" data-search="${escapeHtml(search)}" data-route="${route}" data-image="${escapeHtml(imageUrl)}" data-category-name="${escapeHtml(categoryName)}" data-manufacturer-name="${escapeHtml(manufacturerName)}" data-brand-names="${escapeHtml(brandNames.join(", "))}" data-stock-label="${stock.label}" data-short-description="${escapeHtml(description)}" data-index="${index}">
                <div class="product-stage">
                  ${featured}
                  <div class="product-card-actions"><button class="cart-button" type="button" data-add-cart aria-label="Adaugă ${escapeHtml(name)} în coș"><span class="global-cart-icon" aria-hidden="true"><i></i><i></i></span><b aria-hidden="true">+</b></button><button class="favorite-button" type="button" aria-label="Adaugă ${escapeHtml(name)} la favorite" aria-pressed="false">♡</button></div>
                  <div class="product-image product-image-live" style="background-image:url('${escapeHtml(imageUrl)}')" role="img" aria-label="${escapeHtml(name)}"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" width="720" height="720" loading="lazy" decoding="async"></div>
                  <span class="product-quick-note${stock.css}"><i></i>${stock.label}</span>
                </div>
                <div class="product-info"><span class="product-category"><i></i>${escapeHtml(cardLabel)}</span><h3>${escapeHtml(name)}</h3><div class="product-summary" tabindex="0" aria-label="Pe scurt: ${escapeHtml(description)}"><span class="product-summary-badge"><i aria-hidden="true"></i>Pe scurt</span><p>${escapeHtml(description)}</p><span class="product-summary-tooltip" aria-hidden="true">${escapeHtml(description)}</span></div>${brandBadges ? `<div class="product-fit" aria-label="Mărci compatibile">${brandBadges}</div>` : ""}</div>
                <div class="product-bottom"><div class="product-price"><small>${hasDiscount ? "Preț promoțional" : "Preț"}</small><strong>${escapeHtml(catalogPrice(price))} <span>lei</span></strong>${oldPrice}</div><div class="product-bottom-action">${discount}<span class="product-open-hint" aria-hidden="true">›</span></div></div>
                <a class="product-card-link" href="${route}" aria-label="Deschide pagina produsului ${escapeHtml(name)}"></a>
              </article>`;
}

function storePageUrl(page) {
  return page <= 1 ? `${WEBSITE_BASE_URL}/magazin` : `${WEBSITE_BASE_URL}/magazin/pagina/${page}/`;
}

function storePaginationSequence(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const important = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const pages = [...important].filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const sequence = [];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) sequence.push("ellipsis");
    sequence.push(page);
  });
  return sequence;
}

function buildStorePagination(currentPage, totalPages) {
  const links = storePaginationSequence(currentPage, totalPages).map(page => {
    if (page === "ellipsis") return '<span class="pagination-ellipsis" aria-hidden="true">…</span>';
    return `<a class="pagination-button" href="${escapeHtml(storePageUrl(page).replace(WEBSITE_BASE_URL, ""))}" aria-label="Pagina ${page}"${page === currentPage ? ' aria-current="page"' : ""}>${page}</a>`;
  }).join("\n                ");
  const previous = currentPage > 1
    ? `<a class="pagination-button pagination-nav" href="${escapeHtml(storePageUrl(currentPage - 1).replace(WEBSITE_BASE_URL, ""))}" rel="prev" aria-label="Pagina anterioară">‹</a>`
    : '<span class="pagination-button pagination-nav" aria-disabled="true">‹</span>';
  const next = currentPage < totalPages
    ? `<a class="pagination-button pagination-nav" href="${escapeHtml(storePageUrl(currentPage + 1).replace(WEBSITE_BASE_URL, ""))}" rel="next" aria-label="Pagina următoare">›</a>`
    : '<span class="pagination-button pagination-nav" aria-disabled="true">›</span>';
  return `                ${previous}\n                ${links}\n                ${next}`;
}

function renderStorePage(template, products, currentPage, totalPages) {
  const canonical = storePageUrl(currentPage);
  const title = currentPage === 1
    ? "Piese și accesorii trotinete electrice | G-Trots"
    : `Piese și accesorii trotinete electrice – Pagina ${currentPage} | G-Trots`;
  const description = currentPage === 1
    ? "Magazin G-Trots cu piese, accesorii și trotinete electrice: cauciucuri, baterii, motoare, frâne, display-uri și ajutor de service pentru alegerea compatibilă."
    : `Pagina ${currentPage} din catalogul G-Trots cu piese, accesorii și trotinete electrice, prețuri și disponibilitate actualizate.`;
  const first = (currentPage - 1) * STORE_PAGE_SIZE;
  const last = Math.min(first + STORE_PAGE_SIZE, products.length);
  const cards = products.slice(first, last).map((product, offset) => buildStoreProductCard(product, first + offset)).join("\n");
  if (!cards) throw new Error(`Pagina ${currentPage} a catalogului nu conține produse.`);

  let html = template.replace(/<title>.*?<\/title>/is, `<title>${escapeHtml(title)}</title>`);
  html = replaceMeta(html, "name", "description", description);
  html = replaceMeta(html, "property", "og:title", title);
  html = replaceMeta(html, "property", "og:description", description);
  html = replaceMeta(html, "property", "og:url", canonical);
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${escapeHtml(canonical)}">`);
  html = html.replace(/\s*<link\b[^>]*\bdata-gt-catalog-rel\b[^>]*>/gi, "");
  const relationLinks = [
    currentPage > 1 ? `<link rel="prev" href="${escapeHtml(storePageUrl(currentPage - 1))}" data-gt-catalog-rel>` : "",
    currentPage < totalPages ? `<link rel="next" href="${escapeHtml(storePageUrl(currentPage + 1))}" data-gt-catalog-rel>` : ""
  ].filter(Boolean).join("\n    ");
  if (relationLinks) html = html.replace("</head>", `    ${relationLinks}\n  </head>`);
  html = html.replace(/<body\b([^>]*)>/i, (_tag, attributes) => {
    const cleanAttributes = attributes.replace(/\sdata-catalog-page="[^"]*"/i, "");
    return `<body${cleanAttributes} data-catalog-page="${currentPage}">`;
  });
  html = html.replace(/<div\b[^>]*\bid="product-grid"[^>]*>/i, tag => {
    let nextTag = tag.replace(/\s+is-catalog-loading\b/, "");
    nextTag = /\baria-busy="[^"]*"/i.test(nextTag)
      ? nextTag.replace(/\baria-busy="[^"]*"/i, 'aria-busy="false"')
      : nextTag.replace(/>$/, ' aria-busy="false">');
    return nextTag;
  });
  html = replaceGeneratedBlock(html, STORE_PRODUCTS_START, STORE_PRODUCTS_END, cards);
  html = replaceGeneratedBlock(html, STORE_PAGINATION_START, STORE_PAGINATION_END, buildStorePagination(currentPage, totalPages));
  html = html.replace(/(<strong\b[^>]*\bid="results-count"[^>]*>)[\s\S]*?(<\/strong>)/i, (_match, start, end) => `${start}${products.length} produse${end}`);
  html = html.replace(/(<p\b[^>]*\bid="pagination-range"[^>]*>)[\s\S]*?(<\/p>)/i, (_match, start, end) => `${start}${first + 1}–${last} din ${products.length}${end}`);
  return html;
}

function buildStoreSitemap(totalPages) {
  const rows = Array.from({ length: totalPages }, (_, index) => `  <url><loc>${escapeXml(storePageUrl(index + 1))}</loc><lastmod>${GENERATED_ON}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}

async function generateStorePages(template, products) {
  const resolvedRoot = path.resolve(STORE_PAGINATION_ROOT);
  const expectedParent = path.resolve(WEBSITE_ROOT, "magazin");
  if (path.dirname(resolvedRoot) !== expectedParent || path.basename(resolvedRoot) !== "pagina") {
    throw new Error("Țintă nesigură pentru paginarea catalogului.");
  }
  const totalPages = Math.max(1, Math.ceil(products.length / STORE_PAGE_SIZE));
  await rm(resolvedRoot, { recursive: true, force: true });
  await atomicWrite(STORE_PAGE_PATH, renderStorePage(template, products, 1, totalPages));
  for (let page = 2; page <= totalPages; page += 1) {
    await atomicWrite(path.join(resolvedRoot, String(page), "index.html"), renderStorePage(template, products, page, totalPages));
  }
  await atomicWrite(STORE_SITEMAP_PATH, buildStoreSitemap(totalPages));
  return totalPages;
}

function buildCatalogPage(products) {
  const groups = new Map();
  for (const product of products) {
    const category = cleanText(product.category_name) || "Alte produse";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  }
  const sections = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ro"))
    .map(([category, items]) => {
      const links = items.map(product => {
        const url = `${WEBSITE_BASE_URL}/magazin/produs/${encodeURIComponent(product.slug)}/`;
        const price = currentPrice(product).toFixed(2);
        const availability = isInStock(product) ? "În stoc" : "Stoc epuizat";
        return `<li><a href="${escapeHtml(url)}">${escapeHtml(cleanText(product.name) || product.slug)}</a><span>${escapeHtml(`${price} ${cleanText(product.currency) || "RON"}`)} · ${availability}</span></li>`;
      }).join("\n");
      return `<section><h2>${escapeHtml(category)}</h2><ul>${links}</ul></section>`;
    }).join("\n");
  return `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catalog complet produse G-Trots</title>
<meta name="description" content="Catalogul HTML complet al produselor G-Trots, cu legături directe, preț efectiv și disponibilitate actualizată.">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${WEBSITE_BASE_URL}/catalog-produse">
<link rel="icon" href="/assets/logo.png" type="image/png">
<style>html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b0b0d;color:#f7f2ed;font:16px/1.55 system-ui,sans-serif}main{width:min(1160px,calc(100% - 32px));margin:auto;padding:56px 0 80px}a{color:#ff8b33}h1{font-size:clamp(2rem,6vw,4.5rem);line-height:1.05;margin:.25em 0}h2{margin:2.2rem 0 .7rem;color:#ffb074}p{max-width:75ch;color:#c9c2bc}ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:8px;margin:0;padding:0;list-style:none}li{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border:1px solid #2f2f35;border-radius:14px;background:#17171b}li span{font-size:.85rem;color:#aaa3a0}.back{display:inline-block;margin-bottom:24px}</style></head>
<body><main><a class="back" href="/magazin">← Magazin</a><h1>Catalog complet G-Trots</h1><p>${products.length} produse publice, fiecare cu pagină canonică și date structurate Product + Offer. Prețul și stocul de pe pagina produsului sunt sursa finală.</p>${sections}</main><script src="/legal-footer.js?v=20260910-conversion-v1" defer></script></body></html>\n`;
}

function buildAiCatalog(products) {
  const payload = {
    schema_version: 4,
    generated_at: new Date().toISOString(),
    publisher: {
      name: "G-Trots România",
      legal_name: "CAB IT EXPERT S.R.L.",
      url: `${WEBSITE_BASE_URL}/`,
      currency: "RON",
      market: "RO",
      language: "ro-RO"
    },
    business: {
      roles: ["magazin online de piese și accesorii pentru trotinete electrice", "service de trotinete și scutere electrice"],
      summary: "G-Trots comercializează piese și accesorii pentru trotinete electrice și oferă diagnosticare, reparații și montaj în București și Ilfov.",
      shop_url: `${WEBSITE_BASE_URL}/magazin`,
      service_url: `${WEBSITE_BASE_URL}/service-trotinete-electrice`,
      contact_url: `${WEBSITE_BASE_URL}/contact`,
      telephone: "+40762093915",
      email: "contact@g-trots.ro",
      shopping_market: "România",
      delivery_area: ["România"],
      service_area: ["București", "Ilfov"]
    },
    services: [{
      name: "Service și reparații trotinete electrice",
      url: `${WEBSITE_BASE_URL}/service-trotinete-electrice`,
      area_served: ["București", "Ilfov"],
      service_types: ["diagnosticare", "frâne", "anvelope și camere", "baterii și încărcare", "controller și electronică", "motor", "cablaje", "suspensii", "revizii", "montaj piese"],
      confirmation: "Disponibilitatea, diagnosticul și costul se confirmă direct cu G-Trots."
    }],
    source_of_truth: "Pagina canonică a produsului stabilește prețul și disponibilitatea curentă.",
    products: products.map(product => {
      const name = cleanText(product.name);
      const savedMetaTitle = cleanText(product.meta_title);
      const savedMetaDescription = cleanText(product.meta_description);
      const shortDescription = excerpt(product.short_description, 320);
      const descriptionExcerpt = excerpt(product.description_html || product.short_description, 650);
      const specifications = (product.specifications || []).slice(0, 16).map(specification => ({
        name: cleanText(specification.label || specification.name),
        value: cleanText(specification.value)
      })).filter(specification => specification.name && specification.value);
      const legalWarranty = Math.max(0, Number(product.legal_warranty_months || 0));
      const commercialWarranty = Math.max(0, Number(product.commercial_warranty_months || 0));
      const withConversationEnrichment = conversationEnrichmentEnabled(product);
      return {
        id: String(product.id ?? ""),
        name,
        meta_title: savedMetaTitle || `${excerpt(name, 55)} | G-Trots`,
        meta_description: savedMetaDescription,
        short_description: shortDescription,
        description_excerpt: descriptionExcerpt,
        description: savedMetaDescription || shortDescription || descriptionExcerpt,
        url: `${WEBSITE_BASE_URL}/magazin/produs/${encodeURIComponent(product.slug)}/`,
        sku: cleanText(product.sku),
        gtin: validGtin(product.ean),
        manufacturer: cleanText(product.manufacturer_name),
        category: cleanText(product.category_name),
        compatibility: (product.brands || []).map(brand => cleanText(brand.name)).filter(Boolean),
        specifications,
        conversation_intents: conversationContexts(product),
        compatibility_guidance: withConversationEnrichment
          ? "Confirmă modelul, anul sau versiunea și specificațiile relevante înainte de comandă; piesele asemănătoare vizual nu sunt întotdeauna interschimbabile."
          : null,
        delivery: "Livrare disponibilă în toată România.",
        service_support: withConversationEnrichment
          ? "Verificarea compatibilității și montajul pot fi solicitate separat la service-ul G-Trots din București, în funcție de piesă."
          : null,
        warranty: legalWarranty > 0 || commercialWarranty > 0
          ? { legal_months: legalWarranty, commercial_months: commercialWarranty }
          : null,
        price: Number(currentPrice(product).toFixed(2)),
        currency: cleanText(product.currency) || "RON",
        availability: isInStock(product) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        image: absoluteUrl(product.images?.[0]?.url || product.images?.[0]?.image_path || "")
      };
    })
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function buildOpenAiProductFeed(products) {
  const lines = [];
  let excludedMissingBrand = 0;
  let excludedOtherInvalid = 0;
  for (const product of products) {
    const itemId = String(product.id || "").trim();
    const title = cleanText(product.name);
    const brand = cleanText(product.manufacturer_name);
    const imageUrl = absoluteUrl(product.images?.[0]?.url || product.images?.[0]?.image_path || "");
    const currency = (cleanText(product.currency) || "RON").toUpperCase();
    const price = currentPrice(product);
    if (!itemId || !product.slug || !title || !brand || !imageUrl || price <= 0 || !/^[A-Z]{3}$/.test(currency)) {
      if (!brand) excludedMissingBrand += 1;
      else excludedOtherInvalid += 1;
      continue;
    }
    const canonical = `${WEBSITE_BASE_URL}/magazin/produs/${encodeURIComponent(product.slug)}/`;
    const record = {
      item_id: itemId,
      title: excerpt(title, 150),
      description: discoveryDescription(product),
      url: `${canonical}?utm_source=chatgpt.com&utm_medium=feed&utm_campaign=product_discovery`,
      brand,
      seller_name: "G-Trots",
      image_url: imageUrl,
      availability: isInStock(product) ? "in_stock" : "out_of_stock",
      price: `${price.toFixed(2)} ${currency}`,
      is_eligible_search: true,
      seller_url: `${WEBSITE_BASE_URL}/magazin`
    };
    const category = cleanText(product.category_name);
    if (category) record.product_category = category;
    const mpn = cleanText(product.sku);
    if (mpn) record.mpn = mpn;
    const gtin = validGtin(product.ean);
    if (gtin) record.gtin = gtin;
    lines.push(JSON.stringify(record));
  }
  return {
    contents: lines.length ? `${lines.join("\n")}\n` : "",
    products: lines.length,
    excluded: products.length - lines.length,
    excludedMissingBrand,
    excludedOtherInvalid
  };
}

async function updateSitemapIndex() {
  let index = await readFile(SITEMAP_INDEX_PATH, "utf8");
  const locations = [
    `${WEBSITE_BASE_URL}/sitemaps/sitemap-produse.xml`,
    `${WEBSITE_BASE_URL}/sitemaps/sitemap-magazin.xml`
  ];
  for (const location of locations) {
    const entry = `  <sitemap><loc>${escapeXml(location)}</loc><lastmod>${GENERATED_ON}</lastmod></sitemap>`;
    const escapedLocation = location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = new RegExp(`\\s*<sitemap><loc>${escapedLocation}<\\/loc><lastmod>[^<]*<\\/lastmod><\\/sitemap>`);
    index = existing.test(index)
      ? index.replace(existing, `\n${entry}`)
      : index.replace("</sitemapindex>", `${entry}\n</sitemapindex>`);
  }
  await atomicWrite(SITEMAP_INDEX_PATH, index);
}

async function main() {
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const storeTemplate = await readFile(STORE_PAGE_PATH, "utf8");
  const previousSlugs = await readManifest();
  const { products, reportedTotal } = await loadPublicProducts();
  if (!products.length) throw new Error("Catalogul public nu conține produse; generarea a fost oprită fără ștergeri.");

  for (const product of products) {
    const outputPath = path.join(PRODUCT_ROOT, product.slug, "index.html");
    await atomicWrite(outputPath, renderProductPage(template, product));
  }
  const removed = await removeStaleGeneratedPages(previousSlugs, products.map(product => product.slug));
  const storePages = await generateStorePages(storeTemplate, products);
  await atomicWrite(SITEMAP_PATH, buildSitemap(products));
  await atomicWrite(CATALOG_PAGE_PATH, buildCatalogPage(products));
  await atomicWrite(AI_CATALOG_PATH, buildAiCatalog(products));
  const openAiProductFeed = buildOpenAiProductFeed(products);
  await atomicWrite(OPENAI_PRODUCT_FEED_PATH, openAiProductFeed.contents);
  await atomicWrite(OPENAI_PRODUCT_FEED_GZIP_PATH, gzipSync(Buffer.from(openAiProductFeed.contents, "utf8"), { level: 9 }));
  await atomicWrite(OPENAI_PRODUCT_FEED_STATUS_PATH, `${JSON.stringify({
    schema: "OpenAI Product Discovery Stable",
    generated_at: new Date().toISOString(),
    encoding: "UTF-8",
    required_fields: ["item_id", "title", "description", "url", "brand", "seller_name", "image_url", "availability", "price"],
    products: openAiProductFeed.products,
    excluded: openAiProductFeed.excluded,
    excluded_missing_brand: openAiProductFeed.excludedMissingBrand,
    excluded_other_invalid: openAiProductFeed.excludedOtherInvalid,
    conversation_enrichment_scope: "Piesele Boomag din lista fixată la 2026-09-10; accesoriile și produsele adăugate ulterior sunt excluse.",
    condition_policy: "Câmpul condition nu este generat automat.",
    feed_url: `${WEBSITE_BASE_URL}/openai-products.jsonl`,
    gzip_url: `${WEBSITE_BASE_URL}/openai-products.jsonl.gz`,
    sftp_delivery: "pending_openai_onboarding"
  }, null, 2)}\n`);
  await updateSitemapIndex();
  const excludedCatalogRows = Math.max(0, reportedTotal - products.length);
  await atomicWrite(MANIFEST_PATH, `${JSON.stringify({ version: 1, generated_at: new Date().toISOString(), source: API_URL, reported_total: reportedTotal, products: products.length, catalog_rows_excluded_by_public_deduplication: excludedCatalogRows, slugs: products.map(product => product.slug) }, null, 2)}\n`);

  process.stdout.write(`${JSON.stringify({ success: true, generated: products.length, reportedTotal, excludedCatalogRows, removed, productRoot: PRODUCT_ROOT, sitemap: SITEMAP_PATH, catalogPage: CATALOG_PAGE_PATH, storePages, storeSitemap: STORE_SITEMAP_PATH, aiCatalog: AI_CATALOG_PATH, openAiProductFeed: { path: OPENAI_PRODUCT_FEED_PATH, gzipPath: OPENAI_PRODUCT_FEED_GZIP_PATH, statusPath: OPENAI_PRODUCT_FEED_STATUS_PATH, products: openAiProductFeed.products, excluded: openAiProductFeed.excluded, excludedMissingBrand: openAiProductFeed.excludedMissingBrand, excludedOtherInvalid: openAiProductFeed.excludedOtherInvalid } }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
