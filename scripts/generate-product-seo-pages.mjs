#!/usr/bin/env node

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const WEBSITE_ROOT = path.join(PROJECT_ROOT, "website");
const PRODUCT_ROOT = path.join(WEBSITE_ROOT, "magazin", "produs");
const TEMPLATE_PATH = path.join(WEBSITE_ROOT, "produs.html");
const SITEMAP_PATH = path.join(WEBSITE_ROOT, "sitemaps", "sitemap-produse.xml");
const SITEMAP_INDEX_PATH = path.join(WEBSITE_ROOT, "sitemap-index.xml");
const CATALOG_PAGE_PATH = path.join(WEBSITE_ROOT, "catalog-produse.html");
const AI_CATALOG_PATH = path.join(WEBSITE_ROOT, "ai-catalog.json");
const MANIFEST_PATH = path.join(PRODUCT_ROOT, ".generated-product-pages.json");
const WEBSITE_BASE_URL = (process.env.GTROTS_WEBSITE_URL || "https://g-trots.ro").replace(/\/$/, "");
const API_URL = process.env.GTROTS_PUBLIC_API_URL || `${WEBSITE_BASE_URL}/shop-api/api-v2.php`;
const PAGE_SIZE = 500;
const GENERATED_ON = new Date().toISOString().slice(0, 10);

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
    meta_description: row[29] || ""
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
  const brand = manufacturer || brands[0] || "G-Trots";
  const customDescription = cleanText(product.meta_description);
  const descriptionSource = customDescription || cleanText(product.short_description)
    || `${name} disponibil la G-Trots, cu informații clare despre preț, compatibilitate, livrare și service pentru trotinete electrice.`;
  const description = customDescription || excerpt(descriptionSource, 160);
  const title = cleanText(product.meta_title) || seoTitle(name);
  const currency = cleanText(product.currency) || "RON";
  const priceText = currentPrice(product).toFixed(2);
  const inStock = isInStock(product);
  const availabilityText = inStock ? "in stock" : "out of stock";
  const availabilitySchema = inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const conditionText = `${name} ${description}`.toLocaleLowerCase("ro-RO");
  const itemCondition = /second[\s-]*hand|recondiționat|reconditionat|refurbished|folosit/u.test(conditionText)
    ? "https://schema.org/UsedCondition"
    : "https://schema.org/NewCondition";
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
    brand: { "@type": "Brand", name: brand },
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: currency,
      price: priceText,
      availability: availabilitySchema,
      itemCondition,
      seller: { "@id": `${WEBSITE_BASE_URL}/#organization` },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "RO",
        returnPolicyCountry: "RO",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
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
  html = html.replace(/(<body\b[^>]*\bdata-product-id=")[^"]*(")/i, `$1${escapeHtml(slug)}$2`);

  const staticSpecs = [
    category ? ["Categorie", category] : null,
    manufacturer ? ["Producător", manufacturer] : null,
    brands.length ? ["Compatibilitate", brands.slice(0, 4).join(", ")] : null,
    cleanText(product.sku) ? ["Cod produs", cleanText(product.sku)] : null,
    gtin ? ["EAN", gtin] : null
  ].filter(Boolean).map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>`).join("");
  const staticArticle = `<article class="product-static-seo shell" data-gt-static-product aria-labelledby="gt-static-product-title"><div><p class="product-static-seo__eyebrow">Produs G-Trots</p><h1 id="gt-static-product-title">${escapeHtml(name)}</h1><p>${escapeHtml(description)}</p><strong class="product-static-seo__price">${escapeHtml(`${priceText} ${currency}`)}</strong><span class="product-static-seo__stock">${inStock ? "În stoc" : "Stoc epuizat"}</span>${staticSpecs ? `<ul>${staticSpecs}</ul>` : ""}</div><img src="${escapeHtml(images[0])}" alt="${escapeHtml(name)}" width="720" height="720" fetchpriority="high"></article>`;
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
      await rm(directory, { recursive: false });
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
<body><main><a class="back" href="/magazin">← Magazin</a><h1>Catalog complet G-Trots</h1><p>${products.length} produse publice, fiecare cu pagină canonică și date structurate Product + Offer. Prețul și stocul de pe pagina produsului sunt sursa finală.</p>${sections}</main><script src="/legal-footer.js?v=20260907-ga4-v4" defer></script></body></html>\n`;
}

function buildAiCatalog(products) {
  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    publisher: {
      name: "G-Trots România",
      legal_name: "CAB IT EXPERT S.R.L.",
      url: `${WEBSITE_BASE_URL}/`,
      currency: "RON",
      market: "RO",
      language: "ro-RO"
    },
    source_of_truth: "Pagina canonică a produsului stabilește prețul și disponibilitatea curentă.",
    products: products.map(product => ({
      id: String(product.id ?? ""),
      name: cleanText(product.name),
      url: `${WEBSITE_BASE_URL}/magazin/produs/${encodeURIComponent(product.slug)}/`,
      sku: cleanText(product.sku),
      gtin: validGtin(product.ean),
      brand: cleanText(product.manufacturer_name) || cleanText(product.brands?.[0]?.name) || "G-Trots",
      category: cleanText(product.category_name),
      price: Number(currentPrice(product).toFixed(2)),
      currency: cleanText(product.currency) || "RON",
      availability: isInStock(product) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      image: absoluteUrl(product.images?.[0]?.url || product.images?.[0]?.image_path || "")
    }))
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function updateSitemapIndex() {
  let index = await readFile(SITEMAP_INDEX_PATH, "utf8");
  const location = `${WEBSITE_BASE_URL}/sitemaps/sitemap-produse.xml`;
  const entry = `  <sitemap><loc>${escapeXml(location)}</loc><lastmod>${GENERATED_ON}</lastmod></sitemap>`;
  const escapedLocation = location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = new RegExp(`\\s*<sitemap><loc>${escapedLocation}<\\/loc><lastmod>[^<]*<\\/lastmod><\\/sitemap>`);
  index = existing.test(index)
    ? index.replace(existing, `\n${entry}`)
    : index.replace("</sitemapindex>", `${entry}\n</sitemapindex>`);
  await atomicWrite(SITEMAP_INDEX_PATH, index);
}

async function main() {
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const previousSlugs = await readManifest();
  const { products, reportedTotal } = await loadPublicProducts();
  if (!products.length) throw new Error("Catalogul public nu conține produse; generarea a fost oprită fără ștergeri.");

  for (const product of products) {
    const outputPath = path.join(PRODUCT_ROOT, product.slug, "index.html");
    await atomicWrite(outputPath, renderProductPage(template, product));
  }
  const removed = await removeStaleGeneratedPages(previousSlugs, products.map(product => product.slug));
  await atomicWrite(SITEMAP_PATH, buildSitemap(products));
  await atomicWrite(CATALOG_PAGE_PATH, buildCatalogPage(products));
  await atomicWrite(AI_CATALOG_PATH, buildAiCatalog(products));
  await updateSitemapIndex();
  const excludedCatalogRows = Math.max(0, reportedTotal - products.length);
  await atomicWrite(MANIFEST_PATH, `${JSON.stringify({ version: 1, generated_at: new Date().toISOString(), source: API_URL, reported_total: reportedTotal, products: products.length, catalog_rows_excluded_by_public_deduplication: excludedCatalogRows, slugs: products.map(product => product.slug) }, null, 2)}\n`);

  process.stdout.write(`${JSON.stringify({ success: true, generated: products.length, reportedTotal, excludedCatalogRows, removed, productRoot: PRODUCT_ROOT, sitemap: SITEMAP_PATH, catalogPage: CATALOG_PAGE_PATH, aiCatalog: AI_CATALOG_PATH }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
