<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$checkout = (string)file_get_contents($root . '/website/checkout.js');
$login = (string)file_get_contents($root . '/website/login.html');
$register = (string)file_get_contents($root . '/website/cont-nou.html');
$account = (string)file_get_contents($root . '/website/cont.js');
$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$expect(str_contains($api, "\$action === 'publicCheckoutProducts' && \$method === 'POST'"), 'API-ul nu expune catalogul restrâns pentru checkout.');
$expect(str_contains($api, "p.slug IN ({\$checkoutPlaceholders}) OR p.id IN ({\$checkoutPlaceholders})"), 'Produsele checkout nu sunt filtrate după identificatorii din coș.');
$expect(str_contains($checkout, 'api("publicCheckoutProducts"'), 'Checkout-ul nu cere endpoint-ul restrâns.');
$expect(!str_contains($checkout, 'api("publicProducts")'), 'Checkout-ul încă descarcă întregul catalog.');
$expect(str_contains($checkout, 'if (!initialCart.length)'), 'Coșul gol nu evită cererile inutile.');

foreach ([$login, $register] as $page) {
    $expect(str_contains($page, 'data-google-auth aria-busy="true"'), 'Butonul Google nu este randat direct în HTML.');
    $expect(str_contains($page, 'https://accounts.google.com'), 'Lipsește preconectarea la Google.');
}
$expect(str_contains($account, 'Promise.all([') && str_contains($account, 'ensureGoogleScript()'), 'Configurația și scriptul Google nu pornesc în paralel.');

if ($failures) {
    fwrite(STDERR, "Performanță storefront: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "Performanță storefront validată: checkout restrâns la coș și buton Google vizibil imediat.\n";
