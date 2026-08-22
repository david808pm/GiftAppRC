import { Module } from '@nestjs/common';
import { GiftImportAdminController } from './gift-import.admin.controller';
import { GiftImportService } from './gift-import.service';
import { GiftsModule } from '../gifts/gifts.module';

@Module({
  imports: [GiftsModule],
  controllers: [GiftImportAdminController],
  providers: [GiftImportService],
})
export class GiftImportsModule {}
