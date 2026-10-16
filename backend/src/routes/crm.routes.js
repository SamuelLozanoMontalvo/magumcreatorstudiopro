const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const { verifyToken, requireClientOrTeam } = require('../middleware/auth');

router.use(verifyToken, requireClientOrTeam);

// Helper estricto para resolver el account_id sin fugas entre cuentas
function resolveAccountId(req) {
  if (req.user && (req.user.role === 'client' || req.user.role === 'team_member')) {
    return req.user.accountId;
  }
  if (req.user && req.user.role === 'admin') {
    const requestedId = req.query.accountId || (req.body && req.body.accountId) || req.headers['x-account-id'];
    return requestedId || null;
  }
  return null;
}

// GET /api/crm/contacts - Obtener contactos y métricas con aislamiento estricto
router.get('/contacts', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere especificar accountId para consultar contactos de CRM.'
      });
    }

    const { search, segment } = req.query;

    let queryText = 'SELECT * FROM crm_contacts WHERE account_id = $1 AND deleted_at IS NULL';
    const params = [accountId];

    if (segment && segment !== 'all') {
      params.push(segment);
      queryText += ` AND segment = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.toLowerCase().trim()}%`);
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

// POST /api/crm/contacts - Crear contacto con UUID único sin colisiones
router.post('/contacts', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere una cuenta asociada para crear contactos.' });
    }

    const { name, email, phone, age, company, segment, notes } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, correo y celular son obligatorios.'
      });
    }

    const emailClean = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailClean)) {
      return res.status(400).json({ success: false, message: 'El formato de correo electrónico no es válido.' });
    }

    // Verificar si ya existe contacto activo con ese correo en la cuenta
    const existing = await db.query(
      'SELECT id FROM crm_contacts WHERE account_id = $1 AND LOWER(email) = $2 AND deleted_at IS NULL',
      [accountId, emailClean]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un contacto registrado con este correo en tu CRM.'
      });
    }

    const newId = 'C-' + crypto.randomUUID();
    const parsedAge = age ? parseInt(age, 10) : null;
    const safeAge = (!isNaN(parsedAge) && parsedAge >= 0 && parsedAge <= 120) ? parsedAge : null;
    const finalSegment = ['vip', 'prospect', 'inactive', 'client'].includes(segment) ? segment : 'client';

    const result = await db.query(`
      INSERT INTO crm_contacts (id, account_id, name, email, phone, age, company, segment, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [newId, accountId, name.trim(), emailClean, phone.trim(), safeAge, company ? company.trim() : null, finalSegment, notes ? notes.trim() : null]);

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
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere una cuenta asociada.' });
    }

    const { id } = req.params;
    const { name, email, phone, age, company, segment, notes } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, correo y celular son obligatorios.'
      });
    }

    const emailClean = email.trim().toLowerCase();
    const parsedAge = age ? parseInt(age, 10) : null;
    const safeAge = (!isNaN(parsedAge) && parsedAge >= 0 && parsedAge <= 120) ? parsedAge : null;
    const finalSegment = ['vip', 'prospect', 'inactive', 'client'].includes(segment) ? segment : 'client';

    const result = await db.query(`
      UPDATE crm_contacts 
      SET name = $1, email = $2, phone = $3, age = $4, company = $5, segment = $6, notes = $7
      WHERE id = $8 AND account_id = $9 AND deleted_at IS NULL
      RETURNING *
    `, [name.trim(), emailClean, phone.trim(), safeAge, company ? company.trim() : null, finalSegment, notes ? notes.trim() : null, id, accountId]);

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
router.delete('/contacts/:id', async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere cuenta asociada.' });
    }

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
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere cuenta asociada.' });
    }

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
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere cuenta asociada.' });
    }

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

// POST /api/crm/import - Importación masiva transaccional, validada y con deduplicación
router.post('/import', async (req, res) => {
  const accountId = resolveAccountId(req);
  if (!accountId) {
    return res.status(400).json({ success: false, message: 'Se requiere cuenta asociada para importar contactos.' });
  }

  const { contacts } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ success: false, message: 'No se enviaron contactos para importar.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Obtener correos existentes en la cuenta para no duplicar
    const existingEmailsRes = await client.query(
      'SELECT LOWER(email) as email FROM crm_contacts WHERE account_id = $1 AND deleted_at IS NULL',
      [accountId]
    );
    const existingEmails = new Set(existingEmailsRes.rows.map(r => r.email));

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let inserted = 0;
    let duplicates = 0;
    let skipped = 0;

    for (const c of contacts) {
      if (!c || !c.name || !c.email || !c.phone) {
        skipped++;
        continue;
      }

      const emailClean = String(c.email).trim().toLowerCase();
      if (!emailRegex.test(emailClean)) {
        skipped++;
        continue;
      }

      if (existingEmails.has(emailClean)) {
        duplicates++;
        continue;
      }

      const newId = 'C-' + crypto.randomUUID();
      const rawAge = parseInt(c.age, 10);
      const age = (!isNaN(rawAge) && rawAge >= 0 && rawAge <= 120) ? rawAge : null;
      let segment = (c.segment || 'client').toLowerCase();
      if (!['vip', 'prospect', 'inactive', 'client'].includes(segment)) segment = 'client';

      await client.query(`
        INSERT INTO crm_contacts (id, account_id, name, email, phone, age, company, segment, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        newId,
        accountId,
        String(c.name).trim(),
        emailClean,
        String(c.phone).trim(),
        age,
        c.company ? String(c.company).trim() : null,
        segment,
        c.notes ? String(c.notes).trim() : null
      ]);

      existingEmails.add(emailClean);
      inserted++;
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Importación completada: ${inserted} contactos guardados, ${duplicates} omitidos por duplicidad, ${skipped} inválidos.`,
      importedCount: inserted,
      duplicateCount: duplicates,
      skippedCount: skipped
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en /api/crm/import (transacción revertida):', error);
    res.status(500).json({ success: false, message: 'Error durante la importación masiva. No se realizaron cambios parciales.' });
  } finally {
    client.release();
  }
});

// POST /api/crm/broadcast - Emisión de campañas (Integración con estado honesto)
router.post('/broadcast', async (req, res) => {
  try {
    const { channel, recipientIds, subject, message } = req.body;
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Se requiere cuenta asociada.' });
    }

    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No se seleccionaron destinatarios.' });
    }

    const contactsRes = await db.query(
      'SELECT id, name, email, phone, company FROM crm_contacts WHERE id = ANY($1::text[]) AND account_id = $2 AND deleted_at IS NULL',
      [recipientIds, accountId]
    );

    const recipients = contactsRes.rows;

    res.json({
      success: true,
      status: 'scheduled_preview',
      message: `Campaña ${channel.toUpperCase()} configurada para ${recipients.length} contactos. Próximamente integración directa con API oficial de WhatsApp Business y SendGrid.`,
      summary: {
        channel,
        totalRecipients: recipients.length,
        dispatchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error en /api/crm/broadcast:', error);
    res.status(500).json({ success: false, message: 'Error al procesar campaña.' });
  }
});

module.exports = router;
