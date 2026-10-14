'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'shop-commerce.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'style.css'), 'utf8');
const mobile = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ShopOrdersManager.tsx'), 'utf8');

assert.match(source, /function tableHeaderPagination\(key, total, page, pageCount, pageSize\)/, 'Desktop trebuie să aibă paginarea compactă din antet.');
assert.match(source, /<th colspan="2" class="shop-order-table-pagination-cell"><div class="shop-order-table-head-group"><span>Factură<\/span>\$\{topPagination\}<\/div><\/th>/, 'Paginarea desktop trebuie grupată compact cu Factură, fără o coloană suplimentară.');
assert.match(source, /shop-order-table-top-pagination[\s\S]*data-page-key="\$\{key\}"[\s\S]*data-page="\$\{page \+ 1\}"/, 'Butoanele paginării de sus trebuie legate la mecanismul comun de schimbare a paginii.');
assert.match(source, /shop-order-table-top-pagination[\s\S]*data-page-input-key="\$\{key\}"/, 'Paginarea desktop de sus trebuie să permită introducerea numărului paginii.');
assert.match(source, /shop-commerce-page-jump[\s\S]*data-page-input-key="\$\{key\}"/, 'Paginarea desktop de jos trebuie să permită introducerea numărului paginii.');
assert.match(source, /querySelectorAll\(`\[data-page-input-key="\$\{key\}"\]`\)/, 'Toate câmpurile de pagină trebuie conectate la navigare.');
assert.match(source, /shop-order-table-top-pagination[\s\S]*<span>Pg<\/span>/, 'Paginarea desktop trebuie să folosească eticheta compactă Pg.');
assert.match(css, /\.shop-order-table-head-group\s*\{[^}]*justify-content:\s*space-between/s, 'Factura și paginarea desktop trebuie distribuite elegant în același grup de antet.');
assert.doesNotMatch(css, /shop-order-table-pagination-cell[^}]*min-width:\s*362px/s, 'Paginarea desktop nu trebuie să mai lățească forțat tabelul.');

const actionsIndex = mobile.indexOf('<View style={styles.actions}>');
const topPaginationIndex = mobile.indexOf('<View style={styles.topPagination}>');
const filtersIndex = mobile.indexOf('{filtersOpen ? <View style={styles.filtersPanel}>');
assert.ok(actionsIndex >= 0 && topPaginationIndex > actionsIndex && filtersIndex > topPaginationIndex, 'Paginarea mobilă trebuie afișată sub butoanele Filtre și Refresh.');
assert.match(mobile, /<View style=\{styles\.topPagination\}>\s*<ShopPagination page=\{page\} pageSize=\{pageSize\} total=\{ordersTotal\}/, 'Paginarea mobilă de sus trebuie să folosească aceeași stare ca paginarea de jos.');
const mobilePagination = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ShopPagination.tsx'), 'utf8');
assert.match(mobilePagination, /<Text style=\{styles\.pageJumpLabel\}>Pg<\/Text>/, 'Paginarea mobilă trebuie să afișeze eticheta compactă Pg pe același rând cu numerele.');
assert.match(mobilePagination, /pageJump:\s*\{[^}]*flexWrap:\s*'nowrap'/s, 'Eticheta Pg, numărul paginii și totalul trebuie păstrate pe un singur rând.');
assert.match(mobilePagination, /accessibilityLabel=\{`Mergi la pagina, între 1 și \$\{pageCount\}`\}/, 'Paginarea mobilă trebuie să permită introducerea accesibilă a numărului paginii.');
assert.match(mobilePagination, /onSubmitEditing=\{submitPage\}/, 'Paginarea mobilă trebuie să navigheze la confirmarea numărului introdus.');

console.log('orders_top_pagination_test: OK');
