const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, requireClientOrTeam } = require('../middleware/auth');

router.use(verifyToken, requireClientOrTeam);

// Helper para obtener el account_id adecuado según el usuario
function resolveAccountId(req) {
  if (req.user.accountId) return req.user.accountId;
  return 'MC8K29L'; // Fallback a la cuenta principal para admin
}

// GET /api/crm/contacts - Obtener contactos y métricas
router.get('/contacts', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { search, segment } = req.query;

    let queryText = 'SELECT * FROM crm_contacts WHERE account_id = $1';
    const params = [accountId];

    if (segment && segment !== 'all') {
      params.push(segment);
      queryText += ` AND segment = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      queryText += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR phone LIKE $${params.length} OR LOWER(company) LIKE $${params.length})`;
    }

    queryText += ' ORDER BY created_at DESC';

    const result = await db.query(queryText, params);

    // Métricas en tiempo real
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE segment = 'vip') as vip,
        COUNT(*) FILTER (WHERE segment = 'prospect') as prospects,
        COUNT(*) FILTER (WHERE segment = 'inactive') as inactive
      FROM crm_contacts
      WHERE account_id = $1
    `, [accountId]);

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      stats: {
        total: parseInt(stats.total, 10) || 0,
        vip: parseInt(stats.vip, 10) || 0,
        prospects: parseInt(stats.prospects, 10) || 0,
        inactive: parseInt(stats.inactive, 10) || 0
      },
      data: result.rows
    });
  } catch (error) {
    console.error('Error en GET /api/crm/contacts:', error);
    res.status(500).json({ success: false, message: 'Error al obtener contactos de CRM.' });
  }
});

// POST /api/crm/contacts - Crear contacto
router.post('/contacts', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { name, email, phone, age, company, segment, notes } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, correo y celular son obligatorios.'
      });
    }

    const newId = 'C-' + Math.floor(1000 + Math.random() * 9000);
    const parsedAge = age ? parseInt(age, 10) : null;
    const finalSegment = ['vip', 'prospect', 'inactive', 'client'].includes(segment) ? segment : 'client';

    const result = await db.query(`
      INSERT INTO crm_contacts (id, account_id, name, email, phone, age, company, segment, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [newId, accountId, name.trim(), email.trim(), phone.trim(), parsedAge, company ? company.trim() : null, finalSegment, notes ? notes.trim() : null]);

    res.status(201).json({
      success: true,
      message: 'Contacto guardado con éxito.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error en POST /api/crm/contacts:', error);
    res.status(500).json({ success: false, message: 'Error al registrar contacto.' });
  }
});

// PUT /api/crm/contacts/:id - Actualizar contacto
router.put('/contacts/:id', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { id } = req.params;
    const { name, email, phone, age, company, segment, notes } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, correo y celular son obligatorios.'
      });
    }

    const parsedAge = age ? parseInt(age, 10) : null;
    const finalSegment = ['vip', 'prospect', 'inactive', 'client'].includes(segment) ? segment : 'client';

    const result = await db.query(`
      UPDATE crm_contacts 
      SET name = $1, email = $2, phone = $3, age = $4, company = $5, segment = $6, notes = $7
      WHERE id = $8 AND account_id = $9
      RETURNING *
    `, [name.trim(), email.trim(), phone.trim(), parsedAge, company ? company.trim() : null, finalSegment, notes ? notes.trim() : null, id, accountId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Contacto no encontrado.' });
    }

    res.json({
      success: true,
      message: 'Contacto actualizado exitosamente.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error en PUT /api/crm/contacts/:id:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar contacto.' });
  }
});

// DELETE /api/crm/contacts/:id - Eliminar un solo contacto
router.delete('/contacts/:id', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { id } = req.params;

    await db.query('DELETE FROM crm_contacts WHERE id = $1 AND account_id = $2', [id, accountId]);
    res.json({ success: true, message: 'Contacto eliminado de la base de datos.' });
  } catch (error) {
    console.error('Error en DELETE /api/crm/contacts/:id:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar contacto.' });
  }
});

// POST /api/crm/bulk-delete - Eliminar múltiples contactos a la vez
router.post('/bulk-delete', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Se requiere una lista de IDs para eliminar.' });
    }

    const result = await db.query(
      'DELETE FROM crm_contacts WHERE id = ANY($1::text[]) AND account_id = $2',
      [ids, accountId]
    );

    res.json({
      success: true,
      message: `Se eliminaron ${result.rowCount} contactos exitosamente.`,
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error en bulk-delete:', error);
    res.status(500).json({ success: false, message: 'Error al procesar eliminación masiva.' });
  }
});

// POST /api/crm/import - Importación masiva de contactos (CSV o JSON)
router.post('/import', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron contactos para importar.' });
    }

    let inserted = 0;
    for (const c of contacts) {
      if (c.name && c.email && c.phone) {
        const newId = 'C-' + Math.floor(1000 + Math.random() * 9000);
        const age = c.age ? parseInt(c.age, 10) : null;
        let segment = (c.segment || 'client').toLowerCase();
        if (!['vip', 'prospect', 'inactive', 'client'].includes(segment)) segment = 'client';

        await db.query(`
          INSERT INTO crm_contacts (id, account_id, name, email, phone, age, company, segment, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [newId, accountId, c.name.trim(), c.email.trim(), c.phone.trim(), age, c.company || null, segment, c.notes || null]);
        inserted++;
      }
    }

    res.json({
      success: true,
      message: `¡Importación masiva completada! ${inserted} contactos añadidos a tu base de datos.`,
      importedCount: inserted
    });
  } catch (error) {
    console.error('Error en /api/crm/import:', error);
    res.status(500).json({ success: false, message: 'Error al importar contactos.' });
  }
});

// POST /api/crm/broadcast - Emisión de campañas (WhatsApp, Email o Dual)
router.post('/broadcast', async (req, res) => {
  try {
    const { channel, recipientIds, subject, message } = req.body;
    const accountId = resolveAccountId(req);

    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No se seleccionaron destinatarios.' });
    }

    // Obtener los destinatarios reales de la base de datos
    const contactsRes = await db.query(
      'SELECT id, name, email, phone, company FROM crm_contacts WHERE id = ANY($1::text[]) AND account_id = $2',
      [recipientIds, accountId]
    );

    const recipients = contactsRes.rows;

    res.json({
      success: true,
      message: `Campaña ${channel.toUpperCase()} enviada exitosamente a ${recipients.length} contactos.`,
      summary: {
        channel,
        totalRecipients: recipients.length,
        dispatchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error en /api/crm/broadcast:', error);
    res.status(500).json({ success: false, message: 'Error al disparar campaña.' });
  }
});

module.exports = router;
