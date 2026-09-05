(() => {
  const isLocal = /^(?:127\.0\.0\.1|localhost)$/i.test(location.hostname);
  const API = isLocal ? 'https://g-trots.ro/shop-api/api-v2.php' : '/shop-api/api-v2.php';
  const verify = document.querySelector('#return-verify');
  const configure = document.querySelector('#return-configure');
  const success = document.querySelector('#return-success');
  const verifyError = document.querySelector('#verify-error');
  const configureError = document.querySelector('#configure-error');
  let verified = null;

  class ApiError extends Error {
    constructor(message, status = 0, payload = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.payload = payload;
    }
  }

  const money = value => new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: verified?.order?.currency || 'RON',
  }).format(Number(value || 0));

  const normalizeOrderNumber = value => {
    let number = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (/^GT\d{8}-/.test(number)) number = `GT-${number.slice(2)}`;
    return number;
  };

  const payload = () => {
    const values = Object.fromEntries(new FormData(verify));
    values.order_number = normalizeOrderNumber(values.order_number);
    values.email = String(values.email || '').trim().toLowerCase();
    verify.elements.order_number.value = values.order_number;
    verify.elements.email.value = values.email;
    return values;
  };

  const setStep = number => document.querySelectorAll('[data-progress]').forEach(element => {
    const step = Number(element.dataset.progress);
    element.classList.toggle('active', step === number);
    element.classList.toggle('complete', step < number);
  });

  async function call(action, body = null, options = {}) {
    const query = new URLSearchParams({ action, ...(options.query || {}) });
    let response;
    try {
      response = await fetch(`${API}?${query}`, {
        method: options.method || 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiError('Nu ne-am putut conecta la serviciul G-Trots. Verifică internetul și încearcă din nou.');
    }
    const contentType = String(response.headers.get('content-type') || '');
    const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
    if (!response.ok) {
      const fallback = response.status === 404
        ? 'Serviciul de retur nu este disponibil pe această adresă.'
        : 'Solicitarea nu a putut fi verificată acum. Încearcă din nou.';
      throw new ApiError(data.error || fallback, response.status, data);
    }
    if (!contentType.includes('application/json')) {
      throw new ApiError('Serverul a trimis un răspuns neașteptat. Reîncarcă pagina și încearcă din nou.', response.status);
    }
    return data;
  }

  function eligibilityFromTracking(order) {
    if (!order?.can_request_return) {
      const labels = {
        cancelled: 'Comanda este anulată și nu poate intra în fluxul de retur.',
        return_requested: 'Pentru această comandă există deja o solicitare de retur.',
        return_refused: 'Solicitarea acestei comenzi este deja în analiza echipei G-Trots.',
        return_confirmed: 'Returul acestei comenzi a fost deja confirmat.',
        refunded: 'Comanda a fost deja rambursată.',
      };
      throw new ApiError(labels[order?.status] || 'Returul poate fi solicitat numai pentru o comandă livrată și aflată în termen.');
    }
    const isBusiness = order.customer_type === 'company';
    const days = isBusiness ? 14 : 30;
    const completedEntry = [...(order.status_history || [])].reverse().find(entry => entry.to_status === 'completed');
    const completedAt = new Date(String(completedEntry?.created_at || order.updated_at || order.created_at || '').replace(' ', 'T'));
    const deadline = Number.isNaN(completedAt.getTime()) ? new Date() : new Date(completedAt);
    deadline.setDate(deadline.getDate() + days);
    deadline.setHours(23, 59, 59, 999);
    const remaining = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000));
    const statutoryDeadline = new Date(completedAt);
    statutoryDeadline.setDate(statutoryDeadline.getDate() + 14);
    statutoryDeadline.setHours(23, 59, 59, 999);
    return {
      eligible: true,
      policy_type: isBusiness ? 'b2b_commercial' : 'b2c_withdrawal',
      deadline_at: deadline.toISOString(),
      days_remaining: remaining,
      return_window_days: days,
      initial_shipping_refundable: !isBusiness && Date.now() <= statutoryDeadline.getTime(),
    };
  }

  function verifiedFromTracking(order) {
    const eligibility = eligibilityFromTracking(order);
    return {
      verified: true,
      compatibility_mode: true,
      order: {
        order_number: order.order_number,
        customer_type: order.customer_type,
        customer_display_name: order.customer_display_name || order.company_name || order.customer_name,
        currency: order.currency || 'RON',
        return_cost: Number(order.configured_return_shipping_cost ?? order.return_shipping_cost ?? 0),
        initial_shipping_cost: Number(order.shipping_cost || 0),
        initial_shipping_refundable: eligibility.initial_shipping_refundable,
        items: (order.items || []).map(item => {
          const quantity = Math.max(1, Number(item.quantity || 1));
          const lineValue = Number(item.discounted_line_total ?? item.line_total ?? 0);
          return {
            order_item_id: String(item.order_item_id || item.id || ''),
            product_name: String(item.product_name || 'Produs G-Trots'),
            product_sku: String(item.product_sku || ''),
            quantity,
            unit_refund_value: Number(item.discounted_unit_price ?? (lineValue / quantity) ?? item.unit_price ?? 0),
            line_refund_value: lineValue,
            image_url: String(item.image_url || ''),
          };
        }),
      },
      eligibility,
    };
  }

  async function validateOrder(access) {
    try {
      return await call('publicValidateReturnOrder', access);
    } catch (error) {
      const routeUnavailable = error instanceof ApiError
        && error.status === 401
        && /api key|sesiunea utilizatorului/i.test(error.message);
      if (!routeUnavailable) throw error;
      const order = await call('publicTrackOrder', null, {
        method: 'GET',
        query: { order_number: access.order_number, email: access.email },
      });
      return verifiedFromTracking(order);
    }
  }

  verify.addEventListener('submit', async event => {
    event.preventDefault();
    verifyError.textContent = '';
    if (!verify.reportValidity()) return;
    const button = verify.querySelector('[type=submit]');
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      verified = await validateOrder(payload());
      if (!verified.eligibility?.eligible) throw new ApiError(verified.eligibility?.reason || 'Comanda nu este eligibilă.');
      renderProducts();
      verify.hidden = true;
      configure.hidden = false;
      setStep(2);
      document.querySelector('.return-experience').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      verifyError.textContent = error.message;
      verifyError.focus();
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  });

  function renderProducts() {
    const isBusiness = verified.eligibility.policy_type === 'b2b_commercial';
    document.querySelector('#verified-order').textContent = `${verified.order.order_number} · ${verified.order.customer_display_name}`;
    const deadline = new Date(String(verified.eligibility.deadline_at).replace(' ', 'T'));
    document.querySelector('#deadline-card').innerHTML = `<span>✓</span><div><strong>${isBusiness ? 'Retur comercial PJ' : 'Retragere PF'}</strong><small>Solicitarea poate fi trimisă până la ${deadline.toLocaleDateString('ro-RO', { dateStyle: 'long' })}, inclusiv · ${verified.eligibility.days_remaining} zile rămase</small></div>`;
    const confirmation = configure.querySelector('.return-actions .return-primary');
    if (confirmation) confirmation.innerHTML = `<span>${isBusiness ? 'Trimite solicitarea de retur' : 'Confirmă solicitarea de retur'}</span><b>→</b>`;
    const reasonSelect = configure.elements.reason_choice;
    reasonSelect.options[1].hidden = isBusiness;
    if (isBusiness && reasonSelect.value === 'Retragere fără motiv declarat') reasonSelect.value = '';
    document.querySelector('#return-products').innerHTML = verified.order.items.map((item, index) => {
      const image = /^https?:\/\//i.test(item.image_url || '')
        ? `<img src="${escapeHtml(item.image_url)}" alt="" loading="lazy">`
        : '<span class="return-product__monogram">GT</span>';
      return `<label class="return-product"><input type="checkbox" data-item="${escapeHtml(item.order_item_id)}" data-index="${index}" checked><span class="return-product__image">${image}</span><span class="return-product__copy"><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.product_sku || 'Produs G-Trots')} · ${money(item.unit_refund_value)} / buc.</small></span><span class="return-product__qty"><button type="button" data-minus aria-label="Scade cantitatea">−</button><b data-qty>1</b><button type="button" data-plus aria-label="Crește cantitatea">+</button><input type="hidden" value="1" max="${item.quantity}"></span></label>`;
    }).join('');
    document.querySelectorAll('.return-product').forEach(row => {
      const index = Number(row.querySelector('[data-index]').dataset.index);
      const max = Number(verified.order.items[index].quantity);
      const hidden = row.querySelector('input[type=hidden]');
      const output = row.querySelector('[data-qty]');
      row.querySelector('[data-minus]').onclick = () => { hidden.value = Math.max(1, Number(hidden.value) - 1); output.textContent = hidden.value; totals(); };
      row.querySelector('[data-plus]').onclick = () => { hidden.value = Math.min(max, Number(hidden.value) + 1); output.textContent = hidden.value; totals(); };
      row.querySelector('[data-item]').onchange = () => { row.classList.toggle('is-selected', row.querySelector('[data-item]').checked); totals(); };
      row.classList.add('is-selected');
    });
    totals();
  }

  function totals() {
    let total = 0;
    let fullReturn = true;
    document.querySelectorAll('.return-product').forEach(row => {
      const index = Number(row.querySelector('[data-index]').dataset.index);
      const checked = row.querySelector('[data-item]').checked;
      const quantity = Number(row.querySelector('input[type=hidden]').value);
      const ordered = Number(verified.order.items[index].quantity);
      if (!checked || quantity !== ordered) fullReturn = false;
      if (checked) total += Number(verified.order.items[index].unit_refund_value) * quantity;
    });
    const initialDelivery = fullReturn && verified.order.initial_shipping_refundable ? Number(verified.order.initial_shipping_cost || 0) : 0;
    const cost = Number(verified.order.return_cost || 0);
    document.querySelector('#selected-total').textContent = money(total + initialDelivery);
    document.querySelector('#return-shipping-cost').textContent = money(cost);
    document.querySelector('#refund-estimate').textContent = money(Math.max(0, total + initialDelivery - cost));
  }

  configure.elements.reason_choice.addEventListener('change', () => {
    const other = configure.elements.reason_choice.value === 'Alt motiv';
    document.querySelector('#reason-detail').hidden = !other;
    configure.elements.reason_detail.required = other;
  });

  document.querySelector('#return-back').onclick = () => {
    configure.hidden = true;
    verify.hidden = false;
    setStep(1);
    verify.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  configure.addEventListener('submit', async event => {
    event.preventDefault();
    configureError.textContent = '';
    if (!configure.reportValidity()) return;
    const items = [];
    let isFullSelection = true;
    document.querySelectorAll('.return-product').forEach(row => {
      const index = Number(row.querySelector('[data-index]').dataset.index);
      const checked = row.querySelector('[data-item]').checked;
      const quantity = Number(row.querySelector('input[type=hidden]').value);
      const orderItemId = row.querySelector('[data-item]').dataset.item;
      if (!checked || quantity !== Number(verified.order.items[index].quantity)) isFullSelection = false;
      if (checked) items.push({ order_item_id: orderItemId, quantity });
    });
    if (!items.length) { configureError.textContent = 'Selectează cel puțin un produs.'; return; }
    const selectableItems = items.every(item => item.order_item_id);
    if (!selectableItems && !isFullSelection) {
      configureError.textContent = 'Returul parțial va deveni disponibil imediat după sincronizarea serviciului G-Trots. Momentan poți trimite returul integral.';
      return;
    }
    const iban = String(configure.elements.bank_iban.value).replace(/\s/g, '').toUpperCase();
    if (!validIban(iban)) { configureError.textContent = 'Introdu un IBAN valid.'; return; }
    const button = configure.querySelector('[type=submit]');
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      const ids = payload();
      const reason = configure.elements.reason_choice.value === 'Alt motiv' ? configure.elements.reason_detail.value : configure.elements.reason_choice.value;
      const isBusiness = verified.eligibility.policy_type === 'b2b_commercial';
      await call('customerRequestReturn', {
        ...ids,
        reason,
        bank_iban: iban,
        bank_account_holder: configure.elements.bank_account_holder.value,
        items: selectableItems ? items : [],
        refund_consent: true,
        withdrawal_statement: isBusiness ? '' : `Mă retrag din contractul aferent comenzii ${verified.order.order_number}.`,
      });
      configure.hidden = true;
      success.hidden = false;
      setStep(3);
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      configureError.textContent = error.message;
      configureError.focus();
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  });

  function validIban(value) {
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(value) || (value.startsWith('RO') && value.length !== 24)) return false;
    const rearranged = value.slice(4) + value.slice(0, 4);
    let remainder = 0;
    for (const character of rearranged) {
      const digits = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
      for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder === 1;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }
})();
