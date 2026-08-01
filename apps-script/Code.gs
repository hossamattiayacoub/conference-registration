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

    if (action === 'getMembers') {
      return jsonOutput_(getMembers());
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

  const now = new Date().toISOString();
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
    TransportationType: data.AttendanceDays === 'الجمعة والسبت بدون مواصلات' ? data.TransportationType : '',
    AttendanceDay: data.AttendanceDays === 'يوم واحد بدون مواصلات' ? data.AttendanceDay : '',
    MarriedAndYourSpousebookInConference: isMarriedFieldVisible_(data.AttendanceDays)
      ? data.MarriedAndYourSpousebookInConference
      : '',
    ConferenceBooking: data.ConferenceBooking,
    PaymentMethod: data.ConferenceBooking === 'نعم' ? data.PaymentMethod : '',
    PaymentAmount: data.ConferenceBooking === 'نعم' ? data.PaymentAmount : '',
    ServantName: data.ServantName,
    Notes: data.Notes || '',
    NationalId: data.NationalId,
    AccommodationFamilyMemberId: data.AccommodationFamilyMemberId || '',
    CreatedAt: now,
    UpdatedAt: now
  };

  attachUploadedImages_(record, data);

  sheet.appendRow(registrationToRow_(record, headerMap));
  return createApiResponse(true, 'تم إضافة التسجيل بنجاح', record);
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
    TransportationType: data.AttendanceDays === 'الجمعة والسبت بدون مواصلات' ? data.TransportationType : '',
    AttendanceDay: data.AttendanceDays === 'يوم واحد بدون مواصلات' ? data.AttendanceDay : '',
    MarriedAndYourSpousebookInConference: isMarriedFieldVisible_(data.AttendanceDays)
      ? data.MarriedAndYourSpousebookInConference
      : '',
    ConferenceBooking: data.ConferenceBooking,
    PaymentMethod: data.ConferenceBooking === 'نعم' ? data.PaymentMethod : '',
    PaymentAmount: data.ConferenceBooking === 'نعم' ? data.PaymentAmount : '',
    ServantName: data.ServantName,
    Notes: data.Notes || '',
    NationalId: data.NationalId,
    AccommodationFamilyMemberId: data.AccommodationFamilyMemberId || '',
    FrontIdFileId: existingRecord.FrontIdFileId,
    FrontIdFileUrl: existingRecord.FrontIdFileUrl,
    BackIdFileId: existingRecord.BackIdFileId,
    BackIdFileUrl: existingRecord.BackIdFileUrl,
    PersonalPhotoFileId: existingRecord.PersonalPhotoFileId,
    PersonalPhotoFileUrl: existingRecord.PersonalPhotoFileUrl,
    CreatedAt: existingRecord.CreatedAt,
    UpdatedAt: new Date().toISOString()
  };

  attachUploadedImages_(record, data, existingRecord);

  const row = registrationToRow_(record, target.headerMap);
  sheet.getRange(target.rowIndex, 1, 1, row.length).setValues([row]);
  return createApiResponse(true, 'تم تحديث التسجيل بنجاح', record);
}

/**
 * Uploads any new image payloads found on `data` and writes the resulting
 * fileId/fileUrl pairs onto `record`. When updating and a new image
 * replaces an old one, the old Drive file is trashed.
 */
function attachUploadedImages_(record, data, existingRecord) {
  const uploads = [
    { payloadKey: 'FrontIdImage', idKey: 'FrontIdFileId', urlKey: 'FrontIdFileUrl', folderId: CONFIG.FRONT_ID_FOLDER_ID },
    { payloadKey: 'BackIdImage', idKey: 'BackIdFileId', urlKey: 'BackIdFileUrl', folderId: CONFIG.BACK_ID_FOLDER_ID },
    {
      payloadKey: 'PersonalPhotoImage',
      idKey: 'PersonalPhotoFileId',
      urlKey: 'PersonalPhotoFileUrl',
      folderId: CONFIG.PERSONAL_PHOTO_FOLDER_ID
    }
  ];

  uploads.forEach(function (item) {
    const payload = data[item.payloadKey];
    if (payload && payload.base64Data) {
      if (existingRecord && existingRecord[item.idKey]) {
        tryDeleteFile_(existingRecord[item.idKey]);
      }
      const uploaded = uploadImage(payload.base64Data, payload.fileName, payload.mimeType, item.folderId);
      record[item.idKey] = uploaded.fileId;
      record[item.urlKey] = uploaded.fileUrl;
    }
  });
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
 * Returns { id, fullName } for every existing registration row - used to
 * populate the "التسكين: اختار أفراد الأسرة" accommodation dropdown.
 * Rows without an Id are skipped; rows without a FullName are skipped too,
 * since they would be useless/blank options in the dropdown.
 */
function getMembers() {
  try {
    const sheet = getRegistrationSheet_();
    const headerMap = getHeaderIndexMap_(sheet);
    const idCol = headerMap['Id'];
    const nameCol = headerMap['FullName'];
    const lastRow = sheet.getLastRow();

    if (lastRow < 2 || idCol === undefined || nameCol === undefined) {
      return createApiResponse(true, 'Family members loaded successfully', []);
    }

    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    const members = [];
    for (let i = 0; i < values.length; i++) {
      const id = values[i][idCol];
      const fullName = values[i][nameCol];
      if (id && String(id).trim() !== '' && fullName && String(fullName).trim() !== '') {
        members.push({ id: String(id).trim(), fullName: String(fullName).trim() });
      }
    }

    members.sort(function (a, b) {
      return a.fullName.localeCompare(b.fullName, 'ar');
    });

    return createApiResponse(true, 'Family members loaded successfully', members);
  } catch (err) {
    return createApiResponse(false, 'Failed to load family members', []);
  }
}
