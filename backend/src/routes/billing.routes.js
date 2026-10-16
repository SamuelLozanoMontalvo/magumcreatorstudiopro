const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  addMonthsSafe,
  getIntervalMonths,
  calculateBillingPeriod,
  normalizeMonthlyRevenue
} = require('../utils/billing.utils');

router.use(verifyToken, requireAdmin);

// GET /api/billing - Listar todas las suscripciones con cálculo unificado
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        b.id,
        b.account_id as "accountId",
        b.account_ids as "accountIds",
        b.client_name as "clientName",
        b.business,
        b.plan,
        b.interval_months as "intervalMonths",
        b.billing_type as "billingType",
        b.amount,
        b.start_date as "startDate",
        b.modules,
        b.notes,
        b.payment_status as "paymentStatus",
        b.payment_history as "paymentHistory",
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
      const billingInfo = calculateBillingPeriod(
        item.startDate,
        item.plan,
        item.intervalMonths,
        item.paymentStatus
      );
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
        monthlyRecurringRevenue += normalizeMonthlyRevenue(numAmount, item.plan, item.intervalMonths);
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

// POST /api/billing - Crear registro de facturación (Soporte flexible de prepago, intervalos libres y multi-empresa)
router.post('/', async (req, res) => {
  try {
    const { clientName, business, plan, intervalMonths, billingType, amount, startDate, modules, notes, accountId, accountIds } = req.body;

    if (!clientName || !business || !plan || amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos o el monto es inválido. El monto puede ser 0 para vitalicios o cortesías.'
      });
    }

    const newId = 'B-' + crypto.randomUUID();
    const date = startDate || new Date().toISOString().split('T')[0];
    const numAmount = parseFloat(amount);
    const months = getIntervalMonths(plan, intervalMonths);
    const type = billingType || (plan === 'lifetime' ? 'lifetime' : 'recurring');
    const linkedAccountIds = Array.isArray(accountIds) ? accountIds : (accountId ? [accountId] : []);

    const initialHistory = [{
      paymentId: 'PAY-' + crypto.randomUUID(),
      amount: numAmount,
      date,
      plan,
      intervalMonths: months,
      type,
      notes: notes || 'Primer registro / alta de suscripción'
    }];

    const result = await db.query(`
      INSERT INTO billing (
        id, account_id, account_ids, client_name, business, plan, 
        interval_months, billing_type, amount, start_date, modules, 
        notes, payment_status, payment_history
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'paid', $13)
      RETURNING *
    `, [
      newId,
      accountId || (linkedAccountIds[0] || null),
      linkedAccountIds,
      clientName.trim(),
      business.trim(),
      plan,
      months,
      type,
      numAmount,
      date,
      modules || 'CRM',
      notes ? notes.trim() : null,
      JSON.stringify(initialHistory)
    ]);

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

// POST /api/billing/:id/renew - Registrar pago y renovar suscripción vencida o vigente
router.post('/:id/renew', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentDate, notes, extendMonths } = req.body;

    const billRes = await db.query('SELECT * FROM billing WHERE id = $1', [id]);
    if (billRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Registro de cobro no encontrado.' });
    }

    const currentBill = billRes.rows[0];
    const payDateStr = paymentDate || new Date().toISOString().split('T')[0];
    const payAmount = (amount !== undefined && !isNaN(Number(amount))) ? parseFloat(amount) : parseFloat(currentBill.amount);

    // Calcular nueva fecha de inicio o período
    const monthsToAdd = Number(extendMonths) > 0 ? parseInt(extendMonths, 10) : (currentBill.interval_months || 1);
    const billingInfo = calculateBillingPeriod(currentBill.start_date, currentBill.plan, currentBill.interval_months, currentBill.payment_status);

    let newStartDate = payDateStr;
    // Si la suscripción no estaba vencida todavía, extender desde su fecha de vencimiento actual
    if (!billingInfo.isExpired && billingInfo.expirationDate) {
      newStartDate = billingInfo.expirationDate;
    }

    let history = currentBill.payment_history || [];
    if (!Array.isArray(history)) history = [];

    history.push({
      paymentId: 'PAY-' + crypto.randomUUID(),
      amount: payAmount,
      date: payDateStr,
      newPeriodStart: newStartDate,
      extendedMonths: monthsToAdd,
      notes: notes || 'Renovación de suscripción / pago recibido'
    });

    const updateRes = await db.query(`
      UPDATE billing
      SET start_date = $1, payment_status = 'paid', payment_history = $2, notes = COALESCE($3, notes)
      WHERE id = $4
      RETURNING *
    `, [newStartDate, JSON.stringify(history), notes ? notes.trim() : null, id]);

    res.json({
      success: true,
      message: 'Pago registrado exitosamente. La suscripción ha sido renovada.',
      data: updateRes.rows[0]
    });
  } catch (error) {
    console.error('Error en POST /api/billing/:id/renew:', error);
    res.status(500).json({ success: false, message: 'Error al renovar suscripción.' });
  }
});

// PUT /api/billing/:id - Actualizar facturación con validaciones completas
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clientName, business, plan, intervalMonths, billingType, amount, startDate, modules, notes, paymentStatus, accountIds } = req.body;

    if (!clientName || !business || !plan || amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ success: false, message: 'Datos incompletos o monto inválido.' });
    }

    const validStatuses = ['paid', 'pending', 'overdue', 'cancelled', 'refunded'];
    const finalStatus = validStatuses.includes(paymentStatus) ? paymentStatus : 'paid';
    const months = getIntervalMonths(plan, intervalMonths);
    const linkedIds = Array.isArray(accountIds) ? accountIds : [];

    const result = await db.query(`
      UPDATE billing
      SET 
        client_name = $1, 
        business = $2, 
        plan = $3, 
        interval_months = $4,
        billing_type = $5,
        amount = $6, 
        start_date = $7, 
        modules = $8, 
        notes = $9, 
        payment_status = $10,
        account_ids = $11
      WHERE id = $12
      RETURNING *
    `, [
      clientName.trim(),
      business.trim(),
      plan,
      months,
      billingType || 'recurring',
      parseFloat(amount),
      startDate,
      modules || 'CRM',
      notes ? notes.trim() : null,
      finalStatus,
      linkedIds,
      id
    ]);

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
