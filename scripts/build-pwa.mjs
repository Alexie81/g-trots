import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, 'dist');
const serviceWorkerPath = path.join(distRoot, 'pwa-sw.js');
const buildToken = '__GTROTS_PWA_BUILD__';

function runExpoExport() {
  const expoCli = path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [expoCli, 'export', '--platform', 'web', '--clear'], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Expo export failed (${signal || `exit ${code}`}).`));
    });
  });
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolutePath) : [absolutePath];
  }));
  return nested.flat();
}

async function fingerprintBuild() {
  const hash = createHash('sha256');
  const files = (await listFiles(distRoot))
    .filter((file) => path.resolve(file) !== path.resolve(serviceWorkerPath))
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    hash.update(path.relative(distRoot, file).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }

  return hash.digest('hex').slice(0, 16);
}

await runExpoExport();

const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
if (!serviceWorker.includes(buildToken)) {
  throw new Error(`Missing ${buildToken} in dist/pwa-sw.js.`);
}

const buildFingerprint = await fingerprintBuild();
await writeFile(serviceWorkerPath, serviceWorker.replaceAll(buildToken, buildFingerprint), 'utf8');
console.log(`PWA build fingerprint: ${buildFingerprint}`);
