import * as QRCode from 'qrcode';

/**
 * Single source of truth for QR generation. The payload is ALWAYS the bare
 * registration Id as plain text - nothing else (no name, phone or other
 * personal data). Used by the success page, /send-qr and /share-qr so every
 * QR in the app is identical for a given Id.
 */
export function createQrDataUrl(registrationId: string, width = 260): Promise<string> {
  return QRCode.toDataURL(registrationId, { width, margin: 2 });
}

/** Strips the "data:image/png;base64," prefix. */
export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.substring(dataUrl.indexOf(',') + 1);
}
