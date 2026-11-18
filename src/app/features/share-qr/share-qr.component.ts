import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QrRegistrant } from '../../core/models/qr-broadcast.model';
import { AdminQrService } from '../../core/services/admin-qr.service';
import { AdminLoginComponent } from '../../shared/components/admin-login/admin-login.component';
import { normalizeSearchText } from '../../shared/utils/search-text.util';

interface RowFeedback {
  kind: 'success' | 'error';
  message: string;
}

/**
 * /share-qr - a simple Name | Phone | Share grid fed from the Registeration
 * sheet. Search by name (partial, case/diacritic-insensitive) or by ID. The
 * Share button generates the QR from the person's ID (same util as the
 * registration success page) and sends it as an IMAGE through the existing
 * WhatsApp Cloud API integration (see WhatsApp.gs). Behind the admin passcode,
 * shared with /send-qr via AdminQrService.
 */
@Component({
  selector: 'app-share-qr',
  standalone: true,
  imports: [CommonModule, RouterLink, AdminLoginComponent],
  templateUrl: './share-qr.component.html',
  styleUrl: './share-qr.component.scss'
})
export class ShareQrComponent {
  private readonly admin = inject(AdminQrService);

  readonly registrants = this.admin.registrants;
  readonly missingConfig = this.admin.missingConfig;
  readonly isAuthenticated = this.admin.isAuthenticated;
  readonly isLoading = this.admin.isLoading;

  readonly loginError = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly query = signal('');
  readonly sendingId = signal<string | null>(null);
  readonly feedback = signal<Record<string, RowFeedback>>({});

  readonly results = computed(() => {
    const list = this.registrants();
    const q = normalizeSearchText(this.query());
    if (!q) {
      return list;
    }
    return list.filter((r) => normalizeSearchText(r.fullName).includes(q) || r.id.toLowerCase().includes(q));
  });

  trackById(_: number, r: QrRegistrant): string {
    return r.id;
  }

  async login(passcode: string): Promise<void> {
    if (!passcode.trim() || this.isLoading()) {
      return;
    }
    this.loginError.set(await this.admin.login(passcode));
  }

  async reload(): Promise<void> {
    this.loadError.set(await this.admin.reload());
  }

  logout(): void {
    this.admin.logout();
    this.feedback.set({});
    this.query.set('');
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  phoneLabel(r: QrRegistrant): string {
    return r.recipient ? '+' + r.recipient : '';
  }

  isSent(r: QrRegistrant): boolean {
    return !!r.qrSentAt;
  }

  async share(r: QrRegistrant): Promise<void> {
    if (this.sendingId() !== null) {
      return;
    }
    const alreadySent = this.isSent(r);
    if (alreadySent && !window.confirm(`تم إرسال QR إلى ${r.fullName} من قبل. هل تريد إعادة الإرسال؟`)) {
      return;
    }
    this.sendingId.set(r.id);
    this.setFeedback(r.id, null);
    const result = await this.admin.send(r, alreadySent);
    this.sendingId.set(null);
    this.setFeedback(r.id, { kind: result.ok ? 'success' : 'error', message: result.message });
  }

  private setFeedback(id: string, value: RowFeedback | null): void {
    this.feedback.update((map) => {
      const next = { ...map };
      if (value) {
        next[id] = value;
      } else {
        delete next[id];
      }
      return next;
    });
  }
}
