<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$mobileRoot = file_get_contents($root . '/app/_layout.tsx');
$mobileTypography = file_get_contents($root . '/utils/readableTypography.ts');
$desktopMain = file_get_contents($root . '/electron-app/main.js');

$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$expect(
    str_contains($mobileRoot, 'installReadableTypography();'),
    'Scalarea globală a textului nu este instalată în aplicația mobilă.'
);
$expect(
    str_contains($mobileTypography, 'const MINIMUM_FONT_SIZE = 12;')
        && str_contains($mobileTypography, "setStyleAttributePreprocessor('fontSize'")
        && str_contains($mobileTypography, "setStyleAttributePreprocessor('lineHeight'"),
    'Aplicația mobilă nu impune dimensiunea minimă și spațierea lizibilă.'
);
$expect(
    str_contains($desktopMain, 'minimumFontSize: 12,')
        && str_contains($desktopMain, 'defaultFontSize: 17,')
        && str_contains($desktopMain, 'setZoomFactor(DESKTOP_READABILITY_ZOOM)'),
    'Aplicația desktop nu impune lizibilitatea globală a textelor.'
);

if ($failures !== []) {
    fwrite(STDERR, implode(PHP_EOL, $failures) . PHP_EOL);
    exit(1);
}

echo "OK: regulile globale de lizibilitate sunt active pe mobil și desktop." . PHP_EOL;

