<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/product-pricing.php';
require_once dirname(__DIR__) . '/stripe.php';

$root = dirname(__DIR__);
$api = (string)file_get_contents($root . '/api.php');
$stripe = (string)file_get_contents($root . '/stripe.php');

function stripeContractAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

stripeContractAssert(str_contains($api, "defined('GTROTS_SHOP_LIBRARY_ONLY')"), 'API-ul trebuie sa poata fi incarcat sigur de utilitarul operational Stripe.');

$createStart = strpos($api, "if (\$action === 'createProduct'");
$updateStart = strpos($api, "if (\$action === 'updateProduct'");
$deleteStart = strpos($api, "if (\$action === 'deleteProduct'");
stripeContractAssert($createStart !== false && $updateStart !== false && $deleteStart !== false, 'Fluxurile produsului lipsesc din API.');

$createBlock = substr($api, $createStart, $updateStart - $createStart);
$updateBlock = substr($api, $updateStart, $deleteStart - $updateStart);
$deleteBlock = substr($api, $deleteStart, 6500);
stripeContractAssert(str_contains($createBlock, 'stripeSyncProductSafe($db, $config, $id)'), 'Crearea produsului trebuie sa sincronizeze Stripe imediat dupa commit.');
stripeContractAssert(str_contains($updateBlock, 'stripeSyncProductSafe($db, $config, $id)'), 'Editarea produsului trebuie sa sincronizeze Stripe imediat dupa commit.');
stripeContractAssert(str_contains($deleteBlock, 'stripeArchiveProduct($db, $config, $id)'), 'Stergerea produsului trebuie sa arhiveze Stripe inainte de stergerea locala.');
stripeContractAssert(strpos($deleteBlock, 'stripeArchiveProduct($db, $config, $id)') < strpos($deleteBlock, "DELETE FROM shop_products"), 'Arhivarea Stripe trebuie sa aiba loc inaintea stergerii definitive.');
stripeContractAssert(str_contains($updateBlock, '$payload[\'stock_quantity\']'), 'Editorul produsului trebuie sa salveze stocul online chiar daca urmarirea contabila este oprita.');
stripeContractAssert(str_contains($updateBlock, '$wasAccountingTracked && $payload[\'is_accounting_stock_tracked\']'), 'Miscarile contabile trebuie separate de actualizarea stocului online.');
stripeContractAssert(str_contains($api, '$sourceDomain = \'g-trots.ro\';'), 'Un produs fara sursa selectata trebuie tratat ca produs manual G-Trots.');
stripeContractAssert(!str_contains($api, '$source = $db->query(\'SELECT * FROM shop_product_sources WHERE is_active = 1 ORDER BY is_default DESC, sort_order ASC LIMIT 1\')->fetch();'), 'Lipsa sursei nu trebuie sa ataseze automat Boomag sau alta sursa implicita.');

foreach (["'name'", "'active'", "'description'", "'url'", "'metadata'", "'images'"] as $field) {
    stripeContractAssert(str_contains($stripe, $field), "Sincronizarea Stripe trebuie sa includa campul {$field}.");
}
stripeContractAssert(str_contains($stripe, "'default_price' => \$stripePriceId"), 'Pretul public nou trebuie sa devina pret implicit Stripe.');
stripeContractAssert(str_contains($stripe, "['active' => 'false']"), 'Preturile si produsele retrase trebuie arhivate in Stripe.');
stripeContractAssert(str_contains($stripe, "metadata['g_trots_product_id']"), 'Recuperarea idempotenta dupa ID-ul G-Trots trebuie pastrata.');

$unlimited = [
    'is_active' => true,
    'is_purchasable' => true,
    'price' => 149.90,
    'stock_mode' => 'unlimited',
    'stock_quantity' => 0,
];
stripeContractAssert(stripeProductIsVisible($unlimited), 'Produsul manual cu stoc online nelimitat si stoc fizic zero trebuie sa ramana activ in Stripe.');
$unlimitedParams = stripeProductParams($unlimited + [
    'id' => 'manual-unlimited',
    'slug' => 'produs-manual-nelimitat',
    'name' => 'Produs manual nelimitat',
], ['website_base_url' => 'https://g-trots.ro']);
stripeContractAssert(($unlimitedParams['metadata']['availability'] ?? '') === 'in_stock', 'Metadatele Stripe trebuie sa marcheze stocul online nelimitat ca disponibil.');

$unlimited['is_purchasable'] = false;
stripeContractAssert(!stripeProductIsVisible($unlimited), 'Produsul dezactivat sau blocat de taxonomie nu trebuie sa ramana activ in Stripe.');

echo "stripe_catalog_contract_test: OK\n";
