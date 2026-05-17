/*
 LICITRA — worker-relaciones.js
 Web Worker: construye el índice de relaciones y responde búsquedas.

 CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR:
 
 [FIX-A] Guard en SEARCH: si el índice todavía no está listo (race condition:
 el usuario escribe antes de que BUILD_INDEX termine), el mensaje se
 encola en `_pendingSearch`. Cuando INDEX_READY se emite, se procesa.
 Antes: `index.pairsWithRisk` → TypeError porque index === null.

 [FIX-B] SEARCH con término vacío ('') devuelve TODOS los pares (sin filtrar),
 lo que permite la carga inicial sin necesidad de un mensaje especial.
 `'cualquier_string'.includes('')` es siempre `true`, así que el
 comportamiento ya era correcto — lo documentamos explícitamente.

 [FIX-C] Extraída función `_handleSearch()` para que tanto el flujo normal
 como el encolado usen exactamente el mismo código.

 [FIX-D] Emitido `{ type: 'ERROR', payload: mensaje }` en lugar de lanzar
 excepciones no capturadas que mataban el worker silenciosamente.
*/

let index = null;
let _pendingSearch = null; // [FIX-A] Búsqueda encolada antes de que el índice esté listo

// Cálculo de riesgo 
function computeRisk(group, totalOrg) {
 const n = group.length;
 const totalAmount = group.reduce((s, r) => s + (r.importeConIVA || 0), 0);
 const avg = n > 0 ? totalAmount / n : 0;
 const concentration = totalOrg > 0 ? n / totalOrg : 0;

 let score = 0;
 if (concentration > 0.8) score += 40;
 if (n >= 5) score += 20;
 if (avg > 100_000) score += 20;
 if (n >= 10) score += 20;

 return { n, totalAmount, avg, concentration, score };
}

// Construcción del índice 
function _buildIndex(allData) {
 const byOrgano = {}; // ko → nº contratos totales del órgano
 const pairs = {}; // 'ko|||ka' → [rows...]

 for (const r of allData) {
 if (!r.organo || !r.adjudicatario) continue;

 const ko = r.organo.toLowerCase();
 const ka = r.adjudicatario.toLowerCase();
 const key = ko + '|||' + ka;

 byOrgano[ko] = (byOrgano[ko] || 0) + 1;

 if (!pairs[key]) pairs[key] = [];
 pairs[key].push(r);
 }

 // Pre-calcular métricas de riesgo para cada par (no re-calcular en cada búsqueda)
 const pairsWithRisk = {};
 for (const [key, group] of Object.entries(pairs)) {
 const [ko] = key.split('|||');
 pairsWithRisk[key] = {
 group,
 risk: computeRisk(group, byOrgano[ko]),
 organo: group[0].organo,
 adjudicatario: group[0].adjudicatario,
 };
 }

 return { pairsWithRisk };
}

// Ejecución de una búsqueda 
// [FIX-C] Función extraída para reutilizar en flujo normal y en cola pendiente
function _handleSearch(payload) {
 // [FIX-D] Guard defensivo — nunca debería llegar aquí sin índice, pero por si acaso
 if (!index) {
 postMessage({ type: 'ERROR', payload: 'SEARCH recibido con índice nulo' });
 return;
 }

 // [FIX-B] term = '' → includes('') siempre true → devuelve todos los pares
 const term = (payload.term || '').toLowerCase();
 const results = [];

 for (const [key, data] of Object.entries(index.pairsWithRisk)) {
 const [ko, ka] = key.split('|||');
 if (!ko.includes(term) && !ka.includes(term)) continue;

 results.push({
 organo: data.organo,
 adjudicatario: data.adjudicatario,
 risk: data.risk,
 contratos: data.group.slice(0, 10) // muestra hasta 10 en el card
 });
 }

 // Ordenar por score descendente (la UI puede re-ordenar después)
 results.sort((a, b) => b.risk.score - a.risk.score);

 postMessage({ type: 'RESULT', payload: results });
}

// Manejador de mensajes 
self.onmessage = function (e) {
 const { type, payload } = e.data;

 // BUILD_INDEX 
 if (type === 'BUILD_INDEX') {
 try {
 index = _buildIndex(payload);
 postMessage({ type: 'INDEX_READY' });

 // [FIX-A] Procesar búsqueda encolada (si el usuario escribió antes de INDEX_READY)
 if (_pendingSearch !== null) {
 const pending = _pendingSearch;
 _pendingSearch = null;
 _handleSearch(pending);
 }
 } catch (err) {
 // [FIX-D] Reportar error en lugar de morir silenciosamente
 postMessage({ type: 'ERROR', payload: 'Error construyendo índice: ' + err.message });
 }
 }

 // SEARCH 
 if (type === 'SEARCH') {
 if (!index) {
 // [FIX-A] Índice aún no listo: encolar y esperar BUILD_INDEX
 _pendingSearch = payload;
 return;
 }
 _handleSearch(payload);
 }
};
