const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MECANISMOS = ['Eléctrica', 'Instrumentación', 'Mecánica', 'Material', ''];
const MEC_COLORS = { 'Eléctrica': '#f28e2b', 'Instrumentación': '#2fa7e8', 'Mecánica': '#1f4e79', 'Material': '#59a14f', '': '#b8bec7' };
const LINEA_COLORS = {
  'Producción': '#2f55a4', 'Empaque': '#8cc26f', 'Bebidas': '#1fb5ef', 'Untables': '#7f7f7f',
  'Exteriores': '#c9ccd1', 'Rebanados': '#d4805a', 'Rallados': '#f6c28b',
};
const TIPOS_AVERIA = ['Avería', 'Avería Externa'];
const TOP_MAQUINAS = 20;

const num1 = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });

const state = {
  eventos: [],
  charts: {},
  f: { anio: '', mes: '', semana: '', linea: '', tipo: 'Avería', maquina: '', componente: '' },
};

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function isoWeek(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const inicio = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t - inicio) / 86400000 + 1) / 7);
}

function suma(lista, campo) {
  return lista.reduce((s, e) => s + e[campo], 0);
}

function filtrar({ anios, tipos }) {
  const f = state.f;
  return state.eventos.filter((e) =>
    anios.includes(e.y)
    && (!tipos || tipos.includes(e.tipo))
    && (!f.mes || e.m === Number(f.mes))
    && (!f.semana || e.w === Number(f.semana))
    && (!f.linea || e.linea === f.linea)
    && (!f.maquina || e.maquina === f.maquina)
    && (!f.componente || e.componente === f.componente));
}

const tiposElegidos = () => (state.f.tipo ? [state.f.tipo] : null);

function unicos(lista) {
  return [...new Set(lista.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

function llenarSelect(select, valores, textoTodos, valorActual) {
  const opts = [`<option value="">${textoTodos}</option>`]
    .concat(valores.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
  select.innerHTML = opts.join('');
  select.value = valores.includes(valorActual) ? valorActual : '';
}

function construirFiltros() {
  const anios = [...new Set(state.eventos.map((e) => e.y))].sort((a, b) => b - a);
  $('fAnio').innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join('');
  state.f.anio = String(anios[0]);
  $('fAnio').value = state.f.anio;

  $('fMes').innerHTML = '<option value="">Todos</option>'
    + MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');

  llenarSelect($('fLinea'), unicos(state.eventos.map((e) => e.linea)), 'Todas', '');
  llenarSelect($('fTipo'), unicos(state.eventos.map((e) => e.tipo)), 'Todos los tipos', state.f.tipo);
  $('fTipo').value = state.f.tipo;
  llenarSelect($('fMaquina'), unicos(state.eventos.map((e) => e.maquina)), 'Todas', '');
  actualizarSemanas();
  actualizarComponentes();
}

function actualizarSemanas() {
  const semanas = [...new Set(state.eventos.filter((e) => e.y === Number(state.f.anio)).map((e) => e.w))].sort((a, b) => a - b);
  const sel = $('fSemana');
  sel.innerHTML = '<option value="">Todas</option>' + semanas.map((w) => `<option value="${w}">${w}</option>`).join('');
  sel.value = semanas.includes(Number(state.f.semana)) ? state.f.semana : '';
  state.f.semana = sel.value;
}

function actualizarComponentes() {
  const base = state.f.maquina ? state.eventos.filter((e) => e.maquina === state.f.maquina) : state.eventos;
  llenarSelect($('fComponente'), unicos(base.map((e) => e.componente)), 'Todos', state.f.componente);
  state.f.componente = $('fComponente').value;
}

const etiquetasValores = {
  id: 'valorEtiquetas',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts || !opts.formato) return;
    const { ctx } = chart;
    ctx.save();
    ctx.font = '600 10px sans-serif';
    ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const texto = opts.formato(di, ds.data[i], i);
        if (!texto) return;
        const modo = opts.modo || 'arriba';
        ctx.fillStyle = (opts.color && opts.color(di)) || Chart.defaults.color;
        if (modo === 'derecha') {
          ctx.textAlign = 'left';
          ctx.fillText(texto, el.x + 5, el.y);
        } else if (modo === 'centro') {
          const p = el.getProps(['x', 'y', 'base'], true);
          ctx.textAlign = 'center';
          ctx.fillText(texto, p.x, (p.y + p.base) / 2);
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(texto, el.x, el.y - 8);
        }
      });
    });
    ctx.restore();
  },
};

function aplicarEstiloGlobal() {
  const estilo = getComputedStyle(document.body);
  Chart.defaults.color = estilo.color;
  Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#dde1e6';
  Chart.defaults.font.family = estilo.fontFamily;
  Chart.defaults.font.size = 11;
}

function dibujar(id, config) {
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart($(id), { plugins: [etiquetasValores], ...config });
}

function renderKpis() {
  const kp = filtrar({ anios: [Number(state.f.anio)], tipos: TIPOS_AVERIA });
  const int = kp.filter((e) => e.tipo === 'Avería');
  const ext = kp.filter((e) => e.tipo === 'Avería Externa');
  const tfsInt = suma(int, 'horas');
  const tfsExt = suma(ext, 'horas');
  const totAverias = int.length + ext.length;
  const mttr = totAverias ? (tfsInt + tfsExt) / totAverias : 0;
  const tarjetas = [
    ['TFS INT. (h)', num1.format(tfsInt)],
    ['TFS EXT. (h)', num1.format(tfsExt)],
    ['TOTAL TFS (h)', num1.format(tfsInt + tfsExt)],
    ['AVERÍAS INT.', int.length],
    ['AVERÍA EXT.', ext.length],
    ['TOT. AVERÍAS', totAverias],
    ['MTTR (h)', num1.format(mttr)],
  ];
  $('pnpKpis').innerHTML = tarjetas.map(([label, valor]) => `
    <div class="kpi-card"><p class="label">${label}</p><p class="value">${valor}</p></div>`).join('');
}

function renderComparativo() {
  const anio = Number(state.f.anio);
  const ev = filtrar({ anios: [anio, anio - 1], tipos: tiposElegidos() });
  const horasPrev = Array(12).fill(0);
  const horasAct = Array(12).fill(0);
  const cuenta = Array(12).fill(0);
  ev.forEach((e) => {
    if (e.y === anio) { horasAct[e.m - 1] += e.horas; cuenta[e.m - 1] += 1; } else { horasPrev[e.m - 1] += e.horas; }
  });
  const meses = MESES.map((_, i) => i).filter((i) => horasPrev[i] || horasAct[i] || cuenta[i]);
  const redondeo = (v) => Math.round(v * 10) / 10;
  dibujar('chComparativo', {
    type: 'bar',
    data: {
      labels: meses.map((i) => MESES[i].toLowerCase()),
      datasets: [
        { label: `TFS ${anio - 1}`, data: meses.map((i) => redondeo(horasPrev[i])), backgroundColor: '#5aa9e6', order: 2 },
        { label: `TFS ${anio}`, data: meses.map((i) => redondeo(horasAct[i])), backgroundColor: '#1f3a93', order: 2 },
        { type: 'line', label: `Averías ${anio}`, data: meses.map((i) => cuenta[i]), borderColor: '#f28e2b', backgroundColor: '#f28e2b', tension: 0.3, order: 1 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Horas / N° de averías' } } },
      plugins: {
        legend: { position: 'bottom' },
        valorEtiquetas: { formato: (di, v) => (v ? num0.format(v) : '') },
      },
    },
  });
}

function renderPareto() {
  const ev = filtrar({ anios: [Number(state.f.anio)], tipos: tiposElegidos() });
  const mapa = new Map();
  ev.forEach((e) => {
    const g = mapa.get(e.maquina) || { maquina: e.maquina, horas: 0, n: 0 };
    g.horas += e.horas; g.n += 1;
    mapa.set(e.maquina, g);
  });
  const todas = [...mapa.values()].sort((a, b) => b.horas - a.horas);
  const total = suma(todas, 'horas');
  let acum = 0;
  const filas = todas.slice(0, TOP_MAQUINAS).map((g) => {
    acum += g.horas;
    return { ...g, acum: total ? (acum / total) * 100 : 0 };
  });
  const colorBarra = (f) => (f.acum - (f.horas / (total || 1)) * 100 <= 80 ? '#e0555a' : f.acum <= 95 ? '#f0c419' : '#4e79a7');
  dibujar('chPareto', {
    type: 'bar',
    data: {
      labels: filas.map((f) => f.maquina),
      datasets: [
        { label: 'TFS (h)', data: filas.map((f) => Math.round(f.horas * 10) / 10), backgroundColor: filas.map(colorBarra), yAxisID: 'y', order: 2 },
        { type: 'line', label: '% acumulado', data: filas.map((f) => Math.round(f.acum * 10) / 10), borderColor: '#4a4fb3', backgroundColor: '#4a4fb3', pointRadius: 2, yAxisID: 'y1', order: 1 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'TFS (h)' } },
        y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${v}%` } },
        x: { ticks: { maxRotation: 70, minRotation: 55, callback(v) { const t = this.getLabelForValue(v); return t.length > 16 ? `${t.slice(0, 15)}…` : t; } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { afterLabel: (c) => (c.datasetIndex === 0 ? `${filas[c.dataIndex].n} avería(s)` : '') } },
        valorEtiquetas: { formato: (di, v, i) => (di === 0 && v ? `${num0.format(v)}·${filas[i].n}` : '') },
      },
    },
  });
}

function renderLinea() {
  const ev = filtrar({ anios: [Number(state.f.anio)], tipos: tiposElegidos() });
  const mapa = new Map();
  ev.forEach((e) => mapa.set(e.linea || '(sin línea)', (mapa.get(e.linea || '(sin línea)') || 0) + e.horas));
  const filas = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  dibujar('chLinea', {
    type: 'bar',
    data: {
      labels: filas.map((f) => f[0]),
      datasets: [{ label: 'TFS (h)', data: filas.map((f) => Math.round(f[1] * 10) / 10), backgroundColor: filas.map((f) => LINEA_COLORS[f[0]] || '#9aa3b2') }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 36 } },
      scales: { x: { beginAtZero: true } },
      plugins: { legend: { display: false }, valorEtiquetas: { modo: 'derecha', formato: (di, v) => num0.format(v) } },
    },
  });
}

function renderTipo() {
  const ev = filtrar({ anios: [Number(state.f.anio)], tipos: tiposElegidos() });
  const semanas = [...new Set(ev.map((e) => e.w))].sort((a, b) => a - b);
  const conteo = {};
  semanas.forEach((w) => { conteo[w] = {}; });
  ev.forEach((e) => { conteo[e.w][e.mecanismo] = (conteo[e.w][e.mecanismo] || 0) + 1; });
  const usados = MECANISMOS.filter((m) => semanas.some((w) => conteo[w][m]));
  const pctDe = (w, m) => {
    const tot = Object.values(conteo[w]).reduce((s, n) => s + n, 0);
    return tot ? ((conteo[w][m] || 0) / tot) * 100 : 0;
  };
  $('boxTipo').style.minWidth = semanas.length > 10 ? `${semanas.length * 34}px` : '';
  dibujar('chTipo', {
    type: 'bar',
    data: {
      labels: semanas.map((w) => `sem${w}`),
      datasets: usados.map((m) => ({
        label: m || 'Sin clasificar',
        data: semanas.map((w) => Math.round(pctDe(w, m) * 10) / 10),
        backgroundColor: MEC_COLORS[m],
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, max: 100, ticks: { callback: (v) => `${v}%` } } },
      plugins: {
        legend: { position: 'bottom' },
        valorEtiquetas: { modo: 'centro', color: () => '#ffffff', formato: (di, v) => (v >= 12 ? `${num0.format(v)}%` : '') },
      },
    },
  });
}

function renderRegistro() {
  const ev = filtrar({ anios: [Number(state.f.anio)], tipos: tiposElegidos() });
  const mapa = new Map();
  ev.forEach((e) => {
    const clave = `${e.maquina}||${e.componente}`;
    const g = mapa.get(clave) || { maquina: e.maquina, componente: e.componente, horas: 0, n: 0, mec: {} };
    g.horas += e.horas; g.n += 1;
    if (e.mecanismo) g.mec[e.mecanismo] = (g.mec[e.mecanismo] || 0) + 1;
    mapa.set(clave, g);
  });
  const filas = [...mapa.values()].sort((a, b) => b.horas - a.horas);
  const mecPrincipal = (g) => Object.entries(g.mec).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  document.querySelector('#tablaRegistro tbody').innerHTML = filas.map((g) => `
    <tr>
      <td>${escapeHtml(g.maquina)}</td>
      <td>${escapeHtml(g.componente)}</td>
      <td class="col-num">${num1.format(g.horas)}</td>
      <td class="col-num">${g.n}</td>
      <td>${escapeHtml(mecPrincipal(g))}</td>
    </tr>`).join('');
  document.querySelector('#tablaRegistro tfoot').innerHTML = `
    <tr><td>Total</td><td></td><td class="col-num">${num1.format(suma(filas, 'horas'))}</td><td class="col-num">${suma(filas, 'n')}</td><td></td></tr>`;
}

function renderTodo() {
  renderKpis();
  renderComparativo();
  renderPareto();
  renderLinea();
  renderTipo();
  renderRegistro();
}

function conectarFiltros() {
  const mapa = { fAnio: 'anio', fMes: 'mes', fSemana: 'semana', fLinea: 'linea', fTipo: 'tipo', fMaquina: 'maquina', fComponente: 'componente' };
  Object.entries(mapa).forEach(([id, clave]) => {
    $(id).addEventListener('change', () => {
      state.f[clave] = $(id).value;
      if (clave === 'anio') actualizarSemanas();
      if (clave === 'maquina') actualizarComponentes();
      renderTodo();
    });
  });
  $('fLimpiar').addEventListener('click', () => {
    const anio = state.f.anio;
    state.f = { anio, mes: '', semana: '', linea: '', tipo: 'Avería', maquina: '', componente: '' };
    ['fMes', 'fSemana', 'fLinea', 'fMaquina'].forEach((id) => { $(id).value = ''; });
    $('fTipo').value = 'Avería';
    actualizarComponentes();
    renderTodo();
  });
}

async function init() {
  try {
    const res = await fetch('data/pnp.json', { cache: 'no-store' });
    const payload = await res.json();
    state.eventos = payload.eventos.map((e) => {
      const [fecha] = e.fecha.split(' ');
      const [y, m, d] = fecha.split('-').map(Number);
      return { ...e, y, m, w: isoWeek(y, m, d) };
    });
    $('meta').textContent = `${payload.total} paros no planeados · Datos cargados el ${payload.generado}`;
    aplicarEstiloGlobal();
    construirFiltros();
    conectarFiltros();
    renderTodo();
  } catch (err) {
    $('meta').textContent = 'No se pudieron cargar los datos.';
    console.error(err);
  }
}

init();
