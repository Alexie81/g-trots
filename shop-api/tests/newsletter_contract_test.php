<?php
declare(strict_types=1);

require_once __DIR__ . '/../order-emails.php';
require_once __DIR__ . '/../newsletter.php';

function newsletterAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$config = [
    'website_base_url' => 'https://g-trots.ro',
    'public_base_url' => 'https://g-trots.ro/shop-api',
    'order_email_logo_url' => 'https://g-trots.ro/assets/logo.png',
];
$subscriber = [
    'email' => 'client@example.com',
    'full_name' => 'Ana Popescu',
    'unsubscribe_token' => str_repeat('a', 64),
];
$product = [
    'id' => 'product-1',
    'name' => 'Cauciuc Tubeless KuKirin G2',
    'slug' => 'cauciuc-tubeless-kukirin-g2',
    'short_description' => 'Cauciuc compatibil, pregătit pentru drum.',
    'price' => 129,
    'sale_price' => null,
    'is_active' => true,
    'images' => [['url' => 'https://g-trots.ro/shop-api/uploads/products/test.webp']],
];

$email = shopNewsletterProductEmail($config, $subscriber, $product);
newsletterAssert(str_contains($email['subject'], $product['name']), 'Subiectul trebuie să conțină produsul.');
newsletterAssert(str_contains($email['html'], 'Ana'), 'Salutul personalizat lipsește.');
newsletterAssert(str_contains($email['html'], $product['images'][0]['url']), 'Imaginea produsului lipsește.');
newsletterAssert(str_contains($email['html'], '129,00 lei'), 'Prețul produsului lipsește sau este formatat greșit.');
newsletterAssert(str_contains($email['html'], 'Vezi produsul'), 'CTA-ul produsului lipsește.');
newsletterAssert(str_contains($email['html'], 'color:#ff5d63'), 'Linkul roșu de dezabonare lipsește.');
newsletterAssert($email['product_url'] === 'https://g-trots.ro/magazin/produs/cauciuc-tubeless-kukirin-g2', 'URL-ul produsului este greșit.');
newsletterAssert(str_contains($email['unsubscribe_url'], str_repeat('a', 64)), 'Tokenul de dezabonare lipsește din URL.');

$successPage = shopNewsletterUnsubscribePage(['state' => 'unsubscribed']);
$alreadyPage = shopNewsletterUnsubscribePage(['state' => 'already_unsubscribed']);
$invalidPage = shopNewsletterUnsubscribePage(['state' => 'invalid']);
newsletterAssert(str_contains($successPage, 'dezabonat cu succes'), 'Pagina de succes nu confirmă dezabonarea.');
newsletterAssert(str_contains($alreadyPage, 'deja dezabonat'), 'Pagina idempotentă nu este clară.');
newsletterAssert(str_contains($invalidPage, 'Linkul nu este valid'), 'Pagina pentru token invalid lipsește.');
newsletterAssert(str_contains($successPage, 'width:min(590px,100%)'), 'Pagina de dezabonare nu are layout responsive.');

$api = file_get_contents(__DIR__ . '/../api.php');
$emails = file_get_contents(__DIR__ . '/../order-emails.php');
$module = file_get_contents(__DIR__ . '/../../components/ShopModuleScreen.tsx');
$manager = file_get_contents(__DIR__ . '/../../components/ShopNewsletterSubscribersManager.tsx');
$products = file_get_contents(__DIR__ . '/../../components/ShopProductsManager.tsx');
newsletterAssert(is_string($api) && str_contains($api, 'shopNewsletterSubscribeFromOrder'), 'Checkoutul nu salvează abonatul.');
newsletterAssert(str_contains($api, "if (\$newsletterOptIn)"), 'Abonarea trebuie să depindă de consimțământul explicit.');
newsletterAssert(str_contains($api, "\$productResponse['newsletter_notification'] = shopNewsletterNotifyNewProduct"), 'Produsul manual nou nu declanșează newsletterul.');
$updateStart = strpos($api, "if (\$action === 'updateProduct'");
$deleteStart = strpos($api, "if (\$action === 'deleteProduct'");
newsletterAssert($updateStart !== false && $deleteStart !== false && !str_contains(substr($api, $updateStart, $deleteStart - $updateStart), 'shopNewsletterNotifyNewProduct'), 'Editarea produsului nu trebuie să retrimită newsletterul.');
newsletterAssert(str_contains($api, "if (\$action === 'listNewsletterSubscribers'"), 'Endpointul pentru tabul abonaților lipsește.');
newsletterAssert(is_string($emails) && str_contains($emails, 'List-Unsubscribe-Post'), 'Headerul standard de dezabonare lipsește.');
newsletterAssert(is_string($module) && str_contains($module, "'newsletter'"), 'Tabul newsletter nu este în navigarea aplicației.');
newsletterAssert(is_string($manager) && str_contains($manager, 'Abonați') && str_contains($manager, 'DEZABONAT'), 'Managerul nu afișează ambele stări.');
newsletterAssert(is_string($products) && str_contains($products, 'saving ? <ProductSaveProgress'), 'Ecranul de progres la salvare lipsește.');

echo "Newsletter contract tests passed.\n";
