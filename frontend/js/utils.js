/* 
   LICIT·LAB — utils.js
   Funciones de utilidad compartidas por todos los módulos.
   Dependencias: ninguna (cargarse primero)
 */

/**
 * Escapa caracteres HTML para evitar XSS en innerHTML.
 */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convierte valores monetarios a número.
 * Soporta:
 *  "33.351,75 €"  → 33351.75  (formato ES)
 *  "33351.75"     → 33351.75  (formato US)
 *  33351.75       → 33351.75  (ya es número)
 *  "-"  / ""      → null
 */
function parseAmount(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;

  let s = String(val).replace(/\u00a0/g, ' ').trim();
  if (!s || s === '-') return null;

  s = s.replace(/[€$]/g, '').replace(/\s/g, '');
  if (!s || s === '-') return null;

  s = s.replace(/[^0-9.,-]/g, '');
  if (!s || s === '-') return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // EU: 7.062,00 → quita puntos de miles, convierte coma a punto
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 7,062.00 → quita comas de miles
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const decimals = s.length - lastComma - 1;
    if (decimals === 0) return null;
    if (decimals <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const decimals = s.length - lastDot - 1;
    if (decimals === 3 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formatea un número como moneda en euros.
 */
function formatEUR(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 2
  }).format(n);
}

/**
 * Normaliza una cabecera para matching robusto:
 *  - minúsculas, NBSP→espacio, quita diacríticos, quita no-alfanuméricos
 *  - colapsa espacios múltiples y trim
 * Ejemplo: "Adjudicatario licitación/lote" → "adjudicatario licitacion lote"
 */
function normHeader(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Genera el HTML de una tarjeta de estadística (KPI card).
 * Reutilizada en: tab-datos, tab-relaciones, tab-ia.
 */
/**
 * Normaliza un nombre de empresa para comparación y búsqueda robusta.
 * Maneja: tildes, mayúsculas/minúsculas, guiones, comas y espacios múltiples.
 *
 * Ejemplos:
 *   "IOONIC SISTEMAS, SL"  → "ioonic sistemas sl"
 *   "Iónic Sistemas-SL"    → "ioonic sistemas sl"   (tilde + guion)
 *   "IONIC SISTEMAS SL"    → "ioonic sistemas sl"   (mayúsculas)
 *
 * Úsala siempre para: indexar opciones, comparar, filtrar y buscar empresas.
 */
function normEmpresa(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // tildes/diacríticos → base
    .toLowerCase()
    .replace(/[\-–—_]+/g, ' ')    // guiones de todo tipo → espacio
    .replace(/\s*[,;]\s*/g, ' ')  // comas y puntos y coma → espacio
    .replace(/[^a-z0-9\s]/g, ' ') // cualquier otro símbolo → espacio
    .replace(/\s+/g, ' ')         // colapsa espacios múltiples
    .trim();
}

/**
 * Versión "display" de normEmpresa: solo limpia comas y espacios
 * para mostrar en la UI, sin perder mayúsculas ni tildes originales.
 */
function normEmpresaDisplay(s) {
  return String(s || '')
    .replace(/\s*[,;]\s*/g, ' ')
    .replace(/[\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function statCard(color, value, label, sub) {
  return `
    <div class="stat-card ${color}">
      <div class="stat-label">${label}</div>
      <div class="stat-value ${color}">${value}</div>
      <div class="stat-sub">${sub}</div>
    </div>`;
}

/* 
   Normalización para escritura en Supabase
   Evita errores tipo: invalid input syntax for type boolean: ""
 */

// Claves (formato JS) que en la BBDD son boolean
const BOOLEAN_JS_KEYS = new Set([
  'esPyme',
  'excluidas',
]);

// Claves (formato JS) que en la BBDD son fecha/hora (timestamptz)
const DATE_JS_KEYS = new Set([
  'fechaActualizacion',
  'fechaOfertas',
]);

// Claves (formato JS) que en la BBDD son numéricas (numeric)
// Importante: en los Excels suelen venir como "33.351,75 €" o "214,629.80 €"
const NUMERIC_JS_KEYS = new Set([
  'valorEstimado',
  'presupuestoSinIVA',
  'presupuestoConIVA',
  'presupuestoLoteConIVA',
  'presupuestoLoteSinIVA',
  'ofertaMasBaja',
  'ofertaMasAlta',
  'importeSinIVA',
  'importeConIVA',
]);

// Claves enteras (int)
const INT_JS_KEYS = new Set([
  'numOfertas',
]);

function toBool(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (v === 1) return true;
    if (v === 0) return false;
    return null;
  }
  const s = String(v).trim().toLowerCase();
  if (!s) return null;

  // true
  if (['1','true','t','yes','y','si','sí','s','x'].includes(s)) return true;
  // false
  if (['0','false','f','no','n'].includes(s)) return false;

  return null;
}

function pad2(n){ return String(n).padStart(2,'0'); }

function formatLocalISOWithOffset(d){
  const y = d.getFullYear();
  const m = pad2(d.getMonth()+1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  const offH = pad2(Math.floor(abs/60));
  const offM = pad2(abs%60);
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}${sign}${offH}:${offM}`;
}

function excelSerialToDate(serial){
  // Excel: días desde 1899-12-30 (incluye fracción de día para hora)
  const ms = (serial - 25569) * 86400 * 1000; // 25569 = 1970-01-01
  return new Date(ms);
}

function toTimestamptz(v){
  if (v === null || v === undefined) return null;
  if (v instanceof Date && !isNaN(v)) return formatLocalISOWithOffset(v);
  if (typeof v === 'number' && isFinite(v)) {
    // Si viene de Excel como número serial
    // Nota: si te cuelan años tipo 20260222 como número, esto lo descartará abajo
    if (v > 20000 && v < 60000) {
      const d = excelSerialToDate(v);
      return isNaN(d) ? null : formatLocalISOWithOffset(d);
    }
    return null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;

  // Formatos típicos: dd/mm/yyyy HH:MM[:SS]  o dd-mm-yyyy ...
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const MM = Number(m[2]);
    let yyyy = Number(m[3]);
    if (yyyy < 100) yyyy += 2000;
    const hh = Number(m[4] ?? 0);
    const mi = Number(m[5] ?? 0);
    const ss = Number(m[6] ?? 0);
    const d = new Date(yyyy, MM-1, dd, hh, mi, ss);
    return isNaN(d) ? null : formatLocalISOWithOffset(d);
  }

  // Si ya viene en ISO (o casi), lo dejamos pasar tal cual
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{4}-\d{2}-\d{2}\s/.test(s)) return s;

  return null;
}

function normalizeForSupabase(jsKey, value) {
  // Excel suele traer ""; Postgres no lo quiere en boolean / numeric
  if (value === '' || value === undefined) return null;

  // Booleans
  if (BOOLEAN_JS_KEYS.has(jsKey)) return toBool(value);

  // Fechas (timestamptz): convierte dd/mm/yyyy HH:MM a ISO
  if (DATE_JS_KEYS.has(jsKey)) return toTimestamptz(value);

  // Numéricos (currency / importes)
  if (NUMERIC_JS_KEYS.has(jsKey)) return parseAmount(value);

  // Enteros
  if (INT_JS_KEYS.has(jsKey)) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
    const s = String(value).trim();
    if (!s) return null;
    const n = parseInt(s.replace(/[^0-9-]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  // Strings: recorta; si queda vacío → null
  if (typeof value === 'string') {
    const s = value.trim();
    return s === '' ? null : s;
  }

  return value;
}

/* 
   Sincronización controlada (batches + cambios)
   - Usado desde: banner (Datos) y pestaña BBDD
   - Requiere tablas: sync_batches, sync_changes
   - Requiere RPC: rollback_batch(p_batch_id uuid)
 */

function dedupeRowsByIdentificador(dbRows) {
  const m = new Map();
  (dbRows || []).forEach(r => {
    if (r && r.identificador !== null && r.identificador !== undefined) m.set(Number(r.identificador), r);
  });
  return m;
}

function buildDbRowsFromAllData(allDataArr) {
  const filasRaw = (allDataArr || [])
    .filter(r => r && r.id !== null && r.id !== undefined && String(r.id).trim() !== '')
    .map(r => {
      const fila = {};
      Object.entries(KEY_TO_COL).forEach(([jsKey, colName]) => {
        fila[colName] = normalizeForSupabase(jsKey, r[jsKey]);
      });
      // identificador BIGINT: debe ser número
      if (fila.identificador !== null && fila.identificador !== undefined) {
        const n = Number(fila.identificador);
        fila.identificador = Number.isFinite(n) ? n : null;
      }
      return fila;
    })
    .filter(f => f.identificador !== null);

  // Deduplicar por identificador: gana la fila con fecha_actualizacion más reciente
  const seen = new Map();
  filasRaw.forEach(f => {
    const existing = seen.get(f.identificador);
    if (!existing) {
      seen.set(f.identificador, f);
    } else {
      const fechaNueva = new Date(f.fecha_actualizacion  || 0).getTime();
      const fechaExist = new Date(existing.fecha_actualizacion || 0).getTime();
      if (fechaNueva > fechaExist) seen.set(f.identificador, f);
    }
  });
  return Array.from(seen.values());
}

/**
 * syncWithBatch — usa /api/sync/upload en el servidor Node.
 * El servidor tiene la service_role key y bypasa RLS completamente.
 * El frontend solo envía las filas; el servidor crea el batch, registra
 * los cambios y hace el upsert.
 */
async function syncWithBatch({
  allDataArr,
  fileName,
  onStatus,
  onProgress,
}) {
  if (!window.currentUser) throw new Error('Sin sesión activa');
  if (window.currentUser.role !== 'admin') throw new Error('Solo administradores pueden sincronizar');

  const filas = buildDbRowsFromAllData(allDataArr);
  if (!filas.length) throw new Error('Ninguna fila válida tiene Identificador');

  onStatus && onStatus(`Preparando ${filas.length} filas para enviar al servidor...`, 'info');

  // Enviamos en lotes al servidor para no saturar el body (cada lote ~500 filas)
  const LOTE = 500;
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let batchId = null;

  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const esUltimo = (i + LOTE) >= filas.length;

    onStatus && onStatus(`Sincronizando... ${Math.min(i + LOTE, filas.length)} / ${filas.length}`, 'info');

    const resp = await fetch('/api/sync/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        filas: lote,
        fileName: fileName || 'archivo',
      }),
    });

    const result = await resp.json();
    if (!resp.ok || !result.success) {
      throw new Error(result.error || `Error del servidor (${resp.status})`);
    }

    batchId = result.batchId;
    rowsInserted += result.rowsInserted || 0;
    rowsUpdated  += result.rowsUpdated  || 0;

    onProgress && onProgress(Math.min(i + LOTE, filas.length), filas.length);
  }

  onStatus && onStatus(` Sincronización completada: ${rowsInserted} nuevas · ${rowsUpdated} actualizadas`, 'success');
  return { batchId, rowsTotal: filas.length, rowsInserted, rowsUpdated };
}

async function rollbackSyncBatch(batchId) {
  if (!batchId) throw new Error('batchId no válido');
  if (!window.currentUser) throw new Error('Sin sesión activa');

  const resp = await fetch('/api/sync/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ batchId }),
  });
  const result = await resp.json();
  if (!resp.ok || !result.success) throw new Error(result.error || 'Error al restaurar');
  return true;
}