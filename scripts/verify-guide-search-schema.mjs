#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "website");
const BASE = "https://g-trots.ro";
const live = process.argv.includes("--live");
const documents = JSON.parse(await readFile(path.join(ROOT, "search", "data", "diagnostic-docs.json"), "utf8"));
const searchConsoleExamples = new Set([
  "stopul-spate-la-kukirin-g3-functioneaza-numai-cand-misti-cablul",
  "farul-la-kukirin-g3-slabeste-cand-accelerezi",
  "alarma-la-segway-ninebot-p65e-porneste-singura-fara-sa-fie-miscat",
  "dualtron-victor-arata-baterie-plina-dar-se-opreste",
  "segway-ninebot-f2-se-opreste-cand-accelerez"
]);

let articles = 0;
let invalidProductSubjects = 0;
let checkedExamples = 0;
const invalidJsonLd = [];

function schemasFrom(html, slug) {
  const schemas = [];
  for (const match of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      schemas.push(JSON.parse(match[1]));
    } catch (error) {
      invalidJsonLd.push({ slug, error: error.message });
    }
  }
  return schemas;
}

function visit(value, callback) {
  if (!value || typeof value !== "object") return;
  callback(value);
  Object.values(value).forEach(child => {
    if (Array.isArray(child)) child.forEach(item => visit(item, callback));
    else visit(child, callback);
  });
}

const documentsToCheck = live ? documents.filter(doc => searchConsoleExamples.has(doc.slug)) : documents;

for (const doc of documentsToCheck) {
  const html = live
    ? await fetch(`${BASE}/${doc.slug}?schema-check=20260908`, { headers: { "cache-control": "no-cache" } }).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status} pentru ${doc.slug}`);
        return response.text();
      })
    : await readFile(path.join(ROOT, `${doc.slug}.html`), "utf8");
  let hasArticle = false;
  for (const schema of schemasFrom(html, doc.slug)) {
    visit(schema, node => {
      const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
      if (!types.some(type => ["Article", "TechArticle", "BlogPosting"].includes(type))) return;
      hasArticle = true;
      if (Array.isArray(node.about)) {
        invalidProductSubjects += node.about.filter(subject => subject?.["@type"] === "Product").length;
      }
    });
  }
  if (!hasArticle) throw new Error(`Schema Article lipsește din ${doc.slug}`);
  articles += 1;
  if (searchConsoleExamples.has(doc.slug)) checkedExamples += 1;
}

if (invalidProductSubjects) throw new Error(`${invalidProductSubjects} subiecte Product invalide au rămas în ghiduri.`);
if (invalidJsonLd.length) throw new Error(`JSON-LD invalid în ${invalidJsonLd.length} ghiduri: ${invalidJsonLd.slice(0, 10).map(item => item.slug).join(", ")}`);
if (checkedExamples !== searchConsoleExamples.size) throw new Error(`Au fost verificate doar ${checkedExamples}/${searchConsoleExamples.size} exemple Search Console.`);

process.stdout.write(`${JSON.stringify({ ok: true, source: live ? "live" : "local", guides: documentsToCheck.length, articles, invalidProductSubjects, checkedExamples })}\n`);
