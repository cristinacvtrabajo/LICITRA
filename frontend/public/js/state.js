/* 
 LICITRA — state.js
 Estado mutable compartido por todos los módulos.
 Dependencias: config.js (DEFAULT_VISIBLE, PAGE_SIZE)
 */

// Estado principal de datos 
let allData = []; // todos los registros normalizados
let filteredData = []; // registros tras aplicar filtros activos
let rawHeaders = []; // cabeceras originales del archivo cargado
let colMapping = {}; // key interna → array de índices en rawHeaders

// Estado de columnas visibles en la tabla 
let visibleCols = [...DEFAULT_VISIBLE];

// Estado de ordenación de la tabla 
let sortCol = 'fechaActualizacion';
let sortDir = 'desc';

// Estado de paginación de la tabla 
let currentPage = 1;
