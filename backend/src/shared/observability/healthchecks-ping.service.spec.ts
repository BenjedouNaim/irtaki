import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthchecksPingService } from './healthchecks-ping.service';

describe('HealthchecksPingService (ADR-033, TS §31)', () => {
  const variable = 'HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION';
  let env: Record<string, string | undefined>;
  let service: HealthchecksPingService;
  let fetchSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    env = {};
    const configService = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    service = new HealthchecksPingService(configService);
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs the configured ping URL and resolves "pinged" on a 2xx', async () => {
    env[variable] = 'https://hc-ping.com/abc';
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });

    await expect(
      service.pingSuccess('WEEKLY_REPORT_FINALIZATION'),
    ).resolves.toBe('pinged');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hc-ping.com/abc');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('resolves "unconfigured" without a request when the variable is unset, warning once only', async () => {
    await expect(
      service.pingSuccess('WEEKLY_REPORT_FINALIZATION'),
    ).resolves.toBe('unconfigured');
    await expect(
      service.pingSuccess('WEEKLY_REPORT_FINALIZATION'),
    ).resolves.toBe('unconfigured');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${variable} is not set`),
    );
  });

  it('resolves "failed" with a WARN on a non-2xx answer and never throws', async () => {
    env[variable] = 'https://hc-ping.com/abc';
    fetchSpy.mockResolvedValue({ ok: false, status: 503 });

    await expect(
      service.pingSuccess('WEEKLY_REPORT_FINALIZATION'),
    ).resolves.toBe('failed');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('answered HTTP 503'),
    );
  });

  it('resolves "failed" with a WARN when the request itself fails (timeout, DNS)', async () => {
    env[variable] = 'https://hc-ping.com/abc';
    fetchSpy.mockRejectedValue(new Error('The operation was aborted'));

    await expect(
      service.pingSuccess('WEEKLY_REPORT_FINALIZATION'),
    ).resolves.toBe('failed');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('The operation was aborted'),
    );
  });
});
