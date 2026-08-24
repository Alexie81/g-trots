const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const requestedWidth = Math.max(720, Number(process.argv[2]) || 1509);
const requestedHeight = Math.max(560, Number(process.argv[3]) || 812);

async function waitFor(win, expression, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await win.webContents.executeJavaScript(Boolean(expression) ? `Boolean(${expression})` : 'true')) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Timeout waiting for ${expression}`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: requestedWidth,
    height: requestedHeight,
    minWidth: 720,
    minHeight: 560,
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
    if (level >= 2 && !message.includes('app-update')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await waitFor(win, 'window.AUTH && window.API && window.switchTab');
  await win.webContents.executeJavaScript(`window.AUTH.login('admin', 'admin')`);
  await waitFor(win, 'window.AUTH && window.AUTH.isLoggedIn()');
  await win.webContents.executeJavaScript(`window.switchTab('service')`);
  await waitFor(win, `document.querySelector('.service-table-row')`);
  await win.webContents.executeJavaScript(`document.querySelector('.service-table-row').click()`);
  await waitFor(win, `document.querySelector('#service-sheet-modal.visible')`);
  await win.webContents.executeJavaScript(`(() => {
    const startup = document.getElementById('startup-loader');
    const auth = document.getElementById('auth-overlay');
    if (startup) startup.style.display = 'none';
    if (auth) auth.style.display = 'none';
  })()`);
  await sleep(500);

  const metrics = await win.webContents.executeJavaScript(`(() => {
    const modal = document.querySelector('.service-modal-card');
    const header = document.querySelector('.service-modal-card .service-editor-header');
    const title = document.querySelector('.service-modal-card .service-editor-header h2');
    const actions = document.querySelector('.service-modal-card .service-editor-actions');
    const buttons = [...actions.querySelectorAll('button')];
    const rows = [...new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)))];
    const modalRect = modal.getBoundingClientRect();
    const actionRect = actions.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      modal: {
        left: Math.round(modalRect.left),
        right: Math.round(modalRect.right),
        top: Math.round(modalRect.top),
        bottom: Math.round(modalRect.bottom),
      },
      headerDisplay: getComputedStyle(header).display,
      headerColumns: getComputedStyle(header).gridTemplateColumns,
      title: {
        text: title.textContent.trim(),
        width: Math.round(title.getBoundingClientRect().width),
        scrollWidth: title.scrollWidth,
        height: Math.round(title.getBoundingClientRect().height),
        lineHeight: getComputedStyle(title).lineHeight,
        whiteSpace: getComputedStyle(title).whiteSpace,
      },
      actions: {
        width: Math.round(actionRect.width),
        right: Math.round(actionRect.right),
        rows: rows.length,
        buttons: buttons.length,
      },
      modalInsideViewport: modalRect.left >= 0 && modalRect.right <= innerWidth && modalRect.top >= 0 && modalRect.bottom <= innerHeight,
      bodyHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-responsive');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, `service-modal-responsive-${requestedWidth}.png`);
  win.webContents.invalidate();
  await sleep(250);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log(JSON.stringify({ ...metrics, errors, screenshotPath }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
