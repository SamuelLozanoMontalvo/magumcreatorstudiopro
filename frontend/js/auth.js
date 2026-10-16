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

  // ==========================================================================
  // RECUPERACIÓN DE CONTRASEÑA (PROBLEMAS DE ACCESO CON CÓDIGO OTP DE 6 DÍGITOS)
  // ==========================================================================
  const forgotLink = document.getElementById('forgot-password-link');
  const modalForgot = document.getElementById('modal-forgot-password');
  const btnCloseForgot = document.getElementById('btn-close-forgot-modal');

  const step1 = document.getElementById('forgot-step-1');
  const step2 = document.getElementById('forgot-step-2');
  const formForgot1 = document.getElementById('form-forgot-request');
  const formForgot2 = document.getElementById('form-forgot-verify');

  const inputForgotEmail = document.getElementById('input-forgot-email');
  const inputOtpCode = document.getElementById('input-otp-code');
  const inputResetPass1 = document.getElementById('input-reset-pass-1');
  const inputResetPass2 = document.getElementById('input-reset-pass-2');
  const lblTargetEmail = document.getElementById('lbl-forgot-target-email');

  const forgotAlert1 = document.getElementById('forgot-alert-1');
  const forgotAlert2 = document.getElementById('forgot-alert-2');
  const btnSubmitForgot1 = document.getElementById('btn-submit-forgot-request');
  const btnSubmitForgot2 = document.getElementById('btn-submit-verify-reset');
  const btnBackStep1 = document.getElementById('btn-back-to-step-1');

  let currentResetEmail = '';

  function showForgotAlert(box, msg, type = 'error') {
    if (!box) return;
    box.style.display = 'block';
    box.textContent = msg;
    if (type === 'error') {
      box.style.background = 'rgba(239, 68, 68, 0.12)';
      box.style.border = '1px solid rgba(239, 68, 68, 0.35)';
      box.style.color = '#ef4444';
    } else {
      box.style.background = 'rgba(16, 185, 129, 0.12)';
      box.style.border = '1px solid rgba(16, 185, 129, 0.35)';
      box.style.color = '#10b981';
    }
  }

  function openForgotModal() {
    if (!modalForgot) return;
    const prefillEmail = identifierInput ? identifierInput.value.trim() : '';
    if (inputForgotEmail && prefillEmail.includes('@')) {
      inputForgotEmail.value = prefillEmail;
    }
    step1.style.display = 'block';
    step2.style.display = 'none';
    if (forgotAlert1) forgotAlert1.style.display = 'none';
    if (forgotAlert2) forgotAlert2.style.display = 'none';
    modalForgot.style.display = 'flex';
    if (inputForgotEmail) setTimeout(() => inputForgotEmail.focus(), 80);
  }

  function closeForgotModal() {
    if (modalForgot) modalForgot.style.display = 'none';
  }

  window.openForgotModal = openForgotModal;
  window.closeForgotModal = closeForgotModal;

  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      openForgotModal();
    });
  }

  if (btnCloseForgot) btnCloseForgot.addEventListener('click', closeForgotModal);
  if (modalForgot) {
    modalForgot.addEventListener('click', (e) => {
      if (e.target === modalForgot) closeForgotModal();
    });
  }

  if (btnBackStep1) {
    btnBackStep1.addEventListener('click', () => {
      step2.style.display = 'none';
      step1.style.display = 'block';
      if (forgotAlert1) forgotAlert1.style.display = 'none';
      if (inputForgotEmail) inputForgotEmail.focus();
    });
  }

  // Paso 1: Solicitar código
  if (formForgot1) {
    formForgot1.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = inputForgotEmail.value.trim().toLowerCase();
      if (!email) return;

      btnSubmitForgot1.disabled = true;
      btnSubmitForgot1.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

      try {
        const res = await window.MagumApi.forgotPassword(email);
        currentResetEmail = email;
        if (lblTargetEmail) lblTargetEmail.textContent = email;

        step1.style.display = 'none';
        step2.style.display = 'block';
        if (inputOtpCode) {
          inputOtpCode.value = '';
          setTimeout(() => inputOtpCode.focus(), 80);
        }
      } catch (err) {
        showForgotAlert(forgotAlert1, err.message || 'No fue posible enviar el código. Inténtalo de nuevo.');
      } finally {
        btnSubmitForgot1.disabled = false;
        btnSubmitForgot1.innerHTML = '<span>Enviar Código de Seguridad</span> <i class="fa-solid fa-paper-plane" style="margin-left: 6px;"></i>';
      }
    });
  }

  // Paso 2: Validar OTP y cambiar clave
  if (formForgot2) {
    formForgot2.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = inputOtpCode.value.trim().replace(/\s+/g, '');
      const pass1 = inputResetPass1.value;
      const pass2 = inputResetPass2.value;

      if (code.length !== 6) {
        showForgotAlert(forgotAlert2, 'El código debe tener 6 dígitos numéricos.');
        return;
      }

      if (pass1.length < 6) {
        showForgotAlert(forgotAlert2, 'La nueva contraseña debe tener al menos 6 caracteres.');
        return;
      }

      if (pass1 !== pass2) {
        showForgotAlert(forgotAlert2, 'Las contraseñas no coinciden.');
        return;
      }

      btnSubmitForgot2.disabled = true;
      btnSubmitForgot2.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Restableciendo...';

      try {
        const res = await window.MagumApi.verifyResetCode(currentResetEmail, code, pass1);
        closeForgotModal();

        if (identifierInput) identifierInput.value = currentResetEmail;
        if (passwordInput) passwordInput.value = '';

        if (window.MagumAlert && window.MagumAlert.success) {
          window.MagumAlert.success('¡Contraseña Actualizada!', 'Tu clave ha sido restablecida. Ya puedes ingresar con tu nueva contraseña.');
        } else {
          showAlert('¡Contraseña actualizada con éxito! Ingresa con tu nueva clave.', 'success');
        }
      } catch (err) {
        showForgotAlert(forgotAlert2, err.message || 'Código incorrecto o expirado.');
      } finally {
        btnSubmitForgot2.disabled = false;
        btnSubmitForgot2.innerHTML = '<span>Guardar Nueva Contraseña</span> <i class="fa-solid fa-check" style="margin-left: 6px;"></i>';
      }
    });
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