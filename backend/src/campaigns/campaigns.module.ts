import { Module } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CampaignsAdminController } from './campaigns.admin.controller';
import { CampaignsPublicController } from './campaigns.public.controller';
import { SupabaseStorageService } from '../common/services/supabase-storage.service';

@Module({
  controllers: [CampaignsAdminController, CampaignsPublicController],
  providers: [CampaignsService, SupabaseStorageService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
