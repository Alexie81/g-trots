(function() {
  const updater = window.desktopUpdater;
  const card = document.getElementById('app-update-card');
  const sidebarLogoVersionEl = document.getElementById('sidebar-logo-version');
  const currentVersionEl = document.getElementById('app-current-version');
  const sidebarVersionEl = document.getElementById('sidebar-app-version');
  const messageEl = document.getElementById('app-update-message');
  const badgeEl = document.getElementById('app-update-badge');
  const progressEl = document.getElementById('app-update-progress');
  const progressFillEl = document.getElementById('app-update-progress-fill');
  const progressLabelEl = document.getElementById('app-update-progress-label');
  const checkBtn = document.getElementById('app-update-check-btn');
  const downloadBtn = document.getElementById('app-update-download-btn');
  const installBtn = document.getElementById('app-update-install-btn');
  const sidebarUpdateCard = document.getElementById('sidebar-update-card');
  const sidebarUpdateTitle = document.getElementById('sidebar-update-title');
  const sidebarUpdateMessage = document.getElementById('sidebar-update-message');
  const sidebarUpdateProgressFill = document.getElementById('sidebar-update-progress-fill');

  const modal = document.getElementById('app-update-modal');
  const modalCard = modal?.querySelector('.app-update-modal');
  const modalClose = document.getElementById('app-update-modal-close');
  const modalCancel = document.getElementById('app-update-modal-cancel');
  const modalConfirm = document.getElementById('app-update-modal-confirm');
  const modalActions = document.getElementById('app-update-modal-actions');
  const modalSubtitle = document.getElementById('app-update-modal-subtitle');
  const confirmView = document.getElementById('app-update-confirm-view');
  const loadingView = document.getElementById('app-update-loading-view');
  const modalCurrent = document.getElementById('app-update-modal-current');
  const modalAvailable = document.getElementById('app-update-modal-available');
  const modalMessage = document.getElementById('app-update-modal-message');
  const loadingTitle = document.getElementById('app-update-loading-title');
  const loadingMessage = document.getElementById('app-update-loading-message');
  const modalProgressFill = document.getElementById('app-update-modal-progress-fill');
  const modalProgressLabel = document.getElementById('app-update-modal-progress-label');

  if (!updater || !card) return;

  let currentState = {
    status: 'idle',
    currentVersion: '',
    availableVersion: '',
    percent: 0,
    message: 'Poti verifica daca exista o versiune noua.',
  };
  let installTriggered = false;
  let updateWasOffered = false;

  const statusLabels = {
    idle: 'Pregatit',
    checking: 'Verificare',
    available: 'Update nou',
    downloading: 'Descarcare',
    downloaded: 'Pregatit',
    current: 'La zi',
    development: 'Mod dev',
    error: 'Eroare',
    installing: 'Instalare',
  };

  function isBusy(status = currentState.status) {
    return status === 'checking' || status === 'downloading' || status === 'installing' || installTriggered;
  }

  function renderSidebarUpdate(state) {
    if (!sidebarUpdateCard) return;
    const status = state.status || 'idle';
    const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
    if (['available', 'downloading', 'downloaded', 'installing'].includes(status)) updateWasOffered = true;

    const visible = ['available', 'downloading', 'downloaded', 'installing'].includes(status)
      || (status === 'error' && updateWasOffered);
    sidebarUpdateCard.hidden = !visible;
    sidebarUpdateCard.dataset.status = status;
    sidebarUpdateCard.disabled = status !== 'downloaded';

    if (sidebarUpdateProgressFill) {
      sidebarUpdateProgressFill.style.width = `${status === 'downloaded' || status === 'installing' ? 100 : percent}%`;
    }

    if (status === 'available') {
      if (sidebarUpdateTitle) sidebarUpdateTitle.textContent = `Update ${state.availableVersion ? `v${state.availableVersion}` : 'nou'}`;
      if (sidebarUpdateMessage) sidebarUpdateMessage.textContent = 'Se pregateste descarcarea...';
      return;
    }
    if (status === 'downloading') {
      if (sidebarUpdateTitle) sidebarUpdateTitle.textContent = `Se descarca ${state.availableVersion ? `v${state.availableVersion}` : 'update-ul'}`;
      if (sidebarUpdateMessage) sidebarUpdateMessage.textContent = `${percent.toFixed(0)}% · Poti continua sa lucrezi`;
      return;
    }
    if (status === 'downloaded') {
      if (sidebarUpdateTitle) sidebarUpdateTitle.textContent = 'Actualizarea este gata';
      if (sidebarUpdateMessage) sidebarUpdateMessage.textContent = 'Apasa pentru repornire';
      return;
    }
    if (status === 'installing') {
      if (sidebarUpdateTitle) sidebarUpdateTitle.textContent = 'Se instaleaza actualizarea';
      if (sidebarUpdateMessage) sidebarUpdateMessage.textContent = 'G-Trots va reporni automat...';
      return;
    }
    if (status === 'error') {
      if (sidebarUpdateTitle) sidebarUpdateTitle.textContent = 'Update intrerupt';
      if (sidebarUpdateMessage) sidebarUpdateMessage.textContent = 'Verifica din Setari si incearca din nou';
    }
  }

  function renderCard(state) {
    const status = state.status || 'idle';
    const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
    card.dataset.status = status;
    if (sidebarLogoVersionEl && state.currentVersion) sidebarLogoVersionEl.textContent = `v${state.currentVersion}`;
    if (currentVersionEl && state.currentVersion) currentVersionEl.textContent = state.currentVersion;
    if (sidebarVersionEl && state.currentVersion) sidebarVersionEl.textContent = `v${state.currentVersion}`;
    if (messageEl) messageEl.textContent = state.message || 'Poti verifica daca exista o versiune noua.';
    if (badgeEl) badgeEl.textContent = statusLabels[status] || 'Update';

    const showProgress = status === 'downloading' || status === 'downloaded';
    if (progressEl) progressEl.hidden = !showProgress;
    if (progressFillEl) progressFillEl.style.width = `${status === 'downloaded' ? 100 : percent}%`;
    if (progressLabelEl) progressLabelEl.textContent = `${status === 'downloaded' ? 100 : percent.toFixed(0)}%`;

    if (checkBtn) {
      checkBtn.disabled = isBusy(status);
      checkBtn.textContent = status === 'checking' ? 'Se verifica...' : 'Verifica actualizari';
      checkBtn.hidden = status === 'downloaded';
    }
    if (downloadBtn) {
      downloadBtn.hidden = status !== 'available';
      downloadBtn.disabled = true;
      downloadBtn.textContent = 'Descarcare automata...';
    }
    if (installBtn) {
      installBtn.hidden = status !== 'downloaded';
      installBtn.disabled = status !== 'downloaded';
      installBtn.textContent = 'Instaleaza si reporneste';
    }
    window.refreshSettingsPanelHeights?.();
  }

  function setModalLoading(title, message, percent = 0) {
    if (confirmView) confirmView.hidden = true;
    if (loadingView) loadingView.hidden = false;
    if (modalActions) modalActions.hidden = false;
    if (loadingTitle) loadingTitle.textContent = title;
    if (loadingMessage) loadingMessage.textContent = message;
    if (modalProgressFill) modalProgressFill.style.width = `${percent}%`;
    if (modalProgressLabel) modalProgressLabel.textContent = `${Math.round(percent)}%`;
    if (modalConfirm) modalConfirm.hidden = true;
    if (modalCancel) {
      modalCancel.textContent = 'Anuleaza';
      modalCancel.disabled = true;
    }
    if (modalClose) modalClose.disabled = true;
    modalCard?.classList.add('is-loading');
  }

  function setModalConfirmation(state) {
    const status = state.status || 'idle';
    if (confirmView) confirmView.hidden = false;
    if (loadingView) loadingView.hidden = true;
    if (modalActions) modalActions.hidden = false;
    if (modalCurrent) modalCurrent.textContent = state.currentVersion || '-';
    if (modalAvailable) modalAvailable.textContent = state.availableVersion || state.currentVersion || '-';
    if (modalSubtitle) modalSubtitle.textContent = `G-Trots Desktop ${state.currentVersion || ''}`.trim();
    if (modalCancel) {
      modalCancel.disabled = false;
      modalCancel.textContent = status === 'available' || status === 'downloaded' ? 'Anuleaza' : 'Inchide';
    }
    if (modalClose) modalClose.disabled = false;
    modalCard?.classList.remove('is-loading');

    if (status === 'available') {
      if (modalMessage) modalMessage.textContent = `Versiunea ${state.availableVersion} este disponibila.`;
      if (modalConfirm) {
        modalConfirm.hidden = false;
        modalConfirm.textContent = 'Actualizeaza';
      }
      return;
    }
    if (status === 'downloaded') {
      if (modalMessage) modalMessage.textContent = `Versiunea ${state.availableVersion} este pregatita pentru instalare.`;
      if (modalConfirm) {
        modalConfirm.hidden = false;
        modalConfirm.textContent = 'Instaleaza si reporneste';
      }
      return;
    }
    if (status === 'current') {
      if (modalMessage) modalMessage.textContent = `Ai deja cea mai noua versiune (${state.currentVersion}).`;
    } else if (status === 'development') {
      if (modalMessage) modalMessage.textContent = 'Verificarea update-ului functioneaza in aplicatia instalata.';
    } else {
      if (modalMessage) modalMessage.textContent = state.message || 'Actualizarea nu a putut fi verificata.';
    }
    if (modalConfirm) modalConfirm.hidden = true;
  }

  function renderModal(state) {
    if (!modal || modal.hidden) return;
    const status = state.status || 'idle';
    const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
    if (status === 'checking') {
      setModalLoading('Verific actualizarea...', 'Caut cea mai noua versiune G-Trots.', 8);
      return;
    }
    if (status === 'downloading') {
      setModalLoading(
        `Se descarca versiunea ${state.availableVersion || ''}...`,
        'Te rugam sa nu inchizi aplicatia.',
        percent
      );
      return;
    }
    if (installTriggered) {
      setModalLoading('Se instaleaza actualizarea...', 'Aplicatia se va inchide si reporni automat.', 100);
      return;
    }
    setModalConfirmation(state);
  }

  function render(state = {}) {
    currentState = { ...currentState, ...state };
    renderCard(currentState);
    renderSidebarUpdate(currentState);
    renderModal(currentState);
    window.dispatchEvent(new CustomEvent('app-update-state-change', {
      detail: { ...currentState },
    }));

  }

  async function installAndRestart() {
    if (currentState.status !== 'downloaded' || installTriggered) return;
    installTriggered = true;
    render({
      status: 'installing',
      percent: 100,
      message: 'Se instaleaza actualizarea. Aplicatia va reporni automat...',
    });
    try {
      await updater.install();
    } catch (error) {
      installTriggered = false;
      render({
        status: 'error',
        message: error?.message || 'Instalarea actualizarii nu a putut fi pornita.',
      });
    }
  }

  function showModal() {
    if (!modal) return;
    window.BUSINESS_UI?.closeMenus?.();
    modal.hidden = false;
    void modal.offsetWidth;
    modal.classList.add('visible');
    renderModal(currentState);
  }

  function closeModal() {
    if (!modal || isBusy()) return;
    modal.classList.remove('visible');
    setTimeout(() => {
      modal.hidden = true;
    }, 220);
  }

  async function runAction(action) {
    if (!updater[action]) return currentState;
    try {
      const result = await updater[action]();
      render(result);
      return result;
    } catch (error) {
      const failedState = {
        status: 'error',
        message: error?.message || 'Actiunea de actualizare a esuat.',
      };
      render(failedState);
      return failedState;
    }
  }

  async function openModal({ check = false } = {}) {
    showModal();
    if (check || ['idle', 'current', 'error'].includes(currentState.status)) {
      await runAction('check');
    }
  }

  async function confirmUpdate() {
    if (currentState.status === 'available') {
      await runAction('download');
      return;
    }
    if (currentState.status === 'downloaded') {
      await installAndRestart();
      return;
    }
    await runAction('check');
  }

  checkBtn?.addEventListener('click', () => openModal({ check: true }));
  downloadBtn?.addEventListener('click', () => openModal());
  installBtn?.addEventListener('click', () => openModal());
  sidebarUpdateCard?.addEventListener('click', installAndRestart);
  modalConfirm?.addEventListener('click', confirmUpdate);
  modalCancel?.addEventListener('click', closeModal);
  modalClose?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  updater.onState(render);
  updater.onOpenDialog?.(() => openModal());
  updater.getState().then(render).catch(() => {});
  window.APP_UPDATER_UI = {
    open: () => openModal(),
    check: () => openModal({ check: true }),
    getState: () => ({ ...currentState }),
  };
})();
