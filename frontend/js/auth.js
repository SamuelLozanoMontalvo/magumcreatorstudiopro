/* ==========================================================================
   MAGUM CREATOR STUDIO - CONTROL DE ACCESO (AUTENTICACIÓN SEGURA VÍA API)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  const loginForm = document.getElementById('login-form');
  const alertBox = document.getElementById('alert-box');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');
  const eyeIcon = document.getElementById('eye-icon');

  // Limpiar URL si el navegador realizó un submit GET previamente y rellenar campos
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const paramEmail = urlParams.get('email');
    const paramPwd = urlParams.get('password');
    if (paramEmail && document.getElementById('email')) {
      document.getElementById('email').value = paramEmail;
    }
    if (paramPwd && passwordInput) {
      passwordInput.value = paramPwd;
    }
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (e) {}

  // Mostrar u ocultar contraseña en el campo de texto
  if (togglePasswordBtn && passwordInput && eyeIcon) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      eyeIcon.className = isPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
    });
  }

  const GENERIC_ERROR = 'Usuario, correo o contraseña incorrectos.';

  // Procesar inicio de sesión
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const emailInput = document.getElementById('email');
      const rawUser = (emailInput ? emailInput.value : '').trim();
      const rawPassword = passwordInput ? passwordInput.value : '';

      if (!rawUser || !rawPassword) {
        showAlert('Por favor completa todos los campos requeridos.', 'error');
        return;
      }

      const btnSubmit = document.getElementById('btn-submit');
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.style.opacity = '0.7';
      }

      // Autenticación estricta con el Backend API (Cero logins locales ni hashes en cliente)
      try {
        if (!window.MagumApi) {
          throw new Error('Servicio de API no disponible.');
        }

        const apiResult = await window.MagumApi.login(rawUser, rawPassword);

        // Si el usuario tiene múltiples empresas registradas con su correo
        if (apiResult && apiResult.multipleAccounts && Array.isArray(apiResult.accounts)) {
          showAccountSelectorModal(apiResult.accounts, rawUser, rawPassword);
          return;
        }

        if (apiResult && apiResult.success && apiResult.token) {
          // Guardar sesión segura con JWT
          localStorage.setItem('magum_session', JSON.stringify({
            ...apiResult.user,
            token: apiResult.token,
            loggedAt: new Date().toISOString()
          }));

          showAlert(apiResult.message || 'Acceso verificado. Ingresando...', 'success');
          setTimeout(() => {
            window.location.href = (apiResult.user.role === 'admin') ? 'admin.html' : 'dashboard.html';
          }, 350);
          return;
        }

        showAlert(GENERIC_ERROR, 'error');
      } catch (apiErr) {
        console.warn('[Auth] Error al iniciar sesión:', apiErr.message);

        if (apiErr.message && apiErr.message.includes('429')) {
          showAlert('Demasiados intentos fallidos. Por seguridad, espera 15 minutos.', 'error');
        } else if (apiErr.message && apiErr.message.includes('suspendida')) {
          showAlert('Esta cuenta se encuentra suspendida. Comunícate con el administrador.', 'error');
        } else if (apiErr.message && (apiErr.message.includes('401') || apiErr.message.includes('404') || apiErr.message.includes('incorrectos'))) {
          showAlert(GENERIC_ERROR, 'error');
        } else {
          showAlert('No fue posible conectar con el servidor. Verifica tu conexión a internet.', 'error');
        }
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.style.opacity = '1';
        }
      }
    });
  }

  // Renderizar modal para que el usuario elija su empresa si tiene varias
  function showAccountSelectorModal(accounts, userVal, passwordVal) {
    const modal = document.getElementById('modal-select-account');
    const list = document.getElementById('account-selector-list');
    const btnCancel = document.getElementById('btn-cancel-account-select');

    if (!modal || !list) return;

    list.innerHTML = '';
    accounts.forEach(acc => {
      const item = document.createElement('button');
      item.type = 'button';
      item.style.cssText = 'width: 100%; border: 1px solid #e2e8f0; background: #f8fafc; padding: 12px 16px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; text-align: left; transition: all 0.2s; font-family: inherit; margin-bottom: 8px;';
      item.innerHTML = `
        <div>
          <div style="font-weight: 700; color: #1e293b; font-size: 0.95rem;">${escapeHtml(acc.business)}</div>
          <div style="font-size: 0.8rem; color: #64748b;">${escapeHtml(acc.clientName)} &bull; ID: ${escapeHtml(acc.id)}</div>
        </div>
        <i class="fa-solid fa-chevron-right" style="color: #210087; font-size: 0.85rem;"></i>
      `;
      item.onmouseover = () => { item.style.borderColor = '#210087'; item.style.background = '#f1f5f9'; };
      item.onmouseout = () => { item.style.borderColor = '#e2e8f0'; item.style.background = '#f8fafc'; };

      item.onclick = async () => {
        item.disabled = true;
        item.style.opacity = '0.6';
        try {
          const res = await window.MagumApi.login(userVal, passwordVal, acc.id);
          if (res && res.success && res.token) {
            localStorage.setItem('magum_session', JSON.stringify({
              ...res.user,
              token: res.token,
              loggedAt: new Date().toISOString()
            }));
            modal.style.display = 'none';
            showAlert(`Ingresando a ${acc.business}...`, 'success');
            setTimeout(() => {
              window.location.href = 'dashboard.html';
            }, 300);
            return;
          }
          showAlert(GENERIC_ERROR, 'error');
        } catch (err) {
          modal.style.display = 'none';
          showAlert(GENERIC_ERROR, 'error');
        }
      };
      list.appendChild(item);
    });

    modal.style.display = 'flex';

    if (btnCancel) {
      btnCancel.onclick = () => {
        modal.style.display = 'none';
      };
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showAlert(message, type) {
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = `alert-box alert-${type}`;
    alertBox.style.display = 'block';
  }

  // Cargar Favicon y Branding de la plataforma configurado por el Super Admin
  function loadPlatformBranding() {
    try {
      const dynamicFavicon = document.getElementById('dynamic-favicon');
      const brandLogo = document.querySelector('.brand-logo');

      if (window.MagumApi && window.MagumApi.getSetting) {
        window.MagumApi.getSetting('platform_branding').then(res => {
          if (res && res.data) {
            if (res.data.faviconUrl && dynamicFavicon) dynamicFavicon.href = res.data.faviconUrl;
            if (res.data.logoUrl && brandLogo) brandLogo.src = res.data.logoUrl;
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Error cargando branding en login:', e);
    }
  }

  loadPlatformBranding();

});