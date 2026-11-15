const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const output = path.resolve(__dirname, '../../reports/consumables-local');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'qa-profile'));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  ipcMain.handle('app-update:get-state', () => ({ status: 'idle' }));
  const win = new BrowserWindow({
    show: false,
    width: 1700,
    height: 1080,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.resolve(__dirname, '../preload.js'),
    },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (process.env.GTROTS_QA_VERBOSE === '1') console.log(`[renderer:${level}] ${message}`);
    if (level === 3 && !/404|ERR_FILE_NOT_FOUND|Failed to fetch/i.test(message)) errors.push(message);
  });
  const run = code => win.webContents.executeJavaScript(code);
  const capture = async name => { await pause(450); fs.writeFileSync(path.join(output, name), (await win.webContents.capturePage()).toPNG()); };
  const wait = async code => {
    for (let attempt = 0; attempt < 160; attempt += 1) {
      if (await run(code)) return;
      await pause(100);
    }
    throw new Error(`Timeout: ${code}`);
  };
  const check = async (code, message) => { if (!await run(code)) throw new Error(message); };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value, event = 'input') => run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.value=${JSON.stringify(value)};el.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);

  await win.loadURL(pathToFileURL(path.resolve(__dirname, '../renderer/index.html')).href);
  await wait(`Boolean(window.GTrotsConsumables && window.switchTab)`);
  await run(`
    (() => {
      document.querySelectorAll('#startup-loader,#auth-overlay').forEach(el => { el.hidden = true; el.remove(); });
      window.AUTH = { getToken: () => 'qa', getUser: () => ({display_name:'Administrator QA',role:'admin'}), hasPermission: () => true };
      window.qaToasts=[];window.qaDownloads=[];window.qaExports=[];
      HTMLAnchorElement.prototype.click=function(){window.qaDownloads.push(this.download);};
      window.BUSINESS_UI = { showToast: (message, type) => {window.qaToasts.push(message);console.log('TOAST', type || 'success', message);} };
      const items = [
        {id:'c1',document_id:'d1',document_date:'2026-11-10',document_type:'factura',series:'DEMO',document_number:'C-001',product_name:'Lavete microfibră atelier',unit:'buc',quantity:50,consumed_quantity:12,remaining_quantity:38,unit_price:4.5,net_value:225,vat_rate:19,vat_value:42.75,total_value:267.75,consumption_count:2,file_count:1,has_document:1,revision:'r-c1'},
        {id:'c2',document_id:'d2',document_date:'2026-11-11',document_type:'bon',series:'BON',document_number:'84',product_name:'Spray curățare contacte electrice',unit:'buc',quantity:20,consumed_quantity:3,remaining_quantity:17,unit_price:18,net_value:360,vat_rate:19,vat_value:68.4,total_value:428.4,consumption_count:1,file_count:0,has_document:0,revision:'r-c2'},
      ];
      const files = [{id:'f1',document_id:'d1',original_name:'factura-demo.pdf',mime_type:'application/pdf',file_size:1234}];
      const vouchers = [{voucher_id:'v1',voucher_date:'2026-11-12',series:'BC',voucher_number:'1',quantity:12,value:54,giver_name:'Gestionar atelier',receiver_name:'Tehnician service'}];
      const detail = id => ({...items.find(item=>item.id===id),files,vouchers:id==='c1'?vouchers:[],notes:'Document demonstrativ',vat_manual:0});
      const sourceDocument = {id:'d1',document_date:'2026-11-10',document_type:'factura',series:'DEMO',document_number:'C-001',notes:'Document demonstrativ',files,lines:[detail('c1')],revision:'r-d1'};
      const people = {givers:[{id:'p1',role:'giver',name:'Gestionar atelier',details:'Gestiune centrală',active:1}],receivers:[{id:'p2',role:'receiver',name:'Tehnician service',details:'Atelier',active:1}]};
      window.SHOP_API = {
        listConsumables: async filters => ({items,total:items.length,page:Number(filters.page||1),page_size:Number(filters.page_size||25),page_count:1}),
        getConsumable: async id => detail(id), getConsumableDocument: async () => sourceDocument,
        createConsumableDocument: async () => sourceDocument, updateConsumableDocument: async () => sourceDocument,
        deleteConsumableDocument: async () => ({success:true}), deleteConsumable: async () => ({success:true}),
        addConsumableFiles: async () => sourceDocument, deleteConsumableFile: async () => sourceDocument,
        downloadConsumableDocument: async () => ({file_name:'demo.txt',mime_type:'text/plain',content_base64:btoa('demo')}),
        listConsumablePeople: async () => people, saveConsumablePerson: async () => people, deleteConsumablePerson: async () => people,
        getConsumptionVoucherMeta: async series => ({series,next_number:'2',people}),
        getConsumptionVoucher: async () => ({id:'v1',voucher_date:'2026-11-12',series:'BC',voucher_number:'1',giver_id:'p1',giver_name:'Gestionar atelier',receiver_id:'p2',receiver_name:'Tehnician service',notes:'Consum atelier',work_reference:'Revizie atelier',order_reference:'COM-104',lines:[{consumable_id:'c1',quantity:12}],revision:'r-v1'}),
        createConsumptionVoucher: async value => {window.qaSavedVoucher=value;return value;}, updateConsumptionVoucher: async (_id,value) => {window.qaSavedVoucher=value;return value;},
        deleteConsumptionVoucher: async () => ({success:true}),
        exportConsumables: async format => ({file_name:'qa.'+format,mime_type:'application/octet-stream',content_base64:btoa('qa')}),
        exportConsumptionVoucher: async (id,format) => {window.qaExports.push({id,format});if(window.qaExportFails)throw new Error('Export indisponibil');return {file_name:'Bon-de-consum-BC-1.'+format,mime_type:'application/octet-stream',content_base64:btoa('qa')};},
      };
      if (window.selectAppModule) window.selectAppModule('shop');
      window.switchTab('shop-consumables');
    })()
  `);

  await wait(`Boolean(document.getElementById('shop-consumables-search'))`);
  await check(`document.querySelectorAll('.shop-consumables-table thead th').length===12`, 'Tabelul nu are cele 12 coloane cerute.');
  await check(`document.querySelector('[data-tab="shop-fixed-assets"]')?.nextElementSibling?.dataset.tab==='shop-consumables'`, 'Tabul Consumabile nu este imediat sub Mijloace fixe.');
  await check(`document.querySelector('.shop-consumables-table').scrollWidth>document.querySelector('.shop-consumables-table-wrap').clientWidth`, 'Tabelul nu păstrează toate coloanele cu scroll orizontal.');
  await check(`getComputedStyle(document.querySelector('.shop-consumables-table')).minWidth==='1530px'`, 'Lățimea completă a tabelului nu este păstrată.');
  await run(`document.querySelector('.shop-consumables-table-wrap').scrollIntoView({block:'center'});document.querySelector('.shop-consumables-table-wrap').scrollLeft=9999;`);
  await capture('00-tabel-consumabile.png');

  await fill('#shop-consumables-search', 'laveta atelier');
  await pause(500);
  await check(`document.activeElement?.id==='shop-consumables-search' && document.getElementById('shop-consumables-search').value==='laveta atelier'`, 'Căutarea pierde focusul după actualizarea semantică.');

  await click('#shop-consumables-add');
  await wait(`document.getElementById('shop-consumable-create-modal').classList.contains('visible')`);
  await check(`document.getElementById('shop-consumable-file-input').multiple===true`, 'Documentele multiple nu sunt permise.');
  await run(`(()=>{const dt=new DataTransfer();dt.items.add(new File(['a'],'factura.pdf',{type:'application/pdf'}));dt.items.add(new File(['b'],'anexa.xml',{type:'application/xml'}));const el=document.getElementById('shop-consumable-file-input');el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await check(`document.querySelectorAll('[data-consumable-pending-remove]').length===2`, 'Cele două fișiere nu apar în editor.');
  await fill('[data-consumable-field="product_name"]', 'Mănuși nitril service');
  await check(`document.activeElement?.dataset.consumableField==='product_name'`, 'Inputul denumirii pierde focusul la tastare.');
  await fill('[data-consumable-field="quantity"]', '10', 'change');
  await fill('[data-consumable-field="unit_price"]', '5', 'change');
  await fill('[data-consumable-field="vat_rate"]', '19', 'change');
  await check(`document.querySelector('[data-consumable-field="vat_value"]').value==='9.50'`, 'TVA-ul automat din editor este incorect.');
  await capture('01-document-consumabile.png');
  await click('[data-consumables-close="shop-consumable-create-modal"]');
  await pause(220);

  await click('[data-consumable-voucher="c1"]');
  await wait(`document.getElementById('shop-consumption-voucher-modal').classList.contains('visible')`);
  await check(`document.querySelector('[data-voucher-field="quantity"]').min==='0.0001'`, 'Cantitatea bonului nu este pozitivă.');
  await check(`document.getElementById('shop-consumption-export-actions').hidden`, 'Bonul nesalvat nu trebuie descărcat.');
  await check(`['shop-consumption-work-reference','shop-consumption-order-reference'].every(id=>!document.getElementById(id).required && document.getElementById(id).value==='')`, 'Referințele unui bon nou trebuie să fie opționale.');
  await check(`document.querySelectorAll('[data-manage-consumable-people]').length===2`, 'Administrarea predătorilor și primitorilor lipsește.');
  await check(`document.getElementById('shop-consumption-voucher-series').value==='BC' && document.getElementById('shop-consumption-voucher-number').value==='2'`, 'Seria/numărul bonului nu sunt propuse.');
  await capture('02-bon-consum.png');
  win.setSize(1100, 780);
  await capture('02-bon-consum-compact.png');
  await check(`(()=>{const form=document.getElementById('shop-consumption-voucher-form');const footer=form.querySelector('footer').getBoundingClientRect();return form.scrollWidth<=form.clientWidth+1 && footer.bottom<=innerHeight && footer.right<=innerWidth;})()`, 'Modalul bonului depășește fereastra mică.');
  win.setSize(1700,1080);
  await click('[data-manage-consumable-people="giver"]');
  await wait(`document.getElementById('shop-consumable-people-modal').classList.contains('visible')`);
  await check(`document.querySelectorAll('#shop-consumable-people-list [data-person-edit]').length===1 && document.querySelectorAll('#shop-consumable-people-list [data-person-delete]').length===1`, 'CRUD-ul persoanelor nu este disponibil.');
  await click('[data-consumables-close="shop-consumable-people-modal"]');
  await click('[data-consumables-close="shop-consumption-voucher-modal"]');
  await pause(220);

  await click('[data-consumable-detail="c1"]');
  await wait(`document.getElementById('shop-consumable-detail-modal').classList.contains('visible') && document.querySelectorAll('[data-consumption-voucher-edit]').length===1`);
  await check(`Boolean(document.getElementById('shop-consumable-edit')) && Boolean(document.getElementById('shop-consumable-delete')) && Boolean(document.querySelector('[data-consumption-voucher-delete]'))`, 'Editarea și ștergerea permanentă lipsesc din fișă.');
  await click('[data-consumption-export-id="v1"][data-consumption-export-format="pdf"]');
  await click('[data-consumption-export-id="v1"][data-consumption-export-format="xlsx"]');
  await wait(`window.qaDownloads.length===2`);
  await check(`window.qaExports.every(call=>call.id==='v1') && window.qaExports.map(call=>call.format).join(',')==='pdf,xlsx'`, 'Descărcările din istoric trebuie să folosească bonul și formatul selectate.');
  await click('[data-consumption-voucher-edit="v1"]');
  await wait(`document.getElementById('shop-consumption-voucher-modal').classList.contains('visible')`);
  await check(`!document.getElementById('shop-consumption-export-actions').hidden`, 'Bonul salvat trebuie să aibă descărcări individuale.');
  await check(`document.getElementById('shop-consumption-work-reference').value==='Revizie atelier' && document.getElementById('shop-consumption-order-reference').value==='COM-104'`, 'Referințele nu sunt precompletate la editare.');
  await click('#shop-consumption-export-actions [data-consumption-export-format="pdf"]');
  await wait(`window.qaDownloads.length===3`);
  await capture('04-bon-individual-descarcari.png');
  await fill('#shop-consumption-voucher-notes', 'Modificare nesalvată');
  await click('#shop-consumption-export-actions [data-consumption-export-format="xlsx"]');
  await check(`window.qaDownloads.length===3 && window.qaToasts.at(-1).includes('Salvează modificările')`, 'Modificările nesalvate trebuie semnalate înainte de export.');
  await fill('#shop-consumption-work-reference','Lucrare revizuită');
  await fill('#shop-consumption-order-reference','');
  await click('#shop-consumption-voucher-save');
  await wait(`window.qaSavedVoucher?.work_reference==='Lucrare revizuită' && window.qaSavedVoucher?.order_reference===''`);
  await run('window.qaExportFails=true');
  await click('[data-consumption-export-id="v1"][data-consumption-export-format="pdf"]');
  await wait(`window.qaToasts.at(-1)==='Export indisponibil'`);
  await check(`!document.querySelector('[data-consumption-export-id="v1"][data-consumption-export-format="pdf"]').disabled`, 'Butonul trebuie reactivat după o eroare.');
  await click('[data-consumables-close="shop-consumable-detail-modal"]');
  await pause(220);

  await click('#shop-consumables-export');
  await wait(`document.getElementById('shop-consumables-export-modal').classList.contains('visible')`);
  await check(`document.querySelectorAll('[data-consumables-format]').length===3 && document.querySelectorAll('[data-consumables-period]').length===7`, 'Exportul nu are toate formatele și perioadele.');
  await click('[data-consumables-period="custom"]');
  await check(`document.getElementById('shop-consumables-export-custom').hidden===false`, 'Perioada custom nu afișează datele.');
  await capture('03-export-consumabile.png');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('consumables_ui_qa: ok (table, focus, files, VAT, voucher, people, CRUD, export, responsive scroll)');
  win.destroy();
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
