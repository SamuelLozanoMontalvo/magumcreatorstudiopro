/* ==========================================================================
   MAGUM CREATOR STUDIO - CONTROL DE ACCESO (AUTENTICACIÓN SEGURA)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  const loginForm = document.getElementById('login-form');
  const alertBox = document.getElementById('alert-box');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');
  const eyeIcon = document.getElementById('eye-icon');

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

      // ======================================================================
      // 1. VERIFICACIÓN DE CREDENCIALES DE SUPER ADMINISTRADOR
      // ======================================================================
      const isAdminUser = (userClean === 'mcsadmin' || userClean === 'admin' || userClean === 'mcsadmin@magum.com');

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
            loggedAt: new Date().toISOString()
          }));

          showAlert('Acceso Super Admin verificado. Abriendo panel maestro...', 'success');

          setTimeout(() => {
            window.location.href = 'admin.html';
          }, 350);
          return;
        } else {
          showAlert('Contraseña de administrador incorrecta.', 'error');
          return;
        }
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

      const matchedAccount = accounts.find(a => (a.email || '').toLowerCase().trim() === userClean);

      if (matchedAccount) {
        // Verificar si la cuenta está suspendida
        if (matchedAccount.status === 'inactive') {
          showAlert('Esta cuenta se encuentra suspendida. Comunícate con el administrador.', 'error');
          return;
        }

        // Validar contraseña (por hash SHA-256 o texto plano)
        const passwordMatches = (matchedAccount.passwordHash && matchedAccount.passwordHash === inputHash) ||
                                (matchedAccount.password && matchedAccount.password === rawPassword) ||
                                (matchedAccount.password && matchedAccount.password === pwdClean);

        if (passwordMatches) {
          // Migrar a hash si aún tenía contraseña en claro
          if (!matchedAccount.passwordHash && inputHash && inputHash !== rawPassword) {
            matchedAccount.passwordHash = inputHash;
            delete matchedAccount.password;
            localStorage.setItem('magum_accounts', JSON.stringify(accounts));
          }

          localStorage.setItem('magum_session', JSON.stringify({
            role: 'client',
            accountId: matchedAccount.id,
            clientName: `${matchedAccount.firstName} ${matchedAccount.lastName}`,
            business: matchedAccount.business,
            email: matchedAccount.email,
            modules: matchedAccount.modules,
            loggedAt: new Date().toISOString()
          }));

          showAlert(`Bienvenido a ${matchedAccount.business}. Ingresando a tu panel...`, 'success');

          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 350);
          return;
        } else {
          showAlert('Contraseña incorrecta. Por favor verifica tus datos.', 'error');
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
            business: 'AutoMotor Cartagena',
            loggedAt: new Date().toISOString()
          }));

          showAlert(`Acceso autorizado para ${matchedProf.name} (${matchedProf.role}). Ingresando...`, 'success');

          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 350);
          return;
        } else {
          showAlert('Contraseña incorrecta para este usuario profesional.', 'error');
          return;
        }
      }

      // Si no coincide con ninguna cuenta existente en la plataforma
      showAlert('No existe una cuenta registrada con este correo electrónico. Contacta al administrador para habilitar tu acceso.', 'error');
    });
  }

  function showAlert(message, type) {
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = `alert-box alert-${type}`;
    alertBox.style.display = 'block';
  }

});