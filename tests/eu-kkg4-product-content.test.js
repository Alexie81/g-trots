const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "..", "scripts", "product-content", "eu-kkg4.json");
const content = JSON.parse(fs.readFileSync(file, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(content.sku === "EU-KKG4", "SKU-ul produsului nu este cel solicitat");
assert(Array.isArray(content.specifications) && content.specifications.length === 37, "Fișa trebuie să conțină 37 de specificații");
assert(Array.isArray(content.questions) && content.questions.length === 9, "Fișa trebuie să conțină toate cele 9 FAQ-uri");

const specs = new Map(content.specifications.map(item => [`${item.group}|${item.label}`, item.value]));
assert(specs.get("Motor|Putere nominală") === "2000W", "Puterea motorului este incorectă");
assert(specs.get("Performanță|Viteză maximă tehnică") === "70 km/h", "Viteza maximă este incorectă");
assert(specs.get("Baterie|Capacitate baterie") === "20Ah", "Capacitatea bateriei este incorectă");
assert(specs.get("Încărcare|Tensiune ieșire încărcător") === "67,2V", "Tensiunea încărcătorului este incorectă");
assert(specs.get("Construcție|Dimensiuni desfăcută") === "1336 × 660 × 1295 mm", "Dimensiunile produsului sunt incorecte");
assert(!content.specifications.some(item => /greutate|grad de protecție/i.test(item.label)), "Valorile încă neconfirmate nu trebuie publicate ca specificații");

const uniqueQuestions = new Set(content.questions.map(item => item.question.trim().toLocaleLowerCase("ro-RO")));
assert(uniqueQuestions.size === content.questions.length, "FAQ-urile trebuie să fie unice");
assert(content.questions.every(item => item.question.trim() && item.answer.trim().length >= 100), "Fiecare FAQ trebuie să aibă un răspuns complet");

console.log("EU-KKG4 product content checks passed.");
