'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'style.css'), 'utf8');

assert.match(css, /\.shop-invoice-issue-modal\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*24px\)/s, 'Modalul trebuie limitat la viewport-ul dinamic.');
assert.match(css, /\.shop-invoice-issue-body\s*\{[^}]*flex:\s*1 1 auto[^}]*overflow-y:\s*auto/s, 'Conținutul facturii trebuie să poată derula fără a ascunde acțiunile.');
assert.match(css, /\.shop-invoice-issue-modal\s*>\s*header,[\s\S]*?\.shop-invoice-issue-modal\s*>\s*footer\s*\{[^}]*z-index:\s*2/s, 'Antetul și bara de acțiuni trebuie să rămână separate de conținutul derulabil.');

console.log('invoice_issue_layout_test: OK');
