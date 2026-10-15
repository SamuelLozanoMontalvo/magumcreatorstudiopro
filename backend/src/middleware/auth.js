const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'magum_creator_studio_super_secret_jwt_key_2026_xyz';

// Middleware principal para verificar token JWT
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-access-token'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Acceso no autorizado. Se requiere un token de sesión válido.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Token de sesión expirado o inválido. Por favor inicia sesión nuevamente.'
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

module.exports = {
  verifyToken,
  requireAdmin,
  requireClientOrTeam,
  JWT_SECRET
};
