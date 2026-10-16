const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { verifyToken, JWT_SECRET, isIpBlocked, recordFailedAttempt, resetFailedAttempts } = require('../middleware/auth');
const { sendResetCodeEmail, sendPasswordResetLinkEmail } = require('../services/email.service');
require('dotenv').config();

const GENERIC_AUTH_ERROR = 'Usuario, correo o contraseña incorrectos.';

// POST /api/auth/login - Inicio de sesión seguro con protección contra fuerza bruta por IP real
router.post('/login', async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  // Verificar si la IP está bloqueada por exceso de intentos fallidos
  if (isIpBlocked(clientIp)) {
    return res.status(429).json({
      success: false,
      message: 'Demasiados intentos fallidos desde esta dirección IP. Por seguridad, espera 15 minutos.'
    });
  }

  try {
    const { username, email, password, accountId } = req.body;
    const identifier = (username || email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!identifier || !cleanPassword) {
      recordFailedAttempt(clientIp);
      return res.status(400).json({
        success: false,
        message: 'Por favor ingresa usuario/correo y contraseña.'
      });
    }

    // 1. Verificación de Administradores en PostgreSQL (Tabla admin_users)
    try {
      const adminResult = await db.query(
        'SELECT id, name, username, email, password_hash, role FROM admin_users WHERE LOWER(username) = $1 OR LOWER(email) = $1 LIMIT 1',
        [identifier]
      );

      if (adminResult.rows.length > 0) {
        const adminUser = adminResult.rows[0];
        const isMatch = await bcrypt.compare(cleanPassword, adminUser.password_hash);

        if (isMatch) {
          // Éxito: Limpiar contador de intentos fallidos para esta IP
          resetFailedAttempts(clientIp);

          const token = jwt.sign(
            {
              role: 'admin',
              adminId: adminUser.id,
              username: adminUser.username,
              name: adminUser.name,
              email: adminUser.email,
              business: 'MAGUM Platform Hub'
            },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          return res.json({
            success: true,
            message: `Bienvenido, ${adminUser.name}.`,
            token,
            user: {
              role: 'admin',
              adminId: adminUser.id,
              username: adminUser.username,
              name: adminUser.name,
              email: adminUser.email,
              business: 'MAGUM Platform Hub'
            }
          });
        }
      }
    } catch (adminErr) {
      console.warn('[Auth] Error consultando admin_users:', adminErr.message);
    }

    // 2. Verificación de Cuentas de Cliente en PostgreSQL
    try {
      const accountResult = await db.query(
        'SELECT * FROM accounts WHERE LOWER(email) = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
        [identifier]
      );

      if (accountResult.rows.length > 0) {
        let validAccounts = [];

        for (const acc of accountResult.rows) {
          if (acc.status === 'inactive') continue;

          const isMatch = await bcrypt.compare(cleanPassword, acc.password_hash);
          if (isMatch) {
            validAccounts.push(acc);
          }
        }

        if (validAccounts.length === 0) {
          recordFailedAttempt(clientIp);
          const anySuspended = accountResult.rows.some(a => a.status === 'inactive');
          if (anySuspended) {
            for (const acc of accountResult.rows) {
              if (await bcrypt.compare(cleanPassword, acc.password_hash)) {
                return res.status(403).json({
                  success: false,
                  message: 'Esta cuenta se encuentra suspendida. Comunícate con el administrador.'
                });
              }
            }
          }
          return res.status(401).json({
            success: false,
            message: GENERIC_AUTH_ERROR
          });
        }

        // Éxito: Limpiar intentos fallidos
        resetFailedAttempts(clientIp);

        // Si el usuario tiene múltiples empresas activas y aún no especificó cuál ingresar
        if (validAccounts.length > 1 && !accountId) {
          return res.json({
            success: true,
            multipleAccounts: true,
            message: 'Selecciona la empresa a la que deseas acceder.',
            accounts: validAccounts.map(acc => ({
              id: acc.id,
              business: acc.business,
              clientName: `${acc.first_name} ${acc.last_name}`,
              email: acc.email,
              modules: {
                social: acc.module_social,
                web: acc.module_web,
                crm: acc.module_crm
              }
            }))
          });
        }

        let account = validAccounts[0];
        if (accountId) {
          const found = validAccounts.find(a => a.id === accountId);
          if (found) account = found;
        }

        const token = jwt.sign(
          {
            role: 'client',
            accountId: account.id,
            email: account.email,
            clientName: `${account.first_name} ${account.last_name}`,
            business: account.business,
            modules: {
              social: account.module_social,
              web: account.module_web,
              crm: account.module_crm
            }
          },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        return res.json({
          success: true,
          message: `Bienvenido a ${account.business}.`,
          token,
          user: {
            role: 'client',
            accountId: account.id,
            business: account.business,
            clientName: `${account.first_name} ${account.last_name}`,
            email: account.email,
            modules: {
              social: account.module_social,
              web: account.module_web,
              crm: account.module_crm
            },
            availableAccounts: validAccounts.map(a => ({
              id: a.id,
              business: a.business,
              clientName: `${a.first_name} ${a.last_name}`,
              modules: { social: a.module_social, web: a.module_web, crm: a.module_crm }
            }))
          }
        });
      }
    } catch (accErr) {
      console.warn('[Auth] Error consultando accounts:', accErr.message);
    }

    // 3. Verificación de Profesionales del Equipo en PostgreSQL
    try {
      const profResult = await db.query(
        `SELECT p.*, a.business, a.status as account_status, a.deleted_at as account_deleted_at,
                a.module_social, a.module_web, a.module_crm 
         FROM professionals p
         JOIN accounts a ON p.account_id = a.id
         WHERE LOWER(p.email) = $1 AND p.deleted_at IS NULL LIMIT 1`,
        [identifier]
      );

      if (profResult.rows.length > 0) {
        const prof = profResult.rows[0];

        if (prof.account_status === 'inactive' || prof.account_deleted_at) {
          recordFailedAttempt(clientIp);
          return res.status(403).json({
            success: false,
            message: 'La empresa principal se encuentra inactiva o ha sido dada de baja.'
          });
        }

        const isMatch = await bcrypt.compare(cleanPassword, prof.password_hash);
        if (isMatch) {
          resetFailedAttempts(clientIp);

          const token = jwt.sign(
            {
              role: 'team_member',
              profId: prof.id,
              accountId: prof.account_id,
              email: prof.email,
              name: prof.name,
              roleTitle: prof.role,
              business: prof.business,
              modules: {
                social: prof.module_social,
                web: prof.module_web,
                crm: prof.module_crm
              }
            },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          return res.json({
            success: true,
            message: `Acceso autorizado para ${prof.name} (${prof.role}).`,
            token,
            user: {
              role: 'team_member',
              profId: prof.id,
              accountId: prof.account_id,
              email: prof.email,
              name: prof.name,
              roleTitle: prof.role,
              business: prof.business,
              modules: {
                social: prof.module_social,
                web: prof.module_web,
                crm: prof.module_crm
              }
            }
          });
        }
      }
    } catch (profErr) {
      console.warn('[Auth] Error consultando professionals:', profErr.message);
    }

    // Si ninguna credencial fue válida, registrar intento fallido y responder 401
    recordFailedAttempt(clientIp);
    return res.status(401).json({
      success: false,
      message: GENERIC_AUTH_ERROR
    });

  } catch (error) {
    console.error('Error no capturado en POST /api/auth/login:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al procesar el inicio de sesión.'
    });
  }
});

// GET /api/auth/me - Obtener información del usuario autenticado
router.get('/me', verifyToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// GET /api/auth/verify-invite - Verificar si el enlace de invitación es válido
router.get('/verify-invite', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token de invitación no proporcionado.' });
    }

    const result = await db.query(
      `SELECT id, first_name, last_name, business, email, invite_expires_at 
       FROM accounts 
       WHERE invite_token = $1 AND deleted_at IS NULL`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'El enlace de invitación es inválido o ya fue utilizado.' });
    }

    const acc = result.rows[0];
    if (new Date(acc.invite_expires_at) < new Date()) {
      return res.status(410).json({ success: false, message: 'El enlace de invitación ha expirado. Solicita uno nuevo a tu administrador.' });
    }

    res.json({
      success: true,
      data: {
        email: acc.email,
        business: acc.business,
        clientName: `${acc.first_name} ${acc.last_name}`
      }
    });
  } catch (error) {
    console.error('Error en GET /verify-invite:', error);
    res.status(500).json({ success: false, message: 'Error al verificar la invitación.' });
  }
});

// POST /api/auth/setup-password - Establecer contraseña por primera vez y acceder directamente
router.post('/setup-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres.'
      });
    }

    const result = await db.query(
      `SELECT id, first_name, last_name, business, email, module_social, module_web, module_crm, invite_expires_at 
       FROM accounts 
       WHERE invite_token = $1 AND deleted_at IS NULL`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'El enlace de invitación es inválido o ya fue utilizado.' });
    }

    const acc = result.rows[0];
    if (new Date(acc.invite_expires_at) < new Date()) {
      return res.status(410).json({ success: false, message: 'El enlace de invitación ha expirado.' });
    }

    const passwordHash = await bcrypt.hash(password.trim(), 10);

    // Actualizar contraseña y limpiar el token de invitación (unificar para todas las empresas de ese correo si tuviera más)
    await db.query(
      `UPDATE accounts 
       SET password_hash = $1, invite_token = NULL, invite_expires_at = NULL, status = 'active'
       WHERE LOWER(email) = LOWER($2) AND deleted_at IS NULL`,
      [passwordHash, acc.email]
    );

    // Generar sesión JWT directa
    const jwtToken = jwt.sign(
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
        }
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: '¡Contraseña configurada con éxito! Ingresando a la plataforma...',
      token: jwtToken,
      user: {
        role: 'client',
        accountId: acc.id,
        email: acc.email,
        clientName: `${acc.first_name} ${acc.last_name}`,
        business: acc.business,
        modules: {
          social: acc.module_social,
          web: acc.module_web,
          crm: acc.module_crm
        }
      }
    });
  } catch (error) {
    console.error('Error en POST /setup-password:', error);
    res.status(500).json({ success: false, message: 'Error al establecer la contraseña.' });
  }
});

// POST /api/auth/forgot-password - Enviar enlace directo al correo para restablecer contraseña
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Ingresa tu correo electrónico.' });
    }

    const emailClean = email.trim().toLowerCase();

    // 1. Buscar en accounts
    const accRes = await db.query(
      `SELECT id, first_name, last_name, business FROM accounts 
       WHERE LOWER(email) = $1 AND deleted_at IS NULL AND status = 'active' LIMIT 1`,
      [emailClean]
    );

    let clientName = 'Usuario';
    let isFound = false;

    if (accRes.rows.length > 0) {
      isFound = true;
      clientName = `${accRes.rows[0].first_name} ${accRes.rows[0].last_name}`.trim();
    } else {
      // 2. Buscar en professionals
      const profRes = await db.query(
        `SELECT id, name FROM professionals 
         WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1`,
        [emailClean]
      );
      if (profRes.rows.length > 0) {
        isFound = true;
        clientName = profRes.rows[0].name;
      }
    }

    // Por seguridad, si el correo no existe respondemos genéricamente sin error para evitar enumeración
    if (!isFound) {
      return res.json({
        success: true,
        message: 'Si el correo está registrado, recibirás un enlace de restablecimiento en tu bandeja de entrada.'
      });
    }

    // Generar token criptográfico seguro para restablecimiento
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // Válido por 24 horas

    // Guardar token en accounts (unificado para todas las cuentas de este usuario)
    await db.query(
      `UPDATE accounts 
       SET invite_token = $1, invite_expires_at = $2 
       WHERE LOWER(email) = $3 AND deleted_at IS NULL`,
      [resetToken, expiresAt, emailClean]
    );

    const baseUrl = (req.headers.origin || req.headers.referer || process.env.FRONTEND_URL || 'https://magumcreatorstudiopro.vercel.app').split('?')[0].replace(/\/+$/, '');
    const resetUrl = `${baseUrl}/setup-password.html?token=${encodeURIComponent(resetToken)}`;

    // Enviar correo con enlace seguro
    const emailResult = await sendPasswordResetLinkEmail({
      to: emailClean,
      clientName,
      resetUrl
    });

    res.json({
      success: true,
      message: 'Hemos enviado un enlace a tu correo para restablecer tu contraseña. Revisa tu bandeja de entrada o spam.',
      emailSent: Boolean(emailResult.success),
      resetUrl
    });
  } catch (error) {
    console.error('Error en POST /forgot-password:', error);
    res.status(500).json({ success: false, message: 'Error al procesar la solicitud de recuperación.' });
  }
});

// POST /api/auth/verify-reset-code - Validar código de 6 dígitos y establecer nueva contraseña
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
    }

    if (newPassword.trim().length < 6) {
      return res.status(400).json({ success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const emailClean = email.trim().toLowerCase();
    const cleanCode = String(code).trim().replace(/\s+/g, '');

    const accRes = await db.query(
      `SELECT id, password_reset_code, password_reset_expires_at 
       FROM accounts 
       WHERE LOWER(email) = $1 AND deleted_at IS NULL`,
      [emailClean]
    );

    if (accRes.rows.length === 0 || !accRes.rows[0].password_reset_code) {
      return res.status(400).json({
        success: false,
        message: 'No hay ninguna solicitud de recuperación activa para este correo.'
      });
    }

    const record = accRes.rows[0];
    if (new Date(record.password_reset_expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'El código ha expirado. Por favor solicita uno nuevo.'
      });
    }

    if (record.password_reset_code !== cleanCode) {
      return res.status(400).json({
        success: false,
        message: 'El código de 6 dígitos ingresado es incorrecto.'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);

    // Actualizar clave y limpiar código
    await db.query(
      `UPDATE accounts 
       SET password_hash = $1, password_reset_code = NULL, password_reset_expires_at = NULL 
       WHERE LOWER(email) = $2 AND deleted_at IS NULL`,
      [passwordHash, emailClean]
    );

    // También actualizar si es profesional
    await db.query(
      `UPDATE professionals 
       SET password_hash = $1 
       WHERE LOWER(email) = $2 AND deleted_at IS NULL`,
      [passwordHash, emailClean]
    );

    res.json({
      success: true,
      message: '¡Contraseña restablecida con éxito! Ya puedes iniciar sesión con tu nueva clave.'
    });
  } catch (error) {
    console.error('Error en POST /verify-reset-code:', error);
    res.status(500).json({ success: false, message: 'Error al verificar el código de recuperación.' });
  }
});

// POST /api/auth/switch-account - Permite alternar la empresa activa de forma segura
router.post('/switch-account', verifyToken, async (req, res) => {
  try {
    const { targetAccountId } = req.body;
    if (!targetAccountId) {
      return res.status(400).json({ success: false, message: 'targetAccountId es requerido.' });
    }

    const user = req.user;
    let targetAccount = null;

    if (user.role === 'admin') {
      const accRes = await db.query(
        'SELECT * FROM accounts WHERE id = $1 AND deleted_at IS NULL',
        [targetAccountId]
      );
      if (accRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Cuenta destino no encontrada.' });
      }
      targetAccount = accRes.rows[0];
    } else {
      const accRes = await db.query(
        'SELECT * FROM accounts WHERE id = $1 AND LOWER(email) = LOWER($2) AND deleted_at IS NULL',
        [targetAccountId, user.email]
      );
      if (accRes.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'No tienes acceso a esta empresa.' });
      }
      targetAccount = accRes.rows[0];
    }

    if (targetAccount.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'La empresa seleccionada se encuentra suspendida.' });
    }

    // Consultar empresas activas vinculadas
    const allUserAccountsRes = await db.query(
      `SELECT id, business, first_name, last_name, email, module_social, module_web, module_crm, logo_url, favicon_url 
       FROM accounts 
       WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL AND status = 'active' 
       ORDER BY created_at DESC`,
      [targetAccount.email]
    );

    const availableAccounts = allUserAccountsRes.rows.map(a => ({
      id: a.id,
      business: a.business,
      clientName: `${a.first_name} ${a.last_name}`,
      logoUrl: a.logo_url || '',
      faviconUrl: a.favicon_url || '',
      modules: { social: a.module_social, web: a.module_web, crm: a.module_crm }
    }));

    const newToken = jwt.sign(
      {
        role: user.role === 'admin' ? 'client' : user.role,
        accountId: targetAccount.id,
        email: targetAccount.email,
        clientName: `${targetAccount.first_name} ${targetAccount.last_name}`,
        business: targetAccount.business,
        modules: {
          social: targetAccount.module_social,
          web: targetAccount.module_web,
          crm: targetAccount.module_crm
        },
        impersonatedByAdmin: user.role === 'admin' || Boolean(user.impersonatedByAdmin)
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: `Cambiando a "${targetAccount.business}".`,
      token: newToken,
      user: {
        role: user.role === 'admin' ? 'client' : user.role,
        accountId: targetAccount.id,
        business: targetAccount.business,
        clientName: `${targetAccount.first_name} ${targetAccount.last_name}`,
        email: targetAccount.email,
        modules: {
          social: targetAccount.module_social,
          web: targetAccount.module_web,
          crm: targetAccount.module_crm
        },
        availableAccounts,
        impersonatedByAdmin: user.role === 'admin' || Boolean(user.impersonatedByAdmin)
      }
    });
  } catch (error) {
    console.error('Error en POST /api/auth/switch-account:', error);
    res.status(500).json({ success: false, message: 'Error al cambiar de empresa.' });
  }
});

module.exports = router;
