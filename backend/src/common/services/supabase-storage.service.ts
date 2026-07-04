import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '../config/env';

@Injectable()
export class SupabaseStorageService {
  private readonly supabase: SupabaseClient;
  private readonly bucket: string;
  private readonly logger = new Logger(SupabaseStorageService.name);

  constructor() {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY', 20);
    this.bucket = requireEnv('SUPABASE_STORAGE_BUCKET');
    this.supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async uploadFile(
    buffer: Buffer,
    storagePath: string,
    mimetype: string,
    bucket?: string,
  ): Promise<string> {
    const bucketName = bucket ?? this.bucket;
    const { error } = await this.supabase.storage
      .from(bucketName)
      .upload(storagePath, buffer, {
        contentType: mimetype,
        upsert: true,
      });

    if (error) {
      this.logger.error(`Supabase upload failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Error al subir la imagen a Supabase Storage: ${error.message}`,
      );
    }

    return this.getPublicUrl(storagePath, bucketName);
  }

  getPublicUrl(storagePath: string, bucket?: string): string {
    const bucketName = bucket ?? this.bucket;
    const { data } = this.supabase.storage
      .from(bucketName)
      .getPublicUrl(storagePath);

    return data.publicUrl;
  }

  async deleteFile(storagePath: string, bucket?: string): Promise<void> {
    const bucketName = bucket ?? this.bucket;
    const { error } = await this.supabase.storage
      .from(bucketName)
      .remove([storagePath]);

    if (error) {
      this.logger.warn(`Supabase delete warning: ${error.message}`);
    }
  }

  static validateMimeType(mimetype: string): void {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${mimetype}. Use: ${allowed.join(', ')}`,
      );
    }
  }

  static validateFileSize(size: number, maxBytes = 2 * 1024 * 1024): void {
    if (size > maxBytes) {
      throw new BadRequestException(
        `El archivo excede el tamaño máximo permitido de ${maxBytes / 1024 / 1024}MB.`,
      );
    }
  }

  static sanitizeExtension(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    return map[mimetype] || '.jpg';
  }

  buildStoragePath(campaignId: number, giftId: number, ext: string): string {
    const uuid = crypto.randomUUID();
    return `campaign-${campaignId}/gift-${giftId}/${uuid}${ext}`;
  }
}
