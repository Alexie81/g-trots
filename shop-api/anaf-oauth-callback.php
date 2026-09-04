<?php
declare(strict_types=1);

date_default_timezone_set('Europe/Bucharest');
ini_set('display_errors', '0');
ini_set('log_errors', '1');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https://g-trots.ro data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");

require_once __DIR__ . '/spv-runtime.php';
require_once __DIR__ . '/spv-service.php';

$success = false;
$title = 'Conectarea SPV nu a fost finalizată';
$message = 'Revino în aplicație și încearcă din nou.';
try {
    if (!empty($_GET['error'])) {
        throw new RuntimeException('ANAF a anulat sau a refuzat autorizarea.');
    }
    $config = gtrotsSpvRuntimeConfig();
    $db = gtrotsSpvRuntimeDb($config);
    GtrotsSpvService::completeOAuth($db, $config, (string)($_GET['code'] ?? ''), (string)($_GET['state'] ?? ''));
    $success = true;
    $title = 'SPV a fost conectat';
    $message = 'Tokenurile sunt criptate pe server. Poți reveni în aplicația G-Trots de pe telefon sau desktop.';
} catch (Throwable $error) {
    error_log('[G-Trots SPV OAuth callback] ' . $error->getMessage());
    $message = $error instanceof InvalidArgumentException ? $error->getMessage() : 'Conectarea nu a putut fi verificată. Revino în aplicație și reia procesul.';
}
$accent = $success ? '#35d07f' : '#fb7185';
?><!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#121115;color:#fff8f2;font-family:Inter,Segoe UI,Arial,sans-serif">
<main style="width:min(560px,calc(100% - 32px));box-sizing:border-box;border:1px solid #39363d;border-radius:30px;padding:34px;background:#1c1a1f;box-shadow:0 24px 80px rgba(0,0,0,.35)">
<img src="https://g-trots.ro/assets/logo.png" width="58" height="58" alt="G-Trots" style="display:block;border-radius:18px">
<div style="width:52px;height:52px;display:grid;place-items:center;margin-top:28px;border-radius:18px;background:<?= $accent ?>18;color:<?= $accent ?>;font-size:28px;font-weight:900"><?= $success ? '✓' : '!' ?></div>
<p style="margin:20px 0 7px;color:<?= $accent ?>;font-size:11px;font-weight:900;letter-spacing:.12em">RO e-FACTURA · ANAF</p>
<h1 style="margin:0;font-size:34px;line-height:1.1"><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></h1>
<p style="margin:15px 0 0;color:#b7afb8;font-size:15px;line-height:1.65"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p>
<button type="button" onclick="window.close()" style="width:100%;margin-top:28px;border:0;border-radius:17px;padding:15px 18px;background:<?= $accent ?>;color:#151216;font-weight:900;cursor:pointer">Închide și revino în aplicație</button>
</main></body></html>

