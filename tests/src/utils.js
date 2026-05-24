/**
 * LICITRA — utils.js (adaptador ES module para tests)
 * Fuente: frontend/js/utils.js — funciones copiadas literalmente para
 * poder importarlas en el entorno Vitest (el original es vanilla JS global).
 */

/**
 * Normaliza una cabecera de Excel para matching robusto:
 * minúsculas, NBSP→espacio, quita diacríticos, quita no-alfanuméricos,
 * colapsa espacios múltiples y hace trim.
 *
 * Ejemplo: "Adjudicatario licitación/lote" → "adjudicatario licitacion lote"
 */
export function normHeader(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ /g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Normaliza un nombre de empresa para comparación y búsqueda robusta.
 */
export function normEmpresa(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\-–—_]+/g, ' ')
    .replace(/\s*[,;]\s*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convierte valores monetarios a número.
 * Soporta formato ES ("33.351,75 €") y US ("33351.75").
 */
export function parseAmount(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return (!isNaN(val) && Number.isFinite(val)) ? val : null;
  }
  let s = String(val).trim();
  if (!s || s === '-' || s === '') return null;
  s = s.replace(/[€$]/g, '').replace(/ /g, ' ').replace(/\s/g, '');
  if (!s || s === '-') return null;
  const tienePunto = s.includes('.');
  const tieneComa  = s.includes(',');
  if (tienePunto && tieneComa) {
    const ultimoPunto = s.lastIndexOf('.');
    const ultimaComa  = s.lastIndexOf(',');
    if (ultimaComa > ultimoPunto) { s = s.replace(/\./g, ''); s = s.replace(',', '.'); }
    else                          { s = s.replace(/,/g, ''); }
  } else if (tieneComa) {
    const partes = s.split(',');
    if (partes.length === 2 && partes[1].length <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (tienePunto) {
    const partes = s.split('.');
    if (!(partes.length === 2 && partes[1].length <= 2)) s = s.replace(/\./g, '');
  }
  s = s.replace(/[^0-9.-]/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  return (!isNaN(n) && Number.isFinite(n)) ? n : null;
}
