// Global desktop authentication
(function() {
  const TOKEN_KEY = 'gtrots_auth_token';
  const USER_KEY = 'gtrots_auth_user';

  const startupStartedAt = Date.now();
  let authToken = sessionStorage.getItem(TOKEN_KEY) || '';
  let authUser = null;

  try {
    authUser = JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
  } catch {
    authUser = null;
  }

  const startupLoader = document.getElementById('startup-loader');
  const overlay = document.getElementById('auth-overlay');
  const loginForm = document.getElementById('auth-login-form');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const errorBox = document.getElementById('auth-error');
  const userLabel = document.getElementById('auth-user-label');
  const logoutBtn = document.getElementById('auth-logout-btn');
  let startupComplete = false;
  let resolveAuthReady;
  const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });

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

  function isAdmin() {
    return authUser?.role === 'admin';
  }

  function canManagePartners() {
    return authUser?.role === 'admin' || authUser?.role === 'manager';
  }

  function canUseSupportChat() {
    return Boolean(authUser?.support_chat_access);
  }

  function canViewClientPanel() {
    if (!authUser) return false;
    return ['admin', 'manager'].includes(authUser.role) || Boolean(authUser.client_panel_access);
  }

  function canViewServiceSheets() {
    if (!authUser) return false;
    return ['admin', 'manager'].includes(authUser.role) || authUser.service_sheet_access !== false;
  }

  function canViewClientFinancials() {
    if (!authUser) return false;
    return ['admin', 'manager'].includes(authUser.role) || authUser.client_financial_access !== false;
  }

  function canViewStats() {
    return ['admin', 'manager'].includes(authUser?.role);
  }

  function isLoggedIn() {
    return Boolean(authToken && authUser);
  }

  function persist(token, user) {
    authToken = token || '';
    authUser = user || null;
    if (authToken && authUser) {
      sessionStorage.setItem(TOKEN_KEY, authToken);
      sessionStorage.setItem(USER_KEY, JSON.stringify(authUser));
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
  }

  function updateAdminVisibility() {
    document.querySelectorAll('[data-admin-only="true"]').forEach((el) => {
      el.style.display = isAdmin() ? '' : 'none';
    });
    document.querySelectorAll('[data-partners-access="true"]').forEach((el) => {
      el.style.display = canManagePartners() ? '' : 'none';
    });
    document.querySelectorAll('[data-client-panel-access="true"]').forEach((el) => {
      el.style.display = canViewClientPanel() ? '' : 'none';
    });
    document.querySelectorAll('[data-service-sheet-access="true"]').forEach((el) => {
      el.style.display = canViewServiceSheets() ? '' : 'none';
    });
    document.querySelectorAll('[data-stats-access="true"]').forEach((el) => {
      el.style.display = canViewStats() ? '' : 'none';
    });
    const activeAdminTab = document.querySelector('.nav-btn.active[data-admin-only="true"]');
    if (activeAdminTab && !isAdmin() && window.switchTab) {
      window.switchTab('scanner');
    }
    const activePartnersTab = document.querySelector('.nav-btn.active[data-partners-access="true"]');
    if (activePartnersTab && !canManagePartners() && window.switchTab) {
      window.switchTab('scanner');
    }
    const activeClientsTab = document.querySelector('.nav-btn.active[data-client-panel-access="true"]');
    if (activeClientsTab && !canViewClientPanel() && window.switchTab) {
      window.switchTab('scanner');
    }
    const activeServiceTab = document.querySelector('.nav-btn.active[data-service-sheet-access="true"]');
    if (activeServiceTab && !canViewServiceSheets() && window.switchTab) {
      window.switchTab('scanner');
    }
    const activeStatsTab = document.querySelector('.nav-btn.active[data-stats-access="true"]');
    if (activeStatsTab && !canViewStats() && window.switchTab) {
      window.switchTab('scanner');
    }
  }

  function renderAuthState(notifyModules = true) {
    if (overlay) {
      if (isLoggedIn()) {
        overlay.classList.remove('auth-entered');
        overlay.style.display = 'none';
      } else {
        overlay.style.display = 'flex';
        overlay.classList.remove('auth-entered');
        if (startupComplete) {
          requestAnimationFrame(() => {
            overlay.classList.add('auth-entered');
          });
        }
      }
    }
    if (userLabel) {
      userLabel.textContent = isLoggedIn()
        ? `${authUser.display_name || authUser.username} (${authUser.role})`
        : 'Neautentificat';
    }
    if (logoutBtn) logoutBtn.style.display = isLoggedIn() ? 'inline-flex' : 'none';
    updateAdminVisibility();
    if (notifyModules) {
      window.dispatchEvent(new CustomEvent('auth-change', {
        detail: { token: authToken, user: authUser },
      }));
    }
  }

  function hideStartupLoader() {
    const elapsed = Date.now() - startupStartedAt;
    const delay = Math.max(900 - elapsed, 0);
    setTimeout(() => {
      if (startupLoader) {
        startupLoader.classList.add('startup-hidden');
        setTimeout(() => {
          startupLoader.style.display = 'none';
        }, 360);
      }
      startupComplete = true;
      if (!isLoggedIn()) {
        overlay?.classList.add('auth-entered');
        usernameInput?.focus();
      }
    }, delay);
  }

  async function login(username, password) {
    const result = await window.API.login(username, password, 'desktop');
    persist(result.token, result.user);
    renderAuthState();
    return result;
  }

  async function logout() {
    const token = authToken;
    persist('', null);
    renderAuthState();
    if (token) {
      try {
        await window.API.logout(token);
      } catch {}
    }
  }

  async function validateStoredSession() {
    if (!authToken) return;
    try {
      const freshUser = await window.API.getCurrentUser(authToken);
      persist(authToken, freshUser);
    } catch {
      persist('', null);
    }
  }

  async function refreshCurrentUser() {
    if (!authToken) return null;
    const freshUser = await window.API.getCurrentUser(authToken);
    persist(authToken, freshUser);
    // Verificarea periodică a sesiunii actualizează contul și permisiunile în
    // fundal. Nu notificăm modulele, fiindcă acestea ar reconstrui pagina
    // vizibilă, ar reseta controalele și ar produce un flash la fiecare 2 minute.
    renderAuthState(false);
    return freshUser;
  }

  async function updateOwnProfile(profile) {
    if (!authToken) throw new Error('Sesiunea nu este activa.');
    const freshUser = await window.API.updateOwnProfile(authToken, profile);
    persist(authToken, freshUser);
    renderAuthState();
    return freshUser;
  }

  async function initializeAuth() {
    try {
      await validateStoredSession();
      renderAuthState();
      hideStartupLoader();
    } finally {
      resolveAuthReady?.();
      resolveAuthReady = null;
    }
  }

  window.AUTH = {
    getToken: () => authToken,
    getUser: () => authUser,
    whenReady: () => authReady,
    isLoggedIn,
    isAdmin,
    canManagePartners,
    canUseSupportChat,
    canViewClientPanel,
    canViewClientFinancials,
    canViewStats,
    login,
    logout,
    refreshCurrentUser,
    updateOwnProfile,
  };

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');
    try {
      await login(usernameInput.value.trim(), passwordInput.value.trim());
      passwordInput.value = '';
    } catch (e) {
      persist('', null);
      renderAuthState();
      setError(e.message || 'Autentificare esuata.');
    }
  });

  logoutBtn?.addEventListener('click', () => {
    if (window.BUSINESS_UI?.requestLogout) {
      window.BUSINESS_UI.requestLogout();
      return;
    }
    logout();
  });

  initializeAuth();
})();
