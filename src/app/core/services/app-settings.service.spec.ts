import { AppSettingsService } from './app-settings.service';

describe('AppSettingsService', () => {
  let service: AppSettingsService;

  beforeEach(() => {
    localStorage.clear();
    service = new AppSettingsService();
  });

  it('uses defaults when localStorage is empty', () => {
    expect(service.pollIntervalSec()).toBe(6);
    expect(service.maxPolls()).toBe(120);
    expect(service.sessionTimeoutHours()).toBe(8);
    expect(service.notificationsEnabled()).toBe(true);
    expect(service.webhookUrl()).toBe('');
    expect(service.webhookEnabled()).toBe(false);
  });

  it('reads persisted values on construction', () => {
    localStorage.setItem('cdm:poll_interval_s', '15');
    localStorage.setItem('cdm:max_polls', '200');
    const svc = new AppSettingsService();
    expect(svc.pollIntervalSec()).toBe(15);
    expect(svc.maxPolls()).toBe(200);
  });

  it('save() clamps interval to [2, 60] and maxPolls to [10, 500]', () => {
    service.save(1, 5);
    expect(service.pollIntervalSec()).toBe(2);
    expect(service.maxPolls()).toBe(10);

    service.save(100, 600);
    expect(service.pollIntervalSec()).toBe(60);
    expect(service.maxPolls()).toBe(500);
  });

  it('save() persists to localStorage', () => {
    service.save(10, 50);
    expect(localStorage.getItem('cdm:poll_interval_s')).toBe('10');
    expect(localStorage.getItem('cdm:max_polls')).toBe('50');
  });

  it('saveTimeoutHours() clamps to [1, 24]', () => {
    service.saveTimeoutHours(0);
    expect(service.sessionTimeoutHours()).toBe(1);

    service.saveTimeoutHours(100);
    expect(service.sessionTimeoutHours()).toBe(24);

    service.saveTimeoutHours(6);
    expect(service.sessionTimeoutHours()).toBe(6);
  });

  it('saveNotifications() updates signal and persists', () => {
    service.saveNotifications(false);
    expect(service.notificationsEnabled()).toBe(false);
    expect(localStorage.getItem('cdm:notifications')).toBe('false');

    service.saveNotifications(true);
    expect(service.notificationsEnabled()).toBe(true);
  });

  it('saveWebhook() updates signals and persists', () => {
    service.saveWebhook('https://hooks.example.com/cdm', true);
    expect(service.webhookUrl()).toBe('https://hooks.example.com/cdm');
    expect(service.webhookEnabled()).toBe(true);
    expect(localStorage.getItem('cdm:webhook_url')).toBe('https://hooks.example.com/cdm');
    expect(localStorage.getItem('cdm:webhook_enabled')).toBe('true');
  });

  it('notifications default to true even if key is absent', () => {
    localStorage.removeItem('cdm:notifications');
    const svc = new AppSettingsService();
    expect(svc.notificationsEnabled()).toBe(true);
  });

  it('notifications default to false when key is "false"', () => {
    localStorage.setItem('cdm:notifications', 'false');
    const svc = new AppSettingsService();
    expect(svc.notificationsEnabled()).toBe(false);
  });
});
