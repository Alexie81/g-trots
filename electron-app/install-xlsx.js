// xlsx.full.min.js placeholder - run: node install-xlsx.js
// This script copies xlsx from node_modules after npm install

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js');
const dst = path.join(__dirname, 'renderer', 'js', 'xlsx.full.min.js');

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dst);
  console.log('xlsx.full.min.js copied to renderer/js/');
} else {
  console.error('Run npm install first!');
  process.exit(1);
}
