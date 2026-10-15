/* ==========================================================================
   MAGUM CREATOR STUDIO - SUPER ADMIN PANEL (LÓGICA INTERACTIVA)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // 1. CONMUTADOR DE TEMA (CLARO / OSCURO)
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const themeText = document.getElementById('theme-text');

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

  // Generador de ID: 7 caracteres alfanuméricos sin símbolos
  function generate7CharId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 7; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  // 2. BASE DE DATOS LOCAL DE CUENTAS (INICIALIZACIÓN EN LOCALSTORAGE)
  const DEFAULT_ACCOUNTS = [
    {
      id: 'MG7K92X',
      firstName: 'Samuel',
      lastName: 'Lozano',
      business: 'AutoMotor Cartagena',
      email: 'samylozano00@gmail.com',
      modules: { social: true, web: true, crm: true },
      createdAt: '2026-10-10',
      status: 'active'
    },
    {
      id: 'BL48D91',
      firstName: 'Laura',
      lastName: 'Restrepo',
      business: 'Spa Bella Luna',
      email: 'contacto@bellalunaspa.co',
      modules: { social: true, web: false, crm: true },
      createdAt: '2026-10-12',
      status: 'active'
    },
    {
      id: 'DG31P82',
      firstName: 'Carlos',
      lastName: 'Mendoza',
      business: 'Dental Group Cartagena',
      email: 'admin@dentalgroup.com',
      modules: { social: false, web: true, crm: true },
      createdAt: '2026-10-13',
      status: 'active'
    },
    {
      id: 'FC89W14',
      firstName: 'Valeria',
      lastName: 'Gómez',
      business: 'Fitness Club Pro',
      email: 'valeria@fitclubpro.co',
      modules: { social: true, web: true, crm: true },
      createdAt: '2026-10-14',
      status: 'inactive'
    }
  ];

  function getAccounts() {
    const data = localStorage.getItem('magum_accounts');
    if (!data) {
      localStorage.setItem('magum_accounts', JSON.stringify(DEFAULT_ACCOUNTS));
      return DEFAULT_ACCOUNTS;
    }
    try {
      let accounts = JSON.parse(data);
      let updated = false;
      // Asegurar formato de 7 caracteres sin # ni guiones
      accounts = accounts.map(acc => {
        if (!acc.id || acc.id.includes('-') || acc.id.startsWith('#') || acc.id.length !== 7) {
          acc.id = generate7CharId();
          updated = true;
        }
        return acc;
      });
      if (updated) saveAccounts(accounts);
      return accounts;
    } catch {
      return DEFAULT_ACCOUNTS;
    }
  }

  function saveAccounts(accounts) {
    localStorage.setItem('magum_accounts', JSON.stringify(accounts));
  }

  // 3. REFERENCIAS DE ELEMENTOS
  const tableBody = document.getElementById('accounts-table-body');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('input-search');
  const clearSearchBtn = document.getElementById('btn-clear-search');
  const filterStatus = document.getElementById('filter-status');
  const filterModule = document.getElementById('filter-module');
  const filterSort = document.getElementById('filter-sort');
  const tableResultsCount = document.getElementById('table-results-count');

  // Estadísticas
  const statTotal = document.getElementById('stat-total-accounts');
  const statActive = document.getElementById('stat-active-accounts');
  const statSocial = document.getElementById('stat-social-accounts');
  const statWeb = document.getElementById('stat-web-accounts');

  // Modal
  const modalCreate = document.getElementById('modal-create-account');
  const btnOpenModal = document.getElementById('btn-open-create-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const formCreate = document.getElementById('form-create-account');

  // Logout
  const btnLogout = document.getElementById('btn-logout');

  // 4. RENDERIZAR TABLA Y ESTADÍSTICAS
  function render() {
    const allAccounts = getAccounts();
    updateStats(allAccounts);

    const query = (searchInput.value || '').trim().toLowerCase();
    const statusVal = filterStatus.value;
    const moduleVal = filterModule.value;
    const sortVal = filterSort.value;

    // Filtros
    let filtered = allAccounts.filter(acc => {
      // Búsqueda por texto (ID exacto, nombre, negocio, correo)
      const fullName = `${acc.firstName} ${acc.lastName}`.toLowerCase();
      const matchSearch = !query || 
        acc.id.toLowerCase().includes(query) ||
        fullName.includes(query) ||
        acc.business.toLowerCase().includes(query) ||
        acc.email.toLowerCase().includes(query);

      // Filtro de Estado
      const matchStatus = (statusVal === 'all') || (acc.status === statusVal);

      // Filtro de Módulos
      let matchModule = true;
      if (moduleVal === 'social-only') matchModule = acc.modules.social && !acc.modules.web;
      if (moduleVal === 'web-only') matchModule = acc.modules.web && !acc.modules.social;
      if (moduleVal === 'both') matchModule = acc.modules.social && acc.modules.web;

      return matchSearch && matchStatus && matchModule;
    });

    // Ordenamiento
    filtered.sort((a, b) => {
      if (sortVal === 'date-desc') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortVal === 'date-asc') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortVal === 'name-asc') return a.business.localeCompare(b.business);
      return 0;
    });

    // Renderizado en DOM
    tableBody.innerHTML = '';
    tableResultsCount.textContent = `Mostrando ${filtered.length} de ${allAccounts.length} cuentas`;

    if (filtered.length === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
      filtered.forEach(acc => {
        const tr = document.createElement('tr');
        
        let statusBadge = '';
        if (acc.status === 'active') {
          statusBadge = '<span class="badge-status badge-status-active"><span class="status-indicator-dot"></span> Activo</span>';
        } else if (acc.status === 'archived') {
          statusBadge = '<span class="badge-status badge-status-archived"><span class="status-indicator-dot"></span> Archivado</span>';
        } else {
          statusBadge = '<span class="badge-status badge-status-inactive"><span class="status-indicator-dot"></span> Suspendido</span>';
        }

        tr.innerHTML = `
          <td><span class="account-id">${acc.id}</span></td>
          <td class="client-name-cell">${escapeHtml(acc.firstName)} ${escapeHtml(acc.lastName)}</td>
          <td class="business-name-cell">${escapeHtml(acc.business)}</td>
          <td class="email-cell">${escapeHtml(acc.email)}</td>
          <td>
            <div class="modules-icons-cell">
              ${acc.modules.social ? '<span class="mod-icon-pill icon-social" title="Social Media habilitado"><i class="fa-solid fa-share-nodes"></i></span>' : ''}
              ${acc.modules.web ? '<span class="mod-icon-pill icon-web" title="Web Editor habilitado"><i class="fa-solid fa-globe"></i></span>' : ''}
              <span class="mod-icon-pill icon-crm" title="CRM y Profesionales siempre activo"><i class="fa-solid fa-users"></i></span>
            </div>
          </td>
          <td>${formatDate(acc.createdAt)}</td>
          <td>${statusBadge}</td>
          <td>
            <div class="actions-cell">
              <button class="btn-row-action btn-impersonate" title="Ver panel como este cliente" data-id="${acc.id}">
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                <span>Ver Panel</span>
              </button>
              <button class="btn-row-action btn-toggle-status" title="${acc.status === 'active' ? 'Suspender cuenta' : 'Activar cuenta'}" data-id="${acc.id}">
                <i class="fa-solid ${acc.status === 'active' ? 'fa-pause' : 'fa-play'}"></i>
              </button>
              <button class="btn-row-action btn-archive-acc" title="${acc.status === 'archived' ? 'Desarchivar cuenta' : 'Archivar cuenta'}" data-id="${acc.id}">
                <i class="fa-solid ${acc.status === 'archived' ? 'fa-box-open' : 'fa-box-archive'}"></i>
              </button>
              <button class="btn-row-action btn-delete-acc" title="Eliminar cuenta permanentemente" data-id="${acc.id}">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </td>
        `;
        tableBody.appendChild(tr);
      });
    }

    attachActionListeners();
  }

  function updateStats(accounts) {
    const total = accounts.length;
    const active = accounts.filter(a => a.status === 'active').length;
    const social = accounts.filter(a => a.modules.social).length;
    const web = accounts.filter(a => a.modules.web).length;

    statTotal.textContent = total;
    statActive.textContent = active;
    statSocial.textContent = social;
    statWeb.textContent = web;
  }

  // 5. ACCIONES EN TABLA (VER PANEL, SUSPENDER, ARCHIVAR Y ELIMINAR)
  function attachActionListeners() {
    // Entrar al panel como cliente
    document.querySelectorAll('.btn-impersonate').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = btn.getAttribute('data-id');
        const acc = getAccounts().find(a => a.id === accId);
        if (acc) {
          localStorage.setItem('magum_session', JSON.stringify({
            role: 'client',
            business: acc.business,
            clientName: `${acc.firstName} ${acc.lastName}`,
            email: acc.email,
            modules: acc.modules,
            impersonatedByAdmin: true
          }));

          const targetUrl = (window.location.protocol === 'file:') ? 'dashboard.html' : 'dashboard';
          window.location.href = targetUrl;
        }
      });
    });

    // Activar o suspender cuenta
    document.querySelectorAll('.btn-toggle-status').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = btn.getAttribute('data-id');
        const accounts = getAccounts();
        const acc = accounts.find(a => a.id === accId);
        if (acc) {
          acc.status = (acc.status === 'active') ? 'inactive' : 'active';
          saveAccounts(accounts);
          render();
        }
      });
    });

    // Archivar o desarchivar cuenta
    document.querySelectorAll('.btn-archive-acc').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = btn.getAttribute('data-id');
        const accounts = getAccounts();
        const acc = accounts.find(a => a.id === accId);
        if (acc) {
          const isArchived = acc.status === 'archived';
          acc.status = isArchived ? 'active' : 'archived';
          saveAccounts(accounts);
          render();
        }
      });
    });

    // Eliminar cuenta
    document.querySelectorAll('.btn-delete-acc').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = btn.getAttribute('data-id');
        const accounts = getAccounts();
        const acc = accounts.find(a => a.id === accId);
        if (acc) {
          const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar permanentemente la cuenta de "${acc.business}" (ID: ${acc.id})?\n\nEsta acción no se puede deshacer.`);
          if (confirmDelete) {
            const updated = accounts.filter(a => a.id !== accId);
            saveAccounts(updated);
            render();
          }
        }
      });
    });
  }

  // 6. EVENTOS DE BÚSQUEDA Y FILTRADO
  searchInput.addEventListener('input', () => {
    clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
    render();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchInput.focus();
    render();
  });

  filterStatus.addEventListener('change', render);
  filterModule.addEventListener('change', render);
  filterSort.addEventListener('change', render);

  // 7. MODAL: CREAR CUENTA
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => {
      modalCreate.style.display = 'flex';
      formCreate.reset();
      document.getElementById('module-social-check').checked = true;
      document.getElementById('module-web-check').checked = true;
      document.getElementById('account-firstname').focus();
    });
  }

  function closeModal() {
    modalCreate.style.display = 'none';
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

  modalCreate.addEventListener('click', (e) => {
    if (e.target === modalCreate) closeModal();
  });

  // Guardar nueva cuenta con ID de 7 caracteres
  formCreate.addEventListener('submit', (e) => {
    e.preventDefault();

    const firstName = document.getElementById('account-firstname').value.trim();
    const lastName = document.getElementById('account-lastname').value.trim();
    const business = document.getElementById('account-business').value.trim();
    const email = document.getElementById('account-email').value.trim();
    const password = document.getElementById('account-password').value.trim();
    const socialCheck = document.getElementById('module-social-check').checked;
    const webCheck = document.getElementById('module-web-check').checked;

    if (!firstName || !lastName || !business || !email || !password) {
      alert('Por favor completa todos los campos obligatorios.');
      return;
    }

    const accounts = getAccounts();
    const newId = generate7CharId();

    const newAccount = {
      id: newId,
      firstName,
      lastName,
      business,
      email,
      password,
      modules: {
        social: socialCheck,
        web: webCheck,
        crm: true // Siempre activo
      },
      createdAt: new Date().toISOString().split('T')[0],
      status: 'active'
    };

    accounts.unshift(newAccount);
    saveAccounts(accounts);
    closeModal();
    render();

    alert(`¡Cuenta creada con éxito!\n\nID: ${newId}\nNegocio: ${business}\nTitular: ${firstName} ${lastName}\nMódulos: ${socialCheck ? 'Social Media ' : ''}${webCheck ? 'Web Editor ' : ''}(CRM siempre activo)\n\nEl cliente ya puede iniciar sesión con:\nUsuario/Correo: ${email}\nContraseña: ${password}`);
  });

  // 8. LOGOUT LIMPIO
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('magum_session');
      const targetUrl = (window.location.protocol === 'file:') ? 'index.html' : '/';
      window.location.href = targetUrl;
    });
  }

  // Helpers
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Carga inicial
  render();

});
