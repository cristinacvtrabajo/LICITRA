/**
 * LICITRA — Pruebas unitarias: buildColMapping()
 * Función: frontend/js/config.js + tab-datos.js › buildColMapping
 *
 * El algoritmo elige, para cada cabecera de un Excel importado,
 * la clave interna cuyo patrón de matching tiene MAYOR longitud.
 * Esto garantiza que cabeceras específicas (p.ej. "Adjudicatario
 * Licitación/Lote") no sean capturadas por patrones genéricos
 * ("adjudicatario"), evitando asignaciones incorrectas.
 */
import { describe, it, expect } from 'vitest';
import { buildColMapping } from '../src/config.js';

describe('buildColMapping()', () => {

  it('mapea cabecera exacta "Identificador" → clave "id"', () => {
    const mapping = buildColMapping(['Identificador']);
    expect(mapping[0]).toBe('id');
  });

  it('mapea "Estado" → clave "estado"', () => {
    const mapping = buildColMapping(['Estado']);
    expect(mapping[0]).toBe('estado');
  });

  it('mapea "Objeto del Contrato" → clave "objeto"', () => {
    const mapping = buildColMapping(['Objeto del Contrato']);
    expect(mapping[0]).toBe('objeto');
  });

  it('resuelve ambigüedad: específico gana sobre genérico (lote)', () => {
    // "Adjudicatario Licitación/Lote" debe → "adjudicatario", NO "lote"
    // Y el patrón "adjudicatario licitacion lote" es más largo que "adjudicatario"
    const mapping = buildColMapping(['Adjudicatario Licitación/Lote']);
    expect(mapping[0]).toBe('adjudicatario');
  });

  it('CPV Licitación/Lote → cpvLote, no cpv genérico', () => {
    const mapping = buildColMapping(['CPV Licitación/Lote']);
    expect(mapping[0]).toBe('cpvLote');
  });

  it('Importe adjudicación con impuestos → importeConIVA', () => {
    const mapping = buildColMapping(['Importe adjudicación con impuestos']);
    expect(mapping[0]).toBe('importeConIVA');
  });

  it('Importe adjudicación con impuestos licitación/lote → importeConIVA (patrón más largo)', () => {
    const mapping = buildColMapping(['Importe adjudicación con impuestos licitación/lote']);
    expect(mapping[0]).toBe('importeConIVA');
  });

  it('cabecera desconocida no aparece en el mapping', () => {
    const mapping = buildColMapping(['ColumnaDesconocida']);
    expect(mapping[0]).toBeUndefined();
  });

  it('mapea correctamente un array de múltiples cabeceras (Excel real PLACE)', () => {
    const headers = [
      'Identificador',
      'Estado',
      'Órgano de Contratación',
      'Objeto del Contrato',
      'Presupuesto base con impuestos',
      'Adjudicatario Licitación/Lote',
      'Importe adjudicación con impuestos licitación/lote',
      'ColumnaExtra',
    ];
    const mapping = buildColMapping(headers);
    expect(mapping[0]).toBe('id');
    expect(mapping[1]).toBe('estado');
    expect(mapping[2]).toBe('organo');
    expect(mapping[3]).toBe('objeto');
    expect(mapping[4]).toBe('presupuestoConIVA');
    expect(mapping[5]).toBe('adjudicatario');
    expect(mapping[6]).toBe('importeConIVA');
    expect(mapping[7]).toBeUndefined();
  });

  it('array vacío devuelve mapping vacío', () => {
    expect(buildColMapping([])).toEqual({});
  });
});
