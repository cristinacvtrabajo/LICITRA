/**
 * LICITRA — config.js (adaptador ES module para tests)
 * Fuente: frontend/js/config.js — COL_MAP copiado literalmente.
 * Añade buildColMapping(), función derivada del algoritmo de
 * tab-datos.js que resuelve qué clave interna corresponde a cada
 * cabecera de columna de un Excel importado.
 */

import { normHeader } from './utils.js';

export const COL_MAP = [
  { key: 'id',                   label: 'ID',                    match: ['identificador'] },
  { key: 'link',                 label: 'Enlace licit.',         match: ['link_licitacion', 'link licitaci'] },
  { key: 'enlacePerfil',         label: 'Enlace perfil OC',      match: ['enlace al perfil de contratante', 'enlace perfil contratante', 'perfil de contratante'] },
  { key: 'fechaActualizacion',   label: 'F.Actualización',       match: ['fecha actualizaci'] },
  { key: 'estado',               label: 'Estado',                match: ['estado'] },
  { key: 'expediente',           label: 'Nº Expediente',         match: ['numero de expediente', 'number de expediente'] },
  { key: 'objeto',               label: 'Objeto',                match: ['objeto del contrato'] },
  { key: 'valorEstimado',        label: 'Valor estimado',        match: ['valor estimado del contrato', 'valor estimado'] },
  { key: 'presupuestoSinIVA',    label: 'Presup. sin IVA',       match: ['presupuesto base sin impuestos', 'presupuesto base sin'] },
  { key: 'presupuestoConIVA',    label: 'Presup. con IVA',       match: ['presupuesto base con impuestos', 'presupuesto base con'] },
  { key: 'cpv',                  label: 'CPV',                   match: ['cpv'] },
  { key: 'lugarEjecucion',       label: 'Lugar ejecución',       match: ['lugar de ejecuci'] },
  { key: 'organo',               label: 'Órgano contratante',    match: ['organo de contrataci', 'organo de contratante', 'organo contrataci'] },
  { key: 'tipoAdmin',            label: 'Tipo administración',   match: ['tipo de administraci'] },
  { key: 'codigoPostal',         label: 'Cód. Postal',           match: ['codigo postal'] },
  { key: 'tipoProcedimiento',    label: 'Procedimiento',         match: ['tipo de procedimiento'] },
  { key: 'fechaOfertas',         label: 'F.Ofertas',             match: ['fecha de presentacion de oferta', 'fecha de presentacion de solicitud', 'fecha de presentaci'] },
  { key: 'objetoLote',           label: 'Objeto lote',           match: ['objeto licitacion lote', 'objeto licitaci'] },
  { key: 'presupuestoLoteConIVA',label: 'Presup.lote c/IVA',     match: ['presupuesto base con impuestos licitacion lote', 'presupuesto base con impuestos licitaci'] },
  { key: 'presupuestoLoteSinIVA',label: 'Presup.lote s/IVA',     match: ['presupuesto base sin impuestos licitacion lote', 'presupuesto base sin impuestos licitaci'] },
  { key: 'cpvLote',              label: 'CPV lote',              match: ['cpv licitacion lote', 'cpv licitaci'] },
  { key: 'lugarLote',            label: 'Lugar ejec. lote',      match: ['lugar ejecucion licitacion lote', 'lugar ejecucion licitaci'] },
  { key: 'resultadoLote',        label: 'Resultado',             match: ['resultado licitacion lote', 'resultado licitaci'] },
  { key: 'fechaAcuerdo',         label: 'F.Acuerdo',             match: ['fecha del acuerdo licitacion lote', 'fecha del acuerdo licitaci', 'fecha del acuerdo'] },
  { key: 'numOfertas',           label: 'Nº ofertas',            match: ['numero de ofertas recibidas por licitacion lote', 'numero de ofertas recibidas', 'numero de ofertas'] },
  { key: 'ofertaMasBaja',        label: 'Oferta más baja',       match: ['precio de la oferta mas baja por licitacion lote', 'precio de la oferta mas baja'] },
  { key: 'ofertaMasAlta',        label: 'Oferta más alta',       match: ['precio de la oferta mas alta por licitacion lote', 'precio de la oferta mas alta'] },
  { key: 'excluidas',            label: 'Exc. anorm. bajas',     match: ['anormalmente bajas'] },
  { key: 'numContrato',          label: 'Nº contrato lote',      match: ['numero del contrato licitacion lote', 'numero del contrato licitaci', 'numero del contrato'] },
  { key: 'fechaFormalizacion',   label: 'F.Formalización',       match: ['fecha formalizacion del contrato licitacion lote', 'fecha formalizacion del contrato licitaci', 'fecha formalizacion del contrato', 'fecha formalizaci'] },
  { key: 'fechaVigencia',        label: 'F.Entrada vigor',       match: ['fecha entrada en vigor del contrato', 'entrada en vigor'] },
  { key: 'adjudicatario',        label: 'Adjudicatario',         match: ['adjudicatario licitacion lote', 'adjudicatario licitaci', 'adjudicatario de la licitaci', 'adjudicatario'] },
  { key: 'idAdjudicatario',      label: 'ID Adjudicatario',      match: ['identificador adjudicatario de la licitacion lote', 'identificador adjudicatario por licitacion lote', 'identificador de adjudicatario', 'identificador adjudicatario'] },
  { key: 'esPyme',               label: 'PYME',                  match: ['adjudicatario es o no pyme de la licitacion lote', 'adjudicatario es o no pyme', 'pyme de la licitacion lote', 'pyme'] },
  { key: 'importeSinIVA',        label: 'Importe adj. sin IVA',  match: ['importe adjudicacion sin impuestos licitacion lote', 'importe adjudicacion sin impuestos licitaci', 'importe adjudicacion sin impuestos', 'importe adjudicacion sin'] },
  { key: 'importeConIVA',        label: 'Importe adj. con IVA',  match: ['importe adjudicacion con impuestos licitacion lote', 'importe adjudicacion con impuestos licitaci', 'importe adjudicacion con impuestos', 'importe adjudicacion con'] },
  { key: 'lote',                 label: 'Lote',                  match: ['lote'] },
];

/**
 * buildColMapping — dado un array de cabeceras de Excel (strings),
 * devuelve un objeto { índice: clave_interna } usando el algoritmo
 * "elige el patrón de MAYOR longitud que coincida" de LICITRA.
 *
 * Este algoritmo garantiza que "objeto licitacion lote" (específico)
 * venza sobre el genérico "objeto del contrato".
 *
 * @param {string[]} headers  Cabeceras tal como vienen del Excel
 * @returns {Record<number, string>}  { col_index: key }
 */
export function buildColMapping(headers) {
  const mapping = {};
  headers.forEach((h, idx) => {
    const norm = normHeader(h);
    let bestKey = null;
    let bestLen = 0;
    for (const entry of COL_MAP) {
      for (const pattern of entry.match) {
        if (norm.includes(pattern) && pattern.length > bestLen) {
          bestLen = pattern.length;
          bestKey = entry.key;
        }
      }
    }
    if (bestKey) mapping[idx] = bestKey;
  });
  return mapping;
}
