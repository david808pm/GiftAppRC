import { GiftsService } from './gifts.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../common/services/supabase-storage.service';
import { BadRequestException } from '@nestjs/common';

function createMockPrisma() {
  return {
    gift: {
      findUnique: jest.fn(),
    },
    giftImage: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function createMockStorage() {
  return {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
    buildStoragePath: jest.fn(),
    getPublicUrl: jest.fn(),
  };
}

describe('GiftsService — uploadImages compensating cleanup', () => {
  let service: GiftsService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockStorage = createMockStorage();

    service = new GiftsService(
      mockPrisma as unknown as PrismaService,
      mockStorage as unknown as SupabaseStorageService,
    );

    mockStorage.buildStoragePath.mockReturnValue('campaign-1/gift-1/test.png');
    mockStorage.uploadFile.mockResolvedValue('https://example.com/test.png');
    mockStorage.deleteFile.mockResolvedValue(undefined);

    mockPrisma.gift.findUnique.mockResolvedValue({
      id: 1,
      campaignId: 1,
      name: 'Test Gift',
      stock: 10,
      status: 'ACTIVE',
      deletedAt: null,
      campaign: { id: 1, name: 'Test', slug: 'test' },
      images: [],
      createdBy: null,
      updatedBy: null,
    });
    mockPrisma.giftImage.count.mockResolvedValue(0);
    mockPrisma.giftImage.findMany.mockResolvedValue([]);
    mockPrisma.giftImage.create.mockResolvedValue({});

    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  function createFile(overrides: any = {}): Express.Multer.File {
    return {
      buffer: Buffer.from('fake-image'),
      mimetype: 'image/png',
      originalname: 'test.png',
      size: 1000,
      ...overrides,
    } as Express.Multer.File;
  }

  // ── Successful upload ──────────────────────────────────

  it('should upload all 3 images and create GiftImage rows on success', async () => {
    const files = [createFile(), createFile({ originalname: 'b.png' }), createFile({ originalname: 'c.png' })];

    mockPrisma.gift.findUnique
      .mockResolvedValueOnce({
        id: 1,
        campaignId: 1,
        name: 'Test Gift',
        stock: 10,
        status: 'ACTIVE',
        deletedAt: null,
        campaign: { id: 1, name: 'Test', slug: 'test' },
        images: [],
        createdBy: null,
        updatedBy: null,
      })
      .mockResolvedValueOnce({
        id: 1,
        campaignId: 1,
        name: 'Test Gift',
        stock: 10,
        status: 'ACTIVE',
        deletedAt: null,
        campaign: { id: 1, name: 'Test', slug: 'test' },
        images: [
          { id: 1, imageUrl: 'a', altText: 'a', sortOrder: 0, isPrimary: true },
          { id: 2, imageUrl: 'b', altText: 'b', sortOrder: 1, isPrimary: false },
          { id: 3, imageUrl: 'c', altText: 'c', sortOrder: 2, isPrimary: false },
        ],
        createdBy: null,
        updatedBy: null,
      });

    const result = await service.uploadImages(1, files, 1);

    expect(mockStorage.uploadFile).toHaveBeenCalledTimes(3);
    expect(mockPrisma.giftImage.create).toHaveBeenCalledTimes(3);
    expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  // ── One upload fails → cleanup ─────────────────────────

  it('should delete successfully uploaded files when one upload fails', async () => {
    const files = [
      createFile({ originalname: 'ok1.png' }),
      createFile({ originalname: 'fail.png' }),
      createFile({ originalname: 'ok2.png' }),
    ];

    const failError = new Error('Upload failed');

    mockStorage.uploadFile
      .mockResolvedValueOnce('https://example.com/ok1.png')
      .mockRejectedValueOnce(failError)
      .mockResolvedValueOnce('https://example.com/ok2.png');

    await expect(service.uploadImages(1, files, 1)).rejects.toThrow(failError);

    expect(mockStorage.deleteFile).toHaveBeenCalledTimes(2);
    expect(mockPrisma.giftImage.create).not.toHaveBeenCalled();
  });

  // ── Transaction fails → cleanup ────────────────────────

  it('should delete uploaded files when the DB transaction fails', async () => {
    const files = [createFile(), createFile()];
    const dbError = new Error('DB constraint error');

    mockPrisma.$transaction.mockRejectedValue(dbError);

    await expect(service.uploadImages(1, files, 1)).rejects.toThrow(dbError);

    expect(mockStorage.uploadFile).toHaveBeenCalledTimes(2);
    expect(mockStorage.deleteFile).toHaveBeenCalledTimes(2);
  });

  // ── Cleanup failure preserves original error ───────────

  it('should preserve original error even if cleanup delete fails', async () => {
    const files = [createFile(), createFile()];
    const dbError = new Error('DB constraint error');

    mockPrisma.$transaction.mockRejectedValue(dbError);
    mockStorage.deleteFile.mockRejectedValue(new Error('Delete also failed'));

    await expect(service.uploadImages(1, files, 1)).rejects.toThrow(dbError);
    expect(mockStorage.deleteFile).toHaveBeenCalled();
  });

  // ── 3-image limit enforcement ──────────────────────────

  it('should reject when files exceed remaining slots', async () => {
    mockPrisma.giftImage.count.mockResolvedValue(2); // only 1 slot remaining

    const files = [createFile(), createFile()];

    await expect(service.uploadImages(1, files, 1)).rejects.toThrow(BadRequestException);
    expect(mockStorage.uploadFile).not.toHaveBeenCalled();
  });

  // ── Empty files array ──────────────────────────────────

  it('should return gift without uploads when files is empty', async () => {
    const result = await service.uploadImages(1, [], 1);

    expect(mockStorage.uploadFile).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
