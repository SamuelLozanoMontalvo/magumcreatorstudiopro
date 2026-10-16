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

// Configurar trust proxy para que req.ip reconozca la IP real del cliente detrás de Railway/Cloudflare/Envoy
app.set('trust proxy', 1);

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

// Healthcheck para Railway y monitoreo
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'online',
    service: 'MAGUM Creator Studio Backend API',
    database: 'PostgreSQL',
    timestamp: new Date().toISOString()
  });
});

// Montar Rutas de la API (El rate limiting de intentos fallidos opera dentro de auth.routes)
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

app.get('/setup-password', (req, res) => {
  res.sendFile(path.join(frontendPath, 'setup-password.html'));
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

// Manejo preventivo de excepciones con salida limpia
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
    console.error('Error iniciando la base de datos:', err.message);
  }
});

module.exports = app;
