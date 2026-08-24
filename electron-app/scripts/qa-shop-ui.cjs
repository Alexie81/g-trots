const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 560,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('app-update') && !message.includes('Failed to fetch')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const categories = [
      { id:'c1', parent_id:null, parent_name:null, name:'Electronice', slug:'electronice', description:'Catalog principal', thumbnail_url:null, is_active:true },
      { id:'c2', parent_id:'c1', parent_name:'Electronice', name:'Telefoane', slug:'telefoane', description:'Telefoane mobile', thumbnail_url:null, is_active:true },
      { id:'c3', parent_id:'c2', parent_name:'Telefoane', name:'Android', slug:'android', description:'Nivelul trei', thumbnail_url:null, is_active:true }
    ];
    window.SHOP_API = {
      listCategories: async () => categories,
      listBrands: async () => [{ id:'b1', name:'Apple', slug:'apple', website_url:'https://apple.com', is_active:true }],
      listManufacturers: async () => [{ id:'m1', name:'Bosch', slug:'bosch', website_url:'https://bosch.com', is_active:true }],
      createCategory: async (value) => value, updateCategory: async (_id, value) => value, deleteCategory: async () => ({success:true}),
      createBrand: async (value) => value, updateBrand: async (_id, value) => value, deleteBrand: async () => ({success:true}),
      createManufacturer: async (value) => value, updateManufacturer: async (_id, value) => value, deleteManufacturer: async () => ({success:true})
    };
    window.selectAppModule('shop');
    window.switchTab('shop-categories');
  })()`);
  await sleep(450);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-shop');
  fs.mkdirSync(outputDir, { recursive: true });
  const desktopPath = path.join(outputDir, 'shop-categories-desktop.png');
  fs.writeFileSync(desktopPath, (await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`document.getElementById('shop-category-add').click()`);
  await sleep(180);
  const modalPath = path.join(outputDir, 'shop-category-popup.png');
  fs.writeFileSync(modalPath, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('[data-shop-modal-close="shop-category-modal"]').click()`);
  await win.webContents.executeJavaScript(`window.switchTab('shop-manufacturers')`);
  await sleep(180);
  win.setSize(720, 760);
  await sleep(250);
  const compactPath = path.join(outputDir, 'shop-manufacturers-compact.png');
  fs.writeFileSync(compactPath, (await win.webContents.capturePage()).toPNG());

  const metrics = await win.webContents.executeJavaScript(`(() => ({
    categoryRows: document.querySelectorAll('#shop-category-table-body tr').length,
    manufacturerRows: document.querySelectorAll('#shop-manufacturer-table-body tr').length,
    parentOptions: document.querySelectorAll('#shop-category-parent option').length,
    activePanel: document.querySelector('.tab-panel.active')?.id || '',
    tabs: document.querySelectorAll('#tab-shop-manufacturers .shop-catalog-tabs button').length,
    bodyHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    popupHidden: document.getElementById('shop-category-modal').hidden,
  }))()`);

  console.log(JSON.stringify({ ...metrics, errors, screenshots: { desktopPath, modalPath, compactPath } }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
