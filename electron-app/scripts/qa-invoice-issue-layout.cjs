'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1366,
    height: 768,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: true,
      backgroundThrottling: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setZoomFactor(1.08);
  await sleep(300);
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const modal = document.getElementById('shop-invoice-issue-modal');
    modal.hidden = false;
    modal.classList.add('visible');
    document.getElementById('shop-invoice-return-email-option').hidden = false;
    document.getElementById('shop-invoice-issue-order').textContent = 'GT-20260930-D748DBEC';
    document.getElementById('shop-invoice-issue-client').textContent = 'Suharu Ionuț';
    document.getElementById('shop-invoice-issue-total').textContent = '69,99 RON';
    document.getElementById('shop-invoice-issue-email').textContent = 'Doar PDF-ul va fi trimis la client@example.com';
    document.getElementById('shop-invoice-issue-return-email').textContent = 'PDF separat la client@example.com';
  })()`);

  const sizes = [
    { width: 1366, height: 728, name: 'laptop' },
    { width: 980, height: 650, name: 'compact' },
    { width: 720, height: 560, name: 'minimum' },
  ];
  const measurements = [];
  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-invoice-issue-layout');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const size of sizes) {
    win.setContentSize(size.width, size.height);
    await sleep(160);
    const metrics = await win.webContents.executeJavaScript(`(() => {
      const modal = document.querySelector('.shop-invoice-issue-modal');
      const body = document.querySelector('.shop-invoice-issue-body');
      const footer = modal.querySelector(':scope > footer');
      const rect = node => { const value = node.getBoundingClientRect(); return { top:Math.round(value.top), bottom:Math.round(value.bottom), height:Math.round(value.height) }; };
      const modalRect = rect(modal);
      const footerRect = rect(footer);
      return {
        viewportHeight: window.innerHeight,
        modal: modalRect,
        footer: footerRect,
        bodyClientHeight: body.clientHeight,
        bodyScrollHeight: body.scrollHeight,
        footerVisible: footerRect.top >= 0 && footerRect.bottom <= window.innerHeight,
        modalInsideViewport: modalRect.top >= 0 && modalRect.bottom <= window.innerHeight,
      };
    })()`);
    measurements.push({ ...size, ...metrics });
    if (size.name === 'compact') {
      fs.writeFileSync(path.join(outputDir, 'invoice-issue-compact.png'), (await win.webContents.capturePage()).toPNG());
    }
  }

  const failed = measurements.filter((entry) => !entry.footerVisible || !entry.modalInsideViewport);
  console.log(JSON.stringify({ ok: failed.length === 0, measurements, screenshot: path.join(outputDir, 'invoice-issue-compact.png') }, null, 2));
  await win.destroy();
  app.quit();
  if (failed.length) process.exitCode = 1;
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
