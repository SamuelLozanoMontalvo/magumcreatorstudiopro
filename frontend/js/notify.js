/* ==========================================================================
   MAGUM CREATOR STUDIO - SISTEMA DE ALERTAS Y NOTIFICACIONES ESTÉTICAS
   ========================================================================== */

(function () {
  // Configuración de estilo global para SweetAlert2 integrado con el diseño de MAGUM
  const isDarkMode = () => document.body.classList.contains('dark-mode');

  window.MagumAlert = {
    // Alerta de éxito elegante
    success: (title, text, html) => {
      if (typeof Swal === 'undefined') {
        alert(`${title}\n\n${text || ''}`);
        return Promise.resolve();
      }
      return Swal.fire({
        icon: 'success',
        title: title || '¡Acción Exitosa!',
        text: text || undefined,
        html: html || undefined,
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#210087',
        background: isDarkMode() ? '#12022e' : '#ffffff',
        color: isDarkMode() ? '#ffffff' : '#080017',
        customClass: {
          popup: 'magum-swal-popup',
          confirmButton: 'magum-swal-confirm-btn'
        }
      });
    },

    // Alerta de error elegante
    error: (title, text) => {
      if (typeof Swal === 'undefined') {
        alert(`${title}\n\n${text || ''}`);
        return Promise.resolve();
      }
      return Swal.fire({
        icon: 'error',
        title: title || 'Algo salió mal',
        text: text,
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#ef4444',
        background: isDarkMode() ? '#12022e' : '#ffffff',
        color: isDarkMode() ? '#ffffff' : '#080017',
        customClass: {
          popup: 'magum-swal-popup'
        }
      });
    },

    // Modal de confirmación estilizado (reemplazo de window.confirm)
    confirm: async (title, text, confirmBtnText = 'Sí, continuar', cancelBtnText = 'Cancelar') => {
      if (typeof Swal === 'undefined') {
        return Promise.resolve(window.confirm(`${title}\n\n${text || ''}`));
      }
      const res = await Swal.fire({
        icon: 'warning',
        title: title || '¿Estás seguro?',
        text: text,
        showCancelButton: true,
        confirmButtonText: confirmBtnText,
        cancelButtonText: cancelBtnText,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        background: isDarkMode() ? '#12022e' : '#ffffff',
        color: isDarkMode() ? '#ffffff' : '#080017',
        customClass: {
          popup: 'magum-swal-popup',
          confirmButton: 'magum-swal-danger-btn'
        }
      });
      return res.isConfirmed;
    },

    // Notificación especial estética para creación de cuenta
    accountCreated: ({ id, business, firstName, lastName, email }) => {
      if (typeof Swal === 'undefined') {
        alert(`¡Cuenta creada con éxito!\n\nID: ${id}\nNegocio: ${business}\nTitular: ${firstName} ${lastName}\nCorreo: ${email}`);
        return Promise.resolve();
      }
      return Swal.fire({
        icon: 'success',
        title: '¡Cuenta Creada con Éxito!',
        html: `
          <div style="text-align: left; background: ${isDarkMode() ? 'rgba(255, 255, 255, 0.05)' : 'rgba(33, 0, 135, 0.04)'}; padding: 16px 20px; border-radius: 14px; margin-top: 14px; font-size: 0.92rem; line-height: 1.8; border: 1px solid rgba(255, 0, 219, 0.18);">
            <div><strong style="color: #64748b;">ID de Cuenta:</strong> <code style="background: rgba(255,0,219,0.12); color: #FF00DB; font-weight: 800; padding: 2px 10px; border-radius: 6px; font-size: 0.95rem; margin-left: 4px;">${id}</code></div>
            <div><strong style="color: #64748b;">Negocio:</strong> <span style="font-weight: 700; color: ${isDarkMode() ? '#fff' : '#1e293b'};">${business}</span></div>
            <div><strong style="color: #64748b;">Titular:</strong> ${firstName} ${lastName}</div>
            <div><strong style="color: #64748b;">Correo de acceso:</strong> <span style="color: #3b82f6; font-weight: 600;">${email}</span></div>
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed rgba(100, 116, 139, 0.2); font-size: 0.84rem; color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-circle-check"></i> El cliente ya puede iniciar sesión desde el portal con sus credenciales.
            </div>
          </div>
        `,
        confirmButtonText: 'Aceptar y Continuar',
        confirmButtonColor: '#210087',
        background: isDarkMode() ? '#12022e' : '#ffffff',
        color: isDarkMode() ? '#ffffff' : '#080017'
      });
    },

    // Notificación especial estética para campañas y difusiones
    campaignDispatched: (channel, count, details) => {
      const channelLabels = {
        whatsapp: { title: '¡Campaña de WhatsApp Emitida!', icon: 'fa-brands fa-whatsapp', color: '#25D366' },
        email: { title: '¡Campaña de Correo Masivo Emitida!', icon: 'fa-solid fa-paper-plane', color: '#3B82F6' },
        dual: { title: '¡Envío Dual (WP + Email) Completado!', icon: 'fa-solid fa-bolt', color: '#FF00DB' }
      };
      const info = channelLabels[channel] || channelLabels.whatsapp;

      return Swal.fire({
        icon: 'success',
        title: info.title,
        html: `
          <div style="text-align: left; background: ${isDarkMode() ? 'rgba(255, 255, 255, 0.05)' : 'rgba(33, 0, 135, 0.04)'}; padding: 16px 20px; border-radius: 14px; margin-top: 14px; font-size: 0.92rem; line-height: 1.8;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 1.05rem; font-weight: 700; color: ${info.color}; margin-bottom: 8px;">
              <i class="${info.icon}"></i> <span>${count} contactos impactados</span>
            </div>
            <div style="color: #64748b; font-size: 0.88rem;">${details || 'Los mensajes y difusiones fueron enviados correctamente a la lista de destinatarios seleccionados.'}</div>
          </div>
        `,
        confirmButtonText: 'Excelente',
        confirmButtonColor: '#210087',
        background: isDarkMode() ? '#12022e' : '#ffffff',
        color: isDarkMode() ? '#ffffff' : '#080017'
      });
    }
  };
})();
