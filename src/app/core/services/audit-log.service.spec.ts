import { TestBed } from '@angular/core/testing';
import { AuditLogService } from './audit-log.service';
import { AppSettingsService } from './app-settings.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let settings: AppSettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    settings = TestBed.inject(AppSettingsService);
    service = TestBed.inject(AuditLogService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('starts with no entries', () => {
    expect(service.entries()).toHaveLength(0);
  });

  it('does not crash when localStorage contains invalid JSON', () => {
    localStorage.setItem('cdm:audit_log', 'not-json{{');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const svc2 = TestBed.inject(AuditLogService);
    expect(svc2.entries()).toHaveLength(0);
  });

  describe('log()', () => {
    it('adds an entry with action, detail, id and timestamp', () => {
      service.log('token.set', 'github');
      const entries = service.entries();
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('token.set');
      expect(entries[0].detail).toBe('github');
      expect(entries[0].id).toBeTruthy();
      expect(entries[0].timestamp).toBeTruthy();
    });

    it('works without a detail argument', () => {
      service.log('session.expired');
      expect(service.entries()[0].detail).toBeUndefined();
    });

    it('prepends — newest entry is first', () => {
      service.log('first');
      service.log('second');
      expect(service.entries()[0].action).toBe('second');
      expect(service.entries()[1].action).toBe('first');
    });

    it('persists entries to localStorage', () => {
      service.log('test.action');
      const stored = JSON.parse(localStorage.getItem('cdm:audit_log') ?? '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].action).toBe('test.action');
    });

    it('truncates to 500 entries (FIFO — oldest dropped)', () => {
      for (let i = 0; i < 505; i++) service.log(`action-${i}`);
      expect(service.entries()).toHaveLength(500);
      expect(service.entries()[0].action).toBe('action-504');
    });
  });

  it('reads persisted entries on construction', () => {
    const entry = { id: 'abc', timestamp: new Date().toISOString(), action: 'restored' };
    localStorage.setItem('cdm:audit_log', JSON.stringify([entry]));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const svc2 = TestBed.inject(AuditLogService);
    expect(svc2.entries()).toHaveLength(1);
    expect(svc2.entries()[0].action).toBe('restored');
  });

  it('clear() empties the signal and removes the localStorage key', () => {
    service.log('to-be-cleared');
    service.clear();
    expect(service.entries()).toHaveLength(0);
    expect(localStorage.getItem('cdm:audit_log')).toBeNull();
  });

  describe('webhook', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('does not fire fetch when webhook URL is empty', () => {
      settings.saveWebhook('', true);
      service.log('some.action');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not fire fetch when webhook is disabled', () => {
      settings.saveWebhook('https://hooks.example.com/cdm', false);
      service.log('some.action');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('fires fetch with correct payload when webhook is enabled', async () => {
      settings.saveWebhook('https://hooks.example.com/cdm', true);
      service.log('chain.started', 'my-chain');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://hooks.example.com/cdm');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.source).toBe('CDM');
      expect(body.action).toBe('chain.started');
      expect(body.detail).toBe('my-chain');
      expect(body.id).toBeTruthy();
      expect(body.timestamp).toBeTruthy();
    });

    it('swallows fetch errors silently — does not throw', async () => {
      settings.saveWebhook('https://hooks.example.com/cdm', true);
      fetchSpy.mockRejectedValue(new Error('network error'));

      expect(() => service.log('some.action')).not.toThrow();
      await new Promise((r) => setTimeout(r, 0));
    });
  });
});
