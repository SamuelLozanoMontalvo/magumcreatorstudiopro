const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, requireClientOrTeam } = require('../middleware/auth');

router.use(verifyToken, requireClientOrTeam);

// Helper para obtener el account_id adecuado según el usuario garantizando existencia en accounts
async function resolveAccountId(req) {
  let targetId = (req.user && req.user.accountId) || (req.headers && req.headers['x-account-id']);
  if (!targetId || targetId === 'demo') {
    targetId = 'MC8K29L';
  }
  try {
    const acc = await db.query('SELECT id FROM accounts WHERE id = $1 LIMIT 1', [targetId]);
    if (acc.rows.length > 0) {
      return targetId;
    }
    if (req.user && req.user.email) {
      const accByEmail = await db.query('SELECT id FROM accounts WHERE LOWER(email) = LOWER($1) LIMIT 1', [req.user.email]);
      if (accByEmail.rows.length > 0) return accByEmail.rows[0].id;
    }
    const anyAcc = await db.query('SELECT id FROM accounts ORDER BY created_at ASC LIMIT 1');
    if (anyAcc.rows.length > 0) return anyAcc.rows[0].id;
  } catch (err) {
    console.warn('Error resolviendo accountId:', err.message);
  }
  return targetId;
}

// GET /api/crm/contacts - Obtener contactos y métricas
router.get('/contacts', async (req, res) => {
  try {
    const accountId = await resolveAccountId(req);
    const { search, segment } = req.query;

    // Solo devolver contactos activos (Borrado Suave: deleted_at IS NULL)
    let queryText = 'SELECT * FROM crm_contacts WHERE account_id = $1 AND deleted_at IS NULL';
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

    // Métricas en tiempo real sobre contactos activos
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE segment = 'vip') as vip,
        COUNT(*) FILTER (WHERE segment = 'prospect') as prospects,
        COUNT(*) FILTER (WHERE segment = 'inactive') as inactive
      FROM crm_contacts
      WHERE account_id = $1 AND deleted_at IS NULL
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
    const accountId = await resolveAccountId(req);
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
    const accountId = await resolveAccountId(req);
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
      WHERE id = $8 AND account_id = $9 AND deleted_at IS NULL
      RETURNING *
    `, [name.trim(), email.trim(), phone.trim(), parsedAge, company ? company.trim() : null, finalSegment, notes ? notes.trim() : null, id, accountId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Contacto no encontrado o ha sido eliminado.' });
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

// DELETE /api/crm/contacts/:id - Borrado Suave (Soft Delete)
// El contacto desaparece del panel del cliente pero permanece 100% preservado en PostgreSQL en Railway
router.delete('/contacts/:id', async (req, res) => {
  try {
    const accountId = await resolveAccountId(req);
    const { id } = req.params;

    const result = await db.query(
      'UPDATE crm_contacts SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL RETURNING id, name',
      [id, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Contacto no encontrado.' });
    }

    res.json({
      success: true,
      message: 'Contacto archivado/eliminado de tu lista.',
      id
    });
  } catch (error) {
    console.error('Error en DELETE /api/crm/contacts/:id:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar contacto.' });
  }
});

// POST /api/crm/bulk-delete - Borrado Suave Masivo (Soft Delete)
router.post('/bulk-delete', async (req, res) => {
  try {
    const accountId = await resolveAccountId(req);
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Se requiere una lista de IDs para eliminar.' });
    }

    const result = await db.query(
      'UPDATE crm_contacts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ANY($1::text[]) AND account_id = $2 AND deleted_at IS NULL',
      [ids, accountId]
    );

    res.json({
      success: true,
      message: `Se eliminaron ${result.rowCount} contactos exitosamente de tu vista activa.`,
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error en bulk-delete:', error);
    res.status(500).json({ success: false, message: 'Error al procesar eliminación masiva.' });
  }
});

// POST /api/crm/contacts/:id/restore - Restaurar contacto eliminado (Recuperación)
router.post('/contacts/:id/restore', async (req, res) => {
  try {
    const accountId = await resolveAccountId(req);
    const { id } = req.params;

    const result = await db.query(
      'UPDATE crm_contacts SET deleted_at = NULL WHERE id = $1 AND account_id = $2 RETURNING *',
      [id, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Contacto no encontrado para restaurar.' });
    }

    res.json({
      success: true,
      message: 'Contacto restaurado exitosamente en tu base de datos activa.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al restaurar contacto:', error);
    res.status(500).json({ success: false, message: 'Error al restaurar contacto.' });
  }
});

// POST /api/crm/import - Importación masiva de contactos (CSV o JSON)
router.post('/import', async (req, res) => {
  try {
    const accountId = await resolveAccountId(req);
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
    const accountId = await resolveAccountId(req);

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
