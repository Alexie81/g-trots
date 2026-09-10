<?php
declare(strict_types=1);

function publicAddressAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$mobile = (string)file_get_contents($root . '/components/ShopCompanySettingsManager.tsx');
$mobileApi = (string)file_get_contents($root . '/services/shopApi.ts');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$contact = (string)file_get_contents($root . '/website/contact.html');
$contactScript = (string)file_get_contents($root . '/website/contact.js');
$contactStyles = (string)file_get_contents($root . '/website/contact.css');
$footer = (string)file_get_contents($root . '/website/legal-footer.js');
$service = (string)file_get_contents($root . '/website/service-trotinete-electrice.html');
$serviceBucharest = (string)file_get_contents($root . '/website/service-trotinete-electrice-bucuresti.html');

publicAddressAssert(str_contains($api, "physical_address VARCHAR(255) NOT NULL DEFAULT 'București–Ilfov'"), 'Lipsește coloana pentru adresa publică.');
publicAddressAssert(str_contains($api, "'physical_address' => \$field('physical_address', 255)"), 'API-ul nu validează adresa publică.');
publicAddressAssert(str_contains($api, "'physical_address' => trim((string)(\$companyTax['physical_address']"), 'Configurația publică nu expune adresa publică.');
publicAddressAssert(str_contains($api, 'syncPublicCompanyContactPage($savedCompany)'), 'Salvarea firmei nu sincronizează HTML-ul Contact pentru crawlere.');
publicAddressAssert(str_contains($api, "'service-trotinete-electrice.html', 'service-trotinete-electrice-bucuresti.html'"), 'API-ul nu sincronizează ambele pagini publice de service.');

publicAddressAssert(str_contains($mobileApi, 'physical_address: string;'), 'Tipul mobil nu conține adresa publică.');
publicAddressAssert(str_contains($mobile, 'ADRESĂ FIZICĂ / ZONĂ DESERVITĂ') && str_contains($mobile, "update('physical_address'"), 'Aplicația mobilă nu permite editarea adresei publice.');
publicAddressAssert(str_contains($desktop, 'shop-company-physical-address') && str_contains($desktop, 'physical_address:'), 'Aplicația desktop nu permite editarea adresei publice.');

publicAddressAssert(str_contains($contact, 'id="contact-whatsapp-form"') && str_contains($contactScript, 'https://wa.me/'), 'Formularul WhatsApp din Contact nu este complet.');
publicAddressAssert(str_contains($contact, 'id="contact-map"') && str_contains($contactScript, 'company.physical_address'), 'Harta nu urmărește adresa publică.');
publicAddressAssert(str_contains($contactStyles, 'filter: grayscale(.8) invert(.92)') && str_contains($contactStyles, '@media (max-width: 360px)'), 'Harta G-Trots sau adaptarea pentru telefoane mici lipsește.');
publicAddressAssert(str_contains($footer, 'companyPublicAddress(company)') && str_contains($footer, '<dt>Adresă</dt>'), 'Footerul nu folosește adresa publică.');

publicAddressAssert(!str_contains($serviceBucharest, 'contextul „în București”') && !str_contains($serviceBucharest, 'Contextul menționat — în București'), 'Pagina service București conține încă textul SEO artificial.');
foreach (['pagina service' => $service, 'pagina service București' => $serviceBucharest] as $pageName => $page) {
    publicAddressAssert(str_contains($page, 'data-company="physical_address"'), "{$pageName} nu conține adresa publică sincronizabilă.");
    publicAddressAssert(str_contains($page, 'data-company-service-schema'), "{$pageName} nu conține schema de service sincronizabilă.");
    publicAddressAssert(!str_contains($page, 'Momentan nu este publicată') && !str_contains($page, 'Momentan nu afișăm o adresă fixă'), "{$pageName} afișează încă mesajul contradictoriu despre adresă.");
}
publicAddressAssert(!str_contains($serviceBucharest, 'Str. Humulești'), 'Pagina service București confundă încă sediul social cu atelierul.');

echo "company_public_address_contract_test: OK\n";
