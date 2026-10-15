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

  // 2. NAVEGACIÓN DE VISTAS DEL ADMIN
  const adminNavTabs = document.querySelectorAll('.admin-nav-tab');
  const adminViews = document.querySelectorAll('.admin-view');

  adminNavTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-view');
      adminNavTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      adminViews.forEach(v => {
        v.style.display = (v.id === targetId) ? 'block' : 'none';
        v.classList.toggle('active-view', v.id === targetId);
      });
      if (targetId === 'view-admin-crm') renderBillingTable();
    });
  });

  // 3. GENERADOR DE ID DE 7 CARACTERES
  function generate7CharId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 7; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  // 4. BASE DE DATOS LOCAL DE CUENTAS
  const DEFAULT_ACCOUNTS = [
    {
      id: 'SL7K92X',
      firstName: 'Samuel',
      lastName: 'Lozano',
      business: 'AutoMotor Cartagena',
      email: 'samylozano00@gmail.com',
      modules: { social: true, web: true, crm: true },
      createdAt: '2026-10-10',
      status: 'active'
    },
    {
      id: 'LR4M21B',
      firstName: 'Laura',
      lastName: 'Restrepo',
      business: 'Spa Bella Luna',
      email: 'contacto@bellalunaspa.co',
      modules: { social: true, web: false, crm: true },
      createdAt: '2026-10-12',
      status: 'active'
    },
    {
      id: 'CM8N45T',
      firstName: 'Carlos',
      lastName: 'Mendoza',
      business: 'Dental Group Cartagena',
      email: 'admin@dentalgroup.com',
      modules: { social: false, web: true, crm: true },
      createdAt: '2026-10-13',
      status: 'active'
    },
    {
      id: 'VG3P78F',
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

  // 5. REFERENCIAS DE ELEMENTOS
  const tableBody = document.getElementById('accounts-table-body');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('input-search');
  const clearSearchBtn = document.getElementById('btn-clear-search');
  const filterStatus = document.getElementById('filter-status');
  const filterModule = document.getElementById('filter-module');
  const filterSort = document.getElementById('filter-sort');
  const tableResultsCount = document.getElementById('table-results-count');

  const statTotal = document.getElementById('stat-total-accounts');
  const statActive = document.getElementById('stat-active-accounts');
  const statSocial = document.getElementById('stat-social-accounts');
  const statWeb = document.getElementById('stat-web-accounts');

  const modalCreate = document.getElementById('modal-create-account');
  const btnOpenModal = document.getElementById('btn-open-create-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const formCreate = document.getElementById('form-create-account');
  const btnLogout = document.getElementById('btn-logout');

  // 6. RENDERIZAR TABLA DE CUENTAS
  function render() {
    const allAccounts = getAccounts();
    updateStats(allAccounts);

    const query = (searchInput.value || '').trim().toLowerCase();
    const statusVal = filterStatus.value;
    const moduleVal = filterModule.value;
    const sortVal = filterSort.value;

    let filtered = allAccounts.filter(acc => {
      const fullName = `${acc.firstName} ${acc.lastName}`.toLowerCase();
      const matchSearch = !query ||
        acc.id.toLowerCase().includes(query) ||
        fullName.includes(query) ||
        acc.business.toLowerCase().includes(query) ||
        acc.email.toLowerCase().includes(query);

      const matchStatus = (statusVal === 'all') || (acc.status === statusVal);

      let matchModule = true;
      if (moduleVal === 'social-only') matchModule = acc.modules.social && !acc.modules.web;
      if (moduleVal === 'web-only') matchModule = acc.modules.web && !acc.modules.social;
      if (moduleVal === 'both') matchModule = acc.modules.social && acc.modules.web;

      return matchSearch && matchStatus && matchModule;
    });

    filtered.sort((a, b) => {
      if (sortVal === 'date-desc') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortVal === 'date-asc') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortVal === 'name-asc') return a.business.localeCompare(b.business);
      return 0;
    });

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
              ${acc.modules.social ? '<span class="mod-icon-pill icon-social" title="Social Media"><i class="fa-solid fa-share-nodes"></i></span>' : ''}
              ${acc.modules.web ? '<span class="mod-icon-pill icon-web" title="Web Editor"><i class="fa-solid fa-globe"></i></span>' : ''}
              <span class="mod-icon-pill icon-crm" title="CRM siempre activo"><i class="fa-solid fa-users"></i></span>
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

  // 7. ACCIONES EN TABLA
  function attachActionListeners() {
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

    document.querySelectorAll('.btn-delete-acc').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = btn.getAttribute('data-id');
        const accounts = getAccounts();
        const acc = accounts.find(a => a.id === accId);
        if (acc) {
          const ok = confirm(`¿Eliminar permanentemente la cuenta de "${acc.business}" (ID: ${acc.id})?\n\nEsta acción no se puede deshacer.`);
          if (ok) {
            saveAccounts(accounts.filter(a => a.id !== accId));
            render();
          }
        }
      });
    });
  }

  // 8. BÚSQUEDA Y FILTROS
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

  // 9. MODAL CREAR CUENTA
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => {
      modalCreate.style.display = 'flex';
      formCreate.reset();
      document.getElementById('module-social-check').checked = true;
      document.getElementById('module-web-check').checked = true;
      document.getElementById('account-firstname').focus();
    });
  }

  function closeModal() { modalCreate.style.display = 'none'; }
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);
  modalCreate.addEventListener('click', (e) => { if (e.target === modalCreate) closeModal(); });

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
      modules: { social: socialCheck, web: webCheck, crm: true },
      createdAt: new Date().toISOString().split('T')[0],
      status: 'active'
    };

    accounts.unshift(newAccount);
    saveAccounts(accounts);
    closeModal();
    render();
    alert(`✅ Cuenta creada\n\nID: ${newId}\nNegocio: ${business}\nTitular: ${firstName} ${lastName}\n\nCredenciales de acceso:\nUsuario: ${email}\nContraseña: ${password}`);
  });

  // 10. CRM DE FACTURACIÓN
  const DEFAULT_BILLING = [
    {
      id: 'B' + generate7CharId(),
      clientName: 'Samuel Lozano',
      business: 'AutoMotor Cartagena',
      plan: 'monthly',
      amount: 150000,
      startDate: '2026-10-01',
      modules: 'Social Media + Web Editor',
      notes: 'Cliente ancla. Pago puntual.',
      paymentStatus: 'paid'
    },
    {
      id: 'B' + generate7CharId(),
      clientName: 'Laura Restrepo',
      business: 'Spa Bella Luna',
      plan: 'annual',
      amount: 1500000,
      startDate: '2026-06-15',
      modules: 'Social Media',
      notes: 'Pagó anual con descuento del 15%.',
      paymentStatus: 'paid'
    },
    {
      id: 'B' + generate7CharId(),
      clientName: 'Carlos Mendoza',
      business: 'Dental Group Cartagena',
      plan: 'lifetime',
      amount: 3500000,
      startDate: '2026-09-01',
      modules: 'Web Editor',
      notes: 'Licencia vitalicia. No cobrar más.',
      paymentStatus: 'paid'
    }
  ];

  function getBilling() {
    const data = localStorage.getItem('magum_billing');
    if (!data) {
      localStorage.setItem('magum_billing', JSON.stringify(DEFAULT_BILLING));
      return DEFAULT_BILLING;
    }
    try { return JSON.parse(data); } catch { return DEFAULT_BILLING; }
  }

  function saveBilling(items) {
    localStorage.setItem('magum_billing', JSON.stringify(items));
  }

  function planLabel(plan) {
    const labels = {
      lifetime: '♾ Vitalicio',
      monthly: '📅 Mensual',
      quarterly: '📅 Trimestral',
      biannual: '📅 Semestral',
      annual: '📅 Anual'
    };
    return labels[plan] || plan;
  }

  function planCycleDays(plan) {
    return { monthly: 30, quarterly: 90, biannual: 180, annual: 365 }[plan] || null;
  }

  function nextBillingDate(startDate, plan) {
    if (plan === 'lifetime') return null;
    const days = planCycleDays(plan);
    if (!days) return null;
    const start = new Date(startDate);
    const today = new Date();
    let next = new Date(start);
    while (next <= today) {
      next.setDate(next.getDate() + days);
    }
    return next;
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
  }

  function daysUntil(date) {
    if (!date) return null;
    const diff = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  function renderBillingTable() {
    const items = getBilling();
    const billingBody = document.getElementById('billing-table-body');
    const billingEmpty = document.getElementById('billing-empty-state');
    const billingCount = document.getElementById('billing-results-count');
    const billingIncome = document.getElementById('billing-stat-income');
    const billingUpcoming = document.getElementById('billing-stat-upcoming');
    const billingLifetime = document.getElementById('billing-stat-lifetime');
    const billingRecurring = document.getElementById('billing-stat-recurring');

    if (!billingBody) return;

    const lifetime = items.filter(i => i.plan === 'lifetime').length;
    const recurring = items.filter(i => i.plan !== 'lifetime').length;
    const upcoming = items.filter(i => {
      const nd = nextBillingDate(i.startDate, i.plan);
      const d = daysUntil(nd);
      return d !== null && d >= 0 && d <= 7;
    }).length;
    const income = items.reduce((sum, i) => i.plan !== 'lifetime' ? sum + (i.amount || 0) : sum, 0);

    if (billingIncome) billingIncome.textContent = formatCurrency(income);
    if (billingUpcoming) billingUpcoming.textContent = upcoming;
    if (billingLifetime) billingLifetime.textContent = lifetime;
    if (billingRecurring) billingRecurring.textContent = recurring;
    if (billingCount) billingCount.textContent = `${items.length} registros`;

    billingBody.innerHTML = '';

    if (items.length === 0) {
      if (billingEmpty) billingEmpty.style.display = 'block';
      return;
    }
    if (billingEmpty) billingEmpty.style.display = 'none';

    items.forEach(item => {
      const nd = nextBillingDate(item.startDate, item.plan);
      const days = daysUntil(nd);

      let nextLabel = '';
      let nextBadge = '';
      if (item.plan === 'lifetime') {
        nextLabel = '—';
        nextBadge = '<span class="badge-status badge-status-active"><span class="status-indicator-dot"></span> Sin cobros</span>';
      } else if (nd) {
        nextLabel = formatDate(nd.toISOString().split('T')[0]);
        if (days !== null && days <= 7 && days >= 0) {
          nextBadge = `<span class="badge-status badge-billing-warn"><span class="status-indicator-dot"></span> En ${days} día${days === 1 ? '' : 's'}</span>`;
        } else if (days !== null && days < 0) {
          nextBadge = '<span class="badge-status badge-status-inactive"><span class="status-indicator-dot"></span> Vencido</span>';
        } else {
          nextBadge = `<span style="font-size:0.78rem;color:var(--text-muted);">${nextLabel}</span>`;
        }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="client-name-cell">${escapeHtml(item.clientName)}</td>
        <td class="business-name-cell">${escapeHtml(item.business)}</td>
        <td>${planLabel(item.plan)}</td>
        <td style="font-weight:700;">${item.plan === 'lifetime' ? formatCurrency(item.amount) : formatCurrency(item.amount) + '/ciclo'}</td>
        <td>${nextBadge}</td>
        <td><span class="badge-status badge-status-active"><span class="status-indicator-dot"></span> Al día</span></td>
        <td style="max-width:180px;font-size:0.8rem;color:var(--text-muted);">${escapeHtml(item.notes || '—')}</td>
        <td>
          <div class="actions-cell">
            <button class="btn-row-action btn-edit-billing" title="Editar registro" data-id="${item.id}">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-row-action btn-delete-billing" title="Eliminar registro" data-id="${item.id}">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;
      billingBody.appendChild(tr);
    });

    // Eliminar billing
    document.querySelectorAll('.btn-delete-billing').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const items = getBilling();
        const item = items.find(i => i.id === id);
        if (item && confirm(`¿Eliminar el registro de "${item.business}"?`)) {
          saveBilling(items.filter(i => i.id !== id));
          renderBillingTable();
        }
      });
    });
  }

  // Modal facturación
  const modalBilling = document.getElementById('modal-billing');
  const btnOpenBillingModal = document.getElementById('btn-open-billing-modal');
  const btnCloseBillingModal = document.getElementById('btn-close-billing-modal');
  const btnCancelBillingModal = document.getElementById('btn-cancel-billing-modal');
  const formBilling = document.getElementById('form-billing');

  if (btnOpenBillingModal) {
    btnOpenBillingModal.addEventListener('click', () => {
      modalBilling.style.display = 'flex';
      formBilling.reset();
    });
  }

  function closeBillingModal() { if (modalBilling) modalBilling.style.display = 'none'; }
  if (btnCloseBillingModal) btnCloseBillingModal.addEventListener('click', closeBillingModal);
  if (btnCancelBillingModal) btnCancelBillingModal.addEventListener('click', closeBillingModal);
  if (modalBilling) {
    modalBilling.addEventListener('click', (e) => { if (e.target === modalBilling) closeBillingModal(); });
  }

  if (formBilling) {
    formBilling.addEventListener('submit', (e) => {
      e.preventDefault();
      const clientName = document.getElementById('billing-client-name').value.trim();
      const business = document.getElementById('billing-business').value.trim();
      const plan = document.getElementById('billing-plan-type').value;
      const amount = parseFloat(document.getElementById('billing-amount').value) || 0;
      const startDate = document.getElementById('billing-start-date').value || new Date().toISOString().split('T')[0];
      const modules = document.getElementById('billing-modules').value.trim();
      const notes = document.getElementById('billing-notes').value.trim();

      if (!clientName || !business || !plan) {
        alert('Completa los campos obligatorios: nombre, negocio y plan.');
        return;
      }

      const items = getBilling();
      items.unshift({
        id: 'B' + generate7CharId(),
        clientName,
        business,
        plan,
        amount,
        startDate,
        modules,
        notes,
        paymentStatus: 'paid'
      });
      saveBilling(items);
      closeBillingModal();
      renderBillingTable();
    });
  }

  // 11. LOGO ADMIN
  const adminLogoFile = document.getElementById('admin-logo-file');
  const adminLogoPreview = document.getElementById('admin-logo-preview-img');
  if (adminLogoFile && adminLogoPreview) {
    adminLogoFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => { adminLogoPreview.src = ev.target.result; };
        reader.readAsDataURL(file);
      }
    });
  }

  // 12. LOGOUT
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('magum_session');
      window.location.href = (window.location.protocol === 'file:') ? 'index.html' : '/';
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
