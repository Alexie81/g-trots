// Statistics dashboard
(function() {
  const contentEl = document.getElementById('stats-content');
  const periodSelector = document.getElementById('stats-period-selector');
  const customToggle = document.getElementById('stats-custom-toggle');
  const customRange = document.getElementById('stats-custom-range');
  const customApply = document.getElementById('stats-custom-apply');
  const dateFrom = document.getElementById('stats-date-from');
  const dateTo = document.getElementById('stats-date-to');

  let currentQuery = { period: '30d' };
  let currentStats = null;
  let currentChartSeries = [];
  let loading = false;
  let chartMode = 'auto';
  let chartVisibility = {
    clients: true,
    revenue: true,
    expenses: true,
    onHoldRevenue: true,
    netProfit: true,
  };
  let qrFocus = 'all';

  const icons = {
    clients: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
    revenue: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/><circle cx="16.5" cy="15" r="2.5"/></svg>',
    hold: '<svg viewBox="0 0 24 24"><path d="M6 3h12M6 21h12M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/></svg>',
    costs: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>',
    profit: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
    qr: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M17 17h4v4M14 21h3M21 14v3"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M17 11h5M19.5 8.5v5"/></svg>',
    expense: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>',
  };
  const chartSeries = [
    { key: 'clients', label: 'Clienti', color: '#38bdf8', kind: 'clients' },
    { key: 'revenue', label: 'Incasari', color: '#22c55e', kind: 'money' },
    { key: 'expenses', label: 'Cheltuieli', color: '#ef4444', kind: 'money' },
    { key: 'onHoldRevenue', label: 'Venituri in asteptare', color: '#ff8a24', kind: 'money' },
    { key: 'netProfit', label: 'Profit net', color: '#a78bfa', kind: 'money' },
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function number(value) {
    return Number(value || 0);
  }

  function fmtRON(value, compact = false) {
    return new Intl.NumberFormat('ro-RO', {
      maximumFractionDigits: 0,
      notation: compact ? 'compact' : 'standard',
    }).format(number(value)) + ' RON';
  }

  function fmtNumber(value) {
    return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(number(value));
  }

  function formatDate(value, short = false) {
    if (!value) return '';
    return new Date(`${value}T00:00:00`).toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: short ? 'short' : '2-digit',
      year: 'numeric',
    });
  }

  function rangeText(stats) {
    return stats.range?.from
      ? `${formatDate(stats.range.from, true)} - ${formatDate(stats.range.to, true)}`
      : 'Toata activitatea';
  }

  function previousRangeText(stats) {
    if (!stats.range?.from || !stats.range?.to) return 'fata de perioada precedenta';
    const from = new Date(`${stats.range.from}T00:00:00`);
    const to = new Date(`${stats.range.to}T00:00:00`);
    const days = Math.round((to - from) / 86400000) + 1;
    const previousTo = new Date(from);
    previousTo.setDate(previousTo.getDate() - 1);
    const previousFrom = new Date(previousTo);
    previousFrom.setDate(previousFrom.getDate() - days + 1);
    const format = date => date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
    return `vs ${format(previousFrom)} - ${format(previousTo)}`;
  }

  function delta(current, previous) {
    const now = number(current);
    const before = number(previous);
    if (before === 0) return now === 0 ? { amount: 0, percent: 0, direction: 'flat' } : { amount: now, percent: null, direction: 'up' };
    const amount = now - before;
    const percent = (amount / Math.abs(before)) * 100;
    return { amount, percent, direction: percent > .05 ? 'up' : percent < -.05 ? 'down' : 'flat' };
  }

  function deltaLine(current, previous, format = fmtRON, inverse = false) {
    if (previous === undefined || previous === null) {
      return '<span class="stats-kpi-change neutral">Fara comparatie disponibila</span>';
    }
    const result = delta(current, previous);
    const positive = inverse ? result.direction === 'down' : result.direction === 'up';
    const negative = inverse ? result.direction === 'up' : result.direction === 'down';
    const className = positive ? 'positive' : negative ? 'negative' : 'neutral';
    const arrow = result.direction === 'up' ? '↑' : result.direction === 'down' ? '↓' : '→';
    const percent = result.percent === null ? 'nou' : `${Math.abs(result.percent).toFixed(1)}%`;
    return `<span class="stats-kpi-change ${className}">${arrow} ${escapeHtml(format(Math.abs(result.amount)))} (${percent})</span>`;
  }

  function kpiCard({ tone, icon, label, value, current, previous, format, inverse, comparison }) {
    return `
      <article class="stats-kpi ${tone}">
        <span class="stats-kpi-icon">${icons[icon]}</span>
        <div class="stats-kpi-content">
          <div class="stats-kpi-label">${label}</div>
          <strong class="stats-kpi-value">${value}</strong>
          ${deltaLine(current, previous, format, inverse)}
          <span class="stats-kpi-note">${comparison}</span>
        </div>
      </article>
    `;
  }

  function aggregateSeries(series, mode) {
    if (!series?.length || mode === 'auto' || mode === 'day') return series || [];
    if (mode === 'month') {
      const grouped = new Map();
      series.forEach(item => {
        const key = String(item.key || item.label || '').slice(0, 7);
        const current = grouped.get(key) || {
          key,
          label: key.includes('-') ? `${key.slice(5, 7)}.${key.slice(0, 4)}` : item.label,
          revenue: 0,
          expenses: 0,
          onHoldRevenue: 0,
          netProfit: 0,
          generatedClients: 0,
          usedClients: 0,
        };
        current.revenue += number(item.revenue);
        current.expenses += number(item.expenses);
        current.onHoldRevenue += number(item.onHoldRevenue);
        current.netProfit += number(item.netProfit);
        current.generatedClients += number(item.generatedClients);
        current.usedClients += number(item.usedClients);
        grouped.set(key, current);
      });
      return Array.from(grouped.values());
    }
    const size = 7;
    const aggregated = [];
    for (let index = 0; index < series.length; index += size) {
      const chunk = series.slice(index, index + size);
      aggregated.push({
        label: chunk.length > 1 ? `${chunk[0].label} - ${chunk[chunk.length - 1].label}` : chunk[0].label,
        revenue: chunk.reduce((sum, item) => sum + number(item.revenue), 0),
        expenses: chunk.reduce((sum, item) => sum + number(item.expenses), 0),
        onHoldRevenue: chunk.reduce((sum, item) => sum + number(item.onHoldRevenue), 0),
        netProfit: chunk.reduce((sum, item) => sum + number(item.netProfit), 0),
        generatedClients: chunk.reduce((sum, item) => sum + number(item.generatedClients), 0),
        usedClients: chunk.reduce((sum, item) => sum + number(item.usedClients), 0),
      });
    }
    return aggregated;
  }

  function lineChart(series, visibility = chartVisibility) {
    if (!series?.length) return '<div class="stats-empty-chart">Nu exista activitate in perioada selectata.</div>';
    currentChartSeries = series;

    const width = 940;
    const height = 310;
    const left = 48;
    const right = 42;
    const top = 28;
    const bottom = 40;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const visibleMoneySeries = chartSeries.filter(item => item.kind === 'money' && visibility[item.key]);
    const moneyValues = visibleMoneySeries.flatMap(item => series.map(point => number(point[item.key])));
    const maxMoney = Math.max(...moneyValues, 1);
    const minMoney = Math.min(...moneyValues, 0);
    const moneyRange = Math.max(maxMoney - minMoney, 1);
    const maxClients = Math.max(...series.map(item => number(item.generatedClients)), 1);
    const step = series.length > 1 ? chartWidth / (series.length - 1) : chartWidth;
    const barWidth = Math.max(4, Math.min(18, chartWidth / Math.max(series.length, 1) * .48));
    const basePoints = series.map((item, index) => {
      const x = left + (series.length === 1 ? chartWidth / 2 : index * step);
      return { ...item, x, index };
    });
    const labelEvery = Math.max(1, Math.ceil(series.length / 10));

    const grid = [0, .25, .5, .75, 1].map(ratio => {
      const y = top + chartHeight - ratio * chartHeight;
      return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="stats-chart-grid"/>
        <text x="${left - 9}" y="${y + 4}" text-anchor="end" class="stats-chart-axis">${escapeHtml(fmtRON(minMoney + moneyRange * ratio, true).replace(' RON', ''))}</text>
        <text x="${width - right + 9}" y="${y + 4}" class="stats-chart-axis">${Math.round(maxClients * ratio)}</text>`;
    }).join('');

    const bars = visibility.clients ? basePoints.map(point => {
      const barHeight = (number(point.generatedClients) / maxClients) * chartHeight;
      return `<rect x="${point.x - barWidth / 2}" y="${top + chartHeight - barHeight}" width="${barWidth}" height="${barHeight}" rx="2" class="stats-chart-bar">
        <title>${escapeHtml(point.label)}: ${fmtNumber(point.generatedClients)} clienti</title>
      </rect>`;
    }).join('') : '';

    const lines = visibleMoneySeries.map(item => {
      const points = basePoints.map(point => ({
        ...point,
        y: top + chartHeight - ((number(point[item.key]) - minMoney) / moneyRange) * chartHeight,
      }));
      const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
      const dots = points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="2.8" fill="${item.color}" stroke="#171615" stroke-width="1.5">
        <title>${escapeHtml(point.label)}: ${escapeHtml(item.label)} ${fmtRON(point[item.key])}</title>
      </circle>`).join('');
      return `<path d="${path}" class="stats-chart-series-line" style="stroke:${item.color}"/>${dots}`;
    }).join('');

    const labels = basePoints.map((point, index) => (
      index % labelEvery === 0 || index === basePoints.length - 1
        ? `<text x="${point.x}" y="${height - 12}" text-anchor="middle" class="stats-chart-axis">${escapeHtml(point.label)}</text>`
        : ''
    )).join('');

    const hits = basePoints.map(point => {
      const hitStart = Math.max(left, point.x - Math.max(step / 2, 12));
      const hitEnd = Math.min(width - right, point.x + Math.max(step / 2, 12));
      return `
        <rect class="stats-chart-hit" tabindex="0" role="button" aria-label="${escapeHtml(point.label)}"
          data-index="${point.index}" data-label="${escapeHtml(point.label)}"
          data-point-x="${point.x}" data-point-y="${top + 24}"
          x="${hitStart}" y="${top}" width="${Math.max(hitEnd - hitStart, 18)}" height="${chartHeight}" fill="transparent"/>
      `;
    }).join('');

    return `<div class="stats-chart-canvas"><svg class="stats-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolutie">
      <text x="${left}" y="15" class="stats-chart-axis-title">RON</text>
      <text x="${width - right + 5}" y="15" class="stats-chart-axis-title">Clienti</text>
      ${grid}${bars}
      ${lines}${labels}${hits}
    </svg><div class="stats-chart-tooltip" hidden></div></div>`;
  }

  function statusPanel(stats) {
    const used = number(stats.qrStats?.used);
    const generated = number(stats.qrStats?.generated);
    const total = used + generated;
    const percentageBase = Math.max(total, 1);
    const usedPct = Math.round((used / percentageBase) * 100);
    const generatedPct = total > 0 ? 100 - usedPct : 0;
    return `
      <section class="stats-panel stats-status-panel focus-${qrFocus}">
        <div class="stats-panel-head stats-qr-panel-head">
          <div>
            <h2>Stare coduri QR</h2>
            <span class="stats-panel-subtitle">Distribuția codurilor din perioada selectată</span>
          </div>
          <span class="stats-qr-total-chip">${fmtNumber(total)} total</span>
        </div>
        <div class="stats-donut-wrap">
          <div class="stats-donut-stage">
            <div class="stats-donut" style="--used:${usedPct * 3.6}deg" role="img" aria-label="${generatedPct}% coduri QR generate, ${usedPct}% coduri QR folosite">
              <div>
                <span>Coduri QR</span>
                <strong>${fmtNumber(total)}</strong>
                <small>înregistrate</small>
              </div>
            </div>
            <span class="stats-donut-caption"><i></i>${generatedPct}% încă disponibile</span>
          </div>
          <div class="stats-status-list" data-focus="${qrFocus}">
            <button type="button" class="${qrFocus === 'generated' ? 'selected' : ''}" data-qr-focus="generated">
              <span class="stats-status-row-head"><i class="generated"></i><span>QR Generat<small>Disponibile pentru utilizare</small></span><b>${generatedPct}%</b></span>
              <strong>${fmtNumber(generated)}</strong>
              <span class="stats-status-progress"><i style="width:${generatedPct}%"></i></span>
            </button>
            <button type="button" class="${qrFocus === 'used' ? 'selected' : ''}" data-qr-focus="used">
              <span class="stats-status-row-head"><i class="used"></i><span>QR Folosit<small>Coduri utilizate</small></span><b>${usedPct}%</b></span>
              <strong>${fmtNumber(used)}</strong>
              <span class="stats-status-progress used"><i style="width:${usedPct}%"></i></span>
            </button>
          </div>
        </div>
        <div class="stats-qr-summary">
          <span class="stats-qr-summary-icon">${icons.qr}</span>
          <div><small>Oportunitate activa</small><strong>${fmtNumber(generated)} coduri asteapta prima utilizare</strong></div>
        </div>
      </section>
    `;
  }

  function usersPanel(stats) {
    const profiles = (stats.profileStats || [])
      .filter(item => number(item.clientCount) > 0 || number(item.totalRevenue) > 0)
      .sort((a, b) => number(b.totalRevenue) - number(a.totalRevenue));
    const totalRevenue = Math.max(profiles.reduce((sum, item) => sum + number(item.totalRevenue), 0), 1);
    return `
      <section class="stats-panel stats-users-panel">
        <div class="stats-panel-head"><h2>Performanta profiluri afiliere <small>(dupa incasari)</small></h2></div>
        <div class="stats-users-table">
          <div class="stats-users-head"><span>Profil afiliere</span><span>Clienti atribuiti</span><span>Incasari</span><span>Pondere</span></div>
          ${profiles.length ? profiles.map(item => {
            const profile = item.profile || {};
            const share = number(item.totalRevenue) / totalRevenue * 100;
            return `<div class="stats-user-row">
              <span class="stats-user-name"><i class="stats-user-avatar" style="background:${escapeHtml(profile.color || '#ff6b00')}">${escapeHtml((profile.name || 'P').charAt(0).toUpperCase())}</i><strong>${escapeHtml(profile.name || 'Profil')}</strong></span>
              <span>${fmtNumber(item.clientCount)}</span>
              <strong>${fmtRON(item.totalRevenue)}</strong>
              <span class="stats-share"><i><b style="width:${share}%;background:${escapeHtml(profile.color || '#ff6b00')}"></b></i><strong>${share.toFixed(1)}%</strong></span>
            </div>`;
          }).join('') : '<div class="stats-empty-chart compact">Nu exista activitate pe profiluri de afiliere in perioada selectata.</div>'}
        </div>
        <button type="button" class="stats-details-toggle" id="stats-details-toggle">Vezi detalii complete <span>→</span></button>
      </section>
    `;
  }

  function expensePanel(stats) {
    const labor = number(stats.expenseBreakdown?.labor);
    const parts = number(stats.expenseBreakdown?.parts);
    const custom = number(stats.expenseBreakdown?.custom);
    const commissions = (stats.profileStats || []).reduce((sum, item) => sum + number(item.profileEarnings), 0);
    const rows = [
      { label: 'Manopera', value: labor, color: '#3b82f6', tone: 'blue' },
      { label: 'Materiale si piese', value: parts, color: '#14b8a6', tone: 'teal' },
      { label: 'Alte cheltuieli', value: custom, color: '#ef4444', tone: 'red' },
      { label: 'Comisioane profiluri', value: commissions, color: '#a855f7', tone: 'purple' },
    ];
    const total = Math.max(rows.reduce((sum, row) => sum + row.value, 0), 1);
    return `
      <section class="stats-panel stats-expense-panel">
        <div class="stats-panel-head"><h2>Structura cheltuieli</h2><span class="stats-panel-meta">Dupa categorie</span></div>
        <div class="stats-cost-table">
          <div class="stats-cost-head"><span></span><span>Cost (RON)</span><span>Pondere</span></div>
          ${rows.map(row => {
            const share = row.value / total * 100;
            return `<div class="stats-cost-row">
              <span class="stats-cost-name"><i class="${row.tone}">${icons.expense}</i>${row.label}</span>
              <strong>${fmtRON(row.value)}</strong>
              <span class="stats-share"><i><b style="width:${share}%;background:${row.color}"></b></i><strong>${share.toFixed(1)}%</strong></span>
            </div>`;
          }).join('')}
          <div class="stats-cost-total"><span>Total cheltuieli</span><strong>${fmtRON(total)}</strong></div>
        </div>
      </section>
    `;
  }

  function profilesPanel(stats) {
    const profiles = (stats.profileStats || []).filter(item => number(item.clientCount) > 0 || number(item.totalRevenue) > 0);
    if (!profiles.length) return '';
    return `
      <section class="stats-panel stats-profiles-panel is-hidden" id="stats-profiles-details">
        <div class="stats-panel-head"><h2>Detalii profiluri</h2><span class="stats-panel-meta">${profiles.length} profiluri active</span></div>
        <div class="stats-profile-table">
          <div class="stats-profile-table-head"><span>Profil</span><span>Clienti</span><span>Incasari</span><span>Comision</span><span>G-Trots net</span></div>
          ${profiles.map(item => `
            <div class="stats-profile-row">
              <span class="stats-profile-name"><i style="background:${escapeHtml(item.profile.color || '#ff6b00')}"></i><strong>${escapeHtml(item.profile.name)}</strong><small>${escapeHtml(item.profile.role || '')}</small></span>
              <strong>${fmtNumber(item.clientCount)}</strong><strong>${fmtRON(item.totalRevenue)}</strong>
              <strong style="color:${escapeHtml(item.profile.color || '#ff6b00')}">${fmtRON(item.profileEarnings)}</strong>
              <strong class="${number(item.gtrotsEarnings) >= 0 ? 'stats-positive-text' : 'stats-negative-text'}">${fmtRON(item.gtrotsEarnings)}</strong>
            </div>`).join('')}
        </div>
      </section>`;
  }

  function collaboratorStatsFromClients(clients, query = {}) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    let hasStart = true;
    if (query.period === '7d') start.setDate(start.getDate() - 6);
    else if (query.period === '30d') start.setDate(start.getDate() - 29);
    else if (query.period === '90d') start.setDate(start.getDate() - 89);
    else if (query.period === 'custom' && query.from) start.setTime(new Date(`${query.from}T00:00:00`).getTime());
    else if (!query.period || query.period === 'all') hasStart = false;
    const end = query.period === 'custom' && query.to ? new Date(`${query.to}T23:59:59`) : null;
    const rows = new Map();
    (clients || []).forEach(client => {
      if (client.status !== 'cod_folosit') return;
      const usedAt = client.qr_used_at ? new Date(client.qr_used_at) : null;
      if (hasStart && (!usedAt || Number.isNaN(usedAt.getTime()) || usedAt < start || (end && usedAt > end))) return;
      (client.collaborator_costs || []).forEach(cost => {
        const paid = cost.payment_status === 'incasati';
        const amount = Math.max(number(cost.cost), 0);
        if (!amount) return;
        const key = String(cost.collaborator_id || cost.collaborator_name || cost.id);
        const row = rows.get(key) || {
          collaborator: {
            id: key, name: cost.collaborator_name || 'Colaborator', role: cost.collaborator_role || '',
            percentage: number(cost.percentage), color: cost.collaborator_color || '#14B8A6', created_at: cost.created_at || '',
          },
          clients: new Set(), paidClients: new Set(), holdClients: new Set(),
          totalCost: 0, paidCost: 0, onHoldCost: 0, daily: [],
        };
        row.clients.add(client.id);
        (paid ? row.paidClients : row.holdClients).add(client.id);
        row.totalCost += amount;
        if (paid) row.paidCost += amount; else row.onHoldCost += amount;
        rows.set(key, row);
      });
    });
    return [...rows.values()].map(row => ({
      collaborator: row.collaborator,
      clientCount: row.clients.size,
      paidClientCount: row.paidClients.size,
      onHoldClientCount: row.holdClients.size,
      totalCost: row.totalCost, paidCost: row.paidCost, onHoldCost: row.onHoldCost, daily: row.daily,
    }));
  }
  function collaboratorsPanel(stats) {
    const rows = (stats.collaboratorStats || [])
      .filter(item => number(item.totalCost) > 0)
      .sort((a, b) => number(b.onHoldCost) - number(a.onHoldCost));
    if (!rows.length) return '';
    const paid = rows.reduce((sum, item) => sum + number(item.paidCost ?? item.totalCost), 0);
    const onHold = rows.reduce((sum, item) => sum + number(item.onHoldCost), 0);
    return `
      <section class="stats-panel stats-collaborators-panel">
        <div class="stats-panel-head">
          <div><h2>Colaboratori <small>(plati)</small></h2><span class="stats-panel-subtitle">Cat s-a achitat si cat mai este de dat</span></div>
          <div class="stats-collaborator-totals"><span class="paid">Incasat <b>${fmtRON(paid)}</b></span><span class="hold">On hold <b>${fmtRON(onHold)}</b></span></div>
        </div>
        <div class="stats-collaborator-table">
          <div class="stats-collaborator-head"><span>Colaborator</span><span>Clienti</span><span>Total</span><span>Incasat</span><span>Mai ai de dat</span></div>
          ${rows.map(item => {
            const collaborator = item.collaborator || {};
            return `<div class="stats-collaborator-row">
              <span class="stats-user-name"><i class="stats-user-avatar" style="background:${escapeHtml(collaborator.color || '#14B8A6')}">${escapeHtml((collaborator.name || 'C').charAt(0).toUpperCase())}</i><strong>${escapeHtml(collaborator.name || 'Colaborator')}</strong></span>
              <span>${fmtNumber(item.clientCount)}</span>
              <strong>${fmtRON(item.totalCost)}</strong>
              <strong class="stats-positive-text">${fmtRON(item.paidCost ?? item.totalCost)}</strong>
              <strong class="stats-hold-text">${fmtRON(item.onHoldCost)}</strong>
            </div>`;
          }).join('')}
        </div>
      </section>
    `;
  }
  function insight(stats) {
    const result = stats.previous ? delta(stats.totalRevenue, stats.previous.totalRevenue) : null;
    if (!result) return `Ai ${fmtNumber(stats.totalClients)} clienti in perioada selectata.`;
    if (result.direction === 'up') return `Foarte bine! Incasarile au crescut cu ${Math.abs(result.percent).toFixed(1)}% fata de perioada precedenta si ai ${fmtNumber(stats.totalClients)} clienti.`;
    if (result.direction === 'down') return `Incasarile sunt cu ${Math.abs(result.percent).toFixed(1)}% sub perioada precedenta. Ai ${fmtRON(stats.onHoldRevenue)} venit potential in asteptare.`;
    return `Activitatea este stabila fata de perioada precedenta, cu ${fmtNumber(stats.totalClients)} clienti.`;
  }

  function render(stats) {
    const previous = stats.previous || {};
    const comparison = previousRangeText(stats);
    currentStats = stats;
    contentEl.innerHTML = `
      <div class="stats-command-row">
        <div class="stats-insight"><span class="stats-insight-icon">${icons.spark}</span><strong>${escapeHtml(insight(stats))}</strong></div>
        <div class="stats-command-actions">
          <span class="stats-range-display">${icons.calendar}<strong>${escapeHtml(rangeText(stats))}</strong></span>
          <span class="stats-updated">Actualizat acum</span>
          <button type="button" class="stats-icon-btn" id="stats-refresh-btn" title="Actualizeaza">${icons.refresh}</button>
          <button type="button" class="stats-export-btn" id="stats-export-btn">${icons.download}<span>Exporta</span></button>
        </div>
      </div>

      <div class="stats-kpi-grid">
        ${kpiCard({ tone: 'blue', icon: 'clients', label: 'Clienti', value: fmtNumber(stats.totalClients), current: stats.totalClients, previous: previous.totalClients, format: fmtNumber, comparison })}
        ${kpiCard({ tone: 'green', icon: 'revenue', label: 'Incasari', value: fmtRON(stats.totalRevenue), current: stats.totalRevenue, previous: previous.totalRevenue, format: fmtRON, comparison })}
        ${kpiCard({ tone: 'orange', icon: 'hold', label: 'Venituri in asteptare', value: fmtRON(stats.onHoldRevenue), current: stats.onHoldRevenue, previous: previous.onHoldRevenue, format: fmtRON, comparison })}
        ${kpiCard({ tone: 'red', icon: 'costs', label: 'Cheltuieli', value: fmtRON(stats.totalExpenses), current: stats.totalExpenses, previous: previous.totalExpenses, format: fmtRON, inverse: true, comparison })}
        ${kpiCard({ tone: number(stats.netProfit) >= 0 ? 'lime' : 'red', icon: 'profit', label: 'Profit net', value: fmtRON(stats.netProfit), current: stats.netProfit, previous: previous.netProfit, format: fmtRON, comparison })}
      </div>

      <div class="stats-primary-grid">
        <section class="stats-panel stats-trend-panel">
          <div class="stats-panel-head stats-chart-head">
            <div><h2>Evolutie</h2><div class="stats-chart-legend">
              ${chartSeries.map(item => `<button type="button" class="stats-series-toggle ${chartVisibility[item.key] ? 'active' : ''}" style="--series-color:${item.color}" data-series="${item.key}" aria-pressed="${chartVisibility[item.key]}">${item.label}</button>`).join('')}
            </div></div>
            <select class="stats-chart-mode" id="stats-chart-mode" aria-label="Granularitate grafic">
              <option value="auto" ${chartMode === 'auto' ? 'selected' : ''}>Automat</option>
              <option value="day" ${chartMode === 'day' ? 'selected' : ''}>Zilnic</option>
              <option value="week" ${chartMode === 'week' ? 'selected' : ''}>Saptamanal</option>
              <option value="month" ${chartMode === 'month' ? 'selected' : ''}>Lunar</option>
            </select>
          </div>
          ${lineChart(aggregateSeries(stats.series, chartMode))}
        </section>
        ${statusPanel(stats)}
      </div>
      <div class="stats-secondary-grid">${usersPanel(stats)}${expensePanel(stats)}</div>
      ${collaboratorsPanel(stats)}
      ${profilesPanel(stats)}
      <div class="stats-footnote">Toate valorile sunt in RON si includ datele salvate pentru perioada selectata.</div>
    `;
  }

  function exportStats() {
    if (!currentStats) return;
    const rows = [
      ['Indicator', 'Valoare'],
      ['Perioada', rangeText(currentStats)],
      ['Clienti', currentStats.totalClients],
      ['Incasari', number(currentStats.totalRevenue)],
      ['Venituri in asteptare', number(currentStats.onHoldRevenue)],
      ['Cheltuieli', number(currentStats.totalExpenses)],
      ['Profit net', number(currentStats.netProfit)],
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `statistici-gtrots-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function load() {
    if (loading) return;
    loading = true;
    contentEl.innerHTML = '<div class="stats-loading"><span></span><strong>Pregatim imaginea completa...</strong><small>Calculam activitatea pentru perioada selectata</small></div>';
    try {
      const stats = await window.API.getStats(currentQuery);
      const breakdownReady = (stats.collaboratorStats || []).every(item =>
        item.paidCost !== undefined && item.onHoldCost !== undefined
      );
      if (!breakdownReady) {
        try {
          stats.collaboratorStats = collaboratorStatsFromClients(await window.API.getClients(), currentQuery);
        } catch (_error) {
          stats.collaboratorStats = (stats.collaboratorStats || []).map(item => ({
            ...item, paidCost: number(item.totalCost), onHoldCost: 0,
          }));
        }
      }
      render(stats);
    } catch (error) {
      contentEl.innerHTML = `<div class="stats-error"><strong>Statisticile nu au putut fi incarcate</strong><span>${escapeHtml(error.message || 'Eroare necunoscuta')}</span><button type="button" class="btn-primary" id="stats-retry">Reincearca</button></div>`;
    } finally {
      loading = false;
    }
  }

  function selectPeriod(period) {
    currentQuery = { period };
    periodSelector?.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.period === period));
    customRange.hidden = true;
    customToggle?.classList.remove('active');
    load();
  }

  periodSelector?.addEventListener('click', event => {
    const button = event.target.closest('button[data-period]');
    if (button) selectPeriod(button.dataset.period);
  });

  customToggle?.addEventListener('click', () => {
    customRange.hidden = !customRange.hidden;
    customToggle.classList.toggle('active', !customRange.hidden);
  });

  customApply?.addEventListener('click', () => {
    if (!dateFrom.value || !dateTo.value || dateFrom.value > dateTo.value) {
      dateFrom.focus();
      return;
    }
    currentQuery = { period: 'custom', from: dateFrom.value, to: dateTo.value };
    periodSelector?.querySelectorAll('button').forEach(button => button.classList.remove('active'));
    customRange.hidden = true;
    customToggle?.classList.remove('active');
    load();
  });

  contentEl?.addEventListener('click', event => {
    if (event.target.closest('#stats-refresh-btn, #stats-retry')) load();
    if (event.target.closest('#stats-export-btn')) exportStats();
    const seriesButton = event.target.closest('[data-series]');
    if (seriesButton) {
      const series = seriesButton.dataset.series;
      const visibleCount = Object.values(chartVisibility).filter(Boolean).length;
      if (chartVisibility[series] && visibleCount === 1) return;
      chartVisibility[series] = !chartVisibility[series];
      render(currentStats);
    }
    const qrButton = event.target.closest('[data-qr-focus]');
    if (qrButton) {
      qrFocus = qrFocus === qrButton.dataset.qrFocus ? 'all' : qrButton.dataset.qrFocus;
      render(currentStats);
    }
    if (event.target.closest('#stats-details-toggle')) {
      const panel = document.getElementById('stats-profiles-details');
      panel?.classList.toggle('is-hidden');
      event.target.closest('#stats-details-toggle').firstChild.textContent = panel?.classList.contains('is-hidden') ? 'Vezi detalii complete ' : 'Ascunde detaliile ';
    }
  });
  contentEl?.addEventListener('change', event => {
    if (event.target.id !== 'stats-chart-mode') return;
    chartMode = event.target.value;
    render(currentStats);
  });
  function showChartTooltip(hit) {
    const canvas = hit?.closest('.stats-chart-canvas');
    const tooltip = canvas?.querySelector('.stats-chart-tooltip');
    if (!hit || !tooltip) return;
    const bounds = canvas.getBoundingClientRect();
    const pointX = Number(hit.dataset.pointX || 0) / 940 * bounds.width;
    const pointY = Number(hit.dataset.pointY || 0) / 310 * bounds.height;
    const point = currentChartSeries[Number(hit.dataset.index || 0)] || {};
    const rows = chartSeries
      .filter(item => chartVisibility[item.key])
      .map(item => `<span style="--series-color:${item.color}">${escapeHtml(item.label)} <b>${item.kind === 'clients' ? fmtNumber(point.generatedClients) : fmtRON(point[item.key])}</b></span>`)
      .join('');
    tooltip.innerHTML = `<strong>${escapeHtml(hit.dataset.label)}</strong>${rows}`;
    tooltip.style.left = `${Math.max(10, Math.min(pointX + 15, bounds.width - 195))}px`;
    tooltip.style.top = `${Math.max(pointY - 46, 8)}px`;
    tooltip.hidden = false;
  }

  contentEl?.addEventListener('mousemove', event => {
    const hit = event.target.closest('.stats-chart-hit');
    if (hit) showChartTooltip(hit);
  });
  contentEl?.addEventListener('focusin', event => {
    const hit = event.target.closest('.stats-chart-hit');
    if (hit) showChartTooltip(hit);
  });
  contentEl?.addEventListener('mouseout', event => {
    if (event.target.closest('.stats-chart-hit') && !event.relatedTarget?.closest?.('.stats-chart-hit')) {
      const tooltip = event.target.closest('.stats-chart-canvas')?.querySelector('.stats-chart-tooltip');
      if (tooltip) tooltip.hidden = true;
    }
  });
  contentEl?.addEventListener('focusout', event => {
    if (!event.relatedTarget?.closest?.('.stats-chart-hit')) {
      contentEl.querySelectorAll('.stats-chart-tooltip').forEach(tooltip => { tooltip.hidden = true; });
    }
  });

  window.addEventListener('tab-change', ({ detail }) => {
    if (detail === 'stats') load();
  });
})();
