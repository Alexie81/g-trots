'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const whatsapp = require('../renderer/js/order-whatsapp.js');

const order = {
  status: 'new',
  customer_name: 'ANA POPESCU',
  customer_phone: '0722 000 000',
  payment_method: 'cash_on_delivery',
  shipping_cost: 25,
  total: 425,
  currency: 'RON',
  tracking_token: 'a'.repeat(48),
  items: [
    { product_id: 'p1', product_slug: 'trotineta-test', product_name: 'Trotinetă Test', quantity: 1 },
    { product_id: 'p2', product_slug: 'casca-test', product_name: 'Cască Test', quantity: 2 }
  ]
};

const newMessage = whatsapp.buildMessage(order);
assert.match(newMessage, /^\*G-Trots România\*/, 'Brandul trebuie formatat bold pentru WhatsApp.');
assert.match(newMessage, /Bună ziua, doamnă Ana Popescu!/, 'Salutul trebuie să identifice corect un prenume feminin.');
assert.match(newMessage, /- Trotinetă Test\n- Cască Test × 2 buc\./, 'Produsele trebuie listate pe linii separate, inclusiv cantitatea multiplă.');
assert.match(newMessage, /Transport: 25,00 RON/, 'Costul transportului și moneda trebuie incluse.');
assert.match(newMessage, /urmarire-comanda\?token=/, 'Mesajul trebuie să includă linkul direct de urmărire.');
assert.equal(whatsapp.customerCourtesy('ION POPESCU'), 'domnule', 'Prenumele masculin trebuie identificat corect.');

for (const status of ['new', 'confirmed', 'processing', 'shipped', 'completed']) {
  assert.equal(whatsapp.isEnabledStatus(status), true, `Statusul ${status} trebuie să permită mesajul WhatsApp.`);
  assert.ok(whatsapp.buildMessage({ ...order, status }).length > 100, `Statusul ${status} trebuie să aibă mesaj complet.`);
}
assert.equal(whatsapp.isEnabledStatus('cancelled'), false, 'Statusurile nesuportate trebuie să țină butonul dezactivat.');
assert.equal(whatsapp.buildMessage({ ...order, status: 'cancelled' }), '', 'Nu trebuie generat mesaj pentru statusurile nesuportate.');

const completedMessage = whatsapp.buildMessage({ ...order, status: 'completed' });
assert.match(completedMessage, /livrată cu succes/, 'Mesajul final trebuie să confirme livrarea.');
assert.equal((completedMessage.match(/review_token=/g) || []).length, 2, 'Fiecare produs trebuie să primească propriul link de recenzie precompletat.');
assert.match(completedMessage, /recenzie=noua/, 'Linkul trebuie să deschidă formularul de recenzie nouă.');
assert.match(completedMessage, /#recenzii/, 'Linkul trebuie să ducă direct la secțiunea de recenzii.');

const commerceSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'shop-commerce.js'), 'utf8');
const commerceCss = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'style.css'), 'utf8');
const shopLive = fs.readFileSync(path.join(__dirname, '..', '..', 'website', 'shop-live.js'), 'utf8');
assert.match(commerceSource, /data-order-whatsapp-status/, 'Fișa comenzii trebuie să afișeze butonul de status WhatsApp.');
assert.match(commerceSource, /whatsapp:\/\/send\?phone=\$\{target\}&text=\$\{encodedMessage\}/, 'Aplicația trebuie să deschidă WhatsApp cu mesajul precompletat.');
assert.match(commerceCss, /button\.status-whatsapp\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s, 'Butonul nou trebuie să ocupe un rând complet deasupra acțiunilor existente.');
assert.match(shopLive, /field\.readOnly = true/, 'Datele verificate ale comenzii trebuie blocate pentru ca utilizatorul să completeze doar ratingul și recenzia.');
assert.match(shopLive, /publicTrackOrder/, 'Prefill-ul recenziei trebuie validat prin tokenul privat al comenzii.');

console.log('order_whatsapp_status_test: OK');
