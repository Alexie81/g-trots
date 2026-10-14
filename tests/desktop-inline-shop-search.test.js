const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'website', 'magazin.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'website', 'magazin.css'), 'utf8');
const page = fs.readFileSync(path.join(root, 'website', 'magazin.html'), 'utf8');
const htaccess = fs.readFileSync(path.join(root, 'website', '.htaccess'), 'utf8');
const legalFooter = fs.readFileSync(path.join(root, 'website', 'legal-footer.js'), 'utf8');

function expectIncludes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expectIncludes(script, 'window.matchMedia("(min-width: 701px)")', 'Pragul desktop pentru căutarea inline lipsește.');
expectIncludes(script, 'function queueDesktopCatalogSearch()', 'Filtrarea directă a catalogului lipsește.');
expectIncludes(script, 'function openDesktopInlineSearch({ force = false } = {})', 'Panoul desktop cu rezultate inline lipsește.');
expectIncludes(script, 'function closeDesktopInlineSearch({ restoreFocus = false, rememberCollapsed = true } = {})', 'Restrângerea panoului desktop lipsește.');
expectIncludes(script, 'let desktopSearchCollapsed = false;', 'Starea temporară de restrângere lipsește.');
expectIncludes(script, 'openDesktopInlineSearch({ force: true })', 'Redeschiderea explicită a panoului lipsește.');
expectIncludes(script, 'searchInput.addEventListener("focus", () => {', 'Panoul rapid nu este legat de focalizarea câmpului.');
expectIncludes(script, 'function showDesktopSearchCatalogResults()', 'Confirmarea căutării desktop nu închide panoul rapid.');
expectIncludes(script, 'closeDesktopInlineSearch({ rememberCollapsed: false });', 'Confirmarea căutării nu resetează corect panoul rapid.');
expectIncludes(script, 'function exactSearchCards(rawQuery)', 'Potrivirea exactă după cod sau denumire lipsește.');
expectIncludes(script, 'semanticCardData(card).identifierWords.includes(query)', 'Codul exact al produsului nu are prioritate exclusivă.');
expectIncludes(script, 'semanticCardData(card).title === query', 'Denumirea exactă a produsului nu are prioritate exclusivă.');
expectIncludes(script, 'if (queryTokens.length === 0) {', 'Căutările formate din expresii generale exacte sunt eliminate greșit.');
expectIncludes(script, 'if (score <= 0) return 0;', 'Expresiile generale trebuie păstrate numai când există o potrivire reală.');
expectIncludes(script, 'function isElectricScooterSearch(rawQuery)', 'Intenția de căutare pentru trotinete electrice lipsește.');
expectIncludes(script, 'function isElectricScooterCard(card)', 'Produsele de tip trotinetă nu sunt separate de piesele compatibile.');
expectIncludes(script, '.filter(isElectricScooterCard)', 'Rezultatele rapide nu sunt limitate la trotinetele propriu-zise.');
expectIncludes(script, '? isElectricScooterCard(card)', 'Catalogul nu limitează căutarea de trotinete la categoria corectă.');
expectIncludes(script, 'const exactMatchSet = exactMatches.length ? new Set(exactMatches) : null;', 'Catalogul nu limitează rezultatele la potrivirea exactă.');
expectIncludes(script, 'const searchField = document.querySelector(".shop-search-field");', 'Zona completă a barei de căutare nu este identificată.');
expectIncludes(script, 'searchField?.addEventListener("click", event => {', 'Zona completă a barei nu deschide căutarea.');
expectIncludes(script, 'if (event.target.closest("button, input, a")) return;', 'Butoanele din căutare nu sunt protejate de clicul extins.');
if (script.includes('window.requestAnimationFrame(() => openDesktopInlineSearch({ force: true }))')) {
  throw new Error('Panoul rapid se deschide nejustificat după reîncărcare.');
}
expectIncludes(script, 'openDesktopInlineSearch();\n      queueDesktopCatalogSearch();', 'Introducerea textului nu actualizează rezultatele inline.');
expectIncludes(script, 'if (desktopInlineSearchMedia.matches) openDesktopInlineSearch();', 'Clickul în câmp nu deschide rezultatele inline pe desktop.');
expectIncludes(script, 'else openSmartSearch();', 'Comportamentul mobil al căutării nu a fost păstrat.');
expectIncludes(script, '|| searchDeck?.classList.contains("has-inline-results")', 'Rezultatele rapide desktop nu se actualizează după încărcarea catalogului complet.');
expectIncludes(script, 'document.addEventListener("pointerdown", event => {', 'Închiderea rezultatelor rapide la click sau tap în exterior lipsește.');
expectIncludes(script, 'if (searchDeck?.contains(target) || smartSearchOverlay?.contains(target)) return;', 'Interacțiunile din bara și panoul de căutare nu sunt protejate.');
expectIncludes(script, 'closeDesktopInlineSearch({ rememberCollapsed: false });', 'Clickul în exterior nu închide corect rezultatele rapide pe desktop.');
expectIncludes(script, 'Restrânge rezultatele rapide', 'Eticheta accesibilă a butonului de restrângere lipsește.');
expectIncludes(styles, '.shop-search-deck.has-inline-results .smart-search-panel', 'Poziționarea panoului direct sub bară lipsește.');
expectIncludes(styles, '@keyframes desktop-inline-results-in', 'Animația de deschidere lipsește.');
expectIncludes(styles, '@keyframes desktop-inline-results-out', 'Animația de restrângere lipsește.');
expectIncludes(styles, '@keyframes desktop-collapse-control-in', 'Animația controlului de restrângere lipsește.');
expectIncludes(styles, 'background: linear-gradient(145deg, #ffab39 0%, #ff8708 46%, #ed6c00 100%) !important;', 'Butonul de restrângere nu are stilul portocaliu accentuat.');
expectIncludes(styles, 'html[data-theme="light"] body.shop-page .shop-search-actions .shop-search-clear:hover', 'Butonul de ștergere nu rămâne lizibil pe tema albă.');
expectIncludes(styles, '.desktop-search-expander::before', 'Bara restrânsă de sub căutare lipsește.');
expectIncludes(styles, '.shop-search-deck:focus-within:not(.has-inline-results):not(.is-inline-collapsing) .desktop-search-expander', 'Bara restrânsă nu este limitată la focalizarea căutării.');
expectIncludes(page, 'data-smart-search-expand', 'Controlul de redeschidere al barei restrânse lipsește.');
expectIncludes(page, 'magazin.css?v=20261015-search-filters-v7', 'Pagina magazinului nu invalidează cache-ul stilurilor.');
expectIncludes(page, 'magazin.js?v=20261015-search-filters-v7', 'Pagina magazinului nu invalidează cache-ul scriptului.');
expectIncludes(htaccess, 'legal-footer\\.js|magazin\\.(?:css|js)|promotions', 'Fișierele căutării nu sunt revalidate pe paginile SEO existente.');
expectIncludes(legalFooter, "const catalogStyleVersion = '20261015-search-filters-v7';", 'Stratul global înlocuiește stilurile magazinului cu o versiune veche.');
if (legalFooter.includes("currentUrl.searchParams.set('v', '20260920-list-theme-v2')")) {
  throw new Error('Stratul global reactivează versiunea veche a stilurilor magazinului.');
}

console.log('desktop_inline_shop_search_test: OK');
