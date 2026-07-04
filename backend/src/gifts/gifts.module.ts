import { Module } from '@nestjs/common';
import { GiftsService } from './gifts.service';
import { GiftsAdminController } from './gifts.admin.controller';
import { SupabaseStorageService } from '../common/services/supabase-storage.service';

@Module({
  controllers: [GiftsAdminController],
  providers: [GiftsService, SupabaseStorageService],
  exports: [GiftsService],
})
export class GiftsModule {}
