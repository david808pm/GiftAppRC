import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeLoginDto } from './dto/employee-login.dto';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { requireEnv, optionalEnv, MIN_SECRET_LENGTH } from '../common/config/env';
import { assertCampaignWindowOpen } from '../common/utils/campaign-window';
import { EmailService } from '../common/services/email.service';

// ── Generic messages (anti-enumeration) ──────────────────────
const GENERIC_OTP_REQUEST_MESSAGE =
  'Si los datos son válidos, enviaremos un código al correo registrado.';
const GENERIC_VERIFY_FAILURE_MESSAGE =
  'El código es inválido o ha expirado.';
const GENERIC_VERIFY_LOCKED_MESSAGE =
  'Has excedido el número de intentos permitidos. Intenta nuevamente en unos minutos.';
const RESEND_FAILURE_MESSAGE =
  'No fue posible enviar el código. Intenta nuevamente en unos minutos.';

@Injectable()
export class PublicAuthService {
  private readonly logger = new Logger(PublicAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  // ── Employee Login (old, documentId-only) ───────────────
  // This endpoint is intentionally left unchanged so it keeps working
  // even when OTP is enabled, enabling rollback.

  async employeeLogin(slug: string, dto: EmployeeLoginDto) {
    const documentId = dto.documentId.trim();

    // 1. Campaign must exist, not deleted, and be ACTIVE
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });

    if (!campaign || campaign.deletedAt) {
      throw new NotFoundException('La campaña no existe o no está disponible.');
    }

    if (campaign.status !== 'ACTIVE') {
      throw new ForbiddenException('Esta campaña no está disponible actualmente.');
    }

    // 2. Find employee by documentId + campaignId
    const employee = await this.prisma.employee.findUnique({
      where: {
        campaignId_documentId: {
          campaignId: campaign.id,
          documentId,
        },
      },
    });

    // Generic error — do not leak whether employee exists
    if (!employee || employee.deletedAt) {
      throw new NotFoundException(
        'No fue posible validar la información. Si el problema persiste, contacta a soporte.',
      );
    }

    return this.buildLoginResponse(employee, campaign);
  }

  // ── Shared login response builder ────────────────────────
  // Used by both the old employeeLogin and the new verifyCode so the
  // response shape is guaranteed identical.

  private async buildLoginResponse(
    employee: {
      id: number;
      campaignId: number;
      fullName: string;
      documentId: string;
      status: string;
    },
    campaign: {
      id: number;
      name: string;
      slug: string;
      logoText: string | null;
      primaryColor: string | null;
      startsAt: Date | null;
      endsAt: Date | null;
    },
  ) {
    // 3. Blocked employees cannot proceed
    if (employee.status === 'BLOCKED') {
      throw new ForbiddenException(
        'Tu cuenta ha sido bloqueada. Contacta a soporte.',
      );
    }

    // 4. Already confirmed — return special response with token
    if (employee.status === 'CONFIRMED') {
      const accessToken = this.issueToken(employee, campaign);

      return {
        alreadyConfirmed: true,
        accessToken,
        employee: {
          id: employee.id,
          fullName: employee.fullName,
          documentId: employee.documentId,
          status: employee.status,
        },
        campaign: {
          id: campaign.id,
          name: campaign.name,
          slug: campaign.slug,
          logoText: campaign.logoText || 'REGALOS',
          primaryColor: campaign.primaryColor || '#2563eb',
        },
      };
    }

    // 4.b Enforce the campaign selection window for employees about to choose.
    assertCampaignWindowOpen(campaign);

    // 5. Must have at least one non-deleted beneficiary
    const beneficiaryCount = await this.prisma.beneficiary.count({
      where: { employeeId: employee.id, deletedAt: null },
    });

    if (beneficiaryCount === 0) {
      throw new ForbiddenException(
        'No se encontraron beneficiarios asociados a tu cuenta.',
      );
    }

    // 6. PENDING → IN_PROGRESS
    if (employee.status === 'PENDING') {
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    // 7. Issue public employee JWT
    const accessToken = this.issueToken(employee, campaign);

    return {
      accessToken,
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        documentId: employee.documentId,
        status: employee.status === 'PENDING' ? 'IN_PROGRESS' : employee.status,
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
        slug: campaign.slug,
        logoText: campaign.logoText || 'REGALOS',
        primaryColor: campaign.primaryColor || '#2563eb',
      },
    };
  }

  private issueToken(employee: { id: number; documentId: string }, campaign: { id: number }) {
    const payload = {
      sub: employee.id,
      employeeId: employee.id,
      campaignId: campaign.id,
      documentId: employee.documentId,
      type: 'employee',
    };

    const secret = requireEnv('PUBLIC_JWT_SECRET', MIN_SECRET_LENGTH);
    const expiresIn = optionalEnv('PUBLIC_JWT_EXPIRES_IN', '4h');

    return this.jwtService.sign(payload, {
      secret,
      expiresIn,
    } as any);
  }

  // ── OTP configuration ────────────────────────────────────

  private getOtpConfig() {
    return {
      enabled: process.env.PUBLIC_LOGIN_OTP_ENABLED === 'true',
      expiryMinutes: this.parsePositiveInt(
        optionalEnv('PUBLIC_LOGIN_OTP_EXPIRY_MINUTES', '10'),
        10,
      ),
      maxAttempts: this.parsePositiveInt(
        optionalEnv('PUBLIC_LOGIN_OTP_MAX_ATTEMPTS', '5'),
        5,
      ),
      lockMinutes: this.parsePositiveInt(
        optionalEnv('PUBLIC_LOGIN_OTP_LOCK_MINUTES', '10'),
        10,
      ),
      resendCooldownSeconds: this.parsePositiveInt(
        optionalEnv('PUBLIC_LOGIN_OTP_RESEND_COOLDOWN_SECONDS', '60'),
        60,
      ),
    };
  }

  private parsePositiveInt(value: string, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }

  // ── Request OTP code ─────────────────────────────────────

  async requestCode(slug: string, dto: RequestCodeDto) {
    const config = this.getOtpConfig();

    // If the feature flag is off, the endpoint refuses to operate.
    // The frontend should never call it when otpEnabled === false.
    if (!config.enabled) {
      throw new ForbiddenException('Esta opción no está disponible actualmente.');
    }

    const documentId = dto.documentId.trim();
    const now = new Date();

    // Validate campaign internally. To avoid enumeration we return the
    // generic message for invalid campaigns as well — the request looks
    // successful even if nothing happens.
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });

    if (!campaign || campaign.deletedAt || campaign.status !== 'ACTIVE') {
      return { message: GENERIC_OTP_REQUEST_MESSAGE };
    }

    // Find employee internally. Generic response if not found, deleted,
    // blocked, or has no email — never reveal which case occurred.
    const employee = await this.prisma.employee.findUnique({
      where: {
        campaignId_documentId: {
          campaignId: campaign.id,
          documentId,
        },
      },
    });

    if (
      !employee ||
      employee.deletedAt ||
      employee.status === 'BLOCKED' ||
      !employee.email ||
      !employee.email.trim()
    ) {
      return { message: GENERIC_OTP_REQUEST_MESSAGE };
    }

    // Resend cooldown: prevent spamming the employee's inbox.
    if (employee.emailOtpSentAt) {
      const elapsedSeconds =
        (now.getTime() - employee.emailOtpSentAt.getTime()) / 1000;
      if (elapsedSeconds < config.resendCooldownSeconds) {
        const wait = Math.ceil(config.resendCooldownSeconds - elapsedSeconds);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Ya te enviamos un código. Intenta reenviar en ${wait} segundo(s).`,
            cooldownSeconds: wait,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Generate a 6-digit numeric code and hash it.
    const code = this.generateOtpCode();
    const hash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(
      now.getTime() + config.expiryMinutes * 60 * 1000,
    );

    // Persist the hash BEFORE sending the email. If Resend fails we will
    // roll this back so no active OTP is left dangling.
    await this.prisma.employee.update({
      where: { id: employee.id },
      data: {
        emailOtpHash: hash,
        emailOtpExpiresAt: expiresAt,
        emailOtpSentAt: now,
        emailOtpAttempts: 0,
        emailOtpLockedUntil: null,
      },
    });

    // Send the email via Resend. On failure, roll back the OTP fields and
    // return a controlled generic error. The OTP code is NEVER logged.
    const campaignUrl = `${optionalEnv('FRONTEND_URL', 'http://localhost:5173')}/campaign/${campaign.slug}`;
    try {
      await this.emailService.sendOtpCode({
        to: employee.email.trim(),
        employeeName: employee.fullName,
        campaignName: campaign.name,
        campaignUrl,
        code,
        expiresAt,
      });
    } catch (err) {
      // Rollback: clear the saved hash so there is no active OTP.
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: {
          emailOtpHash: null,
          emailOtpExpiresAt: null,
          emailOtpSentAt: null,
          emailOtpAttempts: 0,
          emailOtpLockedUntil: null,
        },
      });

      this.logger.error(
        `Falló el envío de OTP por correo para empleado ${employee.id}.`,
      );

      throw new ServiceUnavailableException(RESEND_FAILURE_MESSAGE);
    }

    return { message: GENERIC_OTP_REQUEST_MESSAGE };
  }

  // ── Verify OTP code ──────────────────────────────────────

  async verifyCode(slug: string, dto: VerifyCodeDto) {
    const config = this.getOtpConfig();

    if (!config.enabled) {
      throw new ForbiddenException('Esta opción no está disponible actualmente.');
    }

    const documentId = dto.documentId.trim();
    const code = dto.code.trim();
    const now = new Date();

    // Validate campaign. The campaign slug is public information, so
    // specific errors are acceptable here.
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });

    if (!campaign || campaign.deletedAt) {
      throw new NotFoundException('La campaña no existe o no está disponible.');
    }

    if (campaign.status !== 'ACTIVE') {
      throw new ForbiddenException('Esta campaña no está disponible actualmente.');
    }

    // Find employee. If not found, return the generic verify-failure
    // message — do not reveal the employee does not exist.
    const employee = await this.prisma.employee.findUnique({
      where: {
        campaignId_documentId: {
          campaignId: campaign.id,
          documentId,
        },
      },
    });

    if (!employee || employee.deletedAt) {
      throw new BadRequestException(GENERIC_VERIFY_FAILURE_MESSAGE);
    }

    // Check lock window.
    if (employee.emailOtpLockedUntil && now < employee.emailOtpLockedUntil) {
      throw new BadRequestException(GENERIC_VERIFY_LOCKED_MESSAGE);
    }

    // Must have an active hash.
    if (!employee.emailOtpHash) {
      throw new BadRequestException(GENERIC_VERIFY_FAILURE_MESSAGE);
    }

    // Must not be expired.
    if (!employee.emailOtpExpiresAt || now > employee.emailOtpExpiresAt) {
      throw new BadRequestException(GENERIC_VERIFY_FAILURE_MESSAGE);
    }

    // Compare the code against the bcrypt hash.
    const match = await bcrypt.compare(code, employee.emailOtpHash);
    if (!match) {
      const attempts = (employee.emailOtpAttempts || 0) + 1;

      if (attempts >= config.maxAttempts) {
        // Lock for N minutes after too many failed attempts.
        const lockedUntil = new Date(
          now.getTime() + config.lockMinutes * 60 * 1000,
        );
        await this.prisma.employee.update({
          where: { id: employee.id },
          data: {
            emailOtpAttempts: attempts,
            emailOtpLockedUntil: lockedUntil,
          },
        });
      } else {
        await this.prisma.employee.update({
          where: { id: employee.id },
          data: { emailOtpAttempts: attempts },
        });
      }

      throw new BadRequestException(GENERIC_VERIFY_FAILURE_MESSAGE);
    }

    // ── Success: clear the OTP fields, then build the same
    // response the old employee-login endpoint returns.
    await this.prisma.employee.update({
      where: { id: employee.id },
      data: {
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        emailOtpAttempts: 0,
        emailOtpLastUsedAt: now,
        emailOtpLockedUntil: null,
      },
    });

    return this.buildLoginResponse(employee, campaign);
  }

  // ── OTP code generator ───────────────────────────────────
  // Uses crypto.randomInt for a cryptographically secure 6-digit code.

  private generateOtpCode(): string {
    return randomInt(0, 1000000).toString().padStart(6, '0');
  }

  // ── Session /me ──────────────────────────────────────────

  async getSession(user: {
    employeeId: number;
    campaignId: number;
    documentId: string;
  }) {
    const [employee, campaign] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { id: user.employeeId },
      }),
      this.prisma.campaign.findUnique({
        where: { id: user.campaignId },
      }),
    ]);

    if (
      !employee ||
      employee.deletedAt ||
      employee.status === 'BLOCKED'
    ) {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }

    if (!campaign || campaign.deletedAt) {
      throw new UnauthorizedException('La campaña ya no está disponible.');
    }

    return {
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        documentId: employee.documentId,
        status: employee.status,
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
        slug: campaign.slug,
        logoText: campaign.logoText || 'REGALOS',
        primaryColor: campaign.primaryColor || '#2563eb',
        status: campaign.status,
      },
    };
  }
}
