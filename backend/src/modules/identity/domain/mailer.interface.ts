export const MAILER = Symbol('MAILER');

export interface IMailer {
  sendPasswordResetEmail(email: string, resetToken: string): Promise<void>;
}
