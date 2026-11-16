<?php
declare(strict_types=1);
require_once __DIR__ . '/../nir-domain.php';
require_once __DIR__ . '/../nir-service.php';
if (!getenv('GT_TEST_MYSQL_DSN')) { fwrite(STDOUT, "SKIP: isolated MySQL fixture required\n"); exit(0); }
$db = new PDO(getenv('GT_TEST_MYSQL_DSN'), getenv('GT_TEST_MYSQL_USER'), getenv('GT_TEST_MYSQL_PASS'), [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
if (!str_starts_with((string)$db->query('SELECT DATABASE()')->fetchColumn(), 'codex_nir_withdraw_')) throw new RuntimeException('Isolated test database required.');
function uuidV4(): string { $h=bin2hex(random_bytes(16));return substr($h,0,8).'-'.substr($h,8,4).'-4'.substr($h,13,3).'-a'.substr($h,17,3).'-'.substr($h,20,12); }
function check(bool $ok,string $message):void { if(!$ok)throw new RuntimeException($message);echo "PASS: $message\n"; }
function insertRow(PDO $db,string $table,array $data):void { $db->prepare('INSERT INTO '.$table.' (`'.implode('`,`',array_keys($data)).'`) VALUES ('.implode(',',array_fill(0,count($data),'?')).')')->execute(array_values($data)); }
function scalar(PDO $db,string $sql,array $args=[]):mixed { $q=$db->prepare($sql);$q->execute($args);return $q->fetchColumn(); }
$user=['role'=>'admin','display_name'=>'Test'];$warehouse=uuidV4();$supplier=uuidV4();
insertRow($db,'shop_warehouses',['id'=>$warehouse,'code'=>'TEST-'.substr($warehouse,0,8),'name'=>'Test']);
insertRow($db,'shop_suppliers',['id'=>$supplier,'name'=>'Supplier Test']);
$db->exec('DELETE FROM shop_nir_settings');insertRow($db,'shop_nir_settings',['id'=>1,'default_warehouse_id'=>$warehouse,'next_sequence'=>1]);
function receipt(PDO $db,string $product,float $quantity,float $cost):array {
 global $user,$supplier,$warehouse;
 $draft=shopNirCreateDraft($db,['supplier_id'=>$supplier,'warehouse_id'=>$warehouse,'reception_location'=>'Test','supplier_invoice_series'=>'T','supplier_invoice_number'=>substr(uuidV4(),0,8),'supplier_invoice_date'=>'2026-10-06','nir_date'=>'2026-10-06','nir_time'=>'10:00','reception_date'=>'2026-10-06','reception_time'=>'10:00','currency'=>'RON','exchange_rate'=>1,'lines'=>[['product_id'=>$product,'supplier_product_name'=>'Test product '.$product,'supplier_product_code'=>$product,'invoiced_quantity'=>$quantity,'received_quantity'=>$quantity,'accepted_quantity'=>$quantity,'conversion_factor'=>1,'unit_price'=>$cost,'vat_rate'=>0,'purchase_unit'=>'buc','stock_unit'=>'buc','resolution_status'=>'manual']]],$user);
 return shopNirConfirm($db,$draft['id'],['row_version'=>$draft['row_version'],'idempotency_key'=>uuidV4()],$user);
}
function scenario(PDO $db,float $quantity,float $sold):array {
 global $warehouse;
 $p=uuidV4();insertRow($db,'shop_products',['id'=>$p,'name'=>'Test product','slug'=>$p,'sku'=>$p,'is_accounting_stock_tracked'=>1]);
 $doc=receipt($db,$p,$quantity,100);$invoice=uuidV4();$line=uuidV4();$movement=uuidV4();
 insertRow($db,'shop_invoices',['id'=>$invoice,'order_id'=>uuidV4(),'series'=>'GT','invoice_number'=>substr($invoice,0,8),'theme'=>'orange','issue_date'=>'2026-10-06','payload_json'=>'{"immutable":true}','spv_status'=>'sent']);
 $db->beginTransaction();$fifo=shopNirConsumeFifoAvailable($db,$p,$warehouse,$sold,'SALES_INVOICE',$invoice,$line,'invoice:'.$invoice.':'.$line,false);
 $db->prepare('UPDATE shop_products SET accounting_stock_quantity=accounting_stock_quantity-? WHERE id=?')->execute([$sold,$p]);
 insertRow($db,'shop_inventory_movements',['id'=>$movement,'product_id'=>$p,'warehouse_id'=>$warehouse,'sales_invoice_id'=>$invoice,'sales_invoice_line_id'=>$line,'movement_type'=>'sale','quantity_delta'=>-$sold,'quantity_after'=>$quantity-$sold,'accounting_quantity_delta'=>-$sold,'accounting_quantity_after'=>$quantity-$sold,'fifo_status'=>'allocated','fifo_quantity_allocated'=>$sold,'fifo_quantity_pending'=>0,'inventory_unit_cost_ron'=>100,'inventory_cost_total_ron'=>$fifo['total_cost_ron']]);$db->commit();
 return [$p,$doc,$invoice,$movement];
}
function reverseReceipt(PDO $db,array $doc,float $q):array { global $user;return shopNirReverse($db,$doc['id'],['row_version'=>$doc['row_version'],'reason'=>'Supplier replacement','supplier_invoice_series'=>'S','supplier_invoice_number'=>substr(uuidV4(),0,8),'supplier_invoice_date'=>'2026-10-07','lines'=>[['line_id'=>$doc['lines'][0]['id'],'quantity'=>$q]]],$user); }
function stock(PDO $db,string $p):float { return (float)scalar($db,'SELECT accounting_stock_quantity FROM shop_products WHERE id=?',[$p]); }

[$p,$doc,$inv,$movement]=scenario($db,1,1);$before=scalar($db,'SELECT payload_json FROM shop_invoices WHERE id=?',[$inv]);
$result=reverseReceipt($db,$doc,1);
check(stock($db,$p)===-1.0,'Full supplier reversal after sale allows negative accounting stock');
check(scalar($db,'SELECT fifo_status FROM shop_inventory_movements WHERE id=?',[$movement])==='pending','Sale stays present with pending cost');
check((float)$result['reversal']['grand_total_ron']===-100.0,'Negative supplier document has original value');
check(scalar($db,'SELECT reception_date FROM shop_inventory_movements WHERE nir_document_id=?',[$result['reversal']['id']])==='2026-10-07','Reversal movement uses the supplier document date');
$replacement=receipt($db,$p,1,120);
check(stock($db,$p)===0.0,'Later replacement receipt balances negative stock');
check((float)scalar($db,'SELECT inventory_cost_total_ron FROM shop_inventory_movements WHERE id=?',[$movement])===120.0,'Sale cost is reallocated to replacement receipt');
check(scalar($db,'SELECT fifo_status FROM shop_inventory_movements WHERE id=?',[$movement])==='allocated','Replacement completes FIFO');
check(scalar($db,'SELECT payload_json FROM shop_invoices WHERE id=?',[$inv])===$before && scalar($db,'SELECT spv_status FROM shop_invoices WHERE id=?',[$inv])==='sent','Fiscal invoice and SPV state unchanged');
check((float)scalar($db,'SELECT SUM(remaining_quantity) FROM shop_inventory_cost_layers WHERE product_id=? AND is_reversed=0',[$p])===0.0,'No phantom remaining stock');
try{reverseReceipt($db,$doc,1);throw new RuntimeException('Stale reversal accepted');}catch(ShopNirHttpException $e){check($e->status===409,'Repeated stale reversal cannot deduct stock twice');}

[$p,$doc,$inv,$movement]=scenario($db,5,4);$r=reverseReceipt($db,$doc,3);
check(stock($db,$p)===-2.0,'Partial reversal can exceed the unsold quantity');
check((float)scalar($db,'SELECT fifo_quantity_allocated FROM shop_inventory_movements WHERE id=?',[$movement])===2.0,'Only uncovered allocations are released');
receipt($db,$p,3,130);check(stock($db,$p)===1.0,'Partial replacement preserves one unsold unit');
check((float)scalar($db,'SELECT inventory_cost_total_ron FROM shop_inventory_movements WHERE id=?',[$movement])===460.0,'Partial replacement uses old and new costs exactly once');

[$p,$doc,$inv,$movement]=scenario($db,1,1);
$draft=shopNirReopenConfirmed($db,$doc['id'],['row_version'=>$doc['row_version']],$user);
check($draft['status']==='draft' && stock($db,$p)===-1.0,'Existing correction workflow can recalculate a consumed NIR');
check((int)scalar($db,'SELECT COUNT(*) FROM shop_inventory_movements WHERE id=?',[$movement])===1,'Correction does not remove sale');
$confirmed=shopNirConfirm($db,$draft['id'],['row_version'=>$draft['row_version'],'idempotency_key'=>uuidV4()],$user);
check(stock($db,$p)===0.0 && scalar($db,'SELECT fifo_status FROM shop_inventory_movements WHERE id=?',[$movement])==='allocated','Reconfirm rebuilds receipt and allocations without double deduction');
$deleted=shopNirDeleteDrafts($db,$user,$confirmed['id']);
check($deleted['deleted']===0 && stock($db,$p)===0.0,'Confirmed NIR cannot be deleted even after sales');
check((int)scalar($db,'SELECT COUNT(*) FROM shop_nir_documents WHERE id=?',[$confirmed['id']])===1,'Confirmed NIR stays in register');
check((int)scalar($db,'SELECT COUNT(*) FROM shop_inventory_movements WHERE id=?',[$movement])===1,'Refused deletion leaves sale unchanged');
$unsoldProduct=uuidV4();insertRow($db,'shop_products',['id'=>$unsoldProduct,'name'=>'Unsold test product','slug'=>$unsoldProduct,'sku'=>$unsoldProduct,'is_accounting_stock_tracked'=>1]);
$unsoldDoc=receipt($db,$unsoldProduct,1,100);
$unsoldDelete=shopNirDeleteDrafts($db,$user,$unsoldDoc['id']);
check($unsoldDelete['deleted']===0 && stock($db,$unsoldProduct)===1.0,'Confirmed NIR cannot be deleted even without sales');
$emptyDraft=shopNirCreateDraft($db,[],$user);
$draftDelete=shopNirDeleteDrafts($db,$user,$emptyDraft['id']);
check($draftDelete['deleted']===1 && scalar($db,'SELECT id FROM shop_nir_documents WHERE id=?',[$emptyDraft['id']])===false,'Original draft deletion remains available');
$batchDelete=shopNirDeleteDrafts($db,$user);
check((int)scalar($db,'SELECT COUNT(*) FROM shop_nir_documents WHERE id IN (?,?)',[$confirmed['id'],$unsoldDoc['id']])===2,'Bulk draft deletion preserves confirmed NIRs');
check((int)scalar($db,'SELECT COUNT(*) FROM shop_inventory_layer_consumptions c LEFT JOIN shop_inventory_cost_layers l ON l.id=c.inventory_cost_layer_id WHERE l.id IS NULL')===0,'No orphaned FIFO history');
check((int)scalar($db,"SELECT COUNT(*) FROM shop_domain_audit WHERE action_type='NIR_FIFO_ALLOCATION_RELEASED'")>=3,'Released allocations remain audited');
[$p,$doc,$inv,$movement]=scenario($db,2.5,2);reverseReceipt($db,$doc,1.25);
check(stock($db,$p)===-0.75,'Fractional withdrawals preserve stock precision below zero');
receipt($db,$p,1.25,120);
check(stock($db,$p)===0.5 && (float)scalar($db,'SELECT inventory_cost_total_ron FROM shop_inventory_movements WHERE id=?',[$movement])===215.0,'Fractional replacement allocates only the missing cost');
[$p,$doc,$inv,$movement]=scenario($db,1,1);reverseReceipt($db,$doc,1);
insertRow($db,'shop_inventory_movements',['id'=>uuidV4(),'product_id'=>$p,'movement_type'=>'RETURN_IN','quantity_delta'=>1,'quantity_after'=>0,'accounting_quantity_delta'=>1,'accounting_quantity_after'=>0,'reversal_of_movement_id'=>$movement]);
$db->prepare('UPDATE shop_products SET accounting_stock_quantity=accounting_stock_quantity+1 WHERE id=?')->execute([$p]);
receipt($db,$p,1,120);
check(stock($db,$p)===1.0 && scalar($db,'SELECT fifo_status FROM shop_inventory_movements WHERE id=?',[$movement])==='returned','Returned sale is not allocated again on replacement receipt');
check((float)scalar($db,'SELECT SUM(remaining_quantity) FROM shop_inventory_cost_layers WHERE product_id=? AND is_reversed=0',[$p])===1.0,'Returned quantity remains available rather than being consumed twice');
[$p,$doc,$inv,$movement]=scenario($db,1,1);
$db->exec("CREATE TRIGGER codex_fail_withdraw BEFORE INSERT ON shop_domain_audit FOR EACH ROW BEGIN IF NEW.action_type = 'NIR_FIFO_ALLOCATION_RELEASED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Simulated audit failure'; END IF; END");
try { reverseReceipt($db,$doc,1);throw new RuntimeException('Simulated failure was ignored'); }
catch(PDOException $error) { check(str_contains($error->getMessage(),'Simulated audit failure'),'Unexpected error propagates'); }
finally { $db->exec('DROP TRIGGER codex_fail_withdraw'); }
check(stock($db,$p)===0.0 && scalar($db,'SELECT fifo_status FROM shop_inventory_movements WHERE id=?',[$movement])==='allocated','Transaction failure rolls back stock and allocation changes');
check((int)scalar($db,'SELECT COUNT(*) FROM shop_nir_documents WHERE reversal_of_id=?',[$doc['id']])===0,'Failed withdrawal leaves no partial storno document');
echo "All supplier NIR withdrawal integration scenarios passed.\n";
