import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { RegistrationApiService } from '../../core/services/registration-api.service';
import {
  ATTENDANCE_DAY_OPTIONS,
  ATTENDANCE_DAYS_OPTIONS,
  GENDER_OPTIONS,
  MARRIED_SPOUSE_BOOKED_OPTIONS,
  PAYMENT_AMOUNT_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  Registration,
  RegistrationSubmitPayload,
  Room,
  SERVANT_OPTIONS,
  TRANSPORTATION_TYPE_OPTIONS
} from '../../core/models/registration.model';
import { arabicTextValidator } from '../../shared/validators/arabic-text.validator';
import { egyptianMobileValidator } from '../../shared/validators/egyptian-mobile.validator';
import { nationalIdValidator } from '../../shared/validators/national-id.validator';
import { imageFileValidator } from '../../shared/validators/image-file.validator';
import { notBlankValidator } from '../../shared/validators/not-blank.validator';
import { fileToUploadPayload } from '../../shared/utils/file-to-base64.util';

type ImageFieldKey = 'frontIdImage' | 'backIdImage' | 'personalPhoto' | 'carLicense' | 'receiptTransferImage';

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

  readonly genderOptions = GENDER_OPTIONS;
  readonly attendanceDaysOptions = ATTENDANCE_DAYS_OPTIONS;
  readonly transportationTypeOptions = TRANSPORTATION_TYPE_OPTIONS;
  readonly attendanceDayOptions = ATTENDANCE_DAY_OPTIONS;
  readonly marriedSpouseBookedOptions = MARRIED_SPOUSE_BOOKED_OPTIONS;
  readonly paymentMethodOptions = PAYMENT_METHOD_OPTIONS;
  readonly paymentAmountOptions = PAYMENT_AMOUNT_OPTIONS;
  readonly servantOptions = SERVANT_OPTIONS;

  readonly isSubmitting = signal(false);
  readonly isSearching = signal(false);
  readonly isLoadingRecord = signal(false);
  readonly alert = signal<AlertState | null>(null);
  readonly duplicateId = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);

  // Room dropdown ("التسكين: اختار الغرفه") - loaded from the Rooms sheet
  // via the "getRooms" API action, which also computes occupancy server-side.
  readonly rooms = signal<Room[]>([]);
  readonly isLoadingRooms = signal(false);
  readonly roomsError = signal<string | null>(null);

  readonly previews: Record<ImageFieldKey, string | null> = {
    frontIdImage: null,
    backIdImage: null,
    personalPhoto: null,
    carLicense: null,
    receiptTransferImage: null
  };

  // Preserves existing Drive file id/url pairs while editing, so we don't
  // lose them when the person does not choose a replacement image.
  private existingImageRefs: Partial<Registration> = {};

  readonly form = this.fb.group({
    firstName: this.fb.control('', [Validators.required, arabicTextValidator()]),
    secondName: this.fb.control('', [Validators.required, arabicTextValidator()]),
    thirdName: this.fb.control('', [Validators.required, arabicTextValidator()]),
    fourthName: this.fb.control('', [Validators.required, arabicTextValidator()]),

    mobile: this.fb.control('', [Validators.required, egyptianMobileValidator()]),

    gender: this.fb.control('', [Validators.required]),
    job: this.fb.control(''),
    diocese: this.fb.control('', [Validators.required]),

    attendanceDays: this.fb.control('', [Validators.required]),
    transportationType: this.fb.control(''),
    attendanceDay: this.fb.control(''),
    marriedAndYourSpousebookInConference: this.fb.control(''),
    carNo: this.fb.control(''),
    carLicense: this.fb.control<File | string | null>(null),

    paymentMethod: this.fb.control('', [Validators.required]),
    paymentAmount: this.fb.control<number | null>(null, [Validators.required]),
    receiptTransferImage: this.fb.control<File | string | null>(null),

    servantName: this.fb.control('', [Validators.required]),

    frontIdImage: this.fb.control<File | string | null>(null, [Validators.required, imageFileValidator()]),
    backIdImage: this.fb.control<File | string | null>(null, [Validators.required, imageFileValidator()]),
    personalPhoto: this.fb.control<File | string | null>(null, [Validators.required, imageFileValidator()]),

    notes: this.fb.control(''),
    nationalId: this.fb.control('', [Validators.required, nationalIdValidator()]),
    roomId: this.fb.control<number | null>(null, [Validators.required])
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
      .get('paymentMethod')!
      .valueChanges.subscribe((value) => this.updateReceiptValidators(value));

    this.loadRooms();
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
   *
   * clearValues defaults to true (a fresh user selection should always wipe
   * the previous conditional answers). It is passed as false only while an
   * existing registration is being loaded into the form, right before the
   * saved values are patched in.
   */
  private updateAttendanceConditionalValidators(attendanceDays: string | null, clearValues = true): void {
    const transportationType = this.form.get('transportationType')!;
    const attendanceDay = this.form.get('attendanceDay')!;
    const married = this.form.get('marriedAndYourSpousebookInConference')!;

    if (clearValues) {
      transportationType.setValue('', { emitEvent: false });
      attendanceDay.setValue('', { emitEvent: false });
      married.setValue('', { emitEvent: false });
    }

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

  /** ReceiptTransferImage applies only when PaymentMethod is "إنستاباي". */
  get showReceiptTransferField(): boolean {
    return this.form.get('paymentMethod')!.value === 'إنستاباي';
  }

  /** Pure setter: applies (or removes) the ReceiptTransferImage validators without touching its value. */
  private setReceiptValidators(isRequired: boolean): void {
    const receipt = this.form.get('receiptTransferImage')!;
    if (isRequired) {
      receipt.setValidators([Validators.required, imageFileValidator()]);
    } else {
      receipt.clearValidators();
    }
    receipt.updateValueAndValidity({ emitEvent: false });
  }

  /** Re-evaluates showReceiptTransferField and clears ReceiptTransferImage whenever the scenario turns off. */
  private updateReceiptValidators(paymentMethod: string | null): void {
    const isRequired = paymentMethod === 'إنستاباي';
    if (!isRequired) {
      this.form.get('receiptTransferImage')!.setValue(null, { emitEvent: false });
      this.previews.receiptTransferImage = null;
      delete this.existingImageRefs.ReceiptTransferImage;
    }
    this.setReceiptValidators(isRequired);
  }

  /** Loads rooms with availability for the accommodation dropdown, excluding the registration currently being edited (if any) from occupancy. */
  loadRooms(): void {
    this.isLoadingRooms.set(true);
    this.roomsError.set(null);
    this.api
      .getRooms(this.editingId())
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
      gender: { required: 'النوع مطلوب' },
      diocese: { required: 'الأبرشية مطلوبة' },
      attendanceDays: { required: 'أيام الحضور مطلوبة' },
      transportationType: { required: 'وسيلة المواصلات مطلوبة' },
      attendanceDay: { required: 'يوم الحضور مطلوب' },
      marriedAndYourSpousebookInConference: {
        required: 'هل أنت متزوج وزوجك / زوجتك حجزت معك المؤتمر؟ مطلوب'
      },
      carNo: { required: 'رقم السيارة مطلوب', blank: 'رقم السيارة مطلوب' },
      carLicense: {
        required: 'صورة الرخصة مطلوبة',
        invalidImageType: 'صيغة الصورة غير مدعومة (JPG, PNG, WEBP فقط)',
        imageTooLarge: 'حجم الصورة أكبر من 10 ميجابايت'
      },
      paymentMethod: { required: 'طريقة الدفع مطلوبة' },
      paymentAmount: { required: 'مبلغ الدفع مطلوب' },
      receiptTransferImage: {
        required: 'يرجى رفع صورة التحويل',
        invalidImageType: 'صيغة الصورة غير مدعومة (JPG, PNG, WEBP فقط)',
        imageTooLarge: 'حجم الصورة أكبر من 10 ميجابايت'
      },
      servantName: { required: 'الخادم مطلوب' },
      roomId: { required: 'التسكين مطلوب' },
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
    } else if (field === 'carLicense') {
      delete this.existingImageRefs.CarLicense;
    } else {
      delete this.existingImageRefs.ReceiptTransferImage;
    }
  }

  /** Looks up a registration by the mobile number currently typed in. */
  searchByMobile(): void {
    const mobileControl = this.form.get('mobile')!;
    mobileControl.markAsTouched();
    if (mobileControl.invalid) {
      this.alert.set({ type: 'error', message: 'أدخل رقم موبايل صحيح أولاً' });
      return;
    }

    this.isSearching.set(true);
    this.alert.set(null);
    this.api
      .getRegistrationByMobile(mobileControl.value as string)
      .pipe(finalize(() => this.isSearching.set(false)))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.loadRegistrationIntoForm(response.data);
            this.alert.set({ type: 'info', message: 'تم العثور على تسجيل بهذا الرقم وتحميل بياناته للتعديل' });
          } else {
            this.alert.set({ type: 'info', message: 'لا يوجد تسجيل سابق بهذا الرقم، يمكنك المتابعة في التسجيل' });
          }
        },
        error: () => {
          this.alert.set({ type: 'error', message: 'تعذر الاتصال بالخادم أثناء البحث، حاول مرة أخرى' });
        }
      });
  }

  /** Loads a duplicate registration flagged by the backend on create. */
  loadDuplicateRegistration(): void {
    const id = this.duplicateId();
    if (!id) {
      return;
    }
    this.isLoadingRecord.set(true);
    this.api
      .getRegistrationById(id)
      .pipe(finalize(() => this.isLoadingRecord.set(false)))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.loadRegistrationIntoForm(response.data);
            this.duplicateId.set(null);
            this.alert.set({ type: 'info', message: 'تم تحميل التسجيل الحالي، يمكنك تعديل البيانات ثم الحفظ' });
          }
        },
        error: () => {
          this.alert.set({ type: 'error', message: 'تعذر تحميل التسجيل الحالي' });
        }
      });
  }

  private loadRegistrationIntoForm(registration: Registration): void {
    this.editingId.set(registration.Id ?? null);
    this.existingImageRefs = {
      FrontIdFileId: registration.FrontIdFileId,
      FrontIdFileUrl: registration.FrontIdFileUrl,
      BackIdFileId: registration.BackIdFileId,
      BackIdFileUrl: registration.BackIdFileUrl,
      PersonalPhotoFileId: registration.PersonalPhotoFileId,
      PersonalPhotoFileUrl: registration.PersonalPhotoFileUrl,
      CarLicense: registration.CarLicense,
      ReceiptTransferImage: registration.ReceiptTransferImage
    };

    // Apply the correct required/hidden state for the saved AttendanceDays
    // value *before* patching in the saved TransportationType/AttendanceDay
    // values, without clearing them (clearValues = false).
    this.updateAttendanceConditionalValidators(registration.AttendanceDays, false);

    const isCarRequired =
      registration.AttendanceDays === 'يوم واحد بدون مواصلات' && registration.TransportationType === 'Private Car';
    this.setCarFieldValidators(isCarRequired);

    const isReceiptRequired = registration.PaymentMethod === 'إنستاباي';
    this.setReceiptValidators(isReceiptRequired);

    this.form.patchValue({
      firstName: registration.FirstName,
      secondName: registration.SecondName,
      thirdName: registration.ThirdName,
      fourthName: registration.FourthName,
      mobile: registration.Mobile,
      gender: registration.Gender,
      job: registration.Job ?? '',
      diocese: registration.Diocese,
      attendanceDays: registration.AttendanceDays,
      transportationType: registration.TransportationType ?? '',
      attendanceDay: registration.AttendanceDay ?? '',
      marriedAndYourSpousebookInConference: registration.MarriedAndYourSpousebookInConference ?? '',
      carNo: registration.CarNo ?? '',
      carLicense: registration.CarLicense ?? null,
      paymentMethod: registration.PaymentMethod,
      paymentAmount: registration.PaymentAmount ?? null,
      receiptTransferImage: registration.ReceiptTransferImage ?? null,
      servantName: registration.ServantName,
      frontIdImage: registration.FrontIdFileUrl ?? null,
      backIdImage: registration.BackIdFileUrl ?? null,
      personalPhoto: registration.PersonalPhotoFileUrl ?? null,
      notes: registration.Notes ?? '',
      nationalId: registration.NationalId,
      roomId: registration.RoomId ?? null
    });

    // Re-load rooms now that editingId is set, so this registration's own
    // current room assignment is excluded from the occupancy count.
    this.loadRooms();

    this.previews.frontIdImage = registration.FrontIdFileUrl ?? null;
    this.previews.backIdImage = registration.BackIdFileUrl ?? null;
    this.previews.personalPhoto = registration.PersonalPhotoFileUrl ?? null;
    this.previews.carLicense = registration.CarLicense ?? null;
    this.previews.receiptTransferImage = registration.ReceiptTransferImage ?? null;
  }

  async submit(): Promise<void> {
    this.alert.set(null);
    this.duplicateId.set(null);
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
      const editingId = this.editingId();

      const request$ = editingId
        ? this.api.updateRegistration({ ...payload, Id: editingId })
        : this.api.createRegistration(payload);

      request$.pipe(finalize(() => this.isSubmitting.set(false))).subscribe({
        next: (response) => {
          if (response.success) {
            this.alert.set({
              type: 'success',
              message: editingId ? 'تم تحديث بيانات التسجيل بنجاح' : 'تم إرسال التسجيل بنجاح'
            });
            if (!editingId) {
              this.resetForm();
            }
          } else if (response.data && (response.data as unknown as { id?: string }).id) {
            this.duplicateId.set((response.data as unknown as { id: string }).id);
            this.alert.set({ type: 'error', message: 'يوجد تسجيل بالفعل باستخدام رقم الموبايل ده' });
          } else {
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
    const isReceiptScenario = raw.paymentMethod === 'إنستاباي';

    const payload: RegistrationSubmitPayload = {
      FirstName: raw.firstName!,
      SecondName: raw.secondName!,
      ThirdName: raw.thirdName!,
      FourthName: raw.fourthName!,
      FullName: fullName,
      Mobile: raw.mobile!,
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
      CarNo: isCarScenario ? (raw.carNo ?? '').trim() : '',
      PaymentMethod: raw.paymentMethod!,
      PaymentAmount: raw.paymentAmount!,
      ServantName: raw.servantName!,
      Notes: raw.notes ?? '',
      NationalId: raw.nationalId!,
      RoomId: raw.roomId ?? null,
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
    if (isReceiptScenario && raw.receiptTransferImage instanceof File) {
      payload.ReceiptTransferImageUpload = await fileToUploadPayload(raw.receiptTransferImage);
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
      gender: '',
      job: '',
      diocese: '',
      attendanceDays: '',
      transportationType: '',
      attendanceDay: '',
      marriedAndYourSpousebookInConference: '',
      carNo: '',
      carLicense: null,
      paymentMethod: '',
      paymentAmount: null,
      receiptTransferImage: null,
      servantName: '',
      frontIdImage: null,
      backIdImage: null,
      personalPhoto: null,
      notes: '',
      nationalId: '',
      roomId: null
    });
    this.previews.frontIdImage = null;
    this.previews.backIdImage = null;
    this.previews.personalPhoto = null;
    this.previews.carLicense = null;
    this.previews.receiptTransferImage = null;
    this.existingImageRefs = {};
    this.editingId.set(null);
    this.duplicateId.set(null);
    this.loadRooms(); // Refresh availability now that no registration is excluded from occupancy.
  }

  dismissAlert(): void {
    this.alert.set(null);
  }
}
