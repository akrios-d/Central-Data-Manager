import { AppConfigService } from './app-config.service';

function makeService(): AppConfigService {
  return new AppConfigService();
}

describe('AppConfigService', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  // =========================================================
  // Defaults (before load())
  // =========================================================

  describe('defaults before load()', () => {
    it('allowPersistentStorage defaults to true', () => {
      const svc = makeService();
      expect(svc.allowPersistentStorage()).toBe(true);
    });

    it('tokenMaxAgeDays defaults to 90', () => {
      const svc = makeService();
      expect(svc.tokenMaxAgeDays()).toBe(90);
    });
  });

  // =========================================================
  // load() — success cases
  // =========================================================

  describe('load() success', () => {
    it('applies allowPersistentStorage: false from config', async () => {
      fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ allowPersistentStorage: false })));
      const svc = makeService();
      await svc.load();
      expect(svc.allowPersistentStorage()).toBe(false);
    });

    it('applies a custom tokenMaxAgeDays from config', async () => {
      fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ tokenMaxAgeDays: 30 })));
      const svc = makeService();
      await svc.load();
      expect(svc.tokenMaxAgeDays()).toBe(30);
    });

    it('partial config preserves un-specified defaults', async () => {
      fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ tokenMaxAgeDays: 60 })));
      const svc = makeService();
      await svc.load();
      expect(svc.tokenMaxAgeDays()).toBe(60);
      expect(svc.allowPersistentStorage()).toBe(true); // default preserved
    });

    it('applies both flags together', async () => {
      fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ allowPersistentStorage: false, tokenMaxAgeDays: 45 })),
        );
      const svc = makeService();
      await svc.load();
      expect(svc.allowPersistentStorage()).toBe(false);
      expect(svc.tokenMaxAgeDays()).toBe(45);
    });
  });

  // =========================================================
  // load() — fallback cases
  // =========================================================

  describe('load() fallback', () => {
    it('keeps defaults on network error and never rejects', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
      const svc = makeService();
      await expect(svc.load()).resolves.toBeUndefined();
      expect(svc.allowPersistentStorage()).toBe(true);
      expect(svc.tokenMaxAgeDays()).toBe(90);
    });

    it('keeps defaults on 404 response and never rejects', async () => {
      fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('Not Found', { status: 404 }));
      const svc = makeService();
      await expect(svc.load()).resolves.toBeUndefined();
      expect(svc.allowPersistentStorage()).toBe(true);
      expect(svc.tokenMaxAgeDays()).toBe(90);
    });

    it('keeps defaults when response body is invalid JSON and never rejects', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('this is not json'));
      const svc = makeService();
      await expect(svc.load()).resolves.toBeUndefined();
      expect(svc.allowPersistentStorage()).toBe(true);
      expect(svc.tokenMaxAgeDays()).toBe(90);
    });

    it('always resolves (never rejects) regardless of error type', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      const svc = makeService();
      await expect(svc.load()).resolves.not.toThrow();
    });
  });
});
