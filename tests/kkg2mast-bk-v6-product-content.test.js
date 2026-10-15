const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "..", "scripts", "product-content", "kkg2mast-bk-v6.json");
const content = JSON.parse(fs.readFileSync(file, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(content.sku === "KKG2MAST-BK-V6", "SKU-ul produsului nu este cel solicitat");
assert(Array.isArray(content.specifications) && content.specifications.length === 45, "Fișa trebuie să conțină 45 de specificații");
assert(Array.isArray(content.questions) && content.questions.length === 11, "Fișa trebuie să conțină toate cele 11 FAQ-uri");

const specs = new Map(content.specifications.map(item => [`${item.group}|${item.label}`, item.value]));
assert(specs.get("Motor|Putere nominală totală") === "2000W", "Puterea totală este incorectă");
assert(specs.get("Performanță|Viteză maximă declarată de furnizor pentru V6") === "70 km/h", "Viteza furnizorului este incorectă");
assert(specs.get("Performanță|Viteză maximă indicată de KuKirin") === "60 km/h", "Viteza KuKirin este incorectă");
assert(specs.get("Baterie|Capacitate acumulator") === "20,8Ah", "Capacitatea bateriei este incorectă");
assert(specs.get("Încărcare|Timp de încărcare declarat") === "Aproximativ 7–8 ore", "Timpul de încărcare verificat este incorect");
assert(specs.get("Construcție|Greutate netă declarată") === "Aproximativ 33,1 kg", "Greutatea este incorectă");
assert(specs.get("Construcție|Dimensiuni desfăcută") === "1260 × 595 × 1315 mm", "Dimensiunile desfăcute sunt incorecte");
assert(specs.get("Protecție|Grad protecție declarat") === "IP54", "Gradul de protecție este incorect");
assert(!content.specifications.some(item => /de confirmat/i.test(item.value)), "Nu trebuie publicate marcaje editoriale de confirmare");

const uniqueQuestions = new Set(content.questions.map(item => item.question.trim().toLocaleLowerCase("ro-RO")));
assert(uniqueQuestions.size === content.questions.length, "FAQ-urile trebuie să fie unice");
assert(content.questions.every(item => item.question.trim() && item.answer.trim().length >= 100), "Fiecare FAQ trebuie să aibă un răspuns complet");

console.log("KKG2MAST-BK-V6 product content checks passed.");
