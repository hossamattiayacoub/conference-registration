import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { Registration, RegistrationSubmitPayload } from '../models/registration.model';

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

  /** Updates an existing registration row (Id must be present in data). */
  updateRegistration(data: RegistrationSubmitPayload): Observable<ApiResponse<Registration>> {
    return this.http.post<ApiResponse<Registration>>(
      this.apiUrl,
      JSON.stringify({ action: 'update', data }),
      this.postOptions
    );
  }

  /** Looks up a registration using the mobile number. */
  getRegistrationByMobile(mobile: string): Observable<ApiResponse<Registration>> {
    const params = new HttpParams().set('action', 'getByMobile').set('mobile', mobile);
    return this.http.get<ApiResponse<Registration>>(this.apiUrl, { params });
  }

  /** Looks up a registration using its Id. */
  getRegistrationById(id: string): Observable<ApiResponse<Registration>> {
    const params = new HttpParams().set('action', 'getById').set('id', id);
    return this.http.get<ApiResponse<Registration>>(this.apiUrl, { params });
  }

  /** Ensures the sheet exists and its header row is set up. */
  initializeDatabase(): Observable<ApiResponse<null>> {
    const params = new HttpParams().set('action', 'initialize');
    return this.http.get<ApiResponse<null>>(this.apiUrl, { params });
  }
}
