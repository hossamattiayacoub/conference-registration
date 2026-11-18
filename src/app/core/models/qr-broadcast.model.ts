/** One registrant as returned by the admin "adminListRegistrations" action. */
export interface QrRegistrant {
  id: string;
  serialNo: number | null;
  fullName: string;
  /** International digits (e.g. 201012345678) or '' when no valid number. */
  recipient: string;
  /** Which sheet column the number came from. */
  recipientSource: 'Mobile' | 'WhatsAppNumber';
  qrSentAt: string;
  qrSendStatus: string;
}

export interface QrRegistrantsResult {
  /** Script Properties that are still missing (names only, never values). */
  missingConfig: string[];
  registrants: QrRegistrant[];
}

export interface SendQrResult {
  id: string;
  qrSentAt?: string;
  qrSendStatus?: string;
  alreadySent?: boolean;
}
