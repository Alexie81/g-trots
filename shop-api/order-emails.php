<?php
declare(strict_types=1);

function gtOrderStatuses(): array {
    return [
        'new' => [
            'label' => 'În procesare',
            'title' => 'Am primit comanda ta',
            'message' => 'Comanda este nouă și se află în procesare. Verificăm toate detaliile înainte să începem pregătirea.',
            'color' => '#38bdf8',
            'eyebrow' => 'COMANDĂ NOUĂ',
            'symbol' => '01',
            'next_title' => 'Urmează verificarea comenzii',
            'next_message' => 'Confirmăm produsele, stocul și datele de livrare.',
        ],
        'confirmed' => [
            'label' => 'Confirmată',
            'title' => 'Comanda a fost confirmată',
            'message' => 'Am primit comanda ta, plata cu cardul a fost efectuată și comanda este confirmată.',
            'color' => '#34d399',
            'eyebrow' => 'PLATĂ EFECTUATĂ',
            'symbol' => '✓',
            'next_title' => 'Urmează pregătirea produselor',
            'next_message' => 'Nu mai ai nimic de făcut. Echipa noastră începe pregătirea comenzii.',
        ],
        'processing' => [
            'label' => 'În pregătire',
            'title' => 'Comanda este în pregătire',
            'message' => 'Produsele tale sunt pregătite și verificate înainte de predarea către curier.',
            'color' => '#fb923c',
            'eyebrow' => 'ÎN PREGĂTIRE',
            'symbol' => '02',
            'next_title' => 'Pregătim predarea către curier',
            'next_message' => 'Ambalăm produsele și pregătim documentele pentru expediere.',
        ],
        'shipped' => [
            'label' => 'Predată curierului',
            'title' => 'Comanda a fost predată curierului',
            'message' => 'Pachetul tău a plecat de la noi și se îndreaptă către adresa de livrare.',
            'color' => '#a78bfa',
            'eyebrow' => 'COMANDA ESTE PE DRUM',
            'symbol' => '03',
            'next_title' => 'Urmează livrarea',
            'next_message' => 'Curierul va continua transportul către adresa indicată în comandă.',
        ],
        'completed' => [
            'label' => 'Livrată',
            'title' => 'Comanda a fost livrată',
            'message' => 'Comanda a ajuns la destinație. Îți mulțumim că ai ales G-Trots România.',
            'color' => '#22c55e',
            'eyebrow' => 'LIVRARE FINALIZATĂ',
            'symbol' => '✓',
            'next_title' => 'Totul este gata',
            'next_message' => 'Îți mulțumim pentru încredere. Suntem aici dacă ai nevoie de ajutor.',
        ],
        'refunded' => [
            'label' => 'Rambursată',
            'title' => 'Comanda a fost rambursată',
            'message' => 'Comanda a fost returnată, iar rambursarea a fost înregistrată. Dacă ai întrebări, răspunde direct la acest e-mail.',
            'color' => '#f59e0b',
            'eyebrow' => 'RAMBURSARE ÎNREGISTRATĂ',
            'symbol' => '↶',
            'next_title' => 'Rambursarea este înregistrată',
            'next_message' => 'Păstrează acest mesaj pentru evidență și contactează-ne dacă ai nevoie de detalii.',
        ],
        'cancelled' => [
            'label' => 'Comandă anulată',
            'title' => 'Comanda a fost anulată',
            'message' => 'Comanda nu va mai fi procesată. Dacă ai nevoie de ajutor, răspunde direct la acest e-mail.',
            'color' => '#fb7185',
            'eyebrow' => 'COMANDĂ OPRITĂ',
            'symbol' => '×',
            'next_title' => 'Ai nevoie de ajutor?',
            'next_message' => 'Răspunde direct la acest mesaj și echipa G-Trots îți va oferi toate detaliile.',
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
    $flow = ['new', 'confirmed', 'processing', 'shipped', 'completed'];
    $currentIndex = array_search($status, $flow, true);
    $terminal = in_array($status, ['refunded', 'cancelled'], true);
    if ($currentIndex === false) $currentIndex = 0;
    $rows = '';
    foreach ($flow as $index => $value) {
        $meta = gtOrderStatusMeta($value);
        $reached = !$terminal && $index <= $currentIndex;
        $current = !$terminal && $index === $currentIndex;
        $tone = $current ? (string)$meta['color'] : ($reached ? '#ff9a2f' : '#68635d');
        $surface = $current ? (string)$meta['color'] . '18' : ($reached ? '#211d18' : '#191817');
        $border = $current ? (string)$meta['color'] . '55' : '#302d29';
        $stateLabel = $current ? 'ACUM' : ($reached ? 'FINALIZAT' : 'URMEAZĂ');
        $rows .= '<tr><td style="padding:0 0 8px">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . $surface . ';border:1px solid ' . $border . ';border-radius:18px">'
            . '<tr><td style="width:48px;padding:11px 0 11px 12px">'
            . '<span style="display:block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:13px;background:' . $tone . ';color:#10100f;font-size:11px;font-weight:900">' . ($reached ? '✓' : str_pad((string)($index + 1), 2, '0', STR_PAD_LEFT)) . '</span></td>'
            . '<td style="padding:11px 8px"><strong style="display:block;color:' . ($current ? '#ffffff' : '#ddd6ce') . ';font-size:13px;line-height:1.3">' . gtEmailEscape($meta['label']) . '</strong>'
            . '<span style="display:block;margin-top:3px;color:#827b74;font-size:10px;line-height:1.35">' . gtEmailEscape($meta['next_message'] ?? $meta['message']) . '</span></td>'
            . '<td align="right" style="width:72px;padding:11px 12px 11px 4px"><span style="display:inline-block;color:' . $tone . ';font-size:8px;font-weight:900;letter-spacing:.08em">' . $stateLabel . '</span></td></tr></table>'
            . '</td></tr>';
    }
    if ($terminal) {
        $terminalMeta = gtOrderStatusMeta($status);
        $terminalTone = (string)$terminalMeta['color'];
        $rows .= '<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . $terminalTone . '18;border:1px solid ' . $terminalTone . '55;border-radius:18px">'
            . '<tr><td style="width:48px;padding:11px 0 11px 12px"><span style="display:block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:13px;background:' . $terminalTone . ';color:#160f10;font-size:17px;font-weight:900">' . gtEmailEscape($terminalMeta['symbol']) . '</span></td>'
            . '<td style="padding:11px 8px"><strong style="display:block;color:#fff;font-size:13px">' . gtEmailEscape($terminalMeta['label']) . '</strong><span style="display:block;margin-top:3px;color:#aaa39c;font-size:10px">' . gtEmailEscape($terminalMeta['message']) . '</span></td>'
            . '<td align="right" style="width:72px;padding:11px 12px 11px 4px"><span style="color:' . $terminalTone . ';font-size:8px;font-weight:900;letter-spacing:.08em">ACUM</span></td></tr></table></td></tr>';
    }
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' . $rows . '</table>';
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
            ? '<img src="' . gtEmailEscape($imageUrl) . '" width="72" height="72" alt="" style="display:block;width:72px;height:72px;object-fit:contain;border-radius:20px;background:#f7f2ed">'
            : '<span style="display:block;width:72px;height:72px;line-height:72px;text-align:center;border-radius:20px;background:#302d33;color:#ffb77a;font-size:21px;font-weight:900">GT</span>';
        $itemsHtml .= '<tr>'
            . '<td style="padding:14px 0;border-bottom:1px solid #39353d;width:84px;vertical-align:middle">' . $image . '</td>'
            . '<td style="padding:14px 12px;border-bottom:1px solid #39353d;vertical-align:middle">'
            . '<strong style="display:block;color:#fff8f3;font-size:14px;line-height:1.35">' . gtEmailEscape($item['product_name'] ?? '') . '</strong>'
            . '<span style="display:block;color:#9d959f;font-size:11px;margin-top:5px">' . (int)($item['quantity'] ?? 0) . ' × ' . gtEmailMoney($item['unit_price'] ?? 0, $currency) . '</span>'
            . '</td>'
            . '<td style="padding:14px 0;border-bottom:1px solid #39353d;text-align:right;vertical-align:middle;color:#fff8f3;font-size:13px;font-weight:900;white-space:nowrap">' . gtEmailMoney($item['line_total'] ?? 0, $currency) . '</td>'
            . '</tr>';
    }
    $paymentLabel = ($order['payment_method'] ?? '') === 'card' ? 'Card online' : 'Ramburs la curier';
    $subject = (string)$meta['title'] . ' · ' . (string)($order['order_number'] ?? 'G-Trots');
    $preheader = gtEmailEscape((string)$meta['message']);
    $statusColor = gtEmailEscape((string)$meta['color']);
    $statusLabel = gtEmailEscape((string)$meta['label']);
    $statusTitle = gtEmailEscape((string)$meta['title']);
    $statusMessage = gtEmailEscape((string)$meta['message']);
    $statusEyebrow = gtEmailEscape((string)$meta['eyebrow']);
    $statusSymbol = gtEmailEscape((string)$meta['symbol']);
    $nextTitle = gtEmailEscape((string)$meta['next_title']);
    $nextMessage = gtEmailEscape((string)$meta['next_message']);
    $safeTrackingUrl = gtEmailEscape($trackingUrl);
    $safeLogoUrl = gtEmailEscape($logoUrl);
    $orderNumber = gtEmailEscape($order['order_number'] ?? '');
    $createdAt = gtEmailEscape(date('d.m.Y, H:i', strtotime((string)($order['created_at'] ?? 'now'))));
    $shippingName = gtEmailEscape($order['shipping_method_name'] ?? 'Curier standard');
    $paymentText = gtEmailEscape($paymentLabel);
    $subtotal = gtEmailMoney($order['subtotal'] ?? 0, $currency);
    $shippingCost = gtEmailMoney($order['shipping_cost'] ?? 0, $currency);
    $total = gtEmailMoney($order['total'] ?? 0, $currency);
    $timeline = gtEmailStatusTimeline($status, (string)($order['payment_method'] ?? 'card'));
    $html = <<<HTML
<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@media(max-width:640px){.gt-wrap{padding:10px!important}.gt-shell{border-radius:28px!important}.gt-body{padding:22px 16px!important}.gt-title{font-size:32px!important}.gt-summary,.gt-timeline{padding:16px!important}.gt-action{display:block!important;text-align:center!important}.gt-status{display:none!important}.gt-next-icon{width:46px!important}.gt-next-copy{padding-left:10px!important}}</style></head>
<body style="margin:0;background:#09090a;color:#fff8f3;font-family:Roboto,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{$preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090a"><tr><td class="gt-wrap" style="padding:34px 16px" align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="gt-shell" style="width:100%;max-width:700px;background:#1d1b20;border:1px solid #3a363e;border-radius:38px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.45)">
<tr><td style="height:8px;background:{$statusColor}"></td></tr>
<tr><td class="gt-body" style="padding:30px 34px 34px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:58px"><img src="{$safeLogoUrl}" width="54" height="54" alt="G-Trots România" style="display:block;width:54px;height:54px;border-radius:18px"></td><td style="padding-left:12px"><strong style="display:block;color:#fff8f3;font-size:17px;line-height:1.2">G-Trots România</strong><span style="display:block;margin-top:4px;color:#9f979f;font-size:9px;font-weight:800;letter-spacing:.1em">SERVICE &amp; MAGAZIN</span></td><td class="gt-status" align="right"><span style="display:inline-block;padding:10px 14px;border:1px solid {$statusColor}55;border-radius:999px;background:{$statusColor}18;color:{$statusColor};font-size:11px;font-weight:900">●&nbsp;&nbsp;{$statusLabel}</span></td></tr></table>
<div style="padding:34px 0 24px"><span style="color:{$statusColor};font-size:10px;font-weight:900;letter-spacing:.14em">{$statusEyebrow}</span><h1 class="gt-title" style="margin:10px 0 13px;color:#fff8f3;font-size:44px;line-height:1.02;letter-spacing:-.055em">{$statusTitle}</h1><p style="margin:0;color:#b1a9b2;font-size:15px;line-height:1.65">{$greeting} {$statusMessage}</p></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid {$statusColor}55;border-radius:24px;background:{$statusColor}12"><tr><td class="gt-next-icon" style="width:64px;padding:15px 0 15px 15px"><span style="display:block;width:48px;height:48px;line-height:48px;text-align:center;border-radius:17px;background:{$statusColor};color:#151116;font-size:15px;font-weight:1000">{$statusSymbol}</span></td><td class="gt-next-copy" style="padding:15px"><span style="display:block;color:{$statusColor};font-size:8px;font-weight:900;letter-spacing:.12em">CE URMEAZĂ</span><strong style="display:block;margin-top:4px;color:#fff8f3;font-size:14px">{$nextTitle}</strong><span style="display:block;margin-top:4px;color:#9d959f;font-size:11px;line-height:1.45">{$nextMessage}</span></td></tr></table>
<div class="gt-summary" style="padding:24px;border:1px solid #403b43;border-radius:28px;background:#151318">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><span style="display:block;color:#9d959f;font-size:9px;font-weight:900;letter-spacing:.12em">REZUMAT COMANDĂ</span><strong style="display:block;margin-top:6px;color:#ffb77a;font-size:17px;overflow-wrap:anywhere">{$orderNumber}</strong></td><td align="right"><span style="display:block;color:#9d959f;font-size:9px;font-weight:900;letter-spacing:.12em">DATA</span><strong style="display:block;margin-top:6px;color:#d8d1d9;font-size:12px">{$createdAt}</strong></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">{$itemsHtml}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:17px;color:#aaa2ac;font-size:12px"><tr><td style="padding:6px 0">Subtotal</td><td align="right">{$subtotal}</td></tr><tr><td style="padding:6px 0">Livrare · {$shippingName}</td><td align="right">{$shippingCost}</td></tr><tr><td style="padding:6px 0">Plată</td><td align="right">{$paymentText}</td></tr><tr><td style="padding:19px 0 0;border-top:1px solid #403b43;color:#fff8f3;font-size:15px;font-weight:900">Total de plată</td><td align="right" style="padding:19px 0 0;border-top:1px solid #403b43;color:#ffb77a;font-size:24px;font-weight:1000">{$total}</td></tr></table>
</div>
<div class="gt-timeline" style="margin-top:20px;padding:20px;border:1px solid #403b43;border-radius:28px;background:#211f24"><span style="display:block;margin-bottom:13px;color:#a49ca6;font-size:9px;font-weight:900;letter-spacing:.12em">EVOLUȚIA COMENZII</span>{$timeline}</div>
<div style="padding:22px 0 6px;text-align:center"><a class="gt-action" href="{$safeTrackingUrl}" style="display:inline-block;padding:17px 30px;border-radius:20px;background:#ff8a00;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;box-shadow:0 13px 32px rgba(255,138,0,.25)">Urmărește comanda&nbsp;&nbsp;→</a></div>
<div style="margin-top:15px;padding:15px 17px;border:1px solid #4a4035;border-radius:20px;background:#272018;color:#a9a1a9;font-size:11px;line-height:1.55"><strong style="display:block;margin-bottom:4px;color:#fff8f3">Acces direct și securizat</strong>Butonul deschide direct comanda, fără formular. Dacă intri manual pe pagina de urmărire, folosește codul <strong style="color:#ffb77a">{$orderNumber}</strong> și adresa de e-mail din comandă.</div>
<p style="margin:25px 0 0;text-align:center;color:#756e77;font-size:10px;line-height:1.65">Ai nevoie de ajutor? Răspunde direct la acest mesaj.<br><strong style="color:#aaa2ac">G-Trots România</strong> · g-trots.ro</p>
</td></tr></table></td></tr></table></body></html>
HTML;
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
