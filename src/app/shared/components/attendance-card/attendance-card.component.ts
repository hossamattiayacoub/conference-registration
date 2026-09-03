import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type AttendanceCardTheme = 'green' | 'blue' | 'orange';
export type AttendanceCardIcon = 'bus' | 'no-bus' | 'calendar';

/**
 * A single selectable attendance-mode card on /attendance-selection.
 * Purely presentational - it knows nothing about attendance-days values or
 * navigation; the parent passes display data in and listens for `select`.
 */
@Component({
  selector: 'app-attendance-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './attendance-card.component.html',
  styleUrl: './attendance-card.component.scss'
})
export class AttendanceCardComponent {
  @Input() number = '';
  @Input() titleLine1 = '';
  @Input() titleLine2 = '';
  @Input() theme: AttendanceCardTheme = 'green';
  @Input() icon: AttendanceCardIcon = 'bus';
  @Input() selected = false;
  @Input() ariaLabel = '';

  @Output() select = new EventEmitter<void>();

  onActivate(): void {
    this.select.emit();
  }
}
