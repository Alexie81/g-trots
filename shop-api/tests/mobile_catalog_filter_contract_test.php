<?php
declare(strict_types=1);

function mobileCatalogFilterAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$html = file_get_contents($root . '/website/magazin.html');
$script = file_get_contents($root . '/website/magazin.js');
$styles = file_get_contents($root . '/website/magazin.css');

mobileCatalogFilterAssert(is_string($html) && str_contains($html, 'data-mobile-filter-count hidden'), 'Butonul mobil de filtre trebuie să includă badge-ul filtrelor active.');
mobileCatalogFilterAssert(is_string($script) && str_contains($script, 'finishMobileCategorySelection();'), 'Orice categorie selectată trebuie să închidă panoul mobil după aplicarea filtrului.');
mobileCatalogFilterAssert(str_contains($script, 'filtersPanel?.classList.contains("is-open")'), 'Închiderea automată trebuie limitată la panoul mobil deschis.');
mobileCatalogFilterAssert(str_contains($script, 'mobileFilterCount.hidden = activeCount === 0'), 'Badge-ul trebuie ascuns când nu există filtre active.');
mobileCatalogFilterAssert(is_string($styles) && str_contains($styles, '.filters-panel .category-filter.active > span::after'), 'Categoria selectată trebuie evidențiată vizual pe mobil și tabletă.');

echo "mobile_catalog_filter_contract_test: OK\n";
