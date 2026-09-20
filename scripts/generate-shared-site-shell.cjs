const fs = require('fs');
const path = require('path');

const websiteRoot = path.resolve(__dirname, '..', 'website');
const footerVersion = '20260920-public-theme-v11';
const themeVersion = '20260920-public-theme-v11';
const themeStyleVersion = '20260920-opaque-accordions-v1';
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
    .replace(/((?:src|href)=["']\/?produs\.(?:js|css))(?:\?[^"']*)?/gi, '$1?v=20260920-related-drag-v1')
    .replace(/<link\b[^>]*href=["']\/legal-footer\.css(?:\?[^"']*)?["'][^>]*>\s*/gi, '')
    .replace(/\/legal\.css(?:\?[^"']*)?/gi, `/legal.css?v=${legalCssVersion}`);

  const themeScriptPattern = /<script\b[^>]*src=["']\/theme\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/gi;
  const themeStylePattern = /<link\b[^>]*href=["']\/theme\.css(?:\?[^"']*)?["'][^>]*>\s*/gi;
  const themeBootstrapScriptPattern = /<script\b[^>]*id=["']gt-theme-bootstrap["'][^>]*>[\s\S]*?<\/script>\s*/gi;
  const themeBootstrapStylePattern = /<style\b[^>]*id=["']gt-theme-critical["'][^>]*>[\s\S]*?<\/style>\s*/gi;
  const themeBootstrap = `<script id="gt-theme-bootstrap">(()=>{const r=document.documentElement;try{const k='g-trots-color-theme-v1',s=localStorage.getItem(k),t=s==='light'||s==='dark'?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');r.dataset.theme=t;r.style.colorScheme=t}catch{const t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';r.dataset.theme=t;r.style.colorScheme=t}if(location.pathname.includes('/magazin/produs/')){r.classList.add('gt-product-booting');addEventListener('DOMContentLoaded',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>r.classList.remove('gt-product-booting'))),{once:true});setTimeout(()=>r.classList.remove('gt-product-booting'),3000)}})();</script>\n<style id="gt-theme-critical">html[data-theme="light"],html[data-theme="light"] body{background:#f7f8fb;color:#171b24}html[data-theme="dark"],html[data-theme="dark"] body{background:#071a36;color:#f7f9ff}html.gt-product-booting body{opacity:0!important}html[data-theme="light"] .product-static-seo,html[data-theme="light"] .product-static-seo img{background:#fff!important;color:#171b24!important}html[data-theme="dark"] .product-static-seo,html[data-theme="dark"] .product-static-seo img{background:#0c274d!important;color:#f7f9ff!important}html[data-theme="light"] body.contact-body{background:#f7f8fb!important;color:#171b24!important}html[data-theme="light"] .contact-stage{background:radial-gradient(circle at 18% 34%,rgba(255,133,0,.13),transparent 29rem),linear-gradient(132deg,#fffaf5,#fff 55%,#f7f9fc)!important}html[data-theme="light"] .contact-whatsapp{background:rgba(255,255,255,.96)!important;color:#171b24!important}html[data-theme="light"] .contact-scooter{opacity:.18!important}</style>`;
  const themeScript = `<script src="/theme.js?v=${themeVersion}"></script>`;
  const themeStyle = `<link rel="stylesheet" href="/theme.css?v=${themeStyleVersion}">`;
  html = html
    .replace(themeBootstrapScriptPattern, '')
    .replace(themeBootstrapStylePattern, '')
    .replace(themeScriptPattern, '')
    .replace(themeStylePattern, '');
  if (/<meta\b[^>]*charset\s*=\s*["'][^"']+["'][^>]*>/i.test(html)) {
    html = html.replace(/<meta\b[^>]*charset\s*=\s*["'][^"']+["'][^>]*>/i, match => `${match}\n    ${themeBootstrap}`);
  } else if (/<head\b[^>]*>/i.test(html)) {
    html = html.replace(/<head\b[^>]*>/i, match => `${match}\n    ${themeBootstrap}`);
  } else {
    html = `${themeBootstrap}${html}`;
  }
  html = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `  ${themeScript}\n  ${themeStyle}\n</head>`)
    : `${themeScript}${themeStyle}${html}`;

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
  process.stdout.write(JSON.stringify({ files: files.length, updated, unchanged, skipped, footerVersion, themeVersion, legalCssVersion }, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
