const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: true,
      backgroundThrottling: false,
    },
  });

  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('app-update')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    window.selectAppModule('shop');
  })()`);
  await sleep(400);

  const metrics = await win.webContents.executeJavaScript(`(() => {
    const activePanel = document.querySelector('.tab-panel.active');
    const activeModule = document.querySelector('[data-module-select].active');
    const shopNav = document.querySelector('[data-module-nav="shop"]');
    const serviceNav = document.querySelector('[data-module-nav="service"]');
    return {
      activePanel: activePanel?.id || '',
      activeModule: activeModule?.dataset.moduleSelect || '',
      shopNavigationVisible: !shopNav.hidden,
      serviceNavigationHidden: serviceNav.hidden,
      areaCards: document.querySelectorAll('[data-shop-open]').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-shop');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'shop-desktop.png');
  const image = await win.webContents.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());

  console.log(JSON.stringify({ ...metrics, errors, screenshotPath }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
