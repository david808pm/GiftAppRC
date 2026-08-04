import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Request } from 'express';

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_LOGO_SIZE = 2 * 1024 * 1024;

const ALLOWED_BANNER_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_BANNER_SIZE = 5 * 1024 * 1024; // allow larger banners

/**
 * Verifies the file's real binary signature (magic bytes) matches an allowed
 * image type. The client-supplied mimetype can be spoofed, so this is the
 * authoritative check.
 */
function hasValidImageSignature(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) return false;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return true;
  }
  return false;
}

@Controller('admin/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampaignsAdminController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMPANY_VIEWER')
  findAll(@Query() query: QueryCampaignsDto, @Req() req: Request) {
    const user = req.user as any;
    return this.campaignsService.findAll(query, user);
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMPANY_VIEWER')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as any;
    return this.campaignsService.findOne(id, user);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreateCampaignDto, @Req() req: Request) {
    const adminUserId = (req.user as any).userId;
    return this.campaignsService.create(dto, adminUserId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCampaignDto,
    @Req() req: Request,
  ) {
    const adminUserId = (req.user as any).userId;
    return this.campaignsService.update(id, dto, adminUserId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('SUPER_ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.campaignsService.remove(id);
  }

  @Post(':id/logo')
  @Roles('SUPER_ADMIN')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_LOGO_SIZE } }),
  )
  async uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('El archivo de logo es obligatorio.');
    }
    if (!ALLOWED_LOGO_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Formato de imagen no permitido. Usa PNG, JPEG, JPG o WebP.',
      );
    }
    if (file.size > MAX_LOGO_SIZE) {
      throw new BadRequestException('El logo no puede superar los 2MB.');
    }
    if (!hasValidImageSignature(file.buffer)) {
      throw new BadRequestException(
        'El archivo no es una imagen válida (PNG, JPEG o WebP).',
      );
    }
    return this.campaignsService.uploadLogo(id, file);
  }

  @Post(':id/banner')
  @Roles('SUPER_ADMIN')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_BANNER_SIZE } }),
  )
  async uploadBanner(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('El archivo de banner es obligatorio.');
    }
    if (!ALLOWED_BANNER_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Formato de imagen no permitido. Usa PNG, JPEG, JPG o WebP.',
      );
    }
    if (file.size > MAX_BANNER_SIZE) {
      throw new BadRequestException('El banner no puede superar los 5MB.');
    }
    if (!hasValidImageSignature(file.buffer)) {
      throw new BadRequestException(
        'El archivo no es una imagen válida (PNG, JPEG o WebP).',
      );
    }
    return this.campaignsService.uploadBanner(id, file);
  }
}
