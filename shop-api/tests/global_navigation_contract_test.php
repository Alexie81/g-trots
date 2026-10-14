<?php
declare(strict_types=1);

function navigationAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$footer = (string)file_get_contents($root . '/website/legal-footer.js');
$theme = (string)file_get_contents($root . '/website/theme.css');
$favorites = (string)file_get_contents($root . '/website/favorites.js');
$productTemplate = (string)file_get_contents($root . '/website/produs.html');
$guideGenerator = (string)file_get_contents($root . '/scripts/apply-search-metadata.mjs');

$orderedLabels = ['>Servicii</a>', '<span>Shop</span>', '>Ghiduri</a>', '>Cum lucrăm</a>', '>Întrebări</a>', '>Contact</a>'];
foreach (['componenta globală' => $footer, 'acțiunile magazinului' => $favorites, 'șablonul produsului' => $productTemplate, 'generatorul ghidurilor' => $guideGenerator] as $sourceName => $source) {
    $offset = -1;
    foreach ($orderedLabels as $label) {
        $position = strpos($source, $label, $offset + 1);
        navigationAssert($position !== false, "Lipsește {$label} din {$sourceName}.");
        navigationAssert($position > $offset, "Ordinea navbarului este greșită în {$sourceName}.");
        $offset = $position;
    }
}

navigationAssert(!str_contains($footer, '>Despre</a>') && !str_contains($favorites, '>Despre</a>'), 'Navbarul comun nu trebuie să reintroducă vechiul link Despre.');
navigationAssert(str_contains($footer, '<a href="/#servicii">Servicii</a>') && str_contains($favorites, '<a href="/#servicii">Servicii</a>'), 'Servicii trebuie să ducă în secțiunea #servicii a homepage-ului din orice pagină.');
navigationAssert(str_contains($footer, "header.classList.add('gt-public-header')"), 'Orice header existent trebuie să primească stilul global.');
navigationAssert(str_contains($footer, "callButton.className = 'button button-small header-cta call-button'"), 'Butonul desktop trebuie normalizat la Sună acum.');
navigationAssert(str_contains($footer, "headerInner.insertBefore(callButton, headerInner.querySelector('.global-shop-actions, .menu-toggle'))"), 'Butonul Sună acum trebuie adăugat și paginilor care nu îl au.');
navigationAssert(str_contains($footer, 'const cleanToggle = toggle.cloneNode(true)') && str_contains($footer, "toggle.dataset.favoritesMenuBound = 'true'") && str_contains($footer, 'event.stopImmediatePropagation()'), 'Navbarul mobil trebuie să elimine handler-ele vechi și să nu lase listener-ele documentului să anuleze aceeași atingere.');
navigationAssert(str_contains($footer, 'ensureStaticStoreShortcut()') && str_contains($footer, "shortcut.href = '/magazin'"), 'Paginile statice trebuie să ofere intrarea sticky în magazin.');
navigationAssert(str_contains($productTemplate, '/legal-footer.js?v='), 'Produsele viitoare trebuie să încarce navbarul și măsurarea globală cu versiune de cache.');
navigationAssert(str_contains($footer, "const themeStyleVersion = '20261014-navbar-shop-v2'"), 'Componenta globală trebuie să invalideze cache-ul temei pentru noul buton Shop.');
navigationAssert(str_contains($theme, 'gt-navbar-shop-sheen') && str_contains($theme, 'gt-navbar-shop-glow'), 'Butonul Shop trebuie să păstreze animațiile globale de lumină și accent.');
navigationAssert(str_contains($theme, 'linear-gradient(135deg,#ff9d2f 0%,#ff7b00 52%,#e95d00 100%)!important') && str_contains($theme, 'color:#fff!important'), 'Butonul Shop trebuie să fie portocaliu cu text alb în toate temele.');
navigationAssert(str_contains($theme, '.nav-shop-link.active') && str_contains($theme, '.nav-shop-link[aria-current="page"]') && str_contains($theme, 'background:#f36f00 linear-gradient(135deg,#ffa23b 0%,#ff7900 52%,#df5500 100%)!important'), 'Butonul Shop selectat trebuie să rămână portocaliu cu contrast alb.');
navigationAssert(str_contains($theme, '@media (prefers-reduced-motion:reduce)') && str_contains($theme, 'animation:none!important'), 'Animațiile butonului Shop trebuie dezactivate când utilizatorul cere mișcare redusă.');

echo "global_navigation_contract_test: OK\n";
