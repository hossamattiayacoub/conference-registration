/**
 * Utils.gs
 * -----------------------------------------------------------------------
 * Shared helper functions used by Code.gs: response building, sheet
 * bootstrapping, row <-> object mapping, validation and Drive uploads.
 * -----------------------------------------------------------------------
 */

/**
 * Builds the standard JSON envelope returned by every API action.
 */
function createApiResponse(success, message, data) {
  return {
    success: success,
    message: message,
    data: data === undefined ? null : data
  };
}

/**
 * Returns the Registeration sheet, creating it if it does not yet exist.
 */
function getRegistrationSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }
  return sheet;
}

/**
 * Writes the header row if the sheet is currently empty.
 * Safe to call repeatedly - it is a no-op once headers exist.
 */
function createHeadersIfNeeded() {
  const sheet = getRegistrationSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).setValues([CONFIG.HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Ensures the spreadsheet/sheet/header row are all ready to use.
 * Bound to the "initialize" API action.
 */
function initializeSheet() {
  createHeadersIfNeeded();
  return createApiResponse(true, 'تم تجهيز قاعدة البيانات بنجاح', null);
}

/**
 * Returns { headerName: columnIndex(0-based) } for the current sheet.
 */
function getHeaderIndexMap_(sheet) {
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn() || CONFIG.HEADERS.length).getValues()[0];
  const map = {};
  headerRow.forEach(function (name, index) {
    if (name) {
      map[name] = index;
    }
  });
  return map;
}

/**
 * Converts a sheet row (array of cell values) into a registration object,
 * using the header map to find each column.
 */
function rowToRegistration_(row, headerMap) {
  const record = {};
  CONFIG.HEADERS.forEach(function (header) {
    const index = headerMap[header];
    record[header] = index === undefined ? '' : row[index];
  });
  return record;
}

/**
 * Converts a registration object into a full row array matching CONFIG.HEADERS order.
 */
function registrationToRow_(record) {
  return CONFIG.HEADERS.map(function (header) {
    const value = record[header];
    return value === undefined || value === null ? '' : value;
  });
}

/**
 * Finds the sheet row (1-based, including header) for a given mobile number.
 * Returns null when no match is found.
 */
function findRowByMobile_(sheet, mobile) {
  const headerMap = getHeaderIndexMap_(sheet);
  const mobileCol = headerMap['Mobile'];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || mobileCol === undefined) {
    return null;
  }
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][mobileCol]).trim() === String(mobile).trim()) {
      return { rowIndex: i + 2, row: values[i], headerMap: headerMap };
    }
  }
  return null;
}

/**
 * Finds the sheet row (1-based, including header) for a given Id.
 * Returns null when no match is found.
 */
function findRowById_(sheet, id) {
  const headerMap = getHeaderIndexMap_(sheet);
  const idCol = headerMap['Id'];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || idCol === undefined) {
    return null;
  }
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idCol]).trim() === String(id).trim()) {
      return { rowIndex: i + 2, row: values[i], headerMap: headerMap };
    }
  }
  return null;
}

/**
 * Validates the incoming registration payload.
 * Returns { valid: boolean, message: string } - message is only set when invalid.
 */
function validateRegistration(data, isUpdate) {
  if (!data) {
    return { valid: false, message: 'لا توجد بيانات مرسلة' };
  }

  const requiredTextFields = [
    ['FirstName', 'الاسم الأول مطلوب'],
    ['SecondName', 'الاسم الثاني مطلوب'],
    ['ThirdName', 'الاسم الثالث مطلوب'],
    ['FourthName', 'الاسم الرابع مطلوب'],
    ['Mobile', 'رقم الموبايل مطلوب'],
    ['Gender', 'النوع مطلوب'],
    ['Diocese', 'الأبرشية مطلوبة'],
    ['AttendanceDays', 'أيام الحضور مطلوبة'],
    ['ConferenceBooking', 'يرجى تحديد حجز المؤتمر'],
    ['ServantName', 'الخادم مطلوب'],
    ['NationalId', 'الرقم القومي مطلوب']
  ];

  for (let i = 0; i < requiredTextFields.length; i++) {
    const field = requiredTextFields[i][0];
    const message = requiredTextFields[i][1];
    if (!data[field] || String(data[field]).trim() === '') {
      return { valid: false, message: message };
    }
  }

  const mobilePattern = /^01[0125][0-9]{8}$/;
  if (!mobilePattern.test(String(data.Mobile).trim())) {
    return { valid: false, message: 'رقم الموبايل غير صحيح' };
  }

  const nationalIdPattern = /^[0-9]{14}$/;
  if (!nationalIdPattern.test(String(data.NationalId).trim())) {
    return { valid: false, message: 'الرقم القومي يجب أن يتكون من 14 رقم' };
  }

  if (data.ConferenceBooking === 'نعم') {
    if (!data.PaymentMethod) {
      return { valid: false, message: 'طريقة الدفع مطلوبة' };
    }
    if (!data.PaymentAmount) {
      return { valid: false, message: 'مبلغ الدفع مطلوب' };
    }
  }

  // On create, the three identity images must be present (either a new
  // upload payload, or - for updates - an already-stored file reference).
  const imageChecks = [
    ['FrontIdImage', 'FrontIdFileUrl', 'صورة البطاقة الأمامية مطلوبة'],
    ['BackIdImage', 'BackIdFileUrl', 'صورة البطاقة الخلفية مطلوبة'],
    ['PersonalPhotoImage', 'PersonalPhotoFileUrl', 'الصورة الشخصية مطلوبة']
  ];
  for (let j = 0; j < imageChecks.length; j++) {
    const uploadField = imageChecks[j][0];
    const existingUrlField = imageChecks[j][1];
    const message = imageChecks[j][2];
    const hasUpload = data[uploadField] && data[uploadField].base64Data;
    const hasExisting = isUpdate && data[existingUrlField];
    if (!hasUpload && !hasExisting) {
      return { valid: false, message: message };
    }
  }

  return { valid: true, message: '' };
}

/**
 * Decodes a Base64 image, uploads it to the given Drive folder and
 * returns { fileId, fileUrl }.
 */
function uploadImage(base64Data, fileName, mimeType, folderId) {
  if (CONFIG.ALLOWED_MIME_TYPES.indexOf(mimeType) === -1) {
    throw new Error('صيغة الصورة غير مدعومة');
  }

  const decodedBytes = Utilities.base64Decode(base64Data);
  if (decodedBytes.length > CONFIG.MAX_IMAGE_SIZE_BYTES) {
    throw new Error('حجم الصورة أكبر من 10 ميجابايت');
  }

  const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
  const folder = DriveApp.getFolderById(folderId);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    fileId: file.getId(),
    fileUrl: 'https://drive.google.com/uc?id=' + file.getId()
  };
}

/** Removes an existing Drive file by id. Silently ignores failures. */
function tryDeleteFile_(fileId) {
  if (!fileId) {
    return;
  }
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (err) {
    // Ignore - the file may already be gone or inaccessible.
  }
}
