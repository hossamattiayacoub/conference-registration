import { Routes } from '@angular/router';
import { RegistrationComponent } from './features/registration/registration.component';
import { RegistrationSuccessComponent } from './features/registration-success/registration-success.component';
import { AttendanceScannerComponent } from './features/attendance-scanner/attendance-scanner.component';

export const routes: Routes = [
  { path: '', component: RegistrationComponent },
  { path: 'registration-success', component: RegistrationSuccessComponent },
  { path: 'attendance-scanner', component: AttendanceScannerComponent },
  { path: '**', redirectTo: '' }
];
