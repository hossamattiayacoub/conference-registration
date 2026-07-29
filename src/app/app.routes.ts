import { Routes } from '@angular/router';
import { RegistrationComponent } from './features/registration/registration.component';

export const routes: Routes = [
  { path: '', component: RegistrationComponent },
  { path: '**', redirectTo: '' }
];
