import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { RegistrationApiService } from '../../core/services/registration-api.service';
import {
  ATTENDANCE_DAYS_OPTIONS,
  CONFERENCE_BOOKING_OPTIONS,
  GENDER_OPTIONS,
  PAYMENT_AMOUNT_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  Registration,
  RegistrationSubmitPayload,
  SERVANT_OPTIONS
} from '../../core/models/registration.model';
import { arabicTextValidator } from '../../shared/validators/arabic-text.validator';
import { egyptianMobileValidator } from '../../shared/validators/egyptian-mobile.validator';
import { nationalIdValidator } from '../../shared/validators/national-id.validator';
import { imageFileValidator } from '../../shared/validators/image-file.validator';
import { fileToUploadPayload } from '../../shared/utils/file-to-base64.util';

type ImageFieldKey = 'frontIdImage' | 'backIdImage' | 'personalPhoto';

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
  readonly conferenceBookingOptions = CONFERENCE_BOOKING_OPTIONS;
  readonly paymentMethodOptions = PAYMENT_METHOD_OPTIONS;
  readonly paymentAmountOptions = PAYMENT_AMOUNT_OPTIONS;
  readonly servantOptions = SERVANT_OPTIONS;

  readonly isSubmitting = signal(false);
  readonly isSearching = signal(false);
  readonly isLoadingRecord = signal(false);
  readonly alert = signal<AlertState | null>(null);
  readonly duplicateId = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);

  readonly previews: Record<ImageFieldKey, string | null> = {
    frontIdImage: null,
    backIdImage: null,
    personalPhoto: null
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

    conferenceBooking: this.fb.control('', [Validators.required]),
    paymentMethod: this.fb.control(''),
    paymentAmount: this.fb.control<number | null>(null),

    servantName: this.fb.control('', [Validators.required]),

    frontIdImage: this.fb.control<File | string | null>(null, [Validators.required, imageFileValidator()]),
    backIdImage: this.fb.control<File | string | null>(null, [Validators.required, imageFileValidator()]),
    personalPhoto: this.fb.control<File | string | null>(null, [Validators.required, imageFileValidator()]),

    notes: this.fb.control(''),
    nationalId: this.fb.control('', [Validators.required, nationalIdValidator()])
  });

  constructor() {
    this.form
      .get('conferenceBooking')!
      .valueChanges.subscribe((value) => this.updatePaymentValidators(value));
  }

  /** Toggles PaymentMethod/PaymentAmount as required only when booking is "نعم". */
  private updatePaymentValidators(conferenceBooking: string | null): void {
    const paymentMethod = this.form.get('paymentMethod')!;
    const paymentAmount = this.form.get('paymentAmount')!;

    if (conferenceBooking === 'نعم') {
      paymentMethod.setValidators([Validators.required]);
      paymentAmount.setValidators([Validators.required]);
    } else {
      paymentMethod.setValidators([]);
      paymentAmount.setValidators([]);
      paymentMethod.setValue('');
      paymentAmount.setValue(null);
    }
    paymentMethod.updateValueAndValidity({ emitEvent: false });
    paymentAmount.updateValueAndValidity({ emitEvent: false });
  }

  get showPaymentFields(): boolean {
    return this.form.get('conferenceBooking')!.value === 'نعم';
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
      conferenceBooking: { required: 'يرجى تحديد حجز المؤتمر' },
      paymentMethod: { required: 'طريقة الدفع مطلوبة' },
      paymentAmount: { required: 'مبلغ الدفع مطلوب' },
      servantName: { required: 'الخادم مطلوب' },
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
    } else {
      delete this.existingImageRefs.PersonalPhotoFileId;
      delete this.existingImageRefs.PersonalPhotoFileUrl;
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
      PersonalPhotoFileUrl: registration.PersonalPhotoFileUrl
    };

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
      conferenceBooking: registration.ConferenceBooking,
      paymentMethod: registration.PaymentMethod ?? '',
      paymentAmount: registration.PaymentAmount ?? null,
      servantName: registration.ServantName,
      frontIdImage: registration.FrontIdFileUrl ?? null,
      backIdImage: registration.BackIdFileUrl ?? null,
      personalPhoto: registration.PersonalPhotoFileUrl ?? null,
      notes: registration.Notes ?? '',
      nationalId: registration.NationalId
    });

    this.previews.frontIdImage = registration.FrontIdFileUrl ?? null;
    this.previews.backIdImage = registration.BackIdFileUrl ?? null;
    this.previews.personalPhoto = registration.PersonalPhotoFileUrl ?? null;
  }

  async submit(): Promise<void> {
    this.alert.set(null);
    this.duplicateId.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.alert.set({ type: 'error', message: 'يرجى مراجعة الحقول المطلوبة وتصحيح الأخطاء' });
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
      ConferenceBooking: raw.conferenceBooking!,
      PaymentMethod: raw.paymentMethod ?? '',
      PaymentAmount: raw.paymentAmount ?? null,
      ServantName: raw.servantName!,
      Notes: raw.notes ?? '',
      NationalId: raw.nationalId!,
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
      conferenceBooking: '',
      paymentMethod: '',
      paymentAmount: null,
      servantName: '',
      frontIdImage: null,
      backIdImage: null,
      personalPhoto: null,
      notes: '',
      nationalId: ''
    });
    this.previews.frontIdImage = null;
    this.previews.backIdImage = null;
    this.previews.personalPhoto = null;
    this.existingImageRefs = {};
    this.editingId.set(null);
    this.duplicateId.set(null);
  }

  dismissAlert(): void {
    this.alert.set(null);
  }
}
