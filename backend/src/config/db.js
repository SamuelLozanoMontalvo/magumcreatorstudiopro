const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const isInternal = connectionString && connectionString.includes('railway.internal');
const requiresSsl = Boolean(connectionString && !connectionString.includes('localhost') && !isInternal);

const maskedUrl = connectionString ? connectionString.replace(/:[^:@]+@/, ':****@') : 'NO DEFINIDA (usando localhost fallback)';
console.log('📡 URL de Base de Datos configurada:', maskedUrl);

const pool = new Pool({
  connectionString: connectionString || 'postgresql://postgres:postgres@localhost:5432/magum_creator_studio',
  ssl: requiresSsl ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('❌ Error imprevisto en el pool de PostgreSQL:', err.message);
});

// Función para inicializar tablas y sincronizar credenciales maestras
async function initDatabase() {
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('❌ ERROR FATAL: Ni INITIAL_ADMIN_PASSWORD ni ADMIN_PASSWORD están definidas en las variables de entorno. Se requiere definir una contraseña segura en Railway.');
  }

  let client = null;
  try {
    client = await pool.connect();
    console.log('✅ Conexión establecida con PostgreSQL. Verificando esquema...');

    await client.query(`
      -- 1. Tabla de Cuentas de Clientes (Tenants)
      CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(60) PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        business VARCHAR(150) NOT NULL,
        email VARCHAR(150) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        module_social BOOLEAN DEFAULT TRUE,
        module_web BOOLEAN DEFAULT TRUE,
        module_crm BOOLEAN DEFAULT TRUE,
        status VARCHAR(20) DEFAULT 'active',
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- 2. Tabla de Profesionales / Equipo con acceso a la cuenta
      CREATE TABLE IF NOT EXISTS professionals (
        id VARCHAR(60) PRIMARY KEY,
        account_id VARCHAR(60) REFERENCES accounts(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        role VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        schedule VARCHAR(150),
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- 3. Tabla de Contactos del CRM (con soporte de Borrado Suave / Soft Delete)
      CREATE TABLE IF NOT EXISTS crm_contacts (
        id VARCHAR(60) PRIMARY KEY,
        account_id VARCHAR(60) REFERENCES accounts(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(150) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        age INTEGER,
        company VARCHAR(150),
        segment VARCHAR(30) DEFAULT 'client',
        notes TEXT,
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- 4. Tabla de Facturación y Planes (Soporte prepago, intervalos libres y multi-empresa)
      CREATE TABLE IF NOT EXISTS billing (
        id VARCHAR(60) PRIMARY KEY,
        account_id VARCHAR(60) REFERENCES accounts(id) ON DELETE SET NULL,
        account_ids TEXT[] DEFAULT '{}',
        client_name VARCHAR(150) NOT NULL,
        business VARCHAR(150) NOT NULL,
        plan VARCHAR(50) NOT NULL,
        interval_months INTEGER DEFAULT 1,
        billing_type VARCHAR(30) DEFAULT 'recurring',
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        start_date DATE NOT NULL,
        modules VARCHAR(150),
        notes TEXT,
        payment_status VARCHAR(30) DEFAULT 'paid',
        payment_history JSONB DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- 5. Tabla de Ajustes del Sistema y Marca
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(80) PRIMARY KEY,
        setting_value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- 6. Tabla de Administradores de la Plataforma
      CREATE TABLE IF NOT EXISTS admin_users (
        id VARCHAR(60) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(30) DEFAULT 'admin',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Migraciones automáticas: Multi-cuenta, borrado suave, columnas UUID y soporte extendido de facturación
      ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_email_key;
      ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE professionals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

      ALTER TABLE accounts ALTER COLUMN id TYPE VARCHAR(60);
      ALTER TABLE professionals ALTER COLUMN id TYPE VARCHAR(60);
      ALTER TABLE professionals ALTER COLUMN account_id TYPE VARCHAR(60);
      ALTER TABLE crm_contacts ALTER COLUMN id TYPE VARCHAR(60);
      ALTER TABLE crm_contacts ALTER COLUMN account_id TYPE VARCHAR(60);
      ALTER TABLE billing ALTER COLUMN id TYPE VARCHAR(60);
      ALTER TABLE billing ALTER COLUMN account_id TYPE VARCHAR(60);
      ALTER TABLE admin_users ALTER COLUMN id TYPE VARCHAR(60);

      -- Nuevas columnas de facturación flexible
      ALTER TABLE billing ADD COLUMN IF NOT EXISTS interval_months INTEGER DEFAULT 1;
      ALTER TABLE billing ADD COLUMN IF NOT EXISTS billing_type VARCHAR(30) DEFAULT 'recurring';
      ALTER TABLE billing ADD COLUMN IF NOT EXISTS account_ids TEXT[] DEFAULT '{}';
      ALTER TABLE billing ADD COLUMN IF NOT EXISTS payment_history JSONB DEFAULT '[]';
    `);

    // Actualizar inmediatamente las credenciales de los administradores en PostgreSQL con la nueva clave segura
    // Esto reemplaza cualquier hash de contraseñas expuestas en el historial público anterior de Git
    const adminHash = await bcrypt.hash(adminPassword.trim(), 10);

    await client.query(`
      UPDATE admin_users 
      SET password_hash = $1 
      WHERE username IN ('samylozano', 'mcsadmin') OR email IN ('samylozano00@gmail.com', 'mcsadmin@magum.com');
    `, [adminHash]);

    // Si los administradores no existen todavía, sembrarlos con la nueva contraseña
    await client.query(`
      INSERT INTO admin_users (id, name, username, email, password_hash, role)
      VALUES 
        ('ADM-SAMY01', 'Samy Lozano', 'samylozano', 'samylozano00@gmail.com', $1, 'admin'),
        ('ADM-MCS01', 'Super Administrador', 'mcsadmin', 'mcsadmin@magum.com', $1, 'admin')
      ON CONFLICT (email) DO NOTHING;
    `, [adminHash]);

    console.log('👑 Credenciales de administración sincronizadas y aseguradas en PostgreSQL.');
    console.log('✅ Esquema de base de datos verificado y listo.');
  } catch (error) {
    console.error('❌ Error al inicializar tablas en PostgreSQL:', error.message || error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initDatabase
};
