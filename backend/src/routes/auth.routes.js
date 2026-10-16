const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { verifyToken, JWT_SECRET, isIpBlocked, recordFailedAttempt, resetFailedAttempts } = require('../middleware/auth');
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

module.exports = router;
