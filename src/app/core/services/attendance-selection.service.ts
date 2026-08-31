import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'profile7.selectedAttendanceDays';

/**
 * Holds the attendance-days option chosen on /attendance-selection so the
 * Registration page can consume it without re-asking the user. Backed by
 * sessionStorage (not just an in-memory field) so the selection survives a
 * page refresh or the user navigating back/forward, but is naturally
 * cleared when the browser tab closes.
 */
@Injectable({ providedIn: 'root' })
export class AttendanceSelectionService {
  readonly selected = signal<string | null>(this.readFromStorage());

  /** Stores the chosen attendance-days option, replacing any previous selection. */
  select(value: string): void {
    this.writeToStorage(value);
    this.selected.set(value);
  }

  /** Clears the stored selection - called after a successful registration so the next one starts fresh. */
  clear(): void {
    this.writeToStorage(null);
    this.selected.set(null);
  }

  private readFromStorage(): string | null {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private writeToStorage(value: string | null): void {
    try {
      if (value) {
        sessionStorage.setItem(STORAGE_KEY, value);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore - e.g. storage disabled in a private-browsing context. The
      // in-memory signal still works for the current page lifecycle.
    }
  }
}
