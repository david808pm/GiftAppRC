import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsISO8601,
  MinLength,
  MaxLength,
  Matches,
  Validate,
} from 'class-validator';
import { CampaignStatus } from '@prisma/client';
import { IsHexColor } from '../../common/validators/is-hex-color.validator';

export class CreateCampaignDto {
  @IsInt({ message: 'La empresa es obligatoria.' })
  companyId: number;

  @IsString({ message: 'El nombre es obligatorio.' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres.' })
  @MaxLength(180, { message: 'El nombre no puede superar 180 caracteres.' })
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El slug debe tener al menos 2 caracteres.' })
  @MaxLength(200, { message: 'El slug no puede superar 200 caracteres.' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'El slug solo puede contener minúsculas, números y guiones.',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  welcomeText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerImageUrl?: string;

  // JSON-friendly configuration for decoration layers (optional).
  // Stored as JSON in the DB; the frontend may send an object or a JSON string.
  @IsOptional()
  bannerDecoration?: any;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  rulesText?: string;

  @IsOptional()
  @IsEnum(CampaignStatus, {
    message: 'Estado inválido. Usa: ACTIVE, CLOSED, DRAFT, PAUSED o ARCHIVED.',
  })
  status?: CampaignStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  logoText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Validate(IsHexColor, {
    message: 'El color primario debe ser hexadecimal (ej. #2563eb).',
  })
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoImageUrl?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de inicio debe ser una fecha válida (ISO 8601).' })
  startsAt?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de fin debe ser una fecha válida (ISO 8601).' })
  endsAt?: string;
}
