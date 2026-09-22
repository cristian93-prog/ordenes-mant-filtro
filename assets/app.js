const PAGE_SIZE = 50;

const state = {
  orders: [],
  filtered: [],
  page: 1,
  semanasSeleccionadas: new Set(),
};

const els = {
  meta: document.getElementById('meta'),
  q: document.getElementById('q'),
  maquina: document.getElementById('maquina'),
  planta: document.getElementById('planta'),
  tipo: document.getElementById('tipo'),
  tipoOrden: document.getElementById('tipoOrden'),
  estado: document.getElementById('estado'),
  tecnico: document.getElementById('tecnico'),
  fecha: document.getElementById('fecha'),
  semanaMultiSelect: document.getElementById('semanaMultiSelect'),
  semanaBtn: document.getElementById('semanaBtn'),
  semanaPanel: document.getElementById('semanaPanel'),
  semanaOptions: document.getElementById('semanaOptions'),
  semanaLimpiar: document.getElementById('semanaLimpiar'),
  clear: document.getElementById('clear'),
  tbody: document.getElementById('tbody'),
  resultCount: document.getElementById('resultCount'),
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  pageInfo: document.getElementById('pageInfo'),
  exportExcel: document.getElementById('exportExcel'),
};

function isoToDDMMYYYY(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
}

function populateSelect(select, values) {
  values.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

function buildFilters(orders) {
  populateSelect(els.maquina, uniqueSorted(orders.map((o) => o.DescripcionMaquina)));
  populateSelect(els.planta, uniqueSorted(orders.map((o) => o.Planta)));
  populateSelect(els.tipo, uniqueSorted(orders.map((o) => o.Tipo)));
  populateSelect(els.tipoOrden, uniqueSorted(orders.map((o) => o.OrdenType)));
  populateSelect(els.estado, uniqueSorted(orders.map((o) => o.Estado)));
  const tecnicos = uniqueSorted(orders.flatMap((o) => [o.Tecnico1, o.Tecnico2]));
  populateSelect(els.tecnico, tecnicos);
  buildSemanaOptions(uniqueSorted(orders.map((o) => o.Semana)).sort().reverse());
}

function buildSemanaOptions(semanas) {
  els.semanaOptions.innerHTML = semanas.map((s) => `
    <label class="multi-select-option">
      <input type="checkbox" value="${s}">
      <span>${s}</span>
    </label>
  `).join('');

  els.semanaOptions.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        state.semanasSeleccionadas.add(cb.value);
      } else {
        state.semanasSeleccionadas.delete(cb.value);
      }
      updateSemanaBtnLabel();
      applyFilters();
    });
  });
}

function updateSemanaBtnLabel() {
  const n = state.semanasSeleccionadas.size;
  els.semanaBtn.textContent = n === 0 ? 'Todas' : n === 1 ? [...state.semanasSeleccionadas][0] : `${n} semanas`;
}

function applyFilters() {
  const q = els.q.value.trim().toLowerCase();
  const maquina = els.maquina.value;
  const planta = els.planta.value;
  const tipo = els.tipo.value;
  const tipoOrden = els.tipoOrden.value;
  const estado = els.estado.value;
  const tecnico = els.tecnico.value;
  const fecha = els.fecha.value ? isoToDDMMYYYY(els.fecha.value) : '';

  state.filtered = state.orders.filter((o) => {
    if (maquina && o.DescripcionMaquina !== maquina) return false;
    if (planta && o.Planta !== planta) return false;
    if (tipo && o.Tipo !== tipo) return false;
    if (tipoOrden && o.OrdenType !== tipoOrden) return false;
    if (estado && o.Estado !== estado) return false;
    if (tecnico && o.Tecnico1 !== tecnico && o.Tecnico2 !== tecnico) return false;
    if (fecha && o.FechaPrevista !== fecha) return false;
    if (state.semanasSeleccionadas.size > 0 && !state.semanasSeleccionadas.has(o.Semana)) return false;
    if (q) {
      const haystack = `${o.DescripcionMaquina} ${o.Componente} ${o.Actividad} ${o.CodigoOT} ${o.NoOrden} ${o.ComentarioCierre}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  state.page = 1;
  render();
}

const ESTADO_CLASSES = {
  'Ejecutado': 'status-ejecutado',
  'En Curso': 'status-en-curso',
  'Reprogramado': 'status-reprogramado',
};

const ALERT_KEYWORDS = [
  'URGENTE', 'RIESGO', 'FALLA', 'FALLO', 'AVERIA', 'AVERÍA', 'NO FUNCIONA',
  'NO SE PUDO', 'NO SE LOGRO', 'NO SE LOGRÓ', 'DAÑ', 'PARO', 'REQUIERE',
  'PENDIENTE', 'PROBLEMA', 'FUGA', 'DETENID', 'CUIDADO', 'RECURRENTE',
  'PLANIFICAR', 'COORDINAR', 'PROGRAMAR',
];

function hasAlert(comentario) {
  const upper = comentario.toUpperCase();
  return ALERT_KEYWORDS.some((k) => upper.includes(k));
}

function render() {
  const total = state.filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * PAGE_SIZE;
  const pageRows = state.filtered.slice(start, start + PAGE_SIZE);

  els.tbody.innerHTML = pageRows.map((o) => {
    const estadoClass = ESTADO_CLASSES[o.Estado] || '';
    const comentario = (o.ComentarioCierre || '').trim();
    const commentFlag = comentario && hasAlert(comentario) ? `<span class="comment-flag" title="${comentario}">!</span>` : '';
    return `
    <tr>
      <td>${o.NoOrden}${commentFlag}</td>
      <td>${o.Tipo}</td>
      <td>${o.OrdenType}</td>
      <td>${o.Planta}</td>
      <td>${o.DescripcionMaquina}</td>
      <td>${o.Componente}</td>
      <td class="col-uppercase">${o.Actividad}</td>
      <td>${o.Prioridad}</td>
      <td>${o.Tecnico1}</td>
      <td>${o.Tecnico2}</td>
      <td>${o.FechaPrevista}</td>
      <td>${o.Semana}</td>
      <td><span class="status-badge ${estadoClass}">${o.Estado}</span></td>
    </tr>
  `;
  }).join('');

  els.resultCount.textContent = `${total} orden(es) encontrada(s)`;
  els.pageInfo.textContent = `Página ${state.page} de ${totalPages}`;
  els.prev.disabled = state.page <= 1;
  els.next.disabled = state.page >= totalPages;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function init() {
  try {
    const res = await fetch('data/ordenes.json', { cache: 'no-store' });
    const payload = await res.json();
    state.orders = payload.orders.map((o) => {
      const clean = {};
      Object.entries(o).forEach(([k, v]) => { clean[k] = escapeHtml(v); });
      return clean;
    });
    state.filtered = state.orders;
    els.meta.textContent = `${payload.count} órdenes · Última actualización: ${new Date(payload.updatedAt).toLocaleString('es')}`;
    buildFilters(state.orders);
    render();
  } catch (err) {
    els.meta.textContent = 'No se pudieron cargar los datos.';
    console.error(err);
  }
}

[els.q, els.maquina, els.planta, els.tipo, els.tipoOrden, els.estado, els.tecnico, els.fecha].forEach((el) => {
  el.addEventListener('input', applyFilters);
  el.addEventListener('change', applyFilters);
});

els.semanaBtn.addEventListener('click', () => {
  els.semanaPanel.hidden = !els.semanaPanel.hidden;
});

document.addEventListener('click', (e) => {
  if (!els.semanaMultiSelect.contains(e.target)) {
    els.semanaPanel.hidden = true;
  }
});

els.semanaLimpiar.addEventListener('click', () => {
  state.semanasSeleccionadas.clear();
  els.semanaOptions.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
  updateSemanaBtnLabel();
  applyFilters();
});

els.clear.addEventListener('click', () => {
  els.q.value = '';
  els.maquina.value = '';
  els.planta.value = '';
  els.tipo.value = '';
  els.tipoOrden.value = '';
  els.estado.value = '';
  els.tecnico.value = '';
  els.fecha.value = '';
  state.semanasSeleccionadas.clear();
  els.semanaOptions.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
  updateSemanaBtnLabel();
  applyFilters();
});

els.prev.addEventListener('click', () => { state.page -= 1; render(); });
els.next.addEventListener('click', () => { state.page += 1; render(); });

const EXPORT_COLUMNS = [
  ['NoOrden', 'NoOrden'], ['Tipo', 'Tipo'], ['OrdenType', 'Tipo Orden'], ['Planta', 'Planta'],
  ['DescripcionMaquina', 'Máquina'], ['Componente', 'Componente'], ['Actividad', 'Actividad'],
  ['Prioridad', 'Prioridad'], ['Tecnico1', 'Técnico 1'], ['Tecnico2', 'Técnico 2'],
  ['FechaPrevista', 'Fecha Prevista'], ['Semana', 'Semana'], ['Estado', 'Estado'],
];

els.exportExcel.addEventListener('click', () => {
  const rows = state.filtered.map((o) => {
    const row = {};
    EXPORT_COLUMNS.forEach(([key, label]) => { row[label] = o[key]; });
    return row;
  });
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Órdenes');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(book, `ordenes-mantenimiento-${fecha}.xlsx`);
});

init();
