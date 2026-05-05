const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== IMPORTAR ROUTERS ==========
const authRoutes = require('./routes/auth');
const analisisRoutes = require('./routes/analisis');
const syncRoutes = require('./routes/sync');
const iaRoutes = require('./routes/ia');
const documentosRouter = require('./routes/documentos');  // ← NUEVO

// ========== MIDDLEWARES ==========
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sesiones
app.use(session({
  secret: process.env.SESSION_SECRET || 'licitlab-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// ========== RUTAS API ==========
app.use('/api/auth', authRoutes);
app.use('/api/analisis', analisisRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/documentos', documentosRouter);  // ← NUEVA RUTA

// ========== ARCHIVOS ESTÁTICOS ==========
// Servir el frontend (Vite) desde la carpeta correcta
app.use(express.static(path.join(__dirname, 'frontend')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== SPA FALLBACK ==========
// Todas las rutas no-API → index.html (para Vue Router)
app.use((req, res, next) => {
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
  } else {
    next();
  }
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║   🚀 LICIT·LAB Server                                  ║
║   📡 Puerto: ${PORT}                                      ║
║   🌐 URL: http://localhost:${PORT}                       ║
╚════════════════════════════════════════════════════════╝
  `);
});