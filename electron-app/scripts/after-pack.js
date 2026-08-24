const fs = require('fs');
const path = require('path');

const KEEP_LOCALES = new Set(['en-US.pak', 'ro.pak']);

exports.default = async function afterPack(context) {
  const localesDir = path.join(context.appOutDir, 'locales');
  if (!fs.existsSync(localesDir)) return;

  for (const entry of fs.readdirSync(localesDir)) {
    if (KEEP_LOCALES.has(entry)) continue;
    const fullPath = path.join(localesDir, entry);
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } catch {
      // Nu blocam build-ul daca un fisier locale este tinut temporar de sistem.
    }
  }
};
