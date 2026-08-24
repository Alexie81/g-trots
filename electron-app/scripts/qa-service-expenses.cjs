const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(win, expression, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`Timeout waiting for ${expression}`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 960,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true,
      offscreen: true,
      backgroundThrottling: false,
    },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('app-update') && !message.includes('Content-Security-Policy')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await waitFor(win, 'window.AUTH && window.API && window.switchTab');
  await win.webContents.executeJavaScript(`window.AUTH.login('admin', 'admin')`);
  await waitFor(win, 'window.AUTH.isLoggedIn()');
  await win.webContents.executeJavaScript(`window.switchTab('service')`);
  await waitFor(win, `document.querySelector('.service-table-row')`);
  await win.webContents.executeJavaScript(`document.querySelector('.service-table-row').click()`);
  await waitFor(win, `document.querySelector('#service-sheet-modal.visible') && document.querySelector('.service-expense-editor')`);
  await sleep(900);

  await win.webContents.executeJavaScript(`(() => {
    const editor = document.querySelector('.service-expense-editor');
    editor.scrollIntoView({ block: 'center' });
    document.querySelector('#service-expense-add-toggle')?.click();
  })()`);
  await sleep(300);

  const metrics = await win.webContents.executeJavaScript(`(() => {
    const generic = document.querySelector('#ss-internal-other-costs');
    const editor = document.querySelector('.service-expense-editor');
    const optionCount = document.querySelectorAll('.service-expense-option').length;
    const selectedCount = document.querySelectorAll('.service-expense-row').length;
    const rect = editor.getBoundingClientRect();
    return {
      genericInputHidden: generic?.type === 'hidden',
      editorVisible: rect.width > 0 && rect.height > 0,
      editorInsideModalWidth: rect.left >= document.querySelector('.service-modal-card').getBoundingClientRect().left && rect.right <= document.querySelector('.service-modal-card').getBoundingClientRect().right,
      optionCount,
      selectedCount,
      syncMessageVisible: editor.textContent.includes('se salveaza in client'),
    };
  })()`);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-service-expenses');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'desktop-service-expenses.png');
  win.webContents.invalidate();
  await sleep(200);
  fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG());

  console.log(JSON.stringify({ ...metrics, errors, screenshotPath }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
