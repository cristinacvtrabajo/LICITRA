/* 
   LICIT·LAB — config.js
   Constantes globales: mapeo de columnas, defaults, page size.
   Dependencias: utils.js (para normHeader, aunque no se llama aquí)
 */

//  SUPABASE 
const SUPABASE_URL  = 'https://yigtzeoilweytxbpcdqb.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZ3R6ZW9pbHdleXR4YnBjZHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODQxNTYsImV4cCI6MjA5MjI2MDE1Nn0.t0tFWU8lL6dLRPSRnEZWAZRE57_F7nr4uX-Ks_JMiD0';

//  GROQ IA — las llamadas van al proxy /api/ia/groq, la key sólo vive en .env
// (no hay constante GROQ_API_KEY en el frontend intencionadamente)

//  COLUMNAS 
/**
 * Mapeo de columnas internas: key → label → patrones de matching.
 * El algoritmo elige el patrón de MAYOR longitud que coincida,
 * así "objeto licitacion lote" vence sobre el genérico "lote".
 */
const COL_MAP = [
  //  Generales 
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

  //  Por licitación/lote (específicos, ANTES que el genérico 'lote') 
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

  //  Genérico 'lote' — al final para no capturar los específicos 
  { key: 'lote',                 label: 'Lote',                  match: ['lote'] },
];

// Columnas visibles por defecto al cargar datos
const DEFAULT_VISIBLE = [
  'id','fechaActualizacion','expediente','objeto','organo','tipoProcedimiento',
  'presupuestoConIVA','importeConIVA','adjudicatario','estado','resultadoLote'
];

// Claves que representan importes monetarios (formatear como EUR en la tabla)
const AMOUNT_KEYS = new Set([
  'importeConIVA','importeSinIVA','presupuestoConIVA','presupuestoSinIVA',
  'valorEstimado','ofertaMasBaja','ofertaMasAlta',
  'presupuestoLoteConIVA','presupuestoLoteSinIVA'
]);

// Filas por página en la tabla de datos
const PAGE_SIZE = 50;

//  MAPEO KEY JS ↔ COLUMNA SUPABASE (tabla: licitaciones_filtradas) 
const KEY_TO_COL = {
  id:                    'identificador',
  link:                  'link_licitacion',
  enlacePerfil:          'enlace_al_perfil_de_',
  fechaActualizacion:    'fecha_actualizacion',
  estado:                'estado',
  expediente:            'numero_de_expediente',
  objeto:                'objeto_del_contrato',
  valorEstimado:         'valor_estimado_del_',
  presupuestoSinIVA:     'presupuesto_base_si_',
  presupuestoConIVA:     'presupuesto_base_c_',
  cpv:                   'cpv',
  lugarEjecucion:        'lugar_de_ejecucion',
  organo:                'organo_de_contratac_',
  tipoAdmin:             'tipo_de_administracion',
  codigoPostal:          'codigo_postal',
  tipoProcedimiento:     'tipo_de_procedimiento',
  fechaOfertas:          'fecha_de_presentaci_',
  lote:                  'lote',
  objetoLote:            'objeto_licitacion_lote',
  presupuestoLoteConIVA: 'presupuesto_base_c2_',
  presupuestoLoteSinIVA: 'presupuesto_base_si2_',
  cpvLote:               'cpv_licitacion_lote',
  lugarLote:             'lugar_ejecucion_licit_',
  resultadoLote:         'resultado_licitacion_l_',
  numOfertas:            'numero_de_ofertas_r_',
  ofertaMasBaja:         'precio_de_la_oferta_1_',
  ofertaMasAlta:         'precio_de_la_oferta_2_',
  excluidas:             'excluidas_anormalm_',
  numContrato:           'numero_del_contrato_',
  adjudicatario:         'adjudicatario_licitaci_',
  idAdjudicatario:       'identificador_adjudic_',
  esPyme:                'el_adjudicatario_es_',
  importeSinIVA:         'importe_adjudicacio_2_',
  importeConIVA:         'importe_adjudicacio_1_',
};

const COL_TO_KEY = Object.fromEntries(Object.entries(KEY_TO_COL).map(([k,v]) => [v,k]));