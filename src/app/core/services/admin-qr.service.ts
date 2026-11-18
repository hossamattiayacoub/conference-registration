import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QrRegistrant } from '../models/qr-broadcast.model';
import { createQrDataUrl, dataUrlToBase64 } from '../../shared/utils/qr-code.util';
import { toUserFacingApiErrorMessage } from '../../shared/utils/api-error.util';
import { RegistrationApiService } from './registration-api.service';

/**
 * Shared admin session for the QR pages (/send-qr, /share-qr): loads the
 * registrants from the sheet (via Apps Script) and sends a person's QR through
 * the existing WhatsApp Cloud API integration. The passcode is kept in memory
 * only - never in storage or the URL - and is re-checked server-side on every
 * call. Logging in on one page therefore carries over to the other.
 */
@Injectable({ providedIn: 'root' })
export class AdminQrService {
  readonly registrants = signal<QrRegistrant[]>([]);
  readonly missingConfig = signal<string[]>([]);
  readonly isAuthenticated = signal(false);
  readonly isLoading = signal(false);

  private passcode = '';

  constructor(private readonly api: RegistrationApiService) {}

  /** Returns null on success, otherwise a user-facing Arabic error. */
  async login(passcode: string): Promise<string | null> {
    this.passcode = passcode;
    const error = await this.load();
    if (error) {
      this.passcode = '';
      return error;
    }
    this.isAuthenticated.set(true);
    return null;
  }

  async reload(): Promise<string | null> {
    return this.load();
  }

  logout(): void {
    this.passcode = '';
    this.registrants.set([]);
    this.missingConfig.set([]);
    this.isAuthenticated.set(false);
  }

  /**
   * Generates the QR from the person's Id and has the backend send it as an
   * image through WhatsApp. Returns { ok, message } - never throws.
   */
  async send(registrant: QrRegistrant, force = false): Promise<{ ok: boolean; message: string }> {
    if (!registrant.id) {
      return { ok: false, message: 'لا يوجد رقم تسجيل (ID) لهذا المشارك' };
    }
    if (!registrant.recipient) {
      return { ok: false, message: 'لا يوجد رقم واتس اب صالح' };
    }
    try {
      const base64 = dataUrlToBase64(await createQrDataUrl(registrant.id, 512));
      const response = await firstValueFrom(this.api.adminSendQr(this.passcode, registrant.id, base64, force));
      if (response.success && response.data) {
        this.patch(registrant.id, {
          qrSentAt: response.data.qrSentAt ?? new Date().toISOString(),
          qrSendStatus: response.data.qrSendStatus ?? 'SENT'
        });
        return { ok: true, message: 'تم إرسال QR بنجاح' };
      }
      if (response.data?.alreadySent) {
        this.patch(registrant.id, { qrSentAt: response.data.qrSentAt ?? 'sent' });
      } else if (response.data?.qrSendStatus) {
        this.patch(registrant.id, { qrSendStatus: response.data.qrSendStatus });
      }
      return { ok: false, message: response.message || 'فشل الإرسال' };
    } catch (error) {
      return { ok: false, message: toUserFacingApiErrorMessage(error) };
    }
  }

  private async load(): Promise<string | null> {
    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(this.api.adminListRegistrations(this.passcode));
      if (!response.success || !response.data) {
        return response.message || 'تعذر تحميل البيانات';
      }
      this.registrants.set(response.data.registrants);
      this.missingConfig.set(response.data.missingConfig);
      return null;
    } catch (error) {
      return toUserFacingApiErrorMessage(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private patch(id: string, patch: Partial<QrRegistrant>): void {
    this.registrants.update((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
}
