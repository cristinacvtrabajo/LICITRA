const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// ── Sesiones persistentes (PostgreSQL/Supabase) ──────────────
const _dbUrl = process.env.DATABASE_URL || '';
const _dbUrlReady = _dbUrl && !_dbUrl.includes('TU-PASSWORD');

let sessionStore;
if (_dbUrlReady) {
  const pgSession = require('connect-pg-simple')(session);
  sessionStore = new pgSession({
    conString: _dbUrl,
    tableName: 'session',
    createTableIfMissing: true,
    ttl: 7 * 24 * 60 * 60
  });
  console.log('  Sesiones: PostgreSQL (Supabase)');
} else {
  console.warn('  Sesiones: memoria RAM');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ========== IMPORTAR ROUTERS ==========
const authRoutes        = require('./routes/auth');
const analisisRoutes    = require('./routes/analisis');
const syncRoutes        = require('./routes/sync');
const iaRoutes          = require('./routes/ia');
const documentosRouter  = require('./routes/documentos');
const seguimientosRoutes = require('./routes/seguimientos');

// ========== MIDDLEWARES ==========
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sesiones
app.use(session({
  secret: process.env.SESSION_SECRET || 'licitra-secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore || undefined,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// ========== RATE LIMITING ==========
// Solo para endpoints costosos o sensibles — NUNCA para session check.

// Login: proteccion contra fuerza bruta (100 intentos / 15 min por IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' }
});

// Sync escritura: solo para operaciones que modifican datos (10 / 15 min)
// Las lecturas (backup, tabla, stats) no se limitan — son operaciones internas legítimas.
const syncWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas sincronizaciones. Espera unos minutos.' }
});

// IA: protege credito de Groq (20 / 15 min)
const iaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de peticiones IA alcanzado. Espera unos minutos.' }
});

// Aplicar limitadores solo donde tienen sentido
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', loginLimiter);
// /api/sync/upload sin límite — la sincronización puede tardar y enviar muchos lotes
// /api/sync/restore sin límite — igual que upload, envía muchos lotes al restaurar un backup
app.use('/api/sync/rollback', syncWriteLimiter);  // rollback
app.use('/api/ia', iaLimiter);
// /api/sync/backup, /tabla, /stats, /filtros, /log -> sin límite (lecturas internas)
// /api/auth/session NO tiene rate limit — se llama en cada carga de pagina

// ========== RUTAS API ==========
app.use('/api/auth', authRoutes);
app.use('/api/analisis', analisisRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/documentos', documentosRouter);
app.use('/api/seguimientos', seguimientosRoutes);

// ========== ARCHIVOS ESTATICOS ==========
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== SPA FALLBACK ==========
app.use((req, res, next) => {
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  } else {
    next();
  }
});

// ========== MIDDLEWARE GLOBAL DE ERRORES ==========
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', req.method, req.path, '->', err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: status === 500
      ? 'Error interno del servidor. Intentalo de nuevo.'
      : err.message || 'Error inesperado.'
  });
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
  const store = _dbUrlReady ? 'PostgreSQL (Supabase)' : 'memoria RAM';
  console.log('');
  console.log('  LICITRA Server arrancado');
  console.log('  Puerto  : ' + PORT);
  console.log('  URL     : http://localhost:' + PORT);
  console.log('  Sesiones: ' + store);
  console.log('');
});
