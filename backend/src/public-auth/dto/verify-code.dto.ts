import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class VerifyCodeDto {
  @IsString({ message: 'La campaña es obligatoria.' })
  @MinLength(1, { message: 'La campaña es obligatoria.' })
  @MaxLength(200, { message: 'Campaña inválida.' })
  campaignSlug: string;

  @IsString({ message: 'El documento es obligatorio.' })
  @MinLength(1, { message: 'El documento es obligatorio.' })
  @MaxLength(50, { message: 'Documento inválido.' })
  documentId: string;

  @IsString({ message: 'El código es obligatorio.' })
  @Matches(/^\d{6}$/, {
    message: 'El código debe ser exactamente 6 dígitos numéricos.',
  })
  code: string;
}
