const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'website', 'produs.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'website', 'produs.css'), 'utf8');
const liveScript = fs.readFileSync(path.join(root, 'website', 'shop-live.js'), 'utf8');

function expectIncludes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expectIncludes(html, 'specs=20261015-v1', 'Versiunea nouă a fișei tehnice nu invalidează cache-ul CSS.');
expectIncludes(css, 'Product specifications v6: one readable, professional group per row.', 'Lipsește componenta nouă pentru specificații.');
expectIncludes(css, 'grid-template-columns: minmax(0, 1fr);', 'Grupurile de specificații nu sunt așezate unul sub altul.');
expectIncludes(css, 'counter-reset: product-spec-group;', 'Lipsește ierarhia vizuală numerotată a grupurilor.');
expectIncludes(css, 'font-size: clamp(0.92rem, 1.08vw, 1rem);', 'Valorile specificațiilor nu au dimensiunea minimă lizibilă.');
expectIncludes(css, 'grid-template-columns: minmax(0, 1fr);\n    align-items: start;', 'Eticheta și valoarea nu se așază vertical pe telefon.');
expectIncludes(liveScript, 'const grouped = savedSpecifications.reduce', 'Specificațiile produselor viitoare nu sunt randate din datele catalogului.');
expectIncludes(liveScript, 'Object.entries(grouped).map', 'Grupurile dinamice nu sunt generate pentru toate produsele.');

console.log('product-specifications-layout.test: OK');
