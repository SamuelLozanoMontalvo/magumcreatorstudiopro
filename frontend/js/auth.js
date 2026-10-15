/* ==========================================================================
   MAGUM CREATOR STUDIO - CONTROL DE ACCESO (AUTENTICACIÓN SEGURA)
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

  // Utilidad para hashing SHA-256 nativo en el navegador
  async function sha256(message) {
    try {
      if (window.crypto && crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (err) {
      console.warn('Crypto subtle no disponible en este contexto:', err);
    }
    return message;
  }

  // Hash de referencia de la contraseña del Super Administrador:
  // Usuario: McSAdmin
  // Clave: MagumAdmin#2030
  const DEFAULT_ADMIN_HASH = '2bbfe068565b93d6d028feebaeaa6981cf3157db9e8ff244e83c317db6913eef';

  // Mostrar u ocultar contraseña
  if (togglePasswordBtn && passwordInput && eyeIcon) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      eyeIcon.className = isPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
    });
  }

  // Procesar inicio de sesión
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const rawUser = (document.getElementById('email') ? document.getElementById('email').value : '').trim();
      const rawPassword = passwordInput ? passwordInput.value : '';

      if (!rawUser || !rawPassword) {
        showAlert('Por favor completa todos los campos requeridos.', 'error');
        return;
      }

      const userClean = rawUser.toLowerCase().trim();
      const pwdClean = rawPassword.trim();
      const inputHash = await sha256(rawPassword);

      const GENERIC_ERROR = 'Usuario, correo o contraseña incorrectos.';

      // Intentar autenticación con el Backend API primero si está activo
      if (window.MagumApi) {
        try {
          const apiResult = await window.MagumApi.login(rawUser, rawPassword);

          // Si el usuario tiene múltiples empresas registradas con su correo
          if (apiResult && apiResult.multipleAccounts && Array.isArray(apiResult.accounts)) {
            showAccountSelectorModal(apiResult.accounts, rawUser, rawPassword);
            return;
          }

          if (apiResult && apiResult.success && apiResult.token) {
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
        } catch (apiErr) {
          console.warn('[Auth] Backend login warning:', apiErr.message);
          // Si el error fue explícito de credenciales inválidas (401 o 404), mostrar mensaje genérico
          if (apiErr.message && (apiErr.message.includes('401') || apiErr.message.includes('404') || apiErr.message.includes('incorrectos'))) {
            showAlert(GENERIC_ERROR, 'error');
            return;
          }
        }
      }

      // ======================================================================
      // 1. VERIFICACIÓN DE CREDENCIALES DE SUPER ADMINISTRADOR (LOCAL FALLBACK)
      // ======================================================================
      const isAdminUser = (
        userClean === 'mcsadmin' || 
        userClean === 'admin' || 
        userClean === 'mcsadmin@magum.com' || 
        userClean === 'samylozano00@gmail.com'
      );

      if (isAdminUser) {
        const storedAdminHash = localStorage.getItem('magum_admin_hash') || DEFAULT_ADMIN_HASH;

        const isAdminPassword = (
          rawPassword === 'MagumAdmin#2030' ||
          pwdClean === 'MagumAdmin#2030' ||
          rawPassword === 'M2030cs' ||
          pwdClean === 'M2030cs' ||
          inputHash === storedAdminHash ||
          inputHash === DEFAULT_ADMIN_HASH
        );

        if (isAdminPassword) {
          // Guardar el hash real generado por el navegador para futuras validaciones
          if (inputHash && inputHash !== rawPassword) {
            localStorage.setItem('magum_admin_hash', inputHash);
          }

          localStorage.setItem('magum_session', JSON.stringify({
            role: 'admin',
            username: 'McSAdmin',
            name: 'Super Administrador',
            email: 'mcsadmin@magum.com',
            loggedAt: new Date().toISOString()
          }));

          showAlert('Acceso Super Admin verificado. Abriendo panel maestro...', 'success');

          setTimeout(() => {
            window.location.href = 'admin.html';
          }, 350);
          return;
        } else {
          showAlert(GENERIC_ERROR, 'error');
          return;
        }
      }

      // ======================================================================
      // 1.5. VERIFICACIÓN DE ADMINISTRADORES ADICIONALES CREADOS
      // ======================================================================
      try {
        const rawAdmins = localStorage.getItem('magum_admin_users');
        const adminUsers = rawAdmins ? JSON.parse(rawAdmins) : [];
        const matchedAdmin = adminUsers.find(a => 
          (a.username || '').toLowerCase() === userClean || 
          (a.email || '').toLowerCase() === userClean
        );

        if (matchedAdmin) {
          const isMatch = (
            rawPassword === matchedAdmin.password || 
            pwdClean === matchedAdmin.password ||
            inputHash === matchedAdmin.passwordHash
          );

          if (isMatch) {
            localStorage.setItem('magum_session', JSON.stringify({
              role: 'admin',
              adminId: matchedAdmin.id,
              username: matchedAdmin.username,
              name: matchedAdmin.name,
              email: matchedAdmin.email,
              loggedAt: new Date().toISOString()
            }));

            showAlert(`Acceso verificado para ${matchedAdmin.name}. Ingresando al panel maestro...`, 'success');

            setTimeout(() => {
              window.location.href = 'admin.html';
            }, 350);
            return;
          } else {
            showAlert(GENERIC_ERROR, 'error');
            return;
          }
        }
      } catch (err) {
        console.warn('Error verificando admin users local:', err);
      }

      // ======================================================================
      // 2. VERIFICACIÓN DE CUENTA DE CLIENTE REGISTRADA
      // ======================================================================
      const rawAccounts = localStorage.getItem('magum_accounts');
      let accounts = [];
      if (rawAccounts) {
        try {
          accounts = JSON.parse(rawAccounts);
        } catch (err) {
          accounts = [];
        }
      }

      const matchedAccounts = accounts.filter(a => (a.email || '').toLowerCase().trim() === userClean);

      if (matchedAccounts.length > 0) {
        const activeAccounts = matchedAccounts.filter(a => a.status !== 'inactive');
        if (activeAccounts.length === 0) {
          showAlert('Esta cuenta se encuentra suspendida. Comunícate con el administrador.', 'error');
          return;
        }

        // Validar contraseña
        const validAccounts = activeAccounts.filter(acc => 
          (acc.passwordHash && acc.passwordHash === inputHash) ||
          (acc.password && acc.password === rawPassword) ||
          (acc.password && acc.password === pwdClean)
        );

        if (validAccounts.length > 0) {
          if (validAccounts.length > 1) {
            showAccountSelectorModal(validAccounts, rawUser, rawPassword);
            return;
          }

          const matchedAccount = validAccounts[0];
          localStorage.setItem('magum_session', JSON.stringify({
            role: 'client',
            accountId: matchedAccount.id,
            clientName: `${matchedAccount.firstName} ${matchedAccount.lastName}`,
            business: matchedAccount.business,
            email: matchedAccount.email,
            modules: matchedAccount.modules,
            availableAccounts: validAccounts.map(a => ({
              id: a.id,
              business: a.business,
              clientName: `${a.firstName} ${a.lastName}`,
              modules: a.modules
            })),
            loggedAt: new Date().toISOString()
          }));

          showAlert(`Bienvenido a ${matchedAccount.business}. Ingresando a tu panel...`, 'success');

          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 350);
          return;
        } else {
          showAlert(GENERIC_ERROR, 'error');
          return;
        }
      }

      // ======================================================================
      // 3. VERIFICACIÓN DE PROFESIONAL DEL EQUIPO AUTORIZADO
      // ======================================================================
      const rawProfs = localStorage.getItem('magum_team_professionals');
      let profs = [];
      if (rawProfs) {
        try {
          profs = JSON.parse(rawProfs);
        } catch (err) {
          profs = [];
        }
      }

      const matchedProf = profs.find(p => (p.email || '').toLowerCase().trim() === userClean);

      if (matchedProf) {
        const profMatches = (matchedProf.password === rawPassword) ||
                            (matchedProf.password === pwdClean) ||
                            (matchedProf.passwordHash && matchedProf.passwordHash === inputHash);

        if (profMatches) {
          localStorage.setItem('magum_session', JSON.stringify({
            role: 'team_member',
            profId: matchedProf.id,
            name: matchedProf.name,
            roleTitle: matchedProf.role,
            email: matchedProf.email,
            business: matchedProf.business || 'Empresa',
            loggedAt: new Date().toISOString()
          }));

          showAlert(`Acceso autorizado para ${matchedProf.name} (${matchedProf.role}). Ingresando...`, 'success');

          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 350);
          return;
        } else {
          showAlert(GENERIC_ERROR, 'error');
          return;
        }
      }

      // Si no coincide con ninguna cuenta existente en la plataforma
      showAlert(GENERIC_ERROR, 'error');
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
          if (window.MagumApi) {
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
          }
          // Fallback local si el backend no respondió
          localStorage.setItem('magum_session', JSON.stringify({
            role: 'client',
            accountId: acc.id,
            clientName: acc.clientName || 'Cliente',
            business: acc.business,
            email: acc.email || userVal,
            modules: acc.modules || { social: true, web: true, crm: true },
            availableAccounts: accounts,
            loggedAt: new Date().toISOString()
          }));
          modal.style.display = 'none';
          showAlert(`Ingresando a ${acc.business}...`, 'success');
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 300);
        } catch (err) {
          modal.style.display = 'none';
          showAlert('Usuario, correo o contraseña incorrectos.', 'error');
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
      const saved = localStorage.getItem('magum_admin_settings');

      if (saved) {
        const data = JSON.parse(saved);
        if (data.faviconUrl && dynamicFavicon) dynamicFavicon.href = data.faviconUrl;
        if (data.logoUrl && brandLogo) brandLogo.src = data.logoUrl;
      }

      if (window.MagumApi) {
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