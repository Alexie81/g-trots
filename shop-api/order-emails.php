<?php
declare(strict_types=1);

function gtOrderStatuses(): array {
    return [
        'new' => [
            'label' => 'În procesare',
            'title' => 'Comanda ta este în procesare',
            'message' => 'Am primit comanda ta și verificăm toate detaliile înainte de pregătire.',
            'color' => '#38bdf8',
        ],
        'confirmed' => [
            'label' => 'Confirmată',
            'title' => 'Plata a fost efectuată',
            'message' => 'Plata cu cardul a fost confirmată, iar comanda ta este pregătită pentru următorul pas.',
            'color' => '#34d399',
        ],
        'processing' => [
            'label' => 'În pregătire',
            'title' => 'Am primit comanda ta',
            'message' => 'Îți mulțumim pentru comandă. Comanda este în procesare și a intrat în pregătire.',
            'color' => '#fb923c',
        ],
        'shipped' => [
            'label' => 'Predată curierului',
            'title' => 'Comanda a fost predată curierului',
            'message' => 'Pachetul tău a plecat de la noi și se îndreaptă către adresa de livrare.',
            'color' => '#a78bfa',
        ],
        'completed' => [
            'label' => 'Livrată',
            'title' => 'Comanda a fost livrată',
            'message' => 'Comanda a ajuns la destinație. Îți mulțumim că ai ales G-Trots România.',
            'color' => '#22c55e',
        ],
        'cancelled' => [
            'label' => 'Comandă anulată',
            'title' => 'Comanda a fost anulată',
            'message' => 'Comanda nu va mai fi procesată. Dacă ai nevoie de ajutor, răspunde direct la acest e-mail.',
            'color' => '#fb7185',
        ],
    ];
}

function gtOrderStatusMeta(string $status): array {
    $statuses = gtOrderStatuses();
    return $statuses[$status] ?? $statuses['new'];
}

function gtEmailEscape($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function gtEmailMoney($value, string $currency = 'RON'): string {
    return number_format((float)$value, 2, ',', '.') . ' ' . gtEmailEscape($currency);
}

function gtEmailTrackingUrl(array $order, array $config): string {
    $base = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    return $base . '/urmarire-comanda?token=' . rawurlencode((string)($order['tracking_token'] ?? ''));
}

function gtEmailStatusTimeline(string $status, string $paymentMethod = 'card'): string {
    $flow = $paymentMethod === 'cash_on_delivery'
        ? ['processing', 'shipped', 'completed']
        : ['new', 'confirmed', 'processing', 'shipped', 'completed'];
    $currentIndex = array_search($status, $flow, true);
    $cancelled = $status === 'cancelled';
    if ($currentIndex === false) $currentIndex = 0;
    $cellWidth = 100 / max(1, count($flow));
    $cells = '';
    foreach ($flow as $index => $value) {
        $meta = gtOrderStatusMeta($value);
        $active = !$cancelled && $index <= $currentIndex;
        $circleColor = $active ? (string)$meta['color'] : '#35322f';
        $textColor = $active ? '#f7f2eb' : '#77716b';
        $line = $index < count($flow) - 1
            ? '<span style="display:block;height:3px;background:' . ($active && $index < $currentIndex ? '#ff8a00' : '#35322f') . ';margin:9px 0 0 22px;border-radius:99px"></span>'
            : '';
        $cells .= '<td style="width:' . number_format($cellWidth, 2, '.', '') . '%;vertical-align:top;padding:0 3px;text-align:center">'
            . '<span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:99px;background:' . $circleColor . ';color:#0d0d0d;font-size:10px;font-weight:900">' . ($active ? '✓' : (string)($index + 1)) . '</span>'
            . $line
            . '<span style="display:block;margin-top:9px;color:' . $textColor . ';font-size:10px;font-weight:800;line-height:1.25">' . gtEmailEscape($meta['label']) . '</span>'
            . '</td>';
    }
    if ($cancelled) {
        $meta = gtOrderStatusMeta('cancelled');
        return '<div style="padding:16px 18px;border:1px solid rgba(251,113,133,.35);border-radius:18px;background:#261719;color:#fb7185;font-weight:900">×&nbsp;&nbsp;' . gtEmailEscape($meta['label']) . '</div>';
    }
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' . $cells . '</tr></table>';
}

function gtBuildOrderEmail(array $order, array $config, string $status): array {
    $meta = gtOrderStatusMeta($status);
    $currency = (string)($order['currency'] ?? 'RON');
    $trackingUrl = gtEmailTrackingUrl($order, $config);
    $logoUrl = (string)($config['order_email_logo_url'] ?? 'https://g-trots.ro/assets/logo.png');
    $firstName = trim(explode(' ', trim((string)($order['customer_name'] ?? '')), 2)[0] ?? '');
    $greeting = $firstName !== '' ? 'Salut, ' . gtEmailEscape($firstName) . '!' : 'Salut!';
    $itemsHtml = '';
    foreach (($order['items'] ?? []) as $item) {
        if (!is_array($item)) continue;
        $imageUrl = trim((string)($item['image_url'] ?? ''));
        $image = $imageUrl !== ''
            ? '<img src="' . gtEmailEscape($imageUrl) . '" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:16px;background:#f3f1ee">'
            : '<span style="display:block;width:64px;height:64px;line-height:64px;text-align:center;border-radius:16px;background:#2c2824;color:#ff8a00;font-size:22px;font-weight:900">GT</span>';
        $itemsHtml .= '<tr>'
            . '<td style="padding:14px 0;border-bottom:1px solid #302d2a;width:76px;vertical-align:middle">' . $image . '</td>'
            . '<td style="padding:14px 12px;border-bottom:1px solid #302d2a;vertical-align:middle">'
            . '<strong style="display:block;color:#f7f2eb;font-size:14px;line-height:1.35">' . gtEmailEscape($item['product_name'] ?? '') . '</strong>'
            . '<span style="display:block;color:#8e8881;font-size:11px;margin-top:4px">' . (int)($item['quantity'] ?? 0) . ' × ' . gtEmailMoney($item['unit_price'] ?? 0, $currency) . '</span>'
            . '</td>'
            . '<td style="padding:14px 0;border-bottom:1px solid #302d2a;text-align:right;vertical-align:middle;color:#f7f2eb;font-size:13px;font-weight:900;white-space:nowrap">' . gtEmailMoney($item['line_total'] ?? 0, $currency) . '</td>'
            . '</tr>';
    }
    $paymentLabel = ($order['payment_method'] ?? '') === 'card' ? 'Card online' : 'Ramburs la curier';
    $subject = (string)$meta['title'] . ' · ' . (string)($order['order_number'] ?? 'G-Trots');
    $preheader = gtEmailEscape((string)$meta['message']);
    $html = '<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<style>@media(max-width:640px){.gt-wrap{padding:12px!important}.gt-card{border-radius:28px!important}.gt-body{padding:24px 18px!important}.gt-title{font-size:31px!important}.gt-receipt{padding:18px!important}.gt-action{display:block!important;width:auto!important;text-align:center!important}.gt-hide-mobile{display:none!important}}</style></head>'
        . '<body style="margin:0;background:#090909;color:#f7f2eb;font-family:Arial,Helvetica,sans-serif">'
        . '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' . $preheader . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#090909"><tr><td class="gt-wrap" style="padding:34px 16px" align="center">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="gt-card" style="width:100%;max-width:680px;background:#151412;border:1px solid #302b25;border-radius:36px;overflow:hidden;box-shadow:0 28px 90px rgba(0,0,0,.48)">'
        . '<tr><td style="height:7px;background:linear-gradient(90deg,#ff6b00,#ffb12b)"></td></tr>'
        . '<tr><td class="gt-body" style="padding:32px 34px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>'
        . '<img src="' . gtEmailEscape($logoUrl) . '" width="54" height="54" alt="G-Trots România" style="display:block;width:54px;height:54px;border-radius:17px">'
        . '</td><td style="padding-left:12px"><strong style="display:block;color:#fff;font-size:17px">G-Trots România</strong><span style="color:#8f8881;font-size:10px;letter-spacing:.08em">SERVICE &amp; MAGAZIN</span></td>'
        . '<td align="right"><span style="display:inline-block;padding:9px 13px;border-radius:99px;background:' . gtEmailEscape((string)$meta['color']) . '22;color:' . gtEmailEscape((string)$meta['color']) . ';font-size:11px;font-weight:900">' . gtEmailEscape((string)$meta['label']) . '</span></td></tr></table>'
        . '<div style="padding:32px 0 28px"><span style="color:#ff8a00;font-size:10px;font-weight:900;letter-spacing:.14em">ACTUALIZARE COMANDĂ</span>'
        . '<h1 class="gt-title" style="margin:10px 0 12px;color:#f8f4ee;font-size:42px;line-height:1.04;letter-spacing:-.04em">' . gtEmailEscape((string)$meta['title']) . '</h1>'
        . '<p style="margin:0;color:#aaa39b;font-size:15px;line-height:1.65">' . $greeting . ' ' . gtEmailEscape((string)$meta['message']) . '</p></div>'
        . '<div style="padding:18px;border-radius:22px;background:#1d1b18;border:1px solid #302d29">' . gtEmailStatusTimeline($status, (string)($order['payment_method'] ?? 'card')) . '</div>'
        . '<div class="gt-receipt" style="margin-top:20px;padding:24px;border-radius:26px;background:#10100f;border:1px solid #302d29">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><span style="display:block;color:#77716b;font-size:9px;font-weight:900;letter-spacing:.12em">BON COMANDĂ</span><strong style="display:block;margin-top:5px;color:#ff9a25;font-size:16px">' . gtEmailEscape($order['order_number'] ?? '') . '</strong></td>'
        . '<td align="right"><span style="display:block;color:#77716b;font-size:9px;font-weight:900;letter-spacing:.12em">DATA</span><strong style="display:block;margin-top:5px;color:#d8d2ca;font-size:12px">' . gtEmailEscape(date('d.m.Y, H:i', strtotime((string)($order['created_at'] ?? 'now')))) . '</strong></td></tr></table>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">' . $itemsHtml . '</table>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;color:#aaa39b;font-size:12px">'
        . '<tr><td style="padding:6px 0">Subtotal</td><td align="right">' . gtEmailMoney($order['subtotal'] ?? 0, $currency) . '</td></tr>'
        . '<tr><td style="padding:6px 0">Livrare · ' . gtEmailEscape($order['shipping_method_name'] ?? '') . '</td><td align="right">' . gtEmailMoney($order['shipping_cost'] ?? 0, $currency) . '</td></tr>'
        . '<tr><td style="padding:6px 0">Plată</td><td align="right">' . gtEmailEscape($paymentLabel) . '</td></tr>'
        . '<tr><td style="padding:18px 0 0;border-top:1px dashed #3a3631;color:#f7f2eb;font-size:16px;font-weight:900">Total</td><td align="right" style="padding:18px 0 0;border-top:1px dashed #3a3631;color:#f7f2eb;font-size:22px;font-weight:900">' . gtEmailMoney($order['total'] ?? 0, $currency) . '</td></tr>'
        . '</table></div>'
        . '<div style="padding:22px 0 8px;text-align:center"><a class="gt-action" href="' . gtEmailEscape($trackingUrl) . '" style="display:inline-block;padding:16px 28px;border-radius:18px;background:#ff8a00;color:#12100e;text-decoration:none;font-size:14px;font-weight:900;box-shadow:0 12px 30px rgba(255,138,0,.22)">Urmărește comanda&nbsp;&nbsp;→</a></div>'
        . '<div style="margin-top:15px;padding:15px 17px;border-radius:18px;background:#211d18;border:1px solid #382f25;color:#a9a198;font-size:11px;line-height:1.55"><strong style="color:#f0e9df">Cum verifici comanda?</strong><br>Apasă butonul de mai sus pentru acces direct și securizat. O poți căuta și manual pe pagina „Urmărire comandă”, folosind codul <strong style="color:#ff9a25">' . gtEmailEscape($order['order_number'] ?? '') . '</strong> împreună cu adresa ta de e-mail.</div>'
        . '<p style="margin:24px 0 0;text-align:center;color:#68635e;font-size:10px;line-height:1.6">Ai nevoie de ajutor? Răspunde direct la acest mesaj.<br>G-Trots România · g-trots.ro</p>'
        . '</td></tr></table></td></tr></table></body></html>';
    return ['subject' => $subject, 'html' => $html, 'tracking_url' => $trackingUrl];
}

function gtSmtpRead($socket): string {
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (strlen($line) < 4 || $line[3] === ' ') break;
    }
    return trim($response);
}

function gtSmtpCommand($socket, string $command, array $expectedCodes): string {
    if ($command !== '') fwrite($socket, $command . "\r\n");
    $response = gtSmtpRead($socket);
    $code = (int)substr($response, 0, 3);
    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException('Serverul de e-mail a răspuns cu eroarea ' . $code . '.');
    }
    return $response;
}

function gtSmtpSend(array $config, string $recipient, string $subject, string $html): void {
    $host = trim((string)($config['smtp_host'] ?? ''));
    $port = (int)($config['smtp_port'] ?? 465);
    $encryption = strtolower(trim((string)($config['smtp_encryption'] ?? 'ssl')));
    $username = trim((string)($config['smtp_username'] ?? ''));
    $password = (string)($config['smtp_password'] ?? '');
    $from = trim((string)($config['order_email_from'] ?? $username));
    $fromName = trim((string)($config['order_email_from_name'] ?? 'G-Trots România'));
    $replyTo = trim((string)($config['order_email_reply_to'] ?? $from));
    if ($host === '' || $username === '' || $password === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Configurația SMTP nu este completă.');
    }
    $remote = ($encryption === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $errno = 0;
    $error = '';
    $socket = @stream_socket_client($remote, $errno, $error, 20, STREAM_CLIENT_CONNECT);
    if (!$socket) throw new RuntimeException('Conexiunea la serverul de e-mail nu a putut fi deschisă.');
    stream_set_timeout($socket, 20);
    try {
        gtSmtpCommand($socket, '', [220]);
        gtSmtpCommand($socket, 'EHLO g-trots.ro', [250]);
        if ($encryption === 'tls') {
            gtSmtpCommand($socket, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Conexiunea SMTP securizată nu a putut fi inițiată.');
            }
            gtSmtpCommand($socket, 'EHLO g-trots.ro', [250]);
        }
        gtSmtpCommand($socket, 'AUTH LOGIN', [334]);
        gtSmtpCommand($socket, base64_encode($username), [334]);
        gtSmtpCommand($socket, base64_encode($password), [235]);
        gtSmtpCommand($socket, 'MAIL FROM:<' . $from . '>', [250]);
        gtSmtpCommand($socket, 'RCPT TO:<' . $recipient . '>', [250, 251]);
        gtSmtpCommand($socket, 'DATA', [354]);
        $encodedName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . $encodedName . ' <' . $from . '>',
            'To: <' . $recipient . '>',
            'Reply-To: ' . $replyTo,
            'Subject: ' . $encodedSubject,
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@g-trots.ro>',
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ];
        $message = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($html), 76, "\r\n");
        $message = preg_replace('/(?m)^\./', '..', $message) ?? $message;
        fwrite($socket, $message . "\r\n.\r\n");
        gtSmtpCommand($socket, '', [250]);
        gtSmtpCommand($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

function gtSendOrderStatusEmail(array $order, array $config, string $status): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
    }
    try {
        $email = gtBuildOrderEmail($order, $config, $status);
        gtSmtpSend($config, $recipient, (string)$email['subject'], (string)$email['html']);
        return ['sent' => true, 'recipient' => $recipient, 'tracking_url' => $email['tracking_url']];
    } catch (Throwable $error) {
        error_log('[G-Trots order email] ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}
