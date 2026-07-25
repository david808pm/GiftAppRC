import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { requireEnv, MIN_SECRET_LENGTH } from '../../common/config/env';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireEnv('JWT_SECRET', MIN_SECRET_LENGTH),
    });
  }

  async validate(payload: { sub: number; email: string; role: string; companyId?: number }) {
    // Re-validate against the DB so a deactivated account or changed role takes
    // effect immediately, instead of remaining valid until the token expires.
    const user = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: {
        role: { select: { name: true } },
        company: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesión inválida o cuenta desactivada.');
    }

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
      companyId: user.companyId,
      company: user.company,
    };
  }
}
