<?php
declare(strict_types=1);

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "product_tabs_contract_test: {$message}\n");
        exit(1);
    }
};

$root = dirname(__DIR__, 2);
$html = (string)file_get_contents($root . '/website/produs.html');
$js = (string)file_get_contents($root . '/website/produs.js');
$liveJs = (string)file_get_contents($root . '/website/shop-live.js');
$css = (string)file_get_contents($root . '/website/produs.css');
$theme = (string)file_get_contents($root . '/website/theme.css');

$assert(!preg_match('/<a[^>]+data-product-tab/i', $html), 'taburile nu trebuie să fie linkuri influențate de base href');
foreach (['#descriere', '#specificatii', '#recenzii', '#intrebari'] as $target) {
    $assert(str_contains($html, 'data-product-target="' . $target . '"'), "lipsește ținta {$target}");
    $assert(str_contains($html, 'id="' . substr($target, 1) . '"'), "lipsește secțiunea {$target}");
}
$assert(str_contains($html, 'produs.js?v=20260922-product-tabs-v2'), 'versiunea JS nu invalidează cache-ul vechi');
$assert(str_contains($html, 'produs.css?v=20261001-product-content-v4'), 'versiunea CSS nu invalidează cache-ul vechi');
$assert(str_contains($html, 'shop-live.js?v=20261001-product-content-v4'), 'versiunea datelor live nu invalidează cache-ul vechi');
$assert(str_contains($html, 'theme.css?v=20261001-product-content-v4'), 'versiunea temei nu invalidează cache-ul vechi');
$assert(str_contains($js, 'tab?.dataset?.productTarget'), 'scriptul nu citește ținta sigură a butonului');
$assert(str_contains($js, 'event.preventDefault()'), 'clickul tabului nu este izolat de navigare');
$assert(str_contains($liveJs, '[data-product-target="#specificatii"]'), 'tabul Specificații nu este activat din datele produsului');
$assert(str_contains($liveJs, '[data-product-target="#intrebari"]'), 'tabul Întrebări nu este activat din datele produsului');
$assert(str_contains($liveJs, 'answerWrap.className = "product-faq-answer"'), 'răspunsurile FAQ nu folosesc cardul animat');
$assert(str_contains($liveJs, 'questionList.querySelectorAll("details[open]")'), 'accordionul FAQ nu închide întrebările anterioare');
$assert(str_contains($css, '.product-content-tabs :is(a, button)'), 'stilurile taburilor nu acoperă butoanele');
$assert(str_contains($css, '@keyframes product-faq-answer-in'), 'animația răspunsurilor FAQ lipsește');
$assert(str_contains($theme, '.product-content-tabs :is(a, button):hover'), 'tema nu păstrează textul vizibil la hover');
$assert(str_contains($theme, 'body.product-page .product-rich-copy :is(h1,h2,h3,h4,h5,h6)'), 'culorile titlurilor din descriere nu sunt controlate de temă');

echo "product_tabs_contract_test: OK\n";
