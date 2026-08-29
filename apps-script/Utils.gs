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
 * Writes the header row if the sheet is currently empty. If the sheet
 * already has data (e.g. it predates TransportationType/AttendanceDay/
 * AccommodationFamilyMemberId), any headers from CONFIG.HEADERS that are
 * missing are appended as new columns to the right - existing columns and
 * existing rows are never reordered, renamed or overwritten.
 */
function createHeadersIfNeeded() {
  const sheet = getRegistrationSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).setValues([CONFIG.HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    ensureColumnsExist_(sheet);
  }
  return sheet;
}

/**
 * Appends any header from CONFIG.HEADERS that is not yet present in the
 * sheet as a brand-new column at the end. Safe to call repeatedly - it is
 * a no-op once every configured column already exists.
 */
function ensureColumnsExist_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    return;
  }
  const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const existingHeaderSet = {};
  existingHeaders.forEach(function (name) {
    if (name) {
      existingHeaderSet[name] = true;
    }
  });

  const missingHeaders = CONFIG.HEADERS.filter(function (header) {
    return !existingHeaderSet[header];
  });

  if (missingHeaders.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }
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
 * Converts a registration object into a row array sized and positioned to
 * match the sheet's *actual* physical column layout (headerMap), not just
 * the order columns happen to appear in CONFIG.HEADERS. This matters
 * because ensureColumnsExist_ appends new columns to the right of whatever
 * already exists, so a migrated sheet's physical order can differ from
 * CONFIG.HEADERS order - writing positionally by CONFIG.HEADERS order alone
 * would silently put values in the wrong columns on such a sheet.
 */
function registrationToRow_(record, headerMap) {
  const columnCount = Object.keys(headerMap).reduce(function (max, key) {
    return Math.max(max, headerMap[key]);
  }, -1) + 1;
  const row = new Array(Math.max(columnCount, CONFIG.HEADERS.length)).fill('');

  CONFIG.HEADERS.forEach(function (header) {
    const index = headerMap[header];
    if (index === undefined) {
      return; // Column not present yet on this sheet (shouldn't happen after createHeadersIfNeeded()).
    }
    const value = record[header];
    row[index] = value === undefined || value === null ? '' : value;
  });

  return row;
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

  // هل رقم الموبيل به واتس اب - required radio (نعم/لا). WhatsAppNumber is
  // required only when the answer is لا (the mobile number itself is NOT on
  // WhatsApp, so a separate WhatsApp number must be provided).
  const hasWhatsAppValues = ['نعم', 'لا'];
  if (hasWhatsAppValues.indexOf(data.HasWhatsApp) === -1) {
    return { valid: false, message: 'هل رقم الموبيل به واتس اب؟ مطلوب' };
  }
  if (data.HasWhatsApp === 'لا') {
    if (!data.WhatsAppNumber || String(data.WhatsAppNumber).trim() === '') {
      return { valid: false, message: 'رقم الواتس اب مطلوب' };
    }
    if (!mobilePattern.test(String(data.WhatsAppNumber).trim())) {
      return { valid: false, message: 'رقم الواتس اب غير صحيح' };
    }
  }

  const nationalIdPattern = /^[0-9]{14}$/;
  if (!nationalIdPattern.test(String(data.NationalId).trim())) {
    return { valid: false, message: 'الرقم القومي يجب أن يتكون من 14 رقم' };
  }

  // طريقة الدفع / مبلغ الدفع / يرجى رفع صورة التحويل have been removed from
  // the registration form - no validation for PaymentMethod, PaymentAmount
  // or ReceiptTransferImage remains active. Historical data in those sheet
  // columns is preserved untouched by createRegistration/updateRegistration.

  // TransportationType is now shown (and required) for both "بدون مواصلات" options.
  const transportationRequiredFor = ['الجمعة والسبت بدون مواصلات', 'يوم واحد بدون مواصلات'];
  if (transportationRequiredFor.indexOf(data.AttendanceDays) !== -1 && !data.TransportationType) {
    return { valid: false, message: 'وسيلة المواصلات مطلوبة' };
  }

  if (data.AttendanceDays === 'يوم واحد بدون مواصلات' && !data.AttendanceDay) {
    return { valid: false, message: 'يوم الحضور مطلوب' };
  }

  const marriedRequiredFor = ['الجمعة والسبت بالمواصلات', 'الجمعة والسبت بدون مواصلات'];
  if (marriedRequiredFor.indexOf(data.AttendanceDays) !== -1 && !data.MarriedAndYourSpousebookInConference) {
    return { valid: false, message: 'هل أنت متزوج وزوجك / زوجتك حجزت معك المؤتمر؟ مطلوب' };
  }

  // ادخل اسم الزوجه - shown/required only when the married question is
  // answered "نعم". When it's unanswered (attendance option that hides the
  // married question entirely) or "لا", WifeName is not required.
  if (data.MarriedAndYourSpousebookInConference === 'نعم' && (!data.WifeName || String(data.WifeName).trim() === '')) {
    return { valid: false, message: 'اسم الزوجه مطلوب' };
  }

  // CarNo/CarLicense only apply to "يوم واحد بدون مواصلات" + "Private Car".
  const isCarScenario = data.AttendanceDays === 'يوم واحد بدون مواصلات' && data.TransportationType === 'Private Car';
  if (isCarScenario) {
    if (!data.CarNo || String(data.CarNo).trim() === '') {
      return { valid: false, message: 'رقم السيارة مطلوب' };
    }
    const hasCarLicenseUpload = data.CarLicenseImage && data.CarLicenseImage.base64Data;
    const hasExistingCarLicense = isUpdate && data.CarLicense;
    if (!hasCarLicenseUpload && !hasExistingCarLicense) {
      return { valid: false, message: 'صورة الرخصة مطلوبة' };
    }
  }

  // التسكين (friends/group accommodation question + room dropdown) is shown
  // - and therefore required - only when the married question was answered
  // "لا". When married is "نعم" (WifeName shown instead) or unanswered
  // (married question hidden for this AttendanceDays option), the
  // accommodation section is never displayed, so nothing here is required
  // and RoomId must stay empty.
  if (data.MarriedAndYourSpousebookInConference === 'لا') {
    const hasFriendsValues = ['نعم', 'لا'];
    if (hasFriendsValues.indexOf(data.HasFriendsForAccommodation) === -1) {
      return { valid: false, message: 'اختيار التسكين مع الأصدقاء مطلوب' };
    }

    // التسكين: اختار الغرفه - RoomId is required only when the person wants to
    // room with friends; otherwise staff assign a room later and RoomId must
    // stay empty. parseRoomId_ (Code.gs) returns null for empty/undefined/
    // non-numeric values, so this single check also covers "invalid" RoomId.
    if (data.HasFriendsForAccommodation === 'نعم' && parseRoomId_(data.RoomId) === null) {
      return { valid: false, message: 'التسكين مطلوب' };
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
 * Builds the filename actually saved to Google Drive: "{registrationId}-{label}{.ext}".
 * The original browser filename is discarded except for its extension, so
 * every uploaded file is traceable back to its registration by name alone
 * (e.g. "3f2a1c9e-...-FrontId.jpg" instead of "IMG_2034.jpg").
 */
function buildDriveFileName_(registrationId, label, originalFileName) {
  let extension = '';
  const name = String(originalFileName || '');
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex !== -1) {
    extension = name.substring(dotIndex); // includes the leading dot
  }
  return String(registrationId) + '-' + label + extension;
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

/**
 * Extracts the Drive file ID from a URL previously produced by uploadImage()
 * (format: 'https://drive.google.com/uc?id=FILE_ID'). Used by single-column
 * image fields (CarLicense, ReceiptTransferImage) that only persist the URL,
 * so the old Drive file can still be trashed when it is replaced or cleared.
 */
function extractDriveFileIdFromUrl_(url) {
  if (!url) {
    return null;
  }
  const match = String(url).match(/[?&]id=([^&]+)/);
  return match ? match[1] : null;
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

/* ==========================================================================
 * Rooms ("التسكين: اختار الغرفه")
 * ========================================================================== */

/** Returns the Rooms sheet, or null if it doesn't exist (it is managed manually, never auto-created). */
function getRoomsSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  return spreadsheet.getSheetByName(CONFIG.ROOMS_SHEET_NAME);
}

/**
 * Reads every row of the Rooms sheet into { id, name, capacity, gender, description } objects.
 * Rows with an empty/invalid Id are skipped.
 */
function readRoomsRaw_() {
  const sheet = getRoomsSheet_();
  if (!sheet) {
    return [];
  }
  const headerMap = getHeaderIndexMapFor_(sheet, CONFIG.ROOMS_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const rooms = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const idRaw = headerMap.Id !== undefined ? row[headerMap.Id] : '';
    const id = Number(idRaw);
    if (idRaw === '' || idRaw === null || isNaN(id)) {
      continue;
    }
    rooms.push({
      id: id,
      name: headerMap.Name !== undefined ? String(row[headerMap.Name] || '') : '',
      capacity: headerMap.Capacity !== undefined ? Number(row[headerMap.Capacity]) || 0 : 0,
      gender: headerMap.Gender !== undefined ? String(row[headerMap.Gender] || '') : '',
      description: headerMap.Description !== undefined ? String(row[headerMap.Description] || '') : ''
    });
  }
  return rooms;
}

/** Like getHeaderIndexMap_ but scoped to an explicit list of expected header names (used for the Rooms sheet). */
function getHeaderIndexMapFor_(sheet, expectedHeaders) {
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn() || expectedHeaders.length).getValues()[0];
  const map = {};
  headerRow.forEach(function (name, index) {
    if (name) {
      map[name] = index;
    }
  });
  return map;
}

/**
 * Collects the FullName of every registration currently assigned to each
 * RoomId, optionally excluding one registration (edit mode - so the person
 * being edited never appears in their own room's occupant list). Kept
 * separate from calculateRoomOccupancy_ so the existing capacity-count
 * logic stays untouched; this only powers the "الحاجزين" display.
 */
function collectRoomOccupantNames_(excludeRegistrationId) {
  const sheet = getRegistrationSheet_();
  const headerMap = getHeaderIndexMap_(sheet);
  const roomIdCol = headerMap['RoomId'];
  const idCol = headerMap['Id'];
  const fullNameCol = headerMap['FullName'];
  const occupantNames = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || roomIdCol === undefined) {
    return occupantNames;
  }
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (excludeRegistrationId && idCol !== undefined && String(row[idCol]).trim() === String(excludeRegistrationId).trim()) {
      continue; // Exclude the registration currently being edited.
    }
    const roomIdRaw = row[roomIdCol];
    if (roomIdRaw === '' || roomIdRaw === null || roomIdRaw === undefined) {
      continue;
    }
    const roomId = Number(roomIdRaw);
    if (isNaN(roomId)) {
      continue;
    }
    const fullName = fullNameCol !== undefined ? String(row[fullNameCol] || '').trim() : '';
    if (!fullName) {
      continue;
    }
    if (!occupantNames[roomId]) {
      occupantNames[roomId] = [];
    }
    occupantNames[roomId].push(fullName);
  }
  return occupantNames;
}

/**
 * Counts how many registrations currently reference each RoomId, optionally
 * excluding one registration (used in edit mode so a registration doesn't
 * count against its own room's capacity). Empty/invalid/orphaned RoomId
 * values are ignored.
 */
function calculateRoomOccupancy_(excludeRegistrationId) {
  const sheet = getRegistrationSheet_();
  const headerMap = getHeaderIndexMap_(sheet);
  const roomIdCol = headerMap['RoomId'];
  const idCol = headerMap['Id'];
  const occupancy = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || roomIdCol === undefined) {
    return occupancy;
  }
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (excludeRegistrationId && idCol !== undefined && String(row[idCol]).trim() === String(excludeRegistrationId).trim()) {
      continue; // Exclude the registration currently being edited.
    }
    const roomIdRaw = row[roomIdCol];
    if (roomIdRaw === '' || roomIdRaw === null || roomIdRaw === undefined) {
      continue;
    }
    const roomId = Number(roomIdRaw);
    if (isNaN(roomId)) {
      continue;
    }
    occupancy[roomId] = (occupancy[roomId] || 0) + 1;
  }
  return occupancy;
}

/**
 * Returns every room with its computed currentOccupancy/availableSpaces/isFull,
 * excluding one registration's own room assignment from the occupancy count
 * (used in edit mode - see calculateRoomOccupancy_).
 */
function getRoomsWithAvailability_(excludeRegistrationId) {
  const rooms = readRoomsRaw_();
  const occupancy = calculateRoomOccupancy_(excludeRegistrationId);
  const occupantNames = collectRoomOccupantNames_(excludeRegistrationId);
  return rooms.map(function (room) {
    const currentOccupancy = occupancy[room.id] || 0;
    const availableSpaces = Math.max(room.capacity - currentOccupancy, 0);
    return {
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      gender: room.gender,
      description: room.description,
      currentOccupancy: currentOccupancy,
      availableSpaces: availableSpaces,
      isFull: currentOccupancy >= room.capacity,
      occupantNames: occupantNames[room.id] || []
    };
  });
}

/**
 * Server-side capacity check performed again right before create/update, so
 * two people submitting at the same time can't both take the last space.
 * Returns { valid: boolean, message: string }.
 */
function validateRoomCapacity_(roomId, excludeRegistrationId) {
  const rooms = readRoomsRaw_();
  const room = rooms.filter(function (r) {
    return r.id === roomId;
  })[0];
  if (!room) {
    return { valid: false, message: 'الغرفة المحددة غير موجودة' };
  }
  const occupancy = calculateRoomOccupancy_(excludeRegistrationId);
  const currentOccupancy = occupancy[room.id] || 0;
  if (currentOccupancy >= room.capacity) {
    return { valid: false, message: 'هذه الغرفة مكتملة ولا يوجد أماكن متاحة' };
  }
  return { valid: true, message: '' };
}

/* ==========================================================================
 * AttendanceList (QR attendance scanner - /attendance-scanner)
 * ========================================================================== */

/**
 * Returns the existing AttendanceList sheet, writing its header row only if
 * the sheet is completely empty. The sheet itself is never created here -
 * it is expected to already exist in the spreadsheet.
 */
function getAttendanceListSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
  if (!sheet) {
    throw new Error('تعذر العثور على شيت AttendanceList');
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, CONFIG.ATTENDANCE_HEADERS.length).setValues([CONFIG.ATTENDANCE_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Returns true if `id` already has a row in AttendanceList. */
function attendanceRecordExists_(sheet, id) {
  const headerMap = getHeaderIndexMapFor_(sheet, CONFIG.ATTENDANCE_HEADERS);
  const idCol = headerMap['id'];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || idCol === undefined) {
    return false;
  }
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idCol]).trim() === String(id).trim()) {
      return true;
    }
  }
  return false;
}

/** Builds the { success, status, message, data: { id } } envelope used by recordAttendance responses. */
function createAttendanceResponse_(success, status, message, id) {
  return { success: success, status: status, message: message, data: { id: id } };
}
