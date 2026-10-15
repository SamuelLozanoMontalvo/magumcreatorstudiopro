const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken, requireAdmin);

// Función auxiliar para calcular la fecha del próximo cobro según el plan
function calculateNextBilling(startDateStr, plan) {
  if (plan === 'lifetime') {
    return {
      status: 'lifetime',
      label: 'Acceso Vitalicio',
      date: 'De por vida',
      daysRemaining: null
    };
  }

  const start = new Date(startDateStr);
  if (isNaN(start.getTime())) {
    return { status: 'unknown', label: 'Sin definir', date: 'N/A', daysRemaining: 0 };
  }

  const now = new Date();
  let nextDate = new Date(start);

  let monthsToAdd = 1;
  if (plan === 'quarterly') monthsToAdd = 3;
  if (plan === 'biannual') monthsToAdd = 6;
  if (plan === 'annual') monthsToAdd = 12;

  while (nextDate <= now) {
    nextDate.setMonth(nextDate.getMonth() + monthsToAdd);
  }

  const diffTime = nextDate - now;
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const yyyy = nextDate.getFullYear();
  const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
  const dd = String(nextDate.getDate()).padStart(2, '0');

  return {
    status: daysRemaining <= 5 ? 'due_soon' : 'active',
    label: `${dd}/${mm}/${yyyy}`,
    date: `${yyyy}-${mm}-${dd}`,
    daysRemaining
  };
}

// GET /api/billing - Listar todas las suscripciones y cobros
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        b.id,
        b.account_id as "accountId",
        b.client_name as "clientName",
        b.business,
        b.plan,
        b.amount,
        b.start_date as "startDate",
        b.modules,
        b.notes,
        b.payment_status as "paymentStatus",
        b.created_at as "createdAt"
      FROM billing b
      ORDER BY b.start_date DESC
    `);

    const items = result.rows.map(item => {
      const billingInfo = calculateNextBilling(item.startDate, item.plan);
      return {
        ...item,
        nextBilling: billingInfo
      };
    });

    // Métricas globales
    const totalAmount = items.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);
    const activeSubscribers = items.filter(i => i.plan !== 'lifetime').length;
    const lifetimeCount = items.filter(i => i.plan === 'lifetime').length;

    res.json({
      success: true,
      stats: {
        totalRevenue: totalAmount,
        activeSubscribers,
        lifetimeCount,
        totalClients: items.length
      },
      data: items
    });
  } catch (error) {
    console.error('Error en GET /api/billing:', error);
    res.status(500).json({ success: false, message: 'Error al obtener facturación.' });
  }
});

// POST /api/billing - Crear registro de facturación
router.post('/', async (req, res) => {
  try {
    const { clientName, business, plan, amount, startDate, modules, notes, accountId } = req.body;

    if (!clientName || !business || !plan || !amount) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos para la facturación.' });
    }

    const newId = 'B' + Math.floor(1000 + Math.random() * 9000);
    const date = startDate || new Date().toISOString().split('T')[0];

    const result = await db.query(`
      INSERT INTO billing (id, account_id, client_name, business, plan, amount, start_date, modules, notes, payment_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'paid')
      RETURNING *
    `, [newId, accountId || null, clientName.trim(), business.trim(), plan, parseFloat(amount), date, modules || 'CRM', notes || null]);

    res.status(201).json({
      success: true,
      message: 'Registro de facturación guardado.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error en POST /api/billing:', error);
    res.status(500).json({ success: false, message: 'Error al registrar facturación.' });
  }
});

// PUT /api/billing/:id - Actualizar facturación
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clientName, business, plan, amount, startDate, modules, notes, paymentStatus } = req.body;

    const result = await db.query(`
      UPDATE billing
      SET client_name = $1, business = $2, plan = $3, amount = $4, start_date = $5, modules = $6, notes = $7, payment_status = $8
      WHERE id = $9
      RETURNING *
    `, [clientName, business, plan, parseFloat(amount), startDate, modules, notes, paymentStatus || 'paid', id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Registro de cobro no encontrado.' });
    }

    res.json({
      success: true,
      message: 'Facturación actualizada exitosamente.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error en PUT /api/billing/:id:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar facturación.' });
  }
});

// DELETE /api/billing/:id - Eliminar facturación
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM billing WHERE id = $1', [id]);
    res.json({ success: true, message: 'Registro de facturación eliminado.' });
  } catch (error) {
    console.error('Error en DELETE /api/billing/:id:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar facturación.' });
  }
});

module.exports = router;
