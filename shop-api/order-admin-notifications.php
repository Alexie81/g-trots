<?php
declare(strict_types=1);

/**
 * Notificări operaționale trimise exclusiv către adresa internă de comenzi.
 * Sunt separate de e-mailurile clientului și folosesc propriul cont SMTP,
 * păstrat numai în config.local.php pe server.
 */

function gtAdminOrderNotificationRecipient(array $config): string
{
    return trim((string)($config['admin_order_notification_recipient'] ?? 'comenzi@g-trots.ro'));
}

function gtAdminOrderNotificationSmtpConfig(array $config): array
{
    $mail = $config;
    foreach ([
        'host' => 'smtp_host',
        'port' => 'smtp_port',
        'encryption' => 'smtp_encryption',
        'username' => 'smtp_username',
        'password' => 'smtp_password',
    ] as $source => $target) {
        $value = $config['admin_order_smtp_' . $source] ?? null;
        if ($value !== null && $value !== '') $mail[$target] = $value;
    }
    $adminFrom = trim((string)($config['admin_order_email_from'] ?? $mail['smtp_username'] ?? ''));
    if ($adminFrom !== '') $mail['order_email_from'] = $adminFrom;
    $mail['order_email_from_name'] = trim((string)($config['admin_order_email_from_name'] ?? 'G-Trots · Comenzi')) ?: 'G-Trots · Comenzi';
    $mail['order_email_reply_to'] = trim((string)($config['admin_order_email_reply_to'] ?? $adminFrom)) ?: $adminFrom;
    return $mail;
}

function gtAdminOrderOpenUrl(array $order, array $config): string
{
    $base = rtrim((string)($config['public_base_url'] ?? 'https://g-trots.ro/shop-api'), '/');
    return $base . '/deschide-comanda.php?order=' . rawurlencode((string)($order['id'] ?? ''));
}

function gtAdminOrderNotificationMeta(string $eventType): array
{
    return match ($eventType) {
        'cancelled_by_customer' => [
            'eyebrow' => 'COMANDĂ ANULATĂ DE CLIENT',
            'title' => 'Clientul a anulat comanda.',
            'subject' => 'Comandă anulată',
            'message' => 'Comanda a fost oprită prin fluxul securizat destinat clientului.',
            'color' => '#fb7185',
            'symbol' => '×',
        ],
        'return_requested_by_customer' => [
            'eyebrow' => 'SOLICITARE NOUĂ DE RETUR',
            'title' => 'Clientul solicită un retur.',
            'subject' => 'Solicitare de retur',
            'message' => 'Cererea a fost înregistrată și așteaptă verificarea în aplicația G-Trots.',
            'color' => '#f472b6',
            'symbol' => '↶',
        ],
        default => [
            'eyebrow' => 'COMANDĂ NOUĂ CONFIRMATĂ',
            'title' => 'Ai primit o comandă nouă.',
            'subject' => 'Comandă nouă',
            'message' => 'Comanda este confirmată și poate fi procesată în aplicația G-Trots.',
            'color' => '#ff8a00',
            'symbol' => '✓',
        ],
    };
}

function gtLoadAdminOrderNotification(PDO $db, string $orderId, array $config): ?array
{
    $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? LIMIT 1');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) return null;
    if (function_exists('orderRow')) return orderRow($db, $order, $config, true, true);

    $items = $db->prepare('SELECT * FROM shop_order_items WHERE order_id = ? ORDER BY id');
    $items->execute([$orderId]);
    $order['items'] = $items->fetchAll();
    return $order;
}

function gtBuildAdminOrderNotificationEmail(array $order, array $config, string $eventType): array
{
    $meta = gtAdminOrderNotificationMeta($eventType);
    $currency = (string)($order['currency'] ?? 'RON');
    $orderNumber = gtEmailEscape((string)($order['order_number'] ?? ''));
    $customerName = gtEmailEscape(gtOrderCustomerDisplayName($order));
    $customerContact = gtEmailEscape(gtOrderCustomerContactName($order));
    $customerEmail = gtEmailEscape((string)($order['customer_email'] ?? ''));
    $customerPhone = gtEmailEscape((string)($order['customer_phone'] ?? ''));
    $createdAt = gtEmailEscape(date('d.m.Y, H:i', strtotime((string)($order['created_at'] ?? 'now'))));
    $paymentMethod = (string)($order['payment_method'] ?? '') === 'card' ? 'Card online · plată confirmată' : 'Ramburs la curier · comandă finalizată';
    $paymentStatus = (string)($order['payment_status'] ?? '') === 'paid' ? 'Plătită' : ((string)($order['payment_method'] ?? '') === 'card' ? 'În verificare' : 'De încasat la livrare');
    $addressParts = array_filter([
        trim((string)($order['address'] ?? '')),
        trim((string)($order['city'] ?? '')),
        trim((string)($order['county'] ?? '')),
        trim((string)($order['postal_code'] ?? '')),
    ]);
    $address = gtEmailEscape(implode(', ', $addressParts));
    $companyRows = '';
    if ((string)($order['customer_type'] ?? '') === 'company') {
        $companyRows = '<tr><td style="padding:5px 0;color:#8f8790">Persoană de contact</td><td align="right" style="color:#fff8f3">' . $customerContact . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#8f8790">CUI / CIF</td><td align="right" style="color:#fff8f3">' . gtEmailEscape((string)($order['company_cui'] ?? '')) . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#8f8790">Registrul Comerțului</td><td align="right" style="color:#fff8f3">' . gtEmailEscape((string)($order['company_registration_number'] ?? '')) . '</td></tr>';
    }

    $itemsHtml = '';
    foreach ((array)($order['items'] ?? []) as $item) {
        if (!is_array($item)) continue;
        $quantity = max(0, (int)($item['quantity'] ?? 0));
        $unitPrice = (float)($item['discounted_unit_price'] ?? $item['unit_price'] ?? 0);
        $lineTotal = (float)($item['discounted_line_total'] ?? $item['line_total'] ?? ($unitPrice * $quantity));
        $imageUrl = gtEmailCompatibleImageUrl((string)($item['image_url'] ?? ''), $config);
        $image = $imageUrl !== ''
            ? '<img src="' . gtEmailEscape($imageUrl) . '" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:contain;border-radius:16px;background:#fff">'
            : '<span style="display:block;width:64px;height:64px;line-height:64px;text-align:center;border-radius:16px;background:#302d33;color:#ffb77a;font-size:18px;font-weight:900">GT</span>';
        $itemsHtml .= '<tr><td style="width:76px;padding:14px 0;border-bottom:1px solid #39353d;vertical-align:top">' . $image . '</td>'
            . '<td style="padding:14px 0 14px 12px;border-bottom:1px solid #39353d;vertical-align:top;min-width:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            . '<tr><td style="padding:0;color:#fff8f3;font-size:14px;line-height:20px;font-weight:900;word-break:break-word;overflow-wrap:anywhere">' . gtEmailEscape((string)($item['product_name'] ?? 'Produs')) . '</td></tr>'
            . '<tr><td style="padding:5px 0 0;color:#8f8790;font-size:10px;line-height:14px">' . gtEmailEscape((string)($item['product_sku'] ?? 'Fără SKU')) . '</td></tr>'
            . '<tr><td style="padding:5px 0 0;color:#bdb5bf;font-size:11px;line-height:16px"><strong style="color:#ffb77a">' . $quantity . ' buc.</strong> × ' . gtEmailMoney($unitPrice, $currency) . '</td></tr>'
            . '<tr><td style="padding:7px 0 0;color:#fff8f3;font-size:13px;line-height:18px;font-weight:900">Total produs: <span style="color:#ffb77a">' . gtEmailMoney($lineTotal, $currency) . '</span></td></tr>'
            . '</table></td></tr>';
    }

    $eventDetails = '';
    if ($eventType === 'cancelled_by_customer') {
        $eventDetails = '<div style="margin-top:15px;padding:17px;border:1px solid #633740;border-radius:20px;background:#28191d"><span style="display:block;color:#fb7185;font-size:9px;font-weight:900;letter-spacing:.11em">MOTIVUL ANULĂRII</span><p style="margin:7px 0 0;color:#f7e8ed;font-size:13px;line-height:1.55">' . gtEmailEscape((string)($order['customer_cancellation_reason'] ?? 'Nespecificat')) . '</p></div>';
    } elseif ($eventType === 'return_requested_by_customer') {
        $returnItems = '';
        foreach ((array)($order['return_items'] ?? []) as $item) {
            if (!is_array($item)) continue;
            $returnItems .= '<li style="margin:5px 0">' . gtEmailEscape((string)($item['product_name'] ?? 'Produs')) . ' · ' . gtEmailQuantity($item['requested_quantity'] ?? 0) . ' buc.</li>';
        }
        $eventDetails = '<div style="margin-top:15px;padding:17px;border:1px solid #5b3c55;border-radius:20px;background:#281923"><span style="display:block;color:#f472b6;font-size:9px;font-weight:900;letter-spacing:.11em">DETALIILE RETURULUI</span><p style="margin:7px 0 0;color:#f7e8f3;font-size:13px;line-height:1.55">' . gtEmailEscape((string)($order['return_reason'] ?? 'Nespecificat')) . '</p>'
            . ($returnItems !== '' ? '<ul style="margin:10px 0 0;padding-left:18px;color:#c6b9c3;font-size:11px;line-height:1.5">' . $returnItems . '</ul>' : '')
            . '<table role="presentation" width="100%" style="margin-top:11px;color:#aaa2ac;font-size:11px"><tr><td>Cost retur</td><td align="right" style="color:#fb7185">−' . gtEmailMoney($order['return_shipping_cost'] ?? 0, $currency) . '</td></tr><tr><td style="padding-top:6px">Estimare restituire</td><td align="right" style="padding-top:6px;color:#6ee7b7;font-weight:900">' . gtEmailMoney($order['return_refund_amount'] ?? 0, $currency) . '</td></tr></table></div>';
    }

    $openUrl = gtAdminOrderOpenUrl($order, $config);
    $openButton = gtEmailTableButton($openUrl, 'Vezi comanda');
    $safeLogo = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://g-trots.ro/assets/logo.png'));
    $color = gtEmailEscape((string)$meta['color']);
    $subject = (string)$meta['subject'] . ' · ' . (string)($order['order_number'] ?? '') . ' · ' . strip_tags(gtEmailMoney($order['total'] ?? 0, $currency));
    $notes = trim((string)($order['customer_notes'] ?? ''));
    $notesHtml = $notes !== '' ? '<tr><td style="padding:5px 0;color:#8f8790">Observații client</td><td align="right" style="max-width:360px;color:#fff8f3">' . gtEmailEscape($notes) . '</td></tr>' : '';
    $discountValue = (float)($order['discount_total'] ?? 0);
    $discountRow = $discountValue > 0
        ? '<tr><td style="padding:5px 0;color:#6ee7b7">Reducere</td><td align="right" style="color:#6ee7b7">−' . gtEmailMoney($discountValue, $currency) . '</td></tr>'
        : '';
    $html = '<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:640px){.gt-wrap{padding:10px!important}.gt-body{padding:22px 16px!important}.gt-title{font-size:31px!important}.gt-order-card{padding:16px!important}.gt-action{display:block!important;text-align:center!important}.gt-hide-mobile{display:none!important}}</style></head>'
        . '<body style="margin:0;background:#0b0a0c;color:#fff8f3;font-family:Roboto,Segoe UI,Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">' . gtEmailEscape((string)$meta['message']) . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a0c"><tr><td class="gt-wrap" align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;border:1px solid #3a363e;border-radius:34px;background:#1d1b20;overflow:hidden"><tr><td style="height:7px;background:' . $color . '"></td></tr><tr><td class="gt-body" style="padding:29px 32px 33px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:60px"><img src="' . $safeLogo . '" width="54" height="54" alt="G-Trots" style="display:block;border-radius:18px"></td><td><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0;color:#fff8f3;font-size:17px;line-height:21px;font-weight:900;mso-line-height-rule:exactly">G-Trots · Comenzi</td></tr><tr><td style="padding:4px 0 0;color:#8f8790;font-size:9px;line-height:12px;font-weight:900;letter-spacing:.1em;mso-line-height-rule:exactly">NOTIFICARE OPERAȚIONALĂ</td></tr></table></td><td class="gt-hide-mobile" align="right"><span style="display:inline-block;width:42px;height:42px;line-height:42px;text-align:center;border-radius:14px;background:' . $color . ';color:#171116;font-size:19px;font-weight:900">' . gtEmailEscape((string)$meta['symbol']) . '</span></td></tr></table>'
        . '<div style="padding:30px 0 20px"><span style="color:' . $color . ';font-size:10px;font-weight:900;letter-spacing:.13em">' . gtEmailEscape((string)$meta['eyebrow']) . '</span><h1 class="gt-title" style="margin:9px 0 11px;color:#fff8f3;font-size:40px;line-height:1.04;letter-spacing:-.045em">' . gtEmailEscape((string)$meta['title']) . '</h1><p style="margin:0;color:#b5adb6;font-size:14px;line-height:1.6">' . gtEmailEscape((string)$meta['message']) . '</p></div>'
        . '<div class="gt-order-card" style="padding:22px;border:1px solid #403b43;border-radius:26px;background:#151318"><table role="presentation" width="100%"><tr><td><span style="display:block;color:#8f8790;font-size:9px;font-weight:900;letter-spacing:.11em">NUMĂR COMANDĂ</span><strong style="display:block;margin-top:5px;color:#ffb77a;font-size:17px">' . $orderNumber . '</strong></td><td align="right"><span style="display:block;color:#8f8790;font-size:9px;font-weight:900;letter-spacing:.11em">DATA</span><strong style="display:block;margin-top:5px;color:#ddd6de;font-size:12px">' . $createdAt . '</strong></td></tr></table><table role="presentation" width="100%" style="margin-top:10px;table-layout:fixed">' . $itemsHtml . '</table>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:15px;color:#aaa2ac;font-size:12px"><tr><td style="padding:5px 0">Subtotal</td><td align="right">' . gtEmailMoney($order['subtotal'] ?? 0, $currency) . '</td></tr>' . $discountRow . '<tr><td style="padding:5px 0">Livrare · ' . gtEmailEscape((string)($order['shipping_method_name'] ?? 'Curier')) . '</td><td align="right">' . gtEmailMoney($order['shipping_cost'] ?? 0, $currency) . '</td></tr><tr><td style="padding:17px 0 0;border-top:1px solid #403b43;color:#fff8f3;font-size:15px;font-weight:900">TOTAL COMANDĂ</td><td align="right" style="padding:17px 0 0;border-top:1px solid #403b43;color:#ffb77a;font-size:23px;font-weight:900">' . gtEmailMoney($order['total'] ?? 0, $currency) . '</td></tr></table></div>'
        . $eventDetails
        . '<div style="margin-top:15px;padding:18px;border:1px solid #403b43;border-radius:22px;background:#211f24"><span style="display:block;margin-bottom:9px;color:#8f8790;font-size:9px;font-weight:900;letter-spacing:.11em">CLIENT ȘI LIVRARE</span><table role="presentation" width="100%" style="font-size:11px"><tr><td style="padding:5px 0;color:#8f8790">Client</td><td align="right" style="color:#fff8f3;font-weight:900">' . $customerName . '</td></tr>' . $companyRows . '<tr><td style="padding:5px 0;color:#8f8790">E-mail</td><td align="right" style="color:#fff8f3">' . $customerEmail . '</td></tr><tr><td style="padding:5px 0;color:#8f8790">Telefon</td><td align="right" style="color:#fff8f3">' . $customerPhone . '</td></tr><tr><td style="padding:5px 0;color:#8f8790">Adresă</td><td align="right" style="color:#fff8f3">' . $address . '</td></tr><tr><td style="padding:5px 0;color:#8f8790">Plată</td><td align="right" style="color:#fff8f3">' . gtEmailEscape($paymentMethod) . ' · ' . gtEmailEscape($paymentStatus) . '</td></tr>' . $notesHtml . '</table></div>'
        . '<div style="padding:23px 0 5px;text-align:center">' . $openButton . '</div><p style="margin:17px 0 0;text-align:center;color:#766f77;font-size:10px;line-height:1.55">Același buton deschide comanda în aplicația G-Trots instalată pe telefon sau pe calculator.</p>'
        . '</td></tr></table></td></tr></table></body></html>';
    return ['subject' => $subject, 'html' => $html, 'open_url' => gtAdminOrderOpenUrl($order, $config)];
}

function gtSendAdminOrderNotification(PDO $db, array $config, string $orderId, string $eventType): array
{
    $recipient = gtAdminOrderNotificationRecipient($config);
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'error' => 'Adresa internă pentru notificările comenzilor nu este validă.'];
    }

    $claimId = function_exists('uuidV4') ? uuidV4() : bin2hex(random_bytes(16));
    try {
        $claim = $db->prepare("INSERT IGNORE INTO shop_order_admin_notifications (id, order_id, event_type, status, attempts, recipient) VALUES (?, ?, ?, 'sending', 1, ?)");
        $claim->execute([$claimId, $orderId, $eventType, $recipient]);
        if ($claim->rowCount() !== 1) {
            $existing = $db->prepare('SELECT status, sent_at, last_error FROM shop_order_admin_notifications WHERE order_id = ? AND event_type = ? LIMIT 1');
            $existing->execute([$orderId, $eventType]);
            $row = $existing->fetch() ?: [];
            return ['sent' => (string)($row['status'] ?? '') === 'sent', 'duplicate' => true, 'sent_at' => $row['sent_at'] ?? null, 'error' => $row['last_error'] ?? null];
        }

        $order = gtLoadAdminOrderNotification($db, $orderId, $config);
        if (!$order) throw new RuntimeException('Comanda nu a putut fi recitită pentru notificarea internă.');
        $email = gtBuildAdminOrderNotificationEmail($order, $config, $eventType);
        gtSmtpSend(gtAdminOrderNotificationSmtpConfig($config), $recipient, (string)$email['subject'], (string)$email['html']);
        $db->prepare("UPDATE shop_order_admin_notifications SET status = 'sent', sent_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?")
            ->execute([$claimId]);
        return ['sent' => true, 'recipient' => $recipient, 'open_url' => $email['open_url']];
    } catch (Throwable $error) {
        try {
            $db->prepare("UPDATE shop_order_admin_notifications SET status = 'failed', last_error = ? WHERE id = ?")
                ->execute([mb_substr($error->getMessage(), 0, 500), $claimId]);
        } catch (Throwable $ignored) {
            // Eroarea de jurnalizare nu trebuie să afecteze comanda confirmată.
        }
        error_log('[G-Trots admin order notification] ' . $eventType . ': ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}
