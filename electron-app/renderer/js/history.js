// Client audit history tab
(function() {
  let allEvents = [];
  let selected = null;
  let bulkDeleteMode = 'range';
  let historyLoadedAt = 0;
  let historyLoadRevision = 0;
  let historyLoading = false;
  let historyIdleHandle = null;
  let historyToken = window.AUTH?.getToken?.() || '';
  const HISTORY_TTL_MS = 30000;

  const listEl = document.getElementById('history-list');
  const detailEl = document.getElementById('history-detail');
  const searchEl = document.getElementById('history-search');
  const refreshBtn = document.getElementById('history-refresh-btn');
  const deleteFrom = document.getElementById('history-delete-from');
  const deleteTo = document.getElementById('history-delete-to');
  const deleteOpenBtn = document.getElementById('history-delete-open');
  const deleteManager = document.getElementById('history-delete-manager');
  const deleteManagerClose = document.getElementById('history-delete-manager-close');
  const deleteManagerCancel = document.getElementById('history-delete-manager-cancel');
  const deleteModeRange = document.getElementById('history-delete-mode-range');
  const deleteModeAll = document.getElementById('history-delete-mode-all');
  const deleteRangePanel = document.getElementById('history-delete-range-panel');
  const deleteWarningText = document.getElementById('history-delete-manager-warning-text');
  const deleteSubmitBtn = document.getElementById('history-delete-submit');

  const ACTION_META = {
    created: { label: 'Client adaugat', tone: 'created' },
    updated: { label: 'Client modificat', tone: 'updated' },
    scanned: { label: 'Client scanat', tone: 'scanned' },
    finalized: { label: 'Client finalizat', tone: 'finalized' },
    deleted: { label: 'Client sters', tone: 'deleted' },
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function detailLabel(key) {
    return ({
      name: 'Nume',
      phone: 'Telefon',
      email: 'Email',
      status: 'Status',
      qr_code: 'Cod QR',
      qr_used: 'QR folosit',
      price: 'Pret lucrare',
      predefined_price: 'Pret predefinit',
      discount_percentage: 'Reducere',
      manopera_colaboratori: 'Manopera',
      valoare_piese: 'Piese',
      notes: 'Note',
      profile_id: 'Profil afiliere',
    }[key] || key);
  }

  function detailIcon(key) {
    const icons = {
      name: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
      user_single: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
      phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.4 2.6a2 2 0 0 1-.6 1.8L7.6 9.4a16 16 0 0 0 7 7l1.3-1.3a2 2 0 0 1 1.8-.6l2.6.4a2 2 0 0 1 1.7 2Z"/></svg>',
      email: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
      status: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/><circle cx="12" cy="12" r="9"/></svg>',
      qr_code: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M17 17h4v4M14 21h3M21 14v3"/></svg>',
      qr_used: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="m14 18 2 2 5-6"/></svg>',
      actor: '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/><path d="M19 8v6M16 11h6"/></svg>',
      role: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/></svg>',
      date: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
      id: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
      profile_id: '<svg viewBox="0 0 24 24"><path d="M19 5 5 19"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/></svg>',
      price: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>',
      notes: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></svg>',
      changes: '<svg viewBox="0 0 24 24"><path d="M7 7h11"/><path d="m15 4 3 3-3 3"/><path d="M17 17H6"/><path d="m9 14-3 3 3 3"/></svg>',
      default: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>',
    };
    return icons[key] || icons.default;
  }

  function detailValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'boolean') return value ? 'Da' : 'Nu';
    return String(value);
  }

  function actionMeta(event) {
    return ACTION_META[event?.action] || { label: event?.summary || 'Actiune', tone: 'updated' };
  }

  function actionIcon(action) {
    const icons = {
      created: '<svg viewBox="0 0 24 24"><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>',
      updated: '<svg viewBox="0 0 24 24"><path d="M14 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="7.5" cy="7" r="4"/><path d="M16 11.5 20.5 7a1.8 1.8 0 0 1 2.5 2.5L18.5 14 16 14.5Z"/></svg>',
      scanned: '<svg viewBox="0 0 24 24"><path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2"/><path d="M8 8h8v8H8z"/><path d="M12 8v8M8 12h8"/></svg>',
      finalized: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/><circle cx="12" cy="12" r="9"/></svg>',
      deleted: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    };
    return icons[action] || '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>';
  }

  function actorName(event) {
    return event.actor_name || event.actor_username || 'Sistem';
  }

  function clientName(event) {
    return event.client_name || event.details?.name || 'Client';
  }

  function filter(events) {
    const q = searchEl.value.trim().toLowerCase();
    if (!q) return events;
    return events.filter((event) => {
      const meta = actionMeta(event);
      return [
        clientName(event),
        event.client_phone,
        event.client_email,
        event.client_qr_code,
        actorName(event),
        event.actor_username,
        event.actor_role,
        meta.label,
        event.summary,
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }

  function renderList(events, options = {}) {
    const previousScrollTop = options.scrollTop ?? listEl.scrollTop;
    if (!events.length) {
      listEl.innerHTML = '<div class="loading">Nu exista modificari gasite.</div>';
      detailEl.innerHTML = '<div class="empty-state">Nu exista modificari pentru filtrul curent</div>';
      return;
    }

    listEl.innerHTML = events.map((event) => {
      const meta = actionMeta(event);
      return `
        <div class="history-row audit-history-row ${meta.tone}${selected && selected.id === event.id ? ' selected' : ''}" data-id="${escapeHtml(event.id)}" role="button" tabindex="0">
          <span class="history-row-action-icon">${actionIcon(event.action)}</span>
          <span class="history-row-main">
            <span class="history-row-name">${escapeHtml(clientName(event))}</span>
            <span class="history-row-type">${escapeHtml(meta.label)} - ${escapeHtml(actorName(event))}</span>
            <span class="history-row-meta">
              <span class="history-row-date">${escapeHtml(fmtDate(event.created_at))}</span>
              <span class="history-row-price">
                ${detailIcon('qr_code')}
                <span><small>Cod QR</small><strong>${escapeHtml(event.client_qr_code || event.details?.qr_code || '-')}</strong></span>
              </span>
            </span>
          </span>
          <button type="button" class="history-row-delete" data-delete-id="${escapeHtml(event.id)}" title="Sterge aceasta modificare" aria-label="Sterge aceasta modificare">
            ${actionIcon('deleted')}
          </button>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.history-row').forEach((row) => {
      const openRow = () => {
        const event = events.find((item) => item.id === row.dataset.id);
        if (event) selectEvent(event);
      };
      row.addEventListener('click', (clickEvent) => {
        if (clickEvent.target.closest('.history-row-delete')) return;
        openRow();
      });
      row.addEventListener('keydown', (keyEvent) => {
        if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
        keyEvent.preventDefault();
        openRow();
      });
    });
    listEl.querySelectorAll('.history-row-delete').forEach((button) => {
      button.addEventListener('click', (clickEvent) => {
        clickEvent.stopPropagation();
        deleteHistory('single', button.dataset.deleteId);
      });
    });
    listEl.scrollTop = previousScrollTop;
  }

  function renderDetailRows(event) {
    const details = event.details && typeof event.details === 'object' ? event.details : {};
    const changes = Array.isArray(details.changes)
      ? details.changes.filter((change) => change?.field !== 'payment_status')
      : [];
    const rows = Object.entries(details).filter(([key]) => key !== 'changes' && key !== 'payment_status');

    if (changes.length > 0) {
      return `
        <div class="audit-change-list">
          ${changes.map((change) => `
            <div class="audit-change-item">
              <span class="audit-change-label"><i>${detailIcon(change.field || '')}</i><strong>${escapeHtml(change.label || detailLabel(change.field || ''))}</strong></span>
              <div class="audit-change-value before"><small>Inainte</small><strong>${escapeHtml(detailValue(change.from))}</strong></div>
              <em aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></em>
              <div class="audit-change-value after"><small>Dupa</small><strong>${escapeHtml(detailValue(change.to))}</strong></div>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (rows.length > 0) {
      return `
        <div class="detail-grid compact">
          ${rows.map(([key, value]) => `
            <div class="detail-field">
              <div class="detail-field-label"><i>${detailIcon(key)}</i>${escapeHtml(detailLabel(key))}</div>
              <div class="detail-field-value">${escapeHtml(detailValue(value))}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    return '<div class="audit-empty">Nu exista detalii suplimentare pentru aceasta actiune.</div>';
  }

  function df(label, value, accent = false, icon = 'default') {
    return `<div class="detail-field">
      <div class="detail-field-label"><i>${detailIcon(icon)}</i>${escapeHtml(label)}</div>
      <div class="detail-field-value${accent ? ' accent' : ''}">${escapeHtml(value)}</div>
    </div>`;
  }

  function userPopupField(label, value, accent = false, icon = 'default') {
    return `<div class="audit-user-popup-field">
      <i>${detailIcon(icon)}</i>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong class="${accent ? 'accent' : ''}">${escapeHtml(value)}</strong>
      </div>
    </div>`;
  }

  function openUserPopup(event) {
    const existing = document.getElementById('audit-user-popup');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'audit-user-popup-overlay';
    overlay.id = 'audit-user-popup';
    overlay.innerHTML = `
      <div class="audit-user-popup-card" role="dialog" aria-modal="true" aria-labelledby="audit-user-popup-title">
        <button type="button" class="audit-user-popup-close" id="audit-user-popup-close" title="Inchide" aria-label="Inchide"></button>
        <div class="audit-user-popup-head">
          <span class="audit-user-popup-avatar">${detailIcon('user_single')}</span>
          <div>
            <h2 id="audit-user-popup-title">${escapeHtml(actorName(event))}</h2>
            <span>${event.actor_username ? `@${escapeHtml(event.actor_username)}` : 'Utilizator sistem'}</span>
          </div>
        </div>
        <div class="audit-user-popup-grid">
          ${userPopupField('Nume afisat', actorName(event), true, 'user_single')}
          ${userPopupField('Username', event.actor_username ? `@${event.actor_username}` : '-', false, 'id')}
          ${userPopupField('Rol', event.actor_role || '-', false, 'role')}
          ${userPopupField('ID utilizator', event.actor_user_id || '-', false, 'id')}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('audit-user-popup-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (clickEvent) => {
      if (clickEvent.target === overlay) close();
    });
  }

  function selectEvent(event, options = {}) {
    selected = event;
    if (options.updateList !== false) {
      renderList(filter(allEvents));
    }
    const meta = actionMeta(event);

    detailEl.innerHTML = `
      <div class="detail-header audit-detail-header ${meta.tone}">
        <div class="audit-detail-title-block">
          <span class="audit-detail-main-icon">${actionIcon(event.action)}</span>
          <div>
            <div class="detail-title">${escapeHtml(clientName(event))}</div>
            <div class="detail-subtitle">${escapeHtml(meta.label)} - ${escapeHtml(fmtDate(event.created_at))}</div>
          </div>
        </div>
        <span class="audit-action-pill ${meta.tone}">
          ${actionIcon(event.action)}
          <span>${escapeHtml(meta.label)}</span>
        </span>
      </div>

      <div class="audit-event-strip">
        <div class="audit-event-chip"><i>${detailIcon('actor')}</i><span>Utilizator</span><strong>${escapeHtml(actorName(event))}</strong></div>
        <div class="audit-event-chip"><i>${detailIcon('date')}</i><span>Moment</span><strong>${escapeHtml(fmtDate(event.created_at))}</strong></div>
        <div class="audit-event-chip"><i>${detailIcon('qr_code')}</i><span>Cod QR</span><strong>${escapeHtml(event.client_qr_code || event.details?.qr_code || '-')}</strong></div>
      </div>

      <div class="detail-grid">
        <div class="detail-card">
          <div class="audit-card-title-row">
            <div class="detail-card-title"><i>${detailIcon('name')}</i>Client</div>
            <button type="button" class="audit-show-client-btn" id="audit-show-client-btn" title="Arata clientul">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.4"/><path d="M7.8 20.5a5 5 0 0 1 8.4 0"/></svg>
              <span>Arata client</span>
            </button>
          </div>
          ${df('Nume', clientName(event), true, 'name')}
          ${df('Telefon', event.client_phone || '-', false, 'phone')}
          ${df('Email', event.client_email || '-', false, 'email')}
          ${df('Cod QR', event.client_qr_code || event.details?.qr_code || '-', false, 'qr_code')}
          ${df('Status', event.client_status || '-', false, 'status')}
        </div>
        <div class="detail-card">
          <div class="audit-card-title-row">
            <div class="detail-card-title"><i>${detailIcon('actor')}</i>Utilizator</div>
            <button type="button" class="audit-show-client-btn" id="audit-show-user-btn" title="Arata utilizatorul" ${event.actor_user_id ? '' : 'disabled'}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.4"/><path d="M12 15.2c2.2 0 4 1.1 4 2.6"/></svg>
              <span>Arata utilizator</span>
            </button>
          </div>
          ${df('Nume', actorName(event), true, 'actor')}
          ${df('Username', event.actor_username ? `@${event.actor_username}` : '-', false, 'id')}
          ${df('Rol', event.actor_role || '-', false, 'role')}
          ${df('Data actiune', fmtDate(event.created_at), false, 'date')}
        </div>
        <div class="detail-card full audit-event-card">
          <div class="detail-card-title"><i>${detailIcon('changes')}</i>Ce s-a modificat?</div>
          ${renderDetailRows(event)}
        </div>
      </div>
    `;

    document.getElementById('audit-show-client-btn')?.addEventListener('click', () => {
      window.CLIENTS_OPEN?.(event.client_id);
    });
    document.getElementById('audit-show-user-btn')?.addEventListener('click', () => {
      openUserPopup(event);
    });
  }

  async function load(options = {}) {
    if (!window.AUTH?.isAdmin?.()) {
      listEl.innerHTML = '<div class="loading">Istoricul este disponibil doar pentru admin.</div>';
      detailEl.innerHTML = '<div class="empty-state">Autentifica-te ca admin</div>';
      return;
    }
    if (historyLoading && options?.quiet) return;
    const quiet = Boolean(options?.quiet && allEvents.length);
    const revision = ++historyLoadRevision;
    historyLoading = true;
    const selectedId = selected?.id || null;
    const previousScrollTop = listEl.scrollTop;
    if (!quiet) listEl.innerHTML = '<div class="loading">Se incarca...</div>';
    try {
      const nextEvents = await window.API.getClientActivityHistory(window.AUTH.getToken());
      if (revision !== historyLoadRevision) return;
      allEvents = nextEvents;
      historyLoadedAt = Date.now();
      const events = filter(allEvents);
      selected = (selectedId && events.find((event) => event.id === selectedId)) || events[0] || null;
      renderList(events, { scrollTop: previousScrollTop });
      if (selected) {
        selectEvent(selected, { updateList: false });
      } else {
        detailEl.innerHTML = '<div class="empty-state">Nu exista modificari pentru filtrul curent</div>';
      }
    } catch (error) {
      if (revision !== historyLoadRevision) return;
      if (!quiet) {
        listEl.innerHTML = `<div class="loading" style="color:var(--error)">${escapeHtml(error.message)}</div>`;
        detailEl.innerHTML = '<div class="empty-state">Nu s-a putut incarca istoricul</div>';
      }
    } finally {
      if (revision === historyLoadRevision) historyLoading = false;
    }
  }

  function cancelScheduledHistoryLoad() {
    if (historyIdleHandle === null) return;
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(historyIdleHandle);
    else clearTimeout(historyIdleHandle);
    historyIdleHandle = null;
  }

  function scheduleHistoryLoad(quiet) {
    cancelScheduledHistoryLoad();
    const run = () => {
      historyIdleHandle = null;
      if (!document.getElementById('tab-history')?.classList.contains('active')) return;
      void load({ quiet });
    };
    historyIdleHandle = 'requestIdleCallback' in window
      ? window.requestIdleCallback(run, { timeout: 700 })
      : window.setTimeout(run, 40);
  }

  function confirmHistoryDelete(title, message, confirmLabel) {
    return new Promise((resolve) => {
      document.getElementById('history-delete-confirm')?.remove();
      const overlay = document.createElement('div');
      overlay.className = 'history-delete-confirm-overlay';
      overlay.id = 'history-delete-confirm';
      overlay.innerHTML = `
        <div class="history-delete-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="history-delete-confirm-title">
          <span class="history-delete-confirm-icon">${actionIcon('deleted')}</span>
          <div class="history-delete-confirm-copy">
            <span>Actiune permanenta</span>
            <h2 id="history-delete-confirm-title">${escapeHtml(title)}</h2>
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

  function renderAfterSingleDelete(eventId) {
    const previousScrollTop = listEl.scrollTop;
    const previousEvents = filter(allEvents);
    const deletedIndex = previousEvents.findIndex((event) => event.id === eventId);
    allEvents = allEvents.filter((event) => event.id !== eventId);
    const events = filter(allEvents);
    const nextIndex = deletedIndex < 0 ? 0 : Math.min(deletedIndex, events.length - 1);
    selected = events[nextIndex] || null;
    renderList(events, { scrollTop: previousScrollTop });
    if (selected) {
      selectEvent(selected, { updateList: false });
    } else {
      detailEl.innerHTML = '<div class="empty-state">Nu exista modificari pentru filtrul curent</div>';
    }
  }

  async function verifySingleDelete(eventId, deletedEvent) {
    const freshEvents = await window.API.getClientActivityHistory(window.AUTH.getToken());
    const restoredEvent = freshEvents.find((event) =>
      event.id === eventId
      || (
        deletedEvent?.action === 'created'
        && event.action === 'created'
        && event.client_id === deletedEvent.client_id
        && event.created_at === deletedEvent.created_at
      )
    );
    if (restoredEvent) {
      allEvents = freshEvents;
      renderList(filter(allEvents));
      throw new Error('Valoarea a fost recreata de server. Actualizeaza server/api.php pentru ca stergerea sa ramana definitiva.');
    }
  }

  function updateBulkDeletePreview() {
    if (!deleteWarningText || !deleteSubmitBtn) return;
    if (bulkDeleteMode === 'all') {
      deleteWarningText.textContent = `${allEvents.length} modificari din istoric vor fi sterse definitiv.`;
      deleteSubmitBtn.disabled = allEvents.length === 0;
      return;
    }

    const from = deleteFrom?.value || '';
    const to = deleteTo?.value || '';
    if (!from || !to) {
      deleteWarningText.textContent = 'Selecteaza data de inceput si data finala pentru a continua.';
      deleteSubmitBtn.disabled = true;
      return;
    }
    if (from > to) {
      deleteWarningText.textContent = 'Data de inceput trebuie sa fie inaintea datei finale.';
      deleteSubmitBtn.disabled = true;
      return;
    }
    const affectedCount = allEvents.filter((event) => {
      const eventDate = String(event.created_at || '').slice(0, 10);
      return eventDate >= from && eventDate <= to;
    }).length;
    deleteWarningText.textContent = affectedCount === 1
      ? 'O modificare din perioada selectata va fi stearsa definitiv.'
      : `${affectedCount} modificari din perioada selectata vor fi sterse definitiv.`;
    deleteSubmitBtn.disabled = affectedCount === 0;
  }

  function setBulkDeleteMode(mode) {
    bulkDeleteMode = mode === 'all' ? 'all' : 'range';
    deleteModeRange?.classList.toggle('active', bulkDeleteMode === 'range');
    deleteModeAll?.classList.toggle('active', bulkDeleteMode === 'all');
    deleteManager?.classList.toggle('all-mode', bulkDeleteMode === 'all');
    if (deleteRangePanel) deleteRangePanel.hidden = bulkDeleteMode === 'all';
    if (deleteSubmitBtn) {
      deleteSubmitBtn.querySelector('span').textContent = 'Sterge';
    }
    updateBulkDeletePreview();
  }

  function openDeleteManager() {
    setBulkDeleteMode('range');
    deleteManager.hidden = false;
    requestAnimationFrame(() => deleteManager.classList.add('visible'));
    deleteModeRange?.focus();
  }

  function closeDeleteManager() {
    deleteManager.classList.remove('visible');
    setTimeout(() => {
      deleteManager.hidden = true;
    }, 180);
  }

  async function deleteHistory(mode, eventId = '', skipConfirmation = false) {
    if (!window.AUTH?.isAdmin?.()) return;
    const payload = { mode };
    let deletedEvent = null;
    let title = 'Stergi tot istoricul?';
    let confirmation = 'Toate valorile din istoricul modificarilor vor fi eliminate definitiv.';
    let confirmLabel = 'Sterge';
    if (mode === 'single') {
      const event = allEvents.find((item) => item.id === eventId);
      if (!event) return;
      deletedEvent = event;
      payload.id = eventId;
      title = 'Stergi aceasta modificare?';
      confirmation = `${clientName(event)} - ${actionMeta(event).label}, ${fmtDate(event.created_at)}.`;
      confirmLabel = 'Sterge';
    }
    if (mode === 'range') {
      if (!deleteFrom?.value || !deleteTo?.value || deleteFrom.value > deleteTo.value) {
        window.BUSINESS_UI?.showToast?.('Selecteaza un interval de data valid.', 'error');
        deleteFrom?.focus();
        return;
      }
      payload.from = deleteFrom.value;
      payload.to = deleteTo.value;
      title = 'Stergi perioada selectata?';
      confirmation = `Valorile dintre ${deleteFrom.value} si ${deleteTo.value}, inclusiv, vor fi eliminate definitiv.`;
      confirmLabel = 'Sterge';
    }
    if (!skipConfirmation && !await confirmHistoryDelete(title, confirmation, confirmLabel)) return;

    if (deleteSubmitBtn) deleteSubmitBtn.disabled = true;
    try {
      const result = await window.API.deleteClientActivityHistory(window.AUTH.getToken(), payload);
      const deletedCount = Number(result?.deleted_count || 0);
      if (result?.database_deleted !== true) {
        throw new Error('Serverul nu a confirmat stergerea definitiva din baza de date.');
      }
      if (mode === 'single' && deletedCount < 1) {
        throw new Error('Valoarea nu a fost stearsa. Este posibil sa nu mai existe in baza de date.');
      }
      if (mode === 'single') {
        await verifySingleDelete(eventId, deletedEvent);
        renderAfterSingleDelete(eventId);
      } else {
        selected = null;
        await load();
        closeDeleteManager();
      }
      window.BUSINESS_UI?.showToast?.(deletedCount === 1 ? 'Modificarea a fost stearsa.' : `${deletedCount} modificari au fost sterse.`);
    } catch (error) {
      window.BUSINESS_UI?.showToast?.(error.message || 'Istoricul nu a putut fi sters.', 'error');
    } finally {
      if (deleteSubmitBtn) deleteSubmitBtn.disabled = false;
    }
  }

  searchEl.addEventListener('input', () => {
    const events = filter(allEvents);
    if (selected && !events.some((event) => event.id === selected.id)) {
      selected = events[0] || null;
    }
    renderList(events);
    if (selected) {
      selectEvent(selected, { updateList: false });
    } else {
      detailEl.innerHTML = '<div class="empty-state">Nu exista modificari pentru filtrul curent</div>';
    }
  });
  refreshBtn?.addEventListener('click', load);
  deleteOpenBtn?.addEventListener('click', openDeleteManager);
  deleteManagerClose?.addEventListener('click', closeDeleteManager);
  deleteManagerCancel?.addEventListener('click', closeDeleteManager);
  deleteModeRange?.addEventListener('click', () => setBulkDeleteMode('range'));
  deleteModeAll?.addEventListener('click', () => setBulkDeleteMode('all'));
  deleteFrom?.addEventListener('change', updateBulkDeletePreview);
  deleteTo?.addEventListener('change', updateBulkDeletePreview);
  deleteSubmitBtn?.addEventListener('click', () => deleteHistory(bulkDeleteMode, '', true));
  deleteManager?.addEventListener('click', (event) => {
    if (event.target === deleteManager) closeDeleteManager();
  });
  deleteManager?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDeleteManager();
  });

  window.addEventListener('tab-change', ({ detail }) => {
    if (detail !== 'history') {
      cancelScheduledHistoryLoad();
      return;
    }
    if (allEvents.length && Date.now() - historyLoadedAt < HISTORY_TTL_MS) return;
    scheduleHistoryLoad(allEvents.length > 0);
  });

  window.addEventListener('auth-change', (event) => {
    const nextToken = String(event.detail?.token || '');
    if (nextToken !== historyToken) {
      historyToken = nextToken;
      historyLoadRevision += 1;
      historyLoading = false;
      historyLoadedAt = 0;
      allEvents = [];
      selected = null;
      listEl.innerHTML = '<div class="loading">Istoricul nu a fost incarcat.</div>';
      detailEl.innerHTML = '<div class="empty-state">Selectati o modificare</div>';
    }
    if (nextToken && document.getElementById('tab-history')?.classList.contains('active')) scheduleHistoryLoad(false);
  });

  window.HISTORY_LOAD = load;
})();
