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
        'return_requested' => [
            'label' => 'Retur solicitat',
            'title' => 'Retur solicitat',
            'message' => 'Solicitarea de retur pentru această comandă este în curs de verificare.',
            'color' => '#f472b6',
            'eyebrow' => 'RETUR ÎN VERIFICARE',
            'symbol' => '↶',
            'next_title' => 'Verificăm solicitarea',
            'next_message' => 'Acest status apare numai când returul este activ.',
        ],
        'return_refused' => [
            'label' => 'Retur refuzat',
            'title' => 'Solicitarea de retur a fost refuzată',
            'message' => 'Solicitarea de retur a fost verificată și nu a fost aprobată. Pentru clarificări, răspunde direct la acest e-mail.',
            'color' => '#fb7185',
            'eyebrow' => 'RETUR REFUZAT',
            'symbol' => '×',
            'next_title' => 'Ai nevoie de clarificări?',
            'next_message' => 'Acest status apare numai când este activ.',
        ],
        'return_confirmed' => [
            'label' => 'Retur confirmat',
            'title' => 'Retur confirmat',
            'message' => 'Returul a fost confirmat și urmează procesarea rambursării.',
            'color' => '#2dd4bf',
            'eyebrow' => 'RETUR CONFIRMAT',
            'symbol' => '✓',
            'next_title' => 'Urmează rambursarea',
            'next_message' => 'Acest status apare numai când returul este activ.',
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

function gtOrderCustomerDisplayName(array $order): string {
    $isCompany = (string)($order['customer_type'] ?? 'individual') === 'company';
    $companyName = trim((string)($order['company_name'] ?? ''));
    $contactName = trim((string)($order['customer_contact_name'] ?? $order['customer_name'] ?? ''));
    return $isCompany && $companyName !== '' ? $companyName : $contactName;
}

function gtOrderCustomerContactName(array $order): string {
    return trim((string)($order['customer_contact_name'] ?? $order['customer_name'] ?? ''));
}

function gtEmailTrackingUrl(array $order, array $config): string {
    $base = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    return $base . '/urmarire-comanda?token=' . rawurlencode((string)($order['tracking_token'] ?? ''));
}

function gtEmailCancellationUrl(array $order, array $config): string {
    return gtEmailTrackingUrl($order, $config) . '&anulare=1';
}

function gtEmailReturnUrl(array $order, array $config): string {
    return gtEmailTrackingUrl($order, $config) . '&retur=1';
}

function gtEmailStatusTimeline(string $status, string $paymentMethod = 'card'): string {
    $flow = ['new', 'confirmed', 'processing', 'shipped', 'completed'];
    $currentIndex = array_search($status, $flow, true);
    $terminal = in_array($status, ['refunded', 'cancelled'], true);
    $returnState = in_array($status, ['return_requested', 'return_refused', 'return_confirmed', 'refunded'], true);
    if ($currentIndex === false) $currentIndex = $returnState ? count($flow) - 1 : 0;
    $rows = '';
    foreach ($flow as $index => $value) {
        $meta = gtOrderStatusMeta($value);
        $reached = $returnState || (!$terminal && $index <= $currentIndex);
        $current = !$terminal && !$returnState && $index === $currentIndex;
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
    if ($terminal || $returnState) {
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
    $contactName = gtOrderCustomerContactName($order);
    $firstName = trim(explode(' ', $contactName, 2)[0] ?? '');
    $greeting = $firstName !== '' ? 'Salut, ' . gtEmailEscape($firstName) . '!' : 'Salut!';
    $isProductPromotion = (string)($order['promotion_scope'] ?? '') === 'product';
    $itemsHtml = '';
    foreach (($order['items'] ?? []) as $item) {
        if (!is_array($item)) continue;
        $imageUrl = trim((string)($item['image_url'] ?? ''));
        $image = $imageUrl !== ''
            ? '<img src="' . gtEmailEscape($imageUrl) . '" width="72" height="72" alt="" style="display:block;width:72px;height:72px;object-fit:contain;border-radius:20px;background:#f7f2ed">'
            : '<span style="display:block;width:72px;height:72px;line-height:72px;text-align:center;border-radius:20px;background:#302d33;color:#ffb77a;font-size:21px;font-weight:900">GT</span>';
        $hasItemDiscount = $isProductPromotion && (float)($item['discount_total'] ?? 0) > 0;
        $unitPriceHtml = $hasItemDiscount
            ? '<span style="text-decoration:line-through;color:#766f78">' . gtEmailMoney($item['unit_price'] ?? 0, $currency) . '</span> <strong style="color:#6ee7b7">' . gtEmailMoney($item['discounted_unit_price'] ?? 0, $currency) . '</strong>'
            : gtEmailMoney($item['unit_price'] ?? 0, $currency);
        $linePriceHtml = $hasItemDiscount
            ? '<span style="display:block;text-decoration:line-through;color:#766f78;font-size:10px;font-weight:600">' . gtEmailMoney($item['line_total'] ?? 0, $currency) . '</span><strong style="display:block;margin-top:3px;color:#6ee7b7">' . gtEmailMoney($item['discounted_line_total'] ?? 0, $currency) . '</strong>'
            : gtEmailMoney($item['line_total'] ?? 0, $currency);
        $itemsHtml .= '<tr>'
            . '<td style="padding:14px 0;border-bottom:1px solid #39353d;width:84px;vertical-align:middle">' . $image . '</td>'
            . '<td style="padding:14px 12px;border-bottom:1px solid #39353d;vertical-align:middle">'
            . '<strong style="display:block;color:#fff8f3;font-size:14px;line-height:1.35">' . gtEmailEscape($item['product_name'] ?? '') . '</strong>'
            . '<span style="display:block;color:#9d959f;font-size:11px;margin-top:5px">' . (int)($item['quantity'] ?? 0) . ' × ' . $unitPriceHtml . '</span>'
            . '</td>'
            . '<td style="padding:14px 0;border-bottom:1px solid #39353d;text-align:right;vertical-align:middle;color:#fff8f3;font-size:13px;font-weight:900;white-space:nowrap">' . $linePriceHtml . '</td>'
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
    $discountValue = (float)($order['discount_total'] ?? 0);
    $displaySubtotal = (float)($order['subtotal'] ?? 0) - ($isProductPromotion ? $discountValue : 0);
    $subtotal = gtEmailMoney(max(0, $displaySubtotal), $currency);
    $hasVat = !empty($order['vat_payer']);
    $subtotalLabel = ($isProductPromotion && $discountValue > 0 ? 'Subtotal după reducerile pe produse' : 'Subtotal') . ($hasVat ? ' (TVA inclus)' : '');
    $vatTotalLabel = $hasVat ? ' (TVA inclus)' : '';
    $discountRow = $discountValue > 0 && !$isProductPromotion
        ? '<tr><td style="padding:6px 0;color:#6ee7b7">Reducere' . (!empty($order['promotion_code']) ? ' · ' . gtEmailEscape((string)$order['promotion_code']) : '') . '</td><td align="right" style="color:#6ee7b7">−' . gtEmailMoney($discountValue, $currency) . '</td></tr>'
        : '';
    $shippingCost = gtEmailMoney($order['shipping_cost'] ?? 0, $currency);
    $total = gtEmailMoney($order['total'] ?? 0, $currency);
    $customerType = ($order['customer_type'] ?? 'individual') === 'company' ? 'PJ' : 'PF';
    $customerDataRows = '<tr><td style="padding:5px 0;color:#8f8790">Tip client</td><td align="right" style="color:#fff8f3;font-weight:900">' . $customerType . '</td></tr>';
    if ($customerType === 'PJ') {
        $customerDataRows .= '<tr><td style="padding:5px 0;color:#8f8790">Denumire firmă</td><td align="right" style="color:#6ee7b7;font-weight:900">' . gtEmailEscape(gtOrderCustomerDisplayName($order)) . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#8f8790">Persoană de contact</td><td align="right" style="color:#d8d1d9">' . gtEmailEscape($contactName) . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#8f8790">CUI / CIF</td><td align="right" style="color:#d8d1d9">' . gtEmailEscape($order['company_cui'] ?? '') . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#8f8790">Registrul Comerțului</td><td align="right" style="color:#d8d1d9">' . gtEmailEscape($order['company_registration_number'] ?? '') . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#8f8790">Sediu social</td><td align="right" style="color:#d8d1d9">' . gtEmailEscape($order['company_address'] ?? '') . '</td></tr>';
    } else {
        $customerDataRows .= '<tr><td style="padding:5px 0;color:#8f8790">Nume</td><td align="right" style="color:#d8d1d9">' . gtEmailEscape($contactName) . '</td></tr>';
    }
    $customerDataRows .= '<tr><td style="padding:5px 0;color:#8f8790">Telefon</td><td align="right" style="color:#d8d1d9">' . gtEmailEscape($order['customer_phone'] ?? '') . '</td></tr>';
    $deliveryAddress = trim((string)($order['address'] ?? '') . ', ' . (string)($order['city'] ?? '') . ', ' . (string)($order['county'] ?? ''), ', ');
    $customerDataRows .= '<tr><td style="padding:9px 0 5px;border-top:1px solid #39353d;color:#8f8790">Livrare</td><td align="right" style="padding:9px 0 5px;border-top:1px solid #39353d;color:#d8d1d9">' . gtEmailEscape($deliveryAddress) . '</td></tr>';
    $timeline = gtEmailStatusTimeline($status, (string)($order['payment_method'] ?? 'card'));
    $customerActionFooter = '';
    if (in_array($status, ['new', 'confirmed', 'processing'], true)) {
        $safeCancellationUrl = gtEmailEscape(gtEmailCancellationUrl($order, $config));
        $customerActionFooter = '<p style="margin:17px 0 0;text-align:center;color:#716a72;font-size:9px;line-height:1.55">Nu mai dorești comanda? <a href="' . $safeCancellationUrl . '" style="color:#fb7185;text-decoration:underline;font-weight:800">Solicită anularea</a></p>';
    } elseif ($status === 'completed') {
        $safeReturnUrl = gtEmailEscape(gtEmailReturnUrl($order, $config));
        $customerActionFooter = '<p style="margin:17px 0 0;text-align:center;color:#716a72;font-size:9px;line-height:1.55">Ai nevoie să returnezi produsele? <a href="' . $safeReturnUrl . '" style="color:#f472b6;text-decoration:underline;font-weight:800">Solicită returul</a></p>';
    }
    $html = <<<HTML
<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@media(max-width:640px){.gt-wrap{padding:10px!important}.gt-shell{border-radius:28px!important}.gt-body{padding:22px 16px!important}.gt-title{font-size:32px!important}.gt-summary,.gt-timeline{padding:16px!important}.gt-action{display:block!important;text-align:center!important}.gt-status{display:none!important}.gt-next-icon{width:46px!important}.gt-next-copy{padding-left:10px!important}}</style></head>
<body style="margin:0;background:transparent;color:#fff8f3;font-family:Roboto,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{$preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:transparent"><tr><td class="gt-wrap" style="padding:34px 16px" align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="gt-shell" style="width:100%;max-width:700px;background:#1d1b20;border:1px solid #3a363e;border-radius:38px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.45)">
<tr><td style="height:8px;background:{$statusColor}"></td></tr>
<tr><td class="gt-body" style="padding:30px 34px 34px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:58px"><img src="{$safeLogoUrl}" width="54" height="54" alt="G-Trots România" style="display:block;width:54px;height:54px;border-radius:18px"></td><td style="padding-left:12px"><strong style="display:block;color:#fff8f3;font-size:17px;line-height:1.2">G-Trots România</strong><span style="display:block;margin-top:4px;color:#9f979f;font-size:9px;font-weight:800;letter-spacing:.1em">SERVICE &amp; MAGAZIN</span></td><td class="gt-status" align="right"><span style="display:inline-block;padding:10px 14px;border:1px solid {$statusColor}55;border-radius:999px;background:{$statusColor}18;color:{$statusColor};font-size:11px;font-weight:900">●&nbsp;&nbsp;{$statusLabel}</span></td></tr></table>
<div style="padding:34px 0 24px"><span style="color:{$statusColor};font-size:10px;font-weight:900;letter-spacing:.14em">{$statusEyebrow}</span><h1 class="gt-title" style="margin:10px 0 13px;color:#fff8f3;font-size:44px;line-height:1.02;letter-spacing:-.055em">{$statusTitle}</h1><p style="margin:0;color:#b1a9b2;font-size:15px;line-height:1.65">{$greeting} {$statusMessage}</p></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid {$statusColor}55;border-radius:24px;background:{$statusColor}12"><tr><td class="gt-next-icon" style="width:64px;padding:15px 0 15px 15px"><span style="display:block;width:48px;height:48px;line-height:48px;text-align:center;border-radius:17px;background:{$statusColor};color:#151116;font-size:15px;font-weight:1000">{$statusSymbol}</span></td><td class="gt-next-copy" style="padding:15px"><span style="display:block;color:{$statusColor};font-size:8px;font-weight:900;letter-spacing:.12em">CE URMEAZĂ</span><strong style="display:block;margin-top:4px;color:#fff8f3;font-size:14px">{$nextTitle}</strong><span style="display:block;margin-top:4px;color:#9d959f;font-size:11px;line-height:1.45">{$nextMessage}</span></td></tr></table>
<div class="gt-summary" style="padding:24px;border:1px solid #403b43;border-radius:28px;background:#151318">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><span style="display:block;color:#9d959f;font-size:9px;font-weight:900;letter-spacing:.12em">REZUMAT COMANDĂ</span><strong style="display:block;margin-top:6px;color:#ffb77a;font-size:17px;overflow-wrap:anywhere">{$orderNumber}</strong></td><td align="right"><span style="display:block;color:#9d959f;font-size:9px;font-weight:900;letter-spacing:.12em">DATA</span><strong style="display:block;margin-top:6px;color:#d8d1d9;font-size:12px">{$createdAt}</strong></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">{$itemsHtml}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:17px;color:#aaa2ac;font-size:12px"><tr><td style="padding:6px 0">{$subtotalLabel}</td><td align="right">{$subtotal}</td></tr>{$discountRow}<tr><td style="padding:6px 0">Livrare · {$shippingName}</td><td align="right">{$shippingCost}</td></tr><tr><td style="padding:6px 0">Plată</td><td align="right">{$paymentText}</td></tr><tr><td style="padding:19px 0 0;border-top:1px solid #403b43;color:#fff8f3;font-size:15px;font-weight:900">Total de plată{$vatTotalLabel}</td><td align="right" style="padding:19px 0 0;border-top:1px solid #403b43;color:#ffb77a;font-size:24px;font-weight:1000">{$total}</td></tr></table>
</div>
<div style="margin-top:20px;padding:20px;border:1px solid #403b43;border-radius:24px;background:#1a181d"><span style="display:block;margin-bottom:10px;color:#a49ca6;font-size:9px;font-weight:900;letter-spacing:.12em">DATE CLIENT ȘI FACTURARE</span><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:11px">{$customerDataRows}</table></div>
<div class="gt-timeline" style="margin-top:20px;padding:20px;border:1px solid #403b43;border-radius:28px;background:#211f24"><span style="display:block;margin-bottom:13px;color:#a49ca6;font-size:9px;font-weight:900;letter-spacing:.12em">EVOLUȚIA COMENZII</span>{$timeline}</div>
<div style="padding:22px 0 6px;text-align:center"><a class="gt-action" href="{$safeTrackingUrl}" style="display:inline-block;padding:17px 30px;border-radius:20px;background:#ff8a00;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;box-shadow:0 13px 32px rgba(255,138,0,.25)">Urmărește comanda&nbsp;&nbsp;→</a></div>
<div style="margin-top:15px;padding:15px 17px;border:1px solid #4a4035;border-radius:20px;background:#272018;color:#a9a1a9;font-size:11px;line-height:1.55"><strong style="display:block;margin-bottom:4px;color:#fff8f3">Acces direct și securizat</strong>Butonul deschide direct comanda, fără formular. Dacă intri manual pe pagina de urmărire, folosește codul <strong style="color:#ffb77a">{$orderNumber}</strong> și adresa de e-mail din comandă.</div>
{$customerActionFooter}
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

function gtSmtpSend(array $config, string $recipient, string $subject, string $html, array $attachments = []): void {
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
        ];
        if ($attachments) {
            $boundary = '=_gtrots_' . bin2hex(random_bytes(18));
            $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
            $parts = ['--' . $boundary, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', rtrim(chunk_split(base64_encode($html), 76, "\r\n"))];
            foreach ($attachments as $attachment) {
                $fileName = preg_replace('/[^A-Za-z0-9._-]+/', '-', basename((string)($attachment['file_name'] ?? 'document.pdf'))) ?: 'document.pdf';
                $mimeType = trim((string)($attachment['mime_type'] ?? 'application/octet-stream')) ?: 'application/octet-stream';
                $parts[] = '--' . $boundary;
                $parts[] = 'Content-Type: ' . $mimeType . '; name="' . $fileName . '"';
                $parts[] = 'Content-Transfer-Encoding: base64';
                $parts[] = 'Content-Disposition: attachment; filename="' . $fileName . '"';
                $parts[] = '';
                $parts[] = rtrim(chunk_split(base64_encode((string)($attachment['content'] ?? '')), 76, "\r\n"));
            }
            $parts[] = '--' . $boundary . '--';
            $message = implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $parts);
        } else {
            $headers[] = 'Content-Type: text/html; charset=UTF-8';
            $headers[] = 'Content-Transfer-Encoding: base64';
            $message = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($html), 76, "\r\n");
        }
        $message = preg_replace('/(?m)^\./', '..', $message) ?? $message;
        fwrite($socket, $message . "\r\n.\r\n");
        gtSmtpCommand($socket, '', [250]);
        gtSmtpCommand($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

function gtSendPasswordResetEmail(array $customer, array $config, string $token): void {
    $recipient = mb_strtolower(trim((string)($customer['email'] ?? '')));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        throw new RuntimeException('Datele pentru resetarea parolei nu sunt valide.');
    }
    $base = rtrim((string)($config['website_base_url'] ?? 'https://g-trots.ro'), '/');
    $resetUrl = $base . '/resetare-parola.html?token=' . rawurlencode($token) . '&email=' . rawurlencode($recipient);
    $safeUrl = gtEmailEscape($resetUrl);
    $safeLogo = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://g-trots.ro/assets/logo.png'));
    $firstName = trim(explode(' ', trim((string)($customer['full_name'] ?? '')), 2)[0] ?? '');
    $greeting = $firstName === '' ? 'Salut!' : 'Salut, ' . gtEmailEscape($firstName) . '!';
    $html = <<<HTML
<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:transparent;color:#fff8f3;font-family:Roboto,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Link securizat pentru resetarea parolei contului tău G-Trots.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:transparent"><tr><td style="padding:34px 16px" align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#1d1b20;border:1px solid #3a363e;border-radius:34px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.45)">
<tr><td style="height:8px;background:linear-gradient(90deg,#ff7900,#ffb14d)"></td></tr>
<tr><td style="padding:30px 32px 34px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:58px"><img src="{$safeLogo}" width="54" height="54" alt="G-Trots România" style="display:block;width:54px;height:54px;border-radius:18px"></td><td style="padding-left:12px"><strong style="display:block;color:#fff8f3;font-size:17px">G-Trots România</strong><span style="display:block;margin-top:4px;color:#9f979f;font-size:9px;font-weight:800;letter-spacing:.1em">SECURITATEA CONTULUI</span></td></tr></table>
<div style="padding:32px 0 20px"><span style="color:#ff9a2f;font-size:10px;font-weight:900;letter-spacing:.14em">RESETARE PAROLĂ</span><h1 style="margin:10px 0 13px;color:#fff8f3;font-size:40px;line-height:1.04;letter-spacing:-.05em">Alege o parolă nouă.</h1><p style="margin:0;color:#b1a9b2;font-size:15px;line-height:1.65">{$greeting} Am primit o solicitare de resetare a parolei pentru contul asociat acestei adrese.</p></div>
<div style="padding:20px;border:1px solid #4a4035;border-radius:24px;background:#272018"><strong style="display:block;color:#fff8f3;font-size:14px">Link unic, valabil 30 de minute</strong><p style="margin:7px 0 0;color:#aaa2ac;font-size:12px;line-height:1.6">Butonul poate fi folosit o singură dată. După schimbarea parolei, sesiunile existente vor fi închise automat.</p></div>
<div style="padding:24px 0 8px;text-align:center"><a href="{$safeUrl}" style="display:inline-block;padding:17px 28px;border-radius:18px;background:#ff8500;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;box-shadow:0 13px 32px rgba(255,133,0,.25)">Resetează parola&nbsp;&nbsp;→</a></div>
<p style="margin:18px 0 0;color:#817981;font-size:11px;line-height:1.65">Dacă nu ai solicitat resetarea, ignoră acest e-mail. Parola ta actuală rămâne neschimbată.</p>
<p style="margin:24px 0 0;text-align:center;color:#756e77;font-size:10px;line-height:1.65"><strong style="color:#aaa2ac">G-Trots România</strong> · g-trots.ro</p>
</td></tr></table></td></tr></table></body></html>
HTML;
    gtSmtpSend($config, $recipient, 'Resetează parola contului tău G-Trots', $html);
}

function gtSendOrderStatusEmail(array $order, array $config, string $status): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if (in_array($status, ['return_requested', 'return_confirmed'], true)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Statusul este intern și nu se comunică clientului.'];
    }
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

function gtSendOrderCancellationEmail(array $order, array $config, array $details = []): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
    }
    $number = gtEmailEscape((string)($order['order_number'] ?? ''));
    $reason = gtEmailEscape((string)($order['customer_cancellation_reason'] ?? 'Nespecificat'));
    $trackingUrl = gtEmailEscape(gtEmailTrackingUrl($order, $config));
    $logoUrl = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://g-trots.ro/assets/logo.png'));
    $isPaidCard = (string)($order['payment_method'] ?? '') === 'card' && (string)($order['refund_status'] ?? '') === 'pending';
    $refundMessage = $isPaidCard
        ? 'Rambursarea va fi efectuată în cel mult <strong style="color:#fff8f3">15 zile calendaristice</strong>, în aceeași metodă de plată confirmată în momentul achiziției.'
        : 'Comanda cu plata ramburs a fost oprită și nu mai ai nimic de achitat pentru ea.';
    $invoiceAction = (string)($details['invoice_action'] ?? $order['cancellation_invoice_action'] ?? 'none');
    if ($invoiceAction === 'deleted_latest_unsent') {
        $fiscalMessage = 'Factura netrimisă în SPV a fost eliminată în siguranță, iar numărul eliberat poate fi folosit de următoarea factură.';
    } elseif ($invoiceAction === 'return_invoice_created') {
        $returnNumber = gtEmailEscape((string)($details['return_invoice']['display_number'] ?? ''));
        $fiscalMessage = 'A fost emisă factura de retur' . ($returnNumber !== '' ? ' <strong style="color:#ffb77a">' . $returnNumber . '</strong>' : '') . '. Documentul îți este trimis separat pe e-mail.';
    } else {
        $fiscalMessage = 'Nu fusese emisă nicio factură pentru această comandă, așadar nu va fi creat niciun document fiscal.';
    }
    $html = <<<HTML
<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:transparent;color:#fff8f3;font-family:Roboto,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Anularea comenzii {$number} a fost confirmată.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:transparent"><tr><td style="padding:30px 14px" align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:650px;overflow:hidden;border:1px solid #49363b;border-radius:34px;background:#1d1b20">
<tr><td style="height:7px;background:#fb7185"></td></tr><tr><td style="padding:28px 30px 32px">
<table role="presentation" width="100%"><tr><td style="width:58px"><img src="{$logoUrl}" width="52" height="52" alt="G-Trots România" style="display:block;border-radius:17px"></td><td><strong style="display:block;color:#fff8f3;font-size:17px">G-Trots România</strong><span style="display:block;margin-top:4px;color:#9f979f;font-size:9px;font-weight:800;letter-spacing:.1em">CONFIRMARE ANULARE</span></td></tr></table>
<div style="padding:30px 0 19px"><span style="color:#fb7185;font-size:10px;font-weight:900;letter-spacing:.13em">COMANDĂ ANULATĂ</span><h1 style="margin:9px 0 12px;font-size:38px;line-height:1.04;letter-spacing:-.045em">Am oprit comanda.</h1><p style="margin:0;color:#b5adb6;font-size:14px;line-height:1.65">Comanda <strong style="color:#ffb77a">{$number}</strong> a fost anulată și nu va mai fi pregătită sau predată curierului.</p></div>
<div style="padding:17px;border:1px solid #52383f;border-radius:20px;background:#28191d"><span style="display:block;color:#fb7185;font-size:9px;font-weight:900;letter-spacing:.1em">MOTIVUL ANULĂRII</span><p style="margin:7px 0 0;color:#f1e8ed;font-size:13px;line-height:1.55">{$reason}</p></div>
<div style="margin-top:13px;padding:17px;border:1px solid #403b43;border-radius:20px;background:#171519"><strong style="display:block;color:#fff8f3;font-size:13px">Plată și rambursare</strong><p style="margin:7px 0 0;color:#aaa2ac;font-size:12px;line-height:1.6">{$refundMessage}</p></div>
<div style="margin-top:13px;padding:17px;border:1px solid #403b43;border-radius:20px;background:#171519"><strong style="display:block;color:#fff8f3;font-size:13px">Documente fiscale</strong><p style="margin:7px 0 0;color:#aaa2ac;font-size:12px;line-height:1.6">{$fiscalMessage}</p></div>
<div style="padding:23px 0 4px;text-align:center"><a href="{$trackingUrl}" style="display:inline-block;padding:15px 24px;border-radius:18px;background:#fb7185;color:#211217;text-decoration:none;font-size:13px;font-weight:900">Vezi comanda anulată&nbsp;&nbsp;→</a></div>
<p style="margin:22px 0 0;text-align:center;color:#756e77;font-size:10px;line-height:1.6">Ai nevoie de ajutor? Răspunde direct la acest mesaj.<br><strong style="color:#aaa2ac">G-Trots România</strong> · g-trots.ro</p>
</td></tr></table></td></tr></table></body></html>
HTML;
    try {
        gtSmtpSend($config, $recipient, 'Comanda ' . (string)($order['order_number'] ?? '') . ' a fost anulată', $html);
        return ['sent' => true, 'recipient' => $recipient, 'tracking_url' => gtEmailTrackingUrl($order, $config)];
    } catch (Throwable $error) {
        error_log('[G-Trots cancellation email] ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}

function gtSendOrderReturnRequestEmail(array $order, array $config): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
    }
    $orderNumber = gtEmailEscape((string)($order['order_number'] ?? ''));
    $contactName = gtOrderCustomerContactName($order);
    $firstName = trim(explode(' ', $contactName, 2)[0] ?? '');
    $greeting = $firstName !== '' ? 'Salut, ' . gtEmailEscape($firstName) . '!' : 'Salut!';
    $reason = gtEmailEscape((string)($order['return_reason'] ?? 'Nespecificat'));
    $holder = gtEmailEscape((string)($order['return_bank_account_holder'] ?? ''));
    $iban = gtEmailEscape((string)($order['return_bank_iban'] ?? ''));
    $currency = (string)($order['currency'] ?? 'RON');
    $returnCost = gtEmailMoney($order['return_shipping_cost'] ?? 0, $currency);
    $refundAmount = gtEmailMoney($order['return_refund_amount'] ?? 0, $currency);
    $trackingUrl = gtEmailEscape(gtEmailTrackingUrl($order, $config));
    $logoUrl = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://g-trots.ro/assets/logo.png'));
    $html = <<<HTML
<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:transparent;color:#fff8f3;font-family:Roboto,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Am primit solicitarea de retur pentru comanda {$orderNumber}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:transparent"><tr><td style="padding:30px 14px" align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:650px;overflow:hidden;border:1px solid #50394b;border-radius:34px;background:#1d1b20">
<tr><td style="height:7px;background:#f472b6"></td></tr><tr><td style="padding:28px 30px 32px">
<table role="presentation" width="100%"><tr><td style="width:58px"><img src="{$logoUrl}" width="52" height="52" alt="G-Trots România" style="display:block;border-radius:17px"></td><td><strong style="display:block;color:#fff8f3;font-size:17px">G-Trots România</strong><span style="display:block;margin-top:4px;color:#9f979f;font-size:9px;font-weight:800;letter-spacing:.1em">RETUR ÎN VERIFICARE</span></td></tr></table>
<div style="padding:30px 0 19px"><span style="color:#f472b6;font-size:10px;font-weight:900;letter-spacing:.13em">SOLICITARE PRIMITĂ</span><h1 style="margin:9px 0 12px;font-size:38px;line-height:1.04;letter-spacing:-.045em">Am primit solicitarea ta de retur.</h1><p style="margin:0;color:#b5adb6;font-size:14px;line-height:1.65">{$greeting} Cererea pentru comanda <strong style="color:#ffb77a">{$orderNumber}</strong> a fost înregistrată și urmează să fie verificată de echipa noastră.</p></div>
<div style="padding:17px;border:1px solid #56384f;border-radius:20px;background:#281923"><span style="display:block;color:#f472b6;font-size:9px;font-weight:900;letter-spacing:.1em">MOTIVUL RETURULUI</span><p style="margin:7px 0 0;color:#f1e8ed;font-size:13px;line-height:1.55">{$reason}</p></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:13px;border:1px solid #403b43;border-radius:20px;background:#171519;color:#aaa2ac;font-size:12px"><tr><td style="padding:17px 17px 6px">Titular cont</td><td align="right" style="padding:17px 17px 6px;color:#fff8f3;font-weight:800">{$holder}</td></tr><tr><td style="padding:6px 17px">IBAN</td><td align="right" style="padding:6px 17px;color:#d8d1d9;font-weight:700;overflow-wrap:anywhere">{$iban}</td></tr><tr><td style="padding:6px 17px">Cost retur curier</td><td align="right" style="padding:6px 17px;color:#fb7185;font-weight:800">−{$returnCost}</td></tr><tr><td style="padding:14px 17px 17px;border-top:1px solid #403b43;color:#fff8f3;font-weight:900">Sumă estimată de restituit</td><td align="right" style="padding:14px 17px 17px;border-top:1px solid #403b43;color:#6ee7b7;font-size:18px;font-weight:1000">{$refundAmount}</td></tr></table>
<div style="margin-top:13px;padding:17px;border:1px solid #403b43;border-radius:20px;background:#211f24"><strong style="display:block;color:#fff8f3;font-size:13px">Ce urmează?</strong><p style="margin:7px 0 0;color:#aaa2ac;font-size:12px;line-height:1.6">Verificăm solicitarea și îți comunicăm pașii de predare a produselor. Suma de mai sus este estimativă și include scăderea costului de retur prin curier configurat pentru comanda ta.</p></div>
<div style="padding:23px 0 4px;text-align:center"><a href="{$trackingUrl}" style="display:inline-block;padding:15px 24px;border-radius:18px;background:#f472b6;color:#24131e;text-decoration:none;font-size:13px;font-weight:900">Vezi solicitarea&nbsp;&nbsp;→</a></div>
<p style="margin:22px 0 0;text-align:center;color:#756e77;font-size:10px;line-height:1.6">Ai nevoie de ajutor? Răspunde direct la acest mesaj.<br><strong style="color:#aaa2ac">G-Trots România</strong> · g-trots.ro</p>
</td></tr></table></td></tr></table></body></html>
HTML;
    try {
        gtSmtpSend($config, $recipient, 'Am primit solicitarea de retur · ' . (string)($order['order_number'] ?? ''), $html);
        return ['sent' => true, 'recipient' => $recipient, 'tracking_url' => gtEmailTrackingUrl($order, $config)];
    } catch (Throwable $error) {
        error_log('[G-Trots return request email] ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}

function gtSendOrderReturnConfirmedEmail(array $order, array $config): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
    }
    $orderNumber = gtEmailEscape((string)($order['order_number'] ?? ''));
    $contactName = gtOrderCustomerContactName($order);
    $firstName = trim(explode(' ', $contactName, 2)[0] ?? '');
    $greeting = $firstName !== '' ? 'Salut, ' . gtEmailEscape($firstName) . '!' : 'Salut!';
    $refundAmount = gtEmailMoney($order['return_refund_amount'] ?? 0, (string)($order['currency'] ?? 'RON'));
    $trackingUrl = gtEmailEscape(gtEmailTrackingUrl($order, $config));
    $logoUrl = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://g-trots.ro/assets/logo.png'));
    $fiscalMessage = !empty($order['return_invoice_id'])
        ? 'Factura de retur este emisă automat și îți este trimisă separat pe e-mail, în format PDF.'
        : 'Comanda nu avea o factură pozitivă emisă, așadar confirmarea returului nu generează acum niciun document fiscal.';
    $html = <<<HTML
<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:transparent;color:#fff8f3;font-family:Roboto,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Returul comenzii {$orderNumber} a fost confirmat.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:transparent"><tr><td style="padding:30px 14px" align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:650px;overflow:hidden;border:1px solid #315955;border-radius:34px;background:#1d1b20">
<tr><td style="height:7px;background:#2dd4bf"></td></tr><tr><td style="padding:28px 30px 32px">
<table role="presentation" width="100%"><tr><td style="width:58px"><img src="{$logoUrl}" width="52" height="52" alt="G-Trots România" style="display:block;border-radius:17px"></td><td><strong style="display:block;color:#fff8f3;font-size:17px">G-Trots România</strong><span style="display:block;margin-top:4px;color:#9f979f;font-size:9px;font-weight:800;letter-spacing:.1em">CONFIRMARE RETUR</span></td></tr></table>
<div style="padding:30px 0 19px"><span style="color:#5eead4;font-size:10px;font-weight:900;letter-spacing:.13em">RETUR CONFIRMAT</span><h1 style="margin:9px 0 12px;font-size:38px;line-height:1.04;letter-spacing:-.045em">Returul tău a fost aprobat.</h1><p style="margin:0;color:#b5adb6;font-size:14px;line-height:1.65">{$greeting} Am confirmat returul pentru comanda <strong style="color:#ffb77a">{$orderNumber}</strong>. Echipa noastră continuă verificarea produselor și procesarea restituirii.</p></div>
<div style="padding:18px;border:1px solid #315955;border-radius:20px;background:#172421"><span style="display:block;color:#5eead4;font-size:9px;font-weight:900;letter-spacing:.1em">SUMĂ ESTIMATĂ DE RESTITUIT</span><strong style="display:block;margin-top:8px;color:#a7f3d0;font-size:24px">{$refundAmount}</strong><p style="margin:7px 0 0;color:#aaa2ac;font-size:12px;line-height:1.6">Valoarea finală este procesată după verificarea returului. Acest mesaj confirmă aprobarea returului, nu finalizarea rambursării.</p></div>
<div style="margin-top:13px;padding:17px;border:1px solid #403b43;border-radius:20px;background:#171519"><strong style="display:block;color:#fff8f3;font-size:13px">Documente fiscale</strong><p style="margin:7px 0 0;color:#aaa2ac;font-size:12px;line-height:1.6">{$fiscalMessage}</p></div>
<div style="padding:23px 0 4px;text-align:center"><a href="{$trackingUrl}" style="display:inline-block;padding:15px 24px;border-radius:18px;background:#2dd4bf;color:#10201e;text-decoration:none;font-size:13px;font-weight:900">Vezi comanda&nbsp;&nbsp;→</a></div>
<p style="margin:22px 0 0;text-align:center;color:#756e77;font-size:10px;line-height:1.6">Ai nevoie de ajutor? Răspunde direct la acest mesaj.<br><strong style="color:#aaa2ac">G-Trots România</strong> · g-trots.ro</p>
</td></tr></table></td></tr></table></body></html>
HTML;
    try {
        gtSmtpSend($config, $recipient, 'Retur confirmat · ' . (string)($order['order_number'] ?? ''), $html);
        return ['sent' => true, 'recipient' => $recipient, 'tracking_url' => gtEmailTrackingUrl($order, $config)];
    } catch (Throwable $error) {
        error_log('[G-Trots return confirmation email] ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}
