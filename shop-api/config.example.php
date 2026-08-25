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
    // Foloseste exclusiv chei sk_test_/pk_test_ pana la validarea fluxului.
    'stripe_secret_key' => 'sk_test_replace_me',
    'stripe_publishable_key' => 'pk_test_replace_me',
    // Se primeste o singura data la crearea endpointului webhook Stripe.
    'stripe_webhook_secret' => 'whsec_replace_me',
];
