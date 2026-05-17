/* 
 LICITRA — data.js
 Versión definitiva
*/

let datosOrigen = 'bbdd';

async function recargarDesdeBBDD() {
 try { 
 if (typeof idbInvalidate === 'function') await idbInvalidate(); 
 } catch(_) {}
 location.reload();
}

function mostrarOrigenDatos() {
 let banner = document.getElementById('datosOrigenBanner');
 if (!banner) {
 const statsGrid = document.getElementById('statsGrid');
 if (statsGrid && statsGrid.parentNode) {
 banner = document.createElement('div');
 banner.id = 'datosOrigenBanner';
 banner.style.cssText = 'margin-bottom: 16px; padding: 8px 12px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 8px;';
 statsGrid.parentNode.insertBefore(banner, statsGrid);
 }
 }
 
 if (banner) {
 if (datosOrigen === 'bbdd') {
 banner.style.background = '#e8f4f8';
 banner.style.color = '#004d66';
 banner.style.border = '1px solid #b3e0f0';
 banner.innerHTML = `
 <span> </span>
 <span>Mostrando datos desde <strong>BASE DE DATOS</strong> (${allData?.length?.toLocaleString('es-ES') || 0} registros)</span>
 <button class="btn btn-ghost btn-sm" onclick="forzarRecargaBBDD()" style="margin-left:auto; font-size:11px"> Forzar recarga</button>
 `;
 } else {
 banner.style.background = '#fff3e0';
 banner.style.color = '#663c00';
 banner.style.border = '1px solid #ffcc80';
 banner.innerHTML = `
 <span> </span>
 <span>Mostrando datos desde <strong>ARCHIVO LOCAL</strong> (${allData?.length?.toLocaleString('es-ES') || 0} registros)</span>
 <button class="btn btn-ghost btn-sm" onclick="cargarDatosDesdeSupabase(true)" style="margin-left:auto; font-size:11px"> Cargar desde BBDD</button>
 <button class="btn btn-ghost btn-sm" onclick="sincronizarDesdeBanner()" style="font-size:11px">↑ Sincronizar con BBDD</button>
 `;
 }
 }
}

async function forzarRecargaBBDD() {
 await cargarDatosDesdeSupabase(true);
}

function updateHeaderStats() {
 const filenameEl = document.querySelector('.upload-mini-text strong');
 const filename = filenameEl?.textContent || (datosOrigen === 'bbdd' ? 'Base de Datos' : 'Archivo local');
 const hstatFile = document.getElementById('hstatFile');
 const hstatCount = document.getElementById('hstatCount');
 const hstatImporte = document.getElementById('hstatImporte');
 
 if (hstatFile) hstatFile.textContent = filename;
 if (hstatCount) hstatCount.textContent = `${filteredData ? filteredData.length.toLocaleString('es-ES') : 0} licitaciones`;
 
 let total = 0;
 if (filteredData) {
 for (const r of filteredData) {
 let val = r.importeConIVA;
 if (val && val > 0 && val < 1e10) total += val;
 }
 }
 if (hstatImporte) hstatImporte.textContent = formatEUR(total);
}

function buildStats(dataSet = null) {
 const data = dataSet || (filteredData || []);
 const totalArchivo = allData ? allData.length : 0;
 const total = data.length;

 let importeTotal = 0;
 for (const r of data) {
 const importe = r.importeConIVA || 0;
 if (importe > 0 && importe < 1e10) importeTotal += importe;
 }
 
 // CORRECCIÓN: Usar normEmpresa para deduplicar
 const adjudicatariosSet = new Set();
 const organosSet = new Set();
 const pymesSet = new Set();
 let conAdjudicatario = 0;
 let pendientes = 0;
 
 for (const r of data) {
 if (/pendiente/i.test(r.estado || '')) pendientes++;
 
 let adj = r.adjudicatario || r.adjudicatario_licitaci_ || '';
 if (adj && adj !== '' && adj !== 'null') {
 const adjNorm = normEmpresa(String(adj));
 if (adjNorm && adjNorm.length > 3) {
 adjudicatariosSet.add(adjNorm);
 conAdjudicatario++;
 if (/s[ií]|yes|true|pyme/i.test(r.esPyme || r.el_adjudicatario_es_ || '')) {
 pymesSet.add(adjNorm);
 }
 }
 }
 
 let organo = r.organo || r.organo_de_contratac_ || '';
 if (organo && organo !== '' && organo !== 'null') {
 const organoNorm = normEmpresa(String(organo));
 if (organoNorm && organoNorm.length > 3) organosSet.add(organoNorm);
 }
 }

 const statsGrid = document.getElementById('statsGrid');
 if (statsGrid) {
 statsGrid.innerHTML =
 statCard('lime', total.toLocaleString('es-ES'), 'Total licitaciones', `de ${totalArchivo.toLocaleString('es-ES')} (${datosOrigen === 'bbdd' ? 'BBDD' : 'archivo'})`) +
 statCard('cyan', formatEUR(importeTotal), 'Importe total adj.', 'con IVA') +
 statCard('green', conAdjudicatario.toLocaleString('es-ES'), 'Con adjudicatario', `de ${total.toLocaleString('es-ES')}`) +
 statCard('amber', pendientes.toLocaleString('es-ES'),'Pendientes', 'de adjudicación') +
 statCard('orange', organosSet.size.toLocaleString('es-ES'), 'Órganos contratantes', 'distintos') +
 statCard('red', adjudicatariosSet.size.toLocaleString('es-ES'), 'Adjudicatarios', 'distintos') +
 statCard('lime', pymesSet.size.toLocaleString('es-ES'), 'PYMES adjudicatarias', 'detectadas');
 }
 
 updateHeaderStats();
 mostrarOrigenDatos();
}

function setupUpload() {
 const dz = document.getElementById('dropZone');
 const fi = document.getElementById('fileInput');
 if (!dz || !fi) return;
 dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
 dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
 dz.addEventListener('drop', e => {
 e.preventDefault();
 dz.classList.remove('drag');
 if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
 });
 fi.addEventListener('change', () => {
 if (fi.files[0]) processFile(fi.files[0]);
 fi.value = '';
 });
}

function processFile(file) {
 const name = file.name.toLowerCase();
 const reader = new FileReader();
 if (name.endsWith('.csv')) {
 reader.onload = e => loadData(parseCSV(e.target.result), file.name);
 reader.readAsText(file, 'UTF-8');
 } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
 reader.onload = e => {
 try {
 const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
 let ws = null;
 for (const shName of wb.SheetNames) {
 const candidate = wb.Sheets[shName];
 if (candidate['!ref'] && candidate['!ref'] !== 'A1') { ws = candidate; break; }
 }
 if (!ws) ws = wb.Sheets[wb.SheetNames[0]];
 const rawArray = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy' });
 if (!rawArray || rawArray.length < 2) { loadData(rawArray, file.name); return; }
 const numCols = rawArray[0].length;
 const normalized = rawArray.map(row => {
 if (row.length === numCols) return row;
 const padded = row.slice(0, numCols);
 while (padded.length < numCols) padded.push('');
 return padded;
 });
 loadData(normalized, file.name);
 } catch (err) {
 alert('Error al leer el archivo Excel: ' + err.message);
 }
 };
 reader.readAsBinaryString(file);
 } else {
 alert('Formato no soportado. Usa .csv, .xlsx o .xls');
 }
}

function parseCSV(text) {
 const firstLine = text.split('\n')[0];
 const sep = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
 return text.split('\n').filter(l => l.trim()).map(line => {
 const cols = [];
 let current = '', inQuotes = false;
 for (let i = 0; i < line.length; i++) {
 const c = line[i];
 if (c === '"') inQuotes = !inQuotes;
 else if (c === sep && !inQuotes) { cols.push(current.trim()); current = ''; }
 else current += c;
 }
 cols.push(current.trim());
 return cols;
 });
}

function buildColMapping() {
 window.colMapping = {};
 const normalizedCOL_MAP = COL_MAP.map(col => ({
 key: col.key,
 normalizedMatches: col.match.map(m => normHeader(m)),
 }));
 window.rawHeaders.forEach((header, idx) => {
 const h = normHeader(header);
 if (!h) return;
 let bestKey = null, bestLen = -1;
 for (const col of normalizedCOL_MAP) {
 for (const nm of col.normalizedMatches) {
 if (h.includes(nm) && nm.length > bestLen) {
 bestLen = nm.length;
 bestKey = col.key;
 }
 }
 }
 if (bestKey) {
 if (!window.colMapping[bestKey]) window.colMapping[bestKey] = [];
 window.colMapping[bestKey].push(idx);
 }
 });
}

function getAvailableCols() {
 return COL_MAP.filter(c => Array.isArray(window.colMapping[c.key]) && window.colMapping[c.key].length > 0);
}

function getVal(row, key) {
 const idxs = window.colMapping[key];
 if (!idxs) return '';
 for (const idx of idxs) {
 if (idx < row.length) {
 const v = String(row[idx] ?? '').trim();
 if (v && v !== 'undefined' && v !== 'null') return v;
 }
 }
 return '';
}

function normalizeRow(row) {
 const obj = { _raw: row };
 COL_MAP.forEach(col => { obj[col.key] = getVal(row, col.key); });
 
 const parseImporte = (val) => {
 if (val === null || val === undefined || val === '') return 0;
 if (typeof val === 'number') {
 return isNaN(val) ? 0 : val;
 }
 if (typeof val === 'string') {
 const parsed = parseAmount(val);
 return (parsed !== null) ? parsed : 0;
 }
 return 0;
 };
 
 obj.importeConIVA = parseImporte(obj.importeConIVA) || parseImporte(obj.presupuestoConIVA) || 0;
 obj.importeSinIVA = parseImporte(obj.importeSinIVA) || parseImporte(obj.presupuestoSinIVA) || 0;
 obj.valorEstimado = parseImporte(obj.valorEstimado) || 0;
 obj.ofertaMasBaja = parseImporte(obj.ofertaMasBaja) || 0;
 obj.ofertaMasAlta = parseImporte(obj.ofertaMasAlta) || 0;
 
 obj._importeConIVA = obj.importeConIVA;
 obj._importeSinIVA = obj.importeSinIVA;
 obj._valorEstimado = obj.valorEstimado;
 
 return obj;
}

function loadData(rows, filename, fromBBDD = false) {
 if (!rows || rows.length < 2) { alert('El archivo no tiene datos suficientes.'); return; }
 
 datosOrigen = fromBBDD ? 'bbdd' : 'archivo';
 
 const headerRow = rows[0].map(h => String(h).trim());
 let lastNonEmpty = headerRow.length - 1;
 while (lastNonEmpty > 0 && !headerRow[lastNonEmpty]) lastNonEmpty--;
 window.rawHeaders = headerRow.slice(0, lastNonEmpty + 1);
 
 buildColMapping();
 
 allData = rows.slice(1).filter(r => r.some(c => String(c).trim())).map(row => normalizeRow(row));
 filteredData = [...allData];
 
 const uploadArea = document.getElementById('uploadArea');
 if (uploadArea) uploadArea.innerHTML = buildMiniUpload(filename, fromBBDD);
 setupMiniUpload();
 
 const dataSection = document.getElementById('dataSection');
 if (dataSection) dataSection.style.display = 'block';
 
 const banner = document.getElementById('syncBanner');
 if (banner) {
 if (!fromBBDD) {
 const syncBannerTitle = document.getElementById('syncBannerTitle');
 const syncBannerBtn = document.getElementById('syncBannerBtn');
 if (syncBannerTitle) syncBannerTitle.textContent = `"${filename}" cargado — ${allData.length.toLocaleString('es-ES')} licitaciones`;
 if (syncBannerBtn) {
 syncBannerBtn.disabled = false;
 syncBannerBtn.textContent = '↑ Sincronizar con BBDD';
 }
 banner.style.display = 'block';
 } else {
 banner.style.display = 'none';
 }
 }
 
 buildStats();
 mostrarOrigenDatos();
 if (typeof buildColSelector === 'function') buildColSelector();
 if (typeof populateFilters === 'function') populateFilters();
 if (typeof renderTable === 'function') renderTable();
 // buildAnalysis() reemplazado por Vue — TabAnalisis.vue escucha 'dataUpdated'
 if (typeof buildRelaciones === 'function') buildRelaciones();
 if (typeof resetIATabState === 'function') resetIATabState();
 if (typeof initIATab === 'function') initIATab();
 if (window.updateVueData) window.updateVueData(allData);
}

function buildMiniUpload(filename, fromBBDD = false) {
 const safeFilename = escHtml(filename);
 return `
 <div class="upload-mini" style="cursor:default">
 <span class="upload-mini-icon"></span>
 <div class="upload-mini-text" style="flex:1">Datos cargados: <strong>${safeFilename}</strong></div>
 <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
 <button class="btn btn-ghost btn-sm" onclick="document.getElementById('fileInputMini').click()">Otro archivo</button>
 <button class="btn btn-ghost btn-sm" onclick="recargarDesdeBBDD()">Recargar BBDD</button>
 </div>
 <input type="file" id="fileInputMini" accept=".csv,.xlsx,.xls" style="display:none">
 </div>`;
}

function setupMiniUpload() {
 const fi = document.getElementById('fileInputMini');
 if (fi) {
 fi.addEventListener('change', () => {
 if (fi.files[0]) processFile(fi.files[0]);
 fi.value = '';
 });
 }
}

async function sincronizarDesdeBanner() {
 const btn = document.getElementById('syncBannerBtn');
 const status = document.getElementById('syncBannerStatus');
 if (!allData || allData.length === 0) return;
 if (!btn || btn.disabled) return;
 btn.disabled = true;
 btn.textContent = '⏳ Sincronizando...';
 if (status) { status.textContent = ''; status.style.color = 'var(--text2)'; }
 try {
 if (!window.currentUser) throw new Error('Sin sesión activa');
 const fileNameEl = document.querySelector('.upload-mini-text strong');
 const fileName = fileNameEl?.textContent || 'archivo';
 const filasRaw = allData.filter(r => r.id && String(r.id).trim()).map(r => {
 const fila = {};
 Object.entries(KEY_TO_COL).forEach(([jsKey, colName]) => { fila[colName] = normalizeForSupabase(jsKey, r[jsKey]); });
 if (fila.identificador !== null && fila.identificador !== undefined) {
 const n = Number(fila.identificador);
 fila.identificador = Number.isFinite(n) ? n : null;
 }
 return fila;
 }).filter(f => f.identificador !== null);
 if (!filasRaw.length) throw new Error('Ninguna fila tiene el campo Identificador');
 const seenIds = new Map();
 filasRaw.forEach(f => {
 const existing = seenIds.get(f.identificador);
 if (!existing) seenIds.set(f.identificador, f);
 else {
 const fechaNueva = new Date(f.fecha_actualizacion || 0).getTime();
 const fechaExist = new Date(existing.fecha_actualizacion || 0).getTime();
 if (fechaNueva > fechaExist) seenIds.set(f.identificador, f);
 }
 });
 const filas = Array.from(seenIds.values());
 if (status) status.textContent = `Enviando ${filas.length.toLocaleString('es-ES')} registros al servidor…`;
 const resp = await fetch('/api/sync/upload', {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
 body: JSON.stringify({ filas, fileName })
 });
 const result = await resp.json();
 if (!resp.ok || !result.success) throw new Error(result.error || `Error del servidor (${resp.status})`);
 try { if (typeof idbInvalidate === 'function') await idbInvalidate(); } catch(_) {}
 if (status) { status.textContent = ` ${filas.length.toLocaleString('es-ES')} registros sincronizados. Recargando datos…`; status.style.color = 'var(--green)'; }
 btn.textContent = ' Sincronizado';
 await cargarDatosDesdeSupabase(true);
 } catch(err) {
 if (status) { status.textContent = ` Error: ${err.message}`; status.style.color = 'var(--red)'; }
 btn.disabled = false;
 btn.textContent = '↑ Reintentar';
 }
}

async function cargarDatosDesdeSupabase(forzar = true) {
 const btn = document.getElementById('btnCargarBBDD');
 const statusEl = document.getElementById('uploadBBDDStatus');
 const msgEl = document.getElementById('uploadBBDDMsg');
 console.log('[BBDD] Cargando desde Supabase...');
 if (btn) btn.disabled = true;
 if (statusEl) statusEl.style.display = 'flex';
 if (msgEl) msgEl.textContent = 'Conectando con el servidor…';
 try {
 let allRows = [], from = 0, BATCH = 1000;
 while (true) {
 if (msgEl) msgEl.textContent = `Descargando… ${allRows.length.toLocaleString('es-ES')} registros`;
 const resp = await fetch(`/api/sync/backup?from=${from}&batch=${BATCH}`, { credentials: 'include' });
 if (!resp.ok) { const errBody = await resp.json().catch(() => ({})); throw new Error(errBody.error || `Error del servidor (${resp.status})`); }
 const json = await resp.json();
 if (!json.success) throw new Error(json.error || 'Error cargando datos');
 const data = json.data || [];
 allRows = [...allRows, ...data];
 if (!json.hasMore) break;
 from += data.length || BATCH;
 }
 if (!allRows.length) {
 if (msgEl) msgEl.textContent = 'La base de datos está vacía.';
 setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; if (btn) btn.disabled = false; }, 3000);
 return;
 }
 console.log('[BBDD] Descargados', allRows.length, 'registros');
 const headers = COL_MAP.map(c => c.match[0]);
 const dataRows = allRows.map(row => COL_MAP.map(col => row[KEY_TO_COL[col.key]] ?? ''));
 const rows = [headers, ...dataRows];
 const filename = `Base de datos (${allRows.length.toLocaleString('es-ES')} registros)`;
 loadData(rows, filename, true);
 console.log('[BBDD] Carga completada. allData length:', allData?.length);
 } catch(err) {
 console.error('[BBDD] Error:', err);
 if (msgEl) msgEl.textContent = ` Error: ${err.message}`;
 if (statusEl) statusEl.style.color = 'var(--red)';
 } finally {
 if (statusEl) setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
 if (btn) btn.disabled = false;
 }
}

function loadDemo() {
 const demoRows = [
 ['Identificador','Link licitación','Fecha actualización','Estado','Número de expediente','Objeto del Contrato','Valor estimado del contrato','Presupuesto base sin impuestos','Presupuesto base con impuestos','CPV','Lugar de ejecución','Órgano de Contratación','Enlace al Perfil de Contratante del OC','Tipo de Administración','Código Postal','Tipo de procedimiento','Fecha de presentación de ofertas','Número de expediente','Lote','Objeto licitación/lote','Presupuesto base con impuestos licitación/lote','Presupuesto base sin impuestos licitación/lote','CPV licitación/lote','Lugar ejecución licitación/lote','Resultado licitación/lote','Número de ofertas recibidas por licitación/lote','Precio de la oferta más baja por licitación/lote','Precio de la oferta más alta por licitación/lote','Se han excluído ofertas por ser anormalmente bajas por licitación/lote','Número del contrato licitación/lote','Adjudicatario licitación/lote','Identificador Adjudicatario de la licitación/lote','El adjudicatario es o no PYME de la licitación/lote','Importe adjudicación sin impuestos licitación/lote','Importe adjudicación con impuestos licitación/lote'],
 ['10691965','https://ejemplo.es/1','31/08/2022','Pendiente de adjudicación','B032-2022-00016','Servicio de Comunicación del Ayuntamiento de Elorrio','100.055,25 €','33.351,75 €','40.355,62 €','72600000','ES213','Junta de Gobierno Local - Ayuntamiento de Elorrio','https://ejemplo.es/perfil1','Entidad Local','48230','Abierto','23/07/2022 14:00','B032-2022-00016','1','Servicio de Comunicación','40.355,62 €','33.351,75 €','72600000','ES213','Adjudicado','4','28.000,00 €','38.000,00 €','No','CT-001','COMUNICACIÓN Y MÁS SL','B48123456','Sí','28.000,00 €','33.880,00 €']
 ];
 loadData(demoRows, 'datos_demo.csv');
}

(async function initData() {
 console.log('[INIT] Inicializando...');
 const waitForDOM = () => new Promise(resolve => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resolve); else resolve(); });
 await waitForDOM();
 await new Promise(r => setTimeout(r, 500));
 await cargarDatosDesdeSupabase(true);
})();

window.cargarDatosDesdeSupabase = cargarDatosDesdeSupabase;
window.forzarRecargaBBDD = forzarRecargaBBDD;
window.recargarDesdeBBDD = recargarDesdeBBDD;
window.sincronizarDesdeBanner = sincronizarDesdeBanner;
window.loadDemo = loadDemo;
window.setupUpload = setupUpload;
window.updateHeaderStats = updateHeaderStats;
window.buildStats = buildStats;