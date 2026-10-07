const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MECANISMOS = ['Eléctrica', 'Instrumentación', 'Mecánica', 'Material', ''];
const MEC_COLORS = { 'Eléctrica': '#f28e2b', 'Instrumentación': '#2fa7e8', 'Mecánica': '#1f4e79', 'Material': '#59a14f', '': '#b8bec7' };
const LINEA_COLORS = {
  'Producción': '#2f55a4', 'Empaque': '#8cc26f', 'Bebidas': '#1fb5ef', 'Untables': '#7f7f7f',
  'Exteriores': '#c9ccd1', 'Rebanados': '#d4805a', 'Rallados': '#f6c28b',
};
const TIPOS_AVERIA = ['Avería', 'Avería Externa'];
const TOP_MAQUINAS = 20;
const META_MENSUAL = 22;
const META_SEMANAL = 5.5;
const COLOR_DENTRO_META = '#2e9e5b';
const COLOR_SOBRE_META = '#e0555a';

const num1 = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
const fmtH = (v) => (v >= 10 ? num0.format(v) : num1.format(v));

const state = {
  eventos: [],
  charts: {},
  f: { anio: '' },
  m: {},
  sel: { maquina: '', periodo: null },
  vista: 'mes',
  orden: { col: 'horas', dir: 'desc' },
};

const multis = [];

function crearMulti(id, textoTodos, alCambiar) {
  const raiz = $(id);
  raiz.innerHTML = '<button type="button" class="multi-select-btn"></button><div class="multi-select-panel" hidden><div class="multi-select-actions"><button type="button" data-limpiar>Limpiar</button></div><div data-opciones></div></div>';
  const btn = raiz.querySelector('.multi-select-btn');
  const panel = raiz.querySelector('.multi-select-panel');
  const cont = raiz.querySelector('[data-opciones]');
  const m = { raiz, sel: new Set(), opciones: [] };
  const etiqueta = () => {
    const n = m.sel.size;
    const unico = n === 1 ? m.opciones.find((o) => o.valor === [...m.sel][0]) : null;
    btn.textContent = n === 0 ? textoTodos : unico ? unico.texto : `${n} seleccionados`;
  };
  m.pintar = () => {
    cont.innerHTML = m.opciones.map((o) => `<label class="multi-select-option"><input type="checkbox" value="${escapeHtml(o.valor)}"${m.sel.has(o.valor) ? ' checked' : ''}><span>${escapeHtml(o.texto)}</span></label>`).join('');
    etiqueta();
  };
  m.poner = (opciones) => {
    m.opciones = opciones;
    m.sel = new Set([...m.sel].filter((v) => opciones.some((o) => o.valor === v)));
    m.pintar();
  };
  m.fijar = (valores) => { m.sel = new Set(valores); m.pintar(); };
  btn.addEventListener('click', () => {
    multis.forEach((x) => { if (x !== m) x.raiz.querySelector('.multi-select-panel').hidden = true; });
    panel.hidden = !panel.hidden;
  });
  raiz.querySelector('[data-limpiar]').addEventListener('click', () => { m.sel.clear(); m.pintar(); alCambiar(); });
  cont.addEventListener('change', (e) => {
    if (e.target.checked) m.sel.add(e.target.value); else m.sel.delete(e.target.value);
    etiqueta();
    alCambiar();
  });
  multis.push(m);
  return m;
}

document.addEventListener('click', (e) => {
  multis.forEach((m) => { if (!m.raiz.contains(e.target)) m.raiz.querySelector('.multi-select-panel').hidden = true; });
});

const dentro = (filtro, valor) => filtro.sel.size === 0 || filtro.sel.has(String(valor));

function conAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

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

function filtrar({ anios, tipos, ignorarMaquina = false, ignorarPeriodo = false }) {
  const m = state.m;
  const s = state.sel;
  return state.eventos.filter((e) =>
    anios.includes(e.y)
    && (!tipos || tipos.includes(e.tipo))
    && (ignorarMaquina || !s.maquina || e.maquina === s.maquina)
    && (ignorarPeriodo || !s.periodo || (s.periodo.modo === 'mes' ? e.m === s.periodo.valor : e.w === s.periodo.valor))
    && dentro(m.mes, e.m)
    && dentro(m.semana, e.w)
    && dentro(m.linea, e.linea)
    && dentro(m.maquina, e.maquina)
    && dentro(m.componente, e.componente));
}

const tiposElegidos = () => (state.m.tipo.sel.size ? [...state.m.tipo.sel] : null);

function unicos(lista) {
  return [...new Set(lista.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

const comoOpciones = (valores) => valores.map((v) => ({ valor: v, texto: v }));

function construirFiltros() {
  const anios = [...new Set(state.eventos.map((e) => e.y))].sort((a, b) => b - a);
  $('fAnio').innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join('');
  state.f.anio = String(anios[0]);
  $('fAnio').value = state.f.anio;

  state.m.mes = crearMulti('mMes', 'Todos', renderTodo);
  state.m.mes.poner(MESES.map((nombre, i) => ({ valor: String(i + 1), texto: nombre })));
  state.m.semana = crearMulti('mSemana', 'Todas', renderTodo);
  state.m.linea = crearMulti('mLinea', 'Todas', renderTodo);
  state.m.linea.poner(comoOpciones(unicos(state.eventos.map((e) => e.linea))));
  state.m.tipo = crearMulti('mTipo', 'Todos los tipos', renderTodo);
  state.m.tipo.poner(comoOpciones(unicos(state.eventos.map((e) => e.tipo))));
  state.m.tipo.fijar(['Avería']);
  state.m.maquina = crearMulti('mMaquina', 'Todas', () => { actualizarComponentes(); renderTodo(); });
  state.m.maquina.poner(comoOpciones(unicos(state.eventos.map((e) => e.maquina))));
  state.m.componente = crearMulti('mComponente', 'Todos', renderTodo);
  actualizarSemanas();
  actualizarComponentes();
}

function actualizarSemanas() {
  const semanas = [...new Set(state.eventos.filter((e) => e.y === Number(state.f.anio)).map((e) => e.w))].sort((a, b) => a - b);
  state.m.semana.poner(semanas.map((w) => ({ valor: String(w), texto: String(w) })));
}

function actualizarComponentes() {
  const base = state.m.maquina.sel.size ? state.eventos.filter((e) => state.m.maquina.sel.has(e.maquina)) : state.eventos;
  state.m.componente.poner(comoOpciones(unicos(base.map((e) => e.componente))));
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
        const modo = (typeof opts.modo === 'function' ? opts.modo(di) : opts.modo) || 'arriba';
        ctx.fillStyle = (opts.color && opts.color(di)) || Chart.defaults.color;
        if (modo === 'abajo') {
          ctx.textAlign = 'center';
          ctx.fillText(texto, el.x, el.y + 12);
        } else if (modo === 'derecha') {
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
  const totalPNP = suma(filtrar({ anios: [Number(state.f.anio)], tipos: null }), 'horas');
  const pctAveria = totalPNP ? ((tfsInt + tfsExt) / totalPNP) * 100 : 0;
  const pct = (parte) => (kp.length ? `${num0.format((parte / kp.length) * 100)}%` : '—');
  $('pnpCalidad').textContent = `Calidad del registro (averías del año): turno informado en ${pct(kp.filter((e) => e.turno).length)} · mecanismo de falla en ${pct(kp.filter((e) => e.mecanismo).length)} · acciones registradas en ${pct(kp.filter((e) => e.acciones).length)}. Para analizar causas por turno o dar seguimiento a acciones, estos datos deben llenarse.`;
  const tarjetas = [
    ['TFS INT. (h)', num1.format(tfsInt)],
    ['TFS EXT. (h)', num1.format(tfsExt)],
    ['TOTAL TFS (h)', num1.format(tfsInt + tfsExt)],
    ['AVERÍAS INT.', int.length],
    ['AVERÍA EXT.', ext.length],
    ['TOT. AVERÍAS', totAverias],
    ['MTTR (h)', num1.format(mttr)],
    ['% del PNP que es avería', `${num0.format(pctAveria)}%`],
  ];
  $('pnpKpis').innerHTML = tarjetas.map(([label, valor]) => `
    <div class="kpi-card"><p class="label">${label}</p><p class="value">${valor}</p></div>`).join('');
}

function renderComparativo() {
  const anio = Number(state.f.anio);
  const porSemana = state.vista === 'semana';
  const meta = porSemana ? META_SEMANAL : META_MENSUAL;
  const ev = filtrar({ anios: [anio, anio - 1], tipos: tiposElegidos(), ignorarPeriodo: true });
  // La meta (22 h / 5,5 h) es de toda la planta: solo se compara contra ella cuando no hay recorte por línea, máquina o componente.
  const alcanceTotal = !state.sel.maquina && !state.m.maquina.sel.size && !state.m.componente.sel.size && !state.m.linea.sel.size;
  $('compNota').textContent = alcanceTotal
    ? 'Haz clic en una barra para filtrar el resto de la página por ese mes o semana; vuelve a hacer clic para quitarla.'
    : 'Vista recortada por máquina, componente o línea: se muestra sin la meta (la meta de 22 h / 5,5 h es de toda la planta). Haz clic en una barra para filtrar por ese mes o semana.';
  const clave = (e) => (porSemana ? e.w : e.m);
  const horasPrev = {};
  const horasAct = {};
  const cuenta = {};
  ev.forEach((e) => {
    const k = clave(e);
    if (e.y === anio) { horasAct[k] = (horasAct[k] || 0) + e.horas; cuenta[k] = (cuenta[k] || 0) + 1; } else { horasPrev[k] = (horasPrev[k] || 0) + e.horas; }
  });
  const claves = [...new Set([...Object.keys(horasPrev), ...Object.keys(horasAct)].map(Number))].sort((a, b) => a - b);
  const ultimoConDatos = Math.max(0, ...Object.keys(horasAct).map(Number));
  const etiqueta = (k) => (porSemana ? `sem${k}` : MESES[k - 1].toLowerCase());
  const redondeo = (v) => Math.round(v * 10) / 10;
  const hayPeriodo = !!state.sel.periodo && state.sel.periodo.modo === state.vista;
  const seleccionada = (k) => hayPeriodo && state.sel.periodo.valor === k;
  const colorAct = (k) => {
    const base = !alcanceTotal ? '#1f3a93' : (horasAct[k] || 0) <= meta ? COLOR_DENTRO_META : COLOR_SOBRE_META;
    return hayPeriodo && !seleccionada(k) ? conAlpha(base, 0.3) : base;
  };

  const box = $('boxComparativo');
  box.style.minWidth = porSemana && claves.length > 14 ? `${claves.length * 40}px` : '';
  dibujar('chComparativo', {
    type: 'bar',
    data: {
      labels: claves.map(etiqueta),
      datasets: [
        { label: `TFS ${anio - 1}`, data: claves.map((k) => (horasPrev[k] ? redondeo(horasPrev[k]) : 0)), backgroundColor: '#5aa9e6', order: 3 },
        { label: `TFS ${anio}`, data: claves.map((k) => (k <= ultimoConDatos ? redondeo(horasAct[k] || 0) : null)), backgroundColor: claves.map(colorAct), order: 3 },
        { type: 'line', label: `Averías ${anio}`, data: claves.map((k) => (k <= ultimoConDatos ? (cuenta[k] || 0) : null)), borderColor: '#f28e2b', backgroundColor: '#f28e2b', tension: 0.3, pointRadius: porSemana ? 2 : 4, order: 1 },
        { type: 'line', label: porSemana ? `Meta semanal (${num1.format(META_SEMANAL)} h)` : `Meta mensual (${META_MENSUAL} h)`, data: claves.map(() => meta), borderColor: '#6b7280', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, order: 2, hidden: !alcanceTotal },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      onClick: (evt, _els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
        if (!pts.length) return;
        const k = claves[pts[0].index];
        state.sel.periodo = seleccionada(k) ? null : { modo: state.vista, valor: k };
        setTimeout(renderTodo, 0);
      },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Horas / N° de averías' } } },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            generateLabels(chart) {
              const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              if (labels[1] && alcanceTotal) { labels[1].fillStyle = COLOR_DENTRO_META; labels[1].strokeStyle = COLOR_DENTRO_META; labels[1].text = `TFS ${anio} (verde: dentro de meta, rojo: sobre meta)`; }
              return alcanceTotal ? labels : labels.filter((_l, i) => i !== 3);
            },
          },
        },
        tooltip: {
          callbacks: {
            afterLabel: (c) => (alcanceTotal && c.datasetIndex === 1 && c.raw !== null ? (c.raw <= meta ? 'Dentro de la meta' : `Sobre la meta (+${num1.format(c.raw - meta)} h)`) : ''),
          },
        },
        valorEtiquetas: {
          modo: (di) => (di === 2 ? 'abajo' : 'arriba'),
          color: (di) => (di === 2 ? '#d9730d' : null),
          formato: (di, v) => {
            if (v === null || di === 3) return '';
            if (porSemana && di !== 1) return '';
            return v ? fmtH(v) : '';
          },
        },
      },
    },
  });
}

function renderPareto() {
  const ev = filtrar({ anios: [Number(state.f.anio)], tipos: tiposElegidos(), ignorarMaquina: true });
  const mapa = new Map();
  ev.forEach((e) => {
    const g = mapa.get(e.maquina) || { maquina: e.maquina, horas: 0, n: 0 };
    g.horas += e.horas; g.n += 1;
    mapa.set(e.maquina, g);
  });
  const porN = $('rankOrden').value === 'n';
  const metrica = (g) => (porN ? g.n : g.horas);
  const todas = [...mapa.values()].sort((a, b) => metrica(b) - metrica(a) || b.horas - a.horas);
  const total = todas.reduce((s, g) => s + metrica(g), 0);
  let acum = 0;
  const filas = todas.slice(0, TOP_MAQUINAS).map((g) => {
    acum += metrica(g);
    return { ...g, valor: metrica(g), acum: total ? (acum / total) * 100 : 0 };
  });
  const colorZona = (f) => (f.acum - (f.valor / (total || 1)) * 100 <= 80 ? '#e0555a' : f.acum <= 95 ? '#f0c419' : '#4e79a7');
  const colorBarra = (f) => (state.sel.maquina && f.maquina !== state.sel.maquina ? conAlpha(colorZona(f), 0.3) : colorZona(f));
  const redondeo = (v) => Math.round(v * 10) / 10;
  dibujar('chPareto', {
    type: 'bar',
    data: {
      labels: filas.map((f) => f.maquina),
      datasets: [
        { label: porN ? 'N° de averías' : 'TFS (h)', data: filas.map((f) => redondeo(f.valor)), backgroundColor: filas.map(colorBarra), yAxisID: 'y', order: 2 },
        { type: 'line', label: '% acumulado', data: filas.map((f) => Math.round(f.acum * 10) / 10), borderColor: '#4a4fb3', backgroundColor: '#4a4fb3', pointRadius: 2, yAxisID: 'y1', order: 1 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      onClick: (_evt, els) => {
        if (!els.length) return;
        const maquina = filas[els[0].index].maquina;
        state.sel.maquina = state.sel.maquina === maquina ? '' : maquina;
        setTimeout(renderTodo, 0);
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: porN ? 'N° de averías' : 'TFS (h)' } },
        y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${v}%` } },
        x: { ticks: { maxRotation: 70, minRotation: 55, callback(v) { const t = this.getLabelForValue(v); return t.length > 16 ? `${t.slice(0, 15)}…` : t; } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { afterLabel: (c) => (c.datasetIndex === 0 ? `${filas[c.dataIndex].n} avería(s) · ${num1.format(filas[c.dataIndex].horas)} h` : '') } },
        valorEtiquetas: { formato: (di, v, i) => (di === 0 && v ? (porN ? `${filas[i].n}·${fmtH(filas[i].horas)}` : `${fmtH(v)}·${filas[i].n}`) : '') },
      },
    },
  });
}

const TIPO_PNP_COLORS = {
  'Avería': '#1f3a93', 'Avería Externa': '#5aa9e6', 'Falla Operacional': '#e0555a', 'Perdidas de calidad': '#f28e2b',
  'Corte de Energía Eléctrica': '#f0c419', 'Falla Planificación': '#8a6de0', 'Innovación y Desarrollo': '#59a14f',
  'Falla Materia Prima': '#b07aa1', 'Falla Material de Empaque': '#9c755f',
};

function renderTipoPNP() {
  const ev = filtrar({ anios: [Number(state.f.anio)], tipos: null });
  const mapa = new Map();
  ev.forEach((e) => { const t = e.tipo || '(sin tipo)'; mapa.set(t, (mapa.get(t) || 0) + e.horas); });
  const filas = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  const total = filas.reduce((s, f) => s + f[1], 0);
  dibujar('chTipoPNP', {
    type: 'bar',
    data: {
      labels: filas.map((f) => f[0]),
      datasets: [{ label: 'Horas', data: filas.map((f) => Math.round(f[1] * 10) / 10), backgroundColor: filas.map((f) => TIPO_PNP_COLORS[f[0]] || '#9aa3b2') }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 80 } },
      scales: { x: { beginAtZero: true, title: { display: true, text: 'Horas de paro' } } },
      plugins: {
        legend: { display: false },
        valorEtiquetas: { modo: 'derecha', formato: (di, v) => `${num1.format(v)} h (${num0.format(total ? (v / total) * 100 : 0)}%)` },
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
  const porSemana = state.vista === 'semana';
  const clave = (e) => (porSemana ? e.w : e.m);
  $('tituloTipo').textContent = porSemana ? 'Tipo de avería (%) por semana' : 'Tipo de avería (%) por mes';
  const semanas = [...new Set(ev.map(clave))].sort((a, b) => a - b);
  const conteo = {};
  semanas.forEach((w) => { conteo[w] = {}; });
  ev.forEach((e) => { conteo[clave(e)][e.mecanismo] = (conteo[clave(e)][e.mecanismo] || 0) + 1; });
  const usados = MECANISMOS.filter((m) => semanas.some((w) => conteo[w][m]));
  const pctDe = (w, m) => {
    const tot = Object.values(conteo[w]).reduce((s, n) => s + n, 0);
    return tot ? ((conteo[w][m] || 0) / tot) * 100 : 0;
  };
  $('boxTipo').style.minWidth = porSemana && semanas.length > 10 ? `${semanas.length * 34}px` : '';
  dibujar('chTipo', {
    type: 'bar',
    data: {
      labels: semanas.map((w) => (porSemana ? `sem${w}` : MESES[w - 1].toLowerCase())),
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
  const mecPrincipal = (g) => Object.entries(g.mec).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const filas = [...mapa.values()].map((g) => ({ ...g, mecanismo: mecPrincipal(g) }));
  const { col, dir } = state.orden;
  const signo = dir === 'asc' ? 1 : -1;
  const textual = col === 'maquina' || col === 'componente' || col === 'mecanismo';
  filas.sort((a, b) => {
    const c = textual ? String(a[col]).localeCompare(String(b[col]), 'es') : a[col] - b[col];
    return c * signo || b.horas - a.horas || b.n - a.n;
  });
  document.querySelectorAll('#tablaRegistro th[data-orden]').forEach((th) => {
    th.textContent = th.dataset.etiqueta + (th.dataset.orden === col ? (dir === 'asc' ? ' ▲' : ' ▼') : '');
  });
  document.querySelector('#tablaRegistro tbody').innerHTML = filas.map((g) => `
    <tr>
      <td>${escapeHtml(g.maquina)}</td>
      <td>${escapeHtml(g.componente)}</td>
      <td class="col-num" title="${num1.format(g.horas)} h">${num0.format(g.horas)}</td>
      <td class="col-num">${g.n}</td>
      <td>${escapeHtml(g.mecanismo)}</td>
    </tr>`).join('');
  document.querySelector('#tablaRegistro tfoot').innerHTML = `
    <tr><td>Total</td><td></td><td class="col-num" title="${num1.format(suma(filas, 'horas'))} h">${num0.format(suma(filas, 'horas'))}</td><td class="col-num">${suma(filas, 'n')}</td><td></td></tr>`;
}

function renderSeleccion() {
  const chips = [];
  if (state.sel.maquina) chips.push(['maquina', `Máquina: ${state.sel.maquina}`]);
  if (state.sel.periodo) {
    const { modo, valor } = state.sel.periodo;
    chips.push(['periodo', modo === 'semana' ? `Semana ${valor}` : `Mes: ${MESES[valor - 1]}`]);
  }
  const caja = $('pnpSeleccion');
  caja.hidden = chips.length === 0;
  caja.innerHTML = chips.length
    ? `<span class="meta">Selección activa (filtra tarjetas, ranking y gráficos de abajo):</span>${chips.map(([k, t]) => `<span class="chip-sel">${escapeHtml(t)} <button type="button" data-quitar="${k}" aria-label="Quitar selección">✕</button></span>`).join('')}`
    : '';
}

function renderTodo() {
  renderSeleccion();
  renderKpis();
  renderComparativo();
  renderPareto();
  renderLinea();
  renderTipo();
  renderRegistro();
  renderTipoPNP();
}

function conectarFiltros() {
  $('rankOrden').addEventListener('change', renderPareto);
  $('compVista').addEventListener('change', () => {
    state.vista = $('compVista').value;
    if (state.sel.periodo && state.sel.periodo.modo !== state.vista) state.sel.periodo = null;
    renderTodo();
  });
  $('pnpSeleccion').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar]');
    if (!b) return;
    if (b.dataset.quitar === 'maquina') state.sel.maquina = '';
    else state.sel.periodo = null;
    renderTodo();
  });
  $('fAnio').addEventListener('change', () => {
    state.f.anio = $('fAnio').value;
    state.sel = { maquina: '', periodo: null };
    actualizarSemanas();
    renderTodo();
  });
  $('tablaRegistro').querySelector('thead').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-orden]');
    if (!th) return;
    const col = th.dataset.orden;
    const textual = col === 'maquina' || col === 'componente' || col === 'mecanismo';
    state.orden = state.orden.col === col
      ? { col, dir: state.orden.dir === 'desc' ? 'asc' : 'desc' }
      : { col, dir: textual ? 'asc' : 'desc' };
    renderRegistro();
  });
  $('fLimpiar').addEventListener('click', () => {
    ['mes', 'semana', 'linea', 'maquina', 'componente'].forEach((k) => state.m[k].fijar([]));
    state.m.tipo.fijar(['Avería']);
    state.sel = { maquina: '', periodo: null };
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
