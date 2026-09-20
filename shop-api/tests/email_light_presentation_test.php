<?php
declare(strict_types=1);
require_once __DIR__ . '/../order-emails.php';
require_once __DIR__ . '/../order-admin-notifications.php';
require_once __DIR__ . '/../newsletter.php';
require_once __DIR__ . '/../invoice-service.php';
function emailDesignAssert(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$order=['order_number'=>'GT-TEST','customer_email'=>'client@example.test','customer_name'=>'Ana & Test','created_at'=>'2026-09-20 12:00:00','payment_method'=>'cash_on_delivery','total'=>149,'subtotal'=>129,'shipping_cost'=>20,'currency'=>'RON','items'=>[['product_name'=>'Produs <test>','quantity'=>1,'unit_price'=>129,'line_total'=>129]],'return_policy_type'=>'b2c_withdrawal','withdrawal_statement'=>'Mă retrag din contractul GT-TEST.','withdrawal_submitted_at'=>'2026-09-20 12:35:40','return_items'=>[['product_name'=>'Produs','requested_quantity'=>2,'accepted_quantity'=>1,'refused_quantity'=>1,'decision_status'=>'partial','decision_reason'=>'Motiv exact.']]];
$config=['website_base_url'=>'https://g-trots.ro'];
$all=[];
foreach(array_keys(gtOrderStatuses()) as $status) $all[]=gtBuildOrderEmail($order,$config,$status);
$all[]=gtBuildOrderCancellationEmail($order,$config);
$all[]=gtBuildOrderReturnRequestEmail($order,$config);
$all[]=gtBuildOrderReturnConfirmedEmail($order,$config);
$all[]=gtBuildPasswordResetEmail(['email'=>'client@example.test'],$config,str_repeat('a',64));
foreach(['new_order_confirmed','cancelled_by_customer','return_requested_by_customer'] as $event) $all[]=gtBuildAdminOrderNotificationEmail($order,$config,$event);
$all[]=shopNewsletterProductEmail($config,[],['name'=>'Produs','price'=>129]);
foreach(['paid','unpaid','return'] as $status) $all[]=GtrotsInvoiceService::buildEmail(['series'=>'GT','invoice_number'=>'1','currency'=>'RON','total'=>149,'document_status'=>$status],$config);
foreach($all as $i=>$email){
    $html=$email['html'];
    emailDesignAssert(str_contains($html,'data-gt-email="light-v1"'),"Missing shared light presentation $i");
    emailDesignAssert(str_contains($html,'name="color-scheme" content="light"')&&!str_contains($html,'content="light dark"'),"Wrong email scheme $i");
    emailDesignAssert(str_contains($html,'@media(max-width:600px)'),"Missing mobile styles $i");
    emailDesignAssert(!preg_match('/background:#(?:1d1b20|151318|211f24|0b0a0a)/i',$html),"Dark email surface $i");
    emailDesignAssert(gtEmailLightDocument($html)===$html,"Presentation must be idempotent $i");
}
$confirmed=gtBuildOrderEmail($order,$config,'confirmed')['html'];
emailDesignAssert(str_contains($confirmed,'Vei achita produsele la livrare.')&&!str_contains($confirmed,'plata cu cardul a fost efectuată'),'COD confirmation must not claim payment received');
emailDesignAssert(str_contains($confirmed,'Produs &lt;test&gt;'),'Product HTML must remain escaped');
$withdrawal=gtBuildOrderReturnRequestEmail($order,$config)['html'];
emailDesignAssert(str_contains($withdrawal,'Mă retrag din contractul GT-TEST.')&&str_contains($withdrawal,'20.09.2026, 12:35:40'),'Preserve withdrawal evidence');
$partial=gtBuildOrderReturnConfirmedEmail($order,$config)['html'];
emailDesignAssert(str_contains($partial,'APROBAT PARȚIAL')&&str_contains($partial,'Motiv exact.'),'Preserve partial decisions');
$return=GtrotsInvoiceService::buildEmail(['series'=>'GT','invoice_number'=>'1','currency'=>'RON','total'=>-129,'document_status'=>'return'],$config)['html'];
emailDesignAssert(!str_contains($return,'corectează integral')&&str_contains($return,'Document atașat'),'Return document must not claim a full correction for a partial return');
echo 'email_light_presentation_test: OK ('.count($all)." render variants)\n";
