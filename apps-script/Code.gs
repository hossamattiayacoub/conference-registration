/**
 * Code.gs
 * -----------------------------------------------------------------------
 * Web App entry points (doGet / doPost) and the CRUD operations for the
 * Registeration sheet. Every action returns the standard JSON envelope
 * built by createApiResponse().
 * -----------------------------------------------------------------------
 */

/** Handles GET requests: getByMobile, getById, initialize. */
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : null;

    if (action === 'initialize') {
      return jsonOutput_(initializeSheet());
    }

    if (action === 'getByMobile') {
      return jsonOutput_(getRegistrationByMobile(e.parameter.mobile));
    }

    if (action === 'getById') {
      return jsonOutput_(getRegistrationById(e.parameter.id));
    }

    if (action === 'getRooms') {
      return jsonOutput_(getRooms(e.parameter.excludeId));
    }

    return jsonOutput_(createApiResponse(false, 'إجراء غير معروف', null));
  } catch (err) {
    return jsonOutput_(createApiResponse(false, 'حدث خطأ في الخادم: ' + err.message, null));
  }
}

/** Handles POST requests: create, update. */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const data = body.data;

    if (action === 'create') {
      return jsonOutput_(createRegistration(data));
    }

    if (action === 'update') {
      return jsonOutput_(updateRegistration(data));
    }

    if (action === 'recordAttendance') {
      return jsonOutput_(recordAttendance(body.id));
    }

    return jsonOutput_(createApiResponse(false, 'إجراء غير معروف', null));
  } catch (err) {
    return jsonOutput_(createApiResponse(false, 'حدث خطأ في الخادم: ' + err.message, null));
  }
}

/** Wraps a response object as a JSON ContentService output. */
function jsonOutput_(responseObject) {
  return ContentService.createTextOutput(JSON.stringify(responseObject)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Creates a new registration row.
 * Rejects the request when the mobile number already exists.
 */
function createRegistration(data) {
  createHeadersIfNeeded();
  const sheet = getRegistrationSheet_();
  const headerMap = getHeaderIndexMap_(sheet);

  const validation = validateRegistration(data, false);
  if (!validation.valid) {
    return createApiResponse(false, validation.message, null);
  }

  const existing = findRowByMobile_(sheet, data.Mobile);
  if (existing) {
    const existingHeaderMap = existing.headerMap;
    const existingId = existing.row[existingHeaderMap['Id']];
    return createApiResponse(false, 'يوجد تسجيل بالفعل باستخدام رقم الموبايل ده', { id: existingId });
  }

  const wantsRoom = data.HasFriendsForAccommodation === 'نعم';
  const roomId = wantsRoom ? parseRoomId_(data.RoomId) : null;
  if (roomId !== null) {
    const roomValidation = validateRoomCapacity_(roomId, null);
    if (!roomValidation.valid) {
      return createApiResponse(false, roomValidation.message, null);
    }
  }

  const now = new Date().toISOString();
  const isCarScenario = isCarScenario_(data.AttendanceDays, data.TransportationType);
  const record = {
    Id: Utilities.getUuid(),
    FirstName: data.FirstName,
    SecondName: data.SecondName,
    ThirdName: data.ThirdName,
    FourthName: data.FourthName,
    FullName: [data.FirstName, data.SecondName, data.ThirdName, data.FourthName].join(' ').trim(),
    Mobile: data.Mobile,
    Gender: data.Gender,
    Job: data.Job || '',
    Diocese: data.Diocese,
    AttendanceDays: data.AttendanceDays,
    TransportationType: isTransportationVisible_(data.AttendanceDays) ? data.TransportationType : '',
    AttendanceDay: data.AttendanceDays === 'يوم واحد بدون مواصلات' ? data.AttendanceDay : '',
    MarriedAndYourSpousebookInConference: isMarriedFieldVisible_(data.AttendanceDays)
      ? data.MarriedAndYourSpousebookInConference
      : '',
    ConferenceBooking: '', // حجز المؤتمر removed from the UI; column kept only for backward compatibility.
    // PaymentMethod/PaymentAmount/ReceiptTransferImage (طريقة الدفع, مبلغ
    // الدفع, يرجى رفع صورة التحويل) removed from the UI - left empty for new
    // rows, and carried forward untouched for updates (see updateRegistration).
    PaymentMethod: '',
    PaymentAmount: '',
    ServantName: data.ServantName,
    Notes: data.Notes || '',
    NationalId: data.NationalId,
    // AccommodationFamilyMemberId (old family-member accommodation column) is
    // no longer collected by the UI - left empty for new rows, and carried
    // forward untouched for updates (see updateRegistration).
    AccommodationFamilyMemberId: '',
    HasFriendsForAccommodation: data.HasFriendsForAccommodation,
    RoomId: roomId === null ? '' : roomId,
    CarNo: isCarScenario ? String(data.CarNo || '').trim() : '',
    CarLicense: '',
    ReceiptTransferImage: '',
    CreatedAt: now,
    UpdatedAt: now
  };

  attachUploadedImages_(record, data);
  attachCarLicenseImage_(record, data, null, isCarScenario);

  sheet.appendRow(registrationToRow_(record, headerMap));
  return createApiResponse(true, 'تم إضافة التسجيل بنجاح', record);
}

/** Parses RoomId from the request payload into a number, or null when empty/invalid (room selection is optional). */
function parseRoomId_(rawRoomId) {
  if (rawRoomId === undefined || rawRoomId === null || rawRoomId === '') {
    return null;
  }
  const roomId = Number(rawRoomId);
  return isNaN(roomId) ? null : roomId;
}

/** Whether TransportationType should be shown/required for a given AttendanceDays value. */
function isTransportationVisible_(attendanceDays) {
  return attendanceDays === 'الجمعة والسبت بدون مواصلات' || attendanceDays === 'يوم واحد بدون مواصلات';
}

/** Whether CarNo/CarLicense apply: only "يوم واحد بدون مواصلات" + "Private Car". */
function isCarScenario_(attendanceDays, transportationType) {
  return attendanceDays === 'يوم واحد بدون مواصلات' && transportationType === 'Private Car';
}

/** Whether MarriedAndYourSpousebookInConference should be shown/required for a given AttendanceDays value. */
function isMarriedFieldVisible_(attendanceDays) {
  return attendanceDays === 'الجمعة والسبت بالمواصلات' || attendanceDays === 'الجمعة والسبت بدون مواصلات';
}

/**
 * Updates an existing registration row identified by data.Id.
 */
function updateRegistration(data) {
  createHeadersIfNeeded();
  const sheet = getRegistrationSheet_();

  if (!data || !data.Id) {
    return createApiResponse(false, 'معرف التسجيل مطلوب للتعديل', null);
  }

  const validation = validateRegistration(data, true);
  if (!validation.valid) {
    return createApiResponse(false, validation.message, null);
  }

  const target = findRowById_(sheet, data.Id);
  if (!target) {
    return createApiResponse(false, 'التسجيل غير موجود', null);
  }

  // If the mobile number was changed, make sure it does not collide with
  // a *different* existing registration.
  const mobileMatch = findRowByMobile_(sheet, data.Mobile);
  if (mobileMatch && mobileMatch.rowIndex !== target.rowIndex) {
    const existingId = mobileMatch.row[mobileMatch.headerMap['Id']];
    return createApiResponse(false, 'يوجد تسجيل بالفعل باستخدام رقم الموبايل ده', { id: existingId });
  }

  const existingRecord = rowToRegistration_(target.row, target.headerMap);
  const isCarScenario = isCarScenario_(data.AttendanceDays, data.TransportationType);

  const wantsRoom = data.HasFriendsForAccommodation === 'نعم';
  const roomId = wantsRoom ? parseRoomId_(data.RoomId) : null;
  if (roomId !== null) {
    // Exclude this registration's own current room assignment from the
    // occupancy count, so keeping (or re-picking) the same room never fails
    // just because that registration itself fills the last slot.
    const roomValidation = validateRoomCapacity_(roomId, data.Id);
    if (!roomValidation.valid) {
      return createApiResponse(false, roomValidation.message, null);
    }
  }

  const record = {
    Id: data.Id,
    FirstName: data.FirstName,
    SecondName: data.SecondName,
    ThirdName: data.ThirdName,
    FourthName: data.FourthName,
    FullName: [data.FirstName, data.SecondName, data.ThirdName, data.FourthName].join(' ').trim(),
    Mobile: data.Mobile,
    Gender: data.Gender,
    Job: data.Job || '',
    Diocese: data.Diocese,
    AttendanceDays: data.AttendanceDays,
    TransportationType: isTransportationVisible_(data.AttendanceDays) ? data.TransportationType : '',
    AttendanceDay: data.AttendanceDays === 'يوم واحد بدون مواصلات' ? data.AttendanceDay : '',
    MarriedAndYourSpousebookInConference: isMarriedFieldVisible_(data.AttendanceDays)
      ? data.MarriedAndYourSpousebookInConference
      : '',
    ConferenceBooking: '', // حجز المؤتمر removed from the UI; column kept only for backward compatibility.
    // PaymentMethod/PaymentAmount/ReceiptTransferImage (طريقة الدفع, مبلغ
    // الدفع, يرجى رفع صورة التحويل) removed from the UI: no longer collected,
    // so carried forward untouched rather than overwritten with '' - this
    // preserves historical payment data on registrations created before
    // this change.
    PaymentMethod: existingRecord.PaymentMethod || '',
    PaymentAmount: existingRecord.PaymentAmount || '',
    ServantName: data.ServantName,
    Notes: data.Notes || '',
    NationalId: data.NationalId,
    // Old family-member accommodation column: no longer collected by the UI,
    // so it is carried forward untouched rather than overwritten with ''.
    AccommodationFamilyMemberId: existingRecord.AccommodationFamilyMemberId || '',
    HasFriendsForAccommodation: data.HasFriendsForAccommodation,
    RoomId: roomId === null ? '' : roomId,
    CarNo: isCarScenario ? String(data.CarNo || '').trim() : '',
    CarLicense: isCarScenario ? existingRecord.CarLicense || '' : '',
    // Same reasoning as PaymentMethod/PaymentAmount above: always carried
    // forward untouched, never cleared/deleted by this flow anymore.
    ReceiptTransferImage: existingRecord.ReceiptTransferImage || '',
    FrontIdFileId: existingRecord.FrontIdFileId,
    FrontIdFileUrl: existingRecord.FrontIdFileUrl,
    BackIdFileId: existingRecord.BackIdFileId,
    BackIdFileUrl: existingRecord.BackIdFileUrl,
    PersonalPhotoFileId: existingRecord.PersonalPhotoFileId,
    PersonalPhotoFileUrl: existingRecord.PersonalPhotoFileUrl,
    CreatedAt: existingRecord.CreatedAt,
    UpdatedAt: new Date().toISOString()
  };

  // Clean up the CarLicense Drive file when that scenario turns off (car
  // logic is unrelated to this change and unaffected). ReceiptTransferImage
  // is no longer cleaned up here since the payment flow that used to manage
  // its lifecycle has been removed - its historical file is left alone.
  if (!isCarScenario && existingRecord.CarLicense) {
    tryDeleteFile_(extractDriveFileIdFromUrl_(existingRecord.CarLicense));
  }

  attachUploadedImages_(record, data, existingRecord);
  attachCarLicenseImage_(record, data, existingRecord, isCarScenario);

  const row = registrationToRow_(record, target.headerMap);
  sheet.getRange(target.rowIndex, 1, 1, row.length).setValues([row]);
  return createApiResponse(true, 'تم تحديث التسجيل بنجاح', record);
}

/**
 * Uploads any new image payloads found on `data` and writes the resulting
 * fileId/fileUrl pairs onto `record`. When updating and a new image
 * replaces an old one, the old Drive file is trashed. Each uploaded file is
 * renamed to "{record.Id}-{label}.{ext}" so it is traceable in Drive.
 */
function attachUploadedImages_(record, data, existingRecord) {
  const uploads = [
    {
      payloadKey: 'FrontIdImage',
      idKey: 'FrontIdFileId',
      urlKey: 'FrontIdFileUrl',
      folderId: CONFIG.FRONT_ID_FOLDER_ID,
      label: 'FrontId'
    },
    {
      payloadKey: 'BackIdImage',
      idKey: 'BackIdFileId',
      urlKey: 'BackIdFileUrl',
      folderId: CONFIG.BACK_ID_FOLDER_ID,
      label: 'BackId'
    },
    {
      payloadKey: 'PersonalPhotoImage',
      idKey: 'PersonalPhotoFileId',
      urlKey: 'PersonalPhotoFileUrl',
      folderId: CONFIG.PERSONAL_PHOTO_FOLDER_ID,
      label: 'PersonalPhoto'
    }
  ];

  uploads.forEach(function (item) {
    const payload = data[item.payloadKey];
    if (payload && payload.base64Data) {
      if (existingRecord && existingRecord[item.idKey]) {
        tryDeleteFile_(existingRecord[item.idKey]);
      }
      const fileName = buildDriveFileName_(record.Id, item.label, payload.fileName);
      const uploaded = uploadImage(payload.base64Data, fileName, payload.mimeType, item.folderId);
      record[item.idKey] = uploaded.fileId;
      record[item.urlKey] = uploaded.fileUrl;
    }
  });
}

/**
 * Uploads CarLicense when a new file was chosen. Unlike attachUploadedImages_,
 * this field persists only a single Drive URL in the sheet column (CarLicense
 * - exact name required), so the old file's id is recovered by parsing it
 * back out of the previously stored URL before it is trashed.
 *
 * (Previously also handled ReceiptTransferImage alongside CarLicense, but
 * that upload path was removed together with طريقة الدفع - its historical
 * data is preserved untouched elsewhere, just never written to anymore.)
 */
function attachCarLicenseImage_(record, data, existingRecord, isCarScenario) {
  if (!isCarScenario) {
    return;
  }
  const carLicensePayload = data.CarLicenseImage;
  if (carLicensePayload && carLicensePayload.base64Data) {
    if (existingRecord && existingRecord.CarLicense) {
      tryDeleteFile_(extractDriveFileIdFromUrl_(existingRecord.CarLicense));
    }
    const carLicenseFileName = buildDriveFileName_(record.Id, 'CarLicense', carLicensePayload.fileName);
    const uploaded = uploadImage(
      carLicensePayload.base64Data,
      carLicenseFileName,
      carLicensePayload.mimeType,
      CONFIG.CAR_LICENSE_FOLDER_ID
    );
    record.CarLicense = uploaded.fileUrl;
  }
}

/** Looks up a registration using the mobile number. */
function getRegistrationByMobile(mobile) {
  if (!mobile) {
    return createApiResponse(false, 'رقم الموبايل مطلوب', null);
  }
  const sheet = getRegistrationSheet_();
  const match = findRowByMobile_(sheet, mobile);
  if (!match) {
    return createApiResponse(false, 'لا يوجد تسجيل بهذا الرقم', null);
  }
  return createApiResponse(true, 'تم العثور على التسجيل', rowToRegistration_(match.row, match.headerMap));
}

/** Looks up a registration using its Id. */
function getRegistrationById(id) {
  if (!id) {
    return createApiResponse(false, 'معرف التسجيل مطلوب', null);
  }
  const sheet = getRegistrationSheet_();
  const match = findRowById_(sheet, id);
  if (!match) {
    return createApiResponse(false, 'التسجيل غير موجود', null);
  }
  return createApiResponse(true, 'تم العثور على التسجيل', rowToRegistration_(match.row, match.headerMap));
}

/**
 * Returns every room from the Rooms sheet with its computed occupancy and
 * availability, used to populate the "التسكين: اختار الغرفه" dropdown.
 * excludeRegistrationId (optional) excludes that registration's own current
 * room assignment from the occupancy count - used while editing that
 * registration so its own room doesn't appear falsely full.
 */
function getRooms(excludeRegistrationId) {
  try {
    const rooms = getRoomsWithAvailability_(excludeRegistrationId || null);
    return createApiResponse(true, 'Rooms loaded successfully', rooms);
  } catch (err) {
    return createApiResponse(false, 'Failed to load rooms', []);
  }
}

/**
 * Records attendance for a scanned QR code (/attendance-scanner).
 * The scanned value is the Registeration sheet's "Id" column - the exact
 * same Id already generated by createRegistration() and encoded into the
 * QR code on the success page. Nothing else about that registration is
 * read, returned, or modified; only AttendanceList (single "id" column) is
 * ever written to here.
 */
function recordAttendance(rawId) {
  const id = rawId === undefined || rawId === null ? '' : String(rawId).trim();
  if (!id) {
    return createAttendanceResponse_(false, 'invalid-id', 'رقم التسجيل غير صالح', id);
  }

  const registrationSheet = getRegistrationSheet_();
  const registrationMatch = findRowById_(registrationSheet, id);
  if (!registrationMatch) {
    return createAttendanceResponse_(false, 'registration-not-found', 'رقم التسجيل غير موجود', id);
  }

  // A script lock guards the check-then-insert below so the same QR code
  // scanned from two devices at the same instant can never both pass the
  // "not already recorded" check and create two rows.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return createAttendanceResponse_(false, 'server-busy', 'الخادم مشغول، يرجى المحاولة مرة أخرى', id);
  }

  try {
    const attendanceSheet = getAttendanceListSheet_();
    if (attendanceRecordExists_(attendanceSheet, id)) {
      return createAttendanceResponse_(true, 'already-recorded', 'تم تسجيل حضور هذا المشارك مسبقاً', id);
    }
    attendanceSheet.appendRow([id]);
    return createAttendanceResponse_(true, 'attendance-recorded', 'تم تسجيل الحضور بنجاح', id);
  } finally {
    lock.releaseLock();
  }
}
