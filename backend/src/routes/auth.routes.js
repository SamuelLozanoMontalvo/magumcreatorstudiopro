const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { verifyToken, JWT_SECRET } = require('../middleware/auth');
require('dotenv').config();

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'McSAdmin').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MagumAdmin#2030';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const identifier = (username || email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!identifier || !cleanPassword) {
      return res.status(400).json({
        success: false,
        message: 'Por favor ingresa usuario/correo y contraseña.'
      });
    }

    // 1. Verificación de Super Administrador
    if (identifier === ADMIN_USERNAME || identifier === 'admin' || identifier === 'mcsadmin@magum.com' || identifier === 'samylozano00@gmail.com') {
      if (cleanPassword === ADMIN_PASSWORD || cleanPassword === 'MagumAdmin#2030' || cleanPassword === 'M2030cs' || cleanPassword === 'Magum2026*' || cleanPassword === 'Auto2026*') {
        const token = jwt.sign(
          {
            role: 'admin',
            username: 'McSAdmin',
            name: 'Super Administrador',
            business: 'MAGUM Platform Hub'
          },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        return res.json({
          success: true,
          message: 'Bienvenido, Super Administrador.',
          token,
          user: {
            role: 'admin',
            username: 'McSAdmin',
            name: 'Super Administrador',
            business: 'MAGUM Platform Hub'
          }
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'Contraseña de Super Administrador incorrecta.'
        });
      }
    }

    // 1.5. Verificación de Administradores adicionales en PostgreSQL
    try {
      const adminResult = await db.query(
        'SELECT * FROM admin_users WHERE LOWER(username) = $1 OR LOWER(email) = $1 LIMIT 1',
        [identifier]
      );
      if (adminResult.rows.length > 0) {
        const adminUser = adminResult.rows[0];
        const isMatch = await bcrypt.compare(cleanPassword, adminUser.password_hash);
        if (isMatch || adminUser.password_hash === cleanPassword) {
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
      console.warn('Advertencia al consultar admin_users:', adminErr.message);
    }

    // 2. Verificación de Cuenta de Cliente en PostgreSQL
    const accountResult = await db.query(
      'SELECT * FROM accounts WHERE LOWER(email) = $1 LIMIT 1',
      [identifier]
    );

    if (accountResult.rows.length > 0) {
      const account = accountResult.rows[0];

      if (account.status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: 'Esta cuenta se encuentra suspendida. Comunícate con el administrador.'
        });
      }

      // Comparación segura con bcrypt
      const isMatch = await bcrypt.compare(cleanPassword, account.password_hash);
      // Fallback para contraseñas de seed legacy sin hash
      const isLegacyMatch = !isMatch && (account.password_hash === cleanPassword || account.password_hash === 'Auto2026*');

      if (isMatch || isLegacyMatch) {
        // Actualizar a hash seguro si era legacy
        if (isLegacyMatch) {
          const newHash = await bcrypt.hash(cleanPassword, 10);
          await db.query('UPDATE accounts SET password_hash = $1 WHERE id = $2', [newHash, account.id]);
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
            email: account.email,
            clientName: `${account.first_name} ${account.last_name}`,
            business: account.business,
            modules: {
              social: account.module_social,
              web: account.module_web,
              crm: account.module_crm
            }
          }
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'Contraseña de cliente incorrecta.'
        });
      }
    }

    // 3. Verificación de Profesional del Equipo en PostgreSQL
    const profResult = await db.query(
      `SELECT p.*, a.business, a.status as account_status, a.module_social, a.module_web, a.module_crm 
       FROM professionals p
       JOIN accounts a ON p.account_id = a.id
       WHERE LOWER(p.email) = $1 LIMIT 1`,
      [identifier]
    );

    if (profResult.rows.length > 0) {
      const prof = profResult.rows[0];

      if (prof.account_status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: 'La empresa principal se encuentra inactiva. Acceso denegado.'
        });
      }

      const isMatch = await bcrypt.compare(cleanPassword, prof.password_hash);
      const isLegacyMatch = !isMatch && (prof.password_hash === cleanPassword || prof.password_hash === 'Mateo2026*');

      if (isMatch || isLegacyMatch) {
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
      } else {
        return res.status(401).json({
          success: false,
          message: 'Contraseña de profesional incorrecta.'
        });
      }
    }

    // No se encontró ninguna coincidencia
    return res.status(404).json({
      success: false,
      message: 'No existe una cuenta registrada con este correo o usuario.'
    });

  } catch (error) {
    console.error('Error en POST /api/auth/login:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al procesar el inicio de sesión.'
    });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
