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
        email VARCHAR(150) UNIQUE NOT NULL,
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

      -- Migraciones automáticas: Asegurar que la columna deleted_at existe en tablas existentes
      ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE professionals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    `);

    // Comprobar si ya existe la cuenta seed "AutoMotor Cartagena"
    const existingAccounts = await client.query('SELECT COUNT(*) FROM accounts');
    if (parseInt(existingAccounts.rows[0].count, 10) === 0) {
      console.log('🌱 Base de datos vacía. Insertando datos iniciales de prueba (Seed)...');

      const clientHash = await bcrypt.hash('Auto2026*', 10);
      const seedAccountId = 'MC8K29L';

      await client.query(`
        INSERT INTO accounts (id, first_name, last_name, business, email, password_hash, module_social, module_web, module_crm, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        seedAccountId,
        'Carlos',
        'Mendoza',
        'AutoMotor Cartagena',
        'cliente@automotor.com',
        clientHash,
        true,
        true,
        true,
        'active'
      ]);

      // Seed de Profesionales
      const profHash = await bcrypt.hash('Mateo2026*', 10);
      await client.query(`
        INSERT INTO professionals (id, account_id, name, role, email, password_hash, phone, schedule)
        VALUES 
          ('P-101', $1, 'Ing. Mateo Saldarriaga', 'Jefe de Taller & Diagnóstico', 'mateo@automotor.com', $2, '+57 311 000 1122', 'Lun - Sáb (8:00 AM - 5:00 PM)'),
          ('P-102', $1, 'Andrés Camilo Rojas', 'Mecánico General Senior', 'andres.rojas@automotor.com', $2, '+57 314 222 3344', 'Lun - Vie (8:00 AM - 6:00 PM)')
      `, [seedAccountId, profHash]);

      // Seed de Contactos en CRM
      await client.query(`
        INSERT INTO crm_contacts (id, account_id, name, email, phone, age, company, segment, notes)
        VALUES
          ('C-101', $1, 'Carlos Morales', 'carlos.morales@gmail.com', '+57 310 458 9201', 38, 'Transportes Cartagena', 'vip', 'Mantenimiento de flota vehicular VIP'),
          ('C-102', $1, 'Diana María Rincón', 'diana.rincon@hotmail.com', '+57 315 889 1234', 29, 'Inversiones Luna', 'prospect', 'Solicitó cotización de pastillas de freno'),
          ('C-103', $1, 'Jorge Alberto Vega', 'jvega.transportes@yahoo.com', '+57 301 223 9988', 45, 'Logística Vega SAS', 'inactive', 'Inactivo hace más de 60 días para reactivar'),
          ('C-104', $1, 'Mariana Gómez', 'mariana.gomez@outlook.com', '+57 320 678 4433', 32, 'Independiente', 'client', 'Revisión técnica anual al día')
      `, [seedAccountId]);

      // Seed de Facturación
      await client.query(`
        INSERT INTO billing (id, account_id, client_name, business, plan, amount, start_date, modules, notes, payment_status)
        VALUES
          ('B-101', $1, 'Carlos Mendoza', 'AutoMotor Cartagena', 'monthly', 150000, CURRENT_DATE - INTERVAL '15 days', 'Social Media, Web, CRM', 'Cliente fundador. Pagos siempre puntuales.', 'paid')
      `, [seedAccountId]);

      console.log('✅ Datos iniciales (Seed) insertados con éxito.');
    }

    // Garantizar que la cuenta de Samy Lozano y administradores estén siempre listos en PostgreSQL
    try {
      const samyHash = await bcrypt.hash('Auto2026*', 10);
      await client.query(`
        INSERT INTO accounts (id, first_name, last_name, business, email, password_hash, module_social, module_web, module_crm, status)
        VALUES 
          ('SL7K92X', 'Samuel', 'Lozano', 'AutoMotor Cartagena', 'samylozano00@gmail.com', $1, true, true, true, 'active'),
          ('MC8K29L', 'Carlos', 'Mendoza', 'AutoMotor Cartagena', 'cliente@automotor.com', $1, true, true, true, 'active')
        ON CONFLICT (email) DO NOTHING;
      `, [samyHash]);

      const adminHash = await bcrypt.hash('MagumAdmin#2030', 10);
      await client.query(`
        INSERT INTO admin_users (id, name, username, email, password_hash, role)
        VALUES ('ADM-SAMY01', 'Samy Lozano', 'samylozano', 'samylozano00@gmail.com', $1, 'admin')
        ON CONFLICT (email) DO NOTHING;
      `, [adminHash]);
    } catch (e) {
      console.warn('Aviso al sembrar cuenta de admin:', e.message);
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
