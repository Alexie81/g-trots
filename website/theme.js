(() => {
  const STORAGE_KEY = 'g-trots-color-theme-v1';
  const LIGHT = 'light';
  const DARK = 'dark';
  const root = document.documentElement;

  if (window.GTrotsTheme) {
    window.GTrotsTheme.refresh?.();
    return;
  }

  const systemQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

  function storedTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === LIGHT || value === DARK ? value : null;
    } catch {
      return null;
    }
  }

  function preferredTheme() {
    return storedTheme() || (systemQuery?.matches ? DARK : LIGHT);
  }

  function updateThemeColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.append(meta);
    }
    meta.content = theme === DARK ? '#071a36' : '#f7f8fb';
  }

  function updateControls(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const isDark = theme === DARK;
      button.dataset.activeTheme = theme;
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', isDark ? 'Activează tema luminoasă' : 'Activează tema întunecată');
      button.title = isDark ? 'Treci la tema luminoasă' : 'Treci la tema întunecată';
      button.querySelectorAll('[data-theme-option]').forEach(option => {
        const active = option.dataset.themeOption === theme;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
    });
  }

  function apply(theme, options = {}) {
    const normalized = theme === DARK ? DARK : LIGHT;
    root.dataset.theme = normalized;
    root.style.colorScheme = normalized;
    updateThemeColor(normalized);
    updateControls(normalized);
    if (options.persist) {
      try { localStorage.setItem(STORAGE_KEY, normalized); } catch { /* stocarea poate fi blocată */ }
    }
    if (!options.silent) {
      document.dispatchEvent(new CustomEvent('g-trots:theme-changed', {
        detail: { theme: normalized, source: options.persist ? 'client' : 'system' }
      }));
    }
    return normalized;
  }

  function toggle() {
    return apply(root.dataset.theme === DARK ? LIGHT : DARK, { persist: true });
  }

  function bindControls(scope = document) {
    scope.querySelectorAll('[data-theme-toggle]').forEach(button => {
      if (button.dataset.themeBound === '1') return;
      button.dataset.themeBound = '1';
      button.addEventListener('click', toggle);
    });
    updateControls(root.dataset.theme || preferredTheme());
  }

  function refresh() {
    ensureQuickToggle();
    bindControls(document);
    updateControls(root.dataset.theme || preferredTheme());
  }

  function ensureQuickToggle() {
    if (!document.body || document.querySelector('[data-gt-quick-theme]')) return;
    const isShop = /^\/magazin(?:\/|\.html)?$/.test(location.pathname);
    const breadcrumb = isShop ? document.querySelector('.shop-breadcrumb') : null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `gt-theme-icon-toggle ${breadcrumb ? 'gt-theme-inline' : 'gt-theme-dock'}`;
    button.dataset.themeToggle = '';
    button.dataset.gtQuickTheme = '';
    button.innerHTML = '<span data-theme-option="light"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg></span><span data-theme-option="dark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.1A8.5 8.5 0 0 1 8.9 3.6 8.5 8.5 0 1 0 20.4 15.1Z"/></svg></span>';
    (breadcrumb || document.body).append(button);
  }

  apply(preferredTheme(), { silent: true });
  bindControls();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh, { once: true });
  } else refresh();

  const observer = new MutationObserver(records => {
    if (records.some(record => Array.from(record.addedNodes).some(node => node.nodeType === 1 && (node.matches?.('[data-theme-toggle]') || node.querySelector?.('[data-theme-toggle]'))))) {
      bindControls();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  systemQuery?.addEventListener?.('change', event => {
    if (!storedTheme()) apply(event.matches ? DARK : LIGHT);
  });

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) apply(preferredTheme(), { silent: true });
  });

  window.GTrotsTheme = {
    key: STORAGE_KEY,
    apply: theme => apply(theme, { persist: true }),
    current: () => root.dataset.theme || preferredTheme(),
    refresh,
    reset() {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* stocarea poate fi blocată */ }
      return apply(preferredTheme());
    },
    toggle,
  };
})();
