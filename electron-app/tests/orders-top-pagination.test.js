'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'shop-commerce.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'style.css'), 'utf8');
const mobile = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ShopOrdersManager.tsx'), 'utf8');

assert.match(source, /function tableHeaderPagination\(key, total, page, pageCount, pageSize\)/, 'Desktop trebuie să aibă paginarea compactă din antet.');
assert.match(source, /<th>Factură<\/th><th class="shop-order-table-pagination-cell">\$\{topPagination\}<\/th>/, 'Paginarea desktop trebuie afișată imediat după coloana Factură.');
assert.match(source, /shop-order-table-top-pagination[\s\S]*data-page-key="\$\{key\}"[\s\S]*data-page="\$\{page \+ 1\}"/, 'Butoanele paginării de sus trebuie legate la mecanismul comun de schimbare a paginii.');
assert.match(source, /shop-order-table-top-pagination[\s\S]*data-page-input-key="\$\{key\}"/, 'Paginarea desktop de sus trebuie să permită introducerea numărului paginii.');
assert.match(source, /shop-commerce-page-jump[\s\S]*data-page-input-key="\$\{key\}"/, 'Paginarea desktop de jos trebuie să permită introducerea numărului paginii.');
assert.match(source, /querySelectorAll\(`\[data-page-input-key="\$\{key\}"\]`\)/, 'Toate câmpurile de pagină trebuie conectate la navigare.');
assert.match(css, /\.shop-commerce-table\.orders th\.shop-order-table-pagination-cell\s*\{[^}]*text-align:\s*right/s, 'Paginarea desktop trebuie aliniată în dreapta antetului.');

const actionsIndex = mobile.indexOf('<View style={styles.actions}>');
const topPaginationIndex = mobile.indexOf('<View style={styles.topPagination}>');
const filtersIndex = mobile.indexOf('{filtersOpen ? <View style={styles.filtersPanel}>');
assert.ok(actionsIndex >= 0 && topPaginationIndex > actionsIndex && filtersIndex > topPaginationIndex, 'Paginarea mobilă trebuie afișată sub butoanele Filtre și Refresh.');
assert.match(mobile, /<View style=\{styles\.topPagination\}>\s*<ShopPagination page=\{page\} pageSize=\{pageSize\} total=\{ordersTotal\}/, 'Paginarea mobilă de sus trebuie să folosească aceeași stare ca paginarea de jos.');
const mobilePagination = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ShopPagination.tsx'), 'utf8');
assert.match(mobilePagination, /accessibilityLabel=\{`Mergi la pagina, între 1 și \$\{pageCount\}`\}/, 'Paginarea mobilă trebuie să permită introducerea accesibilă a numărului paginii.');
assert.match(mobilePagination, /onSubmitEditing=\{submitPage\}/, 'Paginarea mobilă trebuie să navigheze la confirmarea numărului introdus.');

console.log('orders_top_pagination_test: OK');
