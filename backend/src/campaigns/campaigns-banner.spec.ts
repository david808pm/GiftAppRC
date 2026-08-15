import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../common/services/supabase-storage.service';

function createMockPrisma() {
  return {
    campaign: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function createMockStorage() {
  return {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
    getPublicUrl: jest.fn(),
  };
}

function createFile(overrides: any = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('fake-image'),
    mimetype: 'image/png',
    originalname: 'banner.png',
    size: 1000,
    ...overrides,
  } as Express.Multer.File;
}

const DECORATION = {
  layers: [{ type: 'text', text: 'Hola', color: '#ffffff', fontSize: 32 }],
};

describe('CampaignsService — banner persistence', () => {
  let service: CampaignsService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockStorage = createMockStorage();

    service = new CampaignsService(
      mockPrisma as unknown as PrismaService,
      mockStorage as unknown as SupabaseStorageService,
    );

    mockPrisma.company.findUnique.mockResolvedValue({ id: 3, slug: 'emp' });
    // Default: no existing campaign (slug uniqueness check passes).
    mockPrisma.campaign.findUnique.mockResolvedValue(null);
    mockPrisma.campaign.create.mockResolvedValue({ id: 9 });
    mockPrisma.campaign.update.mockResolvedValue({ id: 9 });

    mockStorage.uploadFile.mockResolvedValue('https://storage.example.com/banner.png');
    mockStorage.deleteFile.mockResolvedValue(undefined);
  });

  describe('create', () => {
    it('persists bannerImageUrl and bannerDecoration when provided', async () => {
      await service.create(
        { companyId: 3, name: 'Mi Campaña', bannerImageUrl: ' https://x.com/b.png ', bannerDecoration: DECORATION },
        1,
      );

      const data = mockPrisma.campaign.create.mock.calls[0][0].data;
      expect(data.bannerImageUrl).toBe('https://x.com/b.png');
      expect(data.bannerDecoration).toEqual(DECORATION);
    });

    it('omits banner fields from the create data when not provided', async () => {
      await service.create({ companyId: 3, name: 'Mi Campaña' }, 1);

      const data = mockPrisma.campaign.create.mock.calls[0][0].data;
      expect(data.bannerImageUrl).toBeUndefined();
      expect(data.bannerDecoration).toBeUndefined();
    });
  });

  describe('update', () => {
    const existingCampaign = {
      id: 9,
      name: 'Mi Campaña',
      slug: 'emp-2026',
      startsAt: null,
      endsAt: null,
      deletedAt: null,
    };

    beforeEach(() => {
      mockPrisma.campaign.findUnique.mockResolvedValue(existingCampaign);
    });

    it('persists bannerImageUrl and bannerDecoration when provided', async () => {
      await service.update(
        9,
        { bannerImageUrl: 'https://x.com/b.png', bannerDecoration: DECORATION },
        1,
      );

      const data = mockPrisma.campaign.update.mock.calls[0][0].data;
      expect(data.bannerImageUrl).toBe('https://x.com/b.png');
      expect(data.bannerDecoration).toEqual(DECORATION);
    });

    it('clears bannerDecoration when null is sent', async () => {
      await service.update(9, { bannerDecoration: null }, 1);

      const data = mockPrisma.campaign.update.mock.calls[0][0].data;
      expect(data.bannerDecoration).toBeNull();
    });

    it('does not touch banner fields when omitted from the dto', async () => {
      await service.update(9, { name: 'Renombrada' }, 1);

      const data = mockPrisma.campaign.update.mock.calls[0][0].data;
      expect(data.bannerImageUrl).toBeUndefined();
      expect(data.bannerDecoration).toBeUndefined();
    });

    it('does not retry the update without banner fields on error (no P2022 fallback)', async () => {
      const prismaError = Object.assign(new Error('boom'), { code: 'P2022' });
      mockPrisma.campaign.update.mockRejectedValue(prismaError);

      await expect(
        service.update(9, { bannerImageUrl: 'https://x.com/b.png' }, 1),
      ).rejects.toThrow('boom');

      expect(mockPrisma.campaign.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll / findOne', () => {
    beforeEach(() => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: 9,
        name: 'Mi Campaña',
        slug: 'emp-2026',
        startsAt: null,
        endsAt: null,
        deletedAt: null,
      });
    });

    it('selects bannerImageUrl and bannerDecoration in findAll', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([]);

      await service.findAll({});

      const select = mockPrisma.campaign.findMany.mock.calls[0][0].select;
      expect(select.bannerImageUrl).toBe(true);
      expect(select.bannerDecoration).toBe(true);
    });

    it('selects bannerImageUrl and bannerDecoration in findOne', async () => {
      await service.findOne(9);

      const select = mockPrisma.campaign.findUnique.mock.calls[0][0].select;
      expect(select.bannerImageUrl).toBe(true);
      expect(select.bannerDecoration).toBe(true);
    });
  });

  describe('uploadBanner', () => {
    beforeEach(() => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: 9,
        companyId: 3,
        deletedAt: null,
      });
    });

    it('uploads the file and persists the URL on success', async () => {
      const result = await service.uploadBanner(9, createFile());

      expect(mockStorage.uploadFile).toHaveBeenCalledTimes(1);
      const storagePath = mockStorage.uploadFile.mock.calls[0][1] as string;
      expect(storagePath).toMatch(/^company-3\/campaign-9\/banner-[a-f0-9-]+\.png$/);
      expect(mockStorage.uploadFile.mock.calls[0][3]).toBe('campaign-logos');

      const updateData = mockPrisma.campaign.update.mock.calls[0][0].data;
      expect(updateData.bannerImageUrl).toBe('https://storage.example.com/banner.png');
      expect(result).toEqual({ bannerImageUrl: 'https://storage.example.com/banner.png' });
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('deletes the uploaded object, preserves prior state and rethrows when DB update fails', async () => {
      const dbError = new Error('DB down');
      mockPrisma.campaign.update.mockRejectedValue(dbError);

      await expect(service.uploadBanner(9, createFile())).rejects.toThrow('DB down');

      const storagePath = mockStorage.uploadFile.mock.calls[0][1] as string;
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(storagePath, 'campaign-logos');
      // update called exactly once: no retry without banner fields
      expect(mockPrisma.campaign.update).toHaveBeenCalledTimes(1);
    });

    it('rethrows upload errors without touching the DB', async () => {
      mockStorage.uploadFile.mockRejectedValue(new Error('upload failed'));

      await expect(service.uploadBanner(9, createFile())).rejects.toThrow('upload failed');

      expect(mockPrisma.campaign.update).not.toHaveBeenCalled();
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });
  });
});
