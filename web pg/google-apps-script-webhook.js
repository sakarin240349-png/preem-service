/**
 * ============================================================================
 * Preem Group - Service & Maintenance Cloud Database Webhook
 * Google Apps Script สำหรับระบบแจ้งซ่อมและจัดการงานหลังบ้าน (2-Way Sync + Image Upload)
 * ============================================================================
 * 
 * ฟังก์ชันการทำงาน:
 * 1. บันทึกคำขอแจ้งซ่อมใหม่จากหน้าเว็บ (POST createTicket)
 * 2. บันทึกรูปถ่ายหน้างานลง Google Drive อัตโนมัติ พร้อมสร้าง Link ดูภาพ
 * 3. ดึงรายการแจ้งซ่อมทั้งหมดมาแสดงที่หน้า Admin หลังบ้าน (GET getTickets)
 * 4. อัปเดตสถานะงาน / มอบหมายช่าง / บันทึกโน้ตจากหน้า Admin (POST updateTicket)
 * 5. ลบคำขอแจ้งซ่อม (POST deleteTicket)
 * 6. แจ้งเตือนไปยัง LINE Notify หรือ LINE Messaging API (ถ้ามีการตั้งค่า)
 */

// ===== ตั้งค่าระบบ (Configuration) =====
const SPREADSHEET_ID = ''; // ใส่ ID ของ Google Sheet (ถ้าปล่อยว่างจะใช้ Active Spreadsheet ที่ผูกกับ Script นี้อัตโนมัติ)
const SHEET_NAME = 'ใบแจ้งซ่อม'; // ชื่อแท็บ Sheet
const DRIVE_FOLDER_NAME = 'Preem Group - รูปแจ้งซ่อม'; // ชื่อโฟลเดอร์ใน Google Drive สำหรับเก็บรูป
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
        photoUrls: createdTicket.photoUrls || [],
        message: 'บันทึกคำขอแจ้งซ่อมและรูปภาพลงระบบคลาวด์เรียบร้อยแล้ว'
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
    'ISO Created At',      // Col 14: createdAt ISO string
    'รูปภาพหน้างาน'        // Col 15: photoUrls (comma separated URLs)
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
  } else {
    // Check if column 15 exists, if not add header
    const lastCol = sheet.getLastColumn();
    if (lastCol < 15) {
      sheet.getRange(1, 15).setValue('รูปภาพหน้างาน').setBackground('#0f2342').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    }
  }

  return sheet;
}

/**
 * ฟังก์ชันสร้างหรือดึงโฟลเดอร์สำหรับเก็บรูปใน Google Drive
 */
function getOrCreateDriveFolder() {
  try {
    const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    if (folders.hasNext()) {
      return folders.next();
    }
    const folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  } catch (e) {
    Logger.log('Drive folder error: ' + e.toString());
    return null;
  }
}

/**
 * แปลง Base64 รูปภาพและบันทึกลงใน Google Drive
 */
function savePhotosToDrive(ticketId, photosArray) {
  if (!photosArray || !Array.isArray(photosArray) || photosArray.length === 0) {
    return [];
  }

  const folder = getOrCreateDriveFolder();
  if (!folder) return [];

  const photoUrls = [];

  for (let i = 0; i < photosArray.length; i++) {
    try {
      let base64 = photosArray[i];
      if (!base64 || typeof base64 !== 'string') continue;

      let contentType = 'image/jpeg';
      let ext = 'jpg';

      if (base64.indexOf('data:image/png;base64,') === 0) {
        contentType = 'image/png';
        ext = 'png';
        base64 = base64.replace('data:image/png;base64,', '');
      } else if (base64.indexOf('data:image/jpeg;base64,') === 0) {
        contentType = 'image/jpeg';
        ext = 'jpg';
        base64 = base64.replace('data:image/jpeg;base64,', '');
      } else if (base64.indexOf('data:image/webp;base64,') === 0) {
        contentType = 'image/webp';
        ext = 'webp';
        base64 = base64.replace('data:image/webp;base64,', '');
      } else if (base64.includes(';base64,')) {
        const parts = base64.split(';base64,');
        contentType = parts[0].replace('data:', '');
        base64 = parts[1];
      }

      const decodedBytes = Utilities.base64Decode(base64);
      const fileName = `${ticketId}_photo_${i + 1}.${ext}`;
      const blob = Utilities.newBlob(decodedBytes, contentType, fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      const fileId = file.getId();
      // Direct viewable URL
      const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
      photoUrls.push(directUrl);
    } catch (photoErr) {
      Logger.log('Photo upload error: ' + photoErr.toString());
    }
  }

  return photoUrls;
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

  const numCols = 15;
  const dataRange = sheet.getRange(2, 1, lastRow - 1, numCols);
  const values = dataRange.getDisplayValues();

  const tickets = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const ticketId = String(row[0] || '').trim();
    if (!ticketId) continue;

    const photoUrlsStr = row[14] ? String(row[14]).trim() : '';
    const photoUrls = photoUrlsStr ? photoUrlsStr.split(',').map(s => s.trim()).filter(Boolean) : [];

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
      createdAt: row[13] ? String(row[13]) : new Date().toISOString(),
      photoUrls: photoUrls,
      photosCount: photoUrls.length
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

  // บันทึกรูปภาพลง Google Drive ถ้ามี
  let photoUrls = [];
  if (data.photos && Array.isArray(data.photos) && data.photos.length > 0) {
    photoUrls = savePhotosToDrive(ticketId, data.photos);
  } else if (data.photoUrls && Array.isArray(data.photoUrls)) {
    photoUrls = data.photoUrls;
  }

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
    isoDate,
    photoUrls.join(', ')
  ];

  sheet.appendRow(rowData);
  
  // Format row
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1, 1, rowData.length).setVerticalAlignment('middle');
  sheet.setRowHeight(lastRow, 30);

  return Object.assign({}, data, {
    id: ticketId,
    ticketId: ticketId,
    createDate: thaiDate,
    createTime: thaiTime,
    photoUrls: photoUrls
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
  const photoText = (data.photoUrls && data.photoUrls.length > 0) ? `\n📸 รูปถ่ายหน้างาน: ${data.photoUrls.length} รูป` : '';
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
    photoText,
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
