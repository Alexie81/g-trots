// ─── Scanner tab ─────────────────────────────────────────────────────────────
(function() {
  const input = document.getElementById('qr-input');
  const btn = document.getElementById('qr-submit-btn');
  const result = document.getElementById('scanner-result');

  function showResult(type, html) {
    result.innerHTML = `<div class="${type}-box" style="max-width:460px;margin:0 auto;margin-top:4px">${html}</div>`;
  }

  function canScanFinalized() {
    const role = window.AUTH?.getUser?.()?.role || '';
    return role === 'admin' || role === 'manager';
  }

  function canViewServiceSheets() {
    const user = window.AUTH?.getUser?.();
    return ['admin', 'manager'].includes(user?.role) || user?.service_sheet_access !== false;
  }

  async function doScan() {
    const code = input.value.trim();
    if (!code) return;
    btn.disabled = true;
    btn.textContent = 'Verific...';
    result.innerHTML = '';

    try {
      const client = await window.API.getClientByQrCode(code);
      if (!client) {
        showResult('error', 'Codul QR nu a fost gasit in baza de date.');
        input.value = '';
        input.focus();
      } else if (client.is_finalized && !canScanFinalized()) {
        showResult('error', `<strong>${client.name || 'Client'}</strong> este finalizat si nu mai poate fi scanat.`);
        input.value = '';
        input.focus();
      } else if (!canViewServiceSheets()) {
        showResult('error', 'Nu ai acces la fisele de service. Administratorul poate activa optiunea Afisare fise de service.');
        input.value = '';
        input.focus();
      } else {
        window.SCANNER_CLIENT = client;
        showResult('info', `<strong>${client.name}</strong> — ${client.phone} — Client verificat! Deschideti <em>Fisa de Service</em>.`);
        input.value = '';
        setTimeout(() => switchTab('service'), 900);
      }
    } catch (e) {
      showResult('error', e.message || 'Eroare de conexiune');
      input.value = '';
      input.focus();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Verifica';
    }
  }

  input.addEventListener('keydown', e => { if (e.key === 'Enter') doScan(); });
  btn.addEventListener('click', doScan);

  // Auto-focus when tab becomes active
  window.addEventListener('tab-change', ({ detail }) => {
    if (detail === 'scanner') setTimeout(() => input.focus(), 50);
  });
})();
