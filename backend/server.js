const express = require('express');
const cors = require('cors');
const path = require('path');
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

// Configuración de Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

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
  console.error('Error no capturado:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno en el servidor.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Iniciar servidor e inicializar base de datos
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 MAGUM Creator Studio Backend activo en puerto ${PORT}`);
  console.log(`🌐 URL Local: http://localhost:${PORT}`);
  console.log(`🔍 Healthcheck: http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);

  // Auto-creación de tablas y seed en PostgreSQL
  try {
    await initDatabase();
  } catch (err) {
    console.error('Nota: La base de datos se conectará cuando DATABASE_URL esté disponible en Railway/local.');
  }
});

module.exports = app;
