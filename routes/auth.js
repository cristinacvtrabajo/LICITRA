const express = require('express');
const { supabase } = require('../services/supabase-client');
const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
  }
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    
    req.session.userId = data.user.id;
    req.session.userEmail = data.user.email;
    req.session.userRole = data.user.user_metadata?.role || 'user';
    
    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name || email,
        role: data.user.user_metadata?.role || 'user'
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/session', (req, res) => {
  if (req.session.userId) {
    res.json({
      success: true,
      user: {
        id: req.session.userId,
        email: req.session.userEmail,
        role: req.session.userRole
      }
    });
  } else {
    res.json({ success: false, user: null });
  }
});

router.post('/register', async (req, res) => {
  const { email, password, fullName } = req.body;
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName || email.split('@')[0] } }
    });
    if (error) throw error;
    
    res.json({ success: true, message: 'Usuario registrado. Revisa tu email.' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;