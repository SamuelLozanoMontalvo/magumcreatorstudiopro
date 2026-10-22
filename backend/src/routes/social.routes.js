const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { verifyToken, resolveAccountId, JWT_SECRET } = require('../middleware/auth');
require('dotenv').config();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://magumcreatorstudiopro.vercel.app';
const META_APP_ID = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
const getBaseServerUrl = () => {
  return (process.env.SERVER_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://magum-api.onrender.com').replace(/\/$/, '');
};

// ============================================================================
// 1. OBTENER ESTADO DE CANALES CONECTADOS POR EMPRESA (MULTI-TENANT AISLADO)
// ============================================================================
router.get('/connections', verifyToken, async (req, res) => {
  try {
    let accountId = resolveAccountId(req);
    if (!accountId && req.user && req.user.role === 'admin') {
      try {
        const firstAcc = await db.query('SELECT id FROM accounts WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1');
        if (firstAcc.rows.length > 0) {
          accountId = firstAcc.rows[0].id;
        }
      } catch (e) {
        console.warn('Error resolviendo cuenta para admin en connections:', e.message);
      }
    }

    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Identificador de cuenta no proporcionado.' });
    }

    const result = await db.query(`
      SELECT id, provider, provider_account_id, account_name, account_avatar,
             status, last_synced_at, metrics_cache, created_at
      FROM social_connections
      WHERE account_id = $1
      ORDER BY created_at ASC
    `, [accountId]);

    res.json({
      success: true,
      accountId,
      connections: result.rows
    });
  } catch (err) {
    console.error('Error al consultar conexiones sociales:', err);
    res.status(500).json({ success: false, message: 'Error interno al consultar conexiones sociales.' });
  }
});

// ============================================================================
// 2. GENERAR URL OFICIAL DE OAUTH 2.0 (META, TIKTOK, LINKEDIN)
// ============================================================================
router.get('/oauth/url/:provider', verifyToken, async (req, res) => {
  try {
    let accountId = resolveAccountId(req);

    // Si es Super Admin y no especificó accountId en cabecera/query, resolver al primer account activo
    if (!accountId && req.user && req.user.role === 'admin') {
      try {
        const firstAcc = await db.query('SELECT id FROM accounts WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1');
        if (firstAcc.rows.length > 0) {
          accountId = firstAcc.rows[0].id;
        }
      } catch (e) {
        console.warn('Error resolviendo cuenta para admin:', e.message);
      }
    }

    const { provider } = req.params;

    if (!accountId) {
      return res.status(400).json({ success: false, message: 'No se pudo determinar la cuenta activa.' });
    }

    // State criptográficamente firmado que transporta el accountId de forma segura e invulnerable a CSRF
    const stateToken = jwt.sign(
      { accountId, provider, nonce: crypto.randomBytes(16).toString('hex') },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const appId = (process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '').trim();
    const isMeta = (provider === 'meta' || provider === 'facebook' || provider === 'instagram');
    const serverBase = getBaseServerUrl();
    const redirectUri = isMeta 
      ? `${serverBase}/api/social/callback/meta` 
      : `${serverBase}/api/social/callback/${provider}`;

    let authUrl = '';

    if (isMeta) {
      if (!appId) {
        return res.status(400).json({
          success: false,
          needsCredentials: true,
          message: 'Se requiere configurar META_APP_ID en las variables de entorno de Railway para el flujo de autorización en vivo.'
        });
      }
      // Permiso base oficial compatible sin errores de permisos no habilitados
      const scopes = (process.env.META_OAUTH_SCOPES || 'public_profile').trim();

      authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${stateToken}&response_type=code`;
    } else {
      return res.status(400).json({ success: false, message: `Proveedor ${provider} en proceso de homologación.` });
    }

    res.json({
      success: true,
      provider,
      authUrl
    });
  } catch (err) {
    console.error('Error generando URL OAuth:', err);
    res.status(500).json({ success: false, message: 'Error al generar enlace de autorización.' });
  }
});

// Cache en memoria para deduplicar peticiones simultáneas del navegador con el mismo código OAuth
const processedCodes = new Map();
const activeCodeLocks = new Map();

// ============================================================================
// 3. CALLBACK DE AUTORIZACIÓN META (FACEBOOK + INSTAGRAM BUSINESS)
// ============================================================================
router.get('/callback/meta', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.warn('Autorización Meta cancelada por el usuario:', error_description || error);
    return res.redirect(`${FRONTEND_URL}/dashboard.html?social_status=canceled&msg=${encodeURIComponent(error_description || error)}#marketing-social`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/dashboard.html?social_status=error&msg=missing_code_or_state#marketing-social`);
  }

  // Prevenir que una petición duplicada del navegador intente canjear el mismo código de un solo uso
  if (processedCodes.has(code)) {
    console.log('[Meta OAuth] Código ya procesado con éxito previamente, redirigiendo al dashboard.');
    return res.redirect(`${FRONTEND_URL}/dashboard.html?social_status=connected&provider=Meta#marketing-social`);
  }

  if (activeCodeLocks.has(code)) {
    console.log('[Meta OAuth] Petición duplicada concurrente en vuelo, esperando resolución...');
    try {
      await activeCodeLocks.get(code);
    } catch (e) {}
    return res.redirect(`${FRONTEND_URL}/dashboard.html?social_status=connected&provider=Meta#marketing-social`);
  }

  let resolveLock = null;
  const lockPromise = new Promise(resolve => { resolveLock = resolve; });
  activeCodeLocks.set(code, lockPromise);

  try {
    // Validar token state firmado para recuperar el accountId legítimo
    const decoded = jwt.verify(state, JWT_SECRET);
    const accountId = decoded.accountId;

    if (!accountId) {
      throw new Error('El estado de autorización no contiene un accountId válido.');
    }

    const appId = (process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '').trim();
    const appSecret = (process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '').trim();

    if (!appId || !appSecret) {
      throw new Error('Las credenciales de Meta (META_APP_ID / META_APP_SECRET) no están disponibles en el servidor.');
    }

    const redirectUri = `${getBaseServerUrl()}/api/social/callback/meta`;

    // 1. Intercambiar code por User Access Token corto
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code
    });

    const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams.toString()}`);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      const errMsg = tokenData.error.message || '';
      if (errMsg.includes('authorization code has been used')) {
        console.warn('[Meta OAuth] Código ya utilizado detectado. Verificando si la conexión ya quedó registrada...');
        const existing = await db.query(
          "SELECT id FROM social_connections WHERE account_id = $1 AND updated_at > NOW() - INTERVAL '10 minutes'",
          [accountId]
        );
        if (existing.rows.length > 0) {
          processedCodes.set(code, Date.now());
          setTimeout(() => processedCodes.delete(code), 5 * 60 * 1000);
          return res.redirect(`${FRONTEND_URL}/dashboard.html?social_status=connected&provider=Meta#marketing-social`);
        }
      }
      throw new Error(errMsg || 'Error al canjear código con Meta.');
    }

    processedCodes.set(code, Date.now());
    setTimeout(() => processedCodes.delete(code), 5 * 60 * 1000);

    const shortToken = tokenData.access_token;

    // 2. Extender a Long-Lived Token (60 días renovable)
    const longTokenParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken
    });

    const longTokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${longTokenParams.toString()}`);
    const longTokenData = await longTokenRes.json();
    const longToken = longTokenData.access_token || shortToken;

    // 3. Consultar datos de perfil y páginas de Facebook / Instagram Business vinculadas
    let profileName = 'Usuario Meta';
    let profileId = `meta_${Date.now()}`;
    let avatarUrl = null;

    try {
      const meRes = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=id,name,picture.type(large)&access_token=${longToken}`
      );
      const meData = await meRes.json();
      if (meData && meData.name) {
        profileName = meData.name;
        profileId = meData.id;
        avatarUrl = meData.picture?.data?.url || null;
      }
    } catch (e) {
      console.warn('Error consultando perfil me en Meta:', e.message);
    }

    let savedAny = false;

    // Intentar consultar páginas si el token lo permite
    try {
      const accountsRes = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${longToken}`
      );
      const accountsData = await accountsRes.json();

      if (accountsData && Array.isArray(accountsData.data) && accountsData.data.length > 0) {
        for (const page of accountsData.data) {
          const pageId = page.id;
          const pageName = page.name;
          const pageToken = page.access_token || longToken;

          // Guardar conexión de Facebook Fan Page
          const fbConnId = `soc_fb_${crypto.randomBytes(8).toString('hex')}`;
          await db.query(`
            INSERT INTO social_connections (
              id, account_id, provider, provider_account_id, account_name,
              access_token, status, metrics_cache, last_synced_at, updated_at
            ) VALUES ($1, $2, 'facebook', $3, $4, $5, 'active', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (account_id, provider) DO UPDATE SET
              provider_account_id = EXCLUDED.provider_account_id,
              account_name = EXCLUDED.account_name,
              access_token = EXCLUDED.access_token,
              status = 'active',
              last_synced_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP;
          `, [
            fbConnId, accountId, pageId, pageName, pageToken,
            JSON.stringify({ followers: '0', reach: '0', engagement: '0.0%', posts: 0 })
          ]);
          savedAny = true;

          // Si la página tiene una cuenta de Instagram Business vinculada
          if (page.instagram_business_account) {
            const ig = page.instagram_business_account;
            const igConnId = `soc_ig_${crypto.randomBytes(8).toString('hex')}`;
            await db.query(`
              INSERT INTO social_connections (
                id, account_id, provider, provider_account_id, account_name, account_avatar,
                access_token, status, metrics_cache, last_synced_at, updated_at
              ) VALUES ($1, $2, 'instagram', $3, $4, $5, $6, 'active', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT (account_id, provider) DO UPDATE SET
                provider_account_id = EXCLUDED.provider_account_id,
                account_name = EXCLUDED.account_name,
                account_avatar = EXCLUDED.account_avatar,
                access_token = EXCLUDED.access_token,
                status = 'active',
                last_synced_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP;
            `, [
              igConnId, accountId, ig.id, `@${ig.username || pageName}`, ig.profile_picture_url || avatarUrl,
              pageToken,
              JSON.stringify({ followers: '0', reach: '0', engagement: '0.0%', posts: 0 })
            ]);
          }
        }
      }
    } catch (accErr) {
      console.warn('No se pudieron leer páginas específicas de Meta:', accErr.message);
    }

    // Si no hubo páginas administradas específicas, registrar la conexión tanto de Instagram como de Facebook
    if (!savedAny) {
      const cleanHandle = profileName.startsWith('@') ? profileName : `@${profileName.toLowerCase().replace(/\s+/g, '_')}`;
      const providersToSync = ['instagram', 'facebook'];

      for (const prov of providersToSync) {
        const cId = `soc_${prov.slice(0, 2)}_${crypto.randomBytes(8).toString('hex')}`;
        const provMetrics = { followers: '0', reach: '0', engagement: '0.0%', posts: 0 };

        await db.query(`
          INSERT INTO social_connections (
            id, account_id, provider, provider_account_id, account_name,
            account_avatar, access_token, metrics_cache, status, last_synced_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (account_id, provider) DO UPDATE SET
            provider_account_id = EXCLUDED.provider_account_id,
            account_name = EXCLUDED.account_name,
            account_avatar = EXCLUDED.account_avatar,
            access_token = EXCLUDED.access_token,
            metrics_cache = COALESCE(social_connections.metrics_cache, EXCLUDED.metrics_cache),
            status = 'active',
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP;
        `, [
          cId, accountId, prov, profileId, cleanHandle,
          avatarUrl, longToken, JSON.stringify(provMetrics)
        ]);
      }
    }

    // Redirección exitosa hacia el frontend en Vercel
    res.redirect(`${FRONTEND_URL}/dashboard.html?social_status=connected&provider=meta#marketing-social`);
  } catch (err) {
    console.error('Error procesando callback de Meta:', err.message || err);
    res.redirect(`${FRONTEND_URL}/dashboard.html?social_status=error&msg=${encodeURIComponent(err.message)}#marketing-social`);
  } finally {
    if (resolveLock) resolveLock();
    activeCodeLocks.delete(code);
  }
});

// ============================================================================
// 4. VINCULACIÓN DIRECTA / SIMULACIÓN PARA CADA CLIENTE (PRUEBAS Y PRECONFIGURACIÓN)
// ============================================================================
router.post('/connect-manual', verifyToken, async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { provider, accountName } = req.body;

    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Identificador de cuenta requerido.' });
    }

    if (!provider || !accountName) {
      return res.status(400).json({ success: false, message: 'Proveedor y nombre de cuenta son obligatorios.' });
    }

    const validProviders = [
      'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin',
      'twitter', 'x', 'pinterest', 'google_business', 'threads', 'twitch'
    ];
    if (!validProviders.includes(provider.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Proveedor de red social no soportado.' });
    }

    const connId = `soc_${provider.slice(0, 2)}_${crypto.randomBytes(8).toString('hex')}`;
    const cleanHandle = accountName.trim();

    // Muestra base de analíticas iniciales por red
    const sampleMetrics = {
      instagram: { followers: '0', reach: '0', engagement: '0.0%', posts: 0 },
      facebook: { followers: '0', reach: '0', engagement: '0.0%', posts: 0 },
      tiktok: { followers: '8,420', reach: '38,200', engagement: '7.4%', posts: 46 },
      youtube: { followers: '12,300', reach: '45,600', engagement: '6.1%', posts: 32 },
      linkedin: { followers: '5,140', reach: '12,800', engagement: '4.2%', posts: 28 },
      twitter: { followers: '7,890', reach: '19,400', engagement: '3.9%', posts: 215 },
      x: { followers: '7,890', reach: '19,400', engagement: '3.9%', posts: 215 },
      pinterest: { followers: '4,320', reach: '14,800', engagement: '6.5%', posts: 84 },
      google_business: { followers: '9,150', reach: '22,300', engagement: '8.1%', posts: 19 },
      threads: { followers: '6,450', reach: '15,200', engagement: '5.8%', posts: 63 },
      twitch: { followers: '3,210', reach: '8,900', engagement: '9.2%', posts: 12 }
    };

    let metrics = sampleMetrics[provider.toLowerCase()] || { followers: '1,200', reach: '3,400', engagement: '4.0%', posts: 10 };
    if (req.body.metrics && typeof req.body.metrics === 'object') {
      metrics = {
        followers: req.body.metrics.followers !== undefined ? String(req.body.metrics.followers) : metrics.followers,
        reach: req.body.metrics.reach !== undefined ? String(req.body.metrics.reach) : metrics.reach,
        engagement: req.body.metrics.engagement !== undefined ? String(req.body.metrics.engagement) : metrics.engagement,
        posts: req.body.metrics.posts !== undefined ? Number(req.body.metrics.posts) : metrics.posts
      };
    }

    await db.query(`
      INSERT INTO social_connections (
        id, account_id, provider, provider_account_id, account_name,
        access_token, status, metrics_cache, last_synced_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (account_id, provider) DO UPDATE SET
        account_name = EXCLUDED.account_name,
        status = 'active',
        metrics_cache = EXCLUDED.metrics_cache,
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP;
    `, [
      connId,
      accountId,
      provider.toLowerCase(),
      `act_${crypto.randomBytes(6).toString('hex')}`,
      cleanHandle,
      `tok_sim_${crypto.randomBytes(16).toString('hex')}`,
      JSON.stringify(metrics)
    ]);

    res.json({
      success: true,
      message: `Canal ${provider} conectado exitosamente para la cuenta ${accountId}.`,
      provider: provider.toLowerCase(),
      accountName: cleanHandle,
      metrics
    });
  } catch (err) {
    console.error('Error al conectar canal manualmente:', err);
    res.status(500).json({ success: false, message: 'Error interno al registrar canal social.' });
  }
});

// ============================================================================
// 5. DESCONECTAR CANAL DE UNA CUENTA
// ============================================================================
router.delete('/disconnect/:provider', verifyToken, async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    const { provider } = req.params;

    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Cuenta requerida.' });
    }

    await db.query(`
      DELETE FROM social_connections
      WHERE account_id = $1 AND provider = $2
    `, [accountId, provider.toLowerCase()]);

    res.json({
      success: true,
      message: `El canal ${provider} ha sido desconectado correctamente.`
    });
  } catch (err) {
    console.error('Error al desconectar canal:', err);
    res.status(500).json({ success: false, message: 'Error interno al desconectar canal social.' });
  }
});

// ============================================================================
// 6. MÉTRICAS CONSOLIDADAS MULTICANAL POR CLIENTE
// ============================================================================
router.get('/metrics', verifyToken, async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Identificador de cuenta requerido.' });
    }

    const result = await db.query(`
      SELECT provider, account_name, metrics_cache, last_synced_at, status
      FROM social_connections
      WHERE account_id = $1 AND status = 'active'
    `, [accountId]);

    let totalFollowers = 0;
    let totalReach = 0;
    let totalEngagement = 0;
    let count = 0;

    result.rows.forEach(row => {
      const cache = row.metrics_cache || {};
      const followers = parseInt(String(cache.followers || '0').replace(/[^0-9]/g, ''), 10) || 0;
      const reach = parseInt(String(cache.reach || '0').replace(/[^0-9]/g, ''), 10) || 0;
      const eng = parseFloat(String(cache.engagement || '0').replace(/[^0-9.]/g, '')) || 0;

      totalFollowers += followers;
      totalReach += reach;
      if (eng > 0) {
        totalEngagement += eng;
        count++;
      }
    });

    const avgEngagement = count > 0 ? (totalEngagement / count).toFixed(1) : '5.4';

    res.json({
      success: true,
      accountId,
      connectedCount: result.rows.length,
      summary: {
        totalFollowers: totalFollowers > 0 ? totalFollowers.toLocaleString() : '0',
        totalReach: totalReach > 0 ? totalReach.toLocaleString() : '0',
        avgEngagement: `${avgEngagement}%`
      },
      channels: result.rows
    });
  } catch (err) {
    console.error('Error al calcular métricas consolidadas:', err);
    res.status(500).json({ success: false, message: 'Error interno al calcular métricas.' });
  }
});

// ============================================================================
// 7. ACTUALIZAR MÉTRICAS REALES DE CANALES
// ============================================================================
router.put('/metrics', verifyToken, async (req, res) => {
  try {
    const accountId = resolveAccountId(req);
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Identificador de cuenta requerido.' });
    }

    const { metrics } = req.body;
    if (!Array.isArray(metrics)) {
      return res.status(400).json({ success: false, message: 'Se esperaba un arreglo de métricas.' });
    }

    for (const item of metrics) {
      if (!item.provider) continue;
      const followers = String(item.followers || '0').trim();
      const reach = String(item.reach || '0').trim();
      const engagement = String(item.engagement || '4.5%').trim();

      await db.query(`
        UPDATE social_connections
        SET metrics_cache = jsonb_build_object(
          'followers', $1::text,
          'reach', $2::text,
          'engagement', $3::text,
          'posts', COALESCE((metrics_cache->>'posts')::int, 48)
        ),
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
        WHERE account_id = $4 AND provider = $5
      `, [followers, reach, engagement, accountId, item.provider]);
    }

    res.json({ success: true, message: 'Métricas actualizadas exitosamente en base de datos.' });
  } catch (err) {
    console.error('Error al actualizar métricas:', err);
    res.status(500).json({ success: false, message: 'Error interno al actualizar métricas.' });
  }
});

module.exports = router;
