'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mobile = read('components/ShopOrdersManager.tsx');
const desktop = read('electron-app/renderer/js/shop-commerce.js');
const backend = read('shop-api/invoice-service.php');

for (const [name, source] of [['mobile/PWA', mobile], ['desktop', desktop]]) {
  assert.match(source, /function canIssueOrderInvoice\(order/, `${name}: lipsește regula comună de eligibilitate.`);
  assert.match(source, /payment_method !== 'card' \|\| order(?:\?|)\.payment_status === 'paid'/, `${name}: cardul neplătit nu este exclus.`);
}

assert.match(mobile, /invoiceActionAvailable \? <TouchableOpacity/, 'PWA/mobil: butonul rapid nu este ascuns până la plata cardului.');
assert.match(mobile, /selected\.invoice \|\| canIssueOrderInvoice\(selected\) \? <TouchableOpacity/, 'PWA/mobil: butonul din fișă nu este ascuns până la plata cardului.');
assert.match(desktop, /shop-order-invoice-wait[^<]*>Așteaptă plata/, 'Desktop: lista nu explică așteptarea plății.');
assert.match(desktop, /if \(!canIssueOrderInvoice\(order\)\) return toast/, 'Desktop: deschiderea veche a emiterii nu este blocată.');
assert.match(backend, /payment_method.*=== 'card'.*payment_status.*!== 'paid'/s, 'API: emiterea directă nu verifică plata cu cardul.');

console.log('invoice_card_payment_eligibility_test: OK');
