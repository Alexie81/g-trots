const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(win, expression, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timeout waiting for ${expression}`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 940,
    height: 760,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'qa-auth-preload.cjs'),
      partition: 'gtrots-auth-qa',
      offscreen: true,
      backgroundThrottling: false,
    },
  });

  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('app-update') && !message.includes('Security Warning')) errors.push(message);
  });

  const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
  await win.loadFile(indexPath);
  await waitFor(win, 'window.AUTH && document.getElementById("auth-overlay").classList.contains("auth-entered") && getComputedStyle(document.getElementById("startup-loader")).display === "none"');
  await win.webContents.executeJavaScript(`(() => {
    const username = document.getElementById('auth-username');
    const password = document.getElementById('auth-password');
    const remember = document.getElementById('auth-remember-me');
    username.value = 'qa-admin';
    password.value = 'qa-password';
    remember.checked = true;
    remember.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(180);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-auth');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'desktop-login-remember.png');
  fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`document.getElementById('auth-login-form').requestSubmit()`);
  await waitFor(win, 'window.AUTH.isLoggedIn()');
  const beforeRestart = await win.webContents.executeJavaScript(`({
    remember: localStorage.getItem('gtrots_auth_remember'),
    token: localStorage.getItem('gtrots_auth_token'),
    username: localStorage.getItem('gtrots_auth_remembered_username'),
    sessionToken: sessionStorage.getItem('gtrots_auth_token')
  })`);

  await win.reload();
  await waitFor(win, 'window.AUTH && window.AUTH.isLoggedIn()');
  const afterRestart = await win.webContents.executeJavaScript(`({
    loggedIn: window.AUTH.isLoggedIn(),
    username: window.AUTH.getUser()?.username,
    rememberChecked: document.getElementById('auth-remember-me').checked,
    overlayHidden: getComputedStyle(document.getElementById('auth-overlay')).display === 'none'
  })`);

  const passed = beforeRestart.remember === '1'
    && beforeRestart.token === 'qa-persistent-token'
    && beforeRestart.username === 'qa-admin'
    && !beforeRestart.sessionToken
    && afterRestart.loggedIn
    && afterRestart.username === 'qa-admin'
    && afterRestart.rememberChecked
    && afterRestart.overlayHidden
    && errors.length === 0;

  console.log(JSON.stringify({ passed, beforeRestart, afterRestart, errors, screenshotPath }, null, 2));
  await win.destroy();
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
