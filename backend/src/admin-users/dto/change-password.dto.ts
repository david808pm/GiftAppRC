import { IsString, MinLength, Matches } from 'class-validator';

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;

export class ChangePasswordDto {
  @IsString()
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres.' })
  @Matches(STRONG_PASSWORD, {
    message:
      'La contraseña debe incluir mayúscula, minúscula y número (mínimo 12 caracteres).',
  })
  password!: string;
}
