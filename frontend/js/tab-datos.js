/* 
 LICITRA — tab-datos.js
 Lógica de la pestaña "Datos":
 selector de columnas, filtros, tabla (render/sort/paginar),
 modal de detalle y exportación CSV.
 Dependencias: utils.js, config.js, state.js
 */

// CATÁLOGO CPV (45 divisiones principales — fuente oficial) 
const CPV_DIVISIONES = [
 { code: '03', label: 'Productos de la agricultura, ganadería, pesca, silvicultura y productos afines' },
 { code: '09', label: 'Derivados del petróleo, combustibles, electricidad y otras fuentes de energía' },
 { code: '14', label: 'Productos de la minería, de metales de base y productos afines' },
 { code: '15', label: 'Alimentos, bebidas, tabaco y productos afines' },
 { code: '16', label: 'Maquinaria agrícola' },
 { code: '18', label: 'Prendas de vestir, calzado, artículos de viaje y accesorios' },
 { code: '19', label: 'Piel y textiles, materiales de plástico y caucho' },
 { code: '22', label: 'Impresos y productos relacionados' },
 { code: '24', label: 'Productos químicos' },
 { code: '30', label: 'Máquinas, equipo y artículos de oficina e informática' },
 { code: '31', label: 'Máquinas, aparatos, equipo eléctrico e iluminación' },
 { code: '32', label: 'Equipos de radio, televisión, comunicaciones y telecomunicaciones' },
 { code: '33', label: 'Equipamiento médico, farmacéutico y de higiene personal' },
 { code: '34', label: 'Equipos de transporte y productos auxiliares' },
 { code: '35', label: 'Equipo de seguridad, extinción de incendios, policía y defensa' },
 { code: '37', label: 'Instrumentos musicales, artículos deportivos, juegos y juguetes' },
 { code: '38', label: 'Equipo de laboratorio, óptico y de precisión' },
 { code: '39', label: 'Mobiliario, complementos, aparatos electrodomésticos' },
 { code: '41', label: 'Agua recogida y depurada' },
 { code: '42', label: 'Maquinaria industrial' },
 { code: '43', label: 'Maquinaria para minería, cantería y construcción' },
 { code: '44', label: 'Estructuras y materiales de construcción' },
 { code: '45', label: 'Trabajos de construcción' },
 { code: '48', label: 'Paquetes de software y sistemas de información' },
 { code: '50', label: 'Servicios de reparación y mantenimiento' },
 { code: '51', label: 'Servicios de instalación (excepto software)' },
 { code: '55', label: 'Servicios de hostelería y restauración' },
 { code: '60', label: 'Servicios de transporte' },
 { code: '63', label: 'Servicios de transporte complementarios y auxiliares' },
 { code: '64', label: 'Servicios de correos y telecomunicaciones' },
 { code: '65', label: 'Servicios públicos' },
 { code: '66', label: 'Servicios financieros y de seguros' },
 { code: '70', label: 'Servicios inmobiliarios' },
 { code: '71', label: 'Servicios de arquitectura, construcción, ingeniería e inspección' },
 { code: '72', label: 'Servicios TI: consultoría, desarrollo de software, Internet y apoyo' },
 { code: '73', label: 'Servicios de investigación y desarrollo' },
 { code: '75', label: 'Servicios de administración pública, defensa y seguridad social' },
 { code: '76', label: 'Servicios relacionados con la industria del gas y del petróleo' },
 { code: '77', label: 'Servicios agrícolas, forestales, hortícolas, acuícolas y apícolas' },
 { code: '79', label: 'Servicios a empresas: legislación, mercadotecnia, asesoría, selección de personal' },
 { code: '80', label: 'Servicios de enseñanza y formación' },
 { code: '85', label: 'Servicios de salud y asistencia social' },
 { code: '90', label: 'Servicios de alcantarillado, basura, limpieza y medio ambiente' },
 { code: '92', label: 'Servicios de esparcimiento, culturales y deportivos' },
 { code: '98', label: 'Otros servicios comunitarios, sociales o personales' },
];

// CPVs seleccionados por el usuario
let _cpvSeleccionados = new Set();

function buildCpvFilter() {
 const container = document.getElementById('filterCpvGrid');
 if (!container) return;
 container.innerHTML = CPV_DIVISIONES.map(div => `
 <div class="cpv-chip ${_cpvSeleccionados.has(div.code) ? 'active' : ''}"
 data-code="${div.code}"
 onclick="toggleCpv('${div.code}')"
 title="${div.code}000000 — ${div.label}">
 <span class="cpv-code">${div.code}</span>
 <span class="cpv-label">${div.label}</span>
 </div>`).join('');

 // Actualizar contador
 const badge = document.getElementById('cpvActiveBadge');
 if (badge) {
 badge.textContent = _cpvSeleccionados.size > 0 ? _cpvSeleccionados.size : '';
 badge.style.display = _cpvSeleccionados.size > 0 ? 'inline-flex' : 'none';
 }
}

function toggleCpv(code) {
 if (_cpvSeleccionados.has(code)) {
 _cpvSeleccionados.delete(code);
 } else {
 _cpvSeleccionados.add(code);
 }
 buildCpvFilter();
 applyFilters();
}


function toggleCpvPanel() {
 const panel = document.getElementById('cpvPanel');
 const icon = document.getElementById('cpvToggleIcon');
 if (!panel) return;
 const open = panel.style.display === 'none' || panel.style.display === '';
 panel.style.display = open ? 'block' : 'none';
 if (icon) icon.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
}

function resetCpvFilter() {
 _cpvSeleccionados.clear();
 buildCpvFilter();
 applyFilters();
}


// SELECTOR DE COLUMNAS 
function buildColSelector() {
 const available = getAvailableCols();

 const chips = available.map(col => {
 const active = visibleCols.includes(col.key) ? 'active' : '';
 return `<div class="col-chip ${active}" data-key="${col.key}" onclick="toggleCol('${col.key}')">${col.label}</div>`;
 }).join('');

 document.getElementById('colChips').innerHTML = chips;
}

function toggleCol(key) {
 if (visibleCols.includes(key)) {
 if (visibleCols.length <= 1) return; // no dejar sin columnas
 visibleCols = visibleCols.filter(k => k !== key);
 } else {
 visibleCols.push(key);
 }
 buildColSelector();
 renderTable();
}

function selectAllCols() { visibleCols = getAvailableCols().map(c => c.key); buildColSelector(); renderTable(); }
function selectNoneCols() { visibleCols = ['objeto']; buildColSelector(); renderTable(); }

// FILTROS
function populateFilters() {
 populateSelect('filterEstado', uniqueVals('estado'));
 populateSelect('filterTipoProcedimiento', uniqueVals('tipoProcedimiento'));

 // Comboboxes con búsqueda
 initCombo('comboAdjudicatarioInput', 'comboAdjudicatarioList', 'filterAdjudicatario',
 uniqueVals('adjudicatario'));
 initCombo('comboOrganoInput', 'comboOrganoList', 'filterOrgano',
 uniqueVals('organo'));

 buildCpvFilter();

 // Bind listeners dinámicos (sólo una vez)
 if (!window._filtersBound) {
 window._filtersBound = true;

 // Inputs de texto: debounce 220ms
 let _dbt;
 const debounce = fn => { clearTimeout(_dbt); _dbt = setTimeout(fn, 220); };
 document.getElementById('searchInput')?.addEventListener('input', () => debounce(applyFilters));
 document.getElementById('filterMin')?.addEventListener('input', () => debounce(applyFilters));
 document.getElementById('filterMax')?.addEventListener('input', () => debounce(applyFilters));

 // Selects normales: inmediato
 ['filterEstado','filterTipoProcedimiento','filterRangoFechas']
 .forEach(id => document.getElementById(id)?.addEventListener('change', applyFilters));
 }
}

/* COMBOBOX genérico con búsqueda y resaltado */
function initCombo(inputId, listId, hiddenId, allOptions) {
 const input = document.getElementById(inputId);
 const list = document.getElementById(listId);
 const hidden = document.getElementById(hiddenId);
 if (!input || !list || !hidden) return;

 // Elimina listeners anteriores clonando el nodo
 const newInput = input.cloneNode(true);
 input.parentNode.replaceChild(newInput, input);
 const inp = document.getElementById(inputId);

 const normalize = s => normEmpresa(s);

 function renderList(query) {
 const q = normalize(query.trim());
 const filtered = q
 ? allOptions.filter(o => normalize(o).includes(q))
 : allOptions;

 if (filtered.length === 0) {
 list.innerHTML = '<div class="combo-empty">Sin coincidencias</div>';
 } else {
 list.innerHTML = filtered.slice(0, 100).map(o => {
 let label = escHtml(o);
 if (q) {
 const norm = normalize(o);
 const idx = norm.indexOf(q);
 if (idx >= 0) {
 label = escHtml(o.slice(0, idx))
 + '<mark>' + escHtml(o.slice(idx, idx + q.length)) + '</mark>'
 + escHtml(o.slice(idx + q.length));
 }
 }
 return `<div class="combo-option" data-value="${escHtml(o)}">${label}</div>`;
 }).join('');
 }

 list.querySelectorAll('.combo-option').forEach(el => {
 el.addEventListener('mousedown', e => {
 e.preventDefault();
 const val = el.dataset.value;
 inp.value = val;
 hidden.value = val;
 list.classList.remove('open');
 applyFilters();
 });
 });
 }

 inp.addEventListener('focus', () => { renderList(inp.value); list.classList.add('open'); });
 inp.addEventListener('input', () => {
 hidden.value = '';
 renderList(inp.value);
 list.classList.add('open');
 applyFilters();
 });
 inp.addEventListener('blur', () => {
 setTimeout(() => { list.classList.remove('open'); }, 160);
 });
 inp.addEventListener('keydown', e => {
 if (e.key === 'Escape') {
 inp.value = ''; hidden.value = '';
 list.classList.remove('open');
 applyFilters();
 }
 });
}


function uniqueVals(key) {
 // Deduplica usando normEmpresa: agrupa variantes por tildes, comas, guiones y mayúsculas
 const seen = new Map(); // normEmpresa(raw) → display
 allData.forEach(r => {
 const raw = r[key];
 if (!raw) return;
 const key2 = normEmpresa(raw);
 if (!seen.has(key2)) seen.set(key2, normEmpresaDisplay(raw));
 });
 return [...seen.values()].sort((a,b) => a.localeCompare(b,'es'));
}

function populateSelect(id, vals) {
 const sel = document.getElementById(id);
 if (!sel) return;
 const current = sel.value;
 sel.innerHTML = '<option value="">Todos</option>' +
 vals.map(v => `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`).join('');
}

function applyFilters() {
 const search = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
 const estado = document.getElementById('filterEstado')?.value || '';
 const tipoProcedi = document.getElementById('filterTipoProcedimiento')?.value || '';
 const rangoFechas = document.getElementById('filterRangoFechas')?.value || '';
 const adjudic = document.getElementById('filterAdjudicatario')?.value || '';
 const adjudicTxt = document.getElementById('comboAdjudicatarioInput')?.value.trim() || '';
 const organo = document.getElementById('filterOrgano')?.value || '';
 const organoTxt = document.getElementById('comboOrganoInput')?.value.trim() || '';
 const minVal = parseFloat(document.getElementById('filterMin')?.value) || 0;
 const maxVal = parseFloat(document.getElementById('filterMax')?.value) || Infinity;

 // Calcular rango de fechas
 let fechaDesde = null;
 let fechaHasta = null;
 if (rangoFechas) {
 const now = new Date();
 if (rangoFechas === '24h') {
 fechaDesde = new Date(now.getTime() - 24 * 60 * 60 * 1000);
 } else if (rangoFechas === 'semana') {
 fechaDesde = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
 } else if (rangoFechas === 'mes') {
 fechaDesde = new Date(now); fechaDesde.setMonth(fechaDesde.getMonth() - 1);
 } else if (rangoFechas === '3meses') {
 fechaDesde = new Date(now); fechaDesde.setMonth(fechaDesde.getMonth() - 3);
 } else if (rangoFechas === '6meses') {
 fechaDesde = new Date(now); fechaDesde.setMonth(fechaDesde.getMonth() - 6);
 } else if (rangoFechas === '12meses') {
 fechaDesde = new Date(now); fechaDesde.setFullYear(fechaDesde.getFullYear() - 1);
 } else if (rangoFechas === 'este_anio') {
 fechaDesde = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
 } else if (rangoFechas === 'anio_anterior') {
 fechaDesde = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
 fechaHasta = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
 }
 }

 filteredData = allData.filter(r => {
 // Filtro Estado: comparación normalizada para evitar diferencias de tildes/espacios
 if (estado && normEmpresa(r.estado || '') !== normEmpresa(estado)) return false;

 // Filtro Tipo de Procedimiento
 if (tipoProcedi && normEmpresa(r.tipoProcedimiento || '') !== normEmpresa(tipoProcedi)) return false;

 // Filtros Adjudicatario y Órgano
 if (adjudic && normEmpresa(r.adjudicatario || '') !== normEmpresa(adjudic)) return false;
 if (!adjudic && adjudicTxt && !normEmpresa(r.adjudicatario || '').includes(normEmpresa(adjudicTxt))) return false;
 if (organo && normEmpresa(r.organo || '') !== normEmpresa(organo)) return false;
 if (!organo && organoTxt && !normEmpresa(r.organo || '').includes(normEmpresa(organoTxt))) return false;

 // Filtro CPV: si hay divisiones seleccionadas, el CPV del registro debe empezar por alguna de ellas
 if (_cpvSeleccionados.size > 0) {
 const cpvStr = String(r.cpv || r.cpvLote || '');
 // El campo CPV puede contener múltiples códigos separados por ";"
 const cpvCodes = cpvStr.split(';').map(s => s.trim()).filter(Boolean);
 const match = cpvCodes.some(c => {
 const prefix = c.substring(0, 2);
 return _cpvSeleccionados.has(prefix);
 });
 if (!match) return false;
 }

 // Filtro por rango de fechas (usa fechaActualizacion o fechaOfertas como referencia)
 if (fechaDesde || fechaHasta) {
 const fechaStr = r.fechaActualizacion || r.fechaOfertas || r.fechaAcuerdo || '';
 const fecha = fechaStr ? new Date(fechaStr) : null;
 if (!fecha || isNaN(fecha.getTime())) return false;
 if (fechaDesde && fecha < fechaDesde) return false;
 if (fechaHasta && fecha > fechaHasta) return false;
 }

 // Filtro importe: sólo aplica si el usuario pone un valor concreto
 const importe = r._importeConIVA || r.importeConIVA || 0;
 if (minVal > 0 && importe < minVal) return false;
 if (maxVal < Infinity && importe > maxVal) return false;

 if (search) {
 // Normaliza tildes/acentos: convierte "á" → "a", etc.
 const normalize = str => String(str)
 .normalize('NFD')
 .replace(/[\u0300-\u036f]/g, '')
 .toLowerCase();

 const searchNorm = normalize(search);

 // Busca en TODOS los campos del registro.
 // Reemplaza comas pegadas a texto (ej: "EMPRESA,SL" → "EMPRESA SL")
 // para que buscar "empresa sl" o "empresa, sl" funcione igual.
 const searchable = Object.values(r)
 .filter(v => v !== null && v !== undefined && typeof v !== 'object')
 .join(' ')
 .replace(/,(?=[A-Za-z])/g, ' ') // coma sin espacio → espacio
 .replace(/,/g, ' '); // comas restantes → espacio

 if (!normalize(searchable).includes(searchNorm)) return false;
 }
 return true;
 });

 currentPage = 1;
 updateHeaderStats();
 buildStats();
 renderTable();
 _updateActiveFilterBadge();
}

// BADGE DE FILTROS ACTIVOS 
function _updateActiveFilterBadge() {
 const allIds = ['filterEstado','filterTipoProcedimiento','filterRangoFechas',
 'filterAdjudicatario','filterOrgano',
 'comboAdjudicatarioInput','comboOrganoInput',
 'searchInput','filterMin','filterMax'];
 const active = allIds.filter(id => {
 const el = document.getElementById(id);
 return el && el.value.trim() !== '';
 }).length + (_cpvSeleccionados.size > 0 ? 1 : 0);

 let badge = document.getElementById('filterActiveBadge');
 if (!badge) {
 badge = document.createElement('span');
 badge.id = 'filterActiveBadge';
 badge.style.cssText = `
 display:inline-flex;align-items:center;justify-content:center;
 background:var(--accent,#1d4ed8);color:#fff;border-radius:999px;
 font-size:.65rem;font-weight:700;padding:2px 8px;margin-left:8px;
 vertical-align:middle;font-family:'JetBrains Mono',monospace;
 transition:opacity .2s;`;
 const title = document.querySelector('#filterPanel .panel-title');
 if (title) title.appendChild(badge);
 }
 badge.textContent = active > 0 ? `${active} activo${active > 1 ? 's' : ''}` : '';
 badge.style.opacity = active > 0 ? '1' : '0';
}

function resetFilters() {
 resetCpvFilter();
 ['searchInput', 'filterMin', 'filterMax'].forEach(id => {
 const el = document.getElementById(id);
 if (el) el.value = '';
 });
 ['filterEstado','filterTipoProcedimiento','filterRangoFechas'].forEach(id => {
 const el = document.getElementById(id);
 if (el) el.value = '';
 });
 // Limpiar comboboxes
 ['comboAdjudicatarioInput','comboOrganoInput'].forEach(id => {
 const el = document.getElementById(id);
 if (el) el.value = '';
 });
 ['filterAdjudicatario','filterOrgano'].forEach(id => {
 const el = document.getElementById(id);
 if (el) el.value = '';
 });
 filteredData = [...allData];
 currentPage = 1;
 updateHeaderStats();
 buildStats();
 renderTable();
 _updateActiveFilterBadge();
}

// TABLA 
function renderTable() {
 const cols = COL_MAP.filter(c => visibleCols.includes(c.key));
 renderHead(cols);
 renderBody(cols);
 renderPagination();

 const count = filteredData.length;
 const start = (currentPage - 1) * PAGE_SIZE + 1;
 const end = Math.min(currentPage * PAGE_SIZE, count);
 document.getElementById('tableCount').innerHTML =
 `Mostrando <strong>${count > 0 ? start : 0}–${end}</strong> de <strong>${count}</strong> registros`;
}

function renderHead(cols) {
 document.getElementById('tableHead').innerHTML = `<tr>
 ${cols.map(c => {
 const cls = sortCol === c.key ? (sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : '';
 return `<th class="${cls}" onclick="sortBy('${c.key}')">${c.label}</th>`;
 }).join('')}
 </tr>`;
}

function renderBody(cols) {
 const start = (currentPage - 1) * PAGE_SIZE;
 const end = start + PAGE_SIZE;
 const page = filteredData.slice(start, end);

 if (page.length === 0) {
 document.getElementById('tableBody').innerHTML =
 `<tr class="no-data"><td colspan="${cols.length}">No hay registros que coincidan con los filtros.</td></tr>`;
 return;
 }

 document.getElementById('tableBody').innerHTML = page.map((row, ri) => {
 const cells = cols.map(c => {
 const val = row[c.key] || '';
 let display = escHtml(val);

 if (AMOUNT_KEYS.has(c.key)) {
 const n = parseAmount(val);
 display = n
 ? `<span class="amount">${formatEUR(n)}</span>`
 : '<span style="color:var(--text3)">—</span>';
 } else if (c.key === 'link' || c.key === 'enlacePerfil') {
 // Filtrar URLs de sesión WebSphere (!ut/p/z1/...) que expiran — solo mostrar links estables
 const safeHref = val && !val.includes('!ut/p/') ? val : null;
 display = safeHref ? `<a class="link-cell" href="${safeHref}" target="_blank" rel="noopener">↗ Ver</a>` : '';
 } else if (c.key === 'estado') {
 display = badgeEstado(val);
 } else if (c.key === 'tipoProcedimiento') {
 display = val ? `<span class="badge badge-gray">${escHtml(val)}</span>` : '';
 } else if (c.key === 'esPyme') {
 display = /s[ií]|yes|true/i.test(val)
 ? `<span class="badge badge-lime">PYME</span>`
 : (val ? `<span class="badge badge-gray">${escHtml(val)}</span>` : '');
 } else if (c.key === 'resultadoLote') {
 display = badgeEstado(val);
 }

 return `<td title="${escHtml(val)}">${display}</td>`;
 }).join('');

 const absIdx = start + ri;
 return `<tr onclick="openModal(${absIdx})">${cells}</tr>`;
 }).join('');
}

// BADGES 
function badgeEstado(val) {
 if (!val) return '';
 const v = val.toLowerCase();
 if (/adjudicad|formalizado/.test(v)) return `<span class="badge badge-green">${escHtml(val)}</span>`;
 if (/pendiente/.test(v)) return `<span class="badge badge-amber">${escHtml(val)}</span>`;
 if (/resuelta/.test(v)) return `<span class="badge badge-cyan">${escHtml(val)}</span>`;
 if (/desistid|anulad/.test(v)) return `<span class="badge badge-red">${escHtml(val)}</span>`;
 return `<span class="badge badge-gray">${escHtml(val)}</span>`;
}

function badgeVigencia(val) {
 if (!val) return '';
 const v = val.toLowerCase();
 if (/vigente/.test(v)) return `<span class="badge badge-green">VIGENTE</span>`;
 if (/anulad/.test(v)) return `<span class="badge badge-red">ANULADA</span>`;
 if (/archivad/.test(v)) return `<span class="badge badge-gray">ARCHIVADA</span>`;
 return `<span class="badge badge-gray">${escHtml(val)}</span>`;
}

// ORDENACIÓN 
// Claves que son fechas (para ordenar cronológicamente, no alfabéticamente)
const DATE_SORT_KEYS = new Set([
 'fechaActualizacion', 'fechaOfertas', 'fechaAcuerdo',
 'fechaFormalizacion', 'fechaVigencia', 'primeraPublicacion'
]);

function _parseFechaSort(v) {
 if (!v) return 0;
 const s = String(v).trim();
 if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).getTime();
 const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
 if (m) {
 const [, dd, MM, yyyy, hh = 0, mi = 0, ss = 0] = m;
 return new Date(
 Number(yyyy) < 100 ? Number(yyyy) + 2000 : Number(yyyy),
 Number(MM) - 1, Number(dd), Number(hh), Number(mi), Number(ss)
 ).getTime();
 }
 return 0;
}

function sortBy(key) {
 if (sortCol === key) {
 sortDir = sortDir === 'asc' ? 'desc' : 'asc';
 } else {
 sortCol = key;
 sortDir = 'asc';
 }

 filteredData.sort((a, b) => {
 let av = a[key] || '';
 let bv = b[key] || '';
 if (AMOUNT_KEYS.has(key)) {
 av = parseAmount(av) || 0;
 bv = parseAmount(bv) || 0;
 return sortDir === 'asc' ? av - bv : bv - av;
 }
 if (DATE_SORT_KEYS.has(key)) {
 const at = _parseFechaSort(av);
 const bt = _parseFechaSort(bv);
 return sortDir === 'asc' ? at - bt : bt - at;
 }
 return sortDir === 'asc'
 ? String(av).localeCompare(String(bv), 'es')
 : String(bv).localeCompare(String(av), 'es');
 });

 currentPage = 1;
 renderTable();
}

// PAGINACIÓN 
function renderPagination() {
 const total = Math.ceil(filteredData.length / PAGE_SIZE);
 const pg = document.getElementById('pagination');
 if (total <= 1) { pg.innerHTML = ''; return; }

 let pages = [];
 if (total <= 7) {
 pages = Array.from({ length: total }, (_, i) => i + 1);
 } else {
 pages = [1];
 if (currentPage > 3) pages.push('…');
 for (let i = Math.max(2, currentPage - 1); i <= Math.min(total - 1, currentPage + 1); i++) pages.push(i);
 if (currentPage < total - 2) pages.push('…');
 pages.push(total);
 }

 const btns = pages.map(p => {
 if (p === '…') return `<span class="page-btn" style="cursor:default;opacity:.4">…</span>`;
 return `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
 }).join('');

 pg.innerHTML = `
 <span class="page-info">Página ${currentPage} de ${total}</span>
 <div class="page-btns">
 <button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>
 ${btns}
 <button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === total ? 'disabled' : ''}>›</button>
 </div>`;
}

function goPage(p) {
 const total = Math.ceil(filteredData.length / PAGE_SIZE);
 if (p < 1 || p > total) return;
 currentPage = p;
 renderTable();
 document.getElementById('mainTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// MODAL DE DETALLE 
function openModal(idx) {
 const row = filteredData[idx];
 if (!row) return;

 document.getElementById('modalTitle').textContent =
 row.objeto || row.objetoLote || 'Detalle de licitación';

 const fields = [
 { key: 'id', label: 'Identificador' },
 { key: 'expediente', label: 'Nº Expediente' },
 { key: 'estado', label: 'Estado' },
 { key: 'fechaActualizacion',label: 'Última actualización' },
 { key: 'organo', label: 'Órgano contratante' },
 { key: 'tipoAdmin', label: 'Tipo administración' },
 { key: 'tipoContrato', label: 'Tipo contrato' },
 { key: 'tipoProcedimiento', label: 'Procedimiento' },
 { key: 'cpv', label: 'CPV' },
 { key: 'lugarEjecucion', label: 'Lugar ejecución' },
 { key: 'codigoPostal', label: 'Cód. Postal' },
 { key: 'lote', label: 'Lote' },
 { key: 'objetoLote', label: 'Objeto lote' },
 { key: 'resultadoLote', label: 'Resultado lote' },
 { key: 'numOfertas', label: 'Nº ofertas recibidas' },
 { key: 'numContrato', label: 'Nº contrato lote' },
 { key: 'fechaAcuerdo', label: 'Fecha acuerdo' },
 { key: 'fechaFormalizacion',label: 'Formalización' },
 { key: 'fechaVigencia', label: 'Entrada en vigor' },
 ];

 const amountFields = [
 { key: 'valorEstimado', label: 'Valor estimado' },
 { key: 'presupuestoSinIVA', label: 'Presupuesto sin IVA' },
 { key: 'presupuestoConIVA', label: 'Presupuesto con IVA' },
 { key: 'presupuestoLoteConIVA',label: 'Presup. lote con IVA' },
 { key: 'presupuestoLoteSinIVA',label: 'Presup. lote sin IVA' },
 { key: 'importeSinIVA', label: 'Importe adj. sin IVA' },
 { key: 'importeConIVA', label: 'Importe adj. con IVA' },
 { key: 'ofertaMasBaja', label: 'Oferta más baja' },
 { key: 'ofertaMasAlta', label: 'Oferta más alta' },
 ];

 const adjFields = [
 { key: 'adjudicatario', label: 'Adjudicatario' },
 { key: 'idAdjudicatario', label: 'ID Adjudicatario' },
 { key: 'esPyme', label: '¿Es PYME?' },
 ];

 const renderField = (f) => {
 const val = row[f.key];
 if (!val) return `<div class="detail-item"><div class="detail-key">${f.label}</div><div class="detail-val" style="color:var(--text3)">—</div></div>`;
 return `<div class="detail-item"><div class="detail-key">${f.label}</div><div class="detail-val">${escHtml(val)}</div></div>`;
 };

 const renderAmt = (f) => {
 const val = row[f.key];
 const n = parseAmount(val);
 const display = n ? formatEUR(n) : (val || '—');
 return `<div class="detail-item"><div class="detail-key">${f.label}</div><div class="detail-val amount" style="color:${n ? 'var(--lime)' : 'var(--text3)'}">${display}</div></div>`;
 };

 // Solo mostrar enlace externo si hay un link directo real en la BD.
 // NO generar URLs de búsqueda por expediente — llevan a resultados genéricos, no a la licitación.
 const _portalUrl = (() => {
   const link = row.link || '';
   return (link.startsWith('http') && !link.includes('!ut/p/')) ? link : null;
 })();
 const linkHtml = _portalUrl
 ? `<div class="detail-item full"><div class="detail-key">Enlace licitación</div><div class="detail-val"><a href="${_portalUrl}" target="_blank" rel="noopener">↗ Ver en portal de contratación</a></div></div>`
 : '';

 const _perfilUrl = row.enlacePerfil && !row.enlacePerfil.includes('!ut/p/') ? row.enlacePerfil : null;
const linkPerfilHtml = _perfilUrl
 ? `<div class="detail-item full"><div class="detail-key">Perfil del contratante</div><div class="detail-val"><a href="${_perfilUrl}" target="_blank" rel="noopener">↗ Ver perfil OC</a></div></div>`
 : '';

 document.getElementById('modalBody').innerHTML = `
 <div class="detail-grid">
 <div class="detail-section">Información general</div>
 ${fields.map(renderField).join('')}
 ${linkHtml}
 ${linkPerfilHtml}
 <div class="detail-section">Importes</div>
 ${amountFields.map(renderAmt).join('')}
 <div class="detail-section">Adjudicación</div>
 ${adjFields.map(renderField).join('')}
 </div>`;

 document.getElementById('modalOverlay').classList.add('open');
}

function closeModal(e) {
 if (e.target === document.getElementById('modalOverlay')) closeModalBtn();
}

function closeModalBtn() {
 document.getElementById('modalOverlay').classList.remove('open');
}

// EXPORTAR CSV 
function exportCSV() {
 const cols = COL_MAP.filter(c => visibleCols.includes(c.key));
 const 