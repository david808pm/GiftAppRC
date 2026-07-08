import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PublicAuthService } from './public-auth.service';
import { PublicAuthController } from './public-auth.controller';
import { PublicEmployeeJwtStrategy } from './strategies/public-employee-jwt.strategy';
import { EmailService } from '../common/services/email.service';
import { requireEnv, optionalEnv, MIN_SECRET_LENGTH } from '../common/config/env';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'public-employee-jwt' }),
    JwtModule.register({
      secret: requireEnv('PUBLIC_JWT_SECRET', MIN_SECRET_LENGTH),
      signOptions: { expiresIn: optionalEnv('PUBLIC_JWT_EXPIRES_IN', '4h') as any },
    }),
  ],
  controllers: [PublicAuthController],
  providers: [PublicAuthService, PublicEmployeeJwtStrategy, EmailService],
  exports: [PublicAuthService],
})
export class PublicAuthModule {}
