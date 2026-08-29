/**
 * Config.gs
 * -----------------------------------------------------------------------
 * Central place for every configurable value used by the backend.
 * Never hardcode IDs or sheet names directly inside business logic files -
 * always reference them from CONFIG so the backend is easy to redeploy
 * against a different spreadsheet / Drive folders.
 * -----------------------------------------------------------------------
 */

const CONFIG = {
  // The Google Spreadsheet used as the database.
  SPREADSHEET_ID: '1mtiEsy2xG-75q_H-WXZs4Q8-MxmkarvnKB2x2XnLbZU',

  // Sheet name is intentionally spelled "Registeration" - do not rename.
  SHEET_NAME: 'Registeration',

  // The Rooms sheet lives in the same spreadsheet and already exists with
  // its own headers - we only read from it, never create/modify its schema.
  ROOMS_SHEET_NAME: 'Rooms',
  ROOMS_HEADERS: ['Id', 'Name', 'Capacity', 'Gender', 'Description'],

  // AttendanceList sheet - already exists in the same spreadsheet. Written
  // to only by recordAttendance() (QR attendance scanner). Single column:
  // the Registeration "Id" of whoever has checked in.
  ATTENDANCE_SHEET_NAME: 'AttendanceList',
  ATTENDANCE_HEADERS: ['id'],

  // Google Drive folder IDs used to store uploaded images.
  // Replace these placeholders with real folder IDs before deploying.
  FRONT_ID_FOLDER_ID: 'PASTE_FRONT_ID_FOLDER_ID_HERE',
  BACK_ID_FOLDER_ID: 'PASTE_BACK_ID_FOLDER_ID_HERE',
  PERSONAL_PHOTO_FOLDER_ID: 'PASTE_PERSONAL_PHOTO_FOLDER_ID_HERE',
  CAR_LICENSE_FOLDER_ID: 'PASTE_CAR_LICENSE_FOLDER_ID_HERE',
  RECEIPT_TRANSFER_FOLDER_ID: 'PASTE_RECEIPT_TRANSFER_FOLDER_ID_HERE',

  // Column order for the Registeration sheet header row.
  // Keep this array in sync with the Registration model used in Angular.
  HEADERS: [
    'Id',
    'FirstName',
    'SecondName',
    'ThirdName',
    'FourthName',
    'FullName',
    'Mobile',
    'HasWhatsApp',
    'WhatsAppNumber',
    'Gender',
    'Job',
    'Diocese',
    'AttendanceDays',
    'ConferenceBooking',
    'PaymentMethod',
    'PaymentAmount',
    'ServantName',
    'FrontIdFileId',
    'FrontIdFileUrl',
    'BackIdFileId',
    'BackIdFileUrl',
    'PersonalPhotoFileId',
    'PersonalPhotoFileUrl',
    'Notes',
    'NationalId',
    'TransportationType',
    'AttendanceDay',
    'MarriedAndYourSpousebookInConference',
    'WifeName',
    'AccommodationFamilyMemberId',
    'CarNo',
    'CarLicenseNumber',
    'CarLicense',
    'ReceiptTransferImage',
    'HasFriendsForAccommodation',
    'RoomId',
    'CreatedAt',
    'UpdatedAt'
  ],

  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024,
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
};
