import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "g-trots-ga4-"));
const port = 9338;
const reportPath = resolve("reports/live-ga4-event-test.json");
const submitLiveCodOrder = process.env.GTROTS_SUBMIT_LIVE_COD_ORDER === "1";
const manualRefundTransactionId = String(process.env.GTROTS_REFUND_TRANSACTION_ID || "").trim();
const manualRefundValue = Number(process.env.GTROTS_REFUND_VALUE || 0);
const manualRefundItemId = String(process.env.GTROTS_REFUND_ITEM_ID || "").trim();
const manualRefundItemName = String(process.env.GTROTS_REFUND_ITEM_NAME || "Produs G-Trots").trim();
const manualRefundItemSku = String(process.env.GTROTS_REFUND_ITEM_SKU || "").trim();
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
let codOrderState = null;
let codCancellation = null;

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
        transactionId: parameters["ep.transaction_id"] || parameters.ti || "",
        paymentType: parameters["ep.payment_type"] || parameters.ep_payment_type || "",
        currency: parameters.cu || "",
        value: parameters["epn.value"] || "",
        orderTotal: parameters["epn.order_total"] || "",
        shipping: parameters["epn.shipping"] || "",
        products: Object.entries(parameters).filter(([key]) => /^pr\d+$/.test(key)).map(([, value]) => value),
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

  if (manualRefundTransactionId && manualRefundValue > 0) {
    await checkpoint("manual_refund", async () => {
      await page.waitFor("window.GTrotsGoogle", 15000);
      await page.evaluate(`window.GTrotsGoogle.trackRefund({
        order_number: ${JSON.stringify(manualRefundTransactionId)},
        return_refund_amount: ${JSON.stringify(manualRefundValue)},
        debugMode: true,
        items: [{
          product_id: ${JSON.stringify(manualRefundItemId)},
          product_sku: ${JSON.stringify(manualRefundItemSku)},
          product_name: ${JSON.stringify(manualRefundItemName)},
          quantity: 1,
          discounted_unit_price: ${JSON.stringify(manualRefundValue)}
        }]
      })`);
      await waitForEvent("refund", 1, 12000);
    });
  }

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

  if (submitLiveCodOrder) {
    await checkpoint("live_cod_purchase", async () => {
      const purchasesBefore = hits.filter(hit => hit.event === "purchase").length;
      await page.navigate(productUrl);
      await page.waitFor("document.querySelector('[data-product-add-cart], [data-add-cart]')", 15000);
      await page.evaluate(`(() => { (window.GTrotsCart?.get?.() || []).forEach(item => window.GTrotsCart?.remove?.(item.id)); return true; })()`);
      await page.evaluate(`document.querySelector('[data-product-add-cart], [data-add-cart]').click()`);
      await page.navigate(`https://g-trots.ro/checkout?qa-cod=${marker}`);
      await page.waitFor("document.querySelector('[data-checkout-form]:not([hidden])') && document.querySelector('input[name=payment_method][value=cash_on_delivery]')", 20000);
      await page.evaluate(`(() => {
        const form = document.querySelector('[data-checkout-form]');
        const values = {
          customer_name: 'TEST ANALYTICS G-TROTS',
          customer_phone: '0762093915',
          customer_email: 'contact@g-trots.ro',
          address: 'Comandă test analytics - NU EXPEDIAȚI',
          city: 'București',
          county: 'București',
          postal_code: '052262',
          customer_notes: '[TEST AUTOMAT] Nu expediați. Comandă creată exclusiv pentru validarea GA4 purchase și anulată automat.'
        };
        for (const [name, value] of Object.entries(values)) {
          const field = form.elements.namedItem(name);
          if (!field) throw new Error('Câmp checkout lipsă: ' + name);
          field.value = value;
          field.dispatchEvent(new Event('input', {bubbles:true}));
          field.dispatchEvent(new Event('change', {bubbles:true}));
        }
        const shipping = form.querySelector('input[name=shipping_method_id]');
        const payment = form.querySelector('input[name=payment_method][value=cash_on_delivery]');
        shipping.checked = true;
        shipping.dispatchEvent(new Event('change', {bubbles:true}));
        payment.checked = true;
        payment.dispatchEvent(new Event('change', {bubbles:true}));
        form.elements.namedItem('confirm_order').checked = true;
        form.elements.namedItem('accept_terms').checked = true;
        form.elements.namedItem('newsletter_opt_in').checked = false;
        form.requestSubmit();
        return true;
      })()`);
      await page.waitFor("location.pathname === '/plata-finalizata'", 30000);
      await page.waitFor("document.querySelector('[data-order-number]')?.textContent?.trim().startsWith('GT-')", 20000);
      codOrderState = await page.evaluate(`JSON.parse(sessionStorage.getItem('g-trots-last-checkout-v1') || 'null')`);
      if (!codOrderState?.orderNumber || !codOrderState?.trackingToken) throw new Error("Comanda ramburs nu a păstrat identificatorul și tokenul de urmărire.");
      await waitForEvent("purchase", purchasesBefore + 1, 20000);
      const purchaseHits = hits.filter(hit => hit.event === "purchase" && hit.transactionId === codOrderState.orderNumber);
      if (purchaseHits.length !== 1) throw new Error(`purchase ramburs trebuie trimis o singură dată; observat=${purchaseHits.length}`);
      const purchase = purchaseHits[0];
      if (purchase.measurementId !== "G-6EWM36QSDY" || purchase.currency !== "RON") throw new Error("purchase ramburs nu a ajuns la proprietatea GA4 sau moneda corectă.");
      const merchandiseValue = (codOrderState.items || []).reduce((sum, item) => sum + Number(item.discountedUnitPrice ?? item.unitPrice ?? 0) * Number(item.quantity || 1), 0);
      if (Math.abs(Number(purchase.value) - merchandiseValue) > 0.001 || Math.abs(Number(purchase.orderTotal) - Number(codOrderState.total)) > 0.001 || Math.abs(Number(purchase.shipping) - Number(codOrderState.shippingCost)) > 0.001) {
        throw new Error(`Valorile purchase ramburs sunt greșite: ${JSON.stringify(purchase)}`);
      }
      const cancellationResponse = await page.evaluate(`fetch('https://g-trots.ro/shop-api/api-v2.php?action=customerCancelOrder', {
        method: 'POST',
        headers: {Accept:'application/json','Content-Type':'application/json'},
        body: JSON.stringify({token:${JSON.stringify("__TRACKING_TOKEN__")}, reason:'Comandă de test analytics anulată automat. Nu se expediază.'})
      }).then(async response => ({ok:response.ok, status:response.status, body:await response.json()}))`.replace("__TRACKING_TOKEN__", codOrderState.trackingToken));
      if (!cancellationResponse.ok || cancellationResponse.body?.order?.status !== "cancelled") throw new Error(`Anularea comenzii test a eșuat: ${JSON.stringify(cancellationResponse)}`);
      codCancellation = cancellationResponse.body;
      await page.evaluate(`window.GTrotsGoogle?.trackRefund?.({
        order_number: ${JSON.stringify("__ORDER_NUMBER__")},
        total: ${JSON.stringify("__MERCHANDISE_VALUE__")},
        return_refund_amount: ${JSON.stringify("__MERCHANDISE_VALUE__")},
        items: ${JSON.stringify("__ITEMS__")}
      })`.replace("__ORDER_NUMBER__", codOrderState.orderNumber).replaceAll('"__MERCHANDISE_VALUE__"', String(merchandiseValue)).replace('"__ITEMS__"', JSON.stringify(codOrderState.items || [])));
      await waitForEvent("refund", 1, 12000);
    });
  }

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
    await waitForEvent("phone_click");
    await page.evaluate(`(() => { document.addEventListener('click', event => event.preventDefault(), {capture:true, once:true}); document.querySelector('a[href*="wa.me"]').click(); return true; })()`);
    await waitForEvent("whatsapp_click");
  });

  await checkpoint("payment_outcomes", async () => {
    const testItem = { apiId: "qa-product", sku: "QA-SKU", name: "Produs verificare", quantity: 1, discountedUnitPrice: 10 };
    await page.evaluate(`sessionStorage.setItem('g-trots-last-checkout-v1', JSON.stringify({orderNumber:'QA-FAILED-${marker}', paymentMethod:'card', paymentStatus:'failed', total:10, items:[${JSON.stringify(testItem)}]})); true`);
    await page.navigate(`https://g-trots.ro/plata-esuata?comanda=QA-FAILED-${marker}&metoda=card&status=failed`);
    await page.waitFor("document.body.dataset.checkoutStatus === 'failed' && window.GTrotsGoogle", 15000);
    await waitForEvent("payment_failed");
    await page.evaluate(`sessionStorage.setItem('g-trots-last-checkout-v1', JSON.stringify({orderNumber:'QA-CANCELLED-${marker}', paymentMethod:'card', paymentStatus:'cancelled', total:10, items:[${JSON.stringify(testItem)}]})); true`);
    await page.navigate(`https://g-trots.ro/plata-esuata?comanda=QA-CANCELLED-${marker}&metoda=card&status=cancelled`);
    await page.waitFor("document.body.dataset.checkoutStatus === 'failed' && window.GTrotsGoogle", 15000);
    await waitForEvent("payment_cancelled");
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
    "form_start", "form_submit", "phone_click", "whatsapp_click",
    "payment_failed", "payment_cancelled",
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
    liveCodOrder: codOrderState ? {
      orderNumber: codOrderState.orderNumber,
      subtotal: codOrderState.subtotal,
      shipping: codOrderState.shippingCost,
      total: codOrderState.total,
      cancellationStatus: codCancellation?.order?.status || "",
      invoiceAction: codCancellation?.invoice_action || "",
      purchaseHits: hits.filter(hit => hit.event === "purchase" && hit.transactionId === codOrderState.orderNumber),
      refundHits: hits.filter(hit => hit.event === "refund" && hit.transactionId === codOrderState.orderNumber),
    } : null,
    checkpoints,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (result.missingEvents.length || !result.purchaseModesValid || !result.measurementId.includes("G-6EWM36QSDY")) process.exitCode = 1;
} finally {
  if (codOrderState?.trackingToken && codCancellation?.order?.status !== "cancelled") {
    try {
      const response = await fetch("https://g-trots.ro/shop-api/api-v2.php?action=customerCancelOrder", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ token: codOrderState.trackingToken, reason: "Curățare automată după testul de măsurare. Nu se expediază." }),
      });
      codCancellation = await response.json().catch(() => null);
    } catch { /* raportul păstrează eroarea inițială; curățarea se poate relua după token */ }
  }
  page?.close();
  chrome.kill();
  await sleep(250);
  rmSync(profile, { recursive: true, force: true });
}
