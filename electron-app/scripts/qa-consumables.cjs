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
  ipcMain.handle('prepare-pdf-preview', (_event, { defaultName, buffer }) => {
    const filePath = path.join(output, `qa-preview-${String(defaultName).replace(/[^a-z0-9.-]+/gi, '-')}`);
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { success: true, fileName: path.basename(filePath), url: pathToFileURL(filePath).href };
  });
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
      window.qaToasts=[];window.qaDownloads=[];window.qaExports=[];window.qaPreviews=[];
      HTMLAnchorElement.prototype.click=function(){window.qaDownloads.push({name:this.download,kind:'anchor'});};
      window.savePdf=async(name,bytes)=>{window.qaDownloads.push({name,kind:'pdf',bytes});return {success:true,filePath:name};};
      window.saveExcel=async(name,bytes)=>{window.qaDownloads.push({name,kind:'xlsx',bytes});return {success:true,filePath:name};};
      window.BUSINESS_UI = { showToast: (message, type) => {window.qaToasts.push(message);console.log('TOAST', type || 'success', message);} };
      const items = [
        {id:'c1',document_id:'d1',document_date:'2026-11-10',document_type:'factura',series:'DEMO',document_number:'C-001',product_name:'Lavete microfibră atelier',unit:'buc',quantity:50,consumed_quantity:12,remaining_quantity:38,unit_price:4.5,net_value:225,vat_rate:19,vat_value:42.75,total_value:267.75,consumption_count:2,vouchers:[{voucher_id:'v1',series:'BC',voucher_number:'1'},{voucher_id:'v2',series:'BC',voucher_number:'2'}],file_count:1,has_document:1,revision:'r-c1'},
        {id:'c2',document_id:'d2',document_date:'2026-11-11',document_type:'bon',series:'BON',document_number:'84',product_name:'Spray curățare contacte electrice',unit:'buc',quantity:20,consumed_quantity:3,remaining_quantity:17,unit_price:18,net_value:360,vat_rate:19,vat_value:68.4,total_value:428.4,consumption_count:1,vouchers:[{voucher_id:'v3',series:'BC',voucher_number:'3'}],file_count:0,has_document:0,revision:'r-c2'},
      ];
      const files = [{id:'f1',document_id:'d1',original_name:'factura-demo.pdf',mime_type:'application/pdf',file_size:1234}];
      const vouchers = [{voucher_id:'v1',voucher_date:'2026-11-12',series:'BC',voucher_number:'1',quantity:12,value:54,giver_name:'Gestionar atelier',receiver_name:'Tehnician service'}];
      const detail = id => ({...items.find(item=>item.id===id),files,vouchers:id==='c1'?vouchers:[],notes:'Document demonstrativ',vat_manual:0});
      const sourceDocument = {id:'d1',document_date:'2026-11-10',document_type:'factura',series:'DEMO',document_number:'0001',notes:'Document demonstrativ',files,lines:[{...detail('c1'),quantity:'50.0000',unit_price:'4.5000',vat_rate:'19.0000',vat_value:'42.7500'}],revision:'r-d1'};
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
        getConsumptionVoucher: async () => ({id:'v1',voucher_date:'2026-11-12',series:'BC',voucher_number:'1',giver_id:'p1',giver_name:'Gestionar atelier',receiver_id:'p2',receiver_name:'Tehnician service',notes:'Consum atelier',work_reference:'Revizie atelier',order_reference:'COM-104',discount_type:'percent',discount_value:'10.0000',lines:[{consumable_id:'c1',quantity:'12.0000'}],revision:'r-v1'}),
        previewConsumptionVoucher: async value => {window.qaPreviews.push(value);if(window.qaPreviewFails)throw new Error('Previzualizare indisponibilă');return {file_name:'Bon demo.pdf',mime_type:'application/pdf',content_base64:${JSON.stringify(process.env.GT_CONSUMABLES_PREVIEW_PDF ? fs.readFileSync(process.env.GT_CONSUMABLES_PREVIEW_PDF).toString('base64') : Buffer.from('%PDF-1.4').toString('base64'))}};},
        createConsumptionVoucher: async value => {window.qaSavedVoucher=value;return value;}, updateConsumptionVoucher: async (_id,value) => {window.qaSavedVoucher=value;return value;},
        deleteConsumptionVoucher: async () => ({success:true}),
        exportConsumables: async format => ({file_name:'qa.'+format,mime_type:'application/octet-stream',content_base64:format==='pdf'?btoa('%PDF-1.4'):btoa('PK\\x03\\x04qa')}),
        exportConsumptionVoucher: async (id,format) => {window.qaExports.push({id,format});if(window.qaExportFails)throw new Error('Export indisponibil');return {file_name:'Bon-de-consum-BC-1.'+format,mime_type:format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',content_base64:format==='pdf'?${JSON.stringify(process.env.GT_CONSUMABLES_PREVIEW_PDF ? fs.readFileSync(process.env.GT_CONSUMABLES_PREVIEW_PDF).toString('base64') : Buffer.from('%PDF-1.4').toString('base64'))}:btoa('PK\\x03\\x04qa')};},
      };
      if (window.selectAppModule) window.selectAppModule('shop');
      window.switchTab('shop-consumables');
    })()
  `);

  await wait(`Boolean(document.getElementById('shop-consumables-search'))`);
  await check(`document.querySelectorAll('.shop-consumables-table thead th').length===13`, 'Tabelul nu are cele 13 coloane, inclusiv Discount.');
  await check(`document.querySelector('.shop-consumables-table th:nth-child(4)').textContent==='Bon de consum' && [...document.querySelectorAll('.shop-consumable-row-number')].map(el=>el.textContent).join(',')==='2,1'`, 'Coloana bonului sau ordinea descrescătoare este incorectă.');
  await check(`document.querySelector('[data-tab="shop-fixed-assets"]')?.nextElementSibling?.dataset.tab==='shop-consumables'`, 'Tabul Consumabile nu este imediat sub Mijloace fixe.');
  await check(`document.querySelector('.shop-consumables-table').scrollWidth>document.querySelector('.shop-consumables-table-wrap').clientWidth`, 'Tabelul nu păstrează toate coloanele cu scroll orizontal.');
  await check(`getComputedStyle(document.querySelector('.shop-consumables-table')).minWidth==='1530px'`, 'Lățimea completă a tabelului nu este păstrată.');
  await run(`document.querySelector('.shop-consumables-table-wrap').scrollIntoView({block:'center'});document.querySelector('.shop-consumables-table-wrap').scrollLeft=9999;`);
  await capture('00-tabel-consumabile.png');

  win.setSize(3200,1080);await pause(150);
  await check(`(()=>{const table=document.querySelector('.shop-consumables-table'),wrap=document.querySelector('.shop-consumables-table-wrap'),bottom=wrap.nextElementSibling;return Math.abs(table.getBoundingClientRect().width-wrap.clientWidth)<=2&&Math.abs(bottom.getBoundingClientRect().width-wrap.getBoundingClientRect().width)<=2;})()`, 'Tabelul și paginarea trebuie să umple lățimea unui ecran mare.');
  await capture('07-tabel-ecran-mare.png');
  win.setSize(1700,1080);
  await check(`document.querySelectorAll('#shop-consumables-content [data-consumption-view]').length===3`, 'Fiecare bon salvat trebuie să aibă buton Vezi, inclusiv la mai multe bonuri pe același consumabil.');
  await click('#shop-consumables-content [data-consumption-view="v2"]');
  await wait(`document.getElementById('shop-consumption-preview-modal').classList.contains('visible')`);
  await check(`window.qaExports.at(-1).id==='v2'&&window.qaExports.at(-1).format==='pdf'&&window.qaDownloads.length===0&&!window.qaSavedVoucher&&document.getElementById('shop-consumption-preview-title').textContent==='Bon de consum BC 2'`, 'Vezi trebuie să deschidă PDF-ul bonului ales, fără descărcare sau salvare.');
  await click('#shop-consumption-preview-download');
  await wait(`window.qaDownloads.length===1`);
  await check(`window.qaDownloads[0].name==='Bon-de-consum-BC-1.pdf'&&window.qaDownloads[0].kind==='pdf'&&String.fromCharCode(...window.qaDownloads[0].bytes.slice(0,5))==='%PDF-'`, 'Descărcarea din previzualizare trebuie să salveze PDF-ul valid cu numele bonului.');
  await run('window.qaDownloads=[]');
  if(process.env.GT_CONSUMABLES_PREVIEW_PDF){await pause(1700);await capture('08-vezi-bon-salvat.png');}
  await click('[data-consumables-close="shop-consumption-preview-modal"]');
  await run('window.qaExports=[]');
  await pause(220);
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
  await check(`document.querySelector('[data-consumable-field="vat_value"]').value==='9.5'`, 'TVA-ul automat din editor este incorect.');
  await fill('#shop-purchase-discount-type','percent','change');
  await fill('#shop-purchase-discount-value','20','change');
  await check(`document.querySelector('[data-consumable-field="vat_value"]').value==='9.5' && document.getElementById('shop-purchase-total').textContent.includes('47,60') && document.getElementById('shop-purchase-reduction').textContent.includes('11,90')`, 'Discountul trebuie scăzut din total, păstrând TVA introdus.');
  await fill('#shop-purchase-discount-value','100','change');
  await check(`!document.querySelector('[data-consumable-field="stock_cost_override"]') && document.getElementById('shop-purchase-total').textContent.includes('0,00')`, 'Discountul integral trebuie să dea total zero, fără câmpuri suplimentare.');
  await fill('#shop-purchase-discount-value','20','change');
  await run(`document.querySelector('.shop-purchase-discount').scrollIntoView({block:'center'})`);
  await capture('01-document-consumabile.png');
  await click('[data-consumables-close="shop-consumable-create-modal"]');
  await pause(220);

  await click('[data-consumable-edit="c1"]');
  await wait(`document.getElementById('shop-consumable-create-modal').classList.contains('visible')`);
  await check(`['quantity','unit_price','vat_rate','vat_value'].map(field=>document.querySelector('[data-consumable-field="'+field+'"]').value).join(',')==='50,4.5,19,42.75'`, 'Editarea adaugă zecimale inutile sau pierde fracțiunile reale.');
  await check(`document.getElementById('shop-consumable-number').value==='0001'`, 'Numărul documentului trebuie păstrat ca text, inclusiv zerourile inițiale.');
  await click('[data-consumables-close="shop-consumable-create-modal"]');
  await pause(220);

  await click('[data-consumable-voucher="c1"]');
  await wait(`document.getElementById('shop-consumption-voucher-modal').classList.contains('visible')`);
  await check(`document.querySelector('[data-voucher-field="quantity"]').min==='0.0001'`, 'Cantitatea bonului nu este pozitivă.');
  await check(`document.getElementById('shop-consumption-export-actions').hidden`, 'Bonul nesalvat nu trebuie descărcat.');
  await check(`['shop-consumption-work-reference','shop-consumption-order-reference'].every(id=>!document.getElementById(id).required && document.getElementById(id).value==='')`, 'Referințele unui bon nou trebuie să fie opționale.');
  await check(`document.querySelectorAll('[data-manage-consumable-people]').length===2`, 'Administrarea predătorilor și primitorilor lipsește.');
  await check(`document.getElementById('shop-consumption-voucher-series').value==='BC' && document.getElementById('shop-consumption-voucher-number').value==='2'`, 'Seria/numărul bonului nu sunt propuse.');
  await check(`['giver','receiver'].every(role=>document.getElementById('shop-consumption-'+role).value && document.getElementById('shop-consumption-'+role+'-name').hidden && document.getElementById('shop-consumption-'+role+'-name').disabled)`, 'Prima persoană trebuie selectată automat, fără input manual vizibil.');
  await fill('#shop-consumption-giver','','change');
  await check(`!document.getElementById('shop-consumption-giver-name').hidden && document.getElementById('shop-consumption-giver-name').required`, 'Opțiunea manuală trebuie să arate inputul obligatoriu.');
  await fill('#shop-consumption-giver','p1','change');
  await fill('[data-voucher-field="quantity"]','1.5','change');
  await check(`document.getElementById('shop-consumption-legacy-fields').hidden && document.getElementById('shop-consumption-total').textContent.includes('6,75')`, 'Bonul nou trebuie să preia costul, fără un al doilea discount.');
  await click('#shop-consumption-voucher-preview');
  await wait(`document.getElementById('shop-consumption-preview-modal').classList.contains('visible')`);
  await check(`window.qaPreviews.length===1 && !window.qaSavedVoucher && window.qaPreviews[0].discount_value==='0' && !window.qaPreviews[0].voucher_id && document.getElementById('shop-consumption-preview-frame').src.startsWith('file:')`, 'Previzualizarea nouă trebuie să folosească formularul fără a salva și un PDF local valid.');
  if(process.env.GT_CONSUMABLES_PREVIEW_PDF){await pause(1700);await capture('05-previzualizare-bon.png');}
  await click('[data-consumables-close="shop-consumption-preview-modal"]');
  await check(`document.getElementById('shop-consumption-preview-frame').src==='about:blank'`, 'Previzualizarea trebuie eliberată la închidere.');
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
  await click('#shop-consumable-detail-content [data-consumption-view="v1"]');
  await wait(`document.getElementById('shop-consumption-preview-modal').classList.contains('visible')`);
  await check(`window.qaExports.at(-1).id==='v1'&&window.qaDownloads.length===0`, 'Vezi din fișă trebuie să previzualizeze bonul, fără descărcare.');
  await click('[data-consumables-close="shop-consumption-preview-modal"]');
  await run('window.qaExports=[]');await pause(220);
  await click('#shop-consumable-edit');
  await wait(`document.getElementById('shop-consumable-create-modal').classList.contains('visible')`);
  await check(`(()=>{const edit=document.getElementById('shop-consumable-create-modal'),detail=document.getElementById('shop-consumable-detail-modal');const input=document.getElementById('shop-consumable-number'),rect=input.getBoundingClientRect();return Number(getComputedStyle(edit).zIndex)>Number(getComputedStyle(detail).zIndex)&&edit.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));})()`, 'Editarea din fișă trebuie să fie deasupra, accesibilă fără închiderea fișei.');
  await capture('06-editare-peste-fisa.png');
  await click('[data-consumables-close="shop-consumable-create-modal"]');
  await pause(220);
  await click('[data-consumption-export-id="v1"][data-consumption-export-format="pdf"]');
  await wait(`document.getElementById('shop-consumption-preview-modal').classList.contains('visible')`);
  await check(`window.qaDownloads.length===0&&document.getElementById('shop-consumption-preview-frame').src.startsWith('file:')`, 'Butonul PDF trebuie să deschidă documentul sigur în aplicație.');
  await click('[data-consumables-close="shop-consumption-preview-modal"]');
  await pause(220);
  await click('[data-consumption-export-id="v1"][data-consumption-export-format="xlsx"]');
  await wait(`window.qaDownloads.length===1`);
  await check(`window.qaExports.every(call=>call.id==='v1') && window.qaExports.map(call=>call.format).join(',')==='pdf,xlsx'`, 'Descărcările din istoric trebuie să folosească bonul și formatul selectate.');
  await check(`window.qaDownloads[0].name==='Bon-de-consum-BC-1.xlsx'&&window.qaDownloads[0].kind==='xlsx'&&String.fromCharCode(...window.qaDownloads[0].bytes.slice(0,2))==='PK'`, 'Excel-ul trebuie salvat nativ, cu numele bonului și conținut valid.');
  await click('[data-consumption-voucher-edit="v1"]');
  await wait(`document.getElementById('shop-consumption-voucher-modal').classList.contains('visible')`);
  await check(`!document.getElementById('shop-consumption-export-actions').hidden`, 'Bonul salvat trebuie să aibă descărcări individuale.');
  await check(`document.getElementById('shop-consumption-work-reference').value==='Revizie atelier' && document.getElementById('shop-consumption-order-reference').value==='COM-104'`, 'Referințele nu sunt precompletate la editare.');
  await check(`document.querySelector('[data-voucher-field="quantity"]').value==='12' && document.getElementById('shop-consumption-discount-value').value==='10' && document.getElementById('shop-consumption-total').textContent.includes('48,60')`, 'Editarea bonului nu normalizează zecimalele sau nu încarcă discountul.');
  await click('#shop-consumption-export-actions [data-consumption-export-format="pdf"]');
  await wait(`document.getElementById('shop-consumption-preview-modal').classList.contains('visible')`);
  await check(`window.qaDownloads.length===1&&document.getElementById('shop-consumption-preview-frame').src.startsWith('file:')`, 'PDF-ul bonului salvat trebuie previzualizat local, fără salvare coruptă.');
  await capture('04-bon-individual-descarcari.png');
  await click('[data-consumables-close="shop-consumption-preview-modal"]');
  await pause(220);
  await fill('#shop-consumption-voucher-notes', 'Modificare nesalvată');
  await click('#shop-consumption-export-actions [data-consumption-export-format="xlsx"]');
  await check(`window.qaDownloads.length===1 && window.qaToasts.at(-1).includes('Salvează modificările')`, 'Modificările nesalvate trebuie semnalate înainte de export.');
  await fill('#shop-consumption-work-reference','Lucrare revizuită');
  await fill('#shop-consumption-order-reference','');
  await fill('#shop-consumption-discount-value','25');
  await click('#shop-consumption-voucher-preview');
  await wait(`document.getElementById('shop-consumption-preview-modal').classList.contains('visible')`);
  await check(`window.qaPreviews.at(-1).voucher_id==='v1' && window.qaPreviews.at(-1).discount_value==='25' && !window.qaSavedVoucher`, 'Previzualizarea editării trebuie să includă schimbările nesalvate.');
  await click('[data-consumables-close="shop-consumption-preview-modal"]');
  await run('window.qaPreviewFails=true');
  await click('#shop-consumption-voucher-preview');
  await wait(`window.qaToasts.at(-1)==='Previzualizare indisponibilă'`);
  await check(`!document.getElementById('shop-consumption-voucher-preview').disabled`, 'Butonul de previzualizare trebuie reactivat la eroare.');
  await click('#shop-consumption-voucher-save');
  await wait(`window.qaSavedVoucher?.work_reference==='Lucrare revizuită' && window.qaSavedVoucher?.order_reference===''`);
  await check(`window.qaSavedVoucher.discount_type==='percent' && window.qaSavedVoucher.discount_value==='25'`, 'Discountul nu este inclus la salvarea editării.');
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
