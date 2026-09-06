<?php
declare(strict_types=1);

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

foreach (["'name'", "'active'", "'description'", "'url'", "'metadata'", "'images'"] as $field) {
    stripeContractAssert(str_contains($stripe, $field), "Sincronizarea Stripe trebuie sa includa campul {$field}.");
}
stripeContractAssert(str_contains($stripe, "'default_price' => \$stripePriceId"), 'Pretul public nou trebuie sa devina pret implicit Stripe.');
stripeContractAssert(str_contains($stripe, "['active' => 'false']"), 'Preturile si produsele retrase trebuie arhivate in Stripe.');
stripeContractAssert(str_contains($stripe, "metadata['g_trots_product_id']"), 'Recuperarea idempotenta dupa ID-ul G-Trots trebuie pastrata.');

echo "stripe_catalog_contract_test: OK\n";
