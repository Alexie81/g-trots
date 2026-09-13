const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false, partition: `qa-newsletter-${Date.now()}` },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('app-update') && !message.includes('Failed to fetch') && !message.includes('Security Warning')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const subscribers = [
      { id:'n1', full_name:'Andrei Popescu', email:'andrei@example.ro', phone:'0762 000 111', status:'subscribed', consent_source:'checkout', consent_at:'2026-09-12 10:30:00', last_notified_at:'2026-09-13 09:10:00', last_error:null, created_at:'2026-09-12 10:30:00' },
      { id:'n2', full_name:'Maria Ionescu', email:'maria@example.ro', phone:'0722 000 222', status:'unsubscribed', consent_source:'checkout_historical', consent_at:'2026-09-01 12:00:00', unsubscribed_at:'2026-09-13 11:45:00', last_notified_at:null, last_error:null, created_at:'2026-09-01 12:00:00' },
      { id:'n3', full_name:'Client Test', email:'test@example.ro', phone:'', status:'subscribed', consent_source:'checkout', consent_at:'2026-09-13 12:00:00', last_notified_at:null, last_error:null, created_at:'2026-09-13 12:00:00' }
    ];
    window.SHOP_API = {
      listNewsletterSubscribers: async () => subscribers,
      listCategories: async () => [], listBrands: async () => [], listManufacturers: async () => [],
      listProductSources: async () => [{ id:'source-1', name:'G-Trots', domain:'g-trots.ro', is_active:true, is_default:true }],
      createProduct: async payload => { await new Promise(resolve => setTimeout(resolve, 1900)); return { id:'product-1', ...payload, stripe_sync_status:'synced', seo_page:{ success:true }, newsletter_notification:{ sent:2, failed:0 } }; },
      loadProductManager: async () => ({ products:[], total:0, page:1, categories:[], brands:[], manufacturers:[], sources:[{ id:'source-1', name:'G-Trots', domain:'g-trots.ro', is_active:true, is_default:true }] })
    };
    window.selectAppModule('shop');
    window.switchTab('shop-newsletter');
  })()`);
  await wait(700);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-newsletter');
  fs.mkdirSync(outputDir, { recursive: true });
  const newsletterPath = path.join(outputDir, 'newsletter-desktop.png');
  fs.writeFileSync(newsletterPath, (await win.webContents.capturePage()).toPNG());
  const newsletterLayout = await win.webContents.executeJavaScript(`(() => {
    const metrics = document.querySelector('.shop-newsletter-metrics');
    const cards = [...document.querySelectorAll('.shop-newsletter-metrics article')];
    return metrics ? { viewport: innerWidth, columns: getComputedStyle(metrics).gridTemplateColumns, width: metrics.getBoundingClientRect().width, cardWidths: cards.map(card => card.getBoundingClientRect().width) } : { viewport: innerWidth, missing: true };
  })()`);

  await win.webContents.executeJavaScript(`document.querySelector('[data-commerce-add="shop-products-content"]').click()`);
  await wait(350);
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('shop-product-name').value = 'Produs demonstrativ newsletter';
    document.getElementById('shop-product-slug').value = 'produs-demonstrativ-newsletter';
    document.getElementById('shop-product-price').value = '129';
    document.getElementById('shop-product-short').value = 'Descriere scurtă pentru verificarea salvării.';
    document.getElementById('shop-product-form').requestSubmit();
  })()`);
  await wait(520);
  const progressPath = path.join(outputDir, 'product-save-progress-desktop.png');
  fs.writeFileSync(progressPath, (await win.webContents.capturePage()).toPNG());
  const during = await win.webContents.executeJavaScript(`(() => ({
    visible: !document.getElementById('shop-product-save-progress').hidden,
    title: document.getElementById('shop-product-save-title').textContent,
    percent: document.getElementById('shop-product-save-percent').textContent,
    stage: document.getElementById('shop-product-save-stage').textContent,
    steps: document.querySelectorAll('#shop-product-save-steps span').length
  }))()`);
  await wait(2200);
  const after = await win.webContents.executeJavaScript(`({ hidden: document.getElementById('shop-product-save-progress').hidden })`);
  const passed = during.visible && during.steps === 5 && after.hidden && errors.length === 0;
  console.log(JSON.stringify({ passed, newsletterLayout, during, after, errors, screenshots: { newsletterPath, progressPath } }, null, 2));
  await win.destroy();
  app.exit(passed ? 0 : 1);
}).catch(error => { console.error(error); app.exit(1); });
