const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "website", "produs.html"), "utf8");
const css = fs.readFileSync(path.join(root, "website", "produs.css"), "utf8");
const theme = fs.readFileSync(path.join(root, "website", "theme.css"), "utf8");

function expect(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

expect(html, /produs\.css\?[^"']*expand=20261015-v1/, "Product CSS cache key is missing");
expect(html, /theme\.css\?v=20261001-product-content-v4&amp;expand=20261015-v1/, "Theme CSS cache key is missing");
expect(css, /\.product-expand-toggle\s*\{[\s\S]*?width:\s*min\(100%,\s*16rem\)[\s\S]*?border-radius:\s*999px/, "Expand control is not a prominent pill button");
expect(css, /\.product-expand-toggle i\s*\{[\s\S]*?background:\s*linear-gradient\(135deg,\s*#ff9a22,\s*var\(--orange\)\)/, "Expand control icon does not have the orange action treatment");
expect(css, /\.product-expand-toggle i::before\s*\{[\s\S]*?border-right:\s*2px solid currentColor/, "Expand control chevron is missing");
expect(css, /\.product-expand-toggle\[aria-expanded="true"\] i::before/, "Expanded control state is missing");
expect(theme, /html\[data-theme="light"\] \.product-expand-toggle\s*\{[\s\S]*?background:\s*linear-gradient/, "Light theme treatment is missing");
expect(theme, /html\[data-theme="dark"\] \.product-expand-toggle/, "Dark theme treatment is missing");
expect(theme, /html\[data-theme="dark"\] \.product-purchase-details \.product-detail-fit\s*\{[\s\S]*?inset 3px 0 0 #ff8500/, "Dark manufacturer card accent is missing");
expect(theme, /html\[data-theme="dark"\] \.product-purchase-details \.product-detail-fit > span\s*\{[\s\S]*?color:\s*#ffb45f/, "Dark manufacturer label contrast is missing");
expect(theme, /html\[data-theme="dark"\] \.product-purchase-details \.product-detail-fit b\s*\{[\s\S]*?color:\s*#fff6ec/, "Dark manufacturer badge contrast is missing");

console.log("Product expand toggle prominence checks passed.");
