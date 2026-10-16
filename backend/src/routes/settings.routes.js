const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/settings/platform_branding - Público para que la pantalla de login renderice logo y favicon
router.get('/platform_branding', async (req, res) => {
  try {
    const result = await db.query('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['platform_branding']);
    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }
    res.json({
      success: true,
      data: result.rows[0].setting_value
    });
  } catch (error) {
    console.error('Error en GET /api/settings/platform_branding:', error);
    res.status(500).json({ success: false, message: 'Error al obtener marca.' });
  }
});

// GET /api/settings/:key - Requiere sesión activa
router.get('/:key', verifyToken, async (req, res) => {
  try {
    const { key } = req.params;
    const result = await db.query('SELECT setting_value FROM system_settings WHERE setting_key = $1', [key]);

    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: result.rows[0].setting_value
    });
  } catch (error) {
    console.error('Error en GET /api/settings:', error);
    res.status(500).json({ success: false, message: 'Error al obtener ajustes.' });
  }
});

// POST /api/settings/:key - Requiere privilegios de Super Administrador (Protección de ajustes del sistema)
router.post('/:key', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ success: false, message: 'Se requiere un valor para el ajuste.' });
    }

    await db.query(`
      INSERT INTO system_settings (setting_key, setting_value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (setting_key)
      DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP
    `, [key, JSON.stringify(value)]);

    res.json({
      success: true,
      message: 'Ajustes guardados exitosamente.'
    });
  } catch (error) {
    console.error('Error en POST /api/settings:', error);
    res.status(500).json({ success: false, message: 'Error al guardar ajustes.' });
  }
});

module.exports = router;
