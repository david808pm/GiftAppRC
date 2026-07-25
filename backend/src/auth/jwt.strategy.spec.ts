import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { adminUser: { findUnique: jest.Mock } };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-minimum-32-chars-long!!';
    prisma = {
      adminUser: { findUnique: jest.fn() },
    };
    strategy = new JwtStrategy(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  const payload = {
    sub: 42,
    email: 'admin@test.com',
    role: 'SUPER_ADMIN',
    companyId: 1,
  };

  it('should return full user profile with name and company', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({
      id: 42,
      name: 'Test Admin',
      email: 'admin@test.com',
      isActive: true,
      role: { name: 'SUPER_ADMIN' },
      companyId: 1,
      company: { id: 1, name: 'TestCo', slug: 'testco' },
    });

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      userId: 42,
      name: 'Test Admin',
      email: 'admin@test.com',
      role: 'SUPER_ADMIN',
      companyId: 1,
      company: { id: 1, name: 'TestCo', slug: 'testco' },
    });
  });

  it('should include company: null when user has no company', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({
      id: 10,
      name: 'NoCo',
      email: 'noco@test.com',
      isActive: true,
      role: { name: 'ADMIN' },
      companyId: null,
      company: null,
    });

    const result = await strategy.validate({ ...payload, sub: 10, companyId: undefined });

    expect(result.company).toBeNull();
    expect(result.companyId).toBeNull();
    expect(result.name).toBe('NoCo');
  });

  it('should include the company relation in the Prisma query', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({
      id: 42,
      name: 'X',
      email: 'x@t.com',
      isActive: true,
      role: { name: 'ADMIN' },
      companyId: null,
      company: null,
    });

    await strategy.validate(payload);

    const callArgs = prisma.adminUser.findUnique.mock.calls[0][0];
    expect(callArgs.include).toHaveProperty('role');
    expect(callArgs.include.role).toEqual({ select: { name: true } });
    expect(callArgs.include).toHaveProperty('company');
    expect(callArgs.include.company).toEqual({
      select: { id: true, name: true, slug: true },
    });
  });

  it('should throw UnauthorizedException when user not found', async () => {
    prisma.adminUser.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when user is inactive', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({
      id: 42,
      name: 'Inactive',
      email: 'i@t.com',
      isActive: false,
      role: { name: 'SUPER_ADMIN' },
      companyId: null,
      company: null,
    });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });
});
