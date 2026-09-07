import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "g-trots-ga4-"));
const port = 9338;
const reportPath = resolve("reports/live-ga4-event-test.json");
const sleep = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function waitForDebugger() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const tabs = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const page = tabs.find(tab => tab.type === "page" && tab.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* Chrome pornește */ }
    await sleep(150);
  }
  throw new Error("Chrome debugging endpoint did not start.");
}

class CdpPage {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const callback = this.pending.get(message.id);
        if (callback) {
          this.pending.delete(message.id);
          if (message.error) callback.reject(new Error(message.error.message));
          else callback.resolve(message.result);
        }
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
    return result.result?.value;
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
    await this.waitFor("document.readyState === 'complete'", 20000);
  }

  async waitFor(expression, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(`Boolean(${expression})`)) return;
      } catch { /* navigare în curs */ }
      await sleep(150);
    }
    throw new Error(`Timeout waiting for ${expression}`);
  }

  close() {
    this.socket.close();
  }
}

function collectParameters(request) {
  const base = new URL(request.url);
  const batches = String(request.postData || "").split(/\r?\n/).filter(Boolean);
  if (!batches.length) batches.push("");
  return batches.map(batch => {
    const parameters = new URLSearchParams(base.search);
    for (const [key, value] of new URLSearchParams(batch)) parameters.set(key, value);
    return Object.fromEntries(parameters);
  });
}

let page;
const hits = [];
const checkpoints = [];
const googleRequests = [];

async function waitForEvent(name, count = 1, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (hits.filter(hit => hit.event === name).length >= count) return;
    await sleep(200);
  }
  throw new Error(`GA4 event not observed: ${name}; observed=${hits.map(hit => hit.event).join(",")}; requests=${googleRequests.slice(-8).join(" | ")}`);
}

async function checkpoint(name, callback) {
  const before = hits.length;
  await callback();
  checkpoints.push({ name, newEvents: hits.slice(before).map(hit => hit.event) });
}

try {
  const target = await waitForDebugger();
  page = new CdpPage(target.webSocketDebuggerUrl);
  await page.open();
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  page.on("Network.requestWillBeSent", ({ request }) => {
    if (/(?:google-analytics\.com|googletagmanager\.com|analytics\.google\.com)/i.test(request.url)) googleRequests.push(request.url);
    if (!/(?:google-analytics\.com|analytics\.google\.com)\/g\/collect/i.test(request.url)) return;
    for (const parameters of collectParameters(request)) {
      if (!parameters.en) continue;
      hits.push({
        event: parameters.en,
        measurementId: parameters.tid || "",
        consent: parameters.gcs || "",
        transactionId: parameters.ti || "",
        paymentType: parameters.ep?.payment_type || parameters.ep_payment_type || "",
        timestamp: new Date().toISOString(),
      });
    }
  });

  const marker = Date.now();
  await page.navigate(`https://g-trots.ro/?qa=${marker}`);
  await page.evaluate(`localStorage.setItem('g-trots-cookie-consent-v1', JSON.stringify({version:1,necessary:true,preferences:true,analytics:true,marketing:true,updated_at:new Date().toISOString()})); location.reload(); true`);
  await page.waitFor("document.readyState === 'complete' && document.querySelector('.nav-shop-link')", 20000);
  await sleep(1800);
  hits.length = 0;

  await checkpoint("list_and_search", async () => {
    await page.navigate(`https://g-trots.ro/magazin?qa=${marker}`);
    await page.waitFor("document.querySelectorAll('.product-card').length > 0", 20000);
    await waitForEvent("view_item_list");
    await page.evaluate(`(() => { const input = document.querySelector('#product-search, [data-smart-search-input]'); input.value = 'casca'; input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); return true; })()`);
    await waitForEvent("search");
    await waitForEvent("view_search_results");
  });

  let productUrl = "";
  await checkpoint("select_and_view_product", async () => {
    productUrl = await page.evaluate(`[...document.querySelectorAll('.product-card')].find(card => getComputedStyle(card).display !== 'none')?.querySelector('.product-card-link')?.href || ''`);
    if (!productUrl) throw new Error("No live product link available.");
    await page.evaluate(`[...document.querySelectorAll('.product-card')].find(card => getComputedStyle(card).display !== 'none')?.querySelector('.product-card-link')?.click()`);
    await page.waitFor("location.pathname.startsWith('/magazin/produs/') && document.body.dataset.productId", 20000);
    await waitForEvent("select_item");
    await waitForEvent("view_item");
  });

  await checkpoint("wishlist_add_remove", async () => {
    await page.waitFor("document.querySelector('.product-detail-favorite')", 12000);
    await page.evaluate(`document.querySelector('.product-detail-favorite').click()`);
    await waitForEvent("add_to_wishlist");
    await page.evaluate(`document.querySelector('.product-detail-favorite').click()`);
    await waitForEvent("remove_from_wishlist");
  });

  await checkpoint("cart_add_view_remove", async () => {
    await page.evaluate(`document.querySelector('[data-product-add-cart], [data-add-cart]')?.click()`);
    await waitForEvent("add_to_cart");
    await page.navigate(`https://g-trots.ro/cos?qa=${marker}`);
    await page.waitFor("document.querySelector('[data-remove-cart]')", 15000);
    await waitForEvent("view_cart");
    await page.evaluate(`document.querySelector('[data-remove-cart]').click()`);
    await waitForEvent("remove_from_cart");
  });

  await checkpoint("checkout_shipping_payment", async () => {
    await page.navigate(productUrl);
    await page.waitFor("document.querySelector('[data-product-add-cart], [data-add-cart]')", 15000);
    await page.evaluate(`document.querySelector('[data-product-add-cart], [data-add-cart]').click()`);
    await waitForEvent("add_to_cart", 2);
    await page.navigate(`https://g-trots.ro/checkout?qa=${marker}`);
    await page.waitFor("document.querySelector('input[name=shipping_method_id]') && document.querySelector('input[name=payment_method]')", 20000);
    await waitForEvent("begin_checkout");
    await page.evaluate(`(() => { const radios = [...document.querySelectorAll('input[name=shipping_method_id]')]; const radio = radios.find(item => !item.checked) || radios[0]; radio.checked = true; radio.dispatchEvent(new Event('change', {bubbles:true})); return radio.value; })()`);
    await waitForEvent("add_shipping_info");
    await page.evaluate(`(() => { const radio = document.querySelector('input[name=payment_method][value=card]') || document.querySelector('input[name=payment_method]'); radio.checked = true; radio.dispatchEvent(new Event('change', {bubbles:true})); return radio.value; })()`);
    await waitForEvent("add_payment_info");
    await page.evaluate(`(() => { const radio = document.querySelector('input[name=payment_method][value=cash_on_delivery]'); if (!radio) return ''; radio.checked = true; radio.dispatchEvent(new Event('change', {bubbles:true})); return radio.value; })()`);
    await waitForEvent("add_payment_info", 2);
  });

  await checkpoint("forms", async () => {
    await page.navigate(`https://g-trots.ro/?qa-form=${marker}`);
    await page.waitFor("document.querySelector('.contact-form input') && window.GTrotsGoogle", 15000);
    await page.evaluate(`(() => { const form = document.querySelector('.contact-form'); const input = form.querySelector('input'); input.focus(); form.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, {capture:true, once:true}); form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})); return true; })()`);
    await waitForEvent("form_start");
    await waitForEvent("form_submit");
  });

  await checkpoint("service_leads", async () => {
    await page.waitFor("document.querySelector('a[href^=\"tel:\"]') && document.querySelector('a[href*=\"wa.me\"]')", 12000);
    await page.evaluate(`(() => { document.addEventListener('click', event => event.preventDefault(), {capture:true, once:true}); document.querySelector('a[href^="tel:"]').click(); return true; })()`);
    await waitForEvent("click_to_call");
    await page.evaluate(`(() => { document.addEventListener('click', event => event.preventDefault(), {capture:true, once:true}); document.querySelector('a[href*="wa.me"]').click(); return true; })()`);
    await waitForEvent("click_whatsapp");
  });

  const purchasePayloads = await page.evaluate(`(() => {
    const captured = [];
    const original = window.gtag;
    window.gtag = (...args) => captured.push(args);
    const item = {apiId:'qa-product', name:'Produs verificare', quantity:1, discountedUnitPrice:10};
    window.GTrotsGoogle.trackPurchase({orderNumber:'QA-CARD-${marker}', paymentMethod:'card', total:10, vatTotal:1.6, shippingCost:0, items:[item]});
    window.GTrotsGoogle.trackPurchase({orderNumber:'QA-COD-${marker}', paymentMethod:'cash_on_delivery', total:10, vatTotal:1.6, shippingCost:0, items:[item]});
    window.gtag = original;
    return captured.filter(args => args[0] === 'event' && args[1] === 'purchase').map(args => args[2]);
  })()`);

  const requiredEvents = [
    "view_item_list", "view_item", "select_item", "search", "view_search_results",
    "add_to_wishlist", "remove_from_wishlist", "add_to_cart", "remove_from_cart",
    "view_cart", "begin_checkout", "add_shipping_info", "add_payment_info",
    "form_start", "form_submit", "click_to_call", "click_whatsapp",
  ];
  const observed = new Set(hits.map(hit => hit.event));
  const result = {
    checkedAt: new Date().toISOString(),
    target: "https://g-trots.ro",
    measurementId: [...new Set(hits.map(hit => hit.measurementId).filter(Boolean))],
    requiredEvents,
    missingEvents: requiredEvents.filter(event => !observed.has(event)),
    eventCounts: Object.fromEntries([...observed].sort().map(event => [event, hits.filter(hit => hit.event === event).length])),
    purchasePayloads,
    purchaseModesValid: purchasePayloads.length === 2
      && purchasePayloads.some(payload => payload.payment_type === "card")
      && purchasePayloads.some(payload => payload.payment_type === "cash_on_delivery")
      && purchasePayloads.every(payload => payload.transaction_id && Array.isArray(payload.items) && payload.items.length),
    checkpoints,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (result.missingEvents.length || !result.purchaseModesValid || !result.measurementId.includes("G-6EWM36QSDY")) process.exitCode = 1;
} finally {
  page?.close();
  chrome.kill();
  await sleep(250);
  rmSync(profile, { recursive: true, force: true });
}
