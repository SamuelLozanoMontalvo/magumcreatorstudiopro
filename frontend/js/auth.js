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
      // Evita que los datos se manden por GET y se expongan en la URL
      e.preventDefault();

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value.trim();

      if (!email || !password) {
        showAlert('Por favor completa todos los campos.', 'error');
        return;
      }

      // Simulación de acceso exitoso (luego conectaremos con la base de datos)
      showAlert('Credenciales correctas. Ingresando...', 'success');

      setTimeout(() => {
        // En Vercel / producción redirige a dashboard limpio, en local a dashboard.html
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