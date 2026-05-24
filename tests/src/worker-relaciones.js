/**
 * LICITRA — worker-relaciones.js (adaptador ES module para tests)
 * Fuente: frontend/js/worker-relaciones.js — función computeRisk copiada literalmente.
 *
 * En producción esta función vive dentro de un Web Worker (no tiene export).
 * Este adaptador la expone como módulo ES para que Vitest pueda importarla.
 */

/**
 * Calcula el score de riesgo de concentración para un par (órgano, adjudicatario).
 *
 * @param {object[]} group       Contratos del par (órgano + empresa)
 * @param {number}   totalOrg   Total de contratos del órgano (todas las empresas)
 * @returns {{ n, totalAmount, avg, concentration, score }}
 *
 * Reglas de puntuación (score máximo = 100):
 *   + 40 pts  si la empresa concentra > 80 % de los contratos del órgano
 *   + 20 pts  si el grupo tiene ≥ 5 contratos
 *   + 20 pts  si el importe medio supera 100 000 €
 *   + 20 pts  si el grupo tiene ≥ 10 contratos
 */
export function computeRisk(group, totalOrg) {
  const n = group.length;
  const totalAmount = group.reduce((s, r) => s + (r.importeConIVA || 0), 0);
  const avg = n > 0 ? totalAmount / n : 0;
  const concentration = totalOrg > 0 ? n / totalOrg : 0;

  let score = 0;
  if (concentration > 0.8) score += 40;
  if (n >= 5)              score += 20;
  if (avg > 100_000)       score += 20;
  if (n >= 10)             score += 20;

  return { n, totalAmount, avg, concentration, score };
}
