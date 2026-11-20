import nodemailer, { type Transporter } from 'nodemailer';

export type OtpEmailPurpose = 'verify_email' | 'login_otp' | 'reset_password';

function getSmtpConfig() {
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_APP_PASSWORD || '').replace(/\s+/g, '').trim();
  return { user, pass };
}

export function isMailerConfigured(): boolean {
  const { user, pass } = getSmtpConfig();
  return Boolean(user && pass);
}

let cachedTransporter: Transporter | null = null;
let cachedCredKey = '';

export function getMailTransporter(): Transporter | null {
  const { user, pass } = getSmtpConfig();
  if (!user || !pass) return null;

  const credKey = `${user}:${pass.length}`;
  if (!cachedTransporter || cachedCredKey !== credKey) {
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user,
        pass,
      },
    });
    cachedCredKey = credKey;
  }
  return cachedTransporter;
}

export async function sendOtpEmail(params: {
  toEmail: string;
  fullName?: string;
  otp: string;
  purpose: OtpEmailPurpose;
}): Promise<{ sent: boolean; error?: string }> {
  const transporter = getMailTransporter();
  const { user } = getSmtpConfig();

  if (!transporter || !user) {
    return { sent: false, error: 'SMTP email credentials are not configured.' };
  }

  const recipientName = params.fullName?.trim() || 'Valued Customer';
  const subjectMap: Record<OtpEmailPurpose, string> = {
    verify_email: 'MAGNOM PHONES HUB — Verify Your Email Address (OTP)',
    login_otp: 'MAGNOM PHONES HUB — Your Sign-In Verification Code (OTP)',
    reset_password: 'MAGNOM PHONES HUB — Password Reset Code (OTP)',
  };

  const headlineMap: Record<OtpEmailPurpose, string> = {
    verify_email: 'Complete Your Account Registration',
    login_otp: 'Confirm Your Account Sign-In',
    reset_password: 'Reset Your Account Password',
  };

  const introMap: Record<OtpEmailPurpose, string> = {
    verify_email:
      'Welcome to MAGNOM PHONES HUB! Use the 6-digit verification code below to verify your email address and activate your account.',
    login_otp:
      'A sign-in attempt was initiated for your MAGNOM PHONES HUB account. Enter the 6-digit security code below to complete login.',
    reset_password:
      'We received a request to reset your MAGNOM PHONES HUB password. Enter the 6-digit code below to set a new password.',
  };

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: #001B5E; padding: 24px 28px; color: #ffffff;">
        <h1 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">MAGNOM PHONES HUB</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #cbd5e1;">Accra &amp; Nationwide Ghana Electronics Store</p>
      </div>
      <div style="padding: 28px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #001B5E;">${headlineMap[params.purpose]}</h2>
        <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
          Hello ${recipientName},
        </p>
        <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #334155;">
          ${introMap[params.purpose]}
        </p>
        <div style="background: #FFF1F1; border: 1px solid #fecaca; border-radius: 10px; padding: 18px; text-align: center; margin-bottom: 22px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #001B5E; font-weight: 700; margin-bottom: 6px;">
            Your 6-Digit Verification Code
          </div>
          <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #DC0000; font-family: monospace;">
            ${params.otp}
          </div>
        </div>
        <p style="margin: 0 0 8px; font-size: 12px; color: #64748b;">
          This code expires in <strong>15 minutes</strong>. Never share this code with anyone.
        </p>
        <p style="margin: 0; font-size: 12px; color: #64748b;">
          Need help? WhatsApp: 0532779339 · Call: 0207581098
        </p>
      </div>
    </div>
  `;

  const text = `MAGNOM PHONES HUB\n\nHello ${recipientName},\n\n${introMap[params.purpose]}\n\nYour 6-digit OTP code is: ${params.otp}\n\nThis code expires in 15 minutes. Never share it with anyone.\nWhatsApp: 0532779339 | Call: 0207581098`;

  try {
    await transporter.sendMail({
      from: `"MAGNOM PHONES HUB" <${user}>`,
      to: params.toEmail,
      subject: subjectMap[params.purpose],
      text,
      html,
    });
    return { sent: true };
  } catch (err: any) {
    console.error('SMTP sendOtpEmail error:', err);
    return { sent: false, error: err?.message || 'Failed to send OTP email.' };
  }
}
