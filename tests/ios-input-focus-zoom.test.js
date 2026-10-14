const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'website', 'legal-footer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'website', 'legal-footer.css'), 'utf8');

function expectIncludes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expectIncludes(script, '20261014-mobile-menu-ios-input-v3', 'Versiunea globală nu invalidează cache-ul pentru corecția iOS.');
expectIncludes(styles, '@supports (-webkit-touch-callout: none)', 'Corecția nu este limitată la motoarele WebKit/iOS.');
expectIncludes(styles, '@media (max-width: 900px)', 'Corecția nu este limitată la ecrane mobile.');
expectIncludes(styles, 'input:not([type="checkbox"])', 'Câmpurile text nu sunt acoperite.');
expectIncludes(styles, '[contenteditable="true"]', 'Câmpurile editabile personalizate nu sunt acoperite.');
expectIncludes(styles, 'font-size: 16px !important', 'Dimensiunea minimă necesară pentru prevenirea zoom-ului iOS lipsește.');

if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(styles)) {
  throw new Error('Zoom-ul manual nu trebuie dezactivat pentru accesibilitate.');
}

console.log('ios_input_focus_zoom_test: OK');
