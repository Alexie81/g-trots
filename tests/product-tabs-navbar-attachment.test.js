const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'website', 'produs.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'website', 'produs.js'), 'utf8');

function expectIncludes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expectIncludes(html, 'navbar=20261015-v4', 'Versiunea nouă a poziționării nu invalidează cache-ul JavaScript.');
expectIncludes(script, 'siteHeader.querySelector(".header-inner")', 'Bara nu folosește marginea vizibilă a navbarului.');
expectIncludes(script, 'headerInner?.getBoundingClientRect().bottom', 'Poziția sticky nu este calculată după navbarul interior.');
expectIncludes(script, 'stickyAnchorBottom - 1', 'Bordurile navbarului și barei de taburi nu se suprapun fără spațiu.');

console.log('product-tabs-navbar-attachment.test: OK');
