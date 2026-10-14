const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'website', 'magazin.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'website', 'magazin.html'), 'utf8');
const htaccess = fs.readFileSync(path.join(root, 'website', '.htaccess'), 'utf8');

function expectIncludes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expectIncludes(script, 'window.matchMedia("(min-width: 701px)")', 'Pragul desktop pentru căutarea inline lipsește.');
expectIncludes(script, 'function queueDesktopCatalogSearch()', 'Filtrarea directă a catalogului lipsește.');
expectIncludes(script, 'resetSmartSearchPresentation();\n      queueDesktopCatalogSearch();', 'Introducerea textului pe desktop încă poate deschide modalul.');
expectIncludes(script, 'if (!desktopInlineSearchMedia.matches) openSmartSearch();', 'Clickul în câmp încă deschide modalul pe desktop.');
expectIncludes(script, 'else openSmartSearch();', 'Comportamentul mobil al căutării nu a fost păstrat.');
expectIncludes(page, 'magazin.js?v=20261014-desktop-inline-search-v1', 'Pagina magazinului nu invalidează cache-ul scriptului.');
expectIncludes(htaccess, 'legal-footer\\.js|magazin\\.js|promotions', 'magazin.js nu este revalidat pe paginile SEO existente.');

console.log('desktop_inline_shop_search_test: OK');
