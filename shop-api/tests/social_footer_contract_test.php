<?php
declare(strict_types=1);

function socialFooterAssert(bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$root = dirname(__DIR__, 2);
$footer = (string)file_get_contents($root . '/website/legal-footer.js');
$styles = (string)file_get_contents($root . '/website/legal-footer.css');

$profiles = [
    'Instagram' => 'https://www.instagram.com/gtrots.ro/',
    'Facebook' => 'https://www.facebook.com/profile.php?id=61590892933228',
    'TikTok' => 'https://www.tiktok.com/@gtrots.service',
    'X' => 'https://x.com/servicegtrots',
    'YouTube' => 'https://www.youtube.com/@g-trots',
    'Medium' => 'https://medium.com/@servicegtrots',
];

foreach ($profiles as $network => $url) {
    socialFooterAssert(str_contains($footer, $url), "Lipsește profilul {$network} din footer.");
    socialFooterAssert(str_contains($footer, "aria-label=\"G-Trots pe {$network}\""), "Lipsește numele accesibil pentru {$network}.");
    socialFooterAssert(substr_count($footer, "'{$url}'") === 1, "Profilul {$network} trebuie declarat și în sameAs pentru schema organizației.");
}

socialFooterAssert(substr_count($footer, 'target="_blank" rel="noopener noreferrer" aria-label="G-Trots pe ') === count($profiles), 'Linkurile sociale externe trebuie izolate și deschise într-o filă nouă.');
socialFooterAssert(str_contains($footer, 'role="navigation" aria-label="Urmărește G-Trots pe rețelele sociale"'), 'Grupul social trebuie expus ca navigație accesibilă.');
socialFooterAssert(str_contains($styles, '.gt-site-footer__social') && str_contains($styles, 'justify-self: end'), 'Grupul social trebuie aliniat la dreapta pe desktop.');
socialFooterAssert(str_contains($styles, '@media (max-width: 900px)') && str_contains($styles, 'justify-self: center'), 'Grupul social trebuie centrat sub contact pe mobil.');
socialFooterAssert(str_contains($styles, '@media (prefers-reduced-motion: reduce)') && str_contains($styles, 'animation: none !important'), 'Animațiile trebuie dezactivate pentru utilizatorii care preferă mișcare redusă.');
socialFooterAssert(str_contains($styles, 'width: 2.8rem') && str_contains($styles, 'height: 2.8rem'), 'Țintele tactile sociale trebuie să aibă minimum 44px pe mobil.');

fwrite(STDOUT, "OK: footer social global, accesibil și responsive verificat.\n");
