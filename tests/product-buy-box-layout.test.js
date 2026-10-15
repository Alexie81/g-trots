const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'website', 'produs.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'website', 'produs.css'), 'utf8');

function expectIncludes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expectIncludes(html, 'buybox=20261015-v1', 'Versiunea noului modul de cumpărare nu invalidează cache-ul CSS.');
expectIncludes(html, '<div class="product-quantity-block">', 'Cantitatea nu este inclusă în rândul prețului.');
expectIncludes(html, '<div class="product-purchase-details">', 'Producătorul și garanția nu au un rând comun sub buton.');
expectIncludes(css, 'grid-template-columns: minmax(0, 7fr) minmax(0, 3fr)', 'Rândul preț/cantitate nu respectă proporția 70/30.');
expectIncludes(css, 'html[data-theme="light"] .product-add-cart', 'Butonul light nu are tratamentul vizual dedicat.');
expectIncludes(css, '@keyframes product-cart-shine', 'Animația discretă a butonului lipsește.');

console.log('product-buy-box-layout.test: OK');
