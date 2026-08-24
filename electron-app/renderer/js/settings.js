// Admin settings: users and roles
(function() {
  let users = [];
  let pricePresets = [];
  let authUserId = window.AUTH?.getUser?.()?.id || '';
  let usersLoaded = false;
  let usersLoading = false;

  const form = document.getElementById('user-form');
  const idInput = document.getElementById('user-id');
  const displayNameInput = document.getElementById('user-display-name');
  const usernameInput = document.getElementById('user-username');
  const passwordInput = document.getElementById('user-password');
  const roleInput = document.getElementById('user-role');
  const platformInput = document.getElementById('user-platform');
  const activeInput = document.getElementById('user-active');
  const supportChatRow = document.getElementById('user-support-chat-row');
  const supportChatInput = document.getElementById('user-support-chat');
  const clientPanelRow = document.getElementById('user-client-panel-row');
  const clientPanelInput = document.getElementById('user-client-panel');
  const clientEditRow = document.getElementById('user-client-edit-row');
  const clientEditInput = document.getElementById('user-client-edit');
  const serviceSheetRow = document.getElementById('user-service-sheet-row');
  const serviceSheetInput = document.getElementById('user-service-sheet');
  const clientFinancialRow = document.getElementById('user-client-financial-row');
  const clientFinancialInput = document.getElementById('user-client-financial');
  const errorBox = document.getElementById('user-error');
  const saveBtn = document.getElementById('user-save-btn');
  const resetBtn = document.getElementById('user-reset-btn');
  const refreshBtn = document.getElementById('users-refresh-btn');
  const listEl = document.getElementById('users-list');
  const miniStatsEl = document.getElementById('users-mini-stats');
  const summaryLabelEl = document.getElementById('users-summary-label');
  const systemForm = document.getElementById('system-db-form');
  const systemApiUrlInput = document.getElementById('system-api-url');
  const systemApiKeyInput = document.getElementById('system-api-key');
  const systemServiceSheetPdfBaseUrlInput = document.getElementById('system-service-sheet-pdf-base-url');
  const systemDbHostInput = document.getElementById('system-db-host');
  const systemDbNameInput = document.getElementById('system-db-name');
  const systemDbUserInput = document.getElementById('system-db-user');
  const systemDbPassInput = document.getElementById('system-db-pass');
  const systemDbPassToggle = document.getElementById('system-db-pass-toggle');
  const systemRunSchemaInput = document.getElementById('system-run-schema');
  const systemStatusEl = document.getElementById('system-db-status');
  const systemSaveBtn = document.getElementById('system-db-save-btn');
  const systemLoadBtn = document.getElementById('system-db-load-btn');
  const companyForm = document.getElementById('company-settings-form');
  const companyNameInput = document.getElementById('company-name');
  const companyFiscalCodeInput = document.getElementById('company-fiscal-code');
  const companyRegistrationNumberInput = document.getElementById('company-registration-number');
  const companyAddressInput = document.getElementById('company-address');
  const companyPhoneInput = document.getElementById('company-phone');
  const companyEmailInput = document.getElementById('company-email');
  const companyWebsiteInput = document.getElementById('company-website');
  const companyBankNameInput = document.getElementById('company-bank-name');
  const companyIbanInput = document.getElementById('company-iban');
  const companyStampFileInput = document.getElementById('company-stamp-file');
  const companyStampPickBtn = document.getElementById('company-stamp-pick-btn');
  const companyStampClearBtn = document.getElementById('company-stamp-clear-btn');
  const companyStampPreview = document.getElementById('company-stamp-preview');
  const companyStatusEl = document.getElementById('company-settings-status');
  const companySaveBtn = document.getElementById('company-settings-save-btn');
  const companyLoadBtn = document.getElementById('company-settings-load-btn');
  const pricePresetForm = document.getElementById('price-preset-form');
  const pricePresetIdInput = document.getElementById('price-preset-id');
  const pricePresetLabelInput = document.getElementById('price-preset-label');
  const pricePresetPriceInput = document.getElementById('price-preset-price');
  const pricePresetSaveBtn = document.getElementById('price-preset-save');
  const pricePresetResetBtn = document.getElementById('price-preset-reset');
  const pricePresetErrorEl = document.getElementById('price-preset-error');
  const pricePresetListEl = document.getElementById('price-preset-list');
  const pricePresetCountEl = document.getElementById('price-preset-count');
  let companyStampImage = '';

  function token() {
    return window.AUTH?.getToken() || '';
  }

  function canManageUsers() {
    return Boolean(window.AUTH?.isAdmin() && token());
  }

  function canManageCompanySettings() {
    return Boolean(window.AUTH?.canManagePartners?.() && token());
  }

  function settingsTabIsActive() {
    return Boolean(document.getElementById('tab-settings')?.classList.contains('active'));
  }

  function loadUsersWhenAvailable() {
    if (!canManageUsers() || usersLoaded || usersLoading) return;
    loadUsers();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setError(message) {
    if (!errorBox) return;
    if (!message) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
      return;
    }
    errorBox.textContent = message;
    errorBox.style.display = 'block';
  }

  function showSweetError(title, message) {
    if (window.Swal?.fire) {
      window.Swal.fire({ icon: 'error', title, text: message });
      return;
    }

    const existing = document.querySelector('.sweet-alert-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'sweet-alert-overlay';
    overlay.innerHTML = `
      <div class="sweet-alert-box" role="alertdialog" aria-modal="true">
        <div class="sweet-alert-icon">!</div>
        <div class="sweet-alert-title">${escapeHtml(title)}</div>
        <div class="sweet-alert-message">${escapeHtml(message)}</div>
        <button type="button" class="btn-primary sweet-alert-btn">OK</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.sweet-alert-btn')?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
  }

  function showSweetSuccess(title, message) {
    if (window.Swal?.fire) {
      window.Swal.fire({ icon: 'success', title, text: message });
    }
  }

  function setSystemStatus(message, type = 'info') {
    if (!systemStatusEl) return;
    systemStatusEl.textContent = message || '';
    systemStatusEl.classList.remove('success', 'error', 'info', 'warning');
    if (type) systemStatusEl.classList.add(type);
    window.refreshSettingsPanelHeights?.();
  }

  function setCompanyStatus(message, type = 'info') {
    if (!companyStatusEl) return;
    companyStatusEl.textContent = message || '';
    companyStatusEl.classList.remove('success', 'error', 'info', 'warning');
    if (type) companyStatusEl.classList.add(type);
    window.refreshSettingsPanelHeights?.();
  }

  function toggleSystemDbPasswordVisibility() {
    if (!systemDbPassInput || !systemDbPassToggle) return;
    if (!systemDbPassInput.value) {
      showSweetError('Parola indisponibila', 'Serverul conectat nu a trimis parola bazei de date. Urca noul server/api.php sau salveaza parola o data din acest panel.');
      return;
    }
    const showPassword = systemDbPassInput.type === 'password';
    systemDbPassInput.type = showPassword ? 'text' : 'password';
    systemDbPassToggle.classList.toggle('is-visible', showPassword);
    systemDbPassToggle.setAttribute('aria-label', showPassword ? 'Ascunde parola' : 'Afiseaza parola');
    systemDbPassInput.focus();
  }

  function setupSettingsPanels() {
    function panelOpenHeight(panel, content, body) {
      const contentHeight = content?.scrollHeight || body?.scrollHeight || 0;
      return Math.ceil(contentHeight) + 2;
    }

    function setPanelCollapsed(panel, toggle, collapsed) {
      const body = panel.querySelector(':scope > .settings-panel-body');
      const content = body?.querySelector(':scope > .settings-panel-content');
      panel.classList.toggle('is-collapsed', collapsed);
      panel.dataset.panelState = collapsed ? 'closed' : 'open';
      toggle.setAttribute('aria-expanded', String(!collapsed));
      if (body) {
        body.style.maxHeight = collapsed ? '0px' : `${panelOpenHeight(panel, content, body)}px`;
        body.classList.remove('has-panel-scroll');
      }
    }

    function isPanelInteractiveTarget(target) {
      return Boolean(target.closest('input, select, textarea, button, a, label, .form-actions, .check-row'));
    }

    function animateToggleIcon(toggle, closing) {
      toggle.classList.remove('is-rotating-open', 'is-rotating-close');
      void toggle.offsetWidth;
      toggle.classList.add(closing ? 'is-rotating-close' : 'is-rotating-open');
    }

    function refreshOpenPanelHeights() {
      document.querySelectorAll('#tab-settings .settings-collapsible:not(.is-collapsed)').forEach((panel) => {
        const body = panel.querySelector(':scope > .settings-panel-body');
        const content = body?.querySelector(':scope > .settings-panel-content');
        if (body) {
          body.style.maxHeight = `${panelOpenHeight(panel, content, body)}px`;
          body.classList.remove('has-panel-scroll');
        }
      });
    }
    window.refreshSettingsPanelHeights = () => requestAnimationFrame(refreshOpenPanelHeights);

    const panels = Array.from(document.querySelectorAll('#tab-settings .settings-panel'))
      .filter((panel) => !panel.classList.contains('settings-panel-wide'));

    function openExclusivePanel(panel, shouldScroll = false) {
      if (!panel) return;
      panels.forEach((item) => {
        const itemToggle = item.querySelector('.settings-panel-toggle');
        if (!itemToggle) return;
        const shouldCollapse = item !== panel;
        if (item.classList.contains('is-collapsed') !== shouldCollapse) {
          animateToggleIcon(itemToggle, shouldCollapse);
        }
        setPanelCollapsed(item, itemToggle, shouldCollapse);
      });
      requestAnimationFrame(refreshOpenPanelHeights);
      window.setTimeout(refreshOpenPanelHeights, 500);
      if (shouldScroll) {
        requestAnimationFrame(() => {
          refreshOpenPanelHeights();
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }

    window.openLoginSystemPanel = (shouldScroll = true) => {
      openExclusivePanel(document.querySelector('#tab-settings .login-system-panel'), shouldScroll);
    };

    panels.forEach((panel) => {
      if (panel.dataset.collapsibleReady === 'true') return;
      const header = panel.querySelector(':scope > .settings-panel-title, :scope > .settings-list-header');
      if (!header) return;

      const body = document.createElement('div');
      body.className = 'settings-panel-body';
      const content = document.createElement('div');
      content.className = 'settings-panel-content';
      Array.from(panel.children).forEach((child) => {
        if (child !== header) content.appendChild(child);
      });
      body.appendChild(content);
      panel.appendChild(body);
      if (window.ResizeObserver) {
        const contentObserver = new ResizeObserver(() => {
          if (!panel.classList.contains('is-collapsed')) {
            window.refreshSettingsPanelHeights?.();
          }
        });
        contentObserver.observe(content);
      }

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'settings-panel-toggle';
      toggle.setAttribute('aria-label', 'Extinde sau strange panelul');
      toggle.innerHTML = `
        <span class="settings-toggle-symbol" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      `;
      header.appendChild(toggle);
      header.classList.add('settings-collapsible-head');
      panel.classList.add('settings-collapsible');
      panel.dataset.collapsibleReady = 'true';

      const defaultOpen = panel.classList.contains('login-system-panel');
      const collapsed = panel.dataset.collapsed === 'true' ? true : !defaultOpen;
      setPanelCollapsed(panel, toggle, collapsed);

      const togglePanel = () => {
        const isOpen = !panel.classList.contains('is-collapsed');
        animateToggleIcon(toggle, isOpen);
        if (isOpen) {
          setPanelCollapsed(panel, toggle, true);
          requestAnimationFrame(refreshOpenPanelHeights);
          window.setTimeout(refreshOpenPanelHeights, 500);
          return;
        }

        openExclusivePanel(panel);
      };

      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        togglePanel();
      });
      header.addEventListener('click', (event) => {
        if (isPanelInteractiveTarget(event.target)) return;
        event.stopPropagation();
        togglePanel();
      });
      panel.addEventListener('click', (event) => {
        if (!panel.classList.contains('is-collapsed')) return;
        if (isPanelInteractiveTarget(event.target)) return;
        if (event.target.closest('.settings-collapsible-head')) return;
        togglePanel();
      });
      toggle.addEventListener('animationend', () => {
        toggle.classList.remove('is-rotating-open', 'is-rotating-close');
      });
    });

    window.addEventListener('resize', refreshOpenPanelHeights);
    requestAnimationFrame(refreshOpenPanelHeights);
  }

  function normalizedUsername(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isProtectedAdminUser(user) {
    return normalizedUsername(user?.username) === 'admin';
  }

  function currentEditingUser() {
    const userId = idInput.value;
    return users.find((item) => String(item.id || '') === String(userId || '')) || null;
  }

  function setProtectedAdminUi(locked) {
    [
      usernameInput.closest('.field'),
      roleInput.closest('.field'),
      platformInput.closest('.field'),
      activeInput.closest('.check-row'),
      supportChatRow,
      clientPanelRow,
      clientEditRow,
      serviceSheetRow,
      clientFinancialRow,
    ].forEach((element) => {
      if (!element) return;
      element.classList.toggle('admin-locked-field', Boolean(locked));
    });
  }

  function lockProtectedAdminFields() {
    const protectedAdmin = isProtectedAdminUser(currentEditingUser());
    if (protectedAdmin) {
      setProtectedAdminUi(true);
      usernameInput.disabled = true;
      roleInput.value = 'admin';
      roleInput.disabled = true;
      platformInput.value = 'both';
      platformInput.disabled = true;
      activeInput.checked = true;
      activeInput.disabled = true;
      if (supportChatRow) supportChatRow.style.display = 'flex';
      if (supportChatInput) {
        supportChatInput.checked = true;
        supportChatInput.disabled = true;
      }
      if (clientPanelRow) clientPanelRow.style.display = 'flex';
      if (clientPanelInput) {
        clientPanelInput.checked = true;
        clientPanelInput.disabled = true;
      }
      if (clientEditRow) clientEditRow.style.display = 'none';
      if (clientEditInput) {
        clientEditInput.checked = true;
        clientEditInput.disabled = true;
      }
      if (serviceSheetRow) serviceSheetRow.style.display = 'none';
      if (serviceSheetInput) {
        serviceSheetInput.checked = true;
        serviceSheetInput.disabled = true;
      }
      if (clientFinancialRow) clientFinancialRow.style.display = 'none';
      if (clientFinancialInput) {
        clientFinancialInput.checked = true;
        clientFinancialInput.disabled = true;
      }
      return true;
    }

    setProtectedAdminUi(false);
    roleInput.disabled = false;
    activeInput.disabled = false;
    return false;
  }

  function findDuplicateUsername(username, currentUserId = '') {
    const normalized = normalizedUsername(username);
    if (!normalized) return null;
    return users.find((user) =>
      normalizedUsername(user.username) === normalized &&
      String(user.id || '') !== String(currentUserId || '')
    ) || null;
  }

  function roleLabel(role) {
    return {
      admin: 'Admin',
      manager: 'Manager',
      user: 'User',
    }[role] || role;
  }

  function platformLabel(platform) {
    return {
      desktop: 'Desktop',
      mobile: 'Mobile',
      both: 'Desktop + Mobil',
    }[platform] || platform;
  }

  function iconSvg(name) {
    const icons = {
      admin: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-5" />',
      manager: '<path d="M4 20V6a2 2 0 0 1 2-2h8l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M14 4v6h6" /><path d="M8 14h8" /><path d="M8 18h5" />',
      user: '<path d="M18 20a6 6 0 0 0-12 0" /><circle cx="12" cy="8" r="4" />',
      desktop: '<rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />',
      mobile: '<rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h4" />',
      both: '<rect x="2" y="4" width="13" height="10" rx="1.5" /><path d="M5 18h7" /><path d="M8.5 14v4" /><rect x="16" y="7" width="6" height="13" rx="1.5" /><path d="M18 17h2" />',
      support: '<path d="M4 12a8 8 0 0 1 16 0" /><path d="M4 12v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Z" /><path d="M20 12v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" /><path d="M13 19h2a3 3 0 0 0 3-3" />',
      edit: '<path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-5 1 1-5Z" />',
      active: '<path d="M20 6 9 17l-5-5" />',
      inactive: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />',
      pin: '<path d="m14 4 6 6" /><path d="m14 10-5.5 5.5" /><path d="M8 14 4 18" /><path d="m16 6-7 7-2-2 7-7Z" /><path d="m11 17 6-6" />',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.user}</svg>`;
  }

  function initials(name) {
    return String(name || 'U')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'U';
  }

  function compareAlphabetically(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'ro', { sensitivity: 'base' });
  }

  function formatAddedAt(value) {
    if (!value) return 'Data indisponibila';
    const date = new Date(String(value).includes('T') ? value : String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return 'Data indisponibila';
    return date.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function syncPlatformForRole() {
    if (!roleInput || !platformInput) return;
    const mobileOption = platformInput.querySelector('option[value="mobile"]');
    if (lockProtectedAdminFields()) return;
    if (clientPanelRow) clientPanelRow.style.display = roleInput.value === 'user' ? 'flex' : 'none';
    if (clientPanelInput) {
      clientPanelInput.disabled = roleInput.value !== 'user';
      if (roleInput.value !== 'user') clientPanelInput.checked = true;
    }
    if (clientEditRow) clientEditRow.style.display = roleInput.value === 'user' ? 'flex' : 'none';
    if (clientEditInput) clientEditInput.disabled = roleInput.value !== 'user';
    if (serviceSheetRow) serviceSheetRow.style.display = roleInput.value === 'user' ? 'flex' : 'none';
    if (serviceSheetInput) {
      serviceSheetInput.disabled = roleInput.value !== 'user';
      if (roleInput.value !== 'user') serviceSheetInput.checked = true;
    }
    if (clientFinancialRow) clientFinancialRow.style.display = roleInput.value === 'user' ? 'flex' : 'none';
    if (clientFinancialInput) {
      clientFinancialInput.disabled = roleInput.value !== 'user';
      if (roleInput.value !== 'user') clientFinancialInput.checked = true;
    }
    if (roleInput.value === 'admin') {
      if (mobileOption) mobileOption.disabled = true;
      if (!['desktop', 'both'].includes(platformInput.value)) {
        platformInput.value = 'both';
      }
      platformInput.disabled = false;
      if (supportChatRow) supportChatRow.style.display = 'flex';
      if (supportChatInput) {
        supportChatInput.disabled = false;
      }
      return;
    }
    if (mobileOption) mobileOption.disabled = false;
    platformInput.disabled = false;
    if (!['mobile', 'desktop', 'both'].includes(platformInput.value)) {
      platformInput.value = 'mobile';
    }
    if (supportChatRow) supportChatRow.style.display = 'flex';
    if (supportChatInput) {
      supportChatInput.disabled = false;
    }
  }

  function resetForm() {
    idInput.value = '';
    displayNameInput.value = '';
    usernameInput.value = '';
    usernameInput.disabled = false;
    passwordInput.value = '';
    passwordInput.placeholder = 'Completeaza doar la creare sau resetare';
    roleInput.value = 'user';
    roleInput.disabled = false;
    platformInput.value = 'mobile';
    platformInput.disabled = false;
    activeInput.checked = true;
    activeInput.disabled = false;
    if (supportChatInput) {
      supportChatInput.checked = false;
      supportChatInput.disabled = true;
    }
    if (clientEditInput) {
      clientEditInput.checked = false;
      clientEditInput.disabled = false;
    }
    if (clientPanelInput) {
      clientPanelInput.checked = true;
      clientPanelInput.disabled = false;
    }
    if (serviceSheetInput) {
      serviceSheetInput.checked = true;
      serviceSheetInput.disabled = false;
    }
    if (clientFinancialInput) {
      clientFinancialInput.checked = true;
      clientFinancialInput.disabled = false;
    }
    saveBtn.textContent = 'Salveaza user';
    setError('');
    syncPlatformForRole();
  }

  function editUser(userId) {
    const user = users.find((item) => item.id === userId);
    if (!user) return;
    window.openLoginSystemPanel?.(true);
    idInput.value = user.id;
    displayNameInput.value = user.display_name || user.username;
    usernameInput.value = user.username || '';
    usernameInput.disabled = true;
    passwordInput.value = '';
    passwordInput.placeholder = 'Lasa gol daca nu schimbi parola';
    roleInput.value = user.role || 'user';
    platformInput.value = ['mobile', 'desktop', 'both'].includes(user.platform_access) ? user.platform_access : 'mobile';
    activeInput.checked = Boolean(user.is_active);
    if (supportChatInput) supportChatInput.checked = Boolean(user.support_chat_access);
    if (clientPanelInput) clientPanelInput.checked = user.client_panel_access !== false;
    if (clientEditInput) clientEditInput.checked = Boolean(user.client_edit_access);
    if (serviceSheetInput) serviceSheetInput.checked = user.service_sheet_access !== false;
    if (clientFinancialInput) clientFinancialInput.checked = user.client_financial_access !== false;
    saveBtn.textContent = 'Actualizeaza user';
    setError('');
    syncPlatformForRole();
  }

  function renderUsers() {
    if (!canManageUsers()) {
      listEl.innerHTML = '';
      return;
    }
    if (!users.length) {
      listEl.innerHTML = '<div class="loading">Nu exista useri creati.</div>';
      renderUserSummary();
      return;
    }

    renderUserSummary();

    const sortedUsers = [...users].sort((a, b) =>
      compareAlphabetically(a.display_name || a.username, b.display_name || b.username)
    );

    listEl.innerHTML = sortedUsers.map((user) => {
      const activeClass = user.is_active ? 'active' : 'inactive';
      const chatAgentLabel = user.support_chat_access ? ' (Agent Support)' : '';
      const role = roleLabel(user.role);
      const platform = platformLabel(user.platform_access);
      const canDeleteUser = !isProtectedAdminUser(user);
      const protectedAdmin = isProtectedAdminUser(user);
      const roleIcon = ['admin', 'manager'].includes(user.role) ? user.role : 'user';
      const platformIcon = ['desktop', 'mobile', 'both'].includes(user.platform_access) ? user.platform_access : 'mobile';
      return `
        <div class="user-row ${protectedAdmin ? 'root-admin-user' : ''}" data-id="${escapeHtml(user.id)}">
          ${protectedAdmin ? `<span class="user-pinned-icon" title="Pinned admin">${iconSvg('pin')}</span>` : ''}
          <div class="user-avatar ${user.support_chat_access ? 'chat-agent' : ''}">
            ${escapeHtml(initials(user.display_name || user.username))}
          </div>
          <div class="user-row-main">
            <div class="user-row-title">
              ${escapeHtml(user.display_name || user.username)}${escapeHtml(chatAgentLabel)}
              <span class="user-pill ${activeClass}">${user.is_active ? 'Activ' : 'Inactiv'}</span>
            </div>
            <div class="user-row-meta">
              @${escapeHtml(user.username)}
            </div>
            <div class="user-added-at">
              <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M12 14v3l2 1"/></svg>
              <span>Adaugat: ${escapeHtml(formatAddedAt(user.created_at))}</span>
            </div>
            <div class="user-chip-row">
              <span class="user-chip role">${iconSvg(roleIcon)}${escapeHtml(role)}</span>
              <span class="user-chip platform">${iconSvg(platformIcon)}${escapeHtml(platform)}</span>
              <span class="user-chip ${user.is_active ? 'status-ok' : 'status-off'}">${iconSvg(user.is_active ? 'active' : 'inactive')}${user.is_active ? 'Activ' : 'Inactiv'}</span>
              ${user.support_chat_access ? `<span class="user-chip support">${iconSvg('support')}Support</span>` : ''}
              ${user.role === 'user' && user.client_panel_access !== false ? `<span class="user-chip status-ok">${iconSvg('users')}Panou clienti</span>` : ''}
              ${user.role === 'user' && user.client_edit_access ? `<span class="user-chip status-ok">${iconSvg('edit')}Editare clienti</span>` : ''}
            </div>
          </div>
          <div class="user-row-actions">
            <button class="btn-ghost btn-sm user-edit-btn" data-id="${escapeHtml(user.id)}">Editeaza</button>
            ${canDeleteUser ? `<button class="btn-danger btn-sm user-delete-btn" data-id="${escapeHtml(user.id)}">Sterge</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderUserSummary() {
    if (!miniStatsEl) return;
    const total = users.length;
    const desktop = users.filter((user) => ['desktop', 'both'].includes(user.platform_access)).length;
    const mobile = users.filter((user) => ['mobile', 'both'].includes(user.platform_access)).length;
    const support = users.filter((user) => user.support_chat_access).length;
    const clients = users.filter((user) => user.role !== 'user' || user.client_panel_access !== false).length;
    if (summaryLabelEl) {
      summaryLabelEl.textContent = `${total} cont${total === 1 ? '' : 'uri'} sincronizat${total === 1 ? '' : 'e'}`;
    }
    const stats = [
      ['users', total, 'Total'],
      ['desktop', desktop, 'Desktop'],
      ['mobile', mobile, 'Mobile'],
      ['users', clients, 'Clienti'],
      ['support', support, 'Support'],
    ];
    miniStatsEl.innerHTML = stats.map(([icon, value, label]) => `
      <div class="mini-stat">
        <span>${iconSvg(icon)}</span>
        <strong>${value}</strong>
        <em>${label}</em>
      </div>
    `).join('');
  }

  async function loadUsers() {
    if (!canManageUsers()) {
      users = [];
      renderUsers();
      return;
    }
    if (usersLoading) return;
    usersLoading = true;
    listEl.innerHTML = '<div class="loading">Se incarca...</div>';
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Se actualizeaza...';
    try {
      users = await window.API.getUsers(token());
      usersLoaded = true;
      renderUsers();
    } catch (e) {
      const message = e.message || 'Eroare la incarcarea userilor.';
      listEl.innerHTML = `<div class="error-box">${escapeHtml(message)}</div>`;
      showSweetError('Lista nu a putut fi incarcata', message);
    } finally {
      usersLoading = false;
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Actualizeaza useri';
    }
  }

  function fillSystemRuntimeFields() {
    if (!systemForm) return;
    const runtime = window.API.getRuntimeConfig?.() || {
      apiUrl: window.API_URL || '',
      apiKey: window.API_KEY || '',
    };
    systemApiUrlInput.value = runtime.apiUrl || '';
    systemApiKeyInput.value = runtime.apiKey || '';
    if (systemServiceSheetPdfBaseUrlInput && !systemServiceSheetPdfBaseUrlInput.value) {
      systemServiceSheetPdfBaseUrlInput.value = 'https://g-trots.ro/fs/';
    }
  }

  function normalizeServiceSheetPdfBaseUrl(value) {
    let normalized = String(value || '').trim();
    if (!normalized) normalized = 'https://g-trots.ro/fs/';
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized.replace(/^\/+/, '')}`;
    }
    return `${normalized.replace(/[?#].*$/, '').replace(/\/+$/, '')}/`;
  }

  async function loadSystemDatabaseInfo() {
    if (!systemForm) return;
    fillSystemRuntimeFields();
    if (!canManageUsers()) return;

    setSystemStatus('Se citesc datele sistemului...', 'info');
    try {
      const info = await window.API.getSystemDatabaseInfo(token());
      if (info?.api_url && !systemApiUrlInput.value) systemApiUrlInput.value = info.api_url;
      if (info?.api_key && !systemApiKeyInput.value) systemApiKeyInput.value = info.api_key;
      systemDbHostInput.value = info?.db_host || '';
      systemDbNameInput.value = info?.db_name || '';
      systemDbUserInput.value = info?.db_user || '';
      systemServiceSheetPdfBaseUrlInput.value = normalizeServiceSheetPdfBaseUrl(
        info?.service_sheet_pdf_base_url || 'https://g-trots.ro/fs/'
      );
      systemDbPassInput.type = 'password';
      systemDbPassToggle?.classList.remove('is-visible');
      systemDbPassToggle?.setAttribute('aria-label', 'Afiseaza parola');
      systemDbPassInput.value = info?.db_pass || '';
      systemDbPassInput.placeholder = info?.db_password_saved
        ? 'Parola salvata'
        : 'Parola bazei de date';
      const hasSchema = Boolean(info?.schema_file);
      const schemaLabel = hasSchema
        ? 'schema.sql gasit'
        : 'schema.sql lipseste pe server - urca fisierul sau debifeaza rularea automata';
      const configLabel = info?.config_file_saved ? 'config local activ' : 'fallback defaults';
      setSystemStatus(`${schemaLabel} - ${configLabel}`, hasSchema ? 'success' : 'warning');
    } catch (e) {
      if (/actiune necunoscuta|unknown action|getSystemDatabaseInfo/i.test(e.message || '')) {
        setSystemStatus('Serverul curent nu are inca endpointul nou. Urca server/api.php, apoi apasa Reincarca.', 'warning');
        return;
      }
      setSystemStatus(e.message || 'Nu pot citi informatiile sistemului.', 'error');
    }
  }

  function fillCompanyForm(settings = {}) {
    if (!companyForm) return;
    companyNameInput.value = settings.company_name || '';
    companyFiscalCodeInput.value = settings.fiscal_code || '';
    companyRegistrationNumberInput.value = settings.registration_number || '';
    companyAddressInput.value = settings.address || '';
    companyPhoneInput.value = settings.phone || '';
    companyEmailInput.value = settings.email || '';
    companyWebsiteInput.value = settings.website || '';
    companyBankNameInput.value = settings.bank_name || '';
    companyIbanInput.value = settings.iban || '';
    companyStampImage = settings.stamp_image || '';
    renderCompanyStampPreview();
  }

  function readCompanyForm() {
    return {
      company_name: companyNameInput.value.trim(),
      fiscal_code: companyFiscalCodeInput.value.trim(),
      registration_number: companyRegistrationNumberInput.value.trim(),
      address: companyAddressInput.value.trim(),
      phone: companyPhoneInput.value.trim(),
      email: companyEmailInput.value.trim(),
      website: companyWebsiteInput.value.trim(),
      bank_name: companyBankNameInput.value.trim(),
      iban: companyIbanInput.value.trim(),
      stamp_image: companyStampImage || '',
    };
  }

  function renderCompanyStampPreview() {
    if (!companyStampPreview) return;
    if (companyStampImage) {
      companyStampPreview.innerHTML = `<img src="${companyStampImage}" alt="Stampila firma" />`;
      if (companyStampPickBtn) companyStampPickBtn.textContent = 'Schimba stampila';
      if (companyStampClearBtn) companyStampClearBtn.hidden = false;
    } else {
      companyStampPreview.innerHTML = '<span>Nu ai selectat stampila</span>';
      if (companyStampPickBtn) companyStampPickBtn.textContent = 'Adauga fisier';
      if (companyStampClearBtn) companyStampClearBtn.hidden = true;
    }
    window.refreshSettingsPanelHeights?.();
  }

  function imageFileToJpegDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fileName = String(file?.name || '').toLowerCase();
      const isAllowedImage = /^image\/(png|jpe?g)$/i.test(file?.type || '')
        || /\.(png|jpe?g)$/i.test(fileName);
      if (!file || !isAllowedImage) {
        reject(new Error('Alege o imagine PNG sau JPG pentru stampila.'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Nu pot citi fisierul stampilei.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Imaginea stampilei nu este valida.'));
        image.onload = () => {
          const maxSide = 900;
          const scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1));
          const width = Math.max(1, Math.round((image.width || 1) * scale));
          const height = Math.max(1, Math.round((image.height || 1) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  async function loadCompanySettings() {
    if (!companyForm || !canManageCompanySettings()) return;
    setCompanyStatus('Se citesc datele firmei...', 'info');
    if (companyLoadBtn) companyLoadBtn.disabled = true;
    try {
      const settings = await window.API.getCompanySettings(token());
      fillCompanyForm(settings);
      setCompanyStatus(
        settings?.updated_at
          ? `Date incarcate. Ultima actualizare: ${formatAddedAt(settings.updated_at)}.`
          : 'Date incarcate. Completeaza si salveaza.',
        'success'
      );
    } catch (e) {
      const message = e.message || 'Nu pot citi datele firmei.';
      if (/actiune necunoscuta|unknown action|getCompanySettings/i.test(message)) {
        setCompanyStatus('Serverul nu are inca endpointul pentru datele firmei. Urca server/api.php si schema.sql.', 'warning');
        return;
      }
      setCompanyStatus(message, 'error');
    } finally {
      if (companyLoadBtn) companyLoadBtn.disabled = false;
    }
  }

  async function saveCompanySettings(event) {
    event.preventDefault();
    if (!canManageCompanySettings()) return;
    const payload = readCompanyForm();
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      showSweetError('Email invalid', 'Completeaza un email valid pentru firma sau lasa campul gol.');
      return;
    }
    setCompanyStatus('Se salveaza datele firmei...', 'info');
    if (companySaveBtn) companySaveBtn.disabled = true;
    try {
      const saved = await window.API.saveCompanySettings(token(), payload);
      fillCompanyForm(saved);
      setCompanyStatus('Datele firmei au fost salvate si sincronizate.', 'success');
      showSweetSuccess('Date salvate', 'Datele firmei au fost actualizate.');
    } catch (e) {
      const message = e.message || 'Nu pot salva datele firmei.';
      setCompanyStatus(message, 'error');
      showSweetError('Eroare date firma', message);
    } finally {
      if (companySaveBtn) companySaveBtn.disabled = false;
    }
  }

  function setPricePresetError(message) {
    if (!pricePresetErrorEl) return;
    pricePresetErrorEl.textContent = message || '';
    pricePresetErrorEl.hidden = !message;
    window.refreshSettingsPanelHeights?.();
  }

  function resetPricePresetForm() {
    if (!pricePresetForm) return;
    pricePresetIdInput.value = '';
    pricePresetLabelInput.value = '';
    pricePresetPriceInput.value = '';
    if (pricePresetSaveBtn) pricePresetSaveBtn.textContent = 'Adauga pret';
    setPricePresetError('');
    window.refreshSettingsPanelHeights?.();
  }

  function money(value) {
    return `${Number(value || 0).toFixed(2)} RON`;
  }

  function renderPricePresets() {
    if (!pricePresetListEl) return;
    if (pricePresetCountEl) pricePresetCountEl.textContent = String(pricePresets.length);
    pricePresetListEl.innerHTML = pricePresets.length ? pricePresets.map((preset) => `
      <div class="expense-settings-item" style="--expense-color:#22C55E">
        <span class="expense-settings-mark">
          <svg viewBox="0 0 24 24"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>
        </span>
        <div class="expense-settings-copy">
          <strong>${escapeHtml(preset.label)}</strong>
          <small>${escapeHtml(money(preset.price))}</small>
        </div>
        <div class="expense-settings-actions">
          <button type="button" class="price-preset-edit" data-id="${escapeHtml(preset.id)}" title="Editeaza pret" aria-label="Editeaza pret">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-5 1 1-5Z"/></svg>
          </button>
          <button type="button" class="price-preset-delete" data-id="${escapeHtml(preset.id)}" title="Sterge pret" aria-label="Sterge pret">
            <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
    `).join('') : '<div class="empty-state small">Nu ai inca preturi predefinite.</div>';
    window.refreshSettingsPanelHeights?.();
  }

  async function loadPricePresets() {
    if (!pricePresetForm || !canManageCompanySettings()) return;
    setPricePresetError('');
    try {
      pricePresets = await window.API.getPricePresets(token());
      renderPricePresets();
      window.dispatchEvent(new CustomEvent('price-presets-change', { detail: pricePresets }));
    } catch (e) {
      const message = e.message || 'Nu pot incarca preturile predefinite.';
      if (/actiune necunoscuta|unknown action|getPricePresets/i.test(message)) {
        setPricePresetError('Serverul nu are inca endpointul pentru preturi. Urca server/api.php si schema.sql.');
        return;
      }
      setPricePresetError(message);
    }
  }

  function editPricePreset(id) {
    const preset = pricePresets.find((item) => String(item.id) === String(id));
    if (!preset) return;
    pricePresetIdInput.value = preset.id;
    pricePresetLabelInput.value = preset.label || '';
    pricePresetPriceInput.value = String(Number(preset.price || 0));
    if (pricePresetSaveBtn) pricePresetSaveBtn.textContent = 'Salveaza pret';
    pricePresetLabelInput.focus();
    window.refreshSettingsPanelHeights?.();
  }

  async function savePricePreset(event) {
    event.preventDefault();
    if (!canManageCompanySettings()) return;
    const payload = {
      label: pricePresetLabelInput.value.trim(),
      price: Math.max(Number(pricePresetPriceInput.value || 0), 0),
    };
    if (!payload.label) {
      setPricePresetError('Completeaza labelul pretului.');
      return;
    }
    setPricePresetError('');
    if (pricePresetSaveBtn) pricePresetSaveBtn.disabled = true;
    try {
      const presetId = pricePresetIdInput.value;
      const saved = presetId
        ? await window.API.updatePricePreset(token(), presetId, payload)
        : await window.API.createPricePreset(token(), payload);
      const index = pricePresets.findIndex((item) => String(item.id) === String(saved.id));
      if (index >= 0) pricePresets[index] = saved;
      else pricePresets.push(saved);
      pricePresets.sort((a, b) => Number(a.price || 0) - Number(b.price || 0) || String(a.label || '').localeCompare(String(b.label || '')));
      resetPricePresetForm();
      renderPricePresets();
      window.dispatchEvent(new CustomEvent('price-presets-change', { detail: pricePresets }));
      showSweetSuccess('Pret salvat', 'Pretul predefinit a fost actualizat.');
    } catch (e) {
      const message = e.message || 'Nu pot salva pretul predefinit.';
      setPricePresetError(message);
      showSweetError('Eroare pret', message);
    } finally {
      if (pricePresetSaveBtn) pricePresetSaveBtn.disabled = false;
    }
  }

  async function deletePricePreset(id) {
    if (!canManageCompanySettings() || !id) return;
    const preset = pricePresets.find((item) => String(item.id) === String(id));
    if (!window.confirm(`Stergi pretul "${preset?.label || ''}"?`)) return;
    try {
      await window.API.deletePricePreset(token(), id);
      pricePresets = pricePresets.filter((item) => String(item.id) !== String(id));
      if (pricePresetIdInput.value === id) resetPricePresetForm();
      renderPricePresets();
      window.dispatchEvent(new CustomEvent('price-presets-change', { detail: pricePresets }));
    } catch (e) {
      const message = e.message || 'Nu pot sterge pretul predefinit.';
      setPricePresetError(message);
      showSweetError('Eroare stergere', message);
    }
  }

  async function saveSystemDatabaseInfo(event) {
    event.preventDefault();
    if (!canManageUsers()) return;

    const apiUrl = (systemApiUrlInput.value || '').trim().replace(/\/+$/, '');
    const apiKey = (systemApiKeyInput.value || '').trim();
    const dbHost = (systemDbHostInput.value || '').trim();
    const dbName = (systemDbNameInput.value || '').trim();
    const dbUser = (systemDbUserInput.value || '').trim();
    const dbPass = systemDbPassInput.value || '';
    const serviceSheetPdfBaseUrl = normalizeServiceSheetPdfBaseUrl(
      systemServiceSheetPdfBaseUrlInput?.value || ''
    );
    const runtime = window.API.getRuntimeConfig?.() || {};
    const normalizeUrl = (value) => String(value || '')
      .trim()
      .replace(/[?#].*$/, '')
      .replace(/\/api\.php$/i, '')
      .replace(/\/+$/, '');
    const changingApiServer = normalizeUrl(apiUrl) !== normalizeUrl(runtime.apiUrl);

    if (!apiUrl || !apiKey || !dbHost || !dbName || !dbUser || !serviceSheetPdfBaseUrl) {
      showSweetError(
        'Date lipsa',
        'Completeaza API URL, API Key, DB Host, DB Name, DB User si adresa fiselor de service.'
      );
      return;
    }
    if (changingApiServer && !dbPass) {
      showSweetError(
        'Parola MySQL lipseste',
        'Pentru initializarea unui server nou trebuie completata parola utilizatorului MySQL.'
      );
      return;
    }

    setSystemStatus(
      changingApiServer
        ? 'Se contacteaza noul server si se creeaza automat baza de date...'
        : 'Se testeaza conexiunea si se salveaza sistemul...',
      'info'
    );
    if (systemSaveBtn) systemSaveBtn.disabled = true;
    try {
      const payload = {
        api_key: apiKey,
        db_host: dbHost,
        db_name: dbName,
        db_user: dbUser,
        db_pass: dbPass,
        service_sheet_pdf_base_url: serviceSheetPdfBaseUrl,
        keep_db_pass: dbPass === '' ? 1 : 0,
        run_schema: changingApiServer ? 1 : (systemRunSchemaInput?.checked ? 1 : 0),
      };
      const result = changingApiServer
        ? await window.API.bootstrapSystem({ apiUrl, apiKey }, payload)
        : await window.API.saveSystemDatabaseInfo(token(), payload);

      window.API.saveRuntimeConfig?.({ apiUrl, apiKey });
      systemDbPassInput.type = 'password';
      systemDbPassToggle?.classList.remove('is-visible');
      systemDbPassToggle?.setAttribute('aria-label', 'Afiseaza parola');
      const databaseStatus = result?.database_created
        ? `Baza ${dbName} a fost creata.`
        : `Baza ${dbName} exista deja.`;
      const ran = result?.schema_ran
        ? `Schema rulata (${result.schema_statements || 0} instructiuni).`
        : 'Schema nu a fost rulata.';
      setSystemStatus(
        `${databaseStatus} ${ran} Configuratia a fost salvata. Se reincarca autentificarea...`,
        'success'
      );
      showSweetSuccess(
        changingApiServer ? 'Server nou initializat' : 'Baza de date schimbata',
        result?.default_admin_ready
          ? 'Sistemul este pregatit. Autentifica-te cu userul admin si parola admin.'
          : 'Sistemul este pregatit. Daca baza exista deja, foloseste parola curenta a contului admin.'
      );
      setTimeout(() => {
        if (window.BUSINESS_UI?.requestLogout) {
          window.BUSINESS_UI.requestLogout({ confirm: false });
        } else {
          window.AUTH?.logout?.();
        }
      }, 900);
    } catch (e) {
      const message = e.message || 'Eroare la salvarea configuratiei.';
      if (/actiune necunoscuta|unknown action|saveSystemDatabaseInfo|bootstrapSystem/i.test(message)) {
        const uploadMessage = 'Serverul nu are endpointul nou. Urca server/api.php si server/schema.sql in acelasi folder, apoi incearca din nou.';
        setSystemStatus(uploadMessage, 'warning');
        showSweetError('API server neactualizat', uploadMessage);
        return;
      }
      if (/schema\.sql|schema sql/i.test(message)) {
        const schemaMessage = 'schema.sql lipseste pe server. Urca fisierul langa api.php sau debifeaza rularea automata.';
        setSystemStatus(schemaMessage, 'warning');
        showSweetError('Schema lipsa', schemaMessage);
        return;
      }
      if (/CREATE DATABASE|nu o poate crea|permission|privilege|access denied/i.test(message)) {
        const permissionMessage = `${message} Utilizatorul MySQL trebuie sa aiba permisiunea CREATE DATABASE.`;
        setSystemStatus(permissionMessage, 'error');
        showSweetError('Permisiuni MySQL insuficiente', permissionMessage);
        return;
      }
      setSystemStatus(message, 'error');
      showSweetError('Eroare sistem', message);
    } finally {
      if (systemSaveBtn) systemSaveBtn.disabled = false;
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    if (!canManageUsers()) return;
    setError('');

    const userId = idInput.value;
    const password = passwordInput.value.trim();
    if (!userId && !password) {
      setError('Parola este obligatorie la creare.');
      return;
    }
    const duplicate = findDuplicateUsername(usernameInput.value, userId);
    if (duplicate) {
      const message = `Username-ul "${usernameInput.value.trim()}" exista deja. Alege alt username.`;
      setError(message);
      showSweetError('Username deja folosit', message);
      return;
    }
    if (roleInput.value === 'admin' && !['desktop', 'both'].includes(platformInput.value)) {
      setError('Conturile admin pot avea acces pe Desktop sau Desktop + Mobil.');
      return;
    }
    if (!['mobile', 'desktop', 'both'].includes(platformInput.value)) {
      setError('Accesul platforma poate fi Mobile, Desktop sau Desktop + Mobil.');
      return;
    }

    const protectedAdmin = isProtectedAdminUser(currentEditingUser());
    const payload = {
      display_name: displayNameInput.value.trim(),
      username: usernameInput.value.trim(),
      password,
      role: protectedAdmin ? 'admin' : roleInput.value,
      platform_access: protectedAdmin ? 'both' : platformInput.value,
      support_chat_access: protectedAdmin ? 1 : (supportChatInput?.checked ? 1 : 0),
      client_panel_access: protectedAdmin ? 1 : (roleInput.value !== 'user' || clientPanelInput?.checked ? 1 : 0),
      client_edit_access: protectedAdmin ? 1 : (roleInput.value === 'user' && clientEditInput?.checked ? 1 : 0),
      service_sheet_access: protectedAdmin ? 1 : (roleInput.value !== 'user' || serviceSheetInput?.checked ? 1 : 0),
      client_financial_access: protectedAdmin ? 1 : (roleInput.value !== 'user' || clientFinancialInput?.checked ? 1 : 0),
      is_active: protectedAdmin ? 1 : (activeInput.checked ? 1 : 0),
    };

    try {
      saveBtn.disabled = true;
      const savedUser = userId
        ? await window.API.updateUser(token(), userId, payload)
        : await window.API.createUser(token(), payload);
      const savedIndex = users.findIndex((user) => user.id === savedUser.id);
      if (savedIndex >= 0) users[savedIndex] = savedUser;
      else users.push(savedUser);
      resetForm();
      renderUsers();
      window.dispatchEvent(new CustomEvent('users-change'));
    } catch (e) {
      const message = e.message || 'Eroare la salvarea userului.';
      setError(message);
      if (/username|exista|duplicat|duplicate/i.test(message)) {
        showSweetError('Username deja folosit', message);
      }
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function deleteUser(userId) {
    if (!canManageUsers() || !userId) return;
    const user = users.find((item) => item.id === userId);
    if (isProtectedAdminUser(user)) {
      setError('Userul principal "admin" nu poate fi sters.');
      return;
    }
    if (!window.confirm(`Stergi userul ${user?.display_name || user?.username || ''}?`)) return;
    try {
      await window.API.deleteUser(token(), userId);
      if (idInput.value === userId) resetForm();
      users = users.filter((item) => item.id !== userId);
      renderUsers();
      window.dispatchEvent(new CustomEvent('users-change'));
    } catch (e) {
      setError(e.message || 'Eroare la stergerea userului.');
    }
  }

  form.addEventListener('submit', saveUser);
  companyForm?.addEventListener('submit', saveCompanySettings);
  companyLoadBtn?.addEventListener('click', loadCompanySettings);
  companyStampPickBtn?.addEventListener('click', () => {
    if (companyStampFileInput) {
      companyStampFileInput.value = '';
      companyStampFileInput.click();
    }
  });
  companyStampClearBtn?.addEventListener('click', () => {
    companyStampImage = '';
    if (companyStampFileInput) companyStampFileInput.value = '';
    renderCompanyStampPreview();
  });
  companyStampFileInput?.addEventListener('change', async () => {
    const file = companyStampFileInput.files?.[0];
    if (!file) return;
    try {
      companyStampImage = await imageFileToJpegDataUrl(file);
      renderCompanyStampPreview();
      setCompanyStatus('Stampila este pregatita. Apasa Salveaza datele firmei.', 'info');
    } catch (error) {
      showSweetError('Stampila invalida', error.message || 'Nu pot incarca stampila.');
      if (companyStampFileInput) companyStampFileInput.value = '';
    }
  });
  pricePresetForm?.addEventListener('submit', savePricePreset);
  pricePresetResetBtn?.addEventListener('click', resetPricePresetForm);
  pricePresetListEl?.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.price-preset-edit');
    const deleteBtn = event.target.closest('.price-preset-delete');
    if (editBtn) editPricePreset(editBtn.dataset.id);
    if (deleteBtn) deletePricePreset(deleteBtn.dataset.id);
  });
  systemForm?.addEventListener('submit', saveSystemDatabaseInfo);
  systemForm?.addEventListener('click', (event) => {
    if (!event.target.closest('#system-db-pass-toggle')) return;
    event.preventDefault();
    event.stopPropagation();
    toggleSystemDbPasswordVisibility();
  });
  systemLoadBtn?.addEventListener('click', loadSystemDatabaseInfo);
  roleInput.addEventListener('change', syncPlatformForRole);
  platformInput.addEventListener('change', syncPlatformForRole);
  resetBtn.addEventListener('click', resetForm);
  refreshBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    loadUsers();
  });

  listEl.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.user-edit-btn');
    const deleteBtn = event.target.closest('.user-delete-btn');
    if (editBtn) editUser(editBtn.dataset.id);
    if (deleteBtn) deleteUser(deleteBtn.dataset.id);
  });

  window.addEventListener('tab-change', ({ detail }) => {
    if (detail === 'settings') {
      loadUsersWhenAvailable();
      if (canManageCompanySettings()) loadCompanySettings();
      if (canManageCompanySettings()) loadPricePresets();
      if (canManageUsers()) loadSystemDatabaseInfo();
    }
  });

  window.addEventListener('auth-change', () => {
    const nextAuthUserId = window.AUTH?.getUser?.()?.id || '';
    if (nextAuthUserId !== authUserId) {
      authUserId = nextAuthUserId;
      users = [];
      usersLoaded = false;
      usersLoading = false;
      resetForm();
      listEl.innerHTML = '<div class="loading">Se incarca...</div>';
      renderUserSummary();
    }
    if (!settingsTabIsActive()) return;
    loadUsersWhenAvailable();
    if (canManageCompanySettings()) loadCompanySettings();
    if (canManageCompanySettings()) loadPricePresets();
    if (canManageUsers()) loadSystemDatabaseInfo();
  });

  setupSettingsPanels();
  resetForm();
  listEl.innerHTML = '<div class="loading">Se incarca...</div>';
  if (settingsTabIsActive()) {
    loadUsersWhenAvailable();
    if (canManageCompanySettings()) loadCompanySettings();
    if (canManageCompanySettings()) loadPricePresets();
    if (canManageUsers()) loadSystemDatabaseInfo();
  }
})();
