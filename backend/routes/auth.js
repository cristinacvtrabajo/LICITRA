const express = require('express');
const { supabase, supabaseAdmin } = require('../services/supabase-client');
const router = express.Router();

// ── LOGIN ──────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    req.session.userId    = data.user.id;
    req.session.userEmail = data.user.email;
    req.session.userRole  = data.user.user_metadata?.role || 'user';

    // Guardar sesión explícitamente antes de responder
    // Evita race condition donde el cliente hace la siguiente petición
    // antes de que express-session haya persistido los datos.
    req.session.save((err) => {
      if (err) return res.status(500).json({ success: false, error: 'Error al crear sesión' });
      res.json({
        success: true,
        user: {
          id:    data.user.id,
          email: data.user.email,
          name:  data.user.user_metadata?.full_name || email,
          role:  data.user.user_metadata?.role || 'user'
        }
      });
    });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});

// ── LOGOUT ─────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ── SESIÓN ─────────────────────────────────────────────────────────────────
router.get('/session', (req, res) => {
  if (req.session.userId) {
    res.json({
      success: true,
      user: {
        id:    req.session.userId,
        email: req.session.userEmail,
        role:  req.session.userRole
      }
    });
  } else {
    res.json({ success: false, user: null });
  }
});

// ── REGISTRO ───────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const {
    tipo, email, password,
    // Profesional
    nombre_apellidos, telefono, dni_nif, direccion_fiscal, pais,
    especialidad, anios_experiencia, portfolio_web,
    // Empresa
    nombre_empresa, cif, persona_contacto, cargo_contacto,
    num_empleados, sector, web_empresa
  } = req.body;

  // Validaciones obligatorias comunes
  if (!tipo || !email || !password)
    return res.status(400).json({ success: false, error: 'Tipo, email y contraseña son obligatorios' });

  if (!['profesional', 'empresa'].includes(tipo))
    return res.status(400).json({ success: false, error: 'Tipo de cuenta no válido' });

  if (password.length < 8)
    return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });

  // Validaciones específicas por tipo
  if (tipo === 'profesional' && !nombre_apellidos)
    return res.status(400).json({ success: false, error: 'El nombre y apellidos son obligatorios' });

  if (tipo === 'empresa' && !nombre_empresa)
    return res.status(400).json({ success: false, error: 'El nombre de la empresa es obligatorio' });

  try {
    // 1. Crear usuario en Supabase Auth
    const fullName = tipo === 'profesional' ? nombre_apellidos : nombre_empresa;
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: process.env.FRONTEND_URL || 'http://localhost:5173'
      }
    });
    if (authError) throw authError;

    const userId = data.user.id;

    // 2. Construir objeto perfil (null en campos no aplicables)
    const perfil = {
      id:   userId,
      tipo,
      email_contacto:   email,
      telefono:         telefono         || null,
      direccion_fiscal: direccion_fiscal || null,
      pais:             pais             || null,

      // Profesional
      nombre_apellidos:  tipo === 'profesional' ? nombre_apellidos        : null,
      dni_nif:           tipo === 'profesional' ? (dni_nif || null)       : null,
      especialidad:      tipo === 'profesional' ? (especialidad || null)  : null,
      anios_experiencia: tipo === 'profesional' ? (anios_experiencia ? parseInt(anios_experiencia) : null) : null,
      portfolio_web:     tipo === 'profesional' ? (portfolio_web || null) : null,

      // Empresa
      nombre_empresa:   tipo === 'empresa' ? nombre_empresa              : null,
      cif:              tipo === 'empresa' ? (cif || null)               : null,
      persona_contacto: tipo === 'empresa' ? (persona_contacto || null)  : null,
      cargo_contacto:   tipo === 'empresa' ? (cargo_contacto || null)    : null,
      num_empleados:    tipo === 'empresa' ? (num_empleados || null)     : null,
      sector:           tipo === 'empresa' ? (sector || null)            : null,
      web_empresa:      tipo === 'empresa' ? (web_empresa || null)       : null,
    };

    const { error: perfilError } = await supabaseAdmin.from('perfiles').insert(perfil);

    if (perfilError) {
      // Limpiar usuario huérfano si falla el perfil
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw perfilError;
    }

    res.json({ success: true, message: 'Cuenta creada correctamente. Revisa tu email para confirmar la cuenta.' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── RECUPERAR CONTRASEÑA ───────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res.status(400).json({ success: false, error: 'El email es obligatorio' });

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.FRONTEND_URL || 'http://localhost:5173'
    });
    if (error) throw error;
    res.json({ success: true, message: 'Si el correo existe, recibirás un enlace en breve.' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;