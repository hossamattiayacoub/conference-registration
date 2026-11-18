import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Passcode form shared by the admin QR pages (/send-qr, /share-qr). */
@Component({
  selector: 'app-admin-login',
  standalone: true,
  template: `
    <form class="login" (submit)="$event.preventDefault(); submitted.emit(pass.value)">
      <label class="login__label" for="admin-pass">كلمة مرور المشرف</label>
      <input #pass id="admin-pass" class="login__input" type="password" autocomplete="off" [disabled]="loading">
      @if (error) {
        <p class="login__error" role="alert">{{ error }}</p>
      }
      <button type="submit" class="login__btn" [disabled]="loading">{{ loading ? 'جاري التحميل...' : 'دخول' }}</button>
    </form>
  `,
  styles: [`
    .login { display: flex; flex-direction: column; gap: 10px; }
    .login__label { font-weight: 700; color: var(--color-text); font-size: 14px; }
    .login__input {
      padding: 12px 14px; font-size: 16px; font-family: inherit;
      border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    }
    .login__input:focus { outline: 2px solid var(--color-primary); outline-offset: 1px; }
    .login__error { margin: 0; color: var(--color-error); font-size: 13.5px; }
    .login__btn {
      border: none; cursor: pointer; font-family: inherit; font-weight: 700; font-size: 15.5px;
      padding: 13px 30px; border-radius: var(--radius-round); background: var(--color-primary); color: #fff;
    }
    .login__btn:hover:not(:disabled) { background: var(--color-primary-dark); }
    .login__btn:disabled { opacity: 0.55; cursor: not-allowed; }
  `]
})
export class AdminLoginComponent {
  @Input() loading = false;
  @Input() error: string | null = null;
  @Output() submitted = new EventEmitter<string>();
}
