import {normalize, tokens, damerauLevenshtein} from './normalize.mjs';

const GENERIC = new Set([
  'trotineta','trotinete','electrica','electrice','scuter','scutere','electric','problema','probleme',
  'service','reparatie','reparatii','ghid','pentru','care','este','sunt','mea','meu','model','marca','dupa',
  'cand','cum','ce','de','la','cu','si','sau','in','pe','un','o','mai','are','face'
]);
const AMBIGUOUS_MODELS = new Set(['pro','max','mini','city','air','sport','plus','popular','8','10+']);
const CONTEXT_WORDS=['rece','frig','iarna','ploaie','apa','spalare','condens','umezeala','urcare','panta','deal','denivelari','gropi','pavele','impact','cazatura','peste noapte','viteza mare'];

function postingWeight(mask){
  let score=0;
  if(mask&1)score+=24;
  if(mask&2)score+=34;
  if(mask&4)score+=27;
  if(mask&8)score+=9;
  if(mask&16)score+=5;
  return score;
}

export class InstantSearch{
  constructor(docs,meta={},buffer=new ArrayBuffer(0)){
    this.docs=docs;
    this.text=docs.map(d=>normalize(`${d.title} ${d.brand} ${d.model} ${d.symptom} ${d.family}`));
    this.title=docs.map(d=>normalize(d.title));
    this.model=docs.map(d=>normalize(`${d.brand||''} ${d.model||''}`));
    this.tokenKeys=meta.tokens||[];
    this.offsets=Uint32Array.from(meta.offsets||[]);
    this.lengths=Uint32Array.from(meta.lengths||[]);
    this.packed=new Uint32Array(buffer);
    this.tokenIndex=new Map(this.tokenKeys.map((t,i)=>[t,i]));
    this.exactTitles=new Map();
    this.exactModels=new Map();
    for(let i=0;i<docs.length;i++){
      const title=this.title[i];if(title){const a=this.exactTitles.get(title)||[];a.push(i);this.exactTitles.set(title,a);}
      const model=this.model[i];if(model){const a=this.exactModels.get(model)||[];a.push(i);this.exactModels.set(model,a);}
    }
    this.modelKeys=[...this.exactModels.keys()].filter(k=>k.length>=4&&!AMBIGUOUS_MODELS.has(k));
  }

  postingsFor(token){
    const index=this.tokenIndex.get(token);if(index===undefined)return[];
    const offset=this.offsets[index],length=this.lengths[index],out=new Array(length);
    for(let i=0;i<length;i++){
      const value=this.packed[offset+i];out[i]=[value&0xffff,(value>>>16)&0xff];
    }
    return out;
  }

  postingLength(token){const i=this.tokenIndex.get(token);return i===undefined?0:this.lengths[i];}

  fuzzyTokens(token){
    if(token.length<4)return[];
    const found=[];
    for(const key of this.tokenKeys){
      const delta=Math.abs(key.length-token.length);if(delta>2)continue;
      let similarity=0;
      if(key.startsWith(token)||token.startsWith(key))similarity=.92;
      else if(delta<=1){
        const max=token.length<=5?1:2,distance=damerauLevenshtein(token,key,max);
        if(distance<=max)similarity=1-distance/Math.max(token.length,key.length);
      }
      if(similarity>=.68)found.push([key,similarity]);
    }
    found.sort((a,b)=>b[1]-a[1]||this.postingLength(a[0])-this.postingLength(b[0]));
    return found.slice(0,5);
  }

  search(query,limit=10){
    const q=normalize(query);if(q.length<2)return[];
    const raw=[...new Set(tokens(q))];let qt=raw.filter(t=>!GENERIC.has(t));if(!qt.length)qt=raw;
    const candidateScores=new Map(),tokenHits=new Map();
    const add=(docIndex,score,hit=false)=>{candidateScores.set(docIndex,(candidateScores.get(docIndex)||0)+score);if(hit)tokenHits.set(docIndex,(tokenHits.get(docIndex)||0)+1);};

    for(const id of this.exactTitles.get(q)||[])add(id,900,true);
    for(const model of this.modelKeys){
      if(q===model||q.includes(` ${model} `)||q.startsWith(`${model} `)||q.endsWith(` ${model}`))for(const id of this.exactModels.get(model)||[])add(id,260,true);
    }
    for(const token of qt){
      const matches=this.tokenIndex.has(token)?[[token,1]]:this.fuzzyTokens(token);
      for(const [matched,similarity] of matches)for(const [docIndex,mask] of this.postingsFor(matched))add(docIndex,postingWeight(mask)*similarity,true);
    }

    let candidates=[...candidateScores.entries()].sort((a,b)=>b[1]-a[1]).slice(0,Math.max(1200,limit*80));
    if(candidates.length<limit*2)candidates=this.docs.map((_,i)=>[i,0]);
    const scored=[];
    for(const [i,base] of candidates){
      const d=this.docs[i],text=this.text[i],title=this.title[i],model=this.model[i];let s=base;
      if(title===q)s+=500;if(title.includes(q))s+=170;if(text.includes(q))s+=95;
      if(model&&model.length>=4&&!AMBIGUOUS_MODELS.has(model)&&q.includes(model))s+=180;
      let hit=0;for(const t of raw){if(title.includes(t)){s+=17;hit++;}else if(model.includes(t)){s+=22;hit++;}else if(text.includes(t)){s+=8;hit++;}}
      const ratio=hit/Math.max(1,raw.length);if(hit===raw.length&&raw.length>1)s+=145;else if(ratio>=.75)s+=85*ratio;else if(ratio<.35)s-=40;
      if(q.includes('qs s4')&&model.includes('qs s4'))s+=125;if(raw.some(t=>/^\d{2,3}v$/.test(t)&&model.includes(t)))s+=55;
      if((q.includes('incarca')||q.includes('incarcare'))&&(title.includes('incarca')||text.includes('incarcare')))s+=40;
      if(tokenHits.get(i)>=Math.max(1,Math.ceil(qt.length*.7)))s+=45;for(const c of CONTEXT_WORDS)if(title.includes(c)&&!q.includes(c))s-=12;
      if(s>0)scored.push({score:s,doc:d});
    }
    scored.sort((a,b)=>b.score-a.score||a.doc.i-b.doc.i);
    return scored.slice(0,limit).map((x,i)=>({rank:i+1,score:Number(x.score.toFixed(3)),reasons:['instant-v6.1-binary'],...x.doc}));
  }
}
