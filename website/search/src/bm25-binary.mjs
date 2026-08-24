import {uniqueTokens} from './normalize.mjs';
export class BinaryBM25{
 constructor(meta,postings,lengths){this.meta=meta;this.view=new DataView(postings);this.lengths=new Uint16Array(lengths);}
 search(query,limit=180){const scores=new Map(),{N,avgdl,k1=1.35,b=.72,terms}=this.meta;for(const term of uniqueTokens(query)){const x=terms[term];if(!x)continue;const [off,df]=x,idf=Math.log(1+(N-df+.5)/(df+.5));for(let n=0,p=off;n<df;n++,p+=6){const id=this.view.getUint32(p,true),tf=this.view.getUint16(p+4,true),dl=this.lengths[id]||avgdl,score=idf*(tf*(k1+1))/(tf+k1*(1-b+b*dl/avgdl));scores.set(id,(scores.get(id)||0)+score);}}return [...scores.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([id,score],rank)=>({id,score,rank}));}
}
