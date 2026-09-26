import { HttpErrorResponse } from '@angular/common/http';

/**
 * Maps any failure from a call to the Apps Script Web App into a safe,
 * user-facing Arabic message.
 *
 * IMPORTANT: this deliberately never reads/displays `error.url`. A failed
 * request's URL can be the real Apps Script endpoint, or - if Google's
 * redirect from `.../exec` to `script.googleusercontent.com/macros/echo?...`
 * failed partway - a temporary internal Google URL. Neither should ever
 * reach the user; only a generic, differentiated-by-status message does.
 */
export function toUserFacingApiErrorMessage(
  error: unknown,
  fallback = 'تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى'
): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  // status 0 covers network failures, DNS errors, and CORS/redirect
  // failures the browser refuses to expose details for - all indistinguishable
  // from JS, so they share one message.
  if (error.status === 0) {
    return 'تعذر الاتصال بالإنترنت، يرجى التحقق من الاتصال والمحاولة مرة أخرى';
  }
  if (error.status === 401) {
    return 'انتهت صلاحية الجلسة أو الوصول غير مصرح به، يرجى تحديث الصفحة والمحاولة مرة أخرى';
  }
  if (error.status === 403) {
    return 'تم رفض الوصول إلى الخادم، يرجى التواصل مع الدعم الفني';
  }
  if (error.status === 404) {
    // The classic symptom of a stale/incorrect Apps Script deployment URL.
    return 'تعذر الوصول إلى الخادم، يرجى المحاولة لاحقًا أو التواصل مع الدعم الفني';
  }
  if (error.status >= 500) {
    return 'حدث خطأ في الخادم، يرجى المحاولة مرة أخرى لاحقًا';
  }

  // Apps Script occasionally returns an HTML page (e.g. a Google
  // sign-in/permission page) instead of the expected JSON envelope - surface
  // that as an "unexpected response" rather than trying to parse it.
  if (typeof error.error === 'string' && !looksLikeJson(error.error)) {
    return 'استجابة غير متوقعة من الخادم، يرجى المحاولة مرة أخرى لاحقًا';
  }

  return fallback;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}
