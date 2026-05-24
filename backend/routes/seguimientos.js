// routes/seguimientos.js — CRUD de licitaciones en seguimiento
'use strict';

const express  = require('express');
const router   = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { enviarNotificacionSeguimiento } = require('../services/email');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ── GET /api/seguimientos ─────────────────────────────────────────────────
// Devuelve todos los seguimientos del usuario en sesión.
router.get('/', requireAuth, async (req, res) => {
  const email = req.session?.userEmail;
  if (!email) return res.status(401).json({ success: false, error: 'Sin sesión' });

  const { data, error } = await supabase
    .from('seguimientos')
    .select('*')
    .eq('user_email', email)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[seguimientos] GET error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true, data: data || [] });
});

// ── POST /api/seguimientos ────────────────────────────────────────────────
// Añade una licitación al seguimiento del usuario.
// Body: { identificador, nombre, expediente, estado, importe }
router.post('/', requireAuth, async (req, res) => {
  const email = req.session?.userEmail;
  if (!email) return res.status(401).json({ success: false, error: 'Sin sesión' });

  const { identificador, nombre, expediente, estado, importe } = req.body;
  if (!identificador) return res.status(400).json({ success: false, error: 'identificador requerido' });

  // Asegurar que identificador sea siempre string (el campo en BD es TEXT)
  const idStr = String(identificador);

  // Borrar registro previo si existe (evita conflicto de constraint compuesto)
  await supabase
    .from('seguimientos')
    .delete()
    .eq('user_email', email)
    .eq('identificador', idStr);

  // Insertar el nuevo seguimiento
  const { error } = await supabase
    .from('seguimientos')
    .insert({ user_email: email, identificador: idStr, nombre, expediente, estado_al_marcar: estado, importe });

  if (error) {
    console.error('[seguimientos] POST error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true });
});

// ── DELETE /api/seguimientos/:identificador ───────────────────────────────
// Elimina una licitación del seguimiento del usuario.
router.delete('/:identificador', requireAuth, async (req, res) => {
  const email = req.session?.userEmail;
  if (!email) return res.status(401).json({ success: false, error: 'Sin sesión' });

  const { identificador } = req.params;

  const { error } = await supabase
    .from('seguimientos')
    .delete()
    .eq('user_email', email)
    .eq('identificador', identificador);

  if (error) {
    console.error('[seguimientos] DELETE error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true });
});

// ── POST /api/seguimientos/test-email ────────────────────────────────────
// Endpoint de prueba (solo admin): envía un email de ejemplo al usuario en sesión.
// Útil para verificar que Resend y las variables de entorno están bien configurados.
router.post('/test-email', requireAdmin, async (req, res) => {
  const sessionEmail = req.session?.userEmail;
  if (!sessionEmail) return res.status(401).json({ success: false, error: 'Sin sesión' });

  // Permite enviar a un email alternativo pasado en el body
  const email = req.body?.to || sessionEmail;

  const cambiosFicticios = [
    {
      nombre:     'Suministro de material informático para dependencias municipales',
      expediente: 'EXP-2024-TEST-001',
      cambios: [
        'Estado: <em>Pendiente de adjudicación</em> → <strong>Adjudicada</strong>',
        'Adjudicatario: <strong>Tecnologías Reunidas S.A.</strong>',
        'Importe adjudicado: <strong>48.500,00 €</strong>',
      ],
    },
    {
      nombre:     'Servicio de limpieza de edificios municipales — Lote 2',
      expediente: 'EXP-2024-TEST-002',
      cambios: [
        'Resultado: <strong>Formalizado</strong>',
      ],
    },
  ];

  try {
    await enviarNotificacionSeguimiento(email, cambiosFicticios, 'licitaciones_test.csv');
    res.json({ success: true, message: `Email de prueba enviado a ${email}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
