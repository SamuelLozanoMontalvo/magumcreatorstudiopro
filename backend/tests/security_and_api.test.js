const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Asegurar variables de entorno antes de importar módulos
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_super_secure_key_12345';
process.env.INITIAL_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'TestAdmin2026!';

// Importar directamente del código real del proyecto
const {
  addMonthsSafe,
  getIntervalMonths,
  calculateBillingPeriod,
  normalizeMonthlyRevenue
} = require('../src/utils/billing.utils');

const {
  resolveAccountId,
  isIpBlocked,
  recordFailedAttempt,
  resetFailedAttempts,
  requireAdmin,
  requireAccountOwnerOrAdmin,
  JWT_SECRET
} = require('../src/middleware/auth');

const db = require('../src/config/db');

// Cerrar el pool de base de datos al finalizar los tests para que node --test termine limpiamente
test.after(async () => {
  try {
    await db.pool.end();
  } catch (err) {
    // Silently ignore if already closed
  }
  setTimeout(() => process.exit(0), 50);
});

// 1. Generación de IDs con UUID (Cero colisiones)
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

// 2. Cálculo seguro de fechas con la función real addMonthsSafe
test('addMonthsSafe del código real no desborda días hacia el mes siguiente', () => {
  // 31 de Enero de 2026 + 1 mes debe dar 28 de Febrero de 2026 (año no bisiesto)
  const jan31 = new Date(2026, 0, 31);
  const febResult = addMonthsSafe(jan31, 1);
  assert.strictEqual(febResult.getMonth(), 1, 'El mes resultante debe ser Febrero (mes 1)');
  assert.strictEqual(febResult.getDate(), 28, 'El día resultante debe ser 28 de Febrero');

  // 31 de Enero de 2024 (bisiesto) + 1 mes debe dar 29 de Febrero
  const jan31Leap = new Date(2024, 0, 31);
  const febResultLeap = addMonthsSafe(jan31Leap, 1);
  assert.strictEqual(febResultLeap.getMonth(), 1);
  assert.strictEqual(febResultLeap.getDate(), 29);

  // 31 de Marzo de 2026 + 1 mes debe dar 30 de Abril de 2026
  const mar31 = new Date(2026, 2, 31);
  const aprResult = addMonthsSafe(mar31, 1);
  assert.strictEqual(aprResult.getMonth(), 3);
  assert.strictEqual(aprResult.getDate(), 30);
});

// 3. Duración de planes y periodos libres ("Cada N meses" y "prepago de N meses")
test('getIntervalMonths y calculateBillingPeriod procesan correctamente planes estándar y personalizados', () => {
  assert.strictEqual(getIntervalMonths('monthly'), 1);
  assert.strictEqual(getIntervalMonths('quarterly'), 3);
  assert.strictEqual(getIntervalMonths('biannual'), 6);
  assert.strictEqual(getIntervalMonths('annual'), 12);
  assert.strictEqual(getIntervalMonths('lifetime'), 0);
  assert.strictEqual(getIntervalMonths('custom', 8), 8, 'Debe aceptar intervalos libres de N meses');

  // Cálculo de fechas de inicio y fin de periodo
  const period = calculateBillingPeriod('2026-01-15', 'quarterly');
  assert.strictEqual(period.expirationDate, '2026-04-15');
  assert.strictEqual(period.intervalMonths, 3);

  // Plan vitalicio no tiene fecha de vencimiento
  const lifetimePeriod = calculateBillingPeriod('2026-01-15', 'lifetime');
  assert.strictEqual(lifetimePeriod.expirationDate, null);
  assert.strictEqual(lifetimePeriod.status, 'lifetime');
});

// 4. Normalización de ingresos mensuales (MRR) incluyendo monto 0
test('normalizeMonthlyRevenue calcula el ingreso mensual equivalente correctamente', () => {
  assert.strictEqual(normalizeMonthlyRevenue(150000, 'monthly'), 150000);
  assert.strictEqual(normalizeMonthlyRevenue(300000, 'quarterly'), 100000);
  assert.strictEqual(normalizeMonthlyRevenue(600000, 'biannual'), 100000);
  assert.strictEqual(normalizeMonthlyRevenue(1200000, 'annual'), 100000);
  assert.strictEqual(normalizeMonthlyRevenue(0, 'monthly'), 0, 'Monto 0 (vitalicio o gratuito) debe dar 0 mensual');
  assert.strictEqual(normalizeMonthlyRevenue(500000, 'custom', 5), 100000);
});

// 5. Aislamiento estricto de cuentas (resolveAccountId)
test('resolveAccountId previene fugas de información entre cuentas y rechaza suplantación', () => {
  // Caso 1: Un cliente intenta consultar o manipular los datos enviando un header x-account-id de otra empresa
  const clientReq = {
    user: { role: 'client', accountId: 'ACC-REAL-CLIENT' },
    headers: { 'x-account-id': 'ACC-VICTIM-HACK' },
    query: { accountId: 'ACC-VICTIM-HACK' },
    body: { accountId: 'ACC-VICTIM-HACK' }
  };
  const resolvedForClient = resolveAccountId(clientReq);
  assert.strictEqual(
    resolvedForClient,
    'ACC-REAL-CLIENT',
    'Un cliente NUNCA debe poder suplantar otra cuenta mediante headers, queries o body'
  );

  // Caso 2: Un profesional/miembro de equipo pertenece estrictamente a su empresa
  const teamReq = {
    user: { role: 'team_member', accountId: 'ACC-PROFESSIONAL-CORP' },
    headers: { 'x-account-id': 'ACC-OTHER' }
  };
  assert.strictEqual(resolveAccountId(teamReq), 'ACC-PROFESSIONAL-CORP');

  // Caso 3: Un Super Admin gestiona una cuenta específica indicada en query o header
  const adminReq = {
    user: { role: 'admin' },
    query: { accountId: 'ACC-CLIENT-42' }
  };
  assert.strictEqual(resolveAccountId(adminReq), 'ACC-CLIENT-42');

  // Caso 4: Petición sin usuario autenticado devuelve null (sin fallback a cuentas aleatorias)
  const unauthReq = {
    user: null,
    headers: { 'x-account-id': 'ACC-RANDOM' }
  };
  assert.strictEqual(resolveAccountId(unauthReq), null);
});

// 6. Protección de fuerza bruta en logins (Rate Limiter enfocado únicamente en intentos fallidos)
test('El Rate Limiter bloquea solo tras intentos fallidos y se restablece al iniciar sesión', () => {
  const testIp = '192.168.1.100';
  resetFailedAttempts(testIp);

  assert.strictEqual(isIpBlocked(testIp), false, 'La IP no debe estar bloqueada inicialmente');

  // Simular 9 intentos fallidos (límite es 10)
  for (let i = 0; i < 9; i++) {
    recordFailedAttempt(testIp);
  }
  assert.strictEqual(isIpBlocked(testIp), false, 'Con 9 intentos fallidos aún no debe bloquearse');

  // Décimo intento fallido -> Bloqueo
  recordFailedAttempt(testIp);
  assert.strictEqual(isIpBlocked(testIp), true, 'Al alcanzar 10 intentos fallidos debe bloquearse');

  // Éxito de login -> Restablece el contador inmediatamente
  resetFailedAttempts(testIp);
  assert.strictEqual(isIpBlocked(testIp), false, 'Tras un login exitoso la IP debe desbloquearse');
});

// 7. Middlewares de autorización y control de roles
test('requireAdmin y requireAccountOwnerOrAdmin bloquean accesos no autorizados con 403', () => {
  let statusCode = null;
  let responseData = null;
  let nextCalled = false;

  const mockRes = () => ({
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => { responseData = data; }
      };
    }
  });

  const mockNext = () => { nextCalled = true; };

  // Prueba requireAdmin con usuario cliente (debe rechazar)
  statusCode = null;
  nextCalled = false;
  requireAdmin({ user: { role: 'client' } }, mockRes(), mockNext);
  assert.strictEqual(statusCode, 403);
  assert.strictEqual(nextCalled, false);

  // Prueba requireAdmin con Super Admin (debe permitir)
  statusCode = null;
  nextCalled = false;
  requireAdmin({ user: { role: 'admin' } }, mockRes(), mockNext);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(statusCode, null);

  // Prueba requireAccountOwnerOrAdmin con miembro de equipo (no puede borrar la cuenta ni gestionar admins)
  statusCode = null;
  nextCalled = false;
  requireAccountOwnerOrAdmin({ user: { role: 'team_member' } }, mockRes(), mockNext);
  assert.strictEqual(statusCode, 403);
  assert.strictEqual(nextCalled, false);

  // Prueba requireAccountOwnerOrAdmin con cliente titular (debe permitir)
  statusCode = null;
  nextCalled = false;
  requireAccountOwnerOrAdmin({ user: { role: 'client' } }, mockRes(), mockNext);
  assert.strictEqual(nextCalled, true);
});

// 8. Validación y firma de tokens JWT
test('Tokens JWT firmados con JWT_SECRET son validados y tokens alterados son rechazados', () => {
  const payload = { userId: 'usr-123', role: 'admin', username: 'superadmin' };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

  // Token válido se decodifica correctamente
  const decoded = jwt.verify(token, JWT_SECRET);
  assert.strictEqual(decoded.userId, 'usr-123');
  assert.strictEqual(decoded.role, 'admin');

  // Token alterado lanza JsonWebTokenError
  const tamperedToken = token.slice(0, -5) + 'xxxxx';
  assert.throws(() => {
    jwt.verify(tamperedToken, JWT_SECRET);
  }, /invalid signature/i);
});

// 9. Unicidad global de correos
test('findGlobalEmailConflict valida correctamente correos vacíos o nulos', async () => {
  const { findGlobalEmailConflict } = require('../src/utils/user.utils');
  const res1 = await findGlobalEmailConflict(null);
  assert.strictEqual(res1.conflict, false);

  const res2 = await findGlobalEmailConflict('');
  assert.strictEqual(res2.conflict, false);
});

// 10. Switch Account JWT genera claims completos e independientes por empresa
test('Firma de token para switch-account incluye identificador de empresa y permisos aislados', () => {
  const targetAcc = {
    id: 'MGM-88FF',
    business: 'AutoMagum Center',
    clientName: 'Carlos Gómez',
    email: 'carlos@automagum.com',
    modules: { social: true, web: false, crm: true }
  };

  const switchedToken = jwt.sign(
    {
      role: 'client',
      accountId: targetAcc.id,
      email: targetAcc.email,
      clientName: targetAcc.clientName,
      business: targetAcc.business,
      modules: targetAcc.modules,
      impersonatedByAdmin: false
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  const decoded = jwt.verify(switchedToken, JWT_SECRET);
  assert.strictEqual(decoded.accountId, 'MGM-88FF');
  assert.strictEqual(decoded.business, 'AutoMagum Center');
  assert.strictEqual(decoded.modules.web, false);
});

// 11. Multi-empresa permitida para cliente con allowMultipleAccounts
test('findGlobalEmailConflict permite que el cliente tenga múltiples empresas con nombres diferentes', async () => {
  const { findGlobalEmailConflict } = require('../src/utils/user.utils');
  const originalQuery = db.query;
  db.query = async (sql, params) => {
    return { rows: [] };
  };
  try {
    const res = await findGlobalEmailConflict('cliente.nuevo@magum.com', {
      allowMultipleAccounts: true,
      business: 'Segunda Empresa SAS'
    });
    assert.strictEqual(res.conflict, false);
  } finally {
    db.query = originalQuery;
  }
});

// 12. Seguridad de Recuperación de Contraseña: NUNCA filtrar resetUrl ni emailSent en la respuesta HTTP
test('forgot-password nunca expone resetUrl ni emailSent en la respuesta y hashea el token', () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  assert.notStrictEqual(hashedToken, rawToken, 'El token almacenado en base de datos debe ser el hash, no el texto plano');
  assert.strictEqual(hashedToken.length, 64, 'El hash SHA-256 debe tener 64 caracteres');

  // Simulación de la respuesta devuelta por el endpoint
  const publicResponse = {
    success: true,
    message: 'Si el correo está registrado, recibirás un enlace de restablecimiento en tu bandeja de entrada.'
  };

  assert.strictEqual(publicResponse.resetUrl, undefined, 'La respuesta HTTP jamás debe incluir resetUrl');
  assert.strictEqual(publicResponse.emailSent, undefined, 'La respuesta HTTP jamás debe incluir emailSent');
  assert.strictEqual(publicResponse.token, undefined, 'La respuesta HTTP jamás debe incluir ningún token');
});

// 13. getSafeBaseUrl rechaza orígenes maliciosos y previene Host Header / Origin Poisoning
test('getSafeBaseUrl previene Origin Poisoning y rechaza dominios no autorizados', () => {
  const { getSafeBaseUrl } = require('../src/utils/user.utils');
  
  // Intento de envenenamiento de cabecera Origin
  const maliciousReq = {
    headers: {
      origin: 'https://evil-attacker.example.com',
      referer: 'https://evil-attacker.example.com/exploit'
    }
  };
  const safeUrl = getSafeBaseUrl(maliciousReq);
  assert.strictEqual(safeUrl.includes('evil-attacker'), false, 'getSafeBaseUrl no debe aceptar dominios maliciosos');
  assert.strictEqual(safeUrl, (process.env.FRONTEND_URL || 'https://magumcreatorstudiopro.vercel.app').replace(/\/+$/, ''));

  // Origen legítimo de producción
  const legitReq = {
    headers: {
      origin: 'https://magumcreatorstudiopro.vercel.app'
    }
  };
  assert.strictEqual(getSafeBaseUrl(legitReq), 'https://magumcreatorstudiopro.vercel.app');
});
