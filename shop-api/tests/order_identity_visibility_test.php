<?php
declare(strict_types=1);

require_once __DIR__ . '/../order-emails.php';

function assertSameValue($expected, $actual, string $message): void {
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Așteptat: ' . var_export($expected, true) . '; primit: ' . var_export($actual, true));
    }
}

$companyOrder = [
    'customer_type' => 'company',
    'customer_name' => 'Alexie Popescu',
    'company_name' => 'G-Trots Test SRL',
];
assertSameValue('G-Trots Test SRL', gtOrderCustomerDisplayName($companyOrder), 'Comanda PJ trebuie afișată cu denumirea firmei.');
assertSameValue('Alexie Popescu', gtOrderCustomerContactName($companyOrder), 'Persoana de contact PJ trebuie păstrată separat.');

$individualOrder = [
    'customer_type' => 'individual',
    'customer_name' => 'Alexie Popescu',
    'company_name' => 'Firmă rămasă în profil SRL',
];
assertSameValue('Alexie Popescu', gtOrderCustomerDisplayName($individualOrder), 'Alegerea PF la checkout trebuie să aibă prioritate față de datele firmei din profil.');

foreach (['return_requested' => 'Retur solicitat', 'return_confirmed' => 'Retur confirmat'] as $status => $label) {
    assertSameValue($label, gtOrderStatusMeta($status)['label'] ?? null, 'Eticheta publică a statusului activ este incorectă.');
    $blockedEmail = gtSendOrderStatusEmail(['customer_email' => 'client@example.test'], [], $status);
    assertSameValue(false, $blockedEmail['sent'] ?? null, 'Statusul intermediar de retur nu trebuie trimis pe e-mail.');
}

$apiSource = file_get_contents(__DIR__ . '/../api.php');
if ($apiSource === false) throw new RuntimeException('API-ul nu a putut fi citit pentru verificare.');
foreach (['return_requested', 'return_confirmed'] as $status) {
    if (!str_contains($apiSource, "'" . $status . "'")) throw new RuntimeException('Status lipsă din API: ' . $status);
}
if (!str_contains($apiSource, 'publicOrderHistory')) throw new RuntimeException('Filtrarea timeline-ului public lipsește.');

echo "Order identity and return visibility tests passed.\n";
