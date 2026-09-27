import { CommonModule } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { RegistrationApiService } from '../../core/services/registration-api.service';
import { ConfigService } from '../../core/services/config.service';
import { AttendanceSelectionService } from '../../core/services/attendance-selection.service';
import {
  ATTENDANCE_DAY_OPTIONS,
  ATTENDANCE_DAYS_OPTIONS,
  GENDER_OPTIONS,
  HAS_FRIENDS_FOR_ACCOMMODATION_OPTIONS,
  HAS_WHATSAPP_OPTIONS,
  MARRIED_SPOUSE_BOOKED_OPTIONS,
  Registration,
  RegistrationSubmitPayload,
  Room,
  TRANSPORTATION_TYPE_OPTIONS,
  UploadImageType
} from '../../core/models/registration.model';
import { arabicTextValidator } from '../../shared/validators/arabic-text.validator';
import { egyptianMobileValidator } from '../../shared/validators/egyptian-mobile.validator';
import { nationalIdValidator } from '../../shared/validators/national-id.validator';
import { imageFileValidator } from '../../shared/validators/image-file.validator';
import { notBlankValidator } from '../../shared/validators/not-blank.validator';
import { fileToUploadPayload } from '../../shared/utils/file-to-base64.util';
import { toUserFacingApiErrorMessage } from '../../shared/utils/api-error.util';

type ImageFieldKey = 'frontIdImage' | 'backIdImage' | 'personalPhoto' | 'carLicense';

/** Maps each Angular image field to the backend's ImageType label used in filenames/UploadLog. */
const IMAGE_TYPE_BY_FIELD: Record<ImageFieldKey, UploadImageType> = {
  frontIdImage: 'Front',
  backIdImage: 'Back',
  personalPhoto: 'Personal',
  carLicense: 'CarLicense'
};

type ImageUploadStatus = 'idle' | 'uploading' | 'uploaded' | 'error' | 'stale';

interface ImageUploadState {
  status: ImageUploadStatus;
  fileId: string | null;
  fileUrl: string | null;
  errorMessage: string | null;
  /** Real upload progress (0-100) from actual bytes sent over the request - never a fake/timer-based value. null when not currently measurable. */
  progress: number | null;
}

function createIdleImageState(): ImageUploadState {
  return { status: 'idle', fileId: null, fileUrl: null, errorMessage: null, progress: null };
}

interface AlertState {
  type: 'success' | 'error' | 'info';
  message: string;
}

@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './registration.component.html',
  styleUrl: './registration.component.scss'
})
export class RegistrationComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(RegistrationApiService);
  private readonly configService = inject(ConfigService);
  private readonly router = inject(Router);
  private readonly attendanceSelection = inject(AttendanceSelectionService);

  readonly posterLoadFailed = signal(false);

  readonly genderOptions = GENDER_OPTIONS;
  readonly attendanceDaysOptions = ATTENDANCE_DAYS_OPTIONS;
  readonly transportationTypeOptions = TRANSPORTATION_TYPE_OPTIONS;
  readonly attendanceDayOptions = ATTENDANCE_DAY_OPTIONS;
  readonly marriedSpouseBookedOptions = MARRIED_SPOUSE_BOOKED_OPTIONS;
  readonly hasFriendsForAccommodationOptions = HAS_FRIENDS_FOR_ACCOMMODATION_OPTIONS;
  readonly hasWhatsAppOptions = HAS_WHATSAPP_OPTIONS;

  // الخادم - loaded dynamically from /assets/config.json (see ConfigService)
  // instead of being hardcoded, so new options don't require a code change.
  readonly servantOptions = signal<string[]>([]);
  readonly isLoadingServantOptions = signal(false);
  readonly servantOptionsError = signal<string | null>(null);

  readonly isSubmitting = signal(false);
  readonly alert = signal<AlertState | null>(null);

  // Room dropdown ("التسكين: اختار الغرفه") - loaded from the Rooms sheet
  // via the "getRooms" API action, which also computes occupancy server-side.
  readonly rooms = signal<Room[]>([]);
  readonly isLoadingRooms = signal(false);
  readonly roomsError = signal<string | null>(null);

  readonly previews: Record<ImageFieldKey, string | null> = {
    frontIdImage: null,
    backIdImage: null,
    personalPhoto: null,
    carLicense: null
  };

  // Independent per-image upload state (see uploadSelectedImage()). Each
  // image is uploaded to Drive on its own, well before "إرسال" - this tracks
  // where each one currently stands so submit() can verify all required
  // images finished uploading, and the template can show the right status.
  readonly imageUploads: Record<ImageFieldKey, ImageUploadState> = {
    frontIdImage: createIdleImageState(),
    backIdImage: createIdleImageState(),
    personalPhoto: createIdleImageState(),
    carLicense: createIdleImageState()
  };

  // Client-generated (crypto.randomUUID()) once per registration attempt -
  // the SAME Id used for every image upload's association key AND the final
  // Registeration row's Id. The backend now accepts this rather than
  // generating its own, since images must be uploaded (and therefore
  // associated with a stable Id) before the registration itself exists.
  private registrationId: string = crypto.randomUUID();

  // Reserved lazily - the first time an upload is actually attempted, not on
  // page load (see ensureSerialNoReserved()). Stays fixed for the session
  // once set, even if the person edits their name afterwards.
  readonly serialNo = signal<number | null>(null);
  private serialNoReservationPromise: Promise<number | null> | null = null;

  readonly fullNameGateMessage = 'من فضلك أدخل الاسم أولاً';

  readonly form = this.fb.group({
    firstName: this.fb.control('', [Validators.required, arabicTextValidator()]),
    secondName: this.fb.control('', [Validators.required, arabicTextValidator()]),
    thirdName: this.fb.control('', [Validators.required, arabicTextValidator()]),
    fourthName: this.fb.control('', [Validators.required, arabicTextValidator()]),

    mobile: this.fb.control('', [Validators.required, egyptianMobileValidator()]),
    hasWhatsApp: this.fb.control('', [Validators.required]),
    whatsAppNumber: this.fb.control(''),

    gender: this.fb.control('', [Validators.required]),
    job: this.fb.control(''),
    diocese: this.fb.control('', [Validators.required]),

    attendanceDays: this.fb.control('', [Validators.required]),
    transportationType: this.fb.control(''),
    carLicenseNumber: this.fb.control(''),
    attendanceDay: this.fb.control(''),
    marriedAndYourSpousebookInConference: this.fb.control(''),
    wifeName: this.fb.control(''),
    childrenAbove4Years: this.fb.control<number | null>(null),
    carNo: this.fb.control(''),
    carLicense: this.fb.control<File | string | null>(null),

    servantName: this.fb.control('', [Validators.required]),

    frontIdImage: this.fb.control<File | string | null>(null, [Validators.required, imageFileValidator()]),
    backIdImage: this.fb.control<File | string | null>(null, [Validators.required, imageFileValidator()]),
    personalPhoto: this.fb.control<File | string | null>(null, [Validators.required, imageFileValidator()]),

    notes: this.fb.control(''),
    nationalId: this.fb.control('', [Validators.required, nationalIdValidator()]),
    hasFriendsForAccommodation: this.fb.control('', [Validators.required]),
    roomId: this.fb.control<number | null>(null)
  });

  constructor() {
    this.form
      .get('attendanceDays')!
      .valueChanges.subscribe((value) => {
        this.updateAttendanceConditionalValidators(value);
        this.updateCarFieldValidators();
        this.updateCarLicenseNumberValidators();
      });

    this.form.get('transportationType')!.valueChanges.subscribe(() => {
      this.updateCarFieldValidators();
      this.updateCarLicenseNumberValidators();
    });

    this.form
      .get('hasFriendsForAccommodation')!
      .valueChanges.subscribe(() => this.updateRoomFieldValidators());

    this.form
      .get('marriedAndYourSpousebookInConference')!
      .valueChanges.subscribe(() => this.updateMarriedSectionValidators());

    this.form.get('hasWhatsApp')!.valueChanges.subscribe(() => this.updateWhatsAppValidators());

    // If the person edits any name field after an image has already been
    // uploaded (uploaded filenames are built from FullName), that upload is
    // no longer valid for the current name - mark it stale so submit() blocks
    // until it's re-uploaded. Drive files are never renamed/deleted here.
    (['firstName', 'secondName', 'thirdName', 'fourthName'] as const).forEach((controlName) => {
      this.form.get(controlName)!.valueChanges.subscribe(() => this.markUploadedImagesStale());
    });

    // The attendance-days value now comes from /attendance-selection (see
    // attendanceSelectedGuard - this component never mounts without one).
    // Setting it here, after every subscription above is registered, drives
    // the exact same existing conditional cascade a radio-button click used
    // to trigger - no duplicate business logic.
    const selectedAttendanceDays = this.attendanceSelection.selected();
    if (selectedAttendanceDays) {
      this.form.get('attendanceDays')!.setValue(selectedAttendanceDays);
    }

    this.loadRooms();
    this.loadServantOptions();
  }

  /**
   * Dynamically shows/requires MarriedAndYourSpousebookInConference,
   * TransportationType and AttendanceDay depending on the selected
   * أيام الحضور option, and clears whichever field(s) are hidden so their
   * stale values are never submitted.
   *
   * | AttendanceDays                     | Married          | TransportationType | AttendanceDay    |
   * |-------------------------------------|------------------|---------------------|-------------------|
   * | الجمعة والسبت بالمواصلات            | Show + Required  | Hidden              | Hidden            |
   * | الجمعة والسبت بدون مواصلات          | Show + Required  | Show + Required     | Hidden            |
   * | يوم واحد بدون مواصلات               | Hidden           | Show + Required     | Show + Required   |
   */
  private updateAttendanceConditionalValidators(attendanceDays: string | null): void {
    const transportationType = this.form.get('transportationType')!;
    const attendanceDay = this.form.get('attendanceDay')!;
    const married = this.form.get('marriedAndYourSpousebookInConference')!;

    transportationType.setValue('', { emitEvent: false });
    attendanceDay.setValue('', { emitEvent: false });
    married.setValue('', { emitEvent: false });

    if (attendanceDays === 'الجمعة والسبت بالمواصلات') {
      married.setValidators([Validators.required]);
      transportationType.clearValidators();
      attendanceDay.clearValidators();
    } else if (attendanceDays === 'الجمعة والسبت بدون مواصلات') {
      married.setValidators([Validators.required]);
      transportationType.setValidators([Validators.required]);
      attendanceDay.clearValidators();
    } else if (attendanceDays === 'يوم واحد بدون مواصلات') {
      attendanceDay.setValidators([Validators.required]);
      transportationType.setValidators([Validators.required]);
      married.clearValidators();
    } else {
      married.clearValidators();
      transportationType.clearValidators();
      attendanceDay.clearValidators();
    }

    married.updateValueAndValidity({ emitEvent: false });
    transportationType.updateValueAndValidity({ emitEvent: false });
    attendanceDay.updateValueAndValidity({ emitEvent: false });

    // married.setValue() above uses emitEvent:false, so its own valueChanges
    // subscription never fires - resync WifeName/accommodation gating here instead.
    this.updateMarriedSectionValidators();
  }

  get showMarriedField(): boolean {
    const value = this.form.get('attendanceDays')!.value;
    return value === 'الجمعة والسبت بالمواصلات' || value === 'الجمعة والسبت بدون مواصلات';
  }

  /** Read-only display of the option chosen on /attendance-selection - no radio buttons here anymore. */
  get selectedAttendanceDaysLabel(): string {
    return this.form.get('attendanceDays')!.value || '';
  }

  get showTransportationTypeField(): boolean {
    const value = this.form.get('attendanceDays')!.value;
    return value === 'الجمعة والسبت بدون مواصلات' || value === 'يوم واحد بدون مواصلات';
  }

  /** "ادخل رقم الرخصة" - shown/required whenever سيارة خاصة is selected, regardless of attendance day (independent of showCarFields below). */
  get showCarLicenseNumberField(): boolean {
    return this.form.get('transportationType')!.value === 'Private Car';
  }

  /** Pure setter: applies (or removes) the CarLicenseNumber validator without touching its value. */
  private setCarLicenseNumberValidators(isRequired: boolean): void {
    const carLicenseNumber = this.form.get('carLicenseNumber')!;
    if (isRequired) {
      carLicenseNumber.setValidators([Validators.required, notBlankValidator()]);
    } else {
      carLicenseNumber.clearValidators();
    }
    carLicenseNumber.updateValueAndValidity({ emitEvent: false });
  }

  /** Re-evaluates showCarLicenseNumberField and clears CarLicenseNumber whenever مواصلات عامة is selected (or transportation becomes unset). */
  private updateCarLicenseNumberValidators(): void {
    if (!this.showCarLicenseNumberField) {
      this.form.get('carLicenseNumber')!.setValue('', { emitEvent: false });
    }
    this.setCarLicenseNumberValidators(this.showCarLicenseNumberField);
  }

  get showAttendanceDayField(): boolean {
    return this.form.get('attendanceDays')!.value === 'يوم واحد بدون مواصلات';
  }

  /** CarNo/CarLicense apply only when AttendanceDays is "يوم واحد بدون مواصلات" AND TransportationType is "Private Car". */
  get showCarFields(): boolean {
    return (
      this.form.get('attendanceDays')!.value === 'يوم واحد بدون مواصلات' &&
      this.form.get('transportationType')!.value === 'Private Car'
    );
  }

  /** Pure setter: applies (or removes) CarNo/CarLicense validators without touching their values. */
  private setCarFieldValidators(isRequired: boolean): void {
    const carNo = this.form.get('carNo')!;
    const carLicense = this.form.get('carLicense')!;
    if (isRequired) {
      carNo.setValidators([Validators.required, notBlankValidator()]);
      carLicense.setValidators([Validators.required, imageFileValidator()]);
    } else {
      carNo.clearValidators();
      carLicense.clearValidators();
    }
    carNo.updateValueAndValidity({ emitEvent: false });
    carLicense.updateValueAndValidity({ emitEvent: false });
  }

  /** Re-evaluates showCarFields and clears CarNo/CarLicense whenever the scenario turns off. */
  private updateCarFieldValidators(): void {
    if (!this.showCarFields) {
      this.form.get('carNo')!.setValue('', { emitEvent: false });
      this.form.get('carLicense')!.setValue(null, { emitEvent: false });
      this.previews.carLicense = null;
      this.imageUploads.carLicense = createIdleImageState();
    }
    this.setCarFieldValidators(this.showCarFields);
  }

  /** Loads الخادم options from /assets/config.json. New options added there appear automatically - no code change needed. */
  /** Reused banner asset (same file as /attendance-selection) - graceful fallback if it fails to load. */
  onPosterError(): void {
    this.posterLoadFailed.set(true);
  }

  loadServantOptions(): void {
    this.isLoadingServantOptions.set(true);
    this.servantOptionsError.set(null);
    this.configService
      .getConfig()
      .pipe(finalize(() => this.isLoadingServantOptions.set(false)))
      .subscribe({
        next: (config) => this.servantOptions.set(config.servantOptions ?? []),
        error: (err) =>
          this.servantOptionsError.set(
            toUserFacingApiErrorMessage(err, 'تعذر تحميل قائمة الخدام، برجاء إعادة المحاولة')
          )
      });
  }

  /** "ادخل رقم الواتس اب" - shown/required only when the mobile is NOT WhatsApp-enabled (لا), since then a separate number is needed. */
  get showWhatsAppField(): boolean {
    return this.form.get('hasWhatsApp')!.value === 'لا';
  }

  /** Pure setter: applies (or removes) the WhatsAppNumber validator without touching its value. */
  private setWhatsAppValidators(isRequired: boolean): void {
    const whatsAppNumber = this.form.get('whatsAppNumber')!;
    if (isRequired) {
      whatsAppNumber.setValidators([Validators.required, egyptianMobileValidator()]);
    } else {
      whatsAppNumber.clearValidators();
    }
    whatsAppNumber.updateValueAndValidity({ emitEvent: false });
  }

  /** Re-evaluates showWhatsAppField and clears WhatsAppNumber whenever the answer is "لا" or unanswered. */
  private updateWhatsAppValidators(): void {
    if (!this.showWhatsAppField) {
      this.form.get('whatsAppNumber')!.setValue('', { emitEvent: false });
    }
    this.setWhatsAppValidators(this.showWhatsAppField);
  }

  /** "ادخل اسم الزوجه" - shown/required only when married === 'نعم'. */
  get showWifeNameField(): boolean {
    return this.form.get('marriedAndYourSpousebookInConference')!.value === 'نعم';
  }

  /** The existing accommodation section (friends question + room dropdown) is now only shown when married === 'لا'. */
  get showAccommodationSection(): boolean {
    return this.form.get('marriedAndYourSpousebookInConference')!.value === 'لا';
  }

  /** True when the person wants to room with friends - shows/requires RoomId. Also requires the accommodation section itself to be visible. */
  get showRoomDropdown(): boolean {
    return this.showAccommodationSection && this.form.get('hasFriendsForAccommodation')!.value === 'نعم';
  }

  /** True when staff will assign a room later - shows the informational note instead of the dropdown. */
  get showNoRoomMessage(): boolean {
    return this.showAccommodationSection && this.form.get('hasFriendsForAccommodation')!.value === 'لا';
  }

  /** Pure setter: applies (or removes) the WifeName validator without touching its value. */
  private setWifeNameValidators(isRequired: boolean): void {
    const wifeName = this.form.get('wifeName')!;
    if (isRequired) {
      wifeName.setValidators([Validators.required]);
    } else {
      wifeName.clearValidators();
    }
    wifeName.updateValueAndValidity({ emitEvent: false });
  }

  /**
   * Pure setter for "ادخل عدد الاولاد فوق ال 4 سنوات؟" - optional (not
   * required, per the business rule: don't assume it's mandatory just
   * because WifeName is), but never negative when a value is provided. 0 is
   * a valid value; Validators.min(0) does not flag it, and leaves an empty
   * control alone (no "required" side effect).
   */
  private setChildrenAbove4YearsValidators(isVisible: boolean): void {
    const childrenAbove4Years = this.form.get('childrenAbove4Years')!;
    if (isVisible) {
      childrenAbove4Years.setValidators([Validators.min(0)]);
    } else {
      childrenAbove4Years.clearValidators();
    }
    childrenAbove4Years.updateValueAndValidity({ emitEvent: false });
  }

  /** Pure setter: applies (or removes) the HasFriendsForAccommodation validator without touching its value. */
  private setHasFriendsValidators(isRequired: boolean): void {
    const hasFriends = this.form.get('hasFriendsForAccommodation')!;
    if (isRequired) {
      hasFriends.setValidators([Validators.required]);
    } else {
      hasFriends.clearValidators();
    }
    hasFriends.updateValueAndValidity({ emitEvent: false });
  }

  /**
   * Re-evaluates which sub-section - WifeName (+ChildrenAbove4Years) vs the
   * accommodation section - should be shown/required based on the married
   * question's current value, clearing whichever one is now hidden so a
   * stale value is never submitted. Also resyncs RoomId via
   * updateRoomFieldValidators(), since showRoomDropdown now depends on
   * showAccommodationSection too.
   */
  private updateMarriedSectionValidators(): void {
    const showWife = this.showWifeNameField;
    const showAccommodation = this.showAccommodationSection;

    if (!showWife) {
      this.form.get('wifeName')!.setValue('', { emitEvent: false });
      this.form.get('childrenAbove4Years')!.setValue(null, { emitEvent: false });
    }
    if (!showAccommodation) {
      this.form.get('hasFriendsForAccommodation')!.setValue('', { emitEvent: false });
    }

    this.setWifeNameValidators(showWife);
    this.setChildrenAbove4YearsValidators(showWife);
    this.setHasFriendsValidators(showAccommodation);
    this.updateRoomFieldValidators();
  }

  /** Pure setter: applies (or removes) the RoomId validator without touching its value. */
  private setRoomFieldValidators(isRequired: boolean): void {
    const roomId = this.form.get('roomId')!;
    if (isRequired) {
      roomId.setValidators([Validators.required]);
    } else {
      roomId.clearValidators();
    }
    roomId.updateValueAndValidity({ emitEvent: false });
  }

  /** Re-evaluates showRoomDropdown and clears RoomId whenever the person no longer wants to pick a room. */
  private updateRoomFieldValidators(): void {
    if (!this.showRoomDropdown) {
      this.form.get('roomId')!.setValue(null, { emitEvent: false });
    }
    this.setRoomFieldValidators(this.showRoomDropdown);
  }

  /** Loads rooms with availability for the accommodation dropdown. */
  loadRooms(): void {
    this.isLoadingRooms.set(true);
    this.roomsError.set(null);
    this.api
      .getRooms()
      .pipe(finalize(() => this.isLoadingRooms.set(false)))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.rooms.set(response.data ?? []);
          } else {
            this.roomsError.set('تعذر تحميل قائمة الغرف، برجاء إعادة المحاولة');
          }
        },
        error: (err) => {
          this.roomsError.set(toUserFacingApiErrorMessage(err, 'تعذر تحميل قائمة الغرف، برجاء إعادة المحاولة'));
        }
      });
  }

  /**
   * Rooms shown in the dropdown. Once a Gender is selected, only rooms whose
   * Gender matches are offered (a Male attendee shouldn't be assigned a
   * Female room). Before Gender is chosen, all rooms are shown.
   */
  get filteredRooms(): Room[] {
    const gender = this.form.get('gender')!.value;
    return gender ? this.rooms().filter((room) => room.gender === gender) : this.rooms();
  }

  /** The full Room object for the currently selected roomId, used to render the details block. */
  get selectedRoom(): Room | null {
    const roomId = this.form.get('roomId')!.value;
    if (roomId === null || roomId === undefined) {
      return null;
    }
    return this.rooms().find((room) => room.id === roomId) ?? null;
  }

  formatRoomOptionLabel(room: Room): string {
    if (room.isFull) {
      return `${room.name} - مكتملة`;
    }
    return `${room.name} - المتاح: ${room.availableSpaces} من ${room.capacity}`;
  }

  /** Comma-separated MASKED occupant names for the "الحاجزين" line, or "لا يوجد" when the room is empty. */
  formatOccupantNames(room: Room): string {
    return room.occupantNames.length > 0
      ? room.occupantNames.map((name) => this.maskOccupantName(name)).join(', ')
      : 'لا يوجد';
  }

  /**
   * Masks a name for display only (the raw FullName in the API response and
   * Google Sheets is never touched): first word stays fully visible, every
   * subsequent word becomes its first character + "***".
   * e.g. "حسام عطية يعقوب" -> "حسام ع*** ي***".
   */
  private maskOccupantName(fullName: string): string {
    const words = (fullName ?? '').trim().split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      return '';
    }
    if (words.length === 1) {
      return words[0];
    }
    const [firstWord, ...restWords] = words;
    const maskedRest = restWords.map((word) => `${word.charAt(0)}***`);
    return [firstWord, ...maskedRest].join(' ');
  }

  /** Generic error-message lookup for template use. */
  errorFor(controlName: string): string | null {
    const control = this.form.get(controlName);
    if (!control || !control.touched || control.valid) {
      return null;
    }
    const messages: Record<string, Record<string, string>> = {
      firstName: { required: 'الاسم الأول مطلوب', invalidArabicText: 'الاسم الأول يجب أن يكون باللغة العربية' },
      secondName: { required: 'الاسم الثاني مطلوب', invalidArabicText: 'الاسم الثاني يجب أن يكون باللغة العربية' },
      thirdName: { required: 'الاسم الثالث مطلوب', invalidArabicText: 'الاسم الثالث يجب أن يكون باللغة العربية' },
      fourthName: { required: 'الاسم الرابع مطلوب', invalidArabicText: 'الاسم الرابع يجب أن يكون باللغة العربية' },
      mobile: { required: 'رقم الموبايل مطلوب', invalidMobile: 'رقم الموبايل غير صحيح' },
      hasWhatsApp: { required: 'هل رقم الموبيل به واتس اب؟ مطلوب' },
      whatsAppNumber: { required: 'رقم الواتس اب مطلوب', invalidMobile: 'رقم الواتس اب غير صحيح' },
      gender: { required: 'النوع مطلوب' },
      diocese: { required: 'الأبرشية مطلوبة' },
      attendanceDays: { required: 'أيام الحضور مطلوبة' },
      transportationType: { required: 'وسيلة المواصلات مطلوبة' },
      attendanceDay: { required: 'يوم الحضور مطلوب' },
      marriedAndYourSpousebookInConference: {
        required: 'هل أنت متزوج وزوجك / زوجتك حجزت معك المؤتمر؟ مطلوب'
      },
      wifeName: { required: 'اسم الزوجه مطلوب' },
      childrenAbove4Years: { min: 'العدد يجب ألا يكون أقل من صفر' },
      carNo: { required: 'رقم السيارة مطلوب', blank: 'رقم السيارة مطلوب' },
      carLicenseNumber: { required: 'رقم الرخصة مطلوب', blank: 'رقم الرخصة مطلوب' },
      carLicense: {
        required: 'صورة الرخصة مطلوبة',
        invalidImageType: 'صيغة الصورة غير مدعومة (JPG, PNG, WEBP فقط)',
        imageTooLarge: 'حجم الصورة أكبر من 10 ميجابايت'
      },
      servantName: { required: 'من فضلك اختر الخادم المسؤول' },
      roomId: { required: 'التسكين مطلوب' },
      hasFriendsForAccommodation: { required: 'اختيار التسكين مع الأصدقاء مطلوب' },
      frontIdImage: {
        required: 'صورة البطاقة الأمامية مطلوبة',
        invalidImageType: 'صيغة الصورة غير مدعومة (JPG, PNG, WEBP فقط)',
        imageTooLarge: 'حجم الصورة أكبر من 10 ميجابايت'
      },
      backIdImage: {
        required: 'صورة البطاقة الخلفية مطلوبة',
        invalidImageType: 'صيغة الصورة غير مدعومة (JPG, PNG, WEBP فقط)',
        imageTooLarge: 'حجم الصورة أكبر من 10 ميجابايت'
      },
      personalPhoto: {
        required: 'الصورة الشخصية مطلوبة',
        invalidImageType: 'صيغة الصورة غير مدعومة (JPG, PNG, WEBP فقط)',
        imageTooLarge: 'حجم الصورة أكبر من 10 ميجابايت'
      },
      nationalId: {
        required: 'الرقم القومي مطلوب',
        invalidNationalId: 'الرقم القومي يجب أن يتكون من 14 رقم'
      }
    };
    const fieldMessages = messages[controlName];
    if (!fieldMessages) {
      return null;
    }
    const errorKey = Object.keys(control.errors ?? {})[0];
    return fieldMessages[errorKey] ?? null;
  }

  /** True once all four name fields are individually valid - gates every image upload button. */
  get isFullNameReady(): boolean {
    return (['firstName', 'secondName', 'thirdName', 'fourthName'] as const).every(
      (name) => this.form.get(name)!.valid
    );
  }

  /**
   * Any edit to a name field while an image is already 'uploaded' invalidates
   * that upload (its Drive filename was built from the name at upload time).
   * The Drive file itself is left alone - only the local reference is
   * cleared, so a stale reference can never be submitted.
   */
  private markUploadedImagesStale(): void {
    (Object.keys(this.imageUploads) as ImageFieldKey[]).forEach((field) => {
      const state = this.imageUploads[field];
      if (state.status === 'uploaded') {
        state.status = 'stale';
        state.fileId = null;
        state.fileUrl = null;
      }
    });
  }

  /**
   * Reserves SerialNo exactly once per session, the first time it's actually
   * needed (i.e. the first image upload attempt) - never on page load, so
   * people who open the form and leave don't burn a serial number. Reuses
   * the in-flight request if a second image upload starts before the first
   * reservation resolves, so two near-simultaneous uploads never call
   * reserveSerialNo twice for the same session.
   */
  private ensureSerialNoReserved(): Promise<number | null> {
    const current = this.serialNo();
    if (current !== null) {
      return Promise.resolve(current);
    }
    if (this.serialNoReservationPromise) {
      return this.serialNoReservationPromise;
    }

    this.serialNoReservationPromise = new Promise<number | null>((resolve) => {
      this.api.reserveSerialNo(this.registrationId).subscribe({
        next: (response) => {
          const reserved = response.success && response.data ? response.data.serialNo : null;
          if (reserved !== null) {
            this.serialNo.set(reserved);
          }
          this.serialNoReservationPromise = null;
          resolve(reserved);
        },
        error: () => {
          this.serialNoReservationPromise = null;
          resolve(null);
        }
      });
    });
    return this.serialNoReservationPromise;
  }

  /** Handles file-input change events for the four image controls - selecting a file does NOT upload it. */
  /** Handles file-input change events for the four image controls - selecting a file now auto-starts its upload (no separate "رفع الصورة" button). */
  onFileSelected(event: Event, field: ImageFieldKey): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      return;
    }
    this.form.get(field)!.setValue(file);
    this.form.get(field)!.markAsTouched();

    // A newly selected file has not been uploaded yet - reset this slot's
    // upload state before immediately starting the upload below.
    this.imageUploads[field] = createIdleImageState();

    const reader = new FileReader();
    reader.onload = () => {
      this.previews[field] = reader.result as string;
    };
    reader.readAsDataURL(file);

    // Auto-upload immediately - selecting (or replacing) an image is the
    // only action needed; there is no separate "رفع الصورة" button.
    void this.uploadSelectedImage(field);
  }

  /**
   * Uploads the currently-selected file for one image field, independently
   * of final registration submission. Does nothing if the FullName gate is
   * closed, nothing is selected yet, or an upload for this slot is already
   * in flight (prevents starting a second upload for the same field while
   * one is already running).
   */
  async uploadSelectedImage(field: ImageFieldKey): Promise<void> {
    if (!this.isFullNameReady) {
      return;
    }
    const file = this.form.get(field)!.value;
    if (!(file instanceof File)) {
      return;
    }

    const state = this.imageUploads[field];
    if (state.status === 'uploading') {
      return;
    }

    state.status = 'uploading';
    state.errorMessage = null;
    state.progress = 0;

    const serialNo = await this.ensureSerialNoReserved();
    if (serialNo === null) {
      state.status = 'error';
      state.errorMessage = 'تعذر حجز الرقم التسلسلي، برجاء المحاولة مرة أخرى';
      state.progress = null;
      return;
    }

    let uploadPayload;
    try {
      uploadPayload = await fileToUploadPayload(file);
    } catch {
      state.status = 'error';
      state.errorMessage = 'تعذرت معالجة الصورة';
      state.progress = null;
      return;
    }

    const raw = this.form.getRawValue();
    const fullName = [raw.firstName, raw.secondName, raw.thirdName, raw.fourthName].join(' ').trim();

    this.api
      .uploadImage({
        RegistrationId: this.registrationId,
        SerialNo: serialNo,
        FullName: fullName,
        ImageType: IMAGE_TYPE_BY_FIELD[field],
        fileName: uploadPayload.fileName,
        mimeType: uploadPayload.mimeType,
        base64Data: uploadPayload.base64Data
      })
      .subscribe({
        next: (event) => {
          // Real progress from actual bytes sent over the XHR request -
          // never a fake/timer-based percentage.
          if (event.type === HttpEventType.UploadProgress) {
            state.progress = event.total ? Math.round((event.loaded / event.total) * 100) : null;
            return;
          }
          if (event.type !== HttpEventType.Response) {
            return;
          }
          const response = event.body;
          if (response?.success && response.data) {
            state.status = 'uploaded';
            state.fileId = response.data.fileId;
            state.fileUrl = response.data.fileUrl;
            state.errorMessage = null;
            state.progress = 100;
          } else {
            state.status = 'error';
            state.errorMessage = response?.message || 'تعذر رفع الصورة';
            state.progress = null;
          }
        },
        error: (err) => {
          state.status = 'error';
          state.errorMessage = toUserFacingApiErrorMessage(err, 'تعذر رفع الصورة، برجاء المحاولة مرة أخرى');
          state.progress = null;
        }
      });
  }

  removeImage(field: ImageFieldKey): void {
    this.form.get(field)!.setValue(null);
    this.form.get(field)!.markAsTouched();
    this.previews[field] = null;
    this.imageUploads[field] = createIdleImageState();
  }

  async submit(): Promise<void> {
    // [perf] Diagnostic timing only - logged to the browser console, no
    // behavior change. Remove or ignore these once you're done profiling.
    const perfStart = performance.now();
    console.log('[perf] Registration start');

    this.alert.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.alert.set({ type: 'error', message: 'يرجى مراجعة الحقول المطلوبة وتصحيح الأخطاء' });
      return;
    }

    if (this.selectedRoom?.isFull) {
      this.alert.set({ type: 'error', message: 'هذه الغرفة اكتملت بالفعل، برجاء اختيار غرفة أخرى' });
      return;
    }

    const missingImagesMessage = this.getMissingRequiredImagesMessage();
    if (missingImagesMessage) {
      this.alert.set({ type: 'error', message: missingImagesMessage });
      return;
    }

    this.isSubmitting.set(true);
    const payloadStart = performance.now();
    const payload = this.buildPayload();
    console.log('[perf] Payload preparation: ' + (performance.now() - payloadStart).toFixed(0) + ' ms');

    this.api
      .createRegistration(payload)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (response) => {
          console.log('[perf] Total (client, click\u2192response): ' + (performance.now() - perfStart).toFixed(0) + ' ms');
          if (response.success && response.data?.Id) {
            // New registration created - hand off to the dedicated success
            // page with the SAME Id used for every image upload throughout
            // this session (never a separately server-generated one).
            this.attendanceSelection.clear(); // Next registration must choose attendance again.
            this.router.navigate(['/registration-success'], {
              state: { registrationId: response.data.Id }
            });
          } else if (response.success) {
            this.alert.set({ type: 'success', message: 'تم إرسال التسجيل بنجاح' });
            this.resetForm();
          } else {
            // Includes the existing server-side duplicate-mobile rejection -
            // shown as a plain error, with no way to load/edit that record.
            this.alert.set({ type: 'error', message: response.message || 'حدث خطأ أثناء الإرسال' });
          }
        },
        error: (err) => {
          console.log('[perf] Total (client, click\u2192error): ' + (performance.now() - perfStart).toFixed(0) + ' ms');
          this.alert.set({ type: 'error', message: toUserFacingApiErrorMessage(err) });
        }
      });
  }

  /**
   * Checks that every currently-required image reports status 'uploaded' -
   * 'idle'/'error'/'stale' all block submission the same way 'missing' does.
   * Returns null when everything required is ready, or a single combined
   * Arabic message naming which image(s) still need attention.
   */
  private getMissingRequiredImagesMessage(): string | null {
    const requiredFields: { field: ImageFieldKey; label: string }[] = [
      { field: 'frontIdImage', label: 'صورة البطاقة الأمامية' },
      { field: 'backIdImage', label: 'صورة البطاقة الخلفية' },
      { field: 'personalPhoto', label: 'الصورة الشخصية' }
    ];
    if (this.showCarFields) {
      requiredFields.push({ field: 'carLicense', label: 'صورة الرخصة' });
    }

    const missing = requiredFields.filter(({ field }) => this.imageUploads[field].status !== 'uploaded');
    if (missing.length === 0) {
      return null;
    }
    const labels = missing.map(({ label }) => label).join('، ');
    return `يرجى رفع الصور المطلوبة قبل إرسال التسجيل: ${labels}`;
  }

  private buildPayload(): RegistrationSubmitPayload {
    const raw = this.form.getRawValue();
    const fullName = [raw.firstName, raw.secondName, raw.thirdName, raw.fourthName].join(' ').trim();
    const isTransportationVisible =
      raw.attendanceDays === 'الجمعة والسبت بدون مواصلات' || raw.attendanceDays === 'يوم واحد بدون مواصلات';
    const isCarScenario = raw.attendanceDays === 'يوم واحد بدون مواصلات' && raw.transportationType === 'Private Car';

    const payload: RegistrationSubmitPayload = {
      // The exact same Id used for every image upload throughout this
      // session, and the SerialNo reserved (server-side, concurrency-safe)
      // the first time an upload was attempted - never regenerated here.
      Id: this.registrationId,
      SerialNo: this.serialNo() ?? undefined,
      FirstName: raw.firstName!,
      SecondName: raw.secondName!,
      ThirdName: raw.thirdName!,
      FourthName: raw.fourthName!,
      FullName: fullName,
      Mobile: raw.mobile!,
      HasWhatsApp: raw.hasWhatsApp!,
      WhatsAppNumber: raw.hasWhatsApp === 'لا' ? (raw.whatsAppNumber ?? '').trim() : '',
      Gender: raw.gender as 'Male' | 'Female',
      Job: raw.job ?? '',
      Diocese: raw.diocese!,
      AttendanceDays: raw.attendanceDays!,
      TransportationType: isTransportationVisible ? raw.transportationType ?? '' : '',
      AttendanceDay: raw.attendanceDays === 'يوم واحد بدون مواصلات' ? raw.attendanceDay ?? '' : '',
      MarriedAndYourSpousebookInConference:
        raw.attendanceDays === 'الجمعة والسبت بالمواصلات' || raw.attendanceDays === 'الجمعة والسبت بدون مواصلات'
          ? raw.marriedAndYourSpousebookInConference ?? ''
          : '',
      WifeName: raw.marriedAndYourSpousebookInConference === 'نعم' ? (raw.wifeName ?? '').trim() : '',
      ChildrenAbove4Years: raw.marriedAndYourSpousebookInConference === 'نعم' ? raw.childrenAbove4Years ?? null : null,
      CarNo: isCarScenario ? (raw.carNo ?? '').trim() : '',
      CarLicenseNumber: raw.transportationType === 'Private Car' ? (raw.carLicenseNumber ?? '').trim() : '',
      ServantName: raw.servantName!,
      Notes: raw.notes ?? '',
      NationalId: raw.nationalId!,
      HasFriendsForAccommodation:
        raw.marriedAndYourSpousebookInConference === 'لا' ? raw.hasFriendsForAccommodation ?? '' : '',
      RoomId:
        raw.marriedAndYourSpousebookInConference === 'لا' && raw.hasFriendsForAccommodation === 'نعم'
          ? raw.roomId ?? null
          : null,
      // Images are never sent as Base64 here - each was already uploaded
      // independently (see uploadSelectedImage()); this only carries the
      // file references that upload already produced.
      FrontIdFileId: this.imageUploads.frontIdImage.fileId ?? '',
      FrontIdFileUrl: this.imageUploads.frontIdImage.fileUrl ?? '',
      BackIdFileId: this.imageUploads.backIdImage.fileId ?? '',
      BackIdFileUrl: this.imageUploads.backIdImage.fileUrl ?? '',
      PersonalPhotoFileId: this.imageUploads.personalPhoto.fileId ?? '',
      PersonalPhotoFileUrl: this.imageUploads.personalPhoto.fileUrl ?? '',
      CarLicense: isCarScenario ? this.imageUploads.carLicense.fileUrl ?? '' : ''
    };

    return payload;
  }

  resetForm(): void {
    this.form.reset({
      firstName: '',
      secondName: '',
      thirdName: '',
      fourthName: '',
      mobile: '',
      hasWhatsApp: '',
      whatsAppNumber: '',
      gender: '',
      job: '',
      diocese: '',
      attendanceDays: '',
      transportationType: '',
      attendanceDay: '',
      marriedAndYourSpousebookInConference: '',
      wifeName: '',
      childrenAbove4Years: null,
      carNo: '',
      carLicenseNumber: '',
      carLicense: null,
      servantName: '',
      frontIdImage: null,
      backIdImage: null,
      personalPhoto: null,
      notes: '',
      nationalId: '',
      hasFriendsForAccommodation: '',
      roomId: null
    });
    this.previews.frontIdImage = null;
    this.previews.backIdImage = null;
    this.previews.personalPhoto = null;
    this.previews.carLicense = null;

    // A manual reset starts an entirely fresh session: new RegistrationId,
    // a SerialNo to be re-reserved on the next upload attempt, and every
    // image's upload state back to idle - never reusing an
    // abandoned-attempt's identifiers.
    this.registrationId = crypto.randomUUID();
    this.serialNo.set(null);
    this.serialNoReservationPromise = null;
    (Object.keys(this.imageUploads) as ImageFieldKey[]).forEach((field) => {
      this.imageUploads[field] = createIdleImageState();
    });

    // The reset above blanks attendanceDays, but this page no longer offers
    // a way to re-pick it (that only happens on /attendance-selection now) -
    // so restore the current selection right after, re-triggering the same
    // existing conditional cascade.
    const selectedAttendanceDays = this.attendanceSelection.selected();
    if (selectedAttendanceDays) {
      this.form.get('attendanceDays')!.setValue(selectedAttendanceDays);
    }

    this.loadRooms(); // Refresh room availability for the next new registration.
  }

  dismissAlert(): void {
    this.alert.set(null);
  }
}
