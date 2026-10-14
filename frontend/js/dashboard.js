/* ==========================================================================
   MAGUM CREATOR STUDIO - LÓGICA DEL DASHBOARD
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // 1. CONMUTADOR DE MODO CLARO / OSCURO
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const themeText = document.getElementById('theme-text');

  // Cargar preferencia guardada o usar modo claro por defecto
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    updateThemeUI(true);
  } else {
    updateThemeUI(false);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark-mode');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateThemeUI(isDark);
    });
  }

  function updateThemeUI(isDark) {
    if (themeIcon && themeText) {
      if (isDark) {
        themeIcon.className = 'fa-solid fa-sun';
        themeText.textContent = 'Modo Claro';
      } else {
        themeIcon.className = 'fa-solid fa-moon';
        themeText.textContent = 'Modo Oscuro';
      }
    }
  }

  // 2. NAVEGACIÓN ENTRE VISTAS (MARKETING SOCIAL Y WEB EDITOR)
  const views = {
    'view-marketing-social': document.getElementById('view-marketing-social'),
    'view-marketing-web': document.getElementById('view-marketing-web')
  };

  const submenuLinks = document.querySelectorAll('.submenu-link');

  submenuLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetViewId = link.getAttribute('data-view');
      showView(targetViewId);

      submenuLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  function showView(viewId) {
    Object.keys(views).forEach(id => {
      if (views[id]) {
        views[id].style.display = (id === viewId) ? 'block' : 'none';
      }
    });
  }

  // 3. BOTÓN CREAR POST (LLEVA DIRECTO A SOCIAL MEDIA)
  const btnCreatePost = document.getElementById('btn-create-post');
  const linkSocialMedia = document.getElementById('link-social-media');

  if (btnCreatePost) {
    btnCreatePost.addEventListener('click', () => {
      showView('view-marketing-social');
      submenuLinks.forEach(l => l.classList.remove('active'));
      if (linkSocialMedia) linkSocialMedia.classList.add('active');

      const socialSection = document.getElementById('view-marketing-social');
      if (socialSection) {
        socialSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // 4. DESPLEGABLE DEL SUBMENÚ MARKETING EN SIDEBAR
  const submenuToggle = document.querySelector('.nav-submenu-toggle');
  if (submenuToggle) {
    submenuToggle.addEventListener('click', () => {
      const parent = submenuToggle.closest('.nav-item-has-submenu');
      if (parent) parent.classList.toggle('open');
    });
  }

  // 5. ACCIÓN EN BOTONES "PROGRAMAR PUBLICACIÓN"
  const useIdeaButtons = document.querySelectorAll('.btn-use-idea');
  useIdeaButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.idea-card');
      const title = card ? card.querySelector('.idea-title').textContent : 'Publicación';
      alert(`Preparando publicación:\n"${title}"\n\nAquí se abrirá el panel para redactar y enviar a tus redes.`);
    });
  });

});
