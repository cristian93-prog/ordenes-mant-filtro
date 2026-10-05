const DIAS_REINCIDENCIA = 30;
const TIPOS_AVERIA = ['Avería', 'Avería Externa'];

const NIVELES = {
  componente: {
    clave: (e) => `${e.maquina}||${e.componente}`,
    nombreA: 'Reincidente',
    nombreB: 'Aguda',
    a: (p) => p.n >= 3 || p.reincidencias >= 2,
    b: (p) => p.maximo >= 3,
    texto: 'Un componente es <strong>candidato a ACR</strong> si es <strong>reincidente</strong> (3 o más averías en el año, o 2 o más veces que vuelve a fallar en 30 días o menos) o <strong>aguda</strong> (alguna avería de 3 horas o más). Se ordena por horas de paro (TFS).',
  },
  equipo: {
    clave: (e) => e.maquina,
    nombreA: 'Alta frecuencia',
    nombreB: 'Alto TFS',
    a: (p) => p.n >= 10,
    b: (p) => p.tfs >= 15,
    texto: 'Un equipo es <strong>candidato</strong> si tiene <strong>alta frecuencia</strong> (10 o más averías en el año, aunque sean de componentes distintos) o <strong>alto TFS</strong> (15 horas de paro o más). Sirve para ver equipos que fallan por su condición general y no por un solo componente.',
  },
};

const GUIA_MECANISMO = {
  'Eléctrica': ['Revisar conexiones, terminales y cableado (sobre todo en partes que se mueven).', 'Verificar protecciones, tableros (temperatura, humedad, termografía) y calidad de energía.', 'Confirmar si la falla aparece con arranques, cortes de energía o picos de carga.'],
  'Mecánica': ['Revisar lubricación: tipo, cantidad y frecuencia real.', 'Verificar alineación, holguras, torque, desgaste y vibración.', 'Contrastar condiciones de operación (carga, limpieza, ajustes del operador) con lo que exige el equipo.'],
  'Instrumentación': ['Revisar fijación, posición y limpieza del sensor (suciedad, humedad, golpes).', 'Verificar calibración, conectores y cableado de señal.', 'Revisar parámetros del PLC o variador y si hubo cambios recientes.'],
  'Material': ['Verificar calidad y especificación del repuesto o material usado.', 'Revisar proveedor, lote y condiciones de almacenamiento.'],
};

const num1 = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });

const state = {
  eventos: [],
  averiasPorClave: new Map(),
  eventosPorClave: new Map(),
  pares: [],
  candidatos: [],
  f: { anio: '', linea: '', criterio: '', nivel: 'componente' },
  chart: null,
};

const $ = (id) => document.getElementById(id);
const cfgActual = () => NIVELES[state.f.nivel];

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

function indexar() {
  const cfg = cfgActual();
  const base = state.f.linea ? state.eventos.filter((e) => e.linea === state.f.linea) : state.eventos;
  state.averiasPorClave = new Map();
  state.eventosPorClave = new Map();
  base.forEach((e) => {
    const clave = cfg.clave(e);
    if (!state.eventosPorClave.has(clave)) state.eventosPorClave.set(clave, []);
    state.eventosPorClave.get(clave).push(e);
    if (TIPOS_AVERIA.includes(e.tipo)) {
      if (!state.averiasPorClave.has(clave)) state.averiasPorClave.set(clave, []);
      state.averiasPorClave.get(clave).push(e);
    }
  });
}

function calcularPares() {
  const cfg = cfgActual();
  const pares = [];
  state.averiasPorClave.forEach((lista, clave) => {
    let reincidencias = 0;
    lista.forEach((e, i) => {
      if (i > 0 && (e.t - lista[i - 1].t) / 86400000 <= DIAS_REINCIDENCIA) reincidencias += 1;
    });
    const componentes = new Set(lista.map((e) => e.componente));
    const p = {
      clave,
      maquina: lista[0].maquina,
      componente: state.f.nivel === 'equipo' ? `${componentes.size} componente(s)` : lista[0].componente,
      nComponentes: componentes.size,
      n: lista.length,
      tfs: lista.reduce((s, e) => s + e.horas, 0),
      maximo: Math.max(...lista.map((e) => e.horas)),
      reincidencias,
      mecanismo: masFrecuente(lista.map((e) => e.mecanismo)),
      conAccion: lista.filter((e) => e.acciones).length,
    };
    p.a = cfg.a(p);
    p.b = cfg.b(p);
    p.candidato = p.a || p.b;
    pares.push(p);
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
    ['Averías que repiten (≤30 d)', reinc],
    ['Averías con acción registrada', averias ? `${num0.format((conAccion / averias) * 100)}%` : '0%'],
  ];
  $('acrKpis').innerHTML = tarjetas.map(([l, v]) => `<div class="kpi-card"><p class="label">${l}</p><p class="value">${v}</p></div>`).join('');
}

function categoria(p) {
  const cfg = cfgActual();
  if (p.a && p.b) return `${cfg.nombreA} y ${cfg.nombreB}`;
  if (p.a) return cfg.nombreA;
  if (p.b) return cfg.nombreB;
  return 'Sin criterio';
}

function renderMatriz() {
  const cfg = cfgActual();
  const estilo = getComputedStyle(document.body);
  Chart.defaults.color = estilo.color;
  Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#dde1e6';
  Chart.defaults.font.family = estilo.fontFamily;
  Chart.defaults.font.size = 11;

  const colores = {
    [`${cfg.nombreA} y ${cfg.nombreB}`]: '#8a6de0',
    [cfg.nombreA]: '#f28e2b',
    [cfg.nombreB]: '#e0555a',
    'Sin criterio': '#b8bec7',
  };
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
        x: { min: 0.5, title: { display: true, text: 'Número de averías' }, ticks: { stepSize: state.f.nivel === 'equipo' ? 5 : 1 } },
        y: { type: 'logarithmic', min: 0.1, title: { display: true, text: 'Horas de paro (TFS, escala logarítmica)' }, ticks: { callback: (v) => (v >= 1 || v === 0.1 ? num1.format(v) : '') } },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            title: (items) => (state.f.nivel === 'equipo' ? items[0].raw.p.maquina : `${items[0].raw.p.maquina} · ${items[0].raw.p.componente}`),
            label: (c) => `${c.raw.p.n} avería(s) · ${num1.format(c.raw.p.tfs)} h`,
          },
        },
      },
    },
  });
}

function rellenarCriterio() {
  const cfg = cfgActual();
  $('fCriterio').innerHTML = `<option value="">Todos los candidatos</option><option value="a">Solo ${cfg.nombreA.toLowerCase()}</option><option value="b">Solo ${cfg.nombreB.toLowerCase()}</option>`;
  $('fCriterio').value = state.f.criterio;
  $('criterioTexto').innerHTML = cfg.texto;
}

function renderTabla() {
  const cfg = cfgActual();
  const c = state.f.criterio;
  const total = state.pares.reduce((s, p) => s + p.tfs, 0);
  const lista = state.candidatos.filter((p) => !c || (c === 'a' ? p.a : p.b));
  let acum = 0;
  $('tablaCandidatos').querySelector('tbody').innerHTML = lista.map((p, i) => {
    acum += p.tfs;
    return `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(p.maquina)}</td>
      <td>${escapeHtml(p.componente)}</td>
      <td class="col-num">${p.n}</td>
      <td class="col-num">${num1.format(p.tfs)}</td>
      <td class="col-num">${total ? num0.format((acum / total) * 100) : 0}%</td>
      <td class="col-num">${num1.format(p.maximo)}</td>
      <td class="col-num">${p.reincidencias}</td>
      <td>${escapeHtml(p.mecanismo)}</td>
      <td>${p.a ? `<span class="chip chip-reincidente">${cfg.nombreA}</span>` : ''}${p.b ? `<span class="chip chip-aguda">${cfg.nombreB}</span>` : ''}</td>
      <td class="col-num">${p.conAccion}/${p.n}</td>
      <td><button type="button" class="btn-ficha" data-clave="${escapeHtml(p.clave)}">Ficha</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="12">No hay candidatos con este criterio.</td></tr>';
}

function renderTodo() {
  indexar();
  calcularPares();
  rellenarCriterio();
  renderKpis();
  renderMatriz();
  renderTabla();
}

function enfoqueSugerido(p, mecanismo) {
  const cfg = cfgActual();
  const frases = [];
  if (state.f.nivel === 'componente') {
    if (p.a && p.b) frases.push('<strong>Crónica y de alto impacto:</strong> falla seguido y, cuando falla, para mucho tiempo. Es prioridad máxima.');
    else if (p.a) frases.push('<strong>Falla crónica:</strong> se repite, aunque cada paro sea corto. Suele ser desajuste, desgaste o una condición básica sin resolver (limpieza, lubricación, fijación). Atacar con los 5 porqués y estandarizar inspección y ajuste.');
    else frases.push('<strong>Falla aguda:</strong> pocas veces, pero larga. Revisar qué falló y por qué tardó la reparación (repuesto, diagnóstico, personal, proveedor). Acciones típicas: repuesto crítico en bodega, procedimiento de reparación y plan de contingencia.');
  } else {
    if (p.a) frases.push(`<strong>${cfg.nombreA}:</strong> fallas en ${p.nComponentes} componente(s) distintos. Probablemente no es un solo componente sino la condición general del equipo o su operación (limpieza, lubricación, ajuste, calidad de repuestos, método de trabajo). Revisar el plan preventivo del equipo completo.`);
    if (p.b) frases.push(`<strong>${cfg.nombreB}:</strong> acumula muchas horas de paro. Atender primero las averías más largas y revisar disponibilidad de repuestos y soporte técnico.`);
  }
  const guia = GUIA_MECANISMO[mecanismo];
  const preguntas = guia ? `<p class="ficha-sub" style="margin-top:6px">Preguntas guía para el mecanismo <strong>${escapeHtml(mecanismo)}</strong> (el más frecuente):</p><ul class="ficha-guia">${guia.map((g) => `<li>${g}</li>`).join('')}</ul>` : '';
  return `<p style="margin:0">${frases.join('<br>')}</p>${preguntas}`;
}

function abrirFicha(clave) {
  const p = state.pares.find((x) => x.clave === clave);
  const todos = (state.eventosPorClave.get(clave) || []).slice().sort((a, b) => a.t - b.t);
  const averias = state.averiasPorClave.get(clave) || [];
  const intervalos = averias.slice(1).map((e, i) => (e.t - averias[i].t) / 86400000);
  const mtbfObs = intervalos.length ? intervalos.reduce((s, v) => s + v, 0) / intervalos.length : null;

  const conTurno = averias.filter((e) => e.turno);
  const turnos = {};
  conTurno.forEach((e) => { turnos[e.turno] = (turnos[e.turno] || 0) + 1; });
  const turnosTxt = conTurno.length * 2 < averias.length
    ? `no registrado en ${averias.length - conTurno.length} de ${averias.length} paros`
    : Object.entries(turnos).sort().map(([t, n]) => `Turno ${t}: ${n}`).join(' · ');
  const mecs = {};
  averias.forEach((e) => { if (e.mecanismo) mecs[e.mecanismo] = (mecs[e.mecanismo] || 0) + 1; });
  const mecsTxt = Object.entries(mecs).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m}: ${n}`).join(' · ') || '—';

  const equipoCompleto = state.f.nivel === 'equipo';
  let ultimaAveria = null;
  const filas = todos.map((e) => {
    let dias = '—';
    if (TIPOS_AVERIA.includes(e.tipo)) {
      if (ultimaAveria) dias = num0.format((e.t - ultimaAveria) / 86400000);
      ultimaAveria = e.t;
    }
    return `
    <tr>
      <td>${fechaCorta(e.t)}</td>
      ${equipoCompleto ? `<td>${escapeHtml(e.componente)}</td>` : ''}
      <td>${escapeHtml(e.tipo)}</td>
      <td>${num1.format(e.horas)}</td>
      <td>${dias}</td>
      <td>${escapeHtml(e.mecanismo)}</td>
      <td>${escapeHtml(e.descripcion)}</td><td class="ficha-vacio"></td><td>${escapeHtml(e.acciones)}</td>
    </tr>`;
  }).reverse().join('');
  const hoy = new Date().toLocaleDateString('es');
  const titulo = equipoCompleto ? `${escapeHtml(p.maquina)} (equipo completo)` : escapeHtml(p.maquina);

  $('fichaContenido').innerHTML = `
  <div class="ficha">
    <h2>Ficha de análisis de causa raíz (ACR)</h2>
    <p class="ficha-sub">Datos de los paros no planeados del año en curso. Lo demás se completa con el equipo de trabajo.</p>
    <table class="ficha-meta">
      <tr><td>Equipo</td><td>${titulo}</td></tr>
      <tr><td>${equipoCompleto ? 'Componentes' : 'Componente'}</td><td>${equipoCompleto ? `${p.nComponentes} componente(s) con avería` : escapeHtml(p.componente)}</td></tr>
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
    <p class="ficha-sub" style="margin-top:8px">Mecanismo de falla (${state.f.anio}): ${escapeHtml(mecsTxt)}<br>Turno: ${escapeHtml(turnosTxt)}</p>

    <h3>2. Enfoque sugerido</h3>
    ${enfoqueSugerido(p, p.mecanismo)}

    <h3>3. Paros en ${state.f.anio}</h3>
    <p class="ficha-sub">El reporte de producción es referencial y no siempre refleja la causa real. Contrastarlo con lo encontrado en campo y anotar el hallazgo de mantenimiento. "Días desde la anterior" mide cuánto duró el equipo sin fallar.</p>
    <table class="ficha-tabla">
      <thead><tr><th>Fecha</th>${equipoCompleto ? '<th>Componente</th>' : ''}<th>Tipo</th><th>Horas</th><th>Días desde la anterior</th><th>Mecanismo</th><th>Reporte de producción (referencial)</th><th>Hallazgo de mantenimiento</th><th>Acciones registradas</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>

    <h3>4. Definición del problema (qué, dónde, cuándo, cuánto)</h3>
    <div class="ficha-caja"></div>

    <h3>5. Análisis de causas — 5 porqués</h3>
    <table class="ficha-tabla">
      <tbody>
        ${[1, 2, 3, 4, 5].map((n) => `<tr><td style="width:12%">¿Por qué ${n}?</td><td class="ficha-vacio"></td></tr>`).join('')}
      </tbody>
    </table>

    <h3>6. Ishikawa (6M) — anotar causas posibles</h3>
    <div class="ficha-6m">
      <div>Mano de obra</div><div>Método / procedimiento</div><div>Máquina / equipo</div>
      <div>Material / repuesto</div><div>Medición / instrumentos</div><div>Medio ambiente</div>
    </div>

    <h3>7. Causa raíz verificada (con evidencia)</h3>
    <div class="ficha-caja"></div>

    <h3>8. Plan de acción</h3>
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

    <h3>9. Verificación de eficacia</h3>
    <table class="ficha-tabla">
      <thead><tr><th>Indicador</th><th>Línea base</th><th>Meta</th><th>Fecha de revisión</th><th>Resultado</th></tr></thead>
      <tbody>
        <tr><td>Averías</td><td>${p.n} en ${state.f.anio}</td><td class="ficha-vacio"></td><td></td><td></td></tr>
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
  $('fNivel').addEventListener('change', () => { state.f.nivel = $('fNivel').value; state.f.criterio = ''; renderTodo(); });
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
    const todos = payload.eventos.map((e) => {
      const [fecha, hora] = e.fecha.split(' ');
      const [y, m, d] = fecha.split('-').map(Number);
      const [hh, mm] = hora.split(':').map(Number);
      return { ...e, y, t: new Date(y, m - 1, d, hh, mm) };
    }).sort((a, b) => a.t - b.t);
    const anioActual = Math.max(...todos.map((e) => e.y));
    state.f.anio = String(anioActual);
    state.eventos = todos.filter((e) => e.y === anioActual);
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
