import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import * as QRCode from 'qrcode';

/**
 * Shown after a registration is successfully created (see
 * RegistrationComponent.submit()). The registration Id is passed via Angular
 * Router state - never the URL - so no personal data or identifiers ever
 * appear in the address bar. The QR code encodes ONLY that Id as plain text.
 */
@Component({
  selector: 'app-registration-success',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './registration-success.component.html',
  styleUrl: './registration-success.component.scss'
})
export class RegistrationSuccessComponent {
  readonly registrationId = signal<string | null>(null);
  readonly qrCodeDataUrl = signal<string | null>(null);
  readonly qrCodeError = signal<string | null>(null);

  constructor(private readonly router: Router) {
    // getCurrentNavigation() is only populated while the navigation that
    // created this component is still in flight - which is exactly the case
    // here, since this component is instantiated as a direct result of the
    // router.navigate(...) call in RegistrationComponent.submit().
    const navigationState = this.router.getCurrentNavigation()?.extras.state as
      | { registrationId?: string }
      | undefined;
    const id = navigationState?.registrationId ?? null;

    this.registrationId.set(id);
    if (id) {
      this.generateQrCode(id);
    }
  }

  private generateQrCode(id: string): void {
    // The QR payload is the bare registration Id as plain text - nothing
    // else (no name, phone, room, or any other personal/registration data).
    QRCode.toDataURL(id, { width: 260, margin: 2 })
      .then((dataUrl) => this.qrCodeDataUrl.set(dataUrl))
      .catch(() => this.qrCodeError.set('تعذر إنشاء رمز QR'));
  }
}
