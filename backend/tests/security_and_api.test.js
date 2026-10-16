const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// 1. Prueba de generador de IDs únicos (Cero colisiones con UUID)
test('Generación de IDs con UUID produce identificadores únicos sin colisiones', () => {
  const ids = new Set();
  const TOTAL = 2000;
  for (let i = 0; i < TOTAL; i++) {
    const id = 'C-' + crypto.randomUUID();
    assert.strictEqual(ids.has(id), false, `Colisión detectada en iteración ${i}: ${id}`);
    ids.add(id);
  }
  assert.strictEqual(ids.size, TOTAL);
});

// 2. Prueba del cálculo seguro de fechas (Bug de desbordamiento de setMonth)
test('addMonthsSafe no desborda días hacia el mes siguiente (ej. 31 de Enero + 1 mes)', () => {
  function addMonthsSafe(dateObj, monthsToAdd) {
    const d = new Date(dateObj);
    const originalDay = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthsToAdd);
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(originalDay, lastDayOfMonth));
    return d;
  }

  // 31 de Enero de 2026 + 1 mes debe dar 28 de Febrero de 2026 (no 2 ó 3 de Marzo)
  const jan31 = new Date(2026, 0, 31); // Enero = mes 0
  const febResult = addMonthsSafe(jan31, 1);
  assert.strictEqual(febResult.getMonth(), 1, 'El mes resultante debe ser Febrero (mes 1)');
  assert.strictEqual(febResult.getDate(), 28, 'El día resultante debe ser 28 de Febrero');

  // 31 de Marzo de 2026 + 1 mes debe dar 30 de Abril de 2026
  const mar31 = new Date(2026, 2, 31);
  const aprResult = addMonthsSafe(mar31, 1);
  assert.strictEqual(aprResult.getMonth(), 3, 'El mes resultante debe ser Abril (mes 3)');
  assert.strictEqual(aprResult.getDate(), 30, 'El día resultante debe ser 30 de Abril');
});

// 3. Prueba de validación de monto 0 en facturación
test('Validación de monto en facturación permite monto 0 (clientes vitalicios o gratuitos)', () => {
  function isValidBillingAmount(amount) {
    return !(amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0);
  }

  assert.strictEqual(isValidBillingAmount(0), true, 'Monto 0 debe ser válido');
  assert.strictEqual(isValidBillingAmount('0'), true, 'Monto "0" en string debe ser válido');
  assert.strictEqual(isValidBillingAmount(150000), true, 'Monto positivo debe ser válido');
  assert.strictEqual(isValidBillingAmount(-50), false, 'Monto negativo debe ser rechazado');
  assert.strictEqual(isValidBillingAmount(null), false, 'Monto null debe ser rechazado');
  assert.strictEqual(isValidBillingAmount('abc'), false, 'Monto no numérico debe ser rechazado');
});

// 4. Prueba de sanitización y parsing seguro de edad en CRM
test('Parsing de edad en CRM maneja NaN e inválidos de forma segura sin romper la consulta SQL', () => {
  function parseSafeAge(rawAge) {
    const parsed = parseInt(rawAge, 10);
    return (!isNaN(parsed) && parsed >= 0 && parsed <= 120) ? parsed : null;
  }

  assert.strictEqual(parseSafeAge('35'), 35);
  assert.strictEqual(parseSafeAge(42), 42);
  assert.strictEqual(parseSafeAge('abc'), null, 'Strings no numéricos deben convertirse en null en vez de NaN');
  assert.strictEqual(parseSafeAge(undefined), null);
  assert.strictEqual(parseSafeAge(-5), null, 'Edades negativas deben convertirse en null');
  assert.strictEqual(parseSafeAge(250), null, 'Edades mayores a 120 deben convertirse en null');
});

// 5. Prueba de expiración de planes prepago
test('Cálculo de vigencia de planes detecta correctamente suscripciones vencidas', () => {
  function isPrepaidExpired(startDateStr, planMonths, referenceDate = new Date()) {
    const start = new Date(startDateStr);
    const end = new Date(start);
    end.setMonth(end.getMonth() + planMonths);
    return referenceDate > end;
  }

  // Una suscripción mensual iniciada hace 40 días debe estar expirada
  const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  assert.strictEqual(isPrepaidExpired(fortyDaysAgo, 1), true, 'Plan mensual de hace 40 días debe estar expirado');

  // Una suscripción anual iniciada hace 40 días debe estar activa
  assert.strictEqual(isPrepaidExpired(fortyDaysAgo, 12), false, 'Plan anual de hace 40 días debe estar activo');
});
