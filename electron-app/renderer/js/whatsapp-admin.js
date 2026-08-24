(function() {
  let users = [];
  let messages = [];
  let selectedUser = null;
  let platformFilter = 'all';
  let userQuery = '';
  let messageQuery = '';
  let requestVersion = 0;
  let loaded = false;
  let loadedUserId = null;

  const usersList = document.getElementById('whatsapp-admin-users-list');
  const usersCount = document.getElementById('whatsapp-admin-users-count');
  const usersSubtitle = document.getElementById('whatsapp-admin-users-subtitle');
  const userSearch = document.getElementById('whatsapp-admin-user-search');
  const userSearchClear = document.getElementById('whatsapp-admin-user-search-clear');
  const platformFilterEl = document.getElementById('whatsapp-admin-platform-filter');
  const empty = document.getElementById('whatsapp-admin-empty');
  const content = document.getElementById('whatsapp-admin-content');
  const avatar = document.getElementById('whatsapp-admin-avatar');
  const userName = document.getElementById('whatsapp-admin-user-name');
  const userMeta = document.getElementById('whatsapp-admin-user-meta');
  const total = document.getElementById('whatsapp-admin-total');
  const messagesList = document.getElementById('whatsapp-admin-messages-list');
  const messageSearch = document.getElementById('whatsapp-admin-message-search');
  const form = document.getElementById('whatsapp-admin-form');
  const idInput = document.getElementById('whatsapp-admin-message-id');
  const titleInput = document.getElementById('whatsapp-admin-message-title');
  const bodyInput = document.getElementById('whatsapp-admin-message-body');
  const messageCount = document.getElementById('whatsapp-admin-message-count');
  const editorTitle = document.getElementById('whatsapp-admin-editor-title');
  const editorSubtitle = document.getElementById('whatsapp-admin-editor-subtitle');
  const editorState = document.getElementById('whatsapp-admin-editor-state');
  const saveLabel = document.getElementById('whatsapp-admin-save-label');
  const newMessageBtn = document.getElementById('whatsapp-admin-new-message');
  const resetBtn = document.getElementById('whatsapp-admin-reset');
  const refreshBtn = document.getElementById('whatsapp-admin-refresh');

  const token = () => window.AUTH?.getToken() || '';
  const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const initials = (value) => String(value || 'U').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  const normalize = (value) => String(value || '').toLocaleLowerCase('ro-RO');
  const platformLabel = (value) => ({ desktop: 'Desktop', mobile: 'Mobile', both: 'Desktop + Mobil' })[value] || 'Mobile';

  function filteredUsers() {
    return users.filter((user) => {
      const platformMatches = platformFilter === 'all'
        || user.platform_access === platformFilter
        || user.platform_access === 'both';
      const queryMatches = !userQuery || normalize(`${user.display_name} ${user.username} ${user.role}`).includes(userQuery);
      return platformMatches && queryMatches;
    });
  }

  function filteredMessages() {
    return messages.filter((message) => !messageQuery || normalize(`${message.title} ${message.body}`).includes(messageQuery));
  }

  function updateMessageCount() {
    if (messageCount) messageCount.textContent = `${bodyInput.value.length} caractere`;
  }

  function resetForm(focus = false) {
    idInput.value = '';
    titleInput.value = '';
    bodyInput.value = '';
    editorTitle.textContent = 'Mesaj nou';
    editorSubtitle.textContent = 'Va fi salvat doar pentru utilizatorul selectat.';
    editorState.textContent = 'Nou';
    editorState.classList.remove('editing');
    saveLabel.textContent = 'Salveaza mesaj';
    updateMessageCount();
    if (focus) titleInput.focus();
  }

  function editMessage(message) {
    idInput.value = message.id;
    titleInput.value = message.title;
    bodyInput.value = message.body;
    editorTitle.textContent = 'Editeaza mesaj';
    editorSubtitle.textContent = 'Modificarile vor fi vizibile imediat pe contul selectat.';
    editorState.textContent = 'Editare';
    editorState.classList.add('editing');
    saveLabel.textContent = 'Actualizeaza mesaj';
    updateMessageCount();
    titleInput.focus();
  }

  function renderUsers() {
    const visibleUsers = filteredUsers();
    usersCount.textContent = String(visibleUsers.length);
    usersSubtitle.textContent = visibleUsers.length === users.length
      ? `${users.length} conturi disponibile`
      : `${visibleUsers.length} din ${users.length} conturi`;
    userSearchClear.classList.toggle('visible', Boolean(userQuery));
    usersList.innerHTML = visibleUsers.length ? visibleUsers.map((user) => `
      <button type="button" class="whatsapp-admin-user ${selectedUser?.id === user.id ? 'active' : ''}" data-id="${escapeHtml(user.id)}">
        <span class="whatsapp-admin-user-avatar ${escapeHtml(user.platform_access)}">${escapeHtml(initials(user.display_name || user.username))}</span>
        <span class="whatsapp-admin-user-main">
          <strong>${escapeHtml(user.display_name || user.username)}</strong>
          <small>@${escapeHtml(user.username)}</small>
        </span>
        <span class="whatsapp-admin-user-platform ${escapeHtml(user.platform_access)}">${escapeHtml(platformLabel(user.platform_access))}</span>
      </button>
    `).join('') : '<div class="whatsapp-admin-no-results">Niciun utilizator nu corespunde filtrului.</div>';
  }

  function renderMessages() {
    const visibleMessages = filteredMessages();
    total.textContent = String(messages.length);
    messagesList.innerHTML = visibleMessages.length ? visibleMessages.map((message) => `
      <article class="whatsapp-admin-message" data-id="${escapeHtml(message.id)}">
        <div class="whatsapp-admin-message-icon">
          <svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.6 9.6 0 0 1-4-.9L3 21l1.8-4.5A8.5 8.5 0 1 1 21 11.5Z"/></svg>
        </div>
        <div class="whatsapp-admin-message-main">
          <strong>${escapeHtml(message.title)}</strong>
          <span>${escapeHtml(message.body)}</span>
        </div>
        <div class="whatsapp-admin-message-actions">
          <button type="button" class="whatsapp-admin-icon-btn whatsapp-admin-edit" data-id="${escapeHtml(message.id)}" title="Editeaza mesajul">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
          </button>
          <button type="button" class="whatsapp-admin-icon-btn danger whatsapp-admin-delete" data-id="${escapeHtml(message.id)}" title="Sterge mesajul">
            <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>
          </button>
        </div>
      </article>
    `).join('') : `<div class="whatsapp-admin-no-messages">${messages.length ? 'Niciun mesaj nu corespunde cautarii.' : 'Acest utilizator nu are mesaje predefinite.'}</div>`;
  }

  async function selectUser(userId) {
    const currentRequest = ++requestVersion;
    selectedUser = users.find((user) => user.id === userId) || null;
    renderUsers();
    resetForm();
    if (!selectedUser) {
      empty.style.display = 'flex';
      content.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    content.style.display = 'block';
    avatar.textContent = initials(selectedUser.display_name || selectedUser.username);
    userName.textContent = selectedUser.display_name || selectedUser.username;
    userMeta.textContent = `@${selectedUser.username} · ${selectedUser.role} · ${platformLabel(selectedUser.platform_access)}`;
    messagesList.innerHTML = '<div class="whatsapp-admin-loading"><span></span><span>Se incarca mesajele...</span></div>';
    try {
      const nextMessages = await window.API.getWhatsAppPredefinedMessages(token(), selectedUser.id);
      if (currentRequest !== requestVersion) return;
      messages = nextMessages;
      renderMessages();
    } catch (error) {
      if (currentRequest !== requestVersion) return;
      messagesList.innerHTML = `<div class="whatsapp-admin-no-messages">${escapeHtml(error.message || 'Mesajele nu au putut fi incarcate.')}</div>`;
    }
  }

  async function loadUsers() {
    if (!window.AUTH?.isAdmin()) return;
    usersList.innerHTML = '<div class="whatsapp-admin-loading"><span></span><span>Se incarca utilizatorii...</span></div>';
    refreshBtn.classList.add('loading');
    refreshBtn.disabled = true;
    try {
      users = await window.API.getUsers(token());
      loaded = true;
      loadedUserId = window.AUTH?.getUser?.()?.id || null;
      users.sort((a, b) => (a.username === 'admin' ? -1 : b.username === 'admin' ? 1 : (a.display_name || a.username).localeCompare(b.display_name || b.username)));
      renderUsers();
      const nextUserId = selectedUser?.id || filteredUsers()[0]?.id;
      if (nextUserId) await selectUser(nextUserId);
    } finally {
      refreshBtn.classList.remove('loading');
      refreshBtn.disabled = false;
    }
  }

  usersList?.addEventListener('click', (event) => {
    const row = event.target.closest('.whatsapp-admin-user');
    if (row) selectUser(row.dataset.id);
  });

  messagesList?.addEventListener('click', async (event) => {
    const edit = event.target.closest('.whatsapp-admin-edit');
    const remove = event.target.closest('.whatsapp-admin-delete');
    const row = event.target.closest('.whatsapp-admin-message');
    if (edit || (row && !remove)) {
      const id = edit?.dataset.id || row?.dataset.id;
      const message = messages.find((item) => item.id === id);
      if (message) editMessage(message);
    }
    if (remove && selectedUser && confirm('Stergi mesajul acestui utilizator?')) {
      await window.API.deleteWhatsAppPredefinedMessage(token(), remove.dataset.id, selectedUser.id);
      await selectUser(selectedUser.id);
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedUser) return;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      if (idInput.value) await window.API.updateWhatsAppPredefinedMessage(token(), idInput.value, titleInput.value.trim(), bodyInput.value.trim(), selectedUser.id);
      else await window.API.createWhatsAppPredefinedMessage(token(), titleInput.value.trim(), bodyInput.value.trim(), selectedUser.id);
      await selectUser(selectedUser.id);
    } finally {
      submit.disabled = false;
    }
  });

  userSearch?.addEventListener('input', () => {
    userQuery = normalize(userSearch.value.trim());
    renderUsers();
  });
  userSearchClear?.addEventListener('click', () => {
    userSearch.value = '';
    userQuery = '';
    renderUsers();
    userSearch.focus();
  });
  platformFilterEl?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-platform]');
    if (!button) return;
    platformFilter = button.dataset.platform;
    platformFilterEl.querySelectorAll('[data-platform]').forEach((item) => item.classList.toggle('active', item === button));
    renderUsers();
  });
  messageSearch?.addEventListener('input', () => {
    messageQuery = normalize(messageSearch.value.trim());
    renderMessages();
  });
  bodyInput?.addEventListener('input', updateMessageCount);
  newMessageBtn?.addEventListener('click', () => resetForm(true));
  resetBtn?.addEventListener('click', () => resetForm());
  refreshBtn?.addEventListener('click', loadUsers);
  window.addEventListener('tab-change', ({ detail }) => {
    if (detail === 'whatsapp-admin' && !loaded) loadUsers();
  });
  window.addEventListener('auth-change', () => {
    const currentUserId = window.AUTH?.getUser?.()?.id || null;
    if (currentUserId === loadedUserId) return;
    loaded = false;
    loadedUserId = currentUserId;
    selectedUser = null;
    users = [];
    messages = [];
  });
  updateMessageCount();
})();
