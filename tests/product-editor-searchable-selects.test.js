const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const desktopCss = fs.readFileSync(path.join(root, 'electron-app/renderer/style.css'), 'utf8');
const desktopHtml = fs.readFileSync(path.join(root, 'electron-app/renderer/index.html'), 'utf8');
const desktopJs = fs.readFileSync(path.join(root, 'electron-app/renderer/js/shop-commerce.js'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'components/ShopProductsManager.tsx'), 'utf8');

assert.match(desktopCss, /\.shop-brand-options label > input\s*\{/,
  'Doar controalele de selecție trebuie ascunse vizual în dropdown.');
assert.match(desktopCss, /\.shop-dropdown-search input\s*\{[^}]*position:\s*static;[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
  'Câmpul de căutare desktop trebuie să fie vizibil și interactiv.');
assert.doesNotMatch(desktopCss, /\.shop-brand-options input\s*\{[^}]*opacity:\s*0;/s,
  'Regula pentru checkbox nu trebuie să ascundă și câmpul de căutare.');
assert.match(desktopCss, /\.shop-brand-options label\[hidden\]\s*\{\s*display:\s*none;/,
  'Opțiunile eliminate de filtrare trebuie ascunse chiar dacă etichetele folosesc layout flex.');
assert.match(desktopHtml, /shop-commerce\.js\?v=20261015-prefix-search-2/,
  'Rendererul desktop trebuie să invalideze versiunea JavaScript veche din cache.');

for (const placeholder of [
  'Scrie aici numele categoriei...',
  'Scrie aici numele producatorului...',
  'Scrie aici marca sau modelul...',
]) assert.ok(desktopJs.includes(placeholder), `Lipsește mesajul desktop: ${placeholder}`);

assert.match(desktopJs, /requestAnimationFrame\(\(\) => search\.focus\(\{ preventScroll: true \}\)\)/,
  'Căutarea desktop trebuie focalizată automat la deschiderea listei.');
assert.ok((desktopJs.match(/startsWith\(term\)/g) || []).length >= 1,
  'Filtrarea desktop trebuie să păstreze doar opțiunile care încep cu termenul căutat.');
assert.ok((desktopJs.match(/filterDropdownStartsWith\(options/g) || []).length >= 3,
  'Aceeași filtrare strictă trebuie aplicată categoriilor, producătorilor și compatibilităților.');
assert.match(desktopJs, /dataset\?\.\[datasetKey\]/,
  'Filtrarea desktop trebuie să compare denumirea reală, fără simbolurile decorative ale opțiunii.');
assert.ok((desktopJs.match(/data-dropdown-empty/g) || []).length >= 3,
  'Fiecare dropdown desktop trebuie să explice atunci când nu există rezultate.');

for (const placeholder of [
  'Scrie aici numele categoriei...',
  'Scrie aici numele producătorului...',
  'Scrie aici marca sau modelul...',
]) assert.ok(mobile.includes(placeholder), `Lipsește mesajul mobil: ${placeholder}`);
assert.ok((mobile.match(/<TextInput autoFocus/g) || []).length >= 3,
  'Toate cele trei dropdown-uri mobile trebuie să focalizeze căutarea la deschidere.');
assert.ok((mobile.match(/startsWith\(normalizedQuery\)/g) || []).length >= 3,
  'Filtrarea mobilă trebuie să păstreze doar opțiunile care încep cu termenul căutat.');

console.log('product-editor-searchable-selects: OK');
