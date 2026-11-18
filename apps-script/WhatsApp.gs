/**
 * WhatsApp.gs
 * -----------------------------------------------------------------------
 * Admin-only QR broadcast: reads registrations from the Registeration sheet
 * and sends each person their QR code image through the WhatsApp Cloud API
 * (Meta). Used by the Angular "/send-qr" page.
 *
 * SECRETS live ONLY in Script Properties (Project Settings > Script
 * properties) - never in code, never in the Angular app:
 *
 *   ADMIN_PASSCODE       passcode typed on the /send-qr page
 *   WA_ACCESS_TOKEN      permanent System User token (Meta Business settings)
 *   WA_PHONE_NUMBER_ID   Phone Number ID from WhatsApp Manager / App dashboard
 *   WA_TEMPLATE_NAME     approved template name (Utility, IMAGE header)
 *   WA_TEMPLATE_LANG     template language code, default "ar"
 *   WA_GRAPH_VERSION     optional, default "v23.0"
 *
 * The template must have an IMAGE header (the QR) and a body with exactly
 * ONE variable {{1}} that receives the registrant's full name.
 * -----------------------------------------------------------------------
 */

const WA_DEFAULT_GRAPH_VERSION = 'v23.0';
const WA_DEFAULT_LANG = 'ar';
const WA_FAIL_CACHE_KEY = 'adminPasscodeFailures';
const WA_MAX_FAILURES = 10;
const WA_LOCK_SECONDS = 600;

function waProp_(name, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  return value ? String(value).trim() : (fallback || '');
}

/** Names of required properties that are not configured yet (values never leaked). */
function waMissingProperties_() {
  return ['ADMIN_PASSCODE', 'WA_ACCESS_TOKEN', 'WA_PHONE_NUMBER_ID', 'WA_TEMPLATE_NAME'].filter(function (name) {
    return !waProp_(name);
  });
}

/**
 * Checks the admin passcode. Returns null when valid, otherwise an Arabic
 * error message. Failed attempts are counted globally (Apps Script cannot
 * see client IPs) and lock the endpoint for 10 minutes after 10 failures.
 */
function checkAdminPasscode_(passcode) {
  const cache = CacheService.getScriptCache();
  const failures = Number(cache.get(WA_FAIL_CACHE_KEY) || 0);
  if (failures >= WA_MAX_FAILURES) {
    return 'تم إيقاف المحاولات مؤقتًا بسبب كثرة المحاولات الخاطئة، حاول بعد 10 دقائق';
  }
  const expected = waProp_('ADMIN_PASSCODE');
  if (!expected) {
    return 'لم يتم ضبط كلمة مرور المشرف (ADMIN_PASSCODE) في إعدادات السكربت';
  }
  const given = String(passcode || '');
  // Constant-time comparison.
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) {
    diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    cache.put(WA_FAIL_CACHE_KEY, String(failures + 1), WA_LOCK_SECONDS);
    return 'كلمة المرور غير صحيحة';
  }
  cache.remove(WA_FAIL_CACHE_KEY);
  return null;
}

/**
 * Normalises an Egyptian mobile number to WhatsApp's international format
 * (digits only, country code first): 01012345678 -> 201012345678.
 * Returns '' when the value is not a plausible number.
 */
function normalizeWhatsAppNumber_(raw) {
  let digits = String(raw || '').replace(/[^\d]/g, '');
  if (digits.indexOf('00') === 0) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.charAt(0) === '0') {
    digits = '20' + digits.slice(1);
  } else if (digits.length === 10 && digits.charAt(0) === '1') {
    digits = '20' + digits;
  }
  return /^\d{11,15}$/.test(digits) ? digits : '';
}

/** Which number receives the QR: Mobile, or WhatsAppNumber when HasWhatsApp = "لا". */
function getQrRecipientRaw_(record) {
  return record.HasWhatsApp === 'لا' ? record.WhatsAppNumber : record.Mobile;
}

/** Returns the list of registrants + whether the WhatsApp config is complete. */
function adminListRegistrations(data) {
  const authError = checkAdminPasscode_(data && data.passcode);
  if (authError) {
    return createApiResponse(false, authError, null);
  }

  const sheet = createHeadersIfNeeded();
  const headerMap = getHeaderIndexMap_(sheet);
  const lastRow = sheet.getLastRow();
  const registrants = [];

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    values.forEach(function (row) {
      const record = rowToRegistration_(row, headerMap);
      if (!record.Id) {
        return;
      }
      const recipient = normalizeWhatsAppNumber_(getQrRecipientRaw_(record));
      registrants.push({
        id: String(record.Id),
        serialNo: record.SerialNo === '' ? null : Number(record.SerialNo),
        fullName: String(record.FullName || ''),
        recipient: recipient,
        recipientSource: record.HasWhatsApp === 'لا' ? 'WhatsAppNumber' : 'Mobile',
        qrSentAt: record.QrSentAt ? String(record.QrSentAt) : '',
        qrSendStatus: record.QrSendStatus ? String(record.QrSendStatus) : ''
      });
    });
  }

  return createApiResponse(true, 'تم تحميل البيانات', {
    missingConfig: waMissingProperties_(),
    registrants: registrants
  });
}

/**
 * Sends one registrant their QR code. `data` = { passcode, id, imageBase64 }
 * where imageBase64 is the PNG (no data: prefix) generated in the browser
 * from the registration Id - the same payload the success-page QR encodes.
 * Never sends twice unless data.force === true.
 */
function adminSendQr(data) {
  const authError = checkAdminPasscode_(data && data.passcode);
  if (authError) {
    return createApiResponse(false, authError, null);
  }

  const missing = waMissingProperties_().filter(function (name) { return name !== 'ADMIN_PASSCODE'; });
  if (missing.length > 0) {
    return createApiResponse(false, 'إعدادات واتساب غير مكتملة: ' + missing.join(', '), null);
  }

  const id = String((data && data.id) || '').trim();
  if (!id || !data.imageBase64) {
    return createApiResponse(false, 'بيانات الإرسال ناقصة', null);
  }

  // Claim the row under a lock so a double click / two tabs cannot send twice.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let claim;
  try {
    const sheet = createHeadersIfNeeded();
    const found = findRowById_(sheet, id);
    if (!found) {
      return createApiResponse(false, 'لم يتم العثور على التسجيل', null);
    }
    const record = rowToRegistration_(found.row, found.headerMap);
    if (record.QrSentAt && data.force !== true) {
      return createApiResponse(false, 'تم إرسال الـ QR لهذا المشارك من قبل', { alreadySent: true, qrSentAt: String(record.QrSentAt) });
    }
    const recipient = normalizeWhatsAppNumber_(getQrRecipientRaw_(record));
    if (!recipient) {
      writeQrStatus_(sheet, found, '', 'FAILED: رقم الواتس غير صالح');
      return createApiResponse(false, 'رقم الواتس اب غير صالح', null);
    }
    writeQrStatus_(sheet, found, '', 'SENDING');
    claim = { sheet: sheet, found: found, record: record, recipient: recipient };
  } finally {
    lock.releaseLock();
  }

  // The (slow) network calls run outside the lock.
  try {
    const mediaId = waUploadMedia_(data.imageBase64, id);
    const messageId = waSendTemplate_(claim.recipient, mediaId, claim.record.FullName);
    const sentAt = new Date().toISOString();
    writeQrStatus_(claim.sheet, claim.found, sentAt, 'SENT ' + messageId);
    return createApiResponse(true, 'تم الإرسال', { id: id, qrSentAt: sentAt, qrSendStatus: 'SENT ' + messageId });
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    writeQrStatus_(claim.sheet, claim.found, '', 'FAILED: ' + message.slice(0, 300));
    return createApiResponse(false, 'فشل الإرسال: ' + message, { id: id, qrSendStatus: 'FAILED: ' + message.slice(0, 300) });
  }
}

/** Writes QrSentAt / QrSendStatus for one row (only these two cells). */
function writeQrStatus_(sheet, found, sentAt, status) {
  const sentCol = found.headerMap['QrSentAt'];
  const statusCol = found.headerMap['QrSendStatus'];
  if (sentCol !== undefined) {
    sheet.getRange(found.rowIndex, sentCol + 1).setValue(sentAt);
  }
  if (statusCol !== undefined) {
    sheet.getRange(found.rowIndex, statusCol + 1).setValue(status);
  }
}

function waGraphUrl_(path) {
  return 'https://graph.facebook.com/' + waProp_('WA_GRAPH_VERSION', WA_DEFAULT_GRAPH_VERSION) + '/' + path;
}

function waParseResponse_(response) {
  const code = response.getResponseCode();
  let body = {};
  try {
    body = JSON.parse(response.getContentText());
  } catch (e) {
    body = {};
  }
  if (code < 200 || code >= 300) {
    const apiMessage = body && body.error ? (body.error.error_user_msg || body.error.message) : response.getContentText();
    throw new Error('WhatsApp API ' + code + ': ' + apiMessage);
  }
  return body;
}

/** Uploads the QR PNG to WhatsApp media and returns its media id. */
function waUploadMedia_(imageBase64, id) {
  const blob = Utilities.newBlob(Utilities.base64Decode(imageBase64), 'image/png', 'qr_' + id + '.png');
  const response = UrlFetchApp.fetch(waGraphUrl_(waProp_('WA_PHONE_NUMBER_ID') + '/media'), {
    method: 'post',
    headers: { Authorization: 'Bearer ' + waProp_('WA_ACCESS_TOKEN') },
    payload: { messaging_product: 'whatsapp', type: 'image/png', file: blob },
    muteHttpExceptions: true
  });
  const body = waParseResponse_(response);
  if (!body.id) {
    throw new Error('WhatsApp media upload returned no id');
  }
  return body.id;
}

/** Sends the approved template (image header = QR, body {{1}} = full name). */
function waSendTemplate_(to, mediaId, fullName) {
  const payload = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'template',
    template: {
      name: waProp_('WA_TEMPLATE_NAME'),
      language: { code: waProp_('WA_TEMPLATE_LANG', WA_DEFAULT_LANG) },
      components: [
        { type: 'header', parameters: [{ type: 'image', image: { id: mediaId } }] },
        { type: 'body', parameters: [{ type: 'text', text: String(fullName || '').trim() || '-' }] }
      ]
    }
  };
  const response = UrlFetchApp.fetch(waGraphUrl_(waProp_('WA_PHONE_NUMBER_ID') + '/messages'), {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + waProp_('WA_ACCESS_TOKEN') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const body = waParseResponse_(response);
  return body.messages && body.messages[0] ? body.messages[0].id : 'no-message-id';
}
