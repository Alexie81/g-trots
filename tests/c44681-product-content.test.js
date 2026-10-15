const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "..", "scripts", "product-content", "c44681.json");
const content = JSON.parse(fs.readFileSync(file, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(content.sku === "C44681", "SKU-ul produsului nu este cel solicitat");
assert(Array.isArray(content.specifications) && content.specifications.length === 46, "Fișa trebuie să conțină 46 de specificații");
assert(Array.isArray(content.questions) && content.questions.length === 10, "Fișa trebuie să conțină toate cele 10 FAQ-uri");

const specs = new Map(content.specifications.map(item => [`${item.group}|${item.label}`, item.value]));
assert(specs.get("General|Model") === "A1", "Modelul este incorect");
assert(specs.get("Motor|Putere nominală") === "800W", "Puterea motorului este incorectă");
assert(specs.get("Performanță|Viteză maximă tehnică") === "45 km/h", "Viteza maximă este incorectă");
assert(specs.get("Performanță|Autonomie maximă") === "45 km", "Autonomia maximă este incorectă");
assert(specs.get("Baterie|Capacitate acumulator") === "13Ah", "Capacitatea bateriei este incorectă");
assert(specs.get("Baterie|Energie nominală") === "624Wh", "Energia nominală este incorectă");
assert(specs.get("Încărcare|Timp de încărcare conform fișei tehnice") === "Aproximativ 7–8 ore", "Timpul de încărcare este incorect");
assert(specs.get("Construcție|Dimensiuni desfăcută") === "1154 × 580 × 1298 mm", "Dimensiunile desfăcute sunt incorecte");
assert(specs.get("Protecție|Grad protecție conform fișei tehnice") === "IPX4", "Gradul de protecție este incorect");
assert(!content.specifications.some(item => /de confirmat|de verificat/i.test(item.value)), "Nu trebuie publicate marcaje editoriale de confirmare");

const uniqueQuestions = new Set(content.questions.map(item => item.question.trim().toLocaleLowerCase("ro-RO")));
assert(uniqueQuestions.size === content.questions.length, "FAQ-urile trebuie să fie unice");
assert(content.questions.every(item => item.question.trim() && item.answer.trim().length >= 100), "Fiecare FAQ trebuie să aibă un răspuns complet");

console.log("C44681 product content checks passed.");
