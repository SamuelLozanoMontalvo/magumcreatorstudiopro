const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { verifyToken, requireClientOrTeam, requireAccountOwnerOrAdmin, resolveAccountId } = require('../middleware/auth');

router.use(verifyToken);

// GET /api/team - Listar profesionales de la cuenta (Accesible para titular, admin y miembros)
router.get('/', requireClientOrTeam, async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere cuenta asociada.' });
    }

    const result = await db.query(`
      SELECT id, name, role, email, phone, schedule, created_at
      FROM professionals
      WHERE account_id = $1 AND deleted_at IS NULL
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

// POST /api/team - Crear nuevo profesional (SOLO titular de la cuenta o Super Admin)
router.post('/', requireAccountOwnerOrAdmin, async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere cuenta asociada.' });
    }

    const { name, role, email, password, phone, schedule } = req.body;

    if (!name || !role || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, cargo, correo y contraseña son requeridos.'
      });
    }

    const emailClean = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailClean)) {
      return res.status(400).json({ success: false, message: 'El formato de correo no es válido.' });
    }

    // Comprobar correo único
    const exists = await db.query('SELECT id FROM professionals WHERE LOWER(email) = $1 AND deleted_at IS NULL', [emailClean]);
    if (exists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Ya existe un miembro registrado con el correo "${emailClean}".`
      });
    }

    const newId = 'P-' + crypto.randomUUID();
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

// PUT /api/team/:id - Actualizar profesional (SOLO titular de la cuenta o Super Admin)
router.put('/:id', requireAccountOwnerOrAdmin, async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere cuenta asociada.' });
    }

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
    queryText += ` WHERE id = $${params.length - 1} AND account_id = $${params.length} AND deleted_at IS NULL RETURNING id, name, role, email, phone, schedule`;

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

// DELETE /api/team/:id - Eliminar acceso del profesional (SOLO titular o Super Admin)
router.delete('/:id', requireAccountOwnerOrAdmin, async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere cuenta asociada.' });
    }

    const { id } = req.params;
    const result = await db.query(
      'UPDATE professionals SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL RETURNING id',
      [id, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profesional no encontrado.' });
    }

    res.json({ success: true, message: 'Acceso del profesional revocado y archivado.' });
  } catch (error) {
    console.error('Error en DELETE /api/team/:id:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar profesional.' });
  }
});

module.exports = router;
