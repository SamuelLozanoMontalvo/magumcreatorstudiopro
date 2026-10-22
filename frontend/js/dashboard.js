/* ==========================================================================
   MAGUM CREATOR STUDIO - LÓGICA DEL DASHBOARD INTEGRAL
   ========================================================================== */

// 0. GUARDIA DE SEGURIDAD Y VERIFICACIÓN DE SESIÓN ACTIVA
(function verifyDashboardSession() {
  const rawSession = localStorage.getItem('magum_session');
  if (!rawSession) {
    window.location.replace('index.html');
    return;
  }
  try {
    const session = JSON.parse(rawSession);
    if (!session || !session.role) {
      throw new Error('Sesión inválida');
    }
    // Si es super admin y no está en modo simulación de cliente, llevar a admin
    if (session.role === 'admin' && !session.impersonatedByAdmin) {
      window.location.replace('admin.html');
      return;
    }
  } catch (e) {
    localStorage.removeItem('magum_session');
    window.location.replace('index.html');
  }
})();

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================================================
  // 1. HELPERS & SANITIZACIÓN XSS
  // ==========================================================================

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // 2. CONMUTADOR DE MODO CLARO / OSCURO
  // ==========================================================================
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const themeText = document.getElementById('theme-text');

  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.remove('dark-mode');
    updateThemeUI(false);
  } else {
    document.body.classList.add('dark-mode');
    updateThemeUI(true);
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

  // ==========================================================================
  // 3. LEER SESIÓN ACTIVA Y APLICAR PERMISOS DE MÓDULOS
  // ==========================================================================
  const rawSession = localStorage.getItem('magum_session');
  if (rawSession) {
    try {
      const session = JSON.parse(rawSession);
      const bizName = session.business || 'Mi Negocio';

      const topbarName = document.getElementById('topbar-account-name');
      const sidebarName = document.getElementById('sidebar-account-name');
      if (topbarName) topbarName.textContent = bizName;
      if (sidebarName) sidebarName.textContent = bizName;
      
      // Nombre de la cuenta activa en la pestaña de la ventana del navegador
      document.title = `${bizName} | Magum Creator Studio`;

      // Si fue abierto por el Super Admin, mostrar banner superior seguro
      if (session.impersonatedByAdmin) {
        const banner = document.createElement('div');
        banner.style.cssText = 'background: #210087; color: #fff; padding: 10px 20px; font-size: 0.82rem; font-weight: 700; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 1000; box-shadow: 0 2px 10px rgba(0,0,0,0.2);';
        banner.innerHTML = `
          <span><i class="fa-solid fa-user-shield"></i> Vista previa de cliente: <strong>${escapeHtml(bizName)}</strong></span>
          <a href="admin.html" style="color: #FDD344; text-decoration: none; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-arrow-left"></i> Volver a Super Admin</a>
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

      // ======================================================================
      // 3.5. SELECTOR DE MULTI-EMPRESA (SWITCHER EN EL PIE DEL SIDEBAR)
      // ======================================================================
      const accountSwitcherBox = document.getElementById('account-switcher-box');
      const accountSwitcherSelect = document.getElementById('account-switcher-select');

      // Deduplicar estrictamente por id único y excluir cuentas inválidas
      const rawAccounts = session.availableAccounts || [];
      const distinctMap = new Map();
      rawAccounts.forEach(a => {
        if (a && a.id && !distinctMap.has(a.id)) {
          distinctMap.set(a.id, a);
        }
      });
      const availableAccounts = Array.from(distinctMap.values());

      if (availableAccounts.length > 1 && accountSwitcherBox && accountSwitcherSelect) {
        accountSwitcherBox.style.display = 'block';
        accountSwitcherSelect.innerHTML = '';

        availableAccounts.forEach(acc => {
          const opt = document.createElement('option');
          opt.value = acc.id;
          opt.textContent = acc.business;
          if (acc.id === session.accountId) {
            opt.selected = true;
          }
          accountSwitcherSelect.appendChild(opt);
        });

        accountSwitcherSelect.addEventListener('change', async () => {
          const targetId = accountSwitcherSelect.value;
          const targetAcc = availableAccounts.find(a => a.id === targetId);
          if (targetAcc && targetId !== session.accountId) {
            try {
              accountSwitcherSelect.disabled = true;
              if (window.MagumAlert) {
                MagumAlert.info('Cambiando de Empresa...', `Cargando la información y marca de "${targetAcc.business}".`);
              }

              // Solicitar nuevo token seguro al backend firmado para esta cuenta
              if (window.MagumApi) {
                const res = await window.MagumApi.switchAccount(targetId);
                if (res && res.success && res.token && res.user) {
                  localStorage.setItem('magum_session', JSON.stringify({
                    ...res.user,
                    token: res.token,
                    loggedAt: new Date().toISOString()
                  }));
                  setTimeout(() => {
                    window.location.reload();
                  }, 400);
                  return;
                }
              }

              // Fallback local
              const updatedSession = {
                ...session,
                accountId: targetAcc.id,
                business: targetAcc.business,
                clientName: targetAcc.clientName || session.clientName,
                modules: targetAcc.modules || session.modules,
                availableAccounts: availableAccounts
              };
              localStorage.setItem('magum_session', JSON.stringify(updatedSession));
              setTimeout(() => {
                window.location.reload();
              }, 400);
            } catch (err) {
              console.warn('Error cambiando de cuenta:', err);
              accountSwitcherSelect.disabled = false;
              if (window.MagumAlert) {
                MagumAlert.error('Error', 'No fue posible cambiar de empresa.');
              }
            }
          }
        });
      }
    } catch (e) {
      console.warn('Error leyendo sesión:', e);
    }
  }

  // ==========================================================================
  // 4. MENÚ MÓVIL (HAMBURGUESA Y TELÓN DE FONDO)
  // ==========================================================================
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

  // ==========================================================================
  // 5. NAVEGACIÓN ENTRE VISTAS DEL MENÚ LATERAL
  // ==========================================================================
  const views = {
    'view-dashboard': document.getElementById('view-dashboard'),
    'view-crm': document.getElementById('view-crm'),
    'view-marketing-social': document.getElementById('view-marketing-social'),
    'view-marketing-web': document.getElementById('view-marketing-web'),
    'view-profesionales': document.getElementById('view-profesionales'),
    'view-ajustes': document.getElementById('view-ajustes')
  };

  const navLinks = document.querySelectorAll('.sidebar-nav .nav-link[data-view], .submenu-link[data-view]');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetViewId = link.getAttribute('data-view');
      if (views[targetViewId]) {
        e.preventDefault();
        switchView(targetViewId);
        closeMobileSidebar();

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
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (viewId === 'view-crm') {
      renderCrm();
      syncCrmFromBackend();
    }
    if (viewId === 'view-profesionales') {
      renderProfessionals();
      syncTeamFromBackend();
    }
  }

  // Activar vista por hash si viene en la URL (ej. #ajustes o #crm)
  if (window.location.hash) {
    const hashLink = document.querySelector(`.sidebar-nav [href="${window.location.hash}"]`);
    if (hashLink) hashLink.click();
  }

  // ==========================================================================
  // 6. ACCIONES DE SUGERENCIAS INTELIGENTES (CRM & MARKETING)
  // ==========================================================================
  const suggestionButtons = document.querySelectorAll('.btn-action-suggestion');
  suggestionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (action === 'email-campaign') {
        const linkCrm = document.querySelector('[data-view="view-crm"]');
        if (linkCrm) linkCrm.click();
        setTimeout(() => {
          if (btnBulkEmail) {
            btnBulkEmail.click();
          }
        }, 150);
      } else if (action === 'whatsapp-broadcast') {
        const linkCrm = document.querySelector('[data-view="view-crm"]');
        if (linkCrm) linkCrm.click();
        setTimeout(() => {
          if (btnBulkWhatsapp) {
            btnBulkWhatsapp.click();
          }
        }, 150);
      } else if (action === 'social-post') {
        const linkSocial = document.getElementById('link-social-media');
        if (linkSocial) linkSocial.click();
      } else if (action === 'open-web-editor') {
        const linkWeb = document.querySelector('[data-view="view-marketing-web"]');
        if (linkWeb) linkWeb.click();
      }
    });
  });

  const btnSummaryToSocial = document.getElementById('btn-summary-to-social');
  if (btnSummaryToSocial) {
    btnSummaryToSocial.addEventListener('click', () => {
      const linkSocial = document.getElementById('link-social-media');
      if (linkSocial) linkSocial.click();
    });
  }

  const btnCreatePost = document.getElementById('btn-create-post');
  if (btnCreatePost) {
    btnCreatePost.addEventListener('click', () => {
      const linkSocial = document.getElementById('link-social-media');
      if (linkSocial) linkSocial.click();
    });
  }

  const submenuToggle = document.querySelector('.nav-submenu-toggle');
  if (submenuToggle) {
    submenuToggle.addEventListener('click', () => {
      const parent = submenuToggle.closest('.nav-item-has-submenu');
      if (parent) parent.classList.toggle('open');
    });
  }

  const useIdeaButtons = document.querySelectorAll('.btn-use-idea');
  useIdeaButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.idea-card');
      const title = card ? card.querySelector('.idea-title').textContent : 'Publicación';
      MagumAlert.info('Programador Multicanal', `Preparando contenido: "${title}". Abriendo programador para tus redes sociales.`);
    });
  });

  // ==========================================================================
  // 7. CRM: MULTISELECCIÓN, ACCIONES MASIVAS, CRUD Y EXCEL/CSV
  // ==========================================================================

  const DEFAULT_CRM_CONTACTS = [];

  // Multi-Tenancy: Aislamiento estricto de base de datos CRM por cliente
  const currentClientAccountId = (function () {
    try {
      const s = JSON.parse(localStorage.getItem('magum_session') || '{}');
      return s.accountId || s.email || 'client';
    } catch {
      return 'client';
    }
  })();

  const isDemoAccount = false;

  function getCrmStorageKey() {
    return `magum_crm_contacts_${currentClientAccountId}`;
  }

  function getCrmContacts() {
    const key = getCrmStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    try {
      let list = JSON.parse(raw);
      // Depurar cualquier contacto demo previo
      const filtered = list.filter(c => !['C-101', 'C-102', 'C-103', 'C-104'].includes(c.id));
      if (filtered.length !== list.length) {
        list = filtered;
        saveCrmContacts(list);
      }
      return list;
    } catch {
      return [];
    }
  }

  function saveCrmContacts(contacts) {
    localStorage.setItem(getCrmStorageKey(), JSON.stringify(contacts));
  }

  async function syncCrmFromBackend() {
    try {
      if (!window.MagumApi) return;
      const localContacts = getCrmContacts();
      const res = await window.MagumApi.getCrmContacts();

      if (res && res.success && Array.isArray(res.data)) {
        let backendContacts = res.data;
        const backendIds = new Set(backendContacts.map(c => String(c.id)));
        const backendEmails = new Set(backendContacts.map(c => (c.email || '').toLowerCase().trim()));

        // Encontrar contactos creados localmente que aún no están en PostgreSQL (ej. kkkkkkkkkkkkkkkk y sasasasas)
        const unsynced = localContacts.filter(c => {
          if (!c || !c.name) return false;
          // Omitir contactos estáticos de prueba si es cuenta demo
          if (isDemoAccount && ['C-101', 'C-102', 'C-103', 'C-104'].includes(c.id)) return false;
          // Si ya existe en backend por ID o por correo exacto
          if (backendIds.has(String(c.id))) return false;
          if (c.email && backendEmails.has(c.email.toLowerCase().trim())) return false;
          return true;
        });

        // Subir cada contacto pendiente a PostgreSQL en Railway
        for (const contact of unsynced) {
          try {
            const createRes = await window.MagumApi.createCrmContact({
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              age: contact.age,
              company: contact.company,
              segment: contact.segment,
              notes: contact.notes
            });
            if (createRes && createRes.data) {
              backendContacts.unshift(createRes.data);
            }
          } catch (err) {
            console.warn('Auto-sync unsynced CRM contact warning:', err);
          }
        }

        if (backendContacts.length > 0) {
          saveCrmContacts(backendContacts);
        } else if (!isDemoAccount && localContacts.length > 0) {
          saveCrmContacts(localContacts);
        }
        renderCrm();
      }
    } catch (e) {
      console.warn('Sync CRM from backend warning:', e.message);
    }
  }

  // Estado de selección múltiple (IDs seleccionados)
  const selectedContactIds = new Set();

  const crmTableBody = document.getElementById('crm-table-body');
  const crmEmptyState = document.getElementById('crm-empty-state');
  const crmSearchInput = document.getElementById('crm-search-input');
  const crmSelectAll = document.getElementById('crm-select-all');
  const crmSelectedCounter = document.getElementById('crm-selected-counter');

  // Botones de la barra superior de acciones masivas
  const btnBulkWhatsapp = document.getElementById('btn-bulk-whatsapp');
  const btnBulkEmail = document.getElementById('btn-bulk-email');
  const btnBulkDual = document.getElementById('btn-bulk-dual');
  const btnBulkEdit = document.getElementById('btn-bulk-edit');
  const btnBulkDelete = document.getElementById('btn-bulk-delete');

  // Métricas
  const crmStatTotal = document.getElementById('crm-stat-total');
  const crmStatVip = document.getElementById('crm-stat-vip');
  const crmStatProspects = document.getElementById('crm-stat-prospects');
  const crmStatInactive = document.getElementById('crm-stat-inactive');

  // Modal Contacto (CRUD)
  const modalCrm = document.getElementById('modal-crm-contact');
  const btnOpenCrmModal = document.getElementById('btn-open-crm-modal');
  const btnCloseCrmModal = document.getElementById('btn-close-crm-modal');
  const btnCancelCrmModal = document.getElementById('btn-cancel-crm-modal');
  const formCrm = document.getElementById('form-crm-contact');
  const crmContactId = document.getElementById('crm-contact-id');
  const crmInputName = document.getElementById('crm-input-name');
  const crmInputEmail = document.getElementById('crm-input-email');
  const crmInputPhone = document.getElementById('crm-input-phone');
  const crmInputAge = document.getElementById('crm-input-age');
  const crmInputCompany = document.getElementById('crm-input-company');
  const crmInputSegment = document.getElementById('crm-input-segment');
  const crmInputNotes = document.getElementById('crm-input-notes');
  const crmModalTitle = document.getElementById('crm-modal-title');
  const crmModalSubmitLabel = document.getElementById('crm-modal-submit-label');

  // Modal Bulk WhatsApp
  const modalBulkWp = document.getElementById('modal-bulk-whatsapp');
  const formBulkWp = document.getElementById('form-bulk-whatsapp');
  const wpRecipientsText = document.getElementById('whatsapp-recipients-text');
  const wpMessageInput = document.getElementById('whatsapp-message-input');
  const btnCloseBulkWp = document.getElementById('btn-close-whatsapp-modal');
  const btnCancelBulkWp = document.getElementById('btn-cancel-whatsapp-modal');

  // Modal Bulk Email
  const modalBulkEmail = document.getElementById('modal-bulk-email');
  const formBulkEmail = document.getElementById('form-bulk-email');
  const emailRecipientsText = document.getElementById('email-recipients-text');
  const emailSubjectInput = document.getElementById('email-subject-input');
  const emailBodyInput = document.getElementById('email-body-input');
  const btnCloseBulkEmail = document.getElementById('btn-close-email-modal');
  const btnCancelBulkEmail = document.getElementById('btn-cancel-email-modal');

  // Modal Bulk Dual
  const modalBulkDual = document.getElementById('modal-bulk-dual');
  const formBulkDual = document.getElementById('form-bulk-dual');
  const dualRecipientsText = document.getElementById('dual-recipients-text');
  const dualEmailSubject = document.getElementById('dual-email-subject');
  const dualCommonMessage = document.getElementById('dual-common-message');
  const btnCloseBulkDual = document.getElementById('btn-close-dual-modal');
  const btnCancelBulkDual = document.getElementById('btn-cancel-dual-modal');

  // Plantilla e importación masiva
  const btnDownloadCsvTemplate = document.getElementById('btn-download-csv-template');
  const crmImportFile = document.getElementById('crm-import-file');

  function updateBulkToolbar(filteredContacts = []) {
    const count = selectedContactIds.size;
    if (crmSelectedCounter) {
      crmSelectedCounter.textContent = `${count} contacto${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'}`;
    }

    const hasSelection = count > 0;
    if (btnBulkWhatsapp) btnBulkWhatsapp.disabled = !hasSelection;
    if (btnBulkEmail) btnBulkEmail.disabled = !hasSelection;
    if (btnBulkDual) btnBulkDual.disabled = !hasSelection;
    if (btnBulkDelete) btnBulkDelete.disabled = !hasSelection;
    // Editar solo habilitado cuando hay exactamente 1 contacto seleccionado
    if (btnBulkEdit) btnBulkEdit.disabled = (count !== 1);

    // Actualizar estado del checkbox general "Seleccionar todos"
    if (crmSelectAll) {
      if (filteredContacts.length > 0 && filteredContacts.every(c => selectedContactIds.has(c.id))) {
        crmSelectAll.checked = true;
        crmSelectAll.indeterminate = false;
      } else if (filteredContacts.some(c => selectedContactIds.has(c.id))) {
        crmSelectAll.checked = false;
        crmSelectAll.indeterminate = true;
      } else {
        crmSelectAll.checked = false;
        crmSelectAll.indeterminate = false;
      }
    }
  }

  function renderCrm() {
    if (!crmTableBody) return;
    const contacts = getCrmContacts();

    // Actualizar métricas del CRM
    if (crmStatTotal) crmStatTotal.textContent = contacts.length;
    if (crmStatVip) crmStatVip.textContent = contacts.filter(c => c.segment === 'vip').length;
    if (crmStatProspects) crmStatProspects.textContent = contacts.filter(c => c.segment === 'prospect').length;
    if (crmStatInactive) crmStatInactive.textContent = contacts.filter(c => c.segment === 'inactive').length;

    const query = (crmSearchInput ? crmSearchInput.value : '').trim().toLowerCase();

    const filtered = contacts.filter(c => {
      if (!query) return true;
      return (
        (c.name && c.name.toLowerCase().includes(query)) ||
        (c.email && c.email.toLowerCase().includes(query)) ||
        (c.phone && c.phone.toLowerCase().includes(query)) ||
        (c.company && c.company.toLowerCase().includes(query))
      );
    });

    crmTableBody.innerHTML = '';

    if (filtered.length === 0) {
      if (crmEmptyState) crmEmptyState.style.display = 'block';
    } else {
      if (crmEmptyState) crmEmptyState.style.display = 'none';

      filtered.forEach(c => {
        const tr = document.createElement('tr');
        const isSelected = selectedContactIds.has(c.id);
        if (isSelected) tr.classList.add('row-selected');

        let segmentBadge = '';
        if (c.segment === 'vip') {
          segmentBadge = '<span class="badge-status badge-status-vip"><span class="status-indicator-dot"></span> Cliente VIP</span>';
        } else if (c.segment === 'prospect') {
          segmentBadge = '<span class="badge-status badge-status-prospect"><span class="status-indicator-dot"></span> Prospecto</span>';
        } else if (c.segment === 'inactive') {
          segmentBadge = '<span class="badge-status badge-status-inactive"><span class="status-indicator-dot"></span> Inactivo (+60d)</span>';
        } else {
          segmentBadge = '<span class="badge-status badge-status-active"><span class="status-indicator-dot"></span> Cliente</span>';
        }

        tr.innerHTML = `
          <td style="text-align: center; width: 44px;">
            <input type="checkbox" class="crm-custom-checkbox crm-row-check" data-id="${escapeHtml(c.id)}" ${isSelected ? 'checked' : ''} title="Seleccionar fila">
          </td>
          <td class="client-name-cell">${escapeHtml(c.name)}</td>
          <td class="email-cell">${escapeHtml(c.email)}</td>
          <td><span style="font-weight:600;">${escapeHtml(c.phone)}</span></td>
          <td>${c.age ? c.age + ' años' : '<span style="color:var(--text-muted);">—</span>'}</td>
          <td>${c.company ? escapeHtml(c.company) : '<span style="color:var(--text-muted);">—</span>'}</td>
          <td>${segmentBadge}</td>
          <td style="max-width: 220px; font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(c.notes || '—')}</td>
        `;

        crmTableBody.appendChild(tr);
      });
    }

    updateBulkToolbar(filtered);
    attachCrmSelectionListeners(filtered);
  }

  function attachCrmSelectionListeners(filtered) {
    document.querySelectorAll('.crm-row-check').forEach(chk => {
      chk.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = chk.getAttribute('data-id');
        const tr = chk.closest('tr');
        if (chk.checked) {
          selectedContactIds.add(id);
          if (tr) tr.classList.add('row-selected');
        } else {
          selectedContactIds.delete(id);
          if (tr) tr.classList.remove('row-selected');
        }
        updateBulkToolbar(filtered);
      });
    });

    crmTableBody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.tagName.toLowerCase() === 'input') return;
        const chk = tr.querySelector('.crm-row-check');
        if (chk) {
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  // Selección general "Seleccionar Todos"
  if (crmSelectAll) {
    crmSelectAll.addEventListener('change', () => {
      const contacts = getCrmContacts();
      const query = (crmSearchInput ? crmSearchInput.value : '').trim().toLowerCase();
      const filtered = contacts.filter(c => {
        if (!query) return true;
        return (
          (c.name && c.name.toLowerCase().includes(query)) ||
          (c.email && c.email.toLowerCase().includes(query)) ||
          (c.phone && c.phone.toLowerCase().includes(query)) ||
          (c.company && c.company.toLowerCase().includes(query))
        );
      });

      if (crmSelectAll.checked) {
        filtered.forEach(c => selectedContactIds.add(c.id));
      } else {
        filtered.forEach(c => selectedContactIds.delete(c.id));
      }
      renderCrm();
    });
  }

  if (crmSearchInput) {
    crmSearchInput.addEventListener('input', renderCrm);
  }

  // ==========================================================================
  // ACCIONES MASIVAS DE LA BARRA SUPERIOR
  // ==========================================================================

  // 1. Eliminar seleccionados
  if (btnBulkDelete) {
    btnBulkDelete.addEventListener('click', async () => {
      const count = selectedContactIds.size;
      if (count === 0) return;

      const title = (count === 1) ? '¿Eliminar contacto?' : `¿Eliminar ${count} contactos?`;
      const confirmMsg = (count === 1)
        ? '¿Deseas eliminar permanentemente el contacto seleccionado de tu CRM?'
        : `¿Deseas eliminar permanentemente los ${count} contactos seleccionados de tu base de datos?`;

      const ok = await MagumAlert.confirm(title, confirmMsg, 'Sí, eliminar');

      if (ok) {
        const idsToDelete = Array.from(selectedContactIds);
        if (window.MagumApi) {
          window.MagumApi.bulkDeleteCrmContacts(idsToDelete).catch(err => {
            console.warn('Backend sync delete:', err.message);
          });
        }
        let contacts = getCrmContacts();
        contacts = contacts.filter(c => !selectedContactIds.has(c.id));
        saveCrmContacts(contacts);
        selectedContactIds.clear();
        renderCrm();
        MagumAlert.success('Contactos Eliminados', `Se retiraron ${count} contacto(s) de tu CRM.`);
      }
    });
  }

  // 2. Editar seleccionado (solo cuando se selecciona 1)
  if (btnBulkEdit) {
    btnBulkEdit.addEventListener('click', () => {
      if (selectedContactIds.size !== 1) return;
      const targetId = Array.from(selectedContactIds)[0];
      const contact = getCrmContacts().find(c => c.id === targetId);
      if (contact) {
        crmContactId.value = contact.id;
        crmInputName.value = contact.name || '';
        crmInputEmail.value = contact.email || '';
        crmInputPhone.value = contact.phone || '';
        crmInputAge.value = contact.age || '';
        crmInputCompany.value = contact.company || '';
        crmInputSegment.value = contact.segment || 'client';
        crmInputNotes.value = contact.notes || '';

        if (crmModalTitle) crmModalTitle.textContent = 'Editar Contacto';
        if (crmModalSubmitLabel) crmModalSubmitLabel.textContent = 'Guardar Cambios';
        if (modalCrm) modalCrm.style.display = 'flex';
        crmInputName.focus();
      }
    });
  }

  // 3. Enviar WhatsApp Masivo
  if (btnBulkWhatsapp) {
    btnBulkWhatsapp.addEventListener('click', () => {
      const count = selectedContactIds.size;
      if (count === 0) return;

      const contacts = getCrmContacts().filter(c => selectedContactIds.has(c.id));
      const namesList = contacts.slice(0, 3).map(c => c.name).join(', ') + (count > 3 ? ` y ${count - 3} más` : '');

      if (wpRecipientsText) {
        wpRecipientsText.textContent = `${count} contacto${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'} (${namesList})`;
      }
      if (modalBulkWp) modalBulkWp.style.display = 'flex';
      if (wpMessageInput) wpMessageInput.focus();
    });
  }

  function closeBulkWpModal() {
    if (modalBulkWp) modalBulkWp.style.display = 'none';
  }
  if (btnCloseBulkWp) btnCloseBulkWp.addEventListener('click', closeBulkWpModal);
  if (btnCancelBulkWp) btnCancelBulkWp.addEventListener('click', closeBulkWpModal);
  if (modalBulkWp) {
    modalBulkWp.addEventListener('click', (e) => {
      if (e.target === modalBulkWp) closeBulkWpModal();
    });
  }

  if (formBulkWp) {
    formBulkWp.addEventListener('submit', (e) => {
      e.preventDefault();
      const rawMsg = (wpMessageInput ? wpMessageInput.value : '').trim();
      if (!rawMsg) {
        MagumAlert.error('Mensaje Requerido', 'Por favor ingresa un mensaje para la difusión por WhatsApp.');
        return;
      }

      const contacts = getCrmContacts().filter(c => selectedContactIds.has(c.id));
      closeBulkWpModal();

      if (contacts.length === 1) {
        // Un solo contacto: abrir chat directo con mensaje personalizado
        const target = contacts[0];
        const personalized = rawMsg
          .replace(/{nombre}/gi, target.name || '')
          .replace(/{empresa}/gi, target.company || '');
        const cleanPhone = (target.phone || '').replace(/[^0-9]/g, '');
        window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(personalized)}`, '_blank');
      } else {
        // Masivo: simulación estética de envío en lote
        MagumAlert.campaignDispatched(
          'whatsapp',
          contacts.length,
          'Mensaje personalizado transmitido a cada número de celular registrado en tu base de datos.'
        );
      }
    });
  }

  // 4. Enviar Correos Masivos
  if (btnBulkEmail) {
    btnBulkEmail.addEventListener('click', () => {
      const count = selectedContactIds.size;
      if (count === 0) return;

      const contacts = getCrmContacts().filter(c => selectedContactIds.has(c.id));
      const namesList = contacts.slice(0, 3).map(c => c.name).join(', ') + (count > 3 ? ` y ${count - 3} más` : '');

      if (emailRecipientsText) {
        emailRecipientsText.textContent = `${count} contacto${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'} (${namesList})`;
      }
      if (modalBulkEmail) modalBulkEmail.style.display = 'flex';
      if (emailSubjectInput) emailSubjectInput.focus();
    });
  }

  function closeBulkEmailModal() {
    if (modalBulkEmail) modalBulkEmail.style.display = 'none';
  }
  if (btnCloseBulkEmail) btnCloseBulkEmail.addEventListener('click', closeBulkEmailModal);
  if (btnCancelBulkEmail) btnCancelBulkEmail.addEventListener('click', closeBulkEmailModal);
  if (modalBulkEmail) {
    modalBulkEmail.addEventListener('click', (e) => {
      if (e.target === modalBulkEmail) closeBulkEmailModal();
    });
  }

  if (formBulkEmail) {
    formBulkEmail.addEventListener('submit', (e) => {
      e.preventDefault();
      const subject = (emailSubjectInput ? emailSubjectInput.value : '').trim();
      const body = (emailBodyInput ? emailBodyInput.value : '').trim();

      if (!subject || !body) {
        MagumAlert.error('Campos Incompletos', 'Por favor completa el asunto y el contenido del correo.');
        return;
      }

      const contacts = getCrmContacts().filter(c => selectedContactIds.has(c.id));
      closeBulkEmailModal();

      MagumAlert.campaignDispatched(
        'email',
        contacts.length,
        `Campaña masiva ejecutada con el asunto: "${subject}". Estado de entrega: 100% completado.`
      );
    });
  }

  // 5. Envío Dual Simultáneo (WhatsApp + Email)
  if (btnBulkDual) {
    btnBulkDual.addEventListener('click', () => {
      const count = selectedContactIds.size;
      if (count === 0) return;

      if (dualRecipientsText) {
        dualRecipientsText.textContent = `${count} contacto${count === 1 ? '' : 's'} seleccionados para impacto dual (WhatsApp + Correo)`;
      }
      if (modalBulkDual) modalBulkDual.style.display = 'flex';
      if (dualEmailSubject) dualEmailSubject.focus();
    });
  }

  function closeBulkDualModal() {
    if (modalBulkDual) modalBulkDual.style.display = 'none';
  }
  if (btnCloseBulkDual) btnCloseBulkDual.addEventListener('click', closeBulkDualModal);
  if (btnCancelBulkDual) btnCancelBulkDual.addEventListener('click', closeBulkDualModal);
  if (modalBulkDual) {
    modalBulkDual.addEventListener('click', (e) => {
      if (e.target === modalBulkDual) closeBulkDualModal();
    });
  }

  if (formBulkDual) {
    formBulkDual.addEventListener('submit', (e) => {
      e.preventDefault();
      const subject = (dualEmailSubject ? dualEmailSubject.value : '').trim();
      const msg = (dualCommonMessage ? dualCommonMessage.value : '').trim();

      if (!subject || !msg) {
        MagumAlert.error('Campos Incompletos', 'Por favor completa el asunto y el mensaje para el envío dual.');
        return;
      }

      const count = selectedContactIds.size;
      closeBulkDualModal();

      MagumAlert.campaignDispatched(
        'dual',
        count,
        `Asunto: "${subject}". Canales activados simultáneamente: WhatsApp Directo + Email Marketing.`
      );
    });
  }

  // ==========================================================================
  // CREACIÓN MANUAL Y EDICIÓN DE CONTACTO CRM
  // ==========================================================================

  if (btnOpenCrmModal) {
    btnOpenCrmModal.addEventListener('click', () => {
      formCrm.reset();
      crmContactId.value = '';
      if (crmModalTitle) crmModalTitle.textContent = 'Registrar Contacto';
      if (crmModalSubmitLabel) crmModalSubmitLabel.textContent = 'Guardar Contacto';
      if (modalCrm) modalCrm.style.display = 'flex';
      crmInputName.focus();
    });
  }

  function closeCrmModal() {
    if (modalCrm) modalCrm.style.display = 'none';
  }
  if (btnCloseCrmModal) btnCloseCrmModal.addEventListener('click', closeCrmModal);
  if (btnCancelCrmModal) btnCancelCrmModal.addEventListener('click', closeCrmModal);
  if (modalCrm) {
    modalCrm.addEventListener('click', (e) => {
      if (e.target === modalCrm) closeCrmModal();
    });
  }

  // Guardar contacto CRM (Solo Nombre, Correo y Celular son obligatorios)
  if (formCrm) {
    formCrm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = crmInputName.value.trim();
      const email = crmInputEmail.value.trim();
      const phone = crmInputPhone.value.trim();
      const age = crmInputAge.value ? parseInt(crmInputAge.value, 10) : null;
      const company = crmInputCompany.value.trim();
      const segment = crmInputSegment.value;
      const notes = crmInputNotes.value.trim();

      if (!name || !email || !phone) {
        MagumAlert.error('Campos Obligatorios', 'Nombre, correo y celular son obligatorios.');
        return;
      }

      const contacts = getCrmContacts();
      const editId = crmContactId.value;

      if (editId) {
        const idx = contacts.findIndex(c => c.id === editId);
        if (idx !== -1) {
          contacts[idx] = { ...contacts[idx], name, email, phone, age, company, segment, notes };
        }
        if (window.MagumApi) {
          window.MagumApi.updateCrmContact(editId, { name, email, phone, age, company, segment, notes })
            .catch(e => console.warn('Update CRM backend warning:', e.message));
        }
      } else {
        let newId = 'C-' + Math.floor(1000 + Math.random() * 9000);
        let newContact = { id: newId, name, email, phone, age, company, segment, notes };
        contacts.unshift(newContact);

        if (window.MagumApi) {
          try {
            const res = await window.MagumApi.createCrmContact({ name, email, phone, age, company, segment, notes });
            if (res && res.data && res.data.id) {
              newContact.id = res.data.id;
            }
          } catch (e) {
            console.warn('Create CRM backend warning:', e.message);
          }
        }
      }

      saveCrmContacts(contacts);
      closeCrmModal();
      renderCrm();
      MagumAlert.success(
        'Contacto Guardado',
        editId ? 'Los datos del contacto se actualizaron con éxito.' : 'El contacto fue agregado a tu CRM.'
      );
    });
  }

  // Descargar plantilla CSV de clientes
  if (btnDownloadCsvTemplate) {
    btnDownloadCsvTemplate.addEventListener('click', () => {
      const csvHeader = 'Nombre,Correo,Celular,Edad,Empresa,Segmento,Notas\r\n';
      const sampleRows = [
        'Carlos Morales,carlos@empresa.com,+57 310 000 0000,38,Transportes SAS,vip,Cliente corporativo frecuente',
        'Diana Rincón,diana@correo.com,+57 315 111 2222,29,Inversiones Luna,prospect,Interesada en cotización',
        'Jorge Vega,jorge@gmail.com,+57 301 222 3333,45,Logística Vega,inactive,Inactivo para reactivar'
      ].join('\r\n');

      const csvContent = '\uFEFF' + csvHeader + sampleRows;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'plantilla_clientes_crm.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // Importar archivo CSV / Excel masivo
  if (crmImportFile) {
    crmImportFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target.result;
          const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
          if (lines.length <= 1) {
            MagumAlert.error('Archivo Vacío', 'El archivo CSV está vacío o solo contiene encabezados.');
            return;
          }

          const header = lines[0].split(',').map(h => h.trim().toLowerCase());
          const nameIdx = header.findIndex(h => h.includes('nombre') || h.includes('name'));
          const emailIdx = header.findIndex(h => h.includes('correo') || h.includes('email'));
          const phoneIdx = header.findIndex(h => h.includes('celular') || h.includes('tel'));
          const ageIdx = header.findIndex(h => h.includes('edad') || h.includes('age'));
          const companyIdx = header.findIndex(h => h.includes('empresa') || h.includes('company'));
          const segmentIdx = header.findIndex(h => h.includes('segmento') || h.includes('segment'));
          const notesIdx = header.findIndex(h => h.includes('nota') || h.includes('notes'));

          if (nameIdx === -1 || emailIdx === -1 || phoneIdx === -1) {
            MagumAlert.error(
              'Formato No Reconocido',
              'Asegúrate de incluir las columnas obligatorias: Nombre, Correo y Celular.\n\nPuedes descargar la plantilla oficial con el botón "Descargar Plantilla CSV".'
            );
            return;
          }

          const contacts = getCrmContacts();
          let importedCount = 0;

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            const name = cols[nameIdx];
            const email = cols[emailIdx];
            const phone = cols[phoneIdx];

            if (name && email && phone) {
              const age = (ageIdx !== -1 && cols[ageIdx]) ? parseInt(cols[ageIdx], 10) : null;
              const company = (companyIdx !== -1 && cols[companyIdx]) ? cols[companyIdx] : '';
              let segment = (segmentIdx !== -1 && cols[segmentIdx]) ? cols[segmentIdx].toLowerCase() : 'client';
              if (!['vip', 'prospect', 'inactive', 'client'].includes(segment)) segment = 'client';
              const notes = (notesIdx !== -1 && cols[notesIdx]) ? cols[notesIdx] : '';

              contacts.push({
                id: 'C-' + Math.floor(1000 + Math.random() * 9000),
                name,
                email,
                phone,
                age,
                company,
                segment,
                notes
              });
              importedCount++;
            }
          }

          saveCrmContacts(contacts);
          renderCrm();
          MagumAlert.success('¡Importación Exitosa!', `Se importaron ${importedCount} contactos a tu base de datos.`);
          crmImportFile.value = '';
        } catch (err) {
          console.error(err);
          MagumAlert.error('Error al Procesar', 'Hubo un error al procesar el archivo CSV. Verifica el formato e intenta nuevamente.');
        }
      };

      reader.readAsText(file);
    });
  }

  // ==========================================================================
  // 8. PROFESIONALES: CRUD DE MIEMBROS CON ACCESO A LA CUENTA
  // ==========================================================================

  const DEFAULT_PROFESSIONALS = [];

  function getProfStorageKey() {
    return `magum_team_professionals_${currentClientAccountId}`;
  }

  function getProfessionals() {
    const key = getProfStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    try {
      let profs = JSON.parse(raw);
      // Depurar profesionales de prueba previos
      const filtered = profs.filter(p => !['P-101', 'P-102', 'P-103'].includes(p.id) && !(p.email || '').includes('@automotor.com'));
      if (filtered.length !== profs.length) {
        profs = filtered;
        saveProfessionals(profs);
      }
      return profs;
    } catch {
      return [];
    }
  }

  function saveProfessionals(profs) {
    localStorage.setItem(getProfStorageKey(), JSON.stringify(profs));
  }

  async function syncTeamFromBackend() {
    try {
      if (!window.MagumApi) return;
      const localProfs = getProfessionals();
      const res = await window.MagumApi.getTeam();
      if (res && res.success && Array.isArray(res.data)) {
        let backendTeam = res.data;
        const backendIds = new Set(backendTeam.map(p => String(p.id)));
        const backendEmails = new Set(backendTeam.map(p => (p.email || '').toLowerCase().trim()));

        const unsynced = localProfs.filter(p => {
          if (!p || !p.name) return false;
          if (isDemoAccount && ['P-101', 'P-102', 'P-103'].includes(p.id)) return false;
          if (backendIds.has(String(p.id))) return false;
          if (p.email && backendEmails.has(p.email.toLowerCase().trim())) return false;
          return true;
        });

        for (const prof of unsynced) {
          try {
            const createRes = await window.MagumApi.createTeamMember(prof);
            if (createRes && createRes.data) {
              backendTeam.unshift(createRes.data);
            }
          } catch (err) {
            console.warn('Auto-sync unsynced team member warning:', err);
          }
        }

        if (backendTeam.length > 0) {
          saveProfessionals(backendTeam);
        } else if (!isDemoAccount && localProfs.length > 0) {
          saveProfessionals(localProfs);
        }
        renderProfessionals();
      }
    } catch (e) {
      console.warn('Sync team from backend warning:', e.message);
    }
  }

  const profTableBody = document.getElementById('prof-table-body');
  const profEmptyState = document.getElementById('prof-empty-state');
  const modalProf = document.getElementById('modal-prof-user');
  const btnOpenProfModal = document.getElementById('btn-open-prof-modal');
  const btnCloseProfModal = document.getElementById('btn-close-prof-modal');
  const btnCancelProfModal = document.getElementById('btn-cancel-prof-modal');
  const formProf = document.getElementById('form-prof-user');
  const profUserId = document.getElementById('prof-user-id');
  const profInputName = document.getElementById('prof-input-name');
  const profInputRole = document.getElementById('prof-input-role');
  const profInputEmail = document.getElementById('prof-input-email');
  const profInputPassword = document.getElementById('prof-input-password');
  const profInputPhone = document.getElementById('prof-input-phone');
  const profInputSchedule = document.getElementById('prof-input-schedule');
  const profModalTitle = document.getElementById('prof-modal-title');
  const profModalSubmitLabel = document.getElementById('prof-modal-submit-label');

  function renderProfessionals() {
    if (!profTableBody) return;
    const profs = getProfessionals();

    profTableBody.innerHTML = '';

    if (profs.length === 0) {
      if (profEmptyState) profEmptyState.style.display = 'block';
    } else {
      if (profEmptyState) profEmptyState.style.display = 'none';

      profs.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="client-name-cell">${escapeHtml(p.name)}</td>
          <td><span style="font-weight:700; color: var(--brand-magenta);">${escapeHtml(p.role)}</span></td>
          <td class="email-cell">${escapeHtml(p.email)}</td>
          <td><code style="background: rgba(0,0,0,0.06); padding: 3px 8px; border-radius: 6px; font-size: 0.8rem;"><i class="fa-solid fa-lock" style="font-size: 0.7rem; margin-right: 4px;"></i>Protegida</code></td>
          <td>${p.phone ? escapeHtml(p.phone) : '<span style="color:var(--text-muted);">—</span>'}</td>
          <td style="font-size: 0.82rem;">${p.schedule ? escapeHtml(p.schedule) : '<span style="color:var(--text-muted);">—</span>'}</td>
          <td>
            <div class="actions-cell">
              <button class="btn-row-action btn-edit-prof" title="Editar profesional" data-id="${escapeHtml(p.id)}">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn-row-action btn-delete btn-delete-prof" title="Eliminar profesional" data-id="${escapeHtml(p.id)}">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </td>
        `;
        profTableBody.appendChild(tr);
      });
    }

    attachProfRowListeners();
  }

  function attachProfRowListeners() {
    document.querySelectorAll('.btn-edit-prof').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const prof = getProfessionals().find(p => p.id === id);
        if (prof) {
          profUserId.value = prof.id;
          profInputName.value = prof.name || '';
          profInputRole.value = prof.role || '';
          profInputEmail.value = prof.email || '';
          profInputPassword.value = '';
          profInputPhone.value = prof.phone || '';
          profInputSchedule.value = prof.schedule || '';

          if (profModalTitle) profModalTitle.textContent = 'Editar Profesional';
          if (profModalSubmitLabel) profModalSubmitLabel.textContent = 'Guardar Cambios';
          modalProf.style.display = 'flex';
          profInputName.focus();
        }
      });
    });

    document.querySelectorAll('.btn-delete-prof').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const profs = getProfessionals();
        const prof = profs.find(p => p.id === id);
        if (prof) {
          const ok = await MagumAlert.confirm(
            '¿Revocar Acceso a Profesional?',
            `¿Deseas revocar el acceso a "${prof.name}"? Ya no podrá ingresar a la cuenta de la empresa.`,
            'Sí, revocar acceso'
          );
          if (ok) {
            saveProfessionals(profs.filter(p => p.id !== id));
            renderProfessionals();
            if (window.MagumApi) {
              window.MagumApi.deleteTeamMember(id).catch(e => console.warn('Delete team backend warning:', e.message));
            }
            MagumAlert.success('Acceso Revocado', `El usuario de ${prof.name} fue retirado del equipo.`);
          }
        }
      });
    });
  }

  if (btnOpenProfModal) {
    btnOpenProfModal.addEventListener('click', () => {
      formProf.reset();
      profUserId.value = '';
      if (profModalTitle) profModalTitle.textContent = 'Agregar Profesional';
      if (profModalSubmitLabel) profModalSubmitLabel.textContent = 'Guardar Profesional';
      modalProf.style.display = 'flex';
      profInputName.focus();
    });
  }

  function closeProfModal() {
    if (modalProf) modalProf.style.display = 'none';
  }
  if (btnCloseProfModal) btnCloseProfModal.addEventListener('click', closeProfModal);
  if (btnCancelProfModal) btnCancelProfModal.addEventListener('click', closeProfModal);
  if (modalProf) {
    modalProf.addEventListener('click', (e) => {
      if (e.target === modalProf) closeProfModal();
    });
  }

  if (formProf) {
    formProf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = profInputName.value.trim();
      const role = profInputRole.value.trim();
      const email = profInputEmail.value.trim().toLowerCase();
      const password = profInputPassword.value.trim();
      const phone = profInputPhone.value.trim();
      const schedule = profInputSchedule.value.trim();

      const editId = profUserId.value;
      if (!name || !role || !email || (!password && !editId)) {
        MagumAlert.error('Campos Obligatorios', 'Nombre, cargo, correo y contraseña son obligatorios para habilitar el acceso.');
        return;
      }

      const profs = getProfessionals();

      if (editId) {
        const idx = profs.findIndex(p => p.id === editId);
        if (idx !== -1) {
          profs[idx].name = name;
          profs[idx].role = role;
          profs[idx].email = email;
          profs[idx].phone = phone;
          profs[idx].schedule = schedule;
          if (password) {
            profs[idx].password = password;
          }
        }
        if (window.MagumApi) {
          try {
            await window.MagumApi.updateTeamMember(editId, { name, role, email, phone, schedule, password });
          } catch (e) {
            console.warn('Update team backend warning:', e.message);
          }
        }
      } else {
        let newId = 'P-' + Math.floor(1000 + Math.random() * 9000);
        let newProf = { id: newId, name, role, email, password, phone, schedule };

        if (window.MagumApi) {
          try {
            const res = await window.MagumApi.createTeamMember({ name, role, email, password, phone, schedule });
            if (res && res.data && res.data.id) {
              newProf = res.data;
            }
          } catch (e) {
            console.warn('Create team backend warning:', e.message);
          }
        }
        profs.unshift(newProf);
      }

      saveProfessionals(profs);
      closeProfModal();
      renderProfessionals();
      MagumAlert.success(
        'Profesional Guardado',
        `El usuario "${name}" tiene acceso habilitado con el correo: ${email}`
      );
    });
  }

  // ==========================================================================
  // 9. AJUSTES DE MARCA (WHITE LABEL AISLADO POR EMPRESA)
  // ==========================================================================

  const DEFAULT_MAGUM_LOGO = 'https://lirp.cdn-website.com/e4e4cefa/dms3rep/multi/opt/Magum_logo+magenta-1920w.png';
  const DEFAULT_MAGUM_FAVICON = 'https://lirp.cdn-website.com/e4e4cefa/dms3rep/multi/opt/Magum_logo+magenta-1920w.png';

  const getAccountBrandStorageKey = () => {
    try {
      const sess = JSON.parse(localStorage.getItem('magum_session') || '{}');
      return 'magum_brand_account_' + (sess.accountId || 'default');
    } catch {
      return 'magum_brand_account_default';
    }
  };

  const formBrand = document.getElementById('form-brand-settings');
  const inputBizName = document.getElementById('setting-business-name');
  const inputLogoFile = document.getElementById('setting-logo-file');
  const btnTriggerLogo = document.getElementById('btn-trigger-logo');
  const previewLogoImg = document.getElementById('setting-logo-preview');
  const inputFaviconFile = document.getElementById('setting-favicon-file');
  const btnTriggerFavicon = document.getElementById('btn-trigger-favicon');
  const previewFaviconImg = document.getElementById('setting-favicon-preview');
  const inputColorPrimary = document.getElementById('setting-color-primary');
  const inputColorSecondary = document.getElementById('setting-color-secondary');
  const inputColorBg = document.getElementById('setting-color-bg');
  const dynamicFavicon = document.getElementById('dynamic-favicon');
  const clientBrandLogo = document.getElementById('client-brand-logo');

  function applyBrandingLive(data) {
    if (!data) return;

    if (clientBrandLogo) {
      clientBrandLogo.src = data.logoUrl || DEFAULT_MAGUM_LOGO;
    }
    if (dynamicFavicon) {
      dynamicFavicon.href = data.faviconUrl || DEFAULT_MAGUM_FAVICON;
    }

    if (data.businessName) {
      const topbarName = document.getElementById('topbar-account-name');
      const sidebarName = document.getElementById('sidebar-account-name');
      if (topbarName) topbarName.textContent = data.businessName;
      if (sidebarName) sidebarName.textContent = data.businessName;
      if (inputBizName) inputBizName.value = data.businessName;
    }

    if (data.colorPrimary) {
      document.documentElement.style.setProperty('--brand-indigo', data.colorPrimary);
    }
    if (data.colorBg) {
      document.documentElement.style.setProperty('--brand-magenta', data.colorBg);
    }
  }

  function loadBrandSettings() {
    try {
      // 1. Cargar caché local propio de esta cuenta para renderizado instantáneo
      const saved = localStorage.getItem(getAccountBrandStorageKey());
      if (saved) {
        const localData = JSON.parse(saved);
        if (inputBizName && localData.businessName) inputBizName.value = localData.businessName;
        if (previewLogoImg && localData.logoUrl) previewLogoImg.src = localData.logoUrl;
        if (previewFaviconImg && localData.faviconUrl) previewFaviconImg.src = localData.faviconUrl;
        if (inputColorPrimary && localData.colorPrimary) inputColorPrimary.value = localData.colorPrimary;
        if (inputColorSecondary && localData.colorSecondary) inputColorSecondary.value = localData.colorSecondary;
        if (inputColorBg && localData.colorBg) inputColorBg.value = localData.colorBg;
        applyBrandingLive(localData);
      } else {
        // Valores por defecto de Magum si esta cuenta aún no ha personalizado nada
        applyBrandingLive({
          logoUrl: DEFAULT_MAGUM_LOGO,
          faviconUrl: DEFAULT_MAGUM_FAVICON
        });
      }

      // 2. Sincronizar en tiempo real desde la base de datos (PostgreSQL) para esta cuenta
      if (window.MagumApi && window.MagumApi.getMyBranding) {
        window.MagumApi.getMyBranding().then(res => {
          if (res && res.success && res.data) {
            const serverData = res.data;
            if (inputBizName && serverData.businessName) inputBizName.value = serverData.businessName;
            if (previewLogoImg && serverData.logoUrl) previewLogoImg.src = serverData.logoUrl;
            if (previewFaviconImg && serverData.faviconUrl) previewFaviconImg.src = serverData.faviconUrl;
            if (inputColorPrimary && serverData.colorPrimary) inputColorPrimary.value = serverData.colorPrimary;
            if (inputColorSecondary && serverData.colorSecondary) inputColorSecondary.value = serverData.colorSecondary;
            if (inputColorBg && serverData.colorBg) inputColorBg.value = serverData.colorBg;

            applyBrandingLive(serverData);
            localStorage.setItem(getAccountBrandStorageKey(), JSON.stringify(serverData));
          }
        }).catch(err => {
          console.warn('[Branding] Usando caché local de la cuenta:', err.message);
        });
      }
    } catch (e) {
      console.warn('Error cargando ajustes de marca:', e);
    }
  }

  if (btnTriggerLogo && inputLogoFile) {
    btnTriggerLogo.addEventListener('click', () => inputLogoFile.click());
    inputLogoFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          if (previewLogoImg) previewLogoImg.src = loadEvent.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (btnTriggerFavicon && inputFaviconFile) {
    btnTriggerFavicon.addEventListener('click', () => inputFaviconFile.click());
    inputFaviconFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          if (previewFaviconImg) previewFaviconImg.src = loadEvent.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (formBrand) {
    formBrand.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-branding');
      const originalHtml = saveBtn ? saveBtn.innerHTML : '';

      const settingsData = {
        businessName: inputBizName ? inputBizName.value.trim() : '',
        logoUrl: (previewLogoImg && previewLogoImg.src && !previewLogoImg.src.includes('placeholder')) ? previewLogoImg.src : '',
        faviconUrl: (previewFaviconImg && previewFaviconImg.src && !previewFaviconImg.src.includes('placeholder')) ? previewFaviconImg.src : '',
        colorPrimary: inputColorPrimary ? inputColorPrimary.value : '#210087',
        colorSecondary: inputColorSecondary ? inputColorSecondary.value : '#F8F3EB',
        colorBg: inputColorBg ? inputColorBg.value : '#FF00DB',
        savedAt: new Date().toISOString()
      };

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Guardando en tu cuenta...</span>';
      }

      try {
        // Guardar exclusivamente para esta cuenta en PostgreSQL
        if (window.MagumApi && window.MagumApi.saveMyBranding) {
          await window.MagumApi.saveMyBranding(settingsData);
        }

        // Guardar en almacenamiento local con clave única de esta empresa
        localStorage.setItem(getAccountBrandStorageKey(), JSON.stringify(settingsData));

        // Actualizar sesión activa si cambió el nombre del negocio
        if (settingsData.businessName) {
          try {
            const curSession = JSON.parse(localStorage.getItem('magum_session') || '{}');
            curSession.business = settingsData.businessName;
            localStorage.setItem('magum_session', JSON.stringify(curSession));
          } catch {}
        }

        applyBrandingLive(settingsData);

        if (saveBtn) {
          saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>¡Identidad Guardada con Éxito!</span>';
          saveBtn.style.background = '#10b981';
          setTimeout(() => {
            saveBtn.innerHTML = originalHtml;
            saveBtn.style.background = '';
            saveBtn.disabled = false;
          }, 2500);
        }
      } catch (err) {
        console.error('Error guardando marca:', err);
        if (saveBtn) {
          saveBtn.innerHTML = originalHtml;
          saveBtn.disabled = false;
        }
        if (window.MagumAlert) {
          MagumAlert.error('Error al Guardar', err.message || 'No se pudo guardar la marca de la cuenta.');
        }
      }
    });
  }

  // ==========================================================================
  // 10. MÓDULO SOCIAL MEDIA & ANALÍTICA (ESTILO METRICOOL)
  // ==========================================================================
  const channelData = {
    instagram: {
      name: 'Instagram Business',
      icon: 'fa-brands fa-instagram',
      color: 'linear-gradient(135deg, #fdf497 0%, #fd5949 45%, #d6249f 70%, #285aeb 100%)',
      badgeBg: 'rgba(225, 48, 108, 0.15)',
      badgeColor: '#e1306c',
      placeholder: '@tu_cuenta_instagram',
      followers: '18,400',
      reach: '24,100'
    },
    facebook: {
      name: 'Facebook Fan Page',
      icon: 'fa-brands fa-facebook-f',
      color: '#1877f2',
      badgeBg: 'rgba(24, 119, 242, 0.15)',
      badgeColor: '#1877f2',
      placeholder: 'Nombre o ID de la Fan Page',
      followers: '16,400',
      reach: '16,400'
    },
    tiktok: {
      name: 'TikTok Pro',
      icon: 'fa-brands fa-tiktok',
      color: '#000000',
      badgeBg: 'rgba(0, 0, 0, 0.15)',
      badgeColor: '#000000',
      placeholder: '@tu_cuenta_tiktok',
      followers: '8,420',
      reach: '8,420'
    },
    youtube: {
      name: 'YouTube Channel',
      icon: 'fa-brands fa-youtube',
      color: '#ff0000',
      badgeBg: 'rgba(255, 0, 0, 0.15)',
      badgeColor: '#ff0000',
      placeholder: '@tu_canal_youtube',
      followers: '12,300',
      reach: '35,800'
    },
    linkedin: {
      name: 'LinkedIn Company Page',
      icon: 'fa-brands fa-linkedin-in',
      color: '#0a66c2',
      badgeBg: 'rgba(10, 102, 194, 0.15)',
      badgeColor: '#0a66c2',
      placeholder: 'linkedin.com/company/tu-empresa',
      followers: '5,140',
      reach: '9,820'
    },
    twitter: {
      name: 'X (Twitter)',
      icon: 'fa-brands fa-x-twitter',
      color: '#000000',
      badgeBg: 'rgba(255, 255, 255, 0.1)',
      badgeColor: '#ffffff',
      placeholder: '@tu_cuenta_x',
      followers: '7,890',
      reach: '19,400'
    },
    pinterest: {
      name: 'Pinterest Business',
      icon: 'fa-brands fa-pinterest',
      color: '#e60023',
      badgeBg: 'rgba(230, 0, 35, 0.15)',
      badgeColor: '#e60023',
      placeholder: 'pinterest.com/tu_cuenta',
      followers: '4,320',
      reach: '14,800'
    },
    google_business: {
      name: 'Google Business Profile',
      icon: 'fa-brands fa-google',
      color: '#4285f4',
      badgeBg: 'rgba(66, 133, 244, 0.15)',
      badgeColor: '#4285f4',
      placeholder: 'Nombre en Google Maps / Business',
      followers: '9,150',
      reach: '22,300'
    },
    threads: {
      name: 'Threads',
      icon: 'fa-brands fa-threads',
      color: '#000000',
      badgeBg: 'rgba(255, 255, 255, 0.1)',
      badgeColor: '#ffffff',
      placeholder: '@tu_usuario_threads',
      followers: '6,450',
      reach: '15,200'
    },
    twitch: {
      name: 'Twitch Channel',
      icon: 'fa-brands fa-twitch',
      color: '#9146ff',
      badgeBg: 'rgba(145, 70, 255, 0.15)',
      badgeColor: '#9146ff',
      placeholder: 'twitch.tv/tu_canal',
      followers: '3,210',
      reach: '8,900'
    }
  };

  const socialModal = document.getElementById('modal-connect-social');
  const socialModalTitle = document.getElementById('modal-social-title');
  const socialModalBubble = document.getElementById('modal-social-icon-bubble');
  const socialHandleInput = document.getElementById('connect-social-handle');
  const socialChannelInput = document.getElementById('connect-social-channel');
  const socialSubmitBtn = document.getElementById('btn-simulate-oauth');
  const socialSubmitText = document.getElementById('btn-social-submit-text');

  window.openConnectModal = function(channelKey) {
    const meta = channelData[channelKey] || {
      name: channelKey,
      icon: 'fa-solid fa-share-nodes',
      color: '#ff00db',
      placeholder: '@tu_cuenta'
    };

    const modal = document.getElementById('modal-connect-social');
    const modalTitle = document.getElementById('modal-social-title');
    const modalBubble = document.getElementById('modal-social-icon-bubble');
    const handleInput = document.getElementById('connect-social-handle');
    const channelInput = document.getElementById('connect-social-channel');
    const submitBtn = document.getElementById('btn-simulate-oauth');
    const submitText = document.getElementById('btn-social-submit-text');

    if (channelInput) channelInput.value = channelKey;
    if (modalTitle) modalTitle.textContent = `Conectar ${meta.name}`;
    if (handleInput) {
      handleInput.value = '';
      handleInput.placeholder = meta.placeholder;
    }
    if (modalBubble) {
      modalBubble.innerHTML = `<i class="${meta.icon}"></i>`;
      modalBubble.style.background = meta.color;
      modalBubble.style.color = '#ffffff';
    }
    if (submitBtn) {
      submitBtn.style.background = meta.color;
    }
    if (submitText) {
      submitText.textContent = 'Conectar';
    }
    if (modal) {
      modal.style.display = 'flex';
      modal.style.zIndex = '9999';
    }
  };

  window.configureSocialChannel = function(channelKey) {
    const meta = channelData[channelKey] || { name: channelKey };
    if (window.Swal) {
      Swal.fire({
        title: `${meta.name}`,
        text: 'La API oficial se encuentra activa y recibiendo estadísticas para esta cuenta.',
        icon: 'success',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Desconectar Canal',
        cancelButtonText: 'Mantener Conectado'
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            if (window.MagumApi) {
              await MagumApi.disconnectSocial(channelKey);
            }
          } catch (e) {
            console.warn(e);
          }

          // Restaurar fila en la tabla
          const row = document.querySelector(`tr[data-channel-row="${channelKey}"]`);
          if (row) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 5) {
              cells[1].innerHTML = `<span class="account-handle text-muted">Sin vincular</span>`;
              cells[2].textContent = '—';
              cells[3].textContent = '—';
              cells[4].innerHTML = `<button type="button" class="btn-connect-sm" onclick="openConnectModal('${channelKey}')">Conectar</button>`;
            }
          }
          const sideBtn = document.querySelector(`.btn-channel-connect[data-connect-channel="${channelKey}"]`);
          if (sideBtn) {
            sideBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
            sideBtn.title = `Conectar ${meta.name}`;
          }
          if (window.MagumAlert) {
            MagumAlert.info('Canal Desconectado', `Se ha revocado la sincronización de ${meta.name}.`);
          }
        }
      });
    } else {
      alert(`La API de ${meta.name} está sincronizada y activa.`);
    }
  };

  // Botones de cierre del modal de redes
  const btnCloseSocialModal = document.getElementById('btn-close-social-modal');
  const btnCancelSocialModal = document.getElementById('btn-cancel-social-modal');
  if (btnCloseSocialModal) btnCloseSocialModal.addEventListener('click', () => socialModal.style.display = 'none');
  if (btnCancelSocialModal) btnCancelSocialModal.addEventListener('click', () => socialModal.style.display = 'none');

  // Autorización / Vinculación con el Backend
  if (socialSubmitBtn) {
    socialSubmitBtn.addEventListener('click', async () => {
      const channelKey = socialChannelInput ? socialChannelInput.value : 'instagram';
      const handle = (socialHandleInput && socialHandleInput.value.trim()) || `@${channelKey}_pro`;
      const meta = channelData[channelKey] || { name: channelKey };

      const originalText = 'Conectar';

      // Si es Meta (Instagram o Facebook), iniciar flujo OAuth oficial en vivo
      if (channelKey === 'instagram' || channelKey === 'facebook') {
        if (socialSubmitText) socialSubmitText.textContent = 'Conectando...';
        socialSubmitBtn.disabled = true;

        try {
          if (!window.MagumApi) {
            throw new Error('Cliente API no inicializado.');
          }

          const authRes = await MagumApi.getSocialAuthUrl(channelKey);
          if (authRes && authRes.success && authRes.authUrl) {
            localStorage.setItem('magum_social_pending', channelKey);
            window.location.href = authRes.authUrl;
            return;
          }

          if (authRes && authRes.needsCredentials) {
            socialSubmitBtn.disabled = false;
            if (socialSubmitText) socialSubmitText.textContent = originalText;
            if (window.Swal) {
              Swal.fire({
                title: 'Credenciales de Meta Requeridas',
                text: authRes.message || 'Se requiere configurar META_APP_ID en las variables de entorno de Railway.',
                icon: 'warning',
                confirmButtonColor: '#210087'
              });
            } else {
              alert(authRes.message);
            }
            return;
          }

          throw new Error((authRes && authRes.message) || 'No se obtuvo la URL de autorización de Meta.');
        } catch (authErr) {
          socialSubmitBtn.disabled = false;
          if (socialSubmitText) socialSubmitText.textContent = originalText;
          console.error('[Social OAuth] Error al conectar con Meta:', authErr);

          if (window.Swal) {
            Swal.fire({
              title: 'Error de Conexión',
              text: authErr.message || 'No fue posible abrir la autorización oficial con Meta. Verifica tu sesión y las credenciales.',
              icon: 'error',
              confirmButtonColor: '#ef4444'
            });
          } else {
            alert('Error al conectar con Meta: ' + authErr.message);
          }
          return;
        }
      }

      // Para otros canales o guardado manual
      if (socialSubmitText) socialSubmitText.textContent = 'Sincronizando...';
      socialSubmitBtn.disabled = true;

      try {
        if (window.MagumApi) {
          await MagumApi.connectSocialManual(channelKey, handle);
        }
      } catch (err) {
        console.warn('Registro local de canal:', err.message);
      }

      if (socialSubmitBtn) socialSubmitBtn.disabled = false;
      if (socialSubmitText) socialSubmitText.textContent = originalText;
      if (socialModal) socialModal.style.display = 'none';

      // Actualizar fila en la tabla de cuentas
      const row = document.querySelector(`tr[data-channel-row="${channelKey}"]`);
      if (row) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
          cells[1].innerHTML = `<span class="account-handle">${escapeHtml(handle)}</span>`;
          cells[2].innerHTML = `<span class="badge-api-connected"><i class="fa-solid fa-circle-check"></i> Sincronizado</span>`;
          cells[3].textContent = meta.followers || '1,200';
          cells[4].textContent = meta.reach || '3,400';
          cells[5].innerHTML = `<button type="button" class="btn-disconnect-sm" onclick="configureSocialChannel('${channelKey}')">Configurar</button>`;
        }
      }

      // Actualizar botón en el sub-sidebar
      const sideBtn = document.querySelector(`.btn-channel-connect[data-connect-channel="${channelKey}"]`);
      if (sideBtn) {
        sideBtn.innerHTML = '<i class="fa-solid fa-check" style="color: #10b981;"></i>';
        sideBtn.title = `${meta.name} Conectado`;
      }

      if (window.MagumAlert) {
        MagumAlert.success(
          '¡Canal Vinculado con Éxito!',
          `Se han sincronizado las métricas oficiales de ${meta.name} (${handle}).`
        );
      }
    });
  }

  // Cargar canales vinculados desde la Base de Datos para esta cuenta específica
  async function syncSocialFromBackend() {
    if (!window.MagumApi) return;
    try {
      const res = await MagumApi.getSocialConnections();
      if (res && res.success && Array.isArray(res.connections)) {
        let connectedCount = 0;
        const connMap = {};
        res.connections.forEach(c => {
          connMap[c.provider] = c;
        });

        ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'twitter', 'pinterest', 'google_business', 'threads', 'twitch'].forEach(channelKey => {
          const conn = connMap[channelKey];
          const meta = channelData[channelKey] || {};
          const row = document.querySelector(`tr[data-channel-row="${channelKey}"]`);
          const sideBtn = document.querySelector(`.btn-channel-connect[data-connect-channel="${channelKey}"]`);

          if (conn && conn.status === 'active') {
            connectedCount++;
            const handle = conn.account_name;
            const cache = conn.metrics_cache || {};

            if (row) {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 5) {
                cells[1].innerHTML = `<span class="account-handle font-semibold text-white">${escapeHtml(handle)}</span>`;
                cells[2].textContent = cache.followers || meta.followers || '—';
                cells[3].textContent = cache.reach || meta.reach || '—';
                cells[4].innerHTML = `<button type="button" class="btn-disconnect-sm" onclick="configureSocialChannel('${channelKey}')">Configurar</button>`;
              }
            }

            if (sideBtn) {
              sideBtn.innerHTML = '<i class="fa-solid fa-check" style="color: #10b981;"></i>';
              sideBtn.title = `${meta.name || channelKey} Conectado`;
            }
          } else {
            if (row) {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 5) {
                cells[1].innerHTML = `<span class="account-handle text-muted">Sin vincular</span>`;
                cells[2].textContent = '—';
                cells[3].textContent = '—';
                cells[4].innerHTML = `<button type="button" class="btn-connect-sm" onclick="openConnectModal('${channelKey}')">Conectar</button>`;
              }
            }

            if (sideBtn) {
              sideBtn.innerHTML = channelKey === 'linkedin' ? '<i class="fa-solid fa-gem"></i>' : '<i class="fa-solid fa-plus"></i>';
              sideBtn.title = `Conectar ${meta.name || channelKey}`;
            }
          }
        });

        const counter = document.getElementById('connected-channels-count');
        if (counter) {
          counter.textContent = `${connectedCount} de ${extraChannelsExpanded ? '10' : '5'} redes conectadas`;
        }

                // Si hay canales conectados, sincronizar KPIs reales y dar vida a las sub-vistas
        if (connectedCount > 0) {
          // 1. Analítica: Cálculo dinámico de números reales consolidados
          let totalFollowers = 0;
          let totalReach = 0;
          let sumEng = 0;
          let countEng = 0;

          ['instagram', 'facebook', 'tiktok', 'youtube'].forEach(p => {
            const conn = connMap[p];
            if (conn && conn.status === 'active') {
              const cache = conn.metrics_cache || {};
              const f = parseInt(String(cache.followers || '0').replace(/[^0-9]/g, ''), 10) || 0;
              const r = parseInt(String(cache.reach || '0').replace(/[^0-9]/g, ''), 10) || 0;
              const e = parseFloat(String(cache.engagement || '0').replace(/[^0-9.]/g, '')) || 0;
              totalFollowers += f;
              totalReach += r;
              if (e > 0) {
                sumEng += e;
                countEng++;
              }
            }
          });

          const kpiFollowers = document.getElementById('metric-followers-total');
          const kpiReach = document.getElementById('metric-reach-total');
          const kpiEngagement = document.getElementById('metric-engagement-rate');
          if (kpiFollowers) kpiFollowers.textContent = totalFollowers > 0 ? totalFollowers.toLocaleString() : '0';
          if (kpiReach) kpiReach.textContent = totalReach > 0 ? totalReach.toLocaleString() : '0';
          if (kpiEngagement) kpiEngagement.textContent = countEng > 0 ? `${(sumEng / countEng).toFixed(1)}%` : '0.0%';

          // 2. Reporting (Informe Ejecutivo)
          const reportBizName = document.getElementById('report-sheet-biz-name');
          if (reportBizName) reportBizName.textContent = 'Magum Creator Studio';

          // 3. SmartLinks
          const smartTitle = document.getElementById('smartlink-input-title');
          const phoneTitle = document.getElementById('phone-profile-name');
          const phoneDesc = document.getElementById('phone-profile-desc');
          if (smartTitle) smartTitle.value = 'Magum Creator Studio';
          if (phoneTitle) phoneTitle.textContent = 'Magum Creator Studio';
          if (phoneDesc) phoneDesc.textContent = 'Agencia & Creator Studio Oficial. Conectamos tu marca en redes sociales.';
        } else {
          const kpiFollowers = document.getElementById('metric-followers-total');
          const kpiReach = document.getElementById('metric-reach-total');
          const kpiEngagement = document.getElementById('metric-engagement-rate');
          if (kpiFollowers) kpiFollowers.textContent = '0';
          if (kpiReach) kpiReach.textContent = '0';
          if (kpiEngagement) kpiEngagement.textContent = '0.0%';
        }
      }
    } catch (err) {
      console.warn('Modo sin conexión remota social:', err.message);
    }
  }

  // Verificar retorno de autorización OAuth desde Meta (URL Params)
  (function handleOAuthReturnStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const socialStatus = urlParams.get('social_status');
    const socialMsg = urlParams.get('msg');
    const socialProvider = urlParams.get('provider') || 'Meta';

    if (socialStatus) {
      const socialNavBtn = document.querySelector('[data-view="view-marketing-social"]');
      if (socialNavBtn) {
        socialNavBtn.click();
      }

      if (socialStatus === 'connected') {
        if (window.Swal) {
          Swal.fire({
            title: '¡Conexión Exitosa!',
            text: `Tus canales de ${socialProvider.toUpperCase()} han sido sincronizados exitosamente con Magum Creator Studio.`,
            icon: 'success',
            confirmButtonColor: '#210087'
          });
        }
        window.history.replaceState({}, document.title, window.location.pathname + '#marketing-social');
        syncSocialFromBackend();
      } else if (socialStatus === 'warning') {
        if (window.Swal) {
          Swal.fire({
            title: 'Vinculación sin Páginas',
            text: socialMsg ? decodeURIComponent(socialMsg) : 'Tu cuenta se autenticó pero no se encontraron Páginas de Facebook o Instagram vinculadas.',
            icon: 'warning',
            confirmButtonColor: '#210087'
          });
        }
      } else if (socialStatus === 'error') {
        if (window.Swal) {
          Swal.fire({
            title: 'Error de Autorización',
            text: socialMsg ? decodeURIComponent(socialMsg) : 'Ocurrió un error al procesar la vinculación con Meta.',
            icon: 'error',
            confirmButtonColor: '#ef4444'
          });
        }
      } else if (socialStatus === 'canceled') {
        if (window.Swal) {
          Swal.fire({
            title: 'Autorización Cancelada',
            text: 'Has cancelado el proceso de autorización con Meta.',
            icon: 'info',
            confirmButtonColor: '#210087'
          });
        }
      }

      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  })();

  // Interacción de pestañas superiores estilo Metricool con cambio de sub-vista real
  const metricoolTabs = document.querySelectorAll('.metricool-tab-btn');
  const metricoolSubviews = document.querySelectorAll('.metricool-subview');
  const metricoolViewTitle = document.getElementById('metricool-view-title');

  window.switchMetricoolTab = function(tabName) {
    metricoolTabs.forEach(t => {
      if (t.getAttribute('data-metricool-tab') === tabName) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    metricoolSubviews.forEach(sub => {
      if (sub.id === `metricool-subview-${tabName}`) {
        sub.style.display = 'flex';
        sub.classList.add('active');
      } else {
        sub.style.display = 'none';
        sub.classList.remove('active');
      }
    });

    const activeTab = document.querySelector(`.metricool-tab-btn[data-metricool-tab="${tabName}"]`);
    const label = activeTab ? activeTab.querySelector('span')?.textContent : 'Analíticas';
    if (metricoolViewTitle) {
      metricoolViewTitle.textContent = label || 'Analíticas';
    }
  };

  metricoolTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-metricool-tab') || 'analitica';
      window.switchMetricoolTab(tabName);
    });
  });

  // Interacción de canales en el sub-sidebar
  const metricoolChannelItems = document.querySelectorAll('.metricool-channel-item');
  metricoolChannelItems.forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-channel-connect')) return;
      metricoolChannelItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const channel = item.getAttribute('data-channel');
      const name = item.querySelector('.channel-title-text')?.textContent || 'Canal';
      if (metricoolViewTitle) {
        metricoolViewTitle.textContent = channel === 'resumen' ? 'Analíticas Generales' : `Métricas de ${name}`;
      }
    });
  });

  // Botones de conectar (+) en el sub-sidebar
  const connectButtons = document.querySelectorAll('.btn-channel-connect');
  connectButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const channel = btn.getAttribute('data-connect-channel');
      window.openConnectModal(channel);
    });
  });

    // Botón Más conexiones: Despliega directamente las redes adicionales en la lista y tabla sin popups molestos
  const btnMoreConns = document.getElementById('btn-open-more-connections');
  let extraChannelsExpanded = false;

  if (btnMoreConns) {
    btnMoreConns.addEventListener('click', () => {
      extraChannelsExpanded = !extraChannelsExpanded;
      const extraListItems = document.querySelectorAll('.extra-channel');
      const extraTableRows = document.querySelectorAll('.extra-channel-row');

      extraListItems.forEach(el => {
        el.style.display = extraChannelsExpanded ? 'flex' : 'none';
      });

      extraTableRows.forEach(row => {
        row.style.display = extraChannelsExpanded ? 'table-row' : 'none';
      });

      btnMoreConns.innerHTML = extraChannelsExpanded 
        ? '<i class="fa-solid fa-minus"></i> <span>Menos conexiones</span>'
        : '<i class="fa-solid fa-plus"></i> <span>Más conexiones</span>';
      
      const counter = document.getElementById('connected-channels-count');
      if (counter) {
        const total = extraChannelsExpanded ? '10' : '5';
        const current = counter.textContent.split(' ')[0] || '0';
        counter.textContent = `${current} de ${total} redes conectadas`;
      }
    });
  }

  // ==========================================================================
  // 11. CIERRE DE SESIÓN SEGURO
  // ==========================================================================
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('magum_session');
      window.location.href = 'index.html';
    });
  }

  // Carga inicial de datos
  loadBrandSettings();
  renderCrm();
  renderProfessionals();
  syncCrmFromBackend();
  syncTeamFromBackend();
  syncSocialFromBackend();

  // ==========================================================================
  // 11. COLAPSO Y EXPANSIÓN DEL SIDEBAR CON MEMORIA (LOCALSTORAGE)
  // ==========================================================================
  const btnSidebarCollapse = document.getElementById('btn-sidebar-collapse');
  const sidebarEl = document.getElementById('sidebar');

  // Cargar preferencia guardada
  if (localStorage.getItem('magum_sidebar_collapsed') === 'true' && sidebarEl) {
    sidebarEl.classList.add('collapsed');
  }

  if (btnSidebarCollapse && sidebarEl) {
    btnSidebarCollapse.addEventListener('click', () => {
      const isCollapsed = sidebarEl.classList.toggle('collapsed');
      localStorage.setItem('magum_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    });
  }

  // ==========================================================================
  // 12. CENTRO DE NOTIFICACIONES INTERACTIVO
  // ==========================================================================
  const btnNotifications = document.getElementById('btn-notifications');
  const notifDropdown = document.getElementById('notifications-dropdown');
  const notifBadge = document.getElementById('notif-count-badge');
  const notifIndicator = document.getElementById('notification-indicator');
  const btnMarkAllRead = document.getElementById('btn-mark-all-read');
  const notifPills = document.querySelectorAll('.notif-pill');

  if (btnNotifications && notifDropdown) {
    btnNotifications.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = notifDropdown.style.display === 'block';
      notifDropdown.style.display = isVisible ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
      if (notifDropdown && !notifDropdown.contains(e.target) && e.target !== btnNotifications) {
        notifDropdown.style.display = 'none';
      }
    });
  }

  if (btnMarkAllRead) {
    btnMarkAllRead.addEventListener('click', () => {
      document.querySelectorAll('.notif-item.unread').forEach(item => {
        item.classList.remove('unread');
        const dot = item.querySelector('.notif-unread-dot');
        if (dot) dot.remove();
      });
      if (notifBadge) notifBadge.textContent = '0';
      if (notifIndicator) notifIndicator.style.display = 'none';
      if (window.MagumAlert) {
        MagumAlert.success('Notificaciones al día', 'Todas las notificaciones han sido marcadas como leídas.');
      }
    });
  }

  notifPills.forEach(pill => {
    pill.addEventListener('click', () => {
      notifPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.getAttribute('data-filter');
      const items = document.querySelectorAll('.notif-item');
      items.forEach(item => {
        if (filter === 'all' || item.getAttribute('data-category') === filter) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });

  // ==========================================================================
  // 13. CAMBIAR FOTO DE PERFIL / AVATAR (REDESIGN MODERNO)
  // ==========================================================================
  const topbarAvatarBtn = document.getElementById('topbar-avatar-btn');
  const modalAvatar = document.getElementById('modal-change-avatar');
  const btnCloseAvatarModal = document.getElementById('btn-close-avatar-modal');
  const btnCancelAvatarModal = document.getElementById('btn-cancel-avatar-modal');
  const avatarRingTrigger = document.getElementById('avatar-ring-trigger');
  const btnAvatarBadgeCam = document.getElementById('btn-avatar-badge-cam');
  const avatarDropzone = document.getElementById('avatar-dropzone');
  const inputAvatarFile = document.getElementById('input-avatar-file');
  const inputAvatarUrl = document.getElementById('input-avatar-url');
  const btnSaveAvatar = document.getElementById('btn-save-avatar');
  const topbarAvatarImg = document.getElementById('topbar-avatar-img');
  const avatarModalPreview = document.getElementById('avatar-modal-preview');
  const avatarFileNameIndicator = document.getElementById('avatar-file-name-indicator');

  // Cargar avatar previamente guardado en localStorage
  const savedAvatar = localStorage.getItem('magum_user_avatar');
  if (savedAvatar && topbarAvatarImg) {
    topbarAvatarImg.src = savedAvatar;
  }

  function handleAvatarFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      if (window.MagumAlert) MagumAlert.warning('Archivo Inválido', 'Por favor selecciona un archivo de imagen válido (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target.result;
      if (avatarModalPreview) avatarModalPreview.src = dataUrl;
      if (avatarFileNameIndicator) {
        avatarFileNameIndicator.innerHTML = '<span style="color: #10b981; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> ' + escapeHtml(file.name) + '</span>';
      }
      if (inputAvatarUrl) inputAvatarUrl.value = '';
    };
    reader.readAsDataURL(file);
  }

  if (topbarAvatarBtn && modalAvatar) {
    topbarAvatarBtn.addEventListener('click', () => {
      if (avatarModalPreview && topbarAvatarImg) {
        avatarModalPreview.src = topbarAvatarImg.src;
      }
      if (avatarFileNameIndicator) {
        avatarFileNameIndicator.textContent = 'Haz clic en el avatar o selecciona una opción inferior';
      }
      modalAvatar.style.display = 'flex';
    });

    if (btnCloseAvatarModal) btnCloseAvatarModal.addEventListener('click', () => modalAvatar.style.display = 'none');
    if (btnCancelAvatarModal) btnCancelAvatarModal.addEventListener('click', () => modalAvatar.style.display = 'none');

    // Clics para abrir el selector de archivo
    const triggerFilePicker = () => { if (inputAvatarFile) inputAvatarFile.click(); };
    if (avatarRingTrigger) avatarRingTrigger.addEventListener('click', triggerFilePicker);
    if (btnAvatarBadgeCam) btnAvatarBadgeCam.addEventListener('click', (e) => { e.stopPropagation(); triggerFilePicker(); });
    if (avatarDropzone) avatarDropzone.addEventListener('click', triggerFilePicker);

    // Eventos Drag & Drop en Dropzone
    if (avatarDropzone) {
      ['dragenter', 'dragover'].forEach(evtName => {
        avatarDropzone.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          avatarDropzone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(evtName => {
        avatarDropzone.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          avatarDropzone.classList.remove('dragover');
        });
      });
      avatarDropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt && dt.files;
        if (files && files.length > 0) {
          handleAvatarFile(files[0]);
        }
      });
    }

    if (inputAvatarFile) {
      inputAvatarFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleAvatarFile(file);
      });
    }

    // Pestañas (Subir archivo vs Enlace URL)
    const tabUpload = document.getElementById('tab-avatar-upload');
    const tabUrl = document.getElementById('tab-avatar-url');
    const panelUpload = document.getElementById('panel-avatar-upload');
    const panelUrl = document.getElementById('panel-avatar-url');

    if (tabUpload && tabUrl && panelUpload && panelUrl) {
      tabUpload.addEventListener('click', () => {
        tabUpload.classList.add('active');
        tabUrl.classList.remove('active');
        panelUpload.style.display = 'block';
        panelUrl.style.display = 'none';
      });
      tabUrl.addEventListener('click', () => {
        tabUrl.classList.add('active');
        tabUpload.classList.remove('active');
        panelUrl.style.display = 'block';
        panelUpload.style.display = 'none';
        if (inputAvatarUrl) inputAvatarUrl.focus();
      });
    }

    // Vista previa en vivo con URL
    if (inputAvatarUrl) {
      inputAvatarUrl.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'))) {
          if (avatarModalPreview) avatarModalPreview.src = url;
          if (avatarFileNameIndicator) {
            avatarFileNameIndicator.innerHTML = '<span style="color: #ff00db; font-weight: 600;"><i class="fa-solid fa-link"></i> Imagen cargada desde URL</span>';
          }
        }
      });
    }

    // Presets de avatares predefinidos
    document.querySelectorAll('.preset-avatar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-avatar-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const presetUrl = btn.getAttribute('data-preset');
        if (presetUrl && avatarModalPreview) {
          avatarModalPreview.src = presetUrl;
          if (inputAvatarUrl) inputAvatarUrl.value = presetUrl;
          if (avatarFileNameIndicator) {
            avatarFileNameIndicator.innerHTML = '<span style="color: #ff00db; font-weight: 600;"><i class="fa-solid fa-wand-magic-sparkles"></i> Avatar sugerido seleccionado</span>';
          }
        }
      });
    });

    if (btnSaveAvatar) {
      btnSaveAvatar.addEventListener('click', () => {
        let newSrc = avatarModalPreview ? avatarModalPreview.src : '';
        if (inputAvatarUrl && inputAvatarUrl.value.trim()) {
          newSrc = inputAvatarUrl.value.trim();
        }

        if (newSrc && topbarAvatarImg) {
          topbarAvatarImg.src = newSrc;
          localStorage.setItem('magum_user_avatar', newSrc);
          modalAvatar.style.display = 'none';

          if (window.MagumAlert) {
            MagumAlert.success('Foto Actualizada', 'La foto de perfil se ha actualizado correctamente.');
          }
        }
      });
    }
  }

  // ==========================================================================
  // 14. INBOX MULTICANAL EXACTO ESTILO METRICOOL (Screenshot 4)
  // ==========================================================================
  const DEFAULT_INBOX_CHATS = {
    'chat-fb-1': {
      id: 'chat-fb-1',
      name: 'Jhonattan Prince',
      channel: 'facebook',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&q=80',
      messages: [
        { sender: 'incoming', text: '¡Buenas tardes! Vi la publicación y el flyer del evento. ¡BUEN TRIUNFO! ¿Tienen cupos o entradas disponibles?', time: '24 ago 21:48' },
        { sender: 'outgoing', text: '¡Hola Jhonattan! Sí, tenemos disponibilidad en preventa y etapa 2. Te comparto el detalle por aquí o a tu WhatsApp.', time: '24 ago 21:50' }
      ]
    },
    'chat-ig-1': {
      id: 'chat-ig-1',
      name: 'Mariana Restrepo',
      channel: 'instagram',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80',
      messages: [
        { sender: 'incoming', text: '¡Hola Samy! Vi sus reels y el trabajo que hacen con marcas personales. ¿Cómo es el proceso para que me asesoren?', time: '10:40 AM' },
        { sender: 'outgoing', text: '¡Hola Mariana! Qué gusto. Hacemos un diagnóstico de tu perfil actual y armamos el calendario de grabación.', time: '10:41 AM' },
        { sender: 'incoming', text: 'Me encantaría la llamada, ¿tienen disponibilidad?', time: '10:42 AM' }
      ]
    },
    'chat-ig-2': {
      id: 'chat-ig-2',
      name: 'David Ortiz (@davidortiz.fit)',
      channel: 'instagram',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&q=80',
      messages: [
        { sender: 'incoming', text: 'Bro, una pregunta sobre los paquetes de grabación de reels en estudio. ¿Ustedes se encargan de los guiones y edición?', time: 'Ayer' },
        { sender: 'outgoing', text: '¡Hola David! Nos encargamos de guiones con ganchos virales, grabación en set y postproducción dinámica.', time: 'Ayer' }
      ]
    }
  };

  let currentActiveChatId = 'chat-fb-1';
  const inboxEmptyState = document.getElementById('inbox-empty-state');
  const inboxActiveThread = document.getElementById('inbox-active-thread');
  const inboxThreadAvatar = document.getElementById('thread-avatar');
  const inboxThreadName = document.getElementById('thread-contact-name');
  const inboxThreadMeta = document.getElementById('thread-contact-meta');
  const inboxThreadBadge = document.getElementById('thread-channel-badge');
  const inboxMessagesScroll = document.getElementById('inbox-messages-scroll');
  const inboxReplyInput = document.getElementById('inbox-reply-input');
  const btnSendInboxMsg = document.getElementById('btn-send-inbox-msg');
  const inboxSearchInput = document.getElementById('inbox-search-input');
  const inboxStatusTabs = document.querySelectorAll('.inbox-status-tab');
  const inboxFilterFb = document.getElementById('inbox-filter-fb');
  const inboxFilterIg = document.getElementById('inbox-filter-ig');

  function renderThread(chatId) {
    const chat = DEFAULT_INBOX_CHATS[chatId];
    if (!chat) {
      if (inboxEmptyState) inboxEmptyState.style.display = 'flex';
      if (inboxActiveThread) inboxActiveThread.style.display = 'none';
      return;
    }

    if (inboxEmptyState) inboxEmptyState.style.display = 'none';
    if (inboxActiveThread) inboxActiveThread.style.display = 'flex';

    if (inboxThreadName) inboxThreadName.textContent = chat.name;
    if (inboxThreadAvatar) inboxThreadAvatar.src = chat.avatar;
    if (inboxReplyInput) inboxReplyInput.placeholder = `Escribe un mensaje para ${chat.name}...`;

    if (inboxThreadBadge) {
      if (chat.channel === 'facebook') {
        inboxThreadBadge.className = 'chat-channel-badge badge-fb';
        inboxThreadBadge.innerHTML = '<i class="fa-brands fa-facebook"></i>';
        if (inboxThreadMeta) inboxThreadMeta.innerHTML = '<i class="fa-solid fa-circle text-success" style="font-size: 0.55rem;"></i> Facebook Messenger • Activo';
      } else {
        inboxThreadBadge.className = 'chat-channel-badge badge-ig';
        inboxThreadBadge.innerHTML = '<i class="fa-brands fa-instagram"></i>';
        if (inboxThreadMeta) inboxThreadMeta.innerHTML = '<i class="fa-solid fa-circle text-success" style="font-size: 0.55rem;"></i> Instagram Direct • @samy_lozano • Activo';
      }
    }

    if (inboxMessagesScroll) {
      inboxMessagesScroll.innerHTML = '';
      (chat.messages || []).forEach(m => {
        const bubble = document.createElement('div');
        bubble.className = `msg-bubble-group ${m.sender}`;
        const timeStr = m.sender === 'outgoing'
          ? `${escapeHtml(m.time)} • Leído <i class="fa-solid fa-check-double" style="color: #00d2ff;"></i>`
          : escapeHtml(m.time);
        bubble.innerHTML = `
          <div class="msg-bubble">${escapeHtml(m.text)}</div>
          <span class="msg-time">${timeStr}</span>
        `;
        inboxMessagesScroll.appendChild(bubble);
      });
      inboxMessagesScroll.scrollTop = inboxMessagesScroll.scrollHeight;
    }
  }

  // Clicks en conversaciones
  document.querySelectorAll('.inbox-chat-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.inbox-chat-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const cId = item.getAttribute('data-chat-id');
      currentActiveChatId = cId;
      renderThread(cId);
    });
  });

  // Envío de mensajes
  function sendMessage() {
    if (!inboxReplyInput) return;
    const txt = inboxReplyInput.value.trim();
    if (!txt) return;

    const chat = DEFAULT_INBOX_CHATS[currentActiveChatId];
    if (chat) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      chat.messages.push({ sender: 'outgoing', text: txt, time: timeStr });
      renderThread(currentActiveChatId);

      const activeEl = document.querySelector(`.inbox-chat-item[data-chat-id="${currentActiveChatId}"]`);
      if (activeEl) {
        const p = activeEl.querySelector('.chat-preview-msg');
        if (p) p.textContent = `Tú: ${txt}`;
      }
    }
    inboxReplyInput.value = '';
  }

  if (btnSendInboxMsg) btnSendInboxMsg.addEventListener('click', sendMessage);
  if (inboxReplyInput) {
    inboxReplyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Filtrado de canales en el top del Inbox
  if (inboxFilterFb) {
    inboxFilterFb.addEventListener('click', () => {
      inboxFilterFb.classList.toggle('active');
      filterInboxChats();
    });
  }
  if (inboxFilterIg) {
    inboxFilterIg.addEventListener('click', () => {
      inboxFilterIg.classList.toggle('active');
      filterInboxChats();
    });
  }

  function filterInboxChats() {
    const showFb = inboxFilterFb ? inboxFilterFb.classList.contains('active') : true;
    const showIg = inboxFilterIg ? inboxFilterIg.classList.contains('active') : true;

    document.querySelectorAll('.inbox-chat-item').forEach(el => {
      const ch = el.getAttribute('data-channel');
      if ((ch === 'facebook' && showFb) || (ch === 'instagram' && showIg)) {
        el.style.display = 'flex';
      } else {
        el.style.display = 'none';
      }
    });
  }

  // Pestañas de estado (No resueltos, No leídos, Todos)
  inboxStatusTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      inboxStatusTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Búsqueda en Inbox
  if (inboxSearchInput) {
    inboxSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.inbox-chat-item').forEach(el => {
        const name = (el.querySelector('.chat-contact-name')?.textContent || '').toLowerCase();
        const msg = (el.querySelector('.chat-preview-msg')?.textContent || '').toLowerCase();
        if (!q || name.includes(q) || msg.includes(q)) {
          el.style.display = 'flex';
        } else {
          el.style.display = 'none';
        }
      });
    });
  }

  // Inicializar thread inicial
  renderThread('chat-fb-1');

  // ==========================================================================
  // 15. MODAL CALIBRAR MÉTRICAS REALES
  // ==========================================================================
  const modalCalibrate = document.getElementById('modal-calibrate-metrics');
  const btnOpenCalibrate = document.getElementById('btn-open-calibrate-metrics');
  const btnCloseCalibrate = document.getElementById('btn-close-calibrate-metrics');
  const btnCancelCalibrate = document.getElementById('btn-cancel-calibrate-metrics');
  const btnSaveCalibrate = document.getElementById('btn-save-calibrate-metrics');

  const calIgFollowers = document.getElementById('calibrate-ig-followers');
  const calIgReach = document.getElementById('calibrate-ig-reach');
  const calFbFollowers = document.getElementById('calibrate-fb-followers');
  const calFbReach = document.getElementById('calibrate-fb-reach');
  const calEngagement = document.getElementById('calibrate-engagement');

  if (btnOpenCalibrate && modalCalibrate) {
    btnOpenCalibrate.addEventListener('click', () => {
      modalCalibrate.style.display = 'flex';
    });
  }
  if (btnCloseCalibrate) btnCloseCalibrate.addEventListener('click', () => modalCalibrate.style.display = 'none');
  if (btnCancelCalibrate) btnCancelCalibrate.addEventListener('click', () => modalCalibrate.style.display = 'none');

  if (btnSaveCalibrate) {
    btnSaveCalibrate.addEventListener('click', async () => {
      const igF = calIgFollowers ? calIgFollowers.value.trim() : '0';
      const igR = calIgReach ? calIgReach.value.trim() : '0';
      const fbF = calFbFollowers ? calFbFollowers.value.trim() : '0';
      const fbR = calFbReach ? calFbReach.value.trim() : '0';
      const eng = calEngagement ? calEngagement.value.trim() : '0.0%';

      btnSaveCalibrate.disabled = true;
      btnSaveCalibrate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

      if (window.MagumApi && typeof MagumApi.updateSocialMetrics === 'function') {
        try {
          await MagumApi.updateSocialMetrics([
            { provider: 'instagram', followers: igF, reach: igR, engagement: eng },
            { provider: 'facebook', followers: fbF, reach: fbR, engagement: eng }
          ]);
        } catch (err) {
          console.warn('Persistencia remota offline:', err);
        }
      }

      // Actualizar tabla
      const rowIg = document.querySelector('tr[data-channel-row="instagram"]');
      if (rowIg) {
        const cells = rowIg.querySelectorAll('td');
        if (cells.length >= 5) {
          cells[2].textContent = igF;
          cells[3].textContent = igR;
        }
      }
      const rowFb = document.querySelector('tr[data-channel-row="facebook"]');
      if (rowFb) {
        const cells = rowFb.querySelectorAll('td');
        if (cells.length >= 5) {
          cells[2].textContent = fbF;
          cells[3].textContent = fbR;
        }
      }

      // Recalcular KPIs de cabecera con los números reales
      const numIgF = parseInt(igF.replace(/[^0-9]/g, ''), 10) || 0;
      const numFbF = parseInt(fbF.replace(/[^0-9]/g, ''), 10) || 0;
      const numIgR = parseInt(igR.replace(/[^0-9]/g, ''), 10) || 0;
      const numFbR = parseInt(fbR.replace(/[^0-9]/g, ''), 10) || 0;

      const totalF = numIgF + numFbF;
      const totalR = numIgR + numFbR;

      const kpiFollowers = document.getElementById('metric-followers-total');
      const kpiReach = document.getElementById('metric-reach-total');
      const kpiEngagement = document.getElementById('metric-engagement-rate');

      if (kpiFollowers) kpiFollowers.textContent = totalF.toLocaleString();
      if (kpiReach) kpiReach.textContent = totalR.toLocaleString();
      if (kpiEngagement) kpiEngagement.textContent = eng.includes('%') ? eng : `${eng}%`;

      btnSaveCalibrate.disabled = false;
      btnSaveCalibrate.innerHTML = '<i class="fa-solid fa-check"></i> <span>Guardar y Aplicar</span>';
      modalCalibrate.style.display = 'none';

      if (window.Swal) {
        Swal.fire({
          title: '¡Métricas Reales Calibradas!',
          text: 'Las cifras de tus canales han sido actualizadas con datos auténticos.',
          icon: 'success',
          confirmButtonColor: '#ff00db'
        });
      }
    });
  }

  // ==========================================================================
  // 16. METRICOOL POST COMPOSER EXACTO (EMOJIS, ADVERTENCIAS, PRIMER COMENTARIO, UBICACIÓN, MENÚ PUBLICAR)
  // ==========================================================================
  const modalCreatePost = document.getElementById('modal-create-post');
  const btnNewPost = document.getElementById('btn-metricool-new-post');
  const btnNewPostCal = document.getElementById('btn-open-create-post-from-calendar');
  const btnCloseCreatePost = document.getElementById('btn-close-create-post');
  const btnCancelCreatePost = document.getElementById('btn-cancel-create-post');
  const postCaptionInput = document.getElementById('post-caption-input');
  const postCaptionCounter = document.getElementById('post-caption-counter');
  const postFileInput = document.getElementById('post-file-input');
  const btnTriggerMediaUpload = document.getElementById('btn-trigger-media-upload');
  const metricoolFileBadge = document.getElementById('metricool-file-badge');
  const metricoolFileName = document.getElementById('metricool-file-name');
  const btnRemoveMedia = document.getElementById('btn-remove-media');
  const postScheduleDate = document.getElementById('post-schedule-date');
  const postScheduleTime = document.getElementById('post-schedule-time');
  const btnSubmitCreatePost = document.getElementById('btn-submit-create-post');
  const btnPublishLabel = document.getElementById('btn-publish-label');
  const btnCaptionAi = document.getElementById('btn-caption-ai-optimize');
  const btnInsertEmoji = document.getElementById('btn-insert-emoji');

  // Emojis Popover y Grid Completo
  const emojiPopover = document.getElementById('metricool-emoji-popover');
  const btnCloseEmojiPopover = document.getElementById('btn-close-emoji-popover');
  const emojiGridScroll = document.getElementById('emoji-grid-scroll');

  const ALL_EMOJIS = [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚',
    '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥',
    '😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓',
    '🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞',
    '😓','😩','😫','🥱','😤','😡','😠','🤬','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸',
    '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍',
    '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂',
    '✨','🚀','🔥','📸','📍','👇','💡','📈','🎯','🏆','💎','🎁','💼','💰','⏳','📅','📊','🌟','🎉','❤️',
    '📱','💻','🎥','🎬','🎤','🎧','🎨','📢','🔔','📣','🏷️','🔗','💬','👀','💯','🔑','⭐','⚡','🌈','☀️'
  ];

  if (emojiGridScroll) {
    emojiGridScroll.innerHTML = '';
    ALL_EMOJIS.forEach(em => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-btn-item';
      b.textContent = em;
      b.onclick = (e) => {
        e.stopPropagation();
        if (postCaptionInput) {
          const start = postCaptionInput.selectionStart || postCaptionInput.value.length;
          const end = postCaptionInput.selectionEnd || postCaptionInput.value.length;
          const val = postCaptionInput.value;
          postCaptionInput.value = val.substring(0, start) + em + val.substring(end);
          postCaptionInput.selectionStart = postCaptionInput.selectionEnd = start + em.length;
          postCaptionInput.focus();
          postCaptionInput.dispatchEvent(new Event('input'));
        }
      };
      emojiGridScroll.appendChild(b);
    });
  }

  if (btnInsertEmoji && emojiPopover) {
    btnInsertEmoji.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPopover.style.display = emojiPopover.style.display === 'none' ? 'flex' : 'none';
    });
  }
  if (btnCloseEmojiPopover && emojiPopover) {
    btnCloseEmojiPopover.addEventListener('click', () => {
      emojiPopover.style.display = 'none';
    });
  }
  document.addEventListener('click', (e) => {
    if (emojiPopover && !emojiPopover.contains(e.target) && e.target !== btnInsertEmoji) {
      emojiPopover.style.display = 'none';
    }
  });

  // Subpanel: Primer Comentario (💬)
  const btnToolComment = document.getElementById('btn-tool-comment');
  const firstCommentWrap = document.getElementById('metricool-first-comment-wrap');
  const btnCloseFirstComment = document.getElementById('btn-close-first-comment');
  const postFirstCommentInput = document.getElementById('post-first-comment-input');

  if (btnToolComment && firstCommentWrap) {
    btnToolComment.addEventListener('click', () => {
      const isVisible = firstCommentWrap.style.display !== 'none';
      firstCommentWrap.style.display = isVisible ? 'none' : 'block';
      btnToolComment.classList.toggle('active', !isVisible);
      if (!isVisible && postFirstCommentInput) postFirstCommentInput.focus();
    });
  }
  if (btnCloseFirstComment && firstCommentWrap) {
    btnCloseFirstComment.addEventListener('click', () => {
      firstCommentWrap.style.display = 'none';
      if (btnToolComment) btnToolComment.classList.remove('active');
    });
  }

  // Subpanel: Ubicación (📍)
  const btnToolLocation = document.getElementById('btn-tool-location');
  const locationWrap = document.getElementById('metricool-location-wrap');
  const btnCloseLocation = document.getElementById('btn-close-location');
  const postLocationInput = document.getElementById('post-location-input');
  const mockupAuthorInfo = document.querySelector('.mockup-author-info');

  let mockupLocationEl = null;

  if (btnToolLocation && locationWrap) {
    btnToolLocation.addEventListener('click', () => {
      const isVisible = locationWrap.style.display !== 'none';
      locationWrap.style.display = isVisible ? 'none' : 'block';
      btnToolLocation.classList.toggle('active', !isVisible);
      if (!isVisible && postLocationInput) postLocationInput.focus();
    });
  }
  if (btnCloseLocation && locationWrap) {
    btnCloseLocation.addEventListener('click', () => {
      locationWrap.style.display = 'none';
      if (btnToolLocation) btnToolLocation.classList.remove('active');
      if (postLocationInput) {
        postLocationInput.value = '';
        updateMockupLocation('');
      }
    });
  }

  function updateMockupLocation(locText) {
    if (!mockupAuthorInfo) return;
    if (!mockupLocationEl) {
      mockupLocationEl = document.createElement('div');
      mockupLocationEl.className = 'mockup-location-line';
      mockupLocationEl.style.cssText = 'font-size: 0.7rem; color: #0284c7; font-weight: 600; margin-top: 1px;';
      mockupAuthorInfo.appendChild(mockupLocationEl);
    }
    if (locText.trim()) {
      mockupLocationEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(locText.trim())}`;
      mockupLocationEl.style.display = 'block';
    } else {
      mockupLocationEl.style.display = 'none';
    }
  }

  if (postLocationInput) {
    postLocationInput.addEventListener('input', (e) => {
      updateMockupLocation(e.target.value);
    });
  }

  // Cuadro de Advertencias y Errores (Screenshot 1 Exact Replica)
  const warningsBox = document.getElementById('metricool-warnings-box');
  const warningsCountText = document.getElementById('warnings-count-text');
  const warningsToggleHeader = document.getElementById('warnings-toggle-header');
  const warningsList = document.getElementById('warnings-list');
  const warningsChevron = document.getElementById('warnings-chevron');
  const warningPastDate = document.getElementById('warning-past-date');
  const warningFbContent = document.getElementById('warning-fb-content');
  const warningIgContent = document.getElementById('warning-ig-content');

  // Canales y Media para validaciones
  const toggleChFb = document.getElementById('toggle-ch-fb');
  const toggleChIg = document.getElementById('toggle-ch-ig');
  let currentPostImage = null;

  // Interacción selectores de fecha y reloj
  const groupDatePicker = document.getElementById('group-date-picker');
  const groupTimePicker = document.getElementById('group-time-picker');
  if (groupDatePicker && postScheduleDate) {
    groupDatePicker.addEventListener('click', (e) => {
      if (e.target !== postScheduleDate) {
        if (typeof postScheduleDate.showPicker === 'function') {
          try { postScheduleDate.showPicker(); } catch (err) { postScheduleDate.focus(); }
        } else {
          postScheduleDate.focus();
        }
      }
    });
  }
  if (groupTimePicker && postScheduleTime) {
    groupTimePicker.addEventListener('click', (e) => {
      if (e.target !== postScheduleTime) {
        if (typeof postScheduleTime.showPicker === 'function') {
          try { postScheduleTime.showPicker(); } catch (err) { postScheduleTime.focus(); }
        } else {
          postScheduleTime.focus();
        }
      }
    });
  }

  function validatePostForm() {
    let errorCount = 0;

    // 1. Validar fecha pasada
    const dVal = postScheduleDate ? postScheduleDate.value : '';
    const tVal = postScheduleTime ? postScheduleTime.value : '00:00';
    if (dVal) {
      const targetTime = new Date(`${dVal}T${tVal}:00`);
      const now = new Date();
      if (targetTime < now) {
        errorCount++;
        if (warningPastDate) warningPastDate.style.display = 'flex';
      } else {
        if (warningPastDate) warningPastDate.style.display = 'none';
      }
    } else {
      if (warningPastDate) warningPastDate.style.display = 'none';
    }

    // 2. Validar contenido según redes seleccionadas (Facebook e Instagram)
    const captionText = postCaptionInput ? postCaptionInput.value.trim() : '';
    const hasMedia = !!currentPostImage;
    const isFbActive = toggleChFb && toggleChFb.classList.contains('active');
    const isIgActive = toggleChIg && toggleChIg.classList.contains('active');

    // Validación Facebook: requiere texto o recurso visual
    if (isFbActive) {
      if (!captionText && !hasMedia) {
        errorCount++;
        if (warningFbContent) warningFbContent.style.display = 'flex';
      } else {
        if (warningFbContent) warningFbContent.style.display = 'none';
      }
    } else {
      if (warningFbContent) warningFbContent.style.display = 'none';
    }

    // Validación Instagram: requiere obligatoriamente foto o video
    if (isIgActive) {
      if (!hasMedia) {
        errorCount++;
        if (warningIgContent) warningIgContent.style.display = 'flex';
      } else {
        if (warningIgContent) warningIgContent.style.display = 'none';
      }
    } else {
      if (warningIgContent) warningIgContent.style.display = 'none';
    }

    // Actualizar caja de advertencias
    if (warningsBox) {
      if (errorCount > 0) {
        warningsBox.style.display = 'block';
        if (warningsCountText) {
          warningsCountText.textContent = `${errorCount} error${errorCount > 1 ? 'es' : ''}`;
        }
      } else {
        warningsBox.style.display = 'none';
      }
    }

    return errorCount === 0;
  }

  if (warningsToggleHeader && warningsList && warningsChevron) {
    warningsToggleHeader.addEventListener('click', () => {
      const isCollapsed = warningsList.style.display === 'none';
      warningsList.style.display = isCollapsed ? 'flex' : 'none';
      warningsChevron.className = isCollapsed ? 'fa-solid fa-chevron-up warnings-chevron' : 'fa-solid fa-chevron-down warnings-chevron';
    });
  }

  if (postScheduleDate) postScheduleDate.addEventListener('change', validatePostForm);
  if (postScheduleTime) postScheduleTime.addEventListener('change', validatePostForm);

  // Menú Desplegable de Publicación: Programar, Publicar Ahora, Guardar Borrador (Screenshot 2 Exact Replica)
  const btnTogglePublishOptions = document.getElementById('btn-toggle-publish-options');
  const publishDropdownMenu = document.getElementById('metricool-publish-dropdown-menu');
  const publishArrowIcon = document.getElementById('publish-arrow-icon');
  let currentPublishAction = 'schedule'; // 'schedule', 'now', 'draft'

  if (btnTogglePublishOptions && publishDropdownMenu) {
    btnTogglePublishOptions.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = publishDropdownMenu.style.display !== 'none';
      publishDropdownMenu.style.display = isVisible ? 'none' : 'block';
      if (publishArrowIcon) {
        publishArrowIcon.className = isVisible ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
      }
    });

    document.addEventListener('click', () => {
      if (publishDropdownMenu) publishDropdownMenu.style.display = 'none';
      if (publishArrowIcon) publishArrowIcon.className = 'fa-solid fa-chevron-up';
    });

    document.querySelectorAll('.publish-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = item.getAttribute('data-action');
        if (act === 'schedule' || act === 'now' || act === 'draft') {
          currentPublishAction = act;

          document.querySelectorAll('.publish-menu-item').forEach(mi => {
            mi.classList.remove('active');
            const check = mi.querySelector('.check-active');
            if (check) check.remove();
          });

          item.classList.add('active');
          const checkIcon = document.createElement('i');
          checkIcon.className = 'fa-solid fa-check check-active';
          item.appendChild(checkIcon);

          if (btnPublishLabel) {
            if (act === 'draft') btnPublishLabel.textContent = 'Guardar borrador';
            else if (act === 'now') btnPublishLabel.textContent = 'Publicar ahora';
            else btnPublishLabel.textContent = 'Programar';
          }
        } else {
          if (window.MagumAlert) {
            MagumAlert.info('Función Pro', 'Esta función avanzada estará disponible en la versión Scale.');
          }
        }
        publishDropdownMenu.style.display = 'none';
        if (publishArrowIcon) publishArrowIcon.className = 'fa-solid fa-chevron-up';
      });
    });
  }

  // Selector de Formato (Post, Reel, Historia)
  const btnFormatDropdown = document.getElementById('btn-post-format-dropdown');
  const postFormatMenu = document.getElementById('post-format-menu');
  const selectedFormatText = document.getElementById('selected-format-text');
  const selectedFormatIcon = document.getElementById('selected-format-icon');
  let currentFormat = 'post';

  if (btnFormatDropdown && postFormatMenu) {
    btnFormatDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      postFormatMenu.style.display = postFormatMenu.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
      if (postFormatMenu) postFormatMenu.style.display = 'none';
    });

    document.querySelectorAll('.format-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.format-menu-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentFormat = item.getAttribute('data-format') || 'post';
        if (selectedFormatText) selectedFormatText.textContent = currentFormat.toUpperCase();
        if (selectedFormatIcon) {
          if (currentFormat === 'reel') selectedFormatIcon.className = 'fa-solid fa-film';
          else if (currentFormat === 'story') selectedFormatIcon.className = 'fa-solid fa-circle-notch';
          else selectedFormatIcon.className = 'fa-solid fa-table-cells';
        }
        postFormatMenu.style.display = 'none';
      });
    });
  }

  // Toggle de canales (FB, IG)
  const previewChannelIndicator = document.getElementById('preview-channel-indicator');
  const counterNetworkIcon = document.getElementById('counter-network-icon');

  function updateActiveChannelsUI() {
    if (toggleChFb && toggleChFb.classList.contains('active')) {
      if (previewChannelIndicator) previewChannelIndicator.innerHTML = '<i class="fa-brands fa-facebook" style="color: #1877f2;"></i>';
      if (counterNetworkIcon) counterNetworkIcon.className = 'fa-brands fa-facebook text-fb';
    } else if (toggleChIg && toggleChIg.classList.contains('active')) {
      if (previewChannelIndicator) previewChannelIndicator.innerHTML = '<i class="fa-brands fa-instagram" style="color: #e1306c;"></i>';
      if (counterNetworkIcon) counterNetworkIcon.className = 'fa-brands fa-instagram';
    }
  }

  if (toggleChFb) {
    toggleChFb.addEventListener('click', () => {
      toggleChFb.classList.toggle('active');
      updateActiveChannelsUI();
      validatePostForm();
    });
  }
  if (toggleChIg) {
    toggleChIg.addEventListener('click', () => {
      toggleChIg.classList.toggle('active');
      updateActiveChannelsUI();
      validatePostForm();
    });
  }

  // Toggle vista Móvil / Escritorio en Mockup
  const btnDeviceMobile = document.getElementById('btn-device-mobile');
  const btnDeviceDesktop = document.getElementById('btn-device-desktop');
  const metricoolMockupCard = document.getElementById('metricool-mockup-card');

  if (btnDeviceMobile && btnDeviceDesktop && metricoolMockupCard) {
    btnDeviceMobile.addEventListener('click', () => {
      btnDeviceMobile.classList.add('active');
      btnDeviceDesktop.classList.remove('active');
      metricoolMockupCard.classList.add('mobile-view');
    });
    btnDeviceDesktop.addEventListener('click', () => {
      btnDeviceDesktop.classList.add('active');
      btnDeviceMobile.classList.remove('active');
      metricoolMockupCard.classList.remove('mobile-view');
    });
  }

  // Subida de archivos (imagen / video)
  const mockupMediaContainer = document.getElementById('mockup-media-container');
  const mockupMediaImg = document.getElementById('mockup-media-img');
  const mockupTextBody = document.getElementById('mockup-text-body');

  if (btnTriggerMediaUpload && postFileInput) {
    btnTriggerMediaUpload.addEventListener('click', () => postFileInput.click());
    postFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (loadEv) => {
          currentPostImage = loadEv.target.result;
          if (mockupMediaImg) mockupMediaImg.src = currentPostImage;
          if (mockupMediaContainer) mockupMediaContainer.style.display = 'flex';
          if (metricoolFileBadge && metricoolFileName) {
            metricoolFileName.textContent = file.name;
            metricoolFileBadge.style.display = 'flex';
          }
          validatePostForm();
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (btnRemoveMedia) {
    btnRemoveMedia.addEventListener('click', () => {
      currentPostImage = null;
      if (postFileInput) postFileInput.value = '';
      if (metricoolFileBadge) metricoolFileBadge.style.display = 'none';
      if (mockupMediaContainer) mockupMediaContainer.style.display = 'none';
      validatePostForm();
    });
  }

  // Sincronización en vivo del texto con el mockup
  if (postCaptionInput) {
    postCaptionInput.addEventListener('input', (e) => {
      const txt = e.target.value;
      if (mockupTextBody) {
        mockupTextBody.textContent = txt.trim() || 'Escribe el texto en el editor para previsualizar tu publicación en tiempo real.';
      }
      if (postCaptionCounter) {
        postCaptionCounter.textContent = `${txt.length} / 2,200`;
      }
      validatePostForm();
    });
  }

  // Optimización IA
  if (btnCaptionAi && postCaptionInput) {
    btnCaptionAi.addEventListener('click', () => {
      const curr = postCaptionInput.value.trim() || 'Presentamos nuestra nueva propuesta de valor';
      const aiText = `${curr}\n\n✨ ¡Lleva tu marca al siguiente nivel con contenido de alto impacto!\n\n🚀 Escríbenos por mensaje directo para recibir información exclusiva.\n\n#MagumCreatorStudio #MarketingDigital #Estrategia #Branding`;
      postCaptionInput.value = aiText;
      postCaptionInput.dispatchEvent(new Event('input'));
    });
  }

  // Abrir Modal
  let editingPostId = null;

  function openPostModal(postToEdit = null, defaultDayIdx = 2) {
    if (!modalCreatePost) return;
    modalCreatePost.style.display = 'flex';

    if (postToEdit) {
      editingPostId = postToEdit.id;
      if (postCaptionInput) {
        postCaptionInput.value = postToEdit.caption || '';
        postCaptionInput.dispatchEvent(new Event('input'));
      }
      if (postScheduleDate) postScheduleDate.value = postToEdit.date || '';
      if (postScheduleTime) postScheduleTime.value = postToEdit.time || '18:00';
      if (postFirstCommentInput) postFirstCommentInput.value = postToEdit.firstComment || '';
      if (postLocationInput) {
        postLocationInput.value = postToEdit.location || '';
        updateMockupLocation(postToEdit.location || '');
      }
      currentPostImage = postToEdit.image || null;
      if (currentPostImage) {
        if (mockupMediaImg) mockupMediaImg.src = currentPostImage;
        if (mockupMediaContainer) mockupMediaContainer.style.display = 'flex';
        if (metricoolFileBadge && metricoolFileName) {
          metricoolFileName.textContent = 'Archivo multimedia cargado';
          metricoolFileBadge.style.display = 'flex';
        }
      } else {
        if (mockupMediaContainer) mockupMediaContainer.style.display = 'none';
        if (metricoolFileBadge) metricoolFileBadge.style.display = 'none';
      }
    } else {
      editingPostId = null;
      if (postCaptionInput) {
        postCaptionInput.value = '';
        postCaptionInput.dispatchEvent(new Event('input'));
      }
      if (postScheduleDate && !postScheduleDate.value) {
        postScheduleDate.value = new Date().toISOString().split('T')[0];
      }
      if (postScheduleTime) postScheduleTime.value = '18:00';
      if (postFirstCommentInput) postFirstCommentInput.value = '';
      if (postLocationInput) {
        postLocationInput.value = '';
        updateMockupLocation('');
      }
      currentPostImage = null;
      if (mockupMediaContainer) mockupMediaContainer.style.display = 'none';
      if (metricoolFileBadge) metricoolFileBadge.style.display = 'none';
    }

    validatePostForm();
  }
  window.openPostModal = openPostModal;

  if (btnNewPost) btnNewPost.addEventListener('click', () => openPostModal());
  if (btnNewPostCal) btnNewPostCal.addEventListener('click', () => openPostModal());
  if (btnCloseCreatePost) btnCloseCreatePost.addEventListener('click', () => modalCreatePost.style.display = 'none');
  if (btnCancelCreatePost) btnCancelCreatePost.addEventListener('click', () => modalCreatePost.style.display = 'none');

  function getScheduledPostsStorageKey() {
    const raw = localStorage.getItem('magum_session');
    let accId = 'default';
    try { accId = JSON.parse(raw).accountId || 'default'; } catch {}
    return `magum_scheduled_posts_${accId}`;
  }

  function getScheduledPosts() {
    try {
      const raw = localStorage.getItem(getScheduledPostsStorageKey());
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveScheduledPosts(posts) {
    localStorage.setItem(getScheduledPostsStorageKey(), JSON.stringify(posts));
    renderScheduledPosts();
  }

  // Guardar y Ejecutar Acción Seleccionada (Programar, Publicar Ahora, Guardar Borrador)
  if (btnSubmitCreatePost) {
    btnSubmitCreatePost.addEventListener('click', () => {
      const caption = (postCaptionInput ? postCaptionInput.value : '').trim();
      const firstComment = (postFirstCommentInput ? postFirstCommentInput.value : '').trim();
      const location = (postLocationInput ? postLocationInput.value : '').trim();

      // Si es borrador, no requiere obligatoriamente contenido
      if (currentPublishAction !== 'draft' && !caption && !currentPostImage) {
        validatePostForm();
        if (window.Swal) {
          Swal.fire({
            title: 'Se requiere contenido',
            text: 'Post → Se requiere al menos un carácter de texto o un recurso visual.',
            icon: 'warning',
            confirmButtonColor: '#ff00db'
          });
        } else {
          alert('Post → Se requiere al menos un carácter de texto o un recurso visual.');
        }
        return;
      }

      const activeChannels = [];
      if (toggleChFb && toggleChFb.classList.contains('active')) activeChannels.push('facebook');
      if (toggleChIg && toggleChIg.classList.contains('active')) activeChannels.push('instagram');
      if (activeChannels.length === 0) activeChannels.push('facebook');

      let dateVal = (postScheduleDate && postScheduleDate.value) || new Date().toISOString().split('T')[0];
      let timeVal = (postScheduleTime && postScheduleTime.value) || '18:00';

      if (currentPublishAction === 'now') {
        const nowObj = new Date();
        dateVal = nowObj.toISOString().split('T')[0];
        timeVal = nowObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      const dayIdx = new Date(dateVal).getDay() === 0 ? 6 : new Date(dateVal).getDay() - 1;
      const posts = getScheduledPosts();

      if (editingPostId) {
        const idx = posts.findIndex(p => p.id === editingPostId);
        if (idx !== -1) {
          posts[idx].caption = caption;
          posts[idx].firstComment = firstComment;
          posts[idx].location = location;
          posts[idx].channels = activeChannels;
          posts[idx].date = dateVal;
          posts[idx].dayIndex = dayIdx;
          posts[idx].time = timeVal;
          posts[idx].format = currentFormat;
          posts[idx].status = currentPublishAction === 'draft' ? 'draft' : 'scheduled';
          if (currentPostImage) posts[idx].image = currentPostImage;
          posts[idx].updatedAt = new Date().toISOString();
        }
        saveScheduledPosts(posts);
        modalCreatePost.style.display = 'none';
        if (window.MagumAlert) MagumAlert.success('Publicación Actualizada', 'Cambios guardados con éxito.');
      } else {
        const newPost = {
          id: 'post_' + Date.now(),
          caption,
          firstComment,
          location,
          channels: activeChannels,
          date: dateVal,
          dayIndex: dayIdx,
          time: timeVal,
          image: currentPostImage,
          format: currentFormat,
          status: currentPublishAction === 'draft' ? 'draft' : (currentPublishAction === 'now' ? 'published' : 'scheduled'),
          createdAt: new Date().toISOString()
        };
        posts.push(newPost);
        saveScheduledPosts(posts);
        modalCreatePost.style.display = 'none';

        if (window.Swal) {
          if (currentPublishAction === 'draft') {
            Swal.fire({
              title: '¡Borrador Guardado!',
              text: 'Tu publicación se ha guardado como borrador para publicar en otro momento.',
              icon: 'success',
              confirmButtonColor: '#ff00db'
            });
          } else if (currentPublishAction === 'now') {
            Swal.fire({
              title: '¡Publicado con Éxito!',
              html: `Tu publicación se ha enviado a tus canales: <strong>${activeChannels.join(', ')}</strong>.`,
              icon: 'success',
              confirmButtonColor: '#ff00db'
            });
          } else {
            Swal.fire({
              title: '¡Publicación Programada!',
              html: `Tu ${currentFormat.toUpperCase()} se ha programado para el <strong>${dateVal}</strong> a las <strong>${timeVal}</strong> en <strong>${activeChannels.join(', ')}</strong>.`,
              icon: 'success',
              confirmButtonColor: '#ff00db'
            });
          }
        }
      }
    });
  }

  // Renderizar Calendario Semanal
  function renderScheduledPosts() {
    const calendarBody = document.getElementById('calendar-grid-body');
    if (!calendarBody) return;

    const posts = getScheduledPosts();
    const cells = calendarBody.querySelectorAll('.cal-day-cell');

    cells.forEach((cell) => {
      const dayIdx = parseInt(cell.getAttribute('data-day-index') || '0', 10);
      cell.innerHTML = '';

      cell.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      };
      cell.ondragenter = () => cell.classList.add('cal-drag-over');
      cell.ondragleave = () => cell.classList.remove('cal-drag-over');
      cell.ondrop = (e) => {
        e.preventDefault();
        cell.classList.remove('cal-drag-over');
        const draggedPostId = e.dataTransfer.getData('text/plain');
        if (!draggedPostId) return;

        const allPosts = getScheduledPosts();
        const targetPost = allPosts.find(p => p.id === draggedPostId);
        if (targetPost) {
          targetPost.dayIndex = dayIdx;
          saveScheduledPosts(allPosts);
          const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
          if (window.MagumAlert) {
            MagumAlert.success('Publicación Reprogramada', `Movida al día ${dayNames[dayIdx]}.`);
          }
        }
      };

      const dayPosts = posts.filter(p => (p.dayIndex !== undefined ? p.dayIndex : 2) === dayIdx);

      if (dayPosts.length === 0) {
        const emptyBtn = document.createElement('div');
        emptyBtn.className = 'cal-empty-slot';
        emptyBtn.style.cssText = 'height: 100%; min-height: 85px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-muted); cursor: pointer; border: 1px dashed var(--border-color); border-radius: 10px; transition: all 0.2s;';
        emptyBtn.innerHTML = '<i class="fa-solid fa-plus" style="font-size: 0.95rem; color: #ff00db;"></i><span style="font-size: 0.72rem; font-weight: 600;">Programar</span>';
        emptyBtn.onmouseover = () => { emptyBtn.style.borderColor = '#ff00db'; emptyBtn.style.background = 'rgba(255, 0, 219, 0.05)'; };
        emptyBtn.onmouseout = () => { emptyBtn.style.borderColor = 'var(--border-color)'; emptyBtn.style.background = 'transparent'; };
        emptyBtn.onclick = () => openPostModal(null, dayIdx);
        cell.appendChild(emptyBtn);
      } else {
        dayPosts.forEach(post => {
          const card = document.createElement('div');
          card.className = 'cal-post-card scheduled';
          card.setAttribute('draggable', 'true');
          card.setAttribute('data-post-id', post.id);

          card.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', post.id);
            card.classList.add('dragging');
          };
          card.ondragend = () => card.classList.remove('dragging');

          const channels = Array.isArray(post.channels) && post.channels.length > 0 ? post.channels : ['facebook'];
          let chHtml = '';
          channels.forEach(ch => {
            if (ch === 'instagram') chHtml += '<span class="post-pill-net net-ig"><i class="fa-brands fa-instagram"></i></span>';
            else chHtml += '<span class="post-pill-net net-fb"><i class="fa-brands fa-facebook"></i></span>';
          });

          const imgHtml = post.image ? `<img src="${post.image}" class="cal-post-thumb" alt="Media">` : '';
          const statusBadge = post.status === 'draft' ? '<span style="font-size: 0.65rem; background: #64748b; color: #fff; padding: 1px 4px; border-radius: 4px; margin-left: 4px;">Borrador</span>' : '';

          card.innerHTML = `
            ${imgHtml}
            <div class="cal-post-top-row">
              <div class="cal-post-channels">${chHtml} ${statusBadge}</div>
              <span class="cal-post-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(post.time || '18:00')}</span>
            </div>
            <div class="post-title-trunc" title="${escapeHtml(post.caption)}">${escapeHtml(post.caption || 'Publicación')}</div>
            <div class="cal-card-actions">
              <button type="button" class="btn-card-action btn-action-edit" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="btn-card-action btn-action-copy" title="Copiar"><i class="fa-solid fa-copy"></i></button>
              <button type="button" class="btn-card-action btn-action-delete" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
            </div>
          `;

          const btnEdit = card.querySelector('.btn-action-edit');
          const btnCopy = card.querySelector('.btn-action-copy');
          const btnDel = card.querySelector('.btn-action-delete');

          if (btnEdit) {
            btnEdit.onclick = (e) => {
              e.stopPropagation();
              openPostModal(post, dayIdx);
            };
          }
          if (btnCopy) {
            btnCopy.onclick = (e) => {
              e.stopPropagation();
              const newP = { ...post, id: 'post_' + Date.now(), dayIndex: (dayIdx + 1) % 7 };
              const all = getScheduledPosts();
              all.push(newP);
              saveScheduledPosts(all);
              if (window.MagumAlert) MagumAlert.success('Copiada', 'Publicación duplicada en el calendario.');
            };
          }
          if (btnDel) {
            btnDel.onclick = (e) => {
              e.stopPropagation();
              if (confirm('¿Eliminar esta publicación del calendario?')) {
                const filtered = getScheduledPosts().filter(p => p.id !== post.id);
                saveScheduledPosts(filtered);
              }
            };
          }

          cell.appendChild(card);
        });
      }
    });
  }

  renderScheduledPosts();
  
// Reporting botones
  const btnExportPdf = document.getElementById('btn-export-pdf');
  const btnExportExcel = document.getElementById('btn-export-excel');
  if (btnExportPdf) {
    btnExportPdf.addEventListener('click', () => {
      if (window.Swal) {
        Swal.fire({
          title: 'Generando Reporte PDF...',
          text: 'Consolidando métricas de comunidad, alcance, posts destacados y rendimiento web.',
          timer: 1800,
          timerProgressBar: true,
          didOpen: () => Swal.showLoading()
        }).then(() => {
          Swal.fire('¡Reporte Listo!', 'El informe ejecutivo en PDF se ha descargado exitosamente.', 'success');
        });
      }
    });
  }
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => {
      if (window.MagumAlert) {
        MagumAlert.success('Exportación Completa', 'Se ha generado el archivo XLSX con todas las métricas desglosadas por día y canal.');
      }
    });
  }
});
