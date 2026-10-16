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

// Función para inicializar tablas y seed si la BD está vacía
async function initDatabase() {
  let client = null;
  try {
    client = await pool.connect();
    console.log('✅ Conexión establecida con PostgreSQL. Verificando esquema...');

    await client.query(`
      -- 1. Tabla de Cuentas de Clientes (Tenants)
      CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(10) PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        business VARCHAR(150) NOT NULL,
        email VARCHAR(150) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        module_social BOOLEAN DEFAULT TRUE,
        module_web BOOLEAN DEFAULT TRUE,
        module_crm BOOLEAN DEFAULT TRUE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- 2. Tabla de Profesionales / Equipo con acceso a la cuenta
      CREATE TABLE IF NOT EXISTS professionals (
        id VARCHAR(10) PRIMARY KEY,
        account_id VARCHAR(10) REFERENCES accounts(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        role VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        schedule VARCHAR(150),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- 3. Tabla de Contactos del CRM (con soporte de Borrado Suave / Soft Delete)
      CREATE TABLE IF NOT EXISTS crm_contacts (
        id VARCHAR(20) PRIMARY KEY,
        account_id VARCHAR(10) REFERENCES accounts(id) ON DELETE CASCADE,
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

      -- 4. Tabla de Facturación y Planes (CRM del Admin)
      CREATE TABLE IF NOT EXISTS billing (
        id VARCHAR(20) PRIMARY KEY,
        account_id VARCHAR(10) REFERENCES accounts(id) ON DELETE SET NULL,
        client_name VARCHAR(150) NOT NULL,
        business VARCHAR(150) NOT NULL,
        plan VARCHAR(50) NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        start_date DATE NOT NULL,
        modules VARCHAR(150),
        notes TEXT,
        payment_status VARCHAR(30) DEFAULT 'paid',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- 5. Tabla de Ajustes del Sistema y Marca
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(80) PRIMARY KEY,
        setting_value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- 6. Tabla de Administradores de la Plataforma (Super Admin puede crear otros administradores)
      CREATE TABLE IF NOT EXISTS admin_users (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(30) DEFAULT 'admin',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Migraciones automáticas: Multi-cuenta por email, borrado suave y soporte de UUIDs
      ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_email_key;
      ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE professionals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

      -- Ampliación de columnas de ID para UUIDs
      ALTER TABLE accounts ALTER COLUMN id TYPE VARCHAR(60);
      ALTER TABLE professionals ALTER COLUMN id TYPE VARCHAR(60);
      ALTER TABLE professionals ALTER COLUMN account_id TYPE VARCHAR(60);
      ALTER TABLE crm_contacts ALTER COLUMN id TYPE VARCHAR(60);
      ALTER TABLE crm_contacts ALTER COLUMN account_id TYPE VARCHAR(60);
      ALTER TABLE billing ALTER COLUMN id TYPE VARCHAR(60);
      ALTER TABLE billing ALTER COLUMN account_id TYPE VARCHAR(60);
      ALTER TABLE admin_users ALTER COLUMN id TYPE VARCHAR(60);
    `);

    // Garantizar que el Super Administrador inicial exista en PostgreSQL si la tabla está vacía
    try {
      const adminCountRes = await client.query('SELECT COUNT(*) FROM admin_users');
      const adminCount = parseInt(adminCountRes.rows[0].count, 10);
      if (adminCount === 0) {
        const initialPass = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'MagumAdmin#2030';
        const adminHash = await bcrypt.hash(initialPass, 10);
        await client.query(`
          INSERT INTO admin_users (id, name, username, email, password_hash, role)
          VALUES 
            ('ADM-SAMY01', 'Samy Lozano', 'samylozano', 'samylozano00@gmail.com', $1, 'admin'),
            ('ADM-MCS01', 'Super Administrador', 'mcsadmin', 'mcsadmin@magum.com', $1, 'admin')
          ON CONFLICT (email) DO NOTHING;
        `, [adminHash]);
        console.log('👑 Administradores iniciales registrados en PostgreSQL.');
      }
    } catch (e) {
      console.warn('Aviso al verificar administradores iniciales:', e.message);
    }

    console.log('✅ Esquema de base de datos verificado y listo.');
  } catch (error) {
    console.error('❌ Error al inicializar tablas en PostgreSQL:', error.message || error);
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initDatabase
};
