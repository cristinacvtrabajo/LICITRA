// routes/sync.js - Versión completa con SERVICE_ROLE y todas las columnas reales
const { enviarNotificacionSeguimiento } = require('../services/email');
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireManagerOrAdmin, requireAdmin } = require('../middleware/auth');

// Usar SERVICE_ROLE KEY (bypass RLS completamente)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false }
  }
);

console.log('[sync] VERSION 3 — tablas reales: sync_batches + sync_changes + subidas_log');

// ==================== GET /api/sync/tabla ====================
router.get('/tabla', requireManagerOrAdmin, async (req, res) => {
  try {
    const from = parseInt(req.query.from) || 0;
    const batch = parseInt(req.query.batch) || 50;
    const search = req.query.search || '';
    const estado = req.query.estado || '';
    const tipo = req.query.tipo || '';
    const sort = req.query.sort || '';
    const dir = req.query.dir === 'desc' ? 'desc' : 'asc';

    let query = supabase
      .from('licitaciones_filtradas')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(`identificador.ilike.%${search}%,link_licitacion.ilike.%${search}%,enlace_al_perfil_de_.ilike.%${search}%,objeto_del_contrato.ilike.%${search}%,adjudicatario_licitaci_.ilike.%${search}%`);
    }
    if (estado) query = query.eq('estado', estado);
    if (tipo)   query = query.eq('tipo_de_procedimiento', tipo);

    const sortMap = {
      'identificador':    'identificador',
      'estado':           'estado',
      'fecha_actualizacion': 'fecha_actualizacion',
      'adjudicatario':    'adjudicatario_licitaci_',
      'organo':           'organo_de_contratac_',
      'tipoProcedimiento':'tipo_de_procedimiento',
      '_importeConIVA':   'importe_adjudicacio_1_'
    };
    const sortColumn = sortMap[sort] || 'identificador';
    query = query.order(sortColumn, { ascending: dir === 'asc' });
    query = query.range(from, from + batch - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ success: true, data: data || [], total: count || 0 });
  } catch (error) {
    console.error('[sync] /tabla error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GET /api/sync/stats ====================
router.get('/stats', requireManagerOrAdmin, async (req, res) => {
  try {
    const { count: total, error: totalError } = await supabase
      .from('licitaciones_filtradas')
      .select('*', { count: 'exact', head: true });
    if (totalError) throw totalError;

    const { data: importeData, error: importeError } = await supabase
      .from('licitaciones_filtradas')
      .select('importe_adjudicacio_1_');
    if (importeError) throw importeError;

    let importeTotal = 0;
    if (importeData) {
      importeTotal = importeData.reduce((sum, row) => {
        let valor = row.importe_adjudicacio_1_;
        if (valor === null || valor === undefined || valor === '') return sum;
        if (typeof valor === 'string') {
          valor = valor.replace(/[€,\s]/g, '').trim();
          if (valor === '') return sum;
          valor = parseFloat(valor);
        }
        return sum + (isNaN(valor) ? 0 : valor);
      }, 0);
    }

    let adjudicados = 0;
    try {
      const { count, error: e } = await supabase
        .from('licitaciones_filtradas')
        .select('*', { count: 'exact', head: true })
        .not('adjudicatario_licitaci_', 'is', null)
        .neq('adjudicatario_licitaci_', '');
      if (!e) adjudicados = count || 0;
    } catch (_) {}

    let organos = 0;
    try {
      const { data: d, error: e } = await supabase
        .from('licitaciones_filtradas')
        .select('organo_de_contratac_')
        .not('organo_de_contratac_', 'is', null)
        .neq('organo_de_contratac_', '');
      if (!e && d) organos = new Set(d.map(r => r.organo_de_contratac_)).size;
    } catch (_) {}

    let adjudicatarios = 0;
    try {
      const { data: d, error: e } = await supabase
        .from('licitaciones_filtradas')
        .select('adjudicatario_licitaci_')
        .not('adjudicatario_licitaci_', 'is', null)
        .neq('adjudicatario_licitaci_', '');
      if (!e && d) adjudicatarios = new Set(d.map(r => r.adjudicatario_licitaci_)).size;
    } catch (_) {}

    let pendientes = 0;
    try {
      const { count, error: e } = await supabase
        .from('licitaciones_filtradas')
        .select('*', { count: 'exact', head: true })
        .ilike('estado', '%pendiente%');
      if (!e) pendientes = count || 0;
    } catch (_) {}

    let pymes = 0;
    try {
      const { data: d, error: e } = await supabase
        .from('licitaciones_filtradas')
        .select('adjudicatario_licitaci_')
        .eq('el_adjudicatario_es_', 'true')
        .not('adjudicatario_licitaci_', 'is', null)
        .neq('adjudicatario_licitaci_', '');
      if (!e && d) pymes = new Set(d.map(r => r.adjudicatario_licitaci_)).size;
    } catch (_) {}

    console.log('[sync] Stats calculados:', { total, importeTotal, adjudicados, pendientes, organos, adjudicatarios, pymes });
    res.json({
      success: true,
      stats: { total: total || 0, importeTotal: importeTotal || 0, adjudicados: adjudicados || 0,
               pendientes: pendientes || 0, organos: organos || 0, adjudicatarios: adjudicatarios || 0, pymes: pymes || 0 }
    });
  } catch (error) {
    console.error('[sync] /stats error:', error);
    res.json({ success: true, stats: { total: 0, importeTotal: 0, adjudicados: 0, pendientes: 0, organos: 0, adjudicatarios: 0, pymes: 0 } });
  }
});

// ==================== GET /api/sync/filtros ====================
router.get('/filtros', requireManagerOrAdmin, async (req, res) => {
  try {
    const { data: estadosData, error: estadosError } = await supabase
      .from('licitaciones_filtradas')
      .select('estado')
      .not('estado', 'is', null)
      .neq('estado', '');
    if (estadosError) throw estadosError;
    const estados = estadosData ? [...new Set(estadosData.map(r => r.estado))].sort() : [];

    const { data: tiposData, error: tiposError } = await supabase
      .from('licitaciones_filtradas')
      .select('tipo_de_procedimiento')
      .not('tipo_de_procedimiento', 'is', null)
      .neq('tipo_de_procedimiento', '');
    if (tiposError) throw tiposError;
    const tipos = tiposData ? [...new Set(tiposData.map(r => r.tipo_de_procedimiento))].sort() : [];

    res.json({ success: true, estados, tipos });
  } catch (error) {
    console.error('[sync] /filtros error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GET /api/sync/log ====================
// Devuelve los batches de subida (sync_batches), más recientes primero.
router.get('/log', requireManagerOrAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sync_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[sync] /log error:', error);
    res.json({ success: true, data: [] });
  }
});

// ==================== DELETE /api/sync/log ====================
router.delete('/log', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) {
      return res.status(400).json({ success: false, error: 'Se requiere array de IDs' });
    }
    // sync_changes tiene FK a sync_batches — borrar primero los cambios
    await supabase.from('sync_changes').delete().in('batch_id', ids);
    const { error } = await supabase.from('sync_batches').delete().in('id', ids);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('[sync] DELETE /log error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== POST /api/sync/rollback ====================
router.post('/rollback', requireAdmin, async (req, res) => {
  try {
    const { batchId } = req.body;
    if (!batchId) {
      return res.status(400).json({ success: false, error: 'Se requiere batchId' });
    }

    // Obtener los cambios del batch
    const { data: changes, error: changesError } = await supabase
      .from('sync_changes')
      .select('*')
      .eq('batch_id', batchId);
    if (changesError) throw changesError;

    let totalInserts = 0;
    let totalUpdates = 0;

    for (const change of (changes || [])) {
      if (change.action === 'insert') {
        const { error: deleteError } = await supabase
          .from('licitaciones_filtradas')
          .delete()
          .eq('identificador', change.identificador);
        if (!deleteError) totalInserts++;
      } else if (change.action === 'update' && change.old_row) {
        const oldData = { ...change.old_row };
        const { error: updateError } = await supabase
          .from('licitaciones_filtradas')
          .update(oldData)
          .eq('identificador', change.identificador);
        if (!updateError) totalUpdates++;
      }
    }

    await supabase.from('sync_batches').update({ status: 'rolled_back' }).eq('id', batchId);

    res.json({ success: true, totalInserts, totalUpdates });
  } catch (error) {
    console.error('[sync] /rollback error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== POST /api/sync/upload ====================
router.post('/upload', requireAdmin, async (req, res) => {
  try {
    const { filas, fileName } = req.body;
    const userEmail = req.session?.user?.email || 'admin';

    if (!filas || !Array.isArray(filas) || filas.length === 0) {
      return res.status(400).json({ success: false, error: 'Se requiere un array de filas no vacío.' });
    }

    // 1. IDs de las filas entrantes
    const identificadores = filas
      .map(f => f.identificador)
      .filter(id => id !== null && id !== undefined);

    // 2. Consultar cuáles ya existen para distinguir insert vs update
    const { data: existentes, error: fetchError } = await supabase
      .from('licitaciones_filtradas')
      .select('*')
      .in('identificador', identificadores);
    if (fetchError) throw fetchError;

    const existentesMap = new Map((existentes || []).map(r => [String(r.identificador), r]));

    // 3. Clasificar cambios
    const syncChanges = [];
    for (const fila of filas) {
      const idStr = String(fila.identificador);
      if (!idStr) continue;
      if (existentesMap.has(idStr)) {
        const oldData = { ...existentesMap.get(idStr) };
        syncChanges.push({ action: 'update', id: idStr, old_data: oldData });
      } else {
        syncChanges.push({ action: 'insert', id: idStr });
      }
    }

    // 4. Upsert con reintento si hay columnas desconocidas
    let filasParaEnviar = filas.map(f => ({ ...f }));
    let upsertError = null;
    for (let intento = 0; intento < 10; intento++) {
      const { error } = await supabase
        .from('licitaciones_filtradas')
        .upsert(filasParaEnviar, { onConflict: 'identificador', ignoreDuplicates: false });
      upsertError = error;
      if (!error) break;
      const match = (error.message || '').match(/column ['"]?(\w+)['"]? of/i)
                 || (error.message || '').match(/find the ['"]?(\w+)['"]? column/i);
      if (match && match[1]) {
        const colMala = match[1];
        console.warn(`[sync] /upload: columna '${colMala}' no existe, se omite`);
        filasParaEnviar = filasParaEnviar.map(f => { const r = { ...f }; delete r[colMala]; return r; });
      } else {
        break;
      }
    }
    if (upsertError) throw upsertError;

    const rowsInserted = syncChanges.filter(c => c.action === 'insert').length;
    const rowsUpdated  = syncChanges.filter(c => c.action === 'update').length;

    // 5. Registrar en sync_batches + sync_changes (no crítico)
    let batchId = null;
    try {
      // Crear el batch
      const { data: batchEntry, error: batchError } = await supabase
        .from('sync_batches')
        .insert({
          user_email:    userEmail,
          file_name:     fileName || 'archivo',
          rows_total:    filas.length,
          rows_inserted: rowsInserted,
          rows_updated:  rowsUpdated,
          status:        'completed',
        })
        .select('id')
        .single();

      if (!batchError && batchEntry?.id) {
        batchId = batchEntry.id;
        // Insertar cambios individuales en lotes de 500
        const changesRows = syncChanges.map(c => ({
          batch_id:      batchId,
          identificador: c.id,
          action:        c.action,
          old_row:       c.old_data || null,
          new_row:       null,
        }));
        for (let i = 0; i < changesRows.length; i += 500) {
          await supabase.from('sync_changes').insert(changesRows.slice(i, i + 500));
        }
      }
    } catch (_e) {
      // historial no disponible — no bloquea la subida
    }

    // 6. Registrar también en subidas_log (no crítico)
    try {
      await supabase.from('subidas_log').insert({
        admin_email:    userEmail,
        total_filas:    filas.length,
        nombre_archivo: fileName || 'archivo',
      });
    } catch (_e) {}

    console.log(`[sync] /upload: ${rowsInserted} nuevas, ${rowsUpdated} actualizadas`);
    res.json({ success: true, batchId, rowsInserted, rowsUpdated });

    // 7. Notificaciones de seguimiento (asíncrono, no bloquea la respuesta)
    // Solo notificamos las licitaciones actualizadas (updates), no las nuevas inserts
    _notificarSeguimientos(
      syncChanges.filter(c => c.action === 'update').map(c => c.id),
      fileName || 'archivo'
    ).catch(e => console.error('[sync] Error en notificaciones:', e.message));

  } catch (error) {
    console.error('[sync] /upload error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GET /api/sync/backup ====================
router.get('/backup', requireAuth, async (req, res) => {
  try {
    const from  = parseInt(req.query.from)  || 0;
    const batch = parseInt(req.query.batch) || 1000;

    const { data, error, count } = await supabase
      .from('licitaciones_filtradas')
      .select('*', { count: 'exact' })
      .range(from, from + batch - 1)
      .order('identificador', { ascending: true });

    if (error) throw error;

    const hasMore = (from + batch) < (count || 0);
    res.json({ success: true, data: data || [], hasMore, total: count || 0 });
  } catch (error) {
    console.error('[sync] /backup error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== POST /api/sync/restore ====================
router.post('/restore', requireManagerOrAdmin, async (req, res) => {
  try {
    const { filas } = req.body;
    if (!filas || !Array.isArray(filas)) {
      return res.status(400).json({ success: false, error: 'Se requiere array de filas.' });
    }
    const { error } = await supabase
      .from('licitaciones_filtradas')
      .upsert(filas, { onConflict: 'identificador', ignoreDuplicates: false });
    if (error) throw error;
    res.json({ success: true, total: filas.length });
  } catch (error) {
    console.error('[sync] /restore error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== NOTIFICACIONES DE SEGUIMIENTO ====================
/**
 * Para cada identificador actualizado, comprueba si algún usuario lo tiene
 * en seguimiento y le envía un email con los campos que han cambiado.
 * Se ejecuta de forma asíncrona DESPUÉS de enviar la respuesta HTTP.
 */
async function _notificarSeguimientos(identificadoresActualizados, fileName) {
  if (!identificadoresActualizados.length) return;

  // 1. Buscar seguimientos que coincidan con algún identificador actualizado
  const { data: segs, error: segsError } = await supabase
    .from('seguimientos')
    .select('*')
    .in('identificador', identificadoresActualizados);

  if (segsError || !segs?.length) return;

  // 2. Obtener los datos actuales de esas licitaciones
  const ids = [...new Set(segs.map(s => s.identificador))];
  const { data: actuales, error: actError } = await supabase
    .from('licitaciones_filtradas')
    .select('identificador,estado,adjudicatario_licitaci_,importe_adjudicacio_1_,resultado_licitacion_l_,objeto_del_contrato,numero_de_expediente')
    .in('identificador', ids);

  if (actError || !actuales?.length) return;

  const actualesMap = new Map(actuales.map(r => [String(r.identificador), r]));

  // 3. Agrupar cambios por usuario
  const porUsuario = {};
  for (const seg of segs) {
    const actual = actualesMap.get(String(seg.identificador));
    if (!actual) continue;

    const cambios = [];
    if (seg.estado_al_marcar && actual.estado && seg.estado_al_marcar !== actual.estado)
      cambios.push(`Estado: <em>${seg.estado_al_marcar}</em> → <strong>${actual.estado}</strong>`);
    if (actual.adjudicatario_licitaci_)
      cambios.push(`Adjudicatario: <strong>${actual.adjudicatario_licitaci_}</strong>`);
    if (actual.importe_adjudicacio_1_)
      cambios.push(`Importe adjudicado: <strong>${Number(actual.importe_adjudicacio_1_).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</strong>`);
    if (actual.resultado_licitacion_l_)
      cambios.push(`Resultado: <strong>${actual.resultado_licitacion_l_}</strong>`);

    if (!porUsuario[seg.user_email]) porUsuario[seg.user_email] = [];
    porUsuario[seg.user_email].push({
      nombre:     actual.objeto_del_contrato || seg.nombre || '(sin nombre)',
      expediente: actual.numero_de_expediente || seg.expediente || '—',
      cambios,
    });
  }

  // 4. Enviar un email por usuario
  for (const [email, cambiosList] of Object.entries(porUsuario)) {
    await enviarNotificacionSeguimiento(email, cambiosList, fileName);
  }
}

module.exports = router;
