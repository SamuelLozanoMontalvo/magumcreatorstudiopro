const db = require('../config/db');

/**
 * Verifica si un correo electrónico entra en conflicto con las reglas de unicidad:
 * - Un Administrador NO puede ser registrado como Cliente ni como Colaborador.
 * - Un Colaborador NO puede ser registrado como Administrador ni como Cliente titular.
 * - Un Cliente SÍ puede tener múltiples empresas/cuentas asociadas a su mismo correo
 *   (para poder alternar entre ellas en el panel), pero NO puede registrar dos veces
 *   el mismo nombre de empresa.
 *
 * @param {string} email
 * @param {object} [options]
 * @param {boolean} [options.allowMultipleAccounts=false] - True para creación de cuentas de cliente
 * @param {string} [options.business] - Nombre de la empresa a registrar (si allowMultipleAccounts es true)
 * @param {string} [options.excludeTable]
 * @param {string} [options.excludeId]
 * @returns {Promise<{ conflict: boolean, role?: string, details?: string, message?: string }>}
 */
async function findGlobalEmailConflict(email, options = {}) {
  if (!email || typeof email !== 'string') {
    return { conflict: false };
  }

  const cleanEmail = email.trim().toLowerCase();
  const { allowMultipleAccounts = false, business, excludeTable, excludeId } = options;

  // 1. Verificar en Administradores (Nunca puede ser admin si se registra como cliente o colaborador)
  const adminRes = await db.query(
    'SELECT id, name, role FROM admin_users WHERE LOWER(email) = $1',
    [cleanEmail]
  );
  if (adminRes.rows.length > 0) {
    const match = adminRes.rows[0];
    if (!(excludeTable === 'admin_users' && excludeId === match.id)) {
      return {
        conflict: true,
        role: 'Administrador del Sistema',
        details: 'admin_users',
        message: `El correo "${cleanEmail}" pertenece a un Administrador del Sistema. No es posible asociarlo como cliente ni como colaborador.`
      };
    }
  }

  // 2. Verificar en Profesionales / Colaboradores (Nunca puede ser colaborador si se registra como cliente o admin)
  const profRes = await db.query(
    'SELECT id, name, role FROM professionals WHERE LOWER(email) = $1 AND deleted_at IS NULL',
    [cleanEmail]
  );
  if (profRes.rows.length > 0) {
    const match = profRes.rows[0];
    if (!(excludeTable === 'professionals' && excludeId === match.id)) {
      return {
        conflict: true,
        role: `Colaborador / Miembro del equipo (${match.name})`,
        details: 'professionals',
        message: `El correo "${cleanEmail}" ya está registrado como colaborador (${match.name}). No puede registrarse como titular de cuenta ni como administrador.`
      };
    }
  }

  // 3. Verificar en Cuentas de Clientes (Tenants)
  if (allowMultipleAccounts) {
    // Si es para crear o asociar una empresa a un cliente:
    // El cliente SÍ puede tener varias empresas, pero no dos cuentas con el MISMO nombre de empresa
    if (business && business.trim()) {
      const cleanBusiness = business.trim().toLowerCase();
      const sameBusinessRes = await db.query(
        'SELECT id, business FROM accounts WHERE LOWER(email) = $1 AND LOWER(business) = $2 AND deleted_at IS NULL',
        [cleanEmail, cleanBusiness]
      );
      if (sameBusinessRes.rows.length > 0) {
        const match = sameBusinessRes.rows[0];
        if (!(excludeTable === 'accounts' && excludeId === match.id)) {
          return {
            conflict: true,
            role: `Cliente titular (${match.business})`,
            details: 'accounts',
            message: `Ya existe una cuenta para "${match.business}" vinculada al correo "${cleanEmail}".`
          };
        }
      }
    }
  } else {
    // Para administradores y colaboradores: NO pueden usar un correo que ya pertenezca a un cliente titular
    const accountRes = await db.query(
      'SELECT id, business FROM accounts WHERE LOWER(email) = $1 AND deleted_at IS NULL',
      [cleanEmail]
    );
    if (accountRes.rows.length > 0) {
      const match = accountRes.rows[0];
      if (!(excludeTable === 'accounts' && excludeId === match.id)) {
        return {
          conflict: true,
          role: `Cliente titular (${match.business})`,
          details: 'accounts',
          message: `El correo "${cleanEmail}" ya está registrado como titular de la empresa "${match.business}". No puede registrarse en otro rol.`
        };
      }
    }
  }

  return { conflict: false };
}

/**
 * Obtiene la URL base confiable del frontend para enlaces seguros (evita Host / Origin Header Poisoning)
 */
function getSafeBaseUrl(req) {
  const envUrl = (process.env.FRONTEND_URL || 'https://magumcreatorstudiopro.vercel.app').replace(/\/+$/, '');
  const reqOrigin = req && req.headers ? (req.headers.origin || '').trim().replace(/\/+$/, '') : '';

  // Lista blanca estricta de orígenes permitidos
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://magumcreatorstudiopro.vercel.app',
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5500'] : [])
  ].filter(Boolean).map(url => url.replace(/\/+$/, ''));

  if (reqOrigin && allowedOrigins.includes(reqOrigin)) {
    return reqOrigin;
  }
  return envUrl;
}

module.exports = {
  findGlobalEmailConflict,
  getSafeBaseUrl
};
