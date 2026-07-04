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
  Req,
  UploadedFile,
  UseInterceptors,
  ParseFilePipeBuilder,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GiftsService } from './gifts.service';
import { CreateGiftDto } from './dto/create-gift.dto';
import { UpdateGiftDto } from './dto/update-gift.dto';
import { GiftQueryDto } from './dto/gift-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Request } from 'express';

const GIFTS_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

@Controller('admin/gifts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GiftsAdminController {
  constructor(private readonly giftsService: GiftsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_VIEWER')
  findAll(@Query() query: GiftQueryDto, @Req() req: Request) {
    const user = req.user as any;
    return this.giftsService.findAll(query, user);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_VIEWER')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as any;
    return this.giftsService.findOne(id, user);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreateGiftDto, @Req() req: Request) {
    const adminUserId = (req.user as any).userId;
    return this.giftsService.create(dto, adminUserId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGiftDto,
    @Req() req: Request,
  ) {
    const adminUserId = (req.user as any).userId;
    return this.giftsService.update(id, dto, adminUserId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('SUPER_ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.giftsService.remove(id);
  }

  @Post(':id/images')
  @Roles('SUPER_ADMIN')
  @UseInterceptors(FileInterceptor('image'))
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(image\/jpeg|image\/png|image\/webp)$/,
        })
        .addMaxSizeValidator({
          maxSize: GIFTS_IMAGE_MAX_BYTES,
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
    @Req() req: Request,
  ) {
    return this.giftsService.uploadImage(
      id,
      file.buffer,
      file.mimetype,
      file.originalname,
      (req.user as any).userId,
    );
  }
}
