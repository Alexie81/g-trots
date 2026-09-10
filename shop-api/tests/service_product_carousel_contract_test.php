<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$page = (string)file_get_contents($root . '/website/service-trotinete-electrice.html');
$script = (string)file_get_contents($root . '/website/service-products.js');
$styles = (string)file_get_contents($root . '/website/service-products.css');

$assert = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
};

$assert(str_contains($page, 'data-service-products-viewport') && str_contains($page, 'Vezi magazinul G-Trots'), 'Pagina de service nu include vitrina de produse și CTA-ul magazinului.');
$assert(str_contains($page, '/shop-live.js') && str_contains($page, '/service-products.js') && str_contains($page, '/service-products.css'), 'Pagina de service nu încarcă sursa live și resursele caruselului.');
$assert(str_contains($script, "g-trots:live-products") && str_contains($script, 'isAvailable(product)'), 'Caruselul nu folosește catalogul live filtrat după disponibilitate.');
$assert(str_contains($script, 'raw?.is_featured') && str_contains($script, 'featured_rank'), 'Produsele recomandate nu au prioritate în carusel.');
$assert(str_contains($script, "viewport.addEventListener('pointermove'") && str_contains($script, 'requestAnimationFrame(animate)'), 'Caruselul nu este glisabil sau animat continuu.');
$assert(str_contains($styles, '@media (max-width: 700px)') && str_contains($styles, 'touch-action: pan-y'), 'Caruselul nu este adaptat pentru mobil și gesturi tactile.');

echo "service_product_carousel_contract_test: OK\n";
