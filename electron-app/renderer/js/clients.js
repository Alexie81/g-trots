// Clients tab
(function() {
  const QRCode = require('qrcode');
  const { clipboard, nativeImage, shell } = require('electron');
  let allClients = [];
  let pricePresets = [];
  let selected = null;
  let activeQrDataUrl = '';

  const listEl = document.getElementById('clients-list');
  const detailEl = document.getElementById('client-detail');
  const searchEl = document.getElementById('clients-search');
  const addClientBtn = document.getElementById('clients-add-btn');
  const refreshBtn = document.getElementById('clients-refresh-btn');
  const lifecycleFilterButtons = Array.from(document.querySelectorAll('[data-client-lifecycle-filter]'));
  const qrModal = document.getElementById('qr-modal');
  const qrModalClose = document.getElementById('qr-modal-close');
  const qrModalTitle = document.getElementById('qr-modal-title');
  const qrModalContent = document.getElementById('qr-modal-content');
  const whatsappPresetModal = document.getElementById('whatsapp-preset-modal');
  const whatsappPresetClose = document.getElementById('whatsapp-preset-close');
  const whatsappPresetTitle = document.getElementById('whatsapp-preset-title');
  const whatsappPresetList = document.getElementById('whatsapp-preset-list');
  const clientDeleteModal = document.getElementById('client-delete-modal');
  const clientDeleteModalClose = document.getElementById('client-delete-modal-close');
  const clientDeleteModalCancel = document.getElementById('client-delete-modal-cancel');
  const clientDeleteModalConfirm = document.getElementById('client-delete-modal-confirm');
  const clientDeleteAvatar = document.getElementById('client-delete-avatar');
  const clientDeleteName = document.getElementById('client-delete-name');
  const clientDeleteSubtitle = document.getElementById('client-delete-subtitle');
  const clientDeletePhone = document.getElementById('client-delete-phone');
  const clientDeleteQr = document.getElementById('client-delete-qr');
  const clientDeleteStatus = document.getElementById('client-delete-status');
  let pendingSelectClientId = null;
  let clientDeleteResolver = null;
  let clientsLoadInFlight = false;
  let clientsRealtimeTimer = null;
  let clientSearchTimer = null;
  let clientsDataVersion = '';
  let clientsHaveLoaded = false;
  let clientLifecycleFilter = '';

  const STATUS_LABEL = {
    interesat: 'Interesat',
    va_folosi_codul: 'QR Generat',
    cod_folosit: 'QR Folosit',
  };
  const STATUS_CLASS = {
    interesat: 'badge-interesat',
    va_folosi_codul: 'badge-va_folosi_codul',
    cod_folosit: 'badge-cod_folosit',
  };
  const CLIENT_STATUS_ACCENTS = {
    active: { hex: '#EF4444', rgb: '239,68,68' },
    finalized: { hex: '#22C55E', rgb: '34,197,94' },
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
    return date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtDateTime(value) {
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

  const CURRENCIES = ['RON','EUR','USD','GBP','CHF','HUF','BGN','PLN','CZK','MDL','UAH','TRY','CAD','AUD','JPY','CNY','SEK','NOK','DKK'];
  const EXPENSE_COLOR_OPTIONS = ['#FF6B00', '#F59E0B', '#22C55E', '#3B82F6', '#EC4899', '#14B8A6', '#EF4444', '#8B5CF6'];

  function currencyCode(value) {
    const code = String(value || 'RON').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : 'RON';
  }

  function fmtMoney(value, currency = 'RON') {
    return `${Number(value || 0).toFixed(2)} ${currencyCode(currency)}`;
  }

  function calculateClientPayment(priceValue, diagnosticValue, discountValue = 0, advanceValue = 0) {
    const price = Math.max(Number(priceValue || 0), 0);
    const diagnostic = Math.max(Number(diagnosticValue || 0), 0);
    const discount = Math.min(100, Math.max(Number(discountValue || 0), 0));
    const advance = Math.max(Number(advanceValue || 0), 0);
    const grossTotal = price > 0 ? price : diagnostic;
    const total = Math.max(grossTotal * (1 - discount / 100), 0);
    const amountDue = Math.max(total - advance, 0);
    return { price, diagnostic, discount, advance, grossTotal, total, amountDue };
  }

  function normalizeGrossPriceForDiscountInput(incomingValue, predefinedValue, discountValue, currentValue = 0) {
    const incoming = Math.max(Number(incomingValue || 0), 0);
    const predefined = Math.max(Number(predefinedValue || 0), 0);
    if (incoming <= 0 && predefined > 0) return predefined;
    const discount = Math.min(100, Math.max(Number(discountValue || 0), 0));
    if (incoming <= 0 || discount <= 0 || discount >= 100) return incoming;
    const factor = 1 - discount / 100;
    const candidates = [currentValue, predefined]
      .map((value) => Math.max(Number(value || 0), 0))
      .filter((value, index, values) => value > 0 && values.indexOf(value) === index);
    for (const grossCandidate of candidates) {
      const discountedCandidate = grossCandidate * factor;
      const tolerance = Math.max(0.05, grossCandidate * 0.0005);
      if (Math.abs(incoming - discountedCandidate) <= tolerance) return grossCandidate;
    }
    return incoming;
  }

  function normalizePaymentStatus(status, amountDue = 0, total = 0) {
    if (Number(total || 0) > 0 && Number(amountDue || 0) <= 0.00001) {
      return 'incasati';
    }
    return ['incasati', 'de_incasat'].includes(String(status || ''))
      ? String(status)
      : 'de_incasat';
  }

  function amountDueByPaymentStatus(amountDue, paymentStatus) {
    return Number(amountDue || 0);
  }

  function isTotalOnlyPayment(priceValue, predefinedValue, advanceValue = 0) {
    return false;
  }

  function displayAmountDueForPayment(priceValue, predefinedValue, amountDue, advanceValue = 0) {
    return Number(amountDue || 0);
  }

  async function loadPricePresets() {
    const authToken = window.AUTH?.getToken?.() || '';
    if (!authToken) return [];
    try {
      pricePresets = await window.API.getPricePresets(authToken);
    } catch (_error) {
      pricePresets = [];
    }
    return pricePresets;
  }

  function generateQrCode() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `GT-${timestamp}-${random}`;
  }

  function initials(name) {
    return String(name || 'C')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'C';
  }

  function sourceLabel(source) {
    return ({
      owner: 'Creator',
      scan: 'Scanare',
      edit: 'Editare',
      manual: 'Manual',
      created: 'Creat',
      updated: 'Editat',
      scanned: 'Scanat',
      finalized: 'Finalizat',
      deleted: 'Sters',
    }[source] || source);
  }

  function detailLabel(key) {
    return ({
      name: 'Nume',
      phone: 'Telefon',
      email: 'Email',
      status: 'Status',
      qr_code: 'Cod QR',
      qr_used: 'QR folosit',
      price: 'Pret',
      predefined_price: 'Pret predefinit',
      discount_percentage: 'Reducere',
      manopera_colaboratori: 'Manopera',
      valoare_piese: 'Cost efectiv piese',
      service_parts_price: 'Piese in fisa de service',
      service_labor_price: 'Manopera in fisa de service',
      notes: 'Note',
      profile_id: 'Profil',
    }[key] || key);
  }

  function clientDetailIcon(key) {
    const icons = {
      client: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2.5"/><path d="M5.5 17a3.5 3.5 0 0 1 7 0M15 9h3M15 13h3"/></svg>',
      contact: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.4 2.6a2 2 0 0 1-.6 1.8L7.6 9.4a16 16 0 0 0 7 7l1.3-1.3a2 2 0 0 1 1.8-.6l2.6.4a2 2 0 0 1 1.7 2Z"/></svg>',
      phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.4 2.6a2 2 0 0 1-.6 1.8L7.6 9.4a16 16 0 0 0 7 7l1.3-1.3a2 2 0 0 1 1.8-.6l2.6.4a2 2 0 0 1 1.7 2Z"/></svg>',
      email: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
      calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
      finance: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>',
      discount: '<svg viewBox="0 0 24 24"><path d="M19 5 5 19"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/></svg>',
      parts: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="3"/><circle cx="16.5" cy="8" r="2.5"/><path d="M8 9.5v2M8 18.5v2M2.5 15h2M11.5 15h2M4.1 11.1l1.4 1.4M10.5 17.5l1.4 1.4M4.1 18.9l1.4-1.4M10.5 12.5l1.4-1.4M16.5 3.5v2M16.5 10.5v2M12 8h2M19 8h2M13.3 4.8l1.4 1.4M18.3 9.8l1.4 1.4M13.3 11.2l1.4-1.4M18.3 6.2l1.4-1.4"/></svg>',
      profile: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="4"/><path d="M2 21a6 6 0 0 1 12 0"/><path d="M17 11h5M19.5 8.5v5"/></svg>',
      qr: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M17 17h4v4M14 21h3M21 14v3"/></svg>',
      edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-5 1 1-5Z"/></svg>',
      notes: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></svg>',
      list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
      search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
      default: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>',
    };
    return icons[key] || icons.default;
  }

  function clientDetailIconKey(label) {
    if (/\([^)]*%\)$/.test(String(label))) return 'profile';
    if (String(label).startsWith('Rest de plata') || String(label).startsWith('Total de plata')) return 'finance';
    return ({
      Telefon: 'phone',
      Email: 'email',
      'Data adaugare': 'calendar',
      'Pret lucrare': 'finance',
      'Pret predefinit': 'finance',
      Discount: 'discount',
      'Rest de plata': 'finance',
      'Valoare piese': 'parts',
      Profil: 'profile',
      'G-Trots': 'finance',
      'Cod QR': 'qr',
      'Editari pret': 'edit',
      Note: 'notes',
    }[label] || 'default');
  }

  function detailValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'boolean') return value ? 'Da' : 'Nu';
    return String(value);
  }

  function canViewAudit() {
    const role = window.AUTH?.getUser?.()?.role || '';
    return role === 'admin' || role === 'manager';
  }

  function currentRole() {
    return window.AUTH?.getUser?.()?.role || '';
  }

  function clientPermissions(client) {
    const user = window.AUTH?.getUser?.() || {};
    const role = user.role || '';
    const userCanEdit = role === 'user' && Boolean(user.client_edit_access);
    return {
      canEdit: role === 'admin' || (!client.is_finalized && (role === 'manager' || userCanEdit)),
      canFinalize: !client.is_finalized && ['admin', 'manager'].includes(role),
      canDelete: role === 'admin' || (role === 'manager' && !client.is_finalized),
    };
  }

  function qrIsUsed(client) {
    const value = client?.qr_used;
    return value === true
      || value === 1
      || value === '1';
  }

  function clientCardAccent(client) {
    return client?.is_finalized
      ? CLIENT_STATUS_ACCENTS.finalized
      : CLIENT_STATUS_ACCENTS.active;
  }

  function renderList(clients) {
    if (!clients.length) {
      listEl.innerHTML = '<div class="loading">Niciun client gasit.</div>';
      return;
    }

    listEl.innerHTML = clients.map((client) => {
      const payment = calculateClientPayment(
        client.price,
        client.predefined_price,
        client.discount_percentage,
        client.advance_amount
      );
      const discounted = payment.total;
      const due = payment.amountDue;
      const displayDue = client.payment_status === 'incasati'
        ? 0
        : displayAmountDueForPayment(client.price, client.predefined_price, due, client.advance_amount);
      const currency = currencyCode(client.currency_code);
      const participantCount = Array.isArray(client.participants) ? client.participants.length : 0;
      const usedQr = qrIsUsed(client);
      const accent = clientCardAccent(client);
      return `
        <div class="client-row ${usedQr ? 'qr-used' : 'qr-unused'}${client.is_finalized ? ' finalized' : ' active'}${selected && selected.id === client.id ? ' selected' : ''}" data-id="${escapeHtml(client.id)}" style="--client-accent:${accent.hex};--client-accent-rgb:${accent.rgb};">
          <div class="client-row-avatar">${escapeHtml(initials(client.name))}</div>
          <div class="client-row-main">
            <div class="client-row-top">
              <div class="client-row-name">${escapeHtml(client.name)}</div>
              <span class="client-row-qr-badge ${usedQr ? 'used' : 'generated'}">
                ${usedQr ? 'QR Folosit' : 'QR Generat'}
              </span>
            </div>
            <div class="client-row-phone">${escapeHtml(client.phone)}${client.email ? ` - ${escapeHtml(client.email)}` : ''}</div>
            <div class="client-row-meta">
              <span>${client.financials_hidden ? 'Costuri ascunse' : escapeHtml(fmtMoney(displayDue, currency))}</span>
              <span>${usedQr ? 'QR folosit' : 'QR nefolosit'}</span>
              <span>${escapeHtml(fmtDate(client.created_at))}</span>
            </div>
            <div class="client-row-tags">
              ${client.profiles?.name ? `<span class="client-tag">${escapeHtml(client.profiles.name)}</span>` : ''}
              ${participantCount > 0 ? `<span class="client-tag">${participantCount} participant${participantCount === 1 ? '' : 'i'}</span>` : ''}
              ${client.is_finalized
                ? '<span class="client-tag success">Finalizat</span>'
                : '<span class="client-tag active">Activ</span>'}
            </div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.client-row').forEach((row) => {
      row.addEventListener('click', () => {
        const client = clients.find((item) => item.id === row.dataset.id);
        if (client) selectClient(client);
      });
    });
  }

  function markSelectedClient() {
    if (!listEl) return;
    listEl.querySelectorAll('.client-row').forEach((row) => {
      row.classList.toggle('selected', Boolean(selected && selected.id === row.dataset.id));
    });
  }

  function selectClient(client) {
    selected = client;
    markSelectedClient();

    const usedQr = qrIsUsed(client);
    const payment = calculateClientPayment(
      client.price,
      client.predefined_price,
      client.discount_percentage,
      client.advance_amount
    );
    const discounted = payment.total;
    const due = payment.amountDue;
    const paymentStatus = normalizePaymentStatus(client.payment_status, due, discounted);
    const totalOnlyPayment = isTotalOnlyPayment(client.price, client.predefined_price, client.advance_amount);
    const displayDue = paymentStatus === 'incasati'
      ? 0
      : displayAmountDueForPayment(client.price, client.predefined_price, due, client.advance_amount);
    const amountDueLabel = 'Rest de plata';
    const collected = discounted;
    const currency = currencyCode(client.currency_code);
    const selectedPricePreset = pricePresets.find(
      (preset) => Number(preset.price || 0) === Number(client.predefined_price || 0)
    ) || pricePresets[0];
    const predefinedPriceLabel = selectedPricePreset?.label || 'Pret predefinit';
    const manopera = client.manopera_colaboratori === null
      ? Number(client.service_labor_price || 0)
      : Number(client.manopera_colaboratori || 0);
    const piese = client.valoare_piese === null
      ? Number(client.service_parts_price || 0)
      : Number(client.valoare_piese || 0);
    const otherExpenses = Number(client.alte_cheltuieli || 0);
    const profilePct = Number(client.profiles?.percentage || 0);
    const profileAmount = profilePct > 0 ? collected * (profilePct / 100) : 0;
    const gtrotsAmount = collected - profileAmount - manopera - piese - otherExpenses;
    const permissions = clientPermissions(client);
    const canViewFinancials = (window.AUTH?.canViewClientFinancials?.() ?? true) && !client.financials_hidden;

    detailEl.innerHTML = `
      <div class="detail-header client-detail-header">
        <div class="client-detail-identity">
          <div class="client-detail-title-row">
            <div class="detail-title">${escapeHtml(client.name)}</div>
            <div class="client-detail-badges">
              <span class="client-detail-qr-badge ${usedQr ? 'used' : 'generated'}">
                ${usedQr ? 'QR Folosit' : 'QR Generat'}
              </span>
              ${client.is_finalized
                ? '<span class="client-detail-status-badge finalized">Finalizat</span>'
                : '<span class="client-detail-status-badge active">Activ</span>'}
              ${client.status === 'interesat'
                ? `<span class="badge ${STATUS_CLASS[client.status] || ''}">${escapeHtml(STATUS_LABEL[client.status] || client.status)}</span>`
                : ''}
            </div>
          </div>
          <div class="detail-subtitle">Creat pe ${escapeHtml(fmtDate(client.created_at))}${client.is_finalized ? ' - Finalizat' : ''}</div>
        </div>
        <div class="client-detail-header-actions">
          ${client.is_finalized ? '' : `<button type="button" class="client-header-icon-btn whatsapp" id="client-whatsapp-preset-btn" title="Mesaj WhatsApp" aria-label="Mesaj WhatsApp">${clientActionIcon('whatsapp')}</button>`}
          <button type="button" class="client-service-sheet-btn" id="client-service-sheet-btn" title="Fisa service" aria-label="Fisa service">
            ${clientActionIcon('service')}
            <span>Fisa service</span>
          </button>
          ${permissions.canEdit ? `<button type="button" class="client-header-icon-btn edit" id="client-edit-btn" title="Editeaza client" aria-label="Editeaza client">${clientActionIcon('edit')}</button>` : ''}
          ${permissions.canDelete ? `<button type="button" class="client-header-icon-btn delete" id="client-delete-btn" title="Sterge client" aria-label="Sterge client">${clientActionIcon('delete')}</button>` : ''}
          <button type="button" class="client-view-qr-btn" id="client-view-qr-btn">
            ${clientActionIcon('qr')}
            <span>Vezi QR</span>
          </button>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-card">
          <div class="detail-card-title"><i>${clientDetailIcon('client')}</i>Informatii client</div>
          ${df('Telefon', client.phone)}
          ${df('Email', client.email || '-')}
          ${df('Data adaugare', fmtDateTime(client.created_at))}
          ${df('Cod QR', client.qr_code, false, true)}
          ${client.notes ? df('Note', client.notes) : ''}
        </div>
        <div class="detail-card ${canViewFinancials ? '' : 'financial-hidden'}">
          <div class="detail-card-title"><i>${clientDetailIcon('finance')}</i>Financiar</div>
          ${df('Pret lucrare', fmtMoney(client.price, currency))}
          ${df(predefinedPriceLabel, fmtMoney(client.predefined_price || 0, currency))}
          ${df('Discount', `${Number(client.discount_percentage || 0)}%`)}
          ${df('Avans', fmtMoney(client.advance_amount || 0, currency))}
          ${df('Total de plata', fmtMoney(discounted, currency), true)}
          ${df(amountDueLabel, fmtMoney(displayDue, currency), true)}
          ${piese > 0 ? df('Valoare piese', fmtMoney(piese, currency)) : ''}
          ${renderExpenseBreakdown(client)}
          ${client.profiles?.name
            ? df(`${client.profiles.name} (${profilePct}%)`, fmtMoney(profileAmount, currency))
            : ''}
          ${df('G-Trots', fmtMoney(gtrotsAmount, currency), true)}
          ${renderLaborBreakdown(client)}
        </div>
        ${canViewFinancials ? '' : `
          <div class="detail-card client-financial-locked-card">
            <div class="detail-card-title"><i>${clientDetailIcon('finance')}</i>Costuri ascunse</div>
            <p>Administratorul a restrictionat vizualizarea sumelor incasate si a costurilor interne.</p>
          </div>
        `}
      </div>

      ${renderAuditSection(client)}
      ${permissions.canFinalize ? `
        <div class="client-finalize-panel">
          <div class="client-finalize-copy">
            <span class="client-finalize-icon">${clientActionIcon('finalize')}</span>
            <div>
              <strong>Finalizeaza clientul</strong>
              ${currentRole() === 'admin'
                ? '<span>Confirma lucrarea si blocheaza editarea pentru manager.</span>'
                : ''}
            </div>
          </div>
          <button type="button" class="btn-primary client-finalize-bottom-btn" id="client-finalize-btn">
            ${clientActionIcon('finalize')}
            <span>Finalizeaza client</span>
          </button>
        </div>
      ` : client.is_finalized ? `
        <div class="client-finalize-panel completed">
          <div class="client-finalize-copy">
            <span class="client-finalize-icon">${clientActionIcon('finalize')}</span>
            <div>
              <strong>Client finalizat</strong>
              <span>Lucrarea este confirmata si clientul a fost finalizat.</span>
            </div>
          </div>
          <span class="client-finalize-completed-badge">${clientActionIcon('finalize')} Finalizat</span>
        </div>
      ` : ''}
    `;

    document.getElementById('client-view-qr-btn')?.addEventListener('click', () => openQrModal(client));
    document.getElementById('client-whatsapp-preset-btn')?.addEventListener('click', () => openWhatsAppPresetModal(client));
    document.getElementById('client-service-sheet-btn')?.addEventListener('click', () => {
      switchTab('service');
      setTimeout(() => window.openServiceSheetForClient?.(client), 80);
    });
    document.getElementById('client-edit-btn')?.addEventListener('click', () => openClientFormModal(client, 'edit'));
    document.getElementById('client-finalize-btn')?.addEventListener('click', () => openClientFormModal(client, 'finalize'));
    document.getElementById('client-delete-btn')?.addEventListener('click', () => deleteSelectedClient(client));
  }

  function clientActionIcon(type) {
    const icons = {
      whatsapp: '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.56 7.47L3 21l2.03-5.44A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 8.4c.8 3.2 2.7 5.1 5.9 6"/></svg>',
      service: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>',
      edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-5 1 1-5Z"/></svg>',
      delete: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>',
      qr: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h3v3M18 18h3v3M15 21h3M21 15v3"/></svg>',
      finalize: '<svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"/><circle cx="12" cy="12" r="9"/></svg>',
    };
    return icons[type] || '';
  }

  function clientToPayload(client, formData = null) {
    const source = formData || new Map();
    const read = (key, fallback = '') => formData ? formData.get(key) : fallback;
    const nullableMoney = (key, fallback = null) => {
      const raw = read(key, fallback);
      return raw === null || raw === undefined || String(raw).trim() === ''
        ? null
        : Math.max(Number(raw) || 0, 0);
    };
    const rawPrice = Number(read('price', client.price || 0) || 0);
    const predefinedPrice = Number(read('predefined_price', client.predefined_price || 0) || 0);
    const discount = Number(read('discount_percentage', client.discount_percentage || 0) || 0);
    const price = normalizeGrossPriceForDiscountInput(rawPrice, predefinedPrice, discount, client.price || 0);
    const advance = Math.max(Number(read('advance_amount', client.advance_amount || 0) || 0), 0);
    const payment = calculateClientPayment(price, predefinedPrice, discount, advance);
    const paymentStatus = normalizePaymentStatus(
      read('payment_status', client.payment_status || ''),
      payment.amountDue,
      payment.total
    );
    return {
      name: String(read('name', client.name || '') || '').trim(),
      phone: String(read('phone', client.phone || '') || '').trim(),
      email: String(read('email', client.email || '') || '').trim() || null,
      status: String(read('status', client.status || 'va_folosi_codul') || 'va_folosi_codul'),
      price,
      predefined_price: predefinedPrice,
      advance_amount: advance,
      currency_code: currencyCode(read('currency_code', client.currency_code || 'RON')),
      payment_status: paymentStatus,
      discount_percentage: discount,
      manopera_colaboratori: nullableMoney('manopera_colaboratori', client.manopera_colaboratori),
      valoare_piese: nullableMoney('valoare_piese', client.valoare_piese),
      service_parts_price: Number(read('service_parts_price', client.service_parts_price || 0) || 0),
      service_labor_price: Number(read('service_labor_price', client.service_labor_price || 0) || 0),
      alte_cheltuieli: nullableMoney('alte_cheltuieli', client.alte_cheltuieli),
      notes: String(read('notes', client.notes || '') || '').trim() || null,
      profile_id: String(read('profile_id', client.profile_id || '') || '').trim() || null,
      qr_code: client.qr_code || '',
      is_finalized: formData
        ? String(read('lifecycle_status', client.is_finalized ? 'finalized' : 'active')) === 'finalized'
        : Boolean(client.is_finalized),
      qr_used: formData
        ? String(read('qr_usage_status', qrIsUsed(client) ? 'used' : 'unused')) === 'used'
        : qrIsUsed(client),
    };
  }

  function validateClientPayload(payload, mode) {
    if (!payload.name) return 'Numele clientului este obligatoriu.';
    if (!payload.phone) return 'Telefonul clientului este obligatoriu.';
    if (payload.discount_percentage < 0 || payload.discount_percentage > 100) {
      return 'Reducerea trebuie sa fie intre 0 si 100.';
    }
    if (mode === 'finalize' && payload.price < 0) {
      return 'Pretul lucrarii trebuie sa fie o valoare pozitiva sau 0.';
    }
    if (payload.predefined_price < 0) {
      return 'Pretul predefinit trebuie sa fie o valoare pozitiva sau 0.';
    }
    return '';
  }

  async function openClientFormModal(client, mode) {
    const role = currentRole();
    const permissions = mode === 'add' ? { canEdit: true, canFinalize: false } : clientPermissions(client);
    if (mode === 'finalize' && !permissions.canFinalize) {
      window.BUSINESS_UI?.showToast?.('Contul de tip user nu poate finaliza clienti.', 'error');
      return;
    }
    if (mode === 'edit' && !permissions.canEdit) {
      window.BUSINESS_UI?.showToast?.('Contul nu are permisiune pentru editarea acestui client.', 'error');
      return;
    }
    const isAdmin = role === 'admin';
    const financialLocked = role === 'user';
    const canViewFinancials = (window.AUTH?.canViewClientFinancials?.() ?? true) && !client.financials_hidden;
    const title = mode === 'add' ? 'Adauga client' : (mode === 'finalize' ? 'Finalizeaza client' : 'Editeaza client');
    const [profiles, collaborators, expenseCategories] = await Promise.all([
      window.API.getProfiles().catch(() => []),
      window.API.getCollaborators().catch(() => []),
      window.API.getExpenseCategories().catch(() => []),
      loadPricePresets(),
    ]);
    if (mode === 'add' && Number(client.predefined_price || 0) <= 0 && pricePresets[0]) {
      client = {
        ...client,
        predefined_price: Number(pricePresets[0].price || 0),
      };
    }
    if (Number(client.price || 0) <= 0 && Number(client.predefined_price || 0) > 0) {
      client = {
        ...client,
        price: Number(client.predefined_price || 0),
      };
    }
    const initialPayment = calculateClientPayment(
      client.price,
      client.predefined_price,
      client.discount_percentage,
      client.advance_amount
    );
    const initialPaymentStatus = normalizePaymentStatus(
      client.payment_status,
      initialPayment.amountDue,
      initialPayment.total
    );
    const initialClientTotal = initialPayment.total;
    const initialTotalOnlyPayment = isTotalOnlyPayment(client.price, client.predefined_price, client.advance_amount);
    const initialAmountDue = initialPaymentStatus === 'incasati'
      ? 0
      : displayAmountDueForPayment(
          client.price,
          client.predefined_price,
          amountDueByPaymentStatus(initialPayment.amountDue, initialPaymentStatus),
          client.advance_amount
        );
    const initialAmountDueLabel = 'Rest de plata';
    const initialCurrency = currencyCode(client.currency_code);
    const overlay = document.createElement('div');
    overlay.className = 'client-action-modal-overlay';
    overlay.innerHTML = `
      <form class="client-action-modal" id="client-action-form">
        <div class="client-action-head">
          <div class="client-action-icon">${escapeHtml(initials(client.name).slice(0, 1))}</div>
          <div class="client-action-head-copy">
            <span>${escapeHtml(title)}</span>
            <h2>${escapeHtml(mode === 'add' ? 'Client nou' : client.name)}</h2>
            <small>${escapeHtml(client.qr_code || 'Fara cod QR')}</small>
          </div>
          <button type="button" class="client-action-close" id="client-action-close" aria-label="Inchide"></button>
        </div>
        <div class="client-action-body">
          <div class="client-action-sections">
            <section class="client-action-section">
              <div class="client-action-section-title">
                <i>${clientDetailIcon('client')}</i>
                <div><strong>Informatii client</strong><span>Date personale, QR si note</span></div>
              </div>
              <div class="client-action-grid">
                ${clientActionField('Nume client', 'name', client.name)}
                ${clientActionField('Telefon', 'phone', client.phone)}
                ${clientActionField('Email', 'email', client.email || '', 'email')}
                ${isAdmin && mode === 'edit' ? `
                  <label class="client-action-field">
                    <span>Stare client</span>
                    <select name="lifecycle_status">
                      <option value="finalized" ${client.is_finalized ? 'selected' : ''}>Finalizat</option>
                      <option value="active" ${!client.is_finalized ? 'selected' : ''}>Activ</option>
                    </select>
                  </label>
                  <label class="client-action-field">
                    <span>Stare cod QR</span>
                    <select name="qr_usage_status">
                      <option value="unused" ${!qrIsUsed(client) ? 'selected' : ''}>QR Nefolosit</option>
                      <option value="used" ${qrIsUsed(client) ? 'selected' : ''}>QR Folosit</option>
                    </select>
                  </label>
                ` : ''}
                <div class="client-action-static-field full">
                  <span>Cod QR</span>
                  <strong>${escapeHtml(client.qr_code || 'Fara cod QR')}</strong>
                </div>
                <label class="client-action-field full">
                  <span>Note</span>
                  <textarea name="notes" rows="3">${escapeHtml(client.notes || '')}</textarea>
                </label>
              </div>
            </section>

            <section class="client-action-section financial ${canViewFinancials ? '' : 'financial-hidden'}">
              <div class="client-action-section-title">
                <i>${clientDetailIcon('finance')}</i>
                <div><strong>Financiar</strong><span>Valori, distribuire si rezultat</span></div>
              </div>
              <div class="client-action-grid">
                ${renderPricePresetControls(client, financialLocked)}
                <label class="client-action-field">
                  <span>Moneda tuturor valorilor</span>
                  <input name="currency_code" type="text" list="client-currency-options" value="${escapeHtml(currencyCode(client.currency_code))}" maxlength="3" ${financialLocked ? 'disabled' : ''} />
                  <datalist id="client-currency-options">${CURRENCIES.map((code) => `<option value="${code}"></option>`).join('')}</datalist>
                </label>
                ${clientActionField('Avans', 'advance_amount', Number(client.advance_amount || 0), 'number', financialLocked)}
                ${clientActionField(initialAmountDueLabel, 'amount_due_display', `${initialAmountDue.toFixed(2)} ${initialCurrency}`, 'text', true)}
                ${clientPaymentStatusControl(initialPaymentStatus, financialLocked)}
                ${clientActionField('Reducere %', 'discount_percentage', Number(client.discount_percentage || 0), 'number', financialLocked)}
                ${clientActionField('Cost efectiv piese (intern)', 'valoare_piese', client.valoare_piese ?? '', 'number', financialLocked)}
                ${clientActionField('Piese in fisa de service', 'service_parts_price', Number(client.service_parts_price || 0), 'number', financialLocked)}
                ${clientActionField('Manopera in fisa de service', 'service_labor_price', Number(client.service_labor_price || 0), 'number', financialLocked)}
                <label class="client-action-field">
                  <span>Profil afiliere</span>
                  <select name="profile_id" ${financialLocked ? 'disabled' : ''}>
                    <option value="" data-percentage="0">Niciunul</option>
                    ${profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" data-percentage="${escapeHtml(Number(profile.percentage || 0))}" ${profile.id === client.profile_id ? 'selected' : ''}>${escapeHtml(profile.name)}</option>`).join('')}
                  </select>
                </label>
                <div class="client-action-financial-summary">
                  ${clientActionFinancialValue('Total de plata', 'client-modal-total-price')}
                  ${clientActionFinancialValue(initialAmountDueLabel, 'client-modal-final-price')}
                  <div class="client-action-financial-value" id="client-modal-profile-summary">
                    <span id="client-modal-profile-label">PROFIL AFILIERE</span>
                    <strong id="client-modal-profile-amount">0.00 RON</strong>
                  </div>
                  <div class="client-action-financial-value" id="client-modal-labor-summary">
                    <span>Manopera</span>
                    <strong id="client-modal-labor-amount">0.00 RON</strong>
                  </div>
                  <div class="client-action-financial-value" id="client-modal-expenses-summary">
                    <span>Alte cheltuieli</span>
                    <strong id="client-modal-expenses-amount">0.00 RON</strong>
                  </div>
                  ${clientActionFinancialValue('G-Trots', 'client-modal-gtrots-amount', 'accent')}
                </div>
                ${renderCollaboratorCostEditor(collaborators, client, financialLocked)}
                ${renderExpenseCostEditor(expenseCategories, client, financialLocked)}
              </div>
            </section>
            ${canViewFinancials ? '' : `
              <section class="client-action-section client-financial-locked-card">
                <div class="client-action-section-title">
                  <i>${clientDetailIcon('finance')}</i>
                  <div><strong>Costuri ascunse</strong><span>Administratorul a restrictionat vizualizarea sumelor incasate si a costurilor interne.</span></div>
                </div>
              </section>
            `}
            <input type="hidden" name="status" value="${escapeHtml(mode === 'finalize' ? 'cod_folosit' : client.status || 'va_folosi_codul')}" />
          </div>
        </div>
        <div class="client-action-footer">
          <div class="client-action-error" id="client-action-error"></div>
          <div class="client-action-footer-buttons">
            <button type="button" class="btn-ghost" id="client-action-cancel">Anuleaza</button>
            <button type="submit" class="btn-primary">${mode === 'add' ? 'Adauga client' : (mode === 'finalize' ? 'Finalizeaza client' : 'Salveaza modificari')}</button>
          </div>
        </div>
      </form>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const form = overlay.querySelector('#client-action-form');
    const errorEl = overlay.querySelector('#client-action-error');
    overlay.querySelector('#client-action-close')?.addEventListener('click', close);
    overlay.querySelector('#client-action-cancel')?.addEventListener('click', close);
    const collaboratorInputs = () => [...overlay.querySelectorAll('.client-collaborator-cost-input')];
    const collaboratorRows = () => [...overlay.querySelectorAll('.client-labor-editor-row:not(.client-expense-editor-row)')];
    const expenseInputs = () => [...overlay.querySelectorAll('.client-expense-cost-input')];
    const preservedExpenseTotal = (Array.isArray(client.expense_costs) ? client.expense_costs : [])
      .filter((item) => !item.expense_id)
      .reduce((sum, item) => sum + Math.max(Number(item.cost || 0), 0), 0);
    const readFinancialContext = () => {
      const price = Number(overlay.querySelector('[name="price"]')?.value ?? client.price ?? 0);
      const predefinedPrice = Number(overlay.querySelector('[name="predefined_price"]')?.value ?? client.predefined_price ?? 0);
      const discount = Number(overlay.querySelector('[name="discount_percentage"]')?.value ?? 0);
      const rawParts = overlay.querySelector('[name="valoare_piese"]')?.value;
      const displayedParts = Math.max(Number(overlay.querySelector('[name="service_parts_price"]')?.value ?? client.service_parts_price ?? 0), 0);
      const parts = rawParts === undefined || String(rawParts).trim() === ''
        ? displayedParts
        : Math.max(Number(rawParts || 0), 0);
      const customExpenses = preservedExpenseTotal
        + expenseInputs().reduce((sum, input) => sum + Math.max(Number(input.value || 0), 0), 0);
      const profileSelect = overlay.querySelector('[name="profile_id"]');
      const profilePercentage = profileSelect
        ? Number(profileSelect.selectedOptions[0]?.dataset.percentage || 0)
        : Number(client.profiles?.percentage || 0);
      const profileName = profileSelect
        ? String(profileSelect.value ? profileSelect.selectedOptions[0]?.textContent || '' : '').trim()
        : String(client.profiles?.name || '').trim();
      const advance = Math.max(Number(overlay.querySelector('[name="advance_amount"]')?.value ?? client.advance_amount ?? 0), 0);
      const payment = calculateClientPayment(price, predefinedPrice, discount, advance);
      const finalPrice = payment.total;
      const checkedPaymentStatus = overlay.querySelector('[name="payment_status"]:checked')?.value;
      const paymentStatus = normalizePaymentStatus(checkedPaymentStatus, payment.amountDue, payment.total);
      const totalOnlyPayment = isTotalOnlyPayment(price, predefinedPrice, advance);
      const amountDue = paymentStatus === 'incasati'
        ? 0
        : displayAmountDueForPayment(
            price,
            predefinedPrice,
            amountDueByPaymentStatus(payment.amountDue, paymentStatus),
            advance
          );
      const collected = finalPrice;
      const currency = currencyCode(overlay.querySelector('[name="currency_code"]')?.value ?? client.currency_code);
      const profileAmount = collected * (profilePercentage / 100);
      return {
        finalPrice,
        collected,
        advance,
        amountDue,
        rawAmountDue: payment.amountDue,
        totalOnlyPayment,
        paymentStatus,
        currency,
        profileAmount,
        profilePercentage,
        profileName,
        parts,
        customExpenses,
        baseBeforeCollaborators: Math.max(collected - profileAmount - parts - customExpenses, 0),
      };
    };
    const calculateCollaboratorDistribution = (context = readFinancialContext()) => {
      const parsedRows = collaboratorRows().map((row) => {
        const input = row.querySelector('.client-collaborator-cost-input');
        const typeSelect = row.querySelector('.client-collaborator-cost-type');
        const costType = typeSelect?.value === 'percentage' ? 'percentage' : 'fixed';
        const rawValue = Math.max(Number(input?.value || 0), 0);
        return {
          row,
          input,
          costType,
          collaborator_id: input?.dataset.collaboratorId || '',
          percentage: costType === 'percentage' ? Math.min(100, rawValue) : 0,
          fixedCost: costType === 'fixed' ? rawValue : 0,
          paymentStatus: row.querySelector('.client-collaborator-payment-status')?.value === 'incasati' ? 'incasati' : 'de_incasat',
        };
      }).filter((item) => item.collaborator_id);
      const fixedTotal = parsedRows.reduce((sum, item) => sum + item.fixedCost, 0);
      const percentageNetBase = Math.max(context.baseBeforeCollaborators - fixedTotal, 0);
      const items = parsedRows.map((item) => {
        const cost = item.costType === 'percentage'
          ? percentageNetBase * (item.percentage / 100)
          : item.fixedCost;
        const unit = item.row.querySelector('.client-collaborator-unit');
        const payout = item.row.querySelector('.client-collaborator-payout strong');
        if (unit) unit.textContent = item.costType === 'percentage' ? '%' : context.currency;
        if (payout) payout.textContent = fmtMoney(cost, context.currency);
        return {
          collaborator_id: item.collaborator_id,
          cost_type: item.costType,
          percentage: item.percentage,
          cost,
          payment_status: item.paymentStatus,
        };
      });
      return {
        items,
        percentageNetBase,
        total: items.reduce((sum, item) => sum + item.cost, 0),
      };
    };
    const refreshFinancialSummary = () => {
      const context = readFinancialContext();
      const laborDistribution = calculateCollaboratorDistribution(context);
      const totalInput = overlay.querySelector('input[name="manopera_colaboratori"]');
      const hasCollaboratorRows = collaboratorRows().length > 0;
      const rawInternalLabor = totalInput?.value;
      const displayedLabor = Math.max(Number(overlay.querySelector('[name="service_labor_price"]')?.value ?? client.service_labor_price ?? 0), 0);
      const labor = hasCollaboratorRows
        ? laborDistribution.total
        : (rawInternalLabor === undefined || String(rawInternalLabor).trim() === ''
          ? displayedLabor
          : Math.max(Number(rawInternalLabor || 0), 0));
      const customExpenses = context.customExpenses;
      const expenseTotalInput = overlay.querySelector('input[name="alte_cheltuieli"]');
      if (totalInput && hasCollaboratorRows) totalInput.value = String(labor);
      if (expenseTotalInput && (expenseInputs().length > 0 || client.alte_cheltuieli !== null)) {
        expenseTotalInput.value = String(customExpenses);
      }
      const laborTotalValue = overlay.querySelector('#client-labor-total');
      const expenseTotalValue = overlay.querySelector('#client-expense-total');
      if (laborTotalValue) laborTotalValue.textContent = fmtMoney(labor, context.currency);
      if (expenseTotalValue) expenseTotalValue.textContent = fmtMoney(customExpenses, context.currency);
      const gtrotsAmount = context.collected - context.profileAmount - labor - context.parts - customExpenses;
      const values = {
        'client-modal-total-price': context.finalPrice,
        'client-modal-final-price': context.amountDue,
        'client-modal-profile-amount': context.profileAmount,
        'client-modal-labor-amount': labor,
        'client-modal-expenses-amount': customExpenses,
        'client-modal-gtrots-amount': gtrotsAmount,
      };
      Object.entries(values).forEach(([id, value]) => {
        const element = overlay.querySelector(`#${id}`);
        if (element) element.textContent = fmtMoney(value, context.currency);
      });
      const amountDueInput = overlay.querySelector('[name="amount_due_display"]');
      if (amountDueInput) amountDueInput.value = fmtMoney(context.amountDue, context.currency);
      if (!context.totalOnlyPayment && context.rawAmountDue <= 0.00001 && context.finalPrice > 0) {
        const paidRadio = overlay.querySelector('[name="payment_status"][value="incasati"]');
        if (paidRadio) paidRadio.checked = true;
      }
      const amountDueLabel = amountDueInput?.closest('.client-action-field')?.querySelector('span');
      if (amountDueLabel) amountDueLabel.textContent = 'Rest de plata';
      const totalSummary = overlay.querySelector('#client-modal-total-price')?.closest('.client-action-financial-value')?.querySelector('span');
      if (totalSummary) totalSummary.textContent = 'Total de plata';
      const dueSummary = overlay.querySelector('#client-modal-final-price')?.closest('.client-action-financial-value')?.querySelector('span');
      if (dueSummary) dueSummary.textContent = 'Rest de plata';
      overlay.querySelectorAll('.client-money-unit').forEach((element) => {
        element.textContent = context.currency;
      });
      const profileSummary = overlay.querySelector('#client-modal-profile-summary');
      const profileLabel = overlay.querySelector('#client-modal-profile-label');
      if (profileSummary) profileSummary.hidden = !context.profileName;
      if (profileLabel && context.profileName) {
        profileLabel.textContent = `${context.profileName} (${context.profilePercentage}%)`;
      }
      const laborSummary = overlay.querySelector('#client-modal-labor-summary');
      if (laborSummary) laborSummary.hidden = labor <= 0;
      const expensesSummary = overlay.querySelector('#client-modal-expenses-summary');
      if (expensesSummary) expensesSummary.hidden = customExpenses <= 0;
      overlay.querySelector('#client-modal-gtrots-amount')?.classList.toggle('negative', gtrotsAmount < 0);
    };
    const priceInput = overlay.querySelector('input[name="price"]');
    const predefinedPriceInput = overlay.querySelector('input[name="predefined_price"]');
    let lastPredefinedPriceValue = Number(client.predefined_price || 0);
    priceInput?.addEventListener('input', () => {
      refreshFinancialSummary();
    });
    predefinedPriceInput?.addEventListener('input', () => {
      const currentPrice = Number(priceInput?.value || 0);
      const nextPredefined = Number(predefinedPriceInput.value || 0);
      const shouldMirrorToWorkPrice =
        nextPredefined > 0
        && (currentPrice <= 0 || Math.abs(currentPrice - lastPredefinedPriceValue) < 0.01);
      if (shouldMirrorToWorkPrice && priceInput) {
        priceInput.value = predefinedPriceInput.value;
      }
      lastPredefinedPriceValue = nextPredefined;
      refreshFinancialSummary();
    });
    const refreshLaborTotal = () => {
      refreshFinancialSummary();
    };
    const refreshExpenseTotal = () => {
      refreshFinancialSummary();
    };
    const wireLaborInputs = () => {
      collaboratorInputs().forEach((input) => {
        if (input.dataset.totalWired === 'true') return;
        input.dataset.totalWired = 'true';
        input.addEventListener('input', refreshLaborTotal);
      });
      overlay.querySelectorAll('.client-collaborator-cost-type').forEach((select) => {
        if (select.dataset.totalWired === 'true') return;
        select.dataset.totalWired = 'true';
        select.addEventListener('change', () => {
          const row = select.closest('.client-labor-editor-row');
          const input = row?.querySelector('.client-collaborator-cost-input');
          if (input && select.value === 'percentage' && Number(input.value || 0) <= 0) {
            input.value = input.dataset.defaultPercentage || '0';
          }
          refreshLaborTotal();
        });
      });
      overlay.querySelectorAll('.client-collaborator-payment-status').forEach((select) => {
        const refreshPaymentClass = () => {
          select.classList.toggle('paid', select.value === 'incasati');
          select.classList.toggle('hold', select.value !== 'incasati');
        };
        refreshPaymentClass();
        if (select.dataset.totalWired === 'true') return;
        select.dataset.totalWired = 'true';
        select.addEventListener('change', () => {
          refreshPaymentClass();
          refreshLaborTotal();
        });
      });
      overlay.querySelectorAll('.client-labor-selected-remove:not(.client-expense-selected-remove)').forEach((button) => {
        if (button.dataset.removeWired === 'true') return;
        button.dataset.removeWired = 'true';
        button.addEventListener('click', () => {
          button.closest('.client-labor-editor-row')?.remove();
          refreshLaborPicker();
          refreshLaborTotal();
        });
      });
    };
    const laborPicker = overlay.querySelector('#client-labor-picker');
    const laborSearch = overlay.querySelector('#client-labor-search');
    const laborOptions = overlay.querySelector('#client-labor-options');
    const laborSelectedList = overlay.querySelector('#client-labor-selected-list');
    const selectedCollaboratorIds = () => new Set(
      collaboratorInputs().map((input) => String(input.dataset.collaboratorId || ''))
    );
    const refreshLaborPicker = () => {
      const query = String(laborSearch?.value || '').trim().toLowerCase();
      const selectedIds = selectedCollaboratorIds();
      if (laborOptions) {
        laborOptions.innerHTML = collaborators
          .filter((collaborator) => !selectedIds.has(String(collaborator.id)))
          .filter((collaborator) => !query || [
            collaborator.name,
            collaborator.role,
            collaborator.phone,
            collaborator.email,
          ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
          .map((collaborator) => renderCollaboratorPickerOption(collaborator))
          .join('') || `
            <div class="client-labor-picker-empty">
              ${collaborators.length ? 'Toti colaboratorii potriviti sunt deja adaugati.' : 'Nu exista colaboratori in Setari.'}
            </div>
          `;
        laborOptions.querySelectorAll('.client-labor-picker-option').forEach((button) => {
          button.addEventListener('click', () => {
            const collaborator = collaborators.find((item) => String(item.id) === String(button.dataset.collaboratorId));
            if (!collaborator || selectedCollaboratorIds().has(String(collaborator.id))) return;
            laborSelectedList?.insertAdjacentHTML('beforeend', renderSelectedCollaboratorRow(
              collaborator,
              {
                cost_type: Number(collaborator.percentage || 0) > 0 ? 'percentage' : 'fixed',
                percentage: Number(collaborator.percentage || 0),
                cost: 0,
                payment_status: 'de_incasat',
              },
              false,
              overlay.querySelector('[name="currency_code"]')?.value
            ));
            wireLaborInputs();
            refreshLaborPicker();
            refreshLaborTotal();
          });
        });
      }
      const empty = overlay.querySelector('#client-labor-selected-empty');
      if (empty) empty.hidden = collaboratorInputs().length > 0;
    };
    const wireExpenseInputs = () => {
      expenseInputs().forEach((input) => {
        if (input.dataset.totalWired === 'true') return;
        input.dataset.totalWired = 'true';
        input.addEventListener('input', refreshExpenseTotal);
      });
      overlay.querySelectorAll('.client-expense-selected-remove').forEach((button) => {
        if (button.dataset.removeWired === 'true') return;
        button.dataset.removeWired = 'true';
        button.addEventListener('click', () => {
          button.closest('.client-expense-editor-row')?.remove();
          refreshExpensePicker();
          refreshExpenseTotal();
        });
      });
    };
    const expensePicker = overlay.querySelector('#client-expense-picker');
    const expenseSearch = overlay.querySelector('#client-expense-search');
    const expenseOptions = overlay.querySelector('#client-expense-options');
    const expenseSelectedList = overlay.querySelector('#client-expense-selected-list');
    const expenseCreatePanel = overlay.querySelector('#client-expense-create-panel');
    const expenseCreateName = overlay.querySelector('#client-expense-create-name');
    const expenseCreateError = overlay.querySelector('#client-expense-create-error');
    const expenseCreateSave = overlay.querySelector('#client-expense-create-save');
    let expenseCreateColor = EXPENSE_COLOR_OPTIONS[0];
    const selectedExpenseIds = () => new Set(
      expenseInputs().map((input) => String(input.dataset.expenseId || ''))
    );
    const selectExpenseCreateColor = (color) => {
      expenseCreateColor = EXPENSE_COLOR_OPTIONS.includes(color) ? color : EXPENSE_COLOR_OPTIONS[0];
      expenseCreatePanel?.querySelectorAll('.client-expense-color-option').forEach((button) => {
        const selected = button.dataset.color === expenseCreateColor;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      const preview = expenseCreatePanel?.querySelector('.client-expense-create-preview');
      if (preview) preview.style.setProperty('--expense-preview-color', expenseCreateColor);
    };
    const openExpenseCreatePanel = (name) => {
      if (!expenseCreatePanel || !expenseCreateName || !['admin', 'manager'].includes(role)) return;
      expenseOptions?.setAttribute('hidden', '');
      expenseCreatePanel.hidden = false;
      expenseCreateName.value = String(name || '').trim().replace(/\s+/g, ' ');
      if (expenseCreateError) {
        expenseCreateError.textContent = '';
        expenseCreateError.hidden = true;
      }
      selectExpenseCreateColor(EXPENSE_COLOR_OPTIONS[0]);
      expenseCreateName.focus();
      expenseCreateName.select();
      requestAnimationFrame(() => expenseCreatePanel.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    };
    const closeExpenseCreatePanel = () => {
      if (expenseCreatePanel) expenseCreatePanel.hidden = true;
      expenseOptions?.removeAttribute('hidden');
      if (expenseCreateError) {
        expenseCreateError.textContent = '';
        expenseCreateError.hidden = true;
      }
      refreshExpensePicker();
      expenseSearch?.focus();
    };
    const refreshExpensePicker = () => {
      const rawQuery = String(expenseSearch?.value || '').trim().replace(/\s+/g, ' ');
      const query = rawQuery.toLocaleLowerCase('ro');
      const selectedIds = selectedExpenseIds();
      if (expenseOptions) {
        const matchingOptions = expenseCategories
          .filter((expense) => !selectedIds.has(String(expense.id)))
          .filter((expense) => !query || String(expense.name || '').toLocaleLowerCase('ro').includes(query));
        const exactMatchExists = expenseCategories.some(
          (expense) => String(expense.name || '').trim().toLocaleLowerCase('ro') === query
        );
        const canCreate = ['admin', 'manager'].includes(role) && rawQuery && !exactMatchExists;
        const optionHtml = matchingOptions.map((expense) => renderExpensePickerOption(expense)).join('');
        const createHtml = canCreate ? renderExpenseCreateOption(rawQuery) : '';
        expenseOptions.innerHTML = optionHtml + createHtml || `
            <div class="client-labor-picker-empty">
              ${rawQuery
                ? (exactMatchExists ? 'Cheltuiala exista deja sau este deja adaugata.' : 'Nu exista rezultate.')
                : (expenseCategories.length ? 'Toate cheltuielile sunt deja adaugate.' : 'Nu exista cheltuieli in Setari.')}
            </div>
          `;
        expenseOptions.querySelectorAll('.client-expense-picker-option').forEach((button) => {
          button.addEventListener('click', () => {
            const expense = expenseCategories.find((item) => String(item.id) === String(button.dataset.expenseId));
            if (!expense || selectedExpenseIds().has(String(expense.id))) return;
            expenseSelectedList?.insertAdjacentHTML('beforeend', renderSelectedExpenseRow(
              expense,
              '',
              false,
              overlay.querySelector('[name="currency_code"]')?.value
            ));
            wireExpenseInputs();
            refreshExpensePicker();
            refreshExpenseTotal();
          });
        });
        expenseOptions.querySelectorAll('.client-expense-create-option').forEach((button) => {
          button.addEventListener('click', () => openExpenseCreatePanel(button.dataset.expenseName));
        });
      }
      const empty = overlay.querySelector('#client-expense-selected-empty');
      if (empty) empty.hidden = expenseInputs().length > 0;
    };
    wireLaborInputs();
    overlay.querySelector('#client-labor-add-toggle')?.addEventListener('click', () => {
      laborPicker?.toggleAttribute('hidden');
      if (laborPicker && !laborPicker.hasAttribute('hidden')) {
        refreshLaborPicker();
        laborSearch?.focus();
      }
    });
    laborSearch?.addEventListener('input', refreshLaborPicker);
    wireExpenseInputs();
    overlay.querySelector('#client-expense-add-toggle')?.addEventListener('click', () => {
      expensePicker?.toggleAttribute('hidden');
      if (expensePicker && !expensePicker.hasAttribute('hidden')) {
        if (expenseCreatePanel) expenseCreatePanel.hidden = true;
        expenseOptions?.removeAttribute('hidden');
        refreshExpensePicker();
        expenseSearch?.focus();
      }
    });
    expenseSearch?.addEventListener('input', refreshExpensePicker);
    expenseCreatePanel?.querySelectorAll('.client-expense-color-option').forEach((button) => {
      button.addEventListener('click', () => selectExpenseCreateColor(button.dataset.color));
    });
    expenseCreatePanel?.querySelector('#client-expense-create-back')?.addEventListener('click', closeExpenseCreatePanel);
    expenseCreateName?.addEventListener('input', () => {
      const previewName = expenseCreatePanel?.querySelector('#client-expense-create-preview-name');
      if (previewName) previewName.textContent = String(expenseCreateName.value || '').trim() || 'Cheltuiala noua';
      if (expenseCreateError) expenseCreateError.hidden = true;
    });
    expenseCreateSave?.addEventListener('click', async () => {
      const name = String(expenseCreateName?.value || '').trim().replace(/\s+/g, ' ');
      if (!name || !['admin', 'manager'].includes(role)) {
        if (expenseCreateError) {
          expenseCreateError.textContent = 'Completeaza denumirea cheltuielii.';
          expenseCreateError.hidden = false;
        }
        return;
      }
      expenseCreateSave.disabled = true;
      expenseCreateSave.classList.add('loading');
      if (expenseCreateError) expenseCreateError.hidden = true;
      try {
        const token = window.AUTH?.getToken?.() || '';
        const created = await window.API.createExpenseCategory(token, { name, color: expenseCreateColor });
        const existingIndex = expenseCategories.findIndex((expense) => String(expense.id) === String(created.id));
        if (existingIndex >= 0) expenseCategories[existingIndex] = created;
        else expenseCategories.push(created);
        if (!selectedExpenseIds().has(String(created.id))) {
          expenseSelectedList?.insertAdjacentHTML('beforeend', renderSelectedExpenseRow(
            created,
            '',
            false,
            overlay.querySelector('[name="currency_code"]')?.value
          ));
        }
        wireExpenseInputs();
        refreshExpenseTotal();
        if (expenseSearch) expenseSearch.value = '';
        if (expenseCreatePanel) expenseCreatePanel.hidden = true;
        expenseOptions?.removeAttribute('hidden');
        expensePicker?.setAttribute('hidden', '');
        refreshExpensePicker();
        window.dispatchEvent(new CustomEvent('expense-categories-change', { detail: { expense: created } }));
        window.BUSINESS_UI?.showToast?.(`Cheltuiala "${created.name}" a fost salvata si selectata.`, 'success');
      } catch (error) {
        if (expenseCreateError) {
          expenseCreateError.textContent = error.message || 'Cheltuiala nu a putut fi salvata.';
          expenseCreateError.hidden = false;
        }
      } finally {
        expenseCreateSave.disabled = false;
        expenseCreateSave.classList.remove('loading');
      }
    });
    overlay.querySelectorAll('[name="price"], [name="predefined_price"], [name="advance_amount"], [name="currency_code"], [name="discount_percentage"], [name="valoare_piese"], [name="service_parts_price"], [name="service_labor_price"], [name="profile_id"], [name="payment_status"]')
      .forEach((input) => input.addEventListener('input', refreshFinancialSummary));
    refreshLaborPicker();
    refreshLaborTotal();
    refreshExpensePicker();
    refreshExpenseTotal();
    refreshFinancialSummary();
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorEl.textContent = '';
      const payload = clientToPayload(client, new FormData(form));
      if (isAdmin && mode === 'edit') {
        payload.qr_used = String(new FormData(form).get('qr_usage_status') || 'unused') === 'used';
      }
      payload.collaborator_costs = calculateCollaboratorDistribution().items;
      if (payload.collaborator_costs.length) {
        payload.manopera_colaboratori = payload.collaborator_costs
          .reduce((total, item) => total + item.cost, 0);
      }
      payload.expense_costs = expenseInputs()
        .map((input) => ({
          expense_id: input.dataset.expenseId,
          cost: Math.max(Number(input.value || 0), 0),
        }))
        .filter((item) => item.expense_id);
      if (payload.expense_costs.length) {
        payload.alte_cheltuieli = payload.expense_costs
          .reduce((total, item) => total + item.cost, 0);
      }
      const error = validateClientPayload(payload, mode);
      if (error) {
        errorEl.textContent = error;
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const token = window.AUTH?.getToken?.() || '';
        const updated = mode === 'add'
          ? await window.API.createClient(token, payload)
          : (mode === 'finalize'
            ? await window.API.finalizeClient(token, client.id, payload)
            : await window.API.updateClient(token, client.id, payload));
        close();
        upsertClient(updated);
        selectClient(updated);
        window.BUSINESS_UI?.showToast?.(
          mode === 'add' ? 'Client adaugat.' : (mode === 'finalize' ? 'Client finalizat.' : 'Client actualizat.'),
          'success'
        );
        window.dispatchEvent(new CustomEvent('clients-change'));
      } catch (error) {
        errorEl.textContent = error.message || 'Actiunea nu a putut fi salvata.';
        submitBtn.disabled = false;
      }
    });
  }

  function clientActionField(label, name, value, type = 'text', disabled = false) {
    return `<label class="client-action-field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value ?? '')}" ${type === 'number' ? 'step="0.01"' : ''} ${disabled ? 'disabled' : ''} />
    </label>`;
  }

  function clientActionFinancialValue(label, id, tone = '') {
    return `<div class="client-action-financial-value ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong id="${escapeHtml(id)}">0.00 RON</strong>
    </div>`;
  }

  function clientPaymentStatusControl(status = 'de_incasat', disabled = false) {
    const current = normalizePaymentStatus(status);
    const disabledAttr = disabled ? 'disabled' : '';
    return `
      <div class="client-action-field client-payment-status-field">
        <span>Status plata</span>
        <div class="client-payment-status-options">
          <label class="service-check">
            <input name="payment_status" type="radio" value="de_incasat" ${current !== 'incasati' ? 'checked' : ''} ${disabledAttr} />
            <span>Neachitat</span>
          </label>
          <label class="service-check">
            <input name="payment_status" type="radio" value="incasati" ${current === 'incasati' ? 'checked' : ''} ${disabledAttr} />
            <span>Achitat</span>
          </label>
        </div>
      </div>
    `;
  }

  function renderPricePresetControls(client, disabled = false) {
    const price = Number(client.price || 0);
    const predefinedPrice = Number(client.predefined_price || 0);
    const disabledAttr = disabled ? 'disabled' : '';
    const selectedPreset = pricePresets.find(
      (preset) => Number(preset.price || 0) === predefinedPrice
    ) || pricePresets[0];
    const predefinedLabel = selectedPreset?.label || 'Pret predefinit';
    return `
      <div class="client-price-control full">
        <label class="client-action-field client-price-main-field">
          <span>Pret lucrare</span>
          <input name="price" type="number" value="${escapeHtml(price)}" min="0" step="0.01" ${disabledAttr} />
        </label>
        <label class="client-action-field client-price-main-field">
          <span>${escapeHtml(predefinedLabel)}</span>
          <input name="predefined_price" type="number" value="${escapeHtml(predefinedPrice)}" min="0" step="0.01" ${disabledAttr} />
        </label>
      </div>
    `;
  }

  function renderCollaboratorCostEditor(collaborators, client, disabled = false) {
    const existingCosts = new Map(
      (Array.isArray(client.collaborator_costs) ? client.collaborator_costs : [])
        .map((item) => [String(item.collaborator_id || ''), item])
    );
    const selectedCollaborators = collaborators.filter((collaborator) => existingCosts.has(String(collaborator.id)));
    const total = selectedCollaborators.reduce(
      (sum, collaborator) => sum + Number(existingCosts.get(String(collaborator.id))?.cost || 0), 0
    );

    return `
      <section class="client-labor-editor">
        <div class="client-labor-editor-head">
          <div>
            <span class="client-labor-editor-kicker">Distributie costuri</span>
            <strong>Manopera colaboratori</strong>
          </div>
          <div class="client-labor-editor-head-actions">
            <button type="button" class="client-labor-add-toggle" id="client-labor-add-toggle" ${disabled ? 'disabled' : ''}>+ Adauga colaborator</button>
            <div class="client-labor-editor-total">
              <span>Total manopera</span>
              <strong id="client-labor-total">${escapeHtml(fmtMoney(total))}</strong>
            </div>
          </div>
        </div>
        <input type="hidden" name="manopera_colaboratori" value="${escapeHtml(selectedCollaborators.length ? total : (client.manopera_colaboratori ?? ''))}" />
        <div class="client-labor-picker" id="client-labor-picker" hidden>
          <div class="client-labor-picker-search">
            <span>${clientDetailIcon('search')}</span>
            <input id="client-labor-search" type="search" placeholder="Cauta dupa nume, rol, telefon sau email" ${disabled ? 'disabled' : ''} />
          </div>
          <div class="client-labor-picker-options" id="client-labor-options"></div>
        </div>
        <div class="client-labor-editor-list" id="client-labor-selected-list">
          ${selectedCollaborators.map((collaborator) =>
            renderSelectedCollaboratorRow(collaborator, existingCosts.get(String(collaborator.id)) || {}, disabled, client.currency_code)
          ).join('')}
          <div class="client-labor-editor-empty" id="client-labor-selected-empty" ${selectedCollaborators.length ? 'hidden' : ''}>
            Nu ai adaugat niciun colaborator. Foloseste butonul "Adauga colaborator".
          </div>
        </div>
      </section>
    `;
  }

  function renderSelectedCollaboratorRow(collaborator, costItem = {}, disabled = false, currency = 'RON') {
    const defaultPercentage = Math.max(0, Math.min(100, Number(collaborator.percentage || 0)));
    const costType = costItem.cost_type === 'percentage'
      ? 'percentage'
      : (costItem.cost_type === 'fixed' || Object.keys(costItem).length
        ? 'fixed'
        : (defaultPercentage > 0 ? 'percentage' : 'fixed'));
    const percentage = Math.max(0, Math.min(100, Number(costItem.percentage ?? defaultPercentage)));
    const fixedCost = Math.max(Number(costItem.cost || 0), 0);
    const paymentStatus = costItem.payment_status === 'incasati' ? 'incasati' : 'de_incasat';
    return `
      <div class="client-labor-editor-row">
        <span class="client-labor-editor-person">
          <i style="--collaborator-color:${escapeHtml(collaborator.color || '#ff6b00')}"></i>
          <span>
            <strong>${escapeHtml(collaborator.name)}</strong>
            <small>${escapeHtml(collaborator.role || 'Colaborator')}</small>
          </span>
        </span>
        <span class="client-labor-editor-controls">
          <select class="client-collaborator-cost-type" ${disabled ? 'disabled' : ''}>
            <option value="fixed" ${costType === 'fixed' ? 'selected' : ''}>Suma fixa</option>
            <option value="percentage" ${costType === 'percentage' ? 'selected' : ''}>Procent NET</option>
          </select>
          <span class="client-labor-editor-input">
            <input
              class="client-collaborator-cost-input"
              data-collaborator-id="${escapeHtml(collaborator.id)}"
              data-default-percentage="${escapeHtml(defaultPercentage)}"
              type="number"
              min="0"
              step="0.01"
              value="${escapeHtml(costType === 'percentage' ? percentage : fixedCost)}"
              placeholder="0.00"
              ${disabled ? 'disabled' : ''}
            />
            <em class="client-collaborator-unit">${costType === 'percentage' ? '%' : escapeHtml(currencyCode(currency))}</em>
          </span>
          <span class="client-collaborator-payout">
            <small>Castig</small>
            <strong>${escapeHtml(fmtMoney(fixedCost, currencyCode(currency)))}</strong>
          </span>
          <select class="client-collaborator-payment-status ${paymentStatus === 'incasati' ? 'paid' : 'hold'}" ${disabled ? 'disabled' : ''}>
            <option value="de_incasat" ${paymentStatus !== 'incasati' ? 'selected' : ''}>Neachitat</option>
            <option value="incasati" ${paymentStatus === 'incasati' ? 'selected' : ''}>Achitat</option>
          </select>
          <button type="button" class="client-labor-selected-remove" title="Elimina din manopera" aria-label="Elimina din manopera" ${disabled ? 'disabled' : ''}>${clientActionIcon('delete')}</button>
        </span>
      </div>
    `;
  }

  function renderCollaboratorPickerOption(collaborator) {
    return `
      <button type="button" class="client-labor-picker-option" data-collaborator-id="${escapeHtml(collaborator.id)}">
        <i style="--collaborator-color:${escapeHtml(collaborator.color || '#ff6b00')}"></i>
        <span>
          <strong>${escapeHtml(collaborator.name)}</strong>
          <small>${escapeHtml([
            collaborator.role || 'Colaborator',
            collaborator.phone || '',
            collaborator.email || '',
          ].filter(Boolean).join(' - '))}${Number(collaborator.percentage || 0) > 0 ? ` · ${escapeHtml(Number(collaborator.percentage).toFixed(2))}% NET` : ''}</small>
        </span>
        <b>+</b>
      </button>
    `;
  }

  function renderExpenseCostEditor(expenses, client, disabled = false) {
    const existingCosts = new Map(
      (Array.isArray(client.expense_costs) ? client.expense_costs : [])
        .map((item) => [String(item.expense_id || ''), Number(item.cost || 0)])
    );
    const selectedExpenses = expenses.filter((expense) => existingCosts.has(String(expense.id)));
    const preservedTotal = (Array.isArray(client.expense_costs) ? client.expense_costs : [])
      .filter((item) => !item.expense_id)
      .reduce((sum, item) => sum + Math.max(Number(item.cost || 0), 0), 0);
    const total = preservedTotal + selectedExpenses.reduce(
      (sum, expense) => sum + (existingCosts.get(String(expense.id)) || 0),
      0
    );

    return `
      <section class="client-labor-editor client-expense-editor">
        <div class="client-labor-editor-head">
          <div>
            <span class="client-labor-editor-kicker">Costuri suplimentare</span>
            <strong>Cheltuieli</strong>
          </div>
          <div class="client-labor-editor-head-actions">
            <button type="button" class="client-labor-add-toggle" id="client-expense-add-toggle" ${disabled ? 'disabled' : ''}>+ Adauga cheltuiala</button>
            <div class="client-labor-editor-total">
              <span>Total cheltuieli</span>
              <strong id="client-expense-total">${escapeHtml(fmtMoney(total))}</strong>
            </div>
          </div>
        </div>
        <input type="hidden" name="alte_cheltuieli" value="${escapeHtml(selectedExpenses.length || preservedTotal > 0 || client.alte_cheltuieli !== null ? total : '')}" />
        <div class="client-labor-picker" id="client-expense-picker" hidden>
          <div class="client-labor-picker-search">
            <span>${clientDetailIcon('search')}</span>
            <input id="client-expense-search" type="search" placeholder="Cauta cheltuiala configurata" ${disabled ? 'disabled' : ''} />
          </div>
          <div class="client-labor-picker-options" id="client-expense-options"></div>
          ${!disabled ? renderExpenseCreatePanel() : ''}
        </div>
        <div class="client-labor-editor-list" id="client-expense-selected-list">
          ${selectedExpenses.map((expense) =>
            renderSelectedExpenseRow(expense, existingCosts.get(String(expense.id)) || '', disabled, client.currency_code)
          ).join('')}
          <div class="client-labor-editor-empty" id="client-expense-selected-empty" ${selectedExpenses.length ? 'hidden' : ''}>
            Nu ai adaugat nicio cheltuiala. Foloseste butonul "Adauga cheltuiala".
          </div>
        </div>
      </section>
    `;
  }

  function renderSelectedExpenseRow(expense, cost = '', disabled = false, currency = 'RON') {
    return `
      <div class="client-labor-editor-row client-expense-editor-row">
        <span class="client-labor-editor-person">
          <i style="--collaborator-color:${escapeHtml(expense.color || '#EF4444')}"></i>
          <span>
            <strong>${escapeHtml(expense.name)}</strong>
            <small>Cheltuiala personalizata</small>
          </span>
        </span>
        <span class="client-labor-editor-controls">
          <span class="client-labor-editor-input">
            <input
              class="client-expense-cost-input"
              data-expense-id="${escapeHtml(expense.id)}"
              type="number"
              min="0"
              step="0.01"
              value="${escapeHtml(cost)}"
              placeholder="0.00"
              ${disabled ? 'disabled' : ''}
            />
            <em class="client-money-unit">${escapeHtml(currencyCode(currency))}</em>
          </span>
          <button type="button" class="client-labor-selected-remove client-expense-selected-remove" title="Elimina cheltuiala" aria-label="Elimina cheltuiala" ${disabled ? 'disabled' : ''}>${clientActionIcon('delete')}</button>
        </span>
      </div>
    `;
  }

  function renderExpensePickerOption(expense) {
    return `
      <button type="button" class="client-labor-picker-option client-expense-picker-option" data-expense-id="${escapeHtml(expense.id)}">
        <i style="--collaborator-color:${escapeHtml(expense.color || '#EF4444')}"></i>
        <span>
          <strong>${escapeHtml(expense.name)}</strong>
          <small>Din Setari</small>
        </span>
        <b>+</b>
      </button>
    `;
  }

  function renderExpenseCreateOption(name) {
    return `
      <button type="button" class="client-labor-picker-option client-expense-create-option" data-expense-name="${escapeHtml(name)}">
        <i class="client-expense-create-option-icon">+</i>
        <span>
          <strong>Adauga cheltuiala &bdquo;${escapeHtml(name)}&rdquo;</strong>
          <small>Salveaza categoria si in Setari</small>
        </span>
        <b>+</b>
      </button>
    `;
  }

  function renderExpenseCreatePanel() {
    return `
      <div class="client-expense-create-panel" id="client-expense-create-panel" hidden>
        <div class="client-expense-create-head">
          <button type="button" class="client-expense-create-back" id="client-expense-create-back" aria-label="Inapoi">&larr;</button>
          <span>
            <strong>Cheltuiala noua</strong>
            <small>Va fi salvata automat si in Setari</small>
          </span>
        </div>
        <label class="client-expense-create-field">
          <span>Denumire</span>
          <input id="client-expense-create-name" type="text" maxlength="100" placeholder="Denumirea cheltuielii" autocomplete="off" />
        </label>
        <div class="client-expense-create-color-label">Alege culoarea</div>
        <div class="client-expense-color-grid">
          ${EXPENSE_COLOR_OPTIONS.map((color, index) => `
            <button
              type="button"
              class="client-expense-color-option ${index === 0 ? 'selected' : ''}"
              style="--expense-color:${escapeHtml(color)}"
              data-color="${escapeHtml(color)}"
              aria-label="Culoare ${escapeHtml(color)}"
              aria-pressed="${index === 0 ? 'true' : 'false'}"
            ><span>&#10003;</span></button>
          `).join('')}
        </div>
        <div class="client-expense-create-preview" style="--expense-preview-color:${escapeHtml(EXPENSE_COLOR_OPTIONS[0])}">
          <i></i>
          <span><small>Previzualizare</small><strong id="client-expense-create-preview-name">Cheltuiala noua</strong></span>
        </div>
        <div class="client-expense-create-error" id="client-expense-create-error" hidden></div>
        <button type="button" class="client-expense-create-save" id="client-expense-create-save">
          <b>+</b><span>Adauga si selecteaza</span>
        </button>
      </div>
    `;
  }

  function upsertClient(client) {
    const index = allClients.findIndex((item) => item.id === client.id);
    if (index >= 0) allClients[index] = client;
    else allClients.unshift(client);
  }

  function closeClientDeleteModal(confirmed = false) {
    if (!clientDeleteModal || clientDeleteModal.hidden) return;
    clientDeleteModal.classList.remove('visible');
    const resolver = clientDeleteResolver;
    clientDeleteResolver = null;
    setTimeout(() => {
      clientDeleteModal.hidden = true;
      resolver?.(confirmed);
    }, 180);
  }

  function confirmClientDelete(client) {
    if (!clientDeleteModal) {
      return Promise.resolve(window.confirm(`Stergi clientul "${client.name}"? Actiunea nu poate fi anulata.`));
    }

    if (clientDeleteResolver) clientDeleteResolver(false);
    clientDeleteAvatar.textContent = initials(client.name);
    clientDeleteName.textContent = client.name || 'Client';
    clientDeleteSubtitle.textContent = client.is_finalized
      ? 'Client finalizat - stergerea este definitiva.'
      : 'Client activ - stergerea este definitiva.';
    clientDeletePhone.textContent = client.phone || '-';
    clientDeleteQr.textContent = client.qr_code || '-';
    clientDeleteStatus.textContent = client.is_finalized
      ? 'Finalizat'
      : (STATUS_LABEL[client.status] || 'Activ');

    return new Promise((resolve) => {
      clientDeleteResolver = resolve;
      clientDeleteModal.hidden = false;
      requestAnimationFrame(() => clientDeleteModal.classList.add('visible'));
      clientDeleteModalConfirm?.focus();
    });
  }

  async function deleteSelectedClient(client) {
    if (!await confirmClientDelete(client)) return;
    try {
      await window.API.deleteClient(window.AUTH?.getToken?.() || '', client.id);
      allClients = allClients.filter((item) => item.id !== client.id);
      selected = allClients[0] || null;
      renderList(filter(allClients));
      if (selected) selectClient(selected);
      else detailEl.innerHTML = '<div class="empty-state">Selectati un client</div>';
      window.BUSINESS_UI?.showToast?.('Client sters.', 'success');
      window.dispatchEvent(new CustomEvent('clients-change'));
    } catch (error) {
      window.BUSINESS_UI?.showToast?.(error.message || 'Clientul nu a putut fi sters.', 'error');
    }
  }

  async function openWhatsAppPresetModal(client) {
    whatsappPresetTitle.textContent = `Mesaj catre ${client.name}`;
    whatsappPresetList.innerHTML = '<div class="loading">Se incarca...</div>';
    whatsappPresetModal.style.display = 'flex';
    try {
      const messages = await window.API.getWhatsAppPredefinedMessages(window.AUTH?.getToken() || '');
      whatsappPresetList.innerHTML = messages.length ? messages.map((message) => `
        <button type="button" class="whatsapp-preset-option" data-id="${escapeHtml(message.id)}">
          <strong>${escapeHtml(message.title)}</strong><span>${escapeHtml(message.body)}</span>
        </button>
      `).join('') : '<div class="loading">Adauga mai intai un mesaj din Setari.</div>';
      whatsappPresetList.querySelectorAll('.whatsapp-preset-option').forEach((button) => {
        button.addEventListener('click', async () => {
          const message = messages.find((item) => item.id === button.dataset.id);
          const text = String(message?.body || '').replace(/\{\{\s*nume\s*\}\}/gi, client.name || '');
          const phone = normalizeWhatsAppPhone(client.phone || '');
          const phonePart = phone ? `phone=${encodeURIComponent(phone)}&` : '';
          try {
            await shell.openExternal(`whatsapp://send?${phonePart}text=${encodeURIComponent(text)}`);
          } catch (_error) {
            await shell.openExternal(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
          }
          whatsappPresetModal.style.display = 'none';
        });
      });
    } catch (e) {
      whatsappPresetList.innerHTML = `<div class="loading">${escapeHtml(e.message)}</div>`;
    }
  }

  function df(label, value, accent = false, mono = false) {
    return `<div class="detail-field">
      <div class="detail-field-label"><i>${clientDetailIcon(clientDetailIconKey(label))}</i>${escapeHtml(label)}</div>
      <div class="detail-field-value${accent ? ' accent' : ''}${mono ? ' mono' : ''}">${escapeHtml(value)}</div>
    </div>`;
  }

  function renderLaborBreakdown(client) {
    const currency = currencyCode(client.currency_code);
    const costs = Array.isArray(client.collaborator_costs)
      ? client.collaborator_costs.filter((item) => Number(item.cost || 0) > 0)
      : [];
    if (!costs.length) return '';
    const total = costs.reduce((sum, item) => sum + Number(item.cost || 0), 0);

    return `
      <section class="labor-card embedded">
        <div class="labor-header">
          <div>
            <div class="labor-section-title"><i>${clientDetailIcon('list')}</i>Desfasurator manopera</div>
            <div class="labor-subtitle">Componenta exacta a costului de manopera pentru acest client.</div>
          </div>
          <div class="labor-total-box">
            <span>Total manopera</span>
            <strong>${escapeHtml(fmtMoney(total, currency))}</strong>
          </div>
        </div>

        <div class="labor-list">
          ${costs.map((item) => `
            <div class="labor-item" style="--collaborator-color:${escapeHtml(item.collaborator_color || '#FF6B00')}">
              <div class="labor-color" style="background:${escapeHtml(item.collaborator_color || '#FF6B00')}"></div>
              <div class="labor-main">
                <div class="labor-name">${escapeHtml(item.collaborator_name || 'Colaborator')}</div>
                <div class="labor-role">${escapeHtml(item.collaborator_role || 'Colaborator')}</div>
                ${item.cost_type === 'percentage'
                  ? `<div class="labor-role">${escapeHtml(Number(item.percentage || 0).toFixed(2))}% din NET</div>`
                  : '<div class="labor-role">Suma fixa</div>'}
              </div>
              <div class="labor-cost-wrap">
                <div class="labor-cost">${escapeHtml(fmtMoney(item.cost, currency))}</div>
                <span class="labor-payment-state ${item.payment_status === 'incasati' ? 'paid' : 'hold'}">${item.payment_status === 'incasati' ? 'Achitat' : 'On hold'}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderExpenseBreakdown(client) {
    const currency = currencyCode(client.currency_code);
    const costs = Array.isArray(client.expense_costs)
      ? client.expense_costs.filter((item) => Number(item.cost || 0) > 0)
      : [];
    return costs.map((item) =>
      df(item.expense_name || 'Cheltuiala', fmtMoney(item.cost, currency))
    ).join('');
  }

  function openNewClient() {
    openClientFormModal({
      id: '',
      name: '',
      phone: '',
      email: '',
      status: 'va_folosi_codul',
      qr_code: generateQrCode(),
      qr_used: false,
      price: 0,
      predefined_price: 0,
      advance_amount: 0,
      amount_due: 0,
      currency_code: 'RON',
      payment_status: 'de_incasat',
      discount_percentage: 0,
      manopera_colaboratori: null,
      valoare_piese: null,
      service_parts_price: 0,
      service_labor_price: 0,
      alte_cheltuieli: null,
      collaborator_costs: [],
      expense_costs: [],
      notes: '',
      profile_id: null,
      is_finalized: false,
    }, 'add');
  }

  function renderAuditSection(client) {
    if (!canViewAudit()) return '';

    const participants = Array.isArray(client.participants) ? client.participants : [];
    const logs = Array.isArray(client.activity_logs) ? client.activity_logs : [];

    return `
      <div class="detail-card full audit-card-desktop">
        <div class="audit-title-row">
          <div class="audit-title-icon">A</div>
          <div>
            <div class="detail-card-title">Participanti si istoric</div>
            <div class="audit-subtitle">Vizibil pentru admin si manager.</div>
          </div>
        </div>

        <div class="participants-wrap">
          ${participants.length > 0 ? participants.map(renderParticipant).join('') : '<div class="audit-empty">Nu exista participanti inregistrati.</div>'}
        </div>

        <div class="audit-divider"></div>
        <div class="audit-section-heading">Istoric actiuni</div>
        <div class="activity-list">
          ${logs.length > 0 ? logs.map(renderActivity).join('') : '<div class="audit-empty">Nu exista actiuni inregistrate.</div>'}
        </div>
      </div>
    `;
  }

  function renderParticipant(participant) {
    const name = participant.display_name || participant.username || 'User';
    const sources = Array.isArray(participant.sources) ? participant.sources : [];
    return `
      <div class="participant-item">
        <div class="participant-avatar">${escapeHtml(initials(name).slice(0, 1))}</div>
        <div class="participant-main">
          <div class="participant-name">${escapeHtml(name)}</div>
          <div class="participant-meta">@${escapeHtml(participant.username || '-')} - ${escapeHtml(participant.role || '-')}</div>
          <div class="participant-badges">
            ${sources.map((source) => `<span class="participant-badge">${escapeHtml(sourceLabel(source))}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderActivity(log) {
    const details = log.details && typeof log.details === 'object' ? log.details : {};
    const changes = Array.isArray(details.changes)
      ? details.changes.filter((change) => change?.field !== 'payment_status')
      : [];
    const detailRows = Object.entries(details).filter(([key]) => key !== 'changes' && key !== 'payment_status');
    return `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div class="activity-main">
          <div class="activity-top">
            <div class="activity-summary">${escapeHtml(log.summary || sourceLabel(log.action || ''))}</div>
            <span class="activity-action">${escapeHtml(sourceLabel(log.action || ''))}</span>
          </div>
          <div class="activity-meta">${escapeHtml(log.actor_name || log.actor_username || 'Sistem')} - ${escapeHtml(fmtDateTime(log.created_at))}</div>
          ${changes.length > 0 ? `<div class="change-list">${changes.map((change) => `
            <div class="change-text">${escapeHtml(change.label || detailLabel(change.field || ''))}: ${escapeHtml(detailValue(change.from))} -> ${escapeHtml(detailValue(change.to))}</div>
          `).join('')}</div>` : ''}
          ${detailRows.length > 0 ? `<div class="change-list">${detailRows.map(([key, value]) => `
            <div class="change-text">${escapeHtml(detailLabel(key))}: ${escapeHtml(detailValue(value))}</div>
          `).join('')}</div>` : ''}
        </div>
      </div>
    `;
  }

  function qrShareText(client) {
    const currency = currencyCode(client.currency_code);
    const discount = Number(client.discount_percentage || 0);
    const price = Number(client.price || 0);
    const predefinedPrice = Number(client.predefined_price || 0);
    const payment = calculateClientPayment(price, predefinedPrice, discount, client.advance_amount);
    const discountAmount = payment.grossTotal - payment.total;
    const finalPrice = payment.total;
    return `Buna ziua! Codul tau QR G-Trots:\nClient: ${client.name}\nCod: ${client.qr_code}`
      + (predefinedPrice > 0 ? `\nPret predefinit: ${fmtMoney(predefinedPrice, currency)}` : '')
      + (discount > 0 ? `\nReducere: ${discount}% (${fmtMoney(discountAmount, currency)})\nTotal: ${fmtMoney(finalPrice, currency)}` : '');
  }

  async function openQrModal(client) {
    const usedQr = qrIsUsed(client);
    activeQrDataUrl = '';
    qrModalTitle.textContent = client.name || 'Client';

    if (usedQr) {
      qrModalContent.innerHTML = `
        <div class="qr-used-state">
          <div class="qr-used-lock">QR</div>
          <div class="qr-used-title">Cod Deja Utilizat</div>
          <div class="qr-used-subtitle">Acest cod QR a fost scanat si nu mai poate fi folosit.</div>
        </div>
      `;
      qrModal.style.display = 'flex';
      return;
    }

    qrModalContent.innerHTML = '<div class="qr-modal-loading">Se genereaza codul QR...</div>';
    qrModal.style.display = 'flex';
    try {
      const rawQrDataUrl = await QRCode.toDataURL(client.qr_code, {
        width: 260,
        margin: 2,
        color: { dark: '#FFFFFF', light: '#1C1C1C' },
        errorCorrectionLevel: 'H',
      });
      activeQrDataUrl = await addLogoToQr(rawQrDataUrl);
      const discount = Number(client.discount_percentage || 0);
      const price = Number(client.price || 0);
      const predefinedPrice = Number(client.predefined_price || 0);
      const finalPrice = calculateClientPayment(
        price,
        predefinedPrice,
        discount,
        client.advance_amount
      ).total;
      const currency = currencyCode(client.currency_code);
      qrModalContent.innerHTML = `
        <div class="qr-image-frame">
          <img class="qr-image" src="${activeQrDataUrl}" alt="Cod QR ${escapeHtml(client.name)}" />
        </div>
        <div class="qr-code-row">
          <span>Cod:</span>
          <strong>${escapeHtml(client.qr_code)}</strong>
        </div>
        ${discount > 0 ? `
          <div class="qr-discount-banner">
            <strong>Reducere ${discount}%</strong>
            <span>Total dupa reducere: ${escapeHtml(fmtMoney(finalPrice, currency))}</span>
          </div>
        ` : ''}
        <div class="qr-modal-actions">
          <button type="button" class="qr-action whatsapp" id="qr-share-whatsapp">
            <span class="qr-action-icon">${shareIconSvg()}</span>
            <span>Trimite pe WhatsApp</span>
          </button>
          <button type="button" class="qr-action secondary" id="qr-copy-code-image">
            <span class="qr-action-icon">${copyIconSvg()}</span>
            <span>Copiaza cod + imagine</span>
          </button>
        </div>
        <div class="qr-modal-hint">
          Detalii: textul este plasat automat in casuta de mesaj WhatsApp. Apasa Ctrl+V ca sa adaugi si imaginea QR.
        </div>
        <div class="qr-modal-feedback" id="qr-modal-feedback"></div>
      `;

      document.getElementById('qr-share-whatsapp')?.addEventListener('click', () => shareQrTextToWhatsApp(client));
      document.getElementById('qr-copy-code-image')?.addEventListener('click', () => copyQrCodeAndImage(client));
    } catch (error) {
      qrModalContent.innerHTML = '<div class="qr-modal-error">Codul QR nu a putut fi generat.</div>';
    }
  }

  function saveQrImage(client) {
    if (!activeQrDataUrl) return;
    const link = document.createElement('a');
    link.href = activeQrDataUrl;
    link.download = `qr_${String(client.qr_code || client.name || 'client').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setQrFeedback('Imaginea QR a fost salvata.');
  }

  async function addLogoToQr(qrDataUrl) {
    const [qrImage, logoImage] = await Promise.all([
      loadImage(qrDataUrl),
      loadImage('../assets/logo.png'),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = 260;
    canvas.height = 260;
    const context = canvas.getContext('2d');
    context.drawImage(qrImage, 0, 0, canvas.width, canvas.height);

    const logoSize = 48;
    const logoPadding = 6;
    const x = (canvas.width - logoSize) / 2;
    const y = (canvas.height - logoSize) / 2;
    context.fillStyle = '#1C1C1C';
    roundRect(context, x - logoPadding, y - logoPadding, logoSize + logoPadding * 2, logoSize + logoPadding * 2, 15);
    context.fill();
    context.save();
    roundRect(context, x, y, logoSize, logoSize, 14);
    context.clip();
    context.drawImage(logoImage, x, y, logoSize, logoSize);
    context.restore();

    return canvas.toDataURL('image/png');
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  async function shareQrTextToWhatsApp(client) {
    const text = qrShareText(client);
    const encodedText = encodeURIComponent(text);
    const phone = normalizeWhatsAppPhone(client.phone || '');
    const phonePart = phone ? `phone=${phone}&` : '';
    const webPhonePart = phone ? `${phone}` : '';
    try {
      copyQrImageOnly();
    } catch {}
    try {
      await shell.openExternal(`whatsapp://send?${phonePart}text=${encodedText}`);
      setQrFeedback('WhatsApp s-a deschis cu textul pregatit. Apasa Ctrl+V pentru imagine.');
    } catch {
      await shell.openExternal(`https://wa.me/${webPhonePart}${webPhonePart ? '?' : '?'}text=${encodedText}`);
      setQrFeedback('WhatsApp Web s-a deschis cu textul pregatit. Apasa Ctrl+V pentru imagine.');
    }
  }

  function copyQrCodeAndImage(client) {
    if (!activeQrDataUrl) return;
    try {
      const image = createQrNativeImage();
      clipboard.write({
        text: qrShareText(client),
        image,
      });
      setQrFeedback('Codul si imaginea QR cu sigla au fost copiate.');
    } catch {
      clipboard.writeText(qrShareText(client));
      setQrFeedback('Textul a fost copiat, dar imaginea nu a putut fi pusa in clipboard.');
    }
  }

  function copyQrImageOnly() {
    const image = createQrNativeImage();
    clipboard.write({ image });
  }

  function createQrNativeImage() {
    const image = nativeImage.createFromDataURL(activeQrDataUrl);
    if (image.isEmpty()) {
      throw new Error('Imagine QR invalida.');
    }
    return image;
  }

  function normalizeWhatsAppPhone(phone) {
    let digits = String(phone || '').replace(/\D+/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0') && digits.length === 10) {
      digits = `40${digits.slice(1)}`;
    }
    return digits;
  }

  function shareIconSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
        <path d="M16 6l-4-4-4 4" />
        <path d="M12 2v14" />
      </svg>
    `;
  }

  function copyIconSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M4 16V6a2 2 0 0 1 2-2h10" />
      </svg>
    `;
  }

  function setQrFeedback(message) {
    const feedback = document.getElementById('qr-modal-feedback');
    if (feedback) feedback.textContent = message;
  }

  function closeQrModal() {
    qrModal.style.display = 'none';
    activeQrDataUrl = '';
  }

  function filter(clients) {
    let rows = clients;
    if (clientLifecycleFilter === 'active') {
      rows = rows.filter((client) => !client.is_finalized);
    } else if (clientLifecycleFilter === 'finalized') {
      rows = rows.filter((client) => Boolean(client.is_finalized));
    }
    const q = searchEl.value.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((client) =>
      String(client.name || '').toLowerCase().includes(q) ||
      String(client.phone || '').toLowerCase().includes(q) ||
      String(client.email || '').toLowerCase().includes(q) ||
      String(client.qr_code || '').toLowerCase().includes(q)
    );
  }

  function updateLifecycleFilterButtons() {
    lifecycleFilterButtons.forEach((button) => {
      const active = button.dataset.clientLifecycleFilter === clientLifecycleFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function isClientsTabActive() {
    return document.getElementById('tab-clients')?.classList.contains('active');
  }

  function isClientActionModalOpen() {
    return Boolean(document.querySelector('.client-action-modal-overlay'));
  }

  function setRefreshLoading(isLoading) {
    if (!refreshBtn) return;
    refreshBtn.classList.toggle('loading', isLoading);
    refreshBtn.disabled = Boolean(isLoading);
  }

  function dataVersion(clients) {
    return clients
      .map((client) => [
        client.id,
        client.updated_at || client.created_at || '',
        client.status || '',
        client.qr_used ? 1 : 0,
        client.is_finalized ? 1 : 0,
        client.payment_status || '',
        client.price || 0,
        client.predefined_price || 0,
        client.advance_amount || 0,
      ].join(':'))
      .join('|');
  }

  async function load(options = {}) {
    if (clientsLoadInFlight && options.silent) return;
    const modalWasOpen = isClientActionModalOpen();
    clientsLoadInFlight = true;
    if (!options.silent) setRefreshLoading(true);
    if (!options.silent) {
      if (allClients.length) {
        renderList(filter(allClients));
      } else {
        listEl.innerHTML = '<div class="loading">Se incarca...</div>';
      }
    }
    try {
      const [clients] = await Promise.all([
        window.API.getClients(),
        loadPricePresets(),
      ]);
      const nextVersion = dataVersion(clients);
      const dataChanged = !clientsHaveLoaded || nextVersion !== clientsDataVersion;
      if (dataChanged) {
        allClients = clients;
        clientsDataVersion = nextVersion;
        clientsHaveLoaded = true;
      }
      const targetClientId = options.selectClientId || pendingSelectClientId;
      pendingSelectClientId = null;
      if (targetClientId) {
        const foundClient = allClients.find((client) => client.id === targetClientId) || null;
        if (foundClient) {
          selected = foundClient;
        } else if (!options.keepMissingSelection) {
          selected = null;
        }
        if (!foundClient && !options.silent) {
          window.BUSINESS_UI?.showToast?.('Clientul nu a fost gasit in lista curenta.', 'error');
        }
      } else if (options.selectLatest && !selected) {
        selected = allClients[0] || null;
      } else if (selected) {
        const freshSelected = allClients.find((client) => client.id === selected.id) || null;
        if (freshSelected) {
          selected = freshSelected;
        } else if (!options.keepMissingSelection) {
          selected = null;
        }
      }
      const listNeedsRender = !options.silent || listEl.querySelector('.loading') || !listEl.children.length;
      const shouldRender = dataChanged || targetClientId || options.forceRender || listNeedsRender;
      if (shouldRender) {
        renderList(filter(allClients));
      }
      if (selected && !modalWasOpen && shouldRender) {
        selectClient(selected);
      } else if (!selected && !modalWasOpen && !options.keepMissingSelection) {
        detailEl.innerHTML = '<div class="empty-state">Selectati un client</div>';
      }
    } catch (e) {
      if (!options.silent) {
        if (allClients.length) {
          renderList(filter(allClients));
          window.BUSINESS_UI?.showToast?.(e.message || 'Lista de clienti nu a putut fi reincarcata.', 'error');
        } else {
          listEl.innerHTML = `<div class="loading" style="color:var(--error)">${escapeHtml(e.message)}</div>`;
        }
      }
    } finally {
      clientsLoadInFlight = false;
      if (!options.silent) setRefreshLoading(false);
    }
  }

  function openClient(clientId) {
    if (!clientId) return;
    pendingSelectClientId = clientId;
    if (searchEl) searchEl.value = '';
    if (document.getElementById('tab-clients')?.classList.contains('active')) {
      load({ selectClientId: clientId });
    } else {
      window.switchTab?.('clients');
    }
  }

  function refreshClientsWithoutDisrupting() {
    return load({
      silent: true,
      selectClientId: selected?.id || '',
      keepMissingSelection: true,
    });
  }

  function startClientsRealtimeRefresh() {
    if (clientsRealtimeTimer) return;
    clientsRealtimeTimer = setInterval(() => {
      if (isClientsTabActive() && !isClientActionModalOpen()) refreshClientsWithoutDisrupting();
    }, 45000);
  }

  function stopClientsRealtimeRefresh() {
    if (!clientsRealtimeTimer) return;
    clearInterval(clientsRealtimeTimer);
    clientsRealtimeTimer = null;
  }

  searchEl.addEventListener('input', () => {
    if (clientSearchTimer) clearTimeout(clientSearchTimer);
    clientSearchTimer = setTimeout(() => {
      renderList(filter(allClients));
    }, 120);
  });
  lifecycleFilterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.clientLifecycleFilter || '';
      clientLifecycleFilter = clientLifecycleFilter === next ? '' : next;
      updateLifecycleFilterButtons();
      renderList(filter(allClients));
    });
  });
  addClientBtn?.addEventListener('click', openNewClient);
  refreshBtn?.addEventListener('click', () => load({
    selectClientId: selected?.id || '',
    keepMissingSelection: true,
  }));
  qrModalClose?.addEventListener('click', closeQrModal);
  whatsappPresetClose?.addEventListener('click', () => { whatsappPresetModal.style.display = 'none'; });
  whatsappPresetModal?.addEventListener('click', (event) => {
    if (event.target === whatsappPresetModal) whatsappPresetModal.style.display = 'none';
  });
  clientDeleteModalClose?.addEventListener('click', () => closeClientDeleteModal(false));
  clientDeleteModalCancel?.addEventListener('click', () => closeClientDeleteModal(false));
  clientDeleteModalConfirm?.addEventListener('click', () => closeClientDeleteModal(true));
  clientDeleteModal?.addEventListener('click', (event) => {
    if (event.target === clientDeleteModal) closeClientDeleteModal(false);
  });
  qrModal?.addEventListener('click', (event) => {
    if (event.target === qrModal) closeQrModal();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !clientDeleteModal?.hidden) {
      closeClientDeleteModal(false);
      return;
    }
    if (event.key === 'Escape' && qrModal?.style.display !== 'none') closeQrModal();
  });

  window.addEventListener('tab-change', ({ detail }) => {
    if (detail === 'clients') {
      if (allClients.length) {
        renderList(filter(allClients));
        if (selected) selectClient(selected);
      }
      load({ selectLatest: !selected, forceRender: true });
      startClientsRealtimeRefresh();
    } else {
      stopClientsRealtimeRefresh();
    }
  });

  window.addEventListener('clients-change', () => {
    if (isClientsTabActive()) refreshClientsWithoutDisrupting();
  });

  window.addEventListener('price-presets-change', (event) => {
    pricePresets = Array.isArray(event.detail) ? event.detail : pricePresets;
  });

  window.addEventListener('auth-change', () => {
    if (selected) selectClient(selected);
  });

  window.CLIENTS_LOAD = load;
  window.CLIENTS_OPEN = openClient;
})();
