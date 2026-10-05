const ANIO_CUMPLIMIENTO = '2026';

const TIPO_COLORS = {
  'PREVENTIVO': '#3fa564',
  'CORRECTIVO PLANIFICADO': '#e0a72c',
  'CORRECTIVO EMERGENTE': '#c3453f',
  'BASADO': '#5b8def',
  'PROYECTO': '#8a6de0',
};

const state = {
  ytdOrders: [],
  weeksYTD: [],
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function pct(part, total) {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10;
}

function parseHoras(str) {
  const n = parseFloat((str || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

async function init() {
  const meta = document.getElementById('meta');
  try {
    const res = await fetch('data/ordenes.json', { cache: 'no-store' });
    const payload = await res.json();
    meta.textContent = `${payload.count} órdenes · Última actualización: ${new Date(payload.updatedAt).toLocaleString('es')}`;
    build(payload.orders);
  } catch (err) {
    meta.textContent = 'No se pudieron cargar los datos.';
    console.error(err);
  }
}

function build(orders) {
  const weeksAll = Array.from(new Set(orders.map((o) => o.Semana).filter(Boolean))).sort();
  const weeksYTD = weeksAll.filter((w) => w.startsWith(`${ANIO_CUMPLIMIENTO}-`));
  const ytdSet = new Set(weeksYTD);
  const ytdOrders = orders.filter((o) => ytdSet.has(o.Semana));

  state.ytdOrders = ytdOrders;
  state.weeksYTD = weeksYTD;

  buildKpis(ytdOrders, weeksYTD);
  buildCumplimiento(ytdOrders, weeksYTD);
  buildTipo(ytdOrders);
  buildSemanaFiltro(weeksYTD);
  buildPlantaTable(ytdOrders);
  buildTecnicosChart(ytdOrders);
}

function buildSemanaFiltro(weeksYTD) {
  const select = document.getElementById('semanaFiltro');
  weeksYTD.slice().reverse().forEach((wk) => {
    const opt = document.createElement('option');
    opt.value = wk;
    opt.textContent = wk;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    const orders = select.value
      ? state.ytdOrders.filter((o) => o.Semana === select.value)
      : state.ytdOrders;
    buildPlantaTable(orders);
    buildTecnicosChart(orders);
  });
}

function buildKpis(ytdOrders, weeksYTD) {
  const total = ytdOrders.length;
  const ejecutado = ytdOrders.filter((o) => o.Estado === 'Ejecutado').length;
  const reprogramado = ytdOrders.filter((o) => o.Estado === 'Reprogramado').length;

  const currentWeek = weeksYTD[weeksYTD.length - 1];
  const prevWeek = weeksYTD[weeksYTD.length - 2];
  const currentOrders = ytdOrders.filter((o) => o.Semana === currentWeek);
  const prevOrders = ytdOrders.filter((o) => o.Semana === prevWeek);
  const currentReprogPct = pct(currentOrders.filter((o) => o.Estado === 'Reprogramado').length, currentOrders.length);
  const prevReprogPct = pct(prevOrders.filter((o) => o.Estado === 'Reprogramado').length, prevOrders.length);
  const diff = Math.round((currentReprogPct - prevReprogPct) * 10) / 10;

  let trendHtml = '<span class="trend trend-flat">Sin cambio vs semana anterior</span>';
  if (diff > 0) trendHtml = `<span class="trend trend-up">▲ ${diff} pts vs semana anterior</span>`;
  if (diff < 0) trendHtml = `<span class="trend trend-down">▼ ${Math.abs(diff)} pts vs semana anterior</span>`;

  const cards = [
    { label: `Órdenes (${ANIO_CUMPLIMIENTO})`, value: total, extra: '' },
    { label: '% Ejecutado', value: `${pct(ejecutado, total)}%`, extra: '' },
    { label: '% Reprogramado', value: `${pct(reprogramado, total)}%`, extra: trendHtml },
  ];

  document.getElementById('kpiRow').innerHTML = cards.map((c) => `
    <div class="kpi-card">
      <p class="label">${escapeHtml(c.label)}</p>
      <p class="value">${c.value}</p>
      ${c.extra}
    </div>
  `).join('');
}

function buildCumplimiento(ytdOrders, weeksYTD) {
  const html = weeksYTD.map((wk) => {
    const wkOrders = ytdOrders.filter((o) => o.Semana === wk);
    const total = wkOrders.length;
    const ejecutado = wkOrders.filter((o) => o.Estado === 'Ejecutado').length;
    const enCurso = wkOrders.filter((o) => o.Estado === 'En Curso').length;
    const reprogramado = wkOrders.filter((o) => o.Estado === 'Reprogramado').length;
    const pReprog = pct(reprogramado, total);
    const pCurso = pct(enCurso, total);
    const pEjec = pct(ejecutado, total);
    const label = wk.replace(/^\d{4}-W/, 'S');
    const detalle = `Semana ${wk} · ${total} orden(es)\nEjecutado: ${ejecutado} (${pEjec}%)\nEn Curso: ${enCurso} (${pCurso}%)\nReprogramado: ${reprogramado} (${pReprog}%)`;
    return `<div class="week-col" title="${escapeHtml(detalle)}">
      <span class="count">${total}</span>
      <div class="stack">
        <div class="seg-reprogramado" style="height:${pReprog}%"></div>
        <div class="seg-en-curso" style="height:${pCurso}%"></div>
        <div class="seg-ejecutado" style="height:${pEjec}%"></div>
      </div>
      <span class="wk-label">${escapeHtml(label)}</span>
    </div>`;
  }).join('');
  document.getElementById('cumplimientoChart').innerHTML = html;
}

function buildTipo(ytdOrders) {
  const total = ytdOrders.length;
  const counts = {};
  ytdOrders.forEach((o) => { counts[o.Tipo] = (counts[o.Tipo] || 0) + 1; });
  const tipos = Object.keys(TIPO_COLORS).filter((t) => counts[t]);

  document.getElementById('tipoBar').innerHTML = tipos.map((t) => {
    const w = pct(counts[t], total);
    return `<div class="tipo-seg" style="width:${w}%;background:${TIPO_COLORS[t]}" title="${escapeHtml(t)}: ${counts[t]} (${w}%)"></div>`;
  }).join('');

  document.getElementById('tipoLegend').innerHTML = tipos.map((t) => `
    <span><i class="dot" style="background:${TIPO_COLORS[t]};border-color:${TIPO_COLORS[t]}"></i>${escapeHtml(t)} · ${pct(counts[t], total)}%</span>
  `).join('');
}

function buildPlantaTable(orders) {
  const map = new Map();
  orders.forEach((o) => {
    if (!map.has(o.Planta)) map.set(o.Planta, []);
    map.get(o.Planta).push(o);
  });

  const horasPorPlanta = [...map.entries()].map(([planta, list]) => ({
    planta,
    list,
    horasInterna: list.filter((o) => o.OrdenType === 'Interna').reduce((sum, o) => sum + parseHoras(o.HorasReales), 0),
    horasExterna: list.filter((o) => o.OrdenType === 'Externa').reduce((sum, o) => sum + parseHoras(o.HorasReales), 0),
  }));
  const totalHorasInterna = horasPorPlanta.reduce((sum, p) => sum + p.horasInterna, 0);
  const totalHorasExterna = horasPorPlanta.reduce((sum, p) => sum + p.horasExterna, 0);

  const rows = horasPorPlanta.sort((a, b) => b.list.length - a.list.length).map(({ planta, list, horasInterna, horasExterna }) => {
    const preventivo = list.filter((o) => o.Tipo === 'PREVENTIVO').length;
    const ejecutadas = list.filter((o) => o.Estado === 'Ejecutado').length;
    const enCurso = list.filter((o) => o.Estado === 'En Curso').length;
    const reprogramadas = list.filter((o) => o.Estado === 'Reprogramado').length;
    return `<tr>
      <td>${escapeHtml(planta)}</td>
      <td>${list.length}</td>
      <td class="est-ejecutado">${ejecutadas}</td>
      <td class="est-en-curso">${enCurso}</td>
      <td class="est-reprogramado">${reprogramadas}</td>
      <td>${pct(preventivo, list.length)}%</td>
      <td>${pct(horasInterna, totalHorasInterna)}% (${Math.round(horasInterna)} h)</td>
      <td>${pct(horasExterna, totalHorasExterna)}% (${Math.round(horasExterna)} h)</td>
    </tr>`;
  }).join('');
  document.querySelector('#plantaTable tbody').innerHTML = rows;
}

function buildTecnicosChart(orders) {
  const map = new Map();
  orders.forEach((o) => {
    [o.Tecnico1, o.Tecnico2].filter(Boolean).forEach((tec) => {
      if (!map.has(tec)) map.set(tec, []);
      map.get(tec).push(o);
    });
  });

  const rows = [...map.entries()].map(([tecnico, list]) => {
    const ejecutadas = list.filter((o) => o.Estado === 'Ejecutado').length;
    const enCurso = list.filter((o) => o.Estado === 'En Curso').length;
    const reprogramadas = list.filter((o) => o.Estado === 'Reprogramado').length;
    const horasPendientes = list
      .filter((o) => o.Estado !== 'Ejecutado')
      .reduce((sum, o) => sum + parseHoras(o.HorasProgramadas), 0);
    return {
      tecnico, ejecutadas, enCurso, reprogramadas, horasPendientes,
      total: list.length,
      pendientes: enCurso + reprogramadas,
    };
  }).sort((a, b) => b.pendientes - a.pendientes || b.horasPendientes - a.horasPendientes || b.total - a.total);

  const chart = document.getElementById('tecnicosChart');
  if (rows.length === 0) {
    chart.innerHTML = '<p class="meta">No hay órdenes para el periodo seleccionado.</p>';
    return;
  }

  const maxTotal = Math.max(...rows.map((r) => r.total));
  chart.innerHTML = rows.map((r) => {
    const detalle = `${r.tecnico}\nEjecutadas: ${r.ejecutadas}\nEn Curso: ${r.enCurso}\nReprogramadas: ${r.reprogramadas}`;
    const seg = (n, cls) => (n > 0 ? `<div class="tec-seg ${cls}" style="flex:${n}">${n}</div>` : '');
    return `<div class="tec-row">
      <span class="tec-name" title="${escapeHtml(r.tecnico)}">${escapeHtml(r.tecnico)}</span>
      <div class="tec-stack" style="width:${pct(r.total, maxTotal)}%" title="${escapeHtml(detalle)}">
        ${seg(r.ejecutadas, 'est-ejecutado')}${seg(r.enCurso, 'est-en-curso')}${seg(r.reprogramadas, 'est-reprogramado')}
      </div>
      <span class="tec-open"><strong>${r.pendientes}</strong> pendientes · ${Math.round(r.horasPendientes)} h</span>
    </div>`;
  }).join('');
}

init();
