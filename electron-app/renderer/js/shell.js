// Global business shell: account management, notifications and toasts.
(function() {
  const sidebarButton = document.getElementById('sidebar-account-btn');
  const sidebarAvatar = document.getElementById('sidebar-account-avatar');
  const sidebarName = document.getElementById('auth-user-label');
  const sidebarRole = document.getElementById('sidebar-account-role');
  const sidebarStatus = document.getElementById('sidebar-account-status');
  const topbarButton = document.getElementById('topbar-account-btn');
  const topbarAvatar = document.getElementById('topbar-account-avatar');
  const topbarName = document.getElementById('topbar-account-name');
  const topbarRole = document.getElementById('topbar-account-role');
  const menuAvatar = document.getElementById('menu-account-avatar');
  const menuName = document.getElementById('menu-account-name');
  const menuMeta = document.getElementById('menu-account-meta');
  const accountMenu = document.getElementById('topbar-account-menu');
  const notificationsButton = document.getElementById('topbar-notifications-btn');
  const notificationsMenu = document.getElementById('topbar-notifications-menu');
  const notificationsBadge = document.getElementById('topbar-notifications-badge');
  const notificationsSummary = document.getElementById('topbar-notifications-summary');
  const chatSummary = document.getElementById('topbar-chat-summary');
  const openChatButton = document.getElementById('topbar-open-chat');
  const openUpdateButton = document.getElementById('topbar-open-update');
  const profileModal = document.getElementById('profile-modal');
  const profileForm = document.getElementById('profile-form');
  const profileClose = document.getElementById('profile-modal-close');
  const profileCancel = document.getElementById('profile-modal-cancel');
  const profileAvatar = document.getElementById('profile-modal-avatar');
  const profileUsername = document.getElementById('profile-modal-username');
  const profileAccess = document.getElementById('profile-modal-access');
  const profileDisplayName = document.getElementById('profile-display-name');
  const profilePassword = document.getElementById('profile-password');
  const profileSave = document.getElementById('profile-save-btn');
  const logoutModal = document.getElementById('logout-modal');
  const logoutClose = document.getElementById('logout-modal-close');
  const logoutCancel = document.getElementById('logout-modal-cancel');
  const logoutConfirm = document.getElementById('logout-confirm-btn');
  const logoutConfirmView = document.getElementById('logout-confirm-view');
  const logoutLoadingView = document.getElementById('logout-loading-view');
  const logoutActions = document.getElementById('logout-modal-actions');
  const toastStack = document.getElementById('business-toast-stack');
  let chatUnreadCount = 0;
  let refreshTimer = null;
  let logoutInProgress = false;

  function initials(value) {
    return String(value || 'U').trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'U';
  }

  function roleLabel(role) {
    return ({ admin: 'Administrator', manager: 'Manager', user: 'Utilizator' })[role] || 'Utilizator';
  }

  function platformLabel(platform) {
    return ({ desktop: 'Desktop', mobile: 'Mobile', both: 'Desktop + Mobil' })[platform] || 'Mobile';
  }

  function canEditOwnProfile() {
    const user = window.AUTH?.getUser?.();
    return Boolean(user && window.AUTH?.isLoggedIn?.() && user.role === 'admin');
  }

  function closeMenus() {
    accountMenu.hidden = true;
    notificationsMenu.hidden = true;
    topbarButton?.classList.remove('active');
    notificationsButton?.classList.remove('active');
  }

  function toggleMenu(menu, button) {
    const willOpen = menu.hidden;
    closeMenus();
    menu.hidden = !willOpen;
    button?.classList.toggle('active', willOpen);
  }

  function showToast(message, type = 'success') {
    if (!toastStack) return;
    const toast = document.createElement('div');
    toast.className = `business-toast ${type}`;
    toast.innerHTML = `<span></span><div><strong>${type === 'error' ? 'Eroare' : 'Gata'}</strong><small></small></div>`;
    toast.querySelector('small').textContent = message;
    toastStack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 240);
    }, 3200);
  }

  function renderAccount() {
    const user = window.AUTH?.getUser?.();
    const loggedIn = Boolean(user && window.AUTH?.isLoggedIn?.());
    const name = loggedIn ? (user.display_name || user.username) : 'Neautentificat';
    const avatar = initials(name);
    const role = loggedIn ? roleLabel(user.role) : 'Offline';
    const meta = loggedIn ? `@${user.username} · ${platformLabel(user.platform_access)}` : 'Sesiune inchisa';

    [sidebarAvatar, topbarAvatar, menuAvatar, profileAvatar].forEach(element => {
      if (element) element.textContent = avatar;
    });
    if (sidebarName) sidebarName.textContent = name;
    if (sidebarRole) sidebarRole.textContent = role;
    if (sidebarStatus) sidebarStatus.textContent = loggedIn ? 'Online' : 'Offline';
    if (topbarName) topbarName.textContent = name;
    if (topbarRole) topbarRole.textContent = role;
    if (menuName) menuName.textContent = name;
    if (menuMeta) menuMeta.textContent = meta;
    sidebarButton?.classList.toggle('is-online', loggedIn);
    topbarButton?.classList.toggle('is-online', loggedIn);

    const canEditProfile = canEditOwnProfile();
    document.querySelectorAll('[data-account-action="profile"]').forEach(button => {
      button.hidden = !canEditProfile;
      button.disabled = !canEditProfile;
    });
    sidebarButton?.classList.toggle('profile-disabled', loggedIn && !canEditProfile);
    sidebarButton?.setAttribute('aria-disabled', loggedIn && !canEditProfile ? 'true' : 'false');
    sidebarButton?.setAttribute(
      'title',
      loggedIn && !canEditProfile ? 'Profilul poate fi modificat doar de administrator.' : 'Editeaza profilul'
    );
  }

  function renderNotifications() {
    const notificationCount = chatUnreadCount;
    const visible = notificationCount > 0;
    notificationsBadge.hidden = !visible;
    notificationsBadge.textContent = notificationCount > 9 ? '9+' : String(notificationCount);
    notificationsSummary.textContent = visible ? `${notificationCount} notificari noi` : 'Totul este la zi';
    chatSummary.textContent = chatUnreadCount > 0 ? `${chatUnreadCount} mesaje necitite` : 'Niciun mesaj necitit';
    if (openUpdateButton) openUpdateButton.hidden = true;
  }

  function openProfile() {
    const user = window.AUTH?.getUser?.();
    if (!user || !canEditOwnProfile()) return;
    closeMenus();
    profileDisplayName.value = user.display_name || user.username || '';
    profilePassword.value = '';
    profileUsername.textContent = `@${user.username}`;
    profileAccess.textContent = `${roleLabel(user.role)} · ${platformLabel(user.platform_access)}`;
    profileModal.hidden = false;
    void profileModal.offsetWidth;
    profileModal.classList.add('visible');
    setTimeout(() => profileDisplayName.focus(), 120);
  }

  function closeProfile() {
    profileModal.classList.remove('visible');
    setTimeout(() => { profileModal.hidden = true; }, 220);
  }

  function setLogoutLoading(isLoading) {
    logoutInProgress = isLoading;
    logoutConfirmView.hidden = isLoading;
    logoutLoadingView.hidden = !isLoading;
    logoutActions.hidden = isLoading;
    logoutClose.disabled = isLoading;
    logoutCancel.disabled = isLoading;
    logoutConfirm.disabled = isLoading;
    logoutModal?.classList.toggle('is-loading', isLoading);
  }

  function openLogoutModal({ confirm = true } = {}) {
    closeMenus();
    if (!window.AUTH?.isLoggedIn?.()) return;
    setLogoutLoading(false);
    logoutModal.hidden = false;
    void logoutModal.offsetWidth;
    logoutModal.classList.add('visible');
    if (confirm) {
      setTimeout(() => logoutConfirm.focus(), 120);
    } else {
      confirmLogout();
    }
  }

  function closeLogoutModal() {
    if (logoutInProgress) return;
    logoutModal.classList.remove('visible');
    setTimeout(() => { logoutModal.hidden = true; }, 220);
  }

  async function confirmLogout() {
    if (logoutInProgress) return;
    setLogoutLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 450));
      await window.AUTH?.logout?.();
      showToast('Sesiunea a fost inchisa.');
      logoutModal.classList.remove('visible');
      setTimeout(() => {
        logoutModal.hidden = true;
        setLogoutLoading(false);
      }, 220);
    } catch (error) {
      setLogoutLoading(false);
      showToast(error.message || 'Delogarea nu a reusit.', 'error');
    }
  }

  function requestLogout(options = {}) {
    openLogoutModal(options);
  }

  async function refreshAccount(silent = true) {
    if (!window.AUTH?.isLoggedIn?.() || document.hidden) return;
    try {
      await window.AUTH.refreshCurrentUser();
    } catch (error) {
      if (!silent) showToast(error.message || 'Contul nu a putut fi actualizat.', 'error');
    }
  }

  function startRefresh() {
    clearInterval(refreshTimer);
    if (!window.AUTH?.isLoggedIn?.()) return;
    refreshTimer = setInterval(() => refreshAccount(true), 120000);
  }

  sidebarButton?.addEventListener('click', openProfile);
  topbarButton?.addEventListener('click', event => {
    event.stopPropagation();
    toggleMenu(accountMenu, topbarButton);
  });
  notificationsButton?.addEventListener('click', event => {
    event.stopPropagation();
    toggleMenu(notificationsMenu, notificationsButton);
  });
  openChatButton?.addEventListener('click', () => {
    closeMenus();
    window.switchTab?.('chat');
  });
  openUpdateButton?.addEventListener('click', () => {
    closeMenus();
    window.APP_UPDATER_UI?.open?.();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.business-dropdown-wrap')) closeMenus();
  });
  document.querySelectorAll('[data-account-action]').forEach(button => {
    button.addEventListener('click', async () => {
      const action = button.dataset.accountAction;
      if (action === 'profile') openProfile();
      if (action === 'settings') {
        closeMenus();
        window.switchTab?.('settings');
      }
      if (action === 'logout') {
        requestLogout();
      }
    });
  });
  profileClose?.addEventListener('click', closeProfile);
  profileCancel?.addEventListener('click', closeProfile);
  profileModal?.addEventListener('click', event => {
    if (event.target === profileModal) closeProfile();
  });
  logoutClose?.addEventListener('click', closeLogoutModal);
  logoutCancel?.addEventListener('click', closeLogoutModal);
  logoutConfirm?.addEventListener('click', confirmLogout);
  logoutModal?.addEventListener('click', event => {
    if (event.target === logoutModal) closeLogoutModal();
  });
  profileForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!canEditOwnProfile()) {
      closeProfile();
      return;
    }
    profileSave.disabled = true;
    try {
      await window.AUTH.updateOwnProfile({
        display_name: profileDisplayName.value.trim(),
        password: profilePassword.value,
      });
      closeProfile();
      showToast('Profilul a fost actualizat.');
      window.dispatchEvent(new CustomEvent('users-change'));
    } catch (error) {
      showToast(error.message || 'Profilul nu a putut fi salvat.', 'error');
    } finally {
      profileSave.disabled = false;
    }
  });
  window.addEventListener('chat-unread-change', event => {
    chatUnreadCount = Math.max(0, Number(event.detail?.count || 0));
    renderNotifications();
  });
  window.addEventListener('auth-change', () => {
    renderAccount();
    startRefresh();
  });
  window.addEventListener('focus', () => refreshAccount(true));

  window.BUSINESS_UI = { showToast, openProfile, requestLogout, closeMenus };
  renderAccount();
  renderNotifications();
  startRefresh();
})();
