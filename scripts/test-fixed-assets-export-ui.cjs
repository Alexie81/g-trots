// Integration test against the loopback renderer/API with isolated SQLite data.
// Start scripts/preview-fixed-assets-router.php on 127.0.0.1:4175 first.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../reports/fixed-assets-local');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'export-ui-profile'));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { offscreen: true, backgroundThrottling: false, nodeIntegration: false, contextIsolation: true } });
  const run = code => win.webContents.executeJavaScript(code);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async code => {
    for (let n = 0; n < 200; n++) { if (await run(code)) return; await delay(100); }
    throw new Error('Timeout: ' + code);
  };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const check = async (code, message) => { if (!(await run(code))) throw new Error(message); };
  const downloads = [];
  const requests = [];
  const failures = [];
  let fixture;
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://127.0.0.1:4175/local-api/*'] }, (details, callback) => {
    const url = new URL(details.url);
    if (url.searchParams.get('action') === 'exportFixedAssets') requests.push(Object.fromEntries(url.searchParams));
    callback({});
  });
  win.webContents.session.on('will-download', (_event, item) => {
    const target = path.join(output, 'ui-' + item.getFilename());
    item.setSavePath(target);
    item.once('done', (_e, state) => {
      if (state !== 'completed') failures.push('Download failed: ' + state);
      else downloads.push(target);
    });
  });
  try {
    await win.loadURL('http://127.0.0.1:4175/');
    await wait(`Boolean(document.getElementById('shop-fixed-assets-search'))`);
    fixture = await run(`window.SHOP_API.createFixedAssetDocument({document:{document_date:'2026-01-02',document_type:'bon',series:'QA',document_number:'EXPORT-UI-${Date.now()}'},lines:[{product_name:'Test export complet UI',quantity:2,unit_price:19.5,vat_rate:21}]})`);
    await click('#shop-fixed-assets-export');
    await wait(`getComputedStyle(document.querySelector('.shop-fixed-asset-export')).opacity==='1'`);
    await check(`document.querySelectorAll('#shop-fixed-asset-export-modal input[type="date"], [data-fixed-asset-period]').length===0`, 'Period controls must be absent');
    await check(`document.querySelectorAll('[data-fixed-asset-export]').length===3`, 'Three export formats are available');

    for (const [width, height] of [[1280, 800], [900, 700], [430, 760], [320, 568]]) {
      win.setContentSize(width, height);
      await click('[data-fixed-asset-export="zip"]');
      await delay(300);
      const layout = await run(`(() => {
        const modal=document.querySelector('.shop-fixed-asset-export'),footer=modal.querySelector('footer'),body=modal.querySelector('.shop-nir-registry-download-body');
        const m=modal.getBoundingClientRect(),f=footer.getBoundingClientRect();
        const controls=[...modal.querySelectorAll('button')];
        return {width:innerWidth,height:innerHeight,modal:{left:m.left,right:m.right,top:m.top,bottom:m.bottom},footer:{top:f.top,bottom:f.bottom},bodyWidth:body.clientWidth,bodyScrollWidth:body.scrollWidth,controlsContained:controls.every(b=>{const r=b.getBoundingClientRect();return r.left>=m.left&&r.right<=m.right;})};
      })()`);
      if (layout.modal.left < -1 || layout.modal.right > layout.width + 1 || layout.modal.top < -1 || layout.modal.bottom > layout.height + 1 || layout.footer.bottom > layout.height + 1 || layout.bodyScrollWidth > layout.bodyWidth + 1 || !layout.controlsContained) throw new Error('Clipped export layout: ' + JSON.stringify(layout));
      fs.writeFileSync(path.join(output, `export-modal-${width}.png`), (await win.webContents.capturePage()).toPNG());
      console.log('Layout PASS', width, height, JSON.stringify(layout));
    }

    win.setContentSize(1280, 800);
    for (const format of ['pdf', 'xlsx', 'zip']) {
      if (await run(`document.getElementById('shop-fixed-asset-export-modal').hidden`)) await click('#shop-fixed-assets-export');
      await click(`[data-fixed-asset-export="${format}"]`);
      await check(`document.querySelector('[data-fixed-asset-export="${format}"]').getAttribute('aria-pressed')==='true'`, 'Selected format accessible state');
      const before = requests.length;
      await run(`document.getElementById('shop-fixed-asset-export-form').requestSubmit();document.getElementById('shop-fixed-asset-export-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));`);
      await wait(`document.getElementById('shop-fixed-asset-export-modal').hidden`);
      for (let n = 0; n < 150 && downloads.length < ['pdf', 'xlsx', 'zip'].indexOf(format) + 1; n++) await delay(100);
      if (requests.length !== before + 1) throw new Error('Duplicate export request');
      const request = requests.at(-1);
      if (request.format !== format || Object.keys(request).some(key => !['action', 'format', '_'].includes(key))) throw new Error('Export request included filters: ' + JSON.stringify(request));
      const file = downloads.find(file => file.endsWith('.' + format));
      if (!file) throw new Error('Download not received: ' + format);
      const bytes = fs.readFileSync(file);
      if (format === 'pdf' ? bytes.subarray(0,5).toString() !== '%PDF-' : bytes.subarray(0,2).toString() !== 'PK') throw new Error('Invalid downloaded file ' + format);
      console.log('Export PASS', format, bytes.length, 'bytes');
    }

    await run(`window.__originalFetch=window.fetch;window.fetch=(url,options)=>String(url).includes('action=exportFixedAssets')?Promise.resolve(new Response(JSON.stringify({error:'Eroare export test'}),{status:400,headers:{'Content-Type':'application/json'}})):window.__originalFetch(url,options);void 0;`);
    await click('#shop-fixed-assets-export');
    await click('[data-fixed-asset-export="zip"]');
    await run(`document.getElementById('shop-fixed-asset-export-form').requestSubmit()`);
    await wait(`!document.getElementById('shop-fixed-asset-export-confirm').disabled`);
    await check(`!document.getElementById('shop-fixed-asset-export-modal').hidden && [...document.querySelectorAll('[data-fixed-asset-export]')].every(b=>!b.disabled) && document.getElementById('shop-fixed-asset-export-form').getAttribute('aria-busy')==='false'`, 'Error recovery re-enables modal and formats');
    await check(`document.body.innerText.includes('Eroare export test')`, 'Export error visible');
    await run(`window.fetch=window.__originalFetch;delete window.__originalFetch;`);
    if (failures.length) throw new Error(failures.join('\n'));
    console.log('UI PASS: no period, all three real downloads, format-only requests, duplicate-submit protection, error recovery, four viewport sizes.');
  } finally {
    if (fixture) await run(`window.SHOP_API.getFixedAssetDocument(${JSON.stringify(fixture.id)}).then(doc=>window.SHOP_API.deleteFixedAssetDocument(doc.id,doc.revision))`);
    win.destroy();
  }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
