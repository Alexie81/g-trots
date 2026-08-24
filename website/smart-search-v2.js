(function(global){
  'use strict';

  function normalize(value){
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .trim()
      .replace(/\s+/g,' ');
  }

  function tokens(value){
    return normalize(value).split(' ').filter(Boolean);
  }

  function unique(values){
    return [...new Set(values.filter(Boolean))];
  }

  function editDistance(a,b){
    if(a === b) return 0;
    if(!a.length) return b.length;
    if(!b.length) return a.length;
    const row = Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      let prev = row[0];
      row[0] = i;
      for(let j=1;j<=b.length;j++){
        const temp = row[j];
        row[j] = Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));
        prev = temp;
      }
    }
    return row[b.length];
  }

  function fuzzyTokenScore(queryToken, word){
    if(queryToken === word) return 12;
    if(/^\d+$/.test(queryToken) || /^\d+$/.test(word)) return 0;
    if(queryToken.length < 5) return 0;
    const distance = editDistance(queryToken, word);
    if(distance === 1) return 4;
    if(distance === 2 && queryToken.length >= 8) return 1.5;
    return 0;
  }

  function fieldScore(query, queryTokens, value, weight){
    const normalized = normalize(value);
    if(!normalized) return 0;
    const words = tokens(normalized);
    let score = 0;
    if(normalized === query) score += 120 * weight;
    else if(normalized.startsWith(query + ' ')) score += 70 * weight;
    else if(normalized.includes(query)) score += 45 * weight;

    for(const token of queryTokens){
      if(words.includes(token)) score += 12 * weight;
      else if(normalized.includes(token) && token.length >= 4) score += 4 * weight;
      else {
        let best = 0;
        for(const word of words) best = Math.max(best, fuzzyTokenScore(token, word));
        score += best * weight;
      }
    }
    return score;
  }

  function vehicleIntent(query){
    const q = normalize(query);
    if(/\b(scuter|scutere|scooter|scootere)\b/.test(q)) return 'scuter';
    if(/\b(trotineta|trotinete)\b/.test(q)) return 'trotineta';
    return '';
  }

  function itemVehicle(item){
    const haystack = normalize([item.vehicle_type,item.category_id,item.title,item.keyword,...(item.tokens||[])].join(' '));
    if(haystack.includes('scuter') || haystack.includes('scooter')) return 'scuter';
    if(haystack.includes('trotineta') || haystack.includes('trotinete')) return 'trotineta';
    return '';
  }

  function prepare(item){
    const variants = item.variants || [];
    const synonyms = item.synonyms || [];
    const brands = item.brands || [];
    const models = item.models || [];
    const haystack = normalize([
      item.title,
      item.keyword,
      item.zone,
      item.excerpt,
      item.category_id,
      item.intent,
      item.vehicle_type,
      ...variants,
      ...synonyms,
      ...brands,
      ...models,
      ...(item.tokens || [])
    ].join(' '));

    return {
      raw: item,
      title: normalize(item.title),
      keyword: normalize(item.keyword),
      variants: normalize(variants.join(' ')),
      synonyms: normalize(synonyms.join(' ')),
      brands: normalize(brands.join(' ')),
      models: normalize(models.join(' ')),
      zone: normalize(item.zone),
      excerpt: normalize(item.excerpt),
      haystack,
      tokenSet: new Set(tokens(haystack)),
      demand: Number(item.demand_proxy || item.demand || 0),
      vehicle: itemVehicle(item),
    };
  }

  function create(index){
    const prepared = (Array.isArray(index) ? index : []).map(prepare);

    return function search(query, opts = {}){
      const q = normalize(query);
      const limit = opts.limit || 20;
      const category = opts.category || '';
      const vehicleType = opts.vehicleType || '';
      const wantedVehicle = vehicleIntent(q || vehicleType);

      if(!q){
        return prepared
          .filter(entry => (!category || entry.raw.category_id === category) && (!vehicleType || entry.raw.vehicle_type === vehicleType))
          .sort((a,b)=>b.demand-a.demand)
          .slice(0,limit)
          .map(entry => ({...entry.raw,_score:entry.demand,_coverage:0}));
      }

      const queryTokens = unique(tokens(q));
      const scored = [];
      for(const entry of prepared){
        const item = entry.raw;
        if(category && item.category_id !== category) continue;
        if(vehicleType && item.vehicle_type !== vehicleType) continue;

        let score = 0;
        score += fieldScore(q,queryTokens,entry.title,12);
        score += fieldScore(q,queryTokens,entry.keyword,11);
        score += fieldScore(q,queryTokens,entry.models,9);
        score += fieldScore(q,queryTokens,entry.brands,8);
        score += fieldScore(q,queryTokens,entry.variants,6);
        score += fieldScore(q,queryTokens,entry.synonyms,5);
        score += fieldScore(q,queryTokens,entry.zone,3);
        score += fieldScore(q,queryTokens,entry.excerpt,1.5);

        const covered = queryTokens.filter(token => entry.tokenSet.has(token) || (token.length >= 4 && entry.haystack.includes(token))).length;
        const coverage = covered / Math.max(1, queryTokens.length);
        score += coverage * 55;
        if(coverage === 1) score += 45;
        if(item.indexation === 'index-priority') score += 4;
        score += entry.demand / 12;

        if(wantedVehicle){
          if(entry.vehicle === wantedVehicle) score += 420;
          else if(entry.vehicle) score -= 260;
        }

        if(score > 12) scored.push({...item,_score:Math.round(score*100)/100,_coverage:coverage});
      }

      scored.sort((a,b)=>b._score-a._score || b._coverage-a._coverage || (b.demand_proxy||0)-(a.demand_proxy||0));
      return scored.slice(0,limit);
    };
  }

  global.GTrotsSmartSearchV2 = { create, normalize, tokens };
})(typeof window !== 'undefined' ? window : globalThis);