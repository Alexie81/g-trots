<?php
// Loopback development server: actual renderer/service, isolated SQLite data.
declare(strict_types=1);
$root = dirname(__DIR__);
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
header('Cache-Control: no-store');
if ($uri === '/' || $uri === '/index.html') {
    header('Content-Type: text/html; charset=utf-8');
    $html = preg_replace('~<script\b[^>]*>.*?</script>~si', '', file_get_contents($root . '/electron-app/renderer/index.html'));
    $html = str_replace('<head>', '<head><base href="/renderer/">', $html);
    $setup = <<<'JS'
window.require = () => ({shell:{openExternal:url=>window.open(url,'_blank')},clipboard:{writeText:text=>navigator.clipboard.writeText(text)}});
window.AUTH = {getToken:()=> 'local-demo', getUser:()=>({display_name:'Administrator demo',role:'admin'}),hasPermission:()=>true};
window.SHOP_API_URL = '/local-api';
window.BUSINESS_UI = {showToast:(message,type)=>{const el=document.createElement('div');el.textContent=message;el.style.cssText='position:fixed;right:24px;bottom:24px;max-width:500px;padding:20px;background:'+(type==='error'?'#842c42':'#155b48')+';color:white;z-index:99999;border-radius:14px';document.body.append(el);setTimeout(()=>el.remove(),7000);}};
window.switchTab = id => {document.querySelectorAll('.tab-panel').forEach(el=>el.classList.toggle('active',el.id==='tab-'+id));document.querySelectorAll('.nav-btn').forEach(el=>el.classList.toggle('active',el.dataset.tab===id));window.dispatchEvent(new CustomEvent('tab-change',{detail:id}));};
document.querySelectorAll('#startup-loader,#auth-overlay').forEach(el=>el.remove());
document.querySelectorAll('[data-module-nav]').forEach(el=>el.hidden=el.dataset.moduleNav!=='shop');
document.querySelectorAll('[data-module-select]').forEach(el=>{const active=el.dataset.moduleSelect==='shop';el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
document.body.dataset.activeModule='shop';document.body.dataset.activeTab='shop-fixed-assets';
document.getElementById('active-module-label').textContent='SHOP · LOCAL / DATE DEMO';
document.getElementById('active-module-chip').classList.add('shop');
document.getElementById('topbar-account-name').textContent='Administrator demo';
document.getElementById('topbar-account-role').textContent='Previzualizare locală';
JS;
    echo str_replace('</body>', '<script>' . $setup . '</script><script src="js/shop-api.js"></script><script src="js/shop-commerce.js"></script><script>switchTab("shop-fixed-assets")</script></body>', $html);
    return;
}
if ($uri === '/local-api/api-v2.php') {
    header('Content-Type: application/json; charset=utf-8');
    require_once $root . '/shop-api/nir-domain.php';
    require_once $root . '/shop-api/nir-service.php';
    require_once $root . '/shop-api/fixed-assets-service.php';
    $folder = $root . '/reports/fixed-assets-local';
    if (!is_dir($folder)) mkdir($folder, 0777, true);
    $fresh = !is_file($folder . '/preview.sqlite');
    $db = new PDO('sqlite:' . $folder . '/preview.sqlite', null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    GtrotsFixedAssets::ensureSchema($db);
    $user = ['display_name'=>'Administrator demo'];
    if ($fresh) {
        $doc = GtrotsFixedAssets::create($db, ['document'=>['document_date'=>'2026-09-01','document_type'=>'factura','series'=>'DEMO','document_number'=>'001'], 'lines'=>[['product_name'=>'Stație de lucru pentru diagnoză','quantity'=>10,'unit_price'=>3500,'vat_rate'=>21]]], $user);
        foreach ([['2026-09-15',-2,'Defecțiune ireparabilă a plăcii de bază.'],['2026-10-15',-1,'Defectarea sursei și a componentelor interne.'],['2026-11-05',-3,'Uzură avansată; echipamente scoase definitiv din funcțiune.']] as [$date,$qty,$reason]) GtrotsFixedAssets::dispose($db,$doc['lines'][0]['id'],['disposal_date'=>$date,'quantity'=>$qty,'reason'=>$reason],$user);
    }
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = (string)($_GET['id'] ?? '');
    try {
        $result = match ($_GET['action'] ?? '') {
            'listFixedAssets'=>GtrotsFixedAssets::list($db,$_GET),
            'getFixedAsset'=>GtrotsFixedAssets::get($db,$id),
            'getFixedAssetDocument'=>GtrotsFixedAssets::getDocument($db,$id),
            'createFixedAssetDocument'=>GtrotsFixedAssets::create($db,$body,$user),
            'updateFixedAssetDocument'=>GtrotsFixedAssets::updateDocument($db,$id,$body,$user),
            'deleteFixedAssetDocument'=>GtrotsFixedAssets::deleteDocument($db,$id,$body),
            'deleteFixedAsset'=>GtrotsFixedAssets::deleteAsset($db,$id,$body),
            'disposeFixedAsset'=>GtrotsFixedAssets::dispose($db,$id,$body,$user),
            'updateFixedAssetDisposal'=>GtrotsFixedAssets::updateDisposal($db,$id,$body),
            'deleteFixedAssetDisposal'=>GtrotsFixedAssets::deleteDisposal($db,$id,$body),
            'addFixedAssetFiles'=>GtrotsFixedAssets::addFiles($db,$id,$body,$user),
            'deleteFixedAssetFile'=>GtrotsFixedAssets::deleteFile($db,$id,$body),
            'downloadFixedAssetDocument'=>GtrotsFixedAssets::download($db,$id,(string)($_GET['file_id'] ?? '')),
            'exportFixedAssets'=>GtrotsFixedAssets::export($db,$_GET,(string)($_GET['format'] ?? 'pdf')),
            default=>throw new RuntimeException('Acțiune indisponibilă în previzualizare.'),
        };
        echo json_encode($result,JSON_UNESCAPED_UNICODE);
    } catch (Throwable $error) { http_response_code($error instanceof ShopNirHttpException ? $error->status : 400);echo json_encode(['error'=>$error->getMessage()]); }
    return;
}
foreach (['/renderer/'=>'renderer/','/assets/'=>'assets/'] as $prefix=>$directory) {
    if (!str_starts_with($uri,$prefix)) continue;
    $base = realpath($root . '/electron-app/' . $directory);
    $file = realpath($base . '/' . substr(rawurldecode($uri),strlen($prefix)));
    if ($file && str_starts_with($file,$base . DIRECTORY_SEPARATOR) && is_file($file)) {
        $mime = ['css'=>'text/css','js'=>'application/javascript','png'=>'image/png','svg'=>'image/svg+xml','woff2'=>'font/woff2','woff'=>'font/woff','ttf'=>'font/ttf'];
        header('Content-Type: ' . ($mime[strtolower(pathinfo($file,PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
        readfile($file);return;
    }
}
http_response_code(404);
