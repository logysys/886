import 'dotenv/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SendOtpResult {
  success: boolean;
  message: string;
  previewOtp?: string;
  info?: any;
}

class EmailService {
  private transporter: Transporter | null = null;
  private isConfigured = false;
  private fromFormatted = '"WiKi Wall" <funnel@ez.wiki>';

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    const host = process.env.MAIL_HOST || process.env.SMTP_HOST || 'webhost.dynadot.com';
    const port = parseInt(process.env.MAIL_PORT || process.env.SMTP_PORT || '587', 10);
    const user = process.env.MAIL_USERNAME || process.env.SMTP_USER || 'funnel@ez.wiki';
    const pass = process.env.MAIL_PASSWORD || process.env.SMTP_PASS || '29536790';
    const fromAddress = process.env.MAIL_FROM_ADDRESS || process.env.SMTP_FROM || 'funnel@ez.wiki';
    const fromName = process.env.MAIL_FROM_NAME || process.env.APP_NAME || 'WiKi Wall';
    const encryption = (process.env.MAIL_ENCRYPTION || 'tls').toLowerCase();

    this.fromFormatted = `"${fromName}" <${fromAddress}>`;

    if (host && user && pass) {
      try {
        const isSecure = port === 465 || encryption === 'ssl';
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: isSecure, // false for port 587 (uses STARTTLS)
          auth: { user, pass },
          tls: {
            rejectUnauthorized: false
          }
        });

        this.isConfigured = true;
        console.log(`[Email] Configured SMTP transporter with ${host}:${port} (${user}) [${encryption}]`);

        // Test SMTP connection verification
        this.transporter.verify((err, success) => {
          if (err) {
            console.warn(`[Email] SMTP server test warning (${host}:${port}):`, err.message);
          } else {
            console.log(`[Email] SMTP server ready to send messages (${host}:${port})`);
          }
        });
      } catch (e: any) {
        console.error('[Email] Failed to initialize SMTP:', e.message);
        this.isConfigured = false;
      }
    } else {
      console.log('[Email] Incomplete SMTP credentials. OTPs will be displayed in server logs and dev preview.');
      this.isConfigured = false;
    }
  }

  // Generate 4-digit numeric OTP
  generateOtp(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Send OTP Email
  async sendOtpEmail(email: string, otp: string): Promise<SendOtpResult> {
    const subject = `Your 4-Digit WiKi Wall Verification Code: ${otp}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 28px; border: 2.5px solid #111; border-radius: 16px; background-color: #FAF8F5; color: #111;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
          <span style="display: inline-block; width: 34px; height: 34px; background: #FFE27A; border: 2px solid #111; border-radius: 50%; text-align: center; line-height: 32px; font-weight: 900; font-size: 16px;">🌍</span>
          <span style="font-size: 20px; font-weight: 900; margin-left: 8px;">WiKi <span style="color: #0E7C7B;">Wall</span></span>
        </div>
        
        <h2 style="font-size: 18px; font-weight: 900; margin: 0 0 12px; color: #111;">Verify Your Email Address</h2>
        <p style="font-size: 14px; line-height: 1.5; color: #333; margin: 0 0 20px;">
          Enter the following 4-digit verification code to log in and generate your customized WiKi Wall:
        </p>

        <div style="background: #FFE27A; border: 2.5px solid #111; border-radius: 12px; padding: 18px; text-align: center; font-size: 36px; font-weight: 900; letter-spacing: 12px; color: #111; box-shadow: 4px 4px 0px #111; margin: 0 0 20px;">
          ${otp}
        </div>

        <p style="font-size: 12px; color: #666; margin: 0 0 16px; line-height: 1.4;">
          ⏱️ This OTP code is valid for <strong>10 minutes</strong>. If you did not request this, please disregard this email.
        </p>

        <div style="border-top: 1.5px dashed #ccc; padding-top: 12px; font-size: 11px; color: #888;">
          WiKi Wall V620.01 • MySQL DB Sync • 886.wiki
        </div>
      </div>
    `;

    console.log(`\n======================================================`);
    console.log(`[EMAIL DISPATCH] 4-Digit OTP for ${email}: >>> ${otp} <<< (From: ${this.fromFormatted})`);
    console.log(`======================================================\n`);

    if (this.isConfigured && this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: this.fromFormatted,
          to: email,
          subject,
          html,
          text: `Your 4-digit WiKi Wall verification code is: ${otp}. Valid for 10 minutes.`
        });
        console.log(`[Email Sent Successfully] MessageId: ${info.messageId} to ${email}`);
        return {
          success: true,
          message: `Verification code sent to ${email}`,
          previewOtp: otp,
          info
        };
      } catch (err: any) {
        console.error('[Email Send Error]:', err.message);
        return {
          success: true,
          message: `Verification code generated for ${email} (SMTP delivery attempted, preview code available)`,
          previewOtp: otp
        };
      }
    }

    return {
      success: true,
      message: `4-digit code sent to ${email}`,
      previewOtp: otp
    };
  }
}

export const emailService = new EmailService();
