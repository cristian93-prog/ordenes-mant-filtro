import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const SOURCE_URL = 'http://116.202.72.90:51185/WebServices/Mantenimiento/OrdenesMant';
const OUT_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const OUT_PATH = fileURLToPath(new URL('../data/ordenes.json', import.meta.url));

const COLUMNS = [
  'NoOrden', 'CodigoOT', 'Tipo', 'Planta', 'DescripcionMaquina', 'Componente', 'Actividad',
  'Prioridad', 'Tecnico1', 'Tecnico2', 'HoraInicio', 'HorasProgramadas', 'AsignadoPor',
  'FechaCreacion', 'FechaPrevista', 'OrdenType', 'Estado', 'UsuarioCierre', 'FechaCierre',
  'HorasReales', 'ComentarioCierre',
];

function isoWeekLabel(ddmmyyyy) {
  if (!ddmmyyyy) return '';
  const parts = ddmmyyyy.trim().split('-').map(Number);
  const [d, m, y] = parts;
  if (!d || !m || !y) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const rows = [];
  $('table tbody tr').each((_, tr) => {
    const cells = $(tr).find('td').map((__, td) => $(td).text().trim()).get();
    if (cells.length !== COLUMNS.length) return;
    const row = {};
    COLUMNS.forEach((col, i) => { row[col] = cells[i]; });
    row.Semana = isoWeekLabel(row.FechaPrevista);
    rows.push(row);
  });

  if (rows.length === 0) {
    throw new Error('No se encontraron filas en la tabla de origen; abortando para no sobreescribir datos válidos.');
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    count: rows.length,
    orders: rows,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload));
  console.log(`Wrote ${rows.length} orders to data/ordenes.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
