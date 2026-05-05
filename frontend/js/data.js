/* 
   LICIT·LAB — data.js
   Carga, parsing y normalización de archivos CSV/XLSX.
   También gestiona la mini-zona de upload y los KPIs globales.
   Dependencias: utils.js, config.js, state.js
                 xlsx (CDN global)
   Llama a (tras cargar datos):
     buildColSelector, populateFilters, renderTable  → tab-datos.js
     buildAnalysis                                   → tab-analisis.js
     buildRelaciones                                 → tab-relaciones.js
     resetIATabState, initIATab                      → tab-ia.js
 */

// Recarga limpia desde Supabase: borra caché y recarga la página
async function recargarDesdeBBDD() {
  try { await idbInvalidate(); } catch(_) {}
  location.reload();
}

//  SETUP UPLOAD INICIAL 
function setupUpload() {
  const dz = document.getElementById('dropZone');
  const fi = document.getElementById('fileInput');

  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });

  fi.addEventListener('change', () => {
    if (fi.files[0]) processFile(fi.files[0]);
    fi.value = '';
  });
}

//  PROCESAR ARCHIVO 
function processFile(file) {
  const name = file.name.toLowerCase();
  const reader = new FileReader();

  if (name.endsWith('.csv')) {
    reader.onload = e => {
      const rows = parseCSV(e.target.result);
      loadData(rows, file.name);
    };
    reader.readAsText(file, 'UTF-8');

  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true });

        // Elige la primera hoja que tenga datos
        let ws = null;
        for (const shName of wb.SheetNames) {
          const candidate = wb.Sheets[shName];
          const ref = candidate['!ref'];
          if (ref && ref !== 'A1') { ws = candidate; break; }
        }
        if (!ws) ws = wb.Sheets[wb.SheetNames[0]];

        // Leemos primero la fila de cabeceras
        const rawArray = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy' });
        if (!rawArray || rawArray.length < 2) { loadData(rawArray, file.name); return; }

        // Normalizar: garantizar que TODAS las filas tienen exactamente
        // el mismo número de columnas que la cabecera.
        // Esto corrige Excels donde algunas filas tienen menos columnas
        // (celdas vacías al final omitidas), lo que desplazaría los valores.
        const numCols = rawArray[0].length;
        const normalized = rawArray.map(row => {
          if (row.length === numCols) return row;
          const padded = row.slice(0, numCols);          // recorta si sobra
          while (padded.length < numCols) padded.push(''); // rellena si falta
          return padded;
        });
        loadData(normalized, file.name);
      } catch (err) {
        console.error('Error leyendo XLSX:', err);
        alert('Error al leer el archivo Excel: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);

  } else {
    alert('Formato no soportado. Usa .csv, .xlsx o .xls');
  }
}

//  CSV PARSER 
function parseCSV(text) {
  const firstLine = text.split('\n')[0];
  const sep = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; }
      else if (c === sep && !inQuotes) { cols.push(current.trim()); current = ''; }
      else { current += c; }
    }
    cols.push(current.trim());
    return cols;
  });
}

//  CARGAR DATOS 
function loadData(rows, filename, fromBBDD = false) {
  if (!rows || rows.length < 2) {
    alert('El archivo no tiene datos suficientes.');
    return;
  }

  // Limpia cabeceras: quita columnas completamente vacías del final
  const headerRow = rows[0].map(h => String(h).trim());
  let lastNonEmpty = headerRow.length - 1;
  while (lastNonEmpty > 0 && !headerRow[lastNonEmpty]) lastNonEmpty--;
  rawHeaders = headerRow.slice(0, lastNonEmpty + 1);

  // Si viene de BBDD, las columnas ya vienen en el orden de COL_MAP, así que mapeamos por índice
  if (fromBBDD) {
    colMapping = {};
    for (let i = 0; i < rawHeaders.length; i++) {
      const key = (COL_MAP[i] && COL_MAP[i].key) ? COL_MAP[i].key : null;
      if (key) colMapping[key] = [i];
    }
  } else {
    buildColMapping();
  }
function loadData(rows, filename, fromBBDD = false) {
  // ... tu código existente ...
  
  // Notificar a Vue que los datos cambiaron
  if (window.updateVueData) {
    window.updateVueData(allData)
  }
}

  // Ajusta columnas visibles a las que realmente existen en el archivo cargado
  const availableKeys = new Set(getAvailableCols().map(c => c.key));
  visibleCols = visibleCols.filter(k => availableKeys.has(k));
  if (!visibleCols.length) visibleCols = ['objeto'];

  allData = rows.slice(1)
    .filter(r => r.some(c => String(c).trim()))
    .map(row => normalizeRow(row));

  //  Ordenar por fecha de actualización descendente (más recientes primero) 
  allData.sort((a, b) => {
    const parseFecha = (v) => {
      if (!v) return 0;
      const s = String(v).trim();
      // Formato ISO (desde BBDD): "2024-05-15T..." → Date.parse funciona directamente
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).getTime();
      // Formato dd/mm/yyyy [HH:MM[:SS]]
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (m) {
        const [, dd, MM, yyyy, hh = 0, mi = 0, ss = 0] = m;
        return new Date(
          Number(yyyy) < 100 ? Number(yyyy) + 2000 : Number(yyyy),
          Number(MM) - 1, Number(dd), Number(hh), Number(mi), Number(ss)
        ).getTime();
      }
      return 0;
    };
    return parseFecha(b.fechaActualizacion) - parseFecha(a.fechaActualizacion);
  });

  filteredData = [...allData];

  // Actualizar UI de upload
  document.getElementById('uploadArea').innerHTML = buildMiniUpload(filename, fromBBDD);
  setupMiniUpload();
  document.getElementById('dataSection').style.display = 'block';

  // Mostrar banner de sync sólo si es archivo local
  const banner = document.getElementById('syncBanner');
  if (banner) {
    if (!fromBBDD) {
      document.getElementById('syncBannerTitle').textContent =
        `"${filename}" cargado — ${allData.length} licitaciones`;
      document.getElementById('syncBannerStatus').textContent = '';
      document.getElementById('syncBannerBtn').disabled = false;
      document.getElementById('syncBannerBtn').textContent = '↑ Sincronizar con BBDD';
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  // Actualizar todos los módulos
  updateHeaderStats();
  buildStats();
  buildColSelector();
  populateFilters();
  renderTable();
  buildAnalysis();

  // Inicializar pestaña IA
  resetIATabState();
  initIATab();
}

//  MINI-UPLOAD (tras cargar archivo) 
function buildMiniUpload(filename, fromBBDD = false) {
  const icon = fromBBDD ? '' : '';
  return `
    <div class="upload-mini" style="cursor:default">
      <span class="upload-mini-icon">${icon}</span>
      <div class="upload-mini-text" style="flex:1">
        Datos cargados: <strong>${filename}</strong>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" style="font-size:.72rem;white-space:nowrap"
          onclick="document.getElementById('fileInputMini').click()">
           Otro archivo
        </button>
        <button class="btn btn-ghost btn-sm" style="font-size:.72rem;white-space:nowrap"
          onclick="recargarDesdeBBDD()">
           Recargar BBDD
        </button>
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

//  SINCRONIZAR DESDE BANNER
async function sincronizarDesdeBanner() {
  const btn    = document.getElementById('syncBannerBtn');
  const status = document.getElementById('syncBannerStatus');

  if (!allData || allData.length === 0) return;
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  btn.textContent = '⏳ Sincronizando...';
  status.textContent = '';
  status.style.color = 'var(--text2)';

  try {
    if (!window.currentUser) throw new Error('Sin sesión activa');

    const fileName = document.querySelector('.upload-mini-text strong')?.textContent || 'archivo';

    const filasRaw = allData
      .filter(r => r.id && String(r.id).trim())
      .map(r => {
        const fila = {};
        Object.entries(KEY_TO_COL).forEach(([jsKey, colName]) => {
          fila[colName] = normalizeForSupabase(jsKey, r[jsKey]);
        });
        if (fila.identificador !== null && fila.identificador !== undefined) {
          const n = Number(fila.identificador);
          fila.identificador = Number.isFinite(n) ? n : null;
        }
        return fila;
      })
      .filter(f => f.identificador !== null);

    if (!filasRaw.length) throw new Error('Ninguna fila tiene el campo Identificador');

    // Deduplicar por identificador: gana la fila con fecha_actualizacion más reciente
    const seenIds = new Map();
    filasRaw.forEach(f => {
      const existing = seenIds.get(f.identificador);
      if (!existing) {
        seenIds.set(f.identificador, f);
      } else {
        const fechaNueva = new Date(f.fecha_actualizacion  || 0).getTime();
        const fechaExist = new Date(existing.fecha_actualizacion || 0).getTime();
        if (fechaNueva > fechaExist) seenIds.set(f.identificador, f);
      }
    });
    const filas = Array.from(seenIds.values());

    status.textContent = `Enviando ${filas.length} registros al servidor…`;

    // Enviar al servidor (usa supabaseAdmin, bypasa RLS)
    const resp = await fetch('/api/sync/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ filas, fileName }),
    });

    const result = await resp.json();
    if (!resp.ok || !result.success) throw new Error(result.error || `Error del servidor (${resp.status})`);

    // Invalidar caché y recargar
    try { await idbInvalidate(); } catch(_) {}

    status.textContent = ` ${filas.length} registros sincronizados. Recargando datos…`;
    status.style.color = 'var(--green)';
    btn.textContent = ' Sincronizado';

    await cargarDatosDesdeSupabase(true);

  } catch(err) {
    status.textContent = ` Error: ${err.message}`;
    status.style.color = 'var(--red)';
    btn.disabled = false;
    btn.textContent = '↑ Reintentar';
  }
}

//  CARGAR DESDE SUPABASE
//  CARGAR DESDE SUPABASE (caché permanente en IndexedDB)
/*
   Estrategia:
   • Sin forzar: lee IndexedDB → si hay datos, carga instantáneo SIN tocar Supabase.
   • Con forzar (forzar=true): ignora caché, descarga de Supabase y actualiza IDB.
   • El caché es permanente hasta que se llame a idbInvalidate(), lo que ocurre
     automáticamente tras sync, rollback o restaurar copia de seguridad.
   • El usuario puede forzar recarga con el botón "Recargar BBDD".
   • Descarga a través del servidor Node (/api/sync/backup) que usa supabaseAdmin
     para bypasar RLS — nunca usa el cliente anon directamente.
*/
async function cargarDatosDesdeSupabase(forzar = false) {
  const btn      = document.getElementById('btnCargarBBDD');
  const statusEl = document.getElementById('uploadBBDDStatus');
  const msgEl    = document.getElementById('uploadBBDDMsg');

  // ── 1. LEER CACHÉ IndexedDB ──────────────────────────────────────────────
  if (!forzar) {
    try {
      const cachedRows     = await idbGet(IDB_KEY_DATA_ROWS);
      const cachedFilename = await idbGet(IDB_KEY_FILENAME);
      if (cachedRows && cachedRows.length > 1 && cachedFilename) {
        if (statusEl) statusEl.style.display = 'flex';
        if (msgEl)    msgEl.textContent = `Cargando desde caché local (${cachedRows.length - 1} registros)…`;
        loadData(cachedRows, cachedFilename, true);
        if (statusEl) statusEl.style.display = 'none';
        if (btn) btn.disabled = false;
        return;
      }
    } catch(e) {
      console.warn('[idb-cache] Error leyendo caché, recargando de Supabase:', e);
    }
  }

  // ── 2. DESCARGAR VÍA SERVIDOR (bypasa RLS con service_role) ─────────────
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.style.display = 'flex';
  if (msgEl)    msgEl.textContent = 'Conectando con el servidor…';

  try {
    let allRows = [];
    let from    = 0;
    const BATCH = 1000;

    while (true) {
      if (msgEl) msgEl.textContent = `Descargando… ${allRows.length} registros`;

      const resp = await fetch(`/api/sync/backup?from=${from}&batch=${BATCH}`, {
        credentials: 'include'
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || `Error del servidor (${resp.status})`);
      }

      const json = await resp.json();
      if (!json.success) throw new Error(json.error || 'Error cargando datos');

      const data = json.data || [];
      allRows = [...allRows, ...data];

      if (!json.hasMore) break;
      from += data.length || BATCH;
    }

    if (!allRows.length) {
      if (msgEl) msgEl.textContent = 'La base de datos está vacía.';
      try { await idbClear(); } catch(_) {}
      setTimeout(() => {
        if (statusEl) statusEl.style.display = 'none';
        if (btn) btn.disabled = false;
      }, 3000);
      return;
    }

    // Convertir filas Supabase (snake_case) → formato de loadData
    const headerRow = COL_MAP.map(c => c.match[0]);
    const dataRows  = allRows.map(row =>
      COL_MAP.map(col => {
        const colName = KEY_TO_COL[col.key];
        return row[colName] ?? '';
      })
    );
    const rows     = [headerRow, ...dataRows];
    const filename = `Base de datos (${allRows.length} registros)`;

    // ── 3. GUARDAR EN IndexedDB ──────────────────────────────────────────────
    try {
      await idbSet(IDB_KEY_DATA_ROWS, rows);
      await idbSet(IDB_KEY_FILENAME,  filename);
      // Limpiar caché viejo de sessionStorage/localStorage si existía
      try { sessionStorage.removeItem('licitlab_cache'); localStorage.removeItem('licitlab_cache'); } catch(_) {}
    } catch(e) {
      console.warn('[idb-cache] No se pudo guardar en IndexedDB:', e);
    }

    if (msgEl) msgEl.textContent = `${allRows.length} registros recibidos. Procesando…`;
    await new Promise(r => setTimeout(r, 100));

    loadData(rows, filename, true);

  } catch(err) {
    if (msgEl) msgEl.textContent = ` Error: ${err.message}`;
    if (statusEl) statusEl.style.color = 'var(--red)';
    setTimeout(() => {
      if (statusEl) { statusEl.style.display = 'none'; statusEl.style.color = ''; }
      if (btn) btn.disabled = false;
    }, 4000);
    return;
  }

  if (statusEl) statusEl.style.display = 'none';
  if (btn) btn.disabled = false;
}

//  COLUMN MAPPING 

/**
 * Construye colMapping: key interna → [array de índices en rawHeaders].
 * Para cada cabecera, entre todos los COL_MAP que hacen match,
 * gana el patrón coincidente MÁS LARGO (mayor especificidad).
 */
function buildColMapping() {
  colMapping = {};

  // Pre-normalizar todos los patrones una sola vez
  const normalizedCOL_MAP = COL_MAP.map(col => ({
    key: col.key,
    normalizedMatches: col.match.map(m => normHeader(m)),
  }));

  rawHeaders.forEach((header, idx) => {
    const h = normHeader(header);
    if (!h) return;

    let bestKey = null;
    let bestLen = -1;

    for (const col of normalizedCOL_MAP) {
      for (const nm of col.normalizedMatches) {
        if (h.includes(nm) && nm.length > bestLen) {
          bestLen = nm.length;
          bestKey = col.key;
        }
      }
    }

    if (bestKey) {
      if (!colMapping[bestKey]) colMapping[bestKey] = [];
      colMapping[bestKey].push(idx);
    }
  });

  // Diagnóstico opcional (window.DEBUG_COLS = true)
  if (window.DEBUG_COLS) {
    console.group('[LICIT·LAB] Column Mapping Debug');
    console.log('Raw headers detected:');
    rawHeaders.forEach((h, i) => console.log(`  [${i}] ${JSON.stringify(h)} → norm: "${normHeader(h)}"`));
    console.log('\nFinal colMapping:');
    Object.entries(colMapping).forEach(([k, idxs]) => {
      const labels = idxs.map(i => `[${i}] "${rawHeaders[i]}"`).join(', ');
      console.log(`  ${k.padEnd(22)} → ${labels}`);
    });
    console.log('\nUnmapped keys:', COL_MAP.map(c => c.key).filter(k => !colMapping[k]).join(', '));
    console.groupEnd();
  }
}

/** Devuelve solo las columnas que existen en el archivo cargado. */
function getAvailableCols() {
  return COL_MAP.filter(c => Array.isArray(colMapping[c.key]) && colMapping[c.key].length > 0);
}

/**
 * Obtiene el valor de una clave en una fila raw.
 * Si hay múltiples índices mapeados, devuelve el primero no vacío.
 */
function getVal(row, key) {
  const idxs = colMapping[key];
  if (!idxs) return '';

  for (const idx of idxs) {
    if (idx < row.length) {
      const v = String(row[idx] ?? '').trim();
      if (v && v !== 'undefined' && v !== 'null') return v;
    }
  }
  return '';
}

//  NORMALIZAR FILA 
function normalizeRow(row) {
  const obj = { _raw: row };

  COL_MAP.forEach(col => {
    obj[col.key] = getVal(row, col.key);
  });

  // Parsear importes a número para cálculos
  obj._importeConIVA  = parseAmount(obj.importeConIVA)
                     || parseAmount(obj.presupuestoLoteConIVA)
                     || parseAmount(obj.presupuestoConIVA)
                     || parseAmount(obj.importeSinIVA)
                     || parseAmount(obj.presupuestoLoteSinIVA)
                     || parseAmount(obj.presupuestoSinIVA)
                     || 0;
  obj._importeSinIVA  = parseAmount(obj.importeSinIVA)  || parseAmount(obj.presupuestoLoteSinIVA) || parseAmount(obj.presupuestoSinIVA)  || 0;
  obj._valorEstimado  = parseAmount(obj.valorEstimado)  || 0;
  obj._ofertaMasBaja  = parseAmount(obj.ofertaMasBaja)  || 0;
  obj._ofertaMasAlta  = parseAmount(obj.ofertaMasAlta)  || 0;

  if (window.DEBUG_COLS && (window._debugRowCount = (window._debugRowCount || 0) + 1) <= 3) {
    console.log('[LICIT·LAB] Sample row', window._debugRowCount, ':', JSON.stringify(obj, (k, v) => k === '_raw' ? '[raw]' : v));
  }

  return obj;
}

//  HEADER STATS 
function updateHeaderStats() {
  const filename = document.querySelector('.upload-mini-text strong')?.textContent || 'datos';
  document.getElementById('hstatFile').textContent    = filename;
  document.getElementById('hstatCount').textContent   = `${filteredData.length} licitaciones`;
  const total = filteredData.reduce((s, r) => s + (r._importeConIVA || 0), 0);
  document.getElementById('hstatImporte').textContent = formatEUR(total);
}

//  KPI STATS (tarjetas de resumen) 
function buildStats(dataSet = filteredData) {
  // Por defecto, los KPIs reflejan el conjunto FILTRADO (filteredData).
  // Esto hace que se actualicen automáticamente cuando cambian los filtros.
  const data = Array.isArray(dataSet) ? dataSet : [];

  const totalArchivo   = allData.length;
  const total          = data.length;

  const importe        = data.reduce((s, r) => s + (r._importeConIVA || 0), 0);
  const adjudicados    = data.filter(r => r.adjudicatario).length;
  const pendientes     = data.filter(r => /pendiente/i.test(r.estado)).length;
  const pymeCount      = data.filter(r => /s[ií]|yes|true|pyme/i.test(r.esPyme)).length;
  const organos        = new Set(data.map(r => r.organo).filter(Boolean)).size;
  const adjudicatarios = new Set(data.map(r => r.adjudicatario).filter(Boolean)).size;

  const subTotal = totalArchivo ? `de ${totalArchivo}` : '—';

  document.getElementById('statsGrid').innerHTML =
    statCard('lime',   total,              'Total licitaciones',   `${subTotal} (archivo)`) +
    statCard('cyan',   formatEUR(importe), 'Importe total adj.',   'con IVA') +
    statCard('green',  adjudicados,        'Con adjudicatario',    `de ${total}`) +
    statCard('amber',  pendientes,         'Pendientes',           'de adjudicación') +
    statCard('orange', organos,            'Órganos contratantes', 'distintos') +
    statCard('red',    adjudicatarios,     'Adjudicatarios',       'distintos') +
    statCard('lime',   pymeCount,          'PYMES adjudicatarias', 'detectadas');
}


//  DATOS DEMO 
function loadDemo() {
  const demoRows = [
    [
      'Identificador','Link licitación','Fecha actualización','Estado',
      'Número de expediente','Objeto del Contrato','Valor estimado del contrato',
      'Presupuesto base sin impuestos','Presupuesto base con impuestos','CPV',
      'Lugar de ejecución','Órgano de Contratación','Enlace al Perfil de Contratante del OC',
      'Tipo de Administración','Código Postal','Tipo de procedimiento',
      'Fecha de presentación de ofertas',
      'Número de expediente','Lote','Objeto licitación/lote',
      'Presupuesto base con impuestos licitación/lote',
      'Presupuesto base sin impuestos licitación/lote',
      'CPV licitación/lote','Lugar ejecución licitación/lote',
      'Resultado licitación/lote',
      'Número de ofertas recibidas por licitación/lote',
      'Precio de la oferta más baja por licitación/lote',
      'Precio de la oferta más alta por licitación/lote',
      'Se han excluído ofertas por ser anormalmente bajas por licitación/lote',
      'Número del contrato licitación/lote',
      'Adjudicatario licitación/lote',
      'Identificador Adjudicatario de la licitación/lote',
      'El adjudicatario es o no PYME de la licitación/lote',
      'Importe adjudicación sin impuestos licitación/lote',
      'Importe adjudicación con impuestos licitación/lote'
    ],
    ['10691965','https://ejemplo.es/1','31/08/2022','Pendiente de adjudicación',
     'B032-2022-00016','Servicio de Comunicación del Ayuntamiento de Elorrio',
     '100.055,25 €','33.351,75 €','40.355,62 €','72600000','ES213',
     'Junta de Gobierno Local - Ayuntamiento de Elorrio','https://ejemplo.es/perfil1',
     'Entidad Local','48230','Abierto','23/07/2022 14:00',
     'B032-2022-00016','1','Servicio de Comunicación',
     '40.355,62 €','33.351,75 €','72600000','ES213','Adjudicado',
     '4','28.000,00 €','38.000,00 €','No','CT-001',
     'COMUNICACIÓN Y MÁS SL','B48123456','Sí','28.000,00 €','33.880,00 €'],
    ['10691966','https://ejemplo.es/2','15/09/2022','Adjudicado',
     'B033-2022-00020','Mantenimiento de infraestructuras municipales',
     '250.000,00 €','150.000,00 €','181.500,00 €','45000000','ES213',
     'Junta de Gobierno Local - Ayuntamiento de Durango','https://ejemplo.es/perfil2',
     'Entidad Local','48200','Abierto','05/09/2022 14:00',
     'B033-2022-00020','1','Obras de mantenimiento',
     '181.500,00 €','150.000,00 €','45000000','ES213','Adjudicado',
     '6','130.000,00 €','170.000,00 €','No','CT-002',
     'CONSTRUCCIONES BIZKAIA SA','A48987654','No','145.000,00 €','175.450,00 €'],
    ['10691967','https://ejemplo.es/3','20/10/2022','Adjudicado',
     'B034-2022-00031','Servicio de limpieza de edificios municipales',
     '80.000,00 €','50.000,00 €','60.500,00 €','90919000','ES213',
     'Ayuntamiento de Bilbao','https://ejemplo.es/perfil3',
     'Entidad Local','48001','Abierto','20/09/2022 14:00',
     'B034-2022-00031','1','Limpieza edificios',
     '60.500,00 €','50.000,00 €','90919000','ES213','Adjudicado',
     '8','42.000,00 €','58.000,00 €','No','CT-003',
     'LIMPIEZAS NORTE SL','B48555111','Sí','44.000,00 €','53.240,00 €'],
    ['10691968','https://ejemplo.es/4','05/11/2022','Pendiente de adjudicación',
     'B035-2022-00042','Suministro de material informático',
     '120.000,00 €','75.000,00 €','90.750,00 €','30200000','ES213',
     'Diputación Foral de Bizkaia','https://ejemplo.es/perfil4',
     'Diputación Foral','48009','Abierto','05/10/2022 14:00',
     'B035-2022-00042','','','','','','','','','','','','','','','','',''],
    ['10691969','https://ejemplo.es/5','10/12/2022','Adjudicado',
     'B036-2022-00050','Redacción de proyecto urbanístico',
     '500.000,00 €','400.000,00 €','484.000,00 €','71240000','ES213',
     'Junta de Gobierno Local - Ayuntamiento de Bilbao','https://ejemplo.es/perfil5',
     'Entidad Local','48001','Abierto','25/10/2022 14:00',
     'B036-2022-00050','1','Proyecto urbanístico',
     '484.000,00 €','400.000,00 €','71240000','ES213','Adjudicado',
     '3','360.000,00 €','450.000,00 €','No','CT-005',
     'ARQUITECTOS ASOCIADOS SLP','B48222333','No','380.000,00 €','459.800,00 €'],
    ['10691970','https://ejemplo.es/6','15/01/2023','Adjudicado',
     'B037-2022-00065','Servicio de Comunicación del Ayuntamiento de Bilbao',
     '90.000,00 €','60.000,00 €','72.600,00 €','72600000','ES213',
     'Junta de Gobierno Local - Ayuntamiento de Bilbao','https://ejemplo.es/perfil6',
     'Entidad Local','48001','Abierto','25/11/2022 14:00',
     'B037-2022-00065','1','Comunicación 2023',
     '72.600,00 €','60.000,00 €','72600000','ES213','Adjudicado',
     '5','55.000,00 €','65.000,00 €','No','CT-006',
     'COMUNICACIÓN Y MÁS SL','B48123456','Sí','57.000,00 €','68.970,00 €'],
    ['10691971','https://ejemplo.es/7','20/01/2023','Adjudicado',
     'B038-2022-00070','Mantenimiento jardines municipales',
     '45.000,00 €','30.000,00 €','36.300,00 €','77310000','ES213',
     'Ayuntamiento de Getxo','https://ejemplo.es/perfil7',
     'Entidad Local','48990','Negociado sin publicidad','05/12/2022 14:00',
     'B038-2022-00070','1','Jardinería',
     '36.300,00 €','30.000,00 €','77310000','ES213','Adjudicado',
     '2','27.000,00 €','32.000,00 €','No','CT-007',
     'JARDINES DEL NORTE SL','B48777888','Sí','28.000,00 €','33.880,00 €'],
    ['10691972','https://ejemplo.es/8','25/02/2023','Desistida',
     'B039-2022-00080','Consultoría estratégica',
     '200.000,00 €','150.000,00 €','181.500,00 €','73200000','ES213',
     'Diputación Foral de Bizkaia','https://ejemplo.es/perfil8',
     'Diputación Foral','48009','Abierto','20/12/2022 14:00',
     '','','','','','','','','','','','','','','','','',''],
    ['10691973','https://ejemplo.es/9','10/03/2023','Adjudicado',
     'B001-2023-00010','Suministro de vehículos eléctricos',
     '350.000,00 €','280.000,00 €','338.800,00 €','34100000','ES213',
     'Diputación Foral de Bizkaia','https://ejemplo.es/perfil9',
     'Diputación Foral','48009','Abierto','15/02/2023 14:00',
     'B001-2023-00010','1','Vehículos eléctricos',
     '338.800,00 €','280.000,00 €','34100000','ES213','Adjudicado',
     '4','260.000,00 €','300.000,00 €','No','CT-009',
     'MOTOR BIZKAIA SA','A48444555','No','275.000,00 €','332.750,00 €'],
    ['10691974','https://ejemplo.es/10','15/04/2023','Adjudicado',
     'B002-2023-00025','Servicio de limpieza oficinas Diputación',
     '110.000,00 €','88.000,00 €','106.480,00 €','90919000','ES213',
     'Diputación Foral de Bizkaia','https://ejemplo.es/perfil10',
     'Diputación Foral','48009','Abierto','01/03/2023 14:00',
     'B002-2023-00025','1','Limpieza Diputación',
     '106.480,00 €','88.000,00 €','90919000','ES213','Adjudicado',
     '6','75.000,00 €','95.000,00 €','No','CT-010',
     'LIMPIEZAS NORTE SL','B48555111','Sí','82.000,00 €','99.220,00 €'],
    ['10691975','https://ejemplo.es/11','20/05/2023','Adjudicado',
     'B003-2023-00040','Obras de rehabilitación Centro Cultural',
     '750.000,00 €','600.000,00 €','726.000,00 €','45210000','ES213',
     'Ayuntamiento de Bilbao','https://ejemplo.es/perfil11',
     'Entidad Local','48001','Abierto','15/04/2023 14:00',
     'B003-2023-00040','1','Rehabilitación Centro Cultural',
     '726.000,00 €','600.000,00 €','45210000','ES213','Adjudicado',
     '5','540.000,00 €','650.000,00 €','No','CT-011',
     'CONSTRUCCIONES BIZKAIA SA','A48987654','No','580.000,00 €','701.800,00 €'],
    ['10691976','https://ejemplo.es/12','10/06/2023','Adjudicado',
     'B004-2023-00055','Servicio de Comunicación Diputación 2023',
     '130.000,00 €','100.000,00 €','121.000,00 €','72600000','ES213',
     'Diputación Foral de Bizkaia','https://ejemplo.es/perfil12',
     'Diputación Foral','48009','Abierto','01/05/2023 14:00',
     'B004-2023-00055','1','Comunicación Diputación',
     '121.000,00 €','100.000,00 €','72600000','ES213','Adjudicado',
     '3','90.000,00 €','110.000,00 €','No','CT-012',
     'COMUNICACIÓN Y MÁS SL','B48123456','Sí','95.000,00 €','114.950,00 €'],
  ];

  loadData(demoRows, 'datos_demo.csv');
}