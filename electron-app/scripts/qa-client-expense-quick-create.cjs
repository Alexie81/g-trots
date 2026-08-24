const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(win, expression, timeoutMs = 20000) {
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
    if (level >= 2 && !message.includes('app-update')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await waitFor(win, 'window.AUTH && window.API && window.switchTab');
  await win.webContents.executeJavaScript(`window.AUTH.login('admin', 'admin')`);
  await waitFor(win, 'window.AUTH.isLoggedIn()');
  await win.webContents.executeJavaScript(`window.switchTab('clients')`);
  await waitFor(win, `document.querySelector('#clients-add-btn')`);
  await win.webContents.executeJavaScript(`document.querySelector('#clients-add-btn').click()`);
  await waitFor(win, `document.querySelector('#client-action-form')`);
  await win.webContents.executeJavaScript(`document.querySelector('#client-expense-add-toggle').click()`);
  await waitFor(win, `!document.querySelector('#client-expense-picker').hidden`);
  await win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#client-expense-search');
    input.value = 'Consumabile test QA';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(win, `document.querySelector('.client-expense-create-option')`);
  await win.webContents.executeJavaScript(`document.querySelector('.client-expense-create-option').click()`);
  await waitFor(win, `!document.querySelector('#client-expense-create-panel').hidden`);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-client-expense');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'desktop-expense-create-panel.png');
  win.webContents.invalidate();
  await sleep(250);
  fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`(() => {
    window.API.createExpenseCategory = async (_token, payload) => ({
      id: 'qa-expense-local',
      name: payload.name,
      color: payload.color,
      created_at: new Date().toISOString(),
    });
    document.querySelector('.client-expense-color-option[data-color="#8B5CF6"]').click();
    document.querySelector('#client-expense-create-save').click();
  })()`);
  await waitFor(win, `document.querySelector('.client-expense-cost-input[data-expense-id="qa-expense-local"]')`);

  const metrics = await win.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('.client-expense-cost-input[data-expense-id="qa-expense-local"]')?.closest('.client-expense-editor-row');
    const modal = document.querySelector('.client-action-modal');
    const modalRect = modal.getBoundingClientRect();
    return {
      createdRowName: row?.querySelector('strong')?.textContent?.trim(),
      selectedColor: row?.querySelector('i')?.style.getPropertyValue('--collaborator-color'),
      pickerClosedAfterCreate: document.querySelector('#client-expense-picker').hidden,
      modalInsideViewport: modalRect.left >= 0 && modalRect.right <= innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);

  console.log(JSON.stringify({ ...metrics, errors, screenshotPath }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
