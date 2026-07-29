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

/** Conference booking yes/no options. */
export const CONFERENCE_BOOKING_OPTIONS: { value: string; label: string }[] = [
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
