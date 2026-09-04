<?php

// Copy as config.local.php only when the sibling trotty-api configuration
// cannot be reused. config.local.php is excluded from Git.
return [
    'api_key' => 'replace-with-the-same-key-used-by-the-apps',
    'db_host' => 'localhost',
    'db_name' => 'cabitro_g-trots-shop',
    'db_user' => 'replace-with-database-user',
    'db_pass' => 'replace-with-database-password',
    'auth_api_url' => 'https://g-trots.ro/trotty-api/api.php',
    'public_base_url' => 'https://g-trots.ro/shop-api',
    'website_base_url' => 'https://g-trots.ro',
    // XML UBL 2.1 este verificat prin același validator oficial folosit de pagina ANAF uploadxmi.
    'anaf_invoice_validation_url' => 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1',
    'anaf_credit_note_validation_url' => 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FCN',
    // Client ID OAuth Web din Google Cloud, folosit pentru autentificarea clienților.
    'google_client_id' => '',
    // OAuth ANAF: valori exclusiv server-side. Generează o cheie aleatorie
    // proprie pentru criptarea AES-256-GCM a tokenurilor din baza de date.
    'anaf_oauth_client_id' => 'replace-with-anaf-client-id',
    'anaf_oauth_client_secret' => 'replace-with-anaf-client-secret',
    'spv_encryption_key' => 'replace-with-at-least-32-random-bytes',
    'anaf_oauth_callback_url' => 'https://g-trots.ro/shop-api/anaf-oauth-callback.php',
    // Rulează shop-api/spv-cron.php din cron-ul CLI al hostingului la fiecare minut.
    'spv_cron_key' => 'replace-only-if-http-cron-is-needed',
    // Foloseste exclusiv chei sk_test_/pk_test_ pana la validarea fluxului.
    'stripe_secret_key' => 'sk_test_replace_me',
    'stripe_publishable_key' => 'pk_test_replace_me',
    // Se primeste o singura data la crearea endpointului webhook Stripe.
    'stripe_webhook_secret' => 'whsec_replace_me',
    // E-mailuri tranzactionale pentru comenzi. Parola ramane doar in config.local.php.
    'order_email_from' => 'contact@g-trots.ro',
    'order_email_from_name' => 'G-Trots România',
    'order_email_reply_to' => 'contact@g-trots.ro',
    'order_email_logo_url' => 'https://g-trots.ro/assets/logo.png',
    'smtp_host' => 'mail.g-trots.ro',
    'smtp_port' => 465,
    'smtp_encryption' => 'ssl',
    'smtp_username' => 'contact@g-trots.ro',
    'smtp_password' => 'replace-with-email-password',
];
