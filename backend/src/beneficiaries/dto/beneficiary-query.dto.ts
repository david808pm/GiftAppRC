import { IsOptional, IsString, IsInt, IsEnum, IsBooleanString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '@prisma/client';

export class BeneficiaryQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'employeeId debe ser un número entero.' })
  employeeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'campaignId debe ser un número entero.' })
  campaignId?: number;

  @IsOptional()
  @IsEnum(Gender, { message: 'Filtro de género inválido.' })
  gender?: Gender;

  @IsOptional()
  @IsBooleanString()
  includeDeleted?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un número entero.' })
  @Min(1, { message: 'page debe ser mayor o igual a 1.' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize debe ser un número entero.' })
  @Min(1, { message: 'pageSize debe ser mayor o igual a 1.' })
  @Max(100, { message: 'pageSize no debe ser mayor a 100.' })
  pageSize?: number;
}
