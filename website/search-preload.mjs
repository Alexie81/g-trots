const script = document.querySelector('script[src*="search-preload"]');
const base = new URL(script?.dataset?.baseUrl || '/', location.origin);
const core = [
  'search/data/config.json',
  'search/data/instant-core.json',
  'search/data/instant-postings-v61-meta.json',
  'search/data/instant-postings-v61.bin',
  'search/dist/g-trots-search-widget.mjs',
  'search/src/search-worker.mjs'
];

// Acțiunea globală pentru produsele favorite este disponibilă în toate paginile
// care folosesc preîncărcarea comună a căutării.
import(new URL('favorites.js?v=20260828-global-cart-count', base).href).catch(() => {});

// Pornește transferul înainte ca utilizatorul să atingă inputul. Fetch-urile ulterioare
// folosesc cache-ul HTTP/Service Worker și nu descarcă din nou aceleași fișiere.
Promise.allSettled(core.map(file => fetch(new URL(file, base), {
  cache: 'force-cache',
  priority: 'high'
})));

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('search-cache-sw.js', base)).catch(() => {});
  }, {once: true});
}
