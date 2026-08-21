import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMailer } from '../domain/mailer.interface';

@Injectable()
export class MailgunMailer implements IMailer {
  private readonly logger = new Logger(MailgunMailer.name);
  private readonly apiKey: string | undefined;
  private readonly domain: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    this.domain = this.configService.get<string>('MAILGUN_DOMAIN');
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
  ): Promise<void> {
    const resetUrl = `mobile://(auth)/forgot-password-confirm?token=${encodeURIComponent(resetToken)}`;

    if (!this.apiKey || !this.domain) {
      this.logger.log(
        `[MailgunMailer (DEV/TEST)] Email to: ${email} | Password Reset URL: ${resetUrl}`,
      );
      return;
    }

    try {
      const authHeader = `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`;
      const body = new URLSearchParams();
      body.append('from', `Irtaki <noreply@${this.domain}>`);
      body.append('to', email);
      body.append('subject', 'إعادة تعيين كلمة المرور — تطبيق إرتقِ');
      body.append(
        'text',
        `السلام عليكم ورحمة الله،\n\nلقد تم طلب إعادة تعيين كلمة المرور لحسابك في تطبيق إرتقِ.\nيرجى فتح الرابط التالي لإتمام العملية:\n\n${resetUrl}\n\nهذا الرابط صالح لمدة 30 دقيقة فقط.\nإذا لم تطلب هذا التغيير، يمكنك تجاهل هذه الرسالة بأمان.`,
      );

      const response = await fetch(
        `https://api.mailgun.net/v3/${this.domain}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `Mailgun API responded with status ${response.status}: ${errorText}`,
        );
      }

      this.logger.log(
        `Successfully dispatched password reset email to ${email}`,
      );
    } catch (err) {
      this.logger.error(
        `Error sending email via Mailgun to ${email}: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }
}
