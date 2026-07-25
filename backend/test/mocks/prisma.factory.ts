export function createMockTx() {
  return {
    campaign: {
      findUnique: jest.fn(),
    },
    employee: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    selection: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    beneficiary: {
      findMany: jest.fn(),
    },
    gift: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    giftImage: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    selectionItem: {
      create: jest.fn(),
    },
    stockMovement: {
      create: jest.fn(),
    },
    emailLog: {
      create: jest.fn(),
    },
  };
}

export function createMockPrismaService(overrides: Record<string, jest.Mock> = {}) {
  const directClient = {
    $transaction: jest.fn(),
  };

  return {
    directClient,
    campaign: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), ...overrides },
    gift: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), ...overrides },
    giftImage: { findMany: jest.fn(), create: jest.fn(), count: jest.fn(), ...overrides },
    employee: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), ...overrides },
    beneficiary: { findMany: jest.fn(), count: jest.fn(), ...overrides },
    selection: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), count: jest.fn(), ...overrides },
    selectionItem: { findMany: jest.fn(), create: jest.fn(), count: jest.fn(), ...overrides },
    stockMovement: { create: jest.fn(), ...overrides },
    emailLog: { create: jest.fn(), ...overrides },
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  };
}
