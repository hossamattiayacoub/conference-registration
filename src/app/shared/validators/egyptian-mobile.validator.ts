import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validates Egyptian mobile numbers: 11 digits starting with
 * 010, 011, 012 or 015.
 */
export function egyptianMobileValidator(): ValidatorFn {
  const pattern = /^01[0125][0-9]{8}$/;
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString().trim();
    if (!value) {
      return null; // required validator handles empty values
    }
    return pattern.test(value) ? null : { invalidMobile: true };
  };
}
