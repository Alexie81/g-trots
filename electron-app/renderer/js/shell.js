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
  const openShopNotificationsButton = document.getElementById('topbar-open-shop-notifications');
  const shopNotificationsSummary = document.getElementById('topbar-shop-notifications-summary');
  const shopNotificationsPanel = document.getElementById('topbar-shop-notifications-panel');
  const shopNotificationsList = document.getElementById('topbar-shop-notifications-list');
  const shopNotificationsReadAll = document.getElementById('topbar-shop-notifications-read-all');
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
  let shopUnreadCount = 0;
  let shopNotificationsTimer = null;
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
    if (shopNotificationsPanel) shopNotificationsPanel.hidden = true;
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
    const notificationCount = chatUnreadCount + shopUnreadCount;
    const visible = notificationCount > 0;
    notificationsBadge.hidden = !visible;
    notificationsBadge.textContent = notificationCount > 9 ? '9+' : String(notificationCount);
    notificationsSummary.textContent = visible ? `${notificationCount} notificari noi` : 'Totul este la zi';
    chatSummary.textContent = chatUnreadCount > 0 ? `${chatUnreadCount} mesaje necitite` : 'Niciun mesaj necitit';
    if (shopNotificationsSummary) shopNotificationsSummary.textContent = shopUnreadCount > 0 ? `${shopUnreadCount} alerte necitite` : 'Activitatea magazinului este la zi';
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

  function shopNotificationType(item) {
    return String(item?.notification_type || item?.type || '').trim();
  }

  function shopNotificationSeverity(item) {
    const explicit = String(item?.severity || item?.tone || '').trim().toLowerCase();
    if (['success', 'warning', 'error', 'info'].includes(explicit)) return explicit;
    const type = shopNotificationType(item);
    if (type === 'new_order') return 'success';
    if (type === 'return_requested' || type === 'spv_deadline') return 'warning';
    if (type === 'order_cancelled' || type === 'spv_error' || type === 'spv_rejected') return 'error';
    return 'info';
  }

  function shopNotificationIcon(type) {
    const icons = {
      new_order: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/><path d="M12 12v5m-2.5-2.5h5"/></svg>',
      return_requested: '<svg viewBox="0 0 24 24"><path d="M9 7H5v-4"/><path d="M5 7a8 8 0 1 1-1 8"/><path d="m5 7 4-4"/></svg>',
      order_cancelled: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
      spv_deadline: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
      spv_error: '<svg viewBox="0 0 24 24"><path d="m12 3 9 17H3L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>',
      spv_rejected: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
    };
    return icons[type] || '<svg viewBox="0 0 24 24"><path d="M12 4a7 7 0 0 0-7 7v4l-2 3h18l-2-3v-4a7 7 0 0 0-7-7Z"/><path d="M10 21h4"/></svg>';
  }

  function shopNotificationTime(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '';
    const elapsed = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return 'acum';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
  }

  function renderShopNotificationFeed(feed) {
    shopUnreadCount = Math.max(0, Number(feed?.unread_count || 0));
    renderNotifications();
    if (!shopNotificationsList) return;
    if (shopNotificationsReadAll) shopNotificationsReadAll.hidden = shopUnreadCount === 0;
    const items = Array.isArray(feed?.items) ? feed.items.filter(item => !item.read) : [];
    shopNotificationsList.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('small');
      empty.className = 'topbar-shop-notifications-empty';
      empty.textContent = 'Nu există alerte SHOP.';
      shopNotificationsList.appendChild(empty);
      return;
    }
    items.slice(0, 30).forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      const type = shopNotificationType(item);
      const severity = shopNotificationSeverity(item);
      button.className = `topbar-shop-notification ${item.read ? 'read' : 'unread'} ${severity}`;
      const icon = document.createElement('i');
      icon.innerHTML = shopNotificationIcon(type);
      const copy = document.createElement('span');
      const heading = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = item.title || 'Notificare SHOP';
      const time = document.createElement('time');
      time.textContent = shopNotificationTime(item.created_at);
      const body = document.createElement('small');
      body.textContent = item.body || '';
      heading.append(title, time);
      copy.append(heading, body);
      const arrow = document.createElement('b');
      arrow.className = 'topbar-shop-notification-arrow';
      arrow.innerHTML = '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
      button.append(icon, copy, arrow);
      button.addEventListener('click', async event => {
        event.stopPropagation();
        if (button.classList.contains('dismissing')) return;
        button.classList.add('dismissing');
        shopUnreadCount = Math.max(0, shopUnreadCount - 1);
        renderNotifications();
        void window.SHOP_API?.markShopNotificationRead?.(item.id, false).catch(() => void refreshShopNotifications(true));
        window.setTimeout(() => {
          button.remove();
          closeMenus();
          const entityType = item.entity_type === 'invoice' ? 'invoice' : 'order';
          window.switchTab?.(entityType === 'invoice' ? 'shop-invoices' : 'shop-orders');
          window.setTimeout(() => window.dispatchEvent(new CustomEvent('shop-open-entity', { detail: { type: entityType, id: item.entity_id } })), 120);
        }, 230);
      });
      shopNotificationsList.appendChild(button);
    });
  }

  async function refreshShopNotifications(full = false) {
    if (!window.AUTH?.isLoggedIn?.() || !window.SHOP_API) return;
    try {
      if (full) renderShopNotificationFeed(await window.SHOP_API.listShopNotifications(50, true));
      else {
        const summary = await window.SHOP_API.getShopNotificationSummary();
        shopUnreadCount = Math.max(0, Number(summary?.unread_count || 0));
        renderNotifications();
      }
    } catch {
      if (shopNotificationsSummary) shopNotificationsSummary.textContent = 'Alertele SHOP nu au putut fi verificate';
    }
  }

  function startShopNotifications() {
    clearInterval(shopNotificationsTimer);
    if (!window.AUTH?.isLoggedIn?.()) { shopUnreadCount = 0; renderNotifications(); return; }
    void refreshShopNotifications(false);
    shopNotificationsTimer = setInterval(() => void refreshShopNotifications(false), 60000);
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
  openShopNotificationsButton?.addEventListener('click', event => {
    event.stopPropagation();
    if (!shopNotificationsPanel) return;
    shopNotificationsPanel.hidden = !shopNotificationsPanel.hidden;
    if (!shopNotificationsPanel.hidden) void refreshShopNotifications(true);
  });
  shopNotificationsReadAll?.addEventListener('click', async event => {
    event.stopPropagation();
    const rows = Array.from(shopNotificationsList?.querySelectorAll('.topbar-shop-notification') || []);
    rows.forEach((row, index) => window.setTimeout(() => row.classList.add('dismissing'), index * 28));
    shopUnreadCount = 0;
    renderNotifications();
    shopNotificationsReadAll.hidden = true;
    try {
      await window.SHOP_API.markShopNotificationRead('', true);
      window.setTimeout(() => renderShopNotificationFeed({ unread_count: 0, items: [] }), Math.min(420, 230 + rows.length * 28));
    } catch (error) {
      showToast(error.message || 'Notificările nu au putut fi marcate.', 'error');
      void refreshShopNotifications(true);
    }
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
    startShopNotifications();
  });
  window.addEventListener('focus', () => refreshAccount(true));

  window.BUSINESS_UI = { showToast, openProfile, requestLogout, closeMenus };
  renderAccount();
  renderNotifications();
  startRefresh();
  startShopNotifications();
})();
