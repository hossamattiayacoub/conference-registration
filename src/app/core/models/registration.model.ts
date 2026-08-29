/**
 * Gender values as stored in Google Sheets.
 * Arabic labels are shown in the UI; these English values are persisted.
 */
export type Gender = 'Male' | 'Female';

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'Male', label: 'ذكر' },
  { value: 'Female', label: 'أنثى' }
];

/**
 * Attendance-day options. The exact Arabic string is what gets saved.
 */
export const ATTENDANCE_DAYS_OPTIONS: string[] = [
  'الجمعة والسبت بالمواصلات',
  'الجمعة والسبت بدون مواصلات',
  'يوم واحد بدون مواصلات'
];

/**
 * Shown when AttendanceDays === 'الجمعة والسبت بدون مواصلات' OR
 * 'يوم واحد بدون مواصلات'. English values are what gets saved to the sheet;
 * Arabic labels are shown in the UI.
 */
export type TransportationType = 'Private Car' | 'Public Transportation' | '';

export const TRANSPORTATION_TYPE_OPTIONS: { value: TransportationType; label: string }[] = [
  { value: 'Private Car', label: 'سيارة خاصة' },
  { value: 'Public Transportation', label: 'مواصلات عامة' }
];

/**
 * Shown only when AttendanceDays === 'يوم واحد بدون مواصلات'.
 * English values are what gets saved to the sheet; Arabic labels are shown in the UI.
 */
export type AttendanceDay = 'Friday' | 'Saturday' | '';

export const ATTENDANCE_DAY_OPTIONS: { value: AttendanceDay; label: string }[] = [
  { value: 'Friday', label: 'الجمعة' },
  { value: 'Saturday', label: 'السبت' }
];

/**
 * "هل انت متزوج وزوجك / تك حجزت معك المؤتمر؟" - shown when AttendanceDays is
 * 'الجمعة والسبت بالمواصلات' or 'الجمعة والسبت بدون مواصلات'.
 */
export const MARRIED_SPOUSE_BOOKED_OPTIONS: { value: string; label: string }[] = [
  { value: 'نعم', label: 'نعم' },
  { value: 'لا', label: 'لا' }
];

/**
 * "في التسكين هل لديك اصدقاء (مجموعه) بالمؤتمر ترغب بالسكن معهم في نفس
 * الغرفه؟" - gates whether the room-selection dropdown (RoomId) is shown/required.
 */
export const HAS_FRIENDS_FOR_ACCOMMODATION_OPTIONS: { value: string; label: string }[] = [
  { value: 'نعم', label: 'نعم' },
  { value: 'لا', label: 'لا' }
];

/**
 * A room from the "Rooms" sheet, offered as an option in the accommodation
 * ("التسكين: اختار الغرفه") dropdown. Loaded dynamically via the "getRooms"
 * API action, which also computes occupancy/availability server-side.
 */
export interface Room {
  id: number;
  name: string;
  capacity: number;
  gender: string;
  description: string;
  currentOccupancy: number;
  availableSpaces: number;
  isFull: boolean;
  /** FullName of everyone currently assigned to this room (edit mode excludes the registration being edited). */
  occupantNames: string[];
}

/**
 * Full registration record as stored in / returned from the Registeration sheet.
 */
export interface Registration {
  Id?: string;
  FirstName: string;
  SecondName: string;
  ThirdName: string;
  FourthName: string;
  FullName?: string;
  Mobile: string;
  /** "هل رقم الموبيل به واتس اب" checkbox. */
  HasWhatsApp?: boolean;
  /** "ادخل رقم الواتس اب" - required only when HasWhatsApp is true. */
  WhatsAppNumber?: string;
  Gender: Gender | '';
  Job?: string;
  Diocese: string;
  AttendanceDays: string;
  TransportationType?: string;
  AttendanceDay?: string;
  MarriedAndYourSpousebookInConference?: string;
  /** "ادخل اسم الزوجه" - required only when MarriedAndYourSpousebookInConference === 'نعم'. */
  WifeName?: string;
  /** @deprecated Field removed from the UI; kept optional only so old sheet rows still parse without error. */
  ConferenceBooking?: string;
  /** @deprecated Field removed from the UI (طريقة الدفع); kept optional only so old sheet rows still parse without error. */
  PaymentMethod?: string;
  /** @deprecated Field removed from the UI (مبلغ الدفع); kept optional only so old sheet rows still parse without error. */
  PaymentAmount?: number | null;
  ServantName: string;
  FrontIdFileId?: string;
  FrontIdFileUrl?: string;
  BackIdFileId?: string;
  BackIdFileUrl?: string;
  PersonalPhotoFileId?: string;
  PersonalPhotoFileUrl?: string;
  Notes?: string;
  NationalId: string;
  /**
   * @deprecated Superseded by RoomId (room selection). Kept optional only so
   * old sheet rows/data are never deleted or overwritten - the Angular app
   * no longer reads or writes this field.
   */
  AccommodationFamilyMemberId?: string | null;
  /** "في التسكين هل لديك اصدقاء..." - gates whether RoomId is shown/required. */
  HasFriendsForAccommodation?: string;
  /** Selected room's Id from the Rooms sheet ("التسكين: اختار الغرفه"). Required only when HasFriendsForAccommodation === 'نعم'. */
  RoomId?: number | null;
  /** Car number - required only when AttendanceDays is 'يوم واحد بدون مواصلات' and TransportationType is 'Private Car'. */
  CarNo?: string;
  /**
   * Google Drive URL of the uploaded car license image. Stored as a single
   * column (not a FileId/FileUrl pair like the other three images) because
   * the sheet column name is fixed to exactly "CarLicense".
   */
  CarLicense?: string;
  /**
   * @deprecated Field removed from the UI (يرجى رفع صورة التحويل, tied to the
   * removed طريقة الدفع field). Kept optional only so old sheet rows/data are
   * never deleted or overwritten - the Angular app no longer reads or writes it.
   */
  ReceiptTransferImage?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
}

/**
 * Payload shape sent to the backend for an image field.
 * The Angular app converts a File to Base64 before sending.
 */
export interface ImageUploadPayload {
  fileName: string;
  mimeType: string;
  base64Data: string;
}

/**
 * Data shape posted to the "create"/"update" actions.
 * Image fields carry the raw upload payload only when a new file was chosen;
 * omit them (or leave undefined) to keep the existing stored image on update.
 */
export interface RegistrationSubmitPayload extends Omit<
  Registration,
  'FrontIdFileId' | 'FrontIdFileUrl' | 'BackIdFileId' | 'BackIdFileUrl' | 'PersonalPhotoFileId' | 'PersonalPhotoFileUrl'
> {
  FrontIdImage?: ImageUploadPayload;
  BackIdImage?: ImageUploadPayload;
  PersonalPhotoImage?: ImageUploadPayload;
  // New file chosen for the car-license uploader; CarLicense (inherited from
  // Registration) carries the existing URL forward when no new file is chosen.
  CarLicenseImage?: ImageUploadPayload;
  // Preserve existing URLs/IDs when editing without replacing an image.
  FrontIdFileId?: string;
  FrontIdFileUrl?: string;
  BackIdFileId?: string;
  BackIdFileUrl?: string;
  PersonalPhotoFileId?: string;
  PersonalPhotoFileUrl?: string;
}
