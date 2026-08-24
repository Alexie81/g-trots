// Support chat tab
(function() {
  let contacts = [];
  let messages = [];
  let selectedContactId = '';
  let pollTimer = null;
  let pollInFlight = false;
  let lastUnreadCount = 0;
  let latestMessageId = null;
  let notifiedMessageIds = new Set();

  const layout = document.getElementById('chat-layout');
  const contactsEl = document.getElementById('chat-contacts');
  const messagesEl = document.getElementById('chat-messages');
  const composeForm = document.getElementById('chat-compose');
  const messageInput = document.getElementById('chat-message-input');
  const refreshBtn = document.getElementById('chat-refresh-btn');
  const navBadge = document.getElementById('chat-nav-badge');
  const titleEl = document.getElementById('chat-title');
  const subtitleEl = document.getElementById('chat-subtitle');
  const acceptBtn = document.getElementById('chat-accept-btn');
  const leaveBtn = document.getElementById('chat-leave-btn');
  const deleteBtn = document.getElementById('chat-delete-btn');
  const closeBtn = document.getElementById('chat-close-btn');
  const sendBtn = composeForm?.querySelector('button[type="submit"]');

  function getToken() {
    return window.AUTH?.getToken() || '';
  }

  function isAgent() {
    return Boolean(window.AUTH?.canUseSupportChat?.());
  }

  function canUseChat() {
    return Boolean(window.AUTH?.isLoggedIn?.() && getToken());
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function initials(name) {
    return String(name || 'U')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'U';
  }

  function fmtTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  }

  function updateBadge(count) {
    if (!navBadge) return;
    const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : lastUnreadCount;
    lastUnreadCount = normalizedCount;
    if (normalizedCount > 0) {
      navBadge.textContent = normalizedCount > 9 ? '9+' : String(normalizedCount);
      navBadge.style.display = 'inline-flex';
    } else {
      navBadge.style.display = 'none';
    }
    window.dispatchEvent(new CustomEvent('chat-unread-change', {
      detail: { count: normalizedCount },
    }));
  }

  function setComposerEnabled(enabled) {
    if (messageInput) messageInput.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
  }

  function selectedContact() {
    return contacts.find((contact) => contact.id === selectedContactId) || null;
  }

  function isAccepted(contact) {
    return Boolean(contact?.assigned_agent_id);
  }

  function canReply(contact) {
    return Boolean(contact?.can_reply);
  }

  function hasLeft(contact) {
    return contact?.status === 'left';
  }

  function wasClosedByAgent(contact) {
    return contact?.status === 'closed';
  }

  function isInactive(contact) {
    return hasLeft(contact) || wasClosedByAgent(contact);
  }

  function canLeaveUserConversation(contact) {
    return Boolean(
      contact &&
      !isInactive(contact) &&
      messages.some((message) => message.sender_role === 'admin')
    );
  }

  function agentLabel(contact) {
    if (hasLeft(contact)) return 'Conversatie parasita';
    if (wasClosedByAgent(contact)) return 'Inchisa de Agent Support';
    if (!contact?.assigned_agent_id) return 'Neacceptat';
    return contact.assigned_agent_name
      ? `Preluat de ${contact.assigned_agent_name}`
      : 'Preluat de agent support';
  }

  function renderContacts() {
    if (!canUseChat()) {
      contactsEl.innerHTML = '<div class="loading">Autentificare necesara.</div>';
      return;
    }
    layout?.classList.toggle('user-mode', !isAgent());
    if (!isAgent()) {
      contactsEl.innerHTML = '';
      return;
    }
    if (!contacts.length) {
      contactsEl.innerHTML = '<div class="loading">Nu exista utilizatori disponibili.</div>';
      return;
    }

    contactsEl.innerHTML = contacts.map((contact) => {
      const latest = contact.latest_message ? escapeHtml(contact.latest_message.body) : 'Fara mesaje';
      const unread = Number(contact.unread_count || 0);
      const active = contact.id === selectedContactId ? 'active' : '';
      const assignedClass = isInactive(contact) ? 'left' : contact.assigned_agent_id ? 'assigned' : 'open';
      return `
        <button class="chat-contact-row ${active}" data-id="${escapeHtml(contact.id)}">
          <div class="chat-contact-avatar">${escapeHtml(initials(contact.name))}</div>
          <div class="chat-contact-main">
            <div class="chat-contact-name">
              ${escapeHtml(contact.name)}
              <span class="chat-agent-tag ${assignedClass}">${escapeHtml(agentLabel(contact))}</span>
            </div>
            <div class="chat-contact-last">${latest}</div>
          </div>
          ${unread > 0 ? `<div class="chat-contact-unread">${unread > 9 ? '9+' : unread}</div>` : ''}
        </button>
      `;
    }).join('');
  }

  function renderHeader() {
    const contact = selectedContact();
    if (!isAgent()) {
      titleEl.textContent = contact?.assigned_agent_name
        ? `${contact.assigned_agent_name} - Support`
        : 'Support G-Trots';
      subtitleEl.textContent = 'Trimite un mesaj echipei de support.';
      if (acceptBtn) acceptBtn.style.display = 'none';
      if (leaveBtn) leaveBtn.style.display = canLeaveUserConversation(contact) ? 'inline-flex' : 'none';
      if (deleteBtn) deleteBtn.style.display = 'none';
      if (closeBtn) closeBtn.style.display = 'none';
      composeForm.style.display = 'flex';
      setComposerEnabled(true);
      return;
    }
    if (leaveBtn) leaveBtn.style.display = 'none';
    if (!contact) {
      titleEl.textContent = 'Selecteaza un user';
      subtitleEl.textContent = 'Conversatiile utilizatorilor fara acces Agent Support.';
      if (acceptBtn) acceptBtn.style.display = 'none';
      if (deleteBtn) deleteBtn.style.display = 'none';
      if (closeBtn) closeBtn.style.display = 'none';
      composeForm.style.display = 'flex';
      setComposerEnabled(false);
      return;
    }
    titleEl.textContent = contact.name;
    subtitleEl.textContent = hasLeft(contact)
      ? 'Utilizatorul a parasit conversatia. Raspunsurile sunt blocate.'
      : wasClosedByAgent(contact)
      ? 'Conversatie inchisa de Agent Support. Raspunsurile sunt blocate.'
      : contact.username
      ? `@${contact.username} - ${agentLabel(contact)}`
      : agentLabel(contact);
    if (acceptBtn) {
      acceptBtn.style.display = isInactive(contact) || isAccepted(contact) || canReply(contact) ? 'none' : 'inline-flex';
      acceptBtn.disabled = false;
    }
    if (deleteBtn) deleteBtn.style.display = isInactive(contact) ? 'inline-flex' : 'none';
    if (closeBtn) closeBtn.style.display = !isInactive(contact) && canReply(contact) ? 'inline-flex' : 'none';
    composeForm.style.display = isInactive(contact) ? 'none' : 'flex';
    setComposerEnabled(!isInactive(contact) && canReply(contact));
  }

  function renderMessages() {
    renderHeader();
    if (!canUseChat()) {
      messagesEl.innerHTML = '<div class="chat-empty">Autentificare necesara.</div>';
      return;
    }
    if (!selectedContactId) {
      messagesEl.innerHTML = '<div class="chat-empty">Alege un user din lista.</div>';
      return;
    }
    const contact = selectedContact();
    const leftBanner = isAgent() && isInactive(contact)
      ? `<div class="chat-left-banner">
           <svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg>
           <div><strong>${hasLeft(contact) ? 'Utilizatorul a parasit conversatia' : 'Conversatie inchisa de Agent Support'}</strong><span>Nu mai poti trimite mesaje. Conversatia poate fi doar stearsa definitiv.</span></div>
         </div>`
      : '';
    if (!messages.length) {
      messagesEl.innerHTML = leftBanner || (!isAgent() || canReply(contact)
        ? '<div class="chat-empty">Niciun mesaj inca.</div>'
        : '<div class="chat-empty">Accepta chatul ca sa poti raspunde acestui user.</div>');
      return;
    }

    messagesEl.innerHTML = leftBanner + messages.map((message) => {
      const mine = isAgent() ? message.sender_role === 'admin' : message.sender_role === 'mobile';
      const roleClass = mine ? 'admin' : 'mobile';
      return `
        <div class="chat-message-row ${roleClass}">
          <div class="chat-bubble">
            <div class="chat-bubble-text">${escapeHtml(message.body)}</div>
            <div class="chat-bubble-time">${fmtTime(message.created_at)}</div>
          </div>
        </div>
      `;
    }).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadContacts() {
    if (!canUseChat()) return;
    contacts = isAgent()
      ? await window.API.getAdminChatContacts(getToken())
      : await window.API.getUserChatContacts(getToken());
    if (!contacts.find((contact) => contact.id === selectedContactId)) {
      selectedContactId = contacts[0]?.id || '';
    }
    renderContacts();
    renderHeader();
  }

  async function loadMessages(markRead = true) {
    if (!canUseChat() || !selectedContactId) {
      messages = [];
      renderMessages();
      return;
    }

    const response = isAgent()
      ? await window.API.getAdminChatMessages(getToken(), selectedContactId)
      : await window.API.getUserChatMessages(getToken());
    messages = response.messages || [];
    renderMessages();
    const latest = messages[messages.length - 1];
    if (latest) latestMessageId = latest.id;
    if (markRead) {
      if (isAgent()) await window.API.markAdminChatRead(getToken(), selectedContactId);
      else await window.API.markUserChatRead(getToken());
      contacts = contacts.map((contact) =>
        contact.id === selectedContactId ? { ...contact, unread_count: 0 } : contact
      );
      renderContacts();
      updateBadge(contacts.reduce((sum, contact) => sum + Number(contact.unread_count || 0), 0));
    }
  }

  async function refreshChat(markRead = true) {
    if (!canUseChat()) return;
    await loadContacts();
    await loadMessages(markRead);
  }

  function confirmChatAction(title, message, confirmLabel) {
    return new Promise((resolve) => {
      document.getElementById('chat-action-confirm')?.remove();
      const overlay = document.createElement('div');
      overlay.className = 'history-delete-confirm-overlay';
      overlay.id = 'chat-action-confirm';
      overlay.innerHTML = `
        <div class="history-delete-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="chat-action-confirm-title">
          <span class="history-delete-confirm-icon">
            <svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 4.4 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0Z"/></svg>
          </span>
          <div class="history-delete-confirm-copy">
            <span>Confirmare</span>
            <h2 id="chat-action-confirm-title">${escapeHtml(title)}</h2>
            <p>${escapeHtml(message)}</p>
          </div>
          <div class="history-delete-confirm-actions">
            <button type="button" class="history-delete-confirm-cancel">Renunta</button>
            <button type="button" class="history-delete-confirm-submit">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = (result) => {
        overlay.remove();
        resolve(result);
      };
      overlay.querySelector('.history-delete-confirm-cancel')?.addEventListener('click', () => close(false));
      overlay.querySelector('.history-delete-confirm-submit')?.addEventListener('click', () => close(true));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close(false);
      });
      overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close(false);
      });
      overlay.querySelector('.history-delete-confirm-cancel')?.focus();
    });
  }

  function notifyNewMessage(message) {
    const expectedRole = isAgent() ? 'mobile' : 'admin';
    if (!message || message.sender_role !== expectedRole) return;
    const body = message.body || '';
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(isAgent() ? 'Cerere noua Support Chat' : 'Mesaj nou de la Support', { body });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            new Notification(isAgent() ? 'Cerere noua Support Chat' : 'Mesaj nou de la Support', { body });
          }
        });
      }
    }
  }

  async function pollUnread(notify) {
    if (!canUseChat() || pollInFlight || document.hidden) return;
    pollInFlight = true;
    try {
      const data = isAgent()
        ? await window.API.getAdminChatUnread(getToken())
        : await window.API.getUserChatUnread(getToken());
      const unreadCount = Number(data?.unread_count);
      if (Number.isFinite(unreadCount)) updateBadge(unreadCount);
      const latest = data.latest_message;
      const latestId = latest?.id || null;
      const isNew = latest && latest.id !== latestMessageId;
      if (!notify && latestId) {
        notifiedMessageIds.add(latestId);
      }
      if (
        notify &&
        isNew &&
        latestId &&
        !notifiedMessageIds.has(latestId) &&
        latest.sender_role === (isAgent() ? 'mobile' : 'admin') &&
        Number(data.unread_count || 0) > 0
      ) {
        notifyNewMessage(latest);
        notifiedMessageIds.add(latestId);
        if (notifiedMessageIds.size > 100) {
          notifiedMessageIds = new Set(Array.from(notifiedMessageIds).slice(-50));
        }
      }
      if (latest) latestMessageId = latest.id;

      const activeTab = document.getElementById('tab-chat')?.classList.contains('active');
      if (activeTab) {
        await refreshChat(true);
      }
    } catch {
      // Keep the last valid unread count on temporary API/network errors.
    } finally {
      pollInFlight = false;
    }
  }

  function startPolling() {
    stopPolling();
    pollUnread(false);
    pollTimer = setInterval(() => pollUnread(true), 12000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function resetChat() {
    contacts = [];
    messages = [];
    selectedContactId = '';
    latestMessageId = null;
    notifiedMessageIds = new Set();
    lastUnreadCount = 0;
    pollInFlight = false;
    updateBadge(0);
    renderContacts();
    renderMessages();
  }

  contactsEl.addEventListener('click', async (event) => {
    const row = event.target.closest('.chat-contact-row');
    if (!row || !row.dataset.id) return;
    selectedContactId = row.dataset.id;
    renderContacts();
    await loadMessages(true);
  });

  refreshBtn.addEventListener('click', () => refreshChat(true));

  acceptBtn?.addEventListener('click', async () => {
    if (!selectedContactId || !canUseChat() || !isAgent()) return;
    acceptBtn.disabled = true;
    try {
      await window.API.acceptAdminChat(getToken(), selectedContactId);
      await refreshChat(true);
    } catch (e) {
      alert(e.message || 'Nu am putut accepta chatul.');
      acceptBtn.disabled = false;
    }
  });

  leaveBtn?.addEventListener('click', async () => {
    if (!canUseChat() || isAgent() || !canLeaveUserConversation(selectedContact())) return;
    const confirmed = await confirmChatAction(
      'Parasesti conversatia?',
      'Conversatia curenta va fi inchisa. Vei reveni la un chat nou, fara Agent Support atribuit.',
      'Paraseste'
    );
    if (!confirmed) return;
    leaveBtn.disabled = true;
    try {
      await window.API.leaveUserChat(getToken());
      messages = [];
      contacts = [];
      selectedContactId = '';
      updateBadge(0);
      await refreshChat(true);
    } catch (e) {
      alert(e.message || 'Conversatia nu a putut fi parasita.');
    } finally {
      leaveBtn.disabled = false;
    }
  });

  deleteBtn?.addEventListener('click', async () => {
    const contact = selectedContact();
    if (!canUseChat() || !isAgent() || !contact || !isInactive(contact)) return;
    const confirmed = await confirmChatAction(
      'Stergi conversatia?',
      'Mesajele si toate datele acestei conversatii vor fi sterse definitiv din baza de date.',
      'Sterge'
    );
    if (!confirmed) return;
    deleteBtn.disabled = true;
    try {
      await window.API.deleteAdminChatConversation(getToken(), selectedContactId);
      selectedContactId = '';
      messages = [];
      await refreshChat(true);
    } catch (e) {
      alert(e.message || 'Conversatia nu a putut fi stearsa.');
    } finally {
      deleteBtn.disabled = false;
    }
  });

  closeBtn?.addEventListener('click', async () => {
    const contact = selectedContact();
    if (!canUseChat() || !isAgent() || !contact || isInactive(contact) || !canReply(contact)) return;
    const confirmed = await confirmChatAction(
      'Inchizi conversatia?',
      'Utilizatorul va primi un chat nou, curat si fara Agent Support atribuit.',
      'Inchide'
    );
    if (!confirmed) return;
    closeBtn.disabled = true;
    try {
      await window.API.closeAdminChatConversation(getToken(), selectedContactId);
      messageInput.value = '';
      await refreshChat(true);
    } catch (e) {
      alert(e.message || 'Conversatia nu a putut fi inchisa.');
    } finally {
      closeBtn.disabled = false;
    }
  });

  composeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !selectedContactId || !canUseChat()) return;
    messageInput.value = '';
    setComposerEnabled(false);
    try {
      if (isAgent()) await window.API.sendAdminChatMessage(getToken(), selectedContactId, text);
      else await window.API.sendUserChatMessage(getToken(), text);
      await refreshChat(true);
    } finally {
      setComposerEnabled(!isAgent() || canReply(selectedContact()));
    }
  });

  window.addEventListener('tab-change', ({ detail }) => {
    if (detail === 'chat' && canUseChat()) {
      refreshChat(true);
    }
  });

  window.addEventListener('auth-change', () => {
    if (canUseChat()) {
      if (layout) layout.style.display = 'flex';
      refreshChat(false).catch(resetChat);
      startPolling();
    } else {
      stopPolling();
      if (layout) layout.style.display = 'flex';
      resetChat();
    }
  });

  window.addEventListener('users-change', () => {
    if (canUseChat()) refreshChat(false).catch(resetChat);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && canUseChat()) pollUnread(false);
  });

  if (canUseChat()) {
    refreshChat(false).catch(resetChat);
    startPolling();
  } else {
    resetChat();
  }
})();
