(function() {
  const form = document.getElementById('expense-settings-form');
  if (!form) return;
  const panel = document.getElementById('expense-settings-panel');

  const idInput = document.getElementById('expense-settings-id');
  const nameInput = document.getElementById('expense-settings-name');
  const colorInput = document.getElementById('expense-settings-color');
  const saveButton = document.getElementById('expense-settings-save');
  const resetButton = document.getElementById('expense-settings-reset');
  const list = document.getElementById('expense-settings-list');
  const count = document.getElementById('expense-settings-count');
  const error = document.getElementById('expense-settings-error');
  let expenses = [];

  function canManageExpenses() {
    return ['admin', 'manager'].includes(window.AUTH?.getUser?.()?.role || '');
  }

  function syncVisibility() {
    if (panel) panel.hidden = !canManageExpenses();
    return canManageExpenses();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(value) {
    const date = new Date(String(value || '').replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return 'Data indisponibila';
    return date.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function resetForm() {
    idInput.value = '';
    nameInput.value = '';
    colorInput.value = '#EF4444';
    saveButton.textContent = 'Adauga cheltuiala';
    error.hidden = true;
    error.textContent = '';
  }

  function render() {
    const sorted = [...expenses].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'ro', { sensitivity: 'base' })
    );
    count.textContent = String(sorted.length);
    list.innerHTML = sorted.length ? sorted.map((expense) => `
      <article class="expense-settings-item" data-id="${escapeHtml(expense.id)}" style="--expense-color:${escapeHtml(expense.color || '#EF4444')}">
        <span class="expense-settings-mark">
          <svg viewBox="0 0 24 24"><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h3"/></svg>
        </span>
        <span class="expense-settings-copy">
          <strong>${escapeHtml(expense.name)}</strong>
          <small>Adaugata: ${escapeHtml(formatDate(expense.created_at))}</small>
        </span>
        <span class="expense-settings-actions">
          <button type="button" class="expense-edit" title="Editeaza" aria-label="Editeaza">
            <svg viewBox="0 0 24 24"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 8.5l2 2"/></svg>
          </button>
          <button type="button" class="expense-delete" title="Sterge" aria-label="Sterge">
            <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>
          </button>
        </span>
      </article>
    `).join('') : '<div class="expense-settings-empty">Nu exista cheltuieli configurate.</div>';
  }

  async function load() {
    if (!syncVisibility()) return;
    list.innerHTML = '<div class="loading">Se incarca...</div>';
    try {
      expenses = await window.API.getExpenseCategories();
      render();
    } catch (loadError) {
      list.innerHTML = `<div class="expense-settings-empty error">${escapeHtml(loadError.message || 'Nu s-au putut incarca cheltuielile.')}</div>`;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    saveButton.disabled = true;
    error.hidden = true;
    try {
      const payload = { name, color: colorInput.value || '#EF4444' };
      const authToken = window.AUTH?.getToken?.() || '';
      const saved = idInput.value
        ? await window.API.updateExpenseCategory(authToken, idInput.value, payload)
        : await window.API.createExpenseCategory(authToken, payload);
      const index = expenses.findIndex((item) => item.id === saved.id);
      if (index >= 0) expenses[index] = saved;
      else expenses.push(saved);
      resetForm();
      render();
      window.dispatchEvent(new CustomEvent('expense-categories-change'));
      window.BUSINESS_UI?.showToast?.('Cheltuiala a fost salvata.', 'success');
    } catch (saveError) {
      error.textContent = saveError.message || 'Cheltuiala nu a putut fi salvata.';
      error.hidden = false;
    } finally {
      saveButton.disabled = false;
    }
  });

  resetButton.addEventListener('click', resetForm);
  list.addEventListener('click', async (event) => {
    const item = event.target.closest('.expense-settings-item');
    if (!item) return;
    const expense = expenses.find((row) => row.id === item.dataset.id);
    if (!expense) return;

    if (event.target.closest('.expense-edit')) {
      idInput.value = expense.id;
      nameInput.value = expense.name || '';
      colorInput.value = expense.color || '#EF4444';
      saveButton.textContent = 'Salveaza modificarile';
      nameInput.focus();
      return;
    }

    if (event.target.closest('.expense-delete')) {
      if (!window.confirm(`Stergi cheltuiala "${expense.name}"? Valorile deja salvate pe clienti raman in istoric.`)) return;
      try {
        await window.API.deleteExpenseCategory(window.AUTH?.getToken?.() || '', expense.id);
        expenses = expenses.filter((row) => row.id !== expense.id);
        if (idInput.value === expense.id) resetForm();
        render();
        window.dispatchEvent(new CustomEvent('expense-categories-change'));
        window.BUSINESS_UI?.showToast?.('Cheltuiala a fost stearsa.', 'success');
      } catch (deleteError) {
        window.BUSINESS_UI?.showToast?.(deleteError.message || 'Cheltuiala nu a putut fi stearsa.', 'error');
      }
    }
  });

  window.addEventListener('tab-change', ({ detail }) => {
    if (detail === 'settings') load();
  });
  window.addEventListener('auth-change', () => {
    if (syncVisibility() && document.getElementById('tab-settings')?.classList.contains('active')) load();
  });
  syncVisibility();
})();
