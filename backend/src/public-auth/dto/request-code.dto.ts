import { IsString, MinLength, MaxLength } from 'class-validator';

export class RequestCodeDto {
  @IsString({ message: 'La campaña es obligatoria.' })
  @MinLength(1, { message: 'La campaña es obligatoria.' })
  @MaxLength(200, { message: 'Campaña inválida.' })
  campaignSlug: string;

  @IsString({ message: 'El documento es obligatorio.' })
  @MinLength(1, { message: 'El documento es obligatorio.' })
  @MaxLength(50, { message: 'Documento inválido.' })
  documentId: string;
}
