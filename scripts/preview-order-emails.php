<?php
declare(strict_types=1);
// CLI-only, synthetic fixtures. No config.local.php, database or SMTP is loaded.
if (PHP_SAPI !== 'cli') exit(1);
require_once __DIR__ . '/../shop-api/order-emails.php';
require_once __DIR__ . '/../shop-api/order-admin-notifications.php';
require_once __DIR__ . '/../shop-api/newsletter.php';
require_once __DIR__ . '/../shop-api/invoice-service.php';
$target = __DIR__ . '/../reports/order-experience-20260920';
if (!is_dir($target . '/emails')) mkdir($target . '/emails', 0777, true);
$config = ['website_base_url'=>'http://127.0.0.1:4174','order_email_logo_url'=>'http://127.0.0.1:4174/assets/logo.png'];
$order = [
    'order_number'=>'GT-DEMO-2026', 'tracking_token'=>str_repeat('0',64), 'created_at'=>'2026-09-20 12:30:00',
    'status'=>'confirmed','payment_method'=>'card','payment_status'=>'paid','currency'=>'RON',
    'customer_type'=>'individual','customer_name'=>'Andrei Exemplu','customer_email'=>'client@example.test','customer_phone'=>'07xx xxx xxx',
    'address'=>'Strada Exemplu nr. 12','city'=>'București','county'=>'București','postal_code'=>'000000',
    'shipping_method_name'=>'Curier standard','subtotal'=>398,'shipping_cost'=>25,'discount_total'=>0,'total'=>423,'vat_payer'=>false,
    'items'=>[['order_item_id'=>'demo-1','product_name'=>'Motor pentru trotinetă electrică','product_slug'=>'motor-demo','product_sku'=>'DEMO-MOTOR',
        'quantity'=>2,'unit_price'=>199,'line_total'=>398,'image_url'=>'http://127.0.0.1:4174/assets/products/motor-dualhub-x2-2000w.png']],
    'customer_cancellation_reason'=>'Am ales un alt model compatibil.','cancellation_reason'=>'Am ales un alt model compatibil.',
    'refund_status'=>'pending','refund_due_at'=>'2026-10-05','return_reason'=>'Doresc să returnez un produs neutilizat.',
    'return_bank_account_holder'=>'Andrei Exemplu','return_bank_iban'=>'RO49AAAA1B31007593840000','return_bank_iban_masked'=>'RO49 •••• •••• •••• •••• 0000',
    'return_shipping_cost'=>25,'return_refund_amount'=>199,'return_policy_type'=>'b2c_withdrawal','return_requested_at'=>'2026-09-20 14:10:00',
    'withdrawal_statement'=>'Mă retrag din contractul aferent comenzii GT-DEMO-2026.','withdrawal_submitted_at'=>'2026-09-20 14:10:00',
    'return_invoice_id'=>'demo-return','can_cancel'=>false,'can_request_return'=>false,
];
$partial = ['product_name'=>$order['items'][0]['product_name'],'product_sku'=>'DEMO-MOTOR','requested_quantity'=>2,'decision_status'=>'partial','accepted_quantity'=>1,'refused_quantity'=>1,'decision_reason'=>'O bucată prezintă urme de utilizare.'];
$company = array_replace($order,['customer_type'=>'company','company_name'=>'Companie Demonstrativă S.R.L.','company_cui'=>'RO00000000','company_registration_number'=>'J00/0000/2026','company_address'=>'Strada Exemplu nr. 20, București','customer_display_name'=>'Companie Demonstrativă S.R.L.']);
$emails=[];
$add=static function(string $id,string $label,array $mail) use (&$emails,$target): void {
    if (!isset($mail['html'])) throw new RuntimeException('Missing email: '.$id);
    file_put_contents($target.'/emails/'.$id.'.html',$mail['html']);
    $emails[]=['id'=>$id,'label'=>$label,'subject'=>$mail['subject'],'path'=>'emails/'.$id.'.html'];
};
foreach(gtOrderStatuses() as $status=>$meta) {
    if(in_array($status,['return_requested','return_confirmed'],true)) continue;
    $fixture=array_replace($order,['status'=>$status]);
    if(in_array($status,['return_refused','refunded'],true)) $fixture['return_items']=[$partial];
    $add('client-'.$status,$meta['title'],gtBuildOrderEmail($fixture,$config,$status));
}
$add('client-new-cod','Comandă primită · ramburs',gtBuildOrderEmail(array_replace($order,['payment_method'=>'cash_on_delivery','payment_status'=>'unpaid']),$config,'new'));
$add('client-confirmed-cod','Confirmată · ramburs',gtBuildOrderEmail(array_replace($order,['payment_method'=>'cash_on_delivery','payment_status'=>'unpaid']),$config,'confirmed'));
$add('client-company','Comandă persoană juridică',gtBuildOrderEmail($company,$config,'confirmed'));
$add('client-promotion','Comandă cu reducere',gtBuildOrderEmail(array_replace($order,['discount_total'=>39.8,'promotion_code'=>'DEMO10','total'=>383.2]),$config,'confirmed'));
foreach(['none'=>'Fără factură','deleted_latest_unsent'=>'Factură netrimisă eliminată','return_invoice_created'=>'Factură de retur emisă'] as $action=>$label) {
    $add('cancel-'.$action,'Anulare · '.$label,gtBuildOrderCancellationEmail($order,$config,['invoice_action'=>$action,'return_invoice'=>['display_number'=>'GT 000043']]));
}
$add('cancel-cod','Anulare · plata ramburs',gtBuildOrderCancellationEmail(array_replace($order,['payment_method'=>'cash_on_delivery','refund_status'=>'none']),$config));
$add('return-request-pf','Retragere persoană fizică · confirmare',gtBuildOrderReturnRequestEmail($order,$config));
$add('return-request-pj','Retur comercial persoană juridică',gtBuildOrderReturnRequestEmail(array_replace($company,['return_policy_type'=>'b2b_commercial','withdrawal_statement'=>'']),$config));
$add('return-approved','Retur aprobat integral',gtBuildOrderReturnConfirmedEmail(array_replace($order,['return_refund_amount'=>398,'return_items'=>[array_replace($partial,['decision_status'=>'accepted','accepted_quantity'=>2,'refused_quantity'=>0,'decision_reason'=>''])]]),$config));
$add('return-partial','Retur aprobat parțial',gtBuildOrderReturnConfirmedEmail(array_replace($order,['return_items'=>[$partial]]),$config));
$add('return-no-invoice','Retur fără factură inițială',gtBuildOrderReturnConfirmedEmail(array_replace($order,['return_invoice_id'=>'']),$config));
foreach(['issued'=>'Factură emisă','paid'=>'Factură achitată','return'=>'Factură de retur'] as $status=>$label) {
    $add('invoice-'.$status,$label,GtrotsInvoiceService::buildEmail(['series'=>'GT','invoice_number'=>'000042','invoice_type'=>$status==='return'?'return':'standard','document_status'=>$status,'status'=>$status,'customer_name'=>'Andrei Exemplu','currency'=>'RON','total'=>$status==='return'?-199:423,'order_number'=>'GT-DEMO-2026','issue_date'=>'2026-09-20'],$config));
}
foreach(['new_order_confirmed'=>'Comandă nouă','cancelled_by_customer'=>'Anulare client','return_requested_by_customer'=>'Retur solicitat'] as $event=>$label) $add('internal-'.$event,'Intern · '.$label,gtBuildAdminOrderNotificationEmail($order,$config,$event));
$add('internal-cod','Intern · comandă ramburs',gtBuildAdminOrderNotificationEmail(array_replace($company,['payment_method'=>'cash_on_delivery','payment_status'=>'unpaid']),$config,'new_order_confirmed'));
$add('password-reset','Resetarea parolei',gtBuildPasswordResetEmail(['email'=>'client@example.test','full_name'=>'Andrei Exemplu'],$config,str_repeat('a',64)));
$add('newsletter','Produs nou · newsletter',shopNewsletterProductEmail($config,['full_name'=>'Andrei Exemplu','unsubscribe_token'=>str_repeat('b',64)],['name'=>'Motor pentru trotinetă electrică','slug'=>'motor-demo','price'=>199,'short_description'=>'Putere constantă pentru drumurile de zi cu zi. Verifică modelul și compatibilitatea înainte de comandă.','images'=>[['url'=>$order['items'][0]['image_url']]]]));
file_put_contents($target.'/fixtures.json',json_encode(['order'=>$order,'company'=>$company,'emails'=>$emails],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
echo count($emails)." email previews generated. No messages sent.\n";
