const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gt-nir-withdraw-')));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_details, done) => done({ cancel: true }));
  const win = new BrowserWindow({ show: false, width: 1366, height: 900,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code);
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  await run(`(() => {
    window.confirm=()=>true;window.alert=()=>{};
    document.getElementById('startup-loader').style.display='none';document.getElementById('auth-overlay').style.display='none';
    const permissions=['NIR_CREATE','NIR_EDIT_DRAFT','NIR_CONFIRM','NIR_VIEW_COSTS','NIR_REVERSE','NIR_VIEW'];
    const doc={id:'fixture',nir_number:'NIR TEST',status:'confirmed',row_version:7,can_storno:true,source_type:'manual',document_kind:'nir',storno_state:'none',supplier_id:'supplier',supplier_name:'Furnizor test',warehouse_id:'warehouse',reception_location:'Test',supplier_invoice_series:'F',supplier_invoice_number:'12',supplier_invoice_date:'2026-10-06',nir_date:'2026-10-06',nir_time:'09:00',reception_date:'2026-10-06',reception_time:'09:00',currency:'RON',exchange_rate:'1',subtotal_ron:'100',vat_total_ron:'0',grand_total_ron:'100',permissions,attachments:[],line_count:1,lines:[{id:'line',line_number:1,product_id:'product',product_name:'Produs test',supplier_product_name:'Produs test',supplier_product_code:'TEST',accepted_quantity:'1',invoiced_quantity:'1',received_quantity:'1',stock_quantity:'1',stock_unit:'buc',purchase_unit:'buc',conversion_factor:'1',unit_price:'100',line_total_ron:'100',line_net_ron:'100',is_stock_item:true,stornable_quantity:'1'}]};
    window.__withdrawQa={doc,calls:[]};
    window.SHOP_API={getNirPermissions:async()=>({permissions}),listWarehouses:async()=>[{id:'warehouse',name:'Test',is_default:true}],listReceiptLocations:async()=>[],searchSuppliers:async()=>[{id:'supplier',name:'Furnizor test'}],listNirs:async()=>({items:[doc],page:1,page_size:15,total:1,total_pages:1,permissions}),getNir:async()=>structuredClone(doc),getNirMovements:async()=>[],reopenNir:async(id,version)=>{__withdrawQa.calls.push({action:'unconfirm',id,version});return {...doc,status:'draft',row_version:8};},deleteNir:async(id,version)=>{__withdrawQa.calls.push({action:'delete',id,version});return {success:true,deleted:1,deleted_ids:[id]};}};
    window.selectAppModule('shop');window.switchTab('shop-nirs');
  })()`);
  await wait(350);await run(`document.querySelector('[data-nir-open="fixture"]').click()`);await wait(250);
  assert.equal(await run(`document.getElementById('shop-nir-delete').hidden`), true, 'Confirmed NIR has no delete action');
  assert.equal(await run(`document.getElementById('shop-nir-unconfirm') === null`), true, 'No standalone unconfirm action');
  for (const id of ['shop-nir-correct', 'shop-nir-reverse-trigger']) {
    assert.equal(await run(`document.getElementById('${id}').hidden`), false, 'Confirmed NIR retains '+id);
  }
  await run(`document.getElementById('shop-nir-delete').click();document.getElementById('shop-nir-delete-confirm').click()`);
  assert.equal(await run(`__withdrawQa.calls.length`), 0, 'Even a programmatic click cannot delete a confirmed NIR');
  await run(`document.getElementById('shop-nir-correct').click()`);await wait(100);
  assert.equal(await run(`document.getElementById('shop-nir-delete').hidden`), true, 'Editing a confirmed NIR does not reveal deletion');
  assert.equal(await run(`__withdrawQa.calls.length`), 0, 'Opening correction does not change server document');
  await run(`document.querySelector('[data-commerce-close="shop-nir-modal"]').click()`);await wait(100);
  assert.equal(await run(`__withdrawQa.calls.length`), 0, 'Cancelling edit leaves confirmed NIR intact');
  await run(`document.querySelector('[data-nir-open="fixture"]').click()`);await wait(150);
  const output = path.join(__dirname, '../../reports/video-followup-20261116');fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'confirmed-nir-actions-restored.png'), (await win.webContents.capturePage()).toPNG());
  await run(`document.querySelector('[data-commerce-close="shop-nir-modal"]').click();__withdrawQa.doc.status='draft';document.querySelector('[data-nir-open="fixture"]').click()`);await wait(150);
  assert.equal(await run(`document.getElementById('shop-nir-delete').hidden`), false, 'Draft deletion remains available');
  await run(`document.getElementById('shop-nir-delete').click()`);await wait(100);
  await run(`document.getElementById('shop-nir-delete-cancel').click()`);
  assert.equal(await run(`__withdrawQa.calls.length`), 0, 'Cancelling draft deletion makes no API call');
  await run(`document.getElementById('shop-nir-delete').click()`);
  await run(`document.getElementById('shop-nir-delete-confirm').click()`);await wait(200);
  assert.deepEqual(await run(`__withdrawQa.calls[0]`), { action: 'delete', id: 'fixture', version: undefined });
  console.log('PASS: previous NIR actions restored; confirmed deletion blocked, edit/storno preserved, cancelling edit leaves document intact, draft deletion works.');
  win.destroy();app.quit();
}).catch(error => { console.error(error);app.exit(1); });
