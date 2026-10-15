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

  // 2. MENÚ MÓVIL (HAMBURGUESA Y TELÓN DE FONDO)
  const sidebar = document.getElementById('sidebar');
  const sidebarToggleBtn = document.getElementById('btn-sidebar-toggle');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');

  if (sidebarToggleBtn && sidebar) {
    sidebarToggleBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('open');
      if (sidebarBackdrop) {
        sidebarBackdrop.classList.toggle('active', isOpen);
      }
    });
  }

  if (sidebarBackdrop && sidebar) {
    sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  }

  function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
  }

  // 3. NAVEGACIÓN ENTRE VISTAS (MARKETING SOCIAL Y WEB EDITOR)
  const views = {
    'view-marketing-social': document.getElementById('view-marketing-social'),
    'view-marketing-web': document.getElementById('view-marketing-web')
  };

  const submenuLinks = document.querySelectorAll('.submenu-link');
  const tabButtons = document.querySelectorAll('.marketing-tabs-nav .tab-btn');

  // Evento para pestañas directas (móvil y desktop)
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetViewId = btn.getAttribute('data-view');
      switchView(targetViewId);
    });
  });

  // Evento para enlaces del submenú en el sidebar
  submenuLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetViewId = link.getAttribute('data-view');
      switchView(targetViewId);
      closeMobileSidebar();
    });
  });

  function switchView(viewId) {
    // 1. Mostrar vista activa
    Object.keys(views).forEach(id => {
      if (views[id]) {
        views[id].style.display = (id === viewId) ? 'block' : 'none';
      }
    });

    // 2. Sincronizar botones de pestañas superiores
    tabButtons.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-view') === viewId);
    });

    // 3. Sincronizar enlaces del menú lateral
    submenuLinks.forEach(l => {
      l.classList.toggle('active', l.getAttribute('data-view') === viewId);
    });
  }

  // 4. BOTÓN CREAR POST (LLEVA DIRECTO A SOCIAL MEDIA)
  const btnCreatePost = document.getElementById('btn-create-post');
  if (btnCreatePost) {
    btnCreatePost.addEventListener('click', () => {
      switchView('view-marketing-social');
      const socialSection = document.getElementById('view-marketing-social');
      if (socialSection) {
        socialSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // 5. DESPLEGABLE DEL SUBMENÚ MARKETING EN SIDEBAR
  const submenuToggle = document.querySelector('.nav-submenu-toggle');
  if (submenuToggle) {
    submenuToggle.addEventListener('click', () => {
      const parent = submenuToggle.closest('.nav-item-has-submenu');
      if (parent) parent.classList.toggle('open');
    });
  }

  // 6. ACCIÓN EN BOTONES "PROGRAMAR PUBLICACIÓN"
  const useIdeaButtons = document.querySelectorAll('.btn-use-idea');
  useIdeaButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.idea-card');
      const title = card ? card.querySelector('.idea-title').textContent : 'Publicación';
      alert(`Preparando publicación:\n"${title}"\n\nAquí se abrirá el panel para redactar y enviar a tus redes.`);
    });
  });

  // 7. CIERRE DE SESIÓN LIMPIO
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = (window.location.protocol === 'file:') ? 'index.html' : '/';
    });
  }

});
