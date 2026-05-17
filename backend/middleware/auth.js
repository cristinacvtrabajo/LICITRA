function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }

  req.user = {
    id: req.session.userId,
    email: req.session.userEmail || null,
    role: req.session.userRole || null
  };

  next();
}

// Solo Admin
function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }
  if (req.session?.userRole !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acceso restringido a Administradores.' });
  }
  next();
}

// Manager o Admin
function requireManagerOrAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }
  const role = req.session?.userRole;
  if (role !== 'admin' && role !== 'manager') {
    return res.status(403).json({ success: false, error: 'Acceso restringido a Manager o Administrador.' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireManagerOrAdmin
};