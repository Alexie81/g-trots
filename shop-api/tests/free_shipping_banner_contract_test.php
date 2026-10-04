<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$api = file_get_contents($root . '/shop-api/api.php');
$web = file_get_contents($root . '/website/promotions.js');
$css = file_get_contents($root . '/website/promotions.css');
$globalShell = file_get_contents($root . '/website/legal-footer.js');
$htaccess = file_get_contents($root . '/website/.htaccess');
$deploy = file_get_contents($root . '/scripts/deploy-storefront-ftps.py');
$desktop = file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$mobile = file_get_contents($root . '/components/ShopMoreManagers.tsx');
$types = file_get_contents($root . '/services/shopApi.ts');

$check = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "free_shipping_banner_contract_test: {$message}\n");
        exit(1);
    }
};

$check(str_contains($api, 'show_free_shipping_banner TINYINT(1) NOT NULL DEFAULT 0'), 'coloana configurabilă lipsește din schemă');
$check(str_contains($api, "publicFreeShippingBanners"), 'endpointul public pentru bară lipsește');
$check(str_contains($api, 'show_free_shipping_banner = 1 AND free_above IS NOT NULL AND free_above > 0'), 'endpointul nu filtrează metodele active eligibile');
$check(str_contains($api, 'ORDER BY free_above ASC'), 'API-ul nu prioritizează cel mai mic prag');
$check(str_contains($api, 'ORDER BY free_above ASC, sort_order ASC, name ASC LIMIT 1'), 'API-ul poate publica mai multe praguri simultan');
$check(str_contains($types, 'show_free_shipping_banner: boolean'), 'tipul comun al aplicațiilor nu conține opțiunea');
$check(str_contains($desktop, 'shop-shipping-free-banner'), 'opțiunea lipsește din aplicația desktop');
$check(str_contains($desktop, 'show_free_shipping_banner: showFreeShippingBanner'), 'desktopul nu salvează opțiunea');
$check(str_contains($mobile, 'title="Arata bara pe site"'), 'opțiunea lipsește din aplicația mobilă');
$check(str_contains($mobile, 'show_free_shipping_banner: form.show_free_shipping_banner'), 'aplicația mobilă nu salvează opțiunea');
$check(str_contains($web, '.sort((left, right) => Number(left.free_above) - Number(right.free_above))'), 'site-ul nu sortează pragurile crescător');
$check(str_contains($web, '.slice(0, 1)'), 'site-ul poate afișa mai multe livrări simultan');
$check(str_contains($web, 'gt-free-shipping-icon'), 'bara nu are iconul propriu de livrare');
$check(str_contains($css, '@keyframes gt-free-shipping-orbit'), 'animația barei de livrare lipsește');
$check(str_contains($css, 'html[data-theme="light"] body.gt-has-promotion-bar .gt-promotion-bar.gt-has-free-shipping'), 'tema light a barei lipsește');
$check(str_contains($css, 'html[data-theme="dark"] body.gt-has-promotion-bar .gt-promotion-bar.gt-has-free-shipping'), 'tema dark a barei lipsește');
$check(str_contains($globalShell, 'function ensurePromotionLayer()'), 'bara nu este încărcată din stratul global al site-ului');
$check(str_contains($globalShell, "href: '/promotions.css'"), 'stilul global al barei nu este centralizat');
$check(str_contains($globalShell, "src: '/promotions.js'"), 'scriptul global al barei nu este centralizat');
$check(str_contains($htaccess, 'promotions\\.(?:css|js)'), 'fișierele globale ale barei pot rămâne blocate în cache');
$check(str_contains($deploy, '"promotions.css"'), 'stilul global al barei lipsește din publicarea storefront');

echo "free_shipping_banner_contract_test: OK\n";
