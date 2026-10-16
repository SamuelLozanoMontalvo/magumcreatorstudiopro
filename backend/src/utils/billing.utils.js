// Utilidades para cálculo de facturación, fechas y vigencia de suscripciones

/**
 * Parsea una fecha asegurando hora local al mediodía para evitar desfases por zona horaria UTC.
 */
function parseLocalDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 12, 0, 0);
  }
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput.trim())) {
    const parts = dateInput.trim().split('T')[0].split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  const d = new Date(dateInput);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

/**
 * Suma meses a una fecha sin desbordamiento de fin de mes.
 * Ejemplo: 31 de Enero + 1 mes = 28/29 de Febrero (no 2 ó 3 de Marzo).
 */
function addMonthsSafe(dateObj, monthsToAdd) {
  const d = parseLocalDate(dateObj) || new Date();
  
  const originalDay = d.getDate();
  d.setDate(1); // Mover temporalmente al día 1 del mes para evitar saltos inesperados
  d.setMonth(d.getMonth() + monthsToAdd);
  
  // Obtener el último día del mes destino
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDayOfMonth));
  return d;
}

/**
 * Mapea el plan o intervalo en meses a un número entero de meses.
 */
function getIntervalMonths(plan, customInterval) {
  if (plan === 'lifetime') return 0;
  if (plan === 'custom' && Number(customInterval) > 0) {
    return parseInt(customInterval, 10);
  }
  const map = {
    monthly: 1,
    quarterly: 3,
    biannual: 6,
    annual: 12
  };
  return map[plan] || (Number(customInterval) > 0 ? parseInt(customInterval, 10) : 1);
}

/**
 * Calcula el período de facturación, fecha de vencimiento y estado de vigencia.
 */
function calculateBillingPeriod(startDateStr, plan, customInterval = null, paymentStatus = 'paid', referenceDate = new Date()) {
  if (plan === 'lifetime') {
    return {
      status: 'lifetime',
      label: 'Acceso Vitalicio',
      date: 'De por vida',
      expirationDate: null,
      daysRemaining: null,
      isExpired: false,
      intervalMonths: 0
    };
  }

  const start = parseLocalDate(startDateStr);
  if (!start) {
    return {
      status: 'unknown',
      label: 'Sin definir',
      date: 'N/A',
      expirationDate: null,
      daysRemaining: 0,
      isExpired: false,
      intervalMonths: 1
    };
  }

  const monthsToAdd = getIntervalMonths(plan, customInterval);
  const periodEnd = addMonthsSafe(start, monthsToAdd);
  const now = parseLocalDate(referenceDate) || new Date();

  const diffTime = periodEnd.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isExpired = daysRemaining < 0;

  const yyyy = periodEnd.getFullYear();
  const mm = String(periodEnd.getMonth() + 1).padStart(2, '0');
  const dd = String(periodEnd.getDate()).padStart(2, '0');
  const dateFormatted = `${yyyy}-${mm}-${dd}`;

  let status = 'active';
  if (paymentStatus === 'cancelled') {
    status = 'cancelled';
  } else if (paymentStatus === 'refunded') {
    status = 'refunded';
  } else if (paymentStatus === 'unpaid' || paymentStatus === 'pending') {
    status = 'pending';
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
    isExpired,
    intervalMonths: monthsToAdd
  };
}

/**
 * Normaliza el ingreso recurrente mensual (MRR) según el intervalo.
 */
function normalizeMonthlyRevenue(amount, plan, customInterval = null) {
  const numAmount = parseFloat(amount) || 0;
  if (plan === 'lifetime' || numAmount <= 0) return 0;
  const months = getIntervalMonths(plan, customInterval);
  return months > 0 ? (numAmount / months) : numAmount;
}

module.exports = {
  addMonthsSafe,
  getIntervalMonths,
  calculateBillingPeriod,
  normalizeMonthlyRevenue
};
