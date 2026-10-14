const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'shop-api', 'api.php'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'website', 'magazin.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'website', 'magazin.html'), 'utf8');
const liveShop = fs.readFileSync(path.join(root, 'website', 'shop-live.js'), 'utf8');

function includes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

includes(api, 'shop_product_engagement_uniques', 'Lipsește stocarea vizualizărilor și adăugărilor în coș unice.');
includes(api, '40 * LEAST(1, LOG(1 + ', 'Vânzările nu au ponderea de 40% în scor.');
includes(api, '+ 18 * LEAST(1, LOG(1 + ', 'Adăugările în coș nu au ponderea de 18% în scor.');
includes(api, '+ 14 * (', 'Vizualizările nu au ponderea de 14% în scor.');
includes(api, '+ 10 * CASE', 'Trendul cererii nu are ponderea de 10% în scor.');
includes(api, '+ 15 * CASE', 'Expunerea produselor noi nu are ponderea de 15% în scor.');
includes(api, 'BETWEEN 0 AND 60', 'Avantajul produselor noi nu este păstrat timp de 60 de zile.');
includes(api, '+ 3 * CASE WHEN p.is_featured = 1', 'Relevanța editorială nu este inclusă în scor.');
includes(api, "$stockFirst . 'recommendation_score DESC", 'Sortarea recomandată nu aplică stocul înaintea scorului.');
includes(api, "'best_selling' => $stockFirst", 'Sortarea după vânzări lipsește din API.');
includes(api, "'most_viewed' => $stockFirst", 'Sortarea după vizualizări nu pune stocul primul.');
includes(api, "recordProductEngagement($db, (string)$product['id'], 'view'", 'Vizualizările unice nu sunt înregistrate.');
includes(liveShop, 'recordPublicProductEngagement', 'Adăugările în coș nu sunt trimise către scorul ponderat.');
includes(catalog, 'numericMetric(second, "recommendationScore")', 'Catalogul nu folosește scorul ponderat.');
includes(catalog, 'diversifyRecommendedCards', 'Catalogul recomandat nu diversifică primul ecran.');
includes(catalog, 'const priceBandPattern = ["premium", "mid", "accessible"]', 'Catalogul recomandat nu alternează nivelurile de preț.');
includes(catalog, 'if (price >= 180) return "premium";', 'Produsele premium nu sunt identificate pentru primul ecran.');
includes(catalog, 'priceBand(card) !== "micro"', 'Accesoriile foarte ieftine nu sunt coborâte din primele recomandări.');
includes(catalog, 'function prioritizeRecommendedHelmets(cards)', 'Căștile nu sunt promovate în primele recomandări.');
includes(catalog, 'const helmetPositions = [1, 5];', 'Pozițiile rezervate căștilor lipsesc.');
includes(catalog, 'card.dataset.category === "casti-protectie" && card.dataset.stock !== "out-of-stock"', 'Selecția căștilor nu verifică stocul și categoria.');
includes(liveShop, 'query: "&page=1&page_size=2&q=casca"', 'Primele două căști nu sunt încărcate odată cu primul ecran al catalogului.');
includes(catalog, 'function prioritizeCampaignProducts(cards)', 'Produsele promovate temporar nu pot fi fixate în recomandări.');
includes(catalog, 'const campaignSlots = [{ sku: "SE-CMM088", position: 1 }];', 'Produsul SE-CMM088 nu este fixat pe poziția a doua.');
includes(catalog, 'card.dataset.sku === sku && card.dataset.stock !== "out-of-stock"', 'Promovarea temporară nu verifică SKU-ul și stocul.');
includes(liveShop, 'query: "&page=1&page_size=1&q=SE-CMM088"', 'SE-CMM088 nu este încărcat odată cu primul ecran al catalogului.');
includes(catalog, 'const stockDifference = stockRank(first) - stockRank(second)', 'Stocul nu este evaluat înaintea scorului.');
['best-selling', 'most-viewed', 'newest'].forEach(value => {
  includes(page, `value="${value}"`, `Opțiunea de sortare ${value} lipsește.`);
});

console.log('catalog_weighted_ranking_test: OK');
