const fs = require('fs');
const path = require('path');

const websiteRoot = path.resolve(__dirname, '..', 'website');
const footerVersion = '20260905-17';
const legalCssVersion = '20260905-3';
const concurrency = 4;

async function collectHtmlFiles(directory) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectHtmlFiles(target));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(target);
  }
  return files;
}

function updateHtml(source) {
  if (!/<body(?:\s|>)/i.test(source)) return source;
  let html = source
    .replace(/<link\b[^>]*href=["']\/legal-footer\.css(?:\?[^"']*)?["'][^>]*>\s*/gi, '')
    .replace(/\/legal\.css(?:\?[^"']*)?/gi, `/legal.css?v=${legalCssVersion}`);

  const sharedFooterPattern = /<script\b[^>]*src=["']\/legal-footer\.js(?:\?[^"']*)?["'][^>]*><\/script>/gi;
  const matches = html.match(sharedFooterPattern) || [];
  const sharedFooter = `<script src="/legal-footer.js?v=${footerVersion}" defer></script>`;
  if (matches.length) {
    let kept = false;
    html = html.replace(sharedFooterPattern, () => {
      if (kept) return '';
      kept = true;
      return sharedFooter;
    });
  } else {
    html = html.replace(/<\/body>/i, `${sharedFooter}</body>`);
  }
  return html;
}

async function run() {
  const files = await collectHtmlFiles(websiteRoot);
  let cursor = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++];
      const source = await fs.promises.readFile(file, 'utf8');
      const next = updateHtml(source);
      if (next === source) {
        if (/<body(?:\s|>)/i.test(source)) unchanged++;
        else skipped++;
        continue;
      }
      await fs.promises.writeFile(file, next, 'utf8');
      updated++;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  process.stdout.write(JSON.stringify({ files: files.length, updated, unchanged, skipped, footerVersion, legalCssVersion }, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
