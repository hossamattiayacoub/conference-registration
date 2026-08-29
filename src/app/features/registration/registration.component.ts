import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { RegistrationApiService } from '../../core/services/registration-api.service';
import { ConfigService } from '../../core/services/config.service';
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
  TRANSPORTATION_TYPE_OPTIONS
} from '../../core/models/registration.model';
import { arabicTextValidator } from '../../shared/validators/arabic-text.validator';
import { egyptianMobileValidator } from '../../shared/validators/egyptian-mobile.validator';
import { nationalIdValidator } from '../../shared/validators/national-id.validator';
import { imageFileValidator } from '../../shared/validators/image-file.validator';
import { notBlankValidator } from '../../shared/validators/not-blank.validator';
import { fileToUploadPayload } from '../../shared/utils/file-to-base64.util';

type ImageFieldKey = 'frontIdImage' | 'backIdImage' | 'personalPhoto' | 'carLicense';

interface AlertState {
  type: 'success' | 'error' | 'info';
  message: string;
}

@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './registration.component.html',
  styleUrl: './registration.component.scss'
})
export class RegistrationComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(RegistrationApiService);
  private readonly configService = inject(ConfigService);
  private readonly router = inject(Router);

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

  // Always empty now that editing is removed (registration is create-only).
  // Kept as a stable field so buildPayload()'s spread doesn't need special-casing.
  private existingImageRefs: Partial<Registration> = {};

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
    attendanceDay: this.fb.control(''),
    marriedAndYourSpousebookInConference: this.fb.control(''),
    wifeName: this.fb.control(''),
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
      });

    this.form.get('transportationType')!.valueChanges.subscribe(() => this.updateCarFieldValidators());

    this.form
      .get('hasFriendsForAccommodation')!
      .valueChanges.subscribe(() => this.updateRoomFieldValidators());

    this.form
      .get('marriedAndYourSpousebookInConference')!
      .valueChanges.subscribe(() => this.updateMarriedSectionValidators());

    this.form.get('hasWhatsApp')!.valueChanges.subscribe(() => this.updateWhatsAppValidators());

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

  get showTransportationTypeField(): boolean {
    const value = this.form.get('attendanceDays')!.value;
    return value === 'الجمعة والسبت بدون مواصلات' || value === 'يوم واحد بدون مواصلات';
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
      delete this.existingImageRefs.CarLicense;
    }
    this.setCarFieldValidators(this.showCarFields);
  }

  /** Loads الخادم options from /assets/config.json. New options added there appear automatically - no code change needed. */
  loadServantOptions(): void {
    this.isLoadingServantOptions.set(true);
    this.servantOptionsError.set(null);
    this.configService
      .getConfig()
      .pipe(finalize(() => this.isLoadingServantOptions.set(false)))
      .subscribe({
        next: (config) => this.servantOptions.set(config.servantOptions ?? []),
        error: () => this.servantOptionsError.set('تعذر تحميل قائمة الخدام، برجاء إعادة المحاولة')
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
   * Re-evaluates which sub-section - WifeName vs the accommodation section -
   * should be shown/required based on the married question's current value,
   * clearing whichever one is now hidden so a stale value is never
   * submitted. Also resyncs RoomId via updateRoomFieldValidators(), since
   * showRoomDropdown now depends on showAccommodationSection too.
   */
  private updateMarriedSectionValidators(): void {
    const showWife = this.showWifeNameField;
    const showAccommodation = this.showAccommodationSection;

    if (!showWife) {
      this.form.get('wifeName')!.setValue('', { emitEvent: false });
    }
    if (!showAccommodation) {
      this.form.get('hasFriendsForAccommodation')!.setValue('', { emitEvent: false });
    }

    this.setWifeNameValidators(showWife);
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
        error: () => {
          this.roomsError.set('تعذر تحميل قائمة الغرف، برجاء إعادة المحاولة');
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
      carNo: { required: 'رقم السيارة مطلوب', blank: 'رقم السيارة مطلوب' },
      carLicense: {
        required: 'صورة الرخصة مطلوبة',
        invalidImageType: 'صيغة الصورة غير مدعومة (JPG, PNG, WEBP فقط)',
        imageTooLarge: 'حجم الصورة أكبر من 10 ميجابايت'
      },
      servantName: { required: 'الخادم مطلوب' },
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

  /** Handles file-input change events for the three image controls. */
  onFileSelected(event: Event, field: ImageFieldKey): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      return;
    }
    this.form.get(field)!.setValue(file);
    this.form.get(field)!.markAsTouched();

    const reader = new FileReader();
    reader.onload = () => {
      this.previews[field] = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  removeImage(field: ImageFieldKey): void {
    this.form.get(field)!.setValue(null);
    this.form.get(field)!.markAsTouched();
    this.previews[field] = null;
    if (field === 'frontIdImage') {
      delete this.existingImageRefs.FrontIdFileId;
      delete this.existingImageRefs.FrontIdFileUrl;
    } else if (field === 'backIdImage') {
      delete this.existingImageRefs.BackIdFileId;
      delete this.existingImageRefs.BackIdFileUrl;
    } else if (field === 'personalPhoto') {
      delete this.existingImageRefs.PersonalPhotoFileId;
      delete this.existingImageRefs.PersonalPhotoFileUrl;
    } else {
      delete this.existingImageRefs.CarLicense;
    }
  }

  async submit(): Promise<void> {
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

    this.isSubmitting.set(true);
    try {
      const payload = await this.buildPayload();

      this.api
        .createRegistration(payload)
        .pipe(finalize(() => this.isSubmitting.set(false)))
        .subscribe({
          next: (response) => {
            if (response.success && response.data?.Id) {
              // New registration created - hand off to the dedicated success
              // page with the backend-generated Id (never a client-made one).
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
          error: () => {
            this.alert.set({ type: 'error', message: 'تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى' });
          }
        });
    } catch {
      this.isSubmitting.set(false);
      this.alert.set({ type: 'error', message: 'تعذرت معالجة الصور المرفقة' });
    }
  }

  private async buildPayload(): Promise<RegistrationSubmitPayload> {
    const raw = this.form.getRawValue();
    const fullName = [raw.firstName, raw.secondName, raw.thirdName, raw.fourthName].join(' ').trim();
    const isTransportationVisible =
      raw.attendanceDays === 'الجمعة والسبت بدون مواصلات' || raw.attendanceDays === 'يوم واحد بدون مواصلات';
    const isCarScenario = raw.attendanceDays === 'يوم واحد بدون مواصلات' && raw.transportationType === 'Private Car';

    const payload: RegistrationSubmitPayload = {
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
      CarNo: isCarScenario ? (raw.carNo ?? '').trim() : '',
      ServantName: raw.servantName!,
      Notes: raw.notes ?? '',
      NationalId: raw.nationalId!,
      HasFriendsForAccommodation:
        raw.marriedAndYourSpousebookInConference === 'لا' ? raw.hasFriendsForAccommodation ?? '' : '',
      RoomId:
        raw.marriedAndYourSpousebookInConference === 'لا' && raw.hasFriendsForAccommodation === 'نعم'
          ? raw.roomId ?? null
          : null,
      ...this.existingImageRefs
    };

    if (raw.frontIdImage instanceof File) {
      payload.FrontIdImage = await fileToUploadPayload(raw.frontIdImage);
    }
    if (raw.backIdImage instanceof File) {
      payload.BackIdImage = await fileToUploadPayload(raw.backIdImage);
    }
    if (raw.personalPhoto instanceof File) {
      payload.PersonalPhotoImage = await fileToUploadPayload(raw.personalPhoto);
    }
    if (isCarScenario && raw.carLicense instanceof File) {
      payload.CarLicenseImage = await fileToUploadPayload(raw.carLicense);
    }

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
      carNo: '',
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
    this.existingImageRefs = {};
    this.loadRooms(); // Refresh room availability for the next new registration.
  }

  dismissAlert(): void {
    this.alert.set(null);
  }
}
