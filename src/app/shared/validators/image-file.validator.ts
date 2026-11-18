import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isSupportedImageFile } from '../utils/image-format.util';

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates a File (or an already-uploaded URL string kept during edit) held
 * in a reactive form control: correct type and size when a new File is present.
 *
 * In practice, the component now rejects an unsupported file the moment it's
 * selected (see registration.component.ts: onFileSelected), before it ever
 * reaches this control - so this validator is a defense-in-depth backstop,
 * not the primary gate.
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
    if (!isSupportedImageFile(value)) {
      return { invalidImageType: true };
    }
    if (value.size > MAX_IMAGE_SIZE_BYTES) {
      return { imageTooLarge: true };
    }
    return null;
  };
}
