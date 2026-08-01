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
 * Shown only when AttendanceDays === 'الجمعة والسبت بدون مواصلات'.
 * English values are what gets saved to the sheet; Arabic labels are shown in the UI.
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

/** Conference booking yes/no options. */
export const CONFERENCE_BOOKING_OPTIONS: { value: string; label: string }[] = [
  { value: 'نعم', label: 'نعم' },
  { value: 'لا', label: 'لا' }
];

/**
 * "هل انت متزوج وزوجك / تك حجزت معك المؤتمر؟" - shown when AttendanceDays is
 * 'الجمعة والسبت بالمواصلات' or 'الجمعة والسبت بدون مواصلات'.
 */
export const MARRIED_SPOUSE_BOOKED_OPTIONS: { value: string; label: string }[] = [
  { value: 'نعم', label: 'نعم' },
  { value: 'لا', label: 'لا' }
];

/** Payment method options, only relevant when ConferenceBooking === 'نعم'. */
export const PAYMENT_METHOD_OPTIONS: string[] = ['كاش', 'إنستاباي'];

/** Payment amount options, only relevant when ConferenceBooking === 'نعم'. */
export const PAYMENT_AMOUNT_OPTIONS: number[] = [900, 1000, 800, 600, 500, 400, 300];

/**
 * Servant (المخدوم/الخادم المسؤول) options.
 * Kept in a single constant so the list is easy to update from one place.
 */
export const SERVANT_OPTIONS: string[] = [
  'فادي أمجد',
  'كيرلس طانيوس',
  'مريم سامي',
  'مارينا ملاك',
  'اميره سيدهم',
  'بولا لطفي'
];

/**
 * A person already registered, offered as an option in the accommodation
 * ("التسكين: اختار أفراد الأسرة") dropdown. Loaded dynamically from the
 * Registeration sheet via the "getMembers" API action.
 */
export interface FamilyMemberOption {
  id: string;
  fullName: string;
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
  Gender: Gender | '';
  Job?: string;
  Diocese: string;
  AttendanceDays: string;
  TransportationType?: string;
  AttendanceDay?: string;
  MarriedAndYourSpousebookInConference?: string;
  ConferenceBooking: string;
  PaymentMethod?: string;
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
  AccommodationFamilyMemberId?: string | null;
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
  // Preserve existing URLs/IDs when editing without replacing an image.
  FrontIdFileId?: string;
  FrontIdFileUrl?: string;
  BackIdFileId?: string;
  BackIdFileUrl?: string;
  PersonalPhotoFileId?: string;
  PersonalPhotoFileUrl?: string;
}
