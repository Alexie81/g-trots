'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = JSON.parse(read('app.json'));
const aware = read('components/KeyboardAwareScrollView.tsx');
const shop = read('components/ShopModuleScreen.tsx');
const tabs = read('app/(tabs)/_layout.tsx');

assert.equal(app.expo.android.softwareKeyboardLayoutMode, 'pan', 'Android trebuie să păstreze câmpul focalizat deasupra tastaturii.');
assert.match(aware, /measureInWindow/, 'Containerul comun trebuie să măsoare câmpul focalizat.');
assert.match(aware, /paddingBottom:\s*Number\(flattened\.paddingBottom \|\| 0\) \+ keyboardInset/, 'Containerul comun trebuie să creeze spațiu de derulare pentru tastatură.');
assert.match(aware, /currentlyFocusedInput/, 'Containerul comun trebuie să urmărească inputul activ.');
assert.match(tabs, /tabBarHideOnKeyboard:\s*true/, 'Navigația serviciului trebuie ascunsă când tastatura este deschisă.');
assert.match(shop, /if \(keyboardVisible\) return null;/, 'Navigația SHOP trebuie ascunsă când tastatura este deschisă.');

[
  'app/client/new.tsx',
  'app/client/[id].tsx',
  'app/(tabs)/scanner.tsx',
  'components/MobileLoginGate.tsx',
  'components/ShopOrdersManager.tsx',
  'components/ShopProductsManager.tsx',
  'components/ShopInventoryManager.tsx',
  'components/ShopInvoiceConfigurator.tsx',
  'components/ShopInvoicesManager.tsx',
  'components/ShopNirManager.tsx',
  'components/ShopDiscountsManager.tsx',
  'components/ShopSuppliersManager.tsx',
].forEach((file) => {
  assert.match(read(file), /KeyboardAwareScrollView/, `${file} trebuie să folosească protecția comună pentru tastatură.`);
});

console.log('mobile_keyboard_safety_test: OK');
