const PAGE_SIZE = 50;

const state = {
  orders: [],
  filtered: [],
  page: 1,
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
  semana: document.getElementById('semana'),
  semanas: document.getElementById('semanas'),
  clear: document.getElementById('clear'),
  tbody: document.getElementById('tbody'),
  resultCount: document.getElementById('resultCount'),
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  pageInfo: document.getElementById('pageInfo'),
};

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
  const semanas = uniqueSorted(orders.map((o) => o.Semana)).sort().reverse();
  semanas.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    els.semanas.appendChild(opt);
  });
}

function applyFilters() {
  const q = els.q.value.trim().toLowerCase();
  const maquina = els.maquina.value;
  const planta = els.planta.value;
  const tipo = els.tipo.value;
  const tipoOrden = els.tipoOrden.value;
  const estado = els.estado.value;
  const tecnico = els.tecnico.value;
  const semana = els.semana.value.trim();

  state.filtered = state.orders.filter((o) => {
    if (maquina && o.DescripcionMaquina !== maquina) return false;
    if (planta && o.Planta !== planta) return false;
    if (tipo && o.Tipo !== tipo) return false;
    if (tipoOrden && o.OrdenType !== tipoOrden) return false;
    if (estado && o.Estado !== estado) return false;
    if (tecnico && o.Tecnico1 !== tecnico && o.Tecnico2 !== tecnico) return false;
    if (semana && o.Semana !== semana) return false;
    if (q) {
      const haystack = `${o.DescripcionMaquina} ${o.Componente} ${o.Actividad} ${o.CodigoOT} ${o.NoOrden}`.toLowerCase();
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

function render() {
  const total = state.filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * PAGE_SIZE;
  const pageRows = state.filtered.slice(start, start + PAGE_SIZE);

  els.tbody.innerHTML = pageRows.map((o) => {
    const estadoClass = ESTADO_CLASSES[o.Estado] || '';
    return `
    <tr>
      <td>${o.NoOrden}</td>
      <td>${o.Tipo}</td>
      <td>${o.OrdenType}</td>
      <td>${o.Planta}</td>
      <td>${o.DescripcionMaquina}</td>
      <td>${o.Componente}</td>
      <td>${o.Actividad}</td>
      <td>${o.Prioridad}</td>
      <td>${o.Tecnico1}</td>
      <td>${o.Tecnico2}</td>
      <td>${o.FechaPrevista}</td>
      <td>${o.Semana}</td>
      <td class="${estadoClass}">${o.Estado}</td>
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

[els.q, els.maquina, els.planta, els.tipo, els.tipoOrden, els.estado, els.tecnico, els.semana].forEach((el) => {
  el.addEventListener('input', applyFilters);
  el.addEventListener('change', applyFilters);
});

els.clear.addEventListener('click', () => {
  els.q.value = '';
  els.maquina.value = '';
  els.planta.value = '';
  els.tipo.value = '';
  els.tipoOrden.value = '';
  els.estado.value = '';
  els.tecnico.value = '';
  els.semana.value = '';
  applyFilters();
});

els.prev.addEventListener('click', () => { state.page -= 1; render(); });
els.next.addEventListener('click', () => { state.page += 1; render(); });

init();
