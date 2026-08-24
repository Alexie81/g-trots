// ─── App controller ───────────────────────────────────────────────────────────
(function() {
  const MODULE_STORAGE_KEY = 'gtrots_active_module_v1';
  const moduleStartTabs = { service: 'scanner', shop: 'shop-dashboard' };
  let activeModule = localStorage.getItem(MODULE_STORAGE_KEY) === 'shop' ? 'shop' : 'service';

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
    if (navigate) switchTab(moduleStartTabs[nextModule]);
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
    // Dispatch event for modules
    window.dispatchEvent(new CustomEvent('tab-change', { detail: tabId }));
  }

  // Wire nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('[data-module-select]').forEach(button => {
    button.addEventListener('click', () => selectModule(button.dataset.moduleSelect));
  });
  document.querySelectorAll('[data-shop-open]').forEach(button => {
    button.addEventListener('click', () => switchTab(button.dataset.shopOpen));
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

  window.switchTab = switchTab;
  window.selectAppModule = selectModule;

  // Restore the last workspace used on this computer.
  selectModule(activeModule, false);
  switchTab(moduleStartTabs[activeModule]);
})();
