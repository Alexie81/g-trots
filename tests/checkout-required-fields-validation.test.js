'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('website/checkout.html');
const script = read('website/checkout.js');
const styles = read('website/checkout.css');

assert.ok(
  html.indexOf('name="confirm_order"') < html.indexOf('data-checkout-submit'),
  'Confirmările obligatorii trebuie afișate înaintea butonului de comandă.'
);
assert.match(html, /data-field-error="confirm_order"/, 'Lipsește mesajul dedicat confirmării comenzii.');
assert.match(html, /data-field-error="accept_terms"/, 'Lipsește mesajul dedicat termenilor.');
assert.match(script, /field\.setAttribute\("aria-invalid", "true"\)/, 'Câmpul invalid nu este anunțat tehnologiilor asistive.');
assert.match(script, /revealFirstValidationError\(errors\[0\]\.field\)/, 'Primul câmp invalid nu este adus automat în ecran.');
assert.match(script, /window\.scrollTo\(\{ top, behavior:/, 'Derularea controlată pentru mobil lipsește.');
assert.match(script, /form\.dataset\.validationMessage/, 'Mesajul sumar al validării lipsește.');
assert.match(styles, /border-color: #f04757 !important/, 'Conturul roșu proeminent lipsește.');
assert.match(styles, /checkout-confirmation-error/, 'Mesajele roșii pentru confirmări nu sunt stilizate.');

console.log('checkout_required_fields_validation_test: OK');
