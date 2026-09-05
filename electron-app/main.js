const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let whatsappWindow = null;
let updateCheckInFlight = false;
let updateDownloadInFlight = false;
let updateCheckTimer = null;
const updateStartupTimers = [];
const updateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: '',
  percent: 0,
  message: 'Poti verifica daca exista o versiune noua.',
};

// Hardware acceleration is essential for the blurred/translucent desktop UI.
// Keep an explicit safe-mode escape hatch for PCs with problematic GPU drivers:
// launch with --disable-gpu or set GTROTS_DISABLE_GPU=1.
const useSoftwareRendering =
  process.argv.includes('--disable-gpu')
  || process.env.GTROTS_DISABLE_GPU === '1';
if (useSoftwareRendering) {
  app.disableHardwareAcceleration();
}

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    const bounds = state?.bounds;
    if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return {};
    const visible = screen.getAllDisplays().some(({ workArea }) => (
      bounds.x < workArea.x + workArea.width
      && bounds.x + bounds.width > workArea.x
      && bounds.y < workArea.y + workArea.height
      && bounds.y + bounds.height > workArea.y
    ));
    return visible ? state : {};
  } catch (_error) {
    return {};
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const state = {
    bounds: win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds(),
    maximized: win.isMaximized(),
    fullScreen: win.isFullScreen(),
  };
  try {
    fs.writeFileSync(windowStatePath(), JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    log.warn('[G-Trots window state]', error?.message || error);
  }
}

function normalizeWhatsAppPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) digits = `40${digits.slice(1)}`;
  if (digits.length === 9) digits = `40${digits}`;
  return digits;
}

function getWhatsAppWindow() {
  if (whatsappWindow && !whatsappWindow.isDestroyed()) return whatsappWindow;
  whatsappWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: true,
    title: 'G-Trots - WhatsApp',
    autoHideMenuBar: true,
    backgroundColor: '#10100f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  whatsappWindow.on('closed', () => {
    whatsappWindow = null;
  });
  return whatsappWindow;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWhatsAppChat(win, timeoutMs = 70000) {
  const started = Date.now();
  let sawQr = false;
  while (!win.isDestroyed() && Date.now() - started < timeoutMs) {
    const state = await win.webContents.executeJavaScript(`
      (() => {
        const text = document.body?.innerText || '';
        const hasQr = /Use WhatsApp on your computer|Conecteaza|Conectează|Scan|QR/i.test(text)
          && !!document.querySelector('canvas, [data-testid="qrcode"]');
        const hasComposer = !!document.querySelector('[contenteditable="true"][role="textbox"], footer [contenteditable="true"]');
        const hasAttach = !!document.querySelector('[aria-label="Attach"], [title="Attach"], [aria-label="Ataseaza"], [aria-label="Atașează"], span[data-icon="plus"], span[data-icon="attach-menu-plus"]');
        return { hasQr, hasComposer, hasAttach, title: document.title || '', url: location.href };
      })()
    `, true).catch(() => ({ hasQr: false, hasComposer: false, hasAttach: false }));
    if (state.hasComposer || state.hasAttach) return { ready: true };
    if (state.hasQr) sawQr = true;
    await sleep(1000);
  }
  return { ready: false, needsLogin: sawQr, timeout: !sawQr };
}

async function attachAndSendWhatsAppDocument(win, { filename, caption, base64 }) {
  return win.webContents.executeJavaScript(`
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const clickElement = (element) => {
        if (!element) return false;
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      };
      const closestButton = (element) => element?.closest?.('button, [role="button"], div[tabindex]') || element;
      const findDocumentInput = () => {
        const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
        return inputs.find((input) => {
          const accept = String(input.accept || '').toLowerCase();
          return accept.includes('pdf') || accept.includes('application') || accept === '*' || accept === '';
        }) || inputs[inputs.length - 1] || null;
      };
      const findAttachButton = () => {
        const direct = document.querySelector('[aria-label="Attach"], [title="Attach"], [aria-label="Ataseaza"], [aria-label="Atașează"]');
        if (direct) return closestButton(direct);
        const icon = document.querySelector('span[data-icon="plus"], span[data-icon="attach-menu-plus"], span[data-icon="clip"]');
        return closestButton(icon);
      };

      let input = findDocumentInput();
      if (!input) {
        clickElement(findAttachButton());
        await sleep(700);
        input = findDocumentInput();
      }
      if (!input) {
        return { success: false, error: 'Nu gasesc selectorul pentru documente in WhatsApp Web.' };
      }

      const binary = atob(${JSON.stringify(base64)});
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], ${JSON.stringify(filename)}, { type: 'application/pdf' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      await sleep(2600);

      const captionText = ${JSON.stringify(caption || '')};
      if (captionText) {
        const boxes = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"], [contenteditable="true"]'));
        const captionBox = boxes[boxes.length - 1];
        if (captionBox) {
          captionBox.focus();
          document.execCommand('insertText', false, captionText);
          await sleep(400);
        }
      }

      let sendButton = null;
      for (let i = 0; i < 20; i += 1) {
        const label = document.querySelector('[aria-label="Send"], [aria-label="Trimite"]');
        const icon = document.querySelector('span[data-icon="send"], span[data-icon="wds-ic-send-filled"]');
        sendButton = closestButton(label || icon);
        if (sendButton) break;
        await sleep(500);
      }
      if (!sendButton) {
        return { success: false, attached: true, error: 'PDF-ul pare atasat, dar nu gasesc butonul Send. Apasa manual Trimite in WhatsApp.' };
      }
      clickElement(sendButton);
      await sleep(800);
      return { success: true, sent: true };
    })()
  `, true);
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  const savedState = readWindowState();
  const win = new BrowserWindow({
    width: savedState.bounds?.width || 1280,
    height: savedState.bounds?.height || 820,
    x: savedState.bounds?.x,
    y: savedState.bounds?.y,
    minWidth: 720,
    minHeight: 560,
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#080706',
    title: 'G-Trots CRM',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow = win;

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      if (savedState.maximized) win.maximize();
      if (savedState.fullScreen) win.setFullScreen(true);
      win.show();
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('rendering-mode', {
        software: useSoftwareRendering,
      });
    }
  });

  win.webContents.on('did-fail-load', () => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[G-Trots] Renderer process stopped:', details.reason, details.exitCode);
  });

  let saveStateTimer = null;
  const scheduleStateSave = () => {
    clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(() => saveWindowState(win), 180);
  };
  win.on('resize', scheduleStateSave);
  win.on('move', scheduleStateSave);
  win.on('maximize', scheduleStateSave);
  win.on('unmaximize', scheduleStateSave);
  win.on('enter-full-screen', scheduleStateSave);
  win.on('leave-full-screen', scheduleStateSave);
  win.on('close', () => saveWindowState(win));
  win.on('closed', () => {
    clearTimeout(saveStateTimer);
    if (mainWindow === win) mainWindow = null;
  });
}

app.on('child-process-gone', (_event, details) => {
  console.error('[G-Trots] Child process stopped:', details.type, details.reason, details.exitCode);
});

// Handle save-file dialog for Excel export
ipcMain.handle('save-excel', async (_event, { defaultName, buffer }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { success: false };
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return { success: true, filePath };
});

ipcMain.handle('save-pdf', async (_event, { defaultName, buffer }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { success: false };
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return { success: true, filePath };
});

function safeDownloadedName(value, fallback = 'document') {
  return String(value || fallback).replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, ' ').trim() || fallback;
}

async function fetchLegacyNirAttachment(url) {
  const parsed = new URL(String(url || ''));
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'g-trots.ro' || !/^\/shop-api\/uploads\/nir\/\d{4}\/\d{2}\/[a-f0-9]+\.[a-z0-9]+$/i.test(parsed.pathname)) {
    throw new Error('Adresa documentului nu este permisă.');
  }
  const response = await fetch(parsed.toString(), { redirect: 'error' });
  if (!response.ok) throw new Error(`Documentul nu mai este disponibil (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

ipcMain.handle('save-remote-files', async (_event, { files }) => {
  const requested = Array.isArray(files) ? files.filter(file => file?.url) : [];
  if (!requested.length) return { success: false, error: 'Nu există documente de descărcat.' };
  if (requested.length === 1) {
    const fileName = safeDownloadedName(requested[0].fileName, 'document');
    const selection = await dialog.showSaveDialog({ defaultPath: fileName });
    if (selection.canceled || !selection.filePath) return { success: false, canceled: true };
    fs.writeFileSync(selection.filePath, await fetchLegacyNirAttachment(requested[0].url));
    return { success: true, count: 1, path: selection.filePath };
  }
  const selection = await dialog.showOpenDialog({ title: 'Alege folderul pentru documentele NIR', properties: ['openDirectory', 'createDirectory'] });
  if (selection.canceled || !selection.filePaths?.[0]) return { success: false, canceled: true };
  const destination = selection.filePaths[0];
  const used = new Set();
  const savedPaths = [];
  for (const [index, file] of requested.entries()) {
    const original = safeDownloadedName(file.fileName, `document-${index + 1}`);
    const extension = path.extname(original);
    const base = path.basename(original, extension);
    let candidate = original;
    let suffix = 2;
    while (used.has(candidate.toLowerCase()) || fs.existsSync(path.join(destination, candidate))) candidate = `${base}-${suffix++}${extension}`;
    used.add(candidate.toLowerCase());
    const savedPath = path.join(destination, candidate);
    fs.writeFileSync(savedPath, await fetchLegacyNirAttachment(file.url));
    savedPaths.push(savedPath);
  }
  shell.showItemInFolder(savedPaths[0]);
  return { success: true, count: requested.length, path: destination };
});

function safePdfName(defaultName) {
  const rawName = String(defaultName || 'fisa-service.pdf')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'fisa-service.pdf';
  return rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`;
}

ipcMain.handle('prepare-pdf-attachment', async (_event, { defaultName, buffer }) => {
  const fileName = safePdfName(defaultName);
  const dir = path.join(app.getPath('temp'), 'G-Trots', 'service-sheets');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  clipboard.writeText(filePath);
  shell.showItemInFolder(filePath);
  return { success: true, filePath };
});

ipcMain.handle('send-whatsapp-document', async (_event, { phone, caption, filename, buffer }) => {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone || normalizedPhone.length < 10 || normalizedPhone.length > 15) {
    return { success: false, error: 'Numarul clientului nu este valid pentru WhatsApp.' };
  }
  const fileName = safePdfName(filename || 'fisa-service.pdf');
  const bytes = Buffer.from(buffer || []);
  if (bytes.length < 100) {
    return { success: false, error: 'PDF-ul generat este gol sau invalid.' };
  }
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    whatsappWindow.close();
  }
  const dir = path.join(app.getPath('temp'), 'G-Trots', 'service-sheets');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, bytes);
  clipboard.writeText(filePath);
  shell.showItemInFolder(filePath);

  const encodedCaption = encodeURIComponent(String(caption || ''));
  const query = `phone=${encodeURIComponent(normalizedPhone)}${encodedCaption ? `&text=${encodedCaption}` : ''}`;
  const webUrl = `https://web.whatsapp.com/send?${query}&type=phone_number&app_absent=0`;
  const desktopUrl = `whatsapp://send?${query}`;
  let opened = 'browser';
  try {
    await shell.openExternal(webUrl);
  } catch (_error) {
    opened = 'desktop';
    await shell.openExternal(desktopUrl);
  }
  return {
    success: true,
    sent: false,
    manualAttach: true,
    opened,
    to: normalizedPhone,
    filePath,
    message: 'WhatsApp a fost deschis extern. PDF-ul este selectat in Explorer si calea lui este copiata pentru atasare.',
  };
});

function broadcastUpdateState(patch = {}) {
  Object.assign(updateState, patch, { currentVersion: app.getVersion() });
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('app-update-state', { ...updateState });
    }
  }
  return { ...updateState };
}

function setupAutoUpdater() {
  autoUpdater.logger = log;
  log.transports.file.level = 'info';
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.requestHeaders = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  };

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateState({
      status: 'checking',
      percent: 0,
      message: 'Se verifica daca exista o versiune noua...',
    });
  });

  autoUpdater.on('update-available', (info) => {
    updateCheckInFlight = false;
    updateDownloadInFlight = true;
    broadcastUpdateState({
      status: 'available',
      availableVersion: info.version || '',
      percent: 0,
      message: `Versiunea ${info.version} este disponibila. Descarcarea porneste automat.`,
    });
  });

  autoUpdater.on('update-not-available', () => {
    updateCheckInFlight = false;
    broadcastUpdateState({
      status: 'current',
      availableVersion: '',
      percent: 100,
      message: `Ai deja cea mai noua versiune (${app.getVersion()}).`,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    broadcastUpdateState({
      status: 'downloading',
      percent,
      message: `Se descarca actualizarea... ${percent.toFixed(0)}%`,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloadInFlight = false;
    broadcastUpdateState({
      status: 'downloaded',
      availableVersion: info.version || updateState.availableVersion,
      percent: 100,
      message: `Versiunea ${info.version || updateState.availableVersion} este pregatita pentru instalare.`,
    });
  });

  autoUpdater.on('error', (error) => {
    updateCheckInFlight = false;
    updateDownloadInFlight = false;
    log.error('[G-Trots updater]', error);
    broadcastUpdateState({
      status: 'error',
      percent: 0,
      message: error?.message || 'Actualizarea nu a putut fi verificata.',
    });
  });
}

function runAutomaticUpdateCheck(source = 'periodic') {
  if (!app.isPackaged || updateCheckInFlight || updateDownloadInFlight) return;
  if (['available', 'downloading', 'downloaded', 'installing'].includes(updateState.status)) return;
  updateCheckInFlight = true;
  autoUpdater.checkForUpdates().catch((error) => {
    updateCheckInFlight = false;
    log.warn(`[G-Trots updater ${source} check]`, error?.message || error);
  });
}

ipcMain.handle('app-update:get-state', () => ({ ...updateState, currentVersion: app.getVersion() }));

ipcMain.handle('app-update:check', async () => {
  if (!app.isPackaged) {
    return broadcastUpdateState({
      status: 'development',
      message: 'Verificarea update-ului functioneaza in aplicatia instalata.',
    });
  }
  if (updateCheckInFlight) return { ...updateState };
  updateCheckInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    updateCheckInFlight = false;
    return broadcastUpdateState({
      status: 'error',
      message: error?.message || 'Serverul de actualizari nu poate fi contactat.',
    });
  }
  return { ...updateState };
});

ipcMain.handle('app-update:download', async () => {
  if (updateDownloadInFlight || updateState.status === 'downloaded') return { ...updateState };
  if (updateState.status !== 'available') {
    return broadcastUpdateState({
      status: 'error',
      message: 'Verifica mai intai daca exista o versiune noua.',
    });
  }
  updateDownloadInFlight = true;
  broadcastUpdateState({
    status: 'downloading',
    percent: 0,
    message: 'Se pregateste descarcarea actualizarii...',
  });
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    updateDownloadInFlight = false;
    return broadcastUpdateState({
      status: 'error',
      message: error?.message || 'Actualizarea nu a putut fi descarcata.',
    });
  }
  return { ...updateState };
});

ipcMain.handle('app-update:install', () => {
  if (updateState.status !== 'downloaded') {
    return { success: false, message: 'Actualizarea nu este inca descarcata.' };
  }
  broadcastUpdateState({
    status: 'installing',
    percent: 100,
    message: 'Se instaleaza actualizarea. Aplicatia va reporni automat...',
  });
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return { success: true };
});

app.whenReady().then(() => {
  app.setAppUserModelId('ro.cabit.gtrots.desktop');
  setupAutoUpdater();
  createWindow();
  if (app.isPackaged) {
    // GitHub poate servi pentru câteva secunde metadatele vechi imediat după
    // publicarea unui release. Verificările scurte de după pornire elimină
    // dependența de butonul manual fără a întrerupe activitatea utilizatorului.
    [4000, 25000, 90000].forEach((delay, index) => {
      updateStartupTimers.push(setTimeout(() => runAutomaticUpdateCheck(`startup-${index + 1}`), delay));
    });
    updateCheckTimer = setInterval(() => {
      runAutomaticUpdateCheck('periodic');
    }, 5 * 60 * 1000);
  }
});
app.on('window-all-closed', () => {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateStartupTimers.splice(0).forEach(timer => clearTimeout(timer));
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
