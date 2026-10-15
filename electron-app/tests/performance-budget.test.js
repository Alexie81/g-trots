'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const main = read('main.js');
const html = read('renderer', 'index.html');
const css = read('renderer', 'style.css');
const app = read('renderer', 'js', 'app.js');
const api = read('renderer', 'js', 'api.js');
const chat = read('renderer', 'js', 'chat.js');
const clients = read('renderer', 'js', 'clients.js');
const shell = read('renderer', 'js', 'shell.js');

assert.match(html, /<html[^>]+class="performance-rendering"/, 'Profilul rapid trebuie activat înainte de primul frame.');
assert.match(css, /html\.performance-rendering \*[\s\S]*backdrop-filter:\s*none !important/, 'Blur-ul compus trebuie dezactivat în profilul rapid.');
assert.match(css, /animation-iteration-count:\s*1 !important/, 'Animațiile decorative nu trebuie să ruleze permanent.');
assert.match(css, /content-visibility:\s*auto/, 'Rândurile lungi trebuie randate doar când ajung în viewport.');

assert.doesNotMatch(app, /warmTables|getClientsPage\?\./, 'Autentificarea nu trebuie să preîncarce tabele nefolosite.');
assert.match(api, /Math\.min\(1, Math\.floor\(100 \/ safePageSize\) - 1\)/, 'Prefetch-ul trebuie limitat la o singură pagină.');

assert.doesNotMatch(chat, /setInterval\(/, 'Chatul trebuie să folosească polling adaptiv, fără interval permanent.');
assert.match(chat, /CHAT_BACKGROUND_POLL_MS = 60000/, 'Chatul inactiv trebuie verificat rar.');
assert.match(chat, /document\.hidden\) stopPolling\(\)/, 'Chatul trebuie oprit când aplicația este ascunsă.');

assert.doesNotMatch(clients, /setInterval\(/, 'Lista de clienți nu trebuie să țină un interval permanent.');
assert.match(clients, /CLIENTS_REALTIME_REFRESH_MS = 2 \* 60 \* 1000/, 'Revalidarea clienților trebuie să fie temperată.');
assert.doesNotMatch(shell, /setInterval\(/, 'Shell-ul nu trebuie să țină intervale de rețea permanente.');
assert.match(shell, /ACCOUNT_REFRESH_INTERVAL_MS = 15 \* 60 \* 1000/, 'Contul nu trebuie revalidat agresiv.');
assert.match(shell, /SHOP_NOTIFICATIONS_INTERVAL_MS = 2 \* 60 \* 1000/, 'Notificările trebuie verificate la un interval rezonabil.');

assert.match(main, /backgroundThrottling:\s*true/, 'Chromium trebuie să reducă munca ferestrei ascunse.');
assert.match(main, /spellcheck:\s*false/, 'Serviciul de spellcheck nefolosit trebuie oprit.');
assert.match(main, /UPDATE_CHECK_INTERVAL_MS = 6 \* 60 \* 60 \* 1000/, 'Update-urile automate nu trebuie verificate la fiecare cinci minute.');

console.log('performance_budget_test: OK');
