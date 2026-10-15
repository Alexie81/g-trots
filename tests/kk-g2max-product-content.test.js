const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "..", "scripts", "product-content", "kk-g2max.json");
const content = JSON.parse(fs.readFileSync(file, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(content.sku === "KK-G2MAX", "SKU-ul produsului nu este cel solicitat");
assert(Array.isArray(content.specifications) && content.specifications.length === 44, "Fișa trebuie să conțină 44 de specificații");
assert(Array.isArray(content.questions) && content.questions.length === 10, "Fișa trebuie să conțină toate cele 10 FAQ-uri");

const specs = new Map(content.specifications.map(item => [`${item.group}|${item.label}`, item.value]));
assert(specs.get("Motor|Putere nominală") === "1000W", "Puterea motorului este incorectă");
assert(specs.get("Performanță|Viteză maximă tehnică") === "55 km/h", "Viteza maximă este incorectă");
assert(specs.get("Performanță|Autonomie maximă declarată de furnizor") === "80 km", "Autonomia furnizorului este incorectă");
assert(specs.get("Performanță|Autonomie maximă indicată de KuKirin") === "70 km", "Autonomia KuKirin este incorectă");
assert(specs.get("Baterie|Capacitate declarată de furnizor") === "20Ah", "Capacitatea bateriei furnizorului este incorectă");
assert(specs.get("Baterie|Capacitate indicată de KuKirin") === "20,8Ah", "Capacitatea bateriei KuKirin este incorectă");
assert(specs.get("Baterie|Energie nominală – varianta 20Ah") === "960Wh", "Energia variantei de 20Ah este incorectă");
assert(specs.get("Baterie|Energie nominală – varianta 20,8Ah") === "998,4Wh", "Energia variantei de 20,8Ah este incorectă");
assert(specs.get("Încărcare|Timp estimat de încărcare") === "Aproximativ 10–11 ore", "Timpul de încărcare este incorect");
assert(specs.get("Construcție|Dimensiuni desfăcută") === "1260 × 605 × 1300 mm", "Dimensiunile desfăcute sunt incorecte");
assert(specs.get("Protecție|Grad protecție declarat") === "IP54", "Gradul de protecție este incorect");
assert(!content.specifications.some(item => /de confirmat/i.test(item.value)), "Nu trebuie publicate marcaje editoriale de confirmare");

const uniqueQuestions = new Set(content.questions.map(item => item.question.trim().toLocaleLowerCase("ro-RO")));
assert(uniqueQuestions.size === content.questions.length, "FAQ-urile trebuie să fie unice");
assert(content.questions.every(item => item.question.trim() && item.answer.trim().length >= 100), "Fiecare FAQ trebuie să aibă un răspuns complet");

console.log("KK-G2MAX product content checks passed.");
