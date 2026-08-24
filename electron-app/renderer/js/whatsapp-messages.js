(function() {
  let messages = [];
  const form = document.getElementById('whatsapp-message-form');
  const idInput = document.getElementById('whatsapp-message-id');
  const titleInput = document.getElementById('whatsapp-message-title');
  const bodyInput = document.getElementById('whatsapp-message-body');
  const countEl = document.getElementById('whatsapp-message-count');
  const resetBtn = document.getElementById('whatsapp-message-reset');
  const list = document.getElementById('whatsapp-messages-list');

  const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const token = () => window.AUTH?.getToken() || '';

  function updateCount() {
    if (countEl) countEl.textContent = `${bodyInput.value.length} caractere`;
  }

  function reset() {
    idInput.value = '';
    titleInput.value = '';
    bodyInput.value = '';
    updateCount();
  }

  function render() {
    list.innerHTML = messages.length ? messages.map((message) => `
      <div class="whatsapp-message-row">
        <div class="whatsapp-message-main"><strong>${escapeHtml(message.title)}</strong><span>${escapeHtml(message.body)}</span></div>
        <button class="btn-ghost btn-sm whatsapp-message-edit" data-id="${escapeHtml(message.id)}">Editeaza</button>
        <button class="btn-ghost btn-sm whatsapp-message-delete" data-id="${escapeHtml(message.id)}">Sterge</button>
      </div>
    `).join('') : '<div class="loading">Nu exista mesaje predefinite.</div>';
    window.refreshSettingsPanelHeights?.();
  }

  async function load() {
    if (!token()) return;
    try {
      messages = await window.API.getWhatsAppPredefinedMessages(token());
      render();
      window.WHATSAPP_PREDEFINED_MESSAGES = messages;
    } catch (e) {
      list.innerHTML = `<div class="loading">${escapeHtml(e.message)}</div>`;
    }
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (idInput.value) await window.API.updateWhatsAppPredefinedMessage(token(), idInput.value, titleInput.value.trim(), bodyInput.value.trim());
    else await window.API.createWhatsAppPredefinedMessage(token(), titleInput.value.trim(), bodyInput.value.trim());
    reset();
    await load();
  });
  resetBtn?.addEventListener('click', reset);
  list?.addEventListener('click', async (event) => {
    const edit = event.target.closest('.whatsapp-message-edit');
    const remove = event.target.closest('.whatsapp-message-delete');
    if (edit) {
      const message = messages.find((item) => item.id === edit.dataset.id);
      if (!message) return;
      idInput.value = message.id;
      titleInput.value = message.title;
      bodyInput.value = message.body;
      updateCount();
    }
    if (remove && confirm('Stergi acest mesaj predefinit?')) {
      await window.API.deleteWhatsAppPredefinedMessage(token(), remove.dataset.id);
      await load();
    }
  });
  window.addEventListener('tab-change', ({ detail }) => { if (detail === 'settings') load(); });
  window.addEventListener('auth-change', load);
  bodyInput?.addEventListener('input', updateCount);
  updateCount();
  window.loadWhatsAppPredefinedMessages = load;
})();
