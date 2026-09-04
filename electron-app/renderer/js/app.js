// ─── App controller ───────────────────────────────────────────────────────────
(function() {
  const MODULE_STORAGE_KEY = 'gtrots_active_module_v1';
  const MODULE_TAB_STORAGE_KEYS = {
    service: 'gtrots_last_service_tab_v1',
    shop: 'gtrots_last_shop_tab_v1',
  };
  const moduleDefaultTabs = { service: 'scanner', shop: 'shop-dashboard' };
  const moduleStartTabs = {
    service: localStorage.getItem(MODULE_TAB_STORAGE_KEYS.service) || 'scanner',
    shop: localStorage.getItem(MODULE_TAB_STORAGE_KEYS.shop) || 'shop-dashboard',
  };
  let activeModule = localStorage.getItem(MODULE_STORAGE_KEY) === 'shop' ? 'shop' : 'service';
  let tabChangeRevision = 0;
  let warmedTablesToken = '';

  function rememberedModuleTab(moduleId) {
    const candidate = moduleStartTabs[moduleId];
    const button = document.querySelector(`.nav-btn[data-tab="${candidate}"]`);
    return button?.closest('[data-module-nav]')?.dataset.moduleNav === moduleId
      ? candidate
      : moduleDefaultTabs[moduleId];
  }

  window.SCANNER_CLIENT = null;
  document.documentElement.classList.add('performance-rendering');
  window.onRenderingMode?.((mode) => {
    document.documentElement.classList.toggle('software-rendering', Boolean(mode?.software));
  });

  function selectModule(moduleId, navigate = true) {
    const nextModule = moduleId === 'shop' ? 'shop' : 'service';
    activeModule = nextModule;
    localStorage.setItem(MODULE_STORAGE_KEY, nextModule);
    document.body.dataset.activeModule = nextModule;

    document.querySelectorAll('[data-module-select]').forEach(button => {
      const selected = button.dataset.moduleSelect === nextModule;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    document.querySelectorAll('[data-module-nav]').forEach(nav => {
      nav.hidden = nav.dataset.moduleNav !== nextModule;
    });

    const moduleLabel = document.getElementById('active-module-label');
    if (moduleLabel) moduleLabel.textContent = nextModule.toUpperCase();
    document.getElementById('active-module-chip')?.classList.toggle('shop', nextModule === 'shop');

    window.dispatchEvent(new CustomEvent('module-change', { detail: nextModule }));
    if (navigate) switchTab(rememberedModuleTab(nextModule));
  }

  function switchTab(tabId) {
    const targetButton = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    const targetModule = targetButton?.closest('[data-module-nav]')?.dataset.moduleNav;
    if (targetModule && targetModule !== activeModule) selectModule(targetModule, false);
    if (targetButton?.dataset.adminOnly === 'true' && !window.AUTH?.isAdmin()) {
      tabId = 'scanner';
    }
    if (targetButton?.dataset.partnersAccess === 'true' && !window.AUTH?.canManagePartners?.()) {
      tabId = 'scanner';
    }
    if (targetButton?.dataset.clientPanelAccess === 'true' && !window.AUTH?.canViewClientPanel?.()) {
      tabId = 'scanner';
    }
    if (targetButton?.dataset.statsAccess === 'true' && !window.AUTH?.canViewStats?.()) {
      tabId = 'scanner';
    }

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    // Show/hide panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'tab-' + tabId);
    });
    const selectedButton = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    const selectedModule = selectedButton?.closest('[data-module-nav]')?.dataset.moduleNav;
    if (selectedModule === 'service' || selectedModule === 'shop') {
      moduleStartTabs[selectedModule] = tabId;
      localStorage.setItem(MODULE_TAB_STORAGE_KEYS[selectedModule], tabId);
    }

    // Lasam intai browserul sa afiseze modulul. Incarcarea/revalidarea datelor
    // porneste in cadrul urmator si nu mai poate bloca vizual click-ul.
    const revision = ++tabChangeRevision;
    requestAnimationFrame(() => {
      if (revision !== tabChangeRevision) return;
      if (!document.getElementById(`tab-${tabId}`)?.classList.contains('active')) return;
      window.dispatchEvent(new CustomEvent('tab-change', { detail: tabId }));
    });
  }

  // Wire nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('[data-module-select]').forEach(button => {
    button.addEventListener('click', () => selectModule(button.dataset.moduleSelect));
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-shop-open]');
    if (button) switchTab(button.dataset.shopOpen);
  });

  window.addEventListener('auth-change', () => {
    const activeAdmin = document.querySelector('.nav-btn.active[data-admin-only="true"]');
    if (activeAdmin && !window.AUTH?.isAdmin()) {
      switchTab('scanner');
      return;
    }
    const activePartners = document.querySelector('.nav-btn.active[data-partners-access="true"]');
    if (activePartners && !window.AUTH?.canManagePartners?.()) {
      switchTab('scanner');
      return;
    }
    const activeClients = document.querySelector('.nav-btn.active[data-client-panel-access="true"]');
    if (activeClients && !window.AUTH?.canViewClientPanel?.()) {
      switchTab('scanner');
      return;
    }
    const activeStats = document.querySelector('.nav-btn.active[data-stats-access="true"]');
    if (activeStats && !window.AUTH?.canViewStats?.()) {
      switchTab('scanner');
    }
  });

  window.addEventListener('auth-change', (event) => {
    const authToken = String(event.detail?.token || '');
    if (!authToken) {
      warmedTablesToken = '';
      return;
    }
    if (warmedTablesToken === authToken) return;
    warmedTablesToken = authToken;
    const warmTables = () => {
      const allowedSizes = new Set([10, 15, 25, 50, 100]);
      const savedClientsSize = Number(localStorage.getItem('gtrots.clientsPageSize.v1') || 10);
      const savedServiceSize = Number(localStorage.getItem('gtrots.serviceSheetsPageSize.v1') || 10);
      const clientsSize = allowedSizes.has(savedClientsSize) ? savedClientsSize : 10;
      const serviceSize = allowedSizes.has(savedServiceSize) ? savedServiceSize : 10;
      void Promise.allSettled([
        window.API?.getClientsPage?.({ page: 1, pageSize: clientsSize, sortBy: 'created_at', sortDir: 'desc' }),
        // Service pornește fără sortare explicită cât timp selectorul legacy este
        // ascuns. Folosim aceeași formă a cererii pentru ca prima deschidere să
        // nimerească pagina deja încălzită din cache.
        window.API?.getServiceSheetsPage?.({ page: 1, pageSize: serviceSize }),
      ]);
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(warmTables, { timeout: 1200 });
    else window.setTimeout(warmTables, 250);
  });

  window.switchTab = switchTab;
  window.selectAppModule = selectModule;

  // Restore the last workspace used on this computer.
  selectModule(activeModule, false);
  switchTab(rememberedModuleTab(activeModule));
})();
