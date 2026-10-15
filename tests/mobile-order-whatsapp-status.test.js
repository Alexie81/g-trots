'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const utilitySource = fs.readFileSync(path.join(__dirname, '..', 'utils', 'orderWhatsApp.ts'), 'utf8');
const compiled = ts.transpileModule(utilitySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const utilityModule = { exports: {} };
new Function('exports', 'module', 'require', compiled)(utilityModule.exports, utilityModule, require);
const whatsapp = utilityModule.exports;

const order = {
  id: 'order-1',
  order_number: 'GT-1001',
  status: 'new',
  payment_status: 'pending',
  payment_method: 'cash_on_delivery',
  customer_name: 'ANA POPESCU',
  customer_phone: '0722 000 000',
  customer_email: 'ana@example.com',
  shipping_cost: 25,
  total: 425,
  currency: 'RON',
  tracking_token: 'a'.repeat(48),
  items: [
    { product_id: 'p1', product_slug: 'trotineta-test', product_name: 'Trotinetă Test', quantity: 1 },
    { product_id: 'p2', product_slug: 'casca-test', product_name: 'Cască Test', quantity: 2 },
  ],
};

const newMessage = whatsapp.buildOrderStatusWhatsAppMessage(order);
assert.match(newMessage, /^\*G-Trots România\*/);
assert.match(newMessage, /Bună ziua, doamnă Ana Popescu!/);
assert.match(newMessage, /- Trotinetă Test\n- Cască Test × 2 buc\./);
assert.match(newMessage, /Transport: 25,00 RON/);
assert.match(newMessage, /urmarire-comanda\?token=/);
assert.equal(whatsapp.customerCourtesy('ION POPESCU'), 'domnule');

for (const status of ['new', 'confirmed', 'processing', 'shipped', 'completed']) {
  assert.equal(whatsapp.isOrderWhatsAppStatusEnabled(status), true);
  assert.ok(whatsapp.buildOrderStatusWhatsAppMessage({ ...order, status }).length > 100);
}
assert.equal(whatsapp.isOrderWhatsAppStatusEnabled('cancelled'), false);
assert.equal(whatsapp.buildOrderStatusWhatsAppMessage({ ...order, status: 'cancelled' }), '');

const completedMessage = whatsapp.buildOrderStatusWhatsAppMessage({ ...order, status: 'completed' });
assert.equal((completedMessage.match(/review_token=/g) || []).length, 2);
assert.match(completedMessage, /recenzie=noua/);
assert.match(completedMessage, /#recenzii/);

const managerSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'ShopOrdersManager.tsx'), 'utf8');
assert.match(managerSource, /Trimite statusul curent pe WhatsApp/);
assert.match(managerSource, /whatsapp:\/\/send\?phone=\$\{target\}&text=\$\{encodedMessage\}/);
assert.match(managerSource, /statusWhatsAppEnabled/);
assert.ok(managerSource.indexOf('style={[styles.statusWhatsApp') < managerSource.indexOf('style={styles.contactActions}'));

console.log('mobile_order_whatsapp_status_test: OK');
