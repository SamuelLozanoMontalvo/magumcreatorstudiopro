const db = require('../config/db');

/**
 * Verifica si un correo electrónico ya existe en cualquier tabla de usuarios:
 * - admin_users (Administradores)
 * - accounts (Cuentas de clientes / titulares)
 * - professionals (Colaboradores / miembros del equipo)
 *
 * @param {string} email
 * @param {object} [exclude] - { table: 'accounts'|'admin_users'|'professionals', id: string }
 * @returns {Promise<{ conflict: boolean, role?: string, details?: string, message?: string }>}
 */
async function findGlobalEmailConflict(email, exclude = {}) {
  if (!email || typeof email !== 'string') {
    return { conflict: false };
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Verificar en Administradores
  const adminRes = await db.query(
    'SELECT id, name, role FROM admin_users WHERE LOWER(email) = $1',
    [cleanEmail]
  );
  if (adminRes.rows.length > 0) {
    const match = adminRes.rows[0];
    if (!(exclude.table === 'admin_users' && exclude.id === match.id)) {
      return {
        conflict: true,
        role: 'Administrador del Sistema',
        details: 'admin_users',
        message: `El correo "${cleanEmail}" ya está registrado en la plataforma como Administrador. No es posible asociarlo a otra cuenta o rol.`
      };
    }
  }

  // 2. Verificar en Cuentas de Clientes (Tenants)
  const accountRes = await db.query(
    'SELECT id, business, first_name, last_name FROM accounts WHERE LOWER(email) = $1 AND deleted_at IS NULL',
    [cleanEmail]
  );
  if (accountRes.rows.length > 0) {
    const match = accountRes.rows[0];
    if (!(exclude.table === 'accounts' && exclude.id === match.id)) {
      return {
        conflict: true,
        role: `Cliente titular (${match.business})`,
        details: 'accounts',
        message: `El correo "${cleanEmail}" ya está registrado en la plataforma como titular de la empresa "${match.business}". No es posible registrarlo como colaborador ni como otra cuenta.`
      };
    }
  }

  // 3. Verificar en Profesionales / Colaboradores
  const profRes = await db.query(
    'SELECT id, name, role FROM professionals WHERE LOWER(email) = $1 AND deleted_at IS NULL',
    [cleanEmail]
  );
  if (profRes.rows.length > 0) {
    const match = profRes.rows[0];
    if (!(exclude.table === 'professionals' && exclude.id === match.id)) {
      return {
        conflict: true,
        role: `Colaborador / Miembro del equipo (${match.name})`,
        details: 'professionals',
        message: `El correo "${cleanEmail}" ya está registrado como colaborador (${match.name}). No es posible asignarlo a otro rol o cuenta.`
      };
    }
  }

  return { conflict: false };
}

module.exports = {
  findGlobalEmailConflict
};
