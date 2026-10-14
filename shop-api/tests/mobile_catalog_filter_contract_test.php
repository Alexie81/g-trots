<?php
declare(strict_types=1);

function mobileCatalogFilterAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$html = file_get_contents($root . '/website/magazin.html');
$script = file_get_contents($root . '/website/magazin.js');
$liveShop = file_get_contents($root . '/website/shop-live.js');
$styles = file_get_contents($root . '/website/magazin.css');

mobileCatalogFilterAssert(is_string($html) && str_contains($html, 'data-mobile-filter-count hidden'), 'Butonul mobil de filtre trebuie să includă badge-ul filtrelor active.');
mobileCatalogFilterAssert(is_string($script) && str_contains($script, 'finishMobileCategorySelection();'), 'Orice categorie selectată trebuie să închidă panoul mobil după aplicarea filtrului.');
mobileCatalogFilterAssert(str_contains($script, 'filtersPanel?.classList.contains("is-open")'), 'Închiderea automată trebuie limitată la panoul mobil deschis.');
mobileCatalogFilterAssert(str_contains($script, 'mobileFilterCount.hidden = activeCount === 0'), 'Badge-ul trebuie ascuns când nu există filtre active.');
mobileCatalogFilterAssert(str_contains($script, 'function syncMobileFiltersPosition()'), 'Panoul mobil trebuie poziționat dinamic sub navbar.');
mobileCatalogFilterAssert(str_contains($script, 'window.requestAnimationFrame(syncMobileFiltersPosition)'), 'Poziția panoului trebuie recalculată după tranziția navbarului.');
mobileCatalogFilterAssert(str_contains($styles, 'Mobile filters v5'), 'Stilurile finale ale filtrului mobil lipsesc.');
mobileCatalogFilterAssert(str_contains($styles, 'background: linear-gradient(155deg, #f8fafc 0%, #edf3f9 100%) !important;'), 'Tema luminoasă nu trebuie să moștenească fundalul negru vechi.');
mobileCatalogFilterAssert(is_string($styles) && str_contains($styles, '.filters-panel .category-filter.active > span::after'), 'Categoria selectată trebuie evidențiată vizual pe mobil și tabletă.');
mobileCatalogFilterAssert(
    is_string($liveShop)
    && str_contains($liveShop, 'publicProductsPage')
    && str_contains($liveShop, 'renderLiveProducts?.(catalogProducts)'),
    'Produsele noi din API trebuie încărcate automat în catalogul și căutarea magazinului.'
);
mobileCatalogFilterAssert(
    str_contains($script, 'article.dataset.search = `${product.name || ""} ${categoryName} ${manufacturerName} ${shortDescription} ${brandNames.join(" ")} ${product.sku || ""} ${product.ean || ""} ${specificationText}`')
    && str_contains($script, '|| searchDeck?.classList.contains("has-inline-results")'),
    'Căutarea inteligentă trebuie să reindexeze produsele noi după nume, taxonomie, descriere, compatibilitate, coduri și specificații.'
);

echo "mobile_catalog_filter_contract_test: OK\n";
