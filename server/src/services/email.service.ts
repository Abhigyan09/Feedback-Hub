import { ENV } from '../config/env.js';

export interface SendPasswordResetEmailInput {
  toEmail: string;
  recipientName?: string;
  resetToken: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string;
  resetLink: string;
  deliveryMode: 'smtp' | 'console_dev';
}

// Memory buffer for test assertions and dev inspection
let lastSentEmail: {
  toEmail: string;
  resetToken: string;
  resetLink: string;
  sentAt: Date;
} | null = null;

export function getLastSentResetEmail() {
  return lastSentEmail;
}

export function clearLastSentResetEmail() {
  lastSentEmail = null;
}

/**
 * Dispatches a password reset email to the user.
 * If SMTP credentials are configured in environment variables, attempts transport.
 * Otherwise, safely logs to the development console without failing.
 */
export async function sendPasswordResetEmail(
  input: SendPasswordResetEmailInput
): Promise<SendEmailResult> {
  const { toEmail, recipientName, resetToken } = input;
  const baseUrl = ENV.FRONTEND_APP_URL.replace(/\/+$/, '');
  const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  lastSentEmail = {
    toEmail,
    resetToken,
    resetLink,
    sentAt: new Date()
  };

  const isSmtpConfigured = Boolean(
    ENV.SMTP_HOST && ENV.SMTP_USER && ENV.SMTP_PASS
  );

  if (isSmtpConfigured) {
    try {
      // Dynamic import in case nodemailer is installed
      // @ts-ignore
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: ENV.SMTP_HOST,
        port: ENV.SMTP_PORT || 587,
        secure: (ENV.SMTP_PORT || 587) === 465,
        auth: {
          user: ENV.SMTP_USER,
          pass: ENV.SMTP_PASS
        }
      });

      const info = await transporter.sendMail({
        from: ENV.EMAIL_FROM || 'Feedback-Hub <noreply@feedbackhub.io>',
        to: toEmail,
        subject: 'Reset Your Feedback-Hub Password',
        text: `Hello ${recipientName || 'there'},\n\nA password reset was requested for your Feedback-Hub account.\n\nClick the link below to set a new password:\n${resetLink}\n\nThis link will expire in 15 minutes. If you did not request this, please ignore this email.\n\nFeedback-Hub Security Team`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e4e4e7; border-radius: 8px;">
            <h2 style="color: #09090b; margin-top: 0;">Feedback-Hub Password Reset</h2>
            <p style="color: #52525b; font-size: 14px; line-height: 1.5;">Hello ${recipientName || 'there'},</p>
            <p style="color: #52525b; font-size: 14px; line-height: 1.5;">A password reset was requested for your account. Click the button below to choose a new password:</p>
            <div style="margin: 24px 0;">
              <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #71717a; font-size: 12px; line-height: 1.4;">This link will expire in 15 minutes. If you did not request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
            <p style="color: #a1a1aa; font-size: 11px;">Feedback-Hub Enterprise Incident Bridge • Bank-Grade Security</p>
          </div>
        `
      });

      console.log(`[Email Service] Delivered password reset email to ${toEmail} via SMTP (MessageId: ${info.messageId})`);
      return {
        success: true,
        messageId: info.messageId,
        resetLink,
        deliveryMode: 'smtp'
      };
    } catch (smtpErr: any) {
      console.warn(`[Email Service] SMTP dispatch failed: ${smtpErr?.message || smtpErr}. Falling back to console dispatch.`);
    }
  }

  // Development/Test fallback: Clean console logging
  console.log('------------------------------------------------------------');
  console.log(`[Email Service: DEV] Password reset dispatched for: ${toEmail}`);
  console.log(`[Email Service: DEV] Reset URL: ${resetLink}`);
  console.log('------------------------------------------------------------');

  return {
    success: true,
    resetLink,
    deliveryMode: 'console_dev'
  };
}
