import { GiftsService } from './gifts.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../common/services/supabase-storage.service';
import { SelectionStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    gift: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
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

function giftWithCount(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    campaignId: 1,
    name: 'Bicicleta',
    reference: 'BIC-01',
    stock: 20,
    minAge: 0,
    maxAge: 13,
    allowedGender: 'all',
    status: 'ACTIVE',
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    campaign: { id: 1, name: 'Test', slug: 'test' },
    images: [],
    createdBy: null,
    updatedBy: null,
    _count: { selectionItems: 14 },
    ...overrides,
  };
}

describe('GiftsService — timesSelected (veces escogido)', () => {
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
  });

  // ── findAll ──────────────────────────────────────────────

  it('findAll queries the filtered relation count for confirmed selections', async () => {
    mockPrisma.gift.findMany.mockResolvedValue([giftWithCount()]);

    await service.findAll({});

    const { include } = mockPrisma.gift.findMany.mock.calls[0][0];
    expect(include._count.select.selectionItems.where).toEqual({
      selection: { status: SelectionStatus.CONFIRMED },
    });
  });

  it('findAll maps _count.selectionItems to timesSelected and strips _count', async () => {
    mockPrisma.gift.findMany.mockResolvedValue([giftWithCount()]);

    const result = await service.findAll({});

    expect(result[0]).toMatchObject({
      id: 7,
      name: 'Bicicleta',
      stock: 20,
      timesSelected: 14,
    });
    expect('_count' in result[0]).toBe(false);
  });

  it('findAll defaults timesSelected to 0 when _count is absent', async () => {
    mockPrisma.gift.findMany.mockResolvedValue([
      giftWithCount({ _count: undefined }),
    ]);

    const result = await service.findAll({});

    expect(result[0].timesSelected).toBe(0);
  });

  it('findAll preserves company scoping for COMPANY_VIEWER', async () => {
    mockPrisma.gift.findMany.mockResolvedValue([]);

    await service.findAll({}, { role: 'COMPANY_VIEWER', companyId: 5 });

    const { where } = mockPrisma.gift.findMany.mock.calls[0][0];
    expect(where.campaign.companyId).toBe(5);
  });

  it('findAll preserves filters, soft-delete behavior and ordering', async () => {
    mockPrisma.gift.findMany.mockResolvedValue([]);

    await service.findAll(
      { search: 'bici', status: 'ACTIVE', campaignId: 3 },
      { role: 'ADMIN' },
    );

    const { where, orderBy } = mockPrisma.gift.findMany.mock.calls[0][0];
    expect(where.deletedAt).toBeNull();
    expect(where.campaignId).toBe(3);
    expect(orderBy).toEqual({ createdAt: 'desc' });
  });

  it('recomputes timesSelected on every request (no server-side staleness)', async () => {
    mockPrisma.gift.findMany
      .mockResolvedValueOnce([giftWithCount({ _count: { selectionItems: 14 } })])
      .mockResolvedValueOnce([giftWithCount({ _count: { selectionItems: 16 } })]);

    const first = await service.findAll({});
    const second = await service.findAll({});

    expect(first[0].timesSelected).toBe(14);
    expect(second[0].timesSelected).toBe(16);
    expect(mockPrisma.gift.findMany).toHaveBeenCalledTimes(2);
  });

  // ── findOne ──────────────────────────────────────────────

  it('findOne maps timesSelected and strips _count', async () => {
    mockPrisma.gift.findUnique.mockResolvedValue(giftWithCount());

    const result = await service.findOne(7, { role: 'ADMIN' });

    expect(result.timesSelected).toBe(14);
    expect('_count' in result).toBe(false);
  });

  // ── remove ───────────────────────────────────────────────

  it('remove maps timesSelected and strips _count', async () => {
    mockPrisma.gift.findUnique.mockResolvedValue(giftWithCount());
    mockPrisma.gift.update.mockResolvedValue(
      giftWithCount({ status: 'INACTIVE', deletedAt: new Date() }),
    );

    const result = await service.remove(7);

    expect(result.timesSelected).toBe(14);
    expect('_count' in result).toBe(false);
  });
});