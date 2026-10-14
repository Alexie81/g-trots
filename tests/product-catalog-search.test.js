const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const component = fs.readFileSync(path.join(root, 'website', 'product-catalog-search.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'website', 'product-catalog-search.css'), 'utf8');
const template = fs.readFileSync(path.join(root, 'website', 'produs.html'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'website', 'magazin.js'), 'utf8');
const footer = fs.readFileSync(path.join(root, 'website', 'legal-footer.js'), 'utf8');

function includes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

includes(component, "breadcrumb.insertAdjacentElement('beforebegin', component)", 'Bara nu este inserată deasupra breadcrumb-ului.');
includes(component, "document.addEventListener('g-trots:live-products'", 'Catalogul live nu alimentează rezultatele rapide.');
includes(component, 'product.normalizedIdentifiers.includes(query)', 'Căutarea exactă după cod lipsește.');
includes(component, 'product.normalizedName === query', 'Căutarea exactă după denumire lipsește.');
includes(component, "url.searchParams.set('q', query)", 'Căutarea nu este transmisă catalogului.');
includes(component, "url.hash = 'catalog'", 'Căutarea nu deschide zona catalogului.');
includes(styles, '@media (max-width: 700px)', 'Adaptarea pentru telefon lipsește.');
includes(styles, 'font-size: 16px;', 'Câmpul mobil poate declanșa zoom-ul iOS.');
includes(styles, '.product-page.is-live-product-loading .gt-theme-dock', 'Selectorul de temă se suprapune peste încărcarea produsului.');
includes(styles, 'body.product-catalog-search-open { overflow: hidden;', 'Căutarea mobilă nu blochează fundalul paginii.');
includes(styles, '.product-catalog-search.is-open .product-catalog-search__form', 'Formularul mobil dedicat lipsește.');
includes(styles, '.product-catalog-search.is-open .product-catalog-search__results', 'Panoul mobil pe tot ecranul lipsește.');
includes(component, "document.body.classList.add('product-catalog-search-open')", 'Comportamentul specific telefonului nu este activat.');
includes(styles, 'html[data-theme="light"] .product-catalog-search__form', 'Tema deschisă lipsește.');
includes(template, 'product-catalog-search.css?v=20261014-v7', 'Șablonul produselor viitoare nu include stilul căutării.');
includes(template, 'product-catalog-search.js?v=20261014-v7', 'Șablonul produselor viitoare nu include scriptul căutării.');
includes(component, 'popularSearches', 'Căutarea mobilă trebuie să afișeze sugestiile populare.');
includes(component, 'data-product-search-back', 'Căutarea mobilă trebuie să permită revenirea la produs.');
includes(footer, "location.pathname.includes('/magazin/produs/')", 'Produsele existente nu primesc componenta globală.');
includes(catalog, 'initialCatalogSearchQuery', 'Catalogul nu preia căutarea venită de pe produs.');

console.log('product_catalog_search_test: OK');
