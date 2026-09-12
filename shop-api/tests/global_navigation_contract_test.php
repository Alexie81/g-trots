<?php
declare(strict_types=1);

function navigationAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$footer = (string)file_get_contents($root . '/website/legal-footer.js');
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
navigationAssert(str_contains($productTemplate, 'legal-footer.js?v=20260912-payment-outcomes-v1'), 'Produsele viitoare trebuie să încarce versiunea actuală a navbarului și măsurării globale.');

echo "global_navigation_contract_test: OK\n";
