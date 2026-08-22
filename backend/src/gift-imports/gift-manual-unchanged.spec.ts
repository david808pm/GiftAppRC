import 'reflect-metadata';
import { GiftsService } from '../gifts/gifts.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../common/services/supabase-storage.service';

/**
 * Regression guard: the new bulk gift import must NOT change the manual gift
 * creation flow. This mirrors the long-standing behavior of GiftsService.create
 * (reference uppercase, image sync, soft-deleted restore path untouched).
 */

function buildPrisma() {
  const campaign = {
    id: 1,
    name: 'Tigo',
    slug: 'tigo-2026',
    status: 'DRAFT',
    deletedAt: null,
  };
  const createdGift = {
    id: 5,
    campaignId: 1,
    name: 'Regalo Manual',
    reference: 'GFT-100',
    status: 'ACTIVE',
    stock: 5,
    minAge: 0,
    maxAge: 13,
    allowedGender: 'all',
    deletedAt: null,
    campaign: { id: 1, name: 'Tigo', slug: 'tigo-2026' },
    images: [{ id: 1, imageUrl: 'https://x/p.png', sortOrder: 0, isPrimary: true }],
    createdBy: null,
    updatedBy: null,
  };
  const giftImage = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), createMany: jest.fn().mockResolvedValue({ count: 1 }) };
  const gift = { update: jest.fn(), findUnique: jest.fn(), create: jest.fn().mockResolvedValue(createdGift) };
  const tx = { gift, giftImage };
  const prisma = {
    campaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
    gift,
    giftImage,
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  return prisma;
}

const storage = {
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  buildStoragePath: jest.fn(),
  getPublicUrl: jest.fn(),
};

describe('GiftsService.create — manual gift creation unchanged', () => {
  it('still creates a gift exactly as before (uppercase reference + image sync)', async () => {
    const prisma = buildPrisma() as any;
    const createdGift = {
      id: 5,
      campaignId: 1,
      name: 'Regalo Manual',
      reference: 'GFT-100',
      status: 'ACTIVE',
      stock: 5,
      minAge: 0,
      maxAge: 13,
      allowedGender: 'all',
      deletedAt: null,
      campaign: { id: 1, name: 'Tigo', slug: 'tigo-2026' },
      images: [{ id: 1, imageUrl: 'https://x/p.png', sortOrder: 0, isPrimary: true }],
      createdBy: null,
      updatedBy: null,
    };
    // 1st findUnique: uniqueness check → null; 2nd findUnique: findOne after create.
    prisma.gift.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(createdGift);

    const service = new GiftsService(
      prisma as unknown as PrismaService,
      storage as unknown as SupabaseStorageService,
    );

    const created = await service.create(
      {
        campaignId: 1,
        name: '  Regalo Manual ',
        reference: '  gft-100 ',
        stock: 5,
        imageUrls: ['https://x/p.png'],
      } as any,
      9,
    );

    expect(created.reference).toBe('GFT-100');
    expect(prisma.giftImage.createMany).toHaveBeenCalled();
    expect(prisma.giftImage.deleteMany).toHaveBeenCalled();
  });

  it('still restores a soft-deleted gift instead of failing (unchanged)', async () => {
    const prisma = buildPrisma() as any;
    const restored = {
      id: 5,
      campaignId: 1,
      name: 'X',
      reference: 'GFT-100',
      stock: 0,
      minAge: 0,
      maxAge: 13,
      allowedGender: 'all',
      status: 'ACTIVE',
      deletedAt: null,
      campaign: { id: 1, name: 'Tigo', slug: 'tigo-2026' },
      images: [],
      createdBy: null,
      updatedBy: null,
    };
    prisma.gift.findUnique
      .mockResolvedValueOnce({ id: 5, campaignId: 1, reference: 'GFT-100', stock: 0, deletedAt: new Date() })
      .mockResolvedValue(restored);
    const service = new GiftsService(
      prisma as unknown as PrismaService,
      storage as unknown as SupabaseStorageService,
    );
    await expect(
      service.create({ campaignId: 1, name: 'X', reference: 'gft-100' } as any, 9),
    ).resolves.toMatchObject({ id: 5, deletedAt: null });
    expect(prisma.gift.update).toHaveBeenCalled();
  });
});
