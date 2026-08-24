const CACHE='g-trots-search-v7.1';
const CORE=[
 '/search/data/config.json',
 '/search/data/instant-core.json',
 '/search/data/instant-postings-v61-meta.json',
 '/search/data/instant-postings-v61.bin',
 '/search/dist/g-trots-search-widget.mjs',
 '/search/src/search-client.mjs',
 '/search/src/search-worker.mjs',
 '/search/src/search-engine.mjs',
 '/search/src/instant-search.mjs'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).catch(()=>{})));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(!url.pathname.startsWith('/search/')&&!url.pathname.startsWith('/data/catalog/'))return;
 event.respondWith(caches.match(event.request).then(hit=>{
  const refresh=fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;});
  return hit||refresh;
 }));
});
