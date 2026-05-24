/* 
 LICITRA — bbdd.js
 Pestaña "Base de Datos": carga desde Supabase y subida/sync
 de datos con detección de duplicados (upsert por ID).
 */

// ESTADO
let bbddData = []; // página actual cargada desde Supabase
let bbddFiltered = []; // alias (no usado en modo server-side, pero mantenido por compatibilidad)
let bbddPage = 1;
const BBDD_PAGE_SIZE = 50;
let bbddSortCol = null;
let bbddSortDir = 'asc';
let isAdmin = false; // Admin: control total
let isManager = false; // Manager o Admin: acceso operativo
let bbddTotalCount = 0; // total de registros en Supabase (para paginación)
let bbddSearchDebounce = null; // timer para debounce de búsqueda

// Filtros activos
let bbddFiltros = { search: '', estado: '', tipo: '' };

// KEY_TO_COL y COL_TO_KEY definidos en config.js (se cargan antes)



// INIT DE LA PESTAÑA
async function initBBDDTab() {
 // Determinar rol del usuario (viene del servidor Node via checkAuth)
 const role = window.currentUser?.role;
 isAdmin = role === 'admin';
 isManager = role === 'manager' || role === 'admin';

 // Sección de sincronización: solo Admin
 const uploadSection = document.getElementById('bbddUploadSection');
 if (uploadSection) uploadSection.style.display = isAdmin ? 'block' : 'none';

 // Sección de backup + historial: Manager y Admin
 const managerSection = document.getElementById('bbddManagerSection');
 if (managerSection) managerSection.style.display = isManager ? 'block' : 'none';

 // Badge de rol
 const roleBadge = document.getElementById('bbddRoleBadge');
 if (roleBadge) {
 if (isAdmin) {
 roleBadge.innerHTML = `<span class="badge badge-lime"> Administrador</span>`;
 } else if (isManager) {
 roleBadge.innerHTML = `<span class="badge badge-cyan"> Manager</span>`;
 } else {
 roleBadge.innerHTML = `<span class="badge badge-gray"> Solo lectura</span>`;
 }
 }

 // Cargar datos automáticamente al abrir la pestaña
 await cargarDesdeBBDD();
}

// CARGA DESDE SUPABASE (paginación server-side)
async function cargarDesdeBBDD(forzar = false) {
 const btn = document.getElementById('bbddBtnCargar');
 const spinner = document.getElementById('bbddSpinner');
 const empty = document.getElementById('bbddEmpty');
 const content = document.getElementById('bbddContent');

 if (btn) btn.disabled = true;
 if (spinner) spinner.style.display = 'flex';
 if (empty) empty.style.display = 'none';
 if (content) content.style.display = 'none';

 bbddPage = 1;
 bbddData = [];

 try {
 // Lanzar stats y primera página en paralelo
 const [, pageResult] = await Promise.all([
 mostrarBBDDStats(),
 _fetchBBDDPage(1),
 ]);

 if (!pageResult || pageResult.total === 0) {
 if (empty) empty.style.display = 'block';
 if (content) content.style.display = 'none';
 return;
 }

 bbddTotalCount = pageResult.total;
 bbddData = pageResult.rows;

 if (content) content.style.display = 'block';
 await _poblarFiltrosBBDDDesdeServidor();
 renderBBDDTable();
 cargarLogSubidas();

 } catch (err) {
 console.error('Error cargando BBDD:', err);
 setBBDDStatus('error', `Error al cargar: ${err.message}`);
 } finally {
 if (btn) btn.disabled = false;
 if (spinner) spinner.style.display = 'none';
 }
}

// Pide una página al servidor con los filtros activos
async function _fetchBBDDPage(page) {
 const from = (page - 1) * BBDD_PAGE_SIZE;
 const params = new URLSearchParams({
 from: String(from),
 batch: String(BBDD_PAGE_SIZE),
 search: bbddFiltros.search,
 estado: bbddFiltros.estado,
 tipo: bbddFiltros.tipo,
 sort: bbddSortCol || '',
 dir: bbddSortDir || 'asc',
 });

 const resp = await fetch(`/api/sync/tabla?${params}`, { credentials: 'include' });
 if (!resp.ok) {
 const err = await resp.json().catch(() => ({}));
 throw new Error(err.error || `Error del servidor (${resp.status})`);
 }
 const json = await resp.json();
 if (!json.success) throw new Error(json.error || 'Error cargando página');

 // Convertir filas Supabase → formato interno (keys JS)
 const rows = (json.data || []).map(row => {
 const obj = {};
 Object.entries(row).forEach(([col, val]) => {
 const key = COL_TO_KEY[col] || col;
 obj[key] = val === null || val === undefined ? '' : val;
 });
 obj._importeConIVA = parseAmount(obj.importeConIVA) || parseAmount(obj.presupuestoLoteConIVA) || parseAmount(obj.presupuestoConIVA) || 0;
 obj._importeSinIVA = parseAmount(obj.importeSinIVA) || parseAmount(obj.presupuestoLoteSinIVA) || parseAmount(obj.presupuestoSinIVA) || 0;
 obj._valorEstimado = parseAmount(obj.valorEstimado) || 0;
 obj._ofertaMasBaja = parseAmount(obj.ofertaMasBaja) || 0;
 obj._ofertaMasAlta = parseAmount(obj.ofertaMasAlta) || 0;
 return obj;
 });

 return { rows, total: json.total || 0 };
}

// Poblar selectores de filtro (solo en la primera carga, con valores distintos del servidor)
async function _poblarFiltrosBBDDDesdeServidor() {
 try {
 const resp = await fetch('/api/sync/filtros', { credentials: 'include' });
 if (!resp.ok) return;
 const json = await resp.json();
 if (!json.success) return;

 const selEstado = document.getElementById('bbddFilterEstado');
 const selTipo = document.getElementById('bbddFilterTipo');

 if (selEstado && json.estados) {
 selEstado.innerHTML = '<option value="">Todos los estados</option>' +
 json.estados.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
 }
 if (selTipo && json.tipos) {
 selTipo.innerHTML = '<option value="">Todos los tipos</option>' +
 json.tipos.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
 }
 } catch(e) {
 console.warn('[bbdd] No se pudieron cargar filtros del servidor:', e);
 }
}

// KPIs DE LA BBDD
// Se calculan desde allData (ya cargado en la pestaña Datos) para que coincidan
// exactamente con los 7 KPIs de esa pestaña. El servidor sólo se usa como fallback.
async function mostrarBBDDStats() {
 const grid = document.getElementById('bbddStatsGrid');
 if (!grid) return;

 // Placeholders mientras calcula
 grid.innerHTML =
 statCard('lime', '…', 'Total licitaciones', 'registros en BBDD') +
 statCard('cyan', '…', 'Importe total adj.', 'con IVA') +
 statCard('green', '…', 'Con adjudicatario', 'de …') +
 statCard('amber', '…', 'Pendientes', 'de adjudicación') +
 statCard('orange', '…', 'Órganos contratantes', 'distintos') +
 statCard('red', '…', 'Adjudicatarios', 'distintos') +
 statCard('lime', '…', 'PYMES adjudicatarias', 'detectadas');

 // Prioridad: usar allData si ya está cargado desde BBDD (misma fuente, mismo resultado)
 if (typeof allData !== 'undefined' && allData.length > 0) {
 _calcBBDDStatsDesdeAllData(grid, allData);
 return;
 }

 // Fallback: pedir stats al servidor (menos preciso por límite de filas de Supabase)
 try {
 const resp = await fetch('/api/sync/stats', { credentials: 'include' });
 if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
 const json = await resp.json();
 if (!json.success) throw new Error(json.error || 'Error stats');

 const { total, importeTotal, adjudicados, pendientes = 0, organos, adjudicatarios, pymes = 0 } = json.stats;
 grid.innerHTML =
 statCard('lime', total.toLocaleString('es-ES'), 'Total licitaciones', 'registros en BBDD') +
 statCard('cyan', formatEUR(importeTotal), 'Importe total adj.', 'con IVA') +
 statCard('green', adjudicados.toLocaleString('es-ES'), 'Con adjudicatario', `de ${total.toLocaleString('es-ES')}`) +
 statCard('amber', pendientes.toLocaleString('es-ES'), 'Pendientes', 'de adjudicación') +
 statCard('orange', organos.toLocaleString('es-ES'), 'Órganos contratantes', 'distintos') +
 statCard('red', adjudicatarios.toLocaleString('es-ES'), 'Adjudicatarios', 'distintos') +
 statCard('lime', pymes.toLocaleString('es-ES'), 'PYMES adjudicatarias', 'detectadas');

 } catch (err) {
 console.warn('[bbdd] Error obteniendo stats del servidor:', err);
 // Fallback local: datos de la página actual (limitado a BBDD_PAGE_SIZE filas)
 const data = bbddData;
 const total = bbddTotalCount || data.length;
 const importe = data.reduce((s, r) => s + (r._importeConIVA || 0), 0);
 const adjudicados = data.filter(r => r.adjudicatario).length;
 const pendientesL = data.filter(r => /pendiente/i.test(r.estado || '')).length;
 const organos = new Set(data.map(r => r.organo).filter(Boolean)).size;
 const adjuds = new Set(data.map(r => r.adjudicatario).filter(Boolean)).size;
 const pymesL = new Set(data.filter(r => /s[ií]|yes|true|pyme/i.test(r.esPyme || '')).map(r => r.adjudicatario).filter(Boolean)).size;
 grid.innerHTML =
 statCard('lime', total.toLocaleString('es-ES'), 'Total licitaciones', 'registros en BBDD') +
 statCard('cyan', formatEUR(importe), 'Importe total adj.', 'con IVA') +
 statCard('green', adjudicados.toLocaleString('es-ES'), 'Con adjudicatario', `de ${total.toLocaleString('es-ES')}`) +
 statCard('amber', pendientesL.toLocaleString('es-ES'), 'Pendientes', 'de adjudicación') +
 statCard('orange', organos.toLocaleString('es-ES'), 'Órganos contratantes', 'distintos') +
 statCard('red', adjuds.toLocaleString('es-ES'), 'Adjudicatarios', 'distintos') +
 statCard('lime', pymesL.toLocaleString('es-ES'), 'PYMES adjudicatarias', 'detectadas');
 }
}

// Calcula los 7 KPIs con la misma lógica que buildStats() en data.js
function _calcBBDDStatsDesdeAllData(grid, data) {
 const total = data.length;
 let importeTotal = 0, conAdjudicatario = 0, pendientes = 0;
 const organosSet = new Set(), adjudicatariosSet = new Set(), pymesSet = new Set();

 for (const r of data) {
 if (/pendiente/i.test(r.estado || '')) pendientes++;

 const adj = r.adjudicatario || '';
 if (adj && adj !== 'null') {
 const adjNorm = (typeof normEmpresa === 'function') ? normEmpresa(String(adj)) : adj.toLowerCase().trim();
 if (adjNorm && adjNorm.length > 3) {
 adjudicatariosSet.add(adjNorm);
 conAdjudicatario++;
 if (/s[ií]|yes|true|pyme/i.test(r.esPyme || '')) pymesSet.add(adjNorm);
 }
 }

 const organo = r.organo || '';
 if (organo && organo !== 'null') {
 const orgNorm = (typeof normEmpresa === 'function') ? normEmpresa(String(organo)) : organo.toLowerCase().trim();
 if (orgNorm && orgNorm.length > 3) organosSet.add(orgNorm);
 }

 const importe = r.importeConIVA || 0;
 if (importe > 0 && importe < 1e10) importeTotal += importe;
 }

 grid.innerHTML =
 statCard('lime', total.toLocaleString('es-ES'), 'Total licitaciones', 'registros en BBDD') +
 statCard('cyan', (typeof formatEUR==='function') ? formatEUR(importeTotal) : importeTotal.toFixed(2)+' €', 'Importe total adj.', 'con IVA') +
 statCard('green', conAdjudicatario.toLocaleString('es-ES'), 'Con adjudicatario', `de ${total.toLocaleString('es-ES')}`) +
 statCard('amber', pendientes.toLocaleString('es-ES'), 'Pendientes', 'de adjudicación') +
 statCard('orange', organosSet.size.toLocaleString('es-ES'), 'Órganos contratantes', 'distintos') +
 statCard('red', adjudicatariosSet.size.toLocaleString('es-ES'), 'Adjudicatarios', 'distintos') +
 statCard('lime', pymesSet.size.toLocaleString('es-ES'), 'PYMES adjudicatarias', 'detectadas');
}

// FILTROS BBDD (server-side)
function aplicarFiltrosBBDD() {
 bbddFiltros.search = (document.getElementById('bbddSearch')?.value || '').trim();
 bbddFiltros.estado = document.getElementById('bbddFilterEstado')?.value || '';
 bbddFiltros.tipo = document.getElementById('bbddFilterTipo')?.value || '';
 bbddPage = 1;
 _recargarPaginaActual();
}

function resetFiltrosBBDD() {
 ['bbddSearch'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
 ['bbddFilterEstado','bbddFilterTipo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
 bbddFiltros = { search: '', estado: '', tipo: '' };
 bbddPage = 1;
 _recargarPaginaActual();
}

async function _recargarPaginaActual() {
 const body = document.getElementById('bbddTableBody');
 if (body) body.innerHTML = `<tr><td colspan="${BBDD_COLS.length}" style="text-align:center;padding:20px;color:var(--text3)">Cargando…</td></tr>`;

 try {
 const result = await _fetchBBDDPage(bbddPage);
 bbddTotalCount = result.total;
 bbddData = result.rows;
 renderBBDDTable();
 } catch (err) {
 console.error('[bbdd] Error recargando página:', err);
 setBBDDStatus('error', `Error: ${err.message}`);
 }
}

// TABLA BBDD
const BBDD_COLS = [
 { key: 'id', label: 'ID' },
 { key: 'expediente', label: 'Expediente' },
 { key: 'fechaActualizacion', label: 'F. Actualización', type: 'date' },
 { key: 'objeto', label: 'Objeto' },
 { key: 'organo', label: 'Órgano' },
 { key: 'tipoProcedimiento', label: 'Procedimiento' },
 { key: 'estado', label: 'Estado' },
 { key: '_importeConIVA', label: 'Importe C/IVA', type: 'amount' },
 { key: 'adjudicatario', label: 'Adjudicatario' },
 { key: 'resultadoLote', label: 'Resultado' },
];

function renderBBDDTable() {
 const total = bbddTotalCount;
 const totalPags = Math.ceil(total / BBDD_PAGE_SIZE);
 const start = (bbddPage - 1) * BBDD_PAGE_SIZE;
 const page = bbddData; // datos ya de la página correcta

 // Cabecera
 document.getElementById('bbddTableHead').innerHTML = `<tr>
 ${BBDD_COLS.map(c => {
 const cls = bbddSortCol === c.key ? (bbddSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : '';
 return `<th class="${cls}" onclick="sortBBDD('${c.key}')">${c.label}</th>`;
 }).join('')}
 </tr>`;

 // Cuerpo
 if (!page.length) {
 document.getElementById('bbddTableBody').innerHTML =
 `<tr class="no-data"><td colspan="${BBDD_COLS.length}">No hay registros que coincidan.</td></tr>`;
 } else {
 document.getElementById('bbddTableBody').innerHTML = page.map(row => {
 const cells = BBDD_COLS.map(c => {
 const val = row[c.key] ?? '';
 let display, title;

 if (c.key === 'estado') {
 display = badgeEstadoBBDD(val);
 title = escHtml(val);

 } else if (c.type === 'amount') {
 const n = val || row._valorEstimado || 0;
 display = n
 ? `<span class="amount">${formatEUR(n)}</span>`
 : '<span style="color:var(--text3)">—</span>';
 title = n ? String(n) : '';

 } else if (c.type === 'date') {
 if (val) {
 try {
 const d = new Date(val);
 display = d.toLocaleDateString('es-ES', { year:'numeric', month:'2-digit', day:'2-digit' });
 title = d.toLocaleString('es-ES');
 } catch(e) {
 display = escHtml(String(val));
 title = display;
 }
 } else {
 display = '<span style="color:var(--text3)">—</span>';
 title = '';
 }

 } else {
 display = escHtml(String(val));
 title = display;
 }

 return `<td title="${title}">${display}</td>`;
 }).join('');
 return `<tr>${cells}</tr>`;
 }).join('');
 }

 // Contador
 const end = Math.min(start + BBDD_PAGE_SIZE, total);
 document.getElementById('bbddTableCount').innerHTML =
 `Mostrando <strong>${total > 0 ? start + 1 : 0}–${end}</strong> de <strong>${total.toLocaleString('es-ES')}</strong> registros`;

 // Paginación
 renderBBDDPagination(total, totalPags);
}

function badgeEstadoBBDD(val) {
 if (!val) return '';
 const v = val.toLowerCase();
 if (/adjudicad|formalizado/.test(v)) return `<span class="badge badge-green">${escHtml(val)}</span>`;
 if (/pendiente/.test(v)) return `<span class="badge badge-amber">${escHtml(val)}</span>`;
 if (/resuelta/.test(v)) return `<span class="badge badge-cyan">${escHtml(val)}</span>`;
 if (/desistid|anulad/.test(v)) return `<span class="badge badge-red">${escHtml(val)}</span>`;
 return `<span class="badge badge-gray">${escHtml(val)}</span>`;
}

function sortBBDD(key) {
 bbddSortDir = bbddSortCol === key ? (bbddSortDir === 'asc' ? 'desc' : 'asc') : 'asc';
 bbddSortCol = key;
 bbddPage = 1;
 _recargarPaginaActual();
}

function renderBBDDPagination(total, totalPags) {
 const pg = document.getElementById('bbddPagination');
 if (!pg) return;
 if (totalPags <= 1) { pg.innerHTML = ''; return; }

 let pages = totalPags <= 7
 ? Array.from({ length: totalPags }, (_, i) => i + 1)
 : (() => {
 const p = [1];
 if (bbddPage > 3) p.push('…');
 for (let i = Math.max(2, bbddPage - 1); i <= Math.min(totalPags - 1, bbddPage + 1); i++) p.push(i);
 if (bbddPage < totalPags - 2) p.push('…');
 p.push(totalPags);
 return p;
 })();

 pg.innerHTML = `
 <span class="page-info">Página ${bbddPage} de ${totalPags.toLocaleString('es-ES')}</span>
 <div class="page-btns">
 <button class="page-btn" onclick="goPageBBDD(${bbddPage - 1})" ${bbddPage === 1 ? 'disabled' : ''}>‹</button>
 ${pages.map(p => p === '…'
 ? `<span class="page-btn" style="cursor:default;opacity:.4">…</span>`
 : `<button class="page-btn ${p === bbddPage ? 'active' : ''}" onclick="goPageBBDD(${p})">${p}</button>`
 ).join('')}
 <button class="page-btn" onclick="goPageBBDD(${bbddPage + 1})" ${bbddPage === totalPags ? 'disabled' : ''}>›</button>
 </div>`;
}

async function goPageBBDD(p) {
 const totalPags = Math.ceil(bbddTotalCount / BBDD_PAGE_SIZE);
 if (p < 1 || p > totalPags) return;
 bbddPage = p;
 await _recargarPaginaActual();
 document.getElementById('bbddTableWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// SUBIDA A SUPABASE (solo admins) 

// 
// COPIA DE SEGURIDAD LOCAL
// 
// exportarCopiaSeguridad() → descarga un .json con TODA la BBDD
// restaurarDesdeCopia() → sube el .json y hace upsert masivo
//
// El JSON usa formato nativo de Supabase (snake_case) para que
// el upsert de restauración sea directo, sin transformaciones.
// Flujo recomendado: descargar copia → sincronizar → restaurar si algo falla.
// 

/**
 * Descarga un snapshot completo de la BBDD como archivo .json.
 * Recarga todos los datos de Supabase en ese momento para garantizar
 * que la copia refleja el estado real y más reciente.
 */
async function exportarCopiaSeguridad() {
 if (!isManager) {
 setBBDDStatus('error', 'Necesitas rol de Manager o Administrador para crear copias de seguridad.');
 return;
 }

 const btn = document.getElementById('bbddBtnBackup');
 if (btn) { btn.disabled = true; btn.textContent = 'Descargando...'; }
 setBBDDStatus('info', 'Descargando todos los registros para la copia de seguridad...');

 try {
 // Traemos en formato Supabase (snake_case) para restaurar directamente
 let allRows = [];
 let from = 0;
 const BATCH = 1000;

 while (true) {
 const resp = await fetch(`/api/sync/backup?from=${from}&batch=${BATCH}`, {
 credentials: 'include'
 });
 if (!resp.ok) {
 const err = await resp.json().catch(() => ({}));
 throw new Error(err.error || `Error del servidor (${resp.status})`);
 }
 const json = await resp.json();
 if (!json.success) throw new Error(json.error || 'Error exportando');

 const data = json.data || [];
 allRows = [...allRows, ...data];
 if (!json.hasMore) break;
 from += BATCH;
 }

 const ahora = new Date();
 const isoStamp = ahora.toISOString().replace(/[:.]/g, '-').slice(0, 19);

 const payload = {
 _meta: {
 version: 1,
 createdAt: ahora.toISOString(),
 totalRows: allRows.length,
 source: 'licit-lab-backup',
 },
 rows: allRows,
 };

 const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `licitra-backup-${isoStamp}.json`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);

 setBBDDStatus('success',
 ` Copia descargada: ${allRows.length} registros → ${a.download}`
 );

 } catch (err) {
 console.error('Error exportando copia:', err);
 setBBDDStatus('error', `Error al generar la copia: ${err.message}`);
 } finally {
 if (btn) { btn.disabled = false; btn.textContent = ' Descargar copia de seguridad'; }
 }
}

/**
 * Abre selector de archivo .json, valida formato, muestra preview
 * y confirma antes de restaurar mediante upsert masivo.
 *
 * Restauración NO destructiva: hace upsert de las filas del backup
 * pero NO borra filas que estén en Supabase y no estén en la copia.
 */
function restaurarDesdeCopia() {
 if (!isManager) {
 setBBDDStatus('error', 'Necesitas rol de Manager o Administrador para restaurar copias de seguridad.');
 return;
 }

 const input = document.createElement('input');
 input.type = 'file';
 input.accept = '.json,application/json';
 input.style.display = 'none';
 document.body.appendChild(input);

 input.addEventListener('change', async () => {
 const file = input.files[0];
 document.body.removeChild(input);
 if (!file) return;

 const reader = new FileReader();
 reader.onload = async (e) => {
 let payload;
 try {
 payload = JSON.parse(e.target.result);
 } catch {
 setBBDDStatus('error', 'El archivo seleccionado no es un JSON válido.');
 return;
 }

 if (!payload._meta || payload._meta.source !== 'licit-lab-backup' || !Array.isArray(payload.rows)) {
 setBBDDStatus('error', 'El archivo no parece una copia de seguridad de LICITRA (formato incorrecto).');
 return;
 }

 const { _meta, rows } = payload;
 const fechaCopia = new Date(_meta.createdAt).toLocaleString('es-ES');

 const confirmMsg = [
 ' RESTAURAR COPIA DE SEGURIDAD',
 '',
 ` Archivo: ${file.name}`,
 ` Fecha copia: ${fechaCopia}`,
 ` Registros: ${rows.length}`,
 '',
 'Se harán upsert de todos los registros de la copia.',
 'Los registros en Supabase que NO estén en la copia',
 'permanecerán intactos (restauración no destructiva).',
 '',
 ' Esta operación puede tardar varios minutos',
 ' si hay muchos registros.',
 '',
 '¿Continuar?',
 ].join('\n');

 if (!confirm(confirmMsg)) return;

 await _aplicarRestauracion(rows, file.name, _meta);
 };

 reader.readAsText(file, 'UTF-8');
 });

 input.click();
}

/**
 * Realiza el upsert masivo de las filas del backup en lotes de 500.
 * Las filas vienen en formato Supabase (snake_case), sin transformaciones.
 * @private
 */
async function _aplicarRestauracion(rows, fileName, meta) {
 const btn = document.getElementById('bbddBtnRestaurar');
 if (btn) { btn.disabled = true; btn.textContent = 'Restaurando...'; }
 setBBDDStatus('info', `Restaurando ${rows.length} registros desde copia...`);
 updateBBDDProgress(0, rows.length || 1);

 try {
 const LOTE = 500;
 let procesados = 0;

 for (let i = 0; i < rows.length; i += LOTE) {
 const lote = rows.slice(i, i + LOTE);

 const resp = await fetch('/api/sync/restore', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 credentials: 'include',
 body: JSON.stringify({ rows: lote }),
 });
 const result = await resp.json();
 if (!resp.ok || !result.success) throw new Error(result.error || 'Error del servidor');

 procesados += lote.length;
 updateBBDDProgress(procesados, rows.length);
 setBBDDStatus('info', `Restaurando... ${procesados} / ${rows.length}`);
 }

 const fechaCopia = new Date(meta.createdAt).toLocaleString('es-ES');
 setBBDDStatus('success',
 ` Restauración completada — ${rows.length} registros desde la copia del ${fechaCopia}`
 );

 try { await idbInvalidate(); } catch(_) {}
 await cargarDesdeBBDD(true);
 await cargarLogSubidas();

 } catch (err) {
 console.error('Error restaurando copia:', err);
 setBBDDStatus('error', `Error en la restauración: ${err.message}`);
 } finally {
 if (btn) { btn.disabled = false; btn.textContent = ' Restaurar desde copia'; }
 updateBBDDProgress(0, 1);
 }
}

async function subirASupabase() {
 if (!isAdmin) {
 setBBDDStatus('error', 'No tienes permisos de administrador para subir datos.');
 return;
 }

 // Usar los datos del archivo cargado en memoria (allData de data.js)
 // Si no hay datos en memoria, avisar
 if (!allData || allData.length === 0) {
 setBBDDStatus('error', 'Primero carga un archivo CSV/XLSX en la pestaña Datos.');
 return;
 }

 const btn = document.getElementById('bbddBtnSubir');
 if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando...'; }
 setBBDDStatus('info', `Preparando ${allData.length} registros...`);

 const fileName = document.querySelector('.upload-mini-text strong')?.textContent || 'archivo';

 try {
 updateBBDDProgress(0, allData.length || 1);

 await syncWithBatch({
 allDataArr: allData,
 fileName,
 onStatus: (msg, type) => setBBDDStatus(type || 'info', msg),
 onProgress: (done, total) => updateBBDDProgress(done, total),
 });

 // Invalidar caché y recargar desde Supabase
 try { await idbInvalidate(); } catch(_) {}
 await cargarDesdeBBDD(true);
 await cargarLogSubidas();

 } catch (err) {
 console.error('Error subiendo a Supabase:', err);
 setBBDDStatus('error', `Error: ${err.message || err}`);
 } finally {
 if (btn) { btn.disabled = false; btn.textContent = ' Sincronizar con BBDD'; }
 updateBBDDProgress(0, 1);
 }
}

function updateBBDDProgress(done, total) {
 const bar = document.getElementById('bbddProgressBar');
 const txt = document.getElementById('bbddProgressText');
 const wrap = document.getElementById('bbddProgressWrap');
 if (!bar || !wrap) return;

 const pct = total > 0 ? Math.round(done / total * 100) : 0;
 bar.style.width = pct + '%';
 if (txt) txt.textContent = `${done} / ${total} (${pct}%)`;
 wrap.style.display = done > 0 && done < total ? 'block' : 'none';
}

// LOG DE SUBIDAS
const LOG_PAGE_SIZE = 5;
let _logData = [];
let _logPage = 1;

function _renderLogPage(page) {
 const logWrap = document.getElementById('bbddLogWrap');
 if (!logWrap || !_logData.length) return;

 const data = _logData;
 const totalPages = Math.ceil(data.length / LOG_PAGE_SIZE);
 _logPage = Math.max(1, Math.min(page, totalPages));
 const start = (_logPage - 1) * LOG_PAGE_SIZE;
 const pageRows = data.slice(start, start + LOG_PAGE_SIZE);
 const allIds = data.map(r => r.id);

 const badgeStatus = (s) => {
 const st = String(s || '').toLowerCase();
 if (st === 'applied') return `<span class="badge badge-green">applied</span>`;
 if (st === 'rolled_back') return `<span class="badge badge-amber">rolled_back</span>`;
 if (st === 'failed') return `<span class="badge badge-red">failed</span>`;
 if (st === 'applying') return `<span class="badge badge-cyan">applied</span>`;
 return `<span class="badge badge-gray">${escHtml(st || '\u2014')}</span>`;
 };

 const svgTrash = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
 const svgRestore = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

 const paginationHtml = totalPages > 1 ? `
 <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px;font-size:12px;color:var(--text2)">
 <button onclick="bbddLogGoPage(${_logPage - 1})"
 ${_logPage <= 1 ? 'disabled' : ''}
 style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:none;border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--text2);transition:background .15s;${_logPage <= 1 ? 'opacity:.35;cursor:default' : ''}"
 onmouseover="if(!this.disabled)this.style.background='var(--surface2)'" onmouseout="this.style.background='none'">&#8249;</button>
 <span style="font-family:'JetBrains Mono',monospace;font-size:11px">${_logPage} / ${totalPages}</span>
 <button onclick="bbddLogGoPage(${_logPage + 1})"
 ${_logPage >= totalPages ? 'disabled' : ''}
 style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:none;border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--text2);transition:background .15s;${_logPage >= totalPages ? 'opacity:.35;cursor:default' : ''}"
 onmouseover="if(!this.disabled)this.style.background='var(--surface2)'" onmouseout="this.style.background='none'">&#8250;</button>
 </div>` : '';

 logWrap.innerHTML = `
 ${isAdmin ? `<div style="display:flex;justify-content:flex-end;margin-bottom:8px">
 <button class="btn btn-ghost btn-sm"
 style="display:inline-flex;align-items:center;gap:5px;font-size:.72rem;color:var(--red);border-color:color-mix(in srgb,var(--red) 40%,transparent);opacity:.8;transition:opacity .15s"
 onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.8'"
 onclick="limpiarHistorialCompleto(${JSON.stringify(allIds).replace(/"/g, '&quot;')})">
 <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
 Limpiar historial
 </button>
 </div>` : ''}
 <table style="width:100%;border-collapse:collapse;font-size:12px">
 <thead>
 <tr style="border-bottom:1px solid var(--border)">
 <th style="text-align:left;padding:6px 10px;color:var(--text2);font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px">Fecha</th>
 <th style="text-align:left;padding:6px 10px;color:var(--text2);font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px">Archivo</th>
 <th style="text-align:right;padding:6px 10px;color:var(--text2);font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px">Total</th>
 <th style="text-align:right;padding:6px 10px;color:var(--text2);font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px">Nuevas</th>
 <th style="text-align:right;padding:6px 10px;color:var(--text2);font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px">Actualizadas</th>
 <th style="text-align:left;padding:6px 10px;color:var(--text2);font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px">Estado</th>
 <th style="text-align:right;padding:6px 10px;color:var(--text2);font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px">Acción</th>
 <th style="padding:6px 8px;width:32px"></th>
 </tr>
 </thead>
 <tbody>
 ${pageRows.map(row => {
 const changes = row.sync_changes || [];
 const inserted = changes.filter(c => c.action === 'insert').length;
 const updated = changes.filter(c => c.action === 'update').length;
 const st = String(row.status || '').toLowerCase();
 const completed = changes.length > 0 || st === 'applied';
 const canRollback = st !== 'rolled_back' && st !== 'failed';
 return `
 <tr data-batch-id="${row.id}" style="border-bottom:1px solid var(--border)">
 <td style="padding:7px 10px;color:var(--text2)">${new Date(row.created_at).toLocaleString('es-ES')}</td>
 <td style="padding:7px 10px;color:var(--text);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(row.file_name || '\u2014')}</td>
 <td style="padding:7px 10px;color:var(--text);text-align:right;font-family:'JetBrains Mono',monospace">${row.rows_total ?? changes.length ?? '\u2014'}</td>
 <td style="padding:7px 10px;color:var(--green);text-align:right;font-family:'JetBrains Mono',monospace">+${inserted}</td>
 <td style="padding:7px 10px;color:var(--amber);text-align:right;font-family:'JetBrains Mono',monospace">\u21ba ${updated}</td>
 <td style="padding:7px 10px">${badgeStatus(completed ? 'applied' : row.status)}</td>
 <td style="padding:7px 10px;text-align:right">
 ${isAdmin && canRollback
 ? `<button class="btn btn-ghost btn-sm"
 style="display:inline-flex;align-items:center;gap:4px;font-size:.72rem"
 onclick="rollbackDesdeHistorial('${row.id}')">
 ${svgRestore} Restaurar
 </button>`
 : `<span style="color:var(--text3);font-size:11px">\u2014</span>`}
 </td>
 <td style="padding:7px 8px;text-align:center">
 ${isAdmin ? `<button title="Eliminar este registro del historial"
 style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:none;border:1px solid transparent;border-radius:5px;cursor:pointer;color:var(--text3);transition:color .15s,border-color .15s,background .15s"
 onmouseover="this.style.color='var(--red)';this.style.borderColor='color-mix(in srgb,var(--red) 35%,transparent)';this.style.background='color-mix(in srgb,var(--red) 8%,transparent)'"
 onmouseout="this.style.color='var(--text3)';this.style.borderColor='transparent';this.style.background='none'"
 onclick="eliminarEntradaHistorial('${row.id}')">
 ${svgTrash}
 </button>` : ''}
 </td>
 </tr>`;
 }).join('')}
 </tbody>
 </table>
 ${paginationHtml}`;
}

async function cargarLogSubidas() {
 if (!isManager) return;
 const logWrap = document.getElementById('bbddLogWrap');
 if (!logWrap) return;

 const resp = await fetch('/api/sync/log', { credentials: 'include' });
 const json = resp.ok ? await resp.json() : null;
 const data = json?.data;

 if (!data?.length) {
 logWrap.innerHTML = '<p style="color:var(--text3);font-size:12px">Sin sincronizaciones registradas aún.</p>';
 return;
 }

 _logData = data;
 _logPage = 1;
 _renderLogPage(1);
}

window.bbddLogGoPage = function(n) { _renderLogPage(n); };

async function rollbackDesdeHistorial(batchId) {
 if (!isAdmin) return;
 const ok = confirm('Vas a RESTAURAR la base de datos al estado anterior a esta sincronización.\n\nEsta operación puede tardar unos segundos si hay muchos registros.\n\n¿Continuar?');
 if (!ok) return;

 try {
 setBBDDStatus('info', ' Iniciando restauración...');

 const resp = await fetch('/api/sync/rollback', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 credentials: 'include',
 body: JSON.stringify({ batchId }),
 });
 const result = await resp.json();
 if (!resp.ok || !result.success) throw new Error(result.error || 'Error del servidor');

 setBBDDStatus('success', ` Restauración completada: ${result.totalInserts} eliminadas · ${result.totalUpdates} revertidas`);
 try { await idbInvalidate(); } catch(_) {}
 await cargarDesdeBBDD(true);
 await cargarLogSubidas();

 } catch (e) {
 console.error(e);
 setBBDDStatus('error', `Error al restaurar: ${e.message || e}`);
 }
}

// ELIMINAR ENTRADAS DEL HISTORIAL 
async function eliminarEntradaHistorial(batchId) {
 if (!isAdmin) return;
 const ok = confirm('¿Eliminar este registro del historial?\nLos datos de la BBDD no se modifican.');
 if (!ok) return;

 // Optimistic UI: quitar la fila inmediatamente
 const logWrap = document.getElementById('bbddLogWrap');
 const trTarget = document.querySelector(`[data-batch-id="${batchId}"]`);
 if (trTarget) {
 trTarget.style.transition = 'opacity .2s';
 trTarget.style.opacity = '0';
 setTimeout(() => trTarget.remove(), 200);
 }

 try {
 const resp = await fetch('/api/sync/log', {
 method: 'DELETE',
 headers: { 'Content-Type': 'application/json' },
 credentials: 'include',
 body: JSON.stringify({ ids: [batchId] }),
 });
 const result = await resp.json();
 if (!resp.ok || !result.success) throw new Error(result.error || 'Error del servidor');

 _logData = _logData.filter(r => r.id !== batchId);
 if (!_logData.length) {
 if (logWrap) logWrap.innerHTML = '<p style="color:var(--text3);font-size:12px">Sin sincronizaciones registradas aún.</p>';
 } else {
 const totalPages = Math.ceil(_logData.length / LOG_PAGE_SIZE);
 if (_logPage > totalPages) _logPage = totalPages;
 _renderLogPage(_logPage);
 }

 } catch (e) {
 console.error(e);
 setBBDDStatus('error', `Error al eliminar entrada: ${e.message || e}`);
 await cargarLogSubidas();
 }
}

async function limpiarHistorialCompleto(ids) {
 if (!isAdmin || !ids?.length) return;
 const ok = confirm(`¿Limpiar todo el historial? (${ids.length} entradas)\nLos datos de la BBDD no se modifican.`);
 if (!ok) return;

 const logWrap = document.getElementById('bbddLogWrap');

 // Optimistic UI
 if (logWrap) {
 logWrap.style.transition = 'opacity .2s';
 logWrap.style.opacity = '0';
 setTimeout(() => {
 logWrap.style.opacity = '1';
 logWrap.innerHTML = '<p style="color:var(--text3);font-size:12px">Sin sincronizaciones registradas aún.</p>';
 }, 200);
 }

 try {
 setBBDDStatus('info', 'Limpiando historial...');
 const resp = await fetch('/api/sync/log', {
 method: 'DELETE',
 headers: { 'Content-Type': 'application/json' },
 credentials: 'include',
 body: JSON.stringify({ ids }),
 });
 const result = await resp.json();
 if (!resp.ok || !result.success) throw new Error(result.error || 'Error del servidor');

 setBBDDStatus('success', ' Historial limpiado');

 } catch (e) {
 console.error(e);
 setBBDDStatus('error', `Error al limpiar historial: ${e.message || e}`);
 await cargarLogSubidas();
 }
}

// STATUS MSG 
function setBBDDStatus(type, msg) {
 const el = document.getElementById('bbddStatus');
 if (!el) return;
 const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--accent)' };
 el.style.display = 'block';
 el.style.color = colors[type] || 'var(--text2)';
 el.textContent = msg;
 if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 6000);
}