import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ATTENDANCE_DAYS_OPTIONS } from '../../core/models/registration.model';
import { AttendanceSelectionService } from '../../core/services/attendance-selection.service';
import {
  AttendanceCardComponent,
  AttendanceCardIcon,
  AttendanceCardTheme
} from '../../shared/components/attendance-card/attendance-card.component';

interface AttendanceCardConfig {
  /** Must equal one of ATTENDANCE_DAYS_OPTIONS exactly - this is the only value ever sent onward, nothing about it is re-derived from display text. */
  value: string;
  number: string;
  titleLine1: string;
  titleLine2: string;
  theme: AttendanceCardTheme;
  icon: AttendanceCardIcon;
  ariaLabel: string;
}

/**
 * /attendance-selection - the new entry point of the app. Lets the person
 * pick how they'll attend the conference *before* opening the registration
 * form. Card values are read straight from ATTENDANCE_DAYS_OPTIONS - the
 * exact same constant/values the old أيام الحضور radio buttons used - so
 * this remains the single source of truth for those three option strings;
 * nothing here duplicates the Registration page's conditional business
 * rules, it only decides *which* of the three values gets set before that
 * page loads. Display metadata (icon/theme/number/title split) is presentation
 * only and never affects the value stored/submitted.
 */
@Component({
  selector: 'app-attendance-selection',
  standalone: true,
  imports: [CommonModule, AttendanceCardComponent],
  templateUrl: './attendance-selection.component.html',
  styleUrl: './attendance-selection.component.scss'
})
export class AttendanceSelectionComponent {
  private readonly router = inject(Router);
  private readonly attendanceSelection = inject(AttendanceSelectionService);

  readonly selected = this.attendanceSelection.selected;
  readonly posterLoadFailed = signal(false);

  readonly cards: AttendanceCardConfig[] = [
    {
      value: ATTENDANCE_DAYS_OPTIONS[0], // 'الجمعة والسبت بالمواصلات'
      number: '01',
      titleLine1: 'الجمعة والسبت',
      titleLine2: 'بالمواصلات',
      theme: 'green',
      icon: 'bus',
      ariaLabel: 'اختر: الجمعة والسبت بالمواصلات'
    },
    {
      value: ATTENDANCE_DAYS_OPTIONS[1], // 'الجمعة والسبت بدون مواصلات'
      number: '02',
      titleLine1: 'الجمعة والسبت',
      titleLine2: 'بدون مواصلات',
      theme: 'blue',
      icon: 'no-bus',
      ariaLabel: 'اختر: الجمعة والسبت بدون مواصلات'
    },
    {
      value: ATTENDANCE_DAYS_OPTIONS[2], // 'يوم واحد بدون مواصلات'
      number: '03',
      titleLine1: 'يوم واحد',
      titleLine2: 'بدون مواصلات',
      theme: 'orange',
      icon: 'calendar',
      ariaLabel: 'اختر: يوم واحد بدون مواصلات'
    }
  ];

  onPosterError(): void {
    this.posterLoadFailed.set(true);
  }

  selectOption(option: string): void {
    this.attendanceSelection.select(option);
    this.router.navigate(['/registration']);
  }
}

