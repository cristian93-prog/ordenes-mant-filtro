const UMBRAL_AVERIAS = 3;
const UMBRAL_REINCIDENCIAS = 2;
const UMBRAL_AGUDA_HORAS = 3;
const DIAS_REINCIDENCIA = 30;
const TIPOS_AVERIA = ['Avería', 'Avería Externa'];

const num1 = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });

const state = {
  averiasPorPar: new Map(),
  eventosPorPar: new Map(),
  eventos: [],
  candidatos: [],
  pares: [],
  f: { anio: '', linea: '', criterio: '' },
  chart: null,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fechaCorta(t) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(t.getDate())}/${p(t.getMonth() + 1)}/${t.getFullYear()} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

function masFrecuente(lista) {
  const cuenta = {};
  lista.filter(Boolean).forEach((v) => { cuenta[v] = (cuenta[v] || 0) + 1; });
  return Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function calcularPares() {
  const anio = Number(state.f.anio);
  const pares = [];
  state.averiasPorPar.forEach((lista, clave) => {
    const delAnio = [];
    let reincidencias = 0;
    lista.forEach((e, i) => {
      if (e.y !== anio) return;
      if (state.f.linea && e.linea !== state.f.linea) return;
      delAnio.push(e);
      if (i > 0 && (e.t - lista[i - 1].t) / 86400000 <= DIAS_REINCIDENCIA) reincidencias += 1;
    });
    if (!delAnio.length) return;
    const tfs = delAnio.reduce((s, e) => s + e.horas, 0);
    const maximo = Math.max(...delAnio.map((e) => e.horas));
    const reincidente = delAnio.length >= UMBRAL_AVERIAS || reincidencias >= UMBRAL_REINCIDENCIAS;
    const aguda = maximo >= UMBRAL_AGUDA_HORAS;
    pares.push({
      clave,
      maquina: delAnio[0].maquina,
      componente: delAnio[0].componente,
      n: delAnio.length,
      tfs,
      maximo,
      reincidencias,
      mecanismo: masFrecuente(delAnio.map((e) => e.mecanismo)),
      conAccion: delAnio.filter((e) => e.acciones).length,
      reincidente,
      aguda,
      candidato: reincidente || aguda,
    });
  });
  state.pares = pares;
  state.candidatos = pares.filter((p) => p.candidato).sort((a, b) => b.tfs - a.tfs);
}

function renderKpis() {
  const total = state.pares.reduce((s, p) => s + p.tfs, 0);
  const averias = state.pares.reduce((s, p) => s + p.n, 0);
  const tfsCand = state.candidatos.reduce((s, p) => s + p.tfs, 0);
  const reinc = state.pares.reduce((s, p) => s + p.reincidencias, 0);
  const conAccion = state.pares.reduce((s, p) => s + p.conAccion, 0);
  const tarjetas = [
    ['Averías del año', averias],
    ['TFS del año (h)', num1.format(total)],
    ['Candidatos a ACR', state.candidatos.length],
    ['% del TFS en candidatos', total ? `${num0.format((tfsCand / total) * 100)}%` : '0%'],
    ['Averías reincidentes (≤30 d)', reinc],
    ['Averías con acción registrada', averias ? `${num0.format((conAccion / averias) * 100)}%` : '0%'],
  ];
  $('acrKpis').innerHTML = tarjetas.map(([l, v]) => `<div class="kpi-card"><p class="label">${l}</p><p class="value">${v}</p></div>`).join('');
}

function categoria(p) {
  if (p.reincidente && p.aguda) return 'Reincidente y aguda';
  if (p.reincidente) return 'Reincidente';
  if (p.aguda) return 'Aguda';
  return 'Sin criterio';
}

function renderMatriz() {
  const estilo = getComputedStyle(document.body);
  Chart.defaults.color = estilo.color;
  Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#dde1e6';
  Chart.defaults.font.family = estilo.fontFamily;
  Chart.defaults.font.size = 11;

  const colores = { 'Reincidente y aguda': '#8a6de0', 'Reincidente': '#f28e2b', 'Aguda': '#e0555a', 'Sin criterio': '#b8bec7' };
  const datasets = Object.keys(colores).map((cat) => ({
    label: cat,
    backgroundColor: colores[cat],
    pointRadius: cat === 'Sin criterio' ? 3 : 5,
    data: state.pares.filter((p) => categoria(p) === cat).map((p) => ({ x: p.n, y: Math.max(p.tfs, 0.1), p })),
  }));
  if (state.chart) state.chart.destroy();
  state.chart = new Chart($('chMatriz'), {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { min: 0.5, title: { display: true, text: 'Número de averías' }, ticks: { stepSize: 1 } },
        y: { type: 'logarithmic', min: 0.1, title: { display: true, text: 'Horas de paro (TFS, escala logarítmica)' }, ticks: { callback: (v) => (v >= 1 || v === 0.1 ? num1.format(v) : '') } },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            title: (items) => `${items[0].raw.p.maquina} · ${items[0].raw.p.componente}`,
            label: (c) => `${c.raw.p.n} avería(s) · ${num1.format(c.raw.p.tfs)} h`,
          },
        },
      },
    },
  });
}

function renderTabla() {
  const c = state.f.criterio;
  const lista = state.candidatos.filter((p) => !c || (c === 'reincidente' ? p.reincidente : p.aguda));
  $('tablaCandidatos').querySelector('tbody').innerHTML = lista.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(p.maquina)}</td>
      <td>${escapeHtml(p.componente)}</td>
      <td class="col-num">${p.n}</td>
      <td class="col-num">${num1.format(p.tfs)}</td>
      <td class="col-num">${num1.format(p.maximo)}</td>
      <td class="col-num">${p.reincidencias}</td>
      <td>${escapeHtml(p.mecanismo)}</td>
      <td>${p.reincidente ? '<span class="chip chip-reincidente">Reincidente</span>' : ''}${p.aguda ? '<span class="chip chip-aguda">Aguda</span>' : ''}</td>
      <td class="col-num">${p.conAccion}/${p.n}</td>
      <td><button type="button" class="btn-ficha" data-clave="${escapeHtml(p.clave)}">Ficha</button></td>
    </tr>`).join('') || '<tr><td colspan="11">No hay candidatos con este criterio.</td></tr>';
}

function renderTodo() {
  calcularPares();
  renderKpis();
  renderMatriz();
  renderTabla();
}

function abrirFicha(clave) {
  const p = state.pares.find((x) => x.clave === clave);
  const todos = state.eventosPorPar.get(clave) || [];
  const averias = (state.averiasPorPar.get(clave) || []);
  const intervalos = averias.slice(1).map((e, i) => (e.t - averias[i].t) / 86400000);
  const mtbfObs = intervalos.length ? intervalos.reduce((s, v) => s + v, 0) / intervalos.length : null;
  const turnos = {};
  averias.forEach((e) => { turnos[e.turno || '?'] = (turnos[e.turno || '?'] || 0) + 1; });
  const turnosTxt = Object.entries(turnos).sort().map(([t, n]) => `Turno ${t}: ${n}`).join(' · ') || '—';
  const mecs = {};
  averias.forEach((e) => { if (e.mecanismo) mecs[e.mecanismo] = (mecs[e.mecanismo] || 0) + 1; });
  const mecsTxt = Object.entries(mecs).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m}: ${n}`).join(' · ') || '—';
  const historial = todos.slice().sort((a, b) => b.t - a.t).map((e) => `
    <tr>
      <td>${fechaCorta(e.t)}</td><td>${escapeHtml(e.turno)}</td><td>${escapeHtml(e.tipo)}</td>
      <td>${num1.format(e.horas)}</td><td>${escapeHtml(e.mecanismo)}</td>
      <td>${escapeHtml(e.descripcion)}</td><td class="ficha-vacio"></td><td>${escapeHtml(e.acciones)}</td>
    </tr>`).join('');
  const hoy = new Date().toLocaleDateString('es');

  $('fichaContenido').innerHTML = `
  <div class="ficha">
    <h2>Ficha de análisis de causa raíz (ACR)</h2>
    <p class="ficha-sub">Datos de los paros no planeados del año en curso. Lo demás se completa con el equipo de trabajo.</p>
    <table class="ficha-meta">
      <tr><td>Equipo</td><td>${escapeHtml(p.maquina)}</td></tr>
      <tr><td>Componente</td><td>${escapeHtml(p.componente)}</td></tr>
      <tr><td>Año analizado</td><td>${state.f.anio}${state.f.linea ? ` · Línea ${escapeHtml(state.f.linea)}` : ''}</td></tr>
      <tr><td>Fecha de la ficha</td><td>${hoy}</td></tr>
      <tr><td>Equipo de análisis</td><td></td></tr>
    </table>

    <h3>1. Situación actual (datos)</h3>
    <div class="ficha-kpis">
      <div><div class="v">${p.n}</div><div class="l">Averías en el año</div></div>
      <div><div class="v">${num1.format(p.tfs)} h</div><div class="l">TFS en el año</div></div>
      <div><div class="v">${num1.format(p.tfs / p.n)} h</div><div class="l">MTTR (promedio por avería)</div></div>
      <div><div class="v">${num1.format(p.maximo)} h</div><div class="l">Avería más larga</div></div>
      <div><div class="v">${p.reincidencias}</div><div class="l">Reincidencias ≤ ${DIAS_REINCIDENCIA} días</div></div>
      <div><div class="v">${mtbfObs === null ? '—' : `${num0.format(mtbfObs)} d`}</div><div class="l">Días promedio entre averías (${state.f.anio})</div></div>
    </div>
    <p class="ficha-sub" style="margin-top:8px">Mecanismo de falla (${state.f.anio}): ${escapeHtml(mecsTxt)}<br>Distribución por turno (${state.f.anio}): ${escapeHtml(turnosTxt)}</p>

    <h3>2. Paros del componente en ${state.f.anio}</h3>
    <p class="ficha-sub">El reporte de producción es referencial y no siempre refleja la causa real. Contrastarlo con lo encontrado en campo y anotar el hallazgo de mantenimiento.</p>
    <table class="ficha-tabla">
      <thead><tr><th>Fecha</th><th>Turno</th><th>Tipo</th><th>Horas</th><th>Mecanismo</th><th>Reporte de producción (referencial)</th><th>Hallazgo de mantenimiento</th><th>Acciones registradas</th></tr></thead>
      <tbody>${historial}</tbody>
    </table>

    <h3>3. Definición del problema (qué, dónde, cuándo, cuánto)</h3>
    <div class="ficha-caja"></div>

    <h3>4. Análisis de causas — 5 porqués</h3>
    <table class="ficha-tabla">
      <tbody>
        ${[1, 2, 3, 4, 5].map((n) => `<tr><td style="width:12%">¿Por qué ${n}?</td><td class="ficha-vacio"></td></tr>`).join('')}
      </tbody>
    </table>

    <h3>5. Ishikawa (6M) — marcar y anotar causas posibles</h3>
    <div class="ficha-6m">
      <div>Mano de obra</div><div>Método / procedimiento</div><div>Máquina / equipo</div>
      <div>Material / repuesto</div><div>Medición / instrumentos</div><div>Medio ambiente</div>
    </div>

    <h3>6. Causa raíz verificada (con evidencia)</h3>
    <div class="ficha-caja"></div>

    <h3>7. Plan de acción</h3>
    <table class="ficha-tabla">
      <thead><tr><th style="width:14%">Tipo</th><th>Acción</th><th style="width:16%">Responsable</th><th style="width:12%">Fecha</th><th style="width:12%">Estado</th></tr></thead>
      <tbody>
        <tr><td>Contención</td><td class="ficha-vacio"></td><td></td><td></td><td></td></tr>
        <tr><td>Correctiva</td><td class="ficha-vacio"></td><td></td><td></td><td></td></tr>
        <tr><td>Correctiva</td><td class="ficha-vacio"></td><td></td><td></td><td></td></tr>
        <tr><td>Preventiva</td><td class="ficha-vacio"></td><td></td><td></td><td></td></tr>
        <tr><td>Preventiva</td><td class="ficha-vacio"></td><td></td><td></td><td></td></tr>
      </tbody>
    </table>

    <h3>8. Verificación de eficacia</h3>
    <table class="ficha-tabla">
      <thead><tr><th>Indicador</th><th>Línea base</th><th>Meta</th><th>Fecha de revisión</th><th>Resultado</th></tr></thead>
      <tbody>
        <tr><td>Averías del componente</td><td>${p.n} en ${state.f.anio}</td><td class="ficha-vacio"></td><td></td><td></td></tr>
        <tr><td>Horas de paro (TFS)</td><td>${num1.format(p.tfs)} h en ${state.f.anio}</td><td class="ficha-vacio"></td><td></td><td></td></tr>
      </tbody>
    </table>
    <p class="ficha-sub" style="margin-top:6px">Sugerencia: revisar a los 30, 60 y 90 días. Si no hay mejora medible en el indicador, la causa raíz no estaba bien identificada.</p>

    <div class="ficha-firmas"><div>Elaborado por</div><div>Revisado por</div><div>Aprobado por</div></div>
  </div>`;

  $('vistaLista').hidden = true;
  $('fichaView').hidden = false;
  window.scrollTo(0, 0);
}

function cerrarFicha() {
  $('fichaView').hidden = true;
  $('vistaLista').hidden = false;
}

function llenarSelect(id, valores, textoTodos) {
  $(id).innerHTML = (textoTodos ? `<option value="">${textoTodos}</option>` : '')
    + valores.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function conectar() {
  $('fLinea').addEventListener('change', () => { state.f.linea = $('fLinea').value; renderTodo(); });
  $('fCriterio').addEventListener('change', () => { state.f.criterio = $('fCriterio').value; renderTabla(); });
  $('tablaCandidatos').addEventListener('click', (e) => {
    const b = e.target.closest('.btn-ficha');
    if (b) abrirFicha(b.dataset.clave);
  });
  $('fichaVolver').addEventListener('click', cerrarFicha);
  $('fichaImprimir').addEventListener('click', () => window.print());
}

async function init() {
  try {
    const res = await fetch('data/pnp.json', { cache: 'no-store' });
    const payload = await res.json();
    state.eventos = payload.eventos.map((e) => {
      const [fecha, hora] = e.fecha.split(' ');
      const [y, m, d] = fecha.split('-').map(Number);
      const [hh, mm] = hora.split(':').map(Number);
      return { ...e, y, t: new Date(y, m - 1, d, hh, mm) };
    }).sort((a, b) => a.t - b.t);
    const anioActual = Math.max(...state.eventos.map((e) => e.y));
    state.f.anio = String(anioActual);
    state.eventos = state.eventos.filter((e) => e.y === anioActual);
    state.eventos.forEach((e) => {
      const clave = `${e.maquina}||${e.componente}`;
      if (!state.eventosPorPar.has(clave)) state.eventosPorPar.set(clave, []);
      state.eventosPorPar.get(clave).push(e);
      if (TIPOS_AVERIA.includes(e.tipo)) {
        if (!state.averiasPorPar.has(clave)) state.averiasPorPar.set(clave, []);
        state.averiasPorPar.get(clave).push(e);
      }
    });
    llenarSelect('fLinea', [...new Set(state.eventos.map((e) => e.linea).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), 'Todas');
    $('meta').textContent = `Solo datos del año ${anioActual}: ${state.eventos.length} paros no planeados · Datos cargados el ${payload.generado}`;
    conectar();
    renderTodo();
  } catch (err) {
    $('meta').textContent = 'No se pudieron cargar los datos.';
    console.error(err);
  }
}

init();
