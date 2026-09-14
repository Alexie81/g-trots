<?php
declare(strict_types=1);

$orderId = strtolower(trim((string)($_GET['order'] ?? '')));
if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/', $orderId)) {
    http_response_code(404);
    $orderId = '';
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header("Content-Security-Policy: default-src 'none'; img-src https://g-trots.ro data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");

$appUrl = $orderId !== '' ? 'gtrots://order/' . rawurlencode($orderId) : '';
$safeAppUrl = htmlspecialchars($appUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
?>
<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0a090b">
  <title>Deschide comanda în G-Trots</title>
  <style>
    *{box-sizing:border-box}html,body{min-height:100%;margin:0}body{display:grid;place-items:center;padding:22px;background:radial-gradient(circle at 50% 0,rgba(255,132,0,.19),transparent 34%),#0a090b;color:#fff8f3;font-family:Inter,Roboto,"Segoe UI",Arial,sans-serif}.card{width:min(560px,100%);overflow:hidden;border:1px solid #3c373d;border-radius:32px;background:linear-gradient(145deg,#211f23,#171519);box-shadow:0 32px 90px rgba(0,0,0,.55)}.bar{height:7px;background:linear-gradient(90deg,#ff7900,#ffad43)}.body{padding:30px}.brand{display:flex;align-items:center;gap:12px}.brand img{width:52px;height:52px;border-radius:17px}.brand strong{display:block;font-size:17px}.brand small{display:block;margin-top:4px;color:#978f98;font-size:9px;font-weight:900;letter-spacing:.11em}.orb{display:grid;place-items:center;width:64px;height:64px;margin:34px 0 22px;border:1px solid rgba(255,138,0,.35);border-radius:22px;background:rgba(255,138,0,.12);color:#ff9d3f;font-size:28px;box-shadow:0 0 34px rgba(255,126,0,.12)}h1{margin:0;color:#fff;font-size:clamp(30px,8vw,43px);line-height:1.03;letter-spacing:-.045em}p{margin:13px 0 0;color:#b4acb5;font-size:14px;line-height:1.65}.button{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:62px;margin-top:25px;padding:0 15px 0 21px;border:0;border-radius:19px;background:linear-gradient(100deg,#ff7900,#ff9d25);color:#fff;text-decoration:none;font-size:14px;font-weight:900;box-shadow:0 14px 32px rgba(255,122,0,.22)}.button span{display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:rgba(255,255,255,.18);font-size:18px}.status{margin-top:16px;padding:13px 15px;border:1px solid #3b373d;border-radius:17px;background:#18161a;color:#8e878f;font-size:11px;line-height:1.55}.fallback{margin-top:18px;text-align:center;color:#777078;font-size:10px;line-height:1.6}.fallback a{color:#ffad68}.error{color:#fb9aaa}@media(max-width:520px){body{padding:10px}.card{border-radius:26px}.body{padding:22px 17px}.orb{margin-top:27px}}
  </style>
</head>
<body>
  <main class="card">
    <div class="bar"></div>
    <section class="body">
      <div class="brand"><img src="https://g-trots.ro/assets/logo.png" alt="G-Trots"><span><strong>G-Trots</strong><small>APLICAȚIA DE ADMINISTRARE</small></span></div>
      <?php if ($orderId !== ''): ?>
        <div class="orb" aria-hidden="true">↗</div>
        <h1>Deschidem comanda.</h1>
        <p>Telefonul sau calculatorul va porni aplicația G-Trots și va afișa direct fișa comenzii. Dacă aplicația este deja deschisă, fereastra ei va fi adusă în față.</p>
        <a class="button" id="open-app" href="<?= $safeAppUrl ?>">Deschide aplicația G-Trots <span aria-hidden="true">›</span></a>
        <div class="status" id="status">Încercăm să deschidem automat aplicația…</div>
        <div class="fallback">Nu este instalată pe acest dispozitiv? <a href="https://g-trots.ro/download-app/GTrotsApp.apk">Descarcă aplicația mobilă</a> sau <a href="https://github.com/Alexie81/g-trots/releases/latest">aplicația pentru calculator</a>.</div>
      <?php else: ?>
        <div class="orb error" aria-hidden="true">!</div>
        <h1>Linkul nu este valid.</h1>
        <p>Deschide din nou butonul primit în e-mailul original al comenzii.</p>
      <?php endif; ?>
    </section>
  </main>
  <?php if ($orderId !== ''): ?>
  <script>
    (() => {
      const appUrl = <?= json_encode($appUrl, JSON_UNESCAPED_SLASHES) ?>;
      const status = document.getElementById('status');
      let leftPage = false;
      const markOpened = () => { leftPage = true; if (status) status.textContent = 'Aplicația a fost solicitată. Poți închide această pagină.'; };
      document.addEventListener('visibilitychange', () => { if (document.hidden) markOpened(); });
      window.addEventListener('blur', markOpened);
      document.getElementById('open-app')?.addEventListener('click', () => {
        if (status) status.textContent = 'Deschidem aplicația și comanda…';
      });
      setTimeout(() => {
        if (leftPage) return;
        window.location.href = appUrl;
        setTimeout(() => {
          if (!leftPage && status) status.textContent = 'Dacă aplicația nu s-a deschis, apasă butonul de mai sus.';
        }, 1600);
      }, 180);
    })();
  </script>
  <?php endif; ?>
</body>
</html>
