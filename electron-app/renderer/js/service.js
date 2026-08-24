// Service sheets CRM: Bootstrap-style table, modal editor, scan handoff and PDF export.
(function() {
  const { shell, clipboard, ipcRenderer } = require('electron');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const listEl = document.getElementById('service-sheets-list');
  const countEl = document.getElementById('service-table-count');
  const editorEl = document.getElementById('service-sheet-editor');
  const modalEl = document.getElementById('service-sheet-modal');
  const closeModalBtn = document.getElementById('service-modal-close');
  const searchEl = document.getElementById('service-search');
  const sortEl = document.getElementById('service-sort');
  const refreshBtn = document.getElementById('service-refresh-btn');
  const newBtn = document.getElementById('service-new-btn');
  const columnHeaderButtons = Array.from(document.querySelectorAll('.service-th-btn'));
  const paymentFilterButtons = Array.from(document.querySelectorAll('[data-service-payment-filter]'));
  const sortChipButtons = Array.from(document.querySelectorAll('[data-service-sort-chip]'));
  const signatureModalEl = document.getElementById('service-signature-modal');
  const signatureCanvas = document.getElementById('service-signature-canvas');
  const signatureCloseBtn = document.getElementById('service-signature-close');
  const signatureClearBtn = document.getElementById('service-signature-clear');
  const signatureSaveBtn = document.getElementById('service-signature-save');
  const signaturePlaceholder = document.getElementById('service-signature-placeholder');

  let sheets = [];
  let expenseCategories = [];
  let selectedSheet = null;
  let searchTimer = null;
  let closeTimer = null;
  let loading = false;
  let sortBy = '';
  let sortDir = '';
  let filterColumn = '';
  let paymentFilter = '';
  let signatureDraft = '';
  let signatureSignedAtDraft = '';
  let signatureStrokes = [];
  let signatureDrawing = false;
  let signatureActiveStroke = null;
  let sheetsDataVersion = '';
  let sheetsHaveLoaded = false;
  let financialEntryActive = false;

  const COLUMN_LABELS = {
    sheet_number: 'Nr fisa',
    client: 'Client',
    phone: 'Telefon / QR',
    created_at: 'Data adaugarii',
    updated_at: 'Ultima modificare',
    total_price: 'Pret total',
  };
  const DEFAULT_SORT_DIRS = {
    sheet_number: 'asc',
    client: 'asc',
    phone: 'asc',
    created_at: 'desc',
    updated_at: 'desc',
    total_price: 'desc',
  };

  const ICONS = {
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.56 7.47L3 21l2.03-5.44A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.35 7.8c.22-.48.45-.49.77-.5h.55c.2 0 .4.08.5.36l.76 1.82c.08.2.05.38-.08.55l-.57.72c-.13.16-.18.3-.04.53.62 1.06 1.53 1.94 2.62 2.5.23.13.37.1.51-.07l.81-.96c.17-.2.35-.24.57-.15l1.9.9c.24.11.39.17.44.31.05.14.04.8-.19 1.5-.23.68-1.32 1.3-1.85 1.39-.5.08-1.12.12-1.81-.1a12 12 0 0 1-2.2-1.01 9.8 9.8 0 0 1-3.68-3.6c-.92-1.59-.98-2.72-.78-3.37Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
    signature: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-5 1 1-5Z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };

  function actionButton(id, label, icon, classes = 'btn-ghost', type = 'button') {
    return `<button type="${type}" class="${classes} service-action-btn" id="${id}">${ICONS[icon] || ''}<span data-action-label>${escapeHtml(label)}</span></button>`;
  }

  function setActionButtonLabel(button, label) {
    if (!button) return;
    const labelEl = button.querySelector('[data-action-label]');
    if (labelEl) labelEl.textContent = label;
    else button.textContent = label;
  }

  function sheetPdfFileName(sheet = selectedSheet) {
    return `${sheet?.sheet_number || 'fisa-service'}.pdf`;
  }

  function safePdfFileName(defaultName) {
    const rawName = String(defaultName || 'fisa-service.pdf')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'fisa-service.pdf';
    return rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`;
  }

  async function preparePdfAttachment(defaultName, bytes) {
    if (typeof window.preparePdfAttachment === 'function') {
      const result = await window.preparePdfAttachment(defaultName, bytes);
      if (result?.success && result.filePath) {
        clipboard?.writeText?.(result.filePath);
      }
      return result;
    }
    const dir = path.join(os.tmpdir(), 'G-Trots', 'service-sheets');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, safePdfFileName(defaultName));
    fs.writeFileSync(filePath, Buffer.from(bytes));
    clipboard?.writeText?.(filePath);
    shell.showItemInFolder(filePath);
    return { success: true, filePath };
  }

  function whatsappPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = `40${digits.slice(1)}`;
    if (digits.length === 9) digits = `40${digits}`;
    return digits;
  }

  async function openWhatsApp(phone, message) {
    const encoded = encodeURIComponent(message);
    const desktopUrl = phone
      ? `whatsapp://send?phone=${phone}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
    const webUrl = phone
      ? `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`
      : `https://web.whatsapp.com/send?text=${encoded}`;
    try {
      await shell.openExternal(desktopUrl);
    } catch (_error) {
      await shell.openExternal(webUrl);
    }
  }

  async function sendWhatsAppDocument(payload) {
    if (typeof window.sendWhatsAppDocument === 'function') {
      return window.sendWhatsAppDocument(payload);
    }
    return ipcRenderer.invoke('send-whatsapp-document', payload);
  }

  function token() {
    return window.AUTH?.getToken?.() || '';
  }

  function canNormallyViewFinancials() {
    return Boolean(window.AUTH?.canViewClientFinancials?.());
  }

  function canDeleteServiceSheets() {
    const role = window.AUTH?.getUser?.()?.role || '';
    return role === 'admin' || role === 'manager';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const CURRENCIES = ['RON','EUR','USD','GBP','CHF','HUF','BGN','PLN','CZK','MDL','UAH','TRY','CAD','AUD','JPY','CNY','SEK','NOK','DKK'];
  const DEADLINE_UNITS = ['minute','ore','zile','saptamani','luni','ani'];
  const WARRANTY_UNITS = ['zile','saptamani','ani'];
  const DURATION_LABELS = {
    minute: ['minut', 'minute'],
    ore: ['ora', 'ore'],
    zile: ['zi', 'zile'],
    saptamani: ['saptamana', 'saptamani'],
    luni: ['luna', 'luni'],
    ani: ['an', 'ani'],
  };
  const DURATION_ALIASES = {
    minut: 'minute',
    minute: 'minute',
    ora: 'ore',
    ore: 'ore',
    zi: 'zile',
    zile: 'zile',
    saptamana: 'saptamani',
    saptamani: 'saptamani',
    luna: 'luni',
    luni: 'luni',
    an: 'ani',
    ani: 'ani',
  };

  function currencyCode(value) {
    const code = String(value || 'RON').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : 'RON';
  }

  function fmtMoney(value, currency = 'RON') {
    return `${Number(value || 0).toFixed(2)} ${currencyCode(currency)}`;
  }

  function normalizeDurationUnit(value, fallback = 'zile') {
    const raw = String(value || '').trim().toLowerCase();
    const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const unit = DURATION_ALIASES[raw] || DURATION_ALIASES[normalized] || raw || fallback;
    return DURATION_LABELS[unit] ? unit : fallback;
  }

  function sanitizeDurationNumber(value) {
    const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
    return match ? match[0] : '';
  }

  function parseDurationText(value, fallbackUnit = 'zile') {
    const raw = String(value ?? '').trim();
    const normalized = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const unitMatch = normalized.match(/(?:^|[\d\s,.])([a-z]+)\s*$/);
    return {
      value: sanitizeDurationNumber(raw),
      unit: normalizeDurationUnit(unitMatch?.[1], fallbackUnit),
    };
  }

  function formatDurationLabel(value, unitValue = 'zile') {
    const number = sanitizeDurationNumber(value);
    if (!number) return '';
    const unit = normalizeDurationUnit(unitValue);
    const labels = DURATION_LABELS[unit] || DURATION_LABELS.zile;
    return `${number} ${Math.abs(Number(number) - 1) < 0.00001 ? labels[0] : labels[1]}`;
  }

  function normalizeServiceSheetWorkPrice(totalPriceValue, diagnosticValue, clientPackageValue = 0) {
    const totalPrice = Math.max(Number(totalPriceValue || 0), 0);
    const diagnostic = Math.max(Number(diagnosticValue || 0), 0);
    return totalPrice > 0 ? totalPrice : diagnostic;
  }

  function calculateServicePayment(totalPriceValue, diagnosticValue, advanceValue = 0, clientPackageValue = 0, discountValue = 0) {
    const totalPrice = normalizeServiceSheetWorkPrice(totalPriceValue, diagnosticValue, clientPackageValue);
    const diagnostic = Math.max(Number(diagnosticValue || 0), 0);
    const advance = Math.max(Number(advanceValue || 0), 0);
    const discount = Math.min(100, Math.max(Number(discountValue || 0), 0));
    const grossTotal = totalPrice > 0 ? totalPrice : diagnostic;
    const total = Math.max(grossTotal * (1 - discount / 100), 0);
    const amountDue = Math.max(total - advance, 0);
    return { totalPrice, diagnostic, advance, discount, grossTotal, total, amountDue };
  }

  function normalizePaymentStatus(status, amountDue = 0, total = 0) {
    if (Number(total || 0) > 0 && Number(amountDue || 0) <= 0.00001) {
      return 'incasati';
    }
    return ['incasati', 'de_incasat'].includes(String(status || ''))
      ? String(status)
      : 'de_incasat';
  }

  function servicePaymentDue(payment, status) {
    return payment.amountDue;
  }

  function isServiceTotalOnlyPayment(totalPriceValue, diagnosticValue, advanceValue = 0, clientPackageValue = 0) {
    return false;
  }

  function displayServicePaymentDue(payment, totalPriceValue, diagnosticValue, advanceValue = 0, clientPackageValue = 0) {
    return Number(payment?.amountDue || 0);
  }

  function servicePaymentStatusLabel(paymentStatus, amountDue, totalOnlyPayment = false) {
    return paymentStatus === 'incasati' || (!totalOnlyPayment && Number(amountDue || 0) <= 0)
      ? 'Achitat'
      : 'Neachitat';
  }

  function parseDateTimeValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const displayMatch = raw.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if (displayMatch) {
      const [, day, month, year, hour = '00', minute = '00'] = displayMatch;
      return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    }
    const date = new Date(raw.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDateTimeDisplay(value) {
    const date = value instanceof Date ? value : parseDateTimeValue(value);
    if (!date || Number.isNaN(date.getTime())) return value ? String(value) : '';
    const pad = (part) => String(part).padStart(2, '0');
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function fmtDate(value) {
    return value ? formatDateTimeDisplay(value) : '-';
  }

  function currentDateTimeDisplay() {
    return formatDateTimeDisplay(new Date());
  }

  function fromDateTimeDisplay(value) {
    const date = parseDateTimeValue(value);
    if (!date) return null;
    const pad = (part) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
  }

  function finalizedBadge(sheet) {
    return sheet?.is_finalized
      ? '<span class="service-finalized-badge">Finalizata</span>'
      : '';
  }

  function readSignature(value) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (parsed?.v !== 1 || !Array.isArray(parsed.strokes)) return [];
      return parsed.strokes
        .filter(Array.isArray)
        .map((stroke) => stroke
          .filter((point) => Array.isArray(point) && point.length >= 2)
          .map((point) => [
            Math.max(0, Math.min(1, Number(point[0]) || 0)),
            Math.max(0, Math.min(1, Number(point[1]) || 0)),
          ]))
        .filter((stroke) => stroke.length >= 2);
    } catch (_error) {
      return [];
    }
  }

  function hasSignature(value = signatureDraft) {
    return readSignature(value).length > 0;
  }

  function showSignatureRequired() {
    const message = 'Clientul nu a semnat fisa de service. Semneaza fisa inainte de trimitere.';
    if (window.Swal?.fire) {
      window.Swal.fire({ icon: 'error', title: 'Semnare client', text: message });
    } else {
      window.alert(message);
    }
  }

  function updateSignatureUi() {
    const signed = hasSignature();
    const button = document.getElementById('service-signature-btn');
    const card = document.getElementById('service-signature-status');
    const title = document.getElementById('service-signature-status-title');
    const subtitle = document.getElementById('service-signature-status-subtitle');
    button?.classList.toggle('signed', signed);
    if (button) setActionButtonLabel(button, signed ? 'Semneaza din nou' : 'Semneaza client');
    card?.classList.toggle('signed', signed);
    if (title) title.textContent = signed ? 'Client semnat' : 'Semnatura client lipseste';
    if (subtitle) {
      subtitle.textContent = signed
        ? `Semnata la ${fmtDate(signatureSignedAtDraft)}`
        : 'Semnatura este obligatorie inainte de trimiterea PDF-ului.';
    }
  }

  function drawSignatureCanvas() {
    if (!signatureCanvas) return;
    const rect = signatureCanvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    if (signatureCanvas.width !== Math.round(width * ratio) || signatureCanvas.height !== Math.round(height * ratio)) {
      signatureCanvas.width = Math.round(width * ratio);
      signatureCanvas.height = Math.round(height * ratio);
    }
    const context = signatureCanvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = '#17120f';
    context.lineWidth = 2.35;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    signatureStrokes.forEach((stroke) => {
      if (!stroke.length) return;
      context.beginPath();
      stroke.forEach(([x, y], index) => {
        const px = x * width;
        const py = y * height;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.stroke();
    });
    if (signaturePlaceholder) {
      signaturePlaceholder.hidden = signatureStrokes.some((stroke) => stroke.length >= 2);
    }
  }

  function signaturePoint(event) {
    const rect = signatureCanvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    ];
  }

  function openSignatureModal() {
    if (!signatureModalEl || !signatureCanvas) return;
    signatureStrokes = readSignature(signatureDraft);
    signatureModalEl.hidden = false;
    requestAnimationFrame(() => {
      signatureModalEl.classList.add('visible');
      drawSignatureCanvas();
    });
  }

  function closeSignatureModal() {
    if (!signatureModalEl) return;
    signatureModalEl.classList.remove('visible');
    setTimeout(() => {
      signatureModalEl.hidden = true;
    }, 140);
  }

  function syncSortFromSelect(activateFilter = false) {
    if (!sortEl || sortEl.hidden) {
      sortBy = '';
      sortDir = '';
      if (activateFilter) filterColumn = '';
      updateColumnHeaderState();
      updateServiceChipState();
      updateSearchPlaceholder();
      return;
    }
    const [nextSortBy = 'created_at', nextSortDir = 'desc'] = String(sortEl?.value || '').split(':');
    sortBy = nextSortBy || 'created_at';
    sortDir = nextSortDir === 'asc' ? 'asc' : 'desc';
    if (activateFilter) {
      filterColumn = sortBy;
    }
    updateColumnHeaderState();
    updateServiceChipState();
    updateSearchPlaceholder();
  }

  function syncSortSelect() {
    if (!sortEl) return;
    const value = `${sortBy}:${sortDir}`;
    const hasOption = Array.from(sortEl.options).some((option) => option.value === value);
    if (hasOption) {
      sortEl.value = value;
    }
  }

  function updateServiceChipState() {
    paymentFilterButtons.forEach((button) => {
      const active = button.dataset.servicePaymentFilter === paymentFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    sortChipButtons.forEach((button) => {
      const [chipSortBy = '', chipSortDir = ''] = String(button.dataset.serviceSortChip || '').split(':');
      const active = sortBy === chipSortBy && sortDir === chipSortDir;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function query() {
    const params = {
      search: filterColumn ? '' : (searchEl?.value?.trim() || ''),
    };
    if (sortBy) {
      params.sortBy = sortBy;
      params.sortDir = sortDir || DEFAULT_SORT_DIRS[sortBy] || 'asc';
    }
    if (paymentFilter) {
      params.paymentStatus = paymentFilter;
    }
    return params;
  }

  function normalizeText(value) {
    return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function columnSearchText(sheet, column) {
    if (column === 'sheet_number') return sheet.sheet_number || '';
    if (column === 'client') return `${sheet.client_name || ''} ${sheet.client_email || ''}`;
    if (column === 'phone') return `${sheet.client_phone || ''} ${sheet.qr_code || ''}`;
    if (column === 'created_at') return `${sheet.created_at || ''} ${fmtDate(sheet.created_at)}`;
    if (column === 'updated_at') return `${sheet.updated_at || ''} ${fmtDate(sheet.updated_at)}`;
    if (column === 'total_price') return fmtMoney(sheet.final_price || sheet.total_price || 0, sheet.currency_code);
    return `${sheet.sheet_number || ''} ${sheet.client_name || ''} ${sheet.client_phone || ''} ${sheet.qr_code || ''}`;
  }

  function sortValue(sheet, column) {
    if (column === 'sheet_number') return sheet.sheet_number || '';
    if (column === 'client') return sheet.client_name || '';
    if (column === 'phone') return sheet.client_phone || sheet.qr_code || '';
    if (column === 'created_at') return Date.parse(String(sheet.created_at || '').replace(' ', 'T')) || 0;
    if (column === 'updated_at') return Date.parse(String(sheet.updated_at || '').replace(' ', 'T')) || 0;
    if (column === 'total_price') return Number(sheet.final_price || sheet.total_price || 0);
    return sheet.created_at || '';
  }

  function visibleSheets() {
    const term = normalizeText(searchEl?.value?.trim() || '');
    let rows = term && filterColumn
      ? sheets.filter((sheet) => normalizeText(columnSearchText(sheet, filterColumn)).includes(term))
      : [...sheets];
    if (paymentFilter) {
      rows = rows.filter((sheet) => sheet.payment_status === paymentFilter);
    }
    if (!sortBy) return rows;
    rows.sort((a, b) => {
      const av = sortValue(a, sortBy);
      const bv = sortValue(b, sortBy);
      let result = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        result = av - bv;
      } else {
        result = String(av).localeCompare(String(bv), 'ro', { numeric: true, sensitivity: 'base' });
      }
      return sortDir === 'asc' ? result : -result;
    });
    return rows;
  }

  function updateSearchPlaceholder() {
    if (!searchEl) return;
    searchEl.placeholder = filterColumn
      ? `Cauta in ${COLUMN_LABELS[filterColumn] || 'coloana'}...`
      : 'Cauta nr fisa, client, telefon...';
  }

  function updateColumnHeaderState() {
    columnHeaderButtons.forEach((button) => {
      const column = button.dataset.serviceColumn;
      const active = column === sortBy;
      button.classList.toggle('active', active);
      button.classList.toggle('filtered', column === filterColumn);
      button.setAttribute('aria-sort', active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
      const indicator = button.querySelector('.service-sort-indicator');
      if (indicator) {
        indicator.textContent = active ? (sortDir === 'asc' ? '↑' : '↓') : '';
      }
    });
  }

  function setColumnSort(column) {
    if (!column) return;
    const defaultDir = DEFAULT_SORT_DIRS[column] || 'asc';
    if (sortBy !== column) {
      sortBy = column;
      sortDir = defaultDir;
      filterColumn = column;
    } else if (sortDir === defaultDir) {
      sortDir = defaultDir === 'asc' ? 'desc' : 'asc';
      filterColumn = column;
    } else {
      sortBy = '';
      sortDir = '';
      filterColumn = '';
    }
    syncSortSelect();
    updateColumnHeaderState();
    updateServiceChipState();
    updateSearchPlaceholder();
    loadSheets(selectedSheet?.id || '');
  }

  function isModalOpen() {
    return Boolean(modalEl && !modalEl.hidden);
  }

  function openModal() {
    if (!modalEl) return;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    modalEl.hidden = false;
    document.body.classList.add('service-modal-open');
    requestAnimationFrame(() => modalEl.classList.add('visible'));
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove('visible');
    document.body.classList.remove('service-modal-open');
    closeTimer = setTimeout(() => {
      modalEl.hidden = true;
      closeTimer = null;
    }, 140);
  }

  function updateCount() {
    if (!countEl) return;
    const count = visibleSheets().length;
    countEl.textContent = `${count} ${count === 1 ? 'fisa' : 'fise'}`;
  }

  function tableMessage(message, type = 'empty-state') {
    return `<tr class="service-table-message-row"><td colspan="7"><div class="${type}">${escapeHtml(message)}</div></td></tr>`;
  }

  function setListLoading() {
    if (!listEl) return;
    listEl.innerHTML = '<tr class="service-table-message-row"><td colspan="7"><div class="loading">Se incarca fisele...</div></td></tr>';
  }

  function showListError(message) {
    if (!listEl) return;
    listEl.innerHTML = tableMessage(message, 'error-box');
  }

  async function loadSheets(selectId = selectedSheet?.id || '') {
    if (!listEl) return;
    if (!token()) {
      sheets = [];
      selectedSheet = null;
      updateCount();
      listEl.innerHTML = tableMessage('Autentificare necesara.');
      return;
    }
    loading = true;
    if (!sheets.length) setListLoading();
    try {
      const [nextSheets, nextExpenseCategories] = await Promise.all([
        window.API.getServiceSheets(query()),
        window.API.getExpenseCategories().catch(() => expenseCategories),
      ]);
      expenseCategories = Array.isArray(nextExpenseCategories) ? nextExpenseCategories : [];
      const nextVersion = nextSheets
        .map((sheet) => `${sheet.id}:${sheet.updated_at || sheet.created_at || ''}:${sheet.is_finalized ? 1 : 0}:${sheet.payment_status || ''}:${sheet.final_price || sheet.total_price || 0}`)
        .join('|');
      const dataChanged = !sheetsHaveLoaded || nextVersion !== sheetsDataVersion;
      if (dataChanged) {
        sheets = nextSheets;
        sheetsDataVersion = nextVersion;
        sheetsHaveLoaded = true;
      }
      const keep = selectId
        ? sheets.find((sheet) => sheet.id === selectId)
        : selectedSheet?.id
          ? sheets.find((sheet) => sheet.id === selectedSheet.id)
          : null;
      if (keep) {
        selectedSheet = keep;
      } else if (!isModalOpen()) {
        selectedSheet = null;
      }
      if (dataChanged) renderList();
      if (keep && isModalOpen() && dataChanged) {
        renderEditor(keep);
      }
    } catch (error) {
      showListError(error.message || 'Fisele nu au putut fi incarcate.');
    } finally {
      loading = false;
    }
  }

  function renderList() {
    if (!listEl) return;
    updateCount();
    const rows = visibleSheets();
    if (!rows.length) {
      listEl.innerHTML = tableMessage('Nu exista fise de service pentru filtrul curent.');
      return;
    }
    listEl.innerHTML = rows.map((sheet) => `
      <tr class="service-table-row${selectedSheet?.id === sheet.id ? ' table-active' : ''}" data-service-id="${escapeHtml(sheet.id)}">
        <td>
          <span class="service-sheet-no">${escapeHtml(sheet.sheet_number || '-')}</span>
          ${finalizedBadge(sheet)}
        </td>
        <td>
          <div class="service-client-cell">
            <strong>${escapeHtml(sheet.client_name || 'Client fara nume')}</strong>
            <small>${escapeHtml(sheet.client_email || '')}</small>
          </div>
        </td>
        <td>
          <div class="service-client-cell">
            <span>${escapeHtml(sheet.client_phone || '-')}</span>
            <small>${escapeHtml(sheet.qr_code || '')}</small>
          </div>
        </td>
        <td>${escapeHtml(fmtDate(sheet.created_at))}</td>
        <td>${escapeHtml(fmtDate(sheet.updated_at))}</td>
        <td><span class="service-sheet-price">${sheet.financials_hidden ? 'Ascuns' : escapeHtml(fmtMoney(sheet.final_price || sheet.total_price || 0, sheet.currency_code))}</span></td>
        <td class="text-end">
          <button type="button" class="btn-ghost service-row-action" data-service-action="edit" data-service-id="${escapeHtml(sheet.id)}" title="Editeaza fisa" aria-label="Editeaza fisa">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-5 1 1-5Z"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  }

  function blankSheet() {
    return {
      id: '',
      sheet_number: 'Fisa noua',
      client_id: null,
      qr_code: '',
      client_name: '',
      client_phone: '',
      client_email: '',
      client_address: '',
      vehicle_type: 'trotineta',
      vehicle_brand_model: '',
      vehicle_registration: '',
      vehicle_series: '',
      vehicle_km: '',
      vehicle_battery: '',
      issue_description: '',
      visible_damage: '',
      accessories_charger: false,
      accessories_keys: false,
      accessories_saddle: false,
      accessories_other: false,
      accessories_other_text: '',
      quick_powers_on: false,
      quick_water_traces: false,
      quick_impact: false,
      quick_battery_risk: false,
      product_photo: '',
      diagnostic: '',
      work_performed: '',
      parts_used: '',
      observations: '',
      diagnostic_price: 0,
      parts_price: 0,
      labor_price: 0,
      internal_parts_cost: null,
      internal_labor_cost: null,
      internal_other_costs: null,
      total_price: 0,
      advance_amount: 0,
      amount_due: 0,
      currency_code: 'RON',
      payment_status: 'de_incasat',
      client_discount: 0,
      deadline: '',
      deadline_unit: 'zile',
      warranty: '',
      storage_fee_per_day: 0,
      storage_after_days: 0,
      old_parts_client: false,
      old_parts_recycle: false,
      approve_diagnostic_test: false,
      approve_repair_estimate: false,
      reject_repair: false,
      vehicle_delivered_checked: false,
      client_signature: '',
      client_signed_at: null,
      is_finalized: false,
      finalized_at: null,
      technician_name: '',
      service_type: 'Verificare generala',
      created_at: '',
      updated_at: '',
    };
  }

  function checked(value) {
    return value ? 'checked' : '';
  }

  function field(id, label, value = '', type = 'text', attrs = '') {
    return `<label class="field">
      <span>${escapeHtml(label)}</span>
      <input id="${id}" name="${id}" type="${type}" value="${escapeHtml(value)}" ${attrs} />
    </label>`;
  }

  function dateTimeField(id, label, value = '') {
    return `<label class="field service-date-field">
      <span>${escapeHtml(label)}</span>
      <div class="service-date-control">
        <input id="${id}" name="${id}" type="text" inputmode="numeric" placeholder="Selecteaza data" value="${escapeHtml(formatDateTimeDisplay(value))}" />
        <button type="button" class="service-date-now-btn" id="${id}-now">${ICONS.clock}<span>Acum</span></button>
      </div>
      <small class="service-date-format">Format: DD-MM-YYYY HH:mm</small>
    </label>`;
  }

  function textarea(id, label, value = '', rows = 3) {
    return `<label class="field">
      <span>${escapeHtml(label)}</span>
      <textarea id="${id}" name="${id}" rows="${rows}">${escapeHtml(value || '')}</textarea>
    </label>`;
  }

  function check(id, label, value) {
    return `<label class="service-check">
      <input id="${id}" name="${id}" type="checkbox" ${checked(value)} />
      <span>${escapeHtml(label)}</span>
    </label>`;
  }

  function serviceExpenseRows() {
    return [...document.querySelectorAll('.service-expense-cost-input')];
  }

  function renderServiceExpenseRow(expense, cost = '') {
    const color = expense.color || expense.expense_color || '#EF4444';
    const name = expense.name || expense.expense_name || 'Cheltuiala';
    const expenseId = expense.id || expense.expense_id || '';
    return `
      <div class="service-expense-row">
        <i style="--service-expense-color:${escapeHtml(color)}"></i>
        <span class="service-expense-row-copy"><strong>${escapeHtml(name)}</strong><small>Sincronizata cu clientul</small></span>
        <label class="service-expense-value">
          <input class="service-expense-cost-input" data-expense-id="${escapeHtml(expenseId)}" type="number" min="0" step="0.01" value="${escapeHtml(cost)}" placeholder="0.00" />
          <em class="service-expense-currency">RON</em>
        </label>
        <button type="button" class="service-expense-remove" aria-label="Elimina cheltuiala">&times;</button>
      </div>
    `;
  }

  function renderServiceExpenseEditor(sheet) {
    const selectedCosts = (Array.isArray(sheet.expense_costs) ? sheet.expense_costs : [])
      .filter((item) => item.expense_id);
    const total = selectedCosts.reduce((sum, item) => sum + Math.max(Number(item.cost || 0), 0), 0);
    return `
      <section class="service-expense-editor">
        <div class="service-expense-head">
          <span><small>Cheltuieli efective</small><strong>Cheltuieli sincronizate cu clientul</strong></span>
          <span class="service-expense-head-actions">
            <button type="button" id="service-expense-add-toggle">+ Adauga cheltuiala</button>
            <b id="service-expense-total">${escapeHtml(total.toFixed(2))} ${escapeHtml(currencyCode(sheet.currency_code))}</b>
          </span>
        </div>
        <div class="service-expense-picker" id="service-expense-picker" hidden>
          <input id="service-expense-search" type="search" placeholder="Cauta cheltuiala din Setari" />
          <div id="service-expense-options" class="service-expense-options"></div>
        </div>
        <div class="service-expense-list" id="service-expense-list">
          ${selectedCosts.map((item) => renderServiceExpenseRow(item, item.cost)).join('')}
          <div class="service-expense-empty" id="service-expense-empty" ${selectedCosts.length ? 'hidden' : ''}>Nu este selectata nicio cheltuiala.</div>
        </div>
        <p>Modificarile se salveaza in client si se preiau inapoi in fisa la fiecare deschidere.</p>
      </section>
    `;
  }

  function renderEditor(sheet) {
    if (!editorEl) return;
    selectedSheet = sheet;
    signatureDraft = sheet.client_signature || '';
    signatureSignedAtDraft = sheet.client_signed_at || '';
    const initialPayment = calculateServicePayment(
      sheet.total_price,
      sheet.diagnostic_price,
      sheet.advance_amount,
      sheet.client_package_price,
      sheet.client_discount
    );
    const initialPaymentStatus = normalizePaymentStatus(
      sheet.payment_status,
      initialPayment.amountDue,
      initialPayment.total
    );
    const initialTotalOnlyPayment = isServiceTotalOnlyPayment(
      sheet.total_price,
      sheet.diagnostic_price,
      sheet.advance_amount,
      sheet.client_package_price
    );
    const initialAmountDue = initialPaymentStatus === 'incasati'
      ? 0
      : displayServicePaymentDue(
          initialPayment,
          sheet.total_price,
          sheet.diagnostic_price,
          sheet.advance_amount,
          sheet.client_package_price
        );
    const initialPaymentStatusLabel = servicePaymentStatusLabel(
      initialPaymentStatus,
      initialPayment.amountDue,
      initialTotalOnlyPayment
    );
    const initialAmountDueLabel = initialTotalOnlyPayment ? 'Rest de plata' : `Rest de plata (${initialPaymentStatusLabel})`;
    const warrantyParts = parseDurationText(sheet.warranty || '', 'zile');
    const deadlineValue = sanitizeDurationNumber(sheet.deadline || '');
    const canViewFinancials = canNormallyViewFinancials() || financialEntryActive;
    const effectiveInternalParts = sheet.internal_parts_cost == null ? Number(sheet.parts_price || 0) : Number(sheet.internal_parts_cost || 0);
    const effectiveInternalLabor = sheet.internal_labor_cost == null ? Number(sheet.labor_price || 0) : Number(sheet.internal_labor_cost || 0);
    const effectiveInternalOther = Number(sheet.internal_other_costs || 0);
    const internalTotal = effectiveInternalParts + effectiveInternalLabor + effectiveInternalOther;
    const gtrotsRemaining = Math.max(initialPayment.total - internalTotal, 0);
    renderList();
    openModal();
    editorEl.innerHTML = `
      <form id="service-sheet-form" class="service-sheet-form">
        <div class="service-editor-header">
          <div>
            <div class="service-editor-kicker">Fisa service</div>
            <h2 id="service-modal-title">${escapeHtml(sheet.sheet_number || 'Fisa noua')}</h2>
            ${finalizedBadge(sheet)}
            <p>${sheet.id ? `Adaugata: ${escapeHtml(fmtDate(sheet.created_at))} - Modificata: ${escapeHtml(fmtDate(sheet.updated_at))}` : 'Completeaza datele si salveaza.'}</p>
            ${sheet.id ? `
              <button
                id="ss-show-company-details"
                type="button"
                class="service-company-switch"
                role="switch"
                aria-checked="${sheet.show_company_details ? 'true' : 'false'}"
                title="Alegerea se salveaza imediat, independent de restul fisei"
              >
                <span class="service-company-switch-track"><span></span></span>
                <span class="service-company-switch-copy">
                  <strong id="ss-company-details-label">${sheet.show_company_details ? 'Cu datele firmei' : 'Fara datele firmei'}</strong>
                  <small id="ss-company-details-status">PDF - apasa pentru schimbare</small>
                </span>
              </button>
            ` : ''}
          </div>
          <div class="service-editor-actions">
            ${actionButton('service-signature-btn', hasSignature() ? 'Semneaza din nou' : 'Semneaza client', 'signature', hasSignature() ? 'btn-ghost service-signature-action signed' : 'btn-ghost service-signature-action')}
            ${sheet.id && canNormallyViewFinancials() ? actionButton('service-open-pdf-btn', 'Share PDF', 'share') : ''}
            ${sheet.id && canNormallyViewFinancials() ? actionButton('service-download-pdf-btn', 'Download PDF', 'download') : ''}
            ${sheet.id && canNormallyViewFinancials() ? actionButton('service-whatsapp-pdf-btn', 'WhatsApp', 'whatsapp', 'btn-ghost service-whatsapp-action') : ''}
            ${sheet.id && canDeleteServiceSheets() ? actionButton('service-delete-btn', 'Sterge', 'trash', 'btn-ghost danger') : ''}
            ${actionButton('service-save-btn', 'Salveaza', 'save', 'btn-primary', 'submit')}
          </div>
        </div>

        <div class="service-form-section">
          <h3>Client si vehicul</h3>
          <div class="form-grid">
            ${field('ss-client-name', 'Nume / Firma', sheet.client_name)}
            ${field('ss-client-phone', 'Telefon', sheet.client_phone)}
            ${field('ss-client-email', 'E-mail', sheet.client_email || '', 'email')}
            ${field('ss-qr-code', 'Cod QR', sheet.qr_code || '')}
          </div>
          ${textarea('ss-client-address', 'Adresa client', sheet.client_address || '', 2)}
          <div class="form-grid">
            <label class="field">
              <span>Tip vehicul</span>
              <select id="ss-vehicle-type" name="ss-vehicle-type">
                <option value="trotineta" ${sheet.vehicle_type === 'trotineta' ? 'selected' : ''}>Trotineta</option>
                <option value="scuter" ${sheet.vehicle_type === 'scuter' ? 'selected' : ''}>Scuter</option>
                <option value="altul" ${sheet.vehicle_type === 'altul' ? 'selected' : ''}>Altul</option>
              </select>
            </label>
            ${field('ss-vehicle-brand-model', 'Marca / Model', sheet.vehicle_brand_model)}
            ${field('ss-vehicle-registration', 'Nr. inmatriculare', sheet.vehicle_registration)}
            ${field('ss-vehicle-series', 'Serie cadru / SN', sheet.vehicle_series)}
            ${field('ss-vehicle-km', 'KM', sheet.vehicle_km)}
            ${field('ss-vehicle-battery', 'Baterie', sheet.vehicle_battery)}
          </div>
        </div>

        <div class="service-form-section">
          <h3>Receptie si solicitare</h3>
          ${textarea('ss-issue-description', 'Defect / solicitare declarata', sheet.issue_description || '', 3)}
          ${textarea('ss-visible-damage', 'Avarii / urme vizibile', sheet.visible_damage || '', 2)}
          <div class="service-mini-section">
            <h4>Accesorii predate</h4>
            <div class="service-check-grid">
              ${check('ss-accessories-charger', 'Incarcator', sheet.accessories_charger)}
              ${check('ss-accessories-keys', 'Chei', sheet.accessories_keys)}
              ${check('ss-accessories-saddle', 'Sa', sheet.accessories_saddle)}
              ${check('ss-accessories-other', 'Altele', sheet.accessories_other)}
            </div>
          </div>
          <div class="service-mini-section">
            <h4>Detalii accesorii / altele</h4>
            ${field('ss-accessories-other-text', 'Detalii accesorii', sheet.accessories_other_text || '')}
          </div>
          <div class="service-mini-section">
            <h4>Constatari rapide</h4>
            <div class="service-check-grid">
              ${check('ss-quick-powers-on', 'Porneste', sheet.quick_powers_on)}
              ${check('ss-quick-impact', 'Nu porneste', sheet.quick_impact)}
              ${check('ss-quick-water-traces', 'Urme apa', sheet.quick_water_traces)}
              ${check('ss-quick-battery-risk', 'Risc baterie', sheet.quick_battery_risk)}
            </div>
          </div>
          <div class="service-mini-section">
            <h4>Poza produs</h4>
            <label class="field">
              <span>Poza produs</span>
              <select id="ss-product-photo" name="ss-product-photo">
                <option value="" ${!sheet.product_photo ? 'selected' : ''}>Nesetat</option>
                <option value="da" ${sheet.product_photo === 'da' ? 'selected' : ''}>DA</option>
                <option value="nu" ${sheet.product_photo === 'nu' ? 'selected' : ''}>NU</option>
              </select>
            </label>
          </div>
        </div>

        <div class="service-form-section">
          <h3>Diagnostic si interventie</h3>
          <div class="form-grid">
            ${field('ss-technician-name', 'Tehnician / Mecanic', sheet.technician_name || sheet.mechanic_name || '')}
            <label class="field">
              <span>Tip serviciu</span>
              <select id="ss-service-type" name="ss-service-type">
                ${['Verificare generala','Reparatie motor','Reparatie frane','Reparatie transmisie','Reparatie electrica','Inlocuire piese','Intretinere periodica','Garantie','Altele'].map((option) => `
                  <option ${String(sheet.service_type || '') === option ? 'selected' : ''}>${escapeHtml(option)}</option>
                `).join('')}
              </select>
            </label>
          </div>
          ${textarea('ss-diagnostic', 'Diagnostic / cauza', sheet.diagnostic || '', 3)}
          ${textarea('ss-work-performed', 'Lucrari efectuate / test final', sheet.work_performed || '', 3)}
          ${textarea('ss-parts-used', 'Piese inlocuite / utilizate', sheet.parts_used || '', 2)}
          ${textarea('ss-observations', 'Observatii', sheet.observations || '', 2)}
          ${!canViewFinancials ? `
            <div class="service-financial-locked">
              <strong>Valorile financiare sunt ascunse</strong>
              <span>Pot fi completate in fluxul deschis imediat dupa scanare; dupa salvare sunt restrictionate de administrator.</span>
            </div>
          ` : ''}
          <div class="form-grid service-money-grid" ${canViewFinancials ? '' : 'hidden'}>
            <label class="field">
              <span>Moneda tuturor valorilor</span>
              <input id="ss-currency-code" name="ss-currency-code" type="text" list="ss-currency-options" maxlength="3" value="${escapeHtml(currencyCode(sheet.currency_code))}" />
              <datalist id="ss-currency-options">${CURRENCIES.map((code) => `<option value="${code}"></option>`).join('')}</datalist>
            </label>
            ${field('ss-diagnostic-price', `Diagnostic (${currencyCode(sheet.currency_code)})`, sheet.diagnostic_price || 0, 'number', 'min="0" step="0.01"')}
            ${field('ss-parts-price', `Piese (${currencyCode(sheet.currency_code)})`, sheet.parts_price || 0, 'number', 'min="0" step="0.01"')}
            ${field('ss-labor-price', `Manopera afisata in fisa (${currencyCode(sheet.currency_code)})`, sheet.labor_price || 0, 'number', 'min="0" step="0.01"')}
            ${field('ss-internal-parts-cost', `Cost efectiv piese - intern (${currencyCode(sheet.currency_code)})`, sheet.internal_parts_cost ?? '', 'number', 'min="0" step="0.01" placeholder="Necompletat"')}
            ${field('ss-internal-labor-cost', `Cost efectiv manopera - intern (${currencyCode(sheet.currency_code)})`, sheet.internal_labor_cost ?? '', 'number', 'min="0" step="0.01" placeholder="Necompletat"')}
            <input id="ss-internal-other-costs" type="hidden" value="${escapeHtml(effectiveInternalOther)}" />
            ${renderServiceExpenseEditor(sheet)}
            ${field('ss-internal-total', `Cost intern efectiv (${currencyCode(sheet.currency_code)})`, internalTotal.toFixed(2), 'text', 'readonly disabled')}
            ${field('ss-gtrots-remaining', `Ramane pentru G-Trots (${currencyCode(sheet.currency_code)})`, gtrotsRemaining.toFixed(2), 'text', 'readonly disabled')}
            <div class="service-internal-cost-note"><strong>Regula cost intern</strong><span>Necompletat = valoarea afisata in fisa. Zero introdus ramane zero.</span></div>
            ${field('ss-total-price', `Pret total (${currencyCode(sheet.currency_code)})`, normalizeServiceSheetWorkPrice(sheet.total_price, sheet.diagnostic_price, sheet.client_package_price), 'number', 'min="0" step="0.01"')}
            ${field('ss-advance-amount', `Avans (${currencyCode(sheet.currency_code)})`, sheet.advance_amount || 0, 'number', 'min="0" step="0.01"')}
            ${field('ss-amount-due', `${initialAmountDueLabel} (${currencyCode(sheet.currency_code)})`, initialAmountDue.toFixed(2), 'text', 'readonly disabled')}
            <div class="field service-payment-status-field">
              <span>Status plata</span>
              <div class="service-check-grid service-payment-status-options">
                <label class="service-check">
                  <input id="ss-payment-unpaid" name="ss-payment-status" type="radio" value="de_incasat" ${initialPaymentStatus !== 'incasati' ? 'checked' : ''} />
                  <span>Neachitat</span>
                </label>
                <label class="service-check">
                  <input id="ss-payment-paid" name="ss-payment-status" type="radio" value="incasati" ${initialPaymentStatus === 'incasati' ? 'checked' : ''} />
                  <span>Achitat</span>
                </label>
              </div>
            </div>
            ${field('ss-client-discount', 'Reducere client (%)', sheet.client_discount || 0, 'number', 'min="0" max="100" step="0.01"')}
            ${field('ss-deadline', 'Termen', deadlineValue, 'number', 'min="0" step="1" inputmode="numeric"')}
            <label class="field">
              <span>Unitate termen</span>
              <select id="ss-deadline-unit" name="ss-deadline-unit">
                ${DEADLINE_UNITS.map((unit) => `<option value="${unit}" ${normalizeDurationUnit(sheet.deadline_unit || 'zile') === unit ? 'selected' : ''}>${escapeHtml(formatDurationLabel(2, unit).replace(/^2\s+/, ''))}</option>`).join('')}
              </select>
            </label>
            ${field('ss-warranty', 'Garantie', warrantyParts.value, 'number', 'min="0" step="1" inputmode="numeric"')}
            <label class="field">
              <span>Unitate garantie</span>
              <select id="ss-warranty-unit" name="ss-warranty-unit">
                ${WARRANTY_UNITS.map((unit) => `<option value="${unit}" ${warrantyParts.unit === unit ? 'selected' : ''}>${escapeHtml(formatDurationLabel(2, unit).replace(/^2\s+/, ''))}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>

        <div class="service-form-section">
          <h3>Acord / predare</h3>
          <div class="service-check-grid">
            ${check('ss-approve-diagnostic-test', 'Aprob diagnostic + test', sheet.approve_diagnostic_test)}
            ${check('ss-approve-repair-estimate', 'Aprob reparatia / devizul', sheet.approve_repair_estimate)}
            ${check('ss-reject-repair', 'Refuz reparatia', sheet.reject_repair)}
            ${check('ss-vehicle-delivered-checked', 'Vehicul predat si verificat', sheet.vehicle_delivered_checked)}
            ${check('ss-old-parts-client', 'Piese vechi la client', sheet.old_parts_client)}
            ${check('ss-old-parts-recycle', 'Piese vechi reciclare', sheet.old_parts_recycle)}
          </div>
          <div class="form-grid">
            ${field('ss-storage-fee-per-day', `Depozitare ${currencyCode(sheet.currency_code)}/zi`, sheet.storage_fee_per_day || 0, 'number', 'min="0" step="0.01"')}
            ${field('ss-storage-after-days', 'Dupa cate zile', sheet.storage_after_days || 0, 'number', 'min="0" step="1"')}
            ${dateTimeField('ss-finalized-at', 'Data / Ora Incheiere', sheet.finalized_at || '')}
          </div>
          <div class="service-signature-status${hasSignature() ? ' signed' : ''}" id="service-signature-status">
            <span class="service-signature-status-icon">${ICONS.signature}</span>
            <span>
              <strong id="service-signature-status-title">${hasSignature() ? 'Client semnat' : 'Semnatura client lipseste'}</strong>
              <small id="service-signature-status-subtitle">${hasSignature() ? `Semnata la ${escapeHtml(fmtDate(signatureSignedAtDraft))}` : 'Semnatura este obligatorie inainte de trimiterea PDF-ului.'}</small>
            </span>
          </div>
        </div>

        <input type="hidden" id="ss-id" value="${escapeHtml(sheet.id || '')}" />
        <input type="hidden" id="ss-client-id" value="${escapeHtml(sheet.client_id || '')}" />
        <div id="service-editor-error" class="error-box" style="display:none"></div>
      </form>
    `;
    attachEditorEvents();
  }

  function editorValue(id) {
    return document.getElementById(id)?.value?.trim() || '';
  }

  function editorChecked(id) {
    return Boolean(document.getElementById(id)?.checked);
  }

  function payloadFromEditor() {
    const diagnostic = Number(editorValue('ss-diagnostic-price') || 0);
    const parts = Number(editorValue('ss-parts-price') || 0);
    const labor = Number(editorValue('ss-labor-price') || 0);
    const rawTotal = Math.max(Number(editorValue('ss-total-price') || 0), 0);
    const total = rawTotal > 0 ? rawTotal : diagnostic;
    const discount = Math.min(100, Math.max(Number(editorValue('ss-client-discount') || 0), 0));
    const paymentPreview = calculateServicePayment(total, diagnostic, editorValue('ss-advance-amount'), 0, discount);
    const paymentStatus = normalizePaymentStatus(
      document.querySelector('input[name="ss-payment-status"]:checked')?.value,
      paymentPreview.amountDue,
      paymentPreview.total
    );
    let finalizedAt = fromDateTimeDisplay(editorValue('ss-finalized-at')) || null;
    if (paymentStatus === 'incasati' && !finalizedAt) {
      finalizedAt = fromDateTimeDisplay(currentDateTimeDisplay()) || null;
    }
    return {
      client_id: editorValue('ss-client-id') || null,
      qr_code: editorValue('ss-qr-code'),
      client_name: editorValue('ss-client-name'),
      client_phone: editorValue('ss-client-phone'),
      client_email: editorValue('ss-client-email') || null,
      client_address: editorValue('ss-client-address') || null,
      vehicle_type: editorValue('ss-vehicle-type') || 'trotineta',
      vehicle_brand_model: editorValue('ss-vehicle-brand-model'),
      vehicle_registration: editorValue('ss-vehicle-registration'),
      vehicle_series: editorValue('ss-vehicle-series'),
      vehicle_km: editorValue('ss-vehicle-km'),
      vehicle_battery: editorValue('ss-vehicle-battery'),
      issue_description: editorValue('ss-issue-description') || null,
      visible_damage: editorValue('ss-visible-damage') || null,
      accessories_charger: editorChecked('ss-accessories-charger') ? 1 : 0,
      accessories_keys: editorChecked('ss-accessories-keys') ? 1 : 0,
      accessories_saddle: editorChecked('ss-accessories-saddle') ? 1 : 0,
      accessories_other: editorChecked('ss-accessories-other') ? 1 : 0,
      accessories_other_text: editorValue('ss-accessories-other-text'),
      quick_powers_on: editorChecked('ss-quick-powers-on') ? 1 : 0,
      quick_water_traces: editorChecked('ss-quick-water-traces') ? 1 : 0,
      quick_impact: editorChecked('ss-quick-impact') ? 1 : 0,
      quick_battery_risk: editorChecked('ss-quick-battery-risk') ? 1 : 0,
      product_photo: editorValue('ss-product-photo'),
      diagnostic: editorValue('ss-diagnostic') || null,
      work_performed: editorValue('ss-work-performed') || null,
      parts_used: editorValue('ss-parts-used') || null,
      observations: editorValue('ss-observations') || null,
      diagnostic_price: diagnostic,
      parts_price: parts,
      labor_price: labor,
      internal_parts_cost: editorValue('ss-internal-parts-cost') === '' ? null : Math.max(Number(editorValue('ss-internal-parts-cost') || 0), 0),
      internal_labor_cost: editorValue('ss-internal-labor-cost') === '' ? null : Math.max(Number(editorValue('ss-internal-labor-cost') || 0), 0),
      internal_other_costs: serviceExpenseRows().reduce((sum, input) => sum + Math.max(Number(input.value || 0), 0), 0),
      expense_costs: serviceExpenseRows().map((input) => ({
        expense_id: input.dataset.expenseId,
        cost: Math.max(Number(input.value || 0), 0),
      })).filter((item) => item.expense_id),
      total_price: total,
      advance_amount: Math.max(Number(editorValue('ss-advance-amount') || 0), 0),
      currency_code: currencyCode(editorValue('ss-currency-code')),
      payment_status: paymentStatus,
      client_discount: discount,
      deadline: sanitizeDurationNumber(editorValue('ss-deadline')),
      deadline_unit: DEADLINE_UNITS.includes(normalizeDurationUnit(editorValue('ss-deadline-unit')))
        ? normalizeDurationUnit(editorValue('ss-deadline-unit'))
        : 'zile',
      warranty: formatDurationLabel(editorValue('ss-warranty'), editorValue('ss-warranty-unit')),
      storage_fee_per_day: Number(editorValue('ss-storage-fee-per-day') || 0),
      storage_after_days: Number(editorValue('ss-storage-after-days') || 0),
      old_parts_client: editorChecked('ss-old-parts-client') ? 1 : 0,
      old_parts_recycle: editorChecked('ss-old-parts-recycle') ? 1 : 0,
      approve_diagnostic_test: editorChecked('ss-approve-diagnostic-test') ? 1 : 0,
      approve_repair_estimate: editorChecked('ss-approve-repair-estimate') ? 1 : 0,
      reject_repair: editorChecked('ss-reject-repair') ? 1 : 0,
      vehicle_delivered_checked: editorChecked('ss-vehicle-delivered-checked') ? 1 : 0,
      client_signature: signatureDraft || null,
      client_signed_at: signatureSignedAtDraft || null,
      finalized_at: finalizedAt,
      technician_name: editorValue('ss-technician-name'),
      mechanic_name: editorValue('ss-technician-name'),
      service_type: editorValue('ss-service-type') || 'Verificare generala',
    };
  }

  function showEditorError(message) {
    const error = document.getElementById('service-editor-error');
    if (!error) return;
    error.className = 'error-box';
    error.textContent = message;
    error.style.display = 'block';
  }

  function clearEditorError() {
    const error = document.getElementById('service-editor-error');
    if (error) {
      error.className = 'error-box';
      error.style.display = 'none';
    }
  }

  function updateTotalIfNeeded() {
    updateAmountDue();
  }

  function updateAmountDue() {
    const total = Number(document.getElementById('ss-total-price')?.value || 0);
    const diagnostic = Number(document.getElementById('ss-diagnostic-price')?.value || 0);
    const advance = Math.max(Number(document.getElementById('ss-advance-amount')?.value || 0), 0);
    const discount = Math.min(100, Math.max(Number(document.getElementById('ss-client-discount')?.value || 0), 0));
    const payment = calculateServicePayment(total, diagnostic, advance, 0, discount);
    const totalOnlyPayment = isServiceTotalOnlyPayment(total, diagnostic, advance);
    const paymentStatus = normalizePaymentStatus(
      document.querySelector('input[name="ss-payment-status"]:checked')?.value,
      payment.amountDue,
      payment.total
    );
    const dueInput = document.getElementById('ss-amount-due');
    if (dueInput) {
      dueInput.value = (paymentStatus === 'incasati'
        ? 0
        : displayServicePaymentDue(payment, total, diagnostic, advance)
      ).toFixed(2);
    }
    if (!totalOnlyPayment && payment.amountDue <= 0.00001 && payment.total > 0) {
      const paidRadio = document.getElementById('ss-payment-paid');
      if (paidRadio) paidRadio.checked = true;
    }
    if (paymentStatus === 'incasati') {
      const finalizedAtInput = document.getElementById('ss-finalized-at');
      if (finalizedAtInput && !finalizedAtInput.value.trim()) {
        finalizedAtInput.value = currentDateTimeDisplay();
      }
    }
    const nullableCost = (id) => {
      const input = document.getElementById(id);
      return !input || input.value.trim() === '' ? null : Math.max(Number(input.value || 0), 0);
    };
    const displayedParts = Math.max(Number(document.getElementById('ss-parts-price')?.value || 0), 0);
    const displayedLabor = Math.max(Number(document.getElementById('ss-labor-price')?.value || 0), 0);
    const internalParts = nullableCost('ss-internal-parts-cost');
    const internalLabor = nullableCost('ss-internal-labor-cost');
    const internalOther = nullableCost('ss-internal-other-costs') ?? 0;
    const internalTotal = (internalParts === null ? displayedParts : internalParts)
      + (internalLabor === null ? displayedLabor : internalLabor)
      + internalOther;
    const internalTotalInput = document.getElementById('ss-internal-total');
    const gtrotsInput = document.getElementById('ss-gtrots-remaining');
    if (internalTotalInput) internalTotalInput.value = internalTotal.toFixed(2);
    if (gtrotsInput) gtrotsInput.value = Math.max(payment.total - internalTotal, 0).toFixed(2);
    updateFinancialCurrencyLabels();
  }

  function updateFinancialCurrencyLabels() {
    const currency = currencyCode(document.getElementById('ss-currency-code')?.value);
    const labels = {
      'ss-diagnostic-price': 'Diagnostic',
      'ss-parts-price': 'Piese',
      'ss-labor-price': 'Manopera afisata in fisa',
      'ss-internal-parts-cost': 'Cost efectiv piese - intern',
      'ss-internal-labor-cost': 'Cost efectiv manopera - intern',
      'ss-internal-other-costs': 'Alte costuri efective - intern',
      'ss-internal-total': 'Cost intern efectiv',
      'ss-gtrots-remaining': 'Ramane pentru G-Trots',
      'ss-total-price': 'Pret total',
      'ss-advance-amount': 'Avans',
      'ss-amount-due': 'Rest de plata',
      'ss-storage-fee-per-day': 'Depozitare',
    };
    const total = Number(document.getElementById('ss-total-price')?.value || 0);
    const diagnostic = Number(document.getElementById('ss-diagnostic-price')?.value || 0);
    const advance = Math.max(Number(document.getElementById('ss-advance-amount')?.value || 0), 0);
    const discount = Math.min(100, Math.max(Number(document.getElementById('ss-client-discount')?.value || 0), 0));
    const payment = calculateServicePayment(total, diagnostic, advance, 0, discount);
    const totalOnlyPayment = isServiceTotalOnlyPayment(total, diagnostic, advance);
    const paymentStatus = normalizePaymentStatus(
      document.querySelector('input[name="ss-payment-status"]:checked')?.value,
      payment.amountDue,
      payment.total
    );
    const statusLabel = servicePaymentStatusLabel(paymentStatus, payment.amountDue, totalOnlyPayment);
    Object.entries(labels).forEach(([id, label]) => {
      const input = document.getElementById(id);
      const caption = input?.closest('label')?.querySelector('span');
      if (caption) {
        if (id === 'ss-amount-due') {
          caption.textContent = totalOnlyPayment
            ? `${label} (${currency})`
            : `${label} (${statusLabel}) (${currency})`;
        } else if (id === 'ss-total-price') {
          caption.textContent = `${label} (${statusLabel}) (${currency})`;
        } else {
          caption.textContent = `${label} (${currency}${id === 'ss-storage-fee-per-day' ? '/zi' : ''})`;
        }
      }
    });
  }

  function syncServiceExpenseTotal() {
    const total = serviceExpenseRows().reduce((sum, input) => sum + Math.max(Number(input.value || 0), 0), 0);
    const currency = currencyCode(document.getElementById('ss-currency-code')?.value);
    const hiddenTotal = document.getElementById('ss-internal-other-costs');
    const totalLabel = document.getElementById('service-expense-total');
    const empty = document.getElementById('service-expense-empty');
    if (hiddenTotal) hiddenTotal.value = total.toFixed(2);
    if (totalLabel) totalLabel.textContent = `${total.toFixed(2)} ${currency}`;
    if (empty) empty.hidden = serviceExpenseRows().length > 0;
    document.querySelectorAll('.service-expense-currency').forEach((element) => {
      element.textContent = currency;
    });
  }

  function wireServiceExpenseRows() {
    serviceExpenseRows().forEach((input) => {
      if (input.dataset.wired === 'true') return;
      input.dataset.wired = 'true';
      input.addEventListener('input', () => {
        syncServiceExpenseTotal();
        updateAmountDue();
      });
    });
    document.querySelectorAll('.service-expense-remove').forEach((button) => {
      if (button.dataset.wired === 'true') return;
      button.dataset.wired = 'true';
      button.addEventListener('click', () => {
        button.closest('.service-expense-row')?.remove();
        syncServiceExpenseTotal();
        refreshServiceExpenseOptions();
        updateAmountDue();
      });
    });
  }

  function refreshServiceExpenseOptions() {
    const options = document.getElementById('service-expense-options');
    const search = document.getElementById('service-expense-search');
    if (!options) return;
    const selectedIds = new Set(serviceExpenseRows().map((input) => String(input.dataset.expenseId || '')));
    const query = String(search?.value || '').trim().toLocaleLowerCase('ro');
    const available = expenseCategories
      .filter((expense) => !selectedIds.has(String(expense.id)))
      .filter((expense) => !query || String(expense.name || '').toLocaleLowerCase('ro').includes(query));
    options.innerHTML = available.map((expense) => `
      <button type="button" class="service-expense-option" data-expense-id="${escapeHtml(expense.id)}">
        <i style="--service-expense-color:${escapeHtml(expense.color || '#EF4444')}"></i>
        <span><strong>${escapeHtml(expense.name)}</strong><small>Din Setari</small></span>
        <b>+</b>
      </button>
    `).join('') || '<div class="service-expense-options-empty">Nu exista alte cheltuieli disponibile.</div>';
    options.querySelectorAll('.service-expense-option').forEach((button) => {
      button.addEventListener('click', () => {
        const expense = expenseCategories.find((item) => String(item.id) === String(button.dataset.expenseId));
        if (!expense || selectedIds.has(String(expense.id))) return;
        document.getElementById('service-expense-list')?.insertAdjacentHTML('beforeend', renderServiceExpenseRow(expense, ''));
        wireServiceExpenseRows();
        syncServiceExpenseTotal();
        refreshServiceExpenseOptions();
        updateAmountDue();
      });
    });
  }

  function attachEditorEvents() {
    const form = document.getElementById('service-sheet-form');
    form?.addEventListener('submit', saveCurrentSheet);
    let lastDiagnosticValue = Number(document.getElementById('ss-diagnostic-price')?.value || 0);
    document.getElementById('ss-diagnostic-price')?.addEventListener('input', (event) => {
      const totalInput = document.getElementById('ss-total-price');
      const currentTotal = Number(totalInput?.value || 0);
      const nextDiagnostic = Number(event.target.value || 0);
      const shouldMirrorToTotal =
        nextDiagnostic > 0
        && (currentTotal <= 0 || Math.abs(currentTotal - lastDiagnosticValue) < 0.01);
      if (shouldMirrorToTotal && totalInput) {
        totalInput.value = event.target.value;
      }
      lastDiagnosticValue = nextDiagnostic;
      updateTotalIfNeeded();
    });
    ['ss-parts-price', 'ss-labor-price', 'ss-client-discount', 'ss-internal-parts-cost', 'ss-internal-labor-cost'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', updateTotalIfNeeded);
    });
    document.getElementById('ss-total-price')?.addEventListener('input', (event) => {
      updateAmountDue();
    });
    ['ss-deadline', 'ss-warranty'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', (event) => {
        event.target.value = sanitizeDurationNumber(event.target.value);
      });
    });
    document.getElementById('ss-advance-amount')?.addEventListener('input', updateAmountDue);
    document.querySelectorAll('input[name="ss-payment-status"]').forEach((input) => {
      input.addEventListener('change', updateAmountDue);
    });
    document.getElementById('ss-currency-code')?.addEventListener('input', () => {
      updateFinancialCurrencyLabels();
      syncServiceExpenseTotal();
    });
    document.getElementById('service-expense-add-toggle')?.addEventListener('click', () => {
      const picker = document.getElementById('service-expense-picker');
      if (!picker) return;
      picker.toggleAttribute('hidden');
      if (!picker.hidden) {
        refreshServiceExpenseOptions();
        document.getElementById('service-expense-search')?.focus();
      }
    });
    document.getElementById('service-expense-search')?.addEventListener('input', refreshServiceExpenseOptions);
    document.getElementById('ss-show-company-details')?.addEventListener('click', updateCompanyDetailsVisibility);
    document.getElementById('service-download-pdf-btn')?.addEventListener('click', downloadPdf);
    document.getElementById('service-open-pdf-btn')?.addEventListener('click', openPdfForShare);
    document.getElementById('service-whatsapp-pdf-btn')?.addEventListener('click', sendPdfOnWhatsApp);
    document.getElementById('service-signature-btn')?.addEventListener('click', openSignatureModal);
    document.getElementById('service-delete-btn')?.addEventListener('click', deleteCurrentSheet);
    document.getElementById('ss-finalized-at-now')?.addEventListener('click', () => {
      const input = document.getElementById('ss-finalized-at');
      if (input) input.value = currentDateTimeDisplay();
    });
    document.getElementById('ss-finalized-at')?.addEventListener('blur', (event) => {
      const normalized = formatDateTimeDisplay(event.target.value);
      if (normalized) event.target.value = normalized;
    });
    wireServiceExpenseRows();
    refreshServiceExpenseOptions();
    syncServiceExpenseTotal();
    updateAmountDue();
    updateFinancialCurrencyLabels();
  }

  async function updateCompanyDetailsVisibility(event) {
    if (!selectedSheet?.id) return;
    const control = event.currentTarget;
    const label = document.getElementById('ss-company-details-label');
    const status = document.getElementById('ss-company-details-status');
    const previous = !!selectedSheet.show_company_details;
    const next = !previous;
    control.disabled = true;
    control.setAttribute('aria-checked', next ? 'true' : 'false');
    if (label) label.textContent = next ? 'Cu datele firmei' : 'Fara datele firmei';
    if (status) status.textContent = 'Se salveaza...';
    try {
      const updated = await window.API.updateServiceSheetCompanyDetails(token(), selectedSheet.id, next);
      selectedSheet = updated;
      const index = sheets.findIndex((sheet) => sheet.id === updated.id);
      if (index >= 0) sheets[index] = updated;
      control.setAttribute('aria-checked', updated.show_company_details ? 'true' : 'false');
      if (label) label.textContent = updated.show_company_details ? 'Cu datele firmei' : 'Fara datele firmei';
      if (status) status.textContent = 'PDF - optiune salvata';
    } catch (error) {
      control.setAttribute('aria-checked', previous ? 'true' : 'false');
      if (label) label.textContent = previous ? 'Cu datele firmei' : 'Fara datele firmei';
      if (status) status.textContent = 'PDF - apasa pentru schimbare';
      showEditorError(error.message || 'Optiunea PDF nu a putut fi salvata.');
    } finally {
      control.disabled = false;
    }
  }

  async function selectSheet(id, fetchFresh = true) {
    financialEntryActive = false;
    const local = sheets.find((sheet) => sheet.id === id);
    if (local) renderEditor(local);
    if (!fetchFresh || !id) return;
    try {
      const fresh = await window.API.getServiceSheetById(token(), id);
      const index = sheets.findIndex((sheet) => sheet.id === id);
      if (index >= 0) sheets[index] = fresh;
      selectedSheet = fresh;
      renderEditor(fresh);
    } catch (error) {
      showEditorError(error.message || 'Fisa nu a putut fi incarcata.');
    }
  }

  async function saveCurrentSheet(event) {
    event?.preventDefault?.();
    clearEditorError();
    const saveBtn = document.getElementById('service-save-btn');
    const id = editorValue('ss-id');
    const payload = payloadFromEditor();
    if (!payload.client_name.trim()) return showEditorError('Numele clientului este obligatoriu.');
    if (!payload.client_phone.trim()) return showEditorError('Telefonul clientului este obligatoriu.');
    if (saveBtn) {
      saveBtn.disabled = true;
      setActionButtonLabel(saveBtn, 'Se salveaza...');
    }
    try {
      const saved = id
        ? await window.API.updateServiceSheet(token(), id, payload, financialEntryActive)
        : await window.API.createServiceSheet(token(), payload);
      if (!canNormallyViewFinancials() && financialEntryActive) {
        financialEntryActive = false;
      }
      const index = sheets.findIndex((sheet) => sheet.id === saved.id);
      if (index >= 0) sheets[index] = saved;
      else sheets.unshift(saved);
      selectedSheet = saved;
      renderEditor(saved);
      window.dispatchEvent(new CustomEvent('clients-change'));
      window.dispatchEvent(new CustomEvent('service-sheets-change'));
      return saved;
    } catch (error) {
      showEditorError(error.message || 'Fisa nu a putut fi salvata.');
      return null;
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        setActionButtonLabel(saveBtn, 'Salveaza');
      }
    }
  }

  async function downloadPdf() {
    if (!selectedSheet?.id) return;
    try {
      const saved = await saveCurrentSheet();
      if (!saved?.id) return;
      const bytes = await window.API.downloadServiceSheetPdf(token(), saved.id);
      const result = await window.savePdf(sheetPdfFileName(), bytes);
      if (result?.success) {
        const btn = document.getElementById('service-download-pdf-btn');
        if (btn) {
          setActionButtonLabel(btn, 'PDF salvat!');
          setTimeout(() => { setActionButtonLabel(btn, 'Download PDF'); }, 1800);
        }
      }
    } catch (error) {
      showEditorError(error.message || 'PDF-ul nu a putut fi descarcat.');
    }
  }

  async function openPdfForShare() {
    if (!selectedSheet?.id) return;
    try {
      const saved = await saveCurrentSheet();
      if (!saved?.id) return;
      if (!hasSignature(saved.client_signature)) {
        showSignatureRequired();
        return;
      }
      await shell.openExternal(window.API.getServiceSheetPdfUrl(token(), saved.id));
    } catch (error) {
      showEditorError(error.message || 'PDF-ul nu a putut fi deschis.');
    }
  }

  async function sendPdfOnWhatsApp() {
    if (!selectedSheet?.id) return;
    clearEditorError();
    const btn = document.getElementById('service-whatsapp-pdf-btn');
    if (btn) {
      btn.disabled = true;
      setActionButtonLabel(btn, 'Urc PDF...');
    }
    try {
      const saved = await saveCurrentSheet();
      if (!saved?.id) return;
      if (!hasSignature(saved.client_signature)) {
        showSignatureRequired();
        return;
      }
      const phone = whatsappPhone(saved.client_phone);
      if (!phone) {
        throw new Error('Numarul clientului nu este valid pentru WhatsApp.');
      }
      const share = await window.API.createServiceSheetPdfShareLink(token(), saved.id);
      const shareUrl = String(share?.share_url || '').trim();
      if (!share?.success || !shareUrl) {
        throw new Error(share?.error || 'PDF-ul nu a putut fi incarcat pe server.');
      }
      const message = `Buna ziua,\nAccesati linkul pentru a descarca fisa de service in format PDF: ${shareUrl}`;
      const whatsappUrl = `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;
      await shell.openExternal(whatsappUrl);
      const info = document.getElementById('service-editor-error');
      if (info) {
        info.className = 'info-box';
        info.textContent = 'PDF-ul a fost incarcat pe server si conversatia clientului s-a deschis cu linkul pregatit.';
        info.style.display = 'block';
      }
      if (btn) {
        setActionButtonLabel(btn, 'Link pregatit');
        setTimeout(() => { setActionButtonLabel(btn, 'WhatsApp'); }, 2000);
      }
    } catch (error) {
      showEditorError(error.message || 'PDF-ul nu a putut fi pregatit pentru WhatsApp.');
      if (btn) setActionButtonLabel(btn, 'WhatsApp');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  signatureCanvas?.addEventListener('pointerdown', (event) => {
    signatureDrawing = true;
    signatureCanvas.setPointerCapture?.(event.pointerId);
    signatureActiveStroke = [signaturePoint(event)];
    signatureStrokes.push(signatureActiveStroke);
    drawSignatureCanvas();
  });
  signatureCanvas?.addEventListener('pointermove', (event) => {
    if (!signatureDrawing || !signatureActiveStroke) return;
    const point = signaturePoint(event);
    const previous = signatureActiveStroke[signatureActiveStroke.length - 1];
    if (Math.abs(previous[0] - point[0]) + Math.abs(previous[1] - point[1]) < 0.003) return;
    signatureActiveStroke.push(point);
    drawSignatureCanvas();
  });
  const stopSignatureDrawing = () => {
    signatureDrawing = false;
    signatureActiveStroke = null;
    drawSignatureCanvas();
  };
  signatureCanvas?.addEventListener('pointerup', stopSignatureDrawing);
  signatureCanvas?.addEventListener('pointercancel', stopSignatureDrawing);
  signatureCanvas?.addEventListener('pointerleave', (event) => {
    if (signatureDrawing && event.buttons === 0) stopSignatureDrawing();
  });
  signatureClearBtn?.addEventListener('click', () => {
    signatureStrokes = [];
    drawSignatureCanvas();
  });
  signatureCloseBtn?.addEventListener('click', closeSignatureModal);
  signatureModalEl?.addEventListener('click', (event) => {
    if (event.target === signatureModalEl) closeSignatureModal();
  });
  signatureSaveBtn?.addEventListener('click', async () => {
    const validStrokes = signatureStrokes.filter((stroke) => stroke.length >= 2);
    if (!validStrokes.length) {
      if (window.Swal?.fire) {
        window.Swal.fire({ icon: 'warning', title: 'Semnatura lipseste', text: 'Clientul trebuie sa semneze in caseta.' });
      }
      return;
    }
    signatureSaveBtn.disabled = true;
    signatureSaveBtn.textContent = 'Se salveaza...';
    const canvasRect = signatureCanvas?.getBoundingClientRect();
    signatureDraft = JSON.stringify({
      v: 1,
      aspect_ratio: Math.max(0.8, Math.min(5, (canvasRect?.width || 1) / Math.max(1, canvasRect?.height || 1))),
      strokes: validStrokes,
    });
    signatureSignedAtDraft = new Date().toISOString();
    closeSignatureModal();
    updateSignatureUi();
    try {
      if (selectedSheet?.id) {
        await saveCurrentSheet();
      }
    } finally {
      signatureSaveBtn.disabled = false;
      signatureSaveBtn.textContent = 'Salveaza semnatura';
    }
  });
  window.addEventListener('resize', () => {
    if (signatureModalEl && !signatureModalEl.hidden) drawSignatureCanvas();
  });

  async function deleteCurrentSheet() {
    if (!selectedSheet?.id) return;
    if (!canDeleteServiceSheets()) {
      showEditorError('Doar adminul sau managerul poate sterge fise de service.');
      return;
    }
    if (!confirm(`Stergi fisa ${selectedSheet.sheet_number}?`)) return;
    try {
      await window.API.deleteServiceSheet(token(), selectedSheet.id);
      sheets = sheets.filter((sheet) => sheet.id !== selectedSheet.id);
      selectedSheet = null;
      renderList();
      closeModal();
    } catch (error) {
      showEditorError(error.message || 'Fisa nu a putut fi stearsa.');
    }
  }

  async function promptCompanyDetailsForNewSheet() {
    document.querySelector('.service-pdf-choice-modal')?.remove();

    return new Promise((resolve) => {
      let withCompanyDetails = false;
      let finished = false;
      const modal = document.createElement('div');
      modal.className = 'service-pdf-choice-modal';
      modal.innerHTML = `
        <section class="service-pdf-choice-card" role="dialog" aria-modal="true" aria-labelledby="service-pdf-choice-title">
          <div class="service-pdf-choice-glow" aria-hidden="true"></div>
          <header class="service-pdf-choice-header">
            <span class="service-pdf-choice-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h4"/></svg>
            </span>
            <div>
              <span class="service-pdf-choice-kicker">Configurare document</span>
              <h2 id="service-pdf-choice-title">Cum creezi fisa de service?</h2>
              <p>Alege varianta PDF. O poti schimba oricand din partea de sus a fisei.</p>
            </div>
            <button type="button" class="service-pdf-choice-close" aria-label="Inchide">
              <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>
            </button>
          </header>

          <div class="service-pdf-choice-options" role="radiogroup" aria-label="Date firma in PDF">
            <button type="button" class="service-pdf-choice-option is-selected" data-company-details="false" role="radio" aria-checked="true">
              <span class="service-pdf-choice-option-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5"/><path d="M9 13h7M9 17h5"/></svg>
              </span>
              <span class="service-pdf-choice-option-copy">
                <strong>Fara datele firmei</strong>
                <small>Document simplu, fara informatiile prestatorului</small>
                <em>Prestabilit</em>
              </span>
              <span class="service-pdf-choice-radio" aria-hidden="true"><i></i></span>
            </button>

            <button type="button" class="service-pdf-choice-option" data-company-details="true" role="radio" aria-checked="false">
              <span class="service-pdf-choice-option-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 21h16M6 21V8l6-4 6 4v13M9 12h.01M15 12h.01M9 16h.01M15 16h.01"/></svg>
              </span>
              <span class="service-pdf-choice-option-copy">
                <strong>Cu datele firmei</strong>
                <small>Include prestatorul si informatiile firmei in PDF</small>
              </span>
              <span class="service-pdf-choice-radio" aria-hidden="true"><i></i></span>
            </button>
          </div>

          <div class="service-pdf-choice-notice">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/><path d="M12 11v6M12 7h.01"/></svg>
            <span id="service-pdf-choice-summary"><strong>Fara datele firmei</strong> se va folosi pentru download, share si WhatsApp.</span>
          </div>

          <footer class="service-pdf-choice-actions">
            <button type="button" class="service-pdf-choice-cancel">Anuleaza</button>
            <button type="button" class="service-pdf-choice-confirm">
              <span>Creeaza fisa</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </footer>
        </section>`;

      const options = [...modal.querySelectorAll('[data-company-details]')];
      const summary = modal.querySelector('#service-pdf-choice-summary');
      const closeButton = modal.querySelector('.service-pdf-choice-close');
      const cancelButton = modal.querySelector('.service-pdf-choice-cancel');
      const confirmButton = modal.querySelector('.service-pdf-choice-confirm');

      const select = (value) => {
        withCompanyDetails = value;
        options.forEach((option) => {
          const selected = option.dataset.companyDetails === String(value);
          option.classList.toggle('is-selected', selected);
          option.setAttribute('aria-checked', selected ? 'true' : 'false');
        });
        if (summary) {
          summary.innerHTML = `<strong>${value ? 'Cu datele firmei' : 'Fara datele firmei'}</strong> se va folosi pentru download, share si WhatsApp.`;
        }
      };

      const finish = (value) => {
        if (finished) return;
        finished = true;
        document.removeEventListener('keydown', onKeyDown);
        modal.classList.remove('is-visible');
        window.setTimeout(() => modal.remove(), 180);
        resolve(value);
      };

      const onKeyDown = (event) => {
        if (event.key === 'Escape') finish(null);
        if (event.key === 'Enter') finish(withCompanyDetails);
      };

      options.forEach((option) => {
        option.addEventListener('click', () => select(option.dataset.companyDetails === 'true'));
      });
      closeButton?.addEventListener('click', () => finish(null));
      cancelButton?.addEventListener('click', () => finish(null));
      confirmButton?.addEventListener('click', () => finish(withCompanyDetails));
      modal.addEventListener('click', (event) => {
        if (event.target === modal) finish(null);
      });
      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(modal);
      window.requestAnimationFrame(() => {
        modal.classList.add('is-visible');
        options[0]?.focus();
      });
    });
  }
  async function openClientSheet(client, forceNew = false, fromScanner = false) {
    if (!client?.id || !token() || !editorEl) return;
    financialEntryActive = Boolean(fromScanner);
    openModal();
    editorEl.innerHTML = '<div class="loading">Se pregateste fisa de service...</div>';
    try {
      const existing = forceNew
        ? []
        : await window.API.getServiceSheets({ clientId: client.id, sortBy: 'updated_at', sortDir: 'desc' });
      let sheet;
      if (existing.length > 0) {
        sheet = fromScanner
          ? await window.API.getServiceSheetById(token(), existing[0].id, true)
          : existing[0];
      } else {
        let showCompanyDetails = false;
        if (!fromScanner) {
          showCompanyDetails = await promptCompanyDetailsForNewSheet();
          if (showCompanyDetails === null) {
            closeModal();
            return;
          }
        }
        sheet = await window.API.getOrCreateServiceSheetForClient(
          token(),
          client.id,
          forceNew,
          showCompanyDetails,
          fromScanner
        );
      }
      const index = sheets.findIndex((item) => item.id === sheet.id);
      if (index >= 0) sheets[index] = sheet;
      else sheets.unshift(sheet);
      selectedSheet = sheet;
      renderEditor(sheet);
    } catch (error) {
      editorEl.innerHTML = `<div class="error-box">${escapeHtml(error.message || 'Fisa nu a putut fi creata.')}</div>`;
    } finally {
      window.SCANNER_CLIENT = null;
    }
  }

  listEl?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-service-action]');
    if (action) {
      event.stopPropagation();
      if (action.dataset.serviceAction === 'edit') {
        selectSheet(action.dataset.serviceId);
      }
      return;
    }
    const row = event.target.closest('[data-service-id]');
    if (!row) return;
    selectSheet(row.dataset.serviceId);
  });

  searchEl?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadSheets(''), 250);
  });

  sortEl?.addEventListener('change', () => {
    syncSortFromSelect(false);
    loadSheets(selectedSheet?.id || '');
  });
  paymentFilterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.servicePaymentFilter || '';
      paymentFilter = paymentFilter === next ? '' : next;
      updateServiceChipState();
      renderList();
      loadSheets(selectedSheet?.id || '');
    });
  });
  sortChipButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const [nextSortBy = '', nextSortDir = ''] = String(button.dataset.serviceSortChip || '').split(':');
      if (sortBy === nextSortBy && sortDir === nextSortDir) {
        sortBy = '';
        sortDir = '';
        filterColumn = '';
      } else {
        sortBy = nextSortBy;
        sortDir = nextSortDir === 'asc' ? 'asc' : 'desc';
        filterColumn = '';
      }
      syncSortSelect();
      updateColumnHeaderState();
      updateServiceChipState();
      updateSearchPlaceholder();
      renderList();
      loadSheets(selectedSheet?.id || '');
    });
  });
  refreshBtn?.addEventListener('click', () => loadSheets(selectedSheet?.id || ''));
  newBtn?.addEventListener('click', () => renderEditor(blankSheet()));
  columnHeaderButtons.forEach((button) => {
    button.addEventListener('click', () => setColumnSort(button.dataset.serviceColumn || ''));
  });
  closeModalBtn?.addEventListener('click', closeModal);
  modalEl?.addEventListener('click', (event) => {
    if (event.target === modalEl) closeModal();
  });
  updateServiceChipState();
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isModalOpen()) closeModal();
  });

  window.openServiceSheetForClient = openClientSheet;

  window.addEventListener('tab-change', ({ detail }) => {
    if (detail !== 'service') return;
    const scannedClient = window.SCANNER_CLIENT;
    if (scannedClient) {
      openClientSheet(scannedClient, false, true);
      return;
    }
    if (!sheets.length && !loading) loadSheets();
  });

  window.addEventListener('service-sheets-change', () => loadSheets(selectedSheet?.id || ''));
  window.addEventListener('clients-change', () => {
    if (document.getElementById('tab-service')?.classList.contains('active')) {
      loadSheets(selectedSheet?.id || '');
    }
  });

  syncSortFromSelect(false);
})();
