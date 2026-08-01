import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Rejects a value that is entirely whitespace. Pair with Validators.required
 * to also reject a fully empty value - required alone would let a
 * space-only string through since it is technically non-empty.
 */
export function notBlankValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (typeof value !== 'string' || value.length === 0) {
      return null; // Validators.required handles the empty case
    }
    return value.trim().length === 0 ? { blank: true } : null;
  };
}
