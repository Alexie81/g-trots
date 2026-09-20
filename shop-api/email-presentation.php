<?php
declare(strict_types=1);

/** Shared presentation for every outgoing HTML email. Content and links stay intact. */
function gtEmailLightDocument(string $html): string
{
    if (str_contains($html, 'data-gt-email="light-v1"')) return $html;
    $ink = [
        '#fff'=>'#17233b', '#ffffff'=>'#17233b', '#fff8f3'=>'#17233b', '#fff4eb'=>'#17233b',
        '#fff6ef'=>'#17233b', '#fff7f0'=>'#17233b', '#f7f4ef'=>'#17233b', '#f1e8ed'=>'#334155',
        '#f7e8ed'=>'#334155', '#f7e8f3'=>'#334155', '#f5d7e0'=>'#9f1239',
        '#d8d1d9'=>'#334155', '#ddd6ce'=>'#334155', '#ddd6de'=>'#334155', '#eee8ef'=>'#334155',
        '#ffb77a'=>'#b45309', '#ff9a2f'=>'#b45309', '#ff9a32'=>'#b45309', '#ffad55'=>'#b45309',
        '#ff8a00'=>'#b45309', '#38bdf8'=>'#0369a1', '#34d399'=>'#047857', '#22c55e'=>'#15803d',
        '#fb923c'=>'#b45309', '#a78bfa'=>'#6d28d9', '#f472b6'=>'#be185d', '#fb7185'=>'#be123c',
        '#fb9aad'=>'#be123c', '#f59e0b'=>'#b45309', '#fbbf24'=>'#a16207', '#2dd4bf'=>'#0f766e',
        '#5eead4'=>'#0f766e', '#6ee7b7'=>'#047857', '#a7f3d0'=>'#047857', '#c6b9c3'=>'#475569',
    ];
    $surfaces = [
        '#1d1b20'=>'#ffffff', '#181615'=>'#ffffff', '#151318'=>'#f6f8fc', '#171519'=>'#ffffff',
        '#1a181d'=>'#f6f8fc', '#211f24'=>'#f6f8fc', '#191817'=>'#f6f8fc', '#211d18'=>'#fff7ed',
        '#272018'=>'#fff7ed', '#2c2117'=>'#fff7ed', '#251a12'=>'#fff7ed', '#211a15'=>'#fff7ed',
        '#2b2118'=>'#ffedd5', '#28191d'=>'#fff1f2', '#25191e'=>'#fff1f2', '#301a20'=>'#fff1f2',
        '#281923'=>'#fdf2f8', '#172421'=>'#ecfdf5', '#302d33'=>'#fff1df', '#211d1a'=>'#fff7ed',
        '#100f0e'=>'#f6f8fc', '#0b0a0c'=>'#eef2f7', '#0b0a0a'=>'#eef2f7',
        '#68635d'=>'#e1e7ef',
    ];
    $html = preg_replace_callback('/style="([^"]*)"/i', static function (array $m) use ($ink, $surfaces): string {
        $style = $m[1];
        $isButton = str_contains($style, 'text-decoration:none') && (str_contains($style, 'background:#ff8500') || str_contains($style, 'display:block'));
        $style = preg_replace_callback('/(?<![-\w])color:(#[a-f0-9]{3,8})(?![a-f0-9])/i', static function(array $c) use ($ink, $isButton): string {
            $hex = strtolower($c[1]);
            if ($isButton && $hex === '#ffffff') return 'color:#ffffff';
            if (isset($ink[$hex])) return 'color:' . $ink[$hex];
            if (preg_match('/^#[0-9a-f]{6}$/', $hex)) {
                $r=hexdec(substr($hex,1,2)); $g=hexdec(substr($hex,3,2)); $b=hexdec(substr($hex,5,2));
                if (max($r,$g,$b)-min($r,$g,$b)<45 && max($r,$g,$b)>70) return 'color:#596579';
            }
            return $c[0];
        }, $style) ?? $style;
        $style = preg_replace_callback('/(?<![-\w])background:(#[a-f0-9]{3,8})(?![a-f0-9])/i', static function(array $c) use ($surfaces): string {
            $hex = strtolower($c[1]);
            if (isset($surfaces[$hex])) return 'background:' . $surfaces[$hex];
            if (strlen($hex) === 9) {
                $alpha = hexdec(substr($hex,7,2))/255;
                $rgb = [];
                for ($i=1;$i<=5;$i+=2) $rgb[] = (int)round(hexdec(substr($hex,$i,2))*$alpha+255*(1-$alpha));
                return 'background:' . vsprintf('#%02x%02x%02x', $rgb);
            }
            return $c[0];
        }, $style) ?? $style;
        $style = preg_replace('/(border(?:-(?:top|bottom|left|right))?:1px solid )#[a-f0-9]{6,8}/i', '$1#dfe5ee', $style) ?? $style;
        $style = preg_replace('/box-shadow:[^;]+/i', 'box-shadow:0 12px 36px rgba(35,52,78,.08)', $style) ?? $style;
        $style = preg_replace_callback('/font-size:(\d+)px/', static fn(array $f): string => 'font-size:' . max(11,(int)$f[1]) . 'px', $style) ?? $style;
        // Avoid fixed line boxes clipping the now-readable small labels.
        $style = preg_replace('/line-height:(?:12|14)px/', 'line-height:17px', $style) ?? $style;
        return 'style="' . $style . '"';
    }, $html) ?? $html;
    $html = preg_replace('/<meta name="(?:color-scheme|supported-color-schemes)"[^>]*>/i', '', $html) ?? $html;
    $head = <<<'HTML'
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<style>
:root{color-scheme:light only;supported-color-schemes:light}body{margin:0!important;background:#eef2f7!important;color:#17233b!important}table{border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;outline:none;max-width:100%}a{overflow-wrap:anywhere}p{line-height:1.65}h1{font-family:Arial,'Segoe UI',sans-serif;letter-spacing:-1.3px!important;line-height:1.12!important}td{word-break:normal;overflow-wrap:anywhere}body>table>tbody>tr>td>table{max-width:660px!important;box-shadow:0 12px 36px rgba(35,52,78,.08)!important}body>table>tbody>tr>td>table>tbody>tr>td{color:#17233b}body>table>tbody>tr>td>table>tbody>tr:first-child>td{height:5px!important}body>table>tbody>tr>td>table>tbody>tr:last-child>td{background:#ffffff;background-image:linear-gradient(#ffffff,#ffffff)}
@media(max-width:600px){body>table>tbody>tr>td,.gt-wrap{padding:12px 8px!important}body>table>tbody>tr>td>table{border-radius:22px!important}body>table>tbody>tr>td>table>tbody>tr>td:not([style*="height:"]),.gt-body{padding:24px 18px!important}.gt-title,h1{font-size:30px!important;line-height:1.15!important}.gt-summary,.gt-timeline,.gt-order-card{padding:16px!important;border-radius:18px!important}.gt-status,.gt-hide-mobile{display:none!important}td[style*="width:155px"]{width:100px!important;padding:14px 10px!important}td[style*="width:76px"]{width:60px!important}td[style*="width:76px"] img{width:52px!important;height:52px!important}td[align="right"]{max-width:190px}body>table>tbody>tr>td>table img{max-width:100%!important}}
[data-ogsc] body{background:#eef2f7!important;color:#17233b!important}
@media(max-width:600px){td[style*="width:72px"]{display:none!important}h1{font-weight:700!important}td[align="right"]{overflow-wrap:normal}td[align="right"][style*="overflow-wrap:anywhere"]{overflow-wrap:anywhere}}
</style>
HTML;
    $html = str_replace('</head>', $head . '</head>', $html);
    $html = preg_replace('/<body\b/', '<body data-gt-email="light-v1" bgcolor="#eef2f7"', $html, 1) ?? $html;
    // Explicit background attributes remain effective in Outlook without CSS.
    $html = preg_replace('/(<body[^>]*style=")[^"]*/', '$1margin:0;background:#eef2f7;color:#17233b;font-family:Arial,\'Segoe UI\',sans-serif;-webkit-font-smoothing:antialiased', $html, 1) ?? $html;
    return $html;
}
