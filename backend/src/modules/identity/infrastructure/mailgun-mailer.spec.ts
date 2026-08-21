/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import { MailgunMailer } from './mailgun-mailer';

describe('MailgunMailer', () => {
  let mailer: MailgunMailer;
  let mockConfigService: jest.Mocked<ConfigService>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('logs and resolves safely in dev/test environment when API keys are not provided', async () => {
    mockConfigService.get.mockReturnValue(undefined);
    mailer = new MailgunMailer(mockConfigService);

    await expect(
      mailer.sendPasswordResetEmail('test@example.com', 'sample-token'),
    ).resolves.toBeUndefined();
  });

  it('sends email via fetch to Mailgun API when keys are configured', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'MAILGUN_API_KEY') return 'test-api-key';
      if (key === 'MAILGUN_DOMAIN') return 'mg.irtaki.tn';
      return undefined;
    });

    mailer = new MailgunMailer(mockConfigService);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    await mailer.sendPasswordResetEmail(
      'user@example.com',
      'secret-reset-token',
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mailgun.net/v3/mg.irtaki.tn/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }),
    );
  });

  it('throws error when Mailgun API returns non-ok response', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'MAILGUN_API_KEY') return 'test-api-key';
      if (key === 'MAILGUN_DOMAIN') return 'mg.irtaki.tn';
      return undefined;
    });

    mailer = new MailgunMailer(mockConfigService);

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('Forbidden'),
    });

    await expect(
      mailer.sendPasswordResetEmail('user@example.com', 'secret-reset-token'),
    ).rejects.toThrow('Mailgun API responded with status 401');
  });
});
