import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const websiteRoot = path.join(projectRoot, 'website');
const version = '20260920-theme-v1';
const files = (await readdir(websiteRoot)).filter(name => name.endsWith('.html'));

let cursor = 0;
let updated = 0;

async function worker() {
  while (cursor < files.length) {
    const name = files[cursor++];
    const file = path.join(websiteRoot, name);
    const source = await readFile(file, 'utf8');
    const next = source
      .replace(/\/search\/dist\/g-trots-search-widget\.mjs(?:\?v=[^"']+)?(?=["'])/g, `/search/dist/g-trots-search-widget.mjs?v=${version}`)
      .replace(/\/search-preload\.mjs(?:\?v=[^"']+)?(?=["'])/g, `/search-preload.mjs?v=${version}`);

    if (next !== source) {
      await writeFile(file, next, 'utf8');
      updated += 1;
    }
  }
}

await Promise.all(Array.from({ length: 32 }, worker));
console.log(`Search asset version added to ${updated} HTML files.`);
