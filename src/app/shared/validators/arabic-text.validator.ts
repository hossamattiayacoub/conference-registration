import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validates that a value contains only Arabic letters, spaces and common
 * Arabic diacritics/hamza forms - suitable for name fields.
 */
export function arabicTextValidator(): ValidatorFn {
  const pattern = /^[\u0600-\u06FF\s]+$/;
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString().trim();
    if (!value) {
      return null; // required validator handles empty values
    }
    return pattern.test(value) ? null : { invalidArabicText: true };
  };
}
