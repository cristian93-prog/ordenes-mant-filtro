const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ESTADO_ORDER = ['Reprogramado', 'En Curso', 'Ejecutado'];
const ESTADO_CLASSES = {
  'Ejecutado': 'bar-ejecutado',
  'En Curso': 'bar-en-curso',
  'Reprogramado': 'bar-reprogramado',
};

const MAX_RANGO_DIAS = 31;

const state = {
  orders: [],
  date: new Date(),
  rangoDesde: new Date(),
  rangoHasta: new Date(),
  view: 'dia',
  groupBy: 'tecnico',
};

const els = {
  meta: document.getElementById('meta'),
  fecha: document.getElementById('ganttFecha'),
  fieldFechaUnica: document.getElementById('fieldFechaUnica'),
  desde: document.getElementById('ganttDesde'),
  hasta: document.getElementById('ganttHasta'),
  fieldDesde: document.getElementById('fieldDesde'),
  fieldHasta: document.getElementById('fieldHasta'),
  prev: document.getElementById('ganttPrev'),
  next: document.getElementById('ganttNext'),
  today: document.getElementById('ganttToday'),
  viewToggle: document.getElementById('viewToggle'),
  groupToggle: document.getElementById('groupToggle'),
  resumen: document.getElementById('ganttResumen'),
  container: document.getElementById('ganttContainer'),
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function parseFechaPrevista(str) {
  const [d, m, y] = str.split('-').map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function toDDMMYYYY(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}-${m}-${date.getFullYear()}`;
}

function toInputValue(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function parseHoraInicio(str) {
  const [h, m] = (str || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function parseHoras(str) {
  const n = parseFloat((str || '0').replace(',', '.'));
  return Number.isFinite(n) ? n * 60 : 0;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function assignLanes(bars) {
  const sorted = [...bars].sort((a, b) => a.startMin - b.startMin);
  const laneEnds = [];
  sorted.forEach((bar) => {
    let lane = laneEnds.findIndex((end) => end <= bar.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
    }
    laneEnds[lane] = bar.startMin + bar.durMin;
    bar.lane = lane;
  });
  return sorted;
}

function machineLabel(o, groupBy) {
  if (groupBy === 'tecnico') {
    return `${o.DescripcionMaquina} · ${o.Planta}`;
  }
  const tecnicos = [o.Tecnico1, o.Tecnico2].filter(Boolean).join(' / ');
  return `${tecnicos} · ${o.Planta}`;
}

function fullDetail(o) {
  return `${o.NoOrden} · ${o.DescripcionMaquina} · ${o.Componente} · ${(o.Actividad || '').toUpperCase()}`;
}

function buildEntities(orders, groupBy) {
  const map = new Map();
  orders.forEach((o) => {
    if (groupBy === 'maquina') {
      const key = o.DescripcionMaquina;
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ order: o, shared: false });
      return;
    }
    [o.Tecnico1, o.Tecnico2].filter(Boolean).forEach((tec) => {
      if (!map.has(tec)) map.set(tec, []);
      map.get(tec).push({ order: o, shared: !!(o.Tecnico1 && o.Tecnico2) });
    });
  });
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')));
}

function renderDay() {
  const targetStr = toDDMMYYYY(state.date);
  const dayOrders = state.orders.filter((o) => o.FechaPrevista === targetStr);

  els.resumen.textContent = `${dayOrders.length} orden(es) el ${targetStr}`;

  if (dayOrders.length === 0) {
    els.container.innerHTML = '<div class="gantt-empty">No hay órdenes programadas este día.</div>';
    return;
  }

  const entities = buildEntities(dayOrders, state.groupBy);

  const hourSpans = Array.from({ length: 24 }, (_, h) => `<span>${h % 2 === 0 ? String(h).padStart(2, '0') : ''}</span>`).join('');

  const rows = [...entities.entries()].map(([name, items]) => {
    const bars = items.map((it) => ({
      startMin: Math.min(1439, parseHoraInicio(it.order.HoraInicio)),
      durMin: Math.max(20, parseHoras(it.order.HorasProgramadas)),
      order: it.order,
      shared: it.shared,
    }));
    assignLanes(bars);
    const laneCount = Math.max(1, ...bars.map((b) => b.lane + 1));
    const trackHeight = laneCount * 34 + 8;

    const barsHtml = bars.map((b) => {
      const leftPct = Math.min(98, (b.startMin / 1440) * 100);
      const widthPct = Math.max(2, Math.min(100 - leftPct, (b.durMin / 1440) * 100));
      const cls = ESTADO_CLASSES[b.order.Estado] || 'bar-en-curso';
      return `<div class="gantt-bar ${cls}${b.shared ? ' shared' : ''}" style="left:${leftPct}%;width:${widthPct}%;top:${4 + b.lane * 34}px" title="${escapeHtml(fullDetail(b.order))}">
        <span class="num">${escapeHtml(b.order.NoOrden)}</span>
        <span class="sub">${escapeHtml(machineLabel(b.order, state.groupBy))}</span>
      </div>`;
    }).join('');

    return `<div class="gantt-row">
      <div class="gantt-row-label" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      <div class="gantt-track" style="height:${trackHeight}px">${barsHtml}</div>
    </div>`;
  }).join('');

  els.container.innerHTML = `<div class="gantt-day"><div class="gantt-day-inner">
    <div class="gantt-hours">${hourSpans}</div>
    ${rows}
  </div></div>`;
}

function renderDaysGrid(days, emptyMsg) {
  const dayStrs = days.map(toDDMMYYYY);
  const rangeOrders = state.orders.filter((o) => dayStrs.includes(o.FechaPrevista));
  const start = days[0];
  const end = days[days.length - 1];
  const sameDay = dayStrs.length === 1;
  els.resumen.textContent = sameDay
    ? `${rangeOrders.length} orden(es) el ${dayStrs[0]}`
    : `${rangeOrders.length} orden(es) entre el ${toDDMMYYYY(start)} y el ${toDDMMYYYY(end)}`;

  if (rangeOrders.length === 0) {
    els.container.innerHTML = `<div class="gantt-empty">${emptyMsg}</div>`;
    return;
  }

  const entities = buildEntities(rangeOrders, state.groupBy);

  const head = `<div class="gantt-week-head"></div>` + days.map((d) =>
    `<div class="gantt-week-head">${DIAS_SEMANA[(d.getDay() + 6) % 7]}<br>${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}</div>`
  ).join('');

  const rows = [...entities.entries()].map(([name, items]) => {
    const cells = dayStrs.map((ds) => {
      const dayItems = items.filter((it) => it.order.FechaPrevista === ds);
      if (dayItems.length === 0) return '<div class="gantt-week-cell"></div>';
      const worstEstado = ESTADO_ORDER.find((e) => dayItems.some((it) => it.order.Estado === e)) || dayItems[0].order.Estado;
      const cls = ESTADO_CLASSES[worstEstado] || 'bar-en-curso';
      const titles = dayItems.map((it) => fullDetail(it.order)).join('\n');
      return `<div class="gantt-week-cell"><span class="week-badge ${cls}" title="${escapeHtml(titles)}">${dayItems.length}</span></div>`;
    }).join('');
    return `<div class="gantt-week-head" style="text-align:left;padding:8px 10px;" title="${escapeHtml(name)}">${escapeHtml(name)}</div>${cells}`;
  }).join('');

  els.container.innerHTML = `<div class="gantt-week"><div class="gantt-week-grid" style="grid-template-columns:160px repeat(${days.length},minmax(70px,1fr));min-width:${160 + days.length * 70}px">${head}${rows}</div></div>`;
}

function renderWeek() {
  const weekStart = startOfWeek(state.date);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  renderDaysGrid(days, 'No hay órdenes programadas esta semana.');
}

function renderRange() {
  if (state.rangoHasta < state.rangoDesde) {
    els.resumen.textContent = '';
    els.container.innerHTML = '<div class="gantt-empty">La fecha "Hasta" debe ser igual o posterior a "Desde".</div>';
    return;
  }
  const totalDias = Math.round((state.rangoHasta - state.rangoDesde) / 86400000) + 1;
  if (totalDias > MAX_RANGO_DIAS) {
    els.resumen.textContent = '';
    els.container.innerHTML = `<div class="gantt-empty">El rango es muy amplio (${totalDias} días). Elige un rango de máximo ${MAX_RANGO_DIAS} días.</div>`;
    return;
  }
  const days = Array.from({ length: totalDias }, (_, i) => {
    const d = new Date(state.rangoDesde);
    d.setDate(d.getDate() + i);
    return d;
  });
  renderDaysGrid(days, 'No hay órdenes programadas en este rango.');
}

function render() {
  if (state.view === 'dia') {
    renderDay();
  } else if (state.view === 'semana') {
    renderWeek();
  } else {
    renderRange();
  }
}

function setToggle(group, value) {
  [...group.children].forEach((btn) => btn.classList.toggle('active', btn.dataset.value === value));
}

function parseInputDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function updateFieldVisibility() {
  const isRango = state.view === 'rango';
  els.fieldFechaUnica.style.display = isRango ? 'none' : '';
  els.fieldDesde.style.display = isRango ? '' : 'none';
  els.fieldHasta.style.display = isRango ? '' : 'none';
}

els.fecha.addEventListener('change', () => {
  if (!els.fecha.value) return;
  state.date = parseInputDate(els.fecha.value);
  render();
});

els.desde.addEventListener('change', () => {
  if (!els.desde.value) return;
  state.rangoDesde = parseInputDate(els.desde.value);
  render();
});

els.hasta.addEventListener('change', () => {
  if (!els.hasta.value) return;
  state.rangoHasta = parseInputDate(els.hasta.value);
  render();
});

els.prev.addEventListener('click', () => {
  if (state.view === 'rango') {
    const span = Math.round((state.rangoHasta - state.rangoDesde) / 86400000) + 1;
    state.rangoDesde.setDate(state.rangoDesde.getDate() - span);
    state.rangoHasta.setDate(state.rangoHasta.getDate() - span);
    els.desde.value = toInputValue(state.rangoDesde);
    els.hasta.value = toInputValue(state.rangoHasta);
  } else {
    state.date.setDate(state.date.getDate() - (state.view === 'semana' ? 7 : 1));
    els.fecha.value = toInputValue(state.date);
  }
  render();
});

els.next.addEventListener('click', () => {
  if (state.view === 'rango') {
    const span = Math.round((state.rangoHasta - state.rangoDesde) / 86400000) + 1;
    state.rangoDesde.setDate(state.rangoDesde.getDate() + span);
    state.rangoHasta.setDate(state.rangoHasta.getDate() + span);
    els.desde.value = toInputValue(state.rangoDesde);
    els.hasta.value = toInputValue(state.rangoHasta);
  } else {
    state.date.setDate(state.date.getDate() + (state.view === 'semana' ? 7 : 1));
    els.fecha.value = toInputValue(state.date);
  }
  render();
});

els.today.addEventListener('click', () => {
  if (state.view === 'rango') {
    state.rangoDesde = new Date();
    state.rangoHasta = new Date();
    els.desde.value = toInputValue(state.rangoDesde);
    els.hasta.value = toInputValue(state.rangoHasta);
  } else {
    state.date = new Date();
    els.fecha.value = toInputValue(state.date);
  }
  render();
});

els.viewToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.view = btn.dataset.value;
  setToggle(els.viewToggle, state.view);
  updateFieldVisibility();
  render();
});

els.groupToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.groupBy = btn.dataset.value;
  setToggle(els.groupToggle, state.groupBy);
  render();
});

async function init() {
  els.fecha.value = toInputValue(state.date);
  els.desde.value = toInputValue(state.rangoDesde);
  els.hasta.value = toInputValue(state.rangoHasta);
  try {
    const res = await fetch('data/ordenes.json', { cache: 'no-store' });
    const payload = await res.json();
    state.orders = payload.orders;
    els.meta.textContent = `${payload.count} órdenes · Última actualización: ${new Date(payload.updatedAt).toLocaleString('es')}`;
    render();
  } catch (err) {
    els.meta.textContent = 'No se pudieron cargar los datos.';
    els.container.innerHTML = '<div class="gantt-empty">Error al cargar los datos.</div>';
    console.error(err);
  }
}

init();
