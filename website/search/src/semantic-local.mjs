import {tokens,fnv1a} from './normalize.mjs';
const STOP=new Set('la in pe cu si sau de din dupa cand care este se nu mai un o pentru prin ca iar ale al ai a dintr intr spre foarte cum ce daca'.split(' '));
function queryVector(query,parsed,D){const v=new Float32Array(D),features=[];const add=(s,w)=>tokens(s).forEach(t=>{if(!STOP.has(t))features.push([t,w]);});add(query,2.4);for(const s of parsed.symptoms||[]){add(s.alias,4);add(s.family||'',3);}add((parsed.contexts||[]).join(' '),3);add(parsed.brand||'',2);for(const m of parsed.models||[])add(m.label||m.alias,2.5);const base=tokens(query);for(let i=0;i<base.length-1;i++)features.push([`${base[i]}_${base[i+1]}`,2.2]);for(const [f,w] of features){const h=fnv1a(f),idx=h%D,sign=((h>>>8)&1)?1:-1;v[idx]+=sign*w;}let z=0;for(const x of v)z+=x*x;z=Math.sqrt(z)||1;const q=new Int8Array(D);for(let i=0;i<D;i++)q[i]=Math.max(-127,Math.min(127,Math.round(v[i]/z*127)));return q;}
export class LocalSemanticSearch{
 constructor(meta,buffer){this.D=meta.dimensions;this.count=meta.count;this.vectors=new Int8Array(buffer);}
 search(query,parsed,limit=160){const q=queryVector(query,parsed,this.D),out=new Array(this.count);for(let id=0,off=0;id<this.count;id++,off+=this.D){let dot=0;for(let j=0;j<this.D;j++)dot+=q[j]*this.vectors[off+j];out[id]={id,score:dot};}out.sort((a,b)=>b.score-a.score);return out.slice(0,limit);}
}
