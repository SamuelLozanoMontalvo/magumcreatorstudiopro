const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken, requireAdmin);

// Función segura para sumar meses calendarios evitando el bug de desbordamiento (ej. 31 de enero + 1 mes)
function addMonthsSafe(dateObj, monthsToAdd) {
  const d = new Date(dateObj);
  const originalDay = d.getDate();
  d.setDate(1); // Mover temporalmente al día 1 para evitar saltos de mes
  d.setMonth(d.getMonth() + monthsToAdd);
  
  // Calcular el último día del mes objetivo
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDayOfMonth));
  return d;
}

// Calcular vigencia real del prepago y próximo cobro
function calculateBillingPeriod(startDateStr, plan, paymentStatus) {
  if (plan === 'lifetime') {
    return {
      status: 'lifetime',
      label: 'Acceso Vitalicio',
      date: 'De por vida',
      expirationDate: null,
      daysRemaining: null,
      isExpired: false
    };
  }

  const start = new Date(startDateStr);
  if (isNaN(start.getTime())) {
    return { status: 'unknown', label: 'Sin definir', date: 'N/A', daysRemaining: 0, isExpired: false };
  }

  const monthsMap = {
    monthly: 1,
    quarterly: 3,
    biannual: 6,
    annual: 12
  };

  const monthsToAdd = monthsMap[plan] || 1;
  const periodEnd = addMonthsSafe(start, monthsToAdd);
  const now = new Date();

  const diffTime = periodEnd.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isExpired = daysRemaining < 0;

  const yyyy = periodEnd.getFullYear();
  const mm = String(periodEnd.getMonth() + 1).padStart(2, '0');
  const dd = String(periodEnd.getDate()).padStart(2, '0');
  const dateFormatted = `${yyyy}-${mm}-${dd}`;

  let status = 'active';
  if (paymentStatus === 'unpaid') {
    status = 'unpaid';
  } else if (isExpired) {
    status = 'expired';
  } else if (daysRemaining <= 5) {
    status = 'due_soon';
  }

  return {
    status,
    label: `${dd}/${mm}/${yyyy}`,
    date: dateFormatted,
    expirationDate: dateFormatted,
    daysRemaining: isExpired ? 0 : daysRemaining,
    isExpired
  };
}

// GET /api/billing - Listar todas las suscripciones con cálculo unificado
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

    let totalHistoricalRevenue = 0;
    let monthlyRecurringRevenue = 0;
    let activeSubscribers = 0;
    let expiredSubscribers = 0;
    let lifetimeCount = 0;

    const items = result.rows.map(item => {
      const billingInfo = calculateBillingPeriod(item.startDate, item.plan, item.paymentStatus);
      const numAmount = parseFloat(item.amount) || 0;

      if (item.paymentStatus === 'paid') {
        totalHistoricalRevenue += numAmount;
      }

      if (item.plan === 'lifetime') {
        lifetimeCount++;
      } else if (billingInfo.isExpired) {
        expiredSubscribers++;
      } else if (item.paymentStatus === 'paid') {
        activeSubscribers++;
        // Normalizar MRR a valor mensual según el plan
        const normalizedMonthly = {
          monthly: numAmount,
          quarterly: numAmount / 3,
          biannual: numAmount / 6,
          annual: numAmount / 12
        }[item.plan] || numAmount;
        monthlyRecurringRevenue += normalizedMonthly;
      }

      return {
        ...item,
        nextBilling: billingInfo
      };
    });

    res.json({
      success: true,
      stats: {
        totalRevenue: Math.round(totalHistoricalRevenue * 100) / 100,
        mrr: Math.round(monthlyRecurringRevenue * 100) / 100,
        activeSubscribers,
        expiredSubscribers,
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

// POST /api/billing - Crear registro de facturación (Permite monto 0 para vitalicios/sin cobro)
router.post('/', async (req, res) => {
  try {
    const { clientName, business, plan, amount, startDate, modules, notes, accountId } = req.body;

    if (!clientName || !business || !plan || amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos o el monto es inválido. El monto puede ser 0 para clientes sin cobro.'
      });
    }

    const newId = 'B-' + crypto.randomUUID();
    const date = startDate || new Date().toISOString().split('T')[0];
    const numAmount = parseFloat(amount);

    const result = await db.query(`
      INSERT INTO billing (id, account_id, client_name, business, plan, amount, start_date, modules, notes, payment_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'paid')
      RETURNING *
    `, [newId, accountId || null, clientName.trim(), business.trim(), plan, numAmount, date, modules || 'CRM', notes || null]);

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

// PUT /api/billing/:id - Actualizar facturación (Permite monto 0)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clientName, business, plan, amount, startDate, modules, notes, paymentStatus } = req.body;

    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ success: false, message: 'El monto ingresado es inválido.' });
    }

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
    const result = await db.query('DELETE FROM billing WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Registro de facturación no encontrado.' });
    }
    res.json({ success: true, message: 'Registro de cobro eliminado.' });
  } catch (error) {
    console.error('Error en DELETE /api/billing/:id:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar facturación.' });
  }
});

module.exports = router;
