'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'website', 'legal-footer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'website', 'legal-footer.css'), 'utf8');

assert.match(script, /function ensureMobileContextSwitch\(header, headerInner, shopContext\)/, 'Navbarul global trebuie să construiască selectorul Shop / Service.');
assert.match(script, /const destination = shopContext \? '\/' : '\/magazin'/, 'Pe produs și magazin butonul trebuie să ducă la service, iar pe celelalte pagini la magazin.');
assert.match(script, /gt-mobile-context-switch \$\{shopContext \? 'is-service' : 'is-shop'\}/, 'Butonul trebuie să primească automat iconița potrivită contextului.');
assert.match(script, /headerInner, shopActive/, 'Clasificarea Shop / Service trebuie aplicată navbarului global.');
assert.match(styles, /\.gt-mobile-context-switch\s*\{\s*display:\s*none/s, 'Butonul trebuie ascuns pe desktop.');
assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.gt-public-header \.global-shop-actions \.gt-mobile-context-switch\s*\{[^}]*display:\s*grid/s, 'Butonul trebuie afișat numai în navbarul mobil.');
assert.match(styles, /border-radius:\s*50%/, 'Butonul mobil trebuie să fie rotund.');
assert.match(styles, /gt-mobile-context-shine/, 'Butonul trebuie să păstreze animația vizuală cerută.');

console.log('mobile_navbar_context_switch_test: OK');
