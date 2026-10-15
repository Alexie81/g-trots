const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'website', 'produs.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'website', 'produs.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'website', 'produs.js'), 'utf8');

function expectIncludes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expectIncludes(html, 'gallery=20261015-v1', 'Versiunea caruselului de miniaturi nu invalidează cache-ul.');
expectIncludes(css, 'grid-template-rows: auto minmax(0, 1fr) auto', 'Rail-ul nu rezervă spațiu pentru comenzile sus și jos.');
expectIncludes(css, '.product-gallery-thumbs__viewport', 'Fereastra limitată a miniaturilor lipsește.');
expectIncludes(script, 'product-gallery-thumbs__control is-${direction}', 'Comenzile caruselului nu sunt generate.');
expectIncludes(script, 'viewport.scrollBy({', 'Săgețile nu derulează lista de miniaturi.');
expectIncludes(script, 'scrollActiveThumbnail', 'Miniatura activă nu este readusă automat în zona vizibilă.');
expectIncludes(script, 'new MutationObserver', 'Caruselul nu urmărește imaginile încărcate din catalog.');

console.log('product-thumbnail-carousel.test: OK');
