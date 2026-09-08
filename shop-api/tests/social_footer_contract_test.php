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
];

foreach ($profiles as $network => $url) {
    socialFooterAssert(str_contains($footer, $url), "Lipsește profilul {$network} din footer.");
    socialFooterAssert(str_contains($footer, "aria-label=\"G-Trots pe {$network}\""), "Lipsește numele accesibil pentru {$network}.");
    socialFooterAssert(substr_count($footer, "'{$url}'") === 1, "Profilul {$network} trebuie declarat și în sameAs pentru schema organizației.");
}

socialFooterAssert(substr_count($footer, 'target="_blank" rel="noopener noreferrer" aria-label="G-Trots pe ') === count($profiles), 'Linkurile sociale externe trebuie izolate și deschise într-o filă nouă.');
socialFooterAssert(str_contains($footer, 'role="navigation" aria-label="Urmărește G-Trots pe rețelele sociale"'), 'Grupul social trebuie expus ca navigație accesibilă.');
socialFooterAssert(str_contains($styles, '.gt-site-footer__contact-row') && str_contains($styles, 'justify-content: space-between'), 'Contactul și grupul social trebuie să stea pe același rând, la capete opuse, pe desktop.');
socialFooterAssert(str_contains($styles, '@media (max-width: 900px)') && str_contains($styles, 'flex-direction: column'), 'Grupul social trebuie centrat sub contact pe mobil.');
socialFooterAssert(!str_contains($footer, 'medium.com') && !str_contains($footer, 'gt-social-link--medium'), 'Medium nu trebuie afișat sau declarat în schema organizației.');
socialFooterAssert(str_contains($footer, 'gt-mobile-wide-link--cross-nav') && str_contains($footer, 'gt-mobile-wide-link--inner-grid'), 'Legăturile finale ale coloanelor mobile trebuie marcate pentru aliniere simetrică.');
socialFooterAssert(str_contains($styles, '.gt-site-footer .gt-mobile-wide-link--cross-nav') && str_contains($styles, '.gt-site-footer .gt-mobile-wide-link--inner-grid'), 'Stilurile mobile trebuie să întindă Garanțiile și Accesibilitatea pe ambele coloane.');
socialFooterAssert(str_contains($footer, 'gt-site-footer__identity--desktop') && str_contains($footer, 'gt-site-footer__identity--mobile'), 'Datele firmei trebuie să aibă o prezentare mobilă dedicată sub navigație.');
socialFooterAssert(str_contains($styles, '.gt-site-footer__identity--mobile { order: 4; display: grid; }'), 'Caseta mobilă a firmei trebuie afișată imediat după navigație.');
socialFooterAssert(str_contains($styles, '@media (prefers-reduced-motion: reduce)') && str_contains($styles, 'animation: none !important'), 'Animațiile trebuie dezactivate pentru utilizatorii care preferă mișcare redusă.');
socialFooterAssert(str_contains($styles, 'width: 2.8rem') && str_contains($styles, 'height: 2.8rem'), 'Țintele tactile sociale trebuie să aibă minimum 44px pe mobil.');

fwrite(STDOUT, "OK: footer social global, accesibil și responsive verificat.\n");
