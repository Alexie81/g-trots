function ensureGlobalPromotionBar() {
  if (!document.querySelector('link[href*="promotions.css"]')) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "/promotions.css?v=20260828-marquee-v5"; document.head.append(link);
  }
  if (!document.querySelector('script[src*="promotions.js"]')) {
    const script = document.createElement("script"); script.src = "/promotions.js?v=20260828-global-v1"; document.head.append(script);
  }
}
ensureGlobalPromotionBar();

const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".main-nav");

if (window.location.protocol === "file:") {
  document.querySelectorAll('a[href^="/"]').forEach(link => {
    const rawHref = link.getAttribute("href");
    if (!rawHref) return;

    if (rawHref === "/") {
      link.setAttribute("href", "index.html");
      return;
    }

    if (rawHref.startsWith("/#")) {
      link.setAttribute("href", `index.html${rawHref.slice(1)}`);
      return;
    }

    const [path, hash = ""] = rawHref.slice(1).split("#");
    link.setAttribute("href", `${path || "index"}.html${hash ? `#${hash}` : ""}`);
  });
}

function closeMenu() {
  navigation?.classList.remove("open");
  menuButton?.setAttribute("aria-expanded", "false");
  menuButton?.setAttribute("aria-label", "Deschide meniul");
  document.body.classList.remove("menu-open");
}

function updateSearchViewportVars() {
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight;
  const offsetTop = viewport ? viewport.offsetTop : 0;
  document.documentElement.style.setProperty("--gtrots-vvh", Math.max(320, Math.round(height)) + "px");
  document.documentElement.style.setProperty("--gtrots-vvo", Math.max(0, Math.round(offsetTop)) + "px");
}

function bindSearchViewportTracking() {
  updateSearchViewportVars();
  if (bindSearchViewportTracking.bound) return;
  bindSearchViewportTracking.bound = true;
  window.visualViewport?.addEventListener("resize", updateSearchViewportVars, { passive: true });
  window.visualViewport?.addEventListener("scroll", updateSearchViewportVars, { passive: true });
  window.addEventListener("resize", updateSearchViewportVars, { passive: true });
}

function closeSearchOverlays() {
  document.querySelectorAll(".seo-search-popup.show").forEach(popup => hidePopup(popup));
  document.documentElement.classList.remove("seo-search-modal-open");
  const active = document.activeElement;
  if (active?.matches?.('[data-seo-search] input')) active.blur();
}

const searchPortalAnchors = new WeakMap();

menuButton?.addEventListener("click", () => {
  const isOpen = navigation.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Închide meniul" : "Deschide meniul");
  document.body.classList.toggle("menu-open", isOpen);
  if (isOpen) closeSearchOverlays();
});

navigation?.addEventListener("click", event => {
  if (event.target.closest("a")) closeMenu();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
});

document.addEventListener("click", event => {
  if (!navigation?.classList.contains("open") || navigation.contains(event.target) || menuButton?.contains(event.target)) return;
  closeMenu();
});


const globalSearchIndexPromises = new Map();
const smartSearchers = new WeakMap();
const RECENT_SEARCH_KEY = "gtrots_recent_searches";
const SEARCH_WORKER_PATH = "smart-search-worker.js?v=search-v76";
const SEARCH_WORKER_TIMEOUT_READY = 180;
const SEARCH_WORKER_TIMEOUT_LOADING = 28;
let searchWorker = null;
let searchWorkerReady = false;
let searchRequestId = 0;
const searchWorkerPending = new Map();

function initSearchWorker() {
  if (window.location.protocol === "file:" || !("Worker" in window)) return null;
  if (searchWorker) return searchWorker;

  searchWorker = new Worker(`/${SEARCH_WORKER_PATH}`, { type: "module" });
  searchWorker.addEventListener("message", event => {
    const message = event.data || {};
    if (message.type === "ready") {
      searchWorkerReady = !message.failed;
      document.dispatchEvent(new CustomEvent("gtrots:search-ready"));
      return;
    }
    if (message.type !== "results") return;
    const pending = searchWorkerPending.get(message.id);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    searchWorkerPending.delete(message.id);
    pending.resolve(Array.isArray(message.results) ? message.results : []);
  });
  searchWorker.addEventListener("error", () => {
    searchWorkerReady = false;
    searchWorker = null;
    searchWorkerPending.forEach(pending => {
      window.clearTimeout(pending.timer);
      pending.resolve(null);
    });
    searchWorkerPending.clear();
  });
  searchWorker.postMessage({ type: "warm" });
  return searchWorker;
}

function scheduleSearchWarmup() {
  if (window.__gtrotsSearchWarmupScheduled) return;
  window.__gtrotsSearchWarmupScheduled = true;
  const run = () => initSearchWorker();
  window.requestAnimationFrame(() => window.setTimeout(run, 80));
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 900 });
}

function searchWithWorker(query, options = {}) {
  const worker = initSearchWorker();
  if (!worker) return Promise.resolve(null);
  const id = ++searchRequestId;
  const timeout = searchWorkerReady ? SEARCH_WORKER_TIMEOUT_READY : SEARCH_WORKER_TIMEOUT_LOADING;
  return new Promise(resolve => {
    const timer = window.setTimeout(() => {
      searchWorkerPending.delete(id);
      resolve(null);
    }, timeout);
    searchWorkerPending.set(id, { resolve, timer });
    worker.postMessage({ type: "search", id, query, opts: options });
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function normalizeSearch(value) {
  if (window.GTrotsSmartSearchV2?.normalize) return window.GTrotsSmartSearchV2.normalize(value);
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function loadSearchDataScript() {
  if (window.GTrotsSmartSearchIndexV2) return Promise.resolve(window.GTrotsSmartSearchIndexV2);
  if (window.GTrotsSmartSearchIndexPromise) return window.GTrotsSmartSearchIndexPromise;

  window.GTrotsSmartSearchIndexPromise = new Promise(resolve => {
    const script = document.createElement("script");
    script.src = window.location.protocol === "file:" ? "smart-search-index-v2-data.js" : "/smart-search-index-v2-data.js";
    script.onload = () => resolve(window.GTrotsSmartSearchIndexV2 || []);
    script.onerror = () => resolve([]);
    document.head.appendChild(script);
  });

  return window.GTrotsSmartSearchIndexPromise;
}

function getSearchIndex(src) {
  if (!src) return Promise.resolve(null);
  if (window.GTrotsSmartSearchIndexV2) return Promise.resolve(window.GTrotsSmartSearchIndexV2);

  const normalizedSrc = src.replace(/^\//, "");
  if (!globalSearchIndexPromises.has(normalizedSrc)) {
    const url = window.location.protocol === "file:" ? normalizedSrc : `/${normalizedSrc}`;
    const loader = window.location.protocol === "file:"
      ? loadSearchDataScript()
      : fetch(url).then(response => (response.ok ? response.json() : [])).catch(() => loadSearchDataScript());
    globalSearchIndexPromises.set(normalizedSrc, loader);
  }

  return globalSearchIndexPromises.get(normalizedSrc);
}

function getSmartSearcher(items) {
  if (!Array.isArray(items) || !window.GTrotsSmartSearchV2?.create) return null;
  if (!smartSearchers.has(items)) smartSearchers.set(items, window.GTrotsSmartSearchV2.create(items));
  return smartSearchers.get(items);
}

function cleanRecentSearchValue(query) {
  return String(query || "")
    .replace(/(?:Articol|Ghid)\s*\d{1,4}(?:\s*\d{1,4})?/gi, "")
    .replace(/\bCAT\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
}

function getRecentSearches() {
  try {
    const data = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    return data
      .map(cleanRecentSearchValue)
      .filter(item => item.length > 1)
      .filter(item => {
        const normalized = normalizeSearch(item);
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, 6);
  } catch {
    return [];
  }
}

function saveRecentSearch(query) {
  const clean = cleanRecentSearchValue(query);
  if (clean.length < 2) return;
  const normalized = normalizeSearch(clean);
  const next = [clean, ...getRecentSearches().filter(item => normalizeSearch(item) !== normalized)].slice(0, 6);
  try { localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next)); } catch {}
}
function deleteRecentSearch(query) {
  const normalized = normalizeSearch(query);
  if (!normalized) return;
  const next = getRecentSearches().filter(item => normalizeSearch(item) !== normalized);
  try { localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next)); } catch {}
}

function localizeLinks(root) {
  if (window.location.protocol !== "file:") return;
  root.querySelectorAll('a[href^="/"]').forEach(link => {
    const rawHref = link.getAttribute("href");
    if (!rawHref) return;
    const [path, hash = ""] = rawHref.slice(1).split("#");
    link.setAttribute("href", `${path || "index"}.html${hash ? `#${hash}` : ""}`);
  });
}

function fallbackItemsFromLinks(links) {
  return links.map(link => ({
    kind: "article",
    slug: (link.getAttribute("href") || "").replace(/^\//, "").replace(/\.html$/, ""),
    title: link.querySelector("strong")?.textContent?.trim() || link.textContent.trim(),
    keyword: link.querySelector("span")?.textContent?.trim() || "",
    excerpt: link.querySelector("span")?.textContent?.trim() || "",
  })).filter(item => item.slug);
}

function getSearchArea(searchWrap) {
  return searchWrap.closest("[data-search-scope]") || searchWrap.closest("section") || searchWrap.parentElement;
}

function rankSearchResults(items, query, normalize, limit = 24, options = {}) {
  const smartSearcher = getSmartSearcher(items);
  if (smartSearcher) return smartSearcher(query, { limit, category: options.category }).map(item => ({ ...item, kind: "article" }));

  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  return items
    .filter(item => !options.category || item.category_id === options.category)
    .map(item => {
      const title = normalize(item.title || "");
      const keyword = normalize(item.keyword || "");
      const content = normalize([item.content, item.excerpt, item.area, item.zone, item.cluster, item.category_id, ...(item.variants || []), ...(item.synonyms || []), ...(item.tokens || []), ...(item.brands || []), ...(item.models || [])].filter(Boolean).join(" "));
      let score = 0;
      terms.forEach(term => {
        if (title.includes(term)) score += 9;
        if (keyword.includes(term)) score += 7;
        if (content.includes(term)) score += 3;
      });
      if (keyword.includes(normalize(query))) score += 12;
      if (title.includes(normalize(query))) score += 10;
      if (item.indexation === "index-priority") score += 2;
      score += Number(item.demand_proxy || item.demand || 0) / 20;
      return { item: { ...item, kind: "article" }, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => entry.item);
}

function categoryMatches(query, limit = 4) {
  const q = normalizeSearch(query);
  const terms = q.split(/\s+/).filter(Boolean);
  if (!q || !Array.isArray(window.GTrotsSearchCategories)) return [];

  return window.GTrotsSearchCategories
    .map(category => {
      const name = normalizeSearch(category.name);
      const description = normalizeSearch(category.description);
      const id = normalizeSearch(category.id);
      let score = 0;
      if (name === q) score += 180;
      if (name.includes(q) || q.includes(name)) score += 90;
      if (description.includes(q)) score += 40;
      terms.forEach(term => {
        if (name.split(" ").includes(term)) score += 35;
        else if (name.includes(term)) score += 18;
        if (description.includes(term)) score += 8;
        if (id.includes(term)) score += 8;
      });
      if (q.includes("scuter") && name.includes("scuter")) score += 80;
      if (q.includes("trotinete") && name.includes("trotinete")) score += 40;
      return {
        kind: "category",
        slug: category.slug,
        title: category.name,
        excerpt: category.description,
        count: category.article_count,
        _score: score,
      };
    })
    .filter(category => category._score > 0)
    .sort((a, b) => b._score - a._score || (b.count || 0) - (a.count || 0))
    .slice(0, limit);
}

function createPopupHost(searchWrap) {
  const placeholder = document.createComment("gtrots-search-placeholder");
  const host = document.createElement("div");
  host.className = "seo-search-popup-host";
  searchWrap.parentNode.insertBefore(placeholder, searchWrap);
  placeholder.parentNode.insertBefore(host, placeholder.nextSibling);
  searchPortalAnchors.set(host, placeholder);

  const backButton = document.createElement("button");
  backButton.className = "seo-search-back";
  backButton.type = "button";
  backButton.setAttribute("aria-label", "Inapoi la pagina");
  backButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.6 5.4 9 12l6.6 6.6-1.4 1.4L6.2 12l8-8 1.4 1.4Z"/></svg>`;
  host.appendChild(backButton);
  host.appendChild(searchWrap);

  const popup = document.createElement("div");
  popup.className = "seo-search-popup";
  popup.setAttribute("role", "listbox");
  popup.setAttribute("aria-label", "Sugestii de cautare G-Trots");
  popup.hidden = true;
  host.appendChild(popup);
  return { host, popup, backButton };
}

function shouldPortalSearchHost() {
  return Boolean(window.matchMedia?.("(max-width: 700px)").matches);
}

function portalSearchHost(host) {
  if (!host || !shouldPortalSearchHost()) return;
  if (host.parentElement !== document.body) document.body.appendChild(host);
}

function restoreSearchHost(host) {
  const placeholder = host ? searchPortalAnchors.get(host) : null;
  if (!host || !placeholder?.parentNode || host.parentElement !== document.body) return;
  placeholder.parentNode.insertBefore(host, placeholder.nextSibling);
}

function popupItemMarkup(item, index) {
  const title = escapeHtml(item.title || item.keyword || item.slug);
  const slug = escapeHtml(item.slug);
  const isCategory = item.kind === "category";
  const subtitle = isCategory
    ? `Categorie: ${Number(item.count || 0)} articole`
    : escapeHtml(item.excerpt || item.keyword || item.zone || "Articol G-Trots");
  const iconPath = isCategory
    ? "M4 5.8C4 4.8 4.8 4 5.8 4h4.3l1.5 1.8h6.6c1 0 1.8.8 1.8 1.8v10.6c0 1-.8 1.8-1.8 1.8H5.8c-1 0-1.8-.8-1.8-1.8V5.8Zm2 .2v12h12V7.8h-7.4L9.1 6H6Z"
    : "M10.5 4a6.5 6.5 0 0 1 5.2 10.4l3.45 3.45-1.3 1.3-3.45-3.45A6.5 6.5 0 1 1 10.5 4Zm0 1.8a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Z";
  return `<a class="seo-search-popup-item ${isCategory ? "is-category" : ""}" href="/${slug}" role="option" data-popup-result="true">
    <span class="seo-search-popup-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${iconPath}"/></svg></span>
    <span><strong>${title}</strong><small>${subtitle}</small></span>
    <em>${isCategory ? "CAT" : String(index + 1).padStart(2, "0")}</em>
  </a>`;
}

function recentItemMarkup(query) {
  const safeQuery = escapeHtml(query);
  return `<div class="seo-search-popup-item seo-search-recent-item" role="option">
    <span class="seo-search-popup-icon is-recent" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1-9.6 7.2h2A8.1 8.1 0 1 0 12 3.9a8 8 0 0 0-6.4 3.2H9v1.8H2.6V2.5h1.8v3A9.9 9.9 0 0 1 12 2Zm.9 5v4.55l3.45 2.05-.9 1.5-4.35-2.6V7h1.8Z"/></svg></span>
    <button class="seo-search-recent-trigger" type="button" data-recent-search="${safeQuery}"><span><strong>${safeQuery}</strong><small>Cautare recenta</small></span></button>
    <button class="seo-search-recent-delete" type="button" data-delete-recent-search="${safeQuery}" aria-label="Sterge cautarea recenta: ${safeQuery}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l.7 1.5H20v1.8h-1.25l-.85 13.1A1.8 1.8 0 0 1 16.1 21H7.9a1.8 1.8 0 0 1-1.8-1.6L5.25 6.3H4V4.5h4.3L9 3Zm1.15 1.8-.32.7h4.34l-.32-.7h-3.7ZM7.05 6.3l.83 12.85h8.24l.83-12.85h-9.9Zm2.9 2.5h1.6v8.1h-1.6V8.8Zm3.5 0h1.6v8.1h-1.6V8.8Z"/></svg></button>
  </div>`;
}

function syncMobileSearchPopupSize(popup) {
  if (!window.matchMedia || !window.matchMedia("(max-width: 700px)").matches) return;
  const host = popup.parentElement;
  if (!host) return;
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("top", "0", "important");
  host.style.setProperty("right", "0", "important");
  host.style.setProperty("bottom", "0", "important");
  host.style.setProperty("left", "0", "important");
  host.style.setProperty("width", "100vw", "important");
  host.style.setProperty("height", "100dvh", "important");
  host.style.setProperty("min-height", "100dvh", "important");
  host.style.setProperty("max-height", "100dvh", "important");
  host.style.setProperty("padding", "12px 10px", "important");
  host.style.setProperty("gap", "8px", "important");
  host.style.setProperty("align-items", "center", "important");
  host.style.setProperty("justify-content", "flex-start", "important");
  host.style.setProperty("overflow-y", "auto", "important");
  host.style.setProperty("background", "#050505", "important");
  const searchBox = host.querySelector(".seo-search, .wiki-main-search");
  if (searchBox) {
    searchBox.style.setProperty("margin", "0", "important");
    searchBox.style.setProperty("width", "100%", "important");
    searchBox.style.setProperty("max-width", "430px", "important");
  }

  popup.style.setProperty("flex", "0 0 auto", "important");
  popup.style.setProperty("align-self", "center", "important");
  popup.style.setProperty("height", "auto", "important");
  popup.style.setProperty("min-height", "0", "important");
  popup.style.setProperty("max-height", "none", "important");

  const viewportHeight = Math.max(320, Math.round(window.visualViewport?.height || window.innerHeight || 720));
  const maxPopupHeight = Math.max(280, viewportHeight - 86);
  const wantedHeight = Math.min(Math.ceil(popup.scrollHeight), maxPopupHeight);
  popup.style.setProperty("height", `${wantedHeight}px`, "important");
  popup.style.setProperty("max-height", `${maxPopupHeight}px`, "important");
}

function syncDesktopSearchPopupDirection(popup) {
  if (!window.matchMedia || window.matchMedia("(max-width: 700px)").matches) {
    popup.classList.remove("open-upward");
    popup.style.removeProperty("--search-popup-space");
    popup.style.removeProperty("max-height");
    return;
  }

  const searchBox = popup.parentElement?.querySelector(".seo-search, .wiki-main-search");
  if (!searchBox) return;
  const rect = searchBox.getBoundingClientRect();
  const hostRect = popup.parentElement.getBoundingClientRect();
  const viewportHeight = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 720);
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom);
  const spaceAbove = Math.max(96, Math.floor(hostRect.top - 12));
  const documentHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
  const distanceToDocumentEnd = Math.max(0, documentHeight - (window.scrollY + rect.bottom));
  const isFinalSearch = distanceToDocumentEnd < 220 || Boolean(searchBox.closest("footer, .site-footer"));
  const openUpward = isFinalSearch && spaceBelow < Math.min(420, viewportHeight * 0.48);
  popup.classList.toggle("open-upward", openUpward);
  if (openUpward) {
    popup.style.setProperty("--search-popup-space", spaceAbove + "px");
    popup.style.setProperty("max-height", spaceAbove + "px", "important");
  } else {
    popup.style.removeProperty("--search-popup-space");
    popup.style.removeProperty("max-height");
  }
}
function renderPopup(popup, query, categoryResults, articleResults, fallbackItems) {
  const cleanQuery = String(query || "").trim();
  const normalizedQuery = normalizeSearch(cleanQuery);
  const recent = getRecentSearches().filter(item => {
    if (!normalizedQuery) return true;
    const normalizedItem = normalizeSearch(item);
    return normalizedItem.includes(normalizedQuery) || normalizedQuery.includes(normalizedItem);
  }).slice(0, 4);
  const popular = articleResults.length ? articleResults : fallbackItems;
  const recentHtml = recent.length ? `<div class="seo-search-popup-section"><p>Cautari recente</p>${recent.map(recentItemMarkup).join("")}</div>` : "";
  const categoryHtml = categoryResults.length ? `<div class="seo-search-popup-section"><p>Categorii</p>${categoryResults.map(popupItemMarkup).join("")}</div>` : "";
  const title = "Sugestii";
  const resultHtml = popular.slice(0, 7).length ? `<div class="seo-search-popup-section"><p>${title}</p>${popular.slice(0, 7).map(popupItemMarkup).join("")}</div>` : "";

  popup.innerHTML = recentHtml + resultHtml + categoryHtml || `<div class="seo-search-popup-section"><p>Incepe cautarea</p><span class="seo-search-popup-empty">Scrie o problema: baterie, frana, Xiaomi, scuter electric.</span></div>`;
  popup.hidden = false;
  popup.classList.add("show");
  if (popup.dataset.keepScroll !== "true") popup.scrollTop = 0;
  bindSearchViewportTracking();
  portalSearchHost(popup.parentElement);
  popup.parentElement?.classList.add("is-search-open");
  document.documentElement.classList.add("seo-search-modal-open");
  syncDesktopSearchPopupDirection(popup);
  syncMobileSearchPopupSize(popup);
  localizeLinks(popup);
}

function hidePopup(popup) {
  const host = popup.parentElement;
  popup.classList.remove("show");
  popup.style.removeProperty("height");
  popup.style.removeProperty("max-height");
  popup.style.removeProperty("flex");
  popup.style.removeProperty("align-self");
  popup.style.removeProperty("--search-popup-space");
  popup.classList.remove("open-upward");
  if (host) {
    host.classList.remove("is-search-open");
    host.style.removeProperty("position");
    host.style.removeProperty("top");
    host.style.removeProperty("right");
    host.style.removeProperty("bottom");
    host.style.removeProperty("left");
    host.style.removeProperty("width");
    host.style.removeProperty("height");
    host.style.removeProperty("min-height");
    host.style.removeProperty("max-height");
    host.style.removeProperty("padding");
    host.style.removeProperty("padding-top");
    host.style.removeProperty("gap");
    host.style.removeProperty("align-items");
    host.style.removeProperty("justify-content");
    host.style.removeProperty("overflow-y");
    host.style.removeProperty("background");
    const searchBox = host.querySelector(".seo-search, .wiki-main-search");
    searchBox?.style.removeProperty("margin");
    searchBox?.style.removeProperty("margin-top");
    searchBox?.style.removeProperty("width");
    searchBox?.style.removeProperty("max-width");
    restoreSearchHost(host);
  }
  if (!document.querySelector(".seo-search-popup-host.is-search-open")) {
    document.documentElement.classList.remove("seo-search-modal-open");
    updateSearchViewportVars();
  }
  window.setTimeout(() => { if (!popup.classList.contains("show")) popup.hidden = true; }, 140);
}

document.querySelectorAll("[data-seo-search]").forEach(searchWrap => {
  const input = searchWrap.querySelector("input");
  let count = searchWrap.querySelector("[data-seo-search-count]");
  const countBadge = count?.closest("small") || null;
  const searchArea = getSearchArea(searchWrap);
  const grid = searchArea?.querySelector("[data-seo-topic-grid]");
  const empty = searchArea?.querySelector("[data-seo-empty-state]");
  const links = Array.from(grid?.querySelectorAll("a") || []);
  const src = searchWrap.dataset.searchSrc;
  const limit = Number(searchWrap.dataset.searchLimit || 24);
  const categoryFilter = searchWrap.dataset.searchCategory || searchArea?.dataset.searchCategory || "";

  // Commercial pages use the global search without a local article grid.
  if (!input) return;

  if (countBadge) {
    countBadge.classList.add("seo-search-status", "is-search-idle");
    countBadge.setAttribute("aria-label", "Cauta");
    countBadge.innerHTML = `<span class="seo-search-status-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10.5 4a6.5 6.5 0 0 1 5.2 10.4l3.45 3.45-1.3 1.3-3.45-3.45A6.5 6.5 0 1 1 10.5 4Zm0 1.8a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Z"/></svg></span><span class="seo-search-status-text"><b data-seo-search-count>0</b> rezultate</span>`;
    count = countBadge.querySelector("[data-seo-search-count]");
  }

  const setSearchStatus = (total, hasQuery) => {
    if (!countBadge || !count) return;
    count.textContent = String(Math.max(0, total || 0));
    countBadge.classList.toggle("is-search-idle", !hasQuery);
    countBadge.classList.toggle("has-search-results", hasQuery);
    countBadge.setAttribute("aria-label", hasQuery ? `${Math.max(0, total || 0)} rezultate` : "Cauta");
  };

  const { popup, backButton } = createPopupHost(searchWrap);
  scheduleSearchWarmup();
  const fallbackItems = fallbackItemsFromLinks(links);
  let lastPopupItems = fallbackItems.slice(0, limit);
  let updateToken = 0;

  const update = async ({ fromFocus = false } = {}) => {
    const rawQuery = input.value.trim();
    const token = ++updateToken;

    if (src && rawQuery) {
      const categoryResults = categoryFilter ? [] : categoryMatches(rawQuery, 4);
      if (!searchWorkerReady) {
        lastPopupItems = [...categoryResults, ...fallbackItems.slice(0, limit)];
        if (empty) empty.classList.remove("show");
        renderPopup(popup, rawQuery, categoryResults, [], fallbackItems);
      }
      const workerResults = await searchWithWorker(rawQuery, { limit, category: categoryFilter });
      if (token !== updateToken) return;
      const localResults = workerResults ? [] : rankSearchResults(fallbackItems, rawQuery, normalizeSearch, limit, { category: categoryFilter });
      const articleResults = Array.isArray(workerResults) && workerResults.length ? workerResults : localResults;
      const visibleArticles = (articleResults.length ? articleResults : fallbackItems).slice(0, limit);

      const realResultCount = categoryResults.length + articleResults.length;
      lastPopupItems = realResultCount ? [...categoryResults, ...visibleArticles] : fallbackItems.slice(0, limit);
      setSearchStatus(realResultCount, true);
      if (empty) empty.classList.remove("show");
      renderPopup(popup, rawQuery, categoryResults, articleResults, fallbackItems);
      return;
    }

    if (src && !rawQuery) {
      const categoryResults = [];
      lastPopupItems = fallbackItems.slice(0, limit);
      setSearchStatus(0, false);
      if (empty) empty.classList.remove("show");
      if (fromFocus) renderPopup(popup, "", categoryResults, lastPopupItems, fallbackItems);
      return;
    }
  };

  backButton?.addEventListener("click", () => {
    hidePopup(popup);
    input.blur();
  });

  let searchInputFrame = 0;
  const scheduleUpdate = () => {
    window.cancelAnimationFrame(searchInputFrame);
    searchInputFrame = window.requestAnimationFrame(() => update());
  };

  document.addEventListener("gtrots:search-ready", () => {
    if (document.activeElement === input || popup.classList.contains("show")) update({ fromFocus: true });
  });

  input.addEventListener("focus", () => update({ fromFocus: true }));
  input.addEventListener("input", scheduleUpdate);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      const query = input.value.trim();
      saveRecentSearch(query);
      const first = lastPopupItems[0];
      if (first?.slug) {
        event.preventDefault();
        window.location.href = window.location.protocol === "file:" ? `${first.slug}.html` : `/${first.slug}`;
      }
    }
    if (event.key === "Escape") hidePopup(popup);
  });

  popup.addEventListener("mousedown", event => {
    if (event.target.closest("a, button")) return;
    event.preventDefault();
  });
  popup.addEventListener("click", event => {
    const deleteRecent = event.target.closest("[data-delete-recent-search]");
    if (deleteRecent) {
      event.preventDefault();
      event.stopPropagation();
      deleteRecentSearch(deleteRecent.dataset.deleteRecentSearch || "");
      update({ fromFocus: true });
      return;
    }

    const recent = event.target.closest("[data-recent-search]");
    if (recent) {
      input.value = recent.dataset.recentSearch || "";
      input.focus();
      update();
      return;
    }
    const result = event.target.closest("[data-popup-result]");
    if (result) {
      const resultTitle = result.querySelector("strong")?.textContent?.trim() || "";
      saveRecentSearch(input.value.trim() || resultTitle || result.textContent.trim());
    }
  });

  document.addEventListener("click", event => {
    if (!popup.parentElement?.contains(event.target)) hidePopup(popup);
  });

  update();
});
function renderLoadMoreCard(item, index) {
  const title = escapeHtml(item.title || item.keyword || item.slug);
  const excerpt = escapeHtml(item.excerpt || item.keyword || "Ghid G-Trots pentru diagnostic si reparatie.");
  const slug = escapeHtml(item.slug);
  return `<a class="blog-article-card" href="/${slug}"><span class="blog-card-meta">Articol ${String(index + 1).padStart(2, "0")}</span><strong>${title}</strong><span>${excerpt}</span><em>Citeste ghidul</em></a>`;
}

document.querySelectorAll("[data-load-more]").forEach(button => {
  const category = button.dataset.category || "";
  const src = button.dataset.src || "smart-search-index-v2.json";
  const step = Number(button.dataset.step || 30);
  const grid = document.querySelector(`[data-category-grid="${CSS.escape(category)}"]`);
  if (!grid || !category) return;

  const setLoadMoreState = (total) => {
    const offset = Number(button.dataset.offset || 0);
    const remaining = Math.max(0, total - offset);
    button.hidden = false;
    button.removeAttribute("aria-hidden");
    button.classList.toggle("is-complete", remaining <= 0);
    button.disabled = remaining <= 0;
    button.setAttribute("aria-disabled", String(remaining <= 0));
    button.textContent = remaining <= 0
      ? "Toate articolele sunt afisate"
      : `Incarca inca ${Math.min(step, remaining)}`;
  };

  const loadCategoryItems = async () => {
    const index = await getSearchIndex(src);
    return (Array.isArray(index) ? index : [])
      .filter(item => item.category_id === category)
      .map(item => ({ ...item, kind: "article" }));
  };

  loadCategoryItems().then(items => setLoadMoreState(items.length));

  button.addEventListener("click", async () => {
    if (button.disabled || button.dataset.loading === "true") return;
    button.dataset.loading = "true";
    const previousText = button.textContent;
    button.textContent = "Se incarca...";
    try {
      const allItems = await loadCategoryItems();
      const offset = Number(button.dataset.offset || 0);
      const next = allItems.slice(offset, offset + step);
      if (!next.length) {
        setLoadMoreState(allItems.length);
        return;
      }

      grid.insertAdjacentHTML("beforeend", next.map((item, localIndex) => renderLoadMoreCard(item, offset + localIndex)).join(""));
      localizeLinks(grid);
      const nextOffset = offset + next.length;
      button.dataset.offset = String(nextOffset);
      setLoadMoreState(allItems.length);
    } catch (error) {
      button.textContent = previousText || "Incearca din nou";
      button.disabled = false;
      button.removeAttribute("aria-disabled");
    } finally {
      delete button.dataset.loading;
    }
  });
});
document.querySelectorAll(".vehicle-carousel").forEach(carousel => {
  const slides = [...carousel.querySelectorAll(".vehicle-slide")];
  const dots = [...carousel.querySelectorAll(".carousel-dots button")];
  const count = carousel.querySelector(".carousel-count");
  const prev = carousel.querySelector(".carousel-prev");
  const next = carousel.querySelector(".carousel-next");
  let currentSlide = 0;
  let timer;

  if (!slides.length) return;

  const showSlide = index => {
    currentSlide = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === currentSlide;
      slide.classList.toggle("active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
      dots[slideIndex]?.classList.toggle("active", isActive);
      dots[slideIndex]?.setAttribute("aria-selected", String(isActive));
    });
    if (count) count.textContent = `${String(currentSlide + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
  };

  const start = () => {
    window.clearInterval(timer);
    timer = window.setInterval(() => showSlide(currentSlide + 1), 5500);
  };

  prev?.addEventListener("click", () => {
    showSlide(currentSlide - 1);
    start();
  });

  next?.addEventListener("click", () => {
    showSlide(currentSlide + 1);
    start();
  });

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showSlide(index);
      start();
    });
  });

  carousel.addEventListener("mouseenter", () => window.clearInterval(timer));
  carousel.addEventListener("mouseleave", start);
  showSlide(0);
  start();
});




if (!window.GTrotsFavorites && !document.querySelector('script[src*="favorites.js"]')) {
  const favoritesScript = document.createElement("script");
  favoritesScript.src = "/favorites.js?v=20260828-global-cart-count";
  favoritesScript.defer = true;
  document.head.append(favoritesScript);
}
