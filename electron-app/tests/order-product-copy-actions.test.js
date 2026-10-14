'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'shop-commerce.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'style.css'), 'utf8');

assert.match(source, /data-order-item-copy=.*data-copy-field="name"/, 'Fiecare produs trebuie să aibă acțiunea de copiere a numelui.');
assert.match(source, /data-order-item-copy=.*data-copy-field="code"/, 'Fiecare produs trebuie să aibă acțiunea de copiere a codului.');
assert.match(source, /clipboard\.writeText\(value\)/, 'Acțiunile produsului trebuie să scrie valoarea în clipboard.');
assert.match(source, /button\.classList\.add\('copied'\)/, 'Butonul trebuie să confirme vizual copierea.');
assert.match(css, /\.shop-order-copy-actions\s*\{[^}]*flex-wrap:\s*wrap/s, 'Acțiunile de copiere trebuie să rămână responsive.');
assert.match(css, /\.shop-order-copy-actions\s*>\s*button\.copied/, 'Starea vizuală „Copiat” trebuie stilizată.');

console.log('order_product_copy_actions_test: OK');
