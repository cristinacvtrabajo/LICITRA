/**
 * routes/sync.js
 * Todas las operaciones de sincronización que requieren service_role key
 * para bypasar RLS en sync_batches y sync_changes.
 *
 * Frontend → POST /api/sync/upload   → sincroniza datos
 * Frontend → POST /api/sync/rollback → revierte un batch
 * Frontend → GET  /api/sync/log      → historial de batches
 * Frontend → DELETE /api/sync/log    → borra entradas del historial
 */

const express = require('express');
const { supabaseAdmin, supabase } = require('../services/supabase-client');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper: verifica que supabaseAdmin esté disponible
function adminClient(res) {
  if (!supabaseAdmin) {
    res.status(500).json({
      success: false,
      error: 'SUPABASE_SERVICE_KEY no configurada en el servidor. Añádela al .env.'
    });
    return null;
  }
  return supabaseAdmin;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sync/upload
// Recibe las filas ya procesadas (formato Supabase snake_case) y las sincroniza.
// Body: { filas: [...], fileName: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload', requireAuth, requireAdmin, async (req, res) => {
  const db = adminClient(res);
  if (!db) return;

  const { filas, fileName } = req.body;
  if (!Array.isArray(filas) || filas.length === 0) {
    return res.status(400).json({ success: false, error: 'Sin filas para sincronizar.' });
  }

  const userEmail = req.session.userEmail || 'desconocido';

  try {
    // 1. Crear batch
    const { data: batch, error: batchErr } = await db
      .from('sync_batches')
      .insert({
        user_email: userEmail,
        file_name: fileName || 'archivo',
        rows_total: filas.length,
        status: 'applying',
      })
      .select()
      .single();
    if (batchErr) throw batchErr;

    let rowsInserted = 0;
    let rowsUpdated = 0;
    const BATCH = 500;

    // 2. Procesar en lotes
    for (let i = 0; i < filas.length; i += BATCH) {
      const lote = filas.slice(i, i + BATCH);
      const ids = lote.map(f => f.identificador);

      // Traer existentes para detectar insert vs update
      const { data: existentes, error: selErr } = await db
        .from('licitaciones_filtradas')
        .select('identificador, fecha_actualizacion')
        .in('identificador', ids);
      if (selErr) throw selErr;

      const existMap = new Map((existentes || []).map(r => [Number(r.identificador), r]));

      // Registrar cambios para posible rollback
      // Obtenemos old_row completo solo para las que se van a actualizar
      const toUpdateIds = lote
        .filter(r => existMap.has(Number(r.identificador)))
        .map(r => r.identificador);

      let oldRowsMap = new Map();
      if (toUpdateIds.length > 0) {
        const { data: oldRows } = await db
          .from('licitaciones_filtradas')
          .select('*')
          .in('identificador', toUpdateIds);
        (oldRows || []).forEach(r => oldRowsMap.set(Number(r.identificador), r));
      }

      const cambios = lote.map(nueva => {
        const old = oldRowsMap.get(Number(nueva.identificador)) || null;
        return {
          batch_id: batch.id,
          identificador: Number(nueva.identificador),
          action: old ? 'update' : 'insert',
          old_row: old,
          new_row: nueva,
        };
      });

      const { error: chErr } = await db.from('sync_changes').insert(cambios);
      if (chErr) throw chErr;

      // Upsert de datos
      const { error: upErr } = await db
        .from('licitaciones_filtradas')
        .upsert(lote, { onConflict: 'identificador', ignoreDuplicates: false });
      if (upErr) throw upErr;

      lote.forEach(r => {
        if (existMap.has(Number(r.identificador))) rowsUpdated++;
        else rowsInserted++;
      });
    }

    // 3. Cerrar batch
    await db
      .from('sync_batches')
      .update({ rows_inserted: rowsInserted, rows_updated: rowsUpdated, status: 'applied' })
      .eq('id', batch.id);

    res.json({
      success: true,
      batchId: batch.id,
      rowsTotal: filas.length,
      rowsInserted,
      rowsUpdated,
    });

  } catch (err) {
    console.error('[sync/upload] Error:', err);
    res.status(500).json({ success: false, error: err.message || 'Error en sincronización' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sync/rollback
// Body: { batchId: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/rollback', requireAuth, requireAdmin, async (req, res) => {
  const db = adminClient(res);
  if (!db) return;

  const { batchId } = req.body;
  if (!batchId) return res.status(400).json({ success: false, error: 'batchId requerido' });

  try {
    const BATCH = 200;
    let from = 0;
    let totalInserts = 0, totalUpdates = 0;

    while (true) {
      const { data: changes, error: selErr } = await db
        .from('sync_changes')
        .select('action, old_row, identificador')
        .eq('batch_id', batchId)
        .range(from, from + BATCH - 1);

      if (selErr) throw selErr;
      if (!changes || changes.length === 0) break;

      const toDelete = changes.filter(c => c.action === 'insert').map(c => c.identificador);
      const toRestore = changes.filter(c => c.action === 'update' && c.old_row).map(c => c.old_row);

      if (toDelete.length) {
        const { error: delErr } = await db
          .from('licitaciones_filtradas')
          .delete()
          .in('identificador', toDelete);
        if (delErr) throw delErr;
        totalInserts += toDelete.length;
      }

      if (toRestore.length) {
        const { error: upErr } = await db
          .from('licitaciones_filtradas')
          .upsert(toRestore, { onConflict: 'identificador', ignoreDuplicates: false });
        if (upErr) throw upErr;
        totalUpdates += toRestore.length;
      }

      if (changes.length < BATCH) break;
      from += BATCH;
    }

    await db.from('sync_batches').update({ status: 'rolled_back' }).eq('id', batchId);

    res.json({ success: true, totalInserts, totalUpdates });

  } catch (err) {
    console.error('[sync/rollback] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync/log
// ─────────────────────────────────────────────────────────────────────────────
router.get('/log', requireAuth, requireAdmin, async (req, res) => {
  const db = adminClient(res);
  if (!db) return;

  try {
    // 1. Traer los últimos 10 batches (sin join pesado)
    const { data: batches, error: bErr } = await db
      .from('sync_batches')
      .select('id, created_at, file_name, user_email, status, rows_total, rows_inserted, rows_updated')
      .order('created_at', { ascending: false })
      .limit(10);

    if (bErr) throw bErr;
    if (!batches || batches.length === 0) return res.json({ success: true, data: [] });

    // 2. Contar inserts/updates por batch en una sola query agregada
    const batchIds = batches.map(b => b.id);
    const { data: counts, error: cErr } = await db
      .from('sync_changes')
      .select('batch_id, action')
      .in('batch_id', batchIds);

    if (cErr) {
      // Si falla el conteo (timeout u otro error), devolver batches sin contadores
      console.warn('[sync/log] No se pudieron cargar contadores:', cErr.message);
      const data = batches.map(b => ({ ...b, sync_changes: [] }));
      return res.json({ success: true, data });
    }

    // 3. Agrupar contadores por batch_id
    const countMap = {};
    (counts || []).forEach(c => {
      if (!countMap[c.batch_id]) countMap[c.batch_id] = [];
      countMap[c.batch_id].push({ action: c.action });
    });

    const data = batches.map(b => ({
      ...b,
      sync_changes: countMap[b.id] || [],
    }));

    res.json({ success: true, data });

  } catch (err) {
    console.error('[sync/log] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/sync/log
// Body: { ids: string[] }  — borrar entradas específicas
// Body: { ids: 'all' }     — limpiar todo
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/log', requireAuth, requireAdmin, async (req, res) => {
  const db = adminClient(res);
  if (!db) return;

  const { ids } = req.body;
  if (!ids || (Array.isArray(ids) && ids.length === 0)) {
    return res.status(400).json({ success: false, error: 'ids requerido' });
  }

  try {
    let chErr, bErr;

    if (ids === 'all') {
      ({ error: chErr } = await db.from('sync_changes').delete().neq('batch_id', '00000000-0000-0000-0000-000000000000'));
      ({ error: bErr } = await db.from('sync_batches').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
    } else {
      ({ error: chErr } = await db.from('sync_changes').delete().in('batch_id', ids));
      ({ error: bErr } = await db.from('sync_batches').delete().in('id', ids));
    }

    if (chErr) throw chErr;
    if (bErr) throw bErr;

    res.json({ success: true });

  } catch (err) {
    console.error('[sync/log DELETE] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync/backup
// Devuelve TODAS las filas de licitaciones_filtradas para exportar backup.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/backup', requireAuth, requireAdmin, async (req, res) => {
  const db = adminClient(res);
  if (!db) return;

  const from  = parseInt(req.query.from  || '0',    10);
  const batch = parseInt(req.query.batch || '1000', 10);

  try {
    const { data, error } = await db
      .from('licitaciones_filtradas')
      .select('*')
      .order('identificador', { ascending: true })
      .range(from, from + batch - 1);

    if (error) throw error;

    res.json({ success: true, data: data || [], hasMore: (data || []).length === batch });

  } catch (err) {
    console.error('[sync/backup] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync/datos
// Carga licitaciones desde Supabase usando supabaseAdmin (bypasa RLS).
// Query params: from (offset, default 0), batch (tamaño, default 2000)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/datos', requireAuth, async (req, res) => {
  const db = adminClient(res);
  if (!db) return;

  const from  = parseInt(req.query.from  || '0',    10);
  const batch = parseInt(req.query.batch || '2000', 10);

  const COLS = [
    'identificador', 'fecha_actualizacion', 'estado',
    'numero_de_expediente', 'objeto_del_contrato', 'organo_de_contratac_',
    'tipo_de_procedimiento', 'resultado_licitacion_l_',
    'adjudicatario_licitaci_',
    'importe_adjudicacio_1_',
    'presupuesto_base_c_', 'presupuesto_base_c2_',
    'presupuesto_base_si_', 'presupuesto_base_si2_',
    'valor_estimado_del_',
  ].join(',');

  // Reintento automático con lote más pequeño si falla por timeout
  const intentos = [batch, Math.floor(batch / 2), Math.floor(batch / 4)];

  for (const tamano of intentos) {
    try {
      const { data, error } = await db
        .from('licitaciones_filtradas')
        .select(COLS)
        .order('identificador', { ascending: true })
        .range(from, from + tamano - 1);

      if (error) {
        if (error.code === '57014') continue; // timeout → reintentar con lote menor
        throw error;
      }

      return res.json({ success: true, data: data || [], hasMore: (data || []).length === tamano, batchUsed: tamano });

    } catch (err) {
      if (err.code === '57014' || err.message?.includes('timeout')) continue;
      console.error('[sync/datos] Error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Si todos los reintentos fallaron
  return res.status(500).json({ success: false, error: 'Timeout al cargar datos. Intenta de nuevo.' });
});


// Upsert masivo de filas (para restaurar backup). No registra en sync_batches.
// Body: { rows: [...] }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/restore', requireAuth, requireAdmin, async (req, res) => {
  const db = adminClient(res);
  if (!db) return;

  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, error: 'Sin filas para restaurar.' });
  }

  const BATCH = 500;
  let procesados = 0;

  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const lote = rows.slice(i, i + BATCH);
      const { error } = await db
        .from('licitaciones_filtradas')
        .upsert(lote, { onConflict: 'identificador', ignoreDuplicates: false });
      if (error) throw error;
      procesados += lote.length;
    }
    res.json({ success: true, procesados });
  } catch (err) {
    console.error('[sync/restore] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync/stats
// Devuelve KPIs agregados via RPC SQL (una sola query, eficiente con 100k+ filas).
// Requiere la función licitlab_stats() creada en Supabase SQL Editor.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  const db = adminClient(res);
  if (!db) return;

  try {
    const { data, error } = await db.rpc('licitlab_stats');
    if (error) throw error;
    if (!data || (Array.isArray(data) && data.length === 0)) throw new Error('RPC sin datos');

    const row = Array.isArray(data) ? data[0] : data;
    res.json({
      success: true,
      stats: {
        total:          Number(row.total)          || 0,
        importeTotal:   Number(row.importe_total)  || 0,
        adjudicados:    Number(row.adjudicados)    || 0,
        organos:        Number(row.organos)        || 0,
        adjudicatarios: Number(row.adjudicatarios) || 0,
      }
    });

  } catch (rpcErr) {
    console.warn('[sync/stats] RPC licitlab_stats no disponible, usando fallback:', rpcErr.message);
    // Fallback: solo COUNT (query ligera, sin importe ni distincts pesados)
    try {
      const { count: total, error: cntErr } = await db
        .from('licitaciones_filtradas')
        .select('*', { count: 'exact', head: true });
      if (cntErr) throw cntErr;
      const { count: adjudicados } = await db
        .from('licitaciones_filtradas')
        .select('*', { count: 'exact', head: true })
        .not('adjudicatario_licitaci_', 'is', null)
        .neq('adjudicatario_licitaci_', '');
      res.json({
        success: true,
        stats: { total: total || 0, importeTotal: 0, adjudicados: adjudicados || 0, organos: 0, adjudicatarios: 0 },
        warning: 'Crea la función licitlab_stats() en Supabase para ver importe y distintos.',
      });
    } catch (fallbackErr) {
      res.status(500).json({ success: false, error: rpcErr.message });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync/tabla
// Devuelve una página de registros con filtros y ordenación server-side.
// Query params: from, batch, search, estado, tipo, sort, dir
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tabla', requireAuth, async (req, res) => {
  const db = adminClient(res);
  if (!db) return;

  const from   = parseInt(req.query.from  || '0',  10);
  const batch  = parseInt(req.query.batch || '50', 10);
  const search = (req.query.search || '').trim();
  const estado = (req.query.estado || '').trim();
  const tipo   = (req.query.tipo   || '').trim();
  const sort   = (req.query.sort   || 'identificador').trim();
  const dir    = req.query.dir === 'desc' ? false : true; // ascending

  // Mapa de keys JS → columnas Supabase para ordenación
  const SORT_MAP = {
    id:                 'identificador',
    expediente:         'numero_de_expediente',
    fechaActualizacion: 'fecha_actualizacion',
    objeto:             'objeto_del_contrato',
    organo:             'organo_de_contratac_',
    tipoProcedimiento:  'tipo_de_procedimiento',
    estado:             'estado',
    _importeConIVA:     'importe_adjudicacio_1_',
    adjudicatario:      'adjudicatario_licitaci_',
    resultadoLote:      'resultado_licitacion_l_',
  };

  const COLS = [
    'identificador', 'numero_de_expediente', 'fecha_actualizacion', 'estado',
    'objeto_del_contrato', 'organo_de_contratac_', 'tipo_de_procedimiento',
    'resultado_licitacion_l_', 'adjudicatario_licitaci_',
    'importe_adjudicacio_1_', 'importe_adjudicacio_2_',
    'presupuesto_base_c_', 'presupuesto_base_c2_',
    'presupuesto_base_si_', 'presupuesto_base_si2_',
    'valor_estimado_del_',
  ].join(',');

  const sortCol = SORT_MAP[sort] || 'identificador';

  try {
    // ── Query de datos ──────────────────────────────────────────────────────
    let query = db
      .from('licitaciones_filtradas')
      .select(COLS, { count: 'exact' })
      .order(sortCol, { ascending: dir })
      .range(from, from + batch - 1);

    if (estado) query = query.eq('estado', estado);
    if (tipo)   query = query.eq('tipo_de_procedimiento', tipo);
    if (search) {
      // Búsqueda en objeto, órgano y adjudicatario con ilike
      query = query.or(
        `objeto_del_contrato.ilike.%${search}%,organo_de_contratac_.ilike.%${search}%,adjudicatario_licitaci_.ilike.%${search}%,numero_de_expediente.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ success: true, data: data || [], total: count || 0 });

  } catch (err) {
    console.error('[sync/tabla] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync/filtros
// Devuelve los valores distintos de estado y tipo_de_procedimiento para los
// selectores de filtro del frontend.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/filtros', requireAuth, async (req, res) => {
  const db = adminClient(res);
  if (!db) return;

  try {
    const [{ data: estadosData, error: eErr }, { data: tiposData, error: tErr }] = await Promise.all([
      db.from('licitaciones_filtradas').select('estado').not('estado', 'is', null).neq('estado', ''),
      db.from('licitaciones_filtradas').select('tipo_de_procedimiento').not('tipo_de_procedimiento', 'is', null).neq('tipo_de_procedimiento', ''),
    ]);

    if (eErr) throw eErr;
    if (tErr) throw tErr;

    const estados = [...new Set((estadosData || []).map(r => r.estado).filter(v =>
      v && v.length <= 60 && !v.includes('http') && !v.includes(',') && !v.includes(';')
    ))].sort();

    const tipos = [...new Set((tiposData || []).map(r => r.tipo_de_procedimiento).filter(Boolean))].sort();

    res.json({ success: true, estados, tipos });

  } catch (err) {
    console.error('[sync/filtros] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;