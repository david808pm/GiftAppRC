import {
  IsString,
  IsEmail,
  IsEnum,
  IsInt,
  IsBoolean,
  MinLength,
  Matches,
  IsOptional,
} from 'class-validator';

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;

export class CreateAdminUserDto {
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres.' })
  name!: string;

  @IsEmail({}, { message: 'Formato de correo inválido.' })
  email!: string;

  @IsString()
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres.' })
  @Matches(STRONG_PASSWORD, {
    message:
      'La contraseña debe incluir mayúscula, minúscula y número (mínimo 12 caracteres).',
  })
  password!: string;

  @IsEnum(['COMPANY_VIEWER'], {
    message: 'El rol debe ser COMPANY_VIEWER.',
  })
  role!: string;

  @IsInt()
  companyId!: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
