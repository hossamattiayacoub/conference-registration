/**
 * Standard envelope returned by every Google Apps Script API action.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
}
