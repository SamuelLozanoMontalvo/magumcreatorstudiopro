/* ==========================================================================
   MAGUM CREATOR STUDIO - CONTROL DE ACCESO (CLIENTES Y SUPER ADMIN)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  const loginForm = document.getElementById('login-form');
  const alertBox = document.getElementById('alert-box');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');
  const eyeIcon = document.getElementById('eye-icon');

  // Mostrar u ocultar contraseña
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      eyeIcon.className = isPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
    });
  }

  // Procesar inicio de sesión
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const userOrEmail = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value.trim();

      if (!userOrEmail || !password) {
        showAlert('Por favor completa todos los campos.', 'error');
        return;
      }

      // 1. Verificación de credenciales de Super Administrador
      const isAdmin = (userOrEmail.toLowerCase() === 'mcsadmin') && (password === 'M2030cs');

      if (isAdmin) {
        localStorage.setItem('magum_session', JSON.stringify({
          role: 'admin',
          username: 'McSAdmin',
          name: 'Super Administrador',
          loggedAt: new Date().toISOString()
        }));

        showAlert('Acceso Super Admin verificado. Abriendo panel maestro...', 'success');

        setTimeout(() => {
          if (window.location.protocol === 'file:') {
            window.location.href = 'admin.html';
          } else {
            window.location.href = 'admin';
          }
        }, 500);
        return;
      }

      // 2. Acceso como Cliente / Negocio
      localStorage.setItem('magum_session', JSON.stringify({
        role: 'client',
        email: userOrEmail,
        business: 'AutoMotor Cartagena',
        loggedAt: new Date().toISOString()
      }));

      showAlert('Credenciales correctas. Ingresando a tu panel...', 'success');

      setTimeout(() => {
        if (window.location.protocol === 'file:') {
          window.location.href = 'dashboard.html';
        } else {
          window.location.href = 'dashboard';
        }
      }, 500);
    });
  }

  function showAlert(message, type) {
    alertBox.textContent = message;
    alertBox.className = `alert-box alert-${type}`;
    alertBox.style.display = 'block';
  }

});