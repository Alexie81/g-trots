const { app, BrowserWindow } = require('electron');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForCatalog(win) {
  const started = Date.now();
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const state = await win.webContents.executeJavaScript(`(() => ({ loading: document.getElementById('product-grid')?.classList.contains('is-catalog-loading'), cards: document.querySelectorAll('.product-card').length }))()`);
    if (!state.loading && state.cards > 0) return { milliseconds: Date.now() - started, cards: state.cards };
    await wait(20);
  }
  throw new Error('Catalogul nu a devenit vizibil în 5 secunde.');
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadURL('http://localhost:4173/magazin.html');
  await win.webContents.executeJavaScript(`localStorage.removeItem('g-trots:catalog-compact:v1')`);
  await win.reload();
  const firstVisit = await waitForCatalog(win);
  await wait(2500);
  await win.reload();
  const cachedVisit = await waitForCatalog(win);
  process.stdout.write(JSON.stringify({ firstVisit, cachedVisit }, null, 2));
  win.destroy();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
