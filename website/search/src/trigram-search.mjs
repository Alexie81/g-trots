import {trigrams} from './normalize.mjs';
export class TrigramSearch{
 constructor(meta,postings,counts){this.meta=meta.trigrams;this.view=new DataView(postings);this.counts=new Uint16Array(counts);}
 search(query,limit=140){let gs=trigrams(query);if(gs.length<2)return[];gs=gs.filter(g=>this.meta[g]).sort((a,b)=>this.meta[a][1]-this.meta[b][1]).slice(0,14);const hits=new Map();for(const g of gs){const x=this.meta[g];if(!x)continue;const [off,n]=x;for(let j=0,p=off;j<n;j++,p+=4){const id=this.view.getUint32(p,true);hits.set(id,(hits.get(id)||0)+1);}}const qn=gs.length,out=[];for(const [id,h] of hits){if(h<Math.min(3,qn))continue;const score=h/Math.sqrt(qn*Math.max(1,this.counts[id]));out.push({id,score});}return out.sort((a,b)=>b.score-a.score).slice(0,limit);}
}
