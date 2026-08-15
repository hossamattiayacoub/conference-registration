import { Routes } from '@angular/router';
import { RegistrationComponent } from './features/registration/registration.component';
import { RegistrationSuccessComponent } from './features/registration-success/registration-success.component';

export const routes: Routes = [
  { path: '', component: RegistrationComponent },
  { path: 'registration-success', component: RegistrationSuccessComponent },
  { path: '**', redirectTo: '' }
];
