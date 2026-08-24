const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  ipcMain.handle('app-update:get-state', () => ({
    status: 'idle',
    currentVersion: '1.2.32',
    availableVersion: '',
    percent: 0,
  }));
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: true,
      backgroundThrottling: false,
    },
  });

  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('No handler registered') && !message.includes('Security Warning')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
  })()`);

  win.webContents.send('app-update-state', {
    status: 'downloading',
    currentVersion: '1.2.32',
    availableVersion: '1.2.33',
    percent: 47,
    message: 'Se descarca actualizarea... 47%',
  });
  await sleep(250);

  const downloadingMetrics = await win.webContents.executeJavaScript(`(() => {
    const card = document.getElementById('sidebar-update-card');
    return {
      visible: !card.hidden,
      status: card.dataset.status,
      disabled: card.disabled,
      title: document.getElementById('sidebar-update-title').textContent,
      message: document.getElementById('sidebar-update-message').textContent,
      progress: document.getElementById('sidebar-update-progress-fill').style.width,
    };
  })()`);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-updater');
  fs.mkdirSync(outputDir, { recursive: true });
  const downloadingScreenshot = path.join(outputDir, 'update-downloading.png');
  fs.writeFileSync(downloadingScreenshot, (await win.webContents.capturePage()).toPNG());

  win.webContents.send('app-update-state', {
    status: 'downloaded',
    currentVersion: '1.2.32',
    availableVersion: '1.2.33',
    percent: 100,
    message: 'Versiunea 1.2.33 este pregatita pentru instalare.',
  });
  await sleep(250);

  const readyScreenshot = path.join(outputDir, 'update-ready.png');
  fs.writeFileSync(readyScreenshot, (await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`(() => {
    window.__qaInstallCalled = false;
    window.desktopUpdater.install = async () => {
      window.__qaInstallCalled = true;
      return { success: true };
    };
    document.getElementById('sidebar-update-card').click();
  })()`);
  await sleep(150);

  const readyMetrics = await win.webContents.executeJavaScript(`(() => {
    const card = document.getElementById('sidebar-update-card');
    return {
      installCalled: window.__qaInstallCalled,
      statusAfterClick: card.dataset.status,
      titleAfterClick: document.getElementById('sidebar-update-title').textContent,
    };
  })()`);

  console.log(JSON.stringify({
    downloading: downloadingMetrics,
    ready: readyMetrics,
    errors,
    downloadingScreenshot,
    readyScreenshot,
  }, null, 2));

  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
