/*
 LICITRA — tab-relaciones.js
 Dependencias: utils.js (escHtml, formatEUR)

 CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR:
 
 [FIX-1] Renombrado a `relCurrentPage` para evitar colisión con `currentPage`
 declarado en state.js. Antes causaba SyntaxError al cargar el módulo.

 [FIX-2] Ruta del Worker corregida: '/js/worker-relaciones.js'
 Antes apuntaba a './Frontend/JS/worker-relaciones.js' que no existe
 en el servidor (sirve desde /js/). Era el bug principal: el worker
 nunca se cargaba y todo fallaba silenciosamente.

 [FIX-3] Introducido `_baseResults` para separar la fuente de datos del estado
 de render. `applyFiltersToResults()` ya NUNCA llama al worker —
 solo filtra y ordena sobre `_baseResults`. Antes creaba un bucle
 asíncrono donde los filtros se aplicaban pero el resultado del worker
 llegaba más tarde y los sobreescribía sin filtrar.

 [FIX-4] `RESULT` handler ahora llama a `applyFiltersToResults()` en lugar de
 `renderResults()` directamente, para que los filtros y el ordenado
 siempre se apliquen sobre los datos recién llegados.

 [FIX-5] `worker.onerror` implementado — antes los errores del worker eran
 completamente silenciosos. Ahora loguea y muestra fallback en UI.

 [FIX-6] `scrollHandlerAttached` se resetea en `buildRelaciones()` para que
 al re-abrir la pestaña el scroll se re-adjunte correctamente.

 [FIX-7] `performSearch()` ya no re-inicializa el worker completo si este no
 existe. Solo guarda el término pendiente; initWorker() lo ejecutará
 automáticamente cuando INDEX_READY llegue.
*/

// Estado del módulo 
let relWorker = null;
let relCache = new Map();
let currentResults = [];
let _baseResults = []; // fuente limpia sin filtros UI aplicados
let currentTerm = '';
let relPageNum = 1; // página actual (base 1)
let relPageSize = 10; // filas por página (configurable por el usuario)
let _pendingTerm = null; // búsqueda pendiente mientras el índice se construye

// Caché de resultados IA por card (clave: "organo|||adjudicatario")
const _relIACardCache = new Map();

// INICIALIZACIÓN 
function buildRelaciones() {
 if (!allData || allData.length === 0) {
 document.getElementById('relEmpty').style.display = 'block';
 document.getElementById('relContent').style.display = 'none';
 return;
 }

 document.getElementById('relEmpty').style.display = 'none';
 document.getElementById('relContent').style.display = 'block';

 // Limpiar estado anterior completo
 if (relWorker) {
 relWorker.terminate();
 relWorker = null;
 }
 relCache.clear();
 _relIACardCache.clear();
 currentResults = [];
 _baseResults = [];
 currentTerm = '';
 relPageNum = 1;
 _pendingTerm = null;

 initRelWorker();
 attachRelEvents();
}

// WORKER 
function initRelWorker() {
 if (relWorker) {
 relWorker.terminate();
 }

 // [FIX-2] Ruta correcta relativa al HTML (servidor sirve /js/)
 relWorker = new Worker('/js/worker-relaciones.js');

 relWorker.onmessage = (e) => {
 const { type, payload } = e.data;

 if (type === 'INDEX_READY') {
 console.log('[Relaciones] Índice construido con', allData.length, 'registros');

 if (_pendingTerm !== null) {
 // [FIX-7] Había un término pendiente mientras se construía el índice
 const term = _pendingTerm;
 _pendingTerm = null;
 _doSearch(term);
 } else {
 // Carga inicial: pedir todos los resultados (término vacío)
 _doSearch('');
 }
 }

 if (type === 'RESULT') {
 // [FIX-3] Guardar resultado bruto en _baseResults
 _baseResults = payload;
 relCache.set(currentTerm, _baseResults);

 // [FIX-4] Siempre pasar por applyFiltersToResults para que los filtros
 // UI (concentración, ordenación) se apliquen correctamente
 applyFiltersToResults();
 }

 if (type === 'ERROR') {
 console.error('[Relaciones Worker]', payload);
 }
 };

 // [FIX-5] Manejar errores del worker que antes eran completamente silenciosos
 relWorker.onerror = (err) => {
 console.error('[Relaciones] Worker falló:', err.message, err.filename, err.lineno);
 const container = document.getElementById('relList');
 if (container) {
 container.innerHTML = `
 <div class="empty-state">
 <div class="empty-icon"></div>
 <div class="empty-title">Error al inicializar el motor de análisis</div>
 <div class="empty-sub">${err.message || 'No se pudo cargar el worker'}</div>
 </div>`;
 }
 };

 relWorker.postMessage({
 type: 'BUILD_INDEX',
 payload: allData.slice() // copia para evitar que el worker mute el array original
 });
}

// BÚSQUEDA 
/**
 * Punto de entrada para todas las búsquedas.
 * Si el índice aún no está listo, guarda el término y lo ejecutará cuando llegue INDEX_READY.
 */
function performSearch(term) {
 if (!relWorker) {
 // [FIX-7] No re-inicializar el worker completo; simplemente marcar como pendiente
 console.warn('[Relaciones] Worker aún no inicializado al buscar "' + term + '"');
 _pendingTerm = term;
 return;
 }
 _doSearch(term);
}

/** Envía SEARCH al worker (siempre que el worker exista) */
function _doSearch(term) {
 currentTerm = term;
 if (relCache.has(term)) {
 // Cache hit: no hace falta ir al worker
 _baseResults = relCache.get(term);
 applyFiltersToResults();
 return;
 }
 relWorker.postMessage({ type: 'SEARCH', payload: { term } });
}

// FILTROS Y ORDENACIÓN 
/**
 * [FIX-3] Esta función NUNCA llama al worker.
 * Siempre parte de _baseResults (resultado bruto cacheado del worker)
 * y aplica encima los filtros de UI (concentración mínima, ordenación).
 */
function applyFiltersToResults() {
 const minConc = parseInt(document.getElementById('relMinConc')?.value || '2', 10);
 const sortKey = document.getElementById('relSortBy')?.value || 'score';

 // Fuente: resultado bruto de la última búsqueda del worker
 let filtered = _baseResults.filter(r => r.risk.n >= minConc);

 // Ordenar
 if (sortKey === 'amount') {
 filtered.sort((a, b) => b.risk.totalAmount - a.risk.totalAmount);
 } else if (sortKey === 'count') {
 filtered.sort((a, b) => b.risk.n - a.risk.n);
 } else {
 filtered.sort((a, b) => b.risk.score - a.risk.score);
 }

 currentResults = filtered;
 renderResults();
}

// EVENTOS 
function attachRelEvents() {
 const input = document.getElementById('relSearch');
 const minConc = document.getElementById('relMinConc');
 const sortBy = document.getElementById('relSortBy');
 const pageSize = document.getElementById('relPageSize');

 if (!input) return;

 // Clonar nodos para eliminar listeners previos de sesiones anteriores
 const newInput = input.cloneNode(true);
 input.parentNode.replaceChild(newInput, input);

 newInput.addEventListener('input', debounceRel((e) => {
 const term = e.target.value.trim();
 if (term.length === 0) {
 currentTerm = '';
 _baseResults = relCache.get('') || [];
 applyFiltersToResults();
 return;
 }
 if (term.length < 2) return;
 performSearch(term);
 }, 300));

 if (minConc) {
 const el = minConc.cloneNode(true);
 minConc.parentNode.replaceChild(el, minConc);
 el.addEventListener('change', () => applyFiltersToResults());
 }

 if (sortBy) {
 const el = sortBy.cloneNode(true);
 sortBy.parentNode.replaceChild(el, sortBy);
 el.addEventListener('change', () => applyFiltersToResults());
 }

 if (pageSize) {
 const el = pageSize.cloneNode(true);
 pageSize.parentNode.replaceChild(el, pageSize);
 el.addEventListener('change', () => {
 relPageSize = parseInt(el.value, 10) || 10;
 relPageNum = 1; // volver a página 1 al cambiar el tamaño
 renderResults();
 });
 // Sincronizar estado con el valor inicial del selector
 relPageSize = parseInt(el.value, 10) || 10;
 }
}

// RENDER CON PAGINACIÓN 
function renderResults() {
 const container = document.getElementById('relList');
 const summary = document.getElementById('relSummary');
 if (!container) return;

 // KPIs
 if (summary) {
 const highRisk = currentResults.filter(r => r.risk.score >= 80);
 const totalAmount = currentResults.reduce((s, r) => s + (r.risk.totalAmount || 0), 0);
 const eur = (typeof formatEUR === 'function') ? formatEUR : (v) => v.toFixed(2) + ' €';
 summary.innerHTML = `
 <div class="stat-card cyan">
 <div class="stat-label">Resultados encontrados</div>
 <div class="stat-value cyan">${currentResults.length.toLocaleString('es-ES')}</div>
 <div class="stat-sub">pares Órgano→Empresa</div>
 </div>
 <div class="stat-card red">
 <div class="stat-label">Alta concentración</div>
 <div class="stat-value red">${highRisk.length.toLocaleString('es-ES')}</div>
 <div class="stat-sub">score ≥ 80</div>
 </div>
 <div class="stat-card lime">
 <div class="stat-label">Importe total</div>
 <div class="stat-value lime">${eur(totalAmount)}</div>
 <div class="stat-sub">adjudicado</div>
 </div>`;
 }

 // Alerta de alto riesgo
 const alertEl = document.getElementById('relAlertHighRisk');
 if (alertEl) alertEl.style.display = currentResults.some(r => r.risk.score >= 80) ? 'block' : 'none';

 relPageNum = 1; // resetear a página 1 cuando llegan nuevos resultados
 _renderPage();
}

/** Renderiza la página actual dentro del contenedor */
function _renderPage() {
 const container = document.getElementById('relList');
 if (!container) return;

 if (currentResults.length === 0) {
 const msg = _baseResults.length === 0 && !currentTerm
 ? 'Analizando relaciones…'
 : 'Sin resultados. Prueba con otro nombre de empresa u órgano contratante.';
 container.innerHTML = `
 <div class="empty-state">
 <div class="empty-icon"></div>
 <div class="empty-title">Sin resultados</div>
 <div class="empty-sub">${msg}</div>
 </div>`;
 document.getElementById('relPagination')?.replaceChildren(); // limpiar paginación
 return;
 }

 const totalPages = Math.ceil(currentResults.length / relPageSize);
 const start = (relPageNum - 1) * relPageSize;
 const slice = currentResults.slice(start, start + relPageSize);

 container.innerHTML = slice.map(renderEnterpriseCard).join('');

 // Restaurar resultados IA cacheados para esta página
 slice.forEach(r => {
 const key = r.organo + '|||' + r.adjudicatario;
 const cached = _relIACardCache.get(key);
 if (cached) _injectIAResult(r.organo, r.adjudicatario, cached, false);
 });

 _renderPagination(totalPages);
}

/** Controles de paginación */
function _renderPagination(totalPages) {
 let el = document.getElementById('relPagination');
 if (!el) {
 el = document.createElement('div');
 el.id = 'relPagination';
 el.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:16px 0;flex-wrap:wrap';
 document.getElementById('relList')?.insertAdjacentElement('afterend', el);
 }

 if (totalPages <= 1) { el.innerHTML = ''; return; }

 const btn = (label, page, disabled, active) => {
 const d = disabled ? 'disabled' : '';
 const a = active ? 'style="background:var(--primary,#6366f1);color:#fff;border-color:var(--primary,#6366f1)"' : '';
 return `<button class="btn btn-ghost btn-sm" ${d} ${a}
 onclick="relGoToPage(${page})" style="min-width:32px">${label}</button>`;
 };

 // Ventana de páginas visibles: máximo 5 botones de página
 let startP = Math.max(1, relPageNum - 2);
 let endP = Math.min(totalPages, startP + 4);
 if (endP - startP < 4) startP = Math.max(1, endP - 4);

 let html = btn('‹', relPageNum - 1, relPageNum === 1);
 if (startP > 1) html += btn('1', 1) + (startP > 2 ? '<span style="color:var(--text3)">…</span>' : '');

 for (let p = startP; p <= endP; p++) {
 html += btn(p, p, false, p === relPageNum);
 }

 if (endP < totalPages) html += (endP < totalPages - 1 ? '<span style="color:var(--text3)">…</span>' : '') + btn(totalPages, totalPages);
 html += btn('›', relPageNum + 1, relPageNum === totalPages);

 // Contador "Página X de Y · Z resultados"
 const start = (relPageNum - 1) * relPageSize + 1;
 const end = Math.min(relPageNum * relPageSize, currentResults.length);
 html += `<span style="font-size:.75rem;color:var(--text3);margin-left:8px">${start}–${end} de ${currentResults.length.toLocaleString('es-ES')}</span>`;

 el.innerHTML = html;
}

/** Navegar a una página concreta */
function relGoToPage(page) {
 const totalPages = Math.ceil(currentResults.length / relPageSize);
 if (page < 1 || page > totalPages) return;
 relPageNum = page;
 _renderPage();
 // Scroll al inicio de la lista
 document.getElementById('relContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// CARD ENTERPRISE 
function renderEnterpriseCard(r) {
 const risk = r.risk;

 const riskLevel =
 risk.score >= 80 ? 'high' :
 risk.score >= 50 ? 'med' : 'low';

 const riskColor =
 riskLevel === 'high' ? 'red' :
 riskLevel === 'med' ? 'amber' : 'lime';

 const concentrationPct = (risk.concentration * 100).toFixed(0);
 const eur = (typeof formatEUR === 'function') ? formatEUR : (v) => (v || 0).toFixed(2) + ' €';

 return `
 <div class="rel-card risk-${riskLevel}" data-org="${escHtml(r.organo)}" data-adj="${escHtml(r.adjudicatario)}">
 <div class="rel-card-header">
 <div class="rel-org">
 <strong>${escHtml(r.organo)}</strong>
 <small>${escHtml(r.adjudicatario)}</small>
 </div>
 <div class="rel-risk-badge">
 <span class="badge badge-${riskColor}" title="${risk.n} contratos · ${eur(risk.totalAmount)} · ${concentrationPct}% concentración">
 ${risk.score} pts · ${concentrationPct}%
 </span>
 </div>
 </div>

 <div class="rel-metrics" style="display:flex;gap:16px;margin:10px 0;font-size:.8rem;color:var(--text2)">
 <span>${risk.n} contrato${risk.n !== 1 ? 's' : ''}</span>
 <span>${eur(risk.totalAmount)}</span>
 ${risk.avg > 0 ? `<span>Promedio: ${eur(risk.avg)}</span>` : ''}
 </div>

 <div class="rel-progress" style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin:8px 0">
 <div style="width:${Math.min(100, risk.concentration * 100)}%;height:100%;background:var(--${riskColor})"></div>
 </div>

 <div class="rel-adjudicatarios" style="margin-top:10px">
 <div style="background:var(--surface2);border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
 <span>${escHtml(r.adjudicatario)}</span>
 <div style="display:flex;gap:16px;font-size:.75rem;font-family:'JetBrains Mono',monospace">
 <span><strong>${risk.n}</strong> contratos</span>
 <span><strong>${concentrationPct}%</strong> del órgano</span>
 </div>
 </div>
 </div>

 <div class="rel-card-footer" style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">
 <button class="btn btn-ghost btn-sm"
 onclick="verDetalleRelacion('${escHtml(r.organo).replace(/'/g, "\\'")}', '${escHtml(r.adjudicatario).replace(/'/g, "\\'")}')">
 Ver contratos
 </button>
 <button class="btn btn-ghost btn-sm rel-ia-card-btn"
 data-org="${escHtml(r.organo)}"
 data-adj="${escHtml(r.adjudicatario)}"
 onclick="analizarParConIA('${escHtml(r.organo).replace(/'/g, "\\'")}', '${escHtml(r.adjudicatario).replace(/'/g, "\\'")}')">
 Analizar con IA
 </button>
 </div>

 <!-- Resultado IA de esta card (se rellena al pulsar el botón) -->
 <div class="rel-ia-card-result"
 data-ia-org="${escHtml(r.organo)}"
 data-ia-adj="${escHtml(r.adjudicatario)}"
 style="display:none;margin-top:12px">
 </div>
 </div>
 `;
}

// DETALLE EN MODAL 
function verDetalleRelacion(organo, adjudicatario) {
 if (!allData || !allData.length) return;

 const contratos = allData.filter(r =>
 r.organo === organo && r.adjudicatario === adjudicatario
 );
 if (!contratos.length) return;

 const modalBody = document.getElementById('modalBody');
 const modalTitle = document.getElementById('modalTitle');
 if (!modalBody || !modalTitle) return;

 const eur = (typeof formatEUR === 'function') ? formatEUR : (v) => (v || 0).toFixed(2) + ' €';
 const totalImporte = contratos.reduce((s, r) => s + (r.importeConIVA || 0), 0);

 modalTitle.textContent = `Relación: ${organo} → ${adjudicatario}`;

 modalBody.innerHTML = `
 <div class="detail-grid">
 <div class="detail-section">Resumen</div>
 <div class="detail-item">
 <div class="detail-key">Contratos totales</div>
 <div class="detail-val"><strong>${contratos.length}</strong></div>
 </div>
 <div class="detail-item">
 <div class="detail-key">Importe total</div>
 <div class="detail-val amount">${eur(totalImporte)}</div>
 </div>
 <div class="detail-section">Lista de contratos</div>
 <div class="detail-item full">
 <table style="width:100%;border-collapse:collapse;font-size:.8rem">
 <thead>
 <tr style="border-bottom:1px solid var(--border)">
 <th style="text-align:left;padding:6px">Objeto</th>
 <th style="text-align:right;padding:6px">Importe</th>
 <th style="text-align:left;padding:6px">Estado</th>
 </tr>
 </thead>
 <tbody>
 ${contratos.slice(0, 20).map(c => `
 <tr style="border-bottom:1px solid var(--border)">
 <td style="padding:6px">${escHtml((c.objeto || '—').slice(0, 80))}${(c.objeto || '').length > 80 ? '…' : ''}</td>
 <td style="padding:6px;text-align:right;font-family:'JetBrains Mono',monospace">${eur(c.importeConIVA)}</td>
 <td style="padding:6px">${(typeof badgeEstado === 'function') ? badgeEstado(c.estado) : escHtml(c.estado || '')}</td>
 </tr>
 `).join('')}
 </tbody>
 </table>
 ${contratos.length > 20 ? `<p style="margin-top:8px;font-size:.7rem;color:var(--text3)">… y ${contratos.length - 20} más</p>` : ''}
 </div>
 </div>
 `;

 document.getElementById('modalOverlay')?.classList.add('open');
}

// UTILIDADES 
function debounceRel(fn, delay) {
 let timer;
 return function (...args) {
 clearTimeout(timer);
 timer = setTimeout(() => fn.apply(this, args), delay);
 };
}

function limpiarBusquedaRel() {
 const input = document.getElementById('relSearch');
 if (input) input.value = '';
 currentTerm = '';
 _baseResults = relCache.get('') || [];
 applyFiltersToResults();
}

// 
// ANÁLISIS IA POR CARD INDIVIDUAL
// 

/**
 * Analiza con IA el par organo→adjudicatario de una card concreta.
 * Resultado se muestra inline dentro de la propia card, con caché
 * para que no se repita la llamada al paginar y volver.
 */
async function analizarParConIA(organo, adjudicatario) {
 const cacheKey = organo + '|||' + adjudicatario;

 // Si ya hay resultado cacheado, mostrar/ocultar (toggle)
 if (_relIACardCache.has(cacheKey)) {
 const resultDiv = _getIAResultDiv(organo, adjudicatario);
 if (resultDiv) {
 const visible = resultDiv.style.display !== 'none';
 resultDiv.style.display = visible ? 'none' : 'block';
 }
 return;
 }

 // Buscar el par en currentResults para obtener las métricas de riesgo
 const pair = currentResults.find(r => r.organo === organo && r.adjudicatario === adjudicatario);
 if (!pair) return;

 // Buscar el botón de esta card para desactivarlo durante la llamada
 const btn = document.querySelector(
 `.rel-ia-card-btn[data-org="${CSS.escape(escHtml(organo))}"][data-adj="${CSS.escape(escHtml(adjudicatario))}"]`
 );
 if (btn) { btn.disabled = true; btn.textContent = ' Analizando…'; }

 // Mostrar loader inline
 const loaderHtml = `
 <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;
 background:color-mix(in srgb,var(--cyan,#22d3ee) 8%,transparent);
 border-radius:8px;border:1px solid var(--border);font-size:.8rem;color:var(--text2)">
 <div style="width:16px;height:16px;border-radius:50%;border:2px solid var(--border);
 border-top-color:var(--cyan,#22d3ee);animation:spin 0.8s linear infinite;flex-shrink:0"></div>
 Consultando al modelo…
 </div>`;
 _injectIAResult(organo, adjudicatario, loaderHtml, true);

 try {
 const contratos = (allData || []).filter(r => r.organo === organo && r.adjudicatario === adjudicatario);
 const prompt = _buildParIAPrompt(organo, adjudicatario, pair.risk, contratos);
 const respText = await _callGroqRelaciones(prompt);
 const html = _renderParIAResult(organo, adjudicatario, pair.risk, respText);

 _relIACardCache.set(cacheKey, html);
 _injectIAResult(organo, adjudicatario, html, true);
 } catch (err) {
 const errHtml = `<p style="color:var(--red);font-size:.8rem;padding:8px"> ${escHtml(err.message)}</p>`;
 _injectIAResult(organo, adjudicatario, errHtml, true);
 } finally {
 if (btn) { btn.disabled = false; btn.textContent = ' Analizar con IA'; }
 }
}

/** Localiza el div de resultado IA de una card concreta en el DOM */
function _getIAResultDiv(organo, adjudicatario) {
 return document.querySelector(
 `.rel-ia-card-result[data-ia-org="${CSS.escape(escHtml(organo))}"][data-ia-adj="${CSS.escape(escHtml(adjudicatario))}"]`
 );
}

/** Inyecta HTML en el div de resultado IA de una card */
function _injectIAResult(organo, adjudicatario, html, visible) {
 const div = _getIAResultDiv(organo, adjudicatario);
 if (!div) return;
 div.innerHTML = html;
 div.style.display = visible ? 'block' : 'none';
}

/** Prompt específico para analizar un único par organo→adjudicatario */
function _buildParIAPrompt(organo, adjudicatario, risk, contratos) {
 const eur = (v) => new Intl.NumberFormat('es-ES', {
 style: 'currency', currency: 'EUR', maximumFractionDigits: 0
 }).format(v || 0);

 const pct = (risk.concentration * 100).toFixed(1);
 const muestra = contratos.slice(0, 10).map((c, i) =>
 ` ${i + 1}. "${groqSanear(c.objeto, 100)}" — ${eur(c.importeConIVA)} — ${groqSanear(c.estado, 40)}`
 ).join('\n');

 return `Eres un analista experto en contratación pública española.
Analiza la relación entre este órgano contratante y este adjudicatario.

ÓRGANO CONTRATANTE: "${groqSanear(organo, 120)}"
ADJUDICATARIO: "${groqSanear(adjudicatario, 120)}"

MÉTRICAS:
- Contratos adjudicados: ${risk.n}
- Importe total: ${eur(risk.totalAmount)}
- Importe medio por contrato: ${eur(risk.avg)}
- Concentración: ${pct}% de los contratos del órgano van a esta empresa
- Score de riesgo: ${risk.score}/100

MUESTRA DE CONTRATOS (hasta 10):
${muestra || ' (sin contratos disponibles)'}

INSTRUCCIONES:
Redacta un análisis breve y directo con estas secciones:

## Valoración del riesgo
1-2 frases explicando qué significa el score y la concentración en este caso concreto.

## Indicadores relevantes
Lista 2-4 puntos específicos sobre lo que llama la atención (importes, frecuencia, patrones).

## Conclusión
1 frase con una valoración final clara.

Sé conciso. No repitas los datos literalmente, interprételos.`;
}

/** Envuelve el resultado en HTML con cabecera visual para la card */
function _renderParIAResult(organo, adjudicatario, risk, texto) {
 const score = risk.score;
 const color = score >= 80 ? 'var(--red,#f87171)' : score >= 50 ? 'var(--amber,#fbbf24)' : 'var(--lime,#a3e635)';

 return `
 <div style="border:1px solid ${color};border-radius:8px;overflow:hidden;font-size:.82rem">
 <div style="padding:8px 12px;background:color-mix(in srgb,${color} 12%,transparent);
 display:flex;justify-content:space-between;align-items:center;
 border-bottom:1px solid ${color}">
 <strong style="color:${color}"> Análisis IA — score ${score}/100</strong>
 <button onclick="
 var d=this.closest('.rel-ia-card-result');
 if(d){d.style.display='none'}"
 style="background:none;border:none;cursor:pointer;color:var(--text2);font-size:1rem"></button>
 </div>
 <div style="padding:12px 14px;line-height:1.6;color:var(--text1)">
 ${_renderRelIAMarkdown(texto)}
 </div>
 </div>`;
}

// 
// ANÁLISIS IA DE RELACIONES
// Toma los top-N pares de mayor riesgo ya calculados por el worker
// y pide a Groq un análisis narrativo. No rehace el cálculo de riesgo:
// solo interpreta lo que el worker ya tiene.
// 

let _relIAEnCurso = false; // evita llamadas duplicadas

/**
 * Punto de entrada: botón "Analizar con IA".
 * Usa `currentResults` (ya filtrados y ordenados por la UI) o `_baseResults`
 * si no hay búsqueda activa. Coge los 15 de mayor score.
 */
async function analizarRelacionesConIA() {
 if (_relIAEnCurso) return;

 const panel = document.getElementById('relIAPanel');
 const btn = document.getElementById('relIABtn');
 if (!panel) return;

 // Fuente: resultados actuales (filtrados+ordenados) o base completa
 const fuente = currentResults.length > 0 ? currentResults : _baseResults;

 if (fuente.length === 0) {
 panel.style.display = 'block';
 panel.innerHTML = _relIAPanelHTML(
 ' Sin datos para analizar',
 '<p>Espera a que el índice termine de construirse o aplica algún filtro primero.</p>',
 'warning'
 );
 return;
 }

 // Top 15 por score (ya deberían venir ordenados, pero lo garantizamos)
 const top = fuente
 .slice()
 .sort((a, b) => b.risk.score - a.risk.score)
 .slice(0, 15);

 // Mostrar loader
 _relIAEnCurso = true;
 if (btn) { btn.disabled = true; btn.textContent = ' Analizando…'; }
 panel.style.display = 'block';
 panel.innerHTML = _relIAPanelHTML(' Analizando patrones con IA…', _relIALoader(), 'loading');

 try {
 const prompt = _buildRelIAPrompt(top, fuente.length);
 const respText = await _callGroqRelaciones(prompt);
 panel.innerHTML = _relIAPanelHTML(
 ' Análisis de relaciones — IA',
 _renderRelIAMarkdown(respText),
 'result'
 );
 } catch (err) {
 console.error('[Relaciones IA]', err);
 panel.innerHTML = _relIAPanelHTML(
 ' Error en el análisis',
 `<p style="color:var(--red)">${escHtml(err.message || 'Error desconocido')}</p>`,
 'error'
 );
 } finally {
 _relIAEnCurso = false;
 if (btn) { btn.disabled = false; btn.textContent = ' Analizar con IA'; }
 }
}

// Construcción del prompt 
function _buildRelIAPrompt(top, totalPares) {
 const eur = (v) => {
 if (!v) return '0 €';
 return new Intl.NumberFormat('es-ES', {
 style: 'currency', currency: 'EUR',
 maximumFractionDigits: 0
 }).format(v);
 };

 const filas = top.map((r, i) => {
 const pct = (r.risk.concentration * 100).toFixed(1);
 return `${i + 1}. Órgano: "${groqSanear(r.organo, 80)}"
 Empresa: "${groqSanear(r.adjudicatario, 80)}"
 Contratos: ${r.risk.n} | Importe total: ${eur(r.risk.totalAmount)} | Importe medio: ${eur(r.risk.avg)}
 Concentración: ${pct}% de los contratos del órgano | Score de riesgo: ${r.risk.score}/100`;
 }).join('\n\n');

 return `Eres un analista experto en contratación pública española.
Tu tarea es analizar los siguientes patrones de concentración detectados en un dataset de licitaciones públicas.

CONTEXTO:
- Total de pares órgano-empresa analizados: ${totalPares}
- Se muestran los ${top.length} con mayor score de riesgo
- El score de riesgo se calcula sobre: concentración de adjudicaciones, número de contratos e importe medio

PARES DE MAYOR RIESGO:
${filas}

INSTRUCCIONES:
Redacta un informe conciso en español con estas secciones exactas:

## Resumen general
2-3 frases sobre los patrones globales detectados.

## Relaciones más preocupantes
Lista los 3-5 casos más llamativos explicando POR QUÉ son preocupantes (no repitas los datos, interprétalos).

## Patrones comunes detectados
¿Hay sectores, tipos de órgano o rangos de importe recurrentes?

## Recomendaciones
2-4 acciones concretas para el equipo de auditoría o compliance.

Sé directo, preciso y evita frases genéricas. No inventes datos que no estén en el listado.`;
}

// Llamada al backend 
async function _callGroqRelaciones(prompt) {
 const res = await fetch('/api/ia/groq', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 messages: [{ role: 'user', content: prompt }],
 max_tokens: 1200,
 temperature: 0.3 // baja temperatura: más preciso, menos creativo
 })
 });

 if (!res.ok) {
 const txt = await res.text().catch(() => '');
 throw new Error(`Error del servidor (${res.status}): ${txt.slice(0, 200)}`);
 }

 const json = await res.json();
 if (!json.success) throw new Error(json.error || 'Respuesta de error del servidor');

 const content = json.data?.choices?.[0]?.message?.content;
 if (!content) throw new Error('Respuesta vacía del modelo');
 return content;
}

// Render del panel 
/**
 * Envuelve el contenido en el panel con cabecera y botón de cierre.
 */
function _relIAPanelHTML(titulo, contenido, tipo) {
 const colores = {
 loading: 'var(--cyan,#22d3ee)',
 result: 'var(--lime,#a3e635)',
 warning: 'var(--amber,#fbbf24)',
 error: 'var(--red,#f87171)'
 };
 const color = colores[tipo] || colores.result;

 return `
 <div style="
 background:var(--surface2);
 border:1px solid ${color};
 border-radius:10px;
 overflow:hidden;
 ">
 <div style="
 display:flex;justify-content:space-between;align-items:center;
 padding:12px 16px;
 background:color-mix(in srgb,${color} 12%,transparent);
 border-bottom:1px solid ${color};
 ">
 <strong style="color:${color};font-size:.9rem">${titulo}</strong>
 <button
 onclick="document.getElementById('relIAPanel').style.display='none'"
 style="background:none;border:none;cursor:pointer;color:var(--text2);font-size:1.1rem;line-height:1"
 title="Cerrar"
 ></button>
 </div>
 <div style="padding:16px 20px;font-size:.85rem;line-height:1.6">
 ${contenido}
 </div>
 </div>`;
}

/** Spinner mientras espera respuesta */
function _relIALoader() {
 return `
 <div style="display:flex;align-items:center;gap:12px;color:var(--text2)">
 <div style="
 width:20px;height:20px;border-radius:50%;
 border:2px solid var(--border);
 border-top-color:var(--cyan,#22d3ee);
 animation:spin 0.8s linear infinite;
 flex-shrink:0
 "></div>
 <span>Enviando datos al modelo… puede tardar unos segundos.</span>
 </div>
 <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
}

/**
 * Convierte el Markdown básico que devuelve el modelo en HTML limpio.
 * Soporta: ## cabeceras, **negrita**, listas con - o *, párrafos.
 * Intencionalmente simple: no necesitamos el renderer complejo de tab-ia.js.
 */
function _renderRelIAMarkdown(texto) {
 if (!texto) return '';

 const esc = (s) => String(s)
 .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

 const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

 const lines = texto.split('\n');
 const chunks = []; // acumulamos bloques HTML
 let listOpen = false;

 const closeList = () => {
 if (listOpen) { chunks.push('</ul>'); listOpen = false; }
 };

 for (const raw of lines) {
 const line = raw.trimEnd();

 // Cabecera ## o ###
 if (/^#{2,3}\s+/.test(line)) {
 closeList();
 const txt = line.replace(/^#{2,3}\s+/, '');
 chunks.push(
 `<div style="
 margin:18px 0 6px;
 padding-bottom:4px;
 border-bottom:1px solid var(--border);
 font-weight:700;
 color:var(--lime,#a3e635);
 font-size:.9rem;
 letter-spacing:.03em
 ">${bold(txt)}</div>`
 );
 continue;
 }

 // Ítem de lista (-, *, •, o número)
 if (/^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
 if (!listOpen) {
 chunks.push('<ul style="margin:6px 0 6px 16px;padding:0;list-style:none">');
 listOpen = true;
 }
 const txt = line.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '');
 chunks.push(
 `<li style="margin:4px 0;display:flex;gap:8px">
 <span style="color:var(--lime,#a3e635);flex-shrink:0">›</span>
 <span>${bold(txt)}</span>
 </li>`
 );
 continue;
 }

 // Línea vacía
 if (!line.trim()) {
 closeList();
 continue;
 }

 // Párrafo normal
 closeList();
 chunks.push(`<p style="margin:6px 0">${bold(line)}</p>`);
 }

 closeList();
 return chunks.join('\n');
}

// Exports globales 
window.verDetalleRelacion = verDetalleRelacion;
window.limpiarBusquedaRel = limpiarBusquedaRel;
window.analizarRelacionesConIA = analizarRelacionesConIA;
window.analizarParConIA = analizarParConIA;
window.relGoToPage = relGoToPage;
