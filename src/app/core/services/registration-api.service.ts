import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { AttendanceResponse } from '../models/attendance.model';
import {
  Registration,
  RegistrationSubmitPayload,
  ReserveSerialNoResult,
  Room,
  UploadImageRequest,
  UploadImageResult
} from '../models/registration.model';

/**
 * Wraps all calls to the Google Apps Script Web App.
 * The Apps Script backend exposes a single endpoint and dispatches
 * behaviour based on the "action" property (GET query param or POST body).
 *
 * POST bodies are sent as text/plain on purpose: Apps Script Web Apps do not
 * implement doOptions, so a JSON content-type would trigger a CORS preflight
 * that always fails. Apps Script still reads e.postData.contents and parses
 * it as JSON regardless of the declared content type.
 */
@Injectable({ providedIn: 'root' })
export class RegistrationApiService {
  private readonly apiUrl = environment.appsScriptApiUrl;
  private readonly postOptions = { headers: { 'Content-Type': 'text/plain;charset=utf-8' } };

  constructor(private readonly http: HttpClient) {}

  /** Creates a brand-new registration row. */
  createRegistration(data: RegistrationSubmitPayload): Observable<ApiResponse<Registration>> {
    return this.http.post<ApiResponse<Registration>>(
      this.apiUrl,
      JSON.stringify({ action: 'create', data }),
      this.postOptions
    );
  }

  /** Ensures the sheet exists and its header row is set up. */
  initializeDatabase(): Observable<ApiResponse<null>> {
    const params = new HttpParams().set('action', 'initialize');
    return this.http.get<ApiResponse<null>>(this.apiUrl, { params });
  }

  /** Loads rooms with computed occupancy/availability for the "التسكين: اختار الغرفه" dropdown. */
  getRooms(): Observable<ApiResponse<Room[]>> {
    const params = new HttpParams().set('action', 'getRooms');
    return this.http.get<ApiResponse<Room[]>>(this.apiUrl, { params });
  }

  /**
   * Records attendance for a scanned QR code (/attendance-scanner). `id` is
   * the Registeration sheet's "Id" value - the same Id encoded into the QR
   * code on the registration success page.
   */
  recordAttendance(id: string): Observable<AttendanceResponse> {
    return this.http.post<AttendanceResponse>(
      this.apiUrl,
      JSON.stringify({ action: 'recordAttendance', id }),
      this.postOptions
    );
  }

  /**
   * Reserves the next human-readable SerialNo for a registration attempt.
   * Called lazily, once, the first time the person actually tries to upload
   * an image - never on page load (see registration.component.ts).
   */
  reserveSerialNo(registrationId: string): Observable<ApiResponse<ReserveSerialNoResult>> {
    return this.http.post<ApiResponse<ReserveSerialNoResult>>(
      this.apiUrl,
      JSON.stringify({ action: 'reserveSerialNo', data: { RegistrationId: registrationId } }),
      this.postOptions
    );
  }

  /**
   * Uploads a single image independently of final registration submission.
   * The final createRegistration() call never receives Base64 image data -
   * only the file references this returns.
   *
   * Deliberately a PLAIN post using the same postOptions as every other
   * Apps Script POST (JSON string body, Content-Type: text/plain, no custom
   * headers, NO reportProgress). reportProgress makes Angular register an
   * xhr.upload 'progress' listener, and per the XHR spec that makes a
   * cross-origin request non-simple - forcing a CORS preflight (OPTIONS)
   * that Apps Script Web Apps cannot answer. Real byte-level progress and
   * "no preflight" are mutually exclusive here, so the UI shows an
   * indeterminate indicator instead.
   */
  uploadImage(request: UploadImageRequest): Observable<ApiResponse<UploadImageResult>> {
    return this.http.post<ApiResponse<UploadImageResult>>(
      this.apiUrl,
      JSON.stringify({ action: 'uploadImage', data: request }),
      this.postOptions
    );
  }
}
