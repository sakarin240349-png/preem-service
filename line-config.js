/**
 * ProService CARE - LINE Integration Module
 * Handles LINE LIFF SDK, Profile Auto-fetch, Flex Message & Webhook Notifications
 */

window.LineService = (function () {
  'use strict';

  const STORAGE_KEY_LINE_CONFIG = 'proservice_care_line_config_v1';

  const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxauzj6VE8TRVuwloco83xrGwKNLOjSd-ntKFPYHrnYWrRl3wxgphubA0xkprJhSr8/exec';

  // Default / Active Configuration
  let config = {
    liffId: '', // User's LINE LIFF ID (e.g., 1234567890-AbcdEfgh)
    lineOaId: '@preemgroup', // LINE Official Account ID / Link
    webhookUrl: DEFAULT_WEBHOOK_URL, // Google Apps Script / Cloud Database Webhook
    autoFillName: true,
    sendChatReceipt: true
  };

  // State
  let lineState = {
    isLiffInitialized: false,
    isInLineClient: false,
    isLoggedIn: false,
    profile: null // { userId, displayName, pictureUrl, statusMessage }
  };

  // Load configuration from localStorage
  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LINE_CONFIG);
      if (saved) {
        const parsed = JSON.parse(saved);
        config = Object.assign({}, config, parsed);
        if (!config.webhookUrl) {
          config.webhookUrl = DEFAULT_WEBHOOK_URL;
        }
      }
    } catch (e) {
      console.warn('Could not load LINE config from localStorage', e);
    }
    return config;
  }

  // Save configuration
  function saveConfig(newConfig) {
    config = Object.assign({}, config, newConfig);
    try {
      localStorage.setItem(STORAGE_KEY_LINE_CONFIG, JSON.stringify(config));
    } catch (e) {
      console.error('Could not save LINE config', e);
    }
  }

  // Initialize LINE LIFF
  async function initLiff() {
    loadConfig();

    if (typeof liff === 'undefined') {
      console.warn('LINE LIFF SDK is not loaded.');
      return lineState;
    }

    // If no LIFF ID is configured, check if URL has liffId parameter or use default empty
    const urlParams = new URLSearchParams(window.location.search);
    const urlLiffId = urlParams.get('liffId');
    if (urlLiffId) {
      config.liffId = urlLiffId;
      saveConfig({ liffId: urlLiffId });
    }

    if (!config.liffId) {
      console.info('LINE LIFF ID is not configured yet. Running in standard Web mode.');
      return lineState;
    }

    try {
      await liff.init({ liffId: config.liffId });
      lineState.isLiffInitialized = true;
      lineState.isInLineClient = liff.isInClient();
      lineState.isLoggedIn = liff.isLoggedIn();

      if (lineState.isLoggedIn) {
        const profile = await liff.getProfile();
        lineState.profile = profile;
        console.log('LINE Profile loaded:', profile.displayName);
      } else if (lineState.isInLineClient) {
        // Automatically login if in client
      }
    } catch (err) {
      console.error('LIFF Init Error:', err);
    }

    return lineState;
  }

  // Format Ticket Data into a clear readable LINE text summary
  function formatTicketForLine(ticket) {
    return [
      `🔧 [ใบแจ้งซ่อม Preem Group]`,
      `━━━━━━━━━━━━━━━━━━`,
      `📋 รหัสคำขอ: ${ticket.id || ticket.ticketId}`,
      `👤 ผู้แจ้ง: ${ticket.customerName}`,
      `📞 เบอร์ติดต่อ: ${ticket.contactPhone}`,
      `📍 หน้างาน: ${ticket.serviceLocation}`,
      `⚠️ ปัญหา: ${ticket.issueDetail}`,
      `📅 วันสะดวก: ${ticket.preferredDate}`,
      `⏰ ช่วงเวลา: ${ticket.preferredTime}`,
      `━━━━━━━━━━━━━━━━━━`,
      `📌 สถานะ: ${ticket.status || 'รอติดต่อกลับ'}`
    ].join('\n');
  }

  // Send message to current chat room via LIFF
  async function sendMessageToChat(ticket) {
    if (typeof liff === 'undefined' || !liff.isLoggedIn()) {
      return { success: false, reason: 'not_in_liff' };
    }

    const messageText = formatTicketForLine(ticket);
    try {
      if (liff.isInClient()) {
        await liff.sendMessages([
          {
            type: 'text',
            text: messageText
          }
        ]);
        return { success: true };
      }
    } catch (err) {
      console.error('LIFF sendMessages failed:', err);
      return { success: false, error: err };
    }
    return { success: false, reason: 'not_in_client' };
  }

  // Share Ticket summary with LINE Friends
  async function shareTicketToLine(ticket) {
    const text = formatTicketForLine(ticket);

    if (typeof liff !== 'undefined' && liff.isLoggedIn() && liff.isApiAvailable('shareTargetPicker')) {
      try {
        const res = await liff.shareTargetPicker([
          {
            type: 'text',
            text: text
          }
        ]);
        if (res) return { success: true, method: 'shareTargetPicker' };
      } catch (err) {
        console.warn('ShareTargetPicker error, falling back to URL scheme', err);
      }
    }

    const encodedText = encodeURIComponent(text);
    const lineShareUrl = `https://line.me/R/msg/text/?${encodedText}`;
    window.open(lineShareUrl, '_blank');
    return { success: true, method: 'urlScheme' };
  }

  // Open Official LINE OA Chat with Prefilled Inquiry
  function openLineOaChat(ticketId = '') {
    let oaLink = config.lineOaId.trim();
    if (!oaLink) {
      oaLink = 'https://line.me';
    } else if (oaLink.startsWith('@')) {
      oaLink = `https://line.me/R/ti/p/${encodeURIComponent(oaLink)}`;
    } else if (!oaLink.startsWith('http')) {
      oaLink = `https://line.me/R/ti/p/@${encodeURIComponent(oaLink)}`;
    }

    if (ticketId) {
      if (oaLink.includes('ti/p/')) {
        window.open(`${oaLink}`, '_blank');
      } else {
        window.open(oaLink, '_blank');
      }
    } else {
      window.open(oaLink, '_blank');
    }
  }

  // Close LIFF Window
  function closeLiffWindow() {
    if (typeof liff !== 'undefined' && liff.isInClient()) {
      liff.closeWindow();
    } else {
      window.close();
    }
  }

  // ==========================================
  // CLOUD DATABASE (Google Apps Script API)
  // ==========================================

  // Helper to format & clean Google Apps Script Web App URL
  function cleanWebhookUrl(rawUrl) {
    if (!rawUrl) return '';
    let clean = rawUrl.trim();
    // If user forgot /exec at the end of google script url
    if (clean.includes('script.google.com/macros/s/') && !clean.includes('/exec')) {
      clean = clean.replace(/\/+$/, '') + '/exec';
    }
    return clean;
  }

  // Fetch all tickets from Google Sheets via Webhook URL
  async function fetchTicketsFromCloud() {
    loadConfig();
    const url = cleanWebhookUrl(config.webhookUrl);
    if (!url) {
      return { success: false, reason: 'no_webhook_url' };
    }

    try {
      const fetchUrl = url.includes('?') ? `${url}&action=getTickets` : `${url}?action=getTickets`;
      const response = await fetch(fetchUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        tickets: data.tickets || [],
        count: data.count || (data.tickets ? data.tickets.length : 0)
      };
    } catch (err) {
      console.warn('Cloud fetchTickets error:', err);
      return { success: false, error: err.toString() };
    }
  }

  // Create a new ticket in Google Sheets Cloud DB
  async function createTicketOnCloud(ticket) {
    loadConfig();
    const url = cleanWebhookUrl(config.webhookUrl);
    if (!url) return { skipped: true };

    try {
      const payload = {
        action: 'createTicket',
        ticket: ticket,
        timestamp: new Date().toISOString()
      };

      // Google Apps Script requires text/plain or no-cors for simple fetch
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      });

      return { success: true };
    } catch (e) {
      console.warn('Cloud createTicket error:', e);
      return { success: false, error: e.toString() };
    }
  }

  // Update an existing ticket (status, technician, admin notes) in Google Sheets Cloud DB
  async function updateTicketOnCloud(updatePayload) {
    loadConfig();
    const url = cleanWebhookUrl(config.webhookUrl);
    if (!url) return { skipped: true };

    try {
      const payload = Object.assign({
        action: 'updateTicket',
        timestamp: new Date().toISOString()
      }, updatePayload);

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      });

      return { success: true };
    } catch (e) {
      console.warn('Cloud updateTicket error:', e);
      return { success: false, error: e.toString() };
    }
  }

  // Delete a ticket from Google Sheets Cloud DB
  async function deleteTicketOnCloud(ticketId) {
    loadConfig();
    const url = cleanWebhookUrl(config.webhookUrl);
    if (!url || !ticketId) return { skipped: true };

    try {
      const payload = {
        action: 'deleteTicket',
        ticketId: ticketId,
        timestamp: new Date().toISOString()
      };

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      });

      return { success: true };
    } catch (e) {
      console.warn('Cloud deleteTicket error:', e);
      return { success: false, error: e.toString() };
    }
  }

  // Test connection to Google Apps Script Webhook
  async function testConnection(customUrl = null) {
    const rawUrl = customUrl || config.webhookUrl;
    const url = cleanWebhookUrl(rawUrl);
    if (!url) return { success: false, message: 'ยังไม่ได้ระบุ Webhook URL' };

    try {
      const fetchUrl = url.includes('?') ? `${url}&action=ping` : `${url}?action=ping`;
      const response = await fetch(fetchUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'Accept': 'application/json' }
      });
      const data = await response.json();
      return { success: true, data: data, cleanedUrl: url };
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  }

  // Alias for backward compatibility
  async function sendAdminWebhookNotification(ticket) {
    return createTicketOnCloud(ticket);
  }

  return {
    getConfig: () => Object.assign({}, config),
    saveConfig: saveConfig,
    getState: () => Object.assign({}, lineState),
    initLiff: initLiff,
    formatTicketForLine: formatTicketForLine,
    sendMessageToChat: sendMessageToChat,
    shareTicketToLine: shareTicketToLine,
    openLineOaChat: openLineOaChat,
    closeLiffWindow: closeLiffWindow,
    fetchTicketsFromCloud: fetchTicketsFromCloud,
    createTicketOnCloud: createTicketOnCloud,
    updateTicketOnCloud: updateTicketOnCloud,
    deleteTicketOnCloud: deleteTicketOnCloud,
    testConnection: testConnection,
    sendAdminWebhookNotification: sendAdminWebhookNotification
  };
})();
