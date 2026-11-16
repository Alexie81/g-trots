const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gt-nir-dates-')));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  // This test uses only local fixtures; never write a draft to the live API.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_details, done) => done({ cancel: true }));
  const win = new BrowserWindow({ show: false, width: 1366, height: 900,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code);
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await run(`(() => {
    document.getElementById('startup-loader').style.display='none';
    document.getElementById('auth-overlay').style.display='none';
    window.__dateQa={requests:[],saved:null};
    const permissions=['NIR_CREATE','NIR_EDIT_DRAFT','NIR_CONFIRM','NIR_VIEW_COSTS'];
    window.SHOP_API={
      getNirPermissions:async()=>({permissions}),
      listWarehouses:async()=>[{id:'warehouse',name:'Gestiune test',is_default:true}],
      listReceiptLocations:async()=>[{id:'location',name:'Recepție test',is_default:true}],
      searchSuppliers:async()=>[],
      listNirs:async()=>({items:[],page:1,page_size:15,total:0,total_pages:1,permissions}),
      getBnrExchangeRate:(currency,date)=>new Promise((resolve,reject)=>__dateQa.requests.push({currency,date,resolve,reject})),
      createNir:async payload=>{__dateQa.saved=payload;return {...payload,id:'saved-fixture',status:'draft',row_version:1,permissions,lines:payload.lines||[],attachments:[]};},
      updateNir:async(id,payload)=>{__dateQa.saved=payload;return {...payload,id,status:'draft',row_version:2,permissions,lines:payload.lines||[],attachments:[]};},
    };
    window.selectAppModule('shop');window.switchTab('shop-nirs');
  })()`);
  await wait(300);
  await run(`document.querySelector('#tab-shop-nirs [data-commerce-add="shop-nirs-content"]').click()`);
  await wait(200);
  const dates = await run(`(() => {
    const invoice=document.querySelector('[data-nir-field="supplier_invoice_date"]');
    const nir=document.querySelector('[data-nir-datetime="nir"]');
    const reception=document.querySelector('[data-nir-datetime="reception"]');
    nir.value='2026-11-16T09:15';nir.dispatchEvent(new Event('input',{bubbles:true}));
    reception.value='2026-11-16T10:45';reception.dispatchEvent(new Event('input',{bubbles:true}));
    window.__dateQa.invoice=invoice;window.__dateQa.nir=nir;window.__dateQa.reception=reception;
    const scroll=document.querySelector('.shop-nir-editor-scroll')||document.getElementById('shop-nir-editor');
    const scrollBefore=scroll.scrollTop;
    invoice.focus();
    const steps=[];
    for(const value of ['2026-10-01','2026-09-01','2026-08-01','2026-08-25']){
      invoice.value=value;invoice.dispatchEvent(new Event('input',{bubbles:true}));
      invoice.dispatchEvent(new Event('change',{bubbles:true}));
      steps.push({value,same:invoice===document.querySelector('[data-nir-field="supplier_invoice_date"]'),focused:document.activeElement===invoice,nir:nir.value,reception:reception.value,rateDate:document.querySelector('[data-nir-field="exchange_rate_date"]').value});
    }
    invoice.value='';invoice.dispatchEvent(new Event('input',{bubbles:true}));
    const partial={connected:invoice.isConnected,nir:nir.value,reception:reception.value};
    invoice.value='2026-09-25';invoice.dispatchEvent(new Event('input',{bubbles:true}));
    const scrollAfter=scroll.scrollTop;
    return {steps,partial,scrollBefore,scrollAfter};
  })()`);
  for (const step of dates.steps) {
    assert.equal(step.same, true, 'Changing date must not replace the input or close its native calendar.');
    assert.equal(step.focused, true, 'Date keyboard focus must survive month changes.');
    assert.equal(step.nir, `${step.value}T09:15`);
    assert.equal(step.reception, `${step.value}T10:45`);
    assert.equal(step.rateDate, step.value);
  }
  assert.equal(dates.partial.connected,true);
  assert.equal(dates.partial.nir,'2026-08-25T09:15');
  assert.equal(dates.partial.reception,'2026-08-25T10:45');
  assert.equal(dates.scrollBefore,dates.scrollAfter);
  await run(`document.getElementById('shop-nir-currency-toggle').click();document.querySelector('[data-nir-currency="EUR"]').click();`);
  const currencyResult = await run(`(async()=>{
    const invoice=document.querySelector('[data-nir-field="supplier_invoice_date"]');invoice.focus();
    __dateQa.requests[0].resolve({rate:'5.07000000',date:'2026-09-25'});
    await new Promise(resolve=>setTimeout(resolve,20));
    return {same:invoice===document.querySelector('[data-nir-field="supplier_invoice_date"]'),focus:document.activeElement===invoice,rate:document.querySelector('[data-nir-field="exchange_rate"]').value};
  })()`);
  assert.deepEqual(currencyResult,{same:true,focus:true,rate:'5.07'});
  const asyncResult=await run(`(async()=>{
    const rateDate=document.querySelector('[data-nir-field="exchange_rate_date"]');rateDate.focus();
    const setDate=value=>{rateDate.value=value;rateDate.dispatchEvent(new Event('input',{bubbles:true}));rateDate.dispatchEvent(new Event('change',{bubbles:true}));};
    setDate('2026-10-01');setDate('2026-10-02');
    __dateQa.requests[2].resolve({rate:'5.2',date:'2026-10-02'});await new Promise(resolve=>setTimeout(resolve,20));
    __dateQa.requests[1].resolve({rate:'4.9',date:'2026-10-01'});await new Promise(resolve=>setTimeout(resolve,20));
    const latest={same:rateDate===document.querySelector('[data-nir-field="exchange_rate_date"]'),focus:document.activeElement===rateDate,date:rateDate.value,rate:document.querySelector('[data-nir-field="exchange_rate"]').value};
    setDate('2026-10-03');
    const rate=document.querySelector('[data-nir-field="exchange_rate"]');rate.focus();rate.value='5.4';rate.dispatchEvent(new Event('input',{bubbles:true}));
    __dateQa.requests[3].resolve({rate:'5.1',date:'2026-10-02'});await new Promise(resolve=>setTimeout(resolve,20));
    const manual={rate:rate.value,date:rateDate.value,focus:document.activeElement===rate};
    setDate('2026-10-04');rateDate.focus();__dateQa.requests[4].reject(new Error('Eroare BNR simulată'));await new Promise(resolve=>setTimeout(resolve,20));
    return {latest,manual,error:{same:rateDate===document.querySelector('[data-nir-field="exchange_rate_date"]'),focus:document.activeElement===rateDate,rate:rate.value}};
  })()`);
  assert.deepEqual(asyncResult.latest,{same:true,focus:true,date:'2026-10-02',rate:'5.2'});
  assert.deepEqual(asyncResult.manual,{rate:'5.4',date:'2026-10-03',focus:true});
  assert.deepEqual(asyncResult.error,{same:true,focus:true,rate:'5.4'});
  await run(`document.getElementById('shop-nir-save').click()`);
  await wait(150);
  const saved=await run(`({date:__dateQa.saved?.supplier_invoice_date,nir:__dateQa.saved?.nir_date,time:__dateQa.saved?.nir_time,reception:__dateQa.saved?.reception_date,receptionTime:__dateQa.saved?.reception_time,rate:__dateQa.saved?.exchange_rate})`);
  assert.deepEqual(saved,{date:'2026-09-25',nir:'2026-09-25',time:'09:15',reception:'2026-09-25',receptionTime:'10:45',rate:'5.4'});
  await wait(4000);
  const output=path.join(__dirname,'..','..','reports','video-issue-20261116');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'date-controls-verified.png'),(await win.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(output,'date-controls-test.json'),JSON.stringify({dates,currencyResult,asyncResult,saved},null,2));
  console.log('PASS: stable date controls, keyboard focus, preserved times, RON sync, BNR completion/error/races, manual rate and saved payload.');
  win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
