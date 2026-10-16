const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();

const { initDatabase } = require('./src/config/db');

// Importar rutas
const authRoutes = require('./src/routes/auth.routes');
const accountsRoutes = require('./src/routes/accounts.routes');
const crmRoutes = require('./src/routes/crm.routes');
const teamRoutes = require('./src/routes/team.routes');
const billingRoutes = require('./src/routes/billing.routes');
const settingsRoutes = require('./src/routes/settings.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Cabeceras de seguridad HTTP
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('X-Powered-By');
  next();
});

// Configuración de CORS segura con orígenes permitidos
const defaultOrigins = [
  'https://magumcreatorstudiopro.vercel.app',
  'https://magumcreatorstudiopro-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) 
  : defaultOrigins;

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origen (same-origin, curl, server-to-server) o si está en la lista permitida
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    return callback(new Error('Acceso no permitido por política CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-account-id']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Limitador de tasa de solicitudes (Rate Limiter) en memoria para prevenir ataques de fuerza bruta en Login
const loginAttemptsMap = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos
const MAX_LOGIN_ATTEMPTS = 15;

function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const clientData = loginAttemptsMap.get(ip) || { count: 0, firstAttempt: now };

  if (now - clientData.firstAttempt > RATE_LIMIT_WINDOW) {
    clientData.count = 1;
    clientData.firstAttempt = now;
  } else {
    clientData.count++;
  }

  loginAttemptsMap.set(ip, clientData);

  if (clientData.count > MAX_LOGIN_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      message: 'Demasiados intentos de acceso fallidos desde esta dirección IP. Por seguridad, intenta nuevamente en 15 minutos.'
    });
  }

  next();
}

// Limpiar periódicamente el mapa de intentos de inicio de sesión
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttemptsMap.entries()) {
    if (now - data.firstAttempt > RATE_LIMIT_WINDOW) {
      loginAttemptsMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// Healthcheck para Railway y monitoreo
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'MAGUM Creator Studio Backend API',
    database: 'PostgreSQL',
    timestamp: new Date().toISOString()
  });
});

// Montar Rutas de la API
app.use('/api/auth/login', loginRateLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/settings', settingsRoutes);

// Servir frontend estático si se ejecuta en modo integrado o en Railway
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Rutas de fallback para SPA en el frontend
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(frontendPath, 'dashboard.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Manejador global de errores
app.use((err, req, res, next) => {
  console.error('Error no capturado en Express:', err.message || err);
  if (err.message === 'Acceso no permitido por política CORS') {
    return res.status(403).json({ success: false, message: 'Origen no autorizado por CORS.' });
  }
  res.status(500).json({
    success: false,
    message: 'Error interno en el servidor.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Manejo preventivo de excepciones con salida limpia para reinicio por el gestor de procesos
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Promesa no manejada:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Excepción fatal no capturada. Reiniciando proceso limpio...', err);
  process.exit(1);
});

// Iniciar servidor e inicializar base de datos
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`=======================================================`);
  console.log(`🚀 MAGUM Creator Studio Backend activo en puerto ${PORT} (0.0.0.0)`);
  console.log(`🔍 Healthcheck: http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);

  try {
    await initDatabase();
  } catch (err) {
    console.error('Nota: La base de datos se conectará cuando DATABASE_URL esté disponible en Railway/local:', err.message);
  }
});

module.exports = app;
