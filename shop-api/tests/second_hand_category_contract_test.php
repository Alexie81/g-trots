<?php
declare(strict_types=1);

function secondHandCategoryCheck(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$api = file_get_contents($root . '/shop-api/api.php');
$mobileApi = file_get_contents($root . '/services/shopApi.ts');
$mobileCatalog = file_get_contents($root . '/components/ShopModuleScreen.tsx');
$desktopCatalog = file_get_contents($root . '/electron-app/renderer/js/shop-catalog.js');
$desktopCommerce = file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$homepage = file_get_contents($root . '/website/index.html');
$homepageScript = file_get_contents($root . '/website/script.js');
$homepageStyles = file_get_contents($root . '/website/styles.css');
$catalog = file_get_contents($root . '/website/magazin.js');
$catalogStyles = file_get_contents($root . '/website/magazin.css');

secondHandCategoryCheck(str_contains($api, "const SHOP_CATEGORY_SECOND_HAND_KEY = 'second_hand_scooters'"), 'Categoria trebuie sa aiba o cheie tehnica stabila.');
secondHandCategoryCheck(str_contains($api, 'system_key VARCHAR(80) NULL') && str_contains($api, 'is_protected TINYINT(1)'), 'Schema trebuie sa pastreze cheia tehnica si protectia.');
secondHandCategoryCheck(str_contains($api, 'ensureSecondHandShopCategory($db)') && str_contains($api, 'SHOP_CATEGORY_SECOND_HAND_ID'), 'Categoria trebuie creata automat cu un UUID stabil.');
secondHandCategoryCheck(str_contains($api, 'shopCategoryIsProtected($category)') && str_contains($api, "'code' => 'protected_category'"), 'Serverul trebuie sa blocheze stergerea categoriei protejate.');
secondHandCategoryCheck(substr_count($api, "CASE WHEN c.system_key = 'second_hand_scooters' THEN 0 ELSE 1 END") >= 3, 'API-ul trebuie sa livreze categoria second-hand prima in toate listele de categorii.');
secondHandCategoryCheck(
    str_contains($api, "COALESCE(c.system_key, '') <> 'second_hand_scooters'")
    && str_contains($api, 'sh_product.category_id = c.id')
    && str_contains($api, 'sh_product.is_active = 1')
    && str_contains($api, 'COALESCE(sh_source.is_active, 1) = 1'),
    'Filtrul public second-hand trebuie ascuns daca nu exista niciun produs public activ.'
);

secondHandCategoryCheck(str_contains($mobileApi, 'system_key: string | null') && str_contains($mobileApi, 'is_protected: boolean'), 'Aplicatia mobila trebuie sa primeasca marcajele categoriei.');
secondHandCategoryCheck(str_contains($mobileCatalog, 'category.is_protected') && str_contains($mobileCatalog, 'Categorie permanenta a magazinului'), 'Aplicatia mobila trebuie sa ascunda stergerea si sa explice protectia.');
secondHandCategoryCheck(str_contains($desktopCatalog, 'protectedCategoryIndicator') && str_contains($desktopCatalog, 'item?.is_protected'), 'Aplicatia desktop trebuie sa ascunda si sa blocheze stergerea.');
secondHandCategoryCheck(str_contains($mobileApi, 'secondHandCategoryFirst') && str_contains($mobileCatalog, 'secondHandCategoryFirst'), 'Aplicatia mobila trebuie sa afiseze categoria second-hand prima.');
secondHandCategoryCheck(str_contains($desktopCatalog, 'secondHandCategoryFirst') && str_contains($desktopCommerce, 'secondHandCategoryFirst'), 'Aplicatia desktop trebuie sa afiseze categoria second-hand prima in administrare si la produse.');
secondHandCategoryCheck(!str_contains($desktopCatalog, 'shop-system-category-badge') && !str_contains($mobileCatalog, 'systemPill'), 'Categoria protejata trebuie sa arate ca celelalte in liste; numai stergerea ramane blocata.');

secondHandCategoryCheck(str_contains($homepage, 'data-category-system-key="second_hand_scooters"') && str_contains($homepage, 'second-hand-scooters-reconditioned.png'), 'Homepage-ul trebuie sa contina bannerul dedicat.');
secondHandCategoryCheck(
    str_contains($homepage, 'aria-labelledby="second-hand-showcase-title" hidden')
    && str_contains($homepageScript, 'secondHandBanner.hidden = false')
    && str_contains($homepageScript, 'category.is_active === false')
    && str_contains($homepageScript, 'action", "publicProductsPage"')
    && str_contains($homepageScript, 'category_id", category.id')
    && str_contains($homepageScript, 'Number(productsPayload?.total || 0) < 1')
    && !str_contains($catalog, 'isLocalPreview && !payload.categories.some'),
    'Bannerul si filtrul second-hand trebuie sa ramana ascunse pana cand API-ul confirma categoria cu produse publice.'
);
secondHandCategoryCheck(
    strpos($homepage, 'class="second-hand-showcase') > strpos($homepage, 'href="/service-marci-trotinete-electrice"'),
    'Bannerul second-hand trebuie afisat sub toate cardurile de service.'
);
secondHandCategoryCheck(
    str_contains($homepage, 'second-hand-title-reserve')
    && str_contains($homepage, 'second-hand-title-typed')
    && str_contains($homepage, 'second-hand-title-live" aria-hidden="true">Trotinete second‑hand.<br><em><span class="second-hand-title-typed"')
    && str_contains($homepageScript, 'runSecondHandTypewriter')
    && str_contains($homepageScript, 'const phrase = "Pregătite pentru încă un drum.";')
    && str_contains($homepageScript, 'while (true)')
    && str_contains($homepageStyles, '.second-hand-title-reserve'),
    'Doar subtitlul portocaliu trebuie sa ruleze continuu, cu layoutul complet rezervat.'
);
secondHandCategoryCheck(
    str_contains($homepage, 'second-hand-cta-mark')
    && str_contains($homepage, 'Descoperă selecția SH')
    && str_contains($homepageStyles, '.second-hand-cta::before'),
    'Butonul bannerului trebuie sa pastreze tratamentul vizual premium dedicat categoriei SH.'
);
secondHandCategoryCheck(
    str_contains($homepage, '<span class="second-hand-stamp"><i><img src="assets/logo.png"')
    && str_contains($homepageStyles, '.second-hand-stamp > i img'),
    'Insigna de verificare trebuie sa foloseasca sigla G-Trots originala.'
);
secondHandCategoryCheck(str_contains($catalog, 'applyCatalogDeepLink') && str_contains($catalog, 'button.dataset.categoryKey'), 'Catalogul trebuie sa selecteze categoria dupa cheia tehnica, independent de slug.');
secondHandCategoryCheck(
    str_contains($catalog, 'category-filter-root-leaf')
    && str_contains($catalog, 'category-root-link-arrow')
    && str_contains($catalogStyles, '.category-filter-root-leaf')
    && str_contains($catalog, 'left.category.system_key === "second_hand_scooters"'),
    'Categoria second-hand trebuie sa arate ca o categorie principala si sa fie prima in storefront.'
);
secondHandCategoryCheck(
    str_contains($catalog, 'params.get("filters") === "open"')
    && str_contains($catalog, 'openFilters();')
    && str_contains($catalog, 'target.scrollIntoView'),
    'Filtrele mobile trebuie deschise din link, iar categoria selectata trebuie adusa in zona vizibila.'
);

echo "second_hand_category_contract_test: OK\n";
