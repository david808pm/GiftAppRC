import { PublicSelectionService } from './public-selection.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmSelectionDto } from './dto/confirm-selection.dto';
import { BadRequestException } from '@nestjs/common';

function createMockPrisma() {
  const directClient = {
    $transaction: jest.fn(),
  };

  const service = {
    directClient,
    $transaction: jest.fn(),
    gift: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  return service;
}

describe('PublicSelectionService — same-gift multiple beneficiaries stock', () => {
  let service: PublicSelectionService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  const campaign = {
    id: 1,
    name: 'Test Campaign',
    slug: 'test-campaign',
    startsAt: null,
    endsAt: null,
    status: 'ACTIVE',
    deletedAt: null,
  };

  const employee = {
    id: 100,
    campaignId: 1,
    fullName: 'Test Employee',
    documentId: '12345',
    email: 'test@test.com',
    status: 'IN_PROGRESS',
    deletedAt: null,
  };

  const beneficiaries = [
    { id: 10, employeeId: 100, fullName: 'Beneficiary A', age: 10, gender: 'male', deletedAt: null },
    { id: 20, employeeId: 100, fullName: 'Beneficiary B', age: 12, gender: 'female', deletedAt: null },
  ];

  function makeGift(stock: number) {
    return {
      id: 200,
      campaignId: 1,
      name: 'PS5',
      reference: 'R100',
      stock,
      minAge: 5,
      maxAge: 18,
      allowedGender: 'all',
      status: 'ACTIVE',
      deletedAt: null,
      images: [{ id: 1, imageUrl: 'https://img.com/ps5.png', isPrimary: true }],
    };
  }

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new PublicSelectionService(mockPrisma as unknown as PrismaService);

    mockPrisma.directClient.$transaction.mockImplementation(
      async (cb: (tx: any) => Promise<any>, _opts: any) => {
        const tx = createMockTx();
        return cb(tx);
      },
    );
  });

  function setupTxForItems(items: { beneficiaryId: number; giftId: number }[], giftStock: number) {
    mockPrisma.directClient.$transaction.mockImplementation(
      async (cb: (tx: any) => Promise<any>, _opts: any) => {
        const tx = createMockTxWithStock(items, giftStock);
        return cb(tx);
      },
    );
  }

  function createMockTx() {
    return {
      campaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
      employee: { findUnique: jest.fn().mockResolvedValue(employee), update: jest.fn().mockResolvedValue({}) },
      selection: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1, campaignId: 1, employeeId: 100, status: 'CONFIRMED', confirmedAt: new Date() }),
      },
      beneficiary: { findMany: jest.fn().mockResolvedValue(beneficiaries) },
      gift: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      selectionItem: { create: jest.fn().mockResolvedValue({}) },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
      emailLog: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  function createMockTxWithStock(items: { beneficiaryId: number; giftId: number }[], initialStock: number) {
    const gift = makeGift(initialStock);
    let currentStock = initialStock;

    // Each item selects the same gift
    const allGiftIds = [...new Set(items.map((i) => i.giftId))];
    const giftFindManyMock = jest.fn().mockResolvedValue(allGiftIds.map((id) => ({ ...gift, stock: initialStock })));

    const updateManyMock = jest.fn().mockImplementation(() => {
      currentStock--;
      return Promise.resolve({ count: 1 });
    });

    const findUniqueMock = jest.fn().mockImplementation(() => {
      return Promise.resolve({ stock: currentStock });
    });

    return {
      campaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
      employee: { findUnique: jest.fn().mockResolvedValue(employee), update: jest.fn().mockResolvedValue({}) },
      selection: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1, campaignId: 1, employeeId: 100, status: 'CONFIRMED', confirmedAt: new Date() }),
      },
      beneficiary: { findMany: jest.fn().mockResolvedValue(beneficiaries) },
      gift: {
        findMany: giftFindManyMock,
        updateMany: updateManyMock,
        findUnique: findUniqueMock,
      },
      selectionItem: { create: jest.fn().mockResolvedValue({}) },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
      emailLog: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  // ── Two items, both same gift, stock=2 → both succeed ──

  it('should allow same gift for multiple beneficiaries when stock is sufficient', async () => {
    setupTxForItems(
      [
        { beneficiaryId: 10, giftId: 200 },
        { beneficiaryId: 20, giftId: 200 },
      ],
      2,
    );

    const dto: ConfirmSelectionDto = {
      items: [
        { beneficiaryId: 10, giftId: 200 },
        { beneficiaryId: 20, giftId: 200 },
      ],
    };

    const result = await service.confirmSelection(dto, {
      employeeId: 100,
      campaignId: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.selection.status).toBe('CONFIRMED');
    expect(result.selection.items).toHaveLength(2);
  });

  // ── Two items, both same gift, stock=1 → second fails ──

  it('should reject second same-gift confirmation when stock runs out', async () => {
    let stock = 1;
    const gift = makeGift(1);

    mockPrisma.directClient.$transaction.mockImplementation(
      async (cb: (tx: any) => Promise<any>, _opts: any) => {
        const tx = {
          campaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
          employee: { findUnique: jest.fn().mockResolvedValue(employee), update: jest.fn().mockResolvedValue({}) },
          selection: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 1, campaignId: 1, employeeId: 100, status: 'CONFIRMED', confirmedAt: new Date() }),
          },
          beneficiary: { findMany: jest.fn().mockResolvedValue(beneficiaries) },
          gift: {
            findMany: jest.fn().mockResolvedValue([{ ...gift, stock: 1 }]),
            updateMany: jest.fn().mockImplementation(() => {
              if (stock <= 0) return Promise.resolve({ count: 0 });
              stock--;
              return Promise.resolve({ count: 1 });
            }),
            findUnique: jest.fn().mockImplementation(() => Promise.resolve({ stock })),
          },
          selectionItem: {
            create: jest.fn().mockImplementation(() => {
              if (stock < 0) throw new Error('Should not create item when stock is gone');
              return Promise.resolve({});
            }),
          },
          stockMovement: { create: jest.fn().mockResolvedValue({}) },
          emailLog: { create: jest.fn().mockResolvedValue({}) },
        };

        return cb(tx);
      },
    );

    const dto: ConfirmSelectionDto = {
      items: [
        { beneficiaryId: 10, giftId: 200 },
        { beneficiaryId: 20, giftId: 200 },
      ],
    };

    await expect(
      service.confirmSelection(dto, { employeeId: 100, campaignId: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── Both items with sufficient stock: StockMovements have correct values ──

  it('should record correct previousStock/newStock in StockMovements', async () => {
    const stockMovements: any[] = [];
    const gift = makeGift(2);
    let stock = 2;

    mockPrisma.directClient.$transaction.mockImplementation(
      async (cb: (tx: any) => Promise<any>, _opts: any) => {
        const tx = {
          campaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
          employee: { findUnique: jest.fn().mockResolvedValue(employee), update: jest.fn().mockResolvedValue({}) },
          selection: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 1, campaignId: 1, employeeId: 100, status: 'CONFIRMED', confirmedAt: new Date() }),
          },
          beneficiary: { findMany: jest.fn().mockResolvedValue(beneficiaries) },
          gift: {
            findMany: jest.fn().mockResolvedValue([{ ...gift, stock: 2 }]),
            updateMany: jest.fn().mockImplementation(() => {
              stock--;
              return Promise.resolve({ count: 1 });
            }),
            findUnique: jest.fn().mockImplementation(() => Promise.resolve({ stock })),
          },
          selectionItem: { create: jest.fn().mockResolvedValue({}) },
          stockMovement: {
            create: jest.fn().mockImplementation(({ data }) => {
              stockMovements.push({ previousStock: data.previousStock, newStock: data.newStock });
              return Promise.resolve({});
            }),
          },
          emailLog: { create: jest.fn().mockResolvedValue({}) },
        };

        return cb(tx);
      },
    );

    const dto: ConfirmSelectionDto = {
      items: [
        { beneficiaryId: 10, giftId: 200 },
        { beneficiaryId: 20, giftId: 200 },
      ],
    };

    await service.confirmSelection(dto, { employeeId: 100, campaignId: 1 });

    expect(stockMovements).toHaveLength(2);
    expect(stockMovements[0].previousStock).toBe(2);
    expect(stockMovements[0].newStock).toBe(1);
    expect(stockMovements[1].previousStock).toBe(1);
    expect(stockMovements[1].newStock).toBe(0);
  });
});
