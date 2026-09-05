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

menuButton.addEventListener("click", () => {
  const isOpen = navigation.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Închide meniul" : "Deschide meniul");
  document.body.classList.toggle("menu-open", isOpen);
});

navigation.addEventListener("click", event => {
  if (!event.target.closest("a")) return;
  navigation.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Deschide meniul");
  document.body.classList.remove("menu-open");
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !navigation.classList.contains("open")) return;
  navigation.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Deschide meniul");
  document.body.classList.remove("menu-open");
  menuButton.focus();
});

document.addEventListener("click", event => {
  if (!navigation.classList.contains("open") || navigation.contains(event.target) || menuButton.contains(event.target)) return;
  navigation.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Deschide meniul");
  document.body.classList.remove("menu-open");
});

const revealObserver = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll(".reveal").forEach(element => revealObserver.observe(element));

const typewriterHeading = document.querySelector(".hero-typewriter");
const typewriterText = document.querySelector(".hero-typewriter-text");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const productCount = document.querySelector("[data-product-count]");

const secondHandBanner = document.querySelector("[data-second-hand-banner]");
if (secondHandBanner) {
  const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
    || window.location.hostname.endsWith(".localhost");

  if (!isLocalPreview) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    fetch("https://g-trots.ro/shop-api/api-v2.php?action=publicCatalogFilters", {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Catalog indisponibil")))
      .then(payload => {
        const categories = Array.isArray(payload?.categories) ? payload.categories : [];
        const systemKey = secondHandBanner.dataset.categorySystemKey;
        const category = categories.find(item => item?.system_key === systemKey);
        if (!category) {
          secondHandBanner.hidden = true;
          return;
        }
        const url = new URL(secondHandBanner.href, window.location.href);
        url.searchParams.set("category_key", systemKey);
        url.searchParams.set("category", category.slug || category.id);
        url.searchParams.set("filters", "open");
        secondHandBanner.href = `${url.pathname}${url.search}${url.hash}`;
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timeout));
  }
}

const secondHandTitle = document.querySelector(".second-hand-title");
const secondHandTitleText = document.querySelector(".second-hand-title-typed");

if (secondHandTitle && secondHandTitleText) {
  const phrase = "Pregătite pentru încă un drum.";
  const wait = duration => new Promise(resolve => window.setTimeout(resolve, duration));
  let animationStarted = false;

  const renderSecondHandTitle = length => {
    secondHandTitleText.textContent = phrase.slice(0, length);
  };

  if (prefersReducedMotion) {
    renderSecondHandTitle(phrase.length);
  } else {
    const animate = async (from, to, step, speed) => {
      secondHandTitle.classList.add("is-typing");
      for (let index = from; index !== to; index += step) {
        renderSecondHandTitle(index);
        await wait(speed);
      }
      renderSecondHandTitle(to);
      secondHandTitle.classList.remove("is-typing");
    };

    const runSecondHandTypewriter = async () => {
      while (true) {
        await animate(0, phrase.length, 1, 67);
        await wait(2600);
        await animate(phrase.length, 0, -1, 39);
        await wait(720);
      }
    };

    renderSecondHandTitle(0);
    const titleObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || animationStarted) return;
      animationStarted = true;
      titleObserver.disconnect();
      window.setTimeout(runSecondHandTypewriter, 320);
    }, { threshold: 0.35 });
    titleObserver.observe(secondHandTitle);
  }
}

if (productCount) {
  const finalCount = Number(productCount.dataset.countTo || 0);
  const formatCount = value => Math.round(value).toLocaleString("ro-RO");

  if (prefersReducedMotion) {
    productCount.textContent = formatCount(finalCount);
  } else {
    const countObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      countObserver.disconnect();

      const duration = 1900;
      const startTime = performance.now();

      const animateCount = currentTime => {
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 4);
        productCount.textContent = formatCount(finalCount * easedProgress);

        if (progress < 1) requestAnimationFrame(animateCount);
      };

      requestAnimationFrame(animateCount);
    }, { threshold: 0.65 });

    countObserver.observe(productCount);
  }
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTypewriterText(phrase, length = phrase.text.length) {
  const typedText = phrase.text.slice(0, length);
  typewriterHeading.classList.toggle("is-title", phrase.kind === "title");
  typewriterHeading.classList.toggle("is-supporting", phrase.kind === "supporting");

  if (phrase.kind === "title") {
    const [firstLine] = phrase.text.split("\n");
    const firstPart = typedText.slice(0, firstLine.length);
    const secondPart = typedText.slice(firstLine.length + 1);
    typewriterText.innerHTML = `${escapeHtml(firstPart)}${typedText.length > firstLine.length ? "<br>" : ""}<em>${escapeHtml(secondPart)}</em>`;
    return;
  }

  const accentWord = "Diagnosticăm";
  const endingAccent = "să începem.";
  const endingAccentStart = phrase.text.indexOf(endingAccent);

  if (typedText.length <= accentWord.length) {
    typewriterText.innerHTML = `<em>${escapeHtml(typedText)}</em>`;
    return;
  }

  if (endingAccentStart !== -1 && typedText.length > endingAccentStart) {
    const middleText = typedText.slice(accentWord.length, endingAccentStart);
    const endingText = typedText.slice(endingAccentStart);
    typewriterText.innerHTML = `<em>${escapeHtml(accentWord)}</em>${escapeHtml(middleText)}<em>${escapeHtml(endingText)}</em>`;
    return;
  }

  typewriterText.innerHTML = `<em>${escapeHtml(accentWord)}</em>${escapeHtml(typedText.slice(accentWord.length))}`;
}

if (typewriterHeading && typewriterText) {
  const typewriterPhrases = [
    {
      kind: "title",
      text: "Trotineta ta.\nReparată corect."
    },
    {
      kind: "supporting",
      text: "Diagnosticăm clar, reparăm atent și îți spunem ce facem înainte să începem."
    }
  ];

  if (prefersReducedMotion) {
    renderTypewriterText(typewriterPhrases[0]);
  } else {
    let phraseIndex = 0;
    let characterIndex = typewriterPhrases[0].text.length;
    let isDeleting = true;

    renderTypewriterText(typewriterPhrases[0], characterIndex);

    const runTypewriter = () => {
      const phrase = typewriterPhrases[phraseIndex];
      renderTypewriterText(phrase, characterIndex);

      if (!isDeleting && characterIndex === phrase.text.length) {
        isDeleting = true;
        window.setTimeout(runTypewriter, phrase.kind === "title" ? 2300 : 3300);
        return;
      }

      if (isDeleting && characterIndex === 0) {
        typewriterHeading.classList.add("is-switching");
        phraseIndex = (phraseIndex + 1) % typewriterPhrases.length;
        isDeleting = false;
        window.setTimeout(() => {
          renderTypewriterText(typewriterPhrases[phraseIndex], 0);
          window.setTimeout(() => {
            typewriterHeading.classList.remove("is-switching");
            runTypewriter();
          }, 360);
        }, 120);
        return;
      }

      characterIndex += isDeleting ? -1 : 1;
      const delay = isDeleting ? 54 : typewriterPhrases[phraseIndex].kind === "title" ? 92 : 58;
      window.setTimeout(runTypewriter, delay);
    };

    window.setTimeout(runTypewriter, 1900);
  }
}

const contactTypewriter = document.querySelector(".contact-typewriter");
const contactTypewriterText = document.querySelector(".contact-typewriter-text");

if (contactTypewriter && contactTypewriterText) {
  const contactPhrase = "Programează-ți trotineta la o reparație de calitate.";
  const contactAccent = "reparație de calitate.";
  const contactAccentStart = contactPhrase.indexOf(contactAccent);
  let contactCharacterIndex = contactAccentStart;
  let contactIsDeleting = false;
  let contactAnimationStarted = false;

  const renderContactTypewriter = () => {
    const typedText = contactPhrase.slice(0, contactCharacterIndex);

    if (contactAccentStart !== -1 && typedText.length > contactAccentStart) {
      const regularText = typedText.slice(0, contactAccentStart);
      const accentText = typedText.slice(contactAccentStart);
      contactTypewriterText.innerHTML = `${escapeHtml(regularText)}<em>${escapeHtml(accentText)}</em>`;
      return;
    }

    contactTypewriterText.textContent = typedText;
  };

  if (prefersReducedMotion) {
    contactCharacterIndex = contactPhrase.length;
    renderContactTypewriter();
  } else {
    const runContactTypewriter = () => {
      renderContactTypewriter();

      if (!contactIsDeleting && contactCharacterIndex === contactPhrase.length) {
        contactIsDeleting = true;
        window.setTimeout(runContactTypewriter, 2100);
        return;
      }

      if (contactIsDeleting && contactCharacterIndex === 0) {
        contactIsDeleting = false;
        window.setTimeout(runContactTypewriter, 700);
        return;
      }

      contactCharacterIndex += contactIsDeleting ? -1 : 1;
      window.setTimeout(runContactTypewriter, contactIsDeleting ? 72 : 105);
    };

    const contactTypewriterObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || contactAnimationStarted) return;
      contactAnimationStarted = true;
      contactTypewriterObserver.disconnect();
      window.setTimeout(runContactTypewriter, 300);
    }, { threshold: 0.35 });

    renderContactTypewriter();
    contactTypewriterObserver.observe(contactTypewriter);
  }
}

const areaLabelTypewriter = document.querySelector(".area-label-typewriter");
const areaLabelTypewriterText = document.querySelector(".area-label-typewriter-text");
const areaCityTypewriter = document.querySelector(".area-city-typewriter");
const areaCityTypewriterText = document.querySelector(".area-city-typewriter-text");

if (areaLabelTypewriter && areaLabelTypewriterText && areaCityTypewriter && areaCityTypewriterText) {
  const areaLabelPhrase = "Aproape de tine";
  const areaCityPhrase = "București și Ilfov.";
  let areaTypewriterStarted = false;
  const wait = duration => new Promise(resolve => window.setTimeout(resolve, duration));

  const animateAreaPhrase = async (container, textElement, phrase, isDeleting, speed) => {
    container.classList.add("is-typing");
    const start = isDeleting ? phrase.length : 0;
    const end = isDeleting ? 0 : phrase.length;
    const direction = isDeleting ? -1 : 1;

    for (let index = start; index !== end; index += direction) {
      textElement.textContent = phrase.slice(0, index);
      await wait(speed);
    }

    textElement.textContent = phrase.slice(0, end);
    container.classList.remove("is-typing");
  };

  const renderAreaCityPhrase = length => {
    const typedText = areaCityPhrase.slice(0, length);
    const city = "București";
    const secondary = " și Ilfov";
    const cityPart = typedText.slice(0, city.length);
    const secondaryPart = typedText.slice(city.length, city.length + secondary.length);
    const dotPart = typedText.slice(city.length + secondary.length);

    areaCityTypewriterText.innerHTML = `${escapeHtml(cityPart)}<span class="area-city-secondary">${escapeHtml(secondaryPart)}</span><span class="area-city-accent">${escapeHtml(dotPart)}</span>`;
  };

  const animateAreaCityPhrase = async isDeleting => {
    areaCityTypewriter.classList.add("is-typing");
    const start = isDeleting ? areaCityPhrase.length : 0;
    const end = isDeleting ? 0 : areaCityPhrase.length;
    const direction = isDeleting ? -1 : 1;

    for (let index = start; index !== end; index += direction) {
      renderAreaCityPhrase(index);
      await wait(isDeleting ? 78 : 112);
    }

    renderAreaCityPhrase(end);
    areaCityTypewriter.classList.remove("is-typing");
  };

  if (prefersReducedMotion) {
    areaLabelTypewriterText.textContent = areaLabelPhrase;
    renderAreaCityPhrase(areaCityPhrase.length);
  } else {
    const runAreaTypewriterSequence = async () => {
      while (true) {
        await animateAreaPhrase(areaLabelTypewriter, areaLabelTypewriterText, areaLabelPhrase, false, 82);
        await wait(220);
        await animateAreaCityPhrase(false);
        await wait(2100);
        await animateAreaCityPhrase(true);
        await wait(180);
        await animateAreaPhrase(areaLabelTypewriter, areaLabelTypewriterText, areaLabelPhrase, true, 60);
        await wait(700);
      }
    };

    const areaTypewriterObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || areaTypewriterStarted) return;
      areaTypewriterStarted = true;
      areaTypewriterObserver.disconnect();
      window.setTimeout(runAreaTypewriterSequence, 280);
    }, { threshold: 0.35 });

    areaTypewriterObserver.observe(areaLabelTypewriter);
  }
}

const faqDirectTypewriter = document.querySelector(".faq-direct-typewriter");
const faqDirectTypewriterText = document.querySelector(".faq-direct-typewriter-text");

if (faqDirectTypewriter && faqDirectTypewriterText) {
  const faqDirectPhrase = "direct.";
  let faqTypewriterStarted = false;
  const wait = duration => new Promise(resolve => window.setTimeout(resolve, duration));

  const animateFaqDirect = async isDeleting => {
    faqDirectTypewriter.classList.add("is-typing");
    const start = isDeleting ? faqDirectPhrase.length : 0;
    const end = isDeleting ? 0 : faqDirectPhrase.length;
    const direction = isDeleting ? -1 : 1;

    for (let index = start; index !== end; index += direction) {
      faqDirectTypewriterText.textContent = faqDirectPhrase.slice(0, index);
      await wait(isDeleting ? 78 : 112);
    }

    faqDirectTypewriterText.textContent = faqDirectPhrase.slice(0, end);
    faqDirectTypewriter.classList.remove("is-typing");
  };

  if (prefersReducedMotion) {
    faqDirectTypewriterText.textContent = faqDirectPhrase;
  } else {
    const runFaqDirectTypewriter = async () => {
      while (true) {
        await animateFaqDirect(false);
        await wait(2100);
        await animateFaqDirect(true);
        await wait(700);
      }
    };

    const faqDirectObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || faqTypewriterStarted) return;
      faqTypewriterStarted = true;
      faqDirectObserver.disconnect();
      window.setTimeout(runFaqDirectTypewriter, 280);
    }, { threshold: 0.35 });

    faqDirectObserver.observe(faqDirectTypewriter);
  }
}

const processLabelTypewriter = document.querySelector(".process-label-typewriter");
const processLabelTypewriterText = document.querySelector(".process-label-typewriter-text");
const processMessageTypewriter = document.querySelector(".process-message-typewriter");
const processMessageTypewriterText = document.querySelector(".process-message-typewriter-text");

if (processLabelTypewriter && processLabelTypewriterText && processMessageTypewriter && processMessageTypewriterText) {
  const processLabelPhrase = "Cum lucrăm?";
  const processMessagePhrase = "mesaj.";
  let processTypewriterStarted = false;
  const wait = duration => new Promise(resolve => window.setTimeout(resolve, duration));

  const animateProcessPhrase = async (container, textElement, phrase, isDeleting, speed) => {
    container.classList.add("is-typing");
    const start = isDeleting ? phrase.length : 0;
    const end = isDeleting ? 0 : phrase.length;
    const direction = isDeleting ? -1 : 1;

    for (let index = start; index !== end; index += direction) {
      textElement.textContent = phrase.slice(0, index);
      await wait(speed);
    }

    textElement.textContent = phrase.slice(0, end);
    container.classList.remove("is-typing");
  };

  if (prefersReducedMotion) {
    processLabelTypewriterText.textContent = processLabelPhrase;
    processMessageTypewriterText.textContent = processMessagePhrase;
  } else {
    const runProcessTypewriterSequence = async () => {
      while (true) {
        await animateProcessPhrase(processLabelTypewriter, processLabelTypewriterText, processLabelPhrase, false, 82);
        await wait(220);
        await animateProcessPhrase(processMessageTypewriter, processMessageTypewriterText, processMessagePhrase, false, 112);
        await wait(2100);
        await animateProcessPhrase(processMessageTypewriter, processMessageTypewriterText, processMessagePhrase, true, 78);
        await wait(180);
        await animateProcessPhrase(processLabelTypewriter, processLabelTypewriterText, processLabelPhrase, true, 60);
        await wait(700);
      }
    };

    const processTypewriterObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || processTypewriterStarted) return;
      processTypewriterStarted = true;
      processTypewriterObserver.disconnect();
      window.setTimeout(runProcessTypewriterSequence, 280);
    }, { threshold: 0.35 });

    processTypewriterObserver.observe(processLabelTypewriter);
  }
}

const slides = [...document.querySelectorAll(".vehicle-slide")];
const dots = [...document.querySelectorAll(".carousel-dots button")];
const carousel = document.querySelector(".vehicle-carousel");
const count = document.querySelector(".carousel-count");
let currentSlide = 0;
let carouselTimer;

function showSlide(index) {
  currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => {
    const isActive = slideIndex === currentSlide;
    slide.classList.toggle("active", isActive);
    slide.setAttribute("aria-hidden", String(!isActive));
    dots[slideIndex].classList.toggle("active", isActive);
    dots[slideIndex].setAttribute("aria-selected", String(isActive));
  });
  count.textContent = `${String(currentSlide + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
}

function startCarousel() {
  window.clearInterval(carouselTimer);
  carouselTimer = window.setInterval(() => showSlide(currentSlide + 1), 5500);
}

document.querySelector(".carousel-prev").addEventListener("click", () => {
  showSlide(currentSlide - 1);
  startCarousel();
});

document.querySelector(".carousel-next").addEventListener("click", () => {
  showSlide(currentSlide + 1);
  startCarousel();
});

dots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    showSlide(index);
    startCarousel();
  });
});

carousel.addEventListener("mouseenter", () => window.clearInterval(carouselTimer));
carousel.addEventListener("mouseleave", startCarousel);
startCarousel();

const mapStage = document.querySelector(".map-stage");

if (mapStage) {
  const mapPoint = mapStage.querySelector(".bucharest-pulse");

  const moveMapPopup = event => {
    const bounds = mapStage.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - bounds.left, 20), bounds.width - 20);
    const y = Math.min(Math.max(event.clientY - bounds.top, 20), bounds.height - 20);
    mapStage.style.setProperty("--map-popup-x", `${x}px`);
    mapStage.style.setProperty("--map-popup-y", `${y}px`);
    mapStage.classList.toggle("is-popup-left", x > bounds.width * 0.62);
  };

  if (mapPoint) {
    mapPoint.addEventListener("pointerenter", event => {
      mapStage.classList.add("is-point-hover");
      moveMapPopup(event);
    });

    mapPoint.addEventListener("pointermove", moveMapPopup);
    mapPoint.addEventListener("pointerleave", () => {
      mapStage.classList.remove("is-point-hover");
      mapStage.classList.remove("is-popup-left");
    });

    mapPoint.addEventListener("focus", () => {
      mapStage.classList.add("is-point-hover");
      mapStage.style.setProperty("--map-popup-x", "66%");
      mapStage.style.setProperty("--map-popup-y", "72%");
    });

    mapPoint.addEventListener("blur", () => {
      mapStage.classList.remove("is-point-hover");
      mapStage.classList.remove("is-popup-left");
    });
  }
}

const serviceSelect = document.querySelector('select[name="service"]');
const serviceItems = [...document.querySelectorAll(".service-item")];
const serviceAnimations = new WeakMap();

serviceItems.forEach(item => {
  const summary = item.querySelector("summary");
  const content = item.querySelector(".service-content");

  if (item.open) {
    content.style.height = "auto";
    item.dataset.state = "open";
    item.classList.add("is-selected", "is-expanded");
  } else {
    item.dataset.state = "closed";
  }

  summary.addEventListener("click", event => {
    event.preventDefault();

    if (item.dataset.state === "open" || item.dataset.state === "opening") {
      closeServiceItem(item);
      return;
    }

    serviceItems.forEach(otherItem => {
      if (
        otherItem !== item &&
        (otherItem.dataset.state === "open" || otherItem.dataset.state === "opening")
      ) {
        closeServiceItem(otherItem);
      }
    });

    openServiceItem(item);
    serviceSelect.value = item.dataset.service;
  });

  const serviceLink = item.querySelector("a");
  if (serviceLink) {
    serviceLink.addEventListener("click", () => {
      serviceSelect.value = item.dataset.service;
    });
  }
});

function cancelServiceAnimation(item) {
  const animation = serviceAnimations.get(item);
  if (!animation) return;

  window.clearTimeout(animation.fallback);
  animation.content.removeEventListener("transitionend", animation.onEnd);
  serviceAnimations.delete(item);
}

function finishServiceAnimation(item, content, finish) {
  const animation = {};

  animation.content = content;
  animation.onEnd = event => {
    if (event.propertyName !== "height" || serviceAnimations.get(item) !== animation) return;
    complete();
  };

  const complete = () => {
    if (serviceAnimations.get(item) !== animation) return;
    window.clearTimeout(animation.fallback);
    content.removeEventListener("transitionend", animation.onEnd);
    serviceAnimations.delete(item);
    finish();
  };

  content.addEventListener("transitionend", animation.onEnd);
  animation.fallback = window.setTimeout(complete, 640);
  serviceAnimations.set(item, animation);
}

function openServiceItem(item) {
  const content = item.querySelector(".service-content");
  const startHeight = content.getBoundingClientRect().height;

  cancelServiceAnimation(item);
  item.dataset.state = "opening";
  item.classList.remove("is-closing");
  item.classList.add("is-selected", "is-expanded");
  item.open = true;

  content.style.height = `${startHeight}px`;
  void content.offsetHeight;
  content.style.height = `${content.scrollHeight}px`;

  finishServiceAnimation(item, content, () => {
    if (item.dataset.state !== "opening") return;
    item.dataset.state = "open";
    content.style.height = "auto";
  });
}

function closeServiceItem(item) {
  const content = item.querySelector(".service-content");
  const startHeight = content.getBoundingClientRect().height;

  cancelServiceAnimation(item);
  item.dataset.state = "closing";
  item.classList.remove("is-selected", "is-expanded");
  item.classList.add("is-closing");

  content.style.height = `${startHeight}px`;
  void content.offsetHeight;
  content.style.height = "0px";

  finishServiceAnimation(item, content, () => {
    if (item.dataset.state !== "closing") return;
    item.open = false;
    item.dataset.state = "closed";
    item.classList.remove("is-closing");
  });
}

const faqItems = [...document.querySelectorAll(".faq-list details")];
const faqAnimations = new WeakMap();

faqItems.forEach(item => {
  const summary = item.querySelector("summary");
  const answer = item.querySelector(".faq-answer");

  if (item.open) {
    answer.style.height = "auto";
    item.dataset.state = "open";
    item.classList.add("is-expanded");
  } else {
    item.dataset.state = "closed";
  }

  summary.addEventListener("click", event => {
    event.preventDefault();

    if (item.dataset.state === "open" || item.dataset.state === "opening") {
      closeFaqItem(item);
      return;
    }

    faqItems.forEach(otherItem => {
      if (
        otherItem !== item &&
        (otherItem.dataset.state === "open" || otherItem.dataset.state === "opening")
      ) {
        closeFaqItem(otherItem);
      }
    });

    openFaqItem(item);
  });
});

function cancelFaqAnimation(item) {
  const animation = faqAnimations.get(item);
  if (!animation) return;

  window.clearTimeout(animation.fallback);
  animation.answer.removeEventListener("transitionend", animation.onEnd);
  faqAnimations.delete(item);
}

function finishFaqAnimation(item, answer, finish) {
  const animation = {};

  animation.answer = answer;
  animation.onEnd = event => {
    if (event.propertyName !== "height" || faqAnimations.get(item) !== animation) return;
    complete();
  };

  const complete = () => {
    if (faqAnimations.get(item) !== animation) return;
    window.clearTimeout(animation.fallback);
    answer.removeEventListener("transitionend", animation.onEnd);
    faqAnimations.delete(item);
    finish();
  };

  answer.addEventListener("transitionend", animation.onEnd);
  animation.fallback = window.setTimeout(complete, 650);
  faqAnimations.set(item, animation);
}

function openFaqItem(item) {
  const answer = item.querySelector(".faq-answer");
  const startHeight = answer.getBoundingClientRect().height;

  cancelFaqAnimation(item);
  item.dataset.state = "opening";
  item.classList.remove("is-closing");
  item.classList.add("is-expanded");
  item.open = true;

  answer.style.height = `${startHeight}px`;
  void answer.offsetHeight;
  answer.style.height = `${answer.scrollHeight}px`;

  finishFaqAnimation(item, answer, () => {
    if (item.dataset.state !== "opening") return;
    item.dataset.state = "open";
    answer.style.height = "auto";
  });
}

function closeFaqItem(item) {
  const answer = item.querySelector(".faq-answer");
  const startHeight = answer.getBoundingClientRect().height;

  cancelFaqAnimation(item);
  item.dataset.state = "closing";
  item.classList.remove("is-expanded");
  item.classList.add("is-closing");

  answer.style.height = `${startHeight}px`;
  void answer.offsetHeight;
  answer.style.height = "0px";

  finishFaqAnimation(item, answer, () => {
    if (item.dataset.state !== "closing") return;
    item.open = false;
    item.dataset.state = "closed";
    item.classList.remove("is-closing");
  });
}

document.querySelector(".contact-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = [
    "Bună, doresc o programare la G-Trots.",
    `Nume: ${form.get("name")}`,
    `Telefon: ${form.get("phone")}`,
    `Serviciu: ${form.get("service") || "Nu știu încă"}`,
    `Detalii: ${form.get("message") || "Fără detalii suplimentare"}`
  ].join("\n");
  const whatsappUrl = `https://wa.me/40762093915?text=${encodeURIComponent(message)}`;
  event.currentTarget.querySelector(".form-status").textContent = "Se deschide conversația WhatsApp cu solicitarea pregătită.";
  window.open(whatsappUrl, "_blank", "noopener");
});
