// ─── Excel export helpers ─────────────────────────────────────────────────────
// SheetJS is loaded only when the user exports, keeping startup responsive.
let xlsxLoadPromise = null;

function servicePayment(sheet) {
  const workPrice = Math.max(Number(sheet?.total_price || 0), 0);
  const diagnostic = Math.max(Number(sheet?.diagnostic_price || 0), 0);
  const clientPackage = Math.max(Number(sheet?.client_package_price || 0), 0);
  const effectiveWorkPrice = workPrice > 0
    && diagnostic > 0
    && clientPackage <= 0
    && Math.abs(workPrice - diagnostic) < 0.01
      ? 0
      : workPrice;
  const advance = Math.max(Number(sheet?.advance_amount || 0), 0);
  const total = effectiveWorkPrice > 0 ? effectiveWorkPrice : diagnostic;
  const amountDue = effectiveWorkPrice <= 0 && diagnostic > 0 && advance <= 0
    ? 0
    : Math.max(total - advance, 0);
  return { total, advance, amountDue };
}

function ensureXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoadPromise) return xlsxLoadPromise;
  xlsxLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'js/xlsx.full.min.js';
    script.async = true;
    script.onload = () => window.XLSX
      ? resolve(window.XLSX)
      : reject(new Error('Biblioteca Excel nu a putut fi initializata.'));
    script.onerror = () => reject(new Error('Biblioteca Excel nu a putut fi incarcata.'));
    document.head.appendChild(script);
  }).catch((error) => {
    xlsxLoadPromise = null;
    throw error;
  });
  return xlsxLoadPromise;
}

window.EXCEL = {
  // Export a single service sheet
  async exportSheet(sheet, client) {
    const XLSX = await ensureXlsx();
    const currency = String(sheet.currency_code || 'RON').toUpperCase();
    const payment = servicePayment(sheet);
    const total = Number(sheet.final_price || payment.total);
    const advance = payment.advance;
    const amountDue = sheet.amount_due == null ? payment.amountDue : Number(sheet.amount_due || 0);
    const rows = [
      ['G-TROTS - FISA DE SERVICE', '', '', ''],
      ['', '', '', ''],
      ['DATE CLIENT', '', '', ''],
      ['Nume', sheet.client_name || (client && client.name) || '', '', ''],
      ['Telefon', sheet.client_phone || (client && client.phone) || '', '', ''],
      ['Email', sheet.client_email || (client && client.email) || '', '', ''],
      ['Cod QR', sheet.qr_code || '', '', ''],
      ['Pret pachet', sheet.client_package_price || 0, '', ''],
      ['Discount', `${sheet.client_discount || 0}%`, '', ''],
      ['', '', '', ''],
      ['DATE SERVICE', '', '', ''],
      ['Data serviciului', new Date(sheet.service_date || sheet.created_at).toLocaleString('ro-RO'), '', ''],
      ['Mecanic', sheet.mechanic_name || '', '', ''],
      ['Tip serviciu', sheet.service_type || '', '', ''],
      ['Descriere lucrare', sheet.work_description || '', '', ''],
      ['Piese utilizate', sheet.parts_used || '', '', ''],
      ['Observatii', sheet.observations || '', '', ''],
      ['Termen', `${sheet.deadline || ''} ${sheet.deadline_unit || ''}`.trim(), '', ''],
      ['', '', '', ''],
      [`PRET TOTAL (${currency})`, total.toFixed(2), '', ''],
      [`AVANS (${currency})`, advance.toFixed(2), '', ''],
      [`REST DE PLATA (${currency})`, amountDue.toFixed(2), '', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 15 }, { wch: 15 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fisa Service');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const clientName = (sheet.client_name || 'client').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date(sheet.service_date || sheet.created_at).toISOString().slice(0, 10);
    const filename = `fisa_service_${clientName}_${dateStr}.xlsx`;

    return window.saveExcel(filename, Array.from(buf));
  },

  // Export all service sheets as one Excel with multiple rows
  async exportAllSheets(sheets) {
    const XLSX = await ensureXlsx();
    const headers = [
      'ID', 'Client', 'Telefon', 'Email', 'Cod QR',
      'Pret Pachet', 'Discount %', 'Data Serviciului',
      'Mecanic', 'Tip Serviciu', 'Descriere Lucrare',
      'Piese Utilizate', 'Observatii', 'Termen', 'Pret Total', 'Avans', 'Rest de plata', 'Moneda', 'Data Creare',
    ];

    const rows = sheets.map(s => {
      const payment = servicePayment(s);
      const total = Number(s.final_price || payment.total);
      const amountDue = s.amount_due == null ? payment.amountDue : Number(s.amount_due || 0);
      return [
      s.id,
      s.client_name,
      s.client_phone,
      s.client_email || '',
      s.qr_code,
      Number(s.client_package_price || 0).toFixed(2),
      s.client_discount || 0,
      new Date(s.service_date).toLocaleString('ro-RO'),
      s.mechanic_name,
      s.service_type,
      s.work_description,
      s.parts_used || '',
      s.observations || '',
      `${s.deadline || ''} ${s.deadline_unit || ''}`.trim(),
      total.toFixed(2),
      Number(s.advance_amount || 0).toFixed(2),
      amountDue.toFixed(2),
      s.currency_code || 'RON',
      new Date(s.created_at).toLocaleString('ro-RO'),
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h, i) => ({ wch: i < 4 ? 20 : i > 9 ? 35 : 18 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Istoric Fise Service');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `gtrots_fise_service_${dateStr}.xlsx`;

    return window.saveExcel(filename, Array.from(buf));
  },
};
