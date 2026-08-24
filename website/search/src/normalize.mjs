const D={ă:'a',â:'a',î:'i',ș:'s',ş:'s',ț:'t',ţ:'t'};
export function normalize(value=''){return String(value).toLowerCase().replace(/[ăâîșşțţ]/g,c=>D[c]||c).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9+]+/g,' ').replace(/\s+/g,' ').trim();}
export function tokens(value=''){return normalize(value).split(' ').filter(t=>t.length>1);}
export function uniqueTokens(value=''){return [...new Set(tokens(value))];}
export function phrase(haystack,needle){const h=` ${normalize(haystack)} `,n=` ${normalize(needle)} `;return n.trim().length>1&&h.includes(n);}
export function damerauLevenshtein(a='',b='',max=Infinity){a=normalize(a);b=normalize(b);if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;if(Math.abs(a.length-b.length)>max)return max+1;const p2=new Uint16Array(b.length+1),p=new Uint16Array(b.length+1),c=new Uint16Array(b.length+1);for(let j=0;j<=b.length;j++)p[j]=j;for(let i=1;i<=a.length;i++){c[0]=i;let rowMin=c[0];for(let j=1;j<=b.length;j++){const cost=a[i-1]===b[j-1]?0:1;c[j]=Math.min(c[j-1]+1,p[j]+1,p[j-1]+cost);if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])c[j]=Math.min(c[j],p2[j-2]+1);rowMin=Math.min(rowMin,c[j]);}if(rowMin>max)return max+1;p2.set(p);p.set(c);}return p[b.length];}
export function fuzzySimilarity(a,b){const x=normalize(a),y=normalize(b);if(!x||!y)return 0;return 1-damerauLevenshtein(x,y)/Math.max(x.length,y.length);}
export function trigrams(value=''){const s=`  ${normalize(value)}  `,out=new Set();for(let i=0;i<s.length-2;i++){const g=s.slice(i,i+3);if(g.trim())out.add(g);}return [...out];}
export function fnv1a(value=''){let h=2166136261;const bytes=new TextEncoder().encode(String(value));for(const b of bytes){h^=b;h=Math.imul(h,16777619)>>>0;}return h>>>0;}
