const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ ERROR FATAL: JWT_SECRET no está definida en las variables de entorno. Por motivos de seguridad estricta, el servidor no puede arrancar sin esta clave.');
  process.exit(1);
}

// Mapa en memoria para rastrear únicamente intentos FALLIDOS de inicio de sesión por IP
const failedLoginAttempts = new Map();
const FAILED_RATE_WINDOW = 15 * 60 * 1000; // 15 minutos
const MAX_FAILED_ATTEMPTS = 10;

function isIpBlocked(ip) {
  const record = failedLoginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.firstAttempt > FAILED_RATE_WINDOW) {
    failedLoginAttempts.delete(ip);
    return false;
  }
  return record.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = failedLoginAttempts.get(ip) || { count: 0, firstAttempt: now };
  if (now - record.firstAttempt > FAILED_RATE_WINDOW) {
    record.count = 1;
    record.firstAttempt = now;
  } else {
    record.count++;
  }
  failedLoginAttempts.set(ip, record);
}

function resetFailedAttempts(ip) {
  failedLoginAttempts.delete(ip);
}

// Limpieza periódica de IPs antiguas
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of failedLoginAttempts.entries()) {
    if (now - data.firstAttempt > FAILED_RATE_WINDOW) {
      failedLoginAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

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

// Middleware de guardia: Titular de la cuenta o Super Admin
function requireAccountOwnerOrAdmin(req, res, next) {
  if (!req.user || !['admin', 'client'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Acceso restringido. Solo el titular de la cuenta o el Super Administrador pueden realizar esta acción.'
    });
  }
  next();
}

// Helper estricto para resolver el account_id sin fugas entre cuentas
function resolveAccountId(req) {
  if (req.user && (req.user.role === 'client' || req.user.role === 'team_member')) {
    return req.user.accountId || null;
  }
  if (req.user && req.user.role === 'admin') {
    const requestedId = req.query.accountId || (req.body && req.body.accountId) || req.headers['x-account-id'];
    return requestedId || null;
  }
  return null;
}

module.exports = {
  verifyToken,
  requireAdmin,
  requireClientOrTeam,
  requireAccountOwnerOrAdmin,
  resolveAccountId,
  isIpBlocked,
  recordFailedAttempt,
  resetFailedAttempts,
  JWT_SECRET
};
