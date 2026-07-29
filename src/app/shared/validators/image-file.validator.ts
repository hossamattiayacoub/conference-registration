import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates a File (or an already-uploaded URL string kept during edit) held
 * in a reactive form control: correct type and size when a new File is present.
 */
export function imageFileValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value) {
      return null; // required validator handles the empty case
    }
    if (!(value instanceof File)) {
      return null; // existing stored image URL during edit - already valid
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(value.type)) {
      return { invalidImageType: true };
    }
    if (value.size > MAX_IMAGE_SIZE_BYTES) {
      return { imageTooLarge: true };
    }
    return null;
  };
}
