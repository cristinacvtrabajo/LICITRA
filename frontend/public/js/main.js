/* 
 LICITRA — main.js
 Punto de entrada de la aplicación.
*/

document.addEventListener('DOMContentLoaded', () => {
 setupTabs();
 setupUpload();
 cargarDatosDesdeSupabase();

 // Inicializar pestaña IA
 if (typeof initIATab === 'function') {
 initIATab();
 }
});

// Exponer función para que auth.js la llame tras verificar sesión
window.onAuthReady = function(user) {
 const role = user?.role;
 const canSeeBBDD = role === 'admin' || role === 'manager';

 // Pestaña Base de Datos: solo para manager y admin
 const tabBBDD = document.getElementById('tabBBDD');
 if (tabBBDD) tabBBDD.style.display = canSeeBBDD ? '' : 'none';
};

// SISTEMA DE PESTAÑAS 
function setupTabs() {
 let bbddIniciada = false;

 document.querySelectorAll('.tab').forEach(tab => {
 tab.addEventListener('click', () => {
 const tabId = tab.dataset.tab;
 
 document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
 document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
 tab.classList.add('active');
 document.getElementById('tab-' + tabId).classList.add('active');

 // Iniciar la pestaña BBDD la primera vez que se abre,
 // o reintentar si la carga anterior falló (bbddData vacío)
 if (tabId === 'bbdd') {
 if (!bbddIniciada || (typeof bbddData !== 'undefined' && bbddData.length === 0)) {
 bbddIniciada = true;
 if (typeof initBBDDTab === 'function') {
 initBBDDTab();
 }
 } else if (typeof renderBBDDTable === 'function' && typeof bbddData !== 'undefined' && bbddData.length > 0) {
 // Re-renderizar si ya hay datos (por si se calculó con el contenedor oculto)
 renderBBDDTable();
 }
 // Recalcular siempre los KPIs al abrir la pestaña BBDD,
 // así usan allData (ya cargado en Datos) y coinciden exactamente
 if (typeof mostrarBBDDStats === 'function') mostrarBBDDStats();
 }

 // ========== NUEVO: Inicializar pestaña RELACIONES cuando se abre ==========
 if (tabId === 'relaciones') {
 console.log('[Tabs] Abriendo Relaciones, allData length:', allData?.length);
 
 if (allData && allData.length > 0) {
 // Ya hay datos, construir relaciones
 if (typeof buildRelaciones === 'function') {
 buildRelaciones();
 } else {
 console.warn('[Tabs] buildRelaciones no está definida');
 }
 } else {
 // No hay datos, mostrar mensaje vacío
 const relEmpty = document.getElementById('relEmpty');
 const relContent = document.getElementById('relContent');
 if (relEmpty) relEmpty.style.display = 'block';
 if (relContent) relContent.style.display = 'none';
 }
 }

 // Inicializar pestaña IA cuando se abre
 if (tabId === 'ia') {
 if (typeof resetIATabState === 'function') {
 resetIATabState();
 }
 if (typeof initIATab === 'function') {
 initIATab();
 }
 }

 // Actualizar nombre de archivo en sección admin BBDD
 if (tabId === 'bbdd') {
 actualizarNombreArchivoBBDD();
 }

 // Si se abre la pestaña Vue y ya hay datos, notificar al componente
 if (tabId === 'vue') {
 if (typeof allData !== 'undefined' && allData && allData.length > 0) {
 if (window.updateVueData) window.updateVueData(allData);
 }
 }
 });
 });
}

function actualizarNombreArchivoBBDD() {
 const el = document.getElementById('bbddArchivoNombre');
 if (!el) return;
 const nombre = document.querySelector('.upload-mini-text strong')?.textContent;
 if (nombre && typeof allData !== 'undefined' && allData) {
 el.innerHTML = `<strong style="color:var(--accent)">${nombre}</strong>
 — <span style="color:var(--green)">${allData.length} filas listas para sincronizar</span>`;
 } else {
 el.innerHTML = `Ningún archivo cargado — ve a la pestaña <strong>Datos</strong> y sube un CSV/XLSX primero`;
 }
}

// Cierre de modal con tecla Escape
document.addEventListener('keydown', e => {
 if (e.key === 'Escape') {
 const closeBtn = document.querySelector('.modal-close');
 if (closeBtn) closeBtn.click();
 }
});
