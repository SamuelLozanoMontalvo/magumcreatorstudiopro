const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { verifyToken, requireAdmin, JWT_SECRET } = require('../middleware/auth');
const { sendInviteEmail } = require('../services/email.service');

function generateAccountId() {
  return 'MGM-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateAdminId() {
  return 'ADM-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Todas las rutas requieren Super Admin
router.use(verifyToken, requireAdmin);

// GET /api/accounts - Listar todas las cuentas activas (no eliminadas)
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        id, 
        first_name as "firstName", 
        last_name as "lastName", 
        business, 
        email, 
        status, 
        module_social as "moduleSocial", 
        module_web as "moduleWeb", 
        module_crm as "moduleCrm", 
        created_at as "createdAt"
      FROM accounts 
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);

    const accounts = result.rows.map(acc => ({
      id: acc.id,
      firstName: acc.firstName,
      lastName: acc.lastName,
      business: acc.business,
      email: acc.email,
      status: acc.status,
      modules: {
        social: acc.moduleSocial,
        web: acc.moduleWeb,
        crm: acc.moduleCrm
      },
      createdAt: acc.createdAt ? new Date(acc.createdAt).toISOString().split('T')[0] : ''
    }));

    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    console.error('Error en GET /api/accounts:', error);
    res.status(500).json({ success: false, message: 'Error al obtener cuentas.' });
  }
});

// POST /api/accounts - Crear nueva cuenta de cliente (con invitación al correo para definir clave)
router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, business, email, password, modules, billingPlan, billingAmount, billingNotes } = req.body;

    if (!firstName || !lastName || !business || !email) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, apellido, negocio y correo son obligatorios.'
      });
    }

    const emailClean = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailClean)) {
      return res.status(400).json({ success: false, message: 'Formato de correo no válido.' });
    }

    // Comprobar si ya existe una cuenta con el mismo correo y la misma empresa
    const existsSame = await db.query(
      'SELECT id FROM accounts WHERE LOWER(email) = $1 AND LOWER(business) = $2 AND deleted_at IS NULL',
      [emailClean, business.trim().toLowerCase()]
    );
    if (existsSame.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Ya existe una cuenta para "${business.trim()}" con el correo "${emailClean}".`
      });
    }

    const newId = generateAccountId();
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpires = new Date(Date.now() + 48 * 3600 * 1000); // 48 horas

    // Si el admin escribió una clave manual la usamos; si no, dejamos una provisional hasta que active su enlace
    const rawPassword = password && password.trim() ? password.trim() : crypto.randomBytes(16).toString('hex');
    let passwordHash = await bcrypt.hash(rawPassword, 10);

    // Si ya tiene cuentas previas con ese correo y se definió clave manual, unificar
    if (password && password.trim()) {
      await db.query('UPDATE accounts SET password_hash = $1 WHERE LOWER(email) = $2 AND deleted_at IS NULL', [passwordHash, emailClean]);
    }

    const social = modules && modules.social !== undefined ? Boolean(modules.social) : true;
    const web = modules && modules.web !== undefined ? Boolean(modules.web) : true;
    const crm = true;

    await db.query(`
      INSERT INTO accounts (id, first_name, last_name, business, email, password_hash, module_social, module_web, module_crm, status, invite_token, invite_expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11)
    `, [newId, firstName.trim(), lastName.trim(), business.trim(), emailClean, passwordHash, social, web, crm, inviteToken, inviteExpires]);

    // Enviar correo de invitación con Resend
    sendInviteEmail({
      to: emailClean,
      clientName: `${firstName.trim()} ${lastName.trim()}`,
      business: business.trim(),
      inviteToken,
      origin: req.headers.origin || req.headers.referer
    }).catch(err => console.error('Aviso: Error enviando correo de invitación:', err.message));

    // Registrar facturación SOLO si el admin configuró monto y plan
    if (billingAmount !== undefined && billingAmount !== null && !isNaN(Number(billingAmount))) {
      const plan = billingPlan || 'monthly';
      const amount = parseFloat(billingAmount);
      await db.query(`
        INSERT INTO billing (id, account_id, client_name, business, plan, amount, start_date, modules, notes, payment_status)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, $8, 'paid')
      `, [
        'B-' + crypto.randomUUID(),
        newId,
        `${firstName.trim()} ${lastName.trim()}`,
        business.trim(),
        plan,
        amount,
        `${social ? 'Social Media ' : ''}${web ? 'Web Editor' : ''}`.trim() || 'CRM',
        billingNotes ? billingNotes.trim() : 'Suscripción configurada al crear la cuenta.'
      ]);
    }

    res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente.',
      data: {
        id: newId,
        firstName,
        lastName,
        business,
        email: emailClean,
        modules: { social, web, crm },
        status: 'active'
      }
    });
  } catch (error) {
    console.error('Error en POST /api/accounts:', error);
    res.status(500).json({ success: false, message: 'Error al registrar la cuenta.' });
  }
});

// ============================================================================
// GESTIÓN DE ADMINISTRADORES (SUPER ADMIN)
// ============================================================================

// GET /api/accounts/admins/list - Listar administradores registrados
router.get('/admins/list', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, username, email, role, created_at as "createdAt"
      FROM admin_users
      ORDER BY created_at DESC
    `);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error en GET /api/accounts/admins/list:', error);
    res.status(500).json({ success: false, message: 'Error al obtener administradores.' });
  }
});

// POST /api/accounts/admins - Crear un nuevo administrador
router.post('/admins', async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos (nombre, usuario, correo y contraseña) son obligatorios.'
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Formato de correo no válido.' });
    }

    const existing = await db.query(
      'SELECT id FROM admin_users WHERE LOWER(username) = $1 OR LOWER(email) = $2',
      [cleanUsername, cleanEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un administrador con ese nombre de usuario o correo.'
      });
    }

    const adminId = generateAdminId();
    const passwordHash = await bcrypt.hash(password.trim(), 10);
    const adminRole = role || 'admin';

    await db.query(`
      INSERT INTO admin_users (id, name, username, email, password_hash, role)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [adminId, name.trim(), cleanUsername, cleanEmail, passwordHash, adminRole]);

    res.status(201).json({
      success: true,
      message: 'Administrador creado con éxito.',
      data: {
        id: adminId,
        name: name.trim(),
        username: cleanUsername,
        email: cleanEmail,
        role: adminRole
      }
    });
  } catch (error) {
    console.error('Error en POST /api/accounts/admins:', error);
    res.status(500).json({ success: false, message: 'Error al crear administrador.' });
  }
});

// DELETE /api/accounts/admins/:id - Eliminar un administrador con protección contra auto-eliminación y último admin
router.delete('/admins/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Protección 1: No auto-eliminarse
    if (req.user && req.user.adminId === id) {
      return res.status(400).json({
        success: false,
        message: 'No puedes eliminar tu propia cuenta de administrador en sesión activa.'
      });
    }

    // Protección 2: No eliminar al último administrador
    const countRes = await db.query('SELECT COUNT(*) FROM admin_users');
    const totalAdmins = parseInt(countRes.rows[0].count, 10);
    if (totalAdmins <= 1) {
      return res.status(400).json({
        success: false,
        message: 'No es posible eliminar al único administrador del sistema.'
      });
    }

    const result = await db.query('DELETE FROM admin_users WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Administrador no encontrado.' });
    }

    res.json({
      success: true,
      message: 'Administrador eliminado correctamente.'
    });
  } catch (error) {
    console.error('Error en DELETE /api/accounts/admins/:id:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar administrador.' });
  }
});

// PATCH /api/accounts/:id/status - Alternar estado activo / inactivo
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const accountRes = await db.query('SELECT status FROM accounts WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (accountRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cuenta no encontrada.' });
    }

    const currentStatus = accountRes.rows[0].status;
    const newStatus = (currentStatus === 'active') ? 'inactive' : 'active';

    await db.query('UPDATE accounts SET status = $1 WHERE id = $2', [newStatus, id]);

    res.json({
      success: true,
      message: `Cuenta ${newStatus === 'active' ? 'reactivada' : 'suspendida'} correctamente.`,
      status: newStatus
    });
  } catch (error) {
    console.error('Error en PATCH /api/accounts/:id/status:', error);
    res.status(500).json({ success: false, message: 'Error al cambiar estado.' });
  }
});

// DELETE /api/accounts/:id - Borrado Suave de Cuenta (Consistente con CRM y reversible)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'UPDATE accounts SET deleted_at = CURRENT_TIMESTAMP, status = \'inactive\' WHERE id = $1 AND deleted_at IS NULL RETURNING id, business',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cuenta no encontrada o ya eliminada.' });
    }

    res.json({ success: true, message: `Cuenta "${result.rows[0].business}" archivada/eliminada correctamente.` });
  } catch (error) {
    console.error('Error en DELETE /api/accounts/:id:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar cuenta.' });
  }
});

// POST /api/accounts/:id/impersonate - Vista previa de cliente para el Super Admin
router.post('/:id/impersonate', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM accounts WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cuenta no encontrada.' });
    }

    const acc = result.rows[0];
    const impersonationToken = jwt.sign(
      {
        role: 'client',
        accountId: acc.id,
        email: acc.email,
        clientName: `${acc.first_name} ${acc.last_name}`,
        business: acc.business,
        modules: {
          social: acc.module_social,
          web: acc.module_web,
          crm: acc.module_crm
        },
        impersonatedByAdmin: true
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      token: impersonationToken,
      user: {
        role: 'client',
        accountId: acc.id,
        business: acc.business,
        clientName: `${acc.first_name} ${acc.last_name}`,
        email: acc.email,
        modules: {
          social: acc.module_social,
          web: acc.module_web,
          crm: acc.module_crm
        },
        impersonatedByAdmin: true
      }
    });
  } catch (error) {
    console.error('Error en impersonate:', error);
    res.status(500).json({ success: false, message: 'Error al iniciar simulación.' });
  }
});

module.exports = router;
