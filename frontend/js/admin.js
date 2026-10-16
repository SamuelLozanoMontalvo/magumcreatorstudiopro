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
    window.location.replace('index.html');
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
      if (targetId === 'view-admin-crm') {
        renderBillingTable();
        syncBillingFromBackend();
      }
      if (targetId === 'view-admin-settings') renderAdminUsersTable();
    });
  });

  // 4. BASE DE DATOS LOCAL DE CUENTAS (SEEDS INICIALES CON HASH)
  // 4. BASE DE DATOS LOCAL DE CUENTAS
  const DEFAULT_SEED_HASH = '7f1e679a93074ceaa611ff6e4b85da812dc56ba0236a28ee96f7c7586526ebcf';
  const DEMO_ACCOUNT_IDS = ['SL7K92X', 'LR4M21B', 'CM8N45T', 'VG3P78F', 'MC8K29L', 'CA9P12K'];
  const DEFAULT_ACCOUNTS = [];

  function getAccounts() {
    const data = localStorage.getItem('magum_accounts');
    if (!data) {
      return [];
    }
    try {
      let accounts = JSON.parse(data);
      let updated = false;

      // Depurar cualquier cuenta demo o de prueba previa
      const filtered = accounts.filter(acc => {
        if (!acc) return false;
        if (DEMO_ACCOUNT_IDS.includes(acc.id)) return false;
        if (['cliente@automotor.com', 'contacto@bellalunaspa.co', 'admin@dentalgroup.com', 'valeria@fitclubpro.co'].includes(acc.email)) return false;
        if (['AutoMotor Cartagena', 'Spa Bella Luna', 'Dental Group Cartagena', 'Fitness Club Pro'].includes(acc.business)) return false;
        return true;
      });

      if (filtered.length !== accounts.length) {
        accounts = filtered;
        updated = true;
      }

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
      return [];
    }
  }

  function saveAccounts(accounts) {
    localStorage.setItem('magum_accounts', JSON.stringify(accounts));
  }

  async function syncAccountsFromBackend() {
    try {
      if (!window.MagumApi) return;
      const localAccounts = getAccounts();
      const res = await window.MagumApi.getAccounts();
      if (res && res.success && Array.isArray(res.data)) {
        let backendAccounts = res.data;
        const backendEmails = new Set(backendAccounts.map(a => (a.email || '').toLowerCase().trim()));
        const backendIds = new Set(backendAccounts.map(a => String(a.id)));

        saveAccounts(backendAccounts);
        render();
      }
    } catch (e) {
      console.warn('Sync accounts from backend warning:', e.message);
    }
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
          window.location.href = 'dashboard.html';
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
          if (window.MagumApi) {
            window.MagumApi.toggleAccountStatus(accId).catch(e => console.warn('Toggle status backend warning:', e.message));
          }
        }
      });
    });

    document.querySelectorAll('.btn-delete-acc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const accId = btn.getAttribute('data-id');
        const accounts = getAccounts();
        const acc = accounts.find(a => a.id === accId);
        if (acc) {
          const ok = await MagumAlert.confirm(
            '¿Eliminar cuenta permanentemente?',
            `¿Estás seguro de eliminar la cuenta de "${acc.business}" (ID: ${acc.id})? Esta acción eliminará permanentemente los datos y accesos del cliente.`,
            'Sí, eliminar cuenta'
          );
          if (ok) {
            saveAccounts(accounts.filter(a => a.id !== accId));
            render();
            if (window.MagumApi) {
              window.MagumApi.deleteAccount(accId).catch(e => console.warn('Delete account backend warning:', e.message));
            }
            MagumAlert.success('Cuenta Eliminada', `La cuenta de "${acc.business}" fue eliminada.`);
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
        MagumAlert.error('Campos Obligatorios', 'Por favor completa todos los campos requeridos para dar de alta la cuenta.');
        return;
      }

      const accounts = getAccounts();

      // Validar si el correo ya existe para permitir asignarle múltiples empresas
      const existingWithEmail = accounts.filter(a => a.email.toLowerCase() === email);
      if (existingWithEmail.length > 0) {
        // Comprobar si ya existe con exactamente el mismo nombre de empresa
        if (existingWithEmail.some(a => a.business.toLowerCase() === business.toLowerCase())) {
          MagumAlert.error('Empresa Duplicada', `Ya existe una cuenta para "${business}" con el correo "${email}".`);
          return;
        }

        const companiesList = existingWithEmail.map(a => `"${a.business}"`).join(', ');
        const ok = await MagumAlert.confirm(
          'Correo ya Registrado',
          `El correo "${email}" ya tiene acceso a: ${companiesList}.\n\n¿Te gustaría asignarle también esta nueva cuenta ("${business}") a "${email}"?`,
          'Sí, asignarle esta cuenta'
        );
        if (!ok) return;
      }

      const newId = generate7CharId();
      const passwordHash = await sha256(password);

      const newAccount = {
        id: newId,
        firstName,
        lastName,
        business,
        email,
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

      // Sincronizar con backend PostgreSQL en Railway
      try {
        if (window.MagumApi) {
          const apiRes = await window.MagumApi.createAccount({
            firstName,
            lastName,
            business,
            email,
            password,
            modules: { social: socialCheck, web: webCheck, crm: true }
          });
          if (apiRes && apiRes.data && apiRes.data.id) {
            newId = apiRes.data.id;
            newAccount.id = newId;
          }
        }
      } catch (syncErr) {
        console.warn('Sync backend error:', syncErr.message || syncErr);
      }

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

      // Notificación estética de alta fidelidad (SweetAlert2 personalizada)
      MagumAlert.accountCreated({
        id: newId,
        business,
        firstName,
        lastName,
        email
      });
    });
  }

  // ==========================================================================
  // 10. CRM DE FACTURACIÓN (SUPER ADMIN)
  // ==========================================================================

  const DEFAULT_BILLING = [];

  function getBilling() {
    const data = localStorage.getItem('magum_billing');
    if (!data) {
      return [];
    }
    try {
      let items = JSON.parse(data);
      // Depurar cualquier registro de facturación demo previo
      const filtered = items.filter(b => {
        if (!b) return false;
        if (['AutoMotor Cartagena', 'Spa Bella Luna', 'Dental Group Cartagena', 'Fitness Club Pro'].includes(b.business)) return false;
        if (b.id && (b.id.startsWith('B-101') || b.id === 'B-101')) return false;
        return true;
      });
      if (filtered.length !== items.length) {
        items = filtered;
        saveBilling(items);
      }
      return items;
    } catch {
      return [];
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

  async function syncBillingFromBackend() {
    try {
      if (!window.MagumApi) return;
      const localBilling = getBilling();
      const res = await window.MagumApi.getBilling();
      if (res && res.success && Array.isArray(res.data)) {
        let backendBilling = res.data;
        const backendIds = new Set(backendBilling.map(b => String(b.id)));
        const backendClientNames = new Set(backendBilling.map(b => (b.clientName || '').toLowerCase().trim()));

        const unsynced = localBilling.filter(b => {
          if (!b || !b.clientName) return false;
          if (backendIds.has(String(b.id))) return false;
          if (backendClientNames.has(b.clientName.toLowerCase().trim())) return false;
          return true;
        });

        for (const item of unsynced) {
          try {
            const createRes = await window.MagumApi.createBilling({
              accountId: item.accountId || null,
              clientName: item.clientName,
              business: item.business,
              plan: item.plan || 'monthly',
              amount: item.amount || 150000,
              startDate: item.startDate || new Date().toISOString().split('T')[0],
              modules: item.modules || 'CRM',
              notes: item.notes || '',
              paymentStatus: item.paymentStatus || 'paid'
            });
            if (createRes && createRes.data) {
              backendBilling.unshift(createRes.data);
            }
          } catch (err) {
            console.warn('Auto-sync unsynced billing error:', err);
          }
        }

        if (backendBilling.length > 0) {
          saveBilling(backendBilling);
        }
        renderBillingTable();
      }
    } catch (e) {
      console.warn('Sync billing warning:', e.message);
    }
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
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const items = getBilling();
        const item = items.find(i => i.id === id);
        if (item) {
          const ok = await MagumAlert.confirm(
            '¿Eliminar registro de facturación?',
            `¿Deseas eliminar permanentemente el registro de "${item.business}"?`,
            'Sí, eliminar'
          );
          if (ok) {
            saveBilling(items.filter(i => i.id !== id));
            renderBillingTable();
            if (window.MagumApi) {
              window.MagumApi.deleteBilling(id).catch(e => console.warn('Delete billing backend warning:', e.message));
            }
            MagumAlert.success('Registro Eliminado', `El cobro de "${item.business}" fue retirado.`);
          }
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
    formBilling.addEventListener('submit', async (e) => {
      e.preventDefault();
      const clientName = document.getElementById('billing-client-name').value.trim();
      const business = document.getElementById('billing-business').value.trim();
      const plan = document.getElementById('billing-plan-type').value;
      const amount = parseFloat(document.getElementById('billing-amount').value) || 0;
      const startDate = document.getElementById('billing-start-date').value || new Date().toISOString().split('T')[0];
      const modules = document.getElementById('billing-modules').value.trim();
      const notes = document.getElementById('billing-notes').value.trim();

      if (!clientName || !business || !plan) {
        MagumAlert.error('Campos Incompletos', 'Completa los campos obligatorios: nombre, negocio y plan.');
        return;
      }

      let newBillingId = 'B' + generate7CharId();

      // Guardar en backend PostgreSQL de Railway
      if (window.MagumApi) {
        try {
          const apiRes = await window.MagumApi.createBilling({
            clientName,
            business,
            plan,
            amount,
            startDate,
            modules,
            notes
          });
          if (apiRes && apiRes.data && apiRes.data.id) {
            newBillingId = apiRes.data.id;
          }
        } catch (apiErr) {
          console.warn('Backend billing creation warning:', apiErr.message);
        }
      }

      const items = getBilling();
      items.unshift({
        id: newBillingId,
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
      MagumAlert.success('Registro Guardado', `Facturación registrada exitosamente para "${business}".`);
    });
  }

  // ==========================================================================
  // 11. AJUSTES DEL ADMIN (PERSISTENCIA REAL - RESUELVE BUG #11)
  // ==========================================================================

  const ADMIN_SETTINGS_KEY = 'magum_admin_settings';
  const adminSettingName = document.getElementById('admin-setting-name');
  const adminLogoPreviewImg = document.getElementById('admin-logo-preview-img');
  const adminLogoFile = document.getElementById('admin-logo-file');
  const adminFaviconPreviewImg = document.getElementById('admin-favicon-preview-img');
  const adminFaviconFile = document.getElementById('admin-favicon-file');
  const adminColorPrimary = document.getElementById('admin-color-primary');
  const adminColorAccent = document.getElementById('admin-color-accent');
  const adminSupportEmail = document.getElementById('admin-support-email');

  async function loadAdminSettings() {
    try {
      const raw = localStorage.getItem(ADMIN_SETTINGS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        applySettingsToFormAndLive(data);
      }
      if (window.MagumApi) {
        const res = await window.MagumApi.request('/settings/platform_branding').catch(() => null);
        if (res && res.success && res.data) {
          applySettingsToFormAndLive(res.data);
          localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(res.data));
        }
      }
    } catch (e) {
      console.warn('Error cargando ajustes admin:', e);
    }
  }

  function applySettingsToFormAndLive(data) {
    if (adminSettingName && data.platformName) adminSettingName.value = data.platformName;
    if (adminLogoPreviewImg && data.logoUrl) adminLogoPreviewImg.src = data.logoUrl;
    if (adminFaviconPreviewImg && data.faviconUrl) adminFaviconPreviewImg.src = data.faviconUrl;
    if (adminColorPrimary && data.colorPrimary) adminColorPrimary.value = data.colorPrimary;
    if (adminColorAccent && data.colorAccent) adminColorAccent.value = data.colorAccent;
    if (adminSupportEmail && data.supportEmail) adminSupportEmail.value = data.supportEmail;

    applyAdminSettingsLive(data);
  }

  function applyAdminSettingsLive(data) {
    if (data.logoUrl) {
      document.querySelectorAll('.admin-brand-logo').forEach(img => { img.src = data.logoUrl; });
    }
    if (data.faviconUrl) {
      let link = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        document.head.appendChild(link);
      }
      link.href = data.faviconUrl;
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

  if (adminFaviconFile && adminFaviconPreviewImg) {
    adminFaviconFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          adminFaviconPreviewImg.src = ev.target.result;
          applyAdminSettingsLive({ faviconUrl: ev.target.result });
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Botón guardar configuración del panel maestro
  const btnSaveAdminSettings = document.querySelector('#view-admin-settings .btn-submit-account');
  if (btnSaveAdminSettings) {
    btnSaveAdminSettings.onclick = null; // Reemplazar alert falso
    btnSaveAdminSettings.addEventListener('click', async () => {
      const settings = {
        platformName: adminSettingName ? adminSettingName.value.trim() : 'MAGUM Creator Studio',
        logoUrl: adminLogoPreviewImg ? adminLogoPreviewImg.src : '',
        faviconUrl: adminFaviconPreviewImg ? adminFaviconPreviewImg.src : '',
        colorPrimary: adminColorPrimary ? adminColorPrimary.value : '#210087',
        colorAccent: adminColorAccent ? adminColorAccent.value : '#FF00DB',
        supportEmail: adminSupportEmail ? adminSupportEmail.value.trim() : 'soporte@magumcreator.com',
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
      applyAdminSettingsLive(settings);

      if (window.MagumApi) {
        window.MagumApi.request('/settings/platform_branding', {
          method: 'POST',
          body: JSON.stringify({ value: settings })
        }).catch(e => console.warn('Sync platform branding warning:', e.message));
      }

      const originalHtml = btnSaveAdminSettings.innerHTML;
      btnSaveAdminSettings.innerHTML = '<i class="fa-solid fa-check"></i> <span>¡Configuración Guardada!</span>';
      btnSaveAdminSettings.style.background = '#10b981';
      setTimeout(() => {
        btnSaveAdminSettings.innerHTML = originalHtml;
        btnSaveAdminSettings.style.background = '';
      }, 2200);
    });
  }

  // ==========================================================================
  // 11.5. GESTIÓN DE ADMINISTRADORES DE LA PLATAFORMA (SUPER ADMIN)
  // ==========================================================================

  const ADMIN_USERS_STORAGE_KEY = 'magum_admin_users';

  function getLocalAdminUsers() {
    try {
      const raw = localStorage.getItem(ADMIN_USERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveLocalAdminUsers(admins) {
    try {
      localStorage.setItem(ADMIN_USERS_STORAGE_KEY, JSON.stringify(admins));
    } catch (e) {
      console.warn('Error guardando administradores:', e);
    }
  }

  async function fetchAdminUsers() {
    try {
      const localAdmins = getLocalAdminUsers();
      if (window.MagumApiClient) {
        const client = new MagumApiClient();
        const res = await client.request('/accounts/admins/list');
        if (res && res.success && Array.isArray(res.data)) {
          let backendAdmins = res.data;
          const backendEmails = new Set(backendAdmins.map(a => (a.email || '').toLowerCase().trim()));
          const backendUsernames = new Set(backendAdmins.map(a => (a.username || '').toLowerCase().trim()));

          saveLocalAdminUsers(backendAdmins);
          return backendAdmins;
        }
      }
    } catch (e) {
      console.warn('Backend admins endpoint no disponible, usando fallback local:', e.message);
    }
    return getLocalAdminUsers();
  }

  async function renderAdminUsersTable() {
    const tbody = document.getElementById('admin-users-table-body');
    if (!tbody) return;

    const admins = await fetchAdminUsers();
    tbody.innerHTML = '';

    // 1. Fila de Super Administrador principal (inalterable)
    const superAdminTr = document.createElement('tr');
    superAdminTr.innerHTML = `
      <td>
        <div style="font-weight: 700; color: var(--text-color); display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-crown" style="color: #f59e0b;"></i>
          <span>Super Administrador</span>
        </div>
      </td>
      <td><span style="font-family: monospace; font-weight: 700; color: #FF00DB;">McSAdmin</span></td>
      <td style="color: var(--text-muted);">mcsadmin@magum.com</td>
      <td>
        <span style="background: rgba(255, 0, 219, 0.14); color: #FF00DB; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.78rem;">
          Super Admin
        </span>
      </td>
      <td class="th-actions">
        <span style="color: #64748b; font-size: 0.8rem; font-style: italic;">Principal</span>
      </td>
    `;
    tbody.appendChild(superAdminTr);

    // 2. Administradores adicionales creados por el Super Admin
    admins.forEach(adm => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight: 600; color: var(--text-color);">
            ${escapeHtml(adm.name)}
          </div>
        </td>
        <td><span style="font-family: monospace; font-weight: 600; color: var(--brand-indigo);">${escapeHtml(adm.username)}</span></td>
        <td style="color: var(--text-muted);">${escapeHtml(adm.email)}</td>
        <td>
          <span style="background: rgba(59, 130, 246, 0.14); color: #3b82f6; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.78rem;">
            ${escapeHtml(adm.role || 'Admin')}
          </span>
        </td>
        <td class="th-actions">
          <button class="btn-row-action btn-delete-admin" data-id="${escapeHtml(adm.id)}" data-name="${escapeHtml(adm.name)}" title="Eliminar administrador">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Eventos de revocación de administradores
    tbody.querySelectorAll('.btn-delete-admin').forEach(btn => {
      btn.addEventListener('click', async () => {
        const adminId = btn.getAttribute('data-id');
        const adminName = btn.getAttribute('data-name');

        const ok = await MagumAlert.confirm(
          '¿Eliminar Administrador?',
          `¿Estás seguro de revocar el acceso a "${adminName}"? Ya no podrá ingresar al panel de administración.`,
          'Sí, revocar acceso'
        );

        if (ok) {
          // Intentar borrar en backend
          try {
            if (window.MagumApiClient) {
              const client = new MagumApiClient();
              await client.request(`/accounts/admins/${adminId}`, { method: 'DELETE' });
            }
          } catch (e) {
            console.warn('Advertencia backend al eliminar admin:', e.message);
          }

          const current = getLocalAdminUsers();
          saveLocalAdminUsers(current.filter(a => a.id !== adminId));
          renderAdminUsersTable();
          MagumAlert.success('Acceso Revocado', `El administrador "${adminName}" fue retirado.`);
        }
      });
    });
  }

  // Modal para crear nuevo administrador
  const modalCreateAdmin = document.getElementById('modal-create-admin');
  const btnOpenAdminModal = document.getElementById('btn-open-admin-modal');
  const btnCloseAdminModal = document.getElementById('btn-close-admin-modal');
  const btnCancelAdminModal = document.getElementById('btn-cancel-admin-modal');
  const formCreateAdmin = document.getElementById('form-create-admin');

  function openAdminModal() {
    if (modalCreateAdmin) {
      modalCreateAdmin.style.display = 'flex';
      if (formCreateAdmin) formCreateAdmin.reset();
      const firstInput = document.getElementById('admin-input-name');
      if (firstInput) setTimeout(() => firstInput.focus(), 80);
    }
  }

  function closeAdminModal() {
    if (modalCreateAdmin) modalCreateAdmin.style.display = 'none';
  }

  if (btnOpenAdminModal) btnOpenAdminModal.addEventListener('click', openAdminModal);
  if (btnCloseAdminModal) btnCloseAdminModal.addEventListener('click', closeAdminModal);
  if (btnCancelAdminModal) btnCancelAdminModal.addEventListener('click', closeAdminModal);
  if (modalCreateAdmin) {
    modalCreateAdmin.addEventListener('click', (e) => {
      if (e.target === modalCreateAdmin) closeAdminModal();
    });
  }

  if (formCreateAdmin) {
    formCreateAdmin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('admin-input-name').value.trim();
      const username = document.getElementById('admin-input-username').value.trim().toLowerCase();
      const email = document.getElementById('admin-input-email').value.trim().toLowerCase();
      const password = document.getElementById('admin-input-password').value;

      if (!name || !username || !email || !password) {
        MagumAlert.error('Campos Incompletos', 'Por favor llena todos los campos del nuevo administrador.');
        return;
      }

      if (username === 'mcsadmin' || username === 'admin' || email === 'mcsadmin@magum.com') {
        MagumAlert.error('Usuario Reservado', 'Ese nombre de usuario o correo pertenece al Super Administrador.');
        return;
      }

      const existingAdmins = getLocalAdminUsers();
      if (existingAdmins.some(a => a.username.toLowerCase() === username || a.email.toLowerCase() === email)) {
        MagumAlert.error('Administrador Duplicado', `Ya existe un administrador registrado con el usuario "${username}" o correo "${email}".`);
        return;
      }

      const newAdminId = 'ADM-' + generate7CharId();
      const newAdmin = {
        id: newAdminId,
        name,
        username,
        email,
        role: 'admin',
        createdAt: new Date().toISOString()
      };

      // Registrar en backend PostgreSQL
      try {
        if (window.MagumApiClient) {
          const client = new MagumApiClient();
          await client.request('/accounts/admins', {
            method: 'POST',
            body: JSON.stringify({
              name,
              username,
              email,
              password,
              role: 'admin'
            })
          });
        }
      } catch (e) {
        console.warn('Aviso backend admin:', e.message);
      }

      existingAdmins.unshift(newAdmin);
      saveLocalAdminUsers(existingAdmins);

      closeAdminModal();
      renderAdminUsersTable();

      MagumAlert.success(
        '¡Administrador Creado!',
        `El usuario "${username}" ha sido habilitado con privilegios de administración.`
      );
    });
  }

  // 12. LOGOUT LIMPIO
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('magum_session');
      window.location.href = 'index.html';
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
  renderAdminUsersTable();
  syncAccountsFromBackend();
  syncBillingFromBackend();

});
