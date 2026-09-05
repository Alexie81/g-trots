(() => {
  if (window.GTrotsConsent) return;

  const STORAGE_KEY = 'g-trots-cookie-consent-v1';
  const MEASUREMENT_ID = 'G-6EWM36QSDY';
  let choice = readChoice();
  let analyticsLoaded = false;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/cookie-consent.css?v=20260905';
  document.head.append(css);

  function readChoice() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return parsed && parsed.version === 1 ? parsed : null;
    } catch { return null; }
  }

  function normalize(value) {
    return {
      version: 1,
      necessary: true,
      preferences: Boolean(value?.preferences),
      analytics: Boolean(value?.analytics),
      marketing: Boolean(value?.marketing),
      saved_at: new Date().toISOString()
    };
  }

  function save(value) {
    choice = normalize(value);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(choice)); } catch { /* browser storage may be disabled */ }
    apply(choice);
    document.querySelector('.gt-cookie-layer')?.remove();
    window.dispatchEvent(new CustomEvent('g-trots:consent-changed', { detail: { ...choice } }));
  }

  function loadAnalytics() {
    if (analyticsLoaded || document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"]`)) return;
    analyticsLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: choice?.marketing ? 'granted' : 'denied',
      ad_user_data: choice?.marketing ? 'granted' : 'denied',
      ad_personalization: choice?.marketing ? 'granted' : 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, { anonymize_ip: true });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.append(script);
  }

  function apply(value) {
    if (value?.analytics) loadAnalytics();
    if (window.gtag) window.gtag('consent', 'update', {
      analytics_storage: value?.analytics ? 'granted' : 'denied',
      ad_storage: value?.marketing ? 'granted' : 'denied',
      ad_user_data: value?.marketing ? 'granted' : 'denied',
      ad_personalization: value?.marketing ? 'granted' : 'denied'
    });
  }

  function open(customize = false) {
    document.querySelector('.gt-cookie-layer')?.remove();
    const state = choice || normalize({ preferences: true, analytics: true, marketing: true });
    const layer = document.createElement('div');
    layer.className = 'gt-cookie-layer';
    layer.innerHTML = `<section class="gt-cookie-card" role="dialog" aria-modal="true" aria-labelledby="gt-cookie-title">
      <div class="gt-cookie-brand"><img src="/assets/logo.png" alt=""><div><small>CONTROLUL TĂU</small><h2 id="gt-cookie-title">Preferințe de confidențialitate</h2></div></div>
      <p>Folosim tehnologii necesare pentru coș, securitate și checkout. Analiza, preferințele opționale și marketingul se activează numai dacă le accepți.</p>
      <div class="gt-cookie-details"${customize ? '' : ' hidden'}>
        ${category('necessary', 'Strict necesare', 'Sesiune, securitate, coș și funcțiile de cumpărare.', true, true)}
        ${category('preferences', 'Preferințe', 'Memorează alegeri neesențiale pentru o experiență personalizată.', state.preferences)}
        ${category('analytics', 'Analiză', 'Google Analytics ne ajută să înțelegem utilizarea site-ului.', state.analytics)}
        ${category('marketing', 'Marketing', 'Măsurare și personalizare publicitară, dacă vor fi configurate.', state.marketing)}
      </div>
      <div class="gt-cookie-actions">
        <button type="button" data-consent="reject">Refuză opționalele</button>
        <button type="button" data-consent="customize">${customize ? 'Salvează selecția' : 'Personalizează'}</button>
        <button type="button" class="primary" data-consent="accept">Acceptă toate</button>
      </div>
      <a href="/politica-cookies">Citește politica de cookies</a>
    </section>`;
    document.body.append(layer);
    const details = layer.querySelector('.gt-cookie-details');
    layer.querySelector('[data-consent="reject"]').onclick = () => save({});
    layer.querySelector('[data-consent="accept"]').onclick = () => save({ preferences: true, analytics: true, marketing: true });
    layer.querySelector('[data-consent="customize"]').onclick = event => {
      if (details.hidden) {
        details.hidden = false;
        event.currentTarget.textContent = 'Salvează selecția';
        layer.classList.add('is-customizing');
      } else {
        save({
          preferences: layer.querySelector('[name="gt-consent-preferences"]').checked,
          analytics: layer.querySelector('[name="gt-consent-analytics"]').checked,
          marketing: layer.querySelector('[name="gt-consent-marketing"]').checked
        });
      }
    };
  }

  function category(key, title, description, checked, disabled = false) {
    return `<label><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" name="gt-consent-${key}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}><i aria-hidden="true"></i></label>`;
  }

  window.GTrotsConsent = { open: () => open(true), get: () => choice ? { ...choice } : null };
  document.addEventListener('g-trots:open-consent', () => open(true));
  if (choice) apply(choice);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => open(false), { once: true });
  else open(false);
})();
