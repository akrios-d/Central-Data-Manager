import { TestBed } from '@angular/core/testing';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  let service: AuditLogService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuditLogService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('starts with no entries', () => {
    expect(service.entries()).toHaveLength(0);
  });

  it('log() adds an entry with action and timestamp', () => {
    service.log('token.set', 'github');
    const entries = service.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('token.set');
    expect(entries[0].detail).toBe('github');
    expect(entries[0].timestamp).toBeTruthy();
    expect(entries[0].id).toBeTruthy();
  });

  it('log() persists entries to localStorage', () => {
    service.log('test.action');
    const stored = JSON.parse(localStorage.getItem('cdm:audit_log') ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].action).toBe('test.action');
  });

  it('log() prepends newest entry first', () => {
    service.log('first');
    service.log('second');
    const entries = service.entries();
    expect(entries[0].action).toBe('second');
    expect(entries[1].action).toBe('first');
  });

  it('log() truncates to 500 entries', () => {
    for (let i = 0; i < 505; i++) {
      service.log(`action-${i}`);
    }
    expect(service.entries()).toHaveLength(500);
    expect(service.entries()[0].action).toBe('action-504');
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

  it('clear() empties the signal and removes from localStorage', () => {
    service.log('to-be-cleared');
    service.clear();
    expect(service.entries()).toHaveLength(0);
    expect(localStorage.getItem('cdm:audit_log')).toBeNull();
  });
});
