import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

/**
 * Shape of /assets/config.json. Add new sections here as the app grows -
 * each section should be a plain, easy-to-edit array/object so config.json
 * can be updated without touching any TypeScript code.
 */
export interface AppConfig {
  /** الخادم - servant radio-button options. Add/remove entries here; no Angular code change needed. */
  servantOptions: string[];
}

/**
 * Loads and caches /assets/config.json at runtime. Any feature that needs
 * runtime-configurable data (instead of a hardcoded TypeScript constant)
 * should read it from here rather than introducing a second config-loading
 * mechanism.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);
  private config$: Observable<AppConfig> | null = null;

  /** Fetches config.json once and caches the result for subsequent calls. */
  getConfig(): Observable<AppConfig> {
    if (!this.config$) {
      this.config$ = this.http.get<AppConfig>('assets/config.json').pipe(shareReplay(1));
    }
    return this.config$;
  }
}
