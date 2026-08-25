/**
 * ============================================================================
 * Preem Group - Service & Maintenance Cloud Database Webhook
 * Google Apps Script สำหรับระบบแจ้งซ่อมและจัดการงานหลังบ้าน (2-Way Sync)
 * ============================================================================
 * 
 * ฟังก์ชันการทำงาน:
 * 1. บันทึกคำขอแจ้งซ่อมใหม่จากหน้าเว็บ (POST createTicket)
 * 2. ดึงรายการแจ้งซ่อมทั้งหมดมาแสดงที่หน้า Admin หลังบ้าน (GET getTickets)
 * 3. อัปเดตสถานะงาน / มอบหมายช่าง / บันทึกโน้ตจากหน้า Admin (POST updateTicket)
 * 4. แจ้งเตือนไปยัง LINE Notify หรือ LINE Messaging API (ถ้ามีการตั้งค่า)
 * 
 * ----------------------------------------------------------------------------
 * ขั้นตอนการติดตั้ง (Setup Guide):
 * 1. สร้าง Google Sheets ใหม่ 1 ไฟล์ (หรือใช้ไฟล์เดิม)
 * 2. ก๊อปปี้ Spreadsheet ID จาก URL มาใส่ที่ตัวแปร SPREADSHEET_ID ด้านล่าง
 *    (เช่น https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit)
 * 3. ไปที่เมนู "ส่วนขยาย" (Extensions) > "Apps Script"
 * 4. ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดในไฟล์นี้ลงไปทั้งหมด
 * 5. กดปุ่ม "ทำให้ใช้งานได้" (Deploy) > "การทำให้ใช้งานได้ใหม่" (New deployment)
 * 6. เลือกประเภท: "เว็บแอป" (Web app)
 *    - คำอธิบาย: Preem Service Cloud API
 *    - ดำเนินการในฐานะ: ฉัน (Me)
 *    - ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน (Anyone)  <-- *สำคัญมาก*
 * 7. กด "ทำให้ใช้งานได้" (Deploy) และให้สิทธิ์การเข้าถึง (Authorize access)
 * 8. คัดลอก "URL ของเว็บแอป" (Web App URL) นำไปใส่ในหน้าตั้งค่า Admin หรือ line-config.js
 * ============================================================================
 */

// ===== ตั้งค่าระบบ (Configuration) =====
const SPREADSHEET_ID = ''; // ใส่ ID ของ Google Sheet (ถ้าปล่อยว่างจะใช้ Active Spreadsheet ที่ผูกกับ Script นี้อัตโนมัติ)
const SHEET_NAME = 'ใบแจ้งซ่อม'; // ชื่อแท็บ Sheet
const LINE_NOTIFY_TOKEN = ''; // Token LINE Notify (ถ้ามี หรือปล่อยว่างไว้ได้)
// ======================================

/**
 * จัดการ HTTP GET Requests
 * รองรับการดึงข้อมูลตั๋วแจ้งซ่อมทั้งหมดไปแสดงที่หน้า Admin
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getTickets';
    
    if (action === 'getTickets') {
      const tickets = getAllTickets();
      return jsonResponse({
        success: true,
        count: tickets.length,
        tickets: tickets
      });
    }

    if (action === 'ping') {
      return jsonResponse({
        success: true,
        message: 'Preem Group Cloud Service is Online & Ready!',
        timestamp: new Date().toISOString()
      });
    }

    return jsonResponse({
      success: false,
      error: 'Invalid GET action. Supported: getTickets, ping'
    });

  } catch (err) {
    return jsonResponse({
      success: false,
      error: err.toString()
    });
  }
}

/**
 * จัดการ HTTP POST Requests
 * รองรับการสร้างคำขอใหม่ และการอัปเดตสถานะงาน
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'No POST data received.' });
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'createTicket';

    // 1. สร้างคำขอแจ้งซ่อมใหม่
    if (action === 'createTicket' || !payload.action) {
      const ticketData = payload.ticket || payload;
      const createdTicket = saveNewTicket(ticketData);
      
      // ส่งแจ้งเตือน LINE Notify ถ้ามีการตั้งค่า
      if (LINE_NOTIFY_TOKEN && LINE_NOTIFY_TOKEN.trim() !== '') {
        try {
          sendLineNotify(createdTicket);
        } catch (notifyErr) {
          Logger.log('LINE Notify Error: ' + notifyErr.toString());
        }
      }

      return jsonResponse({
        success: true,
        action: 'createTicket',
        ticketId: createdTicket.id || createdTicket.ticketId,
        message: 'บันทึกคำขอแจ้งซ่อมลงระบบคลาวด์เรียบร้อยแล้ว'
      });
    }

    // 2. อัปเดตสถานะ / มอบหมายช่าง / โน้ตแอดมิน
    if (action === 'updateTicket') {
      const updateResult = updateExistingTicket(payload);
      return jsonResponse({
        success: true,
        action: 'updateTicket',
        ticketId: payload.ticketId,
        updated: updateResult
      });
    }

    // 3. ลบคำขอแจ้งซ่อม
    if (action === 'deleteTicket') {
      const deleteResult = deleteExistingTicket(payload.ticketId || payload.id);
      return jsonResponse({
        success: true,
        action: 'deleteTicket',
        ticketId: payload.ticketId || payload.id,
        deleted: deleteResult
      });
    }

    return jsonResponse({
      success: false,
      error: 'Unknown action: ' + action
    });

  } catch (err) {
    return jsonResponse({
      success: false,
      error: err.toString()
    });
  }
}

/**
 * ฟังก์ชันเข้าถึง Sheet พร้อมสร้างโครงสร้าง Header อัตโนมัติถ้ายังไม่มี
 */
function getOrCreateSheet() {
  let ss;
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error('ไม่พบ Spreadsheet กรุณาระบุ SPREADSHEET_ID ในโค้ด');
    }
  }

  let sheet = ss.getSheetByName(SHEET_NAME);
  const headers = [
    'รหัสใบแจ้งซ่อม',     // Col 1: id
    'วันที่แจ้ง',          // Col 2: createDate
    'เวลาที่แจ้ง',         // Col 3: createTime
    'ชื่อลูกค้า',          // Col 4: customerName
    'เบอร์ติดต่อกลับ',     // Col 5: contactPhone
    'สถานที่/หน้างาน',     // Col 6: serviceLocation
    'รายละเอียดปัญหา',     // Col 7: issueDetail
    'วันที่สะดวก',         // Col 8: preferredDate
    'ช่วงเวลาที่สะดวก',    // Col 9: preferredTime
    'สถานะ',              // Col 10: status ('รอติดต่อกลับ', 'นัดหมายแล้ว', 'เสร็จสิ้น')
    'ช่างผู้รับผิดชอบ',    // Col 11: technician
    'บันทึกแอดมิน/โน้ต',   // Col 12: adminNotes
    'LINE User ID',        // Col 13: lineUserId
    'ISO Created At'       // Col 14: createdAt ISO string
  ];

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(headers);

    // ปรับแต่งแถว Header ให้สวยงามและอ่านง่าย
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#0f2342'); // Deep Navy
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    sheet.setRowHeight(1, 38);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * ดึงรายการแจ้งซ่อมทั้งหมดจาก Sheet ส่งออกเป็น Array of Objects
 */
function getAllTickets() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    return []; // มีแค่ Header ไม่มีข้อมูล
  }

  const numCols = 14;
  const dataRange = sheet.getRange(2, 1, lastRow - 1, numCols);
  const values = dataRange.getDisplayValues();

  const tickets = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const ticketId = String(row[0] || '').trim();
    if (!ticketId) continue;

    tickets.push({
      id: ticketId,
      ticketId: ticketId,
      createDate: row[1] ? String(row[1]) : '',
      createTime: row[2] ? String(row[2]) : '',
      customerName: row[3] ? String(row[3]) : '',
      contactPhone: row[4] ? String(row[4]) : '',
      serviceLocation: row[5] ? String(row[5]) : '',
      issueDetail: row[6] ? String(row[6]) : '',
      preferredDate: row[7] ? String(row[7]) : '',
      preferredTime: row[8] ? String(row[8]) : '',
      status: row[9] ? String(row[9]) : 'รอติดต่อกลับ',
      technician: row[10] ? String(row[10]) : '',
      adminNotes: row[11] ? String(row[11]) : '',
      lineUserId: row[12] ? String(row[12]) : '',
      createdAt: row[13] ? String(row[13]) : new Date().toISOString()
    });
  }

  // เรียงลำดับจากล่าสุดไปเก่าสุด
  tickets.reverse();
  return tickets;
}

/**
 * บันทึกคำขอแจ้งซ่อมใหม่ลงแถวล่าสุด
 */
function saveNewTicket(data) {
  const sheet = getOrCreateSheet();
  const now = new Date();
  const thaiDate = Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy');
  const thaiTime = Utilities.formatDate(now, 'Asia/Bangkok', 'HH:mm:ss');
  const isoDate = data.createdAt || now.toISOString();

  const ticketId = data.id || data.ticketId || ('REQ-' + Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMMdd') + '-' + Math.floor(100 + Math.random() * 900));

  const rowData = [
    ticketId,
    thaiDate,
    thaiTime,
    data.customerName || '-',
    data.contactPhone || '-',
    data.serviceLocation || '-',
    data.issueDetail || '-',
    data.preferredDate || '-',
    data.preferredTime || '-',
    data.status || 'รอติดต่อกลับ',
    data.technician || '-',
    data.adminNotes || '-',
    data.lineUserId || '-',
    isoDate
  ];

  sheet.appendRow(rowData);
  
  // Format row
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1, 1, rowData.length).setVerticalAlignment('middle');
  sheet.setRowHeight(lastRow, 28);

  return Object.assign({}, data, {
    id: ticketId,
    ticketId: ticketId,
    createDate: thaiDate,
    createTime: thaiTime
  });
}

/**
 * อัปเดตข้อมูล Ticket ที่มีอยู่แล้วใน Sheet (ค้นหาตาม Ticket ID)
 */
function updateExistingTicket(updatePayload) {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    throw new Error('ไม่พบข้อมูลในตาราง');
  }

  const targetId = String(updatePayload.ticketId || updatePayload.id || '').trim();
  if (!targetId) {
    throw new Error('กรุณาระบุ Ticket ID ที่ต้องการอัปเดต');
  }

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let targetRowIndex = -1;

  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === targetId) {
      targetRowIndex = i + 2; // +2 เพราะเริ่มจากแถวที่ 2
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error('ไม่พบรายการแจ้งซ่อมรหัส: ' + targetId);
  }

  // อัปเดตสถานะ (Col 10)
  if (updatePayload.status !== undefined) {
    sheet.getRange(targetRowIndex, 10).setValue(updatePayload.status);
  }

  // อัปเดตช่างผู้รับผิดชอบ (Col 11)
  if (updatePayload.technician !== undefined) {
    sheet.getRange(targetRowIndex, 11).setValue(updatePayload.technician);
  }

  // อัปเดตโน้ตแอดมิน (Col 12)
  if (updatePayload.adminNotes !== undefined) {
    sheet.getRange(targetRowIndex, 12).setValue(updatePayload.adminNotes);
  }

  return {
    ticketId: targetId,
    rowIndex: targetRowIndex,
    status: updatePayload.status,
    technician: updatePayload.technician,
    adminNotes: updatePayload.adminNotes
  };
}

/**
 * ลบคำขอแจ้งซ่อมออกจาก Sheet ตาม Ticket ID
 */
function deleteExistingTicket(ticketId) {
  if (!ticketId) return false;
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  const targetId = String(ticketId).trim();
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === targetId) {
      sheet.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

/**
 * ส่งการแจ้งเตือนไปยัง LINE Notify
 */
function sendLineNotify(data) {
  const message = [
    '',
    '🔧 [แจ้งซ่อมใหม่ - Preem Group]',
    '━━━━━━━━━━━━━━━━━━━━',
    `📋 รหัส: ${data.id || data.ticketId}`,
    `👤 ลูกค้า: ${data.customerName}`,
    `📞 เบอร์: ${data.contactPhone}`,
    `📍 สถานที่: ${data.serviceLocation}`,
    `⚠️ ปัญหา: ${data.issueDetail}`,
    `📅 วันสะดวก: ${data.preferredDate}`,
    `⏰ ช่วงเวลา: ${data.preferredTime}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `📌 สถานะ: ${data.status || 'รอติดต่อกลับ'}`
  ].join('\n');

  UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + LINE_NOTIFY_TOKEN
    },
    payload: {
      message: message
    },
    muteHttpExceptions: true
  });
}

/**
 * Helper คืนค่า JSON Response พร้อม CORS Header
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ฟังก์ชันสำหรับทดสอบ (กด Run ใน Apps Script เพื่อทดสอบการทำงาน)
 */
function testSystem() {
  Logger.log('1. กำลังทดสอบสร้างตั๋วใหม่...');
  const testTicket = {
    id: 'REQ-TEST-' + Math.floor(1000 + Math.random() * 9000),
    customerName: 'ทดสอบ ระบบคลาวด์',
    contactPhone: '089-123-4567',
    serviceLocation: 'อาคารพรีม สุขุมวิท กรุงเทพฯ',
    issueDetail: 'ทดสอบการซิงค์ข้อมูลระหว่าง Netlify และ Google Sheets',
    preferredDate: '2026-08-26',
    preferredTime: '09:00 - 11:30 น. (ช่วงเช้า)',
    status: 'รอติดต่อกลับ',
    technician: 'ช่างสมศักดิ์ มั่นคง',
    adminNotes: 'ทดสอบระบบสำเร็จ'
  };

  const saved = saveNewTicket(testTicket);
  Logger.log('สร้างตั๋วสำเร็จ: ' + saved.id);

  Logger.log('2. กำลังทดสอบดึงข้อมูลทั้งหมด...');
  const all = getAllTickets();
  Logger.log('จำนวนตั๋วทั้งหมดในระบบ: ' + all.length);

  Logger.log('3. กำลังทดสอบอัปเดตสถานะ...');
  const updated = updateExistingTicket({
    ticketId: saved.id,
    status: 'นัดหมายแล้ว',
    technician: 'ช่างวิชัย รุ่งเรือง',
    adminNotes: 'โทรติดต่อยืนยันนัดหมายเรียบร้อย'
  });
  Logger.log('อัปเดตสำเร็จ: ' + JSON.stringify(updated));
}
