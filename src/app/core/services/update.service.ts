import { ApplicationRef, inject, Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, first } from 'rxjs';

/**
 * Listens for new app versions and reloads the page automatically.
 *
 * Flow:
 *   1. Wait for the app to stabilise (no pending micro-tasks).
 *   2. Check for an update on load and whenever the user returns to the tab.
 *   3. When the SW signals VERSION_READY, activate it and reload.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly appRef = inject(ApplicationRef);

  init(): void {
    if (!this.swUpdate.isEnabled) return;

    // Wait until Angular is stable before doing anything SW-related.
    // Checking before stability can delay first render.
    this.appRef.isStable.pipe(first((stable) => stable)).subscribe(() => {
      this.listenForUpdates();
      this.pollForUpdates();
    });
  }

  private listenForUpdates(): void {
    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        // Activate the new version and reload immediately.
        // The app is client-side only, so a silent reload is safe.
        this.swUpdate.activateUpdate().then(() => {
          document.location.reload();
        });
      });
  }

  private pollForUpdates(): void {
    // Check once on load.
    this.checkNow();

    // Check again whenever the user returns to the tab / reopens the PWA.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkNow();
      }
    });
  }

  private checkNow(): void {
    this.swUpdate.checkForUpdate().catch(() => {
      // SW might not be active yet on first load — silently ignore.
    });
  }
}
