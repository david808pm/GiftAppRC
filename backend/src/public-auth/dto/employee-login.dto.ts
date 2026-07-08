import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class EmployeeLoginDto {
  @IsString({ message: 'El documento es obligatorio.' })
  @MinLength(1, { message: 'El documento es obligatorio.' })
  @MaxLength(50, { message: 'Documento inválido.' })
  documentId!: string;
}
