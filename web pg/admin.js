/**
 * Preem Group - Admin Backoffice Logic & State Management
 * Shared Storage: proservice_care_tickets_v1
 */

(function () {
  'use strict';

  const STORAGE_KEY_TICKETS = 'proservice_care_tickets_v1';
  const STORAGE_KEY_TECHS = 'proservice_care_technicians_v1';
  const STORAGE_KEY_SETTINGS = 'proservice_care_line_config_v1';
  const STORAGE_KEY_AUTH = 'proservice_care_admin_auth_v1';
  const DEFAULT_PIN = '1234';

  // State
  let state = {
    isAuthenticated: false,
    currentTab: 'tickets', // 'tickets', 'technicians', 'analytics', 'settings'
    tickets: [],
    technicians: [],
    settings: {
      liffId: '',
      lineOaId: '@preemgroup',
      webhookUrl: '',
      adminNotifyToken: ''
    },
    filters: {
      search: '',
      status: 'all',
      technician: 'all',
      sortBy: 'date-desc'
    },
    activeTicketId: null,
    printTicketId: null
  };

  // Sample Technicians if none exist
  const defaultTechnicians = [
    { id: 'TECH-01', name: 'ช่างสมศักดิ์ มั่นคง', skill: 'ระบบปรับอากาศ & เครื่องทำความเย็น', phone: '081-999-1111', status: 'available' },
    { id: 'TECH-02', name: 'ช่างวิชัย รุ่งเรือง', skill: 'ระบบไฟฟ้า & แผงควบคุมอิเล็กทรอนิกส์', phone: '082-888-2222', status: 'available' },
    { id: 'TECH-03', name: 'ช่างอนุชา สดใส', skill: 'ระบบโครงสร้าง อุปกรณ์ & ปั๊มน้ำ', phone: '083-777-3333', status: 'available' }
  ];

  // DOM Elements Cache
  const dom = {
    loginView: document.getElementById('adminLoginView'),
    dashboardView: document.getElementById('adminDashboardView'),
    loginForm: document.getElementById('adminLoginForm'),
    pinInput: document.getElementById('adminPinInput'),
    loginError: document.getElementById('adminLoginError'),
    btnLogout: document.getElementById('btnLogout'),
    
    // KPI Badges
    kpiTotal: document.getElementById('kpiTotal'),
    kpiPending: document.getElementById('kpiPending'),
    kpiScheduled: document.getElementById('kpiScheduled'),
    kpiCompleted: document.getElementById('kpiCompleted'),

    // Tabs
    tabBtns: document.querySelectorAll('.admin-tab-btn'),
    tabContents: document.querySelectorAll('.admin-tab-content'),
    cntTabTickets: document.getElementById('cntTabTickets'),
    cntTabTechs: document.getElementById('cntTabTechs'),

    // Filters
    searchTickets: document.getElementById('searchTickets'),
    filterStatus: document.getElementById('filterStatus'),
    filterTech: document.getElementById('filterTech'),
    sortBy: document.getElementById('sortBy'),
    btnRefresh: document.getElementById('btnRefresh'),
    btnExportCsv: document.getElementById('btnExportCsv'),

    // Table
    tableBody: document.getElementById('ticketsTableBody'),
    emptyTableState: document.getElementById('emptyTableState'),

    // Modals
    modalAction: document.getElementById('ticketActionModal'),
    btnCloseActionModal: document.getElementById('btnCloseActionModal'),
    modalJobSheet: document.getElementById('jobSheetModal'),
    btnCloseJobSheetModal: document.getElementById('btnCloseJobSheetModal'),
    btnPrintJobSheet: document.getElementById('btnPrintJobSheet'),
    jobSheetContainer: document.getElementById('jobSheetContainer'),

    // Action Modal Fields
    actionTicketId: document.getElementById('actionTicketId'),
    actionCustomerName: document.getElementById('actionCustomerName'),
    actionPhone: document.getElementById('actionPhone'),
    actionLocation: document.getElementById('actionLocation'),
    actionIssue: document.getElementById('actionIssue'),
    actionDate: document.getElementById('actionDate'),
    actionStatusSelect: document.getElementById('actionStatusSelect'),
    actionTechSelect: document.getElementById('actionTechSelect'),
    actionAdminNotes: document.getElementById('actionAdminNotes'),
    actionPhotosContainer: document.getElementById('actionPhotosContainer'),
    actionPhotosGallery: document.getElementById('actionPhotosGallery'),
    btnSaveTicketAction: document.getElementById('btnSaveTicketAction'),

    // Technicians Tab
    techsContainer: document.getElementById('techniciansContainer'),
    btnAddTech: document.getElementById('btnAddTech'),

    // Settings Form
    settingsForm: document.getElementById('adminSettingsForm'),
    cfgLiffId: document.getElementById('adminCfgLiffId'),
    cfgLineOa: document.getElementById('adminCfgLineOa'),
    cfgWebhookUrl: document.getElementById('adminCfgWebhookUrl'),
    btnTestWebhook: document.getElementById('btnTestWebhook'),
    cloudStatusBanner: document.getElementById('cloudStatusBanner'),
    cloudStatusDot: document.getElementById('cloudStatusDot'),
    cloudStatusTitle: document.getElementById('cloudStatusTitle'),
    cloudStatusDesc: document.getElementById('cloudStatusDesc'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer')
  };

  /**
   * Initialize Admin Application
   */
  function init() {
    loadAuthentication();
    loadData();
    bindEvents();

    if (state.isAuthenticated) {
      showDashboard();
      // Auto sync from cloud if webhook is configured
      if (state.settings.webhookUrl) {
        syncTicketsFromCloud(false);
      }
    } else {
      showLogin();
    }
  }

  /**
   * Load data from localStorage
   */
  function loadData() {
    // Tickets
    try {
      const savedTickets = localStorage.getItem(STORAGE_KEY_TICKETS);
      if (savedTickets) {
        state.tickets = JSON.parse(savedTickets).filter(t => !String(t.id || t.ticketId || '').startsWith('REQ-TEST'));
      } else {
        state.tickets = [];
      }
    } catch (e) {
      console.error('Error loading tickets', e);
      state.tickets = [];
    }

    // Technicians
    try {
      const savedTechs = localStorage.getItem(STORAGE_KEY_TECHS);
      if (savedTechs) {
        state.technicians = JSON.parse(savedTechs);
      } else {
        state.technicians = defaultTechnicians;
        localStorage.setItem(STORAGE_KEY_TECHS, JSON.stringify(defaultTechnicians));
      }
    } catch (e) {
      state.technicians = defaultTechnicians;
    }

    // Settings
    try {
      if (window.LineService) {
        state.settings = Object.assign({}, state.settings, window.LineService.getConfig());
      }
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        state.settings = Object.assign({}, state.settings, JSON.parse(savedSettings));
      }
      if (!state.settings.webhookUrl && window.LineService) {
        state.settings.webhookUrl = window.LineService.getConfig().webhookUrl;
      }
    } catch (e) {}
  }

  /**
   * Sync Tickets from Cloud (Google Sheets via Webhook URL)
   */
  async function syncTicketsFromCloud(showToastFeedback = false) {
    if (!window.LineService) return;
    
    // Animate refresh button
    if (dom.btnRefresh) {
      const icon = dom.btnRefresh.querySelector('i');
      if (icon) icon.classList.add('fa-spin');
      dom.btnRefresh.disabled = true;
    }

    try {
      const result = await window.LineService.fetchTicketsFromCloud();

      if (result.success && Array.isArray(result.tickets)) {
        const cloudTickets = result.tickets
          .filter(ct => {
            const tid = String(ct.id || ct.ticketId || '');
            return !tid.startsWith('REQ-TEST');
          })
          .map(ct => {
            // Find matching technician ID if assignedTech is not explicitly saved
            let techId = ct.assignedTech || '';
            if (!techId && ct.technician && ct.technician !== '-') {
              const matched = state.technicians.find(t => t.name === ct.technician);
              if (matched) techId = matched.id;
            }

            const photoUrls = Array.isArray(ct.photoUrls) ? ct.photoUrls : (ct.photoUrls ? String(ct.photoUrls).split(',').map(s => s.trim()).filter(Boolean) : []);

            return {
              id: ct.id || ct.ticketId,
              customerName: ct.customerName || '-',
              contactPhone: ct.contactPhone || '-',
              serviceLocation: ct.serviceLocation || '-',
              issueDetail: ct.issueDetail || '-',
              preferredDate: ct.preferredDate || '',
              preferredTime: ct.preferredTime || '',
              status: ct.status || 'รอติดต่อกลับ',
              assignedTech: techId,
              assignedTechName: ct.technician || (techId ? (state.technicians.find(t => t.id === techId)?.name || '') : ''),
              adminNotes: ct.adminNotes || '',
              createdAt: ct.createdAt || new Date().toISOString(),
              lineUserId: ct.lineUserId || null,
              photoUrls: photoUrls,
              photos: photoUrls
            };
          });

        state.tickets = cloudTickets;
        saveTickets();
        renderAll();
        updateCloudStatusUI(true, `ซิงค์สำเร็จล่าสุด: ${new Date().toLocaleTimeString('th-TH')}`);

        if (showToastFeedback) {
          showToast(`ซิงค์ข้อมูลจากคลาวด์สำเร็จ (${cloudTickets.length} รายการ)`, 'success');
        }
      } else {
        updateCloudStatusUI(false, result.error || 'ยังไม่ได้ระบุ Webhook URL');
        if (showToastFeedback) {
          if (!state.settings.webhookUrl) {
            showToast('กรุณาระบุ Webhook URL ในแท็บตั้งค่าเพื่อเชื่อมต่อ Google Sheets', 'warning');
          } else {
            showToast('ไม่สามารถดึงข้อมูลจาก Cloud ได้ (แสดงข้อมูลแคชในเครื่อง)', 'warning');
          }
        }
      }
    } catch (err) {
      console.error('syncTicketsFromCloud failed:', err);
      updateCloudStatusUI(false, err.toString());
      if (showToastFeedback) {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อคลาวด์', 'error');
      }
    } finally {
      if (dom.btnRefresh) {
        const icon = dom.btnRefresh.querySelector('i');
        if (icon) icon.classList.remove('fa-spin');
        dom.btnRefresh.disabled = false;
      }
    }
  }

  /**
   * Update Cloud Status UI Banner in Settings
   */
  function updateCloudStatusUI(isConnected, detailText = '') {
    if (!dom.cloudStatusDot || !dom.cloudStatusTitle || !dom.cloudStatusDesc) return;

    if (isConnected) {
      dom.cloudStatusDot.style.background = '#10b981'; // Green
      dom.cloudStatusTitle.innerHTML = '<i class="fa-solid fa-circle-check text-emerald"></i> ฐานข้อมูลคลาวด์: เชื่อมต่อสำเร็จ (Cloud Connected)';
      dom.cloudStatusTitle.style.color = '#065f46';
      dom.cloudStatusDesc.textContent = detailText || 'ข้อมูลเชื่อมต่อกับ Google Sheet แบบเรียลไทม์';
    } else {
      if (!state.settings.webhookUrl) {
        dom.cloudStatusDot.style.background = '#94a3b8'; // Slate
        dom.cloudStatusTitle.innerHTML = '<i class="fa-solid fa-circle-info"></i> โหมดออฟไลน์: ใช้งานเฉพาะในเบราว์เซอร์นี้ (Local Mode)';
        dom.cloudStatusTitle.style.color = 'var(--navy-900)';
        dom.cloudStatusDesc.textContent = 'กรุณาใส่ Webhook URL ด้านล่างเพื่อแชร์ข้อมูลร่วมกับเครื่องอื่น';
      } else {
        dom.cloudStatusDot.style.background = '#f59e0b'; // Amber
        dom.cloudStatusTitle.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-amber"></i> สถานะการเชื่อมต่อ: ยังไม่สามารถเชื่อมต่อได้';
        dom.cloudStatusTitle.style.color = '#92400e';
        dom.cloudStatusDesc.textContent = detailText || 'โปรดตรวจสอบสิทธิ์การ Deploy ใน Google Apps Script ให้เป็น Anyone';
      }
    }
  }

  function saveTickets() {
    try {
      localStorage.setItem(STORAGE_KEY_TICKETS, JSON.stringify(state.tickets));
    } catch (e) {
      console.error('Error saving tickets', e);
    }
  }

  function saveTechnicians() {
    try {
      localStorage.setItem(STORAGE_KEY_TECHS, JSON.stringify(state.technicians));
    } catch (e) {}
  }

  function saveSettings(newCfg) {
    state.settings = Object.assign({}, state.settings, newCfg);
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(state.settings));
      if (window.LineService) {
        window.LineService.saveConfig(state.settings);
      }
    } catch (e) {}
  }

  /**
   * Auth Management
   */
  function loadAuthentication() {
    const isAuth = sessionStorage.getItem(STORAGE_KEY_AUTH);
    state.isAuthenticated = (isAuth === 'true');
  }

  function showLogin() {
    if (dom.loginView) dom.loginView.style.display = 'flex';
    if (dom.dashboardView) dom.dashboardView.style.display = 'none';
    if (dom.pinInput) {
      dom.pinInput.value = '';
      setTimeout(() => dom.pinInput.focus(), 100);
    }
  }

  function showDashboard() {
    if (dom.loginView) dom.loginView.style.display = 'none';
    if (dom.dashboardView) dom.dashboardView.style.display = 'block';
    populateTechDropdowns();
    populateSettingsForm();
    renderAll();
    if (state.settings.webhookUrl) {
      syncTicketsFromCloud(false);
    } else {
      updateCloudStatusUI(false);
    }
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY_AUTH);
    state.isAuthenticated = false;
    showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    showLogin();
  }

  /**
   * Render All Dashboard Components
   */
  function renderAll() {
    calculateKPIs();
    renderTicketsTable();
    renderTechnicians();
  }

  /**
   * Calculate & Render KPIs
   */
  function calculateKPIs() {
    const total = state.tickets.length;
    const pending = state.tickets.filter(t => t.status === 'รอติดต่อกลับ').length;
    const scheduled = state.tickets.filter(t => t.status === 'นัดหมายแล้ว').length;
    const completed = state.tickets.filter(t => t.status === 'เสร็จสิ้น').length;

    if (dom.kpiTotal) dom.kpiTotal.textContent = total;
    if (dom.kpiPending) dom.kpiPending.textContent = pending;
    if (dom.kpiScheduled) dom.kpiScheduled.textContent = scheduled;
    if (dom.kpiCompleted) dom.kpiCompleted.textContent = completed;

    if (dom.cntTabTickets) dom.cntTabTickets.textContent = total;
    if (dom.cntTabTechs) dom.cntTabTechs.textContent = state.technicians.length;
  }

  /**
   * Filter & Sort Tickets
   */
  function getFilteredTickets() {
    let result = [...state.tickets];

    // Status filter
    if (state.filters.status !== 'all') {
      result = result.filter(t => t.status === state.filters.status);
    }

    // Technician filter
    if (state.filters.technician !== 'all') {
      if (state.filters.technician === 'unassigned') {
        result = result.filter(t => !t.assignedTech);
      } else {
        result = result.filter(t => t.assignedTech === state.filters.technician);
      }
    }

    // Search query
    if (state.filters.search) {
      const q = state.filters.search.toLowerCase();
      result = result.filter(t => {
        const name = (t.customerName || '').toLowerCase();
        const phone = (t.contactPhone || '').replace(/\D/g, '');
        const id = (t.id || '').toLowerCase();
        const location = (t.serviceLocation || '').toLowerCase();
        const issue = (t.issueDetail || '').toLowerCase();
        const tech = (t.assignedTechName || '').toLowerCase();
        return name.includes(q) || phone.includes(q.replace(/\D/g, '')) || id.includes(q) || location.includes(q) || issue.includes(q) || tech.includes(q);
      });
    }

    // Sorting
    result.sort((a, b) => {
      if (state.filters.sortBy === 'date-desc') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      } else if (state.filters.sortBy === 'date-asc') {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      } else if (state.filters.sortBy === 'pref-date') {
        return (a.preferredDate || '').localeCompare(b.preferredDate || '');
      }
      return 0;
    });

    return result;
  }

  /**
   * Render Tickets Table
   */
  function renderTicketsTable() {
    if (!dom.tableBody) return;
    const tickets = getFilteredTickets();

    if (tickets.length === 0) {
      dom.tableBody.innerHTML = '';
      if (dom.emptyTableState) dom.emptyTableState.style.display = 'flex';
      return;
    }

    if (dom.emptyTableState) dom.emptyTableState.style.display = 'none';

    dom.tableBody.innerHTML = tickets.map(t => {
      const statusBadge = getStatusBadge(t.status);
      const techBadge = t.assignedTechName 
        ? `<span class="tech-assigned-tag"><i class="fa-solid fa-user-check"></i> ${escapeHTML(t.assignedTechName)}</span>`
        : `<span class="tech-unassigned-tag"><i class="fa-regular fa-clock"></i> ยังไม่มอบหมาย</span>`;

      const photoCount = (t.photoUrls && t.photoUrls.length) || (t.photos && t.photos.length) || 0;
      const photoBadge = photoCount > 0 
        ? `<div style="margin-top: 4px;"><span class="admin-photo-badge" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; padding: 2px 7px; border-radius: 20px; background: rgba(14, 165, 233, 0.12); color: #0284c7; font-weight: 600; cursor: pointer;" onclick="window.adminManageTicket('${t.id}')"><i class="fa-solid fa-camera"></i> ${photoCount} รูป</span></div>` 
        : '';

      return `
        <tr data-id="${t.id}">
          <td class="ticket-id-cell">#${escapeHTML(t.id)}</td>
          <td class="customer-name-cell">
            <div>${escapeHTML(t.customerName)}</div>
            <div style="font-size: 0.78rem; color: var(--slate-500); font-weight: normal;"><i class="fa-solid fa-phone"></i> ${escapeHTML(t.contactPhone)}</div>
          </td>
          <td>
            <div style="max-width: 200px; font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(t.serviceLocation)}">
              <i class="fa-solid fa-location-dot text-blue"></i> ${escapeHTML(t.serviceLocation)}
            </div>
          </td>
          <td>
            <div style="max-width: 240px; font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(t.issueDetail)}">
              ${escapeHTML(t.issueDetail)}
            </div>
            ${photoBadge}
          </td>
          <td>
            <div style="font-size: 0.84rem; font-weight: 600; color: var(--navy-800);">${formatThaiDate(t.preferredDate)}</div>
            <div style="font-size: 0.76rem; color: var(--slate-500);">${escapeHTML(t.preferredTime)}</div>
          </td>
          <td>${techBadge}</td>
          <td>${statusBadge}</td>
          <td>
            <div class="table-actions-cell">
              <button type="button" class="btn-table-action" title="จัดการ/เปลี่ยนสถานะ" onclick="window.adminManageTicket('${t.id}')">
                <i class="fa-solid fa-sliders"></i>
              </button>
              <button type="button" class="btn-table-action" title="พิมพ์ใบสั่งงานช่าง" onclick="window.adminPrintJobSheet('${t.id}')">
                <i class="fa-solid fa-print"></i>
              </button>
              <button type="button" class="btn-table-action btn-delete" title="ลบรายการ" onclick="window.adminDeleteTicket('${t.id}')">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function getStatusBadge(status) {
    if (status === 'รอติดต่อกลับ') {
      return `<span class="status-badge status-pending"><i class="fa-solid fa-hourglass-half"></i> รอติดต่อกลับ</span>`;
    } else if (status === 'นัดหมายแล้ว') {
      return `<span class="status-badge status-scheduled"><i class="fa-solid fa-calendar-check"></i> นัดหมายแล้ว</span>`;
    } else if (status === 'เสร็จสิ้น') {
      return `<span class="status-badge status-completed"><i class="fa-solid fa-circle-check"></i> เสร็จสิ้น</span>`;
    }
    return `<span class="status-badge status-pending">${escapeHTML(status)}</span>`;
  }

  /**
   * Populate Technician Dropdowns
   */
  function populateTechDropdowns() {
    const filterSelect = dom.filterTech;
    const actionSelect = dom.actionTechSelect;

    if (filterSelect) {
      filterSelect.innerHTML = `
        <option value="all">ทีมช่างทั้งหมด</option>
        <option value="unassigned">ยังไม่มอบหมาย</option>
        ${state.technicians.map(tech => `<option value="${tech.id}">${escapeHTML(tech.name)} (${escapeHTML(tech.skill)})</option>`).join('')}
      `;
    }

    if (actionSelect) {
      actionSelect.innerHTML = `
        <option value="">-- เลือกช่างผู้รับผิดชอบ --</option>
        ${state.technicians.map(tech => `<option value="${tech.id}">${escapeHTML(tech.name)} - ${escapeHTML(tech.skill)}</option>`).join('')}
      `;
    }
  }

  /**
   * Manage Ticket Modal
   */
  window.adminManageTicket = function (ticketId) {
    const ticket = state.tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    state.activeTicketId = ticketId;
    dom.actionTicketId.textContent = `#${ticket.id}`;
    dom.actionCustomerName.textContent = ticket.customerName || '-';
    dom.actionPhone.textContent = ticket.contactPhone || '-';
    dom.actionLocation.textContent = ticket.serviceLocation || '-';
    dom.actionIssue.textContent = ticket.issueDetail || '-';
    dom.actionDate.textContent = `${formatThaiDate(ticket.preferredDate)} (${ticket.preferredTime || '-'})`;

    dom.actionStatusSelect.value = ticket.status || 'รอติดต่อกลับ';
    dom.actionTechSelect.value = ticket.assignedTech || '';
    dom.actionAdminNotes.value = ticket.adminNotes || '';

    // Render photos in action modal
    const photos = ticket.photoUrls || ticket.photos || [];
    if (dom.actionPhotosContainer && dom.actionPhotosGallery) {
      if (photos.length > 0) {
        dom.actionPhotosContainer.style.display = 'block';
        dom.actionPhotosGallery.innerHTML = photos.map((url, i) => `
          <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: block; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.06); transition: transform 0.2s;" title="คลิกเพื่อดูรูปขนาดเต็ม">
            <img src="${url}" alt="รูปที่ ${i + 1}" style="width: 100%; height: 100%; object-fit: cover;" />
          </a>
        `).join('');
      } else {
        dom.actionPhotosContainer.style.display = 'none';
        dom.actionPhotosGallery.innerHTML = '';
      }
    }

    dom.modalAction.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  /**
   * Save Ticket Action Updates
   */
  async function saveTicketAction() {
    if (!state.activeTicketId) return;
    const ticketId = state.activeTicketId;
    const idx = state.tickets.findIndex(t => t.id === ticketId);
    if (idx === -1) return;

    const newStatus = dom.actionStatusSelect.value;
    const techId = dom.actionTechSelect.value;
    const notes = dom.actionAdminNotes.value.trim();

    const tech = state.technicians.find(tc => tc.id === techId);
    const techName = tech ? tech.name : '';

    state.tickets[idx].status = newStatus;
    state.tickets[idx].assignedTech = techId;
    state.tickets[idx].assignedTechName = techName;
    state.tickets[idx].adminNotes = notes;
    state.tickets[idx].updatedAt = new Date().toISOString();

    saveTickets();
    renderAll();
    closeActionModal();

    // Send update to Cloud Database (Google Sheets)
    if (window.LineService && state.settings.webhookUrl) {
      window.LineService.updateTicketOnCloud({
        ticketId: ticketId,
        status: newStatus,
        technician: techName,
        adminNotes: notes
      });
      showToast('บันทึกและซิงค์การอัปเดตไปยังคลาวด์สำเร็จ!', 'success');
    } else {
      showToast('บันทึกการอัปเดตในเครื่องสำเร็จ (ยังไม่ได้เชื่อมต่อคลาวด์)', 'success');
    }
  }

  function closeActionModal() {
    if (dom.modalAction) dom.modalAction.style.display = 'none';
    document.body.style.overflow = '';
    state.activeTicketId = null;
  }

  /**
   * Print Work Order / Job Sheet Modal
   */
  window.adminPrintJobSheet = function (ticketId) {
    const ticket = state.tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    state.printTicketId = ticketId;
    const techName = ticket.assignedTechName || 'ยังไม่ได้ระบุช่าง';
    const printDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    dom.jobSheetContainer.innerHTML = `
      <div class="print-job-sheet">
        <div class="job-sheet-header">
          <div class="job-sheet-brand">
            <h2>Preem Group</h2>
            <p>ใบสั่งงานและบันทึกการให้บริการซ่อมบำรุง (Job Work Order)</p>
          </div>
          <div class="job-sheet-meta">
            <div style="font-size: 1.15rem; font-weight: 700; color: #0f2342;">เลขที่: #${escapeHTML(ticket.id)}</div>
            <div style="font-size: 0.82rem; color: #64748b;">วันที่ออกเอกสาร: ${printDate}</div>
            <div style="margin-top: 6px;">${getStatusBadge(ticket.status)}</div>
          </div>
        </div>

        <div class="job-sheet-grid">
          <div class="job-sheet-box">
            <div class="job-sheet-box-title"><i class="fa-solid fa-user"></i> ข้อมูลลูกค้า</div>
            <div style="font-weight: 700; font-size: 1rem;">${escapeHTML(ticket.customerName)}</div>
            <div style="font-size: 0.9rem; margin-top: 2px;">เบอร์ติดต่อ: <strong>${escapeHTML(ticket.contactPhone)}</strong></div>
          </div>

          <div class="job-sheet-box">
            <div class="job-sheet-box-title"><i class="fa-solid fa-calendar-day"></i> กำหนดการเข้าบริการ</div>
            <div style="font-weight: 700; font-size: 0.95rem; color: #1e3a68;">วันที่: ${formatThaiDate(ticket.preferredDate)}</div>
            <div style="font-size: 0.88rem;">ช่วงเวลา: ${escapeHTML(ticket.preferredTime)}</div>
          </div>

          <div class="job-sheet-box full-width">
            <div class="job-sheet-box-title"><i class="fa-solid fa-location-dot"></i> สถานที่หน้างาน</div>
            <div style="font-size: 0.95rem;">${escapeHTML(ticket.serviceLocation)}</div>
          </div>

          <div class="job-sheet-box full-width">
            <div class="job-sheet-box-title"><i class="fa-solid fa-triangle-exclamation"></i> รายละเอียดปัญหาที่แจ้ง</div>
            <div style="font-size: 0.95rem; white-space: pre-line;">${escapeHTML(ticket.issueDetail)}</div>
          </div>

          <div class="job-sheet-box">
            <div class="job-sheet-box-title"><i class="fa-solid fa-user-gear"></i> ช่างผู้รับผิดชอบ</div>
            <div style="font-weight: 700; font-size: 1rem; color: #059669;">${escapeHTML(techName)}</div>
          </div>

          <div class="job-sheet-box">
            <div class="job-sheet-box-title"><i class="fa-solid fa-clipboard-check"></i> บันทึกเจ้าหน้าที่</div>
            <div style="font-size: 0.9rem;">${escapeHTML(ticket.adminNotes || '-')}</div>
          </div>
          ${(() => {
            const pList = ticket.photoUrls || ticket.photos || [];
            if (!pList || pList.length === 0) return '';
            return `
              <div class="job-sheet-box full-width">
                <div class="job-sheet-box-title"><i class="fa-solid fa-camera"></i> ภาพถ่ายประกอบหน้างาน (${pList.length} รูป)</div>
                <div style="display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap;">
                  ${pList.map((url, i) => `
                    <div style="width: 110px; height: 110px; border-radius: 6px; overflow: hidden; border: 1px solid #cbd5e1;">
                      <img src="${url}" alt="รูปหน้างาน ${i + 1}" style="width: 100%; height: 100%; object-fit: cover;" />
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          })()}
        </div>

        <div style="margin-top: 24px; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 14px; background: #f8fafc;">
          <div style="font-weight: 700; font-size: 0.88rem; margin-bottom: 6px; color: #475569;">บันทึกผลการปฏิบัติงานของช่าง:</div>
          <div style="height: 60px; border-bottom: 1px dotted #cbd5e1;"></div>
          <div style="display: flex; justify-content: space-between; margin-top: 30px; padding: 0 20px;">
            <div style="text-align: center; width: 200px;">
              <div style="border-bottom: 1px solid #94a3b8; height: 35px;"></div>
              <div style="font-size: 0.8rem; margin-top: 4px;">ลงชื่อช่างผู้ปฏิบัติงาน</div>
            </div>
            <div style="text-align: center; width: 200px;">
              <div style="border-bottom: 1px solid #94a3b8; height: 35px;"></div>
              <div style="font-size: 0.8rem; margin-top: 4px;">ลงชื่อลูกค้ารับมอบงาน</div>
            </div>
          </div>
        </div>
      </div>
    `;

    dom.modalJobSheet.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  function closeJobSheetModal() {
    if (dom.modalJobSheet) dom.modalJobSheet.style.display = 'none';
    document.body.style.overflow = '';
    state.printTicketId = null;
  }

  /**
   * Delete Ticket
   */
  window.adminDeleteTicket = async function (ticketId) {
    if (confirm(`คุณต้องการลบรายการแจ้งซ่อม #${ticketId} ใช่หรือไม่?`)) {
      state.tickets = state.tickets.filter(t => t.id !== ticketId);
      saveTickets();
      renderAll();

      if (window.LineService && state.settings.webhookUrl) {
        window.LineService.deleteTicketOnCloud(ticketId);
      }

      showToast(`ลบรายการ #${ticketId} ออกจากระบบเรียบร้อยแล้ว`, 'info');
    }
  };

  /**
   * Render Technicians List
   */
  function renderTechnicians() {
    if (!dom.techsContainer) return;

    dom.techsContainer.innerHTML = state.technicians.map(t => {
      const assignedCount = state.tickets.filter(tk => tk.assignedTech === t.id && tk.status !== 'เสร็จสิ้น').length;

      return `
        <div class="tech-card">
          <div class="tech-avatar"><i class="fa-solid fa-user-gear"></i></div>
          <div class="tech-details">
            <div class="tech-name">${escapeHTML(t.name)}</div>
            <div class="tech-skill"><i class="fa-solid fa-screwdriver-wrench"></i> ${escapeHTML(t.skill)}</div>
            <div class="tech-phone"><i class="fa-solid fa-phone"></i> ${escapeHTML(t.phone)}</div>
            <div style="margin-top: 6px; font-size: 0.78rem; font-weight: 600; color: var(--navy-700);">
              <i class="fa-solid fa-briefcase"></i> กำลังดูแล: ${assignedCount} งาน
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Export CSV
   */
  function exportCSV() {
    if (state.tickets.length === 0) {
      showToast('ไม่มีข้อมูลสำหรับส่งออก', 'warning');
      return;
    }

    const headers = ['รหัสแจ้งซ่อม', 'วันที่แจ้ง', 'ชื่อลูกค้า', 'เบอร์ติดต่อ', 'สถานที่หน้างาน', 'รายละเอียดปัญหา', 'วันที่นัดหมาย', 'ช่วงเวลา', 'สถานะ', 'ช่างผู้รับผิดชอบ', 'บันทึก'];
    const rows = state.tickets.map(t => [
      `"${t.id || ''}"`,
      `"${t.createdAt ? t.createdAt.slice(0, 10) : ''}"`,
      `"${(t.customerName || '').replace(/"/g, '""')}"`,
      `"${t.contactPhone || ''}"`,
      `"${(t.serviceLocation || '').replace(/"/g, '""')}"`,
      `"${(t.issueDetail || '').replace(/"/g, '""')}"`,
      `"${t.preferredDate || ''}"`,
      `"${t.preferredTime || ''}"`,
      `"${t.status || ''}"`,
      `"${(t.assignedTechName || '').replace(/"/g, '""')}"`,
      `"${(t.adminNotes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Preem_Group_Backoffice_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('ส่งออกรายงาน Excel/CSV เรียบร้อยแล้ว', 'success');
  }

  /**
   * Populate & Handle Settings
   */
  function populateSettingsForm() {
    if (dom.cfgLiffId) dom.cfgLiffId.value = state.settings.liffId || '';
    if (dom.cfgLineOa) dom.cfgLineOa.value = state.settings.lineOaId || '';
    if (dom.cfgWebhookUrl) dom.cfgWebhookUrl.value = state.settings.webhookUrl || '';
  }

  /**
   * Helper Functions
   */
  function formatThaiDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

      // Pattern 1: YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        const parts = dateStr.split('T')[0].split('-');
        const day = parseInt(parts[2], 10);
        const monthIndex = parseInt(parts[1], 10) - 1;
        const thaiYear = parseInt(parts[0], 10) + 543;
        return `${day} ${thaiMonths[monthIndex]} ${thaiYear}`;
      }

      // Pattern 2: DD/MM/YYYY
      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
        const parts = dateStr.split('/');
        const day = parseInt(parts[0], 10);
        const monthIndex = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);
        if (year < 2500) year += 543;
        return `${day} ${thaiMonths[monthIndex]} ${year}`;
      }

      // Pattern 3: Standard parseable Date string (e.g., "Wed Aug 26 2026...")
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const day = d.getDate();
        const monthIndex = d.getMonth();
        const thaiYear = d.getFullYear() + 543;
        return `${day} ${thaiMonths[monthIndex]} ${thaiYear}`;
      }

      return dateStr;
    } catch (e) {
      return dateStr;
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'info') {
    if (!dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /**
   * Bind DOM Events
   */
  function bindEvents() {
    // Login Form Submit
    if (dom.loginForm) {
      dom.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = dom.pinInput.value.trim();
        if (pin === DEFAULT_PIN) {
          sessionStorage.setItem(STORAGE_KEY_AUTH, 'true');
          state.isAuthenticated = true;
          if (dom.loginError) dom.loginError.style.display = 'none';
          showToast('เข้าสู่ระบบหลังบ้านสำเร็จ!', 'success');
          showDashboard();
        } else {
          if (dom.loginError) dom.loginError.style.display = 'flex';
          dom.pinInput.select();
          dom.pinInput.focus();
        }
      });
    }

    // Logout
    if (dom.btnLogout) {
      dom.btnLogout.addEventListener('click', logout);
    }

    // Tab Navigation
    dom.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        state.currentTab = tab;

        dom.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        dom.tabContents.forEach(c => {
          c.style.display = (c.getAttribute('data-content') === tab) ? 'block' : 'none';
        });
      });
    });

    // Filters
    if (dom.searchTickets) {
      dom.searchTickets.addEventListener('input', (e) => {
        state.filters.search = e.target.value.trim();
        renderTicketsTable();
      });
    }

    if (dom.filterStatus) {
      dom.filterStatus.addEventListener('change', (e) => {
        state.filters.status = e.target.value;
        renderTicketsTable();
      });
    }

    if (dom.filterTech) {
      dom.filterTech.addEventListener('change', (e) => {
        state.filters.technician = e.target.value;
        renderTicketsTable();
      });
    }

    if (dom.sortBy) {
      dom.sortBy.addEventListener('change', (e) => {
        state.filters.sortBy = e.target.value;
        renderTicketsTable();
      });
    }

    // Refresh Button -> Sync Cloud
    if (dom.btnRefresh) {
      dom.btnRefresh.addEventListener('click', () => {
        if (state.settings.webhookUrl) {
          syncTicketsFromCloud(true);
        } else {
          loadData();
          renderAll();
          showToast('รีเฟรชข้อมูลในเครื่องเรียบร้อย (ยังไม่ได้ตั้งค่า Webhook)', 'info');
        }
      });
    }

    if (dom.btnExportCsv) {
      dom.btnExportCsv.addEventListener('click', exportCSV);
    }

    // Action Modal
    if (dom.btnCloseActionModal) dom.btnCloseActionModal.addEventListener('click', closeActionModal);
    if (dom.btnSaveTicketAction) dom.btnSaveTicketAction.addEventListener('click', saveTicketAction);
    if (dom.modalAction) {
      dom.modalAction.addEventListener('click', (e) => {
        if (e.target === dom.modalAction) closeActionModal();
      });
    }

    // Job Sheet Modal
    if (dom.btnCloseJobSheetModal) dom.btnCloseJobSheetModal.addEventListener('click', closeJobSheetModal);
    if (dom.btnPrintJobSheet) {
      dom.btnPrintJobSheet.addEventListener('click', () => {
        window.print();
      });
    }
    if (dom.modalJobSheet) {
      dom.modalJobSheet.addEventListener('click', (e) => {
        if (e.target === dom.modalJobSheet) closeJobSheetModal();
      });
    }

    // Settings Form Submit
    if (dom.settingsForm) {
      dom.settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newWebhook = dom.cfgWebhookUrl.value.trim();
        saveSettings({
          liffId: dom.cfgLiffId.value.trim(),
          lineOaId: dom.cfgLineOa.value.trim(),
          webhookUrl: newWebhook
        });
        showToast('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว', 'success');

        if (newWebhook) {
          syncTicketsFromCloud(true);
        } else {
          updateCloudStatusUI(false);
        }
      });
    }

    // Test Webhook Connection Button
    if (dom.btnTestWebhook) {
      dom.btnTestWebhook.addEventListener('click', async () => {
        const testUrl = dom.cfgWebhookUrl ? dom.cfgWebhookUrl.value.trim() : state.settings.webhookUrl;
        if (!testUrl) {
          showToast('กรุณาระบุ Webhook URL ก่อนกดทดสอบ', 'warning');
          return;
        }

        dom.btnTestWebhook.disabled = true;
        dom.btnTestWebhook.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังทดสอบ...';

        try {
          if (!window.LineService || typeof window.LineService.testConnection !== 'function') {
            throw new Error('ไม่พบโมดูล LineService กรุณารีเฟรชหน้าเว็บ');
          }

          const res = await window.LineService.testConnection(testUrl);
          if (res.success) {
            if (res.cleanedUrl && dom.cfgWebhookUrl) {
              dom.cfgWebhookUrl.value = res.cleanedUrl;
            }
            updateCloudStatusUI(true, 'ทดสอบสำเร็จ: เชื่อมต่อกับ Google Apps Script เรียบร้อย');
            showToast('เชื่อมต่อกับ Google Apps Script สำเร็จ!', 'success');
          } else {
            updateCloudStatusUI(false, res.error || 'ไม่สามารถเชื่อมต่อได้');
            showToast('การทดสอบล้มเหลว: ' + (res.error || 'ตรวจสอบ URL อีกครั้ง'), 'error');
          }
        } catch (err) {
          showToast('เกิดข้อผิดพลาดในการทดสอบ: ' + err.toString(), 'error');
        } finally {
          dom.btnTestWebhook.disabled = false;
          dom.btnTestWebhook.innerHTML = '<i class="fa-solid fa-bolt"></i> ทดสอบการเชื่อมต่อ';
        }
      });
    }

    // ESC key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeActionModal();
        closeJobSheetModal();
      }
    });

    // Auto sync storage events from other tabs
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY_TICKETS) {
        loadData();
        renderAll();
        showToast('ตรวจพบรายการแจ้งซ่อมใหม่จากลูกค้า!', 'success');
      }
    });

    // Auto poll cloud database every 45 seconds if tab is focused
    setInterval(() => {
      if (state.isAuthenticated && state.settings.webhookUrl && document.visibilityState === 'visible') {
        syncTicketsFromCloud(false);
      }
    }, 45000);
  }

  // Start on DOM ready
  document.addEventListener('DOMContentLoaded', init);

})();
