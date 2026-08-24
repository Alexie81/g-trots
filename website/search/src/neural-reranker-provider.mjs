export class NeuralRerankerProvider{
 constructor({endpoint='',timeoutMs=280}={}){this.endpoint=endpoint;this.timeoutMs=timeoutMs;}
 get enabled(){return Boolean(this.endpoint);}
 async rerank(query,rows){if(!this.enabled||!rows.length)return null;const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),this.timeoutMs);try{const r=await fetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,candidates:rows.map(x=>({id:x.doc.id,title:x.doc.title,symptom:x.doc.symptom,quick:x.doc.quick}))}),signal:ctrl.signal});if(!r.ok)return null;return r.json();}catch{return null;}finally{clearTimeout(timer);}}
}
