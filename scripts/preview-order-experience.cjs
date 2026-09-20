/* Build isolated previews from the real page markup and renderers. */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'reports/order-experience-20260920');
const {order,company,emails}=JSON.parse(fs.readFileSync(path.join(out,'fixtures.json'),'utf8'));
fs.mkdirSync(path.join(out,'pages'),{recursive:true});
fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});
const pages=[];
function page(id,label,template,fixture,query){
  for(const theme of ['light','dark']){
    let html=fs.readFileSync(path.join(root,'website',template+'.html'),'utf8');
    html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    html=html.replace('<html lang="ro">',`<html lang="ro" data-theme="${theme}">`);
    html=html.replace('<head>',`<head><base href="/"><meta name="robots" content="noindex,nofollow">`);
    const script=template==='urmarire-comanda'?'urmarire-comanda':'checkout-status';
    html=html.replace('</body>',`<script>window.GTrotsOrderPreview=${JSON.stringify({order:fixture})};document.documentElement.style.colorScheme='${theme}';</script><script src="/${script}.js?v=preview"></script></body>`);
    html=html.replace('</head>',`<style>.gt-preview-note{position:relative;max-width:1160px;margin:18px auto 0;padding:10px 16px;color:var(--gt-muted);font:11px/1.5 system-ui;text-align:center}.shop-footer{display:none}.tracking-footer{margin-top:32px!important}html{scroll-behavior:auto!important}</style></head>`);
    html=html.replace('</main>','</main><p class="gt-preview-note">PREVIZUALIZARE · Date fictive · Nu s-a creat sau modificat nicio comandă</p>');
    const file=`pages/${id}-${theme}.html`;
    fs.writeFileSync(path.join(out,file),html);
    pages.push({id:`${id}-${theme}`,label,theme,path:file+'?'+query});
  }
}
const checkout={...order,orderNumber:order.order_number,createdAt:'2026-09-20T12:30:00',paymentMethod:'card',paymentLabel:'Card online',shippingCost:25,shippingLabel:'Curier standard',customerName:order.customer_name,customerPhone:order.customer_phone,deliveryAddress:'Strada Exemplu nr. 12, București',items:order.items.map(i=>({...i,name:i.product_name,price:i.unit_price,image:i.image_url}))};
for(const [status,label] of [['paid','Plată primită'],['cod','Comandă primită · ramburs'],['pending','Plată în curs de confirmare'],['failed','Plată eșuată'],['cancelled','Plată anulată']]){
  const cod=status==='cod';
  page('checkout-'+status,label,['failed','cancelled'].includes(status)?'plata-esuata':'plata-finalizata',{...checkout,paymentMethod:cod?'cash_on_delivery':'card',paymentLabel:cod?'Ramburs la curier':'Card online'},`status=${status}&metoda=${cod?'cash_on_delivery':'card'}`);
}
const statuses={new:'Comandă primită',confirmed:'Confirmată',processing:'În pregătire',shipped:'Predată curierului',completed:'Livrată',return_requested:'Retur solicitat',return_refused:'Retur refuzat',return_confirmed:'Retur confirmat',refunded:'Rambursată',cancelled:'Comandă anulată'};
const flow=['new','confirmed','processing','shipped','completed'];
for(const [status,label] of Object.entries(statuses)){
  const reached=flow.includes(status)?flow.slice(0,flow.indexOf(status)+1):status==='cancelled'?flow.slice(0,2):flow;
  const fixture={...order,status,status_history:[...reached,...(flow.includes(status)?[]:[status])].map((to_status,i)=>({to_status,created_at:`2026-09-${String(15+i).padStart(2,'0')} 12:30:00`}))};
  page('tracking-'+status,label,'urmarire-comanda',fixture,'preview=1');
}
const manifest={pages,emails};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
const screenshotVersion='20260920-recovery-v2';
const cards=(list,kind)=>list.map(x=>`<article><h3>${x.label}${x.theme?' · '+(x.theme==='light'?'Zi':'Noapte'):''}</h3><div class="shots">${['desktop','mobile'].map(size=>`<a href="screenshots/${x.id}-${size}.png?v=${screenshotVersion}" target="_blank"><img loading="lazy" src="screenshots/${x.id}-${size}.png?v=${screenshotVersion}" alt="${x.label} ${size}"><span>${size==='desktop'?'Desktop':'Telefon'}</span></a>`).join('')}</div><a class="live" href="${x.path}" target="_blank">Deschide previzualizarea ↗</a></article>`).join('');
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>G-Trots · Comenzi & emailuri</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f5f9;color:#18243a;font:15px/1.55 system-ui}header,main{max-width:1440px;margin:auto;padding:32px}header{padding-top:50px}header small{color:#b45309;font-weight:800;letter-spacing:.16em}h1{font-size:clamp(32px,4vw,56px);line-height:1.05;letter-spacing:-.055em;max-width:850px}p{color:#586579}nav{display:flex;gap:12px}nav a,.live{color:#9b4808}h2{font-size:30px;letter-spacing:-.04em}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}article{padding:20px;background:#fff;border:1px solid #e0e5ed;border-radius:22px}h3{font-size:15px;margin:0 0 16px}.shots{display:grid;grid-template-columns:2fr 1fr;gap:10px}.shots a{height:290px;overflow:hidden;border:1px solid #e2e7ee;border-radius:12px;position:relative;background:#eef2f8}img{display:block;width:100%}.shots span{position:absolute;bottom:0;left:0;right:0;background:#fff;padding:8px;font-size:11px;font-weight:700;text-align:center}.live{display:inline-block;margin-top:16px;font-size:12px}@media(max-width:500px){header,main{padding:22px}.grid{grid-template-columns:1fr}}</style><header><small>G-TROTS · REVIZIE VIZUALĂ</small><h1>Fiecare pas al comenzii.<br>Fiecare mesaj, mai clar.</h1><p>${pages.length} variante de pagini (15 stări × 2 teme) și ${emails.length} emailuri luminoase. Capturi desktop și telefon. Datele sunt fictive; nu s-au trimis mesaje.</p><nav><a href="#pages">Pagini Zi / Noapte</a><a href="#emails">Emailuri luminoase</a></nav></header><main><h2 id="pages">Pagini după comandă</h2><section class="grid">${cards(pages,'pages')}</section><h2 id="emails">Toate familiile de emailuri</h2><p>Capturi HTML în browser. Aplicațiile de email pot impune propriul mod întunecat.</p><section class="grid">${cards(emails,'emails')}</section></main></html>`);
console.log(`${pages.length} pages + ${emails.length} emails ready in ${out}`);
