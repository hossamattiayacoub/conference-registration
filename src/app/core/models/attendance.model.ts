/**
 * Response shape returned by the "recordAttendance" Apps Script action,
 * used by the QR attendance scanner (/attendance-scanner). Distinct from
 * ApiResponse<T> because it also carries a machine-readable `status`
 * alongside the human-readable `message`.
 */
export type AttendanceStatus =
  | 'attendance-recorded'
  | 'already-recorded'
  | 'registration-not-found'
  | 'invalid-id'
  | 'server-busy';

export interface AttendanceResponse {
  success: boolean;
  status: AttendanceStatus;
  message: string;
  data: { id: string };
}
