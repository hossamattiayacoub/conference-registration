import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { QrRegistrant } from '../../core/models/qr-broadcast.model';
import { AdminQrService } from '../../core/services/admin-qr.service';
import { AdminLoginComponent } from '../../shared/components/admin-login/admin-login.component';

type RowState = 'idle' | 'sending';
type Filter = 'all' | 'pending' | 'sent' | 'failed';

/**
 * Admin page (/send-qr): reads the registrants from the Registeration sheet
 * (via Apps Script, behind an admin passcode), generates each person's QR in
 * the browser - the exact same payload as the success page (the registration
 * Id) - and has Apps Script deliver it through the WhatsApp Cloud API.
 *
 * The passcode lives only in this component's memory: it is never written to
 * storage or the URL, and every request is re-checked server-side.
 */
@Component({
  selector: 'app-send-qr',
  standalone: true,
  imports: [CommonModule, RouterLink, AdminLoginComponent],
  templateUrl: './send-qr.component.html',
  styleUrl: './send-qr.component.scss'
})
export class SendQrComponent {
  private readonly admin = inject(AdminQrService);

  readonly registrants = this.admin.registrants;
  readonly missingConfig = this.admin.missingConfig;
  readonly loaded = this.admin.isAuthenticated;
  readonly loading = this.admin.isLoading;
  readonly loginError = signal<string | null>(null);
  readonly filter = signal<Filter>('all');

  /** id -> transient UI state / last error for that row. */
  readonly rowState = signal<Record<string, RowState>>({});
  readonly rowError = signal<Record<string, string>>({});

  readonly bulkRunning = signal(false);
  readonly bulkProgress = signal<{ done: number; total: number; failed: number } | null>(null);
  private stopRequested = false;

  readonly counts = computed(() => {
    const list = this.registrants();
    const sent = list.filter((r) => this.isSent(r)).length;
    const noNumber = list.filter((r) => !r.recipient).length;
    const failed = list.filter((r) => this.isFailed(r)).length;
    return { total: list.length, sent, failed, noNumber, pending: list.length - sent };
  });

  readonly visibleRegistrants = computed(() => {
    const filter = this.filter();
    const list = this.registrants();
    if (filter === 'sent') return list.filter((r) => this.isSent(r));
    if (filter === 'failed') return list.filter((r) => this.isFailed(r));
    if (filter === 'pending') return list.filter((r) => !this.isSent(r));
    return list;
  });

  isSent(r: QrRegistrant): boolean {
    return !!r.qrSentAt;
  }

  isFailed(r: QrRegistrant): boolean {
    return !r.qrSentAt && r.qrSendStatus.startsWith('FAILED');
  }

  maskedNumber(r: QrRegistrant): string {
    // Show the recipient so the admin can verify, e.g. +20 101 234 5678
    return r.recipient ? '+' + r.recipient : '—';
  }

  async login(passcode: string): Promise<void> {
    if (!passcode.trim() || this.loading()) {
      return;
    }
    this.loginError.set(null);
    this.loginError.set(await this.admin.login(passcode));
  }

  async reload(): Promise<void> {
    await this.admin.reload();
  }

  logout(): void {
    this.admin.logout();
    this.rowError.set({});
    this.rowState.set({});
    this.bulkProgress.set(null);
  }

  /** Sends (or re-sends, when `force`) a single registrant. Returns true on success. */
  async sendOne(registrant: QrRegistrant, force = false): Promise<boolean> {
    if (this.rowState()[registrant.id] === 'sending') {
      return false;
    }
    this.setRowState(registrant.id, 'sending');
    this.setRowError(registrant.id, null);
    const result = await this.admin.send(registrant, force);
    this.setRowState(registrant.id, 'idle');
    if (!result.ok) {
      this.setRowError(registrant.id, result.message);
    }
    return result.ok;
  }

  /** Sends to every registrant that was not sent yet and has a valid number, one at a time. */
  async sendAllPending(): Promise<void> {
    if (this.bulkRunning()) {
      return;
    }
    const queue = this.registrants().filter((r) => !this.isSent(r) && !!r.recipient);
    if (queue.length === 0) {
      return;
    }
    const confirmed = window.confirm(`سيتم إرسال QR إلى ${queue.length} مشارك عبر واتس اب. هل تريد المتابعة؟`);
    if (!confirmed) {
      return;
    }
    this.stopRequested = false;
    this.bulkRunning.set(true);
    this.bulkProgress.set({ done: 0, total: queue.length, failed: 0 });
    for (const registrant of queue) {
      if (this.stopRequested) {
        break;
      }
      const ok = await this.sendOne(registrant);
      const current = this.bulkProgress()!;
      this.bulkProgress.set({
        done: current.done + 1,
        total: current.total,
        failed: current.failed + (ok ? 0 : 1)
      });
    }
    this.bulkRunning.set(false);
  }

  stopBulk(): void {
    this.stopRequested = true;
  }

  async resend(registrant: QrRegistrant): Promise<void> {
    if (window.confirm(`إعادة إرسال QR إلى ${registrant.fullName}؟`)) {
      await this.sendOne(registrant, true);
    }
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
  }

  private setRowState(id: string, state: RowState): void {
    this.rowState.update((map) => ({ ...map, [id]: state }));
  }

  private setRowError(id: string, message: string | null): void {
    this.rowError.update((map) => {
      const next = { ...map };
      if (message) {
        next[id] = message;
      } else {
        delete next[id];
      }
      return next;
    });
  }
}
