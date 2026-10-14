const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'website', 'magazin.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'website', 'magazin.css'), 'utf8');
const page = fs.readFileSync(path.join(root, 'website', 'magazin.html'), 'utf8');
const htaccess = fs.readFileSync(path.join(root, 'website', '.htaccess'), 'utf8');

function expectIncludes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expectIncludes(script, 'window.matchMedia("(min-width: 701px)")', 'Pragul desktop pentru căutarea inline lipsește.');
expectIncludes(script, 'function queueDesktopCatalogSearch()', 'Filtrarea directă a catalogului lipsește.');
expectIncludes(script, 'function openDesktopInlineSearch({ force = false } = {})', 'Panoul desktop cu rezultate inline lipsește.');
expectIncludes(script, 'function closeDesktopInlineSearch({ restoreFocus = false } = {})', 'Restrângerea panoului desktop lipsește.');
expectIncludes(script, 'let desktopSearchCollapsed = false;', 'Starea temporară de restrângere lipsește.');
expectIncludes(script, 'openDesktopInlineSearch({ force: true })', 'Redeschiderea explicită a panoului lipsește.');
expectIncludes(script, 'window.requestAnimationFrame(() => openDesktopInlineSearch({ force: true }))', 'Panoul rapid nu pornește deschis după reîncărcare.');
expectIncludes(script, 'openDesktopInlineSearch();\n      queueDesktopCatalogSearch();', 'Introducerea textului nu actualizează rezultatele inline.');
expectIncludes(script, 'if (desktopInlineSearchMedia.matches) openDesktopInlineSearch();', 'Clickul în câmp nu deschide rezultatele inline pe desktop.');
expectIncludes(script, 'else openSmartSearch();', 'Comportamentul mobil al căutării nu a fost păstrat.');
expectIncludes(script, 'Restrânge rezultatele rapide', 'Eticheta accesibilă a butonului de restrângere lipsește.');
expectIncludes(styles, '.shop-search-deck.has-inline-results .smart-search-panel', 'Poziționarea panoului direct sub bară lipsește.');
expectIncludes(styles, '@keyframes desktop-inline-results-in', 'Animația de deschidere lipsește.');
expectIncludes(styles, '@keyframes desktop-inline-results-out', 'Animația de restrângere lipsește.');
expectIncludes(styles, 'content: "⌃"', 'Iconița de restrângere lipsește.');
expectIncludes(styles, '.desktop-search-expander::before', 'Bara restrânsă de sub căutare lipsește.');
expectIncludes(page, 'data-smart-search-expand', 'Controlul de redeschidere al barei restrânse lipsește.');
expectIncludes(page, 'magazin.css?v=20261014-desktop-inline-results-v3', 'Pagina magazinului nu invalidează cache-ul stilurilor.');
expectIncludes(page, 'magazin.js?v=20261014-desktop-inline-results-v3', 'Pagina magazinului nu invalidează cache-ul scriptului.');
expectIncludes(htaccess, 'legal-footer\\.js|magazin\\.(?:css|js)|promotions', 'Fișierele căutării nu sunt revalidate pe paginile SEO existente.');

console.log('desktop_inline_shop_search_test: OK');
