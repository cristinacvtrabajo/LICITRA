/**
 * LICITRA — Pruebas unitarias: computeRisk()
 * Función: frontend/js/worker-relaciones.js › computeRisk
 * Contexto: Web Worker que construye el índice de relaciones órgano–empresa.
 *
 * La función evalúa el riesgo de concentración de un par (órgano, adjudicatario)
 * en función de cuatro criterios acumulativos:
 *   +40 pts  concentración > 80 % de los contratos del órgano
 *   +20 pts  ≥ 5 contratos en el par
 *   +20 pts  importe medio > 100 000 €
 *   +20 pts  ≥ 10 contratos en el par
 *
 * Score máximo: 100.  Score mínimo: 0.
 */
import { describe, it, expect } from 'vitest';
import { computeRisk } from '../src/worker-relaciones.js';

/** Helper: genera N contratos con importe fijo */
function makeContratos(n, importeConIVA = 50_000) {
  return Array.from({ length: n }, () => ({ importeConIVA }));
}

describe('computeRisk()', () => {

  it('score = 0 con 1 contrato, importe bajo y concentración baja', () => {
    const group = makeContratos(1, 10_000);
    const { score } = computeRisk(group, 100);
    expect(score).toBe(0);
  });

  it('suma +40 cuando la concentración supera el 80 %', () => {
    // 9 contratos del par sobre 10 del órgano = 90 %
    const group = makeContratos(9, 10_000);
    const { score, concentration } = computeRisk(group, 10);
    expect(concentration).toBeCloseTo(0.9);
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it('suma +20 cuando el grupo tiene exactamente 5 contratos', () => {
    const group = makeContratos(5, 10_000);
    const { score } = computeRisk(group, 100);   // concentración baja
    expect(score).toBe(20);
  });

  it('suma +20 cuando el importe medio supera 100 000 €', () => {
    const group = makeContratos(1, 200_000);
    const { score, avg } = computeRisk(group, 100);
    expect(avg).toBe(200_000);
    expect(score).toBe(20);
  });

  it('suma +20 cuando el grupo tiene exactamente 10 contratos', () => {
    // 10 contratos, concentración baja, importe bajo → solo +20 (n≥5) +20 (n≥10)
    const group = makeContratos(10, 10_000);
    const { score } = computeRisk(group, 1000);
    expect(score).toBe(40);  // 20 (n≥5) + 20 (n≥10)
  });

  it('score máximo 100 con concentración alta + muchos contratos + importe alto', () => {
    // 10 contratos sobre 11 del órgano (>80%), importe medio 200k
    const group = makeContratos(10, 200_000);
    const { score } = computeRisk(group, 11);
    expect(score).toBe(100); // 40+20+20+20
  });

  it('calcula correctamente totalAmount y avg', () => {
    const group = [
      { importeConIVA: 100_000 },
      { importeConIVA: 200_000 },
      { importeConIVA: 300_000 },
    ];
    const { n, totalAmount, avg } = computeRisk(group, 10);
    expect(n).toBe(3);
    expect(totalAmount).toBe(600_000);
    expect(avg).toBeCloseTo(200_000);
  });

  it('maneja registros con importeConIVA nulo o cero sin errores', () => {
    const group = [{ importeConIVA: null }, { importeConIVA: 0 }, { importeConIVA: undefined }];
    const { totalAmount, avg } = computeRisk(group, 10);
    expect(totalAmount).toBe(0);
    expect(avg).toBe(0);
  });

  it('concentration = 0 cuando totalOrg es 0 (evita división por cero)', () => {
    const group = makeContratos(5, 50_000);
    const { concentration } = computeRisk(group, 0);
    expect(concentration).toBe(0);
  });

  it('avg = 0 y score = 0 con grupo vacío', () => {
    const { n, totalAmount, avg, score } = computeRisk([], 10);
    expect(n).toBe(0);
    expect(totalAmount).toBe(0);
    expect(avg).toBe(0);
    expect(score).toBe(0);
  });
});
