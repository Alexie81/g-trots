export async function getJSON(url){const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error(`Nu pot încărca ${url}: ${r.status}`);return r.json();}
export async function getBuffer(url){const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error(`Nu pot încărca ${url}: ${r.status}`);return r.arrayBuffer();}
