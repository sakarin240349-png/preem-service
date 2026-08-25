/**
 * ProService CARE - After-Sales Service Request System
 * Logic & State Management
 */

(function () {
  'use strict';

  // Key for localStorage persistence
  const STORAGE_KEY = 'proservice_care_tickets_v1';
  const SESSION_KEY = 'proservice_care_session_id';
  const STAFF_PIN = '1234'; // เปลี่ยน PIN ได้ที่นี่

  // สร้าง/โหลด Session ID เพื่อระบุว่าเป็นลูกค้าคนไหน
  function getOrCreateSessionId() {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  }

  const SESSION_ID = getOrCreateSessionId();

  // State Management
  let state = {
    tickets: [],
    filterStatus: 'all',
    searchQuery: '',
    currentViewingTicketId: null,
    lastCreatedTicket: null,
    isStaffMode: false, // false = ลูกค้า, true = ช่าง
    selectedPhotos: [] // รูปภาพที่เลือก (dataUrl, file, id)
  };

  // Sample initial data (Empty for live production)
  const initialSampleTickets = [];

  // DOM Elements Cache
  const elements = {
    form: document.getElementById('serviceRequestForm'),
    customerName: document.getElementById('customerName'),
    serviceLocation: document.getElementById('serviceLocation'),
    issueDetail: document.getElementById('issueDetail'),
    contactPhone: document.getElementById('contactPhone'),
    preferredDate: document.getElementById('preferredDate'),
    preferredTime: document.getElementById('preferredTime'),
    btnSubmit: document.getElementById('btnSubmitRequest'),
    btnReset: document.getElementById('btnResetForm'),
    
    // Photo Upload Elements
    photoFileInput: document.getElementById('photoFileInput'),
    photoDropZone: document.getElementById('photoDropZone'),
    photoUploadPrompt: document.getElementById('photoUploadPrompt'),
    photoPreviewGrid: document.getElementById('photoPreviewGrid'),
    
    // LINE Integration Elements
    lineUserBanner: document.getElementById('lineUserBanner'),
    lineUserName: document.getElementById('lineUserName'),
    lineUserAvatar: document.getElementById('lineUserAvatar'),
    btnLineSendChat: document.getElementById('btnLineSendChat'),
    btnLineShare: document.getElementById('btnLineShare'),
    btnLineContactOa: document.getElementById('btnLineContactOa'),
    btnLineCloseLiff: document.getElementById('btnLineCloseLiff'),
    btnDetailLineShare: document.getElementById('btnDetailLineShare'),
    btnDetailLineOa: document.getElementById('btnDetailLineOa'),

    // LINE Settings Modal
    btnOpenLineSettings: document.getElementById('btnOpenLineSettings'),
    lineSettingsModal: document.getElementById('lineSettingsModal'),
    lineSettingsCloseBtn: document.getElementById('lineSettingsCloseBtn'),
    btnLineSettingsCancel: document.getElementById('btnLineSettingsCancel'),
    lineConfigForm: document.getElementById('lineConfigForm'),
    cfgLiffId: document.getElementById('cfgLiffId'),
    cfgLineOa: document.getElementById('cfgLineOa'),
    cfgWebhookUrl: document.getElementById('cfgWebhookUrl'),

    // History Section
    ticketsContainer: document.getElementById('ticketsContainer'),
    emptyHistoryState: document.getElementById('emptyHistoryState'),
    searchHistoryInput: document.getElementById('searchHistoryInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    filterChips: document.querySelectorAll('.filter-chip'),
    ticketCountBadge: document.getElementById('ticketCountBadge'),
    cntAll: document.getElementById('cntAll'),
    cntPending: document.getElementById('cntPending'),
    cntScheduled: document.getElementById('cntScheduled'),
    cntCompleted: document.getElementById('cntCompleted'),
    btnExportCSV: document.getElementById('btnExportCSV'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    historySectionTitle: document.getElementById('historySectionTitle'),
    historySectionSubtitle: document.getElementById('historySectionSubtitle'),
    staffRoleBadge: document.getElementById('staffRoleBadge'),
    btnToggleStaffMode: document.getElementById('btnToggleStaffMode'),
    staffModeBtnText: document.getElementById('staffModeBtnText'),

    // Staff PIN Modal
    staffPinModal: document.getElementById('staffPinModal'),
    staffPinCloseBtn: document.getElementById('staffPinCloseBtn'),
    btnStaffPinCancel: document.getElementById('btnStaffPinCancel'),
    staffPinForm: document.getElementById('staffPinForm'),
    staffPinInput: document.getElementById('staffPinInput'),
    staffPinError: document.getElementById('staffPinError'),

    // Success Modal Elements
    successModal: document.getElementById('successModal'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    btnModalAcknowledge: document.getElementById('btnModalAcknowledge'),
    btnModalPrint: document.getElementById('btnModalPrint'),
    modalTicketId: document.getElementById('modalTicketId'),
    modalSummaryName: document.getElementById('modalSummaryName'),
    modalSummaryPhone: document.getElementById('modalSummaryPhone'),
    modalSummaryLocation: document.getElementById('modalSummaryLocation'),
    modalSummaryIssue: document.getElementById('modalSummaryIssue'),
    modalSummaryDate: document.getElementById('modalSummaryDate'),
    modalSummaryTime: document.getElementById('modalSummaryTime'),

    // Detail Modal Elements
    detailModal: document.getElementById('detailModal'),
    detailCloseBtn: document.getElementById('detailCloseBtn'),
    btnDetailClose: document.getElementById('btnDetailClose'),
    detailTicketId: document.getElementById('detailTicketId'),
    detailStatusBadge: document.getElementById('detailStatusBadge'),
    detailContentBody: document.getElementById('detailContentBody'),

    // Mobile Bottom Navigation
    mNavForm: document.getElementById('mNavForm'),
    mNavHistory: document.getElementById('mNavHistory'),
    mNavLineOa: document.getElementById('mNavLineOa'),
    mNavSettings: document.getElementById('mNavSettings'),
    mTicketCountBadge: document.getElementById('mTicketCountBadge'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer')
  };

  /**
   * Initialize Application
   */
  function init() {
    loadTicketsFromStorage();
    setupMinDatePicker();
    bindEvents();
    renderTickets();
    updateCounts();
    initLineIntegration();
  }

  /**
   * Initialize LINE Integration & Profile Fetching
   */
  async function initLineIntegration() {
    if (window.LineService) {
      try {
        const lineState = await window.LineService.initLiff();
        if (lineState && lineState.profile) {
          if (elements.lineUserBanner) {
            elements.lineUserBanner.style.display = 'flex';
          }
          if (elements.lineUserName) {
            elements.lineUserName.textContent = lineState.profile.displayName;
          }
          if (elements.lineUserAvatar && lineState.profile.pictureUrl) {
            elements.lineUserAvatar.innerHTML = `<img src="${lineState.profile.pictureUrl}" alt="LINE Profile" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
          }
          if (elements.customerName && !elements.customerName.value) {
            elements.customerName.value = lineState.profile.displayName;
          }
        }
        if (lineState && lineState.isInLineClient) {
          if (elements.btnLineCloseLiff) {
            elements.btnLineCloseLiff.style.display = 'inline-flex';
          }
        }
      } catch (err) {
        console.warn('LINE LIFF initialization skipped or errored:', err);
      }
    }
  }

  // Helper to check if a ticket belongs to current customer
  function isCustomerTicket(ticket) {
    if (!ticket) return false;
    const currentProfile = (window.LineService && window.LineService.getState().profile) || null;
    if (currentProfile && currentProfile.userId && ticket.lineUserId && ticket.lineUserId === currentProfile.userId) {
      return true;
    }
    return Boolean(ticket.sessionId && ticket.sessionId === SESSION_ID);
  }

  /**
   * Load tickets from localStorage (Clean state for customers)
   */
  function loadTicketsFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        state.tickets = JSON.parse(stored);
      } else {
        state.tickets = [];
        saveTicketsToStorage();
      }
    } catch (e) {
      console.warn('LocalStorage error, using memory fallback:', e);
      state.tickets = [];
    }
  }

  /**
   * Save tickets state to localStorage
   */
  function saveTicketsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tickets));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  /**
   * Compress image to Canvas and export as JPEG Base64
   */
  function compressImage(file, maxDimension = 1024, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Handle Photo Files Selection
   */
  async function handlePhotoFiles(files) {
    if (!files || files.length === 0) return;

    const remainingSlots = 3 - state.selectedPhotos.length;
    if (remainingSlots <= 0) {
      showToast('สามารถแนบรูปภาพได้สูงสุด 3 รูปเท่านั้น', 'warning');
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) {
        showToast('กรุณาเลือกไฟล์ที่เป็นรูปภาพเท่านั้น', 'warning');
        continue;
      }

      try {
        const compressedDataUrl = await compressImage(file);
        state.selectedPhotos.push({
          id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          dataUrl: compressedDataUrl,
          name: file.name
        });
      } catch (err) {
        console.error('Image compression error:', err);
      }
    }

    renderPhotoPreviews();
  }

  /**
   * Render Photo Previews
   */
  function renderPhotoPreviews() {
    if (!elements.photoPreviewGrid || !elements.photoUploadPrompt) return;

    if (state.selectedPhotos.length === 0) {
      elements.photoUploadPrompt.style.display = 'flex';
      elements.photoPreviewGrid.style.display = 'none';
      elements.photoPreviewGrid.innerHTML = '';
      return;
    }

    elements.photoUploadPrompt.style.display = 'none';
    elements.photoPreviewGrid.style.display = 'grid';

    let cardsHtml = state.selectedPhotos.map((photo, idx) => `
      <div class="photo-preview-card" data-idx="${idx}">
        <img src="${photo.dataUrl}" alt="รูปถ่ายหน้างาน ${idx + 1}" />
        <button type="button" class="btn-remove-photo" title="ลบรูปนี้" onclick="window.removeSelectedPhoto(${idx})">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `).join('');

    if (state.selectedPhotos.length < 3) {
      cardsHtml += `
        <div class="photo-add-more-btn" onclick="document.getElementById('photoFileInput').click()">
          <i class="fa-solid fa-plus" style="font-size: 1.1rem;"></i>
          <span>เพิ่มรูป (${state.selectedPhotos.length}/3)</span>
        </div>
      `;
    }

    elements.photoPreviewGrid.innerHTML = cardsHtml;
  }

  window.removeSelectedPhoto = function (index) {
    if (state.selectedPhotos && state.selectedPhotos[index] !== undefined) {
      state.selectedPhotos.splice(index, 1);
      renderPhotoPreviews();
    }
  };

  /**
   * Set minimum date to today so users cannot pick past dates
   */
  function setupMinDatePicker() {
    if (elements.preferredDate) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      elements.preferredDate.min = `${yyyy}-${mm}-${dd}`;
    }
  }

  /**
   * Format Thai Phone Number (0xx-xxx-xxxx)
   */
  function formatThaiPhoneNumber(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  /**
   * Validate Thai 10-digit phone number
   * Format: Starts with 0 (usually 06, 08, 09 for mobile or 02, 03, 04, 05, 07 for landlines) and has 10 digits
   */
  function validateThaiPhone(phoneStr) {
    const cleanDigits = phoneStr.replace(/\D/g, '');
    // Thai phone numbers are 10 digits starting with 0
    return /^0[0-9]{9}$/.test(cleanDigits);
  }

  /**
   * Format Date to Thai readable format
   */
  function formatThaiDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      
      const thaiMonths = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
      ];
      
      const day = date.getDate();
      const month = thaiMonths[date.getMonth()];
      const year = date.getFullYear() + 543; // Buddhist Era
      
      return `${day} ${month} ${year}`;
    } catch (e) {
      return dateStr;
    }
  }

  /**
   * Format Relative Time Ago (e.g. 5 นาทีที่แล้ว, เมื่อสักครู่)
   */
  function timeAgo(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'เมื่อสักครู่';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ชั่วโมงที่แล้ว`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} วันที่แล้ว`;
    return formatThaiDate(isoString);
  }

  /**
   * Generate Next Ticket ID
   */
  function generateTicketId() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    return `REQ-${yyyy}${mm}${dd}-${randomSuffix}`;
  }

  /**
   * Highlight error on a form group
   */
  function setFieldError(fieldId, isError, customMessage) {
    const group = document.getElementById(`group-${fieldId}`);
    const errorElem = document.getElementById(`error-${fieldId}`);
    
    if (!group) return;

    if (isError) {
      group.classList.add('has-error');
      group.classList.add('shake-field');
      if (customMessage && errorElem) {
        errorElem.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${customMessage}`;
      }
      setTimeout(() => group.classList.remove('shake-field'), 500);
    } else {
      group.classList.remove('has-error');
    }
  }

  /**
   * Clear all form validation errors
   */
  function clearAllErrors() {
    ['customerName', 'serviceLocation', 'issueDetail', 'contactPhone', 'preferredDate', 'preferredTime'].forEach(id => {
      setFieldError(id, false);
    });
  }

  /**
   * Validate entire form
   */
  function validateForm() {
    let isValid = true;
    let firstInvalidElem = null;

    // 1. Customer Name
    const nameVal = elements.customerName.value.trim();
    if (!nameVal) {
      setFieldError('customerName', true, 'กรุณากรอกชื่อลูกค้า');
      isValid = false;
      if (!firstInvalidElem) firstInvalidElem = elements.customerName;
    } else {
      setFieldError('customerName', false);
    }

    // 2. Service Location
    const locVal = elements.serviceLocation.value.trim();
    if (!locVal) {
      setFieldError('serviceLocation', true, 'กรุณากรอกสถานที่หรือที่อยู่หน้างาน');
      isValid = false;
      if (!firstInvalidElem) firstInvalidElem = elements.serviceLocation;
    } else {
      setFieldError('serviceLocation', false);
    }

    // 3. Issue Detail
    const issueVal = elements.issueDetail.value.trim();
    if (!issueVal) {
      setFieldError('issueDetail', true, 'กรุณากรอกรายละเอียดปัญหา');
      isValid = false;
      if (!firstInvalidElem) firstInvalidElem = elements.issueDetail;
    } else {
      setFieldError('issueDetail', false);
    }

    // 4. Contact Phone
    const phoneVal = elements.contactPhone.value.trim();
    if (!phoneVal) {
      setFieldError('contactPhone', true, 'กรุณากรอกเบอร์ติดต่อกลับ');
      isValid = false;
      if (!firstInvalidElem) firstInvalidElem = elements.contactPhone;
    } else if (!validateThaiPhone(phoneVal)) {
      setFieldError('contactPhone', true, 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก (ขึ้นต้นด้วย 0 เช่น 08x, 09x, 06x)');
      isValid = false;
      if (!firstInvalidElem) firstInvalidElem = elements.contactPhone;
    } else {
      setFieldError('contactPhone', false);
    }

    // 5. Preferred Date
    const dateVal = elements.preferredDate.value;
    if (!dateVal) {
      setFieldError('preferredDate', true, 'กรุณาเลือกวันที่สะดวกให้เข้าไปแก้ไข');
      isValid = false;
      if (!firstInvalidElem) firstInvalidElem = elements.preferredDate;
    } else {
      setFieldError('preferredDate', false);
    }

    // 6. Preferred Time
    const timeVal = elements.preferredTime.value;
    if (!timeVal) {
      setFieldError('preferredTime', true, 'กรุณาเลือกช่วงเวลาที่สะดวก');
      isValid = false;
      if (!firstInvalidElem) firstInvalidElem = elements.preferredTime;
    } else {
      setFieldError('preferredTime', false);
    }

    if (!isValid && firstInvalidElem) {
      firstInvalidElem.focus();
      firstInvalidElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง', 'error');
    }

    return isValid;
  }

  /**
   * Handle Form Submission
   */
  function handleFormSubmit(e) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Show loading state
    const submitBtn = elements.btnSubmit;
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-flex';
    submitBtn.disabled = true;

    // Simulate small processing delay for realistic UX
    setTimeout(() => {
      const currentProfile = (window.LineService && window.LineService.getState().profile) || null;
      const photoUrls = state.selectedPhotos.map(p => p.dataUrl);

      const newTicket = {
        id: generateTicketId(),
        customerName: elements.customerName.value.trim(),
        serviceLocation: elements.serviceLocation.value.trim(),
        issueDetail: elements.issueDetail.value.trim(),
        contactPhone: elements.contactPhone.value.trim(),
        preferredDate: elements.preferredDate.value,
        preferredTime: elements.preferredTime.value,
        status: 'รอติดต่อกลับ', // Required default status
        createdAt: new Date().toISOString(),
        sessionId: SESSION_ID, // ระบุว่าเป็น ticket ของ session นี้
        lineUserId: currentProfile ? currentProfile.userId : null,
        photos: photoUrls,
        photoUrls: photoUrls
      };

      state.lastCreatedTicket = newTicket;

      // Add to beginning of ticket list
      state.tickets.unshift(newTicket);
      saveTicketsToStorage();

      // Trigger Webhook Notification in background if configured
      if (window.LineService) {
        window.LineService.sendAdminWebhookNotification(newTicket);
      }

      // Reset loading state
      btnText.style.display = 'inline-flex';
      btnLoading.style.display = 'none';
      submitBtn.disabled = false;

      // Show Success Modal with summary
      showSuccessModal(newTicket);

      // Reset the form & selected photos
      const currentLineName = (window.LineService && window.LineService.getState().profile) 
        ? window.LineService.getState().profile.displayName 
        : '';
      elements.form.reset();
      state.selectedPhotos = [];
      renderPhotoPreviews();

      if (currentLineName) {
        elements.customerName.value = currentLineName;
      }
      clearAllErrors();

      // Refresh list & counts
      renderTickets();
      updateCounts();

      showToast('บันทึกคำขอแจ้งซ่อมสำเร็จ!', 'success');
    }, 450);
  }

  /**
   * Show Custom Success Confirmation Modal
   */
  function showSuccessModal(ticket) {
    elements.modalTicketId.textContent = ticket.id;
    elements.modalSummaryName.textContent = ticket.customerName;
    elements.modalSummaryPhone.textContent = ticket.contactPhone;
    elements.modalSummaryLocation.textContent = ticket.serviceLocation;
    elements.modalSummaryIssue.textContent = ticket.issueDetail;
    elements.modalSummaryDate.textContent = formatThaiDate(ticket.preferredDate);
    elements.modalSummaryTime.textContent = ticket.preferredTime;

    elements.successModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  /**
   * Close Success Modal
   */
  function closeSuccessModal() {
    elements.successModal.style.display = 'none';
    document.body.style.overflow = '';
  }

  /**
  /**
   * Update Progress Tracker in Detail Modal
   */
  function updateProgressTracker(status) {
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const c1 = document.getElementById('connector1');
    const c2 = document.getElementById('connector2');

    if (!step1 || !step2 || !step3) return;

    // Reset all steps
    [step1, step2, step3].forEach(s => s.classList.remove('completed', 'active'));
    if (c1) c1.classList.remove('active');
    if (c2) c2.classList.remove('active');

    step1.classList.add('completed');

    if (status === 'รอติดต่อกลับ') {
      step1.classList.add('active');
    } else if (status === 'นัดหมายแล้ว') {
      step1.classList.add('completed');
      if (c1) c1.classList.add('active');
      step2.classList.add('completed', 'active');
    } else if (status === 'เสร็จสิ้น') {
      step1.classList.add('completed');
      if (c1) c1.classList.add('active');
      step2.classList.add('completed');
      if (c2) c2.classList.add('active');
      step3.classList.add('completed', 'active');
    }
  }

  /**
   * Show Ticket Detail Modal
   */
  function showTicketDetail(ticketId) {
    const ticket = state.tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    // Security check: ลูกค้าเปิดดูได้เฉพาะ ticket ของตัวเองเท่านั้น
    if (!state.isStaffMode && !isCustomerTicket(ticket)) {
      showToast('คุณไม่มีสิทธิ์ดูข้อมูลรายการนี้', 'error');
      return;
    }

    state.currentViewingTicketId = ticketId;
    elements.detailTicketId.textContent = `#${ticket.id}`;
    
    // Status Badge HTML
    elements.detailStatusBadge.innerHTML = getStatusBadgeHTML(ticket.status);

    // Detail Body HTML
    elements.detailContentBody.innerHTML = `
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">ชื่อลูกค้า:</span>
          <span class="summary-val">${escapeHTML(ticket.customerName)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">เบอร์ติดต่อกลับ:</span>
          <span class="summary-val">${escapeHTML(ticket.contactPhone)}</span>
        </div>
        <div class="summary-item full-width">
          <span class="summary-label">สถานที่ / หน้างาน:</span>
          <span class="summary-val">${escapeHTML(ticket.serviceLocation)}</span>
        </div>
        <div class="summary-item full-width">
          <span class="summary-label">รายละเอียดปัญหา:</span>
          <span class="summary-val" style="white-space: pre-line;">${escapeHTML(ticket.issueDetail)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">วันที่ต้องการให้เข้าตรวจ:</span>
          <span class="summary-val text-primary-dark">${formatThaiDate(ticket.preferredDate)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">เวลาที่สะดวก:</span>
          <span class="summary-val text-primary-dark">${escapeHTML(ticket.preferredTime)}</span>
        </div>
        <div class="summary-item full-width">
          <span class="summary-label">เวลาที่บันทึกข้อมูล:</span>
          <span class="summary-val" style="font-weight: normal; color: var(--slate-500);">${new Date(ticket.createdAt).toLocaleString('th-TH')} (${timeAgo(ticket.createdAt)})</span>
        </div>
        ${(() => {
          const photos = ticket.photoUrls || ticket.photos || [];
          if (!photos || photos.length === 0) return '';
          return `
            <div class="summary-item full-width" style="margin-top: 8px; border-top: 1px dashed #e2e8f0; padding-top: 10px;">
              <span class="summary-label"><i class="fa-solid fa-camera"></i> รูปถ่ายหน้างาน (${photos.length} รูป):</span>
              <div style="display: flex; gap: 10px; margin-top: 8px; flex-wrap: wrap;">
                ${photos.map((url, i) => `
                  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: block; width: 84px; height: 84px; border-radius: 8px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.06); transition: transform 0.2s;" title="คลิกเพื่อดูรูปขนาดเต็ม">
                    <img src="${url}" alt="รูปที่ ${i + 1}" style="width: 100%; height: 100%; object-fit: cover;" />
                  </a>
                `).join('')}
              </div>
            </div>
          `;
        })()}
      </div>
    `;

    // Update customer progress tracker
    updateProgressTracker(ticket.status);

    // Show/Hide Staff status modifier based on role
    const modifierSection = document.getElementById('detailStatusModifierSection');
    if (modifierSection) {
      if (state.isStaffMode) {
        modifierSection.style.display = 'block';
        document.querySelectorAll('.btn-status-change').forEach(btn => {
          if (btn.getAttribute('data-newstatus') === ticket.status) {
            btn.classList.add('active-status-btn');
          } else {
            btn.classList.remove('active-status-btn');
          }
        });
      } else {
        modifierSection.style.display = 'none';
      }
    }

    elements.detailModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  /**
   * Close Detail Modal
   */
  function closeDetailModal() {
    elements.detailModal.style.display = 'none';
    document.body.style.overflow = '';
    state.currentViewingTicketId = null;
  }

  /**
   * Update Status of a Ticket (Strictly allowed for Staff only)
   */
  function updateTicketStatus(ticketId, newStatus) {
    if (!state.isStaffMode) {
      showToast('ไม่อนุญาตให้แก้ไข: เฉพาะทีมช่าง/แอดมินเท่านั้นที่มีสิทธิ์เปลี่ยนสถานะ', 'error');
      return;
    }

    const ticketIndex = state.tickets.findIndex(t => t.id === ticketId);
    if (ticketIndex === -1) return;

    state.tickets[ticketIndex].status = newStatus;
    saveTicketsToStorage();
    
    // Update active modal if open
    if (elements.detailStatusBadge) {
      elements.detailStatusBadge.innerHTML = getStatusBadgeHTML(newStatus);
    }
    
    // Update tracker & active buttons
    updateProgressTracker(newStatus);
    document.querySelectorAll('.btn-status-change').forEach(btn => {
      if (btn.getAttribute('data-newstatus') === newStatus) {
        btn.classList.add('active-status-btn');
      } else {
        btn.classList.remove('active-status-btn');
      }
    });

    renderTickets();
    updateCounts();
    showToast(`อัปเดตสถานะเป็น "${newStatus}" เรียบร้อยแล้ว`, 'info');
  }

  /**
   * Helper to generate Status Badge HTML
   */
  function getStatusBadgeHTML(status) {
    if (status === 'รอติดต่อกลับ') {
      return `<span class="status-badge status-pending"><i class="fa-solid fa-hourglass-half"></i> รอติดต่อกลับ</span>`;
    } else if (status === 'นัดหมายแล้ว') {
      return `<span class="status-badge status-scheduled"><i class="fa-solid fa-calendar-check"></i> นัดหมายแล้ว</span>`;
    } else if (status === 'เสร็จสิ้น') {
      return `<span class="status-badge status-completed"><i class="fa-solid fa-circle-check"></i> เสร็จสิ้น</span>`;
    } else {
      return `<span class="status-badge status-pending">${escapeHTML(status)}</span>`;
    }
  }

  /**
   * Render Tickets List
   */
  function renderTickets() {
    const container = elements.ticketsContainer;
    const emptyState = elements.emptyHistoryState;

    if (!container) return;

    // === Role-based Filter: ลูกค้าเห็นแค่ ticket ของตัวเอง, ช่างเห็นทั้งหมด ===
    let visibleTickets = state.isStaffMode
      ? state.tickets
      : state.tickets.filter(t => isCustomerTicket(t));

    // Filter tickets
    let filtered = visibleTickets.filter(t => {
      // Status filter
      if (state.filterStatus !== 'all' && t.status !== state.filterStatus) {
        return false;
      }
      // Search filter
      if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        const matchName = t.customerName.toLowerCase().includes(q);
        const matchPhone = t.contactPhone.replace(/\D/g, '').includes(q.replace(/\D/g, ''));
        const matchId = t.id.toLowerCase().includes(q);
        const matchLocation = t.serviceLocation.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchId && !matchLocation) {
          return false;
        }
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    container.innerHTML = filtered.map(t => {
      let cardClass = 'status-pending-card';
      if (t.status === 'นัดหมายแล้ว') cardClass = 'status-scheduled-card';
      if (t.status === 'เสร็จสิ้น') cardClass = 'status-completed-card';

      return `
        <article class="ticket-item-card ${cardClass}" data-id="${t.id}">
          <div class="ticket-header-row">
            <span class="ticket-code"><i class="fa-solid fa-ticket text-blue"></i> #${escapeHTML(t.id)}</span>
            <span class="ticket-time-ago"><i class="fa-regular fa-clock"></i> ${timeAgo(t.createdAt)}</span>
          </div>

          <div class="ticket-body-meta">
            <div class="ticket-meta-line">
              <i class="fa-solid fa-user"></i>
              <span>ชื่อลูกค้า: <strong class="ticket-customer-name">${escapeHTML(t.customerName)}</strong></span>
            </div>
            <div class="ticket-meta-line">
              <i class="fa-solid fa-phone"></i>
              <span>เบอร์ติดต่อ: <strong>${escapeHTML(t.contactPhone)}</strong></span>
            </div>
            <div class="ticket-meta-line">
              <i class="fa-solid fa-calendar-days"></i>
              <span>นัดหมาย: <strong>${formatThaiDate(t.preferredDate)}</strong> (${escapeHTML(t.preferredTime)})</span>
            </div>
            <div class="ticket-issue-preview">
              <i class="fa-solid fa-wrench" style="color: var(--slate-400); margin-right: 4px;"></i>
              <strong>ปัญหา:</strong> ${escapeHTML(t.issueDetail)}
            </div>
          </div>

          <div class="ticket-footer-row">
            <div>
              ${getStatusBadgeHTML(t.status)}
            </div>
            <button type="button" class="btn-ticket-view" onclick="window.viewTicketDetail('${t.id}')">
              <span>ดูข้อมูล</span> <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  /**
   * Update live counts for tabs & badges
   */
  function updateCounts() {
    const visibleTickets = state.isStaffMode
      ? state.tickets
      : state.tickets.filter(t => isCustomerTicket(t));

    const total = visibleTickets.length;
    const pending = visibleTickets.filter(t => t.status === 'รอติดต่อกลับ').length;
    const scheduled = visibleTickets.filter(t => t.status === 'นัดหมายแล้ว').length;
    const completed = visibleTickets.filter(t => t.status === 'เสร็จสิ้น').length;

    if (elements.ticketCountBadge) elements.ticketCountBadge.textContent = total;
    if (elements.mTicketCountBadge) elements.mTicketCountBadge.textContent = total;
    if (elements.cntAll) elements.cntAll.textContent = total;
    if (elements.cntPending) elements.cntPending.textContent = pending;
    if (elements.cntScheduled) elements.cntScheduled.textContent = scheduled;
    if (elements.cntCompleted) elements.cntCompleted.textContent = completed;
  }

  /**
   * Show Toast Notification
   */
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
    
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /**
   * Export Tickets to CSV
   */
  function exportCSV() {
    if (state.tickets.length === 0) {
      showToast('ไม่มีข้อมูลสำหรับส่งออก', 'error');
      return;
    }

    const headers = ['รหัสใบแจ้งซ่อม', 'ชื่อลูกค้า', 'สถานที่', 'รายละเอียดปัญหา', 'เบอร์ติดต่อกลับ', 'วันที่สะดวก', 'เวลาที่สะดวก', 'สถานะ', 'เวลาที่บันทึก'];
    const rows = state.tickets.map(t => [
      `"${t.id}"`,
      `"${(t.customerName || '').replace(/"/g, '""')}"`,
      `"${(t.serviceLocation || '').replace(/"/g, '""')}"`,
      `"${(t.issueDetail || '').replace(/"/g, '""')}"`,
      `"${t.contactPhone || ''}"`,
      `"${t.preferredDate || ''}"`,
      `"${t.preferredTime || ''}"`,
      `"${t.status || ''}"`,
      `"${t.createdAt || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Preem_Group_Service_Requests_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('ส่งออกไฟล์ CSV สำเร็จ', 'success');
  }

  /**
   * Clear all tickets with confirmation
   */
  function clearAllTickets() {
    if (!state.isStaffMode) {
      showToast('เฉพาะทีมช่าง/แอดมินเท่านั้นที่มีสิทธิ์ล้างประวัติข้อมูล', 'error');
      return;
    }

    if (state.tickets.length === 0) {
      showToast('ไม่มีประวัติข้อมูล', 'info');
      return;
    }

    if (confirm('คุณต้องการล้างประวัติการแจ้งซ่อมทั้งหมดหรือไม่?')) {
      state.tickets = [];
      saveTicketsToStorage();
      renderTickets();
      updateCounts();
      showToast('ล้างข้อมูลประวัติเรียบร้อยแล้ว', 'info');
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Bind DOM Events
   */
  function bindEvents() {
    // Form Submit
    elements.form.addEventListener('submit', handleFormSubmit);

    // Form Reset
    elements.btnReset.addEventListener('click', () => {
      elements.form.reset();
      state.selectedPhotos = [];
      renderPhotoPreviews();
      clearAllErrors();
      showToast('ล้างฟอร์มเรียบร้อยแล้ว', 'info');
    });

    // Photo File Input Change
    if (elements.photoFileInput) {
      elements.photoFileInput.addEventListener('change', (e) => {
        handlePhotoFiles(e.target.files);
        elements.photoFileInput.value = '';
      });
    }

    // Photo Upload Prompt Click & Keyboard
    if (elements.photoUploadPrompt) {
      elements.photoUploadPrompt.addEventListener('click', () => {
        if (elements.photoFileInput) elements.photoFileInput.click();
      });
      elements.photoUploadPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (elements.photoFileInput) elements.photoFileInput.click();
        }
      });
    }

    // Photo Drag & Drop on Zone
    if (elements.photoDropZone) {
      ['dragenter', 'dragover'].forEach(evt => {
        elements.photoDropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          elements.photoDropZone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(evt => {
        elements.photoDropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          elements.photoDropZone.classList.remove('dragover');
        });
      });

      elements.photoDropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files) {
          handlePhotoFiles(e.dataTransfer.files);
        }
      });
    }

    // Real-time phone formatting & validation check
    elements.contactPhone.addEventListener('input', (e) => {
      const formatted = formatThaiPhoneNumber(e.target.value);
      e.target.value = formatted;
      
      const phoneIcon = document.getElementById('phoneValidIcon');
      if (validateThaiPhone(formatted)) {
        setFieldError('contactPhone', false);
        if (phoneIcon) phoneIcon.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success-500);"></i>`;
      } else {
        if (phoneIcon) phoneIcon.innerHTML = `<i class="fa-solid fa-mobile-screen"></i>`;
      }
    });

    // Clear field error upon typing
    ['customerName', 'serviceLocation', 'issueDetail', 'preferredDate', 'preferredTime'].forEach(id => {
      const elem = elements[id];
      if (elem) {
        elem.addEventListener('input', () => setFieldError(id, false));
        elem.addEventListener('change', () => setFieldError(id, false));
      }
    });

    // Location Quick Helper Pills
    document.querySelectorAll('.location-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const textToInsert = pill.getAttribute('data-insert');
        elements.serviceLocation.value = textToInsert + elements.serviceLocation.value;
        elements.serviceLocation.focus();
        setFieldError('serviceLocation', false);
      });
    });

    // Issue Quick Helper Pills
    document.querySelectorAll('.issue-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const textToInsert = pill.getAttribute('data-insert');
        if (elements.issueDetail.value) {
          elements.issueDetail.value = elements.issueDetail.value + ' | ' + textToInsert;
        } else {
          elements.issueDetail.value = textToInsert;
        }
        elements.issueDetail.focus();
        setFieldError('issueDetail', false);
      });
    });

    // Search filter
    elements.searchHistoryInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      elements.btnClearSearch.style.display = state.searchQuery ? 'block' : 'none';
      renderTickets();
    });

    elements.btnClearSearch.addEventListener('click', () => {
      elements.searchHistoryInput.value = '';
      state.searchQuery = '';
      elements.btnClearSearch.style.display = 'none';
      renderTickets();
      elements.searchHistoryInput.focus();
    });

    // Status Filter Chips
    elements.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        elements.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filterStatus = chip.getAttribute('data-status');
        renderTickets();
      });
    });

    // Modal Close Buttons
    elements.modalCloseBtn.addEventListener('click', closeSuccessModal);
    elements.btnModalAcknowledge.addEventListener('click', closeSuccessModal);
    elements.btnModalPrint.addEventListener('click', () => {
      window.print();
    });

    elements.detailCloseBtn.addEventListener('click', closeDetailModal);
    elements.btnDetailClose.addEventListener('click', closeDetailModal);

    // Close Modals on clicking background overlay
    elements.successModal.addEventListener('click', (e) => {
      if (e.target === elements.successModal) closeSuccessModal();
    });

    elements.detailModal.addEventListener('click', (e) => {
      if (e.target === elements.detailModal) closeDetailModal();
    });

    // Keyboard ESC to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSuccessModal();
        closeDetailModal();
      }
    });

    // Status Modifier buttons inside detail modal
    document.querySelectorAll('.btn-status-change').forEach(btn => {
      btn.addEventListener('click', () => {
        const newStatus = btn.getAttribute('data-newstatus');
        if (state.currentViewingTicketId) {
          updateTicketStatus(state.currentViewingTicketId, newStatus);
        }
      });
    });

    // Export CSV and Clear History
    elements.btnExportCSV.addEventListener('click', exportCSV);
    elements.btnClearHistory.addEventListener('click', clearAllTickets);

    // =========================================================================
    // LINE Integration Event Handlers
    // =========================================================================

    // 1. Send Message to current LINE Chat
    if (elements.btnLineSendChat) {
      elements.btnLineSendChat.addEventListener('click', async () => {
        if (!state.lastCreatedTicket) return;
        if (window.LineService) {
          const res = await window.LineService.sendMessageToChat(state.lastCreatedTicket);
          if (res.success) {
            showToast('ส่งสรุปใบแจ้งซ่อมเข้าแชท LINE สำเร็จ!', 'success');
          } else {
            // If failed because not inside in-app LIFF client, fallback to LINE Share
            showToast('กำลังเปิดหน้าต่างแชร์ข้อความ LINE...', 'info');
            window.LineService.shareTicketToLine(state.lastCreatedTicket);
          }
        }
      });
    }

    // 2. Share Ticket to LINE Chat/Group
    if (elements.btnLineShare) {
      elements.btnLineShare.addEventListener('click', () => {
        if (state.lastCreatedTicket && window.LineService) {
          window.LineService.shareTicketToLine(state.lastCreatedTicket);
        }
      });
    }

    // 3. Contact Admin via LINE OA
    if (elements.btnLineContactOa) {
      elements.btnLineContactOa.addEventListener('click', () => {
        if (window.LineService) {
          window.LineService.openLineOaChat(state.lastCreatedTicket ? state.lastCreatedTicket.id : '');
        }
      });
    }

    // 4. Close LIFF Window
    if (elements.btnLineCloseLiff) {
      elements.btnLineCloseLiff.addEventListener('click', () => {
        if (window.LineService) {
          window.LineService.closeLiffWindow();
        }
      });
    }

    // 5. LINE Actions in Detail Modal
    if (elements.btnDetailLineShare) {
      elements.btnDetailLineShare.addEventListener('click', () => {
        const ticket = state.tickets.find(t => t.id === state.currentViewingTicketId);
        if (ticket && window.LineService) {
          window.LineService.shareTicketToLine(ticket);
        }
      });
    }

    if (elements.btnDetailLineOa) {
      elements.btnDetailLineOa.addEventListener('click', () => {
        if (window.LineService) {
          window.LineService.openLineOaChat(state.currentViewingTicketId);
        }
      });
    }

    // 6. LINE Settings Modal
    function openLineSettingsModal() {
      if (window.LineService) {
        const cfg = window.LineService.getConfig();
        if (elements.cfgLiffId) elements.cfgLiffId.value = cfg.liffId || '';
        if (elements.cfgLineOa) elements.cfgLineOa.value = cfg.lineOaId || '';
        if (elements.cfgWebhookUrl) elements.cfgWebhookUrl.value = cfg.webhookUrl || '';
      }
      if (elements.lineSettingsModal) {
        elements.lineSettingsModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }

    function closeLineSettingsModal() {
      if (elements.lineSettingsModal) {
        elements.lineSettingsModal.style.display = 'none';
        document.body.style.overflow = '';
      }
    }

    if (elements.btnOpenLineSettings) {
      elements.btnOpenLineSettings.addEventListener('click', openLineSettingsModal);
    }
    if (elements.lineSettingsCloseBtn) {
      elements.lineSettingsCloseBtn.addEventListener('click', closeLineSettingsModal);
    }
    if (elements.btnLineSettingsCancel) {
      elements.btnLineSettingsCancel.addEventListener('click', closeLineSettingsModal);
    }
    if (elements.lineSettingsModal) {
      elements.lineSettingsModal.addEventListener('click', (e) => {
        if (e.target === elements.lineSettingsModal) closeLineSettingsModal();
      });
    }

    if (elements.lineConfigForm) {
      elements.lineConfigForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (window.LineService) {
          window.LineService.saveConfig({
            liffId: elements.cfgLiffId.value.trim(),
            lineOaId: elements.cfgLineOa.value.trim(),
            webhookUrl: elements.cfgWebhookUrl.value.trim()
          });
          showToast('บันทึกการตั้งค่า LINE สำเร็จ!', 'success');
          closeLineSettingsModal();
          initLineIntegration();
        }
      });
    }

    // =========================================================================
    // Staff / Technician Mode Handlers
    // =========================================================================
    function openStaffPinModal() {
      if (elements.staffPinInput) elements.staffPinInput.value = '';
      if (elements.staffPinError) elements.staffPinError.style.display = 'none';
      if (elements.staffPinModal) {
        elements.staffPinModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setTimeout(() => elements.staffPinInput && elements.staffPinInput.focus(), 150);
      }
    }

    function closeStaffPinModal() {
      if (elements.staffPinModal) {
        elements.staffPinModal.style.display = 'none';
        document.body.style.overflow = '';
      }
    }

    function setStaffMode(enabled) {
      state.isStaffMode = enabled;
      if (enabled) {
        if (elements.staffRoleBadge) elements.staffRoleBadge.style.display = 'inline-flex';
        if (elements.staffModeBtnText) elements.staffModeBtnText.textContent = 'ออกจากโหมดช่าง';
        if (elements.btnExportCSV) elements.btnExportCSV.style.display = 'inline-flex';
        if (elements.btnClearHistory) elements.btnClearHistory.style.display = 'inline-flex';
        if (elements.historySectionTitle) elements.historySectionTitle.textContent = 'ประวัติการแจ้งซ่อมทั้งหมด (โหมดทีมช่าง)';
        if (elements.historySectionSubtitle) elements.historySectionSubtitle.textContent = 'รายการคำขอทั้งหมดในระบบ (สิทธิ์ผู้ดูแล/ทีมช่าง)';
        showToast('เข้าสู่โหมดทีมช่าง/แอดมิน เรียบร้อยแล้ว', 'success');
      } else {
        if (elements.staffRoleBadge) elements.staffRoleBadge.style.display = 'none';
        if (elements.staffModeBtnText) elements.staffModeBtnText.textContent = 'สำหรับช่าง';
        if (elements.btnExportCSV) elements.btnExportCSV.style.display = 'none';
        if (elements.btnClearHistory) elements.btnClearHistory.style.display = 'none';
        if (elements.historySectionTitle) elements.historySectionTitle.textContent = 'ประวัติการแจ้งซ่อมของฉัน';
        if (elements.historySectionSubtitle) elements.historySectionSubtitle.textContent = 'รายการที่คุณส่งคำขอไว้ในระบบ';
        showToast('กลับสู่โหมดลูกค้าทั่วไป', 'info');
      }
      renderTickets();
      updateCounts();
    }

    if (elements.btnToggleStaffMode) {
      elements.btnToggleStaffMode.addEventListener('click', () => {
        if (state.isStaffMode) {
          setStaffMode(false);
        } else {
          openStaffPinModal();
        }
      });
    }

    if (elements.staffPinCloseBtn) elements.staffPinCloseBtn.addEventListener('click', closeStaffPinModal);
    if (elements.btnStaffPinCancel) elements.btnStaffPinCancel.addEventListener('click', closeStaffPinModal);
    if (elements.staffPinModal) {
      elements.staffPinModal.addEventListener('click', (e) => {
        if (e.target === elements.staffPinModal) closeStaffPinModal();
      });
    }

    if (elements.staffPinForm) {
      elements.staffPinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = elements.staffPinInput.value.trim();
        if (pin === STAFF_PIN) {
          closeStaffPinModal();
          setStaffMode(true);
        } else {
          if (elements.staffPinError) elements.staffPinError.style.display = 'flex';
          elements.staffPinInput.select();
          elements.staffPinInput.focus();
        }
      });
    }

    // =========================================================================
    // Mobile Bottom Navigation Handlers
    // =========================================================================
    if (elements.mNavForm) {
      elements.mNavForm.addEventListener('click', () => {
        if (elements.mNavForm) elements.mNavForm.classList.add('active');
        if (elements.mNavHistory) elements.mNavHistory.classList.remove('active');
      });
    }

    if (elements.mNavHistory) {
      elements.mNavHistory.addEventListener('click', () => {
        if (elements.mNavHistory) elements.mNavHistory.classList.add('active');
        if (elements.mNavForm) elements.mNavForm.classList.remove('active');
      });
    }

    if (elements.mNavLineOa) {
      elements.mNavLineOa.addEventListener('click', () => {
        if (window.LineService) {
          window.LineService.openLineOaChat();
        }
      });
    }

    if (elements.mNavSettings) {
      elements.mNavSettings.addEventListener('click', openLineSettingsModal);
    }
  }

  // Global window hook for inline view buttons
  window.viewTicketDetail = function (ticketId) {
    showTicketDetail(ticketId);
  };

  // Run on DOM Content Loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
