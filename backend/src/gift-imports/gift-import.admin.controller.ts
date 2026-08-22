import {
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TrackPerformance } from '../common/decorators/track-performance.decorator';
import { PerformanceTimingInterceptor } from '../common/interceptors/performance-timing.interceptor';
import { Request, Response } from 'express';
import {
  GiftImportService,
  GiftImportValidationResult,
  GiftImportCommitResult,
} from './gift-import.service';
import { LIMITS } from './gift-import-validation';

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Multer can not enforce per-field `fileSize`, so we set a single global hard
 * ceiling (largest allowed file = ZIP) and validate per-field sizes + cardinality
 * inside the service. `fileFilter` hard-rejects any extra/unknown file field so
 * no un-declared field can smuggle data in.
 */
export const GIFT_IMPORT_FILE_FILTER: (
  req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => void = (req, file, cb) => {
  if (file.fieldname !== 'excel' && file.fieldname !== 'zip') {
    cb(
      new BadRequestException(
        `Campo de archivo no permitido: ${file.fieldname}`,
      ),
      false,
    );
    return;
  }
  cb(null, true);
};

const ImportFiles = FileFieldsInterceptor(
  [
    { name: 'excel', maxCount: 1 },
    { name: 'zip', maxCount: 1 },
  ],
  {
    limits: { fileSize: LIMITS.ZIP_MAX_BYTES },
    fileFilter: GIFT_IMPORT_FILE_FILTER,
  },
);

export function extractFiles(files: {
  excel?: Express.Multer.File[];
  zip?: Express.Multer.File[];
}): { excel: Express.Multer.File; zip: Express.Multer.File } {
  const excel = files?.['excel'];
  const zip = files?.['zip'];
  if (!excel || excel.length !== 1) {
    throw new BadRequestException(
      'Debe enviar exactamente un archivo en el campo "excel".',
    );
  }
  if (!zip || zip.length !== 1) {
    throw new BadRequestException(
      'Debe enviar exactamente un archivo en el campo "zip".',
    );
  }
  return { excel: excel[0], zip: zip[0] };
}

@Controller('admin/gift-import')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GiftImportAdminController {
  constructor(private readonly giftImportService: GiftImportService) {}

  /** Phase 1: validate the full Excel+ZIP package. Zero writes, zero uploads. */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @Roles('SUPER_ADMIN')
  @UseInterceptors(PerformanceTimingInterceptor)
  @UseInterceptors(ImportFiles)
  @TrackPerformance('admin.gift-import.validate')
  validate(
    @UploadedFiles()
    files: { excel?: Express.Multer.File[]; zip?: Express.Multer.File[] },
    @Req() req: Request,
  ): Promise<GiftImportValidationResult> {
    const { excel, zip } = extractFiles(files);
    const adminUserId = (req.user as any)?.userId;
    return this.giftImportService.validatePackage(excel, zip, adminUserId);
  }

  /**
   * Phase 2: commit. Re-validates the whole package (atomic rule) and only
   * imports with zero blocking errors, with compensated all-or-nothing cleanup.
   */
  @Post('commit')
  @HttpCode(HttpStatus.OK)
  @Roles('SUPER_ADMIN')
  @UseInterceptors(PerformanceTimingInterceptor)
  @UseInterceptors(ImportFiles)
  @TrackPerformance('admin.gift-import.commit')
  commit(
    @UploadedFiles()
    files: { excel?: Express.Multer.File[]; zip?: Express.Multer.File[] },
    @Req() req: Request,
  ): Promise<GiftImportCommitResult | GiftImportValidationResult> {
    const { excel, zip } = extractFiles(files);
    const adminUserId = (req.user as any)?.userId;
    return this.giftImportService.commitImport(excel, zip, adminUserId);
  }

  /** Download the Spanish Excel template with instructions. */
  @Get('template')
  @Roles('SUPER_ADMIN')
  async template(@Res() res: Response): Promise<void> {
    const buffer = await this.giftImportService.buildTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="plantilla_regalos_${todayString()}.xlsx"`,
    });
    res.send(buffer);
  }
}
