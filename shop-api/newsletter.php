<?php
declare(strict_types=1);

/**
 * Registrul newsletter este separat de conturile de client și de comenzi:
 * un cumpărător guest se poate abona, iar o comandă fără bifă nu retrage un
 * consimțământ oferit anterior.
 */
function shopNewsletterEnsureSchema(PDO $db): void {
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_newsletter_subscribers (
            id CHAR(36) NOT NULL PRIMARY KEY,
            email VARCHAR(180) NOT NULL,
            email_normalized VARCHAR(180) NOT NULL,
            full_name VARCHAR(180) NOT NULL DEFAULT '',
            phone VARCHAR(50) NOT NULL DEFAULT '',
            status VARCHAR(20) NOT NULL DEFAULT 'subscribed',
            consent_source VARCHAR(60) NOT NULL DEFAULT 'checkout',
            consent_at DATETIME NULL,
            last_consent_order_id CHAR(36) NULL,
            unsubscribed_at DATETIME NULL,
            unsubscribe_token CHAR(64) NOT NULL,
            last_notified_at DATETIME NULL,
            last_error VARCHAR(500) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_newsletter_email (email_normalized),
            UNIQUE INDEX uq_shop_newsletter_token (unsubscribe_token),
            INDEX idx_shop_newsletter_status (status, consent_at),
            INDEX idx_shop_newsletter_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->exec(
        "CREATE TABLE IF NOT EXISTS shop_newsletter_deliveries (
            id CHAR(36) NOT NULL PRIMARY KEY,
            subscriber_id CHAR(36) NOT NULL,
            product_id CHAR(36) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            error_message VARCHAR(500) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sent_at DATETIME NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE INDEX uq_shop_newsletter_delivery (subscriber_id, product_id),
            INDEX idx_shop_newsletter_delivery_status (status, created_at),
            INDEX idx_shop_newsletter_delivery_product (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Migrare unică și idempotentă a consimțămintelor deja salvate în comenzi.
    // INSERT IGNORE păstrează inclusiv starea „dezabonat” dacă migrarea rulează din nou.
    $db->exec(
        "INSERT IGNORE INTO shop_newsletter_subscribers
            (id, email, email_normalized, full_name, phone, status, consent_source, consent_at, last_consent_order_id, unsubscribe_token)
         SELECT UUID(), TRIM(o.customer_email), LOWER(TRIM(o.customer_email)),
                LEFT(COALESCE(o.customer_name, ''), 180), LEFT(COALESCE(o.customer_phone, ''), 50),
                'subscribed', 'checkout_historical', COALESCE(o.newsletter_opt_in_at, o.created_at), o.id,
                LOWER(SHA2(CONCAT(UUID(), RAND(), LOWER(TRIM(o.customer_email))), 256))
         FROM shop_orders o
         WHERE o.newsletter_opt_in = 1
           AND o.customer_email IS NOT NULL
           AND TRIM(o.customer_email) <> ''
         ORDER BY COALESCE(o.newsletter_opt_in_at, o.created_at) DESC"
    );
}

function shopNewsletterSubscribeFromOrder(PDO $db, array $data): void {
    $email = mb_strtolower(trim((string)($data['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return;
    $fullName = mb_substr(trim((string)($data['full_name'] ?? '')), 0, 180);
    $phone = mb_substr(trim((string)($data['phone'] ?? '')), 0, 50);
    $orderId = mb_substr(trim((string)($data['order_id'] ?? '')), 0, 36);
    $id = function_exists('uuidV4') ? uuidV4() : bin2hex(random_bytes(16));
    $token = bin2hex(random_bytes(32));
    $stmt = $db->prepare(
        "INSERT INTO shop_newsletter_subscribers
            (id, email, email_normalized, full_name, phone, status, consent_source, consent_at, last_consent_order_id, unsubscribed_at, unsubscribe_token, last_error)
         VALUES (?, ?, ?, ?, ?, 'subscribed', 'checkout', NOW(), ?, NULL, ?, NULL)
         ON DUPLICATE KEY UPDATE
            email = VALUES(email),
            full_name = CASE WHEN VALUES(full_name) <> '' THEN VALUES(full_name) ELSE full_name END,
            phone = CASE WHEN VALUES(phone) <> '' THEN VALUES(phone) ELSE phone END,
            status = 'subscribed',
            consent_source = 'checkout',
            consent_at = NOW(),
            last_consent_order_id = VALUES(last_consent_order_id),
            unsubscribed_at = NULL,
            last_error = NULL"
    );
    $stmt->execute([$id, $email, $email, $fullName, $phone, $orderId ?: null, $token]);
}

function shopNewsletterList(PDO $db): array {
    $rows = $db->query(
        "SELECT id, email, full_name, phone, status, consent_source, consent_at,
                unsubscribed_at, last_notified_at, last_error, created_at, updated_at
         FROM shop_newsletter_subscribers
         ORDER BY CASE WHEN status = 'subscribed' THEN 0 ELSE 1 END, updated_at DESC, email ASC"
    )->fetchAll();
    return array_map(static function (array $row): array {
        $row['status'] = (string)$row['status'] === 'subscribed' ? 'subscribed' : 'unsubscribed';
        $row['is_subscribed'] = $row['status'] === 'subscribed';
        return $row;
    }, $rows);
}

function shopNewsletterUnsubscribe(PDO $db, string $token): array {
    $token = strtolower(trim($token));
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        return ['state' => 'invalid', 'email' => ''];
    }
    $stmt = $db->prepare('SELECT id, email, status FROM shop_newsletter_subscribers WHERE unsubscribe_token = ? LIMIT 1');
    $stmt->execute([$token]);
    $subscriber = $stmt->fetch();
    if (!$subscriber) return ['state' => 'invalid', 'email' => ''];
    if ((string)$subscriber['status'] !== 'subscribed') {
        return ['state' => 'already_unsubscribed', 'email' => (string)$subscriber['email']];
    }
    $update = $db->prepare("UPDATE shop_newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = NOW(), last_error = NULL WHERE id = ? AND status = 'subscribed'");
    $update->execute([(string)$subscriber['id']]);
    return ['state' => 'unsubscribed', 'email' => (string)$subscriber['email']];
}

function shopNewsletterUnsubscribeUrl(array $config, string $token): string {
    return rtrim((string)($config['public_base_url'] ?? 'https://g-trots.ro/shop-api'), '/')
        . '/newsletter-unsubscribe.php?token=' . rawurlencode($token);
}

function shopNewsletterProductUrl(array $config, array $product): string {
    return rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/')
        . '/magazin/produs/' . rawurlencode((string)($product['slug'] ?? ''));
}

function shopNewsletterProductEmail(array $config, array $subscriber, array $product): array {
    $title = trim((string)($product['name'] ?? 'Produs nou G-Trots'));
    $productUrl = shopNewsletterProductUrl($config, $product);
    $unsubscribeUrl = shopNewsletterUnsubscribeUrl($config, (string)($subscriber['unsubscribe_token'] ?? ''));
    $images = is_array($product['images'] ?? null) ? $product['images'] : [];
    $imageUrl = trim((string)($images[0]['url'] ?? ''));
    $description = trim(preg_replace('/\s+/u', ' ', strip_tags((string)($product['short_description'] ?? ''))) ?? '');
    if ($description === '') $description = 'O apariție nouă în magazinul G-Trots, pregătită pentru alegerea potrivită și o comandă simplă.';
    $description = mb_substr($description, 0, 240);
    $price = (float)(($product['sale_price'] ?? null) !== null ? $product['sale_price'] : ($product['price'] ?? 0));
    $priceLabel = number_format($price, 2, ',', '.') . ' lei';
    $firstName = trim(explode(' ', trim((string)($subscriber['full_name'] ?? '')), 2)[0] ?? '');
    $greeting = $firstName === '' ? 'Salut!' : 'Salut, ' . gtEmailEscape($firstName) . '!';
    $safeTitle = gtEmailEscape($title);
    $safeDescription = gtEmailEscape($description);
    $safeProductUrl = gtEmailEscape($productUrl);
    $safeUnsubscribeUrl = gtEmailEscape($unsubscribeUrl);
    $safeLogo = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://g-trots.ro/assets/logo.png'));
    $imageBlock = $imageUrl !== ''
        ? '<img src="' . gtEmailEscape($imageUrl) . '" width="520" alt="' . $safeTitle . '" style="display:block;width:100%;height:auto;max-height:410px;object-fit:contain;background:#f8f5f1;border-radius:26px">'
        : '<div style="padding:72px 20px;text-align:center;border-radius:26px;background:#211d1a;color:#ff9a2f;font-size:52px">GT</div>';
    $html = <<<HTML
<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#0b0a0a;color:#fff8f3;font-family:Roboto,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">A apărut ceva nou în magazinul G-Trots: {$safeTitle}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a0a"><tr><td style="padding:28px 12px" align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#181615;border:1px solid #3b3028;border-radius:34px;overflow:hidden;box-shadow:0 28px 90px rgba(0,0,0,.5)">
<tr><td style="height:7px;background:#ff8500"></td></tr>
<tr><td style="padding:27px 27px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:56px"><img src="{$safeLogo}" width="52" height="52" alt="G-Trots" style="display:block;width:52px;height:52px;border-radius:17px"></td><td style="padding-left:12px"><strong style="display:block;color:#fff8f3;font-size:17px">G-Trots România</strong><span style="display:block;margin-top:4px;color:#ff9a2f;font-size:9px;font-weight:900;letter-spacing:.13em">NOU ÎN MAGAZIN</span></td></tr></table></td></tr>
<tr><td style="padding:18px 27px 28px"><p style="margin:0;color:#c4bbb4;font-size:14px;line-height:1.6">{$greeting} Am adăugat un produs nou care s-ar putea să-ți fie util.</p>
<div style="margin-top:21px;padding:9px;border:1px solid #40362f;border-radius:31px;background:#100f0e">{$imageBlock}</div>
<h1 style="margin:23px 0 0;color:#fff8f3;font-size:29px;line-height:1.12;letter-spacing:-.035em">{$safeTitle}</h1>
<p style="margin:12px 0 0;color:#aaa09a;font-size:14px;line-height:1.65">{$safeDescription}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:21px"><tr><td style="padding:16px 18px;border:1px solid #4b3828;border-radius:19px;background:#251a12"><span style="display:block;color:#a89d95;font-size:9px;font-weight:900;letter-spacing:.12em">PREȚ G-TROTS</span><strong style="display:block;margin-top:5px;color:#ff9a2f;font-size:24px">{$priceLabel}</strong></td></tr></table>
<div style="padding:23px 0 8px;text-align:center"><a href="{$safeProductUrl}" style="display:inline-block;min-width:210px;padding:17px 27px;border-radius:18px;background:#ff8500;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;box-shadow:0 13px 32px rgba(255,133,0,.25)">Vezi produsul&nbsp;&nbsp;→</a></div>
<p style="margin:18px 0 0;padding-top:18px;border-top:1px solid #302b28;color:#77706b;font-size:10px;line-height:1.6;text-align:center">Primești acest mesaj deoarece ai ales noutăți și oferte G-Trots la checkout.<br><a href="{$safeUnsubscribeUrl}" style="display:inline-block;margin-top:7px;color:#ff5d63;text-decoration:underline;font-weight:800">Dezabonare</a></p>
</td></tr></table></td></tr></table></body></html>
HTML;
    return [
        'subject' => 'Nou la G-Trots: ' . $title,
        'html' => $html,
        'product_url' => $productUrl,
        'unsubscribe_url' => $unsubscribeUrl,
    ];
}

function shopNewsletterNotifyNewProduct(PDO $db, array $config, array $product): array {
    if (empty($product['is_active']) || trim((string)($product['slug'] ?? '')) === '') {
        return ['eligible' => false, 'sent' => 0, 'failed' => 0, 'skipped' => 0];
    }
    $subscribers = $db->query("SELECT * FROM shop_newsletter_subscribers WHERE status = 'subscribed' ORDER BY consent_at ASC, id ASC")->fetchAll();
    $summary = ['eligible' => true, 'subscribers' => count($subscribers), 'sent' => 0, 'failed' => 0, 'skipped' => 0];
    $reserve = $db->prepare("INSERT IGNORE INTO shop_newsletter_deliveries (id, subscriber_id, product_id, status) VALUES (?, ?, ?, 'pending')");
    $sent = $db->prepare("UPDATE shop_newsletter_deliveries SET status = 'sent', sent_at = NOW(), error_message = NULL WHERE subscriber_id = ? AND product_id = ?");
    $failed = $db->prepare("UPDATE shop_newsletter_deliveries SET status = 'failed', error_message = ? WHERE subscriber_id = ? AND product_id = ?");
    $subscriberSent = $db->prepare('UPDATE shop_newsletter_subscribers SET last_notified_at = NOW(), last_error = NULL WHERE id = ?');
    $subscriberFailed = $db->prepare('UPDATE shop_newsletter_subscribers SET last_error = ? WHERE id = ?');
    foreach ($subscribers as $subscriber) {
        $email = mb_strtolower(trim((string)($subscriber['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $summary['skipped']++;
            continue;
        }
        $deliveryId = function_exists('uuidV4') ? uuidV4() : bin2hex(random_bytes(16));
        $reserve->execute([$deliveryId, (string)$subscriber['id'], (string)$product['id']]);
        if ($reserve->rowCount() === 0) {
            $summary['skipped']++;
            continue;
        }
        try {
            $emailContent = shopNewsletterProductEmail($config, $subscriber, $product);
            gtSmtpSend($config, $email, (string)$emailContent['subject'], (string)$emailContent['html'], [], [
                'List-Unsubscribe' => '<' . (string)$emailContent['unsubscribe_url'] . '>',
                'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click',
            ]);
            $sent->execute([(string)$subscriber['id'], (string)$product['id']]);
            $subscriberSent->execute([(string)$subscriber['id']]);
            $summary['sent']++;
        } catch (Throwable $error) {
            $message = mb_substr($error->getMessage(), 0, 500);
            $failed->execute([$message, (string)$subscriber['id'], (string)$product['id']]);
            $subscriberFailed->execute([$message, (string)$subscriber['id']]);
            $summary['failed']++;
            error_log('[G-Trots newsletter product] ' . $message);
        }
    }
    return $summary;
}

function shopNewsletterUnsubscribePage(array $result): string {
    $state = (string)($result['state'] ?? 'invalid');
    $success = in_array($state, ['unsubscribed', 'already_unsubscribed'], true);
    $title = $state === 'unsubscribed' ? 'Te-ai dezabonat cu succes.' : ($state === 'already_unsubscribed' ? 'Ești deja dezabonat.' : 'Linkul nu este valid.');
    $message = $success
        ? 'Nu vei mai primi e-mailuri despre produsele noi G-Trots. Preferința ta a fost salvată imediat.'
        : 'Linkul de dezabonare este incomplet sau nu mai poate fi folosit. Ne poți scrie și rezolvăm imediat.';
    $safeTitle = htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $safeMessage = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $mark = $success ? '✓' : '!';
    return <<<HTML
<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>{$safeTitle} | G-Trots</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#080808;color:#fff8f2;font-family:Inter,Roboto,"Segoe UI",Arial,sans-serif;overflow:hidden}.glow{position:fixed;width:55vw;height:55vw;border-radius:50%;filter:blur(90px);opacity:.16;background:#ff7900;animation:float 7s ease-in-out infinite}.g1{left:-24vw;top:-24vw}.g2{right:-30vw;bottom:-30vw;animation-delay:-3.5s}.card{position:relative;width:min(590px,100%);padding:clamp(26px,6vw,52px);border:1px solid #493324;border-radius:36px;background:linear-gradient(145deg,rgba(33,27,23,.96),rgba(15,14,14,.98));box-shadow:0 38px 120px #000;text-align:center}.logo{width:58px;height:58px;border-radius:19px;box-shadow:0 12px 34px rgba(255,121,0,.25)}.eyebrow{margin-top:24px;color:#ff982f;font-size:11px;font-weight:900;letter-spacing:.16em}.mark{width:74px;height:74px;margin:22px auto 0;display:grid;place-items:center;border:1px solid rgba(255,147,48,.35);border-radius:25px;background:rgba(255,126,0,.12);color:#ff982f;font-size:35px;font-weight:900;animation:pop .55s cubic-bezier(.2,.9,.2,1.2)}h1{margin:22px 0 0;font-size:clamp(29px,7vw,48px);line-height:1.03;letter-spacing:-.05em}p{max-width:455px;margin:17px auto 0;color:#ada39d;font-size:15px;line-height:1.7}.home{display:inline-block;margin-top:29px;padding:16px 24px;border-radius:17px;background:#ff8500;color:#fff;text-decoration:none;font-size:14px;font-weight:900;box-shadow:0 13px 34px rgba(255,133,0,.24)}.note{margin-top:23px;color:#6f6864;font-size:10px}@keyframes pop{from{opacity:0;transform:scale(.55) rotate(-9deg)}to{opacity:1;transform:none}}@keyframes float{50%{transform:translate(8vw,5vw) scale(1.12)}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head><body><div class="glow g1"></div><div class="glow g2"></div><main class="card"><img class="logo" src="https://g-trots.ro/assets/logo.png" alt="G-Trots"><div class="eyebrow">PREFERINȚE NEWSLETTER</div><div class="mark">{$mark}</div><h1>{$safeTitle}</h1><p>{$safeMessage}</p><a class="home" href="https://g-trots.ro/magazin">Vezi magazinul G-Trots&nbsp; →</a><div class="note">Nu este necesară nicio altă confirmare.</div></main></body></html>
HTML;
}
