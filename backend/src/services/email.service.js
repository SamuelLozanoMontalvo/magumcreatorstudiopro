// Servicio de envío de correos electrónicos transaccionales (Soporte dual: Gmail SMTP / Resend API)
const nodemailer = require('nodemailer');
require('dotenv').config();

function cleanEnv(val) {
  if (!val) return '';
  return String(val).trim().replace(/^['"]+|['"]+$/g, '');
}

/**
  * Ejecuta una promesa con un tiempo límite estricto para evitar bloqueos del servidor
  */
function withTimeout(promise, ms, errorMsg) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg || `Tiempo de espera agotado (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function getGmailTransporter() {
  const user = cleanEnv(process.env.GMAIL_USER || process.env.SMTP_USER);
  const pass = cleanEnv(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS).replace(/\s+/g, '');

  if (!user || !pass) return null;

  return {
    user,
    transporter: nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user,
        pass
      },
      connectionTimeout: 4000, // Máximo 4s para handshake TCP (evita que Railway quede colgado si bloquea el puerto)
      greetingTimeout: 3000,
      socketTimeout: 5000,
      tls: {
        rejectUnauthorized: false
      }
    })
  };
}

/**
 * Función base para enviar correos: Prioriza Gmail SMTP -> Brevo API -> Resend API
 */
async function sendEmail({ to, subject, html, text }) {
  const errors = [];

  // 1. Prioridad #1: Brevo REST API (HTTPS Puerto 443 - Diseñado para cloud/Railway, envía a cualquier correo sin bloqueos de puerto)
  const brevoKey = cleanEnv(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY);
  if (brevoKey) {
    try {
      const senderEmail = cleanEnv(process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER || process.env.SMTP_USER || 'samylozano00@gmail.com');
      const senderName = cleanEnv(process.env.BREVO_SENDER_NAME) || 'Magum Creator Studio';

      const response = await withTimeout(
        fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: text
          })
        }),
        6000,
        'Tiempo de espera agotado conectando con Brevo API'
      );

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        console.log(`[EmailService] ✅ Correo entregado vía Brevo API a "${to}" (ID: ${data.messageId || 'ok'})`);
        return { success: true, id: data.messageId, provider: 'brevo' };
      } else {
        const errorDetail = data.message || data.error || response.statusText;
        console.warn('[EmailService] ⚠️ Brevo API rechazó el envío:', errorDetail);
        errors.push(`Brevo: ${errorDetail}`);
      }
    } catch (brevoErr) {
      console.warn('[EmailService] ⚠️ Error conectando a Brevo API:', brevoErr.message);
      errors.push(`Brevo: ${brevoErr.message}`);
    }
  }

  // 2. Prioridad #2: Gmail SMTP (solo si no hay Brevo o si Brevo falló)
  const gmailConfig = getGmailTransporter();
  if (gmailConfig) {
    try {
      const gmailFrom = `"Magum Creator Studio" <${gmailConfig.user}>`;
      const info = await withTimeout(
        gmailConfig.transporter.sendMail({
          from: gmailFrom,
          to,
          subject,
          html,
          text
        }),
        4000,
        'Tiempo de espera agotado conectando con Gmail SMTP (puerto bloqueado por el hosting)'
      );
      console.log(`[EmailService] ✅ Correo entregado vía Gmail SMTP a "${to}" (ID: ${info.messageId})`);
      return { success: true, id: info.messageId, provider: 'gmail' };
    } catch (gmailErr) {
      console.warn('[EmailService] ⚠️ Gmail SMTP falló o fue bloqueado:', gmailErr.message);
      errors.push(`Gmail SMTP: ${gmailErr.message}`);
    }
  }

  // 3. Respaldo: Resend REST API (HTTPS Puerto 443)
  const resendKey = cleanEnv(process.env.RESEND_API_KEY);
  if (resendKey) {
    try {
      const emailFrom = cleanEnv(process.env.EMAIL_FROM) || 'Magum Creator Studio <onboarding@resend.dev>';
      const response = await withTimeout(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: emailFrom,
            to: [to],
            subject,
            html,
            text
          })
        }),
        5000,
        'Tiempo de espera agotado conectando con Resend API'
      );

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        console.log(`[EmailService] ✅ Correo entregado vía Resend a "${to}" (ID: ${data.id})`);
        return { success: true, id: data.id, provider: 'resend' };
      } else {
        console.warn('[EmailService] ⚠️ Resend rechazó el envío:', data);
        errors.push(`Resend: ${data.message || response.statusText}`);
      }
    } catch (error) {
      console.warn('[EmailService] ⚠️ Error de conexión con Resend:', error.message);
      errors.push(`Resend: ${error.message}`);
    }
  }

  // Si ningún proveedor estuvo configurado o todos fallaron
  const isAnyConfigured = Boolean(gmailConfig || brevoKey || resendKey);
  if (!isAnyConfigured) {
    console.warn(`[EmailService] ⚠️ No hay servicio de correo configurado. Simulando envío a "${to}".`);
    return { success: true, simulated: true };
  }

  return {
    success: false,
    error: errors.join(' | ') || 'No fue posible entregar el correo con los proveedores configurados.'
  };
}

/**
 * Enviar invitación de bienvenida con enlace para establecer contraseña
 */
async function sendInviteEmail({ to, clientName, business, inviteToken, origin }) {
  const baseUrl = origin || process.env.FRONTEND_URL || 'https://magumcreatorstudiopro.vercel.app';
  const setupUrl = `${baseUrl.replace(/\/$/, '')}/setup-password.html?token=${encodeURIComponent(inviteToken)}`;

  const subject = `¡Bienvenido a Magum Creator Studio! Activa tu cuenta`;
  const text = `Hola ${clientName},\n\nTu cuenta para ${business} ha sido creada en Magum Creator Studio.\n\nPara activar tu cuenta y configurar tu contraseña de acceso, ingresa al siguiente enlace:\n${setupUrl}\n\nEste enlace expira en 48 horas.\n\nEquipo Magum Creator Studio`;

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Bienvenido a Magum Creator Studio</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #0b0717; color: #f1f5f9; margin: 0; padding: 0; }
        .container { max-width: 580px; margin: 30px auto; background: #130e26; border-radius: 16px; border: 1px solid rgba(229, 0, 125, 0.25); overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(135deg, #210087 0%, #e5007d 100%); padding: 36px 24px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { color: #f8fafc; opacity: 0.9; margin: 8px 0 0 0; font-size: 14px; }
        .content { padding: 32px 28px; }
        .greeting { font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .text { font-size: 15px; color: #cbd5e1; line-height: 1.6; margin-bottom: 24px; }
        .badge { display: inline-block; background: rgba(229, 0, 125, 0.15); border: 1px solid rgba(229, 0, 125, 0.4); color: #f43f5e; padding: 4px 12px; border-radius: 999px; font-weight: 600; font-size: 13px; }
        .btn-wrap { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #e5007d 0%, #210087 100%); color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 34px; border-radius: 12px; box-shadow: 0 6px 20px rgba(229, 0, 125, 0.35); }
        .footer { padding: 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.06); }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>MAGUM CREATOR STUDIO</h1>
          <p>Potenciando tu presencia digital</p>
        </div>
        <div class="content">
          <div class="greeting">¡Hola, ${clientName}!</div>
          <p class="text">
            Tu cuenta para la empresa <span class="badge">${business}</span> ha sido configurada con éxito en nuestra plataforma.
          </p>
          <p class="text">
            Para comenzar a gestionar tu contenido, métricas y herramientas, por favor haz clic en el botón siguiente para definir tu contraseña de acceso:
          </p>
          <div class="btn-wrap">
            <a href="${setupUrl}" class="btn" target="_blank">Activar Cuenta y Definir Contraseña</a>
          </div>
          <p class="text" style="font-size: 13px; color: #94a3b8; text-align: center;">
            Este enlace es único, seguro y expirará en 48 horas por motivos de protección.
          </p>
        </div>
        <div class="footer">
          Si no esperabas este correo, puedes ignorarlo de manera segura.<br>
          © 2026 MAGUM Creator Studio. Todos los derechos reservados.
        </div>
      </div>
    </body>
    </html>
  `;

  let emailRes = { success: false };
  try {
    emailRes = await sendEmail({ to, subject, html, text });
  } catch (err) {
    console.warn('[EmailService] Error capturado en sendInviteEmail:', err.message);
    emailRes = { success: false, error: err.message };
  }

  return {
    ...emailRes,
    setupUrl,
    inviteToken
  };
}

/**
 * Enviar código OTP de 6 dígitos para recuperación de contraseña
 */
async function sendResetCodeEmail({ to, clientName, code }) {
  const formattedCode = `${String(code).slice(0, 3)} ${String(code).slice(3)}`;
  const subject = `Tu código de acceso: ${formattedCode} - Magum Creator Studio`;
  const text = `Hola ${clientName || 'Usuario'},\n\nTu código de verificación para restablecer tu contraseña en Magum Creator Studio es:\n\n${formattedCode}\n\nEste código es válido durante 15 minutos.\n\nSi no solicitaste este cambio, ignora este mensaje.`;

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Código de Verificación</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #0b0717; color: #f1f5f9; margin: 0; padding: 0; }
        .container { max-width: 520px; margin: 30px auto; background: #130e26; border-radius: 16px; border: 1px solid rgba(229, 0, 125, 0.25); overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(135deg, #210087 0%, #e5007d 100%); padding: 30px 20px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; }
        .content { padding: 32px 28px; text-align: center; }
        .title { font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .text { font-size: 14px; color: #cbd5e1; line-height: 1.5; margin-bottom: 24px; }
        .code-box { background: rgba(229, 0, 125, 0.1); border: 2px dashed #e5007d; border-radius: 12px; padding: 18px; margin: 20px auto; display: inline-block; }
        .code-number { font-size: 34px; font-weight: 800; color: #ffffff; letter-spacing: 8px; font-family: monospace; }
        .expiry { font-size: 13px; color: #f43f5e; margin-top: 14px; font-weight: 600; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.06); }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>MAGUM CREATOR STUDIO</h1>
        </div>
        <div class="content">
          <div class="title">Recuperación de Contraseña</div>
          <p class="text">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta asociada a <strong>${to}</strong>.
          </p>
          <div class="code-box">
            <div class="code-number">${formattedCode}</div>
          </div>
          <div class="expiry">⏱ Este código es válido por 15 minutos</div>
          <p class="text" style="font-size: 12px; color: #94a3b8; margin-top: 20px;">
            Si tú no solicitaste este código, puedes desestimar este mensaje; tu contraseña actual se mantiene protegida.
          </p>
        </div>
        <div class="footer">
          © 2026 MAGUM Creator Studio. Seguridad y Control.
        </div>
      </div>
    </body>
    </html>
  `;

  const emailRes = await sendEmail({ to, subject, html, text });
  return {
    ...emailRes,
    code
  };
}

module.exports = {
  sendEmail,
  sendInviteEmail,
  sendResetCodeEmail
};
