/* ==========================================================================
   MAGUM CREATOR STUDIO - SUPER ADMIN PANEL (LÓGICA INTERACTIVA)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // 0. VERIFICACIÓN DE SESIÓN MAESTRA (PROTECCIÓN DE RUTA)
  const rawSession = localStorage.getItem('magum_session');
  let session = null;
  try {
    session = JSON.parse(rawSession);
  } catch (e) {
    session = null;
  }

  if (!session || session.role !== 'admin') {
    // Si no es admin autenticado, redirigir a login
    const targetUrl = (window.location.protocol === 'file:') ? 'index.html' : '/';
    window.location.replace(targetUrl);
    return;
  }

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

  // 2. GENERADOR DE ID ÚNICO DE 7 CARACTERES (ALFANUMÉRICO, SIN SÍMBOLOS)
  function generate7CharId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 7; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  // Función utilitaria para hashing SHA-256
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 3. NAVEGACIÓN DE PESTAÑAS (CUENTAS / FACTURACIÓN / AJUSTES)
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

  // 4. BASE DE DATOS LOCAL DE CUENTAS (SEEDS INICIALES CON HASH)
  // Contraseña inicial de prueba para todas las cuentas seed: "Magum2026*"
  // SHA-256 de "Magum2026*": 7f1e679a93074ceaa611ff6e4b85da812dc56ba0236a28ee96f7c7586526ebcf
  const DEFAULT_SEED_HASH = '7f1e679a93074ceaa611ff6e4b85da812dc56ba0236a28ee96f7c7586526ebcf';

  const DEFAULT_ACCOUNTS = [
    {
      id: 'SL7K92X',
      firstName: 'Samuel',
      lastName: 'Lozano',
      business: 'AutoMotor Cartagena',
      email: 'samylozano00@gmail.com',
      passwordHash: DEFAULT_SEED_HASH,
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
      passwordHash: DEFAULT_SEED_HASH,
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
      passwordHash: DEFAULT_SEED_HASH,
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
      passwordHash: DEFAULT_SEED_HASH,
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
        // Asegurar ID de 7 caracteres
        if (!acc.id || acc.id.includes('-') || acc.id.startsWith('#') || acc.id.length !== 7) {
          acc.id = generate7CharId();
          updated = true;
        }
        // Migrar passwords en texto plano a hash si existen
        if (acc.password && !acc.passwordHash) {
          acc.passwordHash = DEFAULT_SEED_HASH;
          delete acc.password;
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

  // 5. REFERENCIAS DE ELEMENTOS (CUENTAS)
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
    if (!tableBody) return;
    const allAccounts = getAccounts();
    updateStats(allAccounts);

    const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const statusVal = filterStatus ? filterStatus.value : 'all';
    const moduleVal = filterModule ? filterModule.value : 'all';
    const sortVal = filterSort ? filterSort.value : 'date-desc';

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
    if (tableResultsCount) {
      tableResultsCount.textContent = `Mostrando ${filtered.length} de ${allAccounts.length} cuentas`;
    }

    if (filtered.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      filtered.forEach(acc => {
        const tr = document.createElement('tr');

        // Definición segura de statusBadge (resuelve bug #6)
        let statusBadge = '';
        if (acc.status === 'active') {
          statusBadge = '<span class="badge-status badge-status-active"><span class="status-indicator-dot"></span> Activo</span>';
        } else {
          statusBadge = '<span class="badge-status badge-status-inactive"><span class="status-indicator-dot"></span> Suspendido</span>';
        }

        // Prevención de XSS: escapar id, nombre, negocio y correo
        tr.innerHTML = `
          <td><span class="account-id">${escapeHtml(acc.id)}</span></td>
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
              <button class="btn-row-action btn-impersonate" title="Ver panel como este cliente" data-id="${escapeHtml(acc.id)}">
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                <span>Ver Panel</span>
              </button>
              <button class="btn-row-action btn-toggle-status" title="${acc.status === 'active' ? 'Suspender cuenta' : 'Activar cuenta'}" data-id="${escapeHtml(acc.id)}">
                <i class="fa-solid ${acc.status === 'active' ? 'fa-pause' : 'fa-play'}"></i>
              </button>
              <button class="btn-row-action btn-delete-acc" title="Eliminar cuenta permanentemente" data-id="${escapeHtml(acc.id)}">
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
    if (statTotal) statTotal.textContent = accounts.length;
    if (statActive) statActive.textContent = accounts.filter(a => a.status === 'active').length;
    if (statSocial) statSocial.textContent = accounts.filter(a => a.modules.social).length;
    if (statWeb) statWeb.textContent = accounts.filter(a => a.modules.web).length;
  }

  // 7. ACCIONES DE FILA (VER PANEL, SUSPENDER, ELIMINAR)
  function attachActionListeners() {
    document.querySelectorAll('.btn-impersonate').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = btn.getAttribute('data-id');
        const acc = getAccounts().find(a => a.id === accId);
        if (acc) {
          localStorage.setItem('magum_session', JSON.stringify({
            role: 'client',
            accountId: acc.id,
            business: acc.business,
            clientName: `${acc.firstName} ${acc.lastName}`,
            email: acc.email,
            modules: acc.modules,
            impersonatedByAdmin: true,
            loggedAt: new Date().toISOString()
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
          const ok = confirm(`¿Estás seguro de eliminar permanentemente la cuenta de "${acc.business}" (ID: ${acc.id})?\n\nEsta acción eliminará todos los accesos del cliente.`);
          if (ok) {
            saveAccounts(accounts.filter(a => a.id !== accId));
            render();
          }
        }
      });
    });
  }

  // 8. BÚSQUEDA Y FILTRADO
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (clearSearchBtn) clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
      render();
    });
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      searchInput.focus();
      render();
    });
  }
  if (filterStatus) filterStatus.addEventListener('change', render);
  if (filterModule) filterModule.addEventListener('change', render);
  if (filterSort) filterSort.addEventListener('change', render);

  // 9. MODAL CREAR CUENTA DE CLIENTE
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
    if (modalCreate) modalCreate.style.display = 'none';
  }
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);
  if (modalCreate) {
    modalCreate.addEventListener('click', (e) => {
      if (e.target === modalCreate) closeModal();
    });
  }

  if (formCreate) {
    formCreate.addEventListener('submit', async (e) => {
      e.preventDefault();
      const firstName = document.getElementById('account-firstname').value.trim();
      const lastName = document.getElementById('account-lastname').value.trim();
      const business = document.getElementById('account-business').value.trim();
      const email = document.getElementById('account-email').value.trim().toLowerCase();
      const password = document.getElementById('account-password').value;
      const socialCheck = document.getElementById('module-social-check').checked;
      const webCheck = document.getElementById('module-web-check').checked;

      if (!firstName || !lastName || !business || !email || !password) {
        alert('Por favor completa todos los campos obligatorios.');
        return;
      }

      const accounts = getAccounts();

      // Validar si el correo ya existe
      const exists = accounts.find(a => a.email.toLowerCase() === email);
      if (exists) {
        alert(`Ya existe una cuenta registrada con el correo "${email}".`);
        return;
      }

      const newId = generate7CharId();
      const passwordHash = await sha256(password);

      const newAccount = {
        id: newId,
        firstName,
        lastName,
        business,
        email,
        passwordHash, // Contraseña protegida con SHA-256
        modules: {
          social: socialCheck,
          web: webCheck,
          crm: true
        },
        createdAt: new Date().toISOString().split('T')[0],
        status: 'active'
      };

      accounts.unshift(newAccount);
      saveAccounts(accounts);

      // También registrar automáticamente en el CRM de facturación
      const billingItems = getBilling();
      billingItems.unshift({
        id: 'B' + generate7CharId(),
        clientName: `${firstName} ${lastName}`,
        business,
        plan: 'monthly',
        amount: 150000,
        startDate: new Date().toISOString().split('T')[0],
        modules: `${socialCheck ? 'Social Media ' : ''}${webCheck ? 'Web Editor' : ''}`.trim() || 'CRM',
        notes: 'Cliente creado desde panel maestro.',
        paymentStatus: 'paid'
      });
      saveBilling(billingItems);

      closeModal();
      render();

      // Notificación sin exponer contraseña en texto plano
      alert(`✅ ¡Cuenta creada con éxito!\n\nID: ${newId}\nNegocio: ${business}\nTitular: ${firstName} ${lastName}\nCorreo de acceso: ${email}\n\nEl cliente ya puede iniciar sesión desde el portal con sus credenciales.`);
    });
  }

  // ==========================================================================
  // 10. CRM DE FACTURACIÓN (SUPER ADMIN)
  // ==========================================================================

  const DEFAULT_BILLING = [
    {
      id: 'B' + generate7CharId(),
      clientName: 'Samuel Lozano',
      business: 'AutoMotor Cartagena',
      plan: 'monthly',
      amount: 150000,
      startDate: '2026-10-01',
      modules: 'Social Media + Web Editor',
      notes: 'Cliente ancla. Facturación mensual.',
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
      notes: 'Pagó anualidad completa.',
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
      notes: 'Licencia vitalicia. No cobrar.',
      paymentStatus: 'paid'
    }
  ];

  function getBilling() {
    const data = localStorage.getItem('magum_billing');
    if (!data) {
      localStorage.setItem('magum_billing', JSON.stringify(DEFAULT_BILLING));
      return DEFAULT_BILLING;
    }
    try {
      return JSON.parse(data);
    } catch {
      return DEFAULT_BILLING;
    }
  }

  function saveBilling(items) {
    localStorage.setItem('magum_billing', JSON.stringify(items));
  }

  function planLabel(plan) {
    const labels = {
      lifetime: '♾ De por vida (Vitalicio)',
      monthly: '📅 Mensual',
      quarterly: '📅 Trimestral (3 meses)',
      biannual: '📅 Semestral (6 meses)',
      annual: '📅 Anual (12 meses)'
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
    return Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
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
    const income = items.reduce((sum, i) => (i.plan !== 'lifetime') ? sum + (Number(i.amount) || 0) : sum, 0);

    if (billingIncome) billingIncome.textContent = formatCurrency(income);
    if (billingUpcoming) billingUpcoming.textContent = upcoming;
    if (billingLifetime) billingLifetime.textContent = lifetime;
    if (billingRecurring) billingRecurring.textContent = recurring;
    if (billingCount) billingCount.textContent = `${items.length} clientes registrados`;

    billingBody.innerHTML = '';

    if (items.length === 0) {
      if (billingEmpty) billingEmpty.style.display = 'block';
      return;
    }
    if (billingEmpty) billingEmpty.style.display = 'none';

    items.forEach(item => {
      const nd = nextBillingDate(item.startDate, item.plan);
      const days = daysUntil(nd);

      let nextBadge = '';
      if (item.plan === 'lifetime') {
        nextBadge = '<span class="badge-status badge-status-active"><span class="status-indicator-dot"></span> Sin cobros (Vitalicio)</span>';
      } else if (nd) {
        const dateStr = formatDate(nd.toISOString().split('T')[0]);
        if (days !== null && days <= 7 && days >= 0) {
          nextBadge = `<span class="badge-status badge-billing-warn"><span class="status-indicator-dot"></span> Cobra en ${days} día${days === 1 ? '' : 's'} (${dateStr})</span>`;
        } else if (days !== null && days < 0) {
          nextBadge = `<span class="badge-status badge-status-inactive"><span class="status-indicator-dot"></span> Vencido (${dateStr})</span>`;
        } else {
          nextBadge = `<span style="font-size:0.82rem; font-weight:600;">${dateStr} (en ${days} días)</span>`;
        }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="client-name-cell">${escapeHtml(item.clientName)}</td>
        <td class="business-name-cell">${escapeHtml(item.business)}</td>
        <td>${planLabel(item.plan)}</td>
        <td style="font-weight:700;">${item.plan === 'lifetime' ? formatCurrency(item.amount) : formatCurrency(item.amount) + ' / ciclo'}</td>
        <td>${nextBadge}</td>
        <td><span class="badge-status badge-status-active"><span class="status-indicator-dot"></span> Al día</span></td>
        <td style="max-width:180px;font-size:0.8rem;color:var(--text-muted);">${escapeHtml(item.notes || '—')}</td>
        <td>
          <div class="actions-cell">
            <button class="btn-row-action btn-delete-billing" title="Eliminar registro" data-id="${escapeHtml(item.id)}">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;
      billingBody.appendChild(tr);
    });

    document.querySelectorAll('.btn-delete-billing').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const items = getBilling();
        const item = items.find(i => i.id === id);
        if (item && confirm(`¿Deseas eliminar el registro de facturación de "${item.business}"?`)) {
          saveBilling(items.filter(i => i.id !== id));
          renderBillingTable();
        }
      });
    });
  }

  // Modal de facturación (resuelve bug #8)
  const modalBilling = document.getElementById('modal-billing');
  const btnOpenBillingModal = document.getElementById('btn-open-billing-modal');
  const btnCloseBillingModal = document.getElementById('btn-close-billing-modal');
  const btnCancelBillingModal = document.getElementById('btn-cancel-billing-modal');
  const formBilling = document.getElementById('form-billing');

  if (btnOpenBillingModal) {
    btnOpenBillingModal.addEventListener('click', () => {
      if (modalBilling) modalBilling.style.display = 'flex';
      if (formBilling) {
        formBilling.reset();
        const startDateInput = document.getElementById('billing-start-date');
        if (startDateInput) startDateInput.value = new Date().toISOString().split('T')[0];
      }
    });
  }

  function closeBillingModal() {
    if (modalBilling) modalBilling.style.display = 'none';
  }
  if (btnCloseBillingModal) btnCloseBillingModal.addEventListener('click', closeBillingModal);
  if (btnCancelBillingModal) btnCancelBillingModal.addEventListener('click', closeBillingModal);
  if (modalBilling) {
    modalBilling.addEventListener('click', (e) => {
      if (e.target === modalBilling) closeBillingModal();
    });
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
      alert(`✅ Registro guardado para "${business}".`);
    });
  }

  // ==========================================================================
  // 11. AJUSTES DEL ADMIN (PERSISTENCIA REAL - RESUELVE BUG #11)
  // ==========================================================================

  const ADMIN_SETTINGS_KEY = 'magum_admin_settings';
  const adminSettingName = document.getElementById('admin-setting-name');
  const adminLogoPreviewImg = document.getElementById('admin-logo-preview-img');
  const adminLogoFile = document.getElementById('admin-logo-file');
  const adminColorPrimary = document.getElementById('admin-color-primary');
  const adminColorAccent = document.getElementById('admin-color-accent');
  const adminSupportEmail = document.getElementById('admin-support-email');

  function loadAdminSettings() {
    try {
      const raw = localStorage.getItem(ADMIN_SETTINGS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (adminSettingName && data.platformName) adminSettingName.value = data.platformName;
        if (adminLogoPreviewImg && data.logoUrl) adminLogoPreviewImg.src = data.logoUrl;
        if (adminColorPrimary && data.colorPrimary) adminColorPrimary.value = data.colorPrimary;
        if (adminColorAccent && data.colorAccent) adminColorAccent.value = data.colorAccent;
        if (adminSupportEmail && data.supportEmail) adminSupportEmail.value = data.supportEmail;

        applyAdminSettingsLive(data);
      }
    } catch (e) {
      console.warn('Error cargando ajustes admin:', e);
    }
  }

  function applyAdminSettingsLive(data) {
    if (data.logoUrl) {
      document.querySelectorAll('.admin-brand-logo').forEach(img => { img.src = data.logoUrl; });
    }
    if (data.colorPrimary) {
      document.documentElement.style.setProperty('--brand-indigo', data.colorPrimary);
    }
    if (data.colorAccent) {
      document.documentElement.style.setProperty('--brand-magenta', data.colorAccent);
    }
  }

  if (adminLogoFile && adminLogoPreviewImg) {
    adminLogoFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          adminLogoPreviewImg.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Botón guardar configuración del panel maestro
  const btnSaveAdminSettings = document.querySelector('#view-admin-settings .btn-submit-account');
  if (btnSaveAdminSettings) {
    btnSaveAdminSettings.onclick = null; // Reemplazar alert falso
    btnSaveAdminSettings.addEventListener('click', () => {
      const settings = {
        platformName: adminSettingName ? adminSettingName.value.trim() : 'MAGUM Creator Studio',
        logoUrl: adminLogoPreviewImg ? adminLogoPreviewImg.src : '',
        colorPrimary: adminColorPrimary ? adminColorPrimary.value : '#210087',
        colorAccent: adminColorAccent ? adminColorAccent.value : '#FF00DB',
        supportEmail: adminSupportEmail ? adminSupportEmail.value.trim() : 'soporte@magumcreator.com',
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
      applyAdminSettingsLive(settings);

      const originalHtml = btnSaveAdminSettings.innerHTML;
      btnSaveAdminSettings.innerHTML = '<i class="fa-solid fa-check"></i> <span>¡Configuración Guardada!</span>';
      btnSaveAdminSettings.style.background = '#10b981';
      setTimeout(() => {
        btnSaveAdminSettings.innerHTML = originalHtml;
        btnSaveAdminSettings.style.background = '';
      }, 2200);
    });
  }

  // 12. LOGOUT LIMPIO
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
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Carga inicial
  loadAdminSettings();
  render();

});
