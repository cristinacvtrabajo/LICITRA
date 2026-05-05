function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ success: false, error: 'No autenticado' });
}

function requireAdmin(req, res, next) {
  if (req.session.userRole === 'admin') return next();
  res.status(403).json({ success: false, error: 'Se requieren permisos de administrador' });
}

module.exports = { requireAuth, requireAdmin };