(() => {
  if (window.GTrotsLiveShop) return;

  const API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  const legacyImages = {
    "anvelopa-g10-all-terrain": 1,
    "display-smart-ride-s3": 2,
    "incarcator-fastcharge-54-6v": 3,
    "motor-dualhub-x2-2000w": 4,
    "baterie-powercore-52v-23ah": 5,
    "kit-frana-hydrostop-pro": 6
  };

  function ensureStyles() {
    if (document.querySelector('link[href*="shop-live.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/shop-live.css?v=20260826-4";
    document.head.append(link);
  }

  function formatMoney(value) {
    return `${new Intl.NumberFormat("ro-RO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value) || 0)} lei`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function stockLabel(product) {
    if (product.stock_mode === "unlimited") return "În stoc";
    const quantity = Number(product.stock_quantity || 0);
    if (quantity <= 0) return "Stoc epuizat";
    return quantity <= Number(product.low_stock_threshold || 3) ? "Stoc limitat" : "În stoc";
  }

  function normalizeProduct(product) {
    const slug = String(product.slug || product.id || "");
    const currentPrice = product.sale_price == null ? Number(product.price || 0) : Number(product.sale_price || 0);
    return {
      id: slug,
      slug,
      apiId: String(product.id || ""),
      name: String(product.name || "Produs G-Trots"),
      category: String(product.category_name || "Produs G-Trots"),
      description: String(product.short_description || "Produs disponibil în magazinul G-Trots."),
      price: formatMoney(currentPrice),
      priceValue: currentPrice,
      regularPriceValue: Number(product.price || 0),
      stock: stockLabel(product),
      image: Number(product.images?.[0]?.sprite_index || legacyImages[slug] || 0),
      imageUrl: product.images?.[0]?.sprite_index ? "" : safeUrl(product.images?.[0]?.url),
      url: `/magazin/produs/${encodeURIComponent(slug)}/`,
      raw: product
    };
  }

  async function api(action, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}${options.query || ""}`, {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Eroare magazin (${response.status})`);
      return payload;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function registerProducts(products) {
    const normalized = products.map(normalizeProduct);
    window.GTrotsFavorites?.registerProducts?.(normalized, { authoritative: true });
    window.GTrotsShopCatalog?.renderLiveProducts?.(products);
    document.dispatchEvent(new CustomEvent("g-trots:live-products", { detail: normalized }));
    return normalized;
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = String(value ?? "");
  }

  function setMeta(selector, value) {
    if (!value) return;
    let element = document.querySelector(selector);
    if (!element && selector.startsWith('meta[property="')) {
      element = document.createElement("meta");
      element.setAttribute("property", selector.match(/property="([^"]+)/)?.[1] || "");
      document.head.append(element);
    }
    element?.setAttribute("content", String(value));
  }

  function sanitizedRichHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    template.content.querySelectorAll("script,iframe,object,embed,form,input,button,textarea,select,meta,link,style").forEach(node => node.remove());
    template.content.querySelectorAll("*").forEach(node => {
      [...node.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith("on") || name === "srcdoc") node.removeAttribute(attribute.name);
        if ((name === "href" || name === "src") && /^javascript:/i.test(value)) node.removeAttribute(attribute.name);
      });
    });
    return template.innerHTML;
  }

  function applyProductImages(product, normalized) {
    const mainImage = document.querySelector("[data-product-image]");
    const visual = document.querySelector(".product-detail-visual");
    if (!mainImage || !visual) return;
    const legacyThumbs = document.querySelector(".product-gallery-thumbs");
    const legacyNavigation = visual.querySelector(".product-gallery-nav");
    const legacyDots = visual.querySelector(".product-gallery-dots");
    if (legacyDots) { legacyDots.hidden = true; legacyDots.style.display = "none"; }
    const images = Array.isArray(product.images) ? product.images.filter(image => !image.sprite_index).map(image => ({
      url: safeUrl(image.url),
      alt: String(image.alt_text || product.name || "Produs G-Trots")
    })).filter(image => image.url) : [];

    let activeIndex = 0;
    function showImage(index) {
      activeIndex = Math.max(0, Math.min(images.length - 1, index));
      const selected = images[activeIndex];
      mainImage.className = `product-detail-image${selected ? " product-detail-image-live" : normalized.image ? ` product-image-${normalized.image}` : ""}`;
      mainImage.style.backgroundImage = selected ? `url("${selected.url.replace(/"/g, "%22")}")` : "";
      mainImage.setAttribute("aria-label", selected?.alt || normalized.name);
      const viewerArt = document.querySelector("[data-viewer-art]");
      if (viewerArt) {
        viewerArt.className = `product-image-viewer__art${selected ? " product-detail-image-live" : normalized.image ? ` product-image-${normalized.image}` : ""}`;
        viewerArt.style.backgroundImage = selected ? `url("${selected.url.replace(/"/g, "%22")}")` : "";
      }
      visual.querySelectorAll("[data-live-gallery-index]").forEach((button, buttonIndex) => {
        button.classList.toggle("active", buttonIndex === activeIndex);
        button.setAttribute("aria-current", buttonIndex === activeIndex ? "true" : "false");
      });
    }

    visual.querySelector(".product-live-gallery")?.remove();
    if (legacyThumbs && images.length) {
      legacyThumbs.replaceChildren(...images.map((image, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.liveGalleryIndex = String(index);
        button.setAttribute("aria-label", `Arată fotografia ${index + 1}`);
        button.style.backgroundImage = `url("${image.url.replace(/"/g, "%22")}")`;
        button.style.backgroundSize = "cover";
        button.style.backgroundPosition = "center";
        button.addEventListener("click", () => showImage(index));
        return button;
      }));
      legacyThumbs.hidden = false;
      legacyThumbs.style.display = "flex";
    } else if (legacyThumbs) {
      legacyThumbs.hidden = true;
      legacyThumbs.style.display = "none";
    }
    if (legacyNavigation) {
      if (images.length > 1) {
        const previous = legacyNavigation.querySelector("[data-gallery-previous]")?.cloneNode(true);
        const next = legacyNavigation.querySelector("[data-gallery-next]")?.cloneNode(true);
        legacyNavigation.replaceChildren(...[previous, next].filter(Boolean));
        previous?.addEventListener("click", () => showImage((activeIndex - 1 + images.length) % images.length));
        next?.addEventListener("click", () => showImage((activeIndex + 1) % images.length));
        legacyNavigation.hidden = false;
        legacyNavigation.style.display = "flex";
      } else {
        legacyNavigation.hidden = true;
        legacyNavigation.style.display = "none";
      }
    }
    if (!legacyThumbs && images.length > 1) {
      const gallery = document.createElement("nav");
      gallery.className = "product-live-gallery";
      gallery.setAttribute("aria-label", "Fotografiile produsului");
      images.forEach((image, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.liveGalleryIndex = String(index);
        button.setAttribute("aria-label", `Arată fotografia ${index + 1}`);
        button.style.backgroundImage = `url("${image.url.replace(/"/g, "%22")}")`;
        button.addEventListener("click", () => showImage(index));
        gallery.append(button);
      });
      visual.append(gallery);
    }
    const viewer = document.querySelector(".product-image-viewer");
    viewer?.classList.add("has-single-image");
    setText("[data-viewer-total]", "1");
    setText("#product-image-viewer-title", normalized.name);
    showImage(0);
  }

  function ensureProductCommerce(product, normalized) {
    const copy = document.querySelector(".product-detail-copy");
    if (!copy) return;
    const existingInput = copy.querySelector("[data-product-quantity]");
    const existingButton = copy.querySelector("[data-product-add-cart]");
    if (existingInput && existingButton) {
      const available = product.stock_mode === "unlimited" ? 99 : Number(product.stock_quantity || 0);
      existingInput.max = String(Math.max(1, available));
      existingInput.value = String(Math.max(1, Math.min(Number(existingInput.value || 1), Math.max(1, available))));
      existingButton.disabled = available <= 0;
      const buttonText = existingButton.querySelector("strong");
      if (buttonText && available <= 0) buttonText.textContent = "Stoc epuizat";
      return;
    }
    let commerce = copy.querySelector(".live-product-commerce");
    if (!commerce) {
      commerce = document.createElement("div");
      commerce.className = "live-product-commerce";
      commerce.innerHTML = `
        <label>Cantitate <input type="number" min="1" value="1" inputmode="numeric" data-live-product-quantity></label>
        <button type="button" data-live-add-cart><span class="global-cart-icon" aria-hidden="true"><i></i><i></i></span><strong>Adaugă în coș</strong></button>
        <p data-live-cart-feedback aria-live="polite"></p>`;
      const before = copy.querySelector("[data-product-whatsapp]");
      copy.insertBefore(commerce, before || null);
    }
    const input = commerce.querySelector("[data-live-product-quantity]");
    const button = commerce.querySelector("[data-live-add-cart]");
    const feedback = commerce.querySelector("[data-live-cart-feedback]");
    const available = product.stock_mode === "unlimited" ? 99 : Number(product.stock_quantity || 0);
    input.max = String(Math.max(1, Math.min(99, available || 1)));
    button.disabled = available <= 0;
    button.querySelector("strong").textContent = available <= 0 ? "Stoc epuizat" : "Adaugă în coș";
    button.onclick = () => {
      if (button.disabled || !window.GTrotsCart) return;
      const quantity = Math.max(1, Math.min(Number(input.max), Number.parseInt(input.value, 10) || 1));
      const current = window.GTrotsCart.get().find(item => item.id === normalized.id)?.quantity || 0;
      if (current === 0) window.GTrotsCart.add(normalized.id);
      if (quantity > 1) window.GTrotsCart.changeQuantity(normalized.id, quantity - 1);
      input.value = String(quantity);
      feedback.textContent = `${quantity} ${quantity === 1 ? "produs adăugat" : "produse adăugate"} în coș.`;
      button.classList.add("is-confirmed");
      window.setTimeout(() => button.classList.remove("is-confirmed"), 1500);
    };
  }

  function ensureRichDescription(product, normalized) {
    document.querySelector("[data-live-product-description]")?.remove();
    const section = document.querySelector("#descriere");
    if (!section) return;
    const description = sanitizedRichHtml(product.description_html || "") || `<p>${escapeHtml(product.short_description || "")}</p>`;
    const heading = section.querySelector(".product-section-heading");
    if (heading) {
      const title = heading.querySelector("h2");
      if (title) title.textContent = String(product.description_title || "").trim() || `Detalii complete pentru ${normalized.name}.`;
      const currentCopy = heading.querySelector(".product-rich-copy, p");
      const richCopy = document.createElement("div");
      richCopy.className = "product-rich-copy";
      richCopy.innerHTML = description;
      if (currentCopy) currentCopy.replaceWith(richCopy);
      else heading.append(richCopy);
    }

    const brandNames = Array.isArray(product.brands) ? product.brands.map(brand => brand.name).filter(Boolean) : [];
    const compatibility = brandNames.length ? brandNames.join(", ") : "compatibilitatea se confirmă după model";
    const featureGrid = section.querySelector(".product-feature-grid");
    if (featureGrid) {
      const features = [
        ["01", "Informații complete", product.short_description || "Detaliile esențiale ale produsului sunt prezentate clar înainte de comandă."],
        ["02", "Selectat de G-Trots", "Verificat pentru prezentare clară și disponibilitate actualizată în magazin."],
        ["03", "Compatibilitate", `Potrivit pentru ${compatibility}. Verificăm configurația exactă înainte de expediere.`],
        ["04", "Suport tehnic", "Primești ajutor pentru identificarea piesei, compatibilitate și opțiunile de montaj în service."]
      ];
      featureGrid.innerHTML = features.map(([number, title, copy]) => `<article><b>${number}</b><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></article>`).join("");
    }

    const fitNotice = section.querySelector(".product-fit-notice");
    if (fitNotice) {
      const noticeTitle = fitNotice.querySelector("strong");
      const noticeCopy = fitNotice.querySelector("p");
      const noticeLink = fitNotice.querySelector("a");
      if (noticeTitle) noticeTitle.textContent = "Important înainte de comandă";
      if (noticeCopy) noticeCopy.textContent = `Trimite-ne modelul complet al trotinetei și, dacă este necesar, o fotografie. Confirmăm dacă ${normalized.name} este potrivit pentru configurația ta.`;
      if (noticeLink) noticeLink.href = `https://wa.me/40762093915?text=${encodeURIComponent(`Bună, vreau să verific compatibilitatea pentru ${normalized.name}.`)}`;
    }

    const specificationSection = document.querySelector("#specificatii");
    const specificationTab = document.querySelector('.product-content-tabs a[href="#specificatii"]');
    const savedSpecifications = Array.isArray(product.specifications) ? product.specifications.filter(item => item?.label && item?.value) : [];
    const hasSpecifications = savedSpecifications.length > 0;
    if (specificationSection) {
      specificationSection.hidden = !hasSpecifications;
      specificationSection.style.display = hasSpecifications ? "" : "none";
    }
    if (specificationTab) {
      specificationTab.hidden = !hasSpecifications;
      specificationTab.style.display = hasSpecifications ? "" : "none";
    }

    const specGroups = document.querySelector("#specificatii .product-spec-groups");
    if (specGroups && hasSpecifications) {
      const group = (title, rows) => `<article><h3>${escapeHtml(title)}</h3><dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></article>`;
      const grouped = savedSpecifications.reduce((result, item) => {
        const title = String(item.group || "Caracteristici generale");
        (result[title] ||= []).push([item.label, item.value]);
        return result;
      }, {});
      specGroups.innerHTML = Object.entries(grouped).map(([title, rows]) => group(title, rows)).join("");
      requestAnimationFrame(() => window.GTrotsSyncExpandableSections?.());
    } else if (specGroups) {
      specGroups.replaceChildren();
    }

    const specificationIntro = document.querySelector("#specificatii .product-section-heading p");
    if (specificationIntro && hasSpecifications) specificationIntro.textContent = `Specificațiile pentru ${normalized.name} sunt administrate direct din catalogul G-Trots.`;

    const metaSku = document.querySelector(".product-detail-meta small b");
    if (metaSku) metaSku.textContent = product.sku || "—";

    const savedQuestions = Array.isArray(product.questions) ? product.questions.filter(item => item?.question && item?.answer).map(item => [item.question, item.answer]) : [];
    const questions = savedQuestions;
    const questionSection = document.querySelector("#intrebari");
    const questionTab = document.querySelector('.product-content-tabs a[href="#intrebari"]');
    const hasQuestions = questions.length > 0;
    if (questionSection) {
      questionSection.hidden = !hasQuestions;
      questionSection.style.display = hasQuestions ? "" : "none";
    }
    if (questionTab) {
      questionTab.hidden = !hasQuestions;
      questionTab.style.display = hasQuestions ? "" : "none";
    }
    const questionList = document.querySelector("#intrebari .product-faq-list");
    if (questionList && hasQuestions) {
      questionList.replaceChildren(...questions.map(([title, answer], index) => {
        const details = document.createElement("details");
        if (index === 0) details.open = true;
        const summary = document.createElement("summary");
        const number = document.createElement("b");
        const strong = document.createElement("strong");
        const arrow = document.createElement("span");
        const paragraph = document.createElement("p");
        number.textContent = String(index + 1).padStart(2, "0");
        strong.textContent = title;
        arrow.textContent = "›";
        paragraph.textContent = answer;
        summary.append(number, strong, arrow);
        details.append(summary, paragraph);
        return details;
      }));
    } else if (questionList) {
      questionList.replaceChildren();
    }
    const questionCount = document.querySelector("#intrebari .product-faq-count");
    if (questionCount && hasQuestions) {
      const count = questionCount.querySelector("b");
      const label = questionCount.querySelector("span");
      if (count) count.textContent = String(questions.length).padStart(2, "0");
      if (label) label.innerHTML = `${questions.length === 1 ? "răspuns" : "răspunsuri"}<br>esențiale`;
      questionCount.setAttribute("aria-label", `${questions.length} întrebări cu răspuns`);
    }
    const questionLink = document.querySelector("#intrebari .product-question-card a");
    if (questionLink) questionLink.href = `https://wa.me/40762093915?text=${encodeURIComponent(`Bună, am o întrebare despre ${normalized.name}.`)}`;
  }

  async function setupLiveReviews(product) {
    const form = document.querySelector("[data-review-form]");
    const list = document.querySelector("[data-review-list]");
    const empty = document.querySelector("[data-reviews-empty]");
    if (!form || !list || form.dataset.liveReviews === "true") return;
    form.dataset.liveReviews = "true";
    const pagination = document.querySelector("[data-review-pagination]");
    if (pagination) pagination.hidden = true;

    function reviewElement(review) {
      const article = document.createElement("article");
      article.className = "review-item";
      const header = document.createElement("header");
      const name = document.createElement("strong");
      const stars = document.createElement("span");
      const message = document.createElement("p");
      const date = document.createElement("small");
      name.textContent = review.customer_name;
      stars.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;
      message.textContent = review.message;
      const parsedDate = new Date(String(review.created_at || "").replace(" ", "T"));
      date.textContent = Number.isNaN(parsedDate.getTime()) ? "Recenzie client" : new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric" }).format(parsedDate);
      header.append(name, stars);
      article.append(header, message, date);
      if (review.admin_reply) {
        const reply = document.createElement("div");
        reply.className = "review-admin-reply";
        const replyTitle = document.createElement("strong");
        const replyMessage = document.createElement("p");
        replyTitle.textContent = "Răspuns G-Trots";
        replyMessage.textContent = review.admin_reply;
        reply.append(replyTitle, replyMessage);
        article.append(reply);
      }
      return article;
    }

    async function loadReviews() {
      const reviews = await api("publicProductReviews", { query: `&id=${encodeURIComponent(product.id)}` });
      const count = reviews.length;
      const average = count ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count : 0;
      const countLabel = count === 1 ? "1 recenzie" : `${count} recenzii`;
      document.querySelectorAll("[data-review-count]").forEach(element => { element.textContent = `(${count})`; });
      document.querySelectorAll("[data-review-average]").forEach(element => { element.textContent = count ? average.toFixed(1).replace(".", ",") : "—"; });
      document.querySelectorAll("[data-review-stars], [data-review-meta] > span").forEach(element => {
        const stars = Array.from({ length: 5 }, (_, index) => {
          const star = document.createElement("i");
          star.textContent = "★";
          star.style.setProperty("--review-star-fill", `${count ? Math.min(1, Math.max(0, average - index)) * 100 : 0}%`);
          return star;
        });
        element.classList.add("review-stars-meter");
        element.replaceChildren(...stars);
      });
      document.querySelectorAll("[data-review-summary-text]").forEach(element => { element.textContent = count ? countLabel : "Nicio recenzie încă"; });
      document.querySelectorAll("[data-review-link-text]").forEach(element => { element.textContent = count ? countLabel : "Fii primul care scrie o recenzie"; });
      document.querySelectorAll("[data-review-meta]").forEach(element => { element.hidden = count === 0; });
      for (let rating = 1; rating <= 5; rating += 1) {
        const ratingCount = reviews.filter(review => Number(review.rating) === rating).length;
        const bar = document.querySelector(`[data-rating-bar="${rating}"]`);
        const label = document.querySelector(`[data-rating-count="${rating}"]`);
        if (bar) bar.style.width = `${count ? ratingCount / count * 100 : 0}%`;
        if (label) label.textContent = String(ratingCount);
      }
      list.replaceChildren(...reviews.map(reviewElement));
      if (empty) empty.hidden = count > 0;
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const data = new FormData(form);
      const submit = form.querySelector('button[type="submit"]');
      const messageElement = form.querySelector("small");
      submit.disabled = true;
      if (messageElement) messageElement.textContent = "Se publică recenzia…";
      try {
        await api("createPublicReview", { method: "POST", body: { product_id: product.id, customer_name: String(data.get("name") || "").trim(), rating: Number(data.get("rating") || 0), message: String(data.get("message") || "").trim() } });
        form.reset();
        form.hidden = true;
        if (messageElement) messageElement.textContent = "Recenzia a fost publicată și este vizibilă pe site.";
        await loadReviews();
      } catch (error) {
        if (messageElement) messageElement.textContent = error instanceof Error ? error.message : "Recenzia nu a putut fi publicată.";
      } finally {
        submit.disabled = false;
      }
    }, true);
    await loadReviews();
  }

  function applyLiveProduct(product) {
    const normalized = normalizeProduct(product);
    window.GTrotsFavorites?.registerProducts?.([normalized]);
    document.body.dataset.productId = normalized.id;
    setText("[data-product-breadcrumb]", normalized.name);
    setText("[data-product-badge]", product.is_featured ? "Recomandat" : "G-Trots");
    setText("[data-product-stock]", normalized.stock);
    setText("[data-product-category]", normalized.category);
    setText("[data-product-title]", normalized.name);
    setText("[data-product-description]", normalized.description);
    setText("[data-product-price]", normalized.price);

    const priceRow = document.querySelector(".product-detail-price-row > div");
    priceRow?.querySelector("del")?.remove();
    if (priceRow && product.sale_price != null) {
      const oldPrice = document.createElement("del");
      oldPrice.textContent = formatMoney(product.price);
      priceRow.append(oldPrice);
    }
    const stock = document.querySelector(".product-detail-stock");
    stock?.classList.toggle("is-low", normalized.stock === "Stoc limitat");
    stock?.classList.toggle("is-out", normalized.stock === "Stoc epuizat");

    const brands = document.querySelector("[data-product-brands]");
    if (brands) {
      brands.replaceChildren();
      const names = Array.isArray(product.brands) ? product.brands.map(brand => brand.name).filter(Boolean) : [];
      (names.length ? names : [product.manufacturer_name || "Universal"]).forEach(name => {
        const badge = document.createElement("b");
        badge.textContent = String(name);
        brands.append(badge);
      });
    }
    const specs = document.querySelector("[data-product-specs]");
    if (specs) {
      const rows = [
        ["Cod produs", product.sku || "—"],
        ["Producător", product.manufacturer_name || "G-Trots"],
        ["Disponibilitate", normalized.stock]
      ];
      specs.replaceChildren(...rows.map(([label, value]) => {
        const row = document.createElement("div");
        const small = document.createElement("small");
        const strong = document.createElement("strong");
        small.textContent = label;
        strong.textContent = value;
        row.append(small, strong);
        return row;
      }));
    }
    const whatsapp = document.querySelector("[data-product-whatsapp]");
    if (whatsapp) whatsapp.href = `https://wa.me/40762093915?text=${encodeURIComponent(`Bună, mă interesează ${normalized.name}. Vreau să verific compatibilitatea înainte de comandă.`)}`;

    document.title = product.meta_title || `${normalized.name} | G-Trots`;
    const metaDescription = product.meta_description || normalized.description;
    setMeta('meta[name="description"]', metaDescription);
    setMeta('meta[property="og:title"]', document.title);
    setMeta('meta[property="og:description"]', metaDescription);
    if (normalized.imageUrl) setMeta('meta[property="og:image"]', normalized.imageUrl);
    const canonicalUrl = `https://g-trots.ro/magazin/produs/${encodeURIComponent(normalized.slug)}/`;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl;
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[name="twitter:title"]', document.title);
    setMeta('meta[name="twitter:description"]', metaDescription);
    if (normalized.imageUrl) setMeta('meta[name="twitter:image"]', normalized.imageUrl);
    setMeta('meta[property="product:price:amount"]', String(product.sale_price ?? product.price ?? 0));
    setMeta('meta[property="product:price:currency"]', product.currency || "RON");
    setMeta('meta[property="product:availability"]', normalized.stock === "Stoc epuizat" ? "out of stock" : "in stock");
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => script.remove());
    const productSchema = document.createElement("script");
    productSchema.type = "application/ld+json";
    productSchema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: normalized.name,
      description: metaDescription,
      image: (product.images || []).map(image => safeUrl(image.url)).filter(Boolean),
      url: canonicalUrl,
      sku: product.sku || undefined,
      category: product.category_name || undefined,
      brand: { "@type": "Brand", name: product.manufacturer_name || "G-Trots" },
      offers: {
        "@type": "Offer",
        priceCurrency: product.currency || "RON",
        price: Number(product.sale_price ?? product.price ?? 0).toFixed(2),
        availability: normalized.stock === "Stoc epuizat" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        url: canonicalUrl,
        seller: { "@type": "Organization", name: "G-Trots" }
      }
    });
    document.head.append(productSchema);
    document.querySelector('meta[name="robots"]')?.setAttribute("content", "index, follow");
    applyProductImages(product, normalized);
    ensureProductCommerce(product, normalized);
    ensureRichDescription(product, normalized);
    setupLiveReviews(product).catch(() => {});
  }

  function cartSubtotal(cart) {
    return cart.reduce((total, item) => {
      const product = window.GTrotsFavorites?.products?.[item.id];
      return total + Number(product?.priceValue || 0) * Number(item.quantity || 0);
    }, 0);
  }

  function currentShippingCost(config, subtotal, shippingId) {
    const shipping = config.shipping_methods.find(method => String(method.id) === String(shippingId));
    if (!shipping) return 0;
    return shipping.free_above != null && subtotal >= Number(shipping.free_above) ? 0 : Number(shipping.cost || 0);
  }

  function setupCheckout(config) {
    const trigger = document.querySelector("[data-cart-checkout]");
    const layout = document.querySelector("[data-cart-layout]");
    if (!trigger || !layout || !config?.shipping_methods?.length) return;
    const payments = [];
    if (config.payments?.cash_on_delivery_enabled) payments.push({ id: "cash_on_delivery", label: config.payments.cash_on_delivery_label || "Ramburs la curier" });
    if (config.payments?.card_enabled) payments.push({ id: "card", label: config.payments.card_label || "Card online" });
    if (!payments.length) return;

    trigger.removeAttribute("target");
    trigger.removeAttribute("href");
    trigger.setAttribute("role", "button");
    trigger.setAttribute("tabindex", "0");

    let panel = document.querySelector("[data-live-checkout]");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "live-checkout-panel";
      panel.dataset.liveCheckout = "";
      panel.hidden = true;
      layout.insertAdjacentElement("afterend", panel);
    }

    const shippingOptions = config.shipping_methods.map((method, index) => `
      <label class="live-checkout-option">
        <input type="radio" name="shipping_method_id" value="${escapeHtml(method.id)}"${index === 0 ? " checked" : ""}>
        <span><strong>${escapeHtml(method.name)}</strong><small>${escapeHtml(method.eta_label || method.description || "Livrare la adresă")}</small></span>
        <b>${Number(method.cost || 0) === 0 ? "Gratuit" : formatMoney(method.cost)}</b>
      </label>`).join("");
    const paymentOptions = payments.map((payment, index) => `
      <label class="live-checkout-option">
        <input type="radio" name="payment_method" value="${payment.id}"${index === 0 ? " checked" : ""}>
        <span><strong>${escapeHtml(payment.label)}</strong><small>${payment.id === "card" ? "Primești instrucțiunile de plată după verificarea comenzii." : "Plătești curierului la livrare."}</small></span>
      </label>`).join("");
    panel.innerHTML = `
      <header><div><span>Finalizare sigură</span><h2>Datele comenzii</h2></div><button type="button" data-checkout-close aria-label="Închide formularul">×</button></header>
      <form data-checkout-form>
        <div class="live-checkout-fields">
          <label><span>Nume și prenume *</span><input name="customer_name" required autocomplete="name"></label>
          <label><span>Telefon *</span><input name="customer_phone" required autocomplete="tel" inputmode="tel"></label>
          <label><span>Email</span><input name="customer_email" type="email" autocomplete="email"></label>
          <label><span>Localitate *</span><input name="city" required autocomplete="address-level2"></label>
          <label><span>Județ</span><input name="county" autocomplete="address-level1"></label>
          <label><span>Cod poștal</span><input name="postal_code" autocomplete="postal-code"></label>
          <label class="is-wide"><span>Adresa completă *</span><input name="address" required autocomplete="street-address"></label>
          <label class="is-wide"><span>Observații</span><textarea name="customer_notes" rows="3" placeholder="Model trotinetă, detalii pentru curier etc."></textarea></label>
        </div>
        <fieldset><legend>Livrare</legend>${shippingOptions}</fieldset>
        <fieldset><legend>Plată</legend>${paymentOptions}</fieldset>
        <div class="live-checkout-final"><div><span>Total comandă</span><strong data-checkout-total>—</strong></div><button type="submit">Trimite comanda <b aria-hidden="true">›</b></button></div>
        <p class="live-checkout-message" data-checkout-message aria-live="polite"></p>
      </form>`;

    const form = panel.querySelector("[data-checkout-form]");
    const message = panel.querySelector("[data-checkout-message]");
    const submit = form.querySelector('button[type="submit"]');

    function updateTotals() {
      const cart = window.GTrotsCart?.get?.() || [];
      const subtotal = cartSubtotal(cart);
      const shippingId = form.elements.shipping_method_id?.value;
      const shippingCost = currentShippingCost(config, subtotal, shippingId);
      document.querySelector("[data-cart-shipping]")?.replaceChildren(document.createTextNode(shippingCost === 0 ? "Gratuit" : formatMoney(shippingCost)));
      document.querySelector("[data-cart-order-total]")?.replaceChildren(document.createTextNode(formatMoney(subtotal + shippingCost)));
      panel.querySelector("[data-checkout-total]").textContent = formatMoney(subtotal + shippingCost);
    }

    function openPanel() {
      panel.hidden = false;
      updateTotals();
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      panel.querySelector("input")?.focus({ preventScroll: true });
    }

    trigger.addEventListener("click", event => {
      event.preventDefault();
      openPanel();
    });
    trigger.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPanel();
      }
    });
    panel.querySelector("[data-checkout-close]").addEventListener("click", () => { panel.hidden = true; });
    form.addEventListener("change", updateTotals);
    document.addEventListener("g-trots:cart-changed", () => window.setTimeout(updateTotals));

    form.addEventListener("submit", async event => {
      event.preventDefault();
      message.className = "live-checkout-message";
      message.textContent = "Se trimite comanda…";
      submit.disabled = true;
      const cart = window.GTrotsCart?.get?.() || [];
      const items = cart.map(item => ({
        product_id: window.GTrotsFavorites?.products?.[item.id]?.apiId,
        quantity: item.quantity
      }));
      if (!items.length || items.some(item => !item.product_id)) {
        message.classList.add("is-error");
        message.textContent = "Un produs din coș nu mai este disponibil. Reîncarcă pagina și încearcă din nou.";
        submit.disabled = false;
        return;
      }
      const fields = Object.fromEntries(new FormData(form).entries());
      try {
        const order = await api("createPublicOrder", { method: "POST", body: { ...fields, items } });
        cart.forEach(item => window.GTrotsCart?.remove?.(item.id));
        form.hidden = true;
        const success = document.createElement("div");
        success.className = "live-checkout-success";
        success.innerHTML = `<span>✓</span><h3>Comanda a fost înregistrată</h3><p>Numărul comenzii este <strong>${escapeHtml(order.order_number || "")}</strong>. Te vom contacta pentru confirmare.</p><a href="/magazin.html">Înapoi la magazin</a>`;
        panel.append(success);
      } catch (error) {
        message.classList.add("is-error");
        message.textContent = error instanceof Error ? error.message : "Comanda nu a putut fi trimisă.";
        submit.disabled = false;
      }
    });
    updateTotals();
  }

  async function initialize() {
    ensureStyles();
    let products = [];
    try {
      products = await api("publicProducts");
      if (Array.isArray(products)) registerProducts(products);
    } catch {
      // Păstrăm catalogul local existent ca rezervă.
    }

    if (document.body.classList.contains("product-page")) {
      const params = new URLSearchParams(window.location.search);
      const pathMatch = window.location.pathname.match(/\/magazin\/produs\/([^/]+)\/?$/i);
      const identifier = pathMatch ? decodeURIComponent(pathMatch[1]) : (params.get("slug") || params.get("id") || document.body.dataset.productId);
      if (identifier) {
        try {
          const product = await api("publicProduct", { query: `&slug=${encodeURIComponent(identifier)}` });
          applyLiveProduct(product);
        } catch {
          // Pagina statică a produsului rămâne disponibilă.
        }
      }
    }

    // Checkout-ul are acum o pagină dedicată. Coșul rămâne o etapă separată,
    // iar pagina checkout.html citește aceleași produse și setări publice.
  }

  window.GTrotsLiveShop = { api, normalizeProduct, registerProducts };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
