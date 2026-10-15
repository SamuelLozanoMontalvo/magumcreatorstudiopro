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

    if (viewId === 'view-crm') renderCrm();
    if (viewId === 'view-profesionales') renderProfessionals();
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
      alert(`Preparando publicación:\n"${title}"\n\nAbriendo programador multicanal para tus redes.`);
    });
  });

  // ==========================================================================
  // 7. CRM: MULTISELECCIÓN, ACCIONES MASIVAS, CRUD Y EXCEL/CSV
  // ==========================================================================

  const DEFAULT_CRM_CONTACTS = [
    {
      id: 'C-101',
      name: 'Carlos Morales',
      email: 'carlos.morales@gmail.com',
      phone: '+57 310 458 9201',
      age: 38,
      company: 'Transportes Cartagena',
      segment: 'vip',
      notes: 'Mantenimiento de flota vehicular VIP'
    },
    {
      id: 'C-102',
      name: 'Diana María Rincón',
      email: 'diana.rincon@hotmail.com',
      phone: '+57 315 889 1234',
      age: 29,
      company: 'Inversiones Luna',
      segment: 'prospect',
      notes: 'Solicitó cotización de cambio de pastillas de freno'
    },
    {
      id: 'C-103',
      name: 'Jorge Alberto Vega',
      email: 'jvega.transportes@yahoo.com',
      phone: '+57 301 223 9988',
      age: 45,
      company: 'Logística Vega SAS',
      segment: 'inactive',
      notes: 'Inactivo hace más de 60 días. Candidato a reactivación.'
    },
    {
      id: 'C-104',
      name: 'Mariana Gómez',
      email: 'mariana.gomez@outlook.com',
      phone: '+57 320 678 4433',
      age: 32,
      company: 'Independiente',
      segment: 'client',
      notes: 'Revisión técnica anual al día'
    }
  ];

  function getCrmContacts() {
    const raw = localStorage.getItem('magum_crm_contacts');
    if (!raw) {
      localStorage.setItem('magum_crm_contacts', JSON.stringify(DEFAULT_CRM_CONTACTS));
      return DEFAULT_CRM_CONTACTS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_CRM_CONTACTS;
    }
  }

  function saveCrmContacts(contacts) {
    localStorage.setItem('magum_crm_contacts', JSON.stringify(contacts));
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
    btnBulkDelete.addEventListener('click', () => {
      const count = selectedContactIds.size;
      if (count === 0) return;

      const confirmMsg = (count === 1)
        ? '¿Deseas eliminar el contacto seleccionado de tu base de datos?'
        : `¿Deseas eliminar los ${count} contactos seleccionados de tu base de datos? Esta acción es permanente.`;

      if (confirm(confirmMsg)) {
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
        alert('Por favor ingresa un mensaje para la difusión por WhatsApp.');
        return;
      }

      const contacts = getCrmContacts().filter(c => selectedContactIds.has(c.id));
      if (contacts.length === 1) {
        // Un solo contacto: abrir chat directo con mensaje personalizado
        const target = contacts[0];
        const personalized = rawMsg
          .replace(/{nombre}/gi, target.name || '')
          .replace(/{empresa}/gi, target.company || '');
        const cleanPhone = (target.phone || '').replace(/[^0-9]/g, '');
        window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(personalized)}`, '_blank');
      } else {
        // Masivo: simulación de envío masivo en lote
        alert(`💬 ¡Campaña de WhatsApp enviada con éxito!\n\nDestinatarios: ${contacts.length} contactos procesados.\nMensaje personalizado transmitido a cada número de celular.`);
      }

      closeBulkWpModal();
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
        alert('Por favor completa el asunto y el contenido del correo.');
        return;
      }

      const contacts = getCrmContacts().filter(c => selectedContactIds.has(c.id));
      alert(`📧 ¡Campaña Masiva de Correo ejecutada!\n\nAsunto: "${subject}"\nTotal enviados: ${contacts.length} correos electrónicos.\nEstado de entrega: 100% completado.`);

      closeBulkEmailModal();
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
        alert('Por favor completa el asunto y el mensaje para el envío dual.');
        return;
      }

      const count = selectedContactIds.size;
      alert(`⚡ ¡Envío Dual Masivo Completado!\n\nAsunto de Email: "${subject}"\nContactos impactados: ${count}\nCanales activados: WhatsApp Directo + Email Marketing`);

      closeBulkDualModal();
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
    formCrm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = crmInputName.value.trim();
      const email = crmInputEmail.value.trim();
      const phone = crmInputPhone.value.trim();
      const age = crmInputAge.value ? parseInt(crmInputAge.value, 10) : null;
      const company = crmInputCompany.value.trim();
      const segment = crmInputSegment.value;
      const notes = crmInputNotes.value.trim();

      if (!name || !email || !phone) {
        alert('Nombre, correo y celular son obligatorios.');
        return;
      }

      const contacts = getCrmContacts();
      const editId = crmContactId.value;

      if (editId) {
        const idx = contacts.findIndex(c => c.id === editId);
        if (idx !== -1) {
          contacts[idx] = { ...contacts[idx], name, email, phone, age, company, segment, notes };
        }
      } else {
        const newId = 'C-' + Math.floor(1000 + Math.random() * 9000);
        contacts.unshift({ id: newId, name, email, phone, age, company, segment, notes });
      }

      saveCrmContacts(contacts);
      closeCrmModal();
      renderCrm();
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
            alert('El archivo CSV está vacío o solo contiene encabezados.');
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
            alert('Formato no reconocido. Asegúrate de incluir las columnas obligatorias: Nombre, Correo y Celular.\n\nPuedes descargar la plantilla oficial con el botón "Descargar Plantilla CSV".');
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
          alert(`✅ ¡Importación masiva exitosa!\n\nSe importaron ${importedCount} contactos a tu base de datos.`);
          crmImportFile.value = '';
        } catch (err) {
          console.error(err);
          alert('Hubo un error al procesar el archivo CSV. Verifica el formato e intenta nuevamente.');
        }
      };

      reader.readAsText(file);
    });
  }

  // ==========================================================================
  // 8. PROFESIONALES: CRUD DE MIEMBROS CON ACCESO A LA CUENTA
  // ==========================================================================

  const DEFAULT_PROFESSIONALS = [
    {
      id: 'P-101',
      name: 'Ing. Mateo Saldarriaga',
      role: 'Jefe de Taller & Diagnóstico',
      email: 'mateo@automotor.com',
      password: '••••••••',
      phone: '+57 311 000 1122',
      schedule: 'Lun - Sáb (8:00 AM - 5:00 PM)'
    },
    {
      id: 'P-102',
      name: 'Andrés Camilo Rojas',
      role: 'Mecánico General Senior',
      email: 'andres.rojas@automotor.com',
      password: '••••••••',
      phone: '+57 314 222 3344',
      schedule: 'Lun - Vie (8:00 AM - 6:00 PM)'
    },
    {
      id: 'P-103',
      name: 'Laura Sofía Morales',
      role: 'Asesora Comercial / CRM',
      email: 'laura.morales@automotor.com',
      password: '••••••••',
      phone: '+57 318 444 5566',
      schedule: 'Lun - Sáb (9:00 AM - 6:00 PM)'
    }
  ];

  function getProfessionals() {
    const raw = localStorage.getItem('magum_team_professionals');
    if (!raw) {
      localStorage.setItem('magum_team_professionals', JSON.stringify(DEFAULT_PROFESSIONALS));
      return DEFAULT_PROFESSIONALS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_PROFESSIONALS;
    }
  }

  function saveProfessionals(profs) {
    localStorage.setItem('magum_team_professionals', JSON.stringify(profs));
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
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const profs = getProfessionals();
        const prof = profs.find(p => p.id === id);
        if (prof && confirm(`¿Deseas revocar el acceso a "${prof.name}"? Ya no podrá ingresar a la cuenta.`)) {
          saveProfessionals(profs.filter(p => p.id !== id));
          renderProfessionals();
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
    formProf.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = profInputName.value.trim();
      const role = profInputRole.value.trim();
      const email = profInputEmail.value.trim().toLowerCase();
      const password = profInputPassword.value.trim();
      const phone = profInputPhone.value.trim();
      const schedule = profInputSchedule.value.trim();

      const editId = profUserId.value;
      if (!name || !role || !email || (!password && !editId)) {
        alert('Nombre, cargo, correo y contraseña son obligatorios para habilitar el acceso.');
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
      } else {
        const newId = 'P-' + Math.floor(1000 + Math.random() * 9000);
        profs.unshift({ id: newId, name, role, email, password, phone, schedule });
      }

      saveProfessionals(profs);
      closeProfModal();
      renderProfessionals();
      alert(`✅ Profesional guardado exitosamente.\n\nTiene acceso habilitado con el correo: ${email}`);
    });
  }

  // ==========================================================================
  // 9. AJUSTES DE MARCA (WHITE LABEL)
  // ==========================================================================

  const BRAND_STORAGE_KEY = 'magum_brand_settings';

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

  function loadBrandSettings() {
    try {
      const saved = localStorage.getItem(BRAND_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (inputBizName && data.businessName) inputBizName.value = data.businessName;
        if (previewLogoImg && data.logoUrl) previewLogoImg.src = data.logoUrl;
        if (previewFaviconImg && data.faviconUrl) previewFaviconImg.src = data.faviconUrl;
        if (inputColorPrimary && data.colorPrimary) inputColorPrimary.value = data.colorPrimary;
        if (inputColorSecondary && data.colorSecondary) inputColorSecondary.value = data.colorSecondary;
        if (inputColorBg && data.colorBg) inputColorBg.value = data.colorBg;

        applyBrandingLive(data);
      }
    } catch (e) {
      console.warn('Error cargando ajustes de marca:', e);
    }
  }

  function applyBrandingLive(data) {
    if (data.logoUrl && clientBrandLogo) {
      clientBrandLogo.src = data.logoUrl;
    }
    if (data.faviconUrl && dynamicFavicon) {
      dynamicFavicon.href = data.faviconUrl;
    }
    if (data.colorPrimary) {
      document.documentElement.style.setProperty('--brand-indigo', data.colorPrimary);
    }
    if (data.colorBg) {
      document.documentElement.style.setProperty('--brand-magenta', data.colorBg);
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
    formBrand.addEventListener('submit', (e) => {
      e.preventDefault();
      const settingsData = {
        businessName: inputBizName ? inputBizName.value.trim() : 'MAGUM',
        logoUrl: previewLogoImg ? previewLogoImg.src : '',
        faviconUrl: previewFaviconImg ? previewFaviconImg.src : '',
        colorPrimary: inputColorPrimary ? inputColorPrimary.value : '#210087',
        colorSecondary: inputColorSecondary ? inputColorSecondary.value : '#F8F3EB',
        colorBg: inputColorBg ? inputColorBg.value : '#FF00DB',
        savedAt: new Date().toISOString()
      };

      localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(settingsData));
      applyBrandingLive(settingsData);

      const saveBtn = document.getElementById('btn-save-branding');
      if (saveBtn) {
        const originalHtml = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>¡Cambios Guardados con Éxito!</span>';
        saveBtn.style.background = '#10b981';
        setTimeout(() => {
          saveBtn.innerHTML = originalHtml;
          saveBtn.style.background = '';
        }, 2500);
      }
    });
  }

  // ==========================================================================
  // 10. CIERRE DE SESIÓN SEGURO
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

});
