// Partners administration: affiliate profiles and collaborators.
(function() {
  const tabsEl = document.getElementById('partners-tabs');
  const form = document.getElementById('partners-form');
  const idInput = document.getElementById('partner-id');
  const nameInput = document.getElementById('partner-name');
  const roleInput = document.getElementById('partner-role');
  const phoneInput = document.getElementById('partner-phone');
  const emailInput = document.getElementById('partner-email');
  const percentageField = document.getElementById('partner-percentage-field');
  const percentageInput = document.getElementById('partner-percentage');
  const percentageLabel = percentageField?.querySelector('label');
  const colorInput = document.getElementById('partner-color');
  const colorTextInput = document.getElementById('partner-color-text');
  const saveBtn = document.getElementById('partners-save-btn');
  const resetBtn = document.getElementById('partners-reset-btn');
  const refreshBtn = document.getElementById('partners-refresh-btn');
  const listEl = document.getElementById('partners-list');
  const summaryEl = document.getElementById('partners-summary');
  const formTitle = document.getElementById('partners-form-title');
  const formSubtitle = document.getElementById('partners-form-subtitle');
  const formIcon = document.getElementById('partners-form-icon');
  const listTitle = document.getElementById('partners-list-title');
  const listSubtitle = document.getElementById('partners-list-subtitle');

  let mode = 'profiles';
  let profiles = [];
  let collaborators = [];
  let loaded = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeColor(value, fallback) {
    const color = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
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

  function currentItems() {
    return mode === 'profiles' ? profiles : collaborators;
  }

  function toast(message, type = 'success') {
    window.BUSINESS_UI?.showToast?.(message, type);
  }

  function canManage() {
    return Boolean(window.AUTH?.canManagePartners?.());
  }

  function applyMode(nextMode) {
    mode = nextMode;
    tabsEl?.querySelectorAll('[data-partner-tab]').forEach(button => {
      button.classList.toggle('active', button.dataset.partnerTab === mode);
    });
    const profileMode = mode === 'profiles';
    percentageField.hidden = false;
    if (percentageLabel) {
      percentageLabel.textContent = profileMode ? 'Procent comision' : 'Procent implicit din NET';
    }
    percentageInput.placeholder = profileMode ? '10' : '50';
    formIcon.textContent = profileMode ? '%' : '';
    if (!profileMode) {
      formIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 7 9 12l5 5"/><path d="M20 7l-5 5 5 5"/><path d="M4 7l5 5-5 5"/></svg>';
    }
    formTitle.textContent = profileMode ? 'Profil afiliere' : 'Colaborator';
    formSubtitle.textContent = profileMode
      ? 'Comision calculat din venitul clientului'
      : 'Procent implicit din NET, modificabil separat pe fiecare client';
    listTitle.textContent = profileMode ? 'Profiluri create' : 'Colaboratori creati';
    listSubtitle.textContent = profileMode ? 'Aplicabile la client si statistici' : 'Disponibili in desfasurarea manoperei';
    resetForm();
    render();
  }

  function resetForm() {
    idInput.value = '';
    nameInput.value = '';
    roleInput.value = '';
    phoneInput.value = '';
    emailInput.value = '';
    percentageInput.value = '';
    const fallback = mode === 'profiles' ? '#FF6B00' : '#14B8A6';
    colorInput.value = fallback;
    colorTextInput.value = fallback;
    saveBtn.textContent = mode === 'profiles' ? 'Salveaza profil' : 'Salveaza colaborator';
  }

  function fillForm(item) {
    idInput.value = item.id || '';
    nameInput.value = item.name || '';
    roleInput.value = item.role || '';
    phoneInput.value = item.phone || '';
    emailInput.value = item.email || '';
    percentageInput.value = item.percentage ?? '';
    const color = normalizeColor(item.color, mode === 'profiles' ? '#FF6B00' : '#14B8A6');
    colorInput.value = color;
    colorTextInput.value = color;
    saveBtn.textContent = mode === 'profiles' ? 'Actualizeaza profil' : 'Actualizeaza colaborator';
    nameInput.focus();
  }

  function renderSummary() {
    const items = [...currentItems()].sort((a, b) => compareAlphabetically(a.name, b.name));
    if (!items.length) {
      summaryEl.innerHTML = '<span>Nicio inregistrare</span>';
      return;
    }
    if (mode === 'profiles') {
      const avg = items.reduce((sum, item) => sum + Number(item.percentage || 0), 0) / items.length;
      summaryEl.innerHTML = `<span><strong>${items.length}</strong> profiluri</span><span><strong>${avg.toFixed(1)}%</strong> medie comision</span>`;
    } else {
      const percentItems = items.filter(item => Number(item.percentage || 0) > 0);
      summaryEl.innerHTML = `<span><strong>${items.length}</strong> colaboratori</span><span><strong>${percentItems.length}</strong> cu procent NET</span>`;
    }
  }

  function render() {
    renderSummary();
    const items = [...currentItems()].sort((a, b) => compareAlphabetically(a.name, b.name));
    if (!canManage()) {
      listEl.innerHTML = '<div class="partners-empty">Ai nevoie de cont admin sau manager pentru administrarea partenerilor.</div>';
      return;
    }
    if (!items.length) {
      listEl.innerHTML = `<div class="partners-empty">Nu exista ${mode === 'profiles' ? 'profiluri de afiliere' : 'colaboratori'}.</div>`;
      return;
    }
    listEl.innerHTML = items.map(item => {
      const color = normalizeColor(item.color, mode === 'profiles' ? '#FF6B00' : '#14B8A6');
      const percentage = Number(item.percentage || 0);
      return `
        <article class="partner-row" data-id="${escapeHtml(item.id)}">
          <div class="partner-color" style="background:${escapeHtml(color)}"></div>
          <div class="partner-main">
            <strong>${escapeHtml(item.name || 'Fara nume')}</strong>
            <span>${escapeHtml(item.role || (mode === 'profiles' ? 'Afiliat' : 'Colaborator'))}</span>
            ${item.phone || item.email ? `<div class="partner-contact">
              ${item.phone ? `<span>${escapeHtml(item.phone)}</span>` : ''}
              ${item.email ? `<span>${escapeHtml(item.email)}</span>` : ''}
            </div>` : ''}
            <div class="partner-added-at">
              <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M12 14v3l2 1"/></svg>
              <span>Adaugat: ${escapeHtml(formatAddedAt(item.created_at))}</span>
            </div>
          </div>
          <div class="partner-meta">
            <span>${percentage > 0 ? `${percentage.toFixed(2)}% NET` : (mode === 'profiles' ? '0.00%' : 'Suma fixa')}</span>
          </div>
          <div class="partner-actions">
            <button type="button" class="btn-ghost" data-action="edit">Editeaza</button>
            <button type="button" class="btn-ghost danger" data-action="delete">Sterge</button>
          </div>
        </article>
      `;
    }).join('');
  }

  async function load() {
    if (!canManage()) {
      render();
      return;
    }
    listEl.innerHTML = '<div class="loading">Se incarca...</div>';
    try {
      const [profileRows, collaboratorRows] = await Promise.all([
        window.API.getProfiles(),
        window.API.getCollaborators(),
      ]);
      profiles = Array.isArray(profileRows) ? profileRows : [];
      collaborators = Array.isArray(collaboratorRows) ? collaboratorRows : [];
      loaded = true;
      render();
    } catch (error) {
      listEl.innerHTML = `<div class="error-box">${escapeHtml(error.message || 'Nu pot incarca partenerii.')}</div>`;
    }
  }

  async function save(event) {
    event.preventDefault();
    if (!canManage()) return;
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      toast('Completeaza numele.', 'error');
      return;
    }
    const payload = {
      name,
      role: roleInput.value.trim() || (mode === 'profiles' ? 'Afiliat' : 'Colaborator'),
      phone: phoneInput.value.trim() || null,
      email: emailInput.value.trim() || null,
      percentage: Math.max(0, Math.min(100, Number(percentageInput.value || 0))),
      color: normalizeColor(colorTextInput.value || colorInput.value, mode === 'profiles' ? '#FF6B00' : '#14B8A6'),
    };
    saveBtn.disabled = true;
    try {
      const id = idInput.value;
      const authToken = window.AUTH?.getToken?.() || '';
      const saved = mode === 'profiles'
        ? (id ? await window.API.updateProfile(authToken, id, payload) : await window.API.createProfile(authToken, payload))
        : (id ? await window.API.updateCollaborator(authToken, id, payload) : await window.API.createCollaborator(authToken, payload));
      const items = currentItems();
      const index = items.findIndex(item => item.id === saved.id);
      if (index >= 0) items[index] = saved;
      else items.push(saved);
      resetForm();
      render();
      toast(mode === 'profiles' ? 'Profilul a fost salvat.' : 'Colaboratorul a fost salvat.');
      window.dispatchEvent(new CustomEvent('partners-change'));
    } catch (error) {
      toast(error.message || 'Nu s-a putut salva.', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function remove(id) {
    const item = currentItems().find(row => row.id === id);
    if (!item) return;
    if (!confirm(`Stergi "${item.name}"?`)) return;
    try {
      const authToken = window.AUTH?.getToken?.() || '';
      if (mode === 'profiles') await window.API.deleteProfile(authToken, id);
      else await window.API.deleteCollaborator(authToken, id);
      if (mode === 'profiles') profiles = profiles.filter(row => row.id !== id);
      else collaborators = collaborators.filter(row => row.id !== id);
      if (idInput.value === id) resetForm();
      render();
      toast('Inregistrarea a fost stearsa.');
      window.dispatchEvent(new CustomEvent('partners-change'));
    } catch (error) {
      toast(error.message || 'Nu se poate sterge. Verifica daca este folosit deja la clienti.', 'error');
    }
  }

  tabsEl?.addEventListener('click', event => {
    const button = event.target.closest('[data-partner-tab]');
    if (button) applyMode(button.dataset.partnerTab);
  });
  form?.addEventListener('submit', save);
  resetBtn?.addEventListener('click', resetForm);
  refreshBtn?.addEventListener('click', load);
  colorInput?.addEventListener('input', () => {
    colorTextInput.value = colorInput.value.toUpperCase();
  });
  colorTextInput?.addEventListener('input', () => {
    const color = normalizeColor(colorTextInput.value, '');
    if (color) colorInput.value = color;
  });
  listEl?.addEventListener('click', event => {
    const row = event.target.closest('.partner-row');
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!row || !action) return;
    const id = row.dataset.id;
    if (action === 'edit') fillForm(currentItems().find(item => item.id === id) || {});
    if (action === 'delete') remove(id);
  });

  window.addEventListener('tab-change', ({ detail }) => {
    if (detail === 'partners' && !loaded) load();
  });
  window.addEventListener('auth-change', () => {
    if (document.getElementById('tab-partners')?.classList.contains('active')) load();
  });
})();
