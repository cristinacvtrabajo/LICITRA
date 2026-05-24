/**
 * LICITRA — Pruebas unitarias: normHeader()
 * Función: frontend/js/utils.js › normHeader
 *
 * Verifica que la normalización de cabeceras sea robusta frente a:
 *   - mayúsculas / minúsculas
 *   - tildes y diacríticos (ó, é, ú, ñ…)
 *   - separadores no estándar (/, -, espacios múltiples)
 *   - caracteres no imprimibles (NBSP  )
 *   - entradas vacías o nulas
 */
import { describe, it, expect } from 'vitest';
import { normHeader } from '../src/utils.js';

describe('normHeader()', () => {
  it('convierte a minúsculas', () => {
    expect(normHeader('ESTADO')).toBe('estado');
  });

  it('elimina tildes y diacríticos', () => {
    expect(normHeader('Órgano de Contratación')).toBe('organo de contratacion');
  });

  it('reemplaza separadores no alfanuméricos por espacio', () => {
    expect(normHeader('Adjudicatario licitación/lote')).toBe('adjudicatario licitacion lote');
  });

  it('colapsa espacios múltiples', () => {
    expect(normHeader('Fecha   Actualización')).toBe('fecha actualizacion');
  });

  it('reemplaza NBSP (\\u00a0) por espacio normal', () => {
    expect(normHeader('Número Expediente')).toBe('numero expediente');
  });

  it('elimina guiones y puntos', () => {
    expect(normHeader('Presupuesto-Base. Sin IVA')).toBe('presupuesto base sin iva');
  });

  it('devuelve cadena vacía para entrada vacía', () => {
    expect(normHeader('')).toBe('');
  });

  it('devuelve cadena vacía para null', () => {
    expect(normHeader(null)).toBe('');
  });

  it('devuelve cadena vacía para undefined', () => {
    expect(normHeader(undefined)).toBe('');
  });

  it('maneja cabeceras reales del PLACE (ñ, paréntesis)', () => {
    expect(normHeader('Número de Expediente')).toBe('numero de expediente');
  });

  it('normaliza correctamente cabecera de adjudicatario con lote', () => {
    expect(normHeader('Adjudicatario Licitación/Lote'))
      .toBe('adjudicatario licitacion lote');
  });
});
