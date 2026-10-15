/* ==========================================================================
   MAGUM CREATOR STUDIO - LÓGICA DEL DASHBOARD INTEGRAL
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

  // 1.1 LEER SESIÓN ACTIVA Y APLICAR PERMISOS DE MÓDULOS
  const rawSession = localStorage.getItem('magum_session');
  if (rawSession) {
    try {
      const session = JSON.parse(rawSession);
      if (session.business) {
        const topbarName = document.getElementById('topbar-account-name');
        const sidebarName = document.getElementById('sidebar-account-name');
        if (topbarName) topbarName.textContent = session.business;
        if (sidebarName) sidebarName.textContent = session.business;
      }

      // Si fue abierto por el Super Admin, mostrar barra para volver al panel maestro
      if (session.impersonatedByAdmin) {
        const banner = document.createElement('div');
        banner.style.cssText = 'background: #210087; color: #fff; padding: 10px 20px; font-size: 0.82rem; font-weight: 700; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 1000; box-shadow: 0 2px 10px rgba(0,0,0,0.2);';
        banner.innerHTML = `
          <span><i class="fa-solid fa-user-shield"></i> Vista previa de cliente: <strong>${session.business}</strong></span>
          <a href="${window.location.protocol === 'file:' ? 'admin.html' : 'admin'}" style="color: #FDD344; text-decoration: none; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-arrow-left"></i> Volver a Super Admin</a>
        `;
        document.body.prepend(banner);
      }

      // Deshabilitar módulos si no están contratados
      if (session.modules) {
        if (!session.modules.web) {
          const webSubmenu = document.querySelector('[data-view="view-marketing-web"]');
          if (webSubmenu && webSubmenu.closest('li')) webSubmenu.closest('li').style.display = 'none';
        }
        if (!session.modules.social) {
          const socialSubmenu = document.querySelector('[data-view="view-marketing-social"]');
          if (socialSubmenu && socialSubmenu.closest('li')) socialSubmenu.closest('li').style.display = 'none';
          const btnCreatePost = document.getElementById('btn-create-post');
          if (btnCreatePost) btnCreatePost.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('Error leyendo sesión:', e);
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

  // 3. NAVEGACIÓN ENTRE VISTAS DEL MENÚ LATERAL
  const views = {
    'view-dashboard': document.getElementById('view-dashboard'),
    'view-crm': document.getElementById('view-crm'),
    'view-marketing-social': document.getElementById('view-marketing-social'),
    'view-marketing-web': document.getElementById('view-marketing-web')
  };

  const navLinks = document.querySelectorAll('.sidebar-nav .nav-link[data-view], .submenu-link[data-view]');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetViewId = link.getAttribute('data-view');
      if (views[targetViewId]) {
        e.preventDefault();
        switchView(targetViewId);
        closeMobileSidebar();

        // Actualizar clase activa en enlaces
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  });

  function switchView(viewId) {
    Object.keys(views).forEach(id => {
      if (views[id]) {
        views[id].style.display = (id === viewId) ? 'block' : 'none';
      }
    });
  }

  // 4. ACCIONES DE SUGERENCIAS INTELIGENTES (CRM & MARKETING)
  const suggestionButtons = document.querySelectorAll('.btn-action-suggestion');
  suggestionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      const card = btn.closest('.suggestion-card') || btn.closest('.channel-summary-card');
      const title = card ? (card.querySelector('.suggestion-title') || card.querySelector('.channel-name')).textContent : 'Acción';

      if (action === 'email-campaign') {
        alert(`📧 Preparando Campaña de Email Masivo:\n\nAsunto: Recordatorio de Mantenimiento Preventivo\nAudiencia: 142 clientes inactivos (+60 días)\n\nAquí se abrirá el redactor de correos con la plantilla optimizada.`);
      } else if (action === 'whatsapp-broadcast') {
        alert(`💬 Preparando Difusión por WhatsApp:\n\nCampaña: Diagnóstico VIP Gratuito de Frenos y Batería\nAudiencia: 85 clientes VIP seleccionados\n\nAquí se conectará el envío directo a WhatsApp Business.`);
      } else if (action === 'social-post') {
        alert(`📱 Programador de Publicaciones:\n\nPost: 3 ruidos en tu vehículo que nunca debes ignorar\nRedes: Instagram, Facebook y TikTok\n\nAbriendo el creador y programador de posts.`);
      } else if (action === 'open-web-editor') {
        alert(`🌐 Abriendo Editor Visual de Página Web para www.automotorcartagena.com`);
      }
    });
  });

  // Botón directo para ir a Redes desde el resumen de canales
  const btnSummaryToSocial = document.getElementById('btn-summary-to-social');
  if (btnSummaryToSocial) {
    btnSummaryToSocial.addEventListener('click', () => {
      const linkSocial = document.getElementById('link-social-media');
      if (linkSocial) linkSocial.click();
    });
  }

  // 5. BOTÓN CREAR POST (TOPBAR)
  const btnCreatePost = document.getElementById('btn-create-post');
  if (btnCreatePost) {
    btnCreatePost.addEventListener('click', () => {
      const ideasSection = document.querySelector('.ideas-grid');
      if (ideasSection) {
        ideasSection.scrollIntoView({ behavior: 'smooth' });
      }
      alert('📝 Abriendo el creador rápido de publicación para Instagram, Facebook y TikTok.');
    });
  }

  // 6. DESPLEGABLE DEL SUBMENÚ MARKETING EN SIDEBAR
  const submenuToggle = document.querySelector('.nav-submenu-toggle');
  if (submenuToggle) {
    submenuToggle.addEventListener('click', () => {
      const parent = submenuToggle.closest('.nav-item-has-submenu');
      if (parent) parent.classList.toggle('open');
    });
  }

  // 7. ACCIÓN EN BOTONES "PROGRAMAR PUBLICACIÓN" DE IDEAS
  const useIdeaButtons = document.querySelectorAll('.btn-use-idea');
  useIdeaButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.idea-card');
      const title = card ? card.querySelector('.idea-title').textContent : 'Publicación';
      alert(`Preparando publicación:\n"${title}"\n\nAquí se abrirá el panel para redactar y enviar a tus redes.`);
    });
  });

  // 8. CIERRE DE SESIÓN LIMPIO
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = (window.location.protocol === 'file:') ? 'index.html' : '/';
    });
  }

});
