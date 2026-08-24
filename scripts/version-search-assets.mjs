import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const websiteRoot = path.join(projectRoot, 'website');
const version = '20k-20260824';
const files = (await readdir(websiteRoot)).filter(name => name.endsWith('.html'));

let cursor = 0;
let updated = 0;

async function worker() {
  while (cursor < files.length) {
    const name = files[cursor++];
    const file = path.join(websiteRoot, name);
    const source = await readFile(file, 'utf8');
    const next = source
      .replaceAll('/search/dist/g-trots-search-widget.mjs"', `/search/dist/g-trots-search-widget.mjs?v=${version}"`)
      .replaceAll('/search-preload.mjs"', `/search-preload.mjs?v=${version}"`);

    if (next !== source) {
      await writeFile(file, next, 'utf8');
      updated += 1;
    }
  }
}

await Promise.all(Array.from({ length: 32 }, worker));
console.log(`Search asset version added to ${updated} HTML files.`);
