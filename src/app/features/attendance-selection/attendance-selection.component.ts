import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ATTENDANCE_DAYS_OPTIONS } from '../../core/models/registration.model';
import { AttendanceSelectionService } from '../../core/services/attendance-selection.service';

/**
 * /attendance-selection - the new entry point of the app. Lets the person
 * pick how they'll attend the conference *before* opening the registration
 * form. The three cards reuse ATTENDANCE_DAYS_OPTIONS - the exact same
 * constant/values the old أيام الحضور radio buttons used - so this remains
 * the single source of truth for those three option strings; nothing here
 * duplicates the Registration page's conditional business rules, it only
 * decides *which* of the three values gets set before that page loads.
 */
@Component({
  selector: 'app-attendance-selection',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './attendance-selection.component.html',
  styleUrl: './attendance-selection.component.scss'
})
export class AttendanceSelectionComponent {
  private readonly router = inject(Router);
  private readonly attendanceSelection = inject(AttendanceSelectionService);

  readonly options = ATTENDANCE_DAYS_OPTIONS;
  readonly selected = this.attendanceSelection.selected;
  readonly posterLoadFailed = signal(false);

  onPosterError(): void {
    this.posterLoadFailed.set(true);
  }

  selectOption(option: string): void {
    this.attendanceSelection.select(option);
    this.router.navigate(['/registration']);
  }
}
