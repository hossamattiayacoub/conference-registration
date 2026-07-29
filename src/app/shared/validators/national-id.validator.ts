import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validates that the national ID is exactly 14 numeric digits.
 */
export function nationalIdValidator(): ValidatorFn {
  const pattern = /^[0-9]{14}$/;
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString().trim();
    if (!value) {
      return null; // required validator handles empty values
    }
    return pattern.test(value) ? null : { invalidNationalId: true };
  };
}
