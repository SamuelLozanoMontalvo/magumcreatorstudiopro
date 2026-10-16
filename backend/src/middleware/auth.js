const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'magum_creator_studio_super_secret_jwt_key_2026_xyz';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ ADVERTENCIA DE SEGURIDAD: JWT_SECRET no está definido en variables de entorno. Usando clave de desarrollo.');
}

// Middleware principal: Verificación estricta de token JWT y estado de cuenta en tiempo real
async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // Rechazar inmediatamente si no hay token (Cero acceso por cabeceras spoofeadas)
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Acceso no autorizado. Se requiere token de sesión Bearer.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Validación de estado de cuenta en tiempo real (evita que usuarios suspendidos continúen con tokens activos)
    if (decoded.role === 'client' && decoded.accountId) {
      const accRes = await db.query(
        'SELECT id, status, deleted_at FROM accounts WHERE id = $1',
        [decoded.accountId]
      );
      if (accRes.rows.length === 0 || accRes.rows[0].deleted_at) {
        return res.status(403).json({
          success: false,
          message: 'Esta cuenta ha sido eliminada o no existe.'
        });
      }
      if (accRes.rows[0].status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: 'Tu cuenta de empresa se encuentra suspendida. Comunícate con el administrador.'
        });
      }
    } else if (decoded.role === 'team_member' && decoded.profId) {
      const profRes = await db.query(`
        SELECT p.id, p.deleted_at, a.status as account_status, a.deleted_at as account_deleted_at
        FROM professionals p
        JOIN accounts a ON p.account_id = a.id
        WHERE p.id = $1
      `, [decoded.profId]);
      if (profRes.rows.length === 0 || profRes.rows[0].deleted_at || profRes.rows[0].account_deleted_at) {
        return res.status(403).json({
          success: false,
          message: 'Acceso de miembro revocado o empresa eliminada.'
        });
      }
      if (profRes.rows[0].account_status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: 'La empresa principal se encuentra suspendida.'
        });
      }
    } else if (decoded.role === 'admin' && decoded.adminId) {
      const adminRes = await db.query(
        'SELECT id, role FROM admin_users WHERE id = $1',
        [decoded.adminId]
      );
      if (adminRes.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Privilegios de administrador no encontrados o revocados.'
        });
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido o expirado. Inicia sesión nuevamente.'
    });
  }
}

// Middleware de guardia: Solo Super Admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Acceso denegado. Se requieren privilegios de Super Administrador.'
    });
  }
  next();
}

// Middleware de guardia: Clientes o miembros del equipo
function requireClientOrTeam(req, res, next) {
  if (!req.user || !['admin', 'client', 'team_member'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Acceso denegado a este recurso.'
    });
  }
  next();
}

// Middleware de guardia: Titular de la cuenta o Super Admin (Los profesionales NO pueden crear/borrar miembros)
function requireAccountOwnerOrAdmin(req, res, next) {
  if (!req.user || !['admin', 'client'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Acceso restringido. Solo el titular de la cuenta o el Super Administrador pueden realizar esta acción.'
    });
  }
  next();
}

module.exports = {
  verifyToken,
  requireAdmin,
  requireClientOrTeam,
  requireAccountOwnerOrAdmin,
  JWT_SECRET
};
