import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { requireEnv, optionalEnv } from '../config/env';

/**
 * EmailService — thin wrapper around Resend for transactional emails.
 *
 * Security notes:
 * - Uses RESEND_API_KEY from the backend environment ONLY. This key must
 *   never be exposed to the frontend (no VITE_ prefix, ever).
 * - OTP codes are passed in by the caller and sent to the recipient, but
 *   are NEVER logged. Logs only contain non-sensitive metadata.
 *
 * The Resend client is created lazily so the application can boot even
 * when RESEND_API_KEY is absent (e.g. when PUBLIC_LOGIN_OTP_ENABLED=false).
 * The key is only required when an email is actually sent.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private _resend: Resend | null = null;
  private readonly from: string;

  constructor() {
    this.from = optionalEnv('EMAIL_FROM', 'no-reply@giftapp.local');
  }

  private get resend(): Resend {
    if (!this._resend) {
      // Lazily require the API key only when actually sending.
      this._resend = new Resend(requireEnv('RESEND_API_KEY'));
    }
    return this._resend;
  }

  /**
   * Send a 6-digit OTP code to an employee for public login.
   *
   * @param to          recipient email
   * @param employeeName employee full name (for greeting)
   * @param campaignName campaign name
   * @param campaignUrl  public campaign URL the employee can return to
   * @param code         6-digit numeric OTP code
   * @param expiresAt    expiration Date of the code
   * @returns Resend message id (string) when successful
   * @throws when Resend fails — caller MUST handle rollback of the OTP hash
   */
  async sendOtpCode(opts: {
    to: string;
    employeeName: string;
    campaignName: string;
    campaignUrl: string;
    code: string;
    expiresAt: Date;
  }): Promise<string> {
    const { to, employeeName, campaignName, campaignUrl, code, expiresAt } =
      opts;

    const subject = 'Tu código de acceso para seleccionar tu regalo';
    const html = this.buildOtpHtml({
      employeeName,
      campaignName,
      campaignUrl,
      code,
      expiresAt,
    });

    // IMPORTANT: do not include `code` in any log line.
    this.logger.debug(
      `Enviando OTP por correo (destino oculto, campaña=${campaignName}).`,
    );

    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });

    if (error) {
      // Do not log the error payload if it could contain the code; Resend
      // errors do not echo the body, but we keep the message generic.
      this.logger.error(
        `Resend rechazó el envío de OTP (código=${error.name || 'unknown'}).`,
      );
      throw new Error(
        'No fue posible enviar el código por correo.',
      );
    }

    return data?.id ?? '';
  }

  // ── HTML template ───────────────────────────────────────

  private buildOtpHtml(input: {
    employeeName: string;
    campaignName: string;
    campaignUrl: string;
    code: string;
    expiresAt: Date;
  }): string {
    const expiresLabel = input.expiresAt.toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });

    // Escape a few characters to avoid HTML injection from names/campaign.
    const esc = (s: string) =>
      (s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tu código de acceso</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="padding:32px 40px 8px 40px;">
                <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#111827;">Tu código de acceso</h1>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.5;color:#4b5563;">
                  Hola <strong>${esc(input.employeeName)}</strong>,
                </p>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.5;color:#4b5563;">
                  Usa el siguiente código para continuar con la selección de regalos en la campaña
                  <strong>${esc(input.campaignName)}</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 40px 24px 40px;">
                <div style="display:inline-block;padding:18px 28px;background-color:#f3f4f6;border:1px dashed #d1d5db;border-radius:10px;letter-spacing:10px;font-size:32px;font-weight:700;color:#111827;">${esc(input.code)}</div>
                <p style="margin:18px 0 0 0;font-size:13px;line-height:1.5;color:#6b7280;">
                  Este código expira el <strong>${esc(expiresLabel)}</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 24px 40px;">
                <p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;color:#4b5563;">
                  Puedes volver a la campaña en el siguiente enlace:
                </p>
                <p style="margin:0 0 0 0;font-size:14px;line-height:1.5;">
                  <a href="${esc(input.campaignUrl)}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${esc(input.campaignUrl)}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:20px;">
                  Si no solicitaste este código, puedes ignorar este correo.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;">
            © ${new Date().getFullYear()} ${esc(input.campaignName)}.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }
}

