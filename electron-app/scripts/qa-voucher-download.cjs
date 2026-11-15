// Exercise the actual renderer download (not an anchor mock), then rename the
// resulting PDF. Keep all generated files in a unique diagnostic folder.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const output = fs.mkdtempSync(path.join(app.getPath('temp'), 'gt-voucher-'));
const report = path.resolve(__dirname, '../../reports/consumables-local/download-rename-result.json');
const fixture = process.argv[2] || path.resolve(__dirname, '../../reports/consumables-local/live-bon-individual.pdf');
const original = fs.readFileSync(fixture);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
app.setPath('userData', path.join(output, 'profile'));
const timeout = setTimeout(() => { console.error('Download timed out'); app.exit(1); }, 20000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  const fileName = 'Bon-de-consum-BC-1 - fact. ZUZ_1121 din 28.09.2026.pdf';
  const savedPath = path.join(output, fileName);
  const completed = new Promise((resolve, reject) => {
    win.webContents.session.once('will-download', (_event, item) => {
      try { assert.equal(item.getFilename(), fileName); } catch (error) { reject(error); return; }
      item.setSavePath(savedPath);
      item.once('done', (_event, state) => state === 'completed' ? resolve() : reject(new Error(state)));
    });
  });
  await win.loadURL('about:blank');
  const source = fs.readFileSync(path.resolve(__dirname, '../renderer/js/shop-consumables.js'), 'utf8');
  assert(source.includes('window.GTrotsConsumables={page,modals,init,load,openCreate};'));
  await win.webContents.executeJavaScript(source.replace('window.GTrotsConsumables={page,modals,init,load,openCreate};', 'window.qaDownload=saveDownload;'));
  await win.webContents.executeJavaScript(`window.qaDownload(${JSON.stringify({file_name:fileName,mime_type:'application/pdf',content_base64:original.toString('base64')})})`);
  await completed;
  assert.equal(hash(fs.readFileSync(savedPath)), hash(original));
  const results = [];
  let current = savedPath;
  for (const length of [100, 150, 180]) {
    const label = 'Bon de consum BC 1 - nume lung verificat ';
    const name = label + 'a'.repeat(length - label.length - 4) + '.pdf';
    const target = path.join(output, name);
    fs.renameSync(current, target);
    assert.equal(hash(fs.readFileSync(target)), hash(original));
    results.push({ nameLength: name.length, pathLength: target.length, renamed: true, sameBytes: true });
    current = target;
  }
  // A second rename back to the original readable name must also succeed.
  const shortPath = path.join(output, fileName);
  fs.renameSync(current, shortPath);
  const result = { success:true, output, originalBytes:original.length, originalNameLength:fileName.length, downloadedSha256:hash(original), results };
  fs.writeFileSync(report, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  clearTimeout(timeout);
  win.destroy();
  app.quit();
}).catch(error => { fs.writeFileSync(report, JSON.stringify({ success:false, error:String(error.stack) })); console.error(error); app.exit(1); });
