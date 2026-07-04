import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private _directClient: PrismaClient | null = null;

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (this._directClient) {
      await this._directClient.$disconnect();
    }
  }

  get directClient(): PrismaClient {
    if (!this._directClient) {
      const directUrl = process.env.DIRECT_URL;
      if (!directUrl) {
        throw new Error('DIRECT_URL environment variable is not set');
      }
      this._directClient = new PrismaClient({
        datasources: { db: { url: directUrl } },
      });
    }
    return this._directClient;
  }
}
