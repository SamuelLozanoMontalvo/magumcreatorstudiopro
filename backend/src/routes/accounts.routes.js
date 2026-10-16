const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { verifyToken, requireAdmin, requireClientOrTeam, requireAccountOwnerOrAdmin, resolveAccountId, JWT_SECRET } = require('../middleware/auth');
const { sendInviteEmail, sendEmail } = require('../services/email.service');
const { findGlobalEmailConflict } = require('../utils/user.utils');

function generateAccountId() {
  return 'MGM-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateAdminId() {
  return 'ADM-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ============================================================================
// IDENTIDAD VISUAL POR CUENTA (LOGO, FAVICON, COLORES INDEPENDIENTES)
// ============================================================================

// GET /api/accounts/my-branding - Obtener la identidad visual de la empresa activa
router.get('/my-branding', verifyToken, requireClientOrTeam, async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere una cuenta asociada.' });
    }

    const result = await db.query(
      'SELECT id, business, logo_url as "logoUrl", favicon_url as "faviconUrl", brand_settings as "brandSettings" FROM accounts WHERE id = $1 AND deleted_at IS NULL',
      [accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cuenta no encontrada.' });
    }

    const row = result.rows[0];
    const settings = row.brandSettings || {};
    res.json({
      success: true,
      data: {
        accountId: row.id,
        businessName: row.business,
        logoUrl: row.logoUrl || settings.logoUrl || '',
        faviconUrl: row.faviconUrl || settings.faviconUrl || '',
        colorPrimary: settings.colorPrimary || '#210087',
        colorSecondary: settings.colorSecondary || '#F8F3EB',
        colorBg: settings.colorBg || '#FF00DB'
      }
    });
  } catch (error) {
    console.error('Error en GET /api/accounts/my-branding:', error);
    res.status(500).json({ success: false, message: 'Error al consultar la marca de la cuenta.' });
  }
});

// PUT /api/accounts/my-branding - Guardar marca exclusiva de la empresa activa
router.put('/my-branding', verifyToken, requireAccountOwnerOrAdmin, async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere una cuenta asociada.' });
    }

    const { logoUrl, faviconUrl, businessName, colorPrimary, colorSecondary, colorBg } = req.body;

    const brandSettings = {
      businessName: businessName ? businessName.trim() : undefined,
      colorPrimary: colorPrimary || '#210087',
      colorSecondary: colorSecondary || '#F8F3EB',
      colorBg: colorBg || '#FF00DB',
      updatedAt: new Date().toISOString()
    };

    let query = `
      UPDATE accounts 
      SET logo_url = COALESCE($1, logo_url),
          favicon_url = COALESCE($2, favicon_url),
          brand_settings = $3
    `;
    const params = [
      logoUrl !== undefined ? logoUrl : null,
      faviconUrl !== undefined ? faviconUrl : null,
      JSON.stringify(brandSettings)
    ];

    if (businessName && businessName.trim()) {
      query += `, business = $4 WHERE id = $5 AND deleted_at IS NULL RETURNING id, business, logo_url, favicon_url, brand_settings`;
      params.push(businessName.trim(), accountId);
    } else {
      query += ` WHERE id = $4 AND deleted_at IS NULL RETURNING id, business, logo_url, favicon_url, brand_settings`;
      params.push(accountId);
    }

    const result = await db.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cuenta no encontrada.' });
    }

    const updated = result.rows[0];
    res.json({
      success: true,
      message: 'Identidad visual guardada exclusivamente para esta empresa.',
      data: {
        accountId: updated.id,
        businessName: updated.business,
        logoUrl: updated.logo_url || '',
        faviconUrl: updated.favicon_url || '',
        ...(updated.brand_settings || {})
      }
    });
  } catch (error) {
    console.error('Error en PUT /api/accounts/my-branding:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar la marca de la cuenta.' });
  }
});

// Todas las demás rutas de administración requieren Super Admin
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

    // Comprobar unicidad global del correo: el cliente sí puede tener múltiples empresas, pero no el mismo negocio
    const conflict = await findGlobalEmailConflict(emailClean, {
      allowMultipleAccounts: true,
      business: business.trim()
    });
    if (conflict.conflict) {
      return res.status(400).json({
        success: false,
        message: conflict.message
      });
    }

    const newId = generateAccountId();
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpires = new Date(Date.now() + 48 * 3600 * 1000); // 48 horas

    // Si ya existe otra cuenta para este cliente, reutilizamos su clave existente
    const existingClientRes = await db.query(
      'SELECT password_hash FROM accounts WHERE LOWER(email) = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
      [emailClean]
    );

    let passwordHash = null;
    let isExistingClient = false;

    if (existingClientRes.rows.length > 0 && (!password || !password.trim())) {
      passwordHash = existingClientRes.rows[0].password_hash;
      isExistingClient = true;
    } else {
      const rawPassword = password && password.trim() ? password.trim() : crypto.randomBytes(16).toString('hex');
      passwordHash = await bcrypt.hash(rawPassword, 10);
      if (password && password.trim()) {
        await db.query('UPDATE accounts SET password_hash = $1 WHERE LOWER(email) = $2 AND deleted_at IS NULL', [passwordHash, emailClean]);
      }
    }

    const social = modules && modules.social !== undefined ? Boolean(modules.social) : true;
    const web = modules && modules.web !== undefined ? Boolean(modules.web) : true;
    const crm = true;

    await db.query(`
      INSERT INTO accounts (id, first_name, last_name, business, email, password_hash, module_social, module_web, module_crm, status, invite_token, invite_expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11)
    `, [newId, firstName.trim(), lastName.trim(), business.trim(), emailClean, passwordHash, social, web, crm, inviteToken, inviteExpires]);

    const defaultBaseUrl = (req.headers.origin || req.headers.referer || process.env.FRONTEND_URL || 'https://magumcreatorstudiopro.vercel.app').split('?')[0].replace(/\/+$/, '');
    const defaultSetupUrl = `${defaultBaseUrl}/setup-password.html?token=${encodeURIComponent(inviteToken)}`;

    // Enviar correo de invitación de forma controlada y con timeout
    let emailResult = { success: false, setupUrl: defaultSetupUrl };
    try {
      emailResult = await sendInviteEmail({
        to: emailClean,
        clientName: `${firstName.trim()} ${lastName.trim()}`,
        business: business.trim(),
        inviteToken,
        origin: defaultBaseUrl
      });
    } catch (emailErr) {
      console.warn('[Accounts] No se pudo enviar el correo de bienvenida de inmediato:', emailErr.message);
      emailResult = {
        success: false,
        error: emailErr.message,
        setupUrl: defaultSetupUrl
      };
    }

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
      message: emailResult.success
        ? `Cuenta para "${business.trim()}" creada con éxito. Se envió la invitación al correo.`
        : `Cuenta para "${business.trim()}" creada con éxito.`,
      emailSent: Boolean(emailResult.success),
      emailError: emailResult.error || null,
      inviteUrl: emailResult.setupUrl,
      isExistingClient,
      data: {
        id: newId,
        firstName,
        lastName,
        business: business.trim(),
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

    // Comprobar unicidad global del correo en toda la plataforma
    const conflict = await findGlobalEmailConflict(cleanEmail);
    if (conflict.conflict) {
      return res.status(400).json({
        success: false,
        message: conflict.message
      });
    }

    const existingUsername = await db.query(
      'SELECT id FROM admin_users WHERE LOWER(username) = $1',
      [cleanUsername]
    );

    if (existingUsername.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un administrador con ese nombre de usuario.'
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
router.post('/:id/impersonate', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM accounts WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cuenta no encontrada.' });
    }

    const acc = result.rows[0];

    // Consultar empresas vinculadas a este mismo correo para soportar cambio de cuenta durante simulación
    let availableAccounts = [];
    try {
      const allRes = await db.query(
        `SELECT id, business, first_name, last_name, email, module_social, module_web, module_crm, logo_url, favicon_url 
         FROM accounts 
         WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL AND status = 'active' 
         ORDER BY created_at DESC`,
        [acc.email]
      );
      availableAccounts = allRes.rows.map(a => ({
        id: a.id,
        business: a.business,
        clientName: `${a.first_name} ${a.last_name}`,
        logoUrl: a.logo_url || '',
        faviconUrl: a.favicon_url || '',
        modules: { social: a.module_social, web: a.module_web, crm: a.module_crm }
      }));
    } catch (e) {
      console.warn('Error obteniendo availableAccounts en impersonate:', e.message);
    }

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
        availableAccounts,
        impersonatedByAdmin: true
      }
    });
  } catch (error) {
    console.error('Error en impersonate:', error);
    res.status(500).json({ success: false, message: 'Error al iniciar simulación.' });
  }
});

// POST /api/accounts/test-email - Prueba de envío de correo SMTP / Resend para el Super Admin
router.post('/test-email', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { to } = req.body;
    const targetEmail = to || req.user.email || 'test@example.com';
    const emailResult = await sendEmail({
      to: targetEmail,
      subject: 'Prueba de configuración de correo - Magum Creator Studio',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #210087;">Prueba de Envío Exitosa 🎉</h2>
          <p>Tu servidor de correo en Magum Creator Studio está enviando mensajes correctamente.</p>
          <p><strong>Destinatario:</strong> ${targetEmail}</p>
          <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
        </div>
      `,
      text: `Prueba de configuración de correo exitosa enviada a ${targetEmail} el ${new Date().toLocaleString()}`
    });

    if (emailResult.success) {
      return res.json({
        success: true,
        message: `Correo de prueba enviado con éxito a ${targetEmail} usando ${emailResult.provider || 'servicio configurado'}.`,
        details: emailResult
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Fallo al enviar correo: ${emailResult.error || 'Error desconocido'}`,
        details: emailResult
      });
    }
  } catch (error) {
    console.error('Error en test-email:', error);
    res.status(500).json({ success: false, message: error.message || 'Error al ejecutar prueba de correo.' });
  }
});

// POST /api/accounts/:id/resend-invite - Reenviar invitación o generar nuevo enlace para activar cuenta
router.post('/:id/resend-invite', async (req, res) => {
  try {
    const { id } = req.params;
    const accRes = await db.query('SELECT * FROM accounts WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (accRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cuenta no encontrada.' });
    }

    const acc = accRes.rows[0];
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpires = new Date(Date.now() + 48 * 3600 * 1000);

    await db.query(
      'UPDATE accounts SET invite_token = $1, invite_expires_at = $2 WHERE id = $3',
      [inviteToken, inviteExpires, id]
    );

    const defaultBaseUrl = (req.headers.origin || req.headers.referer || process.env.FRONTEND_URL || 'https://magumcreatorstudiopro.vercel.app').split('?')[0].replace(/\/+$/, '');
    const defaultSetupUrl = `${defaultBaseUrl}/setup-password.html?token=${encodeURIComponent(inviteToken)}`;

    let emailResult = { success: false, setupUrl: defaultSetupUrl };
    try {
      emailResult = await sendInviteEmail({
        to: acc.email,
        clientName: `${acc.first_name} ${acc.last_name}`,
        business: acc.business,
        inviteToken,
        origin: defaultBaseUrl
      });
    } catch (err) {
      console.warn('[Accounts] Error reenviando correo de bienvenida:', err.message);
      emailResult = {
        success: false,
        error: err.message,
        setupUrl: defaultSetupUrl
      };
    }

    res.json({
      success: true,
      message: emailResult.success
        ? `Correo de invitación enviado con éxito a ${acc.email}.`
        : `Enlace de activación generado correctamente.`,
      emailSent: Boolean(emailResult.success),
      emailError: emailResult.error || null,
      inviteUrl: emailResult.setupUrl
    });
  } catch (error) {
    console.error('Error en POST /api/accounts/:id/resend-invite:', error);
    res.status(500).json({ success: false, message: 'Error al generar enlace de invitación.' });
  }
});

module.exports = router;
