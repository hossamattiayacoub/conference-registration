import { Routes } from '@angular/router';
import { RegistrationComponent } from './features/registration/registration.component';
import { RegistrationSuccessComponent } from './features/registration-success/registration-success.component';
import { AttendanceScannerComponent } from './features/attendance-scanner/attendance-scanner.component';
import { AttendanceSelectionComponent } from './features/attendance-selection/attendance-selection.component';
import { attendanceSelectedGuard } from './attendance-selected.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'attendance-selection', pathMatch: 'full' },
  { path: 'attendance-selection', component: AttendanceSelectionComponent },
  { path: 'registration', component: RegistrationComponent, canActivate: [attendanceSelectedGuard] },
  { path: 'registration-success', component: RegistrationSuccessComponent },
  { path: 'attendance-scanner', component: AttendanceScannerComponent },
  { path: '**', redirectTo: '' }
];
