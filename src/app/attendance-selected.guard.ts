import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AttendanceSelectionService } from './core/services/attendance-selection.service';

/**
 * Guards /registration: the form always needs an attendance-days value
 * before it can render its conditional fields correctly, and that value
 * now only ever comes from /attendance-selection - never assume a default.
 */
export const attendanceSelectedGuard: CanActivateFn = () => {
  const attendanceSelection = inject(AttendanceSelectionService);
  const router = inject(Router);

  if (attendanceSelection.selected()) {
    return true;
  }

  return router.createUrlTree(['/attendance-selection']);
};
