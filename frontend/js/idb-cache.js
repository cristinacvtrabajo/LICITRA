/*
   LICIT·LAB — idb-cache.js
   Caché persistente basado en IndexedDB.

   Por qué IndexedDB en lugar de sessionStorage/localStorage:
     • sessionStorage se borra al cerrar el tab → descarga Supabase cada vez.
     • localStorage tiene límite de ~5 MB; una BBDD grande lo supera.
     • IndexedDB es permanente entre sesiones, sin límite práctico de tamaño
       y sin bloquear el hilo principal.

   Política de invalidación:
     • El caché dura INDEFINIDAMENTE hasta que se llame a idbInvalidate().
     • idbInvalidate() se llama automáticamente tras cualquier operación
       que modifique Supabase: sync, rollback, restaurar copia de seguridad.
     • El usuario puede forzar recarga manualmente con el botón "Recargar BBDD",
       que llama a cargarDatosDesdeSupabase(true) / cargarDesdeBBDD(true).

   API pública:
     idbSet(key, value)   → guarda un valor (cualquier objeto JS estructurado)
     idbGet(key)          → devuelve el valor o null si no existe
     idbDel(key)          → elimina una clave
     idbClear()           → borra toda la store
     idbInvalidate()      → alias de idbClear(); llámalo tras escribir en Supabase

   Claves estándar del proyecto:
     IDB_KEY_DATA_ROWS    → filas para la pestaña Datos  (formato [header, ...rows])
     IDB_KEY_FILENAME     → nombre de fichero mostrado
     IDB_KEY_BBDD_ROWS    → filas para la pestaña BBDD   (objetos JS normalizados)
*/

const IDB_DB_NAME    = 'licitlab-cache';
const IDB_DB_VERSION = 1;
const IDB_STORE      = 'kv';

// Claves estándar
const IDB_KEY_DATA_ROWS = 'supabase_rows';
const IDB_KEY_FILENAME  = 'supabase_filename';
const IDB_KEY_BBDD_ROWS = 'bbdd_rows';

/** Abre (o crea) la base de datos IndexedDB. */
function _idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'k' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

/** Guarda `value` bajo `key`. */
async function idbSet(key, value) {
  const db = await _idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ k: key, v: value });
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

/** Lee el valor almacenado bajo `key`. Devuelve null si no existe. */
async function idbGet(key) {
  const db = await _idbOpen();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = e => resolve(e.target.result ? e.target.result.v : null);
    req.onerror   = e => reject(e.target.error);
  });
}

/** Elimina la clave `key` del caché. */
async function idbDel(key) {
  const db = await _idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

/** Borra TODOS los datos del caché. */
async function idbClear() {
  const db = await _idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

/**
 * Invalida el caché completo.
 * Llámalo tras cualquier escritura en Supabase para que la próxima
 * carga descargue datos frescos.
 */
async function idbInvalidate() {
  return idbClear();
}