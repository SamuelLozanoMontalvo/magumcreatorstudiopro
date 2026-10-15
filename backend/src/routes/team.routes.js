const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { verifyToken, requireClientOrTeam } = require('../middleware/auth');

router.use(verifyToken, requireClientOrTeam);

function resolveAccountId(req) {
  if (req.user.accountId) return req.user.accountId;
  return 'MC8K29L';
}

// GET /api/team - Listar profesionales de la cuenta
router.get('/', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const result = await db.query(`
      SELECT id, name, role, email, phone, schedule, created_at
      FROM professionals
      WHERE account_id = $1
      ORDER BY created_at DESC
    `, [accountId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error en GET /api/team:', error);
    res.status(500).json({ success: false, message: 'Error al obtener equipo de profesionales.' });
  }
});

// POST /api/team - Crear nuevo profesional
router.post('/', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { name, role, email, password, phone, schedule } = req.body;

    if (!name || !role || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, cargo, correo y contraseña son requeridos.'
      });
    }

    const emailClean = email.trim().toLowerCase();

    // Comprobar correo único
    const exists = await db.query('SELECT id FROM professionals WHERE LOWER(email) = $1', [emailClean]);
    if (exists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Ya existe un miembro registrado con el correo "${emailClean}".`
      });
    }

    const newId = 'P-' + Math.floor(1000 + Math.random() * 9000);
    const passwordHash = await bcrypt.hash(password.trim(), 10);

    const result = await db.query(`
      INSERT INTO professionals (id, account_id, name, role, email, password_hash, phone, schedule)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, role, email, phone, schedule, created_at
    `, [newId, accountId, name.trim(), role.trim(), emailClean, passwordHash, phone ? phone.trim() : null, schedule ? schedule.trim() : null]);

    res.status(201).json({
      success: true,
      message: 'Profesional registrado con éxito. Ya puede acceder a la plataforma con sus credenciales.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error en POST /api/team:', error);
    res.status(500).json({ success: false, message: 'Error al registrar profesional.' });
  }
});

// PUT /api/team/:id - Actualizar profesional
router.put('/:id', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { id } = req.params;
    const { name, role, email, password, phone, schedule } = req.body;

    if (!name || !role || !email) {
      return res.status(400).json({ success: false, message: 'Nombre, cargo y correo son obligatorios.' });
    }

    const emailClean = email.trim().toLowerCase();

    let queryText = `
      UPDATE professionals 
      SET name = $1, role = $2, email = $3, phone = $4, schedule = $5
    `;
    const params = [name.trim(), role.trim(), emailClean, phone ? phone.trim() : null, schedule ? schedule.trim() : null];

    if (password && password.trim().length > 0) {
      const passwordHash = await bcrypt.hash(password.trim(), 10);
      params.push(passwordHash);
      queryText += `, password_hash = $${params.length}`;
    }

    params.push(id, accountId);
    queryText += ` WHERE id = $${params.length - 1} AND account_id = $${params.length} RETURNING id, name, role, email, phone, schedule`;

    const result = await db.query(queryText, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profesional no encontrado.' });
    }

    res.json({
      success: true,
      message: 'Datos del profesional actualizados.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error en PUT /api/team/:id:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar profesional.' });
  }
});

// DELETE /api/team/:id - Eliminar acceso del profesional
router.delete('/:id', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { id } = req.params;

    await db.query('DELETE FROM professionals WHERE id = $1 AND account_id = $2', [id, accountId]);
    res.json({ success: true, message: 'Acceso del profesional revocado y eliminado.' });
  } catch (error) {
    console.error('Error en DELETE /api/team/:id:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar profesional.' });
  }
});

module.exports = router;
