import {
  HttpEvent,
  HttpInterceptorFn,
  HttpHandlerFn,
  HttpRequest,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

/** HTTP status codes that are safe to retry. */
const RETRYABLE_STATUSES = new Set([429, 503]);

/** Maximum number of retry attempts. */
const MAX_RETRIES = 3;

/** Base delay in ms — doubles on each attempt: 1 s → 2 s → 4 s. */
const BASE_DELAY_MS = 1_000;

/**
 * Resolves the delay (ms) before the next attempt.
 * Respects the Retry-After header when present (value in seconds).
 */
function resolveDelay(error: HttpErrorResponse, attempt: number): number {
  const retryAfterHeader = error.headers?.get('Retry-After');
  if (retryAfterHeader) {
    const secs = Number.parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(secs) && secs > 0) return secs * 1_000;
  }
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

function withRetry(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  attempt: number,
): Observable<HttpEvent<unknown>> {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (!RETRYABLE_STATUSES.has(error.status) || attempt >= MAX_RETRIES) {
        return throwError(() => error);
      }
      const delay = resolveDelay(error, attempt);
      return timer(delay).pipe(switchMap(() => withRetry(req, next, attempt + 1)));
    }),
  );
}

/**
 * Functional HTTP interceptor that retries 429 / 503 responses with
 * exponential backoff (1 s -> 2 s -> 4 s, max 3 retries).
 *
 * Registered in app.config.ts via withInterceptors([retryInterceptor]).
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => withRetry(req, next, 0);
